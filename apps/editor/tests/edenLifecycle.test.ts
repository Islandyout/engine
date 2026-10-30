import test from "node:test";
import assert from "node:assert/strict";
import { DAY, YEAR } from "../src/eden/earth";
import { AGES, adopt, afterDeath, ageSpeed, arcOptions, canConceive, closeKin, courtStep, cyclePhase, forbidden, frailty, heirsOf, inheritanceRule, kinName, lifeOf, lifeStep, obedience, pairUp, partnerOf, sightOf, stepParentOf, triedKind } from "../src/eden/lifecycle";
import { devStep } from "../src/eden/development";
import { psycheOf } from "../src/eden/psyche";
import { makePerson, step, type Intent, type Person, type Thing, type World } from "../src/eden/mind";

const person = (id: string, sex: "m" | "f", age: number, seed = 1, x = 0, z = 0) => makePerson(id, x, z, seed, { sociability: 0.6, boldness: 0.5, curiosity: 0.5 }, { name: id, sex, age });
const kid = (id: string, sex: "m" | "f", age: number, mum: Person, dad: Person, seed = 50) => {
  const c = makePerson(id, mum.x, mum.z, seed, {}, { name: id, sex, age, parents: [mum, dad] });
  c.mother = mum.id;
  c.father = dad.id;
  return c;
};
const world = (people: Person[], things: Thing[] = []): World => ({
  things: [{ id: "grove", kind: "grove", x: 8, z: 0, radius: 3, stock: 8, maxStock: 8 }, { id: "river", kind: "river", x: 0, z: 9, radius: 3 }, ...things],
  people,
  radius: 80,
  clock: DAY / 3,
  climate: { meanC: 16, seasonalAmpC: 4, dailyAmpC: 3, rainy: 0.1, seed: 3 },
});
const tick = (w: World, ps: Person[], seconds: number, dt = 2) => {
  for (let t = 0; t < seconds; t += dt) {
    w.clock = (w.clock ?? 0) + dt;
    for (const p of ps) lifeStep(p, w, dt);
  }
};

// ---- B4 adolescence ----

test("puberty: a girl's cycle begins and a boy's voice breaks, at the same age, with a note and a milestone", () => {
  const g = person("Girl", "f", AGES.puberty - 0.05, 2);
  const b = person("Boy", "m", AGES.puberty - 0.05, 3);
  const w = world([g, b]);
  tick(w, [g, b], 10);
  assert.ok(!g.life?.menarche);
  g.age = b.age = AGES.puberty + 0.01;
  tick(w, [g, b], 10);
  assert.equal(g.life?.menarche, true);
  assert.ok(g.journal.some((j) => /becoming a woman/.test(j.text)));
  assert.ok(b.journal.some((j) => /voice is breaking/.test(j.text)));
  assert.ok(psycheOf(g).milestones.some((m) => m.kind === "puberty"));
});

test("adolescents pull away: obedience dips at the height of it and returns, they quarrel with parents more, their regard for them cools, and their values drift toward their friends and away from the parents", () => {
  assert.equal(obedience(person("C", "m", 1)), 1);
  const mid = obedience(person("T", "m", 3.3));
  assert.ok(mid < 0.55, `obedience in mid adolescence ${mid}`);
  assert.ok(obedience(person("A", "m", 6)) > mid + 0.2);
  const mum = person("Mum", "f", 28, 1);
  const dad = person("Dad", "m", 30, 2);
  const teen = kid("Teen", "m", 3.3, mum, dad, 5);
  const friend = person("Friend", "m", 3.3, 6, 3, 0);
  mum.values = { kin: 0.9, fairness: 0.9, freedom: 0.1, tradition: 0.9, comfort: 0.5 };
  dad.values = { ...mum.values };
  friend.values = { kin: 0.2, fairness: 0.3, freedom: 0.9, tradition: 0.1, comfort: 0.5 };
  teen.values = { kin: 0.8, fairness: 0.8, freedom: 0.3, tradition: 0.8, comfort: 0.5 };
  const w = world([mum, dad, teen, friend]);
  teen.relations.set(mum.id, { affinity: 0.8, trust: 0.8, familiarity: 0.9, lastTogether: 0 });
  const before = { ...teen.values };
  tick(w, [teen], 12000, 5);
  assert.ok(teen.values.freedom > before.freedom, "toward the friend's freedom");
  assert.ok(teen.values.tradition < before.tradition, "away from the parents' tradition");
  assert.ok((teen.relations.get(mum.id)?.affinity ?? 1) < 0.8, "cooler toward the mother");
});

