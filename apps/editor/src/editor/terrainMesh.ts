// Terrain rendering: the heightfield mesh, colored by height and
// slope (sand, grass, rock, snow) over a tiling detail texture, and
// instanced foliage/rock scatter from catalog models.
import * as THREE from "three";
import type { Vec3 } from "../scene/Components";
import { fbm, generateHeights, type ScatterInstance, type TerrainParams } from "./terrain";

export interface TerrainLook {
  grassColor: Vec3;
  rockColor: Vec3;
  sandColor: Vec3;
  snowColor: Vec3;
  sandHeight: number; // below this: sand
  snowHeight: number; // above this: snow
  rockSlope: number; // normal y below this blends to rock
}

let detailTexture: THREE.Texture | undefined;
function detail(): THREE.Texture {
  if (detailTexture) return detailTexture;
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      // Tileable: noise on a torus-ish wrap via periodic sampling.
      const n = fbm(x / 16, y / 16, 77, 4) * 0.5 + fbm(x / 4, y / 4, 78, 2) * 0.25;
      const v = Math.round(220 + n * 60);
      const i = (y * size + x) * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = Math.max(0, Math.min(255, v));
      image.data[i + 3] = 255;
    }
  ctx.putImageData(image, 0, 0);
  detailTexture = new THREE.CanvasTexture(canvas);
  detailTexture.wrapS = detailTexture.wrapT = THREE.RepeatWrapping;
  detailTexture.colorSpace = THREE.SRGBColorSpace;
  return detailTexture;
}

const scratch = { color: new THREE.Color(), rock: new THREE.Color() };
const toColor = (v: Vec3, target: THREE.Color) => target.setRGB(v.x, v.y, v.z, THREE.SRGBColorSpace);

// Writes heights, normals and colors into an existing terrain geometry.
export function shapeTerrain(geometry: THREE.BufferGeometry, heights: Float32Array, look: TerrainLook, seed: number) {
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < position.count; i++) position.setY(i, heights[i]!);
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  const normal = geometry.getAttribute("normal") as THREE.BufferAttribute;
  let color = geometry.getAttribute("color") as THREE.BufferAttribute | undefined;
  if (!color) {
    color = new THREE.BufferAttribute(new Float32Array(position.count * 3), 3);
    geometry.setAttribute("color", color);
  }
  for (let i = 0; i < position.count; i++) {
    const h = heights[i]!;
    const c = scratch.color;
    if (h < look.sandHeight) toColor(look.sandColor, c);
    else if (h > look.snowHeight) toColor(look.snowColor, c);
    else toColor(look.grassColor, c);
    // Soft bands instead of hard lines.
    const band = 0.6;
    if (h >= look.sandHeight && h < look.sandHeight + band) c.lerp(toColor(look.sandColor, scratch.rock), 1 - (h - look.sandHeight) / band);
    if (h <= look.snowHeight && h > look.snowHeight - band) c.lerp(toColor(look.snowColor, scratch.rock), 1 - (look.snowHeight - h) / band);
    const steep = Math.min(1, Math.max(0, (look.rockSlope - normal.getY(i)) * 8));
    if (steep > 0) c.lerp(toColor(look.rockColor, scratch.rock), steep);
    const x = position.getX(i),
      z = position.getZ(i);
    const variation = 1 + fbm(x * 0.15, z * 0.15, seed + 5, 3) * 0.12;
    color.setXYZ(i, c.r * variation, c.g * variation, c.b * variation);
  }
  color.needsUpdate = true;
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
}

export function buildTerrainMesh(params: TerrainParams, look: TerrainLook, heights = generateHeights(params)): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(params.size, params.size, params.resolution - 1, params.resolution - 1);
  geometry.rotateX(-Math.PI / 2);
  shapeTerrain(geometry, heights, look, params.seed);
  const texture = detail().clone();
  texture.repeat.set(params.size / 6, params.size / 6);
  texture.needsUpdate = true;
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, map: texture });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "terrain";
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}

// Frees what buildTerrainMesh allocated: its geometry, material and texture clone.
export function disposeTerrainMesh(mesh: THREE.Mesh) {
  mesh.geometry.dispose();
  const material = mesh.material as THREE.MeshStandardMaterial;
  material.map?.dispose();
  material.dispose();
}

export interface ScatterModel {
  scene: THREE.Object3D;
  // The model's distant version (a "LOD1" node in its GLB), if it has one.
  far?: THREE.Object3D;
}

// Within this many metres of the camera (to a chunk's nearest edge), a chunk
// draws its models' full detail; past it, their far versions.
export const lodDistance = 60;
const lodChunks = new Set<THREE.Group>();

// Shows each live chunk's near or far meshes for where the camera is, and
// forgets chunks no longer in a scene.
export function updateScatterLod(camera: THREE.Vector3) {
  for (const chunk of lodChunks) {
    let top: THREE.Object3D = chunk;
    while (top.parent) top = top.parent;
    if (!(top as THREE.Scene).isScene) {
      if (!chunk.parent) lodChunks.delete(chunk);
      continue;
    }
    const { x0, z0, x1, z1 } = chunk.userData.lodBounds as { x0: number; z0: number; x1: number; z1: number };
    const p = chunk.getWorldPosition(new THREE.Vector3());
    const dx = Math.max(x0 + p.x - camera.x, 0, camera.x - (x1 + p.x));
    const dz = Math.max(z0 + p.z - camera.z, 0, camera.z - (z1 + p.z));
    const near = Math.hypot(dx, dz) < lodDistance;
    for (const child of chunk.children) child.visible = (child.userData.lod === 1) !== near;
  }
}

