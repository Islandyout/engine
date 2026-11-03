// Making things and working them out: a large space of inventions where each needs ones that came before (a pot needs a basket, a kiln a pot,
// copper a kiln), farms, tame animals, metals, wheels, boats and bridges, and shared work that takes people many days.
//
// A person who knows a craft makes what it makes (fetching the stone, clay, fibre or ore it takes), and a curious one who knows what a new thing
// needs tries it and sometimes hits on it. What one knows is in person.ideas, so telling passes it on (culture.ts exchangeIdeas) and a death
// can lose it. The things they make are used by `work` intents, one verb to a kind of thing (cook at a pot, row a boat, cross a bridge).
// Chances come from a hash of who, when and what, not from the person's own random stream.
import { DAY } from "./earth";
import { feel as feelEmotion } from "./inner";
import { INVENTIONS } from "./culture";
import { psycheEvent } from "./psyche";
import { homeOf, nearest } from "./reason";
import { analogyFor, believes, methodOf, teachMethod, watchCauses, witness } from "./wisdom";
import { ADULT_AGE, AFFORDANCES, chronicle, isNight, make, note, relation, routeAround, tally, thingById, type Intent, type Person, type Thing, type World } from "./mind";

type Option = { intent: Omit<Intent, "arrived">; score: number };

// ---- State ----

export interface Job {
  act: string; // the intent's target: "get:stone:rock-1", "make:pot", "use:pot-4", ...
  x: number;
  z: number;
  v: number; // how much they want it, 0..1
  why: string;
  made: number;
  dest?: { x: number; z: number }; // crossing: where they are going
}
export interface Tech {
  mat: Record<string, number>; // stone, clay, fibre, ore, copper, bronze, iron, flour
  tools: string[]; // what they own
  tried: Record<string, number>; // tries at a new thing
  seen: Record<string, number>; // times they have watched another use a kind of thing safely
  used: Record<string, number>; // times they have used a kind of thing themselves
  watchAt: Record<string, number>; // wisdom.ts
  wrong: string[]; // beliefs they gave up
  method: number; // 0..0.6: how well they go about working a thing out
  thinkAt: number;
  declinedAt: Record<string, number>;
  job?: Job;
  afloat?: boolean; // on the water or a bridge: nothing keeps them out of it
  route?: { id: string; x: number; z: number; speed: number }; // where they are being carried, until they land
}
export const techOf = (p: Person): Tech => (p.tech ??= { mat: {}, tools: [], tried: {}, seen: {}, used: {}, watchAt: {}, wrong: [], method: 0, thinkAt: -1e9, declinedAt: {} });

/** Work that takes many hands: a bridge, a granary. */
export interface Project {
  id: string;
  kind: "bridge" | "granary";
  x: number;
  z: number;
  need: { wood: number; food: number };
  laid: { wood: number; food: number };
  by: string[];
  started: number;
  thing: string; // the thing that stands for it
  done?: number;
}

// ---- The space of inventions ----

