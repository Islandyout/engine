import test from "node:test";
import assert from "node:assert/strict";
import { DAY, YEAR } from "../src/eden/earth";
import { adultHeightCm, birthComplication, bodyBias, bodyOf, bodySpeed, bodyStep, customiseWalker, fertilityOf, heightCm, hearingOf, infectBed, muscleOf, sightFactor, sleepDebt, stillbirthExtra, walkerAge, walkerBodyOf, walkerDeed, walkerDrink, walkerEat, walkerHurt, walkerRepute, walkerSpeed, walkerRest, walkerStep } from "../src/eden/body";
import { _testing, climateDrift, enableWorld2, fireDanger, giftToSettlement, herdOf, livestockOptions, tameLivestock, travelDays, world2Step, type Geo, type World2 } from "../src/eden/world2";
import { giveBirth, make, makePerson, step, type Person, type Thing, type World } from "../src/eden/mind";
import { worldFromJson, worldToJson } from "../src/eden/persist";
import { lifeOf } from "../src/eden/lifecycle";

const person = (id: string, age = 25, sex: "m" | "f" = "m", x = 0, z = 0) => makePerson(id, x, z, id.length * 31 + 7, {}, { name: id, sex, age });
const shelter = (stock = 10): Thing => ({ id: "shelter-0", kind: "shelter", x: 0, z: 0, radius: 3, stock, maxStock: 12 });
const world = (people: Person[], extra: Thing[] = []): World => ({
  things: [shelter(), { id: "grove", kind: "grove", x: 10, z: 0, radius: 3, stock: 8, maxStock: 8 }, { id: "river", kind: "river", x: 0, z: 10, radius: 3 }, ...extra],
  people,
  radius: 36,
  clock: DAY / 3,
  climate: { meanC: 14, seasonalAmpC: 9, dailyAmpC: 5, rainy: 0.3, seed: 7 },
});
const advance = (w: World, seconds: number, dt = 60) => {
  for (let t = 0; t < seconds; t += dt) {
    w.clock = (w.clock ?? 0) + dt;
    world2Step(w, dt);
  }
};
const folk = (n: number) => Array.from({ length: n }, (_, i) => person(`P${i}`, 25, i % 2 ? "f" : "m"));
const tally = (w: World, k: string) => w.tally?.[k] ?? 0;
const calm = (w2: World2) => {
  for (const s of w2.settlements) {
    s.temper = 0;
    s.attitude = 0.5;
    s.pop = 20;
    s.fertility = 0.9;
  }
};
const hotDry = (w: World) => {
  w.weather = { tempC: 31, raining: false, season: 1, seasonProgress: 0.5, windMs: 7, windDir: 0, rainAmount: 0, fog: 0, snowing: false, dayOfYear: 6 };
};

// ---------------- I1: other settlements ----------------

test("the wider world is off until asked for, then has settlements placed on reachable ground", () => {
  const w = world(folk(3));
  assert.equal(w.world2, undefined);
  world2Step(w, 60);
  assert.equal(w.world2, undefined, "stepping must not turn it on");
  const w2 = enableWorld2(w, 5);
  assert.equal(w2.settlements.length, 3);
  assert.equal(enableWorld2(w, 99), w2, "a second call changes nothing");
  for (const s of w2.settlements) {
    assert.ok(Number.isFinite(travelDays(w2.geo, s, { x: 0, z: 0 })), `${s.name} is in the sea`);
    assert.ok(s.pop >= 12);
  }
  assert.throws(() => enableWorld2(world([]), 1, 0), /settlements must be/);
});

test("geography lengthens journeys: mountains and a river slow the walk, and the sea cannot be walked into", () => {
  const geo: Geo = { mountains: [{ x: 1000, z: 0, r: 300 }], sea: { nx: 0, nz: 1, d: 3000 }, river: { x0: 4000, z0: -500, x1: 4000, z1: 500 } };
  const plain = travelDays(geo, { x: 0, z: 0 }, { x: 0, z: -2000 });
  const overMountain = travelDays(geo, { x: 0, z: 0 }, { x: 2000, z: 0 });
  assert.ok(Math.abs(plain - 2000 / 2500) < 1e-9);
  assert.ok(overMountain > (2000 / 2500) * 2, `${overMountain}`);
  assert.ok(travelDays(geo, { x: 0, z: 0 }, { x: 5000, z: 0 }) > 5000 / 2500 + 0.39, "the river costs time");
  assert.equal(travelDays(geo, { x: 0, z: 0 }, { x: 0, z: 3500 }), Infinity);
});

test("a friendly settlement trades with the camp: food goes out, hides and seed come in, and they grow friendlier", () => {
  const w = world(folk(3));
  const w2 = enableWorld2(w, 3);
  calm(w2);
  advance(w, 25 * DAY);
  assert.ok(tally(w, "settlementTrades") >= 1, "no trading party came");
  assert.ok(w.people.some((p) => (p.carry.hide ?? 0) >= 1 && p.carry.seed >= 1), "nothing came back");
  assert.ok((w.things[0]!.stock ?? 0) < 10, "no food went out");
  assert.ok(w.chronicle?.some((c) => /trading party/.test(c.text)));
});

