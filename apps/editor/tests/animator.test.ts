import { test } from "node:test";
import assert from "node:assert/strict";
import { AnimatorRuntime, parseAnimatorGraph, parseParamValue } from "../src/editor/animator";

const graphText = `
# locomotion + attack
state idle clip=Idle
state run clip=Run speed=2
state attack clip=Attack once
start idle
idle -> run when speed > 0.5 and grounded fade 0.3
run -> idle when speed <= 0.5
any -> attack when trigger attack
attack -> idle when end
event attack 0.5 hit
event run 0.25 step
`;

test("parses states, transitions, events and defaults", () => {
  const { graph, errors } = parseAnimatorGraph(graphText);
  assert.deepEqual(errors, []);
  assert.equal(graph!.start, "idle");
  assert.deepEqual(graph!.states.get("attack"), { name: "attack", clip: "Attack", loop: false, speed: 1 });
  assert.equal(graph!.transitions[0]!.fade, 0.3);
  assert.equal(graph!.transitions[1]!.fade, 0.2);
  assert.deepEqual(graph!.transitions[0]!.conditions, [
    { kind: "compare", param: "speed", op: ">", value: 0.5 },
    { kind: "flag", param: "grounded", negate: false },
  ]);
});

test("reports readable errors", () => {
  const { graph, errors } = parseAnimatorGraph("state a\na -> b when speed ~ 3\nevent a 2 x\nbogus");
  assert.equal(graph, undefined);
  assert.ok(errors.some((e) => e.includes("line 2") && e.includes("speed ~ 3")));
  assert.ok(errors.some((e) => e.includes("line 3")));
  assert.ok(errors.some((e) => e.includes("line 4")));
  assert.ok(errors.some((e) => e.includes('unknown state "b"')));
  assert.deepEqual(parseAnimatorGraph("").errors, ["no states defined"]);
});

test("runs transitions, consumes triggers, fires events including loops, and exits on end", () => {
  const animator = new AnimatorRuntime(parseAnimatorGraph(graphText).graph!);
  assert.equal(animator.current.name, "idle");
  animator.set("speed", 3);
  assert.equal(animator.step(0.1, 1).entered, undefined, "not grounded yet");
  animator.set("grounded", true);
  const run = animator.step(0.1, 1);
  assert.equal(run.entered?.state.name, "run");
  assert.equal(run.entered?.fade, 0.3);
  // run plays at speed 2 on a 1 s clip: 1.3 s of wall time = 2.6 clip-seconds,
  // crossing 0.25 at clip time 0.25, 1.25 and 2.25.
  assert.deepEqual(animator.step(1.3, 1).events, ["step", "step", "step"]);
  animator.trigger("attack");
  assert.equal(animator.step(0.01, 1).entered?.state.name, "attack");
  assert.equal(animator.step(0.01, 1).entered, undefined, "trigger was consumed");
  assert.deepEqual(animator.step(0.5, 1).events, ["hit"]);
  assert.equal(animator.step(0.6, 1).entered?.state.name, "idle", "attack ends -> idle");
  assert.equal(animator.step(1, undefined).events.length, 0, "unknown duration: no events");
});

test("parseParamValue", () => {
  assert.equal(parseParamValue("true"), true);
  assert.equal(parseParamValue("2.5"), 2.5);
  assert.equal(parseParamValue("abc"), undefined);
});
