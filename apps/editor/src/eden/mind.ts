// The minds of Eden's people. Everything here is plain code that runs on the player's own machine: no network and no AI model.
//
// A person has needs that grow with time, a personality that weights what they care about, a memory of the things they have seen and
// how those things made them feel, and a list of things they could do. Each moment they score what they could do, favouring what
// the needs, personality, memory and a little chance say, and carry the best choice out; danger overrides everything. What they
// choose is not scripted, but it is repeatable: the same seed gives the same life, so it can be tested.
//
// The host (edenAgents.ts) feeds this the world's things and turns each person's `intent` into movement and an animation.

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
  rest?: boolean; // somewhere to sit or lie down
  view?: boolean; // somewhere beautiful (raises joy)
  play?: boolean; // open ground to move about on (raises joy a little)
  danger?: number; // 0..1: how much it hurts and frightens when close
  creature?: boolean; // alive and company-like, but not a person
  stock?: number; // how many meals it holds before it is used up (undefined: never runs out)
}

export const AFFORDANCES: Record<string, Affordances> = {
  grove: { food: 0.5 },
  river: { water: true },
  hollow: { rest: true },
  overlook: { view: true },
  meadow: { play: true },
  center: {},
  tree: { rest: true },
  "tree of life": { food: 0.7, stock: 3 },
  "tree of knowledge": { view: true },
  rock: { rest: true },
  bush: { food: 0.25, stock: 4 },
  deer: { creature: true },
  alpaca: { creature: true },
  fox: { danger: 0.6, creature: true },
  fire: { danger: 0.9 },
};

export interface Thing {
  id: string;
  kind: string; // a key of AFFORDANCES
  x: number;
  z: number;
  radius: number; // how near counts as "at" it; danger reaches further (below)
  stock?: number; // meals left, if it has a stock
}

// What a person remembers of a thing: where it is, and how being near it has felt.
export interface Memory {
  x: number;
  z: number;
  feeling: number; // -1 dreadful .. 1 lovely, moved by what happened there
  visits: number;
  lastSeen: number; // sim seconds
}

export type IntentKind = "eat" | "drink" | "rest" | "look" | "play" | "talk" | "flee" | "wander" | "linger";
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

export interface Person {
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
}

export interface World {
  things: Thing[];
  people: Person[];
}

export const SIGHT = 28; // how far a person notices things
export const REACH = 1.6; // how near is "at" a person
const WALK = 1.6;
const RUN = 4.2;
// Seconds for a need to fill from satisfied to urgent, scaled by appetite etc. A day is short here so a watcher sees a whole life.
const FILL_SECONDS: Record<NeedName, number> = { hunger: 600, thirst: 420, energy: 900, social: 360, joy: 480 };

