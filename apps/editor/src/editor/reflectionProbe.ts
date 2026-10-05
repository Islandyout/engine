// A local reflection probe (0.76.0): canals and other still, glossy flats
// reflect what is actually around them -- the buildings on their banks and
// the sky's own colours (sunset included) -- from a small cube map
// re-rendered every few seconds near the camera, instead of nothing at all.
import * as THREE from "three";

// Still water and polished floors: glossy, not metal, and flat.
export function isReflectiveFlat(mesh: THREE.Mesh): boolean {
  const material = mesh.material;
  if (Array.isArray(material) || !(material instanceof THREE.MeshStandardMaterial)) return false;
  if (material.roughness > 0.25 || material.metalness > 0.3 || material.transparent) return false;
  mesh.geometry.computeBoundingBox();
  const size = mesh.geometry.boundingBox!.getSize(new THREE.Vector3());
  mesh.updateWorldMatrix(true, false);
  const scale = new THREE.Vector3().setFromMatrixScale(mesh.matrixWorld);
  const height = size.y * Math.abs(scale.y);
  return height < 0.5 && size.x * Math.abs(scale.x) > 2 && size.z * Math.abs(scale.z) > 2;
}

export class ReflectionProbe {
  readonly target = new THREE.WebGLCubeRenderTarget(128, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  readonly camera = new THREE.CubeCamera(0.5, 400, this.target);
  private readonly canvas = document.createElement("canvas");
  private readonly sky: THREE.CanvasTexture;
  private readonly materials = new Set<THREE.MeshStandardMaterial>();
  private readonly rejected = new WeakSet<THREE.Object3D>();
  private due = 0;

  constructor() {
    this.canvas.width = 4;
    this.canvas.height = 64;
    this.sky = new THREE.CanvasTexture(this.canvas);
    this.sky.mapping = THREE.EquirectangularReflectionMapping;
    this.sky.colorSpace = THREE.SRGBColorSpace;
  }

  get count() {
    return this.materials.size;
  }

  // Gives every reflective flat under `root` the probe's reflection.
  attach(root: THREE.Object3D) {
    root.traverse((node) => {
      if (!(node instanceof THREE.Mesh) || this.rejected.has(node) || this.materials.has(node.material as THREE.MeshStandardMaterial)) return;
      if (!isReflectiveFlat(node)) {
        this.rejected.add(node);
        return;
      }
      const material = node.material as THREE.MeshStandardMaterial;
      material.envMap = this.target.texture;
      material.envMapIntensity = 1.1;
      material.needsUpdate = true;
      this.materials.add(material);
    });
  }

  detach() {
    for (const material of this.materials) {
      material.envMap = null;
      material.needsUpdate = true;
    }
    this.materials.clear();
  }

  // Re-renders the cube at `at` every `period` ms: the scene with a sky
  // gradient behind it, the reflecting surfaces themselves hidden.
  update(renderer: THREE.WebGLRenderer, scene: THREE.Scene, at: THREE.Vector3, now: number, sky: THREE.Color, horizon: THREE.Color, period = 3000) {
    if (!this.materials.size || now < this.due) return;
    this.due = now + period;
    const g = this.canvas.getContext("2d");
    if (g) {
      const gradient = g.createLinearGradient(0, 0, 0, 64);
      gradient.addColorStop(0, `#${sky.getHexString()}`);
      gradient.addColorStop(0.48, `#${horizon.getHexString()}`);
      gradient.addColorStop(0.52, `#${horizon.clone().multiplyScalar(0.5).getHexString()}`);
      gradient.addColorStop(1, "#202020");
      g.fillStyle = gradient;
      g.fillRect(0, 0, 4, 64);
      this.sky.needsUpdate = true;
    }
    const hidden: THREE.Object3D[] = [];
    scene.traverseVisible((node) => {
      const material = (node as THREE.Mesh).material;
      if (material && !Array.isArray(material) && this.materials.has(material as THREE.MeshStandardMaterial)) hidden.push(node);
    });
    for (const node of hidden) node.visible = false;
    const background = scene.background;
    const fog = scene.fog;
    scene.background = this.sky;
    scene.fog = null;
    this.camera.position.copy(at);
    this.camera.updateMatrixWorld(true);
    this.camera.update(renderer, scene);
    scene.background = background;
    scene.fog = fog;
    for (const node of hidden) node.visible = true;
  }

  dispose() {
    this.detach();
    this.target.dispose();
    this.sky.dispose();
  }
}
