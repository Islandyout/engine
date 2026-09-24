import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { defaultComponent } from "../src/authoring/CommandInterpreter";
import { normalizeComponent } from "../src/scene/SceneSerializer";

test("InputActions default bindings match the bridge's built-in defaults", () => {
  const header = readFileSync(new URL("../runtime/bindings.hpp", import.meta.url), "utf8");
  const block = /default_text = ([\s\S]*?);/.exec(header)![1]!;
  const native = [...block.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]!.replace(/\\n/g, "\n")).join("");
  assert.equal(defaultComponent("InputActions").bindings, native);
});

test("InputActions normalizes and rejects non-string bindings", () => {
  assert.deepEqual(normalizeComponent("InputActions", { bindings: "jump: space" }), { bindings: "jump: space" });
  assert.throws(() => normalizeComponent("InputActions", { bindings: 3 }));
});
