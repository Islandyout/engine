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
  { label: "Appearance & Animation", types: ["Renderable", "AnimationState"] },
  { label: "Scripting & Audio", types: ["Script", "Sound"] },
];
