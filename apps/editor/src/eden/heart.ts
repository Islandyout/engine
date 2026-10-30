// Love, pain, joy and meaning: the things a life is felt to be about.
//
//  LOVE has a course. Infatuation is intense and short (the chemistry of wanting) and either settles into attachment (calm, lasting) when it is
//  returned or turns to longing and then fades when it is not. A bond can be betrayed; one betrayal wounds trust, repeated ones turn love to
//  hatred. Parents and the deeply attached will take a blow meant for the one they love.
//  PAIN is a signal, and it teaches: a bad hurt is feared afterwards and the risky thing is avoided; long pain wears into the mood; seeing
//  someone hurt that you cannot help is its own distress; shame, being shut out and long loneliness hurt the same place.
//  JOY has sources (a purpose served, a hard thing done, belonging, shared laughter, giving, beauty, play, ritual, a celebration) and the
//  record of where it came from is kept, so the people can be asked what their life is made of.
//  MEANING is a purpose that organises a life (family, craft, knowledge, faith, community). It steadies a person against stress; when it is
//  lost they are in crisis and search (thinking, reading, praying), and the faithful are consoled sooner. A new purpose is found, or not.
// Nothing here claims anyone feels anything. It is the machinery by which behaviour comes from reasons.
import { DAY } from "./earth";
import { feel } from "./inner";
import { skillOf, valueOf, SKILLS } from "./identity";
import { faithful } from "./culture";
import { lifeOf, closeKin } from "./lifecycle";
import { ADULT_AGE, chronicle, note, relation, tally, thingById, type Intent, type IntentKind, type Person, type World } from "./mind";
import { knowsFact, witness } from "./mindmodel";
import { milestone, psycheEvent, psycheOf } from "./psyche";

type Option = { intent: Omit<Intent, "arrived">; score: number; reason?: string };
export type Purpose = "family" | "craft" | "knowledge" | "faith" | "community";
export type JoySource = "meaning" | "achievement" | "belonging" | "laughter" | "generosity" | "beauty" | "play" | "ritual" | "celebration";

export interface Crush {
  on: string;
  since: number;
  stage: "infatuation" | "attachment" | "longing";
}
export interface Heart {
  crush?: Crush;
  betrayals: Record<string, number>; // times each person has betrayed them
  hate: Record<string, number>; // 0..1 love turned bitter
  pain: { chronic: number; fear: number; shame: number; alone: number; helpless: number };
  acute: number;
  purpose?: { kind: Purpose; since: number; strength: number };
  crisisUntil?: number;
  searched: number; // answers sought since the crisis began
  joys: Partial<Record<JoySource, number>>;
  lastAcute: number; // last time pain was bad (world clock)
  sacrifices: number;
  handled?: string[]; // facts already acted on
  spurned?: string[]; // those who did not return their love: they do not fall for them again
}
// The heart draws its chances from a hash of who, when and what, not from the person's own random stream, so adding it does not shift every
// other choice a seeded life makes.
const chance = (person: Person, world: World, salt: string) => {
  let h = 2166136261;
  const s = `${person.id}|${Math.floor((world.clock ?? 0) / 5)}|${salt}`;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
};
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const dist = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);
export const heartOf = (p: Person): Heart => (p.heart ??= { betrayals: {}, hate: {}, pain: { chronic: 0, fear: 0, shame: 0, alone: 0, helpless: 0 }, acute: 0, searched: 0, joys: {}, lastAcute: -1e9, sacrifices: 0 });

const INFATUATION = 3 * DAY;
const LONGING = 20 * DAY;

// ---- Joy ----

