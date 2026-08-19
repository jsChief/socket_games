// "AI Bot" — a headless second player that can be added to any room.
//
// When a human adds an AI to their room, the server spawns a real socket.io
// client that connects back into the same server (lib/socket.io-client), joins
// the room, mirrors the human's game selection and plays every game using the
// exact same socket protocol a human client uses. This keeps all game logic
// untouched: the bot is just another player as far as the server is concerned.
//
// Difficulty: each bot is created with a level — "easy", "medium" or "hard"
// (default "medium"). The level changes how strong the bot plays in every game:
//   easy   → makes mistakes: random moves with some obvious wins/blocks, weak
//            reversi, clustered pizza placements (easy to hunt), random attacks
//   medium → competent: blocks/forks at 1 ply for tic-tac-toe, greedy reversi
//            (flanks + corners/edges), smart neighbor-hunting in pizza
//   hard   → strongest: perfect minimax tic-tac-toe, 2-ply maximal reversi,
//            spread-out pizza placements (hard to find) + spaced scanning
//
// Deps: { players, getPort } where `players` is the server's global player
// array (mutable reference) and `getPort()` returns the HTTP listen port.

const { io } = require("socket.io-client");

var BOT_NAME = "AI Bot";
var TTT_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];
var REV_DIRS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1],
];

