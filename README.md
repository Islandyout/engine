# Game Engine

[Open the editor](https://islandyout.github.io/engine/) — build and play games entirely through it; this is the only supported way to play what you build.

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

Engine version 0.18.0 removes Field Lab, the standalone browser demo that used to sit at the published site's root, and makes the editor the site itself. Field Lab was a second, non-editor way to interact with compiled engine content that no longer served a purpose distinct from the editor after 0.17.0 — nothing engine-level was lost, since it was built entirely on already-shared engine types the native playground and its tests also use. See [F18](docs/IMPLEMENTATION_STATUS.md#f18--field-lab-removed-the-editor-is-the-site-0180).

Engine version 0.19.0 adds a 103-model catalog to the editor: buildings, furniture, nature, roads, signs and vehicles from the same CC0-licensed Aether kit the bundled bench came from, browsable by category and placeable from the Project/Content panel or the inspector's Model dropdown. See [F19](docs/IMPLEMENTATION_STATUS.md#f19--model-catalog-0190).

Engine version 0.20.0 brings the remaining 27 rigged, animated models (animals and people) into the same catalog, each playing its own embedded idle/walk/run animation clips through Three.js's `AnimationMixer`, crossfading based on the entity's actual measured speed. See [F20](docs/IMPLEMENTATION_STATUS.md#f20--animated-models-in-the-editor-0200).

Engine version 0.21.0 folds the original Aether bench into the model catalog as its own entry (id 1) instead of a separate standalone button, so there's one consistent way to browse and place every bundled model. See [F21](docs/IMPLEMENTATION_STATUS.md#f21--the-bench-joins-the-catalog-it-predates-0210).

Engine version 0.22.0 adds player control to the editor: tag an entity `Player` and drive it with WASD, jump with Shift (hold while airborne to fly, ported from the native playground's own tuned feel), and the camera follows. This is the first of three rounds closing the remaining gap with the native playground — collision with what you build, then combat/flight/HUD, are next. See [F22](docs/IMPLEMENTATION_STATUS.md#f22--player-control-wasd-jumpflight-camera-follow-0220).

Engine version 0.23.0 makes `Collider` obstacles actually block movement in the editor — round 2 of that same plan: any entity authored with a `Collider`, the same component the editor already let you attach but never consulted, now stops the player (and any other moving entity) instead of letting it pass straight through. Combat, flight and HUD are next. See [F23](docs/IMPLEMENTATION_STATUS.md#f23--collision-collider-obstacles-block-movement-0230).

Engine version 0.24.0 adds combat — round 3 of 3, closing the remaining gap with the native playground: F is melee, G fires a ranged blast at the nearest target, and any entity with a `Health` component can now be damaged and defeated by either. A screen-space health bar (plus a status-bar text readout) shows it happening. See [F24](docs/IMPLEMENTATION_STATUS.md#f24--combat-melee-ranged-blast-and-a-health-hud-0240).

Engine version 0.25.0 fixes movement feel, based on direct feedback after 0.22–0.24 shipped: WASD is now camera-relative (fixing the "flipped" feel a fixed world axis had the moment the camera wasn't looking straight down -Z), a moving character turns to face where it's actually going instead of sliding through its run animation, jump gets a squash-and-stretch instead of a flat vertical translation, and `Vehicle` — previously inert data — now makes a `Player` entity accelerate and steer like a car instead of strafing. `examples/demo-game.json` is a small drivable-car-in-an-arena scene built to dogfood all of it together. See [F25](docs/IMPLEMENTATION_STATUS.md#f25--movement-feel-camera-relative-wasd-facing-jump-weight-vehicle-driving-0250).

Engine version 0.26.0 fixes an authored `Scale` component being applied to a catalog GLB model on top of that model's own real-world dimensions instead of as the literal size it's documented to be — found by actually building the browser editor and playing `examples/demo-game.json`, where it made the Player Car render nearly as long as the arena's own walls. The viewport's transform gizmo got the same fix, so dragging a catalog model's scale handle now saves literal dimensions instead of a value that would shrink it back down on the next rebuild. See [F26](docs/IMPLEMENTATION_STATUS.md#f26--catalog-model-scale-normalization-0260).

Engine version 0.27.0 wires up `AIState` and `Pedestrian`, found fully authorable in the editor but never actually simulated — an engineering audit against Unity/Unreal/Godot/Bevy/PlayCanvas flagged it as the exact same "authored but inert" bug `Vehicle` had before 0.25.0. An `AIState`-tagged entity now wanders on its own, chases the nearest `Player` within range, and flees instead once its own health runs low; a `Pedestrian` marker keeps it harmless, never chasing. `examples/demo-game.json`'s two combat targets react to the player now instead of just standing there, and a new wandering `Bystander` populates the arena. See [F27](docs/IMPLEMENTATION_STATUS.md#f27--wiring-up-aistate-and-pedestrian-0270).

Engine version 0.28.0 adds the one thing that same audit flagged as the real gap between this and a real game engine: a way to add new gameplay behavior from inside the editor, without editing and recompiling C++. Any entity can now carry a `Script` component — Lua, written directly in the inspector — with an `on_tick(dt)` that reads its own position and writes velocity, same as `Player`/`Vehicle`/`AIAgent` already do. The embedded Lua 5.4 interpreter is vendored so it runs identically native and in the WASM browser build, sandboxed at compile time (no filesystem, process, or module-loading libraries even built in) and at runtime (no `load`/`dofile`, an instruction-count watchdog against infinite loops), and a script that errors reports once through the inspector's status bar instead of crashing anything. See [F28](docs/IMPLEMENTATION_STATUS.md#f28--scripting-hook-embedded-lua-script-component-0280).

Engine version 0.29.0 adds prefabs: author an entity's components once (say, "Player Car"), place as many instances as you like, and editing the shared definition updates every instance live — no separate "apply to all" step, and no way for an instance to silently drift out of sync, since only `Transform`/`Name`/`Parent` are ever per-instance and everything else is read straight from the shared definition. The inspector gets a "Make prefab…" button and, for a placed instance, an "Unlink from prefab" button to detach it as a standalone entity; the dock gets a prefab picker to place further instances. Entirely a browser-editor authoring-layer feature — no engine or bridge changes. See [F29](docs/IMPLEMENTATION_STATUS.md#f29--prefabs-author-once-place-many-edit-propagates-0290).

Engine version 0.30.0 closes out Tier 1 with audio — there was none at all before this. A `Sound` component picks a clip from a small bundled catalog (a curated 10-file subset of four Kenney.nl CC0 packs — two loop-friendly ambiences, eight one-shot stingers) and plays it through the real Web Audio API, starting when Play begins and stopping when it ends, the same Play-scoped lifecycle `Script` and `AIAgent` already run under (not event-triggered per-hit SFX — that needs the bridge to expose which tick an event fired, out of scope here). Pause suspends the whole audio clock in place rather than muting; `Sound` is prefab-shared like `Renderable`. See [F30](docs/IMPLEMENTATION_STATUS.md#f30--audio-a-sound-component-and-real-web-audio-playback-0300).

Engine version 0.31.0 opens Tier 2 with real physics shapes. The inspector has offered a `Collider.type` ("AABB"/"Sphere") and `radius` for a while, but the engine had no shape concept at all — every collider, however authored, resolved as an AABB from `Box.size`, and `radius` was silently discarded before it left the browser, the same "authored but inert" bug class `AIState`/`Vehicle` had before their own rounds. A `Collider` now really can be sphere-shaped, resolved with actual closest-point/separation-vector math instead of always box-vs-box, and a new `raycast()` API (box slab test, sphere quadratic, plus the ground plane) is ready for gameplay that needs to know what's in front of something — sequenced first in Tier 2 specifically because later items (AI line-of-sight, aiming) will need it. See [F31](docs/IMPLEMENTATION_STATUS.md#f31--real-physics-shapes-collider-spheres-and-raycasting-0310).

Engine version 0.32.0 investigates a report that the bundled Aether-kit `animals/**`/`people/**` animations "looked weird." A bone-world-position dump during a live Player-driven run and an isolated render outside the editor both confirmed the rig/clip data itself was fine; the one real bug found was `main.ts`'s `THREE.WebGLRenderer` never setting `toneMapping`/`outputColorSpace`, so `HemisphereLight(3)` + `DirectionalLight(3)` blew out highlights and crushed shadow faces on the kit's low-poly materials — fixed with `ACESFilmicToneMapping`/`SRGBColorSpace`. Separately, the user supplied three Quaternius CC0 1.0 animation packs; a new "Mannequin F" catalog entry (people) combines Quaternius's Female Mannequin mesh with locomotion clips from their Universal Animation Library, and four new self-contained animals (Wolf, Husky, Stag, Alpaca) join the animal roster — added alongside the existing Aether kit, not replacing it. See [F32](docs/IMPLEMENTATION_STATUS.md#f32--animation-lighting-fix-and-quaternius-cc0-catalog-additions-0320).

Engine version 0.33.0 makes `AnimationState` — a component that had been fully wired for authoring, saving, and loading since early on, but never actually read by anything — do what its fields already promised: an inspector "Add component → AnimationState" now shows a "Clip" dropdown built from that specific entity's own animated model (a Cow offers `walk`/`graze`, a Hero offers `wave`/`sit`; nothing catalog-wide), picking one plays and pins that clip immediately in Edit mode preview, and Play mode's own ground-speed-based clip switching steps aside for it instead of fighting it every tick. `clip` changes from a bare numeric index to a string clip name, since — unlike `Sound.clip`'s one shared catalog — every animated model has its own differently-named clip set. See [F33](docs/IMPLEMENTATION_STATUS.md#f33--animationstate-made-real-per-model-clip-selectionpreview-0330).

Engine version 0.34.0 is a direct user-feedback pass on the inspector's "Add component" list, right after F33 shipped: one flat, alphabetical-ish list of 16 raw type names (`RigidBody`, `AIState`, `AnimationState`) was confusing, and F33's own new clip picker was reachable only by already knowing to add `AnimationState` first. The list is now grouped into `<optgroup>`s that keep components which only make sense together next to each other — `AIState`/`Pedestrian` (`Pedestrian` just marks an `AIState` entity harmless), `Player`/`Vehicle` (`Vehicle` only does anything once `Player` is driving it), `Renderable`/`AnimationState`, and the `Velocity`/`Acceleration`/`RigidBody`/`Collider` movement-and-collision chain — with friendlier labels on the ones that needed it ("AI Behavior", "Physics Body"). The animation clip picker itself moves into the `Renderable` card directly, right under "Model": picking a clip there auto-attaches `AnimationState` for you, no separate detour required: `AnimationState`'s own card (now labeled "Animation (advanced)") still exists for `time`/`looping`, just isn't the only door in anymore. See [F34](docs/IMPLEMENTATION_STATUS.md#f34--inspector-cleanup-grouped-components-inline-animation-clip-picker-0340).

Engine version 0.35.0 wires up `Vehicle.archetype` and `Pedestrian.archetype`, which had been authorable and saved since early on but never actually read by anything — a plain number with no effect, the same "authored but inert" gap this project keeps finding and closing. A `Vehicle` now picks one of four real handling profiles (Car/Sports/Truck/Bus — different accel, drag, top speed, and turn rate each, not just a uniform scale), and a `Pedestrian` one of three wander-pace profiles (Casual/Brisk/Lingering — how long it lingers between phases and how briskly it moves once it does; its flee reflex stays unscaled, since that's self-preservation, not personality). Both inspector fields are real dropdowns now (`Car`/`Sports`/`Truck`/`Bus`, `Casual`/`Brisk`/`Lingering`) instead of a bare number, and an out-of-range value is rejected outright rather than silently clamped or accepted. See [F35](docs/IMPLEMENTATION_STATUS.md#f35--wiring-up-vehiclearchetype-and-pedestrianarchetype-0350).

Engine version 0.36.0 makes the Aether kit's 12 `Npc *` catalog characters (Casual 1/2, Dress, Elder, Hoodie, Office F/M, Sport, Teen, Uniform, Vendor, Worker) move as smoothly as 0.32.0's Mannequin F import, without replacing them with copies of it. The rig, skinning, and animation curves were already fine; the actual gap was geometry — every limb/torso/neck segment was a tapered cylinder built from one flat-shaded quad per side segment, a faceted pipe rather than a rounded limb. The procedural generator that builds these characters gains a smooth-shaded cylinder primitive (shared vertices, per-vertex normals, the same technique its existing joint-cap spheres already used) and every character is regenerated with it — same skeleton, outfits, proportions, and clips, just a rounder surface. See [F36](docs/IMPLEMENTATION_STATUS.md#f36--smooth-shaded-people-kit-0360).

Engine version 0.37.0 removes `Hero` and every `Npc *` catalog character outright (ids 119-131, both the catalog entries and their `.glb` files, plus the now-unused generator tooling F36 vendored to rebuild them), clearing the way for an imported, skeleton-rigged character pack requested in their place. The import itself isn't in this round — `drive.google.com` is blocked by this sandbox's network policy, so the 734 MB file supplied as a share link couldn't be fetched here; a direct upload, the pattern every prior asset import in this project has used, is what the follow-up import-and-skeleton-wiring round needs. See [F37](docs/IMPLEMENTATION_STATUS.md#f37--people-kit-removal-clearing-the-way-for-an-imported-pack-0370).

Engine version 0.38.0 lands that import: a new `Mannequin F (Mixamo)` catalog character (id 137), with three Mixamo animations (`Flying`, `Firing Rifle`, `Punching`) actually rigged and playing. The first attempt — retargeting a 263-clip Rokoko mocap library onto Mannequin F's existing skeleton — was tried, screenshotted, shown to visibly collapse into a twisted heap, and abandoned rather than shipped broken; the two rigs' bone axis conventions don't reconcile under a simple correction. Mixamo's free Auto-Rigger sidesteps that entirely by rigging and animating the same mesh in one pass, so this entry has its own skeleton (Mixamo's standard rig) rather than sharing one with the original Mannequin F. One accepted trade-off: the mesh's original two-tone material didn't survive the round trip and is recolored to a single flat lavender rather than left grey. See [F38](docs/IMPLEMENTATION_STATUS.md#f38--mannequin-f-mixamo-a-real-rigged-and-animated-import-0380).

Engine version 0.39.0 adds a real `Light` component (Point/Spot/Directional, color, intensity, Point/Spot's own range, Spot's own cone angle) — any entity can now carry an actual light, not just the scene's fixed hemisphere+sun ambience every entity has always shared. A subtle, always-on bloom post-process rides along, matching this project's existing preference for fixing the default look rather than exposing a render knob. Purely presentational, like `Sound`/`AnimationState` before it — confirmed by checking `editor_add`'s own ABI before assuming so, rather than after — so this needed zero native `bridge.cpp` changes, the smallest surface of any component addition so far. See [F39](docs/IMPLEMENTATION_STATUS.md#f39--lighting-tier-2-roadmap-item-0390).

Engine version 0.40.0 adds a real `Particles` component (Sparkle/Smoke/Fire/Confetti presets, color, emission rate, lifetime, speed, size) — any entity can now carry a lightweight `THREE.Points` emitter, simulated every frame in both Edit and Play mode. Purely presentational like `Light` before it, so this needed zero native `bridge.cpp` changes either. Particles live under the same always-visible `anchor` group F39's own post-push fix introduced, so a Particles emitter's visibility is independent of `Renderable.visible` from day one. See [F40](docs/IMPLEMENTATION_STATUS.md#f40--particles-tier-2-roadmap-item-0400).

Engine version 0.41.0 adds `tools/import_model.mjs`, a reusable CLI that replaces the one-off script every prior model import (the Aether kit, Quaternius packs, F37/F38's Mixamo import) hand-rolled from scratch. Point it at a local `.glb`/`.fbx`, give it a category and display name, and it validates the file, copies/re-exports it into `assets/source/kit/`, inserts a new `modelCatalog.ts` entry (auto-detecting `animated` from the file's own `AnimationClip`s), and prints an `assets/CREDITS.md` draft with the mechanical facts already filled in — it deliberately doesn't write the provenance/license claim itself, or automate combining multiple source files onto one mesh/skeleton (still a bespoke script, same as the Mixamo/Quaternius merges). See [F41](docs/IMPLEMENTATION_STATUS.md#f41--asset-import-a-reusable-cli-tier-2-roadmap-item-0410).

Engine version 0.42.0 adds `tools/export_build.mjs`, which packages one authored scene into a standalone, shareable player build — no separate player codebase, just the same browser editor build with a new `.player-mode` CSS class hiding every editor-only affordance and the scene baked in and started automatically. Real visual gameplay only exists in the browser build (the native playground renders flat colored boxes, a simulation-correctness proof, not a real renderer), so a native distributable was out of reasonable scope; asked the user to confirm before committing to that direction. Testing the exported player in a real browser surfaced and fixed a genuine pre-existing race: a player build starts Play immediately, before catalog model fetches resolve, and the existing edit-mode-only rebuild guard (correctly, to avoid resetting simulated state mid-Play) never picked them up afterward — fixed by preloading every referenced model before the first Play. See [F42](docs/IMPLEMENTATION_STATUS.md#f42--exportpackaging-a-standalone-player-build-tier-2-roadmap-item-0420).

Engine version 0.43.0 adds a real `UI` component — screen-anchored (not 3D) Text and Button elements, rendered on the existing HUD canvas, that a scene author can use to build either a HUD or a menu. Button's first design gave it a free-form JSON command, reusing the Authoring Console's own execution path — until an actual click-through test (not just checking it rendered and stored correctly) revealed `EditorDocument.execute()` unconditionally rejects every command outside Edit mode, meaning a Button (only ever clickable in Play/Pause) could never actually do anything. Redesigned around a small fixed action vocabulary instead — `restart`/`resume`/`pause`/`quit` — each one implemented by clicking the real, already-correct Play/Pause/Stop transport button rather than going through `doc.execute()` at all. See [F43](docs/IMPLEMENTATION_STATUS.md#f43--uimenu-system-authorable-screen-space-ui-tier-3-roadmap-item-0430).

Engine version 0.44.0 adds a `save` table to every sandboxed Lua VM — `save.set(key, value)`/`save.get(key)` — so a script can persist a small value (score, unlocked level, position) across Play sessions, backed by `localStorage` in both the editor and the exported standalone player, namespaced per export via `document.title` so two exported games sharing a browser origin don't clobber each other's save data. Named a table rather than two bare globals specifically because `load` is one of the five base-library names this sandbox already removes to block loading code from outside a script's own source — reusing that name for an unrelated getter would misleadingly suggest it was still reachable. The real-browser verification's own first attempt produced a misleading result before the actual code did: a same-`Runtime` `save.set` is visible to a `save.get` moments later in the very next fixed tick of the same catch-up burst, which made a naive "does the first session behave differently from a restored one" script unable to tell its own prior write from a truly separate session's — fixed by testing each direction of the round trip against `localStorage` and a value planted independently of any script, not a script's read of its own recent write. See [F44](docs/IMPLEMENTATION_STATUS.md#f44--saveprogress-a-scriptable-persistence-api-tier-3-roadmap-item-0440).

Engine version 0.45.0 gives hostile AI a real attack. Started from a user report — catching a Chasing enemy "does nothing" — that led to reading the actual combat code rather than guessing: `damage()` was only ever called from the Player's own melee/blast, never the other way around, so combat was one-directional by construction. A new `editor.ai_attack` system lets a `Chasing` `AIAgent` (never `Fleeing`, never a `Pedestrian`) land a hit on the Player, rate-limited by a per-agent cooldown so it's a real fight, not an instant, un-reactable death at 60 hits/second. Weaker than the Player's own melee, and a no-op unless the Player has `Health` authored at all — the same opt-in contract every other entity already has, which also means the existing generic HUD Health bar shows the Player's own health for free. The same investigation surfaced two more real gaps (an instant, animation-less death; no key→animation binding) the user flagged separately — deferred to their own rounds rather than scope-creeping this one. See [F45](docs/IMPLEMENTATION_STATUS.md#f45--hostile-ai-attacks-back-tier-3-part-of-a-make-this-a-real-game-gap-audit-0450).

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
