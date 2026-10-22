// Generates JIANGHU ROAD (games/my-games/jianghu-road): a single-player open-world murim game on this engine. Run from apps/editor:
//
//   npm run jianghu
//
// The world is data (world.ts) and so are the quests (quests.ts); this script turns them into entities: a 1 km heightfield with a
// walled city at the middle, regions of rising danger round it, roads and waystones between them, every person, fighter and thing
// the data lists, and the systems that run it (lua/). North is -z. The design is docs/JIANGHU_ROAD_DESIGN.md.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { encodeSculpt, fbm, generateHeights, sampleHeight } from "../../apps/editor/src/editor/terrain";
import { widgetInfo } from "../../apps/editor/src/editor/uiKit";
import { martialArtsMoves, swordMoves } from "../../apps/editor/src/scene/meleeMoves";
import type { UIWidget } from "../../apps/editor/src/scene/Components";
import * as kitModule from "../lib/scene_kit";
import type { Components, V3 } from "../lib/scene_kit";
// scene_kit is CommonJS to tsx beside this ES module, so its exports may sit on `default`.
const kit: typeof kitModule = (kitModule as unknown as { default?: typeof kitModule }).default ?? kitModule;
const { ROOT, SceneBuilder, component, modelBounds, modelId, rgb, vec } = kit;
import { QUESTS } from "./quests";
import { FOES, GATES, HUBS, MAP, NPCS, PEAK, REGIONS, ROADS, SUMMIT_PATH, THINGS, roadDistance } from "./world";

const here = dirname(fileURLToPath(import.meta.url));
const luaRaw = (file: string) => readFileSync(join(here, "lua", file), "utf8");
// Who fights at what strength (lua/bestiary.lua with its tables filled in), placed in front of the scripts that look a fighter up by name.
const BEST: Record<string, number> = Object.fromEntries(FOES.map((f) => [f.name, f.realm]));
const PEACEFUL: Record<string, boolean> = Object.fromEntries(FOES.filter((f) => f.peaceful).map((f) => [f.name, true]));
function toLua(value: unknown): string {
  if (value === null || value === undefined) return "nil";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return "{ " + value.map(toLua).join(", ") + " }";
  return "{ " + Object.entries(value as Record<string, unknown>).map(([k, v]) => `[${JSON.stringify(k)}] = ${toLua(v)}`).join(", ") + " }";
}
const bestiaryLua = luaRaw("bestiary.lua").replace("--@BESTIARY@", toLua(BEST)).replace("--@PEACEFUL@", toLua(PEACEFUL));
const lua = (file: string) => (file === "enemy.lua" || file === "beast.lua" ? bestiaryLua + "\n" : "") + luaRaw(file);
const scene = new SceneBuilder();
const BODY_M = 359, BODY_F = 360;
const idle = (clip: string) => ({ AnimationState: { clip: `ual_${clip}`, time: 0, looping: true } });
const emissive = (hex: string, strength = 1.5) => ({ emissive: rgb(hex), emissiveIntensity: strength });
const W = (file: string) => modelId(file);

// ---------------------------------------------------------------- terrain --
const TERRAIN = { size: MAP.size, resolution: MAP.resolution, height: 14, seed: 41, frequency: 0.8, octaves: 5 };
const base = generateHeights({ ...TERRAIN, sculpt: "" });
const baseAt = (x: number, z: number) => sampleHeight(base, TERRAIN.resolution, TERRAIN.size, x, z);
const smoothstep = (t: number) => {
  const c = Math.min(Math.max(t, 0), 1);
  return c * c * (3 - 2 * c);
};
const average = (x: number, z: number, r: number) => {
  let sum = 0, count = 0;
  for (let dx = -r; dx <= r; dx += 4)
    for (let dz = -r; dz <= r; dz += 4) {
      sum += baseAt(x + dx, z + dz);
      count++;
    }
  return sum / count;
};
const edgeOf = (x: number, z: number) => Math.max(Math.abs(x), Math.abs(z));
// Level ground for the city and each hub (at the height the region's shape gives that place: the fortress stands on its plateau, the bones gate in its basin).
const pads = [
  { x: 0, z: 0, r: 58 },
  { ...HUBS.greenhollow, r: 20 },
  { ...HUBS.portJade, r: 20 },
  { ...HUBS.peakShrine, r: 24 },
  { ...HUBS.gorgeHall, r: 20 },
  { ...HUBS.fortress, r: 22 },
  { ...HUBS.bonesGate, r: 22 },
  { x: 248, z: 56, r: 9 }, // Old Lotus' hut by the pond
  { x: -338, z: 26, r: 10 }, // the shore by the pier
  { x: 0, z: -398, r: 8 }, // the summit
].map((p) => ({ ...p, h: average(p.x, p.z, 10) + regionShape(p.x, p.z) }));
// The lake beside Port Jade.
const LAKE = { x: -405, z: 20, rx: 58, rz: 48, depth: 2.4 };
// Old Lotus' pond.
const POND = { x: 266, z: 62, rx: 13, rz: 9, depth: 1.5 };
const pondLevel = average(POND.x + POND.rx + 8, POND.z, 3) - 0.1;
const lakeLevel = average(LAKE.x + LAKE.rx + 12, LAKE.z, 4) - 0.2;

// The shape each region gives the land (metres added to the noise).
function regionShape(x: number, z: number): number {
  let h = 0;
  // Heaven Peak and its summit, to the north.
  h += PEAK.height * Math.exp(-((x - PEAK.x) ** 2 + (z - PEAK.z) ** 2) / (2 * PEAK.spread * PEAK.spread)) * (0.78 + 0.44 * (fbm(x / 22, z / 22, 7, 4) * 0.5 + 0.5));
  // Frostfang Ridge: a high cold plateau in the north-east.
  h += 36 * (1 - smoothstep((Math.hypot(x - HUBS.fortress.x, z - HUBS.fortress.z) - 95) / 70));
  // Crimson Maple Gorge: a raised shelf with a canyon cut along its middle.
  {
    const d = Math.hypot(x - HUBS.gorgeHall.x, z - HUBS.gorgeHall.z);
    h += 18 * (1 - smoothstep((d - 120) / 70));
    h -= 16 * Math.exp(-((x - HUBS.gorgeHall.x - 40) ** 2) / (2 * 14 * 14)) * (1 - smoothstep((Math.abs(z - HUBS.gorgeHall.z) - 100) / 40));
  }
  // The Sunken Valley of Bones: a wide dry basin with a rim.
  {
    const d = Math.hypot(x - 320, z - 340);
    h -= 9 * (1 - smoothstep(d / 105)) - 12 * smoothstep((d - 105) / 40) * (1 - smoothstep((d - 150) / 60));
  }
  // The Bamboo Forest: low rolling hills. The marches: wet low land.
  h += 4 * Math.sin(x / 38) * Math.cos(z / 31) * (1 - smoothstep((Math.hypot(x - HUBS.greenhollow.x, z - HUBS.greenhollow.z) - 150) / 80));
  h -= 3 * (1 - smoothstep(Math.hypot(x - HUBS.portJade.x, z - HUBS.portJade.z) / 170));
  // Mountains round the edge of the map close it in.
  const edge = edgeOf(x, z);
  if (edge > 425) h += ((edge - 425) / 75) ** 1.7 * 62 * (0.8 + 0.4 * (fbm(x / 30, z / 30, 3, 4) * 0.5 + 0.5)) + 5 * fbm(x / 9, z / 9, 5, 3) * Math.min(1, (edge - 425) / 30);
  return h;
}

