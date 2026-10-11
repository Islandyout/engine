# VELOCITY — Game Design & Implementation Bible

**Document version:** 1.0  
**Status:** Implementation contract for the first complete playable release  
**Genre:** Third-person superhero action / open-zone adventure  
**Reference:** DC Universe Online (DCUO) for player fantasy and broad activity structure; all VELOCITY characters, story, visuals, names, powers, missions, and assets are original.  
**Primary scene:** `games/my-games/velocity/velocity.json`

---

## 0. Product promise

VELOCITY is a single-player-first superhero action game about being the fastest person in a dense modern city: traverse at exhilarating speed, arrive at trouble, fight with readable and expressive powers, rescue people, interrupt crimes, defeat named threats, and feel that the city reacts to the player's actions.

The player fantasy must be obvious within 30 seconds:
1. Move normally, then hold sprint to build speed in **all four directions**.
2. Leap, cut around corners, and use the street as a traversal playground.
3. Spot an incident and engage enemies without waiting through long, uninterruptible animations.
4. Chain light/heavy attacks, kicks, a power attack, dodge and block/parry.
5. Finish an encounter, receive clear feedback/reward, and immediately see another reason to play.

**North star:** *I feel powerful, fast, responsive, and useful—and I can always find something fun to do without being forced into a group or a grind.*

VELOCITY is not presented as a DCUO clone or a full MMO. It borrows high-level genre lessons: a superhero identity, active combat, movement as part of the fantasy, short missions, street-level incidents, named villains, and longer-term build goals. It must work as a satisfying solo game first; multiplayer can be a later architecture decision, not a promise in this release.

## 1. Research-derived player requirements

These are design signals from public player discussions, not claims that every DCUO player agrees.

### 1.1 Movement and combat must feel superheroic
DCUO's official movement guide sells Super-Speed through rapid street travel, wall/ceiling running and combat movement—not simply a higher run-speed number. Player forum discussion has also criticized combat that slows movement too much, grounds characters too often, or locks them in place during ability animations. Therefore:
- Preserve meaningful movement during combat.
- Make sprinting, dodging and repositioning useful in a fight.
- Avoid long forced root animations; attacks may commit briefly, but player input must remain responsive.
- Do not make one movement style mandatory for success.
- If future movement modes are added, each must have a useful traversal and combat role, not just a cosmetic difference.

### 1.2 Respect solo and casual play
DCUO forum feedback has objected when content effectively assumes a pre-made group, and other player discussion describes repetitive daily/weekly chores as exhausting. VELOCITY therefore:
- Makes the whole first release completable alone.
- Provides a clear main mission and optional short activities.
- Never requires a second player, a timed live event, or a rare random drop to finish the story.
- Avoids daily chores, loot-lock timers, artificial wait gates and mandatory repetitive farming.
- Makes optional encounters harder/more rewarding, not required to unlock the ending.

### 1.3 Variety and understandable progression beat chore volume
Players should be choosing between different fun activities, not repeating the same task only to fill a bar. Include rescue, pursuit, combat, traversal and boss objectives. Rewards should unlock a visible capability, cosmetic, or meaningful build choice. Do not ship a large inventory of near-identical +1 upgrades.

### 1.4 Fairness, clarity and agency
- Spawn/mission start points must be safe: no enemy can hit the player before control returns.
- Telegraph dangerous attacks with a clear wind-up, ground/target indicator, sound cue and consistent response window.
- Boss mechanics must be learnable and readable, not hidden behind visual noise.
- A player must understand why an attack missed, why a target is invulnerable, and what objective is still outstanding.
- Support keyboard/mouse first, with gamepad mappings preserved where the engine supports them.
- Provide adjustable camera sensitivity, invert-Y, motion-effects toggle, readable HUD scaling, and captions/visual cues for important audio events.

