# Eden build progress (supervisor checklist)

Source: `docs/EDEN_GAPS.md` sections 1-10 (section 11 is the order of work). Boxes are ticked only by the supervisor after reading the
code and tests. Rules for every item (from CLAUDE.md): a unit test that fails on the old code (or a sim measure, or a visible behaviour
in the running game), no silent fallbacks, no test edited to pass, a changelog in `docs/changelog/`, a row in `IMPLEMENTATION_STATUS.md`,
and the life sweep shows no survival regression. "Test" below means `apps/editor/tests/eden*.test.ts`.

## Phase A: drives, neurochemistry, wider emotions (GAPS 1.1, 1.2, 1.3, 1.6, 1.7)

- [x] A1 Drives beyond five needs (safety, belonging, esteem, autonomy, competence, curiosity, meaning, attachment, sex, play, boredom as its own drive). Done means: test sets each drive low and asserts the chosen action changes versus the old five-need scorer; boredom no longer only a `joy` need.
- [x] A2 Neurochemistry variables (dopamine, serotonin, oxytocin, cortisol, endorphin, noradrenaline, sex hormones, melatonin) with production and decay. Done means: test per chemical showing its trigger raises it and it decays; choice weights read them (test fails when chemistry is zeroed).
- [x] A3 Receptor sensitivity, tolerance, withdrawal, addiction. Done means: test where repeated reward lowers its effect and removal causes a measurable deficit state.
- [x] A4 Chronic stress, depression and anxiety as persistent states that bias choice. Done means: test of sustained cortisol producing a state that lasts after the cause ends and lowers action scores; recovery path tested.
- [ ] A5 Emotions beyond six: love, loneliness, jealousy, envy, guilt, disgust, contempt, hope, despair, awe, surprise, nostalgia, longing, boredom, regret, relief, humour, empathy, plus blends. Done means: one test per emotion with a named trigger, and a blend test (two emotions give a distinct label).
- [ ] A6 Habit and unconscious layer: habits that run without deciding, triggering traumas, conditioned fears and likes, biases, mood-coloured memory. Done means: tests for habit formation (repeat then automatic), a trauma cue firing fear, and mood changing recall.
- [x] A7 Memory: cue-triggered episodic recall, forgetting curve, distortion, emotional tagging, dreams and sleep consolidation. Done means: tests for decay over time, vivid versus dull by emotion, cue recall, and consolidation after sleep.
- [x] A8 Life story that changes with age (not a string written once at birth). Done means: test that `story` differs after major events and at later ages.
- [ ] A9 Sweep: 60-person long run, survival and population no worse than baseline in the notes. Done means: sweep numbers written in the F-changelog beside the pre-change baseline.

## Phase B: life stages and development (GAPS 2)

- [ ] B1 Infancy 0-2: attachment style from care history, crying and soothing, breastfeeding and weaning, first words, first steps, stranger fear, object permanence. Done means: tests for each; neglected baby gets insecure attachment versus held baby secure.
- [ ] B2 Early childhood 2-6: vocabulary grows from speech heard, imitation, pretend play, tantrums, rule correction, fear of dark, imaginary friend, first "mine". Done means: test that a child never spoken to has a smaller vocabulary; others each observable in state.
- [ ] B3 Middle childhood 6-12: apprenticeship by watching, peer groups, play fights, fairness protest, first shame, sibling rivalry, chores, stories and customs, understanding of death. Done means: a test or measure per behaviour.
- [ ] B4 Adolescence 12-19: puberty hormones and growth, identity, rebellion, peer status, first romance and heartbreak, risk-taking, doubting beliefs, independence while dependent. Done means: tests for hormone rise at age, rebellion lowering obedience to parents, risk-taking rising.
- [ ] B5 Young adulthood 20-35: partner and work choice, courtship, pair bonding, pregnancy and birth risk for both, parenthood, leaving parents, ambition. Done means: sim shows pairs forming and leaving home; birth risk test for mother and child.
- [ ] B6 Middle age 35-60: generativity (mentoring), care of children and ageing parents, status peak or loss, midlife doubt, wealth or debt, deaths of peers. Done means: tests/measures for each.
- [ ] B7 Old age 60+: slowing, illness, loss of strength/sight/memory, dependence, honour or neglect, storytelling keeper of knowledge, facing death, legacy, grief, retirement, elder care as duty or burden, wisdom, dementia. Done means: tests for each; an elder is cared for or neglected depending on norms.
- [x] B8 Sensitive periods and critical windows (unspoken-to child does not learn speech; unheld child does not bond). Done means: test that the window closes and the deficit persists.
- [ ] B9 Women's and men's lives: breastfeeding, menstrual cycle effects, postpartum states, parenting roles, division of labour and status. Done means: tests for cycle effect and postpartum state.
- [x] B10 Family structure: siblings relation, recognised pairing with obligations, widowhood, remarriage, adoption, orphans' fate, step-families, extended kin and clan, inheritance rules, incest avoidance. Done means: tests for each, incl. incest avoidance over a long run.

