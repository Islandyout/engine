import test from "node:test";
import assert from "node:assert/strict";
import { DAY } from "../src/eden/earth";
import { accuse, condemn, contextKey, deriveLessons, hypocrisy, judge, lessonBias, modelOf, rationalise, recordOutcome, resolveConflict, selfEvent, selfOf, sawFact, snapshot, talkAbout, thinksKnows, tell, witness, witnessCost, knowsFact } from "../src/eden/mindmodel";
import { makePerson, type Intent, type Person, type World } from "../src/eden/mind";

const person = (id: string, seed = 1, x = 0, z = 0, age = 6) => makePerson(id, x, z, seed, { sociability: 0.6, boldness: 0.5, curiosity: 0.5 }, { name: id, sex: "m", age });
const world = (people: Person[]): World => ({ things: [], people, radius: 80, clock: DAY / 3, climate: { meanC: 16, seasonalAmpC: 4, dailyAmpC: 3, rainy: 0.1, seed: 3 } });
const opt = (kind: Intent["kind"], score: number) => ({ intent: { kind, x: 0, z: 0, speed: 1, remaining: 5 } as Omit<Intent, "arrived">, score }) as { intent: Omit<Intent, "arrived">; score: number; reason?: string };

test("a deed is known first-hand only to those near; the doer knows who saw", () => {
  const thief = person("T", 1, 0, 0), victim = person("V", 2, 2, 0), near = person("N", 3, 6, 0), far = person("F", 4, 60, 0);
  const w = world([thief, victim, near, far]);
  const f = witness(w, "theft", thief, victim, "T took food");
  assert.ok(sawFact(near, f.id) && sawFact(victim, f.id));
  assert.ok(!knowsFact(far, f.id));
  assert.ok(thinksKnows(thief, near.id, f.id), "the thief reckons the neighbour saw");
  assert.ok(!thinksKnows(thief, far.id, f.id), "and does not think the far one did (they are right)");
  tell(w, near, far, f);
  assert.ok(knowsFact(far, f.id) && !sawFact(far, f.id), "told, not seen");
  assert.ok(thinksKnows(near, far.id, f.id));
});

test("a lie to someone who saw it fails; to someone who only heard it may work, or not", () => {
  const seen = { detected: 0 };
  for (let s = 1; s <= 20; s++) {
    const a = person("A", s), b = person("B", s + 100, 1, 0);
    b.values = { ...(b.values as any), fairness: 0 };
    const w = world([a, b]);
    const f = witness(w, "theft", b, a, "B took food");
    accuse(w, a, b, f);
    if ((w.tally?.liesDetected ?? 0) > 0) seen.detected++;
  }
  assert.equal(seen.detected, 20, "an eyewitness is never fooled");
  let fooled = 0, doubted = 0;
  for (let s = 1; s <= 60; s++) {
    const a = person("A", s), b = person("B", s + 100, 1, 0), c = person("C", s + 200, 3, 0);
    b.values = { ...(b.values as any), fairness: 0 };
    const w = world([a, b, c]);
    a.x = 60;
    const f = witness(w, "theft", b, c, "B took food");
    tell(w, c, a, f);
    accuse(w, a, b, f);
    fooled += w.tally?.foolings ?? 0;
    doubted += w.tally?.liesDisbelieved ?? 0;
  }
  assert.ok(fooled > 0 && doubted > 0, `hearsay can be talked away (${fooled}) or not (${doubted})`);
});

test("an honest person with a guilty conscience owns up; the accuser forgives part of it", () => {
  const a = person("A", 1), b = person("B", 2, 1, 0);
  b.values = { ...(b.values as any), fairness: 1, tradition: 1 };
  b.emotions = { guilt: 0.6 };
  const w = world([a, b]);
  const f = witness(w, "theft", b, a, "B took food");
  const before = a.relations.get(b.id)?.trust ?? 0.3;
  accuse(w, a, b, f);
  assert.equal(w.tally?.confessions, 1);
  assert.ok((a.relations.get(b.id)?.trust ?? 0) >= before);
});

test("two near-equal pulls (duty vs desire) are felt as being torn, then settled with a stated reason", () => {
  const p = person("P", 1);
  const w = world([p]);
  const first = [opt("share", 0.9), opt("rest", 0.85)];
  resolveConflict(p, w, first);
  assert.equal(first.length, 1);
  assert.equal(first[0]!.intent.kind, "linger");
  assert.ok(p.dither && p.journal.some((j) => /Torn between/.test(j.text)));
  w.clock = (w.clock ?? 0) + 20;
  p.dither = { ...p.dither!, until: 0 };
  const second = [opt("share", 0.9), opt("rest", 0.85)];
  resolveConflict(p, w, second);
  const top = [...second].sort((a, b) => b.score - a.score)[0]!;
  assert.ok(top.reason, "the settled choice carries its reason");
  assert.ok(p.journal.some((j) => /I chose/.test(j.text)));
});

