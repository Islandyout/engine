// Generates the Pale Signal engine slice (examples/space/pale-signal.json):
// a ten-minute run through Pale Signal's Vertical Slice 2.0 beats on this
// engine -- step out onto Tethys, survey a Talari ruin, gather fuel, fly
// out of the atmosphere into orbit, cross to the moon Vell, and land at the
// signal. See docs/space/PALE_SIGNAL_SLICE.md. Run from apps/editor:
//
//   npm run space
//
// Everything authored here sits in the site frame around Kestra Station on
// Tethys (metres, +y up); the planets, moon and flight are the SpaceSystem.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultComponent } from "../../apps/editor/src/authoring/CommandInterpreter";
import { validateSceneDocument } from "../../apps/editor/src/scene/SceneSerializer";
import type { SceneDocument } from "../../apps/editor/src/scene/SceneSerializer";

type Components = Record<string, unknown>;
type V3 = [number, number, number];
const here = dirname(fileURLToPath(import.meta.url));
const vec = (x: number, y: number, z: number) => ({ x, y, z });
const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return vec(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};
const component = (type: string, overrides: Record<string, unknown> = {}) => ({
  ...(defaultComponent(type as never) as object),
  ...overrides,
});
let seed = 20261004;
const random = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)]!;

const entities: SceneDocument["entities"] = [];
const add = (name: string, position: V3, components: Components, parent?: number) => {
  entities.push({
    name,
    ...(parent !== undefined ? { parent: { index: parent, generation: 1 } } : {}),
    components: { Transform: { position: vec(...position) }, ...components } as never,
  });
  return entities.length - 1;
};
const material = (hex: string, extra: Record<string, unknown> = {}) =>
  component("Material", { color: rgb(hex), roughness: 0.8, keepTextures: false, ...extra });
const box = (name: string, position: V3, size: V3, hex: string, extra: Components = {}, look: Record<string, unknown> = {}) =>
  add(name, position, {
    Scale: { value: vec(...size) },
    Renderable: { mesh: 0, material: 0, visible: true },
    Material: material(hex, look),
    ...extra,
  });

