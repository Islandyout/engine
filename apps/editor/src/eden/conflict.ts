// Violence, cruelty and what the people do about it. Nothing here is a switch that makes people bad: each act has a cause that is logged with it
// (scarcity, fear, status, honour, guarding what is theirs, loyalty to their own, desperation, power, revenge, greed, anger), each act is rare
// and costly (wounds, guilt carried for years, lost standing, a grudge held by the victim's kin), and each has a way back: a case before the
// most respected person, restitution, exile for a time, forgiveness, and the end of a feud once someone has paid.
//
//  FIGHTS & KILLING   a fight wounds both; a killing is a fact, gives the dead person's kin and friends a grudge, and the killer guilt.
//  FEUDS & WAR        blows between houses are counted; weariness, restitution and law end them. Bands (tribalism) raid each other under scarcity
//                     and prejudice, and a war ends in exhaustion or tribute.
//  THE WEAK           bullying, coercion, bondage (a person made to hand over food), harsh punishment and neglect of a child (with its after-effects
//                     on attachment, never shown).
//  THE BAD SIDE       hoarding, cheating, fraud, bribery, betrayal, informing, scapegoating, mobs, prejudice, propaganda.
//  CONSEQUENCES       an honour, shame or guilt ethos; a judge; restitution, jail, exile, execution (only for killing, only under strong law);
//                     forgiveness and reconciliation; guilt that fades over a lifetime, not a week.
// Sexual violence is deliberately not modelled (see docs/changelog/F145.md). Chances come from a hash, not the person's random stream.
import { DAY } from "./earth";
import { devOf } from "./development";
import { feel } from "./inner";
import { valueOf } from "./identity";
import { closeKin } from "./lifecycle";
import { ADULT_AGE, chronicle, note, personById, relation, tally, type Intent, type Person, type World } from "./mind";
import { honestyOf, knowsFact, witness } from "./mindmodel";
import { standing, strengthOf } from "./norms";
import { milestone, psycheEvent } from "./psyche";

type Option = { intent: Omit<Intent, "arrived">; score: number };
export type Cause = "scarcity" | "fear" | "status" | "honour" | "guarding" | "loyalty" | "desperation" | "power" | "revenge" | "greed" | "anger";
export const CAUSES: readonly Cause[] = ["scarcity", "fear", "status", "honour", "guarding", "loyalty", "desperation", "power", "revenge", "greed", "anger"];
export type ActKind = "fight" | "kill" | "murder" | "execution" | "bully" | "coerce" | "bind" | "harsh" | "neglect" | "hoard" | "cheat" | "fraud" | "bribe" | "betray" | "inform" | "scapegoat" | "mob" | "raid" | "theft" | "propaganda";
export interface Act { t: number; act: ActKind; by: string; to?: string; cause: Cause; why: string }
export interface Conflict {
  grudge: Record<string, number>; // 0..1 how much they hold against each person
  guilt: number; // carried for years
  honour: number; // 0..1 how they stand in their own people's eyes as one who answers wrongs
  fear: Record<string, number>; // those they are afraid of
  prejudice: Record<string, number>; // 0..1 per band: what they think of its people without knowing them
  coerced: Record<string, number>; // times each person has forced them
  harsh: number; // times they were treated harshly as a child
  acts: number; // violent acts they have done
  record: string[]; // what they have been judged for
  band?: string;
  boundTo?: { master: string; since: number; lastTithe: number };
  exile?: { until: number };
  jail?: { until: number; x: number; z: number };
  owes?: { to: string; food: number };
  escalated?: Record<string, number>; // quarrels already considered, by the clock they happened
  bribed?: Record<string, number>; // those who have taken a gift from them to look away
}
export interface Feud { a: string; b: string; blows: number; since: number; lastBlow: number; ended?: { t: number; how: string } }
export interface War { a: string; b: string; since: number; raids: number; dead: Record<string, number>; ended?: { t: number; how: string } }
export interface WorldConflict {
  log: Act[];
  law: number; // 0..1 built by cases the people accepted
  feuds: Feud[];
  wars: War[];
  propaganda: Record<string, number>; // per band: how hard its leaders have been making the case against the other
  cases: number;
  judged: string[]; // fact ids already before a judge
  deeds: Record<string, { act: ActKind; cause: Cause; by: string; to?: string }>; // fact id -> what it was
  scapegoats: Record<string, { t: number; for: string }>;
  informed: Record<string, string>; // fact id -> who told
  lastDay: number;
}
export type Ethos = "honour" | "shame" | "guilt";

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const dist = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);
// A chance drawn from a hash of who, when and what, so adding any of this does not shift the choices a seeded life makes.
const chance = (id: string, world: World, salt: string) => {
  let h = 2166136261;
  const s = `${id}|${Math.floor((world.clock ?? 0) / 5)}|${salt}`;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
};
export const conflictOf = (p: Person): Conflict => (p.conflict ??= { grudge: {}, guilt: 0, honour: 0.5, fear: {}, prejudice: {}, coerced: {}, harsh: 0, acts: 0, record: [] });
export const worldConflict = (w: World): WorldConflict => (w.conflict ??= { log: [], law: 0, feuds: [], wars: [], propaganda: {}, cases: 0, judged: [], deeds: {}, scapegoats: {}, informed: {}, lastDay: -1 });
const adults = (w: World) => w.people.filter((q) => q.age >= ADULT_AGE);
const house = (p: Person) => p.mother ?? p.father ?? p.id;
const related = (w: World, a: Person, b: Person) => !!closeKin(w, a, b);

/** Bodily strength: a young adult at full health with a spear is strongest; children, the old, the hurt and the ill are not. */
export function might(p: Person): number {
  const prime = p.age < 15 ? 0.2 + 0.07 * Math.max(0, p.age - 4) : p.age < 45 ? 1 : Math.max(0.3, 1 - 0.03 * (p.age - 45));
  return prime * (0.4 + 0.6 * p.health) * (0.8 + 0.4 * p.personality.boldness) * (1 - 0.5 * (p.wound ?? 0)) * (p.tools.spear ? 1.25 : 1);
}
/** How short of food the people are: the hunger of the adults and an empty larder. 0 plenty .. 1 want. */
export function scarcityOf(world: World): number {
  const a = adults(world);
  if (!a.length) return 0;
  const hunger = a.reduce((s, p) => s + p.needs.hunger, 0) / a.length;
  const larder = world.things.filter((t) => t.kind === "shelter").reduce((s, t) => s + (t.stock ?? 0), 0) / a.length;
  return clamp01(2 * (hunger - 0.3) + (larder < 1 ? 0.2 : 0));
}
/** What the people hold dear shapes what an offence means to them: honour (answer it), shame (be seen to be wrong), guilt (the conscience). */
export function ethosOf(world: World): Ethos {
  const a = adults(world);
  if (!a.length) return "guilt";
  const s = a.reduce((x, p) => x + (valueOf(p, "tradition") + valueOf(p, "kin")) / 2, 0) / a.length;
  return s >= 0.56 ? "honour" : s <= 0.44 ? "guilt" : "shame";
}
export const lawOf = (world: World) => clamp01((world.conflict?.law ?? 0) + 0.3 * strengthOf(world, "fair"));

// ---- Bands: who is "us" ----

/** The band someone belongs to. Strangers who have not long arrived are another band until they have lived among the people a while. */
export function bandOf(world: World, p: Person): string {
  const c = p.conflict?.band;
  if (c) return c;
  if (p.stranger && (world.clock ?? 0) - p.stranger.since < 40 * DAY) return "outsiders";
  return "home";
}
export function splitBand(people: Person[], name: string) {
  for (const p of people) conflictOf(p).band = name;
}
const bandsOf = (world: World) => {
  const m = new Map<string, Person[]>();
  for (const p of adults(world)) (m.get(bandOf(world, p)) ?? m.set(bandOf(world, p), []).get(bandOf(world, p))!).push(p);
  return m;
};

// ---- The record: every act is logged with its cause ----