// The height the summit path has at (x, z) and how far (x, z) is from it: the path rises evenly by its length from the shrine pad to the summit pad.
const summitEnds = [pads.find((p) => p.x === HUBS.peakShrine.x && p.z === HUBS.peakShrine.z)!.h, pads.find((p) => p.z === -398)!.h];
const summitLength = SUMMIT_PATH.slice(1).reduce((sum, [x, z], i) => sum + Math.hypot(x - SUMMIT_PATH[i]![0], z - SUMMIT_PATH[i]![1]), 0);
function summitAt(x: number, z: number) {
  let best = { d: Infinity, h: 0 };
  let walked = 0;
  for (let i = 0; i + 1 < SUMMIT_PATH.length; i++) {
    const [ax, az] = SUMMIT_PATH[i]!, [bx, bz] = SUMMIT_PATH[i + 1]!;
    const len = Math.hypot(bx - ax, bz - az);
    const t = Math.min(1, Math.max(0, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / (len * len)));
    const d = Math.hypot(x - (ax + (bx - ax) * t), z - (az + (bz - az) * t));
    if (d < best.d) best = { d, h: summitEnds[0]! + (summitEnds[1]! - summitEnds[0]!) * ((walked + t * len) / summitLength) };
    walked += len;
  }
  return best;
}
const sculpt = new Int16Array(TERRAIN.resolution * TERRAIN.resolution);
{
  const n = TERRAIN.resolution;
  const step = TERRAIN.size / (n - 1);
  for (let row = 0; row < n; row++)
    for (let column = 0; column < n; column++) {
      const x = -TERRAIN.size / 2 + column * step;
      const z = -TERRAIN.size / 2 + row * step;
      const b = base[row * n + column]!;
      let h = b + regionShape(x, z);
      const blend = (target: number, distance: number, falloff: number) => {
        h += (target - h) * (1 - smoothstep(distance / falloff));
      };
      // Roads follow the slow shape of the land; the summit road is allowed to climb.
      const d = roadDistance(x, z);
      if (d < 20) blend(average(x, z, 8) + regionShape(x, z) * 0.7, Math.max(0, d - 3), 14);
      for (const p of pads) blend(p.h, Math.max(0, Math.hypot(x - p.x, z - p.z) - p.r), p.r > 50 ? 48 : 16);
      {
        const e = Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz);
        if (e < 1.5) {
          const bed = e < 1 ? lakeLevel + 0.6 - (LAKE.depth + 0.6) * (1 - e * e) : lakeLevel + 0.6 + (e - 1) * 1.4;
          h += (bed - h) * (1 - smoothstep((e - 1.15) / 0.35));
        }
      }
      {
        const e = Math.hypot((x - POND.x) / POND.rx, (z - POND.z) / POND.rz);
        if (e < 1.6) {
          const bed = e < 1 ? pondLevel + 0.3 - (POND.depth + 0.3) * (1 - e * e) : pondLevel + 0.3 + (e - 1) * 1.1;
          h += (bed - h) * (1 - smoothstep((e - 1.2) / 0.4));
        }
      }
      // The summit path: a ledge cut into the mountain, rising evenly from the shrine to the top.
      {
        const p = summitAt(x, z);
        if (p.d < 5.5) h += (p.h - h) * (1 - smoothstep((p.d - 2.2) / 3.3));
      }
      sculpt[row * n + column] = Math.max(-32000, Math.min(32000, Math.round((h - b) * 100)));
    }
}
const heights = generateHeights({ ...TERRAIN, sculpt: encodeSculpt(sculpt) }, sculpt);
const ground = (x: number, z: number) => sampleHeight(heights, TERRAIN.resolution, TERRAIN.size, x, z);
// The lowest ground under a footprint (half-sizes rx, rz, turned by yaw): a building stood on this height has its uphill side in the hill, not a gap under its downhill side.
const footGround = (x: number, z: number, rx: number, rz = rx, yaw = 0) => {
  let low = Infinity;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  for (const u of [-1, 0, 1])
    for (const v of [-1, 0, 1]) low = Math.min(low, ground(x + (u * rx * c + v * rz * s), z + (-u * rx * s + v * rz * c)));
  return low;
};
// A catalog model's footprint half-sizes at a scale, from its bounds (at most 7 m, so a big hall does not sink on one far corner).
const footOf = (id: number, scale: number): [number, number] => {
  const b = modelBounds(id);
  return [Math.min(7, ((b.max[0]! - b.min[0]!) / 2) * scale * 0.9), Math.min(7, ((b.max[2]! - b.min[2]!) / 2) * scale * 0.9)];
};

// ------------------------------------------------------------ light, sky --
scene.add("Environment", [0, -40, 0], {
  Environment: {
    sky: "Procedural", skyColor: rgb("#6f9fc9"), horizonColor: rgb("#f3e3c8"), groundColor: rgb("#52604a"),
    sunElevation: 34, sunAzimuth: 130, sunIntensity: 3.1, sunColor: rgb("#fff0d6"), ambientIntensity: 1.2,
    fog: "Exponential", fogColor: rgb("#d4dde0"), fogNear: 60, fogFar: 420, fogDensity: 0.0045,
    shadows: !process.env.MURIM_LITE, exposure: 1,
  },
  PostProcessing: {
    antialias: "SMAA", lightShafts: 0.5, contactShadows: 0.7, ambientOcclusion: false, shadowQuality: "High",
    bloom: 0.2, bloomThreshold: 0.85, contrast: 0.08, saturation: 0.04, temperature: 0.06, vignette: 0.25,
  },
});

// The trees keep off the city, the hubs and the roads (a rectangle every few metres along each road).
const clearing = (x: number, z: number, r: number) => [x - r, z - r, x + r, z + r];
const exclusions: number[][] = [
  clearing(0, 0, 62), ...pads.slice(1).map((p) => clearing(p.x, p.z, p.r + 4)),
  clearing(LAKE.x, LAKE.z, 64), clearing(POND.x, POND.z, 20), // water
  clearing(320, 340, 118), // the Sunken Valley of Bones is bare
];
for (const road of ROADS)
  for (let i = 0; i + 1 < road.length; i++) {
    const [ax, az] = road[i]!, [bx, bz] = road[i + 1]!;
    const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 10);
    for (let k = 0; k <= steps; k++) exclusions.push(clearing(ax + ((bx - ax) * k) / steps, az + ((bz - az) * k) / steps, 6));
  }
scene.add("World terrain", [0, 0, 0], {
  Terrain: {
    ...TERRAIN,
    sculpt: encodeSculpt(sculpt),
    grassColor: rgb("#5f7a3a"), rockColor: rgb("#8a7c68"), sandColor: rgb("#a99a74"), snowColor: rgb("#eef0ec"),
    sandHeight: -5, snowHeight: 62, rockSlope: 0.78,
    // Realistic plants and rocks only: EZ-Tree trees (255-261), photoscanned rocks (399-403), real-blade grass (404-406). Big things first,
    // so the small ones fill round them; groves gather the trees, and grass grows on the green, stone on the rock.
    // Roads and the city's streets are painted into the ground (terrainPaths.ts): packed earth along each road, stone for the streets and plaza.
    paths: [
      ...ROADS.map((road) => `dirt 5 ${road.map(([x, z]) => `${x} ${z}`).join(" ")}`),
      `gravel 3.5 ${SUMMIT_PATH.map(([x, z]) => `${x} ${z}`).join(" ")}`,
      "gravel 8 -50 0 50 0", "gravel 8 0 -50 0 50", "gravel 22 -0.5 -6 0.5 -6",
      // Yards at the hubs, the shore of the lake and pond, and the dust of the old battlefield.
      ...Object.values(HUBS).slice(1).map((h) => `gravel 34 ${h.x} ${h.z} ${h.x + 0.1} ${h.z}`),
      `sand ${(LAKE.rx + 6) * 2} ${LAKE.x} ${LAKE.z} ${LAKE.x + 0.1} ${LAKE.z}`, `sand 40 ${POND.x} ${POND.z} ${POND.x + 0.1} ${POND.z}`,
      "ash 230 320 340 320.1 340",
    ].join("\n"),
    scatter: process.env.MURIM_LITE ? "" : [
      "259 0.00045 0.9 1.4 0.85 trunk spacing=5 cluster=0.8 clusterSize=70 tilt=0 tint=0.15", "260 0.00035 0.9 1.3 0.85 trunk spacing=4 cluster=0.8 clusterSize=70",
      "255 0.00030 0.9 1.3 0.85 trunk spacing=7 cluster=0.7 clusterSize=60 tint=0.12", "256 0.00022 0.9 1.3 0.85 trunk spacing=7 cluster=0.7 clusterSize=60",
      "257 0.00018 0.9 1.3 0.85 trunk spacing=6 cluster=0.7 clusterSize=60",
      "403 0.00005 1.6 4.2 0.7 collide spacing=6 tilt=0.4 tint=0.2", "402 0.00005 1.4 3.6 0.7 collide spacing=6 tilt=0.4 tint=0.2",
      "399 0.00014 3 8 0.8 collide tilt=0.5 tint=0.2", "401 0.0003 3 9 0.85 tilt=0.7 tint=0.2", "400 0.0003 4 10 0.85 tilt=0.7 tint=0.2",
      "261 0.0007 0.8 1.4 0.85 spacing=2.5 cluster=0.6 clusterSize=35 tint=0.15",
      // Each region its own growth: bamboo groves in the forest, maples (the aspens' gold) in the gorge, pine and boulders on the ridge and the peak, ash and bushes in the marches.
      "407 0.012 0.8 1.25 0.8 trunk spacing=2.2 cluster=0.75 clusterSize=30 tint=0.15 in=330,-10,150",
      "257 0.004 0.9 1.4 0.8 trunk spacing=5 cluster=0.5 clusterSize=40 tint=0.12 in=-340,-340,125",
      "403 0.0006 1.5 4 0.6 collide spacing=6 tilt=0.4 tint=0.2 in=-340,-340,125",
      "259 0.004 0.9 1.4 0.8 trunk spacing=5 cluster=0.6 clusterSize=45 tint=0.12 in=340,-350,135", "260 0.003 0.8 1.2 0.8 trunk spacing=4 in=340,-350,135",
      "402 0.0007 1.5 4 0.6 collide spacing=6 tilt=0.4 tint=0.2 in=340,-350,135",
      "259 0.003 0.9 1.3 0.75 trunk spacing=5 cluster=0.5 in=0,-330,100", "403 0.0005 1.4 3.4 0.55 collide spacing=7 tilt=0.4 in=0,-340,90",
      "256 0.002 0.9 1.3 0.8 trunk spacing=6 cluster=0.6 in=-330,20,160", "261 0.004 0.9 1.5 0.85 spacing=2.5 cluster=0.6 in=-330,20,160",
      // Grass is grown round the camera (near=M): a few tufts to the square metre where you stand, none where you are not.
      "404 1.0 0.8 1.4 0.9 on=grass tint=0.25 near=30", "404 0.7 1.0 1.7 0.9 on=grass tint=0.3 near=26", "405 0.14 0.9 1.5 0.9 on=grass tint=0.2 near=36", "406 0.35 0.8 1.3 0.9 on=sand,rock tint=0.2 near=28",
      ...exclusions.map((r) => `exclude ${r.map((v) => v.toFixed(0)).join(" ")}`),
    ].join("\n"),
  },
});

