# 03 — Rendering and graphics

Manual: <https://docs.unity3d.com/Manual/Graphics.html> · URP: <https://docs.unity3d.com/Manual/urp/urp-introduction.html> · HDRP: <https://docs.unity3d.com/Packages/com.unity.render-pipelines.high-definition@17.0/manual/index.html>

Image base used below (Graphics repo @ `a7e4c05`): `https://raw.githubusercontent.com/Unity-Technologies/Graphics/a7e4c051d256a781ab362c64316b125a1e104694/`

## 1. Render pipelines

| | Built-in RP (BiRP) | Universal RP (URP) | High Definition RP (HDRP) |
|---|---|---|---|
| Status | Legacy, deprecated in 6.x | Default for new projects; all platforms | High-end PC/console (DX11/12, Vulkan, Metal, compute required) |
| Paths | Forward, Deferred, Legacy Vertex Lit | Forward, **Forward+** (clustered, unlimited lights per object), Deferred, **Deferred+** (6.1) | Forward and Deferred (per camera through Frame Settings) |
| Extensibility | CommandBuffers on camera events | Renderer Features + ScriptableRenderPass with **Render Graph** | Custom Passes, Custom Post-Process, Frame Settings |
| Lighting units | Arbitrary intensity | Arbitrary (Physical Camera optional) | Physical light units (lux, lumen, candela, EV100, nits) |

- **Scriptable Render Pipeline (SRP) Core**:
  - `RenderPipelineAsset` → `RenderPipeline.Render(ScriptableRenderContext, List<Camera>)`.
  - `CommandBuffer`, `CullingResults` (from `ScriptableCullingParameters`), `RendererList`, `DrawingSettings`/`FilteringSettings`/`SortingSettings`, `ShaderTagId`.
  - The **Render Graph** system (automatic resource lifetime, pass culling and merging, native render passes on tile GPUs), the `RTHandle` system, the Volume framework, the Rendering Debugger, Look Dev, Light Anchor, Free Camera, Camera Switcher, Render Requests, and the **Unified Ray Tracing API** (hardware RT or compute fallback).
- **Render Pipeline Converter** migrates projects from BiRP to URP or HDRP (materials, post-processing, lighting).

```csharp
// Minimal custom SRP (illustrative)
using UnityEngine; using UnityEngine.Rendering;
[CreateAssetMenu(menuName = "Rendering/My Pipeline")]
public class MyPipelineAsset : RenderPipelineAsset<MyPipeline> {
    protected override RenderPipeline CreatePipeline() => new MyPipeline();
}
public class MyPipeline : RenderPipeline {
    static readonly ShaderTagId Unlit = new("SRPDefaultUnlit");
    protected override void Render(ScriptableRenderContext ctx, System.Collections.Generic.List<Camera> cams) {
        foreach (var cam in cams) {
            ctx.SetupCameraProperties(cam);
            if (!cam.TryGetCullingParameters(out var cp)) continue;
            var cull = ctx.Cull(ref cp);
            var cmd = new CommandBuffer { name = cam.name };
            cmd.ClearRenderTarget(true, true, cam.backgroundColor); ctx.ExecuteCommandBuffer(cmd); cmd.Release();
            var rl = ctx.CreateRendererList(new UnityEngine.Rendering.RendererUtils.RendererListDesc(Unlit, cull, cam)
                { renderQueueRange = RenderQueueRange.opaque, sortingCriteria = SortingCriteria.CommonOpaque });
            var cb = new CommandBuffer(); cb.DrawRendererList(rl); ctx.ExecuteCommandBuffer(cb); cb.Release();
            ctx.DrawSkybox(cam);
            ctx.Submit();
        }
    }
}
```

**URP Renderer Feature using Render Graph.** Verbatim from `Graphics/Packages/com.unity.render-pipelines.universal/Samples~/URPRenderGraphSamples/Blit/CopyRenderFeature.cs`, with comments stripped:

```csharp
public class CopyRenderFeature : ScriptableRendererFeature
{
    class CopyRenderPass : ScriptableRenderPass
    {
        public CopyRenderPass() { requiresIntermediateTexture = true; }
        public override void RecordRenderGraph(RenderGraph renderGraph, ContextContainer frameData)
        {
            UniversalResourceData resourceData = frameData.Get<UniversalResourceData>();
            var source = resourceData.activeColorTexture;
            var destinationDesc = renderGraph.GetTextureDesc(source);
            destinationDesc.name = $"CameraColor-{passName}";
            destinationDesc.clearBuffer = false;
            TextureHandle destination = renderGraph.CreateTexture(destinationDesc);
            if (RenderGraphUtils.CanAddCopyPassMSAA())
            {
                renderGraph.AddCopyPass(resourceData.activeColorTexture, destination, passName: "Copy Active Color Texture to Temp Texture");
                renderGraph.AddCopyPass(destination, resourceData.activeColorTexture, passName: "Copy Temp Texture to Active Color Texture");
            }
            else Debug.Log("Can't add the copy pass due to MSAA");
        }
    }
    CopyRenderPass m_CopyRenderPass;
    public override void Create()
    {
        m_CopyRenderPass = new CopyRenderPass();
        m_CopyRenderPass.renderPassEvent = RenderPassEvent.AfterRenderingOpaques;
    }
    public override void AddRenderPasses(ScriptableRenderer renderer, ref RenderingData renderingData)
        => renderer.EnqueuePass(m_CopyRenderPass);
}
```

The other official URP Render Graph samples in that folder are: BlitWithFrameData, BlitWithMaterial, Compute, ComputeShaderScreenInOut, Culling, FramebufferFetch, GbufferVisualization, GlobalGbuffers, MRT, OutputTexture, RendererList, TextureReferenceWithFrameData and UnsafePass.

