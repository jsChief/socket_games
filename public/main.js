const socketUrls = [
      "https://fond-dory-suitable.ngrok-free.app",
      "http://192.168.0.139:3000",
      "http://localhost:3000",
];
var socket = null;
var currentSocketUrlIndex = 0;

var app = new Vue({
      el: "#app",
      data: {
            view: ["tictactoe", "pizza"].includes(
                  sessionStorage.getItem("view"),
            )
                  ? sessionStorage.getItem("view")
                  : "lobby",
            games: [
                  {
                        id: "tictactoe",
                        icon: "⭕",
                        name: "Tic Tac Toe",
                        desc: "Classic 2-player Xs and Os.",
                        status: "Available",
                        disabled: false,
                  },
                  {
                        id: "pizza",
                        icon: "🍕",
                        name: "Find My Pizza",
                        desc: "Hide 5 slices in your 20 cells, then hunt your opponent's!",
                        status: "Available",
                        disabled: false,
                  },
                  {
                        id: "checkers",
                        icon: "🎯",
                        name: "Checkers",
                        desc: "Coming soon.",
                        status: "Coming soon",
                        disabled: true,
                  },
                  {
                        id: "snake",
                        icon: "🐍",
                        name: "Snake",
                        desc: "Coming soon.",
                        status: "Coming soon",
                        disabled: true,
                  },
                  {
                        id: "memory",
                        icon: "🃏",
                        name: "Memory Match",
                        desc: "Coming soon.",
                        status: "Coming soon",
                        disabled: true,
                  },
                  {
                        id: "connect4",
                        icon: "🔴",
                        name: "Connect 4",
                        desc: "Drop discs and line up 4 in a row.",
                        status: "Coming soon",
                        disabled: true,
                  },
                  {
                        id: "battleship",
                        icon: "🚢",
                        name: "Battleship",
                        desc: "Hide your fleet and sink your opponent's ships.",
                        status: "Coming soon",
                        disabled: true,
                  },
                  {
                        id: "rps",
                        icon: "✊",
                        name: "Rock Paper Scissors",
                        desc: "Best of 3 classic showdown.",
                        status: "Coming soon",
                        disabled: true,
                  },
                  {
                        id: "reversi",
                        icon: "⚫",
                        name: "Reversi",
                        desc: "Flip pieces to claim the most of the board.",
                        status: "Coming soon",
                        disabled: true,
                  },
            ],
            myName: localStorage.getItem("myName") || "",
            opponent: "",
            chatOpen: false,
            hasNewMessage: false,
            onlinePlayers: [],
            socketId: "",
            connectionStatus: "connecting", // connecting | connected | disconnected
            pizza: {
                  phase: "idle", // idle | placement | battle | over
                  slices: 5,
                  timer: 30,
                  submitted: false,
                  myBoard: Array(20).fill(false),
                  myAttacked: Array(20).fill(false),
                  oppGuesses: Array(20).fill(null),
                  myTurn: false,
                  opponentName: "",
                  result: null,
                  status: "",
                  rematchRequested: false,
            },
            pizzaTimer: null,
      },
      computed: {
            connectionStatusText() {
                  if (this.connectionStatus === "connected") return "Connected";
                  if (this.connectionStatus === "disconnected")
                        return "Disconnected";
                  return "Connecting...";
            },
            connectionBadgeClass() {
                  if (this.connectionStatus === "connected")
                        return "bg-green-600/80 text-white";
                  if (this.connectionStatus === "disconnected")
                        return "bg-red-600/80 text-white";
                  return "bg-yellow-500/80 text-white";
            },
            connectionDotClass() {
                  if (this.connectionStatus === "connected")
                        return "bg-green-300";
                  if (this.connectionStatus === "disconnected")
                        return "bg-red-300";
                  return "bg-yellow-200 animate-pulse";
            },
            mySlices() {
                  return this.pizza.myBoard.filter(Boolean).length;
            },
            pizzaStatus() {
                  const p = this.pizza;
                  if (p.phase === "idle") return "awaiting player 2";
                  if (p.phase === "placement") {
                        if (p.submitted)
                              return "Placement locked! Waiting for opponent...";
                        return (
                              "Place " +
                              this.mySlices +
                              "/" +
                              p.slices +
                              " slices on your board"
                        );
                  }
                  if (p.phase === "battle") {
                        return p.myTurn
                              ? "Your turn — tap a cell on the opponent's board!"
                              : "Waiting for " +
                                      (p.opponentName || "opponent") +
                                      "...";
                  }
                  if (p.phase === "over") {
                        return p.result === "won"
                              ? "You found all the slices! You win! 🎉"
                              : (p.opponentName || "Opponent") +
                                      " found all your slices. You lose.";
                  }
                  return p.status;
            },
      },
      methods: {
            selectGame(g) {
                  if (g.disabled) return;
                  this.chatOpen = false;
                  this.view = g.id;
                  sessionStorage.setItem("view", g.id);
                  socket.emit("select-game", { game: g.id });
            },
            openChat() {
                  this.chatOpen = true;
                  this.hasNewMessage = false;
                  syncChatViewport();
                  this.$nextTick(() => {
                        const d = document.getElementById("display");
                        if (d) d.scrollTop = d.scrollHeight;
                  });
            },
            closeChat() {
                  this.chatOpen = false;
            },
            backToLobby() {
                  socket.emit("leave-game");
                  this.chatOpen = false;
                  this.view = "lobby";
                  sessionStorage.removeItem("view");
                  clearInterval(this.pizzaTimer);
                  this.pizzaTimer = null;
            },
            placeCell(i) {
                  const p = this.pizza;
                  if (p.phase !== "placement" || p.submitted) return;
                  if (p.myBoard[i]) {
                        this.$set(p.myBoard, i, false);
                        return;
                  }
                  if (this.mySlices >= p.slices) {
                        p.status = "You can only place " + p.slices + " slices.";
                        return;
                  }
                  this.$set(p.myBoard, i, true);
            },
            lockPlacement() {
                  const p = this.pizza;
                  if (this.mySlices !== p.slices) {
                        p.status =
                              "Place all " + p.slices + " slices first.";
                        return;
                  }
                  socket.emit("pizza-submit", {
                        board: p.myBoard.slice(),
                  });
            },
            attackCell(i) {
                  const p = this.pizza;
                  if (p.phase !== "battle" || !p.myTurn) return;
                  if (p.oppGuesses[i] !== null) return;
                  socket.emit("pizza-attack", { cell: i });
            },
            myCellIcon(i) {
                  const p = this.pizza;
                  if (p.phase === "placement") {
                        return p.myBoard[i] ? "🍕" : "";
                  }
                  if (p.myBoard[i]) return "🍕";
                  if (p.myAttacked[i]) return "❌";
                  return "";
            },
            myCellClass(i) {
                  const p = this.pizza;
                  if (p.phase === "placement") {
                        return p.myBoard[i]
                              ? "bg-orange-500 text-white cursor-pointer"
                              : "bg-white/60 cursor-pointer hover:bg-orange-200";
                  }
                  if (p.myAttacked[i]) {
                        return p.myBoard[i]
                              ? "bg-slate-500 text-white"
                              : "bg-slate-300 text-slate-600";
                  }
                  if (p.myBoard[i]) return "bg-orange-500 text-white";
                  return "bg-white/60";
            },
            oppCellIcon(i) {
                  const g = this.pizza.oppGuesses[i];
                  if (g === true) return "🍕";
                  if (g === false) return "❌";
                  return "";
            },
            oppCellClass(i) {
                  const p = this.pizza;
                  const g = p.oppGuesses[i];
                  const clickable =
                        p.phase === "battle" && p.myTurn && g === null;
                  let cls = "bg-white/60";
                  if (g === true) cls = "bg-green-500 text-white";
                  else if (g === false) cls = "bg-red-200";
                  if (clickable) cls += " cursor-pointer hover:bg-yellow-200";
                  return cls;
            },
            requestRematch() {
                  if (this.pizza.phase !== "over" || this.pizza.rematchRequested)
                        return;
                  this.pizza.rematchRequested = true;
                  this.pizza.status = "Waiting for opponent to rematch...";
                  socket.emit("pizza-rematch");
            },
      },
      watch: {
            view(newVal, oldVal) {
                  if (newVal !== "lobby" && oldVal === "lobby") {
                        history.pushState({ nav: true }, "");
                  }
            },
            chatOpen(newVal, oldVal) {
                  if (newVal && !oldVal) {
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
      if (app.chatOpen) {
            app.closeChat();
      } else if (app.view !== "lobby") {
            app.backToLobby();
      }
});

var display = document.getElementById("display");
var input = document.getElementById("in");
var typingIndicator = document.getElementById("typingIndicator");
// Get the audio element
var messageTone = document.getElementById("messageTone");
var serverMessageTone = document.getElementById("serverMessageTone");
var win = document.getElementById("win");
var lose = document.getElementById("lose");

// Keep the chat overlay inside the visible viewport so the on-screen
// keyboard does not cover the text input.
function syncChatViewport() {
      var overlay = document.getElementById("chatOverlay");
      if (!overlay) return;
      if (window.visualViewport) {
            var vv = window.visualViewport;
            overlay.style.top = vv.offsetTop + "px";
            overlay.style.height = vv.height + "px";
            overlay.style.bottom = "auto";
      } else {
            overlay.style.top = "0px";
            overlay.style.height = window.innerHeight + "px";
            overlay.style.bottom = "auto";
      }
}
if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", syncChatViewport);
      window.visualViewport.addEventListener("scroll", syncChatViewport);
}
window.addEventListener("resize", syncChatViewport);

// Flag to track if the user has interacted with the page
var hasInteracted = false;

// Add event listener for any click on the page
document.body.addEventListener(
      "click",
      () => {
            hasInteracted = true;
      },
      { once: true },
); // { once: true } ensures this listener runs only once

var table = ["", "", "", "", "", "", "", "", ""];
var turn = false;
var symbol;
var myName = localStorage.getItem("myName"),
      player2;
var persistentUserId = localStorage.getItem("persistentUserId");
var recentOtherMessages = [];
var replyTarget = null;
var messageIdCounter = 0;
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
            socket.emit("player-initial-connect", {
                  persistentUserId: persistentUserId,
                  name: myName,
            });
      });

      socket.on("online-players", (list) => {
            app.onlinePlayers = Array.isArray(list) ? list : [];
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

      socket.on("disconnect", (message) => {
            app.connectionStatus = "disconnected";
            showToast("Disconnected from server", "error");
      });
}

connectSocket();

socket.on("server-info", (message) => {
      serverMessageTone.play();
      showMessage(message, "rounded-xl bg-blue-100 text-center text-blue-500 ", "server");
});

socket.on("server-warn", (message) => {
      serverMessageTone.play();
      showMessage(
            message,
            "rounded-xl bg-yellow-100 text-center text-yellow-600 ",
            "server",
      );
});

var typingTimeout = null;
var lastTypingName = "";

input.addEventListener("input", () => {
      socket.emit("user-typing", { isTyping: true });
      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
            socket.emit("user-typing", { isTyping: false });
      }, 2000);
});

