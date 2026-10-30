// The long arc of a life after childhood: the turbulent years of adolescence (puberty, finding who to be, pulling against the parents,
// the first love and its loss, taking risks, doubting what was taught), courtship and the choice of a partner, leaving the parents' roof,
// parenthood; the middle years of passing things on and looking after both the young and the old, of status and of doubt; and old age,
// slowing, failing sight and memory, dependence, being honoured or neglected, keeping the stories, wanting to leave something, facing
// death. Beside it the body's rhythms (a woman's cycle, the months after a birth) and the shape of a family: brothers and sisters,
// a recognised pairing with obligations, widowhood, orphans taken in or not, step-parents, a clan, who inherits, and who may not pair.
// Ages are Eden years (an adult is 4); `humanYears` in psyche.ts gives the human equivalent.
import { DAY, YEAR } from "./earth";
import { feel } from "./inner";
import { roleOf, valueOf, VALUES } from "./identity";
import { ADULT_AGE, bondOf, chronicle, isNight, note, rand, relation, tally, type Intent, type Person, type World } from "./mind";
import { AGE } from "./development";
import { humanYears, milestone, psycheEvent, psycheOf } from "./psyche";

type Option = { intent: Omit<Intent, "arrived">; score: number };
export interface Life {
  partner?: string;
  since?: number;
  courting?: { id: string; progress: number; rejected: number };
  mourningUntil?: number;
  widowed?: boolean;
  guardian?: string;
  clan?: string;
  home?: string;
  pubertyDone?: boolean;
  menarche?: boolean;
  cycleStart?: number;
  menopause?: boolean;
  postpartumUntil?: number;
  tried?: string[];
  identity?: "achieved" | "moratorium" | "diffused";
  crush?: { id: string; since: number; rejected: number };
  heartbreakUntil?: number;
  doubts: number;
  risk: number;
  crisis?: boolean;
  peerDeaths: number;
  dementia?: number;
  legacy?: boolean;
  deathAttitude?: "serene" | "afraid";
  nextDoubt?: number;
}
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const dist = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);
const hash01 = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
};
export const lifeOf = (p: Person): Life => (p.life ??= { doubts: 0, risk: 0, peerDeaths: 0 });

export const AGES = {
  puberty: AGE.adolescence, // human 12
  crush: 3.1, // human 14
  courting: ADULT_AGE + 0.2,
  fertileFrom: ADULT_AGE + 0.3,
  menopause: 36, // human about 48
  middle: 22, // human 35
  elder: 49, // human 60
  frail: 60, // human 71
  dementiaFrom: 62,
};
const WORK_KINDS: Record<string, string[]> = { forage: ["forage", "gather"], fish: ["fish"], hunt: ["hunt"], farm: ["plant"], build: ["build", "improve", "furnish"], heal: ["comfort"] };
const CYCLE = 1.2 * DAY;
const MOURNING = 0.5 * YEAR;
const POSTPARTUM = 0.5 * YEAR;

// ---- People and kin ----

export function everyone(world: World): Person[] {
  return [...world.people, ...(world.dead ?? []).map((d) => d.person)];
}
const byId = (world: World, id: string | undefined) => (id ? everyone(world).find((q) => q.id === id) : undefined);
/** The close relation between them, if there is one that forbids pairing: parent, child, sibling, half-sibling, grandparent, grandchild, aunt or uncle, niece or nephew. */
export function closeKin(world: World, a: Person, b: Person): string | undefined {
  if (a.id === b.id) return "self";
  if (a.mother === b.id || a.father === b.id) return "parent";
  if (b.mother === a.id || b.father === a.id) return "child";
  if ((a.mother && a.mother === b.mother) || (a.father && a.father === b.father)) return a.mother === b.mother && a.father === b.father ? "sibling" : "half-sibling";
  const parentsOf = (p: Person) => [byId(world, p.mother), byId(world, p.father)].filter(Boolean) as Person[];
  for (const pa of parentsOf(a)) if (pa.mother === b.id || pa.father === b.id) return "grandparent";
  for (const pb of parentsOf(b)) if (pb.mother === a.id || pb.father === a.id) return "grandchild";
  for (const pa of parentsOf(a)) for (const pb of parentsOf(b)) if (pa.id !== pb.id && ((pa.mother && pa.mother === pb.mother) || (pa.father && pa.father === pb.father))) return "cousin";
  for (const pa of parentsOf(a)) if ((pa.mother && pa.mother === b.mother) || (pa.father && pa.father === b.father)) return "aunt or uncle";
  for (const pb of parentsOf(b)) if ((pb.mother && pb.mother === a.mother) || (pb.father && pb.father === a.father)) return "niece or nephew";
  return undefined;
}
/** What may not pair: close kin but not cousins; and brothers and sisters raised together even when unrelated. */
export function forbidden(world: World, a: Person, b: Person): boolean {
  const k = closeKin(world, a, b);
  if (k && k !== "cousin") return true;
  // Raised together as children: no desire for each other (the Westermarck effect).
  return !!a.life?.guardian && a.life.guardian === b.life?.guardian;
}
/** Who they call what, for the people who ask. */
export function kinName(world: World, a: Person, b: Person): string | undefined {
  if (a.life?.partner === b.id) return a.sex === "f" ? "wife" : "husband";
  const k = closeKin(world, a, b);
  if (!k) return a.life?.guardian === b.id ? "guardian" : undefined;
  if (k === "parent") return b.sex === "f" ? "mother" : "father";
  if (k === "child") return b.sex === "f" ? "daughter" : "son";
  if (k === "sibling") return b.sex === "f" ? "sister" : "brother";
  return k;
}
export const partnerOf = (world: World, p: Person) => world.people.find((q) => q.id === p.life?.partner);
export const stepParentOf = (world: World, child: Person): Person[] =>
  [child.mother, child.father].flatMap((id) => {
    const par = byId(world, id);
    const partner = par && partnerOf(world, par);
    return partner && partner.id !== child.mother && partner.id !== child.father ? [partner] : [];
  });