test("a raid is driven off by armed, strong defenders and succeeds against weak ones", () => {
  const strongSide = [person("A"), person("B", 25, "f"), person("C"), person("D")];
  for (const p of strongSide) p.tools.spear = true;
  const w = world(strongSide);
  const w2 = enableWorld2(w, 4);
  const s = w2.settlements[0]!;
  s.strength = 0.6;
  _testing.arrive(w, w2, { kind: "raid", from: s.id, depart: 0, arrive: 0, n: 4 });
  assert.equal(tally(w, "raidsRepelled"), 1, "the raid should have been repelled");
  assert.equal(w.things[0]!.stock, 10, "the stores were not touched");
  assert.ok(strongSide.some((p) => (p.wound ?? 0) > 0), "nobody was hurt in the fight");
  assert.ok(w2.war, "raiding is war");

  const weakSide = [person("E", 25, "f"), person("F", 5, "f")];
  const w3 = world(weakSide);
  const v2 = enableWorld2(w3, 4);
  const t = v2.settlements[0]!;
  t.strength = 0.9;
  _testing.arrive(w3, v2, { kind: "raid", from: t.id, depart: 0, arrive: 0, n: 6 });
  assert.equal(tally(w3, "raidsLost"), 1);
  assert.ok((w3.things[0]!.stock ?? 0) <= 3, "the stores were left");
  assert.ok(weakSide.some((p) => p.health <= 0.02 && p.cause === "a raid"), "nobody died against six raiders");
});

test("a hostile settlement raids on its own in time, and a gift ends the war", () => {
  const w = world(folk(5));
  const w2 = enableWorld2(w, 8, 1);
  const s = w2.settlements[0]!;
  s.temper = 1;
  s.attitude = -0.9;
  s.pop = 30;
  s.fertility = 0.9;
  advance(w, 250 * DAY);
  assert.ok(tally(w, "raids") >= 1, "no raid in 250 days of hostility");
  assert.ok(w2.war || tally(w, "raids") > 0);
  // Make peace.
  w2.war = { with: s.id, since: 0, raids: 1 };
  s.attitude = -0.05;
  w.things[0]!.stock = 8;
  assert.ok(giftToSettlement(w, s.id, 4));
  assert.ok(s.attitude > 0.3);
  s.temper = 0;
  advance(w, 2 * DAY);
  assert.equal(w2.war, undefined, "the war did not end");
  assert.throws(() => giftToSettlement(w, "nowhere"), /no settlement/);
});

test("migrants arrive from a famished settlement (and wait to be judged when strangers are on), and home people leave a spent land", () => {
  const w = world(folk(6));
  w.strangers = true;
  const w2 = enableWorld2(w, 2, 1);
  const s = w2.settlements[0]!;
  s.temper = 0;
  s.attitude = 0.3;
  s.pop = 20;
  s.fertility = 0.15;
  const before = w.people.length;
  advance(w, 30 * DAY);
  assert.ok(tally(w, "migrantsArrived") >= 1, "nobody came");
  const m = w.people.find((p) => p.id.startsWith("migrant-"));
  assert.ok(m, "the migrant is not in the world");
  assert.equal(w2.origins[m!.id], s.id);
  assert.ok(m!.stranger || m!.stranger === undefined);
  assert.ok(w.people.length > before);

  // Leaving: a spent land and a better place elsewhere.
  const h = world(folk(6));
  const v2 = enableWorld2(h, 2, 1);
  const t = v2.settlements[0]!;
  t.temper = 0;
  t.attitude = 0.4;
  t.pop = 20;
  t.fertility = 0.9;
  v2.famineDays = 5;
  const popBefore = t.pop;
  let chosen: string | undefined;
  v2.resources.soil = 0.05;
  for (let d = 0; d < 60 && !chosen; d++) {
    advance(h, DAY);
    chosen = Object.keys(v2.leaving)[0];
  }
  assert.ok(chosen, "nobody set out");
  const goer = h.people.find((p) => p.id === chosen)!;
  assert.equal(goer.intent?.kind, "wander");
  // A parched person does not set out: thirst comes first.
  goer.needs.thirst = 0.95;
  advance(h, 60);
  assert.equal(v2.leaving[chosen!], undefined, "left while parched");
  assert.ok(h.people.includes(goer));
  // Another who is well does go, and is counted at the other place.
  const left: Person[] = [];
  for (let d = 0; d < 120 && tally(h, "emigrants") === 0; d++) {
    v2.resources.soil = 0.05;
    for (const p of h.people) p.needs.thirst = 0.1;
    advance(h, DAY / 2);
  }
  void left;
  assert.ok(tally(h, "emigrants") >= 1, "nobody left");
  assert.ok(t.pop > popBefore - 1, "the leaver was not counted there");
});

// ---------------- I2: climate, epidemics, depletion, fire, animals ----------------

