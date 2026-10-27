// Generates EDEN -- PHASE 1B (games/my-games/eden): the real biome, replacing
// Phase 1a's bare plain now that it has proven the live brain<->engine
// bridge (see the Eden plan, /root/.claude/plans/dapper-dancing-whisper.md).
// A gently rolling garden: a river winding through it, a fruit grove, an open
// meadow, a quiet overlook, a sheltered hollow, and the two landmark trees --
// scenery only, per the "loose Genesis framing" decision (no Fall/mortality
// mechanics). Also defines the small set of named prefabs the Creator can
// bring into being (see edenAgents.ts's "let there be..." handling) -- Eden's
// own trees/animals, so what the Creator can conjure is exactly what the
// garden is already made of, not an arbitrary catalog dump.
//
// Terrain-carving technique (sculpt math, scatter/paths string syntax, the
// water-sheet box pattern) follows tools/jianghu/build_jianghu.ts, the
// established precedent in this codebase. Run from apps/editor:
//
//   npm run eden
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { encodeSculpt, fbm, generateHeights, sampleHeight } from "../../apps/editor/src/editor/terrain";
import { DRINK_SPOT, EDEN_LANDMARKS, EDEN_PLACES } from "../../apps/editor/src/eden/places";
import * as kitModule from "../lib/scene_kit";
import type { Components, V3 } from "../lib/scene_kit";
// scene_kit is CommonJS to tsx beside this ES module, so its exports may sit on `default`.
const kit: typeof kitModule = (kitModule as unknown as { default?: typeof kitModule }).default ?? kitModule;
const { ROOT, SceneBuilder, component, modelId, rgb, vec } = kit;

const here = dirname(fileURLToPath(import.meta.url));
const lua = (file: string) => readFileSync(join(here, "lua", file), "utf8");

const smoothstep = (t: number) => {
  const c = Math.min(Math.max(t, 0), 1);
  return c * c * (3 - 2 * c);
};

const TERRAIN = { size: 400, resolution: 201, height: 3, seed: 7, frequency: 1.1, octaves: 3 };
const base = generateHeights({ ...TERRAIN, sculpt: "" });

// The river: a gentle bend across the garden, three waypoints -> two
// segments. Distance-to-nearest-segment, the same technique
// build_jianghu.ts's own summitAt() uses for its summit road.
const RIVER: V3[] = [
  [-198, -72, 0],
  [-110, -34, 0],
  [-36, -10, 0],
  [-4, 4, 0],
  [34, 16, 0],
  [90, 40, 0],
  [132, 78, 0],
];
const RIVER_WIDTH = 5;
const RIVER_DEPTH = 0.8; // shallow enough to wade
const RIVER_LEVEL = -0.4;
// The lake where the river ends, and the highlands it comes down from (places.ts has their names and the bank people stand on).
const LAKE = EDEN_PLACES.lake!;
const HIGH = EDEN_PLACES.highlands!;
const LAKE_DEPTH = 3.2;
function riverDistance(x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i + 1 < RIVER.length; i++) {
    const [ax, az] = RIVER[i]!, [bx, bz] = RIVER[i + 1]!;
    const len2 = (bx - ax) ** 2 + (bz - az) ** 2;
    const t = Math.min(1, Math.max(0, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / len2));
    best = Math.min(best, Math.hypot(x - (ax + (bx - ax) * t), z - (az + (bz - az) * t)));
  }
  return best;
}

// Named places: apps/editor/src/eden/places.ts, shared with edenAgents.ts
// (which builds mind.ts's World.things from the same data) so the scene and
// the people living in it can never disagree about where things are. The
// overlook and hollow get a gentle rise/dip of their own below; the grove
// and meadow stay flat, told apart by what grows there (scatter) rather
// than their shape.
const PLACES = EDEN_PLACES;
const OVERLOOK_R = PLACES.overlook!.radius, HOLLOW_R = PLACES.hollow!.radius, GROVE_R = PLACES.grove!.radius, MEADOW_R = PLACES.meadow!.radius;

