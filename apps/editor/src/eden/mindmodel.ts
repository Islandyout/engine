// A person's picture of themselves and of other minds, and what comes of it.
//
//  SELF: how well they think of themselves (esteem, moved by what they achieve and fail at and by how others take them), how they see
//  themselves (bold, kind, capable, honest, liked) against who they mean to be, a store of willpower that is spent on holding back and
//  comes back with rest, and what they have learned from experience (what tends to go well or badly, in which setting).
//  OTHER MINDS: who knows what. A fact is made when something happens; those present learn it first-hand, others only by being told.
//  Each person keeps a model of what the others know, so they can act on what someone else believes (which may be false).
//  WHAT FOLLOWS: telling, gossip, accusing, confessing, denying, lying (which works or not by what the listener saw), bluffing, flattery,
//  persuading by what the other wants, keeping and leaking secrets, minding reputation, surprise gifts, being fooled.
//  CONFLICT: two strong motives at once are felt as being torn (duty and desire, fear and pride), shown as hesitation, settled by
//  willpower, and wrongdoing leaves guilt that is then explained away (rationalised); condemning others and then doing the same is
//  hypocrisy; the same act is judged one way in a friend or kin and another in a foe, with a reason.
// Nothing here claims anyone feels anything. It is the machinery by which behaviour comes from reasons.
import { DAY } from "./earth";
import { feel } from "./inner";
import { skillOf, valueOf, SKILLS } from "./identity";
import { ADULT_AGE, chronicle, isNight, note, rand, relation, tally, type Intent, type IntentKind, type Person, type World } from "./mind";
import { milestone, psycheEvent, psycheOf } from "./psyche";

type Option = { intent: Omit<Intent, "arrived">; score: number; reason?: string };

export interface Lesson {
  key: string;
  text: string;
  sign: 1 | -1;
  strength: number;
  n: number;
}
export interface Self {
  esteem: number; // 0..1 how well they think of themselves
  image: { bold: number; kind: number; capable: number; honest: number; liked: number }; // how they see themselves
  control: number; // willpower, 0..1
  experience: Record<string, { n: number; mean: number }>; // how things have gone, by what was done and where
  lessons: Lesson[];
  condemned: string[]; // what they have blamed others for
  wins: number;
  losses: number;
  lies: number;
  lastReflect: number;
}
export interface Fact {
  id: string;
  kind: "theft" | "gift" | "quarrel" | "kill" | "find" | "deed" | "secret";
  by: string; // who did it
  to?: string; // who it was done to
  t: number;
  text: string;
  secret?: boolean; // the doer meant it hidden
}
export interface Model {
  knows: string[]; // what they think this person knows
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const dist = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);

export function selfOf(p: Person): Self {
  if (p.self) return p.self;
  const t = p.personality;
  p.self = {
    esteem: 0.5 + 0.15 * (t.boldness - 0.5),
    image: { bold: t.boldness, kind: 0.5, capable: 0.5, honest: 0.5 + 0.4 * (valueOf(p, "fairness") - 0.5), liked: 0.5 },
    control: 0.7,
    experience: {},
    lessons: [],
    condemned: [],
    wins: 0,
    losses: 0,
    lies: 0,
    lastReflect: 0,
  };
  return p.self;
}
export const honestyOf = (p: Person) => clamp01(0.25 + 0.6 * valueOf(p, "fairness") + 0.2 * (valueOf(p, "tradition") - 0.5) - 0.1 * (selfOf(p).lies > 3 ? 1 : 0));

/** Something went well or badly for them in a way that bears on how they see themselves. */
export function selfEvent(p: Person, delta: number, trait?: keyof Self["image"]) {
  const s = selfOf(p);
  s.esteem = clamp01(s.esteem + delta * (delta < 0 ? 0.8 + 0.4 * (1 - s.esteem) : 0.6 + 0.6 * (1 - s.esteem)));
  if (delta > 0) s.wins++;
  else s.losses++;
  if (trait) s.image[trait] = clamp01(s.image[trait] + delta * 0.5);
}

// ---- Facts and who knows them ----

