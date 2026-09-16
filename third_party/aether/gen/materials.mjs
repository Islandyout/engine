// Vendored from the user-supplied aether-complete.zip (MIT; see third_party/aether/LICENSE),
// tools/gen/materials.mjs, unmodified -- part of the procedural asset generator's dependency
// closure for tools/regenerate_npc_kit.mjs. See assets/CREDITS.md for provenance.

// materials.mjs — physically-plausible metallic-roughness values.
// Values are sRGB base colours with linear-ish albedo levels chosen to sit in
// the 0.03–0.85 range real surfaces occupy, so nothing blows out under IBL.

/** sRGB hex -> linear-ish float triple (approximate, gamma 2.2). */
export function srgb(hex) {
  const n = typeof hex === 'string' ? parseInt(hex.replace('#', ''), 16) : hex;
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  return c.map((v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
}

/** Base library. Each entry is a spec for GLB.material(). */
export const M = {
  // --- ground & structure ---
  asphalt:      { name: 'asphalt',      color: srgb('#33353a'), roughness: 0.92, metallic: 0 },
  asphaltWorn:  { name: 'asphalt_worn', color: srgb('#43464b'), roughness: 0.95, metallic: 0 },
  concrete:     { name: 'concrete',     color: srgb('#9c9a94'), roughness: 0.88, metallic: 0 },
  concreteDark: { name: 'concrete_dk',  color: srgb('#6f6e6a'), roughness: 0.9,  metallic: 0 },
  sidewalk:     { name: 'sidewalk',     color: srgb('#b3b0a8'), roughness: 0.85, metallic: 0 },
  kerb:         { name: 'kerb',         color: srgb('#c8c5bd'), roughness: 0.8,  metallic: 0 },
  paintWhite:   { name: 'road_white',   color: srgb('#e8e6df'), roughness: 0.6,  metallic: 0 },
  paintYellow:  { name: 'road_yellow',  color: srgb('#e5b23a'), roughness: 0.62, metallic: 0 },
  brick:        { name: 'brick',        color: srgb('#8d4a3a'), roughness: 0.9,  metallic: 0 },
  plaster:      { name: 'plaster',      color: srgb('#ded7c8'), roughness: 0.85, metallic: 0 },
  stucco:       { name: 'stucco',       color: srgb('#c9bfae'), roughness: 0.88, metallic: 0 },
  roofTile:     { name: 'roof_tile',    color: srgb('#7a3f34'), roughness: 0.85, metallic: 0 },
  roofMetal:    { name: 'roof_metal',   color: srgb('#57606b'), roughness: 0.42, metallic: 0.9 },
  woodPlank:    { name: 'wood',         color: srgb('#8a6642'), roughness: 0.75, metallic: 0 },

  // --- glazing ---
  glass:        { name: 'glass',        color: srgb('#8fb2c4'), roughness: 0.08, metallic: 0.0, alpha: 0.35 },
  glassDark:    { name: 'glass_dark',   color: srgb('#2d3a45'), roughness: 0.1,  metallic: 0.1, alpha: 0.55 },
  glassMirror:  { name: 'glass_mirror', color: srgb('#7d95a6'), roughness: 0.06, metallic: 0.85 },
  windowFrame:  { name: 'window_frame', color: srgb('#4a4f55'), roughness: 0.4,  metallic: 0.7 },
  // Cheap interior occluder: stops the camera seeing straight through a
  // building's glazing and out the far side, without modelling rooms.
  interior:     { name: 'interior',     color: srgb('#26282c'), roughness: 0.95, metallic: 0 },

  // --- metals ---
  steel:        { name: 'steel',        color: srgb('#a8adb3'), roughness: 0.35, metallic: 1 },
  steelDark:    { name: 'steel_dark',   color: srgb('#5a5f66'), roughness: 0.45, metallic: 1 },
  chrome:       { name: 'chrome',       color: srgb('#d6dade'), roughness: 0.08, metallic: 1 },
  galvanised:   { name: 'galvanised',   color: srgb('#9ba1a6'), roughness: 0.55, metallic: 1 },
  signPost:     { name: 'sign_post',    color: srgb('#9ea3a8'), roughness: 0.5,  metallic: 1 },

  // --- vehicle ---
  tyre:         { name: 'tyre',         color: srgb('#242427'), roughness: 0.95, metallic: 0 },
  rim:          { name: 'rim',          color: srgb('#c2c7cc'), roughness: 0.22, metallic: 1 },
  carGlass:     { name: 'car_glass',    color: srgb('#20303a'), roughness: 0.05, metallic: 0.1, alpha: 0.45 },
  plasticBlack: { name: 'plastic_black',color: srgb('#1e2023'), roughness: 0.55, metallic: 0 },
  plasticGrey:  { name: 'plastic_grey', color: srgb('#5b5f64'), roughness: 0.6,  metallic: 0 },

  // --- lights / emissive ---
  lampWarm:     { name: 'lamp_warm',    color: srgb('#fff0d0'), roughness: 0.3, metallic: 0, emissive: [1.0, 0.85, 0.6], emissiveStrength: 6 },
  lightRed:     { name: 'light_red',    color: srgb('#5a1010'), roughness: 0.3, metallic: 0, emissive: [1.0, 0.08, 0.05], emissiveStrength: 5 },
  lightAmber:   { name: 'light_amber',  color: srgb('#5a3a08'), roughness: 0.3, metallic: 0, emissive: [1.0, 0.55, 0.05], emissiveStrength: 5 },
  lightGreen:   { name: 'light_green',  color: srgb('#0b4a20'), roughness: 0.3, metallic: 0, emissive: [0.1, 1.0, 0.35], emissiveStrength: 5 },
  headlight:    { name: 'headlight',    color: srgb('#e8f0ff'), roughness: 0.1, metallic: 0, emissive: [0.9, 0.94, 1.0], emissiveStrength: 4 },
  tailLight:    { name: 'tail_light',   color: srgb('#8a0d0d'), roughness: 0.15, metallic: 0, emissive: [1.0, 0.06, 0.04], emissiveStrength: 3 },

  // --- signage faces ---
  signWhite:    { name: 'sign_white',   color: srgb('#f0efea'), roughness: 0.35, metallic: 0 },
  signRed:      { name: 'sign_red',     color: srgb('#c1121f'), roughness: 0.35, metallic: 0 },
  signBlue:     { name: 'sign_blue',    color: srgb('#0b4f9e'), roughness: 0.35, metallic: 0 },
  signGreen:    { name: 'sign_green',   color: srgb('#1a6b3c'), roughness: 0.35, metallic: 0 },
  signYellow:   { name: 'sign_yellow',  color: srgb('#f2c007'), roughness: 0.35, metallic: 0 },
  signBlack:    { name: 'sign_black',   color: srgb('#141414'), roughness: 0.4,  metallic: 0 },

  // --- nature ---
  foliage:      { name: 'foliage',      color: srgb('#3c6b32'), roughness: 0.85, metallic: 0, doubleSided: true },
  foliageDry:   { name: 'foliage_dry',  color: srgb('#6d7a3a'), roughness: 0.88, metallic: 0, doubleSided: true },
  bark:         { name: 'bark',         color: srgb('#4d3b2c'), roughness: 0.92, metallic: 0 },
  grass:        { name: 'grass',        color: srgb('#4a7a3d'), roughness: 0.9,  metallic: 0 },
  soil:         { name: 'soil',         color: srgb('#5a4634'), roughness: 0.95, metallic: 0 },

  // --- character ---
  hair:         { name: 'hair',         color: srgb('#2b1d16'), roughness: 0.5,  metallic: 0 },
  eyeWhite:     { name: 'eye_white',    color: srgb('#f2f2f0'), roughness: 0.15, metallic: 0 },
  eyeIris:      { name: 'eye_iris',     color: srgb('#4a3524'), roughness: 0.12, metallic: 0 },
  leather:      { name: 'leather',      color: srgb('#3a2b22'), roughness: 0.6,  metallic: 0 },
  denim:        { name: 'denim',        color: srgb('#3a4c66'), roughness: 0.9,  metallic: 0 },
  cotton:       { name: 'cotton',       color: srgb('#d9d5cc'), roughness: 0.92, metallic: 0 },
  hiVis:        { name: 'hi_vis',       color: srgb('#d8f321'), roughness: 0.8,  metallic: 0 },
};

/** Skin tones — a spread that reads correctly under a physical sky. */
export const SKIN = [
  '#f4d9c2', '#e8c39e', '#d9a878', '#c58f5f', '#a86f42',
  '#8a5533', '#6b3f26', '#4d2c1a', '#f0cdb2', '#c99a6d',
].map((h) => ({ name: 'skin', color: srgb(h), roughness: 0.62, metallic: 0 }));

/** Hair colours. */
export const HAIR = ['#0f0c0a', '#2b1d16', '#4a3226', '#6b4a2e', '#8a6a3a', '#b09060', '#8e8e92', '#d8d3c8', '#7a2f1e']
  .map((h) => ({ name: 'hair', color: srgb(h), roughness: 0.5, metallic: 0 }));

/** Clothing palette — muted, saturated and neutral options that mix well. */
export const CLOTH = ['#2f3b4a', '#5c6672', '#8a8f96', '#d9d5cc', '#3a4c66', '#6b3f4a',
  '#3d5c47', '#7a5c34', '#b04a3a', '#2a2a2e', '#e0dcd2', '#4a3f6b', '#c9a24a', '#1f4f4a']
  .map((h) => ({ name: 'cloth', color: srgb(h), roughness: 0.9, metallic: 0 }));

/** Automotive paint — clearcoat approximated with low roughness + slight metallic. */
export const CARPAINT = [
  '#b8bcc0', '#1b1d21', '#e8e9ea', '#8d1a1f', '#123a6b', '#1d5c3a',
  '#c9a227', '#5a5f66', '#2b3a55', '#7a2440', '#d6621a', '#3f6f8f',
  '#f0efe8', '#40454b', '#6d2f8f', '#0f6b6b',
].map((h) => ({ name: 'car_paint', color: srgb(h), roughness: 0.22, metallic: 0.35 }));

/** Facade colours for procedural buildings. */
export const FACADE = ['#ded7c8', '#c9bfae', '#b8ad9a', '#9c9a94', '#8d8578', '#cbbfae',
  '#a8b0ae', '#d6c7ae', '#7f8a8e', '#e2ded3', '#8d4a3a', '#6f6e6a']
  .map((h) => ({ name: 'facade', color: srgb(h), roughness: 0.87, metallic: 0 }));

/** Register a whole spec table on a GLB and return name -> index. */
export function registerAll(glb, table) {
  const out = {};
  for (const [k, v] of Object.entries(table)) out[k] = glb.material(v);
  return out;
}
