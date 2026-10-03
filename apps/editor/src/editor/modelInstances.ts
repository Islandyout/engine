// ModelInstances (0.70.0): many copies of catalog models from one entity,
// one per line, "model x z [yaw degrees] [scale] [solid]". Drawn with the
// terrain scatter's chunked instancing (terrainMesh.ts buildScatter); solid
// ones become static obstacles covering their whole rotated footprint.
import type { ScatterInstance } from "./terrain";

export interface ModelInstance extends ScatterInstance {
  solid: boolean;
}

export function parseModelInstances(text: string): { instances: ModelInstance[]; errors: string[] } {
  const instances: ModelInstance[] = [];
  const errors: string[] = [];
  text.split("\n").forEach((raw, i) => {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) return;
    const parts = line.split(/\s+/);
    const solid = parts[parts.length - 1] === "solid";
    if (solid) parts.pop();
    const [model, x, z, yaw = 0, scale = 1] = parts.map(Number);
    if (
      parts.length < 3 ||
      parts.length > 5 ||
      !Number.isInteger(model) ||
      model! < 1 ||
      ![x, z, yaw, scale].every((n) => Number.isFinite(n)) ||
      !(scale > 0)
    ) {
      errors.push(`line ${i + 1}: expected "model x z [yaw] [scale] [solid]"`);
      return;
    }
    if (instances.length >= 8000) return;
    instances.push({ model: model!, x: x!, y: 0, z: z!, yaw: (yaw * Math.PI) / 180, scale, collide: solid, solid });
  });
  return { instances, errors };
}

// The axis-aligned box a solid instance occupies, from its model's native
// size (footprint rotated by its yaw, standing on y = 0).
export function instanceBox(instance: ModelInstance, size: { x: number; y: number; z: number }) {
  const c = Math.abs(Math.cos(instance.yaw)),
    s = Math.abs(Math.sin(instance.yaw));
  const sx = (size.x * c + size.z * s) * instance.scale;
  const sz = (size.x * s + size.z * c) * instance.scale;
  const sy = size.y * instance.scale;
  return { x: instance.x, y: instance.y + sy / 2, z: instance.z, sx, sy, sz };
}
