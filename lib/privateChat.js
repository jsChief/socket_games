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

module.exports = { MAX_MESSAGES, addMessage, getMessages, chatKey };