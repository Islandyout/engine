# 15 — Profiling, debugging, testing

Manual: <https://docs.unity3d.com/Manual/Profiler.html>

## 1. Profiler (Window/Analysis/Profiler)

- **Targets**: Play Mode, Edit Mode, a connected player (Development Build + Autoconnect Profiler; USB/IP/Android ADB), or a standalone profiler process.
- **Modules**:

| Module | Shows |
|---|---|
| CPU Usage | Timeline, Hierarchy, Raw Hierarchy, Inverted views; main/render/job/loading threads; GC.Alloc; call stacks; Deep Profiling |
| GPU Usage | GPU time per pass (supported APIs) |
| Rendering | Batches, SetPass calls, triangles, vertices, draw calls, shadow casters, visible skinned meshes |
| Memory | Total/Managed/Graphics/Audio/Video/Other; object counts |
| Audio | Playing sources, voices, DSP CPU, streaming |
| Video | Video players, frames, memory |
| Physics / Physics 2D | Active bodies, contacts, broadphase, queries, per-step timings |
| UI / UI Details | Canvas batches, layout and render rebuilds, markers |
| Realtime GI | Enlighten CPU cost |
| Virtual Texturing | Requests and tiles |
| Network Messages / Operations | (legacy) and NGO Network Profiler module |
| File Access | File reads, seek counts |
| Asset Loading | Load operations, bundles, scenes |
| Highlights | CPU/GPU frame-budget highlights |
| Jobs (6.x Jobs Profiler) | Job scheduling and dependencies |
| Entities (DOTS) | Structural changes, memory |
| Custom modules | `ProfilerModule` + `ProfilerCounter` + Profiler Module Editor |

- **Scripting API**:
  - Samples: `Profiler.BeginSample`/`EndSample`, `ProfilerMarker` (`.Auto()`, Burst-compatible), `ProfilerCounter<T>`/`ProfilerCounterValue<T>`, `ProfilerRecorder` (read built-in counters at runtime, such as "Main Thread" and "GC Reserved Memory").
  - Capture: `Profiler.enabled`, `logFile`, `enableBinaryLog`, and `FrameTimingManager` (CPU/GPU frame times in builds).
- **Profile Analyzer** (package): compares captures and computes marker statistics.
- **Memory Profiler** (package): snapshots with Summary, Unity Objects, All Of Memory, and diffs between two snapshots. Snapshots are taken with `MemoryProfiler.TakeSnapshot`.
- **System Metrics Mali** and platform tools: Xcode Instruments, Android GPU Inspector, PIX, Razor, RenderDoc, and Superluminal.

```csharp
using Unity.Profiling;
static readonly ProfilerMarker k_Pathfind = new("AI.Pathfind");
void Tick() { using (k_Pathfind.Auto()) { /* work */ } }

// Runtime read of built-in counters
ProfilerRecorder gcAlloc = ProfilerRecorder.StartNew(ProfilerCategory.Memory, "GC Allocated In Frame");
```

## 2. Other debuggers and analyzers

- **Frame Debugger**: steps through each draw call, event and pass. It shows shader, keywords, properties, render target, blend/depth/stencil state, and batch-break reasons ("why this draw call can't be batched with the previous one"). It can attach to a remote player.
- **Rendering Debugger** (SRP; Window/Analysis/Rendering Debugger, or Ctrl+Backspace in a player):
  - Material views (albedo, normal, smoothness, validation), lighting views (diffuse only, specular only, shadow cascades), rendering views (overdraw, wireframe, mip map), and volume inspection.
  - Display stats, probe volume debug, and GPU Resident Drawer occlusion heatmaps.
  - Custom panels via `DebugManager`.
- **Physics Debugger**, **UI Toolkit Debugger**, **IMGUI Debugger**, **Input Debugger**, **Entities windows**, **Addressables Event Viewer**, **Timeline/PlayableGraph visualizer**, and the **Animator** live state view.
- **Project Auditor** (built in from 6.4): static analysis of code (API misuse, allocations, hot paths), assets (textures, meshes, audio settings), project settings, shader variants, and build reports. Rules can be customized.
- **Build Analysis** window (6.6) and the Build Report Inspector.
- **Console and logs**: Editor.log and Player.log paths, `-logFile`, `Debug.unityLogger`, and stack trace settings.
- **Script debugging**: attach Visual Studio/Rider/VS Code to the editor or player (the Code Optimization toggle switches between Debug and Release in the status bar), plus breakpoints and conditional/data breakpoints.
- **Crash handling**: CrashReporting and Cloud Diagnostics.
- **Adaptive Performance** (a built-in module from 6.3): thermal and bottleneck feedback with scalers (LOD, resolution, frame rate, shadows) for Samsung, Android, iOS, desktop and consoles (6.4 providers).
- **Device Simulator**, **Unity Remote**, and **Multiplayer Play Mode** for testing.

## 3. Unity Test Framework (`com.unity.test-framework`, NUnit 3)

- **Test modes**:
  - **Edit Mode** tests run in the editor (`[Test]`).
  - **Play Mode** tests run in Play Mode or on a player, with `[UnityTest]` returning `IEnumerator` and yielding frames.
- **Attributes and assertions**: `[UnitySetUp]`, `[UnityTearDown]`, `[UnityPlatform]`, `[RequiresPlayMode]`, `[PrebuildSetup]`/`[PostBuildCleanup]`, `LogAssert.Expect`/`NoUnexpectedReceived`, `Assert.That(..., Is.EqualTo(...))`, and `[Timeout]`.
- **Running tests**: from the Test Runner window, the command line (`-runTests -testPlatform PlayMode -testResults results.xml`), or `TestRunnerApi` (programmatic). Test assemblies need an `.asmdef` with `UNITY_INCLUDE_TESTS` + `nunit.framework.dll`.
- **Related packages**: **Performance Testing** (`Measure.Method`, `Measure.Frames`, sample groups), **Code Coverage**, **Input System `InputTestFixture`**, **UI Test Framework** (UI Toolkit test helpers, 6.x), and **Automated QA** (deprecated).

```csharp
using System.Collections; using NUnit.Framework; using UnityEngine; using UnityEngine.TestTools;
public class HealthTests {
    [Test] public void DamageReducesHealth() { var h = new Health(100); h.Damage(30); Assert.That(h.Current, Is.EqualTo(70)); }
    [UnityTest] public IEnumerator RigidbodyFalls() {
        var go = new GameObject("ball", typeof(SphereCollider), typeof(Rigidbody));
        float y0 = go.transform.position.y;
        yield return new WaitForSeconds(0.5f);
        Assert.Less(go.transform.position.y, y0);
        Object.Destroy(go);
    }
}
```
