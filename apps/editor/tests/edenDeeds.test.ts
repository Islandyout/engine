import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DAY, YEAR } from "../src/eden/earth";
import { DEED_VERB, deedsOf, giving, idealOf, moveCache, selfGap, statusOf, wisdomOf, ambitionOf, biasedDelta } from "../src/eden/deeds";
import { heartOf } from "../src/eden/heart";
import { witness } from "../src/eden/mindmodel";
import { selfOf, selfEvent } from "../src/eden/mindmodel";
import { make, makePerson, step, type Person, type Thing, type World } from "../src/eden/mind";
import { psycheOf } from "../src/eden/psyche";

const mk = (id: string, x = 0, z = 0, age = 10, seed = 1, sex: "m" | "f" = "m") => makePerson(id, x, z, seed, { sociability: 0.6, boldness: 0.6, curiosity: 0.5 }, { name: id, sex, age });
const world = (people: Person[], things: Thing[] = [], clock = DAY / 3 + 6 * 3600 / 60): World => ({
  things: [{ id: "river", kind: "river", x: 0, z: 9, radius: 3 }, ...things],
  people,
  radius: 120,
  clock,
  climate: { meanC: 16, seasonalAmpC: 4, dailyAmpC: 3, rainy: 0.1, seed: 3 },
});
const fond = (a: Person, b: Person, aff = 0.9, trust = 0.7) => a.relations.set(b.id, { affinity: aff, trust, familiarity: 0.9, lastTogether: 0 });
// Neither thirst nor the cold decides these tests: keep them out of the way, the way the long-run tests do.
const comfortable = (...ps: Person[]) => ps.forEach((p) => ((p.needs.thirst = Math.min(p.needs.thirst, 0.1)), (p.cold = 0)));
const feastEvening = () => 16 * DAY * 2 + 4 * DAY + (18 / 24) * DAY; // the first day of a season, six in the evening

// ---- D1 costly friendship ----

test("D1: a hungry friend is given the last of one's own food, though the giver is hungry too, and it is remembered with its reason", () => {
  const a = mk("Ada", 0, 0, 10, 1, "f"), b = mk("Bea", 3, 0, 10, 2, "f");
  fond(a, b);
  fond(b, a);
  a.carry.food = 1;
  b.needs.hunger = 0.85;
  const w = world([a, b]);
  for (let i = 0; i < 400 && !(w.tally?.costlyFriendship); i++) {
    comfortable(a, b);
    a.needs.hunger = Math.max(a.needs.hunger, 0.42); // hungry too
    step(w, 1);
  }
  assert.ok((w.tally?.costlyFriendship ?? 0) >= 1, "gave up their own food for a friend");
  assert.equal(deedsOf(a).costly[b.id], 1);
  assert.ok(a.carry.food < 1, "and has none left: the cost was borne");
  assert.ok(a.journal.some((j) => /last of my food, though I was hungry myself/.test(j.text)));
  assert.ok(b.journal.some((j) => /gave up their own food for me/.test(j.text)));
  assert.ok((b.relations.get(a.id)?.affinity ?? 0) > 0.9 - 0.001 || (b.relations.get(a.id)?.trust ?? 0) > 0.7, "the friend's regard grew");
});

test("D1: a friend who is hurt is sat with, though the helper is tired", () => {
  const a = mk("Ada", 0, 0, 10, 1, "f"), b = mk("Bea", 3, 0, 10, 2, "f");
  fond(a, b);
  fond(b, a);
  b.wound = 0.6;
  const w = world([a, b]);
  for (let i = 0; i < 400 && !(w.tally?.costlyFriendship); i++) {
    comfortable(a, b);
    a.needs.energy = 0.7;
    a.needs.hunger = Math.min(a.needs.hunger, 0.3);
    step(w, 1);
  }
  assert.ok((w.tally?.costlyFriendship ?? 0) >= 1);
  assert.ok(a.journal.some((j) => /sat with Bea though I was tired/.test(j.text)));
});

// ---- D3 music and dance ----

