import test from "node:test";
import assert from "node:assert/strict";
import { DAY, YEAR } from "../src/eden/earth";
import { pairUp } from "../src/eden/lifecycle";
import { witness } from "../src/eden/mindmodel";
import { makePerson, type Person, type Thing, type World } from "../src/eden/mind";
import { calendar, customKeys, divergence, festivalOn, groupOf, houseOf, membersOf, onTheft, rankOf, societyBias, societyOf, societyStep, split } from "../src/eden/society";

const person = (id: string, x = 0, z = 0, age = 12, sex: "m" | "f" = "m") => makePerson(id, x, z, id.length * 7 + 1, {}, { name: id, sex, age });
const world = (people: Person[], things: Thing[] = [], clock = DAY / 3): World => ({ things, people, radius: 100, clock, climate: { meanC: 16, seasonalAmpC: 4, dailyAmpC: 3, rainy: 0.1, seed: 3 } });
const run = (w: World, seconds: number, dt = 60) => {
  for (let t = 0; t < seconds; t += dt) {
    w.clock = (w.clock ?? 0) + dt;
    societyStep(w, dt);
  }
};
const trust = (a: Person, b: Person, t: number, aff = 0.5) => a.relations.set(b.id, { affinity: aff, trust: t, familiarity: 0.8, lastTogether: 0 });
const mutual = (ps: Person[], t = 0.5, aff = 0.5) => {
  for (const a of ps) for (const b of ps) if (a !== b) trust(a, b, t, aff);
};
const band = (n: number, prefix = "P") => Array.from({ length: n }, (_, i) => person(`${prefix}${i}`, i * 2, 0, 12 + i));
const kill = (w: World, p: Person, cause = "old age") => {
  w.people.splice(w.people.indexOf(p), 1);
  (w.dead ??= []).push({ person: p, t: w.clock ?? 0, cause });
};

test("G1 a leader emerges from status: the one the others trust most, with a council behind them", () => {
  const ps = band(6);
  mutual(ps, 0.45);
  for (const q of ps) if (q !== ps[3]) trust(q, ps[3]!, 0.95);
  const w = world(ps);
  assert.equal(w.society, undefined);
  run(w, 900);
  const g = groupOf(w, "main");
  assert.equal(g.leader, "P3");
  assert.equal(g.council.length, 3);
  assert.ok(!g.council.includes("P3"));
  assert.ok(rankOf(w, ps[3]!) >= 0.6);
});

test("G1 succession: the heir is the leader's eldest adult child, who inherits rank; with no child the council chooses", () => {
  const boss = person("Boss", 0, 0, 30), kidA = person("KidA", 2, 0, 9), kidB = person("KidB", 3, 0, 6);
  kidA.father = "Boss";
  kidB.father = "Boss";
  const ps = [boss, kidA, kidB, ...band(4, "O")];
  mutual(ps, 0.45);
  for (const q of ps) if (q !== boss) trust(q, boss, 0.97);
  const w = world(ps);
  run(w, 900);
  assert.equal(groupOf(w, "main").leader, "Boss");
  const child = person("Heir", 1, 0, 8);
  child.father = "Boss";
  assert.ok(rankOf(w, child) >= 0.45, "a child born to the leader holds rank from birth");
  kill(w, boss);
  run(w, 120);
  assert.equal(groupOf(w, "main").leader, "KidA", "the eldest adult child");
  assert.equal(w.tally?.successionsByBlood, 1);
  // A leader with no grown children: the council's first takes over.
  const g = groupOf(w, "main");
  const leader = w.people.find((p) => p.id === g.leader)!;
  for (const p of w.people) if (p.father === leader.id || p.mother === leader.id) p.father = p.mother = undefined;
  const council = [...g.council];
  kill(w, leader);
  run(w, 120);
  assert.ok(council.includes(groupOf(w, "main").leader!), "chosen from the council");
  assert.equal(w.tally?.successions, 1);
});

