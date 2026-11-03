// The wider world beyond the garden.
//
//  OTHER SETTLEMENTS live in the sim as places with a population, a land that can be worn out, and a temper toward the home people. Each
//  day they grow or starve, send trading parties, raid, or send migrants; the home people also leave for better land. Journeys take
//  days, longer over mountains and rivers (the GEOGRAPHY: mountains, a coast, a river, all fixed by the world's seed).
//  CLIMATE drifts over decades (slow cycles and the odd cold spell) by changing the climate the weather is drawn from.
//  EPIDEMICS start somewhere, travel with trading parties and migrants, sicken those they reach, and leave the survivors immune.
//  RESOURCES at home (soil and game) wear out when too many people live off them, slowing regrowth, and a spent land sends people away.
//  FIRE is a danger to the camp in a dry hot spell: an unattended fire can escape, lightning can strike, and a fire can burn a shelter.
//  DOMESTIC ANIMALS beyond the dog: a cow, alpaca, donkey or horse can be won with food and then gives milk, wool or hauling and keeps near home.
// All of it is off until `enableWorld2(world)` is called (the page does, the tests do), so worlds that never asked for it are unchanged.
// Chances come from the world's own second random stream (`world2.rng`), never a person's, and nothing here reads a value from another eden
// module at load time (they import one another in a ring).
import { learnHerding } from "./tech";
import { DAY, YEAR, growthRate, hypot2 } from "./earth";
import { bodyOf, infectBed, muscleOf } from "./body";
import { ADULT_AGE, chronicle, make, makePerson, note, tally, type Person, type Thing, type World } from "./mind";
import { feel } from "./inner";

export interface Settlement {
  id: string;
  name: string;
  x: number;
  z: number;
  pop: number;
  fertility: number; // 0..1 how much the land has left
  temper: number; // 0 kindly .. 1 warlike
  attitude: number; // -1 hostile .. 1 friendly, toward the home people
  coastal: boolean;
  strength: number; // 0..1 how well armed
  sick?: string; // the epidemic it has now
  sickUntil?: number;
  immune?: string[]; // epidemics it has come through
  collapsedAt?: number;
  lastTrade?: number;
  lastRaid?: number;
}
export interface Convoy {
  kind: "trade" | "raid" | "migrants";
  from: string;
  depart: number;
  arrive: number;
  n: number;
  sick?: string;
  bed?: boolean;
}
export interface Geo {
  mountains: { x: number; z: number; r: number }[];
  sea: { nx: number; nz: number; d: number }; // the sea is where x*nx + z*nz > d
  river: { x0: number; z0: number; x1: number; z1: number };
}
export interface Epidemic {
  name: string;
  origin: string; // a settlement id, or "home"
  since: number;
  severity: number;
  homeCases: number;
}
export interface World2 {
  seed: number;
  rng: number;
  settlements: Settlement[];
  geo: Geo;
  baseClimate: { meanC: number; seasonalAmpC: number; dailyAmpC: number; rainy: number; seed: number };
  convoys: Convoy[];
  epidemic?: Epidemic;
  immuneDone: string[];
  war?: { with: string; since: number; raids: number };
  resources: { soil: number; game: number };
  landCapacity: number; // how many people the home land feeds without wearing out
  famineDays: number;
  dry: number; // days since it rained
  wet: boolean; // it has rained today
  acc: { hour: number; day: number };
  leaving: Record<string, { to: string; since: number }>;
  origins: Record<string, string>; // person id -> the settlement they came from
  era?: string; // the long climate's present turn
  huntedSeen: number;
  log: { t: number; text: string }[];
}

