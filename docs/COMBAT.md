# Hand-to-hand combat (0.78.0)

Give an animated character (Mannequin F, the Talari, or any model on the Quaternius skeleton) a **Melee** component and it fights. The quickest way to see it is **New → Martial-arts dojo**: you against two AI fighters.

## Controls

| Action | Keyboard / mouse | Gamepad |
|---|---|---|
| Light (punches) | J or left click | X |
| Heavy | K or right click | Y |
| Kick | F or L | B |
| Special (uses energy) | Q or U | RB |
| Dodge (roll) | X or Alt | left stick click |
| Block (hold) | R | LT |
| Lock on / off | T or middle click | right stick click |

These are the default **InputActions** bindings (`light`, `heavy`, `kick`, `special`, `dodge`, `block`, `lock`). A scene with its own InputActions needs those seven lines to fight; the defaults show them.

## How a fight works

- **Combos.** Each press starts a move or, if a move is playing, waits in a short buffer and starts the next move in the chain at the current one's *cancel point*. Light: jab → cross → hook → uppercut. Kick: front kick → roundhouse → side kick. Mixing works too: jab, cross, then kick for the roundhouse; heavy after a jab or cross for the launcher.
- **Specials** need energy, which you build by landing hits (shown on the HUD):

  | Input | Move | Cost |
  |---|---|---|
  | Special | Energy blast (a projectile) | 25 |
  | Forward + special | Flying strike (a long armored lunge) | 35 |
  | Back + special | Rising dragon (launches, briefly invulnerable) | 35 |
  | Back, forward + special | Meteor smash (unblockable area slam, a finisher) | 70 |

- **Air and running.** Light or kick in the air (after a jump, or chasing a launched opponent) are air attacks that keep a juggled target up. Light while sprinting is a shoulder-charge dash attack; dodge while sprinting is a slide.
- **Defence.**
  - **Block** (hold) stops blows from the front for a little chip damage, but every block drains the guard bar; when it empties the guard breaks and you're staggered.
  - **Parry**: raise the block just as a blow arrives (the first 0.15 s) and it's parried. No damage, the attacker staggers, and time slows for a moment.
  - **Dodge**: the roll is invulnerable for most of its length. Dodge right as a blow lands and time slows ("perfect dodge"). A dodge can also cut your own move short once its blow has landed.
- **Being hit.** Light hits snap the head or body back; heavy hits stagger. Launchers throw you into the air, and you land, lie for a moment, and get up invulnerable. Knockdowns floor you. **Armored** moves (the power hook, flying strike, meteor smash) keep going through hits.
- **Lock on** (T) faces you toward one opponent, makes the stick strafe around them, and swings the camera behind you so both of you are in view. Without a lock, moves still turn toward the nearest opponent in front of you.
- **Defeat.** A fighter at 0 health plays its death and lies there a few seconds before it's removed.

## What you see and hear

- **Real motion.** Every strike is a recorded or hand-keyed clip, scrubbed in step with the simulation so the blow lands on the frame the hit is dealt.
  - Punches, knees, reactions, rolls and specials come from Quaternius's Universal Animation Library 1 and 2.
  - Front, roundhouse and side kicks and the knife-hand block are CMU motion capture, retargeted onto the same skeleton.
  - Lunges travel the distance the clip's own root motion does.
- **Guard stance**: standing still you hold a boxing guard. Moving, the legs strafe and the guard stays up.
- **Impact**:
  - **Hit-stop**: both fighters freeze for a few hundredths of a second, and the one hit shudders.
  - **Effects**: sparks and a flash where the blow lands, a trail behind the striking limb, a ring for parries and guard breaks, and a shockwave under finishers and falls.
  - **Camera shake**, scaled to the blow.
  - **Slow motion** for parries, perfect dodges, finishers and knockouts.
  - **Sounds**: whooshes, thuds, blocks, the parry ring and body falls.
- **HUD**: your health, energy and guard, a combo counter, and a marker on the locked target.

## The Melee component

