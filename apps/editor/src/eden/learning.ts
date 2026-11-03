// Education and the flow of knowledge: who teaches whom, what survives being passed on, who may learn what, what is believed that is not so,
// and how a people's words change.
//
//  APPRENTICESHIP: a young person attaches to someone with a reputation for a skill and learns faster from them than from chance teaching; the
//    master pays for it (tiredness, hunger, time), a pupil who has learned enough is tested and initiated, and the word of who knows what
//    (reputation) rises with their pupils' success and follows what the community has seen, not only what is true.
//  ORAL TRADITION: a tale (story, song, proverb or myth) carries a rule. Each retelling may change the telling or lose the rule; a song loses
//    the rule least, a story most. Whoever still holds the rule leans toward what it says.
//  ACCESS: some things may be closed to some people (by sex, class, guild secrecy, a ban), reading needs letters, books can be copied (with
//    mistakes), burned or lost in a collapse, and strangers carry what they know across.
//  FAILURE AND BELIEF: failing, or watching another fail, teaches caution and breeds explanations, some of them wrong. A belief spreads by
//    trust and by teachers, holds while nobody tests it, and is dropped (and unspoken to others) when tried and found false.
//  CURIOSITY AND WORDS: curiosity runs high in the young and falls with age; each child copies the words of its parents with small sound
//    changes, so a lineage's speech drifts.
// Chances come from a hash of who and what (never the person's own random stream), so adding this shifts none of the other seeded choices.
import { SKILLS, SKILL_WORDS, practise, roleOf, skillOf, valueOf, type Skill } from "./identity";
import { artOf, knows, loreOf, type Work } from "./culture";
import { CLAIM_CATALOGUE, RULE_CATALOGUE, SCENES, type Experience } from "./folklore";
import { rankOf } from "./society";
import { ADULT_AGE, AFFORDANCES, chronicle, note, personById, relation, tally, type Intent, type Person, type World } from "./mind";

type Option = { intent: Omit<Intent, "arrived">; score: number };
export type TaleForm = "story" | "song" | "proverb" | "myth";

export interface Tale {
  id: string;
  form: TaleForm;
  rule: string; // a key of the rules below
  by: string;
  byName: string;
  t: number;
  parts: string[]; // as first told: part 0 states the rule
  work?: string; // the song or story in world.works this tale is the telling of
}
export interface Version {
  parts: string[]; // as this person tells it
  rule: boolean; // the rule is still in their telling
  hops: number; // retellings between the author and them
}
export interface Held {
  conf: number; // 0..1
  from?: string; // who they had it from; absent when they worked it out
}
export interface Learning {
  n: number; // draws made so far (the hash stream)
  master?: { id: string; skill: Skill; since: number; lessons: number };
  initiated: Skill[];
  repute: Partial<Record<Skill, number>>; // how well the community thinks they know it, 0..1
  tales: Record<string, Version>;
  beliefs: Record<string, Held>;
  refuted: string[]; // beliefs they tried and found false
  failures: Record<string, number>; // by intent kind, fading
  words?: Record<string, string>;
  literate?: boolean;
  class?: "elite" | "common";
  guild?: Skill;
  scholar?: boolean;
  lastLesson?: number;
  lastTale?: number;
  exploreAt?: { x: number; z: number };
  hour?: number;
}
export interface Restriction {
  sex?: "m" | "f"; // only this sex may learn it
  class?: "elite"; // only the elite may
}
export interface Lore {
  tales: Tale[];
  restrict: Record<string, Restriction>; // keys: "skill:<skill>", "read"
  banned: string[]; // work ids that may not be read or copied
  guilds: Record<string, { members: string[]; secret: boolean }>;
  lexicon: Record<string, string>; // the first words
  claims: Claim[]; // beliefs that have arisen (true and false); the catalogue is FOLK
  lastCollapse?: number;
  lastBan?: number;
}
export interface Claim {
  id: string;
  text: string;
  truth: boolean;
  domain: string; // the kind of act it is about; trying that act tests it
  bias: number; // how much holding it pushes toward (+) or away from (-) that act
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const HOUR = 60; // sim seconds (a day is 1440)
const hash01 = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
};

export const learnOf = (p: Person): Learning => (p.learn ??= { n: 0, initiated: [], repute: {}, tales: {}, beliefs: {}, refuted: [], failures: {} });
export const worldLore = (w: World): Lore => (w.lore ??= { tales: [], restrict: {}, banned: [], guilds: {}, lexicon: { ...FIRST_WORDS }, claims: [] });
/** A draw for this person: a hash of who they are and how many draws they have made, not their random stream. */
const roll = (p: Person, salt: string) => {
  const l = learnOf(p);
  return hash01(`${p.id}|${l.n++}|${salt}`);
};
const yieldTo = (p: Person) => clamp01(1 - (Math.max(p.needs.hunger, p.needs.thirst) - 0.35) * 2.2);
const calm = (p: Person) => p.needs.hunger < 0.6 && p.needs.thirst < 0.6;
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

// What each skill is practised by (to tell what a belief about an act has to do with a teacher).
const SKILL_KIND: Record<Skill, string> = { forage: "forage", fish: "fish", hunt: "hunt", farm: "plant", build: "build", heal: "wash" };

// ---------------------------------------------------------------- apprenticeship

export type Refusal = { ok: false; reason: string };
/** Whether the learner may be taught the skill by this teacher, with the reason when not. */
export function mayLearn(world: World, learner: Person, teacher: Person | undefined, skill: Skill, admitting = false): string | undefined {
  const lore = world.lore;
  const r = lore?.restrict[`skill:${skill}`];
  if (r?.sex && learner.sex !== r.sex) return `${SKILL_WORDS[skill].doing} is not taught to ${learner.sex === "f" ? "women" : "men"} here`;
  if (r?.class && learner.learn?.class !== r.class) return `${SKILL_WORDS[skill].doing} is kept for the elite`;
  const guild = lore?.guilds[skill];
  if (guild?.secret && teacher && !admitting && !guild.members.includes(learner.id)) {
    const taken = learner.learn?.master?.id === teacher.id && learner.learn.master.skill === skill;
    if (!taken) return `the ${SKILL_WORDS[skill].role}s keep their craft secret`;
  }
  return undefined;
}
export const reputeOf = (p: Person, skill: Skill) => p.learn?.repute[skill] ?? 0;
const MASTERS_MAX = 3;
const apprenticesOf = (world: World, m: Person) => world.people.filter((q) => q.learn?.master?.id === m.id);

