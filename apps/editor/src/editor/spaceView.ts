// Spaceflight presentation (0.71.0): the star system around a scene's
// site -- planets that refine as you approach, atmospheres, a sky that
// fades to stars with altitude, the sun -- the ship's predicted orbit, a
// chase camera you can look around with (it never steers the ship), the
// ship's engine effects and sound, and the flight HUD. Everything is read
// from the runtime (editor_space_*); none of it changes the simulation.
//
// The system is drawn in its own pass before the scene: planets are
// thousands of kilometres deep, which no single depth range holds together
// with a cockpit-scale scene, so the scene renders over it with its depth
// cleared. Positions are in the site frame (metres around the site, +y up),
// kept in doubles: three.js composes model-view matrices in doubles, so a
// mesh far from the origin still renders steadily.
import * as THREE from "three";
import { buildKestrel, cloudShell, milkyWay, signalStructure } from "./spaceArt";

export interface SpaceRuntime {
  _editor_space_value(field: number): number;
  _editor_space_body_value(index: number, field: number): number;
  _editor_space_frame(field: number): number;
  _editor_space_body_spin(index: number, field: number): number;
  _editor_planet_lava(index: number, x: number, y: number, z: number): number;
  _editor_planet_height(index: number, x: number, y: number, z: number): number;
  _editor_space_path(count: number, horizon: number): number;
  _editor_space_path_value(index: number, axis: number): number;
  _editor_space_ground(x: number, z: number): number;
  _editor_space_wet(x: number, z: number): number;
}

export interface SpaceBody {
  name: string;
  parent: number;
  orbitRadius: number;
  period: number;
  phase: number;
  inclination: number;
  radius: number;
  gravity: number;
  atmosphereHeight: number;
  atmosphereDensity: number;
  terrainAmplitude: number;
  terrainScale: number;
  seed: number;
  color: string;
  haze: string;
  // Options after the colours, "key=value": sea (m, relative to the
  // radius), clouds (0..1 cover), snow (0/1), hidden (0/1: not drawn or
  // listed until a script reveals it), unlit (0/1: barely reflects light).
  sea?: number;
  clouds: number;
  snow: boolean;
  hidden: boolean;
  unlit: boolean;
  // Terrain features and turn (0.74.0): craters (0..1 density), rifts and
  // dunes (0/1), day (seconds per turn, 0: none).
  craters: number;
  rifts: boolean;
  dunes: boolean;
  day: number;
}

// One body per line (see SpaceSystemComponent.bodies). Blank lines and
// lines starting with # are skipped.
export function parseSpaceBodies(text: string): { bodies: SpaceBody[]; errors: string[] } {
  const bodies: SpaceBody[] = [];
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((raw, line) => {
    const tokens = raw.trim().split(/\s+/);
    if (!tokens[0] || tokens[0].startsWith("#")) return;
    if (tokens.length < 13) {
      errors.push(`line ${line + 1}: expected at least 13 fields, got ${tokens.length}`);
      return;
    }
    const [name, parentName] = tokens as [string, string];
    const numbers = tokens.slice(2, 13).map(Number);
    if (numbers.some((n) => !Number.isFinite(n))) {
      errors.push(`line ${line + 1}: fields 3-13 must be numbers`);
      return;
    }
    const parent = parentName === "-" ? -1 : bodies.findIndex((b) => b.name === parentName);
    if (parentName !== "-" && parent < 0) {
      errors.push(`line ${line + 1}: parent "${parentName}" must be listed before ${name}`);
      return;
    }
    const [orbitRadius, period, phase, inclination, radius, gravity, atmosphereHeight, atmosphereDensity, terrainAmplitude, terrainScale, seed] =
      numbers as [number, number, number, number, number, number, number, number, number, number, number];
    if (!(radius > 0) || !(gravity > 0) || !(period > 0) || !(terrainScale > 0)) {
      errors.push(`line ${line + 1}: radius, gravity, period and terrain scale must be positive`);
      return;
    }
    bodies.push({
      name,
      parent,
      orbitRadius,
      period,
      phase,
      inclination,
      radius,
      gravity,
      atmosphereHeight,
      atmosphereDensity,
      terrainAmplitude,
      terrainScale,
      seed,
      color: /^#[0-9a-f]{6}$/i.test(tokens[13] ?? "") ? tokens[13]! : "#8a8a80",
      haze: /^#[0-9a-f]{6}$/i.test(tokens[14] ?? "") ? tokens[14]! : "#000000",
      ...options(tokens.slice(13)),
    });
  });
  return { bodies, errors };
}

export interface Landmark {
  body: number;
  latitude: number;
  longitude: number;
  color: string;
  label: string;
  // The structure's kind (0.73.0): array, monolith, ruin, camp or beacon.
  kind: string;
}

// One per line: "body latitude longitude #color [kind=array] label words".
export function parseLandmarks(text: string, bodies: SpaceBody[]): Landmark[] {
  const out: Landmark[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const tokens = raw.trim().split(/\s+/);
    if (tokens.length < 3 || tokens[0]!.startsWith("#")) continue;
    const body = bodies.findIndex((b) => b.name === tokens[0]);
    const latitude = Number(tokens[1]), longitude = Number(tokens[2]);
    if (body < 0 || !Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    const color = /^#[0-9a-f]{6}$/i.test(tokens[3] ?? "") ? tokens[3]! : "#9fe8ff";
    let rest = tokens.slice(/^#/.test(tokens[3] ?? "") ? 4 : 3);
    let kind = "array";
    if (/^kind=\w+$/.test(rest[0] ?? "")) {
      kind = rest[0]!.slice(5);
      rest = rest.slice(1);
    }
    const label = rest.join(" ") || bodies[body]!.name;
    out.push({ body, latitude, longitude, color, label, kind });
  }
  return out;
}

// A latitude/longitude (degrees) to a unit direction in a body's frame --
// the same convention as the runtime's site and space.place_landed.
export function latLonDirection(latitude: number, longitude: number) {
  const lat = THREE.MathUtils.degToRad(latitude), lon = THREE.MathUtils.degToRad(longitude);
  return new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon));
}

function options(tokens: string[]) {
  const values: Record<string, number> = {};
  for (const token of tokens) {
    const [key, value] = token.split("=");
    if (key && value !== undefined && Number.isFinite(Number(value))) values[key] = Number(value);
  }
  return {
    sea: values.sea,
    clouds: THREE.MathUtils.clamp(values.clouds ?? 0, 0, 1),
    snow: values.snow === 1,
    hidden: values.hidden === 1,
    unlit: values.unlit === 1,
    craters: THREE.MathUtils.clamp(values.craters ?? 0, 0, 1),
    rifts: values.rifts === 1,
    dunes: values.dunes === 1,
    day: Math.max(0, values.day ?? 0),
  };
}

export interface Species {
  id: string;
  body: number;
  kind: "flora" | "mineral" | "fauna";
  model: number;
  weight: number;
  scale: number;
  name: string;
  description: string;
}

// One per line: "id body class model weight scale Name words | description".
export function parseSpecies(text: string, bodies: SpaceBody[]): Species[] {
  const out: Species[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const [head, description = ""] = raw.split("|");
    const tokens = (head ?? "").trim().split(/\s+/);
    if (tokens.length < 7 || tokens[0]!.startsWith("#")) continue;
    const body = bodies.findIndex((b) => b.name === tokens[1]);
    const kind = tokens[2] as Species["kind"];
    const [model, weight, scale] = tokens.slice(3, 6).map(Number) as [number, number, number];
    if (body < 0 || !["flora", "mineral", "fauna"].includes(kind) || !Number.isInteger(model) || !(weight >= 0) || !(scale > 0)) continue;
    out.push({ id: tokens[0]!, body, kind, model, weight, scale, name: tokens.slice(6).join(" "), description: description.trim() });
  }
  return out;
}

