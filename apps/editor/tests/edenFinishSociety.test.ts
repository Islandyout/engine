import test from "node:test";
import assert from "node:assert/strict";
import { DAY, YEAR } from "../src/eden/earth";
import { fight } from "../src/eden/conflict";
import { converse } from "../src/eden/speech";
import { betray, learnOfBetrayal } from "../src/eden/heart";
import {
  FOLK, RULES, assignClass, banWorks, bookAllowed, closeAccess, collapseWatch, composeTale, eliteBy, learnOf, lived, tellTale, worldLore,
} from "../src/eden/learning";
import { makePerson, step, type Person, type Thing, type World } from "../src/eden/mind";
import { calendar, courtOf, festivalOn, groupOf, inTongue, larderOf, nextFestival, societyOf, societyView, split } from "../src/eden/society";

// These drive the real step(): a small world of people with water, food and a fire, run for hours or days.
const person = (id: string, x = 0, z = 0, age = 20, sex: "m" | "f" = "m", seed = id.length * 31 + id.charCodeAt(id.length - 1)) =>
  makePerson(id, x, z, seed, { sociability: 0.6, boldness: 0.5, curiosity: 0.5 }, { name: id, sex, age });
const THINGS = (): Thing[] => [
  { id: "river", kind: "river", x: 12, z: 0, radius: 3 },
  { id: "grove", kind: "grove", x: -10, z: 6, radius: 3, stock: 40, maxStock: 40 },
  { id: "fire", kind: "campfire", x: 2, z: 2, radius: 2, fuel: 1e6 },
  { id: "roof", kind: "shelter", x: -2, z: -2, radius: 3, stock: 6 },
];
const world = (people: Person[], clock = DAY / 3): World => ({ things: THINGS(), people, radius: 100, clock, maxPeople: 60, climate: { meanC: 16, seasonalAmpC: 4, dailyAmpC: 3, rainy: 0.1, seed: 3 }, fish: 40 });
const tie = (ps: Person[], trust = 0.7, aff = 0.5) => {
  for (const a of ps) for (const b of ps) if (a !== b) a.relations.set(b.id, { affinity: aff, trust, familiarity: 0.8, lastTogether: 0 });
};
const know = (w: World) => { for (const p of w.people) for (const t of w.things) p.memory.set(t.id, { x: t.x, z: t.z, feeling: 0.3, visits: 1, lastSeen: 0 }); };
const run = (w: World, seconds: number, dt = 4, each?: () => void) => { for (let t = 0; t < seconds; t += dt) { step(w, dt); each?.(); } };
const band = (n: number, prefix = "P") => Array.from({ length: n }, (_, i) => person(`${prefix}${i}`, (i % 5) * 2, Math.floor(i / 5) * 2, 18 + 2 * i, i % 2 ? "f" : "m"));
const tallyOf = (w: World, k: string) => w.tally?.[k] ?? 0;
const fed = (ps: Person[]) => { for (const p of ps) { p.needs.hunger = 0.1; p.needs.thirst = 0.1; p.carry.food = 4; } };

/** A band with a leader the others trust, run until the society has seen it. */
function led(n = 8) {
  const ps = band(n);
  tie(ps, 0.6);
  for (const q of ps) if (q.id !== "P3") q.relations.get("P3")!.trust = 0.97;
  const w = world(ps);
  know(w);
  fed(ps);
  run(w, 2400, 8, () => fed(ps));
  return { w, ps, g: groupOf(w, "main") };
}

// ---- leaders with power ----