/** A learner attaches to a master for a skill. Refused, with the reason, if the master is not good enough, is full, or the learner may not learn it. */
export function takeApprentice(world: World, master: Person, pupil: Person, skill: Skill): { ok: true } | Refusal {
  const refuse = (reason: string): Refusal => (tally(world, "apprenticeRefused"), { ok: false, reason });
  if (master === pupil) return refuse("no one is their own master");
  const no = mayLearn(world, pupil, master, skill, !!worldLore(world).guilds[skill]?.members.includes(master.id));
  if (no) return refuse(no);
  if (skillOf(master, skill) < 0.5) return refuse("the master is not good enough");
  if (skillOf(master, skill) - skillOf(pupil, skill) < 0.2) return refuse("there is nothing to learn from them");
  if (learnOf(pupil).master) return refuse("already has a master");
  if (apprenticesOf(world, master).length >= MASTERS_MAX) return refuse("the master has all the pupils they can teach");
  learnOf(pupil).master = { id: master.id, skill, since: world.clock ?? 0, lessons: 0 };
  note(pupil, world, `I am to learn ${SKILL_WORDS[skill].doing} from ${master.name}.`);
  note(master, world, `${pupil.name} has come to learn ${SKILL_WORDS[skill].doing} from me.`);
  tally(world, "apprenticeships");
  if (apprenticesOf(world, master).length === 2) {
    tally(world, "schools");
    chronicle(world, `${master.name} now has pupils to teach ${SKILL_WORDS[skill].doing}: a school of sorts.`);
  }
  return { ok: true };
}

function pickSkill(teacher: Person, learner: Person): Skill | undefined {
  let pick: Skill | undefined;
  let gap = 0;
  for (const s of SKILLS) {
    const g = skillOf(teacher, s) - skillOf(learner, s);
    if (skillOf(teacher, s) > 0.35 && g > 0.2 && g > gap) (pick = s), (gap = g);
  }
  return pick;
}
/** How readily they learn, for their age (curiosity helps the young). */
export const learnRate = (p: Person) => Math.min(1.3, 0.7 + 0.6 * ageCuriosity(p.age));

/**
 * One lesson. A master teaches their apprentice about two and a half times as well as a chance lesson does; any teaching costs the teacher
 * (tiredness, hunger, time) and passes on what the teacher wrongly believes about that work. Returns what was taught, or nothing when
 * there is nothing to teach or it is not allowed (a guild secret, a closed craft).
 */
export function teachStep(world: World, teacher: Person, learner: Person): { skill: Skill } | undefined {
  const lr = learnOf(learner);
  const tl = learnOf(teacher);
  const apprentice = lr.master?.id === teacher.id;
  const skill = apprentice ? lr.master!.skill : pickSkill(teacher, learner);
  if (!skill || skillOf(teacher, skill) - skillOf(learner, skill) <= (apprentice ? 0.05 : 0.2) || skillOf(teacher, skill) <= (apprentice ? 0.3 : 0.35)) return undefined;
  const no = mayLearn(world, learner, teacher, skill);
  if (no) {
    tally(world, "teachingRefused");
    if (world.lore?.guilds[skill]?.secret) tally(world, "secretsKept");
    return undefined;
  }
  const kin = learner.mother === teacher.id || learner.father === teacher.id;
  const base = kin ? 0.06 : 0.035;
  const before = skillOf(learner, skill);
  practise(learner, skill, apprentice ? base * 2.5 * learnRate(learner) : base);
  // The teacher pays: the time and attention are theirs, and they eat into their day.
  teacher.needs.energy = clamp01(teacher.needs.energy + (apprentice ? 0.04 : 0.02));
  teacher.needs.hunger = clamp01(teacher.needs.hunger + 0.01);
  tl.lastLesson = world.clock ?? 0;
  tally(world, "teachingCost");
  if (apprentice) lr.master!.lessons++;
  // A pupil who does well does the teacher's name good; one who learns nothing does not.
  if (skillOf(learner, skill) > before) tl.repute[skill] = clamp01((tl.repute[skill] ?? 0) + (apprentice ? 0.012 : 0.004));
  // What the teacher wrongly believes about this work is taught with it.
  for (const [id, held] of Object.entries(tl.beliefs)) {
    const c = worldLore(world).claims.find((x) => x.id === id);
    if (!c || c.domain !== SKILL_KIND[skill] || lr.beliefs[id] || lr.refuted.includes(id)) continue;
    if (roll(teacher, `pass-${id}`) < 0.8 * held.conf) {
      lr.beliefs[id] = { conf: 0.6 * held.conf + 0.3, from: teacher.id };
      if (!c.truth) {
        tally(world, "teacherErrorsPassed");
        note(learner, world, `${teacher.name} taught me that ${c.text}.`);
      }
    }
  }
  teachToRead(world, teacher, learner);
  return { skill };
}

/** A master tests a pupil who has learned enough; one who passes is initiated, and the master's name is made by it. */
export function examine(world: World, master: Person, pupil: Person): { passed: boolean; skill: Skill } | undefined {
  const m = learnOf(pupil).master;
  if (!m || m.id !== master.id) return undefined;
  const lr = learnOf(pupil);
  const passed = skillOf(pupil, m.skill) >= 0.5;
  if (passed) {
    lr.initiated.push(m.skill);
    lr.repute[m.skill] = Math.max(lr.repute[m.skill] ?? 0, skillOf(pupil, m.skill) * 0.9);
    const ml = learnOf(master);
    ml.repute[m.skill] = clamp01((ml.repute[m.skill] ?? 0) + 0.08);
    lr.master = undefined;
    chronicle(world, `${pupil.name} was tested by ${master.name} and made a ${SKILL_WORDS[m.skill].role}.`);
    note(pupil, world, `${master.name} tested me and I am a ${SKILL_WORDS[m.skill].role} now.`);
    tally(world, "initiations");
    const guild = worldLore(world).guilds[m.skill];
    if (guild && !guild.members.includes(pupil.id) && guild.members.includes(master.id)) guild.members.push(pupil.id);
  } else {
    tally(world, "testsFailed");
    note(pupil, world, `${master.name} told me I am not ready yet.`);
    failedAt(world, pupil, SKILL_KIND[m.skill]);
  }
  return { passed, skill: m.skill };
}