// The runtime's view of the flight, sampled once per frame.
export interface FlightState {
  piloting: boolean;
  altitude: number;
  speed: number;
  verticalSpeed: number;
  groundSpeed: number;
  throttle: number;
  fuel: number;
  hull: number;
  heat: number;
  density: number;
  warp: number;
  assist: number;
  landed: boolean;
  periapsis: number;
  apoapsis: number;
  orbitClosed: boolean;
  ref: number;
  g: number;
  engineOn: boolean;
  vertical: number;
  destroyed: boolean;
  target: number;
  targetDistance: number;
  siteDistance: number;
  period: number;
  // Landing telemetry (0.74.0): ground slope (degrees), the gear's limits,
  // and water under the ship.
  slope: number;
  sinkLimit: number;
  slopeLimit: number;
  driftLimit: number;
  overWater: boolean;
}

export const assistNames = ["MANUAL", "STABILIZED", "NAV PROGRADE", "NAV RETROGRADE", "NAV TARGET", "NAV AUTOPILOT"];

function readFlight(rt: SpaceRuntime): FlightState {
  const v = (f: number) => rt._editor_space_value(f);
  return {
    piloting: v(0) === 1,
    altitude: v(8),
    speed: v(9),
    verticalSpeed: v(10),
    groundSpeed: v(11),
    throttle: v(12),
    fuel: v(13),
    hull: v(14),
    heat: v(15),
    density: v(16),
    warp: v(17),
    assist: v(18),
    landed: v(19) === 1,
    periapsis: v(20),
    apoapsis: v(21),
    orbitClosed: v(22) === 1,
    ref: v(23),
    g: v(24),
    engineOn: v(25) === 1,
    vertical: v(26),
    destroyed: v(28) === 1,
    target: v(29),
    targetDistance: v(30),
    siteDistance: v(31),
    period: v(32),
    slope: v(47),
    sinkLimit: v(48),
    slopeLimit: v(49),
    driftLimit: v(50),
    overWater: v(51) === 1,
  };
}

// ---- planets: a quadtree of terrain chunks per cube face ----------------

const faces: Array<[THREE.Vector3, THREE.Vector3, THREE.Vector3]> = [
  [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0)],
  [new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)],
  [new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1)],
  [new THREE.Vector3(0, -1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)],
  [new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)],
  [new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0)],
];
const grid = 17; // vertices per chunk side

// Chunks a frame may build: a count and a deadline (performance.now()).
interface ChunkBudget {
  left: number;
  built: number;
  until: number;
}

interface Chunk {
  face: number;
  level: number;
  u: number; // lower corner in [-1, 1]
  v: number;
  size: number;
  centre: THREE.Vector3; // on the sphere, body frame
  mesh?: THREE.Mesh;
  children?: Chunk[];
}

// A cube-face point to the sphere (the "spherified cube": even cells).
function cubeToSphere(face: number, u: number, v: number, out: THREE.Vector3) {
  const [n, a, b] = faces[face]!;
  const x = n.x + a.x * u + b.x * v;
  const y = n.y + a.y * u + b.y * v;
  const z = n.z + a.z * u + b.z * v;
  const x2 = x * x, y2 = y * y, z2 = z * z;
  out.set(
    x * Math.sqrt(1 - y2 / 2 - z2 / 2 + (y2 * z2) / 3),
    y * Math.sqrt(1 - z2 / 2 - x2 / 2 + (z2 * x2) / 3),
    z * Math.sqrt(1 - x2 / 2 - y2 / 2 + (x2 * y2) / 3),
  );
  return out.normalize();
}

class Planet {
  readonly group = new THREE.Group();
  readonly material: THREE.MeshStandardMaterial;
  private readonly roots: Chunk[];
  private readonly maxLevel: number;
  private readonly colors: { low: THREE.Color; mid: THREE.Color; high: THREE.Color; rock: THREE.Color };
  atmosphere?: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  clouds?: THREE.Mesh<THREE.SphereGeometry, THREE.MeshLambertMaterial>;