export interface Craft {
  id: string;
  name: string;
  group: string;
  needs: string[]; // ideas that must be known first
  cost: Record<string, number>; // wood, hide, seed from the pack; anything else from what they have gathered
  at: "anywhere" | "camp" | "water" | "field" | "kiln";
  out: { thing?: string; tool?: boolean; mat?: Record<string, number> };
  want: number; // how much they want one, 0..1
  effect: string;
  how?: "project" | "taming"; // not found by trying
}
const C = (id: string, name: string, group: string, needs: string[], cost: Record<string, number>, at: Craft["at"], out: Craft["out"], want: number, effect: string, how?: Craft["how"]): Craft => ({ id, name, group, needs, cost, at, out, want, effect, how });
export const CRAFTS: Craft[] = [
  C("stone-knife", "a stone knife", "craft", [], { stone: 1 }, "anywhere", { tool: true }, 0.5, "an edge that cuts what hands cannot"),
  C("digging-stick", "a digging stick", "craft", [], { wood: 1 }, "anywhere", { tool: true }, 0.5, "turns the soil"),
  C("rope", "rope", "craft", [], { fibre: 2 }, "anywhere", { tool: true }, 0.5, "twisted fibre that holds"),
  C("basket", "a basket", "craft", ["rope"], { fibre: 2 }, "anywhere", { tool: true }, 0.4, "carries and stores"),
  C("spindle", "a spindle", "craft", ["rope"], { wood: 1, fibre: 1 }, "anywhere", { tool: true }, 0.35, "spins fibre into thread"),
  C("loom", "a loom", "craft", ["spindle"], { wood: 3, fibre: 2 }, "camp", { thing: "loom" }, 0.4, "weaves thread into cloth for cloaks"),
  C("bow", "a bow", "craft", ["rope", "stone-knife"], { wood: 2, fibre: 1 }, "anywhere", { tool: true }, 0.45, "hunts from a distance: the owner can hunt as with a spear"),
  C("fish-hook", "a fish hook", "craft", ["stone-knife"], { stone: 1 }, "anywhere", { tool: true }, 0.3, "a barb that holds a fish"),
  C("fishing-pole", "a fishing pole", "craft", ["fish-hook", "rope"], { wood: 1, fibre: 1 }, "anywhere", { tool: true }, 0.35, "better catches from the bank"),
  C("clay-pot", "a clay pot", "craft", ["basket"], { clay: 3 }, "camp", { thing: "pot" }, 0.5, "cooks a meal that feeds more than raw food does"),
  C("spit", "a spit", "craft", ["stone-knife"], { wood: 2 }, "camp", { thing: "spit" }, 0.35, "roasts meat over a fire"),
  C("kiln", "a kiln", "craft", ["clay-pot"], { clay: 4, stone: 2, wood: 2 }, "camp", { thing: "kiln" }, 0.4, "a fire hot enough to bake clay and smelt ore"),
  C("oven", "an oven", "craft", ["kiln", "clay-pot"], { clay: 4, stone: 3 }, "camp", { thing: "oven" }, 0.4, "bakes bread and feeds a household"),
  C("quern", "a quern", "craft", ["stone-knife"], { stone: 3 }, "camp", { thing: "quern" }, 0.3, "grinds grain to flour"),
  C("hoe", "a hoe", "farm", ["digging-stick"], { wood: 1, stone: 1 }, "anywhere", { tool: true }, 0.45, "fields give more"),
  C("sickle", "a sickle", "farm", ["stone-knife", "hoe"], { wood: 1, stone: 1 }, "anywhere", { tool: true }, 0.3, "a quicker harvest"),
  C("farming", "farming", "farm", ["digging-stick"], { seed: 1 }, "field", { thing: "field" }, 0.6, "a field sown on purpose, tended, that feeds far more than wild plants"),
  C("irrigation", "irrigation", "farm", ["farming", "rope"], { wood: 2, stone: 2 }, "field", { thing: "channel" }, 0.35, "water led to the field: it grows faster and holds more"),
  C("herding", "herding", "farm", ["rope"], {}, "camp", {}, 0, "animals kept, fed and led", "taming"),
  C("yoke", "a yoke", "farm", ["herding", "rope"], { wood: 2, fibre: 1 }, "anywhere", { tool: true }, 0.3, "harnesses an animal to a load"),
  C("plough", "a plough", "farm", ["hoe", "yoke"], { wood: 3, stone: 2 }, "anywhere", { tool: true }, 0.35, "fields hold half as much again"),
  C("pen", "a pen", "farm", ["rope", "herding"], { wood: 4, fibre: 1 }, "camp", { thing: "pen" }, 0.4, "tame animals stay by it"),
  C("dog-bed", "a dog bed", "farm", ["basket"], { fibre: 2, wood: 1 }, "camp", { thing: "dog-bed" }, 0.25, "a dog keeps to it, near its owner"),
  C("wheel", "the wheel", "wheels", ["rope", "digging-stick"], { wood: 3, stone: 1 }, "anywhere", { tool: true }, 0.3, "a disc that turns on an axle"),
  C("cart", "a cart", "wheels", ["wheel", "yoke"], { wood: 4, fibre: 1 }, "anywhere", { tool: true }, 0.3, "carries wood in loads of eight"),
  C("potters-wheel", "a potter's wheel", "wheels", ["wheel", "clay-pot"], { wood: 2, clay: 2 }, "anywhere", { tool: true }, 0.25, "even pots that hold more: a pot feeds six"),
  C("copper", "copper", "metal", ["kiln"], { ore: 2, wood: 2 }, "kiln", { mat: { copper: 2 } }, 0.35, "a red metal that runs from the ore"),
  C("bronze", "bronze", "metal", ["copper"], { ore: 1, copper: 2, wood: 2 }, "kiln", { mat: { bronze: 2 } }, 0.3, "copper made hard"),
  C("bellows", "bellows", "metal", ["kiln", "rope"], { wood: 2, fibre: 2 }, "anywhere", { tool: true }, 0.3, "blows a fire hotter"),
  C("iron", "iron", "metal", ["bronze", "bellows"], { ore: 3, wood: 3 }, "kiln", { mat: { iron: 1 } }, 0.25, "a metal harder than bronze"),
  C("bronze-axe", "a bronze axe", "metal", ["bronze"], { bronze: 2, wood: 1 }, "anywhere", { tool: true }, 0.3, "wood comes in half again as fast"),
  C("iron-axe", "an iron axe", "metal", ["iron"], { iron: 1, wood: 1 }, "anywhere", { tool: true }, 0.25, "wood comes in twice as fast"),
  C("raft", "a raft", "water", ["rope"], { wood: 4, fibre: 1 }, "water", { thing: "raft" }, 0.35, "carries one across calm water"),
  C("boat", "a boat", "water", ["raft", "stone-knife"], { wood: 6, fibre: 1 }, "water", { thing: "boat" }, 0.4, "carries people across water and out to fish"),
  C("oar", "an oar", "water", ["boat"], { wood: 1 }, "anywhere", { tool: true }, 0.2, "a steadier stroke on the water"),
  C("sail", "a sail", "water", ["boat", "loom"], { wood: 2, fibre: 3 }, "anywhere", { tool: true }, 0.2, "the wind does the rowing"),
  C("plank", "planks", "water", ["stone-knife", "rope"], { wood: 2 }, "anywhere", { tool: true }, 0.35, "a flat way over a gap"),
  C("bridge", "a bridge", "water", ["plank", "rope"], {}, "water", {}, 0, "a way across the water that anyone can walk", "project"),
  C("granary", "a granary", "farm", ["basket", "plank"], {}, "camp", {}, 0, "a store the whole camp fills for winter", "project"),
  C("ball", "a ball", "play", ["rope"], { fibre: 2 }, "camp", { thing: "ball" }, 0.25, "something to throw and chase"),
  C("flute", "a flute", "play", ["stone-knife"], { wood: 1 }, "camp", { thing: "flute" }, 0.25, "a tune for the evening"),
  C("drum", "a drum", "play", ["basket"], { wood: 2, fibre: 1 }, "camp", { thing: "drum" }, 0.25, "a beat to dance to"),
  C("swing", "a swing", "play", ["rope"], { wood: 3, fibre: 1 }, "camp", { thing: "swing" }, 0.25, "a seat on a rope"),
  C("well", "a well", "farm", ["digging-stick", "basket"], { wood: 2, stone: 3 }, "camp", { thing: "well" }, 0.3, "water near the camp"),
  C("hive", "a beehive", "farm", ["basket"], { wood: 1, fibre: 1 }, "camp", { thing: "hive" }, 0.25, "honey from kept bees"),
];
export const craftOf = (id: string) => CRAFTS.find((c) => c.id === id);
/** How many things there are to know: the three found by trying with wood and hide (culture.ts) and everything here. */
export const inventionCount = () => INVENTIONS.length + CRAFTS.length;
/** How many of them have been found so far, in this world. */
export const inventionsFound = (world: World) => [...INVENTIONS, ...CRAFTS].filter((c) => world.knowledge?.[c.id]).length;
export const techName = (id: string) => craftOf(id)?.name;

const has = (p: Person, id: string) => !!p.ideas?.includes(id);
export const ready = (p: Person, c: Craft) => !has(p, c.id) && c.needs.every((n) => has(p, n));
const dist = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const WALK = 1.6;

// The same kind of chance heart.ts uses: from who, when and what, so adding it does not shift every other choice a seeded life makes.
export const chance = (id: string, world: World, salt: string, every = 5) => {
  let h = 2166136261;
  const s = `${id}|${Math.floor((world.clock ?? 0) / every)}|${salt}`;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
};

const WOOD_SOURCE = (t: Thing) => !!AFFORDANCES[t.kind]?.wood;
const MAT_SOURCE: Record<string, (t: Thing) => boolean> = {
  stone: (t) => t.kind === "rock" || t.kind === "peak",
  clay: (t) => !!AFFORDANCES[t.kind]?.water && !!AFFORDANCES[t.kind]?.fish,
  fibre: WOOD_SOURCE,
  ore: (t) => t.kind === "peak" || t.kind === "rock",
};
const MAT_GAIN: Record<string, number> = { stone: 2, clay: 2, fibre: 3, ore: 2 };
const MAT_CAP = 8;

const axe = (t: Tech) => (t.tools.includes("iron-axe") ? 2 : t.tools.includes("bronze-axe") ? 1.5 : 1);
const woodCap = (t: Tech) => (t.tools.includes("cart") ? 16 : 10);
const woodGain = (t: Tech) => Math.round((t.tools.includes("cart") ? 8 : 3) * axe(t));

/** What is short of the cost: the first thing they must fetch, or nothing. */
function lacking(p: Person, cost: Record<string, number>): string | undefined {
  const t = techOf(p);
  for (const [k, n] of Object.entries(cost)) {
    const have = k === "wood" ? p.carry.wood : k === "hide" ? (p.carry.hide ?? 0) : k === "seed" ? p.carry.seed : (t.mat[k] ?? 0);
    if (have < n) return k;
  }
  return undefined;
}
function pay(p: Person, cost: Record<string, number>) {
  const t = techOf(p);
  for (const [k, n] of Object.entries(cost)) {
    if (k === "wood") p.carry.wood -= n;
    else if (k === "hide") p.carry.hide = (p.carry.hide ?? 0) - n;
    else if (k === "seed") p.carry.seed -= n;
    else t.mat[k] = (t.mat[k] ?? 0) - n;
  }
}

// ---- Where things go ----