// ---- The body in old age ----

export const frailty = (p: Person) => clamp01((p.age - AGES.elder) / (AGES.frail + 15 - AGES.elder)) * (1 + (p.illness ? 0.3 : 0));
/** Slower with age: a third slower by ninety. */
export const ageSpeed = (p: Person) => (p.age < AGES.elder ? 1 : Math.max(0.5, 1 - 0.45 * frailty(p)));
/** The sight fails. */
export const sightOf = (p: Person, base: number) => (p.age < AGES.elder ? base : base * Math.max(0.5, 1 - 0.4 * frailty(p)));
export const dementiaOf = (p: Person) => p.life?.dementia ?? 0;

// ---- Obedience, and pulling away ----

/** How much a young person goes along with what their parents say: complete in childhood, dipping at the height of adolescence, partly back in adulthood. */
export function obedience(p: Person): number {
  const h = humanYears(p.age);
  if (h < 12) return 1;
  if (h < 19) return 1 - 0.6 * Math.sin(((h - 12) / 7) * Math.PI);
  return p.age < ADULT_AGE + 2 ? 0.8 : 0.7;
}

// ---- Women's and men's bodies ----

export type CyclePhase = "menstrual" | "follicular" | "fertile" | "luteal" | undefined;
export function cyclePhase(world: World, p: Person): CyclePhase {
  const l = p.life;
  if (!l?.menarche || l.menopause || p.pregnant || (l.postpartumUntil ?? 0) > (world.clock ?? 0) + 0.25 * YEAR) return undefined; // nursing a baby holds the cycle back
  const t = (((world.clock ?? 0) - (l.cycleStart ?? 0)) % CYCLE) / CYCLE;
  return t < 0.15 ? "menstrual" : t < 0.4 ? "follicular" : t < 0.6 ? "fertile" : "luteal";
}
export function canConceive(world: World, mother: Person, father: Person): boolean {
  if (mother.sex !== "f" || father.sex !== "m") return false;
  if (mother.age < AGES.fertileFrom || mother.age > AGES.menopause || father.age < AGES.fertileFrom) return false;
  if (forbidden(world, mother, father)) return false;
  if ((mother.life?.mourningUntil ?? 0) > (world.clock ?? 0)) return false;
  const phase = cyclePhase(world, mother);
  if (mother.life?.menarche && phase !== "fertile") return false;
  return true;
}

// ---- Stepping ----

