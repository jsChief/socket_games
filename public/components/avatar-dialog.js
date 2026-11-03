// Avatar Studio dialog.
//
// Full-screen modal for picking a seed color + pattern for the player's
// generated avatar. The preview is drawn client-side from the shared generator
// in avatar-core.js - the exact same file the server requires - so the pixels
// shown are always the pixels the server writes. Saving emits "set-avatar";
// main.js updates the profile from the "my-avatar" response.

const AvatarCore = window.AvatarCore;

// ---- Identicon renderer (delegates to the shared core) ----

// Draw the avatar for (name, color, pattern) into a canvas. `color` is a hue in
// degrees (number) or a named palette such as "black" / "neon". The canvas is
// drawn at whatever backing size it has, so a GRID-sized canvas reproduces the
// server sprite 1:1 and a 128px one is a 2x zoom of it.
function drawIdenticon(canvas, name, color, pattern) {
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!name) return;

  const { color: resolved, grid } = AvatarCore.generateGrid(name, { color, pattern });
  const pal = AvatarCore.paletteFor(resolved);
  const px = canvas.width / AvatarCore.GRID;

  for (let y = 0; y < AvatarCore.GRID; y++) {
    for (let x = 0; x < AvatarCore.GRID; x++) {
      const key = grid[y * AvatarCore.GRID + x];
      const c =
        key === "fg" ? pal.fg : key === "dark" ? pal.dark : key === "hl" ? pal.hl : pal.bg;
      ctx.fillStyle = "rgb(" + c.join(",") + ")";
      ctx.fillRect(x * px, y * px, px, px);
    }
  }
}

let __avatarName = "";
let __avatarColor = 200;
let __avatarPattern = AvatarCore.DEFAULT_PATTERN;
let __avatarDialogVm = null;

const __avatarPatterns = AvatarCore.PATTERN_LIST;
const __avatarSwatches = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];

Vue.component("avatar-dialog", {
  data() {
    return {
      open: false,
      color: 200,
      pattern: AvatarCore.DEFAULT_PATTERN,
      patternGroups: ["Classic", "Complex"],
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
    // Patterns bucketed by group so the picker stays readable with 20+ options.
    groupedPatterns() {
      return this.patternGroups
        .map((group) => ({
          group,
          items: __avatarPatterns.filter((p) => p.group === group),
        }))
        .filter((g) => g.items.length);
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
      __avatarPattern =
        (current && AvatarCore.sanitizePattern(current.pattern)) ||
        AvatarCore.DEFAULT_PATTERN;
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
            canvas.getAttribute("data-pattern") || AvatarCore.DEFAULT_PATTERN,
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
      this.pattern = __avatarPatterns[Math.floor(Math.random() * __avatarPatterns.length)].id;
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
                  <div class="absolute inset-0 bg-black/55" @click="close"></div>
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
                              <p class="mt-5 mb-2 text-sm font-black text-slate-700">Seed color <span v-if="color === 'black' || color === 'white'" class="ml-1 rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">{{ color === 'black' ? 'Black' : 'White' }}</span></p>
                              <input type="range" v-model.number="hueNum" min="0" max="359" step="1"
                                    class="w-full appearance-none rounded-full" style="height: 12px;"
                                    :style="'background: linear-gradient(90deg, ' + swatchStops(swatchColors()) + ')'"
                                    :class="{ 'opacity-80': color === 'black' || color === 'white' }" />
                              <div class="mt-3 flex justify-between gap-1">
                                    <button v-for="h in swatches" :key="h" @click="pickHue(h)"
                                          class="size-7 rounded-xl shadow-inner"
                                          :class="color === h ? 'ring-2 ring-slate-800 scale-110' : 'opacity-80 hover:opacity-100 hover:scale-105'"
                                          :style="'background: hsl(' + h + ', 82%, 46%)'"></button>
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

                              <!-- Pattern -->
                              <div v-for="g in groupedPatterns" :key="g.group" class="mt-5">
                                    <p class="mb-2 text-sm font-black text-slate-700">🧩 <span class="text-slate-400 text-xs uppercase tracking-wide">{{ g.group }}</span></p>
                                    <div class="grid grid-cols-4 gap-2">
                                      <button v-for="p in g.items" :key="p.id" @click="setPattern(p.id)"
                                            class="flex flex-col items-center gap-1 rounded-2xl border p-1.5 transition-colors"
                                            :class="pattern === p.id ? 'border-fuchsia-500 bg-fuchsia-100 ring-1 ring-fuchsia-400' : 'border-white/60 bg-white/50 hover:bg-white/70'">
                                            <canvas class="avatar-mini size-9" width="48" height="48"
                                                  :data-pattern="p.id"
                                                  style="image-rendering: pixelated"></canvas>
                                            <span class="text-[10px] font-black leading-tight" :class="pattern === p.id ? 'text-fuchsia-700' : 'text-slate-600'">{{ p.label }}</span>
                                      </button>
                                    </div>
                              </div>

                              <p class="mt-4 rounded-2xl bg-slate-100 px-3 py-2 text-center text-xs font-bold text-slate-500">
                                    🎲 Tap the dice to randomize color &amp; pattern (black &amp; white included)
                              </p>
                        </div>

                        <div class="flex gap-2 px-6 pb-6">
                              <button @click="close"
                                    class="btn-bubble rounded-2xl bg-slate-300 text-slate-700 px-2 py-1 md:px-5 md:py-3 text-base font-black">
                                    Cancel
                              </button>
                              <button @click="randomize" title="Randomize"
                                    class="btn-bubble rounded-2xl bg-white border-2 border-slate-200 px-2 py-1 md:px-3 md:py-3 text-lg font-black">
                                    🎲
                              </button>
                              <button @click="save"
                                    class="btn-bubble flex-1 rounded-2xl bg-gradient-to-br from-fuchsia-600 px-2 py-1 to-purple-700 md:px-5 md:py-3 text-base font-black text-white">
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