export function witness(world: World, kind: Fact["kind"], by: Person, to: Person | undefined, text: string, secret = false): Fact {
  const facts = (world.facts ??= []);
  const f: Fact = { id: `fact-${facts.length}`, kind, by: by.id, to: to?.id, t: world.clock ?? 0, text, secret };
  facts.push(f);
  if (facts.length > 400) facts.shift();
  const present = world.people.filter((q) => q === by || q === to || (!secret && q.intent?.kind !== "sleep" && dist(q.x, q.z, by.x, by.z) < 15));
  for (const q of present) (q.firsthand ??= []).includes(f.id) || q.firsthand.push(f.id), (q.knows ??= []).includes(f.id) || q.knows.push(f.id);
  // Each of them knows who else was there to see it.
  for (const q of present) for (const o of present) if (q !== o) modelOf(q, o.id).knows.push(f.id);
  return f;
}
export const modelOf = (p: Person, otherId: string): Model => ((p.model ??= {})[otherId] ??= { knows: [] });
export const knowsFact = (p: Person, id: string) => !!p.knows?.includes(id);
export const sawFact = (p: Person, id: string) => !!p.firsthand?.includes(id);
/** What they think the other person knows. */
export const thinksKnows = (p: Person, otherId: string, factId: string) => !!p.model?.[otherId]?.knows.includes(factId);

/** Telling someone: they now know it, second-hand, and the teller knows they know. */
export function tell(world: World, from: Person, to: Person, f: Fact) {
  if (!knowsFact(to, f.id)) (to.knows ??= []).push(f.id);
  modelOf(from, to.id).knows.push(f.id);
  modelOf(to, from.id).knows.push(f.id);
  void world;
}
const factsAbout = (world: World, id: string) => (world.facts ?? []).filter((f) => f.by === id);

// ---- Stepping ----

export function mindStep(person: Person, world: World, dt: number) {
  if (person.age < ADULT_AGE - 0.5) return;
  const s = selfOf(person);
  const ps = psycheOf(person);
  const now = world.clock ?? 0;
  // Esteem drifts toward how the others regard them and how capable they are.
  let standing = 0;
  let n = 0;
  for (const q of world.people) {
    const r = q.relations.get(person.id);
    if (q !== person && r) (standing += r.trust), n++;
  }
  const capable = SKILLS.reduce((a, k) => a + skillOf(person, k), 0) / SKILLS.length;
  const target = 0.15 + 0.4 * (n ? standing / n : 0.5) + 0.8 * capable + 0.1 * (s.wins > s.losses ? 1 : 0);
  s.esteem += (clamp01(target) - s.esteem) * (1 - Math.pow(0.5, dt / (3 * DAY)));
  s.image.capable += (clamp01(0.2 + 1.5 * capable) - s.image.capable) * (1 - Math.pow(0.5, dt / (3 * DAY)));
  s.image.liked += (clamp01(n ? standing / n : 0.5) - s.image.liked) * (1 - Math.pow(0.5, dt / (2 * DAY)));
  // Willpower comes back with rest and food, and drains when stressed.
  const regen = person.intent?.kind === "sleep" || person.intent?.kind === "rest" ? 2 : 1;
  s.control = clamp01(s.control + (dt / (0.6 * DAY)) * regen * (person.needs.hunger < 0.6 ? 1 : 0.3) - dt * 0.00001 * ps.strain);
  // A low opinion of oneself weighs on the body's mood.
  if (s.esteem < 0.25) psycheOf(person).drives.esteem = Math.min(psycheOf(person).drives.esteem, 0.3);
  // Guilt that sits is explained away, to a degree that depends on how they are.
  if ((person.emotions?.guilt ?? 0) > 0.3 && now - (person.lastRationalised ?? -1e9) > 0.3 * DAY && rand(person) < dt / 600) rationalise(person, world);
  // Time to think back over what has gone well and badly.
  if (now - s.lastReflect > 0.6 * DAY) {
    s.lastReflect = now;
    deriveLessons(person, world);
  }
}

// ---- Learning from experience ----

const bucket = (world: World) => {
  const h = ((world.clock ?? 0) % DAY) / 60;
  return h < 6 ? "night" : h < 12 ? "morning" : h < 18 ? "day" : "evening";
};
export const contextKey = (kind: string, world: World) => `${kind}|${bucket(world)}|${["spring", "summer", "autumn", "winter"][world.weather?.season ?? 1]}`;

