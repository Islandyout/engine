// Horizontal (X/Z) speed only — a purely vertical displacement (falling under
// gravity, the physics ground correction snapping a body up) is not ground
// locomotion and must not trigger a walk/run clip. `tickDt` should be the
// actual simulated time the position delta covers (e.g. steps/60 for a fixed
// 60 Hz step), not a render frame's wall-clock delta: on a display faster
// than the simulation, position only changes on frames where a step actually
// ran, so a render-frame-delta speed reads as zero most frames and hugely
// overestimated on the rest.
export function groundSpeed(
  current: { x: number; z: number },
  previous: { x: number; z: number },
  tickDt: number,
): number {
  if (tickDt <= 0) return 0;
  return Math.hypot(current.x - previous.x, current.z - previous.z) / tickDt;
}

// Picks a clip by measured ground speed (m/s), falling back down the tier and
// finally to whatever clip the model actually has, since not every kit rig
// shares the same clip set (quadrupeds have "trot", birds don't have "run").
export function pickClipName(
  names: string[],
  speed: number,
): string | undefined {
  const tiers =
    speed < 0.15
      ? ["idle"]
      : speed < 2.5
        ? ["walk", "idle"]
        : speed < 5
          ? ["trot", "run", "walk"]
          : ["sprint", "run", "trot", "walk"];
  for (const name of tiers) if (names.includes(name)) return name;
  return names[0];
}
