// Foliage placement: the rules that put trees, bushes, grass and rocks where
// they would grow, shared by terrain scatter (terrain.ts) and the scene
// generators (tools/city). Independent of three.js so it can be unit tested.
//
// A rule is "model density [minScale maxScale] [minNormalY] [collide|trunk]
// [key=value ...]" (terrain.ts parseScatter). On top of the slope limit
// (minNormalY), the options are:
//   spacing=M      no two placed instances (of any rule) closer than this,
//                  each scaled by its instance scale (Poisson-disk thinning:
//                  no trunks through each other, no lines of clones);
//   cluster=0..1   how much a low-frequency noise field gathers the rule into
//                  groves with clearings between (0: evenly, 1: only groves);
//   clusterSize=M  the size of those groves (default 40 m);
//   height=A..B    only between these ground heights (tree lines, shores);
//   on=a,b         only on these ground layers: grass, sand, rock, snow (the
//                  terrain's own colouring rules, so grass grows on green);
//   tilt=0..1      how far the instance leans with the slope (grass and
//                  rocks follow the ground; trees, at 0, grow straight up);
//   tint=0..1      how much each instance's brightness varies (+-), so a
//                  field of one model doesn't read as copies;
//   in=X,Z,R       only inside this circle (terrain-local x/z), its density counted over
//                  the circle: a region's own trees, rocks or bamboo;
//   near=M         not placed in the terrain at all: grown round the camera, out
//                  to M metres, as it moves (grassField.ts), so a rule can
//                  carry real density (tufts a step apart) over a whole map.
// Rules are placed in order, so list big things (trees) before small ones:
// the small ones then fill round them.
import { fbm, hash } from "./terrain";

export interface ScatterRule {
  model: number; // catalog id
  density: number; // instances per square world unit
  minScale: number;
  maxScale: number;
  maxSlope: number; // minimum normal y to place on (1 = only flat)
  collide: boolean;
  trunk: boolean; // collides as a trunk-sized post (trees), not a quarter of its footprint
  spacing?: number;
  cluster?: number;
  clusterSize?: number;
  heightMin?: number;
  heightMax?: number;
  layers?: string[];
  tilt?: number;
  tint?: number;
  near?: number;
  within?: [number, number, number];
}

export interface ScatterInstance {
  model: number;
  x: number; // local to the terrain
  y: number;
  z: number;
  scale: number;
  yaw: number;
  collide: boolean;
  trunk?: boolean;
  // The up direction it leans to (a unit vector), when its rule tilts.
  up?: [number, number, number];
  // Brightness factor (1 = as authored), when its rule tints.
  tint?: number;
}

export const foliageLayers = ["grass", "sand", "rock", "snow"] as const;

// Parses one "key=value" option onto `rule`; returns an error or undefined.
export function parseFoliageOption(rule: ScatterRule, word: string): string | undefined {
  const [key, value = ""] = word.split("=", 2);
  const number = Number(value);
  const unit = (name: keyof ScatterRule) => {
    if (!Number.isFinite(number) || number < 0 || number > 1) return `${key} must be 0..1`;
    (rule[name] as number) = number;
    return undefined;
  };
  switch (key) {
    case "spacing":
    case "clusterSize":
    case "near":
      if (!Number.isFinite(number) || number <= 0) return `${key} must be a positive number of metres`;
      rule[key] = number;
      return undefined;
    case "cluster":
    case "tilt":
    case "tint":
      return unit(key);
    case "height": {
      const match = /^(-?[\d.]+)\.\.(-?[\d.]+)$/.exec(value);
      if (!match || !(Number(match[1]) <= Number(match[2]))) return 'height must be "low..high"';
      rule.heightMin = Number(match[1]);
      rule.heightMax = Number(match[2]);
      return undefined;
    }
    case "in": {
      const parts = value.split(",").map(Number);
      if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n)) || !(parts[2]! > 0)) return 'in must be "x,z,radius"';
      rule.within = parts as [number, number, number];
      return undefined;
    }
    case "on": {
      const layers = value.split(",").filter(Boolean);
      const bad = layers.find((l) => !(foliageLayers as readonly string[]).includes(l));
      if (!layers.length || bad) return `on must list ${foliageLayers.join(", ")}`;
      rule.layers = layers;
      return undefined;
    }
    default:
      return `unknown option "${key}" (spacing, cluster, clusterSize, height, on, tilt, tint, near, in)`;
  }
}

// What the ground is like where a plant might go.
export interface FoliageGround {
  height(x: number, z: number): number;
  // The unit surface normal.
  normal(x: number, z: number): [number, number, number];
  // The ground layer (grass, sand, rock, snow); without one, every layer
  // rule passes.
  layer?(x: number, z: number, height: number, normalY: number): string;
  // True where nothing may grow (roads, buildings, an exclusion).
  blocked?(x: number, z: number): boolean;
}

