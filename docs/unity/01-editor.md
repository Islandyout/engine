# 01 — Editor and workflow

Manual: <https://docs.unity3d.com/Manual/UsingTheEditor.html>

## 1. Main windows

The paths below are the real `[MenuItem]` paths from the 6000.7 source.

| Window | Menu path | What it does |
|---|---|---|
| Scene | Window/General/Scene | 3D/2D authoring viewport with gizmos, handles, overlays and draw modes |
| Game | Window/General/Game | Renders the game cameras. Has an aspect/resolution dropdown, scale slider, Play Focused/Maximized/Unfocused modes, Stats overlay, Gizmos toggle, VSync and Low-Resolution Aspect Ratios |
| Hierarchy | Window/General/Hierarchy | Scene tree with multi-scene support. Toggles for visibility (eye) and pickability (hand), prefab coloring, search/filter, and a new column-based `HierarchyView` in 6.x |
| Project | Window/General/Project | Asset browser with one- or two-column layout, favorites, search by type/label/name (`t:Material l:Env`) and Packages folder |
| Inspector | Window/General/Inspector | Component/asset property editor with Normal/Debug modes, lock, multi-object editing, Presets, prefab override indicators and Add Component search |
| Console | Window/General/Console | Logs, warnings and errors with collapse, clear on play/build/recompile, stack-trace logging level, and double-click to jump to source |
| Device Simulator | Window/General/Device Simulator | Mobile device screens with safe area, notch, orientation and `SystemInfo` spoofing |
| Progress | Window/General/Progress | Background task progress through the `Progress` API |
| Undo History | Window/General/Undo History | Browsable undo stack |
| Animation | Window/Animation/Animation | Keyframe/curve editor with a dopesheet (see 06) |
| Animator | Window/Animation/Animator | State machine graph editor |
| Audio Mixer | Window/Audio/Audio Mixer | Mixer groups, snapshots and effects |
| Audio Random Container | Window/Audio/Audio Random Container | Randomized audio playlists (6.0+) |
| Lighting | Window/Rendering/Lighting | Lighting settings asset, environment, baked lightmaps, APV (Adaptive Probe Volumes), realtime GI |
| Light Explorer | Window/Rendering/Light Explorer | Table editor for every light, probe and emissive material in the scene |
| Occlusion Culling | Window/Rendering/Occlusion Culling | Umbra occlusion bake and visualization |
| Profiler | Window/Analysis/Profiler | CPU/GPU/memory/rendering/audio/physics/UI profiling (see 15) |
| Frame Debugger | Window/Analysis/Frame Debugger | Step through the draw calls of one frame |
| Physics Debugger | Window/Analysis/Physics Debugger | Visualizes colliders, contacts and queries |
| Import Activity | Window/Analysis/Import Activity | Why and when each asset was reimported |
| Build Analysis | Window/Analysis/Build Analysis | Build size, steps, dependencies and failures (6.6) |
| UI Toolkit Debugger | Window/Analysis/UI Toolkit Debugger | Live visual tree, styles and layout |
| IMGUI Debugger | Window/Analysis/IMGUI Debugger | IMGUI draw-call inspection |
| Performance Markers | Window/Analysis/Performance Markers | Editor performance markers |
| Package Manager | Window/Package Management/Package Manager | Install packages from the registry, Git URLs, disk or tarballs, plus samples and signatures |
| Asset Store / My Assets | Window/Package Management/... | Asset Store purchases |
| Services | Window/Package Management/Services | Unity Gaming Services packages |
| Multiplayer Center | Window/Multiplayer/Multiplayer Center | Guided multiplayer setup (6.0+) |
| Search | Window/Search/New Window (Ctrl+K) | Unified search over assets, scene, menus, settings, packages and the Asset Store, with a query language and indexes |
| Font Asset Creator | Window/Text/Font Asset Creator | Builds SDF font atlases |
| Localization Tables | Window/Localization/Resource Tables | String and asset tables |
| Accessibility Hierarchy Viewer | Window/Accessibility/Hierarchy Viewer | Screen-reader node tree |
| Timeline | Window/Sequencing/Timeline | Timeline editor (package) |
| Shader Graph / VFX Graph | double-click the asset | Node editors (see 03, 04) |
| Rendering Debugger | Window/Analysis/Rendering Debugger | SRP debug views (see 15) |
| Project Auditor | Window/Analysis/Project Auditor | Static analysis of code, assets and settings (built in from 6.4) |

## 2. Scene view

- **Tools** (the Tools overlay):
  - Tools and shortcuts: View/Hand (Q), Move (W), Rotate (E), Scale (R), Rect (T), Transform (Y), plus custom `EditorTool`s and component tools (for example collider editing and ProBuilder).
  - Tool handle options: pivot vs center, global vs local.
