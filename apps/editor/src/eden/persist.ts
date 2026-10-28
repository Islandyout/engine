// Saving and loading Eden's world, so a life goes on across sessions: every person with what they remember, feel, carry, and what they have
// been through, and every thing in the garden with what is left of it. The text is JSON, so it can be kept in the browser, a file, or sent
// over the control port, and a loaded world carries on exactly as the saved one would have (the random streams are saved too).
import type { Goal, JournalEntry, Memory, Person, Relation, Thing, World } from "./mind";
import type { Climate, } from "./earth";

const FORMAT = 1;

export function worldToJson(world: World): string {
  return JSON.stringify({
    format: FORMAT,
    clock: world.clock,
    radius: world.radius,
    climate: world.climate,
    built: world.built,
    override: world.override,
    rng: world.rng,
    fish: world.fish,
    norms: world.norms,
    names: world.names,
    noGo: world.noGo,
    chronicle: world.chronicle,
    tally: world.tally,
    maxPeople: world.maxPeople,
    strangers: world.strangers,
    walker: world.walker,
    dead: (world.dead ?? []).map((d) => ({ ...d, person: { ...d.person, memory: [...d.person.memory], explored: [...d.person.explored], relations: [...d.person.relations], lastChoice: [] } })),
    things: world.things,
    people: world.people.map((p) => ({ ...p, memory: [...p.memory], explored: [...p.explored], relations: [...p.relations], lastChoice: [] })),
  });
}

const fail = (what: string): never => {
  throw new Error(`Eden save is not valid: ${what}`);
};
const num = (v: unknown, what: string): number => (typeof v === "number" && Number.isFinite(v) ? v : fail(what));
const str = (v: unknown, what: string): string => (typeof v === "string" ? v : fail(what));
const arr = (v: unknown, what: string): unknown[] => (Array.isArray(v) ? v : fail(what));
const obj = (v: unknown, what: string): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : fail(what));

function readPerson(q: unknown, i: number): Person {
  const o = obj(q, `person ${i}`);
  const needs = obj(o.needs, `person ${i} needs`);
  const personality = obj(o.personality, `person ${i} personality`);
  const carry = obj(o.carry, `person ${i} carry`);
  return {
    ...(o as unknown as Person),
    id: str(o.id, `person ${i} id`),
    name: str(o.name, `person ${i} name`),
    x: num(o.x, `person ${i} x`),
    z: num(o.z, `person ${i} z`),
    health: num(o.health, `person ${i} health`),
    cold: num(o.cold, `person ${i} cold`),
    mood: num(o.mood, `person ${i} mood`),
    clock: num(o.clock, `person ${i} clock`),
    rngState: num(o.rngState, `person ${i} rngState`),
    needs: { hunger: num(needs.hunger, "hunger"), thirst: num(needs.thirst, "thirst"), energy: num(needs.energy, "energy"), social: num(needs.social, "social"), joy: num(needs.joy, "joy") },
    personality: { boldness: num(personality.boldness, "boldness"), sociability: num(personality.sociability, "sociability"), curiosity: num(personality.curiosity, "curiosity"), appetite: num(personality.appetite, "appetite"), patience: num(personality.patience, "patience") },
    carry: { wood: num(carry.wood, "carry wood"), food: num(carry.food, "carry food"), seed: carry.seed === undefined ? 0 : num(carry.seed, "carry seed"), hide: carry.hide === undefined ? undefined : num(carry.hide, "carry hide") },
    tools: { spear: obj(o.tools ?? { spear: false }, "tools").spear === true },
    memory: new Map(arr(o.memory, `person ${i} memory`) as [string, Memory][]),
    explored: new Set(arr(o.explored, `person ${i} explored`) as string[]),
    relations: new Map(arr(o.relations, `person ${i} relations`) as [string, Relation][]),
    journal: arr(o.journal, `person ${i} journal`) as JournalEntry[],
    goals: arr(o.goals, `person ${i} goals`) as Goal[],
    lastChoice: [],
    say: undefined,
  };
  }

export function worldFromJson(text: string): World {
  let raw: Record<string, unknown>;
  try {
    raw = obj(JSON.parse(text), "not an object");
  } catch (e) {
    return fail(String(e));
  }
  if (raw.format !== FORMAT) fail(`format ${String(raw.format)} (this version reads ${FORMAT})`);
  const things = arr(raw.things, "things").map((t, i): Thing => {
    const o = obj(t, `thing ${i}`);
    return { ...(o as unknown as Thing), id: str(o.id, `thing ${i} id`), kind: str(o.kind, `thing ${i} kind`), x: num(o.x, `thing ${i} x`), z: num(o.z, `thing ${i} z`), radius: num(o.radius, `thing ${i} radius`) };
  });
  const people = arr(raw.people, "people").map(readPerson);
  const dead = raw.dead === undefined ? undefined : arr(raw.dead, "dead").map((d, i) => { const o = obj(d, `dead ${i}`); return { person: readPerson(o.person, i), t: num(o.t, `dead ${i} t`), cause: str(o.cause, `dead ${i} cause`) }; });
  return {
    things,
    people,
    dead,
    tally: raw.tally === undefined ? undefined : (raw.tally as Record<string, number>),
    rng: raw.rng === undefined ? undefined : num(raw.rng, "rng"),
    fish: raw.fish === undefined ? undefined : num(raw.fish, "fish"),
    norms: raw.norms === undefined ? undefined : (raw.norms as World["norms"]),
    names: raw.names === undefined ? undefined : (raw.names as World["names"]),
    noGo: raw.noGo === undefined ? undefined : (raw.noGo as World["noGo"]),
    chronicle: raw.chronicle === undefined ? undefined : (raw.chronicle as World["chronicle"]),
    maxPeople: raw.maxPeople === undefined ? undefined : num(raw.maxPeople, "maxPeople"),
    strangers: raw.strangers === true ? true : undefined,
    walker: raw.walker === undefined ? undefined : (raw.walker as World["walker"]),
    clock: raw.clock === undefined ? undefined : num(raw.clock, "clock"),
    radius: raw.radius === undefined ? undefined : num(raw.radius, "radius"),
    climate: raw.climate === undefined ? undefined : (raw.climate as Climate),
    built: raw.built === undefined ? undefined : num(raw.built, "built"),
    override: raw.override === undefined ? undefined : (raw.override as World["override"]),
  };
}
