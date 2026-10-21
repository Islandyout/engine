import { wind } from "../terrainMesh";
import { accessibility } from "../uiKit";
import { makeProjectile, updateProjectile } from "../projectileView";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type {
	EntityRef
} from "../../scene/Components";
import { groundSpeed, pickClipName } from "../animationClips";
import { EntityField } from "../bridgeFields";
import { applyStickLook } from "../fpsView";
import { CHARACTER_DRAW_DISTANCE, crowdNear } from "../frameGovernor";
import { applyGesture, findGestureBones, gestureFor } from "../gestures";
import { updateHeldWeapons } from "../heldWeapons";
import {
	isTouchDevice
} from "../playerSettings";
import { activityAliases, routineActivity } from "../routineActivity";
import { setSignalHeads, type SignalHeads } from "../signalHeads";
import { updateScatterLod } from "../terrainMesh";
import type { Ctx } from "./context";
import { AnimState } from "./context";

export function installFrame(C: Ctx): void {
  // Resting activities. A Routine stop may name one ("6 120 40
  // sit"): the clip to play once there, if the model has it (a few
  // aliases help). Two people standing close turn to each other and talk.
  // Calm animals graze, on and off.
  function firstClip(state: AnimState, wanted: string[]) {
    return wanted.find((name) => state.actions.has(name));
  }

  function restingClip(i: number, state: AnimState, entity: EntityRef | undefined, object: THREE.Object3D, tickDt: number): string | undefined {
    const routine = entity ? C.doc.scene.resolve(entity, "Routine") : undefined;
    if (routine) {
      const activity = routineActivity(routine.stops, C.runtime._editor_routine_stop(i));
      const clip = activity ? firstClip(state, activityAliases[activity] ?? [activity]) : undefined;
      if (clip) return clip;
    }
    if (state.actions.has("talk") && (routine || (entity && C.doc.scene.effectiveHas(entity, "Pedestrian")))) {
      // The nearest other resting talker within 2.5 m.
      let partner: THREE.Vector3 | undefined;
      let best = 2.5;
      for (const j of C.talkerIndices) {
        if (j === i || !C.talkerWasResting.has(j)) continue;
        const other = C.tickStates[j]?.current ?? C.objects[j]?.position;
        if (!other) continue;
        const d = Math.hypot(other.x - object.position.x, other.z - object.position.z);
        if (d < best) {
          best = d;
          partner = other;
        }
      }
      C.talkerResting.add(i);
      if (partner) {
        const yaw = Math.atan2(partner.x - object.position.x, partner.z - object.position.z);
        const turn = Math.atan2(Math.sin(yaw - object.rotation.y), Math.cos(yaw - object.rotation.y));
        object.rotation.y += Math.max(-4 * tickDt, Math.min(4 * tickDt, turn));
        return "talk";
      }
    }
    if (C.runtime._editor_wildlife_state(i) === 0) {
      // Head down for a while, up for a while, each animal on its own beat.
      const grazing = (performance.now() / 1000 + i * 1.7) % 11 < 7;
      if (grazing) return firstClip(state, activityAliases.graze!);
    }
    return undefined;
  }

  function updateMouseStick(dt: number) {
    const f = C.spaceView?.flight;
    const flying = !!f && C.doc.mode === "play" && f.piloting && !f.landed;
    const available = flying && C.playerSettings.flightMouse === "steer" && !isTouchDevice();
    const active = available && document.pointerLockElement === C.renderer.domElement;
    if (C.spaceView) {
      C.spaceView.stick.available = available;
      C.spaceView.stick.active = active;
    }
    // Landing or leaving the pilot's seat hands the mouse back.
    if (!available && C.mouseStick.locked && document.pointerLockElement === C.renderer.domElement) C.releasePointer();
    C.mouseStick.locked = active;
    if (!active) {
      C.mouseStick.x = C.mouseStick.y = 0;
      if (C.mouseStick.sent) C.runtime._editor_space_stick(0, 0);
      C.mouseStick.sent = false;
      return;
    }
    C.mouseStick.idle += dt;
    if (C.mouseStick.idle > 0.25) {
      const k = Math.exp(-dt * 1.2);
      C.mouseStick.x *= k;
      C.mouseStick.y *= k;
    }
    const dead = C.spaceView!.stick.deadzone;
    const shape = (v: number) => (Math.abs(v) < dead ? 0 : Math.sign(v) * ((Math.abs(v) - dead) / (1 - dead)));
    C.spaceView!.stick.x = C.mouseStick.x;
    C.spaceView!.stick.y = C.mouseStick.y;
    C.runtime._editor_space_stick(shape(C.mouseStick.x), -shape(C.mouseStick.y));
    C.mouseStick.sent = true;
  }

  function statusDirty() {
    const now = performance.now();
    if ((C.doc.mode !== "edit" && C.dirtyCheck.mode === C.doc.mode) || now - C.dirtyCheck.at < 500) return C.dirtyCheck.value;
    C.dirtyCheck.at = now;
    C.dirtyCheck.mode = C.doc.mode;
    C.dirtyCheck.value = C.doc.dirty;
    return C.dirtyCheck.value;
  }

  function frame(now: number) {
    const frameStart = performance.now();
    let tickMs = 0;
    const dt = Math.min((now - C.previous) / 1000, 5 / 60);
    C.governFrame(now - C.previous);
    wind.time.value = now / 1000;
    updateMouseStick(dt);
    if (C.doc.mode === "play") C.updateMusic();
    C.previous = now;
    let steps = 0;
    const player = C.playerIndex >= 0 ? C.objects[C.playerIndex] : undefined;
    // UI clicks while paused (a script's on_ui) can still queue commands,
    // e.g. game.resume() from a title screen's button.
    if (C.doc.mode === "pause") C.runScriptCommands();
    if (C.doc.mode === "play") {
      // Once per rendered frame, before any of this frame's ticks — mirrors
      // the native platform's own begin_frame()-then-apply-events-then-step
      // loop, so key_pressed()/key_released() read as single-frame edges
      // shared by every tick this frame runs, not per-tick. Skipped after a
      // frame that ran no tick (a display faster than 60 Hz): otherwise a
      // press or click landing in that frame would be cleared before any
      // tick saw it, and mouse deltas would be dropped.
      if (C.inputFrameConsumed) C.runtime._editor_input_begin_frame();
      // Once per rendered frame too, so this frame's on-foot movement (see
      // Runtime::camera_forward_x/z's own doc comment in bridge.cpp) reflects
      // wherever the camera is pointed right now, including mid-orbit.
      C.viewCamera.getWorldDirection(C.cameraForwardScratch);
      C.runtime._editor_set_camera_forward(C.cameraForwardScratch.x, C.cameraForwardScratch.z);
      for (const [code, down] of C.keyQueue) C.runtime.ccall("editor_input_key", null, ["string", "number"], [code, down]);
      C.keyQueue.length = 0;
      C.flushPointerInput();
      C.pollGamepad();
      const controller = C.playerController();
      if (controller?.mode === "FirstPerson" && C.padSnapshot)
        applyStickLook(C.fps.look, C.padSnapshot.axes[2] ?? 0, C.padSnapshot.axes[3] ?? 0, dt, controller.lookSensitivity, controller.invertY);
      C.updateShooterAim(dt);
      for (const [key, down] of C.scriptKeyQueue) C.runtime.ccall("editor_script_key", null, ["string", "number"], [key, down]);
      C.scriptKeyQueue.length = 0;
      // The settings panel pauses the game (input waits with it).
      if (!C.settingsPanel) C.accumulator += dt * C.combat.timeScale;
      const tickStart = performance.now();
      const firstPersonTicks = C.firstPerson();
      if (firstPersonTicks) C.runtime._editor_set_look(C.fps.look.yaw, C.fps.look.pitch);
      while (C.accumulator >= 1 / 60 && steps++ < 5) {
        if (firstPersonTicks) C.playerFeet(C.fps.previous);
        C.tickStates.forEach((state) => {
          state.previous.copy(state.current);
          state.previousYaw = state.currentYaw;
        });
        C.runtime._editor_tick();
        C.sampleTickStates();
        C.spaceView?.sampleTick();
        if (firstPersonTicks) {
          C.playerFeet(C.fps.current);
          C.fpsLanding = Math.max(C.fpsLanding, C.runtime._editor_controller_value(C.playerIndex, 3));
        }
        C.ticks++;
        C.accumulator -= 1 / 60;
      }
      tickMs = performance.now() - tickStart;
      // E can hand the Player over to a car and back (editor_controlled_player):
      // the camera and readouts follow whoever has the controls.
      // A destroyed Player keeps its index (the death screen reads it).
      const controlled = steps > 0 ? C.runtime._editor_controlled_player() : -1;
      if (controlled >= 0) C.playerIndex = controlled;
      // The walker rides hidden inside the car it drives, and is drawn again when it gets out.
      const seated = steps > 0 ? C.runtime._editor_seat_value(1) : C.hiddenWalker;
      if (seated !== C.hiddenWalker) {
        const back = C.hiddenWalker >= 0 ? C.objects[C.hiddenWalker] : undefined;
        if (back) back.visible = true;
        const gone = seated >= 0 ? C.objects[seated] : undefined;
        if (gone) gone.visible = false;
        C.hiddenWalker = seated;
      }
      C.tickAlpha = Math.min(1, C.accumulator * 60);
      C.inputFrameConsumed = steps > 0;
      C.persistDirtySaves();
      C.pollAnimationRequests();
      C.adoptSpawnedEntities();
      C.runScriptCommands();
      C.processCombatEvents();
      C.combat.events(C.objects);
      if (steps > 0) C.playMovementSounds(steps / 60);
      C.objects.forEach((object, i) => {
        // Combat/AI can destroy an authored entity (Health reaching 0) mid-session;
        // its index stays in objects[] (entities can't be added/removed while
        // playing), but editor_value() on a dead entity is meaningless. Rather
        // than vanish instantly, it plays a death clip (if its model has one)
        // and fades out over deathFadeDuration -- see startDeath's own doc
        // comment. Only ever forces visible false, never true: rebuild()
        // already set each object's visibility from its own authored
        // Renderable.visible, and an entity that's still alive never needs
        // that touched here.
        if (!C.tickSnapshotAlive(i)) {
          const state = (C.deathStates[i] ??= C.startDeath(object, C.combat.diedInCombat(i) ? undefined : C.animStates[i]));
          state.elapsed += dt;
          const progress = Math.max(0, 1 - state.elapsed / C.deathFadeDuration);
          for (const { material, baseOpacity } of state.materials) material.opacity = baseOpacity * progress;
          if (state.elapsed >= C.deathFadeDuration) object.visible = false;
          return;
        }
        // Drawn between the last two ticks, by how far into the next one
        // this frame is: the simulation steps at 60 Hz, so drawing raw tick
        // positions makes motion judder on any display not exactly in step.
        const state = C.tickStates[i] ?? C.sampleTickState(i);
        object.position.lerpVectors(state.previous, state.current, C.tickAlpha);
      });
      // A Vehicle+Player entity's facing comes straight from its own steered
      // heading (bridge.cpp field 4), not inferred from position deltas like
      // the animated-entity facing below — that would lag and wobble
      // mid-turn, where a real heading is exact every tick.
      // Soldiers face where their AI is looking (bridge.cpp's Soldier::yaw).
      C.objects.forEach((object, i) => {
        if (!C.tickSnapshotAlive(i)) return;
        const state = C.tickStates[i];
        const flags = C.tickSnapshotFlags(i);
        if (!state || (flags >= 0 ? !(flags & 1) : C.runtime._editor_soldier_value(i, 0) < 0)) return;
        const turn = Math.atan2(Math.sin(state.currentYaw - state.previousYaw), Math.cos(state.currentYaw - state.previousYaw));
        object.rotation.y = state.previousYaw + turn * C.tickAlpha;
      });
      const authored = C.doc.scene.eachAlive();
      C.objects.forEach((object, i) => {
        if (!C.tickSnapshotAlive(i)) return;
        const entity = authored[i];
        // Arcade cars (any driver, spawned ones too), drawn between ticks
        // like positions.
        const state = C.tickStates[i];
        const flags = C.tickSnapshotFlags(i);
        if ((flags >= 0 ? flags & 2 : C.runtime._editor_vehicle_value(i, 11)) && state) {
          const turn = Math.atan2(Math.sin(state.currentYaw - state.previousYaw), Math.cos(state.currentYaw - state.previousYaw));
          object.rotation.y = state.previousYaw + turn * C.tickAlpha;
        } else if (entity && C.doc.scene.effectiveHas(entity, "Vehicle") && C.doc.scene.effectiveHas(entity, "Player"))
          object.rotation.y = C.runtime._editor_value(i, EntityField.headingYaw);
      });
      // Jump/flight squash-and-stretch: a cheap "weight" cue so a jump doesn't
      // read as a flat vertical translation — stretches tall while rising,
      // squashes while falling, and eases back to the authored scale once
      // grounded (vertical speed settles near zero). Player only, since that
      // was the reported complaint, scaled from the authored size captured
      // when Play started (see the Play button handler) rather than a
      // hardcoded 1, so a player placed at a non-default Scale still squashes
      // proportionally instead of snapping to an unrelated size. Not for a
      // Vehicle: a car visibly deforming like a jumping character would read
      // as a rendering bug, not a style choice.
      // Only recomputed on a frame that actually ran a fixed tick: on a
      // display faster than the 60 Hz simulation, most rendered frames run
      // zero ticks, leaving position (and so playerPrevY) unchanged that
      // frame — recomputing unconditionally would read that as "stopped"
      // and snap back to the authored scale, then re-stretch on the next
      // tick-frame, flickering every render frame at 120/144 Hz instead of
      // reading as one continuous effect.
      const playerEntity = C.playerIndex >= 0 ? C.doc.scene.eachAlive()[C.playerIndex] : undefined;
      if (
        steps > 0 &&
        player &&
        C.playerBaseScale &&
        playerEntity &&
        !C.doc.scene.effectiveHas(playerEntity, "Vehicle") &&
        !C.doc.scene.effectiveHas(playerEntity, "CharacterController")
      ) {
        const verticalDelta = player.position.y - C.playerPrevY;
        const stretch = Math.max(-0.18, Math.min(0.18, verticalDelta * 6));
        player.scale.set(C.playerBaseScale.x * (1 - stretch * 0.5), C.playerBaseScale.y * (1 + stretch), C.playerBaseScale.z * (1 - stretch * 0.5));
      }
      if (steps > 0 && player) C.playerPrevY = player.position.y;
      const projectileCount = C.runtime._editor_projectile_count();
      while (C.projectileMeshes.length > projectileCount) C.scene.remove(C.projectileMeshes.pop()!);
      for (let i = 0; i < projectileCount; i++) {
        const v = (field: number) => C.runtime._editor_projectile_value(i, field);
        const shape = v(6);
        if (C.projectileMeshes[i]?.userData.shape !== shape) {
          if (C.projectileMeshes[i]) C.scene.remove(C.projectileMeshes[i]!);
          C.scene.add((C.projectileMeshes[i] = makeProjectile(shape)));
        }
        updateProjectile(C.projectileMeshes[i]!, v(0), v(1), v(2), v(3), v(4), v(5), performance.now() / 1000);
      }
      C.updateCars(dt);
      if (C.spaceView && C.shipIndex >= 0 && C.objects[C.shipIndex]) {
        const context = C.audioContext;
        C.spaceView.placeShip(C.objects[C.shipIndex]!, C.tickAlpha, dt, context ? { context, output: C.audioMixer().buses.sfx } : undefined);
      }
      if (player) C.controls.target.copy(player.position);
    }
    // Always advance mixers, even in edit mode: a rigged model sitting
    // perfectly still reads as a broken rig, and an idle clip is meant to loop.
    // Beyond crowdNear, characters animate every few frames under load (the
    // frame governor's crowd stride), each catching up its skipped time.
    const stride = C.governorTier().crowdStride;
    C.crowdFrame++;
    const eye = C.viewCamera.position;
    C.lightPool.update(C.viewCamera.position);
    if (C.doc.mode === "play") C.combat.frame(dt, C.tickAlpha, C.viewCamera);
    // Slow motion (a finisher, a parry) slows every body with the game clock.
    const animDt = C.doc.mode === "play" ? dt * C.combat.timeScale : dt;
    C.animStates.forEach((state, i) => {
      if (!state) return;
      const object = C.objects[i];
      // A character far from the camera is not drawn at all (a skinned body and its gear cost tens of thousands of
      // triangles whether or not they are anywhere near the view).
      if (object && C.doc.mode === "play") {
        const far = object.position.distanceToSquared(eye) > CHARACTER_DRAW_DISTANCE * CHARACTER_DRAW_DISTANCE;
        if (far !== !!object.userData.farHidden) {
          object.userData.farHidden = far;
          if (far) {
            object.userData.visibleBefore = object.visible;
            object.visible = false;
          } else object.visible = object.userData.visibleBefore ?? true;
        }
      } else if (object?.userData.farHidden) {
        object.userData.farHidden = false;
        object.visible = object.userData.visibleBefore ?? true;
      }
      if (stride > 1 && object && object.position.distanceToSquared(eye) > crowdNear * crowdNear) {
        state.skipped = (state.skipped ?? 0) + animDt;
        if ((C.crowdFrame + i) % stride !== 0) return;
        state.mixer.update(state.skipped);
        state.skipped = 0;
        return;
      }
      state.mixer.update(animDt + (state.skipped ?? 0));
      state.skipped = 0;
      // Each near character's own gestures over a shared clip.
      const kind = C.doc.mode === "play" && object && object.position.distanceToSquared(eye) < 40 * 40 ? gestureFor(state.current) : undefined;
      if (kind && object) {
        let bones = C.gestureBones.get(state);
        if (!bones) C.gestureBones.set(state, (bones = findGestureBones(object)));
        applyGesture(bones, kind, now / 1000, i);
      }
    });
    if (C.doc.mode === "play") C.combat.plant(dt);
    // Weapon guards and two-handed grips, over the clips' poses.
    updateHeldWeapons(animDt, (body) => C.combat.guarding(body));
    C.updateGunPoses(animDt);
    C.updateLoot(animDt);
    C.updateObjectives();
    // Same reasoning as mixers above -- a Particles emitter is as "always on"
    // as a Light, not gated to Play mode like Script/Sound.
    C.particleScale.value = C.viewport.clientHeight / 2;
    C.particleStates.forEach((state) => state && C.stepParticles(state, dt));
    C.updateStaticBatches();
    C.stepTrails(dt);
    // Ground-speed clip selection runs on the fixed-step cadence (steps/60),
    // not every render frame — see groundSpeed()'s own comment for why.
    if (C.doc.mode === "play" && steps > 0) {
      const tickDt = steps / 60;
      const entities = C.doc.scene.eachAlive();
      [C.talkerWasResting, C.talkerResting] = [C.talkerResting, C.talkerWasResting];
      C.talkerResting.clear();
      if (C.talkerScan !== C.objects.length) {
        C.talkerScan = C.objects.length;
        C.talkerIndices = entities.flatMap((entity, k) => (C.doc.scene.effectiveHas(entity, "Routine") || C.doc.scene.effectiveHas(entity, "Pedestrian") ? [k] : []));
      }
      C.animStates.forEach((state, i) => {
        if (!state) return;
        // A dying entity's own death clip (startDeath()) must not be
        // fought here -- its position stopped updating the moment it died
        // (see the objects.forEach block above), so an unconditional pass
        // reads that as speed 0 and immediately crossfades to "idle",
        // undoing the death clip the very frame it started. A script's own
        // self.animate one-shot (pollAnimationRequests above) is the same
        // problem one tick earlier: the entity is very much still moving,
        // so ground speed alone can't tell "mid one-shot" apart from
        // "should already be back to walk/run."
        if (C.deathStates[i] || state.oneShot) return;
        const object = C.objects[i]!;
        // Speed from the simulated positions, not the interpolated ones drawn.
        const at = C.tickStates[i]?.current ?? object.position;
        const dx = at.x - state.prevPosition.x;
        const dz = at.z - state.prevPosition.z;
        const speed = groundSpeed(at, state.prevPosition, tickDt);
        const verticalSpeed = (at.y - state.prevPosition.y) / tickDt;
        state.prevPosition.copy(at);
        // A fighter's body follows its fight (combatView.ts); it faces where
        // the simulation says (editor_snapshot).
        if (C.combat.has(i)) {
          C.combat.tick(i, speed, verticalSpeed, C.fighterVelocity.set(dx / tickDt, 0, dz / tickDt));
          return;
        }
        // Face the direction actually traveled — not for a Vehicle, whose
        // facing already comes from its own steered heading above, which is
        // exact every tick where this would lag and wobble mid-turn.
        // Without this, a walk/run clip plays while the mesh keeps whatever
        // fixed orientation it was authored with, sliding sideways or
        // backwards instead of visibly running toward where it's going.
        // A third-person shooter with the gun raised faces the aim (strafing).
        const aimingBody = i === C.playerIndex && C.shooterActive() && (C.gunPoses.get(i)?.raised ?? 0) > 0.3;
        if (aimingBody) {
          const diff = Math.atan2(Math.sin(C.tps.view.bodyYaw - object.rotation.y), Math.cos(C.tps.view.bodyYaw - object.rotation.y));
          const maxTurn = 14 * tickDt;
          object.rotation.y += Math.max(-maxTurn, Math.min(maxTurn, diff));
        } else if (
          speed > 0.15 &&
          // Runtime-spawned objects (world.spawn) have no authored entity:
          // a spawned soldier faces where its AI looks, like authored ones.
          (entities[i]
            ? !C.doc.scene.effectiveHas(entities[i]!, "Vehicle") && !C.doc.scene.effectiveHas(entities[i]!, "AICombat")
            : C.runtime._editor_soldier_value(i, 0) < 0)
        ) {
          const targetYaw = Math.atan2(dx, dz);
          const diff = Math.atan2(Math.sin(targetYaw - object.rotation.y), Math.cos(targetYaw - object.rotation.y));
          const maxTurn = 10 * tickDt; // rad; generous enough not to lag a sharp turn
          object.rotation.y += Math.max(-maxTurn, Math.min(maxTurn, diff));
        }
        const animator = C.animators[i];
        if (animator) {
          C.runAnimator(i, state, animator.runtime, speed, verticalSpeed, tickDt);
          return;
        }
        // An authored AnimationState.clip (see rebuild()) pins the clip
        // rebuild() already applied -- Play mode's own ground-speed pick
        // must not fight it every tick.
        const override = entities[i] ? C.doc.scene.resolve(entities[i]!, "AnimationState") : undefined;
        const overridden = override?.clip && state.actions.has(override.clip);
        // Crouching (C, key_for() code 7 -- see boundKeyCodes' own doc
        // comment) takes priority over both the authored pin and ordinary
        // ground-speed picking: it's an explicit, held player action, the
        // same way a one-shot request already preempts this whole loop via
        // the oneShot gate above, just sustained instead of one-shot.
        // Native-frozen (editor.move's own crouch gate, bridge.cpp) so
        // `speed` already reads ~0 here regardless; this only decides which
        // clip plays at that speed. Player-only: heldKeys has no meaning for
        // an AI/Pedestrian, which never receives editor_key edges at all.
        const crouching = i === C.playerIndex && C.heldKeys.has(C.crouchKeyCode);
        const sitClip = crouching ? C.resolveActionClip(state, "sit") : undefined;
        // Once crouch releases, an authored pin must be explicitly
        // re-asserted here, not merely left as undefined ("leave whatever's
        // already playing alone") -- that fallback only ever worked because
        // nothing before crouch existed could still be showing a *different*
        // clip while `overridden` was true. Now that crouching can
        // temporarily replace state.current with the sit clip, releasing it
        // needs this loop to actively restore override.clip itself; the
        // `clipName !== state.current` check below makes this a no-op once
        // it's already showing, so it's harmless in the ordinary case too.
        const restoringPin = !sitClip && overridden;
        // Standing still: an activity -- a job at a routine's
        // stop, talking with whoever stands close, grazing -- before plain idle.
        const resting = !sitClip && !overridden && speed < 0.15 && i !== C.playerIndex ? restingClip(i, state, entities[i], object, tickDt) : undefined;
        const clipName = sitClip ?? (overridden ? override!.clip : (resting ?? pickClipName([...state.actions.keys()], speed)));
        if (clipName && clipName !== state.current) {
          const next = state.actions.get(clipName);
          const previous = state.current ? state.actions.get(state.current) : undefined;
          if (next) {
            if (restoringPin) {
              // Crouch just released (or an authored pin is regaining
              // priority some other way) -- restore it with its own
              // authored looping/time settings, the exact same three lines
              // rebuild()'s initial apply and onFinished's one-shot restore
              // already use, instead of the generic always-loop-from-zero
              // locomotion configuration below. Skipping this would force a
              // non-looping pinned clip into infinite looping from frame 0,
              // silently discarding what the user authored.
              next.setLoop(override!.looping ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
              next.clampWhenFinished = !override!.looping;
              if (Number.isFinite(override!.time)) next.time = override!.time;
              next.reset().fadeIn(0.2).play();
            } else {
              // A script's self.animate (pollAnimationRequests above) may have
              // left this exact action set to LoopOnce/clampWhenFinished from
              // an earlier one-shot -- .reset() alone doesn't touch loop mode,
              // so without this it would play once here and freeze instead of
              // looping like ordinary locomotion.
              next.setLoop(THREE.LoopRepeat, Infinity);
              next.clampWhenFinished = false;
              next.reset().fadeIn(0.2).play();
            }
            if (previous && previous !== next) previous.fadeOut(0.2);
            state.current = clipName;
          }
        }
      });
    }
    if (C.selection.visible) C.selection.update();
    C.controls.update();
    C.rig.frameDt = dt;
    const game = C.gameCamera();
    C.viewCamera = game ?? C.camera;
    // A panel cutscene takes the camera while it plays.
    if (C.doc.mode === "play") {
      C.ledger.update(dt, Math.max(1, C.viewport.clientWidth) / Math.max(1, C.viewport.clientHeight));
      if (C.ledger.playing) C.viewCamera = C.ledger.camera;
    }
    // Shake the game camera, or during Play a copy of the editor camera, so
    // the orbit camera itself never drifts.
    if (C.doc.mode !== "edit" && C.shake.remaining > 0) {
      if (!game) {
        C.shakeCamera.copy(C.camera);
        C.viewCamera = C.shakeCamera;
      }
      C.applyShake(C.viewCamera, dt);
    }
    const viewmodelInput =
      C.firstPerson() && C.runtime._editor_weapon_value(C.playerIndex, 10) > 0
        ? {
            look: C.fps.look,
            aiming: C.runtime._editor_weapon_value(C.playerIndex, 7) === 1,
            reloadProgress: C.runtime._editor_weapon_value(C.playerIndex, 3),
            equipProgress: C.runtime._editor_weapon_value(C.playerIndex, 6),
            speed: C.runtime._editor_controller_value(C.playerIndex, 4),
            grounded: C.runtime._editor_controller_value(C.playerIndex, 2) === 1,
            sprinting: C.runtime._editor_controller_value(C.playerIndex, 5) === 1,
          }
        : undefined;
    C.weaponFx.update(dt, viewmodelInput, C.viewport.clientWidth / Math.max(C.viewport.clientHeight, 1));
    C.viewmodelPass.enabled = !!viewmodelInput;
    // The viewmodel reflects the same sky light as the world, or a neutral
    // studio environment when the scene has none (metal would read black).
    if (viewmodelInput) {
      C.viewmodelStudio ??= C.pmrem?.fromScene(new RoomEnvironment(), 0.04).texture;
      C.weaponFx.viewScene.environment = C.scene.environment ?? C.viewmodelStudio ?? null;
      C.weaponFx.viewScene.environmentIntensity = C.scene.environment ? C.scene.environmentIntensity : 0.8;
    }
    // The listener follows the view; positional Sound components follow their entity.
    if (C.mixer) {
      C.viewCamera.getWorldPosition(C.listenerPosition);
      const forward = C.viewCamera.getWorldDirection(new THREE.Vector3());
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(C.viewCamera.getWorldQuaternion(new THREE.Quaternion()));
      C.mixer.updateListener(C.listenerPosition, forward, up);
      for (const [index, panner] of C.activePanners) {
        const object = C.objects[index];
        if (object) C.mixer.place(panner, object.getWorldPosition(new THREE.Vector3()));
      }
    }
    if (C.doc.mode !== "edit") {
      C.updateSpace(C.viewCamera, dt);
      if (C.doc.mode === "play") C.updateScanner(dt, C.viewCamera);
    }
    C.updateSunShadow();
    updateScatterLod(C.viewCamera.getWorldPosition(new THREE.Vector3()));
    if (C.doc.mode === "play")
      C.objects.forEach((o, i) => {
        const heads = o?.userData.signalHeads as SignalHeads | undefined;
        if (heads) setSignalHeads(heads, C.runtime._editor_signal_state(i));
      });
    C.renderPass.camera = C.viewCamera;
    if (C.gtaoPass) C.gtaoPass.camera = C.viewCamera;
    C.inkPass.camera = C.viewCamera;
    if (C.gradingPass.enabled) (C.gradingPass.uniforms as Record<string, { value: number }>).time!.value = (now / 1000) % 100;
    // Counted over every pass of the frame (bloom included), not just the
    // last one, for the Stats overlay's draw calls and triangles.
    if (C.renderer instanceof THREE.WebGLRenderer) {
      C.renderer.info.autoReset = false;
      C.renderer.info.reset();
    }
    C.inkPass.impact = C.combat.comic.impact * C.playerSettings.flash;
    C.combat.flashStrength = C.playerSettings.flash;
    accessibility.textScale = C.playerSettings.textScale;
    accessibility.colorBlind = C.playerSettings.colorBlind;
    if (C.composer) C.composer.render();
    else C.renderer.render(C.scene, C.viewCamera);
    C.drawHud();
    C.updateStats(performance.now() - frameStart, tickMs);
    const status = C.el("status");
    status.dataset.mode = C.doc.mode;
    const playerReadout =
      C.doc.mode === "play" && player ? ` · Player (${player.position.x.toFixed(1)}, ${player.position.y.toFixed(1)}, ${player.position.z.toFixed(1)})` : "";
    // Text companion to the HUD's own bar for whatever's selected — lets a
    // precise numeric value (or the "defeated" transition) be read/watched
    // without eyeballing bar width in the viewport.
    const selectedIndex = C.doc.selection ? C.doc.scene.eachAlive().findIndex((e) => e.index === C.doc.selection!.index) : -1;
    const selectedHealthReadout =
      C.doc.mode === "play" && selectedIndex >= 0 && C.doc.scene.effectiveHas(C.doc.selection!, "Health")
        ? C.runtime._editor_alive(selectedIndex)
          ? ` · Selected health: ${Math.round(C.runtime._editor_value(selectedIndex, EntityField.health) * 100)}%`
          : " · Selected: defeated"
        : "";
    // A live companion to selectedHealthReadout for an AIState entity: field 5 is
    // AIAgent.state as a plain int matching aiStateNames' own order (bridge.cpp's
    // editor_value doc comment) — watch an NPC's wander/chase/flee decisions and
    // position tick by tick without eyeballing the viewport.
    const selectedAiReadout =
      C.doc.mode === "play" && selectedIndex >= 0 && C.doc.scene.effectiveHas(C.doc.selection!, "AIState") && C.runtime._editor_alive(selectedIndex)
        ? ` · Selected AI: ${C.aiStateNames[C.runtime._editor_value(selectedIndex, EntityField.aiState)] ?? "Idle"} (${C.runtime._editor_value(selectedIndex, EntityField.x).toFixed(1)}, ${C.runtime._editor_value(selectedIndex, EntityField.z).toFixed(1)})`
        : "";
    // A script author's only feedback that something's wrong: a compile or
    // runtime error is otherwise a silently inert entity with no visible
    // cause (see editor_script_error's own doc comment, bridge.cpp, on why
    // that's the one thing surfaced here rather than every field of `self`).
    const spawnedCount = C.objects.length - C.doc.scene.eachAlive().length;
    const spawnedReadout = C.doc.mode !== "edit" && spawnedCount > 0 ? ` · ${spawnedCount} spawned` : "";
    const selectedScriptErrorReadout =
      C.doc.mode === "play" && selectedIndex >= 0 && C.doc.scene.effectiveHas(C.doc.selection!, "Script")
        ? (() => {
            const error = C.runtime.ccall("editor_script_error", "string", ["number"], [selectedIndex]);
            return error ? ` · Script error: ${error}` : "";
          })()
        : "";
    status.textContent = `${C.doc.mode.toUpperCase()} · ${C.backend} · ${C.doc.scene.entityCount} entities · ${C.ticks} C++ fixed ticks${spawnedReadout}${playerReadout}${selectedHealthReadout}${selectedAiReadout}${selectedScriptErrorReadout} · ${statusDirty() ? "Unsaved changes" : "Saved"} · Gravity, ground, Collider box/sphere collision, Health-based combat (F melee, G blast), Vehicle driving (W/S/A/D), AIState/Pedestrian wander/chase/flee, Script (Lua callbacks and world API), and Sound (Web Audio) are simulated`;
    requestAnimationFrame(frame);
  }
  Object.assign(C, { frame });
}
