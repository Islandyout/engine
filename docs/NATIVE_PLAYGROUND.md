# Native visual playground (0.7.0)

![Native CPU-rendered frame](images/native-bench.png)

Build the normal SDL-enabled preset, then run `engine_playground` (Windows:
`build\windows-mingw\engine_playground.exe`). The separate foundation host remains available.
The native window shows an orthographic 3D field with boxes and a movable textured Aether bench.
[Asset pipeline and provenance](ASSET_PIPELINE.md).

| Control | Result |
| --- | --- |
| W/A/S/D | Move the bench model in world X/Z |
| Shift | Jump while grounded; hold while airborne to fly |
| Q/E | Orbit the camera |
| Z/X | Zoom out/in |
| Space | Create a crate next to the player (64 entity cap) |
| Backspace | Remove the newest non-player box |
| R | Reset the world and camera |
| Window close | Clean shutdown |

The window title includes the controls. The player falls under gravity and collides with
the seven field boxes and any spawned crates; see [Physics](#physics) below. A three-step
platform path leads to a gold goal marker — see [Playable slice](#playable-slice). Floor
tiles are still presentation geometry only — the ground plane itself is an implicit physics
constant (`y = 0`), not an entity. The player and editable boxes are owned by F5 World.
FixedSystems commits structural changes; F4 ActionSystem maps controls.
Raw F3 input events are consumed once per fixed tick, preserving events over zero-tick
frames and avoiding repeated press edges during catch-up.

The SDL-free Graphics library is a deliberately small CPU raster baseline: 800x500 RGBA,
orthographic orbit camera, flat per-face shading, per-pixel depth, opaque axis-aligned
boxes. A `Box` face's brightness comes from the same fixed directional light `draw_mesh()`
applies to a normal-carrying mesh vertex (`face_light()` in `box_view.cpp`), not a canned
per-face table — a face angled away from the light gets only the flat ambient floor a
backfacing mesh normal would get, instead of an arbitrary always-lit constant. Coincident
equal-depth surfaces retain the first submitted pixel. Input coordinates
are finite and bounded; malformed sizes/cameras are rejected before modifying the frame.
The SDL backend scales that buffer into a freshly acquired window surface after resize.
No SDL types appear in graphics or scene code. Presentation must run on the main thread.

This is a runnable native integration milestone, not the final GPU renderer. It establishes
camera/world/framebuffer contracts and image tests before adding GPU resources, materials,
textures or general meshes. The renderer is independently implemented; Aether's camera and
primitive layout were reviewed as references, and its adapted seeded generator sets box heights.
Aether code, shader techniques and assets remain adoption candidates in [the subsystem tracker](AETHER_ADOPTION.md).

Automation:

```
engine_playground --headless
engine_playground --smoke
engine_playground --snapshot frame.ppm
engine_playground --scene scene.json
engine_playground --save-scene scene.json
```

Headless runs four fixed ticks. Smoke does the same in a hidden SDL window. Snapshot writes
one native renderer frame without initializing SDL. CI uploads screenshots and native binaries;
Windows builds also run tests. See the PR's Actions artifacts for downloadable packages.

Tests cover action movement, single-edge spawn, removal, stale handles after reset, camera
changes, repeatable frames, depth order, malformed renderer input, surface resize and shutdown.
A dummy-driver test proves surface presentation but does not replace human desktop testing.

## Opening an editor-exported scene

`--scene scene.json` loads a "format 1" scene document — the same JSON the BTAI editor's
`serializeScene`/`exportScene` produces (`apps/editor/src/scene/SceneSerializer.ts`) — instead
of the playground's built-in random boxes. `engine::parse_scene_document`
(`include/engine/scene/scene_document.hpp`) is a bounded native reader for that format: it
rejects the same malformed input the editor's own validator rejects (wrong `format`, an
unrecognized component name, more than 1024 entities, an out-of-range or cyclic parent
reference, a malformed `Transform`/`Renderable`/`Name`), and is fed by a small JSON parser
scoped to exactly this schema, not a general-purpose library.

Every entity with a `Transform` and no `Renderable.visible: false` is placed as a box at its
authored position; entities without a `Transform` (AI/health/vehicle-only data, for example)
have nothing to place and are skipped. Box color is a deterministic placeholder keyed by
`Renderable.material`, not the editor's actual material — the CPU box view has no textured-
material path. Ten of the editor's fifteen component types (`Rotation`, `Scale`, `Velocity`,
`Acceleration`, `RigidBody`, `Collider`, `Health`, `AIState`, `Pedestrian`, `Vehicle`,
`AnimationState`) are accepted as opaque JSON objects — the loader checks that they exist and
are objects, but not their fields — so scenes using them still load without erroring; only
`Transform`, `Renderable`, and `Name` are fully validated and interpreted. Parent/child
hierarchy is validated (bounds, generation, no cycles) but not applied: every entity renders at
its own Transform position, independent of its parent's.