test("the climate drifts over decades, deterministically, with a word when the era turns", () => {
  const a = world(folk(2));
  const b = world(folk(2));
  const wa = enableWorld2(a, 3);
  const wb = enableWorld2(b, 3);
  const seen: number[] = [];
  for (let y = 0; y < 90; y += 5) {
    advance(a, 5 * YEAR, DAY);
    seen.push(a.climate!.meanC);
    if (tally(a, "climateTurns") === 1) assert.ok(a.chronicle?.some((c) => /winters have been growing harder|summers have been growing hotter/.test(c.text)), "the turn was not told");
  }
  advance(b, 90 * YEAR, DAY);
  assert.equal(b.climate!.meanC, a.climate!.meanC, "the same seed gives the same climate");
  assert.ok(Math.max(...seen) - Math.min(...seen) > 3, `climate hardly moved: ${seen.join(",")}`);
  assert.equal(wa.baseClimate.meanC, 14, "the base climate is kept");
  assert.ok(Math.abs(climateDrift(wb, 0).tempC) < 1e-9);
  assert.ok(tally(a, "climateTurns") >= 1);
});

test("an epidemic comes with a trading party, sickens some, spreads between settlements, and leaves the survivors immune", () => {
  const w = world(folk(6));
  const w2 = enableWorld2(w, 6);
  calm(w2);
  const [s0, s1, s2] = w2.settlements as [typeof w2.settlements[0], typeof w2.settlements[0], typeof w2.settlements[0]];
  s1.x = s0.x + 800;
  s1.z = s0.z;
  s2.x = s0.x;
  s2.z = s0.z + 800;
  const name = "the grey cough";
  w2.epidemic = { name, origin: s0.id, since: 0, severity: 0.5, homeCases: 0 };
  s0.sick = name;
  s0.sickUntil = w.clock! + 10 * DAY;
  _testing.arrive(w, w2, { kind: "trade", from: s0.id, depart: 0, arrive: 0, n: 3, sick: name });
  const sick = w.people.filter((p) => p.illness);
  assert.ok(sick.length >= 1, "nobody fell ill");
  assert.ok(sick.every((p) => bodyOf(p).sickWith === name));
  assert.ok(w.chronicle?.some((c) => /has come to the camp/.test(c.text)));
  // They recover and are immune; a second wave finds them proof.
  for (const p of sick) {
    p.illness = undefined;
    bodyStep(p, w, 1);
    assert.ok(bodyOf(p).immune.includes(name), "no immunity after surviving");
  }
  const before = w.people.filter((p) => p.illness).length;
  _testing.arrive(w, w2, { kind: "trade", from: s0.id, depart: 0, arrive: 0, n: 3, sick: name });
  for (const p of sick) assert.equal(p.illness, undefined, "an immune person fell ill again");
  assert.ok(w.people.filter((p) => p.illness).length >= before);
  // It spreads between the settlements and then ends once the people have mended.
  for (let d = 0; d < 90; d++) {
    advance(w, DAY);
    for (const p of w.people) {
      if (!p.illness) continue;
      p.illness = undefined;
      bodyStep(p, w, 1);
    }
  }
  assert.ok(tally(w, "epidemicSpread") >= 1, "it did not spread");
  assert.equal(w2.epidemic, undefined, "it never ended");
  assert.ok(w2.immuneDone.includes(name));
});

test("too many mouths wear the land out: regrowth slows, the camp is told, and people leave", () => {
  const crowd = folk(20);
  const w = world(crowd);
  const w2 = enableWorld2(w, 1, 1);
  w2.landCapacity = 14;
  w2.settlements[0]!.fertility = 1;
  w2.settlements[0]!.attitude = 0.5;
  advance(w, 90 * DAY);
  assert.ok(w2.resources.soil < 0.3, `the soil is still ${w2.resources.soil}`);
  assert.ok(w2.famineDays >= 3);
  assert.ok(w.chronicle?.some((c) => /The land is spent/.test(c.text)));
  // The same land with a few people recovers.
  const few = world(folk(4));
  const f2 = enableWorld2(few, 1, 1);
  f2.resources.soil = 0.4;
  advance(few, 40 * DAY);
  assert.ok(f2.resources.soil > 0.7, `${f2.resources.soil}`);
  // Poor soil slows what grows back.
  const rich = world([]);
  const poor = world([]);
  enableWorld2(rich, 1, 1);
  const p2 = enableWorld2(poor, 1, 1);
  p2.resources.soil = 0.1;
  for (const x of [rich, poor]) {
    hotDry(x);
    x.things[1]!.growth = 100;
    world2Step(x, 10);
  }
  assert.ok(poor.things[1]!.growth! < rich.things[1]!.growth!, "poor soil did not slow regrowth");
});

