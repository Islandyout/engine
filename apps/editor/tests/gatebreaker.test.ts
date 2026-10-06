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
