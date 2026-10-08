// Generates GATEBREAKER (examples/gatebreaker/gatebreaker.json): the M1
// opening and the M2 loop from docs/gatebreaker/GAME_DESIGN.md.
//
// - The prologue panels play over a night plaza with the Double Gate; that
//   plaza is then the hub (the Hunter Association's square): the Gate Board,
//   the smith, the training mat for the Daily Quest, and the door home.
// - Seven Gates, each a line of rooms that seal and open, ending in a boss:
//   the Goblin Cave (E, with the tutorial on the first run), the Subway
//   Tunnel (E), the Goblin Fortress (D, the rank-up test), the Flooded
//   Temple (C, which ranks a D hunter C), the Ice Fortress (the B-rank
//   test), the Bloodstone Citadel (the A-rank test) and the Eclipse Spire
//   (the S-rank test).
// - Enemies are prefabs the Director spawns room by room, so every Gate can
//   be run again.
//
// Three scripts run it: lua/director.lua (the opening and the Gate runs),
// lua/hub.lua (the hub's stations and the Daily Quest drill) and
// lua/ledger.lua (levels, stats, gold, quests, menus and the save). Run from
// apps/editor:
//
//   npm run gatebreaker
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { validateSceneDocument } from "../../apps/editor/src/scene/SceneSerializer";
import type { SceneDocument } from "../../apps/editor/src/scene/SceneSerializer";
import { type Components, ROOT, SceneBuilder, type V3, modelBounds, modelId, rgb, vec } from "./kit";
import { DISTRICT, buildDistrict } from "./district";
import { modelCatalog } from "../../apps/editor/src/scene/modelCatalog";
import { instanceBox, parseModelInstances } from "../../apps/editor/src/editor/modelInstances";

const scene = new SceneBuilder();
const lua = (file: string) => readFileSync(join(ROOT, "tools/gatebreaker/lua", file), "utf8");
const dungeon = (kind: string) => modelId(kind);
// The floor tile's top is 5 cm above its origin: sunk to 1 cm above the
// ground the fighters stand on (y = 0). Not flush: the editor's shadow
// plane lies at y = 0 and would z-fight with it.
const FLOOR = -0.04;

// -- Look -----------------------------------------------------------------
scene.add("Environment", [0, 0, 0], {
  Environment: {
    sky: "Color",
    skyColor: rgb("#0a0d1f"),
    sunElevation: 70,
    sunAzimuth: 200,
    // Night, but everything readable: a bright cool moon and a strong
    // ambient fill, with the torches adding warm pools on top.
    sunIntensity: 1.4,
    sunColor: rgb("#c4ccff"),
    ambientIntensity: 1.25,
    fog: "Exponential",
    fogColor: rgb("#0b0a12"),
    fogDensity: 0.011,
    shadows: true,
    exposure: 1.2,
  },
});
scene.add("Look", [0, 0, 0], {
  PostProcessing: {
    style: "Manhwa",
    ink: 1,
    rim: 0.7,
    antialias: "SMAA",
    ambientOcclusion: false,
    bloom: 0.6,
    bloomRadius: 0.4,
    bloomThreshold: 0.8,
    contrast: 0.1,
    saturation: 0.12,
    vignette: 0.3,
    shadowQuality: "Medium",
  },
});

// -- Controls (GAME_DESIGN.md 5.1) ----------------------------------------------
scene.add("Input", [0, 0, 0], {
  InputActions: {
    bindings: [
      "move_x: d, -a, right, -left, pad_lx",
      "move_y: w, -s, up, -down, -pad_ly",
      "look_x: mouse_dx*0.05, pad_rx",
      "look_y: mouse_dy*0.05, pad_ry",
      "light: mouse_left, pad_x",
      "heavy: mouse_right, pad_y",
      "dodge: space, pad_a",
      "block: shift, pad_lb",
      "skill1: q, pad_rb",
      "skill2: e, pad_b",
      "skill3: r, pad_lt",
      "ultimate: f, pad_rt",
      "lock: tab, mouse_middle, pad_rs",
      "interact: g",
    ].join("\n") + "\n",
  },
});
scene.add("Controls", [0, 0, 0], {
  UI: {
    // Two lines, so both clear the minimap (top right) on a 960 px screen.
    text: "LMB attack · RMB heavy · Space dodge · Shift block/parry · Q E R skills · F ultimate\nTab lock · G use · C status · I bag · J quests · M map",
    anchor: "top-center",
    offsetY: 14,
    fontSize: 12,
    color: vec(1, 1, 1),
    opacity: 0.7,
  },
});
// The quest tracker (at most 3 lines), left of centre: clear of the
// Ledger's windows (top centre), the bars (bottom left) and, on a 960 x 540
// screen, the Hunter line under the minimap.
scene.add("Objective", [0, 0, 0], {
  UI: { text: "", anchor: "middle-left", offsetX: 18, offsetY: -70, fontSize: 15, width: 240, color: vec(0.75, 0.88, 1), opacity: 0.95 },
});
// Level, rank, gold and fangs, kept up to date by the Ledger: under the
// minimap (top right, 210 px at its largest).
scene.add("Hunter", [0, 0, 0], {
  UI: { text: "", anchor: "top-right", offsetX: -18, offsetY: 230, fontSize: 15, color: vec(0.95, 0.85, 0.55), opacity: 0.95 },
});
// "G: Gate Board" and the like, near a hub station.
scene.add("Prompt", [0, 0, 0], {
  UI: { text: "", anchor: "bottom-center", offsetY: -120, fontSize: 18, color: vec(1, 1, 1), opacity: 0.95 },
});
// The pick-up feed (the Ledger): three lines, bottom right, newest lowest.
// (Offsets are +x right, +y down from the anchor.)
for (const k of [1, 2, 3])
  scene.add(`Feed ${k}`, [0, 0, 0], {
    UI: { text: "", anchor: "bottom-right", offsetX: -6, offsetY: -(90 + (k - 1) * 26), fontSize: 17, color: vec(1, 1, 1), opacity: 0.95 },
  });
scene.add("Director", [0, 0, 0], { Script: { source: lua("director.lua"), props: { fast: false } } });
scene.add("Hub", [0, 0, 0], { Script: { source: lua("hub.lua"), props: { fast: false } } });
scene.add("Ledger", [0, 0, 0], { Script: { source: lua("ledger.lua"), props: { fast: false } } });

// One collision slab under everything (the tiles are only looks): the hub
// (z 35..85) and the five Gates (x -255..255, z -120..10).
scene.add("Ground", [0, -0.5, -35], {
  Scale: { value: vec(540, 1, 250) },
  Renderable: { mesh: 0, material: 0, visible: false },
  RigidBody: { dynamic: false },
  Collider: { type: "AABB" },
});

// -- Rooms ------------------------------------------------------------------
// A Gate's walls, floors, torches and props are drawn instanced
// (ModelInstances): one entity per Gate and height instead of one per
// piece, so five Gates fit under the engine's 1024 entities. Solid pieces
// collide with their footprint. What moves or glows (seals, flames, lights)
// stays an entity of its own.
const sets = new Map<string, { y: number; lines: string[] }>();
let setName = "";
// An instance stands on its model's bottom, not its origin: these pieces'
// origins are above or below their bottoms (metres), so their set is moved
// by that much to keep the origin at the height asked for.
const BOTTOM = new Map<number, number>(
  (
    [
      ["floor-tile-large", -0.1],
      ["banner-patternA-red", 0.531],
      ["sword-shield-broken", -0.793],
      ["torch-mounted", -0.381],
    ] as const
  ).map(([name, bottom]) => [dungeon(name), bottom]),
);
function place(id: number, x: number, z: number, yaw = 0, solid = true, origin = 0) {
  const y = Number((origin + (BOTTOM.get(id) ?? 0)).toFixed(3));
  const key = `${setName} ${origin === 0 && y === 0 ? "pieces" : origin === FLOOR ? "floor" : `at ${y}`}`;
  let set = sets.get(key);
  if (!set) sets.set(key, (set = { y, lines: [] }));
  const deg = ((yaw * 180) / Math.PI).toFixed(1);
  set.lines.push(`${id} ${x.toFixed(2)} ${z.toFixed(2)} ${deg}${solid ? " solid" : ""}`);
}
function flushSets() {
  for (const [name, set] of sets) scene.add(name, [0, set.y, 0], { ModelInstances: { instances: set.lines.join("\n") } });
  sets.clear();
}

type Theme = { walls: string[]; floor: string; torch: string };
const CAVE: Theme = { walls: ["wall", "wall-cracked", "wall-arched", "wall", "wall-cracked", "wall-arched", "wall"], floor: "floor-tile-large", torch: "#ff9a4a" };
const TUNNEL: Theme = { walls: ["wall-gated", "wall", "wall-gated", "wall-cracked", "wall", "wall-gated", "wall"], floor: "floor-tile-large", torch: "#a8d8ff" };
const FORT: Theme = { walls: ["wall-pillar", "wall", "wall-arched", "wall-pillar", "wall", "wall-arched", "wall-pillar"], floor: "floor-tile-large", torch: "#ff6a3a" };
const TEMPLE: Theme = { walls: ["wall-arched", "wall-pillar", "wall-cracked", "wall-arched", "wall", "wall-pillar", "wall-cracked"], floor: "floor-tile-large", torch: "#3fd8c8" };
const ICE: Theme = { walls: ["wall-gated", "wall-pillar", "wall", "wall-gated", "wall-arched", "wall-pillar", "wall"], floor: "floor-tile-large", torch: "#bfe0ff" };

// An open doorway in a north or south wall at x = ox: the 2 m opening is
// clear, and invisible jambs keep the wall either side of it solid. They
// are a little shallower than the 1 m walls, so a body sliding along the
// wall never catches on the seam between them.
function doorway(name: string, ox: number, z: number, yaw: number) {
  place(dungeon("wall-doorway-open"), ox, z, yaw, false);
  for (const x of [-1.5, 1.5]) scene.box(`${name} jamb ${x < 0 ? "W" : "E"}`, [ox + x, 2, z], [1, 4, 0.9], "#000000", { Renderable: { mesh: 0, material: 0, visible: false } });
}
// A square room centred on (ox, cz), `half` metres to each wall (4 m wall
// pieces), with a doorway in the middle of the north and/or south wall,
// floored with 4 m tiles.
function room(name: string, theme: Theme, ox: number, cz: number, half: number, north: boolean, south: boolean) {
  const walls = theme.walls;
  const pieces = half / 2; // 4 m walls from -half to +half
  const along = (i: number) => -half + 2 + i * 4;
  for (let i = 0; i < pieces; i++) {
    const t = along(i);
    const middle = Math.abs(t) < 0.01;
    if (middle && north) doorway(`${name} north door`, ox, cz - half, 0);
    else place(dungeon(walls[i % walls.length]!), ox + t, cz - half, 0);
    if (middle && south) doorway(`${name} south door`, ox, cz + half, Math.PI);
    else place(dungeon(walls[(i + 3) % walls.length]!), ox + t, cz + half, Math.PI);
    place(dungeon(walls[(i + 1) % walls.length]!), ox - half, cz + t, Math.PI / 2);
    place(dungeon(walls[(i + 2) % walls.length]!), ox + half, cz + t, -Math.PI / 2);
  }
  for (const [x, z] of [
    [-half, -half],
    [half, -half],
    [-half, half],
    [half, half],
  ] as const)
    place(dungeon("pillar"), ox + x, cz + z);
  for (let x = -half + 2; x < half; x += 4) for (let z = -half + 2; z < half; z += 4) place(dungeon(theme.floor), ox + x, cz + z, 0, false, FLOOR);
}
// A torch on a wall facing into the room, with its light and flames.
let torches = 0;
function torch(at: V3, yaw: number, hex: string, light = true, flame = "#ffc04a", flameEnd = "#ff3a0c") {
  const n = ++torches;
  place(dungeon("torch-mounted"), at[0], at[2], yaw, false, at[1]);
  const out: V3 = [at[0] + Math.sin(yaw) * 0.45, at[1] + 0.75, at[2] + Math.cos(yaw) * 0.45];
  scene.add(`Torch flame ${n}`, out, {
    Renderable: { visible: false },
    ...(light ? { Light: { type: "Point", color: rgb(hex), intensity: 10, range: 13, castShadows: false } } : {}),
    Particles: {
      preset: "Fire",
      rate: 22,
      lifetime: 0.5,
      speed: 0.6,
      size: 0.14,
      color: rgb(flame),
      endColor: rgb(flameEnd),
      endSize: 0.3,
      shape: "Sphere",
      shapeSize: 0.06,
    },
  });
}
// The magic barrier sealing a corridor; the Director drops it to open.
function corridor(prefix: string, n: number, ox: number, z: number, theme: Theme) {
  place(dungeon("wall"), ox - 2.5, z, Math.PI / 2);
  place(dungeon("wall"), ox + 2.5, z, -Math.PI / 2);
  place(dungeon(theme.floor), ox, z, 0, false, FLOOR);
  scene.box(`${prefix} Seal ${n}`, [ox, 1.75, z], [4, 3.5, 0.4], "#5a2dff", {}, {
    emissive: rgb("#7a4dff"),
    emissiveIntensity: 1.6,
    opacity: 0.55,
  });
}
// A Gate: an arrival room (centre 0), rooms at -24, -48, -72 and the boss
// arena at -100, corridors (with their seals) between them. `dress` adds its
// props (to the same instanced set) before the set is written out.
function gate(prefix: string, theme: Theme, ox: number, start: string, dress: () => void = () => {}, flame?: [string, string]) {
  setName = prefix;
  room(`${prefix} ${start}`, theme, ox, 0, 10, true, false);
  corridor(prefix, 1, ox, -12, theme);
  room(`${prefix} Room 1`, theme, ox, -24, 10, true, true);
  corridor(prefix, 2, ox, -36, theme);
  room(`${prefix} Room 2`, theme, ox, -48, 10, true, true);
  corridor(prefix, 3, ox, -60, theme);
  room(`${prefix} Room 3`, theme, ox, -72, 10, true, true);
  corridor(prefix, 4, ox, -84, theme);
  room(`${prefix} Arena`, theme, ox, -100, 14, false, true);
  const fire = (at: V3, yaw: number, light = true) => torch(at, yaw, theme.torch, light, ...(flame ?? []));
  for (const [cz, half] of [
    [0, 10],
    [-24, 10],
    [-48, 10],
    [-72, 10],
  ] as const) {
    fire([ox - half + 0.5, 2.2, cz - 2], Math.PI / 2);
    fire([ox + half - 0.5, 2.2, cz + 3], -Math.PI / 2, cz !== 0);
  }
  fire([ox - 13.5, 2.4, -95], Math.PI / 2);
  fire([ox + 13.5, 2.4, -95], -Math.PI / 2);
  fire([ox - 6, 2.4, -113.5], 0, false);
  fire([ox + 6, 2.4, -113.5], 0, false);
  for (const [x, z] of [
    [-7, -94],
    [7, -94],
    [-7, -106],
    [7, -106],
  ] as const)
    place(dungeon("column"), ox + x, z);
  dress();
  flushSets();
}

