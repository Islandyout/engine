// Under the choices: what a person wants, what their body is doing, what has happened to them, and what has become habit.
//
//  - DRIVES: eleven things people need besides food and water (safety, belonging, esteem, autonomy, competence, curiosity, meaning,
//    attachment, intimacy, play, stimulation). Each is a satisfaction from 0 to 1 that wears down with time and is fed by what they do and
//    who they are with; what is low is wanted, and the want tilts what they choose.
//  - CHEMISTRY: dopamine (wanting and reward), serotonin (standing and steadiness), oxytocin (bonding), cortisol (stress), endorphin
//    (pain relief, laughter), noradrenaline (alertness), testosterone and oestrogen (puberty, drive, ageing) and melatonin (the sleep
//    rhythm). Each has a baseline, is raised by what happens and by what they feel, and falls back at its own speed. Rewards wear off
//    with repetition (tolerance) and leave a deficit when they stop (withdrawal); stress that goes on too long becomes an anxious or a
//    depressed state that outlasts its cause and colours everything.
//  - HABITS, CUES and LIKES: what is done often at the same time of day runs by itself; a fright fixes itself to what was near and
//    fires again at the sight of it; a pleasure fixes itself the same way.
//  - MEMORY: what is remembered fades at a rate set by how much it mattered, comes back when something cues it, is coloured by how they
//    feel now, is strengthened by sleep, and turns up in dreams. A life story is kept from what has happened and changes with age.
// None of this claims that anyone feels anything. It is the machinery by which behaviour comes from reasons.
import { DAY, hourOf } from "./earth";
import { feel, type Emotion } from "./inner";
import { valueOf } from "./identity";
import { ADULT_AGE, AFFORDANCES, bondOf, isNight, note, rand, tally, type Intent, type Person, type World } from "./mind";

export const CHEMS = ["dopamine", "serotonin", "oxytocin", "cortisol", "endorphin", "noradrenaline", "testosterone", "oestrogen", "melatonin"] as const;
export type Chem = (typeof CHEMS)[number];
export const DRIVES = ["safety", "belonging", "esteem", "autonomy", "competence", "curiosity", "meaning", "attachment", "intimacy", "play", "stimulation"] as const;
export type Drive = (typeof DRIVES)[number];

export interface Cue {
  kind: string; // the sort of thing that was near when the fright happened
  strength: number;
  fired?: number; // when it last set them off
}
export interface Habit {
  n: number;
  auto: boolean;
  last: number;
}
export interface Milestone {
  t: number;
  kind: string;
  text: string;
}
export interface Psyche {
  chem: Record<Chem, number>;
  sens: { dopamine: number; endorphin: number; oxytocin: number }; // how strongly rewards land (tolerance lowers them)
  deficit: number; // 0..1, the craving after too many rewards stop
  strain: number; // 0..1, stress that has gone on
  state?: "anxious" | "depressed";
  drives: Record<Drive, number>; // satisfaction, 1 is full
  recent: string[]; // the last things done
  habits: Record<string, Habit>;
  cues: Cue[];
  likes: Record<string, number>; // conditioned liking of kinds of thing, -1..1
  milestones: Milestone[];
  seen: Record<string, number>; // when each person they care for was last near
  prevFear: number;
  storyAt: number;
  nightmare?: number;
  lastReward?: number; // when a reward last landed, for the craving that follows its absence
  rewarded?: boolean; // a reward landed since the last step
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const dist = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);

/** Age in the years a person would count in a human life: an Eden child grows up at 4 and is old at 55. */
export const humanYears = (age: number) => (age < ADULT_AGE ? age * 4.5 : 18 + (age - ADULT_AGE) * 0.94);

const HALF: Record<Chem, number> = { dopamine: 120, serotonin: 900, oxytocin: 400, cortisol: 600, endorphin: 300, noradrenaline: 90, testosterone: 1500, oestrogen: 1500, melatonin: 200 };

function hormoneLevel(person: Person, mine: "m" | "f"): number {
  const h = humanYears(person.age);
  const ramp = clamp01((h - 10) / 5); // puberty from about 10 to 15
  const decline = h > 50 ? Math.max(0.2, 1 - (h - 50) / 40) : 1;
  const own = person.sex === mine ? 0.5 : 0.22;
  return (0.05 + 0.95 * ramp) * own * 2 * decline * 0.5 + 0.02;
}
function baselines(person: Person, world: World): Record<Chem, number> {
  const dark = isNight(world.clock ?? 0);
  return {
    dopamine: 0.4,
    serotonin: 0.5,
    oxytocin: 0.3,
    cortisol: 0.25,
    endorphin: 0.2,
    noradrenaline: 0.25,
    testosterone: hormoneLevel(person, "m"),
    oestrogen: hormoneLevel(person, "f"),
    melatonin: dark ? 0.8 : 0.1,
  };
}