test("fire is a danger to the camp: an unattended fire escapes in a dry hot spell and can burn the shelter, rain prevents it", () => {
  const camp = { id: "campfire-1", kind: "campfire", x: 4, z: 0, radius: 2, fuel: 5000 };
  const dryWorld = world([person("A", 25, "m", 30, 30)], [camp]);
  const w2 = enableWorld2(dryWorld, 1, 1);
  hotDry(dryWorld);
  w2.dry = 8;
  assert.ok(fireDanger(dryWorld) > 0.7, `${fireDanger(dryWorld)}`);
  advance(dryWorld, 20 * 60);
  assert.ok(tally(dryWorld, "wildfires") >= 1, "the fire never escaped");
  assert.ok(tally(dryWorld, "shelterBurned") >= 1, "the shelter did not burn");
  assert.ok(!dryWorld.things.some((t) => t.kind === "shelter"));
  // Someone minding the fire keeps it in.
  const minded = world([person("B", 25, "m", 5, 0)], [{ ...camp }]);
  const m2 = enableWorld2(minded, 1, 1);
  hotDry(minded);
  m2.dry = 8;
  advance(minded, 20 * 60);
  assert.equal(tally(minded, "wildfires"), 0, "a tended fire escaped");
  // Rain.
  const wet = world([person("C", 25, "m", 30, 30)], [{ ...camp }]);
  const e2 = enableWorld2(wet, 1, 1);
  hotDry(wet);
  wet.weather!.raining = true;
  wet.weather!.rainAmount = 0.6;
  e2.dry = 8;
  assert.equal(fireDanger(wet), 0);
  advance(wet, 20 * 60);
  assert.equal(tally(wet, "wildfires"), 0);
  // A fire already burning is put out by rain.
  wet.weather!.rainAmount = 0.6;
  wet.things.push({ id: "fire-9", kind: "fire", x: 20, z: 0, radius: 3, fuel: 9999 });
  advance(wet, 120);
  assert.ok(!wet.things.some((t) => t.kind === "fire"));
});

test("a beast can be won with food and then is yours: it gives milk, wool or hauling, keeps near home, and goes free when its owner dies", () => {
  const a = person("A", 25, "m", 5, 2);
  const w = world([a]);
  const cow = make(w, "cow", 6, 2, { radius: 2, stock: 0, maxStock: 3 });
  const alpaca = make(w, "alpaca", 7, 2, { radius: 2 });
  const donkey = make(w, "donkey", 8, 2, { radius: 2 });
  a.carry.food = 20;
  a.carry.wood = 0;
  for (const t of [cow, alpaca, donkey]) a.memory.set(t.id, { x: t.x, z: t.z, feeling: 0.2, visits: 1, lastSeen: 0 });
  assert.equal(livestockOptions(a, w).length, 3, "no option to win them");
  for (const beast of [cow, alpaca, donkey]) {
    for (let i = 0; i < 6 && !beast.of; i++) {
      a.x = beast.x - 1;
      a.z = beast.z;
      assert.ok(tameLivestock(w, a, beast));
    }
    assert.equal(beast.of, "A", `${beast.kind} was not won`);
  }
  assert.equal(herdOf(w, a).length, 3);
  assert.equal(livestockOptions(a, w).length, 0, "three is the most one keeps");
  // The mind's own 'tame' intent does it too.
  const b = person("B", 25, "f", -5, 2);
  const w3 = world([b]);
  const horse = make(w3, "horse", -6, 2, { radius: 2 });
  b.carry.food = 20;
  b.memory.set(horse.id, { x: horse.x, z: horse.z, feeling: 0.2, visits: 1, lastSeen: 0 });
  w3.clock = DAY * 0.4;
  for (let t = 0; t < 400 && !horse.of; t++) {
    if (!b.intent) b.intent = { kind: "tame", targetId: horse.id, x: horse.x, z: horse.z, speed: 1.6, remaining: 0.3, arrived: false };
    step(w3, 1);
    b.carry.food = Math.max(b.carry.food, 5);
  }
  assert.equal(horse.of, "B", "the mind did not win the horse through its tame intent");
  // Products over days.
  const cloth = a.clothing ?? 0;
  advance(w, 5 * DAY);
  assert.ok(cow.stock! >= 3, "no milk");
  assert.ok((a.clothing ?? 0) > cloth, "no wool");
  assert.ok(a.carry.wood >= 1, "no hauling");
  // Homeward.
  cow.x = 120;
  cow.mob = { tx: 120, tz: 0, wait: 0, fed: 0, age: 4, fleeUntil: 0 };
  advance(w, 120);
  assert.ok(Math.hypot(cow.mob.tx, cow.mob.tz) < 20, "the cow was not drawn home");
  // The owner dies.
  w.people.splice(0, 1);
  advance(w, 120);
  assert.equal(cow.of, undefined, "the cow stayed owned by the dead");
});

test("the wider world runs inside the full step and survives a save and load", () => {
  const w = world(folk(4));
  w.weather = undefined;
  const w2 = enableWorld2(w, 11);
  calm(w2);
  for (let t = 0; t < 3 * DAY; t += 5) step(w, 5);
  assert.ok(w.clock! > 3 * DAY);
  const back = worldFromJson(worldToJson(w));
  assert.equal(back.world2?.settlements.length, 3);
  assert.equal(back.world2?.seed, 11);
  assert.deepEqual(back.world2?.settlements[0]!.name, w2.settlements[0]!.name);
});

// ---------------- I3: the body ----------------

