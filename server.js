const fs = require("fs"); // Import file system module
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const crypto = require("crypto");

const createRooms = require("./lib/rooms");
const createTicTacToeGame = require("./lib/tictactoe");
const createPizza = require("./lib/pizza");
const createReversi = require("./lib/reversi");
const createRps = require("./lib/rps");
const createConnect4 = require("./lib/connect4");
const createBot = require("./lib/bot");
const createAdmin = require("./lib/admin");
const privateChat = require("./lib/privateChat");
const avatars = require("./lib/avatars");
const {
  hashPassword,
  verifyPassword,
  generateToken,
} = require("./lib/passwords");

const app = express();
// Create the unified HTTP server
const server = http.createServer(app);

// Attach Socket.IO to the server with CORS open for local/tunnel testing
const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:3000",
      "http://192.168.43.219:3000",
      "http://192.168.0.139:3000",
      "http://192.168.0.180:3000", //wp-360
      "https://fond-dory-suitable.ngrok-free.app",
    ],
    methods: ["GET", "POST"],
  },
});

// 1. Serve the frontend files statically
// (Point this to your web page build folder, e.g., 'public' or 'dist')
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json()); // JSON body parsing for the /admin/api endpoints

// 2. Admin panel page (separate from the games page)
app.get(["/admin", "/admin/"], (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

// `players` holds the currently active (connected) players for this server run.
// Each player refers into a room via `roomCode`. Seating happens explicitly,
// not automatically on connect/auth.
var players = [];

const statsFilePath = path.join(__dirname, "stats.json");
// Stats structure: { gamesPlayed: number, players: { [persistentUserId]: { wins, losses, draws, name, symbol } } }
var stats = { gamesPlayed: 0, players: {} };
const accountsFilePath = path.join(__dirname, "accounts.json");
// Simple username/password accounts for a small circle of friends.
// accounts.accounts[usernameLower] = { username, salt, hash, persistentUserId }
// accounts.tokens[token] = usernameLower  (auto-login "remember me" tokens)
var accounts = { accounts: {}, tokens: {} };

// Load persisted stats from stats.json into `stats`.
const loadStats = () => {
  try {
    const dataBuffer = fs.readFileSync(statsFilePath);
    const dataJSON = dataBuffer.toString();
    const parsed = JSON.parse(dataJSON);
    stats = {
      gamesPlayed:
        typeof parsed.gamesPlayed === "number" ? parsed.gamesPlayed : 0,
      players:
        parsed && typeof parsed.players === "object" && parsed.players !== null
          ? parsed.players
          : {},
    };
    console.log("Persisted stats loaded from file.");
  } catch (e) {
    if (e.code === "ENOENT") {
      console.log("stats.json not found, starting with empty stats.");
    } else {
      console.error("Error loading stats from file:", e);
    }
    stats = { gamesPlayed: 0, players: {} };
  }
};

// Save stats to stats.json
const saveStats = () => {
  try {
    const dataJSON = JSON.stringify(stats, null, 2);
    fs.writeFileSync(statsFilePath, dataJSON);
    console.log("Stats saved to file.");
  } catch (e) {
    console.error("Error saving stats to file:", e);
  }
};

// Load accounts (and login tokens) from accounts.json into `accounts`.
const loadAccounts = () => {
  try {
    const dataBuffer = fs.readFileSync(accountsFilePath);
    const parsed = JSON.parse(dataBuffer.toString());
    accounts = {
      accounts:
        parsed && typeof parsed.accounts === "object" && parsed.accounts !== null
          ? parsed.accounts
          : {},
      tokens:
        parsed && typeof parsed.tokens === "object" && parsed.tokens !== null
          ? parsed.tokens
          : {},
    };
    console.log("Accounts loaded from file.");
  } catch (e) {
    if (e.code === "ENOENT") {
      console.log("accounts.json not found, starting with empty accounts.");
    } else {
      console.error("Error loading accounts from file:", e);
    }
    accounts = { accounts: {}, tokens: {} };
  }
};

// Save accounts to accounts.json
const saveAccounts = () => {
  try {
    const dataJSON = JSON.stringify(accounts, null, 2);
    fs.writeFileSync(accountsFilePath, dataJSON);
    console.log("Accounts saved to file.");
  } catch (e) {
    console.error("Error saving accounts to file:", e);
  }
};

// Load data when the server starts (before the game modules capture `stats`)
loadStats();
loadAccounts();

// Keep public/avatars in sync with the accounts currently on file: drop avatar
// files for removed accounts / stale test players. Anything dropped is simply
// regenerated on demand if that player comes back online later.
try {
  const accountSlugs = Object.keys(accounts.accounts).map((k) =>
    avatars.slugify(accounts.accounts[k].username || k),
  );
  const pruned = avatars.pruneAvatars(accountSlugs);
  if (pruned > 0) console.log(`[avatar] pruned ${pruned} stale avatar file(s).`);
} catch (e) {
  console.error("[avatar] prune failed:", e);
}

// Create shared modules: room lifecycle + the two games. Each game module
// receives only the io helpers it needs, so the games stay decoupled.
const {
  rooms,
  generateRoomCode,
  getRoomForSocket,
  roomIndexOf,
  findFreeSeat,
  toRoom,
  toSpectators,
  roomReady,
  getRoomView,
  scheduleRoomExpiry,
} = createRooms({ io, players });
const tictactoe = createTicTacToeGame({
  io,
  toRoom,
  toSpectators,
  roomReady,
  roomIndexOf,
  stats,
  saveStats,
});
const pizza = createPizza({ io, toRoom, toSpectators, roomReady, roomIndexOf });
const reversi = createReversi({
  io,
  toRoom,
  toSpectators,
  roomReady,
  roomIndexOf,
  stats,
  saveStats,
});
const rps = createRps({ io, toRoom, toSpectators, roomReady, roomIndexOf });
const connect4 = createConnect4({
  io,
  toRoom,
  toSpectators,
  roomReady,
  roomIndexOf,
  stats,
  saveStats,
});
const bot = createBot({
  players,
  getPort: () => {
    const addr = server.address();
    return addr && addr.port ? addr.port : Number(process.env.PORT) || 3000;
  },
});

// Create a fresh in-memory room. Rooms are ephemeral (lost on restart).
function makeRoom(code, creatorId) {
  return {
    code,
    creatorId,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    players: [null, null], // seats 0 and 1; null = free
    table: tictactoe.emptyTable(),
    virtualTable: tictactoe.emptyVirtualTable(),
    gameOn: false,
    currentPlayer: 0,
    resetRequest: false,
    spectators: [], // watchers who joined after both seats were full
    pizza: pizza.makeState(),
    reversi: reversi.makeState(),
    rps: rps.makeState(),
    connect4: connect4.makeState(),
  };
}

// Connect an authenticated/known player to the app. Auth does NOT seat the
// player into a game — they land in the lobby and must create/join a room.
function connectPlayer(socket, data) {
  const { persistentUserId, name: clientName } = data; // Get name from client as well, it might be stored locally
  if (!persistentUserId) return;
  console.log(
    `Initial connect from persistentUserId: ${persistentUserId}, clientName: ${clientName}`,
  );

  // Check if the player is already active in this server run
  let activeIndex = players.findIndex(
    (player) => player.persistentUserId === persistentUserId,
  );

  if (activeIndex !== -1) {
    // Active player exists (reconnection in same run), update socket id and name
    let existingPlayer = players[activeIndex];
    existingPlayer.id = socket.id;
    existingPlayer.online = true;
    if (clientName && existingPlayer.name !== clientName) {
      existingPlayer.name = clientName;
    }

    socket.emit("welcome-back", existingPlayer.name);

    // Restore room membership if the player was seated somewhere.
    const room = existingPlayer.roomCode ? rooms[existingPlayer.roomCode] : null;
    if (room) {
      const idx = roomIndexOf(room, socket.id);
      if (idx === -1 && room.spectators.includes(existingPlayer)) {
        // Reconnecting spectator: put them back on the spectator screen.
        socket.emit("room-joined", {
          code: room.code,
          resuming: true,
          spectator: true,
        });
        tictactoe.spectateTo(socket, room);
        pizza.spectateTo(socket, room);
        reversi.spectateTo(socket, room);
        rps.spectateTo(socket, room);
        connect4.spectateTo(socket, room);
      } else {
        socket.emit("room-joined", { code: room.code, resuming: true });
        if (idx !== -1) {
          if (room.gameOn) {
            socket.emit("set-table", room.table);
            if (room.currentPlayer === idx) {
              socket.emit("set-turn", {
                symbol: room.players[idx].symbol,
                text: "Your turn",
              });
            } else {
              const otherPlayer = room.players[1 - idx];
              if (otherPlayer) socket.emit("p2-turn", otherPlayer.name);
            }
          }
          if (room.pizza.active) pizza.resync(socket, room, idx);
          if (room.reversi && room.reversi.active) reversi.resync(socket, room, idx);
          if (room.rps && room.rps.active) rps.resync(socket, room, idx);
          if (room.connect4 && room.connect4.active) connect4.resync(socket, room, idx);
        }
      }
      toRoom(room, "room-update", getRoomView(room));
    } else {
      existingPlayer.roomCode = null;
    }
  } else {
    // Not active in this run — add them to the global player list. They stay
    // in the lobby until they create or join a room.
    addNewPlayer(socket, clientName || "Player", persistentUserId);
  }

  // Let every connected client see the updated online players list
  io.emit("online-players", getOnlinePlayers());
}

// Register a brand new player into the global player list (no seating).
function addNewPlayer(socket, name, persistentUserId) {
  var newPlayer = {
    id: socket.id,
    name,
    symbol: null, // Only assigned temporarily when the player picks tic tac toe
    persistentUserId, // Store the persistent ID
    game: null, // Selected game (tictactoe | pizza)
    online: true,
    roomCode: null, // Room the player is seated in (set on create/join)
  };
  console.log(newPlayer);
  socket.emit("name-set", { name });

  players.push(newPlayer);
  io.emit("online-players", getOnlinePlayers());

  // Ensure a stats entry exists for this player
  if (!stats.players[persistentUserId]) {
    stats.players[persistentUserId] = {
      wins: 0,
      losses: 0,
      draws: 0,
      name,
    };
    saveStats();
  }

  socket.emit("server-info", "Create a room or join one with a code to play.");
  return true;
}

// Create a new room and seat the creator.
function createRoomHandler(socket) {
  const player = players.find((p) => p.id === socket.id);
  if (!player) {
    socket.emit("server-warn", "Please log in first to create a room.");
    return;
  }
  if (player.roomCode && rooms[player.roomCode]) {
    socket.emit("server-info", "You are already in room " + player.roomCode + ".");
    return;
  }
  const code = generateRoomCode();
  const room = makeRoom(code, player.persistentUserId);
  rooms[code] = room;
  player.roomCode = code;
  room.players[0] = player;
  socket.emit("room-created", { code });
  toRoom(room, "room-update", getRoomView(room));
  io.emit("online-players", getOnlinePlayers());
  scheduleRoomExpiry(room);
}

// Join an existing room by join code.
function joinRoomHandler(socket, codeInput) {
  const player = players.find((p) => p.id === socket.id);
  if (!player) {
    socket.emit("server-warn", "Please log in first to join a room.");
    return;
  }
  const code = String(codeInput || "").trim().toUpperCase();
  const room = rooms[code];
  if (!room) {
    socket.emit("room-error", "Room '" + (code || "?") + "' not found.");
    return;
  }
  if (player.roomCode === code && roomIndexOf(room, socket.id) !== -1) {
    socket.emit("server-info", "You are already in room " + code + ".");
    return;
  }
  if (player.roomCode && rooms[player.roomCode]) {
    socket.emit("server-warn", "Leave your current room first.");
    return;
  }
  const seat = findFreeSeat(room);
  if (seat === -1) {
    // Room is full: join as a spectator instead.
    if (room.spectators.includes(player)) {
      socket.emit("server-info", "You are already watching room " + code + ".");
      return;
    }
    room.spectators.push(player);
    player.roomCode = code;
    room.lastActivity = Date.now();
    socket.emit("room-joined", { code, resuming: false, spectator: true });
    socket.emit("server-info", "Both seats are taken — you joined as a spectator.");
    tictactoe.spectateTo(socket, room);
    pizza.spectateTo(socket, room);
    reversi.spectateTo(socket, room);
    connect4.spectateTo(socket, room);
    toRoom(room, "room-update", getRoomView(room));
    io.emit("online-players", getOnlinePlayers());
    return;
  }
  room.players[seat] = player;
  player.roomCode = code;
  room.lastActivity = Date.now();
  socket.emit("room-joined", { code, resuming: false });
  const other = room.players.find((p) => p && p.id !== socket.id);
  if (other) {
    io.to(other.id).emit("server-info", player.name + " joined the room!");
  }
  toRoom(room, "room-update", getRoomView(room));
  io.emit("online-players", getOnlinePlayers());
}

// Delete a room once no players remain, kicking any spectators out.
function closeRoom(room) {
  delete rooms[room.code];
  for (const sp of room.spectators) {
    if (sp && sp.id) {
      sp.roomCode = null;
      io.to(sp.id).emit("room-left");
    }
  }
  room.spectators = [];
  console.log("Room " + room.code + " closed (empty).");
}

// Leave a room (back to the lobby).
function leaveRoomHandler(socket) {
  const room = getRoomForSocket(socket);
  if (!room) {
    socket.emit("server-warn", "You are not in a room.");
    return;
  }
  const index = roomIndexOf(room, socket.id);
  if (index === -1) {
    // Spectator leaving.
    const si = room.spectators.findIndex((p) => p.id === socket.id);
    if (si === -1) {
      socket.emit("server-warn", "You are not in a room.");
      return;
    }
    const sp = room.spectators[si];
    room.spectators.splice(si, 1);
    sp.roomCode = null;
    socket.emit("room-left");
    if (!room.players.some(Boolean)) {
      closeRoom(room);
    } else {
      toRoom(room, "room-update", getRoomView(room));
    }
    io.emit("online-players", getOnlinePlayers());
    return;
  }
  const player = index !== -1 ? room.players[index] : null;
  if (player) {
    player.roomCode = null;
    player.game = null;
    player.symbol = null;
    room.players[index] = null;
  }
  const other = room.players.find((p) => p && p.id !== socket.id);
  if (other) {
    if (room.gameOn) {
      room.gameOn = false;
      room.table = tictactoe.emptyTable();
      room.virtualTable = tictactoe.emptyVirtualTable();
      io.to(other.id).emit("clear-table", "");
    }
    room.resetRequest = false;
    pizza.reset(room);
    reversi.reset(room);
    rps.reset(room);
    connect4.reset(room);
    io.to(other.id).emit("p2-left", player ? player.name : "A player");
  }
  toSpectators(room, "spectate-reset");
  room.lastActivity = Date.now();
  socket.emit("room-left");
  if (!room.players.some(Boolean)) {
    closeRoom(room);
  } else {
    toRoom(room, "room-update", getRoomView(room));
  }
  io.emit("online-players", getOnlinePlayers());
}

// Only write avatar files for a player who genuinely is a registered account
// (name AND persistentUserId match). Guests get the URL of an existing file
// (if they configured one via Avatar Studio) or null. Read-only reports and
// online-player broadcasts therefore never recreate avatar files for stale
// guest names — e.g. a removed account's leftover tab coming back online, or
// a random guest hijacking an account's display name.
function avatarDisplayUrl(name, uid) {
  const key = String(name || "").trim().toLowerCase();
  const acc = accounts.accounts[key];
  if (acc && acc.persistentUserId === uid) {
    return avatars.ensureAvatar(name, { uid });
  }
  return avatars.avatarUrlIfExists(name, { uid });
}

function getOnlinePlayers() {
  return players
    .filter((p) => p.online && !p.isBot)
    .map((p) => ({
      id: p.id,
      uid: p.persistentUserId,
      name: p.name,
      game: p.game,
      roomCode: p.roomCode,
      avatarUrl: avatarDisplayUrl(p.name, p.persistentUserId),
    }));
    
}

// Start the selected game when both seated players agree on one.
function maybeStartSelectedGame(room) {
  if (room.gameOn || room.pizza.active || room.reversi.active || room.rps.active || room.connect4.active) return;
  if (!room.players[0] || !room.players[1]) return;
  const p0 = room.players[0];
  const p1 = room.players[1];
  if (!p0.game || p0.game !== p1.game) return;
  if (p0.game === "pizza") {
    pizza.startGame(room);
  } else if (p0.game === "reversi") {
    reversi.startGame(room);
  } else if (p0.game === "rps") {
    rps.startGame(room);
  } else if (p0.game === "connect4") {
    connect4.startGame(room);
  } else {
    room.gameOn = true;
    tictactoe.startGame(room);
  }
}

// -------- Admin panel server-side actions --------
// The admin module (lib/admin.js) handles auth + the REST API but outsources
// destructive actions here so room/game cleanup stays in one place.

// Close a room and send every seated player + spectator back to the lobby.
function adminCloseRoom(code, reason) {
  const room = rooms[code];
  if (!room) return { ok: false, error: "Room not found." };
  const message = reason || "Room " + code + " was closed by an admin.";
  pizza.reset(room);
  reversi.reset(room);
  rps.reset(room);
  connect4.reset(room);
  room.resetRequest = false;
  for (const p of room.players) {
    if (p && p.id) {
      p.roomCode = null;
      p.game = null;
      p.symbol = null;
      io.to(p.id).emit("admin-room-closed", { code, reason: message });
    }
  }
  for (const sp of room.spectators) {
    if (sp && sp.id) {
      sp.roomCode = null;
      io.to(sp.id).emit("admin-room-closed", { code, reason: message });
    }
  }
  delete rooms[code];
  io.emit("online-players", getOnlinePlayers());
  console.log("[admin] closed room " + code);
  return { ok: true, code };
}

// Kick an online player back to the lobby (keeps their socket connected).
function adminKickPlayer(socketId, reason) {
  const player = players.find((p) => p.id === socketId);
  if (!player) {
    return { ok: false, error: "Player not found (they may have disconnected)." };
  }
  const message = reason || "You were removed by an admin.";
  const room = player.roomCode ? rooms[player.roomCode] : null;
  if (room) {
    const index = roomIndexOf(room, socketId);
    if (index !== -1) {
      pizza.reset(room);
      reversi.reset(room);
      rps.reset(room);
      connect4.reset(room);
      room.resetRequest = false;
      if (room.gameOn) {
        room.gameOn = false;
        room.table = tictactoe.emptyTable();
        room.virtualTable = tictactoe.emptyVirtualTable();
      }
      player.roomCode = null;
      player.game = null;
      player.symbol = null;
      room.players[index] = null;
      const other = room.players.find((p) => p && p.id !== socketId);
      if (other) {
        io.to(other.id).emit("p2-left", player.name);
        io.to(other.id).emit("clear-table", "");
      }
      toSpectators(room, "spectate-reset");
      if (!room.players.some(Boolean)) {
        closeRoom(room);
      } else {
        toRoom(room, "room-update", getRoomView(room));
      }
    } else {
      const si = room.spectators.indexOf(player);
      if (si !== -1) room.spectators.splice(si, 1);
      player.roomCode = null;
      if (!room.players.some(Boolean)) {
        closeRoom(room);
      } else {
        toRoom(room, "room-update", getRoomView(room));
      }
    }
  }
  io.to(socketId).emit("admin-kicked", { reason: message, name: player.name });
  io.emit("online-players", getOnlinePlayers());
  console.log("[admin] kicked " + player.name);
  return { ok: true, name: player.name };
}

// Send a private message that surfaces as a prominent toast on the player's page.
function adminMessagePlayer(socketId, message) {
  const player = players.find((p) => p.id === socketId);
  if (!player) {
    return { ok: false, error: "Player not found (they may have disconnected)." };
  }
  const text = String(message || "").trim();
  if (!text) return { ok: false, error: "Message cannot be empty." };
  io.to(socketId).emit("admin-message", { text, at: Date.now() });
  console.log("[admin] messaged " + player.name + ": " + text);
  return { ok: true, name: player.name };
}

// Mount the admin panel's JSON API. Destructive actions go through the ops
// above so rooms and game state are cleaned up exactly like a normal leave.
const admin = createAdmin({
  io,
  players,
  rooms,
  accounts,
  saveAccounts,
  stats,
  saveStats,
  hashPassword,
  verifyPassword,
  makeToken: generateToken,
  getOnlinePlayers,
  avatars,
  ops: {
    adminCloseRoom,
    adminKickPlayer,
    adminMessagePlayer,
  },
});
app.use("/admin/api", admin.router);

io.on("connection", (socket) => {
  socket.emit("join-message", "connected to server ✅");
  // The client sends its stored login token via 'auth-connect'
  // (or falls back to 'player-initial-connect' for the legacy /name flow)
  socket.emit(
    "server-info",
    "Please wait while we set things up, or use '/name <your name>' if you are new!",
  );
  console.log(socket.id);

  // Late joiners still see the most recent admin announcement, if any.
  const lastAnnouncement = admin.getLastAnnouncement();
  if (lastAnnouncement) {
    socket.emit("admin-announce", lastAnnouncement);
  }

  socket.on("player-initial-connect", (data) => {
    connectPlayer(socket, data);
  });

  // --- Auth flow -----------------------------------------------------------
  // The client sends its stored login token on connect. If valid, we log them
  // in automatically and connect them to the lobby. Otherwise we ask them to
  // log in or register via the auth screen.
  socket.on("auth-connect", (data) => {
    const token = data && data.token;
    const key = token && accounts.tokens[token];
    if (key && accounts.accounts[key]) {
      const acc = accounts.accounts[key];
      avatars.ensureAvatar(acc.username, { uid: acc.persistentUserId });
      socket.emit("auth-success", {
        token,
        username: acc.username,
        persistentUserId: acc.persistentUserId,
      });
      connectPlayer(socket, {
        persistentUserId: acc.persistentUserId,
        name: acc.username,
      });
    } else {
      socket.emit("auth-required", {
        message: "Please log in or create an account.",
      });
    }
  });

  socket.on("register", async (data) => {
    const username = ((data && data.username) || "").trim();
    const password = (data && data.password) || "";
    const persistentUserId =
      (data && data.persistentUserId) || crypto.randomUUID();

    if (username.length < 2 || username.length > 20) {
      socket.emit("auth-error", "Username must be 2-20 characters.");
      return;
    }
    if (password.length < 4) {
      socket.emit("auth-error", "Password must be at least 4 characters.");
      return;
    }
    const key = username.toLowerCase();
    if (accounts.accounts[key]) {
      socket.emit("auth-error", "That username is already taken.");
      return;
    }

    const { salt, hash } = await hashPassword(password);
    accounts.accounts[key] = { username, salt, hash, persistentUserId };
    const token = generateToken();
    accounts.tokens[token] = key;
    saveAccounts();
    avatars.ensureAvatar(username, { uid: persistentUserId });

    socket.emit("auth-success", { token, username, persistentUserId });
    connectPlayer(socket, { persistentUserId, name: username });
  });

  socket.on("login", async (data) => {
    const username = ((data && data.username) || "").trim();
    const password = (data && data.password) || "";
    const key = username.toLowerCase();
    const acc = accounts.accounts[key];
    if (!acc || !(await verifyPassword(password, acc.salt, acc.hash))) {
      socket.emit("auth-error", "Wrong username or password.");
      return;
    }

    const token = generateToken();
    accounts.tokens[token] = key;
    saveAccounts();
    avatars.ensureAvatar(acc.username, { uid: acc.persistentUserId });

    socket.emit("auth-success", {
      token,
      username: acc.username,
      persistentUserId: acc.persistentUserId,
    });
    connectPlayer(socket, {
      persistentUserId: acc.persistentUserId,
      name: acc.username,
    });
  });

  socket.on("set-name", (data) => {
    const { name, persistentUserId } = data;
    if (!name || !name.trim()) {
      socket.emit(
        "server-warn",
        "Please provide a name with /name <your name>",
      );
      return;
    }

    // Check if a player with this persistent ID already exists
    let existingPlayerIndex = players.findIndex(
      (player) => player.persistentUserId === persistentUserId,
    );

    if (existingPlayerIndex !== -1) {
      // Player with this persistent ID exists
      let existingPlayer = players[existingPlayerIndex];

      const room = existingPlayer.roomCode ? rooms[existingPlayer.roomCode] : null;
      if (room && room.gameOn) {
        socket.emit("server-warn", "you can't change your name during a game");
        return;
      }
      existingPlayer.name = name;
      // Update stats name if present
      if (stats.players[persistentUserId]) {
        stats.players[persistentUserId].name = name;
        saveStats();
      }
      socket.emit("server-info", "Your name has been updated to " + name);
      socket.emit("name-set", {
        name,
        symbol: existingPlayer.symbol,
      }); // Re-send symbol with updated name (may be null outside a game)
      const symbolTag = existingPlayer.symbol ? ` (${existingPlayer.symbol})` : "";
      socket.broadcast.emit(
        "server-info",
        `Player${symbolTag} is now known as ${name}.`,
      );
      if (room) toRoom(room, "room-update", getRoomView(room));
      io.emit("online-players", getOnlinePlayers());
    } else {
      // This is a new player trying to set a name for the first time
      addNewPlayer(socket, name.trim(), persistentUserId);
    }
  });

  // -------- Profile (own stats + account info) --------
  socket.on("get-profile", () => {
    const player = players.find((p) => p.id === socket.id);
    if (!player || !player.persistentUserId) return;
    const uid = player.persistentUserId;
    const account = accounts.accounts[
      (player.name || "").toLowerCase()
    ] || (function () {
      for (const key of Object.keys(accounts.accounts)) {
        if (accounts.accounts[key].persistentUserId === uid) {
          return accounts.accounts[key];
        }
      }
      return null;
    })();
    const s = stats.players[uid] || {
      wins: 0,
      losses: 0,
      draws: 0,
    };
    const wins = s.wins || 0;
    const losses = s.losses || 0;
    const draws = s.draws || 0;
    const total = wins + losses + draws;
    const avatarSettings = avatars.getAvatarSettings(uid) || {};
    const avatarColor = avatars.sanitizeColor(
      avatarSettings.color !== undefined ? avatarSettings.color : avatarSettings.hue,
    );
    const avatarPattern = avatarSettings.pattern || "rings";
    socket.emit("my-profile", {
      name: player.name,
      uid,
      username: account ? account.username : null,
      avatarUrl: account
        ? avatars.ensureAvatar(account.username, {
            uid,
            color: avatarColor,
            pattern: avatarPattern,
          })
        : avatars.ensureAvatar(player.name, {
            uid,
            color: avatarColor,
            pattern: avatarPattern,
          }),
      avatar: {
        color: avatarColor != null ? avatarColor : avatars.baseHueOf(player.name),
        pattern: avatarPattern,
      },
      stats: {
        wins,
        losses,
        draws,
        total,
        winRate: total ? Math.round((wins / total) * 1000) / 10 : 0,
      },
    });
  });

  socket.on("set-avatar", (data) => {
    const player = players.find((p) => p.id === socket.id);
    if (!player || !player.persistentUserId) return;
    const rawColor =
      data && data.color !== undefined && data.color !== null
        ? data.color
        : data && typeof data.hue === "number"
          ? data.hue
          : null;
    const color = avatars.sanitizeColor(rawColor);
    const pattern = avatars.sanitizePattern(data && data.pattern);
    const finalColor = color != null ? color : avatars.baseHueOf(player.name);
    const finalPattern = pattern || "rings";
    avatars.setAvatarSettings(player.persistentUserId, {
      color: finalColor,
      pattern: finalPattern,
    });
    const account = (function () {
      for (const key of Object.keys(accounts.accounts)) {
        if (accounts.accounts[key].persistentUserId === player.persistentUserId) {
          return accounts.accounts[key];
        }
      }
      return null;
    })();
    if (account) {
      avatars.ensureAvatar(account.username, {
        uid: player.persistentUserId,
        color: finalColor,
        pattern: finalPattern,
      });
    }
    socket.emit("my-avatar", {
      avatarUrl: avatars.ensureAvatar(player.name, {
        uid: player.persistentUserId,
        color: finalColor,
        pattern: finalPattern,
      }),
      color: finalColor,
      pattern: finalPattern,
    });
    // Drop superseded variants so repeated studio saves don't accumulate
    // old avatar PNGs for the same player.
    if (
      !account ||
      avatars.slugify(account.username) === avatars.slugify(player.name)
    ) {
      const removedCount = avatars.pruneAvatarVariants(
        player.name,
        finalColor,
        finalPattern,
      );
      if (removedCount > 0) {
        console.log(
          `[avatar] ${player.name} pruned ${removedCount} stale variant(s).`,
        );
      }
    }
    io.emit("online-players", getOnlinePlayers());
    console.log(`[avatar] ${player.name} set color=${finalColor} pattern=${finalPattern}`);
  });

  socket.on("new-user", (name) => {
    console.log(name);
  });

  // -------- Room handlers --------
  socket.on("create-room", () => {
    createRoomHandler(socket);
  });

  socket.on("join-room", (data) => {
    joinRoomHandler(socket, data && data.code);
  });

  socket.on("leave-room", () => {
    leaveRoomHandler(socket);
  });

  // -------- AI bot handlers --------
  socket.on("add-bot", (data) => {
    const room = getRoomForSocket(socket);
    if (!room) {
      socket.emit("server-warn", "Join or create a room first to add an AI.");
      return;
    }
    if (roomIndexOf(room, socket.id) === -1) return;
    if (room.gameOn || room.pizza.active || room.reversi.active || room.connect4.active) {
      socket.emit("server-warn", "Finish the current game before adding an AI.");
      return;
    }
    if (room.players.filter(Boolean).length >= 2) {
      socket.emit("server-warn", "The room is already full.");
      return;
    }
    const difficulty = ["easy", "medium", "hard"].includes(
      data && data.difficulty,
    )
      ? data.difficulty
      : "medium";
    if (bot.addBot(room, difficulty)) {
      socket.emit(
        "server-info",
        "AI Bot (" + difficulty + ") is joining your room...",
      );
    } else {
      socket.emit("server-warn", "An AI is already joining this room.");
    }
  });

  socket.on("remove-bot", () => {
    const room = getRoomForSocket(socket);
    if (!room) return;
    if (!bot.isBotSeated(room)) return;
    bot.removeBot(room);
  });

  socket.on("reset-game", (x) => {
    const room = getRoomForSocket(socket);
    if (room) tictactoe.resetGame(room);
  });

  socket.on("request-game-reset", (data) => {
    const room = getRoomForSocket(socket);
    if (!room) return;
    if (room.pizza.active) return;
    const me = room.players.find((p) => p && p.id === socket.id);
    const other = room.players.find((p) => p && p.id !== socket.id);
    room.resetRequest = true;
    if (other) {
      io.to(other.id).emit("reset-request", {
        name: me ? me.name : (data && data.name) || "Your opponent",
      });
    }
  });

  socket.on("accept-game-reset", () => {
    const room = getRoomForSocket(socket);
    if (!room || !room.resetRequest) return;
    room.resetRequest = false;
    tictactoe.resetGame(room);
  });

  socket.on("decline-game-reset", () => {
    const room = getRoomForSocket(socket);
    if (!room) return;
    const other = room.players.find((p) => p && p.id !== socket.id);
    room.resetRequest = false;
    if (other) io.to(other.id).emit("reset-declined");
  });

  socket.on("echo-message", (message) => {
    console.log(message);
    setTimeout(() => {
      socket.emit("server-echo", "server: " + message);
    }, 1000);
  });

  socket.on("disconnect", (message) => {
    let player = players.find((p) => p.id === socket.id);
    if (player) {
      // If seated in a room or watching it, handle their departure.
      const room = player.roomCode ? rooms[player.roomCode] : null;
      if (room) {
        if (roomIndexOf(room, socket.id) === -1) {
          // Spectator disconnected.
          const si = room.spectators.indexOf(player);
          if (si !== -1) {
            room.spectators.splice(si, 1);
            player.roomCode = null;
            toRoom(room, "room-update", getRoomView(room));
          }
        } else {
          if (room.pizza.active) pizza.reset(room);
          room.resetRequest = false;
          reversi.reset(room);
          rps.reset(room);
          connect4.reset(room);
          if (room.gameOn) {
            room.gameOn = false;
            room.table = tictactoe.emptyTable();
            room.virtualTable = tictactoe.emptyVirtualTable();
          }
          const other = room.players.find((p) => p && p.id !== socket.id);
          if (other) {
            io.to(other.id).emit("p2-left", player.name);
            io.to(other.id).emit("clear-table", "");
          }
          toSpectators(room, "spectate-reset");
          toRoom(room, "room-update", getRoomView(room));
        }
        if (!room.players.some(Boolean)) {
          closeRoom(room);
        }
      }
      player.online = false;
      // Do not remove player from persistent storage on disconnect, keep their
      // data for reconnection.
    }
    io.emit("online-players", getOnlinePlayers());
    console.log(socket.id + " disconnected");
  });

  // -------- Tic-tac-toe handlers --------
  socket.on("btn-pos", (x) => {
    const room = getRoomForSocket(socket);
    if (!room || !room.gameOn) return;
    tictactoe.play(socket, room, x);
  });

  socket.on("user-message", (message) => {
    console.log(message);
    socket.broadcast.emit("user-message", message);
  });

  socket.on("user-typing", (data) => {
    const player = players.find((p) => p.id === socket.id);
    const name = player ? player.name : "Player";
    socket.broadcast.emit("opponent-typing", {
      isTyping: data.isTyping,
      name,
    });
  });

  // -------- Private chat (player-to-player) --------
  socket.on("private-message", (data) => {
    const from = players.find((p) => p.id === socket.id);
    if (!from || !from.online || from.isBot) return;
    const text = String((data && data.text) || "").trim();
    if (!text) return;
    const target =
      players.find(
        (p) =>
          p.persistentUserId === (data && data.toUid) &&
          p.online &&
          !p.isBot,
      ) ||
      players.find(
        (p) => p.id === (data && data.to) && p.online && !p.isBot,
      );
    if (!target) return;
    const saved = privateChat.addMessage(
      from.persistentUserId,
      target.persistentUserId,
      from.persistentUserId,
      from.name,
      text,
      (data && data.replyTo) || null,
    );
    io.to(target.id).emit("private-message", {
      fromId: socket.id,
      fromUid: from.persistentUserId,
      fromName: from.name,
      text,
      replyTo: saved.replyTo,
      at: saved.at,
    });
    console.log("[dm] " + from.name + " → " + target.name + ": " + text);
  });

  socket.on("join-private-chat", (data) => {
    const from = players.find((p) => p.id === socket.id);
    if (!from || !from.persistentUserId) return;
    const partnerUid = (data && data.partnerUid) || "";
    if (!partnerUid) return;
    if (partnerUid === from.persistentUserId) return;
    const messages = privateChat.getMessages(
      from.persistentUserId,
      partnerUid,
    );
    const partner =
      players.find((p) => p.persistentUserId === partnerUid && !p.isBot) ||
      null;
    const lastPartnerMsg = partner
      ? null
      : messages
            .slice()
            .reverse()
            .find((m) => m.fromUid === partnerUid);
    socket.emit("private-history", {
      partnerUid,
      partnerName: partner
        ? partner.name
        : lastPartnerMsg
          ? lastPartnerMsg.fromName
          : "",
      messages,
    });
  });

  socket.on("private-typing", (data) => {
    const from = players.find((p) => p.id === socket.id);
    const target =
      players.find(
        (p) =>
          p.persistentUserId === (data && data.toUid) &&
          p.online &&
          !p.isBot,
      ) ||
      players.find(
        (p) => p.id === (data && data.to) && p.online && !p.isBot,
      );
    if (!from || !target) return;
    io.to(target.id).emit("private-typing", {
      fromId: socket.id,
      fromUid: from.persistentUserId,
      fromName: from.name,
      isTyping: !!(data && data.isTyping),
    });
  });

  socket.on("select-game", (data) => {
    const room = getRoomForSocket(socket);
    if (!room) {
      socket.emit("server-warn", "Join or create a room first to pick a game.");
      return;
    }
    const index = roomIndexOf(room, socket.id);
    if (index === -1) return;
    const gameId = data && data.game;
    if (
      gameId !== "tictactoe" &&
      gameId !== "pizza" &&
      gameId !== "reversi" &&
      gameId !== "rps" &&
      gameId !== "connect4"
    )
      return;
    if (room.gameOn) {
      socket.emit("server-warn", "A Tic Tac Toe game is already in progress.");
      return;
    }
    if (room.pizza.active) {
      socket.emit("server-warn", "A Pizza game is already in progress.");
      return;
    }
    if (room.reversi.active) {
      socket.emit("server-warn", "A Reversi game is already in progress.");
      return;
    }
    if (room.rps.active) {
      socket.emit("server-warn", "A Rock Paper Scissors game is already in progress.");
      return;
    }
    if (room.connect4.active) {
      socket.emit("server-warn", "A Connect 4 game is already in progress.");
      return;
    }
    const player = room.players[index];
    player.game = gameId;
    if (gameId === "tictactoe") {
      // Symbols only exist temporarily while playing tic tac toe
      player.symbol = tictactoe.assignSymbolFor(room, index);
    } else if (gameId === "reversi") {
      player.symbol = reversi.assignSymbolFor(room, index);
    } else if (gameId === "connect4") {
      player.symbol = connect4.assignSymbolFor(room, index);
    } else {
      player.symbol = null;
    }
    const otherPlayer = room.players[1 - index];
    if (otherPlayer) {
      socket.emit(
        "server-info",
        "You selected " +
          gameId +
          ". Waiting for " +
          otherPlayer.name +
          " to pick the same game...",
      );
    }
    toRoom(room, "room-update", getRoomView(room));
    maybeStartSelectedGame(room);
  });

  socket.on("leave-game", () => {
    const room = getRoomForSocket(socket);
    if (!room) return;
    const index = roomIndexOf(room, socket.id);
    if (index === -1) return;
    const player = room.players[index];
    player.game = null;
    player.symbol = null;
    const other = room.players[1 - index];
    room.resetRequest = false;
    if (room.gameOn) {
      room.gameOn = false;
      room.table = tictactoe.emptyTable();
      room.virtualTable = tictactoe.emptyVirtualTable();
      if (other) io.to(other.id).emit("clear-table", "");
    }
    pizza.reset(room);
    reversi.reset(room);
    rps.reset(room);
    connect4.reset(room);
    if (other) io.to(other.id).emit("p2-left", player.name);
    toSpectators(room, "spectate-reset");
    toRoom(room, "room-update", getRoomView(room));
  });

  socket.on("take-seat", () => {
    const room = getRoomForSocket(socket);
    if (!room) return;
    const player = players.find((p) => p.id === socket.id);
    if (!player || roomIndexOf(room, socket.id) !== -1) return;
    if (room.gameOn || room.pizza.active || room.reversi.active || room.rps.active || room.connect4.active) {
      socket.emit("server-warn", "Wait for the current game to end first.");
      return;
    }
    const seat = findFreeSeat(room);
    if (seat === -1) {
      socket.emit("server-warn", "No empty seats right now.");
      return;
    }
    const si = room.spectators.indexOf(player);
    if (si !== -1) room.spectators.splice(si, 1);
    room.players[seat] = player;
    socket.emit("server-info", "You took a seat in the game!");
    const other = room.players.find((p) => p && p.id !== socket.id);
    if (other) {
      io.to(other.id).emit("server-info", player.name + " took a seat!");
    }
    socket.emit("room-joined", { code: room.code, resuming: false });
    toRoom(room, "room-update", getRoomView(room));
    io.emit("online-players", getOnlinePlayers());
  });

  // -------- Pizza game handlers --------
  socket.on("pizza-submit", (data) => {
    const room = getRoomForSocket(socket);
    if (room) pizza.submit(socket, room, data);
  });

  socket.on("pizza-attack", (data) => {
    const room = getRoomForSocket(socket);
    if (room) pizza.attack(socket, room, data);
  });

  socket.on("pizza-rematch", () => {
    const room = getRoomForSocket(socket);
    if (room) pizza.rematch(socket, room);
  });

  // -------- Reversi game handlers --------
  socket.on("reversi-move", (data) => {
    const room = getRoomForSocket(socket);
    if (room) reversi.play(socket, room, data);
  });

  socket.on("reversi-rematch", () => {
    const room = getRoomForSocket(socket);
    if (room) reversi.rematch(socket, room);
  });

  // -------- Rock Paper Scissors game handlers --------
  socket.on("rps-pick", (data) => {
    const room = getRoomForSocket(socket);
    if (room) rps.pick(socket, room, data);
  });

  socket.on("rps-rematch", () => {
    const room = getRoomForSocket(socket);
    if (room) rps.rematch(socket, room);
  });

  // -------- Connect 4 game handlers --------
  socket.on("connect4-drop", (data) => {
    const room = getRoomForSocket(socket);
    if (room) connect4.play(socket, room, data);
  });

  socket.on("connect4-rematch", () => {
    const room = getRoomForSocket(socket);
    if (room) connect4.rematch(socket, room);
  });
});

//console.log("serving!");
// Everything now runs on port 3000 (override with PORT env var)!
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(
    `Game and WebSockets running together on http://localhost:${PORT}`,
  );
});