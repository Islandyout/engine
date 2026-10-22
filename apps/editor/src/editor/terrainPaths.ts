// Paths painted into a terrain: roads and paved streets are colour and detail layer on the ground itself, so they follow every slope with no gap
// and cost no entities. One path per line, "kind width x z x z ..." (kind: dirt or stone; width in metres; points in the terrain's own x/z).
export interface TerrainPath {
  kind: "dirt" | "stone";
  width: number;
  points: [number, number][];
}

export function parsePaths(text: string): { paths: TerrainPath[]; errors: string[] } {
  const paths: TerrainPath[] = [];
  const errors: string[] = [];
  text.split("\n").forEach((raw, index) => {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) return;
    const [kind, widthText, ...rest] = line.split(/\s+/);
    const numbers = rest.map(Number);
    const width = Number(widthText);
    if (kind !== "dirt" && kind !== "stone") return void errors.push(`line ${index + 1}: the kind must be dirt or stone`);
    if (!(width > 0) || !Number.isFinite(width)) return void errors.push(`line ${index + 1}: the width must be a positive number of metres`);
    if (numbers.length < 4 || numbers.length % 2 || numbers.some((n) => !Number.isFinite(n))) return void errors.push(`line ${index + 1}: expected at least two x z points`);
    paths.push({ kind, width, points: numbers.reduce<[number, number][]>((out, n, i) => (i % 2 ? (out[out.length - 1]![1] = n, out) : [...out, [n, 0]]), []) });
  });
  return { paths, errors };
}

const distanceToSegment = (x: number, z: number, a: [number, number], b: [number, number]) => {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = Math.min(1, Math.max(0, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t));
};

// How much of a path's kind a point is (0..1): full inside half the width, fading to nothing `soft` metres further out.
export function pathStrength(paths: TerrainPath[], kind: TerrainPath["kind"], x: number, z: number, soft: number): number {
  let best = 0;
  for (const path of paths) {
    if (path.kind !== kind) continue;
    for (let i = 0; i + 1 < path.points.length; i++) {
      const d = distanceToSegment(x, z, path.points[i]!, path.points[i + 1]!);
      const w = Math.min(1, Math.max(0, (path.width / 2 + soft - d) / soft));
      if (w > best) best = w * w * (3 - 2 * w);
    }
  }
  return best;
}