// The Goblin Cave (E): the first Gate, whose arrival room is the tutorial.
gate("G1", CAVE, 0, "Tutorial", () => {
  place(dungeon("barrel-large"), -8, 7.6);
  place(dungeon("crates-stacked"), 8, 7.4, 0.3);
  place(dungeon("chest"), -8.4, -31, Math.PI / 2);
  for (const x of [-3.4, 3.4]) place(dungeon("banner-patternA-red"), x, -33.9, 0, false);
  place(dungeon("rubble-half"), 7.8, -55, -0.6, false);
  place(dungeon("barrel-large"), -8.2, -41);
  place(dungeon("sword-shield-broken"), 6.5, -66, 1.1, false);
  place(dungeon("box-stacked"), -8, -79, 0.2);
  place(dungeon("banner-patternA-red"), -5, -113.9, 0, false);
  place(dungeon("banner-patternA-red"), 5, -113.9, 0, false);
  place(dungeon("candle-triple"), 0, -112, 0, false);
});

// The Subway Tunnel (E): rails down every room, rubble, cold light.
const TX = 120;
gate("G2", TUNNEL, TX, "Platform", () => {
  for (const [x, z, kind, yaw] of [
    [-7, 4, "rubble-large", 0.4],
    [7.5, -20, "rubble-half", -0.8],
    [-7.6, -44, "rubble-large", 1.2],
    [7.2, -76, "rubble-half", 0.2],
    [-8, -66, "barrel-large", 0],
    [8, -52, "crates-stacked", 0.6],
  ] as const)
    place(dungeon(kind), TX + x, z, yaw, !kind.startsWith("rubble"));
});
for (const cz of [0, -24, -48, -72, -100]) {
  const half = cz === -100 ? 14 : 10;
  for (const x of [-0.8, 0.8])
    scene.box(`G2 rail ${cz},${x}`, [TX + x, 0.04, cz], [0.12, 0.08, half * 2 - 1], "#6b6f78", { Collider: { type: "AABB", isTrigger: true } }, { metalness: 0.6, roughness: 0.35 });
}

// The Goblin Fortress (D): the rank test. Banners, braziers, a war hall.
const FX = -120;
gate("G3", FORT, FX, "Gatehouse", () => {
  for (const [x, z] of [
    [-4, -9.9],
    [4, -9.9],
    [-4, -33.9],
    [4, -33.9],
    [-4, -57.9],
    [4, -57.9],
    [-4, -81.9],
    [4, -81.9],
    [-9, -113.9],
    [9, -113.9],
  ] as const)
    place(dungeon("banner-patternA-red"), FX + x, z, 0, false);
  for (const [x, z] of [
    [-8, -20],
    [8, -44],
    [-8, -68],
  ] as const)
    place(dungeon("pillar-decorated"), FX + x, z);
});

// The Flooded Temple (C): sunken stone, teal light, standing water in every
// room. The water is only a look (a trigger): fighters wade through it.
const WX = 240;
gate("G4", TEMPLE, WX, "Steps", () => {
  for (const [x, z] of [
    [-6, -18],
    [6, -18],
    [-6, -30],
    [6, -30],
    [-6, -42],
    [6, -42],
    [-6, -54],
    [6, -54],
  ] as const)
    place(dungeon("column"), WX + x, z);
  for (const [x, z, kind, yaw] of [
    [-7.5, 5, "rubble-half", 0.5],
    [7.8, -64, "rubble-half", -2.4],
    [-8, -78, "pillar-decorated", 0],
    [8, -78, "pillar-decorated", 0],
  ] as const)
    place(dungeon(kind), WX + x, z, yaw, !kind.startsWith("rubble"));
  for (const [x, z] of [
    [-7, -33],
    [7, -33],
    [-3, -112],
    [3, -112],
  ] as const)
    place(dungeon("candle-triple"), WX + x, z, 0, false);
  place(dungeon("chest"), WX, -112.6, 0);
}, ["#a8fff4", "#127a8a"]);
for (const cz of [0, -24, -48, -72, -100]) {
  const half = cz === -100 ? 14 : 10;
  scene.box(`G4 water ${cz}`, [WX, 0.04, cz], [half * 2 - 1, 0.04, half * 2 - 1], "#1d6f74", { Collider: { type: "AABB", isTrigger: true } }, {
    opacity: 0.45,
    metalness: 0.3,
    roughness: 0.08,
    emissive: rgb("#0b3a40"),
    emissiveIntensity: 0.4,
  });
  // Mist low over the water (squashed flat: particles follow the entity's scale).
  scene.add(`G4 mist ${cz}`, [WX, 0.35, cz], {
    Scale: { value: vec(1, 0.05, 1) },
    Renderable: { visible: false },
    Particles: { preset: "Smoke", rate: 7, lifetime: 4, speed: 0.15, size: 1.4, color: rgb("#1f6f6c"), endColor: rgb("#081c1e"), endSize: 2.4, gravityScale: 0, shape: "Box", shapeSize: half - 1.5 },
  });
}

// The Ice Fortress (B): the B-rank test. Gated walls, cold torchlight, rime
// on the floor and snow falling into every room.
const IX = -240;
gate("G5", ICE, IX, "Approach", () => {
  for (const [x, z] of [
    [-4, -9.9],
    [4, -9.9],
    [-4, -57.9],
    [4, -57.9],
    [-9, -113.9],
    [9, -113.9],
  ] as const)
    place(dungeon("banner-patternA-red"), IX + x, z, 0, false);
  for (const [x, z, kind, yaw] of [
    [-8, 7.4, "crates-stacked", 0.2],
    [8, -20, "barrel-large", 0],
    [-8, -44, "pillar-decorated", 0],
    [8, -44, "pillar-decorated", 0],
    [-6.5, -66, "sword-shield-broken", 0.8],
    [7.5, -80, "box-stacked", -0.3],
  ] as const)
    place(dungeon(kind), IX + x, z, yaw, kind !== "sword-shield-broken");
}, ["#e8f6ff", "#4a8cff"]);
for (const cz of [0, -24, -48, -72, -100]) {
  const half = cz === -100 ? 14 : 10;
  scene.box(`G5 rime ${cz}`, [IX, 0.025, cz], [half * 2 - 1, 0.02, half * 2 - 1], "#cfe6ff", { Collider: { type: "AABB", isTrigger: true } }, {
    opacity: 0.22,
    metalness: 0.2,
    roughness: 0.15,
  });
  // Snow from above the walls (squashed into a 2 m band, falling slowly).
  scene.add(`G5 snow ${cz}`, [IX, 5, cz], {
    Scale: { value: vec(1, 0.25, 1) },
    Renderable: { visible: false },
    Particles: { preset: "Confetti", rate: 26, lifetime: 4.5, speed: 0.3, size: 0.07, color: rgb("#eef6ff"), endColor: rgb("#9cc4ff"), endSize: 0.8, gravityScale: 0.6, shape: "Box", shapeSize: half - 1 },
  });
}

// -- The A and S Gates (M4) ---------------------------------------------------
// Two more Gates past the Ground slab (x -255..255), each on its own slab.
// Every room of these has a lamp over it besides its torches, so the fights
// read clearly from any angle (GAME_DESIGN.md 7: pools of light, never murk).
const ROOM_CENTRES = [0, -24, -48, -72, -100] as const;
function gateGround(prefix: string, ox: number) {
  scene.add(`${prefix} ground`, [ox, -0.5, -55], {
    Scale: { value: vec(40, 1, 140) },
    Renderable: { mesh: 0, material: 0, visible: false },
    RigidBody: { dynamic: false },
    Collider: { type: "AABB" },
  });
}
function gateLamps(prefix: string, ox: number, hex: string) {
  for (const cz of ROOM_CENTRES)
    scene.add(`${prefix} lamp ${cz}`, [ox, 7, cz], {
      Renderable: { visible: false },
      Light: { type: "Point", color: rgb(hex), intensity: cz === -100 ? 30 : 22, range: cz === -100 ? 26 : 20, castShadows: false },
    });
}
// Red banners on a room's walls: on the north wall at `north` (x offsets),
// and on both side walls at `side` (z offsets), each hung just off the face.
function banners(ox: number, cz: number, half: number, north: readonly number[], side: readonly number[]) {
  for (const x of north) place(dungeon("banner-patternA-red"), ox + x, cz - half + 0.1, 0, false);
  for (const z of side) {
    place(dungeon("banner-patternA-red"), ox - half + 0.1, cz + z, Math.PI / 2, false);
    place(dungeon("banner-patternA-red"), ox + half - 0.1, cz + z, -Math.PI / 2, false);
  }
}

// The Bloodstone Citadel (A): the A-rank test. A castle interior of dark
// stone: red banners on every wall, a crimson runner down the length of the
// Gate, warm torchlight and a lamp over each hall, and the Castellan's
// throne at the end of the throne room. The flat walls sit where the
// banners hang.
const CITADEL: Theme = { walls: ["wall-pillar", "wall", "wall-arched", "wall", "wall-arched", "wall", "wall-gated"], floor: "floor-tile-large", torch: "#ff8a52" };
const CX = 360;
gate("G6", CITADEL, CX, "Outer Ward", () => {
  // (The gallery's side walls are behind its pillars: banners north only.)
  for (const cz of [0, -24, -48, -72]) banners(CX, cz, 10, [-4, 4], cz === -72 ? [] : [-5, 6.5]);
  banners(CX, -100, 14, [-9.5, -2.6, 2.6, 9.5], [-5, -10]);
  for (const [x, z, kind, yaw] of [
    // The outer ward's stores.
    [-7.8, 7.4, "crates-stacked", 0.2],
    [7.9, 7.5, "barrel-large", 0],
    [7.2, -6.4, "sword-shield-broken", 0.9],
    // The barbican's and the gallery's pillars, clear of the fights.
    [-7.4, -20, "pillar-decorated", 0],
    [7.4, -20, "pillar-decorated", 0],
    [-7.2, -67, "pillar-decorated", 0],
    [7.2, -67, "pillar-decorated", 0],
    [-7.2, -77, "pillar-decorated", 0],
    [7.2, -77, "pillar-decorated", 0],
    // The chapel's candles and its spoils.
    [-8.4, -56.4, "candle-triple", 0],
    [8.2, -56.4, "candle-triple", 0],
    [-8.4, -39.6, "candle-triple", 0],
    [8.2, -39.6, "candle-triple", 0],
    [-8.2, -44, "chest", Math.PI / 2],
    [8.2, -52, "chest", -Math.PI / 2],
    // The throne room: candles by the throne, chests in its corners.
    [-2.2, -110.6, "candle-triple", 0],
    [1.9, -110.6, "candle-triple", 0],
    [-11.6, -111.6, "chest", 0.4],
    [11.6, -111.6, "chest", -0.4],
    [-10.5, -90, "sword-shield-broken", 2.2],
  ] as const)
    place(dungeon(kind), CX + x, z, yaw, !(kind === "candle-triple" || kind === "sword-shield-broken"));
}, ["#ffd27a", "#ff2a0c"]);
gateGround("G6", CX);
gateLamps("G6", CX, "#ffd6bc");
// The runner, door to door down the whole Gate (only a look: a trigger).
scene.box("G6 runner", [CX, 0.03, -52], [2.6, 0.02, 122], "#6e1018", { Collider: { type: "AABB", isTrigger: true } }, { roughness: 0.95 });
// The throne: a dais, a tall crimson back and a gold crest.
scene.box("G6 throne dais", [CX, 0.25, -111.4], [3.4, 0.5, 2.4], "#2c2428", {}, { roughness: 0.7 });
scene.box("G6 throne back", [CX, 2.1, -112.6], [2.4, 3.4, 0.5], "#7a1420", {}, { roughness: 0.6, emissive: rgb("#3a0508"), emissiveIntensity: 0.6 });
scene.box("G6 throne crest", [CX, 4.0, -112.5], [2.9, 0.35, 0.65], "#c9a24a", {}, { metalness: 0.7, roughness: 0.3, emissive: rgb("#7a5a1a"), emissiveIntensity: 0.6 });