const EPIDEMICS = ["the red fever", "the wasting", "the grey cough", "the shaking sickness"];
const SETTLEMENT_NAMES = ["Highwater", "Saltmarsh", "Redfield", "Stonebrook", "Ashford", "Longmere"];
const MIGRANT_NAMES = { m: ["Tobin", "Ravi", "Corin", "Ansel", "Dov", "Emrys"], f: ["Mira", "Thessaly", "Anwen", "Lio", "Sabra", "Isolde"] };
const TRAVEL_METRES_PER_DAY = 2500;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const dist = (ax: number, az: number, bx: number, bz: number) => hypot2(ax - bx, az - bz);
const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
};
function rnd(w2: World2): number {
  w2.rng = (w2.rng + 0x6d2b79f5) | 0;
  let t = w2.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const world2Of = (world: World): World2 | undefined => world.world2;
function need2(world: World): World2 {
  if (!world.world2) throw new Error("world2 is not enabled for this world: call enableWorld2(world) first");
  return world.world2;
}
function say(world: World, w2: World2, text: string) {
  chronicle(world, text);
  w2.log.push({ t: world.clock ?? 0, text });
  if (w2.log.length > 100) w2.log.shift();
}

// ---- Geography ----

function segHitsCircle(ax: number, az: number, bx: number, bz: number, c: { x: number; z: number; r: number }): boolean {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((c.x - ax) * dx + (c.z - az) * dz) / len2));
  return dist(ax + t * dx, az + t * dz, c.x, c.z) < c.r;
}
function segsCross(a: [number, number, number, number], b: [number, number, number, number]): boolean {
  const o = (px: number, pz: number, qx: number, qz: number, rx: number, rz: number) => Math.sign((qx - px) * (rz - pz) - (qz - pz) * (rx - px));
  const [ax, az, bx, bz] = a, [cx, cz, dx, dz] = b;
  return o(ax, az, bx, bz, cx, cz) !== o(ax, az, bx, bz, dx, dz) && o(cx, cz, dx, dz, ax, az) !== o(cx, cz, dx, dz, bx, bz);
}
/** Days to walk from one place to another: the distance, doubled again over mountains, longer across the river, and round the sea. */
export function travelDays(geo: Geo, a: { x: number; z: number }, b: { x: number; z: number }): number {
  let d = dist(a.x, a.z, b.x, b.z) / TRAVEL_METRES_PER_DAY;
  let mult = 1;
  for (const m of geo.mountains) if (segHitsCircle(a.x, a.z, b.x, b.z, m)) mult += 1.5;
  if (segsCross([a.x, a.z, b.x, b.z], [geo.river.x0, geo.river.z0, geo.river.x1, geo.river.z1])) d += 0.4;
  const side = (p: { x: number; z: number }) => p.x * geo.sea.nx + p.z * geo.sea.nz - geo.sea.d;
  if (side(a) > 0 || side(b) > 0) return Infinity; // a place in the sea
  // Walking the long way round the bay when the straight line would cross the sea.
  const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
  if (side(mid) > 0) mult += 0.5;
  return d * mult;
}
export const isCoastal = (geo: Geo, p: { x: number; z: number }) => geo.sea.d - (p.x * geo.sea.nx + p.z * geo.sea.nz) < 350;
function makeGeo(seed: number): Geo {
  const seaA = hash(`sea${seed}`) * Math.PI * 2;
  const nx = Math.cos(seaA), nz = Math.sin(seaA);
  const mA = seaA + Math.PI * (0.6 + 0.8 * hash(`mtn${seed}`));
  const mountains = [0, 1, 2].map((i) => {
    const dd = 2300 + 250 * i;
    const a = mA + (i - 1) * 0.22;
    return { x: Math.cos(a) * dd, z: Math.sin(a) * dd, r: 520 };
  });
  const rA = hash(`river${seed}`) * Math.PI;
  return { mountains, sea: { nx, nz, d: 4500 }, river: { x0: Math.cos(rA) * 1400 - Math.sin(rA) * 3500, z0: Math.sin(rA) * 1400 + Math.cos(rA) * 3500, x1: Math.cos(rA) * 1400 + Math.sin(rA) * 3500, z1: Math.sin(rA) * 1400 - Math.cos(rA) * 3500 } };
}

/** Turn the wider world on: settlements, geography, a long climate. Safe to call twice (the second call changes nothing). */
export function enableWorld2(world: World, seed = 1, settlements = 3): World2 {
  if (world.world2) return world.world2;
  if (!Number.isInteger(settlements) || settlements < 1 || settlements > SETTLEMENT_NAMES.length) throw new Error(`enableWorld2: settlements must be 1 to ${SETTLEMENT_NAMES.length}, got ${settlements}`);
  const geo = makeGeo(seed);
  const base = world.climate ?? { meanC: 14, seasonalAmpC: 9, dailyAmpC: 5, rainy: 0.3, seed: 7 };
  const w2: World2 = { seed, rng: seed * 7919 + 17, settlements: [], geo, baseClimate: { ...base }, convoys: [], immuneDone: [], resources: { soil: 1, game: 1 }, landCapacity: 14, famineDays: 0, dry: 0, wet: false, acc: { hour: 0, day: 0 }, leaving: {}, origins: {}, huntedSeen: 0, log: [] };
  for (let i = 0; i < settlements; i++) {
    let pos = { x: 0, z: 0 };
    for (let tries = 0; tries < 40; tries++) {
      const a = hash(`s${seed}-${i}-${tries}`) * Math.PI * 2;
      const d = 2400 + 1800 * hash(`d${seed}-${i}-${tries}`);
      pos = { x: Math.cos(a) * d, z: Math.sin(a) * d };
      const inSea = pos.x * geo.sea.nx + pos.z * geo.sea.nz > geo.sea.d - 100;
      const inMountain = geo.mountains.some((m) => dist(pos.x, pos.z, m.x, m.z) < m.r + 150);
      const crowded = w2.settlements.some((s) => dist(s.x, s.z, pos.x, pos.z) < 1500);
      if (!inSea && !inMountain && !crowded) break;
    }
    const temper = hash(`temper${seed}-${i}`);
    w2.settlements.push({ id: `settlement-${i + 1}`, name: SETTLEMENT_NAMES[(i + seed) % SETTLEMENT_NAMES.length]!, x: pos.x, z: pos.z, pop: 12 + Math.floor(10 * hash(`pop${seed}-${i}`)), fertility: 0.8 + 0.2 * hash(`fert${seed}-${i}`), temper, attitude: 0.35 - 0.8 * temper, coastal: isCoastal(geo, pos), strength: 0.4 + 0.5 * hash(`str${seed}-${i}`) });
  }
  world.world2 = w2;
  applyClimate(world, w2);
  return w2;
}