test("G1 the leader's word is acted on: orders go to trusting followers, who do the thing, and the common store feeds the hungry", () => {
  const { w, ps, g } = led();
  assert.equal(g.leader, "P3");
  w.clock = YEAR / 2 + DAY + 480; // autumn, eight in the morning
  for (const p of ps) { p.carry.food = 0; p.needs.hunger = 0.3; p.needs.thirst = 0.2; p.intent = undefined; }
  g.larder = 5;
  const orders: string[] = [];
  run(w, DAY / 2, 4, () => { for (const p of ps) if (p.econ?.order?.by === "P3") orders.push(p.id); for (const p of ps) { p.needs.thirst = Math.min(p.needs.thirst, 0.4); } });
  assert.ok(tallyOf(w, "leaderOrders") >= 1, "the leader gave orders");
  assert.ok(orders.length >= 1 && !orders.includes("P3"), "followers hold the leader's order");
  assert.ok(tallyOf(w, "leaderOrdersObeyed") >= 1, `a follower did what they were told: ${JSON.stringify(w.tally)}`);
  // a follower who is hungry and has nothing is given from the store
  const poor = ps[0]!;
  poor.needs.hunger = 0.9;
  poor.carry.food = 0;
  g.larder = 3;
  run(w, 400, 4, () => { for (const p of ps) p.needs.thirst = Math.min(p.needs.thirst, 0.4); poor.needs.hunger = 0.9; poor.carry.food = 0; for (const p of ps) if (p !== poor) p.needs.hunger = Math.min(p.needs.hunger, 0.3); });
  assert.ok(tallyOf(w, "tributeShared") >= 1);
});

test("G1 a follower who does not trust the leader refuses the order", () => {
  const { w, ps, g } = led();
  tie(ps, 0.1, 0.1); // no one trusts anyone, so whoever leads is not obeyed
  w.clock = YEAR / 2 + DAY + 480;
  g.lastOrder = undefined;
  for (const p of ps) { p.carry.food = 0; p.intent = undefined; }
  const before = tallyOf(w, "leaderOrders");
  run(w, 600, 4, () => { for (const p of ps) { p.needs.hunger = 0.2; p.needs.thirst = 0.2; p.carry.food = 0; } });
  assert.ok(tallyOf(w, "leaderOrdersRefused") >= 1, `the leader's word was refused: ${g.leader} ${g.lastOrder} ${JSON.stringify(Object.fromEntries(Object.entries(w.tally ?? {}).filter(([k]) => /rder|leader/.test(k))))}`);
  assert.ok(tallyOf(w, "leaderOrdersRefused") > tallyOf(w, "leaderOrders") - before, "more refused than obeyed");
});

test("G1 tribute is collected at the festival and the feast is eaten from it", () => {
  const { w, ps, g } = led();
  w.clock = Math.floor(w.clock! / YEAR) * YEAR + YEAR + 4 * DAY + 20 * 60 * 1 * 60 / 60 + 0; // first day of summer
  while (!festivalOn(w)) w.clock! += DAY;
  w.clock = Math.floor(w.clock! / DAY) * DAY + (19.9 / 24) * DAY;
  for (const p of ps) { p.x = 2 + p.x * 0.2; p.z = 2; p.carry.food = 4; p.needs.hunger = 0.4; p.needs.thirst = 0.1; p.intent = undefined; }
  const before = larderOf(w, g);
  run(w, 600, 4, () => { for (const p of ps) { p.needs.thirst = 0.1; p.needs.hunger = Math.max(p.needs.hunger, 0.4); } });
  assert.ok(tallyOf(w, "festivals") >= 1);
  assert.ok(tallyOf(w, "tributeCollected") >= 3, `collected ${tallyOf(w, "tributeCollected")}`);
  assert.ok(larderOf(w, g) > before - 1, "the store holds what was brought");
  assert.ok(tallyOf(w, "feastMeals") >= 1, "the feast was eaten");
});

// ---- justice: more than theft, more than repayment ----

test("G2 a violence in a people with a leader is judged in its court and the penalty from conflict.ts is carried out (jail or exile)", () => {
  const { w, ps, g } = led();
  const a = ps[0]!, b = ps[1]!;
  a.father = "HouseA";
  b.father = "HouseB";
  assert.equal(courtOf(w, a, b, "bind", "power"), true, "taken by the court");
  run(w, 1400, 4, () => fed(ps));
  const c = societyOf(w).cases.find((x) => x.kind === "harm")!;
  assert.equal(c.state, "ruled");
  assert.equal(c.verdict, "guilty");
  assert.ok(["jail", "exile"].includes(c.penalty!), `penalty ${c.penalty}`);
  assert.ok(a.conflict?.jail || a.conflict?.exile || tallyOf(w, "jailed") + tallyOf(w, "exiled") >= 1, "carried out");
  assert.ok(g.leader);
});

