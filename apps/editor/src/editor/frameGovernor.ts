// Frame governor (0.75.0): holds play at 45-60 fps on whatever runs it.
// It watches the frame interval and steps through quality tiers -- render
// resolution first (cheap to change, most of a weak GPU's cost), then
// shadows, bloom, scatter density, terrain streaming and how often distant
// characters animate -- dropping a tier as soon as frames run slow and
// climbing back only after a steady stretch of fast ones. A tier that just
// failed is held off for a while, so it doesn't oscillate.

export interface GovernorTier {
  // Fraction of the preset's pixel ratio.
  scale: number;
  // 2 full shadow map, 1 half-size, 0 off.
  shadows: 0 | 1 | 2;
  bloom: boolean;
  // Fraction of scattered plants and rocks drawn.
  scatter: number;
  // Milliseconds a frame may spend building planet terrain.
  chunkMs: number;
  // Characters beyond `crowdNear` metres animate every `crowdStride` frames.
  crowdStride: number;
}

export const governorTiers: GovernorTier[] = [
  { scale: 1, shadows: 2, bloom: true, scatter: 1, chunkMs: 4, crowdStride: 1 },
  {
    scale: 0.85,
    shadows: 2,
    bloom: true,
    scatter: 1,
    chunkMs: 4,
    crowdStride: 1,
  },
  {
    scale: 0.75,
    shadows: 1,
    bloom: true,
    scatter: 0.85,
    chunkMs: 3,
    crowdStride: 2,
  },
  {
    scale: 0.7,
    shadows: 1,
    bloom: false,
    scatter: 0.7,
    chunkMs: 3,
    crowdStride: 2,
  },
  {
    scale: 0.6,
    shadows: 0,
    bloom: false,
    scatter: 0.55,
    chunkMs: 2,
    crowdStride: 3,
  },
  {
    scale: 0.5,
    shadows: 0,
    bloom: false,
    scatter: 0.4,
    chunkMs: 2,
    crowdStride: 4,
  },
];

export const crowdNear = 25;

export interface GovernorOptions {
  // Slowest acceptable average frame (ms): slower drops a tier. 20 ms = 50 fps,
  // so a dip is caught before play falls under 45.
  slowMs?: number;
  // Fast enough to try a better tier (ms average).
  fastMs?: number;
  // The best tier allowed (the player's quality preset).
  floor?: number;
}

export class FrameGovernor {
  tier: number;
  floor: number;
  private readonly slowMs: number;
  private readonly fastMs: number;
  private frames = 0;
  private total = 0;
  private worst = 0;
  private fastSeconds = 0;
  private settle = 0;
  // Seconds before each tier may be tried again after it failed.
  private readonly holdOff = governorTiers.map(() => 0);
  private readonly failures = governorTiers.map(() => 0);
  // Last window's average frame (ms) and the frames per second it means.
  average = 16.7;

  constructor(options: GovernorOptions = {}) {
    this.slowMs = options.slowMs ?? 20;
    this.fastMs = options.fastMs ?? 17.5;
    this.floor = Math.max(
      0,
      Math.min(governorTiers.length - 1, options.floor ?? 0),
    );
    this.tier = this.floor;
  }

  get settings(): GovernorTier {
    return governorTiers[this.tier]!;
  }

  get fps() {
    return 1000 / Math.max(this.average, 1e-3);
  }

  // One rendered frame of `intervalMs`. Returns true when the tier changed.
  sample(intervalMs: number): boolean {
    // Tab switches and breakpoints aren't frames.
    if (!(intervalMs > 0 && intervalMs < 250)) return false;
    this.frames++;
    this.total += intervalMs;
    this.worst = Math.max(this.worst, intervalMs);
    if (this.total < 500) return false;
    const seconds = this.total / 1000;
    this.average = this.total / this.frames;
    const worst = this.worst;
    this.frames = 0;
    this.total = 0;
    this.worst = 0;
    for (let i = 0; i < this.holdOff.length; i++)
      this.holdOff[i] = Math.max(0, this.holdOff[i]! - seconds);
    if (this.settle > 0) {
      // Just changed: give the new tier a moment before judging it.
      this.settle = Math.max(0, this.settle - seconds);
      return false;
    }
    // Slow on average, or a run of long hitches.
    if (
      this.average > this.slowMs ||
      (worst > 45 && this.average > this.fastMs)
    ) {
      this.fastSeconds = 0;
      if (this.tier >= governorTiers.length - 1) return false;
      // The tier that just failed waits longer each time it fails.
      this.failures[this.tier]!++;
      this.holdOff[this.tier] = Math.min(
        120,
        8 * 2 ** (this.failures[this.tier]! - 1),
      );
      this.tier++;
      this.settle = 1;
      return true;
    }
    if (this.average < this.fastMs && this.tier > this.floor) {
      this.fastSeconds += seconds;
      if (this.fastSeconds >= 3 && this.holdOff[this.tier - 1]! <= 0) {
        this.fastSeconds = 0;
        this.tier--;
        this.settle = 1;
        return true;
      }
      return false;
    }
    this.fastSeconds = 0;
    return false;
  }

  // Back to the best allowed tier (a new scene, a preset change).
  reset(floor = this.floor) {
    this.floor = Math.max(0, Math.min(governorTiers.length - 1, floor));
    this.tier = this.floor;
    this.frames = this.total = this.worst = this.fastSeconds = this.settle = 0;
    this.holdOff.fill(0);
    this.failures.fill(0);
  }
}

// The best tier a quality preset allows.
export function presetFloor(preset: "low" | "medium" | "high") {
  return preset === "high" ? 0 : preset === "medium" ? 2 : 4;
}
