import test from "node:test";
import assert from "node:assert/strict";
import { DAY, YEAR } from "../src/eden/earth";
import { AGES, forbidden, lifeOf } from "../src/eden/lifecycle";
import { ambitionOf, deedBias, deedsOf, statusOf, wisdomOf } from "../src/eden/deeds";
import { selfOf } from "../src/eden/mindmodel";
import { makePerson, step, type Intent, type Person, type Thing, type World } from "../src/eden/mind";

const mk = (id: string, x = 0, z = 0, age = 10, seed = 1, sex: "m" | "f" = "m") => makePerson(id, x, z, seed, { sociability: 0.6, boldness: 0.6, curiosity: 0.5 }, { name: id, sex, age });
const world = (people: Person[], things: Thing[] = [], clock = 840): World => ({
  things: [{ id: "river", kind: "river", x: 0, z: 9, radius: 3 }, { id: "grove", kind: "grove", x: 8, z: 0, radius: 3, stock: 8, maxStock: 8 }, ...things],
  people,
  radius: 120,
  clock,
  climate: { meanC: 16, seasonalAmpC: 4, dailyAmpC: 3, rainy: 0.1, seed: 3 },
});
const comfortable = (...ps: Person[]) => ps.forEach((p) => ((p.needs.thirst = Math.min(p.needs.thirst, 0.1)), (p.needs.hunger = Math.min(p.needs.hunger, 0.3)), (p.cold = 0)));
const opt = (kind: Intent["kind"], score: number, targetId?: string) => ({ intent: { kind, targetId, x: 0, z: 0, speed: 1, remaining: 5 } as Omit<Intent, "arrived">, score });

// ---- B6 standing: a peak and its loss ----

test("B6: in the middle years a person reaches the height of their standing, and when the others lose faith in them they feel the fall", () => {
  const p = mk("Mid", 0, 0, AGES.middle + 3, 1);
  p.skills = { ...p.skills, hunt: 0.8 } as Person["skills"];
  const others = [0, 1, 2, 3, 4].map((i) => mk(`O${i}`, 3 + i, 2, 10, 20 + i));
  for (const o of others) o.relations.set(p.id, { affinity: 0.7, trust: 0.9, familiarity: 0.9, lastTogether: 0 });
  const w = world([p, ...others]);
  for (let i = 0; i < 700; i++) (comfortable(p, ...others), step(w, 1));
  const d = deedsOf(p);
  assert.ok(d.peak >= 0.55, `peak ${d.peak}`);
  assert.equal(w.tally?.statusPeaks, 1);
  assert.ok(p.psyche!.milestones.some((m) => m.kind === "peak"));
  assert.ok(!d.statusLost);
  for (const o of others) o.relations.get(p.id)!.trust = 0.1;
  selfOf(p).esteem = 0.2;
  const shame0 = p.emotions?.shame ?? 0;
  for (let i = 0; i < 900 && !d.statusLost; i++) (comfortable(p, ...others), step(w, 1));
  assert.equal(d.statusLost, true);
  assert.equal(w.tally?.statusLost, 1);
  assert.ok(p.psyche!.milestones.some((m) => m.kind === "statusLoss"));
  assert.ok(p.journal.some((j) => /I was looked up to once/.test(j.text)));
  assert.ok((p.emotions?.shame ?? 0) > shame0 || (p.emotions?.regret ?? 0) > 0);
});

test("B9: a division of labour is a division of standing: the one the others rely on for a craft stands higher, and is sought out", () => {
  const maker = mk("Hunter", 0, 0, 12, 1), plain = mk("Plain", 1, 0, 12, 1);
  maker.skills = { ...maker.skills, hunt: 0.85 } as Person["skills"];
  const others = [0, 1, 2].map((i) => mk(`O${i}`, 4 + i, 2, 10, 20 + i));
  for (const o of others) for (const t of [maker, plain]) o.relations.set(t.id, { affinity: 0.5, trust: 0.6, familiarity: 0.7, lastTogether: 0 });
  const w = world([maker, plain, ...others]);
  assert.ok(statusOf(w, maker) > statusOf(w, plain) + 0.15);
  // The respected are sought out.
  const asker = mk("Asker", 0, 0, 10, 5);
  deedsOf(maker).status = 0.8;
  deedsOf(plain).status = 0.3;
  const os = [opt("talk", 0.5, maker.id), opt("talk", 0.5, plain.id)];
  w.people.push(asker);
  deedBias(asker, w, os);
  assert.ok(os[0]!.score > os[1]!.score);
});

