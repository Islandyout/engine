import test from "node:test";
import assert from "node:assert/strict";
import { DAY } from "../src/eden/earth";
import { AGE, devOf, devOptions, devStep, limitSpeech, onDeathSeenBy, stageName, vocabOf, weaning, witnessShare } from "../src/eden/development";
import { psycheOf, psycheStep, appraise } from "../src/eden/psyche";
import { makePerson, step, type Person, type Thing, type World } from "../src/eden/mind";

const adult = (id: string, sex: "m" | "f", seed: number, x = 0, z = 0) => makePerson(id, x, z, seed, { sociability: 0.6, boldness: 0.5, curiosity: 0.5 }, { name: id, sex, age: 28 });
const child = (id: string, age: number, mother?: Person, father?: Person, seed = 50) => {
  const c = makePerson(id, mother?.x ?? 0, mother?.z ?? 0, seed, {}, { name: id, sex: "m", age, ...(mother && father ? { parents: [mother, father] as [Person, Person] } : {}) });
  if (mother) c.mother = mother.id;
  if (father) c.father = father.id;
  return c;
};
const world = (people: Person[], things: Thing[] = []): World => ({
  things: [{ id: "grove", kind: "grove", x: 8, z: 0, radius: 3, stock: 8, maxStock: 8 }, { id: "river", kind: "river", x: 0, z: 9, radius: 3 }, ...things],
  people,
  radius: 60,
  clock: DAY / 3,
  climate: { meanC: 16, seasonalAmpC: 4, dailyAmpC: 3, rainy: 0.1, seed: 3 },
});
const run = (w: World, seconds: number, dt = 1) => {
  for (let t = 0; t < seconds; t += dt) step(w, dt);
};

// ---- B1 infancy ----

test("a baby that is held and fed grows up secure; one left to cry grows up avoidant, and the window for bonding can close", () => {
  const mum = adult("Mum", "f", 1);
  const dad = adult("Dad", "m", 2, 2, 0);
  const held = child("Held", 0.02, mum, dad, 10);
  const w = world([mum, dad, held]);
  held.needs.hunger = 0.6;
  run(w, 0.43 * 16 * DAY, 30);
  assert.equal(held.dev?.attachment, "secure", `care ${held.dev?.care}`);
  // The same baby with no mother and no one near (stepped by hand: left alone, a real baby would not live this long).
  const lone = makePerson("Lone", 30, 30, 11, {}, { name: "Lone", age: 0.02, parents: [adult("M2", "f", 3), adult("F2", "m", 4)] });
  lone.mother = "gone";
  lone.father = "gone";
  const w2 = world([lone]);
  for (let t = 0; lone.age < 0.45; t++) {
    w2.clock = (w2.clock ?? 0) + 30;
    lone.age += 30 / (16 * DAY);
    lone.needs.hunger = 0.8;
    lone.needs.social = 0.8;
    devStep(lone, w2, 30);
  }
  assert.ok(w2.tally?.cries, "it cried");
  assert.ok(["avoidant", "anxious"].includes(lone.dev?.attachment ?? ""), `style ${lone.dev?.attachment}`);
  assert.ok((lone.dev?.care ?? 1) < 0.4);
  assert.equal(lone.dev?.bondDeficit, true, "the window for bonding closed");
  assert.ok(psycheOf(lone).sens.oxytocin <= 0.6, "and it bonds less for the rest of its life");
});

test("attachment shapes the adult: the avoidant expect little, the anxious feel loss more", () => {
  const a = adult("Av", "m", 5);
  const b = adult("An", "m", 6);
  const c = adult("Se", "m", 7);
  a.dev = { ...devOf(c), attachment: "avoidant" };
  b.dev = { ...devOf(c), attachment: "anxious" };
  c.dev = { ...devOf(c), attachment: "secure" };
  for (const p of [a, b, c]) p.relations.set("x", { affinity: 0.2, trust: 0.5, familiarity: 0.5, lastTogether: 0 });
  assert.ok(appraise(a, "x", 0.2) < appraise(c, "x", 0.2));
  assert.ok(Math.abs(appraise(b, "x", -0.2)) > Math.abs(appraise(c, "x", -0.2)));
  const w = world([a, b, c]);
  for (const p of [a, b, c]) {
    p.needs.social = 0.95;
    p.x = p === a ? 0 : p === b ? 100 : 200;
  }
  for (let i = 0; i < 100; i++) for (const p of [a, b, c]) (w.clock = (w.clock ?? 0) + 1), psycheStep(p, w, 1);
  assert.ok((b.emotions?.loneliness ?? 0) > (a.emotions?.loneliness ?? 0), "the anxious are lonelier than the avoidant");
});

