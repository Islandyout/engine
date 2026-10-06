// Scene-wide settings entities: the UI, Environment, PostProcessing,
// AudioSettings and InputActions holders. Without a Renderable they have no
// body of their own: no stand-in box during Play and no physics. (They used
// to get a dynamic 1 m box that, lifted onto the ground, sat invisibly at the
// origin and stopped anything walking through it.) Authoring a Collider,
// RigidBody, Health or Player on one makes it an ordinary physical entity.
import type { SceneComponents } from "../scene/Scene";

type Get = <K extends keyof SceneComponents>(type: K) => SceneComponents[K] | undefined;

export function isSettingsOnly(get: Get): boolean {
  if (get("Renderable")) return false;
  return !!(get("UI") || get("Environment") || get("PostProcessing") || get("AudioSettings") || get("InputActions"));
}

export function isNonPhysical(get: Get): boolean {
  return isSettingsOnly(get) && !get("Collider") && !get("RigidBody") && !get("Health") && !get("Player");
}
