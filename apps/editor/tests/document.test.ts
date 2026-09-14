import { test } from "node:test";
import assert from "node:assert/strict";
import { EditorDocument } from "../src/editor/Document";
import { serializeScene } from "../src/scene/SceneSerializer";
test("authoring edits, undo/redo, dirty state and stale handles", () => {
  const d = new EditorDocument();
  const r = d.execute({
    command: "spawn_entity",
    name: "Box",
    transform: [1, 2, 3],
  });
  assert.equal(r.ok, true);
  assert.ok(r.entity);
  assert.equal(d.dirty, true);
  d.markSaved();
  d.execute({
    command: "set_transform",
    entity: r.entity,
    position: [4, 5, 6],
  });
  d.undo();
  assert.equal(d.dirty, false);
  assert.equal(d.scene.alive(r.entity), false);
  d.redo();
  assert.equal(
    d.scene.get(d.scene.eachAlive()[0]!, "Transform")!.position.x,
    4,
  );
  assert.equal(
    d.execute({ command: "destroy_entity", entity: r.entity }).ok,
    false,
  );
});
test("invalid scene replacement leaves document and handles intact", () => {
  const d = new EditorDocument();
  const r = d.execute({ command: "spawn_entity", name: "Keep" });
  const before = d.save();
  assert.throws(() =>
    d.load({ format: 1, entities: [{ components: { Unknown: {} } }] }),
  );
  assert.deepEqual(d.save(), before);
  assert.ok(d.scene.alive(r.entity!));
  assert.throws(() =>
    d.load({
      format: 1,
      entities: [{ components: {}, parent: { index: 0, generation: 1 } }],
    }),
  );
  assert.deepEqual(d.save(), before);
});
test("finite values and hierarchy cycles rejected; hierarchy roundtrip survives reuse", () => {
  const d = new EditorDocument();
  const p = d.execute({ command: "spawn_entity", name: "Parent" }).entity!;
  const c = d.execute({ command: "spawn_entity", name: "Child" }).entity!;
  assert.equal(
    d.execute({
      command: "set_transform",
      entity: p,
      position: { x: Infinity, y: 0, z: 0 },
    }).ok,
    false,
  );
  assert.equal(
    d.execute({ command: "reparent_entity", entity: c, parent: p }).ok,
    true,
  );
  assert.equal(
    d.execute({ command: "reparent_entity", entity: p, parent: c }).ok,
    false,
  );
  const saved = d.save();
  d.load(saved);
  assert.deepEqual(d.save(), saved);
  assert.equal(d.scene.alive(p), false);
  const refs = d.scene.eachAlive();
  const parent = refs.find((e) => d.scene.get(e, "Name")?.value === "Parent")!;
  d.execute({ command: "destroy_entity", entity: parent });
  assert.equal(d.scene.query("Parent").length, 0);
});
test("duplicate carries component data and play prevents edits", () => {
  const d = new EditorDocument();
  d.execute({ command: "spawn_entity", name: "Box", transform: [2, 3, 4] });
  assert.equal(d.duplicate().ok, true);
  assert.equal(d.scene.entityCount, 2);
  d.undo();
  assert.equal(d.scene.entityCount, 1);
  const before = serializeScene(d.scene);
  d.mode = "play";
  assert.equal(d.execute({ command: "spawn_entity" }).ok, false);
  d.undo();
  assert.deepEqual(serializeScene(d.scene), before);
});

test("console save/load commands preserve scene data", () => {
  const d = new EditorDocument();
  const entity = d.execute({ command: "spawn_entity", name: "Saved" }).entity!;
  assert.equal(d.execute({ command: "save_scene", path: "test" }).ok, true);
  d.execute({ command: "destroy_entity", entity });
  assert.equal(d.execute({ command: "load_scene", path: "test" }).ok, true);
  assert.equal(d.scene.entityCount, 1);
  assert.equal(d.scene.alive(entity), false);
});
