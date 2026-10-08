import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { validateSceneDocument } from "../src/scene/SceneSerializer";

const committed = new URL("../../../examples/gatebreaker/m0.json", import.meta.url);

test("examples/gatebreaker/m0.json is what tools/gatebreaker/build_m0.ts generates", () => {
  const out = join(mkdtempSync(join(tmpdir(), "gatebreaker-")), "m0.json");
  execFileSync(process.execPath, ["--import", "tsx", "../../tools/gatebreaker/build_m0.ts"], { env: { ...process.env, GB_OUT: out }, stdio: "pipe" });
  assert.equal(readFileSync(out, "utf8"), readFileSync(committed, "utf8"), "regenerate it with `npm run gatebreaker --prefix apps/editor`");
});

test("GATEBREAKER M0: a Manhwa-styled room with the hunter against a goblin", () => {
  const scene = JSON.parse(readFileSync(committed, "utf8"));
  validateSceneDocument(scene);
  const named = (name: string) => scene.entities.find((e: { name: string }) => e.name === name);
  assert.equal(named("Look").components.PostProcessing.style, "Manhwa");
  const hero = named("Han Seo-jin").components;
  const goblin = named("Goblin").components;
  assert.equal(hero.Renderable.mesh, 176);
  assert.ok(hero.Player && hero.Melee.ai === false);
  assert.equal(goblin.Renderable.mesh, 177);
  assert.ok(goblin.Melee.ai && goblin.Melee.team !== hero.Melee.team);
  // Twin daggers, the action profile, and Shadow Step.
  assert.equal(hero.Melee.rightHand, 203);
  assert.equal(hero.Melee.leftHand, 203);
  for (const move of ["shadow_step:", "input=skill1", "input=skill2", "input=skill3", "input=ultimate"]) assert.ok(hero.Melee.moves.includes(move), move);
  const bindings: string = named("Input").components.InputActions.bindings;
  for (const line of ["dodge: space", "block: shift", "lock: tab", "skill1: q", "skill2: e", "skill3: r", "ultimate: f", "light: mouse_left", "heavy: mouse_right"])
    assert.ok(bindings.includes(line), line);
  assert.ok(!/^jump:/m.test(bindings), "no jump");
  // Nothing solid stands in the open middle where they fight.
  for (const e of scene.entities) {
    const c = e.components;
    if (!c.Collider || c.Collider.isTrigger || e.name === "Ground" || c.Player || c.Melee) continue;
    const { x, z } = c.Transform.position;
    assert.ok(Math.abs(x) > 3 || Math.abs(z) > 5, `${e.name} blocks the arena at ${x}, ${z}`);
  }
});

const game = new URL("../../../examples/gatebreaker/gatebreaker.json", import.meta.url);

test("examples/gatebreaker/gatebreaker.json is what tools/gatebreaker/build_game.ts generates", () => {
  const out = join(mkdtempSync(join(tmpdir(), "gatebreaker-")), "game.json");
  execFileSync(process.execPath, ["--import", "tsx", "../../tools/gatebreaker/build_game.ts"], { env: { ...process.env, GB_GAME_OUT: out }, stdio: "pipe" });
  assert.equal(readFileSync(out, "utf8"), readFileSync(game, "utf8"), "regenerate it with `npm run gatebreaker --prefix apps/editor`");
});

test("GATEBREAKER: floors sit on the ground and fighters, placed or spawned, stand on it", () => {
  const scene = JSON.parse(readFileSync(game, "utf8"));
  validateSceneDocument(scene);
  for (const e of scene.entities) {
    const c = e.components;
    // Floor tiles' tops sit 1 cm above y = 0 (just clear of the shadow plane there).
    // Instanced tiles stand on their bottoms: 15 cm thick, 14 cm down, tops at y = 0.01.
    if (/floor/.test(e.name) && c.ModelInstances) assert.equal(c.Transform.position.y, -0.14, `${e.name} tiles top at y = 0.01`);
    else if (/floor/.test(e.name)) assert.ok(Math.abs(c.Transform.position.y + c.Scale.value.y / 2 - 0.01) < 1e-6, `${e.name} top at y = 0.01`);
    if (c.Melee && !/Prologue/.test(e.name)) assert.ok(Math.abs(c.Transform.position.y - c.Scale.value.y / 2) < 1e-6, `${e.name} stands on y = 0`);
  }
  // The Director spawns each enemy at half its height (its HALF table), and
  // only enemies that are prefabs.
  const director = scene.entities.find((e: { name: string }) => e.name === "Director").components.Script.source as string;
  const half = new Map([...director.matchAll(/\["([^"]+)"\] = ([\d.]+)/g)].map((m) => [m[1]!, Number(m[2])]));
  assert.ok(half.size >= 8);
  for (const [name, y] of half) {
    const prefab = scene.prefabs[name];
    assert.ok(prefab, `${name} is a prefab`);
    assert.ok(Math.abs(prefab.components.Scale.value.y / 2 - y) < 1e-6, `${name} spawns standing on y = 0`);
  }
  for (const m of director.matchAll(/boss = "([^"]+)"/g)) assert.ok(scene.prefabs[m[1]!], `boss ${m[1]} is a prefab`);
});

test("GATEBREAKER M4: field enemies stand on y = 0, every Gate rank has a rift, and the district stays small", () => {
  const scene = JSON.parse(readFileSync(game, "utf8"));
  const world = scene.entities.find((e: { name: string }) => e.name === "World").components.Script.source as string;
  // world.lua places each field kind at half its height (its HALF table) as
  // a "Field <kind>" prefab whose script takes the World's messages.
  const half = new Map([...world.matchAll(/\["([^"]+)"\] = ([\d.]+)/g)].map((m) => [m[1]!, Number(m[2])]));
  assert.ok(half.size >= 8);
  for (const [name, y] of half) {
    const prefab = scene.prefabs[`Field ${name}`];
    assert.ok(prefab, `Field ${name} is a prefab`);
    assert.ok(Math.abs(prefab.components.Scale.value.y / 2 - y) < 1e-6, `Field ${name} spawns standing on y = 0`);
    assert.match(prefab.components.Script.source, /name == "stash"/, `Field ${name} can be pooled`);
  }
  for (const m of world.matchAll(/boss = "([^"]+)"/g)) assert.ok(half.has(m[1]!), `field boss ${m[1]} has a height`);
  for (const rank of ["E", "D", "C", "B", "A", "S"]) assert.ok(scene.prefabs[`Gate rift ${rank}`], `a rift for ${rank}-rank Gates`);
  for (const k of [1, 2, 3])
    for (const suffix of ["", " anchor"]) assert.ok(scene.entities.some((e: { name: string }) => e.name === `Field zone ${k}${suffix}`), `Field zone ${k}${suffix}`);
  // The engine's limit is 1024 entities, spawned ones included: the field
  // reuses its enemies, so the static scene leaves most of it free.
  assert.ok(scene.entities.length < 400, `${scene.entities.length} static entities`);
});
