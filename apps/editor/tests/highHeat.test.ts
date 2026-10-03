import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { validateSceneDocument } from "../src/scene/SceneSerializer";
import { parseModelInstances } from "../src/editor/modelInstances";

const committed = new URL("../../../examples/racing/high-heat.json", import.meta.url);

test("examples/racing/high-heat.json is what tools/racing/build_high_heat.ts generates", () => {
  const out = join(mkdtempSync(join(tmpdir(), "high-heat-")), "city.json");
  execFileSync(process.execPath, ["--import", "tsx", "../../tools/racing/build_high_heat.ts"], {
    env: { ...process.env, HH_OUT: out },
    stdio: "pipe",
  });
  assert.equal(readFileSync(out, "utf8"), readFileSync(committed, "utf8"), "regenerate it with `npm run racing --prefix apps/editor`");
});

test("HIGH HEAT is a valid scene with a city, cars, police and three events", () => {
  const scene = JSON.parse(readFileSync(committed, "utf8"));
  validateSceneDocument(scene);
  const named = (name: string) => scene.entities.find((e: { name?: string }) => e.name === name);
  for (const name of ["Player", "Director", "Chase Camera", "Rival Kaze", "Blacklist Razor", "Patrol 1", "Traffic 1"])
    assert.ok(named(name), name);
  assert.equal(named("Player").components.Vehicle.model, "Arcade");
  for (const name of ["Roads", "Buildings", "Streetlamps"]) {
    const { instances, errors } = parseModelInstances(named(name).components.ModelInstances.instances);
    assert.deepEqual(errors, []);
    assert.ok(instances.length > 200, `${name}: ${instances.length}`);
  }
  assert.ok(scene.prefabs.Cruiser.components.Driver.mode === "Pursuit" && scene.prefabs.Interceptor);
  const director = named("Director").components.Script.source;
  assert.ok(!director.includes("{{CONFIG}}"));
  assert.equal((director.match(/laps = \d/g) ?? []).length, 3, "three events");
});
