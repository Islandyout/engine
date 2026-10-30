// Thinking ahead: working out what to do from where things are and how long things take, and finding things nobody has told them.
//
// A person here knows where they have been (their memory has places), how far apart those are and how fast they walk, what hour it is, when
// the dark and the winter come, and what they carry. From that they make a PLAN: a short run of steps toward something they can foresee
// needing ("it will be cold and dark in two hours and I have no wood: fetch wood from the grove, 30 m off, and light a fire at camp"), with a
// time estimate and a deadline, and they carry it out step by step, noticing when it has worked or gone wrong. When they want something
// and no known way gets it, they EXPERIMENT: try a combination of what they hold in a place, remember what did not work, and when
// something does, it is theirs to use and to teach (culture.ts INVENTIONS: laws of this world that nobody is told).
import { DAY, YEAR } from "./earth";
import { INVENTIONS, knows } from "./culture";
import { recruit, scoutPlan, solveProblem, teamOptions } from "./solve";
import { ADULT_AGE, AFFORDANCES, chronicle, isNight, make, note, rand, tally, type Intent, type Person, type Thing, type World } from "./mind";

type Option = { intent: Omit<Intent, "arrived">; score: number };

export interface Step {
  act: "gather" | "fire" | "forage" | "stash" | "make" | "invent" | "goto" | "recruit" | "craft";
  x: number;
  z: number;
  thing?: string; // what to go to
  recipe?: string; // make: which invention
  hyp?: { wood: number; hide: number; place: "water" | "prey" }; // invent: what is to be tried
  label: string;
  want?: number; // gather/forage: how much to be carrying when done
  done?: boolean;
}
export interface Plan {
  goal: string;
  why: string; // the reckoning, in their words
  steps: Step[];
  made: number;
  deadline: number;
  secs: number; // how long it should take
  stepAt: number;
}

const WALK = 1.6;
const dist = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const burning = (t: Thing) => t.kind === "campfire" && (t.fuel ?? 0) > 0;

/** Seconds until it is dark, by looking ahead through the day. */
export function secsToDark(world: World): number {
  const now = world.clock ?? 0;
  if (isNight(now)) return 0;
  for (let s = 30; s <= DAY; s += 30) if (isNight(now + s)) return s;
  return DAY;
}
/** Seconds until winter begins (0 once it has). Winter is the last quarter of the year. */
export function secsToWinter(world: World): number {
  const inYear = (world.clock ?? 0) % YEAR;
  return Math.max(0, 0.75 * YEAR - inYear);
}
export const leg = (ax: number, az: number, bx: number, bz: number) => dist(ax, az, bx, bz) / WALK;
export const hours = (secs: number) => `${(secs / 60).toFixed(1)} hours`; // a world hour is 60 s

export function nearest(world: World, person: Person, pred: (t: Thing) => boolean, from: { x: number; z: number }) {
  let best: Thing | undefined;
  let bd = Infinity;
  for (const t of world.things) {
    if (!person.memory.has(t.id) || !pred(t)) continue;
    const d = dist(from.x, from.z, t.x, t.z);
    if (d < bd) (best = t), (bd = d);
  }
  return best && { t: best, d: bd };
}
export function homeOf(world: World, person: Person): { x: number; z: number } {
  return nearest(world, person, (t) => t.kind === "shelter", person)?.t ?? nearest(world, person, (t) => !!AFFORDANCES[t.kind]?.rest, person)?.t ?? person;
}

