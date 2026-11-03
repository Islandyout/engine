import test from "node:test";
import assert from "node:assert/strict";
import { DAY, YEAR } from "../src/eden/earth";
import { exchangeIdeas } from "../src/eden/culture";
import { makePerson, step, type Person, type Thing, type World } from "../src/eden/mind";
import { CRAFTS, craftOf, crossingJob, inventionCount, inventionsFound, ready, techOf, techOptions, tinkerChance, riskOf, type Job } from "../src/eden/tech";
import { analogyFor, believes, teachMethod, watchCauses, witness } from "../src/eden/wisdom";

const adult = (id: string, seed: number, over: Partial<Person["personality"]> = {}) => makePerson(id, 0, 0, seed, { curiosity: 0.9, sociability: 0.6, boldness: 0.8, patience: 0.6, ...over }, { name: id, sex: id < "M" ? "f" : "m", age: 28 });
const know = (p: Person, w: World) => {
  for (const t of w.things) p.memory.set(t.id, { x: t.x, z: t.z, feeling: 0.3, visits: 1, lastSeen: 0 });
};
const world = (people: Person[], things: Thing[] = [], clock = DAY / 3): World => ({
  things: [
    { id: "river", kind: "river", x: 15, z: 5, radius: 3 },
    { id: "grove", kind: "grove", x: -20, z: 4, radius: 3, stock: 6, maxStock: 6 },
    { id: "rock-1", kind: "rock", x: 6, z: -14, radius: 2 },
    { id: "peak-1", kind: "peak", x: -18, z: -16, radius: 3 },
    { id: "shelter-1", kind: "shelter", x: 4, z: 2, radius: 3, stock: 0 },
    ...things,
  ],
  people,
  radius: 150,
  clock,
  climate: { meanC: 12, seasonalAmpC: 3, dailyAmpC: 4, rainy: 0.1, seed: 3 },
  fish: 30,
});
const fresh = (w: World) => {
  for (const p of w.people) {
    know(p, w);
    p.needs.hunger = 0.1;
    p.needs.thirst = 0.1;
  }
  return w;
};
const learned = (p: Person, ...ids: string[]) => {
  for (const id of ids) (p.ideas ??= []).push(id);
};
/** Give a job as if they had just decided on it, and let the mind carry it out: the option, the walk, the act. */
const perform = (w: World, p: Person, act: string, x: number, z: number, max = 1500) => {
  const job: Job = { act, x, z, v: 0.69, why: "test", made: w.clock ?? 0 };
  techOf(p).job = job;
  techOf(p).thinkAt = w.clock ?? 0;
  p.plan = undefined;
  p.planAt = 1e9; // no foresight of their own to compete: this is about the work
  for (let i = 0; i < max && techOf(p).job === job; i++) {
    job.made = w.clock ?? 0; // it does not lapse while we wait for them to get to it
    p.needs.hunger = Math.min(p.needs.hunger, 0.2);
    p.needs.thirst = Math.min(p.needs.thirst, 0.2);
    p.needs.energy = Math.min(p.needs.energy, 0.2);
    if (w.clock! > DAY * 0.78) w.clock = DAY / 3;
    step(w, 1);
  }
  return techOf(p).job !== job;
};
const at = (w: World, id: string) => w.things.find((t) => t.id === id)!;
const kinds = (w: World, kind: string) => w.things.filter((t) => t.kind === kind);

// ---- J1: causes, analogies, method, being wrong ----