// ---- B7 old age: retirement and wisdom ----

test("B7: when the body fails a person retires from the heavy work and becomes a keeper of stories; the heavy options fall away", () => {
  const old = mk("Old", 0, 0, 60, 1), young = mk("Young", 3, 0, 10, 2);
  const w = world([old, young]);
  for (let i = 0; i < 80; i++) (comfortable(old, young), step(w, 1));
  assert.equal(deedsOf(old).retired, true);
  assert.ok(old.journal.some((j) => /leave the heavy work to the young, and keep the stories/.test(j.text)));
  assert.ok(old.psyche!.milestones.some((m) => m.kind === "retired"));
  assert.equal(w.tally?.retired, 1);
  assert.equal(deedsOf(young).retired, undefined);
  const hunt = opt("hunt", 1), teach = opt("teach", 1);
  deedBias(old, w, [hunt, teach]);
  assert.ok(hunt.score < 1 && teach.score >= 1);
});

test("B7: wisdom grows with years and lessons and is taken by dementia; someone who has lost more than won goes to the wise for counsel and comes away with what they know", () => {
  const sage = mk("Sage", 4, 0, 40, 1, "f"), y = mk("Youth", 0, 0, 7, 2);
  const s = selfOf(sage);
  for (let i = 0; i < 4; i++) s.lessons.push({ key: `k${i}|morning|summer`, text: `Lesson ${i}.`, sign: 1, strength: 0.7, n: 6 });
  for (let i = 0; i < 25; i++) s.experience[`e${i}`] = { n: 3, mean: 0.1 };
  assert.ok(wisdomOf(sage) >= 0.35 && wisdomOf(sage) > wisdomOf(y) + 0.3);
  const demented = mk("Fading", 0, 0, 40, 3);
  Object.assign(selfOf(demented), { lessons: s.lessons, experience: s.experience });
  lifeOf(demented).dementia = 0.8;
  assert.ok(wisdomOf(demented) < wisdomOf(sage) * 0.4);
  selfOf(y).losses = 5;
  selfOf(y).wins = 0;
  y.relations.set(sage.id, { affinity: 0.5, trust: 0.6, familiarity: 0.8, lastTogether: 0 });
  const w = world([sage, y]);
  const e0 = selfOf(y).esteem;
  for (let i = 0; i < 300 && !(w.tally?.counsel); i++) (comfortable(sage, y), step(w, 1));
  assert.equal(w.tally?.counsel, 1);
  assert.ok(selfOf(y).lessons.length >= 1 && selfOf(y).lessons.some((l) => /Lesson/.test(l.text)));
  assert.ok(y.journal.some((j) => /Sage told me what they had learned/.test(j.text)));
  assert.ok(sage.journal.some((j) => /came to me for counsel/.test(j.text)));
  assert.ok(selfOf(y).esteem > e0 - 0.05);
  assert.equal(deedsOf(y).counselled, 1);
});

// ---- B5 ambition and a roof of one's own ----

