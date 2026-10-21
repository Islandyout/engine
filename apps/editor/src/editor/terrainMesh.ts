// Terrain rendering: the heightfield mesh, colored by height and
// slope (sand, grass, rock, snow) over tiling detail layers, and
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
  let splat = geometry.getAttribute("splat") as THREE.BufferAttribute | undefined;
  if (!splat) {
    splat = new THREE.BufferAttribute(new Float32Array(position.count * 4), 4);
    geometry.setAttribute("splat", splat);
  }
  const band = 0.6;
  for (let i = 0; i < position.count; i++) {
    const h = heights[i]!;
    const c = scratch.color;
    if (h < look.sandHeight) toColor(look.sandColor, c);
    else if (h > look.snowHeight) toColor(look.snowColor, c);
    else toColor(look.grassColor, c);
    // Soft bands instead of hard lines.
    if (h >= look.sandHeight && h < look.sandHeight + band) c.lerp(toColor(look.sandColor, scratch.rock), 1 - (h - look.sandHeight) / band);
    if (h <= look.snowHeight && h > look.snowHeight - band) c.lerp(toColor(look.snowColor, scratch.rock), 1 - (look.snowHeight - h) / band);
    const steep = Math.min(1, Math.max(0, (look.rockSlope - normal.getY(i)) * 8));
    if (steep > 0) c.lerp(toColor(look.rockColor, scratch.rock), steep);
    // The same classes as weights, for the detail textures: grass, rock, sand, snow.
    let sand = h < look.sandHeight ? 1 : h < look.sandHeight + band ? 1 - (h - look.sandHeight) / band : 0;
    let snow = h > look.snowHeight ? 1 : h > look.snowHeight - band ? 1 - (look.snowHeight - h) / band : 0;
    sand = Math.min(1, sand);
    snow = Math.min(1, snow);
    const grass = Math.max(0, 1 - sand - snow);
    splat.setXYZW(i, grass * (1 - steep), steep, sand * (1 - steep), snow * (1 - steep));
    const x = position.getX(i),
      z = position.getZ(i);
    const variation = 1 + fbm(x * 0.15, z * 0.15, seed + 5, 3) * 0.12;
    color.setXYZ(i, c.r * variation, c.g * variation, c.b * variation);
  }
  color.needsUpdate = true;
  splat.needsUpdate = true;
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
}

// Detail layers (ambientCG, CC0; tools/models/downscale_textures.cjs): each class of ground has a colour map and a normal map, tiled in
// world space. The terrain keeps its palette (vertex colours); the layers add what a flat colour lacks, the grain of grass, rock and sand,
// by multiplying each layer's colour over its own average. Loaded once and shared by every terrain.
const layerNames = ["grass", "rock", "sand", "snow"] as const;
const layerTextures: { color: THREE.Texture; normal: THREE.Texture; mean: THREE.Vector3 }[] = [];
function layers() {
  if (layerTextures.length) return layerTextures;
  const loader = new THREE.TextureLoader();
  for (const name of layerNames) {
    const white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    white.needsUpdate = true;
    const flat = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
    flat.needsUpdate = true;
    const entry = { color: white as THREE.Texture, normal: flat as THREE.Texture, mean: new THREE.Vector3(1, 1, 1) };
    layerTextures.push(entry);
    const tiled = (texture: THREE.Texture, srgb: boolean) => {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.anisotropy = 4;
      return texture;
    };
    loader.load(`./kit/terrain/${name}-color.jpg`, (texture) => {
      entry.color = tiled(texture, true);
      // The layer's average colour (linear), so the detail multiplies without shifting the palette.
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(texture.image as CanvasImageSource, 0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      const lin = (v: number) => THREE.MathUtils.clamp(new THREE.Color().setRGB(v / 255, 0, 0, THREE.SRGBColorSpace).r, 0.02, 1);
      entry.mean.set(lin(r!), lin(g!), lin(b!));
      for (const uniforms of terrainUniforms) refreshUniforms(uniforms);
    });
    loader.load(`./kit/terrain/${name}-normal.jpg`, (texture) => {
      entry.normal = tiled(texture, false);
      for (const uniforms of terrainUniforms) refreshUniforms(uniforms);
    });
  }
  return layerTextures;
}
const terrainUniforms = new Set<Record<string, THREE.IUniform>>();
function refreshUniforms(uniforms: Record<string, THREE.IUniform>) {
  layers().forEach((layer, i) => {
    uniforms[`tColor${i}`]!.value = layer.color;
    uniforms[`tNormal${i}`]!.value = layer.normal;
    uniforms[`mean${i}`]!.value = layer.mean;
  });
}

function terrainMaterial(size: number): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  // A normal map must exist for the shader to build a tangent frame; the layers' own normals replace its lookup.
  material.normalMap = layers()[0]!.normal;
  material.normalScale.set(0.8, 0.8);
  material.onBeforeCompile = (shader) => {
    for (let i = 0; i < 4; i++) {
      shader.uniforms[`tColor${i}`] = { value: null };
      shader.uniforms[`tNormal${i}`] = { value: null };
      shader.uniforms[`mean${i}`] = { value: new THREE.Vector3(1, 1, 1) };
    }
    shader.uniforms.tileSize = { value: 3.2 };
    refreshUniforms(shader.uniforms);
    terrainUniforms.add(shader.uniforms);
    const decl = Array.from({ length: 4 }, (_, i) => `uniform sampler2D tColor${i}; uniform sampler2D tNormal${i}; uniform vec3 mean${i};`).join("\n");
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec4 splat;\nvarying vec4 vSplat;\nvarying vec2 vGround;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvSplat = splat;\nvGround = (modelMatrix * vec4(position, 1.0)).xz;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec4 vSplat;
varying vec2 vGround;
uniform float tileSize;
${decl}
// Two scales per layer, so the repeat does not show.
vec3 layerColor(sampler2D t, vec3 mean) {
  vec3 a = texture2D(t, vGround / tileSize).rgb;
  vec3 b = texture2D(t, vGround / (tileSize * 4.7) + 0.31).rgb;
  return clamp(a * b / (mean * mean), 0.25, 2.2);
}
vec3 layerNormal(sampler2D t) {
  vec3 a = texture2D(t, vGround / tileSize).xyz * 2.0 - 1.0;
  vec3 b = texture2D(t, vGround / (tileSize * 4.7) + 0.31).xyz * 2.0 - 1.0;
  return vec3(a.xy + b.xy, a.z * b.z);
}`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
{
  vec4 w = vSplat / max(dot(vSplat, vec4(1.0)), 0.001);
  vec3 detail = w.x * layerColor(tColor0, mean0) + w.y * layerColor(tColor1, mean1) + w.z * layerColor(tColor2, mean2) + w.w * layerColor(tColor3, mean3);
  diffuseColor.rgb *= detail;
}`,
      )
      .replace(
        "vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;",
        `vec4 nw = vSplat / max(dot(vSplat, vec4(1.0)), 0.001);
	vec3 mapN = normalize(nw.x * layerNormal(tNormal0) + nw.y * layerNormal(tNormal1) + nw.z * layerNormal(tNormal2) + nw.w * layerNormal(tNormal3));`,
      );
  };
  material.customProgramCacheKey = () => "terrain-splat";
  void size;
  return material;
}