// ------------------------------------------------------------- the system --
// Pale Signal's inner system, scaled for play (radii and orbits as in the
// prototype's BODIES table). The site is Kestra Station on Tethys.
const SITE = { body: "Tethys", latitude: 30, longitude: 40 };
const SIGNAL = { body: "Vell", latitude: -12, longitude: 35 };
// Tethys has seas and weather; Vell is ice; Cinder is scorched; Ossuary dust.
const bodies = [
  "Tethys - 1600000 5027 0 0 60000 9 9000 1.05 320 3200 7 #4f7a4a #87b6c8 sea=-60 clouds=0.42 snow=1",
  "Vell Tethys 230000 3850 20 7 18000 2.6 0 0 180 1800 3 #c3cfdc #000000 snow=1",
  "Cinder - 900000 2120 40 2 44000 7 0 0 500 2500 5 #8a4a34 #000000",
  "Ossuary - 2400000 9230 126 -3 52000 6.4 5000 0.18 420 4000 11 #9a9385 #c0b49a clouds=0.25",
].join("\n");
// Species from the prototype's catalogue, standing in with catalog models:
// [id, body, class, model, weight, scale, name, research points, description].
const SPECIES: Array<[string, string, string, number, number, number, string, number, string]> = [
  ["te_reed", "Tethys", "flora", 38, 6, 0.8, "Pale Reed", 8, "Hollow-stemmed, wind-pollinated, and the dominant ground cover of the northern flats."],
  ["te_cap", "Tethys", "flora", 45, 2, 0.7, "Lantern Cap", 11, "Fruiting body glows on a 40-second cycle. Nothing here is known to see in that band."],
  ["te_pine", "Tethys", "flora", 49, 3, 1, "Kestra Spire", 9, "A conifer analogue whose rings record every flood the Talari have recorded, and several they have not."],
  ["te_iron", "Tethys", "mineral", 42, 2, 0.8, "Banded Ironstone", 5, "Layered oxide. Proof this world once had far more free oxygen than it does now."],
  ["te_ice", "Tethys", "mineral", 44, 2, 1.2, "Clathrate Pocket", 6, "Methane locked in a water lattice. Vents when disturbed. Excellent propellant feedstock."],
  ["te_graze", "Tethys", "fauna", 135, 0, 1, "Flat Grazer", 22, "Herd animal. Six legs, no forward-facing eyes, and an alarm call you feel before you hear."],
  ["ve_spar", "Vell", "mineral", 43, 5, 1.1, "Rime Spar", 7, "Crystals of nitrogen ice that ring when struck. The ringing has a pattern."],
  ["ve_ridge", "Vell", "mineral", 42, 3, 1.6, "Pressure Ridge", 6, "Ice folded by tides from Tethys. Some ridges run arrow-straight toward the relay."],
  ["ve_lichen", "Vell", "flora", 37, 2, 0.5, "Frost Lichen", 16, "Living, at 100 kelvin, on a moon with no air. It should not exist. It grows thickest near the signal."],
  ["ci_slag", "Cinder", "mineral", 44, 4, 1, "Vitrous Slag", 6, "Rift glass, quenched in seconds. Trapped bubbles still hold the original atmosphere."],
  ["ci_sulf", "Cinder", "mineral", 43, 3, 0.9, "Sulphur Bloom", 5, "Vents deposit it faster than the heat can destroy it. Barely a mineral. Barely stable."],
  ["ci_ember", "Cinder", "flora", 37, 2, 0.6, "Ember Lichen", 12, "Not a plant. A thermophile colony that metabolises the rock it sits on."],
  ["os_column", "Ossuary", "mineral", 42, 4, 1.4, "Dust Column", 6, "Fused grit standing in rows. Machine-straight. Then abandoned mid-row."],
  ["os_coral", "Ossuary", "flora", 51, 1, 0.6, "Bone Coral", 14, "Calcified stalks with no living tissue -- and new growth every season."],
];
const species = SPECIES.map(([id, body, cls, model, weight, scale, name, , text]) => `${id} ${body} ${cls} ${model} ${weight} ${scale} ${name} | ${text}`).join("\n");
// Landmarks: the Kneeling Array is a short hop from Kestra; the Under-Ice
// Relay on Vell is where the signal resolves.
const ARRAY = { body: "Tethys", latitude: 21, longitude: 54 };
const LANDMARKS: Array<[typeof ARRAY, string, string, number, string]> = [
  [ARRAY, "#8ff7ff", "The Kneeling Array", 40, "Nine dishes, all facing the same empty patch of sky. None of them are pointed at anything in this system."],
  [SIGNAL, "#8ff7ff", "Under-Ice Relay", 60, "Forty metres of clear ice, and beneath it a lattice of aerials, aimed straight up at you."],
  [{ body: "Cinder", latitude: 18, longitude: -30 }, "#ff9a5a", "The Anvil", 40, "A slab of worked metal standing in a lava channel. The rock flowed around it. It did not melt."],
];
add("Space", [0, 40, 0], {
  SpaceSystem: component("SpaceSystem", {
    bodies,
    starGm: 6.4e12,
    starColor: rgb("#fff1d8"),
    siteBody: SITE.body,
    siteLatitude: SITE.latitude,
    siteLongitude: SITE.longitude,
    siteRadius: 320,
    evaRange: 1200,
    // Mid-morning at Kestra: the sun about 35 degrees up in the east.
    startTime: 2600,
    landmarks: [
      ...LANDMARKS.map(([at, color, name]) => `${at.body} ${at.latitude} ${at.longitude} ${color} ${name}`),
      `${SITE.body} ${SITE.latitude} ${SITE.longitude} #ffd36e Kestra Station`,
    ].join("\n"),
    species,
  }),
  Environment: component("Environment", {
    sky: "Color",
    skyColor: rgb("#87b6c8"),
    sunIntensity: 2.6,
    sunColor: rgb("#fff1d8"),
    ambientIntensity: 0.9,
    fog: "None",
    shadows: true,
    exposure: 1.0,
  }),
  PostProcessing: component("PostProcessing", {
    ambientOcclusion: false,
    shadowQuality: "Medium",
    bloom: 0.3,
    bloomThreshold: 0.88,
    contrast: 0.12,
    saturation: -0.05,
    temperature: -0.08,
    vignette: 0.32,
    grain: 0.03,
  }),
  AudioSettings: component("AudioSettings", { reverb: 0.15 }),
});

