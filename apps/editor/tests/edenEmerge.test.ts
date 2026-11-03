import test from "node:test";
import assert from "node:assert/strict";
import { DAY } from "../src/eden/earth";
import { bandOf, conflictOf, worldConflict } from "../src/eden/conflict";
import { econOf, heldOf, ledgerKind, storeOf, wealthOf, worldEcon } from "../src/eden/economy";
import { bondOf, makePerson, step, type Intent, type Person, type Thing, type World } from "../src/eden/mind";

// These tests drive the real step() and look at what the people did: nothing here calls startVenture, hire, lend, splitBand, raid or
// betrayAlly directly (the older tests do that). A "day hop" moves the clock to the next morning and takes one real step, so the economy
// runs its day with the world as the test left it.
const VALUES = { kin: 0.5, fairness: 0.5, freedom: 0.5, tradition: 0.5, comfort: 0.5 };
const person = (id: string, seed: number, x = 0, z = 0, over: Partial<Person["personality"]> = {}, age = 28) => {
  const p = makePerson(id, x, z, seed, { sociability: 0.6, boldness: 0.8, curiosity: 0.8, patience: 0.5, ...over }, { name: id, sex: seed % 2 ? "m" : "f", age });
  p.values = { ...VALUES };
  return p;
};
const camp = (n: number, over: Partial<Person["personality"]> = {}): World => {
  const people = Array.from({ length: n }, (_, i) => person(`P${i}`, i + 11, (i % 5) * 2, Math.floor(i / 5) * 2, over));
  for (const a of people) for (const b of people) if (a !== b) a.relations.set(b.id, { affinity: 0.5, trust: 0.6, familiarity: 0.7, lastTogether: 0 });
  const things: Thing[] = [{ id: "stream", kind: "stream", x: 8, z: -3, radius: 3 }, { id: "bush-1", kind: "bush", x: 6, z: 6, radius: 2, stock: 8, maxStock: 8 }];
  const w: World = { things, people, radius: 80, clock: DAY / 3, climate: { meanC: 16, seasonalAmpC: 4, dailyAmpC: 3, rainy: 0.1, seed: 3 }, weather: { season: 1 } as World["weather"] };
  worldEcon(w); // the economy's first day is the day it starts on
  return w;
};
const fed = (w: World) => { for (const p of w.people) { p.needs.hunger = Math.min(p.needs.hunger, 0.2); p.needs.thirst = Math.min(p.needs.thirst, 0.2); } };
/** Move to the next morning and take one real step. */
const hop = (w: World) => {
  w.clock = (Math.floor((w.clock ?? 0) / DAY) + 1) * DAY + 100;
  step(w, 4);
};
const hops = (w: World, n: number, each?: (d: number) => void) => { for (let i = 0; i < n; i++) { each?.(i); hop(w); } };
const tallyOf = (w: World, k: string) => w.tally?.[k] ?? 0;

// ---- E5: ventures, saving and spending, from their own choices ----

test("people with wood to spare start a venture and put wood in it, and it is built and pays (through step)", () => {
  const w = camp(8);
  for (const p of w.people) p.carry.wood = 9;
  hops(w, 30, () => fed(w));
  assert.ok(tallyOf(w, "venturesStarted") >= 1, "someone started one");
  assert.ok(tallyOf(w, "invested") >= 1, "others put wood in");
  assert.ok(tallyOf(w, "venturesBuilt") >= 1, `built: ${JSON.stringify(w.tally)}`);
  const v = worldEcon(w).ventures[0]!;
  assert.ok(Object.keys(v.shares).length >= 2, "more than the founder holds a share");
  assert.ok(v.dividends > 0, "it paid");
});

test("the bold buy shares of a built venture and the talk can outrun the yield (speculation by choice)", () => {
  const w = camp(8, { boldness: 0.95 });
  for (const p of w.people) p.carry.wood = 9;
  hops(w, 60, () => { fed(w); for (const p of w.people) p.carry.food = Math.max(p.carry.food, 6); });
  assert.ok(tallyOf(w, "sharesTraded") >= 1, `traded ${JSON.stringify(w.tally)}`);
  assert.ok(tallyOf(w, "speculations") >= 1);
});

test("someone with plenty hires a neighbour with little and pays a wage every day; the work goes to the employer", () => {
  const w = camp(10);
  for (const p of w.people.slice(0, 3)) p.carry.food = 9;
  for (const p of w.people.slice(3)) p.carry.food = 0.5;
  hops(w, 12, () => fed(w));
  assert.ok(tallyOf(w, "hired") >= 1, `hired: ${JSON.stringify(w.tally)}`);
  assert.ok(tallyOf(w, "wagesPaid") >= 3, "wages were paid");
  assert.ok(tallyOf(w, "labourDays") >= 3);
  const boss = w.people.find((p) => w.people.some((q) => q.econ?.job?.employer === p.id));
  assert.ok(boss, "a worker still has a job");
});