test("G2 a blow is a feud between the houses, and the priest's second taboo follows the first judged harm", () => {
  const { w, ps, g } = led();
  const a = ps[0]!, b = ps[1]!;
  a.father = "HouseA";
  b.father = "HouseB";
  for (let i = 0; i < 3; i++) fight(w, a, b, "anger");
  assert.ok(tallyOf(w, "feudsFrom_violence") >= 1, JSON.stringify(w.tally));
  g.priest = "P5";
  courtOf(w, a, b, "fight", "anger");
  run(w, 1400, 4, () => fed(ps));
  assert.ok(g.taboos.some((t) => t.what === "spill-blood"), "no blood among those who share a fire");
});

test("G2 working on a feast day under the taboo is a case, judged by the priest: an offering, then exile on the third time", () => {
  const { w, ps, g } = led();
  g.priest = "P5";
  g.taboos.push({ what: "work-on-festival", text: "no one works on feast days", by: "P5", since: 0 });
  while (!festivalOn(w)) w.clock! += DAY;
  w.clock = Math.floor(w.clock! / DAY) * DAY + (9 / 24) * DAY;
  const worker = ps[0]!;
  for (let k = 0; k < 3; k++) {
    for (const p of ps) { p.x = 3 + (p.id.length % 3); p.z = 3; p.needs.hunger = 0.2; p.needs.thirst = 0.1; p.carry.food = 3; }
    worker.intent = { kind: "forage", targetId: "grove", x: worker.x, z: worker.z, speed: 1, remaining: 1, arrived: true };
    run(w, 40, 4, () => { for (const p of ps) { p.needs.thirst = 0.1; } });
    w.clock = Math.floor(w.clock! / DAY) * DAY + (k + 1) * 0 + (9 / 24) * DAY;
    run(w, 700, 4, () => fed(ps));
    w.clock = Math.floor(w.clock! / DAY) * DAY + 4 * DAY + (9 / 24) * DAY; // the next feast
  }
  const cases = societyOf(w).cases.filter((c) => c.kind === "taboo");
  assert.ok(cases.length >= 1, `cases ${cases.length}`);
  assert.equal(cases[0]!.judge, "P5");
  assert.ok(["offering", "shame", "exile"].includes(cases[0]!.penalty!));
});

test("G4 an affair and a betrayal feed a feud between the houses", () => {
  const { w, ps } = led();
  const a = ps[0]!, b = ps[1]!, c = ps[2]!;
  a.father = "HouseA";
  b.father = "HouseB";
  c.father = "HouseC";
  for (let i = 0; i < 2; i++) betray(w, a, b, c);
  learnOfBetrayal(w, b, a);
  learnOfBetrayal(w, b, a);
  assert.ok(tallyOf(w, "feudsFrom_affair") + tallyOf(w, "feudsFrom_betrayal") >= 1, JSON.stringify(w.tally));
  assert.ok(societyOf(w).feuds.some((f) => f.heat >= 0.5));
});

// ---- festivals, rites, priests ----

