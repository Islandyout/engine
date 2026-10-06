// Generates GATEBREAKER M0 (examples/gatebreaker/m0.json): the look-and-feel
// test from docs/gatebreaker/GAME_DESIGN.md. Han Seo-jin against a goblin in
// a torch-lit E-rank gate room built from the KayKit Dungeon kit, rendered in
// the Manhwa style. Run from apps/editor:
//
//   npm run gatebreaker
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultComponent } from "../../apps/editor/src/authoring/CommandInterpreter";
import { validateSceneDocument } from "../../apps/editor/src/scene/SceneSerializer";
import type { SceneDocument } from "../../apps/editor/src/scene/SceneSerializer";
import { modelCatalog } from "../../apps/editor/src/scene/modelCatalog";

type Components = Record<string, unknown>;
type V3 = [number, number, number];
const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "../..");
const vec = (x: number, y: number, z: number) => ({ x, y, z });
const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return vec(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};
const component = (type: string, overrides: Record<string, unknown> = {}) => ({
  ...(defaultComponent(type as never) as object),
  ...overrides,
});

const entities: SceneDocument["entities"] = [];
// Every component starts from its defaults, with the fields given on top.
const add = (name: string, position: V3, components: Components) => {
  const full = Object.fromEntries(Object.entries(components).map(([type, value]) => [type, component(type, value as Record<string, unknown>)]));
  entities.push({ name, components: { Transform: { position: vec(...position) }, ...full } as never });
  return entities.length - 1;
};

// A dungeon piece's bounds, from its glTF (the editor centres a model on its
// entity, so a piece is placed by the centre of its bounds).
const catalog = new Map(modelCatalog.map((m) => [m.path.replace("./kit/dungeon/", "").replace(".glb", ""), m]));
function bounds(piece: string) {
  const bytes = readFileSync(join(ROOT, "assets/source/kit/dungeon", `${piece}.glb`));
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString("utf8"));
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const mesh of json.meshes)
    for (const p of mesh.primitives) {
      const a = json.accessors[p.attributes.POSITION];
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], a.min[k]);
        max[k] = Math.max(max[k], a.max[k]);
      }
    }
  return { min, max };
}
// Places a piece with its origin at `origin`, turned `yaw` radians about y.
// Solid pieces get a kinematic collision box their size.
function piece(name: string, kind: string, origin: V3, yaw = 0, solid = true) {
  const entry = catalog.get(kind);
  if (!entry) throw new Error(`no catalog entry for ${kind}`);
  const { min, max } = bounds(kind);
  const centre = [0, 1, 2].map((k) => (min[k]! + max[k]!) / 2);
  const size = [0, 1, 2].map((k) => max[k]! - min[k]!);
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const offset: V3 = [centre[0]! * c + centre[2]! * s, centre[1]!, -centre[0]! * s + centre[2]! * c];
  return add(name, [origin[0] + offset[0], origin[1] + offset[1], origin[2] + offset[2]], {
    Rotation: { euler: vec(0, yaw, 0) },
    Scale: { value: vec(size[0]!, size[1]!, size[2]!) },
    Renderable: { mesh: entry.id, material: 0, visible: true },
    RigidBody: { dynamic: false },
    Collider: component("Collider", { type: "AABB", isTrigger: !solid }),
  });
}

// -- Look ---------------------------------------------------------------
// Underground: no sky or sun to speak of, a cool ambient for the unlit tone
// and warm torches for the lit one.
add("Environment", [0, 0, 0], {
  Environment: component("Environment", {
    sky: "Color",
    skyColor: rgb("#07060b"),
    sunElevation: 70,
    sunAzimuth: 200,
    sunIntensity: 1.3,
    sunColor: rgb("#c4ccff"),
    ambientIntensity: 0.95,
    fog: "Exponential",
    fogColor: rgb("#0b0a12"),
    fogDensity: 0.035,
    shadows: true,
    exposure: 1.05,
  }),
});
add("Look", [0, 0, 0], {
  PostProcessing: component("PostProcessing", {
    style: "Manhwa",
    ink: 1,
    rim: 0.7,
    antialias: "SMAA",
    ambientOcclusion: false,
    bloom: 0.55,
    bloomRadius: 0.4,
    bloomThreshold: 0.8,
    contrast: 0.12,
    saturation: 0.08,
    vignette: 0.45,
    shadowQuality: "Medium",
  }),
});

// -- The room: 16 x 16 m, four tiles a side --------------------------------
const HALF = 8;
for (const x of [-6, -2, 2, 6])
  for (const z of [-6, -2, 2, 6]) {
    piece(`Floor ${x},${z}`, "floor-tile-large", [x, 0, z], 0, false);
  }
