Vue.component("room-view", {
      props: {
            socketId: { type: String, default: "" },
      },
      data() {
            return {
                  room: null,
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
            players() {
                  return this.room ? this.room.players : [];
            },
            openSeats() {
                  return this.room ? this.room.openSeats : 2;
            },
            readyToPlay() {
                  return this.openSeats === 0;
            },
            me() {
                  const me = this.players.find((p) => p.id === this.socketId);
                  return me || null;
            },
            myGame() {
                  return this.me ? this.me.game : null;
            },
      },
      methods: {
            setRoom(data) {
                  this.room = data;
            },
            reset() {
                  this.room = null;
            },
            myChoice(g) {
                  if (!this.readyToPlay || g.disabled) return "";
                  if (this.myGame === g.id) {
                        const other = this.players.find(
                              (p) => p.id !== this.socketId,
                        );
                        if (other && other.game === g.id) return "Game starting...";
                        return "Waiting for opponent...";
                  }
                  return "";
            },
            selectGame(g) {
                  if (g.disabled || !this.readyToPlay) return;
                  this.$emit("select-game", g);
                  showToast("Selected " + g.name, "success");
            },
            leaveRoom() {
                  this.$emit("leave-room");
            },
            copyCode() {
                  if (!this.room) return;
                  const text = "Join my game room with code " + this.room.code;
                  if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(text).then(() => {
                              showToast("Invite link copied!", "success");
                        });
                  } else {
                        showToast("Room code: " + this.room.code, "success");
                  }
            },
      },
      template: `
            <div class="overflow-y-scroll h-full no-scrollbar">
                  <div class="flex items-center gap-2 p-4">
                        <p class="text-3xl font-bold bg-white/90 backdrop-blur rounded-2xl flex-1 text-center">
                              Game Room
                        </p>
                  </div>

                  <div class="mx-auto w-fit max-w-sm rounded-2xl bg-white/70 backdrop-blur shadow-xl p-4 text-center">
                        <p class="text-xs uppercase tracking-widest text-slate-500">Room code</p>
                        <div class="mt-1 flex items-center gap-2 justify-center">
                              <p v-if="room" class="text-5xl font-black tracking-[0.4em] text-orange-600">{{ room.code }}</p>
                              <p v-else class="text-3xl text-slate-400">...</p>
                              <button v-if="room" @click="copyCode" title="Copy invite"
                                    class="size-10 rounded-2xl bg-orange-600 text-white shadow-xl text-lg">
                                    <span class="fas fa-copy"></span>
                              </button>
                        </div>
                        <p class="mt-1 text-sm text-slate-600">Share this code with a friend to play.</p>
                  </div>

                  <div class="mt-4 rounded-2xl p-2 w-full bg-white/50 backdrop-blur shadow-xl">
                        <p class="text-sm font-bold mb-1">
                              Players ({{ players.length }}/2)
                        </p>
                        <div class="flex flex-col gap-1">
                              <p v-if="players.length === 0" class="text-sm text-slate-500">
                                    No one here yet.
                              </p>
                              <div v-for="p in players" :key="p.id"
                                    class="flex items-center gap-2 text-sm bg-white/40 rounded-xl px-2 py-1">
                                    <span class="size-2 shrink-0 rounded-full"
                                          :class="p.online ? 'bg-green-500' : 'bg-red-400'"></span>
                                    <span class="font-bold">{{ p.name }}</span>
                                    <span v-if="p.symbol" class="text-xs text-orange-700">{{ p.symbol }}</span>
                                    <span v-if="p.id === socketId" class="text-xs text-slate-500 ml-auto">
                                          (you)
                                    </span>
                              </div>
                              <div v-for="n in openSeats" :key="'seat' + n"
                                    class="flex items-center gap-2 text-sm bg-white/20 rounded-xl px-2 py-1 text-slate-500">
                                    <span class="size-2 shrink-0 rounded-full bg-slate-300"></span>
                                    <span>Waiting for player {{ players.length + n }}...</span>
                              </div>
                        </div>
                  </div>

                  <div v-if="readyToPlay" class="text-2xl rounded-xl mt-4 text-white bg-orange-600 p-2 w-fit font-bold text-center">
                        Pick a game
                  </div>
                  <p v-else class="mt-4 text-center text-sm text-slate-600 bg-white/50 rounded-xl py-2">
                        Waiting for player 2 to join before games can start...
                  </p>

                  <div class="mt-1 p-1 grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl overflow-y-scroll no-scrollbar">
                        <div v-for="g in games" :key="g.id" @click="selectGame(g)"
                              :class="g.disabled || !readyToPlay ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:scale-[1.02] transition-transform active:scale-95'"
                              class="rounded-2xl bg-white/50 w-full backdrop-blur shadow-xl p-4">
                              <div class="text-xl font-bold">{{ g.icon }} {{ g.name }}</div>
                              <div class="text-sm text-slate-700 mt-1">{{ g.desc }}</div>
                              <div class="text-xs mt-2 w-fit px-2 py-0.5 rounded-xl"
                                    :class="g.disabled ? 'bg-yellow-500 text-yellow-100' : 'bg-green-600 text-white'">
                                    {{ g.status }}
                              </div>
                              <p v-if="myChoice(g)" class="text-xs mt-1 text-orange-600">
                                    {{ myChoice(g) }}
                              </p>
                        </div>
                        <div class="h-24"></div>
                  </div>

                  <div class="p-2 text-center">
                        <button @click="leaveRoom"
                              class="rounded-2xl px-6 py-2 bg-red-600 text-white font-bold shadow-xl">
                              Leave room
                        </button>
                  </div>
            </div>
      `,
});