test("a baby cries when it needs and no one comes; its parent hears it and goes to it", () => {
  const mum = adult("Mum", "f", 1, 20, 0);
  const baby = child("Baby", 0.1, mum, adult("Dad", "m", 2), 12);
  baby.dev = { ...devOf(baby), crying: true };
  baby.x = 0;
  const w = world([mum, baby]);
  const out: Parameters<typeof devOptions>[2] = [];
  devOptions(mum, w, out);
  assert.ok(out.some((o) => o.intent.kind === "comfort" && o.intent.targetId === baby.id && o.score > 1.5));
});

test("first steps, first words, object permanence and fear of strangers arrive at their ages and are noticed by the parents", () => {
  const mum = adult("Mum", "f", 1);
  const baby = child("Baby", 0.1, mum, adult("Dad", "m", 2), 13);
  const stranger = adult("Stranger", "m", 9, 2, 0);
  const w = world([mum, baby, stranger]);
  mum.say = "Hello little one, hello hello";
  for (const [age, field] of [[0.21, "permanence"], [0.26, "walking"], [0.32, "firstWord"]] as const) {
    baby.age = age;
    baby.x = mum.x + 1;
    mum.say = `Say mama ${age}`;
    mum.intent = { kind: "talk", targetId: baby.id, x: 0, z: 0, speed: 0, remaining: 5, arrived: true };
    for (let i = 0; i < 6; i++) {
      w.clock = (w.clock ?? 0) + 1;
      mum.say = `Say mama ${age} ${i}`;
      devStep(baby, w, 1);
    }
    assert.ok(devOf(baby)[field], `${field} at ${age}`);
  }
  assert.ok(mum.journal.some((j) => /first steps/.test(j.text)));
  assert.ok(mum.journal.some((j) => /first word/.test(j.text)));
  assert.ok(w.tally?.permanence);
  baby.age = 0.3;
  stranger.x = baby.x + 1;
  mum.x = baby.x + 20;
  for (let i = 0; i < 20; i++) devStep(baby, w, 1);
  assert.ok(w.tally?.strangerFear, "afraid of the stranger");
  assert.ok((baby.emotions?.fear ?? 0) > 0.2);
});

test("weaning: milk counts for less as the baby grows, and solids from the mother take over", () => {
  assert.ok(weaning(0.2) === 0);
  assert.ok(weaning(0.37) > 0.4 && weaning(0.37) < 0.6);
  assert.ok(weaning(0.45) === 1);
  const mum = adult("Mum", "f", 1);
  mum.carry.food = 4;
  const baby = child("Baby", 0.43, mum, adult("Dad", "m", 2), 14);
  baby.needs.hunger = 0.6;
  const w = world([mum, baby]);
  run(w, 5, 1);
  assert.ok(baby.needs.hunger > 0.5, "milk no longer feeds it (the child must eat)");
});

// ---- B2 early childhood and B8 sensitive periods ----

