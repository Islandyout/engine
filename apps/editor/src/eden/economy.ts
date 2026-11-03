// How a people come to live off one another's work: things that are someone's, what each is good at, a market with prices, a good that
// becomes money, debts that grow, savings that are invested, pay for work, and the memory (tally, writing) that keeps accounts honest.
//
//  OWNERSHIP: what a person builds or plants is theirs; taking it is a wrong done to them (a grievance, and restitution where there is a
//  way to enforce it); at death it passes to an heir.
//  SPECIALISATION: what a person makes most of is their speciality; goods beyond their own use are surplus, carried to a market.
//  TRADE: a fair on every fourth day at the camp; prices move with supply and demand; haggling; a caravan comes from outside; a middleman
//  can profit from distance; food spoils (slower in winter and in a granary) so timing matters.
//  MONEY: no good is money until it has been taken in payment by people who did not want it themselves, over and over; then it is the
//  unit of account. Debts carry interest. A granary held in common is insurance. Savings compound, so inequality does.
//  LABOUR: a wage is paid for a day's work; a worker is under the employer's orders; a default that cannot be paid becomes bonded work.
//  INSTITUTIONS: with no counting, amounts are guessed and debts live in memory (and are sometimes forgotten); with tally sticks and with
//  writing, an account is kept that settles what was owed.
// Chances are drawn from a hash of who, when and what, not from the person's random stream, so seeded lives elsewhere are unchanged.
import { DAY, YEAR } from "./earth";
import { feel } from "./inner";
import { SKILLS, skillOf, type Skill } from "./identity";
import { knows } from "./culture";
import { obedience, closeKin } from "./lifecycle";
import { ADULT_AGE, chronicle, note, relation, tally, personById, thingById, type Intent, type IntentKind, type Person, type Thing, type World } from "./mind";

type Option = { intent: Omit<Intent, "arrived">; score: number; reason?: string };
export type Good = "food" | "wood" | "hide" | "seed" | "shell";
export const GOODS: readonly Good[] = ["food", "wood", "hide", "seed", "shell"];
const DURABLE: readonly Good[] = ["wood", "hide", "shell"];
export type Class = "owner" | "commoner" | "worker" | "poor" | "bonded";

export interface Debt {
  id: number;
  debtor: string;
  creditor: string;
  good: Good;
  principal: number;
  owed: number;
  rate: number; // per year, compounding
  since: number;
  due: number;
  state: "open" | "repaid" | "defaulted" | "bonded";
  why: "loan" | "restitution" | "wage";
  disputed?: boolean;
}
export interface Job {
  employer: string;
  good: Good;
  wage: number; // per day
  since: number;
  unpaid: number;
  bonded?: boolean;
  debt?: number; // the debt being worked off
}
export interface PersonEcon {
  shells: number;
  made: Partial<Record<Good, number>>; // what they have produced, by good
  made7: number; // value made today so far (food units)
  capital: number; // savings beyond what they carry, in food units
  grievances: Record<string, number>; // times each person has taken what was theirs
  repaid: number;
  defaulted: number;
  job?: Job;
  order?: { by: string; kind: IntentKind; until: number };
  member?: boolean; // in the granary pool
  class?: Class;
  speciality?: Skill;
  spoilAcc?: number; // food gone bad but not yet thrown out
  profit: number; // gained as a middleman
  shares: Record<string, number>; // venture id -> shares
  store?: Partial<Record<Good, number>>; // savings kept as goods (in a shelter or a hole in the ground), not as a number
}
export interface Venture {
  id: string;
  kind: "boat" | "mill";
  cost: number; // wood
  raised: number;
  shares: Record<string, number>;
  built: boolean;
  fundamental: number; // what a share is worth by what the venture yields
  sentiment: number; // how far talk has run ahead of that (a bubble when large, a crash when it breaks)
  crashAt: number;
  dividends: number;
  founder?: string;
}
export interface WorldEcon {
  day: number; // last day processed
  prices: Partial<Record<Good, number>>; // in food units
  history: Partial<Record<Good, number[]>>; // one price a day, the last 64
  accepted: Partial<Record<Good, string[]>>; // who has taken this good in payment without wanting it
  money?: Good;
  debts: Debt[];
  nextDebt: number;
  ledger: { t: number; kind: string; from: string; to: string; good: Good; n: number; debt?: number }[];
  granary: { food: number; paid: number; drawn: number };
  ventures: Venture[];
  market?: { x: number; z: number; day: number };
  caravan?: { until: number; shell: number; hide: number };
  tribute: number; // fraction of food surplus given to the granary each day (0 = none)
  giniSeries?: number[]; // the Gini over wealth, every fourth day (the last 64)
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const dist = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);
export const chanceOf = (salt: string): number => {
  let h = 2166136261;
  for (let i = 0; i < salt.length; i++) h = Math.imul(h ^ salt.charCodeAt(i), 16777619);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519);
  return ((h >>> 0) % 100000) / 100000;
};
export const econOf = (p: Person): PersonEcon => (p.econ ??= { shells: 0, made: {}, made7: 0, capital: 0, grievances: {}, repaid: 0, defaulted: 0, profit: 0, shares: {} });
export const worldEcon = (w: World): WorldEcon => (w.econ ??= { day: Math.floor((w.clock ?? 0) / DAY), prices: {}, history: {}, accepted: {}, debts: [], nextDebt: 1, ledger: [], granary: { food: 0, paid: 0, drawn: 0 }, ventures: [], tribute: 0 });

const BASE: Record<Good, number> = { food: 1, wood: 0.7, hide: 2, seed: 1.5, shell: 1 };
const SPOIL_BY_SEASON = [0.04, 0.08, 0.05, 0.01]; // share of carried food lost per day
const FAIR_EVERY = 4;
const OWNABLE = new Set(["shelter", "crop", "snare", "weir", "garden", "field", "boat", "mill"]);

export const heldOf = (p: Person, g: Good): number => (g === "shell" ? econOf(p).shells : (p.carry[g] ?? 0));
function setHeld(p: Person, g: Good, v: number) {
  if (g === "shell") econOf(p).shells = Math.max(0, v);
  else p.carry[g] = Math.max(0, v);
}
const addHeld = (p: Person, g: Good, n: number) => setHeld(p, g, heldOf(p, g) + n);
const adults = (w: World) => w.people.filter((q) => q.age >= ADULT_AGE && !q.stranger);
const nameOf = (w: World, id: string) => personById(w, id)?.name ?? id;

// ---- Institutions: what keeps an account ----

export type LedgerKind = "memory" | "tally" | "written";
export function ledgerKind(world: World): LedgerKind {
  return knows(world, "writing") ? "written" : knows(world, "counting") ? "tally" : "memory";
}
function record(world: World, kind: string, from: string, to: string, good: Good, n: number, debt?: number) {
  if (ledgerKind(world) === "memory") return; // nothing is kept but what people remember
  const e = worldEcon(world);
  e.ledger.push({ t: world.clock ?? 0, kind, from, to, good, n, debt });
  if (e.ledger.length > 600) e.ledger.splice(0, e.ledger.length - 600);
}
/** What the account says is owed by `debtor` to `creditor` (principal and repayments), or undefined when no account is kept. */
export function ledgerBalance(world: World, debtor: string, creditor: string): number | undefined {
  if (ledgerKind(world) === "memory") return undefined;
  let n = 0;
  for (const e of worldEcon(world).ledger) {
    if (e.from === creditor && e.to === debtor && e.kind === "loan") n += e.n;
    if (e.from === debtor && e.to === creditor && e.kind === "repay") n -= e.n;
  }
  return n;
}
/** Before counting an amount is a handful, near what was meant; after it, exact (weights and measures). */
export function measure(world: World, n: number, salt: string): number {
  if (knows(world, "counting")) return n;
  return Math.max(1, Math.round(n * (0.7 + 0.6 * chanceOf(`measure|${salt}|${Math.floor((world.clock ?? 0) / 60)}`))));
}