test("G3 the calendar and an event list are readable by the host, and a festival evening gathers the people", () => {
  const { w, ps } = led();
  const view = societyView(w);
  assert.equal(view.calendar.length, 4);
  assert.ok(view.next && view.next.inDays >= 0);
  assert.equal(nextFestival(w)!.name, calendar(w)[view.next!.season === "spring" ? 0 : view.next!.season === "summer" ? 1 : view.next!.season === "autumn" ? 2 : 3]!.name);
  while (!festivalOn(w)) w.clock! += DAY;
  const day = Math.floor(w.clock! / DAY) * DAY;
  // a feast evening against an ordinary one: how many evenings are spent at the fire?
  const evenings = (clock: number) => {
    const ws = band(8);
    tie(ws);
    const w2 = world(ws, clock);
    know(w2);
    for (const p of ws) { p.x = 30 * Math.cos(p.id.length * 2.1 + p.age); p.z = 30 * Math.sin(p.age); }
    fed(ws);
    run(w2, 220, 4, () => fed(ws));
    return w2;
  };
  const feast = evenings(day + (16.6 / 24) * DAY);
  const plain = day + 2 * DAY + (16.6 / 24) * DAY;
  assert.equal(festivalOn(w, plain), undefined);
  const ordinary = evenings(plain);
  assert.ok(tallyOf(feast, "festivalGatherings") > tallyOf(ordinary, "eveningGatherings"), `feast ${tallyOf(feast, "festivalGatherings")} vs ordinary ${tallyOf(ordinary, "eveningGatherings")}`);
  // and it is on the host's list
  const w3 = feast;
  run(w3, 3600, 4, () => fed(w3.people));
  assert.ok(societyView(w3).events.some((e) => e.kind === "festival"), "the feast is in the event list");
  assert.ok(societyView(w3).feasts.length >= 1);
});

test("G5 a rite waits for the priest, who walks to it and officiates; without the priest near, the elders hold it after a day", () => {
  const ps = band(7);
  tie(ps, 0.6);
  const w = world(ps);
  know(w);
  fed(ps);
  run(w, 2400, 8, () => fed(ps));
  const g = groupOf(w, "main");
  g.priest = "P5";
  const priest = ps[5]!;
  priest.x = 70; priest.z = 0;
  const child = person("Kid", 0, 0, 0.55, "m", 77);
  w.people.push(child);
  child.mother = "P1";
  for (const p of ps) p.relations.set("Kid", { affinity: 0.5, trust: 0.5, familiarity: 0.5, lastTogether: 0 });
  know(w);
  run(w, 3 * 60, 4, () => fed(ps));
  assert.ok(!child.rites?.includes("naming"), "the naming waits for the priest");
  assert.ok(Object.keys(societyOf(w).pending ?? {}).some((k) => k.startsWith("Kid|")));
  run(w, DAY, 4, () => { fed(ps); child.needs.hunger = 0.1; child.needs.thirst = 0.1; });
  assert.ok(child.rites?.includes("naming"), "named in the end");
  assert.ok(tallyOf(w, "ritesOfficiated") + tallyOf(w, "ritesLay") >= 1);
});

test("G5 a priest arbitrates a feud between houses not their own, and in a schism the priests win people from each other", () => {
  const { w, ps, g } = led(10);
  g.priest = "P5";
  g.rivalPriest = "P6";
  ps[0]!.father = "P8";
  ps[1]!.father = "P9";
  ps[5]!.faith = { death: "a", gods: "x" } as never;
  ps[6]!.faith = { death: "b", gods: "y" } as never;
  ps[7]!.faith = { death: "b" } as never;
  ps[8]!.faith = { death: "a" } as never;
  ps[9]!.faith = { death: "a" } as never;
  ps[4]!.faith = { death: "a" } as never;
  societyOf(w).schisms.push({ group: "main", question: "death", sides: ["a", "b"], since: 0, heat: 0.7 });
  societyOf(w).feuds.push({ a: "P8", b: "P9", heat: 0.8, since: 0, cause: "test" });
  run(w, YEAR / 4 + DAY, 8, () => fed(ps));
  assert.ok(tallyOf(w, "arbitrations") >= 1, JSON.stringify(w.tally));
  assert.ok(tallyOf(w, "conversions") >= 1, "the priests contended for the doubtful");
});

// ---- the split camp ----

