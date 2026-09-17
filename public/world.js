// Simple tile-based world demo built with Phaser 3.
// Includes hide-and-seek hiding spots: walk into tall grass (B) to hide.
(function () {
  "use strict";

  const TILE = 32;
  const FACES = ["🙂", "😀", "😎", "🤖"];

  // Tile ids: 0 grass, 1 water, 2 tree, 3 sand, 4 rock, 5 flower, 6 bush.
  const BUSH = 6;
  const MAP_W = 20;
  const MAP_H = 16;

  // Static decorations placed on the grass grid as [y, x, tile].
  // Trees (2), sand (3), rocks (4) and flowers (5); border is water (1).
  const PLACEMENTS = [
    [1, 14, 2], [1, 15, 4],
    [2, 2, 2], [2, 5, 3], [2, 10, 4], [2, 15, 4],
    [3, 9, 4], [3, 12, 3],
    [4, 5, 2], [4, 14, 2], [4, 17, 3],
    [5, 9, 5],
    [6, 2, 4], [6, 6, 3], [6, 10, 2], [6, 14, 3],
    [7, 12, 5],
    [8, 2, 3], [8, 6, 2], [8, 13, 4],
    [9, 14, 2],
    [10, 3, 2], [10, 6, 3],
    [11, 12, 5], [11, 15, 4],
    [12, 9, 3], [12, 16, 3],
    [13, 2, 2], [13, 12, 2],
  ];

  function buildLevel() {
    const grid = [];
    for (let y = 0; y < MAP_H; y++) {
      const row = [];
      for (let x = 0; x < MAP_W; x++) {
        row.push(y === 0 || y === MAP_H - 1 || x === 0 || x === MAP_W - 1 ? 1 : 0);
      }
      grid.push(row);
    }
    for (const [y, x, t] of PLACEMENTS) {
      if (grid[y] && grid[y][x] === 0) grid[y][x] = t;
    }
    return grid;
  }

  const mapData = buildLevel();

  // Deterministic PRNG so the bush layout is stable between reloads.
  function makeRng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function scatterBushes() {
    const rng = makeRng(20260916);
    const h = mapData.length;
    const w = mapData[0].length;

    // Pass 1: sprinkle seed bushes onto plain grass (0).
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (mapData[y][x] === 0 && rng() < 0.13) {
          mapData[y][x] = BUSH;
        }
      }
    }
    // Pass 2: grow bushes next to existing bushes to form hideable thickets.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (mapData[y][x] !== 0) continue;
        const near =
          (y > 0 && mapData[y - 1][x] === BUSH) ||
          (y < h - 1 && mapData[y + 1][x] === BUSH) ||
          (x > 0 && mapData[y][x - 1] === BUSH) ||
          (x < w - 1 && mapData[y][x + 1] === BUSH);
        if (near && rng() < 0.5) {
          mapData[y][x] = BUSH;
        }
      }
    }
  }

  scatterBushes();

  // Find a walkable spawn tile.
  function findSpawn(predicate) {
    for (let y = 1; y < mapData.length; y++) {
      for (let x = 1; x < mapData[y].length; x++) {
        if (!predicate || predicate(mapData[y][x])) {
          return { x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 };
        }
      }
    }
    return { x: TILE * 1.5, y: TILE * 1.5 };
  }

  // Walkable: grass, sand, flowers and bushes (not water/trees/rocks).
  function tileWalkable(t) {
    return t !== 1 && t !== 2 && t !== 4;
  }

  // A* over the tile grid, 4-directional (movement is tile-aligned).
  function aStarPath(sx, sy, gx, gy) {
    if (sx === gx && sy === gy) return [];
    if (!tileWalkable(mapData[gy][gx])) return [];

    const size = MAP_W * MAP_H;
    const idx = (x, y) => y * MAP_W + x;
    const came = new Int32Array(size).fill(-1);
    const gScore = new Float64Array(size).fill(Infinity);
    const fScore = new Float64Array(size).fill(Infinity);
    const closed = new Uint8Array(size);
    const heu = (x, y) => Math.abs(x - gx) + Math.abs(y - gy);

    const startCell = idx(sx, sy);
    const goalCell = idx(gx, gy);
    gScore[startCell] = 0;
    fScore[startCell] = heu(sx, sy);
    const open = [startCell];

    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

    while (open.length) {
      // Tiny map, so a linear lowest-fScore scan is plenty fast.
      let best = 0;
      for (let i = 1; i < open.length; i++) {
        if (fScore[open[i]] < fScore[open[best]]) best = i;
      }
      const cur = open.splice(best, 1)[0];
      if (cur === goalCell) {
        const path = [];
        let c = cur;
        // Exclude the start cell so the seeker aims at the first move,
        // not back at the tile it is already standing on.
        while (c !== -1 && c !== startCell) {
          path.unshift({ x: c % MAP_W, y: (c / MAP_W) | 0 });
          c = came[c];
        }
        return path;
      }
      closed[cur] = 1;
      const cx = cur % MAP_W;
      const cy = (cur / MAP_W) | 0;
      for (const [dx, dy] of dirs) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
        if (!tileWalkable(mapData[ny][nx]) || closed[idx(nx, ny)]) continue;
        const nk = idx(nx, ny);
        const ng = gScore[cur] + 1;
        if (ng < gScore[nk]) {
          gScore[nk] = ng;
          fScore[nk] = ng + heu(nx, ny);
          came[nk] = cur;
          if (open.indexOf(nk) === -1) open.push(nk);
        }
      }
    }
    return [];
  }

  function drawGrass(ctx, x, y) {
    ctx.fillStyle = "#6da74d";
    ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    for (let i = 0; i < 4; i++) {
      const gx = x + Math.random() * TILE;
      const gy = y + Math.random() * TILE;
      ctx.fillRect(gx, gy, 3, 3);
    }
  }

  function drawWater(ctx, x, y) {
    ctx.fillStyle = "#3b82c4";
    ctx.fillRect(x, y, TILE, TILE);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 2; i++) {
      const wy = y + 8 + i * 13;
      ctx.beginPath();
      ctx.moveTo(x + 4, wy);
      ctx.quadraticCurveTo(x + 12, wy - 4, x + 20, wy);
      ctx.quadraticCurveTo(x + 26, wy + 4, x + 30, wy);
      ctx.stroke();
    }
  }

  function drawTree(ctx, x, y) {
    drawGrass(ctx, x, y);
    ctx.fillStyle = "#7a5230";
    ctx.fillRect(x + 13, y + 19, 6, 12);
    ctx.fillStyle = "#2e7d32";
    ctx.beginPath();
    ctx.arc(x + 16, y + 14, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#43a047";
    ctx.beginPath();
    ctx.arc(x + 12, y + 12, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawSand(ctx, x, y) {
    ctx.fillStyle = "#e6cf8c";
    ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = "rgba(160,120,60,0.25)";
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(x + Math.random() * TILE, y + Math.random() * TILE, 3, 2);
    }
  }

  function drawRock(ctx, x, y) {
    drawGrass(ctx, x, y);
    ctx.fillStyle = "#8d99a6";
    ctx.beginPath();
    ctx.ellipse(x + 16, y + 18, 10, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.ellipse(x + 13, y + 15, 4, 3, -0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawFlower(ctx, x, y) {
    drawGrass(ctx, x, y);
    ctx.fillStyle = "#e91e63";
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      ctx.beginPath();
      ctx.arc(x + 16 + Math.cos(a) * 4, y + 16 + Math.sin(a) * 4, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#ffeb3b";
    ctx.beginPath();
    ctx.arc(x + 16, y + 16, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBush(ctx, x, y) {
    drawGrass(ctx, x, y);
    // Tall grass clusters in three shades so the bush reads as "hideable".
    ctx.fillStyle = "#3f9142";
    ctx.beginPath();
    ctx.ellipse(x + 9, y + 18, 9, 11, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2f7d54";
    ctx.beginPath();
    ctx.ellipse(x + 24, y + 19, 9, 11, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#57b05f";
    ctx.beginPath();
    ctx.ellipse(x + 16, y + 13, 8, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    for (let i = 0; i < 5; i++) {
      ctx.fillRect(x + 4 + Math.random() * 24, y + 6 + Math.random() * 20, 2, 4);
    }
  }

  // Builds the packed tileset texture plus emoji textures at runtime.
  function makeTextures(scene) {
    const canvas = document.createElement("canvas");
    canvas.width = TILE * 7;
    canvas.height = TILE;
    const g = canvas.getContext("2d");

    drawGrass(g, TILE * 0, 0);
    drawWater(g, TILE * 1, 0);
    drawTree(g, TILE * 2, 0);
    drawSand(g, TILE * 3, 0);
    drawRock(g, TILE * 4, 0);
    drawFlower(g, TILE * 5, 0);
    drawBush(g, TILE * 6, 0);

    scene.textures.addCanvas("tiles", canvas);

    const face = addEmojiTexture(scene, "face", FACES[Math.floor(Math.random() * FACES.length)]);
    addEmojiTexture(scene, "eyes", "👀");
    void face;
  }

  function addEmojiTexture(scene, key, emoji) {
    const canvas = document.createElement("canvas");
    canvas.width = TILE;
    canvas.height = TILE;
    const fg = canvas.getContext("2d");
    fg.font = '24px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    fg.textAlign = "center";
    fg.textBaseline = "middle";
    fg.fillText(emoji, TILE / 2, TILE / 2 + 1);
    scene.textures.addCanvas(key, canvas);
  }

  let scene;

  const config = {
    type: Phaser.AUTO,
    parent: "game-container",
    width: 800,
    height: 600,
    backgroundColor: "#1c2733",
    physics: {
      default: "arcade",
      arcade: { gravity: 0, debug: false },
    },
    scene: {
      create() {
        scene = this;

        makeTextures(this);

        const map = this.make.tilemap({ data: mapData, tileWidth: TILE, tileHeight: TILE });
        const tileset = map.addTilesetImage("tiles", "tiles", TILE, TILE);
        const layer = map.createLayer(0, tileset, 0, 0);
        this.layer = layer;

        // Water, trees, and rocks block movement. Bushes are walk-through.
        layer.setCollision([1, 2, 4]);

        const spawn = findSpawn(function (t) {
          return t === 0;
        });
        const player = this.physics.add.image(spawn.x, spawn.y, "face").setDepth(1);
        player.body.setSize(TILE - 6, TILE - 6);
        player.body.setOffset(3, 3);
        player.setCollideWorldBounds(true);
        player.isHidden = false; // hook for multiplayer sync later
        this.physics.add.collider(player, layer);
        this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

        this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
        this.cameras.main.startFollow(player, true, 0.14, 0.14);

        // Roaming seeker (demo stand-in for the second player).
        const seekSpawn = findSpawn(function (t) {
          return t === 0;
        });
        const seeker = this.physics.add.image(seekSpawn.x + TILE * 10, seekSpawn.y + TILE * 8, "eyes").setDepth(1);
        seeker.body.setSize(TILE - 6, TILE - 6);
        seeker.body.setOffset(3, 3);
        seeker.setCollideWorldBounds(true);
        seeker.setBounce(1);
        this.physics.add.collider(seeker, layer);
        this.seeker = seeker;
        this.seekerRetarget = 0;
        this.foundCooldown = 0;
        this.path = [];
        this.pathIndex = 0;
        this.sinceRepath = 0;
        this.lastGoalTile = null;
        this.lastSeekerTile = null;
        this.onTileMs = 0;
        this.seekerSpeed = 95;

        this.cursors = this.input.keyboard.createCursorKeys();
        this.wasd = this.input.keyboard.addKeys("W,A,S,D");

        this.player = player;
        this.speed = 220;

        this.hint = this.add
          .text(16, 16, "Arrow keys / WASD to move — find tall grass to hide", {
            fontSize: "14px",
            fill: "#0f172a",
            backgroundColor: "rgba(255,255,255,0.85)",
            padding: { x: 10, y: 6 },
          })
          .setScrollFactor(0)
          .setDepth(5);

        this.status = this.add
          .text(16, 46, "", {
            fontSize: "14px",
            fill: "#ffffff",
            backgroundColor: "rgba(15,23,42,0.75)",
            padding: { x: 10, y: 5 },
          })
          .setScrollFactor(0)
          .setDepth(5);

        // Caption shown above the emoji while hidden.
        this.hiddenCaption = this.add
          .text(0, 0, "Hidden 🫥", {
            fontSize: "12px",
            fill: "#ffffff",
            stroke: "#000000",
            strokeThickness: 3,
          })
          .setOrigin(0.5)
          .setDepth(3)
          .setVisible(false);

        // Bubble shown above the seeker.
        this.seekerBubble = this.add
          .text(0, 0, "", {
            fontSize: "13px",
            fill: "#ffffff",
            stroke: "#111827",
            strokeThickness: 3,
          })
          .setOrigin(0.5)
          .setDepth(3)
          .setVisible(false);

        // Custom methods must be attached to the scene instance — Phaser
        // only copies lifecycle callbacks (create/update/...) from the
        // scene config object.
        this.setHidden = function (hidden) {
          if (this.player.isHidden === hidden) return;
          this.player.isHidden = hidden;
          this.player.setAlpha(hidden ? 0.22 : 1);
          this.hiddenCaption.setVisible(hidden);
          if (hidden) {
            this.player.setDepth(3); // duck under the grass
          } else {
            this.player.setDepth(1);
          }
        };
      },

      update(time, delta) {
        const p = this.player;
        const left = this.cursors.left.isDown || this.wasd.A.isDown;
        const right = this.cursors.right.isDown || this.wasd.D.isDown;
        const up = this.cursors.up.isDown || this.wasd.W.isDown;
        const down = this.cursors.down.isDown || this.wasd.S.isDown;

        let vx = 0;
        let vy = 0;
        if (left) vx -= 1;
        if (right) vx += 1;
        if (up) vy -= 1;
        if (down) vy += 1;

        // Keep diagonal movement at the same speed.
        if (vx !== 0 && vy !== 0) {
          vx *= 0.7071;
          vy *= 0.7071;
        }

        p.setVelocity(vx * this.speed, vy * this.speed);

        if (vx < 0) p.setFlipX(true);
        else if (vx > 0) p.setFlipX(false);

        // --- Hiding: standing in a bush makes you invisible ---
        const tile = this.layer.getTileAtWorldXY(p.x, p.y);
        const onBush = !!(tile && tile.index === BUSH);
        this.setHidden(onBush);

        // --- HUD status ---
        this.status.setText(
          p.isHidden ? "Status: Hidden 🫥 (walk out of the grass to be seen)" : "Status: Visible",
        );

        // Caption follows the player while hidden.
        if (p.isHidden) {
          this.hiddenCaption.setPosition(p.x, p.y - 26);
        }

        // --- Seeker: A* chase while the player is visible ---
        const seekerTile = {
          x: Math.floor(this.seeker.x / TILE),
          y: Math.floor(this.seeker.y / TILE),
        };
        const playerTile = {
          x: Math.floor(p.x / TILE),
          y: Math.floor(p.y / TILE),
        };
        const chase = !p.isHidden;

        // Track how long the seeker has been on its current tile, so we can
        // detect being pinned against a wall and force a repath.
        const seekerMoved =
          this.lastSeekerTile &&
          (this.lastSeekerTile.x !== seekerTile.x || this.lastSeekerTile.y !== seekerTile.y);
        if (!this.lastSeekerTile || seekerMoved) this.onTileMs = 0;
        this.onTileMs += delta;
        this.lastSeekerTile = seekerTile;

        // Repath only when something actually changed: player moved to another
        // tile, the current path was fully walked, or the seeker is stuck.
        const goalChanged =
          !this.lastGoalTile ||
          this.lastGoalTile.x !== playerTile.x ||
          this.lastGoalTile.y !== playerTile.y;
        const arrived = this.path.length === 0;
        const stuck = this.path.length > 0 && this.onTileMs > 2500;

        if (chase) {
          this.sinceRepath += delta;
          if (
            goalChanged ||
            (arrived && this.sinceRepath > 400) ||
            (stuck && this.sinceRepath > 200)
          ) {
            this.path = aStarPath(seekerTile.x, seekerTile.y, playerTile.x, playerTile.y);
            this.pathIndex = 0;
            this.lastGoalTile = playerTile;
            this.sinceRepath = 0;
            this.onTileMs = 0;
          }
        }

        if (this.path.length) {
          const way = this.path[Math.min(this.pathIndex, this.path.length - 1)];
          const wx = way.x * TILE + TILE / 2;
          const wy = way.y * TILE + TILE / 2;
          const dx = wx - this.seeker.x;
          const dy = wy - this.seeker.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 6) {
            this.pathIndex++;
            if (this.pathIndex >= this.path.length) {
              // Reached the end (e.g. last known position while hidden).
              this.path = [];
              this.pathIndex = 0;
              this.seeker.setVelocity(0, 0);
            }
          } else {
            this.seeker.setVelocity((dx / dist) * this.seekerSpeed, (dy / dist) * this.seekerSpeed);
          }
        } else if (chase) {
          // Visible but no current route: stand by; the 400ms retry will
          // re-plan as soon as the player changes tile.
          this.seeker.setVelocity(0, 0);
        } else {
          // Hidden and off the path: wander aimlessly.
          this.seekerRetarget -= delta;
          if (this.seekerRetarget <= 0) {
            this.seekerRetarget = 2000 + Math.random() * 2000;
            const dir = Math.random() * Math.PI * 2;
            this.seeker.setVelocity(Math.cos(dir) * 95, Math.sin(dir) * 95);
          }
        }
        void time;

        const d = Phaser.Math.Distance.Between(p.x, p.y, this.seeker.x, this.seeker.y);
        const bubbleText = this.seekerBubble;
        if (d < 46) {
          if (p.isHidden) {
            bubbleText.setText("…?");
          } else if (this.foundCooldown <= 0) {
            bubbleText.setText("FOUND YOU!");
            this.foundCooldown = 2500;
          }
        }
        if (this.foundCooldown > 0) this.foundCooldown -= delta;
        bubbleText.setVisible(bubbleText.text.length > 0);
        bubbleText.setPosition(this.seeker.x, this.seeker.y - 26);
        if (bubbleText.text === "FOUND YOU!" && this.foundCooldown <= 0) {
          bubbleText.setText("").setVisible(false);
        }
      },
    },
  };

  new Phaser.Game(config);

  if (typeof window !== "undefined") {
    window.phaserWorldScene = () => scene;
    window.phaserSetHidden = (h) => scene && scene.setHidden(h);
  }
})();