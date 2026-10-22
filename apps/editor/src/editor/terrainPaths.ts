// Paths painted into a terrain: roads and paved streets are colour and detail layer on the ground itself, so they follow every slope with no gap
// and cost no entities. One path per line, "kind width x z x z ..." (kind: dirt, gravel, sand, ash or stone; width in metres; points in the terrain's own x/z).
// A single point pair twice makes a disc: a shore, a dust bowl. Each kind has its colour and the detail layer it takes.
export const pathKinds = {
  dirt: { color: [0.55, 0.42, 0.26], layer: "sand" },
  gravel: { color: [0.66, 0.6, 0.5], layer: "sand" },
  sand: { color: [0.72, 0.65, 0.5], layer: "sand" },
  ash: { color: [0.5, 0.47, 0.42], layer: "sand" },
  stone: { color: [0.5, 0.49, 0.46], layer: "rock" },
} as const;
export type PathKind = keyof typeof pathKinds;
export interface TerrainPath {
  kind: PathKind;
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
    if (!kind || !(kind in pathKinds)) return void errors.push(`line ${index + 1}: the kind must be ${Object.keys(pathKinds).join(", ")}`);
    if (!(width > 0) || !Number.isFinite(width)) return void errors.push(`line ${index + 1}: the width must be a positive number of metres`);
    if (numbers.length < 4 || numbers.length % 2 || numbers.some((n) => !Number.isFinite(n))) return void errors.push(`line ${index + 1}: expected at least two x z points`);
    paths.push({ kind: kind as PathKind, width, points: numbers.reduce<[number, number][]>((out, n, i) => (i % 2 ? (out[out.length - 1]![1] = n, out) : [...out, [n, 0]]), []) });
  });
  return { paths, errors };
}

const distanceToSegment = (x: number, z: number, a: [number, number], b: [number, number]) => {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = Math.min(1, Math.max(0, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t));
};

// How much of a path's kind a point is (0..1): full inside half the width, fading to nothing `soft` metres further out.
export function pathStrength(paths: TerrainPath[], kind: PathKind, x: number, z: number, soft: number): number {
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