export function lifeStep(person: Person, world: World, dt: number) {
  const l = lifeOf(person);
  const now = world.clock ?? 0;
  const ps = psycheOf(person);
  const h = humanYears(person.age);

  // Those who were already grown when the world began never saw their own puberty.
  if (!l.pubertyDone && person.age >= ADULT_AGE + 0.5) {
    l.pubertyDone = true;
    l.identity = "achieved";
    if (person.sex === "f" && person.age < AGES.menopause) {
      l.menarche = true;
      l.cycleStart = now - Math.floor(hash01(person.id + "cycle") * CYCLE);
    }
  }
  // Puberty.
  if (!l.pubertyDone && person.age >= AGES.puberty) {
    l.pubertyDone = true;
    if (person.sex === "f") {
      l.menarche = true;
      l.cycleStart = now;
      note(person, world, "My body is changing. I am becoming a woman.");
      tally(world, "menarche");
    } else {
      note(person, world, "My voice is breaking and I am growing fast. I am becoming a man.");
      tally(world, "voiceBreaks");
    }
    milestone(person, world, "puberty", "came into adolescence");
    feel(person, "surprise", 0.3);
  }
  if (person.sex === "f" && l.menarche && !l.menopause && person.age > AGES.menopause) {
    l.menopause = true;
    note(person, world, "My bleeding has stopped. A new time of life begins.");
    tally(world, "menopause");
  }
  // The cycle's mood: the days before bleeding are short-tempered and low, the middle bright.
  const phase = cyclePhase(world, person);
  if (phase === "luteal") feel(person, "anger", 0.0006 * dt * (0.5 + (ps.chem.cortisol - 0.2)));
  if (phase === "menstrual") person.needs.energy = clamp01(person.needs.energy + 0.00004 * dt);
  if (phase === "fertile") psycheEvent(person, "reward", 0.0004 * dt);
  // The months after a birth.
  if ((l.postpartumUntil ?? 0) > now) {
    ps.strain = clamp01(ps.strain + 0.00002 * dt * (1 + (person.needs.energy > 0.7 ? 1 : 0) + (partnerOf(world, person) ? 0 : 1.5)));
    if (!ps.state && ps.strain > 0.45 && rand(person) < dt / (0.5 * DAY)) {
      ps.state = "depressed";
      note(person, world, "Since the baby came I cannot feel what I should. I only feel tired and afraid.");
      tally(world, "postpartumDepression");
    }
  }

  // ---- Adolescence ----
  if (person.age >= AGES.puberty && person.age < ADULT_AGE) {
    // Tries things.
    const parents = [byId(world, person.mother), byId(world, person.father)].filter((x): x is Person => !!x && world.people.includes(x));
    const peers = world.people.filter((q) => q !== person && q.age >= AGES.puberty - 0.4 && q.age < ADULT_AGE + 1 && dist(q.x, q.z, person.x, person.z) < 25);
    // Values drift toward friends and away from the parents.
    if (person.values && peers.length) {
      for (const v of VALUES) {
        const pm = peers.reduce((a, q) => a + valueOf(q, v), 0) / peers.length;
        const par = parents.length ? parents.reduce((a, q) => a + valueOf(q, v), 0) / parents.length : valueOf(person, v);
        const rebel = 1 - obedience(person);
        person.values[v] = clamp01(person.values[v] + (0.00015 * dt * (pm - person.values[v]) - 0.0002 * dt * rebel * (par - person.values[v])));
      }
    }
    // Pulls against the parents: fonder in childhood, cooler at the height of it, a rift that mends.
    for (const par of parents) {
      if (dist(par.x, par.z, person.x, person.z) > 15) continue;
      const rift = 1 - obedience(person);
      const r = relation(person, par.id, world);
      r.affinity = Math.max(-0.3, r.affinity - 0.0001 * dt * rift);
      if (rift > 0.5 && rand(person) < dt / 900) feel(person, "anger", 0.2);
    }
    // Wanting to be free while still dependent.
    ps.drives.autonomy = clamp01(ps.drives.autonomy - dt / (1.2 * DAY));
    // First love.
    if (!l.crush && person.age >= AGES.crush) {
      let best: Person | undefined;
      let bs = 0.3;
      for (const q of world.people) {
        if (q === person || q.age < AGES.crush - 0.3 || forbidden(world, person, q) || dist(q.x, q.z, person.x, person.z) > 30) continue;
        const sameSex = hash01(person.id + "orient") < 0.1;
        if ((q.sex === person.sex) !== sameSex) continue;
        const r = person.relations.get(q.id);
        const s = (r?.affinity ?? 0) + 0.5 * (r?.familiarity ?? 0) + 0.2 * hash01(person.id + q.id) - dist(q.x, q.z, person.x, person.z) / 120;
        if (s > bs) (best = q), (bs = s);
      }
      if (best) {
        l.crush = { id: best.id, since: now, rejected: 0 };
        note(person, world, `I cannot stop thinking about ${best.name}.`);
        feel(person, "love", 0.5);
        feel(person, "shame", 0.1);
        psycheEvent(person, "novelty", 1);
        tally(world, "crushes");
      }
    }
    const crush = l.crush && byId(world, l.crush.id);
    if (l.crush && crush && world.people.includes(crush) && dist(crush.x, crush.z, person.x, person.z) < 10) {
      feel(person, "love", 0.004 * dt);
      psycheEvent(person, "reward", 0.0004 * dt);
    }
    // Doubts what was taught.
    if (now >= (l.nextDoubt ?? 0)) {
      l.nextDoubt = now + 0.7 * DAY;
      const held = Object.entries(person.faith ?? {});
      if (held.length && rand(person) < 0.3 + 0.3 * (1 - obedience(person))) {
        const [q, tid] = held[Math.floor(rand(person) * held.length)]!;
        const parentHolds = parents.some((par) => par.faith?.[q] === tid);
        if (parentHolds) {
          delete person.faith![q];
          l.doubts++;
          note(person, world, "I began to wonder if what I was taught is true.");
          tally(world, "doubts");
        }
      }
    }
    // Who they are going to be, tried on one thing at a time; at the end of it they have chosen or not.
    if (person.age >= ADULT_AGE - 0.02 && !l.identity) {
      const tried = new Set(l.tried ?? []).size;
      const role = roleOf(person);
      l.identity = tried >= 4 && role ? "achieved" : tried >= 2 ? "moratorium" : "diffused";
      note(person, world, l.identity === "achieved" ? `I know who I am: ${role ? `a ${role.role}` : "someone"}.` : l.identity === "moratorium" ? "I am still deciding who I will be." : "I do not know who I am or what I want.");
      milestone(person, world, "identity", l.identity === "achieved" ? "grew into who they meant to be" : l.identity === "moratorium" ? "came to adulthood still unsure of themselves" : "reached adulthood without a sense of who they were");
      tally(world, `identity_${l.identity}`);
    }
  }

  // ---- Young adulthood: pairing, and the wish to make a name ----
  if (person.age >= AGES.courting) courtStep(person, world, dt);
  if (person.age >= ADULT_AGE && person.age < AGES.middle) ps.drives.esteem = clamp01(ps.drives.esteem - dt / (8 * DAY)); // ambition: standing is wanted more than it is later
  if (person.age >= AGES.elder) ps.drives.esteem = clamp01(ps.drives.esteem - dt / (6 * DAY) * frailty(person)); // standing lost with strength

  // ---- Middle age ----
  if (person.age >= AGES.middle && person.age < AGES.elder) {
    // Midlife: at the turn, a time of asking what it has all been for, once.
    if (!l.crisis && h >= 42 && h < 50 && rand(person) < dt / (4 * DAY)) {
      l.crisis = true;
      ps.drives.meaning = Math.min(ps.drives.meaning, 0.15);
      feel(person, "despair", 0.3);
      feel(person, "regret", 0.3);
      note(person, world, "What have I done with my life? Is this all it was to be?");
      milestone(person, world, "midlife", "stopped in the middle of life and asked what it was for");
      tally(world, "midlifeCrises");
    }
  }
  // ---- Old age ----
  if (person.age >= AGES.elder) {
    const f = frailty(person);
    if (!l.legacy && person.age >= AGES.elder + 2) {
      l.legacy = true;
      note(person, world, "I want to leave something behind: a story, a name, a place.");
    }
    // The mind fails in some.
    if (person.age >= AGES.dementiaFrom) {
      const risk = (dt / YEAR) * 0.05 * (1 + (person.age - AGES.dementiaFrom) / 10);
      if ((l.dementia ?? 0) > 0) {
        l.dementia = Math.min(1, (l.dementia ?? 0) + (dt / YEAR) * 0.12);
        // Places and faces go.
        if (rand(person) < (dt / DAY) * (l.dementia ?? 0) * 2 && person.memory.size > 3) {
          const keys = [...person.memory.keys()];
          person.memory.delete(keys[Math.floor(rand(person) * keys.length)]!);
          tally(world, "forgottenPlaces");
        }
      }
      else if (rand(person) < risk) {
        l.dementia = 0.05;
        note(person, world, "Things slip away from me. I lose my words.");
        milestone(person, world, "dementia", "began to lose their memory");
        tally(world, "dementia");
      }
    }
    // Facing death: calm, or not, by what they believe and what their life has been.
    if (!l.deathAttitude && f > 0.5) {
      const consoled = (ps.drives.meaning > 0.4 ? 1 : 0) + (faithCount(person) > 0 ? 1 : 0) + (ps.chem.serotonin > 0.45 ? 1 : 0);
      l.deathAttitude = consoled >= 2 ? "serene" : "afraid";
      note(person, world, l.deathAttitude === "serene" ? "I am not afraid of what is coming. I have lived." : "I am afraid of what comes after, and of leaving things undone.");
      if (l.deathAttitude === "afraid") feel(person, "fear", 0.3);
      else feel(person, "relief", 0.2);
      tally(world, `death_${l.deathAttitude}`);
    }
    // Weakness shows: what they can no longer do they let go of.
    if (f > 0.5) ps.drives.competence = clamp01(ps.drives.competence - dt / (3 * DAY));
    // Honoured or neglected, by whether the others look after the old.
    if (f > 0.4) {
      const carers = world.people.filter((q) => q !== person && q.age >= ADULT_AGE && q.age < AGES.elder && dist(q.x, q.z, person.x, person.z) < 20);
      const cared = carers.some((q) => q.intent?.targetId === person.id && (q.intent.kind === "share" || q.intent.kind === "comfort"));
      if (cared) psycheEvent(person, "social", 0.02 * dt);
      else if (person.needs.hunger > 0.7) feel(person, "loneliness", 0.004 * dt);
    }
  }
}
const faithCount = (p: Person) => Object.keys(p.faith ?? {}).length;