/** What they felt and had, set down when they begin something, so how it went can be told when it ends. */
export function snapshot(p: Person) {
  return { mood: p.mood, hunger: p.needs.hunger, thirst: p.needs.thirst, health: p.health, cold: p.cold };
}
export type Snap = ReturnType<typeof snapshot>;

/** How it turned out: better or worse than before, in the things they care about. */
export function outcomeOf(p: Person, before: Snap): number {
  return (p.mood - before.mood) * 0.8 - (p.needs.hunger - before.hunger) * 0.4 - (p.needs.thirst - before.thirst) * 0.4 + (p.health - before.health) * 1.5 - (p.cold - before.cold) * 0.5;
}
export function recordOutcome(person: Person, world: World, intent: Intent & { snap?: Snap }) {
  if (!intent.snap || person.age < ADULT_AGE) return;
  const s = selfOf(person);
  const key = contextKey(intent.kind, world);
  const out = outcomeOf(person, intent.snap);
  const e = (s.experience[key] ??= { n: 0, mean: 0 });
  e.n++;
  e.mean += (out - e.mean) / Math.min(e.n, 12);
  // Bearing on self: a good end to something they took on raises them; a bad one lowers them.
  if (["hunt", "build", "craft", "fish", "plant", "invent", "make", "create"].includes(intent.kind)) selfEvent(person, out > 0.03 ? 0.02 : out < -0.03 ? -0.03 : 0, "capable");
}
/** From what has been tried, what they have come to think. Written from the pattern of their own outcomes, not from a list. */
export function deriveLessons(person: Person, world: World) {
  const s = selfOf(person);
  const have = new Map(s.lessons.map((l) => [l.key, l]));
  for (const [key, e] of Object.entries(s.experience)) {
    if (e.n < 5 || Math.abs(e.mean) < 0.07) {
      const old = have.get(key);
      if (old && Math.abs(e.mean) < 0.04) s.lessons.splice(s.lessons.indexOf(old), 1); // no longer holds
      continue;
    }
    const [kind, when, season] = key.split("|");
    const sign: 1 | -1 = e.mean > 0 ? 1 : -1;
    const strength = Math.min(1, Math.abs(e.mean) * 3);
    const old = have.get(key);
    if (old) {
      old.sign = sign;
      old.strength = strength;
      old.n = e.n;
      continue;
    }
    const text = sign > 0 ? `When I ${kind} in the ${when} in ${season}, it tends to go well for me.` : `When I ${kind} in the ${when} in ${season}, it tends to go badly for me.`;
    s.lessons.push({ key, text, sign, strength, n: e.n });
    note(person, world, `I have noticed: ${text}`);
    tally(world, "lessonsDerived");
  }
  if (s.lessons.length > 20) s.lessons.sort((a, b) => b.strength - a.strength).length = 20;
}
/** Experience tilts what they will do again in the same setting. */
export function lessonBias(person: Person, world: World, kind: string): number {
  const l = person.self?.lessons.find((x) => x.key === contextKey(kind, world));
  return l ? 0.25 * l.sign * l.strength : 0;
}

// ---- Conflict ----

type Motive = "duty" | "desire" | "fear" | "pride" | "need" | "loyalty";
const MOTIVE: Partial<Record<IntentKind, Motive>> = {
  share: "duty", comfort: "duty", teach: "duty", fire: "duty", stash: "duty", fetch: "duty", mourn: "loyalty", gift: "loyalty", carve: "loyalty",
  rest: "desire", play: "desire", look: "desire", wander: "desire", create: "desire", linger: "desire", talk: "desire", read: "desire", pray: "desire",
  flee: "fear", warm: "fear", sleep: "need", eat: "need", drink: "need", forage: "need", fish: "need", steal: "need",
  hunt: "pride", build: "pride", invent: "pride", craft: "pride", improve: "pride", make: "pride",
};
const motiveWord: Record<Motive, string> = { duty: "what I ought to do", desire: "what I wanted", fear: "my fear", pride: "my pride", need: "what I needed", loyalty: "those I love" };
const NEEDY = new Set(["eat", "drink", "flee", "sleep"]);

