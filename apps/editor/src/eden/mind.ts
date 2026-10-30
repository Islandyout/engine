// The minds of Eden's people. Everything here is plain code that runs on the player's own machine: no network and no AI model.
//
// A person has needs that grow with time, a personality that weights what they care about, a memory of the things they have seen and
// how those things made them feel, and a list of things they could do. Each moment they score what they could do, favouring what
// the needs, personality, memory and a little chance say, and carry the best choice out; danger overrides everything. What they
// choose is not scripted, but it is repeatable: the same seed gives the same life, so it can be tested.
//
// The host (edenAgents.ts) feeds this the world's things and turns each person's `intent` into movement and an animation.

import { cultureOptions, doCreate, doPonder, doRead, exchangeIdeas, faithful, knows, owe, tradeRates, winterComing, type Arts, type Tenet, type Work } from "./culture";
import { doInvent, doMake, planOptions, worksNow, type Plan } from "./reason";
import { afterAct, appraise, milestone, psycheBias, psycheEvent, psycheStep, type Psyche } from "./psyche";
import { fightBeast, learnFromWorld, teamStep, type Rule, type Team } from "./solve";
import { gift, newIdentity, neglect, practise, roleOf, skillOf, storyFor, teach, valueOf, SKILL_WORDS, type Skill, type Value } from "./identity";
import { fadeNorms, isCustom, NORM_TEXT, reinforce, standing, strengthOf, type NormId } from "./norms";
import { fade, feel as feelEmotion, importance, moodPush, opinionTags, BELIEF_WORDS, type Belief, type Emotion } from "./inner";
import { converse } from "./speech";
import { joysFor, joyText, type Band, type Doing, type Sky } from "./joys";
import { COMFORT_C, DAY, daylight, EDEN_CLIMATE, FISH_BY_SEASON, growthRate, hourOf, isDark, seasonAt, weatherAt, YEAR, type Climate, type Weather } from "./earth";
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
  comfort?: number; // a made thing that makes a place pleasant: those resting, eating or talking near it feel better
  holy?: boolean; // a place to pray
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
  dog: { creature: true, mobile: 1.4 },
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
  // Made by the people for their home: a barrel that collects rain, a table, a lantern, a chest, a shelf, a shrine.
  barrel: { water: true, stock: 4, comfort: 0.04 },
  table: { rest: true, comfort: 0.12 },
  lantern: { comfort: 0.08 },
  chest: { comfort: 0.03 },
  shelf: { comfort: 0.04 },
  shrine: { rest: true, comfort: 0.1, holy: true },
  rock: { rest: true },
  // Made by the people: a painted stone people stop to look at, and a library where books are kept and read.
  artwork: { view: true },
  // Found by experiment (reason.ts): a weir in the water and a snare by a game trail, each filling slowly with food.
  weir: { food: 0.5 },
  snare: { food: 0.8 },
  library: { comfort: 0.03 },
  bush: { food: 0.25, stock: 4 },
  deer: { creature: true, mobile: 0.9, prey: true },
  stag: { creature: true, mobile: 1.0, prey: true }, // a big deer: more meat, harder to bring down
  cow: { creature: true, mobile: 0.5, food: 0.35, stock: 3 }, // a milk cow: a little to drink and eat from, every day, no killing
  donkey: { creature: true, mobile: 0.7 },
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
  of?: string; // a grave: whose it is (a person id); a dog: whose it is
  level?: number; // a shelter: 1 a roof of hides, 2 a proper thatched hut (the page swaps the model)
  trust?: number; // a dog: how many times it has been fed by someone, toward choosing them
  prefab?: string; // the scene prefab that shows it (the host places it); absent for things the scene already has
  // A creature's own going about: where it is heading, when it last ate, how old it is (in Eden years).
  mob?: { tx: number; tz: number; wait: number; fed: number; age: number; fleeUntil: number; state?: MobState; speed?: number; idle?: MobState; eatUntil?: number; attackUntil?: number; here?: boolean; startleUntil?: number; hurtUntil?: number; angryUntil?: number; repelledAt?: number };
}

// The intents that are done to or with another person: walk up to them, and follow them if they move.
const SOCIAL = new Set<IntentKind>(["talk", "share", "comfort", "gift", "trade", "teach", "steal"]);
const HERD = new Set(["deer", "stag", "horse", "cow", "donkey", "alpaca"]);
const FIGHTERS = new Set(["stag", "alpaca", "wolf"]);
/** A creature was hit (by the Walker): it flinches, the herd takes fright, and one that fights back turns on them. */
export function creatureHurt(world: World, id: string) {
  const t = world.things.find((q) => q.id === id);
  if (!t?.mob) return;
  const now = world.clock ?? 0;
  t.mob.hurtUntil = now + 1.1;
  t.mob.fleeUntil = now + 8;
  if (FIGHTERS.has(t.kind)) t.mob.angryUntil = now + 10;
  for (const q of world.things) {
    if (q === t || q.kind !== t.kind || !q.mob || dist(q.x, q.z, t.x, t.z) > 18) continue;
    q.mob.fleeUntil = Math.max(q.mob.fleeUntil, now + 5);
    q.mob.startleUntil = now + 0.6;
  }
  tally(world, "creaturesHurt");
}

// What a creature is doing right now, which is what its body shows (motion.ts picks the clip and the gait from it).
export type MobState = "stand" | "graze" | "vigil" | "rest" | "drink" | "walk" | "flee" | "hunt" | "eat" | "follow" | "attack" | "startle" | "hit";

// What a person remembers of a thing: where it is, and how being near it has felt.
export interface Memory {
  x: number;
  z: number;
  feeling: number; // -1 dreadful .. 1 lovely, moved by what happened there
  visits: number;
  lastSeen: number; // sim seconds
}

export type IntentKind = "eat" | "drink" | "rest" | "sleep" | "look" | "play" | "talk" | "flee" | "wander" | "linger" | "gather" | "fire" | "build" | "stash" | "forage" | "warm" | "share" | "comfort" | "plant" | "craft" | "hunt" | "fish" | "mourn" | "tame" | "sew" | "wash" | "fetch" | "furnish" | "improve" | "carve" | "gift" | "trade" | "pray" | "teach" | "steal" | "create" | "ponder" | "read" | "invent" | "make";
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
  // What they were walking to do before they stopped to listen to someone (taken up again after).
  resume?: Intent;
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
  laughUntil?: number; // world clock until which they are laughing (a joke was told)
  thefts?: number;
  rules?: Record<string, Rule>; // what they have come to think causes what, from what they have seen
  team?: string; // the party they are in, if any
  problemAt?: number; // when they last worked out what to do about a beast near camp
  scoutedAt?: number; // when they last set out to look at new ground
  plan?: Plan; // what they have worked out to do next, and why (reason.ts)
  planAt?: number; // when they last tried to foresee something
  tried?: string[]; // experiments that came to nothing, so they are not repeated
  arts?: Arts; // how good they are at making things of beauty and at working things out
  ideas?: string[]; // what they know (discoveries, and the books they have read)
  faith?: Record<string, string>; // the answer they hold to each big question (a tenet id)
  favours?: Record<string, number>; // what others owe them (positive) or they owe others (negative)
  keepsake?: { to: string; item: string }; // something they have carved for someone, not yet given
  keepsakes?: { from: string; item: string }[]; // what others have given them
  stranger?: { since: number; verdict?: "joined" | "left" }; // came from outside; the others decide whether to take them in
  followUntil?: number; // world clock until which they walk with the Walker (asked to, in conversation)
  walkerFacts?: { name?: string; from?: string; role?: string; likes?: string[]; mood?: string; asked?: string[] }; // what the Walker has told them about themselves
  pendingQ?: "name" | "from" | "how" | "why"; // a question they asked the Walker, waiting for the answer
  errand?: Errand; // something the Walker asked them to fetch
  carrying?: string; // what they are bringing (water has no weight in the pack: "water")
  asks?: { item: AskItem; at: number }; // something they have asked the Walker for
  walkerTrust?: number; // 0..1: how well they have come to know the Walker, from talking with them
  shunned?: boolean; // the others have lost faith in them and keep away
  joyAt?: number; // world clock of the last small thing they noticed and enjoyed
  heard?: string[]; // tales they have been told (so they are not told twice)
  pregnant?: { since: number; father: string }; // carrying a child, born after GESTATION
  illness?: { severity: number; since: number }; // sick, 0..1
  wound?: number; // hurt by an animal, 0..1: heals slowly and may turn bad
  hygiene?: number; // 0 clean .. 1 filthy: dirt invites sickness; a wash at the water sets it right
  diet?: Record<string, number>; // what they have eaten lately by kind (fruit, grain, stored), fading over a couple of days
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
  carry: { wood: number; food: number; seed: number; hide?: number }; // what they are carrying
  clothing?: number; // 0 bare .. 1 well wrapped; wears out, kept warm in winter
  tools: { spear: boolean; net?: boolean };
  grief?: number; // 0..1: how heavily a loss weighs; fades over days, eased by sitting at a grave and by company
  // What they have learned from living, from thinking back over what happened (reflect): each 0..1, and each tilts what they choose.
  lessons?: { prepare: number; careful: number };
  // What they have lived through since they last thought it over, in sim seconds (and frights), and when that was.
  values?: Record<Value, number>; // what matters to them (identity.ts)
  talents?: Record<Skill, number>; // how quickly they learn each skill
  skills?: Record<Skill, number>; // how good they are at each now
  story?: string; // who they are, in a few lines
  role?: string; // what they are known for (their best skill, once it is worth naming)
  psyche?: Psyche; // drives, body chemistry, lasting states, habits, cues (psyche.ts)
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
  visitor?: { x: number; z: number }; // the Creator walking the world as a hunter (set by the page): prey run from them
  noGo?: { x: number; z: number; r: number }[]; // deep water and the like: nobody walks into it
  teams?: Team[]; // parties gone against a beast
  works?: Work[]; // songs, stories, paintings and books made so far
  knowledge?: Record<string, { by: string; byName: string; t: number }>; // what has been worked out, and by whom
  tenets?: Tenet[]; // the answers to the big questions that people hold
  chronicle?: { t: number; text: string }[]; // the notable things that have happened to everyone, in order
  names?: Record<string, { name: string; by: string; known: string[] }>; // what the people call the places, who named each and who knows it
  norms?: Record<string, { strength: number; announced?: boolean }>; // customs forming among the people (norms.ts)
  fish?: number; // how many fish the river holds (kept by step)
  built?: number; // how many things the people have made (their ids)
  maxPeople?: number; // births stop at this many living people (default 12)
  tally?: Record<string, number>; // how often notable things have happened (for the lifelike check and the Creator's curiosity)
  rng?: number; // the world's own random stream (animals), kept so a saved world carries on the same
  // The Creator's hand on the weather: until `until` (world clock) it is warmer or colder by `tempOffset`, and `rain` forces it on or off.
  override?: { until: number; tempOffset: number; rain?: boolean };
  walkerEvents?: WalkerEvent[];
  walker?: { pack: { meat: number; water: number; wood: number; fruit: number }; notes?: string[] }; // the Creator's own character: what they carry (kept with the save)
  strangers?: boolean; // people from outside may arrive now and then (the page turns this on)
}

// ---- Strangers: now and then people from outside come to the edge of the land, and the others decide whether to take them in ----

