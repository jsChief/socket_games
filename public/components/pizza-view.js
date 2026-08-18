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
      },
      methods: {
            autoPlace(data){
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
                  if (data.yourTurn) serverMessageTone.play();
            },
            attackResult(data) {
                  if (data.youAttacked) {
                        this.$set(this.oppGuesses, data.cell, data.hit);
                        this.status = data.hit
                              ? "Hit! You found a slice! 🍕"
                              : "Miss...";
                  } else {
                        this.$set(this.myAttacked, data.cell, true);
                        this.status = data.hit
                              ? "Opponent found one of your slices! 🍕"
                              : "Opponent missed.";
                  }
                  this.myTurn = data.yourTurn;
                  if (data.yourTurn) serverMessageTone.play();
            },
            gameOver(data) {
                  this.clearTimer();
                  this.phase = "over";
                  this.result = data.won ? "won" : "lost";
                  this.status = "";
                  if (data.won) {
                        win.play();
                  } else {
                        lose.play();
                  }
            },
            rematchRequest() {
                  if (this.phase === "over") {
                        this.status =
                              "Opponent wants a rematch! Click Play again.";
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
            },
            lockPlacement() {
                  if (this.mySlices !== this.slices) {
                        this.status =
                              "Place all " + this.slices + " slices first.";
                        return;
                  }
                  this.submitted = true;
                  socket.emit("pizza-submit", {
                        board: this.myBoard.slice(),
                  });
            },
            attackCell(i) {
                  if (this.phase !== "battle" || !this.myTurn) return;
                  if (this.oppGuesses[i] !== null) return;
                  socket.emit("pizza-attack", { cell: i });
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
                              ? "bg-orange-100/90 text-white cursor-pointer"
                              : "bg-white/60 cursor-pointer hover:bg-orange-200";
                  }
                  if (this.myAttacked[i]) {
                        return this.myBoard[i]
                              ? "bg-slate-500/70 text-white"
                              : "bg-slate-300 text-slate-600";
                  }
                  if (this.myBoard[i]) return "bg-orange-100/90 text-white";
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
                  if (g === true) cls = "bg-green-500/70 text-white";
                  else if (g === false) cls = "bg-red-200";
                  if (clickable) cls += " cursor-pointer hover:bg-yellow-200";
                  return cls;
            },
            requestRematch() {
                  if (this.phase !== "over" || this.rematchRequested) return;
                  this.rematchRequested = true;
                  this.status = "Waiting for opponent to rematch...";
                  socket.emit("pizza-rematch");
            },
            leaveRoom() {
                  this.$emit("leave-room");
            },
      },
      template: `
            <div>
                  <p class="text-3xl p-4 rounded-2xl w-full text-center bg-orange-500/80 backdrop-blur text-white font-bold shadow">
                        Find My Pizza 🍕
                  </p>

                  <div class="mt-2 flex gap-2 justify-center">
                        <button @click="leaveRoom"
                              class="rounded-2xl px-4 py-1.5 bg-red-600 text-white text-sm font-bold shadow-xl">
                              Leave room
                        </button>
                  </div>

                  <div class="mt-2 rounded-2xl p-2 bg-white/80 backdrop-blur shadow-xl">
                        <p class="text-center text-sm">{{ pizzaStatus }}</p>
                        <p v-if="phase === 'placement'" class="text-center text-lg text-orange-600">
                              Time left: {{ timer }}s
                        </p>
                        <div v-if="phase === 'over'" class="mt-2 flex justify-center">
                              <button @click="requestRematch" :disabled="rematchRequested"
                                    class="rounded-2xl py-2 px-6 bg-green-600 text-white text-sm"
                                    :class="rematchRequested ? 'opacity-50' : ''">
                                    {{ rematchRequested ? "Waiting for opponent..." : "Play again" }}
                              </button>
                        </div>
                  </div>

                  <div class="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div :style="{ order: phase === 'battle' ? 2 : 1 }">
                              <p class="text-center text-sm mb-1 bg-white/50 rounded-xl py-1 md:w-[30vw]">
                                    My board ({{ mySlices }}/{{ slices }})
                              </p>
                              <div class="grid grid-cols-5 gap-1 p-1 bg-neutral-500/70 rounded-xl w-[70vw] md:w-[30vw]">
                                    <div v-for="(cell, i) in myBoard" :key="'m' + i" @click="placeCell(i)"
                                          class="aspect-square rounded-lg flex items-center justify-center text-xl"
                                          :class="myCellClass(i)">
                                          {{ myCellIcon(i) }}
                                    </div>
                              </div>
                              <button v-if="phase === 'placement' && !submitted" @click="lockPlacement"
                                    class="mt-2 w-full rounded-2xl py-2 bg-orange-600 text-white text-sm"
                                    :class="mySlices === slices ? '' : 'opacity-50'">
                                    Lock in placement
                              </button>
                        </div>
                        <div :style="{ order: phase === 'battle' ? 1 : 2 }">
                              <p class="text-center text-sm mb-1 bg-white/50 rounded-xl py-1 md:w-[30vw]">
                                    {{ opponentName || "Opponent" }}'s board
                              </p>
                              <div class="grid grid-cols-5 gap-1 p-1 bg-neutral-500/70 rounded-xl w-[70vw] md:w-[30vw]">
                                    <div v-for="(cell, i) in oppGuesses" :key="'o' + i" @click="attackCell(i)"
                                          class="aspect-square rounded-lg flex items-center justify-center text-xl"
                                          :class="oppCellClass(i)">
                                          {{ oppCellIcon(i) }}
                                    </div>
                              </div>
                        </div>
                  </div>
            </div>
      `,
});
