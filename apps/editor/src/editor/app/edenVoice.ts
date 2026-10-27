import type { Person, World } from "../../eden/mind";

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
  async reword(speaker: Person, listener: Person | undefined, plain: string, world: World, force = false): Promise<string | undefined> {
    if (!this.ready) return undefined;
    const now = performance.now();
    if (!force && now - this.last < MIN_GAP_MS) return undefined;
    this.last = now;
    const weather = world.weather;
    const recent = speaker.journal.slice(-3).map((j) => j.text).join(" ");
    const system = `You write one line of spoken dialogue for ${speaker.name}, a person living in a garden in a simple world. ${personaOf(speaker)} Keep the meaning of the plain line. Say it in first person, in at most 25 words, with no quotation marks, no stage directions and no names of anything that is not in the plain line.`;
    const user = `${listener ? `${speaker.name} is talking to ${listener.name}. ` : ""}Season: ${weather ? ["spring", "summer", "autumn", "winter"][weather.season] : "unknown"}. Recent: ${recent || "nothing much"}. Plain line: "${plain}"`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(this.config.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(this.config.key ? { Authorization: `Bearer ${this.config.key}` } : {}) },
        body: JSON.stringify({ model: this.config.model, temperature: 0.8, max_tokens: 80, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = data.choices?.[0]?.message?.content?.trim().replace(/^["“]|["”]$/g, "").replace(/\s+/g, " ");
      if (!text) throw new Error("it answered with nothing");
      this.warned = false;
      return text.slice(0, 220);
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
}