- **URP-specific features**:
  - The Universal Renderer and the 2D Renderer. **Camera stacking** (Base + Overlay cameras).
  - Renderer Features: Render Objects, Screen Space Ambient Occlusion, Decal, Screen Space Shadows, Full Screen Pass, and custom features.
  - Rendering Layers, Light Cookies, Reflection Probe blending and box projection, and **Adaptive Probe Volumes**.
  - LOD Cross-fade, Motion Vectors, **STP** upscaling, FSR 1, and **Deferred+**.
  - SRP Batcher, **GPU Resident Drawer**, GPU occlusion culling, Native RenderPass, and **On-Tile post-processing** (mobile, 6.x).
  - URP Asset settings: Depth/Opaque texture, HDR, MSAA, render scale, upscaling filter, Main/Additional Light settings, Shadows (cascades 1–4, distance, depth/normal bias, soft shadow quality), Post-processing grading mode (LDR/HDR), LUT size, Volume update mode.

## 2. Cameras

`Camera` properties and features:

- **Clear flags and background**: `clearFlags` (Skybox, SolidColor, Depth, Nothing), `backgroundColor`, `cullingMask`.
- **Projection**: Perspective (`fieldOfView`) or Orthographic (`orthographicSize`); `nearClipPlane`/`farClipPlane`.
- **Viewport and depth**: viewport `rect`, `depth` (render order), `targetTexture` (RenderTexture), `targetDisplay` (multi-display up to 8).
- **Physical Camera**: focal length, sensor size, lens shift, **Gate Fit** (Vertical, Horizontal, Fill, Overscan, None), ISO, shutter speed, aperture, blade count, curvature, barrel clipping, anamorphism.
- **Rendering options**: `useOcclusionCulling`, `allowHDR`, `allowMSAA`, `allowDynamicResolution`, `depthTextureMode` (Depth, DepthNormals, MotionVectors), `opaqueSortMode`, `transparencySortMode` (Default, Perspective, Orthographic, CustomAxis), `layerCullDistances`, `layerCullSpherical`, `eventMask`, `stereoTargetEye`, `cameraType`.
- **Conversion methods**: `ScreenToWorldPoint`, `WorldToScreenPoint`, `ScreenPointToRay`, `ViewportToWorldPoint`, `WorldToViewportPoint`, `CalculateFrustumCorners`, `projectionMatrix`/`worldToCameraMatrix`/`cullingMatrix` overrides, `RenderToCubemap`, `Render()`, `SubmitRenderRequest`.
- **Scripting**: `Camera.main` (cached in 6.x), `Camera.allCameras`, `onPreCull`/`onPreRender`/`onPostRender`.
- **Pipeline camera data**:
  - URP `UniversalAdditionalCameraData`: render type (Base/Overlay), stack, post-processing toggle, antialiasing (None, FXAA, SMAA, TAA), stop NaNs, dithering, render shadows, depth/opaque texture overrides, volume mask/trigger, renderer index.
  - HDRP `HDAdditionalCameraData`: Frame Settings overrides, custom render, anti-aliasing (FXAA, TAA, SMAA), exposure target, fullscreen passthrough.

## 3. Lights