export function joyFrom(person: Person, world: World, source: JoySource, amount: number) {
  const h = heartOf(person);
  h.joys[source] = (h.joys[source] ?? 0) + 1;
  feel(person, "joy", amount);
  psycheEvent(person, source === "beauty" ? "beauty" : source === "laughter" ? "laughter" : source === "achievement" ? "achievement" : "reward", amount);
  tally(world, `joy_${source}`);
}
/** What brought joy at the end of something they did. A thing done against hardship counts for more. */
export function heartAfter(world: World, person: Person, intent: Intent & { snap?: { hunger: number; thirst: number; cold: number } }) {
  if (person.age < 1) return;
  const hard = intent.snap ? Math.max(0, intent.snap.hunger - 0.6, intent.snap.thirst - 0.6, intent.snap.cold - 0.5) : 0;
  const h = heartOf(person);
  const nearby = world.people.filter((q) => q !== person && dist(q.x, q.z, person.x, person.z) < 12 && q.intent?.kind !== "sleep").length;
  switch (intent.kind) {
    case "hunt":
    case "fish":
    case "forage":
    case "build":
    case "plant":
    case "craft":
      if (hard > 0.1) joyFrom(person, world, "achievement", 0.3 + hard);
      if (h.purpose && ((h.purpose.kind === "craft") || (h.purpose.kind === "family" && person.carry.food > 0))) {
        h.purpose.strength = clamp01(h.purpose.strength + 0.02);
        joyFrom(person, world, "meaning", 0.1);
      }
      break;
    case "create":
    case "ponder":
    case "read":
    case "invent":
      if (h.purpose?.kind === "knowledge") {
        h.purpose.strength = clamp01(h.purpose.strength + 0.03);
        joyFrom(person, world, "meaning", 0.2);
      }
      if (intent.kind === "create") joyFrom(person, world, "beauty", 0.15);
      break;
    case "talk":
      if (nearby >= 1 && (person.laughUntil ?? 0) > (world.clock ?? 0)) joyFrom(person, world, "laughter", 0.3);
      else if (nearby >= 1) joyFrom(person, world, "belonging", 0.12);
      break;
    case "share":
    case "gift":
    case "comfort":
      joyFrom(person, world, "generosity", 0.2);
      if (intent.kind === "share" && person.needs.hunger > 0.5) {
        tally(world, "costlyKindness"); // gave while hungry themself
        h.purpose && h.purpose.kind === "community" && (h.purpose.strength = clamp01(h.purpose.strength + 0.03));
      }
      break;
    case "look":
      joyFrom(person, world, "beauty", 0.15);
      break;
    case "play":
      joyFrom(person, world, nearby >= 1 ? "laughter" : "play", 0.2);
      break;
    case "pray":
      joyFrom(person, world, "ritual", 0.2);
      if (h.purpose?.kind === "faith") h.purpose.strength = clamp01(h.purpose.strength + 0.04);
      consoled(person, world);
      break;
  }
}
/** A birth, a pairing, a survived winter: those near feel it together. */
export function celebrate(world: World, at: Person, why: string) {
  const people = world.people.filter((q) => dist(q.x, q.z, at.x, at.z) < 40 && q.age >= 1);
  if (people.length < 3) return;
  for (const q of people) {
    joyFrom(q, world, "celebration", 0.4);
    relation(q, at.id, world).affinity = Math.min(1, relation(q, at.id, world).affinity + 0.03);
  }
  tally(world, "celebrations");
  chronicle(world, `${at.name} and those near them celebrated ${why}.`);
}

// ---- Love ----

const bondOf = (world: World, p: Person) => (lifeOf(p).partner ? world.people.find((q) => q.id === lifeOf(p).partner) : undefined);