const near = (world: World, kind: string, x: number, z: number, r: number) => world.things.filter((t) => t.kind === kind && dist(t.x, t.z, x, z) < r);
/** A free spot for a made thing: about the camp, spread about so they do not stand on one another. */
function spotAt(world: World, centre: { x: number; z: number }, kind: string, ring: number): { x: number; z: number } {
  const n = (world.built ?? 0) + near(world, kind, centre.x, centre.z, 80).length;
  const a = n * 2.399963; // the golden angle
  return { x: centre.x + Math.cos(a) * (ring + (n % 3) * 2), z: centre.z + Math.sin(a) * (ring + (n % 3) * 2) };
}
const circleOf = (world: World, x: number, z: number) => (world.noGo ?? []).filter((c) => dist(c.x, c.z, x, z) < 120).sort((a, b) => dist(a.x, a.z, x, z) - dist(b.x, b.z, x, z))[0];
/** The edge of a lake on the side of a point. */
function shoreToward(c: { x: number; z: number; r: number }, x: number, z: number, out = 1.5) {
  const d = Math.max(1e-6, dist(c.x, c.z, x, z));
  return { x: c.x + ((x - c.x) / d) * (c.r + out), z: c.z + ((z - c.z) / d) * (c.r + out) };
}
function siteFor(world: World, p: Person, c: Craft): { x: number; z: number } | undefined {
  const home = homeOf(world, p);
  switch (c.at) {
    case "anywhere":
      return { x: p.x, z: p.z };
    case "camp":
      return spotAt(world, home, c.out.thing ?? c.id, 5);
    case "field":
      return spotAt(world, home, c.out.thing ?? c.id, c.out.thing === "channel" ? 0 : 14);
    case "water": {
      const lake = circleOf(world, p.x, p.z);
      if (lake) return shoreToward(lake, p.x, p.z);
      const w = nearest(world, p, (t) => !!AFFORDANCES[t.kind]?.water, p);
      return w && { x: w.t.x + (p.x - w.t.x) * 0.1, z: w.t.z + (p.z - w.t.z) * 0.1 };
    }
    case "kiln": {
      const k = nearest(world, p, (t) => t.kind === "kiln", p);
      return k && { x: k.t.x, z: k.t.z };
    }
  }
}

// ---- Making and finding out ----

function remember(p: Person, world: World, t: Thing) {
  p.memory.set(t.id, { x: t.x, z: t.z, feeling: 0.3, visits: 1, lastSeen: world.clock ?? 0 });
}
function learn(world: World, p: Person, c: Craft, how: "found" | "taught") {
  (p.ideas ??= []).push(c.id);
  const first = !world.knowledge?.[c.id];
  (world.knowledge ??= {})[c.id] ??= { by: p.id, byName: p.name, t: world.clock ?? 0 };
  const t = techOf(p);
  t.method = Math.min(0.6, t.method + (how === "found" ? 0.06 : 0));
  p.mood = Math.min(1, p.mood + 0.25);
  psycheEvent(p, "triumph", 1);
  if (first) chronicle(world, `${p.name} worked out ${c.name}: ${c.effect}.`);
  note(p, world, `It worked! ${c.name[0]!.toUpperCase()}${c.name.slice(1)}: ${c.effect}. I know how now.`);
  tally(world, "inventions");
  tally(world, `invented_${c.group}`);
}

/** What comes of making: a thing set down, a tool owned, a metal in the pack. */
function produce(world: World, p: Person, c: Craft, at: { x: number; z: number }): Thing | undefined {
  const t = techOf(p);
  for (const [k, n] of Object.entries(c.out.mat ?? {})) t.mat[k] = Math.min(MAT_CAP, (t.mat[k] ?? 0) + n);
  if (c.out.tool) {
    if (!t.tools.includes(c.id)) t.tools.push(c.id);
    if (c.id === "bow") p.tools.spear = true;
    if (c.id === "fishing-pole") p.tools.net = true;
  }
  if (!c.out.thing) return undefined;
  const kind = c.out.thing;
  const extra: Partial<Thing> = { radius: 2, of: p.id };
  if (kind === "field") Object.assign(extra, { radius: 3, stock: 2, maxStock: 6 });
  if (kind === "hive") Object.assign(extra, { stock: 1, maxStock: 3 });
  const thing = make(world, kind, at.x, at.z, extra);
  remember(p, world, thing);
  tally(world, `made_${kind}`);
  return thing;
}

function makeIt(world: World, p: Person, c: Craft, joy: (v: number) => void): boolean {
  const miss = has(p, c.id) ? lacking(p, c.cost) : "the knowing";
  const site = miss ? undefined : siteFor(world, p, c);
  if (!site) {
    note(p, world, `I went to make ${c.name} and ${miss ? `had no ${miss}` : "found no place for it"}.`);
    tally(world, "makeFailed");
    return false;
  }
  pay(p, c.cost);
  produce(world, p, c, site);
  joy(0.12);
  note(p, world, `Made ${c.name}.`);
  p.say = `${c.name[0]!.toUpperCase()}${c.name.slice(1)}. That will do.`;
  tally(world, "crafted");
  return true;
}

/** Trying something new with what they have: it works if they know what it needs and hit on how. */
export function tinkerChance(world: World, p: Person, c: Craft): number {
  const t = techOf(p);
  const a = analogyFor(p, c.id);
  return clamp01(0.3 + 0.3 * p.personality.curiosity + 0.4 * methodOf(p) + (a?.bonus ?? 0) + 0.05 * (t.tried[c.id] ?? 0));
}
function tinker(world: World, p: Person, c: Craft, joy: (v: number) => void): boolean {
  if (!ready(p, c) || c.how || lacking(p, c.cost)) return false;
  const site = siteFor(world, p, c);
  if (!site) return false;
  const t = techOf(p);
  const tries = t.tried[c.id] ?? 0;
  t.tried[c.id] = tries + 1;
  const a = analogyFor(p, c.id);
  if (chance(p.id, world, `tinker:${c.id}:${tries}`) < tinkerChance(world, p, c)) {
    learn(world, p, c, "found");
    if (a) note(p, world, `It was like this: ${a.as}.`);
    pay(p, c.cost);
    produce(world, p, c, site);
    joy(0.3);
    return true;
  }
  // The pieces are spoilt in part, and they know that way does not work.
  const spoilt = Object.keys(c.cost).find((k) => k !== "seed");
  if (spoilt) pay(p, { [spoilt]: 1 });
  note(p, world, `I tried ${c.name} and it would not work. Not like that.${a ? ` But ${a.as}.` : ""}`);
  tally(world, "failedTries");
  joy(0.02);
  return false;
}

// ---- Using what is made ----

