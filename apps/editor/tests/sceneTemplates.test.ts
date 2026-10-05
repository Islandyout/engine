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
