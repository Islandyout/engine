// Grass that grows round the camera. A scatter rule with `near=M` (foliage.ts) is not placed in the terrain: tufts are grown on the
// ground within M metres of the camera, a few per square metre, and regrown as the camera moves. A map a kilometre across can have
// grass a step apart where you stand, for the cost of a few thousand instances, and none where you are not.
//
// Placement is a pure function of the cell (cell coordinates, rule, seed), so the same patch of ground always grows the same tufts.
import * as THREE from "three";
import type { FoliageGround, ScatterRule } from "./foliage";
import { hash } from "./terrain";
import type { ScatterModel } from "./terrainMesh";

// Metres per side of a grass cell.
export const grassCell = 4;
// A tuft fades (shrinks) over the outer fraction of its rule's distance, so the edge of the field is a slope, not a line.
const fadeBand = 0.3;
// The camera must move this far before the field regrows.
const regrowDistance = 1.5;

export interface Tuft {
  x: number;
  y: number;
  z: number;
  scale: number;
  yaw: number;
  tint: number;
}

// The tufts of one rule in one cell, standing on `ground` (local x/z): deterministic, so a cell regrown later is the same.
export function cellTufts(rule: ScatterRule, ruleIndex: number, cx: number, cz: number, ground: FoliageGround, seed: number): Tuft[] {
  const out: Tuft[] = [];
  const wanted = rule.density * grassCell * grassCell;
  // A fractional count is rounded by chance, so a density below one tuft a cell still grows some.
  const count = Math.floor(wanted) + (hash(cx, cz, seed + ruleIndex * 7 + 3) < wanted - Math.floor(wanted) ? 1 : 0);
  for (let k = 0; k < count; k++) {
    const x = (cx + hash(k, cx * 31 + cz, seed + ruleIndex * 101 + 1)) * grassCell;
    const z = (cz + hash(k, cz * 17 + cx, seed + ruleIndex * 101 + 2)) * grassCell;
    const n = ground.normal(x, z);
    if (n[1] < rule.maxSlope) continue;
    if (ground.blocked?.(x, z)) continue;
    const y = ground.height(x, z);
    if (rule.heightMin !== undefined && (y < rule.heightMin || y > rule.heightMax!)) continue;
    if (rule.layers && ground.layer && !rule.layers.includes(ground.layer(x, z, y, n[1]))) continue;
    const scale = rule.minScale + (rule.maxScale - rule.minScale) * hash(k, cx + cz * 13, seed + ruleIndex * 101 + 5);
    out.push({
      x,
      y,
      z,
      scale,
      yaw: hash(k, cx * 5 + cz, seed + ruleIndex * 101 + 6) * Math.PI * 2,
      tint: 1 + (hash(k, cx + cz * 3, seed + ruleIndex * 101 + 7) * 2 - 1) * (rule.tint ?? 0),
    });
  }
  return out;
}

// How much of its size a tuft keeps at this distance from the camera for a rule's reach.
export function grassFade(distance: number, reach: number): number {
  return Math.min(1, Math.max(0, (reach - distance) / (reach * fadeBand)));
}

interface Layer {
  rule: ScatterRule;
  ruleIndex: number;
  meshes: THREE.InstancedMesh[];
  // The model's mesh transforms (child.matrixWorld), lifted so the root stands on y = 0.
  parts: THREE.Matrix4[];
  bottom: number;
  cells: Map<string, Tuft[]>;
}

const fields = new Set<GrassField>();

export class GrassField {
  readonly group = new THREE.Group();
  private layers: Layer[] = [];
  private last: { x: number; z: number } | undefined;
  // True once it has been in a scene: after that, leaving one ends it.
  seen = false;

