// The minds of Eden's people. Everything here is plain code that runs on the player's own machine: no network and no AI model.
//
// A person has needs that grow with time, a personality that weights what they care about, a memory of the things they have seen and
// how those things made them feel, and a list of things they could do. Each moment they score what they could do, favouring what
// the needs, personality, memory and a little chance say, and carry the best choice out; danger overrides everything. What they
// choose is not scripted, but it is repeatable: the same seed gives the same life, so it can be tested.
//
// The host (edenAgents.ts) feeds this the world's things and turns each person's `intent` into movement and an animation.

import { gift, newIdentity, neglect, practise, roleOf, skillOf, storyFor, teach, valueOf, SKILL_WORDS, type Skill, type Value } from "./identity";
import { fadeNorms, isCustom, NORM_TEXT, reinforce, standing, strengthOf, type NormId } from "./norms";
import { fade, feel as feelEmotion, importance, moodPush, opinionTags, BELIEF_WORDS, type Belief, type Emotion } from "./inner";
import { converse } from "./speech";
import { COMFORT_C, DAY, EDEN_CLIMATE, FISH_BY_SEASON, growthRate, hourOf, isDark, seasonAt, weatherAt, YEAR, type Climate, type Weather } from "./earth";
export { DAY, hourOf };

export type NeedName = "hunger" | "thirst" | "energy" | "social" | "joy";
// 0 is satisfied, 1 is urgent. `joy` rises when nothing pleasant has happened for a while.
export type Needs = Record<NeedName, number>;

export interface Personality {
  boldness: number; // 0 timid .. 1 fearless: how near danger they will go, and how early they run
  sociability: number; // how much they want company
  curiosity: number; // how readily they explore and try things
  appetite: number; // how hungry and thirsty they get
  patience: number; // how long they stay with one thing before moving on
}

// What a thing is for. Kinds are names the world gives its things; the table below says what each offers.
export interface Affordances {
  food?: number; // how much hunger one meal removes
  water?: boolean;
  fish?: boolean; // fish live here, caught with patience
  rest?: boolean; // somewhere to sit or lie down
  view?: boolean; // somewhere beautiful (raises joy)
  play?: boolean; // open ground to move about on (raises joy a little)
  danger?: number; // 0..1: how much it hurts and frightens when close
  creature?: boolean; // alive and company-like, but not a person
  stock?: number; // how many meals it holds before it is used up (undefined: never runs out)
  wood?: boolean; // dead wood lies about here to be gathered
  mobile?: number; // walks about on its own, at this speed (m/s)
  prey?: boolean; // hunted by foxes and by people with a spear
  predator?: boolean; // hunts prey
  shelter?: boolean; // a roof: warmth against the cold and dry from the rain
  warm?: boolean; // a burning fire: warmth to anyone near it
}

export const AFFORDANCES: Record<string, Affordances> = {
  grove: { food: 0.5, wood: true },
  river: { water: true, fish: true },
  lake: { water: true, fish: true, view: true },
  // The wider world: woods with ripening berries, an orchard, a pinewood to rest in and burn, high ground to see from.
  woodland: { food: 0.35, stock: 10, wood: true, rest: true },
  orchard: { food: 0.6, stock: 8, wood: true },
  pinewood: { rest: true, wood: true },
  peak: { view: true, wood: true },
  wolf: { danger: 0.85, creature: true, mobile: 1.5, predator: true },
  horse: { creature: true, mobile: 1.1 },
  hollow: { rest: true, wood: true },
  overlook: { view: true, wood: true },
  meadow: { play: true },
  center: {},
  tree: { rest: true, wood: true },
  "tree of life": { food: 0.7, stock: 3, wood: true },
  "fruit tree": { food: 0.5, stock: 6, wood: true },
  // Built by the people: a fire that burns down, and a roof that doubles as a larder.
  campfire: { warm: true },
  shelter: { shelter: true, rest: true, food: 0.5 },
  "tree of knowledge": { view: true },
  rock: { rest: true },
  bush: { food: 0.25, stock: 4 },
  deer: { creature: true, mobile: 0.9, prey: true },
  alpaca: { creature: true, mobile: 0.6 },
  fox: { danger: 0.6, creature: true, mobile: 1.3, predator: true },
  // Planted by the people: a plot that bears fruit as the seasons allow, a meal at a time.
  crop: { food: 0.45, stock: 0, wood: false },
  fire: { danger: 0.9 },
  // Where someone who died was laid to rest; the people who loved them come and sit here.
  grave: { rest: false },
};

export interface Thing {
  id: string;
  kind: string; // a key of AFFORDANCES
  x: number;
  z: number;
  radius: number; // how near counts as "at" it; danger reaches further (below)
  stock?: number; // meals left, if it has a stock
  maxStock?: number; // a stock grows back, a meal at a time, up to this
  growth?: number; // seconds toward the next meal growing back (kept by step)
  fuel?: number; // a fire's seconds of burning left
  of?: string; // a grave: whose it is (a person id)
  prefab?: string; // the scene prefab that shows it (the host places it); absent for things the scene already has
  // A creature's own going about: where it is heading, when it last ate, how old it is (in Eden years).
  mob?: { tx: number; tz: number; wait: number; fed: number; age: number; fleeUntil: number };
}

// What a person remembers of a thing: where it is, and how being near it has felt.
export interface Memory {
  x: number;
  z: number;
  feeling: number; // -1 dreadful .. 1 lovely, moved by what happened there
  visits: number;
  lastSeen: number; // sim seconds
}

export type IntentKind = "eat" | "drink" | "rest" | "sleep" | "look" | "play" | "talk" | "flee" | "wander" | "linger" | "gather" | "fire" | "build" | "stash" | "forage" | "warm" | "share" | "comfort" | "plant" | "craft" | "hunt" | "fish" | "mourn";
export interface Intent {
  kind: IntentKind;
  targetId?: string; // a thing's id or another person's id
  x: number;
  z: number;
  speed: number;
  // Sim seconds left to spend once there (eating takes a while); the person stays until it runs out.
  remaining: number;
  arrived: boolean;
  // Sim seconds spent trying to get there; a goal that takes too long is given up, so nobody is stuck forever.
  age?: number;
}

// What they remember happening, in order, in their own words: the Creator can read it, and it is what they have to talk about.
export interface JournalEntry {
  t: number; // world clock, sim seconds
  text: string;
  w?: number; // how much it is worth remembering, 0..1 (inner.ts importance)
}

// How one person feels about another.
export interface Relation {
  affinity: number; // -1 dislike .. 1 fond
  trust: number; // 0 .. 1
  familiarity: number; // 0 .. 1, grows with time spent together
  lastTogether: number; // world clock
  gifts?: number; // times they gave food
  comforts?: number; // times they sat with them when low
  quarrels?: number; // times they have fallen out
  lastQuarrel?: number; // world clock of the last, until it is made right
}

// Something a person has set out to do: it tilts what they choose until it is done or given up.
export type GoalKind = "stockpile" | "shelter" | "befriend" | "explore" | "settle" | "farm";
export interface Goal {
  kind: GoalKind;
  target?: string; // a person's id or a thing's id
  progress: number; // 0..1
  started: number; // world clock
}

// What they weighed when they last chose, best first, so the Creator can see why.
export interface Choice {
  kind: IntentKind;
  target?: string;
  score: number;
  chosen: boolean;
}

export interface Person {
  goalCheck?: number; // world clock of the last time they thought about what to set out to do
  lastBirth?: number; // world clock a child of theirs was last born (mothers)
  spoken?: string[]; // the last few things they said aloud, so the voice does not repeat them
  promises?: { to: string; due: number }[]; // what they have promised, and by when
  pregnant?: { since: number; father: string }; // carrying a child, born after GESTATION
  illness?: { severity: number; since: number }; // sick, 0..1
  wound?: number; // hurt by an animal, 0..1: heals slowly and may turn bad
  cause?: string; // what is killing them, when it is not plain from their needs (childbirth)
  mother?: string;
  father?: string;
  name: string;
  sex: "m" | "f";
  age: number; // in Eden years (16 sim days each)
  journal: JournalEntry[];
  relations: Map<string, Relation>;
  goals: Goal[];
  lastChoice: Choice[];
  id: string;
  x: number;
  z: number;
  health: number; // 0..1
  needs: Needs;
  personality: Personality;
  memory: Map<string, Memory>;
  intent: Intent | undefined;
  mood: number; // -1 miserable .. 1 delighted; follows what happens to them
  say: string | undefined; // the last thing they said, for the host to show
  clock: number; // sim seconds this person has lived
  rngState: number;
  explored: Set<string>; // 20 m cells of the garden they have stood in, so a search goes somewhere new
  cold: number; // 0 comfortable .. 1 dangerously cold
  carry: { wood: number; food: number; seed: number }; // what they are carrying
  tools: { spear: boolean };
  grief?: number; // 0..1: how heavily a loss weighs; fades over days, eased by sitting at a grave and by company
  // What they have learned from living, from thinking back over what happened (reflect): each 0..1, and each tilts what they choose.
  lessons?: { prepare: number; careful: number };
  // What they have lived through since they last thought it over, in sim seconds (and frights), and when that was.
  values?: Record<Value, number>; // what matters to them (identity.ts)
  talents?: Record<Skill, number>; // how quickly they learn each skill
  skills?: Record<Skill, number>; // how good they are at each now
  story?: string; // who they are, in a few lines
  role?: string; // what they are known for (their best skill, once it is worth naming)
  emotions?: Partial<Record<Emotion, number>>; // what they feel now, each 0..1, fading at its own speed (inner.ts)
  stress?: number; // sim seconds spent very low; held long enough it breaks
  breakAt?: number; // world clock of their last break
  beliefs?: Record<string, Belief[]>; // what they have come to think of each person, from what that person has done
  felt?: { hungry: number; cold: number; scares: number; reflected: number };
}

export interface World {
  things: Thing[];
  people: Person[];
  // Those who have died, with how: their journals and who they were stay, and the living remember them.
  dead?: { person: Person; t: number; cause: string }[];
  // Sim seconds into the day cycle: a day is DAY seconds, and people sleep at night. Starts a few hours after dawn when absent.
  clock?: number;
  // How far from (0, 0) people may go. Wandering and searching are kept inside it, as the garden's own edge would; absent, no limit.
  radius?: number;
  // The climate the garden has; absent, Eden's own. `weather` is what it is like right now (kept by step).
  climate?: Climate;
  weather?: Weather;
  names?: Record<string, { name: string; by: string; known: string[] }>; // what the people call the places, who named each and who knows it
  norms?: Record<string, { strength: number; announced?: boolean }>; // customs forming among the people (norms.ts)
  fish?: number; // how many fish the river holds (kept by step)
  built?: number; // how many things the people have made (their ids)
  maxPeople?: number; // births stop at this many living people (default 12)
  tally?: Record<string, number>; // how often notable things have happened (for the lifelike check and the Creator's curiosity)
  rng?: number; // the world's own random stream (animals), kept so a saved world carries on the same
  // The Creator's hand on the weather: until `until` (world clock) it is warmer or colder by `tempOffset`, and `rain` forces it on or off.
  override?: { until: number; tempOffset: number; rain?: boolean };
}

// A day in Eden is 24 sim minutes (earth.ts): short enough to watch a whole life, long enough that a person eats about three times in it.
export const isNight = isDark; // the sun's hours change with the season (earth.ts)
// Seconds for a meal to grow back on a food source.
const REGROW_SECONDS = 150;

export const SIGHT = 28; // how far a person notices things
export const REACH = 1.6; // how near is "at" a person
const WALK = 1.6;
const RUN = 4.2;
// Seconds for a need to fill from satisfied to urgent. Chosen so a day (DAY) holds about three meals, six drinks, one long sleep, a few
// good conversations and some leisure, like a person's.
const FILL_SECONDS: Record<NeedName, number> = { hunger: 960, thirst: 800, energy: 1050, social: 600, joy: 700 };
// How far a need must have risen before it starts to matter, then how strongly it pulls as it climbs to 1.
const urge = (need: number, threshold: number) => clamp01((need - threshold) / (1 - threshold));

