// Trail ribbons (0.57.0): an entity's recent path, drawn as a strip facing
// the camera that narrows and fades toward its tail. Pure so the geometry
// is unit testable; main.ts uploads the arrays.

export interface TrailPoint {
  x: number;
  y: number;
  z: number;
  age: number; // seconds since recorded
}

// Records `position` when it's at least minDistance from the newest point,
// ages every point by dt and drops points older than lifetime.
export function updateTrail(
  points: TrailPoint[],
  position: { x: number; y: number; z: number },
  dt: number,
  lifetime: number,
  minDistance: number,
): void {
  for (const p of points) p.age += dt;
  while (points.length && points[0]!.age > lifetime) points.shift();
  const last = points[points.length - 1];
  if (!last || Math.hypot(position.x - last.x, position.y - last.y, position.z - last.z) >= minDistance)
    points.push({ ...position, age: 0 });
}

// Two vertices per point, offset perpendicular to both the path and the
// view direction. Returns positions (xyz) and per-vertex fade (0 at the tail
// end of life, 1 at the head), plus triangle indices.
export function buildRibbon(
  points: TrailPoint[],
  camera: { x: number; y: number; z: number },
  width: number,
  lifetime: number,
): { positions: Float32Array; fades: Float32Array; indices: Uint16Array } {
  const n = points.length;
  const positions = new Float32Array(n * 2 * 3);
  const fades = new Float32Array(n * 2);
  const indices = new Uint16Array(Math.max(0, n - 1) * 6);
  for (let i = 0; i < n; i++) {
    const p = points[i]!;
    const a = points[Math.max(0, i - 1)]!;
    const b = points[Math.min(n - 1, i + 1)]!;
    let tx = b.x - a.x,
      ty = b.y - a.y,
      tz = b.z - a.z;
    const tl = Math.hypot(tx, ty, tz) || 1;
    [tx, ty, tz] = [tx / tl, ty / tl, tz / tl];
    const vx = camera.x - p.x,
      vy = camera.y - p.y,
      vz = camera.z - p.z;
    // side = tangent x view
    let sx = ty * vz - tz * vy,
      sy = tz * vx - tx * vz,
      sz = tx * vy - ty * vx;
    const sl = Math.hypot(sx, sy, sz) || 1;
    const fade = Math.max(0, 1 - p.age / lifetime);
    const half = (width / 2) * fade;
    [sx, sy, sz] = [(sx / sl) * half, (sy / sl) * half, (sz / sl) * half];
    positions.set([p.x + sx, p.y + sy, p.z + sz, p.x - sx, p.y - sy, p.z - sz], i * 6);
    fades[i * 2] = fades[i * 2 + 1] = fade;
    if (i < n - 1) indices.set([i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2], i * 6);
  }
  return { positions, fades, indices };
}
