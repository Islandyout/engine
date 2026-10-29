// The Creator's voice: plain words that change the world. "let there be a deer by the river", "rain", "make it winter", "heal Adam",
// "feed Eve", "move Adam to the overlook", "make Eve bolder", "tell Adam well done". Each word either does something and says what, or
// fails and says why (never silently nothing). Pure, so it is tested without a scene; the host places what it makes.
import { fuzzyRank } from "../editor/fuzzy";
import { DAY, YEAR } from "./earth";
import { AFFORDANCES, makePerson, type Person, type Thing, type World } from "./mind";
import { CREATABLE, DRINK_SPOT, EDEN_PLACES } from "./places";

export interface CreatorResult {
  ok: boolean;
  message: string;
  // What was made, for the host to put in the scene.
  made?: Thing[];
  // Someone new was made (their body is the host's to put in the scene).
  people?: Person[];
  // Someone moved: the host moves their body (id, x, z).
  moved?: { id: string; x: number; z: number }[];
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const SEASONS = ["spring", "summer", "autumn", "winter"];
const TRAITS: Record<string, [keyof Person["personality"], number]> = {
  bolder: ["boldness", 0.25], braver: ["boldness", 0.25], shyer: ["boldness", -0.25], timid: ["boldness", -0.25],
  friendlier: ["sociability", 0.25], warmer: ["sociability", 0.25], quieter: ["sociability", -0.25],
  curious: ["curiosity", 0.25], curiouser: ["curiosity", 0.25], calmer: ["curiosity", -0.25],
  hungrier: ["appetite", 0.2], patient: ["patience", 0.25], patienter: ["patience", 0.25], hasty: ["patience", -0.25], hastier: ["patience", -0.25],
};

const placeSpot = (id: string) => (id === "river_bend" ? DRINK_SPOT : (EDEN_PLACES[id]?.stand ?? EDEN_PLACES[id] ?? EDEN_PLACES.center!));

function findPlace(text: string): { id: string; x: number; z: number } | undefined {
  const names = Object.values(EDEN_PLACES);
  const q = text.replace(/^the\s+/, "").trim();
  if (!q) return undefined;
  // Typos are forgiven within a word, not across words: "moon" is not "south meadow" just because its letters appear in order.
  const words = names.flatMap((p) => `${p.id.replace("_", " ")} ${p.name}`.split(/\s+/).filter((w) => w !== "the").map((w) => ({ p, w })));
  const hit = fuzzyRank(words, q, (x) => x.w)[0]?.p ?? names.find((p) => `${p.id.replace("_", " ")} ${p.name}`.includes(q));
  return hit ? { id: hit.id, ...placeSpot(hit.id) } : undefined;
}

function findPeople(world: World, text: string): Person[] {
  const q = text.trim().toLowerCase();
  if (/^(both|them|everyone|all)$/.test(q)) return world.people;
  return world.people.filter((p) => p.name.toLowerCase() === q || p.id.toLowerCase() === q);
}

const say = (ok: boolean, message: string, extra: Partial<CreatorResult> = {}): CreatorResult => ({ ok, message, ...extra });

export function runCreatorCommand(world: World, input: string, rnd: () => number = Math.random): CreatorResult {
  let text = input.trim().replace(/[.!]+$/, "");
  if (!text) return say(false, "Say what you want: a thing to create, the weather, a season, or something to do for Adam or Eve.");
  text = text.replace(/^let there be\s+/i, "").replace(/^let it\s+/i, "").trim();
  const lower = text.toLowerCase();
  const clock = world.clock ?? DAY / 3; // the same start step() gives a world with no clock yet

  // Who someone is: "Adam's story is ..."
  const story = text.match(/^(\S+?)(?:'s| is)? story is\s+(.+)$/i);
  if (story) {
    const who = findPeople(world, story[1]!);
    if (!who.length) return say(false, `There is no one called ${story[1]}.`);
    for (const p of who) p.story = story[2]!.trim();
    return say(true, `${who.map((p) => p.name).join(" and ")}'s story is written.`);
  }

  // Weather
  if (/^(rain|make it rain|it rains|raining)$/.test(lower)) {
    world.override = { until: clock + DAY / 4, tempOffset: world.override?.tempOffset ?? 0, rain: true };
    return say(true, "Rain falls.");
  }
  if (/^(clear|sun|sunshine|sunny|clear sky|stop the rain|stop raining|dry)$/.test(lower)) {
    world.override = { until: clock + DAY / 2, tempOffset: world.override?.tempOffset ?? 0, rain: false };
    return say(true, "The rain stops and the sky clears.");
  }
  if (/^(heat ?wave|warm|warm spell|hot)$/.test(lower)) {
    world.override = { until: clock + DAY, tempOffset: 8, rain: world.override?.rain };
    return say(true, "A warm spell settles over the garden for a day.");
  }
  if (/^(cold snap|frost|cold|freeze)$/.test(lower)) {
    world.override = { until: clock + DAY, tempOffset: -8, rain: world.override?.rain };
    return say(true, "A cold snap comes down for a day.");
  }
  // Season
  const seasonMatch = lower.match(/^(?:make it |it is |be )?(spring|summer|autumn|fall|winter)$/);
  if (seasonMatch) {
    const index = SEASONS.indexOf(seasonMatch[1] === "fall" ? "autumn" : seasonMatch[1]!);
    world.clock = Math.floor(clock / YEAR) * YEAR + (index * YEAR) / 4 + (clock % DAY);
    return say(true, `It is ${SEASONS[index]}.`);
  }

  // Things done for people: "heal Adam", "feed both", "move Adam to the river", "make Eve bolder", "tell Adam well done"
  const verb = lower.match(/^(heal|feed|quench|bless|hurt|wake|rest|warm|move|make|tell|say to|name)\s+(.+)$/);
  if (verb) {
    const [, v, rest] = verb;
    if (v === "move") {
      const m = rest!.match(/^(\S+)\s+(?:to|by|at|near)\s+(.+)$/);
      if (!m) return say(false, "Move whom, and where? For example: move Adam to the overlook.");
      const who = findPeople(world, m[1]!);
      const place = findPlace(m[2]!);
      if (!who.length) return say(false, `There is no one called ${m[1]}.`);
      if (!place) return say(false, `There is no place like "${m[2]}". Try: ${Object.values(EDEN_PLACES).map((p) => p.name.replace("the ", "")).join(", ")}.`);
      for (const p of who) {
        p.x = place.x + (rnd() - 0.5) * 3;
        p.z = place.z + (rnd() - 0.5) * 3;
        p.intent = undefined;
      }
      return say(true, `${who.map((p) => p.name).join(" and ")} stand${who.length === 1 ? "s" : ""} at ${EDEN_PLACES[place.id]?.name ?? "the place"}.`, { moved: who.map((p) => ({ id: p.id, x: p.x, z: p.z })) });
    }
    if (v === "make") {
      const m = rest!.match(/^(\S+)\s+(\w+)$/);
      const trait = m ? TRAITS[m[2]!] : undefined;
      if (!m || !trait) return say(false, `Make whom what? For example: make Eve bolder. (${Object.keys(TRAITS).join(", ")})`);
      const who = findPeople(world, m[1]!);
      if (!who.length) return say(false, `There is no one called ${m[1]}.`);
      for (const p of who) p.personality[trait[0]] = clamp01(p.personality[trait[0]] + trait[1]);
      return say(true, `${who.map((p) => p.name).join(" and ")} ${who.length === 1 ? "is" : "are"} changed: ${trait[1] > 0 ? "more" : "less"} ${trait[0]}.`);
    }
    if (v === "tell" || v === "say to") {
      const m = rest!.match(/^(\S+)\s+(.+)$/);
      if (!m) return say(false, "Tell whom what? For example: tell Adam well done.");
      const who = findPeople(world, m[1]!);
      if (!who.length) return say(false, `There is no one called ${m[1]}.`);
      for (const p of who) {
        p.mood = Math.max(-1, Math.min(1, p.mood + 0.15));
        p.needs.social = clamp01(p.needs.social - 0.1);
        p.journal.push({ t: clock, text: `The Creator said to me: "${m[2]}"` });
      }
      return say(true, `${who.map((p) => p.name).join(" and ")} heard you.`);
    }
    const who = findPeople(world, rest!);
    if (!who.length) return say(false, `There is no one called ${rest}.`);
    for (const p of who) {
      if (v === "heal") p.health = 1;
      else if (v === "feed") p.needs.hunger = 0;
      else if (v === "quench") p.needs.thirst = 0;
      else if (v === "bless") {
        p.health = 1;
        p.needs.hunger = Math.min(p.needs.hunger, 0.1);
        p.needs.thirst = Math.min(p.needs.thirst, 0.1);
        p.mood = 0.8;
        p.cold = 0;
      } else if (v === "hurt") p.health = clamp01(p.health - 0.3);
      else if (v === "wake") {
        if (p.intent?.kind === "sleep") p.intent = undefined;
        p.needs.energy = Math.min(p.needs.energy, 0.5);
      } else if (v === "rest") p.needs.energy = 0;
      else if (v === "warm") p.cold = 0;
      p.journal.push({ t: clock, text: v === "hurt" ? "Something hurt me, and I do not know what." : v === "heal" || v === "bless" ? "I was made well again." : "The Creator did something for me." });
    }
    return say(true, `${who.map((p) => p.name).join(" and ")}: ${v === "hurt" ? "hurt" : v === "heal" ? "healed" : v === "feed" ? "fed" : v === "quench" ? "quenched" : v === "bless" ? "blessed" : v === "wake" ? "woken" : v === "warm" ? "warmed" : "rested"}.`);
  }

  // A person: "a woman named Dinah", "new man", "a child called Seth".
  const person = lower.match(/^(?:a |an |the )?(?:new )?(man|woman|boy|girl|child|person)(?:\s+(?:named|called)\s+([a-z]+))?$/) ?? lower.match(/^new person\s+([a-z]+)$/);
  if (person) {
    const kind = person[1] === "person" || person[1] === undefined ? undefined : person[1];
    const sex: "m" | "f" = kind === "woman" || kind === "girl" ? "f" : kind === "man" || kind === "boy" ? "m" : rnd() < 0.5 ? "m" : "f";
    const young = kind === "boy" || kind === "girl" || kind === "child";
    world.built = (world.built ?? 0) + 1;
    const raw = (person[2] ?? (person[1] && !["man", "woman", "boy", "girl", "child", "person"].includes(person[1]) ? person[1] : "")) || "";
    const name = raw ? raw[0]!.toUpperCase() + raw.slice(1) : `${young ? "Child" : sex === "m" ? "Man" : "Woman"} ${world.built}`;
    if (world.people.some((q) => q.name.toLowerCase() === name.toLowerCase())) return say(false, `There is already someone called ${name}.`);
    if (world.people.length >= (world.maxPeople ?? 6)) return say(false, "The garden is full: there are as many people as it can feed.");
    const c = EDEN_PLACES.center!;
    const born = makePerson(`person-${world.built}`, c.x + (rnd() - 0.5) * 4, c.z + (rnd() - 0.5) * 4, Math.floor(rnd() * 1e9),
      { boldness: rnd(), sociability: rnd(), curiosity: rnd(), appetite: 0.3 + 0.5 * rnd(), patience: rnd() },
      { name, sex, age: young ? 1 : 22 });
    born.journal.push({ t: clock, text: "I woke in the garden. I do not know how I came here." });
    world.people.push(born);
    return say(true, `${name} appears in the garden${young ? ", a child" : ""}.`, { people: [born] });
  }

  // A thing to create, perhaps "by the river"
  const where = text.match(/^(.*?)\s+(?:by|at|near|in|on|beside)\s+(?:the\s+)?(.+)$/i);
  const wantedRaw = (where ? where[1]! : text).replace(/^((a|an|the|some)\s+)/i, "").trim();
  const place = where ? findPlace(where[2]!) : undefined;
  if (where && !place) return say(false, `There is no place like "${where[2]}". Try: ${Object.values(EDEN_PLACES).map((p) => p.name.replace("the ", "")).join(", ")}.`);
  const match = wantedRaw ? fuzzyRank(CREATABLE, wantedRaw, ([name]) => name)[0] : undefined;
  if (!match) {
    return say(false, `Nothing like "${input.trim()}" exists yet. Things: ${CREATABLE.map(([n]) => n).join(", ")}. Also: rain, clear, warm, cold snap, spring/summer/autumn/winter, heal/feed/bless/hurt <name>, move <name> to <place>, make <name> bolder, tell <name> <words>.`);
  }
  const [prefab, kind] = match;
  const around = place ?? EDEN_PLACES.center!;
  const x = around.x + (rnd() - 0.5) * 8;
  const z = around.z + (rnd() - 0.5) * 8;
  world.built = (world.built ?? 0) + 1;
  const stock = AFFORDANCES[kind]?.stock;
  const thing: Thing = { id: `created-${world.built}`, kind, x, z, radius: 2, stock, maxStock: stock, prefab };
  world.things.push(thing);
  return say(true, `A ${prefab.toLowerCase()} appears${place ? ` by ${EDEN_PLACES[place.id]?.name ?? "the place"}` : " in the garden"}.`, { made: [thing] });
}