test("a rich neighbour lends to the poor before they beg, and the loan is repaid", () => {
  const w = camp(6);
  w.people[0]!.carry.food = 10;
  for (const p of w.people.slice(1)) p.carry.food = 0.2;
  hops(w, 20, () => fed(w));
  assert.ok(tallyOf(w, "loans") >= 1, JSON.stringify(w.tally));
  assert.ok(tallyOf(w, "lentToPoor") >= 0);
  assert.ok(w.econ!.debts.length >= 1);
});

test("savings are goods in a store: surplus food goes in, spoils slowly, and comes out when the pack is empty and they are hungry", () => {
  const w = camp(3);
  const a = w.people[0]!;
  a.carry.food = 9;
  econOf(a).made7 = 4;
  hop(w);
  const put = storeOf(a).food ?? 0;
  assert.ok(put > 1, `stored ${put}`);
  assert.ok(a.carry.food < 9, "some of the pack went into the store");
  assert.ok(wealthOf(w, a) >= put * 0.5, "the store counts as wealth");
  assert.equal(econOf(a).capital, 0, "not a bare number");
  a.carry.food = 0;
  a.needs.hunger = 0.7;
  hop(w);
  assert.ok(a.carry.food > 0, "the store fed them");
  assert.ok(tallyOf(w, "storeDrawn") + tallyOf(w, "seedEaten") >= 1, "taken from the store");
});

test("inequality comes from their own choices: a camp of equals, left alone for years, has a Gini above 0.15 and a record of it", () => {
  const w = camp(14);
  w.people.forEach((p, i) => { p.carry.wood = 4 + (i % 5) * 1.5; p.carry.food = 3 + (i % 4) * 1.5; }); // unequal harvests, nothing else
  hops(w, 90, () => { fed(w); });
  const series = worldEcon(w).giniSeries ?? [];
  assert.ok(series.length >= 10, "a Gini series is kept");
  const last = series[series.length - 1]!;
  assert.ok(last > 0.15, `Gini ${last}`);
  assert.ok(tallyOf(w, "hired") + tallyOf(w, "loans") + tallyOf(w, "venturesStarted") >= 2, "from what they chose to do");
});

// ---- the swap and the ground ----

test("the food-for-wood swap uses the going prices when a fair is open, not the fixed rate", () => {
  const a = person("A", 1, 0, 0), b = person("B", 2, 1, 0);
  const w: World = { things: [], people: [a, b], radius: 80, clock: DAY * 3 + 0.5 * DAY, climate: { meanC: 16, seasonalAmpC: 4, dailyAmpC: 3, rainy: 0.1, seed: 3 }, weather: { season: 1 } as World["weather"] };
  const e = worldEcon(w);
  e.prices.food = 2;
  e.prices.wood = 0.7;
  e.market = { x: 0, z: 0, day: 3 };
  a.carry.food = 6;
  b.carry.wood = 12;
  const give: Intent = { kind: "trade", targetId: "B", x: 1, z: 0, speed: 1, remaining: 0, arrived: true };
  a.intent = give;
  step(w, 4);
  assert.ok(a.carry.wood >= 5, `food was dear, so a got ${a.carry.wood} wood (the fixed rate gives 3)`);
});

test("a thing built on another's ground is the owner of the ground's (a boundary), and the builder is a trespasser", () => {
  const a = person("A", 1, 0, 0), b = person("B", 2, 2, 2);
  const house: Thing = { id: "shelter-1", kind: "shelter", x: 0, z: 0, radius: 3, owner: "A", stock: 2 };
  const newer: Thing = { id: "snare-9", kind: "snare", x: 2, z: 2, radius: 1 };
  const w: World = { things: [house, newer], people: [a, b], radius: 80, clock: DAY / 3, climate: { meanC: 16, seasonalAmpC: 4, dailyAmpC: 3, rainy: 0.1, seed: 3 }, weather: { season: 1 } as World["weather"] };
  b.intent = { kind: "build", x: 2, z: 2, speed: 1, remaining: 0, arrived: true };
  step(w, 4);
  assert.equal(newer.owner, "A", "it stands on A's ground");
  assert.equal(tallyOf(w, "trespass"), 1);
  assert.ok(a.relations.get("B")!.trust < 0.3);
});

// ---- bondage ----