// One collision slab under the whole floor.
add("Ground", [0, -0.5, 0], {
  Scale: { value: vec(HALF * 2, 1, HALF * 2) },
  Renderable: { mesh: 0, material: 0, visible: false },
  RigidBody: { dynamic: false },
  Collider: component("Collider"),
});
// Walls: north (-z, where the goblin comes from) has the gate; south the doorway behind the hero.
const sides: Array<{ name: string; at: (t: number) => V3; yaw: number; kinds: string[] }> = [
  { name: "North", at: (t) => [t, 0, -HALF], yaw: 0, kinds: ["wall", "wall-cracked", "wall-gated", "wall"] },
  { name: "South", at: (t) => [t, 0, HALF], yaw: Math.PI, kinds: ["wall", "wall-doorway", "wall-cracked", "wall"] },
  { name: "West", at: (t) => [-HALF, 0, t], yaw: Math.PI / 2, kinds: ["wall-cracked", "wall-arched", "wall", "wall-arched"] },
  { name: "East", at: (t) => [HALF, 0, t], yaw: -Math.PI / 2, kinds: ["wall", "wall-arched", "wall-cracked", "wall"] },
];
for (const side of sides)
  side.kinds.forEach((kind, i) => {
    const t = -6 + i * 4;
    piece(`${side.name} wall ${i + 1}`, kind, side.at(t), side.yaw);
  });
for (const [x, z] of [
  [-HALF, -HALF],
  [HALF, -HALF],
  [-HALF, HALF],
  [HALF, HALF],
] as const)
  piece(`Corner pillar ${x},${z}`, "pillar", [x, 0, z]);

// Torches on the walls, each with its light. Two cast shadows (the ones that
// frame the fight); the rest only light.
const torches: Array<{ at: V3; yaw: number; shadows: boolean }> = [
  { at: [-4, 2.2, -HALF + 0.5], yaw: 0, shadows: true },
  { at: [4, 2.2, -HALF + 0.5], yaw: 0, shadows: false },
  { at: [-HALF + 0.5, 2.2, 2], yaw: Math.PI / 2, shadows: false },
  { at: [HALF - 0.5, 2.2, -2], yaw: -Math.PI / 2, shadows: true },
  { at: [4, 2.2, HALF - 0.5], yaw: Math.PI, shadows: false },
];
torches.forEach(({ at, yaw, shadows }, i) => {
  piece(`Torch ${i + 1}`, "torch-mounted", at, yaw, false);
  const out: V3 = [at[0] + Math.sin(yaw) * 0.45, at[1] + 0.75, at[2] + Math.cos(yaw) * 0.45];
  add(`Torch light ${i + 1}`, out, {
    Renderable: { visible: false },
    Light: component("Light", { type: "Point", color: rgb("#ff9a4a"), intensity: 9, range: 11, castShadows: shadows }),
    Particles: component("Particles", {
      preset: "Fire",
      rate: 24,
      lifetime: 0.5,
      speed: 0.6,
      size: 0.14,
      color: rgb("#ffc04a"),
      endColor: rgb("#ff3a0c"),
      endSize: 0.3,
      shape: "Sphere",
      shapeSize: 0.06,
    }),
  });
});

// Dressing, kept to the edges so the middle is open ground for the fight.
piece("Banner", "banner-patternA-red", [0, 0, -HALF + 0.05], 0, false);
piece("Barrel", "barrel-large", [-6.2, 0, -6.1]);
piece("Crates", "crates-stacked", [6.0, 0, -6.0], 0.4);
piece("Chest", "chest", [-6.2, 0, -2.2], Math.PI / 2);
piece("Broken sword and shield", "sword-shield-broken", [2.6, 0, -4.4], 1.1, false);
piece("Candles", "candle-triple", [6.6, 0, 2.4], 0, false);
piece("Column left", "column", [-4.6, 0, -1.2], 0, true);
piece("Column right", "column", [4.6, 0, -1.2], 0, true);

// -- Fighters -------------------------------------------------------------
add("Han Seo-jin", [0, 0.9, 4], {
  Scale: { value: vec(0.6, 1.8, 0.6) },
  Rotation: { euler: vec(0, Math.PI, 0) },
  Renderable: { mesh: 176, material: 0, visible: true },
  Player: {},
  RigidBody: { mass: 70, dynamic: true },
  Collider: component("Collider"),
  CharacterController: component("CharacterController", { mode: "ThirdPerson" }),
  Health: { current: 200, maximum: 200 },
  Melee: component("Melee", { team: 0, ai: false, energy: 40 }),
});
add("Camera", [0, 2, 8], {
  Camera: component("Camera", { fov: 50, far: 200 }),
  CameraFollow: component("CameraFollow", { offset: vec(0, 2.5, -4.4), orbit: true, lookHeight: 0.9 }),
});
add("Goblin", [0, 0.725, -3], {
  Scale: { value: vec(0.5, 1.45, 0.5) },
  Rotation: { euler: vec(0, 0, 0) },
  Renderable: { mesh: 177, material: 0, visible: true },
  RigidBody: { mass: 45, dynamic: true },
  Collider: component("Collider"),
  Health: { current: 90, maximum: 90 },
  Melee: component("Melee", { team: 1, ai: true, aggression: 0.65, skill: 0.4, reaction: 0.3 }),
});
add("Controls", [0, 0, 0], {
  UI: component("UI", {
    text: "Click attack · Right-click heavy · F kick · Q special · X dodge · R block · T lock on · Shift run",
    anchor: "bottom-center",
    offsetY: -16,
    fontSize: 14,
    color: vec(1, 1, 1),
    opacity: 0.75,
  }),
});

const scene: SceneDocument = { format: 1, name: "GATEBREAKER — M0", entities } as SceneDocument;
validateSceneDocument(scene);
const out = process.env.GB_OUT || join(ROOT, "examples/gatebreaker/m0.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(scene, null, 2)}\n`);
console.log(`wrote ${out} (${entities.length} entities)`);