// ---------------------------------------------------------------- oral tradition

export const RULES: Record<string, { text: string; kind: string; night?: boolean; when: Experience }> = RULE_CATALOGUE;
const EMBELLISH: [RegExp, string][] = [
  [/\bone\b/, "three"],
  [/\bthree\b/, "seven"],
  [/\btwo\b/, "five"],
  [/\bwolf\b/, "great wolf"],
  [/\bsmall\b/, "tiny"],
  [/\bold\b/, "ancient"],
  [/\bwalked\b/, "ran"],
  [/\bhunter\b/, "giant"],
  [/\bdeer\b/, "white stag"],
];
const LOSS: Record<TaleForm, { part: number; rule: number }> = {
  story: { part: 0.35, rule: 0.22 },
  myth: { part: 0.2, rule: 0.08 },
  proverb: { part: 0.1, rule: 0.05 },
  song: { part: 0.05, rule: 0.03 }, // metre and rhyme hold the words in place
};
function drift(part: string, salt: string): string {
  const start = Math.floor(hash01(salt) * EMBELLISH.length);
  for (let k = 0; k < EMBELLISH.length; k++) {
    const [re, rep] = EMBELLISH[(start + k) % EMBELLISH.length]!;
    if (re.test(part)) return part.replace(re, rep);
  }
  return part.endsWith(", so they say") ? `${part} and more` : `${part}, so they say`;
}
/** What a hearer comes away with when a teller tells their version: each part and the rule may change or be lost. */
export function retell(tale: Tale, from: Version, hearerId: string): Version {
  const loss = LOSS[tale.form];
  const parts = from.parts.slice();
  let rule = from.rule;
  for (let i = 0; i < parts.length; i++) {
    const salt = `${tale.id}|${hearerId}|${from.hops}|${i}`;
    if (i === 0) {
      if (rule && hash01(salt + "r") < loss.rule) (rule = false), (parts[0] = "");
      else if (rule && hash01(salt + "d") < loss.part) parts[0] = drift(parts[0]!, salt);
    } else if (hash01(salt) < loss.part) parts[i] = drift(parts[i]!, salt);
  }
  return { parts, rule, hops: from.hops + 1 };
}
export const tellText = (v: Version) => v.parts.filter(Boolean).join("; ") + ".";

/**
 * A person who has lived through something worth warning of makes it into a tale. A song or a story is also a work in `world.works`: the
 * author's own recent unlinked one is taken as the telling, else the work is made with it, and the two are linked (tale.work, work.tale).
 */
export function composeTale(world: World, by: Person, rule: string, form: TaleForm, work?: Work): Tale {
  const lore = worldLore(world);
  const r = RULES[rule];
  if (!r) throw new Error(`composeTale: unknown rule "${rule}"`);
  const id = `tale-${lore.tales.length}`;
  const parts = [r.text, ...[0, 1, 2].map((i) => SCENES[Math.floor(hash01(`${id}|${i}`) * SCENES.length)]!)];
  const tale: Tale = { id, form, rule, by: by.id, byName: by.name, t: world.clock ?? 0, parts };
  if (form === "song" || form === "story") {
    const works = (world.works ??= []);
    const w = work ?? works.find((x) => x.kind === form && x.by === by.id && !x.tale && (world.clock ?? 0) - x.t < 3 * 1440);
    if (w) (w.tale = id), (tale.work = w.id);
    else {
      const made: Work = { id: `work-${works.length}`, kind: form, by: by.id, byName: by.name, title: `The ${form === "song" ? "Song" : "Tale"} of ${r.text.split(" ").slice(0, 4).join(" ")}`, t: world.clock ?? 0, quality: clamp01(0.2 + 0.5 * artOf(by)), tale: id };
      works.push(made);
      tale.work = made.id;
      tally(world, "workTales");
    }
  }
  lore.tales.push(tale);
  learnOf(by).tales[id] = { parts: parts.slice(), rule: true, hops: 0 };
  learnOf(by).lastTale = world.clock ?? 0;
  tally(world, `tales_${form}`);
  note(by, world, `Made a ${form} so the old lesson is not forgotten: ${r.text}.`);
  return tale;
}
/** A song or story the person made (culture.ts) that carries no rule yet becomes the telling of one from what they have lived. */
function linkWorks(world: World, person: Person) {
  const exp = lived(world, person);
  if (!exp) return;
  const w = (world.works ?? []).find((x) => (x.kind === "song" || x.kind === "story") && x.by === person.id && !x.tale);
  if (!w) return;
  const rule = pickRule(person, exp);
  if (rule) composeTale(world, person, rule, w.kind as TaleForm, w);
}
/** What a person has lived through that is worth warning others of, if anything: the oldest sort of lesson first. */
export function lived(world: World, p: Person): Experience | undefined {
  const felt = p.felt;
  if (felt && felt.scares >= 1) return "scare";
  if (felt && felt.hungry > 90) return "hungry";
  if (p.illness) return "ill";
  if (felt && felt.cold > 90) return "cold";
  if ((p.grief ?? 0) > 0.1) return "grief";
  if (Object.keys(p.heart?.betrayals ?? {}).length) return "betrayed";
  if (Object.values(p.conflict?.grudge ?? {}).some((g) => g > 0.2)) return "fight";
  if (p.conflict?.record.includes("theft")) return "theft";
  if (world.people.some((q) => q.mother === p.id && q.age < 1)) return "birth";
  if (p.needs.energy > 0.8) return "toil";
  if ([...p.relations.values()].some((r) => r.trust > 0.85)) return "kindness";
  if (p.personality.curiosity > 0.7) return "wonder";
  return undefined;
}
const pickRule = (p: Person, exp: Experience): string | undefined => {
  const pool = Object.entries(RULES).filter(([, r]) => r.when === exp).map(([k]) => k);
  return pool.length ? pool[Math.floor(hash01(`${p.id}|rule|${exp}|${Object.keys(p.learn?.tales ?? {}).length}`) * pool.length)] : undefined;
};
/** One person tells another a tale they lack (or, if the hearer lost its rule, the telling restores it). */
export function tellTale(world: World, teller: Person, hearer: Person): Tale | undefined {
  if (hearer.age < 1) return undefined;
  const lore = world.lore;
  if (!lore) return undefined;
  const tl = learnOf(teller);
  const hl = learnOf(hearer);
  for (const tale of lore.tales) {
    const mine = tl.tales[tale.id];
    if (!mine || (tale.work && lore.banned.includes(tale.work))) continue;
    const theirs = hl.tales[tale.id];
    if (theirs && (theirs.rule || !mine.rule)) continue;
    if (roll(teller, `tell-${tale.id}`) > 0.35 + 0.3 * relation(hearer, teller.id, world).trust) continue;
    if (theirs) {
      theirs.rule = true;
      theirs.parts[0] = mine.parts[0]!;
      tally(world, "talesRestored");
    } else {
      const v = retell(tale, mine, hearer.id);
      hl.tales[tale.id] = v;
      tally(world, "talesTold");
      if (v.parts.join("|") !== mine.parts.join("|")) tally(world, "talesDrifted");
      note(hearer, world, `${teller.name} told me a ${tale.form}: ${tellText(v)}`);
    }
    return tale;
  }
  return undefined;
}
/** Whether they hold the rule of a tale, and from what form. */
export function holdsRule(p: Person, world: World, rule: string): boolean {
  for (const [id, v] of Object.entries(p.learn?.tales ?? {})) if (v.rule && world.lore?.tales.find((t) => t.id === id)?.rule === rule) return true;
  return false;
}