test("a child's vocabulary grows from the speech it hears; one never spoken to does not learn to speak, and the window closes", () => {
  const mum = adult("Mum", "f", 1);
  const dad = adult("Dad", "m", 2);
  const talked = child("Talked", 0.5, mum, dad, 20);
  const w = world([mum, dad, talked]);
  const silent = child("Silent", 0.5, adult("M2", "f", 3), adult("F2", "m", 4), 21);
  silent.x = 40;
  silent.z = 40;
  w.people.push(silent);
  for (let i = 0; i < 4000; i++) {
    w.clock = (w.clock ?? 0) + 1;
    mum.say = `Look at the little bird number ${i}, see it fly`;
    mum.intent = { kind: "talk", targetId: talked.id, x: 0, z: 0, speed: 0, remaining: 5, arrived: true };
    devStep(talked, w, 1);
    devStep(silent, w, 1);
    if (i % 800 === 0) (talked.age += 0.12), (silent.age += 0.12);
  }
  assert.ok(vocabOf(talked) > 100, `talked ${vocabOf(talked)}`);
  assert.ok(vocabOf(silent) < 5, `silent ${vocabOf(silent)}`);
  silent.age = AGE.speechWindow + 0.05;
  talked.age = AGE.speechWindow + 0.05;
  devStep(silent, w, 1);
  devStep(talked, w, 1);
  assert.equal(silent.dev?.speechDeficit, true, "the window closed on the silent child");
  assert.ok(!talked.dev?.speechDeficit);
  // Hearing speech afterwards no longer helps as it would have.
  const before = vocabOf(silent);
  for (let i = 0; i < 3000; i++) {
    w.clock = (w.clock ?? 0) + 1;
    mum.say = `Words and more words ${i}`;
    silent.x = mum.x + 1;
    silent.z = mum.z;
    mum.intent = { kind: "talk", targetId: silent.id, x: 0, z: 0, speed: 0, remaining: 5, arrived: true };
    devStep(silent, w, 1);
  }
  assert.ok(vocabOf(silent) - before < 0.5 * Math.max(10, vocabOf(talked)), "late speech does not make up for it");
});

test("what a small child can say is limited by its words", () => {
  const w = world([]);
  const c = child("Kid", 0.5, undefined, undefined, 30);
  c.dev = { ...devOf(c), vocab: 1 };
  c.say = "I would like some water please now";
  w.people.push(c);
  limitSpeech(w);
  assert.ok(/^(Ba|Da|Ma|Goo|Ah)/.test(c.say), c.say);
  c.dev.vocab = 15;
  c.say = "I would like some water please now";
  limitSpeech(w);
  assert.equal(c.say.split(" ").length, 2);
  c.dev.vocab = 500;
  c.say = "I would like some water please now";
  limitSpeech(w);
  assert.equal(c.say.split(" ").length, 7);
});

test("small children grab food, are corrected and learn to ask; throw tantrums when they cannot bear waiting; fear the dark; play at what adults do; call things their own", () => {
  const mum = adult("Mum", "f", 1);
  const kid = child("Kid", 0.7, mum, adult("Dad", "m", 2), 31);
  const w = world([mum, kid]);
  mum.carry.food = 5;
  kid.needs.hunger = 0.9;
  kid.x = mum.x + 1;
  for (let i = 0; i < 400 && !kid.dev?.rules?.includes("ask-first"); i++) {
    kid.needs.hunger = 0.9;
    w.clock = (w.clock ?? 0) + 1;
    devStep(kid, w, 1);
  }
  assert.ok(kid.dev?.rules.includes("ask-first"), "learned the rule");
  assert.ok(w.tally?.grabs >= 1);
  const grabsAfter = w.tally?.grabs ?? 0;
  for (let i = 0; i < 400; i++) {
    kid.needs.hunger = 0.9;
    w.clock = (w.clock ?? 0) + 1;
    devStep(kid, w, 1);
  }
  assert.equal(w.tally?.grabs, grabsAfter, "and does not grab again");
  // Tantrums.
  const t = child("Tan", 0.8, mum, adult("Dad", "m", 2), 32);
  t.x = mum.x + 2;
  w.people.push(t);
  for (let i = 0; i < 3000 && !t.dev?.tantrumUntil; i++) {
    t.needs.hunger = 0.9;
    w.clock = (w.clock ?? 0) + 1;
    devStep(t, w, 1);
  }
  assert.ok(w.tally?.tantrums, "a tantrum");
  assert.match(t.say ?? "", /No/);
  // The dark.
  const d = child("Dark", 0.8, mum, adult("Dad", "m", 2), 33);
  d.x = 40;
  d.z = 40;
  w.people.push(d);
  w.clock = 23 * 60;
  for (let i = 0; i < 40; i++) {
    w.clock! += 1;
    devStep(d, w, 1);
  }
  assert.ok((d.emotions?.fear ?? 0) > 0.3 && w.tally?.darkFears, "afraid of the dark when alone");
  // "Mine".
  const m = child("Mine", 0.6, mum, adult("Dad", "m", 2), 34);
  w.people.push(m);
  devStep(m, w, 1);
  assert.equal(m.dev?.mine, true);
  const out = [{ intent: { kind: "share", x: 0, z: 0, speed: 1, remaining: 5 } as never, score: 1 }];
  devOptions(m, w, out);
  assert.ok(out[0]!.score < 1, "slow to share");
  // Imaginary friend: some children have one.
  let any = 0;
  for (let k = 0; k < 40; k++) {
    const c = child(`Im${k}`, 0.9, mum, adult("Dad", "m", 2), 40 + k);
    w.people.push(c);
    devStep(c, w, 1);
    if (c.dev?.imaginary) any++;
  }
  assert.ok(any > 3 && any < 25, `imaginary friends in ${any} of 40`);
  // Pretend play: grown people at work nearby.
  const p = child("Play", 0.9, mum, adult("Dad", "m", 2), 35);
  p.x = 1;
  w.people.push(p);
  mum.intent = { kind: "fish", x: 0, z: 0, speed: 0, remaining: 5, arrived: true };
  for (let i = 0; i < 100; i++) devStep(p, w, 1);
  assert.ok((p.dev?.pretend ?? 0) > 2 && (p.skills?.fish ?? 0) > 0);
});