// ---- Long climate ----

/** The turn of the climate away from its base, in degrees, at a time: slow cycles of decades and a longer swing of centuries. */
export function climateDrift(w2: World2, clock: number): { tempC: number; rainy: number } {
  const sign = hash(`drift${w2.seed}`) < 0.5 ? -1 : 1;
  const yr = clock / YEAR;
  const tempC = sign * (2.4 * Math.sin((2 * Math.PI * yr) / 70) + 0.9 * Math.sin((2 * Math.PI * yr) / 23));
  const rainy = 0.08 * Math.sin((2 * Math.PI * yr) / 41 + 2);
  return { tempC, rainy };
}
function applyClimate(world: World, w2: World2) {
  const now = world.clock ?? 0;
  const d = climateDrift(w2, now);
  const b = w2.baseClimate;
  world.climate = { ...b, meanC: b.meanC + d.tempC, rainy: Math.max(0.05, Math.min(0.8, b.rainy + d.rainy)) };
  const era = d.tempC < -1.5 ? "cold" : d.tempC > 1.5 ? "warm" : "mild";
  if (era !== (w2.era ?? "mild")) {
    w2.era = era;
    say(world, w2, era === "cold" ? "The winters have been growing harder, year on year." : era === "warm" ? "The summers have been growing hotter, year on year." : "The seasons have settled back to what they were.");
    tally(world, "climateTurns");
  }
}
/** How good the growing is for a settlement given the climate's drift (colder or drier is poorer). */
const growingFactor = (w2: World2, clock: number) => {
  const d = climateDrift(w2, clock);
  return Math.max(0.55, Math.min(1.15, 1 + 0.06 * d.tempC + 0.5 * d.rainy));
};

// ---- Fire ----

/** How likely fire is to start and run, 0..1, from heat, dry days, wind; nothing when it rains. */
export function fireDanger(world: World): number {
  const w = world.weather;
  const w2 = world.world2;
  if (!w || w.raining || w.snowing) return 0;
  const heat = clamp01((w.tempC - 16) / 14);
  const dry = clamp01(((w2?.dry ?? 0) - 1) / 5);
  const wind = clamp01(w.windMs / 9);
  return clamp01(0.25 * heat + 0.55 * dry + 0.2 * wind) * (heat > 0 ? 1 : 0.2);
}
function fireTick(world: World, w2: World2) {
  const now = world.clock ?? 0;
  const danger = fireDanger(world);
  const fires = world.things.filter((t) => t.kind === "fire");
  if ((world.weather?.rainAmount ?? 0) > 0.3 || world.weather?.snowing) {
    for (const f of fires) world.things.splice(world.things.indexOf(f), 1);
    if (fires.length) say(world, w2, "The rain put the fire out.");
    return;
  }
  // A fire burns out, or spreads in the dry.
  for (const f of fires) {
    f.fuel = (f.fuel ?? 0) - 60;
    if ((f.fuel ?? 0) <= 0) {
      world.things.splice(world.things.indexOf(f), 1);
      continue;
    }
    for (const s of world.things.filter((t) => t.kind === "shelter")) {
      if (dist(s.x, s.z, f.x, f.z) < 9 && rnd(w2) < 0.1 + 0.5 * danger) {
        world.things.splice(world.things.indexOf(s), 1);
        for (const p of world.people) note(p, world, "The shelter burned down.");
        say(world, w2, "Fire burned down the shelter.");
        tally(world, "shelterBurned");
      }
    }
    if (danger > 0.35 && fires.length < 4 && rnd(w2) < 0.08 * danger) {
      const a = rnd(w2) * Math.PI * 2;
      make(world, "fire", f.x + Math.cos(a) * 6, f.z + Math.sin(a) * 6, { fuel: 0.1 * DAY, radius: 3, prefab: "Campfire" });
      tally(world, "fireSpread");
    }
  }
  if (danger < 0.45) return;
  // A fire left alone in the dry may escape.
  for (const c of world.things) {
    if (c.kind !== "campfire" || (c.fuel ?? 0) <= 0) continue;
    if (world.people.some((p) => dist(p.x, p.z, c.x, c.z) < 10)) continue;
    if (rnd(w2) < 0.12 * danger) ignite(world, w2, c.x + 2, c.z + 1, "A fire left alone escaped into the dry grass.");
  }
  // Lightning, rarely, near the camp.
  const camp = world.things.find((t) => t.kind === "shelter") ?? world.things.find((t) => t.kind === "campfire");
  if (camp && rnd(w2) < (0.03 * danger * danger) / 24) {
    const a = rnd(w2) * Math.PI * 2;
    ignite(world, w2, camp.x + Math.cos(a) * 14, camp.z + Math.sin(a) * 14, "Lightning set the dry grass alight.");
  }
  void now;
}
function ignite(world: World, w2: World2, x: number, z: number, text: string) {
  if (world.things.filter((t) => t.kind === "fire").length >= 4) return;
  make(world, "fire", x, z, { fuel: 0.15 * DAY, radius: 3, prefab: "Campfire" });
  say(world, w2, text);
  tally(world, "wildfires");
}

