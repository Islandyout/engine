// Eden's lifelike check: runs the minds through many simulated lives and measures them against what a person would do. Used by
// tools/eden/scenarios.ts (a thousand lives, to find what to fix) and tests/edenLives.test.ts (a few hundred, so nothing regresses).
import { AFFORDANCES, DAY, makePerson, step, type Person, type Thing, type World } from "./mind";

const DT = 0.5;

export function rng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Life {
  seed: number;
  people: number;
  deaths: number;
  minHealth: number;
  urgentShare: number; // share of time any person had hunger or thirst above 0.85
  starvedShare: number; // share of time any person had hunger or thirst at 1
  actionShares: Record<string, number>;
  topShare: number; // the largest share of time one action had
  distinctActions: number;
  abandonsPerHour: number;
  stuckSeconds: number;
  talks: number;
  mood: number;
  fearResponded: number | undefined; // seconds from a danger coming near to running, when one did
  meals: number;
  drinks: number;
  rests: number;
  sleeps: number;
  sleepShare: number;
  travelShare: number;
}

export function makeWorld(r: () => number): { world: World; hasDanger: boolean } {
  const spread = 14 + 40 * r();
  const at = (a: number) => [Math.cos(a) * spread * (0.3 + r()), Math.sin(a) * spread * (0.3 + r())] as const;
  const things: Thing[] = [];
  const add = (id: string, kind: string, ang: number, radius = 3, stock?: number) => {
    const [x, z] = at(ang);
    things.push({ id, kind, x, z, radius, stock, maxStock: stock });
  };
  add("river", "river", r() * 6.28);
  add("grove", "grove", r() * 6.28);
  if (r() < 0.6) add("bush", "bush", r() * 6.28, 2, 3 + Math.floor(r() * 4));
  if (r() < 0.8) add("hollow", "hollow", r() * 6.28);
  if (r() < 0.7) add("overlook", "overlook", r() * 6.28);
  if (r() < 0.6) add("meadow", "meadow", r() * 6.28);
  if (r() < 0.5) add("life", "tree of life", r() * 6.28, 3, 3);
  if (r() < 0.4) add("deer", "deer", r() * 6.28, 2);
  let hasDanger = false;
  const dangerRoll = r();
  if (dangerRoll < 0.3) {
    add("fox", "fox", r() * 6.28, 1);
    hasDanger = true;
  } else if (dangerRoll < 0.4) {
    add("fire", "fire", r() * 6.28, 1);
    hasDanger = true;
  }
  const n = 1 + Math.floor(r() * 4);
  const people: Person[] = [];
  for (let i = 0; i < n; i++) {
    people.push(
      makePerson(`p${i}`, (r() - 0.5) * 6, (r() - 0.5) * 6, Math.floor(r() * 1e9), {
        boldness: r(),
        sociability: r(),
        curiosity: r(),
        appetite: r(),
        patience: r(),
      }),
    );
  }
  return { world: { things, people, radius: spread * 1.7 }, hasDanger };
}

