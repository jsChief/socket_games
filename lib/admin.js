// Admin panel backend.
//
// Separate from the game's player accounts: admins live in admins.json next to
// server.js and authenticate via an Express JSON API mounted at /admin/api
// (see server.js). Admins can watch live rooms/players, kick players, close
// rooms, manage player accounts (reset password / delete / issue one-time
// password-reset codes), broadcast announcements, view a leaderboard and read
// recent server logs.
//
// Deps (injected by server.js):
//   io, players, rooms, accounts, saveAccounts, stats, saveStats,
//   hashPassword, verifyPassword, makeToken, getOnlinePlayers, ops
const fs = require("fs");
const path = require("path");
const express = require("express");
const crypto = require("crypto");

const ADMINS_FILE = path.join(__dirname, "..", "admins.json");
const RESET_TTL_MS = 15 * 60 * 1000; // one-time password-reset codes last 15 min
const LOG_LIMIT = 500; // in-memory console log ring buffer
const FAIL_LIMIT = 5; // failed admin logins per IP per 5 min before throttle
const FAIL_WINDOW_MS = 5 * 60 * 1000;
const AUDIT_LIMIT = 100;

module.exports = function createAdmin(deps) {
  const {
    io,
    players,
    rooms,
    accounts,
    saveAccounts,
    stats,
    saveStats,
    hashPassword,
    verifyPassword,
    makeToken,
    getOnlinePlayers,
    avatars,
    ops,
  } = deps;

  const admins = { accounts: {}, tokens: {} };
  let logBuffer = [];
  let audit = [];
  const resetCodes = new Map(); // code -> { usernameLower, expiresAt }
  const announcements = []; // { text, at } recent broadcasts
  const failByIP = new Map(); // ip -> [ { at } ]

  // Avatar URL for a player name, but only for registered accounts (legacy
  // /name guests and AI bots stay avatar-less so we don't litter the folder).
  const avatarFor = (name) => {
    if (!name) return null;
    const key = name.toLowerCase();
    return accounts.accounts[key] ? avatars.ensureAvatar(name) : null;
  };

  // ----- admins.json persistence --------------------------------------------
  const loadAdmins = () => {
    try {
      const parsed = JSON.parse(fs.readFileSync(ADMINS_FILE).toString());
      admins.accounts =
        parsed && typeof parsed.accounts === "object" && parsed.accounts !== null
          ? parsed.accounts
          : {};
      admins.tokens =
        parsed && typeof parsed.tokens === "object" && parsed.tokens !== null
          ? parsed.tokens
          : {};
      console.log("Admin accounts loaded from file.");
    } catch (e) {
      if (e.code === "ENOENT") {
        console.log("admins.json not found, starting with no admin accounts.");
      } else {
        console.error("Error loading admins from file:", e);
      }
      admins.accounts = {};
      admins.tokens = {};
    }
  };

  const saveAdmins = () => {
    try {
      fs.writeFileSync(ADMINS_FILE, JSON.stringify(admins, null, 2));
      console.log("Admin accounts saved to file.");
    } catch (e) {
      console.error("Error saving admins to file:", e);
    }
  };

  // ----- console log capture (ring buffer for the Logs tab) ------------------
  const captureConsole = () => {
    const orig = { log: console.log, warn: console.warn, error: console.error };
    const push = (level, args) => {
      const text = args.map((a) => (typeof a === "string" ? a : String(a))).join(" ");
      logBuffer.push({ id: crypto.randomUUID(), t: Date.now(), level, text });
      if (logBuffer.length > LOG_LIMIT) logBuffer.splice(0, logBuffer.length - LOG_LIMIT);
    };
    console.log = (...args) => {
      push("info", args);
      orig.log.apply(console, args);
    };
    console.warn = (...args) => {
      push("warn", args);
      orig.warn.apply(console, args);
    };
    console.error = (...args) => {
      push("error", args);
      orig.error.apply(console, args);
    };
  };

  const recordAudit = (action, detail, who) => {
    audit.push({ id: crypto.randomUUID(), t: Date.now(), action, detail, who });
    if (audit.length > AUDIT_LIMIT) audit.splice(0, audit.length - AUDIT_LIMIT);
  };

  captureConsole();
  loadAdmins();

  // First-run bootstrap: allow seeding the very first admin via env vars.
  if (Object.keys(admins.accounts).length === 0) {
    if (process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {
      (async () => {
        const { salt, hash } = await hashPassword(process.env.ADMIN_PASSWORD);
        admins.accounts[process.env.ADMIN_USERNAME.toLowerCase()] = {
          username: process.env.ADMIN_USERNAME.trim(),
          salt,
          hash,
          role: "root",
        };
        saveAdmins();
        console.log(
          "[admin] Bootstrapped root admin '" + process.env.ADMIN_USERNAME + "' from env.",
        );
      })();
    } else {
      console.log(
        "[admin] No admin accounts yet — create one with:\n    node lib/admin-cli.js add <username>",
      );
    }
  }

  // ----- auth helpers --------------------------------------------------------
  const getToken = (req) => {
    const header = req.headers.authorization || "";
    const m = /^Bearer\s+(.+)$/i.exec(header);
    return m ? m[1].trim() : null;
  };

  const requireAdmin = (req, res, next) => {
    const token = getToken(req);
    const key = token && admins.tokens[token];
    const acc = key && admins.accounts[key];
    if (!acc) return res.status(401).json({ error: "Not authorized." });
    req.admin = { username: acc.username, role: acc.role || "admin", key };
    next();
  };

  const requireRoot = (req, res, next) => {
    if (req.admin.role !== "root") {
      return res.status(403).json({ error: "Root-level access required." });
    }
    next();
  };

  const loginBlocked = (ip) => {
    const now = Date.now();
    const list = (failByIP.get(ip) || []).filter((x) => now - x.at < FAIL_WINDOW_MS);
    failByIP.set(ip, list);
    return list.length >= FAIL_LIMIT;
  };

  const noteLoginFail = (ip) => {
    const now = Date.now();
    const list = (failByIP.get(ip) || []).filter((x) => now - x.at < FAIL_WINDOW_MS);
    list.push({ at: now });
    failByIP.set(ip, list);
  };

  // ----- shared data helpers -------------------------------------------------
  const activeGameInRoom = (room) => {
    if (room.gameOn) return "tictactoe";
    if (room.pizza && room.pizza.active) return "pizza";
    if (room.reversi && room.reversi.active) return "reversi";
    if (room.rps && room.rps.active) return "rps";
    if (room.connect4 && room.connect4.active) return "connect4";
    return null;
  };

  const userTokenCount = (usernameLower) =>
    Object.keys(accounts.tokens).filter((t) => accounts.tokens[t] === usernameLower).length;

  const adminTokenCount = (usernameLower) =>
    Object.keys(admins.tokens).filter((t) => admins.tokens[t] === usernameLower).length;

  // ----- routes ---------------------------------------------------------------
  const router = express.Router();

  // Public: admin login (all other routes require a Bearer token).
  router.post("/login", async (req, res) => {
    const ip = req.ip || "unknown";
    if (loginBlocked(ip)) {
      console.warn("[admin] login throttled for " + ip);
      return res
        .status(429)
        .json({ error: "Too many login attempts. Try again in a few minutes." });
    }
    const username = ((req.body && req.body.username) || "").trim();
    const password = (req.body && req.body.password) || "";
    const key = username.toLowerCase();
    const acc = admins.accounts[key];
    if (!acc || !(await verifyPassword(password, acc.salt, acc.hash))) {
      noteLoginFail(ip);
      return res.status(401).json({ error: "Wrong admin username or password." });
    }
    const token = makeToken();
    admins.tokens[token] = key;
    saveAdmins();
    recordAudit("admin.login", "logged in from " + ip, acc.username);
    console.log("[admin] " + acc.username + " logged in.");
    res.json({ token, username: acc.username, role: acc.role || "admin" });
  });

  // Redeem a one-time reset code. This is the player-facing half of the
  // forgot-password flow, so it is intentionally public — the code itself is
  // the credential (single-use, 15 min expiry).
  router.post("/reset-code/use", async (req, res) => {
    const code = String((req.body && req.body.code) || "").trim().toUpperCase();
    const username = ((req.body && req.body.username) || "").trim();
    const newPassword = (req.body && req.body.newPassword) || "";
    const key = username.toLowerCase();
    const entry = resetCodes.get(code);
    if (!entry) return res.status(400).json({ error: "Invalid or already-used reset code." });
    if (Date.now() > entry.expiresAt) {
      resetCodes.delete(code);
      return res.status(400).json({ error: "That reset code has expired." });
    }
    if (entry.usernameLower !== key) {
      return res.status(400).json({ error: "That code does not belong to this username." });
    }
    const acc = accounts.accounts[key];
    if (!acc) return res.status(404).json({ error: "No such user." });
    if (newPassword.length < 4) {
      return res.status(400).json({ error: "Password must be at least 4 characters." });
    }
    const { salt, hash } = await hashPassword(newPassword);
    acc.salt = salt;
    acc.hash = hash;
    for (const t of Object.keys(accounts.tokens)) {
      if (accounts.tokens[t] === key) delete accounts.tokens[t];
    }
    resetCodes.delete(code);
    saveAccounts();
    recordAudit("user.reset-password", "password reset via code for " + acc.username, "player");
    console.log("[admin] password reset via code for " + acc.username);
    res.json({ ok: true, username: acc.username });
  });

  router.use(requireAdmin);

  router.get("/session", (req, res) => {
    res.json({ username: req.admin.username, role: req.admin.role, now: Date.now() });
  });

  router.post("/logout", (req, res) => {
    const token = getToken(req);
    delete admins.tokens[token];
    saveAdmins();
    console.log("[admin] " + req.admin.username + " logged out.");
    res.json({ ok: true });
  });

  // Dashboard snapshot.
  router.get("/overview", (req, res) => {
    const online = getOnlinePlayers();
    const botCount = players.filter((p) => p.online && p.isBot).length;
    const roomList = Object.values(rooms);
    res.json({
      now: Date.now(),
      onlinePlayers: online,
      onlineCount: online.length,
      botCount,
      roomCount: roomList.length,
      roomsInGame: roomList.filter((r) => activeGameInRoom(r)).length,
      accountCount: Object.keys(accounts.accounts).length,
      adminCount: Object.keys(admins.accounts).length,
      gamesPlayed: stats.gamesPlayed,
      playerStatsCount: Object.keys(stats.players).length,
      uptimeSeconds: Math.floor(process.uptime()),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      memoryMB: Math.round((process.memoryUsage().rss / 1024 / 1024) * 10) / 10,
      logCount: logBuffer.length,
      resetCodesActive: resetCodes.size,
      lastAnnouncement: announcements[announcements.length - 1] || null,
    });
  });

  // Live online players.
  router.get("/players", (req, res) => {
    const online = getOnlinePlayers().map((p) => {
      const player = players.find((x) => x.id === p.id);
      return {
        id: p.id,
        name: p.name,
        game: p.game,
        roomCode: p.roomCode,
        avatarUrl: avatarFor(p.name),
        persistentUserId: player ? player.persistentUserId : undefined,
      };
    });
    res.json({ players: online });
  });

  // Live rooms.
  router.get("/rooms", (req, res) => {
    const list = Object.values(rooms)
      .map((room) => ({
        code: room.code,
        createdAt: room.createdAt,
        lastActivity: room.lastActivity,
        game: activeGameInRoom(room),
        players: room.players
          .filter(Boolean)
          .map((p) => ({
            id: p.id,
            name: p.name,
            game: p.game,
            symbol: p.symbol,
            isBot: !!p.isBot,
            online: !!p.online,
            avatarUrl: p.isBot ? null : avatarFor(p.name),
          })),
        openSeats: 2 - room.players.filter(Boolean).length,
        spectators: room.spectators.map((p) => ({
          id: p.id,
          name: p.name,
          isBot: !!p.isBot,
          avatarUrl: p.isBot ? null : avatarFor(p.name),
        })),
      }))
      .sort((a, b) => a.createdAt - b.createdAt);
    res.json({ rooms: list });
  });

  router.post("/rooms/:code/close", (req, res) => {
    const code = String(req.params.code).toUpperCase();
    const reason = ((req.body && req.body.reason) || "").trim() || undefined;
    const result = ops.adminCloseRoom(code, reason);
    if (!result.ok) return res.status(404).json(result);
    recordAudit("room.close", "closed room " + code, req.admin.username);
    res.json(result);
  });

  router.post("/players/kick", (req, res) => {
    const socketId = req.body && req.body.socketId;
    const reason = ((req.body && req.body.reason) || "").trim() || undefined;
    if (!socketId) return res.status(400).json({ error: "socketId is required." });
    const result = ops.adminKickPlayer(socketId, reason);
    if (!result.ok) return res.status(404).json(result);
    recordAudit("player.kick", "kicked " + (result.name || socketId), req.admin.username);
    res.json(result);
  });

  router.post("/players/message", (req, res) => {
    const socketId = req.body && req.body.socketId;
    const message = (req.body && req.body.message) || "";
    if (!socketId) return res.status(400).json({ error: "socketId is required." });
    const result = ops.adminMessagePlayer(socketId, message);
    if (!result.ok) return res.status(404).json(result);
    recordAudit("player.message", "messaged " + (result.name || socketId), req.admin.username);
    res.json(result);
  });

  // Player account list (username, id, token count, stats).
  router.get("/users", (req, res) => {
    const users = Object.values(accounts.accounts)
      .map((acc) => ({
        username: acc.username,
        persistentUserId: acc.persistentUserId,
        tokenCount: userTokenCount(acc.username.toLowerCase()),
        avatarUrl: avatars.ensureAvatar(acc.username, { uid: acc.persistentUserId }),
        stats: stats.players[acc.persistentUserId] || null,
      }))
      .sort((a, b) => a.username.localeCompare(b.username));
    res.json({ users });
  });

  router.post("/users/reset-password", async (req, res) => {
    const username = ((req.body && req.body.username) || "").trim();
    const newPassword = (req.body && req.body.newPassword) || "";
    const key = username.toLowerCase();
    const acc = accounts.accounts[key];
    if (acc && newPassword.length < 4) {
      return res.status(400).json({ error: "New password must be at least 4 characters." });
    }
    if (!acc) return res.status(404).json({ error: "No such user." });
    const { salt, hash } = await hashPassword(newPassword);
    acc.salt = salt;
    acc.hash = hash;
    for (const t of Object.keys(accounts.tokens)) {
      if (accounts.tokens[t] === key) delete accounts.tokens[t];
    }
    saveAccounts();
    recordAudit("user.reset-password", "reset password for " + acc.username, req.admin.username);
    console.log("[admin] reset password for " + acc.username);
    res.json({ ok: true, username: acc.username });
  });

  router.delete("/users/:username", (req, res) => {
    const key = req.params.username.toLowerCase();
    const acc = accounts.accounts[key];
    if (!acc) return res.status(404).json({ error: "No such user." });
    for (const t of Object.keys(accounts.tokens)) {
      if (accounts.tokens[t] === key) delete accounts.tokens[t];
    }
    delete accounts.accounts[key];
    avatars.removeAvatar(acc.username);
    if (acc.persistentUserId && stats.players[acc.persistentUserId]) {
      delete stats.players[acc.persistentUserId];
      saveStats();
    }
    const live = players.find((p) => p.persistentUserId === acc.persistentUserId);
    if (live && live.id) {
      ops.adminKickPlayer(live.id, "Your account was deleted by an admin.");
    }
    saveAccounts();
    recordAudit("user.delete", "deleted user " + acc.username, req.admin.username);
    console.log("[admin] deleted user " + acc.username);
    res.json({ ok: true, username: acc.username });
  });

  // Issue a short-lived, single-use password-reset code for a player account.
  // The player can redeem it later through a forgot-password dialog on the
  // games side (see POST /reset-code/use).
  router.post("/users/reset-code", (req, res) => {
    const username = ((req.body && req.body.username) || "").trim();
    const key = username.toLowerCase();
    const acc = accounts.accounts[key];
    if (!acc) return res.status(404).json({ error: "No such user." });
    const code = crypto.randomBytes(3).toString("hex").toUpperCase();
    resetCodes.set(code, { usernameLower: key, expiresAt: Date.now() + RESET_TTL_MS });
    recordAudit("user.reset-code", "issued reset code for " + acc.username, req.admin.username);
    console.log("[admin] issued reset code for " + acc.username);
    res.json({
      ok: true,
      username: acc.username,
      code,
      expiresInMinutes: Math.round(RESET_TTL_MS / 60000),
    });
  });

  // Leaderboard from stats.json.
  router.get("/stats", (req, res) => {
    const accountByPuid = new Map();
    for (const key of Object.keys(accounts.accounts)) {
      const a = accounts.accounts[key];
      accountByPuid.set(a.persistentUserId, a);
    }
    const list = Object.entries(stats.players)
      .map(([persistentUserId, s]) => {
        const wins = s.wins || 0;
        const losses = s.losses || 0;
        const draws = s.draws || 0;
        const total = wins + losses + draws;
        const account = accountByPuid.get(persistentUserId);
        return {
          persistentUserId,
          name: s.name || "Unknown",
          avatarUrl: account
            ? avatars.ensureAvatar(account.username, {
                uid: account.persistentUserId,
              })
            : null,
          wins,
          losses,
          draws,
          total,
          winRate: total ? Math.round((wins / total) * 1000) / 10 : 0,
        };
      })
      .sort((a, b) => b.wins - a.wins || b.winRate - a.winRate || a.name.localeCompare(b.name));
    res.json({ gamesPlayed: stats.gamesPlayed, leaderboard: list });
  });

  // Broadcast to every online player (they see a toast on the games page).
  router.post("/announce", (req, res) => {
    const text = String((req.body && req.body.message) || "").trim();
    if (!text) return res.status(400).json({ error: "Message cannot be empty." });
    const payload = { text, at: Date.now() };
    io.emit("admin-announce", payload);
    announcements.push(payload);
    if (announcements.length > 20) announcements.shift();
    console.log("[admin] announcement: " + text);
    recordAudit("announce", text, req.admin.username);
    res.json({ ok: true });
  });

  // Recent server console logs.
  router.get("/logs", (req, res) => {
    res.json({ logs: logBuffer.slice(-LOG_LIMIT).reverse() });
  });

  router.delete("/logs", (req, res) => {
    logBuffer = [];
    recordAudit("logs.clear", "cleared the log buffer", req.admin.username);
    res.json({ ok: true });
  });

  // Admin audit trail (recent actions by admins).
  router.get("/audit", (req, res) => {
    res.json({ audit: audit.slice(-AUDIT_LIMIT).reverse() });
  });

  // ----- admin account management (root only) --------------------------------
  router.get("/admins", (req, res) => {
    const list = Object.values(admins.accounts).map((a) => ({
      username: a.username,
      role: a.role || "admin",
      tokenCount: adminTokenCount(a.username.toLowerCase()),
    }));
    res.json({ admins: list });
  });

  router.post("/admins", requireRoot, async (req, res) => {
    const username = ((req.body && req.body.username) || "").trim();
    const password = (req.body && req.body.password) || "";
    const role = (req.body && req.body.role) === "root" ? "root" : "admin";
    const key = username.toLowerCase();
    if (username.length < 2 || username.length > 20) {
      return res.status(400).json({ error: "Username must be 2-20 characters." });
    }
    if (admins.accounts[key]) return res.status(409).json({ error: "That admin already exists." });
    if (password.length < 4) {
      return res.status(400).json({ error: "Password must be at least 4 characters." });
    }
    const { salt, hash } = await hashPassword(password);
    admins.accounts[key] = { username, salt, hash, role };
    saveAdmins();
    recordAudit("admin.create", "created admin " + username, req.admin.username);
    console.log("[admin] " + req.admin.username + " created admin " + username);
    res.json({ ok: true, username, role });
  });

  router.post("/admins/reset-password", requireRoot, async (req, res) => {
    const username = ((req.body && req.body.username) || "").trim();
    const newPassword = (req.body && req.body.newPassword) || "";
    const key = username.toLowerCase();
    const acc = admins.accounts[key];
    if (!acc) return res.status(404).json({ error: "No such admin." });
    if (newPassword.length < 4) {
      return res.status(400).json({ error: "Password must be at least 4 characters." });
    }
    const { salt, hash } = await hashPassword(newPassword);
    acc.salt = salt;
    acc.hash = hash;
    for (const t of Object.keys(admins.tokens)) {
      if (admins.tokens[t] === key) delete admins.tokens[t];
    }
    saveAdmins();
    recordAudit("admin.reset-password", "reset password for " + acc.username, req.admin.username);
    res.json({ ok: true, username: acc.username });
  });

  router.delete("/admins/:username", requireRoot, (req, res) => {
    const key = req.params.username.toLowerCase();
    if (!admins.accounts[key]) return res.status(404).json({ error: "No such admin." });
    if (key === req.admin.key) {
      return res.status(400).json({ error: "You cannot delete your own account." });
    }
    const acc = admins.accounts[key];
    for (const t of Object.keys(admins.tokens)) {
      if (admins.tokens[t] === key) delete admins.tokens[t];
    }
    delete admins.accounts[key];
    saveAdmins();
    recordAudit("admin.delete", "deleted admin " + acc.username, req.admin.username);
    console.log("[admin] " + req.admin.username + " deleted admin " + acc.username);
    res.json({ ok: true, username: acc.username });
  });

  const getLastAnnouncement = () => announcements[announcements.length - 1] || null;

  return { router, getLastAnnouncement };
};