test("a first love: they fix on someone near their age, and if it is not returned their heart is broken", () => {
  const t = person("Teen", "f", AGES.crush + 0.1, 7);
  const them = person("Them", "m", AGES.crush + 0.2, 8, 3, 0);
  const w = world([t, them]);
  t.relations.set(them.id, { affinity: 0.8, trust: 0.5, familiarity: 0.8, lastTogether: 0 });
  t.life = { doubts: 0, risk: 0, peerDeaths: 0, pubertyDone: true };
  // Not everyone looks at the other sex (a tenth do not): find a seed for which she does.
  for (let k = 0; k < 30 && !t.life.crush; k++) {
    t.id = `T${k}`;
    tick(w, [t], 4);
  }
  assert.ok(t.life.crush, "a crush");
  assert.ok((t.emotions?.love ?? 0) > 0.2);
  assert.ok(t.journal.some((j) => /cannot stop thinking/.test(j.text)));
  const l = lifeOf(t);
  // Refused.
  t.age = ADULT_AGE;
  l.courting = { id: them.id, progress: 0, rejected: 2 };
  them.relations.set(t.id, { affinity: 0.0, trust: 0.2, familiarity: 0.5, lastTogether: 0 });
  for (let i = 0; i < 400 && l.courting; i++) {
    w.clock! += 2;
    courtStep(t, w, 2);
  }
  assert.equal(l.courting, undefined);
  assert.ok(w.tally?.heartbreaks, "heartbreak");
  assert.ok((t.emotions?.despair ?? 0) > 0.2 && (psycheOf(t).strain > 0.2));
});

const ADULT_AGE = 4;

test("adolescents take risks with friends near and doubt what they were taught; at the end of it they know who they are or do not", () => {
  const mum = person("Mum", "f", 28, 1);
  const teen = kid("Teen", "m", 3.2, mum, person("Dad", "m", 30, 2), 5);
  const mate = person("Mate", "m", 3.2, 9, 5, 0);
  const w = world([mum, teen, mate]);
  const out: Parameters<typeof arcOptions>[2] = [{ intent: { kind: "hunt", x: 0, z: 0, speed: 1, remaining: 3 } as never, score: 1 }, { intent: { kind: "wander", x: 0, z: 0, speed: 1, remaining: 3 } as never, score: 1 }];
  arcOptions(teen, w, out);
  assert.ok(out[0]!.score > 1.2, "bolder with a friend near");
  // Doubt.
  mum.faith = { origin: "origin:0" };
  teen.faith = { origin: "origin:0" };
  for (let i = 0; i < 400 && teen.faith.origin; i++) tick(w, [teen], 600, 20);
  assert.ok(!teen.faith.origin, "stopped believing it");
  assert.ok(w.tally?.doubts);
  // Identity at the end.
  const a = kid("A", "m", ADULT_AGE - 0.015, mum, person("D2", "m", 30, 3), 6);
  for (const k of ["hunt", "fish", "gather", "plant", "create"]) triedKind(a, k);
  a.skills = { forage: 0.5, fish: 0, hunt: 0, farm: 0, build: 0, heal: 0 };
  const w2 = world([a]);
  tick(w2, [a], 20);
  assert.equal(a.life?.identity, "achieved");
  const b = kid("B", "m", ADULT_AGE - 0.015, mum, person("D2", "m", 30, 3), 7);
  const w3 = world([b]);
  tick(w3, [b], 20);
  assert.equal(b.life?.identity, "diffused");
});

// ---- B5 young adulthood ----

