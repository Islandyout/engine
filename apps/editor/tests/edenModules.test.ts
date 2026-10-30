import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { AGE } from "../src/eden/development";
import { AGES } from "../src/eden/lifecycle";
import { ADULT_AGE } from "../src/eden/mind";

// The mind's modules import one another in a ring (mind, culture, reason, solve, psyche, development, lifecycle). That is fine while nothing
// reads a value from another module at load time, and a crash with a confusing message ("Cannot access X before initialization") when
// something does, but only for some import orders. So each module is imported FIRST, alone, in its own process.
const dir = join(import.meta.dirname, "../src/eden");
const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));
for (const f of files) {
  test(`eden/${f} loads when it is the first thing imported`, () => {
    const out = execFileSync(join(import.meta.dirname, "../node_modules/.bin/tsx"), ["-e", `import(${JSON.stringify(join(dir, f))}).then(() => console.log("ok"))`], { encoding: "utf8", timeout: 60000 });
    assert.match(out, /ok/);
  });
}

test("the age constants that lifecycle.ts keeps as plain numbers agree with the modules they mirror", () => {
  assert.equal(AGES.puberty, AGE.adolescence);
  assert.ok(AGES.courting > ADULT_AGE && AGES.courting < ADULT_AGE + 0.5);
  assert.ok(AGES.fertileFrom > ADULT_AGE);
  assert.equal(ADULT_AGE, 4);
});
