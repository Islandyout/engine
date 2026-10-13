// The city template: a working town built the way games and planners build
// one (docs/world/CITY_TEMPLATE.md has the research and every number):
//   1. a road grid of 16 m kit tiles (two 4 m lanes, 4 m sidewalks), every
//      junction a signalised crossroads (TrafficSignal);
//   2. blocks between the roads, zoned (downtown, mixed, residential,
//      industrial, park) and filled as perimeter blocks: buildings front the
//      street from the sidewalk edge, the courtyard behind;
//   3. street furniture by the sidewalk's furniture zone (NACTO): trees at a
//      steady rhythm with lamps midway between, a hydrant near each corner,
//      bins at corners and stops, benches at bus stops, nothing in the
//      corners' sight triangles or in front of a hydrant;
//   4. people and traffic that use it: Traffic-mode cars looping blocks in
//      the right lane and stopping on red; Walkers on the sidewalks' through
//      zone, crossing at the crosswalks on the walk light, some with dogs;
//      wildlife in the park; parked cars only in courtyard lots (never in a
//      traffic lane);
//   5. vegetation by foliage.ts rules: groves with clearings and spacing in
//      the park, lawn trees in residential courtyards.
// Everything is deterministic from `seed`, so a game can build on it and
// regenerate it.
import { placeFoliage, type ScatterRule } from "../../apps/editor/src/editor/foliage";
import { component, modelBounds, rgb, vec, type Components, type SceneBuilder, type V3 } from "../gatebreaker/kit";

export type Zone = "downtown" | "mixed" | "residential" | "industrial" | "park";

export interface CityOptions {
  blocksX: number;
  blocksZ: number;
  seed: number;
  // Which zone each block is, row by row (z), west to east (x); default:
  // downtown in the middle, a park, industry on one edge, the rest mixed
  // and residential.
  zones?: Zone[][];
  traffic: number; // cars
  walkers: number; // people on foot
  dogs: number; // walkers' dogs
}

// Street dimensions (metres): the kit tile's carriageway and sidewalks.
export const TILE = 16;
export const GRID = 96; // road centre to road centre: 80 m blocks
export const LANE = 2; // lane centre from the road's centre line
export const KERB = 4; // carriageway half width
export const FURNITURE = KERB + 0.8; // furniture zone line (trees, lamps)
export const THROUGH = KERB + 2.4; // where people walk
export const CROSSWALK = KERB + 1; // where they cross, from the junction's centre
export const STOP = 7; // stop lines from a junction's centre

// Catalog ids.
export const M = {
  road: 64,
  cross: 56,
  midCrossing: 62,
  lamp: 35,
  hydrant: 32,
  bin: 27,
  bench: 1,
  busstop: 29,
  bollard: 28,
  planter: 41,
  bush: 37,
  streetTree: 258,
  oak: 255,
  ash: 256,
  aspen: 257,
  pine: 259,
  leafyBush: 261,
  apartments: [2, 3, 4],
  houses: [5, 6, 7],
  offices: [8, 9, 10],
  parking: [11, 12, 13],
  retail: [14, 15, 16],
  shophouses: [17, 18, 19],
  towers: [20, 21, 22],
  warehouses: [23, 24, 25],
  cars: [219, 220, 221, 222, 223, 224, 234, 227],
  people: [244, 245, 246, 247, 248, 249, 250, 251, 252, 253, 254],
  dog: 243,
  fox: 240,
  deer: 238,
} as const;

// A small, seeded random source (mulberry32).
export function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type P2 = [number, number];
const fmt = (n: number) => n.toFixed(2).replace(/\.?0+$/, "");

export interface City {
  lines: { x: number[]; z: number[] }; // road centre lines
  junctions: P2[];
  blocks: Array<{ x0: number; z0: number; x1: number; z1: number; zone: Zone; i: number; j: number }>;
  spawn: P2; // a sidewalk point for the player
}