// ---- Courtship and pairing ----

export function courtStep(person: Person, world: World, dt: number) {
  const l = lifeOf(person);
  const now = world.clock ?? 0;
  if (l.partner) {
    const partner = world.people.find((q) => q.id === l.partner);
    if (!partner) return; // widowed: handled at the death
    return;
  }
  if ((l.mourningUntil ?? 0) > now || (person.grief ?? 0) > 0.4 || person.needs.hunger > 0.7) return;
  // Choose someone.
  if (!l.courting) {
    if (rand(person) > dt / 120) return;
    let best: Person | undefined;
    let bs = 0.5;
    for (const q of world.people) {
      if (q === person || q.age < AGES.courting || q.life?.partner || forbidden(world, person, q) || dist(q.x, q.z, person.x, person.z) > 60) continue;
      if ((q.life?.mourningUntil ?? 0) > now) continue;
      const sameSex = hash01(person.id + "orient") < 0.1;
      if ((q.sex === person.sex) !== sameSex) continue;
      const r = person.relations.get(q.id);
      if (!r || r.affinity < 0.35) continue;
      const similarity = 1 - VALUES.reduce((a, v) => a + Math.abs(valueOf(person, v) - valueOf(q, v)), 0) / VALUES.length;
      const gap = Math.abs(q.age - person.age);
      const s = r.affinity + 0.5 * r.familiarity + 0.4 * similarity + 0.2 * hash01(q.id + person.id) - 0.04 * gap - dist(q.x, q.z, person.x, person.z) / 200;
      if (s > bs) (best = q), (bs = s);
    }
    if (best) {
      l.courting = { id: best.id, progress: 0, rejected: 0 };
      note(person, world, `I have begun to court ${best.name}.`);
      feel(person, "hope", 0.4);
      tally(world, "courtships");
    }
    return;
  }
  const target = world.people.find((q) => q.id === l.courting!.id);
  if (!target || target.life?.partner) {
    l.courting = undefined;
    return;
  }
  // Time together moves it on, and what they make of each other decides.
  if (dist(target.x, target.z, person.x, person.z) < 6) {
    const theirs = target.relations.get(person.id);
    const aff = theirs?.affinity ?? 0;
    l.courting.progress += (dt / (0.4 * DAY)) * Math.max(0, aff - 0.2);
    feel(person, "love", 0.002 * dt);
    if (aff < 0.15 && rand(person) < dt / 200) {
      l.courting.rejected++;
      if (l.courting.rejected >= 3) return heartbreak(person, world, target, "courtship");
    }
  }
  const them = target.life?.courting?.id === person.id;
  if (l.courting.progress >= 1 && ((target.relations.get(person.id)?.affinity ?? 0) > 0.55 || them)) pairUp(world, person, target);
}

