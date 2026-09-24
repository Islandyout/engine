# Gap analysis: this engine vs Unity 6

This compares engine **0.47.0** (commit `f29a081`) against the [Unity feature reference](README.md), section by section. Each area lists what the engine has, then what's missing.

**Priority:**
- **P1**: blocks common game genres, or is a basic expectation.
- **P2**: expected in a general-purpose engine.
- **P3**: advanced, AAA, or niche.

The coverage percentages are rough estimates of the Unity feature surface in each area. They are not measurements.

## Scorecard

| # | Area | Coverage | What exists | Biggest gaps |
|---|------|---------:|-------------|--------------|
| 01 | Editor | ~25% | Browser editor: hierarchy, auto-inspector, gizmos + snap, undo/redo, prefabs, catalog, JSON save/load, console, standalone export | Asset/project browser, multi-select, prefab overrides/variants, editor extensibility, profiler |
| 02 | Scripting | ~15% | C++ ECS + phased fixed systems; Lua `on_tick` with self pos/vel, `input`, `save`, `animate` | Lifecycle/collision callbacks, access to other entities, spawn/destroy, timers/events, exposed script fields |
| 03 | Rendering | ~10% | Three.js WebGL, PBR standard material, hemisphere + sun, Light component, bloom, tone mapping | **Shadows**, materials/textures authoring, skybox/IBL, fog, camera component, LOD/instancing, GI |
| 04 | VFX | ~5% | `Particles`: 4 presets on `THREE.Points` | Emitter modules, curves, bursts, collision, trails, line renderer, GPU particles |
| 05 | Physics | ~10% | Gravity, velocity, ground plane, static AABB/sphere colliders, grounded flag, raycast vs statics | Dynamic-vs-dynamic, forces/mass, rotation, triggers + callbacks, layers, capsule/mesh, joints |
| 06 | Animation | ~10% | GLB clips via AnimationMixer, speed-based crossfade, `AnimationState` clip pick, death clip, Lua `self.animate` | State machine/Animator, blend trees, layers/masks, IK, root motion, events, keyframe authoring, timeline |
| 07 | Audio/video | ~5% | `Sound`: 10-clip catalog, volume/loop/autoplay, Play-scoped Web Audio | 3D spatial audio, script-triggered sounds, user clip import, mixer, video |
| 08 | UI | ~5% | `UI`: anchored Text/Button, visibility modes, 4 fixed actions; HUD health bar | Layout, images, sliders/inputs, fonts, Button → script, world-space UI, styling |
| 09 | Input | ~40% native / ~10% browser | Native: actions, contexts, bindings, chords, dead zones, gamepad, replay. Browser: keyboard only | Native action system not exposed to browser/Lua; mouse/gamepad/touch in scripts; rebinding |
| 10 | 2D | 0% | — | Everything: sprites, atlases, tilemaps, 2D physics, 2D lights, sorting |
| 11 | World/AI/camera | ~5% | Model catalog placement; wander/chase/flee/attack AI; camera follow | Terrain, NavMesh pathfinding, splines, level modeling, camera system |
| 12 | DOTS/jobs | ~10% | Typed ECS world, generation handles, query snapshots, deferred changes, fixed phases | Job system/threads, chunked archetype storage, change filters, SIMD math |
| 13 | Networking/services | 0% | — | Netcode, transport, lobby/relay, backend services, localization |
| 14 | Platforms/build | ~15% | Browser editor + standalone web player export; native SDL host (CPU renderer); headless build | Native GPU renderer, mobile, consoles, XR, asset bundles/streaming, build profiles |
| 15 | Profiling/testing | ~20% | C++ ctest suites, editor unit tests, browser test harness | Profiler, frame debugger, stats overlay, memory tools, in-editor test runner |
| 16 | AI/ML | 0% | — | On-device inference, ML agents, behaviour trees |

## A bug-class finding: authored but inert

