// Talking with the Walker, in the player's own typed words. The people answer from who they are and what they know: how they feel, where
// they have seen water or food or shelter, what they think of the others, what has happened to them. Nothing here is invented beyond
// that; the free voice (edenVoice.ts) may reword the answer, but this is what they mean. Pure, so the same words in the same world get the same answer.
import { bondOf, makePerson, aff, phrase, tally, chronicle, type Person, type Thing, type World } from "./mind";
import { converse } from "./speech";
import { hourOf } from "./earth";
import { BELIEF_WORDS, feel as feelEmotion } from "./inner";

export const TALK_RANGE = 6; // metres

/** The people close enough to talk to, nearest first. */
export function nearbyPeople(world: World, x: number, z: number, range = TALK_RANGE): Person[] {
  return world.people
    .map((p) => ({ p, d: Math.hypot(p.x - x, p.z - z) }))
    .filter((e) => e.d <= range)
    .sort((a, b) => a.d - b.d)
    .map((e) => e.p);
}

const dir = (dx: number, dz: number) => {
  // East is +x and south is +z.
  const ns = Math.abs(dz) > Math.abs(dx) * 0.4 ? (dz < 0 ? "north" : "south") : "";
  const ew = Math.abs(dx) > Math.abs(dz) * 0.4 ? (dx > 0 ? "east" : "west") : "";
  return `${ns}${ew}` || "close by";
};
const far = (d: number) => (d < 15 ? "just a few steps" : d < 50 ? "a short walk" : d < 120 ? "a good walk" : "a long way");

type Wants = { words: RegExp; label: string; test: (t: Thing) => boolean };
const WHERE: Wants[] = [
  { words: /\b(water|drink|river|stream|thirst)/, label: "water", test: (t) => !!aff(t).water },
  { words: /\b(food|eat|fruit|berr|hungry|meal|fish)/, label: "food", test: (t) => (aff(t).food ?? 0) > 0 || !!aff(t).fish },
  { words: /\b(shelter|sleep|rest|roof|tent|home)/, label: "shelter", test: (t) => !!aff(t).shelter || !!aff(t).rest },
  { words: /\b(fire|warm)/, label: "a fire", test: (t) => t.kind === "campfire" },
  { words: /\b(danger|wolf|wolves|safe)/, label: "danger", test: (t) => !!aff(t).danger },
  { words: /\b(wood|timber|fuel)/, label: "wood", test: (t) => !!aff(t).wood },
];

function feelingsOf(p: Person): string {
  const out: string[] = [];
  if (p.needs.thirst > 0.6) out.push("thirsty");
  if (p.needs.hunger > 0.6) out.push("hungry");
  if (p.needs.energy > 0.7) out.push("tired");
  if (p.cold > 0.45) out.push("cold");
  if (p.illness) out.push("unwell");
  if ((p.grief ?? 0) > 0.2) out.push("grieving");
  if (!out.length) out.push(p.mood > 0.4 ? "well, in good spirits" : p.mood < -0.3 ? "low, if I am honest" : "all right");
  return out.join(" and ");
}

const nameIn = (world: World, text: string, except: Person) => world.people.find((q) => q !== except && new RegExp(`\\b${q.name.toLowerCase()}\\b`).test(text));

/** What this person says back to the Walker's words. `walker` is the standing the Walker has with them (kept on the person). */
export interface Answer {
  reply: string;
  gaveFood?: boolean; // they handed the Walker some food (the page heals the Walker)
}