const n = TERRAIN.resolution;
const step = TERRAIN.size / (n - 1);
const sculpt = new Int16Array(n * n);
for (let row = 0; row < n; row++)
  for (let column = 0; column < n; column++) {
    const x = -TERRAIN.size / 2 + column * step;
    const z = -TERRAIN.size / 2 + row * step;
    const b = base[row * n + column]!;
    let h = b + fbm(x / 46, z / 46, TERRAIN.seed, 2) * 1.4;
    const overlookD = Math.hypot(x - PLACES.overlook.x, z - PLACES.overlook.z);
    h += 2.6 * (1 - smoothstep((overlookD - OVERLOOK_R * 0.5) / (OVERLOOK_R * 0.7)));
    const hollowD = Math.hypot(x - PLACES.hollow.x, z - PLACES.hollow.z);
    h -= 1.8 * (1 - smoothstep((hollowD - HOLLOW_R * 0.4) / (HOLLOW_R * 0.6)));
    const rd = riverDistance(x, z);
    if (rd < RIVER_WIDTH * 1.6) {
      const e = rd / RIVER_WIDTH;
      const bed = e < 1 ? RIVER_LEVEL - RIVER_DEPTH * (1 - e * e) : RIVER_LEVEL + (e - 1) * 1.1;
      h += (bed - h) * (1 - smoothstep((e - 1.1) / 0.5));
    }
    const hd = Math.hypot(x - HIGH.x, z - HIGH.z);
    h += 17 * (1 - smoothstep(hd / HIGH.radius)) + 3.5 * fbm(x / 22, z / 22, TERRAIN.seed + 3, 3) * (1 - smoothstep(hd / (HIGH.radius * 1.2)));
    const ld = Math.hypot(x - LAKE.x, z - LAKE.z);
    if (ld < LAKE.radius * 1.6) {
      const e = ld / LAKE.radius;
      const bed = e < 1 ? RIVER_LEVEL - LAKE_DEPTH * (1 - e * e) : RIVER_LEVEL + (e - 1) * 1.2;
      h += (bed - h) * (1 - smoothstep((e - 1.15) / 0.35));
    }
    sculpt[row * n + column] = Math.max(-32000, Math.min(32000, Math.round((h - b) * 100)));
  }
const heights = generateHeights({ ...TERRAIN, sculpt: encodeSculpt(sculpt) }, sculpt);
const ground = (x: number, z: number) => sampleHeight(heights, TERRAIN.resolution, TERRAIN.size, x, z);

// Where people stand to use the water must be dry land, above the water's surface: say so loudly at build time if the terrain ever puts it under.
for (const place of Object.values(PLACES)) {
  const at = place.stand ?? (place.id === "river_bend" ? DRINK_SPOT : undefined);
  if (at && ground(at.x, at.z) < RIVER_LEVEL + 0.15) throw new Error(`${place.id}: the bank at ${at.x},${at.z} is ${ground(at.x, at.z).toFixed(2)} m, under the water (${RIVER_LEVEL} m)`);
}

const scene = new SceneBuilder();

