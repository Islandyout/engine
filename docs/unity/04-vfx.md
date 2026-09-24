# 04 — Visual effects

Manual: <https://docs.unity3d.com/Manual/ParticleSystems.html> · VFX Graph: <https://docs.unity3d.com/Packages/com.unity.visualeffectgraph@17.0/manual/index.html>

## 1. Particle System (Shuriken, CPU)

This is a `ParticleSystem` component plus a `ParticleSystemRenderer`. It is configured through **modules**: structs on the component, each with an `enabled` flag. The source contains exactly these 23 module structs:

| Module (API struct) | Key properties |
|---|---|
| **Main** (`MainModule`) | duration, looping, prewarm, startDelay, startLifetime, startSpeed, 3D start size (X/Y/Z), 3D start rotation, flipRotation, startColor, gravityModifier, **simulationSpace** (Local, World, Custom), simulationSpeed, **deltaTime** scaled/unscaled, **scalingMode** (Hierarchy, Local, Shape), playOnAwake, **emitterVelocityMode** (Transform, Rigidbody, Custom), maxParticles, autoRandomSeed, **stopAction** (None, Disable, Destroy, Callback), **cullingMode** (Automatic, PauseAndCatchup, Pause, AlwaysSimulate), **ringBufferMode** (Disabled, PauseUntilReplaced, LoopUntilReplaced) |
| **Emission** | rateOverTime, rateOverDistance, bursts (time, count, cycles, interval, probability) |
| **Shape** | shapeType: Sphere, SphereShell, Hemisphere, HemisphereShell, Cone, ConeShell, ConeVolume, ConeVolumeShell, Box, BoxShell, BoxEdge, Mesh, MeshRenderer, SkinnedMeshRenderer, Circle, CircleEdge, SingleSidedEdge, Donut, Rectangle, Sprite, SpriteRenderer; plus radius/radiusThickness/arc (Random, Loop, PingPong, BurstSpread), angle, length, mesh vertex/edge/triangle emission, texture masking (clip channel, color/alpha affect), position/rotation/scale, alignToDirection, randomizeDirection/Position, spherizeDirection |
| **Velocity over Lifetime** | linear X/Y/Z, space, orbital X/Y/Z, offset, radial, speedModifier |
| **Limit Velocity over Lifetime** | speed limit (separate axes), dampen, drag, multiply by size/velocity |
| **Inherit Velocity** | mode (Initial, Current), multiplier curve |
| **Lifetime by Emitter Speed** | curve and range |
| **Force over Lifetime** | X/Y/Z force, space, randomize |
| **Color over Lifetime** | gradient |
| **Color by Speed** | gradient and speed range |
| **Size over Lifetime** | curve (separate axes) |
| **Size by Speed** | curve and range |
| **Rotation over Lifetime** | angular velocity (separate axes) |
| **Rotation by Speed** | curve and range |
| **External Forces** | multiplier, influence filter (`ParticleSystemGameObjectFilter` LayerMask, List, LayerMaskAndList) → **ParticleSystemForceField** (shape Sphere/Hemisphere/Cylinder/Box, directional, gravity, rotation, drag, vector field) and WindZone |
| **Noise** | strength (separate axes), frequency, scrollSpeed, damping, octaves/multiplier/scale, **quality** (Low 1D, Medium 2D, High 3D), remap, position/rotation/size amount |
| **Collision** | **type** (Planes, World), **mode** (Collision3D, Collision2D), dampen, bounce, lifetimeLoss, minKillSpeed, maxKillSpeed, radiusScale, quality (High/Medium/Low with voxel cache), collidesWith mask, maxCollisionShapes, enableDynamicColliders, **sendCollisionMessages** → `OnParticleCollision` |
| **Triggers** | colliders list, inside/outside/enter/exit actions (Ignore, Kill, Callback) → `OnParticleTrigger` with `GetTriggerParticles` |
| **Sub Emitters** | type **Birth, Collision, Death, Trigger, Manual**; inherit color/size/rotation/lifetime/duration; emit probability; `TriggerSubEmitter` |
| **Texture Sheet Animation** | mode Grid or Sprites; tiles; animation (Whole Sheet, Single Row); timeMode (Lifetime, Speed, FPS); frameOverTime; startFrame; cycles; affected UV channels |
| **Lights** | light prefab, ratio, random distribution, use particle color, size affects range, alpha affects intensity, range/intensity curves, maxLights |
| **Trails** | **mode** (PerParticle, Ribbon), ratio, lifetime, minVertexDistance, world space, die with particles, texture mode (Stretch, Tile, DistributePerSegment, RepeatPerSegment), size affects width/lifetime, inherit particle color, color over lifetime/trail, width over trail, generate lighting data, shadow bias, ribbon count, split sub-emitter ribbons, attach ribbons to transform |
| **Custom Data** | 2 custom streams (Vector up to 4 curves, or Color) passed to shaders |
| **Renderer** (`ParticleSystemRenderer`) | renderMode: **Billboard, Stretch, HorizontalBillboard, VerticalBillboard, Mesh, None**; mesh list and distribution; normal direction; material/trail material; sort mode (None, By Distance, Oldest in Front, Youngest in Front, By Depth); sorting fudge; min/max particle size; render alignment (View, World, Local, Facing, Velocity); flip; allow roll; pivot; visualize pivot; masking (sprite masks); apply active color space; **custom vertex streams** (Position, Normal, Color, UV/UV2, Center, Size, Rotation3D, Velocity, AgePercent, Random, Custom1/2, AnimBlend, AnimFrame…); GPU instancing for mesh particles; cast/receive shadows; motion vectors; sorting layer/order |