export function live(seed: number, hours: number): Life {
  const HOURS = hours;
  const r = rng(seed);
  const { world, hasDanger } = makeWorld(r);
  const steps = Math.floor((HOURS * 3600) / DT);
  const shares: Record<string, number> = {};
  let urgent = 0;
  let starved = 0;
  let abandons = 0;
  let stuck = 0;
  let talks = 0;
  let travel = 0;
  let meals = 0;
  let drinks = 0;
  let rests = 0;
  let sleeps = 0;
  let minHealth = 1;
  let moodSum = 0;
  let samples = 0;
  let fearTime: number | undefined;
  const last = new Map<string, { kind: string; target?: string; arrived: boolean; x: number; z: number; since: number }>();
  const prevIntent = new Map<string, { kind: string; arrived: boolean } | undefined>();
  let dangerNearSince: number | undefined;

  for (let i = 0; i < steps; i++) {
    const t = i * DT;
    step(world, DT);
    let anyUrgent = false;
    let anyStarved = false;
    for (const p of world.people) {
      const intent = p.intent;
      const key = intent ? (intent.arrived ? intent.kind : "travel") : "none";
      shares[key] = (shares[key] ?? 0) + 1;
      if (intent && !intent.arrived) travel++;
      if (Math.max(p.needs.hunger, p.needs.thirst) > 0.85) anyUrgent = true;
      if (p.needs.hunger >= 1 || p.needs.thirst >= 1) anyStarved = true;
      minHealth = Math.min(minHealth, p.health);
      moodSum += p.mood;
      samples++;

      // A finished action is an intent that was arrived and is now gone.
      const was = prevIntent.get(p.id);
      if (was && was.arrived && !intent) {
        if (was.kind === "eat") meals++;
        else if (was.kind === "drink") drinks++;
        else if (was.kind === "rest") rests++;
        else if (was.kind === "sleep") sleeps++;
        else if (was.kind === "talk") talks++;
      }
      // A goal dropped before it was reached (not by fleeing) is a change of mind.
      if (was && !was.arrived && was.kind !== "flee" && (!intent || intent.kind !== was.kind)) abandons++;
      prevIntent.set(p.id, intent ? { kind: intent.kind, arrived: intent.arrived } : undefined);

      // Standing about while trying to get somewhere.
      const l = last.get(p.id);
      if (intent && !intent.arrived) {
        if (l && l.kind === "travel" && Math.hypot(p.x - l.x, p.z - l.z) < 0.5) {
          if (t - l.since > 300) stuck += DT;
        } else last.set(p.id, { kind: "travel", arrived: false, x: p.x, z: p.z, since: t });
      } else last.delete(p.id);

      if (hasDanger) {
        const near = world.things.some((th) => (AFFORDANCES[th.kind]?.danger ?? 0) > 0 && Math.hypot(p.x - th.x, p.z - th.z) < 8);
        if (near && dangerNearSince === undefined) dangerNearSince = t;
        if (near && intent?.kind === "flee" && fearTime === undefined && dangerNearSince !== undefined) fearTime = t - dangerNearSince;
        if (!near) dangerNearSince = undefined;
      }
    }
    if (anyUrgent) urgent++;
    if (anyStarved) starved++;
  }
  const total = Object.values(shares).reduce((a, b) => a + b, 0) || 1;
  const actionShares: Record<string, number> = {};
  for (const [k, v] of Object.entries(shares)) actionShares[k] = v / total;
  const top = Math.max(...Object.entries(actionShares).filter(([k]) => k !== "none").map(([, v]) => v), 0);
  return {
    seed,
    people: world.people.length,
    deaths: world.people.filter((p) => p.health <= 0.05).length,
    minHealth,
    urgentShare: urgent / steps,
    starvedShare: starved / steps,
    actionShares,
    topShare: top,
    distinctActions: Object.keys(actionShares).filter((k) => k !== "none" && k !== "travel").length,
    abandonsPerHour: abandons / world.people.length / HOURS,
    stuckSeconds: stuck,
    talks,
    mood: moodSum / samples,
    fearResponded: fearTime,
    meals,
    drinks,
    rests,
    sleeps,
    sleepShare: actionShares.sleep ?? 0,
    travelShare: travel / total,
  };
}