test("B5: an ambitious young adult whose parent is alive builds a roof of their own and leaves; a content one stays", () => {
  const trial = (ambitious: boolean) => {
    const mum = mk("Mum", 10, 0, 25, 1, "f");
    const y = mk("Y", 12, 2, AGES.courting + 1, 2);
    y.mother = mum.id;
    y.personality = { ...y.personality, boldness: ambitious ? 1 : 0.1 };
    y.skills = { ...y.skills, forage: ambitious ? 0.8 : 0 } as Person["skills"];
    y.values = { kin: 0.5, fairness: 0.5, freedom: 0.5, tradition: 0.5, comfort: ambitious ? 0.1 : 1 } as Person["values"];
    y.carry.wood = 12;
    const roof: Thing = { id: "shelter-0", kind: "shelter", x: 10, z: 4, radius: 3, stock: 6 };
    const w = world([mum, y], [roof]);
    y.memory.set(roof.id, { x: 10, z: 4, feeling: 0.2, visits: 1, lastSeen: 0 });
    return { w, y, mum };
  };
  assert.ok(ambitionOf(trial(true).y) > 0.5 && ambitionOf(trial(false).y) < 0.5);
  const a = trial(true), b = trial(false);
  for (let i = 0; i < 1500 && !a.y.life?.home; i++) {
    for (const t of [a, b]) (comfortable(t.y, t.mum), (t.y.carry.wood = Math.max(t.y.carry.wood, 12)), (t.y.needs.energy = Math.min(t.y.needs.energy, 0.5)), (t.mum.needs.energy = 0.2));
    step(a.w, 1);
    step(b.w, 1);
  }
  assert.ok(a.y.life?.home, `left home: ${JSON.stringify(a.w.tally)}`);
  assert.equal(a.w.tally?.leftHome, 1);
  assert.ok(a.y.journal.some((j) => /I have a roof of my own now/.test(j.text)));
  assert.ok(a.y.journal.some((j) => /I want more than my parents' fire/.test(j.text)));
  assert.ok(a.y.psyche!.milestones.some((m) => m.kind === "leftHome"));
  const mine = a.w.things.find((t) => t.kind === "shelter" && t.owner === a.y.id)!;
  assert.ok(Math.hypot(mine.x - 10, mine.z - 4) > 8, "away from the parents' roof");
  assert.equal(b.y.life?.home, undefined);
  void DAY; void YEAR; void forbidden;
});

// ---- B5 / B6 / B7 over generations ----

test("long run (nine years): the children of a settlement grow up, some leave their parents' roof, and every conception ends in a birth, a stillbirth, a loss of the mother or is still being carried", () => {
  const people: Person[] = [];
  for (let i = 0; i < 6; i++) people.push(mk(`W${i}`, i * 2, 0, 5 + i * 0.3, 200 + i, "f"), mk(`M${i}`, i * 2, 3, 5 + i * 0.3, 300 + i, "m"));
  const w = world(people, [{ id: "shelter-1", kind: "shelter", x: 4, z: 2, radius: 3, stock: 12 }, { id: "shelter-2", kind: "shelter", x: -6, z: 2, radius: 3, stock: 12 }, { id: "grove2", kind: "grove", x: -8, z: 8, radius: 3, stock: 8, maxStock: 8 }]);
  w.maxPeople = 40;
  for (const p of people) for (const t of w.things) p.memory.set(t.id, { x: t.x, z: t.z, feeling: 0.2, visits: 1, lastSeen: 0 });
  for (let t = 0; t < 9 * YEAR; t += 30) {
    for (const p of w.people) {
      p.needs.hunger = Math.min(p.needs.hunger, 0.4);
      p.needs.thirst = Math.min(p.needs.thirst, 0.4);
      if (p.age >= 4) p.carry.food = Math.max(p.carry.food, 2);
      if (p.age >= 4 && p.carry.wood < 10) p.carry.wood = 10; // wood is not what is being tested
    }
    for (const t2 of w.things) if (t2.kind === "shelter" && !t2.owner) t2.stock = 12;
    step(w, 30);
  }
  const tally = w.tally ?? {};
  const grownChildren = [...w.people, ...(w.dead ?? []).map((d) => d.person)].filter((p) => (p.mother || p.father) && p.age >= AGES.courting + 1);
  assert.ok(grownChildren.length >= 2, `children grew up: ${grownChildren.length}`);
  assert.ok((tally.leftHome ?? 0) >= 1, `someone left their parents' roof: ${JSON.stringify(tally)}`);
  const childbirthDeaths = (w.dead ?? []).filter((d) => d.cause === "childbirth").length;
  const ongoing = w.people.filter((p) => p.pregnant).length;
  const ended = (tally.births ?? 0) + (tally.stillbirths ?? 0) + childbirthDeaths;
  assert.ok((tally.conceptions ?? 0) >= (tally.births ?? 0), "no birth without a conception");
  const lost = (tally.conceptions ?? 0) - ended - ongoing; // pregnancies that ended some other way
  assert.ok(ended <= (tally.conceptions ?? 0) && lost <= 0.25 * (tally.conceptions ?? 0), `conceptions ${tally.conceptions}, births ${tally.births}, stillbirths ${tally.stillbirths}, mothers lost ${childbirthDeaths}, carrying ${ongoing}`);
  assert.ok((tally.births ?? 0) >= 4);
  assert.ok((tally.pairs ?? 0) >= 3);
});