export function psycheOf(person: Person): Psyche {
  if (person.psyche) return person.psyche;
  const chem = {} as Record<Chem, number>;
  const b = baselines(person, { things: [], people: [], clock: DAY / 3 });
  for (const c of CHEMS) chem[c] = b[c];
  const drives = {} as Record<Drive, number>;
  for (const d of DRIVES) drives[d] = 0.7;
  person.psyche = { chem, sens: { dopamine: 1, endorphin: 1, oxytocin: 1 }, deficit: 0, strain: 0, drives, recent: [], habits: {}, cues: [], likes: {}, milestones: [], seen: {}, prevFear: 0, storyAt: -1 };
  return person.psyche;
}

// ---- Chemistry ----

/** What each feeling does to body chemistry, per unit of the feeling. */
const EMO_CHEM: Partial<Record<Emotion, Partial<Record<Chem, number>>>> = {
  fear: { cortisol: 0.5, noradrenaline: 0.6 },
  anger: { noradrenaline: 0.4, testosterone: 0.15, cortisol: 0.2 },
  joy: { dopamine: 0.4, endorphin: 0.2, serotonin: 0.2 },
  gratitude: { oxytocin: 0.4, serotonin: 0.1 },
  love: { oxytocin: 0.5, dopamine: 0.15, serotonin: 0.1 },
  empathy: { oxytocin: 0.2 },
  pride: { serotonin: 0.4, dopamine: 0.2 },
  shame: { cortisol: 0.4, serotonin: -0.25 },
  guilt: { cortisol: 0.35, serotonin: -0.15 },
  loneliness: { cortisol: 0.3, oxytocin: -0.1 },
  despair: { serotonin: -0.4, cortisol: 0.4, dopamine: -0.3 },
  hope: { dopamine: 0.3 },
  humour: { endorphin: 0.4, dopamine: 0.1 },
  awe: { dopamine: 0.2, serotonin: 0.15 },
  boredom: { dopamine: -0.12 },
  jealousy: { cortisol: 0.3, noradrenaline: 0.3 },
  envy: { cortisol: 0.15 },
  disgust: { noradrenaline: 0.15 },
  longing: { cortisol: 0.1, dopamine: -0.05 },
  relief: { cortisol: -0.2, endorphin: 0.2 },
};

export type PsycheEvent = "reward" | "social" | "touch" | "threat" | "pain" | "loss" | "achievement" | "defeat" | "novelty" | "laughter" | "beauty" | "wrong" | "regret" | "triumph";
const EVENT_EFFECT: Record<PsycheEvent, { chem?: Partial<Record<Chem, number>>; feel?: Partial<Record<Emotion, number>>; drive?: Partial<Record<Drive, number>> }> = {
  reward: { chem: { dopamine: 0.25 }, feel: { joy: 0.1 } },
  social: { chem: { oxytocin: 0.15, serotonin: 0.03 }, drive: { belonging: 0.12 } },
  touch: { chem: { oxytocin: 0.3, endorphin: 0.1 }, drive: { belonging: 0.15, attachment: 0.15 } },
  threat: { chem: { cortisol: 0.3, noradrenaline: 0.35 }, feel: { fear: 0.2 }, drive: { safety: -0.2 } },
  pain: { chem: { cortisol: 0.2, endorphin: 0.3 } },
  loss: { chem: { cortisol: 0.3, serotonin: -0.1 }, feel: { longing: 0.2 } },
  achievement: { chem: { serotonin: 0.1, dopamine: 0.2 }, feel: { pride: 0.2 }, drive: { esteem: 0.18, competence: 0.12 } },
  triumph: { chem: { serotonin: 0.15, dopamine: 0.3, testosterone: 0.05 }, feel: { pride: 0.4, joy: 0.2 }, drive: { esteem: 0.3 } },
  defeat: { chem: { serotonin: -0.12, cortisol: 0.2 }, feel: { shame: 0.2 }, drive: { esteem: -0.2 } },
  novelty: { chem: { dopamine: 0.15 }, drive: { curiosity: 0.12, stimulation: 0.2 } },
  laughter: { chem: { endorphin: 0.25, oxytocin: 0.1 }, feel: { humour: 0.4 }, drive: { play: 0.15 } },
  beauty: { chem: { dopamine: 0.1, serotonin: 0.05 }, feel: { awe: 0.4 }, drive: { meaning: 0.05 } },
  wrong: { chem: { cortisol: 0.1 }, feel: { guilt: 0.45 } },
  regret: { feel: { regret: 0.4 }, chem: { cortisol: 0.05 } },
};