export interface FoliageArea {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  // The area a rule's density is counted over (default: the rectangle's).
  countArea?: number;
}

const smoothstep = (a: number, b: number, t: number) => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

// Deterministic placements for every rule, at most `cap` in total. Without
// options a rule places exactly as the plain scatter always has.
export function placeFoliage(rules: ScatterRule[], ground: FoliageGround, area: FoliageArea, seed: number, cap = 4000): ScatterInstance[] {
  const out: ScatterInstance[] = [];
  const w = area.x1 - area.x0,
    d = area.z1 - area.z0;
  const countArea = area.countArea ?? w * d;
  // Spacing: placed instances in a grid of cells as wide as the largest
  // spacing, so a check looks at the 3 x 3 cells around a candidate.
  const cell = Math.max(1, ...rules.map((r) => (r.spacing ?? 0) * r.maxScale));
  const grid = new Map<string, Array<{ x: number; z: number; r: number }>>();
  const key = (cx: number, cz: number) => `${cx},${cz}`;
  const crowded = (x: number, z: number, r: number) => {
    const cx = Math.floor(x / cell),
      cz = Math.floor(z / cell);
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (const p of grid.get(key(cx + i, cz + j)) ?? []) if (Math.hypot(p.x - x, p.z - z) < Math.max(r, p.r)) return true;
    return false;
  };
  const occupy = (x: number, z: number, r: number) => {
    const k = key(Math.floor(x / cell), Math.floor(z / cell));
    let list = grid.get(k);
    if (!list) grid.set(k, (list = []));
    list.push({ x, z, r });
  };
  rules.forEach((rule, r) => {
    if (rule.near) return; // grown round the camera (grassField.ts)
    // A rule kept to a circle places its count over the circle, sampling only its square.
    const ring = rule.within;
    const ruleArea = ring ? Math.PI * ring[2] * ring[2] : countArea;
    const rx0 = ring ? ring[0] - ring[2] : area.x0, rz0 = ring ? ring[1] - ring[2] : area.z0;
    const rw = ring ? ring[2] * 2 : w, rd = ring ? ring[2] * 2 : d;
    const count = Math.min(cap - out.length, Math.round(rule.density * ruleArea));
    const clustered = (rule.cluster ?? 0) > 0;
    let placed = 0;
    for (let k = 0; k < count * 3 && placed < count; k++) {
      const x = rx0 + hash(k, r, seed + 7) * rw;
      const z = rz0 + hash(k, r + 31, seed + 13) * rd;
      if (ring && Math.hypot(x - ring[0], z - ring[1]) > ring[2]) continue;
      if (x < area.x0 || x > area.x1 || z < area.z0 || z > area.z1) continue;
      const n = ground.normal(x, z);
      if (n[1] < rule.maxSlope) continue;
      if (ground.blocked?.(x, z)) continue;
      const y = ground.height(x, z);
      if (rule.heightMin !== undefined && (y < rule.heightMin || y > rule.heightMax!)) continue;
      if (rule.layers && ground.layer && !rule.layers.includes(ground.layer(x, z, y, n[1]))) continue;
      if (clustered) {
        // Groves where the noise is high; the edge fades over a band.
        const field = fbm(x / (rule.clusterSize ?? 40), z / (rule.clusterSize ?? 40), seed + r * 977 + 5, 3) * 0.5 + 0.5;
        const keep = 1 - rule.cluster! + rule.cluster! * smoothstep(0.45, 0.62, field);
        if (hash(k, r + 401, seed) >= keep) continue;
      }
      const scale = rule.minScale + (rule.maxScale - rule.minScale) * hash(k, r + 57, seed);
      const radius = (rule.spacing ?? 0) * scale;
      if (radius > 0 && crowded(x, z, radius)) continue;
      if (radius > 0) occupy(x, z, radius);
      const instance: ScatterInstance = {
        model: rule.model,
        x,
        y,
        z,
        scale,
        yaw: hash(k, r + 91, seed) * Math.PI * 2,
        collide: rule.collide,
        trunk: rule.trunk,
      };
      if (rule.tilt) {
        const t = rule.tilt;
        const ux = n[0] * t,
          uy = 1 - t + n[1] * t,
          uz = n[2] * t;
        const l = Math.hypot(ux, uy, uz);
        instance.up = [ux / l, uy / l, uz / l];
      }
      if (rule.tint) instance.tint = 1 + (hash(k, r + 613, seed) * 2 - 1) * rule.tint;
      out.push(instance);
      placed++;
    }
  });
  return out;
}
