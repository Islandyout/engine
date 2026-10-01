// Generates LAST SIGNAL (examples/fps/last-signal.json), the FPS built on
// this engine -- see docs/fps/GAME_DESIGN.md. Run from apps/editor:
//
//   npm run fps
//
// The level is code rather than hand-placed so the layout, the terrain
// sculpt that flattens it into the hills and the director's spawn tables
// all come from one set of coordinates. North is -z; the player starts in
// the south and fights north through a checkpoint, the walled outpost and
// out of the north gate to the landing zone.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultComponent } from "../../apps/editor/src/authoring/CommandInterpreter";
import { validateSceneDocument } from "../../apps/editor/src/scene/SceneSerializer";
import { encodeSculpt, generateHeights, sampleHeight } from "../../apps/editor/src/editor/terrain";
import type { SceneDocument } from "../../apps/editor/src/scene/SceneSerializer";

type V3 = [number, number, number];
type Components = Record<string, unknown>;
const here = dirname(fileURLToPath(import.meta.url));
const lua = (file: string) => readFileSync(join(here, "lua", file), "utf8");
const vec = (x: number, y: number, z: number) => ({ x, y, z });
const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return vec(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};
const component = (type: string, overrides: Record<string, unknown> = {}) => ({
  ...(defaultComponent(type as never) as object),
  ...overrides,
});

// ---------------------------------------------------------------- terrain --
const TERRAIN = { size: 260, resolution: 131, height: 7, seed: 11, frequency: 1.1, octaves: 5 };
const base = generateHeights({ ...TERRAIN, sculpt: "" });
const baseAt = (x: number, z: number) => sampleHeight(base, TERRAIN.resolution, TERRAIN.size, x, z);
const average = (x0: number, z0: number, x1: number, z1: number) => {
  let sum = 0,
    count = 0;
  for (let x = x0; x <= x1; x += 4)
    for (let z = z0; z <= z1; z += 4) {
      sum += baseAt(x, z);
      count++;
    }
  return sum / count;
};
const smoothstep = (t: number) => {
  const c = Math.min(Math.max(t, 0), 1);
  return c * c * (3 - 2 * c);
};

const COMPOUND_HALF = 32; // walls at +-32
const PAD = average(-36, -36, 36, 36); // the outpost's ground height
const LZ: V3 = [0, 0, -92];
const LZ_HEIGHT = average(-12, -104, 12, -80) * 0.5 + PAD * 0.5 + 1.5;
const START: V3 = [0, 0, 108];
const START_HEIGHT = baseAt(0, 108);
const CHECKPOINT_Z = 62;
const CHECKPOINT_HEIGHT = (PAD + START_HEIGHT) / 2;

// Height along the southern road: start -> checkpoint -> south gate.
const roadHeight = (z: number) =>
  z > CHECKPOINT_Z
    ? CHECKPOINT_HEIGHT + (START_HEIGHT - CHECKPOINT_HEIGHT) * smoothstep((z - CHECKPOINT_Z) / (START[2] - CHECKPOINT_Z))
    : PAD + (CHECKPOINT_HEIGHT - PAD) * smoothstep((z - 40) / (CHECKPOINT_Z - 40));

const sculpt = new Int16Array(TERRAIN.resolution * TERRAIN.resolution);
{
  const n = TERRAIN.resolution,
    step = TERRAIN.size / (n - 1);
  for (let row = 0; row < n; row++)
    for (let column = 0; column < n; column++) {
      const x = -TERRAIN.size / 2 + column * step,
        z = -TERRAIN.size / 2 + row * step;
      const b = base[row * n + column]!;
      let h = b;
      const blend = (target: number, distance: number, falloff: number) => {
        h += (target - h) * (1 - smoothstep(distance / falloff));
      };
      // Southern road and checkpoint, then the start clearing.
      if (z > 30) blend(roadHeight(Math.min(z, START[2])), Math.max(0, Math.abs(x) - 5), 10);
      blend(CHECKPOINT_HEIGHT, Math.max(0, Math.hypot(x, z - CHECKPOINT_Z) - 12), 12);
      blend(START_HEIGHT, Math.max(0, Math.hypot(x, z - START[2]) - 8), 10);
      // Northern track to the landing zone, and the LZ itself.
      if (z < -30 && z > LZ[2]) {
        const t = (z + 30) / (LZ[2] + 30);
        blend(PAD + (LZ_HEIGHT - PAD) * smoothstep(t), Math.max(0, Math.abs(x) - 4), 9);
      }
      blend(LZ_HEIGHT, Math.max(0, Math.hypot(x - LZ[0], z - LZ[2]) - 13), 14);
      // The outpost pad.
      const outside = Math.hypot(Math.max(0, Math.abs(x) - 38), Math.max(0, Math.abs(z) - 38));
      blend(PAD, outside, 16);
      // Ridges around the edge keep the fight inside the valley.
      const edge = Math.max(Math.abs(x), Math.abs(z));
      if (edge > 100) h += ((edge - 100) / 30) ** 2 * 14;
      sculpt[row * n + column] = Math.max(-32000, Math.min(32000, Math.round((h - b) * 100)));
    }
}
const heights = generateHeights({ ...TERRAIN, sculpt: encodeSculpt(sculpt) }, sculpt);
const ground = (x: number, z: number) => sampleHeight(heights, TERRAIN.resolution, TERRAIN.size, x, z);
LZ[1] = ground(LZ[0], LZ[2]);
START[1] = ground(START[0], START[2]);

