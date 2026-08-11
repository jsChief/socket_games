Vue.component("tictactoe-view", {
      data() {
            return {
                  cells: Array(9).fill(""),
                  myTurn: false,
                  mySymbol: "",
            };
      },
      methods: {
            play(index) {
                  if (!this.myTurn) return;
                  if (this.cells[index] !== "") return;
                  this.cells[index] = this.mySymbol;
                  socket.emit("btn-pos", { index, symbol: this.mySymbol });
                  this.myTurn = false;
            },
            applyClickBtn(x) {
                  this.$set(this.cells, x.index, x.symbol);
            },
            applySetTable(t) {
                  this.cells = (t && t.slice()) || Array(9).fill("");
            },
            applyClearTable() {
                  this.cells = Array(9).fill("");
            },
            setTurn(data) {
                  this.mySymbol = data.symbol;
                  this.myTurn = true;
            },
            opponentTurn() {
                  this.myTurn = false;
            },
      },
      template: `
            <div>
                  <p class="text-3xl p-4 rounded-2xl w-full text-center bg-white/90 font-bold shadow">
                        Christy's Tic Tac Toe
                  </p>

                  <div
                        class="w-full h-60 rounded p-4 grid grid-rows-3 shadow-xl mx-auto mt-2 font-bold text-4xl backdrop-blur-sm rounded-2xl p-2 text-white">
                        <div class="bg-orange-600 rounded-t h-18 p-1 flex place-content-around items-center">
                              <button class="h-12 w-12 rounded shadow bg-black" @click="play(0)">{{ cells[0] }}</button>
                              <button class="h-12 w-12 rounded shadow bg-black" @click="play(1)">{{ cells[1] }}</button>
                              <button class="h-12 w-12 rounded shadow bg-black" @click="play(2)">{{ cells[2] }}</button>
                        </div>
                        <div class="bg-orange-500 h-18 p-1 flex place-content-around items-center">
                              <button class="h-12 w-12 rounded shadow bg-black" @click="play(3)">{{ cells[3] }}</button>
                              <button class="h-12 w-12 rounded shadow bg-black" @click="play(4)">{{ cells[4] }}</button>
                              <button class="h-12 w-12 rounded shadow bg-black" @click="play(5)">{{ cells[5] }}</button>
                        </div>
                        <div class="bg-orange-400 rounded-b h-18 p-1 flex place-content-around items-center">
                              <button class="h-12 w-12 rounded shadow bg-black" @click="play(6)">{{ cells[6] }}</button>
                              <button class="h-12 w-12 rounded shadow bg-black" @click="play(7)">{{ cells[7] }}</button>
                              <button class="h-12 w-12 rounded shadow bg-black" @click="play(8)">{{ cells[8] }}</button>
                        </div>
                  </div>
            </div>
      `,
});
