# Pale Signal — gap map (prototype → engine, 0.76.0)

What the [Pale Signal](https://github.com/Islandyout/pale-signal) prototype has, compared with what the game on this engine has as of 0.76.0 ([PALE_SIGNAL_SLICE.md](PALE_SIGNAL_SLICE.md)). The first version of this map (0.72.0) listed 53 gaps. 0.73.0 worked through all seven phases it proposed, 0.74.0 closed the terrain, rotation, landing and Talari gaps, and 0.75.0 closed the rest; PWA/Android packaging was replaced by holding 45–60 fps everywhere (the frame governor).

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
| Terrain features per body | ✅ | `craters=`, `rifts=` (glowing lava channels) and `dunes=` body options: craters on Vell, Nemesis, Cinder and Ossuary; rifts on Cinder; dunes on Ossuary (E) | — |
| Axial rotation / day–night | ✅ | `day=` turns a body: surfaces, sites and landmarks turn with it, landed ships ride along, and the sun rises and sets. Kestra's NPC clock follows its solar day (E + C) | — |

## 2. Flight

| System | Status | How | Left |
|---|---|---|---|
| MANUAL / STABILIZED / NAV, owner shown | ✅ | Assist in the flight HUD; AUTOPILOT and its phase in the ship line | — |
| NAV auto-transfer | ✅ | `space::autopilot_command`: climb (coasting out once carried), transfers around the star by shooting for an intercepting coast, clearance corridors around bodies in the way, an approach timed to brake; any input takes over (E) | — |
| Mouse steering mode | ✅ | A click captures the mouse as a virtual stick (`editor_space_stick`); a setting switches it back to looking around (E) | — |
| Atmospheric heating, drag, lift | ✅ | Plus wind (`ShipInput::wind`, `space.call("wind")`) | — |
| Landing telemetry | ✅ | A radar tape below 400 m with sink rate, ground slope, drift, water and a SAFE / UNSAFE call against the gear's limits; a predicted path drawn over the turning ground; landing law at every settlement and heritage site (E + C) | — |
| Landing settle | ✅ | Settle bob, touchdown thump, spray from water landings and from low hovers (E) | — |
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
| Walking, slopes, curvature, walk anywhere | ✅ | The walk frame re-anchors on foot (ground built ahead, a tick at a time) and hands over between sites and the wilds (E) | — |
| Suit O2 | ✅ | 180 s reserve, Life Support upgrade (C) | — |
| Suit integrity and vitals | ✅ | Three meters, hazards, recovery tether (C) | — |
| Helmet and atmosphere verification | ✅ | Look up and hold F (`scanner.skyKey`); ambient intake; H with interlock (E + C) | — |
| Return status | ✅ | RETURN distance and margin, point-of-no-return warning (C) | — |
| Solid minerals and fauna | ✅ | Large mineral scatter pushes the walker out (`editor_push`); big animals and the walker ease apart (E) | — |
| Interaction arbitration | ✅ | One prompt by priority: people, stations, artifacts, harvest, ship (C, `board_key` E) | — |
| Footprints, EVA FX | ✅ | Footprints, dust motes, a suit light (auto / on / off), a visor with rain beads, frost, heat shimmer and cracks (`host.send("visor")`) (E + C) | — |

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
| Herds | ✅ | Herds at Kestra; walk/run/idle from the AI state; calm animals graze on and off (E) | — |
| Fauna on every world | ✅ | Prefabs released around away frames on every world, Rime Striders on Vell and Pale Watchers on Nemesis included, and brought along as you walk (C) | — |

## 7. Civilization

| System | Status | How | Left |
|---|---|---|---|
| Sites | ✅ | Kestra Reach, field, market, Meridian House, Old Vey Gate (home frame); Darsa Delta, Meridian Spur, Civic Archive Nine, Retreat Causeway, the Third Mooring with the Resonance Exchange (`Site` entities, E) | — |
| NPCs | ✅ | All 24 Talari plus three Clade resonators (C) | — |
| Daily schedules | ✅ | `Routine` component on the scene clock (E) | — |
| Ambient conversations, visible jobs | ✅ | Routine stops name an activity (sit, work, talk); people standing close talk in pairs; staggered days, stall keepers and neighbours keep the town busy (E + C) | — |
| Language model | ✅ | Talari, Ossuary and Clade resonance (C) | — |
| Evidence and investigations | ✅ | All 16 items, 3 investigations (C) | — |
| Reputation | ✅ | Five institutions; landings, talk, evidence and ethics move them; archive access gated; workshop and market prices follow Commons standing (C) | — |
| Artifact ethics | ✅ | Document in situ or take (C) | — |
| Workshop actions | ✅ | Full service, trade, archive sessions (C) | — |
| Culture panel | ✅ | Y: languages, reputation, contacts, investigations, places, evidence by era (C) | — |
| Interiors / vestibules | ✅ | Meridian House annex, the workshop hall, Darsa's Water Court chamber, the Spur reading room, the Resonance Exchange, an Ossuary records room; warm doorways everywhere (C) | — |
| Talari architecture | ✅ | Terraces, roofs, doorways, canals, floodwalls, civic halls, stalls, observatories, towers (C) | — |
| Talari look | ✅ | A Talari model (`talari.glb`, made by `tools/models/make_talari.py`): narrow torso, long crested skull, tunic and mantle on the animated rig; clothes tinted by role (`Material.parts`), job accessories (E + C) | — |

## 8. Progression and the mystery

| System | Status | How | Left |
|---|---|---|---|
| Research points and 7 upgrades | ✅ | — | — |
| Landmarks | ✅ | All 9, with camp / array / monolith / ruin / beacon structures (E + C) | — |
| Signal fragments | ✅ | 7 from landmarks; 7/7 reveals Nemesis (C) | — |
| Ending | ✅ | THE PALE SIGNAL on Nemesis: play time, worlds, species, evidence, fragments (C) | — |
| Save / load | ✅ | Autosave, checkpoints, CONTINUE, NEW EXPEDITION with confirmation, hashed saves; the hull, the system clock, everyone's place in their day and harvested specimens persist (E + C) | — |

## 9. Environment and visuals

| System | Status | How | Left |
|---|---|---|---|
| Planets, seas, clouds, sky, stars, sun | ✅ | Dark reflective canals per the visual bible | — |
| Atmosphere scattering | ✅ | Single scattering (Rayleigh and Mie, planet shadow, reddened sunlight) for the sky and the air seen from space; the fog takes the scattered horizon colour (`atmosphere.ts`, E) | — |
| Weather | ✅ | Tethys storms: rain streaks, fog, crosswind on ship and walker, scanner interference, rain audio; shelter under roofs and in the lee of cover (E + C) | — |
| Environment FX | ✅ | Dust motes per world (E) | — |
| Pale Signal grammar | ✅ | Concentric rings breathing in step around every structure, beams and flares; scattered plants sway, in step with the rings near a structure (E) | — |
| Quality settings | ✅ | Low / Medium / High presets set the best tier the frame governor may use (E) | — |

## 10. Audio

| System | Status | How | Left |
|---|---|---|---|
| Engine and thrusters | ✅ | — | — |
| Audio zones | ✅ | Wind, rain, settlement, wildlife and signal layers by context (`ambience.ts`, E + C) | — |
| UI and discovery cues | ✅ | Good / warn / bad / anomaly / discovery / thump (E) | — |
| Weather and signal audio | ✅ | (E) | — |
| Music | ✅ | A generative score by mood (`music.ts`, `host.send("music", mood)`): title, exploring, night, flight, space, the signal, storms (E + C) | — |

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
| Frame governor | ✅ | Holds 45–60 fps: steps resolution, shadows, bloom, scatter density, terrain streaming and distant animation by measured frame time (`frameGovernor.ts`, E) | — |
| Profiler / QA evidence | ✅ | 60-second capture to `profile.json` (percentiles) (E) | — |
| Save robustness | ✅ | Hashed save, fresh-game guard (C) | — |
| PWA / Android | — | Replaced by the frame governor (the game runs well in a phone browser) | — |

---

## Summary

| Area | ✅ | 🟡 | ❌ |
|---|---|---|---|
| World & system | 8 | 0 | 0 |
| Flight | 11 | 0 | 0 |
| Navigation | 6 | 0 | 0 |
| EVA | 8 | 0 | 0 |
| Scanning & resources | 10 | 0 | 0 |
| Wildlife | 4 | 0 | 0 |
| Civilization | 13 | 0 | 0 |
| Progression & mystery | 5 | 0 | 0 |
| Visuals | 6 | 0 | 0 |
| Audio | 5 | 0 | 0 |
| UI/UX | 10 | 0 | 0 |
| Platforms/QA | 4 | 0 | 0 |

## What's left

Nothing from the prototype. PWA/Android packaging was dropped in favour of the frame governor. The fuel economy was tuned on simulated autopilot flights between every pair of worlds the expedition uses; a hand-flown expedition from title to ending hasn't been timed.

0.76.0 worked through the follow-up list from 0.75.0:

- batching and adaptive scatter chunks;
- the governor's sky and simulation tiers;
- cheaper craters;
- swaying and suit-light shadows;
- per-ship autopilot memory, Hohmann moon legs and conservative plans;
- reframe heading;
- wildlife arriving out of sight;
- routines pathing indoors through sliding doors;
- gestures and canal reflections;
- saved herds and institution prices;
- composed motifs;
- landing in the native playground;
- the site view's defaults.

Still open, and needing hardware: frame rates on real phones and GPUs, touch on a real device, and a timed hand-played run.
