import assert from "node:assert/strict";
import { test } from "node:test";
import { answers, goalFraction, nameAndCount, parseActions, parseObjectives } from "../src/editor/actionScript";

test("action lines: events, several actions per line, comments, and unknown verbs reported with their line", () => {
  const { actions, errors } = parseActions("# menu\nplay -> hide Main menu; show Health bar\nresume\nfly away");
  assert.deepEqual(actions.map((a) => [a.event, a.verb, a.args]), [["play", "hide", "Main menu"], ["play", "show", "Health bar"], ["", "resume", ""]]);
  assert.equal(errors.length, 1);
  assert.match(errors[0]!, /line 4: unknown action "fly"/);
});

test("an event pattern answers exactly, by prefix with *, or always", () => {
  assert.ok(answers("", "click") && answers("*", "x") && answers("choice:*", "choice:2") && answers("play", "play"));
  assert.ok(!answers("choice:*", "slot:1") && !answers("play", "resume"));
});

test("item names keep their spaces and take an optional count", () => {
  assert.deepEqual(nameAndCount("Health Potion 3"), ["Health Potion", 3]);
  assert.deepEqual(nameAndCount("Key"), ["Key", 1]);
});

test("objectives: ids, goals, chains and the mistakes that are reported", () => {
  const { defs, errors } = parseObjectives(
    "a | Find it | Look around | collect Key 2 | give Coin 5; objective start b\nb | Go | | reach Exit 4 |\nc | Kill | | kill any 3 |\nd | Press | | interact Lever |\ne | Custom | | script |",
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(defs.map((d) => d.goal), [
    { kind: "collect", target: "Key", count: 2 },
    { kind: "reach", target: "Exit", radius: 4 },
    { kind: "kill", target: "any", count: 3 },
    { kind: "interact", target: "Lever" },
    { kind: "script", count: 1 },
  ]);
  const bad = parseObjectives("two words | T | | collect Key |\nx | T | | dance 3 |\nx | T | | script | fly\nx | T | | script |\nx | T | | script |");
  assert.equal(bad.defs.length, 1);
  assert.equal(bad.errors.length, 4);
});

test("progress is a fraction of the goal", () => {
  assert.equal(goalFraction({ kind: "collect", target: "Key", count: 4 }, 1), 0.25);
  assert.equal(goalFraction({ kind: "reach", target: "X", radius: 3 }, 1), 1);
  assert.equal(goalFraction({ kind: "kill", target: "any", count: 2 }, 5), 1);
});
