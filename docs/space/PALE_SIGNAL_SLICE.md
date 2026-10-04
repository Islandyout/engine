# Pale Signal on this engine

[Pale Signal](https://github.com/Islandyout/pale-signal) is a planetary exploration, xenoarchaeology and spaceflight game. Its signature promise: the player physically flies the same vessel from the surface, through the atmosphere, into space, and back down somewhere else, with no travel cutscenes. Engine version 0.71.0 adds what that needs, and this slice proves it end to end. The engine work is documented in [F71](../IMPLEMENTATION_STATUS.md).

- **Play it**: `pale-signal.html` next to the editor (`build/site/pale-signal.html` after `tools/build_editor.sh`, `/engine/pale-signal.html` deployed).
- **Source**: `tools/space/pale_data.ts` holds the prototype's tables; `tools/space/build_pale_signal.ts` generates `examples/space/pale-signal.json`; the game logic is `tools/space/lua/director.lua`. Rerun with `npm run space --prefix apps/editor`.
- **In the editor**: Games → Pale Signal → Edit opens the scene; Play runs it.

## 1. What Pale Signal asks of an engine

| Pale Signal requirement (project brief, Vertical Slice 2.0, Godot migration plan) | Engine answer (0.71.0 onward) |
|---|---|
| Manual, seamless surface → atmosphere → space → landing; no scene swaps | One `SpaceSystem`: bodies on rails and a ship integrated in double precision across the whole system, rendered in a system pass behind the scene |
| Flight ownership states: manual / stabilized / NAV | `Assist`: `manual`, `stabilized` (levels to the horizon near a surface, belly thrusters hold a commanded climb/sink rate), `prograde`, `retrograde`, `target` |
| Camera look must not secretly steer the ship | The chase camera follows the ship's attitude with a lag; mouse drag looks around and recentres. Nothing feeds back into the controls |
| Landing radar, contact and touchdown feedback | Touchdown judged on sink rate, drift, tilt and slope (clean or rough, with hull damage); landing guidance under 150 m; dust, belly-thruster glow |
| Atmosphere with drag, heating, aerodynamic authority | Exponential air density per body; drag, velocity turning toward the nose, heating and hull damage over a tolerance; plasma glow |
| Orbits, spheres of influence, travel between worlds | Circular orbits on rails with moons; sphere-of-influence handover; orbit elements (periapsis, apoapsis, period); predicted path; NAV target to a body; time warp while coasting |
| EVA on planets, interaction reach, inhabitants and sites | The *site frame*: authored entities sit around a point on a body's surface (+y up), so characters, physics, nav, AI and scripts work unchanged on curved ground; E boards and leaves the ship |
| Data-driven content (system, sites, landmarks) | `SpaceSystem.bodies` and `.landmarks` are text; `Spaceship` tuning is a component; the whole slice is generated |
| Distinct audio for atmosphere and vacuum | The engine note is filtered by air density: full in air, only what carries through the hull in vacuum |

## 2. The game (0.73.0)

The loop follows the prototype: **scan to learn, gather to fly, fly to reach what you've learned about**. Engine 0.73.0 ([F73](../IMPLEMENTATION_STATUS.md)) brings the whole prototype expedition across.

### The expedition

1. **Kestra Station, Tethys**: you start in the cockpit on the pad. E steps out onto the planet; the suit runs on its O2 reserve.
2. **Verify the air**: look straight up into open sky and hold F. Tethys is breathable, so the suit switches to ambient intake, and Kestra's radio traffic resolves.
3. **Survey Kestra**: talk to a Talari in Kestra Reach (E), and scan the black foundation at **Old Vey Gate** (hold F). First contact starts the language model and shares public routes to Darsa Delta and Meridian Spur.
4. **Fuel**: gather 12 volatiles from volatile ice, Clathrate Pockets or market trades, then refine them at the ship (I).
5. **Orbit**: lift off, climb out of the 21.6 km atmosphere and make orbit.
6. **Vell**: on the System Board (TAB), target Vell and engage the autopilot (G). Land near the **Under-Ice Relay** and scan it: the first of seven **signal fragments** that answer each other.
7. **The fragments**: the Kneeling Array and Reed Sink on Tethys, the Anvil on Cinder, the Ossuary Spine and the Silent Foundry on Ossuary, and the Drowned Choir on Hollow.
8. **Nemesis**: all seven fragments reveal a hidden, unlit world beyond Hollow. Fly there and scan THE PALE SIGNAL. The ending reports play time, worlds visited, species, evidence and fragments.

The expedition **autosaves** every 45 s and checkpoints on discoveries; the title offers CONTINUE, and NEW EXPEDITION asks for confirmation before erasing a save.

### Surviving on foot

- **O2 reserve**: 180 s, longer with Life Support. It drains wherever the air isn't verified breathable.
- **Suit integrity**: each world's hazard wears the suit (thermal on Cinder, cryo on Vell and Nemesis, toxic on Ossuary, pressure on Hollow). Boarding patches it.
- **Vitals**: fall when integrity or oxygen runs out. At zero, the recovery tether pulls you aboard and a quarter of carried samples are lost.
- **Return margin**: distance back to the ship against the oxygen left, with a point-of-no-return warning.
- **The helmet** (H) comes off only in verified breathable air.
- **One interaction prompt** (E), by priority: people, stations, artifacts, a catalogued specimen to harvest, then the ship.

### Resources and the ship

- **Scanning identifies; E harvests**. A specimen's first scan pays research and some of its resource: ore, biomass or volatiles. After that, E on a catalogued specimen takes it out of the world for more. R prospects for fuel, ore or biomass and marks the nearest deposit.
- **Ship services** (I, landed at the ship):
  - refine 6 volatiles into 12 fuel;
  - analyse samples for research points;
  - repair the hull;
  - service the components.
- **Components**: engine, RCS, gear and scanner wear from rough landings, overheating and hard turns, and their condition scales thrust, turning, landing tolerance and scan speed. B releases the one-time emergency reserve below 35% fuel.
- **The System Board** (TAB) plans each route as OK, MARGINAL or INSUFFICIENT and marks the recommended next world. The autopilot climbs, burns, coasts under time warp and brakes above the target; touching any control hands it back.
- **Research points** buy the prototype's seven upgrades (U), including Survey Optics, which extends scan range and enables prospecting for uncatalogued signatures. Completing a world's catalogue pays 45 RP.

### Civilization

- **Kestra Reach** has 16 named Talari on daily routines between home, work and market, its Reed Market, the **Meridian House** research annex (an interior with a warm vestibule) and **Old Vey Gate**.
- **Elsewhere on Tethys**: **Darsa Delta** and **Meridian Spur**, each a `Site` with its own people and a marked landing field.
- **Ossuary**: two archaeology sites, **Civic Archive Nine** and the **Retreat Causeway**.
- **Hollow**: the Resonant Clades' **Third Mooring** and its Resonance Exchange.
- **Evidence and language**: 16 evidence items across five eras, and three historical investigations. Talari, Ossuary and Clade-resonance language models translate speech as they grow.
- **Reputation** with the Concord, Commons, Meridian, Preservation and the Clades. It moves with landings (fields, not houses), conversations, evidence and the protected burial mask: document it in place, or take it.
- **Panels**:
  - Y opens the culture record;
  - stations offer workshop repairs, trades and archive sessions.

### The worlds (0.74.0)

- **Turning worlds**: Tethys turns every 1200 s (a solar day of about 969 s), Cinder every 1800 s, Ossuary every 2400 s and Hollow every 3000 s, so the sun rises and sets over Kestra; Vell keeps one face to Tethys. Kestra's people follow its solar clock.
- **Terrain**: craters on Vell, Nemesis, Cinder and Ossuary, glowing lava rifts on Cinder and dune fields on Ossuary.
- **Landing**: below 400 m a radar tape shows radar altitude, sink rate, ground slope, drift and water, with a SAFE / UNSAFE call against the gear's limits. Landing or hovering over water throws spray.
- **The Talari** have their own model: narrow-torsoed and crested, in tunic and mantle, on the same animated rig.

### The living world

- **Wildlife**: Flat Grazer herds and Ridge Skimmers near Kestra, plus Slag Crawlers, Dust Husks and Mist Drifters released around you on their worlds. They grow wary and flee from you or a running ship, which ruins a scan.
- **Tethys storms**: rain, fog, a crosswind on ship and walker, and scanner interference.
- **Ambience** by context: wind, rain, a settlement's murmur, wildlife calls and the signal's hum near structures.
- **Structures and signal**: every structure carries the signal's grammar, concentric rings breathing in step.

### Help

- **F1**: controls.
- **F2**: the Survey Academy (the prototype's 12 pages) and a playable course of 11 lessons.
- **F10**: settings:
  - quality preset and look sensitivity;
  - invert Y and reduced motion;
  - minimap, footprints and touch controls;
  - a 60-second profile capture.
- **Field notes** nudge you after quiet stretches.

## 3. Controls

| | |
|---|---|
| On foot | WASD move · mouse look (drag) · Shift sprint · **E interact** · **hold F scan** (look up to sample air) · H helmet · R prospect |
| Throttle | W/S up/down · Shift full · X cut |
| Attitude | ↑/↓ or I/K pitch · ←/→, J/L or A/D yaw · Q/E roll |
| Belly thrusters | Space lift · C or Ctrl sink (in STABILIZED: commanded climb/sink rate) |
| Assist | T stabilized ↔ manual · N cycles NAV prograde → retrograde → target → autopilot → off · **G autopilot** · B emergency reserve |
| Time warp | 9 slower · 0 faster (coasting in space only; the autopilot warps itself) |
| Panels | J journal · U upgrades · I ship services · Y culture · TAB system board · M map (system / surface / off) · F1 controls · F2 academy · F10 settings · P pause · Esc close · 1–6 choose |
| Touch | stick to move or fly; buttons for E, scan, thrusters, throttle, NAV, map, journal and menu |

## 4. Scale and numbers

| Body | Radius | Gravity | Air | Orbit | Hazard |
|---|---|---|---|---|---|
| Cinder | 44 km | 7.0 m/s² | none | 900 km, 2,120 s | thermal |
| Tethys | 60 km | 9.0 m/s² | 1.05, 21.6 km deep, breathable | 1,600 km, 5,027 s | none |
| Vell (moon) | 18 km | 2.6 m/s² | none | 230 km from Tethys | cryo |
| Ossuary | 52 km | 6.4 m/s² | thin, 12 km deep | 2,400 km, 9,230 s | toxic |
| Hollow | 68 km | 11.2 m/s² | 2.6, 38 km deep | 3,400 km, 15,540 s | pressure |
| Nemesis | 30 km | 4.2 m/s² | none | 4,700 km, 25,300 s, hidden | cryo |

The Kestrel masses 12 t with 300 kN main and 180 kN belly thrust. Its starting 45 fuel isn't enough for Vell; Propellant Tanks and refined volatiles carry you further out. Nemesis needs most of a fully upgraded tank.

## 5. Limits and next steps

What's still left compared with the prototype is in [PALE_SIGNAL_GAP_MAP.md](PALE_SIGNAL_GAP_MAP.md).

- **Engine**: a mouse-steer mode, re-anchoring while walking (a walk frame is 2.4 km across), and full atmospheric scattering.
- **Art**: graze and conversation animations.

## 6. Test plan

- `tests/space_tests.cpp`:
  - flight: rails, air, terrain, landings, orbits, SOI handover and the climb from the site;
  - 0.73.0: components and their wear, wind, route plans and an autopilot run from Tethys orbit to Vell.
- `tests/editor_bridge_tests.cpp`:
  - the landed start, walking anywhere and `space.*` from Lua;
  - 0.73.0: landing at a second `Site` and back, and `Routine` and `Wildlife` behaviour.
- `tests/browser/pale_signal.cjs`:
  - the title, the flight HUD, a hover and set-down;
  - stepping out on the suit reserve, the interaction prompt and the journal, sampling the air, saving and continuing;
  - scanning the Vey Gate foundation, and the cold on Vell.
- `apps/editor/tests/paleSignal.test.ts`: the committed scene matches the generator, and has six bodies, nine landmarks, five Sites, 24 routines and 16 evidence items.
