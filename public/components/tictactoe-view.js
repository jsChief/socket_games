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
                        return "bg-green-600 text-white ring-4 ring-yellow-300 scale-[1.03] animate-pulse";
                  return "bg-white/60 text-slate-900";
            },
            opponentCardClass() {
                  if (this.gameOver) return "bg-slate-700/80 text-white";
                  if (!this.myTurn && this.opponentName)
                        return "bg-orange-600 text-white ring-4 ring-yellow-300 scale-[1.03] animate-pulse";
                  return "bg-white/60 text-slate-900";
            },
            turnText() {
                  if (this.gameOver) return "Game over";
                  if (this.myTurn) return "It's your turn!";
                  return this.opponentName
                        ? this.opponentName + "'s turn..."
                        : "Waiting for opponent...";
            },
            resultBannerClass() {
                  if (!this.result) return "";
                  if (this.result.type === "win")
                        return "bg-gradient-to-br from-green-500 to-emerald-700";
                  if (this.result.type === "lose")
                        return "bg-gradient-to-br from-red-500 to-rose-700";
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
            leaveRoom() {
                  this.$emit("leave-room");
            },
      },
      beforeDestroy() {
            clearTimeout(this.animTimer);
      },
      template: `
            <div>
                  <p class="text-3xl p-4 rounded-2xl w-full text-center bg-white/90 font-bold shadow">
                        Christy's Tic Tac Toe
                  </p>

                  <div class="mt-2 grid grid-cols-2 gap-2">
                        <div :class="meCardClass"
                              class="rounded-2xl px-3 py-2 text-center shadow-xl transition-all duration-300">
                              <div class="text-2xl font-black">{{ mySymbol ? display(mySymbol) : 'X' }}</div>
                              <div class="text-sm font-bold">You ({{ mySymbol ? display(mySymbol) : '—' }})</div>
                              <div v-if="!gameOver" class="text-xs mt-1 font-bold">
                                    {{ myTurn ? '● Your turn' : 'waiting' }}
                              </div>
                        </div>
                        <div :class="opponentCardClass"
                              class="rounded-2xl px-3 py-2 text-center shadow-xl transition-all duration-300">
                              <div class="text-2xl font-black">{{ opponentSymbol ? display(opponentSymbol) : 'O' }}</div>
                              <div class="text-sm font-bold truncate">{{ opponentName || "opponent" }}</div>
                              <div v-if="!gameOver" class="text-xs mt-1 font-bold">
                                    {{ myTurn ? 'waiting' : '● their turn' }}
                              </div>
                        </div>
                  </div>

                  <div
                        class="md:w-1/2 w-full rounded-2xl shadow-xl mx-auto mt-3 p-2 bg-orange-600/90">
                        <div class="grid grid-cols-3 gap-1 rounded-xl p-1">
                              <button v-for="(c, i) in cells" :key="i" @click="play(i)"
                                    :class="['ttt-cell flex items-center justify-center h-16 md:h-20 text-3xl md:text-5xl font-black rounded-xl transition-all duration-150', cellClass(i)]">
                                    {{ display(c) }}
                              </button>
                        </div>
                  </div>

                  <div class="mt-3 text-center">
                        <div :class="gameOver ? 'bg-slate-700/80 text-white' : myTurn ? 'bg-green-600 text-white' : 'bg-white/80 text-slate-700'"
                              class="rounded-2xl px-4 py-2 w-fit mx-auto font-bold shadow-xl">
                              {{ turnText }}
                        </div>
                  </div>

                  <div class="mt-2 flex gap-2 justify-center">
                        <button @click="requestReset" :disabled="resetPending"
                              :class="resetPending ? 'bg-slate-600 text-white/70 cursor-not-allowed' : 'bg-green-600 text-white hover:scale-105 active:scale-95'"
                              class="rounded-2xl px-4 py-1.5 text-sm font-bold shadow-xl transition-all">
                              {{ resetPending ? "⏳ Waiting for opponent..." : "↻ New Game" }}
                        </button>
                        <button @click="leaveRoom"
                              class="rounded-2xl px-4 py-1.5 bg-red-600 text-white text-sm font-bold shadow-xl">
                              Leave room
                        </button>
                  </div>

                  <div v-if="resetFromName" @click="declineReset"
                        class="fixed inset-0 z-[75] flex items-center justify-center bg-black/40">
                        <div class="ttt-banner rounded-3xl px-8 py-6 text-center shadow-2xl bg-white/95 text-slate-900 w-80 max-w-full mx-4"
                              @click.stop>
                              <div class="text-5xl mb-2">↻</div>
                              <div class="text-xl font-black">{{ resetFromName }} wants a new game</div>
                              <div class="mt-4 flex justify-center gap-3">
                                    <button @click="acceptReset"
                                          class="rounded-2xl bg-green-600 text-white font-bold px-5 py-2 shadow-xl">
                                          Accept
                                    </button>
                                    <button @click="declineReset"
                                          class="rounded-2xl bg-red-600 text-white font-bold px-5 py-2 shadow-xl">
                                          Decline
                                    </button>
                              </div>
                        </div>
                  </div>

                  <div v-if="result" @click="dismissResult"
                        class="fixed inset-0 z-[70] flex items-center justify-center bg-black/50">
                        <div class="ttt-banner rounded-3xl px-8 py-6 text-center shadow-2xl text-white"
                              :class="resultBannerClass">
                              <div class="text-6xl mb-2">{{ result.emoji }}</div>
                              <div class="text-3xl md:text-4xl font-black">{{ result.title }}</div>
                              <div class="mt-2 text-white/80 text-sm">tap "New Game" to rematch</div>
                              <button
                                    class="mt-4 rounded-full bg-white/20 hover:bg-white/30 px-4 py-1.5 text-sm font-bold transition-colors">
                                    Close
                              </button>
                        </div>
                  </div>
            </div>
      `,
});