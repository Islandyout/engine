# GATEBREAKER — game design (draft 1)

An original, single-player hunter action game in the style of Korean webtoons
(manhwa). It is inspired by the "weakest hunter who levels alone" genre, but its
names, lore and characters are our own. Working title; see **Decisions for you**
at the end.

## 1. The rules every feature must pass

1. **It has a job.** Every mechanic either makes a fight more readable, makes
   growth visible, or makes a choice matter. If we can't say which in one line,
   it's cut.
2. **One button, one meaning.** No input means two things in the same context.
3. **Learnable in the game.** Each mechanic is taught in a safe room before a
   fight depends on it, and never through a wall of text.
4. **60 fps, really.** A frame takes 16.6 ms or less on the reference machine
   (see §9), measured every milestone. No feature ships that breaks the budget.
5. **Looks like a panel.** Every milestone is screenshot-reviewed against the
   style targets in §7. Anything that looks off gets researched and fixed.
6. **No known bugs at a milestone.** Every mechanic has an automated test.
   Every milestone ends with a scripted full playthrough with zero console
   errors.

## 2. The pitch

Gates (rifts to monster dungeons) open over a modern Korean city. You are
**Han Seo-jin**, the weakest licensed hunter, an E-rank. Inside a double gate
that should have killed you, something called **the Ledger** binds itself to you.
It is a blue system window only you can see, and it issues **Quests**. Complete
them and you grow. Fail them and you're punished.

The fantasy has three parts:

- **Start weak**: an E-rank who barely survives.
- **Grow visibly**: a new rank, a new skill, a new weapon, faster and stronger.
- **Become the strongest**: stand where S-rank hunters fall.

## 3. Pillars

| Pillar | What it means in practice |
|---|---|
| **Every hit lands** | Hit-stop, ink impact frames, sound and camera on every blow. Combat is fast but readable. |
| **Read the fight** | Every enemy attack has a clear tell. Skill means reading tells and answering them: dodge, parry or punish. |
| **Visible growth** | Numbers go up, *and* you can see it: new moves, auras, faster animations, enemies that once took 20 hits take 3. |
| **A living manhwa** | Ink lines, flat bold shading, glowing blue system UI, speed lines, panel-framed story beats. |

## 4. The core loop

```
Hub (the Hunter Association, your apartment)
  → take a Gate (its rank shows its danger and reward)
    → fight through 3–5 rooms → a boss
      → rewards: XP, gold, materials, sometimes a skill or weapon
  → spend: stat points, skills, weapon upgrades
  → the Ledger's Daily Quest and story Quests point you to the next Gate
```

A run lasts 8–15 minutes, so each sitting gives at least one complete
loop: in, fight, grow, out.

## 5. Mechanics, each with its job

### 5.1 Controls (keyboard + mouse; gamepad equal)

| Input | Action | Why it exists |
|---|---|---|
| WASD / left stick | Move | — |
| Mouse / right stick | Camera | — |
| **LMB** / X | **Attack**: a 4-hit combo; hold = charged finisher | The main verb: mash for combos, hold for a commitment. |
| **RMB** / Y | **Heavy**: a guard-breaker, slower and armored | Answers blocking enemies and creates openings. |
| **Space** / A | **Dodge**: i-frames; just before a hit = **Perfect Dodge** | The core defence. Rewards reading tells. |
| **Shift** / LB | **Block** (hold); tap just before a hit = **Parry** | A second defence for attacks too fast to dodge. Blocking drains guard. |
| **Q / E / R** / RB + face buttons | **Skills 1–3** (mana) | Build-defining choices; cooldowns pace the fight. |
| **F** / RB + LB | **Ultimate** (a full gauge) | The power-fantasy moment, earned by fighting well. |
| **Tab** / R3 | **Lock on** | Keeps one target in frame in crowds. |
| **G** / B | Interact / **Bind shadow** (M3) | One context button, prompted on screen. |

- **No jump.** In a melee brawler it adds little, it creates air-camera bugs and
  it takes a key. Height comes from launchers instead.
- **No separate kick button.** Kicks are woven into the attack and heavy
  chains, so they're part of every combo instead of a button to remember.
- This replaces the engine's general fighting-game mapping with a tighter
  action-game one.

### 5.2 Fighting

- **Combo**: four light attacks, with a different finisher depending on when
  you press heavy (after 1, 2, 3 or 4 hits). That's 4 routes to learn, not 40.
- **Perfect Dodge** dodges in the last 0.15 s before a hit:
  - time slows for 1.5 s;
  - you get a free **Shadow Step**, a teleport-strike behind the attacker
    (press Attack).
  - Job: the skill expression that turns defence into offence.
