// Society: the things a people does together that no one of them does alone.
//
//  GROUPS hold a people's shared state (leader, council, laws, taboos, priest, customs, dialect, a camp). Everyone starts in "main".
//  LEADERS emerge from status (trust, skill, age, inherited rank); a council of the next-highest advises; on a death the heir is the
//  leader's eldest adult child (rank is inherited), else the council's first.
//  LAWS are customs the council has voted into rule. A theft where there is a law is a CASE; a judge (not a party) weighs the witnesses
//  and rules: guilty (repay), pardoned (starving), or dismissed. TABOOS are sacred prohibitions a priest declares.
//  RITES come at an age (naming, adulthood) or an event (a wedding, a funeral), in the custom of the group. FESTIVALS fall on the first
//  day of each season, in the evening, and the people gather.
//  FEUDS are between houses (a patrilineal line) and are inherited by those born into them; ALLIANCES form between houses that marry
//  and befriend. RELIGION has a priest (the most faithful and trusted) who speaks at festivals, and a SCHISM when a question has two
//  answers each held by several; a schism, or a feud, can SPLIT the group: the smaller side goes to a camp of its own, takes a sample
//  of the customs with it (a founder effect), and then drifts on its own, so the two come to differ in customs and words.
// Chances come from a hash of who, when and what, never from a person's own random stream, so adding this shifts no other choice.
import { DAY, hourOf, seasonAt, YEAR } from "./earth";
import { feel } from "./inner";
import { valueOf } from "./identity";
import { faithful, loreOf, QUESTIONS } from "./culture";
import { isCustom, NORM_TEXT, reinforce, standing } from "./norms";
import { lifeOf } from "./lifecycle";
import { ADULT_AGE, chronicle, note, relation, tally, type Intent, type Person, type World } from "./mind";
import { judge, sawFact } from "./mindmodel";
import { joyFrom } from "./heart";

type Option = { intent: Omit<Intent, "arrived">; score: number; reason?: string };

// ---- State ----

export interface Law { norm: string; text: string; since: number; rulings: number }
export interface Taboo { what: "work-on-festival"; text: string; by: string; since: number }
export interface Group {
  id: string;
  name: string;
  since: number;
  leader?: string;
  council: string[];
  laws: Law[];
  taboos: Taboo[];
  priest?: string;
  rivalPriest?: string;
  customs: Record<string, number>; // custom or word -> which variant this people uses (see VARIANTS)
  camp?: { x: number; z: number };
  founders: string[];
  parent?: string;
}
export interface Case { id: string; group: string; accused: string; victim: string; kind: "theft"; filed: number; norm: string; starving: boolean; factId?: string; state: "open" | "ruled"; verdict?: "guilty" | "pardoned" | "dismissed"; judge?: string; ruling?: string }
export interface Feud { a: string; b: string; heat: number; since: number; cause: string; announced?: boolean }
export interface Alliance { a: string; b: string; since: number }
export interface Schism { group: string; question: string; sides: [string, string]; since: number; heat: number }
export interface Festival { name: string; group: string; year: number; season: number; attended: number; by?: string }
export interface Society {
  groups: Record<string, Group>;
  cases: Case[];
  feuds: Feud[];
  alliances: Alliance[];
  schisms: Schism[];
  festivals: Festival[];
  funerals: string[]; // ids of the dead whose funeral has been held
  healed: string[]; // pairs whose marriage has already eased a feud
  lastSplit?: number;
}

/** The ways a custom or a word can go. Which one a group uses is an index; two groups differ where the indexes differ. */
export const VARIANTS: Record<string, string[]> = {
  wedding: ["garlands are exchanged", "hands are bound with grass", "one bowl is shared between them", "the pair run together to the river"],
  funeral: ["the dead is buried beneath the tree and their name sung", "stones are heaped on the grave", "water is poured out at the grave", "a night-long vigil is kept by the fire"],
  adulthood: ["a mark of ochre is painted", "a night is kept alone", "a spear or basket is given", "a new name is given"],
  naming: ["the child is shown to the sky", "the child is dipped in the river", "the elders each give a gift", "the name is sung three times"],
  "festival:0": ["the Waking", "the Greening", "the First Rain"],
  "festival:1": ["the Long Light", "the High Sun", "the Warm Feast"],
  "festival:2": ["the Gathering", "the Harvest Round", "the Fruiting"],
  "festival:3": ["the Longest Night", "the Fire Feast", "the Deep Cold"],
  "word:water": ["ama", "ahm", "anu", "emi"],
  "word:food": ["tol", "tel", "dol", "tuul"],
  "word:fire": ["kesh", "kes", "gesh", "kiish"],
  "word:friend": ["miro", "mira", "niro", "miru"],
  "word:hello": ["hai-o", "hei", "ya-ho", "sala"],
  "word:dead": ["urn", "orn", "uur", "arne"],
};
export const customKeys = () => Object.keys(VARIANTS);
const SEASON_NAMES = ["spring", "summer", "autumn", "winter"];

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const dist = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);
const hash01 = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
};
const chanceAt = (world: World, salt: string, bucket: number) => hash01(`${salt}|${Math.floor((world.clock ?? 0) / bucket)}`);
const ticks = (world: World, dt: number, period: number) => Math.floor((world.clock ?? 0) / period) !== Math.floor(((world.clock ?? 0) - dt) / period);

