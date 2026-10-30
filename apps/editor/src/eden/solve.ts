// Facing problems nobody planned for: a wolf at the camp, a place with no wood within reach. Solving one means asking what could be done, what
// each way would cost in time and distance, how likely it is to work on what they have seen so far, and who else is needed; then choosing,
// and, where it takes more than one pair of hands, getting others to come. Cause and effect are learned from what happens in front of them
// ("the wolf turned away from the fire, twice") and kept as a belief that can be right or wrong and that others can be told.
import { chronicle, isNight, note, rand, relation, tally, ADULT_AGE, AFFORDANCES, type Intent, type Person, type Thing, type World } from "./mind";
import { DAY } from "./earth";
import type { Plan, Step } from "./reason";
import { homeOf, hours, leg, nearest, secsToDark, woodSteps } from "./reason";

type Option = { intent: Omit<Intent, "arrived">; score: number };
const dist = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const WALK = 1.6;
const burning = (t: Thing) => t.kind === "campfire" && (t.fuel ?? 0) > 0;

export interface Team {
  id: string;
  goal: "hunt";
  leader: string;
  members: string[];
  target: string; // the thing being hunted
  rally: { x: number; z: number };
  state: "rally" | "go" | "done" | "failed";
  since: number;
}

// ---- Cause and effect, from experience ----

export interface Rule {
  tries: number; // times it could have shown itself
  hits: number; // times it did
}
/** How much they believe it, from 0 (nothing seen) towards 1: untested rules sit at a doubtful half. */
export const belief = (p: Person, rule: string) => {
  const r = p.rules?.[rule];
  return r ? (r.hits + 0.5) / (r.tries + 1) : 0.5;
};
const bump = (p: Person, rule: string, hit: boolean) => {
  const r = ((p.rules ??= {})[rule] ??= { tries: 0, hits: 0 });
  r.tries++;
  if (hit) r.hits++;
};

/** Watching the world: a wolf that turns back from a fire is a hit for "fire keeps wolves off"; a wolf that comes close with no fire near is a miss. */
export function learnFromWorld(world: World) {
  const now = world.clock ?? 0;
  for (const t of world.things) {
    if (!AFFORDANCES[t.kind]?.predator || !t.mob) continue;
    const repelled = (t.mob.repelledAt ?? -1e9) > now - 3;
    for (const p of world.people) {
      if (p.age < ADULT_AGE || p.intent?.kind === "sleep" || !p.memory.has(t.id)) continue;
      const d = dist(p.x, p.z, t.x, t.z);
      if (repelled && d < 30) {
        const was = p.rules?.fireRepels?.hits ?? 0;
        bump(p, "fireRepels", true);
        if (was === 1 && !p.ideas?.includes("fire-repels")) {
          (p.ideas ??= []).push("fire-repels");
          (world.knowledge ??= {})["fire-repels"] ??= { by: p.id, byName: p.name, t: now };
          chronicle(world, `${p.name} saw the ${t.kind} turn from the fire twice, and understood: fire keeps the wolves away.`);
          note(p, world, "I have seen it twice: the beast will not come near a fire. That is something to use.");
          tally(world, "causesLearned");
        }
      } else if (!repelled && d < 12 && !world.things.some((f) => burning(f) && dist(f.x, f.z, t.x, t.z) < 16) && (p.rules?.noFire?.tries ?? 0) < 6 && now - ((p as { lastNoFire?: number }).lastNoFire ?? -1e9) > 120) {
        (p as { lastNoFire?: number }).lastNoFire = now;
        bump(p, "fireRepels", false);
        bump(p, "noFire", false);
      }
    }
  }
}

// ---- Teams ----

const spearmen = (world: World) => world.people.filter((q) => q.age >= ADULT_AGE && q.tools.spear);

