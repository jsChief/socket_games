// Tic-tac-toe game logic.
//
// Each game lives on a room's own state: room.table (display board),
// room.virtualTable (win-check board), room.gameOn, room.currentPlayer and
// room.players (seats 0 and 1). All socket emissions go through the injected
// `io`, `toRoom`, `roomReady` and `roomIndexOf` helpers so this module stays
// free of server/room internals.
//
// Deps: { io, toRoom, roomReady, roomIndexOf, stats, saveStats }

var VALID_COMBO = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

function emptyTable() {
  return ["", "", "", "", "", "", "", "", ""];
}

function emptyVirtualTable() {
  return ["a", "b", "c", "d", "e", "f", "g", "h", "i"];
}

module.exports = function createTicTacToeGame(deps) {
  const { io, toRoom, toSpectators, roomReady, roomIndexOf, stats, saveStats } = deps;

  // Public board + turn state for spectators.
  function buildSpectate(room) {
    return {
      table: room.table.slice(),
      virtualTable: room.virtualTable.slice(),
      currentPlayer: room.currentPlayer,
      gameOn: room.gameOn,
      over: !room.gameOn,
      names: room.players.map((p) => (p ? p.name : null)),
      symbols: room.players.map((p) => (p ? p.symbol : null)),
    };
  }
  function emitSpectate(room) {
    toSpectators(room, "spectate-tictactoe", buildSpectate(room));
  }
  function spectateTo(socket, room) {
    if (room.gameOn) socket.emit("spectate-tictactoe", buildSpectate(room));
  }

  // Temporarily assign a symbol when a player picks this game. The other seated
  // player (if any) gets the opposite symbol; otherwise it's random.
  function assignSymbolFor(room, index) {
    const other = room.players[1 - index];
    if (other && other.symbol) {
      return other.symbol === "x" ? "o" : "x";
    }
    return Math.random() < 0.5 ? "x" : "o";
  }

  function startGame(room) {
    io.to(room.players[0].id).emit("player2", {
      name: room.players[1].name,
      symbol: room.players[1].symbol,
    });
    io.to(room.players[1].id).emit("player2", {
      name: room.players[0].name,
      symbol: room.players[0].symbol,
    });
    setTimeout(() => {
      if (!roomReady(room)) return;
      room.currentPlayer = Math.floor(Math.random() * 2);
      const inv = room.currentPlayer === 0 ? 1 : 0;
      io.to(room.players[inv].id).emit(
        "p2-turn",
        room.players[room.currentPlayer].name,
      );
      io.to(room.players[room.currentPlayer].id).emit("set-turn", {
        symbol: room.players[room.currentPlayer].symbol,
        text: "Your turn",
      });
      emitSpectate(room);
    }, 1000);
  }

  function checkWin(room) {
    var win = false;
    for (let i = 0; i < VALID_COMBO.length; i++) {
      const combo = VALID_COMBO[i];
      if (
        room.virtualTable[combo[0]] === room.virtualTable[combo[1]] &&
        room.virtualTable[combo[0]] === room.virtualTable[combo[2]]
      ) {
        win = true;
        break;
      }
    }

    if (win) {
      room.gameOn = false;
      const inv = room.currentPlayer === 0 ? 1 : 0;
      io.to(room.players[inv].id).emit(
        "p2-win",
        room.players[room.currentPlayer].name + " won",
      );
      io.to(room.players[room.currentPlayer].id).emit("you-win", "You Win! 🎉");

      // Update stats: games played, winner wins, loser losses
      stats.gamesPlayed = (stats.gamesPlayed || 0) + 1;
      const winner = room.players[room.currentPlayer];
      const loser = room.players[inv];
      if (winner && winner.persistentUserId) {
        if (!stats.players[winner.persistentUserId]) {
          stats.players[winner.persistentUserId] = {
            wins: 0,
            losses: 0,
            draws: 0,
            name: winner.name,
            symbol: winner.symbol,
          };
        }
        stats.players[winner.persistentUserId].wins += 1;
      }
      if (loser && loser.persistentUserId) {
        if (!stats.players[loser.persistentUserId]) {
          stats.players[loser.persistentUserId] = {
            wins: 0,
            losses: 0,
            draws: 0,
            name: loser.name,
            symbol: loser.symbol,
          };
        }
        stats.players[loser.persistentUserId].losses += 1;
      }
      saveStats();

      toRoom(room, "server-info", "use '/reset' to start a new game");
    } else {
      // Check for a draw
      const isDraw = room.table.every((cell) => cell !== "");
      if (isDraw) {
        room.gameOn = false;
        toRoom(room, "draw-game", "It's a Draw! 🤝");

        // Update stats for draw
        stats.gamesPlayed = (stats.gamesPlayed || 0) + 1;
        // increment draw for all active players
        room.players.forEach((p) => {
          if (p && p.persistentUserId) {
            if (!stats.players[p.persistentUserId]) {
              stats.players[p.persistentUserId] = {
                wins: 0,
                losses: 0,
                draws: 0,
                name: p.name,
                symbol: p.symbol,
              };
            }
            stats.players[p.persistentUserId].draws += 1;
          }
        });
        saveStats();

        toRoom(room, "server-info", "use '/reset' to start a new game");
      } else {
        room.currentPlayer = room.currentPlayer === 0 ? 1 : 0;
        const inv = room.currentPlayer === 0 ? 1 : 0;
        io.to(room.players[inv].id).emit(
          "p2-turn",
          room.players[room.currentPlayer].name,
        );
        setTimeout(() => {
          if (!roomReady(room)) return;
      io.to(room.players[room.currentPlayer].id).emit("set-turn", {
        symbol: room.players[room.currentPlayer].symbol,
        text: "Your turn",
      });
      emitSpectate(room);
    }, 1000);
  }
    }
  }

  function resetGame(room) {
    room.table = emptyTable();
    room.virtualTable = emptyVirtualTable();
    toRoom(room, "clear-table", undefined);

    room.gameOn = true;
    setTimeout(() => {
      if (!roomReady(room)) return;
      room.currentPlayer = Math.floor(Math.random() * 2);
      const inv = room.currentPlayer === 0 ? 1 : 0;
      io.to(room.players[inv].id).emit(
        "p2-turn",
        room.players[room.currentPlayer].name,
      );
      io.to(room.players[room.currentPlayer].id).emit("set-turn", {
        symbol: room.players[room.currentPlayer].symbol,
        text: "Your turn",
      });
      emitSpectate(room);
    }, 1000);
  }

  // Apply a move for a socket's player inside a room. Mirrors the old 'btn-pos'
  // socket handler. Emits 'click-btn' to the opponent and resolves the game.
  function play(socket, room, x) {
    const index = roomIndexOf(room, socket.id);
    if (index === -1 || index !== room.currentPlayer) return;
    if (room.table[x.index] === "") {
      room.table[x.index] = x.symbol;
      room.virtualTable[x.index] = x.symbol;
      const other = room.players[1 - index];
      if (other) io.to(other.id).emit("click-btn", x);
      checkWin(room);
      emitSpectate(room);
    } else {
      socket.emit("invalid-move", "invalid move be careful 🫤");
    }
  }

  return {
    emptyTable,
    emptyVirtualTable,
    assignSymbolFor,
    startGame,
    checkWin,
    resetGame,
    play,
    spectateTo,
  };
};