// ---- Ownership ----

export const ownerOf = (t: Thing): string | undefined => t.owner;
export function claim(world: World, person: Person, thing: Thing): boolean {
  if (!OWNABLE.has(thing.kind) || thing.owner) return false;
  thing.owner = person.id;
  tally(world, "claimed");
  return true;
}
/** Something taken that was someone's. A grievance with the owner; where there is a way to enforce it, restitution owed. */
export function wrong(world: World, thief: Person, owner: Person, what: Good, n: number, excuse = 0): boolean {
  if (owner.id === thief.id) return false;
  const s = 1 - 0.5 * clamp(excuse, 0, 1); // the starving are less blamed
  const eo = econOf(owner);
  eo.grievances[thief.id] = (eo.grievances[thief.id] ?? 0) + 1;
  const r = relation(owner, thief.id, world);
  r.trust = Math.max(0, r.trust - 0.2 * s);
  r.affinity = Math.max(-1, r.affinity - 0.12 * s);
  feel(owner, "anger", 0.45 * s);
  note(owner, world, `${thief.name} took ${n === 1 ? "some" : n} of my ${what}.`);
  tally(world, "propertyTheft");
  const witnesses = world.people.filter((q) => q !== thief && q !== owner && dist(q.x, q.z, owner.x, owner.z) < 25).length;
  // A starving thief is not made a debtor; a second taking from the same owner adds to the debt that is already open instead of opening another
  // (a debt a day per meal ended with most of a camp in bondage for a few mouthfuls).
  if (excuse < 0.7 && (ledgerKind(world) !== "memory" || witnesses >= 2)) {
    const open = worldEcon(world).debts.find((d) => d.state === "open" && d.why === "restitution" && d.debtor === thief.id && d.creditor === owner.id);
    if (open) open.owed = Math.min(open.owed + n * 1.5, 6);
    else lend(world, owner, thief, what, 0, { restitution: n * 1.5 });
    tally(world, "restitutionOwed");
  }
  return true;
}
/** A person-to-person theft (mind.ts has already moved the goods and worsened the relation). */
export function economyTheft(world: World, thief: Person, victim: Person, what: Good, n: number) {
  wrong(world, thief, victim, what, n, thief.needs.hunger);
}
/** A thing taken from: its owner (if another) is wronged. Kin of the owner may use it. */
export function takeFromOwned(world: World, person: Person, thing: Thing, n = 1): boolean {
  const owner = personById(world, thing.owner);
  if (!owner || owner.id === person.id) return false;
  if (closeKin(world, person, owner)) return false;
  // What a friend takes from your store is a favour, not a theft: the owner who trusts them leaves it to them.
  if (relation(owner, person.id, world).trust >= 0.5) {
    tally(world, "ownerLeave");
    return false;
  }
  return wrong(world, person, owner, "food", n, person.needs.hunger);
}
/** What they owned passes to an heir (land to the eldest, coin shared), debts with it; with no heir it becomes common. */
export function inheritHoldings(world: World, dead: Person, heirs: Person[]) {
  const e = world.econ;
  for (const t of world.things) {
    if (t.owner !== dead.id) continue;
    t.owner = heirs[0]?.id;
    if (heirs[0]) {
      note(heirs[0], world, `${dead.name}'s ${t.kind} is mine now.`);
      tally(world, "landInherited");
    }
  }
  const ed = dead.econ;
  if (ed && heirs.length) {
    for (const h of heirs) econOf(h).shells += ed.shells / heirs.length;
    ed.shells = 0;
  }
  if (e && heirs[0]) for (const d of e.debts) {
    if (d.state !== "open") continue;
    if (d.debtor === dead.id) d.debtor = heirs[0].id;
    else if (d.creditor === dead.id) d.creditor = heirs[0].id;
  }
}

// ---- Prices, spoilage, specialisation ----

const surplusOf = (p: Person, g: Good): number => {
  const h = heldOf(p, g);
  return g === "food" ? Math.max(0, h - 3) : g === "wood" ? Math.max(0, h - 4) : g === "hide" ? Math.max(0, h - 1) : g === "seed" ? Math.max(0, h - 2) : 0;
};
const wantOf = (w: World, p: Person, g: Good): number => {
  const h = heldOf(p, g);
  const winter = (w.weather?.season ?? 1) === 3 || (w.weather?.season ?? 1) === 2;
  if (g === "food") return p.needs.hunger > 0.4 || h < 1 ? Math.max(0, 3 - h) : 0;
  if (g === "wood") return p.cold > 0.25 || winter ? Math.max(0, 4 - h) : 0;
  if (g === "hide") return (p.clothing ?? 0) < 0.7 && h < 1 ? 1 : 0;
  if (g === "seed") return skillOf(p, "farm") > 0.3 && h < 1 ? 1 : 0;
  return 0;
};
export function priceOf(world: World, g: Good): number {
  const base = worldEcon(world).prices[g] ?? BASE[g];
  if (knows(world, "counting")) return Math.round(base * 100) / 100;
  return base * (0.75 + 0.5 * chanceOf(`price|${g}|${Math.floor((world.clock ?? 0) / DAY)}`)); // before counting, a price is a feeling
}
/** The price in the unit of account: the money good once there is one, else food. */
export function quote(world: World, g: Good): { price: number; unit: Good } {
  const e = worldEcon(world);
  if (e.money && e.money !== g) return { price: Math.round((priceOf(world, g) / priceOf(world, e.money)) * 100) / 100, unit: e.money };
  return { price: priceOf(world, g), unit: "food" };
}
function repriceDay(world: World) {
  const e = worldEcon(world);
  const ps = adults(world);
  if (!ps.length) return;
  for (const g of GOODS) {
    if (g === "shell") {
      e.prices.shell = BASE.shell;
      continue;
    }
    const supply = ps.reduce((a, q) => a + heldOf(q, g), 0) + (g === "food" ? e.granary.food : 0) + 1;
    const demand = ps.reduce((a, q) => a + wantOf(world, q, g) + (g === "food" ? 0.5 : 0), 0) + 1;
    const target = BASE[g] * Math.pow(clamp(demand / supply * (g === "food" ? 2 : 1), 0.3, 6), 0.8);
    const was = e.prices[g] ?? BASE[g];
    e.prices[g] = was + (target - was) * 0.5;
    (e.history[g] ??= []).push(e.prices[g]!);
    if (e.history[g]!.length > 64) e.history[g]!.shift();
  }
}
/** The price a food-unit good fetches with food scarce versus plentiful: for tests and the Creator's curiosity. */
export function priceSeries(world: World, g: Good): number[] {
  return worldEcon(world).history[g] ?? [];
}
export function spoilRate(world: World, where: "carried" | "shelter" | "granary"): number {
  const r = SPOIL_BY_SEASON[world.weather?.season ?? 1]!;
  return where === "carried" ? r : where === "shelter" ? r * 0.3 : r * 0.15;
}
/** Food kept goes off, faster in the heat. Per person, every step. */
export function spoilStep(person: Person, world: World, dt: number) {
  if (person.carry.food <= 0) return;
  // The loss builds up and comes off in bites of a quarter meal: a share of what is kept goes bad, and is thrown out when it is noticed.
  const e = econOf(person);
  e.spoilAcc = (e.spoilAcc ?? 0) + (person.carry.food * spoilRate(world, "carried") * dt) / DAY;
  if (e.spoilAcc >= 0.25) {
    const lost = Math.min(person.carry.food, Math.floor(e.spoilAcc / 0.25) * 0.25);
    person.carry.food -= lost;
    e.spoilAcc -= lost;
    world.tally = world.tally ?? {};
    world.tally.foodSpoiled = (world.tally.foodSpoiled ?? 0) + lost;
  }
}
const SKILL_GOOD: Record<Skill, Good | undefined> = { forage: "food", fish: "food", hunt: "food", farm: "food", build: "wood", heal: undefined };
export function specialityOf(p: Person): Skill | undefined {
  let best: Skill | undefined;
  let v = 0.3;
  for (const sk of SKILLS) {
    const s = skillOf(p, sk);
    if (s > v) { v = s; best = sk; }
  }
  return best;
}
/** A day's work for another: skill, doubled by the right tool. */
export function outputOf(p: Person): { good: Good; n: number } {
  const sp = specialityOf(p) ?? "forage";
  const tool = (sp === "hunt" && p.tools.spear) || (sp === "fish" && p.tools.net) ? 1.3 : 1;
  return { good: SKILL_GOOD[sp] ?? "food", n: Math.round((0.8 + 2.2 * skillOf(p, sp)) * tool * 10) / 10 };
}
const MADE_BY: Partial<Record<IntentKind, Good>> = { hunt: "food", fish: "food", forage: "food", gather: "wood", build: "wood", plant: "seed", fetch: "wood" };
/** How much of what they made was one thing: 1 is all of it. */
export function specialisation(p: Person): number {
  const m = econOf(p).made;
  const tot = (m.food ?? 0) + (m.wood ?? 0) + (m.hide ?? 0) + (m.seed ?? 0);
  return tot < 4 ? 0 : Math.max(m.food ?? 0, m.wood ?? 0, m.hide ?? 0, m.seed ?? 0) / tot;
}