// --------------------------------------------------------------- the ship --
// The Kestrel: the engine's built-in survey ship model over a collider the
// size of its hull.
const HULL: V3 = [2.6, 2.2, 11];
const PAD_TOP = 0.4;
add("Ship", [0, PAD_TOP + 1.6, 0], {
  Spaceship: component("Spaceship", { fuel: 100, model: "Kestrel" }),
  Rotation: { euler: vec(0, 0, 0) },
  Scale: { value: vec(...HULL) },
  Renderable: { mesh: 0, material: 0, visible: true },
  Material: material("#c9ccd1", { roughness: 0.45, metalness: 0.55 }),
  Collider: component("Collider"),
});

// ----------------------------------------------------------- Kestra Station --
box("Landing Pad", [0, PAD_TOP / 2, 0], [28, PAD_TOP, 28], "#3d4248", { Collider: component("Collider") }, { roughness: 0.7, metalness: 0.3 });
for (const [x, z, sx, sz] of [
  [0, 13.2, 26, 0.5],
  [0, -13.2, 26, 0.5],
  [13.2, 0, 0.5, 26],
  [-13.2, 0, 0.5, 26],
] as const)
  box("Pad Light", [x, PAD_TOP + 0.03, z], [sx, 0.06, sz], "#e8b62a", {}, { emissive: rgb("#e8a52a"), emissiveIntensity: 1.6 });
// The hangar: walls, a roof and a lit door frame.
box("Station Hangar", [-44, 4.5, -8], [18, 9, 24], "#a7adb3", { Collider: component("Collider") }, { roughness: 0.55, metalness: 0.45 });
box("Hangar Roof", [-44, 9.3, -8], [19.5, 0.6, 25.5], "#6d747c", {}, { roughness: 0.5, metalness: 0.5 });
box("Hangar Door", [-34.9, 3.8, -8], [0.3, 7.2, 12], "#2e3338", {}, { roughness: 0.6, metalness: 0.4 });
box("Hangar Light", [-34.7, 7.8, -8], [0.2, 0.3, 12.4], "#ffe6b0", {}, { emissive: rgb("#ffd890"), emissiveIntensity: 2 });
add("Survey Office", [-36, 0, 30], { Scale: { value: vec(16, 16, 16) }, Renderable: { mesh: 10, material: 0, visible: true }, Rotation: { euler: vec(0, Math.PI / 2, 0) }, Collider: component("Collider") });
for (const [x, z] of [
  [-18, -18],
  [18, -18],
  [-18, 18],
  [18, 18],
] as const)
  add("Pad Lamp", [x, 0, z], { Scale: { value: vec(0.6, 6.5, 2.2) }, Renderable: { mesh: 35, material: 0, visible: true }, Rotation: { euler: vec(0, Math.atan2(-x, -z), 0) } });
add("Antenna Mast", [-58, 0, 20], { Scale: { value: vec(1.2, 11, 1.2) }, Renderable: { mesh: 36, material: 0, visible: true } });
add("Antenna Mast", [-58, 0, -30], { Scale: { value: vec(1.2, 11, 1.2) }, Renderable: { mesh: 36, material: 0, visible: true } });
box("Fuel Tank", [-24, 2, -30], [6, 4, 6], "#7a8086", { Collider: component("Collider") }, { roughness: 0.5, metalness: 0.5 });
box("Fuel Tank", [-16, 1.5, -32], [4, 3, 4], "#7a8086", { Collider: component("Collider") }, { roughness: 0.5, metalness: 0.5 });

