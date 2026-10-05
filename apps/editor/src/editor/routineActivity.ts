// Routine activities (0.75.0; out of main.ts in 0.76.0). A Routine stop may
// name one ("6 120 40 sit"): the clip to play once there, if the model has
// it (a few aliases help).
export const activityAliases: Record<string, string[]> = {
  sit: ["sit"],
  talk: ["talk"],
  work: ["punching", "talk"],
  hammer: ["punching"],
  graze: ["graze", "Eating", "peck", "Idle_Headlow", "Idle_2_HeadLow"],
};

// Each stop's activity word ("" for none), in the order the simulation
// keeps them: sorted by hour.
export function parseRoutineActivities(stops: string): string[] {
  const parsed: Array<{ hour: number; activity: string }> = [];
  let numbers: number[] = [];
  const flush = (activity: string) => {
    for (let k = 0; k + 2 < numbers.length; k += 3) parsed.push({ hour: numbers[k]!, activity: k + 5 >= numbers.length ? activity : "" });
    numbers = [];
  };
  for (const token of stops.split(/[\s;,]+/).filter(Boolean)) {
    const v = Number(token);
    if (Number.isFinite(v)) numbers.push(v);
    else flush(token);
  }
  flush("");
  return parsed.sort((a, b) => a.hour - b.hour).map((p) => p.activity);
}

const cache = new Map<string, string[]>();
export function routineActivity(stops: string, stop: number) {
  let list = cache.get(stops);
  if (!list) cache.set(stops, (list = parseRoutineActivities(stops)));
  return list[stop] ?? "";
}