// ---- B3 middle childhood ----

test("a child of six or more may take on chores a younger one may not", () => {
  const mum = adult("Mum", "f", 1);
  const wood = world([mum], [{ id: "w1", kind: "woodland", x: 5, z: 0, radius: 3, stock: 5, maxStock: 5 }]);
  const young = child("Young", 1.0, mum, adult("D", "m", 2), 60);
  const older = child("Older", 1.6, mum, adult("D", "m", 2), 61);
  for (const c of [young, older]) {
    wood.people.push(c);
    for (const t of wood.things) c.memory.set(t.id, { x: t.x, z: t.z, feeling: 0.2, visits: 1, lastSeen: 0 });
    c.needs.hunger = 0.2;
  }
  const kinds = (c: Person) => {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      c.intent = undefined;
      step(wood, 1);
      if (c.intent) seen.add((c.intent as { kind: string }).kind);
      c.needs.hunger = 0.2;
      c.needs.thirst = 0.2;
    }
    return seen;
  };
  const ys = kinds(young);
  const os = kinds(older);
  assert.ok(![...ys].some((k) => ["gather", "forage", "plant", "stash", "fish"].includes(k)), `young chose ${[...ys]}`);
  assert.ok([...os].some((k) => ["gather", "forage", "plant", "stash", "fish"].includes(k)), `older chose ${[...os]}`);
});

test("a child picks a master, follows them and learns their skill faster; peers play-fight and a standing forms; siblings are jealous of the parent's attention; beliefs pass from parents", () => {
  const mum = adult("Mum", "f", 1);
  mum.skills = { forage: 0.2, fish: 0.8, hunt: 0, farm: 0, build: 0, heal: 0 };
  const dad = adult("Dad", "m", 2, 3, 0);
  const a = child("A", 1.8, mum, dad, 70);
  const b = child("B", 1.9, mum, dad, 71);
  const w = world([mum, dad, a, b]);
  a.x = 1;
  b.x = 2;
  mum.faith = { origin: "origin:0" };
  w.tenets = [{ id: "origin:0", question: "origin", text: "The Creator watches.", by: "Mum", byName: "Mum", t: 0 }];
  mum.intent = { kind: "fish", x: 0, z: 0, speed: 0, remaining: 100, arrived: true };
  for (let i = 0; i < 3000; i++) {
    w.clock = (w.clock ?? 0) + 1;
    mum.intent = { kind: "fish", x: 0, z: 0, speed: 0, remaining: 100, arrived: true };
    devStep(a, w, 1);
    devStep(b, w, 1);
  }
  assert.ok(a.dev?.master, "a master");
  assert.ok((a.skills?.fish ?? 0) > 0.05, "learned from watching");
  assert.ok((w.tally?.playFights ?? 0) > 3 && (a.dev?.rank ?? 0.5) !== 0.5, "play-fights and a rank");
  assert.equal(a.faith?.origin, "origin:0", "took her belief");
  // Sibling rivalry.
  mum.intent = { kind: "comfort", targetId: b.id, x: 0, z: 0, speed: 0, remaining: 50, arrived: true };
  a.relations.set(b.id, { affinity: 0.5, trust: 0.5, familiarity: 0.5, lastTogether: 0 });
  for (let i = 0; i < 30; i++) devStep(a, w, 1);
  assert.ok((w.tally?.siblingRivalry ?? 0) > 0 && (a.emotions?.jealousy ?? 0) > 0.05, "jealous of the attention");
});