// ---------------------------------------------------------------- helpers --
const blocker = (name: string, x: number, z: number, size: V3, lift = 0) =>
  scene.add(name, [x, ground(x, z) + lift + size[1] / 2, z], { Scale: { value: vec(...size) }, Renderable: { mesh: 0, material: 0, visible: false }, RigidBody: { dynamic: false }, Collider: { type: "AABB" } });
const place = (name: string, file: string, x: number, z: number, yaw = 0, solid = true, scale = 1, extra: Components = {}) =>
  scene.model(name, W(file), [x, footGround(x, z, ...footOf(W(file), scale), yaw), z], yaw, solid, scale, extra);
function wall(name: string, x0: number, z0: number, x1: number, z1: number, gap?: { from: number; to: number }) {
  const length = Math.hypot(x1 - x0, z1 - z0);
  const steps = Math.round(length / 4);
  const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) / steps;
    const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
    const at = alongX ? x : z;
    if (gap && at > gap.from && at < gap.to) continue;
    place(`${name} ${i + 1}`, "garden-wall", x, z, alongX ? 0 : Math.PI / 2, true, length / steps / 4.2);
  }
}
// The Great Hall and the shrine: a hall with its roof, stacked tiers above it, a spire on top. `lift` is how high the
// next piece's base sits (each tier's base is buried in the roof below).
function pagoda(name: string, x: number, z: number, tiers: number) {
  const base = footGround(x, z, 5);
  scene.model(`${name} hall`, W("pagoda-hall"), [x, base, z], 0, true);
  let y = base + 6.5; // where the hall's roof has narrowed to the width of the first tier
  const tiersOf = { "pagoda-tier-large": { h: 3.4, rise: 2.4 }, "pagoda-tier-small": { h: 3.0, rise: 2.0 } } as const;
  const files = ["pagoda-tier-large", "pagoda-tier-small"] as const;
  for (let t = 0; t < tiers; t++) {
    const file = files[Math.min(t, files.length - 1)]!;
    const { h, rise } = tiersOf[file];
    scene.model(`${name} tier ${t + 1}`, W(file), [x, y, z], 0, false);
    // The next tier stands halfway up this roof; the spire stands on its peak.
    y += t === tiers - 1 ? h + rise : h + 0.2 + rise * 0.5;
  }
  scene.model(`${name} spire`, W("pagoda-spire"), [x, y - 0.2, z], 0, false);
}

// Clothes colours as written in world.ts are the dye; on the base bodies' textures the dark ones read as black, so they are lifted toward white.
const bright = (gear: string, amount = 0.4) =>
  gear.replace(/#([0-9a-f]{6})/gi, (_m, hex: string) => {
    const lift = (i: number) => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - amount) + 255 * amount).toString(16).padStart(2, "0");
    return `#${lift(0)}${lift(2)}${lift(4)}`;
  });
const outfit = (gear: string, female = false) => `${gear} ${female ? "361:#1c1618" : "363:#1c1618"}`;

type FighterOpts = { mesh?: number; tint?: boolean; hex: string; health: number; scale?: number; melee: Components; props: Record<string, unknown>; yaw?: number };
const fighterParts = (opts: FighterOpts): Components => {
  const s = opts.scale ?? 1;
  return {
    Scale: { value: vec(0.6 * s, 1.8 * s, 0.6 * s) },
    Rotation: { euler: vec(0, opts.yaw ?? 0, 0) },
    Renderable: { mesh: opts.mesh ?? BODY_M, material: 0, visible: true },
    // Spirits and shades are one flat colour; people keep the base body's skin and face.
    ...(opts.tint ? { Material: { color: rgb(opts.hex), roughness: 0.75, keepTextures: false } } : {}),
    RigidBody: { mass: 70 * s, dynamic: true },
    Collider: {},
    Health: { current: opts.health, maximum: opts.health },
    Melee: { team: 1, ai: true, ...opts.melee },
    Script: { source: lua("enemy.lua"), props: opts.props },
  };
};
const fighter = (name: string, x: number, z: number, opts: FighterOpts) => scene.add(name, [x, ground(x, z) + 0.9 * (opts.scale ?? 1), z], fighterParts(opts));

// ------------------------------------------------------------- the city --
// Cloudgate: a walled square, four gates, a plaza with the waystone and notice board, an inn, a market, a school hall.
{
  const R = 50, gap = { from: -6.5, to: 6.5 };
  wall("City wall S", -R, R, R, R, gap);
  wall("City wall N", -R, -R, R, -R, gap);
  wall("City wall W", -R, -R, -R, R, { from: -6.5, to: 6.5 });
  wall("City wall E", R, -R, R, R, { from: -6.5, to: 6.5 });
  for (const g of GATES) {
    const along = g.x === 0;
    place(g.name, "paifang-gate", g.x, g.z + (g.z > 0 ? 2 : g.z < 0 ? -2 : 0), along ? 0 : Math.PI / 2, false);
    for (const s of [-5.2, 5.2]) blocker(`${g.name} pillar`, g.x + (along ? s : 0), g.z + (along ? 0 : s), [0.9, 6, 0.9]);
  }
  for (const [x, z] of [[-48, -48], [48, -48], [-48, 48], [48, 48]] as const) place("Corner tower", "watchtower", x, z, 0, true, 0.9);
  pagoda("School hall", 0, -30, 2);
  place("Inn", "farmhouse", -22, -22, 0.3, true, 1.4);
  place("Inn sign", "hall-banner", -17, -16, 0, false, 0.7);
  place("Market stall", "market-stall", 14, 12, Math.PI, true, 1.2);
  place("Market stall", "market-stall", 22, 8, Math.PI, true, 1.2);
  place("Smithy", "anvil-forge", 26, -14, 0, true, 1.3);
  place("Training ground rack", "weapon-rack", -14, 14, 0, true);
  for (const [i, dx] of [-26, -22, -18].entries())
    place(`Training Dummy ${i + 1}`, "wooden-training-dummy", dx, 24, 0.4, true, 1, {
      Health: { current: 9999, maximum: 9999 },
      Script: { source: "function on_damaged(amount) world.heal(self.id, amount) end", props: {} },
    });
  for (const [x, z] of [[-30, 6], [-30, -6], [30, 6], [30, -6], [-6, 30], [6, 30], [-12, -42], [12, -42]] as const) place("Stone lantern", "stone-lantern", x, z, 0, true, 1.1);
  place("Moon gate", "moon-gate", 36, -30, 0, false);
}