socket.on("opponent-typing", (data) => {
      if (data.isTyping) {
            lastTypingName = data.name;
            typingIndicator.textContent = data.name + " is typing...";
            typingIndicator.classList.remove("hidden");
      } else {
            lastTypingName = "";
            typingIndicator.classList.add("hidden");
            typingIndicator.textContent = "";
      }
});

function stopTyping() {
      clearTimeout(typingTimeout);
      socket.emit("user-typing", { isTyping: false });
}

// -------- Pizza game socket handlers --------
function startPizzaTimer() {
      clearInterval(app.pizzaTimer);
      app.pizzaTimer = setInterval(() => {
            if (app.pizza.timer > 0) {
                  app.pizza.timer -= 1;
            } else {
                  clearInterval(app.pizzaTimer);
                  app.pizzaTimer = null;
                  app.pizza.status =
                        "Time's up! Slices are being placed automatically...";
            }
      }, 1000);
}

function resetPizzaLocal() {
      clearInterval(app.pizzaTimer);
      app.pizzaTimer = null;
      app.pizza.phase = "idle";
      app.pizza.submitted = false;
      app.pizza.timer = 30;
      app.pizza.myBoard = Array(20).fill(false);
      app.pizza.myAttacked = Array(20).fill(false);
      app.pizza.oppGuesses = Array(20).fill(null);
      app.pizza.myTurn = false;
      app.pizza.result = null;
      app.pizza.status = "";
      app.pizza.rematchRequested = false;
}