// --------------------------------------------------------------- entities --
const entities: SceneDocument["entities"] = [];
const add = (name: string, position: V3, components: Components) => {
  entities.push({ name, components: { Transform: { position: vec(...position) }, ...components } as never });
};
const material = (hex: string, extra: Record<string, unknown> = {}) =>
  component("Material", { color: rgb(hex), roughness: 0.85, keepTextures: false, ...extra });
// A solid box standing on the ground at (x, z), `size` = full extents.
const block = (
  name: string,
  x: number,
  z: number,
  size: V3,
  hex: string,
  options: { yaw?: number; y?: number; extra?: Components; collide?: boolean; matExtra?: Record<string, unknown> } = {},
) => {
  const y = options.y ?? ground(x, z) + size[1] / 2;
  add(name, [x, y, z], {
    Scale: { value: vec(...size) },
    ...(options.yaw ? { Rotation: { euler: vec(0, options.yaw, 0) } } : {}),
    Renderable: { mesh: 0, material: 0, visible: true },
    Material: material(hex, options.matExtra),
    ...(options.collide === false ? {} : { Collider: component("Collider") }),
    ...options.extra,
  });
};
// A catalog model at its native proportions scaled by `factor`, on the ground.
const model = (
  name: string,
  mesh: number,
  native: V3,
  x: number,
  z: number,
  factor = 1,
  options: { yaw?: number; collide?: boolean; y?: number } = {},
) => {
  const size: V3 = [native[0] * factor, native[1] * factor, native[2] * factor];
  add(name, [x, (options.y ?? ground(x, z)) + size[1] / 2, z], {
    Scale: { value: vec(...size) },
    ...(options.yaw ? { Rotation: { euler: vec(0, options.yaw, 0) } } : {}),
    Renderable: { mesh, material: 0, visible: true },
    ...(options.collide === false ? {} : { Collider: component("Collider") }),
  });
};

// Environment: late afternoon, warm low sun, light haze.
add("Environment", [0, -40, 0], {
  Environment: component("Environment", {
    sky: "Procedural",
    skyColor: rgb("#3d6fb8"),
    horizonColor: rgb("#e8cfa8"),
    groundColor: rgb("#4a4636"),
    sunElevation: 24,
    sunAzimuth: 235,
    sunIntensity: 3.4,
    sunColor: rgb("#ffd9a8"),
    ambientIntensity: 1.25,
    fog: "Exponential",
    fogColor: rgb("#c9c3b4"),
    fogNear: 40,
    fogFar: 220,
    fogDensity: 0.008,
    shadows: true,
    exposure: 1,
  }),
  PostProcessing: component("PostProcessing", {
    bloom: 0.4,
    bloomThreshold: 0.82,
    contrast: 0.12,
    saturation: -0.05,
    temperature: 0.12,
    vignette: 0.35,
    grain: 0.06,
  }),
  AudioSettings: component("AudioSettings", { reverb: 0.12 }),
});

const exclusions = [
  [-46, -46, 46, 46],
  [-8, 36, 8, 114],
  [-18, 52, 18, 80],
  [-12, 96, 12, 116],
  [-7, -80, 7, -36],
  [-20, -108, 20, -74],
];
add("Valley", [0, 0, 0], {
  Terrain: component("Terrain", {
    ...TERRAIN,
    sculpt: encodeSculpt(sculpt),
    grassColor: rgb("#5b6b34"),
    rockColor: rgb("#6e655a"),
    sandColor: rgb("#9a8a66"),
    snowColor: rgb("#e8e8e0"),
    sandHeight: PAD - 6,
    snowHeight: 60,
    rockSlope: 0.82,
    scatter: [
      "46 0.0012 0.8 1.3 0.85 collide",
      "47 0.0008 0.8 1.2 0.85 collide",
      "49 0.0022 0.9 1.5 0.8 collide",
      "50 0.0016 0.9 1.4 0.8 collide",
      "42 0.0007 0.7 1.6 0.6 collide",
      "43 0.0012 0.8 1.3 0.6 collide",
      "37 0.004 0.8 1.3 0.8",
      "38 0.003 0.8 1.3 0.8",
      ...exclusions.map((r) => `exclude ${r.join(" ")}`),
    ].join("\n"),
  }),
});