test("D3: on a festival evening people sing and dance; joy comes from ritual, celebration and beauty; the page has words for it", () => {
  const people = [0, 1, 2, 3, 4].map((i) => mk(`P${i}`, i * 2, 0, 10, 10 + i, i % 2 ? "m" : "f"));
  const w = world(people, [], feastEvening());
  const kinds = new Set<string>();
  for (let i = 0; i < 900; i++) {
    comfortable(...people);
    for (const p of people) (p.needs.hunger = Math.min(p.needs.hunger, 0.3)), (p.needs.energy = Math.min(p.needs.energy, 0.4));
    step(w, 1);
    for (const p of people) if (p.intent) kinds.add(p.intent.kind);
  }
  assert.ok(kinds.has("sing") && kinds.has("dance"), `saw ${[...kinds]}`);
  assert.ok((w.tally?.sungAtFeast ?? 0) >= 1 && (w.tally?.dancedAtFeast ?? 0) >= 1);
  const joys = (src: "beauty" | "ritual" | "celebration") => people.reduce((a, p) => a + (heartOf(p).joys[src] ?? 0), 0);
  assert.ok(joys("beauty") > 0 && joys("ritual") > 0 && joys("celebration") > 0);
  assert.ok(people.some((p) => deedsOf(p).songs > 0) && people.some((p) => deedsOf(p).dances > 0));
  assert.ok(people.some((p) => p.journal.some((j) => /at the feast/.test(j.text))));
  assert.match(DEED_VERB.sing!, /sing/);
  assert.match(DEED_VERB.dance!, /danc/);
  assert.match(readFileSync(new URL("../src/editor/app/edenAgents.ts", import.meta.url), "utf8"), /\.\.\.DEED_VERB/);
});

test("D3: an ordinary evening among others has some singing, and nobody sings alone or in the small hours", () => {
  const people = [0, 1, 2].map((i) => mk(`P${i}`, i * 2, 0, 10, 20 + i));
  const w = world(people, [], 16 * DAY * 2 + 1 * DAY + (18 / 24) * DAY); // not a feast day
  for (let i = 0; i < 1200; i++) {
    comfortable(...people);
    for (const p of people) p.needs.hunger = Math.min(p.needs.hunger, 0.3);
    step(w, 1);
  }
  assert.ok((w.tally?.sung ?? 0) + (w.tally?.danced ?? 0) >= 1, "some evening music");
  const alone = mk("Solo", 0, 0, 10, 40);
  const w2 = world([alone], [], feastEvening());
  for (let i = 0; i < 600; i++) (comfortable(alone), step(w2, 1));
  assert.equal((w2.tally?.sung ?? 0) + (w2.tally?.sungAtFeast ?? 0) + (w2.tally?.danced ?? 0) + (w2.tally?.dancedAtFeast ?? 0), 0);
});

// ---- D4 meaning: dying for a purpose, burial with a reason ----

test("D4: a mother whose life is her children holds a killer beast off her child and dies of it; one with no such purpose lives", () => {
  const trial = (purposeKind: "family" | "craft") => {
    const mum = mk("Mum", 0, 0, 10, 1, "f"), kid = mk("Kid", 4, 0, 1, 2);
    kid.mother = mum.id;
    mum.personality = { ...mum.personality, boldness: 1 };
    fond(mum, kid, 0.95);
    mum.emotions = { love: 0.8 };
    heartOf(mum).purpose = { kind: purposeKind, since: 0, strength: 0.9 };
    const wolf: Thing = { id: "wolf1", kind: "wolf", x: 6, z: 0, radius: 1 };
    const w = world([mum, kid], [wolf], DAY / 3 + 3999);
    for (let i = 0; i < 40; i++) {
      comfortable(mum, kid);
      mum.needs.hunger = kid.needs.hunger = 0.1;
      step(w, 1);
    }
    return { w, mum, kid };
  };
  const a = trial("family");
  const dead = a.w.dead?.find((d) => d.person.id === "Mum");
  assert.ok(dead, "she died");
  assert.match(dead!.cause, /saving Kid from the beast/);
  assert.ok(a.w.people.some((p) => p.id === "Kid"), "and the child lived");
  assert.equal(a.w.tally?.diedForPurpose, 1);
  assert.equal(deedsOf(a.mum).diedFor?.purpose, "family");
  assert.ok((a.w.chronicle ?? []).some((c) => /gave their life for Kid/.test(typeof c === "string" ? c : c.text)));
  const b = trial("craft");
  assert.ok(!b.w.dead?.some((d) => d.person.id === "Mum"), "without that purpose she is hurt and lives");
  assert.ok((b.mum.wound ?? 0) > 0 && (b.w.tally?.sacrifices ?? 0) >= 1);
});

