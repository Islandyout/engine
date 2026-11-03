# Eden: the mind (design)

This is the one design document for how an Eden person decides what to do. The older per-feature changelogs (F103 to F141) say what was
added and when; this says how the pieces fit, which rules hold them together, and how the result is measured. If this and the code
disagree, the code is right and this is a bug. Nothing here claims anyone feels anything: it is machinery by which behaviour comes from
reasons, and every module says so in its header.

Everything runs on the player's machine in plain TypeScript (`apps/editor/src/eden/`). There is no server and no account. The old
Supabase and Groq brain of the first version is gone (see "What this replaced"). A language model is optional and only ever proposes
words or a plan that the code then checks (see "Optional model").

## One step of the mind

`step(world, dt)` in `mind.ts` advances the world by `dt` seconds. For each person it does, in this order:

1. **The body**: needs (hunger, thirst, energy, social, joy), cold, mood. These are the original five needs plus warmth.
2. **Module steps** (the slow variables, each pure with respect to `world` and the person):
   `psycheStep` (drives, chemistry, habits, cues, memory), `devStep` (childhood), `lifeStep` (adolescence to old age, family),
   `mindStep` (self-model, other minds, lying, secrets), `heartStep` (love, pain, joy, meaning), `sacrificeStep`.
3. **Choice**, when there is no current intent. `options()` collects candidate intents with scores. The base options are in `mind.ts`;
   the modules add theirs: `cultureOptions`, `planOptions` (`reason.ts`, which also asks `solve.ts` for problem plans and party options),
   `devOptions`, `arcOptions`. Then the scores are tilted by the modules, in this order: `psycheBias` (what is wanted, habits, cues),
   `painBias`, `heartBias`, the phase E to I biases (see "Modules of phases E to J"), `lessonBias` (what experience says goes well), and `resolveConflict` (two strong motives at once become
   hesitation, settled by willpower). Thirst and hunger are boosted before all of those so nothing added later can leave someone parched.
   `choose()` then picks with the person's own seeded random stream.
4. **Doing**: the intent is walked and acted. At the end of every action `recordOutcome` (self-model), `heartAfter` and `afterAct`
   (psyche) learn from what just happened.
5. **World steps**: `learnFromWorld` and `teamStep` (`solve.ts`) update beliefs about cause and effect and run parties. Deaths call
   `afterDeath` (lifecycle) and `onDeathSeenBy` (development).

## The modules

Each module owns one kind of state, stored on the person (`person.psyche`, `.dev`, `.life`, `.self`, `.heart`, `.plan`...) or on the
world (`world.works`, `world.teams`...). A module reads the rest of the person freely but writes only its own state and the shared
channels below.

| Module | What it is | Hooks into `mind.ts` |
|---|---|---|
| `psyche.ts` | 11 drives (safety, belonging, esteem, autonomy, competence, curiosity, meaning, attachment, intimacy, play, stimulation); 9 chemicals (dopamine, serotonin, oxytocin, cortisol, endorphin, noradrenaline, testosterone, oestrogen, melatonin) with baseline, decay, tolerance, withdrawal, and anxious or depressed states that outlast their cause; habits, cues, memory with forgetting, recall and consolidation, life story | `psycheStep`, `psycheBias`, `afterAct`, `recall` |
| `development.ts` | A person made by childhood: attachment (secure, anxious, avoidant) from how a baby was held and answered, language windows, tantrums, play, rules taught, sibling rivalry, understanding of death | `devStep`, `devOptions`, `limitSpeech`, `weaning`, `onDeathSeenBy`, `witnessShare` |
| `lifecycle.ts` | Adolescence, courtship, pairing, parenthood, the middle years, old age, the body's rhythms, family shape (kin, clan, widowhood, orphans, inheritance, incest avoidance) | `lifeStep`, `arcOptions`, `afterDeath`, `canConceive`, `heirsOf`, `guardianOf`, `obedience` |
| `mindmodel.ts` | Self (esteem, willpower, self-image, lessons) and other minds (who knows what; telling, gossip, lying, bluffing, secrets, flattery, persuasion), inner conflict, rationalising, hypocrisy, double standards in judgement | `mindStep`, `recordOutcome`, `resolveConflict`, `lessonBias`, `snapshot`, `judge`, `talkAbout`, `surpriseGift`, `aftermathOfTheft` |
| `heart.ts` | Love with a course (infatuation, attachment, longing, betrayal), pain that teaches, joy with recorded sources, meaning (a purpose that steadies, and the crisis and search when it is lost) | `heartStep`, `heartBias`, `painBias`, `heartAfter`, `celebrate`, `sacrificeStep` |
| `culture.ts` | Songs, stories, paintings, books; mathematics and science found by pondering; philosophy and theology that spread and divide; a ledger of favours and prices; inventions as laws of the world | `cultureOptions`, `doCreate`, `doPonder`, `doRead`, `exchangeIdeas`, `faithful`, `knows`, `owe`, `tradeRates` |
| `reason.ts` | Plans in space and time: a short run of steps toward something foreseeable, with time estimates and deadlines, and experiments when no known way works | `planOptions`, `doInvent`, `doMake`, `worksNow`, `adoptPlan` |
| `solve.ts` | Problems nobody planned for (a wolf at camp, no wood in reach): options with cost and likelihood, who else is needed, parties and rally points, cause and effect learned from what happens and told to others | `learnFromWorld`, `teamStep`, `fightBeast`; called from `reason.ts` (`solveProblem`, `scoutPlan`, `teamOptions`) |

