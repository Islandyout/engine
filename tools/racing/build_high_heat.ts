// Generates HIGH HEAT (examples/racing/high-heat.json), the street racer built
// on this engine -- see docs/racing/GAME_DESIGN.md. Run from apps/editor:
//
//   npm run racing
//
// Bayview is a grid: avenues (along z) and streets (along x) every GRID
// metres, built from 16 m road tiles. Event routes, traffic loops, police
// patrols and spawn points are all derived from grid intersections, so the
// layout, the racing lines and the director's tables stay in step.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultComponent } from "../../apps/editor/src/authoring/CommandInterpreter";
import { validateSceneDocument } from "../../apps/editor/src/scene/SceneSerializer";
import type { SceneDocument } from "../../apps/editor/src/scene/SceneSerializer";

type Components = Record<string, unknown>;
type P2 = [number, number];
const here = dirname(fileURLToPath(import.meta.url));
const vec = (x: number, y: number, z: number) => ({ x, y, z });
const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return vec(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};
const component = (type: string, overrides: Record<string, unknown> = {}) => ({
  ...(defaultComponent(type as never) as object),
  ...overrides,
});
// Deterministic randomness so the generated file is stable.
let seed = 20261003;
const random = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)]!;

// ------------------------------------------------------------------- grid --
const GRID = 96; // metres between road centre lines
const HALF = 4; // grid lines run from -HALF to HALF
const TILE = 16;
const EDGE = GRID * HALF; // 384
const at = (i: number) => i * GRID;

const entities: SceneDocument["entities"] = [];
const add = (name: string, position: [number, number, number], components: Components) =>
  entities.push({ name, components: { Transform: { position: vec(...position) }, ...components } as never });
const material = (hex: string, extra: Record<string, unknown> = {}) =>
  component("Material", { color: rgb(hex), roughness: 0.85, keepTextures: false, ...extra });

// Roads: straight tiles along every line, crossings at intersections, T and
// bend tiles where lines meet the edge. Road tiles run along z; yaw 90 turns
// them along x.
const roads: string[] = [];
const isLine = (v: number) => Math.abs(((v % GRID) + GRID) % GRID) < 1e-6 && Math.abs(v) <= EDGE;
for (let x = -EDGE; x <= EDGE; x += TILE)
  for (let z = -EDGE; z <= EDGE; z += TILE) {
    const onX = isLine(x),
      onZ = isLine(z);
    if (!onX && !onZ) continue;
    if (onX && onZ) {
      const corner = Math.abs(x) === EDGE && Math.abs(z) === EDGE;
      const edgeX = Math.abs(x) === EDGE,
        edgeZ = Math.abs(z) === EDGE;
      if (corner) {
        // Road Bend: opens toward +x and +z at yaw 0 (checked visually).
        const yaw = x < 0 ? (z < 0 ? 0 : 90) : z < 0 ? 270 : 180;
        roads.push(`54 ${x} ${z} ${yaw}`);
      } else if (edgeX || edgeZ) {
        // Road T: the stem points inward.
        const yaw = edgeX ? (x < 0 ? 270 : 90) : z < 0 ? 180 : 0;
        roads.push(`66 ${x} ${z} ${yaw}`);
      } else roads.push(`56 ${x} ${z} 0`);
    } else if (onX) roads.push(`64 ${x} ${z} 0`);
    else roads.push(`64 ${x} ${z} 90`);
  }