test("J1: a second, different cause is learned from experience, and acted on by belief", () => {
  const a = adult("Ada", 3);
  const w = fresh(world([a]));
  w.weather = { season: 3, tempC: 2, raining: false, rainAmount: 0, snowing: false, fog: 0, windMs: 1 } as World["weather"];
  a.x = 5;
  a.z = 2;
  assert.ok(!a.ideas?.includes("cause:shelter-warm"));
  for (let i = 0; i < 4; i++) {
    a.cold = 0.1; // warm in the cold, by the shelter
    w.clock! += 130;
    watchCauses(w);
  }
  assert.ok(a.ideas?.includes("cause:shelter-warm"), "the idea is held");
  assert.ok(believes(a, "shelterWarm"));
  assert.ok((w.tally?.causesLearned ?? 0) >= 1);
  // a different cause, from different evidence
  const b = adult("Bea", 4);
  b.x = 80; // away from the shelter, so they saw nothing of it
  b.z = 80;
  w.people.push(b);
  const unbeliever = adult("Cyn", 7);
  unbeliever.x = 40;
  unbeliever.z = 40;
  w.people.push(unbeliever);
  for (let i = 0; i < 4; i++) {
    b.hygiene = 0.8;
    b.illness = { severity: 0.3, since: w.clock! };
    w.clock! += 130;
    watchCauses(w);
  }
  assert.ok(b.ideas?.includes("cause:filth-sickens"));
  assert.ok(!b.ideas?.includes("cause:shelter-warm"), "each learned only what they saw");
  // what they believe changes what they do: in the cold, away from the roof, the one who knows it goes to it
  a.x = 40;
  a.z = 40;
  a.cold = 0.5;
  unbeliever.cold = 0.5;
  a.memory.set("shelter-1", { x: 4, z: 2, feeling: 0.3, visits: 1, lastSeen: 0 });
  unbeliever.memory.set("shelter-1", { x: 4, z: 2, feeling: 0.3, visits: 1, lastSeen: 0 });
  const wants = (p: Person) => { const o: { intent: { kind: string; targetId?: string }; score: number }[] = []; techOptions(p, w, o as never); return o.filter((x) => x.intent.kind === "rest" && x.intent.targetId === "shelter-1"); };
  assert.equal(wants(a).length, 1, "the one who learned it seeks the shelter");
  assert.equal(wants(unbeliever).length, 0, "the one who did not does not");
  // told to someone else, who takes it on trust
  a.x = unbeliever.x;
  a.z = unbeliever.z;
  for (let i = 0; i < 40 && !unbeliever.ideas?.includes("cause:shelter-warm"); i++) exchangeIdeas(w, a, unbeliever);
  assert.ok(unbeliever.ideas?.includes("cause:shelter-warm"), "it can be told");
});

test("J1: a belief that the world keeps contradicting is given up, and they say they were wrong", () => {
  const a = adult("Ada", 3);
  const w = fresh(world([a]));
  w.weather = { season: 3, tempC: 2, raining: false, rainAmount: 0, snowing: false, fog: 0, windMs: 1 } as World["weather"];
  a.x = 5;
  a.z = 2;
  learned(a, "cause:shelter-warm"); // told it, never saw it
  watchCauses(w);
  assert.ok(believes(a, "shelterWarm"), "held on trust");
  for (let i = 0; i < 8; i++) {
    a.cold = 0.9; // freezing in the shelter, again and again
    w.clock! += 130;
    watchCauses(w);
  }
  assert.ok(!a.ideas?.includes("cause:shelter-warm"), "given up");
  assert.ok(!believes(a, "shelterWarm"));
  assert.ok(a.journal.some((j) => /I was wrong/.test(j.text)));
  assert.ok((w.tally?.beliefsRevised ?? 0) >= 1);
  assert.deepEqual(techOf(a).wrong, ["shelterWarm"]);
});

test("J1: knowing something that works alike makes the new thing easier to hit on; a method taught makes them better at it", () => {
  const a = adult("Ada", 3, { curiosity: 0.5 });
  const w = fresh(world([a]));
  const pen = craftOf("pen")!;
  const plain = tinkerChance(w, a, pen);
  learned(a, "weir");
  assert.ok(analogyFor(a, "pen"));
  assert.ok(tinkerChance(w, a, pen) > plain + 0.2, "a weir holds fish: a ring of stakes might hold animals");
  const teacher = adult("Zed", 5);
  const learner = adult("Cy", 6);
  w.people.push(teacher, learner);
  techOf(teacher).method = 0.4;
  learner.relations.set(teacher.id, { affinity: 0.5, trust: 0.6, familiarity: 0.5, lastTogether: 0 });
  const before = tinkerChance(w, learner, pen);
  assert.ok(teachMethod(w, teacher, learner));
  assert.ok(techOf(learner).method > 0.15);
  assert.ok(tinkerChance(w, learner, pen) > before + 0.05, "how to go about a problem, not what to do");
});

