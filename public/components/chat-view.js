Vue.component("chat-view", {
      data() {
            return {
                  chatOpen: false,
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
            };
      },
      computed: {
            meLabel() {
                  return this.meSymbol ? "[" + this.meSymbol + "] me" : "me";
            },
            meClass() {
                  let c = "px-2 py-0.5 text-sm rounded-xl ";
                  if (this.meHighlighted) {
                        c += "bg-yellow-300 text-black font-bold";
                  } else {
                        c += this.meSymbol
                              ? "bg-green-600 text-white"
                              : "bg-orange-600 text-orange-100";
                  }
                  return c;
            },
            opponentClass() {
                  if (!this.opponentLabel) {
                        return "px-2 py-0.5 text-sm rounded-xl bg-transparent text-black";
                  }
                  let c = "px-2 py-0.5 text-sm rounded-xl ";
                  c += this.opponentHighlighted
                        ? "bg-yellow-300 text-black font-bold"
                        : "bg-green-600 text-white";
                  return c;
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
            addMessage(text, custom, source) {
                  const isObj = typeof text === "object" && text !== null;
                  const messageText = isObj
                        ? this.normalizeText(text.text)
                        : text;
                  const replyText =
                        isObj && text.replyTo
                              ? this.normalizeText(text.replyTo)
                              : null;
                  this.messages.push({
                        id: ++this.messageIdCounter,
                        text: messageText,
                        replyTo: replyText,
                        class: custom,
                        source,
                        time: new Date().toLocaleTimeString(),
                  });
                  this.scrollToBottom();
            },
            receiveUserMessage(message) {
                  const isObj = typeof message === "object" && message !== null;
                  const messageText = isObj
                        ? this.normalizeText(message.text)
                        : message;
                  const replyText =
                        isObj && message.replyTo
                              ? this.normalizeText(message.replyTo)
                              : null;
                  this.messages.push({
                        id: ++this.messageIdCounter,
                        text: messageText,
                        replyTo: replyText,
                        class: "rounded-r-xl rounded-bl-xl bg-gray-200 ",
                        source: "other",
                        time: new Date().toLocaleTimeString(),
                  });
                  if (!this.chatOpen) this.$emit("new-message");
                  messageTone.play();
                  this.scrollToBottom();
            },
            setReplyTarget(messageData) {
                  this.replyTarget = messageData;
            },
            onInput() {
                  socket.emit("user-typing", { isTyping: true });
                  clearTimeout(this.typingTimeout);
                  this.typingTimeout = setTimeout(() => {
                        socket.emit("user-typing", { isTyping: false });
                  }, 2000);
            },
            stopTyping() {
                  clearTimeout(this.typingTimeout);
                  socket.emit("user-typing", { isTyping: false });
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
                  socket.emit("user-message", payload);
                  this.addMessage(
                        payload,
                        "rounded-l-xl rounded-br-xl text-right bg-orange-100 ",
                        "me",
                  );
                  this.replyTarget = null;
                  this.stopTyping();
            },
            sendMessage() {
                  if (this.inputValue === "") return;
                  let splitMsg = this.inputValue.split(" ");
                  if (splitMsg[0] == "/name") {
                        socket.emit("set-name", {
                              name: splitMsg[1],
                              persistentUserId: persistentUserId,
                        });
                  } else if (splitMsg[0] == "/reset") {
                        if (!app.opponent) {
                              socket.emit("reset-game", app.myName);
                        } else {
                              socket.emit("request-game-reset", app.myName);
                              this.addMessage(
                                    "Game reset request has been sent to " +
                                          app.opponent,
                                    "text-center bg-blue-200 text-blue-700 ",
                                    "server",
                              );
                        }
                  } else if (splitMsg[0] == "/accept") {
                        socket.emit("accept-game-reset", app.myName);
                  } else {
                        const payload = {
                              text: this.inputValue,
                              replyTo: this.replyTarget
                                    ? this.replyTarget.text
                                    : null,
                              replyToId: this.replyTarget
                                    ? this.replyTarget.id
                                    : null,
                        };
                        socket.emit("user-message", payload);
                        this.addMessage(
                              payload,
                              "rounded-l-xl rounded-br-xl bg-orange-100 ",
                              "me",
                        );
                        this.replyTarget = null;
                        this.stopTyping();
                  }
                  this.inputValue = "";
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
                        class="fixed inset-0 z-50 flex flex-col bg-white/20 backdrop-blur">
                        <div class="w-full flex-1 flex flex-col min-h-0 bg-white/20 p-1">
                              <div
                                    class="flex place-content-between items-center w-full bg-white/50 rounded-xl h-8 p-1">
                                    <p class="px-2 py-0.5 text-sm rounded-xl" :class="opponentClass">
                                          {{ opponentLabel || "player 2" }}
                                    </p>
                                    <p class="px-2 py-0.5 text-sm rounded-xl" :class="meClass">
                                          {{ meLabel }}
                                    </p>
                              </div>
                              <div ref="display"
                                    class="flex-1 min-h-0 rounded-xl w-full overflow-y-scroll bg-neutral-400/40 my-1">
                                    <div v-for="m in messages" :key="m.id"
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
                              <div v-show="typingName"
                                    class="px-2 py-1 text-xs italic text-black bg-yellow-200/80 w-fit rounded-lg mb-1">
                                    {{ typingName }} is typing...
                              </div>
                              <div v-if="replyTarget"
                                    class="mt-2 rounded-xl border border-slate-300 bg-white/80 backdrop-blur-sm p-2 text-sm text-slate-900">
                                    <div class="flex w-full">
                                          <div class="font-semibold text-sm pr-2 text-slate-500">Replying:</div>
                                          <div class="truncate text-sm text-slate-900">{{ replyTarget.text }}</div>
                                    </div>
                                    <button @click="replyTarget = null"
                                          class="mt-1 text-xs bg-red-600 text-white p-1 rounded-xl">
                                          <span class="fas fa-x"></span> Cancel
                                    </button>
                              </div>

                              <div class="h-fit rounded-2xl bg-white/50 p-1 backdrop-blur-sm">
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

                                    <div class="h-fit w-full rounded-2xl flex items-center place-content-between">
                                          <input placeholder="enter text..." type="text" v-model="inputValue"
                                                @input="onInput" @keyup.enter="sendMessage"
                                                class="placeholder-gray-600 p-2 h-10 w-87/100 rounded-2xl border border-white/40 shadow" />
                                          <button @click="sendMessage"
                                                class="rounded-2xl p-2 shadow size-10 bg-gradient-to-br from-yellow-400 to-orange-600 fa fa-arrow-up text-xl"></button>
                                    </div>
                              </div>
                        </div>
                  </div>
            </div>
      `,
});