// ------------------------------------------------------- water, camps, ruins --
const fireLight = (name: string, x: number, y: number, z: number) =>
  scene.add(name, [x, y, z], { Light: component("Light", { color: rgb("#ff8a3a"), intensity: 5, range: 18 }), Particles: component("Particles", { preset: "Fire", color: rgb("#ffb347"), endColor: rgb("#ff4a1a"), rate: 18, lifetime: 0.8, speed: 0.9, size: 0.25, endSize: 0.05, gravityScale: -0.3, shape: "Sphere", shapeSize: 0.25, space: "World" }) });
// A camp: tents facing a fire, with crates and a banner. `layout` is [dx, dz] of each tent from the middle.
function camp(name: string, x: number, z: number, layout: [number, number][], banner = true) {
  fireLight(`${name} fire`, x, ground(x, z) + 0.6, z);
  place(`${name} fire ring`, "stone-lantern", x, z, 0, false, 0.6);
  layout.forEach(([dx, dz], i) => place(`${name} tent ${i + 1}`, "canvas-tent", x + dx, z + dz, Math.atan2(-dx, -dz), true));
  scene.model(`${name} crates`, 185, [x + 3.2, footGround(x + 3.2, z - 2.5, 0.5), z - 2.5], 0.5, true, 0.8);
  scene.model(`${name} barrel`, 180, [x - 2.6, footGround(x - 2.6, z + 2, 0.4), z + 2], 0, true, 0.7);
  if (banner) place(`${name} banner`, "hall-banner", x - 4, z - 4, 0.6, false, 0.9);
}
// The Black Wind lookout in the bamboo, the smugglers' reeds, the fortress yard.
camp("Black Wind camp", 374, -92, [[-7, -3], [6, -6], [8, 4]]);
place("Black Wind cart", "hand-cart", 366, -84, 1.9, true, 0.9);
camp("Smugglers' camp", -388, 94, [[-6, -2], [6, -3]]);
camp("Fortress yard", 340, -338, [[-12, 4], [12, 5]], false);
place("Fortress gate", "paifang-gate", 340, -320, 0, false, 1.2);
for (const s of [-4.4, 4.4]) blocker("Fortress gate pillar", 340 + s * 1.2, -320, [1, 6, 1]);
for (const dx of [-8, 8, -16, 16]) place("Fortress banner", "hall-banner", 340 + dx, -322, 0, false, 1);
for (const [dx, dz] of [[-6, -8], [6, -8], [-6, 0], [6, 0]] as const) place("Fortress lantern", "stone-lantern", 340 + dx, -338 + dz, 0, true, 1.3);
// Boulders and outcrops give the outer hubs a landscape of their own.
for (const [hub, rocks] of [
  ["gorgeHall", [[-14, 6, 402, 2.6], [16, -4, 403, 3.2], [-6, 16, 402, 2], [22, 10, 403, 2.4]]],
  ["fortress", [[-24, -12, 403, 3.4], [26, -10, 402, 3], [-18, 18, 402, 2.2], [20, 20, 403, 2.8]]],
  ["peakShrine", [[-20, -8, 403, 3], [20, -10, 402, 2.6], [-10, -18, 402, 2.2]]],
  ["bonesGate", [[-24, 10, 403, 3.6], [24, -12, 402, 3.2], [0, 24, 403, 2.8], [-14, -24, 402, 3.4], [16, 20, 403, 3]]],
] as const)
  for (const [dx, dz, model, scale] of rocks) {
    const x = HUBS[hub].x + dx, z = HUBS[hub].z + dz;
    scene.model(`${hub} boulder`, model, [x, footGround(x, z, scale * 0.7), z], (dx + dz) * 0.37, true, scale);
  }
// The Sunken Valley of Bones: pale spires, wrecked carts, broken racks and ragged banners on the dust.
for (let i = 0; i < 16; i++) {
  const a = i * 2.399, r = 22 + (i % 5) * 19;
  const x = 320 + Math.cos(a) * r, z = 340 + Math.sin(a) * r * 0.9;
  if (Math.hypot(x - 320, z - 335) < 12) continue;
  place(`Bone spire ${i + 1}`, "stalagmites", x, z, a, true, 1.1 + (i % 4) * 0.35);
}
for (const [i, [x, z]] of [[300, 372], [340, 372], [286, 340], [354, 330], [312, 306]].entries()) {
  place(`Wrecked cart ${i + 1}`, i % 2 ? "weapon-rack" : "hand-cart", x!, z!, i * 1.3, true, 0.9);
  place(`Ragged banner ${i + 1}`, "hall-banner", x! + 3, z! - 2, i * 0.9, false, 0.9);
}
place("Cracked arch", "cave-arch", 320, 292, 0, false, 1.1);
// Old Lotus' hut: a thatched hut, a tea table, bamboo, lanterns.
place("Lotus hut", "thatched-hut", 244, 50, 2.4, true, 1.1);
place("Lotus tea table", "tea-table", 252, 56, 0.6, true, 1);
place("Lotus lantern", "stone-lantern", 250, 62, 0, true, 1.1);
for (const [dx, dz] of [[-10, 8], [-14, 2], [-6, 14], [-12, -6]] as const) place("Lotus bamboo", "bamboo-stand", 248 + dx, 56 + dz, dx, false, 1.2);
// The pier and boats at Port Jade, and the summit's altar.
place("Port Jade pier", "lake-pier", -351, 26, 1.57, true, 1);
place("Summit lantern", "stone-lantern", -3, -392, 0, true, 1.4);
place("Summit lantern", "stone-lantern", 3, -392, 0, true, 1.4);
scene.add("Summit glow", [0, ground(0, -396) + 2.5, -396], { Light: component("Light", { color: rgb("#ffd98a"), intensity: 6, range: 20 }) });
// Water: the lake and the pond, flat sheets over their basins.
const waterSheet = (name: string, x: number, z: number, rx: number, rz: number, level: number) => {
  const id = scene.box(name, [x, level, z], [rx * 2, 0.1, rz * 2], "#3f86b8", {}, { roughness: 0.05, metalness: 0.1, opacity: 0.78, texture: "builtin:water", ...emissive("#2a5f88", 0.35) });
  delete (scene.entities[id]!.components as Components).Collider;
  delete (scene.entities[id]!.components as Components).RigidBody;
};
waterSheet("Lake water", LAKE.x, LAKE.z, LAKE.rx * 0.93, LAKE.rz * 0.93, lakeLevel);
waterSheet("Pond water", POND.x, POND.z, POND.rx * 0.82, POND.rz * 0.82, pondLevel - 0.12);

// ------------------------------------------------------- small finds along the way --
// Something every half-minute of walking, tied to a landmark you can see from the road (a broken cart, a shrine, a stele, a hollow by a rock):
// a little silver, herbs, a pill, arrows. Each opens once (Container: E to search).
for (const [i, [x, z, model, table, yaw]] of ([
  [130, 32, "hand-cart", "1 item Silver\n1 item Silver\n0.6 item Arrow", 1.2],
  [210, -30, "roadside-shrine", "1 item Jade Dew Pill\n0.5 item Spirit Herb", 2.6],
  [262, 20, "stele", "1 item Spirit Herb\n0.8 item Spirit Herb", 0.3],
  [-140, 46, "hand-cart", "1 item Silver\n0.7 item Qi Elixir", -0.6],
  [-230, -20, "roadside-shrine", "1 item Jade Dew Pill\n1 item Silver", 1.4],
  [-366, -110, "stele", "1 item Spirit Stone", 0.8],
  [-352, -220, "incense-burner", "1 item Qi Elixir\n0.5 item Breakthrough Pill", 0],
  [40, -150, "roadside-shrine", "1 item Silver\n1 item Spirit Herb", 3.0],
  [-30, -240, "stele", "1 item Spirit Stone\n0.4 item Breakthrough Pill", 0.2],
  [160, -330, "hand-cart", "1 item Silver\n1 item Silver\n1 item Arrow", 1.9],
  [270, -352, "roadside-shrine", "1 item Qi Elixir\n1 item Jade Dew Pill", 2.2],
  [70, 160, "hand-cart", "1 item Silver\n0.6 item Iron Ore", 0.9],
  [170, 262, "stele", "1 item Spirit Herb\n1 item Spirit Herb", 0.5],
  [260, 302, "incense-burner", "1 item Breakthrough Pill", 0],
  [-90, -100, "ore-rock", "1 item Iron Ore\n1 item Iron Ore\n0.3 item Spirit Stone", 0.4],
  [120, -120, "ore-rock", "1 item Iron Ore\n0.5 item Spirit Stone", 1.1],
] as [number, number, string, string, number][]).entries())
  place(`Wayside find ${i + 1}`, model, x, z, yaw, true, 1, { Container: { table, hold: 0.8 } });

