import test from "node:test";
import assert from "node:assert/strict";
import { DAY, YEAR } from "../src/eden/earth";
import { accrue, broker, chanceOf, caravanTrade, claim, classOf, command, creditworthy, econOf, economyAfter, economyBias, economyStep, economyTheft, economyWorldStep, exchange, gini, haggle, heldOf, hire, inheritHoldings, invest, joinGranary, ledgerBalance, ledgerKind, lend, levy, draw, marketOpen, marketTrade, measure, outputOf, priceOf, priceSeries, quote, repay, saveDay, sharePrice, specialisation, specialityOf, speculate, spoilRate, startVenture, takeFromOwned, wealthGini, worldEcon, type Good } from "../src/eden/economy";
import { makePerson, step, type Intent, type Person, type Thing, type World } from "../src/eden/mind";
import { practise } from "../src/eden/identity";

const person = (id: string, seed = 1, x = 0, z = 0, age = 8, extra: Partial<Person["personality"]> = {}) => makePerson(id, x, z, seed, { sociability: 0.6, boldness: 0.5, curiosity: 0.5, patience: 0.5, ...extra }, { name: id, sex: "m", age });
const world = (people: Person[], things: Thing[] = [], clock = DAY / 3): World => ({ things, people, radius: 80, clock, climate: { meanC: 16, seasonalAmpC: 4, dailyAmpC: 3, rainy: 0.1, seed: 3 }, weather: { season: 1 } as World["weather"] });
const fond = (a: Person, b: Person, trust = 0.7) => a.relations.set(b.id, { affinity: 0.6, trust, familiarity: 0.8, lastTogether: 0 });
const intent = (kind: Intent["kind"], x = 0, z = 0, targetId?: string): Intent => ({ kind, x, z, targetId, speed: 1, remaining: 0, arrived: true });
const know = (w: World, ...ids: string[]) => {
  w.knowledge = {};
  for (const id of ids) w.knowledge[id] = { by: "x", byName: "x", t: 0 };
  w.people[0]!.ideas = [...(w.people[0]!.ideas ?? []), ...ids];
};
const days = (w: World, n: number) => {
  worldEcon(w);
  for (let i = 0; i < n; i++) {
    w.clock = (w.clock ?? 0) + DAY;
    economyWorldStep(w, DAY);
  }
};

// ---- E1 ----

test("what a person builds or plants is theirs; objects carry an owner", () => {
  const a = person("A");
  const shelter: Thing = { id: "shelter-1", kind: "shelter", x: 1, z: 1, radius: 3 };
  const w = world([a], [shelter]);
  economyAfter(w, a, intent("build", 1, 1));
  assert.equal(shelter.owner, "A");
  const rock: Thing = { id: "rock-1", kind: "rock", x: 0, z: 0, radius: 1 };
  assert.equal(claim(w, a, rock), false, "a rock is nobody's");
  assert.equal(rock.owner, undefined);
});

test("theft raises a grievance with the owner; taking from another's field is theft, kin may use it", () => {
  const a = person("A"), b = person("B", 2), kid = person("K", 3, 0, 0, 5);
  kid.mother = "A";
  const field: Thing = { id: "crop-1", kind: "crop", x: 0, z: 0, radius: 2, owner: "A", stock: 2 };
  const w = world([a, b, kid], [field]);
  const trust = (a.relations.get("B")?.trust ?? 0.3);
  assert.equal(takeFromOwned(w, kid, field), false, "the owner's child is not a thief");
  assert.equal(takeFromOwned(w, b, field), true);
  assert.equal(econOf(a).grievances.B, 1);
  assert.ok(a.relations.get("B")!.trust < trust);
  assert.ok((a.emotions?.anger ?? 0) > 0);
  assert.equal(w.tally?.propertyTheft, 1);
  b.needs.hunger = 0.9;
  economyAfter(w, b, intent("eat", 0, 0, "crop-1"));
  assert.equal(econOf(a).grievances.B, 2, "eating there is a second taking");
  economyTheft(w, b, a, "food", 1);
  assert.equal(econOf(a).grievances.B, 3);
});

