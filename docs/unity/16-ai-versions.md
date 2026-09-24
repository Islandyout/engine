# 16 — AI/ML features and Unity 6.x version history

## 1. Runtime ML: Sentis (`com.unity.ai.inference`)

- **Package name history**: the package was named Sentis, renamed **Inference Engine** at Unity 6.2 (August 2025), and changed back to the display name **Sentis** from package 2.4. The package ID stays `com.unity.ai.inference`. Source: [Sentis changelog](https://docs.unity3d.com/Packages/com.unity.ai.inference@2.6/changelog/CHANGELOG.html), [Unity Discussions](https://discussions.unity.com/t/did-inference-engine-package-revert-to-the-old-sentis-name/1695183).
- **What it does**: runs ONNX (and converted) neural networks on-device on the GPU (compute or pixel shaders) or CPU (Burst).
- **API**:
  - Loading and running: `ModelLoader.Load`, `Worker` (`Schedule`, `PeekOutput`), `Tensor<float>`/`Tensor<int>`.
  - Graph editing: the **Functional API** (edit graphs in C#).
  - Performance: quantization (float16, uint8), and async readback (`ReadbackAndCloneAsync`).
  - Texture conversion with `TextureConverter`.
- **Typical uses**: pose estimation, speech-to-text, object detection, style transfer, LLM-driven NPCs (small models), and neural upscaling.

```csharp
using Unity.InferenceEngine;   // namespace used since the 6.2 rename (was Unity.Sentis)
public class Classifier : MonoBehaviour {
    public ModelAsset modelAsset; Worker worker;
    void Start() => worker = new Worker(ModelLoader.Load(modelAsset), BackendType.GPUCompute);
    public async Awaitable<float[]> Run(Texture tex) {
        using var input = TextureConverter.ToTensor(tex, 224, 224, 3);
        worker.Schedule(input);
        using var output = await (worker.PeekOutput() as Tensor<float>).ReadbackAndCloneAsync();
        return output.DownloadToArray();
    }
    void OnDestroy() => worker.Dispose();
}
```

## 2. ML-Agents (`com.unity.ml-agents` + Python `mlagents`)

- **Agent API**:
  - `Agent` with `CollectObservations(VectorSensor)`, `OnActionReceived(ActionBuffers)`, `Heuristic`, `OnEpisodeBegin`, `AddReward`/`SetReward`, `EndEpisode`.
  - `BehaviorParameters` (observation and action spaces: continuous, discrete branches), `DecisionRequester`.
- **Sensors**: Ray Perception Sensor 2D/3D, Camera Sensor, Render Texture Sensor, Grid Sensor, Buffer Sensor (variable entities), and Match-3 sensors.
- **Trainers**: PPO, SAC, POCA (multi-agent cooperative), self-play, curriculum learning, curiosity/RND intrinsic rewards, GAIL, and Behavioral Cloning (demonstration recording).
- **Deployment**: trained `.onnx` models run in-game through Sentis.
- **Source**: [Unity-Technologies/ml-agents](https://github.com/Unity-Technologies/ml-agents).

## 3. Unity AI (Editor, 6.2+)

These replaced Muse and Sentis services ([Unity 6.2 manual](https://docs.unity3d.com/6000.3/Documentation/Manual/WhatsNewUnity62.html), [CG Channel](https://www.cgchannel.com/2025/08/unity-rolls-out-unity-ai-in-unity-6-2/)).

- **Assistant**: a contextual in-editor chat. It answers project questions, generates code, and runs agentic editor actions (batch rename, place objects). It replaces Muse Chat.
- **Generators**: generate sprites, textures, materials (PBR), animations, and sounds.
- **Behavior** package: LLM-assisted behavior graph nodes (see 11).

## 4. Version history — Unity 6.x

| Version | Release type | Headline features |
|---|---|---|
| **6.0** (6000.0 LTS, Oct 2024) | LTS | **GPU Resident Drawer**, **GPU occlusion culling**, **STP** upscaling, **Adaptive Probe Volumes** (scenario blending, sky occlusion, disk streaming), **URP Render Graph**, Build Profiles, Multiplayer Center, Multiplayer Play Mode, Awaitable, Audio Random Container, WebGPU (experimental), UI Toolkit runtime data binding, VFX Graph URP improvements, HDRP water/clouds improvements |
| **6.1** (Apr 2025) | Supported update | Deferred+ (URP), Facebook Instant Games web builds, USS variables in UI Builder, Mask64Field, VRS API, Android XR support, improved Build Profiles |
| **6.2** (Aug 2025) | Supported update | **Unity AI** (Assistant, Generators, Inference Engine), mobile-browser optimized web runtime, **Mesh LOD**, world-space UI Toolkit, lighting and graphics profiling updates, Shader Graph/VFX Graph updates |
| **6.3 LTS** (Dec 2025) | LTS | **Box2D v3** + low-level 2D physics API (`Unity.U2D.Physics`), 3D renderers inside 2D URP scenes, **Platform Toolkit** (accounts, saves, achievements), HTTP/2 default for UnityWebRequest, **Adaptive Performance built into the Editor** |
| **6.4** (Mar 2026) | Supported update | **ECS as core packages integrated into the Editor**, **Project Auditor built in**, Adaptive Performance Basic provider on PS4/PS5/Xbox Series, Grid and Snap shortcut improvements |
| **6.5** (2026) | Supported update | Custom 2D lighting/shadow APIs, sprite BlendShape (cage deformation) API, 2D physics core work, Shader Graph HLSL function reflection, Expression and Switch nodes |
| **6.6** (Sep 2026) | Supported update | **WebGPU production-ready** (WebGL 2 fallback), **native Dictionary serialization**, **Content Directories**, **Build Analysis window**, scene-only Enter Play Mode default (CoreCLR prep) |
| **6.7** (beta, Sep 2026) | Beta | **Experimental CoreCLR player**, source code reference 6000.7.0b1 |
| **6.8** (planned) | — | Removal of Mono → CoreCLR (.NET 10 BCL, C# 14, modern GC) |

Sources:
- [New in Unity 6.3](https://docs.unity3d.com/6000.4/Documentation/Manual/WhatsNewUnity63.html)
- [New in Unity 6.4](https://docs.unity3d.com/6000.4/Documentation/Manual/WhatsNewUnity64.html)
- [Unity 6.3 LTS blog](https://unity.com/blog/unity-6-3-lts-is-now-available)
- [Unity 6.4 on Unity Discussions](https://discussions.unity.com/t/unity-6-4-is-now-available/1713245)
- [CG Channel on 6.4](https://www.cgchannel.com/2026/03/unity-releases-unity-6-4-and-unity-studio/)
- [AlternativeTo on 6.3](https://alternativeto.net/news/2025/12/unity-6-3-lts-arrives-with-hybrid-2d-3d-scenes-box2d-v3-and-cross-platform-toolkit)
- [AlternativeTo on 6.6](https://alternativeto.net/news/2026/9/unity-6-6-adds-webgpu-build-analysis-and-coreclr-prep/)
- [Unity 6.5 overview (dev.to)](https://dev.to/oceanviewgames/unity-65-is-here-should-your-studio-upgrade-1hef)
- [Path to CoreCLR 2026](https://discussions.unity.com/t/path-to-coreclr-2026-upgrade-guide/1714279)
- [New in Unity 6.1](https://docs.unity3d.com/6000.1/Documentation/Manual/WhatsNewUnity61.html)
- [New in Unity 6.2](https://docs.unity3d.com/6000.2/Documentation/Manual/WhatsNewUnity62.html)
- [Unity 6 features announcement](https://unity.com/blog/unity-6-features-announcement)
- [What's new in URP 17](https://docs.unity3d.com/6000.0/Documentation/Manual/urp/whats-new/urp-whats-new.html)

Some 6.1 entries (Deferred+, VRS, Android XR) and exact release months were not confirmed by the searches above. Check them against the release notes before relying on them.