// ------------------------------------------------- Kestra (a Talari quarter) --
// Ochre and teal shophouses around a small square, with inhabitants going
// about their day.
const TALARI = [17, 18, 19, 5, 6, 7];
const TINTS = ["#c9a46a", "#b9805a", "#6f9a95", "#d8c8a2", "#8a6f5a"];
const quarter: string[] = [];
for (let i = 0; i < 14; i++) {
  const a = (i / 14) * Math.PI * 2;
  const r = 34 + (i % 2) * 10;
  quarter.push(`${pick(TALARI)} ${(190 + Math.cos(a) * r).toFixed(1)} ${(40 + Math.sin(a) * r).toFixed(1)} ${Math.round(((-a * 180) / Math.PI + 90 + 360) % 360)} 0.9 solid`);
}
add("Kestra Quarter", [0, 0, 0], { ModelInstances: { instances: quarter.join("\n") } });
box("Kestra Square", [190, 0.05, 40], [40, 0.1, 40], "#b7a682", {}, { roughness: 0.9 });
// Kestra's people: named Talari from the prototype going about their day,
// plus passers-by. E beside one talks; their words translate as your
// language model grows.
const NPCS = [
  { id: "tal_ossin", name: "Tal Ossin", role: "dockwarden", line: "Your ship is welcome on the marked field. In the houses, engine wash is not a philosophical question.", at: [176, 30] },
  { id: "ena_vey", name: "Ena Vey", role: "historian", line: "The oldest honest answer is that the Arrays were already old when our oldest dated stones were new.", at: [200, 52] },
  { id: "maru_sen", name: "Maru Sen", role: "reedwright", line: "Every flood leaves a different town. We build knowing the river gets a vote.", at: [184, 56] },
  { id: "osen_kai", name: "Osen Kai", role: "teacher", line: "Children learn five eras. Adults spend the rest of their lives arguing about where one era ends.", at: [204, 28] },
  { id: "veyra_tol", name: "Veyra Tol", role: "astronomer", line: "Every dish tracks one empty coordinate. Empty is an observation, not an explanation.", at: [192, 22] },
];
for (const npc of NPCS)
  add(npc.name, [npc.at[0]!, 0.9, npc.at[1]!], {
    Scale: { value: vec(0.6, 1.8, 0.6) },
    Renderable: { mesh: 132, material: 0, visible: true },
    Material: material(pick(TINTS), { roughness: 0.85 }),
    AIState: { state: "Walking" },
    Pedestrian: { archetype: 0 },
  });
for (let i = 0; i < 4; i++) {
  const a = random() * Math.PI * 2;
  add("Talari", [190 + Math.cos(a) * 14, 0.9, 40 + Math.sin(a) * 14], {
    Scale: { value: vec(0.6, 1.8, 0.6) },
    Renderable: { mesh: 132, material: 0, visible: true },
    Material: material(pick(TINTS), { roughness: 0.85 }),
    AIState: { state: "Walking" },
    Pedestrian: { archetype: 0 },
  });
}
// Evidence: scanning each teaches the language and adds to the record.
const EVIDENCE = [
  { id: "te_memorial", name: "Concord Memorial Wall", at: [190, 1.6, 12], size: [9, 3.2, 0.8], color: "#9a8f80", gain: 7, rp: 7, era: "Concord Era",
    text: "Names from both sides of the Basin Wars are written together. Several families appear beneath conflicting descriptions of the same final battle." },
  { id: "te_oral", name: "Oral-History Listening Post", at: [214, 1.1, 46], size: [0.8, 2.2, 0.8], color: "#6f9a95", gain: 11, rp: 9, era: "Concord Era",
    text: "Recorded elders disagree about the Arrays: taboo graves, astronomical instruments, or 'stars that learned to kneel.' The contradictions are preserved rather than reconciled." },
  { id: "te_calendar", name: "Flood Calendar Stone", at: [-4, 1, -152], size: [2.4, 2, 0.6], color: "#7d7466", gain: 9, rp: 9, era: "Reed Settlement Age",
    text: "A weathered flood calendar uses a star symbol beside a direction matching the Kneeling Array. The carving predates the River Kingdoms." },
];
for (const e of EVIDENCE)
  box(e.name, e.at as V3, e.size as V3, e.color, { Collider: component("Collider"), Scannable: { id: e.id, name: e.name, kind: "Culture", range: 6 } }, { roughness: 0.9 });

