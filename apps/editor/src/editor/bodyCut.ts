// A character on a base body (Quaternius Universal Base Characters) wears clothes made for the head only: the full body
// under them clips through ("using the full body will result in clipping", the outfit pack's own readme). So the body's
// triangles under a worn piece are left out of its index buffer: the tunic hides the torso, the sleeves the arms and so on.
// The geometry is shared between every character of the model, so a cut body gets a geometry of its own (the same vertex
// buffers, another index), shared by every character cut the same way.
import * as THREE from "three";

export type BodyRegion = "head" | "torso" | "arms" | "legs" | "feet" | "other";

// The part of the body a bone belongs to (the 65-bone UE-style skeleton).
export function regionOf(bone: string): BodyRegion {
  if (/^(head|neck)/i.test(bone)) return "head";
  if (/^(spine|clavicle)/.test(bone)) return "torso";
  if (/^(upperarm|lowerarm|hand|thumb|index|middle|ring|pinky)/.test(bone)) return "arms";
  if (/^(pelvis|thigh|calf)/.test(bone)) return "legs";
  if (/^(foot|ball)/.test(bone)) return "feet";
  return "other";
}

const REGIONS: BodyRegion[] = ["head", "torso", "arms", "legs", "feet", "other"];
// Which region each outfit piece (model catalog ids 379 to 398: Peasant and Ranger, male then female) covers.
const PIECE_REGION: Record<number, BodyRegion> = {};
for (const first of [379, 383, 389, 393]) {
  PIECE_REGION[first] = "torso";
  PIECE_REGION[first + 1] = "arms";
  PIECE_REGION[first + 2] = "legs";
  PIECE_REGION[first + 3] = "feet";
}
export function regionsCoveredBy(ids: readonly number[]): Set<BodyRegion> {
  const out = new Set<BodyRegion>();
  for (const id of ids) {
    const region = PIECE_REGION[id];
    if (region) out.add(region);
  }
  return out;
}

const regionsOfTriangles = new WeakMap<THREE.BufferGeometry, Uint8Array>();
const cuts = new Map<string, THREE.BufferGeometry>();

// The triangle's region: where most of its corners are skinned most heavily.
function triangleRegions(mesh: THREE.SkinnedMesh, geometry: THREE.BufferGeometry): Uint8Array {
  let regions = regionsOfTriangles.get(geometry);
  if (regions) return regions;
  const index = geometry.index!;
  const skinIndex = geometry.getAttribute("skinIndex");
  const skinWeight = geometry.getAttribute("skinWeight");
  const names = mesh.skeleton.bones.map((bone) => bone.name);
  const vertexRegion = new Uint8Array(skinIndex.count);
  for (let v = 0; v < skinIndex.count; v++) {
    let best = 0;
    let weight = -1;
    for (let k = 0; k < 4; k++) {
      if (skinWeight.getComponent(v, k) > weight) {
        weight = skinWeight.getComponent(v, k);
        best = skinIndex.getComponent(v, k);
      }
    }
    vertexRegion[v] = REGIONS.indexOf(regionOf(names[best] ?? ""));
  }
  regions = new Uint8Array(index.count / 3);
  for (let t = 0; t < regions.length; t++) {
    // The region two of its three corners agree on (the first corner's when all three differ).
    const a = vertexRegion[index.getX(t * 3)]!;
    const b = vertexRegion[index.getX(t * 3 + 1)]!;
    const c = vertexRegion[index.getX(t * 3 + 2)]!;
    regions[t] = b === c ? b : a;
  }
  regionsOfTriangles.set(geometry, regions);
  return regions;
}

// Leaves the triangles of `hide` out of a body's drawing; an empty set puts the whole body back.
export function cutBody(mesh: THREE.SkinnedMesh, hide: ReadonlySet<BodyRegion>): void {
  const original: THREE.BufferGeometry = mesh.userData.fullGeometry ?? mesh.geometry;
  mesh.userData.fullGeometry = original;
  if (!hide.size) {
    mesh.geometry = original;
    return;
  }
  const key = `${original.uuid}:${[...hide].sort().join(",")}`;
  let cut = cuts.get(key);
  if (!cut) {
    const regions = triangleRegions(mesh, original);
    const index = original.index!;
    const keep: number[] = [];
    for (let t = 0; t < regions.length; t++) {
      if (hide.has(REGIONS[regions[t]!]!)) continue;
      keep.push(index.getX(t * 3), index.getX(t * 3 + 1), index.getX(t * 3 + 2));
    }
    cut = new THREE.BufferGeometry();
    for (const name of Object.keys(original.attributes)) cut.setAttribute(name, original.getAttribute(name));
    cut.morphAttributes = original.morphAttributes;
    cut.setIndex(keep);
    cut.boundingSphere = original.boundingSphere;
    cut.boundingBox = original.boundingBox;
    cuts.set(key, cut);
  }
  mesh.geometry = cut;
}
