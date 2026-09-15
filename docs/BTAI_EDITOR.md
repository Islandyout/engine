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
orbit, pan, zoom, frame selection and toggle the grid. Load the actual bundled
Aether bench. Export a JSON scene, reopen it, or reload the locally saved scene.
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
and its textured asset path are also included in this release. Gravity and ground
collision are the only physics behavior this bridge implements; a `Collider`
component authored on an entity is not yet consulted (obstacles do not yet
block a falling body), and the other BTAI component families (AI, animation,
vehicles, health) remain editable/persisted data whose runtime behaviors are
not implemented by this bridge. There is no GTA content hard-coded into this
editor. A game is authored as scene/project data.

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

## Native scene consumption

`engine_playground --scene scene.json` (see
[NATIVE_PLAYGROUND.md](NATIVE_PLAYGROUND.md#opening-an-editor-exported-scene))
opens the same "format 1" document this editor exports, via a bounded native reader
(`engine::parse_scene_document`) that rejects what the editor's own validator would
reject. It only interprets `Transform`, `Renderable`, and `Name`; the other component
families listed above (physics, AI, animation, vehicles, health) still have no native
runtime behavior and are carried as opaque data, as stated elsewhere in this document.