- **Snapping** (the GridAndSnap module):
  - Grid snapping, increment snapping (Ctrl drag), vertex snapping (V) and surface snapping (Ctrl+Shift).
  - The grid can be shown per axis, with configurable size and opacity.
  - Align Selection to Grid.
- **Navigation**:
  - Flythrough (RMB + WASD/QE, Shift to accelerate).
  - Orbit (Alt+LMB), pan (MMB), zoom (scroll or Alt+RMB).
  - Frame Selected (F), lock framing (Shift+F).
  - Scene Gizmo: axis cone clicks snap the view, and a center click toggles Perspective/Isometric (orthographic).
  - Camera overlay: FOV, dynamic clipping, occlusion culling, camera easing, acceleration and speed.
- **Draw modes**:
  - Shading modes: Shaded, Wireframe, Shaded Wireframe.
  - Miscellaneous: Shadow Cascades, Render Paths, Alpha Channel, Overdraw, Mipmaps, Texture Streaming, Sprite Mask, UV Charts, Contributors/Receivers, Baked Lightmap, Realtime GI views, Albedo/Emissive validation, Light Overlap, Lighting/Probe visualization.
  - SRPs add their own debug views.
- **Scene view toggles**: 2D mode, lighting, audio, effects (Skybox, Fog, Flares, Always Refresh, Post Processing, Particle Systems, Visual Effect Graphs), scene visibility and picking, grid, gizmos.
- **Gizmos menu**: per-component icon and gizmo toggles, 3D icons and icon size, selection outline and selection wire. Scripts draw their own gizmos with `OnDrawGizmos`/`OnDrawGizmosSelected` and the `Gizmos.*` API, or with the `[DrawGizmo]` attribute.
- **Handles API** (`UnityEditor.Handles`): PositionHandle, RotationHandle, ScaleHandle, FreeMoveHandle, Slider, Slider2D, Disc, RadiusHandle, ArcHandle, BoxBoundsHandle, CapsuleBoundsHandle, SphereBoundsHandle, JointAngularLimitHandle, Label, DrawLine/DrawWireDisc/DrawBezier/DrawAAPolyLine, Button, and cap functions (Cube, Sphere, Cone, Arrow, Circle, Rectangle, Dot).
- **Overlays**:
  - Built-in overlays: Tools, Tool Settings, Grid and Snap, View Options, Orientation, Search, Cameras, Component Tools, Light Placement.
  - Every overlay can dock, float and collapse, and layouts can be saved as Overlay Presets.
  - Custom overlays derive from `Overlay` or `ToolbarOverlay` and are registered with `[Overlay]`.
- **Scene view camera preview**: a Cameras overlay previews any camera and lets you control it in first person.
- **Context menus**: right-click actions, **Isolation View** (Shift+H), **Scene Visibility**, and **Pick** cycling (click repeatedly to cycle overlapped objects).

```csharp
// Custom gizmo drawn in the Scene view (illustrative)
using UnityEngine;
public class PatrolPath : MonoBehaviour {
    public Vector3[] points;
    void OnDrawGizmosSelected() {
        Gizmos.color = Color.cyan;
        for (int i = 0; i + 1 < points.Length; i++)
            Gizmos.DrawLine(transform.TransformPoint(points[i]), transform.TransformPoint(points[i + 1]));
        foreach (var p in points) Gizmos.DrawWireSphere(transform.TransformPoint(p), 0.2f);
    }
}
```

```csharp
// Custom EditorTool + Overlay (illustrative, Editor folder)
using UnityEditor; using UnityEditor.EditorTools; using UnityEditor.Overlays; using UnityEngine; using UnityEngine.UIElements;
[EditorTool("Platform Tool", typeof(Transform))]
class PlatformTool : EditorTool {
    public override void OnToolGUI(EditorWindow window) {
        var t = (Transform)target;
        EditorGUI.BeginChangeCheck();
        var p = Handles.PositionHandle(t.position, Quaternion.identity);
        if (EditorGUI.EndChangeCheck()) { Undo.RecordObject(t, "Move"); t.position = p; }
    }
}
[Overlay(typeof(SceneView), "My Overlay")]
class MyOverlay : Overlay { public override VisualElement CreatePanelContent() => new Label("Hello"); }
```

## 3. Play Mode

- Play (Ctrl+P), Pause (Ctrl+Shift+P) and Step (Ctrl+Alt+P).
- **Play Mode tint** colors the Editor while playing, set in Preferences > Colors.
- Changes made during Play Mode are lost when you exit. Exceptions:
  - Copy a component's values and use Paste Component Values.
  - Cinemachine "Save during Play".