### 1.5 Research sources
- DCUO official movement-mode guide: https://www.dcuniverseonline.com/guides/guide-character-basics-choose-your-movement-mode-dcuo
- DCUO forum: player discussion of combat movement, grounding and animation locks (Jan 2025): https://forums.daybreakgames.com/dcuo/index.php?threads/reevaluating-content-structure-a-proposal-for-smaller-group-sizes.333479/
- DCUO forum: movement-mode balance and combat mobility (Jan 2021): https://forums.daybreakgames.com/dcuo/index.php?threads/movement-modes.313377/
- DCUO forum: solo/duo accessibility and group assumptions: https://forums.daybreakgames.com/dcuo/index.php?threads/wonderverse-not-so-wonderful-for-solo-duo-players.310536/
- Reddit community thread on excessive daily/weekly chores (Sep 2026): https://www.reddit.com/r/DCUO/comments/1wqb90r/this_game_has_become_extremely_frustrating_to_play/
- DCUO official level-scaling test: evidence that challenge/scaling is a live design question and should be tested, not guessed: https://www.dcuniverseonline.com/news/lvlsclng-test

### How to use this research
Forum posts are qualitative evidence and can be unrepresentative. Treat them as risks to test with playtesters, not a universal player vote. The requirements above are the design decisions for VELOCITY; they are not claims about every player's preferences.

---

## 2. Release definition: one coherent merge

The first release is a **complete vertical slice**, not a fake promise of MMO scale. It contains one polished district, a complete mission arc, repeatable street incidents, one named boss, meaningful rewards, and a replayable free-roam state. All core systems required to finish it must ship together.

### Required for release
1. Playable third-person speedster with stable camera and readable acceleration.
2. Sprint in forward, backward and lateral directions; jumping; air control; dodge; collision-safe traversal.
3. Functional light combo, heavy attack, kick, power attack, block/parry, lock-on and enemy reactions.
4. At least three regular enemy behaviours and one boss with distinct phases.
5. Mission tracker, objectives, interaction prompts, combat HUD, health/energy feedback, completion and failure/retry states.
6. Three mission types: story combat, rescue/interruption, and traversal/pursuit.
7. At least five optional street incidents that can be replayed.
8. Checkpoint/restart behavior and persistence for mission completion and unlocked abilities.
9. Audio/visual feedback that communicates hits, blocks, perfect dodges, objective changes and rewards without neon overload.
10. Deterministic scene load, no missing models, no invisible collision blockers, no invalid physics component values.
11. Automated scene/schema/gameplay smoke tests plus browser build validation.
12. A README/how-to-play page with actual controls and known limitations.

### Explicitly not required for this merge
- MMO servers, shared persistent world, matchmaking, raids, leagues/guilds, chat, trading, monetization or PvP.
- A giant city with many districts.
- A full character creator, dozens of power sets, crafting, loot rarity treadmill or hundreds of collectibles.
- A claim of AAA asset fidelity. Use existing licensed/CC0 catalog assets consistently; improve composition and lighting without pretending placeholder models are bespoke art.
- Exact DCUO characters, logos, storylines, maps, power names, UI layouts or extracted assets.

This scope is deliberately small enough to validate end-to-end and substantial enough to feel like a game rather than a tech demo.

## 3. Core player loop

### Moment-to-moment loop (10–90 seconds)
**Notice an opportunity → sprint/traverse → choose an approach → engage/rescue/intercept → react to readable threats → finish → receive feedback → keep moving.**

The travel between activities is gameplay, not empty downtime. Put the next visible landmark or incident within a short high-speed run. Avoid forcing the player to stop at menus between every event.

### Session loop (10–25 minutes)
1. Spawn at a safe city hub/checkpoint.
2. Main mission marker communicates the next story objective.
3. Player can take the main mission or two nearby optional incidents.
4. Mission changes the district state: civilians are safe, a roadblock is cleared, or enemy presence falls.
5. Earn one fixed reward and progress toward a named unlock.
6. Return to free roam with a new ability/perk or next story beat available.

### Long-term loop (after first completion)
- Replay story encounters on harder presets.
- Complete optional rescue/pursuit challenges for medals.
- Unlock sidegrades and cosmetic trails/finishes (default visual style remains restrained; effects are optional).
- Improve mastery through better movement lines, counters and boss execution—not by grinding hundreds of identical enemies.
- Future content can add districts and arcs using the same mission/encounter contracts.

---

## 4. Setting and district layout

### District: Meridian Ward
An original modern city district with a central commercial avenue, transit plaza, service alleys, small park, construction site, and elevated skybridge. It should feel dense and legible, not enormous.