function recruit(world: World, leader: Person, target: Thing): Team | undefined {
  const rally = homeOf(world, leader);
  const members = [leader.id];
  for (const q of world.people) {
    if (q === leader || members.length >= 4 || q.team || !q.tools.spear || q.age < ADULT_AGE || q.needs.hunger > 0.75 || q.needs.thirst > 0.75 || q.health < 0.5) continue;
    if (dist(q.x, q.z, leader.x, leader.z) > 50) continue;
    const trust = relation(q, leader.id, world).trust;
    const willing = 0.25 + 0.4 * q.personality.boldness + 0.5 * trust + 0.15 * (q.emotions?.fear ?? 0);
    if (rand(leader) < willing) {
      members.push(q.id);
      note(q, world, `${leader.name} asked me to help drive off the ${target.kind}. I said yes.`);
      leader.say = `${q.name}, will you come?`;
    } else note(leader, world, `${q.name} would not come against the ${target.kind}.`);
  }
  if (members.length < 2) return undefined;
  const team: Team = { id: `team-${world.teams?.length ?? 0}`, goal: "hunt", leader: leader.id, members, target: target.id, rally: { x: rally.x, z: rally.z }, state: "rally", since: world.clock ?? 0 };
  (world.teams ??= []).push(team);
  for (const id of members) {
    const m = world.people.find((q) => q.id === id)!;
    m.team = team.id;
    m.intent = undefined;
  }
  chronicle(world, `${leader.name} gathered ${members.length - 1} ${members.length === 2 ? "person" : "people"} to drive off the ${target.kind}.`);
  tally(world, "teams");
  return team;
}

/** Moves each team along: gather at the rally point, then go for the beast together, until it is gone or the hunt fails. */
export function teamStep(world: World) {
  const now = world.clock ?? 0;
  for (const team of world.teams ?? []) {
    if (team.state === "done" || team.state === "failed") continue;
    const alive = team.members.filter((id) => world.people.some((q) => q.id === id));
    team.members = alive;
    const target = world.things.find((t) => t.id === team.target);
    if (alive.length < 2 || now - team.since > 400) {
      return endTeam(world, team, target ? "failed" : "done");
    }
    if (!target) return endTeam(world, team, "done");
    if (team.state === "rally") {
      const here = alive.filter((id) => {
        const q = world.people.find((x) => x.id === id)!;
        return dist(q.x, q.z, team.rally.x, team.rally.z) < 10;
      });
      if (here.length === alive.length || now - team.since > 80) team.state = "go";
    }
  }
}
function endTeam(world: World, team: Team, state: "done" | "failed") {
  team.state = state;
  for (const id of team.members) {
    const q = world.people.find((x) => x.id === id);
    if (q) {
      q.team = undefined;
      q.intent = undefined;
      if (state === "done") q.mood = Math.min(1, q.mood + 0.3);
    }
  }
  const leader = world.people.find((q) => q.id === team.leader);
  if (state === "failed" && leader) {
    note(leader, world, "The hunt came to nothing; the beast got away.");
    tally(world, "teamsFailed");
  }
}

/** What each member of a team does next. */
export function teamOptions(person: Person, world: World, out: Option[]) {
  const team = world.teams?.find((t) => t.id === person.team);
  if (!team || team.state === "done" || team.state === "failed") {
    person.team = undefined;
    return;
  }
  if (person.needs.hunger > 0.85 || person.needs.thirst > 0.85) return;
  const target = world.things.find((t) => t.id === team.target);
  if (team.state === "rally") out.push({ intent: { kind: "wander", x: team.rally.x, z: team.rally.z, speed: WALK * 1.4, remaining: 6 }, score: 1.5 });
  else if (target) out.push({ intent: { kind: "hunt", targetId: target.id, x: target.x, z: target.z, speed: WALK * 1.6, remaining: 3 }, score: 1.7 });
}

