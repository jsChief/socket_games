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
                  return this.onlinePlayers.map((p) => ({
                        key: p.name,
                        type: "dm",
                        player: this.makePlayer(p),
                        online: true,
                        unread: this.dmUnread[p.name] || 0,
                  }));
            },
            offlineConvos() {
                  const convs = [];
                  const seen = {};
                  for (const p of this.onlinePlayers)
                        seen[p.name] = true;
                  for (const key in this.dmChats) {
                        if (seen[key]) continue;
                        const conv = this.dmChats[key];
                        if (conv.messages.length > 0) {
                              convs.push({
                                    key,
                                    type: "dm",
                                    player: conv.player,
                                    online: false,
                                    unread: this.dmUnread[key] || 0,
                              });
                        }
                  }
                  return convs;
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
                        if (byName[key])
                              this.dmChats[key].player = this.makePlayer(
                                    byName[key],
                              );
                        else this.dmChats[key].player.online = false;
                  }
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
                  conv.messages = msgs.map((m) => {
                        const mine = conv.player.uid
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
                        if (!ch.online) return;
                        socket.emit("private-message", {
                              to: ch.id,
                              toUid: ch.uid || "",
                              text: payload.text,
                              replyTo: payload.replyTo || null,
                              replyToId: payload.replyToId || null,
                        });
                        this.activeDm.messages.push(
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
                                                      {{ dmOffline ? "Offline" : "Private chat" }}
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
                                          <span class="block truncate text-xs font-bold text-slate-500">
                                                {{ p.player.roomCode ? "In room " + p.player.roomCode : p.player.game ? "Playing " + p.player.game : "In the lobby" }}
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
                                          <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-white/70 text-xl">
                                                <i class="fa fa-user-slash text-slate-400"></i>
                                          </span>
                                          <span class="min-w-0 flex-1">
                                                <span class="block truncate font-black">{{ c.player.name }}</span>
                                                <span class="block truncate text-xs font-bold text-slate-500">
                                                      Offline{{ c.unread ? " · " + c.unread + " new" : "" }}
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
                                          <input :placeholder="dmOffline ? 'Player is offline' : 'Type a message...'"
                                                type="text" v-model="chatInput" :disabled="dmOffline"
                                                @input="onInput" @keyup.enter="sendMessage"
                                                class="min-w-0 flex-1 placeholder-gray-600 rounded-2xl border border-white/40 bg-white/70 p-2 h-10 shadow-sm focus:outline-none disabled:opacity-50" />
                                          <button @click="sendMessage" :disabled="dmOffline"
                                                class="btn-bubble grid size-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 fa fa-arrow-up text-xl text-white disabled:opacity-50"></button>
                                    </div>
                              </div>
                        </div>
                  </div>
            </div>
      `,
});