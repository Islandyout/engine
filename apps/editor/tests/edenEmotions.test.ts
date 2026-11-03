import test from "node:test";
import assert from "node:assert/strict";
import { DAY } from "../src/eden/earth";
import { EMOTIONS, type Emotion } from "../src/eden/inner";
import { afterDeath, pairUp } from "../src/eden/lifecycle";
import { betray, learnOfBetrayal, heartOf } from "../src/eden/heart";
import { hypocrisy, condemn, witness } from "../src/eden/mindmodel";
import { psycheEvent, psycheOf } from "../src/eden/psyche";
import { makePerson, step, type Person, type Thing, type World } from "../src/eden/mind";

// One test per emotion (A5): each has a named trigger, run through the real step() where the trigger is something the world does, and through
// the function that raises it where the trigger is a moment (a betrayal, a hypocrisy) that step() reaches only by chance.
const mk = (id: string, x = 0, z = 0, seed = 1, sex: "m" | "f" = "m") => makePerson(id, x, z, seed, { sociability: 0.6, boldness: 0.5, curiosity: 0.5 }, { name: id, sex, age: 10 });
const world = (people: Person[], things: Thing[] = [], clock = 840): World => ({
  things: [{ id: "river", kind: "river", x: 0, z: 9, radius: 3 }, ...things],
  people,
  radius: 120,
  clock,
  climate: { meanC: 16, seasonalAmpC: 4, dailyAmpC: 3, rainy: 0.1, seed: 3 },
});
const ok = (...ps: Person[]) => ps.forEach((p) => ((p.needs.thirst = Math.min(p.needs.thirst, 0.1)), (p.cold = 0)));
/** Steps the world and returns the highest the emotion reached in the person. */
const peak = (w: World, p: Person, e: Emotion, n: number, each: () => void = () => {}) => {
  let top = 0;
  const at = w.people.map((q) => [q, q.x, q.z] as const); // they stay where they were put
  for (let i = 0; i < n; i++) {
    ok(...w.people);
    each();
    step(w, 1);
    for (const [q, x, z] of at) (q.x = x), (q.z = z);
    top = Math.max(top, p.emotions?.[e] ?? 0);
  }
  return top;
};
const fond = (a: Person, b: Person, aff = 0.9, trust = 0.7) => a.relations.set(b.id, { affinity: aff, trust, familiarity: 0.9, lastTogether: 0 });
const grove = (x = 6): Thing => ({ id: "grove", kind: "grove", x, z: 0, radius: 3, stock: 8, maxStock: 8 });
const know = (p: Person, t: Thing) => p.memory.set(t.id, { x: t.x, z: t.z, feeling: 0.2, visits: 1, lastSeen: 0 });

test("the list is the 24 emotions this file covers", () => {
  assert.equal(EMOTIONS.length, 24);
});

