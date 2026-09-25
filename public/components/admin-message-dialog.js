// Full-screen modal for private messages sent by an admin.
//
// The games page mounts a single <admin-message-dialog></admin-message-dialog>
// next to the chat overlay. main.js calls showAdminMessage(text) whenever the
// server emits "admin-message" — the modal replaces the old toast and stays up
// until the player taps "Got it", clicks the backdrop, or presses Escape.

var __adminMessageText = "";
var __adminMessageVm = null;

Vue.component("admin-message-dialog", {
      data() {
            return {
                  open: false,
            };
      },
      computed: {
            text() {
                  return __adminMessageText;
            },
      },
      mounted() {
            __adminMessageVm = this;
      },
      beforeDestroy() {
            if (__adminMessageVm === this) __adminMessageVm = null;
      },
      watch: {
            open(open) {
                  if (open) window.addEventListener("keydown", this.onKey);
                  else window.removeEventListener("keydown", this.onKey);
            },
      },
      methods: {
            show(text) {
                  __adminMessageText = String(text || "");
                  this.open = true;
            },
            close() {
                  this.open = false;
            },
            onKey(ev) {
                  if (ev.key === "Escape") this.close();
            },
      },
      template: `
            <div v-if="open" class="fixed inset-0 z-[95] flex items-center justify-center p-4">
                  <div class="absolute inset-0 bg-black/55 backdrop-blur-sm" @click="close"></div>
                  <div class="howto-pop relative w-full max-w-md overflow-hidden rounded-3xl bg-white/95 shadow-2xl">
                        <div class="relative overflow-hidden bg-gradient-to-br from-indigo-600 to-blue-600 px-6 py-5 text-white">
                              <div class="deco-circle -right-6 -top-8 size-28"></div>
                              <div class="deco-circle -bottom-10 left-6 size-24"></div>
                              <div class="relative z-10 flex items-center gap-3">
                                    <span class="flex size-12 shrink-0 items-center justify-center rounded-xl bg-white/25 text-2xl shadow-lg">🛡️</span>
                                    <div class="min-w-0">
                                          <h2 class="text-2xl font-black leading-none">Message from admin</h2>
                                          <p class="mt-1 text-sm font-bold text-white/85">Private message</p>
                                    </div>
                              </div>
                        </div>
                        <div class="px-6 py-5">
                              <p class="whitespace-pre-wrap break-words text-base font-bold text-slate-800">{{ text }}</p>
                        </div>
                        <div class="px-6 pb-6 text-center">
                              <button @click="close"
                                    class="btn-bubble w-full rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-600 px-5 py-3 text-base font-black text-white">
                                    Got it 👌
                              </button>
                        </div>
                  </div>
            </div>
      `,
});

// Show the modal with a fresh message.
function showAdminMessage(text) {
      if (__adminMessageVm) __adminMessageVm.show(text);
}