/** What they can foresee needing, and how to get it: a plan, or nothing. */
export function foresee(world: World, person: Person): Plan | undefined {
  const now = world.clock ?? 0;
  const season = world.weather?.season ?? 1;
  const temp = world.weather?.tempC ?? 15;
  const home = homeOf(world, person);
  const dark = secsToDark(world);
  const adults = world.people.filter((q) => q.age >= ADULT_AGE).length;
  const wood = person.carry.wood;

  // 0. A beast near the camp, or any trouble that needs working out.
  const trouble = solveProblem(world, person);
  if (trouble) return trouble;

  // 1. A cold dark night is coming and there is no fire to meet it at: fetch wood and light one before the dark.
  const fireAtHome = world.things.some((t) => burning(t) && dist(t.x, t.z, home.x, home.z) < 12);
  if (dark > 0 && dark < 180 && temp < 17 && !fireAtHome) {
    const steps: Step[] = [];
    let secs = 12;
    let at = { x: person.x, z: person.z };
    let carried = wood;
    let why = `Dark in ${hours(dark)} and ${Math.round(temp)} degrees now, colder tonight, and no fire at camp.`;
    if (carried < 4) {
      const src = nearest(world, person, (t) => !!AFFORDANCES[t.kind]?.wood, person);
      if (!src) return undefined; // nowhere known to get wood: nothing to plan
      const gathers = Math.ceil((4 - carried) / 3);
      for (let i = 0; i < gathers; i++) {
        carried += 3;
        steps.push({ act: "gather", x: src.t.x, z: src.t.z, thing: src.t.id, want: Math.min(10, carried), label: `fetch wood from ${src.t.kind} (${Math.round(src.d)} m away)` });
      }
      secs += leg(at.x, at.z, src.t.x, src.t.z) + 25 * gathers + leg(src.t.x, src.t.z, home.x, home.z);
      why += ` No wood in hand: ${src.t.kind}, ${Math.round(src.d)} m off, ${Math.round(leg(at.x, at.z, src.t.x, src.t.z))} s each way.`;
      at = home;
    } else secs += leg(at.x, at.z, home.x, home.z);
    steps.push({ act: "fire", x: home.x + 2, z: home.z, label: "light the fire at camp" });
    why += ` About ${hours(secs)} of work; ${secs < dark - 20 ? "there is time" : "I must go now"}.`;
    return { goal: "a fire for the night", why, steps, made: now, deadline: now + dark, secs, stepAt: 0 };
  }

  // 2. Winter is coming and the larder is thin: work out how many trips, against how many days are left.
  const shelters = world.things.filter((t) => t.kind === "shelter" && person.memory.has(t.id));
  if ((season === 1 || season === 2) && shelters.length && person.needs.hunger < 0.5 && !isNight(now)) {
    const stored = shelters.reduce((a, t) => a + (t.stock ?? 0), 0);
    const need = 4 * adults + 2;
    const toWinter = secsToWinter(world);
    if (stored + person.carry.food < need && toWinter > 0) {
      const src = nearest(world, person, (t) => !!AFFORDANCES[t.kind]?.food && !AFFORDANCES[t.kind]?.shelter && (t.stock === undefined || t.stock > 1), person);
      const sh = shelters[0]!;
      if (src) {
        const perTrip = 4;
        const trips = Math.min(2, Math.ceil((need - stored - person.carry.food) / perTrip));
        const steps: Step[] = [];
        for (let i = 0; i < trips; i++) {
          steps.push({ act: "forage", x: src.t.x, z: src.t.z, thing: src.t.id, want: perTrip, label: `pick food at ${src.t.kind} (${Math.round(src.d)} m)` });
          steps.push({ act: "stash", x: sh.x, z: sh.z, thing: sh.id, label: "put it in the larder" });
        }
        const secs = trips * (leg(person.x, person.z, src.t.x, src.t.z) + 30 + leg(src.t.x, src.t.z, sh.x, sh.z) + 10);
        const days = toWinter / DAY;
        const why = `Winter in ${days.toFixed(1)} days. The larder holds ${Math.round(stored)} and we need about ${need}. ${src.t.kind} is ${Math.round(src.d)} m away: ${trips} trip${trips > 1 ? "s" : ""}, ${hours(secs)}.`;
        return { goal: "a full larder for winter", why, steps, made: now, deadline: now + toWinter, secs, stepAt: 0 };
      }
    }
  }

  // 3. Food is short for the year and a way they know of could ease it: use it.
  const short = shelters.length > 0 && shelters.reduce((a, t) => a + (t.stock ?? 0), 0) < 4 * adults;
  if ((season === 1 || season === 2) && !isNight(now)) {
    for (const r of short ? INVENTIONS : []) {
      if (!person.ideas?.includes(r.id)) continue;
      if (r.id === "net") {
        if (person.tools.net || (person.carry.hide ?? 0) < r.hide) continue;
        const water = nearest(world, person, (t) => !!AFFORDANCES[t.kind]?.water, person);
        if (!water) continue;
        const steps: Step[] = [];
        if (wood < r.wood) steps.push(...woodSteps(world, person, r.wood));
        steps.push({ act: "make", x: water.t.x, z: water.t.z, thing: water.t.id, recipe: "net", label: "knot a net" });
        return { goal: "a net for the fish", why: `The larder is thin. I know how to make a net, and I have a hide.`, steps, made: now, deadline: now + secsToWinter(world), secs: 120, stepAt: 0 };
      }
      const placeTarget = r.place === "water" ? nearest(world, person, (t) => !!AFFORDANCES[t.kind]?.water, person) : nearest(world, person, (t) => !!AFFORDANCES[t.kind]?.prey, person);
      if (!placeTarget) continue;
      if (world.things.some((t) => t.kind === r.id && dist(t.x, t.z, placeTarget.t.x, placeTarget.t.z) < 14)) continue; // one is there already
      const steps: Step[] = [];
      if (wood < r.wood) steps.push(...woodSteps(world, person, r.wood));
      steps.push({ act: "make", x: placeTarget.t.x, z: placeTarget.t.z, thing: placeTarget.t.id, recipe: r.id, label: `make ${r.name} by the ${placeTarget.t.kind}` });
      const secs = leg(person.x, person.z, placeTarget.t.x, placeTarget.t.z) + 60;
      return { goal: `${r.name} for food`, why: `The larder is thin, and I know ${r.name} works. The ${placeTarget.t.kind} is ${Math.round(placeTarget.d)} m off.`, steps, made: now, deadline: now + secsToWinter(world), secs, stepAt: 0 };
    }
    // Nothing known will do: try something new. Which combinations have they already found do nothing?
    // Wondering is not only for hard times: a curious person with a free day tries things anyway, more so when food is short.
    if (person.personality.curiosity > 0.4 && (short || rand(person) < 0.3) && person.needs.hunger < 0.4 && (person.tried?.length ?? 0) < 12) {
      const hyp = pickHypothesis(world, person);
      if (hyp) {
        const target = hyp.place === "water" ? nearest(world, person, (t) => !!AFFORDANCES[t.kind]?.water, person) : nearest(world, person, (t) => !!AFFORDANCES[t.kind]?.prey, person);
        if (target) {
          const steps: Step[] = [];
          if (wood < hyp.wood) steps.push(...woodSteps(world, person, hyp.wood));
          steps.push({ act: "invent", x: target.t.x, z: target.t.z, thing: target.t.id, hyp, label: `try ${hyp.wood} wood${hyp.hide ? " and a hide" : ""} by the ${target.t.kind}` });
          return { goal: "a better way to get food", why: `${short ? "Food is short and nothing I know of will fix it" : "I wonder if there is a better way to get food"}. Perhaps ${hyp.wood} sticks${hyp.hide ? " and a hide" : ""}, put together by the ${target.t.kind}, would do something. I will find out.`, steps, made: now, deadline: now + secsToWinter(world), secs: 150, stepAt: 0 };
        }
      }
    }
  }
  return scoutPlan(world, person);
}