test("growth follows a curve: quick early, a spurt at puberty (girls first), adult height by sex and genes, a little shrinkage in age", () => {
  const girl = person("G", 0.1, "f");
  const boy = person("G", 0.1, "m");
  bodyOf(girl);
  bodyOf(boy);
  boy.body!.gene = { ...girl.body!.gene };
  const at = (p: Person, human: number) => {
    p.age = human <= 18 ? human / 4.5 : 4 + (human - 18) / 0.94;
    return heightCm(p);
  };
  let last = 0;
  for (const h of [0, 1, 2, 4, 6, 8, 10, 12, 14, 16, 18]) {
    const v = at(girl, h);
    assert.ok(v >= last, `height fell at ${h}`);
    last = v;
  }
  assert.ok(at(girl, 0) < 55 && at(girl, 0) > 40, "a newborn is about 50 cm");
  const g12 = at(girl, 12) / adultHeightCm(girl);
  const b12 = at(boy, 12) / adultHeightCm(boy);
  assert.ok(g12 > b12 + 0.05, "girls should be nearer their height at twelve");
  assert.ok(adultHeightCm(boy) > adultHeightCm(girl) + 8);
  const young = at(boy, 30);
  assert.ok(at(boy, 85) < young, "the very old should have shrunk");
  assert.ok(Math.abs(young - adultHeightCm(boy)) < 1e-6);
});

test("a child who goes hungry grows into a smaller adult", () => {
  const fed = person("S", 1.5, "m");
  const starved = person("S", 1.5, "m");
  for (let i = 0; i < 150; i++) {
    for (const [p, h] of [[fed, 0.2], [starved, 0.95]] as const) {
      p.needs.hunger = h;
      bodyStep(p, world([p]), DAY);
    }
  }
  assert.ok(bodyOf(starved).stunt > 0.05);
  assert.equal(bodyOf(fed).stunt, 0);
  assert.ok(adultHeightCm(starved) < adultHeightCm(fed) - 8, `${adultHeightCm(starved)} vs ${adultHeightCm(fed)}`);
});

test("strength grows with the child, peaks in the prime of life, fades in old age and rises with fitness", () => {
  const p = person("M", 1, "m");
  bodyOf(p).fitness = 0.5;
  const kid = muscleOf(p);
  p.age = 8;
  const prime = muscleOf(p);
  p.age = 70;
  const old = muscleOf(p);
  p.age = 8;
  bodyOf(p).fitness = 1;
  const fit = muscleOf(p);
  bodyOf(p).fitness = 0.1;
  const unfit = muscleOf(p);
  assert.ok(kid < prime * 0.5, "a child is not as strong as a man");
  assert.ok(old < prime * 0.8, "the old are weaker");
  assert.ok(fit > prime && unfit < prime);
  const woman = person("M", 8, "f");
  woman.body = { ...bodyOf(p), gene: { ...bodyOf(p).gene } };
  bodyOf(woman).fitness = 0.5;
  bodyOf(p).fitness = 0.5;
  assert.ok(muscleOf(woman) < muscleOf(p));
});

test("walking and work build fitness, idleness and illness lose it, and fitness changes pace", () => {
  const walker = person("W");
  const idler = person("I");
  const w = world([walker, idler]);
  for (let t = 0; t < 10 * DAY; t += 120) {
    walker.intent = { kind: "wander", x: 50, z: 0, speed: 1.6, remaining: 5, arrived: false };
    idler.intent = { kind: "linger", x: 0, z: 0, speed: 0, remaining: 5, arrived: true };
    bodyStep(walker, w, 120);
    bodyStep(idler, w, 120);
  }
  assert.ok(bodyOf(walker).fitness > 0.85, `${bodyOf(walker).fitness}`);
  assert.ok(bodyOf(idler).fitness < 0.4, `${bodyOf(idler).fitness}`);
  assert.ok(bodySpeed(walker) > bodySpeed(idler));
  const sick = person("K");
  bodyOf(sick).fitness = 0.9;
  sick.illness = { severity: 0.5, since: 0 };
  sick.intent = { kind: "wander", x: 50, z: 0, speed: 1.6, remaining: 5, arrived: false };
  for (let i = 0; i < 10; i++) bodyStep(sick, w, DAY);
  assert.ok(bodyOf(sick).fitness < 0.5);
});

test("sleep debt builds when someone stays awake, slows and sours them, is repaid by sleep, and in the end puts them to sleep unless thirst or hunger forbids", () => {
  const p = person("D");
  const w = world([p]);
  p.mood = 0.6;
  p.intent = { kind: "linger", x: 0, z: 0, speed: 0, remaining: 5, arrived: true };
  const fresh = bodySpeed(p);
  for (let t = 0; t < 1.1 * DAY; t += 60) bodyStep(p, w, 60);
  assert.equal(sleepDebt(p), 0, "a day awake is not yet a debt owed");
  for (let t = 0; t < 1.2 * DAY; t += 60) bodyStep(p, w, 60);
  assert.ok(sleepDebt(p) > 0.3, `${sleepDebt(p)}`);
  assert.ok(bodySpeed(p) < fresh * 0.95);
  assert.ok(p.mood < 0.35, "the mood did not sour");
  const opts = [{ intent: { kind: "sleep" as const, x: 0, z: 0, speed: 1, remaining: 5 }, score: 0.1 }, { intent: { kind: "talk" as const, x: 0, z: 0, speed: 1, remaining: 5 }, score: 0.1 }];
  bodyBias(p, w, opts);
  assert.ok(opts[0]!.score > opts[1]!.score + 0.2, "sleep was not wanted");
  // Thirst comes first.
  const thirsty = { ...opts[0]!, score: 0.1 };
  p.needs.thirst = 0.8;
  const o2 = [thirsty];
  bodyBias(p, w, o2);
  assert.equal(o2[0]!.score, 0.1, "the bias must yield to thirst");
  p.needs.thirst = 0.1;
  p.intent = { kind: "linger", x: 0, z: 0, speed: 0, remaining: 5, arrived: true };
  p.needs.thirst = 0.9;
  for (let t = 0; t < 2 * DAY; t += 60) bodyStep(p, w, 60);
  assert.notEqual(p.intent?.kind, "sleep", "fell asleep while parched");
  p.needs.thirst = 0.1;
  bodyStep(p, w, 60);
  assert.equal(p.intent?.kind, "sleep", "never fell asleep from exhaustion");
  assert.equal(tally(w, "microsleeps"), 1);
  for (let t = 0; t < 1.7 * DAY; t += 60) bodyStep(p, w, 60);
  assert.ok(sleepDebt(p) < 0.01, "sleep did not repay the debt");
});