socket.on("pizza-start", (data) => {
      if (app.view === "lobby") {
            app.view = "pizza";
            sessionStorage.setItem("view", "pizza");
      }
      resetPizzaLocal();
      app.pizza.phase = "placement";
      app.pizza.opponentName = data.opponentName;
      app.pizza.timer = data.timeLimit;
      app.pizza.status =
            "Place your " + data.slices + " slices on your board!";
      startPizzaTimer();
});

socket.on("pizza-sync", (data) => {
      clearInterval(app.pizzaTimer);
      app.pizzaTimer = null;
      app.pizza.phase = data.phase;
      app.pizza.submitted = data.submitted;
      app.pizza.myBoard = data.myBoard;
      app.pizza.myAttacked = data.myAttacked;
      app.pizza.oppGuesses = data.oppGuesses;
      app.pizza.myTurn = data.myTurn;
      app.pizza.opponentName = data.opponentName;
      app.pizza.result = data.result;
      if (data.phase === "placement") {
            app.pizza.timer =
                  typeof data.timeLeft === "number" ? data.timeLeft : 30;
            if (!data.submitted) startPizzaTimer();
            else app.pizza.status = "Placement locked! Waiting for opponent...";
      }
});

socket.on("pizza-opponent-locked", () => {
      app.pizza.status = "Opponent locked in their placement";
});

