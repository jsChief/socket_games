Vue.component("room-view", {
      props: {
            socketId: { type: String, default: "" },
      },
      data() {
            return {
                  room: null,
                  botDifficulty: "medium",
                  difficulties: [
                        { id: "easy", name: "😌 Easy" },
                        { id: "medium", name: "😐 Medium" },
                        { id: "hard", name: "😈 Hard" },
                  ],
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
                              status: "Available",
                              disabled: false,
                        },
                        {
                              id: "reversi",
                              icon: "⚫",
                              name: "Reversi",
                              desc: "Flip pieces to claim the most of the board.",
                              status: "Available",
                              disabled: false,
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
            hasBot() {
                  return this.players.some((p) => p && p.isBot);
            },
            botPlayer() {
                  return this.players.find((p) => p && p.isBot) || null;
            },
            botDifficultyName() {
                  if (!this.botPlayer || !this.botPlayer.difficulty) return "";
                  const d = this.difficulties.find(
                        (x) => x.id === this.botPlayer.difficulty,
                  );
                  return d ? d.name : this.botPlayer.difficulty;
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
                        showToast("Room code copied to clipboard", "success");
                  }
            },
      },
      template: `
            <div class="overflow-y-scroll h-full no-scrollbar">
                  <div class="flex-col items-center gap-2 p-2 bg-white/80 backdrop-blur rounded-2xl">
                        <p class="text-3xl py-2 font-bold bg-white/90 rounded-2xl flex-1 text-center">
                              Game Room
                        </p>
                        <div class="mt-2 flex items-center gap-2 justify-center"> Code: 
                              <p v-if="room" class="text-2xl font-black tracking-[0.4em] text-orange-600">{{ room.code }}</p>
                              <p v-else class="text-xl text-slate-400">...</p>
                              <button v-if="room" @click="copyCode" title="Copy invite"
                                    class="size-6 rounded-lg bg-orange-600 text-white shadow-xl text-sm">
                                    <span class="fas fa-copy"></span>
                              </button>
                        </div>
                  </div>

                  <div class="mt-4 rounded-2xl p-2 md:w-1/2 w-full bg-white/50 backdrop-blur shadow-xl">
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
                                    <span v-if="p.isBot" class="text-base">🤖</span>
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
                        <div v-if="openSeats > 0 && !hasBot" class="mt-2 flex flex-col items-start gap-1">
                              <div class="flex items-center gap-1 rounded-xl bg-white/40 p-1">
                                    <button v-for="d in difficulties" :key="d.id" @click="botDifficulty = d.id"
                                          :title="'Play against ' + d.id + ' AI'"
                                          class="px-2 py-1 rounded-lg text-xs font-bold transition-all duration-300"
                                          :class="botDifficulty === d.id ? 'bg-indigo-600 text-white shadow' : 'opacity-70 hover:opacity-100'">
                                          {{ d.name }}
                                    </button>
                              </div>
                              <button @click="$emit('add-bot', botDifficulty)"
                                    class="rounded-xl px-3 py-1.5 bg-indigo-600 text-white text-sm font-bold shadow-xl hover:scale-105 active:scale-95 transition-all">
                                    🤖 Add AI opponent
                              </button>
                        </div>
                        <div v-else-if="hasBot"
                              class="mt-2 flex items-center gap-2 text-sm bg-white/50 rounded-xl px-3 py-1.5">
                              <span class="font-bold">🤖 AI Bot is ready · {{ botDifficultyName }}</span>
                              <button @click="$emit('remove-bot')"
                                    class="text-red-600 font-bold text-xs underline">
                                    Remove AI
                              </button>
                        </div>
                        <p v-if="hasBot" class="text-xs text-slate-500 mt-1">
                              The AI automatically plays the game you pick.
                        </p>
                  </div>

                  <div v-if="readyToPlay" class="text-2xl rounded-xl mt-4 text-white bg-orange-600 p-2 w-fit font-bold text-center">
                        Pick a game
                  </div>
                  <p v-else class="mt-4 text-center text-sm text-slate-600 bg-white/50 rounded-xl py-2">
                        Waiting for player 2 to join before games can start...
                  </p>

                  <div class="mt-1 p-1 grid grid-cols-1 md:grid-cols-2 gap-3 rounded-xl h-45/100 overflow-y-scroll no-scrollbar">
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