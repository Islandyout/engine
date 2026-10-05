# Implementation status

What the engine can do, release by release. Each milestone has its own page in [changelog/](changelog/); the newest are last. For what each component and script function does today, see [COMPONENTS.md](COMPONENTS.md) and [SCRIPT_API.md](SCRIPT_API.md).

| Milestone | Summary |
|---|---|
| [F0](changelog/F0.md) | Foundation bootstrap |
| [F1](changelog/F1.md) | Application lifecycle |
| [F2](changelog/F2.md) | SDL3 desktop platform |
| [F3](changelog/F3.md) | Input events and frame state |
| [F4](changelog/F4.md) | Actions, bindings, and deterministic replay |
| [F5](changelog/F5.md) | World ownership and fixed systems |
| [F6](changelog/F6.md) | Native visual playground (0.6.0) |
| [F7](changelog/F7.md) | Native model and texture path (0.7.0) |
| [F8](changelog/F8.md) | BTAI editor integration (0.8.0) |
| [F9](changelog/F9.md) | Editor transform tools (0.9.0) |
| [F10](changelog/F10.md) | Physics: gravity, collision and a controllable character (0.10.0) |
| [F11](changelog/F11.md) | Native scene export (0.11.0) |
| [F12](changelog/F12.md) | Playable slice: platform path and goal (0.12.0) |
| [F13](changelog/F13.md) | Unified Box lighting and sustained flight (0.13.0) |
| [F14](changelog/F14.md) | Camera follow and combat basics (0.14.0) |
| [F15](changelog/F15.md) | HUD health bar (0.15.0) |
| [F16](changelog/F16.md) | Ranged "blast" ability (0.16.0) |
| [F17](changelog/F17.md) | Real physics in the browser editor (0.17.0) |
| [F18](changelog/F18.md) | Field Lab removed; the editor is the site (0.18.0) |
| [F19](changelog/F19.md) | Model catalog (0.19.0) |
| [F20](changelog/F20.md) | Animated models in the editor (0.20.0) |
| [F21](changelog/F21.md) | The bench joins the catalog it predates (0.21.0) |
| [F22](changelog/F22.md) | Player control: WASD, jump/flight, camera follow (0.22.0) |
| [F23](changelog/F23.md) | Collision: `Collider` obstacles block movement (0.23.0) |
| [F24](changelog/F24.md) | Combat: melee, ranged blast, and a Health HUD (0.24.0) |
| [F25](changelog/F25.md) | Movement feel: camera-relative WASD, facing, jump weight, vehicle driving (0.25.0) |
| [F26](changelog/F26.md) | Catalog-model `Scale` normalization (0.26.0) |
| [F27](changelog/F27.md) | Wiring up `AIState` and `Pedestrian` (0.27.0) |
| [F28](changelog/F28.md) | Scripting hook: embedded Lua `Script` component (0.28.0) |
| [F29](changelog/F29.md) | Prefabs: author once, place many, edit-propagates (0.29.0) |
| [F30](changelog/F30.md) | Audio: a Sound component and real Web Audio playback (0.30.0) |
| [F31](changelog/F31.md) | Real physics shapes: Collider spheres and raycasting (0.31.0) |
| [F32](changelog/F32.md) | Animation lighting fix, and Quaternius CC0 catalog additions (0.32.0) |
| [F33](changelog/F33.md) | AnimationState made real: per-model clip selection/preview (0.33.0) |
| [F34](changelog/F34.md) | Inspector cleanup: grouped components, inline animation clip picker (0.34.0) |
| [F35](changelog/F35.md) | Wiring up Vehicle.archetype and Pedestrian.archetype (0.35.0) |
| [F36](changelog/F36.md) | Smooth-shaded people kit (0.36.0) |
| [F37](changelog/F37.md) | People kit removal, clearing the way for an imported pack (0.37.0) |
| [F38](changelog/F38.md) | Mannequin F (Mixamo), a real rigged-and-animated import (0.38.0) |
| [F39](changelog/F39.md) | Lighting (Tier 2 roadmap item, 0.39.0) |
| [F40](changelog/F40.md) | Particles (Tier 2 roadmap item, 0.40.0) |
| [F41](changelog/F41.md) | Asset import, a reusable CLI (Tier 2 roadmap item, 0.41.0) |
| [F42](changelog/F42.md) | Export/packaging, a standalone player build (Tier 2 roadmap item, 0.42.0) |
| [F43](changelog/F43.md) | UI/menu system: authorable screen-space UI (Tier 3 roadmap item, 0.43.0) |
| [F44](changelog/F44.md) | Save/progress: a scriptable persistence API (Tier 3 roadmap item, 0.44.0) |
| [F45](changelog/F45.md) | Hostile AI attacks back (Tier 3, part of a "make this a real game" gap audit, 0.45.0) |
| [F46](changelog/F46.md) | Death sequence: a clip and a fade instead of instantly vanishing (Tier 3, gap audit item 2, 0.46.0) |
| [F47](changelog/F47.md) | A key→animation Lua API: `input.down`/`input.pressed` and `self.animate` (Tier 3, gap audit item 3, 0.47.0) |
| [F48](changelog/F48.md) | F/G play an animation natively, plus a crouch/sit key (0.48.0) |
| [F49](changelog/F49.md) | Merge Mannequin F (Mixamo) into Mannequin F via skeletal retarget (0.49.0) |
| [F50](changelog/F50.md) | Physics core: dynamic pairs, kinematic bodies, triggers, layers, bounciness, forces (0.50.0) |
| [F51](changelog/F51.md) | Lua API breadth: callbacks, world API, spawn, timers, props, sound and UI (0.51.0) |
| [F52](changelog/F52.md) | Rendering basics: shadows, Environment, Camera, Material (0.52.0) |
| [F53](changelog/F53.md) | Animator state machine: states, transitions, parameters, events (0.53.0) |
| [F54](changelog/F54.md) | Navigation (grid A* pathfinding) and a camera rig (0.54.0) |
| [F55](changelog/F55.md) | Input parity: every key, mouse, touch, gamepad and native actions in the browser (0.55.0) |
| [F56](changelog/F56.md) | UI expansion: panels, images, bars, sliders, toggles, script buttons, layout (0.56.0) |
| [F57](changelog/F57.md) | Particles: shapes, over-lifetime, world space, bursts, and trails (0.57.0) |
| [F58](changelog/F58.md) | Asset import and a Stats overlay (0.58.0) |
| [F59](changelog/F59.md) | Oriented box colliders, ramps and hit normals (0.59.0) |
| [F60](changelog/F60.md) | First-person character controller (0.60.0) |
| [F61](changelog/F61.md) | Weapons (0.61.0) |
| [F62](changelog/F62.md) | Combat AI (0.62.0) |
| [F63](changelog/F63.md) | Terrain (0.63.0) |
| [F64](changelog/F64.md) | Spatial audio, mixer and footsteps (0.64.0) |
| [F65](changelog/F65.md) | Post-processing (0.65.0) |
| [F66](changelog/F66.md) | Game-flow script APIs (0.66.0) |
| [F67](changelog/F67.md) | LAST SIGNAL: the FPS, and the engine fixes it drove (0.67.0) |
| [F68](changelog/F68.md) | Frame rate and first-person arms (0.68.0) |
| [F69](changelog/F69.md) | Characters hold their weapons, and interpolated motion (0.69.0) |
| [F70](changelog/F70.md) | Driving: arcade cars, AI drivers, ModelInstances, and HIGH HEAT (0.70.0) |
| [F71](changelog/F71.md) | Spaceflight: star systems, a flown ship, and the Pale Signal slice (0.71.0) |
| [F72](changelog/F72.md) | Pale Signal slice 2: walking anywhere, the scanner, seas and clouds, and the Kestrel (0.72.0) |
| [F73](changelog/F73.md) | The whole Pale Signal expedition, the Games library, and CC0 ship and sci-fi models (0.73.0) |
| [F74](changelog/F74.md) | Turning worlds, craters and lava rifts, the landing radar, and the Talari (0.74.0) |
| [F75](changelog/F75.md) | 45–60 fps, and the last Pale Signal gaps (0.75.0) |
| [F76](changelog/F76.md) | Fewer draw calls, smarter autopilot, towns that use their buildings (0.76.0) |
| [F77](changelog/F77.md) | Easier to use and easier to work on (0.77.0) |
| [F78](changelog/F78.md) | Martial arts: the Melee component, motion-captured kicks, combat feel and AI fighters (0.78.0) |
