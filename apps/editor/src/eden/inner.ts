// A person's inner life, beyond needs: named emotions that rise from what happens to them and fade at their own speeds, a mood that falls
// faster than it rises and, held low long enough, breaks (an outburst, or a need to be alone), and what they have come to believe about
// the people around them from what those people have done. Plain code like the rest of the mind, so every life can be replayed from its seed.
import type { Person } from "./mind";

export type Emotion =
  | "joy" | "fear" | "anger" | "gratitude" | "pride" | "shame"
  | "love" | "loneliness" | "jealousy" | "envy" | "guilt" | "disgust" | "contempt" | "hope" | "despair" | "awe" | "surprise"
  | "nostalgia" | "longing" | "boredom" | "regret" | "relief" | "humour" | "empathy";
export const EMOTIONS: readonly Emotion[] = [
  "joy", "fear", "anger", "gratitude", "pride", "shame",
  "love", "loneliness", "jealousy", "envy", "guilt", "disgust", "contempt", "hope", "despair", "awe", "surprise",
  "nostalgia", "longing", "boredom", "regret", "relief", "humour", "empathy",
];

// Sim seconds for an emotion to halve (a day is 1440): fright passes in minutes, gratitude and pride last about a day.
const HALF_LIFE: Record<Emotion, number> = {
  joy: 400, fear: 90, anger: 300, gratitude: 900, pride: 700, shame: 700,
  love: 3000, loneliness: 1200, jealousy: 900, envy: 900, guilt: 2000, disgust: 150, contempt: 1500, hope: 1000, despair: 1500, awe: 300, surprise: 25,
  nostalgia: 1500, longing: 1800, boredom: 500, regret: 1500, relief: 120, humour: 120, empathy: 300,
};
// How hard each pulls the mood target, negative feelings counting for more than positive ones as they do in people.
const WEIGHT: Record<Emotion, number> = {
  joy: 0.5, gratitude: 0.4, pride: 0.35, fear: -0.8, anger: -0.7, shame: -0.55,
  love: 0.45, loneliness: -0.6, jealousy: -0.6, envy: -0.35, guilt: -0.5, disgust: -0.3, contempt: -0.1, hope: 0.35, despair: -0.9, awe: 0.4, surprise: 0,
  nostalgia: -0.1, longing: -0.3, boredom: -0.25, regret: -0.35, relief: 0.4, humour: 0.5, empathy: -0.1,
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// Someone bold is less frightened, someone patient slower to anger.
export function feel(person: Person, emotion: Emotion, amount: number) {
  const p = person.personality;
  const scale = emotion === "fear" ? 1.3 - p.boldness : emotion === "anger" ? 1.3 - 0.6 * p.patience : 1;
  const e = (person.emotions ??= {});
  e[emotion] = clamp01((e[emotion] ?? 0) + amount * scale);
}

export function fade(person: Person, dt: number) {
  const e = person.emotions;
  if (!e) return;
  for (const name of EMOTIONS) {
    const v = e[name];
    if (v === undefined) continue;
    const next = v * Math.pow(0.5, dt / HALF_LIFE[name]);
    if (next < 0.0002) delete e[name];
    else e[name] = next;
  }
}

// What their feelings add to where their mood is heading.
export function moodPush(person: Person): number {
  const e = person.emotions;
  if (!e) return chemistryPush(person);
  let sum = 0;
  for (const name of EMOTIONS) sum += (e[name] ?? 0) * WEIGHT[name];
  return sum + chemistryPush(person);
}

export function strongest(person: Person): { name: Emotion; level: number } | undefined {
  const e = person.emotions;
  if (!e) return undefined;
  let best: { name: Emotion; level: number } | undefined;
  for (const name of EMOTIONS) if ((e[name] ?? 0) > (best?.level ?? 0.15)) best = { name, level: e[name]! };
  return best;
}

// How much a line of a journal is worth remembering (0..1): a death or a birth stays, a meal fades. Forgetting and storytelling both use it.
export function importance(text: string): number {
  if (/died|Died/.test(text)) return 1;
  if (/was born|I was born|I am a father/.test(text)) return 0.9;
  if (/I have learned|I have come to think|I did it|known as the|custom has formed/.test(text)) return 0.8;
  if (/Quarrelled|Lost my temper|grave/.test(text)) return 0.7;
  if (/I want to |I have decided|I set out/.test(text)) return 0.5; // what they set their heart on is not forgotten in a day
  if (/ told me: /.test(text)) return 0.35;
  if (/Killed|Built a shelter|gave me food|stayed with me/.test(text)) return 0.6;
  if (/Ran from|got away|Planted|Made a spear|Caught a fish|showed me how|Showed /.test(text)) return 0.4;
  if (/Lit a fire|Gave /.test(text)) return 0.35;
  return 0.12;
}

// What people come to think of each other from what has happened between them.
export type Belief = "generous" | "kind" | "quarrelsome";
export const BELIEF_WORDS: Record<Belief, string> = { generous: "generous", kind: "kind", quarrelsome: "quick to anger" };

export function opinionTags(r: { gifts?: number; comforts?: number; quarrels?: number }): Belief[] {
  const out: Belief[] = [];
  if ((r.gifts ?? 0) >= 2) out.push("generous");
  if ((r.comforts ?? 0) >= 2) out.push("kind");
  if ((r.quarrels ?? 0) >= 2) out.push("quarrelsome");
  return out;
}

/** What their body chemistry and any lasting low state add to mood (psyche.ts keeps the chemistry): serotonin and dopamine lift it, stress and a depressed or anxious spell sink it, and a craving after too many rewards bites. */
function chemistryPush(person: Person): number {
  const ps = person.psyche;
  if (!ps) return 0;
  const c = ps.chem;
  return 0.5 * (c.serotonin - 0.5) + 0.3 * (c.dopamine - 0.4) - 0.5 * (c.cortisol - 0.25) - (ps.state === "depressed" ? 0.35 : ps.state === "anxious" ? 0.15 : 0) - 0.5 * ps.deficit;
}

/** Two feelings together are a different thing from either: the name of the blend, if there is one. */
const BLENDS: [Emotion, Emotion, string][] = [
  ["joy", "love", "devotion"], ["fear", "anger", "rage"], ["fear", "shame", "humiliation"], ["anger", "shame", "resentment"], ["joy", "awe", "wonder"],
  ["hope", "fear", "anxious hope"], ["guilt", "love", "remorse"], ["loneliness", "longing", "yearning"], ["disgust", "anger", "loathing"], ["pride", "joy", "triumph"],
  ["despair", "loneliness", "desolation"], ["envy", "anger", "bitterness"], ["jealousy", "love", "possessiveness"], ["relief", "joy", "elation"], ["nostalgia", "loneliness", "homesickness"],
  ["love", "fear", "dread for someone loved"], ["contempt", "anger", "scorn"], ["empathy", "love", "tenderness"], ["regret", "shame", "self-reproach"], ["boredom", "loneliness", "restlessness"],
];
export function blendOf(person: Person): string | undefined {
  const e = person.emotions;
  if (!e) return undefined;
  const lit = EMOTIONS.filter((n) => (e[n] ?? 0) > 0.25).sort((a, b) => (e[b] ?? 0) - (e[a] ?? 0));
  for (const [x, y, label] of BLENDS) if (lit.includes(x) && lit.includes(y)) return label;
  return undefined;
}