- **Enter Play Mode Options** (Project Settings > Editor):
  - Choices: Reload Domain and Scene, Reload Scene only, Reload Domain only, Do not reload.
  - Skipping domain reload means static fields are not reset. Reset them manually with `[RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]`.
  - From **6.6, new projects default to "scene-only" reload** to prepare for CoreCLR.
- **Multiplayer Play Mode** (UMPE module, package `com.unity.multiplayer.playmode`): up to 4 virtual players, each an extra editor process, with tags and scenarios.
- `EditorApplication.playModeStateChanged` fires with the states `ExitingEditMode`, `EnteredPlayMode`, `ExitingPlayMode` and `EnteredEditMode`.

## 4. GameObjects, prefabs and scenes (authoring side)

- **GameObject menu (built-in creation items)**:
  - Create Empty, Create Empty Child, Create Empty Parent.
  - 3D Object: Cube, Sphere, Capsule, Cylinder, Plane, Quad, Ragdoll…, Terrain, Tree, Wind Zone, Legacy/TextMesh.
  - Light: Directional, Point, Spot, Area, Light Probe Group, Reflection Probe.
  - Audio: Audio Source, Audio Reverb Zone.
  - Video: Video Player.
  - Visual Effects: Particle System, Particle System Force Field, Line, Trail.
  - UI Toolkit: Panel Renderer, Panel Input Configuration, UI Document.
  - Camera.
  - Utilities: Align With View, Align View to Selected, Move To View, Toggle Active State, Set as first/last sibling.
- **Prefabs**:
  - Prefab Assets can be *nested* (prefabs inside prefabs) and have *variants* (inheritance with overrides).
  - Overrides are property modifications, added/removed components and added/removed GameObjects.
  - Overrides dropdown: Apply/Revert per property, per component or all.
  - **Prefab Mode** edits a prefab in isolation or in context, with auto-save.
  - Unpack / Unpack Completely.
  - `PrefabUtility` API: SaveAsPrefabAsset, InstantiatePrefab, ApplyPrefabInstance, GetPrefabInstanceStatus, and more.
  - Prefab stage events.
- **Scene templates**: File > New Scene opens a template picker. Create templates with Assets/Create/Scene/Scene Template (From Scene). Templates can clone or reference dependencies.
- **Multi-scene editing**: several scenes open additively, one set active. Right-click a scene to set it active, unload it or remove it.
- **Presets** (`Preset` asset): save component or importer settings and apply them through the Preset Manager's default presets with filters (for example, every texture in `/UI/` uses a UI preset).
- **Selection history**: Edit > Previous/Next Selection. Also Select Children and Select Prefab Root.
- **Paste Special**: Paste as Child (Keep Local/World Transform).

## 5. Project Settings

Sections under Edit > Project Settings:

- **Adaptive Performance**: built in from 6.3.
- **Audio**: global volume, rolloff scale, Doppler factor, speaker mode, DSP buffer size, sample rate, max virtual/real voices, spatializer plugin, ambisonic decoder, disable audio.
- **Editor**:
  - Unity Remote, Asset Serialization Mode (Force Text), Default Behavior Mode (2D/3D), Sprite Packer mode.
  - C# project generation, line endings, Enter Play Mode options, Asset Pipeline options (parallel import, auto refresh).
  - Refresh import mode, Prefab mode default, Graphics/shader compilation (async shader compilation), Numbering Scheme.
- **Graphics**: render pipeline asset, tier settings (BiRP), always-included shaders, shader stripping, shader preloading and `GraphicsStateCollection`, lightmap/fog modes, per-pipeline settings.
- **Input Manager** (legacy) and **Input System Package**.
- **Package Manager**: scoped registries, pre-release packages.
- **Physics** (3D): gravity, default material, bounce threshold, default max depenetration velocity, sleep threshold, contact offset, solver iterations, simulation mode, auto-sync transforms, reuse collision callbacks, Layer Collision Matrix, broadphase type, world bounds, friction type, contact pairs mode, improved patch friction, enhanced determinism, solver type (PGS/TGS), GPU physics toggles.
- **Physics 2D**: gravity, default material, velocity/position iterations, thresholds, simulation mode, multithreading, layer matrix, gizmo colors, and the Box2D v3 low-level world settings.
- **Player**: per-platform company/product name, icons, splash screen, resolution and presentation, other settings (color space, graphics APIs, scripting backend, API compatibility level, managed stripping level, IL2CPP code generation, incremental GC, active input handling), publishing settings, XR.
- **Preset Manager**, **Quality** (per-level: pixel light count, texture quality/mipmap limits, anisotropic, AA, soft particles, realtime reflection probes, billboards face camera, resolution scaling, shadows, LOD bias, max LOD level, particle raycast budget, async upload, VSync count, streaming mipmaps, terrain overrides, render pipeline asset override).
- **Scene Template**, **Script Execution Order**, **Services**, **Shader Graph**, **Tags and Layers** (tags, 32 layers, sorting layers, rendering layers), **TextMesh Pro**, **Time** (fixed timestep 0.02 s default, maximum allowed timestep 0.333…, time scale, maximum particle timestep), **Timeline**, **UI Toolkit**, **Version Control**, **Visual Effect Graph**, **XR Plug-in Management**.