test("starvation does not hesitate", () => {
  const p = person("P", 1);
  const o = [opt("eat", 2), opt("rest", 1.95)];
  resolveConflict(p, world([p]), o);
  assert.equal(o.length, 2);
  assert.ok(!p.dither);
});

test("failures lower esteem more than wins raise it; and what goes badly in a setting is learned and avoided", () => {
  const p = person("P", 1);
  const e0 = selfOf(p).esteem;
  selfEvent(p, -0.1, "capable");
  const down = e0 - selfOf(p).esteem;
  const e1 = selfOf(p).esteem;
  selfEvent(p, 0.1, "capable");
  assert.ok(down > 0 && selfOf(p).esteem - e1 > 0);
  const w = world([p]);
  assert.equal(lessonBias(p, w, "fish"), 0, "nothing learned yet");
  for (let i = 0; i < 8; i++) {
    const snap = snapshot(p);
    p.health -= 0.05;
    p.mood -= 0.2;
    recordOutcome(p, w, { kind: "fish", x: 0, z: 0, speed: 1, remaining: 0, arrived: true, snap });
  }
  deriveLessons(p, w);
  assert.ok(selfOf(p).lessons.some((l) => l.key === contextKey("fish", w) && l.sign === -1));
  assert.ok(lessonBias(p, w, "fish") < 0, "and it now tilts the choice");
  assert.ok(p.journal.some((j) => /I have noticed/.test(j.text)));
});

test("the same act is judged lightly in kin and friends, harshly in foes and strangers, each with a reason", () => {
  const me = person("Me", 1), mum = person("Mum", 2), friend = person("Fr", 3), foe = person("Foe", 4), stranger = person("St", 5);
  me.mother = mum.id;
  const w = world([me, mum, friend, foe, stranger]);
  me.relations.set(friend.id, { affinity: 0.9, trust: 0.8, familiarity: 0.8, lastTogether: 0 });
  me.relations.set(foe.id, { affinity: -0.6, trust: 0.1, familiarity: 0.8, lastTogether: 0 });
  const j = (o: Person) => judge(w, me, o, "theft");
  assert.ok(j(mum).weight < j(friend).weight && j(friend).weight < j(foe).weight && j(foe).weight < j(stranger).weight + 0.3);
  assert.notEqual(j(mum).reason, j(foe).reason);
  assert.ok(judge(w, me, me, "theft").weight < 0.5, "and lightest on oneself");
});

test("blaming a deed and then doing it is hypocrisy: shame and a lower opinion of oneself", () => {
  const p = person("P", 1);
  const w = world([p]);
  assert.equal(hypocrisy(p, w, "theft"), false);
  condemn(p, "theft");
  const e = selfOf(p).esteem;
  assert.equal(hypocrisy(p, w, "theft"), true);
  assert.ok((p.emotions?.shame ?? 0) > 0.3 && selfOf(p).esteem < e);
});

test("guilt is explained away more by those with a looser conscience", () => {
  const lax = person("Lax", 1), strict = person("Strict", 2);
  lax.values = { ...(lax.values as any), fairness: 0 };
  strict.values = { ...(strict.values as any), fairness: 1 };
  for (const p of [lax, strict]) p.emotions = { guilt: 0.8 };
  rationalise(lax, world([lax]));
  rationalise(strict, world([strict]));
  assert.ok((lax.emotions?.guilt ?? 0) < (strict.emotions?.guilt ?? 0));
  assert.ok(lax.journal.some((j) => /I told myself/.test(j.text)));
});

test("a secret is kept from the untrusted; one told in trust may leak", () => {
  let told = 0, leaked = 0;
  for (let s = 1; s <= 60; s++) {
    const a = person("A", s), b = person("B", s + 100, 1, 0), c = person("C", s + 200, 2, 0);
    const w = world([a, b, c]);
    a.relations.set(b.id, { affinity: 0.9, trust: 0.9, familiarity: 0.9, lastTogether: 0 });
    b.relations.set(a.id, { affinity: 0.9, trust: 0.9, familiarity: 0.9, lastTogether: 0 });
    b.relations.set(c.id, { affinity: 0.5, trust: 0.9, familiarity: 0.9, lastTogether: 0 });
    const f = witness(w, "secret", a, undefined, "A hid a thing", true);
    for (let i = 0; i < 30; i++) talkAbout(w, a, b);
    if (knowsFact(b, f.id)) told++;
    for (let i = 0; i < 30; i++) talkAbout(w, b, c);
    leaked += w.tally?.secretsLeaked ?? 0;
  }
  assert.ok(told > 40, "told to the one they trust");
  assert.ok(leaked > 0, "and some pass it on");
});