test("others' fields are avoided unless starving; own thirst and hunger come first", () => {
  const a = person("A"), b = person("B", 2);
  const field: Thing = { id: "crop-1", kind: "crop", x: 0, z: 0, radius: 2, owner: "A", stock: 2 };
  const w = world([a, b], [field]);
  const opt = () => [{ intent: { kind: "forage" as const, targetId: "crop-1", x: 0, z: 0, speed: 1, remaining: 3 }, score: 1 }];
  const fed = opt();
  economyBias(b, w, fed);
  assert.ok(fed[0]!.score < 1);
  b.needs.hunger = 0.9;
  const starving = opt();
  economyBias(b, w, starving);
  assert.equal(starving[0]!.score, 1);
  const own = opt();
  economyBias(a, w, own);
  assert.equal(own[0]!.score, 1);
});

test("land passes to an heir at death; so does a debt", () => {
  const a = person("A"), heir = person("H", 2, 0, 0, 20), c = person("C", 3);
  heir.mother = "A";
  const field: Thing = { id: "crop-1", kind: "crop", x: 0, z: 0, radius: 2, owner: "A" };
  const w = world([a, heir, c], [field]);
  know(w, "counting");
  fond(c, a);
  const d = lend(w, c, a, "food", 0, { restitution: 2 });
  assert.ok(d.ok);
  econOf(a).shells = 4;
  inheritHoldings(w, a, [heir]);
  assert.equal(field.owner, "H");
  assert.equal(econOf(heir).shells, 4);
  assert.equal(w.econ!.debts[0]!.debtor, "H");
  assert.equal(w.tally?.landInherited, 1);
});

// ---- E2 ----

test("a person lives off what they are best at; a tool raises the output", () => {
  const a = person("A", 1), b = person("B", 2);
  for (let i = 0; i < 40; i++) practise(a, "hunt", 0.3);
  for (let i = 0; i < 40; i++) practise(b, "build", 0.3);
  assert.equal(specialityOf(a), "hunt");
  assert.equal(specialityOf(b), "build");
  assert.equal(outputOf(a).good, "food");
  assert.equal(outputOf(b).good, "wood");
  const bare = outputOf(a).n;
  a.tools.spear = true;
  assert.ok(outputOf(a).n > bare);
  const w = world([a, b]);
  for (let i = 0; i < 8; i++) economyAfter(w, a, intent("hunt"));
  for (let i = 0; i < 6; i++) economyAfter(w, b, intent("gather"));
  economyAfter(w, b, intent("forage"));
  assert.ok(specialisation(a) > 0.99 && specialisation(b) > 0.8);
});

test("in a running camp, specialists carry surplus to the fair and trade it", () => {
  const ps: Person[] = [];
  for (let i = 0; i < 6; i++) {
    const p = person(`P${i}`, 10 + i, (i % 3) * 3, Math.floor(i / 3) * 3, 8);
    for (let k = 0; k < 30; k++) practise(p, i % 2 ? "build" : "hunt", 0.3);
    ps.push(p);
  }
  const w = world(ps, [], 7.9 * DAY);
  // Both sorts hold what they make: the hunters food, the builders wood.
  for (const [i, p] of ps.entries()) { p.carry.food = i % 2 ? 0 : 7; p.carry.wood = i % 2 ? 8 : 0; }
  w.clock = 7.9 * DAY;
  worldEcon(w);
  w.clock = 8.5 * DAY;
  economyWorldStep(w, 1);
  assert.ok(marketOpen(w), "the fair is on");
  for (const p of ps) {
    p.needs.hunger = 0.5;
    p.cold = 0.4;
  }
  for (const p of ps) marketTrade(w, p, intent("trade", w.econ!.market!.x, w.econ!.market!.z, "market"));
  assert.ok((w.tally?.marketTrades ?? 0) >= 2, "surplus changed hands");
  const hunter = ps[0]!, builder = ps[1]!;
  assert.ok(hunter.carry.wood > 0, "the hunter now has wood without cutting it");
  assert.ok(builder.carry.food > 0, "the builder now has food without hunting it");
});

