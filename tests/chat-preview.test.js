// Unit test for the chat conversation list: last-message previews.
//
// Loads public/components/chat-view.js with a stubbed Vue to grab the component
// definition, then drives the real computed properties and methods to check the
// preview shown under each player's name in the list.
//
// Run with: node tests/chat-preview.test.js

global.Vue = {
  component(name, def) {
    global.__chatView = def;
  },
};
global.socket = { emit() {}, on() {} };
global.messageTone = { play() {} };
global.window = {
  innerHeight: 800,
  addEventListener() {},
  removeEventListener() {},
  visualViewport: null,
};
global.history = { pushState() {}, back() {} };
global.document = { addEventListener() {}, removeEventListener() {} };

require("../public/components/chat-view.js");
const def = global.__chatView;

let failures = 0;
function assert(cond, label) {
  if (cond) {
    console.log("  PASS " + label);
  } else {
    failures++;
    console.error("  FAIL " + label);
  }
}
function eq(actual, expected, label) {
  const ok = actual === expected;
  if (!ok) {
    console.error("        expected: " + JSON.stringify(expected));
    console.error("        actual:   " + JSON.stringify(actual));
  }
  assert(ok, label);
}

// Stand up an instance with the real data/computed/methods.
function makeVm() {
  const vm = {};
  Object.assign(vm, def.data.call(vm));
  vm.$set = (o, k, v) => {
    o[k] = v;
  };
  vm.$delete = (o, k) => {
    delete o[k];
  };
  vm.$nextTick = (fn) => fn && fn();
  vm.$refs = {};
  vm.$emit = () => {};
  vm.$el = { querySelectorAll: () => [] };
  for (const [k, fn] of Object.entries(def.methods)) vm[k] = fn.bind(vm);
  for (const [k, d] of Object.entries(def.computed)) {
    if (d && typeof d === "object" && "get" in d) {
      Object.defineProperty(vm, k, {
        get: d.get.bind(vm),
        set: d.set && d.set.bind(vm),
        configurable: true,
      });
    } else {
      Object.defineProperty(vm, k, { get: d.bind(vm), configurable: true });
    }
  }
  return vm;
}

console.log("Chat list previews:");

const ME = "uid-me";
const BOB = "uid-bob";
const CARA = "uid-cara";

let vm = makeVm();
vm.myUid = ME;
vm.setSelfSocket("socket-me", ME);

// Seed as the server would after a reload: one chat with a partner who is
// offline, one with a partner who is online right now.
vm.receivePrivateChats({
  conversations: [
    {
      partnerUid: BOB,
      partnerName: "Bob",
      lastText: "see you at 8",
      lastAt: 2000,
      lastFromUid: BOB,
      count: 4,
    },
    {
      partnerUid: CARA,
      partnerName: "Cara",
      lastText: "gg wp",
      lastAt: 1000,
      lastFromUid: ME,
      count: 2,
    },
  ],
});
vm.setOnlinePlayers([
  { id: "socket-cara", uid: CARA, name: "Cara", game: "reversi", roomCode: "ABC1" },
  { id: "socket-dave", uid: "uid-dave", name: "Dave", game: null, roomCode: null },
]);

// 1. Both conversations are listed, offline one included.
eq(vm.offlineConvos.length, 1, "one offline conversation is listed");
eq(vm.offlineConvos[0].player.name, "Bob", "offline row is the offline partner");
eq(vm.onlineConvos.length, 2, "both online players are listed");

// 2. Preview under the name: no prefix when they spoke last, "You: " when I did.
eq(
  vm.dmPreview(vm.offlineConvos[0], "Offline"),
  "see you at 8",
  "offline row previews their message without a prefix",
);
eq(
  vm.dmPreview(vm.onlineConvos[0], "x"),
  "You: gg wp",
  "online row prefixes my own last message with 'You: '",
);

// 3. With no history the row falls back to presence info.
eq(
  vm.dmPreview(vm.onlineConvos[1], vm.onlineStatus(vm.onlineConvos[1].player)),
  "In the lobby",
  "a player with no messages falls back to their status",
);
eq(
  vm.onlineStatus({ roomCode: "ABC1", game: "reversi" }),
  "In room ABC1",
  "status prefers the room code",
);

// 4. Multi-line messages stay on one line.
const multi = { lastText: "line one\nline two   spaced", lastFromUid: BOB };
eq(
  vm.dmPreview(multi, "x"),
  "line one line two spaced",
  "newlines and extra spaces are collapsed to one line",
);

// 5. Whitespace-only text falls back instead of rendering a blank row.
eq(vm.dmPreview({ lastText: "   " }, "Offline"), "Offline", "blank text falls back");
eq(vm.dmPreview({}, "Offline"), "Offline", "missing text falls back");

// 6. Offline rows are ordered by most recent activity.
const vm2 = makeVm();
vm2.myUid = ME;
vm2.setSelfSocket("s", ME);
vm2.receivePrivateChats({
  conversations: [
    { partnerUid: "u1", partnerName: "Old", lastText: "old", lastAt: 100, lastFromUid: "u1" },
    { partnerUid: "u2", partnerName: "New", lastText: "new", lastAt: 900, lastFromUid: "u2" },
    { partnerUid: "u3", partnerName: "Mid", lastText: "mid", lastAt: 500, lastFromUid: "u3" },
  ],
});
eq(
  vm2.offlineConvos.map((c) => c.player.name).join(","),
  "New,Mid,Old",
  "offline rows are ordered newest activity first",
);

