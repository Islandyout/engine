// A recorded run of the optional model features against a real Ollama (voice rewording, open chat with the Walker, and the planner), using
// the page's own Voice class and the same prompts. Every call prints what was asked, what came back, how long it took, and what the code
// did with it (a plan is checked by parsePlan and thrown out with its reason if it cannot work). Failures are printed, never hidden.
//
//   ollama serve &   (and: ollama pull llama3.2:1b)
//   cd apps/editor && npx tsx ../../tools/eden/ollama_run.ts [model=llama3.2:1b] [url=http://127.0.0.1:11434/v1/chat/completions] [rounds=3]
import { Voice } from "../../apps/editor/src/editor/app/edenVoice";
import { PLAN_SYSTEM, parsePlan, situationOf } from "../../apps/editor/src/eden/llmPlan";
import { make, makePerson, step, type World } from "../../apps/editor/src/eden/mind";
import { DAY } from "../../apps/editor/src/eden/earth";

const model = process.argv[2] ?? "llama3.2:1b";
const url = process.argv[3] ?? "http://127.0.0.1:11434/v1/chat/completions";
const rounds = Number(process.argv[4] ?? 3);

const world: World = {
  things: [
    { id: "river", kind: "river", x: -4, z: 4, radius: 6 },
    { id: "grove", kind: "grove", x: 26, z: -16, radius: 13, stock: 8, maxStock: 8 },
    { id: "woods", kind: "woodland", x: 60, z: 30, radius: 12, stock: 10, maxStock: 10 },
    { id: "hut", kind: "shelter", x: 2, z: 2, radius: 3, stock: 4 },
  ],
  people: [],
  radius: 190,
  clock: DAY / 3,
  maxPeople: 20,
  climate: { meanC: 12, seasonalAmpC: 7, dailyAmpC: 4, rainy: 0.25, seed: 7 },
};
const adam = makePerson("adam", 0, 0, 11, { boldness: 0.7, sociability: 0.8, curiosity: 0.7 }, { name: "Adam", sex: "m", age: 20 });
const eve = makePerson("eve", 3, 1, 12, { boldness: 0.3, sociability: 0.5, curiosity: 0.9 }, { name: "Eve", sex: "f", age: 19 });
world.people.push(adam, eve);
for (const t of world.things) for (const p of world.people) p.memory.set(t.id, { x: t.x, z: t.z, feeling: 0.2, visits: 2, lastSeen: 0 });
make(world, "wolf", 40, -10, {});
for (let i = 0; i < 400; i++) step(world, 5); // a couple of sim hours, so there is something to remember and say

// PATIENCE=n stretches the Voice class's own time limits (12 s a line, 24 s a chat answer, 90 s a plan) n times, for a busy or slow
// machine. The page uses the limits as they are, so a run with PATIENCE above 1 shows what the model can do, not what the page would show.
const patience = Number(process.env.PATIENCE ?? 1);
if (patience !== 1) {
  const real = globalThis.setTimeout;
  (globalThis as { setTimeout: unknown }).setTimeout = ((f: () => void, ms?: number, ...rest: unknown[]) => real(f, (ms ?? 0) >= 10000 ? (ms ?? 0) * patience : ms, ...rest)) as typeof setTimeout;
}
// Node's own fetch gives up on a server that has not started answering after 300 s (undici headersTimeout), which a CPU-only model on a busy
// machine can exceed; a browser has no such limit, only the page's own timers. So this run talks through http.request, which waits as long as
// the Voice class's own timer (stretched by PATIENCE) allows and honours its AbortSignal.
import { request } from "node:http";
(globalThis as { fetch: unknown }).fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) =>
  new Promise((resolve, reject) => {
    const req = request(url, { method: init.method, headers: init.headers }, (res) => {
      const parts: Buffer[] = [];
      res.on("data", (c: Buffer) => parts.push(c));
      res.on("end", () => resolve({ ok: (res.statusCode ?? 0) < 300, status: res.statusCode, json: async () => JSON.parse(Buffer.concat(parts).toString()) }));
    });
    req.on("error", reject);
    init.signal?.addEventListener("abort", () => req.destroy(new Error("aborted")));
    req.end(init.body);
  });
const only = (process.env.ONLY ?? "voice,chat,plan").split(",");
const reports: string[] = [];
const voice = new Voice({ enabled: true, url, model, key: "", plan: true }, (text) => reports.push(text));
const out = (kind: string, record: Record<string, unknown>) => console.log(JSON.stringify({ kind, model, ...record }));

async function timed<T>(f: () => Promise<T>): Promise<{ value: T; seconds: number }> {
  const t = Date.now();
  const value = await f();
  return { value, seconds: +((Date.now() - t) / 1000).toFixed(1) };
}

(async () => {
  const lines = ["I am glad you are here.", "I am hungry and the grove is far.", "There is a wolf near the woods; be careful."];
  for (let i = 0; i < (only.includes("voice") ? rounds : 0); i++) {
    const plain = lines[i % lines.length]!;
    const { value, seconds } = await timed(() => voice.reword(adam, eve, plain, world, true));
    out("voice", { plain, answer: value?.text ?? null, intent: value?.intent ?? null, seconds, reports: reports.splice(0) });
  }
  const history: { role: "user" | "assistant"; content: string }[] = [];
  for (const said of only.includes("chat") ? ["Hello, who are you?", "Where can I find water?", "Do you ever get afraid?"].slice(0, rounds) : []) {
    const { value, seconds } = await timed(() => voice.chat(eve, history, said, world));
    out("chat", { said, answer: value ?? null, seconds, reports: reports.splice(0) });
    if (value) history.push({ role: "user", content: said }, { role: "assistant", content: value });
  }
  for (let i = 0; i < (only.includes("plan") ? rounds : 0); i++) {
    const who = i % 2 ? eve : adam;
    const user = `You are ${who.name}.\n${situationOf(world, who)}\nWhat will you do next?`;
    const { value, seconds } = await timed(() => voice.plan(PLAN_SYSTEM, user));
    if (!value) {
      out("plan", { who: who.name, raw: null, seconds, verdict: "no answer", reports: reports.splice(0) });
      continue;
    }
    const parsed = parsePlan(world, who, value);
    out("plan", { who: who.name, raw: value, seconds, verdict: parsed.plan ? `accepted: ${parsed.plan.goal} (${parsed.plan.steps.length} steps)` : `thrown out: ${parsed.error}`, reports: reports.splice(0) });
  }
})().catch((e) => {
  console.error("run failed:", e);
  process.exit(1);
});