export function pairUp(world: World, a: Person, b: Person) {
  const now = world.clock ?? 0;
  for (const [x, y] of [[a, b], [b, a]] as const) {
    const l = lifeOf(x);
    l.partner = y.id;
    l.since = now;
    l.courting = undefined;
    l.crush = undefined;
    l.widowed = false;
    feel(x, "joy", 0.6);
    feel(x, "love", 0.5);
    psycheEvent(x, "touch", 1.5);
    note(x, world, `${y.name} and I are together now.`);
    milestone(x, world, "pair", `became a pair with ${y.name}`);
    relation(x, y.id, world).affinity = Math.max(relation(x, y.id, world).affinity, 0.85);
    relation(x, y.id, world).trust = Math.max(relation(x, y.id, world).trust, 0.7);
  }
  tally(world, "pairs");
  chronicle(world, `${a.name} and ${b.name} became a couple.`);
  // A clan follows the father; the first of a line starts one.
  const father = a.sex === "m" ? a : b;
  const mother = a.sex === "m" ? b : a;
  const clan = father.life?.clan ?? `${father.name}'s people`;
  lifeOf(father).clan ??= clan;
  lifeOf(mother).clan ??= mother.life?.clan ?? clan;
}

function heartbreak(person: Person, world: World, other: Person, why: "courtship" | "loss") {
  const l = lifeOf(person);
  const ps = psycheOf(person);
  if (why === "courtship") {
    l.courting = undefined;
    note(person, world, `${other.name} does not want me. It hurts more than I thought anything could.`);
  } else note(person, world, `I lost ${other.name}.`);
  feel(person, "despair", 0.4);
  feel(person, "shame", 0.3);
  feel(person, "loneliness", 0.3);
  ps.chem.serotonin = clamp01(ps.chem.serotonin - 0.2);
  ps.strain = clamp01(ps.strain + 0.25);
  l.heartbreakUntil = (world.clock ?? 0) + 2 * DAY;
  if (person.age < ADULT_AGE) l.crush = undefined;
  milestone(person, world, "heartbreak", person.age < ADULT_AGE ? "had their heart broken for the first time" : `was refused by ${other.name}`);
  tally(world, "heartbreaks");
}
export const heartbreakFor = heartbreak;

