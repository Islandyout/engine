# Eden against a real Ollama: what was run and what failed

K2 asked for a recorded real run of the optional model features (voice rewording, open chat with the Walker, the planner) against a real
Ollama. This is what could and could not be done in the build container (4 CPU cores, no GPU, shared with other jobs). It is a partial
run. Nothing below is made up: each line comes from `tools/eden/ollama_run.ts`, which uses the page's own `Voice` class
(`apps/editor/src/editor/app/edenVoice.ts`) and the planner's own prompt and checker (`llmPlan.ts`).

## Setup that worked

- `ollama` is not installed here, but it can be installed through the proxy: `https://ollama.com/download/ollama-linux-amd64.tar.zst`
  (1.5 GB; the older `.tgz` URL is 404). Version 0.40.13, CPU only (the CUDA, ROCm and Vulkan libraries were not unpacked).
- A small model can be pulled through the proxy: `ollama pull llama3.2:1b` (1.3 GB) succeeded and the server answered
  `/api/tags` and `/v1/chat/completions` on 127.0.0.1:11434 (the endpoint the page defaults to).

## Run 1 and 2: the page's own time limits (12 s a line, 24 s a chat answer, 90 s a plan)

The machine had a load average of 25 to 70 from other jobs, so the model's first load alone took over three minutes and every
call timed out at the code's limit. Run 2 was with the model already loaded and still timed out.

| Call | Result |
|---|---|
| voice reword, 3 lines | no answer after 12 s each. The code said once: "The voice could not be reached (too slow). Using plain speech." and used the plain line |
| chat with the Walker, 3 questions | no answer after 24 s each; plain answer used (silent after the first notice, by design: `warned`) |
| planner, 3 requests (Adam, Eve, Adam) | no answer after 90 s each; "The planner could not be reached (too slow)." |

So on a slow or busy CPU the three features fail quietly into plain speech, as designed, and the player is told once. A 12 s limit for a
line is tight for a CPU-only 1B model: even an idle laptop CPU may exceed it on the first call (the model has to load).

## Run 3: the limits stretched 20 times (`PATIENCE=20`), to see what the model says

This shows what the model can do, not what the page would show. The run was cut short when the container restarted. Two calls finished:

| Plain line given | Model's answer | Seconds |
|---|---|---|
| "I am glad you are here." | "I am glad you are here." | 140.6 |
| "I am hungry and the grove is far." | "I am hungry and the grove is far." | 183.2 |

Observations, honestly stated:

- The 1B model returned the plain line unchanged both times. It did not reword in the person's own manner, so on this evidence the voice
  adds nothing with `llama3.2:1b` and the prompt as written. Two samples are too few to call that a property of the model, but it is what
  was seen.
- No chat answer and no plan was ever received, so **the planner's checker (`parsePlan`) has still not been exercised with real model
  text**, and neither has the `[offer]`, `[warn]` and `[promise]` tag handling. Those remain tested only with fake answers.
- Seconds are dominated by CPU contention (the server reported `500` after 2 to 3.3 minutes on a bare `Say hi` while other jobs held the
  CPUs), so they say nothing about speed on a laptop.

## Not done

- A complete run of chat and planner with real output.
- A run on an idle machine, or with a larger model (3B or 4B) that might reword better.
- Rewording through the live page (only the class was driven from Node, not the browser with `OLLAMA_ORIGINS=*`).

To repeat it: start `ollama serve`, `ollama pull llama3.2:1b`, then
`cd apps/editor && PATIENCE=1 npx tsx ../../tools/eden/ollama_run.ts llama3.2:1b` (raise `PATIENCE` on a slow machine). Each call prints one
JSON line with the question, the raw answer, the seconds, and for plans the verdict from `parsePlan`.
