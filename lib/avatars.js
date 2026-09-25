// Deterministic pixel-art avatar generator.
//
// Given a username (and optionally a seed hue + pattern) it produces a
// mirrored identicon-style sprite (8x8 grid, mirrored left/right, scaled up 8x
// to a 64x64 PNG). Colors are derived from the seed hue; the sprite shape is
// derived deterministically from a hash of (name, hue, pattern), so a given
// combination always produces the same image.
//
// Per-user avatar settings (hue + pattern) are stored in data/avatar-settings.json
// keyed by persistentUserId. The PNGs are written to public/avatars/<tag>.png
// and served straight from Express's static folder. There are zero runtime
// dependencies (deflate comes from Node's zlib).
//
// NOTE: The client-side preview renderer in public/components/avatar-dialog.js
// mirrors the exact algorithms here (fnv1a, mulberry32, hslToRgb,
// buildIdenticon, patterns) so the preview matches the saved PNG.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const AVATARS_DIR = path.join(__dirname, "..", "public", "avatars");
const SETTINGS_PATH = path.join(__dirname, "..", "data", "avatar-settings.json");
const GRID = 8; // sprite grid size (columns/rows)
const HALF = GRID / 2; // independent columns before mirroring
const SCALE = 8; // each sprite pixel becomes an 8x8 block

// ---------- settings store ----------

const PATTERNS = ["random", "checker", "stripes", "rings", "dots", "cross"];

let avatarSettings = {};

function loadSettings() {
  try {
    const raw = fs.readFileSync(SETTINGS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    avatarSettings =
      parsed && typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch (e) {
    if (e.code !== "ENOENT") console.error("Error loading avatar settings:", e);
    avatarSettings = {};
  }
}

function saveSettings() {
  try {
    fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(avatarSettings, null, 2));
  } catch (e) {
    console.error("Error saving avatar settings:", e);
  }
}
loadSettings();

function setAvatarSettings(uid, opts) {
  const entry = avatarSettings[uid] || {};
  if (opts && typeof opts.hue === "number") entry.hue = opts.hue;
  if (opts && opts.pattern) entry.pattern = opts.pattern;
  avatarSettings[uid] = entry;
  saveSettings();
}

function getAvatarSettings(uid) {
  return (uid && avatarSettings[uid]) || null;
}

// Normalize a hue in degrees into [0, 360). Returns null if not a number.
function sanitizeHue(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return (((n % 360) + 360) % 360);
}

function sanitizePattern(value) {
  return PATTERNS.includes(value) ? value : null;
}

// The server-side default hue when a player has no saved settings.
function baseHueFor(seedStr) {
  return Math.floor(seedRng(seedStr + "::hue")() * 360);
}

// ---------- filenames ----------

function slugify(name) {
  const slug = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "guest";
}

function tagFor(hue, pattern) {
  return "h" + Math.round(hue) + "-" + pattern;
}

function getAvatarPath(name, hue, pattern) {
  return path.join(
    AVATARS_DIR,
    slugify(name) + "-" + tagFor(hue, pattern) + ".png",
  );
}

function getAvatarUrl(name, hue, pattern) {
  return "/avatars/" + slugify(name) + "-" + tagFor(hue, pattern) + ".png";
}

// ---------- deterministic randomness ----------

// FNV-1a 32-bit hash (kept in sync with the client preview renderer).
function fnv1a(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function seedRng(seedStr) {
  let s = fnv1a(seedStr);
  return function mulberry32() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hslToRgb(h, s, l) {
  h = ((h % 1) + 1) % 1;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 1 / 6) [r, g, b] = [c, x, 0];
  else if (h < 2 / 6) [r, g, b] = [x, c, 0];
  else if (h < 3 / 6) [r, g, b] = [0, c, x];
  else if (h < 4 / 6) [r, g, b] = [0, x, c];
  else if (h < 5 / 6) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

// ---------- sprite ----------

// Builds a GRID x GRID sprite map of color keys: "fg" | "dark" | "hl" | null.
// Shared algorithm with the client; throws in a loop of (y, x) over the full
// grid but only draws from the mirrored left half so output stays symmetric.
function buildIdenticon(seedStr, hue, pattern) {
  const rand = seedRng(seedStr);
  const keyAt = (x, y) => {
    if (pattern === "checker") {
      if ((x + y) % 2 === 0) {
        const v = rand();
        return v < 0.55 ? "fg" : v < 0.8 ? "dark" : "hl";
      }
      return null;
    }
    if (pattern === "stripes") {
      const d = Math.min(
        x + y,
        GRID - 1 - x + y,
        x + GRID - 1 - y,
        GRID - 1 - x + GRID - 1 - y,
      );
      const band = d % 3;
      return band === 0 ? "fg" : band === 1 ? "hl" : null;
    }
    if (pattern === "rings") {
      const k = Math.floor(
        Math.max(Math.abs(x - (GRID - 1) / 2), Math.abs(y - (GRID - 1) / 2)),
      );
      return k === 0 ? "fg" : k === 1 ? "dark" : k === 2 ? "hl" : null;
    }
    if (pattern === "cross") {
      const center = Math.abs(x - (GRID - 1) / 2) < 1 || Math.abs(y - (GRID - 1) / 2) < 1;
      if (center) {
        const v = rand();
        return v < 0.6 ? "fg" : v < 0.85 ? "dark" : "hl";
      }
      return null;
    }
    if (pattern === "dots") {
      const v = rand();
      return v < 0.2 ? "fg" : v < 0.28 ? "dark" : v < 0.34 ? "hl" : null;
    }
    // "random" (default)
    const v = rand();
    return v < 0.38 ? "fg" : v < 0.43 ? "dark" : v < 0.48 ? "hl" : null;
  };

  const grid = new Array(GRID * GRID).fill(null);
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const cx = x < HALF ? x : GRID - 1 - x;
      grid[y * GRID + x] = keyAt(cx, y);
    }
  }
  return grid;
}

function generateSprite(seedStr, opts) {
  const hueDeg = opts && typeof opts.hue === "number" ? opts.hue : null;
  const pattern =
    (opts && sanitizePattern(opts.pattern)) || "random";

  const hue = (hueDeg != null ? (hueDeg % 360) + 360 : baseHueFor(seedStr)) % 360;
  const seed =
    hueDeg != null
      ? seedStr + "|" + Math.round(hue) + "|" + pattern
      : seedStr + "::legacy";
  const hueFrac = hue / 360;

  const fg = hslToRgb(hueFrac, 0.62, 0.46);
  const dark = hslToRgb((hueFrac + 0.015) % 1, 0.55, 0.28);
  const hl = hslToRgb((hueFrac + 0.02) % 1, 0.55, 0.68);
  const bg = hslToRgb(hueFrac, 0.45, 0.93);

  const grid = buildIdenticon(seed, hueFrac, pattern);
  const colorOf = (k) =>
    k === "fg" ? fg : k === "dark" ? dark : k === "hl" ? hl : bg;

  const width = GRID * SCALE;
  const height = GRID * SCALE;
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const [r, g, b] = colorOf(grid[y * GRID + x]);
      for (let sy = 0; sy < SCALE; sy++) {
        for (let sx = 0; sx < SCALE; sx++) {
          const idx = ((y * SCALE + sy) * width + (x * SCALE + sx)) * 4;
          rgba[idx] = r;
          rgba[idx + 1] = g;
          rgba[idx + 2] = b;
          rgba[idx + 3] = 255;
        }
      }
    }
  }
  return { width, height, rgba };
}

