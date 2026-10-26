// Generates EDEN -- PHASE 1A (games/my-games/eden): a bare, flat plain
// with Adam and Eve, two independent Supabase-brained characters (see the
// Eden plan). Deliberately no biome yet -- no terrain sculpting, river, or
// foliage -- the point of this phase is to validate the live brain<->engine
// bridge before betting on the real Eden biome's look (Phase 1b). Run from
// apps/editor:
//
//   npm run eden
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import * as kitModule from "../lib/scene_kit";
// scene_kit is CommonJS to tsx beside this ES module, so its exports may sit on `default`.
const kit: typeof kitModule = (kitModule as unknown as { default?: typeof kitModule }).default ?? kitModule;
const { ROOT, SceneBuilder, component, modelId, rgb, vec } = kit;

const here = dirname(fileURLToPath(import.meta.url));
const lua = (file: string) => readFileSync(join(here, "lua", file), "utf8");

const scene = new SceneBuilder();

// A perfectly flat heightfield (height: 0 means the noise amplitude is
// zero, so every vertex sits at y=0 regardless of seed/frequency/octaves)
// -- the same real Terrain system every other game uses, just with nothing
// sculpted into it yet. Gives Adam & Eve solid, correctly-collided,
// correctly-pathed ground without inventing a separate "flat plane" system.
scene.add("Ground", [0, 0, 0], {
  Terrain: component("Terrain", {
    size: 60, resolution: 65, height: 0, seed: 1, frequency: 1, octaves: 1,
    sculpt: "", scatter: "", paths: "",
    grassColor: rgb("#6b8f52"), rockColor: rgb("#8a8378"), sandColor: rgb("#d9c98f"), snowColor: rgb("#f0f0f0"),
    sandHeight: 0.1, snowHeight: 10, rockSlope: 0.7,
  }),
});

scene.add("Environment", [0, -5, 0], {
  Environment: component("Environment", {
    sky: "Procedural", skyColor: rgb("#7fa8c9"), horizonColor: rgb("#f3e3c8"), groundColor: rgb("#52604a"),
    sunElevation: 45, sunAzimuth: 120, sunIntensity: 3, sunColor: rgb("#fff3d9"), ambientIntensity: 1.3,
    fog: "None", shadows: true, exposure: 1,
  }),
});

// Both characters start at the centre, facing each other -- the first
// thing either of them perceives is the other one already there.
const ADAM_MODEL = modelId("man-casual");
const EVE_MODEL = modelId("woman-casual");

scene.add("Adam", [-1, 0, 0], {
  Rotation: { euler: vec(0, Math.PI / 2, 0) },
  Renderable: { mesh: ADAM_MODEL, material: 0, visible: true },
  RigidBody: { mass: 70, dynamic: true },
  Collider: {},
  Script: { source: lua("adam.lua"), props: {} },
});

scene.add("Eve", [1, 0, 0], {
  Rotation: { euler: vec(0, -Math.PI / 2, 0) },
  Renderable: { mesh: EVE_MODEL, material: 0, visible: true },
  RigidBody: { mass: 60, dynamic: true },
  Collider: {},
  Script: { source: lua("eve.lua"), props: {} },
});

const outDir = join(ROOT, "games/my-games/eden");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "scene.json"), JSON.stringify({ entities: scene.entities, prefabs: scene.prefabs }, null, 2));
writeFileSync(
  join(outDir, "game.json"),
  JSON.stringify(
    {
      name: "Eden",
      genre: "Life simulation",
      description:
        "Adam and Eve, two independent minds (Supabase-brained, see the Eden plan) living in a still-unformed world. Phase 1a: a bare plain, just the two of them -- watch, don't play.",
      scene: "scene.json",
      accent: "#c9a24a",
    },
    null,
    2,
  ),
);
console.log(`wrote ${outDir}/scene.json and game.json`);