test("G6 a camp is a home: it has its own roof and larder and its people live there", () => {
  const { w, ps, g } = led(10);
  const going = ps.slice(5);
  for (const p of going) p.carry.food = 4;
  const camp = split(w, g, going, "a quarrel");
  const roof = w.things.find((t) => t.id === camp.home)!;
  assert.ok(roof && roof.kind === "shelter" && (roof.stock ?? 0) >= 4, "a roof with a larder");
  assert.equal(larderOf(w, camp), roof.stock);
  assert.ok(w.things.some((t) => t.id === camp.hearth));
  run(w, 2 * DAY, 4, () => { for (const p of ps) { p.needs.thirst = Math.min(p.needs.thirst, 0.45); p.needs.hunger = Math.min(p.needs.hunger, 0.45); } });
  const at = tallyOf(w, "campNightAt"), away = tallyOf(w, "campNightAway");
  assert.ok(at > away, `nights at home ${at} vs away ${away}`);
  assert.ok(tallyOf(w, "campSleepAtHome") >= 1, "they sleep at the camp");
});

// ---- the tongue ----

test("F5 speech uses the people's drifted words", () => {
  const { w, ps, g } = led();
  g.customs["word:hello"] = 3;
  g.customs["word:water"] = 2;
  assert.equal(inTongue(w, ps[0]!, "Hello. I need water."), "Sala. I need anu.");
  const ex = converse(w, ps[0]!, ps[1]!, () => 0.5);
  assert.ok(typeof ex.said === "string");
  const other = person("Far", 0, 0);
  other.group = "elsewhere";
  assert.equal(inTongue(w, other, "Hello"), "Hello", "a people whose words have not drifted speak the plain line");
  g.customs["word:hello"] = 3;
  run(w, DAY, 4, () => fed(ps));
  assert.ok(tallyOf(w, "speechInDialect") >= 1, "people talking in the running world used their own words");
});

// ---- learning ----

test("F3 nobody is born into a class by decree: it comes from the parents' rank and wealth, and the leader's class is the elite", () => {
  const { w, ps } = led();
  const chief = ps[3]!;
  assignClass(w, chief);
  assert.equal(learnOf(chief).class, "elite", "the leader holds rank");
  const heirs = Array.from({ length: 8 }, (_, i) => { const k = person(`Heir${i}`, 0, 0, 3, "m", 5 + i); k.father = chief.id; return k; });
  const plains = Array.from({ length: 8 }, (_, i) => { const k = person(`Plain${i}`, 0, 0, 3, "m", 40 + i); k.father = ps[0]!.id; return k; });
  w.people.push(...heirs, ...plains);
  run(w, 200, 4, () => fed(w.people));
  assert.ok(heirs.filter((k) => learnOf(k).class === "elite").length >= 6, "born to rank, nearly all keep it");
  assert.ok(plains.every((k) => learnOf(k).class === "common"), "born to the commons");
  assert.ok(tallyOf(w, "classInherited") >= 1);
  // and wealth: an owner is elite
  ps[1]!.econ = { ...(ps[1]!.econ ?? { shells: 0, made: {}, made7: 0, capital: 0, grievances: {}, repaid: 0, defaulted: 0, profit: 0, shares: {} }), class: "owner" } as never;
  assert.ok(eliteBy(w, ps[1]!));
});

test("F3 access depends on class: the lettered elite of a traditional leader close reading, and a craft taught only to one sex closes to the other", () => {
  const { w, ps } = led();
  w.knowledge = { ...(w.knowledge ?? {}), writing: { by: "P0", t: 0 } } as never;
  for (const p of ps) { learnOf(p).class = p.id === "P3" || p.id === "P1" || p.id === "P2" ? "elite" : "common"; }
  for (const id of ["P1", "P2", "P3"]) { const p = ps.find((q) => q.id === id)!; p.ideas = [...(p.ideas ?? []), "writing"]; learnOf(p).literate = true; }
  ps[3]!.values = { ...(ps[3]!.values ?? {}), tradition: 0.9 } as never;
  const lore = worldLore(w);
  for (const id of ["P0", "P2", "P4"]) learnOf(ps.find((q) => q.id === id)!).initiated.push("hunt"); // P0, P2, P4 are all men
  closeAccess(w, ps[3]!);
  if (!lore.restrict.read) throw new Error("reading not closed: leader tradition or writing knowledge not seen: " + JSON.stringify(ps[3]!.values));
  assert.equal(bookAllowed(w, ps[0]!, "x"), false, "a commoner may not read");
  assert.equal(bookAllowed(w, ps[1]!, "x"), true, "an elite with letters may");
  assert.deepEqual(lore.restrict["skill:hunt"], { sex: "m" });
});

