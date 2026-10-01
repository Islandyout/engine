// CPU particle simulation (0.57.0), independent of three.js so it can be
// unit tested. main.ts owns the GPU buffers and copies from this state.
//
// Each emitter spawns `rate` particles per second (plus bursts) from its
// shape, gives each a velocity along the preset direction blended with a
// random one by `spread`, applies gravity, and over its lifetime lerps color
// from `color` to `endColor` and size from `size` to `size * endSize`, while
// fading brightness toward 0 (additive blending makes black invisible).

export type EmitterShape = "Point" | "Sphere" | "Box" | "Cone";

export interface EmitterSettings {
  rate: number;
  lifetime: number;
  speed: number;
  size: number;
  endSize: number; // multiplier at the end of life
  color: [number, number, number];
  endColor: [number, number, number];
  direction: [number, number, number]; // unit vector
  spread: number; // 0 = along direction, 1 = fully random
  gravity: number; // world units / s^2, applied along -y (negative rises)
  shape: EmitterShape;
  shapeSize: number; // sphere radius / box half-extent / cone base radius
  coneAngle: number; // degrees, Cone only
}

export interface EmitterState {
  settings: EmitterSettings;
  capacity: number;
  positions: Float32Array; // xyz per particle
  velocities: Float32Array;
  colors: Float32Array; // rgb per particle, already faded
  sizes: Float32Array;
  ages: Float32Array;
  alive: Uint8Array;
  emitAccumulator: number;
  emitting: boolean;
  // Where new particles start (0,0,0 for local-space emitters; the emitter's
  // world position for world-space ones, set by the caller every frame).
  origin: [number, number, number];
}

export const maxParticles = 1000;

export function createEmitter(settings: EmitterSettings, extraBurst = 0): EmitterState {
  const capacity = Math.min(
    maxParticles,
    Math.max(4, Math.ceil(settings.rate * settings.lifetime * 1.5) + extraBurst),
  );
  return {
    settings,
    capacity,
    positions: new Float32Array(capacity * 3),
    velocities: new Float32Array(capacity * 3),
    colors: new Float32Array(capacity * 3),
    sizes: new Float32Array(capacity),
    ages: new Float32Array(capacity),
    alive: new Uint8Array(capacity),
    emitAccumulator: 0,
    emitting: true,
    origin: [0, 0, 0],
  };
}

export type RandomSource = () => number; // [0, 1)

function spawnOffset(s: EmitterSettings, random: RandomSource): [number, number, number] {
  switch (s.shape) {
    case "Point":
      return [0, 0, 0];
    case "Box":
      return [(random() * 2 - 1) * s.shapeSize, (random() * 2 - 1) * s.shapeSize, (random() * 2 - 1) * s.shapeSize];
    case "Sphere": {
      // Uniform in the ball: rejection sampling from the cube.
      for (;;) {
        const x = random() * 2 - 1,
          y = random() * 2 - 1,
          z = random() * 2 - 1;
        if (x * x + y * y + z * z <= 1) return [x * s.shapeSize, y * s.shapeSize, z * s.shapeSize];
      }
    }
    case "Cone": {
      // A disc of radius shapeSize at the base (the xz plane).
      const angle = random() * Math.PI * 2;
      const radius = Math.sqrt(random()) * s.shapeSize;
      return [Math.cos(angle) * radius, 0, Math.sin(angle) * radius];
    }
  }
}

function spawnDirection(s: EmitterSettings, offset: [number, number, number], random: RandomSource) {
  if (s.shape === "Cone") {
    // Within coneAngle of +direction (taken as +y for the cone).
    const half = (s.coneAngle * Math.PI) / 180;
    const theta = Math.acos(1 - random() * (1 - Math.cos(half)));
    const phi = random() * Math.PI * 2;
    return [Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi)] as const;
  }
  let rx = random() * 2 - 1,
    ry = random() * 2 - 1,
    rz = random() * 2 - 1;
  if (s.shape === "Sphere" || s.shape === "Box") {
    // Outward from the shape's center when spawned away from it.
    const length = Math.hypot(...offset);
    if (length > 1e-6) [rx, ry, rz] = [offset[0] / length, offset[1] / length, offset[2] / length];
  }
  const rl = Math.hypot(rx, ry, rz) || 1;
  const t = 1 - s.spread;
  const dx = rx / rl + (s.direction[0] - rx / rl) * t;
  const dy = ry / rl + (s.direction[1] - ry / rl) * t;
  const dz = rz / rl + (s.direction[2] - rz / rl) * t;
  const dl = Math.hypot(dx, dy, dz) || 1;
  return [dx / dl, dy / dl, dz / dl] as const;
}

function spawn(state: EmitterState, random: RandomSource): boolean {
  let slot = -1;
  for (let i = 0; i < state.capacity; i++)
    if (!state.alive[i]) {
      slot = i;
      break;
    }
  if (slot === -1) return false;
  const s = state.settings;
  const offset = spawnOffset(s, random);
  const dir = spawnDirection(s, offset, random);
  state.alive[slot] = 1;
  state.ages[slot] = 0;
  for (let k = 0; k < 3; k++) {
    state.positions[slot * 3 + k] = state.origin[k]! + offset[k]!;
    state.velocities[slot * 3 + k] = dir[k]! * s.speed;
    state.colors[slot * 3 + k] = s.color[k]!;
  }
  state.sizes[slot] = s.size;
  return true;
}

// Emits `count` particles immediately (as many as there are free slots).
export function burst(state: EmitterState, count: number, random: RandomSource = Math.random): number {
  let spawned = 0;
  for (let i = 0; i < count; i++) if (spawn(state, random)) spawned++;
  return spawned;
}

// Ages and moves particles alive before this call, then spawns this step's
// share of `rate` -- so a new particle always renders for a frame at age 0.
export function stepEmitter(state: EmitterState, dt: number, random: RandomSource = Math.random) {
  const s = state.settings;
  for (let i = 0; i < state.capacity; i++) {
    if (!state.alive[i]) continue;
    const age = state.ages[i]! + dt;
    state.ages[i] = age;
    if (age >= s.lifetime) {
      state.alive[i] = 0;
      state.colors[i * 3] = state.colors[i * 3 + 1] = state.colors[i * 3 + 2] = 0;
      state.sizes[i] = 0;
      continue;
    }
    const vy = state.velocities[i * 3 + 1]! - s.gravity * dt;
    state.velocities[i * 3 + 1] = vy;
    state.positions[i * 3] = state.positions[i * 3]! + state.velocities[i * 3]! * dt;
    state.positions[i * 3 + 1] = state.positions[i * 3 + 1]! + vy * dt;
    state.positions[i * 3 + 2] = state.positions[i * 3 + 2]! + state.velocities[i * 3 + 2]! * dt;
    const t = age / s.lifetime;
    const fade = 1 - t;
    for (let k = 0; k < 3; k++)
      state.colors[i * 3 + k] = (s.color[k]! + (s.endColor[k]! - s.color[k]!) * t) * fade;
    state.sizes[i] = s.size * (1 + (s.endSize - 1) * t);
  }
  if (!state.emitting) return;
  state.emitAccumulator += dt * s.rate;
  while (state.emitAccumulator >= 1) {
    state.emitAccumulator -= 1;
    if (!spawn(state, random)) {
      state.emitAccumulator = 0;
      break;
    }
  }
}

export function aliveCount(state: EmitterState): number {
  let n = 0;
  for (let i = 0; i < state.capacity; i++) n += state.alive[i]!;
  return n;
}