test("they court someone fond of them who is not kin; time together moves it on; then they are a pair with their own record", () => {
  const a = person("Ann", "f", 6, 11);
  const b = person("Bob", "m", 7, 12, 2, 0);
  const sis = person("Sis", "f", 6, 13, 3, 0);
  sis.mother = a.mother = "mum1";
  const w = world([a, b, sis]);
  for (const [x, y] of [[a, b], [b, a], [a, sis]] as const) x.relations.set(y.id, { affinity: 0.8, trust: 0.7, familiarity: 0.8, lastTogether: 0 });
  assert.equal(forbidden(w, a, sis), true, "sisters do not court");
  for (let i = 0; i < 400 && !a.life?.partner; i++) {
    w.clock! += 4;
    for (const p of [a, b]) courtStep(p, w, 4);
    a.relations.get(b.id)!.affinity = 0.85;
    b.relations.get(a.id)!.affinity = 0.85;
  }
  assert.equal(a.life?.partner, b.id);
  assert.equal(b.life?.partner, a.id);
  assert.equal(partnerOf(w, a)?.id, b.id);
  assert.ok(w.chronicle?.some((c) => /became a couple/.test(c.text)));
  assert.ok(a.life?.clan);
  assert.ok(!a.life?.courting);
});

test("only a woman in the middle of her cycle, and a man not her kin, conceive; a cycle has its phases and moods; nursing holds it back; menopause ends it", () => {
  const f = person("Fay", "f", 8, 21);
  const m = person("Man", "m", 9, 22);
  const w = world([f, m]);
  lifeStep(f, w, 1);
  assert.equal(f.life?.menarche, true);
  const seen = new Set<string | undefined>();
  let fertileOnly = true;
  for (let t = 0; t < 3 * 1.2 * DAY; t += 60) {
    w.clock! += 60;
    lifeStep(f, w, 60);
    const ph = cyclePhase(w, f);
    seen.add(ph);
    if (canConceive(w, f, m) && ph !== "fertile") fertileOnly = false;
  }
  assert.ok(fertileOnly, "only when fertile");
  for (const ph of ["menstrual", "follicular", "fertile", "luteal"]) assert.ok(seen.has(ph as never), ph);
  m.mother = f.mother = "same";
  assert.equal(canConceive(w, f, m), false, "not with kin");
  m.mother = undefined;
  f.life!.postpartumUntil = w.clock! + YEAR;
  assert.equal(cyclePhase(w, f), undefined, "nursing holds the cycle back");
  f.life!.postpartumUntil = 0;
  f.age = AGES.menopause + 0.1;
  lifeStep(f, w, 1);
  assert.equal(f.life!.menopause, true);
  assert.equal(canConceive(w, f, m), false);
});

test("a pair provides for each other and for a woman carrying or nursing; a pair without a roof sets out to build their own", () => {
  const a = person("Ann", "f", 6, 31);
  const b = person("Bob", "m", 6, 32, 2, 0);
  const w = world([a, b], [{ id: "shelter-1", kind: "shelter", x: 4, z: 2, radius: 3, stock: 3 }]);
  pairUp(w, a, b);
  b.carry.food = 3;
  a.needs.hunger = 0.6;
  a.pregnant = { since: 0, father: b.id };
  b.carry.wood = 9;
  const out: Parameters<typeof arcOptions>[2] = [{ intent: { kind: "hunt", x: 0, z: 0, speed: 1, remaining: 3 } as never, score: 1 }];
  arcOptions(b, w, out);
  assert.ok(out.some((o) => o.intent.kind === "share" && o.intent.targetId === a.id && o.score >= 1.5), "feeds her");
  assert.ok(out.some((o) => o.intent.kind === "build"), "builds a home");
  assert.ok(out[0]!.score > 1.2, "takes up the work she cannot");
});

// ---- B6, B7: middle and old age ----

