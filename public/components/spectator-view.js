// Spectator view: a read-only window into a full room's game. Shows the two
// players, whose turn it is, and the live board for Tic-Tac-Toe / Reversi /
// Find My Pizza (pizza hides the secret slice placements, only showing probes).
var SPECTATE_TTT_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

Vue.component("spectator-view", {
      data() {
            return {
                  code: "",
                  roomInfo: null,
                  game: null, // tictactoe | reversi | pizza
                  ttt: {
                        table: [],
                        virtualTable: [],
                        currentPlayer: 0,
                        gameOn: false,
                        names: [],
                        symbols: [],
                  },
                  rev: {
                        board: [],
                        currentSymbol: null,
                        active: false,
                        names: [],
                        symbols: [],
                  },
                  pizza: {
                        phase: "idle",
                        turn: 0,
                        submitted: [],
                        found: [],
                        attacked: [],
                        names: [],
                  },
                  rps: {
                        active: false,
                        round: 0,
                        picks: [],
                        wins: [0, 0],
                        result: null,
                        names: [],
                  },
                  winLine: null,
            };
      },
      computed: {
            seatedPlayers() {
                  return this.roomInfo && this.roomInfo.players
                        ? this.roomInfo.players
                        : [];
            },
            spectatorCount() {
                  return this.roomInfo ? this.roomInfo.spectators.length : 0;
            },
            openSeats() {
                  return this.roomInfo ? this.roomInfo.openSeats : 2;
            },
            gameOverStatus() {
                  if (this.game === "tictactoe") return !this.ttt.gameOn;
                  if (this.game === "reversi") return this.rev.over;
                  if (this.game === "pizza") return this.pizza.phase === "over";
                  if (this.game === "rps") return this.rps.result !== null;
                  return false;
            },
            currentTurnIndex() {
                  if (this.game === "tictactoe") {
                        return this.ttt.gameOn ? this.ttt.currentPlayer : -1;
                  }
                  if (this.game === "reversi") {
                        if (!this.rev.active) return -1;
                        return this.rev.symbols.indexOf(this.rev.currentSymbol);
                  }
                  if (this.game === "pizza") {
                        return this.pizza.phase === "battle" ? this.pizza.turn : -1;
                  }
                  return -1;
            },
            displayPlayers() {
                  const names =
                        this.game === "tictactoe"
                              ? this.ttt.names
                              : this.game === "reversi"
                                    ? this.rev.names
                                    : this.game === "pizza"
                                          ? this.pizza.names
                                          : this.game === "rps"
                                                ? this.rps.names
                                                : null;
                  const symbols =
                        this.game === "tictactoe"
                              ? this.ttt.symbols
                              : this.game === "reversi"
                                    ? this.rev.symbols
                                    : null;
                  const turnIdx = this.currentTurnIndex;
                  const over = this.gameOverStatus;
                  return [0, 1].map((i) => ({
                        name:
                              (names && names[i]) ||
                              (this.seatedPlayers[i] && this.seatedPlayers[i].name) ||
                              "Player " + (i + 1),
                        symbol: (symbols && symbols[i]) || "",
                        isTurn: !over && turnIdx === i,
                  }));
            },
            statusText() {
                  const over = this.gameOverStatus;
                  if (this.game === "tictactoe") {
                        if (over) return "Game over — Tic Tac Toe";
                        const n = this.ttt.names[this.ttt.currentPlayer];
                        return (n || "Player") + "'s turn";
                  }
                  if (this.game === "reversi") {
                        if (over) return "Game over — Reversi";
                        const idx = this.rev.symbols.indexOf(this.rev.currentSymbol);
                        return (this.rev.names[idx] || "Player") + "'s turn";
                  }
                  if (this.game === "pizza") {
                        if (this.pizza.phase === "placement") {
                              return "Players are placing their slices...";
                        }
                        if (over) return "Game over — Find My Pizza";
                        return (
                              (this.pizza.names[this.pizza.turn] || "Player") +
                              " is hunting for slices 🍕"
                        );
                  }
                  if (this.game === "rps") {
                        if (over) return "Game over — Rock Paper Scissors";
                        return "Both players are throwing ✊✋✌";
                  }
                  return "Waiting for a game to start...";
            },
            canTakeSeat() {
                  return this.openSeats > 0 && !this.gameOverStatus && !this.game;
            },
      },
      methods: {
            start(data) {
                  this.reset();
                  this.code = data && data.code ? data.code : "";
            },
            setRoomInfo(data) {
                  this.roomInfo = data;
                  if (data && data.code) this.code = data.code;
            },
            handleTictactoe(d) {
                  this.game = "tictactoe";
                  this.ttt = {
                        table: (d.table || []).slice(),
                        virtualTable: (d.virtualTable || d.table || []).slice(),
                        currentPlayer:
                              typeof d.currentPlayer === "number" ? d.currentPlayer : 0,
                        gameOn: !!d.gameOn,
                        names: d.names || [],
                        symbols: d.symbols || [],
                  };
                  this.winLine = this.computeWinLine(this.ttt.virtualTable);
            },
            handleReversi(d) {
                  this.game = "reversi";
                  this.rev = {
                        board: (d.board || []).slice(),
                        currentSymbol: d.currentSymbol || null,
                        active: !!d.active,
                        over: !!d.over,
                        names: d.names || [],
                        symbols: d.symbols || [],
                  };
                  this.winLine = null;
            },
            handlePizza(d) {
                  this.game = "pizza";
                  this.pizza = {
                        phase: d.phase || "idle",
                        turn: typeof d.turn === "number" ? d.turn : 0,
                        active: !!d.active,
                        submitted: d.submitted || [],
                        found: d.found || [],
                        attacked: d.attacked || [],
                        names: d.names || [],
                  };
                  this.winLine = null;
            },
            handleRps(d) {
                  this.game = "rps";
                  this.rps = {
                        active: !!d.active,
                        round: d.round || 0,
                        picks: d.picks || [],
                        wins: d.wins || [0, 0],
                        history: d.history || [],
                        result: d.result,
                        names: d.names || [],
                  };
                  this.winLine = null;
            },
            rpsIcon(choice) {
                  const icons = { rock: "✊", paper: "✋", scissors: "✌️" };
                  return icons[choice] || "❔";
            },
            handleReset() {
                  this.game = null;
                  this.winLine = null;
            },
            computeWinLine(vt) {
                  for (const l of SPECTATE_TTT_LINES) {
                        if (
                              vt[l[0]] &&
                              vt[l[0]] === vt[l[1]] &&
                              vt[l[0]] === vt[l[2]]
                        ) {
                              return l;
                        }
                  }
                  return null;
            },
            revCounts() {
                  let b = 0,
                        w = 0;
                  for (const c of this.rev.board) {
                        if (c === "b") b++;
                        else if (c === "w") w++;
                  }
                  return { b, w };
            },
            leaveRoom() {
                  socket.emit("leave-room");
            },
            takeSeat() {
                  socket.emit("take-seat");
            },
            reset() {
                  this.roomInfo = null;
                  this.game = null;
                  this.winLine = null;
                  this.ttt = {
                        table: [],
                        virtualTable: [],
                        currentPlayer: 0,
                        gameOn: false,
                        names: [],
                        symbols: [],
                  };
                  this.rev = {
                        board: [],
                        currentSymbol: null,
                        active: false,
                        names: [],
                        symbols: [],
                  };
                  this.pizza = {
                        phase: "idle",
                        turn: 0,
                        submitted: [],
                        found: [],
                        attacked: [],
                        names: [],
                  };
                  this.rps = {
                        active: false,
                        round: 0,
                        picks: [],
                        wins: [0, 0],
                        result: null,
                        names: [],
                  };
            },
      },
      template: `
            <div class="overflow-y-scroll h-full no-scrollbar">
                  <p class="text-3xl font-bold p-3 rounded-2xl bg-white/90 text-center shadow">
                        👁 Spectator · Room {{ code }}
                  </p>
                  <p class="mt-1 text-center text-xs text-slate-600 bg-white/60 rounded-xl py-1">
                        {{ spectatorCount }} watching · Tic Tac Toe / Pizza / Reversi / RPS are live right here
                  </p>

                  <div class="mt-2 grid grid-cols-2 gap-2">
                        <div v-for="(p, i) in displayPlayers" :key="i"
                              :class="p.isTurn ? 'bg-orange-600 text-white ring-4 ring-yellow-300 animate-pulse' : 'bg-white/60 text-slate-900'"
                              class="rounded-2xl px-3 py-2 text-center shadow-xl transition-all duration-300">
                              <div class="text-sm font-bold truncate">{{ p.name }}</div>
                              <div class="text-lg font-black">{{ p.symbol }}</div>
                              <div class="text-xs font-bold mt-0.5">{{ p.isTurn ? '● playing' : 'watching' }}</div>
                        </div>
                  </div>

                  <div class="mt-2 rounded-2xl p-2 bg-white/80 shadow-xl text-center">
                        <p class="text-sm font-bold"
                              :class="gameOverStatus ? 'text-slate-700' : 'text-orange-600'">
                              {{ statusText }}
                        </p>
                  </div>

                  <!-- No game yet -->
                  <div v-if="!game" class="mt-4 rounded-2xl p-6 bg-white/60 text-center shadow-xl">
                        <div class="text-5xl">👀</div>
                        <p class="mt-2 font-bold text-slate-700">Waiting for a game to start...</p>
                        <p class="text-sm text-slate-500 mt-1 text-left">
                              You're watching <b>{{ displayPlayers[0].name }}</b> and
                              <b>{{ displayPlayers[1].name }}</b>. When they pick a game you'll see the
                              live board, moves and whose turn it is.
                        </p>
                  </div>

                  <!-- Tic Tac Toe board -->
                  <div v-if="game === 'tictactoe'"
                        class="md:w-1/2 w-full mx-auto mt-3 rounded-2xl p-2 bg-slate-900 shadow-xl">
                        <div class="grid grid-cols-3 gap-1 p-1">
                              <div v-for="(cell, i) in ttt.table" :key="i"
                                    class="aspect-square rounded-lg flex items-center justify-center text-3xl font-black"
                                    :class="winLine && winLine.indexOf(i) !== -1 ? 'bg-yellow-400 text-slate-900 ttt-win-glow' : cell === 'x' ? 'bg-orange-500 text-white' : cell === 'o' ? 'bg-sky-500 text-white' : 'bg-white/10'">
                                    <span v-if="cell !== ''" class="ttt-pop">{{ cell === 'x' ? '✕' : '◯' }}</span>
                              </div>
                        </div>
                  </div>

                  <!-- Reversi board -->
                  <div v-if="game === 'reversi'"
                        class="md:w-1/2 w-full mx-auto mt-3 rounded-2xl p-2 bg-emerald-900/80 shadow-xl">
                        <div class="grid grid-cols-8 gap-1 p-1">
                              <div v-for="(cell, i) in rev.board" :key="i"
                                    class="aspect-square rounded-lg flex items-center justify-center bg-emerald-900/50">
                                    <div v-if="cell !== ''" class="w-4/5 h-4/5 rounded-full shadow-lg"
                                          :class="cell === 'b' ? 'bg-slate-900' : 'bg-white ring-2 ring-slate-300'"></div>
                              </div>
                        </div>
                        <p class="text-center text-xs font-bold text-white/80 py-1">
                              {{ displayPlayers[0].name }} ⚫ {{ revCounts().b }} — {{ revCounts().w }} ⚪ {{ displayPlayers[1].name }}
                        </p>
                  </div>

                  <!-- Find My Pizza: both probe grids (slices stay hidden) -->
                  <div v-if="game === 'pizza'" class="md:w-1/2 w-full mx-auto mt-3">
                        <div v-for="bi in [0, 1]" :key="bi"
                              class="rounded-2xl p-2 bg-white/70 shadow-xl">
                              <p class="text-xs font-bold mb-1 text-slate-700">
                                    {{ pizza.names[bi] || 'Player ' + (bi + 1) }}'s board —
                                    found {{ pizza.found[bi] }}/5
                              </p>
                              <div class="bg-slate-800 rounded-xl p-1 grid grid-cols-5 gap-1">
                                    <div v-for="(v, c) in pizza.attacked[bi] || []" :key="c"
                                          class="aspect-square rounded-md flex items-center justify-center text-sm font-black"
                                          :class="v === true ? 'bg-yellow-400/30 text-yellow-200' : v === false ? 'bg-slate-700 text-slate-500' : 'bg-slate-900/40'">
                                          {{ v === true ? '🍕' : v === false ? '·' : '' }}
                                    </div>
                              </div>
                        </div>
                        <p class="text-center text-[11px] text-slate-500 mt-1">
                              🍕 = found slice · · = empty probe · blank = not yet probed
                        </p>
                  </div>

                  <!-- Rock Paper Scissors: live hands + score -->
                  <div v-if="game === 'rps'" class="md:w-2/3 w-full mx-auto mt-3">
                        <div class="rounded-2xl p-3 bg-white/70 shadow-xl">
                              <div class="grid grid-cols-2 gap-2 text-center items-center">
                                    <div>
                                          <p class="text-xs font-bold text-slate-600 truncate">
                                                {{ rps.names[0] || 'Player 1' }}
                                          </p>
                                          <div class="text-5xl" :class="rps.picks[0] ? 'rps-pop' : 'opacity-40'">{{ rpsIcon(rps.picks[0]) }}</div>
                                          <div class="text-2xl font-black text-slate-800">{{ rps.wins[0] }}</div>
                                    </div>
                                    <div>
                                          <p class="text-xs font-bold text-slate-600 truncate">
                                                {{ rps.names[1] || 'Player 2' }}
                                          </p>
                                          <div class="text-5xl" :class="rps.picks[1] ? 'rps-pop' : 'opacity-40'">{{ rpsIcon(rps.picks[1]) }}</div>
                                          <div class="text-2xl font-black text-slate-800">{{ rps.wins[1] }}</div>
                                    </div>
                              </div>
                              <p class="text-center text-xs text-slate-500 mt-2">
                                    Round {{ rps.round }} · first to 2 round wins takes the match
                              </p>
                        </div>
                  </div>

                  <div class="mt-3 flex gap-2 justify-center pb-4">
                        <button v-if="canTakeSeat" @click="takeSeat"
                              class="rounded-2xl px-4 py-1.5 bg-green-600 text-white text-sm font-bold shadow-xl hover:scale-105 active:scale-95 transition-all">
                              🪑 Take a seat
                        </button>
                        <button @click="leaveRoom"
                              class="rounded-2xl px-4 py-1.5 bg-red-600 text-white text-sm font-bold shadow-xl">
                              Leave room
                        </button>
                  </div>
            </div>
      `,
});