// ---- Settlements, trade, war, migration, epidemics ----

const homeCentre = { x: 0, z: 0 };
function homeFolk(world: World) {
  return world.people.filter((p) => !p.stranger);
}
function infectHome(world: World, w2: World2, name: string, severity: number, n: number): number {
  let got = 0;
  const pool = homeFolk(world).filter((p) => !p.illness && !bodyOf(p).immune.includes(name));
  for (let i = 0; i < n && pool.length; i++) {
    const p = pool.splice(Math.floor(rnd(w2) * pool.length), 1)[0]!;
    p.illness = { severity, since: world.clock ?? 0 };
    bodyOf(p).sickWith = name;
    note(p, world, `Fell ill with ${name}.`);
    got++;
  }
  if (got) {
    if (!w2.epidemic || w2.epidemic.name !== name) w2.epidemic = { name, origin: "elsewhere", since: world.clock ?? 0, severity, homeCases: 0 };
    w2.epidemic.homeCases += got;
    if (w2.epidemic.homeCases === got) say(world, w2, `${name[0]!.toUpperCase()}${name.slice(1)} has come to the camp.`);
    tally(world, "epidemicCases");
  }
  return got;
}
function arrive(world: World, w2: World2, c: Convoy) {
  const s = w2.settlements.find((q) => q.id === c.from);
  if (!s) return;
  const now = world.clock ?? 0;
  const folk = homeFolk(world);
  if (c.sick && !w2.immuneDone.includes(c.sick)) infectHome(world, w2, c.sick, w2.epidemic?.severity ?? 0.5, Math.min(2, Math.max(1, Math.ceil(c.n / 2))));
  if (c.bed) {
    const target = folk.filter((p) => p.age >= ADULT_AGE)[Math.floor(rnd(w2) * Math.max(1, folk.filter((p) => p.age >= ADULT_AGE).length))];
    if (target) infectBed(target, world);
  }
  if (c.kind === "trade") {
    const shelters = world.things.filter((t) => t.kind === "shelter");
    const larder = shelters.reduce((a, t) => a + (t.stock ?? 0), 0);
    if (larder >= 6) {
      // The home people sell food and take hides and seed.
      let owed = 3;
      for (const sh of shelters) {
        const take = Math.min(owed, sh.stock ?? 0);
        sh.stock = (sh.stock ?? 0) - take;
        owed -= take;
      }
      const hands = folk.filter((p) => p.age >= ADULT_AGE).slice(0, 2);
      for (const p of hands) {
        p.carry.hide = (p.carry.hide ?? 0) + 1;
        p.carry.seed += 1;
        note(p, world, `Traded with the people of ${s.name}: food for hides and seed.`);
      }
      for (const p of folk) p.clothing = Math.min(1, (p.clothing ?? 0) + 0.15);
    } else if (s.fertility > 0.6) {
      // The home people are short and the visitors have food to spare, for wood.
      let wood = 0;
      for (const p of folk) {
        const give = Math.min(2, p.carry.wood);
        p.carry.wood -= give;
        wood += give;
      }
      const sh = shelters[0];
      if (sh) sh.stock = (sh.stock ?? 0) + 2 + Math.min(3, wood);
    }
    s.lastTrade = now;
    s.attitude = Math.min(1, s.attitude + 0.15);
    for (const p of folk) feel(p, "joy", 0.1);
    say(world, w2, `A trading party from ${s.name} came to the camp.`);
    tally(world, "settlementTrades");
  } else if (c.kind === "raid") raid(world, w2, s, c);
  else migrate(world, w2, s, c);
}
function raid(world: World, w2: World2, s: Settlement, c: Convoy) {
  const now = world.clock ?? 0;
  const folk = homeFolk(world);
  const defenders = folk.filter((p) => p.age >= ADULT_AGE && p.health > 0.4);
  const defence = defenders.reduce((a, p) => a + muscleOf(p) * (p.tools.spear ? 1.6 : 1), 0);
  const attack = c.n * (0.45 + 0.4 * s.strength);
  w2.war = { with: s.id, since: w2.war?.since ?? now, raids: (w2.war?.raids ?? 0) + 1 };
  s.lastRaid = now;
  tally(world, "raids");
  const near = folk;
  if (defence >= attack) {
    const lost = Math.max(1, Math.ceil(c.n * 0.4));
    s.pop = Math.max(0, s.pop - lost);
    s.strength = Math.max(0.1, s.strength - 0.1);
    s.attitude = Math.max(-1, s.attitude - 0.05);
    const hurt = defenders[Math.floor(rnd(w2) * defenders.length)];
    if (hurt) {
      hurt.wound = Math.max(hurt.wound ?? 0, 0.3 + 0.3 * rnd(w2));
      note(hurt, world, `Fought off raiders from ${s.name}.`);
    }
    for (const p of near) feel(p, "fear", 0.3);
    say(world, w2, `Raiders from ${s.name} were driven off.`);
    tally(world, "raidsRepelled");
  } else {
    const shelters = world.things.filter((t) => t.kind === "shelter");
    for (const sh of shelters) sh.stock = Math.floor((sh.stock ?? 0) * 0.3);
    for (const p of near) {
      p.carry.food = Math.floor(p.carry.food * 0.3);
      feel(p, "fear", 0.6);
      feel(p, "anger", 0.4);
    }
    const hurt = defenders.slice(0, 2);
    for (const p of hurt) p.wound = Math.max(p.wound ?? 0, 0.5);
    if (defence < attack * 0.5 && defenders.length) {
      const dead = defenders[Math.floor(rnd(w2) * defenders.length)]!;
      dead.health = Math.min(dead.health, 0.02);
      dead.cause = "a raid";
    }
    s.attitude = Math.min(1, s.attitude + 0.1);
    say(world, w2, `Raiders from ${s.name} took the stores.`);
    tally(world, "raidsLost");
  }
}
function migrate(world: World, w2: World2, s: Settlement, c: Convoy) {
  const room = (world.maxPeople ?? 12) - world.people.length;
  const n = Math.min(c.n, Math.max(0, room));
  if (n <= 0) {
    say(world, w2, `People from ${s.name} came looking for a place and were told there was no room.`);
    return;
  }
  const a = hash(`mig${w2.seed}-${world.clock}`) * Math.PI * 2;
  const R = world.radius ?? 40;
  for (let i = 0; i < n; i++) {
    const sex: "m" | "f" = rnd(w2) < 0.5 ? "m" : "f";
    const names = MIGRANT_NAMES[sex];
    const taken = new Set([...world.people, ...(world.dead ?? []).map((d) => d.person)].map((q) => q.name));
    const name = names.find((q) => !taken.has(q)) ?? `${sex === "m" ? "Wanderer" : "Wanderess"} ${(world.built ?? 0) + 1}`;
    const id = `migrant-${(world.built = (world.built ?? 0) + 1)}`;
    const p = makePerson(id, Math.cos(a) * R * 0.95 + i, Math.sin(a) * R * 0.95, Math.floor(rnd(w2) * 1e9), { boldness: rnd(w2), sociability: 0.3 + 0.6 * rnd(w2), curiosity: rnd(w2), appetite: rnd(w2), patience: rnd(w2) }, { name, sex, age: 18 + Math.floor(rnd(w2) * 14) });
    p.needs.hunger = 0.6;
    p.needs.thirst = 0.5;
    p.carry.food = 1;
    w2.origins[id] = s.id;
    if (c.sick && !w2.immuneDone.includes(c.sick)) {
      p.illness = { severity: w2.epidemic?.severity ?? 0.4, since: world.clock ?? 0 };
      bodyOf(p).sickWith = c.sick;
    }
    if (world.strangers) p.stranger = { since: world.clock ?? 0 };
    world.people.push(p);
    tally(world, "migrantsArrived");
  }
  say(world, w2, `${n} ${n === 1 ? "person" : "people"} from ${s.name} came to the edge of the land, looking for a place.`);
}
function leaveFor(world: World, w2: World2, p: Person, s: Settlement) {
  w2.leaving[p.id] = { to: s.id, since: world.clock ?? 0 };
  const R = world.radius ?? 40;
  const a = Math.atan2(s.z, s.x);
  p.intent = { kind: "wander", x: Math.cos(a) * R * 1.05, z: Math.sin(a) * R * 1.05, speed: 1.6, remaining: 2, arrived: false };
  note(p, world, `I am leaving for ${s.name}, where there is more.`);
}
function leavingTick(world: World, w2: World2) {
  const now = world.clock ?? 0;
  const R = world.radius ?? 40;
  for (const id of Object.keys(w2.leaving)) {
    const rec = w2.leaving[id]!;
    const p = world.people.find((q) => q.id === id);
    if (!p) {
      delete w2.leaving[id];
      continue;
    }
    // Thirst and hunger come first: a person parched or starving does not set out.
    if (p.needs.thirst > 0.85 || p.needs.hunger > 0.85) {
      delete w2.leaving[id];
      note(p, world, "I cannot leave yet. I must eat and drink first.");
      continue;
    }
    if (hypot2(p.x, p.z) > R || now - rec.since > 1.5 * DAY) {
      const s = w2.settlements.find((q) => q.id === rec.to)!;
      world.people.splice(world.people.indexOf(p), 1);
      s.pop += 1;
      delete w2.leaving[id];
      say(world, w2, `${p.name} left for ${s.name}.`);
      tally(world, "emigrants");
    }
  }
}
function dayTick(world: World, w2: World2) {
  const now = world.clock ?? 0;
  applyClimate(world, w2);
  w2.dry = w2.wet || !world.weather ? 0 : w2.dry + 1;
  w2.wet = false;
  const folk = homeFolk(world);
  const grow = growingFactor(w2, now);
  // The home land: worn by too many mouths and too much hunting, mended when it is left alone.
  const load = folk.length / w2.landCapacity;
  const hunted = world.tally?.hunted ?? 0;
  const huntedToday = hunted - w2.huntedSeen;
  w2.huntedSeen = hunted;
  w2.resources.soil = Math.max(0.05, Math.min(1, w2.resources.soil + 0.02 * (0.75 - load) - (w2.dry > 8 ? 0.004 : 0)));
  w2.resources.game = Math.max(0.05, Math.min(1, w2.resources.game + 0.008 * (1 - w2.resources.game) - 0.01 * huntedToday));
  if (w2.resources.soil < 0.3) {
    w2.famineDays++;
    if (w2.famineDays === 3) {
      say(world, w2, "The land is spent. There is not enough growing to feed everyone.");
      tally(world, "landSpent");
    }
  } else w2.famineDays = 0;
  // Settlements.
  for (const s of w2.settlements) {
    if (s.collapsedAt !== undefined) {
      if (now - s.collapsedAt > 12 * DAY) {
        s.collapsedAt = undefined;
        s.pop = 4;
        s.fertility = 0.6;
        s.attitude = 0.1;
        say(world, w2, `New people settled at ${s.name}.`);
      }
      continue;
    }
    const cap = Math.max(2, 36 * s.fertility * grow * (s.coastal ? 1.3 : 1));
    s.pop = Math.max(0, s.pop + s.pop * 0.02 * (1 - s.pop / cap));
    s.fertility = Math.max(0.02, Math.min(1, s.fertility + (s.pop > cap * 0.85 ? -0.02 : 0.006)));
    if (s.sick && (s.sickUntil ?? 0) <= now) {
      (s.immune ??= []).push(s.sick);
      s.sick = undefined;
      s.sickUntil = undefined;
    }
    if (s.sick) s.pop *= 1 - 0.06 * (w2.epidemic?.severity ?? 0.5);
    if (s.fertility < 0.25) s.pop *= 0.92; // famine
    const base = 0.35 - 0.8 * s.temper;
    s.attitude = Math.max(-1, Math.min(1, s.attitude + (base - s.attitude) * 0.04 - (s.fertility < 0.45 ? 0.04 : 0)));
    if (s.pop < 3) {
      const survivors = Math.round(s.pop);
      s.collapsedAt = now;
      s.pop = 0;
      say(world, w2, `${s.name} has been abandoned.`);
      tally(world, "settlementsCollapsed");
      if (survivors >= 1) w2.convoys.push({ kind: "migrants", from: s.id, depart: now, arrive: now + Math.min(10, travelDays(w2.geo, s, homeCentre)) * DAY, n: survivors, sick: s.sick });
    }
  }
  // Journeys.
  const room = (world.maxPeople ?? 12) - world.people.length;
  for (const s of w2.settlements) {
    if (s.collapsedAt !== undefined || s.pop < 3) continue;
    const days = travelDays(w2.geo, s, homeCentre);
    if (!Number.isFinite(days) || days > 12) continue;
    const enRoute = w2.convoys.some((c) => c.from === s.id);
    if (enRoute) continue;
    const go = (kind: Convoy["kind"], n: number) => w2.convoys.push({ kind, from: s.id, depart: now, arrive: now + days * DAY, n, sick: s.sick, bed: kind === "trade" && rnd(w2) < 0.03 });
    if (s.attitude < -0.3 && s.pop >= 8 && rnd(w2) < 0.025) go("raid", Math.min(6, Math.round(s.pop * 0.2)));
    else if ((s.fertility < 0.3 || s.sick) && s.attitude > -0.4 && room > 0 && rnd(w2) < 0.05) go("migrants", 1 + Math.floor(rnd(w2) * 2.5));
    else if (s.attitude > 0.15 && rnd(w2) < 0.06) go("trade", 2 + Math.floor(rnd(w2) * 3));
  }
  if (w2.war) {
    const foe = w2.settlements.find((s) => s.id === w2.war!.with);
    if (!foe || foe.attitude > 0.1 || foe.collapsedAt !== undefined) {
      say(world, w2, foe && foe.collapsedAt === undefined ? `Peace with ${foe.name}.` : "The war is over; the raiders are no more.");
      w2.war = undefined;
    }
  }
  // Epidemics: one begins now and then where people crowd on worn land, spreads along the roads, and ends in immunity.
  if (!w2.epidemic) {
    const pick = w2.settlements.filter((s) => s.collapsedAt === undefined && s.pop > 10);
    for (const s of pick) {
      if (rnd(w2) < 0.003 + 0.01 * clamp01(s.pop / 30) * (1 - s.fertility)) {
        const name = EPIDEMICS[Math.floor(rnd(w2) * EPIDEMICS.length)]!;
        w2.epidemic = { name, origin: s.id, since: now, severity: 0.35 + 0.4 * rnd(w2), homeCases: 0 };
        s.sick = name;
        s.sickUntil = now + (8 + 4 * rnd(w2)) * DAY;
        say(world, w2, `${name[0]!.toUpperCase()}${name.slice(1)} has broken out in ${s.name}.`);
        tally(world, "epidemics");
        break;
      }
    }
  } else {
    const e = w2.epidemic;
    // Between neighbours.
    for (const s of w2.settlements) {
      if (!s.sick || s.collapsedAt !== undefined) continue;
      for (const o of w2.settlements) {
        if (o === s || o.sick || o.immune?.includes(e.name) || o.collapsedAt !== undefined || dist(o.x, o.z, s.x, s.z) > 4500) continue;
        if (rnd(w2) < 0.1) {
          o.sick = e.name;
          o.sickUntil = now + (8 + 4 * rnd(w2)) * DAY;
          say(world, w2, `${e.name[0]!.toUpperCase()}${e.name.slice(1)} has reached ${o.name}.`);
          tally(world, "epidemicSpread");
        }
      }
    }
    const anyone = w2.settlements.some((s) => s.sick) || folk.some((p) => p.body?.sickWith === e.name);
    if (!anyone) {
      if (!w2.immuneDone.includes(e.name)) w2.immuneDone.push(e.name);
      say(world, w2, `${e.name[0]!.toUpperCase()}${e.name.slice(1)} has passed.`);
      w2.epidemic = undefined;
    }
  }
  // Leaving home: when the land is spent, the stores gone or the people sunk, someone who is able goes where there is more.
  const hungry = folk.length > 0 && folk.reduce((a, p) => a + p.needs.hunger, 0) / folk.length > 0.7;
  const pressed = w2.famineDays >= 3 || hungry || (w2.war?.raids ?? 0) >= 2;
  if (pressed && folk.length > 3 && Object.keys(w2.leaving).length === 0) {
    const goers = folk.filter((p) => p.age >= ADULT_AGE && !p.pregnant && !p.life?.partner && p.needs.thirst < 0.7 && p.needs.hunger < 0.85 && !(p.age > 40));
    const dest = w2.settlements.filter((s) => s.collapsedAt === undefined && s.fertility > 0.5 && s.attitude > -0.3 && Number.isFinite(travelDays(w2.geo, s, homeCentre))).sort((a, b) => b.fertility - a.fertility)[0];
    if (goers.length && dest && rnd(w2) < 0.1) leaveFor(world, w2, goers[Math.floor(rnd(w2) * goers.length)]!, dest);
  }
}