// The zone plan by default: downtown in the centre, a park beside it,
// industry along one edge, mixed use round the core, homes outside.
function defaultZones(nx: number, nz: number): Zone[][] {
  const rows: Zone[][] = [];
  const ci = Math.floor(nx / 2),
    cj = Math.floor(nz / 2);
  for (let j = 0; j < nz; j++) {
    const row: Zone[] = [];
    for (let i = 0; i < nx; i++) {
      const ring = Math.max(Math.abs(i - ci), Math.abs(j - cj));
      if (i === ci && j === cj) row.push("downtown");
      else if (i === Math.min(nx - 1, ci + 1) && j === Math.max(0, cj - 1)) row.push("park");
      else if (j === nz - 1 && i === 0) row.push("industrial");
      else row.push(ring <= 1 ? "mixed" : "residential");
    }
    rows.push(row);
  }
  return rows;
}

export function buildCity(scene: SceneBuilder, options: CityOptions): City {
  const rand = random(options.seed);
  const pick = <T>(items: readonly T[]) => items[Math.floor(rand() * items.length)]!;
  const { blocksX: nx, blocksZ: nz } = options;
  const zones = options.zones ?? defaultZones(nx, nz);
  const xs = Array.from({ length: nx + 1 }, (_, i) => (i - nx / 2) * GRID);
  const zs = Array.from({ length: nz + 1 }, (_, j) => (j - nz / 2) * GRID);
  const STUB = 2 * TILE; // roads run on out of town this far
  const minX = xs[0]! - STUB - TILE / 2,
    maxX = xs[nx]! + STUB + TILE / 2;
  const minZ = zs[0]! - STUB - TILE / 2,
    maxZ = zs[nz]! + STUB + TILE / 2;
  const trigger = { Collider: { type: "AABB", isTrigger: true } };
  const hidden = { Renderable: { mesh: 0, material: 0, visible: false } };
  const set = () => {
    const lines: string[] = [];
    // "id x z yaw [scale] [solid|trunk]"
    const put = (id: number, x: number, z: number, yaw = 0, collide: "" | "solid" | "trunk" = "", scale = 1) =>
      lines.push(`${id} ${fmt(x)} ${fmt(z)} ${fmt(((yaw % 360) + 360) % 360)}${scale !== 1 ? ` ${fmt(scale)}` : ""}${collide ? ` ${collide}` : ""}`);
    return { lines, put };
  };
  const flush = (name: string, s: { lines: string[] }, y = 0) => scene.add(name, [0, y, 0], { ModelInstances: { instances: s.lines.join("\n") } });

  // -- Ground: asphalt everywhere, then each block's surface (a raised
  // pad level with the sidewalks) and the town's edge.
  scene.box("City ground", [(minX + maxX) / 2, -0.06, (minZ + maxZ) / 2], [maxX - minX, 0.1, maxZ - minZ], "#3b3d42", trigger, { roughness: 0.95 });
  const blocks: City["blocks"] = [];
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const b = { x0: xs[i]! + TILE / 2, x1: xs[i + 1]! - TILE / 2, z0: zs[j]! + TILE / 2, z1: zs[j + 1]! - TILE / 2, zone: zones[j]![i]!, i, j };
      blocks.push(b);
      const surface = b.zone === "park" ? "#5d7f45" : b.zone === "residential" ? "#6f8a58" : b.zone === "industrial" ? "#7b7a74" : "#a7a29a";
      scene.box(`Block ${i},${j} (${b.zone})`, [(b.x0 + b.x1) / 2, 0.06, (b.z0 + b.z1) / 2], [b.x1 - b.x0, 0.12, b.z1 - b.z0], surface, trigger, { roughness: 0.92 });
    }
  for (const [name, at, size] of [
    ["Town edge W", [minX - 0.5, 3, (minZ + maxZ) / 2], [1, 6, maxZ - minZ]],
    ["Town edge E", [maxX + 0.5, 3, (minZ + maxZ) / 2], [1, 6, maxZ - minZ]],
    ["Town edge N", [(minX + maxX) / 2, 3, minZ - 0.5], [maxX - minX, 1 + 5, 1]],
    ["Town edge S", [(minX + maxX) / 2, 3, maxZ + 0.5], [maxX - minX, 6, 1]],
  ] as Array<[string, V3, V3]>)
    scene.add(name, at, { Scale: { value: vec(...size) }, ...hidden, RigidBody: { dynamic: false }, Collider: { type: "AABB" } });

  // -- Roads: a crossroads tile at every junction, straight tiles between,
  // and out past the edge of town.
  const roads = set();
  const junctions: P2[] = [];
  for (const x of xs) for (const z of zs) {
    junctions.push([x, z]);
    roads.put(M.cross, x, z);
  }
  const park = blocks.find((b) => b.zone === "park");
  for (const x of xs)
    for (let z = zs[0]! - STUB; z <= zs[nz]! + STUB; z += TILE) {
      if (zs.some((jz) => Math.abs(jz - z) < 1)) continue;
      // A mid-block crosswalk where a park meets the street.
      const midPark = park && (x === xs[park.i] || x === xs[park.i + 1]) && Math.abs(z - (park.z0 + park.z1) / 2) < TILE / 2;
      roads.put(midPark ? M.midCrossing : M.road, x, z, 0);
    }
  for (const z of zs)
    for (let x = xs[0]! - STUB; x <= xs[nx]! + STUB; x += TILE) {
      if (xs.some((jx) => Math.abs(jx - x) < 1)) continue;
      roads.put(M.road, x, z, 90);
    }
  flush("Roads", roads);

  // -- Junction lights. Along x the cycle steps with the drive time
  // between junctions at ~11 m/s, so a car that gets one green tends to
  // get the next (a green wave).
  junctions.forEach(([x, z], k) => {
    const offset = (((x - xs[0]!) / GRID) * (GRID / 11)) % 38;
    scene.add(`Signal ${k + 1}`, [x, 0.1, z], { TrafficSignal: { green: 14, yellow: 3, clearance: 2, offset: Math.round(offset * 10) / 10, radius: STOP } });
  });

  // -- Buildings: perimeter blocks. The north and south rows run the
  // block's width; east and west rows fill between them. Each building
  // faces its street from the sidewalk edge (homes set back behind a front
  // garden).
  const buildings = set();
  const yards: Array<{ b: (typeof blocks)[number]; x0: number; z0: number; x1: number; z1: number }> = [];
  const palette: Record<Zone, number[]> = {
    downtown: [...M.towers, ...M.offices],
    mixed: [...M.shophouses, ...M.retail, ...M.apartments, 10],
    residential: [...M.houses, ...M.houses, 2, 3],
    industrial: [...M.warehouses, ...M.parking],
    park: [],
  };
  const size = (id: number) => {
    const { min, max } = modelBounds(id);
    return { w: max[0]! - min[0]!, d: max[2]! - min[2]! };
  };
  for (const b of blocks) {
    if (b.zone === "park") continue;
    const setback = b.zone === "residential" ? 4 : 0.5;
    // A row along an edge: `t` runs along it from `from` to `to`; `face`
    // is the direction to the street.
    const row = (from: number, to: number, place: (t: number, depth: number, w: number, id: number) => void) => {
      let t = from;
      let deepest = 0;
      for (let guard = 0; guard < 30; guard++) {
        const id = pick(palette[b.zone]);
        const { w, d } = size(id);
        if (t + w > to + 0.5) {
          // A last, narrower building if one fits; else leave the gap.
          const fit = palette[b.zone].find((other) => t + size(other).w <= to + 0.5);
          if (fit === undefined) break;
          const s = size(fit);
          place(t + s.w / 2, s.d, s.w, fit);
          deepest = Math.max(deepest, s.d);
          t += s.w + 1;
          continue;
        }
        place(t + w / 2, d, w, id);
        deepest = Math.max(deepest, d);
        t += w + (b.zone === "residential" ? 3 : 1);
      }
      return deepest;
    };
    // North (low z) and south rows span the block.
    const north = row(b.x0, b.x1, (t, d, _w, id) => void buildings.put(id, t, b.z0 + setback + d / 2, 180, "solid"));
    const south = row(b.x0, b.x1, (t, d, _w, id) => void buildings.put(id, t, b.z1 - setback - d / 2, 0, "solid"));
    const inner0 = b.z0 + setback + north + 2,
      inner1 = b.z1 - setback - south - 2;
    // West and east rows between them (yaw 270 faces -x, 90 faces +x).
    let west = 0,
      east = 0;
    if (inner1 - inner0 > 8) {
      west = row(inner0, inner1, (t, d, _w, id) => void buildings.put(id, b.x0 + setback + d / 2, t, 270, "solid"));
      east = row(inner0, inner1, (t, d, _w, id) => void buildings.put(id, b.x1 - setback - d / 2, t, 90, "solid"));
    }
    yards.push({ b, x0: b.x0 + setback + west + 2, x1: b.x1 - setback - east - 2, z0: inner0, z1: inner1 });
  }
  flush("Buildings", buildings);

  // -- The courtyards: parking for downtown, mixed and industrial blocks
  // (cars in marked rows, never in a traffic lane), lawns and trees for
  // homes.
  const yardStuff = set();
  const yardTrees: ScatterRule[] = [
    { model: M.oak, density: 0.004, minScale: 0.55, maxScale: 0.8, maxSlope: 0.8, collide: true, trunk: true, spacing: 9 },
    { model: M.leafyBush, density: 0.01, minScale: 0.8, maxScale: 1.3, maxSlope: 0.8, collide: false, trunk: false, spacing: 3, cluster: 0.6, clusterSize: 12, tint: 0.15 },
  ];
  for (const y of yards) {
    if (y.x1 - y.x0 < 8 || y.z1 - y.z0 < 8) continue;
    if (y.b.zone === "residential") {
      for (const t of placeFoliage(yardTrees, { height: () => 0, normal: () => [0, 1, 0] }, y, options.seed + y.b.i * 7 + y.b.j * 13))
        yardStuff.put(t.model, t.x, t.z, (t.yaw * 180) / Math.PI, t.trunk ? "trunk" : "", t.scale);
      continue;
    }
    // Stalls 2.6 m wide, 5.5 m deep, facing a 6 m aisle; ~70% taken.
    for (let z = y.z0 + 3; z + 2.75 <= y.z1; z += 17) {
      for (let x = y.x0 + 1.5; x + 1.3 <= y.x1; x += 2.6) {
        if (rand() < 0.7) yardStuff.put(pick(M.cars), x, z, 180 + (rand() - 0.5) * 6, "solid");
        if (z + 11.5 <= y.z1 && rand() < 0.7) yardStuff.put(pick(M.cars), x, z + 11.5, (rand() - 0.5) * 6, "solid");
      }
    }
  }
  flush("Courtyards", yardStuff);

  // -- Street furniture, on each block side's sidewalk furniture zone.
  // Corners keep their sight triangle clear (nothing tall within 10 m of
  // the junction); a hydrant stands ~6 m from one corner of each side.
  const furniture = set();
  const street = set();
  const zoneAt = (i: number, j: number) => (i >= 0 && i < nx && j >= 0 && j < nz ? zones[j]![i]! : undefined);
  // Each street's two sides, block by block; a side with no block beside it
  // (the edge of town) is left bare.
  xs.forEach((x, ii) => {
    for (const side of [-1, 1])
      for (let k = 0; k < nz; k++) {
        const zone = zoneAt(side > 0 ? ii : ii - 1, k);
        if (zone && zone !== "park") streetSide(x + side * FURNITURE, zs[k]!, zs[k + 1]!, "z", side, zone);
      }
  });
  zs.forEach((z, jj) => {
    for (const side of [-1, 1])
      for (let k = 0; k < nx; k++) {
        const zone = zoneAt(k, side > 0 ? jj : jj - 1);
        if (zone && zone !== "park") streetSide(z + side * FURNITURE, xs[k]!, xs[k + 1]!, "x", side, zone);
      }
  });
  function streetSide(at: number, a: number, b: number, along: "x" | "z", side: number, zone: Zone) {
    const p = (t: number, off = 0): P2 => (along === "z" ? [at + side * off, t] : [t, at + side * off]);
    // Facing: lamps' arms reach over the road; signs and stops face it.
    const faceRoad = along === "z" ? (side > 0 ? 270 : 90) : side > 0 ? 180 : 0;
    const start = a + STOP + 3,
      end = b - STOP - 3;
    // Hydrant near the start corner; nothing tall within 4 m of it.
    const hydrant = start;
    furniture.put(M.hydrant, ...p(hydrant), faceRoad);
    // A bus stop on the far side of the first junction, on the busier
    // streets (downtown and mixed); a bench and a bin beside it.
    const stopAt = zone === "downtown" || zone === "mixed" ? start + 14 : undefined;
    if (stopAt !== undefined) {
      street.put(M.busstop, ...p(stopAt, 1.6), faceRoad + 180, "solid");
      furniture.put(M.bin, ...p(stopAt + 3.2), 0);
    }
    // Trees every 10 m (not by the hydrant, the stop or a park's crosswalk),
    // lamps midway between every third pair.
    let n = 0;
    for (let t = start + 5; t <= end; t += 10, n++) {
      const clear = Math.abs(t - hydrant) > 4 && (stopAt === undefined || Math.abs(t - stopAt) > 6);
      if (clear && zone !== "industrial") street.put(M.streetTree, ...p(t), rand() * 360, "trunk", 0.85 + rand() * 0.3);
      if (n % 3 === 1 && t + 5 <= end) street.put(M.lamp, ...p(t + 5, -0.3), faceRoad + 180, "trunk");
    }
    // Bins at the far corner.
    furniture.put(M.bin, ...p(end), 0);
  }
  flush("Street trees and lamps", street);
  flush("Street furniture", furniture);

  // -- The park: paths cross it, groves with clearings (foliage.ts
  // rules), benches along the paths.
  if (park) {
    const cx = (park.x0 + park.x1) / 2,
      cz = (park.z0 + park.z1) / 2;
    scene.box("Park path NS", [cx, 0.13, cz], [3.5, 0.02, park.z1 - park.z0], "#b9ad94", trigger, { roughness: 0.95 });
    scene.box("Park path EW", [cx, 0.135, cz], [park.x1 - park.x0, 0.02, 3.5], "#b9ad94", trigger, { roughness: 0.95 });
    const ps = set();
    const rules: ScatterRule[] = [
      { model: M.oak, density: 0.0018, minScale: 0.7, maxScale: 1.05, maxSlope: 0.8, collide: true, trunk: true, spacing: 11, cluster: 0.7, clusterSize: 30 },
      { model: M.ash, density: 0.0009, minScale: 0.6, maxScale: 0.9, maxSlope: 0.8, collide: true, trunk: true, spacing: 11, cluster: 0.7, clusterSize: 30 },
      { model: M.pine, density: 0.0006, minScale: 0.55, maxScale: 0.8, maxSlope: 0.8, collide: true, trunk: true, spacing: 9, cluster: 0.8, clusterSize: 22 },
      { model: M.leafyBush, density: 0.006, minScale: 0.7, maxScale: 1.4, maxSlope: 0.8, collide: false, trunk: false, spacing: 2.5, cluster: 0.8, clusterSize: 14, tint: 0.2 },
    ];
    const onPath = (x: number, z: number) => Math.abs(x - cx) < 3.5 || Math.abs(z - cz) < 3.5;
    const inset = { x0: park.x0 + 2, z0: park.z0 + 2, x1: park.x1 - 2, z1: park.z1 - 2 };
    for (const t of placeFoliage(rules, { height: () => 0, normal: () => [0, 1, 0], blocked: onPath }, inset, options.seed + 99))
      ps.put(t.model, t.x, t.z, (t.yaw * 180) / Math.PI, t.trunk ? "trunk" : "", t.scale);
    for (const d of [-26, -12, 12, 26]) {
      ps.put(M.bench, cx + 2.6, cz + d, 270);
      ps.put(M.bench, cx + d, cz - 2.6, 0);
    }
    ps.put(M.bin, cx + 2.6, cz + 19, 0);
    flush("Park", ps);
    // Wildlife: foxes and deer keep to the park and run from you.
    const animal = (name: string, mesh: number, at: P2, scale: V3) =>
      scene.add(name, [at[0], scale[1] / 2, at[1]], {
        Scale: { value: vec(...scale) },
        Renderable: { mesh, material: 0, visible: true },
        AIState: { state: "Walking" },
        Pedestrian: { archetype: 2 },
        Wildlife: { wary: 18, flee: 8, speed: 6, leash: 30 },
      });
    animal("Park fox 1", M.fox, [cx + 18, cz - 20], [0.25, 0.52, 1.1]);
    animal("Park fox 2", M.fox, [cx - 22, cz + 16], [0.25, 0.52, 1.1]);
    animal("Park deer", M.deer, [cx - 16, cz - 22], [0.6, 1.75, 1.8]);
  }

  // -- Traffic: each car loops a rectangle of blocks in the right lane,
  // straight through the junctions between (stopping on red), turning at
  // its corners. Models are mixed so no two in a row match.
  const lane = (from: P2, to: P2): P2 => {
    const l = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
    const d: P2 = [(to[0] - from[0]) / l, (to[1] - from[1]) / l];
    return [-d[1] * LANE, d[0] * LANE]; // right of travel
  };
  const loopCorners = (i0: number, j0: number, i1: number, j1: number, clockwise: boolean): P2[] => {
    const c: P2[] = [
      [xs[i0]!, zs[j0]!],
      [xs[i1]!, zs[j0]!],
      [xs[i1]!, zs[j1]!],
      [xs[i0]!, zs[j1]!],
    ];
    return clockwise ? c : c.reverse();
  };
  const drive = (corners: P2[]): P2[] => {
    const out: P2[] = [];
    corners.forEach((cur, k) => {
      const prev = corners[(k + corners.length - 1) % corners.length]!,
        next = corners[(k + 1) % corners.length]!;
      const rin = lane(prev, cur),
        rout = lane(cur, next);
      const lin = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]),
        lout = Math.hypot(next[0] - cur[0], next[1] - cur[1]);
      // Into the junction's near edge, out of its far edge.
      out.push([cur[0] - ((cur[0] - prev[0]) / lin) * STOP + rin[0], cur[1] - ((cur[1] - prev[1]) / lin) * STOP + rin[1]]);
      out.push([cur[0] + ((next[0] - cur[0]) / lout) * STOP + rout[0], cur[1] + ((next[1] - cur[1]) / lout) * STOP + rout[1]]);
    });
    return out;
  };
  let lastCar = -1;
  for (let k = 0; k < options.traffic; k++) {
    const i0 = Math.floor(rand() * nx),
      j0 = Math.floor(rand() * nz);
    const i1 = Math.min(nx, i0 + 1 + Math.floor(rand() * 2)),
      j1 = Math.min(nz, j0 + 1 + Math.floor(rand() * 2));
    const points = drive(loopCorners(i0, j0, i1, j1, k % 2 === 0));
    // Start part-way along a leg, facing along it.
    const leg = Math.floor(rand() * points.length);
    const a = points[leg]!,
      b = points[(leg + 1) % points.length]!;
    const f = 0.3 + rand() * 0.4;
    const start: P2 = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    let mesh = pick(M.cars);
    if (mesh === lastCar) mesh = M.cars[(M.cars.indexOf(mesh as never) + 1) % M.cars.length]!;
    lastCar = mesh;
    const { min, max } = modelBounds(mesh);
    const route = [...points.slice(leg + 1), ...points.slice(0, leg + 1)].map(([x, z]) => `${fmt(x)},${fmt(z)}`).join(" ");
    scene.add(`Traffic ${k + 1}`, [start[0], (max[1]! - min[1]!) / 2 + 0.05, start[1]], {
      Scale: { value: vec(max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!) },
      Rotation: { euler: vec(0, Math.atan2(b[0] - a[0], b[1] - a[1]), 0) },
      Renderable: { mesh, material: 0, visible: true },
      RigidBody: { mass: 1300, inverseMass: 1 / 1300, dynamic: true },
      Collider: component("Collider"),
      Vehicle: component("Vehicle", { model: "Arcade", topSpeed: 22, acceleration: 5, braking: 18, grip: 1.1, steering: 30, nitroBoost: 0 }),
      Driver: component("Driver", { mode: "Traffic", route, loop: true, skill: 0.6, aggression: 0.1, speedScale: 0.75 + rand() * 0.2 }),
    } as Components);
  }

  // -- People on foot: each walks the outer sidewalks of a rectangle of
  // blocks, crossing the side streets at the junctions between (waiting
  // at the kerb for the walk light). Some walk a dog.
  const walkLoop = (i0: number, j0: number, i1: number, j1: number): string => {
    // Corners of the rectangle's outer sidewalk ring (through zone), then
    // crossings where a side street meets it.
    const xa = xs[i0]! + THROUGH,
      xb = xs[i1]! - THROUGH,
      za = zs[j0]! + THROUGH,
      zb = zs[j1]! - THROUGH;
    const pts: string[] = [];
    const add = (x: number, z: number, kerb = false) => pts.push(`${fmt(x)},${fmt(z)}${kerb ? "*" : ""}`);
    // Each crossing steps onto the crosswalk (CROSSWALK from the
    // junction's centre), waits at the kerb, crosses, and steps back.
    const c = CROSSWALK;
    // North edge, west to east, crossing each street at x = xs[i].
    add(xa, za);
    for (let i = i0 + 1; i < i1; i++) {
      add(xs[i]! - THROUGH, zs[j0]! + c, true);
      add(xs[i]! + THROUGH, zs[j0]! + c);
    }
    add(xb, za);
    for (let j = j0 + 1; j < j1; j++) {
      add(xs[i1]! - c, zs[j]! - THROUGH, true);
      add(xs[i1]! - c, zs[j]! + THROUGH);
    }
    add(xb, zb);
    for (let i = i1 - 1; i > i0; i--) {
      add(xs[i]! + THROUGH, zs[j1]! - c, true);
      add(xs[i]! - THROUGH, zs[j1]! - c);
    }
    add(xa, zb);
    for (let j = j1 - 1; j > j0; j--) {
      add(xs[i0]! + c, zs[j]! + THROUGH, true);
      add(xs[i0]! + c, zs[j]! - THROUGH);
    }
    return pts.join(" ");
  };
  // Or up one side of a street for a block or two, across at the
  // junction, back down the other side and across again: an errand
  // over the road, two signalised crossings a loop. Roads along z
  // (alongZ) sit at x = xs[line]; u is across the road, v along it.
  const streetLoop = (alongZ: boolean, line: number, a: number, b: number): string => {
    const cross = alongZ ? zs : xs;
    const at = (alongZ ? xs : zs)[line]!;
    const pts: string[] = [];
    const add = (u: number, v: number, kerb = false) =>
      pts.push(`${fmt(alongZ ? at + u : v)},${fmt(alongZ ? v : at + u)}${kerb ? "*" : ""}`);
    const c = CROSSWALK;
    add(THROUGH, cross[a]! + c);
    for (let k = a + 1; k < b; k++) {
      add(c, cross[k]! - THROUGH, true);
      add(c, cross[k]! + THROUGH);
    }
    add(THROUGH, cross[b]! - c, true);
    add(-THROUGH, cross[b]! - c);
    for (let k = b - 1; k > a; k--) {
      add(-c, cross[k]! + THROUGH, true);
      add(-c, cross[k]! - THROUGH);
    }
    add(-THROUGH, cross[a]! + c, true);
    return pts.join(" ");
  };
  const walkerNames: string[] = [];
  for (let k = 0; k < options.walkers; k++) {
    let route: string;
    if (rand() < 0.5) {
      const alongZ = rand() < 0.5;
      const blocks = alongZ ? nz : nx;
      const line = Math.floor(rand() * ((alongZ ? nx : nz) + 1));
      const a = Math.floor(rand() * blocks);
      route = streetLoop(alongZ, line, a, Math.min(blocks, a + 1 + Math.floor(rand() * 2)));
    } else {
      const i0 = Math.floor(rand() * nx),
        j0 = Math.floor(rand() * nz);
      const i1 = Math.min(nx, i0 + 1 + Math.floor(rand() * 2)),
        j1 = Math.min(nz, j0 + 1 + Math.floor(rand() * 2));
      route = walkLoop(i0, j0, i1, j1);
    }
    // Start at one of the route's points, heading round it.
    const points = route.split(" ");
    const startAt = Math.floor(rand() * points.length);
    const [sx, sz] = points[startAt]!.replace("*", "").split(",").map(Number) as [number, number];
    const rotated = [...points.slice(startAt + 1), ...points.slice(0, startAt + 1)].join(" ");
    const mesh = M.people[k % M.people.length]!;
    const name = `Pedestrian ${k + 1}`;
    walkerNames.push(name);
    scene.add(name, [sx, 0.9, sz], {
      Scale: { value: vec(0.6, 1.75, 0.6) },
      Renderable: { mesh, material: 0, visible: true },
      RigidBody: { mass: 70, dynamic: true },
      Collider: {},
      AIState: { state: "Walking" },
      Pedestrian: { archetype: 0 },
      Walker: { route: rotated, speed: 1.2 + rand() * 0.35, loop: true, follow: "", gap: 1.5 },
    });
  }
  for (let k = 0; k < Math.min(options.dogs, walkerNames.length); k++) {
    const owner = walkerNames[(k * 5 + 2) % walkerNames.length]!;
    const ownerEntity = scene.entities.find((e) => e.name === owner)!;
    const p = (ownerEntity.components as { Transform: { position: { x: number; z: number } } }).Transform.position;
    scene.add(`Dog ${k + 1}`, [p.x + 0.8, 0.3, p.z + 0.8], {
      Scale: { value: vec(0.21, 0.59, 0.8) },
      Renderable: { mesh: M.dog, material: 0, visible: true },
      RigidBody: { mass: 12, dynamic: true },
      Collider: {},
      AIState: { state: "Walking" },
      Pedestrian: { archetype: 1 },
      Walker: { route: "", speed: 1.4, loop: true, follow: owner, gap: 1.4 },
    });
  }

  const spawnBlock = blocks.find((b) => b.zone === "downtown") ?? blocks[0]!;
  return { lines: { x: xs, z: zs }, junctions, blocks, spawn: [xs[spawnBlock.i]! + THROUGH, (spawnBlock.z0 + spawnBlock.z1) / 2] };
}

export { rgb };
