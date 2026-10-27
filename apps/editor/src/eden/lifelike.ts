// Eden's lifelike check: runs the minds through many simulated lives and measures them against what a person would do. Used by
// tools/eden/scenarios.ts (a thousand lives, to find what to fix), tools/eden/sweep.ts (a million, across four cores, to tune the
// constants) and tests/edenLives.test.ts (a few hundred, so nothing regresses).
//
// A life: 1 to 4 people with random personalities in a garden of random layout, food that runs out and grows back by the seasons, a climate
// (mild like Eden's or anything from cool to warm), and perhaps a fox or a fire. It runs for `years` of 16 sim days.
import { AFFORDANCES, bondOf, makePerson, step, type Person, type Thing, type World } from "./mind";
import { DAY, YEAR, YEAR_DAYS, type Climate } from "./earth";

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
  eden: boolean; // the climate was Eden-like (mild), where people ought to live
  deaths: number;
  deathCause: string;
  minHealth: number;
  urgentShare: number; // share of time any person had hunger or thirst above 0.85
  starvedShare: number; // share of time any person had hunger or thirst at 1
  coldShare: number; // share of time any person was dangerously cold (over 0.85)
  actionShares: Record<string, number>;
  topShare: number;
  distinctActions: number;
  abandonsPerHour: number;
  stuckSeconds: number;
  talks: number;
  mood: number;
  fearResponded: number | undefined;
  meals: number;
  drinks: number;
  rests: number;
  sleeps: number;
  sleepShare: number;
  travelShare: number;
  fires: number;
  shelters: number;
  firstShelterDay: number; // sim day the first roof went up, or -1
  stashed: number; // meals put away in a larder
  winterHungerShare: number; // share of winter with hunger over 0.85
  births: number;
  peopleAtEnd: number;
  goalsSet: number;
  goalsDone: number;
  quarrels: number;
  comforts: number;
  partners: number; // pairs who ended as partners
  grieved: number; // deaths that someone wrote down as a loss
  planted: number;
  spears: number;
  hunted: number;
  deerAtEnd: number;
  deerAtStart: number;
  foxesAtEnd: number;
  fished: number;
  mourned: number;
  lessons: number;
  breaks: number;
  outbursts: number;
  beliefs: number;
  gossip: number;
  reconciliations: number;
  roles: number;
  taught: number;
  illnesses: number;
  recoveries: number;
  stillbirths: number;
  conceptions: number;
  customs: number;
  named: number;
  namesShared: number;
  infections: number;
  nursed: number;
  tamed: number;
  duskGatherings: number;
  shunned: number;
  storiesTold: number;
  washed: number;
  remedies: number;
  sewn: number;
  watched: number;
  tipsShared: number;
}

export interface LifeOptions {
  years?: number;
  // Run this many sim days instead of whole years (a season stress test), starting at a random point in the year.
  days?: number;
  randomStart?: boolean;
  dt?: number;
  // Force a climate; by default each life draws its own.
  climate?: Climate;
}

