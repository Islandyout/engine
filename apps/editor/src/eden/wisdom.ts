// Working out how the world works: many causes learned from what happens to them, beliefs that are given up when the world says no, likeness
// between things (a weir holds fish, so a pen might hold sheep), and a way of going about a problem that one person can teach another.
//
// solve.ts learns one cause (fire keeps wolves off). Here each cause is a rule with an observation that counts as a hit or a miss, a number
// of hits makes it a belief they act on and can tell, and enough misses make them drop it and say they were wrong.
import { chronicle, note, relation, tally, ADULT_AGE, type Person, type World } from "./mind";
import { belief } from "./solve";
import { psycheEvent } from "./psyche";
import { CRAFTS, techOf } from "./tech";

export interface Cause {
  id: string; // also the name of the rule in person.rules
  idea: string; // what they hold once they believe it (shared by telling)
  text: string; // the belief in their words
  /** True if what they see bears it out, false if it goes against it, nothing if there is nothing to see. */
  watch(world: World, p: Person): boolean | undefined;
}
const dist = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);
const nearShelter = (w: World, p: Person, r: number) => w.things.some((t) => t.kind === "shelter" && dist(t.x, t.z, p.x, p.z) < r);

export const CAUSES: Cause[] = [
  { id: "shelterWarm", idea: "cause:shelter-warm", text: "a roof keeps the cold off", watch: (w, p) => {
      if ((w.weather?.tempC ?? 15) > 8 || !nearShelter(w, p, 6)) return undefined;
      return p.cold < 0.3 ? true : p.cold > 0.6 ? false : undefined;
    } },
  { id: "wetChills", idea: "cause:wet-chills", text: "getting wet in the open chills me through", watch: (w, p) => {
      if (!w.weather?.raining || nearShelter(w, p, 10)) return undefined;
      return p.cold > 0.4 ? true : p.cold < 0.15 ? false : undefined;
    } },
  { id: "filthSickens", idea: "cause:filth-sickens", text: "dirt brings sickness", watch: (_w, p) => {
      if ((p.hygiene ?? 0) < 0.6) return undefined;
      return p.illness ? true : false;
    } },
  // Seen on the water (tech.ts), not on the bank.
  { id: "roughWater", idea: "cause:rough-water", text: "a boat is not safe on rough water", watch: () => undefined },
  { id: "cookedFeeds", idea: "cause:cooked-feeds", text: "cooked food fills more than raw", watch: () => undefined },
  { id: "fireRepels", idea: "fire-repels", text: "a fire keeps the beasts off", watch: () => undefined },
];
export const causeOf = (id: string) => CAUSES.find((c) => c.id === id);

/** Something seen outside the bank-side watch: a trip on the water, a meal. */
export function witness(world: World, p: Person, rule: string, hit: boolean) {
  const r = ((p.rules ??= {})[rule] ??= { tries: 0, hits: 0 });
  r.tries++;
  if (hit) r.hits++;
  weigh(world, p);
}
/** Holds the belief and has not been talked out of it. */
export const believes = (p: Person, id: string) => !!causeOf(id) && !!p.ideas?.includes(causeOf(id)!.idea) && belief(p, id) >= 0.55;