This is the same class of bug the project has fixed before (Vehicle, AIState, AnimationState). **`RigidBody.mass`, `inverseMass` and `dynamic`** are authorable in `apps/editor/src/scene/Components.ts`, but `apps/editor/runtime/bridge.cpp` never reads them: "mass" appears 0 times. Native `physics::RigidBody` holds only `velocity` and `grounded`.

Fix options:
- Wire these fields up as part of the physics P1 work below.
- Or remove them from the inspector until they do something.

---

## 01 Editor

**Have**
- Hierarchy panel: create, rename, duplicate, delete, cycle-checked reparent.
- Inspector: generated from component metadata, with grouped Add Component.
- Move/rotate/scale gizmos with snapping. Orbit, pan, zoom, frame selection, grid.
- Undo/redo: 100 entries, data-based.
- Prefabs: live-propagating, with unlink.
- Bundled model catalog: 131 models.
- JSON scene export/import and localStorage autosave. JSON command console. Play/pause.
- `tools/export_build.mjs` standalone player and `tools/import_model.mjs` CLI.

**Gaps**
- **P1**
  - Asset/project browser for user files: import textures, audio and models through the UI, not only the CLI.
  - Multi-select with group transform.
  - Copy/paste of entities and components.
  - Play-mode inspection: watch live values while playing.
- **P2**
  - Prefab overrides, variants and nesting.
  - Multi-scene or additive scenes, with a scene list.
  - Search across the scene and assets.
  - Scene view draw modes (wireframe, overdraw).
  - Keyboard shortcut manager. Presets. Selection history.
  - A camera preview for the game camera.
- **P3**
  - Editor extensibility: custom inspectors, windows and gizmos from user code.
  - Package or plugin system.
  - Version-control-friendly asset GUIDs with `.meta`-style settings.

## 02 Scripting

**Have**
- C++ `World` with typed components and non-reused handles.
- Fixed systems ordered by phase, then order, then name.
- Deferred structural changes.
- Sandboxed Lua 5.4 `Script` component:
  - `on_tick(dt)`.
  - `self.x/y/z` (read) and `self.vx/vy/vz` (write).
  - `self.animate`, `input.down/pressed`, `save.get/set`.
  - Instruction-count watchdog.

**Gaps**
- **P1**
  - **Lifecycle callbacks**: `on_start`, `on_destroy`, `on_enable`/`on_disable`.
  - **Collision and trigger callbacks**: `on_collision`, `on_trigger_enter`/`exit`. This depends on physics triggers.
  - **Access to other entities**: find by name or tag, and read/write their components.
  - **Spawn and destroy from script**: instantiate a prefab, destroy self or others.
  - **Script-exposed fields** editable in the inspector, like Unity's `[SerializeField]`.
  - Direct rotation and scale access, not only position and velocity.
- **P2**
  - Timers and coroutines: `wait(seconds)`, `after(t, fn)`.
  - Events and messaging between scripts. A time API (`time.now`, `time.scale`, pause).
  - Tags and layers.
  - Scene loading from script, including level transitions.
  - Data assets, like ScriptableObject.
  - A math helper library (vec3, lerp, quaternion).
  - Script errors with line numbers in the console. Hot reload.
- **P3**
  - A debugger with breakpoints.
  - Native C++ gameplay modules loadable per project.
  - Visual scripting.

## 03 Rendering

**Have**
- Three.js WebGL renderer with `MeshStandardMaterial`.
- Hemisphere and directional ambience.
- `Light` component: Point, Spot, Directional.
- Bloom (EffectComposer) and tone mapping plus output color space.
- The native side uses a CPU orthographic `BoxView` reference renderer.

**Gaps**
- **P1**
  - **Shadows**: `shadow` appears 0 times in the renderer or editor. Unity default: cascaded directional shadows plus soft shadows.
  - **Camera component**: FOV, near/far, orthographic, multiple cameras. Today the camera is only the editor or follow camera.
  - **Materials authoring**: color, texture maps, metallic/roughness, emission, transparency.
  - **Skybox and environment lighting (IBL)**: HDRI or procedural sky, reflections.
  - **Fog**.