function lawWorld() {
  const ps = band(7);
  ps.forEach((p, i) => (p.father = i === 0 ? undefined : `Line${i}`)); // separate houses
  mutual(ps, 0.5);
  for (const q of ps) if (q !== ps[6]) trust(q, ps[6]!, 0.95);
  const w = world(ps);
  w.norms = { fair: { strength: 0.8, announced: true } };
  run(w, 900);
  return { w, ps };
}
test("G2 a norm that is a custom becomes law by vote of the council, and a theft under it is judged by someone who is no party to it", () => {
  const { w, ps } = lawWorld();
  const g = groupOf(w, "main");
  assert.equal(g.laws.length, 1);
  assert.equal(g.laws[0]!.norm, "fair");
  const thief = ps[0]!, victim = ps[1]!;
  thief.carry.food = 1;
  victim.carry.food = 2;
  const f = witness(w, "theft", thief, victim, "T took food");
  assert.ok(ps[2]!.firsthand?.includes(f.id), "a bystander saw");
  onTheft(w, thief, victim, f.id);
  const c = societyOf(w).cases[0]!;
  assert.equal(c.state, "open");
  run(w, 1200);
  assert.equal(c.state, "ruled");
  assert.equal(c.verdict, "guilty");
  assert.ok(c.judge && c.judge !== thief.id && c.judge !== victim.id);
  assert.match(c.ruling!, /guilty/);
  assert.equal(victim.carry.food, 3, "restitution paid");
  assert.ok(g.laws[0]!.rulings >= 1);
});
test("G2 no law, no case; a starving thief is pardoned, not punished", () => {
  const ps = band(7);
  ps.forEach((p, i) => (p.father = i === 0 ? undefined : `Line${i}`));
  mutual(ps, 0.5);
  const w = world(ps);
  onTheft(w, ps[0]!, ps[1]!);
  assert.equal(societyOf(w).cases.length, 0);
  const { w: w2, ps: q } = lawWorld();
  q[0]!.needs.hunger = 0.95;
  q[0]!.carry.food = 1;
  onTheft(w2, q[0]!, q[1]!);
  run(w2, 1200);
  assert.equal(societyOf(w2).cases[0]!.verdict, "pardoned");
});

test("G3 a rite of passage happens at the age, in the custom of the people, with others present", () => {
  const youth = person("Youth", 0, 0, 3.98);
  const ps = [youth, ...band(3)];
  mutual(ps);
  const w = world(ps);
  run(w, 600);
  assert.ok(!youth.rites?.includes("adulthood"));
  youth.age = 4.01;
  const joy0 = youth.heart?.joys.ritual ?? 0;
  run(w, 600);
  assert.ok(youth.rites?.includes("adulthood"));
  assert.ok((youth.heart?.joys.ritual ?? 0) > joy0);
  assert.ok((w.chronicle ?? []).some((c) => c.text.includes("came of age") && c.text.includes("ochre")));
  const lone = person("Lone", 90, 90, 4.5);
  const w2 = world([lone, person("Far", -90, -90, 20)]);
  run(w2, 600);
  assert.ok(!lone.rites?.includes("adulthood"), "no rite with no one there");
});
test("G3 a wedding and a funeral are kept with meaning; mourners are eased", () => {
  const a = person("A", 0, 0, 20, "m"), b = person("B", 1, 0, 20, "f");
  const ps = [a, b, ...band(3, "Q")];
  mutual(ps);
  const w = world(ps);
  pairUp(w, a, b);
  run(w, 600);
  assert.ok(a.rites?.includes("wedding") && b.rites?.includes("wedding"));
  assert.ok((w.chronicle ?? []).some((c) => c.text.includes("were wed")));
  const mourner = ps[2]!;
  mourner.grief = 0.6;
  kill(w, ps[3]!);
  run(w, 120);
  assert.equal(w.tally?.funerals, 1);
  assert.ok(mourner.grief! < 0.6);
  assert.ok((w.chronicle ?? []).some((c) => c.text.includes("laid to rest")));
  run(w, 120);
  assert.equal(w.tally?.funerals, 1, "held once");
});
test("G3 festivals fall on the calendar: the first day of each season, kept in the evening where the people gather", () => {
  assert.deepEqual(calendar(world([])).map((c) => c.day), [0, 4, 8, 12]);
  const ps = band(5);
  mutual(ps);
  const fire = { id: "f", kind: "campfire", x: 4, z: 0, radius: 1, fuel: 1e9 } as Thing;
  const w = world(ps, [fire], 19 * 60); // day 0 (spring), 19:00
  assert.ok(festivalOn(w));
  societyOf(w);
  const opts: Parameters<typeof societyBias>[2] = [];
  societyBias(ps[0]!, w, opts);
  assert.equal(opts.length, 1, "the evening draws them");
  ps[1]!.needs.thirst = 0.8;
  const o2: typeof opts = [];
  societyBias(ps[1]!, w, o2);
  assert.equal(o2.length, 0, "never against thirst");
  run(w, 300);
  const s = societyOf(w);
  assert.equal(s.festivals.length, 1);
  assert.equal(s.festivals[0]!.name, "the Waking");
  assert.ok(s.festivals[0]!.attended >= 4);
  assert.equal(w.tally?.festivals, 1);
  assert.equal(festivalOn(world(band(3), [], 2 * DAY + 20 * 60)), undefined, "an ordinary day");
});

