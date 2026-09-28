// Shared avatar generation core.
//
// This file is loaded twice from the same source:
//   * the browser, via a <script> tag in index.html (exposes window.AvatarCore)
//   * the Node server, via require() in lib/avatars.js
// Keeping exactly one copy of the hash / palette / pattern code is what
// guarantees the Avatar Studio preview is pixel-identical to the PNG the
// server writes.
//
// Everything here is pure data: no DOM, no filesystem, no Node built-ins.
// Callers rasterize the GRID x GRID key grid returned by buildIdenticon() into
// a canvas (client) or into PNG bytes (server).
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AvatarCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // ---------- geometry ----------

  var GRID = 16; // sprite grid size (columns/rows)
  var HALF = GRID / 2; // 8 independent columns before mirroring
  var SCALE = 4; // each sprite pixel becomes a 4x4 block => 64x64 output
  var AXIS = (GRID - 1) / 2; // mirror axis, also the horizontal centre

  // Color keys. Index 0 is the palette background, 1-3 are the three inks.
  var K_BG = 0;
  var K_FG = 1;
  var K_DARK = 2;
  var K_HL = 3;
  var KEYS = [null, "fg", "dark", "hl"];

  // Named monochrome palettes accepted alongside a hue in degrees.
  var MONO_COLORS = ["black", "white", "cyberpunk", "sunset", "neon", "emerald"];

  // Bumped whenever the generator output changes so saved PNGs from an older
  // generator are regenerated instead of being served forever.
  var AVATAR_GEN_VERSION = 3;

  var DEFAULT_PATTERN = "mix";

  // ---------- pattern registry ----------

  // Every pattern paints only the left HALF columns (x = 0..7) for all 16 rows;
  // buildIdenticon() mirrors that half to make the finished sprite symmetric.
  // `group` is only used to lay the Avatar Studio picker out in sections.
  var PATTERN_LIST = [
    { id: "mix", label: "Mix", group: "Classic" },
    { id: "checker", label: "Checker", group: "Classic" },
    { id: "stripes", label: "Stripes", group: "Classic" },
    { id: "rings", label: "Rings", group: "Classic" },
    { id: "circle", label: "Circle", group: "Classic" },
    { id: "diamond", label: "Diamond", group: "Classic" },
    { id: "cross", label: "Cross", group: "Classic" },
    { id: "dots", label: "Dots", group: "Classic" },
    { id: "grid", label: "Grid", group: "Classic" },
    { id: "heart", label: "Heart", group: "Classic" },
    { id: "face", label: "Face", group: "Classic" },
    { id: "maze", label: "Maze", group: "Complex" },
    { id: "terrain", label: "Hills", group: "Complex" },
    { id: "noise", label: "Contour", group: "Complex" },
    { id: "dither", label: "Dither", group: "Complex" },
    { id: "plasma", label: "Plasma", group: "Complex" },
    { id: "swirl", label: "Swirl", group: "Complex" },
    { id: "voronoi", label: "Mosaic", group: "Complex" },
    { id: "weave", label: "Weave", group: "Complex" },
    { id: "quilt", label: "Quilt", group: "Complex" },
    { id: "circuit", label: "Circuit", group: "Complex" },
  ];

  // Legacy id kept so existing saved settings still resolve.
  var LEGACY_PATTERN_ALIASES = { random: "mix" };

  var PATTERNS = PATTERN_LIST.map(function (p) {
    return p.id;
  });

  // ---------- small helpers ----------

  function newHalf() {
    return new Uint8Array(GRID * HALF);
  }

  function put(g, x, y, k) {
    if (x < 0 || x >= HALF || y < 0 || y >= GRID) return;
    g[y * HALF + x] = k;
  }

  function get(g, x, y) {
    if (x < 0 || x >= HALF || y < 0 || y >= GRID) return K_BG;
    return g[y * HALF + x];
  }

  function rect(g, x, y, w, h, k) {
    for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) put(g, x + i, y + j, k);
  }

  function int(rand, n) {
    var v = Math.floor(rand() * n);
    return v < 0 ? 0 : v >= n ? n - 1 : v;
  }

  function pick(rand, arr) {
    return arr[int(rand, arr.length)];
  }

  function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }

  function smooth(t) {
    return t * t * (3 - 2 * t);
  }

  // Weighted ink choice: mostly the main colour, with occasional accent inks so
  // a pattern never turns into flat blocks of a single tone.
  function ink(rand, a, b, c) {
    var v = rand();
    if (v < 0.62) return a;
    if (v < 0.86) return b;
    return c === undefined ? a : c;
  }

  var DX = [1, 0, -1, 0];
  var DY = [0, 1, 0, -1];

  // Fisher-Yates on a 4-element direction order, so random walks turn in a
  // seeded-but-unpredictable way.
  function shuffledDirs(rand) {
    var d = [0, 1, 2, 3];
    for (var i = 3; i > 0; i--) {
      var j = int(rand, i + 1);
      var t = d[i];
      d[i] = d[j];
      d[j] = t;
    }
    return d;
  }

  // Smoothed value noise over the half-grid domain. `cells` is the lattice
  // resolution across the 8 columns; y gets a proportionally taller lattice so
  // the field stays isotropic.
  function valueNoise(rand, cells) {
    var gw = cells;
    var gh = Math.max(2, Math.round((cells * GRID) / HALF));
    var vals = new Float64Array(gw * gh);
    for (var i = 0; i < vals.length; i++) vals[i] = rand();
    return function (x, y) {
      var fx = (x / HALF) * gw;
      var fy = (y / GRID) * gh;
      var x0 = Math.floor(fx);
      var y0 = Math.floor(fy);
      var tx = smooth(fx - x0);
      var ty = smooth(fy - y0);
      var x1 = Math.min(gw - 1, x0 + 1);
      var y1 = Math.min(gh - 1, y0 + 1);
      var a = vals[y0 * gw + x0];
      var b = vals[y0 * gw + x1];
      var c = vals[y1 * gw + x0];
      var d = vals[y1 * gw + x1];
      return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
    };
  }

  function fbm(rand, octaves, baseCells) {
    var layers = [];
    var amp = 1;
    var norm = 0;
    for (var o = 0; o < octaves; o++) {
      layers.push({ n: valueNoise(rand, baseCells * (1 << o)), amp: amp });
      norm += amp;
      amp *= 0.5;
    }
    return function (x, y) {
      var v = 0;
      for (var i = 0; i < layers.length; i++) v += layers[i].amp * layers[i].n(x, y);
      return v / norm;
    };
  }

  // ---------- patterns ----------
  // Each returns a Uint8Array of GRID * HALF ink keys.

  // Chunky 2x2 identicon blocks - the classic look, but readable at 16x16.
  function pMix(rand) {
    var g = newHalf();
    for (var y = 0; y < GRID; y += 2) {
      for (var x = 0; x < HALF; x += 2) {
        var k = ink(rand, K_FG, K_DARK, K_HL);
        if (rand() < 0.52) rect(g, x, y, 2, 2, k);
      }
    }
    return g;
  }

  function pChecker(rand) {
    var g = newHalf();
    for (var y = 0; y < GRID; y += 2) {
      for (var x = 0; x < HALF; x += 2) {
        if ((((x >> 1) + (y >> 1)) & 1) === 0) {
          rect(g, x, y, 2, 2, ink(rand, K_FG, K_DARK, K_HL));
        }
      }
    }
    return g;
  }

  // Chevron bands: d is the distance to the nearest corner, so the bands stay
  // symmetric under mirroring.
  function pStripes(rand) {
    var g = newHalf();
    var thin = rand() < 0.4;
    for (var y = 0; y < GRID; y++) {
      for (var x = 0; x < HALF; x++) {
        var d = Math.min(
          x + y,
          GRID - 1 - x + y,
          x + GRID - 1 - y,
          2 * GRID - 1 - x - y,
        );
        var band = thin ? d % 6 : d % 4;
        if (band === 0) put(g, x, y, K_FG);
        else if (band === 1) put(g, x, y, K_HL);
        else if (band === 2) put(g, x, y, K_DARK);
      }
    }
    return g;
  }

  // Concentric squares (Chebyshev distance from the centre), with a clear
  // background frame so the bands read as rings and not as a solid block.
  function pRings(rand) {
    var g = newHalf();
    var seq = [K_FG, K_DARK, K_HL, K_FG, K_DARK, K_HL];
    var shift = int(rand, 4);
    for (var y = 0; y < GRID; y++) {
      for (var x = 0; x < HALF; x++) {
        var k = Math.max(AXIS - x, Math.abs(y - AXIS));
        var idx = Math.floor(k) + shift;
        put(g, x, y, idx < 6 ? seq[idx % 3] : K_BG);
      }
    }
    return g;
  }

  // Concentric discs with a seeded tightness so some read as a bullseye and
  // others as a soft orb, plus a bright centre pip.
  function pCircle(rand) {
    var g = newHalf();
    var bias = 0.55 + rand() * 1.1;
    for (var y = 0; y < GRID; y++) {
      for (var x = 0; x < HALF; x++) {
        var dx = AXIS - x;
        var dy = y - AXIS;
        var b = Math.floor(Math.sqrt(dx * dx + dy * dy) * bias);
        var k =
          b <= 1
            ? K_FG
            : b < 4
              ? K_DARK
              : b < 6
                ? K_HL
                : b < 7
                  ? K_FG
                  : K_BG;
        put(g, x, y, k);
      }
    }
    rect(g, HALF - 1, Math.floor(AXIS), 1, 2, K_HL);
    return g;
  }

  // Manhattan-distance bands from the centre.
  function pDiamond(rand) {
    var g = newHalf();
    var step = rand() < 0.5 ? 2 : 3;
    for (var y = 0; y < GRID; y++) {
      for (var x = 0; x < HALF; x++) {
        var d = AXIS - x + Math.abs(y - AXIS);
        var b = Math.floor(d / step);
        put(
          g,
          x,
          y,
          b === 0
            ? K_FG
            : b === 1
              ? K_HL
              : b === 2
                ? K_DARK
                : b === 3
                  ? K_FG
                  : K_BG,
        );
      }
    }
    return g;
  }

  // A plus sign crossed by a full X, with speckled ink and a solid hub.
  function pCross(rand) {
    var g = newHalf();
    var arm = 1 + int(rand, 3);
    var speckle = rand() < 0.5;
    for (var y = 0; y < GRID; y++) {
      for (var x = 0; x < HALF; x++) {
        var dx = AXIS - x;
        var ady = Math.abs(y - AXIS);
        var onPlus = dx < arm || ady < arm;
        var onX = Math.abs(dx - ady) < 0.6;
        if (onPlus || onX) {
          put(g, x, y, speckle ? ink(rand, K_FG, K_DARK, K_HL) : K_FG);
        }
      }
    }
    rect(g, HALF - 1, Math.floor(AXIS), 1, 2, K_DARK);
    return g;
  }

  // Jittered 2x2 dots on a loose lattice.
  function pDots(rand) {
    var g = newHalf();
    var pitch = rand() < 0.5 ? 3 : 4;
    for (var y = 1; y < GRID; y += pitch) {
      for (var x = 1; x < HALF; x += pitch) {
        var jx = x + int(rand, 2);
        var jy = y + int(rand, 2);
        rect(g, jx, jy, 2, 2, ink(rand, K_FG, K_HL, K_DARK));
      }
    }
    return g;
  }

  // Chunky tiled lattice: dark grid lines with one seeded motif per tile.
  function pGrid(rand) {
    var g = newHalf();
    var pitch = 3 + int(rand, 2); // 3 or 4
    var line = pitch - 1;
    for (var y = 0; y < GRID; y++) {
      for (var x = 0; x < HALF; x++) {
        if (x % pitch === line || y % pitch === line) put(g, x, y, K_DARK);
      }
    }
    for (var by = 0; by < GRID; by += pitch) {
      for (var bx = 0; bx < HALF; bx += pitch) {
        var tone = ink(rand, K_FG, K_HL, K_FG);
        var motif = int(rand, 3);
        for (var ty = 0; ty < pitch; ty++) {
          for (var tx = 0; tx < pitch; tx++) {
            var px = bx + tx;
            var py = by + ty;
            if (px >= HALF || py >= GRID) continue;
            if (px % pitch === line || py % pitch === line) continue;
            var k = tone;
            if (motif === 1) k = (tx + ty) & 1 ? tone : K_BG;
            else if (motif === 2 && (tx === 0 || ty === 0)) k = K_BG;
            put(g, px, py, k);
          }
        }
      }
    }
    return g;
  }

  // Two circles over a triangle: the classic pixel-art heart. Built from
  // primitives rather than the implicit (x^2+y^2-1)^3 - x^2y^3 curve, whose top
  // edge is level between the lobes and so reads as a shield at 16px.
  // `w` grows downward like the grid rows, so the point sits at +w.
  function pHeart(rand) {
    var g = newHalf();
    var size = 6.1 + rand() * 0.6;
    var cy = 6.3 + rand() * 0.5;
    function inside(x, y) {
      var u = (x - AXIS) / size;
      var w = (y - cy) / size;
      var lobe = (u + 0.45) * (u + 0.45) + (w + 0.2) * (w + 0.2) <= 0.3025;
      if (!lobe) lobe = (u - 0.45) * (u - 0.45) + (w + 0.2) * (w + 0.2) <= 0.3025;
      if (lobe) return true;
      if (w < -0.1) return false;
      return Math.abs(u) <= ((1.05 - w) / 1.15) * 0.95;
    }
    for (var y = 0; y < GRID; y++) {
      for (var x = 0; x < HALF; x++) {
        if (!inside(x, y)) continue;
        var rim = !inside(x - 1, y) || !inside(x, y - 1);
        put(g, x, y, rim ? K_HL : K_FG);
      }
    }
    return g;
  }

  // A round head with hair, eyes, blush and a smile. Every feature sits on the
  // mirrored column so both halves of the face line up automatically.
  function pFace(rand) {
    var g = newHalf();
    var wide = rand() < 0.4;
    var rx = wide ? 6.6 : 5.8;
    var ry = 7.1;
    for (var y = 0; y < GRID; y++) {
      for (var x = 0; x < HALF; x++) {
        var dx = (AXIS - x) / rx;
        var dy = (y - AXIS) / ry;
        if (dx * dx + dy * dy > 1) continue;
        var k = K_FG;
        if (y === 2 || (y === 3 && Math.abs(dx) < 0.6)) k = K_DARK; // fringe
        if ((y === 6 || y === 7) && (x === 3 || x === 4)) {
          k = y === 6 && x === 3 ? K_HL : K_DARK; // eyes, one lit pixel
        }
        if (y === 9 && (x === 1 || x === 2)) k = K_HL; // blush
        if (y === 10 && (x === 2 || x === 3)) k = K_DARK; // mouth corners
        if (y === 11 && (x === 2 || x === 3 || x === 4)) k = K_DARK; // mouth
        put(g, x, y, k);
      }
    }
    return g;
  }

  // Seeded depth-first maze on a 4 x 8 cell lattice inside the 8 x 16 half.
  // Cells are 1x1 corridors with 1px walls between them; the DFS carves the
  // gaps it walks through, so the wall layout becomes a perfect maze. Dead-end
  // corridors glow so the topology is readable at 4x scale.
  function pMaze(rand) {
    var g = newHalf();
    var cw = HALF / 2; // 4 cell columns, cell (i,j) sits at (2i, 2j)
    var ch = GRID / 2; // 8 cell rows
    var right = new Uint8Array(cw * ch); // carved gap to the right neighbour
    var down = new Uint8Array(cw * ch); // carved gap to the lower neighbour
    var visited = new Uint8Array(cw * ch);

    var sx = int(rand, cw);
    var sy = int(rand, ch);
    visited[sy * cw + sx] = 1;
    var stack = [sx, sy];
    while (stack.length) {
      var cx = stack[stack.length - 2];
      var cy = stack[stack.length - 1];
      var order = shuffledDirs(rand);
      var moved = false;
      for (var i = 0; i < 4; i++) {
        var d = order[i];
        var nx = cx + (d === 0 ? 1 : d === 2 ? -1 : 0);
        var ny = cy + (d === 1 ? 1 : d === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue;
        if (visited[ny * cw + nx]) continue;
        visited[ny * cw + nx] = 1;
        if (nx > cx) right[cy * cw + cx] = 1;
        else if (nx < cx) right[cy * cw + nx] = 1;
        if (ny > cy) down[cy * cw + cx] = 1;
        else if (ny < cy) down[(cy - 1) * cw + cx] = 1;
        stack.push(nx, ny);
        moved = true;
        break;
      }
      if (!moved) {
        stack.pop();
        stack.pop();
      }
    }

    for (var y = 0; y < GRID; y++) {
      for (var x = 0; x < HALF; x++) {
        var ci = x >> 1;
        var cj = y >> 1;
        if (ci < cw && cj < ch) {
          var even = (x & 1) === 0 && (y & 1) === 0; // the cell itself
          var gapX = (x & 1) === 1 && (y & 1) === 0 && right[cj * cw + ci];
          var gapY = (x & 1) === 0 && (y & 1) === 1 && down[cj * cw + ci];
          put(g, x, y, even || gapX || gapY ? K_BG : K_FG);
        } else {
          put(g, x, y, K_FG);
        }
      }
    }
    // Dead ends: a corridor cell with exactly one open neighbour.
    for (var y2 = 0; y2 < GRID; y2++) {
      for (var x2 = 0; x2 < HALF; x2++) {
        if (get(g, x2, y2) !== K_BG) continue;
        var open = 0;
        for (var d2 = 0; d2 < 4; d2++) {
          if (get(g, x2 + DX[d2], y2 + DY[d2]) === K_BG) open++;
        }
        if (open === 1) put(g, x2, y2, K_HL);
      }
    }
    return g;
  }

  // A mountain silhouette: sky, snow caps, rock, then dark foreground, with a
  // little 2D noise so the ridgeline is not a pure 1D profile.
  function pTerrain(rand) {
    var g = newHalf();
    var detail = fbm(rand, 2, 2);
    var ridge = new Float64Array(HALF);
    for (var i = 0; i < HALF; i++) ridge[i] = rand();
    for (var pass = 0; pass < 3; pass++) {
      var smoothed = new Float64Array(HALF);
      for (var x = 0; x < HALF; x++) {
        var a = ridge[Math.max(0, x - 1)];
        var b = ridge[x];
        var c = ridge[Math.min(HALF - 1, x + 1)];
        smoothed[x] = (a + 2 * b + c) / 4;
      }
      ridge = smoothed;
    }
    var floor = 0.26 + rand() * 0.12;
    for (var y = 0; y < GRID; y++) {
      for (var x = 0; x < HALF; x++) {
        var t = ridge[x] * (y / (GRID - 1)) + (detail(x, y) - 0.5) * 0.14;
        if (t < floor) put(g, x, y, rand() < 0.09 ? K_HL : K_BG); // sky + stars
        else if (t < floor + 0.07) put(g, x, y, K_HL); // snow cap
        else if (t < floor + 0.3) put(g, x, y, K_FG); // rock
        else put(g, x, y, K_DARK); // foreground
      }
    }
    return g;
  }

  // Fractal noise quantised into four tones, with one contour line traced
  // through a single band - reads like a topographic map.
  function pNoise(rand) {
    var field = fbm(rand, 3, 2);
    var g = newHalf();
    var bands = [K_BG, K_DARK, K_FG, K_HL];
    for (var y = 0; y < GRID; y++) {
      for (var x = 0; x < HALF; x++) {
        var v = field(x, y);
        g[y * HALF + x] = bands[v < 0.42 ? 0 : v < 0.55 ? 1 : v < 0.7 ? 2 : 3];
      }
    }
    var snapshot = g.slice();
    var target = bands[1 + int(rand, 2)];
    for (var y2 = 0; y2 < GRID; y2++) {
      for (var x2 = 0; x2 < HALF; x2++) {
        if (snapshot[y2 * HALF + x2] !== target) continue;
        if (
          x2 > 0 && snapshot[y2 * HALF + x2 - 1] !== target
        ) {
          g[y2 * HALF + x2] = K_DARK;
        } else if (y2 > 0 && snapshot[(y2 - 1) * HALF + x2] !== target) {
          g[y2 * HALF + x2] = K_DARK;
        }
      }
    }
    return g;
  }

  var BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

  // Retro ordered-dithered orb: a radial falloff blurred with noise, then
  // quantised with a 4x4 Bayer matrix so the gradients break into dots.
  function pDither(rand) {
    var g = newHalf();
    var field = fbm(rand, 2, 3);
    var spread = 7 + rand() * 5;
    var ringAt = 3.5 + rand() * 3;
    for (var y = 0; y < GRID; y++) {
      for (var x = 0; x < HALF; x++) {
        var dx = AXIS - x;
        var dy = y - AXIS;
        var r = Math.sqrt(dx * dx + dy * dy);
        var bias = (BAYER4[(y & 3) * 4 + (x & 3)] - 7.5) / 16;
        var v = clamp01(0.62 * (1 - r / spread) + 0.38 * field(x, y)) + bias * 0.22;
        if (v < 0.28) put(g, x, y, K_DARK);
        else if (v < 0.42) put(g, x, y, K_BG);
        else if (v < 0.58) put(g, x, y, K_FG);
        else put(g, x, y, K_HL);
        // A dotted rim on one radius keeps the middle from going flat.
        if (r > ringAt && r < ringAt + 1.1 && (x + y) % 2 === 0) {
          put(g, x, y, K_DARK);
        }
      }
    }
    return g;
  }

  // Interference of four sine waves, quantised into bands.
  function pPlasma(rand) {
    var g = newHalf();
    var p = [rand() * 6.2832, rand() * 6.2832, rand() * 6.2832, rand() * 6.2832];
    var f = [
      0.35 + rand() * 0.5,
      0.25 + rand() * 0.45,
      0.2 + rand() * 0.4,
      0.5 + rand() * 0.6,
    ];
    for (var y = 0; y < GRID; y++) {
      for (var x = 0; x < HALF; x++) {
        var dx = AXIS - x;
        var dy = y - AXIS;
        var v =
          Math.sin(dx * f[0] * 1.7 + p[0]) +
          Math.sin(dy * f[1] * 1.7 + p[1]) +
          Math.sin((dx * 0.7 + dy * 0.7) * f[2] * 1.7 + p[2]) +
          Math.sin(Math.sqrt(dx * dx + dy * dy) * f[3] + p[3]);
        v = (v + 4) / 8;
        put(g, x, y, v < 0.33 ? K_BG : v < 0.5 ? K_DARK : v < 0.67 ? K_FG : K_HL);
      }
    }
    return g;
  }

  // Archimedean swirl. The arm count and twist are seeded so some read as a
  // pinwheel and others as a spiral shell.
  function pSwirl(rand) {
    var g = newHalf();
    var arms = 2 + int(rand, 3);
    var twist = 0.5 + rand() * 0.9;
    var freq = 0.8 + rand() * 0.7;
    for (var y = 0; y < GRID; y++) {
      for (var x = 0; x < HALF; x++) {
        var dx = AXIS - x;
        var dy = y - AXIS;
        var r = Math.sqrt(dx * dx + dy * dy);
        var a = Math.atan2(dy, dx);
        var t = (((r * freq - a * twist) / 6.2832) * arms) % 1;
        t = t < 0 ? t + 1 : t;
        put(g, x, y, t < 0.24 ? K_FG : t < 0.44 ? K_DARK : t < 0.64 ? K_HL : K_BG);
      }
    }
    rect(g, HALF - 1, Math.floor(AXIS), 1, 2, K_HL);
    return g;
  }

  // Stained-glass mosaic. Seed points are placed in the half and implicitly
  // mirrored, so the cell edges meet exactly on the axis.
  function pVoronoi(rand) {
    var g = newHalf();
    var n = 7 + int(rand, 5);
    var px = [];
    var py = [];
    var tone = [];
    for (var i = 0; i < n; i++) {
      px.push(rand() * HALF);
      py.push(rand() * GRID);
      tone.push(ink(rand, K_FG, K_DARK, K_HL));
    }
    for (var y = 0; y < GRID; y++) {
      for (var x = 0; x < HALF; x++) {
        var best = 0;
        var d1 = 1e9;
        var d2 = 1e9;
        for (var j = 0; j < n; j++) {
          var ay = py[j] - y;
          var ax = px[j] - x;
          var bx = GRID - 1 - px[j] - x;
          var a1 = ax * ax + ay * ay;
          var a2 = bx * bx + ay * ay;
          if (a1 < d1) {
            d2 = d1;
            d1 = a1;
            best = j;
          } else if (a1 < d2) d2 = a1;
          if (a2 < d1) {
            d2 = d1;
            d1 = a2;
            best = j;
          } else if (a2 < d2) d2 = a2;
        }
        var gap = Math.sqrt(d2) - Math.sqrt(d1);
        put(g, x, y, gap < 0.6 ? K_BG : tone[best]);
      }
    }
    return g;
  }

  // Basket weave: over/under alternates per 4x4 block, with a highlight on
  // roughly one thread in five.
  function pWeave(rand) {
    var g = newHalf();
    var T = 4;
    for (var by = 0; by * T < GRID; by++) {
      for (var bx = 0; bx * T < HALF; bx++) {
        var warpOver = ((bx + by) & 1) === 1;
        var accent = rand() < 0.2;
        for (var ty = 0; ty < T; ty++) {
          for (var tx = 0; tx < T; tx++) {
            var weft = ty === 1 || ty === 2; // horizontal thread
            var warp = tx === 1 || tx === 2; // vertical thread
            var top = accent ? K_HL : K_FG;
            put(g, bx * T + tx, by * T + ty, warpOver
              ? warp
                ? top
                : weft
                  ? K_DARK
                  : K_BG
              : weft
                ? top
                : warp
                  ? K_DARK
                  : K_BG);
          }
        }
      }
    }
    return g;
  }

  // Patchwork: every 4x4 block picks a seeded base + accent ink and one of six
  // block motifs.
  function pQuilt(rand) {
    var g = newHalf();
    var T = 4;
    var tones = [K_FG, K_DARK, K_HL];
    for (var by = 0; by * T < GRID; by++) {
      for (var bx = 0; bx * T < HALF; bx++) {
        var base = tones[int(rand, 3)];
        var altBase = tones[int(rand, 3)];
        var alt = base === altBase ? tones[(tones.indexOf(altBase) + 1) % 3] : altBase;
        var motif = int(rand, 6);
        for (var ty = 0; ty < T; ty++) {
          for (var tx = 0; tx < T; tx++) {
            var k = base;
            if (motif === 1) {
              if (tx < T / 2) k = alt;
            } else if (motif === 2) {
              if (tx === ty) k = alt;
            } else if (motif === 3) {
              if (tx + ty === T - 1) k = alt;
            } else if (motif === 4) {
              if (((tx >> 1) + (ty >> 1)) & 1) k = alt;
            } else if (motif === 5) {
              if (tx + ty < 2 || (tx >= 2 && ty >= 2)) k = alt;
            }
            put(g, bx * T + tx, by * T + ty, k);
          }
        }
      }
    }
    return g;
  }

  // PCB-style traces on a sparse solder-point substrate. Run start points are
  // spread down the field so the board never ends up half empty.
  function pCircuit(rand) {
    var g = newHalf();
    for (var y = 0; y < GRID; y++) {
      for (var x = 0; x < HALF; x++) {
        if (x % 4 === 3 && y % 4 === 3) put(g, x, y, K_DARK);
      }
    }
    // One seeded edge rail, mirrored into a full border trace.
    var rail = int(rand, 4);
    for (var i = 0; i < GRID; i++) {
      if (rail === 0) put(g, 0, i, K_FG);
      else if (rail === 1) put(g, HALF - 1, i, K_FG);
      else if (rail === 2) put(g, i, 0, K_FG);
      else put(g, i, GRID - 1, K_FG);
    }
    var runs = 5 + int(rand, 4);
    for (var r = 0; r < runs; r++) {
      var px = int(rand, HALF);
      var py = Math.min(GRID - 1, Math.floor(((r + rand()) * GRID) / runs));
      var dir = int(rand, 4);
      var steps = 6 + int(rand, 12);
      for (var s = 0; s < steps; s++) {
        if (px < 0 || py < 0 || px >= HALF || py >= GRID) break;
        put(g, px, py, K_FG);
        if (rand() < 0.28) dir = (dir + (rand() < 0.5 ? 1 : 3)) & 3;
        px += DX[dir];
        py += DY[dir];
      }
      // 2x2 connector pad where the trace stops
      rect(g, px - 1, py - 1, 2, 2, K_HL);
    }
    return g;
  }

  var GENERATORS = {
    mix: pMix,
    checker: pChecker,
    stripes: pStripes,
    rings: pRings,
    circle: pCircle,
    diamond: pDiamond,
    cross: pCross,
    dots: pDots,
    grid: pGrid,
    heart: pHeart,
    face: pFace,
    maze: pMaze,
    terrain: pTerrain,
    noise: pNoise,
    dither: pDither,
    plasma: pPlasma,
    swirl: pSwirl,
    voronoi: pVoronoi,
    weave: pWeave,
    quilt: pQuilt,
    circuit: pCircuit,
  };

  // ---------- hashing / randomness ----------

  // FNV-1a 32-bit.
  function fnv1a(str) {
    var hash = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
  }

  // mulberry32 PRNG, seeded from the FNV-1a hash of a seed string.
  function seedRng(seedStr) {
    var s = fnv1a(String(seedStr));
    return function mulberry32() {
      s = (s + 0x6d2b79f5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- colors ----------

  function hslToRgb(h, s, l) {
    h = ((h % 1) + 1) % 1;
    var c = (1 - Math.abs(2 * l - 1)) * s;
    var x = c * (1 - Math.abs(((h * 6) % 2) - 1));
    var m = l - c / 2;
    var r = 0;
    var g = 0;
    var b = 0;
    if (h < 1 / 6) [r, g, b] = [c, x, 0];
    else if (h < 2 / 6) [r, g, b] = [x, c, 0];
    else if (h < 3 / 6) [r, g, b] = [0, c, x];
    else if (h < 4 / 6) [r, g, b] = [0, x, c];
    else if (h < 5 / 6) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    return [
      Math.round((r + m) * 255),
      Math.round((g + m) * 255),
      Math.round((b + m) * 255),
    ];
  }

  // Normalize a color to a hue in [0, 360) or a named palette. null if invalid.
  function sanitizeColor(value) {
    if (MONO_COLORS.indexOf(value) !== -1) return value;
    var n = Number(value);
    if (!Number.isFinite(n)) return null;
    return ((n % 360) + 360) % 360;
  }

  function sanitizeHue(value) {
    var n = Number(value);
    if (!Number.isFinite(n)) return null;
    return ((n % 360) + 360) % 360;
  }

  function sanitizePattern(value) {
    if (value === "random") value = LEGACY_PATTERN_ALIASES.random;
    return PATTERNS.indexOf(value) !== -1 ? value : null;
  }

  // The default hue for a player with no saved settings.
  function baseHueFor(seedStr) {
    return Math.floor(seedRng(String(seedStr) + "::hue")() * 360);
  }

  function slugify(name) {
    var slug = String(name || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
    return slug || "guest";
  }

  var NAMED_PALETTES = {
    black: { fg: [23, 26, 34], dark: [7, 8, 12], hl: [132, 138, 154], bg: [242, 243, 247] },
    white: { fg: [247, 248, 250], dark: [196, 200, 210], hl: [255, 255, 255], bg: [104, 109, 124] },
    cyberpunk: { fg: [255, 0, 127], dark: [40, 10, 60], hl: [0, 240, 255], bg: [15, 10, 25] },
    sunset: { fg: [255, 107, 107], dark: [78, 205, 196], hl: [255, 230, 109], bg: [44, 62, 80] },
    neon: { fg: [57, 255, 20], dark: [20, 20, 20], hl: [255, 0, 255], bg: [5, 5, 5] },
    emerald: { fg: [46, 204, 113], dark: [22, 160, 133], hl: [241, 196, 15], bg: [236, 240, 241] },
  };

  // Resolve the 4-colour palette (fg / dark / hl / bg) for a color.
  function paletteFor(color) {
    var named = NAMED_PALETTES[color];
    if (named) return named;
    var hueFrac = (sanitizeColor(color) || 0) / 360;
    return {
      fg: hslToRgb(hueFrac, 0.62, 0.46),
      dark: hslToRgb((hueFrac + 0.015) % 1, 0.55, 0.28),
      hl: hslToRgb((hueFrac + 0.02) % 1, 0.55, 0.68),
      bg: hslToRgb(hueFrac, 0.45, 0.93),
    };
  }

  // ---------- sprite ----------

  // Builds a GRID x GRID sprite map of color keys: "fg" | "dark" | "hl" | null.
  // `seedStr` must already include the color + pattern; patterns paint the left
  // half only and the result is mirrored, so every avatar is symmetric.
  function buildIdenticon(seedStr, pattern) {
    var id = sanitizePattern(pattern) || DEFAULT_PATTERN;
    var half = GENERATORS[id](seedRng(seedStr));
    var out = new Array(GRID * GRID);
    for (var y = 0; y < GRID; y++) {
      for (var x = 0; x < GRID; x++) {
        var cx = x < HALF ? x : GRID - 1 - x;
        out[y * GRID + x] = KEYS[half[y * HALF + cx]];
      }
    }
    return out;
  }

  // Resolve the effective color/pattern/seed for a name. `opts` may carry
  // { color | hue, pattern }; anything missing falls back to a name-derived
  // default, which is also what the server stores in avatar-settings.json.
  function resolveSpec(name, opts) {
    var explicit =
      opts && opts.color !== undefined && opts.color !== null
        ? opts.color
        : opts && typeof opts.hue === "number"
          ? opts.hue
          : null;
    var pattern = sanitizePattern(opts && opts.pattern) || DEFAULT_PATTERN;
    var color = explicit != null ? sanitizeColor(explicit) : null;
    if (color == null) color = baseHueFor(String(name));
    var seed =
      explicit != null
        ? String(name) +
          "|" +
          (typeof color === "string" ? color : Math.round(color)) +
          "|" +
          pattern
        : String(name) + "::legacy";
    return { color: color, pattern: pattern, seed: seed };
  }

  // One-shot: name + options -> { color, pattern, grid }.
  function generateGrid(name, opts) {
    var spec = resolveSpec(name, opts);
    return {
      color: spec.color,
      pattern: spec.pattern,
      grid: buildIdenticon(spec.seed, spec.pattern),
    };
  }

  return {
    GRID: GRID,
    HALF: HALF,
    SCALE: SCALE,
    KEYS: KEYS,
    PATTERNS: PATTERNS,
    PATTERN_LIST: PATTERN_LIST,
    MONO_COLORS: MONO_COLORS,
    AVATAR_GEN_VERSION: AVATAR_GEN_VERSION,
    DEFAULT_PATTERN: DEFAULT_PATTERN,
    fnv1a: fnv1a,
    seedRng: seedRng,
    hslToRgb: hslToRgb,
    sanitizeColor: sanitizeColor,
    sanitizeHue: sanitizeHue,
    sanitizePattern: sanitizePattern,
    baseHueFor: baseHueFor,
    slugify: slugify,
    paletteFor: paletteFor,
    buildIdenticon: buildIdenticon,
    resolveSpec: resolveSpec,
    generateGrid: generateGrid,
  };
});