/** Something happens to them: chemistry moves, a feeling rises, a drive is fed or hurt. Rewards land less each time (tolerance). */
export function psycheEvent(person: Person, event: PsycheEvent, amount = 1) {
  const ps = psycheOf(person);
  const fx = EVENT_EFFECT[event];
  for (const [c, v] of Object.entries(fx.chem ?? {}) as [Chem, number][]) {
    const sens = c === "dopamine" ? ps.sens.dopamine : c === "endorphin" ? ps.sens.endorphin : c === "oxytocin" ? ps.sens.oxytocin : 1;
    ps.chem[c] = clamp01(ps.chem[c] + v * amount * (v > 0 ? sens : 1));
    if (v > 0 && (c === "dopamine" || c === "endorphin")) ps.sens[c] = Math.max(0.35, ps.sens[c] - 0.03 * amount); // tolerance
    if (v > 0 && c === "dopamine") ps.rewarded = true;
    if (v > 0 && c === "oxytocin") ps.sens.oxytocin = Math.max(0.6, ps.sens.oxytocin - 0.01 * amount);
  }
  for (const [e, v] of Object.entries(fx.feel ?? {}) as [Emotion, number][]) feel(person, e, v * amount * (event === "wrong" ? 0.4 + 0.8 * valueOf(person, "fairness") : 1));
  for (const [d, v] of Object.entries(fx.drive ?? {}) as [Drive, number][]) ps.drives[d] = clamp01(ps.drives[d] + v * amount);
}

// ---- Drives ----

/** Days for a drive to wear from full to empty when nothing feeds it (safety, belonging and attachment follow their circumstances instead). */
const WEAR_DAYS: Partial<Record<Drive, number>> = { esteem: 2.5, autonomy: 3, competence: 2, curiosity: 1.2, meaning: 5, intimacy: 4, play: 1.5, stimulation: 0.7 };
/** What each kind of action feeds. */
const FEEDS: Partial<Record<string, Partial<Record<Drive, number>>>> = {
  talk: { belonging: 0.1, stimulation: 0.05, intimacy: 0.03 }, share: { belonging: 0.12, esteem: 0.05, meaning: 0.03 }, comfort: { belonging: 0.12, attachment: 0.1, meaning: 0.05 },
  gift: { belonging: 0.12, esteem: 0.05, intimacy: 0.05 }, trade: { belonging: 0.04, competence: 0.08, esteem: 0.04 }, teach: { esteem: 0.15, meaning: 0.12, belonging: 0.06 },
  play: { play: 0.35, belonging: 0.05, stimulation: 0.2 }, create: { esteem: 0.15, meaning: 0.1, autonomy: 0.1, stimulation: 0.15, play: 0.1 },
  ponder: { curiosity: 0.2, meaning: 0.12, autonomy: 0.05 }, read: { curiosity: 0.2, stimulation: 0.12, competence: 0.05 }, invent: { curiosity: 0.2, competence: 0.1, autonomy: 0.12, stimulation: 0.2 },
  make: { competence: 0.18, esteem: 0.06 }, hunt: { competence: 0.15, esteem: 0.12, safety: 0.05 }, gather: { competence: 0.08 }, plant: { competence: 0.1, meaning: 0.04 },
  fish: { competence: 0.1, autonomy: 0.03 }, forage: { competence: 0.06 }, build: { competence: 0.18, esteem: 0.1, safety: 0.15 }, craft: { competence: 0.15, autonomy: 0.05 },
  furnish: { competence: 0.08, safety: 0.06, meaning: 0.04 }, improve: { competence: 0.1, safety: 0.1, esteem: 0.08 }, carve: { competence: 0.1, meaning: 0.08, belonging: 0.06 },
  pray: { meaning: 0.25, belonging: 0.05, safety: 0.05 }, mourn: { meaning: 0.15, attachment: 0.05 }, wander: { autonomy: 0.12, curiosity: 0.1, stimulation: 0.1 },
  look: { curiosity: 0.12, stimulation: 0.1, meaning: 0.03 }, fire: { safety: 0.12 }, warm: { safety: 0.08 }, stash: { safety: 0.1, competence: 0.05 }, sleep: { safety: 0.04 },
  sew: { competence: 0.08, safety: 0.04 }, wash: { stimulation: 0.03 }, steal: { autonomy: 0.05 },
};
/** What each drive is satisfied by, for tilting choices toward what is wanted. */
const WANTS: Record<Drive, string[]> = {
  safety: ["build", "fire", "warm", "stash", "furnish", "improve", "sleep", "rest"],
  belonging: ["talk", "share", "comfort", "gift", "trade", "teach", "play", "pray"],
  esteem: ["create", "hunt", "teach", "build", "improve", "invent", "make", "craft"],
  autonomy: ["wander", "invent", "create", "fish"],
  competence: ["gather", "forage", "fish", "plant", "hunt", "craft", "build", "make", "invent", "sew"],
  curiosity: ["look", "wander", "ponder", "invent", "read"],
  meaning: ["pray", "ponder", "create", "teach", "carve", "mourn", "read"],
  attachment: ["comfort", "talk", "gift", "share", "carve"],
  intimacy: ["talk", "gift", "share", "carve"],
  play: ["play", "create", "talk"],
  stimulation: ["look", "wander", "play", "create", "read", "invent", "talk"],
};

