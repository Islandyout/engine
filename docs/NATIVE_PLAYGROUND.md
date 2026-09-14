# Native visual playground (0.7.0)

![Native CPU-rendered frame](images/native-bench.png)

Build the normal SDL-enabled preset, then run `engine_playground` (Windows:
`build\windows-mingw\engine_playground.exe`). The separate foundation host remains available.
The native window shows an orthographic 3D field with boxes and a movable textured Aether bench.
[Asset pipeline and provenance](ASSET_PIPELINE.md).

| Control | Result |
| --- | --- |
| W/A/S/D | Move the bench model in world X/Z |
| Shift | Jump (only while grounded) |
| Q/E | Orbit the camera |
| Z/X | Zoom out/in |
| Space | Create a crate next to the player (64 entity cap) |
| Backspace | Remove the newest non-player box |
| R | Reset the world and camera |
| Window close | Clean shutdown |

The window title includes the controls. The player falls under gravity and collides with
the seven field boxes and any spawned crates; see [Physics](#physics) below. Floor tiles
are still presentation geometry only — the ground plane itself is an implicit physics
constant (`y = 0`), not an entity.
Floor tiles are presentation geometry, while the player and editable boxes are owned
by F5 World. FixedSystems commits structural changes; F4 ActionSystem maps controls.
Raw F3 input events are consumed once per fixed tick, preserving events over zero-tick
frames and avoiding repeated press edges during catch-up.

The SDL-free Graphics library is a deliberately small CPU raster baseline: 800x500 RGBA,
orthographic orbit camera, flat per-face shading, per-pixel depth, opaque axis-aligned
boxes. Coincident equal-depth surfaces retain the first submitted pixel. Input coordinates
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
[editor-exported scene](#opening-an-editor-exported-scene) are static colliders too. This is
axis-aligned box vs. box collision only — no rotation, no continuous (tunneling-safe) sweep,
and only one obstacle is resolved against per overlap per entity per tick, so simultaneous
overlaps with more than one obstacle in the same tick are not fully separated. `engine_physics_tests`
covers gravity integration, settling on the ground plane, an already-grounded body not
sinking, side and top collider resolution, non-static colliders being ignored, and a
non-positive `dt` no-op.
