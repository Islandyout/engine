// Shared scene-building helpers for GATEBREAKER's scenes (tools/gatebreaker).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultComponent } from "../../apps/editor/src/authoring/CommandInterpreter";
import type { SceneDocument } from "../../apps/editor/src/scene/SceneSerializer";
import { modelCatalog } from "../../apps/editor/src/scene/modelCatalog";

export type Components = Record<string, unknown>;
export type V3 = [number, number, number];
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
export const vec = (x: number, y: number, z: number) => ({ x, y, z });
export const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return vec(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};
export const component = (type: string, overrides: Record<string, unknown> = {}) => ({
  ...(defaultComponent(type as never) as object),
  ...overrides,
});

// A catalog model's id by its file name (e.g. "wall-doorway"), any category.
export function modelId(file: string): number {
  const entry = modelCatalog.find((m) => m.path.endsWith(`/${file}.glb`));
  if (!entry) throw new Error(`no catalog model ${file}`);
  return entry.id;
}

const boundsCache = new Map<number, { min: number[]; max: number[] }>();
// A catalog model's bounds from its glTF's accessors (node transforms
// aside, which these kits don't use).
export function modelBounds(id: number) {
  const cached = boundsCache.get(id);
  if (cached) return cached;
  const entry = modelCatalog.find((m) => m.id === id)!;
  const bytes = readFileSync(join(ROOT, "assets/source", entry.path.replace(/^\.\//, "")));
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString("utf8"));
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const mesh of json.meshes)
    for (const p of mesh.primitives) {
      const a = json.accessors[p.attributes.POSITION];
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k]!, a.min[k]);
        max[k] = Math.max(max[k]!, a.max[k]);
      }
    }
  const bounds = { min, max };
  boundsCache.set(id, bounds);
  return bounds;
}

export class SceneBuilder {
  readonly entities: SceneDocument["entities"] = [];

  // Every component starts from its defaults, with the fields given on top.
  add(name: string, position: V3, components: Components): number {
    const full = Object.fromEntries(Object.entries(components).map(([type, value]) => [type, component(type, value as Record<string, unknown>)]));
    this.entities.push({ name, components: { Transform: { position: vec(...position) }, ...full } as never });
    return this.entities.length - 1;
  }

  // A catalog model with its origin at `origin`, turned `yaw` about y, at
  // its native size (times `scale`). The editor centres a model on its
  // entity, so it is placed by the centre of its bounds. Solid models get a
  // kinematic collision box their size; the rest a trigger.
  model(name: string, id: number, origin: V3, yaw = 0, solid = true, scale = 1, extra: Components = {}): number {
    const { min, max } = modelBounds(id);
    const centre = [0, 1, 2].map((k) => ((min[k]! + max[k]!) / 2) * scale);
    const size = [0, 1, 2].map((k) => (max[k]! - min[k]!) * scale);
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const offset: V3 = [centre[0]! * c + centre[2]! * s, centre[1]!, -centre[0]! * s + centre[2]! * c];
    return this.add(name, [origin[0] + offset[0], origin[1] + offset[1], origin[2] + offset[2]], {
      Rotation: { euler: vec(0, yaw, 0) },
      Scale: { value: vec(size[0]!, size[1]!, size[2]!) },
      Renderable: { mesh: id, material: 0, visible: true },
      RigidBody: { dynamic: false },
      Collider: { type: "AABB", isTrigger: !solid },
      ...extra,
    });
  }

  // A plain box (the placeholder mesh), e.g. a barrier or a pillar.
  box(name: string, centre: V3, size: V3, hex: string, extra: Components = {}, look: Record<string, unknown> = {}): number {
    return this.add(name, centre, {
      Scale: { value: vec(...size) },
      Renderable: { mesh: 0, material: 0, visible: true },
      Material: { color: rgb(hex), roughness: 0.8, keepTextures: false, ...look },
      RigidBody: { dynamic: false },
      Collider: { type: "AABB" },
      ...extra,
    });
  }
}