export function loveStep(person: Person, world: World, dt: number) {
  if (person.age < ADULT_AGE) return;
  const h = heartOf(person);
  const now = world.clock ?? 0;
  const l = lifeOf(person);
  const ps = psycheOf(person);
  const partner = bondOf(world, person);
  // Falling for someone: a person they like a great deal, and are not kin to.
  if (!h.crush && !partner && chance(person, world, "crush") < dt / 900) {
    let best: Person | undefined;
    let bestA = 0.62;
    for (const q of world.people) {
      if (q === person || q.age < ADULT_AGE || closeKin(world, person, q) || h.spurned?.includes(q.id)) continue;
      const r = person.relations.get(q.id);
      if (r && r.familiarity > 0.35 && r.affinity > bestA && lifeOf(q).partner !== person.id) (best = q), (bestA = r.affinity);
    }
    if (best) {
      h.crush = { on: best.id, since: now, stage: "infatuation" };
      note(person, world, `I cannot stop thinking about ${best.name}.`);
      milestone(person, world, "infatuation", `became infatuated with ${best.name}`);
      tally(world, "infatuations");
    }
  }
  const c = h.crush;
  if (c) {
    const on = world.people.find((q) => q.id === c.on);
    if (!on) h.crush = undefined;
    else if (partner?.id === on.id) {
      // It was returned and has become a bond.
      c.stage = "attachment";
    } else if (c.stage === "infatuation") {
      ps.chem.dopamine = clamp01(ps.chem.dopamine + 0.0004 * dt);
      ps.chem.cortisol = clamp01(ps.chem.cortisol + 0.0002 * dt); // wanting is a little frightening
      feel(person, "longing", 0.002 * dt);
      feel(person, "love", 0.0015 * dt);
      if (now - c.since > INFATUATION) {
        const back = on.relations.get(person.id)?.affinity ?? 0;
        if (back > 0.5) {
          c.stage = "attachment";
          note(person, world, `The fever has passed. What is left is calmer, and stronger: I want ${on.name} near me.`);
          tally(world, "infatuationsSettled");
        } else {
          c.stage = "longing";
          (h.spurned ??= []).push(on.id);
          note(person, world, `${on.name} does not feel what I feel.`);
          tally(world, "unrequited");
        }
      }
    } else if (c.stage === "longing") {
      ps.chem.serotonin = clamp01(ps.chem.serotonin - 0.0002 * dt);
      feel(person, "longing", 0.0012 * dt);
      feel(person, "loneliness", 0.0006 * dt);
      if (now - c.since > INFATUATION + LONGING) {
        h.crush = undefined;
        note(person, world, `I no longer ache for ${on.name}.`);
        tally(world, "longingsFaded");
      }
    } else if (c.stage === "attachment") {
      ps.chem.oxytocin = clamp01(ps.chem.oxytocin + 0.0003 * dt);
    }
  }
  // Fidelity: a bonded person drawn to a third. Chance rises with how little they hold to tradition and fairness and how cold the bond is.
  if (partner && !h.crush) {
    const cold = 1 - (person.relations.get(partner.id)?.affinity ?? 0.5);
    const hold = 0.5 * valueOf(person, "tradition") + 0.5 * valueOf(person, "fairness");
    if (chance(person, world, "stray") < (dt / (6 * DAY)) * Math.max(0, cold + 0.3 - hold)) {
      for (const q of world.people) {
        if (q === person || q === partner || q.age < ADULT_AGE || closeKin(world, person, q)) continue;
        if (dist(q.x, q.z, person.x, person.z) < 10 && (person.relations.get(q.id)?.affinity ?? 0) > 0.5) {
          betray(world, person, partner, q);
          break;
        }
      }
    }
  }
  if (partner) discover(world, person, partner);
  // Love that has been betrayed too often turns bitter; one betrayal only wounds it.
  for (const [id, n] of Object.entries(h.betrayals)) {
    if (n >= 2 && (h.hate[id] ?? 0) < 1) h.hate[id] = clamp01((h.hate[id] ?? 0) + (dt / (4 * DAY)) * (n - 1));
    const r = person.relations.get(id);
    if (r && (h.hate[id] ?? 0) > 0.5) {
      r.affinity = Math.max(-1, r.affinity - 0.00002 * dt);
      if ((person.emotions?.love ?? 0) > 0.1 && l.partner !== id) feel(person, "love", -0.001 * dt);
    }
  }
}
/** Someone with a partner goes to another. It is a fact like any other: the partner is hurt only when they come to know it (saw it, or were told). */
export function betray(world: World, who: Person, wronged: Person, withWhom: Person) {
  tally(world, "affairs");
  note(who, world, `I went to ${withWhom.name} while ${wronged.name} trusted me.`);
  feel(who, "guilt", 0.3);
  witness(world, "deed", who, withWhom, `affair:${wronged.id}`, true);
}
/** They come to know. What follows depends on how often it has happened: the first may be forgiven, the second ends the bond. */
export function learnOfBetrayal(world: World, wronged: Person, who: Person) {
  const hw = heartOf(wronged);
  hw.betrayals[who.id] = (hw.betrayals[who.id] ?? 0) + 1;
  const r = relation(wronged, who.id, world);
  r.trust = Math.max(0, r.trust - 0.45);
  r.affinity = Math.max(-1, r.affinity - 0.3);
  feel(wronged, "anger", 0.6);
  feel(wronged, "despair", 0.3);
  feel(wronged, "jealousy", 0.6);
  psycheEvent(wronged, "loss", 1);
  note(wronged, world, `${who.name} betrayed me.`);
  milestone(wronged, world, "betrayal", `was betrayed by ${who.name}`);
  tally(world, "betrayals");
  if (hw.betrayals[who.id]! >= 2) {
    lifeOf(wronged).partner = undefined;
    lifeOf(who).partner = undefined;
    tally(world, "bondsBroken");
  }
}
function discover(world: World, person: Person, partner: Person) {
  const h = heartOf(person);
  for (const f of world.facts ?? []) {
    if (f.kind !== "deed" || f.by !== partner.id || f.text !== `affair:${person.id}` || !knowsFact(person, f.id)) continue;
    if (h.handled?.includes(f.id)) continue;
    (h.handled ??= []).push(f.id);
    learnOfBetrayal(world, person, partner);
  }
}

