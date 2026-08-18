// E2E test for game rooms.
//
// Starts the real server in-process (server.js listens on port 3000 when
// required) and drives it with socket.io-client, verifying:
//   1. create/find room by code, room seats 2 players
//   2. tic-tac-toe starts only in the room where both players picked it
//   3. pizza starts independently in a second room
//   4. reversi starts independently in a third room (flip + turn pass)
//   5. an AI bot can be added as a second player and plays all three games
//   6. joining a full room puts you in spectator mode (live board, no
//      private events, and you can take a freed seat)
//   7. leaving a room returns players to the lobby and closes empty rooms
//
// Run with: node tests/rooms.e2e.js  (server must be safe to start on :3000)

const { io } = require("socket.io-client");
const fs = require("fs");
const path = require("path");

// Back up stats.json so running the test doesn't pollute real stats.
const statsPath = path.join(__dirname, "..", "stats.json");
let statsBackup = null;
try {
  statsBackup = fs.readFileSync(statsPath, "utf8");
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}

// Use an alternate port so the test never collides with a dev server on :3000.
process.env.PORT = process.env.E2E_PORT || "3100";
const PORT = Number(process.env.PORT);

require("../server"); // starts the HTTP + socket.io server on $PORT

const URL = "http://localhost:" + PORT;

let failures = 0;
function assert(cond, label) {
  if (cond) {
    console.log("  PASS " + label);
  } else {
    failures++;
    console.error("  FAIL " + label);
  }
}

function connect(label) {
  return new Promise((resolve, reject) => {
    const s = io(URL, { reconnection: false, forceNew: true });
    s._inbox = [];
    s._label = label;
    s.onAny((event, ...args) => {
      s._inbox.push({ event, data: args[0] });
    });
    s.on("connect", () => resolve(s));
    s.on("connect_error", reject);
  });
}

function waitEvent(s, event, predicate, timeout) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const limit = timeout || 8000;
    (function poll() {
      const idx = s._inbox.findIndex(
        (m) => m.event === event && (!predicate || predicate(m.data)),
      );
      if (idx !== -1) {
        const m = s._inbox[idx];
        s._inbox.splice(0, idx + 1);
        resolve(m.data);
        return;
      }
      if (Date.now() - start > limit) {
        reject(new Error(`[${s._label}] timeout waiting for ${event}`));
        return;
      }
      setTimeout(poll, 20);
    })();
  });
}