/** When someone dies, those who were bound to them: the partner is widowed, the children without a parent are looked for a home. */
export function afterDeath(world: World, dead: Person) {
  const now = world.clock ?? 0;
  for (const q of world.people) {
    if (q.life?.partner === dead.id) {
      const l = lifeOf(q);
      l.partner = undefined;
      l.widowed = true;
      l.mourningUntil = now + MOURNING;
      q.grief = clamp01((q.grief ?? 0) + 0.4);
      note(q, world, `${dead.name} was my ${dead.sex === "m" ? "husband" : "wife"}. I am alone now.`);
      milestone(q, world, "widowed", `lost ${dead.name}, their partner`);
      tally(world, "widowed");
    }
    // Death among the old is felt as a sign of one's own.
    if (q.age >= AGES.middle && humanYears(q.age) - humanYears(dead.age) < 15) {
      lifeOf(q).peerDeaths++;
      if (lifeOf(q).peerDeaths % 3 === 0) {
        feel(q, "regret", 0.2);
        note(q, world, "So many of my own age are gone.");
      }
    }
  }
  // A child left without a parent is taken in, by family first, or not at all.
  for (const child of world.people) {
    if (child.age >= ADULT_AGE || (child.mother !== dead.id && child.father !== dead.id)) continue;
    const stillMother = world.people.find((q) => q.id === child.mother);
    if (stillMother) continue;
    adopt(world, child);
  }
}

/** An orphan is taken in: relatives first, then someone fond of them, if they can feed another mouth; and a custom of taking them in grows. */
export function adopt(world: World, child: Person) {
  const l = lifeOf(child);
  if (l.guardian && world.people.some((q) => q.id === l.guardian)) return;
  let best: Person | undefined;
  let bs = -1;
  for (const q of world.people) {
    if (q === child || q.age < ADULT_AGE || q.needs.hunger > 0.8 || dist(q.x, q.z, child.x, child.z) > 80) continue;
    const kin = closeKin(world, q, child);
    const r = q.relations.get(child.id)?.affinity ?? 0;
    const lactating = q.sex === "f" && child.age < AGE.infancyEnds ? ((q.lastBirth ?? -1e9) > (world.clock ?? 0) - 1.5 * YEAR ? 1 : -1) : 0;
    const burden = world.people.filter((x) => lifeOf(x).guardian === q.id).length + world.people.filter((x) => x.age < ADULT_AGE && (x.mother === q.id || x.father === q.id)).length;
    const willing = valueOf(q, "kin") * 0.5 + (kin ? 0.8 : 0) + r + lactating * 0.8 - 0.4 * burden + (q.carry.food > 1 ? 0.2 : 0) + (standingForOrphans(world) ? 0.5 : 0);
    if (willing > bs) (best = q), (bs = willing);
  }
  if (best && bs > 0.6) {
    l.guardian = best.id;
    note(best, world, `${child.name} has no one now. I will take them in.`);
    note(child, world, `${best.name} has taken me in.`);
    chronicle(world, `${best.name} took in ${child.name}, who had no parent.`);
    relation(child, best.id, world).affinity = Math.max(relation(child, best.id, world).affinity, 0.6);
    tally(world, "adoptions");
    // Done in view of the others, it can become what is done.
    for (const q of world.people) if (q !== best && dist(q.x, q.z, best.x, best.z) < 20) feel(q, "gratitude", 0.1);
    world.norms ??= {};
    (world.norms.orphans ??= { strength: 0 }).strength = Math.min(1, (world.norms.orphans.strength ?? 0) + 0.12);
  } else tally(world, "orphansUntaken");
}
const standingForOrphans = (world: World) => (world.norms?.orphans?.strength ?? 0) >= 0.5;