test("a child protests when an adult shares with someone else and not with them, and the adult shares more evenly", () => {
  const mum = adult("Mum", "f", 1);
  const kid = child("Kid", 1.8, mum, adult("D", "m", 2), 80);
  const other = adult("Other", "m", 5);
  const w = world([mum, kid, other]);
  kid.needs.hunger = 0.8;
  mum.carry.food = 3;
  witnessShare(w, mum, other);
  assert.equal(w.tally?.fairnessProtests, 1);
  assert.match(kid.say ?? "", /not fair/);
  assert.ok(kid.needs.hunger < 0.8, "and mum shared with them");
});

test("a small child does not understand death and keeps looking; an older one understands it will not come back", () => {
  const dead = adult("Gran", "f", 1);
  const w = world([]);
  const small = child("Small", 0.6, undefined, undefined, 90);
  const bigger = child("Big", 1.5, undefined, undefined, 91);
  for (const c of [small, bigger]) c.relations.set(dead.id, { affinity: 0.8, trust: 0.8, familiarity: 0.8, lastTogether: 0 });
  onDeathSeenBy(w, dead, small);
  onDeathSeenBy(w, dead, bigger);
  assert.ok(small.journal.some((j) => /keep looking/.test(j.text)));
  assert.ok(bigger.journal.some((j) => /will not come back/.test(j.text)));
  assert.ok((small.emotions?.longing ?? 0) > 0.3);
  assert.ok((bigger.emotions?.despair ?? 0) > 0.1);
  assert.equal(stageName(0.2), "infant");
  assert.equal(stageName(0.8), "small child");
  assert.equal(stageName(2), "child");
  assert.equal(stageName(3), "adolescent");
  assert.equal(stageName(5), "adult");
});

test("parents feed a hungry child with what they have, and go for food when they have none", () => {
  const mum = adult("Mum", "f", 1);
  const kid = child("Kid", 0.9, mum, adult("D", "m", 2), 95);
  kid.needs.hunger = 0.8;
  const w = world([mum, kid]);
  mum.carry.food = 2;
  const out: Parameters<typeof devOptions>[2] = [{ intent: { kind: "forage", x: 0, z: 0, speed: 1, remaining: 5 }, score: 0.5 }];
  devOptions(mum, w, out);
  assert.ok(out.some((o) => o.intent.kind === "share" && o.intent.targetId === kid.id && o.score > 2));
  mum.carry.food = 0;
  const out2: Parameters<typeof devOptions>[2] = [{ intent: { kind: "forage", x: 0, z: 0, speed: 1, remaining: 5 }, score: 0.5 }];
  devOptions(mum, w, out2);
  assert.ok(out2[0]!.score > 0.9, "goes for food");
});

test("a whole young life runs: a family with a baby, in a long run, survives and the child grows through the stages", () => {
  const mum = adult("Mum", "f", 1);
  const dad = adult("Dad", "m", 2, 3, 0);
  const kid = child("Kid", 0.02, mum, dad, 100);
  const w = world([mum, dad, kid], [{ id: "shelter-1", kind: "shelter", x: 4, z: 2, radius: 3, stock: 6 }]);
  for (const p of [mum, dad, kid]) for (const t of w.things) p.memory.set(t.id, { x: t.x, z: t.z, feeling: 0.2, visits: 1, lastSeen: 0 });
  const seen = new Set<string>();
  for (let i = 0; i < 6 * 16 * DAY / 8; i++) {
    for (const p of [mum, dad]) (p.needs.hunger = Math.min(p.needs.hunger, 0.5)), (p.needs.thirst = Math.min(p.needs.thirst, 0.5));
    step(w, 8);
    seen.add(stageName(kid.age));
  }
  assert.ok(kid.health > 0.3, "the child lives");
  assert.ok(seen.has("infant") && seen.has("small child"), [...seen].join());
  assert.ok(kid.dev?.attachment, "attachment formed");
  assert.ok(vocabOf(kid) > 10, `vocab ${vocabOf(kid)}`);
});
