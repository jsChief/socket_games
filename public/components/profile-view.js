Vue.component("profile-view", {
  props: {
    profile: { type: Object, default: null },
    myName: { type: String, default: "" },
  },
  data() {
    return {
      avatarBroken: false,
    };
  },
  computed: {
    avatarUrl() {
      return (this.profile && this.profile.avatarUrl) || "";
    },
    stats() {
      return (
        (this.profile && this.profile.stats) || {
          wins: 0,
          losses: 0,
          draws: 0,
          total: 0,
          winRate: 0,
        }
      );
    },
    username() {
      return this.profile ? this.profile.username : null;
    },
    isAccount() {
      return !!this.username;
    },
    initial() {
      return (this.myName || "guest").charAt(0).toUpperCase();
    },
    games() {
      return this.stats.total || 0;
    },
    winRatePct() {
      return Math.round((this.stats.winRate || 0) * 10) / 10;
    },
    winBarWidth() {
      return Math.min(100, this.stats.winRate || 0) + "%";
    },
    rank() {
      const w = this.stats.wins || 0;
      const l = this.stats.losses || 0;
      const total = this.games;
      if (total === 0)
        return {
          title: "New Player",
          emoji: "🐣",
          bar: "from-slate-400 to-slate-500",
          text: "Play your first match to start ranking up!",
        };
      if (total >= 15 && this.winRatePct >= 60)
        return {
          title: "Game Master",
          emoji: "👑",
          bar: "from-amber-400 to-yellow-500",
          text: "Phenomenal — everyone wants to play you.",
        };
      if (w >= 10)
        return {
          title: "Rising Star",
          emoji: "⭐",
          bar: "from-orange-400 to-rose-500",
          text: "You're climbing the ranks fast. Keep it up!",
        };
      if (l >= 10)
        return {
          title: "Tenacious",
          emoji: "🛡️",
          bar: "from-teal-400 to-cyan-500",
          text: "You never quit — those losses made you tougher.",
        };
      return {
        title: "Contender",
        emoji: "🎯",
        bar: "from-indigo-400 to-fuchsia-500",
        text: "You're getting in the zone. A few more wins and you'll level up!",
      };
    },
  },
  methods: {
    onAvatarError() {
      this.avatarBroken = true;
    },
    goBack() {
      this.$emit("close");
    },
  },
  watch: {
    myName() {
      this.avatarBroken = false;
    },
  },
  template: `
            <div class="overflow-y-auto h-full no-scrollbar">
                  <div class="mx-auto w-full max-w-4xl space-y-3 px-3 py-4">

                        <!-- Gradient header -->
                        <div class="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-500 via-fuchsia-500 to-rose-500 px-4 py-3 text-white shadow-[0_8px_0_rgba(0,0,0,0.18)]">
                              <div class="deco-circle -right-8 -top-12 size-32"></div>
                              <div class="deco-circle -bottom-12 left-10 size-24"></div>
                              <div class="relative z-10 flex items-center gap-2">
                                    <button @click="goBack" title="Back to lobby"
                                          class="btn-bubble grid size-10 shrink-0 place-items-center rounded-xl bg-white/25 text-lg font-black hover:bg-white/35">
                                          <i class="fa fa-caret-left"></i>
                                    </button>
                                    <h1 class="truncate text-xl font-black leading-none">My Profile</h1>
                              </div>
                        </div>

                        <!-- Identity card -->
                        <div class="rounded-3xl bg-white/60 p-5 text-center shadow-[0_6px_0_rgba(0,0,0,0.14)]">
                              <div class="relative mx-auto size-24 overflow-hidden rounded-3xl bg-white/70 shadow-lg">
                                    <img v-if="avatarUrl && !avatarBroken" :src="avatarUrl" alt=""
                                          class="size-full object-cover" @error="onAvatarError" />
                                    <div v-else class="grid size-full place-items-center text-4xl font-black text-slate-500">
                                          {{ initial }}
                                    </div>
                              </div>
                              <h2 class="mt-3 truncate text-2xl font-black">{{ myName || "guest" }}</h2>
                              
                              <div class="mt-1 w-fit items-center mx-auto gap-2 rounded-2xl px-3 py-1.5 text-xs text-white shadow"
                                    :class="'bg-gradient-to-r ' + rank.bar">
                                    <span class="tex">{{ rank.emoji }}</span> {{ rank.title }}
                              </div>
                              <button @click="$emit('open-avatar')" title="Change your avatar"
                                    class="btn-bubble mt-4 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-br from-fuchsia-600 to-purple-700 px-4 py-2 text-sm font-black text-white shadow-lg hover:scale-105 active:scale-95 transition-transform">
                                    🎨 Change avatar
                              </button>
                        </div>

                        <!-- Fun rank + win rate -->
                        <div class="rounded-3xl bg-white/60 p-4 shadow-[0_6px_0_rgba(0,0,0,0.14)]">
                              <div class="flex items-center justify-between gap-3">
                                    <p class="text-lg font-black">🏅 Win rate</p>
                                    <p class="text-sm font-black text-orange-600">{{ winRatePct }}%</p>
                              </div>
                              <div class="mt-3 h-4 w-full overflow-hidden rounded-full bg-white/60 shadow-inner">
                                    <div class="h-full rounded-full bg-gradient-to-r from-lime-400 to-green-500 transition-all duration-500"
                                          :style="'width: ' + winBarWidth"></div>
                              </div>
                              <p class="mt-2 text-xs font-bold text-slate-600">{{ rank.text }}</p>
                        </div>

                        <!-- Stats cards -->
                        <div class="grid grid-cols-2 gap-2">
                              <div class="rounded-3xl bg-gradient-to-br from-amber-500 to-yellow-600 p-4 text-white shadow-[0_5px_0_rgba(0,0,0,0.15)]">
                                    <p class="mt-1 font-black text-white/90">🎮 Games</p>
                                    <p class="text-3xl font-black leading-none tracking-wide">{{ games }}</p>
                              </div>
                              <div class="rounded-3xl bg-gradient-to-br from-lime-600 to-green-700 p-4 text-white shadow-[0_5px_0_rgba(0,0,0,0.15)]">
                                    <p class="mt-1 font-black text-white/90">🏆 Wins</p>
                                    <p class="text-3xl font-black leading-none tracking-wide">{{ stats.wins }}</p>
                              </div>
                              <div class="rounded-3xl bg-gradient-to-br from-rose-600 to-red-700 p-4 text-white shadow-[0_5px_0_rgba(0,0,0,0.15)]">
                                    <p class="mt-1 font-black text-white/90">💀 Losses</p>
                                    <p class="text-3xl font-black leading-none tracking-wide">{{ stats.losses }}</p>
                                    
                              </div>
                              <div class="rounded-3xl bg-gradient-to-br from-gray-500 to-gray-600 p-4 text-white shadow-[0_5px_0_rgba(0,0,0,0.15)]">
                                    <p class="mt-1 font-black text-white/90">🤝 Draws</p>
                                    <p class="text-3xl font-black leading-none tracking-wide">{{ stats.draws }}</p>
                              </div>
                        </div>

                        <p class="px-2 text-center text-xs font-bold text-slate-500">
                              Keep playing to level up your profile! Stats are saved on the server.
                        </p>

                        <div class="mt-3 h-24 md:hidden"></div>
                  </div>
            </div>
      `,
});
