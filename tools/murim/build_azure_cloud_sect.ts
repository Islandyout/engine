// Generates AZURE CLOUD SECT (games/my-games/azure-cloud-sect), an open-world
// murim cultivation slice built on this engine. Run from apps/editor:
//
//   npm run murim
//
// The valley is code rather than hand-placed so the terrain sculpt that flattens
// it, the sect buildings and the enemy camps all come from one set of
// coordinates. North is -z: the Player starts at the sect gate in the south and
// follows the road north through the bandit camp to the shrine and its guardian.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { encodeSculpt, generateHeights, sampleHeight } from "../../apps/editor/src/editor/terrain";
import { widgetInfo } from "../../apps/editor/src/editor/uiKit";
import { martialArtsMoves } from "../../apps/editor/src/scene/meleeMoves";
import type { UIWidget } from "../../apps/editor/src/scene/Components";
import { ROOT, SceneBuilder, component, modelId, rgb, vec } from "../lib/scene_kit";
import type { Components, V3 } from "../lib/scene_kit";

const here = dirname(fileURLToPath(import.meta.url));
const lua = (file: string) => readFileSync(join(here, "lua", file), "utf8");
const scene = new SceneBuilder();

// ---------------------------------------------------------------- terrain --
const TERRAIN = { size: 240, resolution: 121, height: 16, seed: 23, frequency: 0.9, octaves: 5 };
const base = generateHeights({ ...TERRAIN, sculpt: "" });
const baseAt = (x: number, z: number) => sampleHeight(base, TERRAIN.resolution, TERRAIN.size, x, z);
const smoothstep = (t: number) => {
  const c = Math.min(Math.max(t, 0), 1);
  return c * c * (3 - 2 * c);
};
const average = (x: number, z: number, r: number) => {
  let sum = 0;
  let count = 0;
  for (let dx = -r; dx <= r; dx += 4)
    for (let dz = -r; dz <= r; dz += 4) {
      sum += baseAt(x + dx, z + dz);
      count++;
    }
  return sum / count;
};

const SECT = { x: 0, z: 78 }; // sect courtyard and gate
const CAMP = { x: -6, z: 4 }; // bandit camp
const SHRINE = { x: 0, z: -78 }; // the guardian's shrine
// Heaven Peak and two crags (x, z, height, spread): a skyline to walk towards.
const PEAKS: [number, number, number, number][] = [[14, -118, 78, 26], [-58, -70, 30, 14], [64, -40, 26, 12]];
const roadX = (z: number) => 9 * Math.sin(z / 34); // the road meanders
const VILLAGE = { x: -24, z: 38 }; // Willow Village: a merchant, Wen, three houses
const pads = [
  { ...VILLAGE, r: 12, h: average(VILLAGE.x, VILLAGE.z, 8) },
  { ...SECT, r: 24, h: average(SECT.x, SECT.z, 16) },
  { ...CAMP, r: 20, h: average(CAMP.x, CAMP.z, 12) },
  { ...SHRINE, r: 22, h: average(SHRINE.x, SHRINE.z, 12) + 2 },
];
const roadHeight = (z: number) => {
  // Between the pads the road follows the rolling land, eased towards the pad heights at its ends.
  const t = smoothstep((SECT.z - z) / (SECT.z - SHRINE.z));
  return baseAt(roadX(z), z) * 0.45 + (pads[0]!.h * (1 - t) + pads[2]!.h * t) * 0.55;
};

const sculpt = new Int16Array(TERRAIN.resolution * TERRAIN.resolution);
{
  const n = TERRAIN.resolution;
  const step = TERRAIN.size / (n - 1);
  for (let row = 0; row < n; row++)
    for (let column = 0; column < n; column++) {
      const x = -TERRAIN.size / 2 + column * step;
      const z = -TERRAIN.size / 2 + row * step;
      const b = base[row * n + column]!;
      let h = b;
      const blend = (target: number, distance: number, falloff: number) => {
        h += (target - h) * (1 - smoothstep(distance / falloff));
      };
      if (z < SECT.z && z > SHRINE.z) blend(roadHeight(z), Math.max(0, Math.abs(x - roadX(z)) - 3.5), 9);
      for (const p of pads) blend(p.h, Math.max(0, Math.hypot(x - p.x, z - p.z) - p.r), 12);
      // Landmarks: Heaven Peak behind the shrine, taller than anything else and visible from the sect gate, and
      // a pair of lesser crags either side of the road.
      for (const [px, pz, ph, pr] of PEAKS) h += ph * Math.exp(-((x - px) ** 2 + (z - pz) ** 2) / (2 * pr * pr));
      // Ridges around the edge keep the valley closed.
      const edge = Math.max(Math.abs(x), Math.abs(z));
      if (edge > 96) h += ((edge - 96) / 24) ** 2 * 22;
      sculpt[row * n + column] = Math.max(-32000, Math.min(32000, Math.round((h - b) * 100)));
    }
}
const heights = generateHeights({ ...TERRAIN, sculpt: encodeSculpt(sculpt) }, sculpt);
const ground = (x: number, z: number) => sampleHeight(heights, TERRAIN.resolution, TERRAIN.size, x, z);

