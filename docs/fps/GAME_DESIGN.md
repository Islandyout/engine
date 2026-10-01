# LAST SIGNAL — game design document

A single-player, mission-based first-person shooter built entirely on this engine: the scene and every line of game logic are data (one generated scene file and its Lua scripts). No engine code is specific to the game.

- **Play it**: `last-signal.html` next to the editor — `build/site/last-signal.html` after `tools/build_editor.sh`, or `/engine/last-signal.html` on the deployed site. Open `examples/fps/last-signal.json` in the editor to inspect or modify it.
- **Source**:
  - `tools/fps/build_last_signal.ts` generates `examples/fps/last-signal.json`: terrain and its sculpt, the outpost, enemies, UI, prefabs and the director's spawn tables all come from one set of coordinates.
  - `tools/fps/lua/` holds the game logic: `director.lua` (mission, pacing, HUD), `player.lua`, `enemy.lua`, `pickup.lua` and `generator.lua`.
  - Change either and rerun `npm run fps --prefix apps/editor`. A unit test fails if the committed scene is stale.

---

## 1. Research basis

The design borrows deliberately from well-documented practice:

| Source | Takeaway used here |
|---|---|
| Bungie, Jaime Griesemer, "30 seconds of fun" ([interview](https://www.engadget.com/2011-07-14-half-minute-halo-an-interview-with-jaime-griesemer.html)) | Build one tight combat loop (spot, engage, reposition, finish), then vary it with **different spaces, enemy mixes and objectives**, not new mechanics. |
| id Software, "Embracing push forward combat" (GDC 2018; [summary](https://www.gamedeveloper.com/design/how-doom-s-push-forward-design-cured-my-hoarder-syndrome)) | **Enemies drop ammo and health**, so the resources you need are in the fight, not behind you. Aggression is rewarded. Regeneration only covers the first 60 HP, so med kits still matter. |
| Left 4 Dead's AI Director ([overview](https://shacknews.com/article/82787/how-evolve-assures-action-peaks-and-valleys)) | Pace by **intensity**: track how hard the player is being pressed, make room for valleys after peaks, and delay reinforcements while the player is nearly dead. |
| Level Design Book, combat and cover; arena design | **Arena, not corridor**: a central no-man's-land ringed by a "mid-orbital" of cover, several routes into every fight, and flanks for both sides. |
| Readable-AI writing on F.E.A.R. and Halo ([abratabia](https://abratabia.com/game-ai-npc/enemy-ai-patterns.php), [Game Developer](https://www.gamedeveloper.com/design/flanking-and-cover-and-flee-oh-my-)) | Every enemy type has **one clear behavioral identity**, signalled by silhouette and color, so the player reads the fight at a glance. Enemies announce awareness ("?" then "!") before they shoot. |
| Battlefield gunplay notes, "What makes an FPS feel good" ([EA](https://www.ea.com/games/battlefield/battlefield-6/news/bf-combat-gunplay), [StraySpark](https://www.strayspark.studio/blog/fps-game-design-fundamentals-ue5)) | The **fire loop** must feel instant and connected: shot → flash and sound → recoil → hit marker (distinct for headshots and kills) → recovery. Time-to-kill sits in a narrow, learnable band. |

## 2. Pillars

1. **Readable violence.** Every threat is announced (alert markers, tracers, sound), and every hit is confirmed (hit and kill markers, impact effects).
2. **Push forward.** Supplies come from enemies you kill and the ground you take; health only regenerates to 60.
3. **One loop, many contexts.** The same 30-second fight in four different spaces: a ridge approach, a walled yard, a defended uplink, and a run to extraction.
4. **Short and replayable.** About 8–12 minutes per run, three difficulties, and a best time and kill count saved per difficulty.

## 3. Player

| Stat | Value | Why |
|---|---|---|
| Health | 100; regenerates 18/s up to 60 after 4.5 s out of fire | Partial regen keeps runs going; the top 40 comes from med kits |
| Walk / sprint / crouch | 4.6 / 7.6 / 2.3 m/s | Sprint for repositioning; can't fire while sprinting |
| Jump | 1.1 m, coyote 0.12 s, buffer 0.12 s | Mantling crates and catwalk steps |
| Step height | 0.4 m | Curbs and sandbag lips never need a jump |
| FOV | 78° (sprint +6°, aim × weapon zoom) | |

**Loadout**: carbine, sidearm, shotgun, and a launcher with one loaded round. More launcher rounds come only from the first Heavy killed.

| Weapon | Mode | RPM | Damage | Mag / reserve | Spread hip / aim | Headshot | Role |
|---|---|---|---|---|---|---|---|
| Carbine | auto | 640 | 22 (falloff from 45 m) | 30 / 120 | 2.0° / 0.3° | ×2 | Default answer to everything |
| Sidearm | semi | 400 | 30 (falloff from 30 m) | 12 / ∞ | 1.4° / 0.25° | ×2 | Never-empty backup, precise |
| Shotgun | semi, per-shell | 75 | 9 × 12 (falloff 10→45 m, min 20%) | 6 / 18 | 5.5° / 4° | ×2 | Close-range breaching |
| Launcher | semi, projectile | 50 | 140, splash 4.5 m | 1 / 0 (+3 per pickup) | — | — | Heavies, clustered squads |

Ammo crates add 60 carbine and 6 shotgun rounds.

Time to kill at mid range on a 100 HP Rifleman: carbine 5 body / 3 head shots (about 0.4 s of fire), sidearm 4 body / 2 head, shotgun 1–2 close shells. This is short enough to feel lethal and long enough for tracking to matter.

## 4. Enemies

The roster has four roles, each with a distinct silhouette, color and behavior. All are `AICombat` soldiers on team 1 using the Mannequin model with a `Material` tint.

| Role | Look | HP | Weapon | Behavior | Sight / range | Accuracy | Reaction |
|---|---|---|---|---|---|---|---|
| **Rifleman** | olive | 100 | auto rifle, 7 dmg, bursts of 4 | Guard or patrol; holds 16 m and uses cover | 48 m / 16 m | 0.45 | 0.65 s |
| **Rusher** | red | 70 | SMG, 4 dmg, bursts of 5 | Always closes to 5 m; never takes cover | 40 m / 5 m | 0.3 | 0.5 s |
| **Marksman** | blue, on the towers | 70 | DMR, 26 dmg, one shot every ~2.6 s | Guards high ground with long sight and a narrow cone | 75 m / 50 m | 0.82 | 1.4 s |
| **Heavy** | orange, 1.2× bigger | 320 | launcher, 34 dmg, 3.5 m splash, slow rocket | Slow; holds 20 m | 45 m / 20 m | 0.7 | 1.0 s |

Accuracy sets the spread cone, (1 − accuracy) × 7°. The checkpoint guards see only 34 m and react in 0.9 s, so the first fight starts on the player's terms. Reinforcements (`world.spawn` of the Rifleman, Rusher and Heavy prefabs) use the Hunt behavior.

Every enemy drops an ammo crate. A med kit (+45 HP) drops by difficulty chance, always from a Heavy; the first Heavy killed also drops launcher rounds. Pickups are collected by walking over them and despawn after 45 s.

## 5. Mission flow

```
 N (-z) ▲
        │            (EXTRACTION LZ, green smoke)   z = -92
        │                     │ track
        │  T ┌────── NORTH GATE ──────┐            z = -32
        │    │     GEN-C   [WAREHOUSE E]│   T = watchtower (marksman)
        │    │ [WAREHOUSE W]  UPLINK  ▒ │   ▒ = containers, = = sandbags/barriers
        │    │       =   ▒   =    GEN-B │
        │    │ GEN-A    ▒      ▒        │
        │    │ ▒▒   ▒       [SHED]      │
        │    └───── SOUTH GATE ───────┘ T          z = 32
        │       patrol pair outside the wall          z = 40
        │          checkpoint: truck, hut, sandbags   z = 62
        │                 road, wrecks, poles
        │          INSERTION (player)                 z = 108
```

| Phase | Objective (HUD) | Content | Pacing |
|---|---|---|---|
| 0 Briefing | Title card: difficulty, Deploy | Game paused behind the title | — |
| 1 Approach | "Reach the outpost" (marker: south gate) | Checkpoint guards and a road patrol, then a patrol pair outside the south wall | Low → medium |
| 2 Sabotage | "Destroy the generators 0/3" (markers on each) | The yard garrison (riflemen, rushers, a Heavy, two marksmen, a patrol). Each generator (180 HP) explodes into a burning wreck and brings a reinforcement squad (Rifleman + Rusher; + Heavy before the last) | Medium → high peaks; the squad waits 8 s instead of 3 while intensity is high |
| 3 Uplink | "Uploading signal N%" (marker, upload bar) | Stand within 7 m of the console; upload takes 60 s and pauses while you're outside. Waves every 14–18 s; every third has a Heavy | Sustained high; each 25% gives a 6 s valley |
| 4 Extract | "Get to the extraction zone" (marker) | The north gate is blown open; Rushers hunt from the LZ side every 16 s. Reach the LZ to win | Final sprint |

**Fail**: health reaches 0, which brings up the death view and the "MISSION FAILED" panel (Play again). **Win**: the "MISSION COMPLETE" panel shows time, kills, headshots and damage taken, and saves your best time for the difficulty (`save.set`), which the title card lists.

## 6. Difficulty

| | Recruit | Veteran | Elite |
|---|---|---|---|
| Damage taken | ×0.6 | ×1.0 | ×1.35 |
| Reinforcements per squad | −1 | base | +1 |
| Med kit drop chance | 50% | 33% | 20% |

Damage scaling is applied by the player's script in `on_damaged`: it heals back the difference on Recruit and deals the extra on Elite (as script damage with no attacker, which it ignores).

## 7. The director (pacing)

One Lua script on the Director entity runs the state machine and all pacing.

- **Intensity** rises with damage taken (+amount/100), falls by 0.1 per kill and decays at 0.15 per second. While it's above 0.8, uplink waves wait up to 8 s and post-generator squads wait 8 s instead of 3. Below 0.3, the next uplink wave comes after 14 s instead of 18.
- **Spawn points** are the yard's corners, the north gate and outside the south gate (and around the LZ for extraction). The director picks the farthest point the player can't see; a point within 25 m is rejected if a `world.raycast` from the player's eyes reaches it.
- **Alive cap**: 9 spawned enemies at once.
- **Kill feed**: the last three events (kills, generators, pickups), plus a headshot tally from each enemy's `on_damaged(headshot)`.
- **Audio**: `AudioSettings` sets the mix. Generators hum (spatial, Ambient bus) so you can find them by ear, the uplink drones, and phase changes and generator kills play synthesized stingers and explosions.

## 8. Level

- **Terrain**: 260 × 260 m (131² heights), noise height 7. Sculpt offsets generated with the scene flatten the outpost pad, the road, the checkpoint, the start clearing, the north track and the LZ, and raise ridges at the edges (invisible walls stand at their foot). Trees, rocks and bushes are instanced scatter with trunk colliders, kept off the play spaces by `exclude` rectangles.
- **Outpost**: a 64 × 64 m walled square (3.2 m walls) with a south entrance and a north gate that opens for extraction.
  - Inside: two warehouses and a shed (catalog models with box colliders), containers (some stacked, some rotated, as oriented colliders), barriers and sandbags forming the mid-orbital, an open center yard with the uplink, and three generators spread out so each is a separate push.
  - Two watchtowers at opposite corners, each with a marksman.
- **Approach**: a road from the south past wrecks and a checkpoint with flanking tree cover.
- **Lighting**: a late-afternoon procedural sky, a low warm sun, exponential haze and `PostProcessing` (SMAA, AO, bloom, contrast, warm temperature, vignette and grain). Generators glow amber and the uplink cyan; the LZ has green signal smoke and a beacon.

## 9. HUD and UX

- **Engine HUD**: health, ammo, weapon slots, a spread crosshair, hit, headshot and kill markers, damage arcs, a low-health vignette, enemy awareness markers ("?" then "!"), objective waypoints (`ui.marker`), and health bars only over damaged targets within 40 m.
- **Script UI**:
  - objective text (top left) and stats: kills, time, difficulty (top right);
  - phase banner (top center, timed);
  - upload bar (`Bar`);
  - feed (three lines, top right);
  - title card (difficulty `Slider`, Deploy button, controls, best times) and a pause menu (Resume, Restart);
  - fail and win panels with Play again.
- **Controls**: WASD, mouse, Space jump, Shift sprint, C or Ctrl crouch, LMB fire, RMB aim, R reload, 1–4/Q/wheel switch, P pause, Esc releases the mouse. Gamepad works through the default action bindings.

## 10. Test plan

- `tests/browser/last_signal.cjs` serves the game as a player build and checks:
  - the title card (briefing, difficulty, Deploy) with the game paused;
  - Deploy starts the approach objective; P opens the pause menu and Resume closes it;
  - on a trimmed copy of the level (no enemies, one 1 HP generator in front of the player, a 2 s upload, the LZ on the uplink): holding fire destroys the generator, the uplink starts, the upload completes, extraction succeeds, and the win panel shows the stats.
- `apps/editor/tests/lastSignal.test.ts` regenerates the level and fails if `examples/fps/last-signal.json` is stale, validates it through `SceneSerializer`, and checks the mission entities, prefabs and the director's config.

## 11. Engine work the game drove (0.67.0)

- Player builds crashed when a script set UI values in `on_start` (UI state was declared after the player-mode bootstrap started Play).
- Terrains above about 110² heights overflowed the wasm stack (`ccall` copies string arguments onto it); the runtime now has an 8 MB stack.
- Player builds now preload terrain scatter models, so foliage appears.
- Catalog models sit on their collider box instead of floating, characters keep their proportions, prefabs carry a default Scale, scatter takes `exclude` rectangles, and the nav grid covers 260 m.