// The Eclipse Spire (S): the S-rank test. A ruin open to a red eclipse:
// cracked walls, rubble, the gear of hunters it swallowed, violet torches,
// ash on the floor and embers rising through every room; above the throne
// room's far wall the eclipse itself, a black disc ringed in red light.
const SPIRE: Theme = { walls: ["wall-cracked", "wall-arched", "wall-cracked", "wall", "wall-cracked", "wall-gated", "wall-arched"], floor: "floor-tile-large", torch: "#e08aff" };
const SX = -360;
gate("G7", SPIRE, SX, "Landing", () => {
  for (const [x, z, kind, yaw] of [
    [-7.6, 6.2, "rubble-half", 0.3],
    [6.4, -7.8, "rubble-half", 2.9],
    [-7.8, -30.5, "rubble-half", 1.4],
    [7.5, -16.8, "column", 0],
    [-6.5, -18, "sword-shield-broken", 0.4],
    [6.8, -27.5, "sword-shield-broken", 2.6],
    [-7.5, -41, "column", 0],
    [7.5, -41, "column", 0],
    [-7.5, -55, "column", 0],
    [7.5, -55, "column", 0],
    [6.5, -50, "sword-shield-broken", 1.7],
    [-7.8, -78.5, "rubble-half", 1.2],
    [7.4, -65.5, "rubble-half", -1.9],
    [-6.2, -64.5, "sword-shield-broken", 0.9],
    [11, -89.5, "rubble-half", 2.6],
    [-11.2, -111.2, "rubble-half", 0.5],
    [9.6, -108, "sword-shield-broken", 2.2],
  ] as const)
    place(dungeon(kind), SX + x, z, yaw, !(kind.startsWith("rubble") || kind === "sword-shield-broken"));
  banners(SX, -100, 14, [-9.5, 9.5], []);
}, ["#ffd6ff", "#8a2ad0"]);
gateGround("G7", SX);
gateLamps("G7", SX, "#d8ccff");
for (const cz of ROOM_CENTRES) {
  const half = cz === -100 ? 14 : 10;
  // Pale ash over the floor (a look: a trigger).
  scene.box(`G7 ash ${cz}`, [SX, 0.025, cz], [half * 2 - 1, 0.02, half * 2 - 1], "#b9a7c9", { Collider: { type: "AABB", isTrigger: true } }, {
    opacity: 0.2,
    roughness: 0.9,
  });
  // Embers rising from the floor (squashed into a low band, drifting up).
  scene.add(`G7 embers ${cz}`, [SX, 0.6, cz], {
    Scale: { value: vec(1, 0.2, 1) },
    Renderable: { visible: false },
    Particles: { preset: "Fire", rate: 14, lifetime: 4, speed: 0.35, size: 0.05, color: rgb("#ff9a6a"), endColor: rgb("#8a1a4a"), endSize: 0.4, gravityScale: -0.15, shape: "Box", shapeSize: half - 1.5 },
  });
}
// The eclipse on the throne room's far wall, behind the Herald: a red
// corona set on its corner, a black disc before it, and its light, which
// floods the arena crimson. (Over the wall it hid behind the HUD.)
const DIAMOND = { Rotation: { euler: vec(0, 0, Math.PI / 4) }, Collider: { type: "AABB", isTrigger: true } };
scene.box("G7 eclipse corona", [SX, 4.4, -113.4], [5, 5, 0.12], "#3a0614", DIAMOND, { emissive: rgb("#ff2a4a"), emissiveIntensity: 1.8 });
scene.box("G7 eclipse disc", [SX, 4.4, -113.3], [3.8, 3.8, 0.12], "#06030a", DIAMOND, { roughness: 1 });
scene.add("G7 eclipse light", [SX, 6, -109], {
  Renderable: { visible: false },
  Light: { type: "Point", color: rgb("#ff5a6a"), intensity: 26, range: 24, castShadows: false },
});

