const fs = require("fs"); // Import file system module
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const crypto = require("crypto");
const { promisify } = require("util");
const scrypt = promisify(crypto.scrypt);
const randomBytes = promisify(crypto.randomBytes);

const createRooms = require("./lib/rooms");
const createTicTacToeGame = require("./lib/tictactoe");
const createPizza = require("./lib/pizza");
const createReversi = require("./lib/reversi");
const createBot = require("./lib/bot");

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

// Hash a password with a random salt using scrypt.
async function hashPassword(password) {
  const salt = (await randomBytes(16)).toString("hex");
  const hash = (await scrypt(password, salt, 64)).toString("hex");
  return { salt, hash };
}

// Verify a plaintext password against the stored salt + hash.
async function verifyPassword(password, salt, hash) {
  const candidate = (await scrypt(password, salt, 64)).toString("hex");
  return candidate === hash;
}

// Generate a random login token.
function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

// Load data when the server starts (before the game modules capture `stats`)
loadStats();
loadAccounts();

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

function getOnlinePlayers() {
  return players
    .filter((p) => p.online && !p.isBot)
    .map((p) => ({
      id: p.id,
      name: p.name,
      game: p.game,
      roomCode: p.roomCode,
    }));
}

// Start the selected game when both seated players agree on one.
function maybeStartSelectedGame(room) {
  if (room.gameOn || room.pizza.active || room.reversi.active) return;
  if (!room.players[0] || !room.players[1]) return;
  const p0 = room.players[0];
  const p1 = room.players[1];
  if (!p0.game || p0.game !== p1.game) return;
  if (p0.game === "pizza") {
    pizza.startGame(room);
  } else if (p0.game === "reversi") {
    reversi.startGame(room);
  } else {
    room.gameOn = true;
    tictactoe.startGame(room);
  }
}

io.on("connection", (socket) => {
  socket.emit("join-message", "connected to server ✅");
  // The client sends its stored login token via 'auth-connect'
  // (or falls back to 'player-initial-connect' for the legacy /name flow)
  socket.emit(
    "server-info",
    "Please wait while we set things up, or use '/name <your name>' if you are new!",
  );
  console.log(socket.id);

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
    if (room.gameOn || room.pizza.active || room.reversi.active) {
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
      gameId !== "reversi"
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
    const player = room.players[index];
    player.game = gameId;
    if (gameId === "tictactoe") {
      // Symbols only exist temporarily while playing tic tac toe
      player.symbol = tictactoe.assignSymbolFor(room, index);
    } else if (gameId === "reversi") {
      player.symbol = reversi.assignSymbolFor(room, index);
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
    if (other) io.to(other.id).emit("p2-left", player.name);
    toSpectators(room, "spectate-reset");
    toRoom(room, "room-update", getRoomView(room));
  });

  socket.on("take-seat", () => {
    const room = getRoomForSocket(socket);
    if (!room) return;
    const player = players.find((p) => p.id === socket.id);
    if (!player || roomIndexOf(room, socket.id) !== -1) return;
    if (room.gameOn || room.pizza.active || room.reversi.active) {
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
});

//console.log("serving!");
// Everything now runs on port 3000 (override with PORT env var)!
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(
    `Game and WebSockets running together on http://localhost:${PORT}`,
  );
});