### Modules of phases E to J (and `heart.ts`, phase D, above)

These came later and hook into `mind.ts` in the same way. Where they run in `step()`: the world-level ones (`conflictWorld`, `world2Step`,
`techStep`, `societyStep`, `economyWorldStep`) run once per step before the people loop; the per-person ones (`learningStep`,
`economyStep`, `conflictStep`, `bodyStep`) run in the people loop after `heartStep`; the option scores are tilted in this order after `heartBias`: `societyBias`, `learnBias`, `learnFilter`, `economyBias`, `conflictBias`,
`bodyBias`, then `lessonBias` and `resolveConflict`; `learnAfter` and `economyAfter` run at the end of each action. `options()` also
gets `techOptions`, `learnOptions` and `livestockOptions`.

| Module | Phase | What it is | Hooks into `mind.ts` |
|---|---|---|---|
| `learning.ts` | F | Apprenticeship (a master, a cost to the master, tests and initiation, reputation); oral tradition (a tale carries a rule from `RULES`, each retelling may drift or lose it, songs lose it least); access (sex, class, guild, ban, literacy, books copied with mistakes, burned, lost in a collapse, strangers carrying knowledge); failure and false belief (spread by trust, dropped when tested and found false); curiosity falling with age; words copied from parents with sound shifts | `learningStep`, `learnOptions`, `learnBias`, `learnFilter`, `learnAfter`, `teachStep`, `loreTalk` |
| `society.ts` | G | Groups with a leader (from status, inherited rank), a council, laws voted from customs, cases with a judge, taboos, rites at an age or event, festivals on the first day of each season, feuds between houses, alliances, a priest, schisms, and the splitting of a group that then drifts (founder effect) | `societyStep`, `societyBias`, `onTheft` |
| `conflict.ts` | H | Fights, killing, feud and war between bands, bullying, coercion, bondage, harsh punishment and neglect, hoarding, cheating, fraud, bribery, betrayal, informing, scapegoating, mobs, propaganda; each act logs its cause; consequences by honour, shame or guilt ethos, a judge, restitution, jail, exile, forgiveness. Sexual violence is deliberately not modelled (`F145.md`) | `conflictWorld`, `conflictStep`, `conflictBias`, `theftConflict` |
| `world2.ts` | I | Other settlements (trade, raids, migrants, journeys over mountains and rivers), geography and slow climate drift, epidemics that travel, worn-out land, fire danger at camp, livestock beyond the dog | `world2Step`, `livestockOptions`, `tameLivestock` |
| `body.ts` | I | Growth curve, strength, fitness, sleep debt, senses ageing, disability, scars, lice, pregnancy complications, bed sickness; and the Creator's Walker body (look, needs, ageing, deeds remembered by people) | `bodyStep`, `bodyBias`, `bodySpeed`, `sightMul`, `fertilityOf`, `birthComplication`, `stillbirthExtra` |
| `economy.ts` | E | Ownership, speciality and surplus, a fair every fourth day, prices from supply and demand, haggling, caravans, spoilage, money that emerges, debt with interest, a common granary, wages and bonded work, tally sticks and writing | `economyStep`, `economyWorldStep`, `economyBias`, `economyAfter`, `economyTheft`, `inheritHoldings`, `marketTrade` |
| `tech.ts` | J | A large space of inventions where each needs earlier ones (`CRAFTS`; a pot needs a basket, a kiln a pot, copper a kiln), farms, tame animals, metals, wheels, boats and bridges, shared projects; `work` intents use what was built; `inventionCount` reports how many a people has found | `techStep`, `techOptions`, `doWork` |
| `wisdom.ts` | J | Many causes learned from what happens (`CAUSES`, each with a `watch` that counts as hit or miss), beliefs dropped on enough misses with the person saying they were wrong, analogies between things, and a method of going about a problem that can be taught | called from `techStep` (`watchCauses`) and `tech.ts`; no direct hook in `mind.ts` |