export const societyOf = (world: World): Society => (world.society ??= { groups: {}, cases: [], feuds: [], alliances: [], schisms: [], festivals: [], funerals: [], healed: [] });
export const groupId = (p: Person) => p.group ?? "main";
export function groupOf(world: World, id: string): Group {
  const s = societyOf(world);
  return (s.groups[id] ??= { id, name: id === "main" ? "the first people" : id, since: world.clock ?? 0, council: [], laws: [], taboos: [], customs: Object.fromEntries(customKeys().map((k) => [k, 0])), founders: [] });
}
export const membersOf = (world: World, id: string) => world.people.filter((p) => groupId(p) === id);
const adultsOf = (world: World, id: string) => membersOf(world, id).filter((p) => p.age >= ADULT_AGE);
const person = (world: World, id: string | undefined) => (id ? world.people.find((p) => p.id === id) : undefined);
const anyone = (world: World, id: string | undefined) => (id ? (world.people.find((p) => p.id === id) ?? world.dead?.find((d) => d.person.id === id)?.person) : undefined);

/** What this people calls a custom or word, in words. */
export const customText = (world: World, g: Group | string, key: string) => {
  const grp = typeof g === "string" ? groupOf(world, g) : g;
  const list = VARIANTS[key]!;
  return list[(grp.customs[key] ?? 0) % list.length]!;
};

// ---- Houses, rank, status ----

/** A person's house: the oldest man or woman of their father's line known to the people (their own id if none). */
export function houseOf(world: World, p: Person): string {
  let cur = p;
  for (let i = 0; i < 12; i++) {
    const up = anyone(world, cur.father) ?? anyone(world, cur.mother);
    if (!up) break;
    cur = up;
  }
  return cur.id;
}
/** Rank is inherited: one's own, or four-fifths of the higher of the parents'. */
export function rankOf(world: World, p: Person, depth = 0): number {
  const own = p.rank ?? 0;
  if (depth > 3) return own;
  const f = anyone(world, p.father), m = anyone(world, p.mother);
  return Math.max(own, 0.8 * Math.max(f ? rankOf(world, f, depth + 1) : 0, m ? rankOf(world, m, depth + 1) : 0));
}
/** How much weight a person carries: the others' trust, what they can do, age, faith and the rank they were born to. */
export function statusOf(world: World, p: Person): number {
  const skill = Math.max(0, ...Object.values(p.skills ?? {}));
  const wise = Math.min(1, p.age / 30) * (p.age > 55 ? 0.7 : 1);
  return 0.45 * standing(world, p) + 0.2 * clamp01(skill) + 0.15 * wise + 0.12 * rankOf(world, p) + 0.08 * clamp01(faithful(p));
}

// ---- The step ----

export function societyStep(world: World, dt: number) {
  if (world.people.length < 2) return;
  const s = societyOf(world);
  funerals(world, s);
  for (const g of Object.keys(groupsPresent(world))) {
    const grp = groupOf(world, g);
    if (grp.leader && !person(world, grp.leader)) succeed(world, grp);
  }
  if (ticks(world, dt, 300)) {
    for (const g of Object.keys(groupsPresent(world))) {
      const grp = groupOf(world, g);
      chooseLeaders(world, grp);
      enactLaws(world, grp);
      choosePriest(world, grp);
      tabooStep(world, grp);
    }
    rites(world);
    rulings(world);
    feudStep(world, 300);
    schismStep(world, 300);
    splitStep(world);
  }
  if (ticks(world, dt, 60)) festivalStep(world);
  if (ticks(world, dt, DAY / 4)) driftStep(world);
}
const groupsPresent = (world: World) => {
  const out: Record<string, number> = {};
  for (const p of world.people) out[groupId(p)] = (out[groupId(p)] ?? 0) + 1;
  return out;
};