test("whoever fears for their name waits for fewer eyes", () => {
  const p = person("P", 1);
  const alone = world([p]);
  const crowd = world([p, person("A", 2, 3, 0), person("B", 3, 4, 0), person("C", 4, 5, 0)]);
  assert.ok(witnessCost(crowd, p) > witnessCost(alone, p));
});

test("danger or real need ends a hesitation at once", () => {
  const p = person("P", 1);
  const w = world([p]);
  p.dither = { until: (w.clock ?? 0) + 50, a: "share", b: "rest" };
  const o = [opt("flee", 2.5), opt("rest", 0.5)];
  resolveConflict(p, w, o);
  assert.ok(!p.dither);
  assert.equal(o.length, 2);
});

test("someone with a loose conscience flatters a giver to get food, and a wary giver can see through it", () => {
  let flattered = 0, seenThrough = 0;
  for (let s = 1; s <= 80; s++) {
    const want = person("W", s), give = person("G", s + 100, 1, 0);
    want.values = { ...(want.values as any), fairness: 0 };
    want.needs.hunger = 0.9;
    give.carry.food = 4;
    want.carry.food = 0;
    give.relations.set(want.id, { affinity: 0.2, trust: 0.2, familiarity: 0.3, lastTogether: 0 });
    const w = world([want, give]);
    for (let i = 0; i < 6; i++) talkAbout(w, want, give);
    flattered += w.tally?.flattery ?? 0;
    seenThrough += w.tally?.flatterySeenThrough ?? 0;
  }
  assert.ok(flattered > 0 && seenThrough > 0 && seenThrough < flattered);
});

test("an honest person asks in terms of what the giver lacks, without a lie", () => {
  let n = 0;
  for (let s = 1; s <= 60; s++) {
    const want = person("W", s), give = person("G", s + 100, 1, 0);
    want.values = { ...(want.values as any), fairness: 1, tradition: 1 };
    want.needs.hunger = 0.9;
    give.carry.food = 4;
    give.psyche = undefined;
    psycheOfLow(give);
    const w = world([want, give]);
    for (let i = 0; i < 6; i++) talkAbout(w, want, give);
    n += w.tally?.persuasions ?? 0;
    assert.equal(w.tally?.flattery ?? 0, 0);
  }
  assert.ok(n > 0);
});

test("a weak bold person bluffs when accused; the timid back down sometimes", () => {
  let bluffs = 0, worked = 0;
  for (let s = 1; s <= 120; s++) {
    const a = person("A", s, 0, 0), b = person("B", s + 100, 1, 0);
    a.personality = { ...a.personality, boldness: 0.2 };
    b.personality = { ...b.personality, boldness: 0.9 };
    a.skills = { forage: 0.9, fish: 0.9, hunt: 0.9, farm: 0.9, build: 0.9, heal: 0.9 } as any;
    b.skills = { forage: 0, fish: 0, hunt: 0, farm: 0, build: 0, heal: 0 } as any;
    b.values = { ...(b.values as any), fairness: 0 };
    const w = world([a, b]);
    a.x = 60;
    const f = witness(w, "theft", b, undefined, "B took food");
    tell(w, b, a, f);
    accuse(w, a, b, f);
    bluffs += w.tally?.bluffs ?? 0;
    worked += w.tally?.bluffsWorked ?? 0;
  }
  assert.ok(bluffs > 0 && worked > 0 && worked < bluffs);
});

test("a gift nobody saw coming delights more than one they were told of", () => {
  const g = person("G", 1), r = person("R", 2, 1, 0), r2 = person("R2", 3, 1, 0);
  const w = world([g, r, r2]);
  assert.equal(surpriseGift(w, g, r), true);
  assert.ok((r.emotions?.surprise ?? 0) > 0.3);
  (r2.knows ??= []).push(`keepsake:${g.id}`);
  assert.equal(surpriseGift(w, g, r2), false);
});

test("a person at the end of their tether sometimes does nothing, and says so", () => {
  let skipped = 0;
  for (let s = 1; s <= 200; s++) {
    const p = person("P", s);
    psycheOfLow(p);
    p.psyche!.state = "depressed";
    selfOf(p).esteem = 0.1;
    const o = [opt("hunt", 1), opt("share", 0.9), opt("rest", 0.5)];
    resolveConflict(p, world([p]), o);
    if (p.journal.some((j) => /did not even try/.test(j.text))) skipped++;
  }
  assert.ok(skipped > 5 && skipped < 60);
});

import { psycheOf } from "../src/eden/psyche";
import { surpriseGift } from "../src/eden/mindmodel";
function psycheOfLow(p: Person) {
  const ps = psycheOf(p);
  ps.drives.belonging = 0.1;
  ps.drives.esteem = 0.1;
  ps.drives.meaning = 0.1;
}