// -- Move lists ---------------------------------------------------------------
// Twin daggers. Light: stab, stab, hook-slash, spinning kick. Heavy after 1,
// 2, 3 or 4 lights is a different finisher (GAME_DESIGN.md 5.2); from neutral
// it's an armored, guard-breaking cross-cut. Skills spend mana; the ultimate
// spends the gauge that hits and parries fill. Shadow Step Dash (Q) unlocks
// at level 2 and Fang Whirl (E) with the Subway Tunnel's story quest.
const heroMoves = `# GATEBREAKER twin daggers
stab_l: clip=jab input=light dur=0.45 hit=0.08-0.14 cancel=0.17 dmg=7 reach=1.0 lunge=0.35 stun=0.3 gain=5 limb=hand_l
stab_r: clip=cross input=light after=stab_l dur=0.5 hit=0.12-0.18 cancel=0.21 dmg=8 reach=1.05 lunge=0.35 stun=0.32 gain=5 limb=hand_r
hook_slash: clip=hook input=light after=stab_r dur=0.6 hit=0.13-0.2 cancel=0.27 dmg=10 reach=1.05 radius=0.7 lunge=0.4 knock=2 stun=0.4 gain=6 limb=hand_r
spin_kick: clip=roundhouse_l input=light after=hook_slash dur=0.85 hit=0.36-0.46 cancel=0.58 dmg=14 reach=1.3 height=0.8 lunge=0.35 knock=6 stun=0.6 stop=0.1 gain=8 finisher limb=foot_l
cross_cut: clip=sword_heavy_a input=heavy dur=1.0 hit=0.24-0.34 cancel=0.45 dmg=15 reach=1.3 radius=0.85 lunge=0.7 knock=4.5 stun=0.6 stop=0.11 stagger=24 gain=8 armor guardbreak limb=hand_r
rising_slash: clip=uppercut input=heavy after=stab_l dur=0.8 hit=0.18-0.28 cancel=0.48 dmg=12 reach=1.0 lunge=0.35 launch=8.5 stun=0.7 stop=0.1 gain=8 limb=hand_r
twin_pierce: clip=dash_strike input=heavy after=stab_r dur=0.75 hit=0.15-0.3 cancel=0.5 dmg=16 reach=1.1 lunge=1.6 knock=7 stun=0.6 stop=0.1 stagger=26 gain=8 guardbreak limb=hand_r
crescent: clip=sword_heavy_c input=heavy after=hook_slash dur=0.95 hit=0.3-0.42 cancel=0.55 dmg=18 aoe=2.3 knock=6 stun=0.6 stop=0.12 knockdown gain=10 limb=hand_r
execution: clip=sword_light_c input=heavy after=spin_kick dur=0.9 hit=0.2-0.32 cancel=0.6 dmg=26 reach=1.2 radius=0.9 lunge=0.6 knock=8 stun=0.9 stop=0.16 stagger=40 gain=12 finisher limb=hand_r
air_slash: clip=sword_light_b input=light air after=air_slash|start dur=0.45 hit=0.1-0.18 cancel=0.2 dmg=7 reach=1.1 launch=3.5 stun=0.4 lunge=0 limb=hand_r
dodge: clip=roll input=dodge dur=0.5 hit=0-0 cancel=0.36 dmg=0 lunge=3.4 free iframes=0.02-0.34 track=0 limb=pelvis
shadow_step: clip=sword_light_c input=light after=shadow_step dur=0.6 hit=0.05-0.16 cancel=0.3 dmg=22 reach=1.2 radius=0.9 lunge=0 knock=4 stun=0.9 stop=0.14 stagger=30 gain=12 unblockable finisher limb=hand_r
shadow_dash: clip=dash_strike input=skill1 dur=0.8 hit=0.1-0.4 cancel=0.55 dmg=16 reach=1.2 lunge=6 knock=4 stun=0.6 mana=25 cooldown=3 hits=2 iframes=0-0.4 locked limb=hand_r
fang_whirl: clip=sword_heavy_c input=skill2 dur=1.0 hit=0.3-0.42 cancel=0.6 dmg=16 aoe=2.4 knock=6 stun=0.6 stop=0.1 mana=35 cooldown=5 lunge=0.2 locked limb=hand_r
shadow_fang: clip=energy_throw input=skill3 dur=0.7 hit=0.22-0.26 cancel=0.45 dmg=14 projectile=22 knock=4 stun=0.5 mana=20 cooldown=1.5 lunge=0 limb=hand_r
thousand_fangs: clip=ground_pound input=ultimate dur=1.4 hit=0.3-0.9 cancel=1.2 dmg=60 aoe=3.4 hits=6 knock=9 launch=4 stun=1.2 stop=0.16 cost=90 armor unblockable knockdown finisher iframes=0-1.0 lunge=0.2 limb=hand_r
`;
const gruntMoves = `# Goblin grunt
claw_l: clip=jab input=light dur=0.62 hit=0.2-0.26 cancel=0.3 dmg=6 reach=0.95 lunge=0.35 stun=0.3 limb=hand_r
claw_r: clip=cross input=light after=claw_l dur=0.66 hit=0.22-0.28 cancel=0.32 dmg=7 reach=1.0 lunge=0.35 stun=0.35 limb=hand_r
pounce: clip=dash_strike input=heavy dur=1.1 hit=0.35-0.55 cancel=0.8 dmg=12 reach=1.0 lunge=3.5 knock=5 stun=0.6 stop=0.1 limb=hand_r
kick: clip=front_kick_r input=kick after=claw_l|claw_r dur=0.8 hit=0.33-0.44 cancel=0.5 dmg=8 reach=1.15 height=0.55 lunge=0.4 knock=4 stun=0.4 limb=foot_r
hop: clip=roll input=dodge dur=0.6 hit=0-0 cancel=0.45 dmg=0 lunge=3 free iframes=0.03-0.36 track=0 limb=pelvis
`;
const archerMoves = `# Goblin archer: shoots (light) from range, claws up close
shot: clip=energy_throw input=light dur=1.0 hit=0.55-0.6 cancel=0.8 dmg=7 projectile=15 knock=2 stun=0.3 track=70 lunge=0 limb=hand_r
claw: clip=jab input=kick dur=0.62 hit=0.2-0.26 cancel=0.3 dmg=5 reach=0.95 lunge=0.3 stun=0.3 limb=hand_l
hop: clip=roll input=dodge dur=0.6 hit=0-0 cancel=0.45 dmg=0 lunge=3 free iframes=0.03-0.36 track=0 limb=pelvis
`;
const shieldMoves = `# Goblin shield-bearer: holds its guard, bashes and chops
bash: clip=cross input=light dur=0.8 hit=0.3-0.38 cancel=0.45 dmg=8 reach=1.0 lunge=0.4 knock=4 stun=0.5 limb=hand_l
chop: clip=hook input=heavy dur=1.0 hit=0.4-0.5 cancel=0.6 dmg=12 reach=1.1 lunge=0.4 knock=3 stun=0.5 limb=hand_r
kick: clip=front_kick_r input=kick dur=0.8 hit=0.33-0.44 cancel=0.5 dmg=7 reach=1.15 height=0.55 lunge=0.4 knock=5 stun=0.4 limb=foot_r
`;
// A hobgoblin: slow and heavy; its overhead chop breaks guards, so dodge it.
const hobgoblinMoves = `# Hobgoblin
swing: clip=sword_heavy_a input=light dur=1.1 hit=0.45-0.55 cancel=0.7 dmg=13 reach=1.4 radius=0.9 lunge=0.5 knock=5 stun=0.5 stop=0.1 limb=hand_r
backswing: clip=sword_heavy_b input=light after=swing dur=0.95 hit=0.35-0.45 cancel=0.6 dmg=12 reach=1.4 radius=0.9 lunge=0.4 knock=5 stun=0.5 limb=hand_r
crush: clip=sword_heavy_c input=heavy dur=1.4 hit=0.75-0.85 cancel=1.1 dmg=20 reach=1.5 radius=1.0 lunge=0.6 knock=7 stun=0.8 stop=0.12 armor guardbreak limb=hand_r
`;
// A goblin shaman: hurls hexes from range, and its script mends its allies.
const shamanMoves = `# Goblin shaman
hex: clip=energy_cast input=light dur=1.2 hit=0.6-0.65 cancel=0.9 dmg=9 projectile=11 knock=2 stun=0.4 track=60 lunge=0 limb=hand_r
claw: clip=jab input=kick dur=0.62 hit=0.2-0.26 cancel=0.3 dmg=5 reach=0.95 lunge=0.3 stun=0.3 limb=hand_l
hop: clip=roll input=dodge dur=0.6 hit=0-0 cancel=0.45 dmg=0 lunge=3 free iframes=0.03-0.36 track=0 limb=pelvis
`;
// The bosses: big swings, a leaping or charging strike, and the red slam
// (an unblockable area attack with a long, readable wind-up) that their
// scripts call every few seconds, faster in phase 2.
const chieftainMoves = `# Goblin Chieftain
cleave: clip=sword_heavy_a input=light dur=1.15 hit=0.5-0.6 cancel=0.7 dmg=14 reach=1.7 radius=1.0 lunge=0.6 knock=5 stun=0.5 stop=0.1 limb=hand_r
cleave_back: clip=sword_heavy_b input=light after=cleave dur=0.95 hit=0.35-0.45 cancel=0.6 dmg=14 reach=1.7 radius=1.0 lunge=0.4 knock=6 stun=0.5 stop=0.1 limb=hand_r
stomp: clip=front_kick_r input=kick dur=0.9 hit=0.4-0.5 cancel=0.6 dmg=10 reach=1.4 height=0.5 lunge=0.4 knock=7 stun=0.5 limb=foot_r
leap: clip=dash_strike input=heavy dur=1.3 hit=0.55-0.8 cancel=1.0 dmg=16 reach=1.3 lunge=5 knock=7 stun=0.7 stop=0.12 armor limb=hand_r
red_slam: clip=ground_pound input=special dur=1.9 hit=1.05-1.15 cancel=1.6 dmg=26 aoe=3.4 knock=9 stun=1 stop=0.16 armor unblockable knockdown limb=hand_r
`;
const bruteMoves = `# Hobgoblin Brute
smash: clip=sword_heavy_a input=light dur=1.25 hit=0.55-0.65 cancel=0.8 dmg=18 reach=1.8 radius=1.1 lunge=0.6 knock=6 stun=0.6 stop=0.12 limb=hand_r
smash_back: clip=sword_heavy_b input=light after=smash dur=1.05 hit=0.4-0.5 cancel=0.7 dmg=16 reach=1.8 radius=1.1 lunge=0.4 knock=6 stun=0.6 limb=hand_r
charge: clip=shoulder_dash input=heavy dur=1.4 hit=0.5-0.95 cancel=1.1 dmg=18 reach=1.3 lunge=7 knock=9 stun=0.8 stop=0.12 armor guardbreak limb=pelvis
red_slam: clip=ground_pound input=special dur=1.9 hit=1.05-1.15 cancel=1.6 dmg=30 aoe=3.8 knock=10 stun=1 stop=0.16 armor unblockable knockdown limb=hand_r
`;
const warlordMoves = `# Goblin Warlord
cut: clip=sword_light_a input=light dur=0.85 hit=0.3-0.38 cancel=0.5 dmg=14 reach=1.7 radius=0.9 lunge=0.6 knock=4 stun=0.5 limb=hand_r
cut_back: clip=sword_light_b input=light after=cut dur=0.85 hit=0.3-0.38 cancel=0.5 dmg=14 reach=1.7 radius=0.9 lunge=0.5 knock=4 stun=0.5 limb=hand_r
cut_rise: clip=sword_heavy_c input=light after=cut_back dur=1.1 hit=0.45-0.55 cancel=0.8 dmg=18 reach=1.7 radius=1.0 lunge=0.4 knock=7 stun=0.6 stop=0.12 limb=hand_r
lunge: clip=dash_strike input=heavy dur=1.2 hit=0.5-0.75 cancel=0.95 dmg=20 reach=1.4 lunge=6 knock=8 stun=0.7 stop=0.12 armor guardbreak limb=hand_r
red_slam: clip=ground_pound input=special dur=1.8 hit=1.0-1.1 cancel=1.5 dmg=32 aoe=4 knock=10 stun=1 stop=0.16 armor unblockable knockdown limb=hand_r
`;
// The C–B Gates' enemies. An armored knight shields itself and cuts fast:
// its cuts can be parried (they're what it teaches), its overhead can't.
const knightMoves = `# Armored knight
cut: clip=sword_light_a input=light dur=0.7 hit=0.24-0.3 cancel=0.4 dmg=10 reach=1.3 radius=0.8 lunge=0.45 knock=3 stun=0.4 limb=hand_r
cut_back: clip=sword_light_b input=light after=cut dur=0.7 hit=0.22-0.28 cancel=0.4 dmg=10 reach=1.3 radius=0.8 lunge=0.4 knock=3 stun=0.4 limb=hand_r
bash: clip=cross input=kick dur=0.8 hit=0.3-0.38 cancel=0.45 dmg=8 reach=1.0 lunge=0.5 knock=5 stun=0.5 limb=hand_l
overhead: clip=sword_heavy_a input=heavy dur=1.25 hit=0.6-0.7 cancel=0.85 dmg=18 reach=1.5 radius=0.9 lunge=0.5 knock=6 stun=0.6 stop=0.12 armor guardbreak limb=hand_r
`;
// A cultist caster curses from range and stabs up close.
const casterMoves = `# Cultist caster
curse: clip=energy_cast input=light dur=1.1 hit=0.55-0.6 cancel=0.85 dmg=12 projectile=13 knock=2 stun=0.4 track=60 lunge=0 limb=hand_r
stab: clip=sword_light_a input=kick dur=0.75 hit=0.25-0.32 cancel=0.4 dmg=7 reach=1.2 lunge=0.3 stun=0.3 limb=hand_r
hop: clip=roll input=dodge dur=0.6 hit=0-0 cancel=0.45 dmg=0 lunge=3 free iframes=0.03-0.36 track=0 limb=pelvis
`;
// An ice ghoul: quick claws and a long leap; they come in packs.
const ghoulMoves = `# Ice ghoul
rake_l: clip=jab input=light dur=0.48 hit=0.14-0.2 cancel=0.24 dmg=7 reach=0.95 lunge=0.45 stun=0.3 limb=hand_l
rake_r: clip=cross input=light after=rake_l dur=0.5 hit=0.15-0.21 cancel=0.25 dmg=8 reach=1.0 lunge=0.45 stun=0.3 limb=hand_r
leap: clip=dash_strike input=heavy dur=0.95 hit=0.3-0.5 cancel=0.7 dmg=12 reach=1.0 lunge=5 knock=5 stun=0.5 stop=0.1 limb=hand_r
hop: clip=roll input=dodge dur=0.5 hit=0-0 cancel=0.38 dmg=0 lunge=3.2 free iframes=0.03-0.32 track=0 limb=pelvis
`;
// The Drowned Priest reaps up close and, from its script, throws a tide
// bolt at a hunter who keeps away.
const priestMoves = `# Drowned Priest
reap: clip=sword_heavy_a input=light dur=1.1 hit=0.45-0.55 cancel=0.7 dmg=16 reach=1.8 radius=1.0 lunge=0.5 knock=5 stun=0.5 stop=0.1 limb=hand_r
reap_back: clip=sword_heavy_b input=light after=reap dur=0.95 hit=0.35-0.45 cancel=0.6 dmg=15 reach=1.8 radius=1.0 lunge=0.4 knock=5 stun=0.5 limb=hand_r
tide: clip=energy_cast input=special dur=1.2 hit=0.6-0.65 cancel=0.9 dmg=16 projectile=12 knock=4 stun=0.5 track=90 lunge=0 limb=hand_r
red_slam: clip=ground_pound input=special dur=1.9 hit=1.05-1.15 cancel=1.6 dmg=34 aoe=4 knock=10 stun=1 stop=0.16 armor unblockable knockdown limb=hand_r
`;
const commanderMoves = `# Frost Knight Commander
cut: clip=sword_light_a input=light dur=0.8 hit=0.28-0.36 cancel=0.48 dmg=16 reach=1.7 radius=0.9 lunge=0.6 knock=4 stun=0.5 limb=hand_r
cut_back: clip=sword_light_b input=light after=cut dur=0.8 hit=0.28-0.36 cancel=0.48 dmg=16 reach=1.7 radius=0.9 lunge=0.5 knock=4 stun=0.5 limb=hand_r
bash: clip=cross input=kick dur=0.85 hit=0.32-0.4 cancel=0.5 dmg=12 reach=1.2 lunge=0.6 knock=7 stun=0.6 limb=hand_l
lunge: clip=dash_strike input=heavy dur=1.2 hit=0.5-0.75 cancel=0.95 dmg=22 reach=1.4 lunge=6 knock=8 stun=0.7 stop=0.12 armor guardbreak limb=hand_r
red_slam: clip=ground_pound input=special dur=1.8 hit=1.0-1.1 cancel=1.5 dmg=38 aoe=4.2 knock=10 stun=1 stop=0.16 armor unblockable knockdown limb=hand_r
`;
const constructMoves = `# Training construct: one slow, readable swing
swing: clip=hook input=light dur=1.3 hit=0.8-0.9 cancel=1.1 dmg=4 reach=1.4 radius=0.9 lunge=0.2 knock=2 stun=0.3 track=120 limb=hand_r
`;
// The A and S Gates' enemies. A castle imp: small, quick, in packs.
const impMoves = `# Castle imp
claw_l: clip=jab input=light dur=0.5 hit=0.15-0.21 cancel=0.25 dmg=9 reach=0.95 lunge=0.45 stun=0.3 limb=hand_l
claw_r: clip=cross input=light after=claw_l dur=0.52 hit=0.16-0.22 cancel=0.26 dmg=10 reach=1.0 lunge=0.45 stun=0.3 limb=hand_r
pounce: clip=dash_strike input=heavy dur=0.95 hit=0.3-0.5 cancel=0.7 dmg=16 reach=1.0 lunge=5 knock=5 stun=0.5 stop=0.1 limb=hand_r
hop: clip=roll input=dodge dur=0.5 hit=0-0 cancel=0.38 dmg=0 lunge=3.2 free iframes=0.03-0.32 track=0 limb=pelvis
`;
// A bloodstone knight swings a greatsword with armor: it doesn't flinch
// mid-swing, so trading blows loses. Its white cleaves can be parried (a
// parry stops even it); its rend is red: dodge it.
const bloodKnightMoves = `# Bloodstone knight
cleave: clip=sword_heavy_a input=light dur=1.0 hit=0.4-0.5 cancel=0.62 dmg=20 reach=1.6 radius=1.0 lunge=0.6 knock=4 stun=0.5 stop=0.1 armor limb=hand_r
cleave_back: clip=sword_heavy_b input=light after=cleave dur=0.9 hit=0.32-0.42 cancel=0.55 dmg=18 reach=1.6 radius=1.0 lunge=0.5 knock=5 stun=0.5 armor limb=hand_r
kick: clip=front_kick_r input=kick dur=0.8 hit=0.33-0.44 cancel=0.5 dmg=12 reach=1.2 height=0.55 lunge=0.5 knock=6 stun=0.5 limb=foot_r
rend: clip=dash_strike input=heavy dur=1.3 hit=0.6-0.85 cancel=1.05 dmg=30 reach=1.4 lunge=6 knock=8 stun=0.7 stop=0.12 armor unblockable limb=hand_r
`;
// A blood mage bolts from range and, up close, throws everyone back with a
// nova; its script blinks it away from a hunter who closes in.
const bloodMageMoves = `# Blood mage
bolt: clip=energy_cast input=light dur=1.0 hit=0.5-0.55 cancel=0.8 dmg=16 projectile=14 knock=3 stun=0.4 track=70 lunge=0 limb=hand_r
nova: clip=ground_pound input=kick dur=1.2 hit=0.6-0.7 cancel=0.95 dmg=14 aoe=2.4 knock=8 stun=0.5 limb=hand_r
hop: clip=roll input=dodge dur=0.6 hit=0-0 cancel=0.45 dmg=0 lunge=3 free iframes=0.03-0.36 track=0 limb=pelvis
`;
// A hollow: a pale shade the Spire made of a fallen hunter. Twin knives,
// quick rakes, a knee and a long leap; they hunt in packs.
const hollowMoves = `# Hollow
rake_l: clip=jab input=light dur=0.46 hit=0.14-0.2 cancel=0.24 dmg=12 reach=1.0 lunge=0.5 stun=0.3 limb=hand_l
rake_r: clip=cross input=light after=rake_l dur=0.48 hit=0.15-0.21 cancel=0.25 dmg=13 reach=1.0 lunge=0.5 stun=0.3 limb=hand_r
knee: clip=knee input=kick dur=0.7 hit=0.25-0.35 cancel=0.45 dmg=16 reach=0.9 lunge=0.6 knock=5 stun=0.5 limb=foot_r
leap: clip=dash_strike input=heavy dur=0.9 hit=0.3-0.5 cancel=0.65 dmg=18 reach=1.0 lunge=5.5 knock=6 stun=0.5 stop=0.1 limb=hand_r
hop: clip=roll input=dodge dur=0.5 hit=0-0 cancel=0.38 dmg=0 lunge=3.2 free iframes=0.03-0.32 track=0 limb=pelvis
`;
// An eclipse warden: a spear behind a shield (Heavies break its guard), and
// a red sun-lance that breaks yours.
const wardenMoves = `# Eclipse warden
thrust: clip=sword_light_a input=light dur=0.75 hit=0.28-0.36 cancel=0.45 dmg=16 reach=1.8 radius=0.6 lunge=0.6 knock=3 stun=0.4 limb=hand_r
thrust_2: clip=sword_light_b input=light after=thrust dur=0.75 hit=0.26-0.34 cancel=0.45 dmg=16 reach=1.8 radius=0.6 lunge=0.5 knock=3 stun=0.4 limb=hand_r
bash: clip=cross input=kick dur=0.8 hit=0.3-0.38 cancel=0.45 dmg=12 reach=1.1 lunge=0.6 knock=6 stun=0.5 limb=hand_l
sun_lance: clip=dash_strike input=heavy dur=1.25 hit=0.55-0.8 cancel=1.0 dmg=28 reach=1.6 lunge=7 knock=8 stun=0.7 stop=0.12 armor guardbreak limb=hand_r
`;
// The Crimson Castellan: parryable cleaves, a guard-breaking lunge, the red
// slam, and (phase 2, from its script) the Crimson Rend: three red cuts in
// a row. The rend's input is a skill button, which no AI presses: only the
// script starts it.
const castellanMoves = `# Crimson Castellan
cleave: clip=sword_heavy_a input=light dur=1.1 hit=0.45-0.55 cancel=0.7 dmg=22 reach=1.8 radius=1.0 lunge=0.6 knock=5 stun=0.5 stop=0.1 limb=hand_r
cleave_back: clip=sword_heavy_b input=light after=cleave dur=0.95 hit=0.35-0.45 cancel=0.6 dmg=20 reach=1.8 radius=1.0 lunge=0.4 knock=6 stun=0.5 stop=0.1 limb=hand_r
kick: clip=side_kick_r input=kick dur=0.85 hit=0.35-0.45 cancel=0.55 dmg=14 reach=1.4 height=0.6 lunge=0.5 knock=8 stun=0.6 limb=foot_r
lunge: clip=dash_strike input=heavy dur=1.2 hit=0.5-0.75 cancel=0.95 dmg=26 reach=1.4 lunge=6 knock=8 stun=0.7 stop=0.12 armor guardbreak limb=hand_r
red_slam: clip=ground_pound input=special dur=1.8 hit=1.0-1.1 cancel=1.5 dmg=42 aoe=4.2 knock=10 stun=1 stop=0.16 armor unblockable knockdown limb=hand_r
rend_1: clip=sword_light_a input=skill1 dur=0.85 hit=0.42-0.5 cancel=0.6 dmg=22 reach=1.9 radius=1.0 lunge=1.4 knock=3 stun=0.5 armor unblockable limb=hand_r
rend_2: clip=sword_light_b input=skill1 dur=0.85 hit=0.4-0.48 cancel=0.58 dmg=22 reach=1.9 radius=1.0 lunge=1.4 knock=3 stun=0.5 armor unblockable limb=hand_r
rend_3: clip=sword_heavy_c input=skill1 dur=1.6 hit=0.55-0.65 cancel=1.4 dmg=32 reach=2.0 radius=1.1 lunge=1.2 knock=8 stun=0.8 stop=0.14 armor unblockable knockdown limb=hand_r
`;
// The Eclipse Herald: twin blades, a guard-breaking lunge, eclipse bolts at
// a hunter who keeps away, and the red slam.
const heraldMoves = `# Eclipse Herald
cut: clip=sword_light_a input=light dur=0.75 hit=0.26-0.34 cancel=0.45 dmg=20 reach=1.8 radius=0.9 lunge=0.6 knock=4 stun=0.5 limb=hand_r
cut_back: clip=sword_light_b input=light after=cut dur=0.75 hit=0.26-0.34 cancel=0.45 dmg=20 reach=1.8 radius=0.9 lunge=0.5 knock=4 stun=0.5 limb=hand_r
cut_rise: clip=sword_light_c input=light after=cut_back dur=1.0 hit=0.4-0.5 cancel=0.7 dmg=26 reach=1.8 radius=1.0 lunge=0.4 knock=7 stun=0.6 stop=0.12 limb=hand_r
kick: clip=roundhouse_r input=kick dur=0.9 hit=0.38-0.48 cancel=0.6 dmg=16 reach=1.5 height=0.8 lunge=0.4 knock=8 stun=0.6 limb=foot_r
lunge: clip=dash_strike input=heavy dur=1.15 hit=0.48-0.72 cancel=0.9 dmg=30 reach=1.5 lunge=7 knock=9 stun=0.8 stop=0.12 armor guardbreak limb=hand_r
bolt: clip=energy_throw input=special dur=1.1 hit=0.55-0.6 cancel=0.85 dmg=24 projectile=16 knock=4 stun=0.5 track=90 lunge=0 limb=hand_r
red_slam: clip=ground_pound input=special dur=1.8 hit=1.0-1.1 cancel=1.5 dmg=48 aoe=4.6 knock=11 stun=1 stop=0.16 armor unblockable knockdown limb=hand_r
`;