test("D4: a grave is sat by and the dead laid to rest with a reason: what they hold true about death, or love", () => {
  const trial = (faithful: boolean) => {
    const mourner = mk("Mo", 5, 0, 10, 1);
    const dead = mk("Gone", 0, 0, 10, 2);
    const w = world([mourner], [], DAY / 3 + 3999);
    w.tenets = [{ id: "t-death", question: "death", text: "The dead sleep beneath the Tree of Life.", by: "x", byName: "X", t: 0 }];
    w.dead = [{ person: dead, t: 0, cause: "old age" }];
    const grave = make(w, "grave", 0, 0, { of: dead.id, radius: 2 });
    mourner.memory.set(grave.id, { x: 0, z: 0, feeling: 0.1, visits: 1, lastSeen: 0 });
    fond(mourner, dead, faithful ? 0.1 : 0.8);
    if (faithful) mourner.faith = { death: "t-death" };
    for (let i = 0; i < 300 && !grave.rite; i++) (comfortable(mourner), (mourner.needs.hunger = 0.2), step(w, 1));
    return { grave, mourner, w };
  };
  const f = trial(true);
  assert.ok(f.grave.rite, "laid to rest");
  assert.match(f.grave.rite!.why, /Tree of Life/);
  assert.equal(f.w.tally?.burialsByFaith, 1);
  assert.ok((f.w.chronicle ?? []).some((c) => /laid Gone to rest.*Tree of Life/.test(typeof c === "string" ? c : c.text)));
  const l = trial(false);
  assert.ok(l.grave.rite && /loved them/.test(l.grave.rite.why));
  assert.equal(l.w.tally?.burialsByLove, 1);
});

// ---- C1 the self: an ideal, and fairness about oneself ----

const scoreOf = (p: Person, kind: string) => p.lastChoice.find((c) => c.kind === kind)?.score;
/** Steps the world; after `from` seconds, returns the score of the kind each time the person chooses (its mean), if it was ever on offer. */
const firstScore = (w: World, p: Person, kind: string, keep: () => void, max = 200, from = 0): number | undefined => {
  let last = p.lastChoice;
  const seen: number[] = [];
  for (let i = 0; i < max && seen.length < 3; i++) {
    keep();
    step(w, 1);
    if (p.lastChoice !== last) {
      last = p.lastChoice;
      const s = scoreOf(p, kind);
      if (s !== undefined && i >= from) seen.push(s);
    }
  }
  return seen.length ? seen.reduce((x, y) => x + y, 0) / seen.length : undefined;
};