// ---------- minimal PNG encoder ----------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA

  // Each scanline is prefixed with a 0 (no filter).
  const raw = Buffer.alloc((width * 4 + 1) * height);
  let off = 0;
  for (let y = 0; y < height; y++) {
    raw[off++] = 0;
    rgba.copy(raw, off, y * width * 4, (y + 1) * width * 4);
    off += width * 4;
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- file-backed API ----------

// Resolve the effective (hue, pattern) for a player, falling back through the
// explicit opts then their stored settings then a name-derived default.
function resolveAvatarParams(name, opts) {
  const uid = opts && opts.uid;
  const settings = uid ? getAvatarSettings(uid) : null;
  const explicitHue = opts && typeof opts.hue === "number" ? opts.hue : null;
  const hueDeg =
    explicitHue != null
      ? explicitHue
      : settings && typeof settings.hue === "number"
        ? settings.hue
        : baseHueFor(slugify(name));
  const pattern =
    (opts && sanitizePattern(opts.pattern)) ||
    (settings && settings.pattern) ||
    "random";
  return {
    hue: Math.round(((hueDeg % 360) + 360) % 360),
    pattern,
  };
}

// Make sure the avatar PNG for `name` exists on disk and return its URL.
// opts: { uid, hue, pattern } where uid pulls stored settings.
function ensureAvatar(name, opts) {
  const { hue, pattern } = resolveAvatarParams(name, opts);
  const url = getAvatarUrl(name, hue, pattern);
  const filePath = getAvatarPath(name, hue, pattern);
  fs.mkdirSync(AVATARS_DIR, { recursive: true });
  if (!fs.existsSync(filePath)) {
    const { width, height, rgba } = generateSprite(name, { hue, pattern });
    fs.writeFileSync(filePath, encodePNG(width, height, rgba));
  }
  return url;
}

function removeAvatar(name) {
  // Remove the legacy unsuffixed file plus every tagged variant for this name.
  const prefix = slugify(name) + "-";
  let removed = false;
  let files = [];
  try {
    files = fs.readdirSync(AVATARS_DIR);
  } catch (e) {
    return false;
  }
  const targets = [slugify(name) + ".png"];
  for (const f of files) if (f.startsWith(prefix)) targets.push(f);
  for (const file of targets) {
    try {
      fs.unlinkSync(path.join(AVATARS_DIR, file));
      removed = true;
    } catch (e) {}
  }
  return removed;
}

module.exports = {
  slugify,
  PATTERNS,
  sanitizeHue,
  sanitizePattern,
  buildIdenticon,
  generateSprite,
  encodePNG,
  getAvatarPath,
  getAvatarUrl,
  ensureAvatar,
  removeAvatar,
  setAvatarSettings,
  getAvatarSettings,
  baseHueFor,
  baseHueOf: baseHueFor,
};