// ---- Leaders, council, succession ----

function chooseLeaders(world: World, g: Group) {
  const adults = adultsOf(world, g.id).filter((p) => p.age < 62);
  if (adults.length < 3) return;
  const ranked = adults.map((p) => ({ p, s: statusOf(world, p) })).sort((a, b) => b.s - a.s);
  const cur = person(world, g.leader);
  const curS = cur ? statusOf(world, cur) : -1;
  const best = ranked[0]!;
  if (!cur || (best.p !== cur && best.s > curS + 0.1)) {
    g.leader = best.p.id;
    best.p.rank = Math.max(best.p.rank ?? 0, 0.6);
    chronicle(world, `${best.p.name} came to lead ${g.name}${cur ? `, in place of ${cur.name}` : ""}.`);
    note(best.p, world, "The others look to me to lead.");
    tally(world, "leaders");
  }
  g.council = adults.length >= 5 ? ranked.filter((r) => r.p.id !== g.leader).slice(0, 3).map((r) => r.p.id) : [];
  for (const id of g.council) {
    const c = person(world, id)!;
    c.rank = Math.max(c.rank ?? 0, 0.35);
  }
}
/** The leader is gone: the eldest adult child who is of the same people takes their place; else the first of the council; else the strongest. */
function succeed(world: World, g: Group) {
  const gone = anyone(world, g.leader)!;
  const adults = adultsOf(world, g.id);
  const kids = adults.filter((p) => p.father === g.leader || p.mother === g.leader).sort((a, b) => b.age - a.age);
  const councillor = g.council.map((id) => person(world, id)).find((p): p is Person => !!p && p.age >= ADULT_AGE);
  const heir = kids[0] ?? councillor ?? adults.map((p) => ({ p, s: statusOf(world, p) })).sort((a, b) => b.s - a.s)[0]?.p;
  g.leader = heir?.id;
  g.council = g.council.filter((id) => id !== heir?.id && person(world, id));
  if (!heir) return;
  heir.rank = Math.max(heir.rank ?? 0, 0.6);
  chronicle(world, `${heir.name} followed ${gone?.name ?? "the leader"} as leader${kids[0] === heir ? ", as their child" : councillor === heir ? ", chosen by the council" : ""}.`);
  tally(world, kids[0] === heir ? "successionsByBlood" : "successions");
}

// ---- Laws, cases, judging ----

