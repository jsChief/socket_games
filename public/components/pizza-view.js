Vue.component("pizza-view", {
      data() {
            return {
                  phase: "idle", // idle | placement | battle | over
                  slices: 5,
                  timer: 30,
                  submitted: false,
                  myBoard: Array(20).fill(false),
                  myAttacked: Array(20).fill(false),
                  oppGuesses: Array(20).fill(null),
                  myTurn: false,
                  opponentName: "",
                  result: null,
                  status: "",
                  rematchRequested: false,
                  rematchFromOpponent: false,
                  overlayDismissed: false,
                  pizzaTimer: null,
            };
      },
      computed: {
            mySlices() {
                  return this.myBoard.filter(Boolean).length;
            },
            pizzaStatus() {
                  if (this.phase === "idle") return "awaiting player 2";
                  if (this.phase === "placement") {
                        if (this.submitted)
                              return "Placement locked! Waiting for opponent...";
                        return (
                              "Place " +
                              this.mySlices +
                              "/" +
                              this.slices +
                              " slices on your board"
                        );
                  }
                  if (this.phase === "battle") {
                        return this.myTurn
                              ? "Your turn — tap a cell on the opponent's board!"
                              : "Waiting for " +
                                      (this.opponentName || "opponent") +
                                      "...";
                  }
                  if (this.phase === "over") {
                        return this.result === "won"
                              ? "You found all the slices! You win! 🎉"
                              : (this.opponentName || "Opponent") +
                                      " found all your slices. You lose.";
                  }
                  return this.status;
            },
            statusClass() {
                  if (this.phase === "battle")
                        return this.myTurn
                              ? "text-green-700"
                              : "text-slate-600";
                  if (this.phase === "placement") return "text-orange-600";
                  if (this.phase === "over")
                        return this.result === "won"
                              ? "text-green-700"
                              : "text-red-600";
                  return "text-slate-600";
            },
            myCardClass() {
                  if (this.phase !== "battle")
                        return "bg-white/60 text-slate-800";
                  if (this.myTurn)
                        return "bg-gradient-to-br from-green-400 to-emerald-500 text-white ring-4 ring-yellow-300 scale-[1.03] animate-pulse";
                  return "bg-white/60 text-slate-800";
            },
            opponentCardClass() {
                  if (this.phase !== "battle")
                        return "bg-white/60 text-slate-800";
                  if (!this.myTurn && this.opponentName)
                        return "bg-gradient-to-br from-orange-400 to-rose-500 text-white ring-4 ring-yellow-300 scale-[1.03] animate-pulse";
                  return "bg-white/60 text-slate-800";
            },
            resultBannerClass() {
                  return this.result === "won"
                        ? "bg-gradient-to-br from-green-400 to-emerald-600"
                        : "bg-gradient-to-br from-rose-400 to-red-600";
            },
      },
      methods: {
            autoPlace(data) {
                  this.myBoard = data;
            },
            startTimer() {
                  this.clearTimer();
                  this.pizzaTimer = setInterval(() => {
                        if (this.timer > 0) {
                              this.timer -= 1;
                        } else {
                              this.clearTimer();
                              this.status =
                                    "Time's up! Slices are being placed automatically...";
                        }
                  }, 1000);
            },
            clearTimer() {
                  if (this.pizzaTimer) {
                        clearInterval(this.pizzaTimer);
                        this.pizzaTimer = null;
                  }
            },
            resetLocal() {
                  this.clearTimer();
                  this.phase = "idle";
                  this.submitted = false;
                  this.timer = 30;
                  this.myBoard = Array(20).fill(false);
                  this.myAttacked = Array(20).fill(false);
                  this.oppGuesses = Array(20).fill(null);
                  this.myTurn = false;
                  this.result = null;
                  this.status = "";
                  this.rematchRequested = false;
                  this.rematchFromOpponent = false;
                  this.overlayDismissed = false;
            },
            start(data) {
                  this.resetLocal();
                  this.phase = "placement";
                  this.opponentName = data.opponentName;
                  this.timer = data.timeLimit;
                  this.status =
                        "Place your " + data.slices + " slices on your board!";
                  this.startTimer();
            },
            syncState(data) {
                  this.clearTimer();
                  this.phase = data.phase;
                  this.submitted = data.submitted;
                  this.myBoard = data.myBoard;
                  this.myAttacked = data.myAttacked;
                  this.oppGuesses = data.oppGuesses;
                  this.myTurn = data.myTurn;
                  this.opponentName = data.opponentName;
                  this.result = data.result;
                  if (data.phase === "placement") {
                        this.timer =
                              typeof data.timeLeft === "number"
                                    ? data.timeLeft
                                    : 30;
                        if (!data.submitted) this.startTimer();
                        else
                              this.status =
                                    "Placement locked! Waiting for opponent...";
                  }
            },
            opponentLocked() {
                  this.status = "Opponent locked in their placement";
            },
            battleStart(data) {
                  this.clearTimer();
                  this.phase = "battle";
                  this.myTurn = data.yourTurn;
                  this.opponentName = data.opponentName;
                  this.status = "";
                  if (data.yourTurn) playSound(serverMessageTone);
            },
            attackResult(data) {
                  if (data.youAttacked) {
                        this.$set(this.oppGuesses, data.cell, data.hit);
                        this.status = data.hit
                              ? "Hit! You found a slice! 🍕"
                              : "Miss...";
                        if (data.hit) playSound(messageTone);
                  } else {
                        this.$set(this.myAttacked, data.cell, true);
                        this.status = data.hit
                              ? "Opponent found one of your slices! 🍕"
                              : "Opponent missed.";
                        if (data.hit) playSound(messageTone);
                  }
                  this.myTurn = data.yourTurn;
                  if (data.yourTurn) playSound(serverMessageTone);
            },
            gameOver(data) {
                  this.clearTimer();
                  this.phase = "over";
                  this.result = data.won ? "won" : "lost";
                  this.status = "";
                  this.overlayDismissed = false;
                  if (data.won) {
                        playSound(win);
                  } else {
                        playSound(lose);
                  }
            },
            rematchRequest() {
                  if (this.phase === "over") {
                        this.rematchFromOpponent = true;
                        this.status =
                              "Opponent wants a rematch! Click Play again.";
                        playSound(serverMessageTone);
                  }
            },
            info(msg) {
                  this.status = msg;
            },
            waiting(data) {
                  this.status = data.opponentDone
                        ? "Opponent is ready — waiting for you to lock in!"
                        : "Waiting for opponent to place...";
            },
            placeCell(i) {
                  if (this.phase !== "placement" || this.submitted) return;
                  if (this.myBoard[i]) {
                        this.$set(this.myBoard, i, false);
                        return;
                  }
                  if (this.mySlices >= this.slices) {
                        this.status =
                              "You can only place " + this.slices + " slices.";
                        return;
                  }
                  this.$set(this.myBoard, i, true);
                  playSound(moveSound);
            },
            lockPlacement() {
                  if (this.mySlices !== this.slices) {
                        this.status =
                              "Place all " + this.slices + " slices first.";
                        return;
                  }
                  this.submitted = true;
                  playSound(messageTone);
                  socket.emit("pizza-submit", {
                        board: this.myBoard.slice(),
                  });
            },
            attackCell(i) {
                  if (this.phase !== "battle" || !this.myTurn) return;
                  if (this.oppGuesses[i] !== null) return;
                  playSound(moveSound);
                  socket.emit("pizza-attack", { cell: i });
            },
            dismissOverlay() {
                  this.overlayDismissed = true;
            },
            myCellIcon(i) {
                  if (this.phase === "placement") {
                        return this.myBoard[i] ? "🍕" : "";
                  }
                  if (this.myBoard[i]) return "🍕";
                  if (this.myAttacked[i]) return "❌";
                  return "";
            },
            myCellClass(i) {
                  if (this.phase === "placement") {
                        return this.myBoard[i]
                              ? "bg-orange-100/90 cursor-pointer pizza-pop"
                              : "bg-white/60 cursor-pointer hover:bg-orange-200";
                  }
                  if (this.myAttacked[i]) {
                        return this.myBoard[i]
                              ? "bg-slate-500/70 text-white pizza-pop"
                              : "bg-slate-300 text-slate-600 pizza-pop";
                  }
                  if (this.myBoard[i]) return "bg-orange-100/90";
                  return "bg-white/60";
            },
            oppCellIcon(i) {
                  const g = this.oppGuesses[i];
                  if (g === true) return "🍕";
                  if (g === false) return "❌";
                  return "";
            },
            oppCellClass(i) {
                  const g = this.oppGuesses[i];
                  const clickable =
                        this.phase === "battle" && this.myTurn && g === null;
                  let cls = "bg-white/60";
                  if (g === true) cls = "bg-green-500/70 text-white pizza-hit";
                  else if (g === false) cls = "bg-red-200 pizza-miss";
                  if (clickable)
                        cls += " cursor-pointer hover:bg-yellow-200 hover:scale-105 active:scale-95 transition-all";
                  return cls;
            },
            requestRematch() {
                  if (this.phase !== "over" || this.rematchRequested) return;
                  this.rematchRequested = true;
                  this.rematchFromOpponent = false;
                  this.status = "Waiting for opponent to rematch...";
                  socket.emit("pizza-rematch");
            },
            openHelp() {
                  openHowTo({
                        icon: "🍕",
                        title: "Find My Pizza",
                        tagline: "Hide 5 slices, then hunt your opponent's!",
                        accent: "from-amber-400 to-red-500",
                        steps: [
                              {
                                    icon: "🏠",
                                    title: "Set your slices",
                                    text: "Tap 5 cells on your board to hide your pizza slices, then lock them in. Your opponent never sees them!",
                              },
                              {
                                    icon: "🔦",
                                    title: "Hunt",
                                    text: "Take turns guessing a cell on the opponent's board to try to find their hidden slices.",
                              },
                              {
                                    icon: "🚀",
                                    title: "Race to 5",
                                    text: "Whoever finds all 5 of the opponent's slices first wins the game.",
                              },
                              {
                                    icon: "↻",
                                    title: "Rematch",
                                    text: "After the game, both players can hit Play again to start a fresh round.",
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
      template: `
            <div class="mx-auto w-full max-w-3xl space-y-3 px-3 py-4">
                  <!-- Header -->
                  <div class="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-400 to-red-500 px-5 py-4 text-white shadow-[0_8px_0_rgba(0,0,0,0.18)]">
                        <div class="deco-circle -right-6 -top-10 size-32"></div>
                        <div class="deco-circle -bottom-12 left-8 size-24"></div>
                        <div class="relative z-10 flex items-center gap-8 lg:gap-3">
                              <span class="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-white/25 text-4xl shadow-lg">🍕</span>
                              <div class="lg:flex lg:w-full lg:place-content-between">
                                    <div class="min-w-0 flex-1">
                                    <h1 class="text-3xl font-black leading-none">Find My Pizza</h1>
                                    <p class="mt-1 text-sm font-bold text-white/85">Hide 5 slices, then hunt your opponent's!</p>
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
                              <div class="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white/90 text-2xl shadow-lg">🍕</div>
                              <div class="min-w-0 flex-1 text-left">
                                    <div class="text-xs font-black uppercase opacity-75">You</div>
                                    <div class="truncate text-base font-black">{{ mySlices }}/{{ slices }} slices</div>
                              </div>
                              <div v-if="phase === 'battle'" class="shrink-0 text-lg font-black"
                                    :class="myTurn ? 'animate-pulse' : 'opacity-40'">
                                    {{ myTurn ? '●' : '○' }}
                              </div>
                        </div>
                        <div :class="opponentCardClass"
                              class="relative flex items-center gap-3 overflow-hidden rounded-3xl px-3 py-2.5 shadow-[0_6px_0_rgba(0,0,0,0.14)] transition-all duration-300">
                              <div class="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white/90 text-2xl shadow-lg">🍕</div>
                              <div class="min-w-0 flex-1 text-left">
                                    <div class="text-xs font-black uppercase opacity-75">Opponent</div>
                                    <div class="truncate text-base font-black">{{ opponentName || "Playing…" }}</div>
                              </div>
                              <div v-if="phase === 'battle'" class="shrink-0 text-lg font-black"
                                    :class="!myTurn ? 'animate-pulse' : 'opacity-40'">
                                    {{ !myTurn ? '●' : '○' }}
                              </div>
                        </div>
                  </div>

                  <!-- Status pill -->
                  <div class="mx-auto w-fit rounded-full bg-white/80 px-6 py-2 text-center shadow-[0_4px_0_rgba(0,0,0,0.12)]">
                        <p class="text-sm font-black" :class="statusClass">{{ pizzaStatus }}</p>
                        <p v-if="phase === 'placement'" class="mt-0.5 text-xs font-bold text-orange-600">⏱ Time left: {{ timer }}s</p>
                        <p v-else-if="phase === 'battle'" class="mt-0.5 text-xs font-bold text-slate-500">Find all {{ slices }} slices to win</p>
                  </div>

                  <!-- Boards -->
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div :style="{ order: phase === 'battle' ? 2 : 1 }" class="flex flex-col items-center">
                              <div class="w-full rounded-3xl bg-gradient-to-br from-rose-500 to-orange-500 p-2 shadow-[0_6px_0_rgba(0,0,0,0.16)] md:w-[72%]">
                                    <p class="mb-2 text-center text-sm font-black text-white">
                                          <span class="rounded-full bg-black/15 px-3 py-0.5">My board ({{ mySlices }}/{{ slices }})</span>
                                    </p>
                                    <div class="grid grid-cols-5 gap-1.5 rounded-2xl bg-white/20 p-1.5">
                                          <div v-for="(cell, i) in myBoard" :key="'m' + i" @click="placeCell(i)"
                                                class="aspect-square flex items-center justify-center rounded-lg text-xl transition-all"
                                                :class="myCellClass(i)">
                                                {{ myCellIcon(i) }}
                                          </div>
                                    </div>
                                    <button v-if="phase === 'placement' && !submitted" @click="lockPlacement"
                                          class="btn-bubble w-full mt-2 rounded-2xl bg-white/25 py-2 text-sm font-black"
                                          :class="mySlices === slices ? '' : 'opacity-60'">
                                          🍕 Lock in placement
                                    </button>
                              </div>
                        </div>
                        <div :style="{ order: phase === 'battle' ? 1 : 2 }" class="flex flex-col items-center">
                              <div class="w-full rounded-3xl bg-gradient-to-br from-sky-500 to-blue-600 p-2 shadow-[0_6px_0_rgba(0,0,0,0.16)] md:w-[72%]">
                                    <p class="mb-2 text-center text-sm font-black text-white">
                                          <span class="rounded-full bg-black/15 px-3 py-0.5 truncate inline-block max-w-full">
                                                {{ opponentName || "Opponent" }}'s board
                                          </span>
                                    </p>
                                    <div class="grid grid-cols-5 gap-1.5 rounded-2xl bg-white/20 p-1.5">
                                          <div v-for="(cell, i) in oppGuesses" :key="'o' + i" @click="attackCell(i)"
                                                class="aspect-square flex items-center justify-center rounded-lg text-xl"
                                                :class="oppCellClass(i)">
                                                {{ oppCellIcon(i) }}
                                          </div>
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
                              <div class="text-6xl mb-2">{{ result === 'won' ? '🎉' : '😢' }}</div>
                              <div class="text-3xl md:text-4xl font-black">{{ result === 'won' ? 'You Win!' : 'You Lose' }}</div>
                              <div class="mt-2 text-sm font-bold text-white/85">
                                    {{ result === 'won' ? (opponentName || "Opponent") + " still has slices hidden" : (opponentName || "Opponent") + " found all your slices" }}
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