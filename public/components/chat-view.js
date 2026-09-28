Vue.component("chat-view", {
      data() {
            return {
                  chatOpen: false,
                  view: "list", // list | general | dm
                  activeKey: "general",
                  onlinePlayers: [],
                  selfSocketId: "",
                  myUid: "",
                  dmChats: {}, // name-keyed -> { key, player, messages[], typingName, input }
                  dmUnread: {}, // name-keyed -> count
                  generalUnread: 0,
                  messages: [],
                  typingName: "",
                  replyTarget: null,
                  messageIdCounter: 0,
                  inputValue: "",
                  meSymbol: "",
                  meHighlighted: false,
                  opponentLabel: "",
                  opponentHighlighted: false,
                  typingTimeout: null,
                  chatListRetry: null,
                  chatListReceived: false,
                  quickChatOpen: false,
                  quickMessages: [
                        "Your turn!",
                        "Nice move! 👍",
                        "Good game!",
                        "GG 🤝",
                        "Rematch?",
                        "Hello! 👋",
                        "Good luck!",
                        "Ouch 😅",
                        "lol",
                        "Bye! 👋",
                  ],
            };
      },
      computed: {
            chatInput: {
                  get() {
                        if (this.view === "dm" && this.activeDm)
                              return this.activeDm.input || "";
                        return this.inputValue;
                  },
                  set(val) {
                        if (this.view === "dm" && this.activeDm)
                              this.activeDm.input = val;
                        else this.inputValue = val;
                  },
            },
            activeTitle() {
                  if (this.view === "list") return "Chat";
                  if (this.view === "general") return "General chat";
                  if (this.activeDm) return this.activeDm.player.name || "Private chat";
                  return "Private chat";
            },
            activeMessages() {
                  if (this.view === "general") return this.messages;
                  if (this.view === "dm" && this.activeDm)
                        return this.activeDm.messages;
                  return [];
            },
            activeDm() {
                  if (this.view !== "dm") return null;
                  return this.dmChats[this.activeKey] || null;
            },
            dmOffline() {
                  return (
                        this.view === "dm" &&
                        this.activeDm &&
                        !this.activeDm.player.online
                  );
            },
            activeTypingName() {
                  if (this.view === "dm" && this.activeDm)
                        return this.activeDm.typingName;
                  return this.typingName;
            },
            generalEntry() {
                  return {
                        key: "general",
                        type: "general",
                        label: "General chat",
                        subtitle: "Everyone on the server",
                        icon: "💬",
                        unread: this.generalUnread,
                  };
            },
            onlineConvos() {
                  return this.onlinePlayers.map((p) => {
                        const conv = this.dmChats[p.name];
                        return {
                              key: p.name,
                              type: "dm",
                              player: this.makePlayer(p),
                              online: true,
                              unread: this.dmUnread[p.name] || 0,
                              lastText: conv ? conv.lastText : "",
                              lastFromUid: conv ? conv.lastFromUid : "",
                              lastAt: conv ? conv.lastAt : 0,
                        };
                  });
            },
            // Chats that exist on the server but whose partner is not connected
            // right now. Seeded from `private-chats` on load, so this list
            // survives a page refresh and includes people who are offline.
            offlineConvos() {
                  const seen = {};
                  for (const p of this.onlinePlayers) seen[p.name] = true;
                  const convos = [];
                  for (const key in this.dmChats) {
                        if (seen[key]) continue;
                        const conv = this.dmChats[key];
                        // A conversation only counts once it actually has
                        // history behind it.
                        if (!conv.messages.length && !conv.lastAt) continue;
                        convos.push({
                              key,
                              type: "dm",
                              player: conv.player,
                              online: false,
                              unread: this.dmUnread[key] || 0,
                              lastText: conv.lastText,
                              lastFromUid: conv.lastFromUid,
                              lastAt: conv.lastAt,
                        });
                  }
                  return convos.sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
            },
      },
      watch: {
            chatOpen(newVal) {
                  if (newVal) {
                        history.pushState({ nav: true }, "");
                        this.$nextTick(() => {
                              this.syncViewport();
                              this.scrollToBottom();
                        });
                  }
            },
      },
      methods: {
            pos(source) {
                  if (source === "server") return "center";
                  if (source === "me") return "end";
                  return "start";
            },
            scrollToBottom() {
                  this.$nextTick(() => {
                        const d = this.$refs.display;
                        if (d) d.scrollTop = d.scrollHeight;
                  });
            },
            syncViewport() {
                  const overlay = this.$refs.overlay;
                  if (!overlay) return;
                  if (window.visualViewport) {
                        const vv = window.visualViewport;
                        overlay.style.top = vv.offsetTop + "px";
                        overlay.style.height = vv.height + "px";
                        overlay.style.bottom = "auto";
                  } else {
                        overlay.style.top = "0px";
                        overlay.style.height = window.innerHeight + "px";
                        overlay.style.bottom = "auto";
                  }
            },
            open() {
                  this.view = "list";
                  this.activeKey = "general";
                  this.replyTarget = null;
                  this.chatOpen = true;
                  this.requestConversationList();
            },
            close() {
                  this.chatOpen = false;
            },
            normalizeText(value) {
                  if (typeof value === "string") return value;
                  if (typeof value === "object" && value !== null) {
                        if (typeof value.text === "string") return value.text;
                        return JSON.stringify(value);
                  }
                  return "";
            },
            makeMessageObj(text, custom, source, replyTo) {
                  const isObj = typeof text === "object" && text !== null;
                  return {
                        id: ++this.messageIdCounter,
                        text: isObj
                              ? this.normalizeText(text.text)
                              : String(text == null ? "" : text),
                        replyTo: isObj && text.replyTo
                              ? this.normalizeText(text.replyTo)
                              : replyTo
                                    ? this.normalizeText(replyTo)
                                    : null,
                        class: custom,
                        source,
                        time: new Date().toLocaleTimeString(),
                  };
            },
            addMessage(text, custom, source) {
                  this.messages.push(
                        this.makeMessageObj(text, custom, source),
                  );
                  this.scrollToBottom();
            },
            receiveUserMessage(message) {
                  this.messages.push(
                        this.makeMessageObj(
                              message,
                              "rounded-r-xl rounded-bl-xl bg-gray-200 text-slate-700 ",
                              "other",
                        ),
                  );
                  const isActive =
                        this.chatOpen && this.view === "general";
                  if (!isActive) {
                        this.generalUnread += 1;
                        if (!this.chatOpen) this.$emit("new-message");
                  }
                  messageTone.play();
                  this.scrollToBottom();
            },
            makePlayer(p) {
                  return {
                        id: p && p.id,
                        uid: p && (p.uid || p.persistentUserId || ""),
                        name: p && p.name,
                        avatarUrl: p && p.avatarUrl,
                        roomCode: p && p.roomCode,
                        game: p && p.game,
                        online: true,
                  };
            },
            // One-line preview of the most recent message, shown under the
            // player's name in the conversation list. Messages you sent are
            // prefixed so the direction is obvious, and newlines are collapsed
            // so the row stays one line high.
            dmPreview(item, fallback) {
                  const text = item && item.lastText ? String(item.lastText) : "";
                  if (!text) return fallback || "";
                  const flat = text.replace(/\s+/g, " ").trim();
                  if (!flat) return fallback || "";
                  const mine = item.lastFromUid && item.lastFromUid === this.myUid;
                  return (mine ? "You: " : "") + flat;
            },
            onlineStatus(p) {
                  if (p.roomCode) return "In room " + p.roomCode;
                  if (p.game) return "Playing " + p.game;
                  return "In the lobby";
            },
            ensureDmChat(id, name, player) {
                  const key = String(name || "Unknown");
                  const stored = this.dmChats[key];
                  if (stored) {
                        if (player) stored.player = player;
                        return stored;
                  }
                  const conv = {
                        key,
                        player:
                              player ||
                              this.makePlayer({
                                    id: id || "",
                                    name,
                                    avatarUrl: null,
                              }),
                        messages: [],
                        typingName: "",
                        input: "",
                        historyLoaded: false,
                        lastAt: 0,
                        lastText: "",
                        lastFromUid: "",
                  };
                  this.$set(this.dmChats, key, conv);
                  return conv;
            },
            setSelfSocket(id, uid) {
                  this.selfSocketId = id || "";
                  this.myUid = uid || "";
            },
            setOnlinePlayers(list) {
                  const all = Array.isArray(list) ? list : [];
                  this.onlinePlayers = all.filter(
                        (p) => p.id !== this.selfSocketId,
                  );
                  const byName = {};
                  for (const p of this.onlinePlayers)
                        byName[p.name] = p;
                  for (const key in this.dmChats) {
                        if (byName[key]) {
                              this.dmChats[key].player = this.makePlayer(
                                    byName[key],
                              );
                              // They are back, so their history is worth
                              // re-reading in case messages were missed.
                              this.dmChats[key].historyLoaded = false;
                        } else this.dmChats[key].player.online = false;
                  }
            },
            // Ask the server which private chats exist for this account, so the
            // list is available after a reload and for offline partners. The
            // server also pushes this unprompted when it registers us; if that
            // push does not arrive (a request that raced registration, a
            // dropped packet) ask once more so the list is never stuck empty.
            requestConversationList() {
                  socket.emit("list-private-chats");
                  clearTimeout(this.chatListRetry);
                  this.chatListReceived = false;
                  this.chatListRetry = setTimeout(() => {
                        if (!this.chatListReceived)
                              socket.emit("list-private-chats");
                  }, 1200);
            },
            receivePrivateChats(data) {
                  const list =
                        data && Array.isArray(data.conversations)
                              ? data.conversations
                              : [];
                  this.chatListReceived = true;
                  clearTimeout(this.chatListRetry);
                  // This can arrive after `online-players`, so never mark a
                  // partner offline if presence already says they are here.
                  const onlineNames = {};
                  const onlineUids = {};
                  for (const p of this.onlinePlayers) {
                        onlineNames[p.name] = true;
                        if (p.uid) onlineUids[p.uid] = true;
                  }
                  for (const c of list) {
                        if (!c || !c.partnerUid) continue;
                        const name = c.partnerName || "Unknown player";
                        // Conversations are keyed by name, so a rename leaves
                        // the old key behind - find the partner by uid instead.
                        let oldKey = "";
                        for (const key in this.dmChats) {
                              if (
                                    this.dmChats[key].player.uid === c.partnerUid
                              ) {
                                    oldKey = key;
                                    break;
                              }
                        }
                        let conv;
                        if (oldKey && oldKey !== name) {
                              this.rekeyDmChat(oldKey, name);
                              conv = this.dmChats[name];
                        } else {
                              conv = this.ensureDmChat("", name);
                        }
                        if (!conv) continue;
                        conv.player.uid = c.partnerUid;
                        if (c.avatarUrl) conv.player.avatarUrl = c.avatarUrl;
                        conv.player.online = !!(
                              onlineNames[conv.player.name] ||
                              onlineUids[c.partnerUid]
                        );
                        conv.lastAt = Number(c.lastAt) || 0;
                        conv.lastText = c.lastText || "";
                        conv.lastFromUid = c.lastFromUid || "";
                  }
            },
            // Move a conversation to a new key when its partner's name changes,
            // carrying messages, unread count and draft across.
            rekeyDmChat(oldKey, name) {
                  const conv = this.dmChats[oldKey];
                  if (!conv || oldKey === name) return;
                  this.$delete(this.dmChats, oldKey);
                  // If something is already filed under the new name, keep that
                  // one rather than clobbering it.
                  if (this.dmChats[name]) return;
                  conv.key = name;
                  conv.player.name = name;
                  this.$set(this.dmChats, name, conv);
                  if (this.dmUnread[oldKey] !== undefined)
                        this.$set(this.dmUnread, name, this.dmUnread[oldKey]);
                  if (this.activeKey === oldKey) this.activeKey = name;
            },
            setPrivateTyping(data) {
                  let conv = data && data.fromName
                        ? this.dmChats[data.fromName] || null
                        : null;
                  if (!conv && data && data.fromUid) {
                        for (const key in this.dmChats) {
                              if (this.dmChats[key].player.uid === data.fromUid) {
                                    conv = this.dmChats[key];
                                    break;
                              }
                        }
                  }
                  if (!conv) return;
                  conv.typingName =
                        data && data.isTyping
                              ? conv.player.name || data.fromName
                              : "";
            },
            receivePrivateMessage(data) {
                  const fromName = (data && data.fromName) || "Player";
                  const conv = this.ensureDmChat(
                        data && data.fromId,
                        fromName,
                  );
                  if (data && data.fromUid) conv.player.uid = data.fromUid;
                  conv.lastAt = Date.now();
                  conv.lastText = (data && data.text) || "";
                  conv.lastFromUid = (data && data.fromUid) || "";
                  conv.messages.push(
                        this.makeMessageObj(
                              (data && data.text) || "",
                              "rounded-r-xl rounded-bl-xl bg-gray-200 text-slate-700 ",
                              "other",
                              (data && data.replyTo) || null,
                        ),
                  );
                  const isActive =
                        this.chatOpen &&
                        this.view === "dm" &&
                        this.activeKey === conv.key;
                  if (!isActive) {
                        this.$set(
                              this.dmUnread,
                              conv.key,
                              (this.dmUnread[conv.key] || 0) + 1,
                        );
                        if (!this.chatOpen) this.$emit("new-message");
                  }
                  messageTone.play();
                  this.scrollToBottom();
            },
            clearDmUnread(key) {
                  this.$set(this.dmUnread, key, 0);
            },
            openGeneral() {
                  this.view = "general";
                  this.activeKey = "general";
                  this.generalUnread = 0;
                  this.replyTarget = null;
                  this.$nextTick(() => this.scrollToBottom());
            },
            openDm(p) {
                  if (!p) return;
                  const conv = this.ensureDmChat(
                        p.id,
                        p.name,
                        this.makePlayer(p),
                  );
                  this.view = "dm";
                  this.activeKey = conv.key;
                  this.clearDmUnread(conv.key);
                  this.replyTarget = null;
                  this.requestHistory(conv);
                  this.$nextTick(() => this.scrollToBottom());
            },
            openOfflineDm(key) {
                  if (!this.dmChats[key]) return;
                  const conv = this.dmChats[key];
                  this.view = "dm";
                  this.activeKey = key;
                  this.clearDmUnread(key);
                  this.replyTarget = null;
                  this.requestHistory(conv);
                  this.$nextTick(() => this.scrollToBottom());
            },
            requestHistory(conv) {
                  if (!conv.player.uid || conv.historyLoaded) return;
                  conv.historyLoaded = true;
                  socket.emit("join-private-chat", {
                        partnerUid: conv.player.uid,
                  });
            },
            receivePrivateHistory(data) {
                  let conv = data && data.partnerName
                        ? this.dmChats[data.partnerName] || null
                        : null;
                  if (!conv && data && data.partnerUid) {
                        for (const key in this.dmChats) {
                              if (this.dmChats[key].player.uid === data.partnerUid) {
                                    conv = this.dmChats[key];
                                    break;
                              }
                        }
                  }
                  if (!conv) return;
                  if (data && data.partnerUid) conv.player.uid = data.partnerUid;
                  if (data && data.partnerName) conv.player.name = data.partnerName;
                  const msgs = (data && data.messages) || [];
                  if (!Array.isArray(msgs) || msgs.length === 0) return;
                  conv.messages = msgs.map((m) => {                        const mine = conv.player.uid
                              ? m.fromUid !== conv.player.uid
                              : m.fromUid === this.myUid;
                        return {
                              id: ++this.messageIdCounter,
                              text: m.text || "",
                              replyTo: m.replyTo || null,
                              class: mine
                                    ? "rounded-l-xl rounded-br-xl bg-orange-100 "
                                    : "rounded-r-xl rounded-bl-xl bg-gray-200 text-slate-700 ",
                              source: mine ? "me" : "other",
                              time: m.at
                                    ? new Date(m.at).toLocaleTimeString()
                                    : "",
                        };
                  });
                  // The newest message is also what the conversation list
                  // previews, so keep the two in step.
                  const newest = msgs[msgs.length - 1];
                  if (newest) {
                        conv.lastText = newest.text || "";
                        conv.lastFromUid = newest.fromUid || "";
                        conv.lastAt = Number(newest.at) || Date.now();
                  }
                  this.scrollToBottom();
            },
            backToList() {
                  this.view = "list";
                  this.activeKey = "general";
                  this.replyTarget = null;
            },
            currentChannel() {
                  if (this.view === "dm" && this.activeDm) {
                        return {
                              type: "dm",
                              id: this.activeDm.player.id,
                              uid: this.activeDm.player.uid,
                              online: this.activeDm.player.online,
                        };
                  }
                  return { type: "general" };
            },
            sendPayload(payload, custom) {
                  const ch = this.currentChannel();
                  if (ch.type === "dm") {
                        // Sending to someone offline is allowed: the server
                        // stores the message and they read it when they return.
                        if (!ch.uid && !ch.id) return;
                        socket.emit("private-message", {
                              to: ch.id,
                              toUid: ch.uid || "",
                              text: payload.text,
                              replyTo: payload.replyTo || null,
                              replyToId: payload.replyToId || null,
                        });
                        const conv = this.activeDm;
                        conv.lastAt = Date.now();
                        conv.lastText = payload.text;
                        conv.lastFromUid = this.myUid;
                        conv.messages.push(
                              this.makeMessageObj(
                                    payload,
                                    custom,
                                    "me",
                                    payload.replyTo,
                              ),
                        );
                  } else {
                        socket.emit("user-message", payload);
                        this.addMessage(payload, custom, "me");
                  }
                  this.replyTarget = null;
                  this.stopTyping();
                  this.scrollToBottom();
            },
            setReplyTarget(messageData) {
                  this.replyTarget = messageData;
            },
            onInput() {
                  clearTimeout(this.typingTimeout);
                  if (this.view === "dm" && this.activeDm) {
                        socket.emit("private-typing", {
                              to: this.activeDm.player.id,
                              toUid: this.activeDm.player.uid || "",
                              isTyping: true,
                        });
                  } else {
                        socket.emit("user-typing", { isTyping: true });
                  }
                  this.typingTimeout = setTimeout(() => {
                        this.stopTyping();
                  }, 2000);
            },
            stopTyping() {
                  clearTimeout(this.typingTimeout);
                  if (this.view === "dm" && this.activeDm) {
                        socket.emit("private-typing", {
                              to: this.activeDm.player.id,
                              toUid: this.activeDm.player.uid || "",
                              isTyping: false,
                        });
                  } else {
                        socket.emit("user-typing", { isTyping: false });
                  }
            },
            sendEmoji(emoji) {
                  const payload = {
                        text: emoji,
                        replyTo: this.replyTarget
                              ? this.replyTarget.text
                              : null,
                        replyToId: this.replyTarget
                              ? this.replyTarget.id
                              : null,
                  };
                  this.sendPayload(
                        payload,
                        "rounded-l-xl rounded-br-xl text-right bg-orange-100 text-slate-800 ",
                  );
            },
            sendQuick(text) {
                  const payload = {
                        text,
                        replyTo: this.replyTarget
                              ? this.replyTarget.text
                              : null,
                        replyToId: this.replyTarget
                              ? this.replyTarget.id
                              : null,
                  };
                  this.sendPayload(
                        payload,
                        "rounded-l-xl rounded-br-xl text-right bg-orange-100 text-slate-800 ",
                  );
            },
            sendMessage() {
                  const raw = this.chatInput || "";
                  if (raw.trim() === "") return;
                  if (this.view === "general") {
                        let splitMsg = raw.split(" ");
                        if (splitMsg[0] == "/name") {
                              socket.emit("set-name", {
                                    name: splitMsg[1],
                                    persistentUserId: persistentUserId,
                              });
                              this.chatInput = "";
                              return;
                        }
                  }
                  const payload = {
                        text: raw,
                        replyTo: this.replyTarget
                              ? this.replyTarget.text
                              : null,
                        replyToId: this.replyTarget
                              ? this.replyTarget.id
                              : null,
                  };
                  this.sendPayload(
                        payload,
                        "rounded-l-xl rounded-br-xl bg-orange-100 ",
                  );
                  this.chatInput = "";
            },
            setMe(symbol) {
                  this.meSymbol = symbol;
            },
            setOpponent(name, symbol) {
                  this.opponentLabel = name + " [" + symbol + "]";
            },
            resetOpponent() {
                  this.opponentLabel = "";
            },
            highlightMe() {
                  this.meHighlighted = true;
                  this.opponentHighlighted = false;
            },
            highlightOpponent() {
                  this.opponentHighlighted = true;
                  this.meHighlighted = false;
            },
            clearHighlights() {
                  this.meHighlighted = false;
                  this.opponentHighlighted = false;
            },
            showTyping(name) {
                  this.typingName = name;
            },
            hideTyping() {
                  this.typingName = "";
            },
      },
      mounted() {
            if (window.visualViewport) {
                  window.visualViewport.addEventListener(
                        "resize",
                        this.syncViewport,
                  );
                  window.visualViewport.addEventListener(
                        "scroll",
                        this.syncViewport,
                  );
            }
            window.addEventListener("resize", this.syncViewport);
      },
      beforeDestroy() {
            if (window.visualViewport) {
                  window.visualViewport.removeEventListener(
                        "resize",
                        this.syncViewport,
                  );
                  window.visualViewport.removeEventListener(
                        "scroll",
                        this.syncViewport,
                  );
            }
            window.removeEventListener("resize", this.syncViewport);
      },
      template: `
            <div>
                  <!-- chat overlay -->
                  <div ref="overlay" v-show="chatOpen" id="chatOverlay"
                        class="fixed inset-0 z-50 flex flex-col bg-white/95">
                        <!-- playful gradient header -->
                        <div
                              class="relative shrink-0 overflow-hidden bg-gradient-to-br from-indigo-500 to-fuchsia-500 px-4 py-3 text-white shadow-[0_6px_0_rgba(0,0,0,0.18)]">
                              <div class="deco-circle -right-8 -top-12 size-28"></div>
                              <div class="deco-circle -bottom-10 left-10 size-20"></div>
                              <div class="relative z-10 flex items-center justify-between gap-2">
                                    <div class="flex min-w-0 items-center gap-2">
                                          <button v-if="view !== 'list'" @click="backToList" title="Back to conversations"
                                                class="btn-bubble grid size-9 shrink-0 place-items-center rounded-xl bg-white/25 text-lg font-black hover:bg-white/35">
                                                <i class="fa fa-caret-left"></i>
                                          </button>
                                          <span v-else class="text-2xl">💬</span>
                                          <div class="min-w-0">
                                                <div class="max-w-[42vw] truncate whitespace-nowrap text-xl font-black leading-none">{{ activeTitle }}</div>
                                                <div v-if="view === 'list'" class="mt-0.5 text-xs font-bold text-white/85">
                                                      General chat &amp; players
                                                </div>
                                                <div v-else-if="view === 'dm'" class="mt-0.5 text-xs font-bold text-white/85">
                                                      {{ dmOffline ? "Offline · saved until they read it" : "Private chat" }}
                                                </div>
                                                <div v-else class="mt-0.5 text-xs font-bold text-white/85">
                                                      Everyone on the server
                                                </div>
                                          </div>
                                    </div>
                                    <button @click="close" title="Close chat"
                                          class="btn-bubble grid size-9 shrink-0 place-items-center rounded-xl bg-white/25 text-lg font-black">
                                          ✕
                                    </button>
                              </div>
                        </div>

                        <!-- conversation list -->
                        <div v-if="view === 'list'"
                              class="flex min-h-0 flex-1 flex-col overflow-y-auto no-scrollbar p-2">
                              <button @click="openGeneral"
                                    class="w-full mb-1.5 flex items-center gap-3 rounded-2xl border border-white/40 bg-white/70 px-3 py-2.5 text-left shadow-sm transition-colors hover:bg-orange-100">
                                    <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-indigo-100 text-xl">💬</span>
                                    <span class="min-w-0 flex-1">
                                          <span class="block font-black">{{ generalEntry.label }}</span>
                                          <span class="block truncate text-xs font-bold text-slate-500">{{ generalEntry.subtitle }}</span>
                                    </span>
                                    <span v-if="generalEntry.unread"
                                          class="grid size-6 shrink-0 place-items-center rounded-full bg-red-500 text-xs font-black text-white">
                                          {{ generalEntry.unread }}
                                    </span>
                              </button>

                              <p class="px-2 pt-2 pb-1 text-xs font-black uppercase tracking-wide text-slate-500">
                                    Online players ({{ onlinePlayers.length }})
                              </p>
                              <p v-if="onlinePlayers.length === 0" class="px-2 py-3 text-sm font-bold text-slate-500">
                                    No one else is online right now.
                              </p>
                              <button v-for="p in onlineConvos" :key="p.key" @click="openDm(p.player)"
                                    class="w-full mb-1.5 flex items-center gap-3 rounded-2xl border border-white/40 bg-white/70 px-3 py-2.5 text-left shadow-sm transition-colors hover:bg-orange-100">
                                    <span class="relative grid size-10 shrink-0 place-items-center rounded-xl bg-white/70 text-xl">
                                          <img v-if="p.player.avatarUrl" :src="p.player.avatarUrl" alt=""
                                                class="size-9 rounded-lg object-cover" />
                                          <i v-else class="fa fa-user text-slate-400"></i>
                                          <span
                                                class="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-green-500 ring-2 ring-white"></span>
                                    </span>
                                    <span class="min-w-0 flex-1">
                                          <span class="block truncate font-black">{{ p.player.name }}</span>
                                          <span class="block truncate text-xs font-bold"
                                                :class="p.unread ? 'text-orange-600' : 'text-slate-500'">
                                                {{ dmPreview(p, onlineStatus(p.player)) }}
                                          </span>
                                    </span>
                                    <span v-if="p.unread"
                                          class="grid size-6 shrink-0 place-items-center rounded-full bg-red-500 text-xs font-black text-white">
                                          {{ p.unread }}
                                    </span>
                              </button>

                              <div v-if="offlineConvos.length">
                                    <p class="px-2 pt-2 pb-1 text-xs font-black uppercase tracking-wide text-slate-500">
                                      Recent chats
                                    </p>
                                    <button v-for="c in offlineConvos" :key="c.key" @click="openOfflineDm(c.key)"
                                          class="w-full mb-1.5 flex items-center gap-3 rounded-2xl border border-white/40 bg-white/50 px-3 py-2.5 text-left shadow-sm transition-colors hover:bg-orange-100">
                                          <span class="relative grid size-10 shrink-0 place-items-center rounded-xl bg-white/70 text-xl">
                                            <img v-if="c.player.avatarUrl" :src="c.player.avatarUrl" alt=""
                                                  class="size-9 rounded-lg object-cover" />
                                            <i v-else class="fa fa-user text-slate-400"></i>
                                            <span class="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-slate-300 ring-2 ring-white"></span>
                                          </span>
                                          <span class="min-w-0 flex-1">
                                            <span class="block truncate font-black">{{ c.player.name }}</span>
                                            <span class="block truncate text-xs font-bold"
                                                  :class="c.unread ? 'text-orange-600' : 'text-slate-500'">
                                              {{ dmPreview(c, "Offline") }}
                                            </span>
                                          </span>
                                          <span v-if="c.unread"
                                                class="grid size-6 shrink-0 place-items-center rounded-full bg-red-500 text-xs font-black text-white">
                                                {{ c.unread }}
                                          </span>
                                    </button>
                              </div>
                        </div>

                        <!-- conversation -->
                        <div v-else class="flex min-h-0 flex-1 flex-col p-2">
                              <div ref="display"
                                    class="flex-1 min-h-0 w-full overflow-y-scroll rounded-2xl border border-white/40 bg-white/30 p-1">
                                    <div v-if="activeMessages.length === 0"
                                          class="flex h-full items-center justify-center p-6 text-center">
                                          <p class="text-sm font-bold text-slate-500">
                                                {{ view === 'dm' ? 'Say hi 👋 (private)' : 'No messages yet — say hi 👋' }}
                                          </p>
                                    </div>
                                    <div v-for="m in activeMessages" :key="m.id"
                                          class="w-full px-2 mt-[6px] flex"
                                          :class="'place-content-' + pos(m.source)">
                                          <div class="min-w-20 flex flex-col"
                                                :class="'items-' + pos(m.source)"
                                                :style="m.source === 'other' ? { cursor: 'pointer' } : {}"
                                                @click="m.source === 'other' && setReplyTarget(m)"
                                                :title="m.source === 'other' ? 'Click to reply to this message' : ''">
                                                <div class="w-fit shadow px-2 py-1 max-w-[60vw]"
                                                      :class="m.class">
                                                      <div v-if="m.replyTo"
                                                            class="rounded-lg bg-white/50 px-2 py-1 text-xs text-slate-600 border border-slate-200">
                                                            {{ m.replyTo }}
                                                      </div>
                                                      <div>{{ m.text }}</div>
                                                </div>
                                                <p class="w-fit text-xs">{{ m.time }}</p>
                                          </div>
                                    </div>
                              </div>
                              <div v-show="activeTypingName"
                                    class="mb-1 w-fit rounded-lg bg-yellow-200/80 px-2 py-1 text-xs italic text-black">
                                    {{ activeTypingName }} is typing...
                              </div>
                              <div v-if="replyTarget"
                                    class="mt-2 rounded-2xl border border-slate-200 bg-white/80 p-2 text-sm shadow-sm">
                                    <div class="flex w-full">
                                          <div class="pr-2 text-sm font-semibold text-slate-500">Replying:</div>
                                          <div class="truncate text-sm text-slate-900">{{ replyTarget.text }}</div>
                                    </div>
                                    <button @click="replyTarget = null"
                                          class="mt-1 rounded-xl bg-red-600 p-1 text-xs text-white">
                                          <span class="fas fa-x"></span> Cancel
                                    </button>
                              </div>

                              <div class="h-fit rounded-2xl p-1">
                                    <!-- Quick Reactions Bar -->
                                    <div
                                          class="flex place-content-between gap-4 p-1 overflow-x-auto no-scrollbar rounded-xl mb-1 text-xl">
                                          <button @click="sendEmoji('👍')"
                                                class="hover:scale-125 transition-transform active:scale-95">
                                                👍
                                          </button>
                                          <button @click="sendEmoji('❤️')"
                                                class="hover:scale-125 transition-transform active:scale-95">
                                                ❤️
                                          </button>
                                          <button @click="sendEmoji('😂')"
                                                class="hover:scale-125 transition-transform active:scale-95">
                                                😂
                                          </button>
                                          <button @click="sendEmoji('😮')"
                                                class="hover:scale-125 transition-transform active:scale-95">
                                                😮
                                          </button>
                                          <button @click="sendEmoji('😢')"
                                                class="hover:scale-125 transition-transform active:scale-95">
                                                😢
                                          </button>
                                          <button @click="sendEmoji('🔥')"
                                                class="hover:scale-125 transition-transform active:scale-95">
                                                🔥
                                          </button>
                                          <button @click="sendEmoji('👏')"
                                                class="hover:scale-125 transition-transform active:scale-95">
                                                👏
                                          </button>
                                          <button @click="sendEmoji('🎉')"
                                                class="hover:scale-125 transition-transform active:scale-95">
                                                🎉
                                          </button>
                                    </div>

                                    <div class="flex items-center gap-2 mb-1">
                                          <button @click="quickChatOpen = !quickChatOpen"
                                                :class="quickChatOpen ? 'bg-slate-700 text-white' : 'bg-gradient-to-br from-amber-400 to-orange-500 text-white'"
                                                class="shrink-0 px-3 py-1 text-xs font-black rounded-2xl shadow hover:scale-105 active:scale-95 transition-transform">
                                                {{ quickChatOpen ? "Hide" : "💬 Quick Chat" }}
                                          </button>
                                          <div v-if="quickChatOpen"
                                                class="flex flex-wrap gap-1 overflow-x-auto no-scrollbar">
                                                <button v-for="q in quickMessages" :key="q"
                                                      @click="sendQuick(q)"
                                                      class="px-2 py-1 text-xs rounded-xl bg-white/80 text-slate-800 shadow hover:scale-105 active:scale-95 transition-transform">
                                                      {{ q }}
                                                </button>
                                          </div>
                                    </div>

                                    <div class="h-fit w-full rounded-2xl flex items-center place-content-between">
                                          <input :placeholder="dmOffline ? 'Message them while they are away…' : 'Type a message...'"
                                                type="text" v-model="chatInput"
                                                @input="onInput" @keyup.enter="sendMessage"
                                                class="min-w-0 flex-1 placeholder-gray-600 rounded-2xl border border-white/40 bg-white/70 p-2 h-10 shadow-sm focus:outline-none disabled:opacity-50" />
                                          <button @click="sendMessage"
                                                class="btn-bubble grid size-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 fa fa-arrow-up text-xl text-white disabled:opacity-50"></button>
                                    </div>
                              </div>
                        </div>
                  </div>
            </div>
      `,
});