interface Use {
  /** How much they want to use it now, 0 if they cannot. */
  value(p: Person, world: World, t: Thing): number;
  run(world: World, p: Person, t: Thing, joy: (v: number) => void): boolean;
}
const joyNeed = (p: Person) => p.needs.joy;
/** A meal: what is cooked feeds those near it, and the cook has the evidence of their own mouth that it fills more. */
function meal(world: World, p: Person, t: Thing, eat: number, wood: number, fed: number, label: string): boolean {
  const tech = techOf(p);
  if (p.carry.food < 2 || p.carry.wood < wood) return false;
  p.carry.food -= 2;
  p.carry.wood -= wood;
  const flour = (tech.mat.flour ?? 0) >= 1;
  if (flour) tech.mat.flour! -= 1;
  const cap = tech.tools.includes("potters-wheel") && t.kind === "pot" ? 6 : fed;
  const eaters = world.people.filter((q) => dist(q.x, q.z, t.x, t.z) < 8).sort((a, b) => dist(a.x, a.z, t.x, t.z) - dist(b.x, b.z, t.x, t.z)).slice(0, cap);
  if (!eaters.includes(p)) eaters.push(p);
  for (const q of eaters) {
    q.needs.hunger = Math.max(0, q.needs.hunger - eat * (flour ? 1.25 : 1));
    q.mood = Math.min(1, q.mood + 0.03);
    if (q !== p) {
      const r = relation(q, p.id, world);
      r.affinity = Math.min(1, r.affinity + 0.03);
    }
  }
  witness(world, p, "cookedFeeds", true);
  tally(world, "cookedMeals");
  note(p, world, `${label} for ${eaters.length}. Hot food fills better than raw.`);
  return true;
}
const cookValue = (base: number, wood: number) => (p: Person) => {
  if (p.carry.food < 2 || p.carry.wood < wood || p.needs.hunger < 0.25 || p.needs.hunger > 0.8) return 0;
  return (base + 0.6 * p.needs.hunger) * (believes(p, "cookedFeeds") ? 1.25 : 1);
};
const playUse = (verb: string, lift: number): Use => ({
  value: (p) => (p.needs.joy > 0.35 ? 0.2 + 0.5 * joyNeed(p) : 0),
  run: (_w, p, _t, joy) => {
    p.needs.joy = Math.max(0, p.needs.joy - lift);
    p.say = verb;
    joy(0.12);
    return true;
  },
});
// Out on the water to fish; the trip itself is rowAndFish.
const FISHING: Use = { value: (p, w) => (p.needs.hunger > 0.3 && (w.fish ?? 0) > 6 ? 0.3 + 0.4 * p.needs.hunger : 0), run: () => false };
export const USES: Record<string, Use> = {
  pot: { value: (p, _w, _t) => cookValue(0.35, 1)(p), run: (w, p, t) => meal(w, p, t, 0.35, 1, 4, "Cooked a pot of food") },
  spit: { value: (p) => cookValue(0.3, 1)(p), run: (w, p, t) => meal(w, p, t, 0.3, 1, 3, "Roasted a meal on the spit") },
  oven: { value: (p) => cookValue(0.4, 1)(p), run: (w, p, t) => meal(w, p, t, 0.5, 1, 6, "Baked a meal in the oven") },
  loom: {
    value: (p) => ((techOf(p).mat.fibre ?? 0) >= 2 && (p.clothing ?? 0) < 0.6 ? 0.35 + 0.1 * (p.cold > 0.3 ? 1 : 0) : 0),
    run: (w, p, _t, joy) => {
      const t = techOf(p);
      if ((t.mat.fibre ?? 0) < 2) return false;
      t.mat.fibre! -= 2;
      p.clothing = Math.min(1, (p.clothing ?? 0) + 0.5);
      p.say = "Cloth, and a cloak from it.";
      joy(0.1);
      tally(w, "woven");
      return true;
    },
  },
  quern: {
    value: (p) => (p.carry.seed >= 2 ? 0.3 : 0),
    run: (_w, p, _t, joy) => {
      if (p.carry.seed < 2) return false;
      p.carry.seed -= 2;
      const t = techOf(p);
      t.mat.flour = Math.min(MAT_CAP, (t.mat.flour ?? 0) + 1);
      joy(0.05);
      return true;
    },
  },
  ball: playUse("Catch!", 0.4),
  swing: playUse("Higher!", 0.45),
  flute: playUse("A tune for the evening.", 0.35),
  drum: playUse("A beat, a beat.", 0.35),
  hive: {
    value: (p, _w, t) => ((t.stock ?? 0) >= 1 && p.carry.food < 5 ? 0.3 : 0),
    run: (w, p, t, joy) => {
      if ((t.stock ?? 0) < 1) return false;
      t.stock! -= 1;
      p.carry.food = Math.min(8, p.carry.food + 2);
      joy(0.08);
      note(p, w, "Took honey from the hive.");
      return true;
    },
  },
  field: {
    value: (p, _w, t) => ((t.stock ?? 0) < (t.maxStock ?? 6) * 0.7 ? 0.32 + 0.2 * clamp01(p.personality.patience) : 0),
    run: (w, p, t, joy) => {
      t.growth = (t.growth ?? 0) + (techOf(p).tools.includes("sickle") ? 110 : 80);
      p.say = "Weed it, water it, wait.";
      joy(0.05);
      tally(w, "tended");
      return true;
    },
  },
  "dog-bed": {
    value: (p, w, t) => {
      const dog = w.things.find((q) => q.kind === "dog" && q.of === p.id);
      return dog && dist(dog.x, dog.z, t.x, t.z) > 6 ? 0.25 : 0;
    },
    run: (w, p, t, joy) => {
      const dog = w.things.find((q) => q.kind === "dog" && q.of === p.id);
      if (!dog?.mob) return false;
      dog.mob.tx = t.x;
      dog.mob.tz = t.z;
      t.of = p.id;
      joy(0.06);
      note(p, w, "Showed the dog its bed.");
      return true;
    },
  },
  boat: FISHING,
  raft: FISHING,
};

// ---- Water: boats and bridges ----

type Vessel = "boat" | "raft" | "bridge";
const SPEED: Record<Vessel, number> = { boat: 1.5, raft: 1.0, bridge: WALK };
const BASE_RISK: Record<Vessel, number> = { boat: 0.12, raft: 0.18, bridge: 0.04 };
const rough = (w: World) => !!w.weather && (w.weather.windMs > 8 || w.weather.raining || w.weather.fog > 0.5);
/** How risky an unfamiliar way across looks to them, and what they would put up with. A bridge not yet finished cannot be used at all. */
export function riskOf(world: World, p: Person, what: Vessel): { risk: number; tolerance: number; actual: number } {
  const t = techOf(p);
  const unfamiliar = 1 / (1 + 1.5 * (t.used[what] ?? 0) + (t.seen[what] ?? 0));
  const weather = rough(world) ? 1.8 : 1;
  const knowsRough = believes(p, "roughWater");
  const actual = BASE_RISK[what] * weather * (t.tools.includes("oar") ? 0.8 : 1);
  const risk = BASE_RISK[what] * (knowsRough ? weather : 1) * (0.35 + 0.65 * unfamiliar);
  return { risk, actual, tolerance: 0.04 + 0.14 * p.personality.boldness + 0.06 * p.personality.curiosity };
}
export const bridgeReady = (t: Thing) => !!t.span && t.span.laid >= t.span.need;

