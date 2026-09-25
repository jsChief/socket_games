// Shared password hashing + token helpers.
//
// Used by the game auth flow (server.js) and by the admin panel (lib/admin.js,
// lib/admin-cli.js) so all account systems hash identically.
const crypto = require("crypto");
const { promisify } = require("util");

const scrypt = promisify(crypto.scrypt);
const randomBytes = promisify(crypto.randomBytes);

// Hash a password with a random salt using scrypt.
async function hashPassword(password) {
  const salt = (await randomBytes(16)).toString("hex");
  const hash = (await scrypt(password, salt, 64)).toString("hex");
  return { salt, hash };
}

// Verify a plaintext password against the stored salt + hash.
async function verifyPassword(password, salt, hash) {
  const candidate = (await scrypt(password, salt, 64)).toString("hex");
  return candidate === hash;
}

// Generate a random login token.
function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

module.exports = { hashPassword, verifyPassword, generateToken };