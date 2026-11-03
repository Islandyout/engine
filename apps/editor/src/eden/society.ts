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
import { ADULT_AGE, chronicle, make, note, relation, tally, type Intent, type IntentKind, type Person, type World } from "./mind";
import { judge, sawFact } from "./mindmodel";
import { joyFrom } from "./heart";
import { econOf } from "./economy";
import { applyPunishment, bandOf as conflictBand, bribe, propaganda, SEVERITY, worldConflict, type ActKind, type Punishment } from "./conflict";
import { banWorks, closeAccess, collapseWatch, eliteBy } from "./learning";

type Option = { intent: Omit<Intent, "arrived">; score: number; reason?: string };

// ---- State ----

export interface Law { norm: string; text: string; since: number; rulings: number }
export interface Taboo { what: "work-on-festival" | "spill-blood"; text: string; by: string; since: number }
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
  larder?: number; // food held in common (tribute, offerings); a camp with a home keeps it in the shelter's stock instead
  home?: string; // a camp's own shelter (a thing id)
  hearth?: string; // and its fire
  lastOrder?: number; // the day the leader last gave orders
  breaches?: Record<string, number>; // taboo breaches by person
  contended?: number; // the quarter-year the priests last contended
}
export interface Case { id: string; group: string; accused: string; victim: string; kind: "theft" | "harm" | "taboo"; filed: number; norm: string; starving: boolean; factId?: string; act?: string; cause?: string; state: "open" | "ruled"; verdict?: "guilty" | "pardoned" | "dismissed"; judge?: string; ruling?: string; penalty?: string }
/** Something the host can read from the people's life: a feast kept, a rite held, a ruling, an order, a ban. */
export interface SocEvent { t: number; kind: string; group: string; text: string; n?: number }
export interface Feud { a: string; b: string; heat: number; since: number; cause: string; announced?: boolean; arbitrated?: number }
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
  events?: SocEvent[];
  pending?: Record<string, number>; // rites due and waiting for the priest: "person|rite" -> since
  lastCampDay?: number;
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

/** Record something the host can list (`societyView`). The newest 300 are kept. */
export function event(world: World, kind: string, group: string, text: string, n?: number) {
  const s = societyOf(world);
  (s.events ??= []).push({ t: world.clock ?? 0, kind, group, text, n });
  if (s.events.length > 300) s.events.splice(0, s.events.length - 300);
}
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
      bloodTaboo(world, grp);
      leaderStep(world, grp);
      priestStep(world, grp);
      authorityStep(world, grp);
    }
    rites(world);
    rulings(world);
    feudStep(world, 300);
    schismStep(world, 300);
    splitStep(world);
  }
  if (ticks(world, dt, 60)) {
    festivalStep(world);
    campCensus(world);
  }
  if (ticks(world, dt, 240)) {
    const lost = collapseWatch(world);
    if (lost) event(world, "collapse", "all", `The hard years took what was known of ${lost.join(", ") || "little"}.`, lost.length);
  }
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

// ---- What a leader can do: orders, tribute, sharing out, the council's word ----

/** Where a people keeps its common food: the shelter at its own camp, or a store held in common. */
const homeOf = (world: World, g: Group) => (g.home ? world.things.find((t) => t.id === g.home) : undefined);
export const larderOf = (world: World, g: Group) => { const h = homeOf(world, g); return h ? (h.stock ?? 0) : (g.larder ?? 0); };
const addLarder = (world: World, g: Group, n: number) => {
  const h = homeOf(world, g);
  if (h) h.stock = Math.max(0, (h.stock ?? 0) + n);
  else g.larder = Math.max(0, (g.larder ?? 0) + n);
};
const ORDER_SECONDS = DAY / 5;
/**
 * The leader's word is acted on. Each day they look at what the people need and tell some followers (those who trust them and are not
 * set against being told) to do it; the economy's order bias then leans the follower toward it, always yielding to thirst and hunger.
 * A big task (a roof) needs the council to agree. The food in common is shared out to the hungry who have none.
 */
