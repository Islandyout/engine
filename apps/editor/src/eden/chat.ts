// Talking with the Walker, in the player's own typed words. The people answer from who they are and what they know: how they feel, where
// they have seen water or food or shelter, what they think of the others, what has happened to them. Nothing here is invented beyond
// that; the free voice (edenVoice.ts) may reword the answer, but this is what they mean. Pure, so the same words in the same world get the same answer.
import { bondOf, makePerson, aff, phrase, startErrand, tally, chronicle, type AskItem, type Person, type Thing, type World } from "./mind";
import { converse } from "./speech";
import { DISCOVERIES, QUESTIONS, knows } from "./culture";
import { recall } from "./psyche";
import { everyone, kinName } from "./lifecycle";
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
  errand?: AskItem; // they have gone to fetch it
  fallback?: boolean; // the words were not understood, so what came back is only what is on their mind (the voice may do better)
}

export function answerWalker(world: World, person: Person, said: string, rnd: () => number): Answer {
  let gaveFood = false;
  let errand: AskItem | undefined;
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
    return { reply, ...(gaveFood ? { gaveFood } : {}), ...(errand ? { errand } : {}) };
  };
  // They stay and listen for a little while rather than walking off in the middle of it.
  if (person.intent?.kind !== "flee" && person.intent?.kind !== "sleep") person.intent = { kind: "linger", x: person.x, z: person.z, speed: 0, remaining: 25, arrived: true };
  const remember = (what: string) => {
    person.journal.push({ t: world.clock ?? 0, text: `The Walker and I spoke ${what}.`, w: 0.2 });
    if (person.journal.length > 400) person.journal.shift();
  };

  // Their people.
  if (/\b(mother|mum|mom|father|dad|husband|wife|partner|spouse|children|kids|child|son|daughter|brother|sister|family|parents|married|clan)\b/.test(text)) {
    remember("about their family");
    const kin = everyone(world).filter((q) => q.id !== person.id && kinName(world, person, q));
    const alive = (q: Person) => world.people.some((x) => x.id === q.id);
    const mine = kin.map((q) => `${q.name}, my ${kinName(world, person, q)}${alive(q) ? "" : " (gone now)"}`);
    const partner = world.people.find((q) => q.id === person.life?.partner);
    if (/\b(husband|wife|partner|spouse|married)\b/.test(text)) {
      if (partner) return keep(`${partner.name} is my ${person.sex === "f" ? "husband" : "wife"}. We have been together since ${Math.floor((((world.clock ?? 0) - (person.life?.since ?? 0)) / 1440) * 10) / 10} days ago.`);
      if (person.life?.widowed) return keep("I lost them. I do not speak of it easily.");
      if (person.life?.courting) return keep("There is someone. I am courting them, and I will say no more.");
      return keep(pick(["I am alone. I may not stay so.", "No one, not yet."]));
    }
    if (!mine.length) return keep(pick(["I have no family I know of.", "I am on my own in the world."]));
    return keep(`My people: ${mine.slice(0, 6).join("; ")}.${person.life?.clan ? ` We are ${person.life.clan}.` : ""}`);
  }
  // What they remember: asked about a person or a thing, what comes back is what they actually kept, coloured by how they feel now.
  const remembered = text.match(/\b(?:remember|recall|remind me of)\s+(?:when\s+|about\s+|the\s+)?([a-z]{3,})/);
  if (remembered) {
    remember("about what they remember");
    const cue = remembered[1]!;
    const name = world.people.find((q) => q.name.toLowerCase() === cue)?.name ?? world.dead?.find((d) => d.person.name.toLowerCase() === cue)?.person.name;
    const found = recall(person, world, name ? { who: name } : { word: cue }, 1)[0];
    if (!found) return keep(pick([`I do not remember anything about ${cue}. It has faded.`, `${cue}? It comes to nothing. Perhaps I never knew, or it was too long ago.`]));
    const how = found.shade === "darkly" ? "It comes back heavy, today: " : found.shade === "fondly" ? "Yes, and gladly: " : "Yes: ";
    return keep(`${how}${found.text.replace(/\.$/, "")}.`);
  }
  // What they have in mind.
  if (/\b(plan|planning|what are you doing|what.?s next|what will you do|why are you)\b/.test(text)) {
    remember("about what they had in mind");
    const plan = person.plan;
    if (!plan) return keep(pick(["Nothing special. I am taking the day as it comes.", "No plan at the moment. Do you have something in mind?"]));
    return keep(`${plan.why} So: ${plan.steps.map((s) => s.label).join(", then ")}.`);
  }
  // What they believe, know and have made.
  if (/\b(believe|belief|faith|religion|pray|afterlife|creator|why do we die|where do the dead go)\b/.test(text)) {
    remember("about what they believe");
    const held = QUESTIONS.map((q) => ({ q, t: world.tenets?.find((x) => x.id === person.faith?.[q.id]) })).filter((x) => x.t);
    if (!held.length) return keep(pick(["I have not settled on an answer. I think about it at night.", "I do not know what I believe yet. Do you?"]));
    const one = pick(held);
    return keep(`You ask "${one.q.asked}" Here is what I think: ${one.t!.text}`);
  }
  if (/\b(what do you know|teach me|what have you learned|discover|invent|read|book)\b/.test(text)) {
    remember("about what they know");
    const ideas = (person.ideas ?? []).filter((i) => !i.startsWith("read:")).map((i) => DISCOVERIES.find((d) => d.id === i)?.name ?? i);
    if (!ideas.length) return keep(pick(["Nothing that has a name yet. I am still working things out.", "I know the garden, and little else. Perhaps you know more."]));
    return keep(`I know about ${ideas.join(", ")}.${knows(world, "writing") ? " It is written down in the library, if you wish to read it." : ""}`);
  }
  if (/\b(sing|song|story|tale|paint|painting|art)\b/.test(text)) {
    remember("about what they have made");
    const mine = (world.works ?? []).filter((w) => w.by === person.id);
    const best = [...mine].sort((a, b) => b.quality - a.quality)[0];
    if (!best) return keep(pick(["I have made nothing worth showing yet.", "I would like to make something one day."]));
    return keep(`The best thing I made is "${best.title}", a ${best.kind}.`);
  }
  if (/\b(follow me|come with me|come along|walk with me|come on)\b/.test(text)) {
    remember("and they went along with me");
    if (trust > 0.15 || warm) {
      person.followUntil = (world.clock ?? 0) + 600;
      tally(world, "followedWalker");
      return keep(pick(["All right. I will come with you.", "Lead on, Walker.", "I will walk with you a while."]));
    }
    return keep(pick(["I would rather stay here for now. I do not know you well enough yet.", "Not yet. Come and talk to me again."]));
  }
  if (/\b(stay|wait here|stop following|go home|go back|you can go)\b/.test(text)) {
    person.followUntil = undefined;
    return keep(pick(["I will wait here.", "As you say. I will go about my day."]));
  }
  if (/^(hi|hello|hey|greetings|good (morning|day|evening)|well met)\b/.test(text)) {
    remember("and exchanged greetings");
    const h = hourOf(world.clock ?? 0);
    const when = h < 11 ? "Good morning" : h < 17 ? "Good day" : "Good evening";
    const you = person.walkerFacts?.name ?? "Walker";
    return keep(trust > 0.3 ? pick([`${when}, ${you}. It is good to see you again.`, `${you}! I was hoping you would come by.`]) : pick([`${when}, stranger.`, "Hello. We do not see many new faces.", warm ? "Hello! Come, sit with us." : "Hello."]));
  }
  if (/\b(your name|who are you|what are you called)/.test(text)) return keep(`I am ${person.name}.${person.role ? ` They call me the ${person.role}.` : ""}${person.story ? ` ${person.story}` : ""}`);
  if (/\b(how are you|how do you feel|are you (ok|well|alright)|feeling)/.test(text)) {
    remember("about how they were");
    return keep(`I am ${feelingsOf(person)}.${person.needs.hunger > 0.6 ? " Do you have any food?" : person.needs.social > 0.6 ? " It is good to have someone to talk to." : ""}`);
  }
  // "Bring me water": an errand, if they are willing and know where to get it.
  {
    const m = /\b(bring|fetch|get|go and get|go get|carry)\b[^.?!]*\b(water|drink|food|fruit|berries|something to eat|wood|firewood|sticks)\b/.exec(text);
    if (m) {
      const word = m[2]!;
      const kind: AskItem = /water|drink/.test(word) ? "water" : /wood|sticks/.test(word) ? "wood" : "food";
      const started = startErrand(world, person, kind);
      remember(`and asked them to bring ${kind}`);
      if (!started.ok) return keep(started.why ?? "I cannot just now.");
      errand = kind;
      return keep(pick(["Of course. Wait here, I will not be long.", "I will fetch it. Stay where you are.", "Give me a moment. I know where to go."]));
    }
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
    if (person.asks) return keep(`I asked you for ${person.asks.item}. If you can bring it, I would be grateful.`);
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
  const ex = converse(world, person, makePerson("walker", person.x, person.z, 1, {}, { name: person.walkerFacts?.name ?? "Walker" }), rnd);
  const last = keep(ex.said);
  return { ...last, fallback: true };
}

