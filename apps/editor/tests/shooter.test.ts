import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { defaultHeldGun, heldGunName, isHandgun, loadoutGun } from "../src/editor/gunHold";
import { ShooterView } from "../src/editor/shooterView";

test("a loadout's held gun: held= wins, else the model's default", () => {
  assert.equal(heldGunName("rifle", "carbine-2"), "carbine-2");
  assert.equal(heldGunName("pistol", ""), "pistol-1");
  assert.equal(heldGunName("launcher", ""), "");
  assert.equal(loadoutGun("# guns\n\nsmg: model=smg mag=30\nrifle: model=rifle"), defaultHeldGun.smg);
  assert.equal(loadoutGun("a: model=pistol held=revolver-3 rpm=150"), "revolver-3");
  assert.equal(loadoutGun(""), defaultHeldGun.rifle);
  assert.ok(isHandgun("pistol-4") && isHandgun("revolver-1"));
  assert.ok(!isHandgun("rifle-1") && !isHandgun("sniper-6") && !isHandgun("shotgun-sawed-off"));
});

test("the shooter view looks the engine's way and sits over the shoulder", () => {
  const view = new ShooterView();
  // Behind a character facing -z (model yaw PI): the view looks along -z.
  view.reset(Math.PI);
  const d = view.aimDirection();
  assert.ok(Math.abs(d.x) < 1e-9 && d.z < -0.99, `looks along -z: ${d.toArray()}`);
  assert.ok(Math.abs(view.bodyYaw - Math.PI) < 1e-9);
  // Turning left (+yaw) looks toward -x.
  view.look(Math.PI / 2, 0);
  assert.ok(view.aimDirection().x < -0.99);
  view.look(-Math.PI / 2, 0);
  // Pitch is clamped.
  view.look(0, 5);
  assert.equal(view.pitch, 1.2);
  view.look(0, -1.2);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 100);
  const feet = new THREE.Vector3(0, 0, 0);
  for (let i = 0; i < 120; i++) view.place(camera, feet, { height: 1.8, aiming: false, zoom: 0.8, fov: 60, dt: 1 / 60 });
  // Behind (+z), above the feet, and to the character's right (+x when
  // looking along -z).
  assert.ok(camera.position.z > 2 && camera.position.y > 1.5 && camera.position.x > 0.3, `hip: ${camera.position.toArray()}`);
  assert.ok(Math.abs(camera.fov - 60) < 1e-6);
  const hip = camera.position.z;
  for (let i = 0; i < 120; i++) view.place(camera, feet, { height: 1.8, aiming: true, zoom: 0.8, fov: 60, dt: 1 / 60 });
  assert.ok(camera.position.z < hip - 0.8 && camera.fov < 49, `aiming pulls in and zooms: ${camera.position.z}, ${camera.fov}`);
  view.swapShoulder();
  for (let i = 0; i < 120; i++) view.place(camera, feet, { height: 1.8, aiming: true, zoom: 0.8, fov: 60, dt: 1 / 60 });
  assert.ok(camera.position.x < -0.3, `left shoulder: ${camera.position.x}`);
  // A wall behind pulls the camera in front of it.
  view.place(camera, feet, { height: 1.8, aiming: false, zoom: 1, fov: 60, dt: 1, clear: (from, to) => (to.z > from.z ? 0.5 : undefined) });
  assert.ok(camera.position.z < 0.6, `kept in front of the wall: ${camera.position.z}`);
});
