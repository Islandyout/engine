# Unity engine feature reference

Every Unity system, feature and mechanic, down to enum values and API members, with sources, reference images and code. Written as a reference for this engine's own feature planning.

Current to **Unity 6.7 beta** (September 2026). The API detail comes from Unity's official C# reference source at `6000.7.0b1`.

## Files

| # | File | Covers |
|---|------|--------|
| 01 | [Editor and workflow](01-editor.md) | Windows, Scene view tools, gizmos, overlays, Play Mode, prefabs, packages, settings, search, build profiles |
| 02 | [Core scripting](02-scripting.md) | GameObject/Component model, MonoBehaviour lifecycle and every message, serialization, attributes, coroutines/Awaitable, ScriptableObject, scenes, math, scripting backends |
| 03 | [Rendering and graphics](03-rendering.md) | Built-in/URP/HDRP/SRP, cameras, lights, shadows, GI, materials, shaders, Shader Graph nodes, textures, meshes, LOD, culling, batching, post-processing, upscalers, ray tracing, HDRP environment (sky, clouds, fog, water) |
| 04 | [Visual effects](04-vfx.md) | Particle System (all 23 modules), VFX Graph (contexts, blocks, operators), Line/Trail renderers, decals, lens flares |
| 05 | [Physics](05-physics.md) | 3D (PhysX), 2D (Box2D v3), rigidbodies, colliders, joints, articulations, character controller, queries, cloth, wheels, DOTS physics |
| 06 | [Animation](06-animation.md) | Clips, Animation window, Animator/Mecanim, state machines, blend trees, layers, IK, humanoid retargeting, root motion, Timeline, Playables, Animation Rigging, constraints |
| 07 | [Audio and video](07-audio-video.md) | AudioSource/Listener, import, Audio Mixer, effects, Audio Random Container, spatializer, VideoPlayer |
| 08 | [UI and text](08-ui.md) | UI Toolkit (UXML/USS/controls/binding), uGUI, IMGUI, TextMeshPro/TextCore |
| 09 | [Input](09-input.md) | Input System package, legacy Input Manager, touch, devices, rebinding |
| 10 | [2D](10-2d.md) | Sprites, atlases, Tilemap, Sprite Shape, 2D lights, 2D animation, Pixel Perfect, sorting |
| 11 | [World building, AI, cameras](11-world.md) | Terrain, trees, wind, AI Navigation, ProBuilder, Splines, Cinemachine |
| 12 | [DOTS, jobs and Burst](12-dots.md) | Entities (ECS), baking, systems, C# Job System, Burst, Collections, Mathematics, Entities Graphics |
| 13 | [Networking and services](13-networking-services.md) | Netcode for GameObjects/Entities, Transport, Multiplayer Services, UGS, Localization, IAP, Analytics |
| 14 | [Platforms, build and content](14-platforms-build.md) | Platforms, Player settings, IL2CPP/Mono/CoreCLR, stripping, AssetBundles, Addressables, XR/AR, Web |
| 15 | [Profiling, debugging, testing](15-profiling-testing.md) | Profiler and all modules, Memory Profiler, Frame Debugger, Rendering/Physics debuggers, Project Auditor, Test Framework |
| 16 | [AI/ML and version history](16-ai-versions.md) | Sentis/Inference Engine, ML-Agents, Unity AI; what shipped in each Unity 6.x release |

## Sources and method

This environment's network proxy blocks `docs.unity3d.com`, `docs.unity.com` and `unity.com`, so the Unity Manual pages were not fetched directly. The content was built from:

