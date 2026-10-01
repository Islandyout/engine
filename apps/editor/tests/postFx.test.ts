import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultPostSettings, gradingActive, gradingShader, shadowQualities } from "../src/editor/postFx";
import { EditorDocument } from "../src/editor/Document";

test("default post settings keep the original look; grading only runs when it changes something", () => {
  assert.equal(defaultPostSettings.antialias, "None");
  assert.equal(defaultPostSettings.ambientOcclusion, false);
  assert.equal(defaultPostSettings.bloom, 0.35);
  assert.equal(gradingActive(defaultPostSettings), false);
  assert.equal(gradingActive({ ...defaultPostSettings, vignette: 0.2 }), true);
  assert.ok(shadowQualities.High.mapSize > shadowQualities.Low.mapSize);
  for (const uniform of ["contrast", "saturation", "temperature", "vignette", "grain", "time"])
    assert.ok(uniform in gradingShader.uniforms && gradingShader.fragmentShader.includes(uniform));
});

test("PostProcessing attaches with a polished default and validates ranges", () => {
  const d = new EditorDocument();
  const entity = d.execute({ command: "spawn_entity", name: "Look" }).entity!;
  assert.equal(d.execute({ command: "attach_component", entity, type: "PostProcessing" }).ok, true);
  const attached = d.scene.get(entity, "PostProcessing")!;
  assert.equal(attached.antialias, "SMAA");
  assert.equal(attached.ambientOcclusion, true);
  const bad = d.execute({ command: "set_component", entity, type: "PostProcessing", value: { ...attached, vignette: 2 } });
  assert.equal(bad.ok, false);
  const mode = d.execute({ command: "set_component", entity, type: "PostProcessing", value: { ...attached, antialias: "MSAA" } });
  assert.equal(mode.ok, false);
});
