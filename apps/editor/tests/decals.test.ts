import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";

// Decals paint their textures on a canvas; a stub canvas stands in (the pool is what is tested).
const stubContext = new Proxy({}, { get: (_t, name) => (name === "createRadialGradient" ? () => ({ addColorStop() {} }) : () => undefined), set: () => true });
(globalThis as unknown as { document: unknown }).document = { createElement: () => ({ width: 0, height: 0, getContext: () => stubContext }) };

test("decals are laid on the ground, fade out, and the oldest is reused when the pool is full", async () => {
  const { Decals } = await import("../src/editor/decals");
  const parent = new THREE.Group();
  const decals = new Decals(parent, 3);
  for (let i = 0; i < 3; i++) decals.add("crack", new THREE.Vector3(i, 2, 0), 2);
  assert.equal(decals.visibleCount, 3);
  assert.equal(parent.children.length, 3);
  assert.ok(Math.abs(parent.children[0]!.position.y - 2.03) < 1e-6, "just above the ground");
  decals.add("scorch", new THREE.Vector3(9, 2, 0), 2); // the pool is full: the first one is reused
  assert.equal(parent.children.length, 3);
  assert.equal(parent.children[0]!.position.x, 9);
  decals.update(30); // past their life
  assert.equal(decals.visibleCount, 0);
  decals.add("scuff", new THREE.Vector3(0, 0, 0), 1, 8);
  decals.update(6);
  const shown = parent.children.find((c) => c.visible) as THREE.Mesh;
  const opacity = (shown.material as THREE.MeshBasicMaterial).opacity;
  assert.ok(opacity > 0.5 && opacity < 0.8, `it is fading (${opacity})`);
  decals.clear();
  assert.equal(decals.visibleCount, 0);
});
