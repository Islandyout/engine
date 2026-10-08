// Time of day (GATEBREAKER M4, fx.time_of_day): the light of an outdoor
// scene at an hour 0-24 -- the sun (or the moon at night), the sky, the
// fog and the ambient fill -- from a few keyframes, blended linearly.
//
// Night is a high blue-violet moon and a lit haze, never murk: the ambient
// fill stays above 60% of the day's and the fog is a colour, not black, so
// a player can always see where they're going; streetlights and neon read
// against it instead of washing out.
import * as THREE from "three";

interface Key {
  h: number;
  elevation: number; // the light's elevation and azimuth, degrees
  azimuth: number;
  sun: string;
  sunIntensity: number;
  sky: string; // the hemisphere light's sky and ground colours
  ground: string;
  ambient: number;
  background: string;
  fog: string;
  fogDensity: number; // FogExp2
  exposure: number;
}

const night = {
  sun: "#b4b0ff",
  sunIntensity: 1.6,
  sky: "#a4a2f4",
  ground: "#3a3466",
  ambient: 1.6,
  background: "#22205a",
  fog: "#2c2a66",
  fogDensity: 0.0068,
  exposure: 1.22,
};
const day = {
  sun: "#fff3e2",
  sunIntensity: 2.3,
  sky: "#d6e6ff",
  ground: "#7a6e5e",
  ambient: 1.3,
  background: "#8ec0ec",
  fog: "#bcd5ee",
  fogDensity: 0.0042,
  exposure: 1.0,
};
// Wrapping: 24 is 0 again.
export const keys: Key[] = [
  { h: 0, elevation: 52, azimuth: 205, ...night },
  { h: 4.5, elevation: 44, azimuth: 150, ...night },
  // Dawn: a low peach sun in the east.
  {
    h: 5.75,
    elevation: 6,
    azimuth: 100,
    sun: "#ffb890",
    sunIntensity: 1.6,
    sky: "#d8b0d4",
    ground: "#4c4264",
    ambient: 1.5,
    background: "#d9a0b0",
    fog: "#c8a0b8",
    fogDensity: 0.006,
    exposure: 1.14,
  },
  { h: 7, elevation: 20, azimuth: 115, ...day, sun: "#ffe4c4", sunIntensity: 2.0, background: "#a6c8ec", exposure: 1.04 },
  { h: 13, elevation: 66, azimuth: 200, ...day },
  { h: 18.5, elevation: 24, azimuth: 275, ...day, sun: "#ffe0b4", sunIntensity: 2.1, background: "#9cc2ea", exposure: 1.04 },
  // Dusk: an orange sun going down in the west, a rose sky.
  {
    h: 20.75,
    elevation: 5,
    azimuth: 295,
    sun: "#ff9a5c",
    sunIntensity: 1.7,
    sky: "#dca4c0",
    ground: "#4a3c5c",
    ambient: 1.5,
    background: "#e0907c",
    fog: "#c48a94",
    fogDensity: 0.006,
    exposure: 1.12,
  },
  { h: 22, elevation: 40, azimuth: 245, ...night },
  { h: 24, elevation: 52, azimuth: 205, ...night },
];

export interface SkyState {
  direction: THREE.Vector3; // toward the sun or moon
  sun: THREE.Color;
  sunIntensity: number;
  sky: THREE.Color;
  ground: THREE.Color;
  ambient: number;
  background: THREE.Color;
  fog: THREE.Color;
  fogDensity: number;
  exposure: number;
}

export function createSkyState(): SkyState {
  return {
    direction: new THREE.Vector3(0, 1, 0),
    sun: new THREE.Color(),
    sunIntensity: 0,
    sky: new THREE.Color(),
    ground: new THREE.Color(),
    ambient: 0,
    background: new THREE.Color(),
    fog: new THREE.Color(),
    fogDensity: 0,
    exposure: 1,
  };
}

// Keyframe colours, converted once (authored as sRGB, like any picker).
const colorFields = ["sun", "sky", "ground", "background", "fog"] as const;
const linear = keys.map((k) => Object.fromEntries(colorFields.map((f) => [f, new THREE.Color(k[f])])) as Record<(typeof colorFields)[number], THREE.Color>);
const directions = keys.map((k) => {
  const e = THREE.MathUtils.degToRad(k.elevation);
  const a = THREE.MathUtils.degToRad(k.azimuth);
  return new THREE.Vector3(Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a));
});

// Fills `out` with the light at `hours` (any number; wrapped to 0-24).
// Allocates nothing.
export function skyAt(hours: number, out: SkyState): SkyState {
  const h = ((hours % 24) + 24) % 24;
  let i = 0;
  while (i < keys.length - 2 && h >= keys[i + 1]!.h) i++;
  const a = keys[i]!,
    b = keys[i + 1]!;
  const t = THREE.MathUtils.clamp((h - a.h) / (b.h - a.h), 0, 1);
  const mix = (x: number, y: number) => x + (y - x) * t;
  for (const f of colorFields) out[f].copy(linear[i]![f]).lerp(linear[i + 1]![f], t);
  out.direction.copy(directions[i]!).lerp(directions[i + 1]!, t).normalize();
  out.sunIntensity = mix(a.sunIntensity, b.sunIntensity);
  out.ambient = mix(a.ambient, b.ambient);
  out.fogDensity = mix(a.fogDensity, b.fogDensity);
  out.exposure = mix(a.exposure, b.exposure);
  return out;
}