### Spatial layout
- **Central Avenue:** main readable run lane, road markings, crosswalks, traffic signals, bus stop, parked vehicles. Primary orientation spine.
- **Civic Plaza:** safe start point, mission briefing/contact, recovery point, visible skyline landmark.
- **Market Row:** pedestrians/civilians and rescue incidents; tight turns reward controlled sprinting.
- **Transit Underpass:** ambush encounter and a line-of-sight/cover tutorial; safe alternate route exists.
- **Construction Rise:** ramp, low obstacles, scaffold/raised platform for jump and air-control challenge.
- **Service Alley:** optional pursuit route with corners, narrow passages and shortcuts.
- **Skybridge:** late mission set piece and boss arena transition; avoid requiring perfect platforming to progress.
- **Boss arena:** a broad, readable intersection with cover objects, escape lanes and clear telegraph space.

### Navigation rules
- Every major mission location has a unique silhouette, sign/colour family and skyline cue.
- The main route must be readable without a minimap; an optional compass/objective arrow can help.
- Shortcuts save time but never gate the mission.
- Keep collision volumes aligned with visible geometry.
- No enemies attack inside the hub or during the spawn/control handoff.
- The player can reach any story objective with standard jump/sprint; no optional ability is a hard gate before it is earned.

### Art direction
**Target:** grounded, colourful, cinematic superhero comic realism—not neon cyberpunk. Use warm daylight, neutral asphalt, concrete sidewalks, believable building palettes, restrained power effects and clear character silhouettes. Contrast should come from materials, lighting and composition, not full-screen bloom.
- Three building families and clear height variation.
- Distinct road/sidewalk/crosswalk materials.
- Street furniture at believable scale: signs, benches, bins, poles, bus shelters, planters and barriers.
- Trees and parked cars should frame routes without blocking collision or sightlines.
- Use normal/emissive maps only when supported and visually justified; avoid bright emissive material as a substitute for lighting.
- Hit effects are brief and local to contact. Do not cover enemy telegraphs with particles.
- Keep visual effects togglable or reduce them for motion sensitivity.

---

## 5. Player character and movement

### Character fantasy
The player is an original speedster called **Velocity**. Their power is momentum control: burst acceleration, impact timing and kinetic discharge. Do not use DC/Flash branding or imply affiliation.

### Movement state model
States: **Idle, Move, Sprint, Jump/Rise, Fall, Land, Dodge, AttackCommit, Block, Stagger, Knockdown, Interact**. State transitions must be explicit and tested. Avoid a state that can permanently trap the player.

### Baseline controls
| Action | Keyboard/mouse | Notes |
|---|---|---|
| Move | W/A/S/D | Camera-relative third-person movement |
| Look | Mouse | Pointer capture only during gameplay; release on pause |
| Sprint | Hold Shift | Builds speed in every horizontal direction; decelerates smoothly on release |
| Jump | Space | Jump buffering and coyote time tuned generously |
| Light combo | Left mouse / J | Quick chain, can be interrupted at defined cancel windows |
| Heavy | Right mouse / K | Slower, higher impact, guard pressure |
| Kick | L | Short-range knockback/spacing tool |
| Kinetic power | U | Spend energy for a ranged or gap-closing attack |
| Dodge | X / Alt | Directional evade with a short, bounded invulnerability window |
| Block / parry | Hold R | Reduces frontal damage; tight early window gives a parry |
| Lock target | Tab / middle mouse | Toggle nearest valid hostile; camera keeps both combatants readable |
| Interact | G | Rescue, talk, activate, disarm, use mission objects |
| Pause | Esc | Pauses simulation and releases pointer capture |

If the engine's canonical InputActions already reserves a key differently, reconcile the mapping once and show the final map in-game. Never silently bind one key to conflicting actions.

### Movement tuning goals
Values are targets to tune in playtests, not sacred constants:
- Normal movement: approximately 8–10 m/s equivalent.
- Sprint: approximately 2.3–2.8× normal speed, with a short acceleration ramp.
- Sprint must work with W, A, S and D; diagonal movement is normalized so it is not faster than straight movement.
- Ground acceleration should feel responsive; air control is lower than ground control but never zero.
- Jump should clear street barriers and reach obvious low rooftops/raised platforms.
- Landing must not cause long input lock.
- Collision response must not launch the player unpredictably or snag on small sidewalk seams.
- Dodge distance must be reliable and directional, with a cooldown short enough to support active play but not continuous invulnerability.
- Speed camera FOV easing is subtle, reversible and user-adjustable. Do not create motion-sickness-inducing snap zooms.
- During combat, movement speed may be reduced modestly, never to a helpless crawl. No frequent forced grounding.

