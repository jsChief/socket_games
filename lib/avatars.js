// Server-side avatar storage + PNG encoding.
//
// The pixel generation itself lives in public/avatar-core.js, which the browser
// loads as a <script> and this file requires - one copy of the hash / palette /
// pattern code, so the Avatar Studio preview always matches the saved PNG.
//
// Given a username (and optionally a seed hue + pattern) that shared core
// produces a mirrored 16x16 sprite scaled 4x into a 64x64 RGBA PNG, encoded
// here with a tiny built-in encoder (Node's zlib for compression plus a
// hand-rolled CRC32 - no npm packages). Colors come from the seed hue; the
// sprite shape is derived deterministically from a hash of (name, hue,
// pattern), so a given combination always produces the same image.
//
// Per-user avatar settings (color + pattern) are stored in
// data/avatar-settings.json keyed by persistentUserId. `color` is either a hue
// in degrees (number) or a named palette ("black", "white", "neon", ...). The
// PNGs are written to public/avatars/<slug>-<tag>.png and served straight from
// Express's static folder.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const core = require("../public/avatar-core.js");

const GRID = core.GRID; // sprite grid size (columns/rows)
const SCALE = core.SCALE; // each sprite pixel becomes a 4x4 block => 64x64

const AVATARS_DIR = path.join(__dirname, "..", "public", "avatars");
const SETTINGS_PATH = path.join(
  __dirname,
  "..",
  "data",
  "avatar-settings.json",
);

// ---------- settings store ----------

const PATTERNS = core.PATTERNS;
const MONO_COLORS = core.MONO_COLORS;
const DEFAULT_PATTERN = core.DEFAULT_PATTERN;
const GEN_VERSION = core.AVATAR_GEN_VERSION;

const sanitizeColor = core.sanitizeColor;
const sanitizeHue = core.sanitizeHue;
const sanitizePattern = core.sanitizePattern;
const baseHueFor = core.baseHueFor;
const slugify = core.slugify;

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

// ---------- filenames ----------

function tagFor(color, pattern) {
  return (
    "v" +
    GEN_VERSION +
    "-" +
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

// Filenames are "<slug>-v<gen>-(h<degrees>|<palette>)-<pattern>.png", plus the
// original untagged "<slug>.png" some old chat rows still link to.
const TAG_BODY =
  "(?:" +
  MONO_COLORS.join("|") +
  "|h\\d+)-(?:" +
  PATTERNS.join("|") +
  ")";
const CURRENT_TAG_RE = new RegExp("^(.*?)-v(\\d+)-" + TAG_BODY + "$");
const LEGACY_TAG_RE = new RegExp("^(.*?)-" + TAG_BODY + "$");

// Split an avatar filename into { slug, gen, tagged }. gen is 0 for the
// original untagged form.
function parseAvatarFile(fileName) {
  const stem = String(fileName || "").replace(/\.png$/i, "");
  const current = CURRENT_TAG_RE.exec(stem);
  if (current) {
    return { slug: current[1], gen: Number(current[2]), tagged: true };
  }
  const legacy = LEGACY_TAG_RE.exec(stem);
  if (legacy) return { slug: legacy[1], gen: 1, tagged: true };
  return { slug: stem, gen: 0, tagged: false };
}

// Recover the name slug from an avatar filename.
function slugFromFileName(fileName) {
  return parseAvatarFile(fileName).slug;
}

// ---------- sprite ----------

// Rasterize a 16x16 key grid into a SCALE-scaled RGBA buffer.
function generateSprite(seedStr, opts) {
  const { color, pattern, grid } = core.generateGrid(seedStr, opts);
  const palette = core.paletteFor(color);
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
  const pattern =
    (opts && sanitizePattern(opts.pattern)) ||
    (settings && sanitizePattern(settings.pattern)) ||
    DEFAULT_PATTERN;
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

// Delete every avatar PNG whose name slug is not in `allowedSlugs`, plus any
// tagged file left over from an older generator version. Used at server startup
// so the folder only keeps avatars for the current accounts; anything else
// (removed accounts, test players, stale guest files) is removed and simply
// regenerated on demand if that player ever comes back online. Untagged
// "<slug>.png" files are kept - old chat rows still link to them.
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
    const { slug, gen, tagged } = parseAvatarFile(f);
    const keep = allowed.has(slug) && (!tagged || gen === GEN_VERSION);
    if (keep) continue;
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
  MONO_COLORS,
  DEFAULT_PATTERN,
  sanitizeColor,
  sanitizeHue,
  sanitizePattern,
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