export function hearWalker(world: World, person: Person, said: string, rnd: () => number): Answer {
  let gaveFood = false;
  const text = said.toLowerCase().trim();
  const pick = <T,>(items: readonly T[]) => items[Math.min(items.length - 1, Math.floor(rnd() * items.length))]!;
  const warm = person.personality.sociability > 0.6;
  const trust = person.walkerTrust ?? 0;
  // Being talked to is company, and is remembered.
  person.needs.social = Math.max(0, person.needs.social - 0.1);
  feelEmotion(person, "joy", 0.06);
  person.walkerTrust = Math.min(1, trust + 0.04);
  tally(world, "walkerTalks");
  const keep = (reply: string): Answer => {
    (person.spoken ??= []).push(reply);
    if (person.spoken.length > 3) person.spoken.shift();
    return { reply, ...(gaveFood ? { gaveFood } : {}) };
  };
  // They stay and listen for a little while rather than walking off in the middle of it.
  if (person.intent?.kind !== "flee" && person.intent?.kind !== "sleep") person.intent = { kind: "linger", x: person.x, z: person.z, speed: 0, remaining: 25, arrived: true };
  const remember = (what: string) => {
    person.journal.push({ t: world.clock ?? 0, text: `The Walker and I spoke ${what}.`, w: 0.2 });
    if (person.journal.length > 400) person.journal.shift();
  };

  if (/^(hi|hello|hey|greetings|good (morning|day|evening)|well met)\b/.test(text)) {
    remember("and exchanged greetings");
    const h = hourOf(world.clock ?? 0);
    const when = h < 11 ? "Good morning" : h < 17 ? "Good day" : "Good evening";
    return keep(trust > 0.3 ? pick([`${when}, Walker. It is good to see you again.`, "Walker! I was hoping you would come by."]) : pick([`${when}, stranger.`, "Hello. We do not see many new faces.", warm ? "Hello! Come, sit with us." : "Hello."]));
  }
  if (/\b(your name|who are you|what are you called)/.test(text)) return keep(`I am ${person.name}.${person.role ? ` They call me the ${person.role}.` : ""}${person.story ? ` ${person.story}` : ""}`);
  if (/\b(how are you|how do you feel|are you (ok|well|alright)|feeling)/.test(text)) {
    remember("about how they were");
    return keep(`I am ${feelingsOf(person)}.${person.needs.hunger > 0.6 ? " Do you have any food?" : person.needs.social > 0.6 ? " It is good to have someone to talk to." : ""}`);
  }
  if (/\b(food|bread|meat|eat|spare|hungry)\b/.test(text) && /\b(have|give|share|spare|can i)\b/.test(text) && !/\bwhere\b/.test(text)) {
    remember("about food");
    if (person.carry.food >= 1 && (trust > 0.25 || warm)) {
      person.carry.food -= 1;
      gaveFood = true;
      tally(world, "gaveWalkerFood");
      return keep("I can spare a little. Take it, Walker.");
    }
    return keep(person.carry.food >= 1 ? "I have a little, but I do not know you well enough to give it away." : "I have nothing to spare. I am looking for food myself.");
  }
  for (const w of WHERE) {
    if (!/\bwhere\b|\bfind\b|\bis there\b|\bany\b|\bneed\b|\blook for\b/.test(text) || !w.words.test(text)) continue;
    const known = world.things
      .filter((t) => w.test(t) && person.memory.has(t.id))
      .map((t) => ({ t, d: Math.hypot(t.x - person.x, t.z - person.z) }))
      .sort((a, b) => a.d - b.d)[0];
    remember(`about where to find ${w.label}`);
    if (!known) return keep(`I do not know where there is ${w.label} here. I am sorry.`);
    return keep(`${phrase(known.t).replace(/^./, (c) => c.toUpperCase())} is ${dir(known.t.x - person.x, known.t.z - person.z)} of here, ${far(known.d)}.`);
  }
  const other = nameIn(world, text, person);
  if (other && /\b(think|opinion|feel|about|know|like|who)\b/.test(text)) {
    remember(`about ${other.name}`);
    const bond = bondOf(person, other);
    const tags = (person.beliefs?.[other.id] ?? []).map((b) => BELIEF_WORDS[b]);
    const rel = person.relations.get(other.id);
    const how = bond === "partner" ? "I love them" : bond === "friend" ? "They are a good friend" : bond === "rival" ? "We do not get on" : bond === "acquaintance" ? "I know them a little" : "I hardly know them";
    return keep(`${other.name}? ${how}${tags.length ? `. I think they are ${tags.join(" and ")}` : ""}.${rel && rel.affinity < -0.2 ? " Please do not repeat that." : ""}`);
  }
  if (/\b(story|what happened|news|tell me|anything new)/.test(text)) {
    const ex = converse(world, person, makePerson("walker", person.x, person.z, 1, {}, { name: "Walker" }), rnd);
    remember("and I told them what has been on my mind");
    return keep(ex.said);
  }
  if (/\b(want|plan|hope|goal|dream)/.test(text)) {
    const g = person.goals[0];
    if (g) {
      const words: Record<string, string> = { stockpile: "put enough food by for the winter", shelter: "build us a proper shelter", befriend: "get to know the others better", explore: "see all of this land", settle: "make a home I love", farm: "grow our own food" };
      return keep(`I want to ${words[g.kind]}.`);
    }
    return keep("Just to get through the day, and be glad of it.");
  }
  if (/\b(help|can i do|need anything|what do you need)\b/.test(text)) {
    remember("about what they needed");
    if (person.needs.hunger > 0.6) return keep("Food. I am hungry. Anything you can bring down or find would be kind.");
    if (person.needs.thirst > 0.6) return keep("Water. I have not drunk in a long time.");
    if (person.cold > 0.45) return keep("Wood for the fire. I am cold.");
    if (person.goals[0]?.kind === "stockpile") return keep("Food laid by for winter. Game, fruit, fish, anything that keeps.");
    return keep(pick(["We are all right for now. But thank you for asking.", "Nothing today. It is kind of you to ask."]));
  }
  if (/\b(thank|thanks|bless)/.test(text)) return keep(pick(["You are welcome.", "It was nothing.", "We look after each other here."]));
  if (/\b(sorry|forgive)/.test(text)) return keep(pick(["There is nothing to forgive.", "It is forgotten."]));
  if (/\b(bye|farewell|goodbye|see you|go now|leave)/.test(text)) {
    person.intent = undefined;
    return keep(pick(["Go well, Walker.", "Come back and see us.", "Take care out there."]));
  }
  if (/\b(you are|you're)\b.*\b(kind|good|brave|wise|strong)/.test(text)) {
    feelEmotion(person, "pride", 0.2);
    return keep(pick(["That is kind of you to say.", "I do what I can."]));
  }
  // Anything else: they say what is on their mind.
  const ex = converse(world, person, makePerson("walker", person.x, person.z, 1, {}, { name: "Walker" }), rnd);
  return keep(ex.said);
}

/** A line for the chronicle the first time someone speaks to a person. */
export function noteFirstWord(world: World, person: Person) {
  if ((person.walkerTrust ?? 0) > 0.05) return;
  chronicle(world, `The Walker spoke with ${person.name}.`);
}
