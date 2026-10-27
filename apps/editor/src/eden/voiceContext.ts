// What a person knows when they speak, written out for the free voice: who they are, how they are, what has mattered to them lately, what they
// think of the one they are talking to, and what the people around them hold to. The voice is given this and nothing else, so it can only
// say what is true of them. Pure, so it can be tested without a model.
import { BELIEF_WORDS } from "./inner";
import { SKILL_WORDS, SKILLS, VALUES, valueOf } from "./identity";
import { bondOf, hourOf, type Person, type World } from "./mind";
import { CUSTOM_AT, NORM_TEXT, standing, standingWord, type NormId } from "./norms";
import { SEASON_NAMES } from "./earth";

const word = (v: number, low: string, mid: string, high: string) => (v < 0.35 ? low : v > 0.65 ? high : mid);

export function describeSelf(p: Person): string {
  const t = p.personality;
  return `${p.name} is a ${p.age < 4 ? "child" : p.sex === "f" ? "woman" : "man"} who is ${word(t.boldness, "careful", "steady", "bold")}, ${word(t.sociability, "quiet", "friendly", "warm and talkative")} and ${word(t.curiosity, "practical", "thoughtful", "curious")}.`;
}

function feelings(p: Person): string {
  const out: string[] = [];
  const n = p.needs;
  if (n.thirst > 0.6) out.push("thirsty");
  if (n.hunger > 0.6) out.push("hungry");
  if (n.energy > 0.7) out.push("tired");
  if (n.social > 0.7) out.push("lonely");
  if (p.cold > 0.45) out.push("cold");
  if (p.illness) out.push("ill");
  if ((p.grief ?? 0) > 0.2) out.push("grieving");
  for (const [k, v] of Object.entries(p.emotions ?? {})) if ((v ?? 0) > 0.3) out.push(k === "gratitude" ? "grateful" : k === "fear" ? "afraid" : k);
  out.push(p.mood > 0.4 ? "in good spirits" : p.mood < -0.3 ? "low" : "calm");
  return out.join(", ");
}

// The few things from their journal that mattered most and are not too long ago.
export function memoriesOf(p: Person, now: number, count = 3): string[] {
  return p.journal
    .slice(-120)
    .filter((j) => !j.text.startsWith("Talked with") && !j.text.includes(" said: "))
    .map((j) => ({ j, score: (j.w ?? 0.12) * Math.exp(-(now - j.t) / 2880) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map((x) => x.j.text);
}

export function contextOf(speaker: Person, listener: Person | undefined, world: World): string {
  const now = world.clock ?? 0;
  const lines: string[] = [describeSelf(speaker)];
  if (speaker.story) lines.push(`Their story: ${speaker.story}`);
  const cares = VALUES.filter((v) => valueOf(speaker, v) > 0.65);
  if (cares.length) lines.push(`They care about: ${cares.join(", ")}.`);
  if (speaker.role) lines.push(`They are known as the ${speaker.role}.`);
  else {
    const best = SKILLS.filter((s) => (speaker.skills?.[s] ?? 0) > 0.2)[0];
    if (best) lines.push(`They have been ${SKILL_WORDS[best].doing} lately.`);
  }
  lines.push(`Right now they feel: ${feelings(speaker)}.`);
  const memories = memoriesOf(speaker, now);
  if (memories.length) lines.push(`What has mattered to them lately: ${memories.join(" ")}`);
  if (listener) {
    const bond = bondOf(speaker, listener);
    const tags = (speaker.beliefs?.[listener.id] ?? []).map((b) => BELIEF_WORDS[b]);
    lines.push(`They are speaking to ${listener.name}, who is their ${bond === "stranger" ? "stranger" : bond}${tags.length ? ` and whom they think ${tags.join(" and ")}` : ""}. Among the others ${listener.name} is ${standingWord(standing(world, listener))}.`);
  }
  const customs = (Object.keys(world.norms ?? {}) as NormId[]).filter((id) => (world.norms?.[id]?.strength ?? 0) >= CUSTOM_AT).map((id) => NORM_TEXT[id]);
  if (customs.length) lines.push(`Their people's customs: ${customs.join("; ")}.`);
  const w = world.weather;
  if (w) lines.push(`It is ${SEASON_NAMES[w.season]}, ${Math.round(hourOf(now))}:00, ${Math.round(w.tempC)} degrees${w.raining ? " and raining" : ""}.`);
  const last = speaker.spoken?.slice(-2);
  if (last?.length) lines.push(`They last said: ${last.map((l) => `"${l}"`).join(" and ")}. Do not repeat it.`);
  return lines.join("\n");
}

// What the voice may also ask the world to do, each checked by the mind before it happens.
export const INTENTS = ["offer", "warn", "promise"] as const;
export type SpokenIntent = (typeof INTENTS)[number];
export function parseIntent(text: string): { text: string; intent?: SpokenIntent } {
  const m = text.match(/\[(offer|warn|promise)\]\s*$/i);
  const clean = text.replace(/\s*\[(offer|warn|promise)\]\s*$/i, "").trim();
  return m ? { text: clean, intent: m[1]!.toLowerCase() as SpokenIntent } : { text: clean };
}
