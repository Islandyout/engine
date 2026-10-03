import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { buildScatter, scatterChunkSize } from "../src/editor/terrainMesh";
import type { ScatterInstance } from "../src/editor/terrain";

test("scatter is instanced in spatial chunks, and only tall models cast shadows", () => {
  const model = (height: number) => {
    const scene = new THREE.Group();
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, height, 1), new THREE.MeshBasicMaterial()));
    return { scene };
  };
  const models = new Map([
    [1, model(8)], // a tree
    [2, model(1)], // a bush
  ]);
  const instances: ScatterInstance[] = [];
  for (let x = -100; x < 100; x += 10)
    for (let z = -100; z < 100; z += 10)
      instances.push({ model: x % 20 === 0 ? 1 : 2, x, y: 0, z, scale: 1, yaw: 0, collide: false });
  const group = buildScatter(instances, models);
  const meshes = group.children as THREE.InstancedMesh[];
  assert.equal(meshes.reduce((sum, mesh) => sum + mesh.count, 0), instances.length, "every instance is placed once");
  assert.ok(meshes.length > 2, "split into chunks");
  const position = new THREE.Vector3(),
    matrix = new THREE.Matrix4();
  for (const mesh of meshes) {
    const cells = new Set<string>();
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix);
      position.setFromMatrixPosition(matrix);
      cells.add(`${Math.floor(position.x / scatterChunkSize)},${Math.floor(position.z / scatterChunkSize)}`);
    }
    assert.equal(cells.size, 1, "a chunk's instances share one cell, so it can be frustum culled");
    const tall = mesh.geometry.parameters.height > 2.5;
    assert.equal(mesh.castShadow, tall, "trees cast shadows, bushes don't");
  }
});
