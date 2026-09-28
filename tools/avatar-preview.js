// Dev preview: render avatar patterns as ASCII so the 16x16 output can be
// eyeballed in a terminal.
//
//   node tools/avatar-preview.js                    every pattern
//   node tools/avatar-preview.js maze               one pattern
//   node tools/avatar-preview.js voronoi 300 2      pattern, hue, seed index
const path = require("path");

const core = require(path.join(__dirname, "..", "public", "avatar-core.js"));

const GLYPH = { null: ".", fg: "#", dark: "@", hl: "+" };

const argv = process.argv.slice(2);
const name = argv[0] && !core.PATTERNS.includes(argv[0]) ? argv[0] : "james o";
const rest = argv[0] === name ? argv.slice(1) : argv;
const only = rest[0] && core.PATTERNS.includes(rest[0]) ? rest[0] : null;
const color = rest[1] === undefined ? 200 : Number(rest[1]);
const variant = rest[2] === undefined ? 0 : Number(rest[2]);

for (const p of core.PATTERN_LIST) {
  if (only && p.id !== only) continue;
  const { grid } = core.generateGrid(name + "#" + variant, { color, pattern: p.id });
  console.log("\n=== " + p.id + "  (" + p.label + ") ===");
  for (let y = 0; y < core.GRID; y++) {
    let row = "";
    for (let x = 0; x < core.GRID; x++) {
      row += GLYPH[grid[y * core.GRID + x]] + " ";
    }
    console.log(row);
  }
}
console.log("");