const ENFORCEABLE = ["share", "fair"]; // the norms whose breach (taking another's food) can be seen and judged
function enactLaws(world: World, g: Group) {
  if (!g.leader || g.council.length < 2) return;
  for (const norm of Object.keys(NORM_TEXT)) {
    if (g.laws.some((l) => l.norm === norm) || !isCustom(world, norm as keyof typeof NORM_TEXT) || (world.norms?.[norm]?.strength ?? 0) < 0.65) continue;
    const voters = [g.leader, ...g.council].map((id) => person(world, id)).filter((p): p is Person => !!p);
    const yes = voters.filter((v) => valueOf(v, "freedom") < 0.75).length;
    if (yes * 2 <= voters.length) continue;
    g.laws.push({ norm, text: NORM_TEXT[norm as keyof typeof NORM_TEXT]!, since: world.clock ?? 0, rulings: 0 });
    chronicle(world, `The council of ${g.name} made it law: ${NORM_TEXT[norm as keyof typeof NORM_TEXT]}.`);
    tally(world, "laws");
  }
}
/** Called when someone takes food from another. Where a law covers it, it becomes a case for the judge. */
export function onTheft(world: World, thief: Person, victim: Person, factId?: string) {
  const g = groupOf(world, groupId(victim));
  grievance(world, thief, victim, 0.25, `${thief.name} took food from ${victim.name}`);
  const law = g.laws.find((l) => ENFORCEABLE.includes(l.norm));
  if (!law) return;
  factId ??= [...(world.facts ?? [])].reverse().find((f) => f.kind === "theft" && f.by === thief.id && f.to === victim.id)?.id;
  const s = societyOf(world);
  s.cases.push({ id: `case-${s.cases.length}`, group: g.id, accused: thief.id, victim: victim.id, kind: "theft", filed: world.clock ?? 0, norm: law.norm, starving: thief.needs.hunger > 0.85, factId, state: "open" });
  tally(world, "casesFiled");
}
/** Who sits in judgement: the leader, unless they are a party or close kin to one, then a councillor, then the most trusted adult. */
export function judgeFor(world: World, g: Group, accused: Person, victim: Person): Person | undefined {
  const free = (p: Person | undefined) => !!p && p.id !== accused.id && p.id !== victim.id && p.age >= ADULT_AGE && houseOf(world, p) !== houseOf(world, accused) && houseOf(world, p) !== houseOf(world, victim);
  const order = [person(world, g.leader), ...g.council.map((id) => person(world, id)), ...adultsOf(world, g.id).sort((a, b) => statusOf(world, b) - statusOf(world, a))];
  return order.find(free) ?? order.find((p) => !!p && p.id !== accused.id && p.id !== victim.id);
}
function rulings(world: World) {
  const s = societyOf(world);
  const now = world.clock ?? 0;
  for (const c of s.cases) {
    if (c.state !== "open" || now - c.filed < 600) continue; // the judge takes time to hear it
    const g = groupOf(world, c.group);
    const accused = anyone(world, c.accused), victim = anyone(world, c.victim);
    const jd = accused && victim ? judgeFor(world, g, accused, victim) : undefined;
    if (!accused || !victim || !jd) { c.state = "ruled"; c.verdict = "dismissed"; c.ruling = "no one could hear it"; continue; }
    const witnesses = world.people.filter((q) => q.id !== accused.id && q.id !== victim.id && c.factId && sawFact(q, c.factId)).length;
    const { weight, reason } = judge(world, jd, accused, "theft");
    const proof = 0.45 + 0.2 * Math.min(2, witnesses) + (victim.carry.food < 1 ? 0.05 : 0);
    c.judge = jd.id;
    const law = g.laws.find((l) => l.norm === c.norm);
    if (law) law.rulings++;
    if (proof * weight < 0.5) {
      c.verdict = "dismissed";
      c.ruling = `${jd.name} found too little proof against ${accused.name} (${reason})`;
      grievance(world, victim, accused, 0.15, "a theft the judge let go");
    } else if (c.starving) {
      c.verdict = "pardoned";
      c.ruling = `${jd.name} ruled ${accused.name} took it from hunger, and the people must see no one starves`;
      relation(victim, accused.id, world).trust = Math.min(1, relation(victim, accused.id, world).trust + 0.15);
    } else {
      c.verdict = "guilty";
      c.ruling = `${jd.name} ruled ${accused.name} guilty and bound to repay ${victim.name}`;
      if (accused.carry.food >= 1 && victim.carry.food < 6) { accused.carry.food -= 1; victim.carry.food += 1; }
      else (accused.favours ??= {})[victim.id] = ((accused.favours ??= {})[victim.id] ?? 0) - 1;
      feel(accused, "shame", 0.4);
      note(accused, world, `${jd.name} judged me for taking ${victim.name}'s food.`);
      reinforce(world, c.norm as never, jd, 0.05);
    }
    c.state = "ruled";
    jd.rank = Math.max(jd.rank ?? 0, 0.4);
    chronicle(world, `${c.ruling}.`);
    tally(world, `rulings_${c.verdict}`);
  }
  if (s.cases.length > 80) s.cases.splice(0, s.cases.length - 80);
}

// ---- Taboos and religion ----