function started(s) {
  return waitEvent(
    s,
    "player2",
    () => true,
    5000,
  ).then((d) => d);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  console.log("Connecting clients...");
  const alice = await connect("alice");
  const bob = await connect("bob");
  const carol = await connect("carol");
  const dave = await connect("dave");
  const eve = await connect("eve");
  const frank = await connect("frank");
  const grace = await connect("grace");

  // --- Authenticate (legacy /name flow is fine here) ---
  alice.emit("player-initial-connect", {
    persistentUserId: "e2e-alice",
    name: "Alice",
  });
  bob.emit("player-initial-connect", {
    persistentUserId: "e2e-bob",
    name: "Bob",
  });
  carol.emit("player-initial-connect", {
    persistentUserId: "e2e-carol",
    name: "Carol",
  });
  dave.emit("player-initial-connect", {
    persistentUserId: "e2e-dave",
    name: "Dave",
  });
  eve.emit("player-initial-connect", {
    persistentUserId: "e2e-eve",
    name: "Eve",
  });
  frank.emit("player-initial-connect", {
    persistentUserId: "e2e-frank",
    name: "Frank",
  });
  grace.emit("player-initial-connect", {
    persistentUserId: "e2e-grace",
    name: "Grace",
  });
  await Promise.all([
    waitEvent(alice, "name-set"),
    waitEvent(bob, "name-set"),
    waitEvent(carol, "name-set"),
    waitEvent(dave, "name-set"),
    waitEvent(eve, "name-set"),
    waitEvent(frank, "name-set"),
    waitEvent(grace, "name-set"),
  ]);
  console.log("  All clients connected + identified.");

  // --- Alice creates a room ---
  alice.emit("create-room");
  const created = await waitEvent(alice, "room-created");
  const codeA = created.code;
  assert(/^[A-Z2-9]{4}$/.test(codeA), "create-room returns a 4-char code");

  const room1Update = await waitEvent(alice, "room-update");
  assert(room1Update.players.length === 1, "room has 1 player after create");

  // --- Bob joins room 1 by code ---
  bob.emit("join-room", { code: codeA });
  await waitEvent(bob, "room-joined");
  const seats1 = await waitEvent(
    bob,
    "room-update",
    (d) => d.players.length === 2 && d.openSeats === 0,
  );
  assert(seats1.players.length === 2, "room seats exactly 2 players");
  assert(
    seats1.openSeats === 0,
    "no open seats with 2 players seated",
  );

  // Try to join a bogus code -> room-error
  carol.emit("join-room", { code: "ZZZZ" });
  const err = await waitEvent(carol, "room-error");
  assert(/not found/.test(err), "joining a bogus code errors");

  // --- Tic-tac-toe in room 1 (Alice + Bob) ---
  alice.emit("select-game", { game: "tictactoe" });
  bob.emit("select-game", { game: "tictactoe" });
  await Promise.all([
    started(alice),
    started(bob),
  ]);
  console.log("  Tic tac toe started in room 1.");

  // Wait until one of them is told it's their turn
  const race = await Promise.race([
    waitEvent(alice, "set-turn").then((d) => ({ s: alice, d })),
    waitEvent(bob, "set-turn").then((d) => ({ s: bob, d })),
  ]);
  const whoStarts = race.s;
  const other = whoStarts === alice ? bob : alice;
  const moverSymbol = race.d.symbol;

  // --- Carol + Dave create a separate room and pick pizza ---
  carol.emit("create-room");
  const created2 = await waitEvent(carol, "room-created");
  const codeB = created2.code;
  assert(codeA !== codeB, "second room has a different code");

  dave.emit("join-room", { code: codeB });
  await waitEvent(dave, "room-joined");
  await waitEvent(
    dave,
    "room-update",
    (d) => d.players.length === 2,
  );

  carol.emit("select-game", { game: "pizza" });
  dave.emit("select-game", { game: "pizza" });
  await Promise.all([
    waitEvent(carol, "pizza-start"),
    waitEvent(dave, "pizza-start"),
  ]);
  console.log("  Pizza started in room 2.");

  // Room 1 must not see room 2's pizza
  await sleep(400);
  assert(
    !alice._inbox.some((m) => m.event === "pizza-start") &&
      !bob._inbox.some((m) => m.event === "pizza-start"),
    "pizza-start does not leak into room 1",
  );

  // --- A tic-tac-toe move only reaches the opponent in room 1 ---
  whoStarts.emit("btn-pos", { index: 0, symbol: moverSymbol });
  const click = await waitEvent(other, "click-btn");
  assert(click.index === 0 && click.symbol === moverSymbol, "opponent in room sees the move");
  await sleep(400);
  assert(
    !carol._inbox.some((m) => m.event === "click-btn") &&
      !dave._inbox.some((m) => m.event === "click-btn"),
    "tictactoe move does not leak into room 2",
  );

  // --- Pizza placement stays isolated to room 2 ---
  const board = Array(20).fill(false);
  board[0] = board[2] = board[4] = board[6] = board[8] = true;
  carol.emit("pizza-submit", { board });
  dave.emit("pizza-submit", { board });
  await Promise.all([
    waitEvent(carol, "pizza-battle-start"),
    waitEvent(dave, "pizza-battle-start"),
  ]);
  console.log("  Pizza battle started in room 2.");
  await sleep(400);
  assert(
    !alice._inbox.some((m) => m.event === "pizza-battle-start") &&
      !bob._inbox.some((m) => m.event === "pizza-battle-start"),
    "pizza battle does not leak into room 1",
  );

  // --- Reversi starts independently in a third room (Eve + Frank) ---
  eve.emit("create-room");
  const created3 = await waitEvent(eve, "room-created");
  const codeC = created3.code;
  assert(codeC !== codeA && codeC !== codeB, "third room has a different code");

  frank.emit("join-room", { code: codeC });
  await waitEvent(frank, "room-joined");
  await waitEvent(
    frank,
    "room-update",
    (d) => d.players.length === 2,
  );

  eve.emit("select-game", { game: "reversi" });
  frank.emit("select-game", { game: "reversi" });
  const [eveStart, frankStart] = await Promise.all([
    waitEvent(eve, "reversi-start"),
    waitEvent(frank, "reversi-start"),
  ]);
  assert(
    eveStart.board && eveStart.board.length === 64,
    "reversi-start board has 64 cells",
  );
  assert(
    eveStart.symbol !== frankStart.symbol,
    "reversi players get different symbols",
  );
  assert(
    ["b", "w"].includes(eveStart.symbol),
    "reversi symbols are b/w",
  );
  console.log("  Reversi started in room 3.");
  await sleep(400);
  assert(
    !alice._inbox.some((m) => m.event === "reversi-start") &&
      !bob._inbox.some((m) => m.event === "reversi-start") &&
      !carol._inbox.some((m) => m.event === "reversi-start") &&
      !dave._inbox.some((m) => m.event === "reversi-start"),
    "reversi-start does not leak into rooms 1 and 2",
  );

  // --- Black plays a legal opening move (cell 19) which flips cell 27 ---
  const black = eveStart.symbol === "b" ? eve : frank;
  const white = black === eve ? frank : eve;
  black.emit("reversi-move", { cell: 19 });
  const state = await waitEvent(
    white,
    "reversi-state",
    (d) => Array.isArray(d.board) && d.board[19] === "b",
  );
  assert(state.board[19] === "b", "white sees the black disc at cell 19");
  assert(state.board[27] === "b", "cell 27 flipped to black after the move");
  assert(state.currentSymbol === "w", "turn passes to white after a move");
  await sleep(400);
  assert(
    !alice._inbox.some((m) => m.event === "reversi-state") &&
      !carol._inbox.some((m) => m.event === "reversi-state"),
    "reversi-state does not leak across rooms",
  );

  // --- Leave room 2 (Dave) -> Carol notified, Dave back to lobby ---
  dave.emit("leave-room");
  await waitEvent(carol, "p2-left");
  const carolView = await waitEvent(carol, "room-update", (d) => d.players.length < 2);
  assert(
    carolView.players.length === 1 && carolView.openSeats === 1,
    "remaining player sees the vacated seat",
  );
  await waitEvent(dave, "room-left");
  console.log("  Dave returned to the lobby.");

  // --- Leave room 1 cleanup ---
  alice.emit("leave-game");
  alice.emit("leave-room");
  await waitEvent(bob, "p2-left");
  await waitEvent(alice, "room-left");

  // --- Leave room 3 cleanup (Eve + Frank) ---
  eve.emit("leave-game");
  eve.emit("leave-room");
  await waitEvent(frank, "p2-left");
  await waitEvent(eve, "room-left");
  frank.emit("leave-room");
  await waitEvent(frank, "room-left");

  // --- AI bot: added as a second player and plays tic-tac-toe + reversi ---
  grace.emit("create-room");
  const created4 = await waitEvent(grace, "room-created");
  const codeD = created4.code;
  assert(
    codeD !== codeA && codeD !== codeB && codeD !== codeC,
    "AI room has a different code",
  );

  grace.emit("add-bot");
  const botJoin = await waitEvent(
    grace,
    "room-update",
    (d) => d.players.length === 2,
  );
  const botPlayer = botJoin.players.find((p) => p.id !== grace.id);
  assert(!!botPlayer && botPlayer.isBot === true, "AI bot is seated as a player");
  assert(!!botPlayer && /bot/i.test(botPlayer.name), "AI bot has a bot name");
  console.log("  AI bot joined room " + codeD + ".");

  grace.emit("select-game", { game: "tictactoe" });
  const p2 = await waitEvent(grace, "player2");
  const mySymbol = p2.symbol === "x" ? "o" : "x";
  const firstTurn = await waitEvent(grace, "set-turn");
  if (firstTurn.symbol === mySymbol) {
    grace.emit("btn-pos", { index: 4, symbol: firstTurn.symbol });
  } else {
    await waitEvent(grace, "click-btn");
    const myTurn = await waitEvent(grace, "set-turn");
    grace.emit("btn-pos", { index: 4, symbol: myTurn.symbol });
  }
  await waitEvent(grace, "click-btn");
  assert(true, "AI bot plays tic-tac-toe");
  console.log("  AI bot played a tic-tac-toe move.");

  grace.emit("leave-game");
  await sleep(300);
  grace.emit("select-game", { game: "pizza" });
  await waitEvent(grace, "pizza-start");
  const gboard = Array(20).fill(false);
  [0, 2, 4, 6, 8].forEach((c) => (gboard[c] = true));
  grace.emit("pizza-submit", { board: gboard });
  const battle = await waitEvent(grace, "pizza-battle-start");
  if (battle.yourTurn) {
    grace.emit("pizza-attack", { cell: 10 });
  }
  await waitEvent(
    grace,
    "pizza-attack-result",
    (d) => d.youAttacked === false,
  );
  assert(true, "AI bot plays Find My Pizza");
  console.log("  AI bot played a pizza attack.");

  grace.emit("leave-game");
  await sleep(300);
  grace.emit("select-game", { game: "reversi" });
  const graceRev = await waitEvent(grace, "reversi-start");
  assert(
    Array.isArray(graceRev.board) && graceRev.board.length === 64,
    "reversi vs AI starts with a 64-cell board",
  );
  if (graceRev.symbol === "b") {
    grace.emit("reversi-move", { cell: 19 });
  }
  await waitEvent(
    grace,
    "reversi-state",
    (d) => d.currentSymbol === graceRev.symbol,
  );
  assert(true, "AI bot plays reversi");
  console.log("  AI bot played a reversi move.");

  // --- Leave the AI room -> the bot cleans itself up and the room closes ---
  grace.emit("leave-room");
  await waitEvent(grace, "room-left");
  await sleep(600);
  grace.emit("join-room", { code: codeD });
  const goneD = await waitEvent(grace, "room-error");
  assert(/not found/.test(goneD), "AI room is closed after everyone leaves");

  // --- Spectator mode: join a full room and watch a live game ---
  dave.emit("create-room");
  const created5 = await waitEvent(dave, "room-created");
  const codeE = created5.code;
  eve.emit("join-room", { code: codeE });
  await waitEvent(eve, "room-joined");
  await waitEvent(eve, "room-update", (d) => d.players.length === 2);

  dave.emit("select-game", { game: "tictactoe" });
  eve.emit("select-game", { game: "tictactoe" });
  const p2e = await waitEvent(dave, "player2");
  const symD = p2e.symbol === "x" ? "o" : "x";
  const turnD = await waitEvent(dave, "set-turn");
  if (turnD.symbol === symD) {
    dave.emit("btn-pos", { index: 4, symbol: turnD.symbol });
  } else {
    await waitEvent(dave, "click-btn");
    const turnD2 = await waitEvent(dave, "set-turn");
    dave.emit("btn-pos", { index: 4, symbol: turnD2.symbol });
  }

  // Grace joins the now-full room -> spectator, and instantly sees the board.
  grace.emit("join-room", { code: codeE });
  const specJoin = await waitEvent(grace, "room-joined");
  assert(specJoin.spectator === true, "joining a full room makes you a spectator");
  const specBoard1 = await waitEvent(grace, "spectate-tictactoe");
  assert(
    specBoard1.table[4] !== "" && specBoard1.gameOn === true,
    "spectator receives the live board when joining",
  );
  console.log("  Grace is watching room " + codeE + ".");

  // The next move reaches the spectator live.
  const turnE = await waitEvent(eve, "set-turn");
  eve.emit("btn-pos", { index: 0, symbol: turnE.symbol });
  await waitEvent(grace, "spectate-tictactoe", (d) => d.table[0] !== "");
  assert(true, "spectator sees the next move live");
  await sleep(300);
  assert(
    !grace._inbox.some(
      (m) =>
        m.event === "click-btn" ||
        m.event === "set-turn" ||
        m.event === "player2" ||
        m.event === "p2-turn",
    ),
    "spectator does not receive private player events",
  );
  assert(
    !dave._inbox.some((m) => m.event === "spectate-tictactoe") &&
      !eve._inbox.some((m) => m.event === "spectate-tictactoe"),
    "players do not receive spectator events",
  );
  console.log("  Spectator watched tic-tac-toe live.");

  // When a seated player leaves, the spectator can take the freed seat.
  dave.emit("leave-room");
  await waitEvent(dave, "room-left");
  await waitEvent(eve, "p2-left");
  const specReset = await waitEvent(grace, "spectate-reset");
  assert(true, "spectator gets reset when the game is cancelled");
  await waitEvent(grace, "room-update", (d) => d.players.length === 1);
  grace.emit("take-seat");
  const seated = await waitEvent(
    grace,
    "room-update",
    (d) => d.players.length === 2 && d.players.some((p) => p.id === grace.id),
  );
  assert(!!seated && seated.openSeats === 0, "spectator can take a freed seat");
  console.log("  Spectator took a seat.");

  // Cleanup: the room closes once both remaining players leave.
  eve.emit("leave-room");
  await waitEvent(grace, "p2-left");
  grace.emit("leave-room");
  await waitEvent(grace, "room-left");

  // --- Empty room is closed once everyone leaves ---
  bob.emit("leave-room");
  await waitEvent(bob, "room-left");
  bob.emit("join-room", { code: codeA });
  const gone = await waitEvent(bob, "room-error");
  assert(/not found/.test(gone), "empty room is closed after last player leaves");

  console.log(failures === 0 ? "\nALL E2E TESTS PASSED" : `\n${failures} TEST(S) FAILED`);
  if (statsBackup !== null) fs.writeFileSync(statsPath, statsBackup);
  alice.close();
  bob.close();
  carol.close();
  dave.close();
  eve.close();
  frank.close();
  grace.close();
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error("E2E run failed:", e);
  if (statsBackup !== null) fs.writeFileSync(statsPath, statsBackup);
  process.exit(1);
});