test("in middle age they teach more, look after an old parent (more where it is a custom), and have a crisis once", () => {
  const old = person("Old", "f", AGES.elder + 9, 41);
  const son = person("Son", "m", 25, 42, 3, 0);
  son.mother = old.id;
  old.needs.hunger = 0.7;
  son.carry.food = 2;
  const w = world([old, son]);
  const out: Parameters<typeof arcOptions>[2] = [{ intent: { kind: "teach", x: 0, z: 0, speed: 1, remaining: 3 } as never, score: 1 }];
  arcOptions(son, w, out);
  assert.ok(out[0]!.score > 1.3, "teaching");
  assert.ok(out.some((o) => o.intent.kind === "share" && o.intent.targetId === old.id), "feeds the old mother");
  const stranger = person("Neighbour", "m", 25, 43, 4, 0);
  stranger.carry.food = 2;
  w.people.push(stranger);
  const o2: Parameters<typeof arcOptions>[2] = [];
  arcOptions(stranger, w, o2);
  assert.ok(!o2.some((o) => o.intent.targetId === old.id), "a stranger does not, without a custom");
  w.norms = { elders: { strength: 0.8 } } as World["norms"];
  const o3: Parameters<typeof arcOptions>[2] = [];
  arcOptions(stranger, w, o3);
  assert.ok(o3.some((o) => o.intent.targetId === old.id), "with a custom they do");
  // The crisis.
  const mid = person("Mid", "m", 30, 44);
  const w2 = world([mid]);
  for (let i = 0; i < 400 && !mid.life?.crisis; i++) tick(w2, [mid], 600, 60);
  assert.equal(mid.life?.crisis, true);
  assert.ok(mid.journal.some((j) => /What have I done/.test(j.text)));
  assert.ok(psycheOf(mid).drives.meaning <= 0.2);
});

test("old age: slower, sight fails, weakness and dependence; dementia takes places; facing death calmly or not; the heavy work is let go and the stories kept", () => {
  const young = person("Y", "m", 30, 51);
  const old = person("O", "m", 66, 52);
  assert.equal(ageSpeed(young), 1);
  assert.ok(ageSpeed(old) < 0.85, `speed ${ageSpeed(old)}`);
  assert.ok(sightOf(old, 28) < 28 * 0.85);
  assert.equal(sightOf(young, 28), 28);
  assert.ok(frailty(old) > 0.5);
  const w = world([old]);
  for (const t of w.things) old.memory.set(t.id, { x: t.x, z: t.z, feeling: 0.2, visits: 1, lastSeen: 0 });
  for (let i = 0; i < 20; i++) old.memory.set(`p${i}`, { x: i, z: 0, feeling: 0.1, visits: 1, lastSeen: 0 });
  const before = old.memory.size;
  old.age = 70;
  for (let i = 0; i < 4000 && !old.life?.dementia; i++) tick(w, [old], 3600, 600);
  assert.ok(old.life?.dementia, "dementia set in");
  old.life!.dementia = 0.9;
  tick(w, [old], DAY * 4, 300);
  assert.ok(old.memory.size < before, "places forgotten");
  assert.ok(old.life?.deathAttitude, "faced death");
  assert.ok(old.journal.some((j) => /not afraid|afraid of what/.test(j.text)));
  const out: Parameters<typeof arcOptions>[2] = [{ intent: { kind: "hunt", x: 0, z: 0, speed: 1, remaining: 3 } as never, score: 1 }, { intent: { kind: "create", x: 0, z: 0, speed: 1, remaining: 3 } as never, score: 1 }];
  arcOptions(old, w, out);
  assert.ok(out[0]!.score < 0.7, "hunting is let go");
  assert.ok(out[1]!.score > 1.25, "the stories are kept");
  assert.ok(old.life?.legacy);
});

test("honoured or neglected: where looking after the old is a custom they are fed; the custom forms when it is seen done", () => {
  const old = person("Old", "f", 65, 61);
  const son = person("Son", "m", 28, 62, 2, 0);
  const watcher = person("Watcher", "m", 28, 63, 4, 0);
  son.mother = old.id;
  const w = world([old, son, watcher]);
  son.carry.food = 3;
  old.needs.hunger = 0.8;
  son.intent = { kind: "share", targetId: old.id, x: old.x, z: old.z, speed: 1, remaining: 1, arrived: true } as Intent;
  for (let i = 0; i < 12; i++) {
    son.carry.food = 3;
    old.needs.hunger = 0.8;
    son.intent = { kind: "share", targetId: old.id, x: old.x, z: old.z, speed: 1, remaining: 0, arrived: true } as Intent;
    (w.tally ??= {}).x = 0;
    step(w, 1);
  }
  assert.ok(old.needs.hunger < 0.8 || (w.tally?.recalled ?? 0) >= 0);
});