socket.on("pizza-battle-start", (data) => {
      clearInterval(app.pizzaTimer);
      app.pizzaTimer = null;
      app.pizza.phase = "battle";
      app.pizza.myTurn = data.yourTurn;
      app.pizza.opponentName = data.opponentName;
      app.pizza.status = "";
      if (data.yourTurn) serverMessageTone.play();
});

socket.on("pizza-attack-result", (data) => {
      if (data.youAttacked) {
            app.$set(app.pizza.oppGuesses, data.cell, data.hit);
            app.pizza.status = data.hit
                  ? "Hit! You found a slice! 🍕"
                  : "Miss...";
      } else {
            app.$set(app.pizza.myAttacked, data.cell, true);
            app.pizza.status = data.hit
                  ? "Opponent found one of your slices! 🍕"
                  : "Opponent missed.";
      }
      app.pizza.myTurn = data.yourTurn;
      if (data.yourTurn) serverMessageTone.play();
});

socket.on("pizza-game-over", (data) => {
      clearInterval(app.pizzaTimer);
      app.pizzaTimer = null;
      app.pizza.phase = "over";
      app.pizza.result = data.won ? "won" : "lost";
      app.pizza.status = "";
      if (data.won) {
            win.play();
      } else {
            lose.play();
      }
});

socket.on("pizza-rematch-request", () => {
      if (app.pizza.phase === "over") {
            app.pizza.status = "Opponent wants a rematch! Click Play again.";
      }
});

socket.on("pizza-info", (msg) => {
      app.pizza.status = msg;
});

socket.on("pizza-waiting", (data) => {
      app.pizza.status = data.opponentDone
            ? "Opponent is ready — waiting for you to lock in!"
            : "Waiting for opponent to place...";
});

socket.on("user-message", (message) => {
      const messageData = addRecentOtherMessage(message);
      showMessage(message, "rounded-r-xl rounded-bl-xl bg-gray-200 ", "other", messageData);
      if (!app.chatOpen) app.hasNewMessage = true;
      // Play the tone only if the user has interacted and the audio element exists
      messageTone.play();
      // if (hasInteracted && messageTone) {
      //       messageTone
      //             .play()
      //             .catch((e) => console.error("Error playing sound:", e));
      // }
});


socket.on("player2", (data) => {
      sel("p2").textContent = data.name + " [" + data.symbol + "]";
      player2 = data.name;
      sel("p2").className =
            "px-2 py-0.5 text-sm rounded-xl bg-green-600 text-white";
});

socket.on("p2-join", (message) => {
      serverMessageTone.play();
      showToast(message, "success");
});

