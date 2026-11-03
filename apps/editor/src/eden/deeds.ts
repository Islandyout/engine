// What a person does about who they are, who they love, what they believe about others, and how a life ends: the pieces of the mind that
// were only tallies or only functions until they were wired into choosing (F151).
//
//  COSTLY FRIENDSHIP: a friend in need is given the last of one's own food, or a night's rest, and the giver bears it.
//  MUSIC AND DANCE: acts (sing, dance) that people take up in the evening among others, most on a festival evening.
//  DEATH AND BURIAL: a grave is sat by and the dead laid to rest with a reason (what is held to be true about death, or love).
//  THE SELF: an ideal ("who I want to be") measured against the image they have of themselves; a sense of being treated unfairly.
//  FALSE BELIEF: a hidden store is moved out of sight; the one who did not see it go walks to where it was. Hiding exploits that.
//  JUDGED CHOICES: who is helped and who is not, by judge() and the stated reason; kin, friends, foes and strangers differ.
//  BIASES: a friend's faults are not counted, a foe's are; one's own people are helped before strangers.
//  HABIT: what is done often enough, for the reward, becomes a craving, and its absence is felt.
//  LIFE STAGES: ambition and a roof of one's own, standing and its loss, retirement, and the counsel of the wise.
// Chances come from a hash of who, when and what, not from a person's own random stream. Every option here yields to thirst and hunger.
// Nothing here claims anyone feels anything. It is the machinery by which behaviour comes from reasons.
import { DAY, hourOf } from "./earth";
import { feel } from "./inner";
import { roleOf, skillOf, valueOf, SKILLS } from "./identity";
import { heartOf, joyFrom } from "./heart";
import { AGES, frailty, lifeOf, partnerOf } from "./lifecycle";
import { ADULT_AGE, AFFORDANCES, chronicle, make, note, personById, relation, tally, thingById, type Intent, type Person, type Thing, type World } from "./mind";
import { judge, knowsFact, modelOf, selfEvent, selfOf, witness, type Fact, type Self } from "./mindmodel";
import { milestone, psycheOf, want } from "./psyche";
import { festivalOn, groupId } from "./society";

type Option = { intent: Omit<Intent, "arrived">; score: number; reason?: string };
type Trait = keyof Self["image"];

export interface Deeds {
  ideal?: Record<Trait, number>; // who they mean to be
  gap: number; // how far the picture of themselves falls short of it
  lack?: Trait; // the trait most missing
  gapAt?: number;
  owed: number; // 0..1, the sense of having given more than has come back
  owedAt?: number;
  costly: Record<string, number>; // times they gave up their own food or rest for each friend
  forgave: Record<string, string>; // who they overlooked a wrong in, and why
  withheld: Record<string, string>; // who they would not help, and why
  addiction?: { kind: string; since: number; lastDone: number; withdrawing?: boolean };
  status: number;
  peak: number;
  statusLost?: boolean;
  retired?: boolean;
  counselledAt?: number;
  counselled: number;
  songs: number;
  dances: number;
  diedFor?: { purpose: string; forId: string };
  ambitionNoted?: boolean;
}
export const deedsOf = (p: Person): Deeds => (p.deeds ??= { gap: 0, owed: 0, costly: {}, forgave: {}, withheld: {}, status: 0.5, peak: 0, counselled: 0, songs: 0, dances: 0 });

/** What the page shows for the acts added here (edenAgents.ts reads this). */
export const DEED_VERB: Record<string, string> = { sing: "joins the singing", dance: "dances with the others", hide: "moves what they have put by out of sight" };

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const dist = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);
/** A number in 0..1 from who, when and what; the same for the same five-second stretch. */
export function deedChance(person: Person, world: World, salt: string, bucket = 5): number {
  let h = 2166136261;
  const s = `${person.id}|${Math.floor((world.clock ?? 0) / bucket)}|${salt}`;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}
const yieldTo = (person: Person) => clamp01(1 - (Math.max(person.needs.hunger, person.needs.thirst) - 0.25) * 2.2);
const awake = (q: Person) => !(q.intent?.kind === "sleep" && q.intent.arrived);

// ---- The self: an ideal to measure up to, and fairness about oneself ----

