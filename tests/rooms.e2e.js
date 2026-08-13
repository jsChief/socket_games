// E2E test for game rooms.
//
// Starts the real server in-process (server.js listens on port 3000 when
// required) and drives it with socket.io-client, verifying:
//   1. create/find room by code, room seats 2 players
//   2. tic-tac-toe starts only in the room where both players picked it
//   3. pizza starts independently in a second room
//   4. game events (click-btn / pizza-start) never leak across rooms
//   5. leaving a room returns players to the lobby
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
  await Promise.all([
    waitEvent(alice, "name-set"),
    waitEvent(bob, "name-set"),
    waitEvent(carol, "name-set"),
    waitEvent(dave, "name-set"),
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
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error("E2E run failed:", e);
  if (statsBackup !== null) fs.writeFileSync(statsPath, statsBackup);
  process.exit(1);
});