function usable(world: World, p: Person) {
  const out: { t: Thing; what: Vessel }[] = [];
  for (const t of world.things) {
    if ((t.kind === "boat" || t.kind === "raft" || (t.kind === "bridge" && bridgeReady(t))) && p.memory.has(t.id) && dist(t.x, t.z, p.x, p.z) < 90) out.push({ t, what: t.kind as Vessel });
  }
  return out;
}
/** Where a crossing from this vessel lands: the far end of a bridge, or the lake's edge toward where they are going. */
function farSide(world: World, v: Thing, what: Vessel, toward: { x: number; z: number }): { x: number; z: number } | undefined {
  if (what === "bridge") {
    const s = v.span!;
    const nearA = dist(toward.x, toward.z, v.x, v.z) <= dist(toward.x, toward.z, s.x2, s.z2);
    return nearA ? { x: v.x, z: v.z } : { x: s.x2, z: s.z2 };
  }
  const lake = circleOf(world, v.x, v.z);
  return lake && shoreToward(lake, toward.x, toward.z, 1.2);
}
function otherEnd(v: Thing, from: { x: number; z: number }) {
  const s = v.span!;
  return dist(from.x, from.z, v.x, v.z) <= dist(from.x, from.z, s.x2, s.z2) ? { x: s.x2, z: s.z2 } : { x: v.x, z: v.z };
}

/** The way across they would take to reach somewhere: worth it only if it saves a good deal of walking round the water. */
export function crossingJob(world: World, p: Person, made: number): Job | undefined {
  if (!world.noGo?.length) return undefined;
  const ways = usable(world, p);
  if (!ways.length) return undefined;
  const home = homeOf(world, p);
  const dusk = isNight((world.clock ?? 0) + 150);
  const dests: { x: number; z: number; why: string; base: number }[] = [];
  if (dusk) dests.push({ x: home.x, z: home.z, why: "Dusk is near and my camp is across the water.", base: 0.5 });
  for (const t of world.things) {
    if (!p.memory.has(t.id) || !AFFORDANCES[t.kind]?.food || (t.stock ?? 0) < 2) continue;
    dests.push({ x: t.x, z: t.z, why: `There is food at the ${t.kind} across the water.`, base: 0.38 + 0.2 * p.needs.hunger });
  }
  let best: Job | undefined;
  for (const d of dests) {
    const detour = routeAround(world, p.x, p.z, d.x, d.z);
    if (!detour) continue;
    const walking = dist(p.x, p.z, detour.x, detour.z) + dist(detour.x, detour.z, d.x, d.z);
    for (const { t, what } of ways) {
      const far = farSide(world, t, what, d);
      if (!far) continue;
      const startX = what === "bridge" ? (dist(p.x, p.z, t.x, t.z) <= dist(p.x, p.z, t.span!.x2, t.span!.z2) ? t.x : t.span!.x2) : t.x;
      const startZ = what === "bridge" ? (startX === t.x ? t.z : t.span!.z2) : t.z;
      const across = dist(startX, startZ, far.x, far.z) / SPEED[what];
      const crossing = dist(p.x, p.z, startX, startZ) + across * WALK + dist(far.x, far.z, d.x, d.z);
      const saving = walking - crossing;
      if (saving < 8) continue;
      const v = Math.min(0.62, d.base + 0.002 * saving) * (0.8 + 0.4 * p.personality.boldness);
      if (!best || v > best.v) best = { act: `cross:${t.id}`, x: startX, z: startZ, v, why: `${d.why} Walking round is ${Math.round(saving)} m longer.`, made, dest: { x: d.x, z: d.z } };
    }
  }
  return best;
}

function startCrossing(world: World, p: Person, vessel: Thing, job: Job | undefined): boolean {
  const what = vessel.kind as Vessel;
  const t = techOf(p);
  const now = world.clock ?? 0;
  if (what === "bridge" && !bridgeReady(vessel)) return false;
  const r = riskOf(world, p, what);
  if (r.risk > r.tolerance) {
    if (now - (t.declinedAt[what] ?? -1e9) > 3 * DAY) note(p, world, `I do not trust the ${what} yet. I will watch someone use it first.`);
    t.declinedAt[what] = now;
    tally(world, "declinedUnfamiliar");
    return false;
  }
  const dest = job?.dest ?? { x: p.x, z: p.z };
  const far = farSide(world, vessel, what, dest);
  if (!far) return false;
  // Those who see it done safely trust it a little more.
  for (const q of world.people) if (q !== p && q.age >= ADULT_AGE && dist(q.x, q.z, p.x, p.z) < 30) techOf(q).seen[what] = (techOf(q).seen[what] ?? 0) + 1;
  const roughNow = rough(world);
  const capsize = what !== "bridge" && chance(p.id, world, `capsize:${t.used[what] ?? 0}`) < r.actual * 0.8;
  const mid = { x: (vessel.x + far.x) / 2, z: (vessel.z + far.z) / 2 };
  t.afloat = true;
  const sail = t.tools.includes("sail") ? 1.5 : 1;
  // The move itself is set up by techStep each tick: the intent that started it is cleared as it ends.
  t.route = { id: `land:${capsize ? "cap" : "ok"}:${what}:${roughNow ? "rough" : "calm"}:${vessel.x.toFixed(1)}:${vessel.z.toFixed(1)}`, x: capsize ? mid.x : far.x, z: capsize ? mid.z : far.z, speed: SPEED[what] * sail };
  note(p, world, `Set out across the water by ${what === "bridge" ? "the bridge" : `the ${what}`}.`);
  return true;
}

function land(world: World, p: Person, parts: string[], joy: (v: number) => void) {
  const [, outcome, what, weather, sx, sz] = parts as [string, string, Vessel, string, string, string];
  const t = techOf(p);
  t.afloat = false;
  t.route = undefined;
  t.used[what] = (t.used[what] ?? 0) + 1;
  if (outcome === "cap") {
    p.cold = Math.min(1, p.cold + 0.5);
    p.health = Math.max(0.05, p.health - 0.08);
    p.carry.food = 0;
    p.x = Number(sx) + (p.x < Number(sx) ? -1 : 1);
    p.z = Number(sz);
    feelEmotion(p, "fear", 0.6);
    psycheEvent(p, "threat", 1);
    note(p, world, `The ${what} went over. I swam back, soaked and shaken, and lost what I carried.`);
    tally(world, "capsized");
    if (weather === "rough") witness(world, p, "roughWater", true);
  } else {
    joy(0.1);
    note(p, world, what === "bridge" ? "Crossed by the bridge." : `Crossed in the ${what}.`);
    tally(world, what === "bridge" ? "bridgeCrossings" : "boatCrossings");
    if (weather === "rough") witness(world, p, "roughWater", false);
  }
}

/** Out on the water to fish: a boat takes more fish than the bank. */
function rowAndFish(world: World, p: Person, boat: Thing, joy: (v: number) => void): boolean {
  const t = techOf(p);
  const r = riskOf(world, p, boat.kind as Vessel);
  if (r.risk > r.tolerance) {
    t.declinedAt[boat.kind] = world.clock ?? 0;
    tally(world, "declinedUnfamiliar");
    return false;
  }
  const roughNow = rough(world);
  t.used[boat.kind] = (t.used[boat.kind] ?? 0) + 1;
  for (const q of world.people) if (q !== p && q.age >= ADULT_AGE && dist(q.x, q.z, p.x, p.z) < 30) techOf(q).seen[boat.kind] = (techOf(q).seen[boat.kind] ?? 0) + 1;
  if (chance(p.id, world, `capsize:${t.used[boat.kind]}`) < r.actual * 0.8) {
    p.cold = Math.min(1, p.cold + 0.4);
    p.health = Math.max(0.05, p.health - 0.06);
    note(p, world, "The boat went over in the shallows. I waded out, wet through.");
    tally(world, "capsized");
    if (roughNow) witness(world, p, "roughWater", true);
    return true;
  }
  if (roughNow) witness(world, p, "roughWater", false);
  if ((world.fish ?? 0) > 3 && chance(p.id, world, `boatfish:${t.used[boat.kind]}`) < 0.7) {
    world.fish = Math.max(0, (world.fish ?? 0) - 1);
    p.carry.food = Math.min(8, p.carry.food + 3);
    note(p, world, "Rowed out and brought back a good catch.");
    tally(world, "boatFishing");
    joy(0.12);
  } else note(p, world, "Rowed out and caught nothing.");
  return true;
}