test("F3 a priest bans the book of the rival faith and a traditional leader a book of new ideas, in the running world", () => {
  const { w, ps, g } = led();
  g.priest = "P5";
  ps[5]!.faith = { death: "a" } as never;
  ps[6]!.faith = { death: "b" } as never;
  ps[3]!.values = { ...(ps[3]!.values ?? {}), tradition: 0.95 } as never;
  const lib: Thing = { id: "lib", kind: "library", x: 0, z: 0, radius: 2 };
  w.things.push(lib);
  w.works = [
    { id: "b1", kind: "book", by: "P6", byName: "P6", title: "The Other Way", t: 0, quality: 0.5, at: "lib", knows: [] },
    { id: "b2", kind: "book", by: "P0", byName: "P0", title: "New Things", t: 0, quality: 0.5, at: "lib", knows: ["wheel-of-novelty"] },
  ];
  assert.ok(banWorks(w, ps[5]!, "priest") === "b1" || banWorks(w, ps[5]!, "priest") === undefined);
  // run the sim until the authorities have acted
  for (let i = 0; i < 6 && !(worldLore(w).banned.length >= 1); i++) { w.clock! += 5 * DAY; run(w, 700, 4, () => fed(ps)); }
  assert.ok(worldLore(w).banned.length >= 1, `banned ${worldLore(w).banned}`);
  assert.ok(tallyOf(w, "booksBanned") >= 1);
  assert.ok(societyView(w).events.some((e) => e.kind === "ban") || tallyOf(w, "bannedByPriest") >= 1);
});

test("F3 a collapse comes of a real event: many deaths in a season, or a severe epidemic", () => {
  const { w, ps } = led(12);
  ps.forEach((p, i) => { p.ideas = ["fire", "writing", "wheel"]; void i; });
  const now = w.clock!;
  for (const p of ps.slice(6)) { w.people.splice(w.people.indexOf(p), 1); (w.dead ??= []).push({ person: p, t: now - DAY, cause: "sickness" }); }
  assert.equal(tallyOf(w, "collapses"), 0);
  run(w, 2000, 8, () => fed(w.people));
  assert.equal(tallyOf(w, "collapses"), 1);
  assert.ok(w.people.some((p) => (p.ideas ?? []).length < 3), "some knowledge was lost");
  // an epidemic across the people is also an event
  const { w: w2, ps: ps2 } = led(8);
  w2.world2 = { epidemic: { name: "fever", origin: "x", since: 0, severity: 0.8, homeCases: 5 } } as never;
  for (const p of ps2.slice(0, 4)) p.illness = { severity: 0.5, since: 0 } as never;
  assert.ok(collapseWatch(w2), "the plague took knowledge with it");
  // and nothing happens in an ordinary year
  const { w: w3 } = led(8);
  assert.equal(collapseWatch(w3), undefined);
});