// Invisible walls at the foot of the edge ridges.
for (const [x, z, sx, sz] of [
  [0, -118, 236, 1],
  [0, 118, 236, 1],
  [-118, 0, 1, 236],
  [118, 0, 1, 236],
] as const)
  add("Boundary", [x, 40, z], { Scale: { value: vec(sx, 120, sz) }, Collider: component("Collider") });

// ---- the outpost: perimeter wall with a south entrance and a north gate.
const WALL = "#8c877c",
  WALL_H = 3.2;
const wallRun = (name: string, x0: number, z0: number, x1: number, z1: number) => {
  const length = Math.hypot(x1 - x0, z1 - z0);
  const horizontal = Math.abs(z1 - z0) < 0.01;
  block(name, (x0 + x1) / 2, (z0 + z1) / 2, horizontal ? [length, WALL_H, 0.6] : [0.6, WALL_H, length], WALL, {
    y: PAD + WALL_H / 2,
  });
};
const C = COMPOUND_HALF;
wallRun("Wall South W", -C, C, -5, C);
wallRun("Wall South E", 5, C, C, C);
wallRun("Wall North W", -C, -C, -5, -C);
wallRun("Wall North E", 5, -C, C, -C);
wallRun("Wall West", -C, -C, -C, C);
wallRun("Wall East", C, -C, C, C);
block("North Gate", 0, -C, [10, WALL_H + 0.4, 0.5], "#5d4a36", { y: PAD + (WALL_H + 0.4) / 2 });
// Gate posts and the entrance.
for (const [x, z] of [
  [-5.4, C],
  [5.4, C],
  [-5.4, -C],
  [5.4, -C],
])
  block("Gate Post", x, z, [1, 4.2, 1], "#6c675e", { y: PAD + 2.1 });
model("Gate Sign", 86, [0.93, 2.66, 0.21], 7.5, C + 1.2, 1, { collide: false });

// Buildings (solid; their footprints are cover and sight blockers).
model("Warehouse West", 24, [25.8, 9.9, 20.4], -18, -11, 0.72, { y: PAD });
model("Warehouse East", 25, [43.7, 12.3, 19.8], 16.5, -22, 0.52, { y: PAD });
model("Supply Shed", 23, [39.7, 10.2, 28.5], 21, 17, 0.28, { y: PAD });

// Shipping containers: 2.4 x 2.6 x 6.
const container = (x: number, z: number, yaw: number, hex: string, stacked = false) => {
  block("Container", x, z, [2.4, 2.6, 6], hex, { y: PAD + 1.3, yaw });
  if (stacked) block("Container", x, z, [2.4, 2.6, 6], "#7b8a8f", { y: PAD + 3.9, yaw });
};
container(-24, 22, 0, "#8d3b2c", true);
container(-20.5, 22, 0, "#2f5d7c");
container(-8, 14, Math.PI / 2, "#4f6b3a");
container(9, 6, 0.35, "#8d3b2c");
container(-12, 2, 0, "#a06a2c", true);
container(4, -6, Math.PI / 2, "#2f5d7c");
container(26, -6, 0, "#4f6b3a", true);
container(-27, -26, Math.PI / 2, "#a06a2c");
container(-4, 24, 0.2, "#7b8a8f");

// Low cover: jersey barriers and sandbag walls along the lanes.
const barrier = (x: number, z: number, yaw = 0) => model("Barrier", 26, [2, 1.04, 0.5], x, z, 1, { yaw, y: PAD });
for (const [x, z, yaw] of [
  [-3, 28, 0],
  [3, 28, 0],
  [12, 26, 0],
  [-14, 26, 0],
  [-1, 9, 0],
  [2, 9, 0],
  [14, -2, Math.PI / 2],
  [-6, -20, 0],
  [7, -14, 0],
  [-26, 8, Math.PI / 2],
] as const)
  barrier(x, z, yaw);