  constructor(
    private readonly rt: SpaceRuntime,
    readonly index: number,
    readonly body: SpaceBody,
  ) {
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    // An unlit body (0.73.0) reflects almost nothing: a shape against the stars.
    if (body.unlit) this.material.color.setScalar(0.08);
    // Water is glossy: a per-vertex "water" weight lowers the roughness.
    this.material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float water;\nattribute float lava;\nvarying float vWater;\nvarying float vLava;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvWater = water;\nvLava = lava;");
      // Lava rifts (0.74.0) glow on their own, day or night.
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vWater;\nvarying float vLava;")
        .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.12, vWater);")
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.32, 0.06) * smoothstep(0.35, 0.9, vLava) * 2.2;");
    };
    const base = new THREE.Color(body.color);
    const haze = new THREE.Color(body.haze);
    this.colors = {
      low: base.clone().multiplyScalar(0.65).lerp(haze, 0.12),
      mid: base.clone(),
      high: base.clone().lerp(new THREE.Color("#a49c8c"), 0.55),
      rock: base.clone().lerp(new THREE.Color("#5a554e"), 0.7),
    };
    // Chunks down to ~30 m across.
    this.maxLevel = Math.max(2, Math.min(14, Math.ceil(Math.log2((body.radius * 1.6) / 30))));
    this.roots = faces.map((_, face) => this.chunk(face, 0, -1, -1, 2));
    if (body.atmosphereHeight > 0 && body.atmosphereDensity > 0) this.atmosphere = atmosphereShell(body);
    if (this.atmosphere) this.group.add(this.atmosphere);
    if (body.clouds > 0) {
      this.clouds = cloudShell(body.radius, Math.min(Math.max(body.atmosphereHeight * 0.33, 1500), 4000), body.clouds, body.seed);
      this.group.add(this.clouds);
    }
  }

  private chunk(face: number, level: number, u: number, v: number, size: number): Chunk {
    const centre = cubeToSphere(face, u + size / 2, v + size / 2, new THREE.Vector3()).multiplyScalar(this.body.radius);
    return { face, level, u, v, size, centre };
  }

  private build(chunk: Chunk) {
    const n = grid;
    const radius = this.body.radius;
    const positions = new Float32Array((n * n + 4 * n) * 3);
    const colors = new Float32Array((n * n + 4 * n) * 3);
    const dir = new THREE.Vector3();
    const p = new THREE.Vector3();
    const heights = new Float32Array(n * n);
    const seabed = new Float32Array(n * n);
    const sea = this.body.sea ?? -Infinity;
    const amplitude = Math.max(this.body.terrainAmplitude, 1);
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        cubeToSphere(chunk.face, chunk.u + (chunk.size * i) / (n - 1), chunk.v + (chunk.size * j) / (n - 1), dir);
        const ground = this.rt._editor_planet_height(this.index, dir.x, dir.y, dir.z);
        seabed[j * n + i] = ground;
        const h = Math.max(ground, sea);
        heights[j * n + i] = h;
        p.copy(dir).multiplyScalar(radius + h).sub(chunk.centre);
        positions.set([p.x, p.y, p.z], (j * n + i) * 3);
      }
    // Skirts: each edge repeated, dropped below the surface, hiding cracks
    // between chunks of different detail.
    const drop = (chunk.size / 2) * radius * 0.02 + 5;
    const vertexHeight = new Float32Array(n * n + 4 * n);
    vertexHeight.set(seabed);
    const source = new Int32Array(n * n + 4 * n);
    let k = n * n;
    const edge = (i: number, j: number) => {
      cubeToSphere(chunk.face, chunk.u + (chunk.size * i) / (n - 1), chunk.v + (chunk.size * j) / (n - 1), dir);
      p.copy(dir).multiplyScalar(radius + heights[j * n + i]! - drop).sub(chunk.centre);
      positions.set([p.x, p.y, p.z], k * 3);
      vertexHeight[k] = seabed[j * n + i]!;
      source[k] = j * n + i;
      return k++;
    };
    const surface: number[] = [];
    for (let j = 0; j < n - 1; j++)
      for (let i = 0; i < n - 1; i++) {
        const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
        // Counter-clockwise seen from outside (each face's u x v is its normal).
        surface.push(a, b, c, b, d, c);
      }
    const skirts: number[] = [];
    // Skirts are seen from either side, so both windings.
    const skirt = (cells: Array<[number, number]>) => {
      const low = cells.map(([i, j]) => edge(i, j));
      for (let s = 0; s < cells.length - 1; s++) {
        const [i0, j0] = cells[s]!, [i1, j1] = cells[s + 1]!;
        const a = j0 * n + i0, b = j1 * n + i1, c = low[s]!, d = low[s + 1]!;
        skirts.push(a, b, c, b, d, c, a, c, b, b, c, d);
      }
    };
    const row = (j: number) => Array.from({ length: n }, (_, i) => [i, j] as [number, number]);
    const col = (i: number) => Array.from({ length: n }, (_, j) => [i, j] as [number, number]);
    skirt(row(0));
    skirt(row(n - 1));
    skirt(col(0));
    skirt(col(n - 1));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    // Normals from the surface alone (skirts would bend the edges), then the
    // skirts take their edge vertex's normal.
    geometry.setIndex(surface);
    geometry.computeVertexNormals();
    const normals = geometry.getAttribute("normal") as THREE.BufferAttribute;
    for (let v = n * n; v < k; v++) normals.setXYZ(v, normals.getX(source[v]!), normals.getY(source[v]!), normals.getZ(source[v]!));
    geometry.setIndex(surface.concat(skirts));
    // Colour by height and slope: lowlands, the body's colour, pale heights,
    // rock on steep ground, snow on high peaks, sand at the shore, and water
    // tinted by depth -- with a little per-vertex variation so slopes read.
    const c = new THREE.Color();
    const water = new Float32Array(k);
    const lavaAmount = new Float32Array(k);
    const basalt = new THREE.Color("#1c1412");
    const shallow = new THREE.Color("#3f8a96"), deep = new THREE.Color("#0f2f44"), sand = new THREE.Color("#c9b98c");
    const snow = new THREE.Color("#eef3f6");
    for (let v = 0; v < k; v++) {
      const h = vertexHeight[v]!;
      const up = p.set(positions[v * 3]!, positions[v * 3 + 1]!, positions[v * 3 + 2]!).add(chunk.centre).normalize();
      if (h < sea) {
        c.copy(shallow).lerp(deep, THREE.MathUtils.clamp((sea - h) / 80, 0, 1));
        water[v] = 1;
      } else {
        const slope = 1 - Math.abs(normals.getX(v) * up.x + normals.getY(v) * up.y + normals.getZ(v) * up.z);
        const t = THREE.MathUtils.clamp(h / amplitude, -1, 1);
        if (t < 0) c.copy(this.colors.mid).lerp(this.colors.low, -t);
        else c.copy(this.colors.mid).lerp(this.colors.high, t * t);
        c.lerp(this.colors.rock, THREE.MathUtils.clamp((slope - 0.08) * 5, 0, 1));
        if (h - sea < 5) c.lerp(sand, 1 - THREE.MathUtils.clamp((h - sea) / 5, 0, 1));
        if (this.body.snow && t > 0.5) c.lerp(snow, THREE.MathUtils.clamp((t - 0.5) * 4 - slope * 3, 0, 1));
        const jitter = (Math.sin(up.x * 91731.7 + up.y * 37211.3 + up.z * 51923.1) * 43758.5453) % 1;
        c.multiplyScalar(0.93 + Math.abs(jitter) * 0.14);
        if (this.body.rifts) {
          const l = this.rt._editor_planet_lava(this.index, up.x, up.y, up.z);
          lavaAmount[v] = l;
          // Cooled black crust around the channel, molten in it.
          if (l > 0) c.lerp(basalt, THREE.MathUtils.clamp(l * 1.6, 0, 1));
        }
      }
      colors.set([c.r, c.g, c.b], v * 3);
    }
    geometry.setAttribute("water", new THREE.BufferAttribute(water, 1));
    geometry.setAttribute("lava", new THREE.BufferAttribute(lavaAmount, 1));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.position.copy(chunk.centre);
    mesh.receiveShadow = false;
    mesh.castShadow = false;
    chunk.mesh = mesh;
  }

  private dispose(chunk: Chunk) {
    if (chunk.mesh) {
      chunk.mesh.removeFromParent();
      chunk.mesh.geometry.dispose();
      chunk.mesh = undefined;
    }
    chunk.children?.forEach((c) => this.dispose(c));
    chunk.children = undefined;
  }

  // Refines toward the camera (in the body frame), building at most
  // `budget` chunks; a chunk stays drawn until all its children are ready.
  update(cameraBody: THREE.Vector3, budget: ChunkBudget) {
    for (const root of this.roots) this.visit(root, cameraBody, budget);
  }

  // Coarse first: a chunk builds itself before its children, so there is
  // always a surface to draw while detail streams in; it hands over to its
  // children once all four are ready.
  private visit(chunk: Chunk, camera: THREE.Vector3, budget: ChunkBudget): boolean {
    const arc = (chunk.size / 2) * this.body.radius * 1.15;
    const distance = camera.distanceTo(chunk.centre);
    // Back of the planet: skip detail but keep a mesh.
    const facing = chunk.centre.dot(camera) / (this.body.radius * Math.max(camera.length(), 1));
    const wantSplit = chunk.level < this.maxLevel && distance < arc * 1.7 && facing > -0.3;
    const self = this.ensure(chunk, budget);
    if (wantSplit && self) {
      chunk.children ??= [0, 1, 2, 3].map((q) =>
        this.chunk(chunk.face, chunk.level + 1, chunk.u + (q % 2) * (chunk.size / 2), chunk.v + Math.floor(q / 2) * (chunk.size / 2), chunk.size / 2),
      );
      let ready = true;
      for (const child of chunk.children) ready = this.visit(child, camera, budget) && ready;
      if (ready) {
        if (chunk.mesh?.parent) chunk.mesh.removeFromParent();
        return true;
      }
      // Children still building: this one stays drawn, theirs hidden.
      for (const child of chunk.children) this.hide(child);
      this.attach(chunk);
      return true;
    }
    if (chunk.children) {
      chunk.children.forEach((c) => this.dispose(c));
      chunk.children = undefined;
    }
    if (self) this.attach(chunk);
    return self;
  }

  private ensure(chunk: Chunk, budget: ChunkBudget) {
    if (chunk.mesh) return true;
    // A count and a time budget (0.75.0): detail streams in over frames
    // instead of costing one frame a spike; the first build always runs.
    if (budget.left <= 0 || (budget.built > 0 && performance.now() > budget.until)) return false;
    budget.left--;
    budget.built++;
    this.build(chunk);
    return true;
  }

  private attach(chunk: Chunk) {
    if (chunk.mesh && !chunk.mesh.parent) this.group.add(chunk.mesh);
  }

  private hide(chunk: Chunk) {
    if (chunk.mesh?.parent) chunk.mesh.removeFromParent();
    chunk.children?.forEach((c) => this.hide(c));
  }

  disposeAll() {
    this.roots.forEach((r) => this.dispose(r));
    this.material.dispose();
    this.atmosphere?.geometry.dispose();
    this.atmosphere?.material.dispose();
    this.clouds?.geometry.dispose();
    this.clouds?.material.map?.dispose();
    this.clouds?.material.dispose();
  }
}

