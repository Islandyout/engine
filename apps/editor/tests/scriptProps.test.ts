import { test } from "node:test";
import assert from "node:assert/strict";
import { declaredProps, reconcileProps, encodeProps } from "../src/scene/scriptProps";
import { normalizeComponent } from "../src/scene/SceneSerializer";

test("@prop declarations parse numbers, booleans, quoted and bare strings", () => {
  const source = [
    "-- @prop speed 5",
    "  --@prop armed true",
    '-- @prop target "Player One"',
    "-- @prop mode patrol",
    "-- @prop speed 9 (duplicate ignored)",
    "local x = 1 -- @prop notadeclaration 1",
  ].join("\n");
  assert.deepEqual(declaredProps(source), [
    { name: "speed", defaultValue: 5 },
    { name: "armed", defaultValue: true },
    { name: "target", defaultValue: "Player One" },
    { name: "mode", defaultValue: "patrol" },
  ]);
});

test("reconcile keeps same-typed stored values, defaults the rest, drops undeclared", () => {
  const source = "-- @prop speed 5\n-- @prop armed false";
  assert.deepEqual(reconcileProps(source, { speed: 12, armed: "yes", stale: 1 }), {
    speed: 12,
    armed: false,
  });
  assert.equal(encodeProps({ speed: 12, armed: true, tag: "a\tb" }), "speed\tn\t12\narmed\tb\t1\ntag\ts\ta b");
});

test("Script normalization reconciles props against the source (old scenes have none)", () => {
  assert.deepEqual(normalizeComponent("Script", { source: "-- @prop hp 3" }), {
    source: "-- @prop hp 3",
    props: { hp: 3 },
  });
  assert.throws(() => normalizeComponent("Script", { source: "", props: [1] }));
});