/** The people at a beast together try to bring it down. Returns true if it fell. */
export function fightBeast(world: World, person: Person, beast: Thing, skill: number): boolean {
  const team = world.teams?.find((t) => t.id === person.team);
  const party = world.people.filter((q) => dist(q.x, q.z, beast.x, beast.z) < 7 && q.tools.spear && (q.team === person.team || !team)).length;
  const chance = clamp01(0.1 + 0.2 * party + 0.25 * skill + 0.1 * person.personality.boldness);
  if (rand(person) < chance) {
    world.things.splice(world.things.indexOf(beast), 1);
    for (const q of world.people) {
      if (dist(q.x, q.z, beast.x, beast.z) < 40) q.mood = Math.min(1, q.mood + 0.15);
    }
    person.carry.hide = Math.min(4, (person.carry.hide ?? 0) + 1);
    chronicle(world, `${person.name}${party > 1 ? ` and ${party - 1} other${party > 2 ? "s" : ""}` : ""} brought down the ${beast.kind}.`);
    note(person, world, `We killed the ${beast.kind}. The camp is safe.`);
    tally(world, "predatorsSlain");
    tally(world, "beastsFought");
    return true;
  }
  person.wound = Math.min(1, (person.wound ?? 0) + 0.18);
  if (beast.mob) beast.mob.fleeUntil = (world.clock ?? 0) + 8;
  note(person, world, `The ${beast.kind} bit me and got away.`);
  person.mood = Math.max(-1, person.mood - 0.1);
  return false;
}

// ---- Solving ----

/** A beast near the camp is a problem; a way out is chosen from what they know and have seen work. */
export function solveProblem(world: World, person: Person): Plan | undefined {
  const now = world.clock ?? 0;
  const home = homeOf(world, person);
  const threat = nearest(world, person, (t) => !!AFFORDANCES[t.kind]?.predator && (AFFORDANCES[t.kind]?.danger ?? 0) >= 0.8 && dist(t.x, t.z, home.x, home.z) < 70, home);
  if (!threat) return undefined;
  if (now - (person.problemAt ?? -1e9) < DAY / 2) return undefined; // thought about already; the plan or the party is on it
  if (world.teams?.some((t) => t.state === "rally" || t.state === "go")) return undefined; // someone is already on it
  const fear = person.emotions?.fear ?? 0;
  const bold = person.personality.boldness;
  const wood = person.carry.wood;
  const options: { name: string; score: number; plan: () => Plan | undefined }[] = [];

  // 1. A fire at the camp: if they believe fire keeps beasts off, and there is wood to be had.
  const fireIsThere = world.things.some((t) => burning(t) && dist(t.x, t.z, home.x, home.z) < 12);
  if (!fireIsThere) {
    const src = wood >= 4 ? { d: 0 } : nearest(world, person, (t) => !!AFFORDANCES[t.kind]?.wood, person);
    if (src) {
      const b = belief(person, "fireRepels");
      const cost = (wood >= 4 ? 0 : 2 * ("d" in src ? (src as { d: number }).d : 0) / WALK + 25) + 12;
      options.push({
        name: "keep a fire burning at camp",
        score: b * 1.0 - cost / 400 + 0.2 * fear - 0.1 * bold,
        plan: () => {
          const steps: Step[] = wood >= 4 ? [] : woodSteps(world, person, 4);
          steps.push({ act: "fire", x: home.x + 2, z: home.z, label: "light a fire at camp to keep the beast off" });
          return { goal: `keep the ${threat.t.kind} off with fire`, why: `A ${threat.t.kind} was seen ${Math.round(threat.d)} m from camp. ${p2(person, b)} A fire costs about ${hours(cost)} and a few sticks.`, steps, made: now, deadline: now + Math.max(120, secsToDark(world)), secs: cost, stepAt: 0 };
        },
      });
    }
  }
  // 2. Go against it together: needs spears and company.
  const armed = spearmen(world);
  if (person.tools.spear && armed.length >= 2) {
    const p = Math.min(0.85, 0.25 + 0.2 * armed.length);
    options.push({
      name: "drive it off with a party",
      score: p * 1.0 - 0.25 + 0.3 * bold - 0.2 * fear,
      plan: () => ({ goal: `drive off the ${threat.t.kind}`, why: `A ${threat.t.kind} is ${Math.round(threat.d)} m from camp. ${armed.length} of us have spears; together we have a fair chance. Someone will be hurt if it goes badly.`, steps: [{ act: "recruit", x: home.x, z: home.z, thing: threat.t.id, label: `ask the others with spears to come against the ${threat.t.kind}` }], made: now, deadline: now + 300, secs: 120, stepAt: 0 }),
    });
  }
  // 3. No spear yet: make one, then think again.
  if (!person.tools.spear && wood >= 2) {
    options.push({ name: "make a spear", score: 0.35 + 0.2 * bold, plan: () => ({ goal: "a spear against the beast", why: `A ${threat.t.kind} is near and I have no spear, but I have wood.`, steps: [{ act: "craft", x: home.x, z: home.z, label: "make a spear at camp" }], made: now, deadline: now + 200, secs: 60, stepAt: 0 }) });
  }
  if (!options.length) return undefined;
  options.sort((a, b) => b.score - a.score);
  const best = options[0]!;
  if (best.score < 0.1) return undefined;
  const plan = best.plan();
  if (plan) person.problemAt = now;
  if (plan) plan.why += ` I chose: ${best.name}.`;
  return plan;
}
const p2 = (person: Person, b: number) => (person.rules?.fireRepels ? `I have ${b > 0.6 ? "seen" : "doubts that"} fire keeps them back (${person.rules.fireRepels.hits} of ${person.rules.fireRepels.tries} times).` : "I have never seen what a fire does to them, but it is worth a try.");

