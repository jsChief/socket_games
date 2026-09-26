// Deterministic pixel-art avatar generator.
//
// Given a username (and optionally a seed hue + pattern) it produces a
// mirrored identicon-style sprite (8x8 grid, mirrored left/right, scaled up 8x
// to a 64x64 PNG). Colors are derived from the seed hue; the sprite shape is
// derived deterministically from a hash of (name, hue, pattern), so a given
// combination always produces the same image.
//
// Per-user avatar settings (color + pattern) are stored in data/avatar-settings.json
// keyed by persistentUserId. `color` is either a hue in degrees (number) or a
// monochrome name ("black"/"white"). The PNGs are written to
// public/avatars/<tag>.png and served straight from Express's static folder.
// There are zero runtime dependencies (deflate comes from Node's zlib).
//
// NOTE: The client-side preview renderer in public/components/avatar-dialog.js
// mirrors the exact algorithms here (fnv1a, mulberry32, hslToRgb,
// buildIdenticon, patterns) so the preview matches the saved PNG.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const AVATARS_DIR = path.join(__dirname, "..", "public", "avatars");
const SETTINGS_PATH = path.join(
  __dirname,
  "..",
  "data",
  "avatar-settings.json",
);
// const GRID = 8; // sprite grid size (columns/rows)
// const HALF = GRID / 2; // independent columns before mirroring
// const SCALE = 8; // each sprite pixel becomes an 8x8 block
const GRID = 16; // Upgraded from 8 to 16
const HALF = GRID / 2; // 8 independent columns before mirroring
const SCALE = 4; // 16 * 4 = 64x64 PNG output (maintains exact same PNG footprint)

// ---------- settings store ----------

const PATTERNS = [
  "random",
  "checker",
  "stripes",
  "rings",
  "dots",
  "cross",
  "face",
  "diamond",
  "grid",
  "heart",
  "circle",
];

// Named monochrome colors accepted alongside hue degrees.
const MONO_COLORS = [
  "black",
  "white",
  "cyberpunk",
  "sunset",
  "neon",
  "emerald",
];

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
  if (opts && opts.color !== undefined && opts.color !== null)
    entry.color = opts.color;
  else if (opts && typeof opts.hue === "number") entry.color = opts.hue;
  if (opts && opts.pattern) entry.pattern = opts.pattern;
  avatarSettings[uid] = entry;
  saveSettings();
}

function getAvatarSettings(uid) {
  return (uid && avatarSettings[uid]) || null;
}

// Normalize a color: a hue in degrees into [0, 360) (number) or "black"/"white".
// Returns null if not a recognized color.
function sanitizeColor(value) {
  if (MONO_COLORS.indexOf(value) !== -1) return value;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return ((n % 360) + 360) % 360;
}

