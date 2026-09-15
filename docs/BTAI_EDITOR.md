# BTAI editor integration

Game Engine remains the primary C++ runtime. The editor is integrated from
Islandyout/BTAI main commit 872355690a14f00824db422c04631422f7b3e920, at the
repository owner's request. The imported TypeScript core, event bus, module
interfaces, input/renderer/physics boundaries, scene components, serializer and
JSON interpreter are retained under `apps/editor/src`. No separate BTAI service
or repository checkout is required to build it.

## Working surface

Open `https://islandyout.github.io/engine/` — the editor is the published site's root;
there is no separate landing page or demo in front of it. The workspace has a scene hierarchy,
component inspector, project name, bundled Aether content, JSON console and a
Three.js viewport. Create, rename, duplicate, delete, reparent and edit components
through the authoring/document layer. Select objects in the hierarchy or viewport;
orbit, pan, zoom, frame selection and toggle the grid. Browse the Project/Content
panel's catalog of 131 bundled CC0 models — the original Aether bench included — by
category and add one to the scene; see [Model catalog](#model-catalog).
Export a JSON scene, reopen it, or reload the locally saved scene.
Undo/redo restores scene data, never DOM snapshots. Scene load validates all
components and hierarchy before replacing the document. Stale handles remain
invalid after replacement. Up to 1,024 entities and 100 undo entries are supported.

The inspector generates scalar/vector/boolean/string controls from serializable
component properties and routes edits through the shared validator. Enum strings
are validated by the authoring API. This is a first property interface, not a
complete extensible reflection registry or transform-gizmo implementation.

## Real C++ runtime connection

Play stages the document's local position, velocity and scale values into a C++
`World` compiled with Emscripten. A replacement is committed only after all bridge
records pass validation. The actual `FixedSystems` scheduler runs
`engine::physics::step` at 60 Hz: every entity falls under real gravity and rests
on an implicit ground plane at y=0 using its own authored `Scale` as the physics
box's dimensions (a box scaled to height 4 rests with its bottom, not a unit box's
center, on the ground) — the same `engine::physics` module the native playground
uses (see [Physics](NATIVE_PLAYGROUND.md#physics)). An entity with a `Parent` is
excluded from physics entirely: its authored position is parent-relative, not
world-space, and the bridge has no notion of hierarchy, so simulating it against
the world ground plane would be simulating it against a plane it isn't actually
at; its local transform passes through Play unchanged instead. The preview reads
positions from C++, while rotation, hierarchy and visual asset assignment come
from the document. Pause retains runtime state; Stop returns to the unchanged
authoring document. Editing is disabled during playback. Coordinates, velocity
and scale transmitted to C++ are bounded to ±1,000,000; scale must be positive.

The browser viewport uses Three.js with WebGL, or CPU canvas projection of the same scene graph when WebGL is unavailable. The canvas path renders geometry/material colors without texture sampling. Both paths run the same authoring and C++ runtime workflow in CI. The browser viewport is not the native renderer. The native SDL playground
and its textured asset path are also included in this release. Gravity, ground
collision, (see [Player control](#player-control)) camera-relative WASD movement
and jump/flight for the entity tagged `Player`, (see
[Vehicle driving](#vehicle-driving)) accelerate/steer driving for an entity that
also carries `Vehicle`, (see [Collision](#collision)) `Collider`-driven obstacle
blocking, and (see [Combat](#combat)) melee/ranged damage against `Health`
entities are what this bridge implements; the other BTAI component families (AI,
animation) remain editable/persisted data whose runtime behaviors are not
implemented by this bridge. There is no GTA content hard-coded into this editor.
A game is authored as scene/project data — see [Example scene](#example-scene)
for one built entirely that way.

## Example scene

`examples/demo-game.json` is a small hand-authored scene exercising every
system above at once: a drivable car (`Player` + `Vehicle`) inside a walled
arena (four `Collider` barriers plus one obstacle crate you can ram or drive
around), two `Health` targets to melee or blast, and a couple of catalog
buildings for backdrop. Open it from the editor's own `Open` button — it
uses `Player`/`Vehicle`, which `engine_playground --scene` doesn't recognize
(see [Native scene consumption](#native-scene-consumption)), so it's a
browser-editor scene, not a native-playground one. `apps/editor/tests/demoScene.test.ts`
loads and validates it the same way the editor's `Open` button would, so it
can't silently drift out of sync with the authoring schema.

## Player control

Add the `Player` component (Project/Content's Add-component list, or the JSON
console) to at most one entity to make it move: WASD drives it in the ground
plane, and Shift jumps while grounded or, held while airborne, sustains a
climb instead of letting the jump decay into an arc — the same feel as the
native playground's own jump/flight (see
[Physics](NATIVE_PLAYGROUND.md#physics)), tuned with the same constants. Input
only listens in Play mode; keys are ignored in Edit mode so they don't fight
the authoring fields' own typing. `Player` carries no data of its own — its
presence on an entity is what makes it move, not any value on it.

Movement is camera-relative: W always moves toward wherever the viewport
camera is currently facing, not a fixed world axis, so which way a key
actually sends the player stays correct no matter how the camera's been
orbited (a fixed-axis mapping felt "flipped" the moment the camera wasn't
pointed straight down -Z, which for the editor's own default start angle
was already true). A rigged/animated `Player` also turns to face the
direction it's actually moving each tick — without this a walk/run clip
plays while the mesh keeps whatever orientation it was authored with,
sliding sideways or backwards instead of visibly running toward where it's
going, which was the biggest single reason movement read as unnatural.
Jump/flight also gets a small squash-and-stretch (stretching tall while
rising, squashing while falling, easing back to the authored scale once
grounded) so a jump has some visual weight instead of reading as a flat
vertical translation — see [Vehicle driving](#vehicle-driving) for a case
this deliberately does *not* apply to.

The viewport camera follows the tagged entity's live position in Play mode
(the status bar also shows it, `Player (x, y, z)`, rounded to one decimal);
Edit mode's camera is unaffected, and mouse orbit/pan/zoom still work exactly
as before — following only re-centers the orbit target, it never takes
control of the camera away from you. Movement is velocity-based (the same
`RigidBody.velocity` gravity and jump already integrate through
`engine::physics::step`), so it's blocked by whatever else in the scene
carries a `Collider` (see [Collision](#collision)) the same way any other
`RigidBody` entity is.

Pausing or losing window focus (an alt-tab, for example) releases any
movement key still held, so a key that never got a matching keyup — a
window manager shortcut eating it, focus leaving the browser entirely —
can't leave the player stuck moving or flying forever; resuming Play needs
a fresh press. Stop restores the pre-Play orbit target instead of leaving
the edit camera aimed at wherever the player last was.

## Vehicle driving

Add `Vehicle` alongside `Player` on the same entity (any catalog model —
try one of the `vehicles` category's cars) to replace the on-foot movement
above with driving: W/S accelerate and reverse along the vehicle's own
heading with real momentum (it keeps coasting a moment after you let go,
and takes a beat to reach full speed), A/D steer that heading rather than
strafing sideways, and the model visually turns to match. This is what
`Vehicle` alone used to do nothing without — the component was authored
data from the start but nothing consumed it until now, so adding it
visibly changed nothing, which was its own bug. It's a simplified arcade
model (constant turn rate regardless of speed, no traction curve), not
real car physics. A placed-and-rotated vehicle always starts facing world
+z the instant Play starts, since there's currently no path for an
authored `Rotation` to seed its initial heading — a known simplification,
not a silent one. A non-square vehicle's collision extents rotate along
with its visible facing (recomputed from its authored footprint each tick
as that footprint's own axis-aligned bounding box at the current heading),
so turning a long car sideways actually widens what it collides with
instead of leaving physics using whatever axis-aligned box it happened to
be authored facing. Jump/flight (Shift) and combat (F/G) still work from
inside a vehicle; the squash-and-stretch above deliberately does not,
since a car visibly stretching like a jumping character would look like a
bug, not a feature.

## Collision

An entity authored with a `Collider` component becomes a static
`engine::physics::Collider` obstacle: any `RigidBody` entity — the player
included, but nothing about this is player-specific, since it is the same
generic `engine::physics::step` resolution the native playground uses (see
[Physics](NATIVE_PLAYGROUND.md#physics)) — is pushed back out along the axis
of least penetration and has that axis of its velocity zeroed the instant its
box overlaps one, instead of passing through. An obstacle still falls under
gravity and rests on the ground like any other entity, using its own
authored `Scale` as the obstacle's box, so a wall placed above the ground
drops and settles before it starts blocking anything. `Collider`'s own
`type`/`halfExtents`/`radius` fields are not yet consulted — every collider,
`AABB` or `Sphere`, resolves as its Box's axis-aligned bounds, the only shape
`engine::physics` implements anywhere in the engine (native playground
included). An entity with a `Parent` never becomes an obstacle even if it
carries a `Collider`, the same reasoning as its exclusion from `RigidBody`
generally: its authored position is parent-relative, not world-space, so
resolving another body against it would be resolving against a box that
isn't actually where it renders.

## Combat

Add the `Health` component to any non-child entity (Project/Content's
Add-component list, or the JSON console; `current`/`maximum` are editable
numbers, defaulting to 100/100) to make it a valid combat target. The
`Player`-tagged entity gets two attacks, ported from the native playground's
own tuned feel (see [Combat](NATIVE_PLAYGROUND.md#combat)): F is melee — while
its box overlaps a `Health` entity's box (the same overlap test `Collider`
resolution and the native playground's own goal/combat checks use), each
press deals 20 damage to every `Health` entity it's touching. G is ranged —
each press fires a small traveling projectile from the player's position
toward whichever `Health` entity is currently nearest (the editor has no
single hardcoded "enemy" the way the native playground does, so the target is
picked fresh per press), dealing 15 damage on contact and disappearing; a
projectile that hits nothing within 1.5 seconds also disappears, dealing no
damage. Either attack destroys its target once `current` reaches 0. Like
`Collider`, a `Health` on a child entity is not consulted: targeting relies on
a world-space overlap test, which a parent-relative box can't correctly
support. A blast never damages the entity that fired it, even though it
spawns at that entity's own position and briefly still overlaps it — relevant
if the `Player` itself also carries `Health`, since nothing else about
targeting is player-specific.

Each F/G press is delivered to exactly one fixed tick, however many (zero to
five) run in the rendered frame the press was drained into — a discrete
action, not something that can be dropped by unlucky frame timing or
re-fired once per tick on a catch-up frame with several.

Projectiles are spawned entirely at runtime — they have no authored entity of
their own, so they're not part of the document and vanish on Stop along with
the rest of runtime state. A destroyed `Health` entity's authored data is
untouched (Stop still restores it, same as every other entity), but for the
rest of that Play session it disappears from the viewport instead of reading
a now-meaningless position. Each alive `Health` entity gets a small
screen-space bar drawn above it in Play mode (green/amber/red by remaining
fraction, the same idea as the native playground's own `BoxView::draw_bar`
— see [HUD](NATIVE_PLAYGROUND.md#hud)); the status bar adds a text companion,
`Selected health: NN%` (or `Selected: defeated`), for whichever entity is
currently selected.

## Build and verification

With Node and Emscripten installed:

```sh
bash tools/build_editor.sh
node tests/browser/editor.cjs
```

The last command needs `npm install --prefix tests/browser` and Playwright Chromium.
Serve the resulting `build/site` directory under `/engine/`, then open `/engine/`.
The "Editor browser build" Pages workflow builds the editor's WASM runtime, runs
editor domain tests and browser interaction tests, and deploys only passing main
builds. CTest also tests the exact editor C++ bridge natively with SDL enabled and
disabled. `npm test --prefix apps/editor` runs document/authoring regressions.

## Deployment

The workflow (`.github/workflows/editor.yml`) compiles the actual engine to
WebAssembly, runs the C++ bridge tests and the browser control tests at desktop and
mobile viewport sizes, and uploads screenshots as the `editor-browser-evidence`
artifact. Pull requests only build and test; only pushes to `main` package and
deploy. To publish at `https://islandyout.github.io/engine/`:

1. In repository Settings > Pages > Build and deployment, select **GitHub Actions**.
2. Merge the reviewed deployment PR into `main`.
3. Open Actions > Editor browser build and verify the `build` and `deploy` jobs pass.
   If the workflow already ran before the settings change, use Run workflow on main.

The deploy job uses the `github-pages` environment with `pages:write` and
`id-token:write`; repository contents remain read-only. Only `main` can publish.
Failed tests prevent deployment. The deployed root (`build/site`) contains the
editor's `index.html`, its bundled `runtime.js` (the single-file WASM module),
`bench.glb`, and the asset/license credit files copied by `tools/build_editor.sh`.

## Benefits retained and next work

- Modular engine/renderer/input/physics boundaries and event bus: source retained.
- Validated JSON command API: used by UI and console, extended with component
  property updates, rename and cycle-checked reparenting.
- Scene serialization and generation-safe entities: retained and hardened.
- Workspace organization: hierarchy left, viewport center, inspector right,
  project/content and console below; panels now operate on document data.
- BTAI editor and runtime separation: editor documents stay isolated during Play;
  the C++ runtime handles fixed execution.

Project/content currently means a project label, scene files and a bundled model
catalog, not a filesystem project manager. Next work should extend this same
contract with stable asset IDs and component metadata/defaults. Preserve this
functioning workflow while expanding it.

## Transform tools (0.9.0)

Select an entity, then choose Move, Rotate or Scale. Drag the colored viewport
handles. World/Local selects the transform frame (scale follows local axes).
Snap uses the selected move distance, 15-degree rotation increments and 0.1 scale
increments. Escape cancels the active gesture. One completed drag is one undoable
`set_component` authoring command; the document is unchanged during the preview.
Stop playback before editing. The same tools work with WebGL and canvas rendering.

The inspector provides validated dropdowns for AI states, collider types and the
bundled model catalog. Derived inverse mass and model-owned materials are read-only.
Reset restores a component through the same defaults used by attach-component.
Rotation numeric fields are explicitly labeled in radians. Property metadata is
kept in the editor layer; component validation remains in the authoring boundary.

Verification adds deterministic gesture/undo tests and actual pointer-drag,
snapping, Escape cancellation, mode/space, enum, reset and read-only browser checks
on both rendering backends. Native simulation and asset coverage remain enabled.

## Model catalog

`apps/editor/src/scene/modelCatalog.ts` is a generated manifest (id, category, name,
path, and an `animated` flag) covering 131 bundled CC0 models from the Aether kit —
buildings, furniture, nature, roads, signs and vehicles (103 static props, 0.19.0),
animals and people (27 rigged, animated characters, 0.20.0), and the original Aether
bench itself (id 1, the one 0.9.0 shipped with — folded into the catalog in 0.21.0
rather than kept as its own separate button, so there's one consistent way to browse
and place every bundled model, the bench included). Only id 0, the default box a mesh
renders as before any catalog entry has loaded, is outside the catalog. Browse and add
one from the Project/Content panel's category/model pickers, or change an
already-placed entity's model through the inspector's `Renderable.mesh` dropdown,
which lists the same 131 entries — the catalog isn't spawn-only.

A static entry (`animated: false`/unset), the bench included, loads through the same
plain Three.js `.clone(true)`. An animated entry loads through `SkeletonUtils.clone` (a
plain Three.js `.clone()`
does not correctly duplicate a `SkinnedMesh`'s bone bindings) and gets its own
`THREE.AnimationMixer` bound to its own embedded `AnimationClip`s — every character
and animal file carries its own copy of the clips it needs, not a shared rig. Which
clip plays is picked each frame from the entity's measured ground speed (the same
position-delta-over-time the render loop already computes), tiered roughly as
idle/walk/trot-or-run/sprint and falling back down the tier — and finally to
whatever clip the model actually has — since not every rig shares the same set (a
quadruped has "trot"; a bird has "peck" and "fly" instead of "run"). Mixers advance
every rendered frame, in both Edit and Play mode, so a placed character never sits
frozen; only Play mode actually moves an entity's position, so ground speed — and
therefore anything but "idle" — is naturally zero until then.

This is baked-clip playback, not the procedural, physically-reactive locomotion
(continuous gait driven by real velocity, with lean/bank/momentum/footstep events)
the source archive's own `src/anim/` implements — that system is written against
Aether's own skeleton/pose classes, not Three.js bones, and porting it is real,
separate follow-up work, not done here.

## Native scene consumption

`engine_playground --scene scene.json` (see
[NATIVE_PLAYGROUND.md](NATIVE_PLAYGROUND.md#opening-an-editor-exported-scene))
opens the same "format 1" document this editor exports, via a bounded native reader
(`engine::parse_scene_document`) that rejects what the editor's own validator would
reject. It only interprets `Transform`, `Renderable`, and `Name`; the other component
families listed above (physics, AI, animation, vehicles, health) still have no native
runtime behavior and are carried as opaque data, as stated elsewhere in this document.
