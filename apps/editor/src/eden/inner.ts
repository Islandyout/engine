// A person's inner life, beyond needs: named emotions that rise from what happens to them and fade at their own speeds, a mood that falls
// faster than it rises and, held low long enough, breaks (an outburst, or a need to be alone), and what they have come to believe about
// the people around them from what those people have done. Plain code like the rest of the mind, so every life can be replayed from its seed.
import type { Person } from "./mind";

export type Emotion = "joy" | "fear" | "anger" | "gratitude" | "pride" | "shame";
export const EMOTIONS: readonly Emotion[] = ["joy", "fear", "anger", "gratitude", "pride", "shame"];

// Sim seconds for an emotion to halve (a day is 1440): fright passes in minutes, gratitude and pride last about a day.
const HALF_LIFE: Record<Emotion, number> = { joy: 400, fear: 90, anger: 300, gratitude: 900, pride: 700, shame: 700 };
// How hard each pulls the mood target, negative feelings counting for more than positive ones as they do in people.
const WEIGHT: Record<Emotion, number> = { joy: 0.5, gratitude: 0.4, pride: 0.35, fear: -0.8, anger: -0.7, shame: -0.55 };

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
    if (next < 0.01) delete e[name];
    else e[name] = next;
  }
}

// What their feelings add to where their mood is heading.
export function moodPush(person: Person): number {
  const e = person.emotions;
  if (!e) return 0;
  let sum = 0;
  for (const name of EMOTIONS) sum += (e[name] ?? 0) * WEIGHT[name];
  return sum;
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
  if (/I have learned|I have come to think|I did it|known as the/.test(text)) return 0.75;
  if (/Quarrelled|Lost my temper|grave/.test(text)) return 0.7;
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