export function buildTerrainMesh(params: TerrainParams, look: TerrainLook, heights = generateHeights(params)): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(params.size, params.size, params.resolution - 1, params.resolution - 1);
  geometry.rotateX(-Math.PI / 2);
  shapeTerrain(geometry, heights, look, params.seed);
  const material = terrainMaterial(params.size);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "terrain";
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}

// Frees what buildTerrainMesh allocated: its geometry, material and texture clone.
export function disposeTerrainMesh(mesh: THREE.Mesh) {
  mesh.geometry.dispose();
  (mesh.material as THREE.MeshStandardMaterial).dispose();
}

export interface ScatterModel {
  scene: THREE.Object3D;
  // The model's distant version (a "LOD1" node in its GLB), if it has one.
  far?: THREE.Object3D;
  // Plants sway in the wind (the top of the model moves, the root stays).
  sway?: boolean;
}

// Wind: one clock for every swaying plant, advanced each frame by the editor (seconds).
export const wind = { time: { value: 0 }, strength: { value: 1 } };
function swayingMaterial(material: THREE.Material, height: number, bottom: number): THREE.Material {
  const cloned = material.clone();
  cloned.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = wind.time;
    shader.uniforms.uWindStrength = wind.strength;
    shader.uniforms.uPlantHeight = { value: Math.max(0.1, height) };
    shader.uniforms.uPlantBottom = { value: bottom };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uWindTime, uWindStrength, uPlantHeight, uPlantBottom;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
{
  // How far up the plant this vertex is (0 at the root): the tip moves most. Each instance has its own phase.
  float up = clamp((position.y - uPlantBottom) / uPlantHeight, 0.0, 1.0);
  #ifdef USE_INSTANCING
    float phase = instanceMatrix[3].x * 0.31 + instanceMatrix[3].z * 0.23;
  #else
    float phase = 0.0;
  #endif
  float gust = sin(uWindTime * 1.3 + phase) * 0.6 + sin(uWindTime * 2.9 + phase * 1.7 + position.y) * 0.4;
  float bend = up * up * uPlantHeight * 0.035 * uWindStrength;
  transformed.x += gust * bend;
  transformed.z += gust * bend * 0.5;
}`,
      );
  };
  cloned.customProgramCacheKey = () => "plant-sway";
  return cloned;
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
        const sways = models.get(id)!.sway && !Array.isArray(child.material);
        const instanced = new THREE.InstancedMesh(child.geometry, sways ? swayingMaterial(child.material as THREE.Material, bounds.max.y - bottom, bottom) : child.material, list.length);
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
