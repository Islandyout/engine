import test from "node:test";
import assert from "node:assert/strict";
import { DAY } from "../src/eden/earth";
import { INVENTIONS } from "../src/eden/culture";
import { doInvent, foresee, planOptions, secsToDark, secsToWinter, worksNow } from "../src/eden/reason";
import { exchangeIdeas } from "../src/eden/culture";
import { makePerson, step, type Person, type Thing, type World } from "../src/eden/mind";

const adult = (id: string, seed: number, over: Partial<Person["personality"]> = {}) => makePerson(id, 0, 0, seed, { curiosity: 0.9, sociability: 0.6, ...over }, { name: id, sex: id < "M" ? "f" : "m", age: 28 });
const known = (p: Person, w: World) => {
  for (const t of w.things) p.memory.set(t.id, { x: t.x, z: t.z, feeling: 0.3, visits: 1, lastSeen: 0 });
};
const world = (people: Person[], things: Thing[] = []): World => ({
  things: [{ id: "river", kind: "river", x: 15, z: 5, radius: 3 }, { id: "grove", kind: "grove", x: -30, z: 4, radius: 3, stock: 6, maxStock: 6 }, { id: "shelter-1", kind: "shelter", x: 4, z: 2, radius: 3, stock: 0 }, ...things],
  people,
  radius: 120,
  clock: DAY / 3,
  climate: { meanC: 8, seasonalAmpC: 3, dailyAmpC: 4, rainy: 0.1, seed: 3 },
  fish: 30,
});
/** The clock a number of hours before dark on the first day. */
const hoursBeforeDark = (h: number) => {
  const w = world([]);
  for (let c = 12 * 60; c < DAY; c += 10) {
    w.clock = c;
    if (secsToDark(w) <= h * 60) return c;
  }
  throw new Error("no dusk");
};

test("they know how long until dark and until winter", () => {
  const w = world([]);
  w.clock = hoursBeforeDark(2);
  assert.ok(secsToDark(w) <= 120 && secsToDark(w) > 60, `dark in about two world hours (${secsToDark(w)} s)`);
  w.clock = 0;
  assert.ok(secsToWinter(w) > 10 * DAY);
});

test("before a cold night they work out, with times and distances, to fetch wood and light a fire, and then do it before dark", () => {
  const a = adult("Ada", 3);
  const w = world([a]);
  known(a, w);
  a.x = 10;
  a.z = 0;
  a.needs.hunger = 0.1;
  a.needs.thirst = 0.1;
  w.clock = hoursBeforeDark(2);
  w.weather = { season: 2, tempC: 6, raining: false, rainAmount: 0, snowing: false, fog: 0, windMs: 1 } as World["weather"];
  const plan = foresee(w, a)!;
  assert.ok(plan, "a plan was made");
  assert.equal(plan.goal, "a fire for the night");
  assert.match(plan.why, /m off/);
  assert.equal(plan.steps.at(-1)!.act, "fire");
  assert.ok(plan.steps.some((s) => s.act === "gather"));
  let fire = false;
  const dark = w.clock + secsToDark(w);
  for (let t = 0; t < 400 && w.clock < dark + 200 && !fire; t += 2) {
    step(w, 2);
    fire = w.things.some((x) => x.kind === "campfire" && (x.fuel ?? 0) > 0);
  }
  assert.ok(fire, "a fire was burning");
  assert.ok(w.clock < dark + 200);
  assert.ok((w.tally?.plans ?? 0) >= 1);
});

test("in summer, with a thin larder and winter coming, they plan trips to the food and the larder", () => {
  const a = adult("Ada", 3);
  const w = world([a]);
  known(a, w);
  a.needs.hunger = 0.1;
  w.clock = DAY * 2 + 9 * 60;
  w.weather = { season: 1, tempC: 22, raining: false, rainAmount: 0, snowing: false, fog: 0, windMs: 1 } as World["weather"];
  const plan = foresee(w, a)!;
  assert.ok(plan, "a plan was made");
  assert.equal(plan.goal, "a full larder for winter");
  assert.match(plan.why, /Winter in/);
  assert.deepEqual(plan.steps.map((s) => s.act).slice(0, 2), ["forage", "stash"]);
});

