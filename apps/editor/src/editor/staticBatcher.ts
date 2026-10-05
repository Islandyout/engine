// Static batching (0.76.0): while playing, scenery that never moves (no
// script, rig, AI or physics body) is merged into one mesh per material and
// site, so a town of hundreds of buildings is a few dozen draw calls instead
// of hundreds. The original meshes stay in the scene, hidden, so picking,
// markers and everything that reads an object's position keep working; an
// entity that moves or is destroyed after all is taken back out (its batch
// is rebuilt without it).
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

interface Part {
  key: string;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  castShadow: boolean;
  receiveShadow: boolean;
  source: THREE.Mesh;
}

interface Member {
  index: number;
  anchor: THREE.Object3D;
  at: THREE.Vector3;
  parts: Part[];
}

interface Batch {
  key: string;
  mesh: THREE.Mesh;
  members: Set<number>;
}

const KEPT = ["position", "normal", "uv", "color"];

// Materials that look the same batch together even when they're separate
// instances (every entity's Material component makes its own).
function materialSignature(m: THREE.Material): string {
  if (!(m instanceof THREE.MeshStandardMaterial)) return m.uuid;
  const textures = [m.map, m.normalMap, m.roughnessMap, m.metalnessMap, m.emissiveMap, m.aoMap].map((t) => t?.uuid ?? "-").join(",");
  return [
    m.type,
    m.color.getHexString(),
    m.emissive.getHexString(),
    m.emissiveIntensity.toFixed(3),
    m.roughness.toFixed(3),
    m.metalness.toFixed(3),
    m.opacity.toFixed(3),
    m.transparent ? 1 : 0,
    m.vertexColors ? 1 : 0,
    m.side,
    m.flatShading ? 1 : 0,
    textures,
  ].join(":");
}

export class StaticBatcher {
  readonly group = new THREE.Group();
  private readonly members = new Map<number, Member>();
  private readonly batches = new Map<string, Batch>();

  get size() {
    return this.members.size;
  }
  get drawn() {
    return this.batches.size;
  }

  // Merges every eligible object's meshes. `site` groups members whose
  // visibility the game toggles together.
  build(objects: ReadonlyArray<THREE.Object3D | undefined>, eligible: (index: number) => boolean, site: (index: number) => string) {
    this.clear();
    objects.forEach((anchor, index) => {
      if (!anchor || !eligible(index)) return;
      anchor.updateWorldMatrix(true, true);
      const parts: Part[] = [];
      let ok = true;
      anchor.traverse((node) => {
        if (!ok || !(node instanceof THREE.Mesh)) return;
        // Anything animated, instanced or special stays as it is.
        if (node instanceof THREE.SkinnedMesh || node instanceof THREE.InstancedMesh || Array.isArray(node.material) || !node.visible) {
          ok = false;
          return;
        }
        const geometry = node.geometry.clone();
        for (const name of Object.keys(geometry.attributes)) if (!KEPT.includes(name)) geometry.deleteAttribute(name);
        if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
        geometry.applyMatrix4(node.matrixWorld);
        geometry.morphAttributes = {};
        const signature = Object.keys(geometry.attributes).sort().join(",") + (geometry.index ? ":i" : ":n");
        const key = `${site(index)}|${materialSignature(node.material)}|${node.castShadow ? 1 : 0}${node.receiveShadow ? 1 : 0}|${signature}`;
        parts.push({ key, geometry, material: node.material, castShadow: node.castShadow, receiveShadow: node.receiveShadow, source: node });
      });
      if (!ok || !parts.length) {
        parts.forEach((p) => p.geometry.dispose());
        return;
      }
      this.members.set(index, { index, anchor, at: anchor.position.clone(), parts });
    });
    const keys = new Set<string>();
    for (const member of this.members.values())
      for (const part of member.parts) {
        part.source.visible = false;
        keys.add(part.key);
      }
    for (const key of keys) this.rebuild(key);
  }

  // Takes an entity back out of its batches (it moved or was destroyed).
  remove(index: number) {
    const member = this.members.get(index);
    if (!member) return;
    this.members.delete(index);
    const keys = new Set(member.parts.map((p) => p.key));
    for (const part of member.parts) {
      part.source.visible = true;
      part.geometry.dispose();
    }
    for (const key of keys) this.rebuild(key);
  }

  // Members whose anchor moved (or `gone` says died) leave their batches;
  // batches follow their members' visibility.
  check(gone: (index: number) => boolean) {
    for (const member of [...this.members.values()])
      if (gone(member.index) || member.anchor.position.distanceToSquared(member.at) > 1e-4) this.remove(member.index);
    this.syncVisibility();
  }

  syncVisibility() {
    for (const batch of this.batches.values()) {
      const first = this.members.get(batch.members.values().next().value as number);
      let visible = !!first;
      for (let node: THREE.Object3D | null = first?.anchor ?? null; node && visible; node = node.parent) if (!node.visible) visible = false;
      batch.mesh.visible = visible;
    }
  }

  clear() {
    for (const member of this.members.values())
      for (const part of member.parts) {
        part.source.visible = true;
        part.geometry.dispose();
      }
    this.members.clear();
    for (const batch of this.batches.values()) {
      batch.mesh.removeFromParent();
      batch.mesh.geometry.dispose();
    }
    this.batches.clear();
  }

  private rebuild(key: string) {
    const old = this.batches.get(key);
    if (old) {
      old.mesh.removeFromParent();
      old.mesh.geometry.dispose();
      this.batches.delete(key);
    }
    const parts: Part[] = [];
    const members = new Set<number>();
    for (const member of this.members.values())
      for (const part of member.parts)
        if (part.key === key) {
          parts.push(part);
          members.add(member.index);
        }
    if (!parts.length) return;
    const merged = mergeGeometries(
      parts.map((p) => p.geometry),
      false,
    );
    if (!merged) {
      // Couldn't merge (mismatched attributes): show the originals.
      for (const p of parts) p.source.visible = true;
      return;
    }
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, parts[0]!.material);
    mesh.castShadow = parts[0]!.castShadow;
    mesh.receiveShadow = parts[0]!.receiveShadow;
    mesh.name = "static-batch";
    this.group.add(mesh);
    this.batches.set(key, { key, mesh, members });
  }
}