// -- Scripts ----------------------------------------------------------------
const heroScript = `-- Reports blows (the tutorial, the Daily Quest drill), takes its stats from
-- the Ledger, and learns new skills.
function on_melee_hit(target, move, damage, outcome)
  local text = move .. ":" .. outcome
  world.send(world.find("Director"), "hero_hit", text)
  world.send(world.find("Hub"), "hero_hit", text)
end
-- Tells the Director when Thousand Fangs starts: the shadows join in.
local last_move = ""
function on_tick()
  local move = melee.move()
  if move == "thousand_fangs" and last_move ~= move then world.send(world.find("Director"), "ult") end
  last_move = move
end
function on_message(name, value)
  if name == "unlock" then
    melee.unlock(type(value) == "string" and value or "shadow_dash")
  elseif name == "wear" then
    world.wear(type(value) == "string" and value or "")
  elseif name == "mana" and type(value) == "number" then
    melee.mana(value)
  elseif name == "tune" and type(value) == "string" then
    local v = {}
    for n in value:gmatch("[^,]+") do v[#v + 1] = tonumber(n) end
    melee.tune(v[1] or -1, v[2] or -1, v[3] or -1, v[4] or -1, v[5] or -1, v[6] or -1)
  end
end
`;
// A training construct reports how its swings went and never breaks.
const constructScript = (listener: string) => `-- Swings only when its owner says so, and never breaks.
local swinging, t = false, 0
function on_start() melee.set_ai(false) end
function on_message(name)
  if name == "swing_on" then swinging, t = true, 1.5 elseif name == "swing_off" then swinging = false end
end
function on_tick(dt)
  if not swinging then return end
  t = t + dt
  if t > 2.4 and melee.perform("swing") then t = 0 end
end
function on_melee_hit(target, move, damage, outcome)
  world.send(world.find("${listener}"), "construct", outcome)
end
function on_damaged(amount) world.heal(self.id, amount) end
`;
// Enemies that can be Broken tell the Director when they are, so the
// shadows can join in (GAME_DESIGN.md 5.4).
const breakWatch = `local was_broken = false
local function watch_break()
  local _, broken = melee.stagger()
  if broken == 1 and not was_broken then world.send(world.find("Director"), "broken", self.id) end
  was_broken = broken == 1
end
`;
// A shaman mends the goblins around it every few seconds: kill it first.
const shamanScript = `-- Every 7 s, mends the wounded goblins within 7 m by 18.
local t = 3
function on_tick(dt)
  t = t + dt
  if t < 7 then return end
  t = 0
  local x, y, z = world.position(self.id)
  if not x then return end
  local hp = world.health(self.id)
  if not hp or hp <= 0 then return end
  for _, id in ipairs(world.overlap(x, y, z, 7)) do
    local name = world.name(id) or ""
    if id ~= self.id and name:find("oblin") then
      local now, max = world.health(id)
      if now and max and now > 0 and now < max then world.heal(id, 18) end
    end
  end
end
`;
// A boss: a red slam every few seconds; below half health, phase 2 (and
// the Warlord and the Drowned Priest call two of their own). Tells the
// Director when phase 2 starts. `wear` dresses it in armor; `cast` is a
// ranged move it throws every few seconds at a hunter who keeps away.
type BossExtra = { wear?: string; cast?: string };
const bossCast = (move: string) => `  -- Keeping more than 4 m away from it is no escape.
  cast_t = cast_t + dt
  if cast_t < (phase == 1 and 5 or 3.5) then return end
  hero = hero or world.find("Han Seo-jin")
  local hx, _, hz = world.position(hero)
  local x, _, z = world.position(self.id)
  if hx and x and (hx - x) ^ 2 + (hz - z) ^ 2 > 16 and melee.perform("${move}") then cast_t = 0 end
`;
const bossScript = (slam: number, slam2: number, summon: boolean, extra: BossExtra = {}) => `-- Waits for the Director's "wake" (after its intro panels), then the red
-- slam every ${slam} s (${slam2} s in phase 2).
local phase, t, awake = 1, 0, false
${extra.cast ? "local cast_t, hero = 0, nil\n" : ""}${breakWatch}function on_start()
  ${extra.wear ? `world.wear("${extra.wear}")\n  ` : ""}if not awake then melee.set_ai(false) end
end
function on_message(name)
  if name == "wake" then awake = true melee.set_ai(true) end
end
function on_tick(dt)
  if not awake then return end
  watch_break()
  t = t + dt
  local hp, max = world.health(self.id)
  if not hp or hp <= 0 then return end
  if phase == 1 and max and hp < max * 0.5 then
    phase = 2
    melee.set_ai(true, 0.85, 0.6)
    world.send(world.find("Director"), "phase2", ${summon ? "true" : "false"})
  end
  if t > (phase == 1 and ${slam} or ${slam2}) and melee.perform("red_slam") then t = 0 end
${extra.cast ? bossCast(extra.cast) : ""}end
`;

const breakOnly = `${breakWatch}function on_tick() watch_break() end
`;
// An armored enemy puts its plate on (world.wear) and reports its Breaks.
const armoredScript = (wear: string) => `-- Wears its armor and tells the Director when it Breaks.
${breakWatch}function on_start() world.wear("${wear}") end
function on_tick() watch_break() end
`;

// A blood mage blinks away from a hunter who closes within 3 m, to the far
// side of its room (at most every 6 s): catch it right after with Shadow
// Fang (R) or Shadow Step Dash (Q). Its room is the nearest Gate line and
// room centre to where it first stood.
const bloodMageScript = `-- Blinks to the far side of its room when the hunter closes in.
local wait, hero = 2, nil
local cx, cz
local GATE_X = { 0, 120, -120, 240, -240, 360, -360 }
local ROOM_Z = { 0, -24, -48, -72, -100 }
local function nearest(list, v)
  local best
  for _, c in ipairs(list) do
    if not best or math.abs(c - v) < math.abs(best - v) then best = c end
  end
  return best
end
function on_tick(dt)
  wait = wait - dt
  local hp = world.health(self.id)
  local x, y, z = world.position(self.id)
  if not hp or hp <= 0 or not x then return end
  cx, cz = cx or nearest(GATE_X, x), cz or nearest(ROOM_Z, z)
  if wait > 0 then return end
  hero = hero or world.find("Han Seo-jin")
  local hx, _, hz = world.position(hero)
  if not hx or (hx - x) ^ 2 + (hz - z) ^ 2 > 9 then return end
  particles.burst(40)
  world.set_position(self.id, cx + (hx > cx and -6 or 6), y, cz + (hz > cz and -5 or 5))
  world.set_velocity(self.id, 0, 0, 0)
  wait = 6
end
`;

// The Crimson Castellan (the A-rank test): wakes on the Director's "wake";
// a red slam every 8 s (5.5 s in phase 2). Below half health, phase 2: every
// 7 s the Crimson Rend, three red cuts in a row that can't be parried or
// blocked (each cut starts as soon as the last may be cancelled), then a
// long recovery to punish. The phase-2 window (the Director) teaches it.
const castellanScript = (wear: string) => `-- Phase 1: cleaves (parry them) and the red slam. Phase 2: the Crimson Rend.
local phase, t, awake = 1, 0, false
local REND = { "rend_1", "rend_2", "rend_3" }
local rend_t, rending, seen, waited = 0, false, 0, 0
${breakWatch}function on_start()
  world.wear("${wear}")
  if not awake then melee.set_ai(false) end
end
function on_message(name)
  if name == "wake" then awake = true melee.set_ai(true) end
end
-- Keeps asking for the cut after the last one seen; done once the third
-- is under way, or if it stalls (the Castellan was staggered or Broken).
local function tick_rend(dt)
  local move = melee.move()
  for i = #REND, 1, -1 do
    if move == REND[i] then
      if i > seen then seen, waited = i, 0 end
      break
    end
  end
  waited = waited + dt
  if seen == #REND or waited > 1.6 then
    rending = false
    return
  end
  melee.perform(REND[seen + 1])
end
function on_tick(dt)
  if not awake then return end
  watch_break()
  t = t + dt
  local hp, max = world.health(self.id)
  if not hp or hp <= 0 then return end
  if phase == 1 and max and hp < max * 0.5 then
    phase = 2
    rend_t = 4
    melee.set_ai(true, 0.85, 0.65)
    world.send(world.find("Director"), "phase2", false)
  end
  if rending then
    tick_rend(dt)
    return
  end
  if phase == 2 then
    rend_t = rend_t + dt
    if rend_t > 7 then
      -- (The slam waits a little: the rend's recovery is the punish window.)
      rend_t, rending, seen, waited, t = 0, true, 0, 0, math.min(t, 3)
      tick_rend(0)
      return
    end
  end
  if t > (phase == 1 and 8 or 5.5) and melee.perform("red_slam") then t = 0 end
end
`;