const TRAIT_WORD: Record<Trait, string> = { bold: "brave", kind: "kind", capable: "capable", honest: "honest", liked: "someone others turn to" };
/** Who they mean to be, from what they hold dear and how they are made. */
export function idealOf(p: Person): Record<Trait, number> {
  const d = deedsOf(p);
  return (d.ideal ??= {
    bold: clamp01(0.3 + 0.5 * p.personality.boldness),
    kind: clamp01(0.35 + 0.5 * valueOf(p, "kin")),
    capable: clamp01(0.55 + 0.3 * p.personality.curiosity),
    honest: clamp01(0.35 + 0.55 * valueOf(p, "fairness")),
    liked: clamp01(0.3 + 0.5 * p.personality.sociability),
  });
}
/** The distance between who they think they are and who they want to be, and the trait that falls shortest. */
export function selfGap(p: Person): { gap: number; lack?: Trait } {
  const ideal = idealOf(p);
  const image = selfOf(p).image;
  let sum = 0;
  let worst = 0;
  let lack: Trait | undefined;
  for (const t of Object.keys(ideal) as Trait[]) {
    const g = Math.max(0, ideal[t] - image[t]);
    sum += g;
    if (g > worst) (worst = g), (lack = t);
  }
  return { gap: sum / 5, lack: worst > 0.1 ? lack : undefined };
}
const SERVES: Record<Trait, string[]> = {
  kind: ["share", "comfort", "gift", "teach"],
  capable: ["craft", "build", "make", "improve", "plant", "invent", "create", "hunt", "fish"],
  liked: ["talk", "play", "trade", "sing", "dance"],
  bold: ["hunt", "tame"],
  honest: [],
};

/** What they have given, against what has come to them. */
export function giving(world: World, p: Person): { given: number; got: number } {
  let given = 0;
  let got = 0;
  for (const q of world.people) {
    if (q === p) continue;
    given += q.relations.get(p.id)?.gifts ?? 0;
    got += p.relations.get(q.id)?.gifts ?? 0;
  }
  return { given, got };
}

// ---- Standing, retirement, wisdom ----

/** How the others hold them: the trust they are given, how well they think of themselves, what they are good at. */
export function statusOf(world: World, p: Person): number {
  let trust = 0;
  let n = 0;
  for (const q of world.people) {
    const r = q.relations.get(p.id);
    if (q !== p && r) (trust += r.trust), n++;
  }
  const role = roleOf(p);
  const best = role ? skillOf(p, role.skill) : 0;
  return clamp01(0.45 * (n ? trust / n : 0.5) + 0.25 * selfOf(p).esteem + 0.3 * best * 1.4 + (p.age >= AGES.elder - 4 ? 0.05 : 0));
}
/** What years and what has been learned have made of judgement; failing memory takes it back. */
export function wisdomOf(p: Person): number {
  const lessons = p.self?.lessons.length ?? 0;
  const seen = Object.keys(p.self?.experience ?? {}).length;
  const w = 0.4 * clamp01((p.age - ADULT_AGE) / (AGES.elder - ADULT_AGE)) + 0.3 * clamp01(lessons / 6) + 0.2 * clamp01(seen / 25) + 0.1 * clamp01((p.life?.peerDeaths ?? 0) / 4);
  return clamp01(w * (1 - (p.life?.dementia ?? 0)));
}
export const ambitionOf = (p: Person) => clamp01(0.3 * p.personality.boldness + 0.35 * want(p, "esteem") + 0.25 * Math.max(...SKILLS.map((k) => skillOf(p, k))) + 0.15 * (1 - valueOf(p, "comfort")));

// ---- Stepping ----