| Field | What it does |
|---|---|
| Style | **Martial arts** or **Sword** (built-in move lists), or **Custom** (the Moves text). |
| Moves | The Custom move list (see below). |
| Team | Fighters don't hit their own team. The Player is team 0. |
| AI | A melee brain drives this fighter (not for the Player). It closes in, circles, waits its turn when another fighter is already on you, strings combos, and blocks, parries and dodges. |
| Aggression, Skill, Reaction | How often it attacks; how often it defends and how long its strings run; how quickly it reacts. |
| Energy | Starting energy (0–100). |
| Guard | How much blocked damage the guard soaks before breaking. |

The fighter needs a Health component to be hurt, and a RigidBody and Collider like any character.

## Writing moves

One move per line, `name: key=value ...`; `#` starts a comment.

```
jab: clip=jab input=light dur=0.55 hit=0.10-0.16 cancel=0.2 dmg=6 reach=0.9 lunge=0.25 stun=0.3 limb=hand_l
cross: clip=cross input=light after=jab dur=0.62 hit=0.15-0.22 cancel=0.26 dmg=8 reach=1.0 stun=0.35 limb=hand_r
rising_dragon: clip=rising_strike input=special seq=b dur=0.7 hit=0.1-0.3 dmg=18 launch=10 cost=35 iframes=0-0.15
```

| Key | Meaning |
|---|---|
| `clip` | The animation clip (default: the move's name). |
| `input` | `light`, `heavy`, `kick`, `special` or `dodge`. |
| `after` | Moves this one chains from, joined with `\|`. Add `start` to also allow it from neutral. Without `after`, a move starts from neutral only. |
| `seq` | Stick directions before the press, relative to your facing: up to four of `f`, `b`, `l`, `r` (e.g. `bf`). |
| `air`, `sprint` | Only in the air / only while sprinting. |
| `dur` | Seconds; the clip is stretched to fit. |
| `hit` | The active window, `start-end` seconds. |
| `cancel` | When the next buffered move may start. |
| `dmg`, `reach`, `radius`, `height` | Damage, and the hit sphere: metres ahead, its radius, and its height as a fraction of the body. |
| `aoe` | Hit everything within this radius instead. |
| `knock`, `launch` | Push away and throw up (m/s). |
| `stun`, `stop` | Seconds of hit-stun dealt, and of hit-stop. |
| `lunge` | Metres travelled by the end of the active window. |
| `free` | Travel along the stick, not the facing (dodges). |
| `cost`, `gain`, `cooldown` | Energy spent; energy gained per landed hit; seconds before it can be used again. |
| `iframes` | Invulnerable window, `start-end`. |
| `armor`, `unblockable`, `knockdown`, `finisher` | Flags. |
| `hits` | Hits spread over the active window. |
| `projectile` | Fires an energy blast at this speed at the start of the window. |
| `track` | Degrees it turns toward its target as it starts. |
| `limb` | The bone the trail follows (`hand_l`, `hand_r`, `foot_l`, `foot_r`, `calf_r`, ...). |

Errors name the line, and the fighter falls back to the martial-arts list.

## The clip library

`assets/source/kit/people/combat_clips.glb` holds 55 clips on the Quaternius skeleton. They include strikes, kicks, a guard, a block, strafing, reactions, falls and get-ups, rolls, slides, jumps, the sword sets and specials. The editor loads it only when a scene has a Melee fighter.

`tools/models/import_combat_clips.mjs` rebuilds it from the source packs (see [assets/CREDITS.md](../assets/CREDITS.md)). It prints each clip's length, root-motion travel and strike frame; the default move lists take their timings from that table.

## Scripting

- The `melee` table, on a fighter's own script:
  - `melee.perform(name)`
  - `melee.state()`: mode, combo, energy, energy max, guard
  - `melee.move()`
  - `melee.set_energy(n)`
  - `melee.lock(id)`
  - `melee.target()`
  - `melee.set_ai(on, aggression, skill)`
- `on_melee_hit(target, move, damage, outcome)` fires in the attacker's script. The outcome is `hit`, `blocked`, `parried`, `dodged` or `guard_break`.
- The usual `on_damaged`/`on_death` fire in the target's.

See [SCRIPT_API.md](SCRIPT_API.md).

## Limits

- The feet aren't pinned with IK. Lunges follow each clip's measured root motion, which keeps sliding small but not zero.
- Unarmed kicks come from karate walks, so they have a traditional karate look. The sword style has no sword model yet.
- Hits are spheres against boxes, not limb-accurate.