/** Their mother, or whoever took them in: who looks after a child. */
export function guardianOf(world: World, child: Person): Person | undefined {
  return world.people.find((q) => q.id === child.mother) ?? world.people.find((q) => q.id === child.life?.guardian);
}

// ---- Options ----

export function arcOptions(person: Person, world: World, out: Option[]) {
  const l = lifeOf(person);
  const now = world.clock ?? 0;
  const h = humanYears(person.age);
  // Courting: toward the one they are after.
  if (l.courting) {
    const t = world.people.find((q) => q.id === l.courting!.id);
    if (t && person.needs.hunger < 0.6 && !isNight(now)) {
      out.push({ intent: { kind: "talk", targetId: t.id, x: t.x, z: t.z, speed: 2, remaining: 20 }, score: 0.9 });
      if (person.carry.food >= 1 && l.courting.progress > 0.2) out.push({ intent: { kind: "share", targetId: t.id, x: t.x, z: t.z, speed: 2, remaining: 12 }, score: 0.7 });
    }
  }
  // A first love: seeking them out.
  if (l.crush && person.age < ADULT_AGE) {
    const t = world.people.find((q) => q.id === l.crush!.id);
    if (t && !isNight(now)) out.push({ intent: { kind: "talk", targetId: t.id, x: t.x, z: t.z, speed: 2, remaining: 15 }, score: 0.75 });
  }
  // A pair provides for one another, and for a woman carrying or nursing.
  const partner = partnerOf(world, person);
  if (partner && dist(partner.x, partner.z, person.x, person.z) < 50) {
    const nursing = partner.pregnant || (partner.life?.postpartumUntil ?? 0) > now;
    if (person.carry.food >= 1 && (partner.needs.hunger > 0.5 || (nursing && partner.needs.hunger > 0.3))) out.push({ intent: { kind: "share", targetId: partner.id, x: partner.x, z: partner.z, speed: 2.2, remaining: 12 }, score: 1.2 + (nursing ? 0.3 : 0) });
    if (nursing && person.sex === "m") for (const o of out) if (["forage", "fish", "hunt", "gather", "plant"].includes(o.intent.kind)) o.score += 0.3; // he takes the work she cannot
  }
  // A pair without a roof of their own sets up one.
  if (partner && !l.home && person.age >= AGES.courting + 0.3 && person.needs.hunger < 0.5 && person.carry.wood >= 8 - Math.round(3 * (person.skills?.build ?? 0)) && !isNight(now)) {
    const parentsHome = world.things.find((t) => t.kind === "shelter");
    const at = parentsHome ? { x: parentsHome.x + 14, z: parentsHome.z + 10 } : { x: person.x + 4, z: person.z };
    out.push({ intent: { kind: "build", x: at.x, z: at.z, speed: 1.6, remaining: 150 }, score: 1.3 });
  }
  // What they are known for, they keep doing: work chosen and stuck to.
  if (person.age >= ADULT_AGE) {
    const role = roleOf(person);
    const kinds = role ? WORK_KINDS[role.skill] : undefined;
    if (kinds) for (const o of out) if (kinds.includes(o.intent.kind)) o.score += 0.25;
  }
  // Adolescents: restless, running risks with others there.
  if (person.age >= AGE.adolescence && person.age < ADULT_AGE) {
    const peers = world.people.filter((q) => q !== person && q.age >= AGE.adolescence - 0.4 && q.age < ADULT_AGE + 1 && dist(q.x, q.z, person.x, person.z) < 20).length;
    for (const o of out) {
      if (["wander", "look", "play"].includes(o.intent.kind)) o.score += 0.2 * (1 - obedience(person));
      if (o.intent.kind === "hunt") o.score += (peers ? 0.3 : 0.1) + 0.2 * (psycheOf(person).chem.testosterone - 0.2);
    }
  }
  // Middle age: passing on, and looking after the old and the young.
  if (person.age >= AGES.middle && person.age < AGES.elder) {
    for (const o of out) if (o.intent.kind === "teach") o.score += 0.5;
    for (const e of world.people) {
      if (e.age < AGES.elder || frailty(e) < 0.25 || dist(e.x, e.z, person.x, person.z) > 60) continue;
      const mine = e.id === person.mother || e.id === person.father || closeKin(world, person, e) === "grandparent";
      const norm = (world.norms?.elders?.strength ?? 0) >= 0.5;
      const willing = (mine ? 0.9 : 0) + 0.5 * valueOf(person, "kin") + (norm ? 0.75 : 0) + (relation(person, e.id, world).affinity > 0.4 ? 0.3 : 0);
      if (willing < 0.7) continue;
      if (person.carry.food >= 1 && e.needs.hunger > 0.4) out.push({ intent: { kind: "share", targetId: e.id, x: e.x, z: e.z, speed: 2, remaining: 12 }, score: 0.9 + willing * 0.4 });
      else if (e.mood < -0.2 || e.needs.social > 0.7) out.push({ intent: { kind: "comfort", targetId: e.id, x: e.x, z: e.z, speed: 2, remaining: 12 }, score: 0.7 + willing * 0.3 });
    }
    if (l.crisis && now % (2 * DAY) < DAY) for (const o of out) if (["ponder", "create", "pray", "teach"].includes(o.intent.kind)) o.score += 0.4;
  }
  // Old age: they keep the stories and tell them; the heavy work is let go.
  if (person.age >= AGES.elder) {
    const f = frailty(person);
    for (const o of out) {
      if (["create", "teach", "ponder", "talk", "pray", "carve"].includes(o.intent.kind)) o.score += 0.3 + 0.2 * (l.legacy ? 1 : 0);
      if (["hunt", "build", "gather", "plant"].includes(o.intent.kind)) o.score -= 0.9 * f;
    }
    // The old are looked after, by those who hold it right, and neglected where no one does.
    // (Done from the carers' side above, in the options of those in middle age.)
    if (dementiaOf(person) > 0.4 && rand(person) < 0.02) person.say = person.say ? person.say : "Where is... who are you again?";
  }
  // Recently widowed: no courting, and time with those who share the loss.
  if ((l.mourningUntil ?? 0) > now) for (const o of out) if (o.intent.kind === "mourn") o.score += 0.5;
}