const sandbags = (x: number, z: number, length: number, yaw = 0) =>
  block("Sandbags", x, z, [length, 1.1, 0.9], "#8a7a58", { y: PAD + 0.55, yaw });
sandbags(-6, -2, 4);
sandbags(6, -2, 4);
sandbags(0, -16, 5);
sandbags(-16, 30, 3);

// Watchtowers: four legs and a platform with a parapet; a Marksman stands on each.
const TOWER_H = 5.5;
const tower = (name: string, x: number, z: number) => {
  for (const [dx, dz] of [
    [-1.4, -1.4],
    [1.4, -1.4],
    [-1.4, 1.4],
    [1.4, 1.4],
  ])
    block(`${name} Leg`, x + dx, z + dz, [0.3, TOWER_H, 0.3], "#4d463c", { y: PAD + TOWER_H / 2, collide: false });
  block(`${name} Deck`, x, z, [3.6, 0.3, 3.6], "#5a5045", { y: PAD + TOWER_H });
  for (const [dx, dz, sx, sz] of [
    [0, -1.7, 3.6, 0.15],
    [0, 1.7, 3.6, 0.15],
    [-1.7, 0, 0.15, 3.6],
    [1.7, 0, 0.15, 3.6],
  ])
    block(`${name} Rail`, x + dx, z + dz, [sx, 0.9, sz], "#5a5045", { y: PAD + TOWER_H + 0.6 });
  block(`${name} Roof`, x, z, [4, 0.2, 4], "#3d3a35", { y: PAD + TOWER_H + 2.6, collide: false });
};
tower("Tower SE", 28, 28);
tower("Tower NW", -28, -29);

// Floodlights and lamps.
for (const [x, z] of [
  [-30, 30],
  [30, -30],
  [0, 30],
])
  model("Floodlight", 35, [2.8, 9, 0.5], x, z, 0.8, { y: PAD, collide: false });

// Objectives: three generators (destructible) and the uplink.
const GENERATORS: [string, number, number][] = [
  ["Generator A", -24, 13],
  ["Generator B", 24, 2],
  ["Generator C", -3, -27],
];
for (const [name, x, z] of GENERATORS)
  block(name, x, z, [2.2, 2, 1.6], "#c9a227", {
    y: PAD + 1,
    matExtra: { metalness: 0.4, roughness: 0.55, emissive: rgb("#ff9a2e"), emissiveIntensity: 0.15 },
    extra: {
      Health: { current: 180, maximum: 180 },
      Script: { source: lua("generator.lua"), props: {} },
      Sound: component("Sound", { clip: 1, volume: 0.55, loop: true, autoplay: true, spatial: true, bus: "Ambient", minDistance: 2, maxDistance: 26 }),
      Particles: component("Particles", {
        preset: "Sparkle",
        color: rgb("#ffd27a"),
        endColor: rgb("#ff6a1a"),
        rate: 0,
        lifetime: 0.5,
        speed: 4,
        size: 0.08,
        shape: "Sphere",
        shapeSize: 0.8,
      }),
    },
  });
const UPLINK: V3 = [0, PAD, -8];
block("Uplink", UPLINK[0], UPLINK[2], [1.6, 1.6, 1], "#2b3138", {
  y: PAD + 0.8,
  matExtra: { metalness: 0.6, roughness: 0.4, emissive: rgb("#38d9ff"), emissiveIntensity: 0.35 },
});
block("Uplink Mast", UPLINK[0] + 1.4, UPLINK[2] - 0.6, [0.25, 9, 0.25], "#9aa3ab", { y: PAD + 4.5, collide: false });
block("Uplink Dish", UPLINK[0] + 1.4, UPLINK[2] - 0.6, [2.2, 1.6, 0.25], "#d7dde2", {
  y: PAD + 8.2,
  collide: false,
  yaw: 0.6,
});
add("Uplink Beacon", [UPLINK[0] + 1.4, PAD + 9.2, UPLINK[2] - 0.6], {
  Light: component("Light", { color: rgb("#38d9ff"), intensity: 6, range: 14 }),
});
add("Uplink Hum", [UPLINK[0], PAD + 1, UPLINK[2]], {
  Sound: component("Sound", { clip: 2, volume: 0.6, loop: true, autoplay: true, spatial: true, bus: "Ambient", minDistance: 3, maxDistance: 30 }),
});