function makeWorld(r: () => number, options: LifeOptions): { world: World; hasDanger: boolean; eden: boolean } {
  const spread = 14 + 26 * r();
  const at = (a: number) => [Math.cos(a) * spread * (0.3 + r()), Math.sin(a) * spread * (0.3 + r())] as const;
  const things: Thing[] = [];
  const add = (id: string, kind: string, ang: number, radius = 3, stock?: number) => {
    const [x, z] = at(ang);
    things.push({ id, kind, x, z, radius, stock, maxStock: stock });
  };
  add("river", "river", r() * 6.28);
  add("grove", "grove", r() * 6.28, 3, 6 + Math.floor(r() * 5));
  if (r() < 0.6) add("bush", "bush", r() * 6.28, 2, 3 + Math.floor(r() * 4));
  if (r() < 0.8) add("hollow", "hollow", r() * 6.28);
  if (r() < 0.7) add("overlook", "overlook", r() * 6.28);
  if (r() < 0.6) add("meadow", "meadow", r() * 6.28);
  if (r() < 0.5) add("life", "tree of life", r() * 6.28, 3, 3);
  if (r() < 0.5) add("tree", "tree", r() * 6.28, 2);
  if (r() < 0.4) {
    // A small herd, so there is something to breed and to hunt.
    const herd = r() * 6.28;
    for (let i = 0; i < 3; i++) add(`deer${i}`, "deer", herd + i * 0.15, 2);
  }
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
      makePerson(
        `p${i}`,
        (r() - 0.5) * 6,
        (r() - 0.5) * 6,
        Math.floor(r() * 1e9),
        { boldness: r(), sociability: r(), curiosity: r(), appetite: r(), patience: r() },
        { name: `P${i}`, sex: r() < 0.5 ? "m" : "f", age: 18 + Math.floor(r() * 14) },
      ),
    );
  }
  const climate: Climate = options.climate ?? {
    meanC: 8 + 14 * r(),
    seasonalAmpC: 4 + 8 * r(),
    dailyAmpC: 3 + 4 * r(),
    rainy: 0.1 + 0.4 * r(),
    seed: Math.floor(r() * 1e6),
  };
  // Eden-like: where winter is cool, not freezing, so a person with a fire and a roof does well.
  const eden = climate.meanC - climate.seasonalAmpC - climate.dailyAmpC >= 0;
  // Starts in spring, a few hours after dawn.
  return { world: { things, people, radius: spread * 1.7, climate, clock: DAY / 3 }, hasDanger, eden };
}