// ------------------------------------------------------------ the Talari ruin --
// North of the station: a ring of fallen stone around a monolith carrying
// script older than the Talari's own -- the survey target.
const RUIN: V3 = [20, 0, -170];
box("Ruin Core", [RUIN[0], 4.5, RUIN[2]], [2.2, 9, 2.2], "#2c2a28", { Collider: component("Collider"), Scannable: { id: "te_gate_layer", name: "Black Foundation", kind: "Culture", range: 8 } }, { emissive: rgb("#3fd8c8"), emissiveIntensity: 0.08, roughness: 0.6, metalness: 0.5 });
for (let i = 0; i < 7; i++) {
  const a = (i / 7) * Math.PI * 2 + 0.3;
  const h = 2.5 + random() * 4;
  box("Ruin Pillar", [RUIN[0] + Math.cos(a) * 14, h / 2, RUIN[2] + Math.sin(a) * 14], [1.4, h, 1.4], "#3a3530", { Collider: component("Collider") }, { roughness: 0.95 });
}
const ruinRocks: string[] = [];
for (let i = 0; i < 16; i++) {
  const a = random() * Math.PI * 2, r = 8 + random() * 16;
  ruinRocks.push(`${pick([42, 43, 44])} ${(RUIN[0] + Math.cos(a) * r).toFixed(1)} ${(RUIN[2] + Math.sin(a) * r).toFixed(1)} ${Math.floor(random() * 360)} ${(0.6 + random() * 0.8).toFixed(2)}`);
}
add("Ruin Stones", [0, 0, 0], { ModelInstances: { instances: ruinRocks.join("\n") } });

// ------------------------------------------------------------ volatile ice --
// Fuel: glowing volatile ice outcrops to collect on foot.
const ICE: V3[] = [
  [95, 0, -70],
  [-110, 0, 95],
  [60, 0, 140],
];
ICE.forEach((p, i) =>
  box(`Volatile Ice ${i + 1}`, [p[0], 0.9, p[2]], [1.1, 1.8, 1.1], "#bfe8ff", { Scannable: { id: `ice:${i + 1}`, name: "Volatile Ice", kind: "Mineral", range: 5 } }, { emissive: rgb("#6fc8ff"), emissiveIntensity: 1.4, roughness: 0.2, metalness: 0.1 }),
);

// ------------------------------------------------------------ wilderness --
const trees: string[] = [];
const rocks: string[] = [];
const clear = (x: number, z: number) =>
  Math.hypot(x, z) < 60 || Math.hypot(x - 190, z - 40) < 60 || Math.hypot(x - RUIN[0], z - RUIN[2]) < 34 || ICE.some((p) => Math.hypot(x - p[0], z - p[2]) < 8);
for (let i = 0; i < 520; i++) {
  const a = random() * Math.PI * 2, r = 50 + Math.sqrt(random()) * 950;
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  if (clear(x, z)) continue;
  if (random() < 0.78) trees.push(`${pick([49, 50, 46, 47, 48])} ${x.toFixed(1)} ${z.toFixed(1)} ${Math.floor(random() * 360)} ${(0.8 + random() * 0.6).toFixed(2)}`);
  else rocks.push(`${pick([42, 43])} ${x.toFixed(1)} ${z.toFixed(1)} ${Math.floor(random() * 360)} ${(0.7 + random() * 1.4).toFixed(2)}`);
}
add("Forest", [0, 0, 0], { ModelInstances: { instances: trees.join("\n") } });
add("Boulders", [0, 0, 0], { ModelInstances: { instances: rocks.join("\n") } });
for (let i = 0; i < 5; i++) {
  const a = random() * Math.PI * 2, r = 90 + random() * 120;
  add("Stag", [Math.cos(a) * r, 0.8, Math.sin(a) * r], {
    Scale: { value: vec(0.7, 1.6, 1.8) },
    Renderable: { mesh: 135, material: 0, visible: true },
    Scannable: { id: "te_graze", name: "Flat Grazer", kind: "Fauna", range: 14 },
    AIState: { state: "Walking" },
    Pedestrian: { archetype: 0 },
  });
}

