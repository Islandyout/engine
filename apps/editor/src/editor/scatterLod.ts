// Distance versions of scattered models, chosen per instance. A terrain's scatter used to switch whole chunks between a model's near and far
// versions, and a chunk of a sparse model can be hundreds of metres wide: one tree inside it made every tree in it draw in full. Here every
// instance of a model is sorted each time the camera has moved a few metres: those within `near` metres draw as the detailed model, the rest
// as its far version (a few hundred triangles), each in one InstancedMesh per part of the model.
import * as THREE from "three";

// The frame governor's scatter fraction (frameGovernor.ts): the share of each model's instances, and of the grass, that is drawn. `version` changes
// with it so everything re-sorts at once.
export const scatterDensity = { fraction: 1, version: 0 };
export function setScatterDensity(fraction: number) {
  if (scatterDensity.fraction === fraction) return;
  scatterDensity.fraction = fraction;
  scatterDensity.version++;
}

// Metres from the camera within which an instance draws as the detailed model.
export const nearDistance = 70;
// Beyond this many metres an instance is not drawn at all (the fog has taken it).
export const cullDistance = 320;
// The camera must move this far before instances are sorted again.
const resortDistance = 6;

export interface LodPart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  // The part's transform inside its model (matrixWorld of the model's root, so the model stands at its origin).
  local: THREE.Matrix4;
}

export class DynamicLod {
  readonly group = new THREE.Group();
  private near: THREE.InstancedMesh[] = [];
  private far: THREE.InstancedMesh[] = [];
  private last: { x: number; z: number } | undefined;
  private lastVersion = -1;
  seen = false;

  // `placements` is one 4x4 matrix per instance (placement.elements, 16 floats each), `x`/`z` its ground position in the terrain.
  constructor(
    private placements: Float32Array,
    private xs: Float32Array,
    private zs: Float32Array,
    private tints: Float32Array | undefined,
    nearParts: LodPart[],
    farParts: LodPart[],
    castShadow: boolean,
  ) {
    this.group.name = "scatter-lod";
    const count = xs.length;
    const make = (parts: LodPart[], shadow: boolean) =>
      parts.map((part) => {
        const mesh = new THREE.InstancedMesh(part.geometry, part.material, count);
        mesh.count = 0;
        mesh.frustumCulled = false; // its instances change with the camera; a fixed bounding sphere would be wrong
        mesh.castShadow = shadow;
        mesh.receiveShadow = true;
        mesh.userData.part = part;
        this.group.add(mesh);
        return mesh;
      });
    this.near = make(nearParts, castShadow);
    this.far = make(farParts, false);
    dynamicLods.add(this);
  }

  update(x: number, z: number, force = false) {
    if (!force && this.last && this.lastVersion === scatterDensity.version && Math.hypot(x - this.last.x, z - this.last.z) < resortDistance) return;
    this.last = { x, z };
    this.lastVersion = scatterDensity.version;
    const drawn = Math.ceil(this.xs.length * scatterDensity.fraction);
    const matrix = new THREE.Matrix4(), placement = new THREE.Matrix4(), tint = new THREE.Color();
    let nearCount = 0, farCount = 0;
    for (let i = 0; i < drawn; i++) {
      const distance = Math.hypot(this.xs[i]! - x, this.zs[i]! - z);
      if (distance > cullDistance) continue;
      const isNear = distance < nearDistance;
      const meshes = isNear ? this.near : this.far;
      const n = isNear ? nearCount++ : farCount++;
      placement.fromArray(this.placements, i * 16);
      if (this.tints) tint.setScalar(this.tints[i]!);
      for (const mesh of meshes) {
        matrix.multiplyMatrices(placement, (mesh.userData.part as LodPart).local);
        mesh.setMatrixAt(n, matrix);
        if (this.tints) mesh.setColorAt(n, tint);
      }
    }
    for (const [meshes, n] of [[this.near, nearCount], [this.far, farCount]] as const)
      for (const mesh of meshes) {
        mesh.count = n;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
  }
}

const dynamicLods = new Set<DynamicLod>();

// Called each frame with the camera's world position: every live scatter re-sorts its instances round it (and forgets those no longer in a scene).
export function updateDynamicLods(camera: THREE.Vector3) {
  const local = new THREE.Vector3();
  for (const lod of dynamicLods) {
    let top: THREE.Object3D = lod.group;
    while (top.parent) top = top.parent;
    if (!(top as THREE.Scene).isScene) {
      if (lod.seen) dynamicLods.delete(lod);
      continue;
    }
    lod.seen = true;
    lod.group.worldToLocal(local.copy(camera));
    lod.update(local.x, local.z);
  }
}