export function live(seed: number, options: LifeOptions = {}): Life {
  const years = options.years ?? 1;
  const DT = options.dt ?? 1;
  const r = rng(seed);
  const { world, hasDanger, eden } = makeWorld(r, options);
  // A season stress test starts anywhere in the year, on a whole day plus a few hours after dawn.
  if (options.randomStart) {
    world.clock = Math.floor(r() * YEAR_DAYS) * DAY + DAY / 3;
    // A household that has been here since spring: from autumn on it has a roof and a larder, and some wood laid by.
    const seasonIndex = Math.min(3, Math.floor(((world.clock % YEAR) / YEAR) * 4));
    if (seasonIndex >= 2) {
      const home = world.things.find((t) => AFFORDANCES[t.kind]?.rest) ?? world.things[0]!;
      world.things.push({ id: "shelter-0", kind: "shelter", x: home.x + 2, z: home.z, radius: 3, stock: seasonIndex === 2 ? 6 : 10 });
      for (const p of world.people) p.carry.wood = 4;
    }
  }
  const steps = Math.floor(((options.days !== undefined ? options.days * DAY : years * YEAR)) / DT);
  const hours = (steps * DT) / 3600;
  const initialPeople = world.people.length;
  const deerAtStart = world.things.filter((t) => t.kind === "deer").length;
  let births = 0;
  const shares: Record<string, number> = {};
  let urgent = 0;
  let starved = 0;
  let coldTime = 0;
  let abandons = 0;
  let stuck = 0;
  let talks = 0;
  let travel = 0;
  let meals = 0;
  let drinks = 0;
  let rests = 0;
  let sleeps = 0;
  let fires = 0;
  let shelters = 0;
  let firstShelterDay = -1;
  let stashed = 0;
  let winterSteps = 0;
  let winterHungry = 0;
  let minHealth = 1;
  let moodSum = 0;
  let samples = 0;
  let fearTime: number | undefined;
  let deathCause = "";
  const last = new Map<string, { x: number; z: number; since: number }>();
  const prevIntent = new Map<string, { kind: string; arrived: boolean } | undefined>();
  const prevCarryFood = new Map<string, number>();
  let dangerNearSince: number | undefined;
  let knownShelters = 0;

  for (let i = 0; i < steps; i++) {
    const t = i * DT;
    const before = world.people.length + (world.dead?.length ?? 0);
    step(world, DT);
    births += Math.max(0, world.people.length + (world.dead?.length ?? 0) - before);
    let anyUrgent = false;
    let anyStarved = false;
    let anyCold = false;
    const winter = world.weather?.season === 3;
    if (winter) winterSteps++;
    for (const p of world.people) {
      const intent = p.intent;
      const key = intent ? (intent.arrived ? intent.kind : "travel") : "none";
      shares[key] = (shares[key] ?? 0) + 1;
      if (intent && !intent.arrived) travel++;
      if (Math.max(p.needs.hunger, p.needs.thirst) > 0.85) anyUrgent = true;
      if (p.needs.hunger >= 1 || p.needs.thirst >= 1) anyStarved = true;
      if (p.cold > 0.85) anyCold = true;
      if (winter && p.needs.hunger > 0.85) winterHungry++;
      if (p.health < minHealth) {
        minHealth = p.health;
        if (p.health <= 0.05 && !deathCause) deathCause = p.cold > 0.85 ? "cold" : p.needs.thirst >= 1 ? "thirst" : p.needs.hunger >= 1 ? "hunger" : hasDanger ? "danger" : "other";
      }
      moodSum += p.mood;
      samples++;

      const was = prevIntent.get(p.id);
      if (was && was.arrived && !intent) {
        if (was.kind === "eat") meals++;
        else if (was.kind === "drink") drinks++;
        else if (was.kind === "rest") rests++;
        else if (was.kind === "sleep") sleeps++;
        else if (was.kind === "talk") talks++;
        else if (was.kind === "fire") fires++;
      }
      if (was && !was.arrived && was.kind !== "flee" && (!intent || intent.kind !== was.kind)) abandons++;
      prevIntent.set(p.id, intent ? { kind: intent.kind, arrived: intent.arrived } : undefined);
      const food = p.carry.food;
      const wasFood = prevCarryFood.get(p.id) ?? 0;
      if (food < wasFood && was?.kind === "stash") stashed += wasFood - food;
      prevCarryFood.set(p.id, food);

      const l = last.get(p.id);
      if (intent && !intent.arrived) {
        if (l && Math.hypot(p.x - l.x, p.z - l.z) < 0.5) {
          if (t - l.since > 300) stuck += DT;
        } else last.set(p.id, { x: p.x, z: p.z, since: t });
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
    if (anyCold) coldTime++;
    const sheltersNow = world.things.filter((th) => th.kind === "shelter").length;
    if (sheltersNow > knownShelters) {
      shelters += sheltersNow - knownShelters;
      if (firstShelterDay < 0) firstShelterDay = Math.floor(t / DAY);
    }
    knownShelters = sheltersNow;
  }
  const total = Object.values(shares).reduce((a, b) => a + b, 0) || 1;
  const actionShares: Record<string, number> = {};
  for (const [k, v] of Object.entries(shares)) actionShares[k] = v / total;
  const top = Math.max(...Object.entries(actionShares).filter(([k]) => k !== "none").map(([, v]) => v), 0);
  const everyone = [...world.people, ...(world.dead ?? []).map((d) => d.person)];
  const lines = everyone.flatMap((p) => p.journal.map((j) => j.text));
  const count = (re: RegExp) => lines.filter((t) => re.test(t)).length;
  const deadCause = world.dead?.[0]?.cause;
  if (deadCause) deathCause = deadCause === "the cold" ? "cold" : deadCause === "old age" ? "old age" : deadCause === "wounds" ? "danger" : deadCause;
  let partners = 0;
  for (let i = 0; i < world.people.length; i++) for (let j = i + 1; j < world.people.length; j++) if (bondOf(world.people[i]!, world.people[j]!) === "partner") partners++;
  return {
    seed,
    people: initialPeople,
    births,
    peopleAtEnd: world.people.length,
    goalsSet: world.tally?.goalsSet ?? 0,
    goalsDone: world.tally?.goalsDone ?? 0,
    quarrels: world.tally?.quarrels ?? 0,
    comforts: world.tally?.comforts ?? 0,
    partners,
    grieved: world.dead?.length ? count(/ died( of |\.)/) : 0,
    planted: world.tally?.planted ?? 0,
    spears: world.tally?.spears ?? 0,
    hunted: world.tally?.hunted ?? 0,
    fished: world.tally?.fished ?? 0,
    mourned: world.tally?.mourned ?? 0,
    lessons: world.tally?.lessons ?? 0,
    breaks: world.tally?.breaks ?? 0,
    outbursts: world.tally?.outbursts ?? 0,
    beliefs: world.tally?.beliefs ?? 0,
    gossip: world.tally?.gossip ?? 0,
    reconciliations: world.tally?.reconciliations ?? 0,
    roles: world.tally?.roles ?? 0,
    taught: world.tally?.taught ?? 0,
    illnesses: world.tally?.illnesses ?? 0,
    recoveries: world.tally?.recoveries ?? 0,
    stillbirths: world.tally?.stillbirths ?? 0,
    conceptions: world.tally?.conceptions ?? 0,
    customs: world.tally?.customs ?? 0,
    named: world.tally?.named ?? 0,
    namesShared: world.tally?.namesShared ?? 0,
    infections: world.tally?.infections ?? 0,
    nursed: world.tally?.nursed ?? 0,
    tamed: world.tally?.tamed ?? 0,
    duskGatherings: world.tally?.duskGatherings ?? 0,
    shunned: world.tally?.shunned ?? 0,
    storiesTold: world.tally?.storiesTold ?? 0,
    washed: world.tally?.washed ?? 0,
    remedies: world.tally?.remedies ?? 0,
    sewn: world.tally?.sewn ?? 0,
    watched: world.tally?.watched ?? 0,
    tipsShared: world.tally?.tipsShared ?? 0,
    deerAtEnd: world.things.filter((t) => t.kind === "deer").length,
    deerAtStart,
    foxesAtEnd: world.things.filter((t) => t.kind === "fox").length,
    eden,
    deaths: world.dead?.length ?? 0,
    deathCause,
    minHealth,
    urgentShare: urgent / steps,
    starvedShare: starved / steps,
    coldShare: coldTime / steps,
    actionShares,
    topShare: top,
    distinctActions: Object.keys(actionShares).filter((k) => k !== "none" && k !== "travel").length,
    abandonsPerHour: abandons / initialPeople / hours,
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
    fires,
    shelters,
    firstShelterDay,
    stashed,
    winterHungerShare: winterSteps ? winterHungry / (winterSteps * world.people.length) : 0,
  };
}

const maxOf = (lives: Life[], f: (l: Life) => number) => lives.reduce((a, l) => Math.max(a, f(l)), 0);
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

// The measures over a set of lives, and what is wrong with them, judged against what a person would do. Eden-like climates are held to
// the strict standard (people ought to live there); harsher ones are only reported.
export function analyse(lives: Life[], years: number, seconds = 0) {
  const days = years * YEAR_DAYS;
  const avg = (f: (l: Life) => number, set = lives) => (set.length ? set.reduce((a, l) => a + f(l), 0) / set.length : 0);
  const share = (f: (l: Life) => boolean, set = lives) => (set.length ? set.filter(f).length / set.length : 0);
  const median = (f: (l: Life) => number, set = lives) => (set.length ? [...set].map(f).sort((a, b) => a - b)[Math.floor(set.length / 2)]! : 0);
  const edenLives = lives.filter((l) => l.eden);
  const harsh = lives.filter((l) => !l.eden);
  const perDay = (f: (l: Life) => number) => median((l) => f(l) / l.people / days);
  const dangerLives = lives.filter((l) => l.fearResponded !== undefined);
  const causes: Record<string, number> = {};
  for (const l of lives) if (l.deaths > 0) causes[l.deathCause || "other"] = (causes[l.deathCause || "other"] ?? 0) + 1;
  const report = {
    lives: lives.length,
    edenClimateLives: edenLives.length,
    simulatedDaysEach: days,
    seconds,
    // In Eden-like climates
    edenAnyoneDied: share((l) => l.deaths > 0, edenLives),
    edenUrgentNeedTime: avg((l) => l.urgentShare, edenLives),
    edenColdTime: avg((l) => l.coldShare, edenLives),
    edenWinterHunger: avg((l) => l.winterHungerShare, edenLives),
    edenRoofBuilt: share((l) => l.shelters > 0, edenLives),
    edenFiresMedian: median((l) => l.fires, edenLives),
    edenStashedMedian: median((l) => l.stashed, edenLives),
    // Harsh climates, for information
    harshAnyoneDied: share((l) => l.deaths > 0, harsh),
    harshColdTime: avg((l) => l.coldShare, harsh),
    deathCauses: causes,
    // Everywhere
    stuckLives: share((l) => l.stuckSeconds > 0),
    topActionShareMedian: median((l) => l.topShare),
    livesDominatedByOneAction: share((l) => l.topShare > 0.6),
    distinctActionsMedian: median((l) => l.distinctActions),
    abandonsPerHourMedian: median((l) => l.abandonsPerHour),
    abandonsPerHourMax: maxOf(lives, (l) => l.abandonsPerHour),
    moodAverage: avg((l) => l.mood),
    groupsThatTalked: share((l) => l.people < 2 || l.talks > 0),
    mealsPerDayMedian: perDay((l) => l.meals),
    drinksPerDayMedian: perDay((l) => l.drinks),
    sleepsPerDayMedian: perDay((l) => l.sleeps),
    sleepShareMedian: median((l) => l.sleepShare),
    travelShareMedian: median((l) => l.travelShare),
    firstRoofDayMedian: median((l) => l.firstShelterDay, lives.filter((l) => l.firstShelterDay >= 0)),
    livesWithDanger: dangerLives.length,
    // What they made of their lives together
    livesWithAGoal: share((l) => l.goalsSet > 0),
    goalsDoneShare: lives.reduce((a, l) => a + l.goalsDone, 0) / Math.max(1, lives.reduce((a, l) => a + l.goalsSet, 0)),
    groupsThatQuarrelled: share((l) => l.quarrels > 0, lives.filter((l) => l.people > 1)),
    groupsThatComforted: share((l) => l.comforts > 0, lives.filter((l) => l.people > 1)),
    groupsWithPartners: share((l) => l.partners > 0, lives.filter((l) => l.people > 1)),
    livesWithBirths: share((l) => l.births > 0),
    birthsPerBirthLife: avg((l) => l.births, lives.filter((l) => l.births > 0)),
    mostPeopleAtEnd: maxOf(lives, (l) => l.peopleAtEnd),
    deathsOfOldAge: share((l) => l.deathCause === "old age"),
    livesThatPlanted: share((l) => l.planted > 0),
    livesWithSpears: share((l) => l.spears > 0),
    livesThatFished: share((l) => l.fished > 0),
    livesThatMourned: share((l) => l.mourned > 0),
    groupsWithBreaks: share((l) => l.breaks > 0, lives.filter((l) => l.people > 1)),
    groupsWithOutbursts: share((l) => l.outbursts > 0, lives.filter((l) => l.people > 1)),
    groupsWithBeliefs: share((l) => l.beliefs > 0, lives.filter((l) => l.people > 1)),
    livesThatSewed: share((l) => l.sewn > 0),
    groupsThatSharedTips: share((l) => l.tipsShared > 0, lives.filter((l) => l.people > 1)),
    groupsThatGatheredAtDusk: share((l) => l.duskGatherings > 0, lives.filter((l) => l.people > 1)),
    groupsThatShunned: share((l) => l.shunned > 0, lives.filter((l) => l.people > 2)),
    groupsThatToldStories: share((l) => l.storiesTold > 0, lives.filter((l) => l.people > 1)),
    livesThatWashed: share((l) => l.washed > 0),
    groupsThatNursed: share((l) => l.nursed > 0, lives.filter((l) => l.people > 1)),
    groupsThatNamedPlaces: share((l) => l.named > 0),
    groupsThatSharedNames: share((l) => l.namesShared > 0, lives.filter((l) => l.people > 1)),
    groupsWithCustoms: share((l) => l.customs > 0, lives.filter((l) => l.people > 1)),
    livesWithIllness: share((l) => l.illnesses > 0),
    illnessesRecovered: lives.reduce((a, l) => a + l.recoveries, 0) / Math.max(1, lives.reduce((a, l) => a + l.illnesses, 0)),
    groupsWithRoles: share((l) => l.roles > 0, lives.filter((l) => l.people > 1)),
    groupsThatTaught: share((l) => l.taught > 0, lives.filter((l) => l.people > 1)),
    groupsThatMadeUp: share((l) => l.reconciliations > 0, lives.filter((l) => l.people > 1)),
    groupsThatGossiped: share((l) => l.gossip > 0, lives.filter((l) => l.people > 1)),
    livesThatLearned: share((l) => l.lessons > 0),
    livesThatHunted: share((l) => l.hunted > 0, lives.filter((l) => l.deerAtStart > 0)),
    herdsGone: share((l) => l.deerAtStart > 0 && l.deerAtEnd === 0, lives.filter((l) => l.deerAtStart > 0)),
    mostDeer: maxOf(lives, (l) => l.deerAtEnd),
  };
  const thrashers = [...lives].sort((a, b) => b.abandonsPerHour - a.abandonsPerHour).slice(0, 4).filter((l) => l.abandonsPerHour > 30);

  // What a person would do. Each is a hard limit; a breach names itself.
  const problems: string[] = [];
  if (report.edenAnyoneDied > 0.06) problems.push(`people died in ${pct(report.edenAnyoneDied)} of Eden-like lives (${JSON.stringify(causes)})`);
  if (report.edenUrgentNeedTime > 0.06) problems.push(`someone was desperate (hunger or thirst over 85%) ${pct(report.edenUrgentNeedTime)} of the time`);
  if (report.edenColdTime > 0.04) problems.push(`someone was dangerously cold ${pct(report.edenColdTime)} of the time`);
  if (report.edenWinterHunger > 0.1) problems.push(`people were hungry ${pct(report.edenWinterHunger)} of winter`);
  if (report.stuckLives > 0.01) problems.push(`people got stuck in ${pct(report.stuckLives)} of lives`);
  if (report.livesDominatedByOneAction > 0.05) problems.push(`one action took over more than 60% of ${pct(report.livesDominatedByOneAction)} of lives`);
  if (report.distinctActionsMedian < 6) problems.push(`only ${report.distinctActionsMedian} different things done (median)`);
  if (report.abandonsPerHourMedian > 20) problems.push(`changed their mind ${report.abandonsPerHourMedian.toFixed(0)} times an hour (median)`);
  if (report.groupsThatTalked < 0.97) problems.push(`groups that never talked: ${pct(1 - report.groupsThatTalked)}`);
  if (report.moodAverage < 0) problems.push(`average mood ${report.moodAverage.toFixed(2)} is below neutral`);
  if (report.mealsPerDayMedian < 2 || report.mealsPerDayMedian > 5) problems.push(`${report.mealsPerDayMedian.toFixed(1)} meals a day (median) is not human`);
  if (report.drinksPerDayMedian < 3 || report.drinksPerDayMedian > 12) problems.push(`${report.drinksPerDayMedian.toFixed(1)} drinks a day (median) is not human`);
  if (report.sleepsPerDayMedian < 0.7 || report.sleepsPerDayMedian > 1.6) problems.push(`${report.sleepsPerDayMedian.toFixed(2)} sleeps a day (median) is not human`);
  if (report.sleepShareMedian < 0.2 || report.sleepShareMedian > 0.42) problems.push(`${pct(report.sleepShareMedian)} of time asleep (median) is not human`);
  if (report.travelShareMedian > 0.6) problems.push(`${pct(report.travelShareMedian)} of time spent walking (median)`);
  if (report.livesWithAGoal < 0.5 && years >= 1) problems.push(`only ${pct(report.livesWithAGoal)} of lives ever set a goal`);
  if (report.mostDeer > 14) problems.push(`a herd of ${report.mostDeer}: the deer did not stop breeding`);
  if (report.herdsGone > 0.35) problems.push(`${pct(report.herdsGone)} of herds died out`);
  if (report.mostPeopleAtEnd > 12) problems.push(`a population of ${report.mostPeopleAtEnd}: births did not stop`);
  if (report.edenRoofBuilt < 0.8 && years >= 1) problems.push(`only ${pct(report.edenRoofBuilt)} of Eden-like lives built a roof in a year`);
  return { report, problems, thrashers };
}

// A life as a row of numbers, so many can cross between threads cheaply.
const CAUSES = ["", "cold", "thirst", "hunger", "danger", "other"];
const NUMERIC: (keyof Life)[] = ["seed", "people", "deaths", "minHealth", "urgentShare", "starvedShare", "coldShare", "topShare", "distinctActions", "abandonsPerHour", "stuckSeconds", "talks", "mood", "meals", "drinks", "rests", "sleeps", "sleepShare", "travelShare", "fires", "shelters", "firstShelterDay", "stashed", "winterHungerShare", "births", "peopleAtEnd", "goalsSet", "goalsDone", "quarrels", "comforts", "partners", "grieved", "planted", "spears", "hunted", "deerAtEnd", "deerAtStart", "foxesAtEnd", "fished", "mourned", "lessons", "breaks", "outbursts", "beliefs", "gossip", "reconciliations", "roles", "taught", "illnesses", "recoveries", "stillbirths", "conceptions", "customs", "named", "namesShared", "infections", "nursed", "tamed", "duskGatherings", "shunned", "storiesTold", "washed", "remedies", "sewn", "watched", "tipsShared"];
export const ROW = NUMERIC.length + 3;
export function lifeToRow(l: Life, out: Float64Array, at: number) {
  NUMERIC.forEach((k, i) => (out[at + i] = l[k] as number));
  out[at + NUMERIC.length] = l.eden ? 1 : 0;
  out[at + NUMERIC.length + 1] = CAUSES.indexOf(l.deathCause);
  out[at + NUMERIC.length + 2] = l.fearResponded === undefined ? -1 : l.fearResponded;
}
export function rowToLife(row: Float64Array, at: number): Life {
  const l = { actionShares: {} } as unknown as Record<string, unknown>;
  NUMERIC.forEach((k, i) => (l[k] = row[at + i]));
  l.eden = row[at + NUMERIC.length] === 1;
  l.deathCause = CAUSES[row[at + NUMERIC.length + 1]!] ?? "";
  const fear = row[at + NUMERIC.length + 2]!;
  l.fearResponded = fear < 0 ? undefined : fear;
  return l as unknown as Life;
}

export function runLives(count: number, years: number, options: LifeOptions = {}, firstSeed = 1000) {
  const started = Date.now();
  const lives: Life[] = [];
  for (let i = 0; i < count; i++) lives.push(live(firstSeed + i * 7919, { ...options, years }));
  return { lives, ...analyse(lives, years, +((Date.now() - started) / 1000).toFixed(0)) };
}
