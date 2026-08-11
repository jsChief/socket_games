Vue.component("lobby-view", {
      props: {
            myName: { type: String, default: "" },
            connectionStatus: { type: String, default: "connecting" },
            socketId: { type: String, default: "" },
      },
      data() {
            return {
                  onlinePlayers: [],
                  games: [
                        {
                              id: "tictactoe",
                              icon: "⭕",
                              name: "Tic Tac Toe",
                              desc: "Classic 2-player Xs and Os.",
                              status: "Available",
                              disabled: false,
                        },
                        {
                              id: "pizza",
                              icon: "🍕",
                              name: "Find My Pizza",
                              desc: "Hide 5 slices in your 20 cells, then hunt your opponent's!",
                              status: "Available",
                              disabled: false,
                        },
                        {
                              id: "checkers",
                              icon: "🎯",
                              name: "Checkers",
                              desc: "Coming soon.",
                              status: "Coming soon",
                              disabled: true,
                        },
                        {
                              id: "snake",
                              icon: "🐍",
                              name: "Snake",
                              desc: "Coming soon.",
                              status: "Coming soon",
                              disabled: true,
                        },
                        {
                              id: "memory",
                              icon: "🃏",
                              name: "Memory Match",
                              desc: "Coming soon.",
                              status: "Coming soon",
                              disabled: true,
                        },
                        {
                              id: "connect4",
                              icon: "🔴",
                              name: "Connect 4",
                              desc: "Drop discs and line up 4 in a row.",
                              status: "Coming soon",
                              disabled: true,
                        },
                        {
                              id: "battleship",
                              icon: "🚢",
                              name: "Battleship",
                              desc: "Hide your fleet and sink your opponent's ships.",
                              status: "Coming soon",
                              disabled: true,
                        },
                        {
                              id: "rps",
                              icon: "✊",
                              name: "Rock Paper Scissors",
                              desc: "Best of 3 classic showdown.",
                              status: "Coming soon",
                              disabled: true,
                        },
                        {
                              id: "reversi",
                              icon: "⚫",
                              name: "Reversi",
                              desc: "Flip pieces to claim the most of the board.",
                              status: "Coming soon",
                              disabled: true,
                        },
                  ],
            };
      },
      computed: {
            connectionStatusText() {
                  if (this.connectionStatus === "connected") return "Connected";
                  if (this.connectionStatus === "disconnected")
                        return "Disconnected";
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
                  if (this.connectionStatus === "connected")
                        return "bg-green-300";
                  if (this.connectionStatus === "disconnected")
                        return "bg-red-300";
                  return "bg-yellow-200 animate-pulse";
            },
      },
      methods: {
            setOnlinePlayers(list) {
                  this.onlinePlayers = Array.isArray(list) ? list : [];
            },
      },
      template: `
            <div class="overflow-y-scroll h-full no-scrollbar">
                  <p class="text-3xl p-4 rounded-2xl w-full text-center bg-white/90 backdrop-blur">
                        Games Lobby
                  </p>

                  <div class="flex flex-col items-center gap-1 rounded-2xl p-2 w-fit backdrop-blur shadow-xl">
                        <p class="px-2 py-1 text-sm rounded-2xl bg-white/50 flex items-center">
                              <span class="font-bold">{{ myName || "no name yet, set your name" }}</span>
                              <span class="ml-2 inline-flex items-center gap-1 rounded-xl px-2 py-0.5 text-sm align-middle"
                                    :class="connectionBadgeClass">
                                    <span class="size-2 rounded-full" :class="connectionDotClass"></span>
                                    {{ connectionStatusText }}
                              </span>
                        </p>
                  </div>

                  <div class="mt-5 rounded-2xl p-2 w-full bg-white/50 backdrop-blur shadow-xl max-h-20/100 overflow-y-scroll no-scrollbar">
                        <p class="text-sm font-bold mb-1">
                              Online Players ({{ onlinePlayers.length }})
                        </p>
                        <p v-if="onlinePlayers.length === 0" class="text-sm text-slate-500">
                              No one is online right now.
                        </p>
                        <div v-else class="flex flex-col gap-1 max-h-40 overflow-y-auto">
                              <div v-for="p in onlinePlayers" :key="p.id"
                                    class="flex items-center gap-2 text-sm bg-white/40 rounded-xl px-2 py-1">
                                    <span class="size-2 shrink-0 rounded-full bg-green-500"></span>
                                    <span class="font-bold">{{ p.name }}</span>
                                    <span class="text-xs text-slate-600">[{{ p.symbol }}]</span>
                                    <span v-if="p.id === socketId" class="text-xs text-slate-500 ml-auto">
                                          (you)
                                    </span>
                              </div>
                        </div>
                  </div>

                  <div class="text-2xl rounded-xl mt-4 text-white bg-orange-600 p-2 w-fit font-bold text-center">
                        Games
                  </div>

                  <div class="mt-1 p-1 grid grid-cols-1 sm:grid-cols-2 gap-3 h-60/100 rounded-xl overflow-y-scroll no-scrollbar">
                        <div v-for="g in games" :key="g.id" @click="!g.disabled && $emit('select-game', g)"
                              :class="g.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:scale-[1.02] transition-transform active:scale-95'"
                              class="rounded-2xl bg-white/50 w-full backdrop-blur shadow-xl p-4">
                              <div class="text-xl font-bold">{{ g.icon }} {{ g.name }}</div>
                              <div class="text-sm text-slate-700 mt-1">{{ g.desc }}</div>
                              <div class="text-xs mt-2 w-fit px-2 py-0.5 rounded-xl"
                                    :class="g.disabled ? 'bg-yellow-500 text-yellow-100' : 'bg-green-600 text-white'">
                                    {{ g.status }}
                              </div>
                        </div>
                        <div class="h-24"></div>
                  </div>
            </div>
      `,
});
