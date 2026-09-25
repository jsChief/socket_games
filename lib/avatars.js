// Deterministic pixel-art avatar generator.
//
// Given a username it produces a mirrored identicon-style sprite (8x8 grid,
// mirrored left/right, scaled up 8x to a 64x64 PNG) whose colors are derived
// from a hash of the name, so the same name always gets the same image.
//
// The PNGs are written to public/avatars/<slug>.png and served straight from
// Express's static folder. There are zero runtime dependencies (deflate comes
// from Node's zlib, checksums are a small hand-rolled CRC32).
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");

const AVATARS_DIR = path.join(__dirname, "..", "public", "avatars");
const GRID = 8; // sprite grid size (columns/rows)
const HALF = GRID / 2; // independent columns before mirroring
const SCALE = 8; // each sprite pixel becomes an 8x8 block

// ---------- filenames ----------

function slugify(name) {
  const slug = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "guest";
}

function getAvatarPath(name) {
  return path.join(AVATARS_DIR, slugify(name) + ".png");
}

function getAvatarUrl(name) {
  return "/avatars/" + slugify(name) + ".png";
}

// ---------- deterministic randomness ----------

function seedRng(seedStr) {
  const h = crypto.createHash("sha256").update(seedStr).digest();
  let s = h.readUInt32LE(0) >>> 0;
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

// Returns { width, height, rgba } where rgba is a Buffer of RGBA pixels.
function generateSprite(seedStr) {
  const rand = seedRng(slugify(seedStr));
  const hue = rand();
  const fg = hslToRgb(hue, 0.62, 0.46);
  const dark = hslToRgb((hue + 0.015) % 1, 0.55, 0.28);
  const hl = hslToRgb((hue + 0.02) % 1, 0.55, 0.68);
  const bg = hslToRgb(hue, 0.45, 0.93);

  // Random left half: "fg" | "dark" | "hl" | null(bg).
  const left = new Array(GRID * HALF);
  for (let i = 0; i < left.length; i++) {
    const v = rand();
    if (v < 0.38) left[i] = "fg";
    else if (v < 0.43) left[i] = "dark";
    else if (v < 0.48) left[i] = "hl";
    else left[i] = null;
  }
  const cell = (x, y) => {
    const c = x < HALF ? x : GRID - 1 - x;
    return left[y * HALF + c];
  };
  const colorOf = (k) =>
    k === "fg" ? fg : k === "dark" ? dark : k === "hl" ? hl : bg;

  const width = GRID * SCALE;
  const height = GRID * SCALE;
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const [r, g, b] = colorOf(cell(x, y));
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

// Make sure the avatar PNG for `name` exists on disk and return its URL.
function ensureAvatar(name) {
  const url = getAvatarUrl(name);
  const filePath = getAvatarPath(name);
  fs.mkdirSync(AVATARS_DIR, { recursive: true });
  if (!fs.existsSync(filePath)) {
    const { width, height, rgba } = generateSprite(name);
    fs.writeFileSync(filePath, encodePNG(width, height, rgba));
  }
  return url;
}

function removeAvatar(name) {
  const filePath = getAvatarPath(name);
  try {
    fs.unlinkSync(filePath);
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = {
  slugify,
  generateSprite,
  encodePNG,
  getAvatarPath,
  getAvatarUrl,
  ensureAvatar,
  removeAvatar,
};