test("G4 a feud between houses is inherited by those born into them, and a marriage across the line eases it", () => {
  const grand = person("Grand", 0, 0, 40), rival = person("Rival", 5, 0, 30);
  const kid = person("Kid", 1, 0, 5);
  kid.father = "Grand";
  const rivalKid = person("RivalKid", 3, 0, 5);
  rivalKid.father = "Rival";
  const bystander = person("Bystander", 30, 0, 5);
  const w = world([grand, rival, kid, rivalKid, bystander, ...band(3, "Z")]);
  mutual(w.people, 0.5, 0.5);
  onTheft(w, grand, rival); // the grandparent's wrong, long before the child
  onTheft(w, grand, rival);
  assert.equal(houseOf(w, kid), "Grand");
  kill(w, grand);
  kill(w, rival);
  const control0 = bystander.relations.get("RivalKid")!.affinity;
  run(w, 3 * DAY, 300);
  assert.equal(societyOf(w).feuds.length, 1);
  assert.ok(kid.relations.get("RivalKid")!.affinity < bystander.relations.get("RivalKid")!.affinity - 0.03, "the child is cooler to the other house though they never met the wrong");
  assert.ok(bystander.relations.get("RivalKid")!.affinity >= control0 - 1e-9, "others are not");
  assert.ok(kid.relations.get("RivalKid")!.affinity < 0.5);
  const heat0 = societyOf(w).feuds[0]!.heat;
  kid.age = 20;
  rivalKid.age = 20;
  kid.sex = "m";
  rivalKid.sex = "f";
  pairUp(w, kid, rivalKid);
  run(w, 600, 300);
  assert.ok((societyOf(w).feuds[0]?.heat ?? 0) < heat0 - 0.4, "eased by the marriage");
});
test("G4 two houses that marry become allies, and an ally is drawn into a feud", () => {
  const a1 = person("A1", 0, 0, 25, "m"), a2 = person("A2", 1, 0, 22), b1 = person("B1", 3, 0, 25, "f"), b2 = person("B2", 4, 0, 22), c1 = person("C1", 6, 0, 25);
  a2.father = "A1";
  b2.father = "B1";
  const w = world([a1, a2, b1, b2, c1]);
  mutual(w.people);
  pairUp(w, a1, b1);
  run(w, 600, 300);
  const s = societyOf(w);
  assert.equal(s.alliances.length, 1);
  assert.deepEqual([s.alliances[0]!.a, s.alliances[0]!.b].sort(), ["A1", "B1"]);
  onTheft(w, c1, a2);
  const fs = s.feuds.map((f) => [f.a, f.b].sort().join("/"));
  assert.ok(fs.includes("A1/C1") && fs.includes("B1/C1"), `the ally takes up the quarrel: ${fs}`);
});