// ---- E3 ----

test("prices move with supply and demand: food dearer when scarce, cheaper when plentiful", () => {
  const ps = [person("A", 1), person("B", 2), person("C", 3)];
  const w = world(ps);
  know(w, "counting");
  for (const p of ps) { p.carry.food = 8; p.needs.hunger = 0.5; }
  days(w, 1);
  days(w, 4);
  const plenty = priceOf(w, "food");
  for (const p of ps) p.carry.food = 0.2;
  days(w, 4);
  const scarce = priceOf(w, "food");
  assert.ok(scarce > plenty * 1.5, `${scarce} vs ${plenty}`);
  for (const p of ps) p.carry.food = 8;
  days(w, 6);
  assert.ok(priceOf(w, "food") < scarce);
  const s = priceSeries(w, "food");
  assert.ok(s.length >= 10 && Math.max(...s) > Math.min(...s) * 1.5, "a series that moved");
});

test("food spoils faster in summer than in winter, slower in a granary; shells and wood do not spoil", () => {
  const a = person("A");
  const w = world([a]);
  a.carry.food = 6;
  a.carry.wood = 6;
  econOf(a).shells = 6;
  w.weather!.season = 1;
  for (let t = 0; t < 4 * DAY; t += 60) economyStep(a, w, 60);
  const summer = a.carry.food;
  assert.ok(summer < 5, `lost food: ${summer}`);
  assert.equal(a.carry.wood, 6);
  assert.equal(econOf(a).shells, 6);
  a.carry.food = 6;
  w.weather!.season = 3;
  for (let t = 0; t < 4 * DAY; t += 60) economyStep(a, w, 60);
  assert.ok(a.carry.food > summer);
  assert.ok(spoilRate(w, "granary") < spoilRate(w, "carried") / 4);
});

test("haggling lands between what each would take; the bold and patient seller gets more; trust narrows it", () => {
  const bold = person("S1", 1, 0, 0, 8, { boldness: 0.9, patience: 0.9 });
  const meek = person("S2", 2, 0, 0, 8, { boldness: 0.1, patience: 0.1 });
  const buyer = person("B", 3, 0, 0, 8, { boldness: 0.5, patience: 0.5 });
  const w = world([bold, meek, buyer]);
  know(w, "counting");
  const p = priceOf(w, "food");
  const hi = haggle(w, bold, buyer, "food"), lo = haggle(w, meek, buyer, "food");
  assert.ok(hi > lo);
  for (const x of [hi, lo]) assert.ok(x >= p * 0.8 && x <= p * 1.2);
  fond(bold, buyer, 1);
  fond(buyer, bold, 1);
  assert.ok(Math.abs(haggle(w, bold, buyer, "food") - p) < Math.abs(hi - p));
});

test("a caravan from far away buys surplus and sells shells and hide; a middleman profits from distance", () => {
  const a = person("A"), b = person("B", 2), m = person("M", 3);
  const w = world([a, b, m]);
  know(w, "counting");
  a.carry.food = 8;
  assert.equal(caravanTrade(w, a), false, "no caravan yet");
  days(w, 8);
  assert.ok(w.econ!.caravan, "a caravan came");
  assert.ok(caravanTrade(w, a));
  assert.ok(a.carry.food <= 3 && (heldOf(a, "shell") + (a.carry.hide ?? 0)) > 0);
  assert.ok((w.tally?.caravanTrades ?? 0) >= 1);
  // A merchant buys of the one who has, sells to the one who wants.
  const s = person("S", 4), buyer = person("Y", 5);
  const w2 = world([s, buyer, m]);
  know(w2, "counting");
  s.carry.wood = 9;
  econOf(m).shells = 10;
  econOf(buyer).shells = 10;
  buyer.cold = 0.6;
  s.personality.patience = 0.1;
  buyer.personality.boldness = 0.1;
  m.personality.boldness = 0.9;
  m.personality.patience = 0.9;
  const r = broker(w2, m, s, buyer, "wood", 2);
  assert.ok(r.ok, r.why);
  assert.ok(r.profit > 0, `profit ${r.profit}`);
  assert.ok(econOf(m).profit > 0 && buyer.carry.wood >= 2);
});