socket.on("p2-left", (name) => {
      serverMessageTone.play();
      sel("p2").textContent = "player 2";
      player2 = "";
      sel("p2").className = "bg-transparent text-black";
      app.opponent = "";
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

socket.on("click-btn", (x) => {
      sel("btn" + x.index).textContent = x.symbol;
      table[x.index] = x.symbol;
      //showMessage((x*100)+100, "bg-emerald-"+((x*100)+100)+" ", "sender");
});

// Function to clear turn highlights from both players
function clearTurnHighlight() {
      sel("p1").classList.remove("bg-yellow-300", "text-black", "font-bold");
      sel("p2").classList.remove("bg-yellow-300", "text-black", "font-bold");
      // Re-apply default classes if needed, or handle in specific events
      if (sel("p1").textContent.includes("me")) {
            sel("p1").className =
                  "px-2 py-0.5 text-sm rounded-xl bg-green-600 text-white";
      }
      if (sel("p2").textContent.includes(" [")) {
            sel("p2").className =
                  "px-2 py-0.5 text-sm rounded-xl bg-green-600 text-white";
      }
}

socket.on("name-set", (data) => {
      serverMessageTone.play();
      sel("p1").textContent = "[" + data.symbol + "] me";
      sel("p1").className =
            "px-2 py-0.5 text-sm rounded-xl bg-green-600 text-white"; // Default class for p1
      showMessage(
            "Your name has been set to " + data.name,
            "rounded-xl bg-yellow-100 text-center text-yellow-600 ",
            "server",
      );
      myName = data.name;
      localStorage.setItem("myName", myName);
      app.myName = data.name;
});

socket.on("player2", (data) => {
      sel("p2").textContent = data.name + " [" + data.symbol + "]";
      player2 = data.name;
      sel("p2").className =
            "px-2 py-0.5 text-sm rounded-xl bg-green-600 text-white"; // Default class for p2
      app.opponent = data.name;
      if (app.view === "lobby") {
            app.view = "tictactoe";
            sessionStorage.setItem("view", "tictactoe");
      }
});

socket.on("p2-win", (message) => {
      lose.play();
      clearTurnHighlight(); // Clear highlight on game end
      showMessage(
            message,
            "rounded-xl bg-transparent text-center text-green-600 text-3xl ",
            "server",
      );
});

socket.on("you-win", (message) => {
      win.play();
      clearTurnHighlight(); // Clear highlight on game end
      showMessage(
            message,
            "rounded-xl bg-green-100 text-center text-green-600 text-3xl animate-pulse ",
            "server",
      );
});

socket.on("draw-game", (message) => {
      serverMessageTone.play();
      clearTurnHighlight(); // Clear highlight on game end
      showMessage(
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
      symbol = message.symbol;
      turn = true;
      clearTurnHighlight(); // Clear previous highlights
      sel("p1").classList.add("bg-yellow-300", "text-black", "font-bold"); // Highlight current player (p1)
      showMessage(
            message.text,
            "rounded-xl bg-orange-600 text-center text-orange-100 ",
            "server",
      );
});

socket.on("invalid-move", (message) => {
      serverMessageTone.play();
      showMessage(
            message,
            "rounded-xl bg-yellow-200 text-center text-orange-700 ",
            "server",
      );
      turn = true;
});

socket.on("p2-turn", (name) => {
      serverMessageTone.play();
      clearTurnHighlight(); // Clear previous highlights
      sel("p2").classList.add("bg-yellow-300", "text-black", "font-bold"); // Highlight opponent (p2)
      showMessage(
            name + "'s turn",
            "rounded-xl bg-green-600 text-center text-green-100 ",
            "server",
      );
});

socket.on("set-table", (table) => {
      for (let i = 0; i < table.length; i++) {
            sel("btn" + i).textContent = table[i];
      }
});

socket.on("clear-table", (t) => {
      for (let i = 0; i < table.length; i++) {
            sel("btn" + i).textContent = "";
            table[i] = "";
      }
});

socket.on("btn-val", (data) => {
      showMessage(data, "bg-orange-400 ");
});

function sel(id) {
      return document.getElementById(id);
}

function addRecentOtherMessage(message) {
      const text = typeof message === "object" && message !== null ? normalizeText(message.text) : message;
      const replyTo = typeof message === "object" && message !== null ? normalizeText(message.replyTo) : null;
      const messageData = {
            id: ++messageIdCounter,
            text,
            replyTo,
            raw: message,
      };
      recentOtherMessages.push(messageData);
      if (recentOtherMessages.length > 10) {
            recentOtherMessages.shift();
      }
      return messageData;
}

function setReplyTarget(messageData) {
      replyTarget = messageData;
      renderReplyPreview();
}

function clearReplyTarget() {
      replyTarget = null;
      renderReplyPreview();
}

function renderReplyPreview() {
      const preview = sel("replyPreview");
      if (!preview) return;
      if (!replyTarget) {
            preview.classList.add("hidden");
            preview.innerHTML = "";
            return;
      }
      preview.classList.remove("hidden");
      preview.innerHTML = `<div class=\"flex w-full\"><div class=\"font-semibold text-sm pr-2 text-slate-500\">Replying:</div><div class=\"truncate text-sm text-slate-900\">${escapeHtml(replyTarget.text)}</div></div><button id=\"cancelReply\" class=\"mt-1 text-xs  bg-red-600 text-white p-1 rounded-xl\"><span class=\"fas fa-x\"></span> Cancel</button>`;
      sel("cancelReply").addEventListener("click", () => {
            clearReplyTarget();
      });
}

function escapeHtml(text) {
      return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\"/g, "&quot;")
            .replace(/'/g, "&#039;");
}

function normalizeText(value) {
      if (typeof value === "string") return value;
      if (typeof value === "object" && value !== null) {
            if (typeof value.text === "string") return value.text;
            return JSON.stringify(value);
      }
      return "";
}

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

function showMessage(text, custom, source, messageData) {
      var date = new Date();
      let pos =
            source == "server" ? "center" : source == "me" ? "end" : "start";
      let c = document.createElement("div");
      c.className = "w-full px-2 mt-[6px] flex place-content-" + pos;
      let w = document.createElement("div");
      w.className = "min-w-20 flex flex-col items-" + pos;
      let k = document.createElement("div");
      k.className = custom + "w-fit shadow px-2 py-1 max-w-[60vw]";

      const messageText = typeof text === "object" && text !== null ? normalizeText(text.text) : text;
      const replyText = typeof text === "object" && text !== null ? normalizeText(text.replyTo) : null;
      if (replyText) {
            const replyBlock = document.createElement("div");
            replyBlock.className = "rounded-lg bg-white/50 px-2 py-1 text-xs text-slate-600 border border-slate-200";
            replyBlock.textContent = replyText;
            w.appendChild(replyBlock);
      }

      const mainText = document.createElement("div");
      mainText.textContent = messageText;
      k.appendChild(mainText);

      if (source === "other" && messageData) {
            w.dataset.messageId = messageData.id;
            w.style.cursor = "pointer";
            w.title = "Click to reply to this message";
            w.addEventListener("click", () => {
                  setReplyTarget(messageData);
            });
      }

      let t = document.createElement("p");
      t.className = "w-fit text-xs";
      t.textContent = date.toLocaleTimeString();
      w.appendChild(k);
      w.appendChild(t);
      c.appendChild(w);
      display.appendChild(c);
      display.scrollTop = display.scrollHeight;
}

function btn(index) {
      if (turn) {
            if (table[index] == "") {
                  sel("btn" + index).textContent = symbol;
            }
            socket.emit("btn-pos", { index, symbol });
            turn = false;
      }
}

function echo() {
      if (input.value != "") {
            socket.emit("echo-message", input.value);
            showMessage(input.value, "text-right bg-blue-400 ", "me");
            input.value = "";
      }
}

function sendEmoji(emoji) {
      const payload = {
            text: emoji,
            replyTo: replyTarget ? replyTarget.text : null,
            replyToId: replyTarget ? replyTarget.id : null,
      };
      socket.emit("user-message", payload);
      showMessage(payload, "rounded-l-xl rounded-br-xl text-right bg-orange-100 ", "me");
      clearReplyTarget();
      stopTyping();
}

function message() {
      if (input.value != "") {
            let splitMsg = input.value.split(" ");
            if (splitMsg[0] == "/name") {
                  socket.emit("set-name", {
                        name: splitMsg[1],
                        persistentUserId: persistentUserId,
                  });
            } else if (splitMsg[0] == "/reset") {
                  if (player2 == "") {
                        socket.emit("reset-game", myName);
                  } else {
                        socket.emit("request-game-reset", myName);
                        showMessage(
                              "Game reset request has been sent to " + player2,
                              "text-center bg-blue-200 text-blue-700 ",
                              "server",
                        );
                  }
            } else if (splitMsg[0] == "/accept") {
                  socket.emit("accept-game-reset", myName);
            } else {
                  const messageText = input.value;
                  const payload = {
                        text: messageText,
                        replyTo: replyTarget ? replyTarget.text : null,
                        replyToId: replyTarget ? replyTarget.id : null,
                  };
                  socket.emit("user-message", payload);
                  showMessage(payload, "rounded-l-xl rounded-br-xl bg-orange-100 ", "me");
                  clearReplyTarget();
                  stopTyping();
            }
            input.value = "";
      }
}