function leaderStep(world: World, g: Group) {
  const leader = person(world, g.leader);
  if (!leader || leader.needs.hunger > 0.6 || leader.needs.thirst > 0.6) return;
  const now = world.clock ?? 0;
  const day = Math.floor(now / DAY);
  for (const p of adultsOf(world, g.id)) {
    if (p === leader || p.needs.hunger < 0.75 || p.carry.food >= 1 || larderOf(world, g) < 1) continue;
    addLarder(world, g, -1);
    p.carry.food += 1;
    relation(p, leader.id, world).trust = Math.min(1, relation(p, leader.id, world).trust + 0.05);
    tally(world, "tributeShared");
    event(world, "share", g.id, `${leader.name} shared the common store with ${p.name}.`);
  }
  if (g.lastOrder === day) return;
  g.lastOrder = day;
  // In a war a leader makes the case against the other side to those who trust them.
  const mine = conflictBand(world, leader);
  const war = worldConflict(world).wars.find((w) => !w.ended && (w.a === mine || w.b === mine));
  if (war) propaganda(world, leader, war.a === mine ? war.b : war.a, 0.2);
  const members = adultsOf(world, g.id).filter((p) => p !== leader && p.age < 62 && p.needs.hunger < 0.6 && p.needs.thirst < 0.6 && p.intent?.kind !== "sleep" && !(econOf(p).order && econOf(p).order!.until > now));
  if (members.length < 2) return;
  const season = seasonAt(now).season;
  const all = adultsOf(world, g.id);
  const food = larderOf(world, g) + all.reduce((a, p) => a + p.carry.food, 0);
  const wood = all.reduce((a, p) => a + p.carry.wood, 0);
  const roofs = world.things.filter((t) => t.kind === "shelter" && dist(t.x, t.z, place(world, g).x, place(world, g).z) < 60).length;
  let kind: IntentKind | undefined;
  let why = "";
  if (festivalOn(world, now)) (kind = "forage"), (why = "bring food for the feast");
  else if (season >= 2 && food < all.length * 1.5) (kind = "forage"), (why = "fill the store before the cold");
  else if (season >= 1 && wood < all.length * 1.5 && food >= all.length) (kind = "gather"), (why = "gather wood before the cold");
  else if (roofs < Math.ceil(all.length / 6) && wood >= 8) (kind = "build"), (why = "raise another roof");
  else if (food < all.length) (kind = "fish"), (why = "fish the river for the camp");
  if (!kind) return;
  if (kind === "build" && g.council.length >= 2) {
    const yes = g.council.map((id) => person(world, id)).filter((c): c is Person => !!c && valueOf(c, "freedom") < 0.8).length;
    if (yes * 2 <= g.council.length) return void tally(world, "councilRefused");
    tally(world, "councilAgreed");
  }
  let given = 0;
  const leaderHouse = houseOf(world, leader);
  for (const f of members.sort((a, b) => relation(b, leader.id, world).trust - relation(a, leader.id, world).trust).slice(0, Math.max(2, Math.ceil(members.length / 3)))) {
    const r = relation(f, leader.id, world);
    if (r.trust < 0.35 || valueOf(f, "freedom") > 0.85 || feudsOf(world, f).some((x) => x.a === leaderHouse || x.b === leaderHouse)) {
      tally(world, "leaderOrdersRefused");
      r.affinity = Math.max(-1, r.affinity - 0.02);
      continue;
    }
    econOf(f).order = { by: leader.id, kind, until: now + ORDER_SECONDS };
    note(f, world, `${leader.name} told me to ${why}.`);
    given++;
  }
  if (given) {
    tally(world, "leaderOrders");
    event(world, "order", g.id, `${leader.name} told ${given} to ${why}.`, given);
  }
}
/** An order done: the follower did what the leader told them. Called when an act ends. */
export function societyAfter(world: World, who: Person, intent: Intent) {
  const order = who.econ?.order;
  if (order && order.kind === intent.kind && order.until + DAY > (world.clock ?? 0) && person(world, order.by) && groupOf(world, groupId(who)).leader === order.by) {
    tally(world, "leaderOrdersObeyed");
    const leader = person(world, order.by);
    if (leader) relation(leader, who.id, world).trust = Math.min(1, relation(leader, who.id, world).trust + 0.02);
  }
  // An evening spent at the fire or camp, counted apart on a feast and on an ordinary day: the difference is what the feast does.
  if (who.age >= 1 && evening(world) && (intent.kind === "wander" || intent.kind === "linger")) {
    const site = place(world, groupOf(world, groupId(who)));
    if (dist(who.x, who.z, site.x, site.z) < 8) tally(world, festivalOn(world) ? "festivalGatherings" : "eveningGatherings");
  }
  // Working on a feast day where that is taboo: someone near sees it, and it is brought before the priest.
  const g = groupOf(world, groupId(who));
  if (who.age >= ADULT_AGE && g.taboos.some((t) => t.what === "work-on-festival") && festivalOn(world) && WORK.includes(intent.kind) && !(SUBSISTENCE.includes(intent.kind) && who.needs.hunger > 0.45)) {
    const seen = world.people.some((q) => q !== who && q.age >= ADULT_AGE && q.intent?.kind !== "sleep" && dist(q.x, q.z, who.x, who.z) < 25);
    const s = societyOf(world);
    const day = Math.floor((world.clock ?? 0) / DAY);
    if (seen && !s.cases.some((c) => c.kind === "taboo" && c.accused === who.id && Math.floor(c.filed / DAY) === day)) {
      const keeper = person(world, g.priest) ?? person(world, g.leader);
      s.cases.push({ id: `case-${s.cases.length}`, group: g.id, accused: who.id, victim: keeper?.id ?? who.id, kind: "taboo", filed: world.clock ?? 0, norm: "taboo", starving: who.needs.hunger > 0.85, state: "open" });
      tally(world, "casesFiled");
    }
  }
}
// Getting food when hungry is not the work a feast day forbids.
const SUBSISTENCE = ["forage", "fish", "hunt", "gather"];
const WORK = ["forage", "fish", "hunt", "plant", "build", "craft", "improve", "gather"];

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
/**
 * A violent act (conflict.ts) in a people that has a leader is brought to that people's court rather than to whoever conflict.ts would
 * find. Returns whether it was taken. Killing or a blow also makes a feud between the houses.
 */
