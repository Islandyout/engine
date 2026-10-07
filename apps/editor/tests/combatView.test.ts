import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import * as THREE from "three";
import { FighterMode, StunKind, loadCombatClips, pickReaction, pickStance } from "../src/editor/combatView";
import { martialArtsMoves, swordMoves } from "../src/scene/meleeMoves";

test("a free fighter stands in guard, shuffles toward where it moves, and runs when fast", () => {
  assert.equal(pickStance(FighterMode.idle, 0, 0, true, 0, 0).clip, "guard");
  assert.deepEqual(pickStance(FighterMode.idle, 1.2, 0, true, 1, 0.2), { clip: "strafe_f", loop: true, lower: true });
  assert.equal(pickStance(FighterMode.idle, 1.2, 0, true, -1, 0).clip, "strafe_b");
  assert.equal(pickStance(FighterMode.idle, 1.2, 0, true, 0.1, -1).clip, "strafe_l");
  assert.equal(pickStance(FighterMode.idle, 1.2, 0, true, 0.1, 1).clip, "strafe_r");
  assert.equal(pickStance(FighterMode.idle, 4, 0, true, 1, 0).clip, "run");
  assert.equal(pickStance(FighterMode.idle, 7, 0, true, 1, 0).clip, "sprint");
  assert.equal(pickStance(FighterMode.block, 1, 0, true, 1, 0).clip, "block");
  assert.equal(pickStance(FighterMode.idle, 0, 4, false, 0, 0).clip, "jump_loop");
});

test("reactions match the hit", () => {
  assert.equal(pickReaction(StunKind.heavy, false), "hit_knockback");
  assert.equal(pickReaction(StunKind.guardBreak, false), "guard_break");
  assert.equal(pickReaction(StunKind.parried, true), "guard_break");
  assert.notEqual(pickReaction(StunKind.light, true), pickReaction(StunKind.light, false));
});

test("the editor's move lists match the engine's", () => {
  const source = readFileSync(new URL("../../../source/engine/gameplay/melee.cpp", import.meta.url), "utf8");
  const literal = (name: string) => {
    const body = source.match(new RegExp(`const char \\*const ${name} =([\\s\\S]*?);\\n`))![1]!;
    return [...body.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => JSON.parse(`"${m[1]}"`) as string).join("");
  };
  assert.equal(martialArtsMoves, literal("default_moves_text"));
  assert.equal(swordMoves, literal("sword_moves_text"));
});

test("every clip the moves and reactions name is in the combat clip library", () => {
  const glb = readFileSync(new URL("../../../assets/source/kit/people/combat_clips.glb", import.meta.url));
  const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString("utf8")) as { animations: { name: string }[] };
  const clips = new Set(json.animations.map((a) => a.name));
  for (const text of [martialArtsMoves, swordMoves])
    for (const [, clip] of text.matchAll(/clip=(\w+)/g)) assert.ok(clips.has(clip!), `missing clip ${clip}`);
  for (const name of ["guard", "block", "strafe_f", "strafe_b", "strafe_l", "strafe_r", "hit_head", "hit_chest", "hit_knockback", "guard_break", "launched", "air_loop", "air_hit_l", "air_hit_r", "fall_impact", "get_up", "kip_up", "death", "jump_loop"])
    assert.ok(clips.has(name), `missing clip ${name}`);
});

test("the clip library adds the locomotion every stance names, for rigs with no clips of their own", async () => {
  const names = (path: string) => {
    const glb = readFileSync(new URL(`../../../assets/source/${path.replace(/^\.\//, "")}`, import.meta.url));
    const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString("utf8")) as { animations: { name: string }[] };
    return { animations: json.animations.map((a) => new THREE.AnimationClip(a.name, 1, [])) };
  };
  const clips = new Set((await loadCombatClips(async (path) => names(path))).map((c) => c.name));
  for (const stance of [pickStance(FighterMode.idle, 0, 0, true, 0, 0), pickStance(FighterMode.idle, 4.5, 0, true, 1, 0), pickStance(FighterMode.idle, 6, 0, true, 1, 0)])
    assert.ok(clips.has(stance.clip), `missing stance clip ${stance.clip}`);
  for (const name of ["idle", "walk", "run", "sprint"]) assert.ok(clips.has(name), `missing locomotion ${name}`);
});