scene.add("Ground", [0, 0, 0], {
  Terrain: component("Terrain", {
    ...TERRAIN,
    sculpt: encodeSculpt(sculpt),
    grassColor: rgb("#6b9152"), rockColor: rgb("#8a8378"), sandColor: rgb("#d9c98f"), snowColor: rgb("#f0f0f0"),
    sandHeight: RIVER_LEVEL - 0.3, snowHeight: 17, rockSlope: 0.75,
    paths: [
      `dirt 3.5 ${PLACES.center.x} ${PLACES.center.z} ${PLACES.hollow.x} ${PLACES.hollow.z}`,
      `dirt 3.5 ${PLACES.center.x} ${PLACES.center.z} ${PLACES.overlook.x} ${PLACES.overlook.z}`,
      `dirt 3.5 ${PLACES.center.x} ${PLACES.center.z} ${PLACES.river_bend.x} ${PLACES.river_bend.z}`,
      `dirt 3.5 ${PLACES.center.x} ${PLACES.center.z} ${PLACES.grove.x} ${PLACES.grove.z}`,
      `dirt 3.5 ${PLACES.center.x} ${PLACES.center.z} ${PLACES.meadow.x} ${PLACES.meadow.z}`,
      ...["east_woods", "pinewood", "south_meadow", "orchard"].map((id) => `dirt 3 ${PLACES.center.x} ${PLACES.center.z} ${PLACES[id]!.x} ${PLACES[id]!.z}`),
      ...RIVER.slice(0, -1).map((a, i) => `sand ${RIVER_WIDTH * 2 + 6} ${a[0]} ${a[1]} ${RIVER[i + 1]![0]} ${RIVER[i + 1]![1]}`),
    ].join("\n"),
    // Real, gentle plants only: EZ-Tree trees (255-261), photoscanned rocks
    // (399-406). The grove and meadow are told apart purely by what grows
    // there (in=cx,cz,radius restricts each line to its own patch), not by
    // any elevation change of their own.
    scatter: [
      `255 0.0022 0.9 1.3 0.85 trunk spacing=6 cluster=0.75 clusterSize=55 tint=0.12 in=${PLACES.grove.x},${PLACES.grove.z},${GROVE_R}`,
      `256 0.0016 0.9 1.3 0.85 trunk spacing=6 cluster=0.7 clusterSize=50 in=${PLACES.grove.x},${PLACES.grove.z},${GROVE_R}`,
      `261 0.0012 0.8 1.3 0.85 spacing=2.5 cluster=0.6 clusterSize=30 tint=0.15 in=${PLACES.grove.x},${PLACES.grove.z},${GROVE_R}`,
      // The wider world: low-poly woods (the kit's wuxia oaks and pines, a few hundred triangles each) so a whole forest stays light to draw.
      `328 0.007 0.9 1.4 0.8 trunk spacing=5 cluster=0.8 clusterSize=40 tint=0.15 in=${PLACES.pinewood!.x},${PLACES.pinewood!.z},${PLACES.pinewood!.radius}`,
      `329 0.005 0.9 1.4 0.8 trunk spacing=5 cluster=0.7 clusterSize=35 tint=0.15 in=${PLACES.pinewood!.x},${PLACES.pinewood!.z},${PLACES.pinewood!.radius}`,
      `330 0.006 1 1.5 0.8 trunk spacing=6 cluster=0.7 clusterSize=35 tint=0.15 in=${PLACES.east_woods!.x},${PLACES.east_woods!.z},${PLACES.east_woods!.radius}`,
      `331 0.004 1 1.5 0.8 trunk spacing=6 cluster=0.6 clusterSize=30 tint=0.2 in=${PLACES.east_woods!.x},${PLACES.east_woods!.z},${PLACES.east_woods!.radius}`,
      `37 0.012 0.8 1.3 0.8 spacing=2.5 tint=0.2 in=${PLACES.east_woods!.x},${PLACES.east_woods!.z},${PLACES.east_woods!.radius}`,
      `331 0.004 1 1.5 0.8 trunk spacing=7 tint=0.2 in=${PLACES.south_meadow!.x},${PLACES.south_meadow!.z},${PLACES.south_meadow!.radius}`,
      `38 0.006 0.8 1.3 0.8 spacing=3 tint=0.2 in=${PLACES.south_meadow!.x},${PLACES.south_meadow!.z},${PLACES.south_meadow!.radius}`,
      `404 0.4 0.8 1.4 0.9 on=grass tint=0.25 in=${PLACES.south_meadow!.x},${PLACES.south_meadow!.z},${PLACES.south_meadow!.radius}`,
      `255 0.004 0.9 1.2 0.85 trunk spacing=5 tint=0.1 in=${PLACES.orchard!.x},${PLACES.orchard!.z},${PLACES.orchard!.radius}`,
      `328 0.007 0.9 1.4 0.7 trunk spacing=4 cluster=0.6 clusterSize=40 tilt=0.3 height=3..13 in=${HIGH.x},${HIGH.z},${HIGH.radius}`,
      `329 0.005 0.9 1.4 0.7 trunk spacing=4 tilt=0.3 height=6..15 in=${HIGH.x},${HIGH.z},${HIGH.radius}`,
      `402 0.003 1.2 3 0.7 collide tilt=0.5 tint=0.2 in=${HIGH.x},${HIGH.z},${HIGH.radius}`,
      `403 0.002 1.2 3 0.7 collide tilt=0.5 tint=0.2 in=${HIGH.x},${HIGH.z},${HIGH.radius}`,
      `404 0.6 0.8 1.4 0.9 on=grass tint=0.25 in=${PLACES.meadow.x},${PLACES.meadow.z},${MEADOW_R}`,
      `405 0.15 0.9 1.5 0.9 on=grass tint=0.2 in=${PLACES.meadow.x},${PLACES.meadow.z},${MEADOW_R}`,
      "404 0.1 0.8 1.3 0.9 on=grass tint=0.2",
      `403 0.0006 1.5 3.8 0.65 collide spacing=6 tilt=0.4 tint=0.2 in=${PLACES.river_bend.x},${PLACES.river_bend.z},16`,
      "401 0.00005 2.5 6 0.8 collide tilt=0.5 tint=0.2",
    ].join("\n"),
  }),
});

