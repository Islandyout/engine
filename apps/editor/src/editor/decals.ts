// Ground decals: cracks where a heavy blow lands, scorch under a finisher, a scuff of dust where a body falls. A small pool of flat
// quads laid on the ground, kept for a while and faded, the oldest reused first.
import * as THREE from "three";

export type DecalKind = "crack" | "scorch" | "scuff";

const textures = new Map<DecalKind, THREE.CanvasTexture>();
function texture(kind: DecalKind): THREE.CanvasTexture {
  let cached = textures.get(kind);
  if (cached) return cached;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const c = size / 2;
  let seed = kind === "crack" ? 7 : kind === "scorch" ? 13 : 29;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  if (kind === "crack") {
    ctx.strokeStyle = "rgba(20,16,12,0.9)";
    ctx.lineCap = "round";
    for (let arm = 0; arm < 9; arm++) {
      let angle = (arm / 9) * Math.PI * 2 + random() * 0.4;
      let x = c, y = c, width = 3.2;
      for (let step = 0; step < 6; step++) {
        const length = 6 + random() * 9;
        const nx = x + Math.cos(angle) * length, ny = y + Math.sin(angle) * length;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(nx, ny);
        ctx.stroke();
        x = nx; y = ny; width *= 0.78; angle += (random() - 0.5) * 0.9;
      }
    }
  } else {
    const gradient = ctx.createRadialGradient(c, c, 0, c, c, c);
    if (kind === "scorch") {
      gradient.addColorStop(0, "rgba(10,8,6,0.75)");
      gradient.addColorStop(0.55, "rgba(14,10,8,0.45)");
      gradient.addColorStop(1, "rgba(14,10,8,0)");
    } else {
      gradient.addColorStop(0, "rgba(190,170,140,0.5)");
      gradient.addColorStop(0.6, "rgba(170,150,120,0.25)");
      gradient.addColorStop(1, "rgba(170,150,120,0)");
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  cached = new THREE.CanvasTexture(canvas);
  textures.set(kind, cached);
  return cached;
}

interface Decal {
  mesh: THREE.Mesh;
  age: number;
  life: number;
}

export class Decals {
  private readonly pool: Decal[] = [];
  private next = 0;
  private readonly geometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

  constructor(
    private readonly parent: THREE.Object3D,
    private readonly capacity = 24,
  ) {}

  // Lays a decal of `size` metres across at a ground point.
  add(kind: DecalKind, at: THREE.Vector3, size: number, life = 22) {
    let decal = this.pool[this.next];
    if (!decal) {
      const material = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
      const mesh = new THREE.Mesh(this.geometry, material);
      mesh.renderOrder = 1;
      mesh.frustumCulled = true;
      this.parent.add(mesh);
      decal = { mesh, age: 0, life: 0 };
      this.pool[this.next] = decal;
    }
    this.next = (this.next + 1) % this.capacity;
    const material = decal.mesh.material as THREE.MeshBasicMaterial;
    material.map = texture(kind);
    material.opacity = 1;
    material.needsUpdate = true;
    decal.mesh.position.set(at.x, at.y + 0.03, at.z);
    decal.mesh.rotation.y = Math.random() * Math.PI * 2;
    decal.mesh.scale.setScalar(size);
    decal.mesh.visible = true;
    decal.age = 0;
    decal.life = life;
  }

  update(dt: number) {
    for (const decal of this.pool) {
      if (!decal.mesh.visible) continue;
      decal.age += dt;
      const fade = decal.life - decal.age;
      (decal.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, Math.min(1, fade / 3));
      if (fade <= 0) decal.mesh.visible = false;
    }
  }

  clear() {
    for (const decal of this.pool) decal.mesh.visible = false;
  }

  get visibleCount() {
    return this.pool.filter((d) => d.mesh.visible).length;
  }
}