function tabooStep(world: World, g: Group) {
  const priest = person(world, g.priest);
  if (!priest || g.taboos.some((t) => t.what === "work-on-festival") || societyOf(world).festivals.filter((f) => f.group === g.id).length < 2) return;
  g.taboos.push({ what: "work-on-festival", text: `no one works on ${customText(world, g, "festival:0")} and the other feast days`, by: priest.id, since: world.clock ?? 0 });
  chronicle(world, `${priest.name} declared a taboo: ${g.taboos[g.taboos.length - 1]!.text}.`);
  tally(world, "taboos");
}
/** The priest: the most faithful and trusted adult, where at least three hold some answer to a big question. */
function choosePriest(world: World, g: Group) {
  const adults = adultsOf(world, g.id);
  if (adults.filter((p) => faithful(p) > 0).length < 3) return;
  const score = (p: Person) => 0.5 * faithful(p) + 0.3 * standing(world, p) + 0.2 * loreOf(p);
  const best = adults.filter((p) => faithful(p) >= 0.4).sort((a, b) => score(b) - score(a))[0];
  const cur = person(world, g.priest);
  if (!best || (cur && best !== cur && score(best) < score(cur) + 0.15)) return;
  if (best === cur) return;
  g.priest = best.id;
  best.rank = Math.max(best.rank ?? 0, 0.3);
  chronicle(world, `${best.name} became the priest of ${g.name}.`);
  note(best, world, "The others come to me with their questions about the Creator and the dead.");
  tally(world, "priests");
}
/** Two answers to the same question, each held by two or more in the group: a schism, with a priest for each side. */
function schismStep(world: World, dt: number) {
  const s = societyOf(world);
  for (const gid of Object.keys(groupsPresent(world))) {
    const g = groupOf(world, gid);
    const adults = adultsOf(world, gid);
    for (const q of QUESTIONS) {
      const held: Record<string, Person[]> = {};
      for (const p of adults) { const t = p.faith?.[q.id]; if (t) (held[t] ??= []).push(p); }
      const sides = Object.entries(held).filter(([, ps]) => ps.length >= 2).sort((a, b) => b[1].length - a[1].length);
      const existing = s.schisms.find((x) => x.group === gid && x.question === q.id);
      if (sides.length >= 2 && !existing) {
        s.schisms.push({ group: gid, question: q.id, sides: [sides[0]![0], sides[1]![0]], since: world.clock ?? 0, heat: 0.2 });
        const rival = sides[1]![1].sort((a, b) => faithful(b) - faithful(a))[0]!;
        g.rivalPriest = rival.id;
        rival.rank = Math.max(rival.rank ?? 0, 0.3);
        const tenets = world.tenets ?? [];
        chronicle(world, `The people of ${g.name} split in belief over "${q.asked}": ${sides[0]![1].length} hold that ${tenets.find((t) => t.id === sides[0]![0])?.text ?? "one answer"} and ${sides[1]![1].length} that ${tenets.find((t) => t.id === sides[1]![0])?.text ?? "another"}`);
        tally(world, "schisms");
      } else if (existing && sides.length < 2) {
        s.schisms.splice(s.schisms.indexOf(existing), 1);
        g.rivalPriest = undefined;
        chronicle(world, `The dispute over "${q.asked}" ended among ${g.name}.`);
      } else if (existing) {
        existing.heat = clamp01(existing.heat + dt / (8 * DAY));
        const a = held[existing.sides[0]] ?? [], b = held[existing.sides[1]] ?? [];
        for (const x of a) for (const y of b) {
          const r = relation(x, y.id, world), r2 = relation(y, x.id, world);
          r.affinity = Math.max(-1, r.affinity - 0.003 * existing.heat);
          r2.affinity = Math.max(-1, r2.affinity - 0.003 * existing.heat);
        }
      }
    }
  }
}

// ---- Rites, funerals, festivals ----