// ------------------------------------------------------------ light, sky --
scene.add("Environment", [0, -40, 0], {
  Environment: {
    sky: "Procedural",
    skyColor: rgb("#6f9fc9"),
    horizonColor: rgb("#f3e3c8"),
    groundColor: rgb("#52604a"),
    sunElevation: 34,
    sunAzimuth: 130,
    sunIntensity: 3.1,
    sunColor: rgb("#fff0d6"),
    ambientIntensity: 1.2,
    fog: "Exponential",
    fogColor: rgb("#d4dde0"),
    fogNear: 40,
    fogFar: 260,
    fogDensity: 0.007,
    shadows: !process.env.MURIM_LITE,
    exposure: 1,
  },
  PostProcessing: {
    ambientOcclusion: false,
    shadowQuality: "Medium",
    bloom: 0.2,
    bloomThreshold: 0.85,
    contrast: 0.08,
    saturation: 0.04,
    temperature: 0.06,
    vignette: 0.25,
  },
});

const clearing = (x: number, z: number, r: number) => [x - r, z - r, x + r, z + r];
const exclusions = [
  clearing(VILLAGE.x, VILLAGE.z, 17),
  clearing(roadX(54) + 8, 54, 9),
  clearing(36, -4, 14),
  clearing(-44, -18, 12),
  clearing(-30, 52, 6),
  clearing(36, 24, 6),
  clearing(-44, -32, 6),
  clearing(8, -60, 6),
  [SECT.x - 26, SECT.z - 26, SECT.x + 26, SECT.z + 26],
  [CAMP.x - 16, CAMP.z - 16, CAMP.x + 16, CAMP.z + 16],
  [SHRINE.x - 20, SHRINE.z - 20, SHRINE.x + 20, SHRINE.z + 20],
];
scene.add("Valley", [0, 0, 0], {
  Terrain: {
    ...TERRAIN,
    sculpt: encodeSculpt(sculpt),
    grassColor: rgb("#5f7a3a"),
    rockColor: rgb("#7b776e"),
    sandColor: rgb("#a99a74"),
    snowColor: rgb("#eef0ec"),
    sandHeight: -2,
    snowHeight: 40,
    rockSlope: 0.78,
    scatter: process.env.MURIM_LITE ? "" : [
      // Low-poly trees from the wuxia kit (about 170 to 600 triangles each; the kit's old trees are 8,000).
      "330 0.0010 0.8 1.2 0.85 trunk",
      "331 0.0007 0.8 1.2 0.85 trunk",
      "328 0.0022 0.8 1.2 0.8 trunk",
      "329 0.0016 0.8 1.3 0.8 trunk",
      "332 0.0004 0.8 1.2 0.7 trunk",
      "333 0.0006 0.8 1.3 0.7",
      "42 0.0009 0.8 1.8 0.6 collide",
      "43 0.0014 0.8 1.4 0.6 collide",
      "37 0.0012 0.8 1.3 0.8",
      "38 0.0008 0.8 1.3 0.8",
      ...exclusions.map((r) => `exclude ${r.join(" ")}`),
    ].join("\n"),
  },
});

// ---------------------------------------------------------------- helpers --
const RED = "#8f1d1d";
const GOLD = "#c9a24a";
const STONE = "#b9b2a2";
const TEAL = "#1f5b63";
const CREAM = "#e9dfc6";
const solid = (name: string, x: number, z: number, size: V3, hex: string, options: { yaw?: number; lift?: number; look?: Record<string, unknown> } = {}) =>
  scene.box(name, [x, ground(x, z) + (options.lift ?? 0) + size[1] / 2, z], size, hex, options.yaw ? { Rotation: { euler: vec(0, options.yaw, 0) } } : {}, options.look);
// A box standing on top of something else (absolute y of its bottom).
const stack = (name: string, x: number, y: number, z: number, size: V3, hex: string, collide = true, look: Record<string, unknown> = {}) => {
  const id = scene.box(name, [x, y + size[1] / 2, z], size, hex, {}, look);
  if (!collide) delete (scene.entities[id]!.components as Components).Collider;
  return id;
};
const emissive = (hex: string, strength = 1.5) => ({ emissive: rgb(hex), emissiveIntensity: strength });

// The wuxia kit (tools/murim/assets/make_wuxia_kit.mjs): models are placed by their origin on the ground.
const W = (file: string) => modelId(file);
// An invisible solid box: a collider with nothing drawn, for the parts of a model you must not walk through.
const blocker = (name: string, x: number, z: number, size: V3, lift = 0) =>
  scene.add(name, [x, ground(x, z) + lift + size[1] / 2, z], { Scale: { value: vec(...size) }, Renderable: { mesh: 0, material: 0, visible: false }, RigidBody: { dynamic: false }, Collider: { type: "AABB" } });
// A building from the kit with its footprint solid: passable models (gates, pavilions) pass `solid = false` and blockers.
const place = (name: string, file: string, x: number, z: number, yaw = 0, solid = true, scale = 1, extra: Components = {}) =>
  scene.model(name, W(file), [x, ground(x, z), z], yaw, solid, scale, extra);

// The Great Hall and the shrine: a hall with its roof, stacked tiers above it, a spire on top. `lift` is how high the
// next piece's base sits (each tier's base is buried in the roof below).
function pagoda(name: string, x: number, z: number, tiers: number) {
  const base = ground(x, z);
  scene.model(`${name} hall`, W("pagoda-hall"), [x, base, z], 0, true);
  let y = base + 7.4;
  const files = ["pagoda-tier-large", "pagoda-tier-small"];
  for (let t = 0; t < tiers; t++) {
    const file = files[Math.min(t, files.length - 1)]!;
    scene.model(`${name} tier ${t + 1}`, W(file), [x, y, z], 0, false);
    y += file === "pagoda-tier-large" ? 5.6 : 5.0;
  }
  scene.model(`${name} spire`, W("pagoda-spire"), [x, y - 0.4, z], 0, false);
}