// The Eclipse Herald (the S-rank test): wakes on "wake"; a red slam every
// 7 s (4.5 s in phase 2) and eclipse bolts at a hunter who keeps away.
// Below half health, phase 2: it seals itself in the eclipse (every blow on
// it is undone) and the Director calls two Eclipse Wardens: the adds must
// die first. While it is sealed, eclipse sigils open under the hunter every
// 3 s (an arena hazard: step out before they burn), and it holds its slams.
// The last Warden down shatters the seal: the Herald reels, open, for 3 s,
// and its sigils keep coming every 6 s.
const heraldScript = (wear: string) => `-- Phase 2: sealed until its Wardens fall; sigils under the hunter.
local phase, t, awake = 1, 0, false
local sealed, check, sigil_t, reel = false, 0, 0, 0
local shield
local cast_t, hero = 0, nil
${breakWatch}function on_start()
  world.wear("${wear}")
  if not awake then melee.set_ai(false) end
end
function on_message(name)
  if name == "wake" then awake = true melee.set_ai(true) end
end
-- While sealed, whatever lands is given back.
function on_damaged(amount)
  if sealed then world.heal(self.id, amount) end
end
local function wardens(x, y, z)
  local n = 0
  for _, id in ipairs(world.overlap(x, y, z, 40)) do
    if world.name(id) == "Eclipse Warden" then
      local hp = world.health(id)
      if hp and hp > 0 then n = n + 1 end
    end
  end
  return n
end
function on_tick(dt)
  if not awake then return end
  watch_break()
  t = t + dt
  local hp, max = world.health(self.id)
  if not hp or hp <= 0 then return end
  hero = hero or world.find("Han Seo-jin")
  local x, y, z = world.position(self.id)
  if not x then return end
  if phase == 1 and max and hp < max * 0.5 then
    phase, sealed, check, sigil_t = 2, true, -1.5, 1.5
    melee.set_ai(true, 0.85, 0.65)
    shield = world.spawn("Eclipse Seal", x, y, z)
    world.send(world.find("Director"), "phase2", true)
  end
  if phase == 2 then
    sigil_t = sigil_t + dt
    if sigil_t > (sealed and 3 or 6) then
      sigil_t = 0
      local hx, _, hz = world.position(hero)
      if hx then world.spawn("Eclipse Sigil", hx, 0.05, hz) end
    end
  end
  if reel > 0 then
    reel = reel - dt
    if reel <= 0 then melee.set_ai(true, 0.85, 0.65) end
    return
  end
  if sealed then
    check = check + dt
    if check > 0.5 then
      check = 0
      if wardens(x, y, z) == 0 then
        sealed = false
        if shield then world.send(shield, "break") end
        melee.set_ai(false)
        reel = 3
        world.send(world.find("Director"), "boss_say", "THE SEAL SHATTERS|The Herald reels, open. Strike now!\\nIts red slams come faster from here, and the sigils still burn.")
      end
    end
    return
  end
  if t > (phase == 1 and 7 or 4.5) and melee.perform("red_slam") then t = 0 end
${bossCast("bolt")}end
`;
// An eclipse sigil: opens under the hunter and burns 1.6 s later, for 45
// damage to whoever still stands in it; then it fades.
const sigilScript = `-- Burns once, 1.6 s after it opens, then fades.
local t, burnt = 0, false
function on_tick(dt)
  t = t + dt
  if not burnt and t >= 1.6 then
    burnt = true
    particles.burst(90)
    local hero = world.find("Han Seo-jin")
    local hx, _, hz = world.position(hero)
    local x, _, z = world.position(self.id)
    -- The square as drawn (3.4 m), and a little over for the hunter's body.
    if hx and x and math.abs(hx - x) < 1.9 and math.abs(hz - z) < 1.9 then world.damage(hero, 45) end
  end
  if t >= 2.4 then world.destroy(self.id) end
end
`;
// The Herald's seal: rides on the Herald; on "break" it bursts and goes. It
// also goes when the Herald does.
const sealScript = `-- Follows the Eclipse Herald until broken.
local owner, gone
function on_message(name)
  if name == "break" and not gone then
    gone = 1.2
    particles.burst(120)
    particles.set_emitting(false)
  end
end
function on_tick(dt)
  if gone then
    gone = gone - dt
    if gone <= 0 then world.destroy(self.id) end
    return
  end
  owner = owner or world.find("Eclipse Herald")
  local hp = owner and world.health(owner)
  if not hp or hp <= 0 then
    world.destroy(self.id)
    return
  end
  local x, y, z = world.position(owner)
  if x then world.set_position(self.id, x, y, z) end
end
`;

// A shadow (GATEBREAKER M3): a bound enemy risen on the hunter's side. It
// keeps its slot beside him and fights on its own; the Director sends it
// "ult" (his Thousand Fangs) and "strike" (an enemy Broke), and it answers
// with its own big move. An armored kind's shadow wears its armor in black.
const shadowScript = (slot: number, big: string, damage: number, wear = "") => `-- Follows Han Seo-jin in slot ${slot}; joins his ultimate and every Break.
local hero
local release = -1
local clock = 0
function on_start()
  hero = world.find("Han Seo-jin")
  melee.set_ai(true, 0.75, 0.6)
  melee.follow(hero, ${slot})
  melee.tune(${damage}, -1, -1, -1)${wear ? `\n  world.wear("${wear}")` : ""}
end
function on_message(name, value)
  if name == "ult" then
    melee.perform("${big}")
  elseif name == "strike" and type(value) == "number" and world.alive(value) then
    -- A shadow step to the Broken enemy's side, then the big move.
    local tx, ty, tz = world.position(value)
    local x, _, z = world.position(self.id)
    if not tx or not x then return end
    local dx, dz = x - tx, z - tz
    local d = math.sqrt(dx * dx + dz * dz)
    if d > 1.6 then world.set_position(self.id, tx + dx / d * 1.3, ty, tz + dz / d * 1.3) end
    melee.lock(value)
    melee.perform("${big}")
    release = clock + 2
  end
end
function on_tick(dt)
  clock = clock + dt
  if release >= 0 and clock > release then
    release = -1
    melee.lock()
  end
end
`;

// -- Fighters -------------------------------------------------------------------
const HUNTER = modelId("hunter");
const GOBLIN = modelId("goblin");
const MANNEQUIN = 132;
scene.add("Han Seo-jin", [0, 0.9, 6], {
  Scale: { value: vec(0.6, 1.8, 0.6) },
  Rotation: { euler: vec(0, Math.PI, 0) },
  Renderable: { mesh: HUNTER, material: 0, visible: true },
  Player: {},
  RigidBody: { mass: 70, dynamic: true },
  Collider: {},
  CharacterController: { mode: "ThirdPerson", walkSpeed: 5.2, sprintSpeed: 5.2 },
  Health: { current: 220, maximum: 220 },
  Melee: { style: "Custom", moves: heroMoves, team: 0, ai: false, energy: 0, rightHand: modelId("dagger"), leftHand: modelId("dagger"), manaMax: 100, manaRegen: 9 },
  Script: { source: heroScript, props: {} },
});
scene.add("Camera", [0, 3, 10], {
  Camera: { fov: 50, far: 260 },
  CameraFollow: { offset: vec(0, 2.1, -3.9), orbit: true, lookHeight: 1.0 },
});
const construct = (name: string, at: V3, listener: string) =>
  scene.add(name, at, {
    Scale: { value: vec(0.6, 1.8, 0.6) },
    Renderable: { mesh: MANNEQUIN, material: 0, visible: true },
    Material: { color: rgb("#7c8aa5"), roughness: 0.9, keepTextures: false },
    RigidBody: { mass: 400, dynamic: true },
    Collider: {},
    Health: { current: 999, maximum: 999 },
    Melee: { style: "Custom", moves: constructMoves, team: 1, ai: true, aggression: 0, skill: 0 },
    Script: { source: constructScript(listener), props: {} },
  });
construct("Training Construct", [0, 0.9, -3], "Director");