// One InstancedMesh per mesh of each model, with every instance standing on
// the ground (the model's lowest point at the instance's height).
// World units per side of a scatter chunk (see buildScatter).
export const scatterChunkSize = 64;

function chunkInstances(all: ScatterInstance[], size: number) {
  const chunks = new Map<string, ScatterInstance[]>();
  for (const instance of all) {
    const key = `${Math.floor(instance.x / size)},${Math.floor(instance.z / size)}`;
    let chunk = chunks.get(key);
    if (!chunk) chunks.set(key, (chunk = []));
    chunk.push(instance);
  }
  return chunks;
}

export function buildScatter(instances: ScatterInstance[], models: Map<number, ScatterModel>): THREE.Group {
  const group = new THREE.Group();
  group.name = "terrain-scatter";
  const byModel = new Map<number, ScatterInstance[]>();
  for (const instance of instances) {
    if (!models.has(instance.model)) continue;
    let list = byModel.get(instance.model);
    if (!list) byModel.set(instance.model, (list = []));
    list.push(instance);
  }
  const matrix = new THREE.Matrix4(),
    placement = new THREE.Matrix4(),
    rotation = new THREE.Quaternion(),
    up = new THREE.Vector3(0, 1, 0),
    lean = new THREE.Quaternion(),
    tiltTo = new THREE.Vector3(),
    tint = new THREE.Color();
  for (const [id, all] of byModel) {
    const root = models.get(id)!.scene;
    const far = models.get(id)!.far;
    root.updateMatrixWorld(true);
    far?.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(root);
    const bottom = bounds.min.y;
    // Small props (bushes, small rocks) don't cast shadows: they cost a full
    // shadow pass for marks nobody sees.
    const castShadow = bounds.max.y - bounds.min.y > 2.5;
    // Instances are grouped into square chunks so frustum culling can drop
    // what's off screen (one InstancedMesh for the whole map is always
    // drawn, and drawn again for shadows).
    // A chunk is a draw call per mesh of the model (and another for
    // shadows), so sparse scatter gets bigger chunks: they double until
    // they hold a few dozen instances each on average.
    let size = scatterChunkSize;
    let chunks = chunkInstances(all, size);
    while (all.length / chunks.size < 32 && size < scatterChunkSize * 8) chunks = chunkInstances(all, (size *= 2));
    for (const list of chunks.values()) {
      // With a far version, a chunk is a group of both, switched by
      // updateScatterLod (near until it's first run).
      let parent: THREE.Object3D = group;
      if (far) {
        const chunk = new THREE.Group();
        const x0 = Math.min(...list.map((i) => i.x)), x1 = Math.max(...list.map((i) => i.x));
        const z0 = Math.min(...list.map((i) => i.z)), z1 = Math.max(...list.map((i) => i.z));
        chunk.userData.lodBounds = { x0, z0, x1, z1 };
        lodChunks.add(chunk);
        group.add(chunk);
        parent = chunk;
      }
      const place = (child: THREE.Object3D, lod: number) => {
        if (!(child instanceof THREE.Mesh)) return;
        const instanced = new THREE.InstancedMesh(child.geometry, child.material, list.length);
        instanced.userData.instances = list;
        instanced.userData.chunkSize = size;
        if (far) {
          instanced.userData.lod = lod;
          instanced.visible = lod === 0;
        }
        // Far versions cast no shadow: a whole forest's worth of far trees
        // in the shadow pass costs as much again as drawing them.
        instanced.castShadow = castShadow && lod === 0;
        instanced.receiveShadow = true;
        list.forEach((instance, i) => {
          rotation.setFromAxisAngle(up, instance.yaw);
          // A tilted rule's instance leans to its ground (foliage.ts).
          if (instance.up) rotation.premultiply(lean.setFromUnitVectors(up, tiltTo.set(...instance.up)));
          if (instance.tint !== undefined) instanced.setColorAt(i, tint.setScalar(instance.tint));
          placement.compose(
            new THREE.Vector3(instance.x, instance.y - bottom * instance.scale, instance.z),
            rotation,
            new THREE.Vector3(instance.scale, instance.scale, instance.scale),
          );
          matrix.multiplyMatrices(placement, child.matrixWorld);
          instanced.setMatrixAt(i, matrix);
        });
        instanced.instanceMatrix.needsUpdate = true;
        if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
        instanced.computeBoundingSphere();
        parent.add(instanced);
      };
      root.traverse((child) => place(child, 0));
      far?.traverse((child) => place(child, 1));
    }
  }
  return group;
}

// A collision box for a scattered instance: a quarter of the model's
// footprint wide (a trunk rule: a twentieth of its height, 0.3-1.2 m), its
// full height tall, standing on the ground.
export function scatterObstacle(instance: ScatterInstance, nativeSize: THREE.Vector3 | undefined) {
  const size = nativeSize ?? new THREE.Vector3(2, 4, 2);
  const height = size.y * instance.scale;
  const width = instance.trunk ? Math.min(1.2, Math.max(0.3, height * 0.05)) : Math.max(0.2, Math.min(size.x, size.z) * 0.25 * instance.scale);
  return { x: instance.x, y: instance.y + height / 2, z: instance.z, sx: width, sy: height, sz: width };
}