// ---------------------------------------------------------------- access to knowledge

export const isLiterate = (p: Person) => !!p.learn?.literate || !!p.ideas?.includes("writing");
/** Letters are taught by someone who has them. A closed reading (the elite only) is not taught outside it. */
function teachToRead(world: World, teacher: Person, learner: Person) {
  if (!isLiterate(teacher) || isLiterate(learner) || !knows(world, "writing")) return;
  const r = world.lore?.restrict.read;
  if (r?.class && learner.learn?.class !== r.class) return void tally(world, "readingRefused");
  if (roll(teacher, "letters") < 0.3) {
    learnOf(learner).literate = true;
    note(learner, world, `${teacher.name} taught me my letters.`);
    tally(world, "literacyTaught");
  }
}
/** Whether this person may read this book: they must have letters, the book must not be banned, and a closed reading is closed. */
export function bookAllowed(world: World, p: Person, bookId: string): boolean {
  if (world.lore?.banned.includes(bookId)) return false;
  const r = world.lore?.restrict.read;
  if (r?.class && p.learn?.class !== r.class) return false;
  if (r && !isLiterate(p)) return false;
  return true;
}
/** An authority forbids a book: it is taken from its shelf, and may be neither read nor copied. */
export function censor(world: World, bookId: string): boolean {
  const w = (world.works ?? []).find((x) => x.id === bookId);
  if (!w) throw new Error(`censor: no work "${bookId}"`);
  const lore = worldLore(world);
  if (lore.banned.includes(bookId)) return false;
  lore.banned.push(bookId);
  w.at = undefined;
  tally(world, "booksBanned");
  chronicle(world, `"${w.title}" by ${w.byName} was forbidden and taken from its shelf.`);
  return true;
}
/** Someone who can write copies a book kept at a library onto a new one, with the chance of a slip dropping something it taught. */
export function copyBook(world: World, scribe: Person, bookId: string, toLibrary?: string): string | undefined {
  const book = (world.works ?? []).find((w) => w.id === bookId);
  if (!book || book.kind !== "book") throw new Error(`copyBook: no book "${bookId}"`);
  if (!isLiterate(scribe) || !knows(world, "writing")) return undefined;
  if (world.lore?.banned.includes(bookId) || !book.at) return undefined;
  const works = (world.works ??= []);
  const slips: string[] = [];
  const kept = (book.knows ?? []).filter((k) => (hash01(`${bookId}|${scribe.id}|${works.length}|${k}`) < 0.9 ? true : (slips.push(k), false)));
  const copy = { ...book, id: `work-${works.length}`, by: scribe.id, byName: scribe.name, t: world.clock ?? 0, quality: book.quality * 0.95, knows: kept, at: toLibrary ?? book.at, copyOf: book.id };
  works.push(copy);
  learnOf(scribe).scholar = true;
  tally(world, "booksCopied");
  if (slips.length) tally(world, "copyingSlips");
  note(scribe, world, `Copied "${book.title}" in my own hand${slips.length ? ", though I lost a line or two" : ""}.`);
  return copy.id;
}
/**
 * A collapse (famine, plague, war): each person loses each thing they knew with chance `severity`, and with severity above one half the
 * libraries burn. What was written and kept elsewhere (another shelf, a hidden copy) survives. Returns the ideas nobody knows any more.
 */
export function collapse(world: World, severity: number): string[] {
  const before = Object.keys(world.knowledge ?? {}).filter((id) => knows(world, id));
  for (const p of world.people) p.ideas = (p.ideas ?? []).filter((id) => id.startsWith("read:") || hash01(`${p.id}|${id}|collapse`) >= severity);
  if (severity > 0.5) for (const w of world.works ?? []) if (w.kind === "book" && world.things.some((t) => t.id === w.at && t.kind === "library") && hash01(`${w.id}|burn`) < severity) (w.at = undefined), (w.knows = []);
  const lost = before.filter((id) => !knows(world, id));
  if (lost.length) {
    tally(world, "knowledgeLost");
    chronicle(world, `The hard years took what was known of ${lost.join(", ")}.`);
  }
  return lost;
}
/** Strangers and travellers bring what they know and take what they find. Called when a stranger talks with someone. */
export function carryKnowledge(world: World, a: Person, b: Person) {
  if (!a.stranger && !b.stranger) return;
  for (const [from, to] of [[a, b], [b, a]] as const)
    for (const id of from.ideas ?? []) {
      if (id.startsWith("read:") || to.ideas?.includes(id)) continue;
      if (roll(from, `carry-${id}`) < 0.7) {
        (to.ideas ??= []).push(id);
        note(to, world, `${from.name}, who has travelled, showed me ${id}.`);
        tally(world, "knowledgeCarried");
      }
    }
}

