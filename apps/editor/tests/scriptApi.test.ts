import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { scriptApi } from "../src/editor/scriptApi";
import { filterScriptApi } from "../src/editor/scriptApiPanel";

test("the Script API reference is current and searchable", () => {
  const gen = fileURLToPath(new URL("../../../tools/script_api/gen.mjs", import.meta.url));
  assert.doesNotThrow(() => execFileSync(process.execPath, [gen, "--check"], { stdio: "pipe" }), "gen.mjs --check");
  assert.ok(scriptApi.some((e) => e.name === "world.find"));
  assert.ok(scriptApi.some((e) => e.name === "hud.announce"));
  assert.ok(scriptApi.some((e) => e.name === "on_tick"));
  const found = filterScriptApi("waypoint planet");
  assert.ok(found.length >= 1 && found.every((e) => /waypoint/i.test(e.signature + e.doc)));
});