### Speed mastery
Teach three movement skills through optional challenges:
1. **Cornering:** sprint, release briefly, turn, accelerate again.
2. **Jump line:** clear two obstacles without needing frame-perfect input.
3. **Momentum intercept:** reach a moving target and interact/attack before a timer expires.

Do not ship wall-running until it has reliable collision and animation support. It is a future capability, not a fake promise in the first release.

---

## 6. Combat design

### Combat principles
- Readable, fast, expressive and forgiving to learn.
- Every action has a purpose: light builds combo/energy; heavy punishes openings and guard; kick controls space; power attack spends energy; dodge avoids dangerous attacks; block protects; parry rewards timing.
- The player is rarely rooted for more than a short committed strike.
- Enemy attacks have telegraphs and recovery windows.
- A miss is recoverable. A failed parry is not an instant death sentence.
- Combat ends quickly against ordinary enemies, but named enemies require observation and adaptation.
- All fights are winnable solo through movement and timing, not mandatory gear checks.

### Player action kit
1. **Light combo:** 3–4 hit chain. Early hits are quick; final hit has a clear impact. Chain resets after a forgiving buffer window. Light attacks build a little energy.
2. **Heavy impact:** longer startup, higher damage/stagger, can break a guarding enemy. Telegraph is visible; whiff recovery is punishable but not excessive.
3. **Kinetic kick:** medium damage, good pushback, interrupts light enemy wind-ups.
4. **Kinetic burst:** spends energy; one reliable ranged attack and one forward lunge variant if supported. Avoid homing projectiles that remove aiming skill.
5. **Directional dodge:** evades a telegraphed attack. A precisely timed dodge grants a brief focus window and energy, but no long slow-motion sequence that interrupts flow.
6. **Block/parry:** block mitigates frontal hits and drains guard; a parry window near the start rewards deliberate timing and briefly staggers a standard enemy.
7. **Lock-on:** target switching cycles through nearby hostiles; unlock is immediate. Camera must not swing through walls or hide attack indicators.

### Combat resources
- **Health:** clear, persistent and recoverable at checkpoints/consumable pickups; no automatic death from a single unavoidable mistake.
- **Kinetic energy:** gained by landing attacks, parries and traversal challenges; spent on the power attack. Never require grinding a full bar before the first fight.
- **Guard:** player/enemy guard is a short tactical resource, not a second chore bar. Recovery begins after disengagement.
- **Combo counter:** purely feedback and optional medal scoring; it must not be required to deal normal damage.

### Enemy roster
| Enemy | Role | Signature behaviour | Counterplay |
|---|---|---|---|
| Street Enforcer | Baseline melee | Advances, strikes, recovers | Light combo, block/parry, dodge |
| Rusher | Flanker | Signals a fast straight-line charge | Sidestep/dodge; punish wall/obstacle miss |
| Suppressor | Ranged pressure | Telegraphs a burst and relocates | Break line of sight, close distance, dodge |
| Shield Heavy | Space controller | Guards front, slow guard-break slam | Circle, heavy/kick, dodge the red telegraph |
| Named boss: Breakline | Kinetic rival | Mixes charge, area slam and exposed recovery | Read phase cue, evade, punish, reposition |

Do not put all enemy types in the opening encounter. Introduce one new rule at a time and let the player practice it before combining rules.

### Boss: Breakline
Original antagonist: a former emergency-response engineer using stolen momentum-dampening equipment. Their technology creates short-lived impact fields; it does not permanently remove the player's powers.

**Phase 1 (100–70% health):** two-hit melee chain, clear shoulder wind-up, recovery after second strike. Teaches dodge and punish.  
**Phase 2 (70–35%):** adds a ground-slam ring with a safe gap/roll response and a charge that can be baited into barriers.  
**Phase 3 (35–0%):** faster combinations and a brief energy shield after a clearly signalled attack. Player must evade, let the shield expire, then punish. Do not make the boss invulnerable for long periods or require a hidden gimmick.

