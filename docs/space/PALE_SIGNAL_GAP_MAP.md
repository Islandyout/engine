# Pale Signal — gap map (prototype → engine, 0.73.0)

What the [Pale Signal](https://github.com/Islandyout/pale-signal) prototype has, compared with what the game on this engine has as of 0.73.0 ([PALE_SIGNAL_SLICE.md](PALE_SIGNAL_SLICE.md)). The first version of this map (0.72.0) listed 53 gaps; 0.73.0 worked through all seven phases it proposed.

**Sources inventoried:**
- `prototype/pale-signal.html.html`: 17 source modules, 249 functions, and these data tables: 6 bodies, 22 species, 13 civilization sites, 24 NPCs, 16 evidence items, 9 landmarks, 7 upgrades and 12 tutorial pages.
- The 33 `live/*.js` patch layers (v2–v33).
- `production/` documents: master backlog, quality gates, the Tethys/Kestra visual bible, the first-hour QA profile and Vertical Slice 2.0.

**Status:**

| Mark | Meaning |
|---|---|
| ✅ | In the game and working |
| 🟡 | Partly there (what's left is noted) |
| ❌ | Missing |

**Where it lives:**
- E = engine work (C++, bridge, editor), reusable by any game.
- C = content or script (`tools/space/pale_data.ts`, `build_pale_signal.ts`, `director.lua`).

---

## 1. World and star system

| System | Status | How (0.73.0) | Left |
|---|---|---|---|
| Bodies on rails, SOI, gravity | ✅ | Six bodies: Cinder, Tethys, Vell, Ossuary, Hollow, Nemesis | — |
| Hollow | ✅ | Dense air (2.6, 16 km), overcast clouds, pressure hazard, the Third Mooring (C) | — |
| Nemesis | ✅ | `hidden=1 unlit=1` body options; `space.call("reveal")` at 7/7 fragments (E + C) | — |
| Star "Aster" | ✅ | Named in the title and journal (C) | — |
| Per-body hazards | ✅ | thermal / cryo / toxic / pressure rates wear the suit (C) | — |
| Surface temperature / description | ✅ | System Board and landfall journal entries (C) | — |
| Terrain features per body | ❌ | — | Craters, lava rifts, dune fields (E) |
| Axial rotation / day–night | 🟡 | Orbit-driven light; a scene clock (`world.set_clock`) drives NPC days (E) | Rotating body frames |

## 2. Flight

| System | Status | How | Left |
|---|---|---|---|
| MANUAL / STABILIZED / NAV, owner shown | ✅ | Assist in the flight HUD; AUTOPILOT and its phase in the ship line | — |
| NAV auto-transfer | ✅ | `space::autopilot_command`: climb, burn, coast under auto warp, brake, arrive; any input takes over (E) | Clearance corridors around moons |
| Mouse steering mode | ❌ | — | Optional mouse-steer toggle (E) |
| Atmospheric heating, drag, lift | ✅ | Plus wind (`ShipInput::wind`, `space.call("wind")`) | — |
| Landing telemetry | 🟡 | Guidance line, landing law near towns | Radar ribbon, slope warning before contact |
| Landing settle | 🟡 | Settle bob and touchdown thump (E) | Water splash |
| Ship components | ✅ | Engine, RCS, gear, scanner condition; efficiency curve; wear from landings, heat and hard turns; repairs (E + C) | — |
| Emergency reserve | ✅ | `space.call("reserve")`, B (E + C) | — |
| Fuel warnings | ✅ | Route plans on the board, low-fuel and out-of-fuel hints, auto-refine safety (C) | — |
| Time warp guard | ✅ | — | — |
| Ship lost / respawn | ✅ | Recovered to the last safe landing (C) | — |

## 3. Navigation and travel

| System | Status | How | Left |
|---|---|---|---|
| System board | ✅ | TAB: every known body, distance, closing speed, OK / MARGINAL / INSUFFICIENT from `space::plan_route`, ★ recommended (E + C) | — |
| Expedition goal chain | ✅ | exit → air → survey → fuel → orbit → relay → fragments → Nemesis (C) | — |
| Surface map | ✅ | M: equirectangular terrain map of the current world with known sites and you (E) | — |
| Minimaps | ✅ | Flight (bodies near the ship) and on foot (ship, markers, catalogued resources, wildlife, people, rim arrows) (E) | — |
| Waypoints by lat/lon | ✅ | `host.send("waypoint", …)` works across frames (E) | — |
| Off-screen arrows | ✅ | Markers pin to the screen edge | — |
| Auto-refine fuel safety | ✅ | (C) | — |

## 4. EVA

| System | Status | How | Left |
|---|---|---|---|
| Walking, slopes, curvature, walk anywhere | ✅ | — | Re-anchor while walking (no edge limit) |
| Suit O2 | ✅ | 180 s reserve, Life Support upgrade (C) | — |
| Suit integrity and vitals | ✅ | Three meters, hazards, recovery tether (C) | — |
| Helmet and atmosphere verification | ✅ | Look up and hold F (`scanner.skyKey`); ambient intake; H with interlock (E + C) | — |
| Return status | ✅ | RETURN distance and margin, point-of-no-return warning (C) | — |
| Solid minerals | ✅ | Large mineral scatter pushes the walker out (`editor_push`) (E) | Soft radii for big fauna |
| Interaction arbitration | ✅ | One prompt by priority: people, stations, artifacts, harvest, ship (C, `board_key` E) | — |
| Footprints, EVA FX | 🟡 | Footprints on soft ground, dust motes (E) | Suit light, visor effects |

## 5. Scanning, resources and gathering

| System | Status | How | Left |
|---|---|---|---|
| Hold-to-scan | ✅ | — | — |
| Fleeing target cancels the scan | ✅ | `ScanTarget.fleeing` from the wildlife state (E) | — |
| Survey Optics | ✅ | Range and speed via `host.send("scanner", …)`; prospecting at Lv 1 (E + C) | — |
| Scanner confidence | ✅ | Aim, weather interference, scanner condition; bonus RP when confident (E + C) | — |
| Atmosphere scan | ✅ | (E) | — |
| Physical gathering | ✅ | E on a catalogued specimen harvests it out of the world (E + C) | — |
| Inventory, refining, analysis | ✅ | Ore / biomass / volatiles; ship services panel (C) | — |
| Catalogue completion bonus | ✅ | +45 RP per world (C) | — |
| Prospecting | ✅ | R cycles fuel / ore / biomass; nearest deposit marked (E + C) | — |
| Species catalogue | ✅ | All 22, plus the Kestra Spire (C) | — |

## 6. Wildlife

| System | Status | How | Left |
|---|---|---|---|
| Fauna states | ✅ | `Wildlife` component: calm → wary → flee, sprint doubles the radius, home leash (E) | — |
| Reactions to the ship | ✅ | A running engine nearby is a threat (E) | — |
| Herds | 🟡 | Herds at Kestra; walk/run/idle from the AI state | Graze animation |
| Fauna on every world | ✅ | Prefabs released around away frames on Tethys, Cinder, Ossuary, Hollow (C) | — |

## 7. Civilization

| System | Status | How | Left |
|---|---|---|---|
| Sites | ✅ | Kestra Reach, field, market, Meridian House, Old Vey Gate (home frame); Darsa Delta, Meridian Spur, Civic Archive Nine, Retreat Causeway, the Third Mooring with the Resonance Exchange (`Site` entities, E) | — |
| NPCs | ✅ | All 24 Talari plus three Clade resonators (C) | — |
| Daily schedules | ✅ | `Routine` component on the scene clock (E) | — |
| Ambient conversations, visible jobs | 🟡 | Routines between home, work and market | Talking-pair idles, job animations |
| Language model | ✅ | Talari, Ossuary and Clade resonance (C) | — |
| Evidence and investigations | ✅ | All 16 items, 3 investigations (C) | — |
| Reputation | ✅ | Five institutions; landings, talk, evidence and ethics move them; archive access gated (C) | Prices by standing |
| Artifact ethics | ✅ | Document in situ or take (C) | — |
| Workshop actions | ✅ | Full service, trade, archive sessions (C) | — |
| Culture panel | ✅ | Y: languages, reputation, contacts, investigations, places, evidence by era (C) | — |
| Interiors / vestibules | ✅ | Meridian House annex, warm doorways everywhere (C) | More interiors |
| Talari architecture | ✅ | Terraces, roofs, doorways, canals, floodwalls, civic halls, stalls, observatories, towers (C) | — |
| Talari look | 🟡 | Narrow-torso mannequins, tints, job accessories | A dedicated Talari model |

## 8. Progression and the mystery

| System | Status | How | Left |
|---|---|---|---|
| Research points and 7 upgrades | ✅ | — | — |
| Landmarks | ✅ | All 9, with camp / array / monolith / ruin / beacon structures (E + C) | — |
| Signal fragments | ✅ | 7 from landmarks; 7/7 reveals Nemesis (C) | — |
| Ending | ✅ | THE PALE SIGNAL on Nemesis: play time, worlds, species, evidence, fragments (C) | — |
| Save / load | ✅ | Autosave, checkpoints on discoveries, CONTINUE, NEW EXPEDITION with confirmation, hashed saves (C on `save.set`) | — |

## 9. Environment and visuals

| System | Status | How | Left |
|---|---|---|---|
| Planets, seas, clouds, sky, stars, sun | ✅ | Dark reflective canals per the visual bible | — |
| Atmosphere scattering | 🟡 | Rim shell lit by the sun, sky dome | A full scattering model |
| Weather | ✅ | Tethys storms: rain streaks, fog, crosswind on ship and walker, scanner interference, rain audio (E + C) | Shelter behind terrain |
| Environment FX | ✅ | Dust motes per world (E) | — |
| Pale Signal grammar | ✅ | Concentric rings breathing in step around every structure, beams and flares (E) | Synchronized grass near structures |
| Quality settings | ✅ | Low / Medium / High presets (pixel ratio, shadows, scatter) (E) | — |

## 10. Audio

| System | Status | How | Left |
|---|---|---|---|
| Engine and thrusters | ✅ | — | — |
| Audio zones | ✅ | Wind, rain, settlement, wildlife and signal layers by context (`ambience.ts`, E + C) | — |
| UI and discovery cues | ✅ | Good / warn / bad / anomaly / discovery / thump (E) | — |
| Weather and signal audio | ✅ | (E) | — |

## 11. UI and UX

| System | Status | How | Left |
|---|---|---|---|
| Toasts with category colours | ✅ | Five banner styles | — |
| Journal | ✅ | J: categories, paging, filters (C) | — |
| Upgrades | ✅ | U (C) | — |
| Controls reference | ✅ | F1 (C) | — |
| Survey Academy | ✅ | F2: the 12 pages (C) | — |
| Playable course | ✅ | 11 lessons completed by doing (C) | — |
| Pacing recovery | ✅ | Field notes after quiet stretches (C) | — |
| Accessibility | ✅ | Screen-reader announcements of banners and objectives, reduced motion, large touch targets (E) | — |
| Input preferences | ✅ | F10 settings: sensitivity, invert Y (E) | — |
| Multi-line UI text | ✅ | Text elements wrap and break lines, in their own colour (E) | — |

## 12. Platforms and QA

| System | Status | How | Left |
|---|---|---|---|
| Touch controls | ✅ | Stick and buttons pressing real keys, automatic on touch screens (E) | — |
| Mobile governor | 🟡 | Quality presets thin scatter and drop shadows | Automatic simulation tiers |
| Profiler / QA evidence | ✅ | 60-second capture to `profile.json` (percentiles) (E) | — |
| Save robustness | ✅ | Hashed save, fresh-game guard (C) | — |
| PWA / Android | ❌ | — | Out of engine scope |

---

## Summary

| Area | ✅ | 🟡 | ❌ |
|---|---|---|---|
| World & system | 6 | 1 | 1 |
| Flight | 8 | 2 | 1 |
| Navigation | 6 | 0 | 0 |
| EVA | 7 | 1 | 0 |
| Scanning & resources | 10 | 0 | 0 |
| Wildlife | 3 | 1 | 0 |
| Civilization | 11 | 2 | 0 |
| Progression & mystery | 5 | 0 | 0 |
| Visuals | 5 | 1 | 0 |
| Audio | 4 | 0 | 0 |
| UI/UX | 10 | 0 | 0 |
| Platforms/QA | 3 | 1 | 1 |

## What's left

- **Engine:** terrain features (craters, rifts, dunes), rotating body frames, an optional mouse-steer flight mode, a landing radar ribbon, water splashes, re-anchoring while walking, and a full atmospheric scattering model.
- **Art:** a dedicated Talari character model, graze and conversation animations.
- **Content:** more interiors, prices by reputation, shelter from storms.