// ---- Trade: haggling, exchange, market, caravan, broker ----

/** The price two people settle on: from the going price, pushed by boldness and patience, drawn back toward it by trust. Within what each would take. */
export function haggle(world: World, seller: Person, buyer: Person, g: Good): number {
  const p = priceOf(world, g);
  const ask = p * (1 + 0.3 * seller.personality.boldness);
  const bid = p * (1 - 0.3 * buyer.personality.boldness);
  const w = seller.personality.patience / (seller.personality.patience + buyer.personality.patience + 1e-6);
  let deal = bid + w * (ask - bid);
  const trust = (relation(seller, buyer.id, world).trust + relation(buyer, seller.id, world).trust) / 2;
  deal = p + (deal - p) * (1 - 0.5 * trust);
  return clamp(deal, p * 0.8, p * 1.2);
}
const moneyGood = (w: World): Good | undefined => worldEcon(w).money;
function accept(world: World, seller: Person, g: Good) {
  if (wantOf(world, seller, g) > 0 || !DURABLE.includes(g)) return; // taken for use, or it would not keep: not a way of holding value
  const e = worldEcon(world);
  const list = (e.accepted[g] ??= []);
  list.push(seller.id);
  if (list.length > 200) list.shift();
  if (e.money) return;
  const best = DURABLE.map((d) => ({ d, n: e.accepted[d]?.length ?? 0, who: new Set(e.accepted[d] ?? []).size })).sort((a, b) => b.n - a.n)[0]!;
  if (best.n >= 6 && best.who >= 3 && best.d === g) {
    e.money = g;
    tally(world, "moneyAdopted");
    chronicle(world, `The people had taken ${g === "shell" ? "shells" : g} in payment so often, and from so many, that all began to count prices in ${g === "shell" ? "shells" : g}: money.`);
  }
}
/** `seller` gives `n` of `sell` to `buyer`, who pays at the haggled price in what they have: money if there is any, else what the seller will take. */
export function exchange(world: World, seller: Person, buyer: Person, sell: Good, n: number): { ok: true; paid: Good; amount: number; price: number } | { ok: false; why: string } {
  if (seller.id === buyer.id) return { ok: false, why: "nobody trades with themselves" };
  const have = measure(world, n, `${seller.id}|${buyer.id}|${sell}`);
  if (heldOf(seller, sell) < have) return { ok: false, why: `${seller.name} has no ${sell} to spare` };
  const unitPrice = haggle(world, seller, buyer, sell); // in food units
  const worth = unitPrice * have;
  const money = moneyGood(world);
  const order: Good[] = [...(money ? [money] : []), ...GOODS.filter((g) => g !== sell && g !== money)];
  for (const pay of order) {
    const per = pay === "shell" ? 1 : priceOf(world, pay);
    const amount = Math.max(1, Math.ceil((worth / per) * 10) / 10);
    if (heldOf(buyer, pay) < amount) continue;
    if (pay !== money && wantOf(world, seller, pay) <= 0 && !DURABLE.includes(pay)) continue; // the seller will not take what spoils and they do not need
    if (pay !== "shell" && pay !== money && amount < 1) continue;
    addHeld(seller, sell, -have);
    addHeld(buyer, sell, have);
    addHeld(buyer, pay, -amount);
    addHeld(seller, pay, amount);
    accept(world, seller, pay);
    record(world, "sale", seller.id, buyer.id, sell, have);
    for (const [a, b] of [[seller, buyer], [buyer, seller]] as const) {
      const r = relation(a, b.id, world);
      r.trust = Math.min(1, r.trust + 0.03);
    }
    tally(world, "marketTrades");
    return { ok: true, paid: pay, amount, price: unitPrice };
  }
  return { ok: false, why: `${buyer.name} has nothing ${seller.name} would take for it` };
}
/** A middleman buys of one who has and sells to one who wants, for more: the gap is the pay for the carrying. */
export function broker(world: World, merchant: Person, seller: Person, buyer: Person, g: Good, n: number): { ok: boolean; profit: number; why?: string } {
  const first = exchange(world, seller, merchant, g, n);
  if (!first.ok) return { ok: false, profit: 0, why: first.why };
  const second = exchange(world, merchant, buyer, g, n);
  if (!second.ok) return { ok: false, profit: 0, why: second.why };
  const spent = first.amount * (first.paid === "shell" ? 1 : priceOf(world, first.paid));
  const got = second.amount * (second.paid === "shell" ? 1 : priceOf(world, second.paid));
  const profit = got - spent;
  econOf(merchant).profit += profit;
  tally(world, "brokered");
  return { ok: true, profit };
}
export const marketOpen = (world: World): boolean => {
  const m = world.econ?.market;
  const t = (world.clock ?? 0) % DAY;
  return !!m && m.day === Math.floor((world.clock ?? 0) / DAY) && t > 0.4 * DAY && t < 0.75 * DAY;
};
/** The caravan from outside buys surplus food and wood, and sells hide and shells. */
export function caravanTrade(world: World, person: Person): boolean {
  const c = world.econ?.caravan;
  if (!c || c.until < (world.clock ?? 0)) return false;
  let did = false;
  for (const g of ["food", "wood"] as const) {
    const n = Math.floor(surplusOf(person, g));
    if (n < 1) continue;
    const want = priceOf(world, g) * 0.9 * n;
    const pay: Good = c.shell > 0 && c.shell >= want ? "shell" : "hide";
    const amount = pay === "shell" ? Math.min(c.shell, Math.round(want)) : Math.min(c.hide, Math.max(1, Math.floor(want / BASE.hide)));
    if (amount < 1) continue;
    addHeld(person, g, -n);
    addHeld(person, pay, amount);
    if (pay === "shell") c.shell -= amount;
    else c.hide -= amount;
    tally(world, "caravanTrades");
    did = true;
  }
  if (did) note(person, world, "Traded with the travellers who came from far away.");
  return did;
}
/** Called when a trade intent finishes: a walk to the market is handled here. */
export function marketTrade(world: World, person: Person, intent: Intent): boolean {
  if (intent.targetId !== "market") return false;
  if (!marketOpen(world)) return true;
  caravanTrade(world, person);
  for (const other of adults(world)) {
    if (other === person || dist(other.x, other.z, person.x, person.z) > 15) continue;
    for (const g of ["food", "wood", "hide", "seed"] as const) {
      const n = Math.floor(surplusOf(person, g));
      if (n >= 1 && wantOf(world, other, g) > 0) {
        const r = exchange(world, person, other, g, Math.min(n, Math.ceil(wantOf(world, other, g))));
        if (r.ok) {
          const q = quote(world, g);
          note(person, world, `At the fair I sold ${g} to ${other.name}, the going price ${q.price} ${q.unit === "shell" ? "shells" : q.unit}.`);
        }
      }
    }
  }
  // A go-between buys of one who has to spare and sells to one who wants it, for the difference.
  if (person.personality.boldness > 0.45 && person.personality.curiosity > 0.4 && free(person)) {
    const near = adults(world).filter((o) => o !== person && dist(o.x, o.z, person.x, person.z) < 15);
    for (const g of ["food", "wood", "hide"] as const) {
      const seller = near.find((o) => Math.floor(surplusOf(o, g)) >= 1);
      const buyer = near.find((o) => o !== seller && wantOf(world, o, g) > 0);
      if (seller && buyer) {
        const r = broker(world, person, seller, buyer, g, 1);
        if (r.ok) {
          note(person, world, `At the fair I bought ${g} of ${seller.name} and sold it to ${buyer.name}, and kept the difference.`);
          break;
        }
      }
    }
  }
  return true;
}