function attendees(world: World, at: Person, radius = 40) {
  return world.people.filter((q) => q !== at && q.age >= 1 && dist(q.x, q.z, at.x, at.z) < radius);
}
function hold(world: World, p: Person, rite: string, text: string, bonus = 0.4) {
  const g = groupOf(world, groupId(p));
  const priest = person(world, g.priest);
  const near = attendees(world, p);
  (p.rites ??= []).push(rite);
  joyFrom(p, world, "ritual", bonus + (priest && near.includes(priest) ? 0.15 : 0));
  for (const q of near) joyFrom(q, world, "ritual", 0.15);
  note(p, world, text);
  chronicle(world, text);
  tally(world, `rites_${rite}`);
  return near.length;
}
function rites(world: World) {
  for (const p of world.people) {
    const g = groupOf(world, groupId(p));
    const done = p.rites ?? [];
    if (p.age >= 0.5 && !done.includes("naming") && attendees(world, p).length >= 2) hold(world, p, "naming", `${p.name} was named: ${customText(world, g, "naming")}.`, 0.1);
    if (p.age >= ADULT_AGE && !done.includes("adulthood") && attendees(world, p).length >= 2) hold(world, p, "adulthood", `${p.name} came of age among ${g.name}: ${customText(world, g, "adulthood")}.`, 0.5);
    const partner = lifeOf(p).partner;
    if (partner && !done.includes("wedding") && attendees(world, p).length >= 2) {
      const mate = person(world, partner);
      hold(world, p, "wedding", `${p.name} and ${mate?.name ?? "their partner"} were wed: ${customText(world, g, "wedding")}.`, 0.5);
      if (mate && !(mate.rites ??= []).includes("wedding")) mate.rites.push("wedding");
    }
  }
}
function funerals(world: World, s: Society) {
  for (const d of world.dead ?? []) {
    if (s.funerals.includes(d.person.id)) continue;
    s.funerals.push(d.person.id);
    const g = groupOf(world, groupId(d.person));
    const mourners = world.people.filter((q) => dist(q.x, q.z, d.person.x, d.person.z) < 40 && q.age >= 1);
    if (!mourners.length) continue;
    const priest = person(world, g.priest);
    const tenet = (world.tenets ?? []).find((t) => t.id === d.person.faith?.death);
    for (const q of mourners) {
      q.grief = Math.max(0, (q.grief ?? 0) - (priest && mourners.includes(priest) ? 0.22 : 0.12));
      joyFrom(q, world, "ritual", 0.1);
    }
    chronicle(world, `${d.person.name} was laid to rest by ${mourners.length}: ${customText(world, g, "funeral")}${tenet ? `, for they believed: ${tenet.text}` : ""}.`);
    tally(world, "funerals");
  }
}
/** Which feast, if any, falls on this day: the first day of each season. */
export function festivalOn(world: World, clock = world.clock ?? 0): { season: number; name: (g: Group) => string } | undefined {
  const { season, dayOfYear } = seasonAt(clock);
  if (dayOfYear % 4 !== 0) return undefined;
  return { season, name: (g) => customText(world, g, `festival:${season}`) };
}
/** The calendar: each feast with the day of the year it falls on. */
export function calendar(world: World, groupName = "main") {
  const g = groupOf(world, groupName);
  return [0, 1, 2, 3].map((season) => ({ day: season * 4, season: SEASON_NAMES[season]!, name: customText(world, g, `festival:${season}`) }));
}
const place = (world: World, g: Group) => {
  if (g.camp) return g.camp;
  const fire = world.things.find((t) => t.kind === "campfire");
  if (fire) return { x: fire.x, z: fire.z };
  const ms = membersOf(world, g.id);
  return { x: ms.reduce((a, p) => a + p.x, 0) / ms.length, z: ms.reduce((a, p) => a + p.z, 0) / ms.length };
};
const evening = (world: World) => { const h = hourOf(world.clock ?? 0); return h >= 16.5 && h < 21; };
function festivalStep(world: World) {
  const fest = festivalOn(world);
  if (!fest || hourOf(world.clock ?? 0) < 20) return;
  const s = societyOf(world);
  const year = Math.floor((world.clock ?? 0) / YEAR);
  for (const gid of Object.keys(groupsPresent(world))) {
    const g = groupOf(world, gid);
    const name = fest.name(g);
    if (s.festivals.some((f) => f.group === gid && f.year === year && f.season === fest.season)) continue;
    const at = place(world, g);
    const there = membersOf(world, gid).filter((p) => p.age >= 1 && dist(p.x, p.z, at.x, at.z) < 18);
    s.festivals.push({ name, group: gid, year, season: fest.season, attended: there.length, by: g.priest });
    if (there.length < 2) continue;
    for (const p of there) { joyFrom(p, world, "celebration", 0.4); joyFrom(p, world, "ritual", 0.2); }
    const priest = person(world, g.priest);
    if (priest && there.includes(priest)) {
      // The priest speaks: those present who hold no answer take the priest's.
      for (const p of there) for (const [q, t] of Object.entries(priest.faith ?? {})) if (p !== priest && p.age >= ADULT_AGE && !p.faith?.[q] && chanceAt(world, `${p.id}|sermon|${q}`, DAY) < 0.5) { (p.faith ??= {})[q] = t; tally(world, "sermonsTaken"); }
      tally(world, "sermons");
    }
    chronicle(world, `${there.length} of ${g.name} kept ${name}${priest && there.includes(priest) ? `, with ${priest.name} speaking` : ""}.`);
    tally(world, "festivals");
  }
}

// ---- Feuds and alliances ----

