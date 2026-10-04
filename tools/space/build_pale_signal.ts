// Generates Pale Signal on this engine (examples/space/pale-signal.json):
// the whole prototype expedition -- Kestra Station and the Talari quarter on
// Tethys with its market, Meridian House and Old Vey Gate; Darsa Delta and
// Meridian Spur; the Ossuary archive and causeway; the Third Mooring on
// Hollow; nine landmarks with seven signal fragments; and hidden Nemesis.
// See docs/space/PALE_SIGNAL_SLICE.md. Data: pale_data.ts. Run from
// apps/editor:
//
//   npm run space
//
// The home site (Kestra Station) is authored in the SpaceSystem's own frame
// (metres, +y up); every other place is a Site entity whose children are
// authored around its own surface point.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultComponent } from "../../apps/editor/src/authoring/CommandInterpreter";
import { validateSceneDocument } from "../../apps/editor/src/scene/SceneSerializer";
import type { SceneDocument } from "../../apps/editor/src/scene/SceneSerializer";
import { ACADEMY, BODIES, BODY_INFO, CLADES, EVIDENCE, INVESTIGATIONS, LANDMARKS, NPCS, SITES, SPECIES, UPGRADES, kestra } from "./pale_data";

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
const prefabs: NonNullable<SceneDocument["prefabs"]> = {};
// The Site entity new entities belong to (undefined: the home site).
let siteParent: number | undefined;
const add = (name: string, position: V3, components: Components, parent = siteParent) => {
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
const model = (name: string, mesh: number, position: V3, scale: V3, yaw = 0, extra: Components = {}) =>
  add(name, position, { Scale: { value: vec(...scale) }, Renderable: { mesh, material: 0, visible: true }, Rotation: { euler: vec(0, yaw, 0) }, ...extra });
const solid = () => ({ Collider: component("Collider") });
const light = (name: string, position: V3, color: string, intensity: number, range: number) =>
  add(name, position, { Light: component("Light", { color: rgb(color), intensity, range }) });

// ------------------------------------------------------------- the system --
const SITE = { body: "Tethys", latitude: 30, longitude: 40 };
add("Space", [0, 40, 0], {
  SpaceSystem: component("SpaceSystem", {
    bodies: BODIES.join("\n"),
    starGm: 6.4e12,
    starColor: rgb("#fff1d8"),
    siteBody: SITE.body,
    siteLatitude: SITE.latitude,
    siteLongitude: SITE.longitude,
    siteRadius: 320,
    evaRange: 1200,
    // Mid-morning at Kestra: the sun about 35 degrees up in the east.
    startTime: 2600,
    landmarks: LANDMARKS.map(([body, lat, lon, color, name, , kind]) => `${body} ${lat} ${lon} ${color} kind=${kind} ${name}`).join("\n"),
    species: SPECIES.map(([id, body, cls, mesh, weight, scale, name, , , , text]) => `${id} ${body} ${cls} ${mesh} ${weight} ${scale} ${name} | ${text}`).join("\n"),
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

// ------------------------------------------------- the Talari building kit --
// Terrace homes (ochre and lime walls, teal roofs, warm doorways), canal
// floodwalls, market stalls and civic halls ringed with columns.
const WALLS = ["#c9a46a", "#d8c8a2", "#b9805a", "#c7b48a", "#a88f6a"];
const ROOFS = ["#3f6f6a", "#4e7f74", "#5a6f7a", "#7a5a46"];
function terrace(x: number, z: number, yaw: number, storeys = 1 + Math.floor(random() * 2)) {
  const wall = pick(WALLS), roof = pick(ROOFS);
  const w = 7 + random() * 3, d = 6 + random() * 2, h = 3.4;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (lx: number, lz: number): [number, number] => [x + lx * c + lz * s, z - lx * s + lz * c];
  for (let i = 0; i < storeys; i++) {
    const shrink = i * 0.8;
    add("Terrace", [x, h * i + h / 2, z], { Scale: { value: vec(w - shrink, h, d - shrink) }, Rotation: { euler: vec(0, yaw, 0) }, Renderable: { mesh: 0, material: 0, visible: true }, Material: material(wall, { roughness: 0.92 }), ...(i === 0 ? solid() : {}) });
  }
  add("Roof", [x, h * storeys + 0.25, z], { Scale: { value: vec(w + 0.8 - (storeys - 1) * 0.8, 0.5, d + 0.8 - (storeys - 1) * 0.8) }, Rotation: { euler: vec(0, yaw, 0) }, Renderable: { mesh: 0, material: 0, visible: true }, Material: material(roof, { roughness: 0.7 }) });
  // A warm-lit doorway: the vestibule glow seen at dusk.
  const [dx, dz] = at(0, d / 2 + 0.06);
  add("Doorway", [dx, 1.2, dz], { Scale: { value: vec(1.2, 2.2, 0.1) }, Rotation: { euler: vec(0, yaw, 0) }, Renderable: { mesh: 0, material: 0, visible: true }, Material: material("#2a1d12", { emissive: rgb("#ffb860"), emissiveIntensity: 0.9 }) });
}
function stall(x: number, z: number, yaw: number) {
  add("Stall", [x, 0.5, z], { Scale: { value: vec(3, 1, 1.6) }, Rotation: { euler: vec(0, yaw, 0) }, Renderable: { mesh: 0, material: 0, visible: true }, Material: material("#7a5a3c"), ...solid() });
  add("Canopy", [x, 2.6, z], { Scale: { value: vec(3.6, 0.12, 2.4) }, Rotation: { euler: vec(0, yaw, 0.08) }, Renderable: { mesh: 0, material: 0, visible: true }, Material: material(pick(["#c4553a", "#3f7f74", "#d8b04a"]), { roughness: 0.95 }) });
  for (const [px, pz] of [[-1.6, -1.1], [1.6, -1.1], [-1.6, 1.1], [1.6, 1.1]] as const)
    add("Canopy Pole", [x + px * Math.cos(yaw) + pz * Math.sin(yaw), 1.3, z - px * Math.sin(yaw) + pz * Math.cos(yaw)], { Scale: { value: vec(0.1, 2.6, 0.1) }, Renderable: { mesh: 0, material: 0, visible: true }, Material: material("#4a3a2a") });
  model("Market Crate", pick([146, 147]), [x + 1.6 * Math.cos(yaw + 1.2), 0, z - 1.6 * Math.sin(yaw + 1.2)], [0.6, 0.6, 0.6], yaw);
}
function civicHall(x: number, z: number, radius: number, name: string) {
  box(name, [x, 0.25, z], [radius * 2, 0.5, radius * 2], "#b7a682", solid(), { roughness: 0.9 });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    model("Column", pick([141, 142]), [x + Math.cos(a) * radius * 0.85, 0.5, z + Math.sin(a) * radius * 0.85], [1.4, 1.6, 1.4], -a, solid());
  }
  box(`${name} Roof`, [x, 7.2, z], [radius * 1.9, 0.6, radius * 1.9], "#5a6f6a", {}, { roughness: 0.6 });
}
function floodwall(x0: number, z0: number, x1: number, z1: number) {
  const length = Math.hypot(x1 - x0, z1 - z0);
  const yaw = Math.atan2(x1 - x0, z1 - z0);
  add("Floodwall", [(x0 + x1) / 2, 1.2, (z0 + z1) / 2], { Scale: { value: vec(1.2, 2.4, length) }, Rotation: { euler: vec(0, yaw, 0) }, Renderable: { mesh: 0, material: 0, visible: true }, Material: material("#8e8676", { roughness: 0.95 }), ...solid() });
}
// Canal water: dark and reflective, never tropical blue (the visual bible).
function canal(x: number, z: number, w: number, d: number, yaw = 0) {
  add("Canal", [x, 0.06, z], { Scale: { value: vec(w, 0.1, d) }, Rotation: { euler: vec(0, yaw, 0) }, Renderable: { mesh: 0, material: 0, visible: true }, Material: material("#1c2a2c", { roughness: 0.08, metalness: 0.35 }) });
}

// ------------------------------------------------------- people and life --
const TINTS = ["#c9a46a", "#b9805a", "#6f9a95", "#d8c8a2", "#8a6f5a", "#9a7aa8", "#5f7f9a"];
const ACCESSORY: Record<string, [string, V3, V3]> = {
  satchel: ["#6a4a30", [0.55, 0.05, 0], [0.35, 0.18, 0.5]],
  hood: ["#3f5f6a", [0, 0.44, 0], [1.1, 0.12, 1.1]],
  staff: ["#4a3a2a", [0.75, 0.05, 0.3], [0.08, 1.05, 0.08]],
  sash: ["#c4553a", [0, 0.12, 0], [1.05, 0.06, 1.05]],
};
const accessoryFor = (role: string) =>
  /historian|archivist|scholar|student|astronomer|keeper/.test(role) ? "satchel" : /dock|surveyor|operator|pilot/.test(role) ? "sash" : /fisher|boat|reed|engineer/.test(role) ? "staff" : "hood";
// A Talari: narrow-torsoed, layered clothing tints, an accessory for the job,
// walking a daily routine between home, work and the market.
function talari(name: string, at: [number, number], stops: string, role: string) {
  const index = add(name, [at[0], 0.9, at[1]], {
    Scale: { value: vec(0.5, 1.85, 0.5) },
    Renderable: { mesh: 132, material: 0, visible: true },
    Material: material(pick(TINTS), { roughness: 0.85 }),
    AIState: { state: "Walking" },
    Pedestrian: { archetype: 1 },
    Routine: { stops, speed: 1.3 + random() * 0.4 },
  });
  const [hex, offset, size] = ACCESSORY[accessoryFor(role)]!;
  add(`${name} ${accessoryFor(role)}`, offset, { Scale: { value: vec(...size) }, Renderable: { mesh: 0, material: 0, visible: true }, Material: material(hex) }, index);
  return index;
}
// Routine stops in a frame: scholars work two shifts; others work then shop.
function routine(role: string, home: [number, number], work: [number, number], market: [number, number], to: (e: number, n: number) => [number, number]) {
  const p = (q: [number, number]) => to(q[0], q[1]).map((v) => v.toFixed(1)).join(" ");
  const scholar = /historian|astronomer|archivist|student|scholar|dock|surveyor|operator/.test(role);
  return scholar ? `0 ${p(home)}; 6 ${p(work)}; 15 ${p(market)}; 19 ${p(home)}` : `0 ${p(home)}; 6 ${p(work)}; 12 ${p(market)}; 18 ${p(home)}`;
}
// Wildlife prefabs (released by the director on other worlds) and herds.
const FAUNA: Record<string, { mesh: number; scale: V3; species: string; name: string; tint?: string }> = {
  Grazer: { mesh: 135, scale: [0.7, 1.6, 1.8], species: "te_graze", name: "Flat Grazer" },
  Skimmer: { mesh: 108, scale: [1.2, 0.8, 1.2], species: "te_skim", name: "Ridge Skimmer", tint: "#5b6f8a" },
  Crawler: { mesh: 116, scale: [1.1, 0.8, 1.6], species: "ci_crawl", name: "Slag Crawler", tint: "#3a2018" },
  Husk: { mesh: 136, scale: [0.9, 1.3, 1.5], species: "os_husk", name: "Dust Husk", tint: "#6f6555" },
  Drifter: { mesh: 114, scale: [3.2, 1.6, 3.2], species: "ho_drift", name: "Mist Drifter", tint: "#3a6f8f" },
};
for (const [prefab, f] of Object.entries(FAUNA))
  prefabs[prefab] = {
    components: {
      Scale: { value: vec(...f.scale) },
      Renderable: { mesh: f.mesh, material: 0, visible: true },
      ...(f.tint ? { Material: material(f.tint, { roughness: 0.85 }) } : {}),
      Scannable: { id: f.species, name: f.name, kind: "Fauna", range: 16 },
      AIState: { state: "Walking" },
      Pedestrian: { archetype: 2 },
      Wildlife: { wary: 44, flee: 16, speed: prefab === "Husk" ? 2.5 : 7, leash: 90 },
    } as never,
  };
function herd(prefab: string, x: number, z: number, count: number) {
  const f = FAUNA[prefab]!;
  for (let i = 0; i < count; i++) {
    const a = random() * Math.PI * 2, r = 3 + random() * 7;
    add(f.name, [x + Math.cos(a) * r, 0.8, z + Math.sin(a) * r], {
      ...(prefabs[prefab]!.components as Components),
      Wildlife: { wary: 44, flee: 16, speed: 7, leash: 80 },
    });
  }
}

// ----------------------------------------------------------- Kestra Station --
box("Landing Pad", [0, PAD_TOP / 2, 0], [28, PAD_TOP, 28], "#3d4248", solid(), { roughness: 0.7, metalness: 0.3 });
for (const [x, z, sx, sz] of [
  [0, 13.2, 26, 0.5],
  [0, -13.2, 26, 0.5],
  [13.2, 0, 0.5, 26],
  [-13.2, 0, 0.5, 26],
] as const)
  box("Pad Light", [x, PAD_TOP + 0.03, z], [sx, 0.06, sz], "#e8b62a", {}, { emissive: rgb("#e8a52a"), emissiveIntensity: 1.6 });
box("Station Hangar", [-44, 4.5, -8], [18, 9, 24], "#a7adb3", solid(), { roughness: 0.55, metalness: 0.45 });
box("Hangar Roof", [-44, 9.3, -8], [19.5, 0.6, 25.5], "#6d747c", {}, { roughness: 0.5, metalness: 0.5 });
box("Hangar Door", [-34.9, 3.8, -8], [0.3, 7.2, 12], "#2e3338", {}, { roughness: 0.6, metalness: 0.4 });
box("Hangar Light", [-34.7, 7.8, -8], [0.2, 0.3, 12.4], "#ffe6b0", {}, { emissive: rgb("#ffd890"), emissiveIntensity: 2 });
// The workshop: repairs and trade (E at the bench).
box("Kestra Workshop", [-30, 0.6, 26], [5, 1.2, 2], "#5a4a3a", { ...solid(), Scannable: { id: "station:workshop", name: "Kestra Workshop", kind: "Culture", range: 4 } }, { roughness: 0.8 });
model("Workshop Shelf", 155, [-33, 0, 28], [1, 1, 1], 0, solid());
model("Workshop Crate", 145, [-27, 0, 28.5], [0.7, 0.7, 0.7], 0.4, solid());
light("Workshop Lamp", [-30, 3.5, 26], "#ffcf8a", 3, 12);
for (const [x, z] of [
  [-18, -18],
  [18, -18],
  [-18, 18],
  [18, 18],
] as const)
  add("Pad Lamp", [x, 0, z], { Scale: { value: vec(0.6, 6.5, 2.2) }, Renderable: { mesh: 35, material: 0, visible: true }, Rotation: { euler: vec(0, Math.atan2(-x, -z), 0) } });
add("Antenna Mast", [-58, 0, 20], { Scale: { value: vec(1.2, 11, 1.2) }, Renderable: { mesh: 36, material: 0, visible: true } });
box("Fuel Tank", [-24, 2, -30], [6, 4, 6], "#7a8086", solid(), { roughness: 0.5, metalness: 0.5 });
box("Fuel Tank", [-16, 1.5, -32], [4, 3, 4], "#7a8086", solid(), { roughness: 0.5, metalness: 0.5 });
// A visiting freighter on the field's far apron (Quaternius Dispatcher).
model("Visiting Freighter", 166, [-62, 0, -44], [1.6, 1.6, 1.6], 0.7);

// ---------------------------------------------------- Kestra Reach (home) --
const [KX, KZ] = [190, 40];
civicHall(KX, KZ, 10, "Concord Hall");
for (let i = 0; i < 18; i++) {
  const a = (i / 18) * Math.PI * 2 + 0.1;
  const r = 30 + (i % 3) * 12;
  terrace(KX + Math.cos(a) * r, KZ + Math.sin(a) * r, -a + Math.PI / 2);
}
canal(KX + 70, KZ, 8, 180);
floodwall(KX + 64, KZ - 90, KX + 64, KZ + 90);
floodwall(KX + 76, KZ - 90, KX + 76, KZ + 90);
const [MX, MZ] = kestra(110, -80);
for (let i = 0; i < 6; i++) stall(MX + (i % 3) * 6 - 6, MZ + Math.floor(i / 3) * 6 - 3, (i % 2) * Math.PI);
box("Reed Market Bench", [MX + 10, 0.6, MZ], [2.4, 1.2, 1.2], "#6a5a3a", { ...solid(), Scannable: { id: "station:market", name: "Reed Market Exchange", kind: "Culture", range: 4 } });
// Meridian House: a research annex with an interior and a warm vestibule.
const [HX, HZ] = kestra(520, 340);
box("Meridian House Floor", [HX, 0.15, HZ], [18, 0.3, 14], "#4a4f55", solid(), { roughness: 0.6 });
for (const [dx, dz, yaw] of [
  [-6, -7, 0],
  [0, -7, 0],
  [6, -7, 0],
  [-6, 7, Math.PI],
  [6, 7, Math.PI],
  [-9, -3, Math.PI / 2],
  [-9, 3, Math.PI / 2],
  [9, -3, -Math.PI / 2],
  [9, 3, -Math.PI / 2],
] as const)
  model("Annex Wall", dz === 7 || dx === 9 ? 163 : 162, [HX + dx, 0.3, HZ + dz], [1.5, 1.5, 1.5], yaw, solid());
model("Annex Door", 149, [HX, 0.3, HZ + 7], [1.5, 1.5, 1.5], Math.PI);
box("Annex Roof", [HX, 6.4, HZ], [19, 0.4, 15], "#5a6f7a");
box("Vestibule Glow", [HX, 2.4, HZ + 7.6], [3.4, 0.25, 0.6], "#ffcf8a", {}, { emissive: rgb("#ffb860"), emissiveIntensity: 2 });
light("Annex Light", [HX, 4.5, HZ], "#ffdcaa", 3, 16);
light("Vestibule Light", [HX, 3, HZ + 8.5], "#ffb860", 2.4, 8);
model("Archive Computer", 143, [HX - 5, 0.3, HZ - 4.5], [1, 1, 1], 0, solid());
model("Archive Terminal", 144, [HX + 5, 0.3, HZ - 4.5], [1, 1, 1], 0, solid());
model("Archive Shelf", 155, [HX - 7.5, 0.3, HZ + 2], [1, 1, 1], Math.PI / 2, solid());
model("Archive Shelf", 155, [HX + 7.5, 0.3, HZ + 2], [1, 1, 1], -Math.PI / 2, solid());
model("Array Model", 158, [HX, 0.3, HZ - 1], [1.2, 1.2, 1.2], 0);
box("Archive Desk", [HX + 2, 0.7, HZ + 3], [2.2, 1.4, 1], "#5a4a3a", { ...solid(), Scannable: { id: "station:archive", name: "Bilingual Archive", kind: "Culture", range: 4 } });
// Old Vey Gate: River Kingdom masonry around the Black Foundation.
const [VX, VZ] = kestra(-1020, -580);
box("Ruin Core", [VX, 4.5, VZ], [2.2, 9, 2.2], "#2c2a28", { ...solid(), Scannable: { id: "te_gate_layer", name: "Vey Gate Foundation", kind: "Culture", range: 8 } }, { emissive: rgb("#3fd8c8"), emissiveIntensity: 0.08, roughness: 0.6, metalness: 0.5 });
for (let i = 0; i < 7; i++) {
  const a = (i / 7) * Math.PI * 2 + 0.3;
  const h = 2.5 + random() * 4;
  box("Gate Pillar", [VX + Math.cos(a) * 14, h / 2, VZ + Math.sin(a) * 14], [1.4, h, 1.4], "#3a3530", solid(), { roughness: 0.95 });
}
for (let i = 0; i < 5; i++) {
  const a = random() * Math.PI * 2;
  box("Masonry", [VX + Math.cos(a) * 24, 0.6, VZ + Math.sin(a) * 24], [5 + random() * 3, 1.2, 1.2], "#6a6052", solid(), { roughness: 0.95 });
}
const ruinRocks: string[] = [];
for (let i = 0; i < 16; i++) {
  const a = random() * Math.PI * 2, r = 8 + random() * 16;
  ruinRocks.push(`${pick([42, 43, 44])} ${(VX + Math.cos(a) * r).toFixed(1)} ${(VZ + Math.sin(a) * r).toFixed(1)} ${Math.floor(random() * 360)} ${(0.6 + random() * 0.8).toFixed(2)}`);
}
add("Ruin Stones", [0, 0, 0], { ModelInstances: { instances: ruinRocks.join("\n") } });

// ---------------------------------------------------- evidence everywhere --
const siteCentre: Record<string, [number, number]> = { kestra: [KX, KZ], old_vey: [VX, VZ], meridian_house: [HX, HZ] };
const evidenceAt = (row: (typeof EVIDENCE)[number]): V3 => {
  const [, site, , , , , , , , east, north] = row;
  const home = siteCentre[site];
  if (home) return [home[0] + east * 0.6, 1, home[1] - north * 0.6];
  return [east * 0.6, 1, -north * 0.6];
};
const evidenceEntity = (row: (typeof EVIDENCE)[number]) => {
  const [id, , name, , , , , , movable] = row;
  if (id === "te_gate_layer") return; // the Ruin Core above
  const [x, , z] = evidenceAt(row);
  if (movable) box(name, [x, 0.4, z], [0.6, 0.8, 0.3], "#c9a24a", { Scannable: { id, name, kind: "Culture", range: 5 } }, { metalness: 0.7, roughness: 0.35 });
  else box(name, [x, 1.3, z], [2.6, 2.6, 0.7], pick(["#9a8f80", "#7d7466", "#6f9a95", "#8a8070"]), { ...solid(), Scannable: { id, name, kind: "Culture", range: 6 } }, { roughness: 0.9 });
};
for (const row of EVIDENCE) if (siteCentre[row[1]]) evidenceEntity(row);

// Kestra's people (16 named Talari) and a few passers-by.
for (const n of NPCS.filter((n) => n.site === "kestra"))
  talari(n.name, kestra(...n.home), routine(n.role, n.home, n.work, n.market, kestra), n.role);
for (let i = 0; i < 5; i++) {
  const a = random() * Math.PI * 2;
  add("Talari", [KX + Math.cos(a) * 14, 0.9, KZ + Math.sin(a) * 14], { Scale: { value: vec(0.5, 1.85, 0.5) }, Renderable: { mesh: 132, material: 0, visible: true }, Material: material(pick(TINTS), { roughness: 0.85 }), AIState: { state: "Walking" }, Pedestrian: { archetype: 0 } });
}

// ------------------------------------------------------------ volatile ice --
const ICE: V3[] = [
  [95, 0, -70],
  [-110, 0, 95],
  [60, 0, 140],
  [-160, 0, -120],
];
ICE.forEach((p, i) =>
  box(`Volatile Ice ${i + 1}`, [p[0], 0.9, p[2]], [1.1, 1.8, 1.1], "#bfe8ff", { Scannable: { id: `ice:${i + 1}`, name: "Volatile Ice", kind: "Mineral", range: 5 } }, { emissive: rgb("#6fc8ff"), emissiveIntensity: 1.4, roughness: 0.2, metalness: 0.1 }),
);

// ------------------------------------------------------------ wilderness --
const trees: string[] = [];
const rocks: string[] = [];
const keep = [[0, 0, 60], [KX, KZ, 80], [VX, VZ, 34], [HX, HZ, 20], [MX, MZ, 18]];
const clear = (x: number, z: number) => keep.some(([cx, cz, r]) => Math.hypot(x - cx!, z - cz!) < r!) || ICE.some((p) => Math.hypot(x - p[0], z - p[2]) < 8) || Math.abs(x - KX - 70) < 12;
for (let i = 0; i < 520; i++) {
  const a = random() * Math.PI * 2, r = 50 + Math.sqrt(random()) * 950;
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  if (clear(x, z)) continue;
  if (random() < 0.78) trees.push(`${pick([49, 50, 46, 47, 48])} ${x.toFixed(1)} ${z.toFixed(1)} ${Math.floor(random() * 360)} ${(0.8 + random() * 0.6).toFixed(2)}`);
  else rocks.push(`${pick([42, 43])} ${x.toFixed(1)} ${z.toFixed(1)} ${Math.floor(random() * 360)} ${(0.7 + random() * 1.4).toFixed(2)}`);
}
add("Forest", [0, 0, 0], { ModelInstances: { instances: trees.join("\n") } });
add("Boulders", [0, 0, 0], { ModelInstances: { instances: rocks.join("\n") } });
herd("Grazer", 140, -140, 5);
herd("Grazer", -150, 160, 4);
herd("Skimmer", 260, 220, 2);

// --------------------------------------------------------- the other sites --
function site(id: string, build: () => void) {
  const row = SITES.find((s) => s.id === id)!;
  siteParent = add(row.name, [0, 0, 0], { Site: { name: row.name, body: row.body, latitude: row.lat!, longitude: row.lon!, radius: row.radius! } }, undefined);
  build();
  // Its evidence and people.
  for (const ev of EVIDENCE.filter((e) => e[1] === id)) evidenceEntity(ev);
  for (const n of NPCS.filter((n) => n.site === id))
    talari(n.name, [n.home[0] * 0.6, -n.home[1] * 0.6], routine(n.role, n.home, n.work, n.market, (e, nn) => [e * 0.6, -nn * 0.6]), n.role);
  siteParent = undefined;
}
// A landing field: a pad with lit edges (landing elsewhere is an offence).
function field(x: number, z: number) {
  box("Landing Field", [x, 0.2, z], [30, 0.4, 30], "#3d4248", solid(), { roughness: 0.7 });
  for (const [dx, dz, sx, sz] of [[0, 14, 28, 0.4], [0, -14, 28, 0.4], [14, 0, 0.4, 28], [-14, 0, 0.4, 28]] as const)
    box("Field Light", [x + dx, 0.43, z + dz], [sx, 0.06, sz], "#e8b62a", {}, { emissive: rgb("#e8a52a"), emissiveIntensity: 1.6 });
}
site("darsa_delta", () => {
  field(-216, -90);
  for (let i = 0; i < 4; i++) canal(-60 + i * 40, 0, 6, 220);
  for (let i = 0; i < 16; i++) terrace(-80 + (i % 4) * 40 + 15, -90 + Math.floor(i / 4) * 55, (i % 2) * Math.PI, 1);
  civicHall(40, 40, 9, "Darsa Water Court");
  floodwall(-100, 120, 120, 120);
  stall(20, -40, 0);
  stall(30, -40, 0);
});
site("meridian_spur", () => {
  field(252, 54);
  civicHall(0, -60, 12, "Spur Observatory");
  for (let i = 0; i < 3; i++) {
    box("Observatory Drum", [-40 + i * 40, 3, -120], [8, 6, 8], "#c7c9c2", solid(), { roughness: 0.5 });
    box("Telescope", [-40 + i * 40, 7, -120], [1.2, 1.2, 6], "#6a7078", {}, { metalness: 0.6 });
  }
  for (let i = 0; i < 12; i++) terrace(-100 + (i % 6) * 40, 40 + Math.floor(i / 6) * 40, Math.PI, 2);
  model("Instrument Bench", 143, [70, 0, 70], [1, 1, 1], 0, solid());
});
site("ossuary_archive", () => {
  // Collapsed archive halls: broken walls, chalk columns, dust.
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    box("Archive Wall", [Math.cos(a) * 60, 1 + (i % 3), Math.sin(a) * 60], [14, 2 + (i % 3) * 2, 2], "#8a8274", solid(), { roughness: 0.95 });
  }
  for (let i = 0; i < 8; i++) model("Archive Column", 141, [-30 + (i % 4) * 20, 0, -20 + Math.floor(i / 4) * 40], [1.6, 2, 1.6], 0, solid());
  model("Sealed Vault", 145, [0, 0, 0], [2, 2, 2], 0.3, solid());
});
site("ossuary_transit", () => {
  // The causeway: a raised road pointing away from the basin, with markers.
  box("Causeway", [0, 0.6, 0], [10, 1.2, 320], "#8e8676", solid(), { roughness: 0.95 });
  for (let i = 0; i < 8; i++) box("Retreat Marker", [7, 2, -140 + i * 40], [1, 4 - i * 0.3, 1], "#6a6052", solid());
  model("Transit Pod", 153, [-12, 0, 30], [1.5, 1.5, 1.5], 1.2, solid());
});
site("hollow_enclave", () => {
  // Buoyant towers with glowing bulbs, held by acoustic anchors.
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2, r = 70 + (i % 2) * 40;
    box("Buoyant Tower", [Math.cos(a) * r, 18, Math.sin(a) * r], [3, 36, 3], "#234a5e", solid(), { roughness: 0.4, metalness: 0.4 });
    box("Tower Bulb", [Math.cos(a) * r, 38, Math.sin(a) * r], [6, 5, 6], "#50f2ff", {}, { emissive: rgb("#50f2ff"), emissiveIntensity: 1.5 });
  }
  model("Mooring Anchor", 159, [0, 0, 0], [2, 2, 2], 0, solid());
  // The Resonance Exchange.
  box("Resonance Exchange", [216, 3, -114], [16, 6, 12], "#2c5f8f", solid(), { emissive: rgb("#2a7fff"), emissiveIntensity: 0.2 });
  for (const c of CLADES)
    box(c.name, [c.at[0] * 0.6, 2.2, -c.at[1] * 0.6], [1.2, 4.4, 1.2], "#3a6f8f", { ...solid(), Scannable: { id: `clade:${c.id}`, name: c.name, kind: "Culture", range: 5 } }, { emissive: rgb("#7fe6ff"), emissiveIntensity: 0.8 });
});

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
const siteTable = Object.fromEntries(
  SITES.map((s) => [s.id, { name: s.name, body: s.body, kind: s.kind, desc: s.desc, x: s.home?.[0] ?? 0, z: s.home?.[1] ?? 0, home: !!s.home, lat: s.lat ?? SITE.latitude, lon: s.lon ?? SITE.longitude, public: !!s.public }]),
);
const config = [
  `local ICE = ${lua(ICE.map((p, i) => ({ name: `Volatile Ice ${i + 1}`, x: p[0], z: p[2] })))}`,
  `local SITE = ${lua(SITE)}`,
  `local START_FUEL = 45`,
  `local BODY_INFO = ${lua(BODY_INFO)}`,
  `local SPECIES = ${lua(Object.fromEntries(SPECIES.map(([id, body, cls, , , , name, rp, yieldOf, amount, text]) => [id, { name, body, cls, rp, yield: yieldOf, y: amount, text }])))}`,
  `local LANDMARKS = ${lua(Object.fromEntries(LANDMARKS.map(([body, lat, lon, , name, frag, kind, rp, text]) => [`landmark:${name}`, { name, body, lat, lon, frag, kind, rp, text }])))}`,
  `local UPGRADES = ${lua(UPGRADES)}`,
  `local SITES = ${lua(siteTable)}`,
  `local EVIDENCE = ${lua(Object.fromEntries(EVIDENCE.map(([id, siteId, name, era, lang, gain, rp, prot, movable, , , text]) => { const [x, , z] = evidenceAt(EVIDENCE.find((e) => e[0] === id)!); return [id, { site: siteId, name, era, lang, gain, rp, protected: prot, movable, text, x, z }]; })))}`,
  `local INVESTIGATIONS = ${lua(INVESTIGATIONS)}`,
  `local NPCS = ${lua(NPCS.map(({ id, name, role, inst, site, line }) => ({ id, name, role, inst, site, line })))}`,
  `local CLADES = ${lua(CLADES.map(({ id, name, role, inst, line }) => ({ id, name, role, inst, line })))}`,
  `local ACADEMY = ${lua(ACADEMY)}`,
  `local STATIONS = ${lua({ workshop: { x: -30, z: 26, name: "Kestra Workshop" }, market: { x: MX + 10, z: MZ, name: "Reed Market Exchange" }, archive: { x: HX + 2, z: HZ + 3, name: "Bilingual Archive" } })}`,
  `local FAUNA = ${lua({ Tethys: ["Grazer", "Skimmer"], Cinder: ["Crawler"], Ossuary: ["Husk"], Hollow: ["Drifter"] })}`,
].join("\n");
add("Director", [0, 60, 0], {
  Script: { source: readFileSync(join(here, "lua/director.lua"), "utf8").replace("\n{{CONFIG}}\n", `\n${config}\n`), props: {} },
});

// --------------------------------------------------------------------- UI --
const ui = (name: string, value: Record<string, unknown>) => add(name, [0, 0, 0], { UI: component("UI", value) });
const WHITE = rgb("#eef4f6"),
  DARK = rgb("#081018"),
  CYAN = rgb("#8ff7ff"),
  AMBER = rgb("#ffd36e"),
  RED = rgb("#ff7a6a"),
  VIOLET = rgb("#c9a6ff"),
  GREEN = rgb("#9be37a");
const text = (name: string, value: string, anchor: string, offsetX: number, offsetY: number, fontSize: number, color = WHITE, opacity = 1, width = 0) =>
  ui(name, { kind: "Text", text: value, anchor, offsetX, offsetY, fontSize, color, opacity, width });
const bar = (name: string, offsetY: number, color: string) =>
  ui(name, { kind: "Bar", text: "", anchor: "top-right", offsetX: -24, offsetY, width: 180, height: 6, color: rgb(color), opacity: 0.9, value: 1 });
text("Objective", "", "top-left", 24, 22, 17, WHITE);
text("Detail", "", "top-left", 24, 48, 13, WHITE, 0.85, 460);
for (const [name, color] of [["Banner", CYAN], ["BannerGood", GREEN], ["BannerWarn", AMBER], ["BannerBad", RED], ["BannerAnomaly", VIOLET]] as const) text(name, "", "top-center", 0, 190, 24, color);
text("Hint", "", "bottom-center", 0, -64, 15, WHITE, 0.9);
text("Prompt", "", "bottom-center", 0, -96, 16, AMBER);
// Expedition and suit, top right.
text("Research", "", "top-right", -24, 84, 15, AMBER);
text("Language", "", "top-right", -24, 104, 13, WHITE, 0.8);
text("Resources", "", "top-right", -24, 122, 13, CYAN, 0.9);
text("O2Label", "", "top-right", -24, 142, 12, WHITE, 0.85);
bar("O2Bar", 158, "#7fd1ff");
text("SuitLabel", "", "top-right", -24, 168, 12, WHITE, 0.85);
bar("SuitBar", 184, "#ffd36e");
text("VitalsLabel", "", "top-right", -24, 194, 12, WHITE, 0.85);
bar("VitalsBar", 210, "#9be37a");
text("ReturnLabel", "", "top-right", -24, 220, 12, WHITE, 0.85);
text("ShipStatus", "", "top-right", -24, 238, 12, WHITE, 0.75);
// Talking: a speaker's name, role and words (translated as far as you can).
ui("TalkPanel", { kind: "Panel", text: "", anchor: "bottom-center", offsetY: -110, width: 660, height: 120, color: DARK, opacity: 0.85 });
text("TalkName", "", "bottom-center", 0, -196, 16, AMBER);
text("TalkLine", "", "bottom-center", 0, -168, 14, WHITE, 0.95, 620);
// One general panel for every menu: journal, upgrades, ship services,
// culture record, system board, academy, controls, choices.
ui("MenuPanel", { kind: "Panel", text: "", anchor: "center", width: 640, height: 500, color: DARK, opacity: 0.9 });
text("MenuTitle", "", "center", 0, -228, 17, AMBER);
ui("MenuBody", { kind: "Text", text: "", anchor: "center", offsetX: 0, offsetY: -55, fontSize: 13, color: WHITE, opacity: 0.95, width: 590, height: 290 });
for (let i = 1; i <= 6; i++)
  ui(`MenuBtn${i}`, { kind: "Button", text: "", action: "script", anchor: "center", offsetX: i % 2 ? -152 : 152, offsetY: 108 + Math.floor((i - 1) / 2) * 40, width: 296, height: 34, fontSize: 12, color: rgb("#1f4f5a"), opacity: 1 });
ui("MenuClose", { kind: "Button", text: "CLOSE  (Esc)", action: "script", anchor: "center", offsetY: 228, width: 200, height: 30, fontSize: 12, color: rgb("#4c5560"), opacity: 1 });
// Title.
ui("TitlePanel", { kind: "Panel", text: "", anchor: "center", width: 660, height: 420, color: DARK, opacity: 0.88 });
text("Title", "PALE SIGNAL", "center", 0, -140, 58, CYAN);
text("TitleSub", "Survey the six worlds of Aster, meet the Talari, gather fuel and follow the signal to its source.", "center", 0, -82, 15, WHITE, 0.9, 600);
ui("Begin", { kind: "Button", text: "BEGIN", action: "script", anchor: "center", offsetY: -20, width: 240, height: 48, fontSize: 19, color: rgb("#1f6f7a"), opacity: 1 });
ui("NewGame", { kind: "Button", text: "NEW EXPEDITION", action: "script", anchor: "center", offsetY: 38, width: 240, height: 36, fontSize: 13, color: rgb("#4c5560"), opacity: 1 });
text("Controls", "On foot: WASD · mouse look · E interact · hold F scan (look up to sample air) · H helmet · R prospect", "center", 0, 90, 12, WHITE, 0.75);
text("Controls2", "Flight: W/S throttle · Shift full · X cut · arrows/IJKL pitch & yaw · Q/E roll · Space/C lift · T assist · N NAV · G autopilot", "center", 0, 110, 12, WHITE, 0.75);
text("Controls3", "J journal · U upgrades · I ship · Y culture · TAB system board · M map · B reserve · F1 controls · F2 academy · F10 settings", "center", 0, 130, 12, WHITE, 0.75);
// Ending.
ui("EndPanel", { kind: "Panel", text: "", anchor: "center", width: 640, height: 320, color: DARK, opacity: 0.92 });
text("EndTitle", "", "center", 0, -110, 32, VIOLET);
text("EndText", "", "center", 0, -60, 14, WHITE, 1, 580);
ui("Again", { kind: "Button", text: "PLAY AGAIN", action: "restart", anchor: "center", offsetY: 110, width: 220, height: 44, fontSize: 16, color: rgb("#1f6f7a"), opacity: 1 });
ui("PausePanel", { kind: "Panel", text: "", anchor: "center", visibleWhen: "pause", width: 300, height: 230, color: DARK, opacity: 0.85 });
ui("Resume", { kind: "Button", text: "Resume", action: "resume", anchor: "center", visibleWhen: "pause", offsetY: -50, width: 200, height: 40, color: rgb("#1f6f7a"), opacity: 1 });
ui("SettingsBtn", { kind: "Button", text: "Settings", action: "script", anchor: "center", visibleWhen: "pause", offsetY: 0, width: 200, height: 40, color: rgb("#3f5f6a"), opacity: 1 });
ui("Restart", { kind: "Button", text: "Restart", action: "restart", anchor: "center", visibleWhen: "pause", offsetY: 50, width: 200, height: 40, color: rgb("#4c5560"), opacity: 1 });

// Logic, light and UI entities aren't drawn.
for (const entity of entities) {
  const c = entity.components as Components;
  if (!c.Renderable && !c.Player && !c.ModelInstances) c.Renderable = { mesh: 0, material: 0, visible: false };
}
const document = { format: 1, name: "Pale Signal", prefabs, entities } as SceneDocument;
validateSceneDocument(document);
const out = process.env.PS_OUT ?? join(here, "../../examples/space/pale-signal.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(document, null, 1) + "\n");
console.log(`wrote ${out}: ${entities.length} entities, ${trees.length} trees, ${rocks.length} boulders`);
