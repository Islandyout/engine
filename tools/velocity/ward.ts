// Meridian Ward (GAME_DESIGN.md 4): VELOCITY's district, in daylight. About
// 208 m x 260 m (x -104..104, z -120..140), built from the city kit:
//
//   z 140  ---------------------- (north edge: the Junction, later) ------------
//   z 128  ====================== Bridge street ==================================
//          apartments | apartments  | Transit plaza | office tower
//   z  64  ====================== Transit street =================================
//          Service    | Market Row  | Market Row    | Construction
//          Alley      | west        | east          | Rise
//   z   0  ====================== Market Row (the street) =======================
//          apartments | Meridian    | offices       | car park
//                     | Green       |               |
//   z -64  ====================== Plaza street ===================================
//                        Civic Plaza (the start, Dispatch)
//   z -120 ------------------- (south edge: Civic Hall) ------------------------
//          x -64, x 0 (Central Avenue) and x 64 run north-south.
//
// Everything static is instanced (ModelInstances), so the district is a few
// dozen entities. Roads sit on a 16 m grid with 8 m of sidewalk either
// side; something to look at every 40-60 m at a run.
import { type SceneBuilder, type V3, rgb, vec } from "../gatebreaker/kit";

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
  hydrant: 32,
  lampDouble: 34,
  lamp: 35,
  bush1: 37,
  planter: 41,
  broadleaf1: 46,
  broadleaf2: 47,
  broadleaf3: 48,
  conifer1: 49,
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

// Where the director finds things (keep in step with lua/director.lua).
export const WARD = {
  west: -104,
  east: 104,
  south: -120,
  north: 140,
  start: { x: 0, z: -96 },
  contact: { x: 5, z: -90 },
  // Mission 0: the barrier across Central Avenue and the incident at the
  // Market Row crossing.
  barrierZ: -36,
  incident: { x: 0, z: -4 },
} as const;

const ROADS_X = [-64, 0, 64]; // north-south
const ROADS_Z = [-64, 0, 64, 128]; // east-west
// Pads' tops sit just under the road tiles' own kerbs and sidewalks (which
// overhang the 16 m grid), so the two never z-fight.
const TOP = -0.02;

