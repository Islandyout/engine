// Scene-wide settings entities and invisible helpers.
//
// Settings entities (UI, Environment, PostProcessing, AudioSettings,
// InputActions without a Renderable) show no stand-in box during Play.
//
// An entity with no visible model and nothing physical about it (a Light, a
// particle emitter, a camera, a director Script, a settings holder) gets no
// body either. Every entity used to get a dynamic 1 m box: helpers fell to
// the ground as invisible boxes that blocked anyone walking through them.
// Authoring a Collider, RigidBody, Health, Velocity or any movement or AI
// component keeps it an ordinary physical entity.
import type { SceneComponents } from "../scene/Scene";

type Get = <K extends keyof SceneComponents>(type: K) => SceneComponents[K] | undefined;

export function isSettingsOnly(get: Get): boolean {
  if (get("Renderable")) return false;
  return !!(get("UI") || get("Environment") || get("PostProcessing") || get("AudioSettings") || get("InputActions"));
}

const physical = [
  "Collider",
  "RigidBody",
  "Health",
  "Player",
  "Velocity",
  "CharacterController",
  "Melee",
  "Vehicle",
  "AIState",
  "Pedestrian",
  "AICombat",
  "Weapons",
  "Routine",
  "Wildlife",
  "Spaceship",
  "Terrain",
] as const;

export function isNonPhysical(get: Get): boolean {
  for (const type of physical) if (get(type as keyof SceneComponents)) return false;
  const renderable = get("Renderable");
  return !renderable || renderable.visible === false;
}