const ADDICTIVE = new Set(["play", "create", "look"]);
export function deedStep(person: Person, world: World, dt: number) {
  if (person.age < ADULT_AGE) return;
  const now = world.clock ?? 0;
  if (Math.floor(now / 30) === Math.floor((now - dt) / 30)) return;
  const d = deedsOf(person);
  const l = lifeOf(person);
  const ps = psycheOf(person);
  // Measuring up to who they want to be.
  const { gap, lack } = selfGap(person);
  d.gap = gap;
  d.lack = lack;
  if (lack && now - (d.gapAt ?? -1e9) > DAY) {
    d.gapAt = now;
    note(person, world, `I am not who I want to be. I want to be ${TRAIT_WORD[lack]}, and I am not yet.`);
    feel(person, "shame", 0.1 + 2 * gap);
    tally(world, "idealGaps");
  }
  // Giving more than comes back, and knowing it is not fair.
  const { given, got } = giving(world, person);
  const target = clamp01((given - got - 3) / 8) * (0.4 + 0.6 * valueOf(person, "fairness"));
  d.owed += (target - d.owed) * (1 - Math.pow(0.5, 30 / (0.05 * DAY)));
  if (d.owed > 0.3 && now - (d.owedAt ?? -1e9) > 2 * DAY) {
    d.owedAt = now;
    feel(person, "anger", 0.25);
    note(person, world, "I have given and given, and little comes back to me. It is not fair to me.");
    tally(world, "selfFairness");
  }
  // Envy of what others have and they lack; contempt for those known to have wronged.
  for (const q of world.people) {
    if (q === person || dist(q.x, q.z, person.x, person.z) > 25) continue;
    const aff = person.relations.get(q.id)?.affinity ?? 0;
    if (q.carry.food >= 3 && person.needs.hunger > 0.5 && person.carry.food < 1 && aff < 0.7) feel(person, "envy", 0.12);
    else if (q.age >= ADULT_AGE && ps.drives.esteem < 0.4 && statusOf(world, q) > statusOf(world, person) + 0.2 && aff < 0.6) feel(person, "envy", 0.06);
    if ((q.thefts ?? 0) > 0 && (world.facts ?? []).some((f) => f.kind === "theft" && f.by === q.id && knowsFact(person, f.id))) feel(person, "contempt", 0.08);
  }
  // A habit done for the reward, over and over, becomes a craving; stopping is felt.
  if (!d.addiction) {
    for (const [key, h] of Object.entries(ps.habits)) {
      const kind = key.split("@")[0]!;
      if (h.n >= 40 && ADDICTIVE.has(kind) && ps.sens.dopamine < 0.85) {
        d.addiction = { kind, since: now, lastDone: h.last };
        note(person, world, `I cannot seem to do without ${kind === "play" ? "my games" : kind === "look" ? "watching" : "making things"} any more.`);
        milestone(person, world, "addiction", `could not stop ${kind === "play" ? "playing" : kind === "look" ? "watching" : "making"}`);
        tally(world, "addictions");
        break;
      }
    }
  } else {
    const a = d.addiction;
    a.lastDone = Math.max(a.lastDone, ...Object.entries(ps.habits).filter(([k]) => k.startsWith(`${a.kind}@`)).map(([, h]) => h.last));
    if (now - a.lastDone > 0.5 * DAY) {
      if (!a.withdrawing) {
        a.withdrawing = true;
        note(person, world, `I ache for ${a.kind === "play" ? "my games" : a.kind === "look" ? "watching" : "making things"}. I have gone too long without.`);
        tally(world, "withdrawals");
      }
      feel(person, "longing", 0.05);
      ps.chem.cortisol = clamp01(ps.chem.cortisol + 0.01);
      person.mood = Math.max(-1, person.mood - 0.01);
      if (now - a.lastDone > 3 * DAY && selfOf(person).control > 0.6) {
        d.addiction = undefined;
        note(person, world, "I have broken the habit. It was hard.");
        tally(world, "addictionsBroken");
      }
    } else a.withdrawing = false;
  }
  // Standing: a peak in the middle years, and its loss.
  const status = statusOf(world, person);
  d.status += (status - d.status) * 0.2;
  if (person.age >= AGES.middle) {
    if (d.status > d.peak) {
      if (d.peak < 0.55 && d.status >= 0.55) {
        note(person, world, "Others look to me now. I am at the height of my standing.");
        milestone(person, world, "peak", "reached the height of their standing");
        tally(world, "statusPeaks");
      }
      d.peak = d.status;
    }
    if (d.peak >= 0.5 && d.status < d.peak - 0.2 && !d.statusLost) {
      d.statusLost = true;
      note(person, world, "I was looked up to once. I am not any more.");
      milestone(person, world, "statusLoss", "lost the standing they once had");
      feel(person, "shame", 0.3);
      feel(person, "regret", 0.2);
      selfEvent(person, -0.1);
      tally(world, "statusLost");
    } else if (d.statusLost && d.status > d.peak - 0.1) d.statusLost = false;
  }
  // Retirement: when the body fails they put down the heavy work and keep the stories.
  if (!d.retired && frailty(person) >= 0.35) {
    d.retired = true;
    note(person, world, "My hands are slow now. I will leave the heavy work to the young, and keep the stories.");
    milestone(person, world, "retired", "put down the heavy work and became a keeper of stories");
    tally(world, "retired");
  }
  // A roof of one's own, away from the parents' fire.
  if (!l.home && (person.mother || person.father)) {
    const mate = partnerOf(world, person);
    const own = world.things.find((t) => t.kind === "shelter" && !!t.owner && (t.owner === person.id || t.owner === mate?.id));
    const parents = world.people.some((q) => q.id === person.mother || q.id === person.father);
    if (own && parents) {
      l.home = own.id;
      note(person, world, "I have a roof of my own now, and I no longer sleep under my parents'.");
      milestone(person, world, "leftHome", "left their parents' home to make their own");
      tally(world, "leftHome");
    }
  }
}