## Phase C: self, theory of mind, inner conflict, lying (GAPS 1.4, 1.5, 1.8)

- [ ] C1 Self-model: self-image, self-esteem, identity, ideals, fairness about oneself, reflection on own choices. Done means: test that a failure lowers esteem and changes later choices.
- [ ] C2 Theory of mind: model of what others know, want, believe, feel. Done means: test that a person acts on a belief about another's belief that differs from fact.
- [ ] C3 Lying, deception, bluffing, flattery, persuasion by interest, secrets, reputation management, surprise gifts, being fooled. Done means: a test per behaviour; a lie is detected or not depending on the listener's model.
- [ ] C4 Inner conflict: competing motives held at once (duty vs desire, fear vs pride, loyalty vs fairness), not best score plus noise. Done means: test with two strong motives producing hesitation/ambivalence and a logged reason.
- [ ] C5 Temptation, self-control, rationalisation, guilt after acting against values, habit addiction, acting against own interest. Done means: tests for each, guilt visible in state.
- [ ] C6 Double standards, hypocrisy, kind to one and cruel to another for reasons. Done means: test where same act is judged differently by relation, with the stated reason.
- [ ] C7 Reflection beyond fixed "lessons". Done means: test that lessons are derived from experience, not a fixed list.

## Phase D: love, pain, joy, meaning (GAPS 3)

- [ ] D1 Love: infatuation then attachment, desire, jealousy, fidelity and betrayal, heartbreak and long grief, parental love and sacrifice, costly friendship, unrequited love, love turning to hatred. Done means: a test per arc.
- [ ] D2 Pain: pain as signal shaping behaviour, chronic pain, fear of pain, helplessness at another's pain, pain of loss, shame, humiliation, isolation, abuse and after-effects. Done means: tests that pain changes choices and persists.
- [ ] D3 Joy: from meaning, achievement after hardship, belonging, shared laughter, celebration, rites, music, dance, adult play, beauty, generosity. Done means: tests/measure for each source raising joy.
- [ ] D4 Meaning: purpose organising a life, crises of meaning, giving life for something, legacy, vocation, search for answers, religion and ritual as consolation, burying the dead. Done means: tests incl. a person choosing risk to death for a held purpose; burial with a reason in state.

## Phase E: ownership, economy, money, markets, investment (GAPS 5)

- [ ] E1 Ownership and property (field, tool, house, catch), theft as crime against someone, borders, land inheritance. Done means: test theft raises a grievance with the owner; objects carry an owner.
- [ ] E2 Scarcity, surplus, specialisation, comparative advantage, dependence on others' work, crafts/guilds, tools raising output. Done means: sim shows people living off a speciality and trading surplus.
- [ ] E3 Trade beyond swaps: distant partners, caravans/boats, markets/fairs, prices moving with supply and demand, haggling, trust networks, middlemen, storage and spoilage. Done means: price series test moves with supply; spoilage test.
- [ ] E4 Money: medium of exchange, store of value, unit of account, coinage, debt with interest, credit, ledger, tax or tribute. Done means: test that a good becomes money and debt accrues interest.
- [ ] E5 Capital and investment: saving, seed not eaten, improvements for later return, shares in a venture, lending, insurance (granary/clan), speculation, bubbles/crashes, compounding inequality, poverty traps, class. Done means: tests/measures incl. a Gini rise in a long run.
- [ ] E6 Work and labour: wages, employment, slavery, workers versus commanders. Done means: test wage payment and a command relationship.
- [ ] E7 Enabling institutions: property law, contracts, weights and measures, writing used for accounts, reputation, enforcement. Done means: counting/writing discoveries used by an account ledger in a test.

## Phase F: education and flow of knowledge (GAPS 6)

- [ ] F1 Structured teaching: apprenticeship with master, initiation, schools, curriculum, tests, reputations for knowing. Done means: test that a pupil gains skill faster with a master, and teacher pays a cost.
- [ ] F2 Oral tradition and distortion: stories change in retelling, songs as memory aids, proverbs, myths carrying rules. Done means: test that a retold story drifts; a rule survives longer in a song.
- [ ] F3 Access to knowledge: gender/class/guild limits, literacy as power, libraries, censorship, collapse loss, travel/trade carrying knowledge, scholars, book copying. Done means: test per restriction.
- [ ] F4 Learning from failure and others' failure; teacher errors passed on; false beliefs that spread and persist. Done means: test that a false belief spreads and persists until contradicted; belief update tested.
- [ ] F5 Curiosity stronger in the young; language learned and changing. Done means: curiosity by age measure; test of vocabulary drift across generations.

## Phase G: society: leaders, law, rites, festivals, religion (GAPS 7)