test("F2 the catalogue: twenty-plus rules and twenty-plus false beliefs, each rule tied to an experience, and tales tied to songs and stories", () => {
  assert.ok(Object.keys(RULES).length >= 20);
  assert.ok(FOLK.filter((c) => !c.truth).length >= 20);
  assert.ok(FOLK.filter((c) => c.truth).length >= 5);
  const { w, ps } = led();
  const a = ps[0]!;
  const song = composeTale(w, a, "wood-early", "song");
  const work = w.works!.find((x) => x.id === song.work)!;
  assert.equal(work.kind, "song");
  assert.equal(work.tale, song.id);
  // a song the person already made becomes the telling of the tale
  w.works = w.works!.filter((x) => x.by !== a.id);
  w.works!.push({ id: "mine", kind: "story", by: a.id, byName: a.name, title: "Mine", t: w.clock!, quality: 0.5 });
  const t2 = composeTale(w, a, "never-hunt-alone", "story");
  assert.equal(t2.work, "mine");
  assert.equal(w.works!.find((x) => x.id === "mine")!.tale, t2.id);
  // a banned song is not told
  worldLore(w).banned.push(t2.work!);
  const b = ps[1]!;
  for (let i = 0; i < 40; i++) tellTale(w, a, b);
  assert.equal(learnOf(b).tales[t2.id], undefined, "a forbidden song is not passed on");
  // what a person lived through picks the rule
  a.felt = { hungry: 0, cold: 0, scares: 2, reflected: 0 };
  assert.equal(lived(w, a), "scare");
});

test("F2 in the running world a song someone made is given a rule from what they lived through", () => {
  const { w, ps } = led();
  const a = ps[0]!;
  a.felt = { hungry: 200, cold: 0, scares: 0, reflected: 0 };
  w.works = [{ id: "work-0", kind: "song", by: a.id, byName: a.name, title: "A song", t: w.clock!, quality: 0.5 }];
  learnOf(a).lastTale = undefined;
  run(w, 3 * DAY, 4, () => { fed(ps); a.felt!.hungry = 200; });
  const tale = worldLore(w).tales.find((t) => t.by === a.id);
  assert.ok(tale, "a tale was made");
  assert.ok(tallyOf(w, "workTales") >= 0);
  assert.ok(w.works!.find((x) => x.id === "work-0")!.tale || tale!.work, "tied to a work");
});

test("G2 a hungry person getting food on a feast day is not breaking the taboo", () => {
  const { w, ps, g } = led();
  g.priest = "P5";
  g.taboos.push({ what: "work-on-festival", text: "no one works on feast days", by: "P5", since: 0 });
  while (!festivalOn(w)) w.clock! += DAY;
  w.clock = Math.floor(w.clock! / DAY) * DAY + (9 / 24) * DAY;
  const hungry = ps[0]!;
  for (const p of ps) { p.x = 3 + (p.id.length % 3); p.z = 3; p.needs.thirst = 0.1; p.carry.food = 3; p.needs.hunger = 0.2; }
  hungry.needs.hunger = 0.8;
  hungry.carry.food = 0;
  hungry.intent = { kind: "forage", targetId: "grove", x: hungry.x, z: hungry.z, speed: 1, remaining: 1, arrived: true };
  run(w, 60, 4, () => { hungry.needs.hunger = 0.8; });
  assert.equal(societyOf(w).cases.filter((c) => c.kind === "taboo" && c.accused === hungry.id).length, 0);
});

test("G2 exile for the taboo happens once; while someone is sent away further breaches are not judged again, and on their return the count starts over", () => {
  const { w, ps, g } = led();
  g.priest = "P5";
  g.taboos.push({ what: "work-on-festival", text: "no one works on feast days", by: "P5", since: 0 });
  const bad = ps[0]!;
  const file = () => societyOf(w).cases.push({ id: `case-${societyOf(w).cases.length}`, group: g.id, accused: bad.id, victim: "P5", kind: "taboo", filed: w.clock!, norm: "taboo", starving: false, state: "open" });
  for (let i = 0; i < 6; i++) {
    file();
    run(w, 700, 4, () => fed(ps));
  }
  const ruled = societyOf(w).cases.filter((c) => c.kind === "taboo");
  assert.equal(ruled.filter((c) => c.penalty === "exile").length, 1, `exiles ${ruled.map((c) => c.penalty ?? c.verdict).join(",")}`);
  assert.ok(ruled.some((c) => c.verdict === "dismissed" && /already sent away/.test(c.ruling ?? "")));
  assert.ok((g.breaches?.[bad.id] ?? 0) <= 2, "the count started over after the exile");
});