- **Parry** means tapping block in the last 0.12 s before a hit:
  - the attacker staggers and you gain ultimate gauge;
  - heavy and red attacks can't be parried. Dodge those.
  - Job: answers fast attacks and rewards rhythm.
- **Guard** drains as you block; when it empties you're staggered. Job: blocking
  can't replace dodging.
- **Stagger bars on elites and bosses** fill as you hit them; when full the
  enemy falls for a **Break** with bonus damage.
  - Job: gives a big fight a mid-goal, so it's not "chip 10 000 HP".
- **Enemy tells**: every attack has a pose and a weapon glint, plus a ground
  decal for area attacks. **Red flash means unblockable** (dodge).
  - Job: makes every hit you take your fault, which makes the game fair.
- **Ink impact frames**: on finishers, Breaks and kills, a 2–3 frame flat-ink
  freeze with speed lines and an onomatopoeia (쾅!, 슉!).
  - Job: marks the moments that matter and sells the manhwa look.

### 5.3 Growth

| System | Its job |
|---|---|
| **Level and 5 stat points per level**: STR (damage), AGI (attack speed, dodge distance), VIT (health), INT (mana, skill power), SEN (crit, Perfect Dodge window +ms) | Tangible choices: a SEN build is a dodge-counter build, a STR build hits hard and slow. |
| **Hunter rank** E→D→C→B→A→S, earned by clearing a rank-test Gate | The headline progress, with a ceremony scene each time. Opens new Gates. |
| **Skills**: about 10 in total, choose 3 to equip | Build identity. Each solves a problem: crowd (sweep), mobility (dash), a single target (pierce), defence (counter stance). |
| **Weapons**: daggers (fast), greatsword (slow, armored), gauntlets (combo-heavy) | Each changes how combos feel, not just a damage number. |
| **The Ledger's Daily Quest** (100 push-ups' worth of in-game training: a short timed drill) | A warm-up that teaches the controls and gives a small stat point. It can be skipped, at the cost of a penalty dungeon. |

### 5.4 Shadows (milestone M3)

- Defeated elites and bosses can be **bound** (hold G over the body).
- Up to 3 shadows follow you; each has one role: tank, striker or archer.
- Commands: none; the shadows act on their own. A shadow's ultimate fires when
  yours does.
- Job: the late-game power fantasy, and it's a reward for beating hard enemies,
  not a menu to manage.

### 5.5 Gates

- **E–D Gates**: a cave and a subway tunnel; goblins, wolves and insects. They
  teach the basics.
- **C–B Gates**: a flooded temple and an ice fortress; armored knights,
  casters and spiders. They teach parry, Break and crowd skills.
- **A–S Gates**: a demon castle and a red-sky ruin; elite packs and multi-phase
  bosses.
- **Double Gate** (the story opener and the finale): puzzle rooms with statue
  rules.
- Each room shows its enemies before it closes. No ambush that you couldn't
  read.

## 6. The first playable target: the vertical slice (M1)

A single E-rank Gate, polished to the final bar:

1. **The opening**: the Double Gate prologue as a panel-style intro (3–4
   comic-paneled shots), then the Ledger awakens.
2. **The tutorial room**: move, attack, dodge, Perfect Dodge, taught against
   a training construct.
3. **Rooms 1–3**: goblin packs (a grunt, an archer, a shield-bearer that teaches
   Heavy).
4. **Boss**: the Goblin Chieftain, with 2 phases, a stagger bar and red
   unblockable slams.
5. **Rewards screen**: in the Ledger's style; level up, 5 stat points, the first
   skill (Shadow Step dash).

The slice is done when:

- it runs at 60 fps;
- a scripted test plays it start to finish with zero errors;
- the screenshot review against §7 passes;
- someone who has never played can finish it without being told the controls.

## 7. The look: "straight out of a manhwa panel"

