import * as THREE from "three";
import type {
	CameraComponent,
	CameraFollowComponent
} from "../../scene/Components";
import { EntityField } from "../bridgeFields";
import type { Ctx } from "./context";

export function installCameras(C: Ctx): void {
  // (A melee slot in hand fights with the usual camera instead.)
  function shooterActive(): boolean {
    if (C.doc.mode === "edit" || C.playerIndex < 0 || playerController()?.mode !== "ThirdPerson" || C.tps.meleeInHand) return false;
    return C.runtime._editor_weapon_value(C.playerIndex, 10) > 0 && C.runtime._editor_controlled_player() === C.playerIndex;
  }

  function playerController() {
    if (C.playerIndex < 0) return undefined;
    const entity = C.doc.scene.eachAlive()[C.playerIndex];
    return entity ? C.doc.scene.resolve(entity, "CharacterController") : undefined;
  }

  function firstPerson() {
    return C.doc.mode !== "edit" && playerController()?.mode === "FirstPerson" && C.runtime._editor_alive(C.playerIndex) === 1;
  }

  function playerFeet(target: THREE.Vector3) {
    return target.set(
      C.runtime._editor_value(C.playerIndex, EntityField.x),
      C.runtime._editor_controller_value(C.playerIndex, 6),
      C.runtime._editor_value(C.playerIndex, EntityField.z),
    );
  }

  function placeFirstPerson(dt: number): THREE.PerspectiveCamera {
    const settings = playerController()!;
    const alpha = Math.min(1, C.accumulator * 60);
    const feet = C.fps.previous.clone().lerp(C.fps.current, alpha);
    const offsets = C.fps.view.step(dt, {
      speed: C.runtime._editor_controller_value(C.playerIndex, 4),
      grounded: C.runtime._editor_controller_value(C.playerIndex, 2) === 1,
      landingSpeed: C.fpsLanding,
      eyeHeight: C.runtime._editor_controller_value(C.playerIndex, 0),
      sprinting: C.runtime._editor_controller_value(C.playerIndex, 5) === 1,
      headBob: settings.headBob,
    });
    C.fpsLanding = 0;
    const view = C.fps.camera;
    view.aspect = C.viewport.clientWidth / Math.max(C.viewport.clientHeight, 1);
    const aiming = C.runtime._editor_weapon_value(C.playerIndex, 7) === 1;
    C.zoomBlend += ((aiming ? 1 : 0) - C.zoomBlend) * (1 - Math.exp(-dt * 14));
    const zoom = C.runtime._editor_weapon_value(C.playerIndex, 10) > 0 ? C.runtime._editor_weapon_value(C.playerIndex, 9) : 1;
    view.fov = (settings.fov + offsets.fovAdd * (1 - C.zoomBlend)) * (1 + (zoom - 1) * C.zoomBlend);
    view.updateProjectionMatrix();
    view.rotation.set(C.fps.look.pitch + C.weaponFx.punch, C.fps.look.yaw, offsets.roll, "YXZ");
    view.position.set(feet.x, feet.y + offsets.eyeHeight + offsets.y, feet.z);
    view.position.addScaledVector(new THREE.Vector3(1, 0, 0).applyQuaternion(view.quaternion), offsets.x);
    // The player's own body would fill the view.
    const body = C.objects[C.playerIndex];
    if (body) body.visible = false;
    return view;
  }

  function deathView() {
    return C.doc.mode !== "edit" && playerController()?.mode === "FirstPerson" && C.playerIndex >= 0 && C.runtime._editor_alive(C.playerIndex) === 0;
  }

  function placeDeathView(dt: number): THREE.PerspectiveCamera {
    const view = C.fps.camera;
    C.deathRoll = Math.min(1, C.deathRoll + dt * 1.5);
    const ease = 1 - (1 - C.deathRoll) * (1 - C.deathRoll);
    view.position.set(C.fps.current.x, C.fps.current.y + 1.6 - ease * 1.3, C.fps.current.z);
    view.rotation.set(C.fps.look.pitch * (1 - ease) - ease * 0.25, C.fps.look.yaw, ease * 0.9, "YXZ");
    view.aspect = C.viewport.clientWidth / Math.max(C.viewport.clientHeight, 1);
    view.updateProjectionMatrix();
    return view;
  }

  function gameCamera(): THREE.Camera | undefined {
    if (C.doc.mode === "edit") return undefined;
    if (firstPerson()) return placeFirstPerson(C.rig.frameDt);
    if (deathView()) return placeDeathView(C.rig.frameDt);
    if (shooterActive() && C.objects[C.playerIndex]) return placeShooterCamera(C.rig.frameDt);
    let best: { component: CameraComponent; index: number } | undefined;
    C.doc.scene.eachAlive().forEach((entity, index) => {
      const component = C.doc.scene.resolve(entity, "Camera");
      if (!component || !C.objects[index] || !C.runtime._editor_alive(index)) return;
      if (!best || component.priority > best.component.priority) best = { component, index };
    });
    if (!best) return undefined;
    const { component, index } = best;
    const aspect = C.viewport.clientWidth / Math.max(C.viewport.clientHeight, 1);
    const view =
      component.projection === "Perspective"
        ? Object.assign(C.gamePerspective, { fov: component.fov, aspect })
        : Object.assign(C.gameOrthographic, {
            left: -component.orthoSize * aspect,
            right: component.orthoSize * aspect,
            top: component.orthoSize,
            bottom: -component.orthoSize,
          });
    view.near = component.near;
    view.far = component.far;
    view.updateProjectionMatrix();
    const anchor = C.objects[index]!;
    // The camera entity's own placeholder would sit in (or block) the view;
    // rebuild() on Stop restores its visibility.
    anchor.visible = false;
    const follow = C.doc.scene.resolve(C.doc.scene.eachAlive()[index]!, "CameraFollow");
    const target = follow ? followTarget(follow.target) : undefined;
    if (follow && target) placeRig(view, follow, target);
    else if (!C.spaceView?.flight.piloting) {
      anchor.updateWorldMatrix(true, false);
      anchor.getWorldPosition(view.position);
      anchor.getWorldQuaternion(view.quaternion);
    }
    // Flying: the chase camera behind the ship (mouse-drag looks around).
    if (C.spaceView && view instanceof THREE.PerspectiveCamera) {
      const ship = C.shipIndex >= 0 ? C.objects[C.shipIndex] : undefined;
      if (C.spaceView.flight.piloting && ship) C.spaceView.placeShipCamera(view, ship, C.rig.frameDt);
      view.far = Math.max(view.far, 20000);
      view.updateProjectionMatrix();
    }
    return view;
  }

  function followTarget(name: string): THREE.Object3D | undefined {
    if (!name) return C.playerIndex >= 0 ? C.objects[C.playerIndex] : undefined;
    const index = C.doc.scene.eachAlive().findIndex((e) => C.doc.scene.resolve(e, "Name")?.value === name);
    return index >= 0 && C.runtime._editor_alive(index) ? C.objects[index] : undefined;
  }

  function placeRig(view: THREE.Camera, follow: CameraFollowComponent, target: THREE.Object3D) {
    // Track horizontal world-space movement, not facing rotation: strafing and
    // backing up should make the chase camera reveal the direction of travel.
    const delta = target.position.clone().sub(C.rig.lastTargetPosition);
    delta.y = 0;
    if (C.rig.lastTarget !== target || !C.rig.placed) {
      C.rig.lastTarget = target;
      C.rig.lastTargetPosition.copy(target.position);
      C.rig.movementSpeed = 0;
      C.rig.movementDirection.set(0, 0, 0);
    } else {
      const dt = Math.max(C.rig.frameDt, 1 / 240);
      const distanceMoved = delta.length();
      const hasMovement = distanceMoved > 0.002;
      const instantSpeed = hasMovement ? distanceMoved / dt : 0;
      C.rig.movementSpeed += (instantSpeed - C.rig.movementSpeed) * (1 - Math.exp(-dt * 8));
      if (hasMovement) C.rig.movementDirection.copy(delta).normalize();
      C.rig.lastTargetPosition.copy(target.position);
    }
    const focus = target.position.clone();
    focus.y += follow.lookHeight;
    let distance = Math.hypot(follow.offset.x, follow.offset.y, follow.offset.z);
    // Following an arcade car: the rig trails its heading with a
    // little lag (a drift shows the car's flank), pulls back with speed,
    // and the field of view opens up with speed and nitro.
    const carIndex = C.objects.indexOf(target);
    const car = carIndex >= 0 && C.runtime._editor_vehicle_value(carIndex, 11) ? C.carView(carIndex) : undefined;
    if (car) distance *= 1 + 0.22 * Math.min(1, car.speed / 50);
    if (view instanceof THREE.PerspectiveCamera) {
      const wanted = car ? 16 * Math.min(1, car.speed / 60) + (car.boosting ? 8 : 0) : 0;
      C.rig.fovExtra += (wanted - C.rig.fovExtra) * (1 - Math.exp(-C.rig.frameDt * 3));
      view.fov += C.rig.fovExtra;
      view.updateProjectionMatrix();
    }
    // Melee lock-on: the rig swings behind the Player toward its
    // locked-on opponent and frames both, a little over the right shoulder
    // so the Player never hides the opponent.
    const lock = target === C.objects[C.playerIndex] ? C.combat.lockTarget() : -1;
    const opponent = lock >= 0 && C.runtime._editor_alive(lock) ? C.objects[lock] : undefined;
    if (opponent && C.rig.placed) {
      const behind = Math.atan2(target.position.x - opponent.position.x, target.position.z - opponent.position.z) - 0.4;
      const turn = Math.atan2(Math.sin(behind - C.rig.yaw), Math.cos(behind - C.rig.yaw));
      C.rig.yaw += turn * (1 - Math.exp(-C.rig.frameDt * 5));
      focus.lerp(opponent.position.clone().setY(focus.y), 0.15);
      distance *= 1 + Math.min(0.35, target.position.distanceTo(opponent.position) / 14);
    } else if (!C.rig.placed) {
      // Start from the authored offset, in the target's frame.
      C.rig.yaw = Math.atan2(follow.offset.x, follow.offset.z) + target.rotation.y;
      C.rig.pitch = Math.asin(THREE.MathUtils.clamp(follow.offset.y / Math.max(distance, 1e-6), -1, 1));
    } else if (C.rig.movementSpeed > 0.65) {
      // Auto-chase while the player is moving, even when orbit is enabled.
      // Faster travel turns the rig more decisively; the exponential blend is
      // frame-rate independent and keeps diagonal/sideways starts smooth.
      const travelYaw = Math.atan2(-C.rig.movementDirection.x, -C.rig.movementDirection.z);
      const turn = Math.atan2(Math.sin(travelYaw - C.rig.yaw), Math.cos(travelYaw - C.rig.yaw));
      const speedBlend = THREE.MathUtils.clamp(C.rig.movementSpeed / 12, 0, 1);
      const response = 3.5 + speedBlend * 8.5;
      C.rig.yaw += turn * (1 - Math.exp(-C.rig.frameDt * response));
    } else if (!follow.orbit) {
      // Without orbit the rig swings behind the target as it turns.
      const behind = Math.atan2(follow.offset.x, follow.offset.z) + target.rotation.y;
      if (car) {
        const turn = Math.atan2(Math.sin(behind - C.rig.yaw), Math.cos(behind - C.rig.yaw));
        C.rig.yaw += turn * (1 - Math.exp(-C.rig.frameDt * 7));
      } else C.rig.yaw = behind;
    }
    // At speed, aim farther along the camera's smoothed travel heading so the
    // player can read the road/obstacles ahead instead of staring at their back.
    const lookAhead = Math.min(5, Math.max(0, C.rig.movementSpeed - 0.65) * 0.18);
    focus.x -= Math.sin(C.rig.yaw) * lookAhead;
    focus.z -= Math.cos(C.rig.yaw) * lookAhead;
    const desired = new THREE.Vector3(Math.sin(C.rig.yaw) * Math.cos(C.rig.pitch), Math.sin(C.rig.pitch), Math.cos(C.rig.yaw) * Math.cos(C.rig.pitch))
      .multiplyScalar(distance)
      .add(target.position);
    if (follow.collision) {
      const toCamera = desired.clone().sub(focus).normalize();
      const blocked = cameraBlock(focus, desired, target, view);
      if (blocked !== undefined) desired.copy(focus).addScaledVector(toCamera, Math.max(0.3, blocked - 0.3));
    }
    if (!C.rig.placed || follow.smoothing <= 0) C.rig.position.copy(desired);
    else C.rig.position.lerp(desired, 1 - Math.exp(-C.rig.frameDt / follow.smoothing));
    C.rig.placed = true;
    view.position.copy(C.rig.position);
    view.lookAt(focus);
  }

  // How far along from `from` to `to` the first thing other than `target`
  // is in the way of a camera; undefined when nothing is.
  function cameraBlock(from: THREE.Vector3, to: THREE.Vector3, target: THREE.Object3D, view: THREE.Camera): number | undefined {
    const toCamera = to.clone().sub(from);
    const length = toCamera.length();
    if (length < 1e-4) return undefined;
    C.rigRaycaster.set(from, toCamera.normalize());
    C.rigRaycaster.far = length;
    // Sprites (car light glows) need a camera to be raycast.
    C.rigRaycaster.camera = view;
    // Only objects whose bounds reach the camera's line are raycast (a
    // town is hundreds of objects; most are nowhere near it).
    const blockers = C.objects.filter((o) => {
      if (o === target || !o.visible) return false;
      let radius = o.userData.blockRadius as number | undefined;
      if (radius === undefined) {
        new THREE.Box3().setFromObject(o).getBoundingSphere(C.blockSphere);
        radius = C.blockSphere.radius + C.blockSphere.center.distanceTo(o.position);
        o.userData.blockRadius = Number.isFinite(radius) ? radius / Math.max(o.scale.x, o.scale.y, o.scale.z, 1e-6) : Infinity;
        radius = o.userData.blockRadius as number;
      }
      radius *= Math.max(o.scale.x, o.scale.y, o.scale.z);
      C.blockSegment.set(from, to);
      C.blockSegment.closestPointToPoint(o.position, true, C.blockPoint);
      return C.blockPoint.distanceTo(o.position) < radius + 1;
    });
    return C.rigRaycaster.intersectObjects(blockers, true)[0]?.distance;
  }

  // The shooter's over-the-shoulder view (shooterView.ts). Its field of view
  // and far plane come from the scene's Camera, if it has one.
  function placeShooterCamera(dt: number): THREE.PerspectiveCamera {
    const body = C.objects[C.playerIndex]!;
    const view = C.tps.camera;
    let fov = 62;
    let best = -Infinity;
    for (const entity of C.doc.scene.eachAlive()) {
      const camera = C.doc.scene.resolve(entity, "Camera");
      if (camera && camera.projection === "Perspective" && camera.priority > best) {
        best = camera.priority;
        fov = camera.fov;
        view.far = camera.far;
      }
    }
    view.aspect = C.viewport.clientWidth / Math.max(C.viewport.clientHeight, 1);
    const height = playerController()?.standHeight ?? 1.8;
    if (!C.tps.view.ready) C.tps.view.reset(body.rotation.y);
    const feet = body.position.clone();
    feet.y -= height / 2;
    C.tps.view.place(view, feet, {
      height,
      aiming: C.runtime._editor_weapon_value(C.playerIndex, 7) === 1,
      zoom: C.runtime._editor_weapon_value(C.playerIndex, 9) || 1,
      fov,
      dt,
      clear: (from, to) => cameraBlock(from, to, body, view),
    });
    return view;
  }

  function applyShake(view: THREE.Camera, dt: number) {
    if (C.shake.remaining <= 0) return;
    C.shake.remaining = Math.max(0, C.shake.remaining - dt);
    if (!C.playerSettings.shake) return;
    const amount = C.shake.intensity * (C.shake.remaining / C.shake.duration);
    view.position.x += (Math.random() * 2 - 1) * amount;
    view.position.y += (Math.random() * 2 - 1) * amount;
    view.position.z += (Math.random() * 2 - 1) * amount;
  }
  Object.assign(C, { shooterActive, playerController, firstPerson, playerFeet, gameCamera, applyShake });
}