export function woodSteps(world: World, person: Person, need: number): Step[] {
  const src = nearest(world, person, (t) => !!AFFORDANCES[t.kind]?.wood, person);
  if (!src) return [];
  const out: Step[] = [];
  let carried = person.carry.wood;
  while (carried < need) {
    carried = Math.min(10, carried + 3);
    out.push({ act: "gather", x: src.t.x, z: src.t.z, thing: src.t.id, want: carried, label: `fetch wood from ${src.t.kind} (${Math.round(src.d)} m)` });
  }
  return out;
}

/** An untried combination they could make with what they hold or can fetch: how much wood, whether with a hide, and where. */
function pickHypothesis(world: World, person: Person): { wood: number; hide: number; place: "water" | "prey" } | undefined {
  const tried = new Set(person.tried ?? []);
  const options: { wood: number; hide: number; place: "water" | "prey" }[] = [];
  for (const wood of [2, 3, 4]) for (const hide of [0, 1]) for (const place of ["water", "prey"] as const) {
    if (hide > (person.carry.hide ?? 0)) continue;
    if (tried.has(key({ wood, hide, place }))) continue;
    if (INVENTIONS.some((r) => r.wood === wood && r.hide === hide && r.place === place && person.ideas?.includes(r.id))) continue; // already known
    options.push({ wood, hide, place });
  }
  return options.length ? options[Math.floor(rand(person) * options.length)] : undefined;
}
const key = (h: { wood: number; hide: number; place: string }) => `${h.wood}w${h.hide}h@${h.place}`;