// ---------------------------------------------------------------- failure and false belief

/** Things that people come to believe from what befalls them; some are so and some are not. */
export const FOLK: Claim[] = CLAIM_CATALOGUE;
export const claimOf = (world: World, id: string): Claim | undefined => worldLore(world).claims.find((c) => c.id === id) ?? FOLK.find((c) => c.id === id);
/** Take up a belief with some confidence. */
export function believe(world: World, p: Person, claimId: string, conf: number, from?: string) {
  const c = claimOf(world, claimId);
  if (!c) throw new Error(`believe: no claim "${claimId}"`);
  const lore = worldLore(world);
  if (!lore.claims.some((x) => x.id === c.id)) lore.claims.push(c);
  learnOf(p).beliefs[claimId] = { conf: clamp01(conf), from };
  if (!c.truth) tally(world, "falseBeliefsHeld");
}
/** One of the false beliefs about this kind of act that they do not hold and have not disproved; which one is a hash of who they are. */
function pickClaim(p: Person, kind: string, lr: Learning, salt: string): Claim | undefined {
  const pool = FOLK.filter((x) => x.domain === kind && x.bias < 0 && !lr.beliefs[x.id] && !lr.refuted.includes(x.id));
  return pool.length ? pool[Math.floor(hash01(`${p.id}|${salt}|${kind}|${Object.keys(lr.beliefs).length}`) * pool.length)] : undefined;
}
/** What befell them was bad: remember it, and (sometimes) find a reason, right or not. Others who watched learn a little from it too. */
export function failedAt(world: World, p: Person, kind: string, watchers = true) {
  const lr = learnOf(p);
  lr.failures[kind] = (lr.failures[kind] ?? 0) + 1;
  tally(world, "failuresLearned");
  if (p.age >= ADULT_AGE && roll(p, `blame-${kind}`) < 0.2) {
    const c = pickClaim(p, kind, lr, "blame");
    if (c) {
      believe(world, p, c.id, 0.6);
      note(p, world, `It went badly. I think it is because ${c.text}.`);
    }
  }
  if (!watchers) return;
  for (const q of world.people) {
    if (q === p || q.age < ADULT_AGE || dist(q, p) > 15 || q.intent?.kind === "sleep") continue;
    const ql = learnOf(q);
    ql.failures[kind] = (ql.failures[kind] ?? 0) + 0.5;
    tally(world, "learnedFromOthersFailure");
    if (roll(q, `see-${kind}`) < 0.08) {
      const c = pickClaim(q, kind, ql, "see");
      if (c) believe(world, q, c.id, 0.5, p.id);
    }
  }
}
/** They tried the thing a belief is about. A true belief is borne out; a false one fails the test about half the time and is dropped when it does. */
export function testBeliefs(world: World, p: Person, kind: string) {
  const lr = learnOf(p);
  for (const [id, held] of Object.entries(lr.beliefs)) {
    const c = claimOf(world, id);
    if (!c || c.domain !== kind) continue;
    if (c.truth) held.conf = clamp01(held.conf + 0.1);
    else if (roll(p, `test-${id}`) < 0.5) refute(world, p, id);
  }
}
/** Evidence against a belief: how far it lowers confidence depends on how attached they are to the old ways. A belief that falls low is dropped. */
export function refute(world: World, p: Person, claimId: string, strength = 0.4) {
  const lr = learnOf(p);
  const held = lr.beliefs[claimId];
  if (!held) return;
  held.conf -= strength * (1.2 - 0.6 * valueOf(p, "tradition"));
  if (held.conf < 0.25) {
    delete lr.beliefs[claimId];
    if (!lr.refuted.includes(claimId)) lr.refuted.push(claimId);
    const c = claimOf(world, claimId);
    note(p, world, `I was wrong: it is not true that ${c?.text ?? claimId}.`);
    tally(world, "beliefsUpdated");
  }
}
/** In conversation: a belief passes from the one who holds it firmly, by trust; and someone who has tested it and found it false says so. */
export function spreadBeliefs(world: World, a: Person, b: Person) {
  for (const [from, to] of [[a, b], [b, a]] as const) {
    const fl = learnOf(from);
    const tl = learnOf(to);
    for (const [id, held] of Object.entries(fl.beliefs)) {
      if (held.conf < 0.5 || tl.beliefs[id]) continue;
      if (tl.refuted.includes(id)) {
        // They have tried it and know it is not so: the one who held it is shaken.
        refute(world, from, id, 0.25);
        continue;
      }
      const trust = relation(to, from.id, world).trust;
      if (roll(from, `spread-${id}`) < (0.1 + 0.5 * trust) * held.conf) {
        const c = claimOf(world, id);
        if (!c) continue;
        tl.beliefs[id] = { conf: 0.4 + 0.3 * trust, from: from.id };
        if (!c.truth) tally(world, "falseBeliefsSpread");
        note(to, world, `${from.name} told me that ${c.text}.`);
        break;
      }
    }
    // Someone who says it is not so persuades those who hold the same.
    for (const id of tl.refuted) if (fl.beliefs[id] && fl.beliefs[id]!.conf < 0.5) refute(world, from, id, 0.15);
  }
}

// ---------------------------------------------------------------- curiosity and words

/** Curiosity by age, as a multiplier: high in a child, falling steadily through life. */
export const ageCuriosity = (age: number) => 0.55 + 1.05 * Math.exp(-Math.max(0, age - 1) / 14);
export const curiosityAt = (p: Person) => clamp01(p.personality.curiosity * ageCuriosity(p.age));
export const ageBand = (age: number) => (age < 12 ? "young" : age < 36 ? "mid" : "old");
/** The rate at which each age band has set out to explore, per person-day, from the tallies kept. */
export function curiosityByAge(world: World): Record<"young" | "mid" | "old", number> {
  const t = world.tally ?? {};
  const rate = (b: string) => ((t[`explore_${b}`] ?? 0) / Math.max(1e-9, (t[`exposure_${b}`] ?? 0) / 1440));
  return { young: rate("young"), mid: rate("mid"), old: rate("old") };
}

