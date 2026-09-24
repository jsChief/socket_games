Vue.component("lobby-view", {
  props: {
    myName: { type: String, default: "" },
    connectionStatus: { type: String, default: "connecting" },
    socketId: { type: String, default: "" },
    theme: { type: String, default: "sunset" },
    mode: { type: String, default: "light" },
  },
  data() {
    return {
      onlinePlayers: [],
      joinCode: "",
      busy: false,
      themes: [
        {
          id: "sunset",
          name: "Sunset",
          emoji: "🌇",
          swatch: ["#fbbf24", "#f97316"],
        },
        {
          id: "midnight",
          name: "Midnight",
          emoji: "🌙",
          swatch: ["#8b5cf6", "#312e81"],
        },
        {
          id: "forest",
          name: "Forest",
          emoji: "🌲",
          swatch: ["#84cc16", "#15803d"],
        },
        {
          id: "ocean",
          name: "Ocean",
          emoji: "🌊",
          swatch: ["#22d3ee", "#0f766e"],
        },
      ],
      modes: [
        { id: "light", name: "Light", emoji: "☀️" },
        { id: "dark", name: "Dark", emoji: "🌙" },
      ],
    };
  },
  computed: {
    activeThemeName() {
      const t = this.themes.find((t) => t.id === this.theme);
      return t ? t.name : "Sunset";
    },
    connectionStatusText() {
      if (this.connectionStatus === "connected") return "Connected";
      if (this.connectionStatus === "disconnected") return "Disconnected";
      return "Connecting...";
    },
    connectionBadgeClass() {
      if (this.connectionStatus === "connected")
        return "bg-green-600/80 text-white";
      if (this.connectionStatus === "disconnected")
        return "bg-red-600/80 text-white";
      return "bg-yellow-500/80 text-white";
    },
    connectionDotClass() {
      if (this.connectionStatus === "connected") return "bg-green-300";
      if (this.connectionStatus === "disconnected") return "bg-red-300";
      return "bg-yellow-200 animate-pulse";
    },
    myAvatarUrl() {
      return avatarUrlFor(this.myName) || "";
    },
  },
  methods: {
    avatarOf(name) {
      return name ? avatarUrlFor(name) : "";
    },
    setOnlinePlayers(list) {
      this.onlinePlayers = Array.isArray(list) ? list : [];
    },
    createRoom() {
      if (this.busy) return;
      this.busy = true;
      socket.emit("create-room");
      setTimeout(() => {
        this.busy = false;
      }, 800);
    },
    joinRoom() {
      const code = this.joinCode.trim();
      if (!code) return;
      socket.emit("join-room", { code });
    },
    applyTheme(themeId) {
      this.$emit("theme-changed", themeId);
    },
    applyMode(mode) {
      this.$emit("mode-changed", mode);
    },
  },
  template: `
            <div class="overflow-y-auto h-full no-scrollbar">
                  <div class="mx-auto w-full max-w-4xl space-y-3 px-3 py-4">

                        <!-- Big gradient header -->
                        <div class="relative overflow-hidden rounded-3xl bg-gradient-to-br from-pink-500 to-orange-400 px-5 py-4 text-white shadow-[0_8px_0_rgba(0,0,0,0.18)]">
                              <div class="deco-circle -right-6 -top-10 size-32"></div>
                              <div class="deco-circle -bottom-12 left-8 size-24"></div>
                              <div class="relative z-10 flex items-center gap-3">
                                    <span class="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-white/25 text-4xl shadow-lg">🎮</span>
                                    <div class="min-w-0 flex-1">
                                          <h1 class="text-3xl font-black leading-none">Games Lobby</h1>
                                          <p class="mt-1 text-sm font-bold text-white/85">Pick a theme, then create or join a room!</p>
                                    </div>
                                    <div class="shrink-0 text-right">
                                          <div class="inline-flex max-w-full items-center gap-1.5 rounded-2xl bg-white/25 px-2 py-1 text-sm font-black shadow-sm">
                                                <img v-if="myAvatarUrl" :src="myAvatarUrl" alt="" class="lobby-avatar" />
                                                <span class="truncate inline-block max-w-28">{{ myName || "guest" }}</span>
                                          </div>
                                          <div class="mt-1.5 inline-flex items-center gap-1.5 rounded-xl px-2 py-0.5 text-xs font-black"
                                                :class="connectionBadgeClass">
                                                <span class="size-2 rounded-full" :class="connectionDotClass"></span>
                                                {{ connectionStatusText }}
                                          </div>
                                    </div>
                              </div>
                        </div>

                        <!-- Play + online cards -->
                        <div class="lg:grid lg:grid-cols-2 lg:items-start lg:gap-3">
                              <!-- Play with friends -->
                              <div class="rounded-3xl bg-white/60 p-4 shadow-[0_6px_0_rgba(0,0,0,0.14)]">
                                    <p class="mb-3 text-lg font-black">Play with friends 🎊</p>
                                    <button @click="createRoom"
                                          :disabled="busy || connectionStatus !== 'connected'"
                                          class="btn-bubble w-full rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 py-3 text-base font-black text-white"
                                          :class="busy || connectionStatus !== 'connected' ? 'opacity-60' : ''">
                                          ➕ Create room
                                    </button>
                                    <div class="mt-3 flex gap-2">
                                          <input v-model="joinCode" @keyup.enter="joinRoom" type="text"
                                                placeholder="Enter room code" maxlength="6"
                                                class="min-w-0 flex-1 rounded-2xl border border-white/40 bg-white/70 px-4 py-2 font-black uppercase tracking-widest shadow-sm focus:outline-none" />
                                          <button @click="joinRoom"
                                                class="btn-bubble rounded-2xl bg-gradient-to-br from-orange-500 to-rose-500 px-5 py-2 text-sm font-black text-white"
                                                :class="connectionStatus !== 'connected' ? 'opacity-60' : ''">
                                                Join
                                          </button>
                                    </div>
                                    <p class="mt-2 text-xs text-slate-600">
                                          Create a private room and share its 4-letter code, or join a friend's room.
                                    </p>
                              </div>

                              <!-- Online players -->
                              <div class="mt-3 lg:mt-0 rounded-3xl bg-white/60 p-4 shadow-[0_6px_0_rgba(0,0,0,0.14)]">
                                    <p class="mb-2 text-lg font-black">Online ({{ onlinePlayers.length }})</p>
                                    <p v-if="onlinePlayers.length === 0" class="text-sm text-slate-500">
                                          No one is online right now.
                                    </p>
                                    <div v-else class="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
<div v-for="p in onlinePlayers" :key="p.id"
                                                  class="flex items-center gap-2 rounded-2xl bg-white/40 px-3 py-2 text-sm shadow-sm">
                                                <span class="size-2.5 shrink-0 rounded-full bg-green-500"></span>
                                                <img v-if="p.avatarUrl" :src="p.avatarUrl" alt="" class="lobby-avatar" />
                                                <span class="font-black">{{ p.name }}</span>
                                                <span v-if="p.roomCode" class="ml-auto text-xs font-bold text-orange-700">room {{ p.roomCode }}</span>
                                                <span v-else-if="p.id === socketId" class="ml-auto text-xs font-bold text-slate-500">
                                                      (you)
                                                </span>
                                          </div>
                                    </div>
                              </div>
                        </div>

                        <!-- Theme + mode picker -->
                        <div class="rounded-3xl bg-white/60 p-4 shadow-[0_6px_0_rgba(0,0,0,0.14)]">
                              <div class="flex items-center justify-between gap-3">
                                    <p class="text-lg font-black">🎨 Theme</p>
                                    <p class="text-xs font-black text-orange-600">{{ activeThemeName }}</p>
                              </div>
                              <div class="mt-4 flex gap-2 place-content-around">
                                    <button v-for="t in themes" :key="t.id" @click="applyTheme(t.id)"
                                          :title="t.name"
                                          class="size-12 rounded-2xl flex items-center justify-center text-xl shadow-inner transition-all duration-300"
                                          :class="theme === t.id ? 'ring-4 ring-white scale-110 shadow-lg' : 'opacity-70 hover:opacity-100 hover:scale-105'"
                                          :style="'background: linear-gradient(135deg, ' + t.swatch[0] + ', ' + t.swatch[1] + ')'">
                                          <span>{{ t.emoji }}</span>
                                    </button>
                              </div>
                              <div class="mt-4 flex items-center gap-2">
                                    <p class="text-xs font-black text-slate-600">Mode</p>
                                    <div class="flex rounded-2xl bg-white/40 p-1 gap-1">
                                          <button v-for="m in modes" :key="m.id" @click="applyMode(m.id)"
                                                class="px-3 py-1.5 rounded-xl text-sm font-black transition-all duration-300"
                                                :class="mode === m.id ? 'bg-orange-600 text-white shadow' : 'opacity-70 hover:opacity-100'">
                                                <span>{{ m.emoji }} {{ m.name }}</span>
                                          </button>
                                    </div>
                              </div>
                              <p class="mt-3 text-xs text-slate-500">
                                    Your theme and light/dark mode are saved on this device.
                              </p>
                        </div>
                  </div>
            </div>
      `,
});