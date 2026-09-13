var REVERSI_SIZE = 8;
var REVERSI_DIRS = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];

// Cells that would flip if `symbol` played at `cell` (empty when illegal).
function revFlips(board, symbol, cell) {
  if (board[cell] !== "") return [];
  var opp = symbol === "b" ? "w" : "b";
  var row = Math.floor(cell / REVERSI_SIZE);
  var col = cell % REVERSI_SIZE;
  var flips = [];
  for (var d = 0; d < REVERSI_DIRS.length; d++) {
    var dr = REVERSI_DIRS[d][0];
    var dc = REVERSI_DIRS[d][1];
    var line = [];
    var r = row + dr;
    var c = col + dc;
    while (r >= 0 && r < REVERSI_SIZE && c >= 0 && c < REVERSI_SIZE) {
      var idx = r * REVERSI_SIZE + c;
      if (board[idx] === "") break;
      if (board[idx] === opp) {
        line.push(idx);
        r += dr;
        c += dc;
        continue;
      }
      flips = flips.concat(line);
      break;
    }
  }
  return flips;
}

function revLegalMoves(board, symbol) {
  var moves = [];
  for (var i = 0; i < board.length; i++) {
    if (board[i] === "" && revFlips(board, symbol, i).length > 0) moves.push(i);
  }
  return moves;
}

