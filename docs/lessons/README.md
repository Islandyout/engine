# What the removed games taught the engine

GATEBREAKER (a manhwa action RPG) and VELOCITY (a superhero slice) were removed in F89 so browser tests, CI and merges stay fast
while the engine is reorganised. Git history keeps them: the last commit with both is `3ebed2a` (`git checkout 3ebed2a -- games tools/gatebreaker tools/velocity examples/gatebreaker`).

Nothing the engine learned was removed. The features they needed are general engine features and stay:

| Feature | Where it lives | Changelog |
| --- | --- | --- |
| Manhwa render style (toon ramp, ink lines, rim light, impact frames, speed lines) | `PostProcessing.style`, `manhwa.ts`, `comicFx.ts` | [F79](../changelog/F79.md) |
| Melee: combos, cancels, block/parry, dodge, specials, stagger and Break, mana, locked skills | `Melee` component, `bridge_melee.cpp` | F78, F79, F80 |
| Allied fighters, stats, crits, pooled enemies | `melee.follow`, `melee.tune`, `melee.revive` | F82, F83, F84 |
| Gear shown on a character | `world.wear` | F83 |
| Interface windows, panel cut-scenes, boss bar, area map, quest markers | `hud.system`, `hud.panels`, `hud.boss`, `hud.map_layout`, `hud.map_marker` | F80, F84 |
| Time of day, light budget, out-of-sight respawn | `fx.time_of_day`, `lightPool.ts` | F82, F84 |
| Mouse-free pause menu, comfort settings | `hud.pause_menu`, `playerSettings.ts` | F84 |

## Patterns worth copying

The Lua that ran each game is kept as reference in [`examples/scripts/`](../../examples/scripts):

- `rpg/director.lua`: one script on an entity named `Game` holds the quest step, level and save; everything else sends it messages.
- `rpg/hub.lua`, `rpg/world.lua`: a hub town and Gates (separate rooms) reached by triggers; enemies spawned per room and counted on death.
- `rpg/ledger.lua`: a windowed quest/stat interface built from `hud.system`.
- `rpg/sky.lua`: a day and night cycle that advances `fx.time_of_day`.
- `superhero/director.lua`, `superhero/hero.lua`, `superhero/breakline.lua`: a mission campaign, street incidents, mastery choices and a boss with phases.

## Design notes

- [`rpg-action-game-design.md`](rpg-action-game-design.md): the GATEBREAKER game design (research, pillars, milestones M0 to M4).
- [`superhero-game-plan.md`](superhero-game-plan.md): the VELOCITY plan.

## Lessons that shaped the engine upgrade

1. A feature built for one game leaked into every game: default HUDs, pickup UI and weapon visuals were wired to that game's scenes.
   The upgrade makes components own data and behaviour only, and UI-kit widgets own every pixel.
2. Per-game tools (`tools/gatebreaker/kit.ts`) became load-bearing for unrelated generators. Shared helpers now live in `tools/lib`.
3. Full playthrough tests take tens of minutes. Tests should cover systems, not whole games.
