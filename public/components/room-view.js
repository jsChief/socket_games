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
                              accent: "from-rose-500 to-orange-400",
                        },
                        {
                              id: "pizza",
                              icon: "🍕",
                              name: "Find My Pizza",
                              desc: "Hide 5 slices in your 20 cells, then hunt your opponent's!",
                              status: "Available",
                              disabled: false,
                              accent: "from-amber-400 to-red-500",
                        },
                        {
                              id: "checkers",
                              icon: "🎯",
                              name: "Checkers",
                              desc: "Coming soon.",
                              status: "Coming soon",
                              disabled: true,
                              accent: "",
                        },
                        {
                              id: "snake",
                              icon: "🐍",
                              name: "Snake",
                              desc: "Coming soon.",
                              status: "Coming soon",
                              disabled: true,
                              accent: "",
                        },
                        {
                              id: "memory",
                              icon: "🃏",
                              name: "Memory Match",
                              desc: "Coming soon.",
                              status: "Coming soon",
                              disabled: true,
                              accent: "",
                        },
                        {
                              id: "connect4",
                              icon: "🔴",
                              name: "Connect 4",
                              desc: "Drop discs and line up 4 in a row.",
                              status: "Available",
                              disabled: false,
                              accent: "from-blue-500 to-cyan-400",
                        },
                        {
                              id: "battleship",
                              icon: "🚢",
                              name: "Battleship",
                              desc: "Hide your fleet and sink your opponent's ships.",
                              status: "Coming soon",
                              disabled: true,
                              accent: "",
                        },
                        {
                              id: "rps",
                              icon: "✊",
                              name: "Rock Paper Scissors",
                              desc: "Best of 3 classic showdown.",
                              status: "Available",
                              disabled: false,
                              accent: "from-purple-500 to-fuchsia-500",
                        },
                        {
                              id: "reversi",
                              icon: "⚫",
                              name: "Reversi",
                              desc: "Flip pieces to claim the most of the board.",
                              status: "Available",
                              disabled: false,
                              accent: "from-emerald-500 to-cyan-500",
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
            otherPlayer() {
                  return (
                        this.players.find((p) => p.id !== this.socketId) || null
                  );
            },
            otherPlayerName() {
                  return this.otherPlayer ? this.otherPlayer.name : "";
            },
            otherPlayerGame() {
                  return this.otherPlayer ? this.otherPlayer.game : null;
            },
            sortedGames() {
                  return this.games
                        .slice()
                        .sort((a, b) => (a.disabled === b.disabled ? 0 : a.disabled ? 1 : -1));
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
                  const prevOtherGame = this.otherPlayerGame;
                  this.room = data;
                  const newOtherGame = this.otherPlayerGame;
                  if (prevOtherGame !== newOtherGame && newOtherGame) {
                        const game = this.games.find(
                              (g) => g.id === newOtherGame,
                        );
                        showToast(
                              (this.otherPlayerName || "Your opponent") +
                                    " picked " +
                                    (game
                                          ? game.name + " " + game.icon
                                          : newOtherGame),
                              "turn",
                        );
                  }
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
            otherPicked(g) {
                  return !!(
                        this.otherPlayer && this.otherPlayer.game === g.id
                  );
            },
            otherChoice(g) {
                  if (!this.otherPlayer || this.otherPlayer.game !== g.id)
                        return "";
                  return this.otherPlayer.name + " picked this";
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
            difficultyName(id) {
                  const d = this.difficulties.find((x) => x.id === id);
                  return d ? d.name : id;
            },
      },
      template: `
            <div class="h-full overflow-y-auto no-scrollbar">
                  <!-- Sticky header zone -->
                  <div class="sticky top-0 z-[40] w-full bg-whie/60 px-3 pt-4 pb-2 shdow-[0_4px_16px_rgba(0,0,0,0.12)]">
                        <div class="mx-auto max-w-4xl">
                              <div class="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 px-5 py-4 text-white shadow-[0_8px_0_rgba(0,0,0,0.18)]">
                                    <div class="deco-circle -right-6 -top-10 size-32"></div>
                                    <div class="deco-circle -bottom-12 left-8 size-24"></div>
                                    <div class="relative z-10 lg:flex items-center place-content-between gap-3">
                                          <div class="flex items-center gap-3">
                                                <span class="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-white/25 text-4xl shadow-lg">🎮</span>
                                          <div class="min-w-0 flex-1">
                                                <h1 class="text-3xl font-black leading-none">Game Room</h1>
                                                <p class="mt-1 text-sm font-bold text-white/85">Invite a friend — share your room code!</p>
                                          </div>
                                          </div>
                                          <div class="shrink-0 text-center">
                                                <div class="rounded-2xl bg-white/25 px-4 py-1.5 shadow-sm">
                                                      <div class="text-xs font-black uppercase tracking-widest opacity-80">Code</div>
                                                      <div class="text-2xl font-black tracking-[0.35em]">{{ room ? room.code : '…' }}</div>
                                                </div>
                                                <button v-if="room" @click="copyCode" title="Copy invite"
                                                      class="btn-bubble mt-1.5 w-full rounded-2xl bg-white/25 px-3 py-1 text-xs font-black">
                                                      📋 Copy invite
                                                </button>
                                          </div>
                                    </div>
                              </div>
                        </div>
                  </div>

                  <!-- Scrollable content -->
                  <div class="mx-auto w-full max-w-4xl space-y-3 px-3 pb-4 pt-1">
                        <!-- Players + games -->
                        <div class="lg:flex lg:items-start lg:gap-3">
                              <!-- Players panel -->
                              <div class="lg:w-2/5 lg:shrink-0 rounded-3xl bg-white/60 p-4 shadow-[0_6px_0_rgba(0,0,0,0.14)]">
                                    <p class="mb-2 text-lg font-black">Players ({{ players.length }}/2)</p>
                                    <div class="flex flex-col gap-2">
                                          <p v-if="players.length === 0"
                                                class="rounded-2xl bg-white/40 px-4 py-3 text-sm font-bold text-slate-500">
                                                No one here yet.
                                          </p>
                                          <div v-for="p in players" :key="p.id"
                                                class="flex items-center gap-3 rounded-2xl bg-white/40 px-3 py-2 shadow-sm">
                                                <span class="size-3 shrink-0 rounded-full"
                                                      :class="p.online ? 'bg-green-500' : 'bg-red-400'"></span>
                                                <span v-if="p.isBot" class="text-xl">🤖</span>
                                                <span class="min-w-0 flex-1 truncate font-black">{{ p.name }}</span>
                                                <span v-if="p.symbol"
                                                      class="rounded-full bg-gradient-to-br from-orange-500 to-rose-500 px-2 py-0.5 text-xs font-black text-white">
                                                      {{ p.symbol }}
                                                </span>
                                                <span v-if="p.difficulty" class="text-xs font-bold text-slate-500">
                                                      {{ difficultyName(p.difficulty) }}
                                                </span>
                                                <span v-if="p.id === socketId" class="text-xs font-bold text-slate-400">(you)</span>
                                          </div>
                                          <div v-for="n in openSeats" :key="'seat' + n"
                                                class="flex items-center gap-3 rounded-2xl border-2 border-dashed border-white/50 px-3 py-2 text-sm font-bold text-slate-500">
                                                <span class="size-3 shrink-0 rounded-full bg-slate-300"></span>
                                                <span>Waiting for player {{ players.length + n }}...</span>
                                          </div>
                                    </div>

                                    <div v-if="openSeats > 0 && !hasBot" class="mt-3 space-y-2">
                                          <div class="flex items-center gap-1 rounded-2xl bg-white/40 p-1">
                                                <button v-for="d in difficulties" :key="d.id" @click="botDifficulty = d.id"
                                                      :title="'Play against ' + d.id + ' AI'"
                                                      class="flex-1 rounded-xl px-2 py-1.5 text-xs font-black transition-all duration-300"
                                                      :class="botDifficulty === d.id ? 'bg-indigo-600 text-white shadow' : 'opacity-60 hover:opacity-100'">
                                                      {{ d.name }}
                                                </button>
                                          </div>
                                          <button @click="$emit('add-bot', botDifficulty)"
                                                class="btn-bubble w-full rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 py-2.5 text-sm font-black text-white">
                                                🤖 Add AI opponent
                                          </button>
                                    </div>
                                    <div v-else-if="hasBot"
                                          class="mt-3 flex items-center gap-2 rounded-2xl bg-white/40 px-3 py-2 shadow-sm">
                                          <span class="min-w-0 flex-1 truncate text-sm font-black">🤖 AI Bot is ready · {{ botDifficultyName }}</span>
                                          <button @click="$emit('remove-bot')"
                                                class="btn-bubble rounded-xl bg-rose-400/90 px-3 py-1 text-xs font-black text-white">
                                                Remove AI
                                          </button>
                                    </div>
                                    <p v-if="hasBot" class="mt-1 text-xs font-bold text-slate-500">
                                          The AI automatically plays the game you pick.
                                    </p>

                                    <div class="mt-3 text-center">
                                          <button @click="leaveRoom"
                                                class="btn-bubble rounded-2xl bg-gradient-to-br from-rose-400 to-red-500 px-6 py-2.5 text-sm font-black text-white">
                                                <span class="fa fa-arrow-left"></span> Leave room
                                          </button>
                                    </div>
                              </div>

                              <!-- Games grid -->
                              <div class="mt-3 lg:mt-0 flex-1 rounded-3xl bg-white/60 p-4 shadow-[0_6px_0_rgba(0,0,0,0.14)]">
                                    <p class="mb-3 text-center text-3xl font-black">Games 🎮</p>
                                    <div v-if="readyToPlay"
                                          class="mb-3 rounded-2xl bg-gradient-to-br from-orange-500 to-rose-500 py-3 text-center text-xl font-black text-white shadow-[0_5px_0_rgba(0,0,0,0.18)]">
                                          👇 Pick a game
                                    </div>
                                    <div v-else
                                          class="mb-3 rounded-2xl bg-white/40 py-3 text-center text-sm font-bold text-slate-600 shadow-sm">
                                          ⏳ Waiting for player 2 to join before games can start...
                                    </div>
                                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                          <div v-for="g in sortedGames" :key="g.id" @click="selectGame(g)"
                                                :class="[g.disabled || !readyToPlay
                                                      ? 'opacity-55 cursor-not-allowed'
                                                      : 'cursor-pointer hover:-translate-y-0.5 active:scale-[0.98]',
                                                      otherPicked(g) ? 'ring-4 ring-indigo-400 border-indigo-300' : '']"
                                                class="rounded-3xl bg-white/50 p-3.5 shadow-[0_5px_0_rgba(0,0,0,0.12)] transition-all duration-200">
                                                <div class="flex items-center gap-3">
                                                      <span class="flex size-12 shrink-0 items-center justify-center rounded-2xl text-2xl shadow-lg"
                                                            :class="g.disabled ? 'bg-slate-200 text-slate-400' : 'bg-gradient-to-br text-white ' + g.accent">
                                                            {{ g.icon }}
                                                      </span>
                                                      <div class="min-w-0 flex-1">
                                                            <div class="truncate text-lg font-black">{{ g.name }}</div>
                                                            <div class="text-xs font-bold text-slate-600">{{ g.desc }}</div>
                                                      </div>
                                                </div>
                                                <div class="mt-2 flex items-center justify-between gap-2">
                                                      <span class="rounded-full px-3 py-0.5 text-xs font-black"
                                                            :class="g.disabled ? 'bg-slate-200 text-slate-500' : 'bg-green-500 text-white'">
                                                            {{ g.status }}
                                                      </span>
                                                      <span class="flex min-w-0 items-center gap-2">
                                                      <span v-if="otherChoice(g)"
                                                            class="truncate text-xs font-black text-indigo-600">
                                                            ⭐ {{ otherChoice(g) }}
                                                      </span>
                                                      <span v-if="myChoice(g)"
                                                            class="truncate text-xs font-black text-orange-600">
                                                            {{ myChoice(g) }}
                                                      </span>
                                                </span>
                                                </div>
                                          </div>
                                    </div>
                              </div>
                        </div>
                  </div>
            </div>
      `,
});