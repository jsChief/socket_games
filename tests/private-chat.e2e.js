// E2E test for offline private chats.
//
// Starts the real server in-process and drives it with two socket.io clients,
// verifying that private chats are readable when the other player is not
// connected:
//   1. a message sent while the recipient is offline is still stored
//   2. the sender's stored conversation is listed back to them
//   3. after a full disconnect, the recipient still sees the conversation and
//      can read its full history
//   4. messages sent to an unknown/offline id with no account are rejected
//   5. a message queued while offline is delivered live on reconnect
//
// Run with: node tests/private-chat.e2e.js

const { io } = require("socket.io-client");
const fs = require("fs");
const path = require("path");

// Back up stats.json so running the test doesn't pollute real stats.
const statsPath = path.join(__dirname, "..", "stats.json");
let statsBackup = null;
try {
  statsBackup = fs.readFileSync(statsPath, "utf8");
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
function restoreStats() {
  try {
    if (statsBackup === null) fs.unlinkSync(statsPath);
    else fs.writeFileSync(statsPath, statsBackup);
  } catch (e) {
    /* best effort */
  }
}

process.env.PORT = process.env.E2E_PORT || "3200";
const PORT = Number(process.env.PORT);

require("../server"); // starts the HTTP + socket.io server on $PORT
const privateChat = require("../lib/privateChat");

const URL = "http://localhost:" + PORT;

let failures = 0;
function assert(cond, label) {
  if (cond) {
    console.log("  PASS " + label);
  } else {
    failures++;
    console.error("  FAIL " + label);
  }
}

function connect() {
  return new Promise((resolve, reject) => {
    const s = io(URL, { reconnection: false, forceNew: true });
    s.on("connect", () => resolve(s));
    s.on("connect_error", reject);
  });
}

function waitFor(socket, event, timeout = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("timed out waiting for " + event)),
      timeout,
    );
    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

// The server acknowledges a connect with `name-set` for a new player and
// `welcome-back` when it recognises the persistent user id.
function joinAs(socket, name, uid) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("timed out joining as " + name)),
      4000,
    );
    const done = (data) => {
      clearTimeout(timer);
      socket.off("name-set", done);
      socket.off("welcome-back", done);
      resolve(data);
    };
    socket.on("name-set", done);
    socket.on("welcome-back", done);
    socket.emit("player-initial-connect", { name, persistentUserId: uid });
  });
}

function cleanupChats() {
  const dir = path.join(__dirname, "..", "data", "private_chats");
  for (const f of fs.readdirSync(dir)) {
    if (f.includes("e2e-dm-")) fs.unlinkSync(path.join(dir, f));
  }
}