export const FIRST_WORDS: Record<string, string> = { water: "wasa", fire: "fiyar", food: "manu", friend: "tomo", child: "kiko", wolf: "vulu", river: "rina", home: "hema" };
const SHIFTS: [string, string][] = [["k", "g"], ["p", "b"], ["t", "d"], ["s", "h"], ["w", "v"], ["f", "p"], ["m", "n"], ["a", "o"], ["i", "e"], ["u", "o"]];
/** One generation's sound change in a word. Always changes it. */
export function soundShift(word: string, salt: string): string {
  const start = Math.floor(hash01(salt) * SHIFTS.length);
  for (let k = 0; k < SHIFTS.length; k++) {
    const [from, to] = SHIFTS[(start + k) % SHIFTS.length]!;
    const at = word.indexOf(from);
    if (at >= 0) return word.slice(0, at) + to + word.slice(at + 1);
  }
  return word.length > 2 ? word.slice(0, -1) : word + "a";
}
export const SOUND_CHANGE = 0.2;
/** A child takes its parents' words (or the common first words), each with a chance of changing slightly. */
export function acquireWords(world: World, child: Person, parents: Person[], change = SOUND_CHANGE) {
  const lore = worldLore(world);
  const words: Record<string, string> = {};
  for (const concept of Object.keys(lore.lexicon)) {
    const from = parents.find((q) => q.learn?.words?.[concept]);
    const heard = from?.learn?.words?.[concept] ?? lore.lexicon[concept]!;
    const changed = hash01(`${child.id}|${concept}|${heard}`) < change;
    words[concept] = changed ? soundShift(heard, `${child.id}|${concept}`) : heard;
    if (changed) tally(world, "wordsShifted");
  }
  learnOf(child).words = words;
}
export const wordFor = (world: World, p: Person, concept: string) => p.learn?.words?.[concept] ?? world.lore?.lexicon[concept] ?? concept;
const editDistance = (a: string, b: string) => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length]![b.length]!;
};
/** How much of one person's vocabulary the other would know: a word counts if it is the same or within one sound of theirs. */
export function understands(world: World, a: Person, b: Person): number {
  const concepts = Object.keys(worldLore(world).lexicon);
  let n = 0;
  for (const c of concepts) {
    const wa = wordFor(world, a, c);
    const wb = wordFor(world, b, c);
    if (wa === wb) n += 1;
    else if (editDistance(wa, wb) <= 1) n += 0.5;
  }
  return n / concepts.length;
}

// ---------------------------------------------------------------- hooks into the mind

/** Called when two people finish talking. */
export function loreTalk(world: World, a: Person, b: Person) {
  tellTale(world, a, b);
  tellTale(world, b, a);
  spreadBeliefs(world, a, b);
  carryKnowledge(world, a, b);
}

/** After an act: failure is remembered (and watched), and the beliefs it tests are tested. */
export function learnAfter(world: World, person: Person, intent: Intent & { snap?: { hunger: number; thirst: number; health: number; mood: number; cold: number } }) {
  if (person.age < ADULT_AGE) return;
  const lr = learnOf(person);
  if (lr.exploreAt && intent.kind === "wander" && intent.x === lr.exploreAt.x && intent.z === lr.exploreAt.z) {
    tally(world, `explore_${ageBand(person.age)}`);
    lr.exploreAt = undefined;
  }
  if (Object.keys(lr.beliefs).length) testBeliefs(world, person, intent.kind);
  if (!intent.snap || !["hunt", "fish", "forage", "plant", "build", "craft", "wash", "steal"].includes(intent.kind)) return;
  const out = (person.mood - intent.snap.mood) * 0.8 - (person.needs.hunger - intent.snap.hunger) * 0.4 - (person.needs.thirst - intent.snap.thirst) * 0.4 + (person.health - intent.snap.health) * 1.5 - (person.cold - intent.snap.cold) * 0.5;
  if (out < -0.06) failedAt(world, person, intent.kind);
}

/** Adds what the learning layer wants to do. Everything here yields to thirst and hunger. */
export function learnOptions(person: Person, world: World, out: Option[]) {
  if (person.age < 1.5) return;
  const y = yieldTo(person);
  if (y <= 0 || person.intent?.kind === "sleep") return;
  const now = world.clock ?? 0;
  const night = (now % 1440) / 1440 > 0.75 || (now % 1440) / 1440 < 0.2;
  if (night) return;
  const lr = learnOf(person);
  // A master turns to teach a pupil who is near.
  if (person.age >= ADULT_AGE && person.needs.energy < 0.7 && now - (lr.lastLesson ?? -1e9) > 0.15 * 1440) {
    for (const q of world.people) {
      const m = q.learn?.master;
      if (!m || m.id !== person.id || dist(q, person) > 40 || q.intent?.kind === "sleep") continue;
      out.push({ intent: { kind: "teach", targetId: q.id, x: q.x, z: q.z, speed: 1.4, remaining: 25 }, score: (0.55 + 0.2 * valueOf(person, "tradition")) * y });
    }
  }
  // A pupil goes to where the master is.
  const m = lr.master;
  const master = m ? personById(world, m.id) : undefined;
  if (master && dist(master, person) > 6 && dist(master, person) < 60) out.push({ intent: { kind: "wander", x: master.x, z: master.z, speed: 1.6, remaining: 4 }, score: 0.45 * y });
  // Curiosity, strong in the young: set out toward something not yet seen.
  const c = curiosityAt(person);
  if (c > 0.45 && person.needs.thirst < 0.5 && person.needs.hunger < 0.55) {
    let best: { x: number; z: number; d: number } | undefined;
    for (const t of world.things) {
      if (person.memory.has(t.id) || (AFFORDANCES[t.kind]?.danger ?? 0) > 0.3) continue;
      const d = dist(t, person);
      if (d < 80 && d > 6 && (!best || d < best.d)) best = { x: t.x, z: t.z, d };
    }
    if (best) {
      lr.exploreAt = { x: best.x, z: best.z };
      out.push({ intent: { kind: "wander", x: best.x, z: best.z, speed: 1.5, remaining: 3 }, score: 0.5 * (c - 0.4) * y });
    }
  }
}
/** Takes away what they may not do (a closed reading, a banned book). */
export function learnFilter(person: Person, world: World, opts: Option[]) {
  if (!world.lore || (!world.lore.restrict.read && !world.lore.banned.length)) return;
  for (let i = opts.length - 1; i >= 0; i--) if (opts[i]!.intent.kind === "read" && !bookAllowed(world, person, "")) opts.splice(i, 1);
}
/** What failure, belief and remembered rules lean them toward. Only when thirst and hunger leave room. */
export function learnBias(person: Person, world: World, opts: Option[]) {
  const lr = person.learn;
  if (!lr || !calm(person)) return;
  const y = yieldTo(person);
  const night = ((world.clock ?? 0) % 1440) / 1440 > 0.75 || ((world.clock ?? 0) % 1440) / 1440 < 0.2;
  const rules = new Map<string, number>();
  for (const [id, v] of Object.entries(lr.tales)) {
    const tale = world.lore?.tales.find((t) => t.id === id);
    const r = tale && v.rule ? RULES[tale.rule] : undefined;
    if (r && (!r.night || night)) rules.set(r.kind, Math.max(rules.get(r.kind) ?? 0, 0.1 * (tale!.form === "myth" ? 1.3 : 1)));
  }
  for (const o of opts) {
    const k = o.intent.kind;
    let d = rules.get(k) ?? 0;
    for (const [id, held] of Object.entries(lr.beliefs)) {
      const c = claimOf(world, id);
      if (c && c.domain === k && held.conf > 0.4) d += c.bias * held.conf;
    }
    if (lr.failures[k]) d -= Math.min(0.2, 0.05 * lr.failures[k]!);
    if (lr.scholar && k === "read") d += 0.15;
    o.score += d * y;
  }
}