scene.add("Environment", [0, -5, 0], {
  Environment: component("Environment", {
    sky: "Procedural", skyColor: rgb("#7fa8c9"), horizonColor: rgb("#f3e3c8"), groundColor: rgb("#52604a"),
    sunElevation: 48, sunAzimuth: 128, sunIntensity: 3, sunColor: rgb("#fff3d9"), ambientIntensity: 1.3,
    fog: "Exponential", fogColor: rgb("#cddde8"), fogDensity: 0.0032, shadows: true, exposure: 1,
  }),
});

// The river's water, two sheets following its two segments (see RIVER
// above) -- purely visual, no Collider/RigidBody of its own (matching
// build_jianghu.ts's own waterSheet()).
function waterSegment(name: string, a: V3, b: V3) {
  const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
  const id = scene.box(name, [mx, RIVER_LEVEL, mz], [RIVER_WIDTH * 1.9, 0.1, len + RIVER_WIDTH], "#3f86b8",
    { Rotation: { euler: vec(0, yaw, 0) } },
    { roughness: 0.05, metalness: 0.1, opacity: 0.8, texture: "builtin:water", emissive: rgb("#2a5f88"), emissiveIntensity: 0.35 });
  delete (scene.entities[id]!.components as Components).Collider;
  delete (scene.entities[id]!.components as Components).RigidBody;
}
RIVER.slice(0, -1).forEach((a, i) => waterSegment(`River water ${i + 1}`, a, RIVER[i + 1]!));
{
  const id = scene.box("Lake water", [LAKE.x, RIVER_LEVEL, LAKE.z], [LAKE.radius * 1.5, 0.1, LAKE.radius * 1.5], "#3f86b8", {},
    { roughness: 0.05, metalness: 0.1, opacity: 0.8, texture: "builtin:water", emissive: rgb("#2a5f88"), emissiveIntensity: 0.35 });
  delete (scene.entities[id]!.components as Components).Collider;
  delete (scene.entities[id]!.components as Components).RigidBody;
}

