// Terrain: heights from seeded fractal noise plus sculpted offsets,
// independent of three.js so it can be unit tested. main.ts builds the mesh
// and foliage from it and sends the heights to the C++ runtime, which
// collides, raycasts and paths against the same grid.

export interface TerrainParams {
  size: number; // world units per side (a square centered on the entity)
  resolution: number; // vertices per side
  height: number; // noise amplitude, world units
  seed: number;
  frequency: number; // noise features per 100 world units
  octaves: number;
  sculpt: string; // base64 Int16 offsets in centimeters, resolution^2 of them ("" = none)
}

// Deterministic integer hash -> [0, 1).
export function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smooth(t: number) {
  return t * t * (3 - 2 * t);
}

// Value noise in [-1, 1].
function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x),
    y0 = Math.floor(y);
  const tx = smooth(x - x0),
    ty = smooth(y - y0);
  const a = hash(x0, y0, seed),
    b = hash(x0 + 1, y0, seed),
    c = hash(x0, y0 + 1, seed),
    d = hash(x0 + 1, y0 + 1, seed);
  return (a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty) * 2 - 1;
}

// Fractal noise in roughly [-1, 1].
export function fbm(x: number, y: number, seed: number, octaves: number): number {
  let sum = 0,
    amplitude = 1,
    frequency = 1,
    total = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * frequency, y * frequency, seed + i * 101) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return sum / total;
}

export function decodeSculpt(text: string, count: number): Int16Array {
  const out = new Int16Array(count);
  if (!text) return out;
  try {
    const binary = atob(text);
    const values = Math.min(count, Math.floor(binary.length / 2));
    for (let i = 0; i < values; i++) {
      const low = binary.charCodeAt(i * 2),
        high = binary.charCodeAt(i * 2 + 1);
      out[i] = (high << 24) >> 16 | low;
    }
  } catch {
    // Unreadable sculpt data: start flat again rather than failing the scene.
  }
  return out;
}

export function encodeSculpt(offsets: Int16Array): string {
  if (offsets.every((v) => v === 0)) return "";
  let binary = "";
  for (const value of offsets) binary += String.fromCharCode(value & 0xff, (value >> 8) & 0xff);
  return btoa(binary);
}

// Heights (relative to the terrain entity's y) for every vertex, row-major
// with x varying fastest: index = row * resolution + column, where column 0
// is the -x edge and row 0 the -z edge.
export function generateHeights(params: TerrainParams, sculpt?: Int16Array): Float32Array {
  const n = params.resolution;
  const heights = new Float32Array(n * n);
  const offsets = sculpt ?? decodeSculpt(params.sculpt, n * n);
  const step = params.size / (n - 1);
  const scale = params.frequency / 100;
  for (let row = 0; row < n; row++)
    for (let column = 0; column < n; column++) {
      const x = -params.size / 2 + column * step,
        z = -params.size / 2 + row * step;
      const i = row * n + column;
      heights[i] = fbm(x * scale, z * scale, params.seed, params.octaves) * params.height + offsets[i]! / 100;
    }
  return heights;
}

// Bilinear height at a local (x, z) position; edges clamp.
export function sampleHeight(heights: Float32Array, resolution: number, size: number, x: number, z: number): number {
  const step = size / (resolution - 1);
  const fx = Math.min(Math.max((x + size / 2) / step, 0), resolution - 1.0001);
  const fz = Math.min(Math.max((z + size / 2) / step, 0), resolution - 1.0001);
  const c = Math.floor(fx),
    r = Math.floor(fz);
  const tx = fx - c,
    tz = fz - r;
  const at = (cc: number, rr: number) => heights[rr * resolution + cc]!;
  const top = at(c, r) + (at(c + 1, r) - at(c, r)) * tx;
  const bottom = at(c, r + 1) + (at(c + 1, r + 1) - at(c, r + 1)) * tx;
  return top + (bottom - top) * tz;
}

// Slope at a local position: the y component of the surface normal (1 = flat).
export function normalY(heights: Float32Array, resolution: number, size: number, x: number, z: number): number {
  const e = size / (resolution - 1);
  const dx = (sampleHeight(heights, resolution, size, x + e, z) - sampleHeight(heights, resolution, size, x - e, z)) / (2 * e);
  const dz = (sampleHeight(heights, resolution, size, x, z + e) - sampleHeight(heights, resolution, size, x, z - e)) / (2 * e);
  return 1 / Math.sqrt(1 + dx * dx + dz * dz);
}

export type BrushMode = "raise" | "lower" | "smooth" | "flatten";

// One brush dab at local (x, z): changes `offsets` (centimeters) so the
// resulting heights move by up to `strength` world units at the center,
// fading smoothly to nothing at `radius`. Flatten pulls toward the height
// under the brush center; smooth pulls toward the neighborhood average.
export function applyBrush(
  params: TerrainParams,
  offsets: Int16Array,
  mode: BrushMode,
  x: number,
  z: number,
  radius: number,
  strength: number,
) {
  const n = params.resolution;
  const step = params.size / (n - 1);
  const heights = generateHeights(params, offsets);
  const target = sampleHeight(heights, n, params.size, x, z);
  const c0 = Math.max(0, Math.floor((x - radius + params.size / 2) / step));
  const c1 = Math.min(n - 1, Math.ceil((x + radius + params.size / 2) / step));
  const r0 = Math.max(0, Math.floor((z - radius + params.size / 2) / step));
  const r1 = Math.min(n - 1, Math.ceil((z + radius + params.size / 2) / step));
  for (let row = r0; row <= r1; row++)
    for (let column = c0; column <= c1; column++) {
      const vx = -params.size / 2 + column * step,
        vz = -params.size / 2 + row * step;
      const distance = Math.hypot(vx - x, vz - z);
      if (distance >= radius) continue;
      const falloff = smooth(1 - distance / radius);
      const i = row * n + column;
      let delta = 0;
      if (mode === "raise") delta = strength * falloff;
      else if (mode === "lower") delta = -strength * falloff;
      else {
        let goal = target;
        if (mode === "smooth") {
          let sum = 0,
            count = 0;
          for (let dr = -1; dr <= 1; dr++)
            for (let dc = -1; dc <= 1; dc++) {
              const rr = row + dr,
                cc = column + dc;
              if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
              sum += heights[rr * n + cc]!;
              count++;
            }
          goal = sum / count;
        }
        delta = (goal - heights[i]!) * Math.min(1, falloff * strength);
      }
      offsets[i] = Math.max(-32768, Math.min(32767, Math.round(offsets[i]! + delta * 100)));
    }
}