// ---- Pain ----

export function painStep(person: Person, world: World, dt: number) {
  const h = heartOf(person);
  const now = world.clock ?? 0;
  const body = (person.wound ?? 0) * 0.8 + (person.illness?.severity ?? 0) * 0.6 + Math.max(0, person.needs.hunger - 0.8) + Math.max(0, person.cold - 0.7);
  h.acute = clamp01(body);
  if (h.acute > 0.3) h.lastAcute = now;
  // A hurt that goes on becomes a lasting ache; a bad one leaves a fear.
  if (h.acute > 0.3 && now - h.lastAcute < 1) h.pain.chronic = clamp01(h.pain.chronic + (h.acute * dt) / (3 * DAY));
  else h.pain.chronic = clamp01(h.pain.chronic - dt / (12 * DAY));
  if (h.acute > 0.5) h.pain.fear = clamp01(h.pain.fear + (h.acute * dt) / (1.5 * DAY));
  else h.pain.fear = clamp01(h.pain.fear - dt / (20 * DAY));
  // Shame lingers as humiliation.
  const shame = person.emotions?.shame ?? 0;
  h.pain.shame = clamp01(h.pain.shame + (shame > 0.4 ? 1 : -0.4) * (dt / (5 * DAY)));
  // Being alone a long time hurts in its own way.
  const company = world.people.some((q) => q !== person && dist(q.x, q.z, person.x, person.z) < 25);
  h.pain.alone = clamp01(h.pain.alone + (company ? -1 : 1) * (dt / (4 * DAY)) * (0.3 + 0.7 * (person.personality.sociability ?? 0.5)));
  // Seeing someone they love hurt, and being no help.
  let worst = 0;
  for (const q of world.people) {
    if (q === person || dist(q.x, q.z, person.x, person.z) > 15) continue;
    const hurt = (q.wound ?? 0) + (q.illness?.severity ?? 0);
    if (hurt > 0.4 && (person.relations.get(q.id)?.affinity ?? 0) > 0.5) worst = Math.max(worst, hurt * (1 - Math.min(0.9, skillOf(person, "heal") * 1.5)));
  }
  h.pain.helpless = clamp01(h.pain.helpless + (worst > 0.2 ? worst : -0.3) * (dt / DAY));
  if (worst > 0.2) feel(person, "empathy", 0.0008 * dt * worst);
  // All of it settles in the mood and the body's strain.
  const ps = psycheOf(person);
  const load = 0.3 * h.pain.chronic + 0.2 * h.pain.shame + 0.25 * h.pain.alone + 0.25 * h.pain.helpless;
  ps.strain = clamp01(ps.strain + load * (dt / (30 * DAY)));
  person.mood = Math.max(-1, person.mood - load * 0.00005 * dt);
}
/** Pain steers choice: what hurt is avoided, the hurt rest. */
export function painBias(person: Person, opts: Option[]) {
  const h = person.heart;
  if (!h) return;
  const fear = h.pain.fear;
  const risky = new Set<IntentKind>(["hunt", "tame", "steal"]);
  for (const o of opts) {
    if (risky.has(o.intent.kind)) o.score -= 0.6 * fear;
    if (o.intent.kind === "rest" || o.intent.kind === "sleep") o.score += 0.4 * h.acute + 0.15 * h.pain.chronic;
    if (o.intent.kind === "talk" || o.intent.kind === "comfort") o.score += 0.2 * h.pain.alone;
  }
}

