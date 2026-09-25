// Avatar Studio dialog.
//
// Full-screen modal for picking a seed color + pattern for the player's
// generated avatar. The preview is drawn client-side by mirroring the exact
// generator in lib/avatars.js (fnv1a + mulberry32 + buildIdenticon), so the
// pixels shown are the same as the PNG the server writes. Saving emits
// "set-avatar"; main.js updates the profile from the "my-avatar" response.

// ---- Identicon renderer (must mirror lib/avatars.js) ----

// var __GRID = 8;
// var __HALF = 4;
var __GRID = 16;
var __HALF = __GRID / 2;

function __fnv1a(str) {
  var hash = 0x811c9dc5;
  for (var i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function __mulberry32(seed) {
  var s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    var t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function __seedRng(seedStr) {
  return __mulberry32(__fnv1a(seedStr));
}

function sanitizeColor(value) {
  if (MONO_COLORS.indexOf(value) !== -1) return value;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return ((n % 360) + 360) % 360;
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

// Resolve the 4-color palette from a color (hue degrees or mono "black"/"white").
// Mirrors lib/avatars.js paletteFor().
// function __paletteFor(color) {
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
//   var hueFrac = (((color % 360) + 360) % 360) / 360;
//   return {
//     fg: __hslToRgb(hueFrac, 0.62, 0.46),
//     dark: __hslToRgb((hueFrac + 0.015) % 1, 0.55, 0.28),
//     hl: __hslToRgb((hueFrac + 0.02) % 1, 0.55, 0.68),
//     bg: __hslToRgb(hueFrac, 0.45, 0.93),
//   };
// }
// Named palettes supported in addition to single hue angles
const MONO_COLORS = [
  "black",
  "white",
  "cyberpunk",
  "sunset",
  "neon",
  "emerald",
];

function __paletteFor(color) {
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

function __slugify(name) {
  var slug = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "guest";
}

// Builds the GRID x GRID key grid ("fg" | "dark" | "hl" | null) exactly like
// the server's buildIdenticon.
function __buildIdenticon(seedStr, hue, pattern) {
  var rand = __seedRng(seedStr);
  function keyAt(x, y) {
    if (pattern === "circle") {
  const dx = x - (__GRID - 1) / 2;
  const dy = y - (__GRID - 1) / 2;
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
        var v = rand();
        return v < 0.55 ? "fg" : v < 0.8 ? "dark" : "hl";
      }
      return null;
    }
    if (pattern === "stripes") {
      var d = Math.min(
        x + y,
        __GRID - 1 - x + y,
        x + __GRID - 1 - y,
        __GRID - 1 - x + __GRID - 1 - y,
      );
      var band = d % 3;
      return band === 0 ? "fg" : band === 1 ? "hl" : null;
    }
    if (pattern === "rings") {
      var k = Math.floor(
        Math.max(
          Math.abs(x - (__GRID - 1) / 2),
          Math.abs(y - (__GRID - 1) / 2),
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
      var center =
        Math.abs(x - (__GRID - 1) / 2) < 1 ||
        Math.abs(y - (__GRID - 1) / 2) < 1;
      if (center) {
        var v = rand();
        return v < 0.6 ? "fg" : v < 0.85 ? "dark" : "hl";
      }
      return null;
    }
    if (pattern === "dots") {
      var v = rand();
      return v < 0.2 ? "fg" : v < 0.28 ? "dark" : v < 0.34 ? "hl" : null;
    }
    if (pattern === "face") {
      // Cute face: rounded head in fg, dark eyes + smile, light blush.
      if (y === 0 || y === 7) return x === 0 ? null : "fg";
      if (y === 2 || y === 3) return x === 2 ? "dark" : "fg";
      if (y === 5) return x === 1 ? "hl" : x === 2 || x === 3 ? "dark" : "fg";
      return "fg";
    }
    // "random"
    var v = rand();
    return v < 0.38 ? "fg" : v < 0.43 ? "dark" : v < 0.48 ? "hl" : null;
  }

  var grid = new Array(__GRID * __GRID).fill(null);
  for (var y = 0; y < __GRID; y++) {
    for (var x = 0; x < __GRID; x++) {
      var cx = x < __HALF ? x : __GRID - 1 - x;
      grid[y * __GRID + x] = keyAt(cx, y);
    }
  }
  return grid;
}

// Draw the avatar for (name, color, pattern) into a canvas. `color` is a hue in
// degrees (number) or "black"/"white". Canvas should be GRID * px cells wide;
// matching grid 8x8 with px-sized cells reproduces the server's 8x scaled
// 64x64 PNG.
function drawIdenticon(canvas, name, color, pattern) {
  if (!canvas || !canvas.getContext) return;
  var gridSize = __GRID;
  var px = canvas.width / gridSize;
  var ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!name) return;

  var colorStr =
    typeof color === "number"
      ? Math.round(color) % 360
      : color === "black" || color === "white"
        ? color
        : 200;
  var seed = String(name) + "|" + colorStr + "|" + (pattern || "random");
  var pal = __paletteFor(colorStr);

  var grid = __buildIdenticon(seed, colorStr, pattern || "random");
  function fill(cell, x, y) {
    var c =
      cell === "fg"
        ? pal.fg
        : cell === "dark"
          ? pal.dark
          : cell === "hl"
            ? pal.hl
            : pal.bg;
    ctx.fillStyle = "rgb(" + c.join(",") + ")";
    ctx.fillRect(x * px, y * px, px, px);
  }
  for (var y = 0; y < gridSize; y++) {
    for (var x = 0; x < gridSize; x++) {
      fill(grid[y * gridSize + x], x, y);
    }
  }
}

var __avatarName = "";
var __avatarColor = 200;
var __avatarPattern = "random";
var __avatarDialogVm = null;

var __avatarPatterns = [
  { id: "random", label: "Mix" },
  { id: "checker", label: "Checker" },
  { id: "stripes", label: "Stripes" },
  { id: "rings", label: "Rings" },
  { id: "dots", label: "Dots" },
  //{ id: "cross", label: "Cross" },
  { id: "face", label: "Face" },
  { id: "diamond", label: "Diamond" },
  //{ id: "grid", label: "Grid" },
  //{ id: "heart", label: "Heart" },
  { id: "circle", label: "Circle" },
];

var __avatarSwatches = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];

Vue.component("avatar-dialog", {
  data() {
    return {
      open: false,
      color: 200,
      pattern: "random",
      patternList: __avatarPatterns,
      swatches: __avatarSwatches,
    };
  },
  computed: {
    name() {
      return __avatarName;
    },
    hueNum: {
      get() {
        return typeof this.color === "number" ? this.color : 200;
      },
      set(v) {
        this.color = v;
      },
    },
  },
  mounted() {
    __avatarDialogVm = this;
    this.$nextTick(this.render);
  },
  beforeDestroy() {
    if (__avatarDialogVm === this) __avatarDialogVm = null;
  },
  watch: {
    open(open) {
      if (open) {
        this.color = __avatarColor;
        this.pattern = __avatarPattern;
        window.addEventListener("keydown", this.onKey);
        this.$nextTick(() => {
          this.render();
          this.renderMini();
        });
      } else {
        window.removeEventListener("keydown", this.onKey);
      }
    },
    color() {
      this.render();
      this.renderMini();
    },
    pattern() {
      this.render();
      this.renderMini();
    },
  },
  methods: {
    show(name, current) {
      __avatarName = name || "";
      __avatarColor =
        current && current.color !== undefined && current.color !== null
          ? current.color
          : current && typeof current.hue === "number"
            ? current.hue
            : 200;
      __avatarPattern = current && current.pattern ? current.pattern : "random";
      this.open = true;
    },
    close() {
      this.open = false;
    },
    onKey(ev) {
      if (ev.key === "Escape") this.close();
    },
    render() {
      this.$nextTick(() => {
        const c = this.$refs.preview;
        if (c) drawIdenticon(c, this.name, this.color, this.pattern);
      });
    },
    renderMini() {
      this.$nextTick(() => {
        const canvases = this.$el.querySelectorAll("canvas.avatar-mini");
        for (const canvas of canvases) {
          drawIdenticon(
            canvas,
            this.name,
            this.color,
            canvas.getAttribute("data-pattern") || "random",
          );
        }
      });
    },
    pickHue(h) {
      this.color = h;
    },
    swatchColors() {
      return this.swatches.map((h) => "hsl(" + h + ", 62%, 46%)");
    },
    swatchStops(colors) {
      const stops = [];
      for (let i = 0; i < colors.length; i++) {
        const pct = (i / (colors.length - 1)) * 100;
        stops.push(colors[i] + " " + pct + "%");
      }
      return stops.join(", ");
    },
    randomize() {
      this.color =
        Math.random() < 0.12
          ? Math.random() < 0.5
            ? "black"
            : "white"
          : Math.floor(Math.random() * 360);
      this.pattern =
        __avatarPatterns[
          Math.floor(Math.random() * __avatarPatterns.length)
        ].id;
    },
    setPattern(p) {
      this.pattern = p;
    },
    save() {
      socket.emit("set-avatar", {
        color:
          typeof this.color === "number"
            ? Math.round(this.color) % 360
            : this.color,
        pattern: this.pattern,
      });
      this.close();
    },
  },
  template: `
            <div v-if="open" class="fixed inset-0 z-[95] flex items-center justify-center p-4">
                  <div class="absolute inset-0 bg-black/55 backdrop-blur-sm" @click="close"></div>
                  <div class="howto-pop relative w-full max-w-md overflow-hidden rounded-3xl bg-white/95 shadow-2xl">
                        <div class="relative overflow-hidden bg-gradient-to-br from-fuchsia-600 to-purple-700 px-6 py-4 text-white">
                              <div class="deco-circle -right-6 -top-8 size-28"></div>
                              <div class="deco-circle -bottom-10 left-6 size-24"></div>
                              <div class="relative z-10 flex items-center gap-3">
                                    <span class="flex size-12 shrink-0 items-center justify-center rounded-xl bg-white/25 text-2xl shadow-lg">🎨</span>
                                    <div class="min-w-0">
                                          <h2 class="text-2xl font-black leading-none">Avatar Studio</h2>
                                          <p class="mt-1 text-sm font-bold text-white/85">Pick a seed color &amp; pattern</p>
                                    </div>
                              </div>
                        </div>

                        <div class="max-h-[70vh] overflow-y-auto no-scrollbar px-6 py-5">
                              <!-- Live preview -->
                              <div class="text-center">
                                    <canvas ref="preview" width="128" height="128"
                                          class="mx-auto size-28 rounded-2xl shadow-inner"
                                          style="image-rendering: pixelated; background: #fff"></canvas>
                                    <p class="mt-2 text-xs font-bold text-slate-500">
                                          Live preview for <span class="text-slate-800">{{ name || "guest" }}</span>
                                    </p>
                              </div>

                              <!-- Seed color -->
                              <p class="mt-5 mb-2 text-sm font-black text-slate-700">🌈 Seed color <span v-if="color === 'black' || color === 'white'" class="ml-1 rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">{{ color === 'black' ? 'Black' : 'White' }}</span></p>
                              <input type="range" v-model.number="hueNum" min="0" max="359" step="1"
                                    class="w-full appearance-none rounded-full" style="height: 12px;"
                                    :style="'background: linear-gradient(90deg, ' + swatchStops(swatchColors()) + ')'"
                                    :class="{ 'opacity-40': color === 'black' || color === 'white' }" />
                              <div class="mt-3 flex justify-between gap-1">
                                    <button v-for="h in swatches" :key="h" @click="pickHue(h)"
                                          class="size-7 rounded-xl shadow-inner"
                                          :class="color === h ? 'ring-2 ring-slate-800 scale-110' : 'opacity-80 hover:opacity-100 hover:scale-105'"
                                          :style="'background: hsl(' + h + ', 62%, 46%)'"></button>
                              </div>
                              <div class="mt-3 flex items-center gap-2">
                                    <button @click="color = 'black'" title="Black &amp; white avatar"
                                          class="size-7 rounded-xl shadow-inner"
                                          :class="color === 'black' ? 'ring-2 ring-slate-800 scale-110' : 'opacity-80 hover:opacity-100 hover:scale-105'"
                                          style="background: #171a22"></button>
                                    <button @click="color = 'white'" title="White avatar"
                                          class="size-7 rounded-xl shadow-inner border border-slate-300"
                                          :class="color === 'white' ? 'ring-2 ring-slate-800 scale-110' : 'opacity-80 hover:opacity-100 hover:scale-105'"
                                          style="background: #ffffff"></button>
                                    <span class="ml-1 text-xs font-black text-slate-400">or black &amp; white</span>
                              </div>

                              <!--<div class="mt-3 flex flex-wrap items-center gap-2">
                                <button @click="color = 'cyberpunk'" class="px-2 py-1 text-xs rounded-lg font-bold bg-pink-600 text-cyan-300">Cyberpunk</button>
                                <button @click="color = 'sunset'" class="px-2 py-1 text-xs rounded-lg font-bold bg-amber-500 text-slate-900">Sunset</button>
                                <button @click="color = 'neon'" class="px-2 py-1 text-xs rounded-lg font-bold bg-green-500 text-black">Neon</button>
                                <button @click="color = 'emerald'" class="px-2 py-1 text-xs rounded-lg font-bold bg-emerald-600 text-white">Emerald</button>
                              </div>-->

                              <!-- Pattern -->
                              <p class="mt-5 mb-2 text-sm font-black text-slate-700">🧩 Pattern</p>
                              <div class="grid grid-cols-3 gap-2">
                                    <button v-for="p in patternList" :key="p.id" @click="setPattern(p.id)"
                                          class="flex flex-col items-center gap-1 rounded-2xl border p-2 transition-colors"
                                          :class="pattern === p.id ? 'border-fuchsia-500 bg-fuchsia-100 ring-1 ring-fuchsia-400' : 'border-white/60 bg-white/50 hover:bg-white/70'">
                                          <canvas class="avatar-mini size-10" width="48" height="48"
                                                :data-pattern="p.id"
                                                style="image-rendering: pixelated"></canvas>
                                          <span class="text-xs font-black" :class="pattern === p.id ? 'text-fuchsia-700' : 'text-slate-600'">{{ p.label }}</span>
                                    </button>
                              </div>

                              <p class="mt-4 rounded-2xl bg-slate-100 px-3 py-2 text-center text-xs font-bold text-slate-500">
                                    🎲 Tap the dice to randomize color &amp; pattern (black &amp; white included)
                              </p>
                        </div>

                        <div class="flex gap-2 px-6 pb-6">
                              <button @click="close"
                                    class="btn-bubble rounded-2xl bg-slate-300 text-slate-700 px-5 py-3 text-base font-black">
                                    Cancel
                              </button>
                              <button @click="randomize" title="Randomize"
                                    class="btn-bubble rounded-2xl bg-white border-2 border-slate-200 px-3 py-3 text-lg font-black">
                                    🎲
                              </button>
                              <button @click="save"
                                    class="btn-bubble flex-1 rounded-2xl bg-gradient-to-br from-fuchsia-600 to-purple-700 px-5 py-3 text-base font-black text-white">
                                    Save avatar
                              </button>
                        </div>
                  </div>
            </div>
      `,
});

// Show the Avatar Studio with the player's current settings (if known).
function showAvatarDialog(name, current) {
  if (__avatarDialogVm) {
    __avatarDialogVm.show(name, current);
  }
}
