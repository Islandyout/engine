// What Eden's people say. Plain code, no model: a person looks at their own state (what they need, what has happened to them, the weather and the
// season, what they have set out to do, who they are with, what lives nearby) and says something about what weighs most, in words that fit how
// they are (a sociable person is warmer, a bold one plainer, a timid one more careful). The other answers in kind. The same two people in the
// same moment say the same thing, so it can be tested.
//
// An optional free voice (voice.ts: Ollama on this laptop, or any free OpenAI-compatible endpoint) can reword these lines in the host; this file is
// what always works, with nothing installed and nothing online.
import { hourOf, phrase, bondOf, type Person, type World } from "./mind";
import { SEASON_NAMES } from "./earth";
import { BELIEF_WORDS, type Belief } from "./inner";

export type Topic = "need" | "event" | "weather" | "goal" | "bond" | "creature" | "child" | "thanks" | "sorry" | "gossip" | "story" | "joke" | "plain";

export interface Exchange {
  topic: Topic;
  said: string; // what the speaker says
  reply: string; // what the other answers
  tale?: string; // a story told: the journal line it is from
  about?: string; // gossip: the person (id) being talked about
  tag?: Belief; // and what is said of them
}

type Pick = <T>(items: readonly T[]) => T;

const first = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// A journal line, said aloud: the natural way to tell someone what has happened.
function tellEvent(text: string, pick: Pick, other: Person): string | undefined {
  let m: RegExpMatchArray | null;
  if ((m = text.match(/^Ate at (.+)\.$/))) return pick([`I ate at ${m[1]} earlier. It was good.`, `Have you eaten? I had a good meal at ${m[1]}.`]);
  if (/^Built a shelter/.test(text)) return pick(["We have a roof now. Come and see.", "I finished the shelter. It is dry in there."]);
  if (/^Lit a fire|^Fed the fire/.test(text)) return pick(["The fire is lit. Come and warm yourself.", "I have the fire going. It is warm by it."]);
  if ((m = text.match(/^Killed (.+)\. Meat for days\.$/))) return `I brought down ${m[1]}. We will eat well.`;
  if (/^Planted a seed/.test(text)) return pick(["I planted a seed. We will see if it grows.", "Something is going into the ground that I hope will feed us."]);
  if (/^Made a spear/.test(text)) return "I made a spear. Now we can hunt.";
  if ((m = text.match(/^Came upon (.+)\.$/))) return pick([`Have you seen ${m[1]}? I came upon it today.`, `I found ${m[1]}. We should go together.`]);
  if (/gave me food/.test(text)) return `Thank you for the food, ${other.name}. I was starving.`;
  if (/stayed with me/.test(text)) return `Thank you for staying with me, ${other.name}.`;
  if ((m = text.match(/^Lost my temper with (.+)\.$/))) return `I lost my temper with ${m[1]} and I am ashamed of it.`;
  if (/^Needed to be alone/.test(text)) return "I needed to be alone for a while. It was a hard day.";
  if (/^Quarrelled with|^Made things right/.test(text)) return undefined;
  if (/^Ran from/.test(text)) return text.replace(/^Ran from/, "I ran from").replace(/\.$/, ". I was frightened.");
  if (/^Caught a fish/.test(text)) return pick(["I caught a fish at the river. There are plenty if you are patient.", "The river gave me a fish today."]);
  if ((m = text.match(/^Sat by (.+)'s grave\.$/))) return `I sat with ${m[1]} a while. I still miss them.`;
  if (/^Washed at the water/.test(text)) return "I washed at the river. It is good to be clean.";
  if ((m = text.match(/^Gave (.+) a remedy of herbs\.$/))) return `I gave ${m[1]} a remedy of herbs. I hope it helps.`;
  if ((m = text.match(/^Told (.+) about (.+)\.$/))) return `I told ${m[1]} about ${m[2]}.`;
  if ((m = text.match(/^(.+) told me about (.+)\.$/))) return `${m[1]} told me about ${m[2]}. I should go and see.`;
  if (/^Sewed a cloak/.test(text)) return pick(["I sewed myself a cloak from the hide. It is warm.", "There is a use for everything we kill. I have a cloak now."]);
  if ((m = text.match(/^I named the (.+): (.+)\.$/))) return `I have been calling the ${m[1]} ${m[2]}. It seemed to fit.`;
  if ((m = text.match(/^(.+) told me the place is called (.+)\.$/))) return `${m[1]} says it is called ${m[2]}. I like that.`;
  if ((m = text.match(/^A custom has formed among us: (.+)\.$/))) return `We have a custom now: ${m[1]}.`;
  if ((m = text.match(/^I have become known as the (.+)\.$/))) return `They are starting to call me the ${m[1]}. I like that.`;
  if ((m = text.match(/^(.+) showed me how to do better at (.+)\.$/))) return `${m[1]} showed me something about ${m[2]}. It helped.`;
  if ((m = text.match(/^I have learned: (.+)$/))) return `I have learned something: ${m[1]!.charAt(0).toLowerCase()}${m[1]!.slice(1)}`;
  if (/^Put .* by in the shelter/.test(text)) return "I have been putting food by for the winter.";
  if (/^I did it/.test(text)) return text.replace(/^I did it: I wanted to /, "I did what I set out to do: I ").replace(/\.$/, ".");
  return undefined;
}

export function converse(world: World, speaker: Person, other: Person, rnd: () => number): Exchange {
  const pick: Pick = (items) => items[Math.min(items.length - 1, Math.floor(rnd() * items.length))]!;
  const p = speaker.personality;
  const warm = p.sociability > 0.6;
  const blunt = p.boldness > 0.65;
  const careful = p.boldness < 0.35;
  const n = speaker.needs;
  const weather = world.weather;
  const bond = bondOf(speaker, other);
  const rel = speaker.relations.get(other.id);
  const addr = rnd() < 0.4 ? `${other.name}, ` : "";
  const candidates: { weight: number; topic: Topic; said: string; reply: string; about?: string; tag?: Belief; tale?: string }[] = [];
  const add = (weight: number, topic: Topic, said: string, reply: string, about?: string, tag?: Belief, tale?: string) => candidates.push({ weight, topic, said, reply, about, tag, tale });

  // What they need
  const carrying = other.carry.food >= 1;
  if (n.thirst > 0.6) add(1.4 * n.thirst, "need", pick([`${addr}I am parched. I need to get to the river.`, "My mouth is dry. I must drink soon."]), pick(["Go and drink. I will wait.", "The river is not far. Go on."]));
  if (n.hunger > 0.6) {
    add(1.5 * n.hunger, "need", pick([`${addr}I am so hungry.`, "My stomach is empty. I could eat anything.", warm ? "I haven't eaten since morning. Do you have anything?" : "I need to eat."]),
      carrying ? pick([`Here, ${speaker.name}. Take some of mine.`, "I have a little. Eat."]) : pick(["Let's find something together.", "The grove is the best place. I will come with you."]));
  }
  if (speaker.cold > 0.45) add(1.5 * speaker.cold, "need", pick([`${addr}I am freezing.`, "It is cold. Is there a fire?", careful ? "I do not like this cold. I think we should light a fire." : "We need a fire."]), pick(["Come close. I will get more wood.", "Stand by me. We will warm up."]));
  if (n.energy > 0.7) add(1.1 * n.energy, "need", pick([`${addr}I can hardly keep my eyes open.`, "I am so tired. I think I will rest."]), pick(["Then rest. I will keep watch.", "Sleep well."]));
  if (n.social > 0.7) add(0.9, "need", pick(["It is good to talk. I was feeling alone.", "I am glad you are here. It was quiet."]), pick(["I am glad of you too.", "Then let's stay a while."]));

  // What has happened to them
  // The thing worth telling is the one that mattered most and is not too long ago, not just the last thing that happened.
  let bestEntry: { said: string; score: number } | undefined;
  for (const entry of speaker.journal.slice(-80)) {
    const said = tellEvent(entry.text, pick, other);
    if (!said) continue;
    const score = (entry.w ?? 0.12) * Math.exp(-((world.clock ?? 0) - entry.t) / 2880);
    if (!bestEntry || score > bestEntry.score) bestEntry = { said, score };
  }
  if (bestEntry) add(Math.max(0.2, 0.4 + 1.6 * bestEntry.score), "event", bestEntry.said, pick(["That is good to hear.", careful ? "Be careful, though." : "Well done.", p.curiosity > 0.6 ? "Tell me more." : "I am glad."]));

  // The weather and the season
  if (weather) {
    const season = SEASON_NAMES[weather.season];
    if (weather.raining) add(0.5, "weather", pick(["It is raining again.", "Listen to the rain on the leaves."]), pick(["It will feed the plants.", "Let's stay dry."]));
    if (weather.season === 2) add(0.9, "weather", pick(["Autumn is here. We should put food by before winter.", `The days are getting shorter. We ought to prepare, ${other.name}.`]), pick(["You are right. I will gather what I can.", "Let's go to the grove together."]));
    else if (weather.season === 3) add(0.7, "weather", pick(["Winter is hard. Let's keep the fire fed.", "How long will the cold last?"]), pick(["Until spring. We will manage.", "We have food laid by. We will be all right."]));
    else if (weather.season === 0) add(0.5, "weather", pick(["Spring. Things are growing again.", "I can feel the year turning."]), "It is a good time to plant.");
    else add(0.4, "weather", pick([`The ${season} sun is warm.`, "It is a fine day."]), pick(["It is.", "A good day to be alive."]));
    const hour = hourOf(world.clock ?? 0);
    if (hour >= 20 || hour < 5) add(0.4, "weather", pick(["It is dark. Stay close.", "Look at the stars."]), "I will not go far.");
  }

  // What they have set out to do
  for (const g of speaker.goals) {
    const words: Record<string, string> = { stockpile: "put enough food by for the winter", shelter: "build us a proper shelter", befriend: `know ${world.people.find((q) => q.id === g.target)?.name ?? "everyone"} better`, explore: "see all of this garden", settle: "make a home I love", farm: "grow our own food" };
    add(0.8, "goal", pick([`I want to ${words[g.kind]}.`, `I have been thinking: I want to ${words[g.kind]}.`]), pick(["I will help.", p.curiosity > 0.6 ? "That is a good idea. How?" : "If you think it is right."]));
    break;
  }

  // Each other
  if (bond === "partner") add(0.9, "bond", pick([`I am glad it is you I share this with, ${other.name}.`, "I do not think I could do this without you."]), pick(["Nor I without you.", "I feel the same."]));
  else if (bond === "friend") add(0.6, "bond", pick(["It is good to have a friend.", `I enjoy your company, ${other.name}.`]), pick(["And I yours.", "Friends, then."]));
  else if (bond === "rival") add(0.8, "bond", blunt ? "I still have not forgotten what you did." : "I wish things were easier between us.", "Neither have I.");
  else if (bond === "stranger" || bond === "acquaintance") add(0.5, "bond", warm ? `I am ${speaker.name}. I would like to know you.` : `We hardly know each other, ${other.name}.`, pick(["Then let's talk.", "I would like that."]));
  if (rel && rel.lastQuarrel !== undefined && (world.clock ?? 0) - rel.lastQuarrel < 3 * 1440) add(1.6, "sorry", pick(["I am sorry about before. I did not mean it.", `I was wrong to say that, ${other.name}.`]), pick(["It is forgotten. Let's go on.", "I was no better. Let it go."]));
  else if (rel && rel.affinity < -0.1 && rel.familiarity > 0.3) add(0.7, "sorry", "I am sorry about before. I did not mean it.", "It is forgotten. Let's go on.");

  // What they think of someone else
  for (const [id, tags] of Object.entries(speaker.beliefs ?? {})) {
    const third = world.people.find((q) => q.id === id && q !== other && q !== speaker);
    const tag = tags[tags.length - 1];
    if (!third || !tag) continue;
    add(0.7, "gossip", tag === "quarrelsome" ? `Be careful with ${third.name}. I have found them ${BELIEF_WORDS[tag]}.` : `${third.name} has been ${BELIEF_WORDS[tag]} to me. I would trust them.`, pick(["I have seen that too.", "I had not thought so. I will watch."]), id, tag);
    break;
  }

  // A story: something that mattered a long time ago, told to someone who has not heard it. Elders tell them most.
  {
    const heard = new Set(other.heard ?? []);
    let best: { text: string; score: number } | undefined;
    for (const entry of speaker.journal) {
      if ((entry.w ?? 0.12) < 0.6 || (world.clock ?? 0) - entry.t < 1440 || heard.has(entry.text)) continue;
      if (/^Talked with| said: /.test(entry.text)) continue;
      const score = (entry.w ?? 0.12) * (1 + speaker.age / 60);
      if (!best || score > best.score) best = { text: entry.text, score };
    }
    if (best) add(0.5 + 0.8 * Math.min(1, speaker.age / 50) + 0.4 * p.sociability, "story", `Let me tell you about the time: ${best.text.charAt(0).toLowerCase()}${best.text.slice(1)}`, pick(["I will remember that.", "Tell me more.", "I had not heard that."]), undefined, undefined, best.text);
  }

  // Something to make the other laugh: a friendly person in a good mood, to someone who is not an enemy, about what is around them.
  if (speaker.mood > 0.05 && bond !== "rival" && n.hunger < 0.8 && n.thirst < 0.8 && speaker.cold < 0.5 && (speaker.grief ?? 0) < 0.2) {
    const funny: string[] = [];
    const seen = world.things.find((t) => (t.kind === "deer" || t.kind === "fox" || t.kind === "alpaca" || t.kind === "dog" || t.kind === "horse") && speaker.memory.has(t.id));
    if (seen) funny.push(`That ${seen.kind} looked at me as if I owed it something.`, `I think the ${seen.kind} is following me. I have not decided if I am flattered.`);
    if (weather?.raining) funny.push("I told the rain I had no need of a wash. It did not listen.");
    if (n.hunger > 0.4) funny.push("I looked at a stone just now and thought: soup.");
    if (speaker.age > 40) funny.push("When I was young I could outrun a deer. Or so I tell everyone.");
    funny.push("I tried to be quiet this morning. The whole forest complained.", "I walked into a tree. In my defence, it moved.", `${other.name}, you have a face that makes the day lighter.`);
    add(0.5 + 0.9 * p.sociability + (bond === "friend" || bond === "partner" ? 0.5 : 0), "joke", pick(funny), pick(["Ha! That is true.", "You always make me laugh.", "I needed that.", "Stop, my sides hurt."]));
  }

  // What lives nearby
  const creature = world.things.find((t) => (t.kind === "deer" || t.kind === "alpaca") && speaker.memory.has(t.id));
  if (creature) add(0.35, "creature", `I saw ${phrase(creature)} near here. It watched me for a while.`, pick(["They are gentle.", "Perhaps we could find it again."]));
  const child = world.people.find((q) => (q.mother === speaker.id || q.father === speaker.id) && q.age < 4);
  if (child) add(0.8, "child", pick([`${child.name} is growing fast.`, `${child.name} laughed today. Did you hear?`]), pick(["Every day is different with them.", "We must look after them."]));

  // A loss that still weighs
  const grief = speaker.grief ?? 0;
  if (grief > 0.2) add(1.6 * grief, "need", pick([`${addr}I cannot stop thinking about them.`, "It is quiet without them."]), pick(["I know. I am here.", "Take your time. You do not have to be alone."]));

  // The thanks that are due
  const lastGift = speaker.journal.slice(-30).reverse().find((j) => /gave me food|stayed with me/.test(j.text));
  if (lastGift && (world.clock ?? 0) - lastGift.t < 1500) add(1.0, "thanks", `Thank you, ${other.name}, for what you did for me.`, "It was nothing. You would have done the same.");

  if (!candidates.length) return { topic: "plain", said: first(pick(["Hello.", "It is a quiet day.", "How are you?"])), reply: pick(["Well enough.", "Quiet, yes.", "And you?"]) };
  const total = candidates.reduce((a, c) => a + c.weight, 0);
  let r = rnd() * total;
  let chosen = candidates[candidates.length - 1]!;
  for (const c of candidates) {
    r -= c.weight;
    if (r <= 0) {
      chosen = c;
      break;
    }
  }
  return { topic: chosen.topic, said: first(chosen.said), reply: first(chosen.reply), about: chosen.about, tag: chosen.tag, tale: chosen.tale };
}