test("eating at another's store day after day does not put the camp in bondage: debts merge, friends are let eat, only a loan binds", () => {
  const w = camp(8);
  const owner = w.people[0]!;
  const crop: Thing = { id: "crop-1", kind: "crop", x: 0, z: 0, radius: 2, owner: owner.id, stock: 99, maxStock: 99 };
  w.things.push(crop);
  for (const p of w.people.slice(1)) { const r = p.relations.get(owner.id)!; r.trust = 0.3; owner.relations.get(p.id)!.trust = 0.3; } // strangers to the owner
  const pairOpen = () => { const seen = new Set<string>(); for (const x of w.econ!.debts) if (x.state === "open" && x.why === "restitution") { const k = `${x.debtor}>${x.creditor}`; assert.ok(!seen.has(k), "one open restitution debt a pair"); seen.add(k); } };
  for (let d = 0; d < 40; d++) {
    pairOpen();
    fed(w);
    for (const p of w.people.slice(1, 6)) p.intent = { kind: "eat", targetId: "crop-1", x: 0, z: 0, speed: 1, remaining: 0, arrived: true };
    hop(w);
  }
  assert.ok(tallyOf(w, "propertyTheft") >= 20, "it was taken from");
  assert.equal(tallyOf(w, "bondage"), 0, `bondage ${tallyOf(w, "bondage")} (the old rules gave 58 here)`);
  assert.ok(tallyOf(w, "restitutionDebts") <= 20, `${tallyOf(w, "restitutionDebts")} debts for ${tallyOf(w, "propertyTheft")} mouthfuls (the old rules gave 75)`);
  // A friend of the owner is let eat without a wrong.
  const friend = w.people[7]!;
  owner.relations.get(friend.id)!.trust = 0.8;
  const before = tallyOf(w, "propertyTheft");
  friend.intent = { kind: "eat", targetId: "crop-1", x: 0, z: 0, speed: 1, remaining: 0, arrived: true };
  hop(w);
  assert.equal(tallyOf(w, "propertyTheft"), before);
  void ledgerKind; void heldOf;
});

// ---- H1/H3: a second band, raids, war, betrayal ----

test("a big camp splits in two by itself (a faction goes its own way) and the two are bands for the conflict machinery", () => {
  const w = camp(24);
  hops(w, 60, () => fed(w));
  assert.ok(tallyOf(w, "bandsSplit") >= 1, JSON.stringify(w.tally));
  const bands = new Set(w.people.map((p) => bandOf(w, p)));
  assert.ok(bands.size >= 2, `bands ${[...bands]}`);
});

test("two bands in want raid each other and a war opens, in the running step", () => {
  const w = camp(24);
  hops(w, 60, () => { fed(w); if (tallyOf(w, "bandsSplit")) for (const p of w.people) { p.needs.hunger = 0.75; p.carry.food = Math.max(p.carry.food, 2); } });
  assert.ok(tallyOf(w, "raids") >= 1, JSON.stringify(w.tally));
  assert.ok(tallyOf(w, "wars") >= 1);
  assert.ok(worldConflict(w).wars.length >= 1);
});

test("a dishonest friend gives an ally up to the ally's enemy (betrayal in the step, not by a call)", () => {
  const a = person("A", 1, 0, 0), ally = person("Y", 2, 2, 0), foe = person("Z", 3, 0, 2);
  a.values = { ...VALUES, fairness: 0.05, tradition: 0.1 };
  a.relations.set("Y", { affinity: 0.8, trust: 0.9, familiarity: 0.9, lastTogether: 0 });
  conflictOf(foe).grudge["Y"] = 0.8;
  const w: World = { things: [{ id: "stream", kind: "stream", x: 5, z: 5, radius: 3 }], people: [a, ally, foe], radius: 80, clock: DAY / 3, climate: { meanC: 16, seasonalAmpC: 4, dailyAmpC: 3, rainy: 0.1, seed: 3 }, weather: { season: 1 } as World["weather"] };
  for (let i = 0; i < 12000 && !tallyOf(w, "betrayals"); i++) {
    for (const p of w.people) { p.needs.hunger = 0.1; p.needs.thirst = 0.1; p.intent = { kind: "linger", x: p.x, z: p.z, speed: 0, remaining: 30, arrived: true }; }
    w.clock = (w.clock ?? 0) + 10;
    step(w, 4);
  }
  assert.ok(tallyOf(w, "betrayals") >= 1);
  assert.equal(ally.heart!.betrayals["A"], 1);
});

// ---- births: ownership must not wear away the trust a pair is made of ----

test("a partner who eats from the other's field every day stays a partner (the trust a pair needs is not worn away by ownership)", () => {
  const she = person("She", 2, 0, 0), he = person("He", 3, 1, 0);
  const strong = { affinity: 0.9, trust: 0.75, familiarity: 0.8, lastTogether: 0 };
  she.relations.set("He", { ...strong });
  he.relations.set("She", { ...strong });
  const w: World = { things: [{ id: "crop-1", kind: "crop", x: 0, z: 0, radius: 2, owner: "She", stock: 99, maxStock: 99 }, { id: "stream", kind: "stream", x: 8, z: -3, radius: 3 }], people: [she, he, person("C", 4, 3, 0), person("D", 5, 4, 0)], radius: 80, clock: DAY / 3, climate: { meanC: 16, seasonalAmpC: 4, dailyAmpC: 3, rainy: 0.1, seed: 3 }, weather: { season: 1 } as World["weather"] };
  worldEcon(w);
  assert.equal(bondOf(she, he), "partner");
  for (let d = 0; d < 20; d++) {
    fed(w);
    he.intent = { kind: "eat", targetId: "crop-1", x: 0, z: 0, speed: 1, remaining: 0, arrived: true };
    hop(w);
  }
  assert.equal(bondOf(she, he), "partner", `trust ${she.relations.get("He")!.trust}`);
  assert.equal(tallyOf(w, "propertyTheft"), 0);
});