export function buildWard(scene: SceneBuilder) {
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
  const wall = (name: string, at: V3, size: V3) => scene.add(name, at, { Scale: { value: vec(...size) }, ...hidden, RigidBody: { dynamic: false }, Collider: { type: "AABB" } });

  // -- Ground: one collision slab, and the pads that colour it -------------------
  wall("Ward ground", [0, -0.5, 10], [220, 1, 272]);
  scene.box("Ward base", [0, -1.05, 10], [420, 2, 460], "#5d5f63", trigger, { roughness: 0.95 });
  const pads: [string, number, number, number, number, string][] = [
    ["Civic Plaza", -40, 40, -118, -72, "#c9c2b4"],
    ["Plaza lawn W", -100, -48, -118, -72, "#5f8a4a"],
    ["Plaza lawn E", 48, 100, -118, -72, "#5f8a4a"],
    ["Meridian Green", -56, -8, -56, -8, "#5f8a4a"],
    ["Transit plaza", 8, 56, 72, 120, "#bfb9ad"],
    ["Construction yard", 72, 104, 8, 56, "#8a7b62"],
  ];
  // Concrete sidewalks/blocks everywhere else between the roads.
  const xs: [number, number][] = [
    [-104, -72],
    [-56, -8],
    [8, 56],
    [72, 104],
  ];
  const zs: [number, number][] = [
    [-56, -8],
    [8, 56],
    [72, 120],
    [136, 140],
  ];
  for (const [x0, x1] of xs)
    for (const [z0, z1] of zs) {
      const named = pads.some(([, a0, a1, b0, b1]) => a0 <= x0 && a1 >= x1 && b0 <= z0 && b1 >= z1);
      if (!named) pads.push([`Block ${x0} ${z0}`, x0, x1, z0, z1, "#a7a39b"]);
    }
  for (const [name, x0, x1, z0, z1, hex] of pads) scene.box(name, [(x0 + x1) / 2, TOP - 0.02, (z0 + z1) / 2], [x1 - x0, 0.04, z1 - z0], hex, trigger, { roughness: 0.92 });

  // -- Edges: invisible walls behind a skyline ----------------------------------------
  wall("Ward edge W", [-104.6, 6, 10], [1, 12, 262]);
  wall("Ward edge E", [104.6, 6, 10], [1, 12, 262]);
  wall("Ward edge S", [0, 6, -120.6], [210, 12, 1]);
  wall("Ward edge N", [0, 6, 140.6], [210, 12, 1]);

  // -- Roads: 16 m tiles ------------------------------------------------------------
  const roads = set();
  for (const z of ROADS_Z)
    for (let x = -96; x <= 96; x += 16) {
      if (ROADS_X.includes(x)) {
        // A crossing where avenues meet; a T at the north and south ends.
        const end = z === ROADS_Z[0] || z === ROADS_Z[ROADS_Z.length - 1];
        roads.put(end ? M.roadT : M.roadCross, x, z, z === ROADS_Z[0] ? 0 : 180, false);
      } else roads.put(M.road, x, z, 90, false);
    }
  for (const x of ROADS_X)
    for (let z = -48; z <= 112; z += 16) {
      if (ROADS_Z.includes(z)) continue;
      roads.put(z === -48 || z === 48 ? M.roadCrossing : M.road, x, z, 0, false);
    }
  // Central Avenue runs on south into the plaza as a short approach.
  roads.put(M.roadCrossing, 0, -80, 0, false);
  flush("Ward roads", -0.13, roads);

  // -- Buildings: solid inside the ward, backdrop beyond ----------------------------------
  const b = set();
  // Civic Hall closes the plaza's south side; towers either side frame it.
  b.put(M.office3, 0, -112, 0, true, 1.2);
  b.put(M.tower2, -60, -104, 0, true, 0.8);
  b.put(M.tower1, 60, -104, 0, true, 0.8);
  // South blocks (z -56..-8): apartments west, offices and a car park east.
  b.put(M.apt1, -88, -44, 90);
  b.put(M.apt3, -88, -20, 90);
  b.put(M.office1, 32, -44, 0);
  b.put(M.office2, 32, -20, 180, true, 0.9);
  // Market Row (z 8..56): shop rows facing the avenue on both sides.
  for (const [id, z] of [
    [M.shop1, 16],
    [M.shop2, 28],
    [M.shop3, 40],
    [M.shop1, 52],
  ] as const) {
    b.put(id, -17.5, z, 90);
    b.put(id === M.shop2 ? M.shop3 : id, 17.5, z, 270);
  }
  b.put(M.retail2, -44, 32, 90, true, 0.9);
  b.put(M.retail3, 44, 32, 270, true, 0.9);
  // Service Alley: two apartment rows with a 7 m alley between (x -88).
  b.put(M.apt2, -97, 24, 90, true, 0.85);
  b.put(M.apt2, -97, 48, 90, true, 0.85);
  b.put(M.apt3, -79, 20, 270, true, 0.75);
  b.put(M.apt1, -79, 48, 270, true, 0.75);
  // North blocks (z 72..120).
  b.put(M.apt1, -88, 84, 90);
  b.put(M.apt3, -88, 108, 90);
  b.put(M.apt2, -32, 84, 0);
  b.put(M.apt1, -32, 110, 180);
  b.put(M.tower3, 88, 96, 0, true, 0.9);
  // The skyline past the edges.
  const skyline = [M.tower1, M.office1, M.tower3, M.apt1, M.tower2, M.office3];
  for (let i = 0; i < 8; i++) {
    const z = -100 + i * 32;
    b.put(skyline[i % 6]!, -132, z, 90, false);
    b.put(skyline[(i + 3) % 6]!, 132, z, 270, false);
  }
  for (const x of [-90, -45, 0, 45, 90]) b.put(skyline[(x / 15 + 12) % 6]!, x, 168, 180, false);
  flush("Ward buildings", 0, b);

  // -- Streets: lamps, signals, parked cars, the bus stop ----------------------------------
  const st = set();
  // Lamps on the avenues' kerbs, arm over the road (0: +x, 180: -x).
  for (const z of [-40, -16, 24, 44, 88, 108]) {
    st.put(M.lamp, -9.5, z, 180, false);
    st.put(M.lamp, 9.5, z, 0, false);
    st.put(M.lamp, -73.5, z, 0, false);
    st.put(M.lamp, 73.5, z, 180, false);
  }
  for (const [x, z] of [
    [-9, -9],
    [9, 9],
    [-9, 55],
    [9, 73],
    [-55, -9],
    [55, 9],
  ] as const)
    st.put(M.signalPost, x, z, 0, false);
  // Parked cars along the kerbs, nose along the road: they frame the lanes
  // without blocking them.
  for (const [id, x, z, yaw] of [
    [M.sedan, -6, -28, 0],
    [M.taxi, 6, -50, 180],
    [M.hatchback, -6, 30, 0],
    [M.suv, 6, 84, 180],
    [M.van, -58, 40, 0],
    [M.sedan, 58, -30, 180],
    [M.taxi, -30, 6, 90],
    [M.hatchback, 30, 58, 270],
  ] as const)
    st.put(id, x, z, yaw);
  // The car park (x 72..104, z -56..-8).
  for (const [id, z] of [
    [M.sedan, -50],
    [M.suv, -38],
    [M.hatchback, -26],
    [M.taxi, -14],
  ] as const) {
    st.put(id, 80, z, 90);
    st.put(id === M.suv ? M.van : id, 96, z, 270);
  }
  // Transit plaza: the bus stop and a bus in the bay.
  st.put(M.busstop, 20, 74, 0);
  st.put(M.bus, 40, 70, 90);
  st.put(M.busstop, 40, 116, 180);
  // Bins and hydrants.
  for (const [id, x, z] of [
    [M.bin, -10, -60],
    [M.bin, 10, 60],
    [M.hydrant, -10, 20],
    [M.hydrant, 10, -20],
    [M.bin, -60, 10],
    [M.hydrant, 60, 100],
  ] as const)
    st.put(id, x, z, 0);
  flush("Ward street", 0, st);

  // -- Plaza, park, construction ---------------------------------------------------------
  const pk = set();
  // Civic Plaza: planters round the edge, benches, trees on the lawns.
  for (const x of [-32, -16, 16, 32]) {
    pk.put(M.planter, x, -76, 0);
    pk.put(M.planter, x, -114, 0);
  }
  for (const [x, z, yaw] of [
    [-20, -96, 90],
    [20, -96, 270],
    [-20, -86, 90],
    [20, -86, 270],
  ] as const)
    pk.put(M.bench, x, z, yaw);
  const trees = [M.broadleaf1, M.broadleaf3, M.broadleaf2, M.conifer1];
  let t = 0;
  for (const x of [-92, -76, -60, 60, 76, 92]) {
    pk.put(trees[t++ % 4]!, x, -80, (t * 47) % 360, true, 0.8);
    pk.put(trees[t++ % 4]!, x, -100, (t * 47) % 360, true, 0.8);
  }
  // Meridian Green (x -56..-8, z -56..-8): trees round the edge, benches inside.
  for (const x of [-50, -38, -26, -14]) {
    pk.put(trees[t++ % 4]!, x, -52, (t * 47) % 360, true, 0.8);
    pk.put(trees[t++ % 4]!, x, -12, (t * 47) % 360, true, 0.8);
  }
  for (const z of [-40, -24]) {
    pk.put(trees[t++ % 4]!, -52, z, (t * 47) % 360, true, 0.8);
    pk.put(trees[t++ % 4]!, -12, z, (t * 47) % 360, true, 0.8);
  }
  pk.put(M.bench, -32, -36, 0);
  pk.put(M.bench, -32, -28, 180);
  // Construction Rise (x 72..104, z 8..56): fenced with barriers and cones.
  for (let z = 12; z <= 52; z += 4) pk.put(M.barrier, 74, z, 90);
  for (const z of [16, 32, 48]) pk.put(M.cone, 72.5, z, 0, false);
  pk.put(M.signWarning, 73, 24, 90, false);
  pk.put(M.boxtruck, 96, 14, 0);
  flush("Ward plaza and park", 0, pk);

  // Construction Rise's ramp and scaffold deck (jump and air-control practice).
  // The ramp's top edge meets the deck (2.6 m) at z 31.
  scene.box("Rise ramp", [86, 0.45, 24], [8, 0.4, 14], "#9c8a6a", { Rotation: { euler: vec(-0.32, 0, 0) } }, { roughness: 0.85 });
  scene.box("Rise deck", [86, 2.4, 39], [12, 0.4, 16], "#8f7f62", {}, { roughness: 0.85 });
  for (const [x, z] of [
    [80.5, 31.5],
    [91.5, 31.5],
    [80.5, 46.5],
    [91.5, 46.5],
  ] as const)
    scene.box("Rise post", [x, 1.1, z], [0.4, 2.2, 0.4], "#c48a2a", {}, { metalness: 0.5, roughness: 0.5 });

  // -- Mission 0 set dressing -----------------------------------------------------------
  // The low barrier across Central Avenue (jumpable, and the sidewalks go round).
  const barrier = set();
  for (let x = -6; x <= 6; x += 2.4) barrier.put(M.barrier, x, WARD.barrierZ, 0);
  barrier.put(M.signWarning, -7.2, WARD.barrierZ - 1, 0, false);
  flush("Avenue barrier", 0, barrier);

  // -- Landmark: the Civic Hall's beacon, visible from the north end --------------------
  scene.add("Civic beacon", [0, 26, -112], {
    Renderable: { visible: false },
    Light: { type: "Point", color: rgb("#ffd59a"), intensity: 10, range: 30, castShadows: false },
  });
}

// The district map (hud.map_layout): bounds, areas, roads, buildings.
export function wardMap(): string {
  const lines = [`bounds ${-104} ${-120} ${104} ${140}`];
  lines.push("area -40 -118 40 -72 #c9c2b4 Civic Plaza");
  lines.push("area -56 -56 -8 -8 #5f8a4a Meridian Green");
  lines.push("area 8 72 56 120 #bfb9ad Transit Plaza");
  lines.push("area 72 8 104 56 #8a7b62 Construction Rise");
  lines.push("area -56 8 56 56 #a7a39b Market Row");
  for (const z of ROADS_Z) lines.push(`road -104 ${z - 8} 104 ${z + 8}`);
  for (const x of ROADS_X) lines.push(`road ${x - 8} -72 ${x + 8} 136`);
  lines.push("label -88 30 Service Alley");
  return lines.join("\n");
}
