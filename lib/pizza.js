// "Find My Pizza" game logic.
//
// Each game lives on a room's own `room.pizza` state (see makeState) and emits
// socket events via the injected `io`, `toRoom`, `roomReady` and `roomIndexOf`
// helpers.
//
// Deps: { io, toRoom, roomReady, roomIndexOf }

var BOARD_SIZE = 20;
var SLICES = 5;
var PLACEMENT_MS = 30000;

module.exports = function createPizza(deps) {
  const { io, toRoom, roomReady, roomIndexOf } = deps;

  // boards[i] = 20 booleans marking where player i hid slices
  // attacked[i] = 20 booleans marking cells on player i's board already probed
  // found[i] = slices the opponent has found ON player i's board (i.e. wins for 1-i)
  function makeState() {
    return {
      active: false,
      phase: "idle", // idle | placement | battle | over
      boards: [
        Array(BOARD_SIZE).fill(false),
        Array(BOARD_SIZE).fill(false),
      ],
      attacked: [
        Array(BOARD_SIZE).fill(false),
        Array(BOARD_SIZE).fill(false),
      ],
      found: [0, 0],
      turn: 0,
      submitted: [false, false],
      rematch: [false, false],
      placementTimer: null,
      placementStart: 0,
    };
  }

  // Wipe a room's pizza state back to idle.
  function reset(room) {
    if (room.pizza.placementTimer) clearTimeout(room.pizza.placementTimer);
    room.pizza = makeState();
  }

  function autoPlace(room, i) {
    const board = room.pizza.boards[i];
    let placed = 0;
    while (placed < SLICES) {
      const c = Math.floor(Math.random() * BOARD_SIZE);
      if (!board[c]) {
        board[c] = true;
        placed++;
      }
    }
    room.pizza.submitted[i] = true;
  }

  function beginBattle(room) {
    if (room.pizza.phase !== "placement") return;
    clearTimeout(room.pizza.placementTimer);
    room.pizza.phase = "battle";
    room.pizza.turn = Math.floor(Math.random() * 2);
    for (let i = 0; i < 2; i++) {
      io.to(room.players[i].id).emit("pizza-battle-start", {
        yourTurn: room.pizza.turn === i,
        opponentName: room.players[1 - i].name,
      });
    }
  }

  function startGame(room) {
    reset(room);
    room.pizza.active = true;
    room.pizza.phase = "placement";
    room.pizza.placementStart = Date.now();
    room.pizza.placementTimer = setTimeout(() => {
      if (room.pizza.phase !== "placement" || !roomReady(room)) return;
      for (let i = 0; i < 2; i++) {
        if (!room.pizza.submitted[i]) {
          autoPlace(room, i);
          io.to(room.players[i].id).emit(
            "pizza-info",
            "Time's up! Slices placed randomly.",
          );
        }
      }
      beginBattle(room);
    }, PLACEMENT_MS);

    for (let i = 0; i < 2; i++) {
      io.to(room.players[i].id).emit("pizza-start", {
        opponentName: room.players[1 - i].name,
        boardSize: BOARD_SIZE,
        slices: SLICES,
        timeLimit: Math.round(PLACEMENT_MS / 1000),
      });
    }
  }

  // Re-sync the pizza state for a reconnecting player in a room.
  function resync(socket, room, index) {
    if (!room.pizza.active) return;
    const opp = 1 - index;
    const oppGuesses = room.pizza.attacked[opp].map((attacked, c) =>
      attacked ? room.pizza.boards[opp][c] : null,
    );
    const timeLeft = Math.max(
      0,
      Math.ceil(
        Math.round(PLACEMENT_MS / 1000) -
          (Date.now() - room.pizza.placementStart) / 1000,
      ),
    );
    io.to(room.players[index].id).emit("pizza-sync", {
      phase: room.pizza.phase,
      submitted: room.pizza.submitted[index],
      myBoard: room.pizza.boards[index],
      myAttacked: room.pizza.attacked[index].slice(),
      oppGuesses,
      myTurn: room.pizza.turn === index,
      opponentName: room.players[opp].name,
      timeLeft,
      result:
        room.pizza.phase === "over"
          ? room.pizza.found[index] >= SLICES
            ? "won"
            : "lost"
          : room.pizza.found[opp] >= SLICES
            ? "lost"
            : null,
    });
  }

  // 'pizza-submit' handler: lock in the player's slice placement.
  function submit(socket, room, data) {
    const pizza = room.pizza;
    if (pizza.phase !== "placement") return;
    const index = roomIndexOf(room, socket.id);
    if (index === -1 || pizza.submitted[index]) return;
    const board = data && data.board;
    if (!Array.isArray(board) || board.length !== BOARD_SIZE) return;
    const count = board.reduce((n, v) => n + (v ? 1 : 0), 0);
    if (count !== SLICES) {
      socket.emit("pizza-info", "Place exactly 5 slices before locking in.");
      return;
    }
    pizza.boards[index] = board.map(Boolean);
    pizza.submitted[index] = true;
    const other = room.players[1 - index];
    if (other) io.to(other.id).emit("pizza-opponent-locked");
    if (pizza.submitted[0] && pizza.submitted[1]) {
      beginBattle(room);
    } else {
      socket.emit("pizza-waiting", {
        opponentDone: pizza.submitted[1 - index],
      });
    }
  }

  // 'pizza-attack' handler: probe a cell on the opponent's board.
  function attack(socket, room, data) {
    const pizza = room.pizza;
    if (pizza.phase !== "battle" || !pizza.active) return;
    const index = roomIndexOf(room, socket.id);
    if (index === -1 || index !== pizza.turn) return;
    const cell = data && data.cell;
    if (typeof cell !== "number" || cell < 0 || cell >= BOARD_SIZE) return;
    const defender = 1 - index;
    if (pizza.attacked[defender][cell]) {
      socket.emit(
        "pizza-info",
        "That cell was already attacked. Pick another.",
      );
      return;
    }
    pizza.attacked[defender][cell] = true;
    const hit = pizza.boards[defender][cell];
    if (hit) pizza.found[index]++;
    const gameOver = pizza.found[index] >= SLICES;
    if (gameOver) {
      pizza.active = false;
      pizza.phase = "over";
      io.to(room.players[index].id).emit("pizza-game-over", {
        won: true,
      });
      io.to(room.players[defender].id).emit("pizza-game-over", {
        won: false,
      });
      toRoom(
        room,
        "server-info",
        "Pizza game over! Go back to the room to play again.",
      );
    } else {
      pizza.turn = defender;
      io.to(room.players[index].id).emit("pizza-attack-result", {
        youAttacked: true,
        cell,
        hit,
        yourTurn: false,
      });
      io.to(room.players[defender].id).emit("pizza-attack-result", {
        youAttacked: false,
        cell,
        hit,
        yourTurn: true,
      });
    }
  }

  // 'pizza-rematch' handler: vote to start a new game after a finished one.
  function rematch(socket, room) {
    const pizza = room.pizza;
    if (pizza.phase !== "over") return;
    const index = roomIndexOf(room, socket.id);
    if (index === -1 || pizza.rematch[index]) return;
    pizza.rematch[index] = true;
    const other = room.players[1 - index];
    if (other) io.to(other.id).emit("pizza-rematch-request");
    if (pizza.rematch[0] && pizza.rematch[1]) {
      startGame(room);
    } else {
      socket.emit("pizza-info", "Waiting for opponent to rematch...");
    }
  }

  return {
    makeState,
    reset,
    startGame,
    resync,
    submit,
    attack,
    rematch,
  };
};