// ---- Debt, credit, tribute, insurance ----

export function creditworthy(world: World, lender: Person, borrower: Person): { ok: boolean; why?: string } {
  const eb = econOf(borrower);
  const known = ledgerKind(world) !== "memory"; // with an account kept, a default is known to all
  const trust = relation(lender, borrower.id, world).trust;
  const lastDefaultHere = worldEcon(world).debts.some((d) => d.debtor === borrower.id && d.creditor === lender.id && (d.state === "defaulted" || d.state === "bonded"));
  if (lastDefaultHere) return { ok: false, why: `${borrower.name} has not paid ${lender.name} before` };
  if (known && eb.defaulted > eb.repaid) return { ok: false, why: `it is written that ${borrower.name} has not paid` };
  if (trust < 0.4) return { ok: false, why: `${lender.name} does not trust ${borrower.name} enough` };
  // Where an account is kept the books say how much is out already, and a lender reads them.
  const owing = ledgerBalance(world, borrower.id, lender.id);
  if (owing !== undefined && owing > 6) return { ok: false, why: `the books show ${borrower.name} already owes ${lender.name} ${Math.round(owing)}` };
  return { ok: true };
}
export function interestRate(world: World, lender: Person, borrower: Person): number {
  if (!knows(world, "counting")) return 0; // interest cannot be reckoned without numbers: a loan is a favour
  const trust = relation(lender, borrower.id, world).trust;
  const poor = (econOf(borrower).class ?? "commoner") === "poor" ? 1.5 : 1;
  return Math.round(0.25 * (1 + 1.5 * (1 - trust)) * poor * 100) / 100;
}
/** A loan: `n` of `good` from lender to borrower, repaid with interest after a term. With `restitution`, no goods move: a debt for what was taken. */
export function lend(world: World, lender: Person, borrower: Person, good: Good, n: number, opts: { rate?: number; days?: number; restitution?: number } = {}): { ok: true; debt: Debt } | { ok: false; why: string } {
  const e = worldEcon(world);
  const rest = opts.restitution !== undefined;
  if (!rest) {
    const c = creditworthy(world, lender, borrower);
    if (!c.ok) return { ok: false, why: c.why ?? "refused" };
    if (heldOf(lender, good) < n) return { ok: false, why: `${lender.name} has not that much ${good}` };
    addHeld(lender, good, -n);
    addHeld(borrower, good, n);
  }
  const principal = rest ? opts.restitution! : n;
  const rate = rest ? 0 : (opts.rate ?? interestRate(world, lender, borrower));
  const d: Debt = { id: e.nextDebt++, debtor: borrower.id, creditor: lender.id, good, principal, owed: principal, rate, since: world.clock ?? 0, due: (world.clock ?? 0) + (opts.days ?? 8) * DAY, state: "open", why: rest ? "restitution" : "loan" };
  e.debts.push(d);
  record(world, "loan", lender.id, borrower.id, good, principal, d.id);
  tally(world, rest ? "restitutionDebts" : "loans");
  if (!rest) note(borrower, world, `${lender.name} lent me ${n} ${good}${rate ? `, to be repaid with interest` : ""}.`);
  return { ok: true, debt: d };
}
export const owedBy = (world: World, p: Person): number => worldEcon(world).debts.filter((d) => d.debtor === p.id && (d.state === "open" || d.state === "bonded")).reduce((a, d) => a + d.owed * priceOf(world, d.good), 0);
export function accrue(world: World, seconds: number) {
  for (const d of worldEcon(world).debts) if (d.state === "open" && d.rate > 0) d.owed *= Math.pow(1 + d.rate, seconds / YEAR);
}
export function repay(world: World, debtor: Person, d: Debt, n: number): number {
  const creditor = personById(world, d.creditor);
  const pay = Math.min(n, d.owed, heldOf(debtor, d.good));
  if (pay <= 0) return 0;
  addHeld(debtor, d.good, -pay);
  if (creditor) addHeld(creditor, d.good, pay);
  d.owed -= pay;
  record(world, "repay", debtor.id, d.creditor, d.good, pay, d.id);
  if (d.owed < 1e-6) {
    d.state = "repaid";
    econOf(debtor).repaid++;
    if (creditor) {
      const r = relation(creditor, debtor.id, world);
      r.trust = Math.min(1, r.trust + 0.08);
    }
    tally(world, "loansRepaid");
  }
  return pay;
}
function settleDebts(world: World) {
  const now = world.clock ?? 0;
  for (const d of worldEcon(world).debts) {
    if (d.state !== "open") continue;
    const debtor = personById(world, d.debtor);
    const creditor = personById(world, d.creditor);
    if (!debtor) { d.state = "defaulted"; continue; }
    // With nothing kept but memory, a debt is sometimes forgotten, or said to be.
    if (!d.disputed && now >= d.due && ledgerKind(world) === "memory" && d.why === "loan" && chanceOf(`forget|${d.id}`) < 0.25) {
      d.disputed = true;
      tally(world, "debtsDisputed");
      if (creditor) note(creditor, world, `${debtor.name} says he owes me nothing. I cannot show it.`);
    }
    if (d.disputed) continue;
    // A debt that falls due is paid out of the store first.
    if (now >= d.due - DAY) {
      const st = debtor.econ?.store;
      const short = d.owed + (d.good === "food" ? 1 : 0) - heldOf(debtor, d.good);
      if (st && (st[d.good] ?? 0) > 0 && short > 0) {
        const take = Math.min(st[d.good]!, short);
        st[d.good]! -= take;
        addHeld(debtor, d.good, take);
      }
    }
    if (now >= d.due - DAY && heldOf(debtor, d.good) >= d.owed + (d.good === "food" ? 1 : 0)) repay(world, debtor, d, d.owed);
    else if (now >= d.due && heldOf(debtor, d.good) > (d.good === "food" ? 2 : 0)) repay(world, debtor, d, heldOf(debtor, d.good) - (d.good === "food" ? 2 : 0));
    if (d.state === "open" && now >= d.due + 4 * DAY) {
      d.state = "defaulted";
      econOf(debtor).defaulted++;
      tally(world, "defaults");
      if (creditor) {
        const r = relation(creditor, debtor.id, world);
        r.trust = Math.max(0, r.trust - 0.4);
        r.affinity = Math.max(-1, r.affinity - 0.2);
        feel(creditor, "anger", 0.4);
        note(creditor, world, `${debtor.name} has not paid what is owed.`);
        // The creditor can take it out in work, if the debtor has no other job: debt bondage.
        if (!econOf(debtor).job && d.why !== "wage" && (d.why === "loan" || d.owed >= 4)) {
          econOf(debtor).job = { employer: creditor.id, good: d.good, wage: 0, since: now, unpaid: 0, bonded: true, debt: d.id };
          d.state = "bonded";
          tally(world, "bondage");
          note(debtor, world, `I cannot pay ${creditor.name}, so I work for them until it is cleared.`);
        }
      }
    }
  }
}
/** Give a part of food surplus to the granary, as tribute or as dues. */
export function levy(world: World, rate: number): number {
  let total = 0;
  for (const p of adults(world)) {
    const n = surplusOf(p, "food") * rate;
    if (n <= 0) continue;
    p.carry.food -= n;
    total += n;
  }
  worldEcon(world).granary.food += total;
  worldEcon(world).granary.paid += total;
  return total;
}
export function joinGranary(world: World, p: Person) {
  econOf(p).member = true;
}
/** A member in need draws from the granary. */
export function draw(world: World, p: Person, n = 2): number {
  const e = worldEcon(world);
  if (!econOf(p).member) return 0;
  const take = Math.min(n, e.granary.food);
  if (take <= 0) return 0;
  e.granary.food -= take;
  e.granary.drawn += take;
  p.carry.food += take;
  tally(world, "insurancePaid");
  note(p, world, "The granary we all pay into gave me food when I had none.");
  return take;
}