function rand(person: Person): number {
  // mulberry32: small, fast, and the same sequence for the same seed.
  person.rngState = (person.rngState + 0x6d2b79f5) | 0;
  let t = person.rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function makePerson(id: string, x: number, z: number, seed: number, personality: Partial<Personality> = {}): Person {
  return {
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
  };
}

const dist = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const clampMood = (v: number) => Math.max(-1, Math.min(1, v));
const aff = (t: Thing): Affordances => AFFORDANCES[t.kind] ?? {};
// Danger is felt well beyond touching distance.
const dangerReach = (t: Thing) => t.radius + 6 + 10 * (aff(t).danger ?? 0);

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

// What a person could do now, each with a score: need urgency, shaped by personality and memory, less the effort of getting there.
function options(person: Person, world: World): Option[] {
  const out: Option[] = [];
  const { needs, personality: p } = person;
  const known = (t: Thing) => person.memory.get(t.id);
  const effort = (x: number, z: number) => dist(person.x, person.z, x, z) / 60;
  const add = (kind: IntentKind, t: Thing, want: number, seconds: number) => {
    const m = known(t);
    if (!m) return; // never seen: they do not know it exists
    // How it felt last time tilts the choice; a place they have loved draws them back.
    const score = want + m.feeling * 0.25 - effort(t.x, t.z);
    out.push({ intent: { kind, targetId: t.id, x: t.x, z: t.z, speed: WALK, remaining: seconds }, score });
  };
  for (const t of world.things) {
    const a = aff(t);
    if (a.food && (t.stock === undefined || t.stock > 0)) add("eat", t, needs.hunger * 1.4, 18);
    if (a.water) add("drink", t, needs.thirst * 1.4, 10);
    if (a.rest) add("rest", t, needs.energy * 1.3, 40 + 40 * (1 - p.patience));
    if (a.view) add("look", t, needs.joy * (0.5 + 0.7 * p.curiosity), 25 + 30 * p.patience);
    if (a.play) add("play", t, needs.joy * (0.4 + 0.5 * p.curiosity), 30);
    if (a.creature && !a.danger) add("look", t, needs.joy * 0.4 + 0.3 * p.curiosity * (1 - needs.joy), 20);
  }
  for (const other of world.people) {
    if (other === person) continue;
    const seen = dist(person.x, person.z, other.x, other.z) <= SIGHT * 2;
    if (!seen) continue;
    out.push({
      intent: { kind: "talk", targetId: other.id, x: other.x, z: other.z, speed: WALK, remaining: 20 + 20 * p.sociability },
      score: needs.social * (0.6 + 0.9 * p.sociability) - effort(other.x, other.z),
    });
  }
  // Wandering to somewhere new is always possible, and curious people do it more.
  const angle = rand(person) * Math.PI * 2;
  const reach = 8 + 14 * rand(person);
  out.push({
    intent: { kind: "wander", x: person.x + Math.cos(angle) * reach, z: person.z + Math.sin(angle) * reach, speed: WALK, remaining: 4 + 6 * rand(person) },
    score: 0.12 + 0.35 * p.curiosity * (1 - 0.5 * Math.max(needs.hunger, needs.thirst, needs.energy)),
  });
  out.push({ intent: { kind: "linger", x: person.x, z: person.z, speed: 0, remaining: 6 + 10 * p.patience }, score: 0.1 + 0.2 * p.patience });
  return out;
}

// Chooses among the options with a lean toward the best but not always the best: the higher their curiosity, the more they try the unexpected.
function choose(person: Person, opts: Option[]): Option {
  const temperature = 0.08 + 0.18 * person.personality.curiosity;
  const weights = opts.map((o) => Math.exp(o.score / temperature));
  const sum = weights.reduce((a, b) => a + b, 0);
  let r = rand(person) * sum;
  for (let i = 0; i < opts.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return opts[i]!;
  }
  return opts[opts.length - 1]!;
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
      if (t && a.food && (t.stock === undefined || t.stock > 0)) {
        needs.hunger = clamp01(needs.hunger - a.food);
        if (t.stock !== undefined) t.stock -= 1;
        joy(0.1);
        feel(person, t, 0.15); // a good meal makes the place better in memory
        person.say = t.stock === 0 ? "That was the last of it." : "That was good.";
      } else {
        // It was gone: the place loses its shine.
        if (t) feel(person, t, -0.2);
        person.say = "There is nothing left here.";
      }
      break;
    case "drink":
      needs.thirst = 0;
      if (t) feel(person, t, 0.08);
      joy(0.05);
      break;
    case "rest":
      needs.energy = clamp01(needs.energy - 0.7);
      if (t) feel(person, t, 0.1);
      break;
    case "look":
      joy(0.4);
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
      if (other) {
        other.needs.social = clamp01(other.needs.social - 0.5);
        other.mood = clampMood(other.mood + 0.1);
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
  }
  person.intent = undefined;
}

// Moves the world's people on by `dt` sim seconds. Nothing here reads the clock or the network: the same inputs give the same lives.
export function step(world: World, dt: number) {
  for (const person of world.people) {
    person.clock += dt;
    const { needs, personality: p } = person;
    needs.hunger = clamp01(needs.hunger + (dt / FILL_SECONDS.hunger) * (0.6 + 0.8 * p.appetite));
    needs.thirst = clamp01(needs.thirst + (dt / FILL_SECONDS.thirst) * (0.6 + 0.8 * p.appetite));
    needs.energy = clamp01(needs.energy + dt / FILL_SECONDS.energy);
    needs.social = clamp01(needs.social + (dt / FILL_SECONDS.social) * (0.4 + 1.2 * p.sociability));
    needs.joy = clamp01(needs.joy + dt / FILL_SECONDS.joy);
    // Mood drifts back toward how well the needs are met.
    const worst = Math.max(needs.hunger, needs.thirst, needs.energy, needs.social);
    person.mood = clampMood(person.mood + (0.4 - worst - person.mood) * Math.min(1, dt / 60));
    // Starving or parched hurts; being well slowly heals.
    if (needs.hunger >= 1 || needs.thirst >= 1) person.health = clamp01(person.health - dt / 300);
    else if (worst < 0.7) person.health = clamp01(person.health + dt / 600);

    notice(person, world);

    // Danger: running from it beats anything else, and being caught in it hurts.
    const f = fear(person, world);
    if (f.from) {
      const danger = aff(f.from).danger ?? 0;
      if (dist(person.x, person.z, f.from.x, f.from.z) <= f.from.radius + 1.5) {
        person.health = clamp01(person.health - danger * dt * 0.05);
        feel(person, f.from, -0.05 * dt);
      }
    }
    const scared = f.level > 0.25 + 0.3 * p.boldness;
    if (scared && f.from && person.intent?.kind !== "flee") {
      // Away from the danger, far enough to be out of its reach.
      const away = Math.atan2(person.z - f.from.z, person.x - f.from.x);
      const run = dangerReach(f.from) + 8;
      person.intent = { kind: "flee", targetId: f.from.id, x: person.x + Math.cos(away) * run, z: person.z + Math.sin(away) * run, speed: RUN, remaining: 0, arrived: false };
      feel(person, f.from, -0.2);
      person.mood = clampMood(person.mood - 0.3);
      person.say = "Something is wrong. I'm leaving.";
    }

    // A need that has become critical interrupts whatever they were doing unless it is that need's own remedy, and a goal that
    // cannot be reached in a couple of minutes is dropped.
    const current = person.intent;
    if (current && current.kind !== "flee") {
      const worstNeed = Math.max(needs.hunger, needs.thirst);
      const remedy = current.kind === "eat" || current.kind === "drink";
      if ((worstNeed > 0.9 && !remedy) || (!current.arrived && (current.age = (current.age ?? 0) + dt) > 120)) person.intent = undefined;
    }

    if (!person.intent) {
      const picked = choose(person, options(person, world));
      person.intent = { ...picked.intent, arrived: false };
    }
    const intent = person.intent;
    if (!intent) continue;
    // Following another person: walk toward where they are now.
    if (intent.kind === "talk") {
      const other = personById(world, intent.targetId);
      if (other) {
        intent.x = other.x;
        intent.z = other.z;
      }
    }

    if (!intent.arrived) {
      const d = dist(person.x, person.z, intent.x, intent.z);
      const stop = intent.kind === "talk" ? REACH : intent.kind === "flee" || intent.kind === "wander" ? 0.4 : (thingById(world, intent.targetId)?.radius ?? 1) * 0.8;
      if (d <= stop + 0.05) {
        intent.arrived = true;
      } else {
        const stepLen = Math.min(d - stop, intent.speed * dt);
        person.x += ((intent.x - person.x) / d) * stepLen;
        person.z += ((intent.z - person.z) / d) * stepLen;
        continue;
      }
    }
    // There: spend the time, then take the result.
    intent.remaining -= dt;
    if (intent.remaining <= 0) finish(person, world, intent);
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
      return "drink_from_river";
    case "rest":
      return "rest";
    case "talk":
      return "talk_to_other";
    case "play":
      return "play_together";
    default:
      return "observe";
  }
}