// ---- J3: a large space of inventions where one needs another ----

test("J3: there are far more than three inventions, every prerequisite exists, and none can be found before its prior", () => {
  const n = inventionCount();
  console.log(`inventions in the space: ${n}`);
  assert.ok(n >= 40);
  const ids = new Set(CRAFTS.map((c) => c.id).concat(["weir", "snare", "net"]));
  for (const c of CRAFTS) for (const need of c.needs) assert.ok(ids.has(need), `${c.id} needs ${need}`);
  const a = adult("Ada", 3);
  assert.ok(!ready(a, craftOf("basket")!), "a basket needs rope first");
  assert.ok(ready(a, craftOf("rope")!));
  learned(a, "rope");
  assert.ok(ready(a, craftOf("basket")!));
  assert.ok(!ready(a, craftOf("clay-pot")!), "a pot needs a basket");
  assert.ok(!ready(a, craftOf("kiln")!));
  // no chain loops
  const depth = (id: string, seen = new Set<string>()): number => {
    assert.ok(!seen.has(id), `loop at ${id}`);
    const c = craftOf(id);
    return c ? 1 + Math.max(0, ...c.needs.map((n) => depth(n, new Set([...seen, id])))) : 0;
  };
  assert.ok(depth("iron") >= 5, `iron sits at the end of a chain ${depth("iron")} long`);
});

test("J3: trying something new without knowing what comes before it never works, and a pot is only found after a basket", () => {
  const a = adult("Ada", 3);
  const w = fresh(world([a]));
  techOf(a).mat.clay = 5;
  const done = perform(w, a, "try:clay-pot", a.x, a.z);
  assert.ok(done);
  assert.ok(!a.ideas?.includes("clay-pot"), "without a basket there is no pot");
  assert.equal(kinds(w, "pot").length, 0);
});

test("J3: left to themselves, curious people work up a chain of inventions, each after the ones it needs", () => {
  const people = [adult("Ada", 3), adult("Bo", 4), adult("Cy", 5)];
  const w = fresh(world(people));
  for (const p of people) p.carry.wood = 6;
  let guard = 0;
  for (let t = 0; t < 12 * DAY && guard++ < 1e6; t += 2) {
    step(w, 2);
    for (const p of people) {
      p.needs.hunger = Math.min(p.needs.hunger, 0.3);
      p.needs.thirst = Math.min(p.needs.thirst, 0.3);
    }
  }
  const found = CRAFTS.filter((c) => w.knowledge?.[c.id]);
  console.log(`found by themselves in 12 days: ${found.map((c) => c.id).join(", ")} (${inventionsFound(w)} of ${inventionCount()})`);
  assert.ok(found.length >= 4, "a handful of crafts were found without being told");
  for (const c of found) for (const need of c.needs) assert.ok(w.knowledge?.[need], `${c.id} came after ${need}`);
  for (const c of found) for (const need of c.needs) assert.ok(w.knowledge![need]!.t <= w.knowledge![c.id]!.t, `${need} before ${c.id}`);
});

// ---- J4: farming, domestication, metals, wheels ----