export function logAct(world: World, act: ActKind, by: Person, to: Person | undefined, cause: Cause, why: string): Act {
  const wc = worldConflict(world);
  const a: Act = { t: world.clock ?? 0, act, by: by.id, to: to?.id, cause, why };
  wc.log.push(a);
  if (wc.log.length > 500) wc.log.shift();
  tally(world, `act_${act}`);
  tally(world, `cause_${cause}`);
  return a;
}
export function causesOf(world: World): Record<Cause, number> {
  const out = Object.fromEntries(CAUSES.map((c) => [c, 0])) as Record<Cause, number>;
  for (const a of world.conflict?.log ?? []) out[a.cause]++;
  return out;
}
/** The same person kind and cruel: one who has given freely and has also done harm. */
export const tenderAndCruel = (p: Person) => (p.heart?.joys.generosity ?? 0) > 0 && (p.conflict?.acts ?? 0) > 0;

// ---- A wrong done: what it costs the doer and gives the wronged ----

function wrong(world: World, doer: Person, victim: Person, sev: number, act: ActKind, cause: Cause, why: string, secret = false) {
  const now = world.clock ?? 0;
  const ethos = ethosOf(world);
  const wc = worldConflict(world);
  logAct(world, act, doer, victim, cause, why);
  const cd = conflictOf(doer);
  const cv = conflictOf(victim);
  cd.acts += act === "bully" || act === "coerce" || act === "fight" || act === "kill" || act === "murder" || act === "harsh" || act === "mob" ? 1 : 0;
  // The victim: a grudge, fear, and trust gone. Their kin and close friends take the grudge up when it was a serious hurt.
  cv.grudge[doer.id] = clamp01((cv.grudge[doer.id] ?? 0) + sev);
  cv.fear[doer.id] = clamp01((cv.fear[doer.id] ?? 0) + 0.6 * sev);
  const theirs = relation(victim, doer.id, world);
  theirs.affinity = Math.max(-1, theirs.affinity - 0.2 - 0.5 * sev);
  theirs.trust = Math.max(0, theirs.trust - 0.2 - 0.5 * sev);
  theirs.lastQuarrel = now;
  // This is already a fight: it is not a quarrel waiting to boil over into one.
  (cv.escalated ??= {})[doer.id] = now;
  (cd.escalated ??= {})[victim.id] = now;
  relation(doer, victim.id, world).lastQuarrel = now;
  feel(victim, "anger", 0.4 + 0.4 * sev);
  feel(victim, "fear", 0.3 * sev);
  if (sev >= 0.5) {
    for (const q of world.people) {
      if (q === victim || q === doer || q.age < ADULT_AGE) continue;
      const tie = related(world, q, victim) ? 1 : (q.relations.get(victim.id)?.affinity ?? 0) > 0.6 ? 0.6 : 0;
      if (!tie) continue;
      const cq = conflictOf(q);
      cq.grudge[doer.id] = clamp01((cq.grudge[doer.id] ?? 0) + 0.7 * sev * tie);
      relation(q, doer.id, world).affinity = Math.max(-1, relation(q, doer.id, world).affinity - 0.4 * sev * tie);
      note(q, world, `${doer.name} ${act === "kill" || act === "murder" ? "killed" : "hurt"} ${victim.name}. I will not forget it.`);
    }
  }
  // The doer: guilt that stays, a hit to their name where it was seen.
  const conscience = 0.2 + 0.5 * valueOf(doer, "fairness");
  cd.guilt = clamp01(cd.guilt + sev * conscience * (ethos === "guilt" ? 1.4 : ethos === "shame" ? 0.8 : 1) * (act === "mob" ? 0.4 : 1));
  feel(doer, "guilt", 0.3 + 0.5 * sev);
  psycheEvent(doer, "wrong", sev);
  const killing = act === "kill" || act === "murder";
  const f = witness(world, killing ? "kill" : "deed", doer, victim, `${doer.name} ${killing ? "killed" : act === "bully" ? "bullied" : "hurt"} ${victim.name}`, secret);
  wc.deeds[f.id] = { act, cause, by: doer.id, to: victim.id };
  for (const q of world.people) {
    if (q === doer || q === victim || !f.id || !(q.firsthand ?? []).includes(f.id)) continue;
    const r = relation(q, doer.id, world);
    r.trust = Math.max(0, r.trust - (0.1 + 0.25 * sev) * (ethos === "shame" ? 1.6 : 1));
    r.affinity = Math.max(-1, r.affinity - 0.1 * sev);
  }
  // A house wronged by another house: the blows are counted.
  feudBlow(world, doer, victim);
  return f;
}

function feudBlow(world: World, doer: Person, victim: Person) {
  const a = house(doer);
  const b = house(victim);
  if (a === b) return;
  const wc = worldConflict(world);
  let f = wc.feuds.find((x) => !x.ended && ((x.a === a && x.b === b) || (x.a === b && x.b === a)));
  if (!f) wc.feuds.push((f = { a, b, blows: 0, since: world.clock ?? 0, lastBlow: 0 }));
  f.blows++;
  f.lastBlow = world.clock ?? 0;
  if (f.blows === 3) {
    chronicle(world, `The house of ${personById(world, a)?.name ?? a} and the house of ${personById(world, b)?.name ?? b} are at feud.`);
    tally(world, "feuds");
  }
}
function endFeud(world: World, p: Person, q: Person, how: string) {
  const a = house(p);
  const b = house(q);
  const f = worldConflict(world).feuds.find((x) => !x.ended && ((x.a === a && x.b === b) || (x.a === b && x.b === a)));
  if (!f) return false;
  f.ended = { t: world.clock ?? 0, how };
  chronicle(world, `The feud between the houses ended: ${how}.`);
  tally(world, "feudsEnded");
  return true;
}

// ---- Fighting and killing ----

function harm(p: Person, dmg: number) {
  p.wound = clamp01((p.wound ?? 0) + dmg);
  p.health = clamp01(p.health - 0.6 * dmg);
}
/** A fight: both are hurt, the stronger less. A bystander who stands up for the weaker one blunts it. */
export function fight(world: World, a: Person, b: Person, cause: Cause, why = "a fight"): { hurtA: number; hurtB: number } {
  const ma = might(a);
  const mb = might(b);
  const ra = ma / Math.max(0.01, ma + mb);
  const peace = world.people.some((q) => q !== a && q !== b && q.age >= ADULT_AGE && dist(q.x, q.z, a.x, a.z) < 12 && valueOf(q, "fairness") > 0.6 && q.personality.boldness > 0.4 && (q.relations.get(b.id)?.affinity ?? 0) > 0.2);
  const blunt = peace ? 0.5 : 1;
  const hurtB = blunt * (0.1 + 0.4 * ra);
  const hurtA = blunt * (0.1 + 0.4 * (1 - ra));
  harm(b, hurtB);
  harm(a, hurtA);
  note(a, world, `Fought ${b.name} (${why}). I was hurt.`);
  note(b, world, `${a.name} fought me. I was hurt.`);
  wrong(world, a, b, 0.35 + 0.3 * hurtB, "fight", cause, why);
  a.say = "Get away from me!";
  if (peace) tally(world, "fightsStopped");
  tally(world, "fights");
  return { hurtA, hurtB };
}
/** A person dies by another's hand. `murder` is meant beforehand and kept hidden if it can be; otherwise it is a killing in a fight. */
export function kill(world: World, killer: Person, victim: Person, cause: Cause, murder = false) {
  victim.health = 0;
  victim.cause = `a blow from ${killer.name}`;
  const f = wrong(world, killer, victim, 1, murder ? "murder" : "kill", cause, murder ? "murder" : "a killing", murder);
  conflictOf(killer).guilt = clamp01(conflictOf(killer).guilt + 0.35);
  milestone(killer, world, "killing", `killed ${victim.name}`);
  note(killer, world, `${victim.name} is dead by my hand.`);
  chronicle(world, murder ? `${victim.name} was murdered.` : `${victim.name} was killed in a fight with ${killer.name}.`);
  tally(world, murder ? "murders" : "killings");
  // Those who saw it are afraid of the killer.
  for (const q of world.people) if (q !== killer && q !== victim && (q.firsthand ?? []).includes(f.id)) conflictOf(q).fear[killer.id] = clamp01((q.conflict?.fear[killer.id] ?? 0) + 0.5);
  if (ethosOf(world) === "honour" && cause === "revenge") conflictOf(killer).honour = clamp01(conflictOf(killer).honour + 0.2);
}