1. **Unity's official C# reference source.** [Unity-Technologies/UnityCsReference](https://github.com/Unity-Technologies/UnityCsReference) at commit `830e212` ("Unity 6000.7.0b1 C# reference source code"). Its 166 engine modules, the component class hierarchy, every enum value quoted in these files, the `[MenuItem]` editor menus and the MonoBehaviour message list were extracted from this source by script.
2. **Unity's official package repos**, including their `Documentation~` markdown and screenshots:
   - [Graphics](https://github.com/Unity-Technologies/Graphics) (URP, HDRP, SRP Core, Shader Graph, VFX Graph, Post Processing) @ `a7e4c05`
   - [InputSystem](https://github.com/Unity-Technologies/InputSystem) @ `c61cc67`
   - [com.unity.cinemachine](https://github.com/Unity-Technologies/com.unity.cinemachine) @ `69b2051`
   - [com.unity.probuilder](https://github.com/Unity-Technologies/com.unity.probuilder) @ `f6ecdd9`
   - [EntityComponentSystemSamples](https://github.com/Unity-Technologies/EntityComponentSystemSamples) @ `6786a74`
   - [com.unity.netcode.gameobjects](https://github.com/Unity-Technologies/com.unity.netcode.gameobjects) @ `297c8b0`
3. **Web search** for Unity 6.0–6.7 release notes. The URLs are cited in [16-ai-versions.md](16-ai-versions.md).
4. **Unity Manual and Scripting API links.** These use Unity's stable URL scheme (`https://docs.unity3d.com/Manual/<Page>.html`, `https://docs.unity3d.com/ScriptReference/<Type>.html`). They are included for further reading and were not fetched from this environment.

**Images** are hotlinked from Unity's own documentation folders on GitHub and pinned to the commits above, so they stay stable. Every image URL was checked for an HTTP 200 response when these files were written.

**Code snippets** fall into two groups:
- Snippets labelled *"verbatim from …"* are copied from Unity's repos.
- All other snippets are short illustrative examples written against the 6000.x API.

## Engine module map (from `UnityCsReference/Modules`)

This is the complete module list in Unity 6.7. Each module is a separately strippable engine component:

AI, AIEditor, AMD, AcceleratorClient, Accessibility, AdaptivePerformance, AndroidJNI, Animation, AnimationWindow, AssetBundle, AssetDatabase, AssetPackageEditor, AssetPipelineEditor, Audio, AudioEditor, BuildAnalysis, BuildProfileEditor, BuildReportingEditor, Burst, Cloth, CloudServicesSettingsEditor, ClusterInput, ClusterRenderer, ContentBuild, ContentLoad, CrashReporting, DSPGraph, DeviceSimulatorEditor, DiagnosticsEditor, Director, EditorToolbar, EmbreeEditor, GameCenter, GenericRemoteEditor, GraphToolkitEditor, GraphViewEditor, Grid, GridAndSnap, Hierarchy, HierarchyCore, IMGUI, Identifiers, ImageConversion, Input, InputForUI, InputLegacy, Insights, JSONSerialize, JobsProfilerEditor, Licensing, Lighting, Localization, LocalizationRuntime, ManagedKernel, Marshalling, Mathematics, MediaEditor, MeshLODGenerator, MetalFX, Multiplayer, NVIDIA, NetworkProfilerEditor, PackageManager, PackageManagerUI, ParticleSystem, PerformanceReporting, Physics, Physics2D, PhysicsCore2D, PlayModeEditor, PresetsEditor, ProfilerEditor, Progress, ProjectAuditorEditor, Properties, QuickInstall, QuickSearch, RenderAs2D, SafeMode, SceneTemplateEditor, SceneView, ScreenCapture, Scripting, ShaderApiReflectionEditor, ShaderBuildSettingsEditor, ShaderLabParserEditor, ShortcutManagerEditor, SketchUpEditor, SmartStrings, SpriteMask, SpriteShape, Streaming, StyleSheetsEditor, Subsystems, Terrain, TerrainPhysics, TextCoreFontEngine, TextCoreTextEngine, TextRendering, Tilemap, TimelineFoundation, TreeEditor, U2DRuntime, UI, UIAutomationEditor, UIBuilder, UIElements, UMPE, UnityAnalytics, UnityConnect, UnityConsent, UnityCurl, UnityWebRequest (+AssetBundle/Audio/Texture/WWW), VFX, VectorGraphics, Vehicles, Video, VirtualTexturing, Wind, XR (plus matching `*Editor` modules).

## Built-in component class hierarchy (from source)

```
Object
└─ Component
   ├─ Transform (RectTransform)
   ├─ MeshFilter, LODGroup, OcclusionArea, OcclusionPortal, Tree, WindZone, TextMesh, Cloth, CanvasRenderer, ParticleSystem
   ├─ Rigidbody, Rigidbody2D
   ├─ Collider ── BoxCollider, SphereCollider, CapsuleCollider, MeshCollider, TerrainCollider, WheelCollider, CharacterController
   ├─ Joint ───── HingeJoint, FixedJoint, SpringJoint, CharacterJoint, ConfigurableJoint
   ├─ Renderer ── MeshRenderer, SkinnedMeshRenderer, SpriteRenderer, LineRenderer, TrailRenderer, BillboardRenderer,
   │              ParticleSystemRenderer, TilemapRenderer, SpriteShapeRenderer, SpriteMask, VFXRenderer, UIRenderer, PanelRenderer
   └─ Behaviour
      ├─ MonoBehaviour (all user scripts; also UIDocument, PanelInputConfiguration, Light2D, Localize*Event)
      ├─ Camera, Light, Skybox, FlareLayer, LensFlare, Projector, ReflectionProbe, LightProbeGroup, LightProbeProxyVolume
      ├─ Animator, Animation, PlayableDirector
      ├─ AimConstraint, LookAtConstraint, ParentConstraint, PositionConstraint, RotationConstraint, ScaleConstraint
      ├─ AudioSource, AudioListener, AudioReverbZone, Audio{Chorus,Distortion,Echo,HighPass,LowPass,Reverb}Filter
      ├─ NavMeshAgent, NavMeshObstacle, OffMeshLink
      ├─ Canvas, CanvasGroup, SortingGroup
      ├─ Terrain, VideoPlayer, VisualEffect, ParticleSystemForceField, StreamingController, ConstantForce, ArticulationBody
      ├─ GridLayout ── Grid, Tilemap
      ├─ Collider2D ── Box/Circle/Capsule/Polygon/Edge/Composite/Custom/TilemapCollider2D
      ├─ Joint2D ───── Distance/Fixed/Friction/Hinge/Slider/Spring/Wheel (Anchored), Relative, Target Joint2D
      ├─ Effector2D ── Area, Buoyancy, Platform, Point, Surface Effector2D
      └─ PhysicsUpdateBehaviour2D ── ConstantForce2D
```
