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
            { id: "sunset", name: "Sunset", emoji: "🌇", swatch: ["#fbbf24", "#f97316"] },
            { id: "midnight", name: "Midnight", emoji: "🌙", swatch: ["#8b5cf6", "#312e81"] },
            { id: "forest", name: "Forest", emoji: "🌲", swatch: ["#84cc16", "#15803d"] },
            { id: "ocean", name: "Ocean", emoji: "🌊", swatch: ["#22d3ee", "#0f766e"] },
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
  },
  methods: {
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
            <div class="overflow-y-scroll h-full no-scrollbar">
                  <div class="p-2 backdrop-blur rounded-br-2xl">
                        <p class="text-3xl p-4 rounded-2xl w-full text-center bg-white/90 backdrop-blur">
                        Games Lobby
                        </p>
                  </div>

                  <div class="flex flex-col items-center gap-1 rounded-b-2xl p-2 w-fit backdrop-blur">
                        <p class="px-2 py-1 text-sm rounded-2xl bg-white/50 flex items-center">
                              <span class="font-bold">{{ myName || "no name yet, set your name" }}</span>
                              <span class="ml-2 inline-flex items-center gap-1 rounded-xl px-2 py-0.5 text-sm align-middle"
                                    :class="connectionBadgeClass">
                                    <span class="size-2 rounded-full" :class="connectionDotClass"></span>
                                    {{ connectionStatusText }}
                              </span>
                        </p>
                  </div>

                  <div class="md:flex md:place-content-between w-full h-fit">
                        <div class="mt-5 rounded-2xl p-2 w-full md:w-45/100 bg-white/50 backdrop-blur shadow-xl max-h-20/100 overflow-y-scroll no-scrollbar">
                        <p class="text-sm font-bold mb-1">
                              Online ({{ onlinePlayers.length }})
                        </p>
                        <p v-if="onlinePlayers.length === 0" class="text-sm text-slate-500">
                              No one is online right now.
                        </p>
                        <div v-else class="flex flex-col gap-1 max-h-40 overflow-y-auto">
                              <div v-for="p in onlinePlayers" :key="p.id"
                                    class="flex items-center gap-2 text-sm bg-white/40 rounded-xl px-2 py-1">
                                    <span class="size-2 shrink-0 rounded-full bg-green-500"></span>
                                    <span class="font-bold">{{ p.name }}</span>
                                    <span v-if="p.roomCode" class="text-xs text-orange-700 ml-auto">room {{ p.roomCode }}</span>
                                    <span v-else-if="p.id === socketId" class="text-xs text-slate-500 ml-auto">
                                          (you)
                                    </span>
                              </div>
                        </div>
                  </div>

                  <div class="mt-3 rounded-2xl p-3 w-full md:w-45/100 bg-white/50 backdrop-blur shadow-xl">
                        <p class="text-sm font-bold">Play with friends</p>
                        <div class="mt-2 flex gap-2">
                              <button @click="createRoom" :disabled="busy || connectionStatus !== 'connected'"
                                    class="flex-1 rounded-2xl py-2 bg-gradient-to-br from-yellow-400 to-orange-600 text-white font-bold shadow"
                                    :class="busy || connectionStatus !== 'connected' ? 'opacity-60' : ''">
                                    Create room
                              </button>
                        </div>
                        <div class="mt-2 flex gap-2">
                              <input v-model="joinCode" @keyup.enter="joinRoom" type="text" placeholder="Enter room code"
                                    class="flex-1 p-2 h-10 rounded-2xl border border-white/40 bg-white/70 shadow uppercase tracking-widest"
                                    maxlength="6" />
                              <button @click="joinRoom"
                                    class="rounded-2xl px-4 py-2 bg-orange-600 text-white font-bold shadow"
                                    :class="connectionStatus !== 'connected' ? 'opacity-60' : ''">
                                    Join
                              </button>
                        </div>
                        <p class="mt-2 text-xs text-slate-600">
                              Create a private room and share its 4-letter code, or join a friend's room.
                        </p>
                  </div>
                  
                  </div>

                  <!-- Theme picker -->
                  <div class="mt-3 rounded-2xl p-3 w-full md:w-fit bg-white/50 backdrop-blur shadow-xl">
                        <div class="flex items-center justify-between gap-3 px-1">
                              <p class="text-sm font-bold">🎨 Theme</p>
                              <p class="text-xs font-bold text-orange-600">{{ activeThemeName }}</p>
                        </div>
                        <div class="mt-2 flex gap-2">
                              <button v-for="t in themes" :key="t.id" @click="applyTheme(t.id)"
                                    :title="t.name"
                                    class="size-12 rounded-2xl flex items-center justify-center text-xl shadow-inner transition-all duration-300"
                                    :class="theme === t.id ? 'ring-4 ring-white scale-110 shadow-lg' : 'opacity-70 hover:opacity-100 hover:scale-105'"
                                    :style="'background: linear-gradient(135deg, ' + t.swatch[0] + ', ' + t.swatch[1] + ')'">
                                    <span>{{ t.emoji }}</span>
                              </button>
                        </div>
                        <div class="mt-3 flex items-center gap-2">
                              <p class="text-xs font-bold text-slate-600">Mode</p>
                              <div class="flex rounded-2xl bg-white/40 p-1 gap-1">
                                    <button v-for="m in modes" :key="m.id" @click="applyMode(m.id)"
                                          class="px-3 py-1.5 rounded-xl text-sm font-bold transition-all duration-300"
                                          :class="mode === m.id ? 'bg-orange-600 text-white shadow' : 'opacity-70 hover:opacity-100'">
                                          <span>{{ m.emoji }} {{ m.name }}</span>
                                    </button>
                              </div>
                        </div>
                        <p class="mt-2 text-[11px] text-slate-500">
                              Your theme and light/dark mode are saved on this device.
                        </p>
                  </div>

                  
<!--
                  <div class="mt-4 text-2xl rounded-xl text-white bg-orange-600 p-2 w-fit font-bold text-center">
                        Games
                  </div>
                  <p class="mt-1 text-center text-sm text-slate-600 bg-white/50 rounded-xl py-2">
                        Join or create a room to start a game with a friend.
                  </p>
                  <p class="mt-2 text-center text-xs text-slate-500">
                        Tic Tac Toe · Find My Pizza — more on the way!
                  </p> -->

                  <div class="h-24"></div>
            </div>
      `,
});