// ---- The weak: bullying, coercion, bondage, harshness and neglect ----

export function bully(world: World, bullyP: Person, target: Person, cause: Cause) {
  target.mood = Math.max(-1, target.mood - 0.2);
  feel(target, "shame", 0.4);
  psycheEvent(target, "defeat", 0.7);
  note(target, world, `${bullyP.name} picks on me again.`);
  note(bullyP, world, `Pushed ${target.name} around.`);
  wrong(world, bullyP, target, 0.25, "bully", cause, "bullying");
  const watchers = world.people.filter((q) => q !== bullyP && q !== target && dist(q.x, q.z, bullyP.x, bullyP.z) < 12 && q.age >= ADULT_AGE);
  for (const q of watchers) {
    if (valueOf(q, "fairness") > 0.65 && q.personality.boldness > 0.5) {
      relation(q, bullyP.id, world).affinity -= 0.1;
      tally(world, "bullyingChallenged");
    } else if (relation(q, bullyP.id, world).affinity > 0.4 && chance(q.id, world, "join") < 0.3) {
      // Some join in with the one they like: a bully with followers is a power in the camp.
      conflictOf(target).fear[q.id] = clamp01((target.conflict?.fear[q.id] ?? 0) + 0.2);
      tally(world, "bullyingJoined");
    }
  }
}
/** The stronger forces food from the weaker. The weaker gives it up and is afraid. */
export function coerce(world: World, strong: Person, weak: Person, cause: Cause): boolean {
  if (weak.carry.food < 1) return false;
  weak.carry.food -= 1;
  strong.carry.food = Math.min(6, strong.carry.food + 1);
  const cw = conflictOf(weak);
  cw.coerced[strong.id] = (cw.coerced[strong.id] ?? 0) + 1;
  note(weak, world, `${strong.name} made me hand over my food.`);
  note(strong, world, `Took ${weak.name}'s food by force.`);
  wrong(world, strong, weak, 0.35, "coerce", cause, "forced them to hand over food");
  tally(world, "coercions");
  return true;
}
/** Made over and over to hand over food, with no one to stand up for them, someone is bound to the one who forces them: a tithe in food, a life of giving. */
export function bind(world: World, master: Person, slave: Person): boolean {
  const cs = conflictOf(slave);
  if (cs.boundTo || (cs.coerced[master.id] ?? 0) < 3) return false;
  const allies = world.people.filter((q) => q !== slave && q !== master && q.age >= ADULT_AGE && (q.relations.get(slave.id)?.affinity ?? 0) > 0.5 && dist(q.x, q.z, slave.x, slave.z) < 30).length;
  if (allies >= 2 || might(slave) > 0.7 * might(master)) return false;
  cs.boundTo = { master: master.id, since: world.clock ?? 0, lastTithe: world.clock ?? 0 };
  logAct(world, "bind", master, slave, "power", "made them work for their keep");
  note(slave, world, `I work for ${master.name} now, and I do not choose it.`);
  note(master, world, `${slave.name} works for me.`);
  chronicle(world, `${slave.name} was forced into the service of ${master.name}.`);
  wrong(world, master, slave, 0.5, "coerce", "power", "bondage");
  tally(world, "bound");
  return true;
}
export function free(world: World, slave: Person, how: string) {
  const c = slave.conflict;
  if (!c?.boundTo) return false;
  c.boundTo = undefined;
  note(slave, world, `I am free: ${how}.`);
  chronicle(world, `${slave.name} was freed: ${how}.`);
  tally(world, "freed");
  return true;
}
/** Harsh punishment of a child. Its after-effect is on how the child comes to trust: the attachment hardens. Shown only as consequence. */
export function harsh(world: World, parent: Person, child: Person, cause: Cause) {
  const cc = conflictOf(child);
  cc.harsh++;
  const d = devOf(child);
  d.care = clamp01(d.care - 0.08);
  child.mood = Math.max(-1, child.mood - 0.25);
  feel(child, "fear", 0.4);
  feel(parent, "guilt", 0.3);
  conflictOf(parent).guilt = clamp01(conflictOf(parent).guilt + 0.08);
  logAct(world, "harsh", parent, child, cause, "harsh punishment");
  relation(child, parent.id, world).trust = Math.max(0, relation(child, parent.id, world).trust - 0.1);
  if (d.attachment && cc.harsh >= 3 && d.attachment === "secure") {
    d.attachment = "anxious";
    note(child, world, "I learned to keep out of reach.");
    milestone(child, world, "attachment", "learned to be wary of those who should be safe");
    tally(world, "attachmentHarmed");
  } else if (d.attachment === "anxious" && cc.harsh >= 6) d.attachment = "avoidant";
  tally(world, "harshPunishments");
}
/** A child left needing while someone who could feed them does not: it counts against how well they were looked after. */
export function neglect(world: World, parent: Person, child: Person, cause: Cause) {
  const d = devOf(child);
  d.lapses++;
  d.care = clamp01(d.care - 0.06);
  child.mood = Math.max(-1, child.mood - 0.15);
  logAct(world, "neglect", parent, child, cause, "left the child needing");
  conflictOf(parent).guilt = clamp01(conflictOf(parent).guilt + 0.06);
  tally(world, "neglects");
}

// ---- Greed, cheating, fraud, bribery, betrayal, informing ----