`solve.ts` learns one cause (fire keeps wolves off); `wisdom.ts` generalises it to a list.

Older modules that these build on: `inner.ts` (emotions, opinions, beliefs), `identity.ts` (values, skills, roles, stories), `norms.ts`
(customs and standing), `joys.ts` (the small moments of a day), `speech.ts` and `chat.ts` (what is said and how the Walker is answered),
`motion.ts` (mind to body language), `earth.ts` (time, season, weather), `persist.ts` (save and load, with the random streams).

### Optional model

`llmPlan.ts` lets a language model propose a plan. It is only asked to choose steps from a fixed vocabulary naming things the person
knows; each step is then checked against the map, the clock and what they carry (`parsePlan`), and a proposal that cannot work is thrown
away with the reason (`adoptPlan` only ever receives a checked plan). `edenVoice.ts` (in `apps/editor/src/editor/app/`) can reword spoken
lines through Ollama. With no model the game is unchanged: the minds never depend on one.

## Rules that keep it a single mind

### The module ring rule

`mind.ts`, `culture.ts`, `reason.ts`, `solve.ts`, `psyche.ts`, `development.ts`, `lifecycle.ts` (and `heart.ts`, `mindmodel.ts`) import
one another in a ring: `mind.ts` calls into each module and each module needs the types and helpers of `mind.ts`. That works in
ES modules only while **nothing reads a value from another module at load time**. A top-level `const X = other.Y * 2`, a table built
from another module's exports, or a class extending one, will crash with "Cannot access X before initialization", and only for some
import orders (so it can pass a test and break the page). So:

- Cross-module values are read inside functions, never at the top level of a module.
- Where a module needs another's constant at load time it keeps a plain number and a test checks the two agree: `AGES` in
  `lifecycle.ts` mirrors `AGE` in `development.ts` and `ADULT_AGE` in `mind.ts` (`tests/edenModules.test.ts`).
- `tests/edenModules.test.ts` imports every file in `src/eden/` FIRST, alone, in its own process, so every entry order is exercised.
  A new module must pass it before it is added.

### The determinism rule

The same seed gives the same life. Inside `src/eden/` nothing may call `Math.random()` or `Date.now()` to decide anything.
Randomness comes from two seeded streams: `rand(person)` (mulberry32 on `person.rngState`, one stream per person) and `worldRand(world)`
(`world.rng`). Both are saved with the world (`persist.ts`), so a loaded world carries on exactly as the saved one would. Consequences:

- Adding a call to `rand(person)` changes every later draw for that person. Sweeps and baselines are compared as distributions over
  thousands of seeds, not as single runs, for this reason.
- The two exceptions are named and are outside the mind: `runCreatorCommand` takes its random function as a parameter (the page passes
  `Math.random`, tests pass a seeded one), and `lifelike.ts` times its own run with `Date.now()` for a report only.
- Anything on the page that is random (birds, leaping fish, sound) lives in `apps/editor/src/editor/app/eden*.ts` and is never read back
  by the minds.

### The no-silent-fallback rule

From `CLAUDE.md`: a bad value produces a reason. A model plan that cannot work is rejected with the step and the reason (`parsePlan`);
a damaged save is reported in the life log and the world restarts only after saying so (`startWorld`).

### The hash-chance rule and the off-switch rule (modules of phases E to J)

- **Hash chances.** `economy`, `society`, `conflict`, `body`, `tech` and `learning` draw their chances from a hash of who, when and what
  (`chanceOf` and its siblings), never from `rand(person)`. So adding or changing one of them leaves the other draws of a seeded life
  untouched. `world2.ts` uses its own stream, `world2.rng`, for the same reason.