// ----------------------------------------------------------- the city, filled --
// Houses along the streets, courtyard trees, a well and a furnace, so the city is a town and not a lawn with a hall in it.
for (const [x, z, yaw] of [[-36, -12, 1.57], [-36, 30, 1.57], [36, 12, -1.57], [36, 32, -1.57], [-14, 38, 3.14], [14, -42, 0], [-38, -34, 0.8], [34, -34, -0.8], [-26, 44, 3.14], [24, 42, 3.14]] as const)
  place("Townhouse", "farmhouse", x, z, yaw, true, 1.15);
for (const [x, z] of [[-18, 34], [18, 34], [-34, 4], [34, 4], [-8, -36], [10, -38]] as const) place("Courtyard hut", "thatched-hut", x, z, (x + z) * 0.2, true, 0.9);
for (const [x, z] of [[-24, 20], [24, -20], [-28, -4], [30, 18], [-12, -10], [14, -6]] as const) place("Courtyard oak", "eztree-oak", x, z, x, true, 0.9);
place("Well", "incense-burner", 12, 16, 0, true, 2.2);
place("Alchemy furnace", "incense-burner", -35, 14, 0, true, 1.9);
for (const [x, z] of [[-20, 0], [20, 0], [0, 20], [0, -20], [-20, -40], [20, -40], [-40, -20], [40, -20]] as const) place("Street lantern", "stone-lantern", x + (x === 0 ? 5 : 0), z + (z === 0 ? 5 : 0), 0, true, 1.1);

// ----------------------------------------------------------- the hubs --
{
  const h = HUBS;
  // Greenhollow: a hunters' hamlet.
  place("Hamlet house", "farmhouse", h.greenhollow.x - 9, h.greenhollow.z + 8, 0.4, true);
  place("Hamlet house", "farmhouse", h.greenhollow.x + 10, h.greenhollow.z + 6, -0.4, true);
  place("Hamlet hut", "thatched-hut", h.greenhollow.x + 2, h.greenhollow.z - 12, Math.PI, true);
  place("Hamlet lantern", "stone-lantern", h.greenhollow.x + 6, h.greenhollow.z - 2, 0, true);
  // Port Jade: houses, a pier and a stable.
  place("Port house", "farmhouse", h.portJade.x + 10, h.portJade.z + 14, -0.3, true);
  place("Port house", "farmhouse", h.portJade.x - 6, h.portJade.z + 18, 0.5, true);
  place("Port stable", "horse-stable", h.portJade.x + 14, h.portJade.z - 10, 1.2, true);
  place("Port stall", "market-stall", h.portJade.x - 2, h.portJade.z + 4, 0, true);
  // The Peak shrine.
  pagoda("Peak shrine", h.peakShrine.x, h.peakShrine.z - 18, 1);
  for (const s of [-1, 1]) place("Shrine lantern", "stone-lantern", h.peakShrine.x + s * 6, h.peakShrine.z - 4, 0, true, 1.2);
  // Gorge hall of the Blood Lotus Sect.
  place("Lotus hall", "pavilion", h.gorgeHall.x, h.gorgeHall.z - 6, 0, false, 1.3);
  for (const [dx, dz] of [[-3.5, -9.5], [3.5, -9.5], [-3.5, -2.5], [3.5, -2.5]] as const) blocker("Lotus pillar", h.gorgeHall.x + dx, h.gorgeHall.z + dz, [0.6, 4, 0.6]);
  place("Lotus banner", "hall-banner", h.gorgeHall.x - 8, h.gorgeHall.z, 0, false);
  place("Lotus banner", "hall-banner", h.gorgeHall.x + 8, h.gorgeHall.z, 0, false);
  // The Black Wind fortress.
  place("Fortress tower", "watchtower", h.fortress.x - 10, h.fortress.z - 8, 0, true, 1.2);
  place("Fortress tower", "watchtower", h.fortress.x + 12, h.fortress.z - 6, 0, true, 1.2);
  wall("Fortress wall", h.fortress.x - 16, h.fortress.z + 6, h.fortress.x + 16, h.fortress.z + 6);
  place("Fortress banner", "hall-banner", h.fortress.x, h.fortress.z + 4, 0, false);
  // The Bones gate.
  for (const [dx, dz, s] of [[-8, 0, 1.6], [8, 2, 1.4], [0, -8, 1.8]] as const) place("Bone stele", "stele", h.bonesGate.x + dx, h.bonesGate.z + dz, dx * 0.1, true, s);
  place("Bones gate", "paifang-gate", h.bonesGate.x, h.bonesGate.z + 14, 0, false, 1.2);
  // Lanterns every 40 m along the roads keep the way readable; the first bridge crosses the marsh stream.
  ROADS.forEach((road, ri) => {
    for (let i = 0; i + 1 < road.length; i++) {
      const [ax, az] = road[i]!, [bx, bz] = road[i + 1]!;
      const len = Math.hypot(bx - ax, bz - az);
      for (let k = 1; k * 40 < len; k++) {
        const t = (k * 40) / len;
        const x = ax + (bx - ax) * t + (bz - az) / len * 4, z = az + (bz - az) * t - (bx - ax) / len * 4;
        place(`Road lantern ${ri + 1}`, "stone-lantern", x, z, 0, true, 1);
      }
    }
  });
}

// --------------------------------------------------------- the people --
const npcFor = (n: (typeof NPCS)[number]) => {
  const [x, z] = n.at;
  scene.add(n.name, [x, ground(x, z) + 0.9, z], {
    Scale: { value: vec(0.6 * (n.scale ?? 1), 1.8 * (n.scale ?? 1), 0.6 * (n.scale ?? 1)) },
    Rotation: { euler: vec(0, n.yaw ?? 0, 0) },
    Renderable: { mesh: n.female ? BODY_F : BODY_M, material: 0, visible: true },
    ...idle(n.idle ?? "idle_rail_loop"),
    RigidBody: { mass: 70, dynamic: true },
    Collider: {},
    Script: { source: lua("elder.lua").replace("local spoken = false", "local spoken = true"), props: { gear: bright(n.gear) } },
  });
};
NPCS.forEach(npcFor);

// ------------------------------------------------------------- the foes --
const ROLL = "roll: clip=roll input=dodge dur=0.6 hit=0-0 cancel=0.45 dmg=0 lunge=3.2 free iframes=0.03-0.38 track=0 limb=pelvis";
const SPEAR_MOVES = [
  "thrust: clip=sword_light_a input=light dur=0.75 hit=0.22-0.3 cancel=0.4 dmg=9 reach=2.2 radius=0.5 lunge=1.3 stun=0.4 limb=hand_r",
  "sweep: clip=sword_heavy_a input=heavy dur=1.2 hit=0.35-0.45 cancel=0.7 dmg=14 reach=2.0 radius=1.1 knock=4 stun=0.6 armor limb=hand_r",
  ROLL,
].join("\n") + "\n";
const ADEPT_MOVES = ["qi_bolt: clip=energy_throw input=light dur=1.1 hit=0.45-0.5 cancel=0.8 dmg=8 projectile=13 shape=3 knock=3 stun=0.4 limb=hand_r", ROLL].join("\n") + "\n";
const SKIN = ["#e6d2bc", "#d9c4aa", "#e2cdb4", "#d4bfa6", "#dccab4"];
const DEFAULT_GEAR = "214:#6b4a3a 216:#3a3228 217:#2a2a2a";
FOES.forEach((f, i) => {
  const [x, z] = f.at;
  const hp = Math.round((45 + 35 * f.realm) * (f.hp ?? 1));
  if (f.kind === "wolf") {
    const s = f.scale ?? 1;
    scene.add(f.name, [x, ground(x, z) + 0.6 * s, z], {
      Scale: { value: vec(0.7 * s, 0.95 * s, 1.4 * s) },
      Renderable: { mesh: 133, material: 0, visible: true },
      RigidBody: { mass: 40 * s, dynamic: true },
      Collider: {},
      AIState: { state: "Walking" },
      Health: { current: hp, maximum: hp },
      Script: { source: lua("beast.lua"), props: { kind: "wolf", loot: f.loot ?? "none" } },
    });
    return;
  }
  const skill = Math.min(0.9, 0.18 + 0.1 * f.realm);
  const aggression = Math.min(0.85, 0.3 + 0.07 * f.realm);
  const melee: Components =
    f.kind === "brawler" ? { aggression, skill }
    : f.kind === "sword" || f.kind === "duelist" ? { aggression, skill: f.kind === "duelist" ? skill + 0.1 : skill, style: "Sword", rightHand: 205 }
    : f.kind === "spear" ? { aggression, skill, style: "Custom", moves: SPEAR_MOVES, rightHand: 208 }
    : { aggression, skill, style: "Custom", moves: ADEPT_MOVES, range: 9 };
  fighter(f.name, x, z, {
    hex: SKIN[i % SKIN.length]!, health: hp, scale: f.scale, yaw: f.yaw ?? 0, melee,
    props: {
      qi: 10 * f.realm + 10, drop: f.drop ?? 0, pill: f.pill ?? 0, silver: f.silver ?? 0, gear: bright(f.gear ?? DEFAULT_GEAR, 0.42), loot: f.loot ?? "none",
      realm: f.realm, peaceful: f.peaceful ? 1 : 0, duel: f.duel ? 1 : 0, reward: f.reward ?? "none", telegraph: f.kind === "spear" ? "sweep" : "none",
    },
  });
});