// ---- Capital, ventures, speculation, class ----

export function startVenture(world: World, founder: Person, kind: "boat" | "mill", cost: number): Venture {
  const v: Venture = { id: `${kind}-${worldEcon(world).ventures.length + 1}`, kind, cost, raised: 0, shares: {}, built: false, fundamental: 0, sentiment: 0, crashAt: 1.1 + 0.3 * chanceOf(`crash|${founder.id}|${cost}`), dividends: 0, founder: founder.id };
  worldEcon(world).ventures.push(v);
  return v;
}
/** Put wood into a venture for shares. Once the cost is raised it is built and pays a share of its yield each day. */
export function invest(world: World, p: Person, v: Venture, wood: number): { ok: boolean; why?: string } {
  if (v.built) return { ok: false, why: "it is already built" };
  if (p.carry.wood < wood || wood <= 0) return { ok: false, why: "not enough wood to put in" };
  p.carry.wood -= wood;
  v.raised += wood;
  v.shares[p.id] = (v.shares[p.id] ?? 0) + wood;
  econOf(p).shares[v.id] = v.shares[p.id]!;
  if (v.raised >= v.cost) {
    v.built = true;
    v.fundamental = v.cost * 1.2;
    chronicle(world, `${Object.keys(v.shares).map((id) => nameOf(world, id)).join(" and ")} built a ${v.kind} together and shared in what it gave.`);
    tally(world, "venturesBuilt");
  }
  return { ok: true };
}
export const sharePrice = (v: Venture): number => (v.fundamental / Math.max(1, v.raised)) * (1 + v.sentiment);
/** Buying on talk of rising prices pushes them on; past some point it breaks. */
export function speculate(v: Venture, buying: number) {
  v.sentiment += 0.1 * buying;
}
function ventureDay(world: World) {
  for (const v of worldEcon(world).ventures) {
    if (!v.built) continue;
    const yieldDay = v.kind === "boat" ? 1.2 : 1;
    for (const [id, s] of Object.entries(v.shares)) {
      const p = personById(world, id);
      if (!p) continue;
      const cut = (yieldDay * s) / v.raised;
      p.carry.food = Math.min(10, p.carry.food + cut);
      v.dividends += cut;
    }
    if (v.sentiment > 0) v.sentiment *= 1.08; // momentum
    if (v.sentiment >= v.crashAt) {
      v.sentiment = -0.5;
      tally(world, "crashes");
      chronicle(world, `The talk of what a ${v.kind} share could fetch ran ahead of what it gave, and then broke: those who bought dear lost.`);
    } else if (v.sentiment < 0) v.sentiment *= 0.9;
  }
}
export const storeOf = (p: Person): Partial<Record<Good, number>> => (econOf(p).store ??= {});
/** What a person's store is worth, in food units. */
export function storedValue(world: World, p: Person): number {
  const st = p.econ?.store;
  if (!st) return 0;
  let v = 0;
  for (const g of GOODS) v += (st[g] ?? 0) * (g === "shell" ? 1 : priceOf(world, g));
  return v;
}
export function wealthOf(world: World, p: Person): number {
  const e = econOf(p);
  let w = e.capital + e.shells * priceOf(world, "shell") + storedValue(world, p);
  for (const g of ["food", "wood", "hide", "seed"] as const) w += (p.carry[g] ?? 0) * priceOf(world, g);
  for (const t of world.things) if (t.owner === p.id) w += t.kind === "shelter" ? 8 : t.kind === "crop" ? 3 : 2;
  for (const v of worldEcon(world).ventures) w += (p.econ?.shares[v.id] ?? 0) * (v.built ? sharePrice(v) : 1);
  for (const d of worldEcon(world).debts) {
    if (d.state === "open") {
      if (d.creditor === p.id) w += d.owed * priceOf(world, d.good);
      if (d.debtor === p.id) w -= d.owed * priceOf(world, d.good);
    }
  }
  return w;
}
export function gini(values: number[]): number {
  const v = values.map((x) => Math.max(0, x)).sort((a, b) => a - b);
  const n = v.length;
  const sum = v.reduce((a, b) => a + b, 0);
  if (n < 2 || sum <= 0) return 0;
  let acc = 0;
  for (let i = 0; i < n; i++) acc += (2 * (i + 1) - n - 1) * v[i]!;
  return acc / (n * sum);
}
export const wealthGini = (world: World): number => gini(adults(world).map((p) => wealthOf(world, p)));
/** A day's saving: what was made beyond a day's keep adds to capital; a shortfall eats it, and without any the seed is eaten. Capital earns a return. */
export function saveDay(world: World, p: Person) {
  const e = econOf(p);
  const net = e.made7 - 1; // a day's keep is one food
  const was = e.capital;
  e.capital += net;
  if (e.capital < 0) {
    e.capital = 0;
    if (was > 0) tally(world, "seedEaten");
  }
  // Land, tools and loans earn on what is held; a small stock earns nothing, because it is eaten as fast as it comes.
  if (e.capital > 3) e.capital *= 1.004;
  e.made7 = 0;
}
/**
 * A day's saving as goods. What was made beyond a day's keep, and food or wood carried beyond what is wanted, goes into a store (at the
 * shelter they own, else in the ground), where food goes off more slowly. A day that made less than a day's keep, or hunger with an empty
 * pack, takes from it: the seed is eaten. Nothing here is a number that is not also a thing.
 */
