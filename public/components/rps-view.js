var RPS_CHOICES = [
      { id: "rock", icon: "✊", label: "Rock" },
      { id: "paper", icon: "✋", label: "Paper" },
      { id: "scissors", icon: "✌️", label: "Scissors" },
];
var RPS_BEATS = { rock: "scissors", paper: "rock", scissors: "paper" };

Vue.component("rps-view", {
      data() {
            return {
                  phase: "idle", // idle | battle | over
                  winTarget: 2,
                  round: 1,
                  myPick: null,
                  oppPick: null,
                  myScore: 0,
                  oppScore: 0,
                  opponentName: "",
                  result: null, // won | lost
                  status: "",
                  matchOver: false,
                  rematchRequested: false,
                  rematchFromOpponent: false,
                  overlayDismissed: false,
            };
      },
      computed: {
            choices() {
                  return RPS_CHOICES;
            },
            handDisabled() {
                  return this.phase !== "battle" || this.roundLocked;
            },
            roundStatus() {
                  if (this.phase === "idle") return "awaiting a game";
                  if (this.phase === "over") {
                        return this.result === "won"
                              ? "You win the match! 🎉"
                              : (this.opponentName || "Opponent") + " wins the match.";
                  }
                  return this.status;
            },
            statusColor() {
                  if (this.phase === "over") return "text-slate-800";
                  if (this.roundLocked) return "text-orange-600";
                  return "text-green-700";
            },
            myCardClass() {
                  if (this.phase !== "battle" || this.phase === "over")
                        return "bg-white/60 text-slate-900";
                  if (this.roundLocked)
                        return "bg-green-600 text-white ring-4 ring-yellow-300 scale-[1.03] animate-pulse";
                  return "bg-white/60 text-slate-900";
            },
            opponentCardClass() {
                  if (this.phase !== "battle" || this.phase === "over")
                        return "bg-white/60 text-slate-900";
                  if (!this.roundLocked && this.opponentName)
                        return "bg-orange-600 text-white ring-4 ring-yellow-300 scale-[1.03] animate-pulse";
                  return "bg-white/60 text-slate-900";
            },
            resultBannerClass() {
                  return this.result === "won"
                        ? "bg-gradient-to-br from-green-500 to-emerald-700"
                        : "bg-gradient-to-br from-red-500 to-rose-700";
            },
            oppHandIcon() {
                  const c = RPS_CHOICES.find((x) => x.id === this.oppPick);
                  return c ? c.icon : "❔";
            },
            myHandIcon() {
                  const c = RPS_CHOICES.find((x) => x.id === this.myPick);
                  return c ? c.icon : "❔";
            },
      },
      methods: {
            start(data) {
                  this.resetView();
                  this.phase = "battle";
                  this.opponentName = data.opponentName || "";
                  this.winTarget = data.winTarget || 2;
                  this.roundLocked = false;
                  this.status = "Throw your hand!";
            },
            syncState(data) {
                  this.phase = data.active ? "battle" : "over";
                  this.winTarget = data.winTarget || this.winTarget;
                  this.round = data.round || 1;
                  this.myPick = data.myPick || null;
                  this.oppPick = data.oppPick || null;
                  this.myScore = data.myScore || 0;
                  this.oppScore = data.oppScore || 0;
                  this.opponentName = data.opponentName || this.opponentName;
                  this.matchOver = data.result !== null;
                  if (data.active) {
                        this.roundLocked = !!data.myPick;
                        if (data.result) {
                              this.result = data.result;
                              this.status = "";
                        } else {
                              this.status = this.myPick
                                    ? "Waiting for " +
                                            (this.opponentName || "opponent") +
                                            "..."
                                    : "Throw your hand!";
                        }
                  } else {
                        this.roundLocked = true;
                  }
            },
            roundResult(data) {
                  if (this.phase !== "battle") return;
                  this.myPick = data.myPick;
                  this.oppPick = data.oppPick;
                  this.myScore = data.myScore;
                  this.oppScore = data.oppScore;
                  this.round = data.round || this.round;
                  this.matchOver = data.matchOver;
                  this.roundLocked = false;
                  if (data.roundWinner === "draw") {
                        this.status = "Round draw — throw again!";
                  } else if (data.roundWinner === "me") {
                        this.status = "You won the round! 🎉";
                        playSound(messageTone);
                  } else {
                        this.status =
                              (this.opponentName || "Opponent") + " won the round.";
                        playSound(messageTone);
                  }
                  if (!data.matchOver) {
                        this.round += 1;
                        this.status += " Throw again!";
                  }
            },
            pickHand(choice) {
                  if (this.phase !== "battle" || this.roundLocked) return;
                  this.oppPick = null;
                  this.myPick = choice;
                  this.roundLocked = true;
                  this.status =
                        "Waiting for " + (this.opponentName || "opponent") + "...";
                  playSound(moveSound);
                  socket.emit("rps-pick", { choice });
            },
            gameOver(data) {
                  this.phase = "over";
                  this.matchOver = true;
                  this.roundLocked = true;
                  this.result = data.won ? "won" : "lost";
                  this.myScore = data.myScore;
                  this.oppScore = data.oppScore;
                  this.overlayDismissed = false;
                  if (this.result === "won") playSound(win);
                  else playSound(lose);
            },
            info(msg) {
                  this.status = msg;
            },
            requestRematch() {
                  if (this.phase !== "over" || this.rematchRequested) return;
                  this.rematchRequested = true;
                  this.rematchFromOpponent = false;
                  this.status = "Waiting for opponent to rematch...";
                  socket.emit("rps-rematch");
            },
            rematchRequest() {
                  if (this.phase === "over") {
                        this.rematchFromOpponent = true;
                        this.overlayDismissed = true;
                        this.status = "Opponent wants a rematch! Click Play again.";
                        playSound(serverMessageTone);
                  }
            },
            dismissOverlay() {
                  this.overlayDismissed = true;
            },
            handClass(id) {
                  let c =
                        "rounded-2xl flex flex-col items-center justify-center gap-1 py-4 bg-white/60 shadow-xl transition-all duration-200 text-center select-none ";
                  if (this.phase === "battle" && !this.roundLocked)
                        c +=
                              "cursor-pointer hover:scale-105 hover:bg-orange-100 active:scale-95 ";
                  else
                        c +=
                              this.myPick === id
                                    ? "ring-4 ring-yellow-300 bg-orange-200 scale-105 "
                                    : "opacity-50 cursor-not-allowed ";
                  return c;
            },
            leaveRoom() {
                  this.$emit("leave-room");
            },
            resetView() {
                  this.phase = "idle";
                  this.round = 1;
                  this.myPick = null;
                  this.oppPick = null;
                  this.myScore = 0;
                  this.oppScore = 0;
                  this.opponentName = "";
                  this.result = null;
                  this.status = "";
                  this.matchOver = false;
                  this.rematchRequested = false;
                  this.rematchFromOpponent = false;
                  this.overlayDismissed = false;
                  this.roundLocked = false;
            },
      },
      template: `
            <div>
                  <p class="text-3xl p-4 rounded-2xl w-full text-center bg-slate-800 text-white font-bold shadow">
                        ✊ Rock Paper Scissors ✌️
                  </p>

                  <div class="mt-2 grid grid-cols-2 gap-2">
                        <div :class="myCardClass"
                              class="rounded-2xl px-3 py-2 text-center shadow-xl transition-all duration-300">
                              <div class="text-sm font-bold">You</div>
                              <div class="text-3xl font-black">{{ myScore }}</div>
<div v-if="phase === 'battle'" class="text-xs mt-1 font-bold">
                                          {{ roundLocked ? '✓ locked in' : '● pick a hand' }}
                              </div>
                        </div>
                        <div :class="opponentCardClass"
                              class="rounded-2xl px-3 py-2 text-center shadow-xl transition-all duration-300">
                              <div class="text-sm font-bold truncate">
                                    {{ opponentName || "opponent" }}
                              </div>
                              <div class="text-3xl font-black">{{ oppScore }}</div>
<div v-if="phase === 'battle'" class="text-xs mt-1 font-bold">
                                          {{ roundLocked ? '… throwing' : 'waiting' }}
                              </div>
                        </div>
                  </div>

                  <div class="mt-2 rounded-2xl p-2 bg-white/80 shadow-xl text-center">
                        <p class="text-sm font-bold" :class="statusColor">
                              {{ status || roundStatus }}
                        </p>
                        <p class="text-xs text-slate-500 mt-1">
                              First to {{ winTarget }} round wins takes the match
                        </p>
                  </div>

                  <div class="mt-3 grid grid-cols-2 gap-3 md:w-2/3 w-full mx-auto">
                        <div class="rounded-2xl p-3 bg-white/60 shadow-xl text-center">
                              <p class="text-xs font-bold text-slate-600 mb-1">Your hand</p>
                              <div class="text-5xl" :class="myPick ? 'rps-pop' : 'opacity-40'">
                                    {{ myHandIcon }}
                              </div>
                        </div>
                        <div class="rounded-2xl p-3 bg-white/60 shadow-xl text-center">
                              <p class="text-xs font-bold text-slate-600 mb-1 truncate">
                                    {{ opponentName || "Opponent" }}'s hand
                              </p>
                              <div class="text-5xl" :class="oppPick ? 'rps-pop' : 'opacity-40'">
                                    {{ oppHandIcon }}
                              </div>
                        </div>
                  </div>

                  <div class="mt-3 grid grid-cols-3 gap-2 md:w-2/3 w-full mx-auto">
                        <div v-for="c in choices" :key="c.id" @click="pickHand(c.id)"
                              :class="handClass(c.id)">
                              <div class="text-4xl">{{ c.icon }}</div>
                              <div class="text-sm font-bold">{{ c.label }}</div>
                        </div>
                  </div>

                  <div class="mt-3 text-center text-xs text-slate-600 bg-white/50 rounded-xl py-1 md:w-2/3 w-full mx-auto">
                        Round {{ round }} — both players throw at once; whoever wins 2 rounds takes it
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
                        class="fixed inset-0 z-[70] flex items-center justify-center bg-black/50">
                        <div class="ttt-banner rounded-3xl px-8 py-6 text-center shadow-2xl text-white w-80 max-w-full mx-4"
                              :class="resultBannerClass">
                              <div class="text-6xl mb-2">
                                    {{ result === 'won' ? '🎉' : '😢' }}
                              </div>
                              <div class="text-3xl md:text-4xl font-black">
                                    {{ result === 'won' ? 'You Win!' : 'You Lose' }}
                              </div>
                              <div class="mt-2 text-white/80 text-sm font-bold">
                                    You {{ myScore }} — {{ opponentName || "Opponent" }} {{ oppScore }}
                              </div>
                              <button @click.stop="requestRematch" :disabled="rematchRequested"
                                    class="mt-4 rounded-full bg-white/20 hover:bg-white/30 px-4 py-1.5 text-sm font-bold transition-colors">
                                    {{ rematchRequested ? "Waiting for opponent..." : "↻ Play again" }}
                              </button>
                              <p class="mt-2 text-white/70 text-xs">
                                    Both players click Play again to start a new match
                              </p>
                        </div>
                  </div>
            </div>
      `,
});