// ---- E4 ----

test("a durable good taken in payment by people who did not want it, again and again, becomes money; prices are then quoted in it", () => {
  const sellers = ["S1", "S2", "S3", "S4"].map((id, i) => person(id, i + 1));
  const buyer = person("B", 9);
  const w = world([...sellers, buyer]);
  know(w, "counting");
  assert.equal(w.econ?.money, undefined);
  for (let round = 0; round < 3; round++) {
    for (const s of sellers) {
      s.carry.food = 8;
      s.cold = 0;
      s.carry.wood = 6;
      econOf(buyer).shells = 20;
      buyer.carry.food = 0;
      buyer.needs.hunger = 0.7;
      const r = exchange(w, s, buyer, "food", 1);
      assert.ok(r.ok, r.ok ? "" : r.why);
      if (r.ok) assert.equal(r.paid, "shell");
    }
  }
  assert.equal(worldEcon(w).money, "shell");
  assert.equal(w.tally?.moneyAdopted, 1);
  assert.equal(quote(w, "food").unit, "shell");
  assert.ok((w.chronicle ?? []).some((c) => /money/.test(c.text)));
});

test("a food or perishable good is not taken as money", () => {
  const sellers = ["S1", "S2", "S3"].map((id, i) => person(id, i + 1));
  const buyer = person("B", 9);
  const w = world([...sellers, buyer]);
  know(w, "counting");
  buyer.carry.food = 9;
  for (const s of sellers) { s.carry.wood = 9; s.cold = 0.5; buyer.carry.wood = 0; econOf(buyer).shells = 0; for (let i = 0; i < 4; i++) exchange(w, s, buyer, "wood", 1); }
  assert.equal(worldEcon(w).money, undefined);
});

test("debt accrues interest over time, is repaid, and an unpaid one is a default that costs trust and credit", () => {
  const lender = person("L"), borrower = person("B", 2), other = person("O", 3);
  const w = world([lender, borrower, other]);
  know(w, "counting");
  fond(lender, borrower, 0.6);
  lender.carry.food = 8;
  const r = lend(w, lender, borrower, "food", 4);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.ok(r.debt.rate > 0);
  assert.equal(borrower.carry.food, 4);
  w.clock! += YEAR;
  accrue(w, YEAR);
  assert.ok(Math.abs(r.debt.owed - 4 * (1 + r.debt.rate)) < 0.01, `owed ${r.debt.owed}`);
  borrower.carry.food = 10;
  repay(w, borrower, r.debt, r.debt.owed);
  assert.equal(r.debt.state, "repaid");
  assert.equal(econOf(borrower).repaid, 1);
  // Not paid:
  fond(lender, borrower, 0.9);
  const r2 = lend(w, lender, borrower, "food", 2);
  assert.ok(r2.ok);
  borrower.carry.food = 0;
  const t0 = lender.relations.get("B")!.trust;
  days(w, 13);
  assert.ok(w.tally?.defaults, "a default");
  assert.ok(lender.relations.get("B")!.trust < t0);
  assert.equal(creditworthy(w, lender, borrower).ok, false);
});

test("without counting a loan carries no interest; a request to lend to someone untrusted is refused with a reason", () => {
  const l = person("L"), b = person("B", 2);
  const w = world([l, b]);
  l.carry.food = 5;
  fond(l, b, 0.8);
  const r = lend(w, l, b, "food", 2);
  assert.ok(r.ok && r.debt.rate === 0);
  const c = person("C", 3);
  const r2 = lend(w, l, c, "food", 1);
  assert.equal(r2.ok, false);
  assert.match(r2.ok ? "" : r2.why, /trust/);
});

