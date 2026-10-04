# Pale Signal — complete gap map (prototype → engine slice)

What the [Pale Signal](https://github.com/Islandyout/pale-signal) prototype has, compared with what the engine slice (0.72.0, [PALE_SIGNAL_SLICE.md](PALE_SIGNAL_SLICE.md)) has now.

**Sources inventoried:**
- `prototype/pale-signal.html.html`: 17 source modules, 249 functions, and these data tables: 6 bodies, 22 species, 13 civilization sites, 24 NPCs, 16 evidence items, 9 landmarks, 7 upgrades and 12 tutorial pages.
- The 33 `live/*.js` patch layers (v2–v33).
- `production/` documents: master backlog, quality gates, the Tethys/Kestra visual bible, the first-hour QA profile and Vertical Slice 2.0.

**Status legend:**

| Mark | Meaning |
|---|---|
| ✅ | In the slice and working |
| 🟡 | Partly there (what's missing is noted) |
| ❌ | Missing |

**Layer:**
- E = needs engine work (C++/bridge/editor), reusable by any game.
- C = content or script only (the generator and `director.lua`).

**Size:** S is under a day; M is 1–3 days; L is a week or more.

---

## 1. World and star system (`10_world`)

| System | Prototype | Slice | Gap | Layer | Size |
|---|---|---|---|---|---|
| Bodies on rails, SOI, gravity | 6 bodies with moons | ✅ 4 bodies | — | — | — |
| **Hollow** | Dense-atmosphere world (density 2.6, 16 km air), pressure hazard, light from below, overcast | ❌ | Body data, permanent cloud deck, pressure hazard | C (+E: very dense air drag tuning) | S |
| **Nemesis** | Hidden unlit body, revealed by 7 fragments; the ending | ❌ | Hidden-body flag (not drawn or listed until revealed), unlit rendering | E + C | M |
| Star "Aster" | Named star, `STAR_FLIGHT_GRAVITY` scaling | 🟡 unnamed star | Name in HUD/journal | C | S |
| Per-body hazards | thermal (Cinder), cryo (Vell, Nemesis), toxic (Ossuary), pressure (Hollow), with a hazard rate | ❌ | See §4 | E + C | M |
| Surface temperature / description | Per body (`+14 C`, `-171 C` …) | 🟡 Tethys only, in the journal | Body info panel | C | S |
| Terrain per body | Procedural relief, craters, rifts | 🟡 fBm + ridges | Craters (Vell/Nemesis), lava rifts (Cinder), dune fields (Ossuary) as terrain features | E | M |
| Body rotation / day–night cycle | Light changes as bodies move | 🟡 orbit-driven light only | Optional axial spin (rotating frames) | E | L |

## 2. Flight (`50_ship`, live `flight-landing-v5`, `ship-polish-v4`)

| System | Prototype | Slice | Gap | Layer | Size |
|---|---|---|---|---|---|
| MANUAL / STABILIZED / NAV ownership | Yes; the HUD shows who owns control | ✅ | Control-owner badge (PILOT / ASSIST / NAV) | E | S |
| **NAV auto-transfer** | NAV can also own the throttle: `navRecommendedThrottle`, clearance corridors from moons, intercept horizon. "Manual input always wins." | ❌ NAV only points the nose | Autopilot burn/coast/brake to a target with a fuel plan | E | L |
| Mouse steering (and free-look toggle) | Mouse pitches/yaws the ship; free look is held | 🟡 mouse = free look only | Optional mouse-steer mode + toggle | E | S |
| Atmospheric heating, drag, lift | ✅ | ✅ | — | — | — |
| Landing telemetry | Radar, approach guidance, vertical/lateral/tilt/slope limits | 🟡 guidance line under 150 m | Radar altitude ribbon, slope warning before contact, safe-zone indicator | E | M |
| Landing settle | Suspension compression, settle bob, contact audio, dust/water response | 🟡 dust only | Gear compression and settle, touchdown thump, water splash | E | M |
| **Ship components** | engine, rcs, gear, scanner condition 0–100; damage from rough landings, heat and side loads; efficiency curves (`compEff`) | ❌ hull only | Component health, wired into thrust/turning/landing tolerance/scan | E + C | M |
| Emergency fuel reserve | One-time reserve (8.5% of the tank, locked above 35% fuel), B key | ❌ | Reserve release | E + C | S |
| Fuel warnings | Low-fuel and return-margin warnings | 🟡 out-of-fuel hint | Route-aware warnings (§3) | C | S |
| Time warp guard | Blocked in air, landed or under thrust; a UX preference | ✅ | — | — | — |
| Ship lost / respawn | Destroy and respawn at the last landing | ✅ (recovers to Kestra) | Respawn at the last safe landing | C | S |

## 3. Navigation and travel (`27_expedition`, `28_systems`, `80_ui`)

| System | Prototype | Slice | Gap | Layer | Size |
|---|---|---|---|---|---|
| **System board (NAV overlay)** | All bodies, distances, closing speed, a route plan per target with a status (OK / MARGINAL / INSUFFICIENT), recommended next target, target cycling | ❌ only a script-set target | Board UI, `routePlan` fuel estimate, target selection by the player | E (+C) | M |
| Expedition goal | `currentExpeditionGoal`, `recommendedNavTarget` | 🟡 objective text | Data-driven goal chain | C | S |
| **Surface map** | Planetary survey directory, known local resources, sites, zoom and detail levels | ❌ | Map overlay (top-down of the walk frame + known sites on the body) | E | M |
| **Minimaps** | Flight minimap (bodies/target) and EVA minimap (resources, ship, sites, edge arrows) | ❌ (HIGH HEAT has one) | Space and EVA minimap variants | E | M |
| Surface waypoints | Arc-distance routes to sites/resources on the sphere, next-waypoint guidance | 🟡 Lua `ui.marker` in the site frame only | Waypoints that work across frames (by lat/lon) | E | M |
| Markers | Projected markers with edge clamping | 🟡 landmarks + script markers | Edge-of-screen arrows for off-screen targets | E | S |
| Auto-refine fuel safety | Automatically refines volatiles into fuel when low | ❌ | §5 | C | S |

## 4. EVA — on foot (`60_player`, live `eva-wildlife-kestra-v6`, `interaction-*`)

| System | Prototype | Slice | Gap | Layer | Size |
|---|---|---|---|---|---|
| Grounded walking, slopes, curvature | ✅ | ✅ (walk frame) | — | — | — |
| Walk anywhere | ✅ any body | ✅ 0.72.0 (2.4 km area, re-anchors on landing) | Re-anchor while walking (no edge limit) | E | M |
| **Suit O2** | o2Max 180 s, drain rate, Life Support upgrade | 🟡 90 s on airless worlds | Tune to the prototype; shown in the HUD | C | S |
| **Suit integrity + vitals** | Suit wears under hazards; vitals drop when exposed; either failing means "down" | ❌ | Two meters, damage sources, a recovery sequence | C (+E HUD) | S |
| **Helmet + atmosphere verification** | Air must be verified by scanning the open sky; then the helmet can come off; interlock preference; thin-air threshold by altitude | ❌ breathability is a fixed table | Sky scan (look up + F), helmet toggle (H), ambient vs reserve modes | E + C | M |
| **Hazards** | thermal/cryo/toxic/pressure wear the suit; HUD warning | ❌ | Per-body hazard rate → suit wear | C | S |
| EVA return status | Distance and O2 to get back to the ship, warnings | ❌ | "Point of no return" warning | C | S |
| Solid minerals / fauna bodies | Minerals collide; large fauna have soft radii | ❌ scatter is not solid | Collision proxies for scattered minerals | E | M |
| Interaction arbitration | Nearest-verb priority (NPC > station > arch > resource), reach ranges, "move closer" feedback | 🟡 scanner picks the best target; E is ship-or-talk | Unified interaction prompt + priority system | E | M |
| Footprints / EVA FX | Footprint decals, suit light, breath/visor effects | ❌ | Footprint decals (decal system exists) | E | S |

## 5. Scanning, resources and gathering (`25_state`, `30_props`, live `live.js`, `tethys-weather-scanner-v22`)

| System | Prototype | Slice | Gap | Layer | Size |
|---|---|---|---|---|---|
| Hold-to-scan with aim quality, stickiness, motion penalty | ✅ | ✅ | — | — | — |
| Fleeing target cancels the scan | ✅ | ❌ | Needs fauna states (§6) | E | S |
| Scanner range/time upgrade ("Survey Optics") | ✅ (7th upgrade) | ❌ | Upgrade + scanner range/time from script | E + C | S |
| **Scanner confidence** | Quality/confidence shown; weather lowers it; high-confidence bonus RP | ❌ | Confidence readout + modifiers | E | S |
| **Atmosphere scan** | Look up and scan to sample the air (verifies breathability) | ❌ | §4 | E | S |
| **Physical gathering** | "Scanning identifies, interaction harvests": E on a catalogued specimen collects `yield` (ore / biomass / volatiles) | ❌ ice only, collected by scanning | Harvest interaction for scattered species; resources removed from the world | E + C | M |
| **Resource inventory** | `G.res` ore / biomass / volatiles | ❌ | Inventory + HUD | C | S |
| **Refuel by refining** | Volatiles refined into fuel at the ship | ❌ (fuel granted directly) | Refinery action when landed | C | S |
| **Sample analysis** | Shipboard recipes: biomass 12 → 8 RP, ore 20 → 6 RP, volatiles 18 → 6 RP | ❌ | Analysis action | C | S |
| **Catalogue completion bonus** | +45 RP per body when every species there is known | ❌ | Per-body completion tracking | C | S |
| **Resource ping / prospecting** | Resource mode cycles ore / biomass / volatiles; pings the nearest known (or unknown, with Optics 1) signature | ❌ | Prospecting mode + ping marker | E + C | M |
| Species catalogue | 22 species incl. 5 fauna and Hollow/Nemesis species | 🟡 14, 1 fauna | Add Ridge Skimmer, Slag Crawler, Dust Husk, Mist Drifter, Hollow flora/minerals, Null Shard | C | S |

## 6. Wildlife (`stepFauna`, live `eva-wildlife-kestra-v6`, `wildlife-coordinate-v16`, `animation-refine-v29`)

| System | Prototype | Slice | Gap | Layer | Size |
|---|---|---|---|---|---|
| **Fauna states** | calm (wander) → wary (< 44 m) → flee (< 16 m, < 34 m if sprinting), with home leash | ❌ AI wander only | Wildlife behaviour on the existing AI (flee from the player and the ship) | E | M |
| Reactions to the ship | Engine wash and landings scatter herds | ❌ | Same system, ship as a threat source | E | S |
| Herds / grazer shells | Herd groups, grazer models, idle/graze animation | 🟡 single stags | Herd spawning + animation states | E + C | M |
| Fauna per body | Tethys (Grazer, Skimmer), Cinder (Slag Crawler), Ossuary (Dust Husk), Hollow (Mist Drifter) | 🟡 Tethys grazers at Kestra only | Fauna scattered in away frames too | E + C | M |

## 7. Civilization (`35_civilization`, live `kestra-*`, `interaction-coordinate-v17`)

| System | Prototype | Slice | Gap | Layer | Size |
|---|---|---|---|---|---|
| **Sites** | 13 sites: Kestra Reach, Kestra Landing Field, Meridian House, Old Vey Gate, Kestra Reed Market (Tethys); Darsa Delta + Landing Shelf; Meridian Spur + Field; Civic Archive Nine and Retreat Causeway (Ossuary); The Third Mooring and Resonance Exchange (Hollow) | 🟡 one small Kestra stand-in | Multiple authored sites per scene (several site frames, each with its own entities) | **E** + C | L |
| **NPCs** | 24 named Talari with roles, institutions, home/work/market positions and lines | 🟡 5 | All 24 with their data | C | S |
| **Daily schedules** | NPCs move home → work → market by time of day | ❌ wander only | Schedule-driven NPCs (waypoint routines) | E | M |
| Ambient conversations, visible jobs | NPCs talk to each other and work stations | ❌ | Social idle behaviours + animation | E + C | M |
| **Language model** | Talari language 0–100, five stages, partial translation | ✅ | Hollow "resonance" language for the Clades | C | S |
| **Evidence** | 16 items across Tethys, Ossuary and Hollow, with eras, protected flags, text | 🟡 4 | All 16 at their sites | C | S |
| **Historical investigations** | 3 multi-source contradictions (The Inherited Sky, A Civilization After the Builders, The Choir Compact): +50/55/60 RP | ❌ | Investigation tracking + journal | C | S |
| **Reputation** | Institutions (Concord, Commons, Meridian, Preservation) from −100 to 100; actions shift them | ❌ | Reputation model + effects (prices, access, dialogue) | C | M |
| **Artifact ethics** | Take a protected artifact (+20 RP, reputation loss) or document it in situ (+5 RP, reputation gain) | ❌ | Choice UI + consequences | C | S |
| **Workshop actions** | Repair (ore), trade at the market workshop | ❌ | Station interactions | C | S |
| Culture overlay | Civilization panel: language, reputation, contacts, evidence by era | ❌ | Panel UI | C (+E UI) | M |
| Interiors / vestibules | Warm-lit entrances, interior presentation | ❌ | Interior spaces (authored) | C | M |
| Authored Kestra architecture | Street layout, civic solids, terrace homes, terrain conformance, collision proxies | 🟡 catalog buildings in a ring | Talari architecture kit (procedural or authored) | E + C | L |
| Talari look | Narrow-torso humanoids, layered clothing, job accessories, 3+ variants | ❌ Mannequin | Character variants + accessories | Art | L |

## 8. Progression and the mystery (`25_state`, `27_expedition`, `90_main`)

| System | Prototype | Slice | Gap | Layer | Size |
|---|---|---|---|---|---|
| Research points | ✅ | ✅ | — | — | — |
| Upgrades | 7 (incl. Survey Optics) | 🟡 6 | Survey Optics | C | S |
| **Landmarks** | 9: Landfall, Kneeling Array, Reed Sink, The Anvil, Under-Ice Relay, Ossuary Spine, Silent Foundry, Drowned Choir, THE PALE SIGNAL | 🟡 3 | The other 6, each with its own structure kind (camp, array, monolith, ruin, beacon) | C (+E structure kinds) | S |
| **Signal fragments** | 7 fragments from landmarks; 7/7 plots Nemesis | ❌ | Fragment tracking + reveal | C | S |
| **Ending** | Fly to Nemesis, reach the receiver; ending text with play time and worlds visited | 🟡 ends at the Vell relay | Nemesis finale | C | S |
| **Save / load** | Autosave, checkpoints on discoveries, continue, new game, a fresh-game guard | ❌ | Save state (Lua storage of progress + ship state) | E + C | M |

## 9. Environment and visuals (`42_visuals`, `45_environment`, live `quality-lift-v24`, `visual-coherence-v25`)

| System | Prototype | Slice | Gap | Layer | Size |
|---|---|---|---|---|---|
| Planets refine with distance | Patch tiers | ✅ quadtree | — | — | — |
| Seas, clouds, sky, stars, sun | ✅ | ✅ 0.72.0 | Visual bible: standing water dark and reflective, "never tropical blue" | C (tuning) | S |
| Atmosphere scattering | "Modern atmosphere" shader | 🟡 rim shell + sky dome | Scattering with a proper day/night terminator seen from orbit | E | M |
| **Weather** | Tethys storms: rain, fog, crosswind, lower contrast, scanner interference, shelter behind terrain | ❌ | Weather system (rain particles, fog ramp, wind force on EVA/ship, scanner penalty) | E | M |
| Environment FX | Dust motes, wind streaks, local particles near the player | ❌ | Ambient particle volumes (particle system exists) | E | S |
| Pale Signal visual grammar | Concentric coherent geometry, narrow-band emission, synchronized local motion, subtle interference near structures | 🟡 static monolith | Animated rings, pulsing emission, "synchronized" grass/dust near structures | E | M |
| Quality settings | Visual quality tiers, mobile clarity scale, quality badge | 🟡 dynamic resolution only | User-facing quality presets | E | S |

## 10. Audio (`85_audio`, live `audio-mix-v28`, `ship-polish-v4`)

| System | Prototype | Slice | Gap | Layer | Size |
|---|---|---|---|---|---|
| Engine / thruster | ✅ air-dependent | ✅ | — | — | — |
| **Audio zones** | EVA, cockpit, vacuum, settlement, wildlife and Pale Signal layers, mixed by context | ❌ | Ambience layers by context (the mixer exists) | E + C | M |
| UI and discovery cues | Toast blips, sweeps, thumps, discovery stingers | ❌ | Short synthesized cues (SFX synth exists) | C | S |
| Weather and signal audio | Rain, wind, signal hum near structures | ❌ | With §9 | E | S |

## 11. UI and UX (`80_ui`, live `control-reference-v21`, `playable-tutorial-v32`, `pacing-recovery-v31`, `accessibility-recovery-v26`)

| System | Prototype | Slice | Gap | Layer | Size |
|---|---|---|---|---|---|
| Toasts / banners | ✅ | ✅ | Category colours (good/warn/bad/anomaly) | C | S |
| **Journal** | Categories (species, site, anomaly, warn…), scrollable history | 🟡 last 5 entries | Full journal with categories | E (UI) + C | M |
| Upgrade overlay | ✅ | ✅ basic | — | — | — |
| **Controls reference** | Context-aware controls panel | 🟡 title screen only | In-game controls overlay (F1) | C | S |
| **Survey Academy** | 12-page tutorial reference | ❌ | Reference pages | C | S |
| **Playable tutorial course** | Lessons completed by doing (atmosphere, EVA, arrays, flight) | ❌ (first steps are objectives) | Lesson tracker | C | M |
| Pacing recovery | Dead-air "field note" hints | 🟡 objectives | Idle-time nudges | C | S |
| Accessibility | Screen-reader announcements, enlarged touch targets, reduced motion | ❌ | Announce channel, reduced-motion option | E | M |
| Input preferences | Invert Y, sensitivity, free-look mode, pointer-lock fallback | ❌ | Settings panel | E | S |

## 12. Platforms and QA (live `mobile-*`, `kestra-profiler-v19`, `qa-evidence-v20`, `live-persistence-v13`, `first-hour-gate-v27`)

| System | Prototype | Slice | Gap | Layer | Size |
|---|---|---|---|---|---|
| **Touch controls** | Virtual sticks, flight buttons (throttle, cut, map, journal…), compact mobile HUD | ❌ | Touch layer for flight and EVA | E | L |
| Mobile governor | Cuts optional simulation (fauna/NPC/signal FX) before clarity | 🟡 dynamic resolution | Budgeted simulation tiers | E | M |
| Profiler / QA evidence | 60-second capture, percentiles, first-hour stage verdicts | 🟡 stats overlay | Capture-and-export profile | E | S |
| Save robustness | State hashing, fresh-game guard | ❌ | With save/load (§8) | E | S |
| PWA / Android | Installable PWA, Android APK pipeline | ❌ (web only) | Out of engine scope for now | — | — |

---

## Summary

| Area | ✅ | 🟡 | ❌ |
|---|---|---|---|
| World & system | 1 | 4 | 3 |
| Flight | 4 | 4 | 3 |
| Navigation | 0 | 3 | 4 |
| EVA | 2 | 2 | 6 |
| Scanning & resources | 1 | 1 | 10 |
| Wildlife | 0 | 2 | 2 |
| Civilization | 1 | 4 | 9 |
| Progression & mystery | 1 | 3 | 2 |
| Visuals | 2 | 3 | 2 |
| Audio | 1 | 0 | 3 |
| UI/UX | 2 | 3 | 4 |
| Platforms/QA | 0 | 2 | 3 |

## Proposed order

Each phase is a playable increment, ordered by what the player feels first.

### Phase A — the core survival-economy loop

- Physical gathering
- Ore, biomass and volatiles inventory
- Refining volatiles into fuel, and shipboard sample analysis
- Catalogue completion bonuses
- Ship components with repair
- The emergency reserve
- Survey Optics
- Save and load with checkpoints

**Main engine work:** a harvest interaction, a save-state API, and component wiring.

### Phase B — EVA survival

- Suit integrity and vitals
- Sky-scan atmosphere verification and the helmet
- Hazards per body
- Return-status warnings
- Solid minerals
- Footprints
- A unified interaction prompt

### Phase C — the living world

- Fauna states (calm, wary, flee) that react to the ship
- Herds, and fauna on every world
- Tethys storms (rain, fog, crosswind, scanner interference)
- Ambient particles and audio zones

### Phase D — navigation

- The system board with route plans (OK / MARGINAL / INSUFFICIENT)
- NAV autopilot transfers that the pilot can always override
- The surface map and minimaps
- Waypoints by latitude/longitude, and off-screen arrows

### Phase E — civilization

- **Multi-site scenes** (the main engine work), so the scene can hold Kestra Reach with its market, Meridian House and Old Vey Gate, plus Darsa Delta and Meridian Spur
- All 24 NPCs with daily schedules and ambient life
- All 16 evidence items and the 3 investigations
- Reputation, artifact ethics, workshop actions and the culture panel

### Phase F — the whole mystery

- Hollow, with the Third Mooring and the Resonant Clades
- The Ossuary archaeology sites
- All 9 landmarks and the 7 fragments
- Hidden Nemesis and the finale

### Phase G — presentation and platforms

- Pale Signal visual and audio grammar, and landing settle
- A Talari architecture kit and character variants
- The Survey Academy and playable course, the journal, controls and settings
- Touch controls, accessibility and quality presets