test("C1: a person measures themselves against who they want to be; the shortfall is felt, named, and steers what they do next", () => {
  const twins = [0, 1].map((i) => {
    const p = mk(i ? "Twin" : "Lack", 0, 0, 10, 7);
    const n = mk(i ? "NeedyB" : "NeedyA", 3, 0, 10, 8 + i);
    fond(p, n, 0.5, 0.5);
    p.carry.food = 6;
    n.needs.hunger = 0.8;
    const ideal = idealOf(p);
    selfOf(p).image.kind = i ? ideal.kind : 0.05; // one falls far short of the kind person they want to be
    return { p, n, w: world([p, n]) };
  });
  const [lack, ok] = twins as [(typeof twins)[0], (typeof twins)[0]];
  assert.ok(selfGap(lack.p).gap > selfGap(ok.p).gap);
  assert.equal(selfGap(lack.p).lack, "kind");
  const scores = twins.map((t) => firstScore(t.w, t.p, "share", () => (comfortable(t.p, t.n), (t.p.needs.hunger = 0.2), (t.n.needs.hunger = 0.8), (t.n.carry.food = 0), (t.p.carry.food = 6)), 400, 35));
  for (const t of twins) for (let i = 0; i < 40; i++) (comfortable(t.p, t.n), (t.p.needs.hunger = 0.2), (t.n.needs.hunger = 0.8), step(t.w, 1));
  assert.ok(lack.p.journal.some((j) => /I am not who I want to be. I want to be kind/.test(j.text)), "named in their own words");
  assert.ok((lack.p.emotions?.shame ?? 0) > (ok.p.emotions?.shame ?? 0), "and felt");
  assert.ok(!ok.p.journal.some((j) => /I want to be kind/.test(j.text)), "the one who is already kind has no such complaint");
  const [a, b] = scores;
  assert.ok(a !== undefined && b !== undefined && a > b + 0.1, `the shortfall tilts them toward kindness: ${a} vs ${b}`);
  // Acting on it closes the gap.
  for (let i = 0; i < 400; i++) (comfortable(lack.p, lack.n), (lack.p.needs.hunger = 0.2), (lack.n.needs.hunger = 0.8), (lack.n.carry.food = 0), (lack.p.carry.food = 6), step(lack.w, 1));
  assert.ok(selfOf(lack.p).image.kind > 0.05 + 0.05, "kind acts made them more the person they meant to be");
});

test("C1: a failure lowers esteem and opens a gap with the capable person they meant to be, which tilts later choices toward making things", () => {
  const p = mk("Fail", 0, 0, 10, 3);
  for (const t of Object.keys(idealOf(p)) as (keyof ReturnType<typeof idealOf>)[]) selfOf(p).image[t] = idealOf(p)[t]; // satisfied
  const e0 = selfOf(p).esteem;
  assert.equal(selfGap(p).lack, undefined);
  for (let i = 0; i < 4; i++) selfEvent(p, -0.15, "capable");
  assert.ok(selfOf(p).esteem < e0 - 0.2, "esteem fell");
  assert.equal(selfGap(p).lack, "capable");
  const w = world([p], [{ id: "grove", kind: "grove", x: 6, z: 0, radius: 3, stock: 8, maxStock: 8 }]);
  p.memory.set("grove", { x: 6, z: 0, feeling: 0.2, visits: 1, lastSeen: 0 });
  for (let i = 0; i < 70; i++) (comfortable(p), step(w, 1));
  assert.equal(deedsOf(p).lack, "capable");
  assert.ok(p.journal.some((j) => /I want to be capable/.test(j.text)));
});

test("C1: fairness about oneself: someone who gives and gives and gets nothing feels it is not fair, and gives less to those who are not their own", () => {
  const mkTwin = (gave: number) => {
    const p = mk("Giver", 0, 0, 10, 5), n = mk("Needy", 3, 0, 10, 6);
    p.values = { kin: 0.5, fairness: 1, freedom: 0.5, tradition: 0.5, comfort: 0.5 } as Person["values"];
    const others = [0, 1, 2].map((i) => mk(`O${i}`, 5 + i, 4, 10, 30 + i));
    for (const o of others) (o.relations.set(p.id, { affinity: 0.5, trust: 0.5, familiarity: 0.5, lastTogether: 0, gifts: gave }), fond(p, o, 0.3, 0.5));
    fond(p, n, 0.3, 0.5);
    p.carry.food = 6;
    n.needs.hunger = 0.8;
    return { p, n, w: world([p, n, ...others]) };
  };
  const unfair = mkTwin(9), fair = mkTwin(0);
  assert.ok(giving(unfair.w, unfair.p).given > 20 && giving(fair.w, fair.p).given === 0);
  const sc = [unfair, fair].map((t) => firstScore(t.w, t.p, "share", () => (comfortable(t.p, t.n), (t.p.needs.hunger = 0.2), (t.n.needs.hunger = 0.8), (t.n.carry.food = 0), (t.p.carry.food = 6)), 400, 70));
  for (const t of [unfair, fair]) for (let i = 0; i < 80; i++) (comfortable(t.p, t.n), (t.p.needs.hunger = 0.2), (t.n.needs.hunger = 0.8), step(t.w, 1));
  assert.ok(deedsOf(unfair.p).owed > 0.3 && deedsOf(fair.p).owed < 0.05);
  assert.ok(unfair.p.journal.some((j) => /It is not fair to me/.test(j.text)));
  assert.equal(fair.p.journal.filter((j) => /not fair to me/.test(j.text)).length, 0);
  assert.ok((unfair.w.tally?.selfFairness ?? 0) >= 1);
  const [a, b] = sc;
  assert.ok(b !== undefined && (a === undefined || a < b - 0.3), `${a} vs ${b}`);
});