Boss requirements:
- Health bar, phase cues, attack telegraphs and recovery windows.
- No unavoidable chain attacks; player can recover from one mistake.
- Arena collision is checked against player dodge/jump envelopes.
- If the player dies, restart at the boss checkpoint with a quick retry, not a long commute.
- Victory has a readable finish, objective update, reward and exit back to free roam.

---

## 7. Mission campaign: first story arc

Campaign name: **Momentum: First Response**. Target completion time: 25–40 minutes for a new player, excluding optional activities.

### Mission 0 — First Response (tutorial, 3–5 min)
- Start at Civic Plaza with a safe control handoff.
- Sprint to a marked incident; use jump to clear a low barrier.
- Defeat one Street Enforcer.
- Rescue a civilian with Interact.
- Teach: movement, sprint, jump, light combo, heavy, dodge, interaction.
- Reward: Kinetic Burst becomes available; save checkpoint.

### Mission 1 — Streetlight (combat, 5–7 min)
- Respond to an attempted robbery at Market Row.
- Two standard enforcers, then one shield heavy with a visible guard-break telegraph.
- Objective steps: reach incident → defeat threat → inspect dropped device → secure scene.
- Introduce lock-on and block/parry.
- Reward: **Counter Pulse** sidegrade (parry grants slightly more energy; not mandatory).

### Mission 2 — No Brakes (pursuit/traversal, 4–6 min)
- A rogue delivery vehicle is carrying stolen kinetic cells through Central Avenue.
- Player sprints and jumps between safe route sections, catches up at two checkpoints and disables the cell rig at a final roadblock.
- Failure is forgiving: missed interception loops the player to a nearby catch-up point rather than restarting the entire mission.
- No precision platforming gate; multiple lanes and a ground route remain viable.
- Reward: **Momentum Control** passive (slightly faster sprint ramp or better air control; player chooses one).

### Mission 3 — Aftershock (rescue/interruption, 5–7 min)
- Construction scaffolding collapses after a device overload.
- Rescue three civilians in any order; each rescue is a short interaction protected by an interruptible nearby threat.
- Rescue route has alternate entry points. No civilian can be permanently lost because of an unavoidable timer.
- Optional medal for all rescues with no civilian damage.
- Reward: cosmetic trail/landing effect, off by default if effects are disabled.

### Mission 4 — Breakline (boss finale, 8–12 min)
- Follow evidence from the previous missions to the Skybridge/intersection arena.
- Brief, skippable intro. Fight Breakline in three readable phases.
- After victory: district threat drops, contact acknowledges the player's work, campaign completion is saved.
- Unlock free-roam incident board and hard replay preset.

### Narrative tone
Hopeful and street-level, not grimdark. The city needs help, ordinary people matter, and the hero's speed creates responsibility. Use short dialogue, environmental storytelling and mission context; never make the player read paragraphs while an active threat is attacking.

---

## 8. Repeatable activities (not chores)

At least five incidents exist in free roam, with a clear icon, short intro, and reward. Each should take 45 seconds to 3 minutes.

1. **Robbery in Progress:** defeat two or three enemies; optional no-civilian-hit bonus.
2. **Medical Dash:** carry/escort a civilian or deliver a first-aid kit to a nearby safe point; route choices matter.
3. **Runaway Rig:** intercept a vehicle through a short street course; generous catch-up.
4. **Device Shutdown:** reach three visible interactables under light enemy pressure; any order allowed.
5. **Roofline Relay:** timed traversal gates; medal thresholds based on route quality, not pixel-perfect jumps.
6. **Ambush Breaker (stretch if schedule allows):** survive waves with clear enemy tells and no infinite spawns.

Rules:
- Incident cooldown is short and local; no real-world timer.
- Rewards are deterministic and clearly previewed.
- Repeating the same incident should not be required for story progression.
- Once an incident is completed, the player can leave immediately; no forced return-to-hub animation.
- Avoid spawning enemies on top of the player or inside the safe hub.

---

## 9. Progression and rewards