export const want = (person: Person, drive: Drive) => 1 - psycheOf(person).drives[drive];

// ---- Stepping ----

export function psycheStep(person: Person, world: World, dt: number) {
  const ps = psycheOf(person);
  const now = world.clock ?? 0;
  const e = person.emotions ?? {};
  const n = person.needs;
  const base = baselines(person, world);
  const target = { ...base } as Record<Chem, number>;
  for (const [emotion, effects] of Object.entries(EMO_CHEM) as [Emotion, Partial<Record<Chem, number>>][]) {
    const v = e[emotion] ?? 0;
    if (v < 0.03) continue;
    for (const [c, k] of Object.entries(effects) as [Chem, number][]) target[c] += k * v;
  }
  // The body: hunger, tiredness, cold and hurt are stressful; a wound brings its own pain relief.
  if (n.hunger > 0.7) target.cortisol += (0.2 * (n.hunger - 0.7)) / 0.3;
  if (n.energy > 0.85) (target.cortisol += 0.12), (target.serotonin -= 0.08);
  if (person.cold > 0.5) target.cortisol += (0.15 * (person.cold - 0.5)) / 0.5;
  if (person.wound) (target.cortisol += 0.2 * person.wound), (target.endorphin += 0.3 * person.wound * ps.sens.endorphin);
  // Company: the people they are fond of, near.
  let fond = 0;
  let anyone = false;
  let kinNear = false;
  let rival: { who: Person; with: Person } | undefined;
  for (const q of world.people) {
    if (q === person) continue;
    const d = dist(person.x, person.z, q.x, q.z);
    if (d > 25) continue;
    anyone = true;
    const r = person.relations.get(q.id);
    const aff = r?.affinity ?? 0;
    if (d < 6 && aff > 0.4) fond++;
    if (d < 25 && aff > 0.5) ps.seen[q.id] = now;
    if (d < 10 && (q.mother === person.id || q.father === person.id || person.mother === q.id || person.father === q.id || bondOf(person, q) === "partner")) kinNear = true;
    // Jealousy: the one they love is giving their attention to someone else.
    if (bondOf(person, q) === "partner" && q.intent && (q.intent.kind === "talk" || q.intent.kind === "gift" || q.intent.kind === "share") && q.intent.targetId && q.intent.targetId !== person.id && (r?.affinity ?? 0) > 0.7) {
      const other = world.people.find((x) => x.id === q.intent!.targetId);
      if (other && other !== person && dist(other.x, other.z, q.x, q.z) < 6 && (q.relations.get(other.id)?.affinity ?? 0) > 0.4) rival = { who: other, with: q };
    }
    if (r && r.affinity < -0.4 && d < 12) feel(person, "contempt", 0.0015 * dt);
    if (d < 4 && q.illness && q.illness.severity > 0.4) feel(person, "disgust", 0.01 * dt);
    if (d < 8 && aff > 0.3 && (q.mood < -0.35 || q.wound || q.illness)) feel(person, "empathy", 0.02 * dt);
    if ((e.love ?? 0) < 0.9 && d < 6 && (bondOf(person, q) === "partner" || ((q.mother === person.id || q.father === person.id) && q.age < 10))) feel(person, "love", 0.003 * dt * Math.max(0.3, aff));
  }
  if (fond > 0) (target.oxytocin += Math.min(0.3, 0.1 * fond) * ps.sens.oxytocin), (target.serotonin += Math.min(0.08, 0.03 * fond));
  if (!anyone && n.social > 0.6) target.oxytocin -= 0.1;
  if (rival) feel(person, "jealousy", 0.02 * dt * (0.4 + 0.6 * (person.relations.get(rival.with.id)?.affinity ?? 0.5)));

  // Chemistry moves toward its target, each at its own speed.
  for (const c of CHEMS) {
    const k = 1 - Math.pow(0.5, dt / HALF[c]);
    ps.chem[c] = clamp01(ps.chem[c] + (target[c] - ps.chem[c]) * k);
  }
  // Tolerance wears off; a craving shows where it has worn and the reward is gone.
  ps.sens.dopamine = Math.min(1, ps.sens.dopamine + dt / (3 * DAY));
  ps.sens.endorphin = Math.min(1, ps.sens.endorphin + dt / (3 * DAY));
  ps.sens.oxytocin = Math.min(1, ps.sens.oxytocin + dt / (6 * DAY));
  if (ps.rewarded) (ps.lastReward = now), (ps.rewarded = false);
  const wanted = clamp01((1 - ps.sens.dopamine) * clamp01((now - (ps.lastReward ?? now)) / (0.25 * DAY)) * 0.9);
  ps.deficit += (wanted - ps.deficit) * (1 - Math.pow(0.5, dt / 300));

  // Stress that goes on becomes a state that outlasts it.
  if (ps.chem.cortisol > 0.45) ps.strain = clamp01(ps.strain + ((ps.chem.cortisol - 0.45) * dt) / (0.5 * DAY));
  else ps.strain = clamp01(ps.strain - dt / (3 * DAY));
  if (!ps.state && ps.strain > 0.5) {
    ps.state = ps.chem.serotonin < 0.4 || ps.chem.dopamine < 0.3 || (e.despair ?? 0) > 0.2 || (e.loneliness ?? 0) > 0.3 ? "depressed" : "anxious";
    note(person, world, ps.state === "depressed" ? "Everything feels grey and heavy, and I cannot see the point of it." : "I cannot settle. Something bad feels about to happen.");
    tally(world, ps.state === "depressed" ? "depressions" : "anxieties");
    milestone(person, world, ps.state, ps.state === "depressed" ? "fell into a dark time" : "was gripped by dread for a while");
  } else if (ps.state && ps.strain < 0.25 && ps.chem.serotonin > 0.45) {
    note(person, world, "The weight has lifted, little by little.");
    ps.state = undefined;
    tally(world, "recoveries from low states");
  }
  if (ps.state === "depressed" && ps.strain > 0.4) feel(person, "despair", 0.0004 * dt * ((ps.strain - 0.3) / 0.7));
  if (ps.state) ps.strain = clamp01(ps.strain - (dt / (6 * DAY)) * (1 + fond)); // most low spells ease with time, and faster in company

  // Drives wear down, and some follow their circumstances.
  for (const d of DRIVES) {
    const days = WEAR_DAYS[d];
    if (days) ps.drives[d] = clamp01(ps.drives[d] - dt / (days * DAY));
  }
  const dread = world.things.some((t) => AFFORDANCES[t.kind]?.predator && (AFFORDANCES[t.kind]?.danger ?? 0) > 0.5 && dist(t.x, t.z, person.x, person.z) < 45);
  const roofed = world.things.some((t) => (t.kind === "shelter" || (t.kind === "campfire" && (t.fuel ?? 0) > 0)) && dist(t.x, t.z, person.x, person.z) < 10);
  const safeTarget = dread ? 0.2 : roofed ? 0.9 : isNight(now) ? 0.45 : 0.7;
  ps.drives.safety += (safeTarget - ps.drives.safety) * (1 - Math.pow(0.5, dt / (0.2 * DAY)));
  const belongTarget = Math.min(1, 0.15 + 0.3 * fond + (anyone ? 0.1 : 0));
  ps.drives.belonging += (belongTarget - ps.drives.belonging) * (1 - Math.pow(0.5, dt / (0.8 * DAY)));
  const attachTarget = kinNear ? 0.9 : 0.35;
  ps.drives.attachment += (attachTarget - ps.drives.attachment) * (1 - Math.pow(0.5, dt / (0.6 * DAY)));

  // Feelings that come from how things stand.
  if (n.social > 0.75 && !anyone) feel(person, "loneliness", 0.004 * dt);
  else if (anyone && (e.loneliness ?? 0) > 0) feel(person, "loneliness", -0.003 * dt * fond);
  if (ps.drives.stimulation < 0.25) feel(person, "boredom", 0.002 * dt);
  if (person.plan || (world.weather?.season ?? 1) === 0 || person.pregnant) feel(person, "hope", 0.0008 * dt);
  for (const [id, last] of Object.entries(ps.seen)) {
    const r = person.relations.get(id);
    const alive = world.people.some((q) => q.id === id);
    if (!r || r.affinity < 0.6) continue;
    if (alive && now - last > 0.5 * DAY) feel(person, "longing", 0.0015 * dt * r.affinity);
    if (!alive) feel(person, "nostalgia", 0.0006 * dt * r.affinity);
  }
  if ((person.laughUntil ?? 0) > now) feel(person, "humour", 0.1 * dt);
  const fear = e.fear ?? 0;
  if (ps.prevFear > 0.4 && fear < 0.15) feel(person, "relief", 0.5);
  if (ps.prevFear < 0.1 && fear > 0.4) feel(person, "surprise", 0.6);
  ps.prevFear = fear;

  // A lasting fright fixes itself to what was near; later it fires at the sight of it.
  if (fear > 0.7) {
    const near = world.things.find((t) => AFFORDANCES[t.kind]?.danger && dist(t.x, t.z, person.x, person.z) < 20);
    if (near && !ps.cues.some((c) => c.kind === near.kind)) ps.cues.push({ kind: near.kind, strength: clamp01(0.5 + 0.4 * fear) });
  }
  for (const cue of ps.cues) {
    if (now - (cue.fired ?? -1e9) < 60) continue;
    const t = world.things.find((q) => q.kind === cue.kind && dist(q.x, q.z, person.x, person.z) < 15);
    if (!t) continue;
    cue.fired = now;
    const real = (AFFORDANCES[t.kind]?.danger ?? 0) > 0;
    feel(person, "fear", 0.3 * cue.strength);
    ps.chem.cortisol = clamp01(ps.chem.cortisol + 0.15 * cue.strength);
    if (!real) cue.strength *= 0.8; // nothing happened: it fades
    else cue.strength = Math.min(1, cue.strength + 0.05);
    if (cue.strength < 0.1) ps.cues.splice(ps.cues.indexOf(cue), 1);
    tally(world, "cuesFired");
    break;
  }
  // The love of a thing that went with a pleasure.
  if ((e.joy ?? 0) > 0.5) {
    const near = world.things.find((t) => !t.mob && !AFFORDANCES[t.kind]?.danger && t.kind !== "river" && dist(t.x, t.z, person.x, person.z) < 6);
    if (near) ps.likes[near.kind] = Math.min(1, (ps.likes[near.kind] ?? 0) + 0.002 * dt);
  }
  // Habits fade when not kept up.
  if (now % 600 < dt) for (const [k, h] of Object.entries(ps.habits)) if (now - h.last > 3 * DAY) (h.n = Math.max(0, h.n - 2)), (h.auto = h.n >= 10), h.n === 0 && delete ps.habits[k];

  // A person's life story is kept up to date.
  if (now - ps.storyAt > DAY) refreshStory(person, world);
  // Falling in love, once, is remembered.
  if (!ps.milestones.some((m) => m.kind === "love")) {
    for (const q of world.people) if (q !== person && bondOf(person, q) === "partner") milestone(person, world, "love", `fell in love with ${q.name}`);
  }
}

