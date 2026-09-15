import { test } from "node:test";
import assert from "node:assert/strict";
import { EditorDocument } from "../src/editor/Document";
import {
  transformCommand,
  type TransformSnapshot,
} from "../src/editor/TransformEdit";
import { propertyMetadata } from "../src/editor/PropertyMetadata";
const start: TransformSnapshot = {
  position: { x: 0, y: 0.5, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
};
test("gesture previews do not mutate document; one commit is one undo", () => {
  const d = new EditorDocument();
  const e = d.execute({
    command: "spawn_entity",
    transform: [0, 0.5, 0],
  }).entity!;
  d.markSaved();
  let after = structuredClone(start);
  for (let i = 1; i < 20; i++) {
    after.position.x = i;
    transformCommand(e, "translate", start, after);
  }
  assert.equal(d.dirty, false);
  assert.equal(d.scene.get(e, "Transform")!.position.x, 0);
  assert.equal(
    d.execute(transformCommand(e, "translate", start, after)).ok,
    true,
  );
  assert.equal(d.scene.get(e, "Transform")!.position.x, 19);
  d.undo();
  assert.equal(d.scene.entityCount, 1);
  assert.equal(d.dirty, false);
  assert.equal(
    d.scene.get(d.scene.eachAlive()[0]!, "Transform")!.position.x,
    0,
  );
  d.redo();
  assert.equal(
    d.scene.get(d.scene.eachAlive()[0]!, "Transform")!.position.x,
    19,
  );
});
test("rotation and scale map to validated components; unchanged/cancelled gestures produce no command", () => {
  const d = new EditorDocument();
  const e = d.execute({ command: "spawn_entity" }).entity!;
  assert.equal(transformCommand(e, "translate", start, start), null);
  const after = structuredClone(start);
  after.rotation.y = Math.PI / 2;
  after.scale.x = 2;
  assert.equal(d.execute(transformCommand(e, "rotate", start, after)).ok, true);
  assert.equal(d.scene.get(e, "Rotation")!.euler.y, Math.PI / 2);
  assert.equal(d.execute(transformCommand(e, "scale", start, after)).ok, true);
  assert.equal(d.scene.get(e, "Scale")!.value.x, 2);
  after.scale.x = NaN;
  assert.equal(d.execute(transformCommand(e, "scale", start, after)).ok, false);
  assert.equal(d.scene.get(e, "Scale")!.value.x, 2);
  d.execute({ command: "destroy_entity", entity: e });
  assert.equal(
    d.execute(transformCommand(e, "rotate", start, after)).ok,
    false,
  );
});
test("metadata constrains enums and marks derived properties", () => {
  assert.deepEqual(
    propertyMetadata("Collider", "type").options?.map((o) => o.value),
    ["AABB", "Sphere"],
  );
  assert.equal(propertyMetadata("RigidBody", "inverseMass").readOnly, true);
  const meshOptions = propertyMetadata("Renderable", "mesh").options ?? [];
  assert.equal(meshOptions[0]?.value, 0, "the default box is always first");
  // The bench (id 1) lives in the catalog itself now, not a fixed position —
  // find it by value rather than assuming an index.
  assert.ok(
    meshOptions.some((o) => o.value === 1 && /Bench/.test(o.label)),
    "no Renderable.mesh option for the bench",
  );
});
