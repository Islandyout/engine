import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { modelCatalog, catalogCategories } from "../src/scene/modelCatalog";

const testDir = fileURLToPath(new URL(".", import.meta.url));

test("catalog entries have unique ids, none colliding with the default box (0)", () => {
  assert.ok(modelCatalog.length > 0);
  const ids = modelCatalog.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate catalog id");
  for (const id of ids) assert.ok(id >= 1, `id ${id} collides with the default box (0)`);
});

test("id 1 is the bench, everywhere else means never", () => {
  const bench = modelCatalog.filter((m) => m.id === 1);
  assert.equal(bench.length, 1);
  assert.equal(bench[0]!.name, "Aether Bench");
});

test("catalog categories match the entries that reference them", () => {
  const fromEntries = new Set(modelCatalog.map((m) => m.category));
  assert.deepEqual([...fromEntries].sort(), [...catalogCategories].sort());
});

test("every catalog path resolves to a real bundled asset", () => {
  for (const entry of modelCatalog) {
    // The bench predates the kit/** layout and is still fetched from the site
    // root (see modelCatalog.ts's own comment on id 1), not kit/<category>/.
    let onDisk;
    if (entry.id === 1) {
      onDisk = resolve(testDir, "../../../assets/source/bench.glb");
    } else {
      assert.ok(entry.path.startsWith("./kit/"), `unexpected path shape: ${entry.path}`);
      onDisk = resolve(
        testDir,
        "../../../assets/source/kit",
        entry.path.slice("./kit/".length),
      );
    }
    assert.ok(existsSync(onDisk), `missing asset for ${entry.name}: ${onDisk}`);
  }
});