// ---- C2 false belief and deception ----

test("C2 (Sally-Anne): a store is moved while someone is away; they walk to where it was, not where it is; the one who saw it goes to the new place", () => {
  const A = mk("Anne", -20, 30, 10, 1, "f"), B = mk("Sally", 60, 0, 10, 2, "f"), C = mk("Cory", -18, 28, 10, 3);
  const cache = make(world([]), "cache", 20, 0, { owner: A.id, stock: 3, radius: 2 }); // id from a scratch world
  const w = world([A, B, C], [cache]);
  for (const p of [A, B, C]) p.memory.set(cache.id, { x: 20, z: 0, feeling: 0.3, visits: 1, lastSeen: 0 });
  const moved = moveCache(w, A, cache, { x: -20, z: 30 });
  assert.deepEqual([cache.x, cache.z], [-20, 30]);
  assert.ok(moved.fooled.includes(B.id) && !moved.fooled.includes(C.id), "Sally still thinks it is at the old place; Cory was standing right there and saw it go");
  assert.equal(C.memory.get(cache.id)!.x, -20);
  for (const p of [B, C]) p.needs.hunger = 0.85;
  let toOld: { x: number; z: number } | undefined, toNew: { x: number; z: number } | undefined;
  for (let i = 0; i < 6; i++) {
    for (const p of [A, B, C]) p.needs.thirst = 0.1;
    A.needs.hunger = 0.1;
    step(w, 1);
    if (B.intent?.kind === "eat" && B.intent.targetId === cache.id) toOld = { x: B.intent.x, z: B.intent.z };
    if (C.intent?.kind === "eat" && C.intent.targetId === cache.id) toNew = { x: C.intent.x, z: C.intent.z };
  }
  assert.ok(toOld && Math.hypot(toOld.x - 20, toOld.z) < 1, `Sally went to the old place: ${JSON.stringify(toOld)}`);
  assert.ok(toNew && Math.hypot(toNew.x + 20, toNew.z - 30) < 1, `Cory went to the new one: ${JSON.stringify(toNew)}`);
  for (let i = 0; i < 80 && !(w.tally?.falseBeliefActed); i++) {
    B.needs.thirst = 0.1;
    A.needs.hunger = 0.1;
    step(w, 1);
  }
  assert.ok((w.tally?.falseBeliefActed ?? 0) >= 1, "she acted on a belief that was false and found it so");
  assert.ok(B.journal.some((j) => /not where I left it/.test(j.text)));
  assert.ok(A.journal.some((j) => /Sally still thinks it is where it was/.test(j.text)), "and Anne knew what Sally would believe");
});

test("C2: deception exploits it: someone robbed before moves their store when the thief is away, knowing the thief will look in the old place", () => {
  const A = mk("Owner", 0, 0, 10, 1), T = mk("Thief", 70, 0, 10, 2, "f");
  A.thefts = 0;
  T.thefts = 2;
  const cache = make(world([]), "cache", 4, 0, { owner: A.id, stock: 3, radius: 2 });
  const w = world([A, T], [cache]);
  for (const p of [A, T]) p.memory.set(cache.id, { x: 4, z: 0, feeling: 0.3, visits: 1, lastSeen: 0 });
  A.relations.set(T.id, { affinity: -0.5, trust: 0.1, familiarity: 0.8, lastTogether: 0 });
  T.relations.set(A.id, { affinity: 0.1, trust: 0.5, familiarity: 0.8, lastTogether: 0 });
  witness(w, "theft", T, A, "Thief took food from Owner"); // Owner was there
  T.memory.set(cache.id, { x: 4, z: 0, feeling: 0.3, visits: 1, lastSeen: 0 });
  T.needs.hunger = 0.9;
  let seen: { x: number; z: number } | undefined;
  for (let i = 0; i < 200 && !(w.tally?.falseBeliefActed); i++) {
    A.needs.hunger = 0.1;
    A.needs.thirst = 0.1;
    T.needs.thirst = 0.1;
    step(w, 1);
    if (!seen && T.intent?.targetId === cache.id) seen = { x: T.intent.x, z: T.intent.z };
  }
  assert.ok((w.tally?.deceptions ?? 0) >= 1, "Owner hid it");
  assert.ok(Math.hypot(cache.x - 4, cache.z) > 10, "somewhere else");
  assert.ok(A.journal.some((j) => /Thief still thinks it is where it was/.test(j.text)));
  assert.ok((w.tally?.falseBeliefActed ?? 0) >= 1, "and the thief went to the old place and found nothing");
  assert.ok(T.journal.some((j) => /not where I left it/.test(j.text)));
  assert.ok((T.relations.get(A.id)?.trust ?? 1) < 0.5, "and suspects who did it");
  void seen;
});