/** Hourly: reputations settle, pupils are found and tested, tales are made, books copied, guilds formed, words learned. */
export function learningStep(person: Person, world: World, dt: number) {
  const now = world.clock ?? 0;
  if (Math.floor(now / HOUR) === Math.floor((now - dt) / HOUR)) return;
  const lr = learnOf(person);
  const band = ageBand(person.age);
  tally(world, `exposure_${band}`); // hours; the measure divides by days
  for (const k of Object.keys(lr.failures)) {
    lr.failures[k]! *= 0.93;
    if (lr.failures[k]! < 0.1) delete lr.failures[k];
  }
  for (const s of SKILLS) if (skillOf(person, s) > 0.1) lr.repute[s] = clamp01((lr.repute[s] ?? 0) + (skillOf(person, s) * 0.9 - (lr.repute[s] ?? 0)) * 0.02);
  if (person.ideas?.includes("writing")) lr.literate = true;
  // The words of the household, taken when old enough to speak them.
  if (!lr.words && person.age >= 1) {
    const parents = [person.mother, person.father].map((id) => personById(world, id)).filter((q): q is Person => !!q);
    acquireWords(world, person, parents);
  }
  assignClass(world, person);
  if (person.age < 1.5) return;
  // A master is lost with their death, or the pupil has learned enough to be tested.
  const m = lr.master;
  if (m) {
    const master = personById(world, m.id);
    if (!master) {
      note(person, world, "My master is gone and I must learn the rest alone.");
      lr.master = undefined;
    } else if (skillOf(person, m.skill) >= 0.55 || (m.lessons >= 30 && skillOf(person, m.skill) >= 0.45)) examine(world, master, person);
    else if (m.lessons >= 40 && now - m.since > 20 * 1440) lr.master = undefined; // it is not working
  } else if (person.age >= 2.667 && person.needs.hunger < 0.6 && person.needs.thirst < 0.6 && roll(person, "seek") < 0.08) seekMaster(world, person);
  if (person.age < ADULT_AGE) return;
  // Someone who has lived through danger or want, and has the art for it, makes a tale.
  if (calm(person) && now - (lr.lastTale ?? -1e9) > 2 * 1440 && (world.lore?.tales.length ?? 0) < 60) {
    const exp = lived(world, person);
    const rule = exp ? pickRule(person, exp) : undefined;
    if (rule && roll(person, "compose") < 0.04 + 0.2 * artOf(person)) {
      const r = roll(person, "form");
      composeTale(world, person, rule, r < 0.35 ? "story" : r < 0.65 ? "song" : r < 0.85 ? "proverb" : "myth");
    } else if (world.works?.length) linkWorks(world, person);
  }
  // The guild: those who have mastered one craft close ranks around it.
  const best = roleOf(person);
  if (best && skillOf(person, best.skill) >= 0.7 && valueOf(person, "tradition") > 0.6 && !lr.guild) {
    const g = ((worldLore(world).guilds[best.skill] ??= { members: [], secret: false }));
    if (!g.members.includes(person.id)) g.members.push(person.id);
    lr.guild = best.skill;
    if (g.members.length >= 2 && !g.secret && roll(person, "secret") < 0.3) {
      g.secret = true;
      chronicle(world, `The ${SKILL_WORDS[best.skill].role}s have agreed to keep their craft to themselves.`);
    }
  }
  // A scholar: someone with letters and a mind for it, who copies what is worth keeping.
  if (isLiterate(person) && loreOf(person) >= 0.3) lr.scholar = true;
  if (lr.scholar && world.works?.length && roll(person, "copy") < 0.02) {
    const book = world.works.find((w) => w.kind === "book" && w.at && !w.copyOf && !world.works!.some((c) => c.copyOf === w.id) && dist(person, world.things.find((t) => t.id === w.at) ?? { x: 1e9, z: 1e9 }) < 12);
    if (book) copyBook(world, person, book.id);
  }
}

function seekMaster(world: World, person: Person) {
  const lr = learnOf(person);
  const skill = [...SKILLS].sort((a, b) => (person.talents?.[b] ?? 1) - skillOf(person, b) - ((person.talents?.[a] ?? 1) - skillOf(person, a)))[0]!;
  let best: Person | undefined;
  for (const q of world.people) {
    if (q === person || q.age < ADULT_AGE || dist(q, person) > 60 || reputeOf(q, skill) < 0.4 || skillOf(q, skill) < 0.5) continue;
    if (!best || reputeOf(q, skill) > reputeOf(best, skill)) best = q;
  }
  if (best && !lr.master && skillOf(person, skill) < 0.45) takeApprentice(world, best, person, skill);
}

