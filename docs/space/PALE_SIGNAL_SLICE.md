# Pale Signal on this engine — the spaceflight slice

[Pale Signal](https://github.com/Islandyout/pale-signal) is a planetary exploration, xenoarchaeology and spaceflight game. Its signature promise: the player physically flies the same vessel from the surface, through the atmosphere, into space, and back down somewhere else, with no travel cutscenes. Engine version 0.71.0 adds what that needs, and this slice proves it end to end. The engine work is documented in [F71](../IMPLEMENTATION_STATUS.md).

- **Play it**: `pale-signal.html` next to the editor (`build/site/pale-signal.html` after `tools/build_editor.sh`, `/engine/pale-signal.html` deployed).
- **Source**: `tools/space/build_pale_signal.ts` generates `examples/space/pale-signal.json`; the game logic is `tools/space/lua/director.lua`. Rerun with `npm run space --prefix apps/editor`.

## 1. What Pale Signal asks of an engine

| Pale Signal requirement (project brief, Vertical Slice 2.0, Godot migration plan) | Engine answer (0.71.0) |
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

## 2. The slice

1. **Kestra Station, Tethys**: start in the cockpit on the pad. E steps out onto the planet.
2. **Survey**: walk to the Talari ruin north of the station and hold F at the monolith. The journal (J) records the contradiction: a script layer 40,000 years older than the Talari, who say they found Tethys empty. The monolith answers a signal from the moon Vell.
3. **Fuel**: the tank is at 45%, not enough for the crossing. Collect volatile ice from two of three glowing outcrops (+25 each).
4. **Launch**: board (E), lift off on the belly thrusters (Space), throttle up (W/Shift) and pitch over; climb out of the 21.6 km atmosphere.
5. **Orbit**: raise periapsis above 25 km (NAV prograde helps).
6. **Crossing**: NAV TARGET points the nose at Vell; burn, coast with time warp (9/0), and enter Vell's sphere of influence.
7. **The signal**: land within 2.5 km of the beam on Vell. The structure is still transmitting, outward.

A lost ship is recovered to the pad, repaired, with at least 60% fuel.

## 3. Controls

| | |
|---|---|
| On foot | WASD move · mouse look · E board/exit · F scan/collect · J journal · P pause |
| Throttle | W/S up/down · Shift full · X cut |
| Attitude | ↑/↓ or I/K pitch · ←/→, J/L or A/D yaw · Q/E roll |
| Belly thrusters | Space lift · C or Ctrl sink (in STABILIZED: commanded climb/sink rate) |
| Assist | T stabilized ↔ manual · N cycles NAV prograde → retrograde → target → off |
| Time warp | 9 slower · 0 faster (coasting in space only) |
| Camera | drag to look around the ship |

## 4. Scale and numbers

| Body | Radius | Gravity | Air | Orbit |
|---|---|---|---|---|
| Tethys | 60 km | 9.0 m/s² | 1.05 at the surface, 21.6 km deep | 1,600 km from the star, 5,027 s |
| Vell (moon) | 18 km | 2.6 m/s² | none | 230 km from Tethys, 3,850 s |
| Cinder | 44 km | 7.0 m/s² | none | 900 km |
| Ossuary | 52 km | 6.4 m/s² | thin, 12 km deep | 2,400 km |

The Kestrel masses 12 t with 300 kN main and 180 kN belly thrust: about 2,080 m/s on a full tank. Reaching Tethys orbit takes about 900 m/s, the crossing about 120, and landing on Vell about 320, so the 45% the slice starts with is not enough.

## 5. Limits and next steps

- **One site per scene**: walking is on the site's heightfield (2.4 km square here). The ship lands anywhere on any body, but leaving it is refused outside the surveyed area (`exit_blocked`). Several sites, or re-anchoring the frame at the landing point, are the next step.
- **Bodies don't rotate**, and orbits are circular.
- **Placeholder art**: the ship is built from primitives and the Talari use the Mannequin; the presentation pipeline (authored meshes, rigs, materials) is Pale Signal's own Phase 4.

## 6. Test plan

- `tests/space_tests.cpp`: rails, air, terrain and flats, landed idle, lift-off and stabilized hover, a clean and a rough landing, a closed orbit with matching elements and path, thrust and fuel, NAV prograde/retrograde, manual pitch and yaw, drag and heating, sphere-of-influence handover both ways, and a climb from the site out of the atmosphere.
- `tests/editor_bridge_tests.cpp`: a landed start where authored, hover, set-down, exiting onto the curved ground and boarding, and `space.*` from Lua.
- `tests/browser/pale_signal.cjs`: the title, the landed flight HUD, a hover and set-down, stepping out, and scanning the ruin.
- `apps/editor/tests/paleSignal.test.ts`: the committed scene matches the generator; body and landmark parsing.
