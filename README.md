# Game Engine

[Open the editor](https://islandyout.github.io/engine/) — build and play games entirely through it; this is the only supported way to play what you build.

**[Play LAST SIGNAL](https://islandyout.github.io/engine/last-signal.html)**, a first-person shooter built entirely in the editor's data and Lua on this engine ([design document](docs/fps/GAME_DESIGN.md)).

**[Play HIGH HEAT](https://islandyout.github.io/engine/high-heat.html)**, an open-city street racer with police pursuits ([design document](docs/racing/GAME_DESIGN.md)).

**[Play Pale Signal](https://islandyout.github.io/engine/pale-signal.html)**: six worlds, the Talari and two lost civilizations, gathering, survival, an autopilot, and seven signal fragments that lead to a hidden world, with no loading screens ([game document](docs/space/PALE_SIGNAL_SLICE.md)).

**Games library**: the editor's **Games** button lists every game in [`games/`](games/README.md); add your own under `games/my-games/`.

The integrated editor provides scene authoring, component inspection, undo/redo, JSON save/load and a Three.js viewport connected to the C++ fixed-step world through WebAssembly. See [the editor contract](docs/BTAI_EDITOR.md) for build instructions and supported behaviors.

This repository is the implementation companion to `GAME_ENGINE_BIBLE_v0.6_RESEARCH.md`.

Version 0.9.0 adds move/rotate/scale editor gizmos, snapping, component dropdowns and reset controls. Edits pass through the authoring API and undo/redo. Headless C++ builds remain independent of browser and desktop libraries.

Engine version 0.10.0 adds native physics: gravity, an implicit ground plane, and axis-aligned collision (`engine::physics`), wired into the native playground as a Shift-to-jump controllable character that collides with the field boxes and spawned crates. See [Physics](docs/NATIVE_PLAYGROUND.md#physics).

Engine version 0.11.0 adds `engine_playground --save-scene`, writing the live world as the same "format 1" JSON the editor loads and saves, completing native/editor scene round-trip. See [Saving a scene](docs/NATIVE_PLAYGROUND.md#saving-a-scene).

Engine version 0.12.0 adds a playable slice: a short jump-across-platforms path to a gold goal marker in the native playground, completing the Aether-review roadmap's delivery sequence. See [Playable slice](docs/NATIVE_PLAYGROUND.md#playable-slice).

Engine version 0.13.0 unifies `Box` lighting with the mesh renderer's real directional light (no more canned per-face brightness table), and adds sustained flight: hold jump while airborne to climb instead of just arcing through one jump. See [Physics](docs/NATIVE_PLAYGROUND.md#physics).

Engine version 0.14.0 adds camera follow (the player stays centered on screen instead of walking off it — see [Camera](docs/NATIVE_PLAYGROUND.md#camera)) and the first slice of combat: a defeatable enemy near spawn, attacked with F. See [Combat](docs/NATIVE_PLAYGROUND.md#combat).

Engine version 0.15.0 adds the engine's first HUD element: a screen-space health bar for the enemy from 0.14.0's combat, via a new `BoxView::draw_bar`. See [HUD](docs/NATIVE_PLAYGROUND.md#hud).

Engine version 0.16.0 adds a second, ranged combat option: press G to fire a traveling "blast" projectile at the enemy instead of needing to be right next to it. See [Combat](docs/NATIVE_PLAYGROUND.md#combat).

Engine version 0.17.0 connects the browser editor's Play mode to real engine physics: every entity now falls under gravity and rests on the ground plane using the same `engine::physics` module the native playground uses, instead of the old naive constant-velocity placeholder. This is the first step in wiring all engine capability into the editor itself, so games can be built through the editor rather than only in the native playground. See [the editor contract](docs/BTAI_EDITOR.md#real-c-runtime-connection).

Engine version 0.18.0 removes Field Lab, the standalone browser demo that used to sit at the published site's root, and makes the editor the site itself. Field Lab was a second, non-editor way to interact with compiled engine content that no longer served a purpose distinct from the editor after 0.17.0 — nothing engine-level was lost, since it was built entirely on already-shared engine types the native playground and its tests also use. See [F18](docs/changelog/F18.md).

Engine version 0.19.0 adds a 103-model catalog to the editor: buildings, furniture, nature, roads, signs and vehicles from the same CC0-licensed Aether kit the bundled bench came from, browsable by category and placeable from the Project/Content panel or the inspector's Model dropdown. See [F19](docs/changelog/F19.md).

Engine version 0.20.0 brings the remaining 27 rigged, animated models (animals and people) into the same catalog, each playing its own embedded idle/walk/run animation clips through Three.js's `AnimationMixer`, crossfading based on the entity's actual measured speed. See [F20](docs/changelog/F20.md).

Engine version 0.21.0 folds the original Aether bench into the model catalog as its own entry (id 1) instead of a separate standalone button, so there's one consistent way to browse and place every bundled model. See [F21](docs/changelog/F21.md).

Engine version 0.22.0 adds player control to the editor: tag an entity `Player` and drive it with WASD, jump with Shift (hold while airborne to fly, ported from the native playground's own tuned feel), and the camera follows. This is the first of three rounds closing the remaining gap with the native playground — collision with what you build, then combat/flight/HUD, are next. See [F22](docs/changelog/F22.md).

Engine version 0.23.0 makes `Collider` obstacles actually block movement in the editor — round 2 of that same plan: any entity authored with a `Collider`, the same component the editor already let you attach but never consulted, now stops the player (and any other moving entity) instead of letting it pass straight through. Combat, flight and HUD are next. See [F23](docs/changelog/F23.md).

Engine version 0.24.0 adds combat — round 3 of 3, closing the remaining gap with the native playground: F is melee, G fires a ranged blast at the nearest target, and any entity with a `Health` component can now be damaged and defeated by either. A screen-space health bar (plus a status-bar text readout) shows it happening. See [F24](docs/changelog/F24.md).

Engine version 0.25.0 fixes movement feel, based on direct feedback after 0.22–0.24 shipped: WASD is now camera-relative (fixing the "flipped" feel a fixed world axis had the moment the camera wasn't looking straight down -Z), a moving character turns to face where it's actually going instead of sliding through its run animation, jump gets a squash-and-stretch instead of a flat vertical translation, and `Vehicle` — previously inert data — now makes a `Player` entity accelerate and steer like a car instead of strafing. `examples/demo-game.json` is a small drivable-car-in-an-arena scene built to dogfood all of it together. See [F25](docs/changelog/F25.md).

Engine version 0.26.0 fixes an authored `Scale` component being applied to a catalog GLB model on top of that model's own real-world dimensions instead of as the literal size it's documented to be — found by actually building the browser editor and playing `examples/demo-game.json`, where it made the Player Car render nearly as long as the arena's own walls. The viewport's transform gizmo got the same fix, so dragging a catalog model's scale handle now saves literal dimensions instead of a value that would shrink it back down on the next rebuild. See [F26](docs/changelog/F26.md).

Engine version 0.27.0 wires up `AIState` and `Pedestrian`, found fully authorable in the editor but never actually simulated — an engineering audit against Unity/Unreal/Godot/Bevy/PlayCanvas flagged it as the exact same "authored but inert" bug `Vehicle` had before 0.25.0. An `AIState`-tagged entity now wanders on its own, chases the nearest `Player` within range, and flees instead once its own health runs low; a `Pedestrian` marker keeps it harmless, never chasing. `examples/demo-game.json`'s two combat targets react to the player now instead of just standing there, and a new wandering `Bystander` populates the arena. See [F27](docs/changelog/F27.md).

Engine version 0.28.0 adds the one thing that same audit flagged as the real gap between this and a real game engine: a way to add new gameplay behavior from inside the editor, without editing and recompiling C++. Any entity can now carry a `Script` component — Lua, written directly in the inspector — with an `on_tick(dt)` that reads its own position and writes velocity, same as `Player`/`Vehicle`/`AIAgent` already do. The embedded Lua 5.4 interpreter is vendored so it runs identically native and in the WASM browser build, sandboxed at compile time (no filesystem, process, or module-loading libraries even built in) and at runtime (no `load`/`dofile`, an instruction-count watchdog against infinite loops), and a script that errors reports once through the inspector's status bar instead of crashing anything. See [F28](docs/changelog/F28.md).

Engine version 0.29.0 adds prefabs: author an entity's components once (say, "Player Car"), place as many instances as you like, and editing the shared definition updates every instance live — no separate "apply to all" step, and no way for an instance to silently drift out of sync, since only `Transform`/`Name`/`Parent` are ever per-instance and everything else is read straight from the shared definition. The inspector gets a "Make prefab…" button and, for a placed instance, an "Unlink from prefab" button to detach it as a standalone entity; the dock gets a prefab picker to place further instances. Entirely a browser-editor authoring-layer feature — no engine or bridge changes. See [F29](docs/changelog/F29.md).

Engine version 0.30.0 closes out Tier 1 with audio — there was none at all before this. A `Sound` component picks a clip from a small bundled catalog (a curated 10-file subset of four Kenney.nl CC0 packs — two loop-friendly ambiences, eight one-shot stingers) and plays it through the real Web Audio API, starting when Play begins and stopping when it ends, the same Play-scoped lifecycle `Script` and `AIAgent` already run under (not event-triggered per-hit SFX — that needs the bridge to expose which tick an event fired, out of scope here). Pause suspends the whole audio clock in place rather than muting; `Sound` is prefab-shared like `Renderable`. See [F30](docs/changelog/F30.md).

Engine version 0.31.0 opens Tier 2 with real physics shapes. The inspector has offered a `Collider.type` ("AABB"/"Sphere") and `radius` for a while, but the engine had no shape concept at all — every collider, however authored, resolved as an AABB from `Box.size`, and `radius` was silently discarded before it left the browser, the same "authored but inert" bug class `AIState`/`Vehicle` had before their own rounds. A `Collider` now really can be sphere-shaped, resolved with actual closest-point/separation-vector math instead of always box-vs-box, and a new `raycast()` API (box slab test, sphere quadratic, plus the ground plane) is ready for gameplay that needs to know what's in front of something — sequenced first in Tier 2 specifically because later items (AI line-of-sight, aiming) will need it. See [F31](docs/changelog/F31.md).

Engine version 0.32.0 investigates a report that the bundled Aether-kit `animals/**`/`people/**` animations "looked weird." A bone-world-position dump during a live Player-driven run and an isolated render outside the editor both confirmed the rig/clip data itself was fine; the one real bug found was `main.ts`'s `THREE.WebGLRenderer` never setting `toneMapping`/`outputColorSpace`, so `HemisphereLight(3)` + `DirectionalLight(3)` blew out highlights and crushed shadow faces on the kit's low-poly materials — fixed with `ACESFilmicToneMapping`/`SRGBColorSpace`. Separately, the user supplied three Quaternius CC0 1.0 animation packs; a new "Mannequin F" catalog entry (people) combines Quaternius's Female Mannequin mesh with locomotion clips from their Universal Animation Library, and four new self-contained animals (Wolf, Husky, Stag, Alpaca) join the animal roster — added alongside the existing Aether kit, not replacing it. See [F32](docs/changelog/F32.md).

Engine version 0.33.0 makes `AnimationState` — a component that had been fully wired for authoring, saving, and loading since early on, but never actually read by anything — do what its fields already promised: an inspector "Add component → AnimationState" now shows a "Clip" dropdown built from that specific entity's own animated model (a Cow offers `walk`/`graze`, a Hero offers `wave`/`sit`; nothing catalog-wide), picking one plays and pins that clip immediately in Edit mode preview, and Play mode's own ground-speed-based clip switching steps aside for it instead of fighting it every tick. `clip` changes from a bare numeric index to a string clip name, since — unlike `Sound.clip`'s one shared catalog — every animated model has its own differently-named clip set. See [F33](docs/changelog/F33.md).

Engine version 0.34.0 is a direct user-feedback pass on the inspector's "Add component" list, right after F33 shipped: one flat, alphabetical-ish list of 16 raw type names (`RigidBody`, `AIState`, `AnimationState`) was confusing, and F33's own new clip picker was reachable only by already knowing to add `AnimationState` first. The list is now grouped into `<optgroup>`s that keep components which only make sense together next to each other — `AIState`/`Pedestrian` (`Pedestrian` just marks an `AIState` entity harmless), `Player`/`Vehicle` (`Vehicle` only does anything once `Player` is driving it), `Renderable`/`AnimationState`, and the `Velocity`/`Acceleration`/`RigidBody`/`Collider` movement-and-collision chain — with friendlier labels on the ones that needed it ("AI Behavior", "Physics Body"). The animation clip picker itself moves into the `Renderable` card directly, right under "Model": picking a clip there auto-attaches `AnimationState` for you, no separate detour required: `AnimationState`'s own card (now labeled "Animation (advanced)") still exists for `time`/`looping`, just isn't the only door in anymore. See [F34](docs/changelog/F34.md).

Engine version 0.35.0 wires up `Vehicle.archetype` and `Pedestrian.archetype`, which had been authorable and saved since early on but never actually read by anything — a plain number with no effect, the same "authored but inert" gap this project keeps finding and closing. A `Vehicle` now picks one of four real handling profiles (Car/Sports/Truck/Bus — different accel, drag, top speed, and turn rate each, not just a uniform scale), and a `Pedestrian` one of three wander-pace profiles (Casual/Brisk/Lingering — how long it lingers between phases and how briskly it moves once it does; its flee reflex stays unscaled, since that's self-preservation, not personality). Both inspector fields are real dropdowns now (`Car`/`Sports`/`Truck`/`Bus`, `Casual`/`Brisk`/`Lingering`) instead of a bare number, and an out-of-range value is rejected outright rather than silently clamped or accepted. See [F35](docs/changelog/F35.md).

Engine version 0.36.0 makes the Aether kit's 12 `Npc *` catalog characters (Casual 1/2, Dress, Elder, Hoodie, Office F/M, Sport, Teen, Uniform, Vendor, Worker) move as smoothly as 0.32.0's Mannequin F import, without replacing them with copies of it. The rig, skinning, and animation curves were already fine; the actual gap was geometry — every limb/torso/neck segment was a tapered cylinder built from one flat-shaded quad per side segment, a faceted pipe rather than a rounded limb. The procedural generator that builds these characters gains a smooth-shaded cylinder primitive (shared vertices, per-vertex normals, the same technique its existing joint-cap spheres already used) and every character is regenerated with it — same skeleton, outfits, proportions, and clips, just a rounder surface. See [F36](docs/changelog/F36.md).

Engine version 0.37.0 removes `Hero` and every `Npc *` catalog character outright (ids 119-131, both the catalog entries and their `.glb` files, plus the now-unused generator tooling F36 vendored to rebuild them), clearing the way for an imported, skeleton-rigged character pack requested in their place. The import itself isn't in this round — `drive.google.com` is blocked by this sandbox's network policy, so the 734 MB file supplied as a share link couldn't be fetched here; a direct upload, the pattern every prior asset import in this project has used, is what the follow-up import-and-skeleton-wiring round needs. See [F37](docs/changelog/F37.md).

Engine version 0.38.0 lands that import: a new `Mannequin F (Mixamo)` catalog character (id 137), with three Mixamo animations (`Flying`, `Firing Rifle`, `Punching`) actually rigged and playing. The first attempt — retargeting a 263-clip Rokoko mocap library onto Mannequin F's existing skeleton — was tried, screenshotted, shown to visibly collapse into a twisted heap, and abandoned rather than shipped broken; the two rigs' bone axis conventions don't reconcile under a simple correction. Mixamo's free Auto-Rigger sidesteps that entirely by rigging and animating the same mesh in one pass, so this entry has its own skeleton (Mixamo's standard rig) rather than sharing one with the original Mannequin F. One accepted trade-off: the mesh's original two-tone material didn't survive the round trip and is recolored to a single flat lavender rather than left grey. See [F38](docs/changelog/F38.md).

Engine version 0.39.0 adds a real `Light` component (Point/Spot/Directional, color, intensity, Point/Spot's own range, Spot's own cone angle) — any entity can now carry an actual light, not just the scene's fixed hemisphere+sun ambience every entity has always shared. A subtle, always-on bloom post-process rides along, matching this project's existing preference for fixing the default look rather than exposing a render knob. Purely presentational, like `Sound`/`AnimationState` before it — confirmed by checking `editor_add`'s own ABI before assuming so, rather than after — so this needed zero native `bridge.cpp` changes, the smallest surface of any component addition so far. See [F39](docs/changelog/F39.md).

Engine version 0.40.0 adds a real `Particles` component (Sparkle/Smoke/Fire/Confetti presets, color, emission rate, lifetime, speed, size) — any entity can now carry a lightweight `THREE.Points` emitter, simulated every frame in both Edit and Play mode. Purely presentational like `Light` before it, so this needed zero native `bridge.cpp` changes either. Particles live under the same always-visible `anchor` group F39's own post-push fix introduced, so a Particles emitter's visibility is independent of `Renderable.visible` from day one. See [F40](docs/changelog/F40.md).

Engine version 0.41.0 adds `tools/import_model.mjs`, a reusable CLI that replaces the one-off script every prior model import (the Aether kit, Quaternius packs, F37/F38's Mixamo import) hand-rolled from scratch. Point it at a local `.glb`/`.fbx`, give it a category and display name, and it validates the file, copies/re-exports it into `assets/source/kit/`, inserts a new `modelCatalog.ts` entry (auto-detecting `animated` from the file's own `AnimationClip`s), and prints an `assets/CREDITS.md` draft with the mechanical facts already filled in — it deliberately doesn't write the provenance/license claim itself, or automate combining multiple source files onto one mesh/skeleton (still a bespoke script, same as the Mixamo/Quaternius merges). See [F41](docs/changelog/F41.md).

Engine version 0.42.0 adds `tools/export_build.mjs`, which packages one authored scene into a standalone, shareable player build — no separate player codebase, just the same browser editor build with a new `.player-mode` CSS class hiding every editor-only affordance and the scene baked in and started automatically. Real visual gameplay only exists in the browser build (the native playground renders flat colored boxes, a simulation-correctness proof, not a real renderer), so a native distributable was out of reasonable scope; asked the user to confirm before committing to that direction. Testing the exported player in a real browser surfaced and fixed a genuine pre-existing race: a player build starts Play immediately, before catalog model fetches resolve, and the existing edit-mode-only rebuild guard (correctly, to avoid resetting simulated state mid-Play) never picked them up afterward — fixed by preloading every referenced model before the first Play. See [F42](docs/changelog/F42.md).

Engine version 0.43.0 adds a real `UI` component — screen-anchored (not 3D) Text and Button elements, rendered on the existing HUD canvas, that a scene author can use to build either a HUD or a menu. Button's first design gave it a free-form JSON command, reusing the Authoring Console's own execution path — until an actual click-through test (not just checking it rendered and stored correctly) revealed `EditorDocument.execute()` unconditionally rejects every command outside Edit mode, meaning a Button (only ever clickable in Play/Pause) could never actually do anything. Redesigned around a small fixed action vocabulary instead — `restart`/`resume`/`pause`/`quit` — each one implemented by clicking the real, already-correct Play/Pause/Stop transport button rather than going through `doc.execute()` at all. See [F43](docs/changelog/F43.md).

Engine version 0.44.0 adds a `save` table to every sandboxed Lua VM — `save.set(key, value)`/`save.get(key)` — so a script can persist a small value (score, unlocked level, position) across Play sessions, backed by `localStorage` in both the editor and the exported standalone player, namespaced per export via `document.title` so two exported games sharing a browser origin don't clobber each other's save data. Named a table rather than two bare globals specifically because `load` is one of the five base-library names this sandbox already removes to block loading code from outside a script's own source — reusing that name for an unrelated getter would misleadingly suggest it was still reachable. The real-browser verification's own first attempt produced a misleading result before the actual code did: a same-`Runtime` `save.set` is visible to a `save.get` moments later in the very next fixed tick of the same catch-up burst, which made a naive "does the first session behave differently from a restored one" script unable to tell its own prior write from a truly separate session's — fixed by testing each direction of the round trip against `localStorage` and a value planted independently of any script, not a script's read of its own recent write. See [F44](docs/changelog/F44.md).

Engine version 0.45.0 gives hostile AI a real attack. Started from a user report — catching a Chasing enemy "does nothing" — that led to reading the actual combat code rather than guessing: `damage()` was only ever called from the Player's own melee/blast, never the other way around, so combat was one-directional by construction. A new `editor.ai_attack` system lets a `Chasing` `AIAgent` (never `Fleeing`, never a `Pedestrian`) land a hit on the Player, rate-limited by a per-agent cooldown so it's a real fight, not an instant, un-reactable death at 60 hits/second. Weaker than the Player's own melee, and a no-op unless the Player has `Health` authored at all — the same opt-in contract every other entity already has, which also means the existing generic HUD Health bar shows the Player's own health for free. The same investigation surfaced two more real gaps (an instant, animation-less death; no key→animation binding) the user flagged separately — deferred to their own rounds rather than scope-creeping this one. See [F45](docs/changelog/F45.md).

Engine version 0.46.0 replaces an instant "pop" on defeat with a real death sequence — a clip, if the model has one, then a fade out over a second before the entity finally disappears. Entirely a rendering concern, so it lands in `main.ts` with zero engine-core changes; the one real subtlety is that every material a catalog model (or the plain placeholder box) uses is shared across every placed instance of it, so fading one in place would have incorrectly faded every other entity using the same model — fixed by cloning materials lazily, only for the one object that's actually dying. Verified against a real running session (a temporary debug hook, removed before commit, polled the actual opacity value frame by frame: a smooth 0.75→0.58→0.42→0.25→0.08→hidden, not an instant jump) and confirmed a sibling sharing the same base material stayed untouched throughout. See [F46](docs/changelog/F46.md).

Engine version 0.47.0 answers the third gap-audit item — no way to tie a specific key to a specific animation. A new `input` table (`input.down(key)`/`input.pressed(key)`, level and edge respectively) and a write-only `self.animate` field extend the same sandboxed Lua `self`/`save` API already used elsewhere: `if input.pressed('f') then self.animate = 'Attack' end` in a Script component now actually plays that clip as a one-shot in Play mode, crossfading in and handing control back to normal locomotion once it finishes. Chosen over a new no-code bindings-list component per the user's own call, since scripting already generalizes to any key/clip pairing without new UI. The one real interaction bug — a freshly-triggered one-shot getting immediately overridden the same frame by the pre-existing ground-speed locomotion picker — is the same class of bug F46 already found and fixed for death clips, so it got the same fix: an explicit gate on the new one-shot state. Verified end-to-end against a real browser session using the bundled Wolf model's real `Attack` clip and a real DOM keypress, not just native tests. See [F47](docs/changelog/F47.md).

Engine version 0.48.0 makes F/G play an animation with no scripting required, plus a real crouch/sit key. A new `engine::script::Runtime::request_animation` lets native bridge code (not just Lua) queue a one-shot the same way a script's own `self.animate` already does: F and G now play an attack/blast animation on every press, hit or miss, and a hostile AI landing a hit on the Player animates too. A new C key makes the Player crouch/sit while held, natively freezing WASD input so sitting can't slide across the floor. Since different imported packs name the "same" action differently (`Attack` vs `punching`, `sit` vs nothing at all), a small `actionClipSynonyms` candidate list resolves each of the three reserved action keys case-insensitively against whatever clips a given model actually has, falling back to plain exact-name matching for an ordinary Lua `self.animate` request — F47's own contract stays unchanged for a script author. Verified against three real running sessions: Mannequin F (Mixamo)'s real `punching`/`firing_rifle` clips on F/G, the plain Mannequin F's real `sit` clip plus a frozen position readout while crouch-holding W, and a bundled Wolf's real `Attack` clip firing the instant its AI landed a hit on the Player. See [F48](docs/changelog/F48.md).

Engine version 0.49.0 merges "Mannequin F (Mixamo)" into "Mannequin F" — one catalog entry with all nine clips instead of two separate models for what's visually the same character. The two rigs share a mesh but not a skeleton (Quaternius's 65-joint UE-style names vs Mixamo's 46-joint `mixamorig*` auto-rig), which is why F37/F38 shipped them as separate entries in the first place after an earlier retarget attempt was abandoned; this round retried it with a world-space rotation-delta method — computed per bone from the source's own rest pose, re-applied onto the target's rest pose, converted back to local using the target parent's own *animated* world orientation for that frame, not its rest one (an early version's bug: using the parent's rest orientation silently assumes every ancestor stays frozen, invisible on a shallow pose but clearly wrong on `firing_rifle`'s sustained two-handed chest-level aim). Verified by rendering actual frames of all three retargeted clips (`punching`/`firing_rifle`/`flying`) and comparing side-by-side against the untouched pre-merge model at the same clip fractions — no skeleton distortion, poses match. See [F49](docs/changelog/F49.md).
Engine version 0.50.0 rebuilds the physics core, starting the Unity gap analysis ([docs/unity/GAP_ANALYSIS.md](docs/unity/GAP_ANALYSIS.md)). Dynamic bodies now collide with each other: they share the separation by mass and exchange momentum, so a light crate barely moves a heavy one. The editor's `RigidBody.mass` and `dynamic` fields finally do something; they had been authorable but were never read. Unticking `dynamic` makes a body kinematic: no gravity, never pushed, but it still pushes. `Collider` gains `isTrigger` (overlap-only, reports enter/stay/exit), `layer`/`mask` (a per-collider layer collision matrix) and `bounciness`. The engine API also adds `add_force`/`add_impulse`, contact events, and raycast/`overlap_sphere` query filters. See [F50](docs/changelog/F50.md).

Engine version 0.51.0 widens the Lua `Script` API so most small games need no C++ changes. It adds:

- **Callbacks**: `on_start`, `on_destroy`, `on_collision_enter/stay/exit(other)`, `on_trigger_enter/stay/exit(other)` (fed by 0.50.0's contact events) and `on_message`.
- **A `world` API**: `find`, `name`, `position`/`set_position`, `velocity`/`set_velocity`, `spawn` (any prefab, rendered live), `destroy`, `health`/`damage`, `raycast`, `overlap`, and `send` for messaging between scripts.
- **Physics**: `physics.add_force`/`add_impulse`.
- **Timers and coroutines**: `after`/`every`/`cancel` and `start`/`wait`.
- **Output**: `sound.play`, `ui.set_text`, `log`, and `time.now`.
- **Inspector-editable props**, declared in the source with `-- @prop speed 5`.
- **Writable position**: `self.x/y/z` now teleport the entity when written.

See [F51](docs/changelog/F51.md).

Engine version 0.52.0 covers the rendering basics from the gap analysis:

- **Real-time shadows**: the sun casts soft shadows onto everything and onto a shadow-only ground plane, and any `Light` can opt in with `castShadows`.
- **`Environment`**: a scene-wide component with a Color, Gradient or Procedural sky, image-based lighting from that sky, sun direction/color/intensity, ambient level, Linear or Exponential fog, a shadows toggle and exposure.
- **`Camera`**: during Play the highest-priority camera renders the game view from its entity, in perspective or orthographic.
- **`Material`**: color, metalness, roughness, emissive and opacity, which replace the placeholder box's surface or tint a catalog model while keeping its textures.

See [F52](docs/changelog/F52.md).

Engine version 0.53.0 adds an `Animator` component, which is an animation state machine written as short text:

```
state idle
state attack clip=Attack once
any -> attack when trigger attack
attack -> idle when end
event attack 0.4 hit
```

It supports states with a clip, loop/once and a speed; transitions with `and`-joined conditions (comparisons, booleans, triggers, `end`) and crossfade times; and animation events at a normalized clip time. Scripts drive it with `anim.set`/`anim.trigger` and hear back through `on_anim_event`/`on_anim_state`. The editor fills in `speed`, `grounded` and `vy` automatically. See [F53](docs/changelog/F53.md).

Engine version 0.54.0 adds navigation and a camera rig:

- **Navigation** (`engine::nav`): a new grid A* module, baked from solid colliders and inflated by the agent radius. It ignores low curbs, triggers and movable bodies, and smooths paths with line-of-sight checks.
- **Chasing AI** now walks around walls instead of pressing into them. Scripts get the same paths through `world.path(...)`.
- **`CameraFollow`**: on a `Camera` entity, a follow rig that tracks the Player or a named entity from an offset, eases toward it, pulls in front of obstacles, and can be orbited by dragging.
- **`camera.shake(intensity, seconds)`** gives scripts screen shake.

See [F54](docs/changelog/F54.md).

Engine version 0.55.0 brings the browser up to the engine's native input system:

- **Devices**: every key, the mouse (position, buttons, deltas, wheel, pointer lock), touch (through pointer events) and the gamepad (standard mapping) now feed the native `InputState`.
- **Actions**: the native `ActionSystem` evaluates named actions every tick. The defaults are `move_x`/`move_y`/`look_x`/`look_y`/`jump`/`fire`/`interact`/`sprint`, and a scene can rebind them with an `InputActions` component using lines like `jump: space, pad_a`.
- **Lua**: scripts get `input.action/action_down/action_pressed/action_released`, `input.mouse()`, `mouse_down/mouse_pressed`, `wheel()`, `pad_down/pad_pressed/pad_axis/pad_connected` and `lock_mouse`.
- **Fix**: presses and clicks no longer get lost on displays faster than 60 Hz.

See [F55](docs/changelog/F55.md).

Engine version 0.56.0 expands the `UI` component:

- **New kinds**: Panel, Image, Bar, Slider and Toggle, alongside Text and Button.
- **Layout and look**: pixel offsets from the anchor, width/height (0 = automatic), font size, color, opacity, and an image URL.
- **Interaction**: a Button with action `script`, a moved Slider or a flipped Toggle calls `on_ui(name, value)` in every script.
- **Lua**: scripts drive elements with `ui.set_value` and `ui.set_visible`, next to `ui.set_text`.
- **Fix**: authored 0–1 colors are now read as sRGB, so the default backdrop matches the original exactly.

See [F56](docs/changelog/F56.md).

Engine version 0.57.0 expands `Particles`:

- **Emitters**: Point, Sphere, Box and Cone shapes; color and size over lifetime; a gravity scale; Local or World simulation space; a burst when Play starts.
- **Rendering**: particles draw as soft round sprites with per-particle size.
- **Lua**: `particles.burst(n)` and `particles.set_emitting(bool)`.
- **`Trail`**: a new component that draws a camera-facing ribbon behind a moving entity.

The simulation moved into a pure, unit-tested module. See [F57](docs/changelog/F57.md).

Engine version 0.58.0 adds two editor features:

- **Import asset…** (Project panel): add your own `.glb` models, images and audio. The files are stored in this browser's IndexedDB and survive reloads.
  - Models appear under a new "Imported" catalog category.
  - Sounds join the Sound clip list and `sound.play`.
  - Images are referenced as `asset:<file>` from `UI.image` and from `Material.texture`, a new field that also accepts a URL.
- **Stats** overlay: FPS, frame time, C++ tick time, draw calls, triangles, entity count and every C++ system's time on the last tick.

See [F58](docs/changelog/F58.md).

Engine version 0.59.0 makes rotated colliders real:

- **Oriented boxes**: a Box `Collider` on an entity with a `Rotation` now collides as that rotated box (separating-axis test). Diagonal walls block along their faces, and a tilted box is a ramp you can stand on without sliding down.
- **Sliding**: bodies hitting a rotated wall slide along it instead of stopping dead.
- **Hit normals**: `world.raycast` also returns the surface normal (`nx, ny, nz`).
- **Navigation**: rotated walls block only the cells they cover, and walkable ramps don't block.

See [F59](docs/changelog/F59.md).

Engine version 0.60.0 adds a `CharacterController` component for the Player:

- **Movement**: from the named actions (`move_x`/`move_y`, `jump`, `sprint`, and a new default `crouch` on C, Ctrl or pad B). Ground speed accelerates and decelerates, and there is air control.
- **Jumping**: coyote time and jump buffering.
- **Crouching**: lowers the body. You only stand back up where there's headroom.
- **Steps and slopes**: steps up to 0.4 m are climbed automatically, and the character sticks to stairs and slopes when walking down.
- **FirstPerson mode**: Play puts the camera at the player's eyes with mouse look. Click the viewport to capture the mouse; right-drag and the right stick also look. The view has head bob, a landing dip, crouch easing, a sprint FOV kick and a crosshair.
- **ThirdPerson mode**: movement is relative to the camera instead.

See [F60](docs/changelog/F60.md).

Engine version 0.61.0 adds weapons:

- **`Weapons` component**: a text loadout, one weapon per line (`rifle: mode=auto rpm=620 damage=24 mag=30 reserve=180 reload=2.1 …`). It covers fire modes (semi, auto, burst), pellets, magazines and reserves, reloads (including shotgun-style per-shell reloads), spread (hip, aim, movement, airborne, bloom), recoil, damage falloff, headshots, aim zoom, and projectile weapons with gravity and splash damage.
- **Player controls**: click to fire, right mouse to aim down sights, R to reload, 1–9, Q or the wheel to switch weapons. Gamepad: RT, LT, RB and d-pad up.
- **First-person presentation**: procedural gun models (rifle, pistol, shotgun, SMG, sniper, launcher) drawn in their own pass, so they never clip into walls. They sway and bob, and animate recoil, reload, equip, aim and sprint. There are muzzle flashes, tracers, sparks and bullet-hole decals, and explosions.
- **Sound**: synthesized gunshots and other combat sounds.
- **HUD**: ammo, a crosshair that reflects real spread, hit and kill markers, damage-direction indicators, and health.
- **Lua**: `weapon.fire([dx, dy, dz])`, `weapon.reload()`, `weapon.select(n)`, `weapon.ammo()` and `weapon.give_ammo(n)`. New callbacks are `on_damaged(amount, attacker, headshot)`, `on_death(attacker)` and `on_kill(victim, attacker)`.

See [F61](docs/changelog/F61.md).

Engine version 0.62.0 adds combat AI with the `AICombat` component:

- **Teams**: soldiers belong to a team; the Player is team 0.
- **Perception**: a sight cone with real line of sight, hearing gunfire and explosions, and noticing who shot them.
- **Behaviors**: patrol named waypoints, guard their post, or hunt the nearest enemy.
- **Fighting**: engage from a preferred range in bursts with their `Weapons` (or melee without), strafe, take cover to reload or when hurt, search where they lost you, and optionally flee.
- **Movement**: through the character controller along nav paths.
- **Visuals**: soldiers face where they look, carry their weapon, and show "!" or "?" markers.

See [F62](docs/changelog/F62.md).

Engine version 0.63.0 adds a `Terrain` component:

- **Shape**: a heightfield from seeded fractal noise, plus offsets you paint with the viewport's **Sculpt** tool (raise, lower, smooth, flatten; radius and strength; one undo per stroke).
- **Look**: colored sand, grass, rock (by slope) and snow (by height) over a detail texture.
- **Scatter**: catalog models (trees, rocks, bushes) placed by density rules, drawn instanced, optionally with trunk colliders.
- **Simulation**: bodies and the character controller stand on it, steep slopes can't be climbed, bullets and raycasts (including Lua's) hit it, and AI paths avoid cliffs.

See [F63](docs/changelog/F63.md).

Engine version 0.64.0 upgrades audio:

- **Mixer**: buses for SFX, music, ambient and UI into a compressed master, plus a shared room reverb. A new `AudioSettings` component sets the mix.
- **Positional sound**: world sounds (gunfire, impacts, explosions, footsteps) play from where they happen with HRTF panning and distance falloff, and are muffled behind walls and terrain.
- **`Sound`** can be positional and follows its entity; it picks a bus.
- **Lua**: `sound.play_at(clip, x, y, z[, volume])` and `sound.volume(bus, v)`. `sfx:` names (`sfx:explosion`, `sfx:gunshot:rifle`, …) play synthesized sounds.
- **Footsteps and landings**: players and soldiers make them, with a softer grass sound on terrain.

See [F64](docs/changelog/F64.md).

Engine version 0.65.0 adds a `PostProcessing` component:

- **Anti-aliasing**: SMAA or FXAA.
- **Ambient occlusion**: GTAO, with radius and intensity.
- **Bloom**: strength, radius and threshold.
- **Exposure**: a multiplier on the environment's exposure.
- **Color grading**: contrast, saturation and temperature, plus vignette, film grain and sun shadow quality.

Without the component the original look is unchanged. Adding one starts from a polished preset (SMAA, AO, a little contrast and vignette, high-quality shadows).

See [F65](docs/changelog/F65.md).

Engine version 0.66.0 adds game-flow support for scripts:

- **`world.heal(id, amount)`** restores health, capped at the maximum.
- **`world.give_ammo(id, rounds[, slot])`** adds reserve ammo to another entity's weapon.
- **`ui.marker(name, x, y, z[, label])` / `ui.clear_marker(name)`** show on-screen waypoints with distance, pinned to the screen edge when off screen.
- **`game.pause()` / `game.resume()`** work like the Pause and Resume buttons. Commands queued while paused (from `on_ui`) still run.
- **Death view**: when a first-person player dies, the camera stays where they fell, sinking and rolling over.

See [F66](docs/changelog/F66.md).

Engine version 0.67.0 ships **LAST SIGNAL**, a mission-based FPS made only from a scene file and Lua scripts ([design document](docs/fps/GAME_DESIGN.md)): breach an outpost on a sculpted 260 m valley, destroy three generators, hold an uplink against director-paced waves, and extract. Three difficulties, four enemy roles, drops, a title card, pause menu, best times. It is generated by `tools/fps/build_last_signal.ts` into `examples/fps/last-signal.json` and published as `last-signal.html` next to the editor (`export_build.mjs --page`). Building it fixed engine bugs:

- player builds crashed when a script set UI values in `on_start`;
- terrains above about 110² heights overflowed the wasm stack;
- player builds didn't show terrain scatter;
- catalog models floated above their colliders; characters were stretched by non-uniform scale.

It also adds prefab default Scale, scatter `exclude` rectangles, a 260 m nav grid, and first-person health bars only over damaged nearby targets. See [F67](docs/changelog/F67.md).

Engine version 0.68.0 makes LAST SIGNAL smooth and fixes the floating gun:

- **Physics**: a body tests obstacles' cached bounds first instead of building every shape, so a terrain level's hundreds of scattered trunks no longer dominate the tick (about 14× less physics time).
- **Foliage**: terrain scatter is instanced in 64 m chunks, so off-screen trees are frustum culled; bushes and small rocks no longer cast shadows.
- **First-person arms**: every weapon is held by gloved hands with sleeved forearms, part of the weapon model so they move with it exactly.
- **Recoil**: the recoil spring is substepped; a slow or hitching frame used to make it unstable and fling the weapon away.
- LAST SIGNAL drops ambient occlusion and uses a 2048 shadow map.

See [F68](docs/changelog/F68.md).

Engine version 0.69.0 makes characters hold their weapons with their own arms, and smooths motion:

- **Soldiers**: an armed character plays walk/run on its legs and its weapon-holding clip (the Mannequin's `firing_rifle`) on its upper body at the same time, its gun rides the right hand bone, and the model is turned so the gun, not the hips, points where it aims.
- **First person**: the procedural gloves and sleeves are gone; the player's character model (its own Renderable, which can be invisible, or the Mannequin) holds the weapon, tinted by the player's Material. Aiming lines the gun's sight up with the view.
- **Interpolation**: every object is drawn between its last two 60 Hz simulation ticks, so enemies, pickups and projectiles move smoothly on any display rate instead of stepping.

See [F69](docs/changelog/F69.md).

Engine version 0.70.0 adds driving, and ships **HIGH HEAT**, a street racer in the spirit of *Need for Speed: Most Wanted* ([design document](docs/racing/GAME_DESIGN.md)):

- **Arcade car dynamics** (`engine::gameplay::step_car`): grip-limited cornering, handbrake drifts that refill nitro, nitro boost, gears and revs. `Vehicle.model = "Arcade"` with top speed, acceleration, braking, grip, drift grip, steering, nitro and gears.
- **AI drivers** (`Driver`): Race follows a route and brakes for the corners ahead; Pursuit chases a target (straight at it in sight, by a scripted route around blocks otherwise) and rams; Traffic cruises a loop and brakes for cars ahead. All have stuck recovery.
- **`ModelInstances`**: hundreds of catalog models (road tiles, buildings, lamps) from one entity, instanced in chunks, with solid footprints.
- **Driving presentation**: a speed-scaled chase camera, body roll and pitch, brake lights, nitro flames, skid marks, tyre smoke, police light bars, a synthesized engine note, tyre squeal and sirens, plus a speedometer and a heading-up minimap.
- **Lua `vehicle.*`**: `state`, `set_nitro`, `reset`, `freeze`, `set_route`, `set_target`, `set_mode`, `set_speed_scale`.

See [F70](docs/changelog/F70.md).

Engine version 0.71.0 adds spaceflight for [Pale Signal](https://github.com/Islandyout/pale-signal), and ships an engine slice of it ([slice document](docs/space/PALE_SIGNAL_SLICE.md)):

- **Star systems** (`SpaceSystem`, `engine::gameplay::space`): planets and moons on rails, spheres of influence, exponential atmospheres, and procedural terrain with flattened sites, all in double precision.
- **A flown ship** (`Spaceship`): rate-limited attitude, main and belly thrusters, Pale Signal's MANUAL / STABILIZED / NAV assists, drag, lift and heating, judged touchdowns, fuel, hull, time warp, orbit elements and a predicted path.
- **Seamless surface to space**: planets refine as you approach and are drawn in a system pass behind the scene, with atmospheres, a sky that fades to stars with altitude, the sun, landmark beams, and a chase camera that never steers.
- **The site frame**: authored entities live around a point on a planet's surface, so walking, physics, AI and scripts work on curved ground; E boards and leaves the ship.
- **Lua `space.*`**: `state`, `events`, `set_warp`, `set_assist`, `set_target`, `refuel`, `set_fuel`, `repair`, `board`, `exit`, `set_controls`, `place_landed`, `place_orbit`, `body`.

See [F71](docs/changelog/F71.md).

Engine version 0.72.0 brings the Pale Signal prototype's exploration loop:

- **Walk anywhere**: land on any world and step out; the walkable area follows the ship, with that world's plants, rocks and air (or none).
- **A field scanner** (`Scannable`, hold F) for species, evidence and landmarks, reported to scripts; research points buy the prototype's ship upgrades (`space.tune`).
- **The Talari**: talk to Kestra's residents; their speech translates as your language model grows.
- **Seas, clouds, sunsets, the Milky Way**, snow and shores on the planets, walk-up signal structures, and the built-in **Kestrel** ship model.

See [F72](docs/changelog/F72.md).

Engine version 0.73.0 brings the whole Pale Signal expedition, and a home for your games:

- **A Games library** in the editor and a [`games/`](games/README.md) folder: every game is published and listed, with a `my-games` folder for your own and a section for scenes kept in the browser.
- **Several sites per scene** (`Site`), **daily routines** (`Routine`), **wildlife** that grows wary and flees (`Wildlife`), and **`host.send`** for script-driven maps, weather and audio.
- **Spaceflight**: ship components that wear and repair, wind, an **autopilot** with fuel-checked route plans, the emergency reserve and hidden worlds.
- **Exploration presentation**: system and surface maps, minimaps, latitude/longitude waypoints, rain and fog, dust, footprints, ambience layers, harvesting and prospecting, scan confidence and air sampling.
- **Player settings**: quality presets, look sensitivity, invert Y, reduced motion, touch controls, screen-reader announcements and a profile capture. UI text wraps and keeps its colour.
- **CC0 models**: 11 Quaternius spaceships and 26 sci-fi props.

See [F73](docs/changelog/F73.md).

Engine version 0.74.0 makes the worlds turn and the ground more interesting:

- **Turning planets** (`day=`): days and nights pass over the sites while landed ships, settlements and landmarks turn with the ground.
- **Terrain features**: craters, glowing lava rifts and dune fields (`craters=`, `rifts=`, `dunes=`).
- **Landing radar**: radar altitude, sink, slope and drift against the gear's limits, with a SAFE / UNSAFE call, plus water spray.
- **The Talari model**: Pale Signal's people get their own crested, robed figure on the animated rig.

See [F74](docs/changelog/F74.md).

Engine version 0.75.0 holds games at 45–60 fps and closes the last Pale Signal gaps:

- **A frame governor** steps resolution, shadows, bloom, scatter and distant animation to keep play smooth; physics gets a broadphase, ticks a bulk snapshot.
- **Flight**: mouse steering, autopilot transfers around the star, clearance corridors, paths over turning ground.
- **On foot**: the walk frame follows you anywhere, a suit light and visor, soft contact with big animals, shelter from storms.
- **Atmospheric scattering** for the sky and the air seen from space.
- **Living towns**: Routine activities (`"6 120 40 sit"`), talking pairs, grazing; `Material.parts` tints named parts of a model.
- **Generative music** (`host.send("music", mood)`), interiors, prices by standing, fuller saves, and spaceflight in the native playground (`engine_playground --space`).

See [F75](docs/changelog/F75.md).

Engine version 0.76.0 cuts draw calls and makes the towns use their buildings:

- **Rendering**: scatter chunks size themselves and static scenery is batched (about 42% fewer draw calls at the Pale Signal start). The governor also thins the sky and far simulation. Craters are 2× cheaper, and shadows sway with the plants.
- **The autopilot**: memory per ship, Hohmann moon transfers (half the fuel) and plans that err high.
- **Towns**: people path around walls to desks inside halls through sliding doors, with their own gestures. Canals reflect their surroundings.
- **Also**: animals are saved, prices follow each institution's standing, music has composed motifs, the native playground lands, and the site view defaults to home.

See [F76](docs/changelog/F76.md).

Engine version 0.77.0 makes the engine easier to use and easier to work on:

- **The editor explains itself**: every component and tricky field has help. Routine stops are edited as a table. A **Problems** panel, also checked before Play, lists authoring mistakes and selects the entity at fault.
- **New offers starters** for third-person, first-person, racing and space games. [GETTING_STARTED.md](docs/GETTING_STARTED.md) goes from a template to a saved game in five minutes.
- **Scripts get named functions** (`hud.announce`, `audio.music`, `space.plan`, ...). There is an in-editor **API reference**, [SCRIPT_API.md](docs/SCRIPT_API.md), and a LuaLS autocomplete stub. [COMPONENTS.md](docs/COMPONENTS.md) documents every component.
- **Under the hood**: named and generated runtime fields and exports, the runtime and the editor split into smaller files, and per-release changelog pages.

See [F77](docs/changelog/F77.md).

Engine version 0.78.0 adds hand-to-hand combat:

- **Martial arts from real motion**: punches, knees and reactions from Quaternius's CC0 animation libraries, and front, roundhouse and side kicks retargeted from CMU motion capture (55 clips, loaded only when a scene fights).
- **A Melee component**: combo chains with an input buffer and cancel windows, heavies, air and dash attacks, rolls with invulnerable frames, block, parry and guard breaks, launches, juggles and knockdowns, and energy-fuelled specials (forward, back and back-forward). Moves are text you can edit.
- **Feel**: hit-stop, sparks and limb trails, camera shake, slow motion on parries and finishers, lock-on with a camera that frames both fighters, and a fighter HUD with a combo counter.
- **AI fighters** that close in, circle, take turns, string combos, block, parry and dodge. Try the new **Martial-arts dojo** starter; [COMBAT.md](docs/COMBAT.md) explains it all.

See [F78](docs/changelog/F78.md).

Engine version 0.79.0 starts **GATEBREAKER**, an original manhwa-style hunter action game ([design](docs/gatebreaker/GAME_DESIGN.md)):

- **A Manhwa render style**: toon tones, ink lines, rim light, inked sound words (SHK, BOOM), speed lines and impact frames.
- **Action controls**: dodge, block or parry, three skills and an ultimate on their own keys, and **Shadow Step** behind an enemy after a perfect dodge.
- **Weapons in hand** (twin daggers), the hunter and a goblin on the shared combat skeleton, and a CC0 dungeon kit.
- **Fixes**: an invisible box that settings entities left at the centre of every scene, squashed AI fighters, and stuck health bars.

See [F79](docs/changelog/F79.md).

Engine version 0.80.0 makes GATEBREAKER playable from start to finish: **one E-rank Gate** (Games → GATEBREAKER):

- A **comic-panel prologue** and the **Ledger**'s system windows.
- A **tutorial** that teaches by doing: attack, Heavy, dodge, Perfect Dodge into Shadow Step, parry.
- **Goblin rooms** that seal and open: grunts, archers that keep their distance, and a shield-bearer that only a Heavy breaks.
- The **Goblin Chieftain**: a boss bar, red unblockable slams with ground warnings, a stagger bar that **Breaks** it, and a second phase. Then a level-up and the first skill.
- **Combat additions**: mana and skill cooldowns on the HUD, locked skills, guard-breakers, and enemy tells (glint, red "!", ground circles).

See [F80](docs/changelog/F80.md).

Run `engine_playground.exe` after building on Windows, or `engine_playground` on Linux.
[Controls, architecture, and verification](docs/NATIVE_PLAYGROUND.md).

## Current foundation

- CMake project and Windows/Linux presets
- strict compiler warnings
- explicit fixed-width core types
- RFC-compatible UUIDv4 values and strongly typed engine IDs
- bounded 60 Hz-capable fixed-step clock
- thread-safe structured logging with replaceable sinks
- platform-independent application lifecycle and event contract
- deterministic headless platform for tests and dedicated-server foundations
- bounded fixed-update/render loop with frame pacing and controlled shutdown
- SDL3 desktop backend with an owned resizable, high-pixel-density window
- engine-owned translation for close, suspend/resume, resize, pixel-size, and focus events
- engine-owned keyboard, text, mouse, touch, and gamepad events with per-frame input state
- strong action and input-context identifiers with deterministic priority and activation
- keyboard, mouse, and gamepad bindings with digital chords and optional device selection
- configurable dead zones, saturation, linear/squared/cubic response, inversion, and scaling
- deterministic action press/release transitions, canonical validated persistence, and frame replay injection
- isolated world ownership, non-reused entity handles, and explicit typed component registration
- creation-ordered query snapshots and FIFO deferred structural changes
- fixed systems ordered by phase, numeric order, and stable name
- minimal host executable
- automated core, input/action, world, runtime, and SDL backend tests

## Build on this PC

CMake and a self-contained MinGW/UCRT compiler are installed for the current user. Start a new terminal after installation so the updated command path is visible, then run:

```bat
cmake --preset windows-mingw
cmake --build --preset windows-mingw
ctest --preset windows-mingw
```

The `windows-msvc` preset is retained for machines with a complete Visual Studio C++ workload and Windows SDK. `tools\build_msvc.cmd` is a diagnostic fallback for that toolchain.

The no-SDL configuration verifies that dedicated-server and automation builds remain independent of desktop libraries:

```bat
cmake --preset windows-mingw-headless
cmake --build --preset windows-mingw-headless
ctest --preset windows-mingw-headless
```

Equivalent Linux Clang presets are `linux-clang` and `linux-clang-headless`.

## Input actions

`engine/input/actions.hpp` defines `InputMap`, `ActionSystem`, and the binding types. Active contexts are evaluated by descending priority; once a context at a given priority defines an action, lower-priority bindings for that action are masked. Context identifiers break equal-priority ordering, binding values combine in canonical order, and the final scalar action value is clamped to `[-1, 1]`.

`serialize_input_map` writes the versioned, canonical `game_engine_input_map 1` format. `deserialize_input_map` rejects malformed records, duplicate or invalid identifiers, undeclared references, invalid device controls, duplicate chord members, non-finite processor values, and invalid dead-zone/saturation ranges. `InputReplay` injects ordered event frames into a resettable `InputState` for deterministic headless tests.

Generated output belongs under `build/` or `out/` and is excluded from source control.

## Worlds and fixed systems

Link `GameEngine::World` and include `engine/world/fixed_systems.hpp`. Own a `World` and
`FixedSystems` in your application callbacks; register components and systems before running,
then call `systems.run(world, context)` exactly once from `on_fixed_update`. Do not call it
from `on_render`. The existing application loop remains the only time accumulator.

```cpp
struct Counter { int ticks{}; };
world.register_component<Counter>("counter");
const auto entity = world.create();
world.set(entity, Counter{});
systems.add("counter.advance", engine::FixedPhase::update, 0,
    [](engine::World& current, const engine::FixedUpdateContext&) {
        for (const auto item : current.query<Counter>()) {
            ++current.get<Counter>(item)->ticks;
        }
    });
```

Systems execute in `begin`, `update`, then `end` phases. Within each phase, ascending
numeric order and lexical system name determine execution, independently of registration
order. Direct component-value edits are visible immediately; entity creation/destruction
and component insertion/removal must use `defer_create`, `defer_destroy`, `defer_set`, and
`defer_remove` during execution. Queued changes commit before the first phase and after
each phase. See [the F5 contract](docs/WORLD_FOUNDATION.md) for ownership, reset, pointer
lifetime, errors, determinism limits, and backend decisions.

## Run

Open the desktop engine host and close it with the normal window close button:

```bat
build\windows-mingw\engine_host.exe
```

Run without a window for dedicated-server or automation work:

```bat
build\windows-mingw\engine_host.exe --headless
```

Run a hidden four-tick SDL startup/shutdown check:

```bat
build\windows-mingw\engine_host.exe --smoke
```