function stepDone(world: World, person: Person, step: Step): boolean {
  if (step.done) return true;
  switch (step.act) {
    case "gather":
      return person.carry.wood >= (step.want ?? 4);
    case "fire":
      return world.things.some((t) => burning(t) && dist(t.x, t.z, step.x, step.z) < 12);
    case "forage":
      return person.carry.food >= (step.want ?? 3);
    case "stash":
      return person.carry.food < 1;
    case "goto":
      return dist(person.x, person.z, step.x, step.z) < 9;
    case "craft":
      return person.tools.spear;
    default:
      return false;
  }
}

/** The next step of whatever they have in mind, as something to choose; planning anew when there is nothing in mind. */
export function planOptions(person: Person, world: World, out: Option[]) {
  if (person.age < ADULT_AGE) return;
  if (person.team) return teamOptions(person, world, out);
  const now = world.clock ?? 0;
  let plan = person.plan;
  if (plan) {
    while (plan.stepAt < plan.steps.length && stepDone(world, person, plan.steps[plan.stepAt]!)) plan.stepAt++;
    if (plan.stepAt >= plan.steps.length) {
      note(person, world, `It worked out: ${plan.goal}.`);
      tally(world, "plansDone");
      person.plan = undefined;
      plan = undefined;
    } else if (now > plan.deadline + 60) {
      note(person, world, `I ran out of time for ${plan.goal}.`);
      tally(world, "plansLate");
      tally(world, `late: ${plan.goal.replace(/ the .*$/, "").slice(0, 24)}`);
      person.plan = undefined;
      plan = undefined;
    } else if (now - plan.made > Math.max(DAY, plan.secs * 6)) {
      note(person, world, `I gave up on ${plan.goal}; it was taking too long.`);
      tally(world, "plansDropped");
      person.plan = undefined;
      plan = undefined;
    }
  }
  if (!plan) {
    if (now - (person.planAt ?? -1e9) < 25) return;
    person.planAt = now;
    plan = foresee(world, person);
    if (!plan) return;
    person.plan = plan;
    note(person, world, `I thought ahead. ${plan.why}`);
    tally(world, "plans");
    if (plan.goal.startsWith("scout")) tally(world, "scouts");
  }
  const step = plan.steps[plan.stepAt]!;
  const slack = plan.deadline - now - plan.secs;
  const urgency = slack <= 0 ? 1 : clamp01(1 - slack / Math.max(120, plan.deadline - plan.made));
  const base = { x: step.x, z: step.z, speed: WALK };
  // Foresight yields to the body: as hunger, thirst or tiredness press, the plan waits (the need itself is scored by the rest of the mind).
  const pressing = Math.max(person.needs.hunger, person.needs.thirst);
  if (pressing > 0.65 || person.needs.energy > 0.85) return;
  const score = (0.8 + 0.5 * urgency) * (pressing > 0.35 ? Math.max(0.15, 1 - 2.5 * (pressing - 0.35)) : 1);
  switch (step.act) {
    case "gather":
      out.push({ intent: { kind: "gather", targetId: step.thing, ...base, remaining: 25 }, score });
      break;
    case "forage":
      out.push({ intent: { kind: "forage", targetId: step.thing, ...base, remaining: 22 }, score });
      break;
    case "stash":
      out.push({ intent: { kind: "stash", targetId: step.thing, ...base, remaining: 10 }, score });
      break;
    case "fire":
      out.push({ intent: { kind: "fire", ...base, remaining: 12 }, score: score + 0.2 });
      break;
    case "make":
      out.push({ intent: { kind: "make", targetId: step.recipe, ...base, remaining: 40 }, score });
      break;
    case "invent":
      out.push({ intent: { kind: "invent", targetId: step.thing, ...base, remaining: 40 }, score });
      break;
    case "goto":
      out.push({ intent: { kind: "wander", ...base, remaining: 4 }, score: score + 0.1 });
      break;
    case "craft":
      out.push({ intent: { kind: "craft", ...base, remaining: 40 }, score });
      break;
    case "recruit": {
      // Asking others is done on the spot, at camp: it either gathers a party or it does not.
      const beast = world.things.find((t) => t.id === step.thing);
      if (beast) {
        const team = recruit(world, person, beast);
        step.done = true;
        if (!team) note(person, world, `No one would come against the ${beast.kind}.`);
        person.plan = undefined;
      }
      break;
    }
  }
}