![HDRP light types](https://raw.githubusercontent.com/Unity-Technologies/Graphics/a7e4c051d256a781ab362c64316b125a1e104694/Packages/com.unity.render-pipelines.high-definition/Documentation~/Images/HDRPFeatures-LightTypes.png)

- **Light types** (`LightType` enum from source): Directional, Point, Spot, Area (legacy name for Rectangle), Rectangle, Disc, and in HDRP Pyramid, Box and Tube.
  - BiRP/URP area lights are baked-only. HDRP area lights are realtime.
- **Modes** (`LightmapBakeType`): Realtime, Baked, Mixed. Mixed lighting modes (`MixedLightingMode`): Baked Indirect (IndirectOnly), **Shadowmask** (Shadowmask or Distance Shadowmask via QualitySettings.shadowmaskMode), and **Subtractive**.
- **Light properties**: color, `colorTemperature` + `useColorTemperature`, `intensity`, `bounceIntensity` (indirect multiplier), `range`, `spotAngle`/`innerSpotAngle`, cookie (2D or cube) and cookie size, flare, `renderMode` (Auto, ForcePixel = Important, ForceVertex = Not Important), `cullingMask`, `renderingLayerMask`, `shadows` (None, Hard, Soft), shadow strength/resolution/bias/normalBias/nearPlane, `lightShadowCasterMode`, `boundingSphereOverride`, `useBoundingSphereOverride`, `shadowCustomResolution`.
- **HDRP additions**:
  - Physical units: Lumen, Candela, Lux, Nits, EV100.
  - IES profiles, light layers, contact shadows, volumetrics multiplier and shadow dimmer, affects diffuse/specular, fade distance, shape (Cone, Pyramid, Box), barn doors, and the Light Anchor tool.
- **URP additions**: soft shadow quality per light, custom shadow layers, light cookies, and rendering layers.
- **Light Probes**: a `LightProbeGroup` is a spherical-harmonic (L2) probe grid. Renderers use them through `LightProbeUsage` (Off, BlendProbes, UseProxyVolume, CustomProvided). A **Light Probe Proxy Volume** gives large objects a 3D grid of probes.
- **Reflection Probes**:
  - `ReflectionProbeMode`: Baked, Realtime, Custom. `ReflectionProbeRefreshMode`: OnAwake, EveryFrame, ViaScripting. Time slicing (`ReflectionProbeTimeSlicingMode`): AllFacesAtOnce, IndividualFaces, NoTimeSlicing.
  - Other settings: box projection, blend distance, importance, resolution, HDR.
  - Renderer blending (`ReflectionProbeUsage`): Off, BlendProbes, BlendProbesAndSkybox, Simple.
  - HDRP also has **Planar Reflection Probes**.

## 4. Shadows

- **Shadow maps**:
  - Directional lights use **cascaded shadow maps** (1/2/4 cascades; HDRP allows 1–4 with per-cascade borders) and optional **shadow pancaking**.
  - Resolution: `LightShadowResolution` is FromQualitySettings, Low, Medium, High or VeryHigh. Quality Settings also control shadow distance and shadow projection (Close Fit/Stable Fit).
- **Renderer shadow settings** (`ShadowCastingMode`): Off, On, TwoSided, ShadowsOnly. Each renderer also has `receiveShadows`.
- **HDRP shadows**:
  - Filtering: PCF, PCSS, Very High quality.
  - **Contact Shadows** (screen-space ray march) and **Micro Shadows** (from normal and AO maps).
  - Shadow update modes: Every Frame, On Enable, On Demand. Cached shadow atlas with dynamic rescale.
  - Ray-traced shadows, shadow tint, penumbra tint, and staggered cascades.
- **URP**: Screen Space Shadows renderer feature, soft shadows (Low/Medium/High), and shadow caster culling.

![HDRP shadows](https://raw.githubusercontent.com/Unity-Technologies/Graphics/a7e4c051d256a781ab362c64316b125a1e104694/Packages/com.unity.render-pipelines.high-definition/Documentation~/Images/HDRPFeatures-Shadows.png)

## 5. Global illumination

- **Baked GI**: computed by the Progressive Lightmapper, with a CPU backend and a GPU backend (the GPU backend uses OpenCL or the Unified Ray Tracing backend in 6.x).
- **Lightmapping Settings asset**:
  - Lightmapper, Importance Sampling, direct/indirect/environment samples, bounces, filtering (Denoiser: OpenImageDenoise/Optix/Radeon Pro; Filter: Gaussian/A-Trous).
  - Lightmap resolution/padding/size, compression, Ambient Occlusion (max distance, direct/indirect contribution), **Directional Mode** (`LightmapsMode` NonDirectional or CombinedDirectional), albedo boost, indirect intensity, and the lightmap parameters asset.
- **Per-renderer GI settings**: Contribute GI, Receive GI from Lightmaps or Light Probes, Scale in Lightmap, Stitch Seams, lightmap UVs (Generate Lightmap UVs on import: hard angle, pack margin, angle/area error).
- **Enlighten Realtime GI**: precomputed realtime GI. Deprecated but still present in BiRP/HDRP.
- **Adaptive Probe Volumes (APV)** (URP and HDRP):
  - Automatic probe placement by geometry density (bricks), per-pixel probe sampling, and reduced leaking (validity, virtual offset, rendering-layer masks).
  - **Baking Sets** (multi-scene), **Lighting Scenarios** with runtime **blending**, **Sky Occlusion**, disk streaming, and Probe Adjustment Volumes.
- **Screen Space GI (SSGI)**: HDRP, plus URP in 6.x. **Ray-Traced GI** and **path tracing** are HDRP.
- **Environment lighting**: `AmbientMode` (Skybox, Trilight/Gradient, Flat/Color, Custom), default reflection (`DefaultReflectionMode` Skybox or Custom), reflection bounces, and the Sun source.
- **Lighting settings (scene)**: skybox material, sun source, fog (`FogMode` Linear, Exponential, ExponentialSquared, with color, density and start/end), halo, flares, and realtime shadow color (Subtractive mode).
- **Lightmap API**: `LightmapSettings.lightmaps` (`LightmapData` color/dir/shadowMask), `Lightmapping.Bake`/`BakeAsync`, `Lightmapping.lightingDataAsset`, and `LightingDataAsset` swapping.

![APV](https://raw.githubusercontent.com/Unity-Technologies/Graphics/a7e4c051d256a781ab362c64316b125a1e104694/Packages/com.unity.render-pipelines.high-definition/Documentation~/Images/HDRPFeatures-APV.png)
![SSGI on](https://raw.githubusercontent.com/Unity-Technologies/Graphics/a7e4c051d256a781ab362c64316b125a1e104694/Packages/com.unity.render-pipelines.high-definition/Documentation~/Images/SSGIon.png)

## 6. Materials and shaders

- **Material**:
  - Holds a `shader`, property values (`SetFloat`, `SetColor`, `SetTexture`, `SetVector`, `SetMatrix`, `SetBuffer`, `SetInt`/`SetInteger`, arrays), keywords (`EnableKeyword`, `LocalKeyword`, `SetKeyword`), `renderQueue`, `enableInstancing`, `doubleSidedGI`, and `globalIlluminationFlags` (RealtimeEmissive, BakedEmissive, EmissiveIsBlack).
  - **Material Variants**: inheritance from a parent material, with locked properties.
- **MaterialPropertyBlock** overrides per-renderer properties without new material instances.
- **`renderer.material` vs `sharedMaterial`**: accessing `material` instantiates a copy.
- **Built-in shaders (BiRP)**: Standard (Metallic), Standard (Specular setup), Autodesk Interactive, Unlit/*, Legacy/*, Particles/Standard Surface/Unlit, UI/Default, Sprites/Default, Skybox/6 Sided/Cubemap/Panoramic/Procedural, Nature/Terrain, Mobile/*.
- **Standard shader rendering modes**: Opaque, Cutout, Fade, Transparent.
- **URP shaders**: Lit, Simple Lit, Baked Lit, Unlit, Complex Lit (clear coat), Terrain Lit, Particles (Lit, Simple Lit, Unlit), Sprite-Lit/Unlit-Default, Decal, Autodesk Interactive, Speedtree.
  - Surface options: Workflow (Metallic/Specular), Surface Type (Opaque/Transparent), Blending Mode (Alpha, Premultiply, Additive, Multiply), Render Face, Alpha Clipping, Receive Shadows.
  - Surface inputs: Base Map, Metallic/Specular Map, Smoothness source, Normal, Height (parallax), Occlusion, Emission, Detail maps, tiling/offset.
- **HDRP shaders**:
  - Lit, Layered Lit (up to 4 layers), Lit Tessellation, Layered Lit Tessellation, **StackLit** (multi-lobe, coat, iridescence, dual specular), Unlit (with Shadow Matte), **Hair** (Marschner physically based, or approximate Kajiya-Kay), **Fabric** (Cotton/Wool and Silk), **Eye** (Eye and Eye Cinematic with Caustic), **AxF** (X-Rite measured materials), Decal, Terrain Lit (8 layers per draw), Fullscreen, Canvas, **Water**, Fog Volume, PBR Sky, and Six-Way (smoke lighting).
  - Material types: Standard, Subsurface Scattering (Diffusion Profiles), Anisotropy, Iridescence, Specular Color, Translucent.
  - Material features: displacement (vertex/pixel/tessellation), parallax occlusion mapping, geometric specular AA, alpha clipping, double-sided (flip/mirror/none normal mode), refraction models (Box/Sphere/Thin), transparent depth prepass/postpass, custom motion vectors, and **Compute Thickness**.

![HDRP Lit](https://raw.githubusercontent.com/Unity-Technologies/Graphics/a7e4c051d256a781ab362c64316b125a1e104694/Packages/com.unity.render-pipelines.high-definition/Documentation~/Images/HDRPFeatures-LitShader.png)
![HDRP StackLit](https://raw.githubusercontent.com/Unity-Technologies/Graphics/a7e4c051d256a781ab362c64316b125a1e104694/Packages/com.unity.render-pipelines.high-definition/Documentation~/Images/HDRPFeatures-StackLitShader.png)
![HDRP Hair](https://raw.githubusercontent.com/Unity-Technologies/Graphics/a7e4c051d256a781ab362c64316b125a1e104694/Packages/com.unity.render-pipelines.high-definition/Documentation~/Images/HDRPFeatures-HairShader.png)
![HDRP Eye](https://raw.githubusercontent.com/Unity-Technologies/Graphics/a7e4c051d256a781ab362c64316b125a1e104694/Packages/com.unity.render-pipelines.high-definition/Documentation~/Images/HDRPFeatures-EyeShader.png)

### ShaderLab and HLSL

- **ShaderLab structure**: `Shader "Name" { Properties {…} SubShader { Tags {…} LOD n Pass { Name, Tags, render state, HLSLPROGRAM … ENDHLSL } } Fallback "…" CustomEditor "…" }`.
- **Property types**: Float, Range(min,max), Int/Integer, Color, Vector, 2D, 3D, Cube, 2DArray, CubeArray.
- **Property attributes**: `[HDR]`, `[Gamma]`, `[NoScaleOffset]`, `[Normal]`, `[PerRendererData]`, `[MainTexture]`, `[MainColor]`, `[Toggle(KEY)]`, `[ToggleOff]`, `[KeywordEnum(A,B)]`, `[Enum(UnityEngine.Rendering.BlendMode)]`, `[PowerSlider(3)]`, `[IntRange]`, `[Space]`, `[Header]`.
- **Render state commands**: Cull (Back/Front/Off), ZWrite, ZTest (Less, LEqual, Equal, GEqual, Greater, NotEqual, Always), ZClip, Blend (per-RT, factors One/Zero/SrcAlpha/…), BlendOp, ColorMask, Offset, AlphaToMask, Conservative, Stencil (Ref, ReadMask, WriteMask, Comp, Pass, Fail, ZFail), and PackageRequirements.
- **Tags**:
  - SubShader tags: `RenderPipeline`, `Queue` (Background 1000, Geometry 2000, AlphaTest 2450, Transparent 3000, Overlay 4000), `RenderType`, `DisableBatching`, `ForceNoShadowCasting`, `IgnoreProjector`, `PreviewType`, `CanUseSpriteAtlas`.
  - Pass tags: `LightMode`. Values include UniversalForward, UniversalGBuffer, ShadowCaster, DepthOnly, DepthNormals, Meta, SRPDefaultUnlit, ForwardBase/ForwardAdd, Deferred, MotionVectors.
- **Keywords**:
  - Declared with `#pragma multi_compile`, `shader_feature`, their `_local`, `_vertex`/`_fragment` variants, and `dynamic_branch`.
  - Stripping: `IPreprocessShaders`. Warm-up: `ShaderVariantCollection` and `GraphicsStateCollection` (6.x PSO pre-warming).
- **Shader stages**: vertex, fragment, hull/domain (tessellation), geometry, compute (`ComputeShader` + `Dispatch`, `ComputeBuffer`/`GraphicsBuffer`), and ray tracing (`RayTracingShader`, `.raytrace`).
- **Surface Shaders**: BiRP only (`#pragma surface surf Standard`).
- **Built-in variables and functions**: `UNITY_MATRIX_MVP`, `_Time`, `_ScreenParams`, `_WorldSpaceCameraPos`, `unity_ObjectToWorld`, and the SRP Core `Common.hlsl`/`SpaceTransforms.hlsl`/URP `Core.hlsl` libraries.
- **Graphics APIs**: Direct3D 11/12, Vulkan, Metal, OpenGL Core, OpenGL ES 3.x, **WebGL 2** and **WebGPU** (production-ready in 6.6).

```hlsl
// Minimal URP unlit shader (illustrative)
Shader "Custom/URPUnlitTint" {
  Properties { _BaseMap("Base Map", 2D) = "white" {} [HDR]_BaseColor("Tint", Color) = (1,1,1,1) }
  SubShader {
    Tags { "RenderPipeline"="UniversalPipeline" "RenderType"="Opaque" "Queue"="Geometry" }
    Pass {
      Name "Forward" Tags { "LightMode"="UniversalForward" }
      HLSLPROGRAM
      #pragma vertex vert
      #pragma fragment frag
      #pragma multi_compile_instancing
      #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
      TEXTURE2D(_BaseMap); SAMPLER(sampler_BaseMap);
      CBUFFER_START(UnityPerMaterial) float4 _BaseMap_ST; half4 _BaseColor; CBUFFER_END   // SRP Batcher compatible
      struct Attributes { float4 positionOS:POSITION; float2 uv:TEXCOORD0; UNITY_VERTEX_INPUT_INSTANCE_ID };
      struct Varyings  { float4 positionCS:SV_POSITION; float2 uv:TEXCOORD0; };
      Varyings vert(Attributes i){ Varyings o; UNITY_SETUP_INSTANCE_ID(i);
        o.positionCS = TransformObjectToHClip(i.positionOS.xyz); o.uv = TRANSFORM_TEX(i.uv,_BaseMap); return o; }
      half4 frag(Varyings i):SV_Target { return SAMPLE_TEXTURE2D(_BaseMap, sampler_BaseMap, i.uv) * _BaseColor; }
      ENDHLSL
    }
  }
}
```

### Shader Graph

![Shader Graph window](https://raw.githubusercontent.com/Unity-Technologies/Graphics/a7e4c051d256a781ab362c64316b125a1e104694/Packages/com.unity.shadergraph/Documentation~/images/ShaderGraphWindow.png)
![Master Stack](https://raw.githubusercontent.com/Unity-Technologies/Graphics/a7e4c051d256a781ab362c64316b125a1e104694/Packages/com.unity.shadergraph/Documentation~/images/MasterStack_Populated.png)

- **Graph structure**: Master Stack (Vertex and Fragment contexts with Block nodes), Blackboard (properties, keywords, dropdowns, categories), Graph Inspector (Graph Settings, Node Settings), Main Preview, Sub Graphs, Sticky Notes, Redirect nodes, Groups, Color Modes, Precision Modes (Single/Half/Inherit), Preview Mode, Custom Interpolators, and a template browser (6.x).
- **Targets**: URP (Lit, Unlit, Sprite Lit/Unlit/Custom Lit, Decal, Fullscreen, Canvas/UI), HDRP (Lit, StackLit, Unlit, Hair, Fabric, Eye, Decal, Water, Fog Volume, PBR Sky, Six-Way, Fullscreen, Canvas, TerrainLit), Built-in, Custom Render Texture, VFX (Visual Effect target), and UI (UI Toolkit shaders, 6.x).
- **Custom code**: the Custom Function node (inline string or HLSL file). In 6.5+, HLSL functions are reflected into nodes automatically, and there are new **Expression** and **Switch** nodes.

**Complete node library** (from `com.unity.shadergraph/Documentation~/TableOfContents.md`):

| Category | Nodes |
|---|---|
| Artistic › Adjustment | Channel Mixer, Contrast, Hue, Invert Colors, Replace Color, Saturation, White Balance |
| Artistic › Blend/Filter/Mask | Blend; Dither, Fade Transition; Channel Mask, Color Mask |
| Artistic › Normal | Normal Blend, Normal From Height, Normal From Texture, Normal Reconstruct Z, Normal Strength, Normal Unpack |
| Artistic › Utility | Colorspace Conversion |
| Channel | Append, Combine, Flip, Split, Swizzle |
| Custom Render Texture | Self, Size, Slice Index / Cubemap Face |
| Input › Basic | Boolean, Color, Constant, Float, Integer, Slider, Time, Vector 2/3/4 |
| Input › Geometry | Bitangent Vector, Instance ID, Normal Vector, Position, Screen Position, Tangent Vector, UV, Vertex Color, Vertex ID, View Direction, View Vector |
| Input › Gradient | Blackbody, Gradient, Sample Gradient |
| Input › HDRP | Custom Color Buffer, Custom Depth Buffer, Diffusion Profile, Exposure, HD Sample Buffer, HD Scene Color, HD Scene Depth |
| Input › Lighting | Ambient, Baked GI, Main Light Direction, Reflection Probe |
| Input › Matrix | Matrix 2x2/3x3/4x4, Transformation Matrix |
| Input › Mesh Deformation | Compute Deformation, Linear Blend Skinning, Sprite Skinning |
| Input › PBR | Dielectric Specular, Metal Reflectance |
| Input › Scene | Camera, Eye Index, Fog, Object, Scene Color, Scene Depth, Scene Depth Difference, Screen |
| Input › Texture | Calculate Level Of Detail Texture 2D, Cubemap Asset, Gather Texture 2D, Sample Cubemap, Sample Reflected Cubemap, Sample Texture 2D, Sample Texture 2D Array, Sample Texture 2D LOD, Sample Texture 3D, Sample Virtual Texture, Sampler State, Split Texture Transform, Texture 2D/2D Array/3D Asset, Texture Size |
| Input › UI | Element Layout UV, Element Texture Size, Element Texture UV |
| Keyword | Material Quality, Raytracing Quality (+ user Boolean/Enum keywords) |
| Math › Basic | Add, Divide, Multiply, Power, Square Root, Subtract |
| Math › Advanced | Absolute, Exponential, Length, Log, Modulo, Negate, Normalize, Posterize, Reciprocal, Reciprocal Square Root |
| Math › Derivative | DDX, DDXY, DDY |
| Math › Interpolation | Inverse Lerp, Lerp, Smoothstep |
| Math › Matrix | Matrix Construction, Determinant, Split, Transpose |
| Math › Range | Clamp, Fraction, Maximum, Minimum, One Minus, Random Range, Remap, Saturate |
| Math › Round | Ceiling, Floor, Round, Sign, Step, Truncate |
| Math › Trigonometry | Arccosine, Arcsine, Arctangent, Arctangent2, Cosine, Degrees To Radians, Hyperbolic Cos/Sin/Tan, Radians To Degrees, Sine, Tangent |
| Math › Vector | Cross Product, Distance, Dot Product, Fresnel Effect, Projection, Reflection, Refract, Rejection, Rotate About Axis, Sphere Mask, Transform |
| Math › Wave | Noise Sine Wave, Sawtooth Wave, Square Wave, Triangle Wave |
| Math › HDRP | Fresnel Equation |
| Procedural | Checkerboard; Noise: Gradient Noise, Simple Noise, Voronoi; Shape: Ellipse, Polygon, Rectangle, Rounded Polygon, Rounded Rectangle |
| Terrain | Terrain Properties, Terrain Texture |
| UI | Default Bitmap Text, Default Gradient, Default SDF Text, Default Solid, Default Texture, Render Type, Render Type Branch, Sample Element Texture |
| Utility | Custom Function, Expression, Preview, Sub Graph, Dropdown, Property, Redirect, SpeedTree; HDRP Emission; Eye (CirclePupilAnimation, CorneaRefraction, IrisLimbalRing, IrisOffset, IrisOutOfBoundColorClamp, IrisUVLocation, ScleraIrisBlend, ScleraLimbalRing, ScleraUVLocation); Fabric ThreadMapDetail |
| Utility › Logic | All, And, Any, Branch, Branch On Input Connection, Comparison, Is Front Face, Is Infinite, Is NaN, Nand, Not, Or, Switch |
| UV | Flipbook, Parallax Mapping, Parallax Occlusion Mapping, Polar Coordinates, Radial Shear, Rotate, Spherize, Tiling And Offset, Triplanar, Twirl |

- **Shader Graph samples**: Procedural Patterns, Node Reference, Feature Examples, Production Ready Shaders (rock, water, weather, decal, detail, post-process), UGUI Shaders, Custom Material Property Drawers, **Custom Lighting** (URP lighting-model sub-graphs), and Terrain Shaders.

## 7. Textures

- **Texture types**: `Texture2D`, `Texture3D`, `Cubemap`, `Texture2DArray`, `CubemapArray`, `RenderTexture` (depth format, MSAA, random write/UAV, dimension, mipmaps, memoryless, `RenderTextureDescriptor`), `CustomRenderTexture` (shader-updated with double buffering), `WebCamTexture`, `SparseTexture`, and virtual texturing (streaming VT, experimental).
- **Import settings** (`TextureImporterType`): Default, Normal map, Editor GUI and Legacy GUI, Sprite (2D and UI), Cursor, Cookie, Lightmap, Directional Lightmap, Shadowmask, Single Channel.
  - Texture shape: 2D, Cube, 2D Array, 3D.
  - sRGB, Alpha Source/Is Transparency, Non-Power-of-2 (`TextureImporterNPOTScale` None, ToNearest, ToLarger, ToSmaller), Read/Write, Virtual Texture Only, Generate Mipmaps (Box/Kaiser filter, mip streaming, preserve coverage, fadeout), Ignore PNG Gamma, Swizzle.
  - Wrap Mode (`TextureWrapMode` Repeat, Clamp, Mirror, MirrorOnce, set per axis), Filter Mode (Point, Bilinear, Trilinear), Aniso Level 0–16.
  - Platform overrides: Max Size, Resize Algorithm, Format, Compression (None, Low, Normal, High quality), Crunch compression.
- **Formats** (`TextureFormat`, partial list from source): Alpha8, R8, R16, RG16, RGB24, RGBA32, ARGB32, RGB565, RGBA4444, RHalf/RGHalf/RGBAHalf, RFloat/RGFloat/RGBAFloat, RGB9e5Float, BC4/BC5/BC6H/BC7, DXT1/DXT5 (+Crunched), ETC_RGB4/ETC2_RGB/ETC2_RGBA1/ETC2_RGBA8 (+Crunched), EAC_R/RG, ASTC 4x4–12x12 and ASTC_HDR, PVRTC (deprecated), and YUY2. `GraphicsFormat` enumerates the full set of GPU formats.
- **Mipmap streaming**: a memory budget with `Texture.streamingTextureCount` and friends. **Texture mipmap limit groups** exist in 6.x.
- **Runtime APIs**: `SetPixels`/`SetPixels32`/`SetPixelData`/`GetPixelData` (NativeArray), `Apply`, `LoadImage`/`EncodeToPNG`/`EncodeToJPG`/`EncodeToEXR`/`EncodeToTGA` (ImageConversion module), `Graphics.Blit`, `Graphics.CopyTexture`, `AsyncGPUReadback.Request`, and `Texture2D.Compress`.

## 8. Meshes and geometry

- **`Mesh`**:
  - Simple API: `vertices`, `normals`, `tangents`, `uv`..`uv8`, `colors`/`colors32`, `triangles`/`SetIndices` (with `MeshTopology` Triangles, Quads, Lines, LineStrip, Points), submeshes (`subMeshCount`, `SetSubMesh`, `SubMeshDescriptor`), `bounds`, `RecalculateNormals`/`Tangents`/`Bounds`, `Optimize`, `MarkDynamic`, `indexFormat` (UInt16/UInt32).
  - Skinning data: `boneWeights`/`bindposes`/`BoneWeight1`.
  - **Blend shapes** (`AddBlendShapeFrame`).
  - Advanced API: `SetVertexBufferParams` with `VertexAttributeDescriptor`, and `MeshData` (`Mesh.AcquireReadOnlyMeshData`/`AllocateWritableMeshData` for jobs).
  - `CombineMeshes`, and `GetVertexBuffer`/`GetIndexBuffer` (GraphicsBuffer, for compute access).
  - **Mesh LOD** (6.2+; MeshLODGenerator module): automatic in-mesh LODs generated at import.
- **Model import** (`ModelImporter`):
  - Scale Factor, Convert Units, Bake Axis Conversion, Import BlendShapes/Deform Percent, Visibility, Cameras, Lights, Preserve Hierarchy, Sort Hierarchy By Name.
  - Mesh Compression (Off/Low/Medium/High), Read/Write, Optimize Mesh, Generate Colliders, Keep Quads, Weld Vertices, Index Format, Normals (Import/Calculate/None, smoothing angle, Normals Mode, Smoothness Source), Tangents (Import, Calculate Mikktspace, Calculate Legacy, None), Swap UVs, Generate Lightmap UVs.
  - Rig (see 06). Animation (see 06).
  - Materials: Material Creation Mode (None, Standard, Import via MaterialDescription), Location (embedded or external), remap, and extract textures.
  - `ModelImporterAnimationCompression`: Off, KeyframeReduction, KeyframeReductionAndCompression, Optimal.
- **Renderers**:
  - `MeshRenderer`: materials, lighting (cast/receive shadows, contribute GI), probes, additional settings (motion vectors via `MotionVectorGenerationMode` Camera/Object/ForceNoMotion, dynamic occlusion, rendering layer mask, renderer priority), `sortingLayer`/`sortingOrder`, `allowOcclusionWhenDynamic`, `staticShadowCaster`.
  - `SkinnedMeshRenderer`: bones, root bone, quality (1/2/4 bones or Auto), update when offscreen, skinned motion vectors, `BakeMesh`, `SetBlendShapeWeight`, GPU skinning (compute/batched).
- **LOD**: `LODGroup` holds LOD levels by screen-relative height, with fade mode (None, Cross Fade, SpeedTree), animate cross-fading, `LODBias`, and `maximumLODLevel`.
- **Procedural and immediate drawing**: `Graphics.RenderMesh`, `RenderMeshInstanced`, `RenderMeshIndirect`, `RenderPrimitives`, `DrawProcedural`, `DrawMeshNow`, `GL` immediate mode, and `CommandBuffer.DrawMesh`.

## 9. Culling and batching (draw-call optimisation)

- **Frustum culling**: automatic, per renderer bounds.
- **Occlusion culling**: baked with **Umbra**. Settings: smallest occluder, smallest hole, backface threshold. Supports occlusion areas and portals (doors). The HDRP/URP **GPU occlusion culling** (6.0) works with the GPU Resident Drawer.
- **Batching options**:
  - **Static batching**: combines static meshes at build or load time. Also `StaticBatchingUtility.Combine`.
  - **Dynamic batching**: small meshes (≤ 300 vertices), BiRP/URP only.
  - **GPU instancing**: `enableInstancing`, `UNITY_INSTANCING_BUFFER`, `DrawMeshInstanced`.
  - **SRP Batcher**: batches by shader variant using persistent per-material CBUFFERs (`UnityPerMaterial`) and per-draw `UnityPerDraw`.
  - **BatchRendererGroup (BRG)**: a low-level API that registers meshes and materials and creates batches plus draw commands in a culling callback. Shaders need DOTS Instancing (`UNITY_DOTS_INSTANCED_PROP`).
  - **GPU Resident Drawer** (6.0): automatically uses BRG for MeshRenderers. Enable it in the URP/HDRP asset with Forward+ (URP). It is especially good for static vegetation and large instance counts.
- **Culling groups and layers**: `CullingGroup` API (distance bands and visibility callbacks), `Camera.layerCullDistances`, and the Rendering Layers mask.

## 10. Post-processing

Post-processing uses the **Volume** framework in URP and HDRP:

- A global or local (box/sphere/mesh collider) `Volume` has a priority, blend distance and weight, and references a `VolumeProfile` with `VolumeComponent` overrides.
- The camera Volume Mask and Volume Trigger select which volumes apply.
- `VolumeManager.instance.stack.GetComponent<T>()` reads the blended values.

![Post-processing (HDRP)](https://raw.githubusercontent.com/Unity-Technologies/Graphics/a7e4c051d256a781ab362c64316b125a1e104694/Packages/com.unity.render-pipelines.high-definition/Documentation~/Images/HDRPFeatures-PostProcessing.png)

| Effect | URP | HDRP | Notes |
|---|---|---|---|
| Bloom | ✓ | ✓ | threshold, intensity, scatter, tint, clamp, high-quality filtering, dirt texture, downscale |
| Channel Mixer | ✓ | ✓ | |
| Chromatic Aberration | ✓ | ✓ | spectral LUT |
| Color Adjustments | ✓ | ✓ | post-exposure, contrast, color filter, hue shift, saturation |
| Color Curves | ✓ | ✓ | master/RGB, Hue vs Hue/Sat, Sat vs Sat, Lum vs Sat |
| Color Lookup (LUT) | ✓ | ✓ (Tonemapping External) | .cube import |
| Depth of Field | Gaussian, Bokeh | Physical Camera or Manual, near/far blur, **Physically Based** DoF | |
| Film Grain | ✓ | ✓ | presets or custom texture |
| Lens Distortion | ✓ | ✓ | |
| Lift, Gamma, Gain | ✓ | ✓ | |
| Motion Blur | Camera only (URP) | per-object, camera clamp | |
| Panini Projection | ✓ | ✓ | |
| Shadows, Midtones, Highlights | ✓ | ✓ | |
| Split Toning | ✓ | ✓ | |
| Tonemapping | None, Neutral, ACES | + Custom, External LUT, **ACES/HDR output modes** | HDR display output |
| Vignette | ✓ | ✓ | procedural or masked (HDRP) |
| White Balance | ✓ | ✓ | temperature, tint |
| Screen Space Lens Flare | ✓ (6.x) | ✓ | streaks, ghosts, halo |
| Exposure | — | Fixed, Automatic, **Automatic Histogram**, Curve Mapping, Physical Camera; metering masks | |
| Ambient Occlusion | SSAO renderer feature | SSAO/RTAO volume | |
| Screen Space Reflection | 6.x (URP) | ✓ + RT | |
| Custom | Full Screen Pass renderer feature | `CustomPostProcessVolumeComponent` with injection points | |

![Bloom (PPv2 screenshot)](https://raw.githubusercontent.com/Unity-Technologies/Graphics/a7e4c051d256a781ab362c64316b125a1e104694/com.unity.postprocessing/Documentation~/images/screenshot-bloom.png)
![Depth of field](https://raw.githubusercontent.com/Unity-Technologies/Graphics/a7e4c051d256a781ab362c64316b125a1e104694/com.unity.postprocessing/Documentation~/images/screenshot-dof.png)
![Color grading](https://raw.githubusercontent.com/Unity-Technologies/Graphics/a7e4c051d256a781ab362c64316b125a1e104694/com.unity.postprocessing/Documentation~/images/screenshot-grading.png)

- **Anti-aliasing**:
  - MSAA (2x/4x/8x), FXAA, SMAA (Low/Medium/High), TAA (quality, jitter spread, sharpness, anti-flicker, speed rejection, base blend factor), and Alpha to Coverage.
  - Upscalers: **STP** (Spatial-Temporal Post-processing, 6.0; URP + HDRP, compute-capable mobile too), **DLSS** (NVIDIA module), **FSR 1/2** (AMD module), **MetalFX** (MetalFX module, Apple), and TAAU.
- **Dynamic resolution**: `ScalableBufferManager` and HDRP Dynamic Resolution (Catmull-Rom, FSR 1, DLSS, TAAU). URP has render scale plus upscaling filters (Bilinear, Nearest-Neighbor, FSR 1, STP).
- **Post Processing Stack v2** (`com.unity.postprocessing`, BiRP): effects AO, AA, Auto Exposure, Bloom, Chromatic Aberration, Color Grading, Deferred Fog, Depth of Field, Grain, Lens Distortion, Motion Blur, SSR and Vignette.

```csharp
// Change a post-processing override at runtime (URP/HDRP, illustrative)
using UnityEngine; using UnityEngine.Rendering; using UnityEngine.Rendering.Universal;
public class DamageVignette : MonoBehaviour {
    public Volume volume; Vignette v;
    void Start() => volume.profile.TryGet(out v);
    public void Flash(float t) { v.intensity.Override(Mathf.Lerp(0.2f, 0.6f, t)); v.color.Override(Color.red); }
}
```

## 11. Ray tracing and path tracing

![HDRP ray tracing](https://raw.githubusercontent.com/Unity-Technologies/Graphics/a7e4c051d256a781ab362c64316b125a1e104694/Packages/com.unity.render-pipelines.high-definition/Documentation~/Images/HDRPFeatures-RayTracing.png)

- **Engine API**: `RayTracingAccelerationStructure` (build and update per layer/mask, instances, AABBs), `RayTracingShader`, `CommandBuffer.DispatchRays`, and inline ray queries in compute. Requires DX12, Vulkan RT, Metal RT or consoles.
- **HDRP ray-traced effects**:
  - RT Ambient Occlusion, RT Contact Shadows, RT Global Illumination (Ray Tracing or Mixed modes), RT Reflections (Ray Tracing or Mixed), RT Shadows (directional, point and area, with colored translucent shadows), **Recursive Rendering**, and RT Subsurface Scattering.
  - Light Cluster.
  - **Path Tracing**: a unidirectional path tracer with accumulation, max depth, denoising (OptiX/OIDN), and volumetric fog support. It supports Fabric, Hair, StackLit and AxF.
- **SRP Core Unified Ray Tracing API**: one code path over hardware RT or a compute BVH fallback. The GPU lightmapper uses it.

## 12. HDRP environment and scene features

![Volumetric clouds](https://raw.githubusercontent.com/Unity-Technologies/Graphics/a7e4c051d256a781ab362c64316b125a1e104694/Packages/com.unity.render-pipelines.high-definition/Documentation~/Images/HDRPFeatures-VolumetricClouds.png)
![Water](https://raw.githubusercontent.com/Unity-Technologies/Graphics/a7e4c051d256a781ab362c64316b125a1e104694/Packages/com.unity.render-pipelines.high-definition/Documentation~/Images/HDRPFeatures-WaterMaterial.png)
![Fog](https://raw.githubusercontent.com/Unity-Technologies/Graphics/a7e4c051d256a781ab362c64316b125a1e104694/Packages/com.unity.render-pipelines.high-definition/Documentation~/Images/HDRPFeatures-Fog.png)

- **Sky** (set through the Visual Environment volume override):
  - **Gradient Sky** (top, middle and bottom colors).
  - **HDRI Sky**, with a backplate (Rectangle/Disc/Ellipse/Infinite) and distortion/rotation animation.
  - **Physically Based Sky**: a planet with a two-part exponential atmosphere, ozone, multiple celestial bodies, space emission, Earth presets, and night sky.
  - Custom sky (`SkyRenderer`) and per-camera skies. The Static Lighting Sky drives baked GI.
- **Clouds**:
  - **Cloud Layer**: 2D texture layers with lighting, wind and shadows.
  - **Volumetric Clouds**: Simple/Advanced/Manual modes, presets (Sparse, Cloudy, Overcast, Stormy), a cloud map/LUT, wind, erosion, shadows, and fly-through.
- **Fog**: global exponential height fog and **Volumetric Fog** (anisotropy, denoising, screen resolution %, slices). **Local Volumetric Fog** volumes use a 3D mask texture or a Fog Volume Shader Graph.
- **Water System**:
  - Surface types: Ocean/Sea/Lake, River, Pool.
  - FFT simulation bands (swell, agitation, ripples), CPU-mirrored simulation for buoyancy (`WaterSurface.ProjectPointOnWaterSurface`/`FindWaterSurfaceHeight` via `WaterSearchParameters`), current maps, **water decals** (deformation, foam, mask, current), foam, caustics, underwater view, water excluders, a water line, and VFX interaction.
- **Decals**: a `DecalProjector` (URP and HDRP) with angle fade, draw distance, affects base/normal/mask/emission, decal layers and surface gradient. Mesh decals are supported, and so is runtime creation.
- **Graphics Compositor** (HDRP): layers cameras, video and images with a Shader Graph composition graph.
- **Camera-relative rendering**: large-world precision.
- **Custom Passes**:
  - Injection points: BeforeRendering, AfterOpaqueDepthAndNormal, AfterOpaqueColor, BeforePreRefraction, BeforeTransparent, BeforePostProcess, AfterPostProcessBlurs, AfterPostProcess.
  - Draw Renderers or Fullscreen passes, including custom color/depth buffers.
- **Frame Settings** toggle every feature per camera or reflection probe.
- **Look Dev**: an HDRI environment library for side-by-side material review.
- **High Quality Line Rendering** for hair and fur strands, and **Multiframe rendering/accumulation** for cinematics.
- **Rendering Layers** (Light Layers and Decal Layers), plus Light Layers for shadow maps.

![HDRP light layers](https://raw.githubusercontent.com/Unity-Technologies/Graphics/a7e4c051d256a781ab362c64316b125a1e104694/Packages/com.unity.render-pipelines.high-definition/Documentation~/Images/HDRPFeatures-LightLayers.png)

## 13. Other rendering features

- **Skybox materials**: 6-Sided, Cubemap, Panoramic (equirectangular/180°, mirror), and Procedural (sun disk, atmosphere thickness, tint, exposure). A per-camera `Skybox` component overrides the scene skybox.
- **Projector** (BiRP) and **Lens Flare** (BiRP `Flare` asset and **SRP Lens Flare Data** with occlusion, radial/ring/polygon elements, and screen-space lens flare).
- **Halo** (BiRP), **Trail/Line renderers** (see 04), and **Billboard renderer** (SpeedTree billboards).
- **HDR output**: HDR10 / scRGB display output, `HDROutputSettings` (paper white, min/max nits), and HDRP HDR tonemapping.
- **Color space**: `ColorSpace` is Linear (the default) or Gamma.
- **Stereo and XR**: Single Pass Instanced and Multiview, foveated rendering (`FoveatedRenderingMode`), and Variable Rate Shading (6.1+ URP/HDRP VRS API).
- **Pipeline callbacks**: `RenderPipelineManager.beginCameraRendering` and related events. `Camera.onPreRender` (BiRP). `CommandBuffer` on `CameraEvent` (BiRP) and `LightEvent`.
- **Graphics APIs in C#**: `Graphics.*`, `GraphicsBuffer` (Structured, Raw, Append, Counter, IndirectArguments, Vertex, Index, Constant), `ComputeShader.Dispatch`/`DispatchIndirect`, `AsyncGPUReadback`, `GraphicsFence`, `SystemInfo.*` capability queries, `ShaderWarmup`, and `Shader.SetGlobal*`.
