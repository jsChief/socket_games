// "Rock Paper Scissors" game logic.
//
// Each game lives on a room's own `room.rps` state (see makeState) and emits
// socket events via the injected `io`, `toRoom`, `roomReady` and `roomIndexOf`
// helpers. Both players throw simultaneously each round; the first player to
// WIN_TARGET round-wins takes the match (draws just replay the round).
//
// Socket events:
//   rps-start          -> both players (a match is starting)
//   rps-round          -> both players (the round is revealed + scoreboard)
//   rps-game-over      -> both players (match finished at win target)
//   rps-state          -> a single reconnecting player (state resync)
//   rps-rematch-request-> a player whose opponent wants a rematch
//   rps-info           -> informational message to a single player
//   rps-pick           <- client: { choice: "rock"|"paper"|"scissors" }
//   rps-rematch        <- client: vote to start a new match
//
// Deps: { io, toRoom, toSpectators, roomReady, roomIndexOf }

var CHOICES = ["rock", "paper", "scissors"];
// BEATS[x] is the hand that x defeats.
var BEATS = { rock: "scissors", paper: "rock", scissors: "paper" };
var WIN_TARGET = 2; // best of three: first to 2 round-wins

module.exports = function createRps(deps) {
  const { io, toRoom, toSpectators, roomReady, roomIndexOf } = deps;

  // State shown to spectators: live picks are revealed plus the scoreboard.
  function buildSpectate(room) {
    const rps = room.rps;
    return {
      active: rps.active,
      round: rps.round,
      picks: rps.picks.slice(),
      wins: rps.wins.slice(),
      history: rps.history.slice(),
      result: rps.result,
      names: room.players.map((p) => (p ? p.name : null)),
    };
  }
  function emitSpectate(room) {
    toSpectators(room, "spectate-rps", buildSpectate(room));
  }
  function spectateTo(socket, room) {
    if (room.rps && room.rps.active) {
      socket.emit("spectate-rps", buildSpectate(room));
    }
  }

  function makeState() {
    return {
      active: false,
      round: 0,
      picks: [null, null],
      wins: [0, 0],
      history: [], // [{ round, picks: [p0,p1], winner: -1|0|1 }]
      result: null, // null | 0 | 1  (match winner seat)
      rematch: [false, false],
    };
  }

  // Wipe a room's rps state back to idle.
  function reset(room) {
    room.rps = makeState();
  }

  function startGame(room) {
    reset(room);
    room.rps.active = true;
    room.rps.round = 1;
    for (let i = 0; i < 2; i++) {
      io.to(room.players[i].id).emit("rps-start", {
        opponentName: room.players[1 - i].name,
        winTarget: WIN_TARGET,
      });
    }
    emitSpectate(room);
  }

  // Send the round outcome + scoreboard to every seated player.
  function emitRound(room, round) {
    for (let i = 0; i < 2; i++) {
      const opp = 1 - i;
      io.to(room.players[i].id).emit("rps-round", {
        myPick: round.picks[i],
        oppPick: round.picks[opp],
        oppName: room.players[opp].name,
        roundWinner:
          round.winner === -1 ? "draw" : round.winner === i ? "me" : "opp",
        myScore: room.rps.wins[i],
        oppScore: room.rps.wins[opp],
        matchOver: room.rps.result !== null,
        round: round.round,
      });
    }
  }

  // Resolve the round once both players have thrown, then start the next one
  // or finish the match once someone reaches the win target.
  function resolveRound(room) {
    const rps = room.rps;
    const [p0, p1] = rps.picks;
    let winner;
    if (p0 === p1) {
      winner = -1; // draw — round replays
    } else {
      winner = BEATS[p0] === p1 ? 0 : 1;
    }
    if (winner !== -1) rps.wins[winner] += 1;

    const round = { round: rps.round, picks: rps.picks.slice(), winner };
    rps.history.push(round);
    rps.round++;
    rps.picks = [null, null];

    if (rps.wins[0] >= WIN_TARGET || rps.wins[1] >= WIN_TARGET) {
      rps.active = false;
      rps.result = rps.wins[0] > rps.wins[1] ? 0 : 1;
      emitRound(room, round);
      const loser = 1 - rps.result;
      io.to(room.players[rps.result].id).emit("rps-game-over", {
        won: true,
        myScore: rps.wins[rps.result],
        oppScore: rps.wins[loser],
      });
      io.to(room.players[loser].id).emit("rps-game-over", {
        won: false,
        myScore: rps.wins[loser],
        oppScore: rps.wins[rps.result],
      });
      toRoom(
        room,
        "server-info",
        "Rock Paper Scissors is over! Go back to the room to play again.",
      );
    } else {
      emitRound(room, round);
    }
    emitSpectate(room);
  }

  // 'rps-pick' handler: lock in the player's hand for the current round.
  function pick(socket, room, data) {
    const rps = room.rps;
    if (!rps.active || rps.result !== null) return;
    const index = roomIndexOf(room, socket.id);
    if (index === -1 || rps.picks[index]) return;
    const choice = data && data.choice;
    if (CHOICES.indexOf(choice) === -1) return;
    rps.picks[index] = choice;
    emitSpectate(room);
    if (rps.picks[0] && rps.picks[1]) resolveRound(room);
  }

  // Re-sync the rps state for a reconnecting player in a room. The opponent's
  // current round pick stays hidden until the round resolves.
  function resync(socket, room, index) {
    const rps = room.rps;
    if (!rps.active && rps.result === null) return;
    const opp = 1 - index;
    socket.emit("rps-state", {
      active: rps.active,
      round: rps.round,
      winTarget: WIN_TARGET,
      myPick: rps.picks[index],
      oppPick: rps.picks[opp],
      myScore: rps.wins[index],
      oppScore: rps.wins[opp],
      opponentName: room.players[opp].name,
      history: rps.history.slice(),
      result:
        rps.result === null ? null : rps.result === index ? "won" : "lost",
    });
  }

  // 'rps-rematch' handler: vote to start a new match after a finished one.
  function rematch(socket, room) {
    const rps = room.rps;
    if (rps.result === null) return;
    const index = roomIndexOf(room, socket.id);
    if (index === -1 || rps.rematch[index]) return;
    rps.rematch[index] = true;
    const other = room.players[1 - index];
    if (other) io.to(other.id).emit("rps-rematch-request");
    if (rps.rematch[0] && rps.rematch[1]) {
      startGame(room);
    } else {
      socket.emit("rps-info", "Waiting for opponent to rematch...");
    }
  }

  return { makeState, reset, startGame, resync, pick, rematch, spectateTo };
};