// ---- Meaning ----

function purposeFor(person: Person, world: World): Purpose | undefined {
  const l = lifeOf(person);
  const kids = world.people.filter((q) => (q.mother === person.id || q.father === person.id) && q.age < 12).length;
  const weights: [Purpose, number][] = [
    ["family", (l.partner ? 0.4 : 0) + 0.3 * kids + 0.4 * valueOf(person, "kin")],
    ["craft", Math.max(...SKILLS.map((k) => skillOf(person, k)))],
    ["knowledge", 0.6 * (person.arts?.lore ?? 0) + 0.1 * (person.ideas?.length ?? 0) + 0.3 * person.personality.curiosity],
    ["faith", faithful(person)],
    ["community", 0.5 * (person.personality.sociability ?? 0.5) + 0.3 * valueOf(person, "fairness")],
  ];
  weights.sort((a, b) => b[1] - a[1]);
  return weights[0]![1] > 0.45 ? weights[0]![0] : undefined;
}
export function meaningStep(person: Person, world: World, dt: number) {
  if (person.age < ADULT_AGE) return;
  const h = heartOf(person);
  const ps = psycheOf(person);
  const now = world.clock ?? 0;
  if (!h.purpose && now > (h.crisisUntil ?? 0) && chance(person, world, "purpose") < dt / 600) {
    const kind = purposeFor(person, world);
    if (kind) {
      h.purpose = { kind, since: now, strength: 0.4 };
      note(person, world, `I know what my life is for: ${PURPOSE_WORDS[kind]}.`);
      milestone(person, world, "purpose", `found a purpose: ${PURPOSE_WORDS[kind]}`);
      tally(world, "purposesFound");
    }
  }
  if (h.purpose) {
    h.purpose.strength = clamp01(h.purpose.strength - dt / (30 * DAY));
    ps.drives.meaning = Math.max(ps.drives.meaning, 0.4 + 0.5 * h.purpose.strength);
    ps.strain = clamp01(ps.strain - 0.2 * h.purpose.strength * (dt / (20 * DAY))); // a person who knows what they are for bends and does not break
    if (lost(person, world, h.purpose.kind)) {
      note(person, world, `What I lived for is gone: ${PURPOSE_WORDS[h.purpose.kind]}. I do not know what I am for.`);
      milestone(person, world, "crisis", "lost what they lived for");
      h.purpose = undefined;
      h.crisisUntil = now + 8 * DAY * (1 - 0.5 * faithful(person));
      h.searched = 0;
      ps.drives.meaning = 0.05;
      feel(person, "despair", 0.4);
      tally(world, "meaningCrises");
    }
  }
  if (h.crisisUntil && now < h.crisisUntil) {
    ps.drives.meaning = Math.min(ps.drives.meaning, 0.2);
    person.mood = Math.max(-1, person.mood - 0.00003 * dt);
  }
}
const PURPOSE_WORDS: Record<Purpose, string> = { family: "those I love and have raised", craft: "the work of my hands", knowledge: "finding things out", faith: "what I hold to be true", community: "my people" };
function lost(person: Person, world: World, kind: Purpose): boolean {
  const l = lifeOf(person);
  if (kind === "family") {
    const family = world.people.some((q) => q !== person && (q.mother === person.id || q.father === person.id || l.partner === q.id));
    return !family && (person.grief ?? 0) > 0.5;
  }
  if (kind === "craft") return (person.wound ?? 0) > 0.8 || (person.illness?.severity ?? 0) > 0.8;
  if (kind === "community") return world.people.filter((q) => q !== person && q.age >= ADULT_AGE).length === 0 || !!person.shunned;
  if (kind === "faith") return (person.emotions?.despair ?? 0) > 0.9 && (person.grief ?? 0) > 0.7;
  return false;
}
/** The faithful are consoled by ritual: grief and despair ease, and the crisis shortens. */
function consoled(person: Person, world: World) {
  const f = faithful(person);
  if (f <= 0) return;
  person.grief = Math.max(0, (person.grief ?? 0) - 0.12 * f);
  feel(person, "despair", -0.1 * f);
  const h = heartOf(person);
  h.searched++;
  if (h.crisisUntil && (world.clock ?? 0) < h.crisisUntil) h.crisisUntil -= 0.4 * DAY * f;
  tally(world, "consolations");
}
/** In a crisis people look for answers; a settled life leaves them where they are. */
export function heartBias(person: Person, world: World, opts: Option[]) {
  const h = person.heart;
  if (!h) return;
  const now = world.clock ?? 0;
  const crisis = !!h.crisisUntil && now < h.crisisUntil;
  const yielding = person.needs.hunger < 0.6 && person.needs.thirst < 0.6 ? 1 : 0;
  for (const o of opts) {
    if (crisis) {
      if (o.intent.kind === "pray") o.score += (0.3 + 0.6 * faithful(person)) * yielding;
      else if (o.intent.kind === "ponder" || o.intent.kind === "read") o.score += 0.4 * yielding;
    }
    // Those who love a person seek them out; those who hate one keep away.
    if (o.intent.targetId) {
      if (h.crush?.on === o.intent.targetId && (o.intent.kind === "talk" || o.intent.kind === "gift" || o.intent.kind === "share")) o.score += (h.crush.stage === "infatuation" ? 0.5 : 0.25) * yielding;
      o.score -= 0.8 * (h.hate[o.intent.targetId] ?? 0) * (o.intent.kind === "steal" ? -1 : 1);
    }
  }
}

