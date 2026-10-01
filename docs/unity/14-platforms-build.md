# 14 — Platforms, build, content delivery, XR

Manual: <https://docs.unity3d.com/Manual/PlatformSpecific.html> · Addressables: <https://docs.unity3d.com/Packages/com.unity.addressables@2.3/manual/index.html>

## 1. Supported platforms (Unity 6.x)

- **Desktop**: Windows (x64, Arm64), macOS (Intel, Apple silicon, universal), Linux (x64). Also **Dedicated Server** builds (headless, with asset and code stripping) and UWP.
- **Mobile**:
  - **Android**: Gradle, AAB/APK, Arm64/ARMv7/x86-64, Android GameActivity, Vulkan/GLES, Android App Bundle asset packs (Play Asset Delivery), and Android JNI (the AndroidJNI module).
  - **iOS/iPadOS**: Xcode project export and Metal.
  - **tvOS**.
- **Web**:
  - WebGL 2, and **WebGPU**, which is production-ready in 6.6 with an automatic WebGL 2 fallback.
  - Uses Emscripten/WASM, compression (Brotli, Gzip), decompression fallback, multithreading (6.x wasm threads), the mobile-browser optimized runtime (6.2), and Facebook Instant Games (6.1).
- **XR**: Meta Quest, Apple **visionOS** (with PolySpatial), Android XR, Magic Leap, PICO, HoloLens (legacy), and OpenXR PC VR.
- **Consoles** (licensed): PlayStation 4/5, Xbox One / Series X|S (GameCore), Nintendo Switch / Switch 2.
- **Other**: Embedded Linux, QNX, and Unity Cloud Rendering / Linux Headless Simulation (these appear in the `RuntimePlatform` enum).

`RuntimePlatform` includes: OSXEditor, OSXPlayer, WindowsPlayer, WindowsEditor, IPhonePlayer, Android, LinuxPlayer, LinuxEditor, WebGLPlayer, WSAPlayerX86/X64/ARM, PS4, PS5, XboxOne, tvOS, Switch, GameCoreXboxSeries, GameCoreXboxOne, EmbeddedLinuxArm64/Arm32/X64/X86, QNXArm32/Arm64/X64/X86, VisionOS, Switch2, KeplerArm64/X64, LinuxServer, WindowsServer, OSXServer, and more (older entries remain for compatibility).

## 2. Player settings (per platform)

- **Identity**: company name, product name, version, bundle identifier, build number / version code, default icon and cursor.
- **Resolution and presentation**:
  - `FullScreenMode`: ExclusiveFullScreen, FullScreenWindow, MaximizedWindow, Windowed.
  - Default resolution, resizable window, visible in background, allow fullscreen switch, run in background, supported aspect ratios, orientation, and render outside the safe area.
- **Splash screen**: Unity logo (Pro can disable it), logos list, animation, background, and draw mode.
- **Rendering and graphics**:
  - Color space, auto graphics API or an ordered API list per platform, multithreaded rendering, **graphics jobs** (`GraphicsJobMode` Native, Legacy, Split), static/dynamic batching, GPU skinning (CPU, GPU, GPU Batched), texture compression formats, lightmap encoding (Low, Normal, High quality), HDR cubemap encoding, and lightmap streaming.
  - Shader precision model, virtual texturing, 360 stereo capture, and load/store action debug mode.
- **Configuration**:
  - Scripting backend (Mono, IL2CPP; CoreCLR later), API compatibility level, IL2CPP code generation, C++ compiler configuration, incremental GC, and allow unsafe code.
  - Active input handling, scripting define symbols, additional compiler arguments, suppress common warnings, assembly version validation, and target architectures.
- **Optimization and logging**:
  - Managed stripping level, Strip Engine Code, prebake collision meshes, preloaded assets, vertex compression, optimize mesh data, and texture mipmap stripping.
  - Stack trace logging per `LogType` (None, ScriptOnly, Full).
- **Publishing**: keystores and signing, minify, custom Gradle templates, iOS entitlements, and capabilities.
- **Build pipeline hooks**: `IPreprocessBuildWithReport`, `IPostprocessBuildWithReport`, `IProcessSceneWithReport`, `IPreprocessShaders`, `IPreprocessComputeShaders`, `IFilterBuildAssemblies`, `IUnityLinkerProcessor`, and `PostProcessBuildAttribute`.