function strangersStep(world: World, dt: number) {
  if (!world.strangers) return;
  const now = world.clock ?? 0;
  const residents = world.people.filter((q) => !q.stranger);
  const present = world.people.filter((q) => q.stranger && !q.stranger.verdict);
  const season = world.weather?.season ?? 1;
  const R = world.radius ?? 40;
  // An arrival: rarely, with room, not in the dead of winter.
  if (!present.length && residents.length >= 2 && world.people.length < (world.maxPeople ?? 12) && season !== 3 && worldRand(world) < dt / (18 * DAY)) {
    const a = worldRand(world) * Math.PI * 2;
    const n = 1 + Math.floor(worldRand(world) * 2.4);
    for (let i = 0; i < n; i++) {
      const sex: "m" | "f" = worldRand(world) < 0.5 ? "m" : "f";
      const id = `stranger-${(world.built = (world.built ?? 0) + 1)}`;
      const names = CHILD_NAMES[sex];
      const p = makePerson(id, Math.cos(a) * R * 0.95 + i, Math.sin(a) * R * 0.95, Math.floor(worldRand(world) * 1e9), { boldness: worldRand(world), sociability: 0.3 + 0.6 * worldRand(world), curiosity: worldRand(world), appetite: worldRand(world), patience: worldRand(world) }, { name: names[Math.floor(worldRand(world) * names.length)]!, sex, age: 20 + Math.floor(worldRand(world) * 20) });
      p.needs.hunger = 0.6;
      p.needs.thirst = 0.5;
      p.stranger = { since: now };
      world.people.push(p);
      tally(world, "strangersArrived");
    }
    chronicle(world, "Strangers came to the edge of the land.");
    return;
  }
  for (const st of present) {
    // They walk toward the people, and wait to be seen.
    const near = residents.map((q) => ({ q, d: dist(q.x, q.z, st.x, st.z) })).sort((a, b) => a.d - b.d)[0];
    if (!near) continue;
    if (!st.intent || st.intent.kind === "wander") st.intent = { kind: "wander", x: near.q.x, z: near.q.z, speed: 1.4, remaining: 2, arrived: false };
    if (near.d > 9) continue;
    st.stranger!.verdict ??= undefined;
    // Seen: each of the people near makes up their mind; the people decide together by what most of them feel.
    const judges = residents.filter((q) => dist(q.x, q.z, st.x, st.z) < 30);
    if (!judges.length) continue;
    let welcome = 0;
    const larder = residents.reduce((a, q) => a + q.carry.food, 0) + world.things.filter((t) => t.kind === "shelter").reduce((a, t) => a + (t.stock ?? 0), 0);
    for (const q of judges) welcome += 0.15 + 0.6 * q.personality.sociability - 0.3 * q.personality.boldness + 0.35 * strengthOf(world, "share") + (larder / Math.max(1, residents.length) > 1.5 ? 0.15 : -0.15) + 0.2 * valueOf(q, "kin") - 0.15 * valueOf(q, "tradition");
    welcome /= judges.length;
    if (welcome > 0.45) {
      st.stranger!.verdict = "joined";
      for (const q of judges) {
        const r = relation(q, st.id, world);
        r.familiarity = 0.25;
        r.affinity = 0.3;
        r.trust = 0.35;
        const back = relation(st, q.id, world);
        back.familiarity = 0.25;
        back.affinity = 0.35;
        back.trust = 0.4;
        note(q, world, `${st.name} came from far away and we took them in.`);
        feelEmotion(q, "joy", 0.2);
      }
      note(st, world, "I came a long way, hungry. They gave me a place by their fire.");
      st.stranger = undefined;
      st.carry.food = Math.max(st.carry.food, 1);
      chronicle(world, `${st.name} came from far away and was taken in.`);
      tally(world, "strangersJoined");
    } else {
      st.stranger!.verdict = "left";
      for (const q of judges) note(q, world, `We turned ${st.name} away. We cannot feed another.`);
      note(st, world, "They would not have us. I will try elsewhere.");
      chronicle(world, `${st.name} was turned away.`);
      tally(world, "strangersTurnedAway");
    }
  }
  // Those turned away walk off the edge of the land and are gone.
  for (const st of [...world.people]) {
    if (st.stranger?.verdict !== "left") continue;
    const a = Math.atan2(st.z, st.x);
    st.intent = { kind: "wander", x: Math.cos(a) * R * 1.05, z: Math.sin(a) * R * 1.05, speed: 1.6, remaining: 2, arrived: false };
    if (Math.hypot(st.x, st.z) > R * 1.0) world.people.splice(world.people.indexOf(st), 1);
  }
}