export function runLives(count: number, hours: number) {
  const HOURS = hours;
  const DAYS = (HOURS * 3600) / DAY;
  const started = Date.now();
  const lives: Life[] = [];
  for (let i = 0; i < count; i++) lives.push(live(1000 + i * 7919, hours));
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const avg = (f: (l: Life) => number) => lives.reduce((a, l) => a + f(l), 0) / lives.length;
  const share = (f: (l: Life) => boolean) => lives.filter(f).length / lives.length;
  const median = (f: (l: Life) => number) => [...lives].map(f).sort((a, b) => a - b)[Math.floor(lives.length / 2)]!;

  const perDay = (f: (l: Life) => number) => median((l) => f(l) / l.people / DAYS);
  const dangerLives = lives.filter((l) => l.fearResponded !== undefined);
  const report = {
    lives: lives.length,
    simulatedDaysEach: +DAYS.toFixed(1),
    seconds: ((Date.now() - started) / 1000).toFixed(0),
    anyoneDied: share((l) => l.deaths > 0),
    lowestHealthMedian: median((l) => l.minHealth),
    urgentNeedTime: avg((l) => l.urgentShare),
    starvedTime: avg((l) => l.starvedShare),
    stuckLives: share((l) => l.stuckSeconds > 0),
    topActionShareMedian: median((l) => l.topShare),
    livesDominatedByOneAction: share((l) => l.topShare > 0.6),
    distinctActionsMedian: median((l) => l.distinctActions),
    abandonsPerHourMedian: median((l) => l.abandonsPerHour),
    abandonsPerHourMax: Math.max(...lives.map((l) => l.abandonsPerHour)),
    moodAverage: avg((l) => l.mood),
    groupsThatTalked: share((l) => l.people < 2 || l.talks > 0),
    mealsPerDayMedian: perDay((l) => l.meals),
    drinksPerDayMedian: perDay((l) => l.drinks),
    daytimeRestsPerDayMedian: perDay((l) => l.rests),
    sleepsPerDayMedian: perDay((l) => l.sleeps),
    sleepShareMedian: median((l) => l.sleepShare),
    travelShareMedian: median((l) => l.travelShare),
    livesWithDanger: dangerLives.length,
    fearSecondsMedian: dangerLives.length ? dangerLives.map((l) => l.fearResponded!).sort((a, b) => a - b)[Math.floor(dangerLives.length / 2)] : 0,
  };
  const thrashers = [...lives].sort((a, b) => b.abandonsPerHour - a.abandonsPerHour).slice(0, 4).filter((l) => l.abandonsPerHour > 30);
  // What a person would do. Each is a hard limit; a breach exits 1 and names itself.
  const problems: string[] = [];
  if (report.anyoneDied > 0.01) problems.push(`people died in ${pct(report.anyoneDied)} of lives`);
  if (report.urgentNeedTime > 0.08) problems.push(`someone was desperate (hunger or thirst over 85%) ${pct(report.urgentNeedTime)} of the time`);
  if (report.stuckLives > 0.01) problems.push(`people got stuck in ${pct(report.stuckLives)} of lives`);
  if (report.livesDominatedByOneAction > 0.05) problems.push(`one action took over more than 60% of ${pct(report.livesDominatedByOneAction)} of lives`);
  if (report.distinctActionsMedian < 5) problems.push(`only ${report.distinctActionsMedian} different things done (median)`);
  if (report.abandonsPerHourMedian > 20) problems.push(`changed their mind ${report.abandonsPerHourMedian.toFixed(0)} times an hour (median)`);
  if (report.groupsThatTalked < 0.97) problems.push(`groups that never talked: ${pct(1 - report.groupsThatTalked)}`);
  if (report.moodAverage < 0) problems.push(`average mood ${report.moodAverage.toFixed(2)} is below neutral`);
  if (report.mealsPerDayMedian < 2 || report.mealsPerDayMedian > 5) problems.push(`${report.mealsPerDayMedian.toFixed(1)} meals a day (median) is not human`);
  if (report.drinksPerDayMedian < 3 || report.drinksPerDayMedian > 12) problems.push(`${report.drinksPerDayMedian.toFixed(1)} drinks a day (median) is not human`);
  if (report.sleepsPerDayMedian < 0.7 || report.sleepsPerDayMedian > 1.5) problems.push(`${report.sleepsPerDayMedian.toFixed(2)} sleeps a day (median) is not human`);
  if (report.sleepShareMedian < 0.2 || report.sleepShareMedian > 0.42) problems.push(`${pct(report.sleepShareMedian)} of time asleep (median) is not human`);
  if (report.travelShareMedian > 0.6) problems.push(`${pct(report.travelShareMedian)} of time spent walking (median)`);
  return { report, problems, thrashers };
}
