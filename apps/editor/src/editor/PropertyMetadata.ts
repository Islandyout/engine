import { modelCatalog } from "../scene/modelCatalog";

export interface PropertyMetadata {
  label?: string;
  options?: readonly { label: string; value: string | number }[];
  readOnly?: boolean;
  step?: string;
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
    options: [
      { label: "Box", value: 0 },
      { label: "Aether bench", value: 1 },
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
};
export function propertyMetadata(
  component: string,
  path: string,
): PropertyMetadata {
  return metadata[`${component}.${path}`] ?? {};
}
