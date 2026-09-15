var CONNECT4_ROWS = 6;
var CONNECT4_COLS = 7;

// Bottom-most empty row for a disc dropped into `col`, or -1 if full.
function c4DropRow(board, col) {
  for (let r = CONNECT4_ROWS - 1; r >= 0; r--) {
    if (board[r * CONNECT4_COLS + col] === null) return r;
  }
  return -1;
}

Vue.component("connect4-view", {
      data() {
            return {
                  board: Array(42).fill(null),
                  mySymbol: "",
                  opponentName: "",
                  myTurn: false,
                  phase: "idle", // idle | battle | over
                  result: null, // won | lost | draw
                  lastCell: null,
                  winLine: [],
                  hoverCol: -1,
                  status: "",
                  rematchRequested: false,
                  rematchFromOpponent: false,
                  overlayDismissed: false,
            };
      },
      computed: {
            cols() {
                  return Array.from({ length: CONNECT4_COLS }, (_, i) => i);
            },
            opponentSymbol() {
                  return this.mySymbol === "red" ? "yellow" : "red";
            },
            playableCols() {
                  const cols = [];
                  if (this.phase !== "battle" || !this.myTurn) return cols;
                  for (let c = 0; c < CONNECT4_COLS; c++) {
                        if (c4DropRow(this.board, c) !== -1) cols.push(c);
                  }
                  return cols;
            },
            discsOnBoard() {
                  return this.board.filter((x) => x !== null).length;
            },
            statusText() {
                  if (this.phase === "idle") return "awaiting a game";
                  if (this.phase === "over") {
                        if (this.result === "draw") return "It's a draw!";
                        return this.result === "won"
                              ? "You win! 🎉"
                              : (this.opponentName || "Opponent") + " wins.";
                  }
                  return this.myTurn
                        ? "Your turn — drop a disc"
                        : "Waiting for " + (this.opponentName || "opponent") + "...";
            },
            statusColor() {
                  if (this.phase === "over") return "text-slate-800";
                  if (this.myTurn) return "text-green-700";
                  return "text-orange-600";
            },
            myCardClass() {
                  if (this.phase !== "battle" || this.phase === "over")
                        return "bg-white/60 text-slate-800";
                  if (this.myTurn)
                        return "bg-gradient-to-br from-green-400 to-emerald-500 text-white ring-4 ring-yellow-300 scale-[1.03] animate-pulse";
                  return "bg-white/60 text-slate-800";
            },
            opponentCardClass() {
                  if (this.phase !== "battle" || this.phase === "over")
                        return "bg-white/60 text-slate-800";
                  if (!this.myTurn && this.opponentName)
                        return "bg-gradient-to-br from-orange-400 to-rose-500 text-white ring-4 ring-yellow-300 scale-[1.03] animate-pulse";
                  return "bg-white/60 text-slate-800";
            },
            resultBannerClass() {
                  if (this.result === "draw")
                        return "bg-gradient-to-br from-slate-500 to-slate-700";
                  return this.result === "won"
                        ? "bg-gradient-to-br from-green-400 to-emerald-600"
                        : "bg-gradient-to-br from-rose-400 to-red-600";
            },
      },
      methods: {
            start(data) {
                  this.resetView();
                  this.phase = "battle";
                  this.mySymbol = data.symbol;
                  this.opponentName = data.opponentName || "";
                  this.myTurn = this.mySymbol === "red";
                  this.status = this.myTurn
                        ? "Red moves first — your turn"
                        : "Waiting for " + this.opponentName + "...";
            },
            applyState(data) {
                  this.board = (data.board || Array(42).fill(null)).slice();
                  this.lastCell =
                        typeof data.lastCell === "number" ? data.lastCell : null;
                  this.winLine = data.winLine || [];
                  this.myTurn =
                        !data.gameOver && data.currentSymbol === this.mySymbol;
                  if (data.gameOver) this.phase = "over";
                  if (!data.gameOver) {
                        if (this.phase === "battle" && this.myTurn) {
                              this.status = "Your turn — drop a disc";
                              playSound(serverMessageTone);
                        } else if (this.phase === "battle") {
                              this.status =
                                    "Waiting for " +
                                    (this.opponentName || "opponent") +
                                    "...";
                        }
                  }
            },
            drop(col) {
                  if (this.phase !== "battle" || !this.myTurn) return;
                  if (this.playableCols.indexOf(col) === -1) {
                        this.status = "That column is full.";
                        playSound(messageTone);
                        return;
                  }
                  const row = c4DropRow(this.board, col);
                  const cell = row * CONNECT4_COLS + col;
                  this.$set(this.board, cell, this.mySymbol);
                  this.lastCell = cell;
                  this.myTurn = false;
                  this.status =
                        "Waiting for " + (this.opponentName || "opponent") + "...";
                  playSound(moveSound);
                  socket.emit("connect4-drop", { col });
            },
            gameOver(data) {
                  this.phase = "over";
                  this.result = data.draw
                        ? "draw"
                        : data.won
                              ? "won"
                              : "lost";
                  this.winLine = data.winLine || this.winLine;
                  this.myTurn = false;
                  this.overlayDismissed = false;
                  if (this.result === "won") playSound(win);
                  else if (this.result === "lost") playSound(lose);
                  else playSound(draw);
            },
            info(msg) {
                  this.status = msg;
            },
            colClass(c) {
                  if (this.phase !== "battle" || !this.myTurn) return "";
                  if (this.playableCols.indexOf(c) !== -1)
                        return "cursor-pointer hover:scale-105 active:scale-95 transition-transform";
                  return "";
            },
            ghostVisible(c) {
                  return (
                        this.phase === "battle" &&
                        this.myTurn &&
                        this.hoverCol === c &&
                        this.playableCols.indexOf(c) !== -1
                  );
            },
            discClass(symbol, i) {
                  let c =
                        "w-full h-full rounded-full shadow-lg transition-all duration-150 ";
                  const halo =
                        this.winLine && this.winLine.indexOf(i) !== -1
                              ? "ring-4 ring-yellow-300 shadow-[0_0_22px_6px_rgba(250,204,21,0.55)] "
                              : "";
                  const color =
                        symbol === "red"
                              ? "bg-gradient-to-br from-red-400 to-red-600 "
                              : "bg-gradient-to-br from-yellow-300 to-amber-500 ";
                  if (this.lastCell === i) c += "c4-pop ";
                  return c + color + halo;
            },
            ghostClass() {
                  return (
                        "aspect-square rounded-full mx-auto opacity-80 transition-all duration-150 " +
                        (this.mySymbol === "red"
                              ? "bg-gradient-to-br from-red-400 to-red-600 "
                              : "bg-gradient-to-br from-yellow-300 to-amber-500 ")
                  );
            },
            requestRematch() {
                  if (this.phase !== "over" || this.rematchRequested) return;
                  this.rematchRequested = true;
                  this.rematchFromOpponent = false;
                  this.status = "Waiting for opponent to rematch...";
                  socket.emit("connect4-rematch");
            },
            rematchRequest() {
                  if (this.phase === "over") {
                        this.rematchFromOpponent = true;
                        this.status = "Opponent wants a rematch! Click Play again.";
                        playSound(serverMessageTone);
                  }
            },
            dismissOverlay() {
                  this.overlayDismissed = true;
            },
            openHelp() {
                  openHowTo({
                        icon: "🔴",
                        title: "Connect 4",
                        tagline: "Four in a row wins!",
                        accent: "from-blue-500 to-cyan-400",
                        steps: [
                              {
                                    icon: "🔴",
                                    title: "Drop a disc",
                                    text: "Take turns dropping a disc into any open column — it falls to the lowest empty cell.",
                              },
                              {
                                    icon: "🎯",
                                    title: "Line up 4",
                                    text: "Get 4 of your discs in a row — horizontal, vertical, or diagonal — to win the game.",
                              },
                              {
                                    icon: "🤝",
                                    title: "Draw",
                                    text: "The board is full and nobody has four in a row? That's a draw.",
                              },
                              {
                                    icon: "↻",
                                    title: "Rematch",
                                    text: "Both players press Play again to start a fresh game.",
                              },
                        ],
                  });
            },
            resetView() {
                  this.board = Array(42).fill(null);
                  this.mySymbol = "";
                  this.opponentName = "";
                  this.myTurn = false;
                  this.phase = "idle";
                  this.result = null;
                  this.lastCell = null;
                  this.winLine = [];
                  this.hoverCol = -1;
                  this.status = "";
                  this.rematchRequested = false;
                  this.rematchFromOpponent = false;
                  this.overlayDismissed = false;
            },
            leaveGame() {
                  this.$emit("leave-game");
            },
            leaveRoom() {
                  this.$emit("leave-room");
            },
      },
      template: `
            <div class="mx-auto w-full max-w-3xl space-y-3 px-3 py-4">
                  <!-- Header -->
                  <div class="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-500 to-cyan-400 px-5 py-4 text-white shadow-[0_8px_0_rgba(0,0,0,0.18)]">
                        <div class="deco-circle -right-6 -top-10 size-32"></div>
                        <div class="deco-circle -bottom-12 left-8 size-24"></div>
                        <div class="relative z-10 flex items-center gap-8 lg:gap-3">
                              <span class="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-white/25 text-4xl shadow-lg">🔴</span>
                              <div class="lg:flex lg:w-full lg:place-content-between">
                                    <div class="min-w-0 flex-1">
                                    <h1 class="text-3xl font-black leading-none">Connect 4</h1>
                                    <p class="mt-1 text-sm font-bold text-white/85">Four in a row wins!</p>
                              </div>
                              <button @click="openHelp"
                                    class="btn-bubble shrink-0 rounded-2xl bg-white/25 px-3 py-2 text-sm font-black hover:bg-white/35">
                                    ❓ How to play
                              </button>
                              </div>
                        </div>
                  </div>

                  <!-- Player cards -->
                  <div class="grid grid-cols-2 gap-3">
                        <div :class="myCardClass"
                              class="relative flex items-center gap-3 overflow-hidden rounded-3xl px-3 py-2.5 shadow-[0_6px_0_rgba(0,0,0,0.14)] transition-all duration-300">
                              <div class="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white/90 text-2xl shadow-lg">
                                    {{ mySymbol === 'yellow' ? '🟡' : '🔴' }}
                              </div>
                              <div class="min-w-0 flex-1 text-left">
                                    <div class="text-xs font-black uppercase opacity-75">You</div>
                                    <div class="truncate text-base font-black">{{ mySymbol === 'red' ? 'Red' : mySymbol === 'yellow' ? 'Yellow' : 'Waiting…' }}</div>
                              </div>
                              <div v-if="phase === 'battle'" class="shrink-0 text-lg font-black"
                                    :class="myTurn ? 'animate-pulse' : 'opacity-40'">
                                    {{ myTurn ? '●' : '○' }}
                              </div>
                        </div>
                        <div :class="opponentCardClass"
                              class="relative flex items-center gap-3 overflow-hidden rounded-3xl px-3 py-2.5 shadow-[0_6px_0_rgba(0,0,0,0.14)] transition-all duration-300">
                              <div class="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white/90 text-2xl shadow-lg">
                                    {{ opponentSymbol === 'yellow' ? '🟡' : '🔴' }}
                              </div>
                              <div class="min-w-0 flex-1 text-left">
                                    <div class="text-xs font-black uppercase opacity-75">Opponent</div>
                                    <div class="truncate text-base font-black">
                                          {{ opponentName || (opponentSymbol === 'red' ? 'Red' : 'Yellow') }}
                                    </div>
                              </div>
                              <div v-if="phase === 'battle'" class="shrink-0 text-lg font-black"
                                    :class="!myTurn ? 'animate-pulse' : 'opacity-40'">
                                    {{ !myTurn ? '●' : '○' }}
                              </div>
                        </div>
                  </div>

                  <!-- Status pill -->
                  <div class="mx-auto w-fit rounded-full bg-white/80 px-6 py-2 text-center shadow-[0_4px_0_rgba(0,0,0,0.12)]">
                        <p class="text-sm font-black" :class="statusColor">{{ status || statusText }}</p>
                        <p class="mt-0.5 text-xs font-bold text-slate-500">{{ discsOnBoard }}/42 discs on board</p>
                  </div>

                  <!-- Board -->
                  <div class="mx-auto w-full max-w-md rounded-3xl bg-gradient-to-b from-sky-700 to-sky-950 p-2 shadow-[0_8px_0_rgba(0,0,0,0.25)]">
                        <div class="grid grid-cols-7 gap-1 px-1">
                              <div v-for="c in cols" :key="'g' + c" @mouseenter="hoverCol = c"
                                    @mouseleave="hoverCol = -1" @click="drop(c)" :class="['px-1 pt-1', colClass(c)]">
                                    <div v-if="ghostVisible(c)" class="c4-pop" :class="ghostClass()"></div>
                                    <div v-else class="aspect-square"></div>
                              </div>
                        </div>
                        <div class="mt-1 grid grid-cols-7 gap-1 rounded-2xl bg-sky-900/50 p-1">
                              <div v-for="(cell, i) in board" :key="i"
                                    class="aspect-square rounded-full bg-sky-950/60 flex items-center justify-center p-[6%]">
                                    <div v-if="cell !== null" :class="discClass(cell, i)"></div>
                              </div>
                        </div>
                  </div>

                  <!-- Action buttons -->
                  <div class="flex justify-center gap-3 pt-1">
                        <button v-if="phase === 'over'" @click="requestRematch" :disabled="rematchRequested"
                              class="btn-bubble rounded-2xl bg-gradient-to-br from-green-400 to-emerald-500 px-5 py-2.5 text-sm font-black text-white">
                              {{ rematchRequested ? "⏳ Waiting for opponent..." : "↻ Play again" }}
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

                  <!-- Opponent rematch pill -->
                  <div v-if="rematchFromOpponent && phase === 'over'"
                        class="fixed bottom-20 left-1/2 -translate-x-1/2 z-[60]">
                        <div class="howto-pop rounded-2xl bg-white/95 px-5 py-3 text-center text-slate-900 shadow-2xl">
                              <div class="text-sm font-black">{{ opponentName || "Opponent" }} wants a rematch</div>
                              <button @click="requestRematch"
                                    class="btn-bubble mt-2 rounded-2xl bg-gradient-to-br from-green-400 to-emerald-500 px-4 py-1.5 text-sm font-black text-white">
                                    Play again
                              </button>
                        </div>
                  </div>

                  <!-- Result overlay -->
                  <div v-if="phase === 'over' && result && !overlayDismissed" @click="dismissOverlay"
                        class="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 backdrop-blur-sm">
                        <div class="howto-pop w-80 max-w-[90vw] rounded-3xl px-7 py-7 text-center text-white shadow-2xl"
                              :class="resultBannerClass">
                              <div class="text-6xl mb-2">
                                    {{ result === 'won' ? '🎉' : result === 'lost' ? '😢' : '🤝' }}
                              </div>
                              <div class="text-3xl md:text-4xl font-black">
                                    {{ result === 'won' ? 'You Win!' : result === 'lost' ? 'You Lose' : 'Draw' }}
                              </div>
                              <div class="mt-5 flex justify-center gap-3">
                                    <button @click="requestRematch" :disabled="rematchRequested"
                                          class="btn-bubble rounded-2xl bg-white/25 px-4 py-2 text-sm font-black">
                                          {{ rematchRequested ? "Waiting..." : "↻ Play again" }}
                                    </button>
                              </div>
                              <p class="mt-2 text-xs font-bold text-white/70">
                                    Both players click Play again to start a new game
                              </p>
                        </div>
                  </div>
            </div>
      `,
});