## 6. Preferences

Preferences cover: General (auto-refresh, busy progress delay, compile on play, script changes while playing, editor theme, Enable Code Coverage), 2D, Analysis, Asset Pipeline, Colors, Diagnostics, External Tools (script editor, image app, revision control diff tool, Android SDK/NDK/JDK), GI Cache, Scene View, Search, Timeline, UI Scaling, Shortcuts (Shortcut Manager with contexts, profiles and conflicts).

## 7. Asset pipeline

- **AssetDatabase v2**:
  - Content-hash-based artifacts stored in `Library/Artifacts`.
  - Deterministic imports and parallel imports (textures, models and more).
  - Dependencies tracked per importer.
  - Cache Server / **Unity Accelerator** (AcceleratorClient module) shares artifacts across a team.
- Every asset has a `.meta` file that holds its GUID and importer settings. Fileids reference sub-assets.
- **Special folders**:
  - `Assets/`.
  - `Editor/` (editor-only assemblies).
  - `Resources/` (loadable by path with `Resources.Load`).
  - `StreamingAssets/` (copied verbatim).
  - `Plugins/`, `Gizmos/`, `Editor Default Resources/`, `Standard Assets/`.
  - Hidden folders: names starting with `.` or ending with `~`.
- **ScriptedImporter** (`[ScriptedImporter(1, "ext")]`) adds custom file formats. `AssetPostprocessor` hooks: OnPreprocessTexture, OnPostprocessModel, OnPostprocessAllAssets, OnPreprocessAudio, OnPostprocessMaterial, OnPostprocessAnimation, OnPostprocessGameObjectWithUserProperties, and more.
- **Supported import formats**:
  - Models: FBX, OBJ, DAE, DXF, 3DS, glTF (via package), SketchUp (.skp), SpeedTree (.st, .spm), Blender/Max/Maya through FBX export.
  - Textures: PNG, JPG, TGA, PSD, TIFF, EXR, HDR, BMP, GIF, PICT, IFF, DDS, KTX.
  - Audio: WAV, MP3, OGG, AIFF, FLAC, and tracker formats (.xm, .mod, .it, .s3m).
  - Video: MP4 (H.264/H.265), MOV, WebM (VP8), AVI, and more.
  - Fonts: TTF, OTF.
  - Other: Unity packages (.unitypackage), PSB (2D PSD Importer).
- **Version control**: Unity Version Control (Plastic SCM) integration, Perforce, Smart Merge (UnityYAMLMerge).

```csharp
// ScriptedImporter for a custom ".cube" LUT or data format (illustrative, Editor folder)
using UnityEditor.AssetImporters; using UnityEngine;
[ScriptedImporter(1, "leveldata")]
public class LevelDataImporter : ScriptedImporter {
    public override void OnImportAsset(AssetImportContext ctx) {
        var text = System.IO.File.ReadAllText(ctx.assetPath);
        var asset = new TextAsset(text);
        ctx.AddObjectToAsset("main", asset);
        ctx.SetMainObject(asset);
    }
}
```

## 8. Packages

- **Manifest**: `Packages/manifest.json` lists dependencies. `packages-lock.json` locks resolved versions.
- **Package sources**: Unity registry, scoped registries, Git URL (with `?path=` and `#tag`), local folder, local tarball, embedded packages.
- **Package layout**: `package.json`, `Runtime/`, `Editor/`, `Tests/`, `Samples~/`, `Documentation~/`.
- **Package states** in 6.x: Released, Pre-release, Experimental, Deprecated. Packages carry signatures, and verified package sets ship per Editor version.
- **Feature Sets** bundle packages: 2D, 3D Characters and Animation, 3D World Building, AR, Cinematic Studio, Engineering, Gameplay and Storytelling, Mobile, VR, Worldbuilding.

## 9. Editor extensibility (scripting the editor)