export function courtOf(world: World, off: Person, victim: Person | undefined, act: string, cause: string): boolean {
  const g = groupOf(world, groupId(victim ?? off));
  if (!g.leader || !person(world, g.leader)) return false;
  const s = societyOf(world);
  s.cases.push({ id: `case-${s.cases.length}`, group: g.id, accused: off.id, victim: victim?.id ?? g.leader, kind: "harm", filed: world.clock ?? 0, norm: "harm", starving: false, act, cause, state: "open" });
  tally(world, "casesFiled");
  tally(world, "harmCases");
  return true;
}
const VIOLENT: ActKind[] = ["fight", "kill", "murder", "bully", "coerce", "bind", "harsh", "mob", "raid"];
/** A violent act, as logged by conflict.ts: it feeds a feud between the houses. */
export function onViolence(world: World, doer: Person, victim: Person | undefined, act: ActKind) {
  if (!victim || !VIOLENT.includes(act)) return;
  grievance(world, doer, victim, 0.2 + 0.5 * (SEVERITY[act] ?? 0.3), `${doer.name} ${act === "kill" || act === "murder" ? "killed" : "did violence to"} ${victim.name}`, "violence");
}
/** Who sits in judgement: the leader, unless they are a party or close kin to one, then a councillor, then the most trusted adult. */
export function judgeFor(world: World, g: Group, accused: Person, victim: Person): Person | undefined {
  const free = (p: Person | undefined) => !!p && p.id !== accused.id && p.id !== victim.id && p.age >= ADULT_AGE && houseOf(world, p) !== houseOf(world, accused) && houseOf(world, p) !== houseOf(world, victim);
  const order = [person(world, g.leader), ...g.council.map((id) => person(world, id)), ...adultsOf(world, g.id).sort((a, b) => statusOf(world, b) - statusOf(world, a))];
  // A judge who is the accused's friend stands aside if anyone else can hear it.
  const impartial = (p: Person | undefined) => free(p) && (p!.relations.get(accused.id)?.affinity ?? 0) < 0.6;
  return order.find(impartial) ?? order.find(free) ?? order.find((p) => !!p && p.id !== accused.id && p.id !== victim.id);
}
function rulings(world: World) {
  const s = societyOf(world);
  const now = world.clock ?? 0;
  for (const c of s.cases) {
    if (c.state !== "open" || now - c.filed < 600) continue; // the judge takes time to hear it
    const g = groupOf(world, c.group);
    const accused = anyone(world, c.accused), victim = anyone(world, c.victim);
    if (c.kind === "taboo") { ruleTaboo(world, g, c, accused); continue; }
    const jd = accused && victim ? judgeFor(world, g, accused, victim) : undefined;
    if (!accused || !victim || !jd) { c.state = "ruled"; c.verdict = "dismissed"; c.ruling = "no one could hear it"; continue; }
    // Someone with little conscience and food to spare may try to buy a light verdict; an honest judge refuses.
    if ((accused.conflict?.guilt ?? 0) < 0.5 && accused.carry.food >= 2 && valueOf(accused, "fairness") < 0.4 && chanceAt(world, `bribe|${c.id}`, DAY) < 0.9 * (1 - valueOf(accused, "fairness")) && bribe(world, accused, jd)) {
      c.state = "ruled";
      c.verdict = "dismissed";
      c.judge = jd.id;
      c.ruling = `${jd.name} let ${accused.name} off (food changed hands)`;
      grievance(world, victim, accused, 0.2, "a judge who was bought", c.kind === "harm" ? "violence" : "theft");
      tally(world, "bribedRulings");
      continue;
    }
    const witnesses = world.people.filter((q) => q.id !== accused.id && q.id !== victim.id && c.factId && sawFact(q, c.factId)).length;
    const { weight, reason } = judge(world, jd, accused, c.kind === "harm" ? "violence" : "theft");
    const proof = c.kind === "harm" ? 0.8 + 0.1 * Math.min(2, witnesses) : 0.45 + 0.2 * Math.min(2, witnesses) + (victim.carry.food < 1 ? 0.05 : 0);
    c.judge = jd.id;
    const law = g.laws.find((l) => l.norm === c.norm);
    if (law) law.rulings++;
    if (proof * weight < 0.5) {
      c.verdict = "dismissed";
      c.ruling = `${jd.name} found too little proof against ${accused.name} (${reason})`;
      grievance(world, victim, accused, 0.15, c.kind === "harm" ? "a violence the judge let go" : "a theft the judge let go", c.kind === "harm" ? "violence" : "theft");
    } else if (c.kind === "harm") {
      const act = (c.act ?? "fight") as ActKind;
      if (c.cause === "guarding" || c.cause === "fear") {
        c.verdict = "pardoned";
        c.ruling = `${jd.name} ruled ${accused.name} acted to guard against harm, and let it stand`;
      } else {
        let sev = (SEVERITY[act] ?? 0.3) * (c.cause === "desperation" || c.cause === "scarcity" ? 0.6 : 1);
        if (g.taboos.some((t) => t.what === "spill-blood")) { sev *= 1.3; tally(world, "tabooBroken"); }
        const pun: Punishment = sev < 0.2 ? "warning" : sev < 0.45 ? "restitution" : sev < 0.65 ? "jail" : "exile";
        c.verdict = "guilty";
        c.penalty = pun;
        c.ruling = `${jd.name} ruled ${accused.name} guilty of ${act} against ${victim.name}: ${pun}`;
        applyPunishment(world, accused, victim, jd, pun, sev);
        tally(world, `penalty_${pun}`);
        reinforce(world, "fair" as never, jd, 0.03);
      }
    } else if (c.starving) {
      c.verdict = "pardoned";
      c.ruling = `${jd.name} ruled ${accused.name} took it from hunger, and the people must see no one starves`;
      relation(victim, accused.id, world).trust = Math.min(1, relation(victim, accused.id, world).trust + 0.15);
    } else {
      c.verdict = "guilty";
      c.penalty = "repay";
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
    event(world, "ruling", g.id, c.ruling!);
    tally(world, `rulings_${c.verdict}`);
  }
  if (s.cases.length > 80) s.cases.splice(0, s.cases.length - 80);
}
/** Breaking a taboo is judged by the priest (who arbitrates what is sacred), else the leader: an offering and shame, and exile for the third time. */
function ruleTaboo(world: World, g: Group, c: Case, accused: Person | undefined) {
  c.state = "ruled";
  const jd = [person(world, g.priest), person(world, g.leader)].find((q) => !!q && q.id !== c.accused);
  if (!accused || !jd) { c.verdict = "dismissed"; c.ruling = "no one could hear it"; return; }
  c.judge = jd.id;
  if ((accused.conflict?.exile?.until ?? 0) > (world.clock ?? 0)) { c.verdict = "dismissed"; c.ruling = `${accused.name} is already sent away`; return; }
  const n = ((g.breaches ??= {})[accused.id] = (g.breaches[accused.id] ?? 0) + 1);
  c.verdict = "guilty";
  feel(accused, "shame", 0.4);
  if (n >= 3) {
    c.penalty = "exile";
    applyPunishment(world, accused, undefined, jd, "exile", 0.5);
    g.breaches[accused.id] = 0; // having been sent away for it, they start again on their return
  } else if (accused.carry.food >= 1) {
    c.penalty = "offering";
    accused.carry.food -= 1;
    addLarder(world, g, 1);
  } else c.penalty = "shame";
  c.ruling = `${jd.name} judged ${accused.name} for working on a feast day: ${c.penalty}`;
  note(accused, world, `${jd.name} judged me for breaking the taboo.`);
  chronicle(world, `${c.ruling}.`);
  event(world, "ruling", g.id, c.ruling);
  tally(world, "rulings_taboo");
  tally(world, "tabooBroken");
}

// ---- Taboos and religion ----

function tabooStep(world: World, g: Group) {
  const priest = person(world, g.priest);
  if (!priest || g.taboos.some((t) => t.what === "work-on-festival") || societyOf(world).festivals.filter((f) => f.group === g.id).length < 2) return;
  g.taboos.push({ what: "work-on-festival", text: `no one works on ${customText(world, g, "festival:0")} and the other feast days`, by: priest.id, since: world.clock ?? 0 });
  chronicle(world, `${priest.name} declared a taboo: ${g.taboos[g.taboos.length - 1]!.text}.`);
  tally(world, "taboos");
}
/** After a harm has been judged, the priest makes a second taboo: no blood is spilled among those who share a fire. */
function bloodTaboo(world: World, g: Group) {
  const priest = person(world, g.priest);
  if (!priest || g.taboos.some((t) => t.what === "spill-blood") || !societyOf(world).cases.some((c) => c.kind === "harm" && c.group === g.id && c.state === "ruled")) return;
  g.taboos.push({ what: "spill-blood", text: "no one spills the blood of those who share the fire", by: priest.id, since: world.clock ?? 0 });
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
/**
 * What a priest does besides speak: arbitrate a feud between two houses neither of which is theirs (a season's peace-making, if both trust
 * them), and, in a schism, contend with the rival priest for the doubtful: each season each preaches to one adult of the other side.
 */
function priestStep(world: World, g: Group) {
  const s = societyOf(world);
  const priest = person(world, g.priest);
  if (!priest || priest.needs.hunger > 0.6 || priest.needs.thirst > 0.6) return;
  const now = world.clock ?? 0;
  const bucket = Math.floor(now / (YEAR / 4));
  const mine = houseOf(world, priest);
  for (const f of s.feuds) {
    if (f.heat < 0.5 || f.a === mine || f.b === mine) continue;
    const sides = [f.a, f.b].map((h) => membersOf(world, g.id).filter((q) => houseOf(world, q) === h && q.age >= ADULT_AGE));
    if (sides.some((x) => !x.length)) continue;
    const trusted = sides.every((x) => x.reduce((a, q) => a + relation(q, priest.id, world).trust, 0) / x.length >= 0.4);
    if (!trusted || hash01(`${f.a}|${f.b}|arbitrate|${bucket}`) >= 0.5 || f.arbitrated === bucket) continue;
    f.arbitrated = bucket;
    f.heat = Math.max(0, f.heat - 0.3);
    chronicle(world, `${priest.name} brought the houses of ${anyone(world, f.a)?.name ?? f.a} and ${anyone(world, f.b)?.name ?? f.b} to speak, and the feud cooled.`);
    event(world, "arbitrate", g.id, `${priest.name} arbitrated a feud.`);
    tally(world, "arbitrations");
  }
  const rival = person(world, g.rivalPriest);
  const sc = s.schisms.find((x) => x.group === g.id);
  if (rival && sc && hash01(`${g.id}|contend|${bucket}`) < 0.9 && g.contended !== bucket) {
    g.contended = bucket;
    for (const [preacher, other] of [[priest, rival], [rival, priest]] as const) {
      const theirs = sc.sides.find((t) => Object.values(preacher.faith ?? {}).includes(t));
      const target = adultsOf(world, g.id).filter((q) => q !== priest && q !== rival && theirs && !Object.values(q.faith ?? {}).includes(theirs) && sc.sides.some((t) => Object.values(q.faith ?? {}).includes(t))).sort((a, b) => relation(b, preacher.id, world).trust - relation(a, preacher.id, world).trust)[0];
      if (!target || !theirs) continue;
      const qid = Object.keys(preacher.faith ?? {}).find((k) => preacher.faith![k] === theirs);
      if (qid && hash01(`${target.id}|convert|${bucket}`) < 0.3 + 0.5 * relation(target, preacher.id, world).trust) {
        (target.faith ??= {})[qid] = theirs;
        tally(world, "conversions");
        event(world, "conversion", g.id, `${preacher.name} won ${target.name} from ${other.name}'s teaching.`);
      }
    }
    // The quarrel of the priests becomes a quarrel of their houses.
    if (sc.heat >= 0.5) grievance(world, priest, rival, 0.15, "the priests' quarrel over belief", "faith");
  }
}
/** Those with the say forbid what they distrust, and the lettered elite and the traditional close what is taught. */
function authorityStep(world: World, g: Group) {
  const leader = person(world, g.leader);
  const priest = person(world, g.priest);
  if (leader) closeAccess(world, leader);
  for (const [who, role] of [[priest, "priest"], [leader, "leader"]] as const) {
    if (!who) continue;
    const id = banWorks(world, who, role);
    if (id) {
      const w = (world.works ?? []).find((x) => x.id === id)!;
      event(world, "ban", g.id, `${who.name} forbade "${w.title}".`);
    }
  }
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
function hold(world: World, p: Person, rite: string, text: string, bonus = 0.4, officiant?: Person) {
  const g = groupOf(world, groupId(p));
  const near = attendees(world, p);
  (p.rites ??= []).push(rite);
  joyFrom(p, world, "ritual", bonus + (officiant ? 0.15 : 0));
  for (const q of near) joyFrom(q, world, "ritual", 0.15);
  note(p, world, text);
  chronicle(world, text);
  event(world, "rite", g.id, text, near.length);
  tally(world, `rites_${rite}`);
  if (officiant) tally(world, "ritesOfficiated");
  return near.length;
}
/**
 * A rite falls due. Where the people have a priest, the priest officiates: it waits for them (they walk to it, see societyBias) for up to a
 * day, then is held by the elders without. Needs two others present, as ever.
 */
function tryRite(world: World, p: Person, rite: string, text: (officiant: Person | undefined) => string, bonus: number): boolean {
  if (attendees(world, p).length < 2) return false;
  const g = groupOf(world, groupId(p));
  const priest = person(world, g.priest);
  const s = societyOf(world);
  const pending = (s.pending ??= {});
  const key = `${p.id}|${rite}`;
  const now = world.clock ?? 0;
  const officiant = priest && priest !== p && dist(priest.x, priest.z, p.x, p.z) < 40 ? priest : undefined;
  if (priest && priest !== p && !officiant) {
    pending[key] ??= now;
    if (now - pending[key]! < DAY) return false;
    tally(world, "ritesLay");
  }
  delete pending[key];
  hold(world, p, rite, text(officiant), bonus, officiant);
  return true;
}
function rites(world: World) {
  for (const p of world.people) {
    const g = groupOf(world, groupId(p));
    const done = p.rites ?? [];
    const by = (o: Person | undefined) => (o ? `, ${o.name} officiating` : "");
    if (p.age >= 0.5 && !done.includes("naming")) tryRite(world, p, "naming", (o) => `${p.name} was named: ${customText(world, g, "naming")}${by(o)}.`, 0.1);
    if (p.age >= ADULT_AGE && !done.includes("adulthood")) tryRite(world, p, "adulthood", (o) => `${p.name} came of age among ${g.name}: ${customText(world, g, "adulthood")}${by(o)}.`, 0.5);
    const partner = lifeOf(p).partner;
    if (partner && !done.includes("wedding")) {
      const mate = person(world, partner);
      if (tryRite(world, p, "wedding", (o) => `${p.name} and ${mate?.name ?? "their partner"} were wed: ${customText(world, g, "wedding")}${by(o)}.`, 0.5) && mate && !(mate.rites ??= []).includes("wedding")) mate.rites.push("wedding");
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
    const text = `${d.person.name} was laid to rest by ${mourners.length}: ${customText(world, g, "funeral")}${tenet ? `, for they believed: ${tenet.text}` : ""}.`;
    chronicle(world, text);
    event(world, "funeral", g.id, text, mourners.length);
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
    // The leader collects the people's offering for the feast (one food from each who has plenty and does not refuse), and the feast is eaten from it.
    const leader = person(world, g.leader);
    if (leader) {
      for (const p of membersOf(world, gid)) {
        if (p === leader || p.age < ADULT_AGE || p.carry.food < 3) continue;
        const r = relation(p, leader.id, world);
        if (r.trust < 0.3 && valueOf(p, "freedom") > 0.6) {
          tally(world, "tributeRefused");
          r.affinity = Math.max(-1, r.affinity - 0.05);
          continue;
        }
        p.carry.food -= 1;
        addLarder(world, g, 1);
        tally(world, "tributeCollected");
      }
    }
    let fed = 0;
    for (const p of there) if (larderOf(world, g) >= 0.5 && p.needs.hunger > 0.25) { addLarder(world, g, -0.5); p.needs.hunger = Math.max(0, p.needs.hunger - 0.25); fed++; }
    if (fed) tally(world, "feastMeals");
    const priest = person(world, g.priest);
    if (priest && there.includes(priest)) {
      // The priest speaks: those present who hold no answer take the priest's.
      for (const p of there) for (const [q, t] of Object.entries(priest.faith ?? {})) if (p !== priest && p.age >= ADULT_AGE && !p.faith?.[q] && chanceAt(world, `${p.id}|sermon|${q}`, DAY) < 0.5) { (p.faith ??= {})[q] = t; tally(world, "sermonsTaken"); }
      tally(world, "sermons");
    }
    const line = `${there.length} of ${g.name} kept ${name}${priest && there.includes(priest) ? `, with ${priest.name} speaking` : ""}${fed ? `, and ${fed} ate at the feast` : ""}.`;
    chronicle(world, line);
    event(world, "festival", gid, line, there.length);
    tally(world, "festivals");
  }
}

// ---- Feuds and alliances ----

/** A wrong done by one person to another: between houses it feeds a feud, and the allies of each side are drawn in. */
export function grievance(world: World, doer: Person, wronged: Person, amount: number, cause: string, source = "theft") {
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
      tally(world, `feudsFrom_${source}`);
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
  // A home of their own: a roof with a larder (the founders put in a share of what they carry) and a fire, known to all who came.
  const camp = g.camp;
  const stock = going.reduce((a, p) => { const give = Math.floor(p.carry.food / 2); p.carry.food -= give; return a + give; }, 0);
  const roof = make(world, "shelter", camp.x, camp.z, { stock, radius: 3 });
  const fire = make(world, "campfire", camp.x + 3, camp.z, { fuel: 1200, radius: 2 });
  g.home = roof.id;
  g.hearth = fire.id;
  for (const p of going) for (const t of [roof, fire]) p.memory.set(t.id, { x: t.x, z: t.z, feeling: 0.6, visits: 1, lastSeen: p.clock });
  event(world, "split", g.id, `${going.length} left ${from.name} and built a camp.`, going.length);
  s.lastSplit = world.clock ?? 0;
  chronicle(world, `${going.length} left ${from.name} over ${why} and made a camp of their own.`);
  tally(world, "splits");
  return g;
}
/** How many of each camp's people are at their camp, hour by hour: the measure of whether a camp is a home. */
function campCensus(world: World) {
  for (const p of world.people) {
    const g = groupOf(world, groupId(p));
    const h = homeOf(world, g);
    if (!h) continue;
    const at = dist(p.x, p.z, h.x, h.z) < 30;
    tally(world, at ? "campHoursAt" : "campHoursAway");
    const hr = hourOf(world.clock ?? 0);
    if (hr >= 21 || hr < 5) tally(world, at ? "campNightAt" : "campNightAway");
    if (p.intent?.kind === "sleep" && dist(p.x, p.z, h.x, h.z) < 12) tally(world, "campSleepAtHome");
  }
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
  const at = place(world, g);
  // The priest goes to a rite that waits for them.
  if (g.priest === p.id) {
    const waiting = Object.keys(world.society.pending ?? {}).map((k) => person(world, k.split("|")[0])).find((q) => q && groupId(q) === g.id && dist(q.x, q.z, p.x, p.z) > 12);
    if (waiting) opts.push({ intent: { kind: "wander", x: waiting.x, z: waiting.z, speed: 2.2, remaining: 6 }, score: 0.6, reason: `to officiate for ${waiting.name}` });
  }
  if (fest && evening(world)) {
    const far = dist(p.x, p.z, at.x, at.z);
    opts.push({ intent: far > 5 ? { kind: "wander", x: at.x, z: at.z, speed: 2.4, remaining: 8 } : { kind: "linger", x: p.x, z: p.z, speed: 0, remaining: 20 }, score: 0.55, reason: `to keep ${fest.name(g)}` });
  } else if (fest && p.carry.food >= 2 && g.leader && hourOf(world.clock ?? 0) < 16.5 && dist(p.x, p.z, at.x, at.z) > 8) {
    opts.push({ intent: { kind: "wander", x: at.x, z: at.z, speed: 2.2, remaining: 4 }, score: 0.4, reason: `to bring food for ${fest.name(g)}` });
  }
  if (fest && g.taboos.some((t) => t.what === "work-on-festival") && (evening(world) || hourOf(world.clock ?? 0) < 16.5)) for (const o of opts) if (WORK.includes(o.intent.kind)) o.score -= 0.3;
  if (fest && evening(world)) return;
  const home = homeOf(world, g);
  if (home && p.intent?.kind !== "flee") {
    const d = dist(p.x, p.z, home.x, home.z);
    const night = hourOf(world.clock ?? 0) >= 20 || hourOf(world.clock ?? 0) < 5;
    // Their own people sleep at their own roof: a sleep that would be taken elsewhere is taken at the camp.
    if (night && d < 150) for (const o of opts) if (o.intent.kind === "sleep" || o.intent.kind === "rest") o.intent = { ...o.intent, targetId: home.id, x: home.x + 1, z: home.z };
    if (night && d > 8) opts.push({ intent: { kind: "wander", x: home.x, z: home.z, speed: 2.2, remaining: 10 }, score: 0.6, reason: "to sleep at the camp" });
    else if (p.carry.food >= 3 && p.needs.hunger < 0.4 && d < 90) opts.push({ intent: { kind: "stash", targetId: home.id, x: home.x, z: home.z, speed: 2.2, remaining: 6 }, score: 0.5, reason: "to put food in the camp's store" });
    else if (d > 35) opts.push({ intent: { kind: "wander", x: home.x, z: home.z, speed: 2.2, remaining: 8 }, score: 0.35, reason: "to go home to the camp" });
  } else if (g.camp && dist(p.x, p.z, g.camp.x, g.camp.z) > 35 && p.intent?.kind !== "flee") {
    opts.push({ intent: { kind: "wander", x: g.camp.x, z: g.camp.z, speed: 2.2, remaining: 8 }, score: 0.22, reason: "to go home to the camp" });
  }
}

// ---- What the host can read ----

/** The days of the year a feast falls on, from the clock on: `[{ day, season, name }]` for the group's own names. */
export function nextFestival(world: World, groupName = "main", from = world.clock ?? 0) {
  const g = groupOf(world, groupName);
  for (let d = 0; d <= 16; d++) {
    const t = (Math.floor(from / DAY) + d) * DAY;
    const f = festivalOn(world, t);
    if (f && (d > 0 || hourOf(from) < 21)) return { inDays: d, day: seasonAt(t).dayOfYear, season: SEASON_NAMES[f.season]!, name: f.name(g) };
  }
  return undefined;
}
/** All the host needs to show a people's life: the calendar, today's and the next feast, who leads, the laws and taboos, the camps, and the newest events. */
export function societyView(world: World, recent = 40) {
  const s = societyOf(world);
  const today = festivalOn(world);
  return {
    day: seasonAt(world.clock ?? 0).dayOfYear,
    calendar: calendar(world),
    today: today ? { season: SEASON_NAMES[today.season]!, names: Object.fromEntries(Object.keys(groupsPresent(world)).map((id) => [id, today.name(groupOf(world, id))])) } : undefined,
    next: nextFestival(world),
    groups: Object.keys(groupsPresent(world)).map((id) => {
      const g = groupOf(world, id);
      return { id, name: g.name, members: membersOf(world, id).length, leader: person(world, g.leader)?.name, council: g.council.map((c) => person(world, c)?.name ?? c), priest: person(world, g.priest)?.name, laws: g.laws.map((l) => l.text), taboos: g.taboos.map((t) => t.text), camp: g.camp, home: g.home, larder: larderOf(world, g), words: Object.fromEntries(customKeys().filter((k) => k.startsWith("word:")).map((k) => [k.slice(5), customText(world, g, k)])) };
    }),
    feasts: s.festivals.slice(-8),
    events: (s.events ?? []).slice(-recent),
  };
}
/** What this person calls a word, in their people's tongue (it drifts from group to group). */
export const wordOf = (world: World, p: Person, concept: string) => (VARIANTS[`word:${concept}`] ? customText(world, groupId(p), `word:${concept}`) : concept);
/** Whether this people's words have drifted from the first ones. */
export const drifted = (world: World, p: Person) => !!world.society && customKeys().some((k) => k.startsWith("word:") && (world.society!.groups[groupId(p)]?.customs[k] ?? 0) !== 0);
/** A line said in the speaker's own words: the names it uses for water, food, fire, friend, hello and the dead are theirs. */
export function inTongue(world: World, speaker: Person, text: string): string {
  if (!drifted(world, speaker)) return text;
  let out = text;
  for (const k of customKeys()) {
    if (!k.startsWith("word:")) continue;
    const english = k.slice(5);
    const mine = customText(world, groupId(speaker), k);
    out = out.replace(new RegExp(`\\b${english}\\b`, "gi"), (m) => (m[0] === m[0]!.toUpperCase() ? mine[0]!.toUpperCase() + mine.slice(1) : mine));
  }
  if (out !== text) tally(world, "speechInDialect");
  return out;
}