// A run of garden wall along x or z; the gap (a gate) is left open.
function wall(name: string, x0: number, z0: number, x1: number, z1: number, gap?: { from: number; to: number }) {
  const length = Math.hypot(x1 - x0, z1 - z0);
  const steps = Math.round(length / 4);
  const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) / steps;
    const x = x0 + (x1 - x0) * t;
    const z = z0 + (z1 - z0) * t;
    const at = alongX ? x : z;
    if (gap && at > gap.from && at < gap.to) continue;
    place(`${name} ${i + 1}`, "garden-wall", x, z, alongX ? 0 : Math.PI / 2, true, length / steps / 4.2);
  }
}

// -------------------------------------------------------------- the sect --
{
  const { x, z } = SECT;
  pagoda("Great Hall", x, z - 14, 2);
  // The gate: four pillars to walk between, a stele and incense in the yard, lanterns lining the way.
  place("Sect Gate", "paifang-gate", x, z + 16, 0, false);
  for (const px of [-5.2, -1.9, 1.9, 5.2]) blocker("Gate pillar", x + px, z + 16, [0.9, 6, 0.9]);
  wall("Sect wall W", x - 24, z + 16, x - 7, z + 16);
  wall("Sect wall E", x + 7, z + 16, x + 24, z + 16);
  wall("Sect wall W side", x - 24, z - 24, x - 24, z + 16, { from: z - 8 - 2.6, to: z - 8 + 2.6 });
  wall("Sect wall E side", x + 24, z - 24, x + 24, z + 16);
  wall("Sect wall back", x - 24, z - 24, x + 24, z - 24);
  place("Meditation altar", "incense-burner", x, z - 3, 0, true, 1.3);
  place("Alchemy furnace", "incense-burner", x + 13, z + 2, 0, true, 1.8);
  place("Furnace stand", "stone-lantern", x + 15.5, z + 2, 0, true, 0.8);
  place("Stele", "stele", x - 9, z + 11, 0.3, true);
  place("Stele", "stele", x + 9, z + 11, -0.3, true);
  for (const [px, pz] of [[-17, -6], [17, -6]] as const) {
    place("Pavilion", "pavilion", x + px, z + pz, 0, false);
    for (const [dx, dz] of [[-2.7, -2.7], [2.7, -2.7], [-2.7, 2.7], [2.7, 2.7]] as const) blocker("Pavilion pillar", x + px + dx, z + pz + dz, [0.6, 4, 0.6]);
  }
  place("Moon gate", "moon-gate", x - 24, z - 8, Math.PI / 2, false);
  // Training ground: wooden dummies that heal what you do to them, and a weapon rack.
  for (const [i, dx] of [-15, -12, -9].entries())
    place(`Training Dummy ${i + 1}`, "wooden-training-dummy", x + dx, z + 5, 0.4, true, 1, {
      Health: { current: 9999, maximum: 9999 },
      Script: { source: "function on_damaged(amount) world.heal(self.id, amount) end", props: {} },
    });
  place("Weapon rack", "weapon-rack", x - 12, z + 9, 0, true);
  // Stone lanterns along the approach.
  for (const dz of [-4, 2, 8, 13])
    for (const s of [-1, 1]) place("Stone lantern", "stone-lantern", x + s * 5.5, z + dz, 0, true, 1.1);
}

// Instructor Hua teaches scroll arts for silver (see player.lua); the alchemy furnace beside the training ground brews
// spirit herbs into elixirs and pills.
scene.add("Instructor Hua", [SECT.x + 8, ground(SECT.x + 8, SECT.z + 7) + 0.9, SECT.z + 7], {
  Scale: { value: vec(0.6, 1.8, 0.6) },
  Rotation: { euler: vec(0, -2.2, 0) },
  Renderable: { mesh: 132, material: 0, visible: true },
  Material: { color: rgb("#e6d2bc"), roughness: 0.8, keepTextures: false },
  RigidBody: { mass: 70, dynamic: true },
  Collider: {},
  Script: { source: lua("elder.lua").replace("local spoken = false", "local spoken = true"), props: { gear: "214:#2f4f6a 216:#2a3a4a 218:#c9a24a 215:#d8d0bc 217:#2a2a30" } },
});

// ---------------------------------------------------------- the elder NPC --
scene.add("Elder Mu", [SECT.x + 3.5, ground(SECT.x + 3.5, SECT.z - 1) + 0.9, SECT.z - 1], {
  Scale: { value: vec(0.6, 1.8, 0.6) },
  Rotation: { euler: vec(0, Math.PI, 0) },
  Renderable: { mesh: 132, material: 0, visible: true },
  Material: { color: rgb("#ecdcc8"), roughness: 0.8, keepTextures: false },
  RigidBody: { mass: 70, dynamic: true },
  Collider: {},
  Script: { source: lua("elder.lua"), props: { gear: "214:#f4f0e4 216:#e6e0cc 218:#d8b46a 215:#e6e0cc 217:#8a7a5a" } },
});