/** The home people send food as a gift to put an end to raiding. Returns whether it was sent. */
export function giftToSettlement(world: World, id: string, meals = 4): boolean {
  const w2 = need2(world);
  const s = w2.settlements.find((q) => q.id === id);
  if (!s) throw new Error(`giftToSettlement: no settlement ${id}`);
  const shelters = world.things.filter((t) => t.kind === "shelter");
  let owed = meals;
  for (const sh of shelters) {
    const take = Math.min(owed, sh.stock ?? 0);
    sh.stock = (sh.stock ?? 0) - take;
    owed -= take;
  }
  if (owed === meals) return false;
  s.attitude = Math.min(1, s.attitude + 0.1 * (meals - owed));
  tally(world, "giftsToSettlements");
  return true;
}

// ---- Domestic animals ----

export const LIVESTOCK = new Set(["cow", "alpaca", "donkey", "horse"]);
const FEEDINGS: Record<string, number> = { cow: 3, alpaca: 4, donkey: 3, horse: 5 };
/** Feed a beast to win its trust; when it has had enough it follows them home and is theirs. Returns whether this was a livestock feeding. */
export function tameLivestock(world: World, person: Person, animal: Thing): boolean {
  if (!LIVESTOCK.has(animal.kind)) return false;
  if (animal.of || dist(person.x, person.z, animal.x, animal.z) >= 3.8 || person.carry.food < 1) return true;
  person.carry.food -= 1;
  animal.trust = (animal.trust ?? 0) + 1;
  if (animal.trust >= FEEDINGS[animal.kind]!) {
    animal.of = person.id;
    note(person, world, `The ${animal.kind} follows me now. It is mine.`);
    chronicle(world, `${person.name} won a ${animal.kind}.`);
    feel(person, "joy", 0.4);
    tally(world, "livestockTamed");
    learnHerding(world, person, animal);
    tally(world, "domesticated");
  } else note(person, world, `Fed a ${animal.kind}. It let me near.`);
  return true;
}
export const herdOf = (world: World, person: Person) => world.things.filter((t) => t.of === person.id && LIVESTOCK.has(t.kind));
/** Options to win a beast: with food in hand, near one they have seen, and not already holding a herd of three. */
export function livestockOptions(person: Person, world: World): { intent: { kind: "tame"; targetId: string; x: number; z: number; speed: number; remaining: number }; score: number }[] {
  if (person.age < ADULT_AGE || person.carry.food < 1 || person.needs.hunger >= 0.6 || person.needs.thirst >= 0.6) return [];
  const mine = herdOf(world, person).length;
  if (mine >= 3) return [];
  const out = [];
  for (const t of world.things) {
    if (!LIVESTOCK.has(t.kind) || t.of || !person.memory.has(t.id)) continue;
    const d = dist(person.x, person.z, t.x, t.z);
    if (d > 40) continue;
    out.push({ intent: { kind: "tame" as const, targetId: t.id, x: t.x, z: t.z, speed: 1.6, remaining: 0.3 }, score: 0.3 + 0.2 * person.personality.sociability + 0.1 * person.personality.curiosity - d / 100 - 0.15 * mine });
  }
  return out;
}
function livestockTick(world: World, minute: number) {
  const day = Math.floor((world.clock ?? 0) / DAY);
  const daily = day !== Math.floor(((world.clock ?? 0) - 60) / DAY);
  const home = world.things.find((t) => t.kind === "shelter") ?? world.things.find((t) => t.kind === "campfire");
  for (const t of world.things) {
    if (!t.of || !LIVESTOCK.has(t.kind)) continue;
    const owner = world.people.find((p) => p.id === t.of);
    if (!owner) {
      t.of = undefined; // the owner is gone: the beast goes back to the herd
      t.trust = 0;
      continue;
    }
    // It stays near home.
    if (home && t.mob && dist(t.x, t.z, home.x, home.z) > 30 && t.mob.state !== "flee") {
      t.mob.tx = home.x + (hash(`${t.id}${day}`) - 0.5) * 16;
      t.mob.tz = home.z + (hash(`${t.id}z${day}`) - 0.5) * 16;
    }
    if (!daily) continue;
    if (t.kind === "cow" && t.maxStock !== undefined && (t.stock ?? 0) < t.maxStock) {
      t.stock = (t.stock ?? 0) + 1;
      tally(world, "milk");
    } else if (t.kind === "alpaca" && day % 4 === 0) {
      owner.clothing = Math.min(1, (owner.clothing ?? 0) + 0.25);
      tally(world, "wool");
    } else if (t.kind === "donkey" && owner.carry.wood < 3) {
      owner.carry.wood += 1;
      tally(world, "hauled");
    }
  }
  void minute;
}