// ---- C3 / C6 and A6: judging in the daily choice, and the biases ----

test("C3/C6: the same wrong is judged by who did it: a friend is fed, a foe is not, each with the stated reason", () => {
  const J = mk("Judge", 0, 0, 10, 1), F = mk("Friend", 3, 0, 10, 2), E = mk("Foe", -3, 0, 10, 3), V = mk("Victim", 6, 0, 10, 4);
  fond(J, F, 0.9, 0.7);
  J.relations.set(E.id, { affinity: -0.6, trust: 0.1, familiarity: 0.9, lastTogether: 0 });
  J.carry.food = 1;
  F.needs.hunger = E.needs.hunger = 0.8;
  const w = world([J, F, E, V]);
  witness(w, "theft", F, V, "Friend took food from Victim");
  witness(w, "theft", F, V, "Friend took food from Victim again");
  witness(w, "theft", E, V, "Foe took food from Victim");
  assert.ok(J.knows!.length >= 3, "the judge knows of all of it");
  for (let i = 0; i < 120 && F.carry.food < 1; i++) {
    for (const p of [J, F, E, V]) p.needs.thirst = 0.1;
    J.needs.hunger = 0.2;
    F.needs.hunger = E.needs.hunger = 0.8;
    V.needs.hunger = 0.2;
    step(w, 1);
  }
  const d = deedsOf(J);
  assert.ok(F.carry.food >= 1 && E.carry.food < 1, `fed the friend (${F.carry.food}), not the foe (${E.carry.food})`);
  assert.match(d.forgave[F.id] ?? "", /Friend is my friend and must have had a reason/);
  assert.match(d.withheld[E.id] ?? "", /just like Foe/);
  assert.ok(J.journal.some((j) => /I will not feed Foe: it is just like Foe/.test(j.text)));
  assert.ok(J.journal.some((j) => /Friend did wrong, but .*my friend.*I will help them anyway/.test(j.text)));
  assert.ok((w.tally?.forgiven ?? 0) >= 1 && (w.tally?.helpWithheld ?? 0) >= 1);
});

