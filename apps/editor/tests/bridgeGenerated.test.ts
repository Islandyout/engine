import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const tool = (name: string) => fileURLToPath(new URL(`../../../tools/bridge/${name}`, import.meta.url));

test("the generated bridge files match bridge.cpp and fields.mjs", () => {
  for (const script of ["gen_fields.mjs", "gen_exports.mjs"])
    assert.doesNotThrow(() => execFileSync(process.execPath, [tool(script), "--check"], { stdio: "pipe" }), `${script} --check`);
});
