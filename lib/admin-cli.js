// Command-line tool for managing admin accounts (admins.json).
//
// Usage:
//   node lib/admin-cli.js add <username> [password]     create an admin (root)
//   node lib/admin-cli.js reset <username> [password]   set a new password
//   node lib/admin-cli.js rm <username>                 remove an admin
//   node lib/admin-cli.js list                          list admins
//   node lib/admin-cli.js purge-tokens                  invalidate all admin sessions
//
// If the password is omitted the CLI prompts for it (it is echoed to the
// terminal; for secrecy pass it as an argument with your shell muted).
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { hashPassword } = require("./passwords");

const FILE = path.join(__dirname, "..", "admins.json");

const load = () => {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE).toString());
    return {
      accounts: parsed.accounts && typeof parsed.accounts === "object" ? parsed.accounts : {},
      tokens: parsed.tokens && typeof parsed.tokens === "object" ? parsed.tokens : {},
    };
  } catch (e) {
    if (e.code !== "ENOENT") console.error("Warning: could not read admins.json:", e.message);
    return { accounts: {}, tokens: {} };
  }
};

const save = (data) => {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
};

const prompt = (question) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    }),
  );
};

const usage = () => {
  console.log(
    [
      "Admin account manager",
      "",
      "  add <username> [password]      create an admin account (role: root)",
      "  reset <username> [password]    set a new password for an admin",
      "  rm <username>                  remove an admin account",
      "  list                           list admin accounts",
      "  purge-tokens                   invalidate all admin login tokens",
      "",
      "Omit the password to be prompted for it (echoed to the terminal).",
    ].join("\n"),
  );
};

async function main() {
  const [cmd, username, passwordArg] = process.argv.slice(2);

  if (!cmd || cmd === "help" || cmd === "--help") return usage();

  if (cmd === "list") {
    const data = load();
    const rows = Object.values(data.accounts);
    if (rows.length === 0) {
      console.log("No admin accounts yet. Create one with: node lib/admin-cli.js add <username>");
    } else {
      for (const a of rows) {
        console.log(
          "- " + a.username + " (" + (a.role || "admin") + ")" +
            (data.tokens ? ", sessions: " + Object.values(data.tokens).filter((k) => k === a.username.toLowerCase()).length : ""),
        );
      }
    }
    return;
  }

  if (cmd === "purge-tokens") {
    const data = load();
    data.tokens = {};
    save(data);
    console.log("All admin login tokens invalidated.");
    return;
  }

  if (!username) return usage();

  const key = username.toLowerCase();

  if (cmd === "add") {
    const data = load();
    if (data.accounts[key]) {
      console.error("An admin named '" + username + "' already exists.");
      process.exit(1);
    }
    const password =
      passwordArg || (await prompt("Password for " + username + " (echoed): "));
    if (password.length < 4) {
      console.error("Password must be at least 4 characters.");
      process.exit(1);
    }
    const { salt, hash } = await hashPassword(password);
    data.accounts[key] = { username, salt, hash, role: "root" };
    save(data);
    console.log("Added admin '" + username + "' (role: root).");
    return;
  }

  if (cmd === "reset") {
    const data = load();
    const acc = data.accounts[key];
    if (!acc) {
      console.error("No admin named '" + username + "'.");
      process.exit(1);
    }
    const password =
      passwordArg || (await prompt("New password for " + username + " (echoed): "));
    if (password.length < 4) {
      console.error("Password must be at least 4 characters.");
      process.exit(1);
    }
    const { salt, hash } = await hashPassword(password);
    acc.salt = salt;
    acc.hash = hash;
    for (const t of Object.keys(data.tokens || {})) {
      if (data.tokens[t] === key) delete data.tokens[t];
    }
    save(data);
    console.log("Password reset for '" + username + "'. Existing sessions were revoked.");
    return;
  }

  if (cmd === "rm") {
    const data = load();
    if (!data.accounts[key]) {
      console.error("No admin named '" + username + "'.");
      process.exit(1);
    }
    delete data.accounts[key];
    for (const t of Object.keys(data.tokens || {})) {
      if (data.tokens[t] === key) delete data.tokens[t];
    }
    save(data);
    console.log("Removed admin '" + username + "'.");
    return;
  }

  return usage();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});