// ---- Choices ----

/** What the added options are, before they are scaled by hunger and thirst. */
export function deedOptions(person: Person, world: World, out: Option[]) {
  if (person.age < 1) return;
  const start = out.length;
  inner(person, world, out);
  const y = yieldTo(person);
  for (let i = start; i < out.length; i++) out[i]!.score *= y;
}
const misdeedsOf = (world: World, judgeP: Person, actor: Person): Fact[] =>
  (world.facts ?? []).filter((f) => f.by === actor.id && (f.kind === "theft" || f.kind === "kill" || f.kind === "quarrel") && knowsFact(judgeP, f.id));

function inner(person: Person, world: World, out: Option[]) {
  const now = world.clock ?? 0;
  const d = deedsOf(person);
  const near = world.people.filter((q) => q !== person && dist(q.x, q.z, person.x, person.z) < 30);
  const calm = person.needs.hunger < 0.55 && person.needs.thirst < 0.55;

  // Helping the hungry: who is fed is judged by what is known of them and what they are to the giver.
  if (person.carry.food >= 1 && calm) {
    for (const n of near) {
      if (n.needs.hunger < 0.65 || n.carry.food >= 1 || n.age < 1) continue;
      const aff = person.relations.get(n.id)?.affinity ?? 0;
      const friend = aff >= 0.65 && (person.relations.get(n.id)?.trust ?? 0) >= 0.4;
      const bad = misdeedsOf(world, person, n);
      // A friend's faults are not counted; a foe's are counted and one more is assumed.
      const counted = bad.length === 0 ? 0 : aff > 0.5 ? 1 : aff < -0.3 ? bad.length + 1 : bad.length;
      const j = judge(world, person, n, bad.at(-1)?.kind === "theft" ? "theft" : "wrong");
      const blame = counted ? Math.max(0, j.weight - 0.5) * Math.min(3, counted) * 0.55 : 0;
      const alien = groupId(n) !== groupId(person) ? 0.3 : 0; // one's own people first
      let score = 0.95 + 0.3 * Math.max(0, aff) + (friend && person.needs.hunger > 0.3 && person.carry.food < 2 ? 0.5 : 0) - blame - alien;
      let reason = friend && person.needs.hunger > 0.3 && person.carry.food < 2 ? `${n.name} is my friend and is hungry, and I will give what I have though I am hungry too` : `${n.name} is hungry`;
      if (counted && blame < 0.3) reason = `${n.name} did wrong, but ${j.reason}; I will feed them`;
      if (alien) reason += "; they are not of my people";
      if (score <= 0.2) {
        if (!d.withheld[n.id] && counted) {
          d.withheld[n.id] = j.reason;
          note(person, world, `I will not feed ${n.name}: ${j.reason}.`);
          tally(world, "helpWithheld");
        }
        continue;
      }
      if (counted && blame < 0.3 && !d.forgave[n.id]) {
        d.forgave[n.id] = j.reason;
        note(person, world, `${n.name} did wrong, but ${j.reason}. I will help them anyway.`);
        tally(world, "forgiven");
      }
      out.push({ intent: { kind: "share", targetId: n.id, x: n.x, z: n.z, speed: 2.2, remaining: 12 }, score, reason });
    }
  }
  // A friend ill or hurt: sit with them, though tired.
  if (person.needs.hunger < 0.6 && person.needs.thirst < 0.6) {
    for (const n of near) {
      const aff = person.relations.get(n.id)?.affinity ?? 0;
      if (aff < 0.65 || ((n.illness?.severity ?? 0) < 0.3 && (n.wound ?? 0) < 0.3)) continue;
      const tired = person.needs.energy > 0.55;
      out.push({ intent: { kind: "comfort", targetId: n.id, x: n.x, z: n.z, speed: 2.2, remaining: 14 }, score: 1 + 0.4 * aff + (tired ? 0.2 : 0), reason: `${n.name} is my friend and hurt${tired ? ", and I will sit with them though I am tired" : ""}` });
    }
  }
  // Music and dance, in the evening among others; most on a festival evening.
  const h = hourOf(now);
  const evening = h >= 16.5 && h < 21;
  if (evening && calm && !awakeAlone(person, world)) {
    const feast = !!festivalOn(world);
    const crowd = world.people.filter((q) => q !== person && q.age >= 1 && dist(q.x, q.z, person.x, person.z) < 14 && awake(q)).length;
    if (crowd >= 2) {
      const base = feast ? 0.8 : 0.52;
      const here = { x: person.x, z: person.z, speed: 0, remaining: 24 };
      out.push({ intent: { kind: "sing", ...here }, score: base + 0.1 * (person.personality.sociability - 0.5), reason: feast ? "to sing at the feast" : "to sing with the others in the evening" });
      out.push({ intent: { kind: "dance", ...here }, score: base + 0.1 * (person.personality.boldness - 0.5) + 0.12 * (deedChance(person, world, "dance", 60) - 0.5), reason: feast ? "to dance at the feast" : "to dance with the others in the evening" });
    }
  }
  // The dead are laid to rest by those who believe something about death, or who loved them.
  if (person.age >= ADULT_AGE && calm) {
    for (const t of world.things) {
      if (t.kind !== "grave" || !t.of || t.rite || !person.memory.has(t.id) || dist(t.x, t.z, person.x, person.z) > 120) continue;
      const lost = world.dead?.find((x) => x.person.id === t.of)?.person;
      const tenet = tenetText(world, person);
      const bond = person.relations.get(t.of)?.affinity ?? 0;
      if (!tenet && bond < 0.3) continue;
      const why = tenet ? `for I hold that ${tenet.toLowerCase().replace(/\.$/, "")}` : `for I loved ${lost?.name ?? "them"}`;
      out.push({ intent: { kind: "mourn", targetId: t.id, x: t.x, z: t.z, speed: 2, remaining: 40 }, score: 0.7 + (tenet ? 0.3 : 0) + 0.4 * Math.max(0, bond) - dist(t.x, t.z, person.x, person.z) / 200, reason: `to lay ${lost?.name ?? "the dead"} to rest, ${why}` });
    }
  }
  // Hiding what is put by from someone who cannot be trusted with it; the one who did not see it go will look where it was.
  if (person.age >= ADULT_AGE && calm && !isDusk(now)) {
    for (const c of world.things) {
      if (c.kind !== "cache" || c.owner !== person.id || (c.stock ?? 0) <= 0 || c.movedAt === now) continue;
      const rival = world.people.find((q) => q !== person && q.memory.has(c.id) && dist(q.x, q.z, c.x, c.z) > 20 && dist(q.x, q.z, person.x, person.z) < 80 && ((person.relations.get(q.id)?.affinity ?? 0) < -0.25 || ((q.thefts ?? 0) > 0 && misdeedsOf(world, person, q).length > 0)));
      if (!rival) continue;
      if (now - (c.movedAt ?? -1e9) < 3 * DAY) continue;
      out.push({ intent: { kind: "hide", targetId: c.id, x: c.x, z: c.z, speed: 2, remaining: 10 }, score: 1.1, reason: `${rival.name} knows where it lies and cannot be trusted with it` });
    }
    // Someone who has been robbed puts half of what they carry by, out of the way.
    if (person.carry.food >= 4 && (world.facts ?? []).some((f) => f.kind === "theft" && f.to === person.id) && !world.things.some((c) => c.kind === "cache" && c.owner === person.id)) {
      const a = deedChance(person, world, "site", 600) * Math.PI * 2;
      out.push({ intent: { kind: "hide", x: person.x + Math.cos(a) * 14, z: person.z + Math.sin(a) * 14, speed: 2, remaining: 10 }, score: 0.9, reason: "I was robbed once, and will not keep everything where it can be found" });
    }
  }
  // Asking the wise: the one who has lost more than won, or is unsure, goes to an elder who has seen much.
  const s = person.self;
  if (person.age >= ADULT_AGE && person.age < AGES.elder && calm && s && (s.losses > s.wins + 1 || s.esteem < 0.35 || person.dither) && now - (d.counselledAt ?? -1e9) > DAY) {
    const elder = near.filter((q) => q.age >= AGES.middle + 4 && wisdomOf(q) >= 0.35 && (person.relations.get(q.id)?.affinity ?? 0) > 0.1 && (q.self?.lessons.length ?? 0) > 0).sort((a, b) => wisdomOf(b) - wisdomOf(a))[0];
    if (elder) out.push({ intent: { kind: "talk", targetId: elder.id, x: elder.x, z: elder.z, speed: 2, remaining: 20 }, score: 1, reason: `to ask ${elder.name}, who has seen much, what I should do` });
  }
  // Ambition: a young adult with something to prove makes a roof of their own away from the parents.
  const l = lifeOf(person);
  if (person.age >= ADULT_AGE + 0.4 && person.age < AGES.middle && !l.home && !partnerOf(world, person) && calm && !isDusk(now)) {
    const parent = world.people.find((q) => q.id === person.mother || q.id === person.father);
    if (parent && ambitionOf(person) >= 0.5 && person.carry.wood >= 8 - Math.round(3 * (person.skills?.build ?? 0))) {
      const roof = world.things.find((t) => t.kind === "shelter");
      const a = deedChance(person, world, "home", 600) * Math.PI * 2;
      const at = roof ? { x: roof.x + Math.cos(a) * 24, z: roof.z + Math.sin(a) * 24 } : { x: person.x + 6, z: person.z };
      out.push({ intent: { kind: "build", x: at.x, z: at.z, speed: 1.6, remaining: 150 }, score: 1.2, reason: "to have a roof of my own, away from my parents" });
      if (!d.ambitionNoted) {
        d.ambitionNoted = true;
        note(person, world, "I want more than my parents' fire. I mean to make something of my own.");
        tally(world, "ambitions");
      }
    }
  }
}
const awakeAlone = (p: Person, world: World) => !world.people.some((q) => q !== p && awake(q) && dist(q.x, q.z, p.x, p.z) < 14);
const isDusk = (now: number) => hourOf(now) >= 21 || hourOf(now) < 6;
const tenetText = (world: World, p: Person): string | undefined => (world.tenets ?? []).find((t) => t.id === p.faith?.death)?.text;