/** What they have tried in adolescence goes in the account of who they are (called when they finish something). */
export function triedKind(person: Person, kind: string) {
  if (person.age < AGE.adolescence || person.age >= ADULT_AGE) return;
  const l = lifeOf(person);
  (l.tried ??= []).push(kind);
  if (l.tried.length > 40) l.tried.shift();
  if (l.risk !== undefined && ["hunt", "wander"].includes(kind)) l.risk++;
}

// ---- The world's rules for the old and the orphaned, and who gets what ----

/** What someone leaves goes by what the people think right: equal shares if fairness weighs most among them, the eldest child if tradition does, the partner first if kin does. */
export function inheritanceRule(world: World): "equal" | "eldest" | "partner" {
  const adults = world.people.filter((q) => q.age >= ADULT_AGE);
  if (!adults.length) return "eldest";
  const mean = (v: (typeof VALUES)[number]) => adults.reduce((a, q) => a + valueOf(q, v), 0) / adults.length;
  const f = mean("fairness");
  const t = mean("tradition");
  const k = mean("kin");
  return k >= f && k >= t ? "partner" : f >= t ? "equal" : "eldest";
}
export function heirsOf(world: World, dead: Person): Person[] {
  const living = world.people.filter((q) => q.id !== dead.id);
  const children = living.filter((q) => (q.mother === dead.id || q.father === dead.id) && q.age >= ADULT_AGE).sort((a, b) => b.age - a.age);
  const partner = living.find((q) => q.life?.partner === dead.id) ?? living.find((q) => bondOf(dead, q) === "partner");
  const rule = inheritanceRule(world);
  if (rule === "partner" && partner) return [partner];
  if (rule === "equal" && children.length) return children;
  if (children[0]) return [children[0]];
  if (partner) return [partner];
  return living.filter((q) => (q.relations.get(dead.id)?.affinity ?? 0) > 0.4).sort((a, b) => (b.relations.get(dead.id)?.affinity ?? 0) - (a.relations.get(dead.id)?.affinity ?? 0)).slice(0, 1);
}

