import { modelCatalog } from "../scene/modelCatalog";

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
};
export function propertyMetadata(
  component: string,
  path: string,
): PropertyMetadata {
  return metadata[`${component}.${path}`] ?? {};
}