- **P2**
  - Texture import settings: filtering, wrap, mipmaps, compression.
  - LOD groups. GPU instancing via InstancedMesh, for scatter and vegetation.
  - Frustum and occlusion culling, and a visibility budget.
  - A post-processing stack beyond bloom: AA (FXAA/SMAA/TAA), color grading/LUT, vignette, DOF, motion blur, SSAO. The local volumes of Unity's Volume framework are a useful model.
  - Render-to-texture (mirrors, minimaps). Emissive glow per material. HDR.
  - A native GPU renderer: SDL3 GPU or Vulkan/Metal/D3D12. The native path is CPU-only today.
- **P3**
  - Baked GI and lightmaps, light probes, reflection probes.
  - Shader authoring: custom GLSL/WGSL and a node graph.
  - Decals. WebGPU backend. Ray tracing. Water, clouds, volumetrics.

## 04 VFX

**Have**
- `Particles`: Sparkle/Smoke/Fire/Confetti presets, with color, rate, lifetime, speed and size.

**Gaps**
- **P1**
  - Emitter shape (cone, sphere, box, mesh).
  - Bursts (one-shot for hits and explosions), triggerable from script.
  - Color, size and alpha over lifetime curves.
  - Textured and flipbook particles.
- **P2**
  - Gravity and forces, noise.
  - Collision with the world.
  - Sub-emitters on death or collision.
  - Local vs world simulation space. Trails.
  - **Line and trail renderers** for tracers, lasers and swords.
- **P3**
  - GPU particle simulation, as in VFX Graph.
  - Lens flares. Mesh particles.

## 05 Physics

**Have**
- Gravity and velocity integration. Ground plane.
- Static box and sphere colliders with least-penetration push-out.
- `grounded` flag.
- Raycast against static colliders and the ground.
- `overlaps()` for AABB trigger-style checks.

**Gaps**
- **P1**
  - **Dynamic-vs-dynamic collision**: movers pass through each other, and raycasts ignore movers.
  - **Mass, forces and impulses**: `add_force`, `add_impulse` (see the inert fields above).
  - **Triggers** as a first-class collider flag with enter/stay/exit events.
  - **Collision layers** and a layer matrix.
  - Capsule collider, which fits characters.
- **P2**
  - Rotational dynamics: angular velocity, torque, inertia.
  - Physics materials: friction, bounciness.
  - Rotated (oriented) boxes and convex/mesh colliders.
  - Overlap queries (sphere/box) and shape casts.
  - A character controller with slope limit and step offset.
  - Sleeping and a broadphase for scale.
  - Continuous collision detection for fast projectiles.
  - Kinematic bodies.