function atmosphereShell(body: SpaceBody) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(body.haze) },
      sun: { value: new THREE.Vector3(0, 1, 0) },
      strength: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal; varying vec3 vView; varying vec3 vWorldNormal;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        vView = normalize(cameraPosition - world.xyz);
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 color; uniform vec3 sun; uniform float strength;
      varying vec3 vView; varying vec3 vWorldNormal;
      void main() {
        float rim = 1.0 - abs(dot(vWorldNormal, vView));
        float lit = clamp(dot(vWorldNormal, sun) * 1.4 + 0.35, 0.0, 1.0);
        float a = pow(rim, 2.6) * lit * strength;
        gl_FragColor = vec4(color * (1.2 + lit), a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), material);
  mesh.scale.setScalar(body.radius + body.atmosphereHeight * 1.2);
  mesh.renderOrder = 2;
  return mesh;
}

function glowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.12, "rgba(255,250,235,0.95)");
  g.addColorStop(0.3, "rgba(255,225,170,0.35)");
  g.addColorStop(1, "rgba(255,200,140,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function starField() {
  const count = 4000;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  let seed = 12345;
  const random = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const z = random() * 2 - 1, a = random() * Math.PI * 2, r = Math.sqrt(1 - z * z);
    positions.set([r * Math.cos(a), z, r * Math.sin(a)], i * 3);
    const brightness = 0.25 + Math.pow(random(), 6) * 1.6;
    c.setHSL(0.55 + random() * 0.15 - (random() < 0.3 ? 0.5 : 0), 0.35, 0.6).multiplyScalar(brightness);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: 1.6,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = -2;
  return points;
}