// ---- What they do ----

const bucketOf = (world: World) => {
  const h = hourOf(world.clock ?? 0);
  return h < 6 ? "night" : h < 11 ? "morning" : h < 17 ? "day" : h < 21 ? "evening" : "night";
};
const REWARD_KINDS = new Set(["eat", "drink", "play", "talk", "create"]);
const SURVIVAL = new Set(["eat", "drink", "flee", "sleep"]);

/** Tilts the scores of what they could do by what they want, what their body is doing, and what has become habit. */
export function psycheBias(person: Person, world: World, opts: { intent: Omit<Intent, "arrived">; score: number }[]) {
  const ps = psycheOf(person);
  const c = ps.chem;
  const bucket = bucketOf(world);
  const boredom = want(person, "stimulation");
  // The body comes first: as hunger or thirst press, the wants fade from the scoring.
  const pressing = Math.max(person.needs.hunger, person.needs.thirst);
  const yielding = clamp01(1 - (pressing - 0.22) * 2.6);
  for (const o of opts) {
    const kind = o.intent.kind;
    if (SURVIVAL.has(kind)) continue;
    let bonus = 0;
    for (const d of DRIVES) if (WANTS[d].includes(kind)) bonus += 0.35 * Math.max(0, want(person, d) - 0.3);
    // Chemistry: dopamine pulls toward the new and the risky, oxytocin toward people, stress toward safety and away from everything else.
    const novel = ["wander", "invent", "look", "read", "ponder", "create"].includes(kind);
    const social = ["talk", "share", "comfort", "gift", "trade", "teach", "play"].includes(kind);
    const safe = ["rest", "warm", "fire", "build", "stash", "furnish", "sleep"].includes(kind);
    const fierce = ["hunt"].includes(kind);
    if (novel) bonus += 0.5 * (c.dopamine - 0.4);
    if (social) bonus += 0.6 * (c.oxytocin - 0.3);
    bonus += (safe ? 0.5 : -0.35) * (c.cortisol - 0.25) * (kind === "fire" || kind === "warm" ? 1 : 1);
    if (fierce) bonus += 0.6 * (c.testosterone - 0.25);
    if (c.noradrenaline > 0.5 && novel) bonus -= 0.2;
    // Lasting states: a depressed person does less of everything and withdraws; an anxious one avoids what is new and is drawn to what is safe.
    if (ps.state === "depressed") bonus -= social ? 0.3 : 0.15;
    if (ps.state === "anxious") bonus += safe ? 0.25 : novel || kind === "wander" ? -0.3 : 0;
    // A craving for reward draws them to what gave it.
    if (ps.deficit > 0.1 && REWARD_KINDS.has(kind)) bonus += 0.6 * ps.deficit;
    // Boredom pushes them off what they have just been doing.
    if (boredom > 0.5 && ps.recent.slice(-4).includes(kind)) bonus -= 0.3 * (boredom - 0.4);
    if (boredom > 0.5 && !ps.recent.includes(kind)) bonus += 0.15 * (boredom - 0.4);
    // Habit: what is done at this hour by habit runs by itself.
    const h = ps.habits[`${kind}@${bucket}`];
    if (h?.auto) bonus += 0.3;
    // Conditioned fear and liking of what is at the target.
    const t = o.intent.targetId ? world.things.find((q) => q.id === o.intent.targetId) : undefined;
    if (t) {
      const cue = ps.cues.find((x) => x.kind === t.kind);
      if (cue) bonus -= 0.6 * cue.strength;
      bonus += 0.2 * (ps.likes[t.kind] ?? 0);
    }
    o.score += Math.max(-0.4, Math.min(0.4, bonus)) * yielding;
  }
}

