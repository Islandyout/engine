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


## Run 3 and 4 (machine quiet, llama3.2:1b on 4 CPU cores, the page's own prompts)

The earlier runs timed out because the cores were overloaded. These two ran with the machine mostly idle (load under 4), with the voice's wait stretched to 3 times the page's own (36 s); run 4 is after the planner prompt was changed.

**Run 3 (before the prompt change)**

| call | time | result | text |
|---|---|---|---|
| voice | 36.8 s | no answer (too slow) |  |
| voice | 36 s | no answer (too slow) |  |
| voice | 36 s | no answer (too slow) |  |
| chat | 21.5 s | answered | I am Eve, a woman who lives in a simple world of gardens, woods, a river and a lake. |
| chat | 16.2 s | answered | I know where the river is, it's close to the garden. |
| chat | 9.9 s | answered | Sometimes, but not often, it's a calm feeling in the belly, it passes. |
| plan (Adam) | 143.1 s | thrown out: the answer was not valid JSON (Unexpected non-whitespace c | |
| plan (Eve) | 17.7 s | thrown out: step 1: "go" is not something you can do | |
| plan (Adam) | 15.7 s | thrown out: step 1: woodland is not a place you know with wood | |

**Run 4 (after: one word per step, a worked example)**

| call | time | result | text |
|---|---|---|---|
| voice | 9.7 s | unchanged | I am glad you are here. |
| voice | 9.7 s | unchanged | I am hungry and the grove is far. |
| voice | 7.2 s | reworded | There is a wolf near the woods; be careful [offer]. |
| chat | 13.7 s | answered | I am Eve, a person living in the garden and woods near the river and lake. |
| chat | 16.7 s | answered | The lake is about a day's walk from here, and the river leads to it. |
| chat | 0.7 s | answered | Sometimes in the woods I hear strange noises that make me feel a fear I do not know. |
| plan (Adam) | 2.9 s | thrown out: step 2: a fire needs 2 wood and you will have 1 | |
| plan (Eve) | 2.2 s | accepted: gather food (2 steps) | |
| plan (Adam) | 2.8 s | thrown out: step 1: river is not a place you know with wood | |

**What this shows.** Chat works: the answers are in the character's voice and use what the notes say. The planner: before, none of three plans was usable (the model copied the schema's alternatives, 'gather|forage|…', and invented 'go'); after the prompt change one of three was accepted and the others were thrown out by the checks with their reasons, which is how it is meant to work. The voice's answers take 7 to 10 s on an idle machine and over 36 s on a loaded one; it often returns the plain line unchanged. **A bug found by the real run:** the model followed the intent tag with a full stop ('[warn].') and the tag was left in the spoken line, because only a tag at the very end was read. Now a trailing full stop is allowed (test in edenVoiceContext). **Not tested:** any model other than a 1-billion-parameter one on CPU; a bigger model would likely plan better. The run is repeatable with tools/eden/ollama_run.ts.