// ---- Tame animals ----

/** Keeping an animal teaches that animals can be kept. Called when one becomes theirs, by whichever way that happens. */
export function learnHerding(world: World, p: Person, a: Thing) {
  if (has(p, "herding")) return;
  const firstEver = !world.knowledge?.herding;
  const c = craftOf("herding")!;
  (p.ideas ??= []).push("herding");
  (world.knowledge ??= {}).herding ??= { by: p.id, byName: p.name, t: world.clock ?? 0 };
  if (firstEver) chronicle(world, `${p.name} fed a wild ${a.kind} until it followed them, and understood that animals can be kept: herding.`);
  note(p, world, `The ${a.kind} follows me now. ${c.effect[0]!.toUpperCase()}${c.effect.slice(1)}: I know herding.`);
  tally(world, "inventions");
  tally(world, "invented_farm");
}
const HERD = new Set(["cow", "donkey", "alpaca", "horse"]);
function feedAnimal(world: World, p: Person, a: Thing, joy: (v: number) => void): boolean {
  if (!HERD.has(a.kind) || a.of || p.carry.food < 1 || dist(p.x, p.z, a.x, a.z) > 4.5) return false;
  p.carry.food -= 1;
  a.trust = (a.trust ?? 0) + 1;
  joy(0.08);
  if (a.trust >= 3) {
    a.of = p.id;
    learnHerding(world, p, a);
    p.mood = Math.min(1, p.mood + 0.2);
    note(p, world, `A ${a.kind} is mine now.`);
    tally(world, "domesticated");
  } else note(p, world, `Fed a ${a.kind}. It let me near.`);
  return true;
}

// ---- Shared work ----

function propose(world: World, p: Person, kind: Project["kind"]): Project | undefined {
  const mine = (world.projects ??= []);
  if (mine.some((q) => q.kind === kind && !q.done)) return undefined;
  const home = homeOf(world, p);
  if (kind === "bridge") {
    const lake = circleOf(world, home.x, home.z);
    if (!lake) return undefined;
    const a = shoreToward(lake, home.x, home.z, 1);
    const b = { x: 2 * lake.x - a.x, z: 2 * lake.z - a.z };
    const length = dist(a.x, a.z, b.x, b.z);
    const need = Math.ceil(length / 5);
    const bridge = make(world, "bridge", a.x, a.z, { radius: 2, span: { x2: b.x, z2: b.z, need, laid: 0 } });
    const pr: Project = { id: `project-${mine.length + 1}`, kind, x: a.x, z: a.z, need: { wood: need, food: 0 }, laid: { wood: 0, food: 0 }, by: [p.id], started: world.clock ?? 0, thing: bridge.id };
    mine.push(pr);
    remember(p, world, bridge);
    chronicle(world, `${p.name} began a bridge across the water, ${Math.round(length)} m, and asked the others to help.`);
    tally(world, "projects");
    return pr;
  }
  const spot = spotAt(world, home, "granary", 8);
  const granary = make(world, "granary", spot.x, spot.z, { radius: 3, stock: 0, maxStock: 0 });
  const pr: Project = { id: `project-${mine.length + 1}`, kind, x: spot.x, z: spot.z, need: { wood: 10, food: 12 }, laid: { wood: 0, food: 0 }, by: [p.id], started: world.clock ?? 0, thing: granary.id };
  mine.push(pr);
  remember(p, world, granary);
  chronicle(world, `${p.name} proposed a granary for the whole camp to fill before winter.`);
  tally(world, "projects");
  return pr;
}
const projectDone = (pr: Project) => pr.laid.wood >= pr.need.wood && pr.laid.food >= pr.need.food;
function contribute(world: World, p: Person, pr: Project, joy: (v: number) => void): boolean {
  if (pr.done) return false;
  const giveWood = Math.min(p.carry.wood, pr.need.wood - pr.laid.wood);
  const giveFood = Math.min(Math.max(0, p.carry.food - (p.needs.hunger > 0.4 ? 1 : 0)), pr.need.food - pr.laid.food);
  if (giveWood <= 0 && giveFood <= 0) return false;
  pr.laid.wood += giveWood;
  pr.laid.food += giveFood;
  p.carry.wood -= giveWood;
  p.carry.food -= giveFood;
  if (!pr.by.includes(p.id)) pr.by.push(p.id);
  const thing = thingById(world, pr.thing);
  if (thing?.span) thing.span.laid = pr.laid.wood;
  if (thing && pr.kind === "granary") {
    thing.maxStock = Math.max(thing.maxStock ?? 0, 40);
    thing.stock = (thing.stock ?? 0) + giveFood;
  }
  note(p, world, `Gave ${giveWood ? `${giveWood} wood` : ""}${giveWood && giveFood ? " and " : ""}${giveFood ? `${giveFood} food` : ""} to the ${pr.kind}.`);
  joy(0.08);
  tally(world, "contributions");
  if (!pr.done && projectDone(pr)) {
    pr.done = world.clock ?? 0;
    chronicle(world, `The ${pr.kind} is finished, built by ${pr.by.length} ${pr.by.length === 1 ? "person" : "people"} over ${((pr.done - pr.started) / DAY).toFixed(1)} days.`);
    for (const id of pr.by) {
      const q = world.people.find((x) => x.id === id);
      if (q) {
        q.mood = Math.min(1, q.mood + 0.2);
        note(q, world, `We finished the ${pr.kind} together.`);
        psycheEvent(q, "achievement", 1);
      }
    }
    tally(world, "projectsDone");
  }
  return true;
}

// ---- Choosing ----

function sourceFor(world: World, p: Person, what: string): { t: Thing; d: number } | undefined {
  if (what === "food") return nearest(world, p, (t) => !!AFFORDANCES[t.kind]?.food && t.kind !== "shelter" && t.kind !== "granary" && (t.stock ?? 0) >= 3, p);
  const pred = what === "wood" ? WOOD_SOURCE : MAT_SOURCE[what];
  return pred ? nearest(world, p, pred, p) : undefined;
}
const fetchJob = (world: World, p: Person, what: string, v: number, made: number, why: string): Job | undefined => {
  const s = sourceFor(world, p, what);
  return s && { act: `get:${what}:${s.t.id}`, x: s.t.x, z: s.t.z, v, why, made };
};
const limitOf = (kind: string, adults: number) => (kind === "field" ? 2 + Math.floor(adults / 2) : 1);
const wantedNow = (world: World, p: Person, c: Craft, adults: number): boolean => {
  const t = techOf(p);
  if (c.out.tool) return !t.tools.includes(c.id);
  if (c.out.mat) {
    const goalMet = c.id === "iron" ? t.tools.includes("iron-axe") : t.tools.includes("bronze-axe");
    return !goalMet && (t.mat[Object.keys(c.out.mat)[0]!] ?? 0) < 2;
  }
  const kind = c.out.thing;
  if (!kind) return false;
  const home = homeOf(world, p);
  if (kind === "channel") return near(world, "field", home.x, home.z, 60).length > 0 && near(world, "channel", home.x, home.z, 60).length < 1;
  if (kind === "boat" || kind === "raft") return !!circleOf(world, p.x, p.z) || !!nearest(world, p, (q) => !!AFFORDANCES[q.kind]?.fish, p);
  return near(world, kind, home.x, home.z, 70).length < limitOf(kind, adults);
};