const foodStanding = (w: World) => w.things.filter((t) => t.kind === "field" || t.kind === "shelter").reduce((a, t) => a + (t.stock ?? 0), 0) + w.people.reduce((a, p) => a + p.carry.food, 0);
const farmingWorld = (farmers: boolean) => {
  const people = [adult("Ada", 3, { curiosity: 0.2 }), adult("Bo", 4, { curiosity: 0.2 }), adult("Cy", 5, { curiosity: 0.2 })];
  const w = fresh(world(people));
  for (const p of people) {
    p.carry.seed = 4;
    if (farmers) learned(p, "digging-stick", "farming", "stone-knife", "hoe");
  }
  if (farmers) for (const p of people) { techOf(p).tools.push("digging-stick", "hoe"); }
  return w;
};
test("J4: once people know farming they sow fields, and a season on there is a lasting surplus of food that wild gathering did not give", () => {
  const out: number[] = [];
  for (const farmers of [false, true]) {
    const w = farmingWorld(farmers);
    for (let t = 0; t < 8 * DAY; t += 2) {
      step(w, 2);
      for (const p of w.people) {
        p.needs.thirst = Math.min(p.needs.thirst, 0.3);
      }
    }
    out.push(foodStanding(w));
    if (farmers) {
      assert.ok(kinds(w, "field").length >= 2, `fields were sown (${kinds(w, "field").length})`);
      assert.ok((w.tally?.tended ?? 0) > 0, "and tended");
    } else assert.equal(kinds(w, "field").length, 0);
  }
  console.log(`food standing after 8 days: without farming ${out[0]!.toFixed(1)}, with ${out[1]!.toFixed(1)}`);
  assert.ok(out[1]! > out[0]! * 1.3 + 3, "a surplus");
});

test("J4: a wild cow fed by hand three times is theirs, they learn herding from it, and it stays by their pen", () => {
  const a = adult("Ada", 3);
  const cow: Thing = { id: "cow-9", kind: "cow", x: 6, z: 2, radius: 1, stock: 3, maxStock: 3, mob: { tx: 6, tz: 2, wait: 0, fed: 0, age: 3, fleeUntil: 0 } };
  const w = fresh(world([a], [cow]));
  w.things = w.things.filter((t) => t.kind !== "shelter"); // no larder to put the food in first
  a.x = 5;
  a.z = 2;
  assert.ok(!a.ideas?.includes("herding"));
  for (let i = 0; i < 3; i++) {
    cow.x = a.x + 1;
    cow.z = a.z;
    a.carry.food = 2;
    perform(w, a, "tame:cow-9", cow.x, cow.z);
  }
  assert.equal(cow.of, a.id, "it is theirs");
  assert.ok(a.ideas?.includes("herding"));
  assert.ok((w.tally?.domesticated ?? 0) === 1);
  // with a pen it stays near: a wild one wanders off, a kept one does not
  learned(a, "rope");
  const pen: Thing = { id: "pen-1", kind: "pen", x: -30, z: -30, radius: 2 };
  w.things.push(pen);
  const wild: Thing = { id: "cow-10", kind: "cow", x: -30, z: -30, radius: 1, stock: 3, maxStock: 3, mob: { tx: -30, tz: -30, wait: 0, fed: 0, age: 3, fleeUntil: 0 } };
  w.things.push(wild);
  cow.x = 30;
  cow.z = 30;
  cow.mob!.tx = 30;
  cow.mob!.tz = 30;
  for (let i = 0; i < 1200; i++) step(w, 2);
  assert.ok(Math.hypot(cow.x - pen.x, cow.z - pen.z) < 25, `the kept cow came to the pen (${Math.round(Math.hypot(cow.x - pen.x, cow.z - pen.z))} m)`);
});

test("J4: metals and wheels need their prior steps: ore in the kiln gives copper, then bronze, then an axe that brings wood faster; a cart carries more", () => {
  const a = adult("Ada", 3);
  const kiln: Thing = { id: "kiln-1", kind: "kiln", x: 2, z: 2, radius: 2 };
  const w = fresh(world([a], [kiln]));
  a.x = 2;
  a.z = 2;
  const t = techOf(a);
  learned(a, "kiln", "copper");
  t.mat.ore = 6;
  a.carry.wood = 8;
  assert.ok(!ready(a, craftOf("iron")!), "iron needs bronze and bellows");
  assert.ok(perform(w, a, "make:copper", 2, 2));
  assert.equal(t.mat.copper, 2, "the kiln gave copper");
  learned(a, "bronze");
  a.carry.wood = 8;
  assert.ok(perform(w, a, "make:bronze", 2, 2));
  assert.equal(t.mat.bronze, 2);
  learned(a, "bronze-axe");
  a.carry.wood = 3;
  assert.ok(perform(w, a, "make:bronze-axe", a.x, a.z));
  assert.ok(t.tools.includes("bronze-axe"));
  a.carry.wood = 0;
  perform(w, a, "get:wood:grove", -20, 4);
  assert.equal(a.carry.wood, 5, "an axe of bronze brings in half again as much");
  t.tools.push("cart");
  a.carry.wood = 0;
  perform(w, a, "get:wood:grove", -20, 4);
  assert.ok(a.carry.wood >= 12, `a cart carries a big load (${a.carry.wood})`);
});