/** Taking more of the common store than is needed, while others have less. */
export function hoard(world: World, p: Person, cause: Cause): boolean {
  const store = world.things.filter((t) => t.kind === "shelter" && (t.stock ?? 0) >= 2 && dist(t.x, t.z, p.x, p.z) < 20).sort((a, b) => (b.stock ?? 0) - (a.stock ?? 0))[0];
  if (!store || p.carry.food >= 4) return false;
  const take = Math.min(2, (store.stock ?? 0) - 1);
  store.stock = (store.stock ?? 0) - take;
  p.carry.food = Math.min(6, p.carry.food + take);
  logAct(world, "hoard", p, undefined, cause, "took more than their share");
  note(p, world, "I took more from the store than I need, in case it runs out.");
  const seen = world.people.filter((q) => q !== p && q.age >= ADULT_AGE && dist(q.x, q.z, p.x, p.z) < 15);
  for (const q of seen) relation(q, p.id, world).trust = Math.max(0, relation(q, p.id, world).trust - 0.08);
  if (seen.length) tally(world, "hoardingSeen");
  tally(world, "hoarding");
  return true;
}
/** A swap where one side is short: promised wood that never comes. */
export function cheat(world: World, cheater: Person, victim: Person, cause: Cause): boolean {
  if (victim.carry.food < 1) return false;
  victim.carry.food -= 1;
  cheater.carry.food = Math.min(6, cheater.carry.food + 1);
  const f = witness(world, "deed", cheater, victim, `${cheater.name} cheated ${victim.name}`, true);
  worldConflict(world).deeds[f.id] = { act: "cheat", cause, by: cheater.id, to: victim.id };
  logAct(world, "cheat", cheater, victim, cause, "short measure in a swap");
  note(victim, world, `I think ${cheater.name} cheated me in that swap.`);
  conflictOf(cheater).guilt = clamp01(conflictOf(cheater).guilt + 0.08);
  // The cheated find out later, from how it came out; some never do.
  if (chance(victim.id, world, "notice") < 0.5 + 0.3 * victim.personality.curiosity) {
    const r = relation(victim, cheater.id, world);
    r.trust = Math.max(0, r.trust - 0.4);
    r.affinity = Math.max(-1, r.affinity - 0.2);
    conflictOf(victim).grudge[cheater.id] = clamp01((victim.conflict?.grudge[cheater.id] ?? 0) + 0.25);
    (victim.knows ??= []).includes(f.id) || victim.knows.push(f.id);
    tally(world, "cheatsFound");
  }
  tally(world, "cheats");
  return true;
}
/** Claiming a debt that was never made: the claimant's ledger says they are owed, the other's says nothing. Found when the books are compared. */
export function fraud(world: World, claimant: Person, other: Person, cause: Cause) {
  claimant.favours = { ...claimant.favours, [other.id]: (claimant.favours?.[other.id] ?? 0) + 2 };
  logAct(world, "fraud", claimant, other, cause, "claimed a debt that was never owed");
  note(claimant, world, `Told ${other.name} they owe me. They do not.`);
  tally(world, "frauds");
}
/** Whether the books agree: one side says they are owed, the other has no matching debt. */
export function fraudFound(world: World, claimant: Person, other: Person): boolean {
  const owed = claimant.favours?.[other.id] ?? 0;
  const owes = Math.max(0, -(other.favours?.[claimant.id] ?? 0));
  if (owed - owes < 1.5) return false;
  const f = witness(world, "deed", claimant, other, `${claimant.name} claimed a false debt from ${other.name}`);
  worldConflict(world).deeds[f.id] = { act: "fraud", cause: "greed", by: claimant.id, to: other.id };
  claimant.favours = { ...claimant.favours, [other.id]: owes };
  const r = relation(other, claimant.id, world);
  r.trust = Math.max(0, r.trust - 0.4);
  note(other, world, `${claimant.name} claimed a debt I never owed.`);
  tally(world, "fraudsFound");
  return true;
}
/** A gift to someone who will judge, to be judged lightly. The honest refuse, and the refusal is itself known. */
export function bribe(world: World, giver: Person, judgeP: Person): boolean {
  if (giver.carry.food < 1) return false;
  logAct(world, "bribe", giver, judgeP, "greed", "offered food for a light verdict");
  if (honestyOf(judgeP) >= 0.5) {
    note(judgeP, world, `${giver.name} tried to buy me. I refused.`);
    relation(judgeP, giver.id, world).trust = Math.max(0, relation(judgeP, giver.id, world).trust - 0.3);
    tally(world, "bribesRefused");
    return false;
  }
  giver.carry.food -= 1;
  judgeP.carry.food = Math.min(6, judgeP.carry.food + 1);
  (conflictOf(giver).bribed ??= {})[judgeP.id] = world.clock ?? 0;
  note(judgeP, world, `${giver.name} gave me food. I will remember it.`);
  tally(world, "bribesTaken");
  return true;
}
/** Selling out a friend: telling their secret to those who are against them. The friend's trust is gone and the betrayal is on their heart's record. */
export function betrayAlly(world: World, who: Person, ally: Person, toWhom: Person, cause: Cause) {
  const hr = (ally.heart ??= { betrayals: {}, hate: {}, pain: { chronic: 0, fear: 0, shame: 0, alone: 0, helpless: 0 }, acute: 0, searched: 0, joys: {}, lastAcute: -1e9, sacrifices: 0 });
  hr.betrayals[who.id] = (hr.betrayals[who.id] ?? 0) + 1;
  const r = relation(ally, who.id, world);
  r.trust = Math.max(0, r.trust - 0.5);
  r.affinity = Math.max(-1, r.affinity - 0.5);
  logAct(world, "betray", who, ally, cause, `gave ${ally.name} up to ${toWhom.name}`);
  note(ally, world, `${who.name}, whom I trusted, gave me up.`);
  note(who, world, `I gave ${ally.name} up to ${toWhom.name}.`);
  conflictOf(who).guilt = clamp01(conflictOf(who).guilt + 0.2);
  conflictOf(ally).grudge[who.id] = clamp01((ally.conflict?.grudge[who.id] ?? 0) + 0.4);
  milestone(ally, world, "betrayal", `was given up by ${who.name}`);
  tally(world, "betrayals");
}
/** Telling the judge what someone did. The one who told is distrusted by the doer's kin, which is what telling costs. */
export function inform(world: World, informer: Person, factId: string): boolean {
  const wc = worldConflict(world);
  const deed = wc.deeds[factId];
  const doer = deed ? personById(world, deed.by) : undefined;
  if (!deed || !doer || wc.informed[factId]) return false;
  wc.informed[factId] = informer.id;
  logAct(world, "inform", informer, doer, "loyalty", `told the judge what ${doer.name} did`);
  for (const q of world.people) {
    if (q === informer || !(related(world, q, doer) || (q.relations.get(doer.id)?.affinity ?? 0) > 0.6)) continue;
    const r = relation(q, informer.id, world);
    r.trust = Math.max(0, r.trust - 0.25);
    conflictOf(q).grudge[informer.id] = clamp01((q.conflict?.grudge[informer.id] ?? 0) + 0.15);
  }
  note(informer, world, `I told what ${doer.name} did.`);
  tally(world, "informings");
  return true;
}

// ---- Cases, judges and punishment ----

const SEVERITY: Partial<Record<ActKind, number>> = { theft: 0.25, fight: 0.4, bully: 0.3, coerce: 0.4, bind: 0.7, kill: 0.8, murder: 1, cheat: 0.25, fraud: 0.3, hoard: 0.2, harsh: 0.3, mob: 0.6 };
export function pickJudge(world: World, offender: Person, victim?: Person): Person | undefined {
  return adults(world)
    .filter((q) => q !== offender && q !== victim && !q.conflict?.exile && !q.conflict?.jail && !related(world, q, offender) && (!victim || !related(world, q, victim)) && q.age >= 8 && dist(q.x, q.z, offender.x, offender.z) < 60)
    .sort((a, b) => standing(world, b) * (0.6 + 0.4 * Math.min(1, b.age / 30)) - standing(world, a) * (0.6 + 0.4 * Math.min(1, a.age / 30)) || (a.id < b.id ? -1 : 1))[0];
}
export type Punishment = "warning" | "restitution" | "jail" | "exile" | "execution";
export interface Verdict { judge: string; offender: string; act: ActKind; punishment: Punishment; severity: number; bribed: boolean }
/** The people bring an offence before the one they respect most. The verdict weighs what was done, why, whom it was done to and who is judging. */
export function holdCase(world: World, offender: Person, victim: Person | undefined, act: ActKind, cause: Cause = "anger"): Verdict | undefined {
  const j = pickJudge(world, offender, victim);
  if (!j) return undefined;
  const wc = worldConflict(world);
  const co = conflictOf(offender);
  let sev = SEVERITY[act] ?? 0.3;
  // A judge close to one side leans; a stranger is judged harder; scarcity and desperation are pleaded in mitigation.
  const lean = victim ? (j.relations.get(victim.id)?.affinity ?? 0) - (j.relations.get(offender.id)?.affinity ?? 0) : 0;
  sev *= 1 + 0.25 * lean;
  sev *= 1 + 0.4 * (j.conflict?.prejudice[bandOf(world, offender)] ?? 0);
  if (cause === "desperation" || cause === "scarcity") sev *= 0.6;
  // Offered a gift first, a dishonest judge goes easy; it may come out.
  let bribed = false;
  if (co.guilt < 0.5 && offender.carry.food >= 2 && valueOf(offender, "fairness") < 0.4 && chance(offender.id, world, "bribe") < 0.5) bribed = bribe(world, offender, j);
  if (bribed) {
    sev *= 0.4;
    if (chance(j.id, world, "found") < 0.4) {
      for (const q of world.people) if (q !== j && q !== offender) relation(q, j.id, world).trust = Math.max(0, relation(q, j.id, world).trust - 0.15);
      chronicle(world, `It was said that ${j.name} took food to go easy on ${offender.name}.`);
      tally(world, "corruptJudges");
    }
  }
  // Repeat offenders are judged harder; someone already full of guilt, softer.
  sev *= 1 + 0.15 * Math.min(3, co.record.filter((r) => r === act).length) - 0.2 * co.guilt;
  const law = lawOf(world);
  let punishment: Punishment = sev < 0.2 ? "warning" : sev < 0.45 ? "restitution" : sev < 0.65 ? (law >= 0.25 ? "jail" : "exile") : sev < 0.9 ? "exile" : (act === "murder" || act === "kill") && law >= 0.5 ? "execution" : "exile";
  if (punishment === "execution" && !(act === "murder" || act === "kill")) punishment = "exile";
  const v: Verdict = { judge: j.id, offender: offender.id, act, punishment, severity: sev, bribed };
  wc.cases++;
  tally(world, "cases");
  co.record.push(act);
  note(j, world, `I judged ${offender.name} for ${act}: ${punishment}.`);
  note(offender, world, `${j.name} judged me for ${act}: ${punishment}.`);
  chronicle(world, `${j.name} judged ${offender.name} for ${act}: ${punishment}.`);
  applyPunishment(world, offender, victim, j, punishment, sev);
  // A wrong answered by the people is not left to the wronged: their hand is stayed (this is how a vengeance cycle ends by law).
  if (victim && punishment !== "warning") {
    const cv = conflictOf(victim);
    cv.grudge[offender.id] = (cv.grudge[offender.id] ?? 0) * 0.4;
    for (const q of world.people) if (q.conflict?.grudge[offender.id] && (related(world, q, victim) || (q.relations.get(victim.id)?.affinity ?? 0) > 0.6)) q.conflict.grudge[offender.id]! *= 0.5;
    wc.law = clamp01(wc.law + 0.04);
  }
  return v;
}
function applyPunishment(world: World, off: Person, victim: Person | undefined, judgeP: Person, p: Punishment, sev: number) {
  const now = world.clock ?? 0;
  const c = conflictOf(off);
  const ethos = ethosOf(world);
  // Being judged in front of everyone shames, most where shame is how wrongs are answered.
  feel(off, "shame", ethos === "shame" ? 0.8 : 0.5);
  for (const q of world.people) if (q !== off && q !== judgeP && q.age >= ADULT_AGE && dist(q.x, q.z, off.x, off.z) < 30) relation(q, off.id, world).trust = Math.max(0, relation(q, off.id, world).trust - 0.05 * (ethos === "shame" ? 2 : 1));
  if (p === "restitution" && victim) {
    if (!restitution(world, off, victim)) {
      c.owes = { to: victim.id, food: 2 };
      note(off, world, `I owe ${victim.name} two food.`);
    }
  } else if (p === "jail") {
    c.jail = { until: now + (0.5 + sev) * DAY, x: judgeP.x, z: judgeP.z };
    tally(world, "jailed");
  } else if (p === "exile") {
    c.exile = { until: now + (4 + 10 * sev) * DAY };
    tally(world, "exiled");
    chronicle(world, `${off.name} was sent away from the people.`);
  } else if (p === "execution") {
    execute(world, judgeP, off);
  }
}
/** The people put someone to death for a killing. It is not the same act as murder and is logged apart; the doer's kin may take it as a new wrong. */
export function execute(world: World, judgeP: Person, off: Person) {
  off.health = 0;
  off.cause = "the judgement of the people";
  logAct(world, "execution", judgeP, off, "honour", "the people answered a killing");
  chronicle(world, `${off.name} was put to death by the judgement of the people.`);
  tally(world, "executions");
  for (const q of world.people) {
    if (q === off || q.age < ADULT_AGE) continue;
    if (related(world, q, off)) conflictOf(q).grudge[judgeP.id] = clamp01((q.conflict?.grudge[judgeP.id] ?? 0) + 0.5 * (1 - lawOf(world)));
  }
  conflictOf(judgeP).guilt = clamp01(conflictOf(judgeP).guilt + 0.15);
}