/** What they want to do next, and why. */
function decide(world: World, p: Person): Job | undefined {
  const now = world.clock ?? 0;
  const t = techOf(p);
  const adults = world.people.filter((q) => q.age >= ADULT_AGE).length;
  const home = homeOf(world, p);
  const cands: Job[] = [];
  const push = (j: Job | undefined) => j && cands.push(j);
  // 1. Things made already, used.
  for (const th of world.things) {
    const use = USES[th.kind];
    if (!use || !p.memory.has(th.id) || dist(th.x, th.z, p.x, p.z) > 70) continue;
    const v = use.value(p, world, th);
    if (v > 0) push({ act: `use:${th.id}`, x: th.x, z: th.z, v, why: `I could use the ${th.kind}.`, made: now });
  }
  // 2. Things they know how to make and want, and the stuff to make them from.
  for (const c of CRAFTS) {
    if (!has(p, c.id) || c.how || c.want <= 0 || !wantedNow(world, p, c, adults)) continue;
    const miss = lacking(p, c.cost);
    if (!miss) {
      const s = siteFor(world, p, c);
      if (s) push({ act: `make:${c.id}`, x: s.x, z: s.z, v: c.want, why: `I know how to make ${c.name}, and I have what it takes.`, made: now });
    } else if (miss !== "seed" && miss !== "hide") push(fetchJob(world, p, miss, c.want * 0.9, now, `I need ${miss} to make ${c.name}.`));
  }
  // 3. Something new, that they have what it takes to try: they know what comes before it.
  if (p.personality.curiosity > 0.35) {
    for (const c of CRAFTS) {
      if (!ready(p, c) || c.how || (t.tried[c.id] ?? 0) >= 8) continue;
      const v = (0.15 + 0.3 * p.personality.curiosity + 0.2 * t.method) * (analogyFor(p, c.id) ? 1.2 : 1);
      const miss = lacking(p, c.cost);
      const wantsIt = c.id === "farming" ? p.carry.seed >= 1 : true;
      if (!wantsIt) continue;
      if (!miss) {
        const s = siteFor(world, p, c);
        if (s) push({ act: `try:${c.id}`, x: s.x, z: s.z, v, why: `I wonder if ${c.name} would work, now I know ${c.needs.join(" and ") || "this much"}.`, made: now });
      } else if (miss !== "seed" && miss !== "hide") push(fetchJob(world, p, miss, v * 0.9, now, `To try ${c.name} I need ${miss}.`));
    }
  }
  // 4. Shared work.
  for (const pr of world.projects ?? []) {
    if (pr.done || dist(pr.x, pr.z, home.x, home.z) > 150) continue;
    const trust = pr.by.reduce((a, id) => a + (id === p.id ? 1 : relation(p, id, world).trust), 0) / Math.max(1, pr.by.length);
    if (chance(p.id, world, `join:${pr.id}`, 60) > 0.35 + 0.5 * p.personality.sociability + 0.3 * trust) continue;
    const bringWood = pr.laid.wood < pr.need.wood;
    const bringFood = pr.laid.food < pr.need.food;
    const haveEnough = (bringWood && p.carry.wood >= 3) || (bringFood && p.carry.food >= 2);
    const v = 0.55 + 0.1 * trust;
    if (haveEnough) push({ act: `give:${pr.id}`, x: pr.x, z: pr.z, v, why: `We are building the ${pr.kind} together.`, made: now });
    else if (bringWood && p.carry.wood < 3) push(fetchJob(world, p, "wood", v * 0.9, now, `Wood for the ${pr.kind}.`));
    else if (bringFood && p.needs.hunger < 0.4) push(fetchJob(world, p, "food", v * 0.9, now, `Food for the ${pr.kind}.`));
  }
  // New shared work: one who knows what it takes proposes it.
  if (!(world.projects ?? []).some((pr) => !pr.done)) {
    if (has(p, "bridge") && circleOf(world, home.x, home.z) && !near(world, "bridge", home.x, home.z, 150).length && chance(p.id, world, "propose:bridge", 120) < 0.5) push({ act: "propose:bridge", x: p.x, z: p.z, v: 0.45, why: "A bridge would save everyone the long way round.", made: now });
    if (has(p, "granary") && !near(world, "granary", home.x, home.z, 100).length && world.weather?.season !== 3 && chance(p.id, world, "propose:granary", 120) < 0.5) push({ act: "propose:granary", x: p.x, z: p.z, v: 0.45, why: "A granary we all fill would see us through winter.", made: now });
  }
  // 5. Across the water.
  push(crossingJob(world, p, now));
  // 6. Animals that might be kept.
  if (p.carry.food >= 2 && p.personality.boldness > 0.3 && !world.things.some((q) => HERD.has(q.kind) && q.of === p.id)) {
    const a = nearest(world, p, (q) => HERD.has(q.kind) && !q.of, p);
    if (a && a.d < 70) push({ act: `tame:${a.t.id}`, x: a.t.x, z: a.t.z, v: 0.3 + 0.25 * p.personality.curiosity, why: `A ${a.t.kind} that I might win over with food.`, made: now });
  }
  let best: Job | undefined;
  let bv = 0.18;
  for (const j of cands) {
    const v = j.v * (0.85 + 0.3 * chance(p.id, world, `pick:${j.act}`, 45));
    if (v > bv) (best = j), (bv = v);
  }
  return best && { ...best, v: Math.min(0.7, best.v) };
}

/** What they have worked out about the world, put to use: out of the wet and cold, and clean. */
function believedOptions(person: Person, world: World, out: Option[]) {
  const wet = !!world.weather?.raining;
  if (person.cold > 0.25 && ((world.weather?.tempC ?? 15) < 6 ? believes(person, "shelterWarm") : wet && believes(person, "wetChills"))) {
    const sh = nearest(world, person, (t) => t.kind === "shelter", person);
    if (sh && sh.d > 6) out.push({ intent: { kind: "rest", targetId: sh.t.id, x: sh.t.x, z: sh.t.z, speed: WALK, remaining: 20 }, score: 0.55 });
  }
  if ((person.hygiene ?? 0) > 0.5 && believes(person, "filthSickens")) {
    const water = nearest(world, person, (t) => !!AFFORDANCES[t.kind]?.water && !!AFFORDANCES[t.kind]?.fish, person);
    if (water) out.push({ intent: { kind: "wash", targetId: water.t.id, x: water.t.x, z: water.t.z, speed: WALK, remaining: 14 }, score: 0.5 });
  }
}