/** Tilts the scores already there: toward what would close the gap with who they mean to be, away from giving where nothing comes back, toward the craving. */
export function deedBias(person: Person, world: World, opts: Option[]) {
  const d = person.deeds;
  if (person.age < ADULT_AGE) return;
  const y = yieldTo(person);
  for (const o of opts) {
    const k = o.intent.kind;
    if (d?.lack && SERVES[d.lack].includes(k)) o.score += 0.4 * Math.min(1, d.gap * 4 + 0.3) * y;
    if (d && d.owed > 0.1 && (k === "gift" || k === "share") && o.intent.targetId) {
      const t = personById(world, o.intent.targetId);
      const dear = t && (t.mother === person.id || t.father === person.id || lifeOf(person).partner === t.id);
      if (!dear) o.score -= 0.7 * d.owed;
    }
    if (d?.addiction && k === d.addiction.kind) o.score += (d.addiction.withdrawing ? 0.7 : 0.45) * (Math.max(person.needs.hunger, person.needs.thirst) < 0.6 ? 1 : 0); // not even tiredness holds it back
    if (d?.retired && ["hunt", "build", "plant", "gather", "fish", "improve"].includes(k)) o.score -= 0.5;
    if (o.intent.targetId && (k === "talk" || k === "teach") && y > 0) {
      const t = personById(world, o.intent.targetId);
      if (t && (t.deeds?.status ?? 0) > 0.6) o.score += 0.12 * y; // the respected are sought out
    }
  }
}