/** Called when they finish something: what it fed, what it did to the body, and the habit it adds to. */
export function afterAct(world: World, person: Person, intent: Intent) {
  const ps = psycheOf(person);
  const kind = intent.kind;
  const feeds = FEEDS[kind];
  if (feeds) for (const [d, v] of Object.entries(feeds) as [Drive, number][]) ps.drives[d] = clamp01(ps.drives[d] + v);
  ps.recent.push(kind);
  if (ps.recent.length > 8) ps.recent.shift();
  const key = `${kind}@${bucketOf(world)}`;
  const h = (ps.habits[key] ??= { n: 0, auto: false, last: 0 });
  h.n++;
  h.last = world.clock ?? 0;
  if (!h.auto && h.n >= 10) h.auto = true;
  switch (kind) {
    case "eat":
    case "drink":
      psycheEvent(person, "reward", 0.6);
      break;
    case "talk":
    case "share":
    case "gift":
    case "trade":
    case "teach":
      psycheEvent(person, "social", 1);
      break;
    case "comfort":
      psycheEvent(person, "touch", 1);
      break;
    case "play":
      psycheEvent(person, "laughter", 1);
      break;
    case "create":
    case "invent":
    case "make":
    case "build":
    case "craft":
      psycheEvent(person, "achievement", 1);
      break;
    case "ponder":
    case "read":
    case "wander":
    case "look":
      psycheEvent(person, "novelty", 0.7);
      break;
    case "hunt":
    case "gather":
    case "fish":
    case "plant":
    case "forage":
      psycheEvent(person, "reward", 0.25);
      break;
    case "sleep":
      consolidate(person, world);
      break;
    default:
      break;
  }
}