// --------------------------------------------------- the bandit camp --
{
  const { x, z } = CAMP;
  for (const [i, [dx, dz]] of [[-9, -6], [9, -5], [-8, 8], [8, 9]].entries()) {
    // Doors face the fire.
    place(`Tent ${i + 1}`, "canvas-tent", x + dx!, z + dz!, Math.atan2(dz!, -dx!), true);
  }
  scene.model("Camp crates", 185, [x + 3, ground(x + 3, z - 3), z - 3], 0.5, true, 1.4);
  scene.model("Camp barrel", 180, [x - 2, ground(x - 2, z + 1), z + 1], 0, true, 1.5);
  scene.add("Camp fire", [x, ground(x, z) + 0.4, z], {
    Scale: { value: vec(0.9, 0.5, 0.9) },
    Renderable: { mesh: 0, material: 0, visible: true },
    Material: { color: rgb("#ff7a2a"), roughness: 0.6, keepTextures: false, ...emissive("#ff6a1a", 2.5) },
    Light: component("Light", { color: rgb("#ff8a3a"), intensity: 5, range: 16 }),
  });
  scene.add("Camp chest", [x + 6, ground(x + 6, z - 1) + 0.4, z - 1], {
    Scale: { value: vec(1, 0.8, 0.7) },
    Renderable: { mesh: 183, material: 0, visible: true },
    RigidBody: { dynamic: false },
    Collider: {},
    Container: { table: "1 item Qi Elixir\n1 item Qi Elixir\n0.6 item Breakthrough Pill\n1 health 60", hold: 0.6 },
  });
}

const fighter = (name: string, x: number, z: number, opts: { mesh?: number; hex: string; health: number; scale?: number; melee: Components; props: Record<string, unknown>; yaw?: number }) => {
  const s = opts.scale ?? 1;
  scene.add(name, [x, ground(x, z) + 0.9 * s, z], {
    Scale: { value: vec(0.6 * s, 1.8 * s, 0.6 * s) },
    Rotation: { euler: vec(0, opts.yaw ?? 0, 0) },
    Renderable: { mesh: opts.mesh ?? 176, material: 0, visible: true },
    Material: { color: rgb(opts.hex), roughness: 0.75, keepTextures: false },
    RigidBody: { mass: 70 * s, dynamic: true },
    Collider: {},
    Health: { current: opts.health, maximum: opts.health },
    Melee: { team: 1, ai: true, ...opts.melee },
    Script: { source: lua("enemy.lua"), props: opts.props },
  });
};
// Four kinds of bandit, each reading differently so a fight has something to learn: a brawler (fists, quick light
// strings), a swordsman (a balanced blade), a spearman (long thrusts and a slow sweep to read and dodge) and
// qi adepts (stay back and throw qi). All are Mortals; the first two are at the camp's edge, so the road opens with a
// fair two-on-one before the rest take notice.
const ROLL = "roll: clip=roll input=dodge dur=0.6 hit=0-0 cancel=0.45 dmg=0 lunge=3.2 free iframes=0.03-0.38 track=0 limb=pelvis";
const SPEAR_MOVES = [
  "thrust: clip=sword_light_a input=light dur=0.75 hit=0.22-0.3 cancel=0.4 dmg=9 reach=2.2 radius=0.5 lunge=1.3 stun=0.4 limb=hand_r",
  "sweep: clip=sword_heavy_a input=heavy dur=1.2 hit=0.35-0.45 cancel=0.7 dmg=14 reach=2.0 radius=1.1 knock=4 stun=0.6 armor limb=hand_r",
  ROLL,
].join("\n") + "\n";
const ADEPT_MOVES = ["qi_bolt: clip=energy_throw input=light dur=1.1 hit=0.45-0.5 cancel=0.8 dmg=8 projectile=13 shape=3 knock=3 stun=0.4 limb=hand_r", ROLL].join("\n") + "\n";
const SKIN = ["#e6d2bc", "#d9c4aa", "#e2cdb4", "#d4bfa6", "#dccab4"];
const BANDITS: { name: string; at: number[]; health: number; qi: number; drop: number; silver: number; gear: string; melee: Components }[] = [
  { name: "Bandit Brawler", at: [-9, -9], health: 80, qi: 30, drop: 0, silver: 12, gear: "214:#6b4a3a 216:#3a3228 215:#2a2a2a 217:#2a2a2a", melee: { aggression: 0.35, skill: 0.2 } },
  { name: "Bandit Swordsman", at: [-3, -11], health: 95, qi: 35, drop: 1, silver: 15, gear: "214:#5a5a42 216:#3a3a2a 215:#2a2a2a 217:#2a2a2a", melee: { aggression: 0.45, skill: 0.3, style: "Sword", rightHand: 205 } },
  { name: "Bandit Spearman", at: [6, -2], health: 105, qi: 40, drop: 0, silver: 18, gear: "214:#7a3d3d 216:#3a2a2a 215:#2a2a2a 217:#2a2a2a", melee: { aggression: 0.5, skill: 0.35, style: "Custom", moves: SPEAR_MOVES, rightHand: 208 } },
  { name: "Bandit Qi Adept 1", at: [-4, 8], health: 60, qi: 45, drop: 1, silver: 20, gear: "214:#4a4a7a 216:#2a2a44 218:#6a6aa0 215:#2a2a2a 217:#2a2a2a", melee: { aggression: 0.4, skill: 0.4, style: "Custom", moves: ADEPT_MOVES, range: 9 } },
  { name: "Bandit Qi Adept 2", at: [8, 7], health: 60, qi: 45, drop: 1, silver: 20, gear: "214:#4a4a7a 216:#2a2a44 218:#6a6aa0 215:#2a2a2a 217:#2a2a2a", melee: { aggression: 0.4, skill: 0.4, style: "Custom", moves: ADEPT_MOVES, range: 9 } },
];
BANDITS.forEach((b, i) => fighter(b.name, CAMP.x + b.at[0]!, CAMP.z + b.at[1]!, { hex: SKIN[i]!, health: b.health, melee: b.melee, props: { qi: b.qi, drop: b.drop, silver: b.silver, gear: b.gear }, yaw: 0 }));

