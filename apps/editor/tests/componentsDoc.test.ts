import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

test("docs/COMPONENTS.md matches the editor's component tables", () => {
  const gen = fileURLToPath(new URL("../../../tools/docs/gen_components.ts", import.meta.url));
  const tsx = fileURLToPath(new URL("../node_modules/.bin/tsx", import.meta.url));
  assert.doesNotThrow(() => execFileSync(tsx, [gen, "--check"], { stdio: "pipe" }));
});
