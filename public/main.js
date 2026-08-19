const socketUrls = [
      "http://192.168.0.180:3000", //wp-360
      "http://192.168.43.219:3000", //wp-360
      "https://fond-dory-suitable.ngrok-free.app",
      "http://192.168.0.139:3000",
      "http://localhost:3000",
];
var socket = null;
var currentSocketUrlIndex = 0;

var app = new Vue({
      el: "#app",
      data: {
            view: "auth",
            myName: localStorage.getItem("myName") || "",
            opponent: "",
            socketId: "",
            connectionStatus: "connecting", // connecting | connected | disconnected
            hasNewMessage: false,
            theme: localStorage.getItem("gameTheme") || "sunset",
            mode: localStorage.getItem("gameMode") === "dark" ? "dark" : "light",
      },
      methods: {
            openChat() {
                  this.hasNewMessage = false;
                  if (this.$refs.chat) this.$refs.chat.open();
            },
            selectGame(g) {
                  if (g.disabled) return;
                  if (this.$refs.chat) this.$refs.chat.close();
                  socket.emit("select-game", { game: g.id });
            },
            addBot(difficulty) {
                  socket.emit("add-bot", { difficulty: difficulty || "medium" });
            },
            removeBot() {
                  socket.emit("remove-bot");
            },
            setTheme(themeId) {
                  const themes = ["sunset", "midnight", "forest", "ocean"];
                  if (themes.indexOf(themeId) === -1) return;
                  this.theme = themeId;
                  localStorage.setItem("gameTheme", themeId);
                  document.documentElement.setAttribute("data-theme", themeId);
            },
            setMode(mode) {
                  if (mode !== "light" && mode !== "dark") return;
                  this.mode = mode;
                  localStorage.setItem("gameMode", mode);
                  document.documentElement.setAttribute("data-mode", mode);
            },
            backToRoom() {
                  if (this.view === "spectator") {
                        socket.emit("leave-room");
                        this.goLobby();
                        return;
                  }
                  socket.emit("leave-game");
                  if (this.$refs.chat) this.$refs.chat.close();
                  this.view = "room";
                  sessionStorage.setItem("view", "room");
                  if (this.$refs.tt) this.$refs.tt.resetView();
                  if (this.$refs.pizza) this.$refs.pizza.clearTimer();
                  if (this.$refs.reversi) this.$refs.reversi.resetView();
                  if (this.$refs.rps) this.$refs.rps.resetView();
            },
            leaveRoom() {
                  socket.emit("leave-room");
                  this.goLobby();
            },
            goLobby() {
                  socket.emit("leave-game");
                  if (this.$refs.chat) this.$refs.chat.close();
                  this.view = "lobby";
                  sessionStorage.removeItem("view");
                  if (this.$refs.tt) this.$refs.tt.resetView();
                  if (this.$refs.pizza) this.$refs.pizza.clearTimer();
                  if (this.$refs.reversi) this.$refs.reversi.resetView();
                  if (this.$refs.rps) this.$refs.rps.resetView();
                  if (this.$refs.spectator) this.$refs.spectator.reset();
                  if (this.$refs.room) this.$refs.room.reset();
            },
            onAuthSubmit(payload) {
                  socket.emit(payload.mode === "register" ? "register" : "login", {
                        username: payload.username,
                        password: payload.password,
                        persistentUserId: persistentUserId,
                  });
            },
      },
      watch: {
            view(newVal, oldVal) {
                  if (newVal !== "lobby" && oldVal === "lobby") {
                        history.pushState({ nav: true }, "");
                  }
            },
      },
      mounted() {
            if (this.view !== "lobby") {
                  history.pushState({ nav: true }, "");
            }
      },
});

// Back button: close the chat first, then leave the game back to the lobby.
window.addEventListener("popstate", () => {
      if (app.view === "auth") return;
      if (app.$refs.chat && app.$refs.chat.chatOpen) {
            app.$refs.chat.close();
      } else if (app.view !== "lobby") {
            app.backToRoom();
      }
});

// Audio elements (referenced by game + chat logic)
var messageTone = document.getElementById("messageTone");
var serverMessageTone = document.getElementById("serverMessageTone");
var win = document.getElementById("win");
var lose = document.getElementById("lose");
var draw = document.getElementById("draw");
var moveSound = document.getElementById("move");
var joinSound = document.getElementById("join");

// Play an audio element, silently ignoring failures (e.g. missing file).
function playSound(el) {
      if (!el) return;
      try {
            el.currentTime = 0;
            var p = el.play();
            if (p && p.catch) p.catch(function () {});
      } catch (e) {}
}

