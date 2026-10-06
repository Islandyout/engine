import assert from "node:assert/strict";
import { test } from "node:test";
import { sceneTemplates, templateScene } from "../src/editor/sceneTemplates";
import { EditorDocument } from "../src/editor/Document";
import { parseSceneText } from "../src/scene/SceneSerializer";
import { checkContent } from "../src/editor/contentCheck";
import { modelCatalog } from "../src/scene/modelCatalog";

test("every template loads, and none has content problems", () => {
  assert.ok(sceneTemplates.length >= 5);
  for (const template of sceneTemplates) {
    const parsed = parseSceneText(JSON.stringify(templateScene(template)));
    assert.equal(parsed.entities.length, template.scene.entities.length, template.id);
    // The editor's own load path (stricter than parsing).
    const doc = new EditorDocument();
    assert.doesNotThrow(() => doc.load(templateScene(template) as never), template.id);
    assert.equal(doc.scene.entityCount, template.scene.entities.length, template.id);
    const issues = checkContent(
      template.scene.entities.map((e, index) => ({ index, name: e.name, components: e.components as never })),
      { modelExists: (id) => modelCatalog.some((m) => m.id === id) },
    );
    assert.deepEqual(issues, [], template.id);
  }
  const players = sceneTemplates.filter((t) => t.scene.entities.some((e) => "Player" in e.components));
  assert.equal(players.length, sceneTemplates.length - 1, "every starter but the empty one has a player");
});

test("templates use real component fields, cameras that follow, and nothing solid below the ground plane", async () => {
  const { defaultComponent } = await import("../src/authoring/CommandInterpreter");
  const plain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
  for (const template of sceneTemplates)
    for (const entity of template.scene.entities) {
      const components = entity.components as Record<string, unknown>;
      for (const [type, value] of Object.entries(components)) {
        let base: unknown;
        try {
          base = defaultComponent(type as never);
        } catch {
          continue;
        }
        // A misspelt field (Health.max for maximum) would load silently and do nothing.
        if (plain(base) && plain(value)) for (const key of Object.keys(value)) assert.ok(key in base, `${template.id} / ${entity.name}: ${type}.${key}`);
      }
      // CameraFollow only steers an entity that has a Camera.
      if (components.CameraFollow) assert.ok(components.Camera, `${template.id} / ${entity.name}: CameraFollow without a Camera`);
      // Every entity is a body unless kinematic, and a body below y = 0 is
      // lifted onto the ground plane on the first tick, shoving whatever
      // stands on it (0.78.0: the starters' ground did exactly that).
      const position = (components.Transform as { position: { y: number } } | undefined)?.position.y ?? 0;
      const height = (components.Scale as { value: { y: number } } | undefined)?.value.y ?? 1;
      const kinematic = (components.RigidBody as { dynamic?: boolean } | undefined)?.dynamic === false;
      if (components.Collider && !kinematic) assert.ok(position - height / 2 > -0.01, `${template.id} / ${entity.name} starts below the ground`);
    }
});
