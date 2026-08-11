const socketUrls = [
      "http://192.168.0.180:3000", //wp-360
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
      },
      methods: {
            openChat() {
                  this.hasNewMessage = false;
                  if (this.$refs.chat) this.$refs.chat.open();
            },
            selectGame(g) {
                  if (g.disabled) return;
                  if (this.$refs.chat) this.$refs.chat.close();
                  this.view = g.id;
                  sessionStorage.setItem("view", g.id);
                  socket.emit("select-game", { game: g.id });
            },
            backToLobby() {
                  socket.emit("leave-game");
                  if (this.$refs.chat) this.$refs.chat.close();
                  this.view = "lobby";
                  sessionStorage.removeItem("view");
                  if (this.$refs.pizza) this.$refs.pizza.clearTimer();
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
            app.backToLobby();
      }
});

// Audio elements (referenced by game + chat logic)
var messageTone = document.getElementById("messageTone");
var serverMessageTone = document.getElementById("serverMessageTone");
var win = document.getElementById("win");
var lose = document.getElementById("lose");

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
            app.view = ["tictactoe", "pizza"].includes(saved)
                  ? saved
                  : "lobby";
            if (app.$refs.auth) app.$refs.auth.reset();
      });

      socket.on("auth-error", (message) => {
            if (app.$refs.auth) app.$refs.auth.showError(message);
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
            if (app.view === "lobby") {
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

      // -------- Lobby / connection helpers --------
      socket.on("player2", (data) => {
            app.opponent = data.name;
            if (app.$refs.chat) app.$refs.chat.setOpponent(data.name, data.symbol);
            if (app.view === "lobby") {
                  app.view = "tictactoe";
                  sessionStorage.setItem("view", "tictactoe");
            }
      });

      socket.on("p2-join", (message) => {
            serverMessageTone.play();
            showToast(message, "success");
      });

      socket.on("p2-left", (name) => {
            serverMessageTone.play();
            app.opponent = "";
            if (app.$refs.chat) app.$refs.chat.resetOpponent();
            showToast(name + " left", "error");
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
            if (app.$refs.chat)
                  app.$refs.chat.addMessage(
                        message,
                        "rounded-xl bg-transparent text-center text-green-600 text-3xl ",
                        "server",
                  );
      });

      socket.on("you-win", (message) => {
            win.play();
            if (app.$refs.chat) app.$refs.chat.clearHighlights();
            if (app.$refs.chat)
                  app.$refs.chat.addMessage(
                        message,
                        "rounded-xl bg-green-100 text-center text-green-600 text-3xl animate-pulse ",
                        "server",
                  );
      });

      socket.on("draw-game", (message) => {
            serverMessageTone.play();
            if (app.$refs.chat) app.$refs.chat.clearHighlights();
            if (app.$refs.chat)
                  app.$refs.chat.addMessage(
                        message,
                        "rounded-xl bg-blue-100 text-center text-blue-600 text-3xl animate-pulse ",
                        "server",
                  );
      });

      socket.on("set-turn", (message) => {
            serverMessageTone.play();
            if (app.view === "lobby") {
                  app.view = "tictactoe";
                  sessionStorage.setItem("view", "tictactoe");
            }
            if (app.$refs.tt) app.$refs.tt.setTurn(message);
            if (app.$refs.chat) app.$refs.chat.highlightMe();
            if (app.$refs.chat)
                  app.$refs.chat.addMessage(
                        message.text,
                        "rounded-xl bg-orange-600 text-center text-orange-100 ",
                        "server",
                  );
      });

      socket.on("invalid-move", (message) => {
            serverMessageTone.play();
            if (app.$refs.chat)
                  app.$refs.chat.addMessage(
                        message,
                        "rounded-xl bg-yellow-200 text-center text-orange-700 ",
                        "server",
                  );
            if (app.$refs.tt) app.$refs.tt.myTurn = true;
      });

      socket.on("p2-turn", (name) => {
            serverMessageTone.play();
            if (app.$refs.tt) app.$refs.tt.opponentTurn(name);
            if (app.$refs.chat) app.$refs.chat.highlightOpponent();
            if (app.$refs.chat)
                  app.$refs.chat.addMessage(
                        name + "'s turn",
                        "rounded-xl bg-green-600 text-center text-green-100 ",
                        "server",
                  );
      });

      socket.on("set-table", (table) => {
            if (app.$refs.tt) app.$refs.tt.applySetTable(table);
      });

      socket.on("clear-table", () => {
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
