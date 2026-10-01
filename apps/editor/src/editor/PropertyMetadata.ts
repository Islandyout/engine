import { modelCatalog } from "../scene/modelCatalog";
import { soundCatalog } from "../scene/soundCatalog";

export interface PropertyMetadata {
  label?: string;
  options?: readonly { label: string; value: string | number }[];
  readOnly?: boolean;
  step?: string;
  // Renders a <textarea> instead of a single-line <input> — for a field
  // whose value is expected to span multiple lines (currently just
  // Script.source), not a general "long string" hint.
  multiline?: boolean;
}
const choice = (values: readonly string[]) =>
  values.map((value) => ({ label: value, value }));
// For a field whose stored value is its numeric position (Vehicle.archetype,
// Pedestrian.archetype) rather than the label itself (AIState.state) --
// order here must match the corresponding native enum's own declared order
// (VehicleArchetype/PedestrianArchetype, bridge.cpp) exactly, since that
// order is what main.ts's syncRuntime() actually sends to editor_add.
const indexedChoice = (labels: readonly string[]) =>
  labels.map((label, value) => ({ label, value }));
const metadata: Record<string, PropertyMetadata> = {
  "AIState.state": {
    options: choice([
      "Idle",
      "Walking",
      "Running",
      "Driving",
      "Fleeing",
      "Chasing",
      "Dead",
    ]),
  },
  "Collider.type": { options: choice(["AABB", "Sphere"]) },
  "Collider.isTrigger": { label: "Trigger (overlap only, not solid)" },
  "Collider.layer": { label: "Layer (0-31)", step: "1" },
  "Collider.mask": { label: "Collides with (layer bitmask)", step: "1" },
  "Collider.bounciness": { label: "Bounciness (0-1)", step: "0.05" },
  "RigidBody.mass": { label: "Mass (kg)", step: "0.1" },
  "RigidBody.dynamic": { label: "Dynamic (off = kinematic)" },
  "Light.type": { options: choice(["Point", "Spot", "Directional"]) },
  "Light.color.x": { label: "Color R (0-1)", step: "0.05" },
  "Light.color.y": { label: "Color G (0-1)", step: "0.05" },
  "Light.color.z": { label: "Color B (0-1)", step: "0.05" },
  "Light.intensity": { step: "0.1" },
  "Light.range": { label: "Range (Point/Spot; 0 = unlimited)", step: "1" },
  "Light.angle": { label: "Cone angle (Spot, radians)", step: "0.05" },
  "Light.castShadows": { label: "Cast shadows" },
  "Environment.sky": { options: choice(["Color", "Gradient", "Procedural"]) },
  "Environment.fog": { options: choice(["None", "Linear", "Exponential"]) },
  "Environment.sunElevation": { label: "Sun elevation (degrees)", step: "1" },
  "Environment.sunAzimuth": { label: "Sun azimuth (degrees)", step: "1" },
  "Environment.sunIntensity": { step: "0.1" },
  "Environment.ambientIntensity": { label: "Ambient intensity", step: "0.1" },
  "Environment.fogNear": { label: "Fog start (Linear)", step: "1" },
  "Environment.fogFar": { label: "Fog end (Linear)", step: "1" },
  "Environment.fogDensity": { label: "Fog density (Exponential)", step: "0.001" },
  "Environment.shadows": { label: "Sun shadows" },
  "Environment.exposure": { label: "Exposure", step: "0.05" },
  "Camera.projection": { options: choice(["Perspective", "Orthographic"]) },
  "CharacterController.mode": { options: choice(["FirstPerson", "ThirdPerson"]) },
  "CharacterController.walkSpeed": { label: "Walk speed", step: "0.1" },
  "CharacterController.sprintSpeed": { label: "Sprint speed", step: "0.1" },
  "CharacterController.crouchSpeed": { label: "Crouch speed", step: "0.1" },
  "CharacterController.jumpHeight": { label: "Jump height", step: "0.05" },
  "CharacterController.standHeight": { label: "Standing height", step: "0.05" },
  "CharacterController.crouchHeight": { label: "Crouching height", step: "0.05" },
  "CharacterController.stepHeight": { label: "Max step height", step: "0.05" },
  "CharacterController.acceleration": { label: "Ground acceleration", step: "1" },
  "CharacterController.airControl": { label: "Air control (acceleration)", step: "1" },
  "CharacterController.lookSensitivity": { label: "Look sensitivity", step: "0.05" },
  "CharacterController.invertY": { label: "Invert look Y" },
  "CharacterController.fov": { label: "Field of view (degrees)", step: "1" },
  "CharacterController.headBob": { label: "Head bob (0 = off)", step: "0.1" },
  "AICombat.team": { label: "Team (Player is 0)", step: "1" },
  "AICombat.behavior": { options: choice(["Patrol", "Guard", "Hunt"]) },
  "AICombat.patrol": { label: "Patrol waypoints (entity names, comma-separated)" },
  "AICombat.sightRange": { label: "Sight range", step: "1" },
  "AICombat.fov": { label: "Field of view (degrees)", step: "5" },
  "AICombat.hearingRange": { label: "Hearing range (gunfire)", step: "1" },
  "AICombat.reactionTime": { label: "Reaction time (s)", step: "0.05" },
  "AICombat.accuracy": { label: "Accuracy (0-1)", step: "0.05" },
  "AICombat.preferredRange": { label: "Preferred fighting range", step: "0.5" },
  "AICombat.moveSpeed": { label: "Move speed", step: "0.1" },
  "AICombat.burst": { label: "Shots per burst", step: "1" },
  "AICombat.burstPause": { label: "Pause between bursts (s)", step: "0.05" },
  "AICombat.useCover": { label: "Takes cover" },
  "AICombat.fleeHealth": { label: "Flee below health (0-1, 0 = never)", step: "0.05" },
  "AICombat.meleeDamage": { label: "Melee damage (without Weapons)", step: "1" },
  "Weapons.loadout": { label: "Loadout (name: key=value ...)", multiline: true },
  "CameraFollow.target": { label: "Target (entity name; empty = Player)" },
  "CameraFollow.smoothing": { label: "Smoothing (seconds)", step: "0.05" },
  "CameraFollow.lookHeight": { label: "Look height", step: "0.1" },
  "CameraFollow.collision": { label: "Avoid obstacles" },
  "CameraFollow.orbit": { label: "Orbit by dragging" },
  "Camera.fov": { label: "Field of view (degrees, vertical)", step: "1" },
  "Camera.orthoSize": { label: "Orthographic size (half height)", step: "0.5" },
  "Camera.priority": { label: "Priority (highest active camera renders)", step: "1" },
  "Material.metalness": { step: "0.05" },
  "Material.roughness": { step: "0.05" },
  "Material.opacity": { label: "Opacity (0-1)", step: "0.05" },
  "Material.emissiveIntensity": { label: "Emissive intensity", step: "0.1" },
  "Material.keepTextures": { label: "Keep model textures (tint only)" },
  "Material.texture": { label: "Texture (URL or asset:file.png)" },
  "Material.color.x": { label: "color R (0-1)", step: "0.05" },
  "Material.color.y": { label: "color G (0-1)", step: "0.05" },
  "Material.color.z": { label: "color B (0-1)", step: "0.05" },
  "Material.emissive.x": { label: "emissive R (0-1)", step: "0.05" },
  "Material.emissive.y": { label: "emissive G (0-1)", step: "0.05" },
  "Material.emissive.z": { label: "emissive B (0-1)", step: "0.05" },
  "Environment.skyColor.x": { label: "skyColor R (0-1)", step: "0.05" },
  "Environment.skyColor.y": { label: "skyColor G (0-1)", step: "0.05" },
  "Environment.skyColor.z": { label: "skyColor B (0-1)", step: "0.05" },
  "Environment.horizonColor.x": { label: "horizonColor R (0-1)", step: "0.05" },
  "Environment.horizonColor.y": { label: "horizonColor G (0-1)", step: "0.05" },
  "Environment.horizonColor.z": { label: "horizonColor B (0-1)", step: "0.05" },
  "Environment.groundColor.x": { label: "groundColor R (0-1)", step: "0.05" },
  "Environment.groundColor.y": { label: "groundColor G (0-1)", step: "0.05" },
  "Environment.groundColor.z": { label: "groundColor B (0-1)", step: "0.05" },
  "Environment.sunColor.x": { label: "sunColor R (0-1)", step: "0.05" },
  "Environment.sunColor.y": { label: "sunColor G (0-1)", step: "0.05" },
  "Environment.sunColor.z": { label: "sunColor B (0-1)", step: "0.05" },
  "Environment.fogColor.x": { label: "fogColor R (0-1)", step: "0.05" },
  "Environment.fogColor.y": { label: "fogColor G (0-1)", step: "0.05" },
  "Environment.fogColor.z": { label: "fogColor B (0-1)", step: "0.05" },
  "Particles.preset": { options: choice(["Sparkle", "Smoke", "Fire", "Confetti"]) },
  "Particles.color.x": { label: "Color R (0-1)", step: "0.05" },
  "Particles.color.y": { label: "Color G (0-1)", step: "0.05" },
  "Particles.color.z": { label: "Color B (0-1)", step: "0.05" },
  "Particles.rate": { label: "Emission rate (particles/sec)", step: "1" },
  "Particles.lifetime": { label: "Lifetime (seconds)", step: "0.1" },
  "Particles.speed": { label: "Initial speed (m/s)", step: "0.1" },
  "Particles.size": { label: "Point size (world units)", step: "0.01" },
  "Particles.endColor.x": { label: "End color R (0-1)", step: "0.05" },
  "Particles.endColor.y": { label: "End color G (0-1)", step: "0.05" },
  "Particles.endColor.z": { label: "End color B (0-1)", step: "0.05" },
  "Particles.endSize": { label: "End size (x start size)", step: "0.1" },
  "Particles.gravityScale": { label: "Gravity scale", step: "0.1" },
  "Particles.shape": { options: choice(["Point", "Sphere", "Box", "Cone"]) },
  "Particles.shapeSize": { label: "Shape size (radius/half-extent)", step: "0.1" },
  "Particles.coneAngle": { label: "Cone angle (degrees)", step: "1" },
  "Particles.space": { label: "Simulation space", options: choice(["Local", "World"]) },
  "Particles.burst": { label: "Burst at Play start (count)", step: "1" },
  "Trail.color.x": { label: "Color R (0-1)", step: "0.05" },
  "Trail.color.y": { label: "Color G (0-1)", step: "0.05" },
  "Trail.color.z": { label: "Color B (0-1)", step: "0.05" },
  "Trail.width": { label: "Width (world units)", step: "0.05" },
  "Trail.lifetime": { label: "Lifetime (seconds)", step: "0.1" },
  "Trail.minDistance": { label: "Min point distance", step: "0.05" },
  "UI.kind": { options: choice(["Text", "Button", "Panel", "Image", "Bar", "Slider", "Toggle"]) },
  "UI.offsetX": { label: "Offset X (px)", step: "1" },
  "UI.offsetY": { label: "Offset Y (px, down)", step: "1" },
  "UI.width": { label: "Width (px, 0 = auto)", step: "1" },
  "UI.height": { label: "Height (px, 0 = auto)", step: "1" },
  "UI.fontSize": { label: "Font size (px)", step: "1" },
  "UI.color.x": { label: "Color R (0-1)", step: "0.05" },
  "UI.color.y": { label: "Color G (0-1)", step: "0.05" },
  "UI.color.z": { label: "Color B (0-1)", step: "0.05" },
  "UI.opacity": { label: "Opacity (0-1)", step: "0.05" },
  "UI.image": { label: "Image URL (Image)" },
  "UI.value": { label: "Value (0-1: Bar, Slider, Toggle)", step: "0.05" },
  "UI.anchor": {
    options: choice([
      "top-left",
      "top-center",
      "top-right",
      "middle-left",
      "center",
      "middle-right",
      "bottom-left",
      "bottom-center",
      "bottom-right",
    ]),
  },
  "UI.visibleWhen": {
    label: "Visible in",
    options: choice(["always", "play", "pause"]),
  },
  "UI.action": {
    label: "Action (Button; script = call on_ui)",
    options: choice(["restart", "resume", "pause", "quit", "script"]),
  },
  "Pedestrian.archetype": {
    label: "Archetype",
    options: indexedChoice(["Casual", "Brisk", "Lingering"]),
  },
  "Vehicle.archetype": {
    label: "Archetype",
    options: indexedChoice(["Car", "Sports", "Truck", "Bus"]),
  },
  "Renderable.mesh": {
    label: "Model",
    // Id 0 (the default box) isn't a modelCatalog entry — it's the fallback a
    // mesh renders as before any catalog model has loaded, not a placeable
    // choice of its own — so it's listed here and nowhere else. Every other
    // id, bench (1) included, comes from modelCatalog itself.
    // A getter, not a fixed list: models imported at runtime (userAssets.ts)
    // join modelCatalog after this module loads.
    get options() {
      return [
        { label: "Box", value: 0 },
        ...modelCatalog.map((m) => ({
          label: `${m.category[0]!.toUpperCase()}${m.category.slice(1)}: ${m.name}`,
          value: m.id,
        })),
      ];
    },
  },
  "Renderable.material": { label: "Material (from model)", readOnly: true },
  "RigidBody.inverseMass": { label: "Inverse mass (derived)", readOnly: true },
  "Rotation.euler.x": { label: "X (radians)", step: "0.1" },
  "Rotation.euler.y": { label: "Y (radians)", step: "0.1" },
  "Rotation.euler.z": { label: "Z (radians)", step: "0.1" },
  "Script.source": { label: "Lua source", multiline: true },
  "Animator.graph": { label: "State machine (see docs)", multiline: true },
  "InputActions.bindings": { label: "Action bindings (action: input, input)", multiline: true },
  "Sound.clip": {
    label: "Clip",
    get options() {
      return soundCatalog.map((s) => ({
        label: `${s.category[0]!.toUpperCase()}${s.category.slice(1)}: ${s.name}`,
        value: s.id,
      }));
    },
  },
  "Sound.volume": { step: "0.05" },
};
export function propertyMetadata(
  component: string,
  path: string,
): PropertyMetadata {
  return metadata[`${component}.${path}`] ?? {};
}