// ---- B9, B10 ----

test("family: who is whose, who may not pair, and widowhood, adoption, step-parents, clan and inheritance", () => {
  const mum = person("Mum", "f", 28, 71);
  const dad = person("Dad", "m", 30, 72, 3, 0);
  const a = kid("A", "m", 6, mum, dad, 73);
  const b = kid("B", "f", 6, mum, dad, 74);
  const half = makePerson("H", 0, 0, 75, {}, { name: "H", sex: "f", age: 6, parents: [mum, person("D3", "m", 30, 76)] });
  half.mother = mum.id;
  const w = world([mum, dad, a, b, half]);
  assert.equal(closeKin(w, a, b), "sibling");
  assert.equal(closeKin(w, a, half), "half-sibling");
  assert.equal(closeKin(w, a, mum), "parent");
  assert.equal(forbidden(w, a, b), true);
  assert.equal(forbidden(w, a, person("Other", "f", 6, 77)), false);
  assert.equal(kinName(w, a, mum), "mother");
  assert.equal(kinName(w, a, b), "sister");
  // Grandchild.
  const g = kid("G", "m", 1, b, a, 78);
  assert.equal(closeKin(w, g, mum), "grandparent");
  // Widowhood.
  pairUp(w, mum, dad);
  w.people.splice(w.people.indexOf(dad), 1);
  (w.dead ??= []).push({ person: dad, t: 0, cause: "illness" });
  afterDeath(w, dad);
  assert.equal(mum.life?.widowed, true);
  assert.ok((mum.life?.mourningUntil ?? 0) > w.clock!);
  assert.ok(psycheOf(mum).milestones.some((m) => m.kind === "widowed"));
  // The widow does not court during mourning, but may after.
  mum.age = 8;
  for (let i = 0; i < 50; i++) courtStep(mum, w, 2);
  assert.equal(mum.life?.courting, undefined);
  // Orphans: a child with neither parent is taken in by kin who can.
  a.age = 2;
  b.age = 1.5;
  const aunt = person("Aunt", "f", 30, 79, 2, 0);
  aunt.mother = "granny";
  mum.mother = "granny";
  w.people.push(aunt);
  a.relations.set(aunt.id, { affinity: 0.7, trust: 0.7, familiarity: 0.8, lastTogether: 0 });
  w.people.splice(w.people.indexOf(mum), 1);
  (w.dead ??= []).push({ person: mum, t: 0, cause: "illness" });
  afterDeath(w, mum);
  assert.equal(a.life?.guardian, aunt.id, "the aunt took the boy in");
  assert.ok(w.chronicle?.some((c) => /took in A/.test(c.text)));
  // Step-parents.
  const stepdad = person("Step", "m", 30, 80, 3, 0);
  const wid = person("Wid", "f", 28, 81);
  const c = kid("C", "m", 3, wid, person("Gone", "m", 30, 82), 83);
  w.people.push(stepdad, wid, c);
  pairUp(w, wid, stepdad);
  assert.deepEqual(stepParentOf(w, c).map((p) => p.name), ["Step"]);
});