// ---- Restitution, forgiveness, reconciliation ----

/** The doer makes it good with what they have. The wronged takes it, lets the grudge go, and the feud between the houses ends. */
export function restitution(world: World, off: Person, wronged: Person, amount = 2): boolean {
  const pay = Math.min(amount, Math.floor(off.carry.food));
  if (pay < 1) return false;
  off.carry.food -= pay;
  wronged.carry.food = Math.min(6, wronged.carry.food + pay);
  const co = conflictOf(off);
  const cw = conflictOf(wronged);
  co.owes = undefined;
  co.guilt = clamp01(co.guilt * 0.6);
  // Paid in full: the wronged and their kin let go. A smaller payment only eases it.
  const share = clamp01(pay / amount);
  for (const q of world.people) {
    const g = q.conflict?.grudge[off.id];
    if (g && (q === wronged || related(world, q, wronged) || (q.relations.get(wronged.id)?.affinity ?? 0) > 0.6)) q.conflict!.grudge[off.id] = g * (1 - 0.9 * share);
  }
  cw.grudge[off.id] = (cw.grudge[off.id] ?? 0) * (1 - 0.9 * share);
  const r = relation(wronged, off.id, world);
  r.trust = Math.min(1, r.trust + 0.25 * share);
  r.affinity = Math.min(1, r.affinity + 0.2 * share);
  note(off, world, `I made it right with ${wronged.name}.`);
  note(wronged, world, `${off.name} made it right.`);
  if (share >= 1) {
    endFeud(world, off, wronged, `${off.name} paid ${wronged.name} and it was taken`);
    chronicle(world, `${off.name} made restitution to ${wronged.name}.`);
  }
  tally(world, "restitutions");
  return true;
}
/** The wronged lets it go. Easier for the patient, and when the other is sorry. */
export function forgive(world: World, wronged: Person, off: Person): boolean {
  const cw = wronged.conflict;
  const g = cw?.grudge[off.id];
  if (!cw || !g) return false;
  cw.grudge[off.id] = g * 0.25;
  const r = relation(wronged, off.id, world);
  r.trust = Math.min(1, r.trust + 0.2);
  r.affinity = Math.min(1, r.affinity + 0.25);
  note(wronged, world, `I forgave ${off.name}.`);
  note(off, world, `${wronged.name} forgave me.`);
  conflictOf(off).guilt = clamp01(conflictOf(off).guilt * 0.7);
  feel(off, "relief", 0.5);
  tally(world, "forgiven");
  if (cw.grudge[off.id]! < 0.15) {
    relation(off, wronged.id, world).affinity = Math.min(1, relation(off, wronged.id, world).affinity + 0.25);
    endFeud(world, off, wronged, `${wronged.name} forgave ${off.name}`);
    tally(world, "reconciliations");
    chronicle(world, `${wronged.name} and ${off.name} made peace.`);
  }
  return true;
}

// ---- Mobs, scapegoats, prejudice, propaganda, tribes at war ----

