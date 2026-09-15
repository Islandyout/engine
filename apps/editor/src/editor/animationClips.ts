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