// The two landmark trees, as scenery only -- no Fall/mortality mechanic, per
// the Creator's own call: they exist to be seen and named, nothing more.
// mind.ts gives them their own real affordance though (life: a meal,
// knowledge: a view) -- see edenAgents.ts's World.things.
const [treeOfLife, treeOfKnowledge] = EDEN_LANDMARKS;
scene.model("Tree of Life", modelId("eztree-oak"), [treeOfLife!.x, ground(treeOfLife!.x, treeOfLife!.z), treeOfLife!.z], 0.4, false, 2.1);
scene.model("Tree of Knowledge", modelId("eztree-ash"), [treeOfKnowledge!.x, ground(treeOfKnowledge!.x, treeOfKnowledge!.z), treeOfKnowledge!.z], -0.6, false, 1.9);
// The two great trees are not solid as a whole (the box round a 30 m tree would cover the middle of the garden and shove anyone standing in it
// under the ground); only the trunk is, a small post at its foot.
for (const tree of [treeOfLife!, treeOfKnowledge!]) {
  scene.add(`${tree.name} trunk`, [tree.x, ground(tree.x, tree.z) + 1.5, tree.z], { RigidBody: { dynamic: false }, Collider: { type: "AABB", halfExtents: vec(0.9, 1.5, 0.9) } });
}

const ADAM_MODEL = modelId("man-casual");
const EVE_MODEL = modelId("woman-casual");
scene.add("Adam", [-1, ground(-1, 0) + 0.1, 0], {
  Rotation: { euler: vec(0, Math.PI / 2, 0) },
  Renderable: { mesh: ADAM_MODEL, material: 0, visible: true },
  RigidBody: { mass: 70, dynamic: true },
  Collider: {},
  Script: { source: lua("adam.lua"), props: {} },
});
scene.add("Eve", [1, ground(1, 0) + 0.1, 0], {
  Rotation: { euler: vec(0, -Math.PI / 2, 0) },
  Renderable: { mesh: EVE_MODEL, material: 0, visible: true },
  RigidBody: { mass: 60, dynamic: true },
  Collider: {},
  Script: { source: lua("eve.lua"), props: {} },
});

// A logic-only entity (no mesh, same pattern as tools/racing/build_high_heat.ts's
// own "Director") that fulfils "let there be..." requests -- see
// tools/eden/lua/creator.lua and edenAgents.ts's Creator panel.
scene.add("Creator", [0, 50, 0], { Script: { source: lua("creator.lua"), props: {} } });

// The Creator's view: a third-person camera that follows Adam from behind and above. Drag to orbit round him; Eve is usually close by.
scene.add("Eden camera", [0, 8, 10], {
  Camera: component("Camera", { fov: 55, priority: 1 }),
  CameraFollow: component("CameraFollow", { target: "Adam", offset: vec(0, 4, 9), smoothing: 0.5, lookHeight: 1.2, collision: false, orbit: true }),
});

// Prefabs the Creator can bring into being ("let there be a deer"): Eden's
// own grove trees and garden animals, nothing from the wider catalog. Spawn
// position comes from world.spawn's own x/y/z args, so these carry no
// Transform/Rotation of their own (world.spawn has no yaw parameter either --
// confirmed in build_azure_cloud_sect.ts's own prefabs, which drop Rotation
// for the same reason). No Scale override: every catalog model here already
// renders at its intended size with none, same as Adam/Eve above.
const creaturePrefab = (name: string, catalogFile: string, mass: number) =>
  scene.prefab(name, { Renderable: { mesh: modelId(catalogFile), material: 0, visible: true }, RigidBody: { mass, dynamic: true }, Collider: {} });
creaturePrefab("Deer", "deer", 90);
creaturePrefab("Fox", "fox", 15);
creaturePrefab("Alpaca", "alpaca", 70);
creaturePrefab("Wolf", "wolf", 40);
creaturePrefab("Horse", "horse", 400);
creaturePrefab("Dog", "shiba-inu", 12);
const stillPrefab = (name: string, catalogFile: string) =>
  scene.prefab(name, { Renderable: { mesh: modelId(catalogFile), material: 0, visible: true }, RigidBody: { dynamic: false }, Collider: { isTrigger: false } });