// Errands and requests between the Walker and the people (see askFor, giveToPerson, errandStep).
export type AskItem = "water" | "food" | "wood" | "protect";
export interface Errand {
  kind: AskItem;
  stage: "go" | "back";
  sourceId?: string; // where they are fetching it from
  until: number; // world clock after which they give up
}
// What happened between the Walker and the people, for the page to show and to act on (it empties the list as it reads).
export interface WalkerEvent {
  kind: "delivered" | "failed" | "asked";
  who: string;
  item: AskItem;
  text: string;
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

export function rand(person: Person): number {
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
// A point pushed out of any place nobody can walk into (a lake), to its edge.
export function keepOut(world: World, p: { x: number; z: number }) {
  for (const c of world.noGo ?? []) {
    const d = Math.hypot(p.x - c.x, p.z - c.z);
    if (d < c.r) {
      const k = d < 1e-6 ? 1 : c.r / d;
      p.x = d < 1e-6 ? c.x + c.r : c.x + (p.x - c.x) * k;
      p.z = d < 1e-6 ? c.z : c.z + (p.z - c.z) * k;
    }
  }
}
// A point to walk to first so that the straight way from A to B does not go through deep water: round the near side of it, or nothing if the way is clear.
export function routeAround(world: World, ax: number, az: number, bx: number, bz: number): { x: number; z: number } | undefined {
  for (const c of world.noGo ?? []) {
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz;
    if (len2 < 1) continue;
    const t = Math.max(0, Math.min(1, ((c.x - ax) * dx + (c.z - az) * dz) / len2));
    const cx = ax + dx * t;
    const cz = az + dz * t;
    const away = Math.hypot(cx - c.x, cz - c.z);
    if (away >= c.r + 0.5 || Math.hypot(ax - c.x, az - c.z) < c.r - 0.5 || Math.hypot(bx - c.x, bz - c.z) < c.r - 0.5) continue;
    const side = away < 1e-6 ? { x: -dz / Math.sqrt(len2), z: dx / Math.sqrt(len2) } : { x: (cx - c.x) / away, z: (cz - c.z) / away };
    return { x: c.x + side.x * (c.r + 4), z: c.z + side.z * (c.r + 4) };
  }
  return undefined;
}

// A point pulled back inside the garden's edge when it lies outside.
function inside(world: World, x: number, z: number): { x: number; z: number } {
  const r = world.radius;
  const d = Math.hypot(x, z);
  return r === undefined || d <= r ? { x, z } : { x: (x / d) * r, z: (z / d) * r };
}
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const clampMood = (v: number) => Math.max(-1, Math.min(1, v));
export const aff = (t: Thing): Affordances => AFFORDANCES[t.kind] ?? {};
// Danger is felt well beyond touching distance.
const dangerReach = (t: Thing) => t.radius + 6 + 10 * (aff(t).danger ?? 0);

/** What someone leaves goes to a grown child (the eldest), else a partner, else whoever loved them most: what they carried, and the keepsake they were carving. */
function inherit(world: World, dead: Person) {
  const living = world.people.filter((q) => q.id !== dead.id);
  const children = living.filter((q) => (q.mother === dead.id || q.father === dead.id) && q.age >= ADULT_AGE).sort((a, b) => b.age - a.age);
  const partner = living.find((q) => bondOf(dead, q) === "partner");
  const loved = living.filter((q) => (q.relations.get(dead.id)?.affinity ?? 0) > 0.4).sort((a, b) => (b.relations.get(dead.id)?.affinity ?? 0) - (a.relations.get(dead.id)?.affinity ?? 0));
  const heir = children[0] ?? partner ?? loved[0];
  const c = dead.carry;
  const left = (c.wood ?? 0) + (c.food ?? 0) + (c.seed ?? 0) + (c.hide ?? 0);
  if (!heir || (left <= 0 && !dead.keepsake)) return;
  heir.carry.wood += c.wood ?? 0;
  heir.carry.food += c.food ?? 0;
  heir.carry.seed += c.seed ?? 0;
  if (c.hide) heir.carry.hide = (heir.carry.hide ?? 0) + c.hide;
  dead.carry = { wood: 0, food: 0, seed: 0 };
  if (dead.keepsake) {
    (heir.keepsakes ??= []).push({ from: dead.id, item: dead.keepsake.item });
    dead.keepsake = undefined;
  }
  note(heir, world, `${dead.name}'s things came to me.`);
  chronicle(world, `${dead.name}'s belongings passed to ${heir.name}.`);
  tally(world, "inherited");
}

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
function opinionOf(person: Person, other: Person, world?: World): number {
  let v = 0;
  // Someone the others have lost faith in is shunned: not sought out.
  if (world && world.people.length >= 3 && standing(world, other) < 0.22) v -= 0.6;
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
    chronicle(world, `${person.name} lost their temper with ${near.name}.`);
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
    let hazard = (0.025 / DAY) * vul * (deficient(person) ? 1.35 : 1) * (1 + 0.6 * clamp01(((person.hygiene ?? 0) - 0.5) / 0.5)) * (1 + 1.5 * person.cold + 2.4 * Math.max(0, needs.hunger - 0.5) + (world.weather?.raining && !sheltered ? 0.5 : 0) + (needs.energy > 0.9 ? 0.5 : 0));
    for (const q of world.people) if (q !== person && q.illness && dist(person.x, person.z, q.x, q.z) < 4) hazard += (0.5 / DAY) * q.illness.severity;
    if (rand(person) < hazard * dt) {
      person.illness = { severity: 0.25 + 0.3 * rand(person), since: now };
      note(person, world, "Fell ill.");
      tally(world, "illnesses");
      if (person.age < 1 || person.age > 55) chronicle(world, `${person.name} fell ill.`);
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
  chronicle(world, `${person.name} named the ${t.kind === "peak" ? "hills" : t.kind} ${name}.`);
  tally(world, "named");
}
// Talking passes on what they know of the world: where there is water or food, a place to shelter, or something to fear. The listener can then
// plan to go there, though they have never seen it.
function shareKnowledge(a: Person, b: Person, world: World) {
  for (const [from, to] of [[a, b], [b, a]] as const) {
    let best: { t: Thing; value: number } | undefined;
    for (const [id, m] of from.memory) {
      if (to.memory.has(id)) continue;
      const t = thingById(world, id);
      if (!t) continue;
      const k = aff(t);
      const value = k.danger ? 0.9 * (k.danger ?? 0) : k.water ? 0.8 : k.food ? 0.6 + 0.2 * (k.food ?? 0) : k.shelter || k.rest ? 0.4 : k.view ? 0.2 : 0;
      if (value > (best?.value ?? 0)) best = { t, value: value * (0.5 + 0.5 * Math.abs(m.feeling) + 0.3) };
    }
    if (!best) continue;
    const theirs = from.memory.get(best.t.id)!;
    to.memory.set(best.t.id, { x: best.t.x, z: best.t.z, feeling: theirs.feeling * 0.5, visits: 0, lastSeen: to.clock });
    note(to, world, `${from.name} told me about ${phrase(best.t)}.`);
    note(from, world, `Told ${to.name} about ${phrase(best.t)}.`);
    tally(world, "tipsShared");
    return;
  }
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

// Children learn by watching: whoever is young and close by picks up a little of what an adult is doing.
function watchedBy(world: World, doer: Person, skill: Skill) {
  for (const q of world.people) {
    if (q === doer || q.age >= ADULT_AGE + 8 || dist(q.x, q.z, doer.x, doer.z) > 7) continue;
    if (skillOf(doer, skill) <= skillOf(q, skill)) continue;
    practise(q, skill, q.mother === doer.id || q.father === doer.id ? 0.03 : 0.015);
    tally(world, "watched");
  }
}

// The world's own record of what mattered: births, deaths, customs, names, and the rest, in order.
export function chronicle(world: World, text: string) {
  const list = (world.chronicle ??= []);
  list.push({ t: world.clock ?? 0, text });
  if (list.length > 400) list.splice(0, list.length - 400);
}

// The Creator walking among them (world.visitor, set by the page): the people notice a stranger who came from nowhere, are glad of the company,
// and are grateful when meat is shared.
function noticeVisitor(world: World) {
  const v = world.visitor;
  if (!v) return;
  for (const q of world.people) {
    if (dist(q.x, q.z, v.x, v.z) > 14 || q.heard?.includes("walker")) continue;
    (q.heard ??= []).push("walker");
    note(q, world, "A stranger in a green hood came walking out of nowhere. They seem to mean no harm.");
    feelEmotion(q, "joy", 0.3);
    q.needs.social = clamp01(q.needs.social - 0.2);
    q.say = "Hello, stranger.";
    if (!world.tally?.walkerSeen) chronicle(world, "A stranger in a green hood, the Walker, was seen among the people.");
    tally(world, "walkerSeen");
  }
}
// A kill near hungry people feeds them; they remember who did it.
export function shareKill(world: World, killed: Thing) {
  if (!world.visitor || !aff(killed).prey) return;
  let fed = 0;
  for (const q of world.people) {
    if (dist(q.x, q.z, killed.x, killed.z) > 30 || q.needs.hunger < 0.35) continue;
    q.carry.food = Math.min(8, q.carry.food + 2);
    feelEmotion(q, "gratitude", 0.5);
    note(q, world, "The Walker brought down game near me and left me the meat.");
    fed++;
  }
  if (fed) {
    chronicle(world, `The Walker brought down ${phrase(killed)} and fed ${fed === 1 ? "one of the people" : `${fed} of the people`}.`);
    tally(world, "gaveMeat");
  }
}

// The Walker hands carried meat to someone: it feeds them, they remember the kindness, and word of it spreads to the others who are near.
export function giveMeat(world: World, to: Person): boolean {
  if (to.needs.hunger < 0.2) {
    to.say = "Thank you, but I am not hungry. Keep it for someone who is.";
    return false;
  }
  to.carry.food = Math.min(8, to.carry.food + 2);
  to.needs.hunger = clamp01(to.needs.hunger - 0.3);
  eaten(to, "meat");
  feelEmotion(to, "gratitude", 0.7);
  note(to, world, "The Walker put meat in my hands when I was hungry.");
  to.say = "Bless you, Walker.";
  for (const q of world.people) {
    if (q === to || dist(q.x, q.z, to.x, to.z) > 20) continue;
    note(q, world, `I saw the Walker feed ${to.name}.`);
    feelEmotion(q, "joy", 0.2);
  }
  tally(world, "gaveMeat");
  chronicle(world, `The Walker fed ${to.name} with their own hands.`);
  return true;
}

// The small pleasures of a day. How often a person stops to notice one depends on their nature (the curious and patient notice most), and
// what they notice depends on the season, hour, sky, company and what they are doing (see joys.ts). Each one lifts them a little and is remembered lightly.
function noticeSmallJoys(world: World, person: Person, weather: Weather, nearFire: boolean) {
  const hour = hourOf(world.clock ?? 0);
  const appreciation = 0.35 + 0.65 * (0.5 * person.personality.curiosity + 0.5 * person.personality.patience);
  const gap = (12 * 60) / appreciation; // sim seconds between moments, on average
  if ((world.clock ?? 0) - (person.joyAt ?? -1e9) < gap || rand(person) > 0.1) return;
  const band: Band = hour < 5 ? "night" : hour < 7.5 ? "dawn" : hour < 11 ? "morning" : hour < 14 ? "noon" : hour < 18 ? "afternoon" : hour < 21 ? "dusk" : "night";
  const sky: Sky = weather.snowing ? "snow" : weather.raining ? "rain" : weather.fog > 0.45 ? "fog" : weather.windMs > 6 ? "wind" : "clear";
  const near = world.people.filter((q) => q !== person && dist(q.x, q.z, person.x, person.z) < 8).length;
  const kind = person.intent?.kind;
  const doing: Doing = kind === "eat" ? "eat" : kind === "drink" ? "drink" : kind === "sleep" ? "sleep" : kind === "rest" ? "rest" : kind === "talk" ? "talk" : kind === "gather" || kind === "plant" || kind === "craft" || kind === "fish" || kind === "hunt" || kind === "build" || kind === "sew" || kind === "wash" || kind === "create" || kind === "make" || kind === "invent" ? "work" : kind === "wander" || kind === "look" ? "walk" : "idle";
  const warm = nearFire || (sky === "clear" && band !== "night" && person.cold < 0.3);
  const options = joysFor({ season: weather.season, band, sky, company: near === 0 ? "alone" : near === 1 ? "one" : "group", doing, warm });
  if (!options.length) return;
  person.joyAt = world.clock ?? 0;
  const trigger = options[Math.floor(rand(person) * options.length)]!;
  const text = joyText(trigger, rand(person), rand(person), rand(person));
  feelEmotion(person, "joy", 0.05 + 0.1 * appreciation);
  person.needs.social = clamp01(person.needs.social - (near ? 0.02 : 0));
  note(person, world, text);
  tally(world, "smallJoys");
  tally(world, `joy_${trigger.id}`);
}

// ---- Errands: "bring me water" ----

const SOURCE_OF: Record<AskItem, (t: Thing) => boolean> = {
  protect: () => false,
  water: (t) => !!aff(t).water,
  food: (t) => (aff(t).food ?? 0) > 0 && !aff(t).fish && (t.stock === undefined || t.stock > 0),
  wood: (t) => !!aff(t).wood,
};
const ITEM_WORD: Record<AskItem, string> = { water: "water", food: "food", wood: "wood", protect: "protection" };

/** The nearest place they know of to get it, or undefined: they cannot fetch what they have never seen. */
export function knownSource(world: World, person: Person, kind: AskItem): Thing | undefined {
  let best: Thing | undefined;
  let bestD = Infinity;
  for (const t of world.things) {
    if (!SOURCE_OF[kind](t) || !person.memory.has(t.id)) continue;
    const d = dist(person.x, person.z, t.x, t.z);
    if (d < bestD) (best = t), (bestD = d);
  }
  return best;
}

/** Whether they will do it, and why not. */
export function willingToFetch(person: Person, world: World): { ok: boolean; why?: string } {
  const n = person.needs;
  if (person.errand) return { ok: false, why: "I am already on an errand for you." };
  if (n.thirst > 0.8) return { ok: false, why: "I am too thirsty myself to go anywhere but the water." };
  if (n.hunger > 0.85) return { ok: false, why: "I am faint with hunger. I must eat first." };
  if (n.energy > 0.9) return { ok: false, why: "I can hardly stand. I must rest." };
  if (person.age < 6) return { ok: false, why: "I am too small to carry that." };
  if (person.intent?.kind === "sleep" && person.intent.arrived) return { ok: false, why: "..." };
  if ((person.walkerTrust ?? 0) > 0.12 || person.personality.sociability > 0.55) return { ok: true };
  void world;
  return { ok: false, why: "I do not know you well enough to run errands for you." };
}

export function startErrand(world: World, person: Person, kind: AskItem): { ok: boolean; why?: string } {
  const will = willingToFetch(person, world);
  if (!will.ok) return will;
  const source = person.carry.food >= 1 && kind === "food" ? undefined : knownSource(world, person, kind);
  if (!source && !(kind === "food" && person.carry.food >= 1) && !(kind === "wood" && person.carry.wood >= 1)) return { ok: false, why: `I do not know where to find ${ITEM_WORD[kind]}.` };
  person.errand = { kind, stage: source ? "go" : "back", sourceId: source?.id, until: (world.clock ?? 0) + 900 };
  if (!source) person.carrying = kind;
  tally(world, "errands");
  return { ok: true };
}

function endErrand(person: Person, world: World, failed: string | undefined) {
  const e = person.errand;
  if (!e) return;
  person.errand = undefined;
  person.carrying = undefined;
  if (person.intent?.kind === "fetch" || person.intent?.kind === "wander") person.intent = undefined;
  if (failed) {
    person.say = failed;
    (world.walkerEvents ??= []).push({ kind: "failed", who: person.id, item: e.kind, text: failed });
    tally(world, "errandsFailed");
  }
}

// One step of an errand: go to the source, take what is there, bring it back to the Walker, put it in their hands.
function errandStep(person: Person, world: World, dt: number) {
  const e = person.errand;
  if (!e) return;
  const now = world.clock ?? 0;
  const v = world.visitor;
  const n = person.needs;
  if (!v) return endErrand(person, world, undefined);
  if (now > e.until) return endErrand(person, world, "I could not find you. I am sorry.");
  if (n.thirst > 0.9 || n.hunger > 0.92 || n.energy > 0.95 || (person.intent?.kind === "flee")) return endErrand(person, world, "I must see to myself first. Forgive me.");
  if (e.stage === "go") {
    const source = e.sourceId ? thingById(world, e.sourceId) : undefined;
    if (!source) return endErrand(person, world, "It has gone. I could not get it.");
    const cur = person.intent;
    if (!cur || cur.kind !== "fetch") person.intent = { kind: "fetch", targetId: source.id, x: source.x, z: source.z, speed: WALK, remaining: 4, arrived: false };
    else if (cur.arrived && cur.remaining <= dt + 0.01) {
      // They have the water in their hands or the fruit in the basket.
      if (e.kind === "food" && source.stock !== undefined) source.stock = Math.max(0, source.stock - 1);
      if (e.kind === "wood") person.carry.wood += 1;
      person.carrying = e.kind === "wood" ? undefined : e.kind;
      e.stage = "back";
      person.intent = undefined;
    }
    return;
  }
  // Back to the Walker.
  const d = dist(person.x, person.z, v.x, v.z);
  if (d <= 2.6) {
    if (e.kind === "wood") person.carry.wood = Math.max(0, person.carry.wood - 1);
    if (e.kind === "food" && person.carry.food >= 1 && !person.carrying) person.carry.food -= 1;
    const text = e.kind === "water" ? "Here, Walker. Cool water from the river." : e.kind === "food" ? "Here, Walker. Eat." : "Here, Walker. Wood for your fire.";
    (world.walkerEvents ??= []).push({ kind: "delivered", who: person.id, item: e.kind, text });
    person.say = text;
    feelEmotion(person, "pride", 0.3);
    person.walkerTrust = Math.min(1, (person.walkerTrust ?? 0) + 0.06);
    person.journal.push({ t: now, text: `I brought the Walker ${ITEM_WORD[e.kind]}.`, w: 0.3 });
    tally(world, "errandsDone");
    chronicle(world, `${person.name} brought the Walker ${ITEM_WORD[e.kind]}.`);
    person.errand = undefined;
    person.carrying = undefined;
    person.intent = undefined;
    return;
  }
  person.intent = { kind: "wander", x: v.x, z: v.z, speed: d > 12 ? RUN * 0.6 : 2.3, remaining: 2, arrived: false };
}

// ---- Requests: people ask the Walker for what they need ----

const ASK_LINES: Record<AskItem, string[]> = {
  protect: ["Walker, there is something prowling near us. Could you drive it off?", "Walker, we are afraid. A beast has been watching us. Will you help?"],
  water: ["Walker, could you bring me some water? I cannot go on much longer.", "Walker, I am parched. Is there any water you could spare?"],
  food: ["Walker, have you any food to spare? I am so hungry.", "Walker, could you share a little meat or fruit? I have nothing."],
  wood: ["Walker, I am freezing. Could you bring me some wood for a fire?", "Walker, the cold is getting into me. A little wood, if you can."],
};

function askStep(person: Person, world: World) {
  const v = world.visitor;
  const now = world.clock ?? 0;
  if (person.asks && now - person.asks.at > 420) person.asks = undefined; // not answered: they go without, and ask no more for a while
  if (!v || person.asks || person.errand || person.age < 4) return;
  if (now - ((person as { askedAt?: number }).askedAt ?? -1e9) < 600) return;
  if (dist(person.x, person.z, v.x, v.z) > 9) return;
  if ((person.walkerTrust ?? 0) < 0.05 && person.personality.sociability < 0.45) return; // too shy to ask a stranger
  const n = person.needs;
  const lurking = world.things.some((t) => aff(t).predator && aff(t).danger && dist(t.x, t.z, person.x, person.z) < 35 && person.memory.has(t.id));
  const item: AskItem | undefined = lurking && (person.emotions?.fear ?? 0) > 0.2 && person.personality.boldness < 0.85 ? "protect" : n.thirst > 0.65 ? "water" : n.hunger > 0.65 && person.carry.food < 1 ? "food" : person.cold > 0.6 && person.carry.wood < 1 ? "wood" : undefined;
  if (!item) return;
  person.asks = { item, at: now };
  (person as { askedAt?: number }).askedAt = now;
  const lines = ASK_LINES[item];
  const text = lines[Math.floor(rand(person) * lines.length)]!;
  person.say = text;
  (world.walkerEvents ??= []).push({ kind: "asked", who: person.id, item, text });
  tally(world, "asksOfWalker");
}

/** The Walker puts something in their hands: it eases the need, and they remember who did it. Returns false if they have no use for it. */
export function giveToPerson(world: World, person: Person, item: AskItem): boolean {
  const n = person.needs;
  if (item === "water" && n.thirst < 0.15) return false;
  if (item === "food" && n.hunger < 0.2) return false;
  if (item === "wood" && person.cold < 0.2 && person.carry.wood >= 2) return false;
  const asked = person.asks?.item === item;
  if (item === "water") n.thirst = clamp01(n.thirst - 0.55);
  else if (item === "food") {
    n.hunger = clamp01(n.hunger - 0.4);
    eaten(person, "fruit");
  } else person.carry.wood += 2;
  feelEmotion(person, "gratitude", asked ? 0.7 : 0.5);
  person.walkerTrust = Math.min(1, (person.walkerTrust ?? 0) + (asked ? 0.1 : 0.05));
  note(person, world, `The Walker gave me ${ITEM_WORD[item]}${asked ? " when I asked" : ""}.`);
  person.say = item === "water" ? "Thank you, Walker. That is the best thing I have drunk." : item === "food" ? "Bless you, Walker." : "Thank you. Now I can make a fire.";
  person.asks = undefined;
  for (const q of world.people) {
    if (q === person || dist(q.x, q.z, person.x, person.z) > 20) continue;
    note(q, world, `I saw the Walker help ${person.name}.`);
    feelEmotion(q, "joy", 0.15);
  }
  tally(world, "walkerGifts");
  chronicle(world, `The Walker gave ${person.name} ${ITEM_WORD[item]}.`);
  return true;
}

/** The Walker brought down a beast that was a danger: those who had asked for protection, and anyone near, are relieved and grateful. */
export function walkerSlew(world: World, killed: Thing) {
  if (!aff(killed).predator) return;
  let relieved = 0;
  for (const q of world.people) {
    if (dist(q.x, q.z, killed.x, killed.z) > 60) continue;
    const asked = q.asks?.item === "protect";
    if (q.emotions) q.emotions.fear = 0;
    feelEmotion(q, "gratitude", asked ? 0.9 : 0.4);
    q.walkerTrust = Math.min(1, (q.walkerTrust ?? 0) + (asked ? 0.25 : 0.08));
    note(q, world, asked ? `The Walker drove off the ${killed.kind} that threatened us, as I asked.` : `The Walker killed the ${killed.kind} near us.`);
    if (asked) q.asks = undefined;
    relieved++;
  }
  if (relieved) {
    chronicle(world, `The Walker killed ${phrase(killed)} that had been stalking the people.`);
    tally(world, "predatorsSlain");
  }
}

// A norm gains ground; when it becomes a custom everyone writes it down.
function uphold(world: World, id: NormId, by: Person, amount: number) {
  if (!reinforce(world, id, by, amount)) return;
  for (const q of world.people) note(q, world, `A custom has formed among us: ${NORM_TEXT[id]}.`);
  tally(world, "customs");
  chronicle(world, `A custom formed: ${NORM_TEXT[id]}.`);
}

// What they eat, by kind: a diet of one thing wears the body down; fruit, grain and meat or fish together do not.
function eaten(person: Person, kind: string) {
  const d = (person.diet ??= {});
  d[kind] = (d[kind] ?? 0) + 1;
}
export function deficient(person: Person): boolean {
  const d = person.diet;
  if (!d) return false;
  const total = Object.values(d).reduce((a, v) => a + v, 0);
  const kinds = Object.values(d).filter((v) => v > 0.3).length;
  return total >= 4 && kinds < 2;
}

// An infant is carried and nursed: it stays by its mother, drinks her milk, and does not choose anything; without her it starves.
function infantStep(person: Person, world: World, dt: number, external: boolean) {
  const mother = world.people.find((q) => q.id === person.mother);
  if (!mother) {
    person.needs.hunger = clamp01(person.needs.hunger + dt / 4000);
    return;
  }
  const d = dist(person.x, person.z, mother.x, mother.z);
  if (d > 2.5) {
    if (external) person.intent = { kind: "wander", x: mother.x, z: mother.z, speed: 2.6, remaining: 2, arrived: false };
    else {
      const stepLen = Math.min(d - 1.5, 2.6 * dt);
      person.x += ((mother.x - person.x) / d) * stepLen;
      person.z += ((mother.z - person.z) / d) * stepLen;
      person.intent = undefined;
    }
  } else {
    person.intent = { kind: "linger", x: person.x, z: person.z, speed: 0, remaining: 5, arrived: true };
    if (mother.needs.hunger < 0.85) {
      person.needs.hunger = clamp01(person.needs.hunger - dt / 250);
      person.needs.thirst = clamp01(person.needs.thirst - dt / 250); // milk is drink too
      mother.needs.hunger = clamp01(mother.needs.hunger + dt / 1500);
      person.needs.social = clamp01(person.needs.social - dt / 400);
    }
  }
}

export function note(person: Person, world: World, text: string) {
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
export function relation(person: Person, otherId: string, world: World): Relation {
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
export const YOUNG_PREFAB: Record<string, string> = { deer: "Fawn", horse: "Foal", cow: "Calf", stag: "Young Stag", alpaca: "Cria", donkey: "Young Donkey" };
export const MATURE_AGE = 0.9; // Eden years: before this a creature is small and quick
const PREFAB_OF: Record<string, string> = { barrel: "Barrel", table: "Table", lantern: "Lantern", chest: "Chest", shelf: "Shelf", shrine: "Shrine", alpaca: "Alpaca", campfire: "Campfire", shelter: "Shelter", grave: "Grave", crop: "Crop", deer: "Deer", fox: "Fox", wolf: "Wolf", horse: "Horse", dog: "Dog", stag: "Stag", cow: "Cow", donkey: "Donkey" };
export function make(world: World, kind: string, x: number, z: number, extra: Partial<Thing> = {}): Thing {
  world.built = (world.built ?? 0) + 1;
  const thing: Thing = { id: `${kind}-${world.built}`, kind, x, z, radius: 3, prefab: PREFAB_OF[kind], ...extra };
  if (thing.mob && thing.mob.age < MATURE_AGE && YOUNG_PREFAB[kind]) thing.prefab = YOUNG_PREFAB[kind];
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
    // Someone in a party that has gone against this beast does not run from it: they came to face it together.
    if (person.team && world.teams?.some((tm) => tm.id === person.team && tm.state === "go" && tm.target === t.id)) continue;
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
    if (a.water && (t.stock === undefined || t.stock > 0)) add("drink", t, thirsty, 8);
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
  cultureOptions(person, world, out);
  planOptions(person, world, out);
  lifeOptions(person, world, out);
  // A child does not gather, build or lay food by, and stays close to their mother.
  if (person.age < ADULT_AGE) {
    const allowed = new Set<IntentKind>(["wash", "mourn", "eat", "drink", "rest", "sleep", "look", "play", "talk", "comfort", "linger", "wander", "warm"]);
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
    // Nobody wakes a sleeper to chat.
    if (other.intent?.kind === "sleep" && other.intent.arrived) continue;
    // Someone hungry, and food in hand: give it.
    if (person.carry.food >= 1 && other.needs.hunger > 0.6 && other.carry.food < 1 && !(other.shunned && !(other.mother === person.id || other.father === person.id || person.mother === other.id))) {
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
    // A keepsake carved for this person.
    if (person.keepsake?.to === other.id) out.push({ intent: { kind: "gift", targetId: other.id, x: other.x, z: other.z, speed: WALK, remaining: 5 }, score: 1.1 + 0.3 * p.sociability });
    // A swap that suits them both: spare food for wood, or wood for food.
    if (other.age >= ADULT_AGE && person.age >= ADULT_AGE && !other.shunned && !(other.intent?.kind === "sleep" && other.intent.arrived)) {
      const iNeedWood = person.carry.wood < 2 && (person.cold > 0.25 || winterNear(world)) && person.carry.food >= 3;
      const iNeedFood = person.carry.food < 1 && needs.hunger > 0.4 && person.carry.wood >= 4;
      if ((iNeedWood && other.carry.wood >= 4 && other.carry.food < 3) || (iNeedFood && other.carry.food >= 3 && other.carry.wood < 4))
        out.push({ intent: { kind: "trade", targetId: other.id, x: other.x, z: other.z, speed: WALK, remaining: 4 }, score: 1.0 + 0.5 * relation(person, other.id, world).trust + 0.2 * p.sociability });
    }
    // Showing a child how it is done.
    if (person.age >= ADULT_AGE && other.age < 14 && other.age >= 2 && !isNight(world.clock ?? 0)) {
      const kin = other.mother === person.id || other.father === person.id;
      const best = Math.max(...(["forage", "fish", "hunt", "farm", "build", "heal"] as const).map((sk) => skillOf(person, sk) - skillOf(other, sk)));
      if (best > 0.2) out.push({ intent: { kind: "teach", targetId: other.id, x: other.x, z: other.z, speed: WALK, remaining: 25 }, score: 0.35 + 0.4 * p.sociability + (kin ? 0.4 * valueOf(person, "kin") : 0) + 0.3 * valueOf(person, "tradition") });
    }
    // Taking food that is not theirs, when starving, with nothing to eat, from someone they do not love, and bold enough.
    if (needs.hunger > 0.85 && person.carry.food < 1 && other.carry.food >= 2 && other.age >= ADULT_AGE && (person.relations.get(other.id)?.affinity ?? 0) < 0.5 && p.boldness > 0.45 && !world.things.some((t) => aff(t).food && !aff(t).fish && known(t) && (t.stock === undefined || t.stock > 0)))
      out.push({ intent: { kind: "steal", targetId: other.id, x: other.x, z: other.z, speed: WALK, remaining: 1 }, score: 0.6 + 2.4 * urge(needs.hunger, 0.85) * (0.4 + p.boldness) });
    // People do not chatter through the night.
    const wish = night ? 0 : urge(needs.social, 0.32 - 0.1 * p.sociability) * (0.8 + 0.9 * p.sociability);
    if (wish <= 0) continue;
    out.push({
      intent: { kind: "talk", targetId: other.id, x: other.x, z: other.z, speed: WALK, remaining: 20 + 20 * p.sociability },
      score: 1.4 * wish - effort(other.x, other.z) + opinionOf(person, other, world),
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
    const remedies = out.filter((o) => o.intent.kind === worse || (worse === "eat" && (o.intent.kind === "hunt" || o.intent.kind === "fish" || o.intent.kind === "steal")));
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
// Things made for a home, in the order a household wants them, and what each costs in wood.
const FURNITURE = ["barrel", "table", "lantern", "chest", "shelf"] as const;
const FURNITURE_WOOD: Record<string, number> = { barrel: 3, table: 3, lantern: 2, chest: 3, shelf: 3, shrine: 4 };
const p0 = (person: Person) => person.personality;
const winterNear = (world: World) => winterComing(world);
function furnitureNear(world: World, sh: Thing): Thing[] {
  return world.things.filter((t) => (FURNITURE as readonly string[]).includes(t.kind) && dist(t.x, t.z, sh.x, sh.z) < 9);
}
/** What a household would make next, or nothing if it has enough; a shrine first for someone devout where there is none. */
function nextFurniture(world: World, sh: Thing, person: Person): string | undefined {
  if (valueOf(person, "tradition") > 0.7 && !world.things.some((t) => t.kind === "shrine")) return "shrine";
  const have = furnitureNear(world, sh);
  if (have.length >= 2 + Math.floor(world.people.length / 2)) return undefined;
  const kinds = new Set(have.map((t) => t.kind));
  return FURNITURE.find((k) => !kinds.has(k));
}
/** A free place round a shelter, spread out so the things do not stand on each other. */
function furnitureSpot(world: World, sh: Thing): { x: number; z: number } {
  const n = furnitureNear(world, sh).length;
  const a = n * 1.9 + 0.7;
  return { x: sh.x + Math.cos(a) * (4 + (n % 2)), z: sh.z + Math.sin(a) * (4 + (n % 2)) };
}

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
  // Washing at the water, when they have got dirty.
  if ((person.hygiene ?? 0) > 0.5) {
    for (const t of world.things) {
      if (!AFFORDANCES[t.kind]?.water || !person.memory.has(t.id)) continue;
      const d = dist(person.x, person.z, t.x, t.z);
      if (d > 60) continue;
      out.push({ intent: { kind: "wash", targetId: t.id, x: t.x, z: t.z, speed: WALK, remaining: 14 }, score: 0.35 + 0.8 * urge(person.hygiene ?? 0, 0.5) - d / 120 });
    }
  }
  // A hide becomes a cloak when it is cold or coming on to be.
  if ((person.carry.hide ?? 0) >= 1 && (person.clothing ?? 0) < 0.7) {
    const cold = world.weather ? (season === 3 ? 1 : season === 2 ? 0.6 : 0.2) : 0.3;
    out.push({ intent: { kind: "sew", x: person.x, z: person.z, speed: 0, remaining: 40 }, score: 0.4 + 0.7 * cold + 0.3 * person.cold - 0.4 * (person.clothing ?? 0) });
  }
  // A stray dog may be won with food and patience.
  if (person.carry.food >= 1 && person.age >= ADULT_AGE) {
    for (const t of world.things) {
      if (t.kind !== "dog" || t.of || !person.memory.has(t.id)) continue;
      const d = dist(person.x, person.z, t.x, t.z);
      if (d > 40) continue;
      out.push({ intent: { kind: "tame", targetId: t.id, x: t.x, z: t.z, speed: WALK, remaining: 0.3 }, score: 0.5 + 0.3 * person.personality.sociability - d / 100 - (world.things.some((q) => q.kind === "dog" && q.of === person.id) ? 0.4 : 0) });
    }
  }
  // Making a home of it: a table, a barrel for rain, a lantern, a chest, a shelf; a roof raised into a hut; a shrine for those who keep faith.
  if (person.age >= ADULT_AGE && needs.hunger < 0.6 && needs.thirst < 0.6 && person.cold < 0.5 && !isNight(world.clock ?? 0)) {
    for (const sh of world.things) {
      if (sh.kind !== "shelter" || !person.memory.has(sh.id)) continue;
      const d = dist(person.x, person.z, sh.x, sh.z);
      if (d > 70) continue;
      const wood = person.carry.wood;
      const next = nextFurniture(world, sh, person);
      if (next && wood >= FURNITURE_WOOD[next]!) {
        const at = furnitureSpot(world, sh);
        out.push({ intent: { kind: "furnish", targetId: sh.id, x: at.x, z: at.z, speed: WALK, remaining: 30 }, score: 0.3 + 0.5 * valueOf(person, "comfort") + (next === "shrine" ? 0.5 * valueOf(person, "tradition") : 0) + gift(person, "build") - d / 150 });
      }
      if ((sh.level ?? 1) < 2 && wood >= 4) out.push({ intent: { kind: "improve", targetId: sh.id, x: sh.x + 2, z: sh.z, speed: WALK, remaining: 50 }, score: 0.3 + 0.4 * valueOf(person, "comfort") + gift(person, "build") - d / 150 });
    }
  }
  // Carving something for someone they care for.
  if (person.age >= ADULT_AGE && person.carry.wood >= 1 && !person.keepsake && needs.hunger < 0.6 && !isNight(world.clock ?? 0)) {
    const dear = world.people.filter((q) => q !== person && (person.relations.get(q.id)?.affinity ?? 0) > 0.5 && dist(person.x, person.z, q.x, q.z) < 60 && !(q.keepsakes ?? []).some((k) => k.from === person.id)).sort((a, b) => (person.relations.get(b.id)?.affinity ?? 0) - (person.relations.get(a.id)?.affinity ?? 0))[0];
    if (dear) out.push({ intent: { kind: "carve", targetId: dear.id, x: person.x, z: person.z, speed: 0, remaining: 40 }, score: 0.25 + 0.4 * p0(person).sociability + 0.3 * valueOf(person, "kin") + gift(person, "build") });
  }
  // Prayer at a holy place, a grave or the Tree of Life, morning and evening, by those who keep to the old ways or are grieving.
  {
    const hour = hourOf(world.clock ?? 0);
    const holyHour = (hour > 5.5 && hour < 8.5) || (hour > 17 && hour < 20);
    const faith = valueOf(person, "tradition");
    if (person.age >= ADULT_AGE && needs.hunger < 0.6 && needs.thirst < 0.6 && (faith > 0.6 || faithful(person) > 0.4 || (person.grief ?? 0) > 0.3)) {
      for (const t of world.things) {
        if (!(aff(t).holy || t.kind === "tree of life" || (t.kind === "grave" && t.of && (person.relations.get(t.of)?.affinity ?? 0) > 0.3)) || !person.memory.has(t.id)) continue;
        const d = dist(person.x, person.z, t.x, t.z);
        if (d > 80) continue;
        out.push({ intent: { kind: "pray", targetId: t.id, x: t.x, z: t.z, speed: WALK, remaining: 30 }, score: 0.15 + 0.5 * Math.max(0, faith - 0.5) + (holyHour ? 0.35 : 0) + 0.5 * (person.grief ?? 0) - d / 200 });
      }
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
  // Dusk at the fire: once it is the custom, people go to it at day's end to be together.
  const dusk = (() => {
    const hr = hourOf(world.clock ?? 0);
    const set = daylight(world.clock ?? 0).set;
    return hr > set - 1.5 && hr < set + 1.5;
  })();
  if (dusk && strengthOf(world, "gather") > 0.2) for (const f of fires) add("warm", f, 0.4 + 1.0 * strengthOf(world, "gather"), 50);
  // Under the custom, whoever sees the fire low feeds it.
  if (wood >= 1) for (const f of fires) if ((f.fuel ?? 0) < 2 * FIRE_SECONDS_PER_WOOD && strengthOf(world, "tend") > 0) add("fire", f, 0.9 * strengthOf(world, "tend") + 0.2, 12);
  // Something carried is eaten where they stand.
  if (food > 0 && hungry > 0) out.push({ intent: { kind: "eat", x: person.x, z: person.z, speed: 0, remaining: 12 }, score: hungry * 0.95 + (needs.hunger > 0.9 ? 2.5 : 0) }); // starving with food in hand, nothing comes first
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

export function thingById(world: World, id: string | undefined): Thing | undefined {
  return id === undefined ? undefined : world.things.find((t) => t.id === id);
}
export function personById(world: World, id: string | undefined): Person | undefined {
  return id === undefined ? undefined : world.people.find((q) => q.id === id);
}

function finish(person: Person, world: World, intent: Intent) {
  finishCore(person, world, intent);
  afterAct(world, person, intent);
}
function finishCore(person: Person, world: World, intent: Intent) {
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
        eaten(person, "stored");
        joy(0.05);
        person.say = "That was good.";
        note(person, world, "Ate what I had put by.");
      } else if (t && a.food && (t.stock === undefined || t.stock > 0)) {
        needs.hunger = clamp01(needs.hunger - a.food * (1 + 0.3 * skillOf(person, "forage")));
        if (t.kind !== "shelter") practise(person, "forage", 0.015);
        eaten(person, t.kind === "crop" ? "grain" : t.kind === "shelter" ? "stored" : "fruit");
        if (t.kind === "crop") practise(person, "farm", 0.02);
        if (t.stock !== undefined) t.stock -= 1;
        joy(0.1);
        feel(person, t, 0.15); // a good meal makes the place better in memory
        if (t.kind !== "shelter" && t.kind !== "crop" && rand(person) < (knows(world, "seed-saving") ? 0.65 : 0.35)) person.carry.seed = Math.min(6, person.carry.seed + 1);
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
      if (t && t.kind === "barrel" && t.stock !== undefined) t.stock = Math.max(0, t.stock - 1);
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
        watchedBy(world, person, "build");
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
        if (take > 0 && t.kind !== "crop" && rand(person) < (knows(world, "seed-saving") ? 0.9 : 0.6)) person.carry.seed = Math.min(6, person.carry.seed + 1);
      }
      break;
    case "warm":
      person.mood = clampMood(person.mood + 0.05);
      // Together at the fire at dusk: it is a small custom of its own, and a comfort.
      if (t && burning(t)) {
        const hr = hourOf(world.clock ?? 0);
        const set = daylight(world.clock ?? 0).set;
        const here = world.people.filter((q) => q !== person && dist(q.x, q.z, t.x, t.z) < 8);
        if (hr > set - 1.5 && hr < set + 1.5 && here.length) {
          uphold(world, "gather", person, 0.05);
          needs.social = clamp01(needs.social - 0.25);
          joy(0.15);
          tally(world, "duskGatherings");
        }
      }
      break;
    case "plant":
      if (person.carry.seed >= 1) {
        person.carry.seed -= 1;
        make(world, "crop", intent.x, intent.z, { stock: 0, maxStock: 3 + Math.round(2 * skillOf(person, "farm")), radius: 2 });
        practise(person, "farm", 0.1);
        watchedBy(world, person, "farm");
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
      watchedBy(world, person, "fish");
      if (rand(person) < 0.55 * activity * Math.min(1, fish / 15) * (0.7 + 0.6 * person.personality.patience) * (1 + 0.7 * skillOf(person, "fish")) * (person.tools.net ? 1.5 : 1)) {
        world.fish = Math.max(0, fish - 1);
        person.carry.food = Math.min(8, person.carry.food + (person.tools.net ? 3 : 2));
        note(person, world, person.tools.net ? "Hauled in the net: a good catch." : "Caught a fish.");
        tally(world, "fished");
        person.say = "A fish. Supper.";
        joy(0.12);
      } else {
        note(person, world, "Waited at the river and caught nothing.");
        person.mood = clampMood(person.mood - 0.03);
      }
      break;
    }
    case "wash":
      if ((person.hygiene ?? 0) > 0.1) {
        person.hygiene = 0;
        person.say = "That is better.";
        joy(0.1);
        note(person, world, "Washed at the water.");
        tally(world, "washed");
      }
      break;
    case "sew":
      if ((person.carry.hide ?? 0) >= 1) {
        person.carry.hide = (person.carry.hide ?? 0) - 1;
        person.clothing = Math.min(1, (person.clothing ?? 0) + 0.45);
        practise(person, "build", 0.03);
        person.say = "That will keep the wind off.";
        note(person, world, "Sewed a cloak from a hide.");
        tally(world, "sewn");
        joy(0.1);
      }
      break;
    case "tame": {
      const dog = thingById(world, intent.targetId);
      if (dog && dog.kind === "dog" && !dog.of && dist(person.x, person.z, dog.x, dog.z) < 3.8 && person.carry.food >= 1) {
        person.carry.food -= 1;
        dog.trust = (dog.trust ?? 0) + 1;
        person.say = "Here, boy. It is all right.";
        joy(0.1);
        if (dog.trust >= 3) {
          dog.of = person.id;
          note(person, world, "A dog has chosen me.");
          chronicle(world, `A dog chose ${person.name}.`);
          feelEmotion(person, "joy", 0.5);
          person.mood = clampMood(person.mood + 0.3);
          tally(world, "tamed");
        } else note(person, world, "Fed a stray dog. It let me near.");
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
      if (prey && aff(prey).predator && dist(person.x, person.z, prey.x, prey.z) < 3.8) {
        practise(person, "hunt", 0.05);
        fightBeast(world, person, prey, skillOf(person, "hunt"));
      } else if (prey && dist(person.x, person.z, prey.x, prey.z) < 3.8) {
        practise(person, "hunt", 0.05);
        watchedBy(world, person, "hunt");
        if (rand(person) < (0.45 + 0.3 * person.personality.boldness) * (1 + 0.6 * skillOf(person, "hunt"))) {
          world.things.splice(world.things.indexOf(prey), 1);
          person.carry.food = Math.min(8, person.carry.food + 4);
          person.carry.hide = Math.min(4, (person.carry.hide ?? 0) + 1);
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
          if (other.illness) other.illness.severity = Math.max(0, other.illness.severity - (knows(world, "medicine") ? 0.12 : 0.08) * (0.5 + heal));
          if (other.wound) other.wound = Math.max(0, other.wound - 0.1 * (0.5 + heal));
          if (other.illness && heal >= 0.45) {
            other.illness.severity = Math.max(0, other.illness.severity - 0.12);
            note(person, world, `Gave ${other.name} a remedy of herbs.`);
            tally(world, "remedies");
          }
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
        owe(world, person, other);
        person.say = `Here, ${other.name}. Eat.`;
        note(person, world, `Gave ${other.name} some food.`);
        note(other, world, `${person.name} gave me food when I was hungry.`);
        other.mood = clampMood(other.mood + 0.15);
      }
      break;
    }
    case "furnish": {
      const sh = thingById(world, intent.targetId);
      const kind = sh ? nextFurniture(world, sh, person) : undefined;
      const cost = kind ? FURNITURE_WOOD[kind]! : 99;
      if (sh && kind && person.carry.wood >= cost) {
        person.carry.wood -= cost;
        practise(person, "build", 0.05);
        const af = AFFORDANCES[kind]!;
        make(world, kind, intent.x, intent.z, { radius: 2, ...(af.stock !== undefined ? { stock: af.stock, maxStock: af.stock } : {}) });
        joy(0.15);
        person.say = kind === "shrine" ? "A place to be quiet in." : `There. ${kind === "table" ? "A table to eat at" : kind === "barrel" ? "The rain will fill it" : kind === "lantern" ? "A light for the evenings" : "That will do nicely"}.`;
        note(person, world, `Made ${kind === "shrine" ? "a shrine" : `a ${kind}`} for our home.`);
        if (kind === "shrine") chronicle(world, `${person.name} built a shrine.`);
        tally(world, "furnished");
        tally(world, `made_${kind}`);
      }
      break;
    }
    case "improve": {
      const sh = thingById(world, intent.targetId);
      if (sh && (sh.level ?? 1) < 2 && person.carry.wood >= 4) {
        person.carry.wood -= 4;
        sh.level = 2;
        sh.prefab = "Hut";
        practise(person, "build", 0.08);
        joy(0.25);
        person.say = "Now it is a proper house.";
        note(person, world, "Raised our roof into a proper thatched hut.");
        chronicle(world, `${person.name} raised the shelter into a hut.`);
        tally(world, "huts");
      }
      break;
    }
    case "carve": {
      const other = personById(world, intent.targetId);
      if (other && person.carry.wood >= 1) {
        person.carry.wood -= 1;
        const items = ["a carved bird", "a wooden flute", "a little carved horse", "a string of wooden beads", "a carved bowl", "a small wooden doll"];
        const item = items[Math.floor(rand(person) * items.length)]!;
        person.keepsake = { to: other.id, item };
        practise(person, "build", 0.03);
        joy(0.1);
        note(person, world, `Carved ${item} for ${other.name}.`);
        tally(world, "carved");
      }
      break;
    }
    case "gift": {
      const other = personById(world, intent.targetId);
      const k = person.keepsake;
      if (other && k && k.to === other.id) {
        person.keepsake = undefined;
        (other.keepsakes ??= []).push({ from: person.id, item: k.item });
        const mine = relation(person, other.id, world);
        const theirs = relation(other, person.id, world);
        mine.affinity = Math.min(1, mine.affinity + 0.08);
        theirs.affinity = Math.min(1, theirs.affinity + 0.18);
        theirs.trust = Math.min(1, theirs.trust + 0.1);
        theirs.gifts = (theirs.gifts ?? 0) + 1;
        feelEmotion(other, "gratitude", 0.6);
        feelEmotion(other, "joy", 0.3);
        feelEmotion(person, "pride", 0.3);
        person.say = `I made this for you, ${other.name}.`;
        other.say = "It is lovely. I will keep it always.";
        owe(world, person, other);
        note(person, world, `Gave ${other.name} ${k.item} I had carved.`);
        note(other, world, `${person.name} gave me ${k.item}, carved by their own hands.`);
        tally(world, "keepsakesGiven");
        if ((world.tally?.keepsakesGiven ?? 0) === 1) chronicle(world, `${person.name} gave ${other.name} ${k.item} of their own making.`);
      }
      break;
    }
    case "trade": {
      const other = personById(world, intent.targetId);
      if (other) {
        const rate = tradeRates(world);
        if (person.carry.food >= rate.food + 1 && other.carry.wood >= rate.wood + 1) {
          person.carry.food -= rate.food;
          other.carry.food = Math.min(6, other.carry.food + rate.food);
          other.carry.wood -= rate.wood;
          person.carry.wood += rate.wood;
        } else if (person.carry.wood >= rate.wood + 1 && other.carry.food >= rate.food + 1) {
          person.carry.wood -= rate.wood;
          other.carry.wood += rate.wood;
          other.carry.food -= rate.food;
          person.carry.food = Math.min(6, person.carry.food + rate.food);
        } else break;
        for (const [a, b] of [[person, other], [other, person]] as const) {
          const r = relation(a, b.id, world);
          r.trust = Math.min(1, r.trust + 0.05);
          r.affinity = Math.min(1, r.affinity + 0.03);
          note(a, world, `Swapped food for wood with ${b.name}: ${rate.food} food for ${rate.wood} wood. A fair trade.`);
        }
        person.say = "A fair swap.";
        tally(world, "trades");
      }
      break;
    }
    case "teach": {
      const child = personById(world, intent.targetId);
      if (child) {
        const taught = teach(person, child);
        if (taught) {
          note(child, world, `${person.name} showed me how to do better at ${SKILL_WORDS[taught.skill].doing}.`);
          owe(world, person, child, 0.5);
          note(person, world, `Taught ${child.name} ${SKILL_WORDS[taught.skill].doing}.`);
          tally(world, "lessons");
          person.say = `Watch my hands, ${child.name}. Now you.`;
        }
        const r = relation(child, person.id, world);
        r.affinity = Math.min(1, r.affinity + 0.04);
        r.trust = Math.min(1, r.trust + 0.03);
        joy(0.1);
      }
      break;
    }
    case "invent":
      doInvent(world, person, joy);
      break;
    case "make":
      doMake(world, person, intent.targetId, joy);
      break;
    case "create":
      doCreate(world, person, joy);
      break;
    case "ponder":
      doPonder(world, person, joy);
      break;
    case "read":
      doRead(world, person, t, joy);
      break;
    case "pray": {
      joy(0.2);
      person.grief = Math.max(0, (person.grief ?? 0) - 0.04);
      person.mood = clampMood(person.mood + 0.1);
      const companions = world.people.filter((q) => q !== person && q.intent?.kind === "pray" && q.intent.arrived && dist(q.x, q.z, person.x, person.z) < 10);
      note(person, world, companions.length ? `Prayed with ${companions.map((q) => q.name).join(" and ")}${t ? ` at ${phrase(t)}` : ""}. It is easier together.` : `Prayed${t ? ` at ${phrase(t)}` : ""}. I felt calmer.`);
      for (const q of companions) {
        relation(person, q.id, world).affinity = Math.min(1, relation(person, q.id, world).affinity + 0.03);
        relation(q, person.id, world).affinity = Math.min(1, relation(q, person.id, world).affinity + 0.03);
      }
      if (companions.length) {
        tally(world, "ritesTogether");
        if ((world.tally?.ritesTogether ?? 0) === 1) chronicle(world, `${person.name} and ${companions[0]!.name} prayed together${t ? ` at ${phrase(t)}` : ""}; the first rite of the people.`);
      }
      tally(world, "prayers");
      break;
    }
    case "steal": {
      const victim = personById(world, intent.targetId);
      if (victim && victim.carry.food >= 1) {
        victim.carry.food -= 1;
        person.carry.food = Math.min(6, person.carry.food + 1);
        const theirs = relation(victim, person.id, world);
        theirs.affinity = Math.max(-1, theirs.affinity - 0.3);
        theirs.trust = Math.max(0, theirs.trust - 0.4);
        theirs.lastQuarrel = world.clock ?? 0;
        feelEmotion(victim, "anger", 0.6);
        feelEmotion(person, "shame", 0.5);
        psycheEvent(person, "wrong", 1);
        person.thefts = (person.thefts ?? 0) + 1;
        note(person, world, `Took food from ${victim.name} because I was starving. I am ashamed.`);
        note(victim, world, `${person.name} took food from me.`);
        // Those who hear of it trust the thief a little less: the loss of faith that ends in being shunned.
        for (const q of world.people) {
          if (q === person || q === victim || dist(q.x, q.z, victim.x, victim.z) > 30) continue;
          const r = relation(q, person.id, world);
          r.trust = Math.max(0, r.trust - 0.12);
          note(q, world, `${person.name} took food from ${victim.name}.`);
        }
        chronicle(world, `${person.name} took food from ${victim.name}.`);
        tally(world, "thefts");
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
        psycheEvent(person, "wrong", 0.5);
        psycheEvent(person, "threat", 0.3);
        psycheEvent(other, "threat", 0.3);
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
          r.affinity = Math.max(-1, Math.min(1, r.affinity + appraise(who === person ? other : person, who.id, 0.03 + 0.04 * who.personality.sociability)));
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
        shareKnowledge(person, other, world);
        exchangeIdeas(world, person, other);
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
        if (exchange.tale && !(other.heard ?? []).includes(exchange.tale)) {
          (other.heard ??= []).push(exchange.tale);
          if (other.heard.length > 60) other.heard.shift();
          note(other, world, `${person.name} told me: ${exchange.tale}`);
          tally(world, "storiesTold");
        }
        if (exchange.topic === "joke") {
          // They laugh together: it lifts both, and is remembered as a good moment.
          for (const who of [person, other]) {
            // Someone grieving, angry or afraid does not laugh at it, however kindly it was meant.
            if ((who.grief ?? 0) > 0.2 || (who.emotions?.anger ?? 0) > 0.4 || (who.emotions?.fear ?? 0) > 0.4) continue;
            who.laughUntil = (world.clock ?? 0) + 4;
            feelEmotion(who, "joy", 0.3);
            who.needs.social = clamp01(who.needs.social - 0.1);
          }
          const mine = relation(person, other.id, world);
          const theirs = relation(other, person.id, world);
          mine.affinity = Math.min(1, mine.affinity + 0.03);
          theirs.affinity = Math.min(1, theirs.affinity + 0.03);
          note(person, world, `Laughed with ${other.name}.`);
          note(other, world, `${person.name} made me laugh.`);
          tally(world, "laughs");
        }
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
          chronicle(world, `${person.name} and ${other.name} made things right.`);
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
  noticeVisitor(world);
  // The river's fish breed in the warm months and keep to the deep in winter; a few come down from upstream, so it is never quite empty.
  const fish = (world.fish ??= 30);
  world.fish = Math.min(40, fish + dt * (0.0002 * fish * (1 - fish / 40) * FISH_BY_SEASON[weather.season]! + 1 / DAY));
  // Food grows back, a meal at a time, quickly in summer and rain and hardly at all in winter.
  for (const t of world.things) {
    if (t.maxStock === undefined || t.stock === undefined || t.stock >= t.maxStock || !worksNow(world, t)) continue;
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
  learnFromWorld(world);
  teamStep(world);
  strangersStep(world, dt);
  for (const person of world.people) {
    person.clock += dt;
    const { needs, personality: p } = person;
    const asleep = person.intent?.kind === "sleep" && person.intent.arrived;
    // Warmth: what the air is, with clothes on, a roof overhead, a fire close by, and the rain if there is no roof.
    const shelterAt = world.things.find((t) => t.kind === "shelter" && dist(person.x, person.z, t.x, t.z) < 3.5);
    const sheltered = !!shelterAt;
    const nearFire = world.things.some((t) => burning(t) && dist(person.x, person.z, t.x, t.z) < 6);
    if (person.age >= 3) noticeSmallJoys(world, person, weather, nearFire);
    // A home that has been made pleasant: a table, a lantern, a shrine near where they rest, eat or talk lifts the mood a little.
    if (person.intent?.arrived && (["rest", "sleep", "eat", "talk", "linger", "mourn", "pray"] as IntentKind[]).includes(person.intent.kind)) {
      let c = 0;
      for (const t of world.things) {
        const k = aff(t).comfort;
        if (k && dist(person.x, person.z, t.x, t.z) < 4.5) c += k;
      }
      if (c > 0) person.mood = clampMood(person.mood + (Math.min(0.3, c) * dt) / 240);
    }
    const effective = weather.tempC + 5 + 6 * (person.clothing ?? 0) + (sheltered ? 8 + 4 * ((shelterAt?.level ?? 1) - 1) : 0) + (nearFire ? 12 : 0) - (weather.raining && !sheltered ? 4 : 0) - (sheltered ? 0 : 0.5 * weather.windMs); // wind takes the warmth away
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
    psycheStep(person, world, dt);
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
    if (person.clothing) person.clothing = Math.max(0, person.clothing - dt / (24 * DAY));
    person.age += dt / YEAR;
    person.hygiene = clamp01((person.hygiene ?? 0) + dt / (4 * DAY));
    for (const k of Object.keys(person.diet ?? {})) {
      person.diet![k] = person.diet![k]! * Math.pow(0.5, dt / DAY);
      if (person.diet![k]! < 0.02) delete person.diet![k];
    }
    if (person.age < 1) {
      infantStep(person, world, dt, !!settings.externalMotion);
      continue;
    }

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
    // A dog at their side steadies them, and is company.
    const dogNear = world.things.some((q) => q.kind === "dog" && q.of === person.id && dist(q.x, q.z, person.x, person.z) < 8);
    if (dogNear) needs.social = clamp01(needs.social - dt / 1800);
    // An anxious or alert body takes fright sooner; a steady one, later.
    const jumpy = (person.psyche?.state === "anxious" ? 0.12 : 0) + 0.2 * ((person.psyche?.chem.noradrenaline ?? 0.25) - 0.25);
    const scared = hurt || f.level > 0.25 + 0.3 * p.boldness + 0.7 * desperate + (dogNear ? 0.25 : 0) - jumpy;
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

    errandStep(person, world, dt);
    askStep(person, world);
    // Walking with the Walker, when asked: they keep near, until a real need or danger calls them away.
    if ((person.followUntil ?? 0) > (world.clock ?? 0) && world.visitor && person.intent?.kind !== "flee") {
      if (needs.hunger > 0.8 || needs.thirst > 0.8 || needs.energy > 0.92 || person.cold > 0.7) {
        person.followUntil = undefined;
        person.say = needs.thirst > 0.8 ? "I must drink. Go on without me." : needs.hunger > 0.8 ? "I must eat. Go on without me." : "I must rest. Go on without me.";
      } else {
        const v = world.visitor;
        const far = dist(person.x, person.z, v.x, v.z);
        person.intent = far > 3.5 ? { kind: "wander", x: v.x, z: v.z, speed: far > 12 ? RUN * 0.7 : 2.2, remaining: 2, arrived: false } : { kind: "linger", x: person.x, z: person.z, speed: 0, remaining: 3, arrived: true };
      }
    } else if (person.followUntil !== undefined && (person.followUntil <= (world.clock ?? 0) || !world.visitor)) person.followUntil = undefined;

    if (!person.intent) {
      const opts = options(person, world);
      psycheBias(person, world, opts);
      const picked = choose(person, opts);
      person.intent = { ...picked.intent, arrived: false };
    }
    const intent = person.intent;
    if (!intent) continue;
    // Following another person: walk toward where they are now.
    if (intent.kind === "hunt" || intent.kind === "tame") {
      const prey = thingById(world, intent.targetId);
      if (!prey) person.intent = undefined;
      else {
        intent.x = prey.x;
        intent.z = prey.z;
      }
    }
    if (!person.intent) continue;
    if (SOCIAL.has(intent.kind)) {
      const other = personById(world, intent.targetId);
      if (other) {
        intent.x = other.x;
        intent.z = other.z;
      }
    }

    if (!intent.arrived) {
      const d = dist(person.x, person.z, intent.x, intent.z);
      const stop = SOCIAL.has(intent.kind) ? REACH : intent.kind === "hunt" || intent.kind === "tame" ? 3 : intent.kind === "flee" || intent.kind === "wander" ? 0.4 : (thingById(world, intent.targetId)?.radius ?? 1) * 0.8;
      if (d <= stop + 0.05) {
        intent.arrived = true;
      } else if (settings.externalMotion) {
        continue;
      } else {
        const stepLen = Math.min(d - stop, intent.speed * dt);
        person.x += ((intent.x - person.x) / d) * stepLen;
        person.z += ((intent.z - person.z) / d) * stepLen;
        keepOut(world, person);
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
    // Someone has come to talk to them: they stop what they were walking to do, and listen.
    if (intent.kind === "talk") {
      const heard = personById(world, intent.targetId);
      // They fell asleep while someone was on their way: the talker lets them be.
      if (heard?.intent?.kind === "sleep" && heard.intent.arrived) {
        person.intent = undefined;
        continue;
      }
      const was = heard?.intent;
      if (heard && was && !was.arrived && was.kind !== "flee" && was.kind !== "talk" && was.kind !== "sleep" && heard.needs.hunger < 0.9 && heard.needs.thirst < 0.9)
        heard.intent = { kind: "linger", x: heard.x, z: heard.z, speed: 0, remaining: Math.max(3, intent.remaining), arrived: true, resume: was };
    }
    // There: spend the time, then take the result.
    intent.remaining -= dt;
    if (intent.remaining <= 0) {
      if (intent.resume) person.intent = { ...intent.resume, arrived: false };
      else finish(person, world, intent);
    }
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
    // Grown up: the young one's small body is swapped for an adult's (the page sees the prefab change).
    if (t.prefab && YOUNG_PREFAB[t.kind] === t.prefab && m.age >= MATURE_AGE) t.prefab = PREFAB_OF[t.kind];
    // A blow: it flinches where it stands.
    if (m.hurtUntil !== undefined && now < m.hurtUntil) {
      m.state = "hit";
      m.speed = 0;
      continue;
    }
    // Eating a kill: it stands over it and does nothing else for a while.
    if (m.eatUntil !== undefined && now < m.eatUntil) {
      m.state = m.attackUntil !== undefined && now < m.attackUntil ? "attack" : "eat";
      m.speed = 0;
      continue;
    }
    let state: MobState | undefined;
    let speed = a.mobile;
    let busy = false;
    if (t.kind === "dog" && t.of) {
      // A dog that has chosen someone stays with them, and goes where they go.
      const owner = world.people.find((q) => q.id === t.of);
      if (!owner) t.of = undefined;
      else if (dist(t.x, t.z, owner.x, owner.z) > 5) {
        m.tx = owner.x + (worldRand(world) - 0.5) * 3;
        m.tz = owner.z + (worldRand(world) - 0.5) * 3;
        speed = 2.4;
        busy = true;
        state = "follow";
      }
    }
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
      if (world.visitor && dist(t.x, t.z, world.visitor.x, world.visitor.z) < best) threat = world.visitor;
      for (const f of things) {
        if (!aff(f).predator) continue;
        const d = dist(t.x, t.z, f.x, f.z);
        if (d < best) {
          best = d;
          threat = f;
        }
      }
      if (threat && m.state !== "flee" && m.state !== "startle" && now >= m.fleeUntil) m.startleUntil = now + 0.9; // it freezes, head up, before it runs
      if (now < (m.startleUntil ?? 0)) {
        state = "startle";
        busy = true;
        speed = 0;
        m.tx = t.x;
        m.tz = t.z;
      } else if (threat || now < m.fleeUntil) {
        if (threat) {
          m.fleeUntil = now + 5; // it keeps running a few seconds after the danger is out of sight
          // The herd takes the alarm from it.
          for (const q of things) {
            if (q === t || q.kind !== t.kind || !q.mob || dist(q.x, q.z, t.x, t.z) > 16 || now < q.mob.fleeUntil) continue;
            q.mob.fleeUntil = now + 4;
            q.mob.startleUntil = now + 0.5 + 0.6 * worldRand(world);
          }
          const away = Math.atan2(t.z - threat.z, t.x - threat.x);
          const to = inside(world, t.x + Math.cos(away) * 14, t.z + Math.sin(away) * 14);
          m.tx = to.x;
          m.tz = to.z;
        }
        speed = 2.3;
        busy = true;
        state = "flee";
      }
    } else if (a.predator) {
      // A dog with someone near drives a fox or wolf off.
      const guard = things.find((q) => (q.kind === "dog" && q.of && dist(q.x, q.z, t.x, t.z) < 12) || (q.kind === "campfire" && (q.fuel ?? 0) > 0 && dist(q.x, q.z, t.x, t.z) < 15));
      if (guard) {
        if (guard.kind === "campfire") m.repelledAt = now; // beasts will not come near a burning fire
        const away = Math.atan2(t.z - guard.z, t.x - guard.x);
        const to = inside(world, t.x + Math.cos(away) * 14, t.z + Math.sin(away) * 14);
        m.tx = to.x;
        m.tz = to.z;
        speed = 2.6;
        busy = true;
        state = "flee";
      } else if (now - m.fed > 4 * DAY) {
        things.splice(things.indexOf(t), 1);
        continue;
      }
      if (!guard && now - m.fed > DAY) {
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
          state = "hunt";
          if (best < 1.3 && worldRand(world) < 0.5) {
            things.splice(things.indexOf(prey), 1);
            m.fed = now;
            m.attackUntil = now + 1.5;
            m.eatUntil = now + 11;
          }
        }
      }
    }
    // A creature that fights back (a stag, an alpaca, a wolf), hit: it turns on whoever did it, and butts or kicks when close.
    if ((m.angryUntil ?? 0) > now && world.visitor && FIGHTERS.has(t.kind)) {
      const d = dist(t.x, t.z, world.visitor.x, world.visitor.z);
      if (d > 2.4) {
        m.tx = world.visitor.x;
        m.tz = world.visitor.z;
        speed = 2.4;
        state = "hunt";
      } else {
        state = "attack";
        speed = 0;
        m.tx = t.x;
        m.tz = t.z;
      }
      busy = true;
    }
    // Age slows them.
    if (m.age > 9) speed *= 0.75;
    if (!busy) {
      const arrivedHere = dist(t.x, t.z, m.tx, m.tz) < 0.5;
      // The pause starts when it gets there, not when it set out, and is long at night.
      if (arrivedHere && !m.here) {
        m.here = true;
        m.wait = (isDark(now) ? 40 + 80 * worldRand(world) : 8 + 22 * worldRand(world)) * (m.idle === "graze" ? 1.4 : 1);
      }
      if (m.here) m.wait -= dt;
      if (m.here && m.wait <= 0) {
        m.here = false;
        // Time to go somewhere else: now and then to water, otherwise a short way on. What it does once there depends on what it is.
        const grazer = a.prey || t.kind === "horse" || t.kind === "cow" || t.kind === "donkey" || t.kind === "alpaca";
        const waterThing = grazer ? things.find((q) => aff(q).water) : undefined;
        if (waterThing && worldRand(world) < 0.12) {
          const a3 = worldRand(world) * Math.PI * 2;
          const to = inside(world, waterThing.x + Math.cos(a3) * 3, waterThing.z + Math.sin(a3) * 3);
          m.tx = to.x;
          m.tz = to.z;
          m.idle = "drink";
        } else {
          const a2 = worldRand(world) * Math.PI * 2;
          const hop = isDark(now) ? 1.5 + 2 * worldRand(world) : 3 + 6 * worldRand(world);
          // A herd animal stays with the others: more often than not it goes where they are.
          const mates = HERD.has(t.kind) ? things.filter((q) => q !== t && q.kind === t.kind && dist(q.x, q.z, t.x, t.z) < 45) : [];
          let hx = t.x;
          let hz = t.z;
          if (mates.length && worldRand(world) < 0.65) {
            hx = mates.reduce((v, q) => v + q.x, 0) / mates.length;
            hz = mates.reduce((v, q) => v + q.z, 0) / mates.length;
          }
          const to = inside(world, hx + Math.cos(a2) * hop, hz + Math.sin(a2) * hop);
          m.tx = to.x;
          m.tz = to.z;
          const roll = worldRand(world);
          m.idle = isDark(now) ? "rest" : grazer ? (roll < 0.6 ? "graze" : roll < 0.85 ? "stand" : "vigil") : roll < 0.5 ? "stand" : roll < 0.8 ? "vigil" : "rest";
        }
      }
    }
    const d = dist(t.x, t.z, m.tx, m.tz);
    let moved = 0;
    if (d > 0.05) {
      const stepLen = Math.min(d, speed * dt);
      const bx = t.x;
      const bz = t.z;
      t.x += ((m.tx - t.x) / d) * stepLen;
      t.z += ((m.tz - t.z) / d) * stepLen;
      keepOut(world, t);
      moved = dist(bx, bz, t.x, t.z);
    }
    m.speed = moved > 0.01 ? speed : 0;
    m.state = state && moved > 0.01 ? state : moved > 0.01 ? "walk" : state ?? m.idle ?? "stand";
    // Old deer die.
    if (m.age > (a.prey ? 10 : 16) && !(t.kind === "dog" && t.of) && worldRand(world) < (dt / DAY) * 0.05) things.splice(things.indexOf(t), 1);
  }
  // The herds of horses, cattle, alpacas, stags and donkeys have young too, in spring and summer, when there are two together and room.
  if (season === 0 || season === 1) {
    for (const kind of ["horse", "cow", "alpaca", "stag", "donkey"]) {
      const herd = things.filter((t) => t.kind === kind && t.mob);
      if (herd.length < 2 || herd.length >= 6 * Math.max(1, Math.min(4, (R / 36) ** 2 / 8)) || worldRand(world) >= (dt / DAY) * 0.25) continue;
      const a1 = herd[Math.floor(worldRand(world) * herd.length)]!;
      const pair = herd.find((q) => q !== a1 && dist(q.x, q.z, a1.x, a1.z) < 20 && (q.mob?.age ?? 0) > 2);
      if (!pair || (a1.mob?.age ?? 0) < 2) continue;
      const stock = AFFORDANCES[kind]?.stock;
      make(world, kind, a1.x + 1, a1.z, { radius: 2, ...(stock !== undefined ? { stock, maxStock: stock } : {}), mob: { tx: a1.x, tz: a1.z, wait: 0, fed: now, age: 0, fleeUntil: 0 } });
      tally(world, "youngBorn");
    }
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
  // The others' faith in them: lost, they are shunned; won back, they are taken in again.
  if (world.people.length >= 3) {
    const faith = standing(world, person);
    if (!person.shunned && faith < 0.22) {
      person.shunned = true;
      for (const q of world.people) note(q, world, q === person ? "The others keep away from me now." : `We have lost faith in ${person.name}.`);
      chronicle(world, `${person.name} was shunned by the others.`);
      tally(world, "shunned");
    } else if (person.shunned && faith > 0.35) {
      person.shunned = false;
      chronicle(world, `${person.name} was taken back among the others.`);
    }
  }
  neglect(person);
  const role = roleOf(person);
  if (role && person.role !== role.role) {
    person.role = role.role;
    note(person, world, `I have become known as the ${role.role}.`);
    tally(world, "roles");
    chronicle(world, `${person.name} became known as the ${role.role}.`);
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
    chronicle(world, `${mother.name}'s baby was born still.`);
  } else {
    mother.lastBirth = now;
    mother.pregnant = undefined;
    const sex: "m" | "f" = rand(mother) < 0.5 ? "m" : "f";
    const taken = new Set([...world.people, ...(world.dead ?? []).map((d) => d.person)].map((q) => q.name));
    // A child may be named for a grandparent who has died, so the name goes on.
    const namesake = (world.dead ?? []).find((d) => d.person.sex === sex && [mother.mother, mother.father, father.mother, father.father].includes(d.person.id))?.person;
    const named = namesake && rand(mother) < 0.55 ? namesake.name : undefined;
    const name = named ?? CHILD_NAMES[sex].find((n) => !taken.has(n)) ?? `${sex === "m" ? "Boy" : "Girl"} ${(world.built ?? 0) + 1}`;
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
      milestone(parent, world, "child", `became a ${parent === mother ? "mother" : "father"} when ${name} was born`);
      psycheEvent(parent, "touch", 1.5);
    }
    note(child, world, "I was born.");
    tally(world, "births");
    chronicle(world, `${name} was born to ${mother.name} and ${father.name}${named ? `, and named for ${named}, who is gone` : ""}.`);
    if (named) for (const q of world.people) if (q !== child && dist(q.x, q.z, mother.x, mother.z) < 40) note(q, world, `${mother.name} named the baby ${named}, for the one we lost.`);
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
    chronicle(world, `${person.name} died of ${cause}, aged ${person.age.toFixed(0)}.`);
    person.intent = undefined;
    make(world, "grave", person.x, person.z, { of: person.id, radius: 2 });
    inherit(world, person);
    for (const other of world.people) {
      const r = other.relations.get(person.id);
      const grief = Math.max(0, r?.affinity ?? 0);
      other.mood = clampMood(other.mood - 0.7 * grief);
      other.grief = clamp01((other.grief ?? 0) + 0.9 * grief);
      note(other, world, `${person.name} died${cause === "old age" ? " of old age" : ` of ${cause}`}.`);
      if (grief > 0.4) {
        psycheEvent(other, "loss", grief);
        milestone(other, world, "loss", `lost ${person.name}`);
      }
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
    chronicle(world, `${mother.name} is carrying a child.`);
  }
}

// The animation name for what a person is doing; the host's clip table (edenAgents.ts) maps these onto each model's own clips.
export function actionOf(person: Person): string {
  const intent = person.intent;
  if (!intent) return "observe";
  if (!intent.arrived) return intent.kind === "flee" ? "flee" : "wander";
  switch (intent.kind) {
    case "eat":
      return "eat";
    case "drink":
      return "drink";
    case "fish":
      return "fish";
    case "wash":
      return "wash";
    case "furnish":
    case "improve":
    case "carve":
    case "create":
    case "make":
    case "invent":
      return "craft";
    case "ponder":
    case "read":
      return "rest";
    case "pray":
      return "rest";
    case "gift":
    case "trade":
    case "teach":
      return "talk_to_other";
    case "steal":
      return "observe";
    case "fetch":
      return person.errand?.kind === "water" ? "drink" : person.errand?.kind === "wood" ? "chop" : "harvest";
    case "plant":
      return "plant";
    case "gather":
    case "build":
      return "chop";
    case "craft":
    case "sew":
    case "fire":
      return "craft";
    case "forage":
    case "stash":
    case "tame":
      return "harvest";
    case "sleep":
    case "mourn":
    case "rest":
    case "warm":
      return "rest";
    case "talk":
    case "share":
      return "talk_to_other";
    case "play":
      return "play_together";
    default:
      return "observe";
  }
}