test("tribute fills a granary; members in need draw from it and others cannot", () => {
  const ps = ["A", "B", "C"].map((id, i) => person(id, i + 1));
  const w = world(ps);
  for (const p of ps) p.carry.food = 7;
  const got = levy(w, 0.5);
  assert.ok(got > 5 && w.econ!.granary.food === got);
  joinGranary(w, ps[0]!);
  ps[0]!.carry.food = 0;
  ps[1]!.carry.food = 0;
  assert.ok(draw(w, ps[0]!) > 0, "a member is paid");
  assert.equal(draw(w, ps[1]!), 0, "a non-member is not");
  assert.equal(w.tally?.insurancePaid, 1);
});

// ---- E5 ----

test("saving compounds: with equal starts and chance in the harvest, the gap between rich and poor grows over a long run (Gini rises)", () => {
  const ps = Array.from({ length: 24 }, (_, i) => person(`P${i}`, i + 1));
  const w = world(ps);
  for (const p of ps) econOf(p).capital = 6;
  const before = wealthGini(w);
  let day = 0;
  for (let y = 0; y < 60; y++)
    for (let d = 0; d < 16; d++, day++) {
      for (const p of ps) {
        const luck = (chanceOf(`h|${p.id}|${day}`) - 0.5) * 2.4; // some days bring much, some little
        econOf(p).made7 = 1 + luck;
        saveDay(w, p);
      }
    }
  const after = wealthGini(w);
  assert.ok(before < 0.1, `start ${before}`);
  assert.ok(after > before + 0.25, `Gini ${before.toFixed(2)} -> ${after.toFixed(2)}`);
  assert.ok(gini([1, 1, 1, 1]) < 0.01 && gini([0, 0, 0, 10]) > 0.7);
  assert.ok((w.tally?.seedEaten ?? 0) > 0, "some had to eat their seed");
});

test("a shared venture: shares for wood, built when funded, a dividend by share; talk that outruns the yield breaks", () => {
  const a = person("A"), b = person("B", 2);
  const w = world([a, b]);
  a.carry.wood = 10;
  b.carry.wood = 10;
  const v = startVenture(w, a, "boat", 12);
  assert.equal(invest(w, a, v, 3).ok, true);
  assert.equal(v.built, false);
  assert.equal(invest(w, b, v, 9).ok, true);
  assert.equal(v.built, true);
  a.carry.food = 0;
  b.carry.food = 0;
  days(w, 3);
  assert.ok(b.carry.food > a.carry.food * 2.5, "the one with three times the shares gets three times the dividend");
  assert.ok(invest(w, b, v, 1).ok === false);
  // A bubble: buying on rising prices pushes a share above its worth, then it breaks.
  const fair = sharePrice(v);
  let top = fair;
  for (let i = 0; i < 40 && !w.tally?.crashes; i++) {
    speculate(v, 2);
    days(w, 1);
    top = Math.max(top, sharePrice(v));
  }
  assert.ok(top > fair * 1.8, `bubble ${top} vs ${fair}`);
  assert.ok((w.tally?.crashes ?? 0) >= 1);
  assert.ok(sharePrice(v) < fair, "after the crash it is worth less than before");
});

test("class follows wealth, land, and work for another; a poor borrower pays more", () => {
  const ps = Array.from({ length: 7 }, (_, i) => person(`P${i}`, i + 1));
  const w = world(ps);
  know(w, "counting");
  for (const p of ps) p.carry.food = 3;
  econOf(ps[0]!).capital = 40;
  w.things.push({ id: "crop-1", kind: "crop", x: 0, z: 0, radius: 2, owner: "P0" });
  days(w, 1);
  assert.equal(econOf(ps[0]!).class, "owner");
  assert.equal(econOf(ps[1]!).class, "commoner");
  ps[2]!.carry.food = 0;
  econOf(ps[2]!).capital = 0;
  ps[2]!.carry.wood = 0;
  fond(ps[0]!, ps[2]!, 0.7);
  fond(ps[0]!, ps[1]!, 0.7);
  days(w, 1);
  assert.equal(econOf(ps[2]!).class, "poor");
  const poorRate = lend(w, ps[0]!, ps[2]!, "food", 1);
  ps[0]!.carry.food = 5;
  const normalRate = lend(w, ps[0]!, ps[1]!, "food", 1);
  assert.ok(poorRate.ok && normalRate.ok);
  if (poorRate.ok && normalRate.ok) assert.ok(poorRate.debt.rate > normalRate.debt.rate);
  void classOf;
});