// ---------------------------------------------------- the shrine and boss --
{
  const { x, z } = SHRINE;
  pagoda("Shrine", x, z - 10, 1);
  place("Shrine gate", "paifang-gate", x, z + 14, 0, false);
  for (const px of [-5.2, -1.9, 1.9, 5.2]) blocker("Shrine gate pillar", x + px, z + 14, [0.9, 6, 0.9]);
  place("Shrine incense burner", "incense-burner", x, z - 1, 0, true);
  for (const s of [-1, 1]) {
    stack("Shrine pillar", x + s * 9, ground(x + s * 9, z + 4), z + 4, [1.1, 7, 1.1], RED);
    stack("Shrine brazier", x + s * 5, ground(x + s * 5, z + 6), z + 6, [0.9, 1.1, 0.9], "#2d2a28", true, emissive("#ff7a2a", 0.4));
  }
  scene.add("Shrine fire", [x - 5, ground(x - 5, z + 6) + 1.5, z + 6], { Light: component("Light", { color: rgb("#ff8a3a"), intensity: 5, range: 14 }) });
  fighter("Iron Fist Elder", x, z + 2, {
    hex: "#cdbca8",
    health: 520,
    scale: 1.25,
    yaw: 0,
    melee: { aggression: 0.75, skill: 0.8, poise: 120, breakTime: 3, guard: 140 },
    props: { qi: 200, pill: 1, gear: "214:#3b3b46 218:#8f1d1d 216:#26262c 215:#26262c 217:#1a1a1a" },
  });
}

// ------------------------------------------- points of interest and spirit veins --
// The road from the sect to the shrine has something to see every thirty metres or so, each visible from the one before:
// a roadside shrine, the ruined watchtower on the hill, the bandit camp, and off the road a hermit's hut. Spirit veins
// (a stele ringed with light) sit off the path: meditating near one gathers qi three times as fast.
const VEINS: [number, number][] = [[-30, 52], [36, 24], [-44, -32], [8, -60]];
{
  const rx = roadX(54) + 8;
  place("Wayside shrine", "roadside-shrine", rx, 54, -0.3, true);
  place("Roadside lantern", "stone-lantern", rx - 3.6, 58, 0, true);
  place("Roadside lantern", "stone-lantern", rx + 3.6, 58, 0, true);
  // The ruined watchtower on the hill east of the road: one tier standing, a fallen wall, rubble.
  place("Watchtower", "watchtower", 36, -4, 0.4, true);
  place("Watchtower wall", "garden-wall", 31, -1, 1.1, true);
  place("Watchtower wall", "garden-wall", 41, -8, 0.2, true, 0.8);
  for (const [dx, dz, f] of [[-4, 4, 0], [5, 3, 1], [2, -6, 0], [-6, -3, 1]] as const) place("Rubble", ["rock-large", "rock-medium"][f]!, 36 + dx, -4 + dz, dx, true, 1.3);
  // The hermit's hut and his practice ground, west of the road.
  place("Hermit's hut", "thatched-hut", -42, -20, 0.3, true);
  place("Hermit's lantern", "stone-lantern", -37, -15, 0, true);
  place("Hermit's dummy", "wooden-training-dummy", -46, -13, 0.8, true);
  place("Hermit's rack", "weapon-rack", -48, -19, 1.2, true);
  VEINS.forEach(([vx, vz], i) => {
    const y = ground(vx, vz);
    place(`Spirit Vein ${i + 1}`, "stele", vx, vz, i, true, 1.1);
    scene.add(`Spirit Vein ${i + 1} glow`, [vx, y + 0.3, vz], {
      Particles: component("Particles", { preset: "Sparkle", color: rgb("#aef5ea"), endColor: rgb("#2aa8c4"), rate: 14, lifetime: 2.2, speed: 0.6, size: 0.14, endSize: 0.04, gravityScale: -0.08, shape: "Sphere", shapeSize: 2.6, space: "World" }),
    });
    // A ring of paving stones round it, so the spot reads from a distance.
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      scene.box("Vein stone", [vx + Math.cos(a) * 3, ground(vx + Math.cos(a) * 3, vz + Math.sin(a) * 3) + 0.12, vz + Math.sin(a) * 3], [0.9, 0.24, 0.9], "#8fcfc6", { Rotation: { euler: vec(0, a, 0) } }, { roughness: 0.5, ...emissive("#4fd1c5", 0.7) });
    }
  });
}

