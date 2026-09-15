import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { modelCatalog, catalogCategories } from "../src/scene/modelCatalog";

const testDir = fileURLToPath(new URL(".", import.meta.url));

test("catalog entries have unique ids outside the reserved 0/1 range", () => {
  assert.ok(modelCatalog.length > 0);
  const ids = modelCatalog.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate catalog id");
  for (const id of ids) assert.ok(id >= 2, `id ${id} collides with default box (0) or bench (1)`);
});

test("catalog categories match the entries that reference them", () => {
  const fromEntries = new Set(modelCatalog.map((m) => m.category));
  assert.deepEqual([...fromEntries].sort(), [...catalogCategories].sort());
});

test("every catalog path resolves to a real bundled asset", () => {
  for (const entry of modelCatalog) {
    assert.ok(entry.path.startsWith("./kit/"), `unexpected path shape: ${entry.path}`);
    const onDisk = resolve(
      testDir,
      "../../../assets/source/kit",
      entry.path.slice("./kit/".length),
    );
    assert.ok(existsSync(onDisk), `missing asset for ${entry.name}: ${onDisk}`);
  }
});