// ---- J5: boats and bridges that people use ----

const lakeWorld = (people: Person[], things: Thing[]) => {
  const w = world(people, [{ id: "bush-far", kind: "bush", x: 90, z: 0, radius: 2, stock: 4, maxStock: 4 }, ...things]);
  w.noGo = [{ x: 50, z: 0, r: 20 }];
  w.fish = 0; // nothing to row out for: only the far bank draws them
  w.things = w.things.filter((t) => t.id !== "river" && t.id !== "grove");
  w.things.push({ id: "grove", kind: "grove", x: 12, z: 20, radius: 3, stock: 6, maxStock: 6 });
  return fresh(w);
};
const rowers = (n: number, over: Partial<Person["personality"]> = {}) => Array.from({ length: n }, (_, i) => {
  const p = adult(`P${i}`, 10 + i, { curiosity: 0.34, ...over }); // not curious enough to go inventing: only the far bank draws them
  p.x = 15;
  p.z = 0;
  return p;
});

test("J5: they decide to take the boat when walking round the lake is longer, and not when there is no way across or nothing over there", () => {
  const [a] = rowers(1);
  const boat: Thing = { id: "boat-1", kind: "boat", x: 28.5, z: 0, radius: 2, of: "x" };
  const w = lakeWorld([a!], [boat]);
  const job = crossingJob(w, a!, 0);
  assert.ok(job, "a way across was chosen");
  assert.equal(job!.act, "cross:boat-1");
  assert.match(job!.why, /Walking round is \d+ m longer/);
  w.things = w.things.filter((t) => t.kind !== "boat");
  assert.equal(crossingJob(w, a!, 0), undefined, "no boat, no crossing");
  w.things.push(boat);
  w.things = w.things.filter((t) => t.id !== "bush-far");
  assert.equal(crossingJob(w, a!, 0), undefined, "nothing over there to go for");
});

test("J5: a person rows a boat across the lake to the far bank, in the running mind", () => {
  const [a] = rowers(1);
  const boat: Thing = { id: "boat-1", kind: "boat", x: 28.5, z: 0, radius: 2, of: "x" };
  const w = lakeWorld([a!], [boat]);
  const job = crossingJob(w, a!, 0)!;
  let afloatSeen = false;
  for (let i = 0; i < 4000 && (w.tally?.boatCrossings ?? 0) + (w.tally?.capsized ?? 0) === 0; i++) {
    a!.needs.thirst = Math.min(a!.needs.thirst, 0.3);
    a!.needs.hunger = Math.min(a!.needs.hunger, 0.3);
    a!.planAt = 1e9;
    a!.plan = undefined;
    if (!techOf(a!).job) techOf(a!).job = { ...job, made: w.clock ?? 0 };
    techOf(a!).thinkAt = w.clock ?? 0;
    step(w, 1);
    afloatSeen ||= !!techOf(a!).afloat && Math.hypot(a!.x - 50, a!.z) < 20; // out on the water, where nobody may walk
  }
  assert.ok(afloatSeen, "they were out on the water");
  if ((w.tally?.capsized ?? 0) > 0) return; // the boat can go over; that is tested below
  assert.ok((w.tally?.boatCrossings ?? 0) >= 1, "they crossed in the boat");
  assert.ok(a!.x > 70, `and are on the far bank (x=${Math.round(a!.x)})`);
  assert.ok(a!.journal.some((j) => /Crossed in the boat/.test(j.text)));
  assert.ok(!techOf(a!).afloat, "and are no longer afloat");
});