function skyDome() {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      up: { value: new THREE.Vector3(0, 1, 0) },
      sun: { value: new THREE.Vector3(0, 1, 0) },
      haze: { value: new THREE.Color() },
      air: { value: 0 },
      day: { value: 1 },
      sunset: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 up; uniform vec3 sun; uniform vec3 haze; uniform float air; uniform float day; uniform float sunset;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = dot(d, up);
        float horizon = pow(1.0 - clamp(h, 0.0, 1.0), 3.0);
        vec3 zenith = haze * 0.42;
        vec3 col = mix(zenith, haze * 0.85, horizon);
        float s = max(dot(d, sun), 0.0);
        // Low sun: an orange band along the horizon, strongest toward it.
        col = mix(col, vec3(1.0, 0.52, 0.26) * 1.05, sunset * horizon * (0.35 + 0.65 * pow(s, 2.0)));
        col += vec3(1.0, 0.88, 0.68) * (pow(s, 32.0) * 0.22 + pow(s, 900.0) * 1.2);
        // Below the horizon the ground haze darkens toward the planet.
        col = mix(col, haze * 0.35, clamp(-h * 6.0, 0.0, 1.0));
        float a = clamp(air * day, 0.0, 1.0);
        // Opaque, drawn first: space black where there's no air or daylight.
        gl_FragColor = vec4(col * day * a, 1.0);
      }`,
    side: THREE.BackSide,
    transparent: false,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}

// ---- ship effects ------------------------------------------------------

interface ShipDecor {
  holder: THREE.Group;
  flames: Array<{ flame: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>; core: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial> }>;
  lift: THREE.Sprite;
  plasma: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  dust: THREE.Sprite;
  size: THREE.Vector3;
}

// The engine note: filtered noise and a low rumble, muffled in thin air and
// gone in vacuum except for what carries through the hull.
class ThrusterVoice {
  private readonly noiseGain: GainNode;
  private readonly filter: BiquadFilterNode;
  private readonly rumble: OscillatorNode;
  private readonly rumbleGain: GainNode;
  constructor(
    private readonly context: BaseAudioContext,
    output: AudioNode,
  ) {
    const length = context.sampleRate * 2;
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      last = last * 0.96 + (Math.random() * 2 - 1) * 0.2;
      data[i] = last;
    }
    const noise = context.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    this.filter = context.createBiquadFilter();
    this.filter.type = "lowpass";
    this.noiseGain = context.createGain();
    this.noiseGain.gain.value = 0;
    noise.connect(this.filter).connect(this.noiseGain).connect(output);
    noise.start();
    this.rumble = context.createOscillator();
    this.rumble.type = "sawtooth";
    this.rumble.frequency.value = 38;
    const rumbleFilter = context.createBiquadFilter();
    rumbleFilter.type = "lowpass";
    rumbleFilter.frequency.value = 120;
    this.rumbleGain = context.createGain();
    this.rumbleGain.gain.value = 0;
    this.rumble.connect(rumbleFilter).connect(this.rumbleGain).connect(output);
    this.rumble.start();
  }
  update(thrust: number, air: number, speed: number) {
    const t = this.context.currentTime;
    const carried = 0.25 + 0.75 * air; // vacuum: only through the hull
    this.noiseGain.gain.setTargetAtTime((thrust * 0.5 + Math.min(speed / 400, 1) * air * 0.25) * carried, t, 0.08);
    this.filter.frequency.setTargetAtTime(300 + 2600 * air * (0.3 + thrust * 0.7), t, 0.1);
    this.rumbleGain.gain.setTargetAtTime(thrust * 0.22, t, 0.08);
    this.rumble.frequency.setTargetAtTime(32 + thrust * 18, t, 0.1);
  }
  silence() {
    const t = this.context.currentTime;
    this.noiseGain.gain.setTargetAtTime(0, t, 0.05);
    this.rumbleGain.gain.setTargetAtTime(0, t, 0.05);
  }
}

// ---- the view ----------------------------------------------------------

export class SpaceView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 1, 1, 1e8);
  readonly bodies: SpaceBody[];
  private readonly planets: Planet[];
  private readonly frame = new THREE.Quaternion();
  private readonly sunLight = new THREE.DirectionalLight(0xffffff, 3);
  private readonly ambient = new THREE.AmbientLight(0xffffff, 0.04);
  private readonly sunSprite: THREE.Sprite;
  private readonly stars = starField();
  private readonly galaxy = milkyWay();
  // 0..1: how low the sun is (for warm light and sky).
  sunset = 0;
  private readonly sky = skyDome();
  private readonly path: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private pathTimer = 0;
  private warm = 0;
  // Milliseconds a frame may spend building terrain once warm (the frame
  // governor lowers it under load).
  chunkMs = 4;
  private readonly starColor: THREE.Color;
  flight: FlightState;
  // In the site frame, toward the star.
  readonly sunDirection = new THREE.Vector3(0, 1, 0);
  // Sky colour and how much air the camera is in (0..1), for the scene's fog.
  readonly skyColor = new THREE.Color();
  air = 0;
  daylight = 1;
  // Ship pose, interpolated between ticks.
  private readonly previous = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
  private readonly current = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
  private sampled = false;
  // Chase camera: the frame it follows and the player's look offset.
  private readonly chase = new THREE.Quaternion();
  private chasePlaced = false;
  private lookYaw = 0;
  // The mouse's virtual stick (0.75.0), drawn by the HUD: x right, y down,
  // -1..1; `available` when a click would capture it.
  stick = { x: 0, y: 0, deadzone: 0.08, active: false, available: false };
  private lookPitch = 0;
  private lookIdle = 0;
  private decor?: ShipDecor;
  private voice?: ThrusterVoice;

  readonly landmarks: Array<Landmark & { anchor: THREE.Object3D; beam: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>; flare: THREE.Sprite; rings: THREE.Mesh[] }> = [];
  private grammarTime = 0;

  constructor(
    private readonly rt: SpaceRuntime,
    bodies: SpaceBody[],
    starColor: THREE.Color,
    landmarks: Landmark[] = [],
    private readonly shipModel = "",
  ) {
    this.bodies = bodies;
    this.starColor = starColor;
    this.scene.background = new THREE.Color(0x000000);
    this.scene.add(this.stars, this.galaxy, this.sky, this.sunLight, this.ambient);
    this.sunSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture(), color: starColor, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }),
    );
    this.sunSprite.renderOrder = 1;
    this.scene.add(this.sunSprite);
    this.planets = bodies.map((body, i) => {
      const planet = new Planet(rt, i, body);
      this.scene.add(planet.group);
      return planet;
    });
    // Landmarks: a pillar of light from the surface, visible from orbit.
    const glow = glowTexture();
    for (const landmark of landmarks) {
      const planet = this.planets[landmark.body];
      if (!planet) continue;
      const dir = latLonDirection(landmark.latitude, landmark.longitude);
      const ground = planet.body.radius + rt._editor_planet_height(landmark.body, dir.x, dir.y, dir.z);
      const anchor = new THREE.Group();
      anchor.position.copy(dir).multiplyScalar(ground);
      anchor.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      const height = Math.min(planet.body.radius * 0.08, 4000);
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(6, 14, height, 16, 1, true),
        new THREE.MeshBasicMaterial({ color: landmark.color, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
      );
      beam.position.y = height / 2;
      const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: landmark.color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      flare.scale.setScalar(160);
      flare.position.y = 20;
      const structure = signalStructure(landmark.color, landmark.kind);
      anchor.add(beam, flare, structure);
      planet.group.add(anchor);
      this.landmarks.push({ ...landmark, anchor, beam, flare, rings: (structure.userData.rings as THREE.Mesh[]) ?? [] });
    }
    this.path = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x6fd8ff, transparent: true, opacity: 0.85, fog: false }));
    this.path.frustumCulled = false;
    this.path.visible = false;
    this.flight = readFlight(rt);
  }

  // Once per fixed tick: the ship's pose for interpolation.
  sampleTick() {
    this.previous.position.copy(this.current.position);
    this.previous.quaternion.copy(this.current.quaternion);
    const v = (f: number) => this.rt._editor_space_value(f);
    this.current.position.set(v(1), v(2), v(3));
    this.current.quaternion.set(v(4), v(5), v(6), v(7));
    if (!this.sampled) {
      this.previous.position.copy(this.current.position);
      this.previous.quaternion.copy(this.current.quaternion);
      this.sampled = true;
    }
  }

  // The ship's interpolated pose onto its object, plus its effects.
  placeShip(ship: THREE.Object3D, alpha: number, dt: number, audio?: { context: BaseAudioContext; output: AudioNode }) {
    if (!this.sampled) this.sampleTick();
    ship.position.lerpVectors(this.previous.position, this.current.position, alpha);
    ship.quaternion.slerpQuaternions(this.previous.quaternion, this.current.quaternion, alpha);
    ship.visible = !this.flight.destroyed;
    this.updateDecor(ship, dt);
    if (audio && !this.voice) this.voice = new ThrusterVoice(audio.context, audio.output);
    if (this.voice) {
      const f = this.flight;
      if (f.destroyed) this.voice.silence();
      else this.voice.update(Math.max(f.engineOn ? f.throttle : 0, Math.abs(f.vertical) * 0.6, f.engineOn && !f.landed ? 0.25 : 0), Math.min(1, f.density / 0.6), f.speed);
    }
  }

  // The ship's site-frame position (latest tick).
  shipPosition() {
    return this.current.position.clone();
  }

  stopAudio() {
    this.voice?.silence();
  }

  private updateDecor(ship: THREE.Object3D, dt: number) {
    if (!this.decor) {
      const box = new THREE.Box3().setFromObject(ship);
      const size = box.getSize(new THREE.Vector3());
      const scale = ship.scale;
      const holder = new THREE.Group();
      holder.scale.set(1 / (scale.x || 1), 1 / (scale.y || 1), 1 / (scale.z || 1));
      ship.add(holder);
      const length = Math.max(size.z, 2);
      // The built-in Kestrel replaces the authored mesh; its flames sit on
      // its two nacelles.
      let exhausts = [new THREE.Vector3(0, 0, -length * 0.5)];
      let radius = Math.max(size.x, 1) * 0.16;
      if (this.shipModel === "Kestrel") {
        // Hide the authored look (its mesh may be nested), keep its children's
        // transforms; then add the model.
        ship.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh && o !== holder) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => (m.visible = false));
        });
        const kestrel = buildKestrel();
        holder.add(kestrel.group);
        exhausts = kestrel.exhausts;
        radius = 0.5;
      }
      const flames = exhausts.map((at) => {
        const flame = new THREE.Mesh(
          new THREE.ConeGeometry(radius, length * 0.5, 16, 1, true),
          new THREE.MeshBasicMaterial({ color: 0x7fc8ff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }),
        );
        flame.rotation.x = -Math.PI / 2;
        flame.position.set(at.x, at.y, at.z - length * 0.25);
        const core = new THREE.Mesh(
          new THREE.ConeGeometry(radius * 0.5, length * 0.3, 12, 1, true),
          new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
        );
        core.rotation.x = -Math.PI / 2;
        core.position.set(at.x, at.y, at.z - length * 0.15);
        holder.add(flame, core);
        return { flame, core };
      });
      const glow = glowTexture();
      const lift = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0x9fd4ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      lift.position.y = -size.y * 0.5;
      lift.scale.setScalar(size.x * 1.2);
      const plasma = new THREE.Mesh(
        new THREE.SphereGeometry(1, 24, 16),
        new THREE.MeshBasicMaterial({ color: 0xff7a3a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide }),
      );
      plasma.scale.set(size.x * 0.75, size.y * 0.9, size.z * 0.75);
      const dust = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xb8a888, transparent: true, depthWrite: false, opacity: 0 }));
      holder.add(lift, plasma, dust);
      this.decor = { holder, flames, lift, plasma, dust, size };
    }
    const d = this.decor;
    const f = this.flight;
    const t = performance.now() / 1000;
    const flicker = 0.94 + Math.sin(t * 43) * 0.04 + Math.sin(t * 71) * 0.02;
    const thrust = f.engineOn && !f.destroyed ? f.throttle : 0;
    const air = Math.min(1, f.density / 0.8);
    for (const { flame, core } of d.flames) {
      flame.visible = core.visible = thrust > 0.02;
      flame.scale.set((0.7 + air * 0.5) * flicker, 0.4 + thrust * (1 + air * 0.6), (0.7 + air * 0.5) * flicker);
      flame.material.opacity = 0.35 + thrust * 0.45;
      core.scale.set(flicker, 0.5 + thrust, flicker);
    }
    const lift = Math.abs(f.vertical) > 0.02 || (f.engineOn && !f.landed && f.assist === 1) ? Math.max(Math.abs(f.vertical), 0.35) : 0;
    d.lift.visible = lift > 0 && !f.destroyed;
    d.lift.material.opacity = lift * 0.75 * flicker;
    const plasma = THREE.MathUtils.clamp((f.heat - 18) / 62, 0, 1) * THREE.MathUtils.clamp(f.density * 8, 0, 1);
    d.plasma.visible = plasma > 0.015;
    d.plasma.material.opacity = plasma * (0.22 + 0.1 * Math.sin(t * 31));
    // Dust kicked up under the ship near the ground.
    const near = f.altitude < 25 && f.density > 0.02 && !f.landed ? (1 - f.altitude / 25) * Math.max(lift, thrust) : 0;
    const settle = f.landed ? Math.max(0, d.dust.material.opacity - dt * 0.6) : near * 0.45;
    d.dust.material.opacity = settle;
    d.dust.visible = settle > 0.01;
    d.dust.position.y = -d.size.y * 0.5 - Math.min(f.altitude, 25);
    d.dust.scale.setScalar(d.size.x * (2 + near * 4));
  }

  // The player looking around the ship (mouse drag); recentres when idle.
  look(dx: number, dy: number) {
    this.lookYaw -= dx * 0.005;
    this.lookPitch = THREE.MathUtils.clamp(this.lookPitch - dy * 0.005, -1.2, 1.2);
    this.lookIdle = 0;
  }

  // The chase camera behind the ship, following its attitude with a lag so
  // turns and rolls read, plus the look offset. Never feeds back into the
  // ship's controls.
  placeShipCamera(view: THREE.PerspectiveCamera, ship: THREE.Object3D, dt: number) {
    if (!this.decor) return;
    const size = this.decor.size;
    const span = Math.max(size.x, size.z, 4);
    if (!this.chasePlaced) {
      this.chase.copy(ship.quaternion);
      this.chasePlaced = true;
    }
    this.chase.slerp(ship.quaternion, 1 - Math.exp(-dt * (this.flight.landed ? 2 : 4.5)));
    this.lookIdle += dt;
    if (this.lookIdle > 1.6) {
      const k = 1 - Math.exp(-dt * 2.5);
      this.lookYaw += (0 - this.lookYaw) * k;
      this.lookPitch += (0 - this.lookPitch) * k;
    }
    // Out of the air, the camera rises and looks down past the ship so the
    // world below stays in frame.
    const spaceView = this.flight.landed ? 0 : (1 - this.air) * THREE.MathUtils.clamp(this.flight.altitude / 3000, 0, 1);
    const orbit = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.lookPitch + spaceView * 0.5, this.lookYaw, 0, "YXZ"));
    const q = this.chase.clone().multiply(orbit);
    const distance = span * 1.25 + 4 + Math.min(this.flight.speed / 60, 6);
    const offset = new THREE.Vector3(0, span * 0.32 + 1.5, -distance).applyQuaternion(q);
    view.position.copy(ship.position).add(offset);
    view.up.set(0, 1, 0).applyQuaternion(this.chase);
    view.lookAt(ship.position.clone().addScaledVector(view.up, span * 0.18));
    view.near = 0.3;
    view.far = Math.max(view.far, 40000);
    view.updateProjectionMatrix();
  }

  // Per frame, before rendering: bodies placed around the site, chunks
  // refined toward the camera, sky and sun for where the camera is.
  update(view: THREE.Camera, dt: number) {
    this.flight = readFlight(this.rt);
    const f = (i: number) => this.rt._editor_space_frame(i);
    this.frame.set(f(0), f(1), f(2), f(3));
    view.updateMatrixWorld();
    const cameraPosition = view.getWorldPosition(new THREE.Vector3());
    // Star direction, and the sun.
    const star = new THREE.Vector3(this.rt._editor_space_body_value(-1, 0), this.rt._editor_space_body_value(-1, 1), this.rt._editor_space_body_value(-1, 2));
    const toStar = star.clone().sub(cameraPosition);
    const starDistance = toStar.length();
    this.sunDirection.copy(toStar).normalize();
    this.sunSprite.position.copy(cameraPosition).addScaledVector(this.sunDirection, Math.min(starDistance, 5e7));
    // A small disc with a modest halo; thinner in air, where the sky glows instead.
    this.sunSprite.scale.setScalar(Math.min(starDistance, 5e7) * 0.025);
    this.sunSprite.material.opacity = 1 - this.air * 0.6;
    this.sunLight.position.copy(this.sunDirection);
    this.sunLight.color.copy(this.starColor);
    // Bodies.
    // More chunks per frame until the first surface is complete.
    const budget: ChunkBudget = { left: this.warm < 30 ? 24 : 8, built: 0, until: performance.now() + (this.warm < 30 ? 14 : this.chunkMs) };
    this.warm++;
    let nearest: { planet: Planet; altitude: number; up: THREE.Vector3 } | undefined;
    const spin = new THREE.Quaternion();
    this.planets.forEach((planet, i) => {
      const centre = new THREE.Vector3(this.rt._editor_space_body_value(i, 0), this.rt._editor_space_body_value(i, 1), this.rt._editor_space_body_value(i, 2));
      planet.group.position.copy(centre);
      // Turning bodies (0.74.0): the frame times the body's own turn.
      const sp = (f: number) => this.rt._editor_space_body_spin(i, f);
      spin.set(sp(0), sp(1), sp(2), sp(3));
      planet.group.quaternion.copy(this.frame).multiply(spin);
      const inverse = planet.group.quaternion.clone().invert();
      // Hidden bodies (0.73.0) aren't there until a script reveals them.
      planet.group.visible = this.rt._editor_space_body_value(i, 10) !== 1;
      if (!planet.group.visible) return;
      const relative = cameraPosition.clone().sub(centre);
      const altitude = relative.length() - planet.body.radius;
      if (!nearest || altitude < nearest.altitude) nearest = { planet, altitude, up: relative.clone().normalize() };
      const cameraBody = relative.applyQuaternion(inverse);
      planet.update(cameraBody, budget);
      if (planet.atmosphere) {
        const outside = altitude > planet.body.atmosphereHeight * 2.4;
        planet.atmosphere.visible = outside;
        planet.atmosphere.material.uniforms.sun!.value.copy(this.sunDirection);
        planet.atmosphere.material.uniforms.strength!.value = THREE.MathUtils.clamp(altitude / (planet.body.atmosphereHeight * 6), 0.35, 1);
      }
    });
    // Sky: the nearest body's air around the camera.
    this.air = 0;
    this.daylight = 1;
    let near = 1;
    let far = 1e8;
    if (nearest) {
      const body = nearest.planet.body;
      const ground = Math.max(nearest.altitude - body.terrainAmplitude, 0);
      near = THREE.MathUtils.clamp(ground * 0.35, 0.5, 2e4);
      if (body.atmosphereHeight > 0 && body.atmosphereDensity > 0) {
        const density = nearest.altitude > body.atmosphereHeight * 2.4 ? 0 : Math.exp(-Math.max(nearest.altitude, 0) / (body.atmosphereHeight * 0.42));
        this.air = THREE.MathUtils.clamp(Math.pow(density, 0.6) * 1.15, 0, 1);
      }
      const elevation = nearest.up.dot(this.sunDirection);
      this.daylight = THREE.MathUtils.clamp(elevation * 3 + 0.35, 0.04, 1);
      this.skyColor.set(body.haze);
      const sky = this.sky.material.uniforms;
      sky.up!.value.copy(nearest.up);
      sky.sun!.value.copy(this.sunDirection);
      sky.haze!.value.copy(this.skyColor);
      sky.air!.value = this.air;
      sky.day!.value = this.daylight;
      this.sunset = THREE.MathUtils.clamp(1 - elevation / 0.3, 0, 1) * (elevation > -0.12 ? 1 : 0);
      sky.sunset!.value = this.sunset;
      // Haze swallows distant terrain in thick air.
      this.scene.fog = this.air > 0.02 ? new THREE.FogExp2(this.skyColor.clone().multiplyScalar(this.daylight * 0.9), 2.2e-5 * this.air) : null;
    }
    this.sky.visible = this.air > 0.01;
    this.sky.position.copy(cameraPosition);
    this.sky.scale.setScalar(Math.max(near * 4, 10));
    this.stars.position.copy(cameraPosition);
    this.stars.scale.setScalar(far * 0.5);
    const night = 1 - this.air * this.daylight;
    (this.stars.material as THREE.PointsMaterial).opacity = night;
    this.galaxy.position.copy(cameraPosition);
    this.galaxy.scale.setScalar(far * 0.48);
    this.galaxy.traverse((o) => {
      const m = (o as THREE.Points).material as THREE.Material | undefined;
      if (m) m.opacity = night * (o instanceof THREE.Sprite ? 0.5 : 1);
    });
    for (const planet of this.planets) if (planet.clouds) planet.clouds.rotation.y += dt * 0.0006;
    this.ambient.intensity = 0.03 + this.air * 0.5 * this.daylight;
    this.sunLight.intensity = 2.6 + (1 - this.air) * 0.8;
    // The space camera: the view's pose and lens, with its own depth range.
    if (view instanceof THREE.PerspectiveCamera) {
      this.camera.fov = view.fov;
      this.camera.aspect = view.aspect;
    }
    this.camera.position.copy(cameraPosition);
    this.camera.quaternion.copy(view.getWorldQuaternion(new THREE.Quaternion()));
    this.camera.near = near;
    this.camera.far = far;
    this.camera.updateProjectionMatrix();
    // Landmark beams are for finding a place from afar: they fade out as
    // you arrive (from inside, one would tint the whole view).
    this.grammarTime += dt;
    for (const landmark of this.landmarks) {
      const distance = landmark.anchor.getWorldPosition(new THREE.Vector3()).distanceTo(cameraPosition);
      const k = THREE.MathUtils.smoothstep(distance, 400, 2500);
      landmark.beam.material.opacity = 0.32 * k;
      landmark.flare.material.opacity = k;
      landmark.beam.visible = landmark.flare.visible = k > 0.01;
      // The Pale Signal's grammar: concentric rings breathing in step,
      // every structure on the same narrow-band clock.
      landmark.rings.forEach((ring, i) => {
        const phase = this.grammarTime * 1.4 - i * 0.55;
        ring.scale.setScalar(1 + 0.06 * Math.sin(phase));
        ring.rotation.z = this.grammarTime * 0.05 * (i % 2 ? 1 : -1);
        (ring.material as THREE.MeshBasicMaterial).opacity = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(phase));
      });
    }
    this.updatePath(dt);
  }

  private updatePath(dt: number) {
    const fl = this.flight;
    const show = fl.piloting && !fl.landed && fl.ref >= 0 && fl.altitude > 1500;
    this.path.visible = show;
    if (!show) return;
    this.pathTimer -= dt;
    if (this.pathTimer > 0) return;
    this.pathTimer = 0.25;
    const count = this.rt._editor_space_path(256, 0);
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++)
      positions.set([this.rt._editor_space_path_value(i, 0), this.rt._editor_space_path_value(i, 1), this.rt._editor_space_path_value(i, 2)], i * 3);
    this.path.geometry.dispose();
    this.path.geometry = new THREE.BufferGeometry();
    this.path.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const group = this.planets[fl.ref]?.group;
    if (group && this.path.parent !== group) group.add(this.path);
  }

  // Projected screen positions for HUD markers (bodies, target).
  bodyScreen(index: number, view: THREE.Camera, width: number, height: number) {
    const planet = this.planets[index];
    if (!planet) return undefined;
    const p = planet.group.position.clone().project(view);
    if (p.z > 1) return undefined;
    return { x: (p.x * 0.5 + 0.5) * width, y: (-p.y * 0.5 + 0.5) * height };
  }

  // Plants and rocks around the walk frame (0.72.0): deterministic in the
  // frame's position, weighted by the frame body's flora and mineral
  // species, standing on the ground, clear of the origin (the ship or the
  // site's buildings) and of the sea.
  // `keep`: circles kept clear (around buildings); `density` scales the count.
  scatter(species: Species[], range: number, keepClear: number, keep: Array<{ x: number; z: number; r: number }> = [], density = 1) {
    const body = this.rt._editor_space_value(39);
    const pool = species.filter((s) => s.body === body && s.kind !== "fauna" && s.weight > 0);
    const out: Array<{ species: Species; x: number; y: number; z: number; yaw: number; scale: number }> = [];
    if (!pool.length) return out;
    const total = pool.reduce((sum, s) => sum + s.weight, 0);
    let seed = (Math.floor(this.rt._editor_space_body_value(body, 0) * 7 + this.rt._editor_space_body_value(body, 2) * 13) >>> 0) || 7;
    const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 900 && out.length < 650 * density; i++) {
      // Denser near the middle, where you walk.
      const r = keepClear + Math.pow(random(), 1.6) * (range - keepClear);
      const a = random() * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      let pick = random() * total;
      const chosen = pool.find((s) => (pick -= s.weight) <= 0) ?? pool[0]!;
      if (this.rt._editor_space_wet(x, z) || keep.some((k) => Math.hypot(x - k.x, z - k.z) < k.r)) continue;
      const y = this.rt._editor_space_ground(x, z);
      out.push({ species: chosen, x, y, z, yaw: random() * Math.PI * 2, scale: chosen.scale * (0.75 + random() * 0.5) });
    }
    return out;
  }

  dispose() {
    this.planets.forEach((p) => p.disposeAll());
    this.voice?.silence();
    this.path.geometry.dispose();
  }
}

// ---- HUD ---------------------------------------------------------------

function distanceText(m: number) {
  if (!Number.isFinite(m) || m > 1e11) return "--";
  const a = Math.abs(m);
  if (a >= 1e6) return `${(m / 1000).toFixed(0)} km`;
  if (a >= 1e4) return `${(m / 1000).toFixed(1)} km`;
  return `${m.toFixed(0)} m`;
}

function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, value: number, color: string, label: string) {
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(x, y, w, 6);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * THREE.MathUtils.clamp(value, 0, 1), 6);
  ctx.fillStyle = "rgba(220,235,245,0.8)";
  ctx.fillText(label, x, y - 3);
}

// The flight instruments, bottom left; landing guidance near the ground;
// markers for the bodies; contextual prompts.
// The landing radar: a tape from 0 to 400 m of radar altitude with the
// ship's marker, a sink-rate bar, and SLOPE / SINK / DRIFT / WATER calls
// that turn red past the gear's limits; SAFE when all are inside.
function drawLandingRadar(ctx: CanvasRenderingContext2D, width: number, height: number, f: FlightState) {
  // Right of centre, clear of the ship and of HUD columns.
  const x = width / 2 + Math.min(220, width * 0.2), top = height * 0.4, h = height * 0.3, scale = 400;
  ctx.save();
  ctx.fillStyle = "rgba(6,12,18,0.55)";
  ctx.fillRect(x - 14, top - 26, 140, h + 40);
  ctx.strokeStyle = "rgba(143,247,255,0.6)";
  ctx.beginPath();
  ctx.moveTo(x, top);
  ctx.lineTo(x, top + h);
  ctx.stroke();
  ctx.font = "10px ui-monospace, Menlo, Consolas, monospace";
  ctx.fillStyle = "rgba(207,231,245,0.7)";
  for (const mark of [0, 50, 100, 200, 300, 400]) {
    const y = top + h - (mark / scale) * h;
    ctx.fillRect(x, y, 6, 1);
    ctx.fillText(String(mark), x + 9, y + 3);
  }
  const y = top + h - (Math.min(Math.max(f.altitude, 0), scale) / scale) * h;
  const sink = -f.verticalSpeed;
  const limit = f.sinkLimit || 7;
  const bad = sink > limit || f.slope > (f.slopeLimit || 28) || f.groundSpeed > (f.driftLimit || 5);
  ctx.fillStyle = bad ? "#ff5d5d" : "#9be37a";
  ctx.beginPath();
  ctx.moveTo(x - 2, y);
  ctx.lineTo(x - 10, y - 5);
  ctx.lineTo(x - 10, y + 5);
  ctx.closePath();
  ctx.fill();
  // Sink-rate bar beside the tape, scaled to twice the limit.
  const bar = Math.min(Math.max(sink, 0) / (limit * 2), 1) * h * 0.5;
  ctx.fillStyle = sink > limit ? "#ff5d5d" : sink > limit * 0.6 ? "#ffb347" : "#7fc8ff";
  ctx.fillRect(x + 36, y, 5, Math.min(bar, top + h - y));
  ctx.font = "bold 11px ui-monospace, Menlo, Consolas, monospace";
  ctx.fillStyle = "#cfe7f5";
  ctx.fillText("RADAR", x - 8, top - 12);
  const calls: Array<[string, boolean]> = [
    [`SLOPE ${f.slope.toFixed(0)}°`, f.slope > (f.slopeLimit || 28)],
    [`SINK ${Math.max(sink, 0).toFixed(1)}`, sink > limit],
    [`DRIFT ${f.groundSpeed.toFixed(1)}`, f.groundSpeed > (f.driftLimit || 5)],
  ];
  if (f.overWater) calls.push(["WATER", false]);
  calls.push([bad ? "UNSAFE" : "SAFE", bad]);
  calls.forEach(([text, warn], i) => {
    ctx.fillStyle = warn ? "#ff5d5d" : text === "SAFE" ? "#9be37a" : text === "WATER" ? "#7fc8ff" : "#cfe7f5";
    ctx.fillText(text, x + 50, top + 12 + i * 16);
  });
  ctx.restore();
}

export function drawFlightHud(ctx: CanvasRenderingContext2D, width: number, height: number, view: SpaceView, camera: THREE.Camera, nearShip: boolean) {
  const f = view.flight;
  ctx.save();
  ctx.font = "12px ui-monospace, Menlo, Consolas, monospace";
  ctx.textBaseline = "alphabetic";
  if (f.piloting) {
    const x = 18, y = height - 168, w = 230;
    ctx.fillStyle = "rgba(6,12,18,0.55)";
    ctx.fillRect(x - 10, y - 22, w + 20, 176);
    ctx.fillStyle = "#cfe7f5";
    const ref = f.ref >= 0 ? view.bodies[f.ref]?.name ?? "" : "STAR";
    ctx.fillText(`${assistNames[f.assist] ?? ""}${f.warp > 1 ? `   WARP x${f.warp}` : ""}`, x, y - 6);
    ctx.fillStyle = "rgba(207,231,245,0.7)";
    ctx.fillText(ref.toUpperCase(), x + w - ctx.measureText(ref.toUpperCase()).width, y - 6);
    ctx.fillStyle = "#eaf6ff";
    ctx.font = "bold 20px ui-monospace, Menlo, Consolas, monospace";
    ctx.fillText(distanceText(Math.max(f.altitude, 0)), x, y + 20);
    ctx.font = "12px ui-monospace, Menlo, Consolas, monospace";
    ctx.fillStyle = "rgba(207,231,245,0.7)";
    ctx.fillText("ALT", x + 150, y + 20);
    const vs = f.verticalSpeed;
    ctx.fillStyle = "#eaf6ff";
    ctx.fillText(`${vs >= 0 ? "▲" : "▼"} ${Math.abs(vs).toFixed(1)} m/s`, x, y + 40);
    ctx.fillText(`${f.groundSpeed.toFixed(0)} m/s GND   ${f.speed.toFixed(0)} m/s ORB`, x, y + 58);
    if (!f.landed && f.altitude > 1000 && f.ref >= 0)
      ctx.fillText(`PE ${f.orbitClosed || f.periapsis > -1e6 ? distanceText(f.periapsis) : "--"}  AP ${f.orbitClosed ? distanceText(f.apoapsis) : "ESCAPE"}`, x, y + 76);
    bar(ctx, x, y + 96, w, f.throttle, "#7fc8ff", `THROTTLE ${(f.throttle * 100).toFixed(0)}%`);
    bar(ctx, x, y + 120, w, f.fuel, f.fuel < 0.2 ? "#ff9f43" : "#9be37a", `FUEL ${(f.fuel * 100).toFixed(0)}%`);
    bar(ctx, x, y + 144, w * 0.48, f.hull, f.hull < 0.35 ? "#ff5d5d" : "#d8e2ea", `HULL ${(f.hull * 100).toFixed(0)}%`);
    if (f.heat > 5) bar(ctx, x + w * 0.52, y + 144, w * 0.48, f.heat / 100, f.heat > 78 ? "#ff5d5d" : "#ffb347", "HEAT");
    // Mouse steering (0.75.0): the virtual stick's ring and where it sits.
    if (view.stick.active && !f.landed) {
      const cx = width / 2, cy = height / 2, r = Math.min(width, height) * 0.09;
      ctx.strokeStyle = "rgba(143,247,255,0.35)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, r * view.stick.deadzone, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(143,247,255,0.85)";
      ctx.beginPath();
      ctx.arc(cx + view.stick.x * r, cy + view.stick.y * r, 3.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (view.stick.available && !f.landed) {
      ctx.fillStyle = "rgba(207,231,245,0.55)";
      ctx.fillText("CLICK TO STEER WITH THE MOUSE", width / 2 - ctx.measureText("CLICK TO STEER WITH THE MOUSE").width / 2, height - 24);
    }
    // Landing radar below 400 m (0.74.0): a radar-altitude tape with the
    // sink rate, and the ground under the ship against the gear's limits.
    if (!f.landed && f.altitude < 400 && f.ref >= 0) drawLandingRadar(ctx, width, height, f);
    // Landing guidance below 150 m: descent rate against the gear's limit.
    if (!f.landed && f.altitude < 150 && f.ref >= 0) {
      const sink = -vs;
      const limit = f.sinkLimit || 7;
      const color = sink > limit ? "#ff5d5d" : sink > limit * 0.6 ? "#ffb347" : "#9be37a";
      ctx.textAlign = "center";
      ctx.font = "bold 14px ui-monospace, Menlo, Consolas, monospace";
      ctx.fillStyle = color;
      ctx.fillText(`${f.altitude.toFixed(1)} m   ${sink > 0 ? "SINK" : "CLIMB"} ${Math.abs(sink).toFixed(1)} m/s   DRIFT ${f.groundSpeed.toFixed(1)} m/s`, width / 2, height * 0.72);
      ctx.textAlign = "left";
    }
    // Target.
    if (f.target >= 0) {
      const p = view.bodyScreen(f.target, camera, width, height);
      const name = view.bodies[f.target]?.name ?? "";
      if (p) {
        ctx.strokeStyle = "#ffd36e";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - 9);
        ctx.lineTo(p.x + 9, p.y);
        ctx.lineTo(p.x, p.y + 9);
        ctx.lineTo(p.x - 9, p.y);
        ctx.closePath();
        ctx.stroke();
        ctx.fillStyle = "#ffd36e";
        ctx.fillText(`${name.toUpperCase()}  ${distanceText(f.targetDistance)}`, p.x + 14, p.y + 4);
      }
    }
    // Landmarks on the body below (or any, from space), with distance.
    const shipWorld = view.shipPosition();
    for (const landmark of view.landmarks) {
      const world = landmark.anchor.getWorldPosition(new THREE.Vector3());
      const distance = world.distanceTo(shipWorld);
      if (distance < 400) continue; // standing at it
      const p = world.clone().project(camera);
      if (p.z > 1) continue;
      const sx = (p.x * 0.5 + 0.5) * width, sy = (-p.y * 0.5 + 0.5) * height;
      if (sx < 0 || sy < 0 || sx > width || sy > height) continue;
      ctx.strokeStyle = landmark.color;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(sx - 6, sy - 6, 12, 12);
      ctx.fillStyle = landmark.color;
      ctx.fillText(`${landmark.label.toUpperCase()}  ${distanceText(distance)}`, sx + 12, sy + 4);
    }
    // Other bodies, once out of the air.
    if (view.air < 0.2)
      view.bodies.forEach((body, i) => {
        if (i === f.target || i === f.ref) return;
        const p = view.bodyScreen(i, camera, width, height);
        if (!p || p.x < 0 || p.y < 0 || p.x > width || p.y > height) return;
        ctx.fillStyle = "rgba(207,231,245,0.65)";
        ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
        ctx.fillText(body.name, p.x + 7, p.y + 4);
      });
    // Prompts.
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(234,246,255,0.9)";
    ctx.font = "13px ui-monospace, Menlo, Consolas, monospace";
    if (f.destroyed) ctx.fillText("SHIP LOST", width / 2, height * 0.45);
    else if (f.landed) ctx.fillText("E  exit ship    SPACE  lift off", width / 2, height - 26);
    else if (f.warp > 1) ctx.fillText("time warp: 9 / 0", width / 2, height - 26);
    ctx.textAlign = "left";
  } else if (nearShip) {
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(234,246,255,0.9)";
    ctx.font = "13px ui-monospace, Menlo, Consolas, monospace";
    ctx.fillText("E  board ship", width / 2, height - 26);
    ctx.textAlign = "left";
  }
  ctx.restore();
}