// The enemies, spawned room by room (world.spawn). Name, size, health and
// the rest; the Director keeps the list of who stands where in each room.
// `wear`: the armor its script puts on (gear ids, each with its colour).
// `extra`: more components on its prefab (an aura, its own material).
type Kind = { height: number; width: number; health: number; mesh: number; melee: Components; script?: string; tint?: string; mass: number; wear?: string; extra?: Components };
// Plate armor on the hunter's own rig: body, bracers, trousers, boots and
// pauldron (lua/ledger.lua's gear slots).
const KNIGHT_GEAR = "214:#8a93a3 215:#8a93a3 216:#5a606b 217:#3a3f48 218:#8a93a3";
const FROST_GEAR = "214:#c8dcf0 215:#c8dcf0 216:#7d93ab 217:#4a5a70 218:#c8dcf0";
// The A–S Gates' plate (tints multiply the gear's own dark fills, so they
// are bright): bloodstone red over iron, the Castellan's crimson with a gold
// pauldron, the wardens' sun-gold, the Herald's violet-black and gold.
const BLOODSTONE_GEAR = "214:#ff4a52 215:#9a9098 216:#8a7e88 217:#6a5e66 218:#ff4a52";
const CASTELLAN_GEAR = "214:#ff3040 215:#ffd068 216:#9a4048 217:#6a4a50 218:#ffd068";
const WARDEN_GEAR = "214:#fff0b0 215:#fff0b0 216:#d0b070 217:#a08a60 218:#ffe080";
const HERALD_GEAR = "214:#8a70b0 215:#ffd068 216:#6a5888 217:#5a4a70 218:#ffd068";
const TALARI = modelId("talari");
// A flat body colour in place of the rig's own, whose dark suit swallows any
// tint: the A–S Gates' fighters read by colour at a glance.
const flat = (hex: string, glow = "#000000", glowLevel = 0) => ({
  Material: { color: rgb(hex), emissive: rgb(glow), emissiveIntensity: glowLevel, roughness: 0.7, keepTextures: false },
});
const kinds: Record<string, Kind> = {
  "Goblin Grunt": { height: 1.45, width: 0.5, health: 60, mesh: GOBLIN, mass: 45, melee: { moves: gruntMoves, aggression: 0.6, skill: 0.3, rightHand: modelId("knife") } },
  "Goblin Archer": { height: 1.45, width: 0.5, health: 40, mesh: GOBLIN, mass: 45, melee: { moves: archerMoves, aggression: 0.6, skill: 0.3, leftHand: modelId("bow"), range: 7 } },
  "Goblin Shieldbearer": {
    height: 1.45,
    width: 0.5,
    health: 110,
    mesh: GOBLIN,
    mass: 50,
    script: breakOnly,
    melee: { moves: shieldMoves, aggression: 0.4, skill: 0.6, rightHand: modelId("knife"), leftHand: modelId("shield-round"), shield: true, guard: 220, poise: 70, breakTime: 2.5 },
  },
  Hobgoblin: {
    height: 1.85,
    width: 0.6,
    health: 150,
    mesh: GOBLIN,
    mass: 90,
    tint: "#b06a4c",
    script: breakOnly,
    melee: { moves: hobgoblinMoves, aggression: 0.5, skill: 0.4, rightHand: modelId("axe-double"), poise: 80, breakTime: 2.2, guard: 140 },
  },
  "Goblin Shaman": {
    height: 1.4,
    width: 0.5,
    health: 55,
    mesh: GOBLIN,
    mass: 40,
    tint: "#8f7ad8",
    script: shamanScript,
    melee: { moves: shamanMoves, aggression: 0.5, skill: 0.4, rightHand: modelId("scythe"), range: 8 },
  },
  "Goblin Chieftain": {
    height: 2.1,
    width: 0.8,
    health: 420,
    mesh: GOBLIN,
    mass: 160,
    script: bossScript(8, 5, false),
    melee: { moves: chieftainMoves, aggression: 0.55, skill: 0.45, guard: 160, rightHand: modelId("claymore"), poise: 130, breakTime: 3.5 },
  },
  "Hobgoblin Brute": {
    height: 2.4,
    width: 0.9,
    health: 560,
    mesh: GOBLIN,
    mass: 220,
    tint: "#9c5a40",
    script: bossScript(7, 4.5, false),
    melee: { moves: bruteMoves, aggression: 0.55, skill: 0.45, guard: 200, rightHand: modelId("axe-double"), poise: 160, breakTime: 3.5 },
  },
  "Goblin Warlord": {
    height: 2.25,
    width: 0.85,
    health: 720,
    mesh: GOBLIN,
    mass: 180,
    tint: "#6f7a8c",
    script: bossScript(7, 4, true),
    melee: { moves: warlordMoves, aggression: 0.6, skill: 0.6, guard: 220, rightHand: modelId("claymore"), leftHand: modelId("shield-round"), poise: 190, breakTime: 3.5 },
  },
  // The Flooded Temple and the Ice Fortress (C–B). There is no rigged spider
  // or wolf on the combat skeleton, so their packs are ghouls and drowned
  // goblins.
  "Drowned Goblin": { height: 1.45, width: 0.5, health: 85, mesh: GOBLIN, mass: 50, tint: "#5d817e", melee: { moves: gruntMoves, aggression: 0.6, skill: 0.35, rightHand: modelId("knife") } },
  "Ice Ghoul": {
    height: 1.45,
    width: 0.5,
    health: 75,
    mesh: GOBLIN,
    mass: 45,
    tint: "#b8d6f2",
    melee: { moves: ghoulMoves, aggression: 0.85, skill: 0.35, reaction: 0.2 },
  },
  "Armored Knight": {
    height: 1.9,
    width: 0.6,
    health: 170,
    mesh: HUNTER,
    mass: 95,
    tint: "#8a93a3",
    wear: KNIGHT_GEAR,
    script: armoredScript(KNIGHT_GEAR),
    melee: { moves: knightMoves, aggression: 0.5, skill: 0.55, rightHand: modelId("sword"), leftHand: modelId("shield-round"), shield: true, guard: 260, poise: 110, breakTime: 2.5 },
  },
  "Cultist Caster": {
    height: 1.8,
    width: 0.55,
    health: 70,
    mesh: HUNTER,
    mass: 60,
    tint: "#4b2a66",
    melee: { moves: casterMoves, aggression: 0.5, skill: 0.4, rightHand: modelId("spear"), range: 8 },
  },
  "Drowned Priest": {
    height: 2.2,
    width: 0.8,
    health: 950,
    mesh: HUNTER,
    mass: 170,
    tint: "#2f6a6e",
    script: bossScript(9, 6, true, { cast: "tide" }),
    melee: { moves: priestMoves, aggression: 0.55, skill: 0.5, guard: 200, rightHand: modelId("scythe"), poise: 210, breakTime: 3.5 },
  },
  "Frost Knight Commander": {
    height: 2.3,
    width: 0.85,
    health: 1200,
    mesh: HUNTER,
    mass: 220,
    tint: "#a9c4dc",
    wear: FROST_GEAR,
    script: bossScript(7, 4.5, false, { wear: FROST_GEAR }),
    melee: {
      moves: commanderMoves,
      aggression: 0.6,
      skill: 0.65,
      guard: 320,
      rightHand: modelId("sword-2"),
      leftHand: modelId("shield-round"),
      shield: true,
      poise: 240,
      breakTime: 4,
    },
  },
  // The Bloodstone Citadel and the Eclipse Spire (A–S). Still no new rigged
  // monster exists on the combat skeleton: imps are small red goblins,
  // knights, wardens and the two masters wear plate on the hunter's rig,
  // blood mages are the crested Talari, and hollows the bare mannequin.
  "Castle Imp": { height: 1.2, width: 0.45, health: 120, mesh: GOBLIN, mass: 40, extra: flat("#d04434", "#5a0a06", 0.3), melee: { moves: impMoves, aggression: 0.8, skill: 0.35, reaction: 0.25, rightHand: modelId("knife") } },
  "Bloodstone Knight": {
    height: 1.95,
    width: 0.65,
    health: 360,
    mesh: HUNTER,
    mass: 110,
    extra: flat("#a8343c"),
    wear: BLOODSTONE_GEAR,
    script: armoredScript(BLOODSTONE_GEAR),
    melee: { moves: bloodKnightMoves, aggression: 0.55, skill: 0.6, rightHand: modelId("claymore"), guard: 280, poise: 150, breakTime: 2.5 },
  },
  "Blood Mage": {
    height: 1.85,
    width: 0.55,
    health: 170,
    mesh: TALARI,
    mass: 60,
    tint: "#b0283c",
    script: bloodMageScript,
    melee: { moves: bloodMageMoves, aggression: 0.55, skill: 0.45, range: 8 },
    extra: {
      Particles: { preset: "Sparkle", rate: 8, lifetime: 0.9, speed: 0.6, size: 0.08, color: rgb("#ff4a5a"), endColor: rgb("#5a0a14"), endSize: 0.02, shape: "Sphere", shapeSize: 0.6 },
    },
  },
  "Crimson Castellan": {
    height: 2.5,
    width: 0.9,
    health: 3200,
    mesh: HUNTER,
    mass: 240,
    extra: flat("#c0303a", "#4a0608", 0.25),
    wear: CASTELLAN_GEAR,
    script: castellanScript(CASTELLAN_GEAR),
    melee: { moves: castellanMoves, aggression: 0.6, skill: 0.65, guard: 340, rightHand: modelId("claymore"), poise: 300, breakTime: 4 },
  },
  Hollow: {
    height: 1.8,
    width: 0.55,
    health: 120,
    mesh: MANNEQUIN,
    mass: 55,
    melee: { moves: hollowMoves, aggression: 0.85, skill: 0.4, reaction: 0.2, rightHand: modelId("knife"), leftHand: modelId("knife") },
    // Bone-pale with a red glow: nothing like the hunter's violet shadows.
    extra: { Material: { color: rgb("#ded6cc"), emissive: rgb("#c0102e"), emissiveIntensity: 0.35, roughness: 0.6, keepTextures: false } },
  },
  "Eclipse Warden": {
    height: 2.0,
    width: 0.65,
    health: 360,
    mesh: HUNTER,
    mass: 120,
    extra: flat("#e8d49a"),
    wear: WARDEN_GEAR,
    script: armoredScript(WARDEN_GEAR),
    melee: { moves: wardenMoves, aggression: 0.55, skill: 0.6, rightHand: modelId("spear"), leftHand: modelId("shield-round"), shield: true, guard: 300, poise: 170, breakTime: 2.5 },
  },
  "Eclipse Herald": {
    height: 2.6,
    width: 0.95,
    health: 3400,
    mesh: HUNTER,
    mass: 260,
    extra: flat("#7a5a9a", "#2a0a3a", 0.25),
    wear: HERALD_GEAR,
    script: heraldScript(HERALD_GEAR),
    melee: { moves: heraldMoves, aggression: 0.65, skill: 0.7, guard: 360, rightHand: modelId("sword-2"), leftHand: modelId("sword"), poise: 340, breakTime: 4 },
  },
};
for (const [name, kind] of Object.entries(kinds))
  scene.prefab(name, {
    Scale: { value: vec(kind.width, kind.height, kind.width) },
    Renderable: { mesh: kind.mesh, material: 0, visible: true },
    ...(kind.tint ? { Material: { color: rgb(kind.tint), roughness: 0.85, keepTextures: true } } : {}),
    RigidBody: { mass: kind.mass, dynamic: true },
    Collider: {},
    Health: { current: kind.health, maximum: kind.health },
    Melee: { style: "Custom", team: 1, ai: true, reaction: 0.35, ...kind.melee },
    ...(kind.script ? { Script: { source: kind.script, props: {} } } : {}),
    ...(kind.extra ?? {}),
  });

// Field enemies (M4, lua/world.lua): each kind again as "Field <name>",
// its own script (if any) wrapped so the World can put it on its pack's
// anchor with the hour's numbers ("field": leader id, damage and health
// scales, 1 to hand it to its brain) and put it away when it falls
// ("stash": revived and asleep, pooled for its pack's return).
const fieldHook = `
-- Out in the district (lua/world.lua): its pack's anchor, its numbers, and
-- back to the pool when it falls.
local own_message = on_message
function on_message(name, value, sender)
  if name == "field" and type(value) == "string" then
    local leader, damage, health, ai = value:match("^(%d+),([%d.]+),([%d.]+),(%d)$")
    if not leader then return end
    melee.follow(math.tointeger(tonumber(leader)), 2)
    melee.tune(tonumber(damage), -1, -1, -1, tonumber(health))
    if ai == "1" then melee.set_ai(true) end
  elseif name == "stash" then
    melee.follow()
    melee.set_ai(false)
    melee.lock()
    melee.revive()
  elseif own_message then
    own_message(name, value, sender)
  end
end
`;
for (const [name, kind] of Object.entries(kinds))
  scene.prefab(`Field ${name}`, {
    ...scene.prefabs[name]!.components,
    Script: { source: (kind.script ?? "") + fieldHook, props: {} },
  });