/** What they might do with this: hooked in after the plan. Yields to thirst, hunger and tiredness. */
export function techOptions(person: Person, world: World, out: Option[]) {
  if (person.age < ADULT_AGE || person.team) return;
  believedOptions(person, world, out);
  if (person.plan && !person.plan.goal.startsWith("scout")) return; // foresight comes first; looking about does not
  const t = techOf(person);
  const now = world.clock ?? 0;
  const pressing = Math.max(person.needs.hunger, person.needs.thirst);
  if (isNight(now) || person.needs.thirst > 0.55 || person.needs.energy > 0.8 || t.afloat) return;
  let job = t.job;
  if (job && (now - job.made > 500)) job = t.job = undefined;
  if (job?.act.startsWith("tame:")) {
    const a = thingById(world, job.act.slice(5));
    if (!a || a.of) job = t.job = undefined;
    else (job.x = a.x), (job.z = a.z);
  }
  if (!job) {
    if (now - t.thinkAt < 45) return;
    t.thinkAt = now;
    job = t.job = decide(world, person);
    if (!job) return;
    note(person, world, `${job.why} I will see to it.`);
  }
  // Cooking is a way of eating; anything else waits until they are not hungry.
  const cooks = /^use:(pot|spit|oven)/.test(job.act);
  if (pressing > 0.55 && !(cooks && pressing < 0.8)) return;
  const yieldTo = pressing > 0.35 && !cooks ? Math.max(0.15, 1 - 2.5 * (pressing - 0.35)) : 1;
  out.push({ intent: { kind: "work", targetId: job.act, x: job.x, z: job.z, speed: WALK, remaining: 8 }, score: job.v * yieldTo });
}

/** They have got there: do it. */
export function doWork(world: World, person: Person, intent: Intent, joy: (v: number) => void) {
  const t = techOf(person);
  const parts = (intent.targetId ?? "").split(":");
  const job = t.job;
  const done = () => {
    if (t.job && t.job.act === intent.targetId) t.job = undefined;
  };
  switch (parts[0]) {
    case "get": {
      const what = parts[1]!;
      const src = thingById(world, parts[2]);
      if (!src || dist(person.x, person.z, src.x, src.z) > (src.radius ?? 2) + 6) break;
      if (what === "food") {
        if ((src.stock ?? 0) < 3) break;
        src.stock = src.stock! - 2;
        person.carry.food = Math.min(8, person.carry.food + 2);
      } else if (what === "wood") person.carry.wood = Math.min(woodCap(t), person.carry.wood + woodGain(t));
      else t.mat[what] = Math.min(MAT_CAP, (t.mat[what] ?? 0) + (MAT_GAIN[what] ?? 1));
      note(person, world, what === "wood" ? "Gathered wood." : what === "food" ? "Picked food to take to the store." : `Gathered ${what} from the ${src.kind}.`);
      tally(world, `gathered_${what}`);
      done();
      break;
    }
    case "make": {
      const c = craftOf(parts[1]!);
      if (c) makeIt(world, person, c, joy);
      done();
      break;
    }
    case "try": {
      const c = craftOf(parts[1]!);
      if (c) tinker(world, person, c, joy);
      done();
      break;
    }
    case "use": {
      const th = thingById(world, parts[1]);
      if (!th || dist(person.x, person.z, th.x, th.z) > 6) break;
      const use = USES[th.kind];
      let did = false;
      if (th.kind === "boat" || th.kind === "raft") did = rowAndFish(world, person, th, joy);
      else if (use) did = use.run(world, person, th, joy);
      if (did) {
        t.used[th.kind] = (t.used[th.kind] ?? 0) + (th.kind === "boat" || th.kind === "raft" ? 0 : 1);
        for (const q of world.people) if (q !== person && q.age >= ADULT_AGE && dist(q.x, q.z, th.x, th.z) < 25) techOf(q).seen[th.kind] = (techOf(q).seen[th.kind] ?? 0) + 1;
      }
      done();
      break;
    }
    case "cross": {
      const v = thingById(world, parts[1]);
      if (v && (dist(person.x, person.z, v.x, v.z) < 6 || (v.span && dist(person.x, person.z, v.span.x2, v.span.z2) < 6))) startCrossing(world, person, v, job);
      done();
      break;
    }
    case "land":
      land(world, person, parts, joy);
      done();
      break;
    case "give": {
      const pr = (world.projects ?? []).find((q) => q.id === parts[1]);
      if (pr && dist(person.x, person.z, pr.x, pr.z) < 8) contribute(world, person, pr, joy);
      done();
      break;
    }
    case "propose":
      propose(world, person, parts[1] as Project["kind"]);
      done();
      break;
    case "tame": {
      const a = thingById(world, parts[1]);
      if (a) feedAnimal(world, person, a, joy);
      if (!a || a.of || person.carry.food < 1) done();
      break;
    }
  }
}

// ---- The world's side ----

/** Fields grow with the tools and water they have; tamed animals stay by their pen; a boat or bridge anyone starts across is watched. */
export function techStep(world: World, dt: number) {
  const now = world.clock ?? 0;
  watchCauses(world);
  const adults = world.people.filter((q) => q.age >= ADULT_AGE);
  for (const th of world.things) {
    if (th.kind === "field") {
      const hoe = adults.some((q) => techOf(q).tools.includes("hoe"));
      const plough = adults.some((q) => techOf(q).tools.includes("plough"));
      const wet = world.things.some((c) => c.kind === "channel" && dist(c.x, c.z, th.x, th.z) < 30);
      th.maxStock = 6 + (hoe ? 2 : 0) + (plough ? 4 : 0) + (wet ? 4 : 0);
      if (wet && th.stock !== undefined && th.stock < th.maxStock) th.growth = (th.growth ?? 0) + dt * 0.6;
    }
    if (th.of && HERD.has(th.kind) && th.mob && (th.mob.fleeUntil ?? 0) <= now) {
      const pen = world.things.filter((q) => q.kind === "pen").sort((a, b) => dist(a.x, a.z, th.x, th.z) - dist(b.x, b.z, th.x, th.z))[0];
      const owner = world.people.find((q) => q.id === th.of);
      const home = pen && dist(pen.x, pen.z, th.x, th.z) < 80 ? pen : owner;
      if (home && dist(home.x, home.z, th.x, th.z) > 9 && chance(th.id, world, "herdhome", 15) < 0.5) {
        th.mob.tx = home.x + (chance(th.id, world, "hx", 15) - 0.5) * 8;
        th.mob.tz = home.z + (chance(th.id, world, "hz", 15) - 0.5) * 8;
      }
      if (!owner) th.of = undefined;
    }
    if (th.kind === "granary" && (th.stock ?? 0) > 0) th.maxStock = Math.max(th.maxStock ?? 0, 40);
  }
  for (const p of adults) {
    const t = p.tech;
    if (!t) continue;
    // Carried across: the way is kept to whatever else they were doing.
    if (t.route && p.intent?.targetId !== t.route.id) p.intent = { kind: "work", targetId: t.route.id, x: t.route.x, z: t.route.z, speed: t.route.speed, remaining: 0.5, arrived: false };
  }
  // Showing a way of going about a problem: whoever is good at it, to whoever sits close.
  if (Math.floor(now / 20) !== Math.floor((now - dt) / 20)) {
    for (const a of adults) {
      if (methodOf(a) < 0.1) continue;
      for (const b of adults) if (a !== b && dist(a.x, a.z, b.x, b.z) < 4 && chance(a.id, world, `show:${b.id}`, 20) < 0.3) teachMethod(world, a, b);
    }
  }
}