// If a dedicated sound file is missing, fall back to an existing one so the
// app keeps working until the user drops in the real file.
function withFallback(el, fallbackEl) {
      if (!el || !fallbackEl) return;
      el.addEventListener(
            "error",
            function () {
                  if (el.getAttribute("data-fallback") === "1") return;
                  el.src = fallbackEl.src;
                  el.setAttribute("data-fallback", "1");
                  el.load();
            },
            { once: true },
      );
}
withFallback(draw, serverMessageTone);
withFallback(moveSound, messageTone);
withFallback(joinSound, serverMessageTone);

var persistentUserId = localStorage.getItem("persistentUserId");
if (!persistentUserId) {
      // Fallback for environments where crypto.randomUUID is not available
      persistentUserId = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
            /[xy]/g,
            function (c) {
                  var r = (Math.random() * 16) | 0,
                        v = c == "x" ? r : (r & 0x3) | 0x8;
                  return v.toString(16);
            },
      );
      localStorage.setItem("persistentUserId", persistentUserId);
}

function connectSocket() {
      if (socket) {
            socket.off();
            socket.close();
      }
      const url = socketUrls[currentSocketUrlIndex];
      socket = io(url, {
            reconnection: false,
      });
      socket._serverUrl = url;

      socket.on("connect", () => {
            app.connectionStatus = "connected";
            showToast("Connected to server", "success");
            app.socketId = socket.id;
            socket.emit("auth-connect", {
                  token: localStorage.getItem("authToken") || "",
                  persistentUserId: persistentUserId,
            });
      });

      socket.on("auth-required", () => {
            app.view = "auth";
            if (app.$refs.auth) app.$refs.auth.reset();
      });

      socket.on("auth-success", (data) => {
            localStorage.setItem("authToken", data.token);
            localStorage.setItem("authUsername", data.username || "");
            const saved = sessionStorage.getItem("view");
            app.view = ["tictactoe", "pizza", "reversi", "rps", "spectator", "room"].includes(saved)
                  ? saved
                  : "lobby";
            if (app.$refs.auth) app.$refs.auth.reset();
      });

      socket.on("auth-error", (message) => {
            if (app.$refs.auth) app.$refs.auth.showError(message);
      });

      // -------- Room socket handlers --------
      socket.on("room-created", (data) => {
            showToast("Room " + data.code + " created!", "success");
            if (app.$refs.chat) app.$refs.chat.resetOpponent();
            app.view = "room";
            sessionStorage.setItem("view", "room");
      });

      socket.on("room-joined", (data) => {
            const spectator = !!data.spectator;
            if (spectator) {
                  showToast("Room " + data.code + " is full — watching as spectator 👁", "success");
                  if (app.$refs.chat) app.$refs.chat.resetOpponent();
                  if (app.$refs.spectator) app.$refs.spectator.start(data);
                  app.view = "spectator";
                  sessionStorage.setItem("view", "spectator");
                  return;
            }
            showToast("Welcome to room " + data.code, "success");
            if (app.$refs.chat) app.$refs.chat.resetOpponent();
            app.view = "room";
            sessionStorage.setItem("view", "room");
      });

      socket.on("room-update", (data) => {
            if (app.$refs.room) app.$refs.room.setRoom(data);
            if (app.$refs.spectator && app.view === "spectator") {
                  app.$refs.spectator.setRoomInfo(data);
            }
      });

      // -------- Spectator handlers (active while watching a full room) --------
      socket.on("spectate-tictactoe", (data) => {
            if (app.$refs.spectator) app.$refs.spectator.handleTictactoe(data);
      });

      socket.on("spectate-reversi", (data) => {
            if (app.$refs.spectator) app.$refs.spectator.handleReversi(data);
      });

      socket.on("spectate-pizza", (data) => {
            if (app.$refs.spectator) app.$refs.spectator.handlePizza(data);
      });

      socket.on("spectate-rps", (data) => {
            if (app.$refs.spectator) app.$refs.spectator.handleRps(data);
      });

      socket.on("spectate-reset", () => {
            if (app.$refs.spectator) app.$refs.spectator.handleReset();
      });

      socket.on("room-error", (msg) => {
            showToast(msg, "error");
      });

      socket.on("room-left", () => {
            app.goLobby();
      });

      socket.on("online-players", (list) => {
            if (app.$refs.lobby) app.$refs.lobby.setOnlinePlayers(list);
      });

      socket.on("connecting", () => {
            app.connectionStatus = "connecting";
      });

      socket.on("connect_error", () => {
            socket.close();
            currentSocketUrlIndex += 1;
            if (currentSocketUrlIndex < socketUrls.length) {
                  connectSocket();
            } else {
                  app.connectionStatus = "disconnected";
                  showToast(
                        "Unable to connect to any configured server.",
                        "error",
                  );
            }
      });

      socket.on("disconnect", () => {
            app.connectionStatus = "disconnected";
            showToast("Disconnected from server", "error");
      });

      socket.on("server-info", (message) => {
            serverMessageTone.play();
            if (app.$refs.chat)
                  app.$refs.chat.addMessage(
                        message,
                        "rounded-xl bg-blue-100 text-center text-blue-500 ",
                        "server",
                  );
      });

      socket.on("server-warn", (message) => {
            serverMessageTone.play();
            if (app.$refs.chat)
                  app.$refs.chat.addMessage(
                        message,
                        "rounded-xl bg-yellow-100 text-center text-yellow-600 ",
                        "server",
                  );
      });

      // -------- Pizza game socket handlers --------
      socket.on("pizza-start", (data) => {
            if (app.view === "lobby" || app.view === "room") {
                  app.view = "pizza";
                  sessionStorage.setItem("view", "pizza");
            }
            if (app.$refs.pizza) app.$refs.pizza.start(data);
      });

      socket.on("pizza-sync", (data) => {
            if (app.$refs.pizza) app.$refs.pizza.syncState(data);
      });

      socket.on("pizza-opponent-locked", () => {
            if (app.$refs.pizza) app.$refs.pizza.opponentLocked();
      });

      socket.on("pizza-battle-start", (data) => {
            if (app.$refs.pizza) app.$refs.pizza.battleStart(data);
      });

      socket.on("pizza-attack-result", (data) => {
            if (app.$refs.pizza) app.$refs.pizza.attackResult(data);
      });

      socket.on("pizza-game-over", (data) => {
            if (app.$refs.pizza) app.$refs.pizza.gameOver(data);
      });

      socket.on("pizza-rematch-request", () => {
            if (app.$refs.pizza) app.$refs.pizza.rematchRequest();
      });

      socket.on("pizza-info", (msg) => {
            if (app.$refs.pizza) app.$refs.pizza.info(msg);
      });

      socket.on("pizza-waiting", (data) => {
            if (app.$refs.pizza) app.$refs.pizza.waiting(data);
      });

      socket.on("autoplace-pizza-board", (data) => {
            if (app.$refs.pizza) app.$refs.pizza.autoPlace(data);
      });

      // -------- Reversi game socket handlers --------
      socket.on("reversi-start", (data) => {
            if (app.view === "lobby" || app.view === "room") {
                  app.view = "reversi";
                  sessionStorage.setItem("view", "reversi");
            }
            if (app.$refs.reversi) app.$refs.reversi.start(data);
      });

      socket.on("reversi-state", (data) => {
            if (app.$refs.reversi) app.$refs.reversi.applyState(data);
      });

      socket.on("reversi-game-over", (data) => {
            if (app.$refs.reversi) app.$refs.reversi.gameOver(data);
      });

      socket.on("reversi-rematch-request", () => {
            if (app.$refs.reversi) app.$refs.reversi.rematchRequest();
      });

      socket.on("reversi-info", (msg) => {
            if (app.$refs.reversi) app.$refs.reversi.info(msg);
      });

      // -------- Rock Paper Scissors game socket handlers --------
      socket.on("rps-start", (data) => {
            if (app.view === "lobby" || app.view === "room") {
                  app.view = "rps";
                  sessionStorage.setItem("view", "rps");
            }
            if (app.$refs.rps) app.$refs.rps.start(data);
      });

      socket.on("rps-round", (data) => {
            if (app.$refs.rps) app.$refs.rps.roundResult(data);
      });

      socket.on("rps-game-over", (data) => {
            if (app.$refs.rps) app.$refs.rps.gameOver(data);
      });

      socket.on("rps-rematch-request", () => {
            if (app.$refs.rps) app.$refs.rps.rematchRequest();
      });

      socket.on("rps-info", (msg) => {
            if (app.$refs.rps) app.$refs.rps.info(msg);
      });

      socket.on("rps-state", (data) => {
            if (app.$refs.rps) app.$refs.rps.syncState(data);
      });

      // -------- Lobby / connection helpers --------
      socket.on("player2", (data) => {
            app.opponent = data.name;
            if (app.$refs.chat) app.$refs.chat.setOpponent(data.name, data.symbol);
            if (app.$refs.tt) app.$refs.tt.setOpponent(data);
            if (app.view === "lobby" || app.view === "room") {
                  app.view = "tictactoe";
                  sessionStorage.setItem("view", "tictactoe");
            }
      });

      socket.on("p2-join", (message) => {
            playSound(joinSound);
            showToast(message, "success");
      });

      socket.on("p2-left", (name) => {
            serverMessageTone.play();
            app.opponent = "";
            if (app.$refs.chat) app.$refs.chat.resetOpponent();
            if (app.$refs.chat) app.$refs.chat.clearHighlights();
            if (app.$refs.tt) app.$refs.tt.resetView();
            if (app.$refs.reversi) app.$refs.reversi.resetView();
            if (app.$refs.rps) app.$refs.rps.resetView();
            showToast(name + " left", "error");
            if (app.view === "tictactoe" || app.view === "pizza" || app.view === "reversi" || app.view === "rps") {
                  app.view = "room";
                  sessionStorage.setItem("view", "room");
            }
      });

      socket.on("player-reconnect", (name) => {
            serverMessageTone.play();
            showToast(name + " reconnected", "success");
      });

      socket.on("welcome-back", (name) => {
            serverMessageTone.play();
            showToast("Welcome back, " + name + "!", "success");
      });

      // -------- Tic Tac Toe socket handlers --------
      socket.on("click-btn", (x) => {
            if (app.$refs.tt) app.$refs.tt.applyClickBtn(x);
            playSound(moveSound);
      });

      socket.on("name-set", (data) => {
            serverMessageTone.play();
            app.myName = data.name;
            localStorage.setItem("myName", data.name);
            if (app.$refs.chat) app.$refs.chat.setMe(data.symbol);
            if (app.$refs.chat)
                  app.$refs.chat.addMessage(
                        "Your name has been set to " + data.name,
                        "rounded-xl bg-yellow-100 text-center text-yellow-600 ",
                        "server",
                  );
      });

      socket.on("p2-win", (message) => {
            lose.play();
            if (app.$refs.chat) app.$refs.chat.clearHighlights();
            if (app.$refs.tt) app.$refs.tt.setResult("lose", message);
      });

      socket.on("you-win", (message) => {
            win.play();
            if (app.$refs.chat) app.$refs.chat.clearHighlights();
            if (app.$refs.tt) app.$refs.tt.setResult("win", message);
      });

      socket.on("draw-game", (message) => {
            if (app.view === "spectator") return;
            playSound(draw);
            if (app.$refs.chat) app.$refs.chat.clearHighlights();
            if (app.$refs.tt) app.$refs.tt.setResult("draw", message);
      });

      socket.on("set-turn", (message) => {
            if (app.view === "lobby" || app.view === "room") {
                  app.view = "tictactoe";
                  sessionStorage.setItem("view", "tictactoe");
            }
            if (app.$refs.tt) app.$refs.tt.setTurn(message);
      });

      socket.on("invalid-move", (message) => {
            showToast(message, "error");
            if (app.$refs.tt) app.$refs.tt.myTurn = true;
      });

      socket.on("p2-turn", (name) => {
            if (app.$refs.tt) app.$refs.tt.opponentTurn(name);
      });

      socket.on("reset-request", (data) => {
            serverMessageTone.play();
            if (app.$refs.tt)
                  app.$refs.tt.handleResetRequest(data && data.name);
      });

      socket.on("reset-declined", () => {
            if (app.$refs.tt) app.$refs.tt.handleResetDeclined();
      });

      socket.on("set-table", (table) => {
            if (app.$refs.tt) app.$refs.tt.applySetTable(table);
      });

      socket.on("clear-table", () => {
            if (app.view === "spectator") return;
            if (app.$refs.tt) app.$refs.tt.applyClearTable();
      });

      socket.on("btn-val", (data) => {
            if (app.$refs.chat)
                  app.$refs.chat.addMessage(data, "bg-orange-400 ", "server");
      });

      socket.on("user-message", (message) => {
            if (app.$refs.chat) app.$refs.chat.receiveUserMessage(message);
      });

      socket.on("opponent-typing", (data) => {
            if (!app.$refs.chat) return;
            if (data.isTyping) app.$refs.chat.showTyping(data.name);
            else app.$refs.chat.hideTyping();
      });
}

connectSocket();

function showToast(message, type) {
      var container = document.getElementById("toastContainer");
      if (!container) return;
      var toast = document.createElement("div");
      toast.className =
            "w-fit max-w-full px-4 py-2 rounded-2xl shadow-xl text-sm font-bold text-white backdrop-blur transition-all duration-300 " +
            (type === "success"
                  ? "bg-green-600/90"
                  : type === "error"
                        ? "bg-red-600/90"
                        : type === "turn"
                              ? "bg-orange-600/90"
                              : "bg-slate-700/90");
      toast.textContent = message;
      container.appendChild(toast);
      setTimeout(() => {
            toast.classList.add("opacity-0", "-translate-y-2");
            setTimeout(() => toast.remove(), 300);
      }, 3000);
}