// --------------------------------------------------------- Willow Village --
// A safe place off the road: a merchant who sells elixirs and pills for silver, and Wen, whose cart the bandits took
// (it is by the old watchtower). Both are talked to with E; the dialogue is driven from player.lua.
{
  const { x, z } = VILLAGE;
  // Houses face the square in the middle.
  place("Village house", "farmhouse", x - 9, z - 3, -0.25, true);
  place("Village house", "farmhouse", x + 9, z - 4, 0.25, true);
  place("Village house", "farmhouse", x + 1, z + 10, Math.PI, true);
  place("Market stall", "market-stall", x - 2, z + 3, Math.PI, true);
  place("Market incense", "incense-burner", x + 2.5, z + 1, 0, true, 0.7);
  for (const [dx, dz] of [[-5, 4], [5, 4], [-5, -3], [5, -2]] as const) place("Village lantern", "stone-lantern", x + dx, z + dz, 0, true);
  for (const [dx, dz] of [[-11, 6], [12, 4], [-9, 11]] as const) place("Village bamboo", "bamboo-clump", x + dx, z + dz, dx, false);
  const villager = (name: string, vx: number, vz: number, yaw: number, gear: string, hex: string) =>
    scene.add(name, [vx, ground(vx, vz) + 0.9, vz], {
      Scale: { value: vec(0.6, 1.8, 0.6) },
      Rotation: { euler: vec(0, yaw, 0) },
      Renderable: { mesh: 132, material: 0, visible: true },
      Material: { color: rgb(hex), roughness: 0.8, keepTextures: false },
      RigidBody: { mass: 70, dynamic: true },
      Collider: {},
      Script: { source: lua("elder.lua").replace("local spoken = false", "local spoken = true"), props: { gear } },
    });
  villager("Merchant Lin", x - 1, z + 3.5, 0, "214:#8a5a2a 216:#5a4430 218:#c9a24a 215:#e6d0a0 217:#3a2a22", "#ecdcc8");
  villager("Wen", x + 6, z + 2, -1.6, "214:#5a7a5a 216:#4a4a3a 215:#3a3a3a 217:#3a2a22", "#e6d2bc");
}
// Spirit herbs grow in the grass off the paths: pick them (hold E) and brew them at the furnace.
{
  const pads2 = [SECT, CAMP, SHRINE, VILLAGE];
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  let placed = 0;
  while (placed < 16) {
    const hx = (rnd() - 0.5) * 200, hz = (rnd() - 0.5) * 200;
    if (pads2.some((q) => Math.hypot(hx - q.x, hz - q.z) < 22) || Math.abs(hx - roadX(hz)) < 6) continue;
    placed++;
    scene.model(`Spirit herb ${placed}`, 38, [hx, ground(hx, hz), hz], rnd() * 6, true, 0.7, {
      Material: { color: rgb("#6fe0b8"), roughness: 0.6, keepTextures: false, ...emissive("#3fd0a0", 1.2) },
      Container: { table: "1 item Spirit Herb", hold: 0.5 },
    });
  }
}

// Wen's cart, abandoned near the watchtower.
place("Lost Cart", "hand-cart", 41, 0, 0.5, true);
place("Lost crates", "crates-stacked", 43.2, 1.2, 0.2, true, 0.7);

// ---------------------------------------------------- wildlife in the valley --
for (const [i, [x, z]] of [[28, 30], [-34, 44], [22, -30], [-30, -40]].entries())
  scene.add(`Deer ${i + 1}`, [x!, ground(x!, z!) + 0.5, z!], {
    Scale: { value: vec(0.5, 1.1, 1.5) },
    Renderable: { mesh: 238, material: 0, visible: true },
    RigidBody: { mass: 60, dynamic: true },
    Collider: {},
    AIState: { state: "Walking" },
    Pedestrian: { archetype: 2 },
    Wildlife: { wary: 16, flee: 7, speed: 6, leash: 28 },
  });