function currentStep(person: Person): Step | undefined {
  return person.plan?.steps[person.plan.stepAt];
}

/** Building a thing they know how to make. */
export function doMake(world: World, person: Person, recipeId: string | undefined, joy: (v: number) => void) {
  const r = INVENTIONS.find((i) => i.id === recipeId);
  if (!r || !person.ideas?.includes(r.id) || person.carry.wood < r.wood || (person.carry.hide ?? 0) < r.hide) return;
  person.carry.wood -= r.wood;
  person.carry.hide = (person.carry.hide ?? 0) - r.hide;
  build(world, person, r.id);
  const step = currentStep(person);
  if (step) step.done = true;
  joy(0.15);
  note(person, world, `Made ${r.name}.`);
  person.say = `There. ${r.name[0]!.toUpperCase()}${r.name.slice(1)} to work for us.`;
  tally(world, `made_${r.id}`);
}

function build(world: World, person: Person, id: string) {
  if (id === "net") {
    person.tools.net = true;
    return;
  }
  make(world, id, person.x + 1.5, person.z + 0.5, { radius: 2, stock: 0, maxStock: 3, prefab: id === "weir" ? "Weir" : "Snare" });
}

/** Trying something to see what happens. */
export function doInvent(world: World, person: Person, joy: (v: number) => void) {
  const step = currentStep(person);
  const hyp = step?.hyp;
  if (!step || !hyp) return;
  if (person.carry.wood < hyp.wood || (person.carry.hide ?? 0) < hyp.hide) return;
  (person.tried ??= []).push(key(hyp));
  const hit = INVENTIONS.find((r) => r.wood === hyp.wood && r.hide === hyp.hide && r.place === hyp.place);
  step.done = true;
  if (hit) {
    person.carry.wood -= hit.wood;
    person.carry.hide = (person.carry.hide ?? 0) - hit.hide;
    (world.knowledge ??= {})[hit.id] ??= { by: person.id, byName: person.name, t: world.clock ?? 0 };
    if (!person.ideas?.includes(hit.id)) (person.ideas ??= []).push(hit.id);
    build(world, person, hit.id);
    person.mood = Math.min(1, person.mood + 0.3);
    joy(0.3);
    if (!knownBefore(world, hit.id, person)) chronicle(world, hit.line(person));
    note(person, world, `It worked! ${hit.effect[0]!.toUpperCase()}${hit.effect.slice(1)}. I know ${hit.name} now.`);
    person.say = "Look, it works!";
    tally(world, "inventions");
  } else {
    person.carry.wood = Math.max(0, person.carry.wood - 1);
    joy(0.03);
    note(person, world, `Tried ${hyp.wood} wood${hyp.hide ? " and a hide" : ""} by the ${hyp.place === "water" ? "water" : "game trail"}. Nothing came of it. I will not try that again.`);
    person.say = "Nothing. Try another way.";
    tally(world, "failedTries");
  }
  person.plan = undefined; // the experiment is over, win or lose; what they do next is thought afresh
}
const knownBefore = (world: World, id: string, person: Person) => world.people.some((q) => q !== person && q.ideas?.includes(id)) || (world.works ?? []).some((w) => w.knows?.includes(id));

/** Whether a weir's or a snare's regrowth is allowed this tick: weirs need fish in the water, snares need game about. */
export function worksNow(world: World, t: Thing): boolean {
  if (t.kind === "weir") return (world.fish ?? 0) > 3;
  if (t.kind === "snare") return world.things.some((q) => AFFORDANCES[q.kind]?.prey && dist(q.x, q.z, t.x, t.z) < 40);
  return true;
}
export const hasKnowledge = knows;

/** A plan proposed from outside (a language model) and already checked by llmPlan.parsePlan: it becomes theirs. */
export function adoptPlan(world: World, person: Person, plan: Plan) {
  person.plan = plan;
  person.planAt = world.clock ?? 0;
  note(person, world, `I thought it through. ${plan.why}`);
  tally(world, "plans");
  tally(world, "plansFromVoice");
}