| Element | How |
|---|---|
| **Ink outlines** | Inverted-hull outlines on characters (thickness by distance), and depth- and normal-edge ink in post for the world. |
| **Flat, bold shading** | Toon ramp: 3 tones per material, a hard terminator, hue-shifted shadows (cool blue or purple, never grey). |
| **Rim light** | A strong cool rim on characters so they read against dark dungeons. |
| **Auras and system blue** | Emissive and bloom for skills and the Ledger UI (#3ec7ff). Power is purple-black for the hero's shadow abilities. |
| **Impact frames** | A full-screen ink pass for 2–3 frames: flat black and white with a red accent, radial speed lines and SFX text. |
| **Speed lines** | Screen-space lines during dashes, Shadow Step and lock-on rushes. |
| **Story panels** | Dialogue and cutscenes as comic panels (frames, gutters, tilted borders, Korean SFX lettering), not floating subtitles. |
| **Lighting** | Few lights with strong direction. Dungeons are dark with pools of light and fog, and the colour script is set per Gate. |

**Screenshot review**: each milestone captures a fixed set of shots (hub,
combat, Perfect Dodge, Break, boss, UI). They're compared side by side with
reference panels from published manhwa, kept privately for study, never shipped.
Each gap is written down, researched and fixed, then re-shot.

**Characters**:

- The hero and hunters are Quaternius's CC0 *Universal Base Characters* with
  modular outfits (the same skeleton as the combat clips).
- Faces are stylized with ink lines and flat colour.
- Monsters come from CC0 kits (goblins, wolves, insects, knights). Gaps are
  modelled in-house in Blender.

## 8. Engine work this needs (beyond 0.78)

| Work | For | Milestone |
|---|---|---|
| Toon ramp material, inverted-hull outlines, edge-ink post pass | The look | M0 |
| Impact-frame pass, speed lines, SFX text sprites | The look, hit feel | M0 |
| Fixed action-game input map (no jump, Space to dodge, Shift to block, Q/E/R skills, F ultimate) as a Melee profile | Controls | M0 |
| Perfect Dodge → Shadow Step counter, parry tap timing, stagger and Break bars | Fighting | M1 |
| Enemy attack telegraphs (glint, ground decals, red unblockable flash) driven by move data | Read the fight | M1 |
| Skills and ultimate (mana, cooldowns, gauge) on top of Melee specials | Fighting | M1 |
| Weapon models in the hand and weapon-specific move sets (daggers first) | Fighting | M1 |
| Ledger UI: system windows, quests, level-up, stats, rewards | Growth | M1–M2 |
| Rooms that seal and spawn waves, Gate run flow, a boss arena with phases | Gates | M1 |
| Hub scene, saves (stats, skills, rank, gear) | Growth | M2 |
| Shadow binding and allied melee AI | Shadows | M3 |
| Panel cutscene player | Story | M2 |

## 9. Quality bars

- **Reference machine**: a mid-range laptop GPU (GTX 1650 / Iris Xe class) in
  Chrome at 1080p. The target is 60 fps at the 1st percentile frame, not the
  average.
- **Budgets per frame**:

  | Area | Budget |
  |---|---|
  | Simulation | ≤ 3 ms |
  | Draw calls | ≤ 400 |
  | Visible triangles | ≤ 1.5 M |
  | Post-processing | ≤ 4 ms |
  | Enemies in a fight | ≤ 12 |

  Profiled with the Stats overlay at every milestone.
- **Tests**: unit tests for every mechanic (as melee has now), and bridge tests
  for each enemy and boss behaviour. A scripted browser playthrough per Gate
  fails on any console error, a frame over 33 ms, or a softlock.
- **Feel**: hit-stop, input buffer and cancel windows are tuned against
  recorded play. The first input must respond within 1 frame.
- **Accessibility**: rebindable keys, a hold-to-toggle option, screen shake and
  flash intensity sliders, and colour-blind-safe telegraphs (shape as well as
  colour).

## 10. Milestones

| | Goal | Done when |
|---|---|---|
| **M0** Look + feel test | A style test scene: one hero against a goblin in a lit dungeon room, with the full manhwa render and the new controls | The screenshot review passes; 60 fps; input feels instant |
| **M1** Vertical slice | §6 | §6 checklist (done in 0.80.0) |
| **M2** The loop | Hub, saves, the Ledger quests, 3 E–D Gates, rank-up | A 1-hour session plays end to end (done in 0.82.0) |
| **M3** Shadows | Bind, 3 shadow roles, C–B Gates | Shadows help without being managed |
| **M4** Content | A–S Gates, all weapons and skills | Full progression E→S |
| **M5** Finale and polish | The Double Gate finale, story panels, balance, performance and bug pass | Zero known bugs, 60 fps throughout |

## 11. Decisions for you

1. **Title and setting**: keep *GATEBREAKER*, modern Seoul and the hero *Han
   Seo-jin* (male), or change any of these?
2. **The hero's starting weapon**: twin daggers (fast and agile, the genre
   classic), or bare fists (pure martial arts, matching 0.78)?
3. **Gamepad**: equal priority (as planned), or keyboard first?
4. **Korean SFX lettering** in impact frames (쾅, 슉) or English (BOOM, SHK)?
5. **Start**: M0, the look and feel test, is the proposed next step.