/** Two strong pulls at once are felt, shown as hesitation, and settled by willpower; the one given up on is remembered. */
export function resolveConflict(person: Person, world: World, opts: Option[]): void {
  if (person.age < ADULT_AGE || opts.length < 2) return;
  const now = world.clock ?? 0;
  const s = selfOf(person);
  const ps = psycheOf(person);
  // Already hesitating: wait it out.
  if (person.dither && now < person.dither.until) {
    opts.length = 0;
    opts.push({ intent: { kind: "linger", x: person.x, z: person.z, speed: 0, remaining: Math.max(1, person.dither.until - now) }, score: 9, reason: "torn" });
    return;
  }
  const ranked = [...opts].sort((a, b) => b.score - a.score);
  const [first, second] = ranked;
  if (!first || !second) return;
  if (NEEDY.has(first.intent.kind) && first.score > 1.2) return; // survival does not hesitate
  const m1 = MOTIVE[first.intent.kind];
  const m2 = MOTIVE[second.intent.kind];
  // A person low and hopeless does the lesser thing sometimes, against their own interest.
  if (ps.state === "depressed" && s.esteem < 0.3 && rand(person) < 0.12 && !NEEDY.has(first.intent.kind)) {
    const idle = opts.find((o) => o.intent.kind === "rest" || o.intent.kind === "linger");
    if (idle && idle !== first) {
      idle.score = first.score + 0.05;
      idle.reason = "sabotage";
      note(person, world, "There was something I could have done, and I did not even try.");
      tally(world, "selfSabotage");
      return;
    }
  }
  if (!m1 || !m2 || m1 === m2 || first.score - second.score > 0.12 || second.score < 0.45) {
    first.reason ??= undefined;
    return;
  }
  // Torn. First they hesitate.
  if (!person.dither) {
    person.dither = { until: now + 3 + 4 * rand(person), a: first.intent.kind, b: second.intent.kind };
    feel(person, "surprise", 0.05);
    ps.chem.cortisol = clamp01(ps.chem.cortisol + 0.05);
    note(person, world, `Torn between ${motiveWord[m1]} and ${motiveWord[m2]}.`);
    tally(world, "tornBetween");
    opts.length = 0;
    opts.push({ intent: { kind: "linger", x: person.x, z: person.z, speed: 0, remaining: person.dither.until - now }, score: 9, reason: "torn" });
    return;
  }
  // Then they settle it. Duty against desire is a test of will; fear against pride, of nerve.
  const dutyish = (m: Motive | undefined) => m === "duty" || m === "loyalty";
  let pick = first;
  let other = second;
  if (dutyish(m1) !== dutyish(m2)) {
    const duty = dutyish(m1) ? first : second;
    const wish = dutyish(m1) ? second : first;
    const holds = rand(person) < s.control * (0.5 + 0.5 * valueOf(person, "kin"));
    pick = holds ? duty : wish;
    other = holds ? wish : duty;
    if (holds) s.control = clamp01(s.control - 0.15);
    else {
      psycheEvent(person, "wrong", 0.4); // gave in to what they ought not
      tally(world, "temptationsYielded");
    }
  } else if (m1 === "fear" || m2 === "fear") {
    const brave = rand(person) < person.personality.boldness;
    const fearOpt = m1 === "fear" ? first : second;
    const proud = m1 === "fear" ? second : first;
    pick = brave ? proud : fearOpt;
    other = brave ? fearOpt : proud;
  }
  const reason = `${motiveWord[MOTIVE[pick.intent.kind]!]}, over ${motiveWord[MOTIVE[other.intent.kind]!]}`;
  pick.score = Math.max(...opts.map((o) => o.score)) + 0.1;
  pick.reason = reason;
  person.dither = undefined;
  note(person, world, `I chose ${pick.intent.kind} (${reason}).`);
  if (pick !== first) tally(world, "againstTheGrain");
}