// ---- Memory ----

/** How well a journal line is remembered now: what mattered fades slowly, what did not fades in a few days. */
export function memoryStrength(entry: { t: number; w?: number }, now: number): number {
  const w = entry.w ?? 0.12;
  return w * Math.pow(0.5, (now - entry.t) / (DAY * (0.5 + 6 * w)));
}
const NEGATIVE = /died|Died|Quarrel|Ran from|hurt|bit me|got away|cold|hungry|grave|lost|afraid|frightens|failed/i;
/** What comes back when something cues it: the matching lines, strongest first, shaded by how they feel now. */
export function recall(person: Person, world: World, cue: { who?: string; word?: string }, limit = 3): { text: string; strength: number; shade: "fondly" | "darkly" | "plainly" }[] {
  const now = world.clock ?? 0;
  const mood = person.mood;
  const out: { text: string; strength: number; shade: "fondly" | "darkly" | "plainly"; entry: (typeof person.journal)[number] }[] = [];
  for (const entry of person.journal) {
    const hit = (cue.who && entry.text.includes(cue.who)) || (cue.word && entry.text.toLowerCase().includes(cue.word.toLowerCase()));
    if (!hit) continue;
    let s = memoryStrength(entry, now);
    const bad = NEGATIVE.test(entry.text);
    // A low mood finds the bad things easier to bring back, a good one the good.
    if (mood < -0.2) s *= bad ? 1.4 : 0.75;
    else if (mood > 0.3) s *= bad ? 0.75 : 1.3;
    if (s < 0.04) continue; // forgotten
    out.push({ text: entry.text, strength: s, shade: mood < -0.2 ? "darkly" : mood > 0.3 ? "fondly" : "plainly", entry });
  }
  out.sort((a, b) => b.strength - a.strength);
  const picked = out.slice(0, limit);
  for (const p of picked) p.entry.w = Math.min(1, (p.entry.w ?? 0.12) + 0.02); // remembering it keeps it
  return picked.map(({ text, strength, shade }) => ({ text, strength, shade }));
}