/** A wrong done by one person to another: between houses it feeds a feud, and the allies of each side are drawn in. */
export function grievance(world: World, doer: Person, wronged: Person, amount: number, cause: string) {
  const a = houseOf(world, doer), b = houseOf(world, wronged);
  if (a === b) return;
  const s = societyOf(world);
  const add = (x: string, y: string, amt: number) => {
    let f = s.feuds.find((q) => (q.a === x && q.b === y) || (q.a === y && q.b === x));
    if (!f) s.feuds.push((f = { a: x, b: y, heat: 0, since: world.clock ?? 0, cause }));
    f.heat = clamp01(f.heat + amt);
    if (f.heat >= 0.5 && !f.announced) {
      f.announced = true;
      chronicle(world, `A feud began between the house of ${anyone(world, f.a)?.name ?? f.a} and the house of ${anyone(world, f.b)?.name ?? f.b}: ${cause}.`);
      tally(world, "feuds");
    }
  };
  add(a, b, amount);
  for (const al of s.alliances) {
    const ally = al.a === b ? al.b : al.b === b ? al.a : undefined; // an ally of the wronged takes up the quarrel
    if (ally && ally !== a) add(a, ally, amount / 2);
  }
}
export const feudsOf = (world: World, p: Person) => societyOf(world).feuds.filter((f) => f.heat >= 0.5 && (f.a === houseOf(world, p) || f.b === houseOf(world, p)));
function feudStep(world: World, dt: number) {
  const s = societyOf(world);
  const living = world.people;
  const houses = new Map<string, Person[]>();
  for (const p of living) { const h = houseOf(world, p); (houses.get(h) ?? houses.set(h, []).get(h)!).push(p); }
  // A marriage across the line eases the feud; a grudge unrenewed cools over years.
  for (const p of living) {
    const mate = person(world, lifeOf(p).partner);
    if (!mate || p.id > mate.id) continue;
    const key = `${p.id}|${mate.id}`;
    const a = houseOf(world, p), b = houseOf(world, mate);
    if (a === b || s.healed.includes(key)) continue;
    s.healed.push(key);
    const f = s.feuds.find((q) => (q.a === a && q.b === b) || (q.a === b && q.b === a));
    if (f) { f.heat = Math.max(0, f.heat - 0.5); chronicle(world, `The marriage of ${p.name} and ${mate.name} eased the feud between their houses.`); tally(world, "feudsEased"); }
  }
  for (const f of s.feuds) {
    f.heat = Math.max(0, f.heat - dt / (2 * YEAR));
    // The feud is inherited: everyone of either house, born before or after, is cooler to the other.
    if (f.heat >= 0.3) for (const p of houses.get(f.a) ?? []) for (const q of houses.get(f.b) ?? []) {
      const r = relation(p, q.id, world), r2 = relation(q, p.id, world);
      r.affinity = Math.max(-1, r.affinity - 0.01 * f.heat);
      r2.affinity = Math.max(-1, r2.affinity - 0.01 * f.heat);
    }
  }
  s.feuds = s.feuds.filter((f) => f.heat >= 0.05);
  // Alliances: two houses with a marriage between them, or several warm friendships, and no feud.
  for (const [a, as] of houses) for (const [b, bs] of houses) {
    if (a >= b || s.alliances.some((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a)) || s.feuds.some((f) => f.heat >= 0.3 && ((f.a === a && f.b === b) || (f.a === b && f.b === a)))) continue;
    const married = as.some((p) => bs.some((q) => lifeOf(p).partner === q.id));
    let warm = 0;
    for (const p of as) for (const q of bs) if ((p.relations.get(q.id)?.affinity ?? 0) > 0.6 && (q.relations.get(p.id)?.affinity ?? 0) > 0.6) warm++;
    if (!married && warm < 3) continue;
    s.alliances.push({ a, b, since: world.clock ?? 0 });
    chronicle(world, `The house of ${anyone(world, a)?.name ?? a} and the house of ${anyone(world, b)?.name ?? b} became allies${married ? " through a marriage" : ""}.`);
    tally(world, "alliances");
  }
  for (const al of s.alliances) for (const p of houses.get(al.a) ?? []) for (const q of houses.get(al.b) ?? []) {
    const r = relation(p, q.id, world);
    r.affinity = Math.min(1, r.affinity + 0.003);
  }
}

// ---- Splitting, founders, drift ----

