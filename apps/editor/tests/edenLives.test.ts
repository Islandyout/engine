import test from "node:test";
import assert from "node:assert/strict";
import { runLives } from "../src/eden/lifelike";

// Two hundred simulated lives of about a week each, drawn with different people, gardens and dangers. If a change to the minds makes
// them starve, stand about, chatter all night or change their mind every few seconds, a measure here names what went wrong.
// tools/eden/scenarios.ts runs more (1200 by default) for tuning.
test("two hundred lives are lifelike", () => {
  const { problems } = runLives(200, 3);
  assert.deepEqual(problems, []);
});