- **Curve modes** (`ParticleSystemCurveMode`): Constant, Curve, TwoCurves, TwoConstants (random between two).
- **Gradient modes** (`ParticleSystemGradientMode`): Color, Gradient, TwoColors, TwoGradients, RandomColor.
- **Scripting**:
  - Playback: `Play`, `Pause`, `Stop(withChildren, ParticleSystemStopBehavior.StopEmitting|StopEmittingAndClear)`, `Clear`, `Simulate(t)`.
  - Emission: `Emit(count)` and `Emit(EmitParams, count)`.
  - Particle data: `GetParticles`/`SetParticles` (`ParticleSystem.Particle[]` or NativeArray), `GetCustomParticleData`, `SetCustomParticleData`, `TriggerSubEmitter`, `AllocateAxisOfRotationAttribute`.
  - **`IJobParticleSystem`**/`IJobParticleSystemParallelFor` process particles in jobs (`OnParticleUpdateJobScheduled`).
  - `ParticleSystem.MinMaxCurve`/`MinMaxGradient` values.
- **Particle Effect overlay** in the Scene view: Play/Restart/Stop, Playback Speed, Playback Time, Particles count, Speed Range, Simulate Layers, Resimulate, Show Bounds, Show Only Selected.

```csharp
// Burst of sparks at a hit point with EmitParams (illustrative)
public ParticleSystem sparks;
public void Hit(Vector3 point, Vector3 normal) {
    var ep = new ParticleSystem.EmitParams { position = point, applyShapeToPosition = true };
    sparks.transform.rotation = Quaternion.LookRotation(normal);
    sparks.Emit(ep, 30);
}
```

## 2. Visual Effect Graph (GPU)