export function saveGoods(world: World, p: Person, days = 1) {
  const e = econOf(p);
  const st = storeOf(p);
  const owns = world.things.some((t) => t.owner === p.id && t.kind === "shelter");
  const net = e.made7 - 1;
  e.made7 = 0;
  if (st.food) st.food *= Math.exp(-spoilRate(world, owns ? "shelter" : "granary") * days);
  const keep = 3; // a pack of food, left to eat
  if (net > 0 && p.carry.food > keep) {
    const put = Math.min(net, p.carry.food - keep);
    p.carry.food -= put;
    st.food = (st.food ?? 0) + put;
    tally(world, "stored");
  }
  if (p.carry.wood > 6 && p.needs.hunger < 0.6) {
    const put = p.carry.wood - 6;
    p.carry.wood -= put;
    st.wood = (st.wood ?? 0) + put;
  }
  if (net < 0 && (st.food ?? 0) > 0) {
    const take = Math.min(st.food!, -net);
    st.food! -= take;
    p.carry.food += take;
    tally(world, "seedEaten");
  }
  // Hungry with nothing in the pack: they go to the store.
  if (p.needs.hunger > 0.5 && p.carry.food < 1 && (st.food ?? 0) > 0) {
    const take = Math.min(st.food!, 2);
    st.food! -= take;
    p.carry.food += take;
    tally(world, "storeDrawn");
  }
  if ((st.food ?? 0) < 0.05) delete st.food;
  // Wood put by for a cold day comes back when the pack is empty and it is cold.
  if (p.cold > 0.3 && p.carry.wood < 1 && (st.wood ?? 0) >= 1) {
    st.wood! -= 1;
    p.carry.wood += 1;
  }
}
export function classOf(world: World, p: Person, median: number): Class {
  const e = econOf(p);
  if (e.job?.bonded) return "bonded";
  if (e.job) return "worker";
  const w = wealthOf(world, p);
  if (w < 0.4 * median || owedBy(world, p) > heldOf(p, "food") + e.capital + 4) return "poor";
  const owns = world.things.some((t) => t.owner === p.id);
  return owns && w >= 1.5 * median ? "owner" : "commoner";
}

// ---- Labour: wages, orders ----

export function hire(world: World, employer: Person, worker: Person, good: Good, wage: number): { ok: true } | { ok: false; why: string } {
  if (worker.age < ADULT_AGE) return { ok: false, why: `${worker.name} is a child` };
  if (employer.id === worker.id) return { ok: false, why: "nobody employs themselves" };
  if (econOf(worker).job) return { ok: false, why: `${worker.name} already works for someone` };
  if (heldOf(employer, good) < wage) return { ok: false, why: `${employer.name} cannot pay a day's wage` };
  econOf(worker).job = { employer: employer.id, good, wage, since: world.clock ?? 0, unpaid: 0 };
  note(worker, world, `I work for ${employer.name} now, for ${wage} ${good} a day.`);
  note(employer, world, `${worker.name} works for me for ${wage} ${good} a day.`);
  tally(world, "hired");
  return { ok: true };
}
function workDay(world: World) {
  for (const w of world.people) {
    const job = w.econ?.job;
    if (!job) continue;
    const boss = personById(world, job.employer);
    if (!boss) { econOf(w).job = undefined; continue; }
    const made = outputOf(w);
    if (job.bonded) {
      const d = worldEcon(world).debts.find((x) => x.id === job.debt);
      const value = made.n * priceOf(world, made.good);
      addHeld(boss, made.good, made.n);
      if (d) {
        d.owed -= (value / priceOf(world, d.good));
        if (d.owed <= 0) {
          d.state = "repaid";
          econOf(w).job = undefined;
          note(w, world, `The debt to ${boss.name} is worked off. I am my own again.`);
          tally(world, "bondageEnded");
        }
      }
      continue;
    }
    if (heldOf(boss, job.good) >= job.wage) {
      addHeld(boss, job.good, -job.wage);
      addHeld(w, job.good, job.wage);
      job.unpaid = 0;
      tally(world, "wagesPaid");
      record(world, "wage", boss.id, w.id, job.good, job.wage);
    } else {
      job.unpaid++;
      if (job.unpaid >= 2) {
        econOf(w).job = undefined;
        relation(w, boss.id, world).trust = Math.max(0, relation(w, boss.id, world).trust - 0.3);
        note(w, world, `${boss.name} did not pay me, so I stopped working for them.`);
        tally(world, "quitUnpaid");
        continue;
      }
    }
    addHeld(boss, made.good, made.n);
    tally(world, "labourDays");
  }
}
/** An employer (or creditor holding bonded labour) tells a worker what to do. Returns why not when they have no such right. */
export function command(world: World, boss: Person, subject: Person, kind: IntentKind, hours = 4): { ok: true } | { ok: false; why: string } {
  const job = subject.econ?.job;
  if (!job || job.employer !== boss.id) return { ok: false, why: `${subject.name} does not work for ${boss.name}` };
  econOf(subject).order = { by: boss.id, kind, until: (world.clock ?? 0) + (hours * DAY) / 24 };
  tally(world, "ordersGiven");
  return { ok: true };
}

// ---- Land: a thing owned owns the ground round it ----