- **Off until asked.** `world2` does nothing until `enableWorld2(world)` is called (the page does, the tests do), so worlds that never asked for
  it, such as the sweeps, are unchanged.
- **Every cruel act has a logged cause and a way back** (`conflict.ts`): no switch makes people bad; see `F145.md` for what is left out.

### Production rules (condition, then action, learned from play)

The "rules" in the mind are condition-action pairs held by a person and changed by what happens:

- **Causes** (`wisdom.ts` `CAUSES`; the older fire rule in `solve.ts`). A cause has a `watch` that returns true (the world bears it out),
  false (it goes against it) or nothing. `person.rules[id]` counts tries and hits; enough hits make it a belief they act on and tell
  (`idea`), enough misses make them drop it and say they were wrong. A rule taken on trust from being told counts for little.
- **Tale rules** (`learning.ts` `RULES`: keep the fire alive at night, share in winter, wash before eating). A tale carries one; retelling may
  lose it; whoever holds it leans toward it.
- **Crafts** (`tech.ts` `CRAFTS`): each invention lists the ones it needs, so the order of discovery is forced. `person.ideas` holds
  what one knows; telling passes it on and a death can lose it.
- **Lessons** (`mindmodel.ts`): what experience says goes well, applied as `lessonBias` on the scores.

## Sweeps and baselines

Every change to the mind is measured, not just unit-tested. Unit tests (`apps/editor/tests/eden*.test.ts`, about 400) show a thing
happens; sweeps show nothing else got worse.

- **Life sweep** (`tools/eden/sweep.ts`, `lifelike.ts`): thousands of simulated lives (1 to 4 people, random personalities, gardens,
  scarce food, a fox or a fire). Reports the share of person-time in urgent need (limit 6%), survival, meals and drinks a day, variety,
  and so on. Run with `cd apps/editor && npx tsx ../../tools/eden/sweep.ts <lives> season|year|bigyear`. Seasonal sweep (4,000 lives)
  history: 4.7% before phase A, 5.3% after A (an early 7.1% was caught and fixed), then 4.7%, 4.8%, 4.9% after B, C, D.
- **Big world** (`tools/eden/bigworld.ts`): 60 people, with deer and stags, for years, to see whether a change hurts survival or the
  population at scale. Run with `cd apps/editor && npx tsx ../../tools/eden/bigworld.ts 60 3 1` (people, years, seed). It prints the
  population every half year, deaths by cause and the share of person-time spent desperate or starving.
- **Animation flow** (`tools/eden/animflow.ts`): thousands of situations through the mind-to-motion code, counting gaps (things done
  with no visible motion, pose jumps). A clean run has none.

Baselines recorded for the big world, 60 people over 3 years:

| Build | Result |
|---|---|
| Baseline commit `1c627a1` | everyone survives; desperate 3.05% and 2.87% (two runs) |
| With phases A to D (drives, development and lifecycle, mind model, heart) | everyone survives; desperate 2.46%; 15 births; 800 s to run versus 407 s for the baseline |

So phases A to D lowered the desperate share, produced births the baseline did not, and cost about twice the compute for a three-year run
of 60 people in the sweep tool. (The per-step cost in the page is a separate measure: see `EDEN_PERFORMANCE.md`.) A change that makes
survival or the desperate share worse than these numbers needs a reason written in its changelog.

## What this replaced

The first version (F103's predecessor) ran two characters on a Supabase edge function (`eden-tick`) calling an LLM. That brain was
removed from the game; the Supabase project it used was left alone and its function is not switched off (`EDEN_GAPS.md` section 10).
Nothing in the repository calls it. Older documents that described the minds as "Supabase-brained" were wrong about the shipped game
and have been corrected.

## Where to look

- Gaps still open: `docs/EDEN_GAPS.md`; build checklist: `docs/EDEN_PROGRESS.md`.
- Per-feature history: `docs/changelog/F103.md` to `F141.md` (rows in `docs/IMPLEMENTATION_STATUS.md`).
- Rendering cost with many bodies: `docs/EDEN_PERFORMANCE.md`.
- Tests that pin each module: `edenPsyche`, `edenDevelopment`, `edenLifecycle`, `edenMindmodel`, `edenHeart`, `edenReason`, `edenSolve`,
  `edenCulture`, `edenModules` under `apps/editor/tests/`.
