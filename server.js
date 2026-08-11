const fs = require("fs"); // Import file system module
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const crypto = require("crypto");
const { promisify } = require("util");
const scrypt = promisify(crypto.scrypt);
const randomBytes = promisify(crypto.randomBytes);

const app = express();
// Create the unified HTTP server
const server = http.createServer(app);

// Attach Socket.IO to the server with CORS open for local/tunnel testing
const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:3000",
      "http://192.168.0.139:3000",
      "http://192.168.0.180:3000", //wp-360
      "https://fond-dory-suitable.ngrok-free.app",
    ],
    methods: ["GET", "POST"],
  },
});

// 1. Serve your Tic-Tac-Toe frontend files statically
// (Point this to your web page build folder, e.g., 'public' or 'dist')
app.use(express.static(path.join(__dirname, "public")));

// `players` holds the currently active (connected) players for this server run.
var players = [];
const statsFilePath = path.join(__dirname, "stats.json");
// Stats structure: { gamesPlayed: number, players: { [persistentUserId]: { wins, losses, draws, name, symbol } } }
var stats = { gamesPlayed: 0, players: {} };
const accountsFilePath = path.join(__dirname, "accounts.json");
// Simple username/password accounts for a small circle of friends.
// accounts.accounts[usernameLower] = { username, salt, hash, persistentUserId }
// accounts.tokens[token] = usernameLower  (auto-login "remember me" tokens)
var accounts = { accounts: {}, tokens: {} };
var table = ["", "", "", "", "", "", "", "", ""];
var virtualTable = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];
var validCombo = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];
var r, symbol;
var gameOn = false;
var currentPlayer = 0;
var resetRequest = false;
// Pizza game state ("Find My Pizza")
// boards[i] = 20 booleans marking where player i hid slices
// attacked[i] = 20 booleans marking cells on player i's board already probed
// found[i] = slices the opponent has found ON player i's board (i.e. wins for 1-i)
var pizza = {
  active: false,
  phase: "idle", // idle | placement | battle | over
  boards: [Array(20).fill(false), Array(20).fill(false)],
  attacked: [Array(20).fill(false), Array(20).fill(false)],
  found: [0, 0],
  turn: 0,
  submitted: [false, false],
  rematch: [false, false],
  placementTimer: null,
  placementStart: 0,
};

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

// Load data when the server starts
loadStats();
loadAccounts();

// Connect an authenticated/known player to the game. Used by auth-connect,
// register, login and player-initial-connect (legacy /name flow).
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
    socket.emit("set-table", table);

    if (players.length > 1) {
      socket.broadcast.emit("player-reconnect", existingPlayer.name);
    }

    if (gameOn) {
      const currentTurnPlayer = players[currentPlayer];
      if (
        currentTurnPlayer &&
        currentTurnPlayer.persistentUserId === existingPlayer.persistentUserId
      ) {
        socket.emit("set-turn", {
          symbol: existingPlayer.symbol,
          text: "Your turn",
        });
      } else {
        const otherPlayer = players.find(
          (p) => p.persistentUserId !== existingPlayer.persistentUserId,
        );
        if (otherPlayer) socket.emit("p2-turn", otherPlayer.name);
      }
    }

    if (players.length === 2 && !gameOn) maybeStartSelectedGame();
  } else {
    // Not active in this run — treat as a fresh join. A returning registered
    // player gets a freshly assigned symbol (opposite of the current player).
    addNewPlayer(socket, clientName || "Player", persistentUserId);
  }

  // Resync an active pizza game for a reconnecting player
  const idx = players.findIndex(
    (p) => p.persistentUserId === persistentUserId,
  );
  if (idx !== -1 && pizza.active) resyncPizza(socket, idx);

  // Let every connected client see the updated online players list
  io.emit("online-players", getOnlinePlayers());
}

