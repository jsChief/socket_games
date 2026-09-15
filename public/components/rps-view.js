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
                        return "bg-white/60 text-slate-800";
                  if (this.roundLocked)
                        return "bg-gradient-to-br from-green-400 to-emerald-500 text-white ring-4 ring-yellow-300 scale-[1.03] animate-pulse";
                  return "bg-white/60 text-slate-800";
            },
            opponentCardClass() {
                  if (this.phase !== "battle" || this.phase === "over")
                        return "bg-white/60 text-slate-800";
                  if (!this.roundLocked && this.opponentName)
                        return "bg-gradient-to-br from-orange-400 to-rose-500 text-white ring-4 ring-yellow-300 scale-[1.03] animate-pulse";
                  return "bg-white/60 text-slate-800";
            },
            resultBannerClass() {
                  return this.result === "won"
                        ? "bg-gradient-to-br from-green-400 to-emerald-600"
                        : "bg-gradient-to-br from-rose-400 to-red-600";
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
                        "rounded-3xl flex flex-col items-center justify-center gap-1 py-4 bg-white/60 shadow-[0_6px_0_rgba(0,0,0,0.14)] transition-all duration-200 text-center select-none ";
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
            openHelp() {
                  openHowTo({
                        icon: "✊",
                        title: "Rock Paper Scissors",
                        tagline: "Best of 3 classic showdown!",
                        accent: "from-purple-500 to-fuchsia-500",
                        steps: [
                              {
                                    icon: "✊✋✌️",
                                    title: "Pick a hand",
                                    text: "Choose rock, paper or scissors. Both players throw at the same time every round.",
                              },
                              {
                                    icon: "🔁",
                                    title: "Who wins",
                                    text: "Rock crushes scissors, scissors cut paper, and paper covers rock.",
                              },
                              {
                                    icon: "🎯",
                                    title: "First to 2",
                                    text: "Win 2 rounds to take the match. Draws just replay the round.",
                              },
                              {
                                    icon: "↻",
                                    title: "Rematch",
                                    text: "Both players press Play again to start a fresh match.",
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
            <div class="mx-auto w-full max-w-3xl space-y-3 px-3 py-4">
                  <!-- Header -->
                  <div class="relative overflow-hidden rounded-3xl bg-gradient-to-br from-purple-500 to-fuchsia-500 px-5 py-4 text-white shadow-[0_8px_0_rgba(0,0,0,0.18)]">
                        <div class="deco-circle -right-6 -top-10 size-32"></div>
                        <div class="deco-circle -bottom-12 left-8 size-24"></div>
                        <div class="relative z-10 flex items-center gap-8 lg:gap-3">
                              <span class="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-white/25 text-4xl shadow-lg">✊</span>
                              <div class="lg:flex lg:w-full lg:place-content-between">
                                    <div class="min-w-0 flex-1">
                                    <h1 class="text-3xl font-black leading-none">Rock Paper Scissors</h1>
                                    <p class="mt-1 text-sm font-bold text-white/85">Best of 3 classic showdown!</p>
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
                                    ✊
                              </div>
                              <div class="min-w-0 flex-1 text-left">
                                    <div class="text-xs font-black uppercase opacity-75">You</div>
                                    <div class="truncate text-base font-black">{{ myScore }} {{ myScore === 1 ? 'round' : 'rounds' }}</div>
                              </div>
                              <div v-if="phase === 'battle'" class="shrink-0 text-lg font-black"
                                    :class="roundLocked ? 'animate-pulse' : 'opacity-40'">
                                    {{ roundLocked ? '✓' : '●' }}
                              </div>
                        </div>
                        <div :class="opponentCardClass"
                              class="relative flex items-center gap-3 overflow-hidden rounded-3xl px-3 py-2.5 shadow-[0_6px_0_rgba(0,0,0,0.14)] transition-all duration-300">
                              <div class="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white/90 text-2xl shadow-lg">
                                    ✌️
                              </div>
                              <div class="min-w-0 flex-1 text-left">
                                    <div class="text-xs font-black uppercase opacity-75">Opponent</div>
                                    <div class="truncate text-base font-black">{{ opponentName || "Playing…" }}</div>
                              </div>
                              <div v-if="phase === 'battle'" class="shrink-0 text-lg font-black"
                                    :class="!roundLocked ? 'animate-pulse' : 'opacity-40'">
                                    {{ !roundLocked ? '●' : '…' }}
                              </div>
                        </div>
                  </div>

                  <!-- Status pill -->
                  <div class="mx-auto w-fit rounded-full bg-white/80 px-6 py-2 text-center shadow-[0_4px_0_rgba(0,0,0,0.12)]">
                        <p class="text-sm font-black" :class="statusColor">{{ status || roundStatus }}</p>
                        <p class="mt-0.5 text-xs font-bold text-slate-500">First to {{ winTarget }} round wins takes the match</p>
                  </div>

                  <!-- Hands -->
                  <div class="grid grid-cols-2 gap-3">
                        <div class="rounded-3xl bg-white/60 p-3 text-center shadow-[0_6px_0_rgba(0,0,0,0.14)]">
                              <p class="mb-1 text-xs font-black text-slate-600">Your hand</p>
                              <div class="text-5xl" :class="myPick ? 'rps-pop' : 'opacity-40'">
                                    {{ myHandIcon }}
                              </div>
                        </div>
                        <div class="rounded-3xl bg-white/60 p-3 text-center shadow-[0_6px_0_rgba(0,0,0,0.14)]">
                              <p class="mb-1 text-xs font-black text-slate-600 truncate">{{ opponentName || "Opponent" }}'s hand</p>
                              <div class="text-5xl" :class="oppPick ? 'rps-pop' : 'opacity-40'">
                                    {{ oppHandIcon }}
                              </div>
                        </div>
                  </div>

                  <!-- Choice buttons -->
                  <div class="grid grid-cols-3 gap-2">
                        <div v-for="c in choices" :key="c.id" @click="pickHand(c.id)"
                              :class="handClass(c.id)">
                              <div class="text-4xl">{{ c.icon }}</div>
                              <div class="text-sm font-black">{{ c.label }}</div>
                        </div>
                  </div>

                  <!-- Round info -->
                  <div class="mx-auto w-fit rounded-full bg-white/50 px-5 py-1 text-center text-xs font-bold text-slate-600 shadow-sm">
                        Round {{ round }} — both players throw at once
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
                                    {{ result === 'won' ? '🎉' : '😢' }}
                              </div>
                              <div class="text-3xl md:text-4xl font-black">
                                    {{ result === 'won' ? 'You Win!' : 'You Lose' }}
                              </div>
                              <div class="mt-2 text-sm font-bold text-white/85">
                                    You {{ myScore }} — {{ opponentName || "Opponent" }} {{ oppScore }}
                              </div>
                              <div class="mt-5 flex justify-center gap-3">
                                    <button @click.stop="requestRematch" :disabled="rematchRequested"
                                          class="btn-bubble rounded-2xl bg-white/25 px-4 py-2 text-sm font-black">
                                          {{ rematchRequested ? "Waiting..." : "↻ Play again" }}
                                    </button>
                              </div>
                              <p class="mt-2 text-xs font-bold text-white/70">
                                    Both players click Play again to start a new match
                              </p>
                        </div>
                  </div>
            </div>
      `,
});