/** Sleep sets the day's strongest memories and lets the weak ones go; and sometimes they dream. */
export function consolidate(person: Person, world: World) {
  const ps = psycheOf(person);
  const now = world.clock ?? 0;
  const day = person.journal.filter((j) => now - j.t < DAY).sort((a, b) => (b.w ?? 0.12) - (a.w ?? 0.12));
  for (const j of day.slice(0, 3)) j.w = Math.min(1, (j.w ?? 0.12) + 0.08);
  for (let i = person.journal.length - 1; i >= 0; i--) {
    const j = person.journal[i]!;
    if (now - j.t > 2 * DAY && memoryStrength(j, now) < 0.03 && (j.w ?? 0.12) < 0.2) person.journal.splice(i, 1);
  }
  const salient = day[0];
  const scared = ps.cues.some((c) => c.strength > 0.5) || ps.strain > 0.6;
  if (scared && rand(person) < 0.5) {
    feel(person, "fear", 0.3);
    ps.chem.cortisol = clamp01(ps.chem.cortisol + 0.1);
    ps.nightmare = now;
    note(person, world, "Woke in a fright from a bad dream.");
    tally(world, "nightmares");
  } else if (salient && rand(person) < 0.4) {
    const text = salient.text.replace(/\.$/, "");
    note(person, world, `Dreamed about it: ${text.slice(0, 80)}.`);
    if (!NEGATIVE.test(salient.text)) ps.chem.oxytocin = clamp01(ps.chem.oxytocin + 0.05);
    tally(world, "dreams");
  }
}

// ---- Bias ----

/** What an act does to how they see someone depends on how they already see them: a friend's slip is forgiven and a stranger's kindness is half noticed, a foe's kindness is doubted and their slip confirms the worst. */
export function appraise(person: Person, otherId: string, delta: number): number {
  const aff = person.relations.get(otherId)?.affinity ?? 0;
  const s = person.psyche?.state === "depressed" ? 0.8 : 1; // a low state sees kindness less
  if (delta >= 0) return delta * (0.65 + 0.7 * clamp01((aff + 1) / 2)) * s;
  return delta * (1.45 - 0.9 * clamp01((aff + 1) / 2));
}

// ---- Life story ----

export function milestone(person: Person, world: World, kind: string, text: string) {
  const ps = psycheOf(person);
  ps.milestones.push({ t: world.clock ?? 0, kind, text });
  if (ps.milestones.length > 30) ps.milestones.shift();
  refreshStory(person, world);
}
const stageOf = (age: number) => {
  const h = humanYears(age);
  return h < 2 ? "a baby" : h < 6 ? "a small child" : h < 12 ? "a child" : h < 18 ? "a young person" : h < 35 ? "in the strength of youth" : h < 55 ? "in the middle of life" : "growing old";
};
/** The story of a life, from where they began and what has happened since, in the stage they are in now. */
export function refreshStory(person: Person, world: World) {
  const ps = psycheOf(person);
  ps.storyAt = world.clock ?? 0;
  const first = (person.story ?? "").split(/(?<=\.)\s/)[0] ?? "";
  const recent = ps.milestones.slice(-4).map((m) => m.text);
  const mood = person.mood > 0.3 ? "Life is good to them." : person.mood < -0.3 ? "These are hard days." : "";
  const state = ps.state === "depressed" ? "A heaviness sits on them." : ps.state === "anxious" ? "They cannot settle." : "";
  person.story = [first, `${person.name} is ${stageOf(person.age)}.`, recent.length ? `Along the way ${person.name} ${recent.join(", then ")}.` : "", mood, state].filter(Boolean).join(" ");
}