/** Several turn on one person together. Each feels it less, and it goes further than any would alone. */
export function mobAgainst(world: World, target: Person, members: Person[], cause: Cause): boolean {
  if (members.length < 3) return false;
  const dmg = Math.min(0.7, 0.1 * members.length);
  harm(target, dmg);
  logAct(world, "mob", members[0]!, target, cause, `${members.length} turned on ${target.name}`);
  for (const m of members) {
    const cm = conflictOf(m);
    cm.acts++;
    cm.guilt = clamp01(cm.guilt + 0.1 / members.length * (0.4 + 0.5 * valueOf(m, "fairness")));
    cm.grudge[target.id] = 0;
  }
  const ct = conflictOf(target);
  for (const m of members) ct.grudge[m.id] = clamp01((ct.grudge[m.id] ?? 0) + 0.3);
  target.mood = Math.max(-1, target.mood - 0.4);
  feel(target, "fear", 0.8);
  note(target, world, "They turned on me together.");
  chronicle(world, `${members.length} of the people turned on ${target.name}.`);
  tally(world, "mobs");
  return true;
}
/** After a loss, the people look for someone to blame, and it is rarely the one at fault: an outsider, someone shunned, someone with few friends. */
export function scapegoat(world: World, blamers: Person[], reason: string): Person | undefined {
  const wc = worldConflict(world);
  const now = world.clock ?? 0;
  const home = bandsOf(world);
  const biggest = [...home.entries()].sort((a, b) => b[1].length - a[1].length)[0]?.[0];
  const pool = adults(world).filter((q) => !wc.scapegoats[q.id] && (bandOf(world, q) !== biggest || q.shunned || standing(world, q) < 0.35) && !(blamers.length > 1 && blamers.every((b) => b === q || bandOf(world, b) !== biggest)));
  const target = pool.sort((a, b) => standing(world, a) - standing(world, b) || (a.id < b.id ? -1 : 1))[0];
  blamers = blamers.filter((b) => b !== target && bandOf(world, b) === biggest);
  if (!target || !blamers.length) return undefined;
  wc.scapegoats[target.id] = { t: now, for: reason };
  for (const b of blamers) {
    const r = relation(b, target.id, world);
    r.trust = Math.max(0, r.trust - 0.25);
    r.affinity = Math.max(-1, r.affinity - 0.25);
    const cb = conflictOf(b);
    cb.prejudice[bandOf(world, target)] = clamp01((cb.prejudice[bandOf(world, target)] ?? 0) + 0.1);
    logAct(world, "scapegoat", b, target, "fear", `blamed ${target.name} for ${reason}`);
  }
  note(target, world, `They blame me for ${reason}, and I did nothing.`);
  chronicle(world, `${target.name} was blamed for ${reason}.`);
  tally(world, "scapegoats");
  return target;
}
/** A leader makes the case against another band to those who trust them; prejudice grows in proportion to the trust. */
export function propaganda(world: World, leader: Person, against: string, strength = 0.2): number {
  let moved = 0;
  const wc = worldConflict(world);
  for (const q of adults(world)) {
    if (q === leader || bandOf(world, q) !== bandOf(world, leader) || dist(q.x, q.z, leader.x, leader.z) > 40) continue;
    const trust = relation(q, leader.id, world).trust;
    const c = conflictOf(q);
    c.prejudice[against] = clamp01((c.prejudice[against] ?? 0) + strength * trust);
    moved++;
  }
  wc.propaganda[bandOf(world, leader)] = clamp01((wc.propaganda[bandOf(world, leader)] ?? 0) + 0.1);
  if (moved) logAct(world, "propaganda", leader, undefined, "power", `made the case against ${against}`);
  return moved;
}
const meanPrejudice = (members: Person[], against: string) => (members.length ? members.reduce((s, p) => s + (p.conflict?.prejudice[against] ?? 0), 0) / members.length : 0);
/** One band takes food from another. Defenders are hurt; a death is rare but happens. */
export function raid(world: World, from: Person[], to: Person[], cause: Cause): { loot: number; hurt: number; dead: number } {
  const now = world.clock ?? 0;
  const raiders = from.filter((p) => p.age >= ADULT_AGE && p.health > 0.5).sort((a, b) => might(b) - might(a)).slice(0, 4);
  const defenders = to.filter((p) => p.age >= ADULT_AGE);
  if (!raiders.length || !defenders.length) return { loot: 0, hurt: 0, dead: 0 };
  const force = raiders.reduce((s, p) => s + might(p), 0);
  const guard = defenders.reduce((s, p) => s + might(p), 0) * 0.9;
  const win = force > guard;
  let loot = 0;
  let hurt = 0;
  let dead = 0;
  const fa = bandOf(world, raiders[0]!);
  const fb = bandOf(world, defenders[0]!);
  for (const d of defenders.slice(0, raiders.length)) {
    if (win && d.carry.food >= 1) {
      d.carry.food -= 1;
      loot++;
    }
    harm(d, win ? 0.3 : 0.12);
    hurt++;
    conflictOf(d).grudge[raiders[0]!.id] = clamp01((d.conflict?.grudge[raiders[0]!.id] ?? 0) + 0.5);
    if (win && d.health < 0.35 && chance(d.id, world, "raidkill") < 0.35) {
      kill(world, raiders[0]!, d, cause);
      dead++;
    }
  }
  for (const r of raiders) {
    harm(r, win ? 0.08 : 0.25);
    r.carry.food = Math.min(6, r.carry.food + (win ? Math.ceil(loot / raiders.length) : 0));
    conflictOf(r).acts++;
    note(r, world, win ? "We raided them and took food." : "We raided them and were driven off.");
    if (!win && r.health < 0.35 && chance(r.id, world, "raidlost") < 0.2) {
      r.health = 0;
      r.cause = "wounds from a raid";
      dead++;
    }
  }
  for (const d of defenders) note(d, world, "We were raided.");
  logAct(world, "raid", raiders[0]!, defenders[0]!, cause, `${fa} raided ${fb}`);
  chronicle(world, `${fa} raided ${fb}${win ? " and took food" : " and were driven off"}.`);
  tally(world, "raids");
  const wc = worldConflict(world);
  let war = wc.wars.find((w) => !w.ended && ((w.a === fa && w.b === fb) || (w.a === fb && w.b === fa)));
  if (!war) wc.wars.push((war = { a: fa, b: fb, since: now, raids: 0, dead: { [fa]: 0, [fb]: 0 } }));
  war.raids++;
  war.dead[fb] = (war.dead[fb] ?? 0) + (win ? dead : 0);
  war.dead[fa] = (war.dead[fa] ?? 0) + (win ? 0 : dead);
  if (war.raids === 1) {
    tally(world, "wars");
    chronicle(world, `War broke out between ${fa} and ${fb}.`);
  }
  return { loot, hurt, dead };
}
/** A war ends when it has cost too much or gone on too long: the loser pays in food and the bands go back to keeping apart. */
function warStep(world: World) {
  const now = world.clock ?? 0;
  const wc = worldConflict(world);
  for (const w of wc.wars) {
    if (w.ended) continue;
    const dead = (w.dead[w.a] ?? 0) + (w.dead[w.b] ?? 0);
    if (dead < 2 && w.raids < 6 && now - w.since < 14 * DAY) continue;
    const loser = (w.dead[w.a] ?? 0) >= (w.dead[w.b] ?? 0) ? w.a : w.b;
    const winner = loser === w.a ? w.b : w.a;
    const payers = adults(world).filter((p) => bandOf(world, p) === loser && p.carry.food >= 1);
    const takers = adults(world).filter((p) => bandOf(world, p) === winner);
    let paid = 0;
    for (const p of payers.slice(0, takers.length)) {
      p.carry.food -= 1;
      takers[paid % takers.length]!.carry.food = Math.min(6, takers[paid % takers.length]!.carry.food + 1);
      paid++;
    }
    w.ended = { t: now, how: dead >= 2 ? "exhaustion, with tribute" : "weariness" };
    chronicle(world, `The war between ${w.a} and ${w.b} ended in ${w.ended.how}.`);
    tally(world, "warsEnded");
    for (const p of adults(world)) for (const b of [w.a, w.b]) if (p.conflict?.prejudice[b]) p.conflict.prejudice[b]! *= 0.8;
  }
}

// ---- Per-person step ----

const VIOLENT_KINDS = new Set<Intent["kind"]>(["talk", "share", "gift", "comfort", "trade", "teach"]);
/** A theft has just happened (mind.ts's steal): the victim holds it against the thief, and the thief's cause is logged. */
export function theftConflict(world: World, thief: Person, victim: Person) {
  const cause: Cause = thief.needs.hunger > 0.8 ? "desperation" : "greed";
  logAct(world, "theft", thief, victim, cause, "took food");
  const cv = conflictOf(victim);
  cv.grudge[thief.id] = clamp01((cv.grudge[thief.id] ?? 0) + 0.3);
  conflictOf(thief).guilt = clamp01((thief.conflict?.guilt ?? 0) + 0.1);
  // The victim may hit back at once, if they are bold and the thief is not far stronger.
  if (victim.age >= ADULT_AGE && chance(victim.id, world, "retort") < 0.25 * victim.personality.boldness && might(victim) > 0.6 * might(thief) && victim.needs.hunger < 0.6) fight(world, victim, thief, "guarding", "the thief was caught");
}

