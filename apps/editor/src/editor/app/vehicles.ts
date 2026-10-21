import * as THREE from "three";
import { EntityField } from "../bridgeFields";
import { EngineVoice, SirenVoice, TireVoice } from "../carAudio";
import { type CarView } from "../carFx";
import { governorTiers, presetFloor } from "../frameGovernor";
import {
	qualityProfile
} from "../playerSettings";
import { shadowQualities } from "../postFx";
import type { Ctx } from "./context";
import { TickState } from "./context";

export function installVehicles(C: Ctx): void {
  function sampleTickState(i: number): TickState {
    const state = (C.tickStates[i] ??= {
      previous: new THREE.Vector3(),
      current: new THREE.Vector3(),
      previousYaw: 0,
      currentYaw: 0,
    });
    state.current.set(C.runtime._editor_value(i, EntityField.x), C.runtime._editor_value(i, EntityField.y), C.runtime._editor_value(i, EntityField.z));
    // Soldiers face where they look; cars along their heading.
    state.currentYaw = C.runtime._editor_soldier_value(i, 0) >= 0 ? C.runtime._editor_soldier_value(i, 1) : C.runtime._editor_value(i, EntityField.headingYaw);
    if (!state.previous.lengthSq() && !state.previousYaw) {
      state.previous.copy(state.current);
      state.previousYaw = state.currentYaw;
    }
    return state;
  }

  // Every object's tick state from one bulk read (editor_snapshot).
  function sampleTickStates() {
    const base = C.runtime._editor_snapshot() / 8;
    const heap = (C.tickSnapshot = C.runtime.HEAPF64.slice(base, base + 1 + C.runtime.HEAPF64[base]! * 6));
    const count = Math.min(C.objects.length, heap[0]!);
    for (let i = 0; i < count; i++) {
      const row = 1 + i * 6;
      if (heap[row] !== 1) continue;
      const state = (C.tickStates[i] ??= {
        previous: new THREE.Vector3(),
        current: new THREE.Vector3(),
        previousYaw: 0,
        currentYaw: 0,
      });
      state.current.set(heap[row + 1]!, heap[row + 2]!, heap[row + 3]!);
      state.currentYaw = heap[row + 4]!;
      if (!state.previous.lengthSq() && !state.previousYaw) {
        state.previous.copy(state.current);
        state.previousYaw = state.currentYaw;
      }
    }
  }

  // -- Arcade cars: effects, sounds and the HUD's car ------------
  function stopCarSounds() {
    C.engineVoice?.stop();
    C.tireVoice?.stop();
    C.engineVoice = C.tireVoice = undefined;
    for (const { voice } of C.sirens.values()) voice.stop();
    C.sirens.clear();
  }

  function carView(i: number): CarView {
    const v = (field: number) => C.runtime._editor_vehicle_value(i, field);
    return {
      speed: v(0),
      forward: v(1),
      gear: v(2),
      rpm: v(3),
      nitro: v(4),
      drifting: v(5) === 1,
      boosting: v(6) === 1,
      slip: v(7),
      yawRate: v(12),
      brake: v(10),
      handbrake: v(9) === 1,
      throttle: v(13),
      pursuit: v(14) === 2,
    };
  }

  function updateCars(dt: number) {
    const live = new Set<number>();
    C.objects.forEach((anchor, i) => {
      if (!C.runtime._editor_alive(i) || !C.runtime._editor_vehicle_value(i, 11)) return;
      const car = carView(i);
      C.carFx.updateCar(anchor, C.carSizes.get(anchor) ?? new THREE.Vector3(2, 1.5, 4.6), car, dt);
      if (car.pursuit && C.audioContext) {
        live.add(i);
        let siren = C.sirens.get(i);
        if (!siren) {
          const source = C.audioMixer().source("sfx", anchor.position, { refDistance: 8, maxDistance: 400 });
          siren = { voice: new SirenVoice(C.getAudioContext(), source.input), panner: source.panner };
          C.sirens.set(i, siren);
        }
        siren.voice.update(dt);
        if (siren.panner) C.audioMixer().place(siren.panner, anchor.position);
      }
      if (i !== C.playerIndex) return;
      if (C.audioContext) {
        C.engineVoice ??= new EngineVoice(C.getAudioContext(), C.audioMixer().buses.sfx);
        C.tireVoice ??= new TireVoice(C.getAudioContext(), C.audioMixer().buses.sfx);
        C.engineVoice.update(car.rpm, car.gear, car.throttle, car.boosting);
        C.tireVoice.update(car.speed > 4 ? Math.min(1, Math.abs(car.slip) * 2.5 + (car.handbrake ? 0.4 : 0)) : 0);
      }
      // A sudden loss of speed is a crash.
      const lost = C.playerCarSpeed - car.speed;
      if (lost > 7) {
        C.shake.intensity = Math.min(0.5, lost * 0.025);
        C.shake.duration = C.shake.remaining = 0.35;
        C.playOneShot("sfx:impact", anchor.position, Math.min(1, lost / 20));
        C.playOneShot("sfx:explosion", anchor.position, Math.min(0.5, lost / 50));
      }
      C.playerCarSpeed = car.speed;
    });
    for (const [i, siren] of C.sirens)
      if (!live.has(i)) {
        siren.voice.stop();
        C.sirens.delete(i);
      }
    C.carFx.update(dt);
  }

  // Frame governor: while playing, holds 45-60 fps by stepping
  // through quality tiers (resolution, shadows, bloom, scatter, terrain
  // streaming, distant animation) -- see frameGovernor.ts. Edit mode always
  // draws at the best tier the player's preset allows.
  function governorTier() {
    return C.doc.mode === "play" ? C.governor.settings : governorTiers[C.governor.floor]!;
  }

  function applyGovernor() {
    const tier = governorTier();
    const profile = qualityProfile(C.playerSettings.quality);
    if (C.renderer instanceof THREE.WebGLRenderer) {
      const ratio = Math.min(devicePixelRatio, profile.pixelRatio) * tier.scale;
      if (Math.abs(C.renderer.getPixelRatio() - ratio) > 1e-3) {
        C.renderer.setPixelRatio(ratio);
        C.composer?.setPixelRatio(ratio);
        C.resizeAntialias();
      }
      C.renderer.shadowMap.enabled = profile.shadows && tier.shadows > 0;
    }
    if (C.bloomPass) C.bloomPass.enabled = tier.bloom;
    if (C.gtaoPass) C.gtaoPass.enabled = C.postSettings.ambientOcclusion && C.postSettings.style !== "Manhwa" && tier.ao;
    const mapSize = shadowQualities[C.postSettings.shadowQuality].mapSize / (tier.shadows === 1 ? 2 : 1);
    if (C.sun.shadow.mapSize.x !== mapSize) {
      C.sun.shadow.mapSize.set(mapSize, mapSize);
      C.sun.shadow.map?.dispose();
      C.sun.shadow.map = null;
    }
    if (C.spaceView) {
      C.spaceView.chunkMs = tier.chunkMs;
      C.spaceView.skyLow = tier.skyLow;
    }
    C.runtime._editor_set_sim_stride(tier.simStride);
    applyScatterDensity(tier.scatter);
  }

  // Draws the first `fraction` of each scatter chunk's instances (their
  // order is random, so this thins evenly).
  function applyScatterDensity(fraction: number) {
    C.spaceScatter?.traverse((child) => {
      if (!(child instanceof THREE.InstancedMesh)) return;
      const all = (child.userData.instances as unknown[] | undefined)?.length ?? child.count;
      child.count = Math.max(0, Math.round(all * fraction));
    });
  }

  function governFrame(intervalMs: number) {
    if (C.doc.mode !== C.governedMode) {
      C.governedMode = C.doc.mode;
      if (C.doc.mode === "edit") C.governor.reset(presetFloor(C.playerSettings.quality));
      applyGovernor();
    }
    if (C.doc.mode === "play" && C.governor.sample(intervalMs)) applyGovernor();
  }

  function updateStaticBatches() {
    const now = performance.now();
    if (C.doc.mode !== "play") {
      if (C.staticBatcher.size) C.staticBatcher.clear();
      if (C.probe.count) C.probe.detach();
      return;
    }
    if (now > C.batchAt) {
      C.batchAt = Infinity;
      const entities = C.doc.scene.eachAlive();
      C.staticBatcher.build(
        C.objects,
        (i) => {
          const entity = entities[i];
          if (!entity || i === C.playerIndex || i === C.shipIndex || C.animStates[i] || C.particleStates[i]) return false;
          return !C.movingComponents.some((type) => C.doc.scene.effectiveHas(entity, type as never));
        },
        (i) => String(C.memberSite[i] ?? -1),
      );
      if (!C.scene.children.includes(C.staticBatcher.group)) C.scene.add(C.staticBatcher.group);
    }
    if (C.staticBatcher.size && now > C.batchCheckAt) {
      C.batchCheckAt = now + 500;
      C.staticBatcher.check((i) => !C.tickSnapshotAlive(i));
    } else C.staticBatcher.syncVisibility();
  }
  Object.assign(C, { sampleTickState, sampleTickStates, stopCarSounds, carView, updateCars, governorTier, applyGovernor, applyScatterDensity, governFrame, updateStaticBatches });
}