// Normalize a hue in degrees into [0, 360). Returns null if not a number.
function sanitizeHue(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return ((n % 360) + 360) % 360;
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

function tagFor(color, pattern) {
  return (
    (typeof color === "string" ? color : "h" + Math.round(color)) +
    "-" +
    pattern
  );
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

function __hslToRgb(h, s, l) {
  h = ((h % 1) + 1) % 1;
  var c = (1 - Math.abs(2 * l - 1)) * s;
  var x = c * (1 - Math.abs(((h * 6) % 2) - 1));
  var m = l - c / 2;
  var r = 0,
    g = 0,
    b = 0;
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

// Resolve the 4-color palette for a sprite from a color (hue degrees or a mono
// name). Returns { fg, dark, hl, bg } as [r, g, b] tuples. Mirrored 1:1 by the
// client preview in avatar-dialog.js.
// function paletteFor(color) {
//   if (color === "black") {
//     return {
//       fg: [23, 26, 34],
//       dark: [7, 8, 12],
//       hl: [132, 138, 154],
//       bg: [242, 243, 247],
//     };
//   }
//   if (color === "white") {
//     return {
//       fg: [247, 248, 250],
//       dark: [196, 200, 210],
//       hl: [255, 255, 255],
//       bg: [104, 109, 124],
//     };
//   }
//   const hue = sanitizeColor(color);
//   const hueFrac = hue / 360;
//   return {
//     fg: hslToRgb(hueFrac, 0.62, 0.46),
//     dark: hslToRgb((hueFrac + 0.015) % 1, 0.55, 0.28),
//     hl: hslToRgb((hueFrac + 0.02) % 1, 0.55, 0.68),
//     bg: hslToRgb(hueFrac, 0.45, 0.93),
//   };
// }
// Named palettes supported in addition to single hue angles

function paletteFor(color) {
  if (color === "black") {
    return {
      fg: [23, 26, 34],
      dark: [7, 8, 12],
      hl: [132, 138, 154],
      bg: [242, 243, 247],
    };
  }
  if (color === "white") {
    return {
      fg: [247, 248, 250],
      dark: [196, 200, 210],
      hl: [255, 255, 255],
      bg: [104, 109, 124],
    };
  }
  if (color === "cyberpunk") {
    return {
      fg: [255, 0, 127],
      dark: [40, 10, 60],
      hl: [0, 240, 255],
      bg: [15, 10, 25],
    };
  }
  if (color === "sunset") {
    return {
      fg: [255, 107, 107],
      dark: [78, 205, 196],
      hl: [255, 230, 109],
      bg: [44, 62, 80],
    };
  }
  if (color === "neon") {
    return {
      fg: [57, 255, 20],
      dark: [20, 20, 20],
      hl: [255, 0, 255],
      bg: [5, 5, 5],
    };
  }
  if (color === "emerald") {
    return {
      fg: [46, 204, 113],
      dark: [22, 160, 133],
      hl: [241, 196, 15],
      bg: [236, 240, 241],
    };
  }

  const hue = sanitizeColor(color);
  const hueFrac = hue / 360;
  return {
    fg: __hslToRgb(hueFrac, 0.62, 0.46),
    dark: __hslToRgb((hueFrac + 0.015) % 1, 0.55, 0.28),
    hl: __hslToRgb((hueFrac + 0.02) % 1, 0.55, 0.68),
    bg: __hslToRgb(hueFrac, 0.45, 0.93),
  };
}

// ---------- sprite ----------

// Builds a GRID x GRID sprite map of color keys: "fg" | "dark" | "hl" | null.
// Shared algorithm with the client; throws in a loop of (y, x) over the full
// grid but only draws from the mirrored left half so output stays symmetric.
function buildIdenticon(seedStr, hue, pattern) {
  const rand = seedRng(seedStr);
  const keyAt = (x, y) => {
    if (pattern === "circle") {
  const dx = x - (GRID - 1) / 2;
  const dy = y - (GRID - 1) / 2;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const r = Math.floor(dist);

  return r === 0 || r === 1
    ? "fg"
    : r === 2 || r === 3
      ? "dark"
      : r === 4 || r === 5
        ? "hl"
        : r === 6
          ? "fg"
          : null;
}
    if (pattern === "face") {
      // Head shape background
      //if (y < 2 || y > 14) return null;

      // Eyes (2x2 pixel eyes with light highlight reflections)
      if ((y === 6 || y === 7) && (x === 3 || x === 4)) return "dark";
      if (y === 6 && x === 3) return "hl"; // Sparkle in eye

      // Blush cheeks
      if (y === 9 && (x === 2 || x === 3)) return "hl";

      // Smile / Mouth
      if (y === 11 && x === 5) return "dark";
      if (y === 12 && (x === 5 || x === 6 || x === 7)) return "dark";

      // Main head fill
      return "fg";
    }

    // New Pattern: Diamond
    if (pattern === "diamond") {
      const dist = Math.abs(x - 7.5) + Math.abs(y - 7.5);
      if (dist < 4) return "fg";
      if (dist < 7) return "hl";
      if (dist < 10) return "dark";
      return null;
    }

    // New Pattern: Grid Matrix
    if (pattern === "grid") {
      if (x % 3 === 0 || y % 3 === 0) return "fg";
      const v = rand();
      return v < 0.4 ? "hl" : "dark";
    }

    // New Pattern: Heart
    if (pattern === "heart") {
      // Basic heart curve check on 16x16
      const nx = (x - 7.5) / 6;
      const ny = (y - 6.5) / 6;
      const a = nx * nx + ny * ny - 1;
      if (a * a * a - nx * nx * ny * ny * ny <= 0) {
        return (x + y) % 2 === 0 ? "fg" : "hl";
      }
      return null;
    }
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
      var k = Math.floor(
        Math.max(
          Math.abs(x - (GRID - 1) / 2),
          Math.abs(y - (GRID - 1) / 2),
        ),
      );
      return k === 0
        ? "fg"
        : k === 1
          ? "dark"
          : k === 2
            ? "hl"
            : k === 3
              ? "fg"
              : k === 4
                ? "dark"
                : null;
    }
    if (pattern === "cross") {
      const center =
        Math.abs(x - (GRID - 1) / 2) < 1 || Math.abs(y - (GRID - 1) / 2) < 1;
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
    if (pattern === "face") {
      // Cute face: rounded head in fg, dark eyes + smile, light blush. x here is
      // the mirrored column 0..3, so all features stay symmetric automatically.
      if (y === 0 || y === 7) return x === 0 ? null : "fg";
      if (y === 2 || y === 3) return x === 2 ? "dark" : "fg";
      if (y === 5) return x === 1 ? "hl" : x === 2 || x === 3 ? "dark" : "fg";
      return "fg";
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
  const explicit =
    opts && opts.color !== undefined && opts.color !== null
      ? opts.color
      : opts && typeof opts.hue === "number"
        ? opts.hue
        : null;
  const pattern = (opts && sanitizePattern(opts.pattern)) || "rings";

  let color = explicit != null ? sanitizeColor(explicit) : null;
  if (color == null) color = baseHueFor(seedStr);
  const seed =
    explicit != null
      ? seedStr +
        "|" +
        (typeof color === "string" ? color : Math.round(color)) +
        "|" +
        pattern
      : seedStr + "::legacy";

  const palette = paletteFor(color);
  const grid = buildIdenticon(seed, color, pattern);
  const colorOf = (k) =>
    k === "fg"
      ? palette.fg
      : k === "dark"
        ? palette.dark
        : k === "hl"
          ? palette.hl
          : palette.bg;

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

// Resolve the effective (color, pattern) for a player, falling back through the
// explicit opts then their stored settings then a name-derived default.
function resolveAvatarParams(name, opts) {
  const uid = opts && opts.uid;
  const settings = uid ? getAvatarSettings(uid) : null;
  const explicit =
    opts && opts.color !== undefined && opts.color !== null
      ? opts.color
      : opts && typeof opts.hue === "number"
        ? opts.hue
        : null;
  let color = explicit != null ? sanitizeColor(explicit) : null;
  if (color == null && settings) {
    color = sanitizeColor(
      settings.color !== undefined ? settings.color : settings.hue,
    );
  }
  if (color == null) color = baseHueFor(slugify(name));
  var pattern =
    (opts && sanitizePattern(opts.pattern)) ||
    (settings && settings.pattern) ||
    "random";
    //console.log("resolve", color, pattern);
  return { color, pattern };
}

// Make sure the avatar PNG for `name` exists on disk and return its URL.
// opts: { uid, color, pattern } where uid pulls stored settings (hue legacy ok).
function ensureAvatar(name, opts) {
  const { color, pattern } = resolveAvatarParams(name, opts);
  const url = getAvatarUrl(name, color, pattern);
  const filePath = getAvatarPath(name, color, pattern);
  fs.mkdirSync(AVATARS_DIR, { recursive: true });
  if (!fs.existsSync(filePath)) {
    const { width, height, rgba } = generateSprite(name, { color, pattern });
    fs.writeFileSync(filePath, encodePNG(width, height, rgba));
  }
  return url;
}

// Side-effect-free avatar lookup: returns the URL only if the PNG already
// exists on disk. Used by read-only reports (e.g. the admin Live tab and
// online-player broadcasts) so merely listing players never creates avatar
// files for stale guest names (like the removed accounts' names old tabs
// still carry around).
function avatarUrlIfExists(name, opts) {
  const { color, pattern } = resolveAvatarParams(name, opts);
  const filePath = getAvatarPath(name, color, pattern);
  return fs.existsSync(filePath) ? getAvatarUrl(name, color, pattern) : null;
}

// Delete every avatar variant for `name` except the one matching (color,
// pattern) and the legacy unsuffixed file (still linked from old chat rows).
// Keeps Avatar Studio saves from accumulating stale PNGs. Returns removed count.
function pruneAvatarVariants(name, color, pattern) {
  const slug = slugify(name);
  const keep = slug + "-" + tagFor(color, pattern) + ".png";
  const legacy = slug + ".png";
  let removed = 0;
  let files = [];
  try {
    files = fs.readdirSync(AVATARS_DIR);
  } catch (e) {
    return removed;
  }
  const prefix = slug + "-";
  for (const f of files) {
    if (f === keep || f === legacy || !f.startsWith(prefix)) continue;
    try {
      fs.unlinkSync(path.join(AVATARS_DIR, f));
      removed++;
    } catch (e) {}
  }
  return removed;
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

// Recover the name slug from an avatar filename ("<slug>-h<num>-<pattern>.png",
// "<slug>-<mono>-<pattern>.png" or the legacy "<slug>.png").
function slugFromFileName(fileName) {
  const stem = String(fileName || "").replace(/\.png$/i, "");
  for (const pattern of PATTERNS) {
    const re = new RegExp("-(h\\d+|black|white)-" + pattern + "$");
    const m = re.exec(stem);
    if (m) return stem.slice(0, m.index);
  }
  return stem;
}

// Delete every avatar PNG whose name slug is not in `allowedSlugs`. Used at
// server startup so the folder only keeps avatars for the current accounts;
// anything else (removed accounts, test players, stale guest files) is removed
// and simply regenerated on demand if that player ever comes back online.
// Returns how many files were removed.
function pruneAvatars(allowedSlugs) {
  const allowed = new Set(allowedSlugs);
  let removed = 0;
  let files = [];
  try {
    files = fs.readdirSync(AVATARS_DIR);
  } catch (e) {
    return removed;
  }
  for (const f of files) {
    if (allowed.has(slugFromFileName(f))) continue;
    try {
      fs.unlinkSync(path.join(AVATARS_DIR, f));
      removed++;
    } catch (e) {}
  }
  return removed;
}

module.exports = {
  slugify,
  PATTERNS,
  sanitizeColor,
  sanitizeHue,
  sanitizePattern,
  buildIdenticon,
  generateSprite,
  encodePNG,
  getAvatarPath,
  getAvatarUrl,
  ensureAvatar,
  avatarUrlIfExists,
  removeAvatar,
  pruneAvatars,
  pruneAvatarVariants,
  setAvatarSettings,
  getAvatarSettings,
  baseHueFor,
  baseHueOf: baseHueFor,
};