// ----------------------------------------------------------- the things --
for (const t of THINGS) {
  const [x, z] = t.at;
  scene.model(t.name, W(t.model), [x, footGround(x, z, ...footOf(W(t.model), t.scale ?? 1), t.yaw ?? 0), z], t.yaw ?? 0, true, t.scale ?? 1);
  if (t.glow) scene.add(`${t.name} glow`, [x, ground(x, z) + 1.6, z], { Light: component("Light", { color: rgb(t.glow), intensity: 3, range: 9 }) });
}

// Crates and barrels in the city and hubs.
[
  ["Crate", 185, 18, 20, "Silver:0.3 Qi Elixir:0.15"], ["Barrel", 180, 19.2, 21, "Arrow:0.6"], ["Crate", 185, -20, -28, "Silver:0.4"],
  ["Barrel", 180, 336, 4, "Silver:0.3 Spirit Herb:0.4"], ["Crate", 185, 384, -80, "Silver:0.5 Jade Dew Pill:0.3"], ["Barrel", 180, -384, 90, "Silver:0.5"],
].forEach(([name, mesh, x, z, loot], i) =>
  scene.model(`${name} ${i + 1}`, mesh as number, [x as number, footGround(x as number, z as number, 0.5), z as number], i * 0.9, true, 0.75, {
    Health: { current: 12, maximum: 12 },
    Script: { source: lua("breakable.lua"), props: { loot } },
  }),
);


// Stances: fists, sword, spear, glaive and bow each have their own moves on the same buttons (the bow's arrows are loosed by the script on the mouse: see player.lua). Every stance but fists
// starts locked; player.lua unlocks one and relocks the rest when you switch (Y), and holds the matching weapon.
const stanceMoves = (text: string, prefix: string) => {
  const names: string[] = [];
  const lines = text
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#") && !/input=dodge/.test(l))
    .map((l) => {
      const colon = l.indexOf(":");
      const name = l.slice(0, colon);
      names.push(prefix + name);
      const rest = l.slice(colon + 1).replace(/after=(\S+)/, (_m, list: string) => "after=" + list.split("|").map((n) => (n === "start" ? n : prefix + n)).join("|"));
      return `${prefix}${name}:${rest} locked`;
    });
  return { text: lines.join("\n"), names };
};
const moveNames = (text: string) => text.split("\n").filter((l) => l.trim() && !l.startsWith("#") && !/input=dodge/.test(l)).map((l) => l.slice(0, l.indexOf(":")));
// The blade's light chain uses the Universal Animation Library 2 sword swings (ual_ clips); the rest of the sword set is the engine's.
const wuxiaSword = swordMoves
  .replace("clip=sword_light_a input=light dur=0.6 hit=0.12-0.2 cancel=0.26", "clip=ual_sword_regular_a input=light dur=0.5 hit=0.14-0.24 cancel=0.3")
  .replace("clip=sword_light_b input=light after=slash_a dur=0.65 hit=0.11-0.19 cancel=0.28", "clip=ual_sword_regular_b input=light after=slash_a dur=0.6 hit=0.15-0.27 cancel=0.34")
  .replace("clip=sword_light_c input=light after=slash_b dur=1.0 hit=0.26-0.36 cancel=0.55", "clip=ual_sword_regular_c input=light after=slash_b dur=1.4 hit=0.4-0.6 cancel=0.9");