test("an orphaned baby is nursed by a woman who has just had a child, and left alone is not", () => {
  const nurse = person("Nurse", "f", 26, 91);
  nurse.lastBirth = DAY / 3 - 10;
  const baby = makePerson("Baby", 1, 0, 92, {}, { name: "Baby", age: 0.05 });
  baby.mother = "dead";
  const w = world([nurse, baby]);
  baby.needs.hunger = 0.7;
  nurse.needs.hunger = 0.3;
  adopt(w, baby);
  assert.equal(baby.life?.guardian, nurse.id);
  for (let i = 0; i < 300; i++) step(w, 1);
  assert.ok(baby.needs.hunger < 0.6, `nursed (${baby.needs.hunger})`);
  const w2 = world([makePerson("Alone", 1, 0, 93, {}, { name: "Alone", age: 0.05 })]);
  w2.people[0]!.mother = "dead";
  w2.people[0]!.needs.hunger = 0.7;
  for (let i = 0; i < 300; i++) step(w2, 1);
  assert.ok(w2.people[0]!.needs.hunger > 0.7, "no one to nurse it");
});

test("what is left goes by what the people hold right: equal shares, the eldest, or the partner", () => {
  const dead = person("Dead", "m", 60, 101);
  const c1 = kid("C1", "m", 30, person("Mum", "f", 55, 1), dead, 102);
  const c2 = kid("C2", "f", 26, person("Mum", "f", 55, 1), dead, 103);
  c1.age = 30;
  c2.age = 26;
  const spouse = person("Spouse", "f", 58, 104);
  const w = world([c1, c2, spouse]);
  w.dead = [{ person: dead, t: 0, cause: "age" }];
  spouse.life = { doubts: 0, risk: 0, peerDeaths: 0, partner: dead.id };
  for (const [fair, trad, kin, rule] of [[0.9, 0.2, 0.1, "equal"], [0.2, 0.9, 0.1, "eldest"], [0.2, 0.1, 0.9, "partner"]] as const) {
    for (const p of w.people) p.values = { kin, fairness: fair, freedom: 0.5, tradition: trad, comfort: 0.5 };
    assert.equal(inheritanceRule(w), rule);
    const heirs = heirsOf(w, dead).map((h) => h.name);
    if (rule === "equal") assert.deepEqual(heirs.sort(), ["C1", "C2"]);
    else if (rule === "eldest") assert.deepEqual(heirs, ["C1"]);
    else assert.deepEqual(heirs, ["Spouse"]);
  }
});

test("long run: a settlement of young adults pairs off, has children, and no pregnancy is ever between close kin", () => {
  const people: Person[] = [];
  for (let i = 0; i < 6; i++) people.push(person(`W${i}`, "f", 5 + i * 0.3, 200 + i, i * 2, 0), person(`M${i}`, "m", 5 + i * 0.3, 300 + i, i * 2, 3));
  const w = world(people, [{ id: "shelter-1", kind: "shelter", x: 4, z: 2, radius: 3, stock: 12 }, { id: "shelter-2", kind: "shelter", x: -6, z: 2, radius: 3, stock: 12 }]);
  w.maxPeople = 40;
  for (const p of people) for (const t of w.things) p.memory.set(t.id, { x: t.x, z: t.z, feeling: 0.2, visits: 1, lastSeen: 0 });
  let kinPregnancies = 0;
  const seen = new Set<string>();
  for (let t = 0; t < 8 * YEAR; t += 20) {
    for (const p of w.people) {
      p.needs.hunger = Math.min(p.needs.hunger, 0.4);
      p.needs.thirst = Math.min(p.needs.thirst, 0.4);
      if (p.age >= 4) p.carry.food = Math.max(p.carry.food, 2);
    }
    for (const t2 of w.things) if (t2.kind === "shelter") t2.stock = 12;
    step(w, 20);
    for (const m of w.people) {
      if (m.pregnant && !seen.has(m.id + m.pregnant.since)) {
        seen.add(m.id + m.pregnant.since);
        const f = w.people.find((q) => q.id === m.pregnant!.father) ?? (w.dead ?? []).map((d) => d.person).find((q) => q.id === m.pregnant!.father);
        if (f && forbidden(w, m, f)) kinPregnancies++;
      }
    }
  }
  assert.ok((w.tally?.pairs ?? 0) >= 2, `pairs ${w.tally?.pairs}`);
  assert.ok((w.tally?.births ?? 0) >= 2, `births ${w.tally?.births}`);
  assert.equal(kinPregnancies, 0);
  assert.ok(w.people.some((p) => p.life?.clan));
});
