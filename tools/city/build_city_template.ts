// Generates the City Template (games/city-template), a working town to
// build a game on: run from apps/editor with `npm run city`. The town
// itself comes from tools/city/city.ts; this adds the light, the player
// and the camera.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, SceneBuilder, rgb, vec } from "../gatebreaker/kit";
import { buildCity } from "./city";

const scene = new SceneBuilder();

scene.add("Environment", [0, -30, 0], {
  Environment: {
    sky: "Procedural",
    skyColor: rgb("#5a93d8"),
    horizonColor: rgb("#f2d8b0"),
    groundColor: rgb("#6b7563"),
    sunElevation: 48,
    sunAzimuth: 220,
    sunIntensity: 3.3,
    sunColor: rgb("#fff1da"),
    ambientIntensity: 1.25,
    fog: "Linear",
    fogColor: rgb("#c8d6e2"),
    fogNear: 140,
    fogFar: 520,
    shadows: true,
    exposure: 1.1,
  },
  PostProcessing: {
    antialias: "SMAA",
    ambientOcclusion: true,
    aoRadius: 0.35,
    aoIntensity: 0.55,
    bloom: 0.1,
    bloomRadius: 0.3,
    bloomThreshold: 0.95,
    exposure: 1.05,
    contrast: 0.06,
    saturation: 0.06,
    temperature: 0.04,
    vignette: 0.1,
    shadowQuality: "High",
  },
});

const city = buildCity(scene, { blocksX: 3, blocksZ: 3, seed: 7, traffic: 14, walkers: 36, dogs: 5 });

// The player: on foot on a downtown sidewalk, at a jog (real walking pace
// is 1.4 m/s; games run faster so a block doesn't take a minute).
scene.add("Player", [city.spawn[0], 0.9, city.spawn[1]], {
  Scale: { value: vec(0.6, 1.8, 0.6) },
  Renderable: { mesh: 249, material: 0, visible: true },
  Player: {},
  RigidBody: { mass: 75, dynamic: true },
  Collider: {},
  CharacterController: { mode: "ThirdPerson", walkSpeed: 3.4, sprintSpeed: 7, jumpHeight: 1, acceleration: 30, airControl: 6, stepHeight: 0.5 },
});
scene.add("Camera", [city.spawn[0], 4, city.spawn[1] - 6], {
  Camera: { fov: 60, far: 800 },
  CameraFollow: { target: "", offset: vec(0, 2.2, -4.6), smoothing: 0.12, lookHeight: 1.3, collision: true, orbit: true },
});

const out = process.env.CITY_OUT ?? join(ROOT, "examples/city/city-template.json");
mkdirSync(join(out, ".."), { recursive: true });
writeFileSync(out, JSON.stringify({ format: 1, name: "City Template", entities: scene.entities, prefabs: scene.prefabs }, null, 1) + "\n");
const count = (prefix: string) => scene.entities.filter((e) => e.name.startsWith(prefix)).length;
console.log(
  `wrote ${out}: ${scene.entities.length} entities; ${city.junctions.length} junctions, ${city.blocks.length} blocks, ${count("Traffic")} cars, ${count("Pedestrian")} people, ${count("Dog")} dogs`,
);