test("sight and hearing age, and a person with poor sight notices less at a distance", () => {
  const young = person("Y", 20);
  const old = person("O", 60);
  assert.equal(sightFactor(young), 1);
  assert.equal(hearingOf(young), 1);
  assert.ok(sightFactor(old) < 0.9 && hearingOf(old) < 0.75);
  assert.ok(hearingOf(person("O2", 62)) <= hearingOf(old));
  const keen = person("K1", 25);
  const dim = person("K2", 25);
  bodyOf(dim).disabilities.push("poor sight");
  keen.x = dim.x = 0;
  const far = { id: "far-tree", kind: "tree", x: 21, z: 0, radius: 2 };
  const w = world([keen, dim], [far]);
  step(w, 1);
  assert.ok(keen.memory.has("far-tree"), "the keen eyes missed it");
  assert.ok(!dim.memory.has("far-tree"), "poor sight saw as far as good sight");
});

test("some are born with a lesser sense or a bad leg; a bad wound can lame, a fever can leave damage; a limp slows walking and hunting is avoided", () => {
  let born = 0;
  for (let i = 0; i < 4000; i++) if (bodyOf(person(`id${i}`, 25)).disabilities.length) born++;
  assert.ok(born > 80 && born < 320, `${born} of 4000 born with a disability`);
  // Find someone whom a bad wound lames.
  let lamed: Person | undefined;
  const w = world([]);
  for (let i = 0; i < 200 && !lamed; i++) {
    const p = person(`w${i}`);
    bodyOf(p).disabilities = [];
    p.wound = 0.8;
    bodyStep(p, w, 1);
    p.wound = undefined;
    w.clock = (w.clock ?? 0) + 60 * i;
    bodyStep(p, w, 1);
    if (bodyOf(p).disabilities.includes("limp")) lamed = p;
  }
  assert.ok(lamed, "no bad wound ever lamed anyone");
  assert.ok(bodySpeed(lamed!) < 0.65, `${bodySpeed(lamed!)}`);
  assert.ok(w.tally?.disabilitiesAcquired);
  const opts = [{ intent: { kind: "hunt" as const, x: 0, z: 0, speed: 1, remaining: 5 }, score: 0.6 }];
  bodyBias(lamed!, w, opts);
  assert.ok(opts[0]!.score < 0.6);
  // A fever.
  let after = 0;
  for (let i = 0; i < 400; i++) {
    const p = person(`f${i}`);
    p.illness = { severity: 0.9, since: 0 };
    bodyStep(p, w, 1);
    p.illness = undefined;
    w.clock = (w.clock ?? 0) + 77 * i;
    bodyStep(p, w, 1);
    if (bodyOf(p).disabilities.length) after++;
  }
  assert.ok(after > 40 && after < 160, `${after} of 400 were left damaged`);
});

test("a wound that was bad leaves a scar that stays and is saved; a graze does not", () => {
  const p = person("S1");
  const g = person("S2");
  const w = world([p, g]);
  p.wound = 0.7;
  g.wound = 0.1;
  bodyStep(p, w, 1);
  bodyStep(g, w, 1);
  p.wound = undefined;
  g.wound = undefined;
  w.clock = (w.clock ?? 0) + 100;
  bodyStep(p, w, 1);
  bodyStep(g, w, 1);
  assert.equal(bodyOf(p).scars.length, 1);
  assert.equal(bodyOf(g).scars.length, 0);
  assert.ok(bodyOf(p).scars[0]!.severity >= 0.7);
  for (let i = 0; i < 100; i++) bodyStep(p, w, DAY);
  assert.equal(bodyOf(p).scars.length, 1, "a scar faded");
  const back = worldFromJson(worldToJson(w));
  assert.equal(back.people[0]!.body!.scars.length, 1);
  assert.ok(p.journal.some((j) => /left a scar/.test(j.text)));
});