import { parseFoliageOption, placeFoliage, type ScatterInstance, type ScatterRule } from "./foliage";
export type { ScatterRule, ScatterInstance } from "./foliage";

// Where no scatter is placed: a rectangle, "exclude x0 z0 x1 z1", or a
// circle, "exclude x z radius" (local x/z).
export interface ScatterExclusion {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  radius?: number; // a circle round (x0, z0)
}

// "model density [minScale maxScale] [minNormalY] [collide|trunk] [key=value
// ...]" per line (the options: foliage.ts), plus "exclude" lines that keep
// scatter out of a rectangle or circle.
export function parseScatter(text: string): { rules: ScatterRule[]; errors: string[]; exclusions: ScatterExclusion[] } {
  const rules: ScatterRule[] = [];
  const errors: string[] = [];
  const exclusions: ScatterExclusion[] = [];
  text.split("\n").forEach((raw, index) => {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) return;
    const all = line.split(/\s+/);
    if (all[0] === "exclude") {
      const numbers = all.slice(1).map(Number);
      if ((all.length !== 5 && all.length !== 4) || numbers.some((v) => !Number.isFinite(v)) || (all.length === 4 && !(numbers[2]! > 0)))
        return void errors.push(`line ${index + 1}: expected "exclude x0 z0 x1 z1" or "exclude x z radius"`);
      const [a, b, c, d] = numbers as [number, number, number, number];
      exclusions.push(all.length === 4 ? { x0: a, z0: b, x1: a, z1: b, radius: c } : { x0: Math.min(a, c), z0: Math.min(b, d), x1: Math.max(a, c), z1: Math.max(b, d) });
      return;
    }
    const words = all.filter((w) => !w.includes("="));
    const options = all.filter((w) => w.includes("="));
    const trunk = words[words.length - 1] === "trunk";
    const collide = trunk || words[words.length - 1] === "collide";
    if (collide) words.pop();
    const [model, density, minScale = "1", maxScale = minScale, maxSlope = "0.8"] = words.map(String);
    const numbers = [model, density, minScale, maxScale, maxSlope].map(Number);
    if (words.length < 2 || words.length > 5 || numbers.some((v) => !Number.isFinite(v)) || numbers[1]! < 0 || numbers[2]! <= 0)
      return void errors.push(`line ${index + 1}: expected "model density [minScale maxScale] [minNormalY] [collide|trunk] [key=value ...]"`);
    const rule: ScatterRule = {
      model: numbers[0]!,
      density: Math.min(numbers[1]!, 1),
      minScale: numbers[2]!,
      maxScale: Math.max(numbers[2]!, numbers[3]!),
      maxSlope: numbers[4]!,
      collide,
      trunk,
    };
    for (const option of options) {
      const error = parseFoliageOption(rule, option);
      if (error) return void errors.push(`line ${index + 1}: ${error}`);
    }
    rules.push(rule);
  });
  return { rules, errors, exclusions };
}

// The terrain's ground layer at a point, by its own colouring rules:
// sand below sandHeight, snow above snowHeight, rock where steeper than
// rockSlope, grass elsewhere.
export interface TerrainLayers {
  sandHeight: number;
  snowHeight: number;
  rockSlope: number;
}
export function terrainLayer(layers: TerrainLayers, height: number, normalY: number): string {
  if (height < layers.sandHeight) return "sand";
  if (height > layers.snowHeight) return "snow";
  if (normalY < layers.rockSlope) return "rock";
  return "grass";
}

// Deterministic placements for every rule, at most 4000 in total
// (foliage.ts placeFoliage, on this heightfield).
export function scatterInstances(
  params: TerrainParams,
  heights: Float32Array,
  rules: ScatterRule[],
  exclusions: ScatterExclusion[] = [],
  layers?: TerrainLayers,
): ScatterInstance[] {
  const { size, resolution } = params;
  const e = size / (resolution - 1);
  const at = (x: number, z: number) => sampleHeight(heights, resolution, size, x, z);
  return placeFoliage(
    rules,
    {
      height: at,
      normal: (x, z) => {
        const dx = (at(x + e, z) - at(x - e, z)) / (2 * e);
        const dz = (at(x, z + e) - at(x, z - e)) / (2 * e);
        const l = Math.sqrt(1 + dx * dx + dz * dz);
        return [-dx / l, 1 / l, -dz / l];
      },
      layer: layers ? (_x, _z, height, ny) => terrainLayer(layers, height, ny) : undefined,
      blocked: (x, z) =>
        exclusions.some((ex) => (ex.radius !== undefined ? Math.hypot(x - ex.x0, z - ex.z0) < ex.radius : x >= ex.x0 && x <= ex.x1 && z >= ex.z0 && z <= ex.z1)),
    },
    { x0: -size * 0.49, z0: -size * 0.49, x1: size * 0.49, z1: size * 0.49, countArea: size * size },
    params.seed,
  );
}