// The checkpoint on the approach road.
const cp = CHECKPOINT_Z;
model("Checkpoint Truck", 96, [2.33, 1.96, 5.44], 5.5, cp - 1, 1, { yaw: 0.25 });
sandbags(-5, cp - 3, 4);
sandbags(-8, cp + 1, 3, Math.PI / 2);
barrier(-1.5, cp - 6, 0);
barrier(2.5, cp - 6.5, 0.3);
model("Checkpoint Sign", 86, [0.93, 2.66, 0.21], -7, cp - 6, 1, { collide: false });
model("Checkpoint Lamp", 36, [2.4, 9, 0.5], 9, cp + 4, 0.8, { collide: false });
block("Checkpoint Hut", -11, cp - 2, [4, 2.8, 3.4], "#77705f");
// Wreckage along the road to break sight lines.
model("Wreck Truck", 92, [2.36, 3.51, 6.85], -6, 86, 1, { yaw: 1.2 });
model("Wreck Trailer", 99, [2.53, 4.22, 13.64], 11, 44, 1, { yaw: -0.4 });
for (let i = 0; i < 6; i++) model("Pole", 36, [2.4, 9, 0.5], -7.5, 100 - i * 16, 0.85, { collide: false });

// Landing zone: a pad, green signal smoke and a beacon.
block("LZ Pad", LZ[0], LZ[2], [14, 0.25, 14], "#4a4c48", { y: LZ[1] + 0.05, collide: false });
block("LZ Mark", LZ[0], LZ[2], [7, 0.27, 1.2], "#d9c23a", { y: LZ[1] + 0.06, collide: false });
add("LZ Smoke", [LZ[0] + 5, LZ[1] + 0.3, LZ[2] + 5], {
  Particles: component("Particles", {
    preset: "Smoke",
    color: rgb("#5fdc6a"),
    endColor: rgb("#b7c7b0"),
    rate: 14,
    lifetime: 6,
    speed: 2.2,
    size: 1.4,
    endSize: 3,
    gravityScale: 1,
    shape: "Sphere",
    shapeSize: 0.4,
  }),
});
add("LZ Beacon", [LZ[0], LZ[1] + 3, LZ[2]], {
  Light: component("Light", { color: rgb("#7dff8a"), intensity: 4, range: 18 }),
});

// --------------------------------------------------------------- enemies --
interface Role {
  hex: string;
  health: number;
  height: number;
  width: number;
  loadout: string;
  ai: Record<string, unknown>;
}
const ROLES: Record<string, Role> = {
  Rifleman: {
    hex: "#55603a",
    health: 100,
    height: 1.8,
    width: 0.7,
    loadout:
      "rifle: model=rifle mode=auto rpm=480 damage=7 mag=30 reserve=-1 reload=2.4 spread=2.5 range=150 falloff=40\n",
    ai: { sightRange: 48, fov: 115, hearingRange: 40, reactionTime: 0.65, accuracy: 0.45, preferredRange: 16, moveSpeed: 3.3, burst: 4, burstPause: 1.0, useCover: true },
  },
  Rusher: {
    hex: "#9b2a1f",
    health: 70,
    height: 1.8,
    width: 0.7,
    loadout: "smg: model=smg mode=auto rpm=600 damage=4 mag=32 reserve=-1 reload=1.8 spread=4 range=60 falloff=15\n",
    ai: { sightRange: 40, fov: 130, hearingRange: 55, reactionTime: 0.5, accuracy: 0.3, preferredRange: 5, moveSpeed: 5.4, burst: 5, burstPause: 0.9, useCover: false },
  },
  Marksman: {
    hex: "#2c4a7a",
    health: 70,
    height: 1.8,
    width: 0.7,
    loadout: "dmr: model=sniper mode=semi rpm=60 damage=26 mag=8 reserve=-1 reload=3 spread=0.5 range=220 falloff=120\n",
    ai: { sightRange: 75, fov: 80, hearingRange: 30, reactionTime: 1.4, accuracy: 0.82, preferredRange: 50, moveSpeed: 2.4, burst: 1, burstPause: 2.6, useCover: false },
  },
  Heavy: {
    hex: "#c26a1c",
    health: 320,
    height: 2.15,
    width: 0.95,
    loadout:
      "launcher: model=launcher mode=semi rpm=40 damage=34 mag=1 reserve=-1 reload=2.8 projectile speed=20 gravity=0.15 splash=3.5 range=120\n",
    ai: { sightRange: 45, fov: 110, hearingRange: 45, reactionTime: 1.0, accuracy: 0.7, preferredRange: 20, moveSpeed: 2.3, burst: 1, burstPause: 3.0, useCover: false },
  },
};
const soldier = (role: string, behavior: string, patrol = "", tuning: Record<string, unknown> = {}): Components => {
  const r = ROLES[role]!;
  return {
    Scale: { value: vec(r.width, r.height, r.width) },
    Renderable: { mesh: 132, material: 0, visible: true },
    Material: material(r.hex, { roughness: 0.7 }),
    Health: { current: r.health, maximum: r.health },
    Weapons: { loadout: r.loadout },
    AICombat: component("AICombat", { team: 1, behavior, patrol, fleeHealth: 0, meleeDamage: 15, ...r.ai, ...tuning }),
    Script: { source: lua("enemy.lua"), props: {} },
  };
};
const enemy = (
  role: string,
  x: number,
  z: number,
  behavior = "Guard",
  patrol = "",
  y?: number,
  tuning: Record<string, unknown> = {},
) => add(role, [x, (y ?? ground(x, z)) + ROLES[role]!.height / 2 + 0.05, z], soldier(role, behavior, patrol, tuning));
// The checkpoint is the first fight: shorter sight so it starts on the player's terms.
const waypoint = (name: string, x: number, z: number) => add(name, [x, ground(x, z) + 0.5, z], {});