function rand(person: Person): number {
  // mulberry32: small, fast, and the same sequence for the same seed.
  person.rngState = (person.rngState + 0x6d2b79f5) | 0;
  let t = person.rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function worldRand(world: World): number {
  world.rng = ((world.rng ?? 12345) + 0x6d2b79f5) | 0;
  let t = world.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function makePerson(id: string, x: number, z: number, seed: number, personality: Partial<Personality> = {}, extra: { name?: string; sex?: "m" | "f"; age?: number; parents?: [Person, Person] } = {}): Person {
  const identity = newIdentity(seed, extra.parents);
  const person: Person = {
    ...identity,
    name: extra.name ?? id,
    sex: extra.sex ?? "m",
    age: extra.age ?? 20,
    journal: [],
    relations: new Map(),
    goals: [],
    lastChoice: [],
    id,
    x,
    z,
    health: 1,
    needs: { hunger: 0.2, thirst: 0.2, energy: 0.1, social: 0.3, joy: 0.3 },
    personality: { boldness: 0.5, sociability: 0.5, curiosity: 0.5, appetite: 0.5, patience: 0.5, ...personality },
    memory: new Map(),
    intent: undefined,
    mood: 0.2,
    say: undefined,
    clock: 0,
    rngState: seed | 0,
    explored: new Set(),
    cold: 0,
    carry: { wood: 0, food: 0, seed: 0 },
    tools: { spear: false },
  };
  if (extra.parents) {
    person.mother = extra.parents.find((q) => q.sex === "f")?.id;
    person.father = extra.parents.find((q) => q.sex === "m")?.id;
  }
  person.story = storyFor(person, extra.parents ? [extra.parents[0].name, extra.parents[1].name] : undefined);
  return person;
}

const dist = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);
// A point pulled back inside the garden's edge when it lies outside.
function inside(world: World, x: number, z: number): { x: number; z: number } {
  const r = world.radius;
  const d = Math.hypot(x, z);
  return r === undefined || d <= r ? { x, z } : { x: (x / d) * r, z: (z / d) * r };
}
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const clampMood = (v: number) => Math.max(-1, Math.min(1, v));
const aff = (t: Thing): Affordances => AFFORDANCES[t.kind] ?? {};
// Danger is felt well beyond touching distance.
const dangerReach = (t: Thing) => t.radius + 6 + 10 * (aff(t).danger ?? 0);

export type Bond = "stranger" | "acquaintance" | "friend" | "partner" | "rival";
export function bondOf(a: Person, b: Person): Bond {
  const ab = a.relations.get(b.id);
  const ba = b.relations.get(a.id);
  if (!ab || !ba) return "stranger";
  if (ab.affinity < -0.3 && ba.affinity < -0.3) return "rival";
  const strong = (r: Relation) => r.affinity > 0.8 && r.trust > 0.65 && r.familiarity > 0.55;
  if (strong(ab) && strong(ba) && a.sex !== b.sex) return "partner";
  if (ab.affinity > 0.5 && ba.affinity > 0.5) return "friend";
  return ab.familiarity > 0.1 ? "acquaintance" : "stranger";
}
const CHILD_NAMES = { m: ["Cain", "Abel", "Seth", "Enos", "Enoch", "Jared", "Noah", "Lamech"], f: ["Awan", "Azura", "Naamah", "Adah", "Zillah", "Milcah", "Dinah", "Lilith"] };
export const ADULT_AGE = 4; // Eden years: before this a child depends on the others

const KIND_PHRASE: Record<string, string> = {
  grove: "the fruit grove", river: "the river", hollow: "the resting hollow", overlook: "the overlook", meadow: "the meadow", center: "the garden center",
  tree: "a tree", "tree of life": "the Tree of Life", "tree of knowledge": "the Tree of Knowledge", rock: "a rock", bush: "a bush",
  deer: "a deer", alpaca: "an alpaca", fox: "a fox", fire: "a wild fire", campfire: "the campfire", shelter: "the shelter",
};
export const phrase = (t: Thing | undefined) => (t ? (KIND_PHRASE[t.kind] ?? `a ${t.kind}`) : "somewhere");
export function tally(world: World, key: string) {
  const t = (world.tally ??= {});
  t[key] = (t[key] ?? 0) + 1;
}
// What they have come to think of someone tilts whether they seek them out.
function opinionOf(person: Person, other: Person): number {
  let v = 0;
  for (const q of [other]) v += 0.3 * (person.relations.get(q.id)?.trust ?? 0.5) - 0.15;
  for (const b of person.beliefs?.[other.id] ?? []) v += b === "quarrelsome" ? -0.25 : 0.15;
  return v;
}

// Held very low for long enough, a person breaks: a bold, impatient one lashes out at whoever is near; the rest need to be alone.
function breakDown(person: Person, world: World, dt: number) {
  if (person.intent?.kind === "sleep" || person.age < ADULT_AGE) return;
  const now = world.clock ?? 0;
  person.stress = person.mood < -0.55 ? (person.stress ?? 0) + dt : Math.max(0, (person.stress ?? 0) - dt);
  if ((person.stress ?? 0) < 120 || now - (person.breakAt ?? -1e9) < DAY / 2) return;
  person.stress = 0;
  person.breakAt = now;
  tally(world, "breaks");
  const near = world.people.filter((q) => q !== person && dist(person.x, person.z, q.x, q.z) < 20).sort((a, b) => dist(person.x, person.z, a.x, a.z) - dist(person.x, person.z, b.x, b.z))[0];
  const p = person.personality;
  if (near && rand(person) < 0.15 + 0.7 * p.boldness * (1.1 - p.patience)) {
    const mine = relation(person, near.id, world);
    const theirs = relation(near, person.id, world);
    mine.affinity = Math.max(-1, mine.affinity - 0.2);
    theirs.affinity = Math.max(-1, theirs.affinity - 0.25);
    mine.trust = Math.max(0, mine.trust - 0.1);
    theirs.trust = Math.max(0, theirs.trust - 0.15);
    mine.lastQuarrel = now;
    theirs.lastQuarrel = now;
    mine.quarrels = (mine.quarrels ?? 0) + 1;
    theirs.quarrels = (theirs.quarrels ?? 0) + 1;
    feelEmotion(near, "anger", 0.5);
    near.mood = clampMood(near.mood - 0.2);
    feelEmotion(person, "shame", 0.4);
    person.mood = clampMood(person.mood + 0.3);
    person.say = "Enough! I cannot bear it!";
    note(person, world, `Lost my temper with ${near.name}.`);
    note(near, world, `${person.name} lost their temper with me.`);
    tally(world, "quarrels");
    tally(world, "outbursts");
  } else {
    const away = (near ? Math.atan2(person.z - near.z, person.x - near.x) : rand(person) * Math.PI * 2);
    const to = inside(world, person.x + Math.cos(away) * 25, person.z + Math.sin(away) * 25);
    person.intent = { kind: "wander", x: to.x, z: to.z, speed: WALK, remaining: 60, arrived: false };
    person.mood = clampMood(person.mood + 0.2);
    person.say = "I need to be alone.";
    note(person, world, "Needed to be alone.");
    tally(world, "withdrawals");
  }
}

// Sickness, as it is for people: it comes more easily to the very young and the old, to the cold, hungry and worn out, and from those who are
// already ill; rest, warmth and food bring most through; some do not.
const vulnerability = (age: number) => (age < 1 ? 3 : age < 4 ? 1.8 : age > 55 ? Math.min(2.5, 1 + (age - 55) / 20) : 1);
function tickIllness(person: Person, world: World, dt: number) {
  const now = world.clock ?? 0;
  const { needs } = person;
  const vul = vulnerability(person.age);
  const sheltered = world.things.some((t) => t.kind === "shelter" && dist(person.x, person.z, t.x, t.z) < 4);
  const resting = person.intent?.kind === "sleep" || person.intent?.kind === "rest";
  // A wound mends slowly with rest and care, drains a little strength, and can turn bad.
  if (person.wound) {
    person.wound = Math.max(0, person.wound - (dt / (5 * DAY)) * (resting ? 2 : 1) * (needs.hunger < 0.6 ? 1 : 0.4));
    person.health = clamp01(person.health - (dt / (12 * DAY)) * person.wound);
    if (!person.illness && rand(person) < (person.wound * 0.35 * (needs.hunger > 0.7 || person.cold > 0.5 ? 1.5 : 1) * dt) / DAY) {
      person.illness = { severity: 0.4 + 0.3 * person.wound, since: now };
      note(person, world, "My wound turned bad.");
      tally(world, "infections");
    }
    if (person.wound < 0.02) {
      person.wound = undefined;
      note(person, world, "My wound has healed.");
    }
  }
  const ill = person.illness;
  if (!ill) {
    let hazard = (0.025 / DAY) * vul * (1 + 1.5 * person.cold + 2.4 * Math.max(0, needs.hunger - 0.5) + (world.weather?.raining && !sheltered ? 0.5 : 0) + (needs.energy > 0.9 ? 0.5 : 0));
    for (const q of world.people) if (q !== person && q.illness && dist(person.x, person.z, q.x, q.z) < 4) hazard += (0.5 / DAY) * q.illness.severity;
    if (rand(person) < hazard * dt) {
      person.illness = { severity: 0.25 + 0.3 * rand(person), since: now };
      note(person, world, "Fell ill.");
      tally(world, "illnesses");
    }
    return;
  }
  const worse = person.cold > 0.6 || needs.hunger > 0.8 || needs.thirst > 0.8;
  const mending = (1 / (4 * DAY)) * (resting ? 2 : 1) * (sheltered || person.cold < 0.2 ? 1.5 : 1) * (needs.hunger < 0.6 ? 1 : 0.4) * person.health / vul;
  ill.severity = clamp01(ill.severity + dt * ((worse ? 1 / (3 * DAY) : 0) - mending + 0.1 / DAY));
  person.health = clamp01(person.health - (dt / (6 * DAY)) * ill.severity * vul * (ill.severity > 0.5 ? 1 : 0.3));
  needs.energy = clamp01(needs.energy + (dt / FILL_SECONDS.energy) * ill.severity);
  person.mood = Math.min(person.mood, 0.2 - 0.9 * ill.severity);
  if (ill.severity <= 0.02) {
    person.illness = undefined;
    note(person, world, "Got well again.");
    tally(world, "recoveries");
  }
}

// What the voice asked the world to do on someone's behalf, checked first: an offer needs food in hand and someone hungry, a warning needs a
// danger they know of, a promise needs someone to promise it to. Anything that does not hold is simply not done.
export function applySpokenIntent(world: World, speaker: Person, listener: Person | undefined, intent: "offer" | "warn" | "promise"): boolean {
  if (!listener || !world.people.includes(speaker) || !world.people.includes(listener)) return false;
  const now = world.clock ?? 0;
  if (intent === "offer" && speaker.carry.food >= 1 && listener.needs.hunger > 0.4) {
    speaker.intent = { kind: "share", targetId: listener.id, x: listener.x, z: listener.z, speed: WALK, remaining: 4, arrived: false };
    tally(world, "spokenOffers");
    return true;
  }
  if (intent === "warn" && world.things.some((t) => aff(t).danger && speaker.memory.has(t.id))) {
    feelEmotion(listener, "fear", 0.2);
    note(listener, world, `${speaker.name} warned me to be careful.`);
    tally(world, "spokenWarnings");
    return true;
  }
  if (intent === "promise" && listener.needs.hunger > 0.4 && !speaker.promises?.some((x) => x.to === listener.id)) {
    (speaker.promises ??= []).push({ to: listener.id, due: now + DAY / 4 });
    note(speaker, world, `I promised ${listener.name} food.`);
    note(listener, world, `${speaker.name} promised me food.`);
    tally(world, "promises");
    return true;
  }
  return false;
}

// A promise kept is remembered kindly; one let lapse costs trust.
function keepPromises(person: Person, world: World) {
  if (!person.promises?.length) return;
  const now = world.clock ?? 0;
  person.promises = person.promises.filter((pr) => {
    if (now < pr.due) return true;
    const other = world.people.find((q) => q.id === pr.to);
    if (other) {
      const r = relation(other, person.id, world);
      r.trust = Math.max(0, r.trust - 0.12);
      feelEmotion(other, "anger", 0.2);
      note(other, world, `${person.name} did not keep their word to me.`);
      note(person, world, `I did not keep my word to ${other.name}.`);
      feelEmotion(person, "shame", 0.3);
      tally(world, "brokenPromises");
    }
    return false;
  });
}

// The first person to stand somewhere may give it a name, which then spreads by word of mouth.
const NAMES: Record<string, string[]> = {
  river: ["Slow Water", "Silver Run", "the Whisper", "Cold Braid"],
  lake: ["Still Water", "the Mirror", "Deep Blue", "Heron's Rest"],
  grove: ["Honey Grove", "the Sweet Trees", "Fruitfall"],
  meadow: ["Soft Grass", "the Green Hall", "Larksong"],
  peak: ["the Grey Crown", "Wolf Hills", "the Cold Ridge"],
  woodland: ["Old Oaks", "the Berry Wood", "Deer Wood"],
  pinewood: ["Dark Pines", "the Needle Wood", "Resin Hollow"],
  orchard: ["the Forgotten Rows", "Orchard of the Old Ones"],
  overlook: ["the Lookout", "High Seat", "Windy Brow"],
  hollow: ["the Cradle", "Quiet Dip", "the Nest"],
};
function nameThePlace(person: Person, world: World, t: Thing) {
  const options = NAMES[t.kind];
  if (!options || world.names?.[t.id] || person.age < ADULT_AGE) return;
  if (rand(person) > 0.5 * (0.4 + 0.6 * person.personality.curiosity)) return;
  const taken = new Set(Object.values(world.names ?? {}).map((n) => n.name));
  const name = options.filter((n) => !taken.has(n))[Math.floor(rand(person) * options.length)] ?? options[0]!;
  (world.names ??= {})[t.id] = { name, by: person.id, known: [person.id] };
  note(person, world, `I named the ${t.kind === "peak" ? "hills" : t.kind}: ${name}.`);
  tally(world, "named");
}
function shareNames(a: Person, b: Person, world: World) {
  for (const [from, to] of [[a, b], [b, a]] as const) {
    for (const n of Object.values(world.names ?? {})) {
      if (!n.known.includes(from.id) || n.known.includes(to.id)) continue;
      n.known.push(to.id);
      note(to, world, `${from.name} told me the place is called ${n.name}.`);
      tally(world, "namesShared");
      return;
    }
  }
}

// A norm gains ground; when it becomes a custom everyone writes it down.
function uphold(world: World, id: NormId, by: Person, amount: number) {
  if (!reinforce(world, id, by, amount)) return;
  for (const q of world.people) note(q, world, `A custom has formed among us: ${NORM_TEXT[id]}.`);
  tally(world, "customs");
}

function note(person: Person, world: World, text: string) {
  person.journal.push({ t: world.clock ?? 0, text, w: importance(text) });
  if (person.journal.length > 400) {
    // Forget what mattered least and happened longest ago, not simply the oldest.
    const now = world.clock ?? 0;
    let worst = 0;
    let worstScore = Infinity;
    for (let i = 0; i < person.journal.length - 20; i++) {
      const j = person.journal[i]!;
      const score = (j.w ?? 0.12) * Math.exp(-(now - j.t) / (6 * DAY));
      if (score < worstScore) {
        worstScore = score;
        worst = i;
      }
    }
    person.journal.splice(worst, 1);
  }
}
function relation(person: Person, otherId: string, world: World): Relation {
  let r = person.relations.get(otherId);
  if (!r) {
    r = { affinity: 0.2, trust: 0.3, familiarity: 0, lastTogether: world.clock ?? 0 };
    person.relations.set(otherId, r);
  }
  return r;
}

const burning = (t: Thing) => t.kind === "campfire" && (t.fuel ?? 0) > 0;
// Seconds a fire burns on one armful of wood (two hours of the real thing, at one sim second to a minute).
const FIRE_SECONDS_PER_WOOD = 120;
const PREFAB_OF: Record<string, string> = { campfire: "Campfire", shelter: "Shelter", grave: "Grave", crop: "Crop", deer: "Deer", fox: "Fox", wolf: "Wolf", horse: "Horse" };
export function make(world: World, kind: string, x: number, z: number, extra: Partial<Thing> = {}): Thing {
  world.built = (world.built ?? 0) + 1;
  const thing: Thing = { id: `${kind}-${world.built}`, kind, x, z, radius: 3, prefab: PREFAB_OF[kind], ...extra };
  world.things.push(thing);
  return thing;
}

function feel(person: Person, thing: Thing, delta: number) {
  const m = person.memory.get(thing.id);
  if (m) m.feeling = Math.max(-1, Math.min(1, m.feeling + delta));
}

function notice(person: Person, world: World) {
  for (const t of world.things) {
    if (dist(person.x, person.z, t.x, t.z) > SIGHT) continue;
    const known = person.memory.get(t.id);
    if (known) {
      known.x = t.x;
      known.z = t.z;
      known.lastSeen = person.clock;
    } else {
      // A first sight: curiosity makes a new thing pleasant, and a dangerous one is dreaded from the start.
      const danger = aff(t).danger ?? 0;
      person.memory.set(t.id, { x: t.x, z: t.z, feeling: danger ? -danger : 0.1 * person.personality.curiosity, visits: 0, lastSeen: person.clock });
      if (t.kind !== "center") note(person, world, danger ? `Saw ${phrase(t)}. It frightens me.` : `Came upon ${phrase(t)}.`);
    }
  }
}

// How frightened a person is by what is near them: 0 calm .. 1 terrified, and where the worst of it is.
function fear(person: Person, world: World): { level: number; from?: Thing } {
  let level = 0;
  let from: Thing | undefined;
  for (const t of world.things) {
    const danger = aff(t).danger;
    if (!danger) continue;
    const d = dist(person.x, person.z, t.x, t.z);
    const reach = dangerReach(t);
    if (d > reach) continue;
    // Closer is worse; the bold are less moved until it is nearly on them.
    const closeness = 1 - d / reach;
    const f = danger * closeness * (1.4 - person.personality.boldness);
    if (f > level) {
      level = f;
      from = t;
    }
  }
  return { level: Math.min(1, level), from };
}

interface Option {
  intent: Omit<Intent, "arrived">;
  score: number;
}

// What a person could do now, each with a score: how much the need behind it has risen, shaped by personality and memory, less the effort of
// getting there. Nobody eats when they are not hungry: a need pulls only once it has risen past its threshold.
function options(person: Person, world: World): Option[] {
  const out: Option[] = [];
  const { needs, personality: p } = person;
  const night = isNight(world.clock ?? 0);
  const known = (t: Thing) => person.memory.get(t.id);
  const effort = (x: number, z: number) => dist(person.x, person.z, x, z) / 80;
  // How much a spot is dreaded for the dangers they know of that reach it.
  const dreadAt = (x: number, z: number) => {
    let dread = 0;
    for (const d of world.things) {
      const danger = aff(d).danger;
      if (!danger || !person.memory.has(d.id)) continue;
      if (dist(x, z, d.x, d.z) < dangerReach(d)) dread = Math.max(dread, danger * (1.5 - p.boldness) * 2 * (1 + 0.5 * (person.lessons?.careful ?? 0)));
    }
    return dread;
  };
  const add = (kind: IntentKind, t: Thing, want: number, seconds: number) => {
    if (want <= 0) return;
    const m = known(t);
    if (!m) return; // never seen: they do not know it exists
    // How it felt last time tilts the choice; a place they have loved draws them back. A place near something dangerous they know of is
    // avoided, less so the more desperate they are.
    const score = want + m.feeling * 0.2 - effort(t.x, t.z) - dreadAt(t.x, t.z) * (1 - Math.min(0.8, want / 2));
    out.push({ intent: { kind, targetId: t.id, x: t.x, z: t.z, speed: WALK, remaining: seconds }, score });
  };
  const hungry = 1.7 * urge(needs.hunger, 0.32 - 0.1 * p.appetite);
  const thirsty = 1.7 * urge(needs.thirst, 0.22);
  const tired = 1.5 * urge(needs.energy, night ? 0.2 : 0.62);
  const bored = urge(needs.joy, 0.35);
  for (const t of world.things) {
    const a = aff(t);
    if (a.food && (t.stock === undefined || t.stock > 0)) {
      // Under the custom, nobody takes the last of it in front of someone who is hungry.
      const holdBack = t.stock === 1 && isCustom(world, "fair") && world.people.some((q) => q !== person && q.needs.hunger > 0.6 && dist(q.x, q.z, t.x, t.z) < 25);
      add("eat", t, holdBack ? hungry * (1 - 0.6 * strengthOf(world, "fair") * (0.5 + valueOf(person, "fairness"))) : hungry, 18);
    }
    if (a.water) add("drink", t, thirsty, 8);
    if (a.rest) {
      // A roof is better to rest under, much better when it is cold or wet.
      const roof = a.shelter ? 0.5 + 0.9 * person.cold + (world.weather?.raining ? 0.4 : 0) : 0;
      add("rest", t, night ? 0 : tired > 0 ? tired + roof : 0, 35 + 30 * (1 - p.patience));
      if (night && needs.energy > 0.3) add("sleep", t, 2.2 + needs.energy + roof, 720);
    }
    if (a.view) add("look", t, bored * (0.6 + 0.8 * p.curiosity), 25 + 30 * p.patience);
    if (a.play) add("play", t, bored * (0.5 + 0.6 * p.curiosity), 30);
    if (a.creature && !a.danger) add("look", t, bored * 0.5 + 0.2 * p.curiosity * urge(needs.social, 0.4), 20);
  }
  earthOptions(person, world, out, add, known, hungry);
  goalOptions(person, world, out);
  skillOptions(person, world, out);
  lifeOptions(person, world, out);
  // A child does not gather, build or lay food by, and stays close to their mother.
  if (person.age < ADULT_AGE) {
    const allowed = new Set<IntentKind>(["mourn", "eat", "drink", "rest", "sleep", "look", "play", "talk", "comfort", "linger", "wander", "warm"]);
    const kept = out.filter((o) => allowed.has(o.intent.kind));
    out.splice(0, out.length, ...kept);
    const mother = world.people.find((q) => q.id === person.mother);
    if (mother && dist(person.x, person.z, mother.x, mother.z) > 10) {
      out.push({ intent: { kind: "wander", x: mother.x, z: mother.z, speed: WALK, remaining: 6 }, score: 1.2 });
    }
  }
  // With nowhere known to rest they sleep where they stand.
  if (night && needs.energy > 0.2 && !out.some((o) => o.intent.kind === "sleep")) {
    out.push({ intent: { kind: "sleep", x: person.x, z: person.z, speed: 0, remaining: 720 }, score: 2 + needs.energy });
  }
  if (!night && tired > 0 && !out.some((o) => o.intent.kind === "rest")) {
    out.push({ intent: { kind: "rest", x: person.x, z: person.z, speed: 0, remaining: 35 }, score: tired - 0.1 });
  }
  for (const other of world.people) {
    if (other === person) continue;
    if (dist(person.x, person.z, other.x, other.z) > SIGHT * 2) continue;
    // Someone hungry, and food in hand: give it.
    if (person.carry.food >= 1 && other.needs.hunger > 0.6 && other.carry.food < 1) {
      const rel = person.relations.get(other.id);
      out.push({
        intent: { kind: "share", targetId: other.id, x: other.x, z: other.z, speed: WALK, remaining: 4 },
        score: 1.3 * urge(other.needs.hunger, 0.5) * (0.5 + 0.5 * (rel?.affinity ?? 0.2)) + 0.2 * p.sociability + 0.4 * strengthOf(world, "share") + (other.mother === person.id || other.father === person.id || person.mother === other.id || person.father === other.id ? 0.35 * valueOf(person, "kin") : 0),
      });
    }
    // Someone low, and someone who cares: stay with them a while.
    if ((other.mood < -0.3 || (other.illness?.severity ?? 0) > 0.3 || (other.wound ?? 0) > 0.3) && (person.relations.get(other.id)?.affinity ?? 0) > 0.2 && !isNight(world.clock ?? 0)) {
      const rel = person.relations.get(other.id)!;
      out.push({
        intent: { kind: "comfort", targetId: other.id, x: other.x, z: other.z, speed: WALK, remaining: 12 },
        score: 1.1 * (-other.mood) * (0.4 + 0.6 * rel.affinity) + 0.15 * p.sociability,
      });
    }
    // People do not chatter through the night.
    const wish = night ? 0 : urge(needs.social, 0.32 - 0.1 * p.sociability) * (0.8 + 0.9 * p.sociability);
    if (wish <= 0) continue;
    out.push({
      intent: { kind: "talk", targetId: other.id, x: other.x, z: other.z, speed: WALK, remaining: 20 + 20 * p.sociability },
      score: 1.4 * wish - effort(other.x, other.z) + opinionOf(person, other),
    });
  }
  let searchOption: Option | undefined;
  const coldCritical = person.cold > 0.8;
  // Needing something nobody here knows the whereabouts of, they go looking: toward a part of the garden they have not been to.
  const searches: [boolean, number][] = [
    [!world.things.some((t) => aff(t).food && known(t) && (t.stock === undefined || t.stock > 0)), urge(needs.hunger, 0.25)],
    [!world.things.some((t) => aff(t).water && known(t)), urge(needs.thirst, 0.2)],
    [person.carry.wood < 2 && !world.things.some((t) => (aff(t).wood || burning(t)) && known(t)), urge(person.cold, 0.3)],
  ];
  const searching = Math.max(0, ...searches.filter(([missing]) => missing).map(([, u]) => u));
  if (searching > 0) {
    let best: { x: number; z: number } | undefined;
    for (let tries = 0; tries < 8; tries++) {
      const a = rand(person) * Math.PI * 2;
      const far = 22 + 14 * rand(person);
      const { x, z } = inside(world, person.x + Math.cos(a) * far, person.z + Math.sin(a) * far);
      if (dreadAt(x, z) > 0) continue;
      if (!best) best = { x, z };
      if (!person.explored.has(`${Math.floor(x / 20)},${Math.floor(z / 20)}`)) {
        best = { x, z };
        break;
      }
    }
    if (best) {
      searchOption = { intent: { kind: "wander", x: best.x, z: best.z, speed: WALK, remaining: 2 }, score: 0.4 + 1.6 * searching };
      out.push(searchOption);
    }
  }
  // Freezing: only warmth, or the wood for it, or a roof.
  if (coldCritical) {
    const keep = out.filter((o) => {
      const kind = o.intent.kind;
      if (kind === "warm" || kind === "fire" || kind === "gather") return true;
      const target = thingById(world, o.intent.targetId);
      return (kind === "sleep" || kind === "rest") && target?.kind === "shelter";
    });
    if (keep.length) return keep;
    if (searchOption) return [searchOption];
  }
  // Starving or parched, nothing else is on the menu: only the remedy, or looking for one. Otherwise they would keep starting a nap or a
  // chat and being pulled out of it again.
  if (Math.max(needs.hunger, needs.thirst) > 0.85) {
    // The worse of the two decides; if its remedy is not known, looking for it comes before anything else, even a meal.
    const worse: IntentKind = needs.thirst >= needs.hunger ? "drink" : "eat";
    // Hunting is a remedy for hunger too.
    const remedies = out.filter((o) => o.intent.kind === worse || (worse === "eat" && (o.intent.kind === "hunt" || o.intent.kind === "fish")));
    if (remedies.length) return remedies;
    if (searchOption) return [searchOption];
  }
  // Leisure: wandering to somewhere new, or just standing a while. Curious people wander more; tired or hungry ones less.
  let angle = rand(person) * Math.PI * 2;
  let reach = 8 + 14 * rand(person);
  // Not toward something they know to be dangerous: pick again a few times.
  for (let tries = 0; tries < 6; tries++) {
    const at = inside(world, person.x + Math.cos(angle) * reach, person.z + Math.sin(angle) * reach);
    if (dreadAt(at.x, at.z) === 0) break;
    angle = rand(person) * Math.PI * 2;
    reach = 8 + 14 * rand(person);
  }
  const pressing = Math.max(urge(needs.hunger, 0.3), urge(needs.thirst, 0.22), urge(needs.energy, 0.6));
  const wanderTo = inside(world, person.x + Math.cos(angle) * reach, person.z + Math.sin(angle) * reach);
  out.push({
    intent: { kind: "wander", x: wanderTo.x, z: wanderTo.z, speed: WALK, remaining: 4 + 6 * rand(person) },
    score: night ? 0.02 : (0.14 + 0.3 * p.curiosity) * (1 - 0.7 * pressing),
  });
  // An expedition: a curious person with nothing pressing sets out for ground they have not seen, a long way off in a wide world.
  const reachOut = (world.radius ?? 0) > 100 ? 40 + 80 * rand(person) : 0;
  if (reachOut && !night && p.curiosity > 0.4 && pressing < 0.25 && needs.thirst < 0.4 && needs.hunger < 0.5) {
    const a3 = rand(person) * Math.PI * 2;
    const far = inside(world, person.x + Math.cos(a3) * reachOut, person.z + Math.sin(a3) * reachOut);
    if (dreadAt(far.x, far.z) === 0 && !person.explored.has(`${Math.floor(far.x / 20)},${Math.floor(far.z / 20)}`)) {
      out.push({ intent: { kind: "wander", x: far.x, z: far.z, speed: WALK, remaining: 3 }, score: 0.12 + 0.3 * (p.curiosity - 0.4) + 0.25 * (valueOf(person, "freedom") - 0.5) });
    }
  }
  out.push({ intent: { kind: "linger", x: person.x, z: person.z, speed: 0, remaining: 8 + 14 * p.patience }, score: (night ? 0.05 : 0.12) + 0.18 * p.patience });
  return out;
}

// What a person has set out to do. Every couple of minutes a person with fewer than two goals may take one up, drawn by what they are like and
// what the year is asking; it tilts what they choose until it is done or they give it up.
function goalProgress(person: Person, world: World, goal: Goal): number {
  switch (goal.kind) {
    case "stockpile":
      return Math.min(1, world.things.filter((t) => t.kind === "shelter").reduce((a, t) => a + (t.stock ?? 0), 0) / 14);
    case "shelter":
      return world.things.some((t) => t.kind === "shelter") ? 1 : 0;
    case "befriend": {
      const r = goal.target ? person.relations.get(goal.target) : undefined;
      return r ? Math.max(0, Math.min(1, r.affinity / 0.8)) : 0;
    }
    case "explore": {
      const cells = Math.max(6, Math.round(Math.PI * ((world.radius ?? 40) / 20) ** 2));
      return Math.min(1, person.explored.size / cells);
    }
    case "farm":
      return Math.min(1, world.things.filter((t) => t.kind === "crop").length / Math.max(2, world.people.filter((q) => q.age >= ADULT_AGE).length * 2));
    case "settle":
      return world.things.some((t) => t.kind === "shelter" && person.memory.has(t.id) && (person.memory.get(t.id)?.feeling ?? 0) > 0.4) ? 1 : 0;
  }
}
const GOAL_WORDS: Record<GoalKind, string> = { stockpile: "put food by for the winter", shelter: "build a shelter", befriend: "get to know", explore: "see all of the garden", settle: "make a home I love", farm: "grow my own food" };

function updateGoals(person: Person, world: World) {
  const now = world.clock ?? 0;
  for (let i = person.goals.length - 1; i >= 0; i--) {
    const g = person.goals[i]!;
    g.progress = goalProgress(person, world, g);
    if (g.progress >= 1) {
      tally(world, "goalsDone");
      feelEmotion(person, "pride", 0.5);
      note(person, world, `I did it: I wanted to ${GOAL_WORDS[g.kind]}${g.target ? ` ${world.people.find((q) => q.id === g.target)?.name ?? ""}` : ""}.`);
      person.mood = clampMood(person.mood + 0.2);
      person.goals.splice(i, 1);
    } else if (now - g.started > 3 * DAY && g.progress < 0.1) {
      note(person, world, `I gave up wanting to ${GOAL_WORDS[g.kind]}.`);
      person.goals.splice(i, 1);
    } else if (g.kind === "befriend" && !world.people.some((q) => q.id === g.target)) person.goals.splice(i, 1);
  }
  if (person.goals.length >= 2 || now - (person.goalCheck ?? -1e9) < 120 || person.age < ADULT_AGE) return;
  person.goalCheck = now;
  const season = world.weather?.season ?? 1;
  const winterAhead = season === 1 || season === 2 ? 1 : season === 0 ? 0.3 : 0.1;
  const has = (k: GoalKind) => person.goals.some((g) => g.kind === k);
  const p = person.personality;
  const candidates: { goal: Goal; weight: number }[] = [];
  const make = (kind: GoalKind, target?: string): Goal => ({ kind, target, progress: 0, started: now });
  if (!has("shelter") && !world.things.some((t) => t.kind === "shelter")) candidates.push({ goal: make("shelter"), weight: 0.4 + 0.6 * winterAhead });
  if (!has("stockpile") && world.things.some((t) => t.kind === "shelter") && goalProgress(person, world, make("stockpile")) < 0.8) candidates.push({ goal: make("stockpile"), weight: 0.9 * winterAhead });
  if (!has("explore") && goalProgress(person, world, make("explore")) < 0.8) candidates.push({ goal: make("explore"), weight: 0.2 + 0.7 * p.curiosity });
  if (!has("befriend")) {
    for (const other of world.people) {
      if (other === person) continue;
      const r = person.relations.get(other.id);
      if ((r?.affinity ?? 0.2) < 0.7) candidates.push({ goal: make("befriend", other.id), weight: 0.1 + 0.6 * p.sociability });
    }
  }
  if (!has("farm") && (season === 0 || season === 1) && goalProgress(person, world, make("farm")) < 0.8) candidates.push({ goal: make("farm"), weight: 0.3 + 0.5 * p.patience });
  if (!has("settle") && world.things.some((t) => t.kind === "shelter")) candidates.push({ goal: make("settle"), weight: 0.15 + 0.3 * p.patience });
  if (!candidates.length) return;
  const total = candidates.reduce((a, c) => a + c.weight, 0);
  // Not always: a person with no pressing idea simply gets on with the day.
  if (rand(person) > Math.min(0.9, total)) return;
  let r = rand(person) * total;
  for (const c of candidates) {
    r -= c.weight;
    if (r <= 0) {
      person.goals.push(c.goal);
      tally(world, "goalsSet");
      note(person, world, `I want to ${GOAL_WORDS[c.goal.kind]}${c.goal.target ? ` ${world.people.find((q) => q.id === c.goal.target)?.name ?? ""}` : ""}.`);
      return;
    }
  }
}

// Goals tilt the choice toward what serves them.
function goalOptions(person: Person, world: World, out: Option[]) {
  const pressing = Math.max(person.needs.hunger, person.needs.thirst, person.needs.energy);
  for (const g of person.goals) {
    for (const o of out) {
      const k = o.intent.kind;
      if (g.kind === "stockpile" && (k === "forage" || k === "stash")) o.score += 0.45;
      else if (g.kind === "shelter" && (k === "gather" || k === "build")) o.score += 0.55;
      else if (g.kind === "befriend" && (k === "talk" || k === "share" || k === "comfort") && o.intent.targetId === g.target) o.score += 0.5;
      else if (g.kind === "farm" && k === "plant") o.score += 0.5;
      else if (g.kind === "settle" && (k === "rest" || k === "sleep") && thingById(world, o.intent.targetId)?.kind === "shelter") o.score += 0.3;
    }
    if (g.kind === "explore") {
      // Somewhere they have not stood: a leg in a direction they have not gone.
      for (let tries = 0; tries < 8; tries++) {
        const a = rand(person) * Math.PI * 2;
        const far = 16 + 14 * rand(person);
        const at = inside(world, person.x + Math.cos(a) * far, person.z + Math.sin(a) * far);
        if (!person.explored.has(`${Math.floor(at.x / 20)},${Math.floor(at.z / 20)}`)) {
          out.push({ intent: { kind: "wander", x: at.x, z: at.z, speed: WALK, remaining: 3 }, score: (0.45 + 0.2 * person.personality.curiosity) * (1 - 0.8 * pressing) });
          break;
        }
      }
    }
  }
}

// Growing food, making a spear, and hunting.
// Fishing in the river, and sitting at the grave of someone they loved.
function lifeOptions(person: Person, world: World, out: Option[]) {
  const { needs } = person;
  const season = world.weather?.season ?? 1;
  const fish = world.fish ?? 0;
  if (needs.hunger > 0.3 && fish >= 3) {
    for (const t of world.things) {
      if (!AFFORDANCES[t.kind]?.fish || !person.memory.has(t.id)) continue;
      const d = dist(person.x, person.z, t.x, t.z);
      if (d > 60) continue;
      out.push({
        intent: { kind: "fish", targetId: t.id, x: t.x, z: t.z, speed: WALK, remaining: 30 },
        score: gift(person, "fish") + 1.55 * urge(needs.hunger, 0.32 - 0.1 * person.personality.appetite) * (0.6 + 0.4 * person.personality.patience) * (0.6 + 0.4 * FISH_BY_SEASON[season]!) - d / 120,
      });
    }
  }
  const grief = person.grief ?? 0;
  if (grief > 0.2) {
    for (const t of world.things) {
      if (t.kind !== "grave" || !t.of) continue;
      const bond = person.relations.get(t.of)?.affinity ?? 0;
      if (bond < 0.2 || !person.memory.has(t.id)) continue;
      out.push({ intent: { kind: "mourn", targetId: t.id, x: t.x, z: t.z, speed: WALK, remaining: 40 }, score: 1.1 * grief * bond - dist(person.x, person.z, t.x, t.z) / 120 });
    }
  }
}

function skillOptions(person: Person, world: World, out: Option[]) {
  const { needs } = person;
  const season = world.weather?.season ?? 1;
  const shelters = world.things.filter((t) => t.kind === "shelter" && person.memory.has(t.id));
  const home = shelters[0] ?? world.things.find((t) => aff(t).rest && person.memory.has(t.id));
  const adults = world.people.filter((q) => q.age >= ADULT_AGE).length;
  // A seed goes in the ground in spring or summer, near home.
  const crops = world.things.filter((t) => t.kind === "crop").length;
  if (person.carry.seed >= 1 && (season === 0 || season === 1) && crops < Math.max(2, adults * 2)) {
    const a = rand(person) * Math.PI * 2;
    const r = 3 + 4 * rand(person);
    const base = home ?? person;
    const at = inside(world, base.x + Math.cos(a) * r, base.z + Math.sin(a) * r);
    out.push({ intent: { kind: "plant", x: at.x, z: at.z, speed: WALK, remaining: 20 }, score: (season === 0 ? 0.95 : 0.7) + gift(person, "farm") });
  }
  // A spear, made from wood, once there is a home to make it at.
  if (!person.tools.spear && person.carry.wood >= 2 && home) {
    out.push({ intent: { kind: "craft", x: home.x, z: home.z, speed: WALK, remaining: 40 }, score: 0.45 + 0.4 * urge(needs.hunger, 0.3) });
  }
  // Hunting: with a spear, when hungry, a deer they know of.
  // A hunter leaves the last breeding pair alone unless they are starving.
  const herd = world.things.filter((t) => aff(t).prey).length;
  if (person.tools.spear && needs.hunger > 0.4 && (herd > 2 || needs.hunger > 0.8)) {
    for (const t of world.things) {
      if (!aff(t).prey || !person.memory.has(t.id)) continue;
      const d = dist(person.x, person.z, t.x, t.z);
      if (d > 45) continue;
      out.push({
        intent: { kind: "hunt", targetId: t.id, x: t.x, z: t.z, speed: RUN * 0.7, remaining: 0.3 },
        score: gift(person, "hunt") + 1.25 * urge(needs.hunger, 0.35) * (0.5 + 0.5 * person.personality.boldness) - d / 150,
      });
    }
  }
}

// Switches for experiments (tools/eden): turning the earth actions off shows how much the seasons would hurt without them.
export const TUNING = { earthActions: true };

// Keeping warm and getting ready for the winter: a fire, wood, a roof and a larder, each wanted as much as the cold or the coming season
// asks. `add` puts an option at a thing they know of.
function earthOptions(
  person: Person,
  world: World,
  out: Option[],
  add: (kind: IntentKind, t: Thing, want: number, seconds: number) => void,
  known: (t: Thing) => Memory | undefined,
  hungry: number,
) {
  if (!TUNING.earthActions) return;
  const { needs } = person;
  const weather = world.weather;
  const season = weather?.season ?? 1;
  const progress = weather?.seasonProgress ?? 0;
  // How much the winter weighs on them now: little in spring, more through summer, most in autumn, and in winter itself.
  const learned = person.lessons?.prepare ?? 0;
  const winterPrep = Math.min(1, (1 + 0.5 * learned) * (season === 2 ? 0.5 + 0.5 * progress : season === 1 ? 0.15 + 0.35 * progress : season === 3 ? 0.8 : 0.05 + 0.1 * progress));
  const cold = person.cold;
  const shelters = world.things.filter((t) => t.kind === "shelter" && known(t));
  const hasShelter = shelters.length > 0;
  const fires = world.things.filter((t) => burning(t) && known(t));
  const wood = person.carry.wood;
  const food = person.carry.food;

  for (const f of fires) add("warm", f, 1.6 * urge(cold, 0.22), 60);
  // Under the custom, whoever sees the fire low feeds it.
  if (wood >= 1) for (const f of fires) if ((f.fuel ?? 0) < 2 * FIRE_SECONDS_PER_WOOD && strengthOf(world, "tend") > 0) add("fire", f, 0.9 * strengthOf(world, "tend") + 0.2, 12);
  // Something carried is eaten where they stand.
  if (food > 0 && hungry > 0) out.push({ intent: { kind: "eat", x: person.x, z: person.z, speed: 0, remaining: 12 }, score: hungry * 0.95 });
  // Making a fire where they are, or feeding one that is low.
  const fireNear = fires.some((f) => dist(person.x, person.z, f.x, f.z) < 10);
  if (wood >= 2 && !fireNear && cold > 0.15) out.push({ intent: { kind: "fire", x: person.x, z: person.z, speed: 0, remaining: 12 }, score: 1.8 * urge(cold, 0.1) });
  for (const f of fires) if ((f.fuel ?? 0) < 100 && wood >= 1 && cold > 0.12) add("fire", f, 1.4 * urge(cold, 0.08), 8);
  // Gathering wood: for the cold now, and ahead of the winter.
  const woodWant = Math.max(1.5 * urge(cold, 0.2) * (wood < 2 ? 1 : 0.3), (hasShelter ? 0.35 : 0.8) * winterPrep * (wood < 6 ? 1 : 0.15));
  if (wood < 10) for (const t of world.things) if (aff(t).wood) add("gather", t, woodWant, 25);
  // A roof, built where they like to rest.
  if (!hasShelter && wood >= 8) {
    const site = world.things.find((t) => aff(t).rest && known(t) && t.kind !== "shelter") ?? { x: person.x, z: person.z };
    out.push({ intent: { kind: "build", x: site.x + 2, z: site.z, speed: WALK, remaining: 150 }, score: (1.3 * Math.max(winterPrep, urge(cold, 0.35))) * (0.8 + 0.4 * valueOf(person, "comfort")) + gift(person, "build") });
  }
  // A larder: carried food goes to the roof, and foraging for it begins as the year turns toward winter.
  for (const sh of shelters) if (food > 0) add("stash", sh, 0.55 + 0.6 * winterPrep, 10);
  if ((hasShelter || winterPrep > 0.5) && food < 4 && needs.hunger < 0.55) {
    for (const t of world.things) if (aff(t).food && !aff(t).shelter && (t.stock === undefined || t.stock > 1)) add("forage", t, (hasShelter ? 1 : 0.5) * 0.9 * winterPrep, 22);
  }
}

// Chooses among the options with a lean toward the best but not always the best: the higher their curiosity, the more they try the unexpected.
function choose(person: Person, opts: Option[]): Option {
  const temperature = 0.08 + 0.18 * person.personality.curiosity;
  const weights = opts.map((o) => Math.exp(o.score / temperature));
  const sum = weights.reduce((a, b) => a + b, 0);
  let r = rand(person) * sum;
  let picked = opts[opts.length - 1]!;
  for (let i = 0; i < opts.length; i++) {
    r -= weights[i]!;
    if (r <= 0) {
      picked = opts[i]!;
      break;
    }
  }
  // What they weighed, best four and the one they took.
  person.lastChoice = [...opts]
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((o) => ({ kind: o.intent.kind, target: o.intent.targetId, score: o.score, chosen: o === picked }));
  if (!person.lastChoice.some((c) => c.chosen)) person.lastChoice.push({ kind: picked.intent.kind, target: picked.intent.targetId, score: picked.score, chosen: true });
  return picked;
}

function thingById(world: World, id: string | undefined): Thing | undefined {
  return id === undefined ? undefined : world.things.find((t) => t.id === id);
}
function personById(world: World, id: string | undefined): Person | undefined {
  return id === undefined ? undefined : world.people.find((q) => q.id === id);
}

function finish(person: Person, world: World, intent: Intent) {
  const t = thingById(world, intent.targetId);
  const a = t ? aff(t) : {};
  const { needs } = person;
  const joy = (v: number) => {
    needs.joy = clamp01(needs.joy - v);
    person.mood = clampMood(person.mood + v);
  };
  switch (intent.kind) {
    case "eat":
      if (!t && person.carry.food > 0) {
        person.carry.food -= 1;
        needs.hunger = clamp01(needs.hunger - 0.45);
        joy(0.05);
        person.say = "That was good.";
        note(person, world, "Ate what I had put by.");
      } else if (t && a.food && (t.stock === undefined || t.stock > 0)) {
        needs.hunger = clamp01(needs.hunger - a.food * (1 + 0.3 * skillOf(person, "forage")));
        if (t.kind !== "shelter") practise(person, "forage", 0.015);
        if (t.kind === "crop") practise(person, "farm", 0.02);
        if (t.stock !== undefined) t.stock -= 1;
        joy(0.1);
        feel(person, t, 0.15); // a good meal makes the place better in memory
        if (t.kind !== "shelter" && t.kind !== "crop" && rand(person) < 0.35) person.carry.seed = Math.min(6, person.carry.seed + 1);
        if (t.stock === 0) {
          for (const q of world.people) {
            if (q === person || q.needs.hunger < 0.6 || dist(q.x, q.z, t.x, t.z) > 25) continue;
            const r = relation(q, person.id, world);
            r.affinity = Math.max(-1, r.affinity - 0.06);
            feelEmotion(q, "anger", 0.25 * (0.5 + valueOf(q, "fairness")) * (isCustom(world, "fair") ? 1.8 : 1));
            if (isCustom(world, "fair")) relation(q, person.id, world).trust = Math.max(0, relation(q, person.id, world).trust - 0.08);
            uphold(world, "fair", person, 0.08);
            note(q, world, `${person.name} ate the last at ${phrase(t)} while I was hungry.`);
          }
        }
        person.say = t.stock === 0 ? "That was the last of it." : "That was good.";
        note(person, world, t.stock === 0 ? `Ate the last of ${phrase(t)}.` : `Ate at ${phrase(t)}.`);
      } else {
        // It was gone: the place loses its shine.
        if (t) feel(person, t, -0.2);
        person.say = "There is nothing left here.";
        note(person, world, `Went to ${phrase(t)} to eat and found nothing.`);
      }
      break;
    case "drink":
      needs.thirst = clamp01(needs.thirst - 0.6);
      if (t) feel(person, t, 0.08);
      joy(0.05);
      break;
    case "gather":
      person.carry.wood = Math.min(10, person.carry.wood + 3);
      if (t) feel(person, t, 0.03);
      break;
    case "fire": {
      const wood = Math.min(person.carry.wood, 2);
      if (wood > 0) {
        person.carry.wood -= wood;
        if (t && t.kind === "campfire") t.fuel = (t.fuel ?? 0) + wood * FIRE_SECONDS_PER_WOOD;
        else make(world, "campfire", person.x, person.z, { fuel: wood * FIRE_SECONDS_PER_WOOD, radius: 2 });
        person.mood = clampMood(person.mood + 0.1);
        if (t && t.kind === "campfire") uphold(world, "tend", person, 0.06);
        note(person, world, t && t.kind === "campfire" ? "Fed the fire." : "Lit a fire.");
      }
      break;
    }
    case "build":
      if (person.carry.wood >= 8 - Math.round(3 * skillOf(person, "build"))) {
        person.carry.wood -= 8 - Math.round(3 * skillOf(person, "build"));
        practise(person, "build", 0.12);
        make(world, "shelter", intent.x, intent.z, { stock: 0 });
        joy(0.3);
        person.say = "There. Somewhere dry to sleep.";
        note(person, world, "Built a shelter.");
      }
      break;
    case "stash":
      if (t && t.kind === "shelter" && person.carry.food > 0) {
        t.stock = Math.min(40, (t.stock ?? 0) + person.carry.food);
        note(person, world, `Put ${person.carry.food} meals by in the shelter.`);
        person.carry.food = 0;
      }
      break;
    case "forage":
      if (t && a.food) {
        const take = t.stock === undefined ? 3 : Math.min(3, Math.max(0, t.stock - 1));
        if (t.stock !== undefined) t.stock -= take;
        person.carry.food = Math.min(6, person.carry.food + take);
        if (take > 0 && t.kind !== "crop" && rand(person) < 0.6) person.carry.seed = Math.min(6, person.carry.seed + 1);
      }
      break;
    case "warm":
      person.mood = clampMood(person.mood + 0.05);
      break;
    case "plant":
      if (person.carry.seed >= 1) {
        person.carry.seed -= 1;
        make(world, "crop", intent.x, intent.z, { stock: 0, maxStock: 3 + Math.round(2 * skillOf(person, "farm")), radius: 2 });
        practise(person, "farm", 0.1);
        note(person, world, "Planted a seed.");
        tally(world, "planted");
        person.mood = clampMood(person.mood + 0.05);
      }
      break;
    case "craft":
      if (person.carry.wood >= 2) {
        person.carry.wood -= 2;
        person.tools.spear = true;
        note(person, world, "Made a spear.");
        tally(world, "spears");
        person.say = "A spear. Now I can hunt.";
        joy(0.15);
      }
      break;
    case "fish": {
      const fish = world.fish ?? 0;
      const activity = FISH_BY_SEASON[world.weather?.season ?? 1]!;
      practise(person, "fish", 0.04);
      if (rand(person) < 0.55 * activity * Math.min(1, fish / 15) * (0.7 + 0.6 * person.personality.patience) * (1 + 0.7 * skillOf(person, "fish"))) {
        world.fish = Math.max(0, fish - 1);
        person.carry.food = Math.min(8, person.carry.food + 2);
        note(person, world, "Caught a fish.");
        tally(world, "fished");
        person.say = "A fish. Supper.";
        joy(0.12);
      } else {
        note(person, world, "Waited at the river and caught nothing.");
        person.mood = clampMood(person.mood - 0.03);
      }
      break;
    }
    case "mourn": {
      const grave = t && t.kind === "grave" ? t : undefined;
      if (grave?.of) {
        const lost = world.dead?.find((d) => d.person.id === grave.of)?.person.name ?? "them";
        person.grief = Math.max(0, (person.grief ?? 0) - 0.15);
        person.needs.joy = clamp01(person.needs.joy - 0.05);
        person.say = `I miss you, ${lost}.`;
        note(person, world, `Sat by ${lost}'s grave.`);
        tally(world, "mourned");
      }
      break;
    }
    case "hunt": {
      const prey = thingById(world, intent.targetId);
      if (prey && dist(person.x, person.z, prey.x, prey.z) < 3.8) {
        practise(person, "hunt", 0.05);
        if (rand(person) < (0.45 + 0.3 * person.personality.boldness) * (1 + 0.6 * skillOf(person, "hunt"))) {
          world.things.splice(world.things.indexOf(prey), 1);
          person.carry.food = Math.min(8, person.carry.food + 4);
          person.carry.seed = Math.min(6, person.carry.seed);
          note(person, world, `Killed ${phrase(prey)}. Meat for days.`);
          feelEmotion(person, "pride", 0.4);
          tally(world, "hunted");
          person.say = "We will eat well.";
          joy(0.2);
        } else {
          if (prey.mob) prey.mob.fleeUntil = (world.clock ?? 0) + 25;
          note(person, world, `${phrase(prey)} got away from me.`);
          feelEmotion(person, "shame", 0.15);
          person.mood = clampMood(person.mood - 0.05);
        }
      }
      break;
    }
    case "comfort": {
      const other = personById(world, intent.targetId);
      if (other) {
        other.mood = clampMood(other.mood + 0.3);
        other.needs.social = clamp01(other.needs.social - 0.25);
        const mine = relation(person, other.id, world);
        const theirs = relation(other, person.id, world);
        mine.affinity = Math.min(1, mine.affinity + 0.05);
        theirs.affinity = Math.min(1, theirs.affinity + 0.1);
        theirs.trust = Math.min(1, theirs.trust + 0.08);
        theirs.comforts = (theirs.comforts ?? 0) + 1;
        // Sitting with the sick or hurt is nursing: it helps them, and the nurse learns.
        if (other.illness || other.wound) {
          const heal = skillOf(person, "heal");
          if (other.illness) other.illness.severity = Math.max(0, other.illness.severity - 0.08 * (0.5 + heal));
          if (other.wound) other.wound = Math.max(0, other.wound - 0.1 * (0.5 + heal));
          practise(person, "heal", 0.06);
          tally(world, "nursed");
        }
        feelEmotion(other, "gratitude", 0.4);
        person.say = `It will be all right, ${other.name}.`;
        note(person, world, `Sat with ${other.name}, who was low.`);
        tally(world, "comforts");
        note(other, world, `${person.name} stayed with me when I was low.`);
      }
      break;
    }
    case "share": {
      const other = personById(world, intent.targetId);
      if (other && person.carry.food >= 1) {
        person.carry.food -= 1;
        other.carry.food = Math.min(6, other.carry.food + 1);
        const mine = relation(person, other.id, world);
        const theirs = relation(other, person.id, world);
        mine.affinity = Math.min(1, mine.affinity + 0.08);
        theirs.affinity = Math.min(1, theirs.affinity + 0.15);
        theirs.trust = Math.min(1, theirs.trust + 0.1);
        theirs.gifts = (theirs.gifts ?? 0) + 1;
        feelEmotion(other, "gratitude", 0.5);
        feelEmotion(person, "pride", 0.2);
        const promised = person.promises?.findIndex((x) => x.to === other.id) ?? -1;
        if (promised >= 0) {
          person.promises!.splice(promised, 1);
          theirs.trust = Math.min(1, theirs.trust + 0.1);
          note(person, world, `Kept my word to ${other.name}.`);
          tally(world, "keptPromises");
        }
        uphold(world, "share", person, 0.07);
        if (isCustom(world, "share")) for (const q of world.people) if (q !== person && q !== other && dist(q.x, q.z, person.x, person.z) < 15) relation(q, person.id, world).trust = Math.min(1, relation(q, person.id, world).trust + 0.03);
        person.say = `Here, ${other.name}. Eat.`;
        note(person, world, `Gave ${other.name} some food.`);
        note(other, world, `${person.name} gave me food when I was hungry.`);
        other.mood = clampMood(other.mood + 0.15);
      }
      break;
    }
    case "sleep":
      person.mood = clampMood(person.mood + 0.15);
      note(person, world, "Slept.");
      if (t) feel(person, t, 0.05);
      break;
    case "rest":
      needs.energy = clamp01(needs.energy - 0.3);
      if (t) feel(person, t, 0.1);
      break;
    case "look":
      joy(0.4);
      // Watching a creature is a little company.
      if (a.creature) needs.social = clamp01(needs.social - 0.12);
      if (t) feel(person, t, 0.12);
      break;
    case "play":
      joy(0.3);
      if (t) feel(person, t, 0.1);
      break;
    case "talk": {
      const other = personById(world, intent.targetId);
      needs.social = clamp01(needs.social - 0.6);
      joy(0.1);
      const mineBefore = other ? relation(person, other.id, world) : undefined;
      // Two people who are both low, and not fond of each other, may quarrel instead of talk.
      const irritable = person.personality.boldness * (1 - person.personality.patience);
      const fallingOut = other && mineBefore
        ? (0.025 + 0.06 * irritable + 0.3 * (person.emotions?.anger ?? 0)) * (1.2 - Math.max(-0.2, mineBefore.affinity)) + (person.mood < -0.15 && other.mood < -0.15 ? 0.35 * (1 - Math.max(0, mineBefore.affinity)) : 0)
        : 0;
      if (other && mineBefore && rand(person) < fallingOut) {
        const theirs = relation(other, person.id, world);
        mineBefore.affinity = Math.max(-1, mineBefore.affinity - 0.15);
        theirs.affinity = Math.max(-1, theirs.affinity - 0.15);
        mineBefore.trust = Math.max(0, mineBefore.trust - 0.1);
        theirs.trust = Math.max(0, theirs.trust - 0.1);
        person.mood = clampMood(person.mood - 0.1);
        other.mood = clampMood(other.mood - 0.1);
        mineBefore.quarrels = (mineBefore.quarrels ?? 0) + 1;
        mineBefore.lastQuarrel = world.clock ?? 0;
        theirs.lastQuarrel = world.clock ?? 0;
        theirs.quarrels = (theirs.quarrels ?? 0) + 1;
        feelEmotion(person, "anger", 0.4);
        feelEmotion(other, "anger", 0.4);
        person.say = "Leave me be.";
        note(person, world, `Quarrelled with ${other.name}.`);
        tally(world, "quarrels");
        note(other, world, `Quarrelled with ${person.name}.`);
        break;
      }
      if (other) {
        other.needs.social = clamp01(other.needs.social - 0.5);
        other.mood = clampMood(other.mood + 0.1);
        const mine = relation(person, other.id, world);
        const theirs = relation(other, person.id, world);
        for (const [r, who] of [[mine, other], [theirs, person]] as const) {
          r.familiarity = Math.min(1, r.familiarity + 0.04);
          r.trust = Math.min(1, r.trust + 0.02);
          r.affinity = Math.max(-1, Math.min(1, r.affinity + 0.03 + 0.04 * who.personality.sociability));
          r.lastTogether = world.clock ?? 0;
        }
        // They say something to each other, about what weighs most with them (speech.ts).
        const exchange = converse(world, person, other, () => rand(person));
        person.say = exchange.said;
        other.say = exchange.reply;
        note(person, world, `Talked with ${other.name}: "${exchange.said}"`);
        note(other, world, `${person.name} said: "${exchange.said}" I said: "${exchange.reply}"`);
        tally(world, "talks");
        shareNames(person, other, world);
        // Teaching: whoever is better at something shows the other.
        for (const [teacher, learner] of [[person, other], [other, person]] as const) {
          const taught = teach(teacher, learner);
          if (taught) {
            note(learner, world, `${teacher.name} showed me how to do better at ${SKILL_WORDS[taught.skill].doing}.`);
            note(teacher, world, `Showed ${learner.name} ${SKILL_WORDS[taught.skill].doing}.`);
            tally(world, "taught");
          }
        }
        // Gossip: what one thinks of a third person reaches the other, who trusts them a little more or less for it.
        if (exchange.topic === "sorry") {
          const mine = relation(person, other.id, world);
          const theirs = relation(other, person.id, world);
          mine.affinity = Math.min(1, mine.affinity + 0.12);
          theirs.affinity = Math.min(1, theirs.affinity + 0.12);
          mine.lastQuarrel = undefined;
          theirs.lastQuarrel = undefined;
          feelEmotion(other, "gratitude", 0.2);
          note(person, world, `Made things right with ${other.name}.`);
          note(other, world, `${person.name} made things right with me.`);
          tally(world, "reconciliations");
        }
        if (exchange.about && exchange.tag) {
          const r = relation(other, exchange.about, world);
          if (exchange.tag === "quarrelsome") r.trust = Math.max(0, r.trust - 0.05);
          else r.trust = Math.min(1, r.trust + 0.05);
          tally(world, "gossip");
        }
        // Remember each other kindly.
        const m = person.memory.get(other.id);
        if (m) m.feeling = Math.min(1, m.feeling + 0.1);
        else person.memory.set(other.id, { x: other.x, z: other.z, feeling: 0.3, visits: 1, lastSeen: person.clock });
      }
      break;
    }
    default:
      break;
  }
  if (t) {
    const m = person.memory.get(t.id);
    if (m) m.visits += 1;
    if (m && m.visits === 1) nameThePlace(person, world, t);
  }
  person.intent = undefined;
}

// Moves the world's people on by `dt` sim seconds. Nothing here reads the clock or the network: the same inputs give the same lives.
export interface StepOptions {
  // The host moves the bodies (physics and paths) and writes each person's x and z before every step; the mind then only chooses and
  // judges arrival. Without it the mind walks people in a straight line itself (what the tests do).
  externalMotion?: boolean;
}
export function step(world: World, dt: number, settings: StepOptions = {}) {
  world.clock = (world.clock ?? DAY / 3) + dt;
  const weather = weatherAt(world.clock, world.climate ?? EDEN_CLIMATE);
  const hand = world.override;
  if (hand && world.clock < hand.until) {
    weather.tempC += hand.tempOffset;
    if (hand.rain !== undefined) {
      weather.raining = hand.rain;
      weather.rainAmount = hand.rain ? Math.max(weather.rainAmount, 0.6) : 0;
      weather.snowing = hand.rain && weather.tempC < 1;
    }
  } else if (hand) world.override = undefined;
  world.weather = weather;
  fadeNorms(world, dt);
  // The river's fish breed in the warm months and keep to the deep in winter; a few come down from upstream, so it is never quite empty.
  const fish = (world.fish ??= 30);
  world.fish = Math.min(40, fish + dt * (0.0002 * fish * (1 - fish / 40) * FISH_BY_SEASON[weather.season]! + 1 / DAY));
  // Food grows back, a meal at a time, quickly in summer and rain and hardly at all in winter.
  for (const t of world.things) {
    if (t.maxStock === undefined || t.stock === undefined || t.stock >= t.maxStock) continue;
    t.growth = (t.growth ?? 0) + dt * growthRate(weather);
    if (t.growth >= REGROW_SECONDS) {
      t.growth = 0;
      t.stock += 1;
    }
  }
  // Fires burn down and go out.
  for (let i = world.things.length - 1; i >= 0; i--) {
    const t = world.things[i]!;
    if (t.kind !== "campfire") continue;
    t.fuel = (t.fuel ?? 0) - dt;
    if (t.fuel <= 0) world.things.splice(i, 1);
  }
  stepAnimals(world, dt);
  for (const person of world.people) {
    person.clock += dt;
    const { needs, personality: p } = person;
    const asleep = person.intent?.kind === "sleep" && person.intent.arrived;
    // Warmth: what the air is, with clothes on, a roof overhead, a fire close by, and the rain if there is no roof.
    const sheltered = world.things.some((t) => t.kind === "shelter" && dist(person.x, person.z, t.x, t.z) < 3.5);
    const nearFire = world.things.some((t) => burning(t) && dist(person.x, person.z, t.x, t.z) < 6);
    const effective = weather.tempC + 5 + (sheltered ? 8 : 0) + (nearFire ? 12 : 0) - (weather.raining && !sheltered ? 4 : 0) - (sheltered ? 0 : 0.5 * weather.windMs); // wind takes the warmth away
    const coldTarget = clamp01((COMFORT_C - effective) / 18);
    person.cold = clamp01(person.cold + (coldTarget - person.cold) * Math.min(1, dt / 180));
    // Heat dries a person out faster.
    const heat = 1 + 0.8 * clamp01((effective - 24) / 12);
    // Asleep, the body burns less and rests: hunger and thirst creep, tiredness drains.
    const metabolism = asleep ? 0.4 : 1;
    needs.hunger = clamp01(needs.hunger + metabolism * (dt / FILL_SECONDS.hunger) * (0.7 + 0.6 * p.appetite) * (person.pregnant ? 1.25 : 1));
    needs.thirst = clamp01(needs.thirst + metabolism * heat * (dt / FILL_SECONDS.thirst) * (0.7 + 0.6 * p.appetite));
    needs.energy = clamp01(needs.energy + (asleep ? -dt / 1100 : dt / FILL_SECONDS.energy));
    needs.social = clamp01(needs.social + (asleep ? 0 : (dt / FILL_SECONDS.social) * (0.5 + p.sociability)));
    needs.joy = clamp01(needs.joy + (asleep ? 0 : dt / FILL_SECONDS.joy));
    // Mood drifts toward how well life is going: content when needs are met, sinking as the worst of them climbs.
    const mean = (needs.hunger + needs.thirst + needs.energy + needs.social + needs.joy + person.cold) / 6;
    const worst = Math.max(needs.hunger, needs.thirst, needs.energy, needs.social, person.cold);
    const moodTarget = Math.max(-1, Math.min(1, 0.6 - 0.7 * mean - 0.8 * Math.max(0, worst - 0.65) + moodPush(person)));
    // The mood falls faster than it rises, as it does in people.
    person.mood = clampMood(person.mood + (moodTarget - person.mood) * Math.min(1, dt / (moodTarget < person.mood ? 60 : 120)));
    fade(person, dt);
    breakDown(person, world, dt);
    if (person.grief) {
      person.mood = Math.min(person.mood, 0.3 - person.grief);
      person.grief = Math.max(0, person.grief - dt / (4 * DAY) - (person.intent?.kind === "talk" ? dt / (20 * DAY) : 0));
    }
    const felt = (person.felt ??= { hungry: 0, cold: 0, scares: 0, reflected: person.clock });
    if (needs.hunger > 0.8) felt.hungry += dt;
    if (person.cold > 0.5) felt.cold += dt;
    // Starving or parched hurts; being well slowly heals.
    // Death comes on at the pace the rule of threes gives, scaled to a sim day: about three days of real thirst, three weeks of real
    // hunger, and a few hours of real cold (a sim second is a minute).
    let loss = 0;
    if (needs.thirst >= 1) loss += dt / (3 * DAY);
    if (needs.hunger >= 1) loss += dt / (21 * DAY);
    if (person.cold > 0.7) loss += (dt / 200) * clamp01((person.cold - 0.7) / 0.3);
    if (loss > 0) person.health = clamp01(person.health - loss);
    else if (Math.max(needs.hunger, needs.thirst) < 0.7 && person.cold < 0.6 && !person.illness) person.health = clamp01(person.health + dt / 600);
    tickIllness(person, world, dt);

    notice(person, world);
    person.explored.add(`${Math.floor(person.x / 20)},${Math.floor(person.z / 20)}`);
    updateGoals(person, world);
    reflect(person, world);
    keepPromises(person, world);
    person.age += dt / YEAR;

    // Danger: running from it beats anything else, and being caught in it hurts.
    const f = fear(person, world);
    let hurt = false;
    if (f.from) {
      const danger = aff(f.from).danger ?? 0;
      if (dist(person.x, person.z, f.from.x, f.from.z) <= f.from.radius + 1.5) {
        person.health = clamp01(person.health - danger * dt * 0.05);
        feel(person, f.from, -0.05 * dt);
        hurt = true;
        if (!person.wound) note(person, world, `Was hurt by ${phrase(f.from)}.`);
        person.wound = Math.max(person.wound ?? 0, 0.3 + 0.5 * danger);
      }
    }
    // Pain sends anyone running, however bold.
    // Desperation makes anyone braver: a person dying of thirst will go to a river a fox is near, just warily.
    const desperate = Math.max(urge(needs.thirst, 0.5), urge(needs.hunger, 0.6));
    const scared = hurt || f.level > 0.25 + 0.3 * p.boldness + 0.7 * desperate;
    if (scared && f.from && person.intent?.kind !== "flee") {
      // Away from the danger, far enough to be out of its reach.
      const away = Math.atan2(person.z - f.from.z, person.x - f.from.x);
      const run = dangerReach(f.from) + 8;
      const to = inside(world, person.x + Math.cos(away) * run, person.z + Math.sin(away) * run);
      person.intent = { kind: "flee", targetId: f.from.id, x: to.x, z: to.z, speed: RUN, remaining: 0, arrived: false };
      feel(person, f.from, -0.2);
      person.mood = clampMood(person.mood - 0.3);
      person.say = "Something is wrong. I'm leaving.";
      note(person, world, `Ran from ${phrase(f.from)}.`);
      feelEmotion(person, "fear", 0.6);
      (person.felt ??= { hungry: 0, cold: 0, scares: 0, reflected: person.clock }).scares += 1;
    }

    // A need that has become critical interrupts whatever they were doing unless it is that need's own remedy, and a goal that
    // cannot be reached in a couple of minutes is dropped.
    const current = person.intent;
    if (current && current.kind !== "flee") {
      // The more critical of hunger and thirst, when it is past 0.9, overrides anything that is not its own remedy.
      const critical = needs.hunger >= needs.thirst ? "eat" : "drink";
      const level = Math.max(needs.hunger, needs.thirst);
      const own = current.kind === critical || (critical === "eat" && (current.kind === "fish" || current.kind === "hunt")) || (current.kind === "eat" || current.kind === "drink" ? Math.abs(needs.hunger - needs.thirst) < 0.05 : false);
      if ((level > 0.9 && !own) || (!current.arrived && (current.age = (current.age ?? 0) + dt) > 120)) person.intent = undefined;
    }

    if (!person.intent) {
      const picked = choose(person, options(person, world));
      person.intent = { ...picked.intent, arrived: false };
    }
    const intent = person.intent;
    if (!intent) continue;
    // Following another person: walk toward where they are now.
    if (intent.kind === "hunt") {
      const prey = thingById(world, intent.targetId);
      if (!prey) person.intent = undefined;
      else {
        intent.x = prey.x;
        intent.z = prey.z;
      }
    }
    if (!person.intent) continue;
    if (intent.kind === "talk" || intent.kind === "share" || intent.kind === "comfort") {
      const other = personById(world, intent.targetId);
      if (other) {
        intent.x = other.x;
        intent.z = other.z;
      }
    }

    if (!intent.arrived) {
      const d = dist(person.x, person.z, intent.x, intent.z);
      const stop = intent.kind === "talk" || intent.kind === "share" || intent.kind === "comfort" ? REACH : intent.kind === "hunt" ? 3 : intent.kind === "flee" || intent.kind === "wander" ? 0.4 : (thingById(world, intent.targetId)?.radius ?? 1) * 0.8;
      if (d <= stop + 0.05) {
        intent.arrived = true;
      } else if (settings.externalMotion) {
        continue;
      } else {
        const stepLen = Math.min(d - stop, intent.speed * dt);
        person.x += ((intent.x - person.x) / d) * stepLen;
        person.z += ((intent.z - person.z) / d) * stepLen;
        // Arrived by this step's move (not only at the start of the next: a deer that has stepped off by then would never be reached).
        if (dist(person.x, person.z, intent.x, intent.z) > stop + 0.05) continue;
        intent.arrived = true;
      }
    }
    // Asleep until morning, or until rested.
    if (intent.kind === "sleep" && (needs.energy <= 0.03 || (!isNight(world.clock) && needs.energy < 0.4))) {
      finish(person, world, intent);
      continue;
    }
    // There: spend the time, then take the result.
    intent.remaining -= dt;
    if (intent.remaining <= 0) finish(person, world, intent);
  }
  lifeAndDeath(world, dt);
}

// The creatures of the garden live their own lives: deer graze about and run from people and foxes; foxes hunt deer and starve without
// them; both breed when there is room and food. This is what a hunter hunts and what a fox does to the herd.
function stepAnimals(world: World, dt: number) {
  const now = world.clock ?? 0;
  const R = world.radius ?? 40;
  const season = world.weather?.season ?? 1;
  const things = world.things;
  for (const t of [...things]) {
    const a = aff(t);
    if (!a.mobile) continue;
    const m = (t.mob ??= { tx: t.x, tz: t.z, wait: 0, fed: now, age: 2, fleeUntil: 0 });
    m.age += dt / YEAR;
    let speed = a.mobile;
    let busy = false;
    if (a.prey) {
      let threat: { x: number; z: number } | undefined;
      let best = 7;
      for (const p of world.people) {
        const d = dist(t.x, t.z, p.x, p.z);
        if (d < best) {
          best = d;
          threat = p;
        }
      }
      for (const f of things) {
        if (!aff(f).predator) continue;
        const d = dist(t.x, t.z, f.x, f.z);
        if (d < best) {
          best = d;
          threat = f;
        }
      }
      if (threat || now < m.fleeUntil) {
        if (threat) {
          const away = Math.atan2(t.z - threat.z, t.x - threat.x);
          const to = inside(world, t.x + Math.cos(away) * 14, t.z + Math.sin(away) * 14);
          m.tx = to.x;
          m.tz = to.z;
        }
        speed = 2.3;
        busy = true;
      }
    } else if (a.predator) {
      if (now - m.fed > 4 * DAY) {
        things.splice(things.indexOf(t), 1);
        continue;
      }
      if (now - m.fed > DAY) {
        let prey: Thing | undefined;
        let best = 28;
        for (const q of things) {
          if (!aff(q).prey) continue;
          const d = dist(t.x, t.z, q.x, q.z);
          if (d < best) {
            best = d;
            prey = q;
          }
        }
        if (prey) {
          m.tx = prey.x;
          m.tz = prey.z;
          speed = 2.6;
          busy = true;
          if (best < 1.3 && worldRand(world) < 0.5) {
            things.splice(things.indexOf(prey), 1);
            m.fed = now;
          }
        }
      }
    }
    if (!busy) {
      m.wait -= dt;
      if (m.wait <= 0 || dist(t.x, t.z, m.tx, m.tz) < 0.5) {
        const a2 = worldRand(world) * Math.PI * 2;
        const to = inside(world, t.x + Math.cos(a2) * (3 + 6 * worldRand(world)), t.z + Math.sin(a2) * (3 + 6 * worldRand(world)));
        m.tx = to.x;
        m.tz = to.z;
        m.wait = 8 + 14 * worldRand(world);
      }
    }
    const d = dist(t.x, t.z, m.tx, m.tz);
    if (d > 0.05) {
      const stepLen = Math.min(d, speed * dt);
      t.x += ((m.tx - t.x) / d) * stepLen;
      t.z += ((m.tz - t.z) / d) * stepLen;
    }
    // Old deer die.
    if (a.prey && m.age > 10 && worldRand(world) < (dt / DAY) * 0.05) things.splice(things.indexOf(t), 1);
  }
  const deer = things.filter((t) => t.kind === "deer");
  const foxes = things.filter((t) => t.kind === "fox");
  // Deer breed in spring and summer when there are two or more and room; foxes when deer are plentiful and they have eaten.
  const room = Math.max(1, Math.min(4, (R / 36) ** 2 / 8)); // a wider world holds bigger herds
  if ((season === 0 || season === 1) && deer.length >= 2 && deer.length < 8 * room && worldRand(world) < (dt / DAY) * 0.5) {
    const parent = deer[Math.floor(worldRand(world) * deer.length)]!;
    make(world, "deer", parent.x + 1, parent.z, { radius: 2, mob: { tx: parent.x, tz: parent.z, wait: 0, fed: now, age: 0, fleeUntil: 0 } });
  }
  if (foxes.length >= 1 && foxes.length < 2 * room && deer.length >= 4 && foxes.some((f) => now - (f.mob?.fed ?? 0) < DAY) && worldRand(world) < (dt / DAY) * 0.15) {
    const parent = foxes[0]!;
    make(world, "fox", parent.x + 1, parent.z, { radius: 1, mob: { tx: parent.x, tz: parent.z, wait: 0, fed: now, age: 0, fleeUntil: 0 } });
  }
}

// Who dies this step, and who is born. Death comes from the body failing (health gone) or old age; the living grieve in proportion to how
// they felt. A child is born to two partners with a roof, food laid by, good health and a season that is not winter.
// Thinking back over what has happened, about twice a day: what hurt teaches something that changes what they do next.
function reflect(person: Person, world: World) {
  const felt = person.felt;
  if (!felt || person.age < ADULT_AGE || person.clock - felt.reflected < DAY / 2) return;
  felt.reflected = person.clock;
  const lessons = (person.lessons ??= { prepare: 0, careful: 0 });
  if ((felt.cold > 120 || felt.hungry > 300) && lessons.prepare < 1) {
    lessons.prepare = Math.min(1, lessons.prepare + 0.4);
    note(person, world, felt.cold > 120 ? "I have learned: do not wait for the cold. Wood and a roof, early." : "I have learned: never let the larder run low.");
    tally(world, "lessons");
  }
  if (felt.scares >= 2 && lessons.careful < 1) {
    lessons.careful = Math.min(1, lessons.careful + 0.4);
    note(person, world, "I have learned: keep away from where the dangerous things are.");
    tally(world, "lessons");
  }
  // What others have done for them, or to them, becomes what they think of those others.
  const believed = (person.beliefs ??= {});
  for (const [id, r] of person.relations) {
    const have = believed[id] ?? [];
    for (const tag of opinionTags(r)) {
      if (have.includes(tag)) continue;
      have.push(tag);
      believed[id] = have;
      const other = world.people.find((q) => q.id === id);
      if (!other) continue;
      if (tag === "quarrelsome") r.affinity = Math.max(-1, r.affinity - 0.1);
      else r.trust = Math.min(1, r.trust + 0.1);
      note(person, world, `I have come to think ${other.name} is ${BELIEF_WORDS[tag]}.`);
      tally(world, "beliefs");
    }
  }
  neglect(person);
  const role = roleOf(person);
  if (role && person.role !== role.role) {
    person.role = role.role;
    note(person, world, `I have become known as the ${role.role}.`);
    tally(world, "roles");
  }
  felt.cold *= 0.4;
  felt.hungry *= 0.4;
  felt.scares = 0;
}

// A child is born to a mother after nine months of carrying it, with real risk to both.
const GESTATION = 0.75 * YEAR;
function giveBirth(world: World, mother: Person, father: Person) {
  const now = world.clock ?? 0;
  // Childbirth can kill: the more so when the mother is weak or hungry, and the baby may not live.
  const risk = 0.012 * (1 + (mother.needs.hunger > 0.6 ? 1 : 0) + (mother.health < 0.7 ? 1.5 : 0) + (mother.age > 35 ? 1 : 0));
  if (rand(mother) < 0.03 + 0.5 * risk) {
    mother.lastBirth = now;
    mother.pregnant = undefined;
    mother.mood = clampMood(mother.mood - 0.6);
    mother.grief = clamp01((mother.grief ?? 0) + 0.5);
    father.grief = clamp01((father.grief ?? 0) + 0.7);
    note(mother, world, "The baby was born still.");
    note(father, world, `${mother.name}'s baby was born still.`);
    tally(world, "stillbirths");
  } else {
    mother.lastBirth = now;
    mother.pregnant = undefined;
    const sex: "m" | "f" = rand(mother) < 0.5 ? "m" : "f";
    const taken = new Set([...world.people, ...(world.dead ?? []).map((d) => d.person)].map((q) => q.name));
    const name = CHILD_NAMES[sex].find((n) => !taken.has(n)) ?? `${sex === "m" ? "Boy" : "Girl"} ${(world.built ?? 0) + 1}`;
    world.built = (world.built ?? 0) + 1;
    const mix = (a: number, b: number) => clamp01((a + b) / 2 + (rand(mother) - 0.5) * 0.3);
    const child = makePerson(`person-${world.built}`, mother.x + 1, mother.z, Math.floor(rand(mother) * 1e9), {
      boldness: mix(mother.personality.boldness, father.personality.boldness),
      sociability: mix(mother.personality.sociability, father.personality.sociability),
      curiosity: mix(mother.personality.curiosity, father.personality.curiosity),
      appetite: mix(mother.personality.appetite, father.personality.appetite),
      patience: mix(mother.personality.patience, father.personality.patience),
    }, { name, sex, age: 0, parents: [mother, father] });
    child.mother = mother.id;
    child.father = father.id;
    world.people.push(child);
    for (const parent of [mother, father]) {
      relation(child, parent.id, world).affinity = 0.9;
      relation(parent, child.id, world).affinity = 0.95;
      parent.mood = clampMood(parent.mood + 0.5);
      note(parent, world, parent === mother ? `${name} was born to me.` : `${name} was born. I am a father.`);
    }
    note(child, world, "I was born.");
    tally(world, "births");
    mother.say = `Look, ${father.name}. ${name}.`;
  }
  if (rand(mother) < risk) {
    mother.health = Math.min(mother.health, 0.02);
    mother.cause = "childbirth";
  }
}

function lifeAndDeath(world: World, dt: number) {
  const now = world.clock ?? 0;
  const gone: { person: Person; cause: string }[] = [];
  for (const p of world.people) {
    if (p.health <= 0.02) gone.push({ person: p, cause: p.cause ?? (p.illness && p.illness.severity > 0.4 ? "illness" : p.cold > 0.85 ? "the cold" : p.needs.thirst >= 1 ? "thirst" : p.needs.hunger >= 1 ? "hunger" : "wounds") });
    else if (p.age > 55 && rand(p) < (dt / DAY) * 0.25 * Math.min(1.5, ((p.age - 55) / 25) ** 2)) gone.push({ person: p, cause: "old age" });
  }
  for (const { person, cause } of gone) {
    world.people.splice(world.people.indexOf(person), 1);
    (world.dead ??= []).push({ person, t: now, cause });
    note(person, world, `Died of ${cause}.`);
    person.intent = undefined;
    make(world, "grave", person.x, person.z, { of: person.id, radius: 2 });
    for (const other of world.people) {
      const r = other.relations.get(person.id);
      const grief = Math.max(0, r?.affinity ?? 0);
      other.mood = clampMood(other.mood - 0.7 * grief);
      other.grief = clamp01((other.grief ?? 0) + 0.9 * grief);
      note(other, world, `${person.name} died${cause === "old age" ? " of old age" : ` of ${cause}`}.`);
    }
  }
  for (const mother of world.people) {
    if (!mother.pregnant || now - mother.pregnant.since < GESTATION) continue;
    const father = world.people.find((q) => q.id === mother.pregnant!.father) ?? world.dead?.find((d) => d.person.id === mother.pregnant!.father)?.person;
    if (father) giveBirth(world, mother, father);
    else mother.pregnant = undefined;
  }
  const shelter = world.things.filter((t) => t.kind === "shelter");
  const larder = shelter.reduce((a, t) => a + (t.stock ?? 0), 0);
  const season = world.weather?.season ?? 1;
  if (!shelter.length || larder < 6 || season === 3 || world.people.length >= (world.maxPeople ?? 6)) return;
  for (const mother of world.people) {
    if (mother.sex !== "f" || mother.age < ADULT_AGE + 12 || mother.age > 40 || now - (mother.lastBirth ?? -1e9) < YEAR) continue;
    if (mother.pregnant || mother.illness || mother.health < 0.7 || mother.needs.hunger > 0.7 || mother.mood < 0) continue;
    const father = world.people.find((q) => q.sex === "m" && q.age >= ADULT_AGE + 12 && bondOf(mother, q) === "partner");
    if (!father || rand(mother) > (dt / DAY) * 0.25) continue;
    mother.pregnant = { since: now, father: father.id };
    note(mother, world, `I am carrying ${father.name}'s child.`);
    note(father, world, `${mother.name} is carrying my child.`);
    tally(world, "conceptions");
  }
}

// The animation name for what a person is doing; the host's clip table (edenAgents.ts) maps these onto each model's own clips.
export function actionOf(person: Person): string {
  const intent = person.intent;
  if (!intent) return "observe";
  if (!intent.arrived) return intent.kind === "flee" ? "flee" : "wander";
  switch (intent.kind) {
    case "eat":
      return "forage";
    case "drink":
    case "fish":
      return "drink_from_river";
    case "mourn":
      return "rest";
    case "rest":
    case "sleep":
    case "warm":
      return "rest";
    case "gather":
    case "forage":
    case "stash":
    case "build":
    case "fire":
      return "forage";
    case "talk":
    case "share":
      return "talk_to_other";
    case "play":
      return "play_together";
    default:
      return "observe";
  }
}