Vue.component("reversi-view", {
      data() {
            return {
                  board: Array(64).fill(""),
                  mySymbol: "",
                  opponentName: "",
                  myTurn: false,
                  phase: "idle", // idle | battle | over
                  result: null, // won | lost | draw
                  lastCell: null,
                  flipCells: [],
                  flipTimer: null,
                  status: "",
                  myCount: 0,
                  oppCount: 0,
                  rematchRequested: false,
                  rematchFromOpponent: false,
                  overlayDismissed: false,
            };
      },
      computed: {
            counts() {
                  let b = 0,
                        w = 0;
                  for (const c of this.board) {
                        if (c === "b") b++;
                        else if (c === "w") w++;
                  }
                  return { b, w };
            },
            totalCells() {
                  return this.counts.b + this.counts.w;
            },
            myCountC() {
                  return this.mySymbol === "b" ? this.counts.b : this.counts.w;
            },
            oppCountC() {
                  return this.mySymbol === "b" ? this.counts.w : this.counts.b;
            },
            opponentSymbol() {
                  return this.mySymbol === "b" ? "w" : "b";
            },
            legalMoves() {
                  if (this.phase !== "battle" || !this.myTurn) return [];
                  return revLegalMoves(this.board, this.mySymbol);
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
                        ? "Your turn — place a disc to flank your opponent"
                        : "Waiting for " +
                                (this.opponentName || "opponent") +
                                "...";
            },
            myCardClass() {
                  if (this.phase !== "battle" || this.phase === "over")
                        return "bg-white/60 text-slate-900";
                  if (this.myTurn)
                        return "bg-green-600 text-white ring-4 ring-yellow-300 scale-[1.03] animate-pulse";
                  return "bg-white/60 text-slate-900";
            },
            opponentCardClass() {
                  if (this.phase !== "battle" || this.phase === "over")
                        return "bg-white/60 text-slate-900";
                  if (!this.myTurn && this.opponentName)
                        return "bg-orange-600 text-white ring-4 ring-yellow-300 scale-[1.03] animate-pulse";
                  return "bg-white/60 text-slate-900";
            },
            resultBannerClass() {
                  if (this.result === "draw")
                        return "bg-gradient-to-br from-slate-500 to-slate-700";
                  return this.result === "won"
                        ? "bg-gradient-to-br from-green-500 to-emerald-700"
                        : "bg-gradient-to-br from-red-500 to-rose-700";
            },
            statusColor() {
                  if (this.phase === "over") return "text-slate-800";
                  if (this.myTurn) return "text-green-700";
                  return "text-orange-600";
            },
      },
      methods: {
            start(data) {
                  this.resetView();
                  this.phase = "battle";
                  this.board = (data.board && data.board.slice()) || Array(64).fill("");
                  this.mySymbol = data.symbol;
                  this.opponentName = data.opponentName || "";
                  this.myTurn = this.mySymbol === "b";
                  this.status = this.myTurn
                        ? "Black moves first — your turn"
                        : "Waiting for " + this.opponentName + "...";
            },
            applyState(data) {
                  const next = data.board || [];
                  const flipped = [];
                  for (let i = 0; i < next.length; i++) {
                        if (this.board[i] !== next[i] && this.board[i] !== "") {
                              flipped.push(i);
                        }
                  }
                  this.board = next.slice();
                  this.lastCell =
                        typeof data.lastCell === "number" ? data.lastCell : null;
                  this.myTurn = data.currentSymbol === this.mySymbol;
                  if (data.pass) {
                        this.status =
                              (this.opponentName || "Opponent") +
                              " has no moves — turn skipped";
                        playSound(serverMessageTone);
                  } else if (this.phase === "battle" && this.myTurn) {
                        this.status = "Your turn";
                        playSound(serverMessageTone);
                  } else if (this.phase === "battle") {
                        this.status = "Waiting for " + (this.opponentName || "opponent") + "...";
                  }
                  this.setFlipCells(
                        flipped.length ? flipped : [this.lastCell].filter(Boolean),
                  );
            },
            setFlipCells(cells) {
                  clearTimeout(this.flipTimer);
                  this.flipCells = cells || [];
                  this.flipTimer = setTimeout(() => {
                        this.flipCells = [];
                  }, 500);
            },
            gameOver(data) {
                  this.phase = "over";
                  this.result = data.draw
                        ? "draw"
                        : data.won
                              ? "won"
                              : "lost";
                  this.myCount = data.myCount;
                  this.oppCount = data.oppCount;
                  this.myTurn = false;
                  this.overlayDismissed = false;
                  if (this.result === "won") playSound(win);
                  else if (this.result === "lost") playSound(lose);
                  else playSound(draw);
            },
            info(msg) {
                  this.status = msg;
            },
            play(i) {
                  if (this.phase !== "battle" || !this.myTurn) return;
                  if (this.board[i] !== "") return;
                  const flips = revFlips(this.board, this.mySymbol, i);
                  if (flips.length === 0) {
                        this.status = "Not a legal move — you must flank a disc.";
                        playSound(messageTone);
                        return;
                  }
                  this.$set(this.board, i, this.mySymbol);
                  for (const f of flips) this.$set(this.board, f, this.mySymbol);
                  this.lastCell = i;
                  this.myTurn = false;
                  this.status = "";
                  playSound(moveSound);
                  socket.emit("reversi-move", { cell: i });
            },
            hoverClass(i) {
                  if (this.phase !== "battle" || !this.myTurn) return "";
                  if (this.board[i] !== "") return "cursor-default";
                  if (this.legalMoves.indexOf(i) !== -1)
                        return "cursor-pointer hover:bg-emerald-700 hover:scale-105 active:scale-95";
                  return "cursor-not-allowed";
            },
            animClass(i) {
                  let c = "";
                  if (this.lastCell === i) c += "reversi-pop ";
                  if (this.flipCells.indexOf(i) !== -1) c += "reversi-flip";
                  return c;
            },
            requestRematch() {
                  if (this.phase !== "over" || this.rematchRequested) return;
                  this.rematchRequested = true;
                  this.rematchFromOpponent = false;
                  this.status = "Waiting for opponent to rematch...";
                  socket.emit("reversi-rematch");
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
            resetView() {
                  clearTimeout(this.flipTimer);
                  this.board = Array(64).fill("");
                  this.mySymbol = "";
                  this.opponentName = "";
                  this.myTurn = false;
                  this.phase = "idle";
                  this.result = null;
                  this.lastCell = null;
                  this.flipCells = [];
                  this.status = "";
                  this.myCount = 0;
                  this.oppCount = 0;
                  this.rematchRequested = false;
                  this.rematchFromOpponent = false;
                  this.overlayDismissed = false;
            },
            leaveRoom() {
                  this.$emit("leave-room");
            },
      },
      beforeDestroy() {
            clearTimeout(this.flipTimer);
      },
      template: `
            <div>
                  <p class="text-3xl p-4 rounded-2xl w-full text-center bg-white/90 font-bold shadow">
                        ⚫ Reversi ⚪
                  </p>

                  <div class="mt-2 grid grid-cols-2 gap-2">
                        <div :class="myCardClass"
                              class="rounded-2xl px-3 py-2 text-center shadow-xl transition-all duration-300">
                              <div class="text-sm font-bold">
                                    You {{ mySymbol === 'w' ? '⚪' : '⚫' }}
                              </div>
                              <div class="text-3xl font-black">{{ myCountC }}</div>
                              <div v-if="phase === 'battle'" class="text-xs mt-1 font-bold">
                                    {{ myTurn ? '● Your turn' : 'waiting' }}
                              </div>
                        </div>
                        <div :class="opponentCardClass"
                              class="rounded-2xl px-3 py-2 text-center shadow-xl transition-all duration-300">
                              <div class="text-sm font-bold truncate">
                                    {{ opponentName || "opponent" }} {{ opponentSymbol === 'w' ? '⚪' : '⚫' }}
                              </div>
                              <div class="text-3xl font-black">{{ oppCountC }}</div>
                              <div v-if="phase === 'battle'" class="text-xs mt-1 font-bold">
                                    {{ myTurn ? 'waiting' : '● their turn' }}
                              </div>
                        </div>
                  </div>

                  <div class="mt-2 rounded-2xl p-2 bg-white/80 shadow-xl text-center">
                        <p class="text-sm font-bold" :class="statusColor">
                              {{ status || statusText }}
                        </p>
                        <p class="text-xs text-slate-500 mt-1">{{ totalCells }}/64 disks on board</p>
                  </div>

                  <div class="md:w-1/2 w-full mx-auto mt-3 rounded-2xl p-2 bg-emerald-900/80 shadow-xl">
                        <div class="grid grid-cols-8 gap-1 p-1">
                              <div v-for="(cell, i) in board" :key="i" @click="play(i)"
                                    :class="['aspect-square rounded-lg flex items-center justify-center bg-emerald-900/50', hoverClass(i)]">
                                    <div v-if="cell !== ''"
                                          class="w-3/4 h-3/4 rounded-full shadow-lg"
                                          :class="[cell === 'b' ? 'bg-slate-900' : 'bg-white ring-2 ring-slate-300', animClass(i)]">
                                    </div>
                                    <div v-else-if="legalMoves.indexOf(i) !== -1"
                                          class="size-3 rounded-full bg-yellow-300/90 animate-pulse">
                                    </div>
                              </div>
                        </div>
                  </div>

                  <div class="mt-2 flex gap-2 justify-center">
                        <button v-if="phase === 'over'" @click="requestRematch" :disabled="rematchRequested"
                              class="rounded-2xl px-4 py-1.5 bg-green-600 text-white text-sm font-bold shadow-xl"
                              :class="rematchRequested ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105 active:scale-95 transition-all'">
                              {{ rematchRequested ? "⏳ Waiting for opponent..." : "↻ Play again" }}
                        </button>
                        <button @click="leaveRoom"
                              class="rounded-2xl px-4 py-1.5 bg-red-600 text-white text-sm font-bold shadow-xl">
                              Leave room
                        </button>
                  </div>

                  <div v-if="rematchFromOpponent && phase === 'over'"
                        class="fixed bottom-20 left-1/2 -translate-x-1/2 z-[60]">
                        <div class="ttt-banner rounded-2xl px-5 py-3 text-center shadow-2xl bg-white/95 text-slate-900">
                              <div class="text-sm font-black">{{ opponentName || "Opponent" }} wants a rematch</div>
                              <button @click="requestRematch"
                                    class="mt-2 rounded-2xl bg-green-600 text-white text-sm font-bold px-4 py-1.5 shadow-xl">
                                    Play again
                              </button>
                        </div>
                  </div>

                  <div v-if="phase === 'over' && result && !overlayDismissed" @click="dismissOverlay"
                        class="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 -sm">
                        <div class="ttt-banner rounded-3xl px-8 py-6 text-center shadow-2xl text-white w-80 max-w-full mx-4"
                              :class="resultBannerClass">
                              <div class="text-6xl mb-2">
                                    {{ result === 'won' ? '🎉' : result === 'lost' ? '😢' : '🤝' }}
                              </div>
                              <div class="text-3xl md:text-4xl font-black">
                                    {{ result === 'won' ? 'You Win!' : result === 'lost' ? 'You Lose' : 'Draw' }}
                              </div>
                              <div class="mt-2 text-white/80 text-sm font-bold">
                                    You {{ myCount }} — {{ opponentName || "Opponent" }} {{ oppCount }}
                              </div>
                              <button @click="requestRematch" :disabled="rematchRequested"
                                    class="mt-4 rounded-full bg-white/20 hover:bg-white/30 px-4 py-1.5 text-sm font-bold transition-colors">
                                    {{ rematchRequested ? "Waiting for opponent..." : "↻ Play again" }}
                              </button>
                        </div>
                  </div>
            </div>
      `,
});