### Three progression tracks
1. **Story unlocks:** abilities granted at specific missions. No random chance.
2. **Mastery choices:** small sidegrades that change play style; only one choice per tier to keep decisions readable.
3. **Cosmetics:** suit colour/material variants and optional restrained speed/impact effects. Visual rewards never increase combat stats.

### First-release mastery choices
- **Momentum Control:** faster sprint acceleration OR improved air steering.
- **Counter Pulse:** more energy from parry OR shorter dodge recovery.
- **Kinetic Focus:** stronger heavy stagger OR cheaper kinetic burst.

Every choice must be explained in one sentence and previewed. No choice should be a strict best-in-slot for every situation. Allow respec at the hub for free during the first release.

### Reward economy
- Mission rewards are fixed.
- Optional medals grant cosmetics/mastery tokens.
- No premium currency, loot boxes, duplicate drops, gear-score treadmill, daily login requirement or pay-to-win design.
- UI always explains what an unlock does and where it can be equipped.

### Difficulty
- **Story:** generous telegraphs, lower enemy pressure, all story content available.
- **Heroic:** faster enemy recovery and slightly more complex combinations; same core mechanics.
- **Challenge:** replay reward/medal variant for players who want mastery. Never the only way to obtain story or core movement abilities.
- Avoid level scaling in the first slice unless testing shows it is needed. Fixed, predictable encounter tuning is easier to understand and validate.

---

## 10. HUD, menus and feedback

### During exploration
- Small mission objective and distance/heading indicator.
- Context prompt near an interactable.
- No persistent giant minimap; optional compact map/compass is acceptable.
- HUD opacity and scale settings.
- Mission progress updates only when state changes; do not spam messages every frame.

### During combat
- Player health and kinetic energy near a consistent screen corner.
- Target name/health and lock-on marker.
- Boss bar and phase cue at the top.
- Combo counter near combat focus but not over the target.
- Parry success, dodge success, guard break and objective change use distinct sound + visual cues.
- Enemy attack telegraphs use shape, motion and contrast—not colour alone.

### Pause/settings
- Resume, restart checkpoint, restart mission, controls, audio, camera sensitivity, invert-Y, motion effects and quit to title.
- Pause freezes enemies and mission timers.
- Pointer lock is released when paused and reacquired only after an intentional return to gameplay.
- Restart is always available after a stuck state.

### Feedback timing
- Hit response occurs at the actual damage frame.
- Light hit: small recoil and clear impact sound.
- Heavy hit: stronger stagger/camera impulse, short and adjustable.
- Parry: distinctive ring and brief enemy recovery.
- Objective completion: one clear message, progress change and reward confirmation.
- Keep camera shake low by default and provide an off switch.

---

## 11. Technical implementation contract for this engine

### Existing capabilities to reuse
The engine already has third-person CharacterController movement, named InputActions, Melee combo/special/dodge/block/lock-on mechanics, Health, AI melee brains, CameraFollow, UI, catalog models, and scene JSON. Reuse those systems instead of writing a second combat framework. Confirm exact component fields against the current engine schema before editing.

### Required system boundaries
- **Scene/content:** authored entities, transforms, colliders, model instances, materials, environment and static UI.
- **Player movement:** existing CharacterController plus a tested sprint/camera configuration.
- **Combat:** existing Melee and Health components; tune move lists and enemy stats through data, not bespoke per-enemy C++.
- **Mission director:** small, explicit state machine for mission stage, objective counts, incident activation, rewards and completion. If current scene Script callbacks are insufficient, implement the minimum reusable mission component/API in engine code with unit tests; do not bury mission logic in brittle name checks.
- **Save state:** versioned, minimal local save for campaign completion, selected mastery and unlocked abilities. Validate missing/corrupt save data and provide safe defaults.
- **HUD:** objective and combat status updated from mission/combat events, not per-frame string rebuilding.
- **Input:** one canonical map, no conflicting bindings; default keyboard/mouse plus existing gamepad action names where supported.
- **Content IDs:** use validated catalog IDs and current scene schema; no guessed model IDs or external asset URLs.
- **Collision:** static city geometry has deliberate collision; decorative props do not create invisible walls; dynamic fighters have correct mass/health/collider values.