// ---- E6 ----

test("a wage is paid each day for work, the worker's output goes to the employer, and an unpaid worker leaves", () => {
  const boss = person("Boss"), worker = person("W", 2), kid = person("K", 3, 0, 0, 2);
  for (let i = 0; i < 20; i++) practise(worker, "forage", 0.3);
  const w = world([boss, worker, kid]);
  boss.carry.food = 8;
  assert.equal(hire(w, boss, kid, "food", 1).ok, false, "a child does not hire out");
  assert.equal(hire(w, boss, worker, "food", 1).ok, true);
  assert.equal(hire(w, boss, worker, "food", 1).ok, false, "already employed");
  const out = outputOf(worker);
  const f0 = boss.carry.food;
  days(w, 1);
  assert.equal(w.tally?.wagesPaid, 1);
  assert.ok(worker.carry.food >= 1, "paid in food");
  assert.ok(boss.carry.food > f0 - 1 + out.n * 0.9, "the employer is paid in output more than the wage");
  boss.carry.food = 0;
  for (let i = 0; i < 3; i++) { boss.carry.food = 0; days(w, 1); } // the employer is broke each morning
  assert.equal(econOf(worker).job, undefined, "left when unpaid");
  assert.equal(w.tally?.quitUnpaid, 1);
});

test("an employer commands a worker, who obeys unless their own needs call; a stranger cannot command", () => {
  const boss = person("Boss"), worker = person("W", 2), other = person("O", 3);
  const w = world([boss, worker, other]);
  boss.carry.food = 5;
  assert.equal(command(w, boss, worker, "gather").ok, false, "no job, no command");
  hire(w, boss, worker, "food", 1);
  assert.equal(command(w, other, worker, "gather").ok, false);
  assert.equal(command(w, boss, worker, "gather").ok, true);
  const opts = () => [{ intent: { kind: "gather" as const, x: 0, z: 0, speed: 1, remaining: 3 }, score: 0.2 }, { intent: { kind: "play" as const, x: 0, z: 0, speed: 1, remaining: 3 }, score: 0.5 }];
  const a = opts();
  economyBias(worker, w, a);
  assert.ok(a[0]!.score > a[1]!.score, "the order wins over play");
  worker.needs.thirst = 0.8;
  const b = opts();
  economyBias(worker, w, b);
  assert.equal(b[0]!.score, 0.2, "thirst comes first");
  worker.needs.thirst = 0.1;
  economyAfter(w, worker, intent("gather"));
  assert.equal(w.tally?.ordersObeyed, 1);
});

test("a debt that cannot be paid becomes bonded work for the creditor until the labour has cleared it", () => {
  const l = person("L"), d = person("D", 2);
  for (let i = 0; i < 20; i++) practise(d, "forage", 0.3);
  const w = world([l, d]);
  know(w, "counting");
  l.carry.food = 6;
  fond(l, d, 0.9);
  const r = lend(w, l, d, "food", 3);
  assert.ok(r.ok);
  d.carry.food = 0;
  days(w, 12);
  assert.equal(econOf(d).job?.bonded, true);
  assert.equal(w.tally?.bondage, 1);
  assert.equal(econOf(d).class, "bonded");
  assert.equal(command(w, l, d, "forage").ok, true);
  days(w, 6);
  assert.equal(econOf(d).job, undefined, "worked off");
  assert.equal(w.tally?.bondageEnded, 1);
});

// ---- E7 ----

