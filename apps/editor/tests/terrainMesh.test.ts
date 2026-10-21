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
    for (let z = -100; z < 100; z += 10) instances.push({ model: x % 20 === 0 ? 1 : 2, x, y: 0, z, scale: 1, yaw: 0, collide: false });
  const group = buildScatter(instances, models);
  const meshes = group.children as THREE.InstancedMesh[];
  assert.equal(
    meshes.reduce((sum, mesh) => sum + mesh.count, 0),
    instances.length,
    "every instance is placed once",
  );
  assert.ok(meshes.length > 2, "split into chunks");
  const position = new THREE.Vector3(),
    matrix = new THREE.Matrix4();
  for (const mesh of meshes) {
    const cells = new Set<string>();
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix);
      position.setFromMatrixPosition(matrix);
      const size = mesh.userData.chunkSize as number;
      assert.ok(size >= scatterChunkSize && size <= scatterChunkSize * 8);
      cells.add(`${Math.floor(position.x / size)},${Math.floor(position.z / size)}`);
    }
    assert.equal(cells.size, 1, "a chunk's instances share one cell, so it can be frustum culled");
    const tall = mesh.geometry.parameters.height > 2.5;
    assert.equal(mesh.castShadow, tall, "trees cast shadows, bushes don't");
  }
});

test("terrain vertices carry splat weights: sand low, snow high, rock on slopes, each a share of one", async () => {
  const { shapeTerrain } = await import("../src/editor/terrainMesh");
  const geometry = new THREE.PlaneGeometry(4000, 4000, 4, 4); // wide cells: the height steps below are gentle slopes, not cliffs
  geometry.rotateX(-Math.PI / 2);
  const look = {
    grassColor: { x: 0.2, y: 0.5, z: 0.2 },
    rockColor: { x: 0.4, y: 0.4, z: 0.4 },
    sandColor: { x: 0.8, y: 0.7, z: 0.5 },
    snowColor: { x: 1, y: 1, z: 1 },
    sandHeight: 1,
    snowHeight: 10,
    rockSlope: 0.7,
  };
  const heights = new Float32Array(25);
  heights.fill(5); // flat grass
  heights[0] = -2; // sand
  heights[24] = 14; // snow
  shapeTerrain(geometry, heights, look, 1);
  const splat = geometry.getAttribute("splat") as THREE.BufferAttribute;
  assert.equal(splat.count, 25);
  for (let i = 0; i < splat.count; i++) {
    const total = splat.getX(i) + splat.getY(i) + splat.getZ(i) + splat.getW(i);
    assert.ok(total > 0.999 && total < 1.001, `weights of vertex ${i} sum to one (${total})`);
  }
  assert.ok(splat.getZ(0) > 0.9, "low ground is sand");
  assert.ok(splat.getW(24) > 0.5, "high ground is snow");
  assert.ok(splat.getX(12) > 0.9, "the middle is grass");
});

test("scattered plants sway; rocks and anything unflagged keep the model's own material", () => {
  const model = (sway: boolean) => {
    const scene = new THREE.Group();
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 4, 1), new THREE.MeshStandardMaterial()));
    return { scene, sway };
  };
  const instances: ScatterInstance[] = [
    { model: 1, x: 0, y: 0, z: 0, scale: 1, yaw: 0, collide: false },
    { model: 2, x: 5, y: 0, z: 0, scale: 1, yaw: 0, collide: false },
  ];
  const group = buildScatter(instances, new Map([[1, model(true)], [2, model(false)]]));
  const [plant, rock] = group.children as THREE.InstancedMesh[];
  assert.equal(plant!.material.customProgramCacheKey?.(), "plant-sway");
  assert.notEqual((rock!.material as THREE.Material).customProgramCacheKey?.(), "plant-sway");
});
