import type { Person, World } from "../../eden/mind";
import { contextOf, parseIntent, type SpokenIntent } from "../../eden/voiceContext";

// An optional free voice for Eden's people. Their plain speech (src/eden/speech.ts) always works with nothing installed; this can reword a
// line in the person's own manner using any OpenAI-compatible chat endpoint that costs nothing to use:
//   - Ollama running on this laptop (free, private, offline): url http://localhost:11434/v1/chat/completions, model e.g. llama3.2:1b (fast), llama3.2:3b or a 4B Qwen/Gemma (better, slower).
//     Start it with OLLAMA_ORIGINS=* so the page may call it.
//   - A free tier of a hosted service (a key is needed; it is kept only in this browser).
// It is off until the Creator turns it on. One line is asked for at most every few seconds (free tiers limit requests), a slow or failing
// answer is dropped after a timeout, and when the voice cannot be reached the Creator is told once and the plain line is used.

export interface VoiceConfig {
  enabled: boolean;
  url: string;
  model: string;
  key: string;
}
export const DEFAULT_VOICE: VoiceConfig = { enabled: false, url: "http://localhost:11434/v1/chat/completions", model: "llama3.2:1b", key: "" };
const STORE = "eden-voice-v1";
const MIN_GAP_MS = 6000;
const TIMEOUT_MS = 12000;

export function loadVoice(): VoiceConfig {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) return { ...DEFAULT_VOICE, ...(JSON.parse(raw) as Partial<VoiceConfig>) };
  } catch {
    // no stored settings, or the browser keeps nothing: the defaults (off)
  }
  return { ...DEFAULT_VOICE };
}
export function saveVoice(config: VoiceConfig): void {
  try {
    localStorage.setItem(STORE, JSON.stringify(config));
  } catch {
    // the settings last for this visit only
  }
}

const word = (v: number, low: string, mid: string, high: string) => (v < 0.35 ? low : v > 0.65 ? high : mid);

export function personaOf(person: Person): string {
  const p = person.personality;
  return `${person.name} is a ${person.sex === "f" ? "woman" : "man"} who is ${word(p.boldness, "careful", "steady", "bold")}, ${word(p.sociability, "quiet", "friendly", "warm and talkative")} and ${word(p.curiosity, "practical", "thoughtful", "curious")}.`;
}

export class Voice {
  config: VoiceConfig;
  private last = 0;
  private warned = false;
  constructor(config: VoiceConfig, private report: (text: string) => void) {
    this.config = config;
  }

  get ready(): boolean {
    return this.config.enabled && !!this.config.url;
  }

  // The plain line, said by this person to that one, in their own words. Resolves to the reworded line, or undefined (with the reason said
  // once) when the voice is off, too busy, slow or unreachable.
  async reword(speaker: Person, listener: Person | undefined, plain: string, world: World, force = false): Promise<{ text: string; intent?: SpokenIntent } | undefined> {
    if (!this.ready) return undefined;
    const now = performance.now();
    if (!force && now - this.last < MIN_GAP_MS) return undefined;
    this.last = now;
    const system = `You write one line of spoken dialogue for ${speaker.name}, a person living in a garden in a simple world. Use only what the notes about them say; invent no events, people or places. Keep the meaning of the plain line, in first person, in at most 25 words, with no quotation marks and no stage directions. If, and only if, the plain line is an offer of food, a warning, or a promise, you may end with [offer], [warn] or [promise].`;
    const user = `Notes about ${speaker.name}:\n${contextOf(speaker, listener, world)}\n\nPlain line: "${plain}"`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(this.config.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(this.config.key ? { Authorization: `Bearer ${this.config.key}` } : {}) },
        body: JSON.stringify({ model: this.config.model, temperature: 0.8, max_tokens: 90, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = data.choices?.[0]?.message?.content?.trim().replace(/^["“]|["”]$/g, "").replace(/\s+/g, " ");
      if (!text) throw new Error("it answered with nothing");
      this.warned = false;
      return parseIntent(text.slice(0, 240));
    } catch (e) {
      if (!this.warned) {
        this.warned = true;
        this.report(`The voice could not be reached (${controller.signal.aborted ? "too slow" : String(e)}). Using plain speech. ${/Failed to fetch|NetworkError/.test(String(e)) ? "If it is Ollama, start it with OLLAMA_ORIGINS=* ." : ""}`.trim());
      }
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  }

  /** An open conversation with the Walker: what they said, in the light of who this person is and what they remember, with the last few turns. */
  async chat(speaker: Person, history: { role: "user" | "assistant"; content: string }[], said: string, world: World): Promise<string | undefined> {
    if (!this.ready) return undefined;
    const system = `You speak as ${speaker.name}, a person living in a simple world of gardens, woods, a river and a lake, with no machines and no writing. A stranger called the Walker is talking with you. Answer in the first person, in at most 30 words, with no quotation marks and no stage directions. Use only what the notes say; invent no events, people or places, and if you do not know, say so in your own way. Never mention being an AI.`;
    const facts = speaker.walkerFacts;
    const known = facts ? `The Walker has told you: ${[facts.name && `their name is ${facts.name}`, facts.from && `they come from ${facts.from}`, facts.likes?.length && `they like ${facts.likes.join(" and ")}`].filter(Boolean).join("; ") || "nothing about themselves"}.` : "";
    const messages = [{ role: "system", content: `${system}\n\nNotes about ${speaker.name}:\n${contextOf(speaker, undefined, world)}\n${known}` }, ...history.slice(-8), { role: "user", content: said }];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS * 2);
    try {
      const res = await fetch(this.config.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(this.config.key ? { Authorization: `Bearer ${this.config.key}` } : {}) },
        body: JSON.stringify({ model: this.config.model, temperature: 0.8, max_tokens: 110, messages }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = data.choices?.[0]?.message?.content?.trim().replace(/^["“]|["”]$/g, "").replace(/\s+/g, " ");
      return text ? text.slice(0, 280) : undefined;
    } catch (e) {
      if (!this.warned) {
        this.warned = true;
        this.report(`The voice could not be reached (${controller.signal.aborted ? "too slow" : String(e)}). Using plain speech.`);
      }
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  }
}
