Vue.component("tictactoe-view", {
      data() {
            return {
                  cells: Array(9).fill(""),
                  myTurn: false,
                  mySymbol: "",
                  opponentName: "",
                  opponentSymbol: "",
                  gameOver: false,
                  result: null,
                  winCells: [],
                  animIndex: null,
                  animTimer: null,
                  resetPending: false,
                  resetFromName: "",
            };
      },
      computed: {
            meCardClass() {
                  if (this.gameOver) return "bg-slate-700/80 text-white";
                  if (this.myTurn)
                        return "bg-gradient-to-br from-green-400 to-emerald-500 text-white ring-4 ring-yellow-300 scale-[1.03] animate-pulse";
                  return "bg-white/60 text-slate-800";
            },
            opponentCardClass() {
                  if (this.gameOver) return "bg-slate-700/80 text-white";
                  if (!this.myTurn && this.opponentName)
                        return "bg-gradient-to-br from-orange-400 to-rose-500 text-white ring-4 ring-yellow-300 scale-[1.03] animate-pulse";
                  return "bg-white/60 text-slate-800";
            },
            turnText() {
                  if (this.gameOver) return "Game over";
                  if (this.myTurn) return "It's your turn!";
                  return this.opponentName
                        ? this.opponentName + "'s turn..."
                        : "Waiting for opponent...";
            },
            turnTextClass() {
                  if (this.gameOver) return "text-slate-800";
                  if (this.myTurn) return "text-green-700";
                  return "text-orange-600";
            },
            resultBannerClass() {
                  if (!this.result) return "";
                  if (this.result.type === "win")
                        return "bg-gradient-to-br from-green-400 to-emerald-600";
                  if (this.result.type === "lose")
                        return "bg-gradient-to-br from-rose-400 to-red-600";
                  return "bg-gradient-to-br from-slate-500 to-slate-700";
            },
      },
      methods: {
            play(index) {
                  if (!this.myTurn || this.gameOver) return;
                  if (this.cells[index] !== "") return;
                  this.$set(this.cells, index, this.mySymbol);
                  this.animateCell(index);
                  socket.emit("btn-pos", { index, symbol: this.mySymbol });
                  playSound(moveSound);
                  this.myTurn = false;
            },
            animateCell(i) {
                  this.animIndex = i;
                  clearTimeout(this.animTimer);
                  this.animTimer = setTimeout(() => {
                        this.animIndex = null;
                  }, 400);
            },
            display(s) {
                  return s ? s.toUpperCase() : "";
            },
            setOpponent(data) {
                  this.opponentName = data.name || "";
                  this.opponentSymbol = data.symbol || "";
                  this.resetView();
            },
            setTurn(data) {
                  this.mySymbol = data.symbol;
                  this.myTurn = true;
                  this.gameOver = false;
                  this.result = null;
                  this.winCells = [];
                  this.resetPending = false;
                  this.resetFromName = "";
            },
            opponentTurn(name) {
                  this.myTurn = false;
                  if (name) this.opponentName = name;
            },
            applyClickBtn(x) {
                  this.$set(this.cells, x.index, x.symbol);
                  this.animateCell(x.index);
            },
            applySetTable(t) {
                  this.cells = (t && t.slice()) || Array(9).fill("");
                  this.resetView();
            },
            applyClearTable() {
                  this.cells = Array(9).fill("");
                  this.resetView();
            },
            setResult(type, text) {
                  this.gameOver = true;
                  this.myTurn = false;
                  this.result = {
                        type,
                        title: text,
                        emoji: type === "win" ? "🎉" : type === "lose" ? "😢" : "🤝",
                  };
                  this.winCells = this.findWinCells(
                        type === "win" ? this.mySymbol : this.opponentSymbol,
                  );
            },
            findWinCells(symbol) {
                  if (!symbol) return [];
                  const combos = [
                        [0, 1, 2],
                        [3, 4, 5],
                        [6, 7, 8],
                        [0, 3, 6],
                        [1, 4, 7],
                        [2, 5, 8],
                        [0, 4, 8],
                        [2, 4, 6],
                  ];
                  for (const c of combos) {
                        if (c.every((i) => this.cells[i] === symbol)) return c.slice();
                  }
                  return [];
            },
            dismissResult() {
                  this.result = null;
            },
            requestReset() {
                  if (this.resetPending) return;
                  this.resetPending = true;
                  socket.emit("request-game-reset", app.myName || "");
            },
            acceptReset() {
                  socket.emit("accept-game-reset");
                  this.resetFromName = "";
                  this.resetPending = false;
            },
            declineReset() {
                  socket.emit("decline-game-reset");
                  this.resetFromName = "";
                  this.resetPending = false;
            },
            handleResetRequest(name) {
                  this.resetFromName = name || "Your opponent";
                  this.resetPending = false;
            },
            handleResetDeclined() {
                  this.resetPending = false;
                  showToast("New game request declined", "error");
            },
            resetView() {
                  clearTimeout(this.animTimer);
                  this.gameOver = false;
                  this.result = null;
                  this.winCells = [];
                  this.animIndex = null;
                  this.myTurn = false;
                  this.resetPending = false;
                  this.resetFromName = "";
            },
            cellClass(i) {
                  let c = "bg-slate-900 ";
                  if (this.cells[i] === "x") c += "text-cyan-300 ";
                  else if (this.cells[i] === "o") c += "text-yellow-300 ";
                  else
                        c += "text-slate-800 hover:bg-slate-700 hover:scale-105 active:scale-95 ";
                  if (this.winCells && this.winCells.includes(i)) c += "ttt-win-cell ";
                  if (this.animIndex === i) c += "ttt-pop";
                  return c;
            },
            openHelp() {
                  openHowTo({
                        icon: "⭕",
                        title: "Christies Tic Tac Toe",
                        tagline: "Three in a row wins!",
                        accent: "from-rose-500 to-orange-400",
                        steps: [
                              {
                                    icon: "✖️",
                                    title: "Take turns",
                                    text: "You and your opponent pick a mark — X or O. Tap an empty square to place yours.",
                              },
                              {
                                    icon: "🏆",
                                    title: "Line up 3",
                                    text: "Get three of your marks in a row — across, down, or diagonal — to win the game.",
                              },
                              {
                                    icon: "🤝",
                                    title: "Draw",
                                    text: "If the board fills up with no line of three, the game is a draw.",
                              },
                              {
                                    icon: "↻",
                                    title: "Rematch",
                                    text: 'Hit "New Game", then accept when your opponent asks for one too.',
                              },
                        ],
                  });
            },
            leaveGame() {
                  this.$emit("leave-game");
            },
            leaveRoom() {
                  this.$emit("leave-room");
            },
      },
      beforeDestroy() {
            clearTimeout(this.animTimer);
      },
      template: `
            <div class="mx-auto w-full max-w-3xl space-y-3 px-3 py-4">
                  <!-- Header -->
                  <div class="relative overflow-hidden rounded-3xl bg-gradient-to-br from-rose-500 to-orange-400 px-4 py-3 text-white shadow-[0_8px_0_rgba(0,0,0,0.18)]">
                        <div class="deco-circle -right-6 -top-10 size-28"></div>
                        <div class="deco-circle -bottom-12 left-8 size-20"></div>
                        <div class="relative z-10 flex items-center gap-3">
                              <span class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/25 text-2xl shadow-lg">⭕</span>
                              <div class="min-w-0 flex-1 leading-tight">
                                    <div class="flex items-center gap-2">
                                          <h1 class="min-w-0 flex-1 truncate text-lg sm:text-xl font-black leading-none">Christies Tic Tac Toe</h1>
                                          <button @click="openHelp"
                                                class="btn-bubble shrink-0 rounded-xl bg-white/25 px-2.5 py-1.5 text-xs font-black hover:bg-white/35">
                                                ❓ How to play
                                          </button>
                                    </div>
                                    <p class="mt-0.5 truncate text-xs font-bold text-white/85">Three in a row wins!</p>
                              </div>
                        </div>
                  </div>

                  <!-- Player cards -->
                  <div class="grid grid-cols-2 gap-3">
                        <div :class="meCardClass"
                              class="relative flex items-center gap-3 overflow-hidden rounded-3xl px-3 py-2.5 shadow-[0_6px_0_rgba(0,0,0,0.14)] transition-all duration-300">
                              <div class="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white/90 text-2xl font-black text-slate-700 shadow-lg">
                                    {{ mySymbol ? display(mySymbol) : 'X' }}
                              </div>
                              <div class="min-w-0 flex-1 text-left">
                                    <div class="text-xs font-black uppercase opacity-75">You</div>
                                    <div class="truncate text-base font-black">
                                          {{ mySymbol ? 'Mark ' + display(mySymbol) : 'Waiting…' }}
                                    </div>
                              </div>
                              <div v-if="!gameOver" class="shrink-0 text-lg font-black"
                                    :class="myTurn ? 'animate-pulse' : 'opacity-40'">
                                    {{ myTurn ? '●' : '○' }}
                              </div>
                        </div>
                        <div :class="opponentCardClass"
                              class="relative flex items-center gap-3 overflow-hidden rounded-3xl px-3 py-2.5 shadow-[0_6px_0_rgba(0,0,0,0.14)] transition-all duration-300">
                              <div class="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white/90 text-2xl font-black text-slate-700 shadow-lg">
                                    {{ opponentSymbol ? display(opponentSymbol) : 'O' }}
                              </div>
                              <div class="min-w-0 flex-1 text-left">
                                    <div class="text-xs font-black uppercase opacity-75">Opponent</div>
                                    <div class="truncate text-base font-black">
                                          {{ opponentName || (opponentSymbol ? 'Mark ' + display(opponentSymbol) : 'Waiting…') }}
                                    </div>
                              </div>
                              <div v-if="!gameOver" class="shrink-0 text-lg font-black"
                                    :class="!myTurn ? 'animate-pulse' : 'opacity-40'">
                                    {{ !myTurn ? '●' : '○' }}
                              </div>
                        </div>
                  </div>

                  <!-- Turn pill -->
                  <div class="mx-auto w-fit rounded-full bg-white/80 px-6 py-2 text-center shadow-[0_4px_0_rgba(0,0,0,0.12)]">
                        <p class="text-sm font-black" :class="turnTextClass">{{ turnText }}</p>
                        <p v-if="mySymbol && !gameOver" class="text-xs font-bold text-slate-500">
                              First to 3 marks in a row wins
                        </p>
                  </div>

                  <!-- Board -->
                  <div class="mx-auto w-full max-w-sm rounded-3xl bg-gradient-to-br from-rose-500 to-orange-400 p-2 shadow-[0_8px_0_rgba(0,0,0,0.18)]">
                        <div class="grid grid-cols-3 gap-2 rounded-2xl bg-white/20 p-2">
                              <button v-for="(c, i) in cells" :key="i" @click="play(i)"
                                    :class="['flex items-center justify-center h-16 md:h-20 text-3xl md:text-5xl font-black rounded-xl transition-all duration-150', cellClass(i)]">
                                    {{ display(c) }}
                              </button>
                        </div>
                  </div>

                  <!-- Action buttons -->
                  <div class="flex justify-center gap-3 pt-1">
                        <button @click="requestReset" :disabled="resetPending"
                              class="btn-bubble rounded-2xl bg-gradient-to-br from-green-400 to-emerald-500 px-5 py-2.5 text-sm font-black text-white">
                              {{ resetPending ? "⏳ Waiting for opponent..." : "↻ New Game" }}
                        </button>
                        <button @click="leaveGame"
                              class="btn-bubble rounded-2xl bg-gradient-to-br from-sky-400 to-blue-500 px-5 py-2.5 text-sm font-black text-white">
                              🏠 Leave game
                        </button>
                        <!-- <button @click="leaveRoom"
                              class="btn-bubble rounded-2xl bg-gradient-to-br from-rose-400 to-red-500 px-5 py-2.5 text-sm font-black text-white">
                              Leave room
                        </button> -->
                  </div>

                  <!-- Reset request overlay -->
                  <div v-if="resetFromName" @click="declineReset"
                        class="fixed inset-0 z-[75] flex items-center justify-center bg-black/45 backdrop-blur-sm">
                        <div class="howto-pop w-80 max-w-full rounded-3xl bg-white/95 p-6 text-center text-slate-900 shadow-2xl"
                              @click.stop>
                              <div class="text-5xl mb-2">↻</div>
                              <div class="text-xl font-black">{{ resetFromName }} wants a new game</div>
                              <div class="mt-4 flex justify-center gap-3">
                                    <button @click="acceptReset"
                                          class="btn-bubble rounded-2xl bg-gradient-to-br from-green-400 to-emerald-500 px-5 py-2 text-sm font-black text-white">
                                          Accept
                                    </button>
                                    <button @click="declineReset"
                                          class="btn-bubble rounded-2xl bg-gradient-to-br from-rose-400 to-red-500 px-5 py-2 text-sm font-black text-white">
                                          Decline
                                    </button>
                              </div>
                        </div>
                  </div>

                  <!-- Result overlay -->
                  <div v-if="result" @click="dismissResult"
                        class="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 backdrop-blur-sm">
                        <div class="howto-pop w-80 max-w-[90vw] rounded-3xl px-7 py-7 text-center text-white shadow-2xl"
                              :class="resultBannerClass">
                              <div class="text-6xl mb-2">{{ result.emoji }}</div>
                              <div class="text-3xl md:text-4xl font-black">{{ result.title }}</div>
                              <div class="mt-2 text-sm font-bold text-white/85">tap "New Game" to rematch</div>
                              <div class="mt-5 flex justify-center gap-3">
                                    <button v-if="gameOver" @click.stop="requestReset" :disabled="resetPending"
                                          class="btn-bubble rounded-2xl bg-white/25 px-4 py-2 text-sm font-black">
                                          {{ resetPending ? "⏳ Waiting..." : "↻ New Game" }}
                                    </button>
                              </div>
                        </div>
                  </div>
            </div>
      `,
});