### Suggested mission state model
`Locked → Available → Active → ObjectiveComplete → Rewarded`  
Failure/abandonment returns to a defined checkpoint; mission restart resets encounter actors, objective counts, interaction flags and boss phase. Each state transition must be idempotent so a duplicate event cannot award a reward twice.

### Suggested encounter state model
`Dormant → Alerted → Engaged → Defeated` for regular groups.  
Boss: `Intro → Phase1 → Phase2 → Phase3 → Defeated`.  
Death/retry resets all combatants and telegraphs. No actor can remain permanently invulnerable after reset.

### Data validation
At load/test time, verify:
- Required components and fields are present.
- Health maximum is positive and current health is clamped.
- Dynamic rigid bodies have valid positive mass.
- Team IDs separate player and hostile AI.
- The Player has a CameraFollow target and a usable Camera setup.
- Every mission objective references an existing entity/event.
- Every interactable has an action and completion state.
- Every referenced model/catalog ID exists.
- No enemy spawns in a safe zone.
- All UI text and controls match actual bindings.

---

## 12. Acceptance tests — merge is blocked until these pass

### A. Boot/load
- VELOCITY appears in the Games list and loads without missing assets or console exceptions.
- Player, city geometry, trees, cars, props, camera and UI are visible.
- Restart produces the same clean starting state.
- No invisible physics entity blocks the street at origin.

### B. Movement
- W+Shift, A+Shift, S+Shift and D+Shift each increase speed over their non-sprint counterparts.
- Diagonal sprint speed is normalized.
- Sprint release decelerates without a sudden stop or permanent drift.
- Jump, air steering, landing and dodge recover control reliably.
- Player can traverse every mission route without clipping through the floor or becoming trapped.
- Camera stays readable at normal and sprint speed and never permanently loses the player.

### C. Combat
- Light attacks chain, hit targets at plausible range and do not hit through walls.
- Heavy and kick have distinct timing/impact.
- Kinetic burst consumes energy and cannot consume below zero.
- Dodge is directional and its invulnerability duration is bounded.
- Block protects from the front; parry timing causes a clear, testable response.
- Lock-on can select, switch and release targets; defeated targets are removed from the target cycle.
- Enemy AI engages the player, telegraphs attacks, takes damage and is defeated.
- Shield Heavy can be beaten by circling, guard-breaking or evading—not by one unintended exploit.
- Boss phase transitions happen exactly once at the intended health thresholds.
- A dead player can retry without restarting the whole game.

### D. Mission and rewards
- Every mission can be started, completed and replayed.
- Objective UI reflects authoritative state, not stale text.
- Interaction cannot complete twice from repeated key presses.
- Rescue progress counts each civilian exactly once.
- Pursuit failure recovers at a nearby checkpoint.
- Campaign completion and chosen mastery persist after reload.
- Corrupt/empty save data does not prevent boot.
- Optional activities never block story completion.

### E. UX/accessibility
- Pause freezes AI, movement, attacks and timers.
- Mouse capture is released on pause/focus loss.
- Settings persist and actually change the relevant behavior.
- Reduced-motion mode disables/reduces camera shake and speed FOV effects.
- Controls shown on screen match real bindings.
- Important combat cues have a non-audio signal.

### F. Performance and regression
- Game-specific browser smoke test covers boot, movement, one fight, mission completion and restart.
- Shared engine changes run full engine/browser regression; scene-only changes use focused VELOCITY validation plus build/schema checks. Preserve the repository's existing CI policy: do not run every unrelated game's browser tests for a VELOCITY-only content edit.
- No uncaught errors, runaway entity spawning, stuck timers or repeated reward grants.
- Capture a short recorded/manual playthrough as evidence after merge; do not claim visual/gameplay verification based only on a successful compile.

---

## 13. Implementation order inside the one release

This is the dependency order, not a series of incomplete public releases. Keep all changes in one coherent release PR unless a shared-engine risk genuinely requires separation.

