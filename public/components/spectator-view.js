// Spectator view: a read-only window into a full room's game, styled like the
// normal player game views. Shows the two players, whose turn it is, and the
// live board for Tic-Tac-Toe / Reversi / Find My Pizza / Rock Paper Scissors /
// Connect 4 (pizza hides the secret slice placements, only showing probes).
var SPECTATE_TTT_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];
var SPECTATE_C4_ROWS = 6;
var SPECTATE_C4_COLS = 7;

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
                  c4: {
                        board: [],
                        currentSymbol: null,
                        active: false,
                        gameOver: false,
                        winLine: [],
                        names: [],
                        symbols: [],
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
                  if (this.game === "connect4") return this.c4.gameOver;
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
                  if (this.game === "connect4") {
                        if (!this.c4.active || this.c4.gameOver) return -1;
                        return this.c4.symbols.indexOf(this.c4.currentSymbol);
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
                                                : this.game === "connect4"
                                                      ? this.c4.names
                                                      : null;
                  const symbols =
                        this.game === "tictactoe"
                              ? this.ttt.symbols
                              : this.game === "reversi"
                                    ? this.rev.symbols
                                    : this.game === "connect4"
                                          ? this.c4.symbols
                                          : null;
                  const up = (s) => (s ? s.toUpperCase() : "");
                  const counts = this.revCounts();
                  const turnIdx = this.currentTurnIndex;
                  const over = this.gameOverStatus;
                  return [0, 1].map((i) => {
                        let icon = "👁";
                        let sub = "";
                        if (this.game === "tictactoe") {
                              icon = up(symbols[i]) || "?";
                              sub = symbols[i] ? "Mark " + up(symbols[i]) : "";
                        } else if (this.game === "reversi") {
                              icon = symbols[i] === "w" ? "⚪" : "⚫";
                              sub = counts[symbols[i]] + " discs";
                        } else if (this.game === "pizza") {
                              icon = "🍕";
                              sub = (this.pizza.found[i] || 0) + "/5 slices found";
                        } else if (this.game === "rps") {
                              icon = i === 0 ? "✊" : "✌️";
                              const w = this.rps.wins[i] || 0;
                              sub = w + (w === 1 ? " round" : " rounds");
                        } else if (this.game === "connect4") {
                              icon = symbols[i] === "red" ? "🔴" : "🟡";
                              sub = symbols[i] === "red" ? "Red" : "Yellow";
                        }
                        return {
                              name:
                                    (names && names[i]) ||
                                    (this.seatedPlayers[i] &&
                                          this.seatedPlayers[i].name) ||
                                    "Player " + (i + 1),
                              symbol: (symbols && symbols[i]) || "",
                              icon,
                              sub,
                              isTurn: !over && turnIdx === i,
                        };
                  });
            },
            statusText() {
                  if (this.game === "tictactoe") {
                        if (!this.ttt.gameOn) {
                              if (this.winLine && this.winLine.length) {
                                    const sym = this.ttt.virtualTable[this.winLine[0]];
                                    const idx = this.ttt.symbols.indexOf(sym);
                                    return (
                                          (this.ttt.names[idx] || "Player") + " wins! 🎉"
                                    );
                              }
                              if (this.ttt.table && this.ttt.table.some((c) => c))
                                    return "It's a draw! 🤝";
                              return "Waiting for a game to start...";
                        }
                        return (this.ttt.names[this.ttt.currentPlayer] || "Player") + "'s turn";
                  }
                  if (this.game === "reversi") {
                        if (this.rev.over) {
                              const { b, w } = this.revCounts();
                              if (b + w === 0) return "Waiting for a game to start...";
                              if (b > w) {
                                    const idx = this.rev.symbols.indexOf("b");
                                    return (this.rev.names[idx] || "Player") + " wins! 🎉";
                              }
                              if (w > b) {
                                    const idx = this.rev.symbols.indexOf("w");
                                    return (this.rev.names[idx] || "Player") + " wins! 🎉";
                              }
                              return "It's a draw! 🤝";
                        }
                        const ridx = this.rev.symbols.indexOf(this.rev.currentSymbol);
                        return (this.rev.names[ridx] || "Player") + "'s turn";
                  }
                  if (this.game === "pizza") {
                        if (this.pizza.phase === "placement") {
                              return "Players are placing their slices...";
                        }
                        if (this.pizza.phase === "over") {
                              if (this.pizza.found[0] >= 5)
                                    return (
                                          (this.pizza.names[0] || "Player") +
                                          " found all the slices — wins! 🎉"
                                    );
                              if (this.pizza.found[1] >= 5)
                                    return (
                                          (this.pizza.names[1] || "Player") +
                                          " found all the slices — wins! 🎉"
                                    );
                              return "Game over — Find My Pizza";
                        }
                        return (
                              (this.pizza.names[this.pizza.turn] || "Player") +
                              " is hunting for slices 🍕"
                        );
                  }
                  if (this.game === "rps") {
                        if (this.rps.result !== null) {
                              return (
                                    (this.rps.names[this.rps.result] || "Player") +
                                    " wins the match! 🎉"
                              );
                        }
                        return this.rps.picks[0] && this.rps.picks[1]
                              ? "Both players are throwing ✊✋✌"
                              : "Round " +
                                      (this.rps.round || 1) +
                                      " — both players are picking ✊✋✌";
                  }
                  if (this.game === "connect4") {
                        if (this.c4.gameOver) {
                              if (this.c4.winLine && this.c4.winLine.length) {
                                    const sym = this.c4.board[this.c4.winLine[0]];
                                    const idx = this.c4.symbols.indexOf(sym);
                                    return (this.c4.names[idx] || "Player") + " wins! 🎉";
                              }
                              return "It's a draw! 🤝";
                        }
                        const cidx = this.c4.symbols.indexOf(this.c4.currentSymbol);
                        return (this.c4.names[cidx] || "Player") + "'s turn";
                  }
                  return "Waiting for a game to start...";
            },
            statusColor() {
                  if (this.gameOverStatus) return "text-slate-800";
                  if (this.game) return "text-orange-600";
                  return "text-slate-600";
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
            handleConnect4(d) {
                  this.game = "connect4";
                  this.c4 = {
                        board: (d.board || []).slice(),
                        currentSymbol: d.currentSymbol || null,
                        active: !!d.active,
                        gameOver: !!d.gameOver,
                        winLine: d.winLine || [],
                        names: d.names || [],
                        symbols: d.symbols || [],
                  };
                  this.winLine = null;
            },
            c4DiscClass(symbol, i) {
                  let c = "w-full h-full rounded-full shadow-lg transition-all duration-150 ";
                  const halo =
                        this.c4.winLine.indexOf(i) !== -1
                              ? "ring-4 ring-yellow-300 shadow-[0_0_22px_6px_rgba(250,204,21,0.55)] "
                              : "";
                  const color =
                        symbol === "red"
                              ? "bg-gradient-to-br from-red-400 to-red-600 "
                              : "bg-gradient-to-br from-yellow-300 to-amber-500 ";
                  return c + color + halo;
            },
            rpsIcon(choice) {
                  const icons = { rock: "✊", paper: "✋", scissors: "✌️" };
                  return icons[choice] || "❔";
            },
            tttDisplay(s) {
                  return s ? s.toUpperCase() : "";
            },
            spTTTCellClass(i) {
                  let c = "bg-slate-900 ";
                  if (this.ttt.table[i] === "x") c += "text-cyan-300 ";
                  else if (this.ttt.table[i] === "o") c += "text-yellow-300 ";
                  else c += "text-slate-800 ";
                  if (this.winLine && this.winLine.indexOf(i) !== -1) c += "ttt-win-cell ";
                  return c;
            },
            spPizzaCellClass(v) {
                  let cls = "bg-white/60";
                  if (v === true) cls = "bg-green-500/70 text-white pizza-hit";
                  else if (v === false) cls = "bg-red-200 pizza-miss";
                  return cls;
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
                  this.c4 = {
                        board: [],
                        currentSymbol: null,
                        active: false,
                        gameOver: false,
                        winLine: [],
                        names: [],
                        symbols: [],
                  };
            },
      },
      template: `
            <div class="mx-auto w-full max-w-3xl space-y-3 px-3 py-4">
                  <!-- Header -->
                  <div class="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-500 to-fuchsia-500 px-4 py-3 text-white shadow-[0_8px_0_rgba(0,0,0,0.18)]">
                        <div class="deco-circle -right-6 -top-10 size-28"></div>
                        <div class="deco-circle -bottom-12 left-8 size-20"></div>
                        <div class="relative z-10 flex items-center gap-3">
                              <span class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/25 text-2xl shadow-lg">👁</span>
                              <div class="min-w-0 flex-1 leading-tight">
                                    <div class="flex items-center gap-2">
                                          <h1 class="min-w-0 flex-1 truncate text-lg sm:text-xl font-black leading-none">Spectator</h1>
                                          <span class="shrink-0 rounded-xl bg-white/25 px-2.5 py-1 text-xs font-black">
                                                {{ spectatorCount }} watching
                                          </span>
                                    </div>
                                    <p class="mt-0.5 truncate text-xs font-bold text-white/85">Watching room {{ code }}</p>
                              </div>
                        </div>
                  </div>

                  <!-- Player cards -->
                  <div class="grid grid-cols-2 gap-3">
                        <div v-for="(p, i) in displayPlayers" :key="i"
                              :class="p.isTurn ? 'bg-gradient-to-br from-green-400 to-emerald-500 text-white ring-4 ring-yellow-300 scale-[1.03] animate-pulse' : 'bg-white/60 text-slate-800'"
                              class="relative flex items-center gap-3 overflow-hidden rounded-3xl px-3 py-2.5 shadow-[0_6px_0_rgba(0,0,0,0.14)] transition-all duration-300">
                              <div class="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white/90 text-2xl font-black text-slate-700 shadow-lg">
                                    {{ p.icon }}
                              </div>
                              <div class="min-w-0 flex-1 text-left">
                                    <div class="text-xs font-black uppercase opacity-75">Player {{ i + 1 }}</div>
                                    <div class="truncate text-base font-black">{{ p.name }}</div>
                                    <div v-if="p.sub" class="truncate text-xs font-bold opacity-75">{{ p.sub }}</div>
                              </div>
                              <div v-if="!gameOverStatus" class="shrink-0 text-lg font-black"
                                    :class="p.isTurn ? 'animate-pulse' : 'opacity-40'">
                                    {{ p.isTurn ? '●' : '○' }}
                              </div>
                        </div>
                  </div>

                  <!-- Status pill -->
                  <div class="mx-auto w-fit rounded-full bg-white/80 px-6 py-2 text-center shadow-[0_4px_0_rgba(0,0,0,0.12)]">
                        <p class="text-sm font-black" :class="statusColor">{{ statusText }}</p>
                        <p v-if="game" class="mt-0.5 text-xs font-bold text-slate-500">{{ spectatorCount }} watching</p>
                  </div>

                  <!-- No game yet -->
                  <div v-if="!game" class="rounded-3xl bg-white/60 p-6 text-center shadow-[0_6px_0_rgba(0,0,0,0.14)]">
                        <div class="text-5xl">👀</div>
                        <p class="mt-2 font-black text-slate-700">Waiting for a game to start...</p>
                        <p class="mt-1 text-sm text-slate-500">
                              You're watching <b>{{ displayPlayers[0].name }}</b> and
                              <b>{{ displayPlayers[1].name }}</b>. When they pick a game you'll see the
                              live board, moves and whose turn it is.
                        </p>
                  </div>

                  <!-- Tic Tac Toe board -->
                  <div v-if="game === 'tictactoe'"
                        class="mx-auto w-full max-w-sm rounded-3xl bg-gradient-to-br from-rose-500 to-orange-400 p-2 shadow-[0_8px_0_rgba(0,0,0,0.18)]">
                        <div class="grid grid-cols-3 gap-2 rounded-2xl bg-white/20 p-2">
                              <div v-for="(cell, i) in ttt.table" :key="i"
                                    class="flex items-center justify-center h-16 md:h-20 text-3xl md:text-5xl font-black rounded-xl transition-all duration-150"
                                    :class="spTTTCellClass(i)">
                                    <span v-if="cell !== ''" class="ttt-pop">{{ tttDisplay(cell) }}</span>
                              </div>
                        </div>
                  </div>

                  <!-- Reversi board -->
                  <div v-if="game === 'reversi'"
                        class="mx-auto w-full max-w-sm rounded-3xl bg-gradient-to-br from-emerald-700 to-emerald-900 p-2 shadow-[0_8px_0_rgba(0,0,0,0.18)]">
                        <div class="grid grid-cols-8 gap-1 p-1">
                              <div v-for="(cell, i) in rev.board" :key="i"
                                    class="aspect-square rounded-lg flex items-center justify-center bg-emerald-900/60">
                                    <div v-if="cell !== ''" class="w-3/4 h-3/4 rounded-full shadow-lg"
                                          :class="cell === 'b' ? 'bg-slate-900' : 'bg-white ring-2 ring-slate-300'"></div>
                              </div>
                        </div>
                        <p class="pt-1 text-center text-xs font-bold text-white/80">
                              {{ displayPlayers[0].name }} ⚫ {{ revCounts().b }} — {{ revCounts().w }} ⚪ {{ displayPlayers[1].name }}
                        </p>
                  </div>

                  <!-- Find My Pizza: both probe boards (slices stay hidden) -->
                  <div v-if="game === 'pizza'" class="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div v-for="bi in [0, 1]" :key="bi" class="flex flex-col items-center">
                              <div class="w-full rounded-3xl bg-gradient-to-br p-2 shadow-[0_6px_0_rgba(0,0,0,0.16)] md:w-[72%]"
                                    :class="bi === 0 ? 'from-rose-500 to-orange-500' : 'from-sky-500 to-blue-600'">
                                    <p class="mb-2 text-center text-sm font-black text-white">
                                          <span class="rounded-full bg-black/15 px-3 py-0.5 truncate inline-block max-w-full">
                                                {{ pizza.names[bi] || 'Player ' + (bi + 1) }} — found {{ pizza.found[bi] || 0 }}/5
                                          </span>
                                    </p>
                                    <div class="grid grid-cols-5 gap-1.5 rounded-2xl bg-white/20 p-1.5">
                                          <div v-for="(v, c) in pizza.attacked[bi] || []" :key="c"
                                                class="aspect-square flex items-center justify-center rounded-lg text-xl"
                                                :class="spPizzaCellClass(v)">
                                                {{ v === true ? '🍕' : v === false ? '❌' : '' }}
                                          </div>
                                    </div>
                              </div>
                        </div>
                        <p class="col-span-full text-center text-xs font-bold text-slate-500">
                              🍕 = found slice · ❌ = empty probe · blank = not yet probed
                        </p>
                  </div>

                  <!-- Rock Paper Scissors: live hands + score -->
                  <div v-if="game === 'rps'">
                        <div class="grid grid-cols-2 gap-3">
                              <div v-for="bi in [0, 1]" :key="bi"
                                    class="rounded-3xl bg-white/60 p-3 text-center shadow-[0_6px_0_rgba(0,0,0,0.14)]">
                                    <p class="mb-1 text-xs font-black text-slate-600 truncate">
                                          {{ rps.names[bi] || 'Player ' + (bi + 1) }}'s hand
                                    </p>
                                    <div class="text-5xl" :class="rps.picks[bi] ? 'rps-pop' : 'opacity-40'">
                                          {{ rpsIcon(rps.picks[bi]) }}
                                    </div>
                                    <div class="mt-1 text-2xl font-black text-slate-800">{{ rps.wins[bi] || 0 }}</div>
                              </div>
                        </div>
                        <div class="mx-auto w-fit mt-3 rounded-full bg-white/50 px-5 py-1 text-center text-xs font-bold text-slate-600 shadow-sm">
                              Round {{ rps.round }} — first to 2 round wins takes the match
                        </div>
                  </div>

                  <!-- Connect 4 board -->
                  <div v-if="game === 'connect4'"
                        class="mx-auto w-full max-w-md rounded-3xl bg-gradient-to-b from-sky-700 to-sky-950 p-2 shadow-[0_8px_0_rgba(0,0,0,0.25)]">
                        <div class="grid grid-cols-7 gap-1 rounded-2xl bg-sky-900/50 p-1">
                              <div v-for="(cell, i) in c4.board" :key="i"
                                    class="aspect-square rounded-full bg-sky-950/60 flex items-center justify-center p-[6%]">
                                    <div v-if="cell !== null" :class="c4DiscClass(cell, i)"></div>
                              </div>
                        </div>
                        <p class="pt-1 text-center text-xs font-bold text-white/80">
                              {{ displayPlayers[0].name }} 🔴 vs 🟡 {{ displayPlayers[1].name }}
                        </p>
                  </div>

                  <!-- Action buttons -->
                  <div class="flex justify-center gap-3 pt-1 pb-4">
                        <button v-if="canTakeSeat" @click="takeSeat"
                              class="btn-bubble rounded-2xl bg-gradient-to-br from-green-400 to-emerald-500 px-5 py-2.5 text-sm font-black text-white">
                              🪑 Take a seat
                        </button>
                        <button @click="leaveRoom"
                              class="btn-bubble rounded-2xl bg-gradient-to-br from-rose-400 to-red-500 px-5 py-2.5 text-sm font-black text-white">
                              🏠 Leave room
                        </button>
                  </div>
            </div>
      `,
});