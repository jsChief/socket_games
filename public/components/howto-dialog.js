// Global "How to play" dialog shared by every game view.
//
// Any view can open it with a one-liner:
//
//   openHowTo({
//     icon: "🍕",
//     title: "Find My Pizza",
//     tagline: "Hide 5 slices, then hunt your opponent's!",
//     accent: "from-amber-400 to-red-500",
//     steps: [
//       { icon: "🍕", title: "Set your slices", text: "Tap 5 cells on your board..." },
//       ...
//     ],
//   });
//
// The dialog is a single v-show-style instance mounted in index.html next to
// the chat overlay. openHowTo() replaces its content and shows it; Escape or
// tapping the backdrop (or the "Got it" button) closes it. main.js calls
// closeHowTo() whenever the player navigates away from a game so the dialog
// never lingers over another view.

var __howtoSpec = {
  icon: "🎮",
  title: "How to play",
  tagline: "",
  accent: "from-orange-500 to-rose-500",
  steps: [],
};
var __howtoVm = null;

Vue.component("howto-dialog", {
      data() {
            return {
                  open: false,
            };
      },
      computed: {
            spec() {
                  return __howtoSpec;
            },
      },
      mounted() {
            __howtoVm = this;
      },
      beforeDestroy() {
            if (__howtoVm === this) __howtoVm = null;
      },
      watch: {
            open(open) {
                  if (open) window.addEventListener("keydown", this.onKey);
                  else window.removeEventListener("keydown", this.onKey);
            },
      },
      methods: {
            show() {
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
            <div v-if="open" class="fixed inset-0 z-[90] flex items-center justify-center p-4">
                  <div class="absolute inset-0 bg-black/55 backdrop-blur-sm" @click="close"></div>
                  <div class="howto-pop relative w-full max-w-md overflow-hidden rounded-3xl bg-white/95 shadow-2xl">
                        <div class="relative overflow-hidden bg-gradient-to-br px-6 py-5 text-white"
                              :class="spec.accent">
                              <div class="deco-circle -right-6 -top-8 size-28"></div>
                              <div class="deco-circle -bottom-10 left-6 size-24"></div>
                              <div class="relative z-10 flex items-center gap-3">
                                    <span class="text-5xl">{{ spec.icon }}</span>
                                    <div>
                                          <h2 class="text-2xl font-black leading-none">{{ spec.title }}</h2>
                                          <p v-if="spec.tagline" class="mt-1 text-sm font-bold text-white/85">
                                                {{ spec.tagline }}
                                          </p>
                                    </div>
                              </div>
                        </div>
                        <div class="max-h-[55vh] space-y-3 overflow-y-auto no-scrollbar px-5 py-4">
                              <div v-for="(s, i) in spec.steps" :key="i" class="flex items-start gap-3">
                                    <span class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-black shadow-lg"
                                          :class="spec.accent">{{ i + 1 }}</span>
                                    <div class="flex-1 rounded-2xl bg-white/70 px-4 py-2 shadow-sm">
                                          <div class="font-black text-slate-800">
                                                {{ s.title }} <span class="text-base">{{ s.icon }}</span>
                                          </div>
                                          <p class="mt-0.5 text-sm font-bold text-slate-600">{{ s.text }}</p>
                                    </div>
                              </div>
                        </div>
                        <div class="px-5 pb-5 text-center">
                              <button @click="close"
                                    class="btn-bubble w-full rounded-2xl bg-gradient-to-br px-5 py-3 text-base font-black text-white"
                                    :class="spec.accent">
                                    Got it 👌
                              </button>
                        </div>
                  </div>
            </div>
      `,
});

// Show the dialog with a fresh set of content.
function openHowTo(spec) {
      Object.assign(__howtoSpec, spec || {});
      if (__howtoVm) __howtoVm.show();
}

// Close the dialog (used when navigating away from a game).
function closeHowTo() {
      if (__howtoVm) __howtoVm.close();
}