// Checkpoint: three guards and a road patrol.
const relaxed = { sightRange: 34, reactionTime: 0.9 };
enemy("Rifleman", -4, cp - 5, "Guard", "", undefined, relaxed);
enemy("Rifleman", 4, cp - 3.5, "Guard", "", undefined, relaxed);
waypoint("Road 1", -2, cp - 12);
waypoint("Road 2", 2, cp + 12);
enemy("Rifleman", 0, cp + 10, "Patrol", "Road 1,Road 2", undefined, relaxed);
// Outside the south wall: a patrol pair.
waypoint("South 1", -26, 40);
waypoint("South 2", 26, 40);
enemy("Rifleman", -20, 40, "Patrol", "South 1,South 2");
enemy("Rusher", -18, 41.5, "Patrol", "South 1,South 2");
// Inside the outpost.
enemy("Rifleman", -2, 25);
enemy("Rifleman", -16, 18);
enemy("Rifleman", 18, 4);
enemy("Rusher", 8, 10);
enemy("Rifleman", -8, -4);
enemy("Rusher", 0, -24);
enemy("Heavy", 6, -12);
enemy("Marksman", 28, 28, "Guard", "", PAD + TOWER_H + 0.15);
enemy("Marksman", -28, -29, "Guard", "", PAD + TOWER_H + 0.15);
waypoint("Yard 1", -14, -26);
waypoint("Yard 2", 12, -9);
waypoint("Yard 3", 14, 24);
enemy("Rifleman", -12, -26, "Patrol", "Yard 1,Yard 2,Yard 3");

// ------------------------------------------------------------- the player --
// LS_START="x,z" moves the spawn for playtests of later phases.
const [testX, testZ] = (process.env.LS_START ?? "").split(",").map(Number);
const spawn: V3 = process.env.LS_START ? [testX!, ground(testX!, testZ!) + 1, testZ!] : [START[0], START[1] + 1, START[2]];
add("Player", spawn, {
  Player: {},
  CharacterController: component("CharacterController", {
    mode: "FirstPerson",
    walkSpeed: 4.6,
    sprintSpeed: 7.6,
    crouchSpeed: 2.3,
    jumpHeight: 1.1,
    fov: 78,
    headBob: 0.8,
  }),
  Weapons: {
    loadout: [
      "carbine: model=rifle mode=auto rpm=640 damage=22 headshot=2 mag=30 reserve=120 reload=2.0 spread=2.0 aim_spread=0.3 move_spread=1.4 recoil=0.85 range=200 falloff=45 zoom=0.72",
      "sidearm: model=pistol mode=semi rpm=400 damage=30 mag=12 reserve=-1 reload=1.2 spread=1.4 aim_spread=0.25 recoil=1.6 range=120 falloff=30 zoom=0.85 equip=0.25",
      "shotgun: model=shotgun mode=semi rpm=75 pellets=9 damage=12 mag=6 reserve=18 reload=0.5 per_shell spread=5.5 aim_spread=4 recoil=4.5 range=45 falloff=10 min_damage=0.2 zoom=0.9 equip=0.5",
      "launcher: model=launcher mode=semi rpm=50 damage=140 mag=1 reserve=0 reload=2.6 projectile speed=38 gravity=0.35 splash=4.5 recoil=5 range=200 zoom=0.85 equip=0.7",
    ].join("\n") + "\n",
  },
  Health: { current: 100, maximum: 100 },
  Script: { source: lua("player.lua"), props: {} },
});