const PLOT: Record<string, number> = { shelter: 7, field: 8, garden: 6, crop: 3, snare: 2, weir: 2, boat: 2, mill: 4 };
/** Whose ground this is: the owner of the nearest owned thing whose plot (a few paces round it) holds the point. */
export function landOwnerAt(world: World, x: number, z: number, except?: Thing): string | undefined {
  let best: string | undefined;
  let bd = Infinity;
  for (const t of world.things) {
    if (t === except || !t.owner) continue;
    const r = PLOT[t.kind];
    if (r === undefined) continue;
    const d = dist(t.x, t.z, x, z);
    if (d <= r && d < bd) {
      bd = d;
      best = t.owner;
    }
  }
  return best;
}

// ---- Choices: what a person does with what they have (ventures, hiring, lending, speculating, brokering) ----

const free = (p: Person) => p.needs.hunger < 0.6 && p.needs.thirst < 0.6;
const nerve = (p: Person) => 0.25 + 0.75 * (0.5 * p.personality.boldness + 0.5 * p.personality.curiosity);
const trustOf = (a: Person, b: Person, w: World) => relation(a, b.id, w).trust;
const jobsOf = (ps: Person[], boss: Person) => ps.filter((w) => w.econ?.job?.employer === boss.id && !w.econ.job.bonded);
/** Buy `n` shares of a built venture from another holder at the price now asked. The buyer pays in food. */
export function buyShares(world: World, buyer: Person, seller: Person, v: Venture, n: number): { ok: boolean; why?: string } {
  if ((v.shares[seller.id] ?? 0) < n) return { ok: false, why: `${seller.name} holds no such shares` };
  const price = sharePrice(v) * n;
  if (buyer.carry.food < price + 1) return { ok: false, why: `${buyer.name} cannot pay ${Math.round(price * 10) / 10}` };
  buyer.carry.food -= price;
  seller.carry.food += price;
  v.shares[seller.id]! -= n;
  v.shares[buyer.id] = (v.shares[buyer.id] ?? 0) + n;
  econOf(seller).shares[v.id] = v.shares[seller.id]!;
  econOf(buyer).shares[v.id] = v.shares[buyer.id]!;
  tally(world, "sharesTraded");
  record(world, "share", seller.id, buyer.id, "food", price);
  return { ok: true };
}
/** One person's economic day: they look at what they hold and what they could do with it. Every choice yields to thirst and hunger, and every chance is from a hash. */
function chooseDay(world: World, q: Person, ps: Person[], day: number) {
  if (!free(q) || q.age < ADULT_AGE) return;
  const e = worldEcon(world);
  const eq = econOf(q);
  const salt = (what: string) => chanceOf(`${what}|${q.id}|${day}`);
  const nv = nerve(q);
  // Ventures: wood put by in a store is wood that could be put in a boat or a mill, for a share of what it gives.
  const spare = q.carry.wood + (eq.store?.wood ?? 0) - 4;
  if (spare >= 1 && !eq.job) {
    const open = e.ventures.find((v) => !v.built);
    if (open) {
      const founder = open.founder ? personById(world, open.founder) : undefined;
      const known = !founder || founder === q || trustOf(q, founder, world) >= 0.4;
      if (known && salt("invest") < 0.2 * nv) {
        const n = Math.min(spare, open.cost - open.raised, 3);
        const pulled = Math.max(0, n - q.carry.wood);
        if (pulled > 0 && eq.store?.wood) { eq.store.wood -= pulled; q.carry.wood += pulled; }
        if (invest(world, q, open, n).ok) tally(world, "invested");
      }
    } else if (e.ventures.length < 4 && spare >= 2 && salt("venture") < 0.06 * nv) {
      const kind = knows(world, "boat") ? "boat" : "mill";
      const v = startVenture(world, q, kind, 8);
      tally(world, "venturesStarted");
      note(q, world, `I have started a ${kind}, and will share in what it gives to those who put wood in.`);
      const n = Math.min(spare, 3);
      const pulled = Math.max(0, n - q.carry.wood);
      if (pulled > 0 && eq.store?.wood) { eq.store.wood -= pulled; q.carry.wood += pulled; }
      invest(world, q, v, n);
    }
  }
  // Speculation: the bold buy a share that is rising, from someone who will sell.
  if (q.personality.boldness > 0.6 && q.carry.food >= 4) {
    const v = e.ventures.find((x) => x.built && ((x.shares[q.id] ?? 0) > 0 || x.sentiment > 0.05));
    if (v && salt("speculate") < 0.2 * nv) {
      const seller = ps.find((o) => o !== q && (v.shares[o.id] ?? 0) >= 1 && free(o));
      if (seller && buyShares(world, q, seller, v, 1).ok) {
        speculate(v, 0.5);
        tally(world, "speculations");
      }
    }
  }
  // Hiring: someone with more than they need takes on a neighbour who has little, and pays a day's wage.
  if ((q.carry.food >= 5 || q.carry.wood >= 8) && jobsOf(ps, q).length < 2 && salt("hire") < 0.1 * nv) {
    const w = ps.find((o) => o !== q && !econOf(o).job && o.age >= ADULT_AGE && dist(o.x, o.z, q.x, q.z) < 30 && (econOf(o).class === "poor" || o.carry.food < 2) && trustOf(q, o, world) >= 0.3 && !jobsOf(ps, o).length);
    if (w) hire(world, q, w, q.carry.food >= 5 ? "food" : "wood", 1);
  }
  // A worker with a full pack of their own goes back to working for themselves.
  const job = eq.job;
  if (job && !job.bonded && q.carry.food >= 7 && salt("quit") < 0.15) {
    eq.job = undefined;
    note(q, world, "I have enough of my own now, so I stopped working for another.");
    tally(world, "workerQuit");
  }
  // An employer who is short of food sends a worker to find some.
  if (q.needs.hunger > 0.4 && q.carry.food < 1) {
    const w = jobsOf(ps, q)[0];
    if (w) command(world, q, w, "forage");
  }
  // Lending before it is begged for: to a neighbour who has nothing in the pack and who is trusted.
  if (q.carry.food >= 6 && salt("lend") < 0.25) {
    const open = e.debts.filter((d) => d.creditor === q.id && d.state === "open" && d.why === "loan").length;
    const b = open < 3 ? ps.find((o) => o !== q && o.carry.food < 1.5 && dist(o.x, o.z, q.x, q.z) < 25 && trustOf(q, o, world) >= 0.4 && !e.debts.some((d) => d.debtor === o.id && d.state === "open" && d.why === "loan")) : undefined;
    if (b && lend(world, q, b, "food", 2).ok && econOf(b).class === "poor") tally(world, "lentToPoor");
  }
}
/** What the food-for-wood swap costs when a fair is open: the going prices, not the fixed rates. Undefined when no fair is open. */
export function marketRates(world: World): { food: number; wood: number } | undefined {
  if (!marketOpen(world)) return undefined;
  const f = priceOf(world, "food");
  const wd = priceOf(world, "wood");
  return { food: 2, wood: clamp(Math.round((2 * f) / wd), 1, 8) };
}

// ---- The step and the hooks into mind.ts ----