/** Guilt gets explained away: how much depends on how hard they hold themselves to account. */
export function rationalise(person: Person, world: World) {
  const g = person.emotions?.guilt ?? 0;
  if (g < 0.2) return;
  person.lastRationalised = world.clock ?? 0;
  const conscience = valueOf(person, "fairness");
  const relief = (0.6 - 0.5 * conscience) * g;
  feel(person, "guilt", -relief);
  const s = selfOf(person);
  const excuses = ["Anyone would have done the same.", "They would have done it to me.", "It was not so very wrong.", "I had no choice, and that is the end of it."];
  note(person, world, `I told myself: ${excuses[Math.floor(rand(person) * excuses.length)]}`);
  // Excuses raise esteem back and cost honesty with oneself.
  s.esteem = clamp01(s.esteem + 0.04);
  tally(world, "rationalised");
}

// ---- Judging, and the standards held ----

/** How hard to judge a deed, and the reason given. The same act is lighter in kin and friends and heavier in foes and strangers. */
export function judge(world: World, judgeP: Person, actor: Person, kind: string): { weight: number; reason: string } {
  if (judgeP.id === actor.id) return { weight: 0.4, reason: "I had my reasons" };
  const r = judgeP.relations.get(actor.id);
  const aff = r?.affinity ?? 0;
  const kin = actor.mother === judgeP.id || actor.father === judgeP.id || judgeP.mother === actor.id || judgeP.father === actor.id || (actor.mother && actor.mother === judgeP.mother);
  if (kin) return { weight: 0.45, reason: `${actor.name} is family` };
  if (aff > 0.6) return { weight: 0.6, reason: `${actor.name} is my friend and must have had a reason` };
  if (aff < -0.3) return { weight: 1.4, reason: `it is just like ${actor.name}` };
  if ((r?.familiarity ?? 0) < 0.2) return { weight: 1.2, reason: `I do not know ${actor.name}, and ${kind} is ${kind === "theft" ? "stealing" : "wrong"}` };
  return { weight: 1, reason: `${kind} is ${kind === "theft" ? "stealing" : "wrong"}` };
}
/** Blaming someone for a thing, and being held to it: the one who has condemned a deed and then does it feels it. */
export function condemn(person: Person, kind: string) {
  const c = selfOf(person).condemned;
  if (!c.includes(kind)) c.push(kind);
}
export function hypocrisy(person: Person, world: World, kind: string): boolean {
  if (!selfOf(person).condemned.includes(kind)) return false;
  note(person, world, `I blamed others for ${kind}, and now I have done it myself.`);
  feel(person, "shame", 0.4);
  psycheEvent(person, "wrong", 0.7);
  selfEvent(person, -0.05, "honest");
  tally(world, "hypocrisy");
  return true;
}

// ---- Talking: telling, accusing, lying, bluffing, flattery, secrets, persuasion ----

/** Called when two people finish a talk. */
export function talkAbout(world: World, a: Person, b: Person) {
  if (a.age < ADULT_AGE || b.age < ADULT_AGE) return;
  // Each may have something they are known to have done, and the other may know it.
  for (const [accuser, accused] of [[a, b], [b, a]] as const) {
    for (const f of (world.facts ?? []).filter((x) => x.by === accused.id && x.kind === "theft" && knowsFact(accuser, x.id))) {
      if (accused.accusedBy?.includes(`${accuser.id}:${f.id}`)) continue;
      (accused.accusedBy ??= []).push(`${accuser.id}:${f.id}`);
      accuse(world, accuser, accused, f);
      break;
    }
  }
  // What they know of the doings of others passes between them, more where they trust.
  for (const [from, to] of [[a, b], [b, a]] as const) {
    const trust = relation(to, from.id, world).trust;
    for (const id of from.knows ?? []) {
      if (knowsFact(to, id) || rand(from) > 0.3 * (0.5 + trust)) continue;
      const f = (world.facts ?? []).find((x) => x.id === id);
      if (!f || f.by === to.id) continue;
      // A secret is kept from all but those who are trusted; and some leak even then.
      if (f.secret && f.by === from.id) {
        if (trust < 0.7) continue;
        tell(world, from, to, f);
        note(from, world, `I told ${to.name} what I have told no one.`);
        tally(world, "secretsShared");
        continue;
      }
      if (f.secret && f.by !== from.id) {
        // They were trusted with it and pass it on.
        if (rand(from) < 0.5 * (1 - valueOf(from, "tradition"))) {
          const keeper = world.people.find((q) => q.id === f.by);
          if (keeper) {
            const r = relation(keeper, from.id, world);
            r.trust = Math.max(0, r.trust - 0.3);
            note(keeper, world, `${from.name} told ${to.name} what I trusted them to keep.`);
            tally(world, "secretsLeaked");
          }
        } else continue;
      }
      tell(world, from, to, f);
      tally(world, "factsShared");
    }
  }
  flatterOrPersuade(world, a, b);
  flatterOrPersuade(world, b, a);
}

