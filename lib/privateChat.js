// Persistent storage for private (player-to-player) chats.
//
// Each private conversation gets its own SQLite database file that is created
// lazily on the first message in that chat. Databases live under
// data/private_chats/ (git-ignored) and are trimmed to the latest
// MAX_MESSAGES messages so old ones are cleared to make room for new ones.
//
// Uses Node's built-in `node:sqlite` (no external dependencies).

const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const MAX_MESSAGES = 50;

const dataDir = path.join(__dirname, "..", "data", "private_chats");

function ensureDir() {
  fs.mkdirSync(dataDir, { recursive: true });
}
ensureDir();

// Stable key for a conversation between two users. The two persistent user ids
// are sorted so that the same pair always maps to the same file regardless of
// who initiates.
function chatKey(uidA, uidB) {
  return [uidA, uidB]
    .map((uid) => String(uid || "").replace(/[^A-Za-z0-9_-]/g, ""))
    .sort()
    .join("__");
}

function fileForKey(key) {
  return path.join(dataDir, key + ".db");
}

function openDb(key) {
  const db = new DatabaseSync(fileForKey(key));
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_uid TEXT NOT NULL,
      from_name TEXT NOT NULL,
      text TEXT NOT NULL,
      reply_to TEXT,
      at INTEGER NOT NULL
    )
  `);
  return db;
}

// Persist a message for the conversation between uidA and uidB. Trims the
// chat to the newest MAX_MESSAGES messages. Returns the saved row.
function addMessage(uidA, uidB, fromUid, fromName, text, replyTo) {
  const key = chatKey(uidA, uidB);
  const db = openDb(key);
  try {
    const at = Date.now();
    const result = db
      .prepare(
        "INSERT INTO messages (from_uid, from_name, text, reply_to, at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(fromUid, fromName, text, replyTo || null, at);
    db.prepare(
      "DELETE FROM messages WHERE id NOT IN (SELECT id FROM messages ORDER BY id DESC LIMIT ?)",
    ).run(MAX_MESSAGES);
    return { id: Number(result.lastInsertRowid), fromUid, fromName, text, replyTo: replyTo || null, at };
  } finally {
    db.close();
  }
}

// Load the stored history for the conversation between uidA and uidB
// (newest first up to MAX_MESSAGES, returned oldest-first).
function getMessages(uidA, uidB, limit) {
  const key = chatKey(uidA, uidB);
  if (!fs.existsSync(fileForKey(key))) return [];
  const db = openDb(key);
  try {
    const cap = Math.min(
      Number.isFinite(limit) && limit > 0 ? limit : MAX_MESSAGES,
      MAX_MESSAGES,
    );
    return db
      .prepare(
        "SELECT id, from_uid, from_name, text, reply_to, at FROM messages ORDER BY id DESC LIMIT ?",
      )
      .all(cap)
      .reverse()
      .map((row) => ({
        id: Number(row.id),
        fromUid: row.from_uid,
        fromName: row.from_name,
        text: row.text,
        replyTo: row.reply_to,
        at: Number(row.at),
      }));
  } finally {
    db.close();
  }
}

// Enumerate every conversation `uid` takes part in, most recently active first.
// This is what lets a player reopen a private chat after a reload, or while the
// other person is offline: the conversation list is derived from the files on
// disk rather than from who happens to be connected right now.
function listConversations(uid) {
  // Match chatKey(), which sanitises uids before using them in a file name.
  const mine = String(uid || "").replace(/[^A-Za-z0-9_-]/g, "");
  if (!mine) return [];
  let names;
  try {
    names = fs.readdirSync(dataDir);
  } catch {
    return [];
  }
  const out = [];
  for (const file of names) {
    if (!file.endsWith(".db")) continue;
    // chatKey() sorts the two sanitised uids and joins them with "__".
    const parts = file.slice(0, -3).split("__");
    if (parts.length !== 2) continue;
    const partnerUid = parts[0] === mine ? parts[1] : parts[1] === mine ? parts[0] : "";
    if (!partnerUid) continue;
    let db;
    try {
      db = new DatabaseSync(path.join(dataDir, file));
      const last = db
        .prepare("SELECT from_uid, text, at FROM messages ORDER BY id DESC LIMIT 1")
        .get();
      if (!last) continue;
      const total = db.prepare("SELECT COUNT(*) AS n FROM messages").get();
      // Newest name the partner used, so a chat still shows a label even when
      // the account behind it has since been renamed or removed.
      const named = db
        .prepare("SELECT from_name FROM messages WHERE from_uid = ? ORDER BY id DESC LIMIT 1")
        .get(partnerUid);
      out.push({
        partnerUid,
        partnerName: named ? named.from_name : "",
        lastText: last.text,
        lastAt: Number(last.at),
        lastFromUid: last.from_uid,
        count: Number(total ? total.n : 0),
      });
    } catch {
      // Not a readable chat database - skip it rather than failing the list.
    } finally {
      if (db) db.close();
    }
  }
  out.sort((a, b) => b.lastAt - a.lastAt);
  return out;
}

module.exports = {
  MAX_MESSAGES,
  addMessage,
  getMessages,
  listConversations,
  chatKey,
};