test("joy: a hungry person who eats feels it", () => {
  const p = mk("P"), g = grove();
  const w = world([p], [g]);
  know(p, g);
  p.needs.hunger = 0.85;
  assert.ok(peak(w, p, "joy", 120, () => (p.needs.hunger = Math.max(p.needs.hunger, p.needs.hunger))) > 0.02);
});
test("fear: a wolf close by", () => {
  const p = mk("P");
  const w = world([p], [{ id: "wolf", kind: "wolf", x: 7, z: 0, radius: 1 }]);
  assert.ok(peak(w, p, "fear", 6) > 0.1);
});
test("anger: the last of the food taken in front of someone hungry", () => {
  const a = mk("A", 6, 0, 1), b = mk("B", 14, 0, 2), g = { ...grove(6), stock: 1, maxStock: 1 };
  const w = world([a, b], [g]);
  w.things = [g]; // no river to fish from: the grove is the only food
  know(a, g);
  a.needs.hunger = 0.9;
  b.needs.hunger = 0.8;
  assert.ok(peak(w, b, "anger", 120, () => ((b.needs.hunger = 0.8), (b.intent = { kind: "linger", x: b.x, z: b.z, speed: 0, remaining: 5, arrived: true }))) > 0.05);
});
test("gratitude and pride: a friend gives the last of their food (the one fed is grateful, the giver proud)", () => {
  const a = mk("A", 0, 0, 1), b = mk("B", 3, 0, 2);
  fond(a, b);
  a.carry.food = 2;
  const w = world([a, b]);
  let gr = 0, pr = 0;
  for (let i = 0; i < 100; i++) {
    ok(a, b);
    a.needs.hunger = 0.2;
    b.needs.hunger = 0.8;
    step(w, 1);
    gr = Math.max(gr, b.emotions?.gratitude ?? 0);
    pr = Math.max(pr, a.emotions?.pride ?? 0);
  }
  assert.ok(gr > 0.2, `gratitude ${gr}`);
  assert.ok(pr > 0.05, `pride ${pr}`);
});
test("shame: doing what one has blamed others for", () => {
  const p = mk("P");
  const w = world([p]);
  condemn(p, "theft");
  assert.equal(hypocrisy(p, w, "theft"), true);
  assert.ok((p.emotions?.shame ?? 0) >= 0.3);
});
test("love: a partner close by", () => {
  const a = mk("A", 0, 0, 1, "f"), b = mk("B", 2, 0, 2, "m");
  const w = world([a, b]);
  pairUp(w, a, b);
  fond(a, b, 0.95, 0.9);
  fond(b, a, 0.95, 0.9);
  assert.ok(peak(w, a, "love", 120, () => ((a.intent = { kind: "linger", x: 0, z: 0, speed: 0, remaining: 5, arrived: true }), (b.intent = { kind: "linger", x: 2, z: 0, speed: 0, remaining: 5, arrived: true }))) > 0.1);
});
test("loneliness: a long time without company", () => {
  const p = mk("P");
  const w = world([p]);
  assert.ok(peak(w, p, "loneliness", 200, () => (p.needs.social = 0.95)) > 0.1);
});
test("jealousy: the partner gives attention to someone else", () => {
  const a = mk("A", 0, 0, 1, "f"), b = mk("B", 2, 0, 2), c = mk("C", 3, 0, 3, "f");
  const w = world([a, b, c]);
  pairUp(w, a, b);
  fond(a, b, 0.95, 0.9);
  fond(b, a, 0.95, 0.9);
  fond(b, c, 0.7, 0.5);
  assert.ok(peak(w, a, "jealousy", 60, () => (b.intent = { kind: "gift", targetId: c.id, x: 3, z: 0, speed: 0, remaining: 5, arrived: true })) > 0.1);
});
test("envy: another has food in hand when I am hungry and have none", () => {
  const a = mk("A"), b = mk("B", 3, 0, 2);
  b.carry.food = 4;
  const w = world([a, b]);
  assert.ok(peak(w, a, "envy", 70, () => ((a.needs.hunger = 0.7), (a.carry.food = 0), (b.carry.food = 4), (a.intent = { kind: "linger", x: 0, z: 0, speed: 0, remaining: 5, arrived: true }))) > 0.05);
});
test("envy: a better-regarded person near, when my own standing is low and I am not their friend", () => {
  const a = mk("A"), b = mk("B", 3, 0, 2), others = [0, 1, 2].map((i) => mk(`O${i}`, 4 + i, 3, 10 + i));
  for (const o of others) o.relations.set(b.id, { affinity: 0.7, trust: 0.95, familiarity: 0.9, lastTogether: 0 });
  b.skills = { ...b.skills, hunt: 0.9 } as Person["skills"];
  const w = world([a, b, ...others]);
  psycheOf(a).drives.esteem = 0.1;
  assert.ok(peak(w, a, "envy", 70, () => ((psycheOf(a).drives.esteem = 0.1), (a.intent = { kind: "linger", x: 0, z: 0, speed: 0, remaining: 5, arrived: true }))) > 0.03);
});
test("guilt: wronging one's partner", () => {
  const a = mk("A", 0, 0, 1), b = mk("B", 2, 0, 2, "f"), c = mk("C", 4, 0, 3, "f");
  const w = world([a, b, c]);
  pairUp(w, a, b);
  betray(w, a, b, c);
  assert.ok((a.emotions?.guilt ?? 0) >= 0.3);
  psycheEvent(b, "wrong");
  assert.ok((b.emotions?.guilt ?? 0) > 0.1);
});
test("disgust: close to someone who is badly ill", () => {
  const a = mk("A"), sick = mk("S", 2, 0, 2);
  sick.illness = { severity: 0.8, since: 0 } as Person["illness"];
  const w = world([a, sick]);
  assert.ok(peak(w, a, "disgust", 30, () => ((sick.illness!.severity = 0.8), (a.intent = { kind: "linger", x: 0, z: 0, speed: 0, remaining: 5, arrived: true }), (sick.intent = { kind: "linger", x: 2, z: 0, speed: 0, remaining: 5, arrived: true }))) > 0.05);
});
test("contempt: near someone one has no regard for; and for one known to have stolen", () => {
  const a = mk("A"), foe = mk("F", 5, 0, 2);
  a.relations.set(foe.id, { affinity: -0.7, trust: 0.1, familiarity: 0.8, lastTogether: 0 });
  const w = world([a, foe]);
  assert.ok(peak(w, a, "contempt", 60, () => (a.intent = foe.intent = { kind: "linger", x: 0, z: 0, speed: 0, remaining: 5, arrived: true })) > 0.03);
  const b = mk("B"), thief = mk("T", 5, 0, 3), victim = mk("V", 6, 0, 4);
  thief.thefts = 1;
  const w2 = world([b, thief, victim]);
  witness(w2, "theft", thief, victim, "T took food from V");
  b.relations.set(thief.id, { affinity: 0.1, trust: 0.2, familiarity: 0.5, lastTogether: 0 }); // not an enemy: only a thief
  assert.ok(peak(w2, b, "contempt", 70, () => (b.intent = { kind: "linger", x: 0, z: 0, speed: 0, remaining: 5, arrived: true })) > 0.03);
});
test("hope: a plan in hand", () => {
  const p = mk("P");
  p.plan = { goal: "x", why: "y", steps: [], made: 0, deadline: 1e9, secs: 1, stepAt: 0 };
  assert.ok(peak(world([p]), p, "hope", 300, () => (p.plan = p.plan ?? undefined)) > 0.02 || (p.emotions?.hope ?? 0) > 0.02);
});
test("despair: a low spell that has set in", () => {
  const p = mk("P");
  const w = world([p]);
  psycheOf(p).state = "depressed";
  assert.ok(peak(w, p, "despair", 600, () => ((psycheOf(p).state = "depressed"), (psycheOf(p).strain = 0.9))) > 0.02);
});
test("awe: a song sung among others at a feast", () => {
  const ps = [0, 1, 2, 3].map((i) => mk(`P${i}`, i * 2, 0, 10 + i));
  const w = world(ps, [], 16 * DAY * 2 + 4 * DAY + (18 / 24) * DAY);
  let top = 0;
  for (let i = 0; i < 1100; i++) {
    ok(...ps);
    for (const p of ps) (p.needs.hunger = Math.min(p.needs.hunger, 0.3)), (p.needs.energy = Math.min(p.needs.energy, 0.4));
    step(w, 1);
    for (const p of ps) top = Math.max(top, p.emotions?.awe ?? 0);
  }
  assert.ok((w.tally?.sungAtFeast ?? 0) >= 1 && top > 0.02, `awe ${top}`);
});
test("surprise: a beast where there was none", () => {
  const p = mk("P");
  const w = world([p]);
  step(w, 2);
  w.things.push({ id: "wolf", kind: "wolf", x: 6, z: 0, radius: 1 });
  assert.ok(peak(w, p, "surprise", 6) > 0.1);
});
test("nostalgia: a friend who has died", () => {
  const a = mk("A"), b = mk("B", 90, 0, 2);
  fond(a, b, 0.9, 0.8);
  const w = world([a, b]);
  psycheOf(a).seen[b.id] = w.clock!;
  w.people.splice(1, 1);
  assert.ok(peak(w, a, "nostalgia", 600) > 0.1);
});
test("longing: a loved one away for half a day", () => {
  const a = mk("A"), b = mk("B", 90, 0, 2);
  fond(a, b, 0.9, 0.8);
  const w = world([a, b]);
  psycheOf(a).seen[b.id] = w.clock! - DAY;
  assert.ok(peak(w, a, "longing", 200) > 0.1);
});
test("boredom: nothing new for a long time", () => {
  const p = mk("P");
  const w = world([p]);
  assert.ok(peak(w, p, "boredom", 200, () => ((psycheOf(p).drives.stimulation = 0.1), (p.intent = { kind: "linger", x: 0, z: 0, speed: 0, remaining: 5, arrived: true }))) > 0.05);
});
test("regret: so many of one's own age gone", () => {
  const a = mk("A");
  a.age = 30;
  const dead = [0, 1, 2].map((i) => ((d) => ((d.age = 30), d))(mk(`D${i}`, 50, 0, 20 + i)));
  const w = world([a]);
  for (const d of dead) afterDeath(w, d);
  assert.ok((a.emotions?.regret ?? 0) >= 0.2);
  assert.ok(a.journal.some((j) => /So many of my own age are gone/.test(j.text)));
});
test("relief: the fear passes", () => {
  const p = mk("P");
  const w = world([p], [{ id: "wolf", kind: "wolf", x: 6, z: 0, radius: 1 }]);
  peak(w, p, "fear", 6);
  w.things.splice(1, 1);
  p.emotions = { fear: 0.05 };
  psycheOf(p).prevFear = 0.6;
  assert.ok(peak(w, p, "relief", 4) > 0.1);
});
test("humour: a joke told", () => {
  const p = mk("P");
  const w = world([p]);
  assert.ok(peak(w, p, "humour", 6, () => (p.laughUntil = w.clock! + 30)) > 0.1);
});
test("empathy: a friend near who is low", () => {
  const a = mk("A"), f = mk("F", 3, 0, 2);
  fond(a, f, 0.7, 0.6);
  const w = world([a, f]);
  assert.ok(peak(w, a, "empathy", 30, () => ((f.mood = -0.6), (a.intent = f.intent = { kind: "linger", x: 0, z: 0, speed: 0, remaining: 5, arrived: true }))) > 0.1);
});
test("and the betrayal that teaches jealousy and anger at once", () => {
  const a = mk("A"), b = mk("B", 2, 0, 2, "f");
  const w = world([a, b]);
  learnOfBetrayal(w, b, a);
  assert.ok((b.emotions?.jealousy ?? 0) > 0.3 && (b.emotions?.anger ?? 0) > 0.3 && (heartOf(b).betrayals[a.id] ?? 0) === 1);
});