test("counting and writing change how accounts are kept: memory, then tally, then written; the ledger then settles what is owed", () => {
  const l = person("L"), b = person("B", 2);
  const w = world([l, b]);
  fond(l, b, 0.8);
  l.carry.food = 9;
  assert.equal(ledgerKind(w), "memory");
  lend(w, l, b, "food", 2);
  assert.equal(w.econ!.ledger.length, 0, "nothing is kept");
  assert.equal(ledgerBalance(w, "B", "L"), undefined);
  know(w, "counting");
  assert.equal(ledgerKind(w), "tally");
  const r = lend(w, l, b, "food", 3);
  assert.ok(r.ok);
  assert.equal(ledgerBalance(w, "B", "L"), 3);
  know(w, "counting", "writing");
  assert.equal(ledgerKind(w), "written");
  b.carry.food = 6;
  if (r.ok) repay(w, b, r.debt, 1);
  assert.equal(ledgerBalance(w, "B", "L"), 2, "the account shows what is still owed");
});

test("without an account debts are sometimes forgotten and disputed; with one, never", () => {
  const run = (kn: string[]) => {
    const l = person("L"), b = person("B", 2);
    const w = world([l, b]);
    if (kn.length) know(w, ...kn);
    l.carry.food = 99;
    fond(l, b, 0.9);
    for (let i = 0; i < 60; i++) {
      const d = lend(w, l, b, "food", 0.1, { rate: 0 });
      assert.ok(d.ok);
      b.relations.set("L", { affinity: 0.5, trust: 0.9, familiarity: 1, lastTogether: 0 });
    }
    b.carry.food = 0;
    days(w, 9);
    return w.tally?.debtsDisputed ?? 0;
  };
  assert.ok(run([]) >= 5, "in memory alone, some are lost");
  assert.equal(run(["counting"]), 0);
});

test("weights and measures: amounts are guesses before counting and exact after", () => {
  const w = world([person("A")]);
  const seen = new Set<number>();
  for (let t = 0; t < 40; t++) {
    w.clock = t * 61;
    seen.add(measure(w, 6, "x"));
  }
  assert.ok(seen.size > 1, "handfuls vary");
  know(w, "counting");
  for (let t = 0; t < 10; t++) {
    w.clock = t * 61;
    assert.equal(measure(w, 6, "x"), 6);
  }
});

test("a theft that others saw, or that an account records, leaves a debt of restitution", () => {
  const a = person("A", 1), b = person("B", 2), c = person("C", 3, 3, 0), d = person("D", 4, 4, 0);
  const w = world([a, b, c, d]);
  economyTheft(w, b, a, "food", 2);
  assert.equal(w.tally?.restitutionOwed, 1, "seen by two");
  const debt = w.econ!.debts[0]!;
  assert.equal(debt.debtor, "B");
  assert.equal(debt.creditor, "A");
  assert.equal(debt.owed, 3);
  const lone = world([person("A", 1), person("B", 2)]);
  economyTheft(lone, lone.people[1]!, lone.people[0]!, "food", 2);
  assert.equal(lone.tally?.restitutionOwed, undefined, "unseen and unrecorded: nothing to enforce it");
  know(lone, "counting");
  economyTheft(lone, lone.people[1]!, lone.people[0]!, "food", 2);
  assert.equal(lone.tally?.restitutionOwed, 1);
});

test("a running camp with the economy on stays alive and well fed (the hooks do not break a life)", () => {
  const ps = Array.from({ length: 5 }, (_, i) => person(`P${i}`, 20 + i, i * 2, 0));
  const things: Thing[] = [{ id: "bush-1", kind: "bush", x: 6, z: 6, radius: 2, stock: 4, maxStock: 4 }, { id: "stream", kind: "stream", x: 8, z: -3, radius: 3 }];
  const w = world(ps, things);
  for (let t = 0; t < 3 * DAY; t += 4) step(w, 4);
  assert.ok(w.econ, "the economy ran");
  assert.equal(w.people.length + (w.dead?.length ?? 0), 5);
  assert.ok(!(w.dead ?? []).some((d) => /hunger|thirst|starv/i.test(d.cause)), "nobody starved");
  assert.ok(w.econ!.history.food!.length >= 2);
});
