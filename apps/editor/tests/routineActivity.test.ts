import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRoutineActivities, routineActivity } from "../src/editor/routineActivity";

test("routine stops carry their activity words in hour order", () => {
  assert.deepEqual(parseRoutineActivities("0 1 2; 12 5 6 talk; 6.5 3 4 sit"), ["", "sit", "talk"]);
  assert.deepEqual(parseRoutineActivities("19 0 0, 7 1 1 work"), ["work", ""]);
  assert.equal(routineActivity("0 1 2; 12 5 6 talk", 1), "talk");
  assert.equal(routineActivity("0 1 2; 12 5 6 talk", 4), "");
});
