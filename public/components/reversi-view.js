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
            openHelp() {
                  openHowTo({
                        icon: "⚫",
                        title: "Reversi",
                        tagline: "Flip the board to your color!",
                        accent: "from-emerald-500 to-cyan-500",
                        steps: [
                              {
                                    icon: "⬅️➡️",
                                    title: "Flank to flip",
                                    text: "Place a disc that sandwiches one or more of your opponent's discs — every sandwiched disc flips to your color.",
                              },
                              {
                                    icon: "✨",
                                    title: "Legal moves",
                                    text: "A move must flip at least one disc. Glowing dots mark the squares where you may play.",
                              },
                              {
                                    icon: "⏭️",
                                    title: "Skipped turn",
                                    text: "No legal moves? Your turn is skipped until you can play again.",
                              },
                              {
                                    icon: "👑",
                                    title: "Most discs wins",
                                    text: "When the board fills up (or nobody can play), the player with the most discs wins.",
                              },
                        ],
                  });
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
            leaveGame() {
                  this.$emit("leave-game");
            },
            leaveRoom() {
                  this.$emit("leave-room");
            },
      },
      beforeDestroy() {
            clearTimeout(this.flipTimer);
      },
      template: `
            <div class="mx-auto w-full max-w-3xl space-y-3 px-3 py-4">
                  <!-- Header -->
                  <div class="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500 to-cyan-500 px-4 py-3 text-white shadow-[0_8px_0_rgba(0,0,0,0.18)]">
                        <div class="deco-circle -right-6 -top-10 size-28"></div>
                        <div class="deco-circle -bottom-12 left-8 size-20"></div>
                        <div class="relative z-10 flex items-center gap-3">
                              <span class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/25 text-2xl shadow-lg">⚫</span>
                              <div class="min-w-0 flex-1 leading-tight">
                                    <div class="flex items-center gap-2">
                                          <h1 class="min-w-0 flex-1 truncate text-lg sm:text-xl font-black leading-none">Reversi</h1>
                                          <button @click="openHelp"
                                                class="btn-bubble shrink-0 rounded-xl bg-white/25 px-2.5 py-1.5 text-xs font-black hover:bg-white/35">
                                                ❓ How to play
                                          </button>
                                    </div>
                                    <p class="mt-0.5 truncate text-xs font-bold text-white/85">Flip the board to your color!</p>
                              </div>
                        </div>
                  </div>

                  <!-- Player cards -->
                  <div class="grid grid-cols-2 gap-3">
                        <div :class="myCardClass"
                              class="relative flex items-center gap-3 overflow-hidden rounded-3xl px-3 py-2.5 shadow-[0_6px_0_rgba(0,0,0,0.14)] transition-all duration-300">
                              <div class="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white/90 text-2xl shadow-lg">
                                    {{ mySymbol === 'w' ? '⚪' : '⚫' }}
                              </div>
                              <div class="min-w-0 flex-1 text-left">
                                    <div class="text-xs font-black uppercase opacity-75">You</div>
                                    <div class="truncate text-base font-black">{{ mySymbol === 'w' ? 'White' : 'Black' }}</div>
                              </div>
                              <div class="shrink-0 text-2xl font-black">{{ myCountC }}</div>
                              <div v-if="phase === 'battle'" class="shrink-0 text-lg font-black"
                                    :class="myTurn ? 'animate-pulse' : 'opacity-40'">
                                    {{ myTurn ? '●' : '○' }}
                              </div>
                        </div>
                        <div :class="opponentCardClass"
                              class="relative flex items-center gap-3 overflow-hidden rounded-3xl px-3 py-2.5 shadow-[0_6px_0_rgba(0,0,0,0.14)] transition-all duration-300">
                              <div class="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white/90 text-2xl shadow-lg">
                                    {{ opponentSymbol === 'w' ? '⚪' : '⚫' }}
                              </div>
                              <div class="min-w-0 flex-1 text-left">
                                    <div class="text-xs font-black uppercase opacity-75">Opponent</div>
                                    <div class="truncate text-base font-black">
                                          {{ opponentName || (opponentSymbol === 'w' ? 'White' : 'Black') }}
                                    </div>
                              </div>
                              <div class="shrink-0 text-2xl font-black">{{ oppCountC }}</div>
                              <div v-if="phase === 'battle'" class="shrink-0 text-lg font-black"
                                    :class="!myTurn ? 'animate-pulse' : 'opacity-40'">
                                    {{ !myTurn ? '●' : '○' }}
                              </div>
                        </div>
                  </div>

                  <!-- Status pill -->
                  <div class="mx-auto w-fit rounded-full bg-white/80 px-6 py-2 text-center shadow-[0_4px_0_rgba(0,0,0,0.12)]">
                        <p class="text-sm font-black" :class="statusColor">{{ status || statusText }}</p>
                        <p class="mt-0.5 text-xs font-bold text-slate-500">{{ totalCells }}/64 discs on board</p>
                  </div>

                  <!-- Board -->
                  <div class="mx-auto w-full max-w-sm rounded-3xl bg-gradient-to-br from-emerald-700 to-emerald-900 p-2 shadow-[0_8px_0_rgba(0,0,0,0.18)]">
                        <div class="grid grid-cols-8 gap-1 p-1">
                              <div v-for="(cell, i) in board" :key="i" @click="play(i)"
                                    :class="['aspect-square rounded-lg flex items-center justify-center bg-emerald-900/60', hoverClass(i)]">
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
                              <div class="mt-2 text-sm font-bold text-white/85">
                                    You {{ myCount }} — {{ opponentName || "Opponent" }} {{ oppCount }}
                              </div>
                              <div class="mt-5 flex justify-center gap-3">
                                    <button @click="requestRematch" :disabled="rematchRequested"
                                          class="btn-bubble rounded-2xl bg-white/25 px-4 py-2 text-sm font-black">
                                          {{ rematchRequested ? "Waiting..." : "↻ Play again" }}
                                    </button>
                              </div>
                        </div>
                  </div>
            </div>
      `,
});