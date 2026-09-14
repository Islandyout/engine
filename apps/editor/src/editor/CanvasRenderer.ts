import * as THREE from "three";

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
      const count = index ? index.count : position.count;
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (let i = 0; i + stride <= count; i += stride) {
        const group = geometry.groups.find(
          (g) => i >= g.start && i < g.start + g.count,
        );
        const material = materials[group?.materialIndex ?? 0];
        if (!material?.visible) continue;
        const color =
          "color" in material && material.color instanceof THREE.Color
            ? material.color.clone()
            : new THREE.Color(0x9cbed2);
        const points = [];
        for (let j = 0; j < stride; j++) {
          const vertex = index ? index.getX(i + j) : i + j;
          points.push(
            new THREE.Vector3()
              .fromBufferAttribute(position, vertex)
              .applyMatrix4(object.matrixWorld),
          );
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
        });
      }
    });
    shapes.sort((a, b) => b.depth - a.depth);
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
