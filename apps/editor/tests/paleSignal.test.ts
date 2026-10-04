import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { validateSceneDocument } from "../src/scene/SceneSerializer";
import { defaultSpaceBodies } from "../src/authoring/CommandInterpreter";
import { latLonDirection, parseLandmarks, parseSpaceBodies, parseSpecies } from "../src/editor/spaceView";

const committed = new URL("../../../examples/space/pale-signal.json", import.meta.url);

test("examples/space/pale-signal.json is what tools/space/build_pale_signal.ts generates", () => {
  const out = join(mkdtempSync(join(tmpdir(), "pale-signal-")), "slice.json");
  execFileSync(process.execPath, ["--import", "tsx", "../../tools/space/build_pale_signal.ts"], {
    env: { ...process.env, PS_OUT: out },
    stdio: "pipe",
  });
  assert.equal(readFileSync(out, "utf8"), readFileSync(committed, "utf8"), "regenerate it with `npm run space --prefix apps/editor`");
});

test("the Pale Signal slice has a system, a ship, a site and a director", () => {
  const scene = JSON.parse(readFileSync(committed, "utf8"));
  validateSceneDocument(scene);
  const named = (name: string) => scene.entities.find((e: { name?: string }) => e.name === name);
  for (const name of ["Space", "Ship", "Player", "Director", "Landing Pad", "Ruin Core", "Volatile Ice 1"]) assert.ok(named(name), name);
  const space = named("Space").components.SpaceSystem;
  const { bodies, errors } = parseSpaceBodies(space.bodies);
  assert.deepEqual(errors, []);
  assert.deepEqual(bodies.map((b) => b.name), ["Tethys", "Vell", "Cinder", "Ossuary"]);
  assert.equal(bodies[1]!.parent, 0, "Vell orbits Tethys");
  assert.equal(space.siteBody, "Tethys");
  assert.deepEqual(parseLandmarks(space.landmarks, bodies).map((l) => l.label), ["The Kneeling Array", "Under-Ice Relay", "The Anvil", "Kestra Station"]);
  assert.equal(bodies[0]!.sea, -60);
  assert.ok(bodies[0]!.clouds > 0);
  const species = parseSpecies(space.species, bodies);
  assert.ok(species.length >= 12 && species.some((s) => s.body === 1), "species on Tethys and Vell");
  assert.equal(named("Ship").components.Spaceship.model, "Kestrel");
  const scannable = scene.entities.filter((e: { components: { Scannable?: unknown } }) => e.components.Scannable);
  assert.ok(scannable.length >= 9, "evidence, ice, the foundation and grazers are scannable");
  for (const npc of ["Tal Ossin", "Ena Vey", "Maru Sen"]) assert.ok(named(npc), npc);
  const director = named("Director").components.Script.source;
  assert.ok(!director.includes("{{CONFIG}}") && director.includes("space.state()"));
});

test("space bodies: parents by name, defaults, and readable errors", () => {
  const { bodies, errors } = parseSpaceBodies(defaultSpaceBodies);
  assert.deepEqual(errors, []);
  assert.equal(bodies.length, 3);
  assert.equal(bodies[0]!.color, "#4f7a4a");
  const bad = parseSpaceBodies("# comment\nMoon Nowhere 1 2 3 4 5 6 7 8 9 10 11\nShort - 1 2\nRock - 1 2 3 4 0 6 7 8 9 10 11");
  assert.equal(bad.bodies.length, 0);
  assert.equal(bad.errors.length, 3);
  assert.match(bad.errors[0]!, /parent "Nowhere"/);
});

test("species and body options", () => {
  const { bodies } = parseSpaceBodies("World - 1 10 0 0 1000 9 0 0 10 100 1 #808080 #000000 sea=-5 clouds=0.4 snow=1");
  assert.equal(bodies[0]!.sea, -5);
  assert.equal(bodies[0]!.clouds, 0.4);
  assert.equal(bodies[0]!.snow, true);
  const species = parseSpecies("a World flora 37 2 0.5 Pale Reed | grows\nb Nowhere flora 37 1 1 X\nc World rock 1 1 1 Bad\n# d World flora 1 1 1 Comment", bodies);
  assert.deepEqual(species, [{ id: "a", body: 0, kind: "flora", model: 37, weight: 2, scale: 0.5, name: "Pale Reed", description: "grows" }]);
});

test("landmarks and latitude/longitude", () => {
  const { bodies } = parseSpaceBodies(defaultSpaceBodies);
  const marks = parseLandmarks("Vell -12 35 #8ff7ff Pale Signal\nNowhere 0 0\nTethys 10 x", bodies);
  assert.equal(marks.length, 1);
  assert.deepEqual({ ...marks[0] }, { body: 1, latitude: -12, longitude: 35, color: "#8ff7ff", label: "Pale Signal" });
  const up = latLonDirection(90, 0);
  assert.ok(Math.abs(up.y - 1) < 1e-9);
  const east = latLonDirection(0, 90);
  assert.ok(Math.abs(east.z - 1) < 1e-9 && Math.abs(east.length() - 1) < 1e-9);
});
