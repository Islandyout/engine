import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { LightPool } from "../src/editor/lightPool";

test("past its budget, the light pool lights the scene with the lights nearest the camera", () => {
  const scene = new THREE.Scene();
  const pool = new LightPool(scene, 2);
  const lights = [0, 10, 20, 30].map((x) => {
    const light = new THREE.PointLight(0xff8800, 5, 4);
    light.position.set(x, 0, 0);
    scene.add(light);
    pool.register(light);
    return light;
  });
  pool.update(new THREE.Vector3(19, 0, 0));
  assert.ok(pool.pooling);
  assert.ok(lights.every((l) => !l.visible));
  const lit = scene.children.filter((c): c is THREE.PointLight => c instanceof THREE.PointLight && c.visible && c.intensity > 0);
  assert.deepEqual(lit.map((l) => l.position.x).sort((a, b) => a - b), [10, 20]);
});

test("within its budget, the light pool leaves the lights alone", () => {
  const scene = new THREE.Scene();
  const pool = new LightPool(scene, 4);
  const light = new THREE.PointLight(0xffffff, 1, 5);
  scene.add(light);
  pool.register(light);
  pool.update(new THREE.Vector3());
  assert.ok(!pool.pooling && light.visible);
});