/** Someone who needs what the other has says what pleases, or puts it in terms of what the other wants. */
function flatterOrPersuade(world: World, wanter: Person, giver: Person) {
  if (wanter.needs.hunger < 0.55 || giver.carry.food < 2 || wanter.carry.food >= 1) return;
  const honest = honestyOf(wanter);
  const r = relation(giver, wanter.id, world);
  const s = selfOf(wanter);
  const ps = psycheOf(giver);
  const lacking = (["belonging", "esteem", "meaning"] as const).filter((d) => ps.drives[d] < 0.45);
  if (rand(wanter) < 0.5) return;
  if (lacking.length && honest > 0.5) {
    // Putting it in terms of what they want: no lie in it.
    const what = lacking[0]!;
    wanter.say = what === "belonging" ? `Share a meal with me, ${giver.name}, and we will not be alone.` : what === "esteem" ? `You are the one who always has enough, ${giver.name}. Help me and all will see it.` : `It would mean something, ${giver.name}, to feed one who is hungry.`;
    giver.favourFor = { to: wanter.id, until: (world.clock ?? 0) + 90 };
    tally(world, "persuasions");
  } else if (honest <= 0.5) {
    // Flattery to get it, said without meaning it.
    wanter.say = `Nobody is as generous as you, ${giver.name}.`;
    r.affinity = Math.min(1, r.affinity + 0.03);
    giver.favourFor = { to: wanter.id, until: (world.clock ?? 0) + 90 };
    s.lies++;
    tally(world, "flattery");
    // The one flattered may see through it if they know the other wants something and do not trust them.
    if (r.trust < 0.4 && rand(giver) < 0.5) {
      r.trust = Math.max(0, r.trust - 0.05);
      giver.favourFor = undefined;
      note(giver, world, `${wanter.name} praised me, and I could see what they wanted.`);
      tally(world, "flatterySeenThrough");
    }
  }
}

