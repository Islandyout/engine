# KI STORM: ARENA ASCENDANT

An anime-inspired 3D martial-arts arena fighter built directly on the Islandyout engine's native melee combat, character controller, AI, camera-follow and scene systems.

## The match

You are **Kairo, Stormborn**. Fight two opponents in a lit tournament arena: Ryu, a fast aggressive rival, and Zenith, a high-health boss with a stagger/break bar. Land hits to build ki, defend with timing, and spend that energy on special attacks. The boss has more health and guard, stronger defensive skill, and a longer break recovery.

## Controls

| Action | Input |
|---|---|
| Move | WASD |
| Light combo / punches | J or left mouse |
| Heavy / launcher | K or right mouse |
| Kicks | F or L |
| Ki blast / special | Q or U |
| Dodge / roll | X or Alt |
| Hold guard / attempt a parry | Hold R |
| Lock-on toggle | T or middle mouse |
| Run | Shift |

### Special direction inputs

- **Q**: energy blast (spend ki).
- **W + Q**: flying strike.
- **S + Q**: rising dragon launcher.
- **S, W, then Q**: meteor smash finisher (requires enough ki).

Combos are buffered by the engine. Mix punches, heavies and kicks instead of repeatedly pressing one attack. A well-timed guard can parry; a dodge is the safer answer to unblockable and guard-breaking attacks.

## Built-in engine features used

- Animated martial-arts moves and hit-frame timing.
- Light/heavy/kick combo chains, launchers and air follow-ups.
- Ki-powered projectiles and directional specials.
- Dodge invulnerability, block, parry, guard breaks, stagger and knockdowns.
- AI opponents with different aggression, reaction speed and defensive skill.
- Boss stagger/break tuning, lock-on, follow camera, health/ki/guard HUD.
- 57 authored scene entities for the arena, stands, boundary walls, corner towers, ki pylons, fighter lineup and on-screen control guide.

## Project files

- `game.json` — game-library metadata.
- `scene.json` — complete scene authored for the engine's format 1 loader.

This is a first playable slice built on existing engine systems, not a claim that every future fighting-game feature (local multiplayer, story mode, transformations or cinematic cutscenes) is already implemented.