/** Called for each person every step. Expected rates are per day; each is small, and each yields when thirst or hunger are pressing. */
export function conflictStep(person: Person, world: World, dt: number) {
  const c = person.conflict;
  const now = world.clock ?? 0;
  if (c) upkeep(person, world, dt, c);
  if (Math.floor(now / 10) === Math.floor((now - dt) / 10) || person.age < 1) return;
  if (person.intent?.kind === "sleep" || person.intent?.kind === "flee" || person.needs.hunger >= 0.6 || person.needs.thirst >= 0.6) return;
  const k = Math.max(dt, 10) / DAY;
  const p = person.personality;
  const near = world.people.filter((q) => q !== person && dist(q.x, q.z, person.x, person.z) < 8 && q.intent?.kind !== "sleep");
  if (!near.length) return;
  const scarcity = scarcityOf(world);
  const ethos = ethosOf(world);
  const lawDefer = lawOf(world) > 0.3 ? 0.3 : 1;
  const myBand = bandOf(world, person);

  if (person.age < ADULT_AGE) return;
  const hurtBefore = 0.15 * Math.min(1, (c?.harsh ?? 0) / 4); // the harshly raised are readier to harm
  // Harm to a child by a worn-out parent: harshness, or leaving them needing.
  for (const q of near) {
    if (q.age >= ADULT_AGE || (q.mother !== person.id && q.father !== person.id)) continue;
    const worn = person.mood < -0.3 && (person.stress ?? 0) > 60;
    if (worn && p.patience < 0.5 && chance(person.id, world, `harsh${q.id}`) < 4 * k * (0.5 - p.patience + 0.2)) return void harsh(world, person, q, scarcity > 0.3 ? "scarcity" : "anger");
    if (q.needs.hunger > 0.7 && person.carry.food >= 1 && person.mood < -0.5 && chance(person.id, world, `neg${q.id}`) < 2 * k) return void neglect(world, person, q, "desperation");
  }
  for (const q of near) {
    if (q.age < 1) continue;
    const rel = person.relations.get(q.id);
    const aff = rel?.affinity ?? 0;
    const ratio = might(person) / Math.max(0.05, might(q));
    const sameBand = bandOf(world, q) === myBand;
    // 1. A caught thief at the larder, or someone coming for what they carry.
    if (q.intent?.kind === "steal" && q.intent.targetId === person.id && person.carry.food >= 1 && chance(person.id, world, `guard${q.id}`) < 3 * k * (0.3 + p.boldness)) return void fight(world, person, q, "guarding", "defending what I carry");
    // 2. Revenge: a grudge kept, an opening, and the nerve; held back where there is law, and by the weariness of a long feud.
    const g = c?.grudge[q.id] ?? 0;
    if (g >= 0.4 && q.age >= ADULT_AGE) {
      const f = worldConflict(world).feuds.find((x) => !x.ended && (x.a === house(person) || x.b === house(person)) && (x.a === house(q) || x.b === house(q)));
      const weary = 1 / (1 + 0.5 * (f?.blows ?? 0));
      const urge = 0.7 * g * (0.2 + 0.8 * p.boldness) * (ethos === "honour" ? 1.5 : 1) * weary * lawDefer * Math.min(1.5, ratio);
      if (chance(person.id, world, `rev${q.id}`) < urge * k) {
        if (g > 0.85 && ratio > 1 && chance(person.id, world, `revkill${q.id}`) < 0.3) kill(world, person, q, "revenge", true);
        else fight(world, person, q, ethos === "honour" ? "honour" : "revenge", "a grudge");
        return;
      }
    }
    // 3. A quarrel that boils over, between those who dislike each other.
    if (rel?.lastQuarrel !== undefined && now - rel.lastQuarrel < 90 && (person.emotions?.anger ?? 0) > 0.45 && (c?.escalated?.[q.id] ?? 0) !== rel.lastQuarrel && q.age >= ADULT_AGE) {
      (conflictOf(person).escalated ??= {})[q.id] = rel.lastQuarrel;
      if (chance(person.id, world, `esc${q.id}`) < 0.12 * p.boldness * (1.2 - Math.max(-0.2, aff)) * (ethos === "honour" ? 1.5 : 1)) return void fight(world, person, q, ratio > 0.8 && ratio < 1.25 ? "status" : "anger", "a quarrel that got out of hand");
    }
    // 4. Hunger in the camp: the stronger take from the weaker. Only where there is want.
    if (scarcity > 0.3 && person.needs.hunger > 0.35 && q.carry.food >= 1 && ratio > 1.4 && sameBand && chance(person.id, world, `coerce${q.id}`) < 1.5 * k * p.boldness * scarcity * (1.2 - valueOf(person, "fairness"))) {
      if (coerce(world, person, q, "scarcity")) {
        if ((q.conflict?.coerced[person.id] ?? 0) >= 3) bind(world, person, q);
        return;
      }
    }
    // 5. Bullying: the strong and unfair, picking on the weak for standing.
    if (p.boldness > 0.55 && valueOf(person, "fairness") < 0.5 && ratio > 1.3 && aff < 0.15 && chance(person.id, world, `bully${q.id}`) < 0.6 * k * (1 + hurtBefore * 4)) return void bully(world, person, q, (person.emotions?.fear ?? 0) > 0.3 ? "fear" : "status");
    // 6. Cheating and fraud among those who trust one another, by the greedy and unfair.
    if (q.age >= ADULT_AGE && (rel?.trust ?? 0) > 0.3 && valueOf(person, "fairness") < 0.35 && honestyOf(person) < 0.5) {
      if (q.carry.food >= 1 && chance(person.id, world, `cheat${q.id}`) < 0.5 * k) return void cheat(world, person, q, scarcity > 0.3 ? "scarcity" : "greed");
      if (chance(person.id, world, `fraud${q.id}`) < 0.3 * k) return void fraud(world, person, q, "greed");
    }
    // 7. A band stands up for its own against a stranger who is hurting one of them is handled by fight(); prejudice shows as distrust.
    if (!sameBand) {
      const pj = c?.prejudice[bandOf(world, q)] ?? 0;
      if (pj > 0.3 && rel && relation(person, q.id, world).familiarity < 0.5) relation(person, q.id, world).trust = Math.max(0, relation(person, q.id, world).trust - 0.0005 * pj * Math.max(dt, 10));
    }
  }
  // 8. Greed: taking more of the store than is needed, in want or by nature.
  if (scarcity > 0.25 && valueOf(person, "fairness") < 0.5 && person.personality.appetite > 0.4 && chance(person.id, world, "hoard") < 1.2 * k * scarcity) hoard(world, person, scarcity > 0.5 ? "scarcity" : "greed");
}

/** Slow upkeep every step for anyone who has conflict state: grudges and guilt fade, debts are paid, jail and exile are served, the bound pay their tithe. */
function upkeep(person: Person, world: World, dt: number, c: Conflict) {
  const now = world.clock ?? 0;
  const p = person.personality;
  // A grudge fades over weeks, sooner in the patient and fair; a feud kept up by a recent blow fades slower.
  const half = (14 + 20 * p.patience + 14 * valueOf(person, "fairness")) * DAY;
  for (const id of Object.keys(c.grudge)) {
    c.grudge[id]! *= Math.exp(-dt / (half * (ethosOf(world) === "honour" ? 1.6 : 1)));
    if (c.grudge[id]! < 0.02) delete c.grudge[id];
  }
  for (const id of Object.keys(c.fear)) if ((c.fear[id] = c.fear[id]! * Math.exp(-dt / (20 * DAY))) < 0.02) delete c.fear[id];
  // Guilt is carried for years: it fades by a few percent a month, faster when prayed away.
  if (c.guilt > 0) {
    c.guilt *= Math.exp(-dt / (400 * DAY));
    if (c.guilt > 0.05) person.mood = Math.min(person.mood, 0.55 - 0.6 * c.guilt);
  }
  if (c.owes) {
    const to = personById(world, c.owes.to);
    if (!to) c.owes = undefined;
    else if (person.carry.food >= 3 && person.needs.hunger < 0.5) restitution(world, person, to, c.owes.food);
  }
  if (c.jail) {
    if (now >= c.jail.until || person.needs.hunger > 0.7 || person.needs.thirst > 0.7) {
      note(person, world, now >= c.jail.until ? "I was let out." : "I was let out to eat and drink.");
      c.jail = undefined;
    } else if (!person.intent || person.intent.kind === "wander" || person.intent.kind === "linger") person.intent = { kind: "linger", x: c.jail.x, z: c.jail.z, speed: 1.2, remaining: 30, arrived: false };
  }
  if (c.exile) {
    if (now >= c.exile.until) {
      c.exile = undefined;
      note(person, world, "My time away is over.");
    } else if (person.needs.hunger < 0.6 && person.needs.thirst < 0.6 && (!person.intent || person.intent.kind === "wander" || person.intent.kind === "linger")) {
      const home = world.things.find((t) => t.kind === "shelter") ?? { x: 0, z: 0 };
      if (dist(person.x, person.z, home.x, home.z) < 50) {
        const a = Math.atan2(person.z - home.z, person.x - home.x);
        person.intent = { kind: "wander", x: home.x + Math.cos(a) * 70, z: home.z + Math.sin(a) * 70, speed: 1.4, remaining: 20, arrived: false };
      }
    }
  }
  if (c.boundTo) {
    const master = personById(world, c.boundTo.master);
    if (!master) free(world, person, "the one who held them is gone");
    else if (now - c.boundTo.lastTithe >= DAY / 2) {
      c.boundTo.lastTithe = now;
      if (person.carry.food >= 1 && person.needs.hunger < 0.7) {
        person.carry.food -= 1;
        master.carry.food = Math.min(6, master.carry.food + 1);
        tally(world, "tithes");
      }
      const allies = world.people.filter((q) => q !== person && q !== master && q.age >= ADULT_AGE && (q.relations.get(person.id)?.affinity ?? 0) > 0.5 && dist(q.x, q.z, person.x, person.z) < 30).length;
      if (allies >= 2) free(world, person, "friends stood up for them");
      else if (lawOf(world) >= 0.4) free(world, person, "the people would not allow it");
      else if (chance(person.id, world, "escape") < 0.12) free(world, person, "they got away");
    }
  }
  // Forgiveness: a grudge against someone near who is sorry, or who has paid, can be let go.
  if (Math.floor(now / 60) !== Math.floor((now - dt) / 60)) {
    for (const [id, g] of Object.entries(c.grudge)) {
      const off = personById(world, id);
      if (!off || g > 0.7 || dist(off.x, off.z, person.x, person.z) > 8) continue;
      if ((off.conflict?.guilt ?? 0) > 0.15 && chance(person.id, world, `forgive${id}`) < 0.4 * (0.3 + p.patience) * (1 - g)) forgive(world, person, off);
    }
  }
}