// ------------------------------------------------------------ the director --
const at = (x: number, z: number, lift = 1): V3 => [x, +(ground(x, z) + lift).toFixed(2), z];
const list = (points: V3[]) => `{ ${points.map((p) => `{ ${p.map((v) => +v.toFixed(2)).join(", ")} }`).join(", ")} }`;
const config = [
  `local GATE = { 0, ${(PAD + 1).toFixed(2)}, ${C + 2} }`,
  `local GENERATORS = { ${GENERATORS.map(([n]) => `"${n}"`).join(", ")} }`,
  `local UPLINK = { ${UPLINK.map((v) => +v.toFixed(2)).join(", ")} }`,
  `local UPLINK_RADIUS = 7`,
  `local UPLINK_SECONDS = 60`,
  `local LZ = { ${LZ.map((v) => +v.toFixed(2)).join(", ")} }`,
  `local LZ_RADIUS = 7`,
  `local COMPOUND = { ${-C}, ${-C}, ${C}, ${C} }`,
  `local YARD_SPAWNS = ${list([at(-28, -6), at(28, 22), at(-28, 28), at(14, -29), at(-10, -29)])}`,
  `local UPLINK_SPAWNS = ${list([at(-28, -6), at(28, 22), at(-28, 28), at(14, -29), at(0, 44), at(-10, -29), at(28, -12)])}`,
  `local LZ_SPAWNS = ${list([at(-34, -72), at(34, -78), at(-24, -108), at(22, -106)])}`,
  `local MAX_ALIVE = 9`,
  `local STARTING_ALIVE_BONUS = 0`,
].join("\n");
add("Director", [0, PAD + 40, 0], {
  Script: { source: lua("director.lua").replace("\n{{CONFIG}}\n", `\n${config}\n`), props: {} },
});

// --------------------------------------------------------------------- UI --
const ui = (name: string, value: Record<string, unknown>) => add(name, [0, 0, 0], { UI: component("UI", value) });
const WHITE = rgb("#f2efe6"),
  DARK = rgb("#11151a"),
  ACCENT = rgb("#e0a83a");
ui("Objective", { kind: "Text", text: "", anchor: "top-left", offsetX: 24, offsetY: 22, fontSize: 18, color: WHITE, opacity: 0.95 });
ui("Stats", { kind: "Text", text: "", anchor: "top-right", offsetX: -24, offsetY: 22, fontSize: 15, color: WHITE, opacity: 0.8 });
for (let i = 1; i <= 3; i++)
  ui(`Feed${i}`, { kind: "Text", text: "", anchor: "top-right", offsetX: -24, offsetY: 32 + i * 20, fontSize: 14, color: ACCENT, opacity: 1.05 - i * 0.2 });
ui("Banner", { kind: "Text", text: "", anchor: "top-center", offsetY: 110, fontSize: 30, color: ACCENT, opacity: 0.95 });
ui("Upload", { kind: "Bar", text: "UPLOAD", anchor: "top-center", offsetY: 70, width: 360, height: 16, color: rgb("#38d9ff"), opacity: 0.9, value: 0 });
// Title screen.
ui("TitlePanel", { kind: "Panel", text: "", anchor: "center", width: 620, height: 470, color: DARK, opacity: 0.86 });
ui("TitleText", { kind: "Text", text: "LAST SIGNAL", anchor: "center", offsetY: -180, fontSize: 46, color: ACCENT, opacity: 1 });
const line = (name: string, text: string, offsetY: number, fontSize: number, opacity: number, color = WHITE) =>
  ui(name, { kind: "Text", text, anchor: "center", offsetY, fontSize, color, opacity });