/** Turn the evidence so far into a belief, or take a belief back. */
function weigh(world: World, p: Person) {
  for (const c of CAUSES) {
    const r = p.rules?.[c.id];
    const holds = p.ideas?.includes(c.idea);
    if (holds && !r) (p.rules ??= {})[c.id] = { tries: 1, hits: 1 }; // taken on trust from being told: it counts for something, not much
    if (!r) continue;
    const b = belief(p, c.id);
    if (!holds && r.hits >= 2 && b >= 0.62) {
      (p.ideas ??= []).push(c.idea);
      (world.knowledge ??= {})[c.idea] ??= { by: p.id, byName: p.name, t: world.clock ?? 0 };
      note(p, world, `I have seen it ${r.hits} times: ${c.text}. I will act on that.`);
      tally(world, "causesLearned");
      if (c.id !== "fireRepels") chronicle(world, `${p.name} worked out that ${c.text}.`);
    } else if (holds && r.tries >= 5 && b < 0.38) {
      p.ideas = p.ideas!.filter((i) => i !== c.idea);
      p.rules![c.id] = { tries: 2, hits: 1 }; // doubtful again, not sure of the opposite either
      (techOf(p).wrong ??= []).push(c.id);
      note(p, world, `I was wrong: I thought ${c.text}, and it has not held. I will not rely on it.`);
      psycheEvent(p, "regret", 0.6);
      tally(world, "beliefsRevised");
    }
  }
}

/** Looking at what is happening to each adult: now and then, one episode at a time, a few minutes apart. */
export function watchCauses(world: World) {
  const now = world.clock ?? 0;
  for (const p of world.people) {
    if (p.age < ADULT_AGE) continue;
    const t = techOf(p);
    for (const c of CAUSES) {
      if (now - (t.watchAt[c.id] ?? -1e9) < 120) continue;
      const seen = c.watch(world, p);
      if (seen === undefined) continue;
      t.watchAt[c.id] = now;
      const r = ((p.rules ??= {})[c.id] ??= { tries: 0, hits: 0 });
      r.tries++;
      if (seen) r.hits++;
    }
    weigh(world, p);
  }
}

// ---- Likeness ----

/** Things that work alike: knowing one makes the other easier to hit on, and they say why. */
export const ANALOGIES: { from: string; to: string; as: string }[] = [
  { from: "weir", to: "pen", as: "a weir holds fish in the shallows; a ring of stakes might hold animals" },
  { from: "net", to: "basket", as: "a net is knotted strips that hold; so might a woven basket" },
  { from: "basket", to: "clay-pot", as: "clay pressed into the shape of a basket might hold water" },
  { from: "rope", to: "loom", as: "twisting fibre makes rope; crossing many strands makes cloth" },
  { from: "snare", to: "bow", as: "a bent branch that springs back throws things" },
  { from: "raft", to: "boat", as: "a raft floats; hollow the log and it carries more" },
  { from: "plank", to: "bridge", as: "a plank laid over a gap carries you; many planks carry you across the water" },
  { from: "kiln", to: "copper", as: "a kiln hardens clay; hot enough, it may soften stone" },
  { from: "bellows", to: "iron", as: "more air makes a hotter fire; hotter than copper needs" },
  { from: "hoe", to: "plough", as: "a hoe turns soil by hand; an animal could pull a bigger one" },
];
/** What they already know that points at a new thing: the bonus to hitting on it, and what they tell themselves. */
export function analogyFor(p: Person, id: string): { bonus: number; as: string } | undefined {
  for (const a of ANALOGIES) if (a.to === id && p.ideas?.includes(a.from)) return { bonus: 0.25, as: a.as };
  return undefined;
}

// ---- A way of going about it ----

export const methodOf = (p: Person) => p.tech?.method ?? 0;
/** One thing at a time, remember what failed, change one thing: it is learned by doing and passed on by showing. */
export function teachMethod(world: World, teacher: Person, learner: Person) {
  const a = methodOf(teacher);
  const b = methodOf(learner);
  if (a < 0.1 || a <= b + 0.05 || relation(learner, teacher.id, world).trust < 0.2) return false;
  techOf(learner).method = Math.min(0.6, b + 0.5 * (a - b));
  note(learner, world, `${teacher.name} showed me how to go about a problem: one thing at a time, and remember what did not work.`);
  note(teacher, world, `I showed ${learner.name} how I set about working a thing out.`);
  tally(world, "methodTaught");
  return true;
}
export const knownCrafts = (p: Person) => CRAFTS.filter((c) => p.ideas?.includes(c.id)).length;
