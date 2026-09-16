import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { EditorDocument } from "../src/editor/Document";
import { modelCatalog } from "../src/scene/modelCatalog";

const testDir = fileURLToPath(new URL(".", import.meta.url));
const demoScenePath = resolve(testDir, "../../../examples/demo-game.json");

// examples/demo-game.json is the repo's shipped dogfooding scene (see
// docs/BTAI_EDITOR.md) -- a drivable Vehicle+Player car inside a walled
// arena with a Collider obstacle, two AIState-driven Health targets, and a
// wandering AIState+Pedestrian bystander. This guards it against silently
// drifting out of date with the authoring schema (a renamed field, a
// removed component) the way any other checked-in fixture would be
// guarded, not just eyeballed once at authoring time.
test("the shipped demo scene loads and matches its own description", () => {
  const document = JSON.parse(readFileSync(demoScenePath, "utf8"));
  const doc = new EditorDocument();
  doc.load(document); // throws on anything validateSceneDocument rejects
  assert.equal(doc.scene.entityCount, 11);

  const car = doc.scene
    .eachAlive()
    .find((e) => doc.scene.get(e, "Name")?.value === "Player Car");
  assert.ok(car, "Player Car entity is present");
  assert.ok(doc.scene.has(car!, "Player"));
  assert.ok(doc.scene.has(car!, "Vehicle"));

  const colliders = doc.scene
    .eachAlive()
    .filter((e) => doc.scene.has(e, "Collider"));
  assert.equal(colliders.length, 5); // 4 arena barriers + 1 obstacle crate

  const targets = doc.scene
    .eachAlive()
    .filter((e) => doc.scene.has(e, "Health"));
  assert.equal(targets.length, 2);
  for (const target of targets) {
    const health = doc.scene.get(target, "Health")!;
    assert.ok(health.current > 0 && health.current <= health.maximum);
    // Both targets react to the player now instead of just sitting there
    // to be shot at -- they chase when approached and flee once hurt.
    assert.ok(doc.scene.has(target, "AIState"));
  }

  const bystander = doc.scene
    .eachAlive()
    .find((e) => doc.scene.get(e, "Name")?.value === "Bystander");
  assert.ok(bystander, "Bystander entity is present");
  assert.ok(doc.scene.has(bystander!, "AIState"));
  assert.ok(
    doc.scene.has(bystander!, "Pedestrian"),
    "Bystander should never chase, only wander/flee",
  );

  // Every referenced catalog model (0 -- the default box, always valid --
  // aside) still exists, so a future catalog change can't silently turn one
  // of this scene's entities into whatever id 0 happens to render as.
  const catalogIds = new Set(modelCatalog.map((m) => m.id));
  for (const entity of doc.scene.eachAlive()) {
    const mesh = doc.scene.get(entity, "Renderable")?.mesh;
    if (mesh !== undefined && mesh !== 0)
      assert.ok(catalogIds.has(mesh), `mesh id ${mesh} is not in the catalog`);
  }
});