Pressing R reloads the same loaded document rather than reverting to the built-in scene.
`tests/scene_document_tests.cpp` covers the parser's accept/reject cases in isolation;
`tests/fixtures/editor_scene.json` plus the `engine_playground_scene_headless` CTest case cover
the loader end to end, including a hidden entity and a Transform-less entity. This closes one
concrete gap between the editor and the native playground — an editor-authored scene layout is
now something the native renderer can open — without adding a new gameplay system. It does not
give the native playground editor-equivalent rendering (materials, meshes-per-entity, animation)
or apply hierarchy; those remain future work, same as the rest of this document's scope.

Next: bring Aether primitive meshes and a credited model/material into the native visual
path, with a loader fixture and visible result. Physics and scene authoring follow that path.

## Physics

`engine::physics` (`include/engine/physics/physics.hpp`, `source/engine/physics/physics.cpp`)
adds gravity, an implicit ground plane, and axis-aligned collision to any entity carrying
both a `Box` and a `physics::RigidBody`. A `physics::Collider` marks another `Box` entity
as a solid, static obstacle. `physics::step(world, dt)` runs each fixed tick, after the
existing movement system: it integrates gravity into velocity, moves the box by velocity,
resolves the body out of the ground plane (`y = 0`) and out of any overlapping static
collider along the axis of least penetration, and zeroes the resolved velocity component.
A body is marked `grounded` only when the resolution was upward (resting on the ground or
on top of a collider) — that flag gates the jump control.