1. **Audit schema and content:** validate current scene JSON, component fields, catalog references and current branch/main. Keep sprint fixes and non-neon look.
2. **Freeze movement contract:** test sprint in all directions, jump/air control, collision and camera before building mission routes.
3. **Finish combat tuning:** ensure each player action and enemy counter works with actual engine bindings; add combat test coverage.
4. **Add mission director and save state:** implement state transitions, idempotent rewards, checkpoints and reset logic.
5. **Build campaign encounters:** author mission triggers/actors/props using data; add the three mission types and boss phases.
6. **Add street incidents and progression:** deterministic rewards, sidegrade choices, cosmetic unlock.
7. **Polish UX and art composition:** daylight materials, city landmarks, restrained effects, readable UI and accessibility settings.
8. **Automated and manual QA:** run focused browser tests, engine tests when shared systems change, verify controls by actually playing, record evidence.
9. **Release packaging:** update How to Play, known limitations, version/changelog and game launch entry. Only merge when acceptance tests pass.

### Merge rule
A green compile is necessary but insufficient. If a requirement is not implemented or cannot be tested, mark it explicitly as deferred and do not advertise it as present. The merge description must list the tested actions, exact controls, known limitations and evidence link.

---

## 14. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Combat animations lock the player in place | Keep short commitment windows, cancel points and movement options; test against forum feedback about sluggish combat |
| Sprint feels fast but the world looks slow | Stronger near-field parallax, stable landmarks, subtle FOV easing and consistent distance/time tests |
| City looks like a prop pile | Limit asset families, establish a street hierarchy, vary building silhouettes and light consistently |
| Missions become repetitive chores | Short varied incidents, fixed rewards, no daily timer, no mandatory repetition |
| Boss difficulty becomes unfair | Clear telegraphs, phase-by-phase tests, checkpoint retry and solo completion |
| Scene data becomes fragile | Schema validation, catalog ID checks, explicit mission states, deterministic reset |
| Too much scope delays a playable result | One district and four story missions; no MMO/networking or sprawling city in this release |
| Visual effects undermine readability | Restrained effects, telegraph contrast, reduced-motion setting, no neon bloom by default |
| Forum anecdotes are overgeneralized | Treat them as hypotheses and run focused playtests; gather completion, death, abandon and control-failure data |

---

## 15. Playtest protocol and success criteria

Test with at least five people who did not build the game, including people who do not regularly play action games. Do not coach them unless they are stuck for more than 60 seconds.

Record:
- Time until the player understands sprint and jump.
- Time until the first enemy is defeated.
- Number of missed/unclear attacks and unexplained deaths.
- Mission completion and abandonment.
- Whether they discover dodge, block/parry and lock-on without being told.
- Which activity they voluntarily replay.
- Whether they describe movement as fast, responsive and controllable.
- Whether any visual effect hides enemy intent.
- A one-question rating after each mission: “Was that fun enough that you would choose to do it again?” plus free-text reason.

### Ship thresholds
- At least 4/5 first-time testers learn movement without verbal coaching.
- At least 4/5 complete Mission 0 and defeat the first standard encounter.
- All testers can identify the boss's major telegraphs after two attempts.
- No progression-blocking bug in any full campaign run.
- No tester must grind or recruit another player to finish the story.
- The majority voluntarily replay at least one optional activity; if not, revise the activity rather than adding more chores.
- Every core acceptance test in Section 12 passes.

These thresholds are directional for a small sample, not statistically representative claims.

---

## 16. Release checklist

- [ ] Game boots from the editor's Games list and from the published entry point.
- [ ] Daylight/regular non-neon art direction retained.
- [ ] Shift sprints forward, backward, left and right.
- [ ] Mission arc, incidents, enemies, boss and rewards are playable end-to-end.
- [ ] Keyboard/mouse controls and supported gamepad bindings are documented.
- [ ] Save/restart/checkpoint behavior verified.
- [ ] Reduced-motion, camera and audio settings work.
- [ ] No broken assets, schema errors, invisible blockers or console exceptions.
- [ ] Automated focused tests and applicable regression checks pass.
- [ ] Manual playthrough evidence attached to PR/release notes.
- [ ] Known limitations are written honestly.
- [ ] No copied DCUO branding, characters, story, proprietary UI or extracted assets.

**Definition of done:** A new player can launch VELOCITY, understand the controls, experience fast traversal, complete a varied superhero mission arc, defeat a readable boss, unlock a meaningful choice, and continue free-roaming—with no developer intervention and no mandatory multiplayer or grind.
