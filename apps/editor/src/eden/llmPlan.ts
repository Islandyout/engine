// Letting a language model think up a plan, and the world check it. The model is only ever asked to propose steps from a fixed vocabulary
// naming things the person actually knows; every step is then checked against the map, the clock and what they carry before it becomes a
// plan, and a proposal that cannot work is thrown away with the reason. Nothing the model says runs unchecked, and the minds stay
// deterministic without it.
import { DAY } from "./earth";
import { INVENTIONS } from "./culture";
import type { Plan, Step } from "./reason";
import { homeOf, hours, leg, secsToDark, secsToWinter } from "./reason";
import { AFFORDANCES, ADULT_AGE, type Person, type Thing, type World } from "./mind";

const dist = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);
const DIRS: Record<string, number> = { east: 0, "south-east": 45, south: 90, "south-west": 135, west: 180, "north-west": 225, north: 270, "north-east": 315 };

/** What a person knows of the world, in words and numbers the model can reason with. */
export function situationOf(world: World, person: Person): string {
  const home = homeOf(world, person);
  const now = world.clock ?? 0;
  const places = world.things
    .filter((t) => person.memory.has(t.id) && !t.mob)
    .map((t) => ({ t, d: dist(person.x, person.z, t.x, t.z) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 14)
    .map(({ t, d }) => `${t.id} (${t.kind}${AFFORDANCES[t.kind]?.wood ? ", has wood" : ""}${AFFORDANCES[t.kind]?.food && !AFFORDANCES[t.kind]?.shelter ? ", has food" : ""}${AFFORDANCES[t.kind]?.water ? ", water" : ""}, ${Math.round(d)} m)`);
  const beasts = world.things.filter((t) => AFFORDANCES[t.kind]?.predator && person.memory.has(t.id)).map((t) => `${t.id} (${t.kind}, ${Math.round(dist(home.x, home.z, t.x, t.z))} m from camp)`);
  const armed = world.people.filter((q) => q.age >= ADULT_AGE && q.tools.spear).map((q) => q.name);
  const shelters = world.things.filter((t) => t.kind === "shelter");
  const larder = shelters.reduce((a, t) => a + (t.stock ?? 0), 0);
  const known = (person.ideas ?? []).filter((i) => !i.startsWith("read:"));
  return [
    `Time: ${Math.round(secsToDark(world) / 6) / 10} hours of light left. Winter in ${(secsToWinter(world) / DAY).toFixed(1)} days.`,
    `Weather: ${Math.round(world.weather?.tempC ?? 15)} degrees.`,
    `You carry: wood ${person.carry.wood}, food ${person.carry.food}, hides ${person.carry.hide ?? 0}. ${person.tools.spear ? "You have a spear." : "You have no spear."}`,
    `Hunger ${Math.round(person.needs.hunger * 100)}%, thirst ${Math.round(person.needs.thirst * 100)}%.`,
    `Places you know: ${places.join("; ") || "none"}.`,
    beasts.length ? `Beasts you know of: ${beasts.join("; ")}.` : "No beasts known.",
    `People with spears: ${armed.join(", ") || "none"}. Food in the larder: ${Math.round(larder)} for ${world.people.filter((q) => q.age >= ADULT_AGE).length} adults.`,
    `Things you know how to make: ${INVENTIONS.filter((r) => known.includes(r.id)).map((r) => `${r.id} (${r.wood} wood${r.hide ? " and a hide" : ""}, ${r.place === "water" ? "by water" : "by a game trail"})`).join(", ") || "nothing special"}.`,
    `It is ${Math.floor((now % DAY) / 60)}:00 on the day clock.`,
  ].join("\n");
}

export const PLAN_SYSTEM = `You help one person in a simple world (no metal, no machines) decide what to do next. Reply with ONLY a JSON object, no other text:
{"goal":"<short>","why":"<one or two sentences, in the first person>","steps":[{"do":"gather|forage|stash|fire|craft|make|recruit|goto","at":"<place id from the list>","recipe":"<only for make>","dir":"<only for goto: east, south, west, north...>","metres":<only for goto: number>}]}
Rules: at most 6 steps. Use only place ids from the list. gather gets 3 wood at a place that has wood; forage gets food at a place that has food; stash puts carried food in the shelter; fire needs 2 wood; craft makes a spear (2 wood); make needs a recipe you know and its wood; recruit asks people with spears to come against a beast (at = the beast's id; needs a spear and others with spears); goto walks to a place id, or in a compass direction for some metres, to explore. Go and come back before dark.`;

/** The model's answer, checked against the world. Returns a plan, or the reason it could not work. */
export function parsePlan(world: World, person: Person, text: string): { plan?: Plan; error?: string } {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return { error: "no JSON in the answer" };
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch (e) {
    return { error: `the answer was not valid JSON (${(e as Error).message})` };
  }
  const o = raw as { goal?: unknown; why?: unknown; steps?: unknown };
  if (!Array.isArray(o.steps) || o.steps.length === 0 || o.steps.length > 6) return { error: "steps must be a list of one to six" };
  const home = homeOf(world, person);
  const thing = (id: unknown): Thing | undefined => (typeof id === "string" ? world.things.find((t) => t.id === id && person.memory.has(t.id)) : undefined);
  let wood = person.carry.wood;
  let food = person.carry.food;
  let spear = person.tools.spear;
  let at = { x: person.x, z: person.z };
  let secs = 0;
  const steps: Step[] = [];
  for (const [i, s] of (o.steps as Record<string, unknown>[]).entries()) {
    const label = (t: string) => t.slice(0, 80);
    const act = s.do;
    const place = thing(s.at);
    const move = (x: number, z: number) => {
      secs += leg(at.x, at.z, x, z);
      at = { x, z };
    };
    switch (act) {
      case "gather":
        if (!place || !AFFORDANCES[place.kind]?.wood) return { error: `step ${i + 1}: ${String(s.at)} is not a place you know with wood` };
        move(place.x, place.z);
        wood = Math.min(10, wood + 3);
        secs += 25;
        steps.push({ act: "gather", x: place.x, z: place.z, thing: place.id, want: wood, label: label(`fetch wood from ${place.kind}`) });
        break;
      case "forage":
        if (!place || !AFFORDANCES[place.kind]?.food || AFFORDANCES[place.kind]?.shelter) return { error: `step ${i + 1}: ${String(s.at)} has no food to pick` };
        move(place.x, place.z);
        food = Math.min(8, food + 3);
        secs += 22;
        steps.push({ act: "forage", x: place.x, z: place.z, thing: place.id, want: Math.min(8, food), label: label(`pick food at ${place.kind}`) });
        break;
      case "stash": {
        const sh = place ?? thing(world.things.find((t) => t.kind === "shelter")?.id);
        if (!sh || sh.kind !== "shelter") return { error: `step ${i + 1}: no shelter to stash in` };
        if (food < 1) return { error: `step ${i + 1}: nothing carried to stash` };
        move(sh.x, sh.z);
        food = 0;
        steps.push({ act: "stash", x: sh.x, z: sh.z, thing: sh.id, label: "put the food in the larder" });
        break;
      }
      case "fire":
        if (wood < 2) return { error: `step ${i + 1}: a fire needs 2 wood and you will have ${wood}` };
        move(home.x + 2, home.z);
        wood -= 2;
        secs += 12;
        steps.push({ act: "fire", x: home.x + 2, z: home.z, label: "light a fire at camp" });
        break;
      case "craft":
        if (spear) return { error: `step ${i + 1}: you already have a spear` };
        if (wood < 2) return { error: `step ${i + 1}: a spear needs 2 wood` };
        move(home.x, home.z);
        wood -= 2;
        spear = true;
        secs += 40;
        steps.push({ act: "craft", x: home.x, z: home.z, label: "make a spear" });
        break;
      case "make": {
        const r = INVENTIONS.find((x) => x.id === s.recipe);
        if (!r || !person.ideas?.includes(r.id)) return { error: `step ${i + 1}: you do not know how to make ${String(s.recipe)}` };
        if (wood < r.wood || (person.carry.hide ?? 0) < r.hide) return { error: `step ${i + 1}: not enough materials for ${r.id}` };
        const where = place ?? (r.place === "water" ? world.things.find((t) => AFFORDANCES[t.kind]?.water && person.memory.has(t.id)) : world.things.find((t) => AFFORDANCES[t.kind]?.prey && person.memory.has(t.id)));
        if (!where) return { error: `step ${i + 1}: nowhere known to put ${r.id}` };
        move(where.x, where.z);
        wood -= r.wood;
        secs += 40;
        steps.push({ act: "make", x: where.x, z: where.z, thing: where.id, recipe: r.id, label: label(`make ${r.name}`) });
        break;
      }
      case "recruit":
        if (!place || !AFFORDANCES[place.kind]?.predator) return { error: `step ${i + 1}: recruit needs a beast's id` };
        if (!spear) return { error: `step ${i + 1}: you need a spear to lead a party` };
        if (world.people.filter((q) => q.age >= ADULT_AGE && q.tools.spear).length < 2) return { error: `step ${i + 1}: nobody else has a spear` };
        steps.push({ act: "recruit", x: home.x, z: home.z, thing: place.id, label: label(`ask the others to come against the ${place.kind}`) });
        break;
      case "goto": {
        let x: number;
        let z: number;
        if (place) [x, z] = [place.x, place.z];
        else if (typeof s.dir === "string" && s.dir in DIRS && typeof s.metres === "number" && s.metres > 0 && s.metres <= 150) {
          const a = (DIRS[s.dir]! * Math.PI) / 180;
          x = at.x + Math.cos(a) * s.metres;
          z = at.z + Math.sin(a) * s.metres;
          if (Math.hypot(x, z) > (world.radius ?? 200)) return { error: `step ${i + 1}: that is off the edge of the land` };
        } else return { error: `step ${i + 1}: goto needs a place id, or a compass direction and metres up to 150` };
        move(x, z);
        steps.push({ act: "goto", x, z, label: label(place ? `walk to ${place.kind}` : `walk ${Math.round(s.metres as number)} m ${String(s.dir)}`) });
        break;
      }
      default:
        return { error: `step ${i + 1}: "${String(act)}" is not something you can do` };
    }
  }
  const light = secsToDark(world);
  const exploring = steps.some((s) => s.act === "goto");
  if (exploring) {
    secs += leg(at.x, at.z, home.x, home.z); // there must be a way home
    steps.push({ act: "goto", x: home.x, z: home.z, label: "come back to camp" });
  }
  if (secs > Math.max(light, 90) * 0.9 && light > 0) return { error: `it would take about ${hours(secs)} and only ${hours(light)} of light is left` };
  const clean = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f<>]/g, " ").trim().slice(0, n) : "");
  const goal = clean(o.goal, 60) || "a plan";
  const why = `${clean(o.why, 260) || "I thought it through."} (Checked on the map: about ${hours(secs)}.)`;
  const now = world.clock ?? 0;
  return { plan: { goal, why, steps, made: now, deadline: now + Math.max(light, 120) + 60, secs, stepAt: 0 } };
}
