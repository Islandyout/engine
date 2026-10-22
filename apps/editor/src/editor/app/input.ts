import * as THREE from "three";
import { parseParamValue } from "../animator";
import { type Bus } from "../audioMixer";
import { burst } from "../particles";
import type { Ctx } from "./context";

export function installInput(C: Ctx): void {
  // Releases are accepted in both Play and Pause (only Edit is excluded) so
  // a key physically released while paused still clears its held state,
  // matching the native platform's own semantics. Guarding both on
  // doc.mode === "play" is safe for keydown even for a key pressed just
  // after Stop: syncRuntime() clears keyQueue/heldKeys and hands the next
  // Play session a brand new WASM Runtime (so a fresh, zeroed InputState)
  // anyway, so nothing here needs to carry a "this key was still down" fact
  // across sessions for that fresh state to be correct.
  function releaseHeldKeys() {
    for (const code of C.heldKeys) C.keyQueue.push([code, 0]);
    C.heldKeys.clear();
    for (const key of C.heldScriptKeys) C.scriptKeyQueue.push([key, 0]);
    C.heldScriptKeys.clear();
    C.scriptKeyByCode.clear();
  }

  function gameKeyUp(code: string, fallbackKey = "") {
    if (C.heldKeys.delete(code)) C.keyQueue.push([code, 0]);
    const key = C.scriptKeyByCode.get(code) ?? fallbackKey;
    C.scriptKeyByCode.delete(code);
    C.scriptKeyQueue.push([key, 0]);
    C.heldScriptKeys.delete(key);
    if (C.heldScriptKeys.delete(code)) C.scriptKeyQueue.push([code, 0]);
  }

  function execute(command: unknown) {
    const result = C.doc.execute(command);
    C.log(result);
    if (result.ok) C.rebuild();
    return result;
  }

  function viewportPoint(event: MouseEvent) {
    const rect = C.renderer.domElement.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function flushPointerInput() {
    for (const apply of C.pointerQueue) apply();
    C.pointerQueue.length = 0;
  }

  // On-screen touch controls are a virtual gamepad, merged with a real one.
  function readPad(): { buttons: readonly { pressed: boolean; value: number }[]; axes: readonly number[] } | undefined {
    const real = navigator.getGamepads?.().find((p) => p && p.connected) ?? undefined;
    if (!C.touchControls?.pad.active) return real ?? undefined;
    const v = C.touchControls.sample();
    const buttons = Array.from({ length: 17 }, (_, i) => {
      const pressed = v.buttons[i] || !!real?.buttons[i]?.pressed;
      return { pressed, value: Math.max(pressed ? 1 : 0, real?.buttons[i]?.value ?? 0) };
    });
    const axes = [0, 1, 2, 3].map((i) => {
      const a = v.axes[i]!,
        b = real?.axes[i] ?? 0;
      return Math.abs(a) >= Math.abs(b) ? a : b;
    });
    return { buttons, axes };
  }

  function pollGamepad() {
    const pad = readPad();
    if (!pad) {
      if (C.padSnapshot) C.runtime._editor_input_gamepad_connected(0);
      C.padSnapshot = undefined;
      return;
    }
    if (!C.padSnapshot) {
      C.runtime._editor_input_gamepad_connected(1);
      C.padSnapshot = { buttons: [], axes: [] };
    }
    pad.buttons.forEach((button, index) => {
      const mapped = C.gamepadButtonMap[index];
      if (mapped === undefined || C.padSnapshot!.buttons[index] === button.pressed) return;
      C.padSnapshot!.buttons[index] = button.pressed;
      C.runtime._editor_input_gamepad_button(mapped, button.pressed ? 1 : 0);
    });
    // Sticks, then the analog triggers (standard buttons 6/7) as axes 4/5.
    const axes = [...pad.axes.slice(0, 4), pad.buttons[6]?.value ?? 0, pad.buttons[7]?.value ?? 0];
    axes.forEach((value, axis) => {
      if (C.padSnapshot!.axes[axis] === value) return;
      C.padSnapshot!.axes[axis] = value;
      C.runtime._editor_input_gamepad_axis(axis, value);
    });
  }

  function runScriptCommands() {
    const count = C.runtime._editor_take_commands();
    for (let i = 0; i < count; i++) {
      const kind = C.runtime.ccall("editor_command_text", "string", ["number", "number"], [i, 0]);
      const a = C.runtime.ccall("editor_command_text", "string", ["number", "number"], [i, 1]);
      const b = C.runtime.ccall("editor_command_text", "string", ["number", "number"], [i, 2]);
      if (kind === "log") C.log(`[script] ${a}`);
      else if (kind === "sound") C.playOneShot(a);
      else if (kind === "sound_at") {
        const [x = 0, y = 0, z = 0, volume = 1] = b.split(",").map(Number);
        C.playOneShot(a, new THREE.Vector3(x, y, z), Number.isFinite(volume) ? volume : 1);
      } else if (kind === "sound_volume") {
        const bus = a.toLowerCase();
        if (["master", "sfx", "music", "ambient", "ui"].includes(bus)) C.audioMixer().setBusVolume(bus as Bus | "master", Number(b) || 0);
      } else if (kind === "ui_text") {
        C.uiTextOverrides.set(a, b);
        // Banners and objectives are read out to screen readers.
        if (a === "Banner" || a === "Objective") C.announcer.say(b);
      } else if (kind === "host" && a === "bow") C.setBow(C.runtime._editor_command_entity(i), b);
      else if (kind === "host" && a === "outfit")
        C.setOutfit(C.runtime._editor_command_entity(i), C.parseOutfit(b));
      else if (kind === "host") C.handleHost(a, b);
      else if (kind === "particles_burst" || kind === "particles_emitting") {
        const state = C.particleStates[C.runtime._editor_command_entity(i)];
        if (state && kind === "particles_burst") burst(state.emitter, Math.max(0, Math.min(1000, Number(a) || 0)));
        else if (state) state.emitter.emitting = a === "1";
      } else if (kind === "ui_value") C.uiValues.set(a, Math.min(1, Math.max(0, Number(b) || 0)));
      else if (kind === "ui_visible") C.uiVisibility.set(a, b === "1");
      else if (kind === "ui_marker") {
        const [x = 0, y = 0, z = 0] = b.split(",", 3).map(Number);
        const label = b.split(",").slice(3).join(",");
        C.uiMarkers.set(a, { position: new THREE.Vector3(x, y, z), label });
      } else if (kind === "ui_marker_clear") C.uiMarkers.delete(a);
      else if (kind === "game_pause") C.runUIAction("pause");
      else if (kind === "game_resume") C.runUIAction("resume");
      else if (kind === "mouse_lock") {
        if (a === "1") void C.renderer.domElement.requestPointerLock?.();
        else if (document.pointerLockElement) C.releasePointer();
      } else if (kind === "camera_shake") {
        C.shake.intensity = C.playerSettings.reducedMotion ? 0 : Math.max(0, Number(a) || 0);
        C.shake.duration = Math.max(0.01, Number(b) || 0.01);
        C.shake.remaining = C.shake.duration;
      } else if (kind === "anim_set" || kind === "anim_trigger") {
        const animator = C.animators[C.runtime._editor_command_entity(i)]?.runtime;
        if (kind === "anim_trigger") animator?.trigger(a);
        else {
          const value = parseParamValue(b);
          if (value !== undefined) animator?.set(a, value);
        }
      }
    }
  }
  Object.assign(C, { releaseHeldKeys, gameKeyUp, execute, viewportPoint, flushPointerInput, pollGamepad, runScriptCommands });
}