// -------------------------------------------------------------- the player --
const MOVES = [
  martialArtsMoves.trimEnd(),
  "# Qi arts: each realm opens another (locked until the script unlocks it)",
  "qi_palm: clip=energy_throw input=skill1 dur=0.8 hit=0.26-0.3 cancel=0.55 dmg=24 projectile=22 shape=0 knock=5 stun=0.6 mana=18 cooldown=0.8 locked limb=hand_r",
  "wind_palm: clip=ground_pound input=skill2 dur=1.0 hit=0.3-0.42 cancel=0.8 dmg=28 aoe=4 knock=10 launch=3 stun=0.8 stop=0.1 mana=35 cooldown=3 locked limb=hand_r",
  "tiger_rush: clip=dash_strike input=skill3 dur=1.0 hit=0.15-0.45 cancel=0.75 dmg=32 reach=1.4 lunge=6 knock=7 stun=0.7 stop=0.1 mana=30 cooldown=4 armor locked limb=hand_r",
  "# Scroll arts: learned from Instructor Hua, used with keys 5 to 7 (the script performs them by name).",
  "sword_qi: clip=energy_throw input=special seq=ffbb dur=0.8 hit=0.26-0.3 cancel=0.55 dmg=30 projectile=20 shape=1 knock=4 stun=0.6 mana=22 cooldown=1.2 locked limb=hand_r",
  "thunder_lance: clip=energy_throw input=special seq=lrlr dur=0.9 hit=0.3-0.34 cancel=0.6 dmg=42 projectile=36 shape=4 knock=3 stun=1.0 stagger=45 mana=30 cooldown=2.5 locked limb=hand_r",
  "flame_palm: clip=energy_throw input=special seq=bbff dur=0.9 hit=0.3-0.34 cancel=0.6 dmg=26 projectile=14 shape=3 knock=5 stun=0.6 mana=24 cooldown=1.6 locked limb=hand_r",
  "nine_dragons: clip=ground_pound input=ultimate dur=1.2 hit=0.3-0.45 cancel=0.95 dmg=70 aoe=5.5 knock=12 launch=6 stun=1.2 stop=0.18 cost=70 armor knockdown unblockable finisher locked limb=hand_r",
].join("\n") + "\n";
const [startX, startZ] = (process.env.MURIM_START ?? "").split(",").map(Number);
const spawn: V3 = process.env.MURIM_START ? [startX!, ground(startX!, startZ!) + 1, startZ!] : [SECT.x, ground(SECT.x, SECT.z + 8) + 1, SECT.z + 8];
scene.add("Player", spawn, {
  Scale: { value: vec(0.6, 1.8, 0.6) },
  Rotation: { euler: vec(0, Math.PI, 0) },
  Renderable: { mesh: 132, material: 0, visible: true },
  Player: {},
  RigidBody: { mass: 70, dynamic: true },
  Collider: {},
  CharacterController: { mode: "ThirdPerson", walkSpeed: 3.6, sprintSpeed: 7.4, jumpHeight: 1.1, acceleration: 30, airControl: 6, stepHeight: 0.5 },
  Health: { current: Number(process.env.MURIM_HP ?? 100), maximum: 100 },
  Melee: { team: 0, ai: false, energy: 40, style: "Custom", moves: MOVES, manaMax: 60, manaRegen: 6 },
  Inventory: {
    slots: 24,
    maxWeight: 30,
    weights: "Qi Elixir=0.2, Breakthrough Pill=0.2, Jade Dew Pill=0.2, Spirit Herb=0.05, Silver=0.01, Azure Robe=2",
    stats: "Azure Robe: slot=body armor=10\nJade Charm: health=25\nIron Gloves: slot=hands damage=10",
  },
  Script: { source: lua("player.lua"), props: process.env.MURIM_REALM ? { realm: Number(process.env.MURIM_REALM), qi: Number(process.env.MURIM_QI ?? 0), silver: Number(process.env.MURIM_SILVER ?? 0) } : {} },
});
scene.add("Camera", [spawn[0], spawn[1] + 3, spawn[2] + 6], {
  Camera: { fov: 60, far: 700 },
  CameraFollow: { target: "", offset: vec(0, 2.2, -4.8), smoothing: 0.12, lookHeight: 1.3, collision: true, orbit: true },
});
scene.add("Input", [0, -40, 0], {
  InputActions: {
    bindings: [
      "move_x: d, -a, right, -left, pad_lx",
      "move_y: w, -s, up, -down, -pad_ly",
      "look_x: mouse_dx*0.05, pad_rx",
      "look_y: mouse_dy*0.05, pad_ry",
      "jump: space, pad_a",
      "interact: e, pad_y",
      "sprint: shift, pad_lb",
      "crouch: ctrl, pad_b",
      "light: mouse_left, j, pad_x",
      "heavy: mouse_right, k, pad_y",
      "kick: f, l, pad_b",
      "special: u, pad_rb",
      "dodge: x, alt, pad_ls",
      "block: r, pad_lt",
      "lock: mouse_middle, t, pad_rs",
      "skill1: 1, q",
      "skill2: 2",
      "skill3: 3",
      "ultimate: 4, g",
      "meditate: n",
      "breakthrough: b",
      "elixir: h",
      "fly: v",
      "heal: z",
      "art1: 5",
      "art2: 6",
      "art3: 7",
      "controls: o",
    ].join("\n"),
  },
});

// ------------------------------------------------------------ objectives --
scene.add("Quests", [0, -40, 0], {
  Objectives: {
    list: [
      "meet-elder | Meet Elder Mu | Speak with the elder inside the sect gate. | reach Elder Mu 5 |",
      "gather-qi | Gather qi | Stand still and hold N to meditate. | script |",
      "breakthrough | Break through | Fill your qi bar, then press B with a Breakthrough Pill. | script |",
      "bandits | Clear the road | Defeat the five bandits in the valley camp. | kill Bandit 5 |",
      "guardian | Face the guardian | Climb to the shrine and defeat the Iron Fist Elder. | kill Iron Fist 1 |",
    ].join("\n"),
  },
});