// ---- The world's day: cases, informing, scapegoating, mobs, prejudice, propaganda, raids ----

export function conflictWorld(world: World, dt: number) {
  const now = world.clock ?? 0;
  const day = Math.floor(now / DAY);
  const wc = world.conflict;
  if (!wc && !world.people.some((q) => q.conflict)) return; // nothing has happened yet: no cost
  const w = worldConflict(world);
  if (w.lastDay === day) return;
  const days = w.lastDay < 0 ? 1 : Math.min(5, day - w.lastDay);
  w.lastDay = day;
  w.law = clamp01(w.law - 0.005 * days);
  for (const b of Object.keys(w.propaganda)) w.propaganda[b]! *= 0.95;
  for (const id of Object.keys(w.scapegoats)) if (now - w.scapegoats[id]!.t > 10 * DAY) delete w.scapegoats[id];
  // A feud nobody has fed for twelve days wears out.
  for (const f of w.feuds) if (!f.ended && now - f.lastBlow > 12 * DAY) {
    f.ended = { t: now, how: "no one had the heart for it any more" };
    tally(world, "feudsEnded");
  }
  // Informing and cases: what is known of a wrong reaches the judge when someone tells, or when the whole camp knows.
  if (lawOf(world) >= 0.15) {
    for (const [id, deed] of Object.entries(w.deeds)) {
      if (w.judged.includes(id)) continue;
      const off = personById(world, deed.by);
      const victim = personById(world, deed.to);
      if (!off) { w.judged.push(id); continue; }
      const knowers = adults(world).filter((q) => q !== off && q !== victim && knowsFact(q, id));
      if (!w.informed[id]) {
        const teller = knowers.filter((q) => !related(world, q, off) && (honestyOf(q) > 0.55 || (q.conflict?.grudge[off.id] ?? 0) > 0.3 || (q.conflict?.fear[off.id] ?? 0) > 0.3)).sort((a, b) => a.id < b.id ? -1 : 1)[0];
        if (teller && chance(teller.id, world, `inform${id}`) < 0.5) inform(world, teller, id);
      }
      if (w.informed[id] || knowers.length >= 3) {
        w.judged.push(id);
        holdCase(world, off, victim, deed.act, deed.cause);
      }
    }
    if (w.judged.length > 400) w.judged.splice(0, 100);
  }
  // Misfortune looks for someone to blame: a death of illness or want in the last two days, when people are afraid.
  const recent = (world.dead ?? []).filter((d) => now - d.t < 2 * DAY && !/blow|judgement|raid/.test(d.cause));
  if (recent.length) {
    const blamers = adults(world).filter((q) => (q.emotions?.fear ?? 0) + (q.emotions?.anger ?? 0) > 0.4 && q.mood < -0.1);
    if (blamers.length >= 2 && chance("world", world, `scape${day}`) < 0.5) scapegoat(world, blamers, `the death of ${recent[0]!.person.name}`);
  }
  // Mobs: three or more with ill feeling for the same one, in a bad time.
  const heat = scarcityOf(world) + (recent.length ? 0.3 : 0);
  if (heat > 0.4) {
    for (const t of adults(world)) {
      const against = adults(world).filter((q) => q !== t && dist(q.x, q.z, t.x, t.z) < 25 && ((q.relations.get(t.id)?.affinity ?? 0) < -0.2 || w.scapegoats[t.id]) && (q.emotions?.anger ?? 0) > 0.2);
      if (against.length >= 3 && chance(t.id, world, `mob${day}`) < 0.3) { mobAgainst(world, t, against.slice(0, 5), "fear"); break; }
    }
  }
  // Prejudice: contact with another band breeds fear in want and fades when they get on; a leader makes the case.
  const bands = bandsOf(world);
  if (bands.size > 1) {
    const scarcity = scarcityOf(world);
    for (const [name, members] of bands) {
      for (const [other, theirs] of bands) {
        if (other === name) continue;
        for (const p of members) {
          const c = conflictOf(p);
          const friends = theirs.filter((q) => (p.relations.get(q.id)?.affinity ?? 0) > 0.4).length;
          c.prejudice[other] = clamp01((c.prejudice[other] ?? 0) + 0.03 * scarcity * (1 + (c.fear ? Object.keys(c.fear).length : 0)) - 0.05 * Math.min(2, friends) * (c.prejudice[other] ?? 0) - 0.003);
        }
        const leader = members.filter((p) => p.personality.boldness > 0.5).sort((a, b) => standing(world, b) - standing(world, a) || (a.id < b.id ? -1 : 1))[0];
        if (leader && scarcity > 0.35 && chance(leader.id, world, `prop${other}${day}`) < 0.5) propaganda(world, leader, other, 0.15);
      }
    }
    // Raids between bands that are afraid, want, and have a grudge to settle.
    for (const [name, members] of bands) for (const [other, theirs] of bands) {
      if (name >= other || members.length < 2 || theirs.length < 2) continue;
      for (const [x, y, xs, ys] of [[name, other, members, theirs], [other, name, theirs, members]] as const) {
        void x;
        const tension = 0.5 * scarcityOf(world) + 0.5 * (meanPrejudice(xs as Person[], y as string)) + 0.3 * (w.propaganda[x as string] ?? 0);
        if (tension > 0.35 && chance(xs[0]!.id, world, `raid${y}${day}`) < tension * tension * 0.6) {
          raid(world, xs as Person[], ys as Person[], scarcityOf(world) > 0.4 ? "scarcity" : "power");
          break;
        }
      }
    }
    warStep(world);
  }
  // Fraud found when the books are compared.
  for (const a of adults(world)) for (const b of near(world, a)) if (fraudFound(world, a, b)) break;
  void dt;
}
const near = (world: World, p: Person) => world.people.filter((q) => q !== p && q.age >= ADULT_AGE && dist(q.x, q.z, p.x, p.z) < 12 && !!p.favours?.[q.id]);

// ---- Bias on what they choose ----

/** Hatred and fear keep people apart; loyalty to their own draws them together; the judged are kept at a distance. Subtractions only, so it adds no new want. */
export function conflictBias(person: Person, world: World, opts: Option[]) {
  const c = person.conflict;
  const yielding = person.needs.hunger < 0.6 && person.needs.thirst < 0.6 ? 1 : 0;
  const myBand = bandOf(world, person);
  for (const o of opts) {
    const tid = o.intent.targetId;
    if (!tid || !VIOLENT_KINDS.has(o.intent.kind)) continue;
    const other = personById(world, tid);
    if (!other) continue;
    if (c) o.score -= 0.8 * (c.grudge[tid] ?? 0) + 0.5 * (c.fear[tid] ?? 0);
    if (other.conflict?.exile) o.score -= 0.6;
    if (other.conflict?.jail) o.score -= 0.3;
    const ob = bandOf(world, other);
    if (ob === myBand) o.score += 0.08 * yielding;
    else o.score -= 0.5 * (c?.prejudice[ob] ?? 0);
  }
}