const BLADE = stanceMoves(wuxiaSword, "sw_");
const SPEAR = stanceMoves(
  [
    "thrust: clip=sword_light_a input=light dur=0.7 hit=0.2-0.28 cancel=0.38 dmg=10 reach=2.3 radius=0.5 lunge=1.2 stun=0.4 limb=hand_r",
    "thrust_b: clip=sword_light_b input=light after=thrust dur=0.7 hit=0.2-0.28 cancel=0.38 dmg=12 reach=2.4 radius=0.5 lunge=1.2 stun=0.4 limb=hand_r",
    "skewer: clip=sword_light_c input=light after=thrust_b dur=1.0 hit=0.3-0.4 cancel=0.55 dmg=18 reach=2.6 radius=0.6 lunge=2 knock=5 stun=0.6 stop=0.1 limb=hand_r",
    "sweep: clip=sword_heavy_a input=heavy dur=1.2 hit=0.35-0.45 cancel=0.7 dmg=16 reach=2.2 radius=1.4 knock=5 stun=0.7 armor limb=hand_r",
    "charge: clip=dash_strike input=light sprint dur=1.0 hit=0.15-0.45 cancel=0.75 dmg=18 reach=2.2 lunge=4.5 knock=7 stun=0.7 stop=0.1 limb=hand_r",
    "vault_kick: clip=front_kick_r input=kick dur=0.8 hit=0.33-0.44 cancel=0.5 dmg=8 reach=1.3 height=0.55 knock=5 stun=0.5 limb=foot_r",
    "dragon_rise: clip=rising_strike input=special seq=b dur=0.7 hit=0.1-0.3 cancel=0.55 dmg=22 reach=2.0 launch=10 stun=0.9 stop=0.12 cost=30 iframes=0-0.15 limb=hand_r",
  ].join("\n"),
  "sp_",
);
const GLAIVE = stanceMoves(
  [
    "arc: clip=sword_light_a input=light dur=0.8 hit=0.25-0.35 cancel=0.45 dmg=11 reach=1.9 radius=1.6 lunge=0.5 knock=3 stun=0.45 limb=hand_r",
    "arc_b: clip=sword_light_b input=light after=arc dur=0.8 hit=0.22-0.32 cancel=0.45 dmg=12 reach=1.9 radius=1.7 lunge=0.5 knock=3 stun=0.45 limb=hand_r",
    "whirl: clip=sword_light_c input=light after=arc_b dur=1.1 hit=0.25-0.5 cancel=0.6 dmg=8 hits=2 reach=1.9 radius=2.0 knock=6 stun=0.7 stop=0.1 limb=hand_r",
    "cleave: clip=sword_heavy_c input=heavy dur=1.1 hit=0.3-0.4 cancel=0.55 dmg=24 reach=1.9 radius=1.8 knock=8 stun=0.9 stop=0.14 armor knockdown limb=hand_r",
    "reap: clip=ground_pound input=special seq=bf dur=1.1 hit=0.3-0.42 cancel=0.9 dmg=30 aoe=3.6 knock=9 launch=4 stun=1 stop=0.16 cost=50 armor knockdown finisher limb=hand_r",
  ].join("\n"),
  "gl_",
);
const BOW = stanceMoves(
  [
    "bash: clip=hook input=light dur=0.6 hit=0.18-0.26 cancel=0.4 dmg=7 reach=1.2 radius=0.6 knock=3 stun=0.4 limb=hand_r",
    "shove: clip=shoulder_dash input=heavy dur=0.8 hit=0.2-0.36 cancel=0.5 dmg=9 reach=1.3 radius=0.7 lunge=1.5 knock=6 stun=0.6 limb=hand_r",
    "back_kick: clip=front_kick_r input=kick dur=0.8 hit=0.33-0.44 cancel=0.5 dmg=6 reach=1.3 height=0.55 knock=6 stun=0.5 limb=foot_r",
  ].join("\n"),
  "bw_",
);
// player.lua reads this table (the --@STANCES@ marker): the move names of each stance.
const luaList = (names: string[]) => "{ " + names.map((n) => JSON.stringify(n)).join(", ") + " }";
const STANCE_TABLE = `{ fists = ${luaList(moveNames(martialArtsMoves).filter((n) => n !== "roll" && n !== "slide"))}, blade = ${luaList(BLADE.names)}, spear = ${luaList(SPEAR.names)}, glaive = ${luaList(GLAIVE.names)}, bow = ${luaList(BOW.names)} }`;
const MOVES = [
  martialArtsMoves.trimEnd(),
  "# Other stances (locked until the script switches to them)",
  BLADE.text,
  SPEAR.text,
  GLAIVE.text,
  BOW.text,
  "# Qi arts: each realm opens another (locked until the script unlocks it)",
  "qi_palm: clip=energy_throw input=skill1 dur=0.8 hit=0.26-0.3 cancel=0.55 dmg=24 projectile=22 shape=0 knock=5 stun=0.6 mana=18 cooldown=0.8 locked limb=hand_r",
  "wind_palm: clip=ground_pound input=skill2 dur=1.0 hit=0.3-0.42 cancel=0.8 dmg=28 aoe=4 knock=10 launch=3 stun=0.8 stop=0.1 mana=35 cooldown=3 locked limb=hand_r",
  "tiger_rush: clip=dash_strike input=skill3 dur=1.0 hit=0.15-0.45 cancel=0.75 dmg=32 reach=1.4 lunge=6 knock=7 stun=0.7 stop=0.1 mana=30 cooldown=4 armor locked limb=hand_r",
  "# Scroll arts: learned from Instructor Hua, used with keys 5 to 7 (the script performs them by name).",
  "sword_qi: clip=energy_throw input=special seq=ffbb dur=0.8 hit=0.26-0.3 cancel=0.55 dmg=30 projectile=20 shape=1 knock=4 stun=0.6 mana=22 cooldown=1.2 locked limb=hand_r",
  "thunder_lance: clip=energy_throw input=special seq=lrlr dur=0.9 hit=0.3-0.34 cancel=0.6 dmg=42 projectile=36 shape=4 knock=3 stun=1.0 stagger=45 mana=30 cooldown=2.5 locked limb=hand_r",
  "flame_palm: clip=energy_throw input=special seq=bbff dur=0.9 hit=0.3-0.34 cancel=0.6 dmg=26 projectile=14 shape=3 knock=5 stun=0.6 mana=24 cooldown=1.6 locked limb=hand_r",
  "nine_dragons: clip=ground_pound input=ultimate dur=1.2 hit=0.3-0.45 cancel=0.95 dmg=70 aoe=5.5 knock=12 launch=6 stun=1.2 stop=0.18 cost=70 armor knockdown unblockable finisher locked limb=hand_r",
  "# The arts of the higher realms replace the lower ones on the same keys",
  "sky_palm: clip=energy_throw input=skill1 dur=0.8 hit=0.26-0.3 cancel=0.55 dmg=44 projectile=28 shape=0 knock=7 stun=0.7 mana=22 cooldown=0.7 locked limb=hand_r",
  "heaven_seal: clip=ground_pound input=skill2 dur=1.0 hit=0.3-0.42 cancel=0.8 dmg=52 aoe=6 knock=12 launch=4 stun=1 stop=0.12 mana=45 cooldown=2.5 locked limb=hand_r",
  "void_strike: clip=dash_strike input=skill3 dur=0.9 hit=0.15-0.45 cancel=0.7 dmg=64 reach=1.6 lunge=9 knock=9 stun=0.8 stop=0.12 mana=35 cooldown=3 armor locked limb=hand_r",
  "world_ender: clip=ground_pound input=ultimate dur=1.3 hit=0.3-0.5 cancel=1 dmg=160 aoe=9 knock=16 launch=8 stun=1.5 stop=0.2 cost=70 armor knockdown unblockable finisher locked limb=hand_r",
].join("\n") + "\n";