test("an experiment with the right stuff in the right place finds something new, which is then used and taught; a wrong one is not repeated", () => {
  const a = adult("Ada", 3);
  const b = adult("Zed", 5);
  const w = world([a, b]);
  known(a, w);
  const joy = () => undefined;
  const mk = (wood: number, hide: number, place: "water" | "prey") => ({ act: "invent" as const, x: 0, z: 0, hyp: { wood, hide, place }, label: "try" });
  a.carry.wood = 6;
  a.plan = { goal: "g", why: "w", steps: [mk(2, 0, "prey")], made: 0, deadline: 1e9, secs: 100, stepAt: 0 };
  doInvent(w, a, joy);
  assert.ok(!a.ideas?.length, "a wrong guess finds nothing");
  assert.ok(a.tried?.includes("2w0h@prey"));
  a.carry.wood = 6;
  a.plan = { goal: "g", why: "w", steps: [mk(4, 0, "water")], made: 0, deadline: 1e9, secs: 100, stepAt: 0 };
  doInvent(w, a, joy);
  assert.ok(a.ideas?.includes("weir"));
  assert.ok(w.knowledge?.weir);
  assert.ok(w.things.some((t) => t.kind === "weir"));
  assert.ok(w.chronicle?.some((c) => c.text.includes("weir")));
  for (let i = 0; i < 60 && !b.ideas?.includes("weir"); i++) exchangeIdeas(w, a, b);
  assert.ok(b.ideas?.includes("weir"), "the idea spread by talk");
  assert.equal(INVENTIONS.length, 3);
});

test("a weir fills only while there are fish, a snare only while game is near", () => {
  const w = world([], [{ id: "wr", kind: "weir", x: 15, z: 5, radius: 2, stock: 0, maxStock: 3 }, { id: "sn", kind: "snare", x: 50, z: 50, radius: 2, stock: 0, maxStock: 3 }]);
  const weir = w.things.find((t) => t.id === "wr")!;
  const snare = w.things.find((t) => t.id === "sn")!;
  assert.ok(worksNow(w, weir));
  w.fish = 0;
  assert.ok(!worksNow(w, weir));
  assert.ok(!worksNow(w, snare), "no game near");
  w.things.push({ id: "deer", kind: "deer", x: 60, z: 50, radius: 1 });
  assert.ok(worksNow(w, snare));
});

test("a curious person short of food, with wood and no known remedy, plans an experiment", () => {
  const a = adult("Ada", 3);
  const w = world([a]);
  known(a, w);
  a.needs.hunger = 0.1;
  a.carry.wood = 6;
  w.things.push({ id: "deer1", kind: "deer", x: 25, z: 20, radius: 2 });
  known(a, w);
  w.clock = DAY * 2 + 9 * 60;
  w.weather = { season: 1, tempC: 22, raining: false, rainAmount: 0, snowing: false, fog: 0, windMs: 1 } as World["weather"];
  w.things.find((t) => t.id === "grove")!.stock = 0; // nothing to forage, so the larder plan has no source
  const out: Parameters<typeof planOptions>[2] = [];
  planOptions(a, w, out);
  assert.ok(a.plan, "something is in mind");
  assert.equal(a.plan!.goal, "a better way to get food");
  assert.equal(out[0]!.intent.kind, "invent");
});

test("asked what they are doing, they say what they have worked out", async () => {
  const { answerWalker } = await import("../src/eden/chat");
  const a = adult("Ada", 3);
  const w = world([a]);
  a.plan = { goal: "a fire for the night", why: "Dark in 2.0 hours.", steps: [{ act: "gather", x: 1, z: 1, label: "fetch wood from grove (30 m)" }, { act: "fire", x: 0, z: 0, label: "light the fire at camp" }], made: 0, deadline: 1e9, secs: 100, stepAt: 0 };
  const reply = answerWalker(w, a, "What are you planning?", () => 0.1).reply;
  assert.match(reply, /Dark in 2.0 hours/);
  assert.match(reply, /fetch wood/);
});