module.exports = function createBot(deps) {
  const { players, getPort } = deps;
  const bots = {}; // room.code -> { socket, state }

  // Small delay so the human can see each bot move happen.
  function botDelay() {
    return 450 + Math.random() * 500;
  }

  // ---------- Tic-tac-toe brain ----------
  function tttWinner(b) {
    for (const l of TTT_LINES) {
      if (b[l[0]] && b[l[0]] === b[l[1]] && b[l[0]] === b[l[2]]) return b[l[0]];
    }
    if (b.every((x) => x !== "")) return "draw";
    return null;
  }
  function tttScore(b, me, turn) {
    const w = tttWinner(b);
    if (w === me) return 10;
    if (w && w !== "draw") return -10;
    if (w === "draw") return 0;
    const opp = me === "x" ? "o" : "x";
    let best = turn === me ? -Infinity : Infinity;
    for (let i = 0; i < 9; i++) {
      if (!b[i]) {
        b[i] = turn;
        const s = tttScore(b, me, turn === me ? opp : me);
        b[i] = "";
        best = turn === me ? Math.max(best, s) : Math.min(best, s);
      }
    }
    return best;
  }
  function tttLegal(board) {
    const moves = [];
    for (let i = 0; i < 9; i++) if (!board[i]) moves.push(i);
    return moves;
  }
  // Finds a move that wins immediately (for `me`), or null if none exists.
  function tttImmediateWin(board, me) {
    for (const i of tttLegal(board)) {
      board[i] = me;
      const w = tttWinner(board);
      board[i] = "";
      if (w === me) return i;
    }
    return null;
  }
  // Finds a move that blocks the opponent from winning next turn, else null.
  function tttBlock(board, me) {
    const opp = me === "x" ? "o" : "x";
    return tttImmediateWin(board, opp);
  }
  function tttPick(board, me, level) {
    const legal = tttLegal(board);
    if (legal.length === 0) return null;
    if (level === "hard") {
      // Full minimax -> perfect play.
      let best = -Infinity;
      const moves = [];
      for (const i of legal) {
        board[i] = me;
        const s = tttScore(board, me, me === "x" ? "o" : "x");
        board[i] = "";
        if (s > best) {
          best = s;
          moves.length = 0;
          moves.push(i);
        } else if (s === best) {
          moves.push(i);
        }
      }
      return moves[Math.floor(Math.random() * moves.length)];
    }
    if (level === "easy") {
      // Beatably imperfect: sometimes misses obvious wins / blocks.
      const win = tttImmediateWin(board, me);
      if (win !== null && Math.random() < 0.6) return win;
      const block = tttBlock(board, me);
      if (block !== null && Math.random() < 0.45) return block;
      return legal[Math.floor(Math.random() * legal.length)];
    }
    // medium: always takes an immediate win, always blocks, otherwise random.
    const win = tttImmediateWin(board, me);
    if (win !== null) return win;
    const block = tttBlock(board, me);
    if (block !== null) return block;
    return legal[Math.floor(Math.random() * legal.length)];
  }

  // ---------- Reversi brain ----------
  function revFlips(board, symbol, cell) {
    if (board[cell] !== "") return [];
    const opp = symbol === "b" ? "w" : "b";
    const row = Math.floor(cell / 8);
    const col = cell % 8;
    const flips = [];
    for (const [dr, dc] of REV_DIRS) {
      const line = [];
      let r = row + dr;
      let c = col + dc;
      while (r >= 0 && r < 8 && c >= 0 && c < 8) {
        const idx = r * 8 + c;
        if (board[idx] === "") break;
        if (board[idx] === opp) {
          line.push(idx);
          r += dr;
          c += dc;
          continue;
        }
        flips.push(...line);
        break;
      }
    }
    return flips;
  }
  function revLegalMoves(board, symbol) {
    const moves = [];
    for (let c = 0; c < 64; c++) {
      if (revFlips(board, symbol, c).length) moves.push(c);
    }
    return moves;
  }
  // Play `symbol` at `cell` on a copy and return the resulting board.
  function revSimulate(board, symbol, cell) {
    const nb = board.slice();
    nb[cell] = symbol;
    for (const f of revFlips(board, symbol, cell)) nb[f] = symbol;
    return nb;
  }
  // Static board evaluation from `me`'s perspective: counts pieces and heavily
  // rewards the corners and edges (stable discs).
  function revEval(board, me) {
    let score = 0;
    for (let c = 0; c < 64; c++) {
      if (board[c] === "") continue;
      const sign = board[c] === me ? 1 : -1;
      const row = Math.floor(c / 8);
      const col = c % 8;
      const pos =
        (row === 0 || row === 7) && (col === 0 || col === 7)
          ? 12
          : row === 0 || row === 7 || col === 0 || col === 7
            ? 4
            : 1;
      score += sign * pos;
    }
    return score;
  }
  function revPick(board, symbol, level) {
    const legal = revLegalMoves(board, symbol);
    if (legal.length === 0) return null;
    if (level === "easy") {
      // Any legal move — no strategy at all.
      return legal[Math.floor(Math.random() * legal.length)];
    }
    if (level === "hard") {
      // 2-ply maximal: for each move, simulate the opponent's strongest reply
      // and pick the move whose worst-case board favors us the most.
      const opp = symbol === "b" ? "w" : "b";
      let best = -Infinity;
      const bestMoves = [];
      for (const c of legal) {
        const after = revSimulate(board, symbol, c);
        const oppReplies = revLegalMoves(after, opp);
        let worst = Infinity;
        if (oppReplies.length) {
          for (const c2 of oppReplies) {
            const after2 = revSimulate(after, opp, c2);
            worst = Math.min(worst, revEval(after2, symbol));
          }
        } else {
          worst = revEval(after, symbol); // opponent must pass
        }
        const val = worst + Math.random() * 0.5;
        if (val > best) {
          best = val;
          bestMoves.length = 0;
          bestMoves.push(c);
        } else if (val === best) {
          bestMoves.push(c);
        }
      }
      return bestMoves[Math.floor(Math.random() * bestMoves.length)];
    }
    // medium: greedy — flanks + corners + edges, small random tiebreak.
    let bestScore = -1;
    const best = [];
    for (const c of legal) {
      const flips = revFlips(board, symbol, c);
      let score = flips.length * 2;
      const row = Math.floor(c / 8);
      const col = c % 8;
      if ((row === 0 || row === 7) && (col === 0 || col === 7)) score += 10;
      else if (row === 0 || row === 7 || col === 0 || col === 7) score += 3;
      score += Math.random() * 0.8;
      if (score > bestScore) {
        bestScore = score;
        best.length = 0;
        best.push(c);
      } else if (score === bestScore) {
        best.push(c);
      }
    }
    return best[Math.floor(Math.random() * best.length)];
  }

  // ---------- Find My Pizza brain ----------
  function manhattan(a, b) {
    return Math.abs(Math.floor(a / 5) - Math.floor(b / 5)) + Math.abs((a % 5) - (b % 5));
  }
  function pizzaPlacement(level) {
    let cells;
    if (level === "easy") {
      // Cluster the slices together: one hit leads straight to the neighbours.
      cells = [Math.floor(Math.random() * 20)];
      while (cells.length < 5) {
        const from = cells[Math.floor(Math.random() * cells.length)];
        const ns = [];
        for (const d of [-1, 1, -5, 5]) {
          const n = from + d;
          if (n >= 0 && n < 20 && !cells.includes(n)) ns.push(n);
        }
        if (ns.length) {
          cells.push(ns[Math.floor(Math.random() * ns.length)]);
        } else {
          const c = Math.floor(Math.random() * 20);
          if (!cells.includes(c)) cells.push(c);
        }
      }
    } else if (level === "hard") {
      // Spread the slices out (min distance ≥ 2) so wild probing keeps missing.
      cells = [];
      let guard = 0;
      while (cells.length < 5 && guard < 300) {
        guard++;
        const c = Math.floor(Math.random() * 20);
        if (!cells.includes(c) && cells.every((x) => manhattan(x, c) >= 2)) {
          cells.push(c);
        }
      }
      while (cells.length < 5) {
        const c = Math.floor(Math.random() * 20);
        if (!cells.includes(c)) cells.push(c);
      }
    } else {
      // medium: uniform random.
      cells = [];
      while (cells.length < 5) {
        const c = Math.floor(Math.random() * 20);
        if (!cells.includes(c)) cells.push(c);
      }
    }
    const board = Array(20).fill(false);
    cells.forEach((c) => (board[c] = true));
    return board;
  }
  function pizzaNeighbors(cell, probed) {
    const near = [];
    for (const d of [-1, 1, -5, 5]) {
      const n = cell + d;
      if (n >= 0 && n < 20 && !probed.includes(n) && !near.includes(n)) {
        near.push(n);
      }
    }
    return near;
  }
  function pizzaAttack(probed, hits, level) {
    const randomUnprobed = () => {
      const pool = [];
      for (let i = 0; i < 20; i++) if (!probed.includes(i)) pool.push(i);
      return pool[Math.floor(Math.random() * pool.length)];
    };
    if (level === "easy") {
      // Pure random probing — lucky hits tell us nothing.
      return randomUnprobed();
    }
    if (level === "hard") {
      // Exhaust the neighbours of every hit before scanning elsewhere; when
      // nothing is near, probe in a spaced column pattern to cover the board
      // with far fewer guesses than blind randomness.
      const near = [];
      for (const h of hits) near.push(...pizzaNeighbors(h, probed));
      if (near.length) return near[Math.floor(Math.random() * near.length)];
      const cols = [0, 2, 4, 1, 3];
      const start = Math.floor(Math.random() * 5);
      const pool = [];
      for (let k = 0; k < 5; k++) {
        const col = cols[(start + k) % 5];
        for (let r = 0; r < 4; r++) {
          const c = r * 5 + col;
          if (!probed.includes(c)) pool.push(c);
        }
      }
      return pool.length ? pool[Math.floor(Math.random() * pool.length)] : randomUnprobed();
    }
    // medium: hunt the neighbours of every hit, otherwise random.
    const near = [];
    for (const h of hits) near.push(...pizzaNeighbors(h, probed));
    const pool = near.slice();
    for (let i = 0; i < 20; i++) if (!probed.includes(i)) pool.push(i);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function markBotPlayer(socket, difficulty) {
    const p = players.find((pp) => pp.id === socket.id);
    if (p) {
      p.isBot = true;
      p.difficulty = difficulty;
    }
  }

  // Spawn one bot connection for a room. The bot identifies, joins, mirrors the
  // human's game choice and plays every game at the given difficulty.
  function spawn(room, difficulty) {
    const socket = io("http://127.0.0.1:" + getPort(), {
      reconnection: true,
      reconnectionAttempts: 5,
      forceNew: true,
    });
    const state = {
      difficulty: difficulty || "medium",
      symbol: null,
      tttBoard: ["", "", "", "", "", "", "", "", ""],
      game: null,
      pizza: { probed: [], hits: [] },
      reversi: { symbol: null, board: [], moveTimer: null },
    };
    let connectAttempts = 0;

    socket.on("connect", () => {
      connectAttempts = 0;
      socket.emit("player-initial-connect", {
        persistentUserId: "ai-bot-" + room.code,
        name: BOT_NAME,
      });
    });
    socket.on("connect_error", () => {
      connectAttempts++;
      if (connectAttempts > 5) {
        socket.close();
        delete bots[room.code];
      }
    });
    socket.on("room-error", () => socket.close());

    // Both events signal the bot player record exists; then seat ourselves.
    const seatSelf = () => {
      markBotPlayer(socket, state.difficulty);
      socket.emit("join-room", { code: room.code });
    };
    socket.on("name-set", seatSelf);
    socket.on("welcome-back", seatSelf);

    // Mirror the human's game selection so games start instantly. Also, if we
    // are ever the only player left (the human left the room/disconnected),
    // leave the room ourselves so it can close.
    socket.on("room-update", (data) => {
      const players = data.players || [];
      const me = players.find((p) => p.id === socket.id);
      const others = players.filter((p) => p.id !== socket.id);
      if (!me) return;
      if (others.length === 0) {
        socket.emit("leave-room");
        return;
      }
      const humanGame = others[0] ? others[0].game : null;
      if (humanGame && humanGame !== state.game) {
        state.game = humanGame;
        socket.emit("select-game", { game: humanGame });
      } else if (!humanGame) {
        state.game = null;
      }
    });

    // -------- Tic-tac-toe --------
    socket.on("player2", (data) => {
      state.symbol = data.symbol === "x" ? "o" : "x";
      state.tttBoard = ["", "", "", "", "", "", "", "", ""];
    });
    socket.on("clear-table", () => {
      state.tttBoard = ["", "", "", "", "", "", "", "", ""];
    });
    socket.on("set-table", (table) => {
      if (Array.isArray(table) && table.length === 9) {
        state.tttBoard = table.slice();
      }
    });
    socket.on("click-btn", (x) => {
      if (x && typeof x.index === "number") state.tttBoard[x.index] = x.symbol;
    });
    socket.on("set-turn", (d) => {
      if (!d || !d.symbol) return;
      if (state.symbol && d.symbol !== state.symbol) return;
      state.symbol = d.symbol;
      const move = tttPick(state.tttBoard, state.symbol, state.difficulty);
      if (move === null) return;
      setTimeout(() => {
        state.tttBoard[move] = state.symbol;
        socket.emit("btn-pos", { index: move, symbol: state.symbol });
      }, botDelay());
    });
    socket.on("reset-request", () => socket.emit("accept-game-reset"));

    // -------- Find My Pizza --------
    socket.on("pizza-start", () => {
      state.pizza = { probed: [], hits: [] };
      setTimeout(() => {
        socket.emit("pizza-submit", { board: pizzaPlacement(state.difficulty) });
      }, botDelay());
    });
    socket.on("pizza-sync", (d) => {
      if (!d) return;
      const probed = [];
      const hits = [];
      (d.oppGuesses || []).forEach((v, c) => {
        if (v !== null && v !== undefined) {
          probed.push(c);
          if (v) hits.push(c);
        }
      });
      state.pizza = { probed, hits };
      if (d.phase === "battle" && d.myTurn) doPizzaAttack();
    });
    socket.on("pizza-battle-start", (d) => {
      if (d && d.yourTurn) doPizzaAttack();
    });
    socket.on("pizza-attack-result", (d) => {
      if (!d) return;
      if (d.youAttacked) {
        state.pizza.probed.push(d.cell);
        if (d.hit) state.pizza.hits.push(d.cell);
      }
      if (d.yourTurn) doPizzaAttack();
    });
    socket.on("pizza-rematch-request", () => socket.emit("pizza-rematch"));

    function doPizzaAttack() {
      setTimeout(() => {
        const cell = pizzaAttack(state.pizza.probed, state.pizza.hits, state.difficulty);
        socket.emit("pizza-attack", { cell });
      }, botDelay());
    }

    // -------- Reversi --------
    socket.on("reversi-start", (d) => {
      if (!d) return;
      state.reversi = {
        symbol: d.symbol,
        board: (d.board || []).slice(),
        moveTimer: null,
      };
      if (d.symbol === "b") doReversiMove();
    });
    socket.on("reversi-state", (d) => {
      if (!d || !Array.isArray(d.board)) return;
      state.reversi.board = d.board.slice();
      if (d.currentSymbol === state.reversi.symbol) {
        doReversiMove();
      } else if (state.reversi.moveTimer) {
        clearTimeout(state.reversi.moveTimer);
        state.reversi.moveTimer = null;
      }
    });
    socket.on("reversi-rematch-request", () => socket.emit("reversi-rematch"));

    function doReversiMove() {
      if (state.reversi.moveTimer) clearTimeout(state.reversi.moveTimer);
      state.reversi.moveTimer = setTimeout(() => {
        state.reversi.moveTimer = null;
        const cell = revPick(state.reversi.board, state.reversi.symbol, state.difficulty);
        if (cell === null) return;
        state.reversi.board[cell] = state.reversi.symbol;
        socket.emit("reversi-move", { cell });
      }, botDelay());
    }

    // -------- Leave / cleanup --------
    socket.on("room-left", () => socket.close());
    socket.on("disconnect", () => {
      if (bots[room.code] && bots[room.code].socket === socket) {
        delete bots[room.code];
      }
    });

    return { socket, state };
  }

  // Add an AI bot to a room (spawns the bot connection). `difficulty` is one of
  // "easy" / "medium" / "hard" (default "medium"). Returns false if the room
  // already has a bot or is full.
  function addBot(room, difficulty) {
    if (!room || !room.players[0]) return false;
    if (bots[room.code]) return false;
    if (room.players.some((p) => p && p.isBot)) return false;
    if (room.players.filter(Boolean).length >= 2) return false;
    const level = ["easy", "medium", "hard"].includes(difficulty)
      ? difficulty
      : "medium";
    bots[room.code] = spawn(room, level);
    return true;
  }

  function isBotSeated(room) {
    return !!(room && room.players.some((p) => p && p.isBot));
  }

  // Remove the bot from a room (the bot leaves like a normal player).
  function removeBot(room) {
    const h = bots[room.code];
    if (!h) return;
    delete bots[room.code];
    if (h.socket.connected) {
      h.socket.emit("leave-room");
    } else {
      h.socket.close();
    }
  }

  return { addBot, removeBot, isBotSeated };
};