test("A6/C6: bias: a friend's faults are not counted but a foe's are; one's own people are fed before strangers", () => {
  // Two hungry strangers of equal standing with the judge; one of another people. Only one meal.
  const J = mk("Judge", 0, 0, 10, 1), mine = mk("Mine", 3, 0, 10, 2), other = mk("Other", -3, 0, 10, 3);
  other.group = "far";
  J.relations.set(mine.id, { affinity: 0.3, trust: 0.4, familiarity: 0.5, lastTogether: 0 });
  J.relations.set(other.id, { affinity: 0.3, trust: 0.4, familiarity: 0.5, lastTogether: 0 });
  J.carry.food = 1;
  mine.needs.hunger = other.needs.hunger = 0.8;
  const w = world([J, mine, other]);
  for (let i = 0; i < 100 && mine.carry.food + other.carry.food < 1; i++) {
    for (const p of [J, mine, other]) p.needs.thirst = 0.1;
    J.needs.hunger = 0.2;
    mine.needs.hunger = other.needs.hunger = 0.8;
    step(w, 1);
  }
  assert.ok(mine.carry.food >= 1 && other.carry.food < 1, "their own people first");
  // The bias on how regard changes: bad weighs more than good; a friend's kindness lands warmer than a stranger's.
  const x = mk("X", 0, 0), same = mk("Same"), far = mk("Far");
  far.group = "far";
  const w2 = world([x, same, far]);
  assert.ok(Math.abs(biasedDelta(w2, x, far, -0.1)) > biasedDelta(w2, x, far, 0.1), "negativity");
  assert.ok(biasedDelta(w2, x, same, 0.1) > biasedDelta(w2, x, far, 0.1), "in-group");
  assert.ok(Math.abs(biasedDelta(w2, x, far, -0.1)) > Math.abs(biasedDelta(w2, x, same, -0.1)), "out-group slights weigh more");
  x.relations.set(same.id, { affinity: 0.8, trust: 0.8, familiarity: 0.8, lastTogether: 0 });
  x.relations.set(far.id, { affinity: 0.0, trust: 0.5, familiarity: 0.8, lastTogether: 0 });
  assert.ok(Math.abs(biasedDelta(w2, x, same, -0.1)) < Math.abs(biasedDelta(w2, x, mk("Z"), -0.1)), "confirmation: a friend's slip is half taken in");
});

// ---- C5 habit addiction ----

test("C5: a habit done for its reward, many times, becomes a craving: it is chosen against tiredness, its absence aches, and it can be broken", () => {
  const mkP = (id: string) => {
    const p = mk(id, 0, 0, 10, 9);
    return { p, w: world([p], [{ id: "meadow", kind: "meadow", x: 5, z: 0, radius: 3 }]) };
  };
  const hooked = mkP("Hooked"), clean = mkP("Clean");
  for (const t of [hooked, clean]) t.p.memory.set("meadow", { x: 5, z: 0, feeling: 0.2, visits: 1, lastSeen: 0 });
  const ps = psycheOf(hooked.p);
  ps.habits["play@day"] = { n: 45, auto: true, last: hooked.w.clock! };
  ps.sens.dopamine = 0.5;
  for (const t of [hooked, clean]) for (let i = 0; i < 40; i++) (comfortable(t.p), (t.p.needs.hunger = 0.2), (t.p.needs.energy = 0.9), step(t.w, 1));
  const d = deedsOf(hooked.p);
  assert.equal(d.addiction?.kind, "play");
  assert.ok(hooked.p.journal.some((j) => /cannot seem to do without my games/.test(j.text)));
  assert.equal(deedsOf(clean.p).addiction, undefined);
  assert.ok((hooked.w.tally?.addictions ?? 0) === 1);
  const a = scoreOf(hooked.p, "play"), b = scoreOf(clean.p, "play");
  assert.ok(a !== undefined && (b === undefined || a > b + 0.3), `chosen even when worn out: ${a} vs ${b}`);
  // Withdrawal after going without.
  const long = hooked.w.clock! + DAY;
  hooked.w.clock = long;
  const c0 = hooked.p.emotions?.longing ?? 0;
  for (let i = 0; i < 60; i++) {
    comfortable(hooked.p);
    hooked.p.intent = { kind: "linger", x: 0, z: 0, speed: 0, remaining: 5, arrived: true };
    hooked.p.needs.hunger = 0.2;
    step(hooked.w, 1);
  }
  assert.equal(d.addiction?.withdrawing, true);
  assert.ok((hooked.p.emotions?.longing ?? 0) > c0);
  assert.ok(hooked.p.journal.some((j) => /I ache for my games/.test(j.text)));
  // Three days without and a steady will: it is broken.
  hooked.w.clock = long + 4 * DAY;
  selfOf(hooked.p).control = 0.9;
  for (let i = 0; i < 40; i++) (comfortable(hooked.p), (hooked.p.intent = { kind: "linger", x: 0, z: 0, speed: 0, remaining: 5, arrived: true }), step(hooked.w, 1));
  assert.equal(d.addiction, undefined);
  assert.ok((hooked.w.tally?.addictionsBroken ?? 0) === 1);
});