test("a person left filthy gets lice, which cost sleep and mood, until they wash", () => {
  const p = person("L");
  const w = world([p]);
  p.hygiene = 0.95;
  p.intent = { kind: "linger", x: 0, z: 0, speed: 0, remaining: 5, arrived: true };
  for (let t = 0; t < 3.2 * DAY; t += 60) bodyStep(p, w, 60);
  assert.ok(bodyOf(p).lice, "no lice");
  p.mood = 0.8;
  bodyStep(p, w, 60);
  assert.ok(p.mood <= 0.25);
  const lousy = person("L3");
  const clean = person("L2");
  bodyOf(lousy).lice = true;
  lousy.hygiene = 0.9;
  clean.hygiene = 0.3;
  const wb = world([clean, lousy]);
  for (const q of [clean, lousy]) q.intent = { kind: "linger", x: 0, z: 0, speed: 0, remaining: 5, arrived: true };
  for (let t = 0; t < 1 * DAY; t += 60) {
    bodyStep(clean, wb, 60);
    bodyStep(lousy, wb, 60);
  }
  assert.ok(bodyOf(lousy).awake > bodyOf(clean).awake, "lice should have cost sleep");
  p.hygiene = 0;
  bodyStep(p, w, 60);
  assert.ok(!bodyOf(p).lice, "washing did not clear the lice");
  const opts = [{ intent: { kind: "wash" as const, x: 0, z: 0, speed: 1, remaining: 5 }, score: 0.1 }];
  bodyOf(p).lice = true;
  bodyBias(p, w, opts);
  assert.ok(opts[0]!.score > 0.5);
});

test("a pregnancy can be lost early (more often when she is hungry) and can go wrong late", () => {
  const trial = (hunger: number, label: string) => {
    let lost = 0;
    for (let i = 0; i < 300; i++) {
      const m = person(`${label}${i}`, 25, "f");
      m.needs.hunger = hunger;
      const w = world([m]);
      w.clock = 100 * DAY;
      m.pregnant = { since: w.clock, father: "x" };
      for (let t = 0; t < 0.3 * 0.75 * YEAR && m.pregnant; t += 10) {
        w.clock += 10;
        bodyStep(m, w, 10);
      }
      if (!m.pregnant) lost++;
    }
    return lost;
  };
  const fed = trial(0.2, "a");
  const hungry = trial(0.95, "b");
  assert.ok(fed > 5 && fed < 90, `${fed} of 300 lost when fed`);
  assert.ok(hungry > fed * 1.5, `hungry ${hungry} vs fed ${fed}`);
  let eclampsia = 0;
  for (let i = 0; i < 300; i++) {
    const m = person(`c${i}`, 25, "f");
    const w = world([m]);
    w.clock = 100 * DAY;
    m.pregnant = { since: w.clock - 0.62 * 0.75 * YEAR, father: "x" };
    for (let t = 0; t < 0.35 * 0.75 * YEAR && m.pregnant; t += 10) {
      w.clock += 10;
      bodyStep(m, w, 10);
    }
    if (bodyOf(m).complications.includes("pre-eclampsia")) {
      eclampsia++;
      assert.ok(m.health < 1, "pre-eclampsia should cost health");
    }
  }
  assert.ok(eclampsia > 3 && eclampsia < 80, `${eclampsia} of 300 got pre-eclampsia`);
});

test("birth can bring bleeding, blocked labour or childbed fever, more often for the very young, old, hungry or dirty, and the mind's birth uses it", () => {
  const rate = (age: number, hunger: number, dirt: number) => {
    let n = 0;
    for (let i = 0; i < 400; i++) {
      const m = person(`m${age}-${i}`, age, "f");
      m.needs.hunger = hunger;
      m.hygiene = dirt;
      const w = world([m]);
      w.clock = 3 * DAY + i * 977;
      if (birthComplication(w, m)) n++;
    }
    return n;
  };
  const healthy = rate(10, 0.2, 0.1);
  const worn = rate(45, 0.9, 0.9);
  assert.ok(healthy > 3 && healthy < 60, `${healthy}`);
  assert.ok(worn > healthy * 2, `${worn} vs ${healthy}`);
  assert.ok(stillbirthExtra("obstructed labour") > stillbirthExtra("haemorrhage") && stillbirthExtra(undefined) === 0);
  // Inside giveBirth.
  let hit = false;
  for (let i = 0; i < 300 && !hit; i++) {
    const m = person(`b${i}`, 45, "f");
    m.needs.hunger = 0.9;
    m.hygiene = 0.9;
    const f = person(`fa${i}`, 30, "m");
    const w = world([m, f]);
    w.clock = 5 * DAY + i * 311;
    giveBirth(w, m, f);
    if (tally(w, "birthComplications")) {
      hit = true;
      assert.ok(m.body!.complications.length >= 1);
      assert.ok(m.health < 1 || m.illness);
    }
  }
  assert.ok(hit, "giveBirth never produced a complication");
});

test("a sickness of the bed passes between partners, makes a child less likely, and passes in time", () => {
  const a = person("A", 25, "m");
  const b = person("B", 25, "f");
  lifeOf(a).partner = "B";
  lifeOf(b).partner = "A";
  b.x = 1;
  const w = world([a, b]);
  assert.equal(fertilityOf(b, a), 1);
  assert.ok(infectBed(a, w));
  assert.ok(!infectBed(a, w), "already ill");
  assert.ok(fertilityOf(b, a) < 1);
  for (let t = 0; t < 40 * DAY && !bodyOf(b).bedSickness; t += 20) {
    w.clock = (w.clock ?? 0) + 20;
    bodyStep(a, w, 20);
    bodyStep(b, w, 20);
  }
  assert.ok(bodyOf(b).bedSickness, "never passed to the partner");
  assert.ok(fertilityOf(b, a) <= 0.31);
  for (let t = 0; t < 120 * DAY; t += 60) {
    w.clock = (w.clock ?? 0) + 60;
    bodyStep(a, w, 60);
    bodyStep(b, w, 60);
  }
  assert.ok(!bodyOf(a).bedSickness && !bodyOf(b).bedSickness, "it never passed");
});