- [ ] G1 Leaders and followers, status hierarchy, councils, chiefs, inherited rank. Done means: leader emerges in sim from status; succession test.
- [ ] G2 Laws and judging, taboos. Done means: test that a norm becomes a law with a judge who rules on a case.
- [ ] G3 Rites of passage, marriage customs, funerals with meaning, festivals. Done means: rite occurs at age/event; festival on calendar in the running game.
- [ ] G4 Feuds between families, alliances. Done means: test of feud inheritance and an alliance forming.
- [ ] G5 Religion as institution: priests, conflicts. Done means: test of a priest role and a schism over a tenet.
- [ ] G6 Splitting of the group, founder effects, cultural drift (customs, languages). Done means: two groups diverge in a long-run measure.

## Phase H: violence, cruelty, consequences, justice (GAPS 4)

- [ ] H1 Fights, injury and killing of people, murder, execution, war between groups, raids, revenge and feuds. Done means: tests that a fight injures, a killing creates a revenge motive; war between groups in sim.
- [ ] H2 Bullying, abuse of children, coercion, slavery/exploitation (rape: modelled soberly or explicitly left out, with the decision stated in the doc). Done means: tests for each included item; omission documented.
- [ ] H3 Greed, hoarding, cheating, fraud, bribery, betrayal, informing, scapegoating, mob behaviour, tribalism, prejudice, propaganda. Done means: a test per item.
- [ ] H4 Causes: scarcity, fear, status, honour, resource guarding, in-group loyalty, desperation, power; same person tender and cruel. Done means: each act logs its cause; test of scarcity raising theft/violence.
- [ ] H5 Consequences: shame/honour cultures, law, judges, punishment, exile, forgiveness, reconciliation, restitution, prisons, lifelong guilt, vengeance cycles ending. Done means: tests incl. a vengeance cycle that ends via restitution.

## Phase I: wider world, body and ageing (GAPS 7 world part, 9)

- [ ] I1 Other settlements: trade, war, migration. Done means: a second settlement in sim; migrants arrive/leave; test of trade and conflict.
- [ ] I2 Geography (rivers, mountains, coast), long climate change, epidemics across settlements, resource depletion causing collapse, fire as danger to camp, domestic animals beyond the dog. Done means: a test or sweep per item.
- [ ] I3 Body: real growth curve (height, strength), menarche/menopause, senses ageing, disability, lasting scars, fitness, sleep debt, hygiene, pregnancy complications, sexual health. Done means: test per item.
- [ ] I4 Presentation: faces and blinks, lying-down clip, swimming and rowing used, music beyond generated tune, lighting, visible wear/dirt verified, editable look. Done means: screenshot of each in the running game.
- [ ] I5 Creator's Walker: body customisation, needs, ageing, consequences of actions on people. Done means: tests and a screenshot.

## Phase J: thinking and problem solving (GAPS 8, plus objects in 10)

- [ ] J1 General cause-and-effect learning beyond the one fire/wolves rule; analogies; teaching how to solve; belief revision on being wrong. Done means: test that a second, different cause is learned from experience; a wrong belief is updated.
- [ ] J2 Shared long plans by many; planning over years; risk assessment of unfamiliar things. Done means: multi-person plan completing across seasons in a sim test.
- [ ] J3 Large invention space (far more than three) and tool chains (pot, loom, kiln, bow). Done means: test that an invention requires a prior one; count of inventions reported.
- [ ] J4 Agriculture as a revolution, domestication, metals, wheels. Done means: sim shows food surplus shift after farming; tame animal test.
- [ ] J5 Boats and bridges that people actually use. Done means: a person crosses by bridge and rows a boat in a test and in the running game.
- [ ] J6 Objects from `EDEN_THINGS.md`: cooking, pots, ovens, boats, bridges, play objects, farm works, animal companions. Done means: each built and used by a mind action in a test.

## Phase K: build gaps (GAPS 10)

- [ ] K1 Everything listed as "never seen in the running game" (rowboat, birds, fish, snow, music, belly/dirt/limp, journal and pack screens, people form, mic button, pad buttons, plan/party, model planner) seen in screenshots from the running game. Done means: screenshots committed or linked in a changelog.
- [ ] K2 Ollama run against the code (voice, chat, planner, rewording). Done means: a recorded real run, with failures surfaced loudly.
- [ ] K3 Eden browser test of its own (`tests/browser/eden*.cjs`) wired into CI. Done means: it runs and passes in CI; CI actions pinned to SHA.
- [ ] K4 Performance with many bodies rendering measured. Done means: frame-time numbers at 60 people in a doc.
- [ ] K5 Docs: single design document for the mind; older Supabase-era docs corrected; IMPLEMENTATION_STATUS rows and changelogs for every phase. Done means: files exist and match the code.
- [ ] K6 Old Supabase `eden-tick` function switched off or the decision recorded (needs user consent). Done means: confirmed state recorded.
- [ ] K7 Stray branch `eden-takeover` deleted or reported to the user. Done means: branch list shows it gone, or the refusal is reported.
- [ ] K8 Superseded installers (10-14) marked superseded in docs. Done means: doc note present.