test("G5 a priest is the most faithful and trusted, and speaks at the feast so that others come to hold the same answer", () => {
  const ps = band(6);
  mutual(ps, 0.5);
  const w = world(ps, [], 19 * 60);
  w.tenets = [{ id: "origin:0", question: "origin", text: "The Creator watches over us.", by: "P1", byName: "P1", t: 0 }, { id: "death:0", question: "death", text: "The dead sleep.", by: "P1", byName: "P1", t: 0 }];
  ps[1]!.faith = { origin: "origin:0", death: "death:0" };
  ps[2]!.faith = { origin: "origin:0" };
  ps[4]!.faith = { origin: "origin:0" };
  for (const q of ps) if (q !== ps[1]) trust(q, ps[1]!, 0.9);
  for (const q of ps) q.x = q === ps[1] ? 0 : 1; // all at the gathering
  run(w, 900);
  assert.equal(groupOf(w, "main").priest, "P1");
  run(w, 2 * 3600);
  assert.ok((w.tally?.sermons ?? 0) >= 1);
  assert.ok((w.tally?.sermonsTaken ?? 0) >= 1, "someone with no answer took the priest's");
});
test("G5 a schism: one question, two answers each held by several, a priest for each side", () => {
  const ps = band(8);
  mutual(ps, 0.5);
  const w = world(ps);
  w.tenets = [{ id: "origin:0", question: "origin", text: "The Creator watches over us.", by: "P0", byName: "P0", t: 0 }, { id: "origin:1", question: "origin", text: "No one made it.", by: "P4", byName: "P4", t: 0 }];
  ps.forEach((p, i) => (p.faith = { origin: i < 4 ? "origin:0" : "origin:1" }));
  run(w, 900);
  const s = societyOf(w);
  assert.equal(s.schisms.length, 1);
  assert.deepEqual([...s.schisms[0]!.sides].sort(), ["origin:0", "origin:1"]);
  const g = groupOf(w, "main");
  assert.ok(g.priest && g.rivalPriest && g.priest !== g.rivalPriest);
  const a = ps[0]!, b = ps[7]!;
  const before = a.relations.get(b.id)!.affinity;
  run(w, DAY, 300);
  assert.ok(a.relations.get(b.id)!.affinity < before, "the sides cool to each other");
  assert.equal(w.tally?.schisms, 1);
});
test("G5 a priest's taboo keeps hands from work on a feast day, but never when hungry", () => {
  const ps = band(6);
  mutual(ps, 0.5);
  const w = world(ps, [], 17 * 60);
  groupOf(w, "main").taboos.push({ what: "work-on-festival", text: "x", by: "P1", since: 0 });
  const mk = (kind: string) => ({ intent: { kind, x: 0, z: 0, speed: 1, remaining: 5 } as never, score: 1 });
  const opts = [mk("forage"), mk("talk")];
  societyBias(ps[0]!, w, opts);
  assert.ok(opts[0]!.score < 1 && opts[1]!.score === 1);
  ps[2]!.needs.hunger = 0.7;
  const o2 = [mk("forage")];
  societyBias(ps[2]!, w, o2);
  assert.equal(o2[0]!.score, 1);
});

test("G6 a group splits over a schism; and two peoples drift apart in customs and words over years", () => {
  const ps = band(10);
  mutual(ps, 0.5);
  const w = world(ps);
  w.tenets = [{ id: "origin:0", question: "origin", text: "A", by: "P0", byName: "P0", t: 0 }, { id: "origin:1", question: "origin", text: "B", by: "P7", byName: "P7", t: 0 }];
  ps.forEach((p, i) => (p.faith = { origin: i < 6 ? "origin:0" : "origin:1" }));
  assert.equal(divergence(w), 0);
  run(w, 8 * DAY, 300);
  const s = societyOf(w);
  assert.ok((w.tally?.splits ?? 0) >= 1, "the group split");
  const camp = Object.values(s.groups).find((g) => g.parent === "main")!;
  assert.ok(camp && camp.camp);
  assert.ok(membersOf(w, camp.id).length >= 3 && membersOf(w, "main").length >= 3);
  assert.ok(membersOf(w, camp.id).every((p) => p.faith?.origin === "origin:1"), "the dissenters are the ones who went");
  const d0 = divergence(w);
  run(w, 4 * YEAR, DAY / 4);
  const d1 = divergence(w);
  assert.ok(d1 >= d0 - 0.2 && d1 > 0.25, `the two peoples now differ in many customs (${d0} -> ${d1})`);
  const solo = world(band(4));
  mutual(solo.people);
  run(solo, YEAR, DAY / 4);
  assert.equal(divergence(solo), 0, "one people has nothing to differ from");
  assert.ok((solo.tally?.drifts ?? 0) > 0, "but its own ways do wander");
});
test("G6 founders carry only a sample of the parent's customs, so a new people can differ from the first day", () => {
  const diffs: number[] = [];
  for (let i = 0; i < 6; i++) {
    const w = world(band(10, `F${i}_`));
    const g = split(w, groupOf(w, "main"), w.people.slice(0, 3), "a test");
    diffs.push(customKeys().filter((k) => g.customs[k] !== groupOf(w, "main").customs[k]).length);
  }
  assert.ok(diffs.some((d) => d > 0), `some founder sample differs (${diffs})`);
  assert.ok(diffs.every((d) => d < customKeys().length), "but not wholly");
});