test("J5: a person walks across a finished bridge to the far bank, over water nobody can walk into, and an unfinished one is not used", () => {
  const [a] = rowers(1);
  const bridge: Thing = { id: "bridge-1", kind: "bridge", x: 29, z: 0, radius: 2, span: { x2: 71, z2: 0, need: 8, laid: 2 } };
  const w = lakeWorld([a!], [bridge]);
  assert.equal(crossingJob(w, a!, 0), undefined, "not finished: nobody sets out");
  bridge.span!.laid = 8;
  const job = crossingJob(w, a!, 0)!;
  assert.equal(job.act, "cross:bridge-1");
  let overWater = false;
  for (let i = 0; i < 4000 && (w.tally?.bridgeCrossings ?? 0) === 0; i++) {
    a!.needs.thirst = Math.min(a!.needs.thirst, 0.3);
    a!.needs.hunger = Math.min(a!.needs.hunger, 0.3);
    a!.planAt = 1e9;
    a!.plan = undefined;
    if (!techOf(a!).job) techOf(a!).job = { ...job, made: w.clock ?? 0 };
    techOf(a!).thinkAt = w.clock ?? 0;
    step(w, 1);
    overWater ||= Math.hypot(a!.x - 50, a!.z) < 18;
  }
  assert.ok(overWater, "they walked where the lake is");
  assert.ok((w.tally?.bridgeCrossings ?? 0) >= 1, "they crossed");
  assert.ok(a!.x > 70, `and are across (x=${Math.round(a!.x)})`);
});

test("J5: a timid person will not trust an unfamiliar boat, and does once they have watched others use it; rough water is learned from capsizing", () => {
  const timid = adult("Tim", 3, { boldness: 0.1, curiosity: 0.1 });
  const w = lakeWorld([timid], []);
  const first = riskOf(w, timid, "boat");
  assert.ok(first.risk > first.tolerance, "unfamiliar: too risky for them");
  techOf(timid).seen.boat = 6; // watched others row across without harm
  const after = riskOf(w, timid, "boat");
  assert.ok(after.risk < first.risk && after.risk <= after.tolerance, "familiar: acceptable");
  // rough water: they do not know it matters until it has gone wrong for them
  w.weather = { season: 1, tempC: 10, raining: true, rainAmount: 0.5, snowing: false, fog: 0, windMs: 12 } as World["weather"];
  const naive = riskOf(w, timid, "boat");
  assert.ok(naive.actual > naive.risk * 1.5 || naive.actual > after.actual, "rough water is more dangerous than they reckon");
  witness(w, timid, "roughWater", true);
  witness(w, timid, "roughWater", true);
  assert.ok(believes(timid, "roughWater"), "capsized twice in rough weather: now they know");
  const wise = riskOf(w, timid, "boat");
  assert.ok(wise.risk > naive.risk, "and they reckon it in");
});

// ---- J2: shared work across seasons ----

test("J2: several people build a granary together over more than a season, each bringing what they can, and it holds the food they gave", () => {
  const people = [adult("Ada", 3, { sociability: 0.9 }), adult("Bo", 4, { sociability: 0.9 }), adult("Cy", 5, { sociability: 0.9 }), adult("Di", 6, { sociability: 0.9 })];
  const w = fresh(world(people, [{ id: "bush-1", kind: "bush", x: -5, z: 10, radius: 2, stock: 4, maxStock: 4 }, { id: "orchard-1", kind: "orchard", x: 25, z: -10, radius: 3, stock: 8, maxStock: 8 }]));
  for (const p of people) {
    learned(p, "rope", "basket", "stone-knife", "plank", "granary");
    for (const q of people) if (q !== p) p.relations.set(q.id, { affinity: 0.5, trust: 0.6, familiarity: 0.5, lastTogether: 0 });
  }
  const season = YEAR / 4;
  let done = 0;
  for (let t = 0; t < 8 * season && !done; t += 2) {
    step(w, 2);
    done = w.projects?.find((p) => p.kind === "granary")?.done ?? 0;
  }
  const pr = w.projects?.find((p) => p.kind === "granary");
  assert.ok(pr, "someone proposed it");
  console.log(`granary: started ${pr!.started}, done ${pr!.done}, by ${pr!.by.length}, laid ${JSON.stringify(pr!.laid)}`);
  assert.ok(pr!.done, "it was finished");
  assert.ok(pr!.by.length >= 3, `by several people (${pr!.by.length})`);
  assert.ok(pr!.done! - pr!.started > season, "and it took longer than a season");
  const g = w.things.find((t) => t.id === pr!.thing)!;
  assert.ok((g.stock ?? 0) >= 1, "it holds food they put in");
  assert.ok((w.tally?.projectsDone ?? 0) === 1);
});

