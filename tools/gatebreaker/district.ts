// GATEBREAKER M4: the district around the Hunter Association (GAME_DESIGN.md
// section 13, "The world"). A compact night block of Seoul, about 208 m x
// 200 m (x -104..104, z 14..214), that the hub opens onto:
//
//                     the Han river (beyond the guardrail)
//   z 214  ---------------- riverside promenade ----------------
//   z 200  ========= Gangbyeon street (road) ====================
//          apartments | Park (Gate site 1) | Hangang plaza      | offices
//                     |                    | (Gate site 2,      |
//                     |                    |  Station B)        |
//   z 120  ========= Midtown street =============================
//          apartments | shops, Station A | HUB | shops | lot (Gate site 3)
//   z  24  ========= Association street ==========================
//   z  14  -- construction hoarding (the south edge) --
//          x -64 and x 64: the two avenues; x 0: a street north of z 120.
//
// Everything static is instanced (ModelInstances: one entity per set), so
// the whole district is a few dozen entities. lua/world.lua runs it: the
// Gate sites (a rift in each open one, walked into to enter its Gate), the
// field zones with their packs and the field boss, and the subway between
// Station A and B.
//
// Layout rules from research (see the M4 report): roads on a 16 m tile grid
// with 3 m+ sidewalks; something to look at every 40-60 m of a route (under
// 15 s at the hunter's 5.2 m/s); the hub's 85 m towers visible from
// everywhere as the way home; Gate sites are open, cordoned squares.
import { type SceneBuilder, type V3, rgb, vec } from "./kit";

// Catalog ids (apps/editor/src/scene/modelCatalog.ts).
const M = {
  bench: 1,
  apt1: 2,
  apt2: 3,
  apt3: 4,
  office1: 8,
  office2: 9,
  office3: 10,
  retail1: 14,
  retail2: 15,
  retail3: 16,
  shop1: 17,
  shop2: 18,
  shop3: 19,
  tower1: 20,
  tower2: 21,
  tower3: 22,
  barrier: 26,
  bin: 27,
  busstop: 29,
  cone: 30,
  guardrail: 31,
  hydrant: 32,
  lampDouble: 34,
  lamp: 35,
  pole: 36,
  bush1: 37,
  bush2: 38,
  chainlink: 39,
  planter: 41,
  broadleaf1: 46,
  broadleaf2: 47,
  broadleaf3: 48,
  conifer1: 49,
  conifer2: 50,
  roadCross: 56,
  roadCrossing: 62,
  road: 64,
  roadT: 66,
  signWarning: 86,
  signalPost: 90,
  bus: 93,
  hatchback: 94,
  sedan: 98,
  suv: 102,
  taxi: 103,
  van: 104,
  boxtruck: 92,
} as const;

// Where world.lua finds things (keep in step with lua/world.lua).
export const DISTRICT = {
  west: -104,
  east: 104,
  south: 14,
  north: 214,
  sites: [
    { name: "Gate site 1", x: -32, z: 160 }, // the park clearing
    { name: "Gate site 2", x: 28, z: 156 }, // Hangang plaza
    { name: "Gate site 3", x: 88, z: 72 }, // the east lot
  ],
  // A subway entrance faces south (-z): its canopy at (x, z), the spot to
  // stand on 4.5 m in front of it.
  stations: [
    { name: "Station A", x: -46, z: 46 },
    { name: "Station B", x: 48, z: 182 },
  ],
  // "Dungeon breaks": the field zones, on open street well away from the
  // hub, the stations and the Gate sites (40 m+). Each pack follows its
  // zone's anchor up and down the street (lua/world.lua's ZONES).
  zones: [
    { name: "Field zone 1", x: -64, z: 90 }, // the west avenue
    { name: "Field zone 2", x: -56, z: 201 }, // the riverside
    { name: "Field zone 3", x: 86, z: 120 }, // Midtown east
  ],
} as const;

// A Gate's colour by its rank, E to S: the rift at a Gate site glows in it
// (lua/world.lua keeps the same table for its prompt).
export const GATE_RANK_COLOURS = { E: "#3fb8ff", D: "#3de07a", C: "#ffd23d", B: "#ff8a2b", A: "#ff3d5a", S: "#c04dff" } as const;

const TOP = 0.01; // pads' tops: just above the editor's shadow plane at y = 0