![VFX Graph window](https://raw.githubusercontent.com/Unity-Technologies/Graphics/a7e4c051d256a781ab362c64316b125a1e104694/Packages/com.unity.visualeffectgraph/Documentation~/Images/vfx-graph-window.png)

- **Architecture**:
  - A **Visual Effect Graph asset** is played by a `VisualEffect` component, which a `VFXRenderer` draws. Supported in URP and HDRP.
  - Simulation runs in compute shaders and supports millions of particles.
  - Graph elements: **Systems**, which contain **Contexts** (Spawn → Initialize → Update → Output). Contexts hold **Blocks**, and **Operators** compute values.
  - Supporting features: **Properties** (exposed in the Blackboard), **Events** (OnPlay, OnStop, custom, and GPU Events), **Attributes**, **Subgraphs** (System, Block and Operator subgraphs), Sticky Notes, a Templates window, **Instancing** (batched effects), Bounds (manual, recorded or automatic), and **Custom HLSL** blocks and operators.
- **Contexts**: Event, GPU Event, Spawn, Initialize Particle, Update Particle, and the outputs:
  - Output Particle Quad / Triangle / Octagon (Primitive), Output Point, Output Line, Output Mesh, Output Particle Mesh, and **ShaderGraph** outputs (Quad, Mesh, Strip).
  - Output Distortion, Output Decal, Output Particle HDRP Lit Decal, **HDRP Volumetric Fog**, and **URP Lit Decal**.
  - ParticleStrip outputs (trails/ribbons), and Six-Way smoke lighting.
- **Blocks**:
  - **Attribute**: Set, Map (from texture), Curve, Calculate Mass from Volume.
  - **Collision**: Collision Shape (sphere, box, plane, cylinder, SDF), Collision Depth Buffer, Kill Shape, Trigger Shape.
  - **Flipbook Player**.
  - **Force**: Attractor Shape SDF, Attractor Sphere, Force, Gravity, Linear Drag, Turbulence, Vector Force Field.
  - **Implicit integration**: Update Position, Update Rotation.
  - **Orientation**: Orient (Face Camera Plane/Position, Look At, Along Velocity, Fixed Axis, Advanced), Connect Target.
  - **Output**: Camera Fade, Subpixel Anti-Aliasing.
  - **Position**: Set Position Shape (AABox, Sphere, Cone, Torus, Circle, Line, Sequential), Depth, **Mesh**, **Skinned Mesh**, Tile/Warp Positions.
  - **Size**: Screen Space Size.
  - **Spawn**: Constant Rate, Periodic Burst, Single Burst, Variable Rate, Set Spawn Event attribute, Spawn Over Distance, Increment Strip Index, Set Spawn Time, custom spawn callbacks.
  - **Trigger Event** (Always, On Die, Rate, Collide) for GPU events.
  - **Velocity from Direction and Speed**: Change Speed, New Direction, Random Direction, Spherical, Tangent.
- **Standard attributes**: age, alive, alpha, angle (XYZ), angularVelocity, axisX/Y/Z, color, direction, lifetime, mass, oldPosition, particleCountInStrip, particleId, particleIndexInStrip, pivot, position, scale, seed, size, spawnIndex, spawnTime, stripIndex, targetPosition, texIndex, velocity, plus custom attributes.
- **Operators**:
  - **Built-in**: Delta Time, Frame Index, Local to World, System Seed, Total Time, World to Local.
  - **Camera**: Main Camera, Viewport↔World.
  - **Color**: Luma, HSV↔RGB.
  - **Inline** types: AABox, AnimationCurve, ArcCircle/Cone/Sphere/Torus, Camera, Circle, Color, Cone, Cubemap, Cylinder, Direction, FlipBook, Gradient, Line, Matrix4x4, Mesh, OrientedBox, Plane, Position, Sphere, Texture2D/2DArray/3D, Torus, Transform, Vector.
  - **Logic**, **Bitwise** and **Math**: arithmetic, clamp, constants, coordinates (polar, spherical), geometry (area, distance, volume, change space, InvertTRS), remap, trig, vector (Look At, Rotate 2D/3D, Sample Bezier), waves.
  - **Noise**: Value/Perlin/Cellular, each with a Curl variant.
  - **Random**: Random Number, Random Selector.
  - **Sampling**: Buffer, Camera Buffer (depth/color), Curve, Gradient, Mesh (vertex, index, triangle), Skinned Mesh, **SDF**, Texture2D/2DArray/3D/Cube, Point Cache, Attribute Map.
- **Pipeline tools**: the **SDF Bake Tool** (window and API), **Point Cache** (bake tool and asset `.pcache`), Vector Fields (`.vf`), and Six-way lightmap import. **Property Binders** drive exposed properties from Transform, Light, Audio Spectrum, Raycast, Input, Multiple Position, UI, Terrain and more. There are also Event Binders, Output Event Handlers (Play Audio, Rigidbody Force, CinemachineImpulse, Spawn Prefab) and **Timeline integration** (Visual Effect Activation Track, 6.x Control track clip scrubbing).

```csharp
// Drive a VFX Graph from script (illustrative)
using UnityEngine; using UnityEngine.VFX;
public class Firework : MonoBehaviour {
    public VisualEffect vfx; static readonly int ColorId = Shader.PropertyToID("MainColor");
    static readonly ExposedProperty Launch = "OnLaunch";
    public void Fire(Color c, Vector3 pos) {
        vfx.SetVector4(ColorId, c);
        var attr = vfx.CreateVFXEventAttribute(); attr.SetVector3("position", pos);
        vfx.SendEvent(Launch, attr);
    }
}
```

![Output contexts](https://raw.githubusercontent.com/Unity-Technologies/Graphics/a7e4c051d256a781ab362c64316b125a1e104694/Packages/com.unity.visualeffectgraph/Documentation~/Images/Context-OutputPrimitiveExamples.png)

## 3. Line, Trail and Billboard renderers

- **LineRenderer**:
  - Shape: `positions`/`SetPositions`, `positionCount`, `loop`, `useWorldSpace`, `widthCurve`/`widthMultiplier`, `colorGradient`.
  - Vertices: `numCornerVertices`, `numCapVertices`.
  - Appearance: `alignment` (View/TransformZ), `textureMode` (Stretch, Tile, DistributePerSegment, RepeatPerSegment, Static), `textureScale`, `shadowBias`, `generateLightingData`, `maskInteraction`.
  - Methods: `Simplify(tolerance)`, `BakeMesh`.
- **TrailRenderer**: `time`, `minVertexDistance`, `autodestruct`, `emitting`, `AddPosition(s)`, `Clear`, and the same width/color/texture settings as LineRenderer.
- **BillboardRenderer**: `BillboardAsset` (SpeedTree impostors).

## 4. Decals and projectors

- **URP**: the Decal renderer feature (technique DBuffer or Screen Space, with normal blend options) plus a `DecalProjector`.
- **HDRP**: `DecalProjector` plus the Decal Shader Graph, decal layers, and mesh decals.
- **BiRP**: `Projector` component.

## 5. Lens flares

- **SRP Lens Flare Data** asset plus the `LensFlareComponentSRP`:
  - Element types: Image, Circle, Polygon, Ring, **Lens Flare Data SRP** (nested).
  - Element settings: count, distribution (Uniform, Curve, Random), and occlusion (with background clouds and water).
- **Screen Space Lens Flare** volume override: generated from the bloom texture, with streaks, warped ghosts, halos and chromatic aberration.

![Lens flare samples](https://raw.githubusercontent.com/Unity-Technologies/Graphics/a7e4c051d256a781ab362c64316b125a1e104694/Packages/com.unity.render-pipelines.high-definition/Documentation~/Images/LensFlareSamples.png)