- **Base classes and hooks**:
  - `EditorWindow` (`GetWindow<T>()`, `CreateGUI` for UI Toolkit, `OnGUI` for IMGUI).
  - `Editor` (custom inspector: `[CustomEditor(typeof(T))]`, `CreateInspectorGUI`/`OnInspectorGUI`, `OnSceneGUI`).
  - `PropertyDrawer` (`[CustomPropertyDrawer]`), `DecoratorDrawer`.
  - `ScriptableWizard`, `SettingsProvider`, `ScriptableSingleton<T>`.
  - `MenuItem`, `ContextMenu`/`ContextMenuItem`, `[InitializeOnLoad]`, `[InitializeOnLoadMethod]`, `[DidReloadScripts]`.
  - `EditorApplication.update`/`delayCall`/`hierarchyWindowItemOnGUI`/`projectWindowItemOnGUI`.
- **Editor APIs**:
  - `Undo`: RecordObject, RegisterCreatedObjectUndo, DestroyObjectImmediate, CollapseUndoOperations, groups.
  - `SerializedObject`/`SerializedProperty` (supports multi-edit and prefab overrides).
  - `EditorUtility`: SetDirty, DisplayDialog, DisplayProgressBar.
  - `EditorPrefs`, `SessionState`.
  - `AssetDatabase` (CreateAsset, LoadAssetAtPath, FindAssets, StartAssetEditing/StopAssetEditing).
  - `BuildPipeline`, `EditorSceneManager`.
  - `Selection`.
  - `SceneView.duringSceneGui`.
  - `EditorGUILayout`/`EditorGUI` (IMGUI) and `UnityEditor.UIElements` fields (PropertyField, InspectorElement, ObjectField, CurveField, GradientField, LayerField, TagField, EnumFlagsField, ToolbarMenu, etc.).
- **Graph tooling**: GraphView (legacy) and the Graph Toolkit (`GraphToolkitEditor` module, 6.x) for custom node editors.
- **Search API**: `SearchProvider`, `[SearchItemProvider]`, `SearchService`.
- **Shortcut API**: `[Shortcut("id", KeyCode.X, ShortcutModifiers.Alt)]`, `[ClutchShortcut]`.

```csharp
// Custom inspector with UI Toolkit (illustrative)
using UnityEditor; using UnityEditor.UIElements; using UnityEngine.UIElements;
[CustomEditor(typeof(Enemy))]
public class EnemyEditor : Editor {
    public override VisualElement CreateInspectorGUI() {
        var root = new VisualElement();
        InspectorElement.FillDefaultInspector(root, serializedObject, this);
        root.Add(new Button(() => ((Enemy)target).Respawn()) { text = "Respawn" });
        return root;
    }
}
```

## 10. Build Profiles (6.0+)

File > Build Profiles replaces the Build Settings window.

- **Platform profiles**: Windows/Mac/Linux, Dedicated Server, Android, iOS, tvOS, visionOS, Web, UWP, consoles, Embedded Linux, QNX, Meta Quest, Facebook Instant Games (6.1).
- **Custom build profiles** each hold their own scene list, scripting defines, Player Settings overrides, and Graphics/Quality overrides.
- `BuildPipeline.BuildPlayer(BuildPlayerWithProfileOptions)`.
- **Build options**: Development Build, Autoconnect Profiler, Deep Profiling, Script Debugging, Wait for Managed Debugger, Compression (LZ4/LZ4HC), Asset Import Overrides (max texture size, compression), Clean Build, Scripts-only build, Patch And Run.
- **Build Report** (`BuildReport`, `PackedAssets`) and the **Build Analysis** window (6.6).

## 11. Other editor features

- **Safe Mode**: opens a project that has compile errors without importing assets.
- **Code editors**: Visual Studio, VS Code and Rider integrations, and the `CodeEditor` API.
- **Unity Remote**: tests on a device from the editor.
- **RenderDoc integration**: load RenderDoc, then capture from the Scene or Game view.
- **Editor Coroutines** (package).
- **Recorder** (package): records movies, image sequences, animation clips and GIFs from Play Mode.
- **FBX Exporter** (package): round-trips to Maya/Max. **USD** and **glTFast** packages. **SketchUp** importer (module).
- **Cloud Diagnostics**, **Crash Reporting** and **Performance Reporting** modules.
- **Accessibility**: `AccessibilityHierarchy`/`AccessibilityNode`, screen reader support on iOS/Android/Windows/macOS (6.x).
- **Unity Hub**: installs editor versions and modules, creates projects from templates (Universal 3D, High Definition 3D, 2D, VR, AR, Mobile, Multiplayer and sample templates).