function dayStep(world: World, days: number) {
  const e = worldEcon(world);
  const ps = adults(world);
  accrue(world, days * DAY);
  repriceDay(world);
  const season = world.weather?.season ?? 1;
  // The fair, on every fourth day, at the middle of the camp.
  const day = Math.floor((world.clock ?? 0) / DAY);
  if (ps.length >= 3 && day % FAIR_EVERY === 0) {
    e.market = { x: ps.reduce((a, q) => a + q.x, 0) / ps.length, z: ps.reduce((a, q) => a + q.z, 0) / ps.length, day };
    tally(world, "fairs");
  }
  // A caravan from far away comes now and then, twice as often once a boat is built.
  const boat = e.ventures.some((v) => v.kind === "boat" && v.built);
  if (ps.length >= 3 && day % (boat ? 3 : 6) === 1 && chanceOf(`caravan|${day}`) < 0.7) {
    e.caravan = { until: (world.clock ?? 0) + 1.5 * DAY, shell: 6, hide: 3 };
    tally(world, "caravans");
  }
  // Food kept in the granary and in shelters goes off more slowly.
  e.granary.food *= Math.exp(-spoilRate(world, "granary") * days);
  for (const t of world.things) if (t.kind === "shelter" && (t.stock ?? 0) > 0) t.stock! *= Math.exp(-spoilRate(world, "shelter") * days);
  if (e.tribute > 0) levy(world, e.tribute);
  // Those with plenty and a few friends join the granary and pay a little in.
  for (const q of ps) {
    const eq = econOf(q);
    if (!eq.member && q.carry.food >= 4 && [...q.relations.values()].filter((r) => r.affinity > 0.4).length >= 2 && chanceOf(`join|${q.id}|${day}`) < 0.1) joinGranary(world, q);
    if (eq.member && q.carry.food >= 4 && season !== 3) {
      q.carry.food -= 0.5;
      e.granary.food += 0.5;
      e.granary.paid += 0.5;
    }
    if (eq.member && q.needs.hunger > 0.8 && q.carry.food < 1) draw(world, q);
    // Neighbours lend to the hungry they trust.
    if (!eq.job && q.needs.hunger > 0.75 && q.carry.food < 1) {
      const lender = ps.find((o) => o !== q && o.carry.food >= 5 && dist(o.x, o.z, q.x, q.z) < 20 && relation(o, q.id, world).trust >= 0.5);
      if (lender) lend(world, lender, q, "food", 2);
    }
    // The speciality settles on what they are best at.
    eq.speciality = specialityOf(q);
    saveGoods(world, q, days);
    chooseDay(world, q, ps, day);
  }
  settleDebts(world);
  workDay(world);
  ventureDay(world);
  const ws = ps.map((q) => wealthOf(world, q)).sort((a, b) => a - b);
  const median = ws[Math.floor(ws.length / 2)] ?? 0;
  for (const q of ps) econOf(q).class = classOf(world, q, median);
  if (day % 4 === 0) {
    (e.giniSeries ??= []).push(gini(ws));
    if (e.giniSeries.length > 64) e.giniSeries.shift();
  }
}
export function economyWorldStep(world: World, dt: number) {
  const e = worldEcon(world);
  const day = Math.floor((world.clock ?? 0) / DAY);
  if (day > e.day) {
    const days = day - e.day;
    e.day = day;
    dayStep(world, days);
  }
}
export function economyStep(person: Person, world: World, dt: number) {
  spoilStep(person, world, dt);
}
/** At the end of something they did. */
export function economyAfter(world: World, person: Person, intent: Intent) {
  if (person.age < 1) return;
  const e = econOf(person);
  if (["build", "plant", "furnish", "improve", "craft"].includes(intent.kind)) {
    const t = world.things.find((q) => !q.owner && OWNABLE.has(q.kind) && dist(q.x, q.z, intent.x, intent.z) < 1.5);
    if (t) {
      // Built or sown on ground that is another's, it is theirs: the ground it stands on was never the builder's to give.
      const lord = personById(world, landOwnerAt(world, t.x, t.z, t));
      if (lord && lord.id !== person.id && !closeKin(world, person, lord) && relation(lord, person.id, world).trust < 0.5) {
        t.owner = lord.id;
        tally(world, "trespass");
        const r = relation(lord, person.id, world);
        r.trust = Math.max(0, r.trust - 0.1);
        feel(lord, "anger", 0.15);
        note(lord, world, `${person.name} built on my ground. What stands there is mine.`);
        note(person, world, `I built on ${lord.name}'s ground, and ${lord.name} keeps it.`);
      } else claim(world, person, t);
    }
  }
  const g = MADE_BY[intent.kind];
  if (g) {
    e.made[g] = (e.made[g] ?? 0) + 1;
    e.made7 += BASE[g];
  }
  // A shell turns up now and then where the water meets the shore.
  if ((intent.kind === "fish" || intent.kind === "wash" || intent.kind === "drink") && chanceOf(`shell|${person.id}|${Math.floor((world.clock ?? 0) / 20)}`) < 0.08) e.shells += 1;
  if (e.order && e.order.kind === intent.kind) {
    tally(world, "ordersObeyed");
    e.order = undefined;
  }
  if ((intent.kind === "eat" || intent.kind === "forage") && intent.targetId) {
    const t = thingById(world, intent.targetId);
    if (t?.owner && t.owner !== person.id) takeFromOwned(world, person, t);
  }
}
/** What ownership, the fair and orders add to the choice. Needs come first: the hungry and thirsty are not held back or sent away. */
export function economyBias(person: Person, world: World, opts: Option[]) {
  const now = world.clock ?? 0;
  const free = person.needs.hunger < 0.6 && person.needs.thirst < 0.6;
  const e = person.econ;
  for (const o of opts) {
    if ((o.intent.kind === "eat" || o.intent.kind === "forage") && o.intent.targetId && person.needs.hunger < 0.85) {
      const t = thingById(world, o.intent.targetId);
      if (t?.owner && t.owner !== person.id && !closeKin(world, person, personById(world, t.owner) ?? person)) o.score -= 0.6; // it is someone's
    }
    if (free && ["build", "plant", "furnish", "improve"].includes(o.intent.kind)) {
      const lord = landOwnerAt(world, o.intent.x, o.intent.z);
      if (lord && lord !== person.id && !closeKin(world, person, personById(world, lord) ?? person)) o.score -= 0.5; // that ground is someone's
    }
    if (e?.order && e.order.until > now && free) {
      if (o.intent.kind === e.order.kind) o.score += 0.9 * obedience(person);
    }
  }
  if (!free || person.age < ADULT_AGE || !marketOpen(world)) return;
  const m = world.econ!.market!;
  const goods = (["food", "wood", "hide", "seed"] as const).reduce((a, g) => a + Math.floor(surplusOf(person, g)), 0);
  const d = dist(person.x, person.z, m.x, m.z);
  // The patient wait out a low price: a good that fetches a fifth less than it has over the last weeks is kept for another fair.
  const series = priceSeries(world, "food");
  const lowPrice = series.length >= 8 && priceOf(world, "food") < 0.8 * (series.reduce((a, b) => a + b, 0) / series.length) && person.personality.patience > 0.6;
  if (lowPrice) return;
  if ((goods >= 2 || (world.econ!.caravan && (world.econ!.caravan.until ?? 0) > now && goods >= 1)) && d < 70) opts.push({ intent: { kind: "trade", targetId: "market", x: m.x, z: m.z, speed: 2.2, remaining: 6 }, score: 0.55 + 0.08 * goods - d / 400, reason: "to the fair with something to sell" });
}