// ------------------------------------------------------- player and camera --
add("Player", [6, PAD_TOP + 0.9, 8], {
  Player: {},
  Renderable: { mesh: 132, material: 0, visible: true },
  Material: material("#d7d2c6", { roughness: 0.7 }),
  Scale: { value: vec(0.6, 1.8, 0.6) },
  CharacterController: component("CharacterController", { mode: "ThirdPerson", walkSpeed: 4.2, sprintSpeed: 7.5 }),
});
add("Camera", [0, 6, 12], {
  Camera: component("Camera", { fov: 62, near: 0.2, far: 20000, priority: 1 }),
  CameraFollow: component("CameraFollow", { target: "", offset: vec(0, 2.2, -5.5), smoothing: 0.03, lookHeight: 1.5, collision: true, orbit: true }),
});

// --------------------------------------------------------------- director --
const lua = (value: unknown): string =>
  Array.isArray(value)
    ? `{${value.map(lua).join(", ")}}`
    : typeof value === "object" && value
      ? `{${Object.entries(value).map(([k, v]) => `${/^[A-Za-z_]\w*$/.test(k) ? k : `["${k}"]`} = ${lua(v)}`).join(", ")}}`
      : typeof value === "string"
        ? JSON.stringify(value)
        : String(value);
const config = [
  `local RUIN = ${lua(RUIN)}`,
  `local ICE = ${lua(ICE.map((p, i) => ({ name: `Volatile Ice ${i + 1}`, x: p[0], z: p[2] })))}`,
  `local SIGNAL = ${lua(SIGNAL)}`,
  `local SITE = ${lua(SITE)}`,
  `local START_FUEL = 45`,
  `local SPECIES = ${lua(Object.fromEntries(SPECIES.map(([id, body, cls, , , , name, rp, text]) => [id, { name, body, cls, rp, text }])))}`,
  `local NPCS = ${lua(NPCS.map(({ id, name, role, line }) => ({ id, name, role, line })))}`,
  `local EVIDENCE = ${lua(Object.fromEntries(EVIDENCE.map(({ id, name, gain, rp, era, text }) => [id, { name, gain, rp, era, text }])))}`,
  `local LANDMARKS = ${lua(Object.fromEntries(LANDMARKS.map(([at, , name, rp, text]) => [`landmark:${name}`, { name, body: at.body, rp, text }])))}`,
  `local BREATHABLE = { Tethys = true }`,
].join("\n");
add("Director", [0, 60, 0], {
  Script: { source: readFileSync(join(here, "lua/director.lua"), "utf8").replace("\n{{CONFIG}}\n", `\n${config}\n`), props: {} },
});

// --------------------------------------------------------------------- UI --
const ui = (name: string, value: Record<string, unknown>) => add(name, [0, 0, 0], { UI: component("UI", value) });
const WHITE = rgb("#eef4f6"),
  DARK = rgb("#081018"),
  CYAN = rgb("#8ff7ff"),
  AMBER = rgb("#ffd36e");
const text = (name: string, value: string, anchor: string, offsetX: number, offsetY: number, fontSize: number, color = WHITE, opacity = 1) =>
  ui(name, { kind: "Text", text: value, anchor, offsetX, offsetY, fontSize, color, opacity });
