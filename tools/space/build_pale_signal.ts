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
const bodies = [
  "Tethys - 1600000 5027 0 0 60000 9 9000 1.05 320 3200 7 #4f7a4a #87b6c8",
  "Vell Tethys 230000 3850 20 7 18000 2.6 0 0 180 1800 3 #b9c6d4 #000000",
  "Cinder - 900000 2120 40 2 44000 7 0 0 500 2500 5 #b35a3c #000000",
  "Ossuary - 2400000 9230 126 -3 52000 6.4 5000 0.18 420 4000 11 #9a9385 #c0b49a",
].join("\n");
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
    landmarks: [`${SIGNAL.body} ${SIGNAL.latitude} ${SIGNAL.longitude} #8ff7ff Pale Signal`, `${SITE.body} ${SITE.latitude} ${SITE.longitude} #ffd36e Kestra Station`].join("\n"),
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
// The Kestrel: a hull the size of its collider, with wings, canopy, engine
// pods and gear as child boxes (children inherit the hull's scale, so their
// numbers are world sizes divided by it).
const HULL: V3 = [2.6, 2.2, 11];
const PAD_TOP = 0.4;
const ship = add("Ship", [0, PAD_TOP + 1.6, 0], {
  Spaceship: component("Spaceship", { fuel: 100 }),
  Rotation: { euler: vec(0, 0, 0) },
  Scale: { value: vec(...HULL) },
  Renderable: { mesh: 0, material: 0, visible: true },
  Material: material("#c9ccd1", { roughness: 0.45, metalness: 0.55 }),
  Collider: component("Collider"),
});
const part = (name: string, offset: V3, size: V3, hex: string, look: Record<string, unknown> = {}) =>
  add(
    name,
    [offset[0] / HULL[0], offset[1] / HULL[1], offset[2] / HULL[2]],
    {
      Scale: { value: vec(size[0] / HULL[0], size[1] / HULL[1], size[2] / HULL[2]) },
      Renderable: { mesh: 0, material: 0, visible: true },
      Material: material(hex, look),
    },
    ship,
  );
part("Canopy", [0, 1.15, 2.4], [1.7, 0.8, 2.8], "#1a2838", { roughness: 0.12, metalness: 0.8 });
part("Nose", [0, -0.15, 6.1], [1.8, 1.5, 1.4], "#b8bcc2", { roughness: 0.45, metalness: 0.55 });
part("Wings", [0, -0.35, -1.2], [10, 0.28, 3.6], "#8f959d", { roughness: 0.5, metalness: 0.5 });
part("Wing Stripe", [0, -0.19, -0.1], [9.2, 0.05, 0.5], "#e8b62a", { roughness: 0.6 });
for (const side of [-1, 1]) {
  part("Engine Pod", [side * 2.3, -0.1, -3.9], [1.25, 1.25, 3.4], "#4a4f57", { roughness: 0.5, metalness: 0.6 });
  part("Engine Glow", [side * 2.3, -0.1, -5.62], [0.95, 0.95, 0.06], "#9fdcff", { emissive: rgb("#5fc8ff"), emissiveIntensity: 3 });
  for (const end of [-1, 1]) part("Landing Leg", [side * 1.5, -1.45, end * 3.1], [0.22, 1.1, 0.22], "#3a3f45");
}
part("Tail Fin", [0, 1.75, -4.1], [0.22, 1.9, 2.2], "#8f959d", { roughness: 0.5, metalness: 0.5 });
part("Beacon", [0, 2.75, -4.6], [0.25, 0.25, 0.25], "#ff4040", { emissive: rgb("#ff3030"), emissiveIntensity: 4 });

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
for (let i = 0; i < 6; i++) {
  const a = random() * Math.PI * 2;
  add("Talari", [190 + Math.cos(a) * 12, 0.9, 40 + Math.sin(a) * 12], {
    Scale: { value: vec(0.6, 1.8, 0.6) },
    Renderable: { mesh: 132, material: 0, visible: true },
    Material: material(pick(TINTS), { roughness: 0.85 }),
    AIState: { state: "Walking" },
    Pedestrian: { archetype: 0 },
  });
}

// ------------------------------------------------------------ the Talari ruin --
// North of the station: a ring of fallen stone around a monolith carrying
// script older than the Talari's own -- the survey target.
const RUIN: V3 = [20, 0, -170];
box("Ruin Core", [RUIN[0], 4.5, RUIN[2]], [2.2, 9, 2.2], "#2c2a28", { Collider: component("Collider") }, { emissive: rgb("#3fd8c8"), emissiveIntensity: 0.35, roughness: 0.9 });
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
ICE.forEach((p, i) => box(`Volatile Ice ${i + 1}`, [p[0], 0.9, p[2]], [1.1, 1.8, 1.1], "#bfe8ff", {}, { emissive: rgb("#6fc8ff"), emissiveIntensity: 1.4, roughness: 0.2, metalness: 0.1 }));

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
text("Banner", "", "top-center", 0, 90, 28, CYAN);
text("Hint", "", "bottom-center", 0, -64, 15, WHITE, 0.9);
ui("ScanBar", { kind: "Bar", text: "", anchor: "center", offsetY: 60, width: 240, height: 8, color: CYAN, opacity: 0.9, value: 0 });
// Journal: J.
ui("JournalPanel", { kind: "Panel", text: "", anchor: "middle-right", offsetX: -20, width: 380, height: 420, color: DARK, opacity: 0.82 });
text("JournalTitle", "FIELD JOURNAL", "middle-right", -230, -180, 15, AMBER);
text("JournalText", "", "middle-right", -30, -150, 13, WHITE, 0.92);
// Title.
ui("TitlePanel", { kind: "Panel", text: "", anchor: "center", width: 640, height: 400, color: DARK, opacity: 0.88 });
text("Title", "PALE SIGNAL", "center", 0, -130, 58, CYAN);
text("TitleSub", "Engine slice: Tethys to Vell, surface to orbit, no loading screens.", "center", 0, -76, 16);
ui("Begin", { kind: "Button", text: "BEGIN", action: "script", anchor: "center", offsetY: -10, width: 220, height: 50, fontSize: 20, color: rgb("#1f6f7a"), opacity: 1 });
text("Controls", "On foot: WASD move · mouse look · E board/exit ship · F scan/collect · J journal", "center", 0, 62, 13, WHITE, 0.75);
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