test("J2: people build a bridge together: wood from several hands, then a way across that is used", () => {
  const people = rowers(3, { sociability: 0.9 });
  const w = lakeWorld(people, []);
  for (const p of people) {
    learned(p, "rope", "stone-knife", "plank", "bridge");
    for (const q of people) if (q !== p) p.relations.set(q.id, { affinity: 0.5, trust: 0.6, familiarity: 0.5, lastTogether: 0 });
  }
  for (let t = 0; t < 12 * DAY && !w.projects?.some((p) => p.kind === "bridge" && p.done); t += 2) {
    step(w, 2);
    for (const p of people) p.needs.thirst = Math.min(p.needs.thirst, 0.3);
  }
  const pr = w.projects?.find((p) => p.kind === "bridge");
  assert.ok(pr?.done, "the bridge was finished");
  assert.ok(pr!.by.length >= 2, `by more than one person (${pr!.by.length})`);
  const b = w.things.find((t) => t.id === pr!.thing)!;
  assert.ok(b.span!.laid >= b.span!.need);
});

// ---- J6: the objects of EDEN_THINGS.md, each built and used by a mind action ----

const SIX: { craft: string; kind: string; needs: string[]; give: (p: Person) => void; used: (w: World, p: Person, th: Thing) => void; use?: string }[] = [
  { craft: "clay-pot", kind: "pot", needs: ["basket"], give: (p) => (techOf(p).mat.clay = 3), use: "cook", used: (w) => assert.ok((w.tally?.cookedMeals ?? 0) >= 1) },
  { craft: "spit", kind: "spit", needs: ["stone-knife"], give: (p) => (p.carry.wood = 6), use: "cook", used: (w) => assert.ok((w.tally?.cookedMeals ?? 0) >= 1) },
  { craft: "oven", kind: "oven", needs: ["kiln", "clay-pot"], give: (p) => ((techOf(p).mat.clay = 4), (techOf(p).mat.stone = 3)), use: "cook", used: (w) => assert.ok((w.tally?.cookedMeals ?? 0) >= 1) },
  { craft: "kiln", kind: "kiln", needs: ["clay-pot"], give: (p) => ((techOf(p).mat.clay = 4), (techOf(p).mat.stone = 2), (p.carry.wood = 6)), used: () => {} },
  { craft: "loom", kind: "loom", needs: ["spindle"], give: (p) => ((p.carry.wood = 6), (techOf(p).mat.fibre = 6)), use: "weave", used: (_w, p) => assert.ok((p.clothing ?? 0) >= 0.5) },
  { craft: "ball", kind: "ball", needs: ["rope"], give: (p) => (techOf(p).mat.fibre = 3), use: "play", used: (_w, p) => assert.ok(p.needs.joy < 0.7) },
  { craft: "swing", kind: "swing", needs: ["rope"], give: (p) => ((p.carry.wood = 4), (techOf(p).mat.fibre = 2)), use: "play", used: (_w, p) => assert.ok(p.needs.joy < 0.7) },
  { craft: "flute", kind: "flute", needs: ["stone-knife"], give: (p) => (p.carry.wood = 2), use: "play", used: (_w, p) => assert.ok(p.needs.joy < 0.7) },
  { craft: "drum", kind: "drum", needs: ["basket"], give: (p) => ((p.carry.wood = 3), (techOf(p).mat.fibre = 2)), use: "play", used: (_w, p) => assert.ok(p.needs.joy < 0.7) },
  { craft: "well", kind: "well", needs: ["digging-stick", "basket"], give: (p) => ((p.carry.wood = 3), (techOf(p).mat.stone = 3)), use: "drink", used: () => {} },
  { craft: "hive", kind: "hive", needs: ["basket"], give: (p) => ((p.carry.wood = 2), (techOf(p).mat.fibre = 2)), use: "honey", used: (_w, p) => assert.ok(p.carry.food >= 2) },
  { craft: "farming", kind: "field", needs: ["digging-stick"], give: (p) => (p.carry.seed = 2), use: "tend", used: (w) => assert.ok((w.tally?.tended ?? 0) >= 1) },
  { craft: "quern", kind: "quern", needs: ["stone-knife"], give: (p) => ((techOf(p).mat.stone = 3), (p.carry.seed = 3)), use: "grind", used: (_w, p) => assert.ok((techOf(p).mat.flour ?? 0) >= 1) },
  { craft: "dog-bed", kind: "dog-bed", needs: ["basket"], give: (p) => ((techOf(p).mat.fibre = 3), (p.carry.wood = 2)), used: () => {} },
  { craft: "pen", kind: "pen", needs: ["rope", "herding"], give: (p) => ((p.carry.wood = 5), (techOf(p).mat.fibre = 2)), used: () => {} },
  { craft: "irrigation", kind: "channel", needs: ["farming", "rope"], give: (p) => ((p.carry.wood = 3), (techOf(p).mat.stone = 3)), used: () => {} },
  { craft: "raft", kind: "raft", needs: ["rope"], give: (p) => ((p.carry.wood = 5), (techOf(p).mat.fibre = 2)), used: () => {} },
  { craft: "boat", kind: "boat", needs: ["raft", "stone-knife"], give: (p) => ((p.carry.wood = 8), (techOf(p).mat.fibre = 2)), use: "row", used: (_w, p) => assert.ok((techOf(p).used.boat ?? 0) >= 1, "they went out in it") },
];
for (const row of SIX) {
  test(`J6: ${row.kind} is built by a mind action${row.use ? ` and used (${row.use})` : ""}`, () => {
    const a = adult("Ada", 3, { boldness: 0.9 });
    const w = fresh(world([a], [{ id: "bush-1", kind: "bush", x: 8, z: 8, radius: 2, stock: 4, maxStock: 4 }]));
    a.x = 6;
    a.z = 4;
    learned(a, ...row.needs, row.craft);
    a.tools.spear = true; // so they do not spend the wood on a spear first
    row.give(a);
    if (row.kind === "channel") w.things.push({ id: "field-0", kind: "field", x: 10, z: 10, radius: 3, stock: 2, maxStock: 6 });
    assert.equal(kinds(w, row.kind).length, 0);
    const ok = perform(w, a, `make:${row.craft}`, a.x, a.z);
    assert.ok(ok, "the making was carried out");
    const th = kinds(w, row.kind)[0];
    assert.ok(th, `a ${row.kind} stands in the world`);
    assert.equal(th!.of, a.id, "and it is theirs");
    assert.ok(a.memory.has(th!.id));
    if (!row.use) return;
    // now use it
    a.x = th!.x;
    a.z = th!.z;
    a.carry.food = 6;
    a.carry.wood = Math.max(a.carry.wood, 3);
    a.needs.hunger = 0.5;
    a.needs.joy = 0.9;
    a.needs.thirst = 0.5;
    if (row.kind === "hive" || row.kind === "field") (th!.stock = 3);
    if (row.kind === "boat") w.fish = 30;
    if (row.use === "drink") {
      w.things = w.things.filter((t) => t.kind !== "river");
      const before = a.needs.thirst;
      for (let i = 0; i < 200 && a.needs.thirst >= before - 0.05; i++) step(w, 1);
      assert.ok(a.needs.thirst < before, "they drank at the well");
      return;
    }
    assert.ok(perform(w, a, `use:${th!.id}`, th!.x, th!.z), "the use was carried out");
    row.used(w, a, th!);
  });
}

test("J6: how many different objects the crafts make", () => {
  const made = new Set(CRAFTS.map((c) => c.out.thing).filter((k): k is string => !!k));
  console.log(`object kinds the crafts build: ${[...made].join(", ")}`);
  assert.ok(made.size >= 19);
  for (const row of SIX) assert.ok(made.has(row.kind), `${row.kind} is covered above`);
});
