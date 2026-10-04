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

test("Pale Signal has six worlds, nine landmarks, every site, NPC and evidence item", () => {
  const scene = JSON.parse(readFileSync(committed, "utf8"));
  validateSceneDocument(scene);
  const named = (name: string) => scene.entities.find((e: { name?: string }) => e.name === name);
  for (const name of ["Space", "Ship", "Player", "Director", "Landing Pad", "Ruin Core", "Volatile Ice 1", "Kestra Workshop", "MenuPanel"]) assert.ok(named(name), name);
  const space = named("Space").components.SpaceSystem;
  const { bodies, errors } = parseSpaceBodies(space.bodies);
  assert.deepEqual(errors, []);
  assert.deepEqual(bodies.map((b) => b.name), ["Cinder", "Tethys", "Vell", "Ossuary", "Hollow", "Nemesis"]);
  assert.equal(bodies[2]!.parent, 1, "Vell orbits Tethys");
  assert.ok(bodies[5]!.hidden && bodies[5]!.unlit, "Nemesis starts hidden and unlit");
  assert.ok(bodies[0]!.rifts && bodies[0]!.craters > 0, "Cinder has craters and lava rifts");
  assert.ok(bodies[3]!.dunes, "Ossuary has dunes");
  assert.equal(bodies[1]!.day, 1200, "Tethys turns every 1200 s");
  assert.equal(bodies[2]!.day, 0, "Vell keeps one face to Tethys");
  assert.equal(space.siteBody, "Tethys");
  const landmarks = parseLandmarks(space.landmarks, bodies);
  assert.equal(landmarks.length, 9);
  assert.deepEqual([...new Set(landmarks.map((l) => l.kind))].sort(), ["array", "beacon", "camp", "monolith", "ruin"]);
  assert.equal(bodies[1]!.sea, -60);
  const species = parseSpecies(space.species, bodies);
  assert.equal(species.length, 23, "all 22 prototype species plus the Kestra Spire");
  assert.equal(named("Ship").components.Spaceship.model, "Kestrel");
  // Every site beyond Kestra is a Site with its own people and evidence.
  const sites = scene.entities.filter((e: { components: { Site?: unknown } }) => e.components.Site);
  assert.deepEqual(sites.map((e: { name: string }) => e.name).sort(), ["Civic Archive Nine", "Darsa Delta", "Meridian Spur", "Retreat Causeway", "The Third Mooring"]);
  const routines = scene.entities.filter((e: { components: { Routine?: unknown } }) => e.components.Routine);
  // The 24 named Talari, plus stall keepers and neighbours (0.75.0).
  assert.equal(routines.filter((e: { name: string }) => !/^(Stall Keeper|Neighbour)$/.test(e.name)).length, 24, "24 Talari keep daily routines");
  // Work, lunch at the market, evening market: every named day has an activity at work.
  assert.ok(routines.every((e: { components: { Routine: { stops: string } } }) => /(sit|work|talk)/.test(e.components.Routine.stops)), "routines say what people do there");
  for (const e of routines) assert.equal(e.components.Renderable.mesh, 175, "the Talari model");
  const evidence = scene.entities.filter((e: { components: { Scannable?: { kind: string; id: string } } }) => e.components.Scannable?.kind === "Culture" && /^(te|os|ho)_/.test(e.components.Scannable.id));
  assert.equal(evidence.length, 16, "all 16 evidence items");
  assert.ok(scene.entities.some((e: { components: { Wildlife?: unknown } }) => e.components.Wildlife), "herds of wildlife");
  assert.deepEqual(Object.keys(scene.prefabs).sort(), ["Crawler", "Drifter", "Grazer", "Husk", "Skimmer"]);
  const director = named("Director").components.Script.source;
  assert.ok(!director.includes("{{CONFIG}}") && director.includes("space.state()") && director.includes("save.set"));
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
  assert.equal(bodies[0]!.hidden, false);
  assert.equal(parseSpaceBodies("Dark - 1 10 0 0 1000 9 0 0 10 100 1 #808080 #000000 hidden=1 unlit=1").bodies[0]!.unlit, true);
  const featured = parseSpaceBodies("Rock - 1 10 0 0 1000 9 0 0 10 100 1 #808080 #000000 craters=0.4 rifts=1 dunes=1 day=900").bodies[0]!;
  assert.deepEqual([featured.craters, featured.rifts, featured.dunes, featured.day], [0.4, true, true, 900]);
  assert.equal(bodies[0]!.day, 0, "bodies don't turn unless asked");
  const species = parseSpecies("a World flora 37 2 0.5 Pale Reed | grows\nb Nowhere flora 37 1 1 X\nc World rock 1 1 1 Bad\n# d World flora 1 1 1 Comment", bodies);
  assert.deepEqual(species, [{ id: "a", body: 0, kind: "flora", model: 37, weight: 2, scale: 0.5, name: "Pale Reed", description: "grows" }]);
});

test("landmarks and latitude/longitude", () => {
  const { bodies } = parseSpaceBodies(defaultSpaceBodies);
  const marks = parseLandmarks("Vell -12 35 #8ff7ff Pale Signal\nNowhere 0 0\nTethys 10 x", bodies);
  assert.equal(marks.length, 1);
  assert.deepEqual({ ...marks[0] }, { body: 1, latitude: -12, longitude: 35, color: "#8ff7ff", label: "Pale Signal", kind: "array" });
  assert.equal(parseLandmarks("Vell 0 0 #ffffff kind=ruin Old Place", bodies)[0]!.kind, "ruin");
  const up = latLonDirection(90, 0);
  assert.ok(Math.abs(up.y - 1) < 1e-9);
  const east = latLonDirection(0, 90);
  assert.ok(Math.abs(east.z - 1) < 1e-9 && Math.abs(east.length() - 1) < 1e-9);
});