// Buildings: four plots per block, downtown tall, outskirts lower.
const BUILDINGS: Array<{ id: number; size: [number, number, number]; downtown: boolean }> = [
  { id: 20, size: [30.58, 86.3, 26.16], downtown: true },
  { id: 21, size: [30.17, 85.43, 25.91], downtown: true },
  { id: 22, size: [27.12, 89.3, 23.25], downtown: true },
  { id: 8, size: [23.72, 30.15, 18.89], downtown: true },
  { id: 10, size: [16.23, 16.55, 16.31], downtown: false },
  { id: 2, size: [17.31, 31.33, 14.51], downtown: false },
  { id: 14, size: [22.91, 8.4, 21.37], downtown: false },
  { id: 17, size: [9.52, 9.5, 14.31], downtown: false },
];
const buildings: string[] = [];
const blocks: P2[] = [];
for (let i = -HALF; i < HALF; i++)
  for (let j = -HALF; j < HALF; j++) {
    const cx = at(i) + GRID / 2,
      cz = at(j) + GRID / 2;
    blocks.push([cx, cz]);
    const downtown = Math.hypot(cx, cz) < 150;
    for (const [qx, qz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const) {
      const options = BUILDINGS.filter((b) => (downtown ? true : !b.downtown) && (downtown || b.id !== 20));
      const b = downtown && random() < 0.5 ? pick(BUILDINGS.filter((o) => o.downtown)) : pick(options);
      const yaw = pick([0, 90, 180, 270]);
      const footprint = Math.max(b.size[0], b.size[2]);
      const scale = Math.min(1, 30 / footprint) * (0.85 + random() * 0.15);
      // Plots sit inside the 80 m block, clear of the 16 m road.
      buildings.push(`${b.id} ${cx + qx * 19} ${cz + qz * 19} ${yaw} ${scale.toFixed(3)} solid`);
    }
  }

// Streetlamps along the avenues and streets, on the kerb.
const lamps: string[] = [];
for (let i = -HALF; i <= HALF; i++)
  for (let s = -EDGE + 24; s < EDGE; s += 48) {
    if (isLine(s)) continue;
    lamps.push(`35 ${at(i) + 9.5} ${s} 270`, `35 ${s} ${at(i) - 9.5} 0`);
  }

// ------------------------------------------------------------------ scene --
add("Environment", [0, -30, 0], {
  Environment: component("Environment", {
    sky: "Procedural",
    skyColor: rgb("#5b86c4"),
    horizonColor: rgb("#f2c98e"),
    groundColor: rgb("#3b3a33"),
    sunElevation: 21,
    sunAzimuth: 250,
    sunIntensity: 3.6,
    sunColor: rgb("#ffcf8a"),
    ambientIntensity: 1.2,
    fog: "Exponential",
    fogColor: rgb("#d9c8a2"),
    fogNear: 60,
    fogFar: 500,
    fogDensity: 0.0032,
    shadows: true,
    exposure: 1.05,
  }),
  // The street-racer grade: warm, a touch green-yellow, punchy.
  PostProcessing: component("PostProcessing", {
    ambientOcclusion: false,
    shadowQuality: "Medium",
    bloom: 0.45,
    bloomThreshold: 0.78,
    contrast: 0.18,
    saturation: -0.08,
    temperature: 0.35,
    vignette: 0.42,
    grain: 0.05,
  }),
  AudioSettings: component("AudioSettings", { reverb: 0.1 }),
});
add("Ground", [0, -0.08, 0], {
  Scale: { value: vec(EDGE * 2 + 120, 0.1, EDGE * 2 + 120) },
  Renderable: { mesh: 0, material: 0, visible: true },
  Material: material("#55574f", { roughness: 0.95 }),
});
// Blocks: a pale concrete pad under each one's buildings.
for (const [x, z] of blocks)
  add("Block", [x, -0.03, z], {
    Scale: { value: vec(GRID - TILE, 0.04, GRID - TILE) },
    Renderable: { mesh: 0, material: 0, visible: true },
    Material: material("#8c897e", { roughness: 0.9 }),
  });
add("Roads", [0, -0.13, 0], { ModelInstances: { instances: roads.join("\n") }});
add("Buildings", [0, 0, 0], { ModelInstances: { instances: buildings.join("\n") }});
add("Streetlamps", [0, 0, 0], { ModelInstances: { instances: lamps.join("\n") }});
// The city wall: concrete barriers just outside the outer roads.
for (const [x, z, sx, sz] of [
  [0, -(EDGE + 12), EDGE * 2 + 40, 1],
  [0, EDGE + 12, EDGE * 2 + 40, 1],
  [-(EDGE + 12), 0, 1, EDGE * 2 + 40],
  [EDGE + 12, 0, 1, EDGE * 2 + 40],
] as const)
  add("City Wall", [x, 1, z], {
    Scale: { value: vec(sx, 2, sz) },
    Renderable: { mesh: 0, material: 0, visible: true },
    Material: material("#a8a59b"),
    Collider: component("Collider"),
  });

// ---------------------------------------------------------------- vehicles --
const CAR_SIZE: Record<number, [number, number, number]> = {
  101: [2.2, 1.5, 4.5], // sports
  97: [2.25, 1.9, 4.8], // police
  98: [2.15, 1.7, 4.7], // sedan
  94: [2.1, 1.7, 4.0], // hatchback
  103: [2.15, 1.9, 4.7], // taxi
  104: [2.35, 2.6, 5.3], // van
  102: [2.3, 2.1, 4.8], // suv
  93: [2.8, 3.5, 11.5], // bus
};
const car = (
  mesh: number,
  handling: Record<string, unknown>,
  extra: Components = {},
  tint?: string,
): Components => ({
  Scale: { value: vec(...CAR_SIZE[mesh]!) },
  Renderable: { mesh, material: 0, visible: true },
  ...(tint ? { Material: component("Material", { color: rgb(tint), keepTextures: true, roughness: 0.4, metalness: 0.5 }) } : {}),
  RigidBody: { mass: 1300, inverseMass: 1 / 1300, dynamic: true },
  Collider: component("Collider"),
  Vehicle: component("Vehicle", handling),
  ...extra,
});
const SPORTS = { topSpeed: 62, acceleration: 11.5, braking: 28, grip: 1.3, driftGrip: 0.45, steering: 32, nitroBoost: 10, nitroSeconds: 4 };
const route = (points: P2[]) => points.map(([x, z]) => `${x.toFixed(1)},${z.toFixed(1)}`).join(" ");

// A path through grid intersections (in grid units) becomes a driving line:
// corners rounded with points before and after each turn, shifted `lane` m
// to the right of travel (traffic keeps right; racers use the middle).
function line(nodes: P2[], closed: boolean, lane = 0, round = 14): P2[] {
  const pts = nodes.map(([i, j]) => [at(i), at(j)] as P2);
  const out: P2[] = [];
  const n = pts.length;
  for (let k = 0; k < n; k++) {
    const prev = pts[(k - 1 + n) % n]!,
      cur = pts[k]!,
      next = pts[(k + 1) % n]!;
    const first = !closed && k === 0,
      last = !closed && k === n - 1;
    const dir = (a: P2, b: P2): P2 => {
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
    };
    const right = (d: P2): P2 => [-d[1], d[0]];
    if (first || last) {
      const d = first ? dir(cur, next) : dir(prev, cur);
      const r = right(d);
      out.push([cur[0] + r[0] * lane, cur[1] + r[1] * lane]);
      continue;
    }
    const din = dir(prev, cur),
      dout = dir(cur, next);
    const turn = Math.abs(din[0] * dout[1] - din[1] * dout[0]) > 0.01;
    if (!turn) continue;
    const rin = right(din),
      rout = right(dout);
    out.push([cur[0] - din[0] * round + rin[0] * lane, cur[1] - din[1] * round + rin[1] * lane]);
    out.push([cur[0] + dout[0] * round + rout[0] * lane, cur[1] + dout[1] * round + rout[1] * lane]);
  }
  return out;
}
// Every grid point along a path, for checkpoints (corners and every other node).
function checkpoints(nodes: P2[], closed: boolean): P2[] {
  const cps: P2[] = [];
  const n = nodes.length;
  for (let k = 0; k < (closed ? n : n - 1); k++) {
    const [ai, aj] = nodes[k]!,
      [bi, bj] = nodes[(k + 1) % n]!;
    const steps = Math.max(Math.abs(bi - ai), Math.abs(bj - aj));
    for (let s = 1; s <= steps; s++) {
      const i = ai + Math.sign(bi - ai) * s,
        j = aj + Math.sign(bj - aj) * s;
      cps.push([at(i), at(j)]);
    }
  }
  return cps;
}
// Starting grid: two columns, behind the first node, facing the second.
function grid(nodes: P2[]): Array<[number, number, number]> {
  const [ai, aj] = nodes[0]!,
    [bi, bj] = nodes[1]!;
  const d: P2 = [Math.sign(bi - ai), Math.sign(bj - aj)];
  const r: P2 = [-d[1], d[0]];
  const yaw = Math.atan2(d[0], d[1]);
  const sx = at(ai),
    sz = at(aj);
  return [
    [0, 3.2],
    [-12, -3.2],
    [-24, 3.2],
    [-36, -3.2],
  ].map(([back, side]) => [sx + d[0] * (back! + 30) + r[0] * side!, sz + d[1] * (back! + 30) + r[1] * side!, yaw]);
}

const EVENTS = [
  {
    name: "Downtown Circuit",
    nodes: [
      [-1, -1],
      [1, -1],
      [1, 0],
      [2, 0],
      [2, 1],
      [-1, 1],
    ] as P2[],
    laps: 2,
    rivals: ["Rival Kaze", "Rival Vex", "Rival Nori"],
    police: false,
  },
  {
    name: "Harbor Sprint",
    nodes: [
      [-4, 4],
      [-4, 1],
      [-1, 1],
      [-1, -2],
      [2, -2],
      [2, -4],
      [4, -4],
    ] as P2[],
    laps: 1,
    rivals: ["Rival Kaze", "Rival Vex", "Rival Nori"],
    police: true,
  },
  {
    name: "Most Wanted Showdown",
    nodes: [
      [4, 4],
      [4, 0],
      [0, 0],
      [0, -3],
      [-3, -3],
      [-3, 3],
      [-1, 3],
    ] as P2[],
    laps: 1,
    rivals: ["Blacklist Razor"],
    police: true,
    pursuitAt: 8,
    escape: true,
  },
];

// Player: starts by the first event, facing north (-z).
add("Player", [at(-1) + 3.5, 0.9, at(-2) + 40], {
  Player: {},
  Rotation: { euler: vec(0, Math.PI, 0) },
  ...car(101, SPORTS, {}, "#e8b62a"),
});
// The chase camera.
add("Chase Camera", [0, 5, 0], {
  Camera: component("Camera", { fov: 62, near: 0.2, far: 900, priority: 1 }),
  CameraFollow: component("CameraFollow", {
    target: "",
    offset: vec(0, 2.6, -7.2),
    smoothing: 0.06,
    lookHeight: 1.3,
    collision: true,
    orbit: false,
  }),
});

// Rivals, parked outside the wall until their race.
const RIVALS: Array<[string, string, Record<string, unknown>, number]> = [
  ["Rival Kaze", "#c0392b", { ...SPORTS, topSpeed: 58 }, 0.8],
  ["Rival Vex", "#27ae60", { ...SPORTS, topSpeed: 59 }, 0.85],
  ["Rival Nori", "#8e44ad", { ...SPORTS, topSpeed: 57 }, 0.75],
  ["Blacklist Razor", "#1c1c1c", { ...SPORTS, topSpeed: 64, acceleration: 12, grip: 1.32 }, 0.95],
];
const PARKING: P2[] = RIVALS.map((_, i) => [-60 + i * 12, EDGE + 40]);
RIVALS.forEach(([name, tint, handling, skill], i) =>
  add(name, [PARKING[i]![0], 0.9, PARKING[i]![1]], {
    ...car(101, handling, {
      Driver: component("Driver", { mode: "Off", route: "", loop: false, skill, aggression: 0.4, speedScale: 1 }),
    }, tint),
  }),
);

// Patrol cruisers and civilian traffic on loops around blocks (right lane).
const COP = { topSpeed: 52, acceleration: 10, braking: 26, grip: 1.2, driftGrip: 0.5, steering: 34, nitroBoost: 0, nitroSeconds: 1 };
const loop = (i0: number, j0: number, i1: number, j1: number, clockwise: boolean): P2[] => {
  const corners: P2[] = [
    [i0, j0],
    [i1, j0],
    [i1, j1],
    [i0, j1],
  ];
  return clockwise ? corners : corners.reverse();
};
const PATROL_LOOPS: Array<[string, P2[]]> = [
  ["Patrol 1", loop(-3, -3, 0, 0, true)],
  ["Patrol 2", loop(0, 0, 3, 3, false)],
  ["Patrol 3", loop(-4, 1, -1, 4, true)],
];
const patrolRoutes: Record<string, string> = {};
for (const [name, nodes] of PATROL_LOOPS) {
  const points = line(nodes, true, 4, 10);
  patrolRoutes[name] = route(points);
  add(name, [points[0]![0], 0.95, points[0]![1]], {
    ...car(97, COP, {
      Driver: component("Driver", { mode: "Traffic", route: route(points), loop: true, skill: 0.8, aggression: 0.4, speedScale: 0.85 }),
    }),
  });
}
const CIVILIANS = [98, 94, 103, 104, 102, 98, 94, 103, 93, 98, 102, 94, 103, 98];
CIVILIANS.forEach((mesh, k) => {
  const i0 = (k % 4) * 2 - 4,
    j0 = Math.floor(k / 4) * 2 - 4;
  const nodes = loop(i0, j0, Math.min(i0 + 2 + (k % 2), HALF), Math.min(j0 + 2, HALF), k % 2 === 0);
  const points = line(nodes, true, 4, 10);
  const start = points[(k * 3) % points.length]!;
  add(`Traffic ${k + 1}`, [start[0], CAR_SIZE[mesh]![1] / 2 + 0.05, start[1]], {
    ...car(mesh, { ...COP, topSpeed: 30, acceleration: 6 }, {
      Driver: component("Driver", { mode: "Traffic", route: route(points), loop: true, skill: 0.6, aggression: 0.1, speedScale: 0.8 + (k % 3) * 0.1 }),
    }),
  });
});

// ---------------------------------------------------------------- director --
const lua = (rows: unknown): string => {
  if (Array.isArray(rows)) return `{ ${rows.map(lua).join(", ")} }`;
  if (typeof rows === "string") return JSON.stringify(rows);
  if (typeof rows === "boolean") return String(rows);
  if (typeof rows === "number") return String(+rows.toFixed(2));
  if (rows && typeof rows === "object")
    return `{ ${Object.entries(rows)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) ? k : `[${JSON.stringify(k)}]`} = ${lua(v)}`)
      .join(", ")} }`;
  return "nil";
};
const events = EVENTS.map((e) => {
  const closed = e.laps > 1;
  const cps = checkpoints(e.nodes, closed);
  const g = grid(e.nodes);
  const racing = line(e.nodes, closed, 0, 14);
  // A sprint's racing line ends past the final checkpoint.
  return {
    name: e.name,
    laps: e.laps,
    route: route(racing),
    checkpoints: cps,
    grid: g,
    marker: [g[0]![0], g[0]![1]],
    rivals: e.rivals,
    police: e.police,
    pursuit_at: e.pursuitAt,
    pursuit_heat: e.pursuitAt ? 3 : undefined,
    escape: e.escape ?? false,
  };
});
const config = [
  `local GRID = ${GRID}`,
  `local GRID_HALF = ${HALF}`,
  `local CHECKPOINT_RADIUS = 26`,
  `local EVENTS = ${lua(events)}`,
  `local PATROLS = ${lua(PATROL_LOOPS.map(([n]) => n))}`,
  `local PATROL_ROUTES = ${lua(patrolRoutes)}`,
  `local ALL_RIVALS = ${lua(RIVALS.map(([n]) => n))}`,
  `local PARKING = ${lua(PARKING)}`,
].join("\n");
add("Director", [0, 60, 0], {
  Script: {
    source: readFileSync(join(here, "lua/director.lua"), "utf8").replace("\n{{CONFIG}}\n", `\n${config}\n`),
    props: {},
  },
});

// --------------------------------------------------------------------- UI --
const ui = (name: string, value: Record<string, unknown>) => add(name, [0, 0, 0], { UI: component("UI", value) });
const WHITE = rgb("#f4f1e8"),
  DARK = rgb("#0d1014"),
  GOLD = rgb("#f2c230"),
  RED = rgb("#e0362c");
const text = (name: string, value: string, anchor: string, offsetX: number, offsetY: number, fontSize: number, color = WHITE, opacity = 1) =>
  ui(name, { kind: "Text", text: value, anchor, offsetX, offsetY, fontSize, color, opacity });
text("Objective", "", "top-left", 24, 22, 18);
text("Pos", "", "top-left", 24, 54, 30, GOLD);
text("Lap", "", "top-left", 24, 92, 18);
text("Time", "", "top-left", 24, 118, 18);
text("Heat", "", "top-center", 0, 22, 22, RED);
text("PursuitLabel", "", "top-center", 0, 52, 13, WHITE, 0.85);
ui("PursuitBar", { kind: "Bar", text: "", anchor: "top-center", offsetY: 70, width: 300, height: 12, color: RGBish("#3ad06a"), opacity: 0.9, value: 0 });
text("Banner", "", "top-center", 0, 120, 34, GOLD);
text("Countdown", "", "center", 0, -60, 96, GOLD);
text("Hint", "", "bottom-center", 0, -40, 16, WHITE, 0.9);
// Title.
ui("TitlePanel", { kind: "Panel", text: "", anchor: "center", width: 640, height: 430, color: DARK, opacity: 0.86 });
text("Title", "HIGH HEAT", "center", 0, -150, 64, GOLD);
text("TitleSub", "Win three races in Bayview. Then outrun the police.", "center", 0, -90, 17);
ui("Start", { kind: "Button", text: "DRIVE", action: "script", anchor: "center", offsetY: -20, width: 240, height: 54, fontSize: 22, color: rgb("#c0392b"), opacity: 1 });
text("Controls", "W/S throttle and brake  ·  A/D steer  ·  Space handbrake (drift)", "center", 0, 60, 14, WHITE, 0.75);
text("Controls2", "Shift nitro  ·  R reset car  ·  P pause", "center", 0, 82, 14, WHITE, 0.75);
text("TitleBest", "", "center", 0, 130, 13, GOLD, 0.85);
// Results.
ui("ResultPanel", { kind: "Panel", text: "", anchor: "center", width: 560, height: 250, color: DARK, opacity: 0.88 });
text("ResultTitle", "", "center", 0, -60, 42, GOLD);
text("ResultText", "", "center", 0, 0, 17);
ui("Continue", { kind: "Button", text: "CONTINUE", action: "script", anchor: "center", offsetY: 64, width: 220, height: 46, fontSize: 18, color: rgb("#c0392b"), opacity: 1 });
// Pause menu.
ui("PausePanel", { kind: "Panel", text: "", anchor: "center", visibleWhen: "pause", width: 320, height: 200, color: DARK, opacity: 0.85 });
ui("Resume", { kind: "Button", text: "Resume", action: "resume", anchor: "center", visibleWhen: "pause", offsetY: -20, width: 200, height: 40, color: rgb("#3b6e8f"), opacity: 1 });
ui("Restart", { kind: "Button", text: "Restart", action: "restart", anchor: "center", visibleWhen: "pause", offsetY: 34, width: 200, height: 40, color: rgb("#5c5c5c"), opacity: 1 });
function RGBish(hex: string) {
  return rgb(hex);
}

// ---------------------------------------------------------------- prefabs --
const prefabs: Record<string, { components: Components }> = {
  Cruiser: {
    components: car(97, COP, {
      Driver: component("Driver", { mode: "Pursuit", route: "", loop: false, target: "", skill: 0.75, aggression: 0.45, speedScale: 1 }),
    }),
  },
  Interceptor: {
    components: car(97, { ...COP, topSpeed: 64, acceleration: 12.5, nitroBoost: 8, nitroSeconds: 3 }, {
      Driver: component("Driver", { mode: "Pursuit", route: "", loop: false, target: "", skill: 0.9, aggression: 0.85, speedScale: 1 }),
    }, "#202428"),
  },
};

// Logic, sound, light and UI entities aren't drawn.
for (const entity of entities) {
  const c = entity.components as Components;
  if (!c.Renderable && !c.Player && !c.ModelInstances) c.Renderable = { mesh: 0, material: 0, visible: false };
}
const document = { format: 1, name: "HIGH HEAT", prefabs, entities } as SceneDocument;
validateSceneDocument(document);
const out = process.env.HH_OUT ?? join(here, "../../examples/racing/high-heat.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(document, null, 1) + "\n");
console.log(`wrote ${out}: ${entities.length} entities, ${roads.length} road tiles, ${buildings.length} buildings, ${lamps.length} lamps`);
