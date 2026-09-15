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
collision, and (see [Player control](#player-control)) WASD movement and jump/flight
for the entity tagged `Player` are what this bridge implements; a `Collider`
component authored on an entity is not yet consulted (obstacles do not yet
block a falling body), and the other BTAI component families (AI, animation,
vehicles, health) remain editable/persisted data whose runtime behaviors are
not implemented by this bridge. There is no GTA content hard-coded into this
editor. A game is authored as scene/project data.

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

The viewport camera follows the tagged entity's live position in Play mode
(the status bar also shows it, `Player (x, y, z)`, rounded to one decimal);
Edit mode's camera is unaffected, and mouse orbit/pan/zoom still work exactly
as before — following only re-centers the orbit target, it never takes
control of the camera away from you. Movement is velocity-based (the same
`RigidBody.velocity` gravity and jump already integrate through
`engine::physics::step`), so it's naturally blocked by nothing yet:
`Collider`-driven obstacle collision remains real, separate follow-up work
(see the `Collider` note above), so a player currently walks straight through
whatever else is in the scene.

Pausing or losing window focus (an alt-tab, for example) releases any
movement key still held, so a key that never got a matching keyup — a
window manager shortcut eating it, focus leaving the browser entirely —
can't leave the player stuck moving or flying forever; resuming Play needs
a fresh press. Stop restores the pre-Play orbit target instead of leaving
the edit camera aimed at wherever the player last was.

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