// Register a brand new player into the game (used by set-name and connectPlayer).
function addNewPlayer(socket, name, persistentUserId) {
  if (players.length >= 2) {
    socket.emit("server-warn", "Game is full. Please wait for a spot to open.");
    return false;
  }

  let assignedSymbol;
  if (players.length === 0) {
    r = Math.floor(Math.random() * 2);
    assignedSymbol = r === 0 ? "x" : "o";
  } else {
    // Assign the opposite symbol to the first player
    assignedSymbol = players[0].symbol === "x" ? "o" : "x";
  }

  var newPlayer = {
    id: socket.id,
    name,
    turn: false,
    symbol: assignedSymbol,
    persistentUserId, // Store the persistent ID
    game: null, // Selected game (tictactoe | pizza)
    online: true,
  };
  console.log(newPlayer);
  socket.emit("name-set", { name, symbol: assignedSymbol });
  socket.emit("set-table", table); // Send current table state to the new player

  players.push(newPlayer);
  io.emit("online-players", getOnlinePlayers());

  // Ensure a stats entry exists for this player
  if (!stats.players[persistentUserId]) {
    stats.players[persistentUserId] = {
      wins: 0,
      losses: 0,
      draws: 0,
      name,
      symbol: assignedSymbol,
    };
    saveStats();
  }

  if (players.length < 2) {
    socket.emit("server-info", "waiting for player 2...");
  }

  if (players.length === 2) {
    socket.emit(
      "server-info",
      "Player 2 joined! Select a game from the lobby to start.",
    );
    const otherPlayer = players.find((p) => p.id !== socket.id);
    if (otherPlayer) {
      io.to(otherPlayer.id).emit(
        "p2-join",
        newPlayer.name + " joined! Select a game from the lobby to start.",
      );
    }
    maybeStartSelectedGame();
  }
  return true;
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
  // in automatically and connect them to the game. Otherwise we ask them to
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

      if (gameOn) {
        socket.emit("server-warn", "you can't change your name during a game");
      } else {
        // Player exists and is not in game, allow name change
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
        }); // Re-send symbol with updated name
        socket.broadcast.emit(
          "server-info",
          `Player ${existingPlayer.symbol} is now known as ${name}.`,
        );
        io.emit("online-players", getOnlinePlayers());
      }
    } else {
      // This is a new player trying to set a name for the first time
      addNewPlayer(socket, name.trim(), persistentUserId);
    }
  });

  socket.on("new-user", (name) => {
    console.log(name);
  });

  socket.on("reset-game", (x) => {
    resetGame();
  });

  socket.on("request-game-reset", (name) => {
    socket.broadcast.emit(
      "server-info",
      name + " wants to reset the game, use '/accept' to accept the request",
    );
    resetRequest = true;
  });

  socket.on("accept-game-reset", (x) => {
    if (resetRequest) {
      resetGame();
      resetRequest = false;
    } else {
      socket.emit("server-info", "No reset request");
    }
  });

  socket.on("echo-message", (message) => {
    console.log(message);
    setTimeout(() => {
      socket.emit("server-echo", "server: " + message);
    }, 1000);
  });

  socket.on("disconnect", (message) => {
    let playerRegistered = players.some((player) => player.id == socket.id);
    if (playerRegistered) {
      if (pizza.active) resetPizza();
      let index = getIndex(socket.id);
      if (index !== -1) {
        // Ensure player is found before processing
        let nm = players[index].name;
        socket.broadcast.emit("p2-left", nm);
        players[index].online = false;
        // Do not remove player from persistent storage on disconnect, only update their socket.id if needed
        // players.splice(index, 1); // Removed: Keep player data for reconnection
        // Instead, we might want to mark them as disconnected or just let the new connection overwrite their socket.id
        // For now, we'll just log and keep their data in 'players' array for next connection.
      }
      io.emit("online-players", getOnlinePlayers());
    }
    console.log(socket.id + " disconnected");
  });

  socket.on("btn-pos", (x) => {
    if (table[x.index] == "") {
      table[x.index] = x.symbol;
      virtualTable[x.index] = x.symbol;
      //console.log(x);
      socket.broadcast.emit("click-btn", x);
      checkWin();
    } else {
      socket.emit("invalid-move", "invalid move be careful 🫤");
    }
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
    const index = getIndex(socket.id);
    if (index === -1) return;
    const gameId = data && data.game;
    if (gameId !== "tictactoe" && gameId !== "pizza") return;
    if (gameOn) {
      socket.emit("server-warn", "A Tic Tac Toe game is already in progress.");
      return;
    }
    if (pizza.active) {
      socket.emit("server-warn", "A Pizza game is already in progress.");
      return;
    }
    players[index].game = gameId;
    const otherPlayer = players.find((p) => p.id !== socket.id);
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
    maybeStartSelectedGame();
  });

  socket.on("leave-game", () => {
    const index = getIndex(socket.id);
    if (index === -1) return;
    players[index].game = null;
    const other = players[1 - index];
    if (gameOn) {
      gameOn = false;
      table = ["", "", "", "", "", "", "", "", ""];
      virtualTable = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];
      if (other) io.to(other.id).emit("clear-table", "");
    }
    resetPizza();
    if (other) io.to(other.id).emit("p2-left", players[index].name);
  });

  // -------- Pizza game handlers --------
  socket.on("pizza-submit", (data) => {
    if (pizza.phase !== "placement") return;
    const index = getIndex(socket.id);
    if (index === -1 || pizza.submitted[index]) return;
    const board = data && data.board;
    if (!Array.isArray(board) || board.length !== 20) return;
    const count = board.reduce((n, v) => n + (v ? 1 : 0), 0);
    if (count !== 5) {
      socket.emit("pizza-info", "Place exactly 5 slices before locking in.");
      return;
    }
    pizza.boards[index] = board.map(Boolean);
    pizza.submitted[index] = true;
    const other = players[1 - index];
    if (other) io.to(other.id).emit("pizza-opponent-locked");
    if (pizza.submitted[0] && pizza.submitted[1]) {
      beginPizzaBattle();
    } else {
      socket.emit("pizza-waiting", {
        opponentDone: pizza.submitted[1 - index],
      });
    }
  });

  socket.on("pizza-attack", (data) => {
    if (pizza.phase !== "battle" || !pizza.active) return;
    const index = getIndex(socket.id);
    if (index === -1 || index !== pizza.turn) return;
    const cell = data && data.cell;
    if (typeof cell !== "number" || cell < 0 || cell > 19) return;
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
    const gameOver = pizza.found[index] >= 5;
    if (gameOver) {
      pizza.active = false;
      pizza.phase = "over";
      io.to(players[index].id).emit("pizza-game-over", {
        won: true,
      });
      io.to(players[defender].id).emit("pizza-game-over", {
        won: false,
      });
      io.emit(
        "server-info",
        "Pizza game over! Go back to the lobby to play again.",
      );
    } else {
      pizza.turn = defender;
      io.to(players[index].id).emit("pizza-attack-result", {
        youAttacked: true,
        cell,
        hit,
        yourTurn: false,
      });
      io.to(players[defender].id).emit("pizza-attack-result", {
        youAttacked: false,
        cell,
        hit,
        yourTurn: true,
      });
    }
  });

  socket.on("pizza-rematch", () => {
    if (pizza.phase !== "over") return;
    const index = getIndex(socket.id);
    if (index === -1 || pizza.rematch[index]) return;
    pizza.rematch[index] = true;
    const other = players[1 - index];
    if (other) io.to(other.id).emit("pizza-rematch-request");
    if (pizza.rematch[0] && pizza.rematch[1]) {
      startPizzaGame();
    } else {
      socket.emit("pizza-info", "Waiting for opponent to rematch...");
    }
  });
});