const PLAYER_BODY = Number(process.env.MURIM_BODY ?? BODY_M);
const [startX, startZ] = (process.env.MURIM_START ?? "").split(",").map(Number);
const spawn: V3 = process.env.MURIM_START ? [startX!, ground(startX!, startZ!) + 1, startZ!] : [0, ground(0, 76) + 1, 76];
scene.add("Player", spawn, {
  Scale: { value: vec(0.6, 1.8, 0.6) },
  Rotation: { euler: vec(0, Number(process.env.MURIM_YAW ?? Math.PI), 0) },
  Renderable: { mesh: PLAYER_BODY, material: 0, visible: true },
  Player: {},
  RigidBody: { mass: 70, dynamic: true },
  Collider: {},
  CharacterController: { mode: "ThirdPerson", walkSpeed: 3.6, sprintSpeed: 7.4, jumpHeight: 1.1, acceleration: 30, airControl: 6, stepHeight: 0.5 },
  Health: { current: Number(process.env.MURIM_HP ?? 100), maximum: 100 },
  Melee: { team: 0, ai: false, energy: 40, style: "Custom", moves: MOVES, manaMax: 60, manaRegen: 6 },
  Weapons: component("Weapons", { loadout: "fists: melee=fists\nblade: melee=sword\nspear: melee=spear\nglaive: melee=scythe\nbow: melee=fists\n", aimAssist: 0, assistRange: 1 }),
  Inventory: {
    slots: 24,
    maxWeight: 30,
    weights: "Qi Elixir=0.2, Breakthrough Pill=0.2, Jade Dew Pill=0.2, Spirit Herb=0.05, Silver=0.01",
    stats: "Jade Charm: health=25\nSilver Pier Sash: slot=body speed=6 health=30\nJade Bamboo Sword: slot=hands damage=25\nGuardian's Wraps: slot=hands damage=22\nFrostfang Blade: slot=hands damage=30\nBlood Lotus Seal: slot=head health=40\nWarlord's Seal: slot=head damage=20 health=60",
  },
  Script: {
    source: [lua("lang.lua"), bestiaryLua, lua("player.lua").replace("--@STANCES@", STANCE_TABLE)].join("\n"),
    props: { stance: process.env.MURIM_STANCE ?? "none", ranger: PLAYER_BODY === BODY_M ? "383 384 385 386 388" : "393 394 395 396 398", ...(process.env.MURIM_REALM ? { realm: Number(process.env.MURIM_REALM), qi: Number(process.env.MURIM_QI ?? 0), silver: Number(process.env.MURIM_SILVER ?? 0) } : {}) },
  },
});
scene.add("Camera", [spawn[0], spawn[1] + 3, spawn[2] + 6], {
  Camera: { fov: 60, far: 900 },
  CameraFollow: { target: "", offset: process.env.MURIM_CAM ? vec(...(process.env.MURIM_CAM.split(",").map(Number) as [number, number, number])) : vec(0, 2.2, -4.8), smoothing: 0.12, lookHeight: Number(process.env.MURIM_LOOK ?? 1.3), collision: true, orbit: true },
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
      "light: j, pad_x",
      "heavy: k, pad_y",
      "kick: f, pad_b",
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
      "stance: y",
      "grapple: l",
      "heal: z",
      "art1: 5",
      "art4: 0",
      "talisman1: 8",
      "talisman2: 9",
      "art2: 6",
      "art3: 7",
      "track: enter",
      "controls: escape",
      "shoot: mouse_left, pad_rt",
      "aim: mouse_right, pad_lt",
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
widget("Crosshair", "Crosshair", style); // a drawn bow's sight (it shows nothing otherwise)
widget("Damage direction", "Damage direction", { ...style, anchor: "center", width: 420, height: 420, text: "" });
widget("Damage numbers", "Damage numbers", style);
widget("Boss bar", "Boss bar", style);
widget("Notification", "Notification", style);
widget("Interact prompt", "Interact prompt", style);
widget("Dialogue", "Dialogue", { ...style, anchor: "bottom-center", offsetY: -MARGIN_Y - 176, width: 660, height: 120, text: "" });
widget("Inventory", "Inventory", { ...style, anchor: "center", visibleWhen: "toggle", toggleKey: "KeyI" });
widget("Character sheet", "Character sheet", { ...style, anchor: "center", width: 440, height: 440, visibleWhen: "toggle", toggleKey: "KeyC", text: "Cultivator\nMortal realm" });
widget("Skill tree", "Skill tree", { ...style, anchor: "center", width: 520, height: 400, visibleWhen: "toggle", toggleKey: "KeyO", text: "Cultivation tree" });
widget("Quest log", "Quest log", { ...style, anchor: "center", width: 540, height: 470, visibleWhen: "toggle", toggleKey: "Tab", text: "Journal" });
widget("Meridians", "Skill tree", { ...style, anchor: "center", width: 560, height: 460, visibleWhen: "toggle", toggleKey: "KeyP", text: "Meridians" });
widget("Shop window", "Shop window", { ...style, anchor: "center", width: 560, height: 480, visibleWhen: "toggle", text: "" });
widget("Quick slots", "Quick slots", { ...style, anchor: "bottom-right", offsetX: -MARGIN_X, offsetY: -MARGIN_Y - 116, width: 330, height: 76, text: "" });
widget("Tip", "Notification", { ...style, anchor: "bottom-center", offsetY: -MARGIN_Y - 100 });
widget("Death screen", "Death screen", { ...style, anchor: "center", width: 640, height: 320, text: "" });
widget("Key hints", "Key hints", { ...style, anchor: "bottom-right", offsetX: -MARGIN_X, offsetY: -MARGIN_Y, width: 600, height: 76, text: "I|Bag|Menu\nC|Stats\nTab|Journal\nO|Arts\nP|Body\nM|Map\nY|Stance|Y" });

// ------------------------------------------------------------ qi effects --
const fxEmitter = (name: string, mode: string, particles: Record<string, unknown>, extra: Components = {}) =>
  scene.add(name, [0, -200, 8], {
    Particles: component("Particles", particles),
    Script: { source: lua("qifx.lua"), props: { mode } },
    ...extra,
  });
const TEAL_GLOW = rgb("#7fe0d4");
fxEmitter("Qi Aura", "aura", { preset: "Sparkle", color: TEAL_GLOW, endColor: rgb("#1c6e8a"), rate: 0, lifetime: 1.1, speed: 0.9, size: 0.1, endSize: 0.2, gravityScale: -0.15, shape: "Sphere", shapeSize: 0.7, space: "World" });
fxEmitter("Qi Bolt", "bolt", { preset: "Sparkle", color: rgb("#e8fffb"), endColor: rgb("#2aa8c4"), rate: 90, lifetime: 0.35, speed: 0.4, size: 0.2, endSize: 0.1, gravityScale: 0, shape: "Sphere", shapeSize: 0.12, space: "World" });
fxEmitter("Qi Burst", "burst", { preset: "Sparkle", color: rgb("#ffffff"), endColor: rgb("#3fc5d8"), rate: 0, lifetime: 0.6, speed: 6, size: 0.16, endSize: 0.05, gravityScale: 0.2, shape: "Sphere", shapeSize: 0.3, space: "World" });
fxEmitter("Qi Mark", "mark", { preset: "Sparkle", color: rgb("#ff5a4a"), endColor: rgb("#ffb347"), rate: 70, lifetime: 0.7, speed: 0.15, size: 0.2, endSize: 0.05, gravityScale: 0, shape: "Sphere", shapeSize: 3, space: "World" });
fxEmitter("Qi Array", "array", { preset: "Sparkle", color: rgb("#9ff5e8"), endColor: rgb("#2a9ac4"), rate: 45, lifetime: 1.4, speed: 0.3, size: 0.16, endSize: 0.05, gravityScale: -0.1, shape: "Sphere", shapeSize: 4, space: "World" });
fxEmitter("Qi Burn", "burn", { preset: "Fire", color: rgb("#9ff0ff"), endColor: rgb("#ff7a2a"), rate: 40, lifetime: 0.7, speed: 1.4, size: 0.22, endSize: 0.5, gravityScale: -0.3, shape: "Sphere", shapeSize: 0.5, space: "World" });


// ------------------------------------------------------------ the systems --
// Scripts that are not a person or a thing: the world's day and waystones, the regions, the quests and the shops. Each is an invisible
// entity; they talk to each other and to the Player with world.send.
const NPC_DATA = Object.fromEntries(NPCS.map((n) => [n.name, { chatter: n.chatter, shop: n.shop ?? null }]));
const THING_DATA = Object.fromEntries(THINGS.map((t) => [t.name, { prompt: t.prompt, action: t.action ?? null, note: t.note ?? "", give: t.give ?? [] }]));
const WAYSTONES = THINGS.filter((t) => t.action === "waystone").map((t) => ({ entity: t.name, label: t.name.replace(" waystone", "") }));
const fill = (file: string) =>
  lua(file)
    .replace("--@QUESTS@", toLua(QUESTS)).replace("--@NPCS@", toLua(NPC_DATA)).replace("--@THINGS@", toLua(THING_DATA))
    .replace("--@REGIONS@", toLua(REGIONS)).replace("--@MAP@", toLua({ roads: ROADS, hubs: [{ x: 0, z: 0, name: "Cloudgate" }, { ...HUBS.greenhollow, name: "Greenhollow" }, { ...HUBS.portJade, name: "Port Jade" }, { ...HUBS.peakShrine, name: "Peak shrine" }, { ...HUBS.gorgeHall, name: "Blood Lotus hall" }, { ...HUBS.fortress, name: "Black Wind fortress" }, { ...HUBS.bonesGate, name: "Bones gate" }, { x: 0, z: -398, name: "Nine-Dragon Summit" }] })).replace("--@WAYSTONES@", toLua(WAYSTONES));
const SYSTEMS = [
  { name: "Economy", files: ["items.lua", "shop.lua"] },
  { name: "World", files: ["items.lua", "talk.lua", "world.lua"] },
  { name: "Regions", files: ["bestiary.lua", "regions.lua"] },
  { name: "Quests", files: ["items.lua", "talk.lua", "quests.lua"] },
];
SYSTEMS.forEach(({ name, files }, i) =>
  scene.add(name, [i * 2, -40, 4], { Script: { source: ["lang.lua", ...files].map((f) => (f === "bestiary.lua" ? bestiaryLua : fill(f))).join("\n"), props: name === "World" ? { intro: process.env.MURIM_NOINTRO ? 0 : 1 } : {} } }),
);

// Starting objective: the journal fills as quests are taken (the Quests script writes the Quest log and Objective widgets).
scene.add("Objectives", [0, -40, 0], { Objectives: { list: "" } });

// ------------------------------------------------------------ ambient life --
{
  const drift = (name: string, at: V3, particles: Record<string, unknown>) =>
    scene.add(name, at, { Particles: component("Particles", { space: "World", shape: "Box", ...particles }) });
  drift("Blossom petals", [0, ground(0, 0) + 5, 0], { preset: "Confetti", color: rgb("#f6c9d6"), endColor: rgb("#e8a5bb"), rate: 5, lifetime: 9, speed: 0.35, size: 0.1, endSize: 0.07, gravityScale: 0.05, shapeSize: 30 });
  drift("Lake fireflies", [LAKE.x, lakeLevel + 1.4, LAKE.z - LAKE.rz - 3], { preset: "Sparkle", color: rgb("#d8ff7a"), endColor: rgb("#7fd84a"), rate: 4, lifetime: 6, speed: 0.2, size: 0.09, endSize: 0.02, gravityScale: -0.01, shapeSize: 9 });
}

const out = process.env.MURIM_OUT ?? join(ROOT, "games/my-games/jianghu-road/scene.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ format: 1, name: "Jianghu Road", hud: "widgets", entities: scene.entities, prefabs: scene.prefabs }, null, 1) + "\n");
writeFileSync(
  join(dirname(out), "game.json"),
  JSON.stringify(
    {
      name: "Jianghu Road",
      genre: "Open-world action RPG",
      description: "A one-kilometre murim world on your own: a walled city, roads into regions of rising danger, strong strangers to duel, hidden legendary items and hand-made quests that cannot be lost.",
      scene: "scene.json",
      accent: "#c9a24a",
    },
    null,
    2,
  ) + "\n",
);
console.log(`wrote ${out}: ${scene.entities.length} entities`);