// Shadows: each bindable kind, risen. Its role decides its slot (tank on
// the left, striker on the right, archer behind); bosses' shadows hit a
// little softer so the hunter stays the one who wins the fight.
const SHADOWS: [string, number, string, number][] = [
  ["Goblin Shieldbearer", 0, "bash", 0.8],
  ["Hobgoblin Brute", 0, "red_slam", 0.6],
  ["Hobgoblin", 1, "crush", 0.8],
  ["Goblin Chieftain", 1, "red_slam", 0.6],
  ["Goblin Warlord", 1, "red_slam", 0.6],
  ["Goblin Shaman", 2, "hex", 0.8],
  ["Armored Knight", 0, "overhead", 0.8],
  ["Drowned Priest", 1, "red_slam", 0.6],
  ["Frost Knight Commander", 1, "red_slam", 0.6],
  ["Cultist Caster", 2, "curse", 0.8],
  ["Bloodstone Knight", 0, "rend", 0.8],
  ["Eclipse Warden", 0, "sun_lance", 0.8],
  ["Crimson Castellan", 1, "red_slam", 0.6],
  ["Eclipse Herald", 1, "red_slam", 0.6],
  ["Blood Mage", 2, "bolt", 0.8],
];
for (const [name, slot, big, damage] of SHADOWS) {
  const kind = kinds[name]!;
  scene.prefab(`Shadow ${name}`, {
    Scale: { value: vec(kind.width, kind.height, kind.width) },
    Renderable: { mesh: kind.mesh, material: 0, visible: true },
    Material: { color: rgb("#3b3160"), emissive: rgb("#5b34d6"), emissiveIntensity: 0.35, roughness: 0.9, keepTextures: true },
    RigidBody: { mass: kind.mass, dynamic: true },
    Collider: {},
    Health: { current: kind.health, maximum: kind.health },
    Melee: { style: "Custom", ai: true, reaction: 0.3, ...kind.melee, team: 0 },
    Particles: { preset: "Sparkle", rate: 10, lifetime: 0.9, speed: 0.5, size: 0.07, color: rgb("#9a7bff"), endColor: rgb("#2a145c"), endSize: 0.02, shape: "Sphere", shapeSize: kind.height * 0.35 },
    Script: { source: shadowScript(slot, big, damage, kind.wear?.replace(/#[0-9a-f]{6}/g, "#2a2140")), props: {} },
  });
}

// Loot on the floor: a beam in its rarity's colour (white, blue, purple,
// gold; potions green), so you can read its worth from across the room.
for (const [kind, hex, rate] of [
  ["Common", "#e8e8e8", 14],
  ["Rare", "#4aa8ff", 22],
  ["Epic", "#b866ff", 30],
  ["Legendary", "#ffb020", 40],
  ["Potion", "#7dffa0", 12],
] as const)
  scene.prefab(`Loot ${kind}`, {
    Renderable: { visible: false },
    Particles: { preset: "Sparkle", rate, lifetime: 1.1, speed: 2.2, size: 0.09, color: rgb(hex), endColor: rgb(hex), endSize: 0.03, shape: "Sphere", shapeSize: 0.12 },
  });

// Black-violet smoke over a body that can still be bound (8 s).
scene.prefab("Shadow Mark", {
  Renderable: { visible: false },
  Particles: { preset: "Smoke", rate: 26, lifetime: 1.4, speed: 0.9, size: 0.35, color: rgb("#3a2470"), endColor: rgb("#0c0618"), endSize: 0.9, shape: "Sphere", shapeSize: 0.5 },
});

// The Eclipse Herald's phase 2: a red sigil (a glowing rune square, sparks
// rising off it) that burns where the hunter stood, and the gold-and-red
// seal around the Herald while its Wardens stand.
scene.prefab("Eclipse Sigil", {
  Scale: { value: vec(3.4, 0.04, 3.4) },
  Renderable: { mesh: 0, material: 0, visible: true },
  Material: { color: rgb("#ff2a5a"), emissive: rgb("#ff1a4a"), emissiveIntensity: 1.4, opacity: 0.55, roughness: 0.6, keepTextures: false },
  Particles: { preset: "Fire", rate: 26, lifetime: 0.7, speed: 0.9, size: 0.1, color: rgb("#ff7a9a"), endColor: rgb("#5a0a2a"), endSize: 0.5, shape: "Box", shapeSize: 1.2 },
  Script: { source: sigilScript, props: {} },
});
scene.prefab("Eclipse Seal", {
  Renderable: { visible: false },
  Particles: { preset: "Sparkle", rate: 70, lifetime: 0.8, speed: 0.4, size: 0.12, color: rgb("#ffd27a"), endColor: rgb("#ff2a5a"), endSize: 0.03, shape: "Sphere", shapeSize: 1.6 },
  Script: { source: sealScript, props: {} },
});

// -- The plaza: the prologue's set, then the hub ------------------------------
// The Hunter Association's square at night, the sealed Double Gate at its
// north end. The hub is the part between the buildings (x -16..16,
// z 40..64), fenced by invisible walls.
scene.box("Plaza", [0, -0.07, 58], [70, 0.1, 50], "#34333d", { Collider: { type: "AABB", isTrigger: true } });
// Stone paving where the hunter walks (the hub, x -16..16, z 40..64).
setName = "Hub";
for (let x = -14; x <= 14; x += 4) for (let z = 42; z <= 62; z += 4) place(dungeon(CAVE.floor), x, z, 0, false, FLOOR);
flushSets();
for (const [id, x, z, yaw] of [
  [20, -24, 66, Math.PI / 2],
  [21, 24, 70, -Math.PI / 2],
  [8, -22, 46, Math.PI / 2],
  [9, 22, 48, -Math.PI / 2],
  [22, -12, 84, 0],
  [10, 12, 86, 0],
] as const)
  scene.model(`Plaza building ${id}`, id, [x, 0, z], yaw, false);
for (const [name, at, size] of [
  ["Hub fence W", [-16.5, 2, 52], [1, 4, 26]],
  ["Hub fence E", [16.5, 2, 52], [1, 4, 26]],
  ["Hub fence S", [0, 2, 39.5], [34, 4, 1]],
  ["Hub fence N", [0, 2, 64.5], [34, 4, 1]],
] as const)
  scene.box(name, at as unknown as V3, size as unknown as V3, "#000000", { Renderable: { mesh: 0, material: 0, visible: false } });
// The Double Gate: two stone pillars, a lintel, and the rift between them.
scene.box("Double Gate pillar L", [-4.2, 4, 70], [1.4, 8, 1.4], "#3a3346");
scene.box("Double Gate pillar R", [4.2, 4, 70], [1.4, 8, 1.4], "#3a3346");
scene.box("Double Gate lintel", [0, 8.4, 70], [10, 1.2, 1.6], "#3a3346");
scene.box("Double Gate rift", [0, 3.9, 70.2], [7, 7.6, 0.2], "#1a0c33", { Collider: { type: "AABB", isTrigger: true } }, {
  emissive: rgb("#6b2bff"),
  emissiveIntensity: 2.2,
});
scene.add("Double Gate glow", [0, 4, 68], {
  Renderable: { visible: false },
  Light: { type: "Point", color: rgb("#8a4dff"), intensity: 22, range: 24, castShadows: false },
  Particles: { preset: "Sparkle", rate: 60, lifetime: 1.6, speed: 0.8, size: 0.18, color: rgb("#b48cff"), endColor: rgb("#3a10a0"), shape: "Box", shapeSize: 3.2 },
});
// Han Seo-jin at the plaza, facing the Gate, and what comes out of it.
scene.add("Prologue Seo-jin", [0, 0.9, 52], {
  Scale: { value: vec(0.6, 1.8, 0.6) },
  Renderable: { mesh: HUNTER, material: 0, visible: true },
  RigidBody: { dynamic: false },
  Collider: { isTrigger: true },
});
for (const [x, z] of [
  [-1.6, 66.5],
  [1.4, 67.2],
  [0, 66],
] as const)
  scene.add(`Prologue goblin ${x}`, [x, 0.725, z], {
    Scale: { value: vec(0.5, 1.45, 0.5) },
    Rotation: { euler: vec(0, Math.PI, 0) },
    Renderable: { mesh: GOBLIN, material: 0, visible: true },
    RigidBody: { dynamic: false },
    Collider: { isTrigger: true },
  });
for (const [x, z, hex] of [
  [0, 50, "#9fb4ff"],
  [-14, 60, "#7f9cff"],
  [14, 62, "#7f9cff"],
] as const)
  scene.add(`Plaza light ${x}`, [x, 7, z], {
    Renderable: { visible: false },
    Light: { type: "Point", color: rgb(hex), intensity: 48, range: 32, castShadows: false },
  });

// The hub's stations (lua/hub.lua knows where they are).
// The Gate Board: a tall glowing panel listing the open Gates.
scene.box("Gate Board", [-10, 1.6, 58], [2.6, 2.4, 0.25], "#0c2a3a", {}, { emissive: rgb("#3fd0ff"), emissiveIntensity: 1.4 });
scene.box("Gate Board stand", [-10, 0.25, 58], [0.4, 0.5, 0.4], "#2a2d36");
scene.add("Gate Board light", [-10, 2.6, 56.5], { Renderable: { visible: false }, Light: { type: "Point", color: rgb("#5fdcff"), intensity: 12, range: 9, castShadows: false } });
// The smith's stall: an anvil, crates, a broken blade on display.
scene.box("Smith anvil", [10, 0.45, 58], [1.0, 0.9, 0.55], "#30323a", {}, { metalness: 0.7, roughness: 0.35 });
scene.model("Smith crates", dungeon("crates-stacked"), [12.5, 0, 59.5], -0.4);
scene.model("Smith barrel", dungeon("barrel-large"), [7.6, 0, 59.6]);
scene.model("Smith display", dungeon("sword-shield-broken"), [11.8, 0, 61], 0.6, false);
scene.add("Smith forge", [10.6, 1.1, 60], {
  Renderable: { visible: false },
  Light: { type: "Point", color: rgb("#ff8a3a"), intensity: 14, range: 9, castShadows: false },
  Particles: { preset: "Fire", rate: 26, lifetime: 0.5, speed: 0.7, size: 0.16, color: rgb("#ffc04a"), endColor: rgb("#ff3a0c"), endSize: 0.32, shape: "Sphere", shapeSize: 0.12 },
});
// The training mat and its construct, for the Daily Quest drill.
scene.box("Training mat", [-9, 0.02, 45], [4.5, 0.04, 4.5], "#5a1f24", { Collider: { type: "AABB", isTrigger: true } });
construct("Hub Construct", [-9, 0.9, 44], "Hub");
// The door home: rest, end the day, save.
scene.box("Home door", [10, 1.2, 40.6], [1.4, 2.4, 0.2], "#3a2a22");
scene.add("Home lamp", [10, 2.8, 41.2], { Renderable: { visible: false }, Light: { type: "Point", color: rgb("#ffd59a"), intensity: 8, range: 6, castShadows: false } });
// People of the Association: a clerk by the board, the smith at the anvil.
const npc = (name: string, at: V3, yaw: number, tint: string) =>
  scene.add(name, at, {
    Scale: { value: vec(0.6, 1.8, 0.6) },
    Rotation: { euler: vec(0, yaw, 0) },
    Renderable: { mesh: MANNEQUIN, material: 0, visible: true },
    Material: { color: rgb(tint), roughness: 0.8, keepTextures: false },
    RigidBody: { dynamic: false },
    Collider: {},
  });
npc("Association Clerk", [-12.2, 0.9, 58.6], Math.PI * 0.85, "#3d4a66");
npc("Smith Kang", [10, 0.9, 59.6], Math.PI, "#6a4632");
// Quest givers out in the district (lua/ledger.lua's side quests find them
// by name): a ! over their heads while a quest is on offer.
npc("Officer Yoon", [3, 0.9, 38.5], 0, "#2c3f6e"); // the Association's patrol, at the hub's open south side
npc("Courier Bae", [-39, 0.9, 38], Math.PI / 2, "#d8782c"); // by Station A
npc("Apprentice Jin", [18, 0.9, 178], Math.PI, "#7a5232"); // Smith Kang's apprentice, at Hangang plaza
// "[G] Talk: Officer Yoon", above the World prompt.
scene.add("Quest prompt", [0, 0, 0], {
  UI: { text: "", anchor: "bottom-center", offsetY: -180, fontSize: 18, color: vec(1, 0.88, 0.45), opacity: 0.95 },
});

// -- The district around the hub (M4: district.ts, lua/world.lua) ------------
buildDistrict(scene);
scene.add("World", [0, 0, 0], { Script: { source: lua("world.lua"), props: { fast: false } } });

// -- The district map (M4: the minimap and M, apps/editor/src/editor/minimap.ts)
// hud.map_layout's text, read off what was built above, so it follows the
// district when that changes: flat pads, the plaza and the river as areas,
// the road tiles as strips, every building's footprint, the trees, and the
// places a hunter looks for. The Map script sends it at start.
function districtMapLayout(): string {
  const { west, east, south, north } = DISTRICT;
  const lines = [`bounds ${west} ${south} ${east} ${north}`];
  const n = (v: number) => String(Math.round(v * 10) / 10);
  // Clipped to what the map shows (the bounds and a margin).
  const box = (x0: number, z0: number, x1: number, z1: number) => {
    const c = [Math.max(x0, west - 12), Math.max(z0, south - 12), Math.min(x1, east + 12), Math.min(z1, north + 12)];
    return c[0]! < c[2]! && c[1]! < c[3]! ? c.map(n).join(" ") : undefined;
  };
  const category = (id: number) => modelCatalog.find((m) => m.id === id);
  const hex = (c: { x: number; y: number; z: number }, lift: number) =>
    "#" + [c.x, c.y, c.z].map((v) => Math.round((v + (1 - v) * lift) * 255).toString(16).padStart(2, "0")).join("");
  const roads = new Map<number, number[]>(); // z -> the x of each tile
  for (const e of scene.entities) {
    const c = e.components as Record<string, any>;
    const at = c.Transform?.position;
    const size = c.Scale?.value;
    // Flat, visible boxes: pads, the plaza, the training mat, the river.
    if (at && size && c.Material && c.Renderable?.visible !== false && c.Renderable?.mesh === 0 && size.y <= 0.12) {
      const r = box(at.x - size.x / 2, at.z - size.z / 2, at.x + size.x / 2, at.z + size.z / 2);
      const color = /river/i.test(e.name) ? "#1f4f88" : /lawn/i.test(e.name) ? "#2c5c36" : hex(c.Material.color, 0.1);
      if (r) lines.push(`area ${r} ${color}`);
      // The hub's paving (instanced tiles) over the plaza.
      if (e.name === "Plaza") lines.push("area -16 40 16 64 #545263");
    }
    // Catalog buildings placed one by one (the Association's towers).
    const model = c.Renderable?.mesh > 0 ? category(c.Renderable.mesh) : undefined;
    if (at && size && model?.category === "buildings") {
      const turned = Math.abs(Math.sin(c.Rotation?.euler.y ?? 0)) > 0.7;
      const [w, d] = turned ? [size.z, size.x] : [size.x, size.z];
      const r = box(at.x - w / 2, at.z - d / 2, at.x + w / 2, at.z + d / 2);
      if (r) lines.push(`building ${r}`);
    }
    if (!c.ModelInstances) continue;
    for (const instance of parseModelInstances(c.ModelInstances.instances).instances) {
      const entry = category(instance.model);
      const x = (at?.x ?? 0) + instance.x,
        z = (at?.z ?? 0) + instance.z;
      if (entry?.category === "roads") roads.set(z, [...(roads.get(z) ?? []), x]);
      else if (entry?.category === "buildings") {
        const { min, max } = modelBounds(instance.model);
        const b = instanceBox(instance, { x: max[0]! - min[0]!, y: max[1]! - min[1]!, z: max[2]! - min[2]! });
        const r = box(x - b.sx / 2, z - b.sz / 2, x + b.sx / 2, z + b.sz / 2);
        if (r) lines.push(`building ${r}`);
      } else if (entry?.name.startsWith("Tree") && box(x, z, x + 0.1, z + 0.1)) lines.push(`tree ${n(x)} ${n(z)}`);
    }
  }
  // Road tiles (16 m) joined into strips along x.
  for (const [z, xs] of roads) {
    xs.sort((a, b) => a - b);
    let start = xs[0]!;
    xs.forEach((x, i) => {
      if (xs[i + 1] === x + 16) return;
      const r = box(start - 8, z - 8, x + 8, z + 8);
      if (r) lines.push(`road ${r}`);
      start = xs[i + 1]!;
    });
  }
  // Points of interest, where their entities stand.
  const where = (name: string) => scene.entities.find((e) => e.name === name)!.components.Transform!.position;
  const titles: Record<string, string> = { "Station A": "Association Station", "Station B": "Hangang Station" };
  for (const st of DISTRICT.stations) lines.push(`poi station ${st.x} ${st.z} ${titles[st.name] ?? st.name}`);
  for (const site of DISTRICT.sites) lines.push(`poi site ${site.x} ${site.z}`);
  for (const [kind, name, label] of [
    ["board", "Gate Board", "Gate Board"],
    ["smith", "Smith Kang", "Smith Kang"],
    ["home", "Home door", "Home"],
    ["mat", "Training mat", ""],
  ] as const) {
    const p = where(name);
    lines.push(`poi ${kind} ${n(p.x)} ${n(p.z)} ${label}`.trimEnd());
  }
  for (const [x, z, text] of [
    [0, 220, "Han river"],
    [36, 24, "Association street"],
    [-30, 120, "Midtown street"],
    [-30, 200, "Gangbyeon street"],
    [-32, 137, "The park"],
    [32, 136, "Hangang plaza"],
    [0, 92, "Hunter Association"],
    [88, 92, "The east lot"],
  ] as const)
    lines.push(`label ${x} ${z} ${text}`);
  return lines.join("\n");
}
scene.add("Map", [0, 0, 0], {
  Script: {
    source: `-- The district map: the minimap and the M map (apps/editor/src/editor/minimap.ts).
-- Generated by tools/gatebreaker/build_game.ts from the district's own layout.
local LAYOUT = [[
${districtMapLayout()}
]]

function on_start()
  hud.map_layout(LAYOUT)
end
`,
    props: {},
  },
});

const document = { format: 1, name: "GATEBREAKER", entities: scene.entities, prefabs: scene.prefabs } as SceneDocument;
validateSceneDocument(document);
const out = process.env.GB_GAME_OUT || join(ROOT, "examples/gatebreaker/gatebreaker.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(document, null, 2)}\n`);
console.log(`wrote ${out} (${scene.entities.length} entities, ${Object.keys(scene.prefabs).length} prefabs)`);
