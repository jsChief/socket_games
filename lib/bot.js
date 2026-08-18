// "AI Bot" — a headless second player that can be added to any room.
//
// When a human adds an AI to their room, the server spawns a real socket.io
// client that connects back into the same server (lib/socket.io-client), joins
// the room, mirrors the human's game selection and plays every game using the
// exact same socket protocol a human client uses. This keeps all game logic
// untouched: the bot is just another player as far as the server is concerned.
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

  // ---------- Tic-tac-toe brain (minimax -> perfect play) ----------
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
  function tttBestMove(board, me) {
    let best = -Infinity;
    const moves = [];
    for (let i = 0; i < 9; i++) {
      if (!board[i]) {
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
    }
    return moves.length ? moves[Math.floor(Math.random() * moves.length)] : null;
  }

  // ---------- Reversi brain (greedy: flanks + corners + edges) ----------
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
  function revBestMove(board, symbol) {
    let bestScore = -1;
    const best = [];
    for (let c = 0; c < 64; c++) {
      const flips = revFlips(board, symbol, c);
      if (!flips.length) continue;
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
    return best.length ? best[Math.floor(Math.random() * best.length)] : null;
  }

  // ---------- Find My Pizza brain ----------
  function pizzaPlacement() {
    const cells = [];
    while (cells.length < 5) {
      const c = Math.floor(Math.random() * 20);
      if (!cells.includes(c)) cells.push(c);
    }
    const board = Array(20).fill(false);
    cells.forEach((c) => (board[c] = true));
    return board;
  }
  function pizzaAttack(probed, hits) {
    const near = [];
    for (const h of hits) {
      for (const d of [-1, 1, -5, 5]) {
        const n = h + d;
        if (n >= 0 && n < 20 && !probed.includes(n) && !near.includes(n)) {
          near.push(n);
        }
      }
    }
    const pool = near.slice();
    for (let i = 0; i < 20; i++) {
      if (!probed.includes(i)) pool.push(i);
    }
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function markBotPlayer(socket) {
    const p = players.find((pp) => pp.id === socket.id);
    if (p) p.isBot = true;
  }

  // Spawn one bot connection for a room. The bot identifies, joins, mirrors the
  // human's game choice and plays every game.
  function spawn(room) {
    const socket = io("http://127.0.0.1:" + getPort(), {
      reconnection: true,
      reconnectionAttempts: 5,
      forceNew: true,
    });
    const state = {
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
      markBotPlayer(socket);
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
      const move = tttBestMove(state.tttBoard, state.symbol);
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
        socket.emit("pizza-submit", { board: pizzaPlacement() });
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
        const cell = pizzaAttack(state.pizza.probed, state.pizza.hits);
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
        const cell = revBestMove(state.reversi.board, state.reversi.symbol);
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

  // Add an AI bot to a room (spawns the bot connection). Returns false if the
  // room already has a bot or is full.
  function addBot(room) {
    if (!room || !room.players[0]) return false;
    if (bots[room.code]) return false;
    if (room.players.some((p) => p && p.isBot)) return false;
    if (room.players.filter(Boolean).length >= 2) return false;
    bots[room.code] = spawn(room);
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
