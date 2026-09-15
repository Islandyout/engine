import * as THREE from "three";

// Applies the same GPU skinning formula (bindMatrix -> weighted bone matrices ->
// bindMatrixInverse) on the CPU, in place, so a SkinnedMesh's current pose (as
// driven by an AnimationMixer) shows up in this rasterizer's projection instead
// of the mesh's raw, undeformed bind-pose geometry. Scratch objects are reused
// across calls; this runs once per vertex per frame.
const _skinVertex = new THREE.Vector4();
const _skinContribution = new THREE.Vector4();
const _skinned = new THREE.Vector4();
const _boneMatrix = new THREE.Matrix4();
function applySkin(
  mesh: THREE.SkinnedMesh,
  skinIndex: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  skinWeight: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  vertexIndex: number,
  out: THREE.Vector3,
) {
  const boneMatrices = mesh.skeleton.boneMatrices;
  _skinVertex.set(out.x, out.y, out.z, 1).applyMatrix4(mesh.bindMatrix);
  _skinned.set(0, 0, 0, 0);
  for (let k = 0; k < 4; k++) {
    const weight = skinWeight.getComponent(vertexIndex, k);
    if (weight === 0) continue;
    const boneIndex = skinIndex.getComponent(vertexIndex, k);
    _boneMatrix.fromArray(boneMatrices, boneIndex * 16);
    _skinContribution.copy(_skinVertex).applyMatrix4(_boneMatrix).multiplyScalar(weight);
    _skinned.add(_skinContribution);
  }
  _skinned.applyMatrix4(mesh.bindMatrixInverse);
  out.set(_skinned.x, _skinned.y, _skinned.z);
}

// Compatibility presentation of the same scene graph when WebGL is unavailable.
// CPU projection keeps authoring and C++ simulation usable on restricted devices.
export class CanvasRenderer {
  readonly domElement = document.createElement("canvas");
  private readonly context: CanvasRenderingContext2D;
  constructor() {
    const context = this.domElement.getContext("2d");
    if (!context) throw new Error("Neither WebGL nor Canvas 2D is available");
    this.context = context;
  }
  setPixelRatio(_ratio: number) {}
  setSize(width: number, height: number) {
    this.domElement.width = width;
    this.domElement.height = height;
  }
  render(scene: THREE.Scene, camera: THREE.Camera) {
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    const ctx = this.context,
      w = this.domElement.width,
      h = this.domElement.height;
    ctx.fillStyle = "#101a26";
    ctx.fillRect(0, 0, w, h);
    type Shape = {
      points: THREE.Vector3[];
      color: string;
      depth: number;
      line: boolean;
      overlay: boolean;
    };
    const shapes: Shape[] = [];
    const project = (v: THREE.Vector3) => v.project(camera);
    scene.traverseVisible((object) => {
      if (
        !(object instanceof THREE.Mesh || object instanceof THREE.LineSegments)
      )
        return;
      const geometry: THREE.BufferGeometry = object.geometry;
      const position = geometry.getAttribute("position");
      if (!position) return;
      const index = geometry.index;
      const isLine = object instanceof THREE.LineSegments;
      const stride = isLine ? 2 : 3;
      const skinIndex = geometry.getAttribute("skinIndex");
      const skinWeight = geometry.getAttribute("skinWeight");
      const skinned =
        object instanceof THREE.SkinnedMesh && skinIndex && skinWeight
          ? object
          : undefined;
      // WebGLRenderer normally calls this once per frame for a SkinnedMesh; this
      // rasterizer bypasses it entirely, so boneMatrices would otherwise never
      // reflect the mixer's current pose (scene.updateMatrixWorld(true) above
      // already refreshed each bone's matrixWorld from the mixer's output).
      if (skinned) skinned.skeleton.update();
      const count = index ? index.count : position.count;
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (let i = 0; i + stride <= count; i += stride) {
        const group = geometry.groups.find(
          (g) => i >= g.start && i < g.start + g.count,
        );
        const material = materials[group?.materialIndex ?? 0];
        if (!material?.visible || material.opacity === 0) continue;
        const color =
          "color" in material && material.color instanceof THREE.Color
            ? material.color.clone()
            : new THREE.Color(0x9cbed2);
        const points = [];
        for (let j = 0; j < stride; j++) {
          const vertex = index ? index.getX(i + j) : i + j;
          const v = new THREE.Vector3().fromBufferAttribute(position, vertex);
          if (skinned) applySkin(skinned, skinIndex!, skinWeight!, vertex, v);
          points.push(v.applyMatrix4(object.matrixWorld));
        }
        if (!isLine) {
          const normal = new THREE.Vector3()
            .subVectors(points[1]!, points[0]!)
            .cross(new THREE.Vector3().subVectors(points[2]!, points[0]!))
            .normalize();
          color.multiplyScalar(
            0.45 +
              0.55 *
                Math.abs(
                  normal.dot(new THREE.Vector3(0.4, 0.8, 0.3).normalize()),
                ),
          );
        }
        const projected = points.map(project);
        if (
          projected.some(
            (p) =>
              !Number.isFinite(p.x) ||
              !Number.isFinite(p.y) ||
              p.z < -1 ||
              p.z > 1,
          )
        )
          continue;
        shapes.push({
          points: projected,
          color: "#" + color.getHexString(),
          depth: projected.reduce((sum, p) => sum + p.z, 0) / stride,
          line: isLine,
          overlay: material.depthTest === false,
        });
      }
    });
    shapes.sort(
      (a, b) => Number(a.overlay) - Number(b.overlay) || b.depth - a.depth,
    );
    for (const shape of shapes) {
      ctx.beginPath();
      shape.points.forEach((p, i) => {
        const x = ((p.x + 1) * w) / 2,
          y = ((1 - p.y) * h) / 2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      if (shape.line) {
        ctx.strokeStyle = shape.color;
        ctx.stroke();
      } else {
        ctx.closePath();
        ctx.fillStyle = shape.color;
        ctx.fill();
      }
    }
  }
}