// Friendlier display names for the inspector's "Add component" list and each
// attached component card's own header -- the type name itself (used by
// every command/save-file/test in this codebase) is untouched; this is
// presentation only. Omitted types just show their own name as-is.
const componentLabels: Record<string, string> = {
  AIState: "AI Behavior",
  RigidBody: "Physics Body",
  // Most authoring goes through the Animation clip picker this round adds
  // directly to the Renderable card (main.ts) -- this is the advanced form
  // (time/looping) for anyone who needs it, not the everyday path.
  AnimationState: "Animation (advanced)",
};
export function componentLabel(type: string): string {
  return componentLabels[type] ?? type;
}

// Groups for the "Add component" list, in display order -- also the single
// source of truth for which component types are ever offered there (main.ts
// derives its flat addable-types list by flattening this). Grouped so
// components that only make sense together stay next to each other instead
// of scattered across one long alphabetical-ish list: AIState/Pedestrian
// (Pedestrian just marks an AIState entity harmless), Player/Vehicle
// (Vehicle only does anything once Player is driving it), Renderable/
// AnimationState (the clip picker needs a model to have clips), and the
// Velocity/Acceleration/RigidBody/Collider movement-and-collision chain.
export interface ComponentGroup {
  label: string;
  types: readonly string[];
}
export const componentGroups: readonly ComponentGroup[] = [
  { label: "Transform", types: ["Transform", "Rotation", "Scale"] },
  {
    label: "Movement & Physics",
    types: ["Velocity", "Acceleration", "RigidBody", "Collider"],
  },
  {
    label: "Gameplay",
    types: ["Health", "AIState", "AICombat", "Pedestrian", "Player", "CharacterController", "Weapons", "Vehicle"],
  },
  {
    label: "Appearance & Animation",
    types: ["Renderable", "Material", "Animator", "AnimationState", "Light", "Particles", "Trail"],
  },
  { label: "Scripting & Audio", types: ["Script", "Sound"] },
  { label: "UI", types: ["UI"] },
  { label: "Scene & Camera", types: ["Environment", "Camera", "CameraFollow", "InputActions"] },
];