// ---------------------------------------------------------------- class, closing and censoring, collapse

const whoever = (world: World, id: string | undefined): Person | undefined => (id ? (personById(world, id) ?? world.dead?.find((d) => d.person.id === id)?.person) : undefined);
/** Whether someone belongs to the elite on their own account: a rank held, or the wealth of an owner. */
export const eliteBy = (world: World, q: Person): boolean => q.learn?.class === "elite" || rankOf(world, q) >= 0.5 || q.econ?.class === "owner";
/**
 * Nobody is born into a class by decree: a child takes its parents' (the elite if either parent is, by rank or inherited wealth, with a
 * chance of falling out of it), and a grown person with no known parents, or a commoner who has risen to rank or ownership, is judged by
 * their own. Runs hourly; a class once held is kept unless a commoner rises.
 */
export function assignClass(world: World, p: Person) {
  const lr = learnOf(p);
  if (p.age < 1 || lr.class === "elite") return;
  const parents = [whoever(world, p.mother), whoever(world, p.father)].filter((q): q is Person => !!q);
  if (!lr.class) {
    const elite = parents.length ? parents.some((q) => eliteBy(world, q)) && hash01(`${p.id}|class`) < 0.9 : p.age >= ADULT_AGE && eliteBy(world, p);
    if (!parents.length && p.age < ADULT_AGE) return;
    lr.class = elite ? "elite" : "common";
    tally(world, elite ? "classElite" : "classCommon");
    if (elite && parents.length) tally(world, "classInherited");
  } else if (p.age >= ADULT_AGE && eliteBy(world, p)) {
    lr.class = "elite";
    tally(world, "classRisen");
  }
}
/**
 * Closing is done by those with the say: where the leader is of the elite and holds to the old ways, the lettered elite keep reading to
 * themselves, and a craft whose masters are all of one sex is no longer taught to the other. Only teaching is closed, never doing.
 */
export function closeAccess(world: World, leader: Person) {
  const lore = worldLore(world);
  if (valueOf(leader, "tradition") < 0.55 || !eliteBy(world, leader)) return;
  const adults = world.people.filter((q) => q.age >= ADULT_AGE);
  if (!lore.restrict.read && knows(world, "writing") && adults.filter((q) => q.learn?.class === "elite" && isLiterate(q)).length >= 2 && adults.some((q) => q.learn?.class === "common" && !isLiterate(q))) {
    lore.restrict.read = { class: "elite" };
    tally(world, "readingClosed");
    chronicle(world, `${leader.name} and the lettered kept reading to themselves.`);
  }
  for (const s of SKILLS) {
    if (lore.restrict[`skill:${s}`]) continue;
    const masters = adults.filter((q) => q.learn?.initiated.includes(s));
    if (masters.length < 3) continue;
    const sex = masters[0]!.sex;
    if (masters.every((q) => q.sex === sex)) {
      lore.restrict[`skill:${s}`] = { sex };
      tally(world, "craftsClosedBySex");
      chronicle(world, `${SKILL_WORDS[s].doing} came to be taught only to ${sex === "f" ? "women" : "men"}.`);
    }
  }
}
/**
 * An authority forbids a work it distrusts: a priest the work of the rival faith's side, a leader of the old ways any book of ideas the people
 * did not have. At most one ban a quarter-year; returns what was banned.
 */
export function banWorks(world: World, authority: Person, role: "priest" | "leader", rivalFaith?: Record<string, string>): string | undefined {
  const lore = worldLore(world);
  const now = world.clock ?? 0;
  if (now - (lore.lastBan ?? -1e9) < 4 * 1440) return undefined;
  for (const w of world.works ?? []) {
    if (lore.banned.includes(w.id) || w.kind === "painting" || w.by === authority.id || (w.kind === "book" && !w.at)) continue;
    const author = whoever(world, w.by);
    let bad = false;
    if (role === "priest") bad = !!author && Object.entries(author.faith ?? {}).some(([q, t]) => authority.faith?.[q] && authority.faith[q] !== t) && hash01(`${authority.id}|ban|${w.id}`) < 0.5;
    else bad = valueOf(authority, "tradition") >= 0.7 && w.kind === "book" && (w.knows ?? []).some((i) => !authority.ideas?.includes(i)) && hash01(`${authority.id}|ban|${w.id}`) < 0.3;
    void rivalFaith;
    if (!bad) continue;
    lore.lastBan = now;
    censor(world, w.id);
    tally(world, role === "priest" ? "bannedByPriest" : "bannedByLeader");
    note(authority, world, `I forbade "${w.title}".`);
    return w.id;
  }
  return undefined;
}
/**
 * The hard years: many deaths in a quarter-year, or a severe epidemic across the people, makes them lose what they knew (and libraries
 * burn when it is bad enough). Once a year at most. Returns the ideas lost, or undefined when nothing befell.
 */
export function collapseWatch(world: World): string[] | undefined {
  const lore = worldLore(world);
  const now = world.clock ?? 0;
  const YEAR_SEC = 16 * 1440;
  if (now - (lore.lastCollapse ?? -1e9) < YEAR_SEC) return undefined;
  const alive = world.people.length;
  const died = (world.dead ?? []).filter((d) => now - d.t < YEAR_SEC / 4).length;
  const share = died / Math.max(1, alive + died);
  const epi = world.world2?.epidemic;
  const sick = world.people.filter((q) => q.illness || q.body?.sickWith).length / Math.max(1, alive);
  const plague = !!epi && epi.severity >= 0.55 && sick >= 0.3;
  if (!((died >= 5 && share >= 0.25) || plague)) return undefined;
  lore.lastCollapse = now;
  const severity = Math.min(0.8, 0.1 + 0.6 * share + (plague ? 0.15 : 0));
  tally(world, "collapses");
  chronicle(world, plague ? `The sickness took so many that much was forgotten.` : `So many died that the old ways were half forgotten.`);
  return collapse(world, severity);
}