test("bodyStep draws no numbers from a person's own random stream", () => {
  const p = person("R");
  const w = world([p]);
  p.wound = 0.8;
  p.pregnant = { since: 0, father: "x" };
  const s = p.rngState;
  for (let i = 0; i < 100; i++) bodyStep(p, w, 10);
  assert.equal(p.rngState, s);
});

// ---------------- I5: the Creator's Walker ----------------

test("the Walker's look can be changed, and a bad value is refused with its reason and changes nothing", () => {
  const w = world([]);
  const look = customiseWalker(w, { heightCm: 190, build: "broad", skin: 0.8, hair: "#112233", tunic: "#aa5500" });
  assert.deepEqual(look, walkerBodyOf(w).look);
  assert.equal(walkerBodyOf(w).look.build, "broad");
  assert.throws(() => customiseWalker(w, { heightCm: 400 }), /140 to 210/);
  assert.throws(() => customiseWalker(w, { hair: "red" }), /#aabbcc/);
  assert.throws(() => customiseWalker(w, { build: "huge" as never }), /slight, average or broad/);
  assert.throws(() => customiseWalker(w, { skin: 3 }), /0 to 1/);
  assert.throws(() => customiseWalker(w, { eyes: "green" } as never), /Unknown thing/);
  assert.throws(() => customiseWalker(w, { build: "slight", heightCm: 1 }), /140 to 210/);
  assert.equal(walkerBodyOf(w).look.build, "broad", "a refused change must change nothing");
  const back = worldFromJson(worldToJson(w));
  assert.equal(back.walker?.body?.look.heightCm, 190);
});

test("the Walker gets hungry, thirsty and tired; eating and drinking from the pack help; being starved slows and hurts; they grow older", () => {
  const w = world([]);
  w.walker = { pack: { meat: 1, water: 1, wood: 0, fruit: 0 } };
  const age0 = walkerAge(w);
  for (let t = 0; t < 1 * DAY; t += 60) walkerStep(w, 60, true);
  const n = walkerBodyOf(w).needs;
  assert.ok(n.hunger > 0.7 && n.thirst > 0.9 && n.energy > 0.7, JSON.stringify(n));
  const tired = walkerSpeed(w);
  assert.ok(tired < 0.7, `a day without food, water or rest should slow the Walker: ${tired}`);
  assert.ok(walkerDrink(w) && walkerEat(w, "meat"));
  assert.ok(n.thirst < 0.5 && n.hunger < 0.4);
  walkerRest(w, DAY);
  assert.ok(walkerSpeed(w) > tired + 0.2, "food, water and rest did not help");
  assert.ok(!walkerDrink(w), "drank from an empty pack");
  assert.ok(!walkerEat(w, "fruit"));
  const rested = walkerSpeed(w);
  for (let t = 0; t < 3 * DAY; t += 60) walkerStep(w, 60, true);
  assert.ok(walkerSpeed(w) < rested, "starving and parched should slow the Walker");
  assert.ok(walkerBodyOf(w).health < 1);
  assert.ok(walkerBodyOf(w).health >= 0.05, "the Creator does not die");
  w.clock = 40 * YEAR;
  assert.ok(walkerAge(w) > age0 + 39);
  const old = walkerAge({ ...w, clock: 80 * YEAR } as World);
  assert.ok(old > 100);
});

test("a hard hurt scars the Walker; what the Walker does to people is remembered by them and by those who saw", () => {
  const a = person("A", 25, "m", 0, 0);
  const b = person("B", 25, "f", 5, 0);
  const far = person("Far", 25, "m", 90, 0);
  const w = world([a, b, far]);
  walkerHurt(w, 0.2);
  assert.equal(walkerBodyOf(w).scars.length, 0);
  walkerHurt(w, 0.8, "a wolf");
  assert.equal(walkerBodyOf(w).scars.length, 1);
  assert.equal(walkerBodyOf(w).scars[0]!.what, "a wolf");
  a.walkerTrust = 0.5;
  const trustB = b.relations.get("walker")?.trust ?? 0.3;
  walkerDeed(w, a, "struck", 0.8);
  assert.ok(a.walkerTrust < 0.1, `${a.walkerTrust}`);
  assert.ok(a.health < 1 && (a.wound ?? 0) > 0);
  assert.ok((a.emotions?.fear ?? 0) > 0.3);
  assert.ok((b.relations.get("walker")?.trust ?? 0) < trustB, "a witness did not think less of the Walker");
  assert.equal(far.relations.get("walker"), undefined, "someone far away heard of it at once");
  assert.ok(walkerRepute(w) < 0);
  const c = person("C");
  const w2 = world([c]);
  walkerDeed(w2, c, "gave");
  walkerDeed(w2, c, "healed");
  assert.ok(walkerRepute(w2) > 0);
  assert.ok(c.walkerTrust! > 0.25);
  assert.equal(tally(w, "walker_struck"), 1);
});