stillPrefab("Oak Tree", "eztree-oak");
stillPrefab("Pine Tree", "eztree-pine");
stillPrefab("Bush", "bush-1");
stillPrefab("Rock", "rock-large");
stillPrefab("Fruit Tree", "eztree-oak");
// What the people build, placed by creator.lua when the minds make them (edenAgents.ts): a tent they can walk into (no collider), and a
// fire that burns for as long as it has wood (the mind removes it when it goes out).
scene.prefab("Shelter", { Renderable: { mesh: modelId("canvas-tent"), material: 0, visible: true } });
// A planted plot: a low bush that bears fruit, no collider.
// A grave: a standing stone, half size, where someone who died was laid to rest.
scene.prefab("Grave", { Renderable: { mesh: modelId("rock-large"), material: 0, visible: true }, Scale: { value: vec(0.5, 0.5, 0.5) } });
scene.prefab("Crop", { Renderable: { mesh: modelId("bush-1"), material: 0, visible: true } });
// People who were not here at the start (born in the garden, or brought by the Creator): the same models as Adam and Eve, driven by person.lua,
// and smaller as children.
const personPrefab = (name: string, model: string, scale?: number) =>
  scene.prefab(name, {
    Renderable: { mesh: modelId(model), material: 0, visible: true },
    RigidBody: { mass: scale ? 30 : 70, dynamic: true },
    Collider: {},
    ...(scale ? { Scale: { value: vec(scale, scale, scale) } } : {}),
    Script: { source: lua("person.lua"), props: {} },
  });
// Different faces and clothes for different people: the host picks one by who they are (edenAgents.ts bodyPrefab), and size follows age.
const MEN = ["man-casual", "man-farmer", "man-worker", "man-hoodie", "man-beach"];
const WOMEN = ["woman-casual", "woman-dress", "woman-street", "woman-tank-top"];
MEN.forEach((m, i) => {
  personPrefab(`Villager (man) ${i + 1}`, m);
  personPrefab(`Youth (boy) ${i + 1}`, m, 0.82);
  personPrefab(`Child (boy) ${i + 1}`, m, 0.6);
});
WOMEN.forEach((m, i) => {
  personPrefab(`Villager (woman) ${i + 1}`, m);
  personPrefab(`Youth (girl) ${i + 1}`, m, 0.82);
  personPrefab(`Child (girl) ${i + 1}`, m, 0.6);
});
scene.prefab("Campfire", {
  Particles: component("Particles", { preset: "Fire", rate: 40, lifetime: 0.9, speed: 1.2, size: 0.28, shape: "Cone", coneAngle: 18, gravityScale: -0.15 }),
  Light: component("Light", { type: "Point", color: vec(1, 0.62, 0.28), intensity: 3, range: 11 }),
});

const outDir = join(ROOT, "games/my-games/eden");
mkdirSync(outDir, { recursive: true });
writeFileSync(
  join(outDir, "scene.json"),
  JSON.stringify({ format: 1, name: "Eden", entities: scene.entities, prefabs: scene.prefabs }, null, 2),
);
writeFileSync(
  join(outDir, "game.json"),
  JSON.stringify(
    {
      name: "Eden",
      genre: "Life simulation",
      description:
        "Adam and Eve, two independent minds living in a garden at the heart of a wide valley: a river that ends in a lake, woods, a pinewood, an orchard, southern meadows and wolf-haunted highlands. Watch what they choose to do, or say \"let there be...\" and bring something new into the garden.",
      scene: "scene.json",
      accent: "#c9a24a",
    },
    null,
    2,
  ),
);
console.log(`wrote ${outDir}/scene.json and game.json`);