// 7. An online partner is never listed as offline, even though the chat list
//    response may arrive after presence.
const vm3 = makeVm();
vm3.myUid = ME;
vm3.setSelfSocket("s", ME);
vm3.setOnlinePlayers([{ id: "x", uid: BOB, name: "Bob", game: null, roomCode: null }]);
vm3.receivePrivateChats({
  conversations: [{ partnerUid: BOB, partnerName: "Bob", lastText: "hi", lastAt: 5, lastFromUid: BOB }],
});
eq(vm3.offlineConvos.length, 0, "an online partner is not duplicated as offline");
assert(vm3.dmChats.Bob.player.online === true, "online partner stays marked online");

// 8. A new incoming message updates the preview immediately.
const vm4 = makeVm();
vm4.myUid = ME;
vm4.setSelfSocket("s", ME);
vm4.receivePrivateMessage({ fromId: "sock", fromUid: BOB, fromName: "Bob", text: "first" });
eq(vm4.dmPreview(vm4.dmChats.Bob, "x"), "first", "incoming message sets the preview");
vm4.receivePrivateMessage({ fromId: "sock", fromUid: BOB, fromName: "Bob", text: "second" });
eq(vm4.dmPreview(vm4.dmChats.Bob, "x"), "second", "a newer incoming message wins");

// 9. Loading history refreshes the preview from the newest stored message.
const vm5 = makeVm();
vm5.myUid = ME;
vm5.setSelfSocket("s", ME);
vm5.receivePrivateChats({
  conversations: [{ partnerUid: BOB, partnerName: "Bob", lastText: "stale", lastAt: 1, lastFromUid: BOB }],
});
vm5.receivePrivateHistory({
  partnerUid: BOB,
  partnerName: "Bob",
  messages: [
    { fromUid: ME, text: "older", at: 10 },
    { fromUid: BOB, text: "newest", at: 20 },
  ],
});
eq(
  vm5.dmPreview(vm5.dmChats.Bob, "x"),
  "newest",
  "loaded history overrides the seeded preview",
);
assert(vm5.dmChats.Bob.lastAt === 20, "loaded history updates the sort timestamp");

// 10. Smoke test: every method and computed must be callable without throwing.
//     A mistyped local (e.g. `convs` vs `convos`) is a legal identifier so
//     `node --check` passes it; only executing the code catches it.
{
  const smoke = makeVm();
  smoke.myUid = ME;
  smoke.setSelfSocket("smoke-socket", ME);
  smoke.receivePrivateChats({
    conversations: [
      { partnerUid: BOB, partnerName: "Bob", lastText: "yo", lastAt: 10, lastFromUid: BOB },
    ],
  });
  smoke.setOnlinePlayers([{ id: "s1", uid: CARA, name: "Cara", game: "pizza", roomCode: "ZZ9" }]);

  const argsFor = {
    pos: ["me"],
    open: [],
    close: [],
    openGeneral: [],
    backToList: [],
    normalizeText: ["hi", null, { text: "t" }],
    makeMessageObj: ["hi"],
    addMessage: ["hi"],
    receiveUserMessage: ["hi"],
    makePlayer: [{ name: "X", uid: "u" }],
    ensureDmChat: ["id", "Bob"],
    setSelfSocket: ["s", ME],
    setOnlinePlayers: [[]],
    requestConversationList: [],
    receivePrivateChats: [{ conversations: [] }],
    rekeyDmChat: ["nope", "other"],
    setPrivateTyping: [{ fromUid: BOB, isTyping: true }],
    receivePrivateMessage: [{ fromUid: BOB, fromName: "Bob", text: "ping" }],
    clearDmUnread: ["Bob"],
    openDm: [{ id: "s1", uid: CARA, name: "Cara", avatarUrl: null }],
    openOfflineDm: ["Bob"],
    requestHistory: [smoke.dmChats.Bob],
    receivePrivateHistory: [{ partnerUid: BOB, partnerName: "Bob", messages: [] }],
    currentChannel: [],
    sendPayload: [{ text: "reply" }],
    setReplyTarget: [{ text: "q" }],
    onInput: [],
    stopTyping: [],
    sendMessage: [],
    scrollToBottom: [],
    syncViewport: [],
    dmPreview: [{ lastText: "a", lastFromUid: BOB }, "fb"],
    onlineStatus: [{ roomCode: null, game: null }],
  };

  let threw = [];
  for (const name of Object.keys(def.methods)) {
    const fn = smoke[name];
    if (typeof fn !== "function") continue;
    try {
      fn.apply(smoke, argsFor[name] || []);
    } catch (err) {
      threw.push(name + " -> " + err.message);
    }
  }
  assert(threw.length === 0, "every component method runs without throwing" + (threw.length ? " (" + threw.join("; ") + ")" : ""));

  let computedThrew = [];
  for (const name of Object.keys(def.computed)) {
    try {
      void smoke[name];
    } catch (err) {
      computedThrew.push(name + " -> " + err.message);
    }
  }
  assert(
    computedThrew.length === 0,
    "every computed evaluates without throwing" + (computedThrew.length ? " (" + computedThrew.join("; ") + ")" : ""),
  );
}

console.log(failures ? "\n" + failures + " FAILURE(S)" : "\nALL PREVIEW TESTS PASSED");
process.exit(failures ? 1 : 0);