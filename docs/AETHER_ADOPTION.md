# Aether adoption tracker

Goal: retain the useful capabilities of every supplied subsystem through tested native
adaptation or an interoperable tool. A pending row is an explicit obligation to evaluate,
not an implicit rejection. Existing tested native contracts take priority over known defects.

Source archive identity and initial findings: [AETHER_REVIEW.md](AETHER_REVIEW.md).
All 51 source modules are listed below. Asset adoption additionally covers the 133 supplied
GLBs and their credits/manifest; geometry, materials, skins and clips need native loader tests.

| Source module | Current state | Integration / verification gate |
| --- | --- | --- |
| `aether.js` | Pending implementation and verification | Map public API to engine-owned modules |
| `anim/blend.js` | Pending implementation and verification | Adopt clip/rig/IK behavior with pose and motion tests |
| `anim/clip.js` | Pending implementation and verification | Adopt clip/rig/IK behavior with pose and motion tests |
| `anim/ik.js` | Pending implementation and verification | Adopt clip/rig/IK behavior with pose and motion tests |
| `anim/ikrig.js` | Pending implementation and verification | Adopt clip/rig/IK behavior with pose and motion tests |
| `anim/layers.js` | Pending implementation and verification | Adopt clip/rig/IK behavior with pose and motion tests |
| `anim/locomotion.js` | Pending implementation and verification | Adopt clip/rig/IK behavior with pose and motion tests |
| `anim/rig.js` | Pending implementation and verification | Adopt clip/rig/IK behavior with pose and motion tests |
| `anim/skeleton.js` | Pending implementation and verification | Adopt clip/rig/IK behavior with pose and motion tests |
| `core/audio.js` | Pending implementation and verification | Preserve native ownership/input; adopt tested math and audio adapters |
| `core/ecs.js` | Reviewed defects; retain native baseline | Preserve native ownership/input; adopt tested math and audio adapters |
| `core/engine.js` | Pending implementation and verification | Preserve native ownership/input; adopt tested math and audio adapters |
| `core/input.js` | Pending implementation and verification | Preserve native ownership/input; adopt tested math and audio adapters |
| `core/math.js` | Partial: seeded generator integrated; remaining functions pending | Preserve native ownership/input; adopt tested math and audio adapters |
| `core/transform.js` | Pending implementation and verification | Preserve native ownership/input; adopt tested math and audio adapters |
| `editor/editor.js` | Pending implementation and verification | Connect scene editing to native serialization and runtime |
| `game/agents.js` | Pending implementation and verification | Adapt behaviors after native scene and physics contracts |
| `game/behaviors.js` | Pending implementation and verification | Adapt behaviors after native scene and physics contracts |
| `game/camera.js` | Pending implementation and verification | Adapt behaviors after native scene and physics contracts |
| `game/character-state.js` | Pending implementation and verification | Adapt behaviors after native scene and physics contracts |
| `game/entity.js` | Pending implementation and verification | Adapt behaviors after native scene and physics contracts |
| `game/interaction.js` | Pending implementation and verification | Adapt behaviors after native scene and physics contracts |
| `game/nav.js` | Pending implementation and verification | Adapt behaviors after native scene and physics contracts |
| `game/perception.js` | Pending implementation and verification | Adapt behaviors after native scene and physics contracts |
| `game/spec.js` | Pending implementation and verification | Adapt behaviors after native scene and physics contracts |
| `game/surfaces.js` | Pending implementation and verification | Adapt behaviors after native scene and physics contracts |
| `game/vehicle.js` | Pending implementation and verification | Adapt behaviors after native scene and physics contracts |
| `gpu/device.js` | Pending implementation and verification | Implement native GPU resource lifecycle and validation |
| `gpu/util.js` | Pending implementation and verification | Implement native GPU resource lifecycle and validation |
| `loaders/assets.js` | Pending implementation and verification | Adapt format semantics; fixture tests and credited assets |
| `loaders/gltf.js` | Native static GLB cooker/reader path tested on bench; broader loader features pending | Adapt format semantics; fixture tests and credited assets |
| `physics/constraints.js` | Pending implementation and verification | Run solver/controller probes; native integration and regression scenes |
| `physics/ragdoll.js` | Pending implementation and verification | Run solver/controller probes; native integration and regression scenes |
| `physics/world.js` | Pending implementation and verification | Run solver/controller probes; native integration and regression scenes |
| `procgen/textures.js` | Planks albedo generated and displayed natively; other patterns/maps pending | Port deterministic texture generation with reference outputs |
| `render/clustered.js` | Pending implementation and verification | Port mesh/material/shader stages with reference-image checks |
| `render/frame.js` | Pending implementation and verification | Port mesh/material/shader stages with reference-image checks |
| `render/geometry.js` | Pending implementation and verification | Port mesh/material/shader stages with reference-image checks |
| `render/material.js` | Pending implementation and verification | Port mesh/material/shader stages with reference-image checks |
| `render/postfx.js` | Pending implementation and verification | Port mesh/material/shader stages with reference-image checks |
| `render/renderer.js` | Pending implementation and verification | Port mesh/material/shader stages with reference-image checks |
| `render/shaders/common.js` | Pending implementation and verification | Port mesh/material/shader stages with reference-image checks |
| `render/shadows.js` | Pending implementation and verification | Port mesh/material/shader stages with reference-image checks |
| `render/sky.js` | Pending implementation and verification | Port mesh/material/shader stages with reference-image checks |
| `traffic/roadgraph.js` | Pending implementation and verification | Adopt after physics/navigation contracts |
| `traffic/traffic.js` | Pending implementation and verification | Adopt after physics/navigation contracts |
| `ui/hud.js` | Pending implementation and verification | Adapt controls and diagnostics to the chosen editor front end |
| `world/planet.js` | Pending implementation and verification | Retain for later planet/large-world tests |
| `world/quadsphere.js` | Pending implementation and verification | Retain for later planet/large-world tests |
| `world/system.js` | Pending implementation and verification | Retain for later planet/large-world tests |
| `world/walker.js` | Pending implementation and verification | Retain for later planet/large-world tests |

The native playground uses the adapted generator. Its CPU rasterizer is a reference
implementation, not completion of the renderer rows. Each following milestone updates
these rows with implemented paths and test evidence.