/** Telling someone to their face what they are known to have done. What the accused does turns on their conscience, their nerve, and what the other saw. */
export function accuse(world: World, accuser: Person, accused: Person, f: Fact) {
  const j = judge(world, accuser, accused, "theft");
  const sawIt = sawFact(accuser, f.id);
  const honest = honestyOf(accused);
  const guilt = accused.emotions?.guilt ?? 0;
  const rAcc = relation(accuser, accused.id, world);
  const rAcd = relation(accused, accuser.id, world);
  note(accuser, world, `I told ${accused.name} I knew they had taken food. (${j.reason}.)`);
  condemn(accuser, "theft");
  // They own up.
  if (honest + 0.5 * guilt > 0.85 || (sawIt && honest > 0.5)) {
    note(accused, world, `${accuser.name} knew what I had done, and I said so.`);
    accused.say = "It was me. I was starving. I am sorry.";
    feel(accused, "guilt", -0.2);
    feel(accused, "relief", 0.3);
    rAcc.trust = Math.min(1, rAcc.trust + 0.15 * (1 - j.weight * 0.3)); // honesty is partly forgiven
    selfEvent(accused, -0.02, "honest");
    tally(world, "confessions");
    return;
  }
  // They deny. If the accuser saw it themselves the lie fails; if only heard of it, it may work.
  accused.say = "I did not touch it. Who says so?";
  selfOf(accused).lies++;
  selfEvent(accused, -0.03, "honest");
  if (sawIt) {
    rAcc.trust = Math.max(0, rAcc.trust - 0.25);
    rAcc.affinity = Math.max(-1, rAcc.affinity - 0.15);
    feel(accused, "shame", 0.3);
    note(accuser, world, `${accused.name} lied to my face, and I saw it myself.`);
    tally(world, "liesDetected");
  } else {
    const believed = rand(accuser) < rAcd.affinity * 0 + rAcc.trust * (0.5 + 0.5 * (selfOf(accused).image.honest));
    if (believed) {
      // They are fooled: they let it drop, and doubt whoever told them.
      accuser.knows = (accuser.knows ?? []).filter((id) => id !== f.id);
      note(accuser, world, `${accused.name} said they had not done it, and I believed them.`);
      feel(accused, "relief", 0.3);
      tally(world, "foolings");
    } else {
      rAcc.trust = Math.max(0, rAcc.trust - 0.12);
      note(accuser, world, `${accused.name} denied it, and I do not believe them.`);
      tally(world, "liesDisbelieved");
    }
  }
  feel(accused, "guilt", 0.2);
  tally(world, "denials");
  // A bluff to end it: a weak person claims strength.
  if (accused.personality.boldness > 0.6 && accuser.personality.boldness < 0.5) {
    const strengthOf = (p: Person) => 0.4 + 0.6 * (SKILLS.reduce((a, k) => a + skillOf(p, k), 0) / SKILLS.length);
    if (strengthOf(accused) < strengthOf(accuser) && rand(accused) < 0.4) {
      accused.say = "Say that again and see what happens.";
      tally(world, "bluffs");
      if (rand(accuser) < 0.6 * (1 - accuser.personality.boldness)) {
        rAcc.affinity = Math.max(-1, rAcc.affinity - 0.05);
        accuser.say = "...Never mind.";
        tally(world, "bluffsWorked");
      }
    }
  }
  chronicleOnce(world, accused);
}
function chronicleOnce(world: World, accused: Person) {
  if ((world.tally?.denials ?? 0) === 1) chronicle(world, `${accused.name} was accused of taking food, and denied it.`);
}

/** After stealing: who was there to see decides whether it is known, and the thief may have waited for no one to be near. */
export function aftermathOfTheft(world: World, thief: Person, victim: Person) {
  const f = witness(world, "theft", thief, victim, `${thief.name} took food from ${victim.name}`);
  const seen = world.people.filter((q) => q !== thief && q !== victim && sawFact(q, f.id)).length;
  if (seen) note(thief, world, `${seen === 1 ? "Someone" : "Some of them"} saw me.`);
  else note(thief, world, "No one saw me. Only they know.");
  hypocrisy(thief, world, "theft");
  selfEvent(thief, -0.06, "honest");
  psycheEvent(thief, "wrong", 1);
  return f;
}
/** How much a witness would cost whoever is thinking of doing wrong: the careful about their name wait until no one is near. */
export function witnessCost(world: World, person: Person): number {
  const near = world.people.filter((q) => q !== person && q.age >= ADULT_AGE && q.intent?.kind !== "sleep" && dist(q.x, q.z, person.x, person.z) < 15).length;
  const concern = 0.3 + 0.7 * (1 - honestyOf(person) < 0.5 ? 1 : 0.5);
  return near * 0.6 * concern * (selfOf(person).image.liked > 0.4 ? 1 : 0.5);
}
export const factsBy = factsAbout;

/** A gift nobody knew was coming is worth more. */
export function surpriseGift(world: World, giver: Person, receiver: Person): boolean {
  const known = (receiver.model?.[giver.id]?.knows ?? []).some((id) => id === `keepsake:${receiver.id}`) || (receiver.knows ?? []).includes(`keepsake:${giver.id}`);
  if (known) return false;
  feel(receiver, "surprise", 0.5);
  feel(receiver, "joy", 0.4);
  feel(receiver, "gratitude", 0.3);
  psycheEvent(receiver, "beauty", 0.4);
  tally(world, "surpriseGifts");
  return true;
}

/** Whether someone will be fooled: whether they could know otherwise. */
export function couldKnow(listener: Person, factId: string): boolean {
  return sawFact(listener, factId);
}

export function worstOf(person: Person) {
  void milestone;
  void isNight;
  return selfOf(person).esteem;
}