// -------------------------------------------------------------------- HUD --
const widget = (name: string, kind: UIWidget, extra: Record<string, unknown> = {}) => {
  const kit = widgetInfo(kind);
  scene.add(name, [0, -40, 0], {
    UI: component("UI", {
      kind: "Widget",
      widget: kind,
      style: "Modern",
      anchor: kit.anchor,
      offsetX: kit.offsetX,
      offsetY: kit.offsetY,
      text: kit.text,
      visibleWhen: kit.visibleWhen,
      action: "none",
      ...extra,
    }),
  });
};
const ui = (name: string, value: Record<string, unknown>) => scene.add(name, [0, -40, 0], { UI: component("UI", value) });
// Layout (one style, Minimal, on every piece; the UI kit's own widgets only):
//   bottom-left   Fighter bars, with the Qi bar and the status chips stacked above them
//   bottom-centre Skill bar (keys 1-4), with the interact prompt above
//   top-left      Objective        top-centre  Compass, then the Target frame      top-right  Minimap
//   centre        Damage direction, and the toggled sheets: Bag (I), Character (C), Journal (J)
// Everything sits inside a 5% safe margin, and the controls live in the settings panel (O or Esc).
const MARGIN_X = 96;
const MARGIN_Y = 54;
const style = { style: "Minimal" };
widget("Fighter bars", "Fighter bars", { ...style, offsetX: MARGIN_X, offsetY: -MARGIN_Y });
widget("Qi bar", "Resource bar", { ...style, anchor: "bottom-left", offsetX: MARGIN_X, offsetY: -MARGIN_Y - 108, width: 360, height: 40, text: "Mortal\nQi 0 / 100", value: 0, color: rgb("#7fe0d4") });
widget("Status", "Status effects", { ...style, anchor: "bottom-left", offsetX: MARGIN_X, offsetY: -MARGIN_Y - 214, width: 300, height: 100, text: "" });
widget("Skill bar", "Skill bar", { ...style, anchor: "bottom-center", offsetY: -MARGIN_Y, width: 300, height: 70 });
widget("Objective", "Objective", { ...style, anchor: "top-left", offsetX: MARGIN_X, offsetY: MARGIN_Y, visibleWhen: "play" });
widget("Compass", "Compass", { ...style, anchor: "top-center", offsetY: MARGIN_Y });
widget("Target", "Target frame", { ...style, anchor: "top-center", offsetY: MARGIN_Y + 56, width: 420, height: 64, text: "", value: 0 });
widget("Minimap", "Minimap", { ...style, anchor: "top-right", offsetX: -MARGIN_X, offsetY: MARGIN_Y });
widget("Waypoints", "Waypoints", style);
widget("Damage direction", "Damage direction", { ...style, anchor: "center", width: 420, height: 420, text: "" });
widget("Damage numbers", "Damage numbers", style);
widget("Boss bar", "Boss bar", style);
widget("Notification", "Notification", style);
widget("Interact prompt", "Interact prompt", style);
widget("Dialogue", "Dialogue", { ...style, anchor: "bottom-center", offsetY: -MARGIN_Y - 176, width: 660, height: 150, text: "" });
widget("Inventory", "Inventory", { ...style, anchor: "center", visibleWhen: "toggle", toggleKey: "KeyI" });
widget("Character sheet", "Character sheet", { ...style, anchor: "center", width: 440, height: 440, visibleWhen: "toggle", toggleKey: "KeyC", text: "Cultivator\nMortal realm" });
widget("Skill tree", "Skill tree", { ...style, anchor: "center", width: 520, height: 400, visibleWhen: "toggle", toggleKey: "KeyK", text: "Cultivation tree" });
widget("Quest log", "Quest log", { ...style, anchor: "center", width: 480, height: 360, visibleWhen: "toggle", toggleKey: "KeyJ", text: "Journal" });
widget("Death screen", "Death screen", { ...style, anchor: "center", width: 640, height: 320, text: "" });
widget("Key hints", "Key hints", { ...style, anchor: "bottom-right", offsetX: -MARGIN_X, offsetY: -MARGIN_Y, width: 600, height: 40, text: "I|Bag\nC|Stats\nJ|Journal\nK|Arts\nM|Map" });

// ------------------------------------------------------------ qi effects --
const fxEmitter = (name: string, mode: string, particles: Record<string, unknown>, extra: Components = {}) =>
  scene.add(name, [SECT.x, -200, SECT.z + 8], {
    Particles: component("Particles", particles),
    Script: { source: lua("qifx.lua"), props: { mode } },
    ...extra,
  });
const TEAL_GLOW = rgb("#7fe0d4");
fxEmitter("Qi Aura", "aura", { preset: "Sparkle", color: TEAL_GLOW, endColor: rgb("#1c6e8a"), rate: 0, lifetime: 1.1, speed: 0.9, size: 0.1, endSize: 0.2, gravityScale: -0.15, shape: "Sphere", shapeSize: 0.7, space: "World" });
fxEmitter("Qi Bolt", "bolt", { preset: "Sparkle", color: rgb("#e8fffb"), endColor: rgb("#2aa8c4"), rate: 90, lifetime: 0.35, speed: 0.4, size: 0.2, endSize: 0.1, gravityScale: 0, shape: "Sphere", shapeSize: 0.12, space: "World" });
fxEmitter("Qi Burst", "burst", { preset: "Sparkle", color: rgb("#ffffff"), endColor: rgb("#3fc5d8"), rate: 0, lifetime: 0.6, speed: 6, size: 0.16, endSize: 0.05, gravityScale: 0.2, shape: "Sphere", shapeSize: 0.3, space: "World" });
fxEmitter("Qi Mark", "mark", { preset: "Sparkle", color: rgb("#ff5a4a"), endColor: rgb("#ffb347"), rate: 70, lifetime: 0.7, speed: 0.15, size: 0.2, endSize: 0.05, gravityScale: 0, shape: "Sphere", shapeSize: 3, space: "World" });
fxEmitter("Qi Burn", "burn", { preset: "Fire", color: rgb("#9ff0ff"), endColor: rgb("#ff7a2a"), rate: 40, lifetime: 0.7, speed: 1.4, size: 0.22, endSize: 0.5, gravityScale: -0.3, shape: "Sphere", shapeSize: 0.5, space: "World" });

const out = process.env.MURIM_OUT ?? join(ROOT, "games/my-games/azure-cloud-sect/scene.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ format: 1, name: "Azure Cloud Sect", hud: "widgets", entities: scene.entities, prefabs: scene.prefabs }, null, 1) + "\n");
writeFileSync(
  join(dirname(out), "game.json"),
  JSON.stringify(
    {
      name: "Azure Cloud Sect",
      genre: "Action RPG",
      description: "An open-world murim cultivation slice: gather qi, break through realms, learn qi arts, ride a flying sword and face the shrine guardian.",
      scene: "scene.json",
      accent: "#4fd1c5",
    },
    null,
    2,
  ) + "\n",
);
console.log(`wrote ${out}: ${scene.entities.length} entities`);
