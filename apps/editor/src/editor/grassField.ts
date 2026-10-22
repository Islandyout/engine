// Grass that grows round the camera. A scatter rule with `near=M` (foliage.ts) is not placed in the terrain: tufts are grown on the
// ground within M metres of the camera, a few per square metre, and regrown as the camera moves. A map a kilometre across can have
// grass a step apart where you stand, for the cost of a few thousand instances, and none where you are not.
//
// Placement is a pure function of the cell (cell coordinates, rule, seed), so the same patch of ground always grows the same tufts. Each cell's
// matrices are built once, when it comes into reach, and kept; regrowing is then copying arrays, and the fade at the edge of reach is in the shader.
import * as THREE from "three";
import type { FoliageGround, ScatterRule } from "./foliage";
import { hash } from "./terrain";
import { scatterDensity } from "./scatterLod";
import type { GrassFade, ScatterModel } from "./terrainMesh";

// Metres per side of a grass cell.
export const grassCell = 4;
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

interface Layer {
  rule: ScatterRule;
  ruleIndex: number;
  meshes: THREE.InstancedMesh[];
  // The model's mesh transforms (child.matrixWorld), lifted so the root stands on y = 0.
  parts: THREE.Matrix4[];
  bottom: number;
  // Per cell: its tufts' matrices for each mesh of the model (16 floats a tuft) and their brightness.
  cells: Map<string, { count: number; matrices: Float32Array[]; tints: Float32Array }>;
}

const fields = new Set<GrassField>();

export class GrassField {
  readonly group = new THREE.Group();
  private layers: Layer[] = [];
  private last: { x: number; z: number } | undefined;
  private lastVersion = -1;
  // True once it has been in a scene: after that, leaving one ends it.
  seen = false;
  // Where the camera is, terrain-local x/z: the shader shrinks tufts toward the edge of their reach round it.
  private center = { value: new THREE.Vector2() };

  constructor(
    rules: ScatterRule[],
    private ground: FoliageGround,
    models: Map<number, ScatterModel>,
    private seed: number,
    makeMaterial: (material: THREE.Material, height: number, bottom: number, fade: GrassFade) => THREE.Material,
  ) {
    this.group.name = "terrain-grass";
    rules.forEach((rule, ruleIndex) => {
      const model = models.get(rule.model);
      if (!model || !rule.near) return;
      model.scene.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(model.scene);
      const capacity = Math.ceil(Math.PI * (rule.near + grassCell) ** 2 * rule.density * 1.2) + 256;
      const layer: Layer = { rule, ruleIndex, meshes: [], parts: [], bottom: bounds.min.y, cells: new Map() };
      const fade: GrassFade = { center: this.center, reach: rule.near };
      model.scene.traverse((child) => {
        if (!(child instanceof THREE.Mesh) || Array.isArray(child.material)) return;
        const mesh = new THREE.InstancedMesh(child.geometry, makeMaterial(child.material, bounds.max.y - bounds.min.y, bounds.min.y, fade), capacity);
        mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
        mesh.count = 0;
        mesh.frustumCulled = false; // its tufts move with the camera: a fixed bounding sphere would be wrong
        mesh.castShadow = false;
        mesh.userData.ownShadow = true;
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

  private grow(layer: Layer, cx: number, cz: number) {
    const tufts = cellTufts(layer.rule, layer.ruleIndex, cx, cz, this.ground, this.seed);
    const matrices = layer.parts.map(() => new Float32Array(tufts.length * 16));
    const tints = new Float32Array(tufts.length);
    const matrix = new THREE.Matrix4(), placement = new THREE.Matrix4(), rotation = new THREE.Quaternion(), position = new THREE.Vector3(), size = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    tufts.forEach((t, i) => {
      rotation.setFromAxisAngle(up, t.yaw);
      placement.compose(position.set(t.x, t.y - layer.bottom * t.scale, t.z), rotation, size.set(t.scale, t.scale, t.scale));
      layer.parts.forEach((part, p) => matrix.multiplyMatrices(placement, part).toArray(matrices[p]!, i * 16));
      tints[i] = t.tint;
    });
    return { count: tufts.length, matrices, tints };
  }

  // Moves the field to the camera at (x, z), terrain-local: the shader fade follows it every frame, and tufts are regrown when it crosses into another cell.
  update(x: number, z: number) {
    this.center.value.set(x, z);
    const cellX = Math.floor(x / grassCell), cellZ = Math.floor(z / grassCell);
    if (this.last && this.last.x === cellX && this.last.z === cellZ && this.lastVersion === scatterDensity.version) return;
    this.last = { x: cellX, z: cellZ };
    this.lastVersion = scatterDensity.version;
    for (const layer of this.layers) {
      const cells = Math.ceil(layer.rule.near! / grassCell) + 1;
      const live = new Set<string>();
      for (let cx = cellX - cells; cx <= cellX + cells; cx++)
        for (let cz = cellZ - cells; cz <= cellZ + cells; cz++) {
          if (Math.hypot((cx + 0.5 - x / grassCell) * grassCell, (cz + 0.5 - z / grassCell) * grassCell) > layer.rule.near! + grassCell * 1.5) continue;
          const key = `${cx},${cz}`;
          live.add(key);
          if (!layer.cells.has(key)) layer.cells.set(key, this.grow(layer, cx, cz));
        }
      for (const key of layer.cells.keys()) if (!live.has(key)) layer.cells.delete(key);
      const capacity = layer.meshes[0]?.instanceMatrix.count ?? 0;
      let n = 0;
      for (const cell of layer.cells.values()) {
        // The frame governor thins the grass by drawing only the first part of each cell (its tufts are in random order).
        const count = Math.ceil(cell.count * scatterDensity.fraction);
        if (n + count > capacity) break;
        layer.meshes.forEach((mesh, p) => {
          (mesh.instanceMatrix.array as Float32Array).set(cell.matrices[p]!.subarray(0, count * 16), n * 16);
          const colours = mesh.instanceColor!.array as Float32Array;
          for (let i = 0; i < count; i++) colours.fill(cell.tints[i]!, (n + i) * 3, (n + i) * 3 + 3);
        });
        n += count;
      }
      for (const mesh of layer.meshes) {
        mesh.count = n;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor!.needsUpdate = true;
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