// ---- Sacrifice ----

/** A creature near someone they love: the deeply attached step between. They are hurt, and it is driven off. */
export function sacrificeStep(person: Person, world: World, dt: number, predators: { x: number; z: number; id: string }[]) {
  if (person.age < ADULT_AGE || !predators.length || chance(person, world, "guard") > dt / 4) return false;
  const h = heartOf(person);
  for (const q of world.people) {
    if (q === person || dist(q.x, q.z, person.x, person.z) > 30) continue;
    const child = (q.mother === person.id || q.father === person.id) && q.age < 10;
    const mate = lifeOf(person).partner === q.id;
    if (!child && !mate) continue;
    const near = predators.find((b) => dist(b.x, b.z, q.x, q.z) < 6);
    if (!near) continue;
    const love = (person.emotions?.love ?? 0) + 0.5 * (person.relations.get(q.id)?.affinity ?? 0) + (child ? 0.3 : 0);
    if (love < 0.7 || chance(person, world, "brave") > 0.3 + 0.5 * person.personality.boldness) continue;
    const beast = thingById(world, near.id);
    if (!beast) continue;
    person.wound = clamp01((person.wound ?? 0) + 0.5);
    person.health = clamp01(person.health - 0.35);
    const a = Math.atan2(beast.z - q.z, beast.x - q.x);
    beast.x += Math.cos(a) * 35;
    beast.z += Math.sin(a) * 35;
    h.sacrifices++;
    note(person, world, `I stood between ${q.name} and the beast, and took the blow.`);
    note(q, world, `${person.name} stood between me and the beast.`);
    relation(q, person.id, world).affinity = Math.min(1, relation(q, person.id, world).affinity + 0.25);
    feel(q, "gratitude", 0.7);
    tally(world, "sacrifices");
    chronicle(world, `${person.name} took a blow meant for ${q.name}.`);
    return true;
  }
  return false;
}

export function heartStep(person: Person, world: World, dt: number) {
  loveStep(person, world, dt);
  painStep(person, world, dt);
  meaningStep(person, world, dt);
}