```csharp
// Command-line build (illustrative): Unity -batchmode -quit -projectPath . -executeMethod Builder.BuildWin
using UnityEditor; using UnityEditor.Build.Reporting;
public static class Builder {
    public static void BuildWin() {
        var r = BuildPipeline.BuildPlayer(new BuildPlayerOptions {
            scenes = new[] { "Assets/Scenes/Main.unity" }, locationPathName = "Builds/Win/Game.exe",
            target = BuildTarget.StandaloneWindows64, options = BuildOptions.CompressWithLz4HC });
        if (r.summary.result != BuildResult.Succeeded) throw new System.Exception("Build failed");
    }
}
```

## 3. Content: AssetBundles, Addressables, Content Directories

- **AssetBundles** (the AssetBundle module):
  - `BuildPipeline.BuildAssetBundles` (LZMA, LZ4, uncompressed, with a manifest and dependencies), variants, and `AssetBundle.LoadFromFile(Async)`/`LoadFromMemory`/`LoadFromStream`.
  - `LoadAsset(Async)`, `Unload(bool)`, and `UnityWebRequestAssetBundle` with caching (`Caching`).
- **Scriptable Build Pipeline** (`com.unity.scriptablebuildpipeline`): incremental, customizable bundle builds.
- **Addressables** (`com.unity.addressables`):
  - Addressable assets are addressed by key, label or `AssetReference` (plus typed `AssetReferenceT<T>` and `AssetReferenceSprite`).
  - **Groups** with schemas: build and load paths (local or remote), bundle mode (pack together, separately, by label), compression, CRC, and caching.
  - **Profiles** (paths per environment) and **play mode scripts** (Use Asset Database, Simulate Groups, Use Existing Build).
  - **Content update** builds (catalog diff, check for content update restriction) and a remote catalog.
  - Loading APIs: `Addressables.LoadAssetAsync<T>`, `LoadAssetsAsync` (labels), `InstantiateAsync`, `LoadSceneAsync`, `Release`/`ReleaseInstance`, `DownloadDependenciesAsync`, `GetDownloadSizeAsync`, `ClearDependencyCacheAsync`.
  - Tooling: `AsyncOperationHandle`, **Event Viewer / Profiler module**, the **Analyze** tool (duplicate dependencies), **Build Layout** report, and CCD integration.
- **Content Directories and content loading** (6.6; ContentLoad and ContentBuild modules): Content Files, Content Manifests and `ContentLoadManager` for loading local content without bundles. **Native Dictionary serialization** also arrived in 6.6.

```csharp
// Addressables load + instantiate + release (illustrative)
using UnityEngine; using UnityEngine.AddressableAssets; using UnityEngine.ResourceManagement.AsyncOperations;
public class SpawnFromAddressables : MonoBehaviour {
    public AssetReferenceGameObject enemyRef;
    async void Start() {
        AsyncOperationHandle<GameObject> h = enemyRef.InstantiateAsync(Vector3.zero, Quaternion.identity);
        var enemy = await h.Task;
        Destroy(enemy, 5f);                       // or Addressables.ReleaseInstance(enemy)
    }
}
```

## 4. XR (VR/AR/MR)

- **Architecture**: XR Plug-in Management with providers **OpenXR** (interaction profiles, features: hand tracking, eye gaze, foveation, passthrough, composition layers), Oculus/Meta, Apple visionOS, ARCore, ARKit, and Android XR.
- **Subsystems** (the Subsystems module): `XRDisplaySubsystem`, `XRInputSubsystem`, `XRMeshSubsystem`, plus AR subsystems.
- **XR Interaction Toolkit** (`com.unity.xr.interaction.toolkit` 3.x):
  - Interaction Manager.
  - Interactors: Near-Far, Poke, Ray, Direct, Gaze, Socket.
  - Interactables: Grab (with transformers), Simple, Teleportation Area/Anchor.
  - Locomotion: continuous move and turn, snap turn, teleport, climb, tunneling vignette.
  - Also UI (Tracked Device Graphic Raycaster), Input Readers, and the XR Device Simulator.
- **AR Foundation** (`com.unity.xr.arfoundation` 6.x):
  - Session and XR Origin.
  - Managers: plane detection, point clouds, raycasts, anchors, image tracking, object tracking, face tracking, body tracking, meshing, environment probes, occlusion (depth, human segmentation), light estimation, camera frames, participants (collaboration), bounding boxes.
  - Simulation environments in the editor.
- **Other XR packages**: XR Hands, XR Composition Layers, **PolySpatial** (visionOS shared space and volumes), **Meta XR SDK**, the MR Template, and Unity **Sentis** for on-device ML.
- **Rendering for XR**: Single Pass Instanced / Multiview, foveated rendering (`XRDisplaySubsystem.foveatedRenderingLevel`), Application SpaceWarp (Quest), and late latching.
