// Connect 4 game logic.
//
// Each game lives on a room's own `room.connect4` state (see makeState) and
// emits socket events via the injected `io`, `toRoom` and `roomIndexOf`
// helpers. Players take turns dropping discs into a 7x6 grid; the first to
// line up 4 discs (horizontal, vertical or diagonal) wins. Red moves first.
//
// Socket events:
//   connect4-start        -> both players (a game is starting)
//   connect4-state        -> both players (board after a move / resync)
//   connect4-game-over    -> both players (someone won or the board filled)
//   connect4-rematch-request -> a player whose opponent wants a rematch
//   connect4-info         -> informational message to a single player
//   connect4-drop         <- client: { col: 0..6 }
//   connect4-rematch      <- client: vote to start a new game
//
// Deps: { io, toRoom, toSpectators, roomReady, roomIndexOf, stats, saveStats }

var ROWS = 6;
var COLS = 7;
var CELLS = ROWS * COLS;

module.exports = function createConnect4(deps) {
  const { io, toRoom, toSpectators, roomReady, roomIndexOf, stats, saveStats } = deps;

  // Public board + turn state for spectators.
  function buildSpectate(room) {
    const state = room.connect4;
    return {
      active: state.active,
      gameOver: state.gameOver,
      board: state.board.slice(),
      currentSymbol: state.active ? room.players[state.currentPlayer].symbol : null,
      lastCell: state.lastCell,
      winLine: state.winLine ? state.winLine.slice() : null,
      names: room.players.map((p) => (p ? p.name : null)),
      symbols: room.players.map((p) => (p ? p.symbol : null)),
    };
  }
  function emitSpectate(room) {
    toSpectators(room, "spectate-connect4", buildSpectate(room));
  }
  function spectateTo(socket, room) {
    if (room.connect4 && room.connect4.active) {
      socket.emit("spectate-connect4", buildSpectate(room));
    }
  }

  function makeState() {
    return {
      active: false,
      board: Array(CELLS).fill(null),
      currentPlayer: 0, // seat index whose turn it is
      gameOver: false,
      lastCell: null,
      winLine: null, // winning 4-cell indices (or null)
      rematch: [false, false],
    };
  }

  // Wipe a room's connect4 state back to idle.
  function reset(room) {
    room.connect4 = makeState();
  }

  // Temporarily assign a disc color when a player picks this game. The other
  // seated player (if any) gets the opposite color; otherwise it's random.
  function assignSymbolFor(room, index) {
    const other = room.players[1 - index];
    if (other && other.symbol) {
      return other.symbol === "red" ? "yellow" : "red";
    }
    return Math.random() < 0.5 ? "red" : "yellow";
  }

  // Starting row of a disc dropped into `col` (bottom-most empty cell), or -1
  // if the column is full.
  function dropRow(board, col) {
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r * COLS + col] === null) return r;
    }
    return -1;
  }

  // If the player of `symbol` has 4 in a row at/around `cell`, return the 4
  // winning cells; otherwise null.
  function winLineAt(board, cell) {
    if (cell === null) return null;
    const symbol = board[cell];
    if (symbol === null) return null;
    const row = Math.floor(cell / COLS);
    const col = cell % COLS;
    const dirs = [
      [0, 1], // horizontal
      [1, 0], // vertical
      [1, 1], // diagonal down-right
      [1, -1], // diagonal down-left
    ];
    for (const [dr, dc] of dirs) {
      const line = [cell];
      for (const s of [1, -1]) {
        let r = row + dr * s;
        let c = col + dc * s;
        while (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
          if (board[r * COLS + c] !== symbol) break;
          line.push(r * COLS + c);
          r += dr * s;
          c += dc * s;
        }
      }
      if (line.length >= 4) return line;
    }
    return null;
  }

  function emitState(room) {
    const state = room.connect4;
    const currentSymbol = state.active && !state.gameOver
      ? room.players[state.currentPlayer].symbol
      : null;
    toRoom(room, "connect4-state", {
      board: state.board.slice(),
      lastCell: state.lastCell,
      currentSymbol,
      winLine: state.winLine ? state.winLine.slice() : null,
      gameOver: state.gameOver,
    });
    emitSpectate(room);
  }

  function startGame(room) {
    const state = makeState();
    state.active = true;
    state.currentPlayer = room.players[0].symbol === "red" ? 0 : 1;
    room.connect4 = state;
    for (let i = 0; i < 2; i++) {
      const opp = 1 - i;
      io.to(room.players[i].id).emit("connect4-start", {
        symbol: room.players[i].symbol,
        opponentName: room.players[opp].name,
      });
    }
    emitState(room);
  }

  // Re-sync a reconnecting player seated in a running game.
  function resync(socket, room, index) {
    const state = room.connect4;
    if (!state.active && !state.gameOver) return;
    io.to(room.players[index].id).emit("connect4-start", {
      symbol: room.players[index].symbol,
      opponentName: room.players[1 - index].name,
    });
    emitState(room);
  }

  // 'connect4-drop' handler: drop a disc into the requested column.
  function play(socket, room, data) {
    const state = room.connect4;
    if (!state.active || state.gameOver) return;
    const index = roomIndexOf(room, socket.id);
    if (index === -1 || index !== state.currentPlayer) return;
    const col = data && data.col;
    if (typeof col !== "number" || col < 0 || col >= COLS) return;
    const row = dropRow(state.board, col);
    if (row === -1) {
      socket.emit("connect4-info", "That column is full — pick another.");
      return;
    }
    const cell = row * COLS + col;
    state.board[cell] = room.players[index].symbol;
    state.lastCell = cell;

    const win = winLineAt(state.board, cell);
    if (win) {
      state.winLine = win;
      endGame(room);
    } else if (state.board.every((x) => x !== null)) {
      endGame(room, true);
    } else {
      state.currentPlayer = 1 - index;
      emitState(room);
    }
  }

  function endGame(room, draw) {
    const state = room.connect4;
    state.active = false;
    state.gameOver = true;
    const winnerIdx = draw ? null : state.currentPlayer;
    for (let i = 0; i < 2; i++) {
      io.to(room.players[i].id).emit("connect4-game-over", {
        won: winnerIdx === i,
        draw: winnerIdx === null,
        winLine: state.winLine ? state.winLine.slice() : null,
        mySymbol: room.players[i].symbol,
        oppSymbol: room.players[1 - i].symbol,
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
    if (winnerIdx === null) {
      room.players.forEach((p) => record(p, "draws"));
    } else {
      record(room.players[winnerIdx], "wins");
      record(room.players[1 - winnerIdx], "losses");
    }
    saveStats();
    emitState(room);
  }

  // 'connect4-rematch' handler: vote to start a new game after a finished one.
  function rematch(socket, room) {
    const state = room.connect4;
    if (!state.gameOver) return;
    const index = roomIndexOf(room, socket.id);
    if (index === -1 || state.rematch[index]) return;
    state.rematch[index] = true;
    const other = room.players[1 - index];
    if (other) io.to(other.id).emit("connect4-rematch-request");
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
    dropRow,
    winLineAt,
  };
};