/** A line for the chronicle the first time someone speaks to a person. */
export function noteFirstWord(world: World, person: Person) {
  if ((person.walkerTrust ?? 0) > 0.05) return;
  chronicle(world, `The Walker spoke with ${person.name}.`);
}

// ---- Remembering what the Walker says, and asking back ----

const clean = (t: string) => t.replace(/[.!?,;]+$/g, "").trim();
const NAME_WORDS = /^(a|an|the|not|just|very|so|too|here|fine|well|good|tired|hungry|cold|ok|okay|yes|no|nothing|sure)$/i;

/** What the Walker says about themselves is taken in; what they were asked is answered; and now and then they are asked something in turn. */
export function hearWalker(world: World, person: Person, said: string, rnd: () => number): Answer {
  const text = said.trim();
  const lower = text.toLowerCase();
  const facts = (person.walkerFacts ??= {});
  let acknowledged: string | undefined;
  // An answer to what they asked.
  // (What is asked or commanded is not an answer to their question, and they let the question drop.)
  const notAnAnswer = /\?|^(where|what|who|how|why|can|could|do|does|bring|fetch|get|follow|stay|tell|give|go|come|hello|hi|hey|thanks|thank|bye)\b/i.test(text) && !/^(i'm|i am)\b/i.test(text);
  const selfStatement = /(my name is|call me|i am called|i come from|i came from|i am from|i (really )?(like|love|enjoy|adore))/i.test(text);
  if (person.pendingQ && (notAnAnswer || (selfStatement && person.pendingQ !== "name" && person.pendingQ !== "from"))) person.pendingQ = undefined;
  if (person.pendingQ) {
    const q = person.pendingQ;
    person.pendingQ = undefined;
    if (q === "name") {
      const m = /(?:my name is|i am|i'm|call me|name's|it's|it is)\s+([A-Za-z][A-Za-z'-]{1,20})/i.exec(text) ?? /^([A-Za-z][A-Za-z'-]{1,20})[.!]?$/.exec(text);
      if (m && !NAME_WORDS.test(m[1]!)) {
        facts.name = m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1);
        acknowledged = `Well met, ${facts.name}. I will remember it.`;
      }
    } else if (q === "from") {
      facts.from = clean(text.replace(/^(i (come|came|am) from|from)\s+/i, ""));
      acknowledged = `${facts.from.charAt(0).toUpperCase()}${facts.from.slice(1)}. I have not been there. It must be a long way.`;
    } else if (q === "how") {
      facts.mood = clean(text);
      acknowledged = /tired|weary|exhaust/.test(lower) ? "Then rest a while. There is room by the fire." : /hungry|starv/.test(lower) ? "Then you should eat. Take what you need from the grove." : /cold|freez/.test(lower) ? "Come to the fire, then." : /(good|well|fine|great|happy)/.test(lower) ? "I am glad to hear it." : "I hope the day mends it.";
    } else if (q === "why") {
      facts.role = clean(text);
      acknowledged = "I see. Then we are glad you walk here.";
    }
  }
  // Something they say about themselves, unasked.
  if (!acknowledged) {
    let m: RegExpExecArray | null;
    if ((m = /(?:my name is|call me|i am called|name's)\s+([A-Za-z][A-Za-z'-]{1,20})/i.exec(text)) && !NAME_WORDS.test(m[1]!)) {
      facts.name = m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1);
      acknowledged = `Well met, ${facts.name}.`;
    } else if ((m = /i (?:come|came|am) from\s+(.+)/i.exec(text))) {
      facts.from = clean(m[1]!);
      acknowledged = `${facts.from.charAt(0).toUpperCase()}${facts.from.slice(1)}? I have never heard of it. Tell me about it some time.`;
    } else if ((m = /i (?:really )?(like|love|enjoy|adore)\s+(.+)/i.exec(text))) {
      (facts.likes ??= []).push(clean(m[2]!));
      if (facts.likes.length > 6) facts.likes.shift();
      acknowledged = `You ${m[1]!.toLowerCase()} ${clean(m[2]!)}? ${person.personality.curiosity > 0.5 ? "I would like to see that." : "I can understand that."}`;
    } else if (/\b(do you remember|what did i (?:say|tell)|who am i|what is my name|what's my name|do you know me)\b/.test(lower)) {
      const bits: string[] = [];
      if (facts.name) bits.push(`you are called ${facts.name}`);
      if (facts.from) bits.push(`you come from ${facts.from}`);
      if (facts.likes?.length) bits.push(`you like ${facts.likes.join(" and ")}`);
      if (facts.role) bits.push(`you said: ${facts.role}`);
      acknowledged = bits.length ? `I remember: ${bits.join("; ")}.` : (person.walkerTrust ?? 0) > 0.2 ? "You are the Walker. We have talked, but you have not told me much about yourself." : "I know only that you are the Walker.";
    }
  }
  const answer = acknowledged ? { reply: acknowledged } as Answer : answerWalker(world, person, said, rnd);
  if (acknowledged) {
    // The same bookkeeping as any talk: company, a little trust, kept in the journal.
    person.needs.social = Math.max(0, person.needs.social - 0.1);
    person.walkerTrust = Math.min(1, (person.walkerTrust ?? 0) + 0.04);
    person.journal.push({ t: world.clock ?? 0, text: `The Walker told me about themselves: "${clean(text).slice(0, 80)}".`, w: 0.25 });
    if (person.intent?.kind !== "flee" && person.intent?.kind !== "sleep") person.intent = { kind: "linger", x: person.x, z: person.z, speed: 0, remaining: 25, arrived: true };
  }
  // Now and then they ask something back: who they are talking to, where from, how they are.
  const asked = (facts.asked ??= []);
  const turns = asked.length;
  if (!person.pendingQ && !answer.errand && turns < 6 && rnd() < 0.35 + 0.3 * person.personality.curiosity + 0.2 * person.personality.sociability) {
    const next = !facts.name && !asked.includes("name") ? "name" : !facts.from && !asked.includes("from") && (person.walkerTrust ?? 0) > 0.1 ? "from" : !asked.includes("how") ? "how" : !asked.includes("why") && (person.walkerTrust ?? 0) > 0.2 ? "why" : undefined;
    if (next) {
      asked.push(next);
      person.pendingQ = next;
      const question = next === "name" ? "What shall I call you?" : next === "from" ? "Where do you come from, Walker?" : next === "how" ? `And you${facts.name ? `, ${facts.name}` : ""}, how are you today?` : "What brings you walking alone out here?";
      answer.reply = `${answer.reply} ${question}`;
    }
  }
  return answer;
}