- **P3**
  - Joints: hinge, fixed, spring, configurable. Ragdolls.
  - Wheel colliders for realistic vehicles (today's driving is arcade).
  - Cloth. 2D physics. Deterministic rollback. Candidate libraries: Jolt, Box2D v3.

## 06 Animation

**Have**
- Embedded GLB clips played through `AnimationMixer`.
- Idle/walk/run crossfade driven by measured speed.
- `AnimationState` per-model clip, time and looping.
- Death clip plus fade.
- Lua `self.animate`.
- A Mixamo import path.

**Gaps**
- **P1**
  - **Animation state machine**: states, transitions with conditions, exit time, and blend duration.
  - **Parameters** (float/int/bool/trigger) settable from Lua.
  - **Animation events**: a callback at clip time, for footsteps and hit frames.
- **P2**
  - Blend trees (1D and 2D directional locomotion).
  - Layers with avatar masks, e.g. upper-body attack while running.
  - Root motion.
  - **Retargeting**: humanoid retarget failed in F38, so a working bone-map retargeter is the missing piece.
  - **Keyframe animation authoring** for any property (doors, platforms, lights), like Unity's Animation window.
  - Tweening helpers.
- **P3**
  - IK: foot placement, look-at, two-bone.
  - Constraints (aim, parent, look-at).
  - Blend shapes and morph targets from script.
  - Timeline and cutscenes: tracks, signals, camera cuts.

## 07 Audio and video

**Have**
- `Sound`: a 10-clip Kenney catalog, volume, loop, autoplay, lifecycle tied to Play.

**Gaps**
- **P1**
  - **Play sounds from script**: `sound.play("hit")`, one-shots on events.
  - **User audio import**.
  - **3D spatial audio** with distance attenuation (`PannerNode` is unused).
- **P2**
  - Music tracks with crossfade.
  - Mixer groups (music/SFX/UI) with volume settings.
  - Pitch randomization.
  - Audio listener on the camera.
- **P3**
  - Effects: reverb zones, low-pass, ducking.
  - Randomized containers. Video playback.

## 08 UI

**Have**
- `UI`: Text and Button at 9 anchors.
- Visibility modes: always, play, pause.
- Actions: restart, resume, pause, quit.
- A screen-space health bar.

**Gaps**
- **P1**
  - **Button → script callbacks**: today only 4 fixed actions.
  - **Text bound to data**: `ui.set_text("score", n)` from Lua.
  - **Images and panels**.
  - A layout system: stacks, grids, padding, scale-with-screen.
- **P2**
  - Sliders, toggles, input fields, dropdowns.
  - Fonts and sizes, rich text.
  - Health and progress bars as a UI element, not hard-coded.
  - Menus across scenes. Controller/keyboard navigation of UI.
  - UI animation and transitions.
- **P3**
  - A styling language (CSS-like, as with UI Toolkit USS).
  - World-space UI: nameplates, floating damage numbers.
  - Localization.

## 09 Input

**Have**
- **Native:**
  - `InputMap`, contexts with priority masking.
  - Keyboard, mouse and gamepad bindings, and chords.
  - Dead zones, response curves, inversion.
  - Validated serialization and deterministic replay.
  - This is close to Unity's Input System in design.
- **Browser:**
  - Keyboard events.
  - Lua `input.down`/`input.pressed` on keys.

**Gaps**
- **P1**
  - **Expose the native action system through the WASM bridge**, so Lua can query actions (`input.action("jump")`) and not raw keys.
  - **Mouse input in scripts**: position, buttons, delta, and pointer lock for mouse-look.
  - **Gamepad in the browser**: Gamepad API, with the native binding model reused.
- **P2**
  - Touch input and on-screen controls for mobile web.
  - A rebinding UI with persisted overrides; the native serializer already exists.
  - Local multiplayer device assignment.

## 10 2D (entirely absent)

- **P2**
  - Sprite renderer, sprite sheets and flipbook animation.
  - Orthographic 2D camera.
  - Sorting layers and order-in-layer.
  - 2D physics (Box2D) and tilemaps.
- **P3**
  - Sprite atlases, 9-slice.
  - 2D lights and shadows. Skeletal 2D animation. Pixel-perfect camera.

## 11 World building, AI and cameras

**Have**
- Place catalog models.
- `AIState` wander/chase/flee/attack with direct steering.
- `Pedestrian`/`Vehicle` archetypes.
- Camera follow.

**Gaps**
- **P1**
  - **Pathfinding**: a NavMesh (or grid A*) bake from colliders and agents that path around obstacles. Today AI steers straight at targets.
  - **Camera system**: third-person orbit with collision, look-at framing, camera shake, cinematic cuts. Unity's Cinemachine is a good model.
- **P2**
  - Terrain: heightmap sculpting, texture painting, tree and grass scatter.
  - Splines: paths for platforms, cameras, roads.
  - Behaviour trees or a visual AI graph.
  - Perception: sight cones and hearing.
- **P3**
  - In-editor level modeling (extrude, bevel), like ProBuilder.
  - Scatter and paint tools.
  - Wind zones. Water.

## 12 ECS, jobs and parallelism

**Have**
- A typed component registry, generation-safe entities, query snapshots, FIFO deferred changes, and deterministic fixed phases.

**Gaps**
- **P2**
  - A job system: worker threads and dependency handles. WASM needs threads plus COOP/COEP.
  - Archetype/chunk storage for cache-friendly iteration. The `query()` path builds `std::vector<Entity>` snapshots.
  - Change filters and enableable components.
- **P3**
  - SIMD math library.
  - Burst-style compiled hot paths.
  - Streaming subscenes.

## 13 Networking and services (entirely absent)

- **P2**
  - Client-server netcode: replicated components, RPCs, ownership.
  - Transport: WebSocket/WebRTC for the web, UDP natively.
  - Lobby and relay.
  - The headless build is a head start for dedicated servers.
- **P3**
  - Client prediction and rollback, which the deterministic fixed-step clock and input replay would support.
  - Backend services: accounts, cloud save, leaderboards, analytics.
  - Localization tables.

## 14 Platforms and build

**Have**
- Browser editor on GitHub Pages.
- Standalone web player export.
- Native Windows/Linux SDL3 host (CPU renderer) and a headless build.

**Gaps**
- **P1**
  - Native builds render with a real GPU pipeline and run the same gameplay as the browser. Today, real visual gameplay exists only in the browser build (see F42).
- **P2**
  - Asset bundling and streaming: load levels on demand, not everything up front.
  - Build profiles (per-target settings) and compression.
  - PWA/mobile-web packaging.
- **P3**
  - Mobile native (Android/iOS), consoles, XR (WebXR is the cheapest path).

## 15 Profiling, debugging, testing

**Have**
- ctest suites: core, input, actions, world, physics, script, scene, SDL, bridge.
- Editor unit tests and a browser test harness.

**Gaps**
- **P1**
  - An in-editor **stats overlay**: FPS, frame time, entity count, draw calls, triangles.
- **P2**
  - A **profiler**: per-system timings from `FixedSystems`, frame timeline, memory.
  - A physics debug view: collider wireframes, contacts, rays.
  - A frame debugger via Spector.js-style draw inspection.
- **P3**
  - Script profiler, memory snapshots, and a user-facing test runner for game logic.

## 16 AI/ML (absent)

- **P3**
  - On-device model inference (ONNX Runtime Web is the web analogue of Sentis).
  - Reinforcement-learning agents.
  - AI-assisted authoring in the editor.

---

## Suggested order (highest leverage first)

1. **Physics core**:
   - Dynamic-vs-dynamic collision, triggers with enter/exit events, layers, forces and mass.
   - Wire up or remove the inert `RigidBody.mass/inverseMass/dynamic` fields.
   - Unblocks gameplay, script callbacks and projectiles.
2. **Lua API breadth**:
   - Lifecycle and collision callbacks, find/spawn/destroy, exposed fields.
   - Timers, sound and UI calls from script.
   - This makes the Script component able to build most small games without C++ changes.
3. **Rendering basics**:
   - Shadows, a Camera component, material/texture authoring, skybox/IBL, fog.
   - Gives the biggest visual jump for the least code, since Three.js supports all of these natively.
4. **Animation state machine** with parameters and events.
5. **Pathfinding (NavMesh or grid A\*) and a camera system**: shake, orbit with collision.
6. **Input parity**: expose the native action system to WASM/Lua, and add mouse/gamepad/touch.
7. **UI expansion**: script callbacks, images, layout, sliders.
8. **Particles expansion**: shapes, bursts, curves, textures. Add a line/trail renderer.
9. **Asset browser and user imports** in the editor: textures, audio, models.
10. **Profiler and stats overlay**, then native GPU renderer parity, then 2D, networking and terrain as major new pillars.