function startGame() {
  io.to(players[0].id).emit("player2", {
    name: players[1].name,
    symbol: players[1].symbol,
  });
  io.to(players[1].id).emit("player2", {
    name: players[0].name,
    symbol: players[0].symbol,
  });
  /*for(let i=0; i<players.length; i++){
		io.to(players[i].id).emit("server-info", "we dey active");
	}*/
  setTimeout(() => {
    currentPlayer = Math.floor(Math.random() * 2);
    let inv = currentPlayer == 0 ? 1 : 0;
    io.to(players[inv].id).emit("p2-turn", players[currentPlayer].name);
    io.to(players[currentPlayer].id).emit("set-turn", {
      symbol: players[currentPlayer].symbol,
      text: "Your turn",
    });
  }, 1000);
}

function checkWin() {
  var win;
  for (let i = 0; i < validCombo.length; i++) {
    let combo = validCombo[i];
    if (
      virtualTable[combo[0]] == virtualTable[combo[1]] &&
      virtualTable[combo[0]] == virtualTable[combo[2]]
    ) {
      win = true;
      break;
    }
  }

  if (win) {
    gameOn = false;
    let inv = currentPlayer == 0 ? 1 : 0;
    io.to(players[inv].id).emit("p2-win", players[currentPlayer].name + " won");
    io.to(players[currentPlayer].id).emit("you-win", "You Win! 🎉");

    // Update stats: games played, winner wins, loser losses
    stats.gamesPlayed = (stats.gamesPlayed || 0) + 1;
    const winner = players[currentPlayer];
    const loser = players[inv];
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

    io.emit("server-info", "use '/reset' to start a new game");
  } else {
    // Check for a draw
    const isDraw = table.every((cell) => cell !== "");
    if (isDraw) {
      gameOn = false;
      io.emit("draw-game", "It's a Draw! 🤝");

      // Update stats for draw
      stats.gamesPlayed = (stats.gamesPlayed || 0) + 1;
      // increment draw for all active players
      players.forEach((p) => {
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

      io.emit("server-info", "use '/reset' to start a new game");
    } else {
      currentPlayer = currentPlayer == 0 ? 1 : 0;
      let inv = currentPlayer == 0 ? 1 : 0;
      io.to(players[inv].id).emit("p2-turn", players[currentPlayer].name);
      //io.emit("p2-turn", players[currentPlayer].name);
      setTimeout(() => {
        io.to(players[currentPlayer].id).emit("set-turn", {
          symbol: players[currentPlayer].symbol,
          text: "Your turn",
        });
      }, 1000);
    }
  }
}

function resetGame() {
  table = ["", "", "", "", "", "", "", "", ""];
  virtualTable = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];
  io.emit("clear-table", "");

  gameOn = true;
  setTimeout(() => {
    currentPlayer = Math.floor(Math.random() * 2);
    let inv = currentPlayer == 0 ? 1 : 0;
    io.to(players[inv].id).emit("p2-turn", players[currentPlayer].name);
    io.to(players[currentPlayer].id).emit("set-turn", {
      symbol: players[currentPlayer].symbol,
      text: "Your turn",
    });
  }, 1000);
}

function getIndex(id) {
  var idx;
  for (let i = 0; i < players.length; i++) {
    if (players[i].id == id) {
      idx = i;
      break;
    }
  }
  return idx;
}

function getOnlinePlayers() {
  return players
    .filter((p) => p.online)
    .map((p) => ({
      id: p.id,
      name: p.name,
      symbol: p.symbol,
      game: p.game,
    }));
}

// Start the pizza game for both selected players
function maybeStartSelectedGame() {
  if (gameOn || pizza.active) return;
  if (players.length < 2) return;
  const p0 = players[0];
  const p1 = players[1];
  if (!p0.game || p0.game !== p1.game) return;
  if (p0.game === "pizza") {
    startPizzaGame();
  } else {
    gameOn = true;
    startGame();
  }
}

function resetPizza() {
  if (pizza.placementTimer) clearTimeout(pizza.placementTimer);
  pizza = {
    active: false,
    phase: "idle",
    boards: [Array(20).fill(false), Array(20).fill(false)],
    attacked: [Array(20).fill(false), Array(20).fill(false)],
    found: [0, 0],
    turn: 0,
    submitted: [false, false],
    rematch: [false, false],
    placementTimer: null,
    placementStart: 0,
  };
}

function startPizzaGame() {
  resetPizza();
  pizza.active = true;
  pizza.phase = "placement";
  pizza.placementStart = Date.now();
  pizza.placementTimer = setTimeout(() => {
    if (pizza.phase !== "placement") return;
    for (let i = 0; i < 2; i++) {
      if (!pizza.submitted[i]) {
        autoPlacePizza(i);
        io.to(players[i].id).emit(
          "pizza-info",
          "Time's up! Slices placed randomly.",
        );
      }
    }
    beginPizzaBattle();
  }, 30000);

  for (let i = 0; i < 2; i++) {
    io.to(players[i].id).emit("pizza-start", {
      opponentName: players[1 - i].name,
      boardSize: 20,
      slices: 5,
      timeLimit: 30,
    });
  }
}

function autoPlacePizza(i) {
  const board = pizza.boards[i];
  let placed = 0;
  while (placed < 5) {
    const c = Math.floor(Math.random() * 20);
    if (!board[c]) {
      board[c] = true;
      placed++;
    }
  }
  pizza.submitted[i] = true;
}

function beginPizzaBattle() {
  if (pizza.phase !== "placement") return;
  clearTimeout(pizza.placementTimer);
  pizza.phase = "battle";
  pizza.turn = Math.floor(Math.random() * 2);
  for (let i = 0; i < 2; i++) {
    io.to(players[i].id).emit("pizza-battle-start", {
      yourTurn: pizza.turn === i,
      opponentName: players[1 - i].name,
    });
  }
}

function resyncPizza(socket, index) {
  if (!pizza.active) return;
  const opp = 1 - index;
  const oppGuesses = pizza.attacked[opp].map((attacked, c) =>
    attacked ? pizza.boards[opp][c] : null,
  );
  const timeLeft = Math.max(
    0,
    Math.ceil(30 - (Date.now() - pizza.placementStart) / 1000),
  );
  io.to(players[index].id).emit("pizza-sync", {
    phase: pizza.phase,
    submitted: pizza.submitted[index],
    myBoard: pizza.boards[index],
    myAttacked: pizza.attacked[index].slice(),
    oppGuesses,
    myTurn: pizza.turn === index,
    opponentName: players[opp].name,
    timeLeft,
    result:
      pizza.phase === "over"
        ? pizza.found[index] >= 5
          ? "won"
          : "lost"
        : pizza.found[opp] >= 5
          ? "lost"
          : null,
  });
}

//console.log("serving!");
// Everything now runs on port 3000!
const PORT = 3000;
server.listen(PORT, () => {
  console.log(
    `Game and WebSockets running together on http://localhost:${PORT}`,
  );
});
