import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { validateSceneDocument } from "../src/scene/SceneSerializer";
import { parseModelInstances } from "../src/editor/modelInstances";

const committed = new URL("../../../examples/city/city-template.json", import.meta.url);
type Entity = { name: string; components: Record<string, any> };

test("examples/city/city-template.json is what tools/city/build_city_template.ts generates", () => {
  const out = join(mkdtempSync(join(tmpdir(), "city-")), "city.json");
  execFileSync(process.execPath, ["--import", "tsx", "../../tools/city/build_city_template.ts"], { env: { ...process.env, CITY_OUT: out }, stdio: "pipe" });
  assert.equal(readFileSync(out, "utf8"), readFileSync(committed, "utf8"), "regenerate it with `npm run city --prefix apps/editor`");
});

test("the City Template keeps the rules of a real street", () => {
  const scene = JSON.parse(readFileSync(committed, "utf8"));
  validateSceneDocument(scene);
  const entities: Entity[] = scene.entities;
  const signals = entities.filter((e) => e.components.TrafficSignal);
  const junctions = signals.map((e) => [e.components.Transform.position.x, e.components.Transform.position.z] as [number, number]);
  const lines = [...new Set(junctions.map(([x]) => x))];
  assert.equal(signals.length, 16);
  assert.ok(signals.every((e) => e.components.TrafficSignal.radius === 7));
  const toLine = (v: number) => Math.min(...lines.map((l) => Math.abs(v - l)));
  const toJunction = (x: number, z: number) => Math.min(...junctions.map(([jx, jz]) => Math.hypot(x - jx, z - jz)));
  const instances = (name: string) => parseModelInstances(entities.find((e) => e.name === name)!.components.ModelInstances.instances).instances;

  // Cars drive the right-hand lane: every route point is 2 m off a road's centre line.
  const cars = entities.filter((e) => e.components.Driver);
  assert.equal(cars.length, 14);
  for (const car of cars) {
    assert.equal(car.components.Driver.mode, "Traffic");
    for (const p of car.components.Driver.route.split(" ")) {
      const [x, z] = p.split(",").map(Number) as [number, number];
      assert.ok(Math.abs(toLine(x) - 2) < 0.01 || Math.abs(toLine(z) - 2) < 0.01, `${car.name}: ${p} off its lane`);
    }
  }
  // People keep to the sidewalks (4-8 m from a road's centre) and step into
  // the road only on a crosswalk, from a kerb point, next to a junction.
  const walkers = entities.filter((e) => e.components.Walker && e.components.Walker.route);
  assert.ok(walkers.length >= 30);
  for (const w of walkers) {
    const pts = w.components.Walker.route.split(" ").map((t: string) => ({ kerb: t.endsWith("*"), xz: t.replace("*", "").split(",").map(Number) as [number, number] }));
    pts.forEach((p: { kerb: boolean; xz: [number, number] }, k: number) => {
      const q = pts[(k + 1) % pts.length]!;
      const onSidewalk = (x: number, z: number) => [toLine(x), toLine(z)].some((d) => d >= 4 && d <= 8) && toLine(x) >= 4 && toLine(z) >= 4;
      for (let t = 0; t <= 1; t += 0.05) {
        const x = p.xz[0] + (q.xz[0] - p.xz[0]) * t,
          z = p.xz[1] + (q.xz[1] - p.xz[1]) * t;
        if (onSidewalk(x, z)) continue;
        assert.ok(p.kerb && toJunction(x, z) < 11, `${w.name}: walks in the road at (${x.toFixed(1)}, ${z.toFixed(1)}) away from a crosswalk`);
      }
    });
  }
  // Dogs follow someone who exists.
  for (const dog of entities.filter((e) => e.name.startsWith("Dog ")))
    assert.ok(entities.some((e) => e.name === dog.components.Walker.follow), dog.name);
  // Street trees keep the junctions' sight triangles clear and stand in the
  // furniture zone; lamps too.
  const street = instances("Street trees and lamps");
  for (const t of street.filter((i) => i.model === 258)) {
    assert.ok(toJunction(t.x, t.z) > 10, `tree at (${t.x}, ${t.z}) in a sight triangle`);
    assert.ok([toLine(t.x), toLine(t.z)].some((d) => Math.abs(d - 4.8) < 0.01), `tree at (${t.x}, ${t.z}) off the furniture zone`);
  }
  // Buildings stand inside their blocks, off the roads and sidewalks.
  for (const b of instances("Buildings")) assert.ok(toLine(b.x) > 8 && toLine(b.z) > 8, `building at (${b.x}, ${b.z}) on a street`);
  // Parked cars only in courtyards, never in a lane.
  for (const c of instances("Courtyards").filter((i) => i.model >= 219 && i.model <= 235)) assert.ok(toLine(c.x) > 8 && toLine(c.z) > 8, `parked car at (${c.x}, ${c.z}) on a street`);
});
