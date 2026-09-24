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
  "Particles.preset": { options: choice(["Sparkle", "Smoke", "Fire", "Confetti"]) },
  "Particles.color.x": { label: "Color R (0-1)", step: "0.05" },
  "Particles.color.y": { label: "Color G (0-1)", step: "0.05" },
  "Particles.color.z": { label: "Color B (0-1)", step: "0.05" },
  "Particles.rate": { label: "Emission rate (particles/sec)", step: "1" },
  "Particles.lifetime": { label: "Lifetime (seconds)", step: "0.1" },
  "Particles.speed": { label: "Initial speed (m/s)", step: "0.1" },
  "Particles.size": { label: "Point size (world units)", step: "0.01" },
  "UI.kind": { options: choice(["Text", "Button"]) },
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
    label: "Action (Button only)",
    options: choice(["restart", "resume", "pause", "quit"]),
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
    options: [
      { label: "Box", value: 0 },
      ...modelCatalog.map((m) => ({
        label: `${m.category[0]!.toUpperCase()}${m.category.slice(1)}: ${m.name}`,
        value: m.id,
      })),
    ],
  },
  "Renderable.material": { label: "Material (from model)", readOnly: true },
  "RigidBody.inverseMass": { label: "Inverse mass (derived)", readOnly: true },
  "Rotation.euler.x": { label: "X (radians)", step: "0.1" },
  "Rotation.euler.y": { label: "Y (radians)", step: "0.1" },
  "Rotation.euler.z": { label: "Z (radians)", step: "0.1" },
  "Script.source": { label: "Lua source", multiline: true },
  "Sound.clip": {
    label: "Clip",
    options: soundCatalog.map((s) => ({
      label: `${s.category[0]!.toUpperCase()}${s.category.slice(1)}: ${s.name}`,
      value: s.id,
    })),
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
    types: ["Health", "AIState", "Pedestrian", "Player", "Vehicle"],
  },
  {
    label: "Appearance & Animation",
    types: ["Renderable", "AnimationState", "Light", "Particles"],
  },
  { label: "Scripting & Audio", types: ["Script", "Sound"] },
  { label: "UI", types: ["UI"] },
];