// ---- When something finishes ----

export function deedAfter(world: World, person: Person, intent: Intent & { snap?: { hunger: number; thirst: number } }) {
  if (person.age < 1) return;
  const now = world.clock ?? 0;
  const k = intent.kind;
  const d = deedsOf(person);
  const other = personById(world, intent.targetId);
  // Serving who they mean to be makes them more so.
  if (person.age >= ADULT_AGE && d.lack && SERVES[d.lack].includes(k)) {
    selfEvent(person, 0.02, d.lack);
    selfOf(person).wins--; // an act toward an ideal is not a win over a rival
  }
  switch (k) {
    case "sing":
    case "dance": {
      const feast = !!festivalOn(world);
      person.needs.social = clamp01(person.needs.social - 0.3);
      person.needs.joy = clamp01(person.needs.joy - 0.3);
      person.mood = Math.min(1, person.mood + 0.08);
      const mates = world.people.filter((q) => q !== person && awake(q) && dist(q.x, q.z, person.x, person.z) < 14);
      if (k === "sing") {
        d.songs++;
        joyFrom(person, world, "beauty", 0.2);
        if (feast) joyFrom(person, world, "ritual", 0.25);
        for (const q of mates) {
          joyFrom(q, world, "beauty", 0.12); // those who hear
          relation(q, person.id, world).affinity = Math.min(1, relation(q, person.id, world).affinity + 0.01);
        }
        tally(world, feast ? "sungAtFeast" : "sung");
        note(person, world, feast ? "Sang with the others at the feast." : "Sang with the others as the light went.");
      } else {
        d.dances++;
        joyFrom(person, world, feast ? "celebration" : "play", 0.3);
        for (const q of mates.filter((m) => m.intent?.kind === "dance")) {
          const r = relation(person, q.id, world);
          r.affinity = Math.min(1, r.affinity + 0.02);
          person.laughUntil = now + 20;
        }
        tally(world, feast ? "dancedAtFeast" : "danced");
        note(person, world, feast ? "Danced at the feast." : "Danced with the others as the light went.");
      }
      break;
    }
    case "hide": {
      const c = thingById(world, intent.targetId);
      if (c && c.kind === "cache") moveCache(world, person, c, hideSpot(person, world, c));
      else if (!c && person.carry.food >= 4) {
        const n = Math.floor(person.carry.food / 2);
        person.carry.food -= n;
        make(world, "cache", intent.x, intent.z, { owner: person.id, stock: n, radius: 2 });
        note(person, world, "I put some food by where only I know.");
        tally(world, "cachesMade");
      }
      break;
    }
    case "mourn": {
      const g = thingById(world, intent.targetId);
      if (g && g.kind === "grave" && g.of && !g.rite && person.age >= ADULT_AGE) {
        const lost = world.dead?.find((x) => x.person.id === g.of)?.person;
        const tenet = tenetText(world, person);
        const why = tenet ? `for they held: ${tenet}` : `for ${person.name} loved them`;
        g.rite = { by: person.id, why, t: now };
        note(person, world, `I laid ${lost?.name ?? "the dead"} to rest, ${tenet ? `as I believe is right: ${tenet}` : "because I loved them"}.`);
        chronicle(world, `${person.name} laid ${lost?.name ?? "the dead"} to rest at the grave, ${why}.`);
        joyFrom(person, world, "ritual", 0.2);
        person.grief = Math.max(0, (person.grief ?? 0) - 0.1);
        tally(world, tenet ? "burialsByFaith" : "burialsByLove");
      }
      break;
    }
    case "share":
    case "comfort": {
      if (!other || other.age < ADULT_AGE) break;
      const aff = person.relations.get(other.id)?.affinity ?? 0;
      const dear = other.mother === person.id || other.father === person.id || lifeOf(person).partner === other.id;
      if (aff < 0.65 || dear) break;
      // Giving up their own food or rest for a friend, and bearing it.
      const hungryStill = k === "share" && (intent.snap?.hunger ?? 0) > 0.3 && person.carry.food < 1;
      const tiredStill = k === "comfort" && person.needs.energy > 0.55;
      if (!hungryStill && !tiredStill) break;
      d.costly[other.id] = (d.costly[other.id] ?? 0) + 1;
      const theirs = relation(other, person.id, world);
      theirs.affinity = Math.min(1, theirs.affinity + biasedDelta(world, other, person, 0.1));
      theirs.trust = Math.min(1, theirs.trust + 0.08);
      relation(person, other.id, world).affinity = Math.min(1, relation(person, other.id, world).affinity + 0.05);
      feel(other, "gratitude", 0.4);
      selfEvent(person, 0.03, "kind");
      note(person, world, hungryStill ? `I gave ${other.name} the last of my food, though I was hungry myself. ${other.name} is my friend.` : `I sat with ${other.name} though I was tired. ${other.name} is my friend.`);
      note(other, world, `${person.name} gave up their own ${hungryStill ? "food" : "rest"} for me.`);
      tally(world, "costlyFriendship");
      break;
    }
    case "talk": {
      if (!other || person.age < ADULT_AGE || other.age < AGES.middle + 4 || now - (d.counselledAt ?? -1e9) < DAY) break;
      const s = person.self;
      if (!s || !(s.losses > s.wins + 1 || s.esteem < 0.35)) break;
      if (wisdomOf(other) < 0.35) break;
      const mine = new Set(s.lessons.map((x) => x.key));
      const given = (other.self?.lessons ?? []).filter((x) => !mine.has(x.key)).sort((a, b) => b.strength - a.strength).slice(0, 2);
      if (!given.length) break;
      for (const x of given) s.lessons.push({ ...x, strength: x.strength * 0.6, n: 1 });
      d.counselledAt = now;
      d.counselled++;
      s.esteem = clamp01(s.esteem + 0.05);
      selfEvent(other, 0.02, "liked");
      feel(person, "gratitude", 0.3);
      note(person, world, `${other.name} told me what they had learned: ${given[0]!.text}`);
      note(other, world, `${person.name} came to me for counsel, and I told them what I know.`);
      tally(world, "counsel");
      break;
    }
  }
}

