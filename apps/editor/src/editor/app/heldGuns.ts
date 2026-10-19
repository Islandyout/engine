import * as THREE from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { modelCatalog } from "../../scene/modelCatalog";
import { loadCombatClips } from "../combatView";
import { applyStickLook } from "../fpsView";
import { gunModel, heldGunName, loadoutSlot } from "../gunHold";
import { holdWeapon, weaponGrip } from "../heldWeapons";
import { aimDeviceCode } from "../shooterView";
import { EventFlag, EventKind } from "../weaponFx";
import type { Ctx } from "./context";
import { AnimState, CachedModel } from "./context";

export function installHeldGuns(C: Ctx): void {
  function attachFighter(index: number, object: THREE.Object3D, state: AnimState) {
    if (C.combatClips) {
      C.combat.attach(index, object, state.mixer, state.actions, C.combatClips, state.current);
      return;
    }
    C.waitingFighters.push({ index, object, state });
    loadCombatClips((path) => C.gltfLoader.loadAsync(path)).then(
      (clips) => {
        C.combatClips = clips;
        for (const waiting of C.waitingFighters.splice(0)) if (C.animStates[waiting.index] === waiting.state) C.combat.attach(waiting.index, waiting.object, waiting.state.mixer, waiting.state.actions, clips, waiting.state.current);
      },
      (error) => C.log(`Combat clips failed to load: ${String(error)}`),
    );
  }

  function surfaceAt(x: number, feetY: number, z: number): "grass" | "hard" {
    const ground = C.runtime._editor_terrain_height(x, z);
    return Number.isFinite(ground) && Math.abs(feetY - ground) < 0.25 ? "grass" : "hard";
  }

  function holdFirstPersonWeapons() {
    const entity = C.playerIndex >= 0 ? C.doc.scene.eachAlive()[C.playerIndex] : undefined;
    if (!entity || !C.doc.scene.effectiveHas(entity, "Weapons")) {
      C.weaponFx.setBody(undefined);
      return;
    }
    const mesh = C.doc.scene.resolve(entity, "Renderable")?.mesh ?? 0;
    const id = C.catalogEntry(mesh)?.animated ? mesh : C.firstPersonBodyFallback;
    const material = C.doc.scene.resolve(entity, "Material");
    const apply = (cached: CachedModel) => {
      const root = SkeletonUtils.clone(cached.scene);
      if (material) root.traverse((child) => child instanceof THREE.Mesh && C.materialAppliesTo(child, material) && C.applyMaterial(child, material));
      C.weaponFx.setBody(root, cached.clips);
    };
    const cached = C.catalogCache.get(id);
    if (cached) apply(cached);
    else
      C.loadCatalogModel(id)
        ?.then((loaded) => {
          if (C.doc.mode !== "edit") apply(loaded);
        })
        .catch((error) => C.log(`Catalog model ${id} failed to load: ${String(error)}`));
  }

  function playerWeaponModel(slot?: number): string {
    if (C.playerIndex < 0 || C.runtime._editor_weapon_value(C.playerIndex, 10) <= 0) return "";
    const current = slot ?? C.runtime._editor_weapon_value(C.playerIndex, 0);
    return C.runtime.ccall("editor_weapon_text", "string", ["number", "number", "number"], [C.playerIndex, current, 1]);
  }

  // Once per frame before the ticks: the shooter's stick look (a gamepad,
  // or the touch controls' look area), then the crosshair ray from the
  // camera and the muzzle for this frame's shots, and aim assist.
  function updateShooterAim(dt: number) {
    C.tps.meleeInHand =
      C.playerIndex >= 0 &&
      C.runtime._editor_weapon_value(C.playerIndex, 10) > 0 &&
      (C.runtime.ccall("editor_weapon_text", "string", ["number", "number", "number"], [C.playerIndex, C.runtime._editor_weapon_value(C.playerIndex, 0), 3]) as string) !== "";
    if (!C.shooterActive()) {
      C.runtime._editor_set_aim(0, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1);
      C.tps.over = -1;
      C.tps.lookScale = 1;
      return;
    }
    const zoom = 1 + ((C.runtime._editor_weapon_value(C.playerIndex, 9) || 1) - 1) * C.tps.view.aimBlend;
    if (C.padSnapshot) {
      // Any stick or button marks the pad (or the touch controls) as what
      // the player aims with.
      if (C.padSnapshot.axes.some((a) => Math.abs(a) > 0.15) || C.padSnapshot.buttons.some(Boolean)) C.tps.view.device = C.touchControls?.pad.active ? "touch" : "gamepad";
      const swap = !!C.padSnapshot.buttons[14];
      if (swap && !C.tps.padSwap) C.tps.view.swapShoulder();
      C.tps.padSwap = swap;
      const x = C.padSnapshot.axes[2] ?? 0,
        y = C.padSnapshot.axes[3] ?? 0;
      applyStickLook(C.tps.view, x, y, dt, C.playerSettings.sensitivity * zoom * C.tps.lookScale, C.playerSettings.invertY);
    }
    if (!C.tps.view.ready) return;
    const origin = C.tps.camera.position;
    const direction = C.tps.view.aimDirection();
    const muzzle = C.gunPoses.get(C.playerIndex)?.pose.muzzleWorld(new THREE.Vector3());
    C.runtime._editor_set_aim(origin.x, origin.y, origin.z, direction.x, direction.y, direction.z, muzzle?.x ?? 0, muzzle?.y ?? 0, muzzle?.z ?? 0, muzzle ? 1 : 0, 0);
    const aiming = C.runtime._editor_weapon_value(C.playerIndex, 7) === 1;
    const moving = C.runtime._editor_controller_value(C.playerIndex, 4) > 0.5;
    C.runtime._editor_aim_assist(aimDeviceCode[C.tps.view.device], C.tps.view.lookSpeed, moving ? 1 : 0, aiming && !C.tps.aimWasDown ? 1 : 0, dt);
    C.tps.aimWasDown = aiming;
    C.tps.over = C.runtime._editor_aim_assist_value(4);
    if (C.playerSettings.aimAssist) {
      C.tps.lookScale = C.runtime._editor_aim_assist_value(0);
      C.tps.view.look(C.runtime._editor_aim_assist_value(1), C.runtime._editor_aim_assist_value(2));
    } else C.tps.lookScale = 1;
    // For tests, like data-camera: the view, the hostile under the
    // crosshair, the held gun, the shoulder, and this Play's hits and kills.
    const held = C.gunPoses.get(C.playerIndex);
    C.viewport.dataset.shooter = [C.tps.view.yaw.toFixed(4), C.tps.view.pitch.toFixed(4), C.tps.view.aimBlend.toFixed(2), C.tps.over, held?.pose.holding?.name ?? "", C.tps.view.shoulder, C.tps.hits, C.tps.kills, C.tps.view.device].join(",");
  }

  // A kit/weapons blade or shield in one hand (heldWeapons.ts), for a
  // Weapons slot; a fighter takes the stance that goes with it.
  function placeHand(index: number, held: { rest: THREE.Object3D; object: THREE.Object3D; holders: THREE.Object3D[]; hands: string }, side: "l" | "r", name: string, twoHanded: boolean) {
    const entry = modelCatalog.find((m) => m.path === `./kit/weapons/${name}.glb`);
    if (!entry) {
      if (!C.missingGuns.has(name)) {
        C.missingGuns.add(name);
        C.log(`Weapons: no weapon model named "${name}" in kit/weapons (melee= or offhand=), so that hand stays empty.`);
      }
      return;
    }
    let grip = weaponGrip(entry.path);
    if (grip.grip === "twohand" && !twoHanded) grip = { ...grip, grip: "forward", offHand: undefined };
    const hands = held.hands;
    const place = (model: CachedModel) => {
      if (held.hands !== hands) return;
      const holder = holdWeapon(held.rest, held.object, side, model.scene, grip);
      if (!holder) return;
      held.holders.push(holder);
      if (!C.combat.has(index)) return;
      if (grip.grip === "shield") C.combat.arm(index, "shield");
      else if (grip.clips === "sword") C.combat.arm(index, "blade");
    };
    const ready = C.catalogCache.get(entry.id);
    if (ready) place(ready);
    else C.loadCatalogModel(entry.id)?.then(place, (error) => C.log(`Catalog model ${entry.id} failed to load: ${String(error)}`));
  }

  function updateGunPoses(dt: number) {
    const now = performance.now();
    C.tps.kick *= Math.exp(-dt * 14);
    let holding = 0,
      gap = 0;
    for (const [i, held] of C.gunPoses) {
      const object = C.objects[i];
      const entity = C.doc.scene.eachAlive()[i];
      if (!object || !object.visible || !entity) continue;
      // Which gun: the weapon in hand in Play; before Play a soldier shows its
      // loadout's first, but a Player's hands are empty until it picks something up.
      const isPlayer = !!C.doc.scene.resolve(entity, "Player");
      const playing = C.doc.mode !== "edit" && C.runtime._editor_weapon_value(i, 10) > 0;
      const slot = playing ? C.runtime._editor_weapon_value(i, 0) : 0;
      const text = (field: number) => C.runtime.ccall("editor_weapon_text", "string", ["number", "number", "number"], [i, slot, field]) as string;
      const weapons = C.doc.scene.resolve(entity, "Weapons");
      // (No Weapons component, no loadout: a Melee or ThirdPerson character holds nothing.)
      const slot0 = isPlayer || !weapons ? { gun: "", melee: "", offhand: "" } : loadoutSlot(weapons.loadout);
      const melee = playing ? text(3) : slot0.melee;
      const offhand = playing ? text(4) : slot0.offhand;
      const name = melee ? "" : playing ? heldGunName(text(1), text(2)) : slot0.gun;
      // The slot's blade and off-hand weapon, swapped in when it changes.
      if (`${melee}|${offhand}` !== held.hands) {
        held.hands = `${melee}|${offhand}`;
        for (const holder of held.holders) holder.removeFromParent();
        held.holders = [];
        held.oneHanded = !!offhand || (C.doc.scene.resolve(entity, "Melee")?.leftHand ?? 0) > 0;
        if (C.combat.has(i)) C.combat.arm(i, "unarmed", true);
        if (melee && melee !== "fists") placeHand(i, held, "r", melee, !offhand);
        if (offhand) placeHand(i, held, "l", offhand, false);
      }
      for (const blade of held.blades ?? []) blade.visible = !name;
      if (name !== held.gun) {
        held.gun = name;
        held.pose.setGun(undefined);
        const entry = modelCatalog.find((m) => m.path === `./kit/weapons/${name}.glb`);
        if (!entry) {
          if (name && !C.missingGuns.has(name)) {
            C.missingGuns.add(name);
            C.log(`Weapons: no gun model named "${name}" in kit/weapons (held=), so nothing is drawn in the hands.`);
          }
        } else {
          const place = (model: CachedModel) => {
            if (held.gun !== name) return;
            const gun = gunModel(name, model.scene);
            if (gun) held.pose.setGun(gun);
            else C.log(`Weapons: ${name}.glb has no offhand/muzzle sockets (tools/models/import_weapons.mjs).`);
          };
          const ready = C.catalogCache.get(entry.id);
          if (ready) place(ready);
          else C.loadCatalogModel(entry.id)?.then(place, (error) => C.log(`Catalog model ${entry.id} failed to load: ${String(error)}`));
        }
      }
      if (!held.pose.holding) continue;
      const player = i === C.playerIndex && C.shooterActive();
      const soldierMode = C.runtime._editor_soldier_value(i, 0);
      let aimPoint: THREE.Vector3;
      let raise: number;
      if (player) {
        aimPoint = C.tps.camera.position.clone().addScaledVector(C.tps.view.aimDirection(), 25);
        raise = C.runtime._editor_weapon_value(i, 7) === 1 || now - C.tps.lastFire < 1200 ? 1 : 0;
      } else {
        const yaw = soldierMode >= 0 ? C.runtime._editor_soldier_value(i, 1) : object.rotation.y;
        aimPoint = object.position.clone().add(new THREE.Vector3(Math.sin(yaw) * 20, 0.3, Math.cos(yaw) * 20));
        raise = soldierMode === 2 ? 1 : 0;
      }
      held.raised += (raise - held.raised) * (1 - Math.exp(-dt * 10));
      held.kick *= Math.exp(-dt * 14);
      const sprinting = player && C.runtime._editor_controller_value(i, 5) === 1 ? 1 - held.raised : 0;
      // A fighter's gun only takes over the arm while raised; its clips
      // move the arm (and the gun in its hand) otherwise.
      // (A fighter with only a gun in hand, from a loadout with melee slots,
      // holds it like any shooter.)
      const fighter = C.combat.has(i) && held.oneHanded;
      held.pose.update(dt, {
        hold: fighter ? held.raised : 1,
        oneHanded: held.oneHanded,
        aimPoint,
        aim: held.raised,
        sprint: sprinting,
        reload: playing ? C.runtime._editor_weapon_value(i, 3) : -1,
        equip: playing ? C.runtime._editor_weapon_value(i, 6) : -1,
        kick: held.kick,
      });
      holding++;
      gap = Math.max(gap, held.pose.gap.left, held.pose.gap.right);
    }
    // For tests: how many characters hold a gun, and the worst hand gap.
    let hands = 0;
    for (const held of C.gunPoses.values()) hands += held.holders.length;
    C.viewport.dataset.hands = String(hands);
    if (C.gunPoses.size) C.viewport.dataset.guns = `${holding},${gap.toFixed(3)},${C.gunPoses.size}`;
    else delete C.viewport.dataset.guns;
  }

  // Drains this frame's weapon events into effects, sounds, recoil and HUD.
  function processCombatEvents() {
    const count = C.runtime._editor_take_weapon_events();
    const at = (i: number, field: number) => C.runtime._editor_weapon_event(i, field);
    let pending: { shooter: number; origin: THREE.Vector3; direction: THREE.Vector3; hits: number } | undefined;
    const listener = C.viewCamera.getWorldPosition(new THREE.Vector3());
    const distanceVolume = (point: THREE.Vector3) => 1 / (1 + point.distanceTo(listener) / 10);
    const muzzleOf = (index: number, origin: THREE.Vector3, direction: THREE.Vector3) =>
      index === C.playerIndex && C.firstPerson()
        ? C.weaponFx.muzzleWorld(C.fps.camera, new THREE.Vector3())
        : (C.gunPoses.get(index)?.pose.muzzleWorld(new THREE.Vector3()) ?? origin.clone().addScaledVector(direction, 0.5));
    const finishShot = () => {
      if (pending && pending.hits === 0)
        C.weaponFx.tracer(muzzleOf(pending.shooter, pending.origin, pending.direction), pending.origin.clone().addScaledVector(pending.direction, 80));
      pending = undefined;
    };
    for (let i = 0; i < count; i++) {
      const kind = at(i, 0),
        shooter = at(i, 1),
        target = at(i, 2),
        value = at(i, 9),
        flags = at(i, 10);
      const point = new THREE.Vector3(at(i, 3), at(i, 4), at(i, 5));
      const normal = new THREE.Vector3(at(i, 6), at(i, 7), at(i, 8));
      const mine = shooter === C.playerIndex;
      switch (kind) {
        case EventKind.fire: {
          finishShot();
          pending = { shooter, origin: point, direction: normal, hits: 0 };
          const held = C.gunPoses.get(shooter);
          if (held) held.kick = 1;
          const model = C.runtime.ccall("editor_weapon_text", "string", ["number", "number", "number"], [shooter, flags, 1]);
          if (mine) {
            C.weaponFx.fire(value);
            C.sounds().gunshot(model);
            // Recoil climbs the aim; aiming halves it.
            const aimed = C.runtime._editor_weapon_value(C.playerIndex, 7) === 1;
            const look = C.shooterActive() ? C.tps.view : C.fps.look;
            look.pitch = Math.min(1.2, look.pitch + THREE.MathUtils.degToRad(value) * (aimed ? 0.4 : 0.7));
            look.yaw += THREE.MathUtils.degToRad(value) * 0.3 * (Math.random() - 0.5);
            C.tps.kick = 1;
            C.tps.lastFire = performance.now();
          } else C.soundsAt(point).gunshot(model);
          C.weaponFx.muzzleFlashAt(muzzleOf(shooter, point, normal));
          break;
        }
        case EventKind.impact: {
          const flesh = (flags & EventFlag.flesh) !== 0;
          C.weaponFx.impact(point, normal, flesh);
          if (pending && pending.shooter === shooter) {
            C.weaponFx.tracer(muzzleOf(shooter, pending.origin, pending.direction), point);
            pending.hits++;
          }
          C.soundsAt(point, 0.6).impact(flesh);
          break;
        }
        case EventKind.damaged: {
          const killed = (flags & EventFlag.killed) !== 0;
          if (mine && target !== C.playerIndex) {
            C.tps.hits++;
            if (killed) C.tps.kills++;
            C.uiFeed.hitAt = performance.now() / 1000;
            if (killed) C.uiFeed.killAt = C.uiFeed.hitAt;
            C.uiFeed.damage.push({ point: point.clone(), amount: value, crit: (flags & EventFlag.headshot) !== 0, at: C.uiFeed.hitAt });
            C.weaponFx.hit(killed, (flags & EventFlag.headshot) !== 0);
            C.sounds().hitmarker(killed);
          }
          if (killed) C.uiFeed.kills.push({ killer: C.entityLabel(shooter), victim: C.entityLabel(target), mine, at: performance.now() / 1000 });
          if (target === C.playerIndex && C.playerIndex >= 0) {
            const body = C.objects[C.playerIndex];
            if (body) C.weaponFx.hurt(point, body.position, C.fps.look.yaw, value);
            C.sounds().hurt();
            C.shake.intensity = Math.max(C.shake.intensity, 0.04);
            C.shake.duration = C.shake.remaining = 0.2;
          }
          break;
        }
        case EventKind.reload:
          if (mine) {
            if (playerWeaponModel(flags) === "shotgun") C.sounds().shell();
            else C.sounds().reload(value);
          }
          break;
        case EventKind.empty:
          if (mine) C.sounds().dryFire();
          break;
        case EventKind.switched:
          if (mine) {
            C.weaponFx.equip(playerWeaponModel(flags));
            C.sounds().equip();
          }
          break;
        case EventKind.explode: {
          C.weaponFx.explosion(point, value);
          const volume = distanceVolume(point);
          C.soundsAt(point).explosion();
          C.shake.intensity = Math.max(C.shake.intensity, 0.35 * volume);
          C.shake.duration = C.shake.remaining = 0.5;
          break;
        }
      }
    }
    finishShot();
  }
  Object.assign(C, { attachFighter, surfaceAt, holdFirstPersonWeapons, playerWeaponModel, updateShooterAim, updateGunPoses, processCombatEvents });
}
