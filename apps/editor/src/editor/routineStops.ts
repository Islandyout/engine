// Routine stops as rows (0.77.0): the inspector edits "6 120 40 sit; 12 30 5"
// as a table of hour, x, z and activity, and these turn it back and forth.
// The text form stays the saved format (the C++ runtime parses it).

export interface RoutineStop {
  hour: number;
  x: number;
  z: number;
  activity: string;
}

export const routineActivities = ["", "sit", "talk", "work", "hammer", "graze"] as const;

export function parseRoutineStops(text: string): { stops: RoutineStop[]; errors: string[] } {
  const stops: RoutineStop[] = [];
  const errors: string[] = [];
  text
    .split(/[;\n]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part, i) => {
      const tokens = part.split(/[\s,]+/).filter(Boolean);
      const numbers = tokens.slice(0, 3).map(Number);
      const activity = tokens[3] ?? "";
      if (tokens.length < 3 || numbers.some((n) => !Number.isFinite(n))) {
        errors.push(`stop ${i + 1} ("${part}"): needs "hour x z [activity]"`);
        return;
      }
      const [hour, x, z] = numbers as [number, number, number];
      if (hour < 0 || hour >= 24) errors.push(`stop ${i + 1}: hour ${hour} isn't between 0 and 24`);
      if (tokens.length > 4) errors.push(`stop ${i + 1}: only one activity word is used ("${tokens.slice(3).join(" ")}")`);
      stops.push({ hour, x, z, activity });
    });
  return { stops, errors };
}

const fmt = (n: number) => String(Math.round(n * 100) / 100);

export function serializeRoutineStops(stops: readonly RoutineStop[]): string {
  return stops.map((s) => [fmt(s.hour), fmt(s.x), fmt(s.z), s.activity.trim()].filter(Boolean).join(" ")).join("; ");
}