  constructor(
    rules: ScatterRule[],
    private ground: FoliageGround,
    models: Map<number, ScatterModel>,
    private seed: number,
    makeMaterial: (material: THREE.Material, height: number, bottom: number) => THREE.Material,
  ) {
    this.group.name = "terrain-grass";
    rules.forEach((rule, ruleIndex) => {
      const model = models.get(rule.model);
      if (!model || !rule.near) return;
      model.scene.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(model.scene);
      const capacity = Math.ceil(Math.PI * rule.near * rule.near * rule.density * 1.35) + 256;
      const layer: Layer = { rule, ruleIndex, meshes: [], parts: [], bottom: bounds.min.y, cells: new Map() };
      model.scene.traverse((child) => {
        if (!(child instanceof THREE.Mesh) || Array.isArray(child.material)) return;
        const mesh = new THREE.InstancedMesh(child.geometry, makeMaterial(child.material, bounds.max.y - bounds.min.y, bounds.min.y), capacity);
        mesh.count = 0;
        mesh.frustumCulled = false; // its tufts move with the camera: a fixed bounding sphere would be wrong
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        layer.meshes.push(mesh);
        layer.parts.push(child.matrixWorld.clone());
        this.group.add(mesh);
      });
      this.layers.push(layer);
    });
    fields.add(this);
  }

  get empty() {
    return this.layers.length === 0;
  }

  // Regrows the tufts round (x, z), the camera in the terrain's own coordinates.
  update(x: number, z: number) {
    if (this.last && Math.hypot(x - this.last.x, z - this.last.z) < regrowDistance) return;
    this.last = { x, z };
    const matrix = new THREE.Matrix4(),
      placement = new THREE.Matrix4(),
      rotation = new THREE.Quaternion(),
      up = new THREE.Vector3(0, 1, 0),
      position = new THREE.Vector3(),
      size = new THREE.Vector3(),
      tint = new THREE.Color();
    for (const layer of this.layers) {
      const reach = layer.rule.near!;
      const c0 = Math.floor((x - reach) / grassCell), c1 = Math.floor((x + reach) / grassCell);
      const d0 = Math.floor((z - reach) / grassCell), d1 = Math.floor((z + reach) / grassCell);
      // Forget the cells that are out of reach, grow the ones that came into it.
      const live = new Set<string>();
      for (let cx = c0; cx <= c1; cx++)
        for (let cz = d0; cz <= d1; cz++) {
          const key = `${cx},${cz}`;
          live.add(key);
          if (!layer.cells.has(key)) layer.cells.set(key, cellTufts(layer.rule, layer.ruleIndex, cx, cz, this.ground, this.seed));
        }
      for (const key of layer.cells.keys()) if (!live.has(key)) layer.cells.delete(key);
      const capacity = layer.meshes[0]?.instanceMatrix.count ?? 0;
      let n = 0;
      for (const tufts of layer.cells.values())
        for (const t of tufts) {
          const fade = grassFade(Math.hypot(t.x - x, t.z - z), reach);
          if (fade <= 0.04 || n >= capacity) continue;
          const s = t.scale * fade;
          rotation.setFromAxisAngle(up, t.yaw);
          placement.compose(position.set(t.x, t.y - layer.bottom * s, t.z), rotation, size.set(s, s, s));
          tint.setScalar(t.tint);
          layer.meshes.forEach((mesh, i) => {
            matrix.multiplyMatrices(placement, layer.parts[i]!);
            mesh.setMatrixAt(n, matrix);
            mesh.setColorAt(n, tint);
          });
          n++;
        }
      for (const mesh of layer.meshes) {
        mesh.count = n;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    }
  }
}

// Called each frame with the camera's world position: every live field regrows round it (fields no longer in a scene are dropped).
export function updateGrassFields(camera: THREE.Vector3) {
  const local = new THREE.Vector3();
  for (const field of fields) {
    let top: THREE.Object3D = field.group;
    while (top.parent) top = top.parent;
    if (!(top instanceof THREE.Scene)) {
      if (field.seen) fields.delete(field);
      continue;
    }
    field.seen = true;
    field.group.worldToLocal(local.copy(camera));
    field.update(local.x, local.z);
  }
}