// ---- False belief: a hidden store moved out of sight ----

const hideSpot = (person: Person, world: World, c: Thing) => {
  const a = deedChance(person, world, `hide|${c.id}`, 600) * Math.PI * 2;
  return { x: c.x + Math.cos(a) * 22, z: c.z + Math.sin(a) * 22 };
};
/** They move it. Those who see it go know where it went; the rest still hold the old place in mind. */
export function moveCache(world: World, mover: Person, cache: Thing, to: { x: number; z: number }) {
  const from = { x: cache.x, z: cache.z };
  cache.x = to.x;
  cache.z = to.z;
  cache.movedAt = world.clock ?? 0;
  // Those who are by and awake see it go, and know where it went.
  for (const q of world.people) {
    const m = q.memory.get(cache.id);
    if (q !== mover && m && awake(q) && (dist(q.x, q.z, from.x, from.z) < 25 || dist(q.x, q.z, to.x, to.z) < 25)) (m.x = to.x), (m.z = to.z);
  }
  const f = witness(world, "deed", mover, undefined, `moved:${cache.id}`, true);
  // Who is thought to believe it is still where it was: everyone who is not here.
  const fooled = world.people.filter((q) => q !== mover && q.memory.get(cache.id) && dist(q.memory.get(cache.id)!.x, q.memory.get(cache.id)!.z, from.x, from.z) < 1 && dist(q.x, q.z, to.x, to.z) > 20);
  for (const q of fooled) {
    const m = modelOf(mover, q.id);
    m.knows = m.knows.filter((x) => x !== f.id);
  }
  const rival = fooled.sort((a, b) => (mover.relations.get(a.id)?.affinity ?? 0) - (mover.relations.get(b.id)?.affinity ?? 0))[0];
  note(mover, world, rival ? `I moved what I had put by. ${rival.name} still thinks it is where it was, and will look there.` : "I moved what I had put by.");
  tally(world, "caches moved");
  if (fooled.length) tally(world, "deceptions");
  return { fooled: fooled.map((q) => q.id), from };
}
/** Called when someone has walked to where they believe something is. If it is not there, they have acted on a belief that was false. */
export function deedArrive(person: Person, world: World, intent: Intent): boolean {
  if (!intent.arrived || !intent.targetId) return false;
  const t = thingById(world, intent.targetId);
  if (!t || t.movedAt === undefined || dist(t.x, t.z, intent.x, intent.z) < 4) return false;
  person.memory.delete(t.id);
  person.intent = undefined;
  note(person, world, "It was not where I left it. Someone has moved it.");
  feel(person, "surprise", 0.4);
  tally(world, "falseBeliefActed");
  if (t.owner && t.owner !== person.id) {
    const r = person.relations.get(t.owner);
    if (r) r.trust = Math.max(0, r.trust - 0.1);
  }
  return true;
}