export function buildDistrict(scene: SceneBuilder) {
  // One instanced set: "id x z yaw [scale] [solid]" per line.
  const set = () => {
    const lines: string[] = [];
    const put = (id: number, x: number, z: number, yawDeg = 0, solid = true, scale = 1) =>
      lines.push(`${id} ${x.toFixed(2)} ${z.toFixed(2)} ${yawDeg}${scale !== 1 ? ` ${scale}` : ""}${solid ? " solid" : ""}`);
    return { lines, put };
  };
  const flush = (name: string, y: number, s: { lines: string[] }) => scene.add(name, [0, y, 0], { ModelInstances: { instances: s.lines.join("\n") } });
  const hidden = { Renderable: { mesh: 0, material: 0, visible: false } };
  const trigger = { Collider: { type: "AABB", isTrigger: true } };

  // -- The hub opens south onto the district ---------------------------------
  // The hub's south fence goes: the district's own edges (below) keep the
  // hunter in. Its west, east and north fences stay.
  const fence = scene.entities.findIndex((e) => e.name === "Hub fence S");
  if (fence >= 0) scene.entities.splice(fence, 1);

  // -- Ground -------------------------------------------------------------------
  // What the hunter stands on north of the game's Ground slab (z > 90), and
  // a dark base under the whole district whose north face is the river wall.
  scene.add("District ground", [0, -0.5, 150], { Scale: { value: vec(220, 1, 132) }, ...hidden, RigidBody: { dynamic: false }, Collider: { type: "AABB" } });
  scene.box("District base", [0, -1.05, 113.5], [400, 2, 201], "#4a4a56", trigger, { roughness: 0.95 });
  // Concrete pads for sidewalks and blocks (roads lie between them); the
  // park is grass. None covers the hub's paving (x -16..16, z 40..64).
  const pads: [string, number, number, number, number, string][] = [
    ["South sidewalk", -104, 104, 14.5, 16, "#64646f"],
    ["Block west 1", -104, -72, 32, 112, "#64646f"],
    ["Block shops west", -56, -16, 32, 112, "#403f47"],
    ["Block Association north", -16, 16, 64, 112, "#403f47"],
    ["Block Association steps", -16, 16, 32, 40, "#403f47"],
    ["Block shops east", 16, 56, 32, 112, "#403f47"],
    ["Block east 1", 72, 104, 32, 112, "#64646f"],
    ["Block west 2", -104, -72, 128, 192, "#64646f"],
    ["Park lawn", -56, -8, 128, 192, "#1f3524"],
    ["Hangang plaza paving", 8, 56, 128, 192, "#47454f"],
    ["Block east 2", 72, 104, 128, 192, "#64646f"],
    ["Promenade", -104, 104, 208, 214, "#4a4852"],
  ];
  for (const [name, x0, x1, z0, z1, hex] of pads) scene.box(name, [(x0 + x1) / 2, TOP - 0.02, (z0 + z1) / 2], [x1 - x0, 0.04, z1 - z0], hex, trigger, { roughness: 0.92 });
  // The Han: dark water a metre below the promenade.
  scene.box("Han river", [0, -1.25, 290], [440, 0.1, 152], "#0a1626", trigger, { roughness: 0.12, metalness: 0.4, emissive: rgb("#0b1838"), emissiveIntensity: 0.35 });

  // -- Edges ----------------------------------------------------------------------
  // South: a construction hoarding (tall enough to hide the Gates' sets
  // behind it); west and east: invisible walls behind chain-link fences;
  // north: the river guardrail.
  scene.box("District hoarding", [0, 2.25, 14.25], [210, 4.5, 0.5], "#20242e", {}, { roughness: 0.85 });
  scene.box("District hoarding stripe", [0, 3.9, 14.54], [210, 0.22, 0.08], "#ffb020", {}, { emissive: rgb("#ffb020"), emissiveIntensity: 0.9 });
  for (const [name, at, size] of [
    ["District edge W", [-104.6, 3, 114], [1, 6, 202]],
    ["District edge E", [104.6, 3, 114], [1, 6, 202]],
    ["District edge N", [0, 3, 214.6], [210, 6, 1]],
  ] as const)
    scene.add(name, at as unknown as V3, { Scale: { value: vec(...(size as unknown as V3)) }, ...hidden, RigidBody: { dynamic: false }, Collider: { type: "AABB" } });

  // -- Roads ----------------------------------------------------------------------
  // 16 m tiles. Straight tiles run along z at yaw 0 (90: along x); a T's
  // stem points -z at yaw 0, +z at 180.
  const roads = set();
  const E_W = [24, 120, 200]; // Association, Midtown, Gangbyeon streets
  for (const z of E_W)
    for (let x = -96; x <= 96; x += 16) {
      if (x === -64 || x === 64) roads.put(z === 120 ? M.roadCross : M.roadT, x, z, z === 24 ? 180 : 0, false);
      else if (x === 0 && z !== 24) roads.put(M.roadT, x, z, z === 120 ? 180 : 0, false);
      else if (x === 0) roads.put(M.roadCrossing, x, z, 90, false); // the crossing from the hub
      else roads.put(M.road, x, z, 90, false);
    }
  for (const x of [-64, 64]) for (let z = 40; z <= 184; z += 16) if (z !== 120) roads.put(M.road, x, z, 0, false);
  for (let z = 136; z <= 184; z += 16) roads.put(M.road, 0, z, 0, false);
  flush("District roads", -0.13, roads);

  // -- Buildings --------------------------------------------------------------------
  // Solid inside the district; the skyline beyond its edges is backdrop.
  const b = set();
  // West blocks: apartment slabs facing the avenue.
  b.put(M.apt1, -88, 41, 90);
  b.put(M.apt3, -88, 68, 0);
  b.put(M.apt2, -88, 93, 0);
  b.put(M.apt2, -88, 140, 0);
  b.put(M.apt1, -88, 160, 90);
  b.put(M.apt3, -88, 182, 0);
  // Shop rows either side of the hub, along the avenues.
  for (const [id, z] of [
    [M.shop1, 60],
    [M.shop2, 72],
    [M.shop3, 84],
    [M.shop1, 96],
  ] as const) {
    b.put(id, -46, z, 270);
    b.put(id === M.shop3 ? M.shop2 : id, 47, z, 90);
  }
  b.put(M.retail2, -28, 103, 0, true, 0.8);
  b.put(M.retail3, 28, 103.5, 180, true, 0.75);
  // East: an apartment, the lot (Gate site 3), a store.
  b.put(M.apt1, 88, 41, 90);
  b.put(M.retail1, 88, 102, 180, true, 0.85);
  // North-east: an office, shophouses, a tower.
  b.put(M.office2, 88, 142, 0);
  b.put(M.shop1, 80, 160, 0);
  b.put(M.shop3, 96, 160, 0);
  b.put(M.tower2, 88, 179, 0, true, 0.7);
  // Backdrop: the city going on past the fences, and the far bank.
  const skyline = [M.tower1, M.office1, M.tower3, M.apt1, M.tower2, M.office3];
  for (let i = 0; i < 6; i++) {
    const z = 44 + i * 34;
    b.put(skyline[i % 6]!, -130, z, 90, false);
    b.put(skyline[(i + 3) % 6]!, 130, z, 270, false);
    b.put(skyline[(i + 1) % 6]!, -168, z + 17, 0, false);
    b.put(skyline[(i + 4) % 6]!, 168, z + 17, 0, false);
  }
  for (const x of [-120, -70, -20, 30, 80, 130]) b.put(skyline[(x / 10 + 12) % 6]!, x, 300 + (x % 20 === 0 ? 0 : 16), 180, false);
  flush("District buildings", 0, b);

  // -- Streets: lamps, edges, signs, parked cars, bus stop ----------------------------
  const st = set();
  // Lamps on the kerbs, arms out over the road, clear of crossings,
  // doorways and props: [x, z, yaw] (yaw 90: arm toward -z, 270: +z, 0: +x,
  // 180: -x).
  const lamps: [number, number, number][] = [
    // Association street (z 24), north kerb.
    ...[-88, -44, -16, 16, 50, 88].map((x) => [x, 33.5, 90] as [number, number, number]),
    // Midtown street (z 120), both kerbs.
    ...[-88, -30, 24, 88].map((x) => [x, 129.5, 90] as [number, number, number]),
    ...[-80, -24, 40, 100].map((x) => [x, 110.5, 270] as [number, number, number]),
    // Gangbyeon street (z 200), south kerb.
    ...[-76, -30, 26, 80].map((x) => [x, 190.5, 270] as [number, number, number]),
    // The avenues (x -64 and 64), both kerbs.
    ...[56, 88, 152, 184].map((z) => [-73.5, z, 0] as [number, number, number]),
    ...[40, 72, 104, 156].map((z) => [-54.5, z, 180] as [number, number, number]),
    ...[46, 104, 140, 172].map((z) => [54.5, z, 0] as [number, number, number]),
    ...[52, 94, 136, 168].map((z) => [73.5, z, 180] as [number, number, number]),
  ];
  for (const [x, z, yaw] of lamps) st.put(M.lamp, x, z, yaw, false);
  for (let x = -96; x <= 96; x += 32) st.put(M.lampDouble, x, 211, 0, false);
  // Signals at the main crossings.
  for (const [x, z] of [
    [-73, 15.5],
    [73, 15.5],
    [-73, 111],
    [73, 129],
    [9, 129],
  ] as const)
    st.put(M.signalPost, x, z, 0, false);
  // The fences at the edges, and barriers where the streets leave the map.
  for (let z = 16; z <= 212; z += 4.1) {
    st.put(M.chainlink, -104, z, 90, false);
    st.put(M.chainlink, 104, z, 90, false);
  }
  for (let x = -100; x <= 100; x += 8.1) st.put(M.guardrail, x, 214, 0, false);
  for (const z of E_W)
    for (const side of [-1, 1]) for (const dz of [-6, -2, 2, 6]) st.put(M.barrier, side * 102, z + dz, 90, true);
  // Along the hoarding: cones and warning signs.
  for (let x = -92; x <= 92; x += 23) {
    st.put(M.cone, x, 15.4, 0, false);
    st.put(M.cone, x + 1.2, 15.4, 0, false);
  }
  st.put(M.signWarning, -24, 15.2, 0, false);
  st.put(M.signWarning, 24, 15.2, 0, false);
  // Parked cars along the kerbs, nose along the road.
  for (const [id, x, z, yaw] of [
    [M.sedan, -36, 30, 90],
    [M.taxi, -84, 30, 270],
    [M.hatchback, 80, 30, 90],
    [223, -70, 52, 0], // crossover SUV
    [219, -70, 84, 0], // family sedan
    [M.taxi, 70, 96, 180],
    [227, 58, 108, 0], // panel van
    [M.hatchback, -58, 140, 180],
    [220, -40, 126, 90], // compact wagon
    [M.suv, 30, 114, 270],
    [224, -6, 150, 0], // sedan taxi
    [221, 6, 170, 180], // coupe
    [M.hatchback, 70, 150, 0],
    [222, -80, 194, 90], // GT
    [M.suv, 84, 206, 270],
    [M.boxtruck, -20, 18.5, 90],
  ] as const)
    st.put(id, x, z, yaw);
  // The bus stop on Association street, a bus pulled in.
  st.put(M.busstop, 40, 34, 0);
  st.put(M.bus, 34, 29, 90);
  // The Association keeps an ambulance on standby: hunters come back hurt.
  st.put(229, 20, 31, 90);
  // Bicycles racked by Station B.
  for (const [x, id] of [[52.5, 232], [53.3, 233], [54.1, 232]] as const) st.put(id, x, 181, 0, false);
  // Bins, hydrants and poles on the sidewalks.
  for (const [id, x, z] of [
    [M.bin, -40, 34],
    [M.bin, 52, 110],
    [M.bin, -24, 212.5],
    [M.hydrant, -55, 100],
    [M.hydrant, 55, 36],
    [M.hydrant, 74, 190],
    [M.pole, -74, 72],
    [M.pole, 74, 129.5],
    [M.pole, -74, 168],
  ] as const)
    st.put(id, x, z, 0, id !== M.pole);
  flush("District street", 0, st);

  // -- The park, the plaza, the lot, the promenade -------------------------------
  const pk = set();
  const trees = [M.broadleaf1, M.broadleaf3, M.broadleaf2, M.conifer1];
  let t = 0;
  // Park (x -56..-8, z 128..192): trees round the edge, paths in from each
  // side, a clearing in the middle (Gate site 1) with benches facing it.
  for (const x of [-50, -41, -23, -14]) {
    pk.put(trees[t++ % 4]!, x, 133, (t * 47) % 360, true, 0.8);
    pk.put(trees[t++ % 4]!, x, 187, (t * 47) % 360, true, 0.8);
  }
  for (const z of [141, 150, 170, 179]) {
    pk.put(trees[t++ % 4]!, -51, z, (t * 47) % 360, true, 0.8);
    pk.put(trees[t++ % 4]!, -13, z, (t * 47) % 360, true, 0.8);
  }
  for (const [x, z, yaw] of [
    [-32, 145.5, 0],
    [-32, 174.5, 180],
    [-46.5, 160, 90],
  ] as const)
    pk.put(M.bench, x, z, yaw);
  for (const [x, z] of [
    [-44, 146],
    [-20, 146],
    [-44, 174],
    [-20, 174],
  ] as const) {
    // Planters, not the kit's bushes: those render as white glare under the
    // Manhwa shading at night (to fix in the shader; tracked on the board).
    pk.put(41, x, z, (x * 13) % 360, false);
    pk.put(41, x + 2.4, z + 1.2, (z * 7) % 360, false);
  }
  // Hangang plaza (x 8..56, z 128..192): planters, benches looking at the
  // river, a food truck, Station B in the north-east corner.
  for (const [x, z] of [
    [12, 132],
    [52, 132],
    [12, 172],
    [40, 172],
  ] as const)
    pk.put(M.planter, x, z, 0);
  for (const x of [14, 22, 30, 38]) pk.put(M.bench, x, 189.5, 180);
  pk.put(M.conifer2, 52, 140, 0);
  pk.put(M.conifer2, 12, 150, 0);
  pk.put(M.van, 14, 182, 0); // the food truck
  // Promenade benches between the lamps.
  for (let x = -80; x <= 80; x += 32) pk.put(M.bench, x, 212, 180);
  // The east lot (x 72..104, z 52..92): cars parked round its edge.
  for (const [id, x, z, yaw] of [
    [219, 76, 56, 0],
    [M.suv, 76, 64, 0],
    [M.taxi, 100, 58, 180],
    [M.hatchback, 100, 84, 180],
    [M.van, 76, 88, 0],
  ] as const)
    pk.put(id, x, z, yaw);
  // Each Gate site is cordoned: the Association's barriers in a ring, open
  // on two sides, with cones and a warning sign.
  for (const s of DISTRICT.sites) {
    for (let k = 0; k < 24; k++) {
      if (k <= 1 || k >= 23 || (k >= 11 && k <= 13)) continue; // the ways in (east and west, 7 m wide)
      const a = (k / 24) * Math.PI * 2;
      pk.put(M.barrier, s.x + Math.cos(a) * 9, s.z + Math.sin(a) * 9, Math.round(-(a * 180) / Math.PI + 90 + 360) % 360);
    }
    for (const dz of [-2.4, 2.4]) {
      pk.put(M.cone, s.x - 9.6, s.z + dz, 0, false);
      pk.put(M.cone, s.x + 9.6, s.z + dz, 0, false);
    }
    pk.put(M.signWarning, s.x - 10, s.z + 4, 90, false);
  }
  flush("District park and plaza", 0, pk);

  // -- Gate sites (hidden until a Gate opens there) ----------------------------------
  for (const s of DISTRICT.sites)
    scene.box(s.name, [s.x, 3.6, s.z], [6.5, 7.2, 0.5], "#1a0c33", { ...hidden, ...trigger }, { emissive: rgb("#6b2bff"), emissiveIntensity: 2.2, opacity: 0.85 });
  // The rift an open site holds (lua/world.lua puts one in each open site,
  // reusing them): a tall slab of light in its Gate's rank colour, broad
  // side to the cordon's ways in (east and west), sparks pouring off it.
  // No collider: the hunter walks into it.
  for (const [rank, hex] of Object.entries(GATE_RANK_COLOURS))
    scene.prefab(`Gate rift ${rank}`, {
      Scale: { value: vec(0.35, 5.2, 3.4) },
      Renderable: { mesh: 0, material: 0, visible: true },
      Material: { color: rgb("#140a24"), emissive: rgb(hex), emissiveIntensity: 1.5, opacity: 0.8, roughness: 0.4, keepTextures: false },
      Particles: { preset: "Sparkle", rate: 46, lifetime: 1.4, speed: 0.9, size: 0.16, color: rgb(hex), endColor: rgb("#ffffff"), endSize: 0.04, shape: "Box", shapeSize: 1.7 },
    });

  // -- Field zones ("dungeon breaks", lua/world.lua) -----------------------------------
  // A crack in the street glowing violet, sparks rising off it and a light
  // over it, so a zone reads from down the street; and the hidden anchor
  // the zone's pack follows (world.lua walks it along the street).
  for (const z of DISTRICT.zones) {
    scene.box(z.name, [z.x, 0.03, z.z], [7, 0.05, 1.3], "#1a0830", { ...trigger, Rotation: { euler: vec(0, 0.45, 0) } }, { emissive: rgb("#b46bff"), emissiveIntensity: 1.8, roughness: 0.6 });
    scene.add(`${z.name} glow`, [z.x, 1.4, z.z], {
      Renderable: { visible: false },
      Light: { type: "Point", color: rgb("#c08cff"), intensity: 14, range: 16, castShadows: false },
      Particles: { preset: "Sparkle", rate: 30, lifetime: 1.8, speed: 1.1, size: 0.14, color: rgb("#d6b4ff"), endColor: rgb("#6a3cff"), endSize: 0.04, shape: "Box", shapeSize: 2.4 },
    });
    scene.add(`${z.name} anchor`, [z.x, 0.9, z.z], { Renderable: { visible: false } });
  }

  // -- Subway stations ---------------------------------------------------------------
  // A dark glass canopy over the stairs, and the line-2-green pylon: the
  // station's own entity (lua/world.lua finds it by name).
  for (const s of DISTRICT.stations) {
    scene.box(`${s.name} canopy`, [s.x, 1.4, s.z], [3.2, 2.8, 5], "#16211c", {}, { roughness: 0.3, metalness: 0.4, emissive: rgb("#1d5a2c"), emissiveIntensity: 0.35 });
    scene.box(s.name, [s.x + 2.3, 1.7, s.z - 2.2], [0.5, 3.4, 0.5], "#3cb44b", {}, { emissive: rgb("#3cd65a"), emissiveIntensity: 1.8 });
  }

  // -- Neon: standing shop signs that glow (bloom picks them up) ------------------------
  for (const [n, at, size, hex] of [
    [1, [-54.6, 1.3, 66], [0.25, 2.6, 0.9], "#ff3d8b"],
    [2, [-54.6, 1.3, 78], [0.25, 2.6, 0.9], "#3de0ff"],
    [3, [54.9, 1.3, 66], [0.25, 2.6, 0.9], "#ffb020"],
    [4, [54.9, 1.3, 90], [0.25, 2.6, 0.9], "#a070ff"],
    [5, [14, 3.2, 182], [0.15, 0.6, 2.2], "#ffb020"],
    [6, [73, 1.3, 160], [0.25, 2.6, 0.9], "#ff3d8b"],
  ] as const)
    scene.box(`District neon ${n}`, at as unknown as V3, size as unknown as V3, "#111111", {}, { emissive: rgb(hex), emissiveIntensity: 0.9 });

  // -- A few lights (pooled by the player: only the nearest few render) ---------------
  for (const [name, at, hex, intensity, range] of [
    ["Station A light", [-46, 4, 41.5], "#9dffb0", 14, 12],
    ["Station B light", [48, 4, 177.5], "#9dffb0", 14, 12],
    ["Park light", [-32, 9, 152], "#9fb4ff", 16, 24],
    ["Plaza light", [30, 9, 170], "#ffcf8a", 16, 24],
    ["Lot light", [88, 9, 72], "#ffb060", 16, 22],
    ["Midtown light", [-64, 9, 120], "#ffcf8a", 16, 22],
  ] as const)
    scene.add(name, at as unknown as V3, { Renderable: { visible: false }, Light: { type: "Point", color: rgb(hex), intensity, range, castShadows: false } });

  // -- UI: the district's own prompt line (stations, Gate sites) -----------------------
  // Above the hub's Prompt; bottom anchors take a negative offsetY.
  scene.add("World prompt", [0, 0, 0], {
    UI: { text: "", anchor: "bottom-center", offsetY: -150, fontSize: 18, color: vec(0.75, 1, 0.8), opacity: 0.95 },
  });
}
