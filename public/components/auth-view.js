// Simple username + password login/register screen.
Vue.component("auth-view", {
  props: {
    connectionStatus: { type: String, default: "connecting" },
  },
  data() {
    return {
      mode: "login", // login | register
      username: "",
      password: "",
      error: "",
      busy: false,
    };
  },
  computed: {
    connected() {
      return this.connectionStatus === "connected";
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
    toggleMode() {
      this.mode = this.mode === "login" ? "register" : "login";
      this.error = "";
    },
    showError(msg) {
      this.error = msg;
      this.busy = false;
    },
    reset() {
      this.error = "";
      this.busy = false;
    },
    submit() {
      if (!this.connected) {
        this.error = "Waiting for connection to the server.";
        return;
      }
      const u = this.username.trim();
      if (!u || !this.password) {
        this.error = "Please enter your username and password.";
        return;
      }
      this.error = "";
      this.busy = true;
      this.$emit("submit", {
        mode: this.mode,
        username: u,
        password: this.password,
      });
    },
  },
  template: `
    <div class="h-full flex items-center justify-center p-4">
      <div class="w-full max-w-sm rounded-2xl bg-white/80 shadow-xl p-6">
        <p
          class="mx-auto w-fit flex items-center gap-2 rounded-xl px-3 py-1 text-sm font-bold mb-3"
          :class="connectionBadgeClass"
        >
          <span class="size-2 rounded-full" :class="connectionDotClass"></span>
          {{ connectionStatusText }}
        </p>
        <p class="text-3xl text-center font-bold">Games Lobby</p>
        <p class="text-sm text-center text-slate-600 mt-1 mb-4">
          Log in or create an account to play
        </p>
        <div class="flex gap-1 mb-4">
          <button
            @click="mode='login'; error=''"
            :disabled="!connected"
            :class="mode === 'login' ? 'bg-orange-600 text-white' : 'bg-white/60 text-slate-700'"
            class="flex-1 rounded-xl py-2 text-sm font-bold"
          >Log in</button>
          <button
            @click="mode='register'; error=''"
            :disabled="!connected"
            :class="mode === 'register' ? 'bg-orange-600 text-white' : 'bg-white/60 text-slate-700'"
            class="flex-1 rounded-xl py-2 text-sm font-bold"
          >Register</button>
        </div>
        <label class="block text-sm font-bold text-slate-700 mb-1">Username</label>
        <input
          v-model="username"
          @keyup.enter="submit"
          type="text"
          placeholder="your name"
          :disabled="!connected"
          :class="connected ? '' : 'opacity-60'"
          class="w-full p-2 h-10 rounded-xl border border-white/40 bg-white/70 shadow mb-3"
        />
        <label class="block text-sm font-bold text-slate-700 mb-1">Password</label>
        <input
          v-model="password"
          @keyup.enter="submit"
          type="password"
          placeholder="••••••"
          :disabled="!connected"
          :class="connected ? '' : 'opacity-60'"
          class="w-full p-2 h-10 rounded-xl border border-white/40 bg-white/70 shadow mb-3"
        />
        <p v-if="error" class="text-sm text-center text-red-600 bg-red-100 rounded-xl py-1 mb-3">{{ error }}</p>
        <button
          @click="submit"
          :disabled="busy || !connected"
          class="w-full rounded-2xl py-2 bg-gradient-to-br from-yellow-400 to-orange-600 text-white font-bold shadow"
          :class="busy || !connected ? 'opacity-60' : ''"
        >{{ busy ? "Please wait..." : mode === "login" ? "Log in" : "Create account" }}</button>
        <p class="text-xs text-center text-slate-500 mt-3">
          {{ mode === "login" ? "First time here?" : "Already have an account?" }}
          <button @click="toggleMode" class="font-bold text-orange-600">
            {{ mode === "login" ? "Register" : "Log in" }}
          </button>
        </p>
      </div>
    </div>
  `,
});