In the playground: the player has a `RigidBody` and jumps (Shift) only while grounded; the
seven field boxes and any crate spawned with Space carry a static `Collider`, so the player
now physically stops at them instead of passing through. Boxes loaded from an
[editor-exported scene](#opening-an-editor-exported-scene) are static colliders too.

Holding Shift while airborne sustains a climb instead of just leaving the player to a single
jump arc: each tick it is still held and `!grounded`, the move system sets `velocity.y` to a
flat `fly_speed` (4.0, gentler than `jump_speed`'s 7.0 liftoff) — physics then applies that
tick's gravity on top, netting `fly_speed - gravity·dt` per tick, so holding produces a
steady climb rather than an ever-accelerating one. Releasing stops resetting `velocity.y`
and gravity alone takes back over, so the player decelerates and falls exactly as after any
jump. There is no controlled descent in this first pass — falling is the only way down while
airborne — and because liftoff itself needs a fresh press-while-grounded edge, landing
briefly while still holding Shift does not auto-relaunch; the control has to be released and
pressed again once grounded (see the scripted platforming test below for exactly this
gotcha).

This is axis-aligned box vs. box collision only — no rotation, no continuous (tunneling-safe) sweep,
and only one obstacle is resolved against per overlap per entity per tick, so simultaneous
overlaps with more than one obstacle in the same tick are not fully separated. `engine_physics_tests`
covers gravity integration, settling on the ground plane, an already-grounded body not
sinking, side and top collider resolution, non-static colliders being ignored, a
non-positive `dt` no-op, and `physics::overlaps` (the same box-vs-box test `step` uses
internally, exposed for non-physical trigger checks like the goal below). Flight itself is
playground/scene-level, not part of `engine::physics`, so it is covered by
`engine_playground_tests` instead: holding jump sustains a climb well beyond one jump's
height, velocity stays near `fly_speed` instead of decaying, and releasing lets gravity take
back over.

## Saving a scene

`--save-scene scene.json` writes every current `Box` entity (the player included) to a
"format 1" scene document via the new `engine::serialize_scene_document`
(`include/engine/scene/scene_document.hpp`) — the exact inverse of `parse_scene_document`
for the fields `SceneDocument` models — and exits immediately, without loading the asset or running any simulation ticks. It
composes with `--scene` — load a document, then immediately re-save it, e.g. to round-trip
or reformat an editor export through the native reader/writer — but a save takes priority
over `--snapshot` if both are given, since it returns before that code runs. Each entity is
written as a `Transform` at its current position
plus a visible `Renderable{mesh: 0, material: 0}`; a `Box`'s size and actual color have no
field in the format and are not written, and entities carry no name or parent since the
playground's `World` never tracked those to begin with — this snapshots layout, not a
faithful copy of whatever was originally loaded. The output is compact (no inserted
whitespace) but otherwise the same JSON shape `JSON.parse` and the editor's own
`parseSceneText`/`deserializeScene` (`apps/editor/src/scene/SceneSerializer.ts`) accept, so
a saved file opens in either the native playground (`--scene`) or the browser editor.

`engine_playground_tests` exercises `Scene::export_document()` directly: it captures every
`Box` entity, and round-tripping it through `serialize_scene_document` then
`parse_scene_document` reproduces the player's exact position. `scene_document_tests.cpp`
covers `serialize_scene_document` in isolation: name/parent/Transform/Renderable round-trip
exactly, including a name needing JSON escaping and negative/fractional coordinates, an
entity with none of those fields serializes an explicit empty `components` object rather
than omitting the entity's shape, and `engine_playground_save_scene_headless` is a CTest
smoke case for the CLI flag itself.

## Playable slice

The default scene (not a loaded `--scene` document, which has no goal) adds a hand-authored
`place_platform_path()`: three static `Collider` platforms at `z = 6` — clear of the
player's `z = 3` spawn and the field boxes' `z = -3` row — 0.5 units taller than the last
(tops at `y = 1.0, 1.5, 2.0`, each flush against the next), plus a gold goal marker resting
on the final one. Touching the goal (an AABB overlap against the player's `Box`, checked
each tick via `physics::overlaps` — the same test `physics::step` uses internally for
collider resolution, but without pushing anything out) sets `Scene::won()`, which stays true
until the next reset. The goal has no `Collider` (touching it, not standing on it, wins) and
is exempt from the "remove" control (deleting the one entity that can ever end the level
would be a dead end no reset fixes at the input level — though `reset()` does still recreate
it from scratch).

Reaching the platforms means jumping onto each one — walking into the side of a `Collider`
box blocks movement exactly like the field boxes and crates do, so the path is not a flat
run; the maximum jump apex (`jump_speed² / (2·-gravity) ≈ 1.36` units, from the constants in
[Physics](#physics)) comfortably clears each 0.5-unit step. In the desktop build, reaching
the goal prints a one-line console message (`You reached the goal! Press R to play again.`)
the first tick `won()` becomes true, tracked separately from world state since `won()` itself
resets to false on the next `R`.

`engine_playground_tests` scripts a two-phase input sequence (approach along `z` only, clear
of every platform's footprint, then traverse along `x`, re-pressing jump the instant the
player is `grounded`) and asserts the goal is reached within a generous tick budget, and
that the goal survives that input un-removed. Jump is tied to `grounded` rather than a fixed
press/release timer deliberately: a timer can end up re-pressing before the player has
landed from the previous hop, and since [flight](#physics) now means holding jump while
airborne sustains a climb, that stray press engages flight instead of a fresh liftoff and
sends the script well off the intended path — the same bunny-hop pattern (land, jump again)
a real player would use. A diagonal approach is deliberately not used or tested either: it
walks the player into a platform's `z`-face while still at ground level, which blocks it
like any other wall — a real property of static box colliders illustrated here, not a
shortcut this path supports.