/** A schism or a feud inside a group with enough adults on each side: the smaller side leaves for a camp of its own. */
function splitStep(world: World) {
  const s = societyOf(world);
  const now = world.clock ?? 0;
  if (s.lastSplit !== undefined && now - s.lastSplit < YEAR / 2) return;
  for (const gid of Object.keys(groupsPresent(world))) {
    const adults = adultsOf(world, gid);
    if (adults.length < 6) continue;
    let leaving: Person[] | undefined;
    let why = "";
    const sc = s.schisms.find((x) => x.group === gid && x.heat >= 0.6);
    if (sc) {
      const sides = sc.sides.map((t) => adults.filter((p) => Object.values(p.faith ?? {}).includes(t)));
      leaving = sides[0]!.length <= sides[1]!.length ? sides[0] : sides[1];
      why = "a difference in belief";
    } else {
      const f = s.feuds.find((x) => x.heat >= 0.7 && adults.some((p) => houseOf(world, p) === x.a) && adults.some((p) => houseOf(world, p) === x.b));
      if (f) {
        const a = adults.filter((p) => houseOf(world, p) === f.a), b = adults.filter((p) => houseOf(world, p) === f.b);
        leaving = a.length <= b.length ? a : b;
        why = "a feud";
      }
    }
    if (!leaving || leaving.length < 3 || leaving.length > adults.length - 3) continue;
    const kin = world.people.filter((p) => p.age < ADULT_AGE && leaving!.some((l) => p.mother === l.id || p.father === l.id));
    split(world, groupOf(world, gid), [...leaving, ...kin], why);
    return;
  }
}
export function split(world: World, from: Group, going: Person[], why: string): Group {
  const s = societyOf(world);
  const n = Object.keys(s.groups).length;
  const g = groupOf(world, `camp${n}`);
  g.parent = from.id;
  g.founders = going.filter((p) => p.age >= ADULT_AGE).map((p) => p.id);
  g.name = `the people of camp ${n}`;
  const r = Math.min(world.radius ?? 80, 120) * 0.55;
  const ang = hash01(`${g.id}|camp`) * Math.PI * 2;
  g.camp = { x: Math.cos(ang) * r, z: Math.sin(ang) * r };
  // Founder effect: each founder carries their own memory of each custom (mostly right, sometimes not); the majority of the few who left becomes the new people's way.
  for (const k of customKeys()) {
    const votes: Record<number, number> = {};
    for (const id of g.founders) {
      const v = hash01(`${id}|${k}|recall`) < 0.65 ? from.customs[k]! : Math.floor(hash01(`${id}|${k}|other`) * VARIANTS[k]!.length);
      votes[v] = (votes[v] ?? 0) + 1;
    }
    g.customs[k] = Number(Object.entries(votes).sort((a, b) => b[1] - a[1] || (Number(a[0]) === from.customs[k] ? -1 : 1))[0]![0]);
  }
  for (const p of going) p.group = g.id;
  s.lastSplit = world.clock ?? 0;
  chronicle(world, `${going.length} left ${from.name} over ${why} and made a camp of their own.`);
  tally(world, "splits");
  return g;
}
/** Every season each people's ways wander a little: a custom or a word changes to another form. */
function driftStep(world: World) {
  const s = societyOf(world);
  const key = customKeys();
  for (const gid of Object.keys(groupsPresent(world))) {
    const g = groupOf(world, gid);
    const bucket = Math.floor((world.clock ?? 0) / (YEAR / 4 / 4));
    if (hash01(`${gid}|drift|${bucket}`) >= 0.4) continue;
    const k = key[Math.floor(hash01(`${gid}|which|${bucket}`) * key.length)]!;
    const list = VARIANTS[k]!;
    g.customs[k] = ((g.customs[k] ?? 0) + 1 + Math.floor(hash01(`${gid}|by|${bucket}`) * (list.length - 1))) % list.length;
    tally(world, "drifts");
    void s;
  }
}
/** How far apart the peoples are: the share of customs and words on which two groups differ, averaged over pairs. 0 when there is one. */
export function divergence(world: World): number {
  const gs = Object.keys(groupsPresent(world)).map((id) => groupOf(world, id));
  let sum = 0, pairs = 0;
  for (let i = 0; i < gs.length; i++) for (let j = i + 1; j < gs.length; j++) {
    sum += customKeys().filter((k) => gs[i]!.customs[k] !== gs[j]!.customs[k]).length / customKeys().length;
    pairs++;
  }
  return pairs ? sum / pairs : 0;
}

// ---- What it does to choices ----

/** Festival evenings draw people to the fire; a camp draws its own people home; a taboo keeps hands from work on a feast day. Never against thirst or hunger. */
export function societyBias(p: Person, world: World, opts: Option[]) {
  if (!world.society || p.age < 1 || p.needs.thirst >= 0.6 || p.needs.hunger >= 0.6) return;
  const g = groupOf(world, groupId(p));
  const fest = festivalOn(world);
  if (fest && evening(world)) {
    const at = place(world, g);
    const far = dist(p.x, p.z, at.x, at.z);
    opts.push({ intent: far > 5 ? { kind: "wander", x: at.x, z: at.z, speed: 2.4, remaining: 8 } : { kind: "linger", x: p.x, z: p.z, speed: 0, remaining: 20 }, score: 0.55, reason: `to keep ${fest.name(g)}` });
    if (g.taboos.length) for (const o of opts) if (["forage", "fish", "hunt", "plant", "build", "craft", "improve", "gather"].includes(o.intent.kind)) o.score -= 0.3;
  } else if (g.camp && dist(p.x, p.z, g.camp.x, g.camp.z) > 35 && p.intent?.kind !== "flee") {
    opts.push({ intent: { kind: "wander", x: g.camp.x, z: g.camp.z, speed: 2.2, remaining: 8 }, score: 0.22, reason: "to go home to the camp" });
  }
}