// ---- Biases ----

/** How a change in regard lands: a bad turn weighs more than a good one, one's own people are warmer to and a stranger's act is less credited. */
export function biasedDelta(world: World, person: Person, other: Person, delta: number): number {
  const same = groupId(person) === groupId(other);
  let v = delta * (delta < 0 ? 1.3 : 1);
  v *= delta >= 0 ? (same ? 1.2 : 0.8) : same ? 0.85 : 1.15;
  const aff = person.relations.get(other.id)?.affinity ?? 0;
  if ((aff > 0.5 && delta < 0) || (aff < -0.5 && delta > 0)) v *= 0.7; // what goes against a settled view is half taken in
  void world;
  return v;
}

// ---- Dying for a purpose ----

/** A person whose life is organised around their family and who has stood in front of it will give their life when the beast is a killer. */
export function givesLifeFor(person: Person, world: World, kinId: string, beast: Thing): boolean {
  const h = heartOf(person);
  if (h.purpose?.kind !== "family" || h.purpose.strength < 0.7) return false;
  if ((AFFORDANCES[beast.kind]?.danger ?? 0) < 0.5) return false;
  const kin = personById(world, kinId);
  if (!kin || kin.age >= ADULT_AGE) return false;
  deedsOf(person).diedFor = { purpose: "family", forId: kinId };
  return true;
}