/** A trip into ground nobody here has seen, when what is known runs short, or just from wanting to know. */
export function scoutPlan(world: World, person: Person): Plan | undefined {
  const now = world.clock ?? 0;
  if (isNight(now) || person.needs.hunger > 0.5 || person.needs.thirst > 0.5) return undefined;
  if (now - (person.scoutedAt ?? -1e9) < 2 * DAY) return undefined; // a trip every couple of days at most
  const home = homeOf(world, person);
  const woodNear = nearest(world, person, (t) => !!AFFORDANCES[t.kind]?.wood, home);
  const foodNear = nearest(world, person, (t) => !!AFFORDANCES[t.kind]?.food && !AFFORDANCES[t.kind]?.shelter && (t.stock === undefined || t.stock > 1), home);
  const lacks = !woodNear || woodNear.d > 55 ? "wood" : !foodNear || foodNear.d > 55 ? "food" : undefined;
  const wanders = person.personality.curiosity > 0.65 && rand(person) < 0.12;
  if (!lacks && !wanders) return undefined;
  const left = secsToDark(world);
  const r = world.radius ?? 120;
  let best: { x: number; z: number; d: number; dir: string } | undefined;
  const DIRS = ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"];
  for (const d of [55, 80, 110]) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.3 * rand(person);
      const x = home.x + Math.cos(a) * d;
      const z = home.z + Math.sin(a) * d;
      if (Math.hypot(x, z) > r * 0.95) continue;
      if (person.explored.has(`${Math.floor(x / 20)},${Math.floor(z / 20)}`)) continue;
      if ((2 * d) / WALK + 40 > left * 0.8) continue; // there and back before the dark
      if (!best || rand(person) < 0.4) best = { x, z, d, dir: DIRS[i]! };
      break;
    }
    if (best) break;
  }
  if (!best) return undefined;
  person.scoutedAt = now;
  const secs = (2 * best.d) / WALK + 40;
  const why = `${lacks ? `Nothing known within 55 m has ${lacks}.` : "I want to know what is out there."} Nobody has been ${best.dir}, ${Math.round(best.d)} m off. There and back is about ${hours(secs)} and there are ${hours(left)} of light. I will go and look.`;
  return {
    goal: `scout the ${best.dir}`,
    why,
    steps: [
      { act: "goto", x: best.x, z: best.z, label: `walk ${Math.round(best.d)} m ${best.dir}` },
      { act: "goto", x: home.x, z: home.z, label: "come back to camp" },
    ],
    made: now,
    deadline: now + left + 90,
    secs,
    stepAt: 0,
  };
}

export { recruit };
