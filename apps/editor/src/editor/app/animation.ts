import * as THREE from "three";
import { AnimatorRuntime } from "../animator";
import type { Ctx } from "./context";
import { AnimState } from "./context";

export function installAnimation(C: Ctx): void {
  function resolveActionClip(state: AnimState, requested: string): string | undefined {
    const candidates = C.actionClipSynonyms.get(requested) ?? [requested];
    for (const candidate of candidates) {
      const lower = candidate.toLowerCase();
      for (const name of state.actions.keys()) if (name.toLowerCase() === lower) return name;
    }
    return undefined;
  }

  // Polls whatever was requested via editor_take_animation_request this tick
  // (bridge.cpp) and plays it as a one-shot, once per rendered frame like
  // persistDirtySaves above, not per fixed tick. The request itself may come
  // from a script's own self.animate (engine::script::Runtime's own doc
  // comment, script.hpp) or natively from editor.combat/editor.move on a F/G
  // press (see AnimState.oneShot's own doc comment above) -- both reach this
  // same channel and are resolved identically via resolveActionClip.
  // Silently ignored if the entity has no AnimState (a plain box has nothing
  // to animate) or nothing resolves to one of this model's own clips -- the
  // same "bonus when present, not a requirement" contract startDeath()'s own
  // death-clip lookup already has, not an error.
  function pollAnimationRequests() {
    const entities = C.doc.scene.eachAlive();
    C.animStates.forEach((state, i) => {
      if (!state) return;
      const asked = C.runtime.ccall("editor_take_animation_request", "string", ["number"], [i]);
      if (!asked) return;
      // "clip@pace": play at that pace and keep playing (an animal's walk, matched to its feet).
      const [requested, paceText] = asked.split("@") as [string, string | undefined];
      const rawPace = paceText ? Number(paceText) || 1 : 1;
      // A negative pace plays the clip backwards from its end and holds the first frame (lying down is the get-up clip reversed).
      const backwards = rawPace < 0;
      const pace = backwards ? Math.max(-2.5, Math.min(-0.3, rawPace)) : Math.max(0.3, Math.min(2.5, rawPace));
      const clip = resolveActionClip(state, requested);
      if (!clip) return;
      const action = state.actions.get(clip)!;
      const previous = state.current ? state.actions.get(state.current) : undefined;
      // A still-registered listener from an earlier one-shot that hasn't
      // finished yet (e.g. F then G before punching's own clip ends) must be
      // detached now, before it's replaced -- left in place, it fires later
      // on the OLD action's own completion, still passes its own `event.action
      // !== action` identity check (that guards against a *different* clip,
      // not a *stale* one), and clobbers state.oneShot/state.current out from
      // under whatever this newer one-shot is still doing.
      if (state.oneShotHandler) {
        state.mixer.removeEventListener("finished", state.oneShotHandler);
        state.oneShotHandler = undefined;
      }
      // A looping request (Eden's work actions) goes on until the script asks for something else; it never "finishes", so the ground-speed picker leaves it alone.
      const repeat = !backwards && (paceText !== undefined || (C.actionLoops?.has(requested) ?? false));
      action.reset().setLoop(repeat ? THREE.LoopRepeat : THREE.LoopOnce, repeat ? Infinity : 1);
      action.clampWhenFinished = !repeat;
      action.timeScale = pace;
      if (backwards) action.time = action.getClip().duration;
      action.fadeIn(0.15).play();
      if (previous && previous !== action) previous.fadeOut(0.15);
      state.current = clip;
      state.oneShot = true;
      // Captured now, not re-resolved from doc.scene inside onFinished --
      // rebuild() never runs mid-Play (same invariant startDeath() already
      // relies on), so this entity/index pairing stays valid for as long as
      // this one-shot can still be playing.
      const entity = entities[i];
      const onFinished = (event: { action: THREE.AnimationAction }) => {
        if (event.action !== action) return;
        state.oneShot = false;
        state.mixer.removeEventListener("finished", onFinished);
        state.oneShotHandler = undefined;
        // An authored AnimationState.clip (see rebuild()) pins a specific
        // resting clip that the ground-speed picker deliberately never
        // fights (it treats `overridden` as "leave it alone"). Left
        // unhandled, that means nobody ever un-clamps this one-shot's own
        // final frame once it's done -- the entity would sit there forever
        // instead of returning to its authored pin. Replay the pin with the
        // exact same loop/time configuration rebuild() itself applies.
        const override = entity && C.doc.scene.resolve(entity, "AnimationState");
        if (override?.clip && state.actions.has(override.clip)) {
          const pinned = state.actions.get(override.clip)!;
          pinned.setLoop(override.looping ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
          pinned.clampWhenFinished = !override.looping;
          if (Number.isFinite(override.time)) pinned.time = override.time;
          pinned.reset().fadeIn(0.15).play();
          if (pinned !== action) action.fadeOut(0.15);
          state.current = override.clip;
        } else {
          // No authored pin -- hand this action back to ordinary looping
          // playback instead of leaving it clamped on its final frame.
          // Needed even though the ground-speed picker below also resets
          // loop mode on every clip it (re)selects: if the requested clip
          // shares its name with whatever's already state.current (a script
          // reusing a locomotion clip's own name as its "hit" animation,
          // e.g. self.animate = "idle" while already idle), the picker's
          // `clipName !== state.current` guard is false and it never
          // revisits this action at all -- it would otherwise stay frozen
          // forever with no further event to unstick it.
          action.setLoop(THREE.LoopRepeat, Infinity);
          action.clampWhenFinished = false;
          action.reset().play();
        }
      };
      // A held pose (lying down, backwards) has nothing to hand back: it stays until the script asks for something else.
      if (!backwards) {
        state.oneShotHandler = onFinished;
        state.mixer.addEventListener("finished", onFinished);
      }
    });
  }

  // One Animator step for entity i: built-in parameters, events to the
  // entity's script, and a crossfade when the state changes.
  function runAnimator(i: number, state: AnimState, animator: AnimatorRuntime, speed: number, verticalSpeed: number, dt: number) {
    animator.set("speed", speed);
    animator.set("vy", verticalSpeed);
    animator.set("grounded", Math.abs(verticalSpeed) < 0.2);
    const clip = state.actions.get(animator.current.clip)?.getClip();
    const result = animator.step(dt, clip?.duration);
    for (const name of result.events) C.runtime.ccall("editor_script_notify", null, ["number", "string", "string"], [i, "on_anim_event", name]);
    if (!result.entered) return;
    const next = state.actions.get(result.entered.state.clip);
    if (next) {
      const previous = state.current ? state.actions.get(state.current) : undefined;
      next.setLoop(result.entered.state.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      next.clampWhenFinished = !result.entered.state.loop;
      next.setEffectiveTimeScale(result.entered.state.speed);
      next.reset().fadeIn(result.entered.fade).play();
      if (previous && previous !== next) previous.fadeOut(result.entered.fade);
      state.current = result.entered.state.clip;
    }
    C.runtime.ccall("editor_script_notify", null, ["number", "string", "string"], [i, "on_anim_state", result.entered.state.name]);
  }
  Object.assign(C, { resolveActionClip, pollAnimationRequests, runAnimator });
}