line("Briefing", "Hostile forces hold the relay outpost. Breach it and destroy its", -128, 15, 0.9);
line("Briefing2", "three generators, upload the signal, then reach extraction.", -106, 15, 0.9);
ui("DifficultyLabel", { kind: "Text", text: "Difficulty: VETERAN", anchor: "center", offsetY: -50, fontSize: 18, color: WHITE, opacity: 1 });
ui("Difficulty", { kind: "Slider", text: "", anchor: "center", offsetY: -14, width: 280, color: ACCENT, opacity: 1, value: 0.5 });
ui("Deploy", { kind: "Button", text: "DEPLOY", action: "script", anchor: "center", offsetY: 44, width: 220, height: 48, fontSize: 20, color: rgb("#b5452b"), opacity: 1 });
line("Controls", "WASD move · Shift sprint · C crouch · Space jump", 112, 13, 0.7);
line("Controls2", "Mouse aim / fire · R reload · 1-4 or Q weapons · P pause", 132, 13, 0.7);
ui("TitleBest", { kind: "Text", text: "", anchor: "center", offsetY: 168, fontSize: 13, color: ACCENT, opacity: 0.85 });
// Pause menu (only drawn while paused; hidden on the title screen).
ui("PausePanel", { kind: "Panel", text: "", anchor: "center", visibleWhen: "pause", width: 340, height: 230, color: DARK, opacity: 0.85 });
ui("PauseText", { kind: "Text", text: "PAUSED", anchor: "center", visibleWhen: "pause", offsetY: -70, fontSize: 30, color: ACCENT, opacity: 1 });
ui("Resume", { kind: "Button", text: "Resume", action: "resume", anchor: "center", visibleWhen: "pause", offsetY: -5, width: 200, height: 40, color: rgb("#3b6e8f"), opacity: 1 });
ui("PauseRestart", { kind: "Button", text: "Restart mission", action: "restart", anchor: "center", visibleWhen: "pause", offsetY: 50, width: 200, height: 40, color: rgb("#5c5c5c"), opacity: 1 });
// End screen.
ui("EndPanel", { kind: "Panel", text: "", anchor: "center", width: 560, height: 260, color: DARK, opacity: 0.88 });
ui("EndTitle", { kind: "Text", text: "", anchor: "center", offsetY: -70, fontSize: 36, color: ACCENT, opacity: 1 });
ui("EndStats", { kind: "Text", text: "", anchor: "center", offsetY: -18, fontSize: 15, color: WHITE, opacity: 0.95 });
ui("EndBest", { kind: "Text", text: "", anchor: "center", offsetY: 10, fontSize: 15, color: ACCENT, opacity: 0.95 });
ui("Restart", { kind: "Button", text: "Play again", action: "restart", anchor: "center", offsetY: 70, width: 220, height: 44, color: rgb("#b5452b"), opacity: 1 });

// ---------------------------------------------------------------- prefabs --
const prefabs: Record<string, { components: Components }> = {};
for (const role of ["Rifleman", "Rusher", "Heavy"]) prefabs[role] = { components: soldier(role, "Hunt") };
const pickup = (kind: string, hex: string, size: V3) => ({
  components: {
    Scale: { value: vec(...size) },
    Renderable: { mesh: 0, material: 0, visible: true },
    Material: material(hex, { emissive: rgb(hex), emissiveIntensity: 0.6, roughness: 0.5 }),
    Particles: component("Particles", {
      preset: "Sparkle",
      color: rgb(hex),
      endColor: rgb("#ffffff"),
      rate: 6,
      lifetime: 0.9,
      speed: 0.6,
      size: 0.06,
      shape: "Sphere",
      shapeSize: 0.4,
    }),
    Script: { source: lua("pickup.lua").replaceAll("{{KIND}}", kind), props: {} },
  },
});
prefabs["Ammo Crate"] = pickup("ammo", "#d9b13b", [0.6, 0.35, 0.4]);
prefabs["Med Kit"] = pickup("med", "#e04848", [0.45, 0.3, 0.45]);
prefabs["Launcher Rounds"] = pickup("launcher", "#42c4ff", [0.9, 0.25, 0.25]);
prefabs["Generator Wreck"] = {
  components: {
    Scale: { value: vec(2.3, 0.9, 1.7) },
    Renderable: { mesh: 0, material: 0, visible: true },
    Material: material("#2a2622", { roughness: 1 }),
    Particles: component("Particles", {
      preset: "Fire",
      color: rgb("#ff8a2a"),
      endColor: rgb("#3a3a3a"),
      rate: 18,
      lifetime: 1.2,
      speed: 1.4,
      size: 0.22,
      endSize: 1.6,
      shape: "Box",
      shapeSize: 0.5,
    }),
  },
};

// Entities without a Renderable get the editor's placeholder box; logic,
// sound, light and boundary entities are hidden instead.
for (const entity of entities) {
  const c = entity.components as Components;
  if (!c.Renderable && !c.Terrain && !c.Player) c.Renderable = { mesh: 0, material: 0, visible: false };
}
const document = { format: 1, name: "LAST SIGNAL", prefabs, entities } as SceneDocument;
validateSceneDocument(document);
const out = process.env.LS_OUT ?? join(here, "../../examples/fps/last-signal.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(document, null, 1) + "\n");
console.log(
  `wrote ${out}: ${entities.length} entities, ${Object.keys(prefabs).length} prefabs; pad ${PAD.toFixed(1)} m, start ${START[1].toFixed(1)} m, LZ ${LZ[1].toFixed(1)} m`,
);