text("Objective", "", "top-left", 24, 22, 17, WHITE);
text("Detail", "", "top-left", 24, 48, 13, WHITE, 0.8);
text("Banner", "", "top-center", 0, 200, 26, CYAN);
text("Hint", "", "bottom-center", 0, -64, 15, WHITE, 0.9);
// Suit and research, top right.
text("Research", "", "top-right", -24, 96, 15, AMBER);
text("Language", "", "top-right", -24, 118, 13, WHITE, 0.8);
text("O2Label", "", "top-right", -24, 140, 13, WHITE, 0.85);
ui("O2Bar", { kind: "Bar", text: "", anchor: "top-right", offsetX: -24, offsetY: 162, width: 180, height: 8, color: rgb("#7fd1ff"), opacity: 0.9, value: 1 });
// Talking: a speaker's name, role and words (translated as far as you can).
ui("TalkPanel", { kind: "Panel", text: "", anchor: "bottom-center", offsetY: -110, width: 640, height: 120, color: DARK, opacity: 0.85 });
text("TalkName", "", "bottom-center", 0, -196, 16, AMBER);
text("TalkLine", "", "bottom-center", 0, -160, 14, WHITE, 0.95);
// Upgrades: U.
ui("UpgradePanel", { kind: "Panel", text: "", anchor: "middle-left", offsetX: 20, width: 360, height: 360, color: DARK, opacity: 0.88 });
text("UpgradeTitle", "SHIP UPGRADES (research points)", "middle-left", 40, -150, 14, AMBER);
const UPGRADES = ["thrust", "fuel", "hull", "heat", "life", "rcs"];
UPGRADES.forEach((id, i) =>
  ui(`Up_${id}`, { kind: "Button", text: id, action: "script", anchor: "middle-left", offsetX: 40, offsetY: -110 + i * 46, width: 320, height: 38, fontSize: 13, color: rgb("#1f4f5a"), opacity: 1 }),
);
// Journal: J.
ui("JournalPanel", { kind: "Panel", text: "", anchor: "middle-right", offsetX: -20, width: 380, height: 420, color: DARK, opacity: 0.82 });
text("JournalTitle", "FIELD JOURNAL", "middle-right", -230, -180, 15, AMBER);
text("JournalText", "", "middle-right", -30, -150, 13, WHITE, 0.92);
// Title.
ui("TitlePanel", { kind: "Panel", text: "", anchor: "center", width: 640, height: 400, color: DARK, opacity: 0.88 });
text("Title", "PALE SIGNAL", "center", 0, -130, 58, CYAN);
text("TitleSub", "Survey Tethys, meet the Talari, and follow the signal to Vell. No loading screens.", "center", 0, -76, 16);
ui("Begin", { kind: "Button", text: "BEGIN", action: "script", anchor: "center", offsetY: -10, width: 220, height: 50, fontSize: 20, color: rgb("#1f6f7a"), opacity: 1 });
text("Controls", "On foot: WASD move · mouse look · E board/exit or talk · hold F scan · J journal · U upgrades", "center", 0, 62, 13, WHITE, 0.75);
text("Controls2", "Flight: W/S throttle · Shift full · X cut · arrows/IJKL pitch & yaw (A/D yaw) · Q/E roll", "center", 0, 84, 13, WHITE, 0.75);
text("Controls3", "Space/C lift & sink · T stabilized/manual · N NAV mode · 9/0 time warp · drag to look", "center", 0, 106, 13, WHITE, 0.75);
// Ending.
ui("EndPanel", { kind: "Panel", text: "", anchor: "center", width: 620, height: 260, color: DARK, opacity: 0.9 });
text("EndTitle", "", "center", 0, -70, 36, CYAN);
text("EndText", "", "center", 0, -10, 15);
ui("Again", { kind: "Button", text: "PLAY AGAIN", action: "restart", anchor: "center", offsetY: 70, width: 220, height: 46, fontSize: 17, color: rgb("#1f6f7a"), opacity: 1 });
ui("PausePanel", { kind: "Panel", text: "", anchor: "center", visibleWhen: "pause", width: 300, height: 190, color: DARK, opacity: 0.85 });
ui("Resume", { kind: "Button", text: "Resume", action: "resume", anchor: "center", visibleWhen: "pause", offsetY: -18, width: 200, height: 40, color: rgb("#1f6f7a"), opacity: 1 });
ui("Restart", { kind: "Button", text: "Restart", action: "restart", anchor: "center", visibleWhen: "pause", offsetY: 34, width: 200, height: 40, color: rgb("#4c5560"), opacity: 1 });

// Logic, light and UI entities aren't drawn.
for (const entity of entities) {
  const c = entity.components as Components;
  if (!c.Renderable && !c.Player && !c.ModelInstances) c.Renderable = { mesh: 0, material: 0, visible: false };
}
const document = { format: 1, name: "Pale Signal", entities } as SceneDocument;
validateSceneDocument(document);
const out = process.env.PS_OUT ?? join(here, "../../examples/space/pale-signal.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(document, null, 1) + "\n");
console.log(`wrote ${out}: ${entities.length} entities, ${trees.length} trees, ${rocks.length} boulders`);