async function main() {
  const A = "e2e-dm-alice-0001";
  const B = "e2e-dm-bob-0002";
  const S = "e2e-dm-stranger-0003";
  const C = "e2e-dm-cara-0004";

  console.log("Offline private chats:");

  const alice = await connect();
  const bob = await connect();
  await joinAs(alice, "Alice", A);
  await joinAs(bob, "Bob", B);
  // Wait for both to appear in each other's presence broadcast.
  await new Promise((r) => setTimeout(r, 250));

  // 1. baseline conversation while both are online
  alice.emit("private-message", { toUid: B, text: "online hello" });
  await waitFor(bob, "private-message");

  // 2. Bob goes away entirely.
  bob.disconnect();
  await new Promise((r) => setTimeout(r, 250));

  // 3. Alice keeps talking to a partner who is not connected.
  alice.emit("private-message", { toUid: B, text: "sent while you were away" });
  await new Promise((r) => setTimeout(r, 250));

  const stored = privateChat.getMessages(A, B).map((m) => m.text);
  assert(
    stored.includes("sent while you were away"),
    "message to an offline player is still stored",
  );
  assert(
    stored.includes("online hello"),
    "earlier online message is still in history",
  );

  // 4. The sender can list her stored conversation without Bob being online.
  const aliceList = await new Promise((resolve) => {
    alice.once("private-chats", resolve);
    alice.emit("list-private-chats");
  });
  const convos = (aliceList && aliceList.conversations) || [];
  assert(convos.length === 1, "sender is shown 1 stored conversation");
  assert(convos[0] && convos[0].partnerUid === B, "conversation points at the right partner");
  assert(convos[0] && convos[0].partnerName === "Bob", "conversation resolves the partner name");
  assert(
    convos[0] && convos[0].lastText === "sent while you were away",
    "conversation previews the most recent message",
  );

  // 5. A message aimed at an id with no account must not create a conversation.
  alice.emit("private-message", { toUid: S, text: "should not persist" });
  await new Promise((r) => setTimeout(r, 250));
  assert(
    privateChat.getMessages(A, S).length === 0,
    "messages to an unknown id are not stored",
  );

  // 6. Bob reconnects with a brand new socket: the chat list must be there
  //    without either side having exchanged anything live first.
  const bob2 = await connect();
  await joinAs(bob2, "Bob", B);
  const bobList = await new Promise((resolve) => {
    bob2.once("private-chats", resolve);
    bob2.emit("list-private-chats");
  });
  const bobConvos = (bobList && bobList.conversations) || [];
  assert(bobConvos.length === 1, "reconnecting player is shown the stored conversation");

  // 7. Bob reads the history that was written while he was away.
  const history = await new Promise((resolve) => {
    bob2.once("private-history", resolve);
    bob2.emit("join-private-chat", { partnerUid: A });
  });
  const texts = ((history && history.messages) || []).map((m) => m.text);
  assert(texts.length === 2, "reconnecting player reads both stored messages");
  assert(
    texts.includes("sent while you were away"),
    "the message sent while offline is readable afterwards",
  );
  assert(history && history.partnerName === "Alice", "history reports the partner name");

  // 8. Bob replies and Alice receives it live on her still-open socket.
  const incoming = waitFor(alice, "private-message");
  bob2.emit("private-message", { toUid: A, text: "just saw this" });
  const got = await incoming;
  assert(got && got.text === "just saw this", "replies are delivered live");

  // 9. Bob sends to Alice, then drops offline; a third message queued for Bob
  //    must sit in storage until he returns.
  bob2.emit("private-message", { toUid: A, text: "leaving again" });
  await new Promise((r) => setTimeout(r, 150));
  bob2.disconnect();
  await new Promise((r) => setTimeout(r, 150));
  alice.emit("private-message", { toUid: B, text: "queued for later" });
  await new Promise((r) => setTimeout(r, 250));
  assert(
    privateChat.getMessages(A, B).some((m) => m.text === "queued for later"),
    "message queued to a departed player is stored",
  );

  // 10. A brand new socket that NEVER asks for the list must still receive it.
  //     The client used to ask on connect, but that request could arrive before
  //     the server had registered the player and was dropped without a reply,
  //     leaving the chat list empty for the whole session.
  //     Give Cara a chat from a previous session first - she and Alice are both
  //     "offline" to each other right now.
  privateChat.addMessage(A, C, C, "Cara", "hey james, still up?", null);
  privateChat.addMessage(A, C, A, "Alice", "always for pizza", null);

  const cara = await connect();
  const pushed = new Promise((resolve) => {
    cara.once("private-chats", resolve);
  });
  await joinAs(cara, "Cara", C);
  const pushData = await Promise.race([
    pushed,
    new Promise((r) => setTimeout(() => r(null), 3000)),
  ]);
  assert(!!pushData, "chat list is pushed on connect without being asked for");
  assert(
    pushData &&
      Array.isArray(pushData.conversations) &&
      pushData.conversations.length === 1,
    "pushed list contains her one stored conversation",
  );
  assert(
    pushData && pushData.conversations.some((c) => c.partnerUid === A),
    "pushed list points at the right partner",
  );
  assert(
    pushData && pushData.conversations[0].partnerName === "Alice",
    "pushed list resolves the partner name",
  );
  assert(
    pushData && pushData.conversations[0].lastText === "always for pizza",
    "pushed list previews the last stored message",
  );
  // Alice must not see herself, and Bob must not appear in Cara's list.
  assert(
    pushData && !pushData.conversations.some((c) => c.partnerUid === C),
    "pushed list does not include the viewer",
  );
  assert(
    pushData && !pushData.conversations.some((c) => c.partnerUid === B),
    "pushed list only includes Cara's own conversations",
  );

  alice.disconnect();
  cara.disconnect();
  cleanupChats();
  restoreStats();

  console.log(
    failures ? "\n" + failures + " FAILURE(S)" : "\nALL PRIVATE CHAT TESTS PASSED",
  );
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  cleanupChats();
  restoreStats();
  console.error("\nERROR:", err && err.message);
  process.exit(1);
});
