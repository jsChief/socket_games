// Reversi (Othello) game logic.
//
// Each game lives on a room's own `room.reversi` state (see makeState) and
// emits socket events via the injected `io`, `toRoom`, `roomReady` and
// `roomIndexOf` helpers. Player symbols are "b" (black, moves first) and "w".
//
// Deps: { io, toRoom, roomReady, roomIndexOf, stats, saveStats }

var SIZE = 8;
var CELLS = SIZE * SIZE;
var DIRS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1],
];

module.exports = function createReversi(deps) {
  const { io, toRoom, toSpectators, roomReady, roomIndexOf, stats, saveStats } = deps;

  // Public board + turn state for spectators.
  function buildSpectate(room) {
    const state = room.reversi;
    return {
      active: state.active,
      gameOver: state.gameOver,
      over: !state.active,
      board: state.board.slice(),
      currentSymbol: state.active ? room.players[state.currentPlayer].symbol : null,
      names: room.players.map((p) => (p ? p.name : null)),
      symbols: room.players.map((p) => (p ? p.symbol : null)),
    };
  }
  function emitSpectate(room) {
    toSpectators(room, "spectate-reversi", buildSpectate(room));
  }
  function spectateTo(socket, room) {
    if (room.reversi && room.reversi.active) {
      socket.emit("spectate-reversi", buildSpectate(room));
    }
  }

  function makeState() {
    return {
      active: false,
      board: Array(CELLS).fill(""),
      currentPlayer: 0, // seat index whose turn it is
      gameOver: false,
      lastCell: null,
      rematch: [false, false],
    };
  }

  function reset(room) {
    room.reversi = makeState();
  }

  // Temporarily assign a symbol when a player picks this game. The other seated
  // player (if any) gets the opposite symbol; otherwise it's random.
  function assignSymbolFor(room, index) {
    const other = room.players[1 - index];
    if (other && other.symbol) {
      return other.symbol === "b" ? "w" : "b";
    }
    return Math.random() < 0.5 ? "b" : "w";
  }

  function initialBoard() {
    const b = Array(CELLS).fill("");
    b[3 * SIZE + 3] = "w";
    b[3 * SIZE + 4] = "b";
    b[4 * SIZE + 3] = "b";
    b[4 * SIZE + 4] = "w";
    return b;
  }

  function opponentOf(symbol) {
    return symbol === "b" ? "w" : "b";
  }

  // Cells that would be flipped by `symbol` playing at `cell` (empty if the
  // move is illegal because it doesn't flank anything).
  function flipsForMove(board, symbol, cell) {
    if (board[cell] !== "") return [];
    const opp = opponentOf(symbol);
    const row = Math.floor(cell / SIZE);
    const col = cell % SIZE;
    const flips = [];
    for (const [dr, dc] of DIRS) {
      const line = [];
      let r = row + dr;
      let c = col + dc;
      while (r >= 0 && r < SIZE && c >= 0 && c < SIZE) {
        const idx = r * SIZE + c;
        if (board[idx] === "") break;
        if (board[idx] === opp) {
          line.push(idx);
          r += dr;
          c += dc;
          continue;
        }
        // Reached one of our own discs -> the line between them is flanked.
        flips.push(...line);
        break;
      }
    }
    return flips;
  }

  function legalMoves(board, symbol) {
    const moves = [];
    for (let c = 0; c < CELLS; c++) {
      if (board[c] === "" && flipsForMove(board, symbol, c).length > 0) {
        moves.push(c);
      }
    }
    return moves;
  }

  function emitState(room, pass) {
    const state = room.reversi;
    const currentSymbol = room.players[state.currentPlayer].symbol;
    toRoom(room, "reversi-state", {
      board: state.board.slice(),
      lastCell: typeof state.lastCell === "number" ? state.lastCell : null,
      currentSymbol,
      pass: !!pass,
    });
    emitSpectate(room);
  }

  function startGame(room) {
    const state = makeState();
    state.active = true;
    state.board = initialBoard();
    state.currentPlayer = room.players[0].symbol === "b" ? 0 : 1;
    room.reversi = state;
    for (let i = 0; i < 2; i++) {
      const opp = 1 - i;
      io.to(room.players[i].id).emit("reversi-start", {
        symbol: room.players[i].symbol,
        opponentName: room.players[opp].name,
        board: state.board.slice(),
      });
    }
    emitSpectate(room);
  }

  // Re-sync a reconnecting player seated in a running game.
  function resync(socket, room, index) {
    const state = room.reversi;
    if (!state.active) return;
    io.to(room.players[index].id).emit("reversi-start", {
      symbol: room.players[index].symbol,
      opponentName: room.players[1 - index].name,
      board: state.board.slice(),
    });
    emitState(room);
  }

  // Handle a move ('reversi-move'). Validates the flank, applies the flip and
  // either passes the turn, skips the opponent (no legal moves) or ends the game.
  function play(socket, room, data) {
    const state = room.reversi;
    if (!state.active || state.gameOver) return;
    const index = roomIndexOf(room, socket.id);
    if (index === -1 || index !== state.currentPlayer) return;
    const cell = data && data.cell;
    if (typeof cell !== "number" || cell < 0 || cell >= CELLS) return;
    const symbol = room.players[index].symbol;
    const flips = flipsForMove(state.board, symbol, cell);
    if (flips.length === 0) {
      socket.emit("reversi-info", "Not a legal move — you must flank a disc.");
      return;
    }
    state.board[cell] = symbol;
    for (const f of flips) state.board[f] = symbol;
    state.lastCell = cell;

    const other = 1 - index;
    if (legalMoves(state.board, room.players[other].symbol).length > 0) {
      state.currentPlayer = other;
      emitState(room);
    } else if (legalMoves(state.board, symbol).length > 0) {
      // Opponent has no moves; the current player keeps the turn.
      emitState(room, true);
    } else {
      endGame(room);
    }
  }

  function endGame(room) {
    const state = room.reversi;
    state.active = false;
    state.gameOver = true;
    let b = 0;
    let w = 0;
    for (const c of state.board) {
      if (c === "b") b++;
      else if (c === "w") w++;
    }
    const winnerSymbol = b === w ? null : b > w ? "b" : "w";
    for (let i = 0; i < 2; i++) {
      const mySymbol = room.players[i].symbol;
      io.to(room.players[i].id).emit("reversi-game-over", {
        won: winnerSymbol === mySymbol,
        draw: winnerSymbol === null,
        myCount: mySymbol === "b" ? b : w,
        oppCount: mySymbol === "b" ? w : b,
      });
    }

    // Stats: games played, winner wins, loser losses, draws.
    stats.gamesPlayed = (stats.gamesPlayed || 0) + 1;
    const record = (p, key) => {
      if (!p || !p.persistentUserId) return;
      if (!stats.players[p.persistentUserId]) {
        stats.players[p.persistentUserId] = {
          wins: 0,
          losses: 0,
          draws: 0,
          name: p.name,
        };
      }
      stats.players[p.persistentUserId][key] += 1;
    };
    if (winnerSymbol === null) {
      room.players.forEach((p) => record(p, "draws"));
    } else {
      const wi = room.players.findIndex((p) => p.symbol === winnerSymbol);
      record(room.players[wi], "wins");
      record(room.players[1 - wi], "losses");
    }
    saveStats();
    emitSpectate(room);
  }

  // 'reversi-rematch' handler: vote to start a new game after a finished one.
  function rematch(socket, room) {
    const state = room.reversi;
    if (!state.gameOver) return;
    const index = roomIndexOf(room, socket.id);
    if (index === -1 || state.rematch[index]) return;
    state.rematch[index] = true;
    const other = room.players[1 - index];
    if (other) io.to(other.id).emit("reversi-rematch-request");
    if (state.rematch[0] && state.rematch[1]) startGame(room);
  }

  return {
    makeState,
    reset,
    assignSymbolFor,
    startGame,
    resync,
    play,
    rematch,
    spectateTo,
    legalMoves,
    flipsForMove,
  };
};