// ---- The step ----

/** Called once a step, after the garden has regrown. Does nothing for a world that has not asked for the wider world, except the herds. */
export function world2Step(world: World, dt: number) {
  const now = world.clock ?? 0;
  const w2 = world.world2;
  if (Math.floor(now / 60) !== Math.floor((now - dt) / 60)) livestockTick(world, Math.floor(now / 60));
  if (!w2) return;
  if (world.weather?.raining) w2.wet = true;
  // Poor land slows the regrowth the step has just given.
  const soil = w2.resources.soil;
  if (soil < 0.95 && world.weather) {
    const lost = dt * growthRate(world.weather) * (1 - (0.2 + 0.8 * soil));
    for (const t of world.things) if (t.maxStock !== undefined && (t.growth ?? 0) > 0) t.growth = Math.max(0, (t.growth ?? 0) - lost);
  }
  w2.acc.hour += dt;
  while (w2.acc.hour >= 60) {
    w2.acc.hour -= 60;
    fireTick(world, w2);
  }
  w2.acc.day += dt;
  while (w2.acc.day >= DAY) {
    w2.acc.day -= DAY;
    dayTick(world, w2);
  }
  // Arrivals.
  for (let i = w2.convoys.length - 1; i >= 0; i--) {
    const c = w2.convoys[i]!;
    if (c.arrive > now) continue;
    w2.convoys.splice(i, 1);
    arrive(world, w2, c);
  }
  leavingTick(world, w2);
}

/** What the page can show of the wider world. */
export function world2Summary(world: World): string[] {
  const w2 = world.world2;
  if (!w2) return [];
  const out = w2.settlements.map((s) => `${s.name}: ${s.collapsedAt !== undefined ? "abandoned" : `${Math.round(s.pop)} people, ${s.attitude > 0.15 ? "friendly" : s.attitude < -0.3 ? "hostile" : "wary"}${s.sick ? `, ${s.sick}` : ""}`} (${travelDays(w2.geo, s, homeCentre).toFixed(1)} days away)`);
  if (w2.epidemic) out.push(`Sickness: ${w2.epidemic.name}`);
  if (w2.war) out.push("At war");
  return out;
}
export const _testing = { dayTick, fireTick, arrive, hash };
