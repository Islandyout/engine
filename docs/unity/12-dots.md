# 12 — DOTS: Entities, Jobs, Burst

Entities: <https://docs.unity3d.com/Packages/com.unity.entities@1.3/manual/index.html> · Jobs: <https://docs.unity3d.com/Manual/job-system.html> · Burst: <https://docs.unity3d.com/Packages/com.unity.burst@1.8/manual/index.html>

DOTS (Data-Oriented Technology Stack) = **C# Job System** (engine core) + **Burst** compiler + **Collections** + **Mathematics** + **Entities** (ECS) + Entities Graphics + Unity Physics + Netcode for Entities.

From **Unity 6.4**, ECS ships as *core packages integrated in the Editor*. There is also an "ECS for all" direction: GameObjects and entities are unified through `EntityId` (the `Identifiers` module).

## 1. C# Job System

- **Job interfaces**: `IJob`, `IJobFor` (`Schedule`/`ScheduleParallel`/`Run`), `IJobParallelFor`, `IJobParallelForTransform` (`TransformAccessArray`), `IJobParallelForBatch`, `IJobFilter`, plus `IJobEntity`/`IJobChunk` (Entities) and `IJobParticleSystem`.
- **Scheduling**:
  - `Schedule(dependsOn)` returns a `JobHandle`. Use `Complete()`, `JobHandle.CombineDependencies`, `IsCompleted`, `ScheduleBatchedJobs`.
  - Jobs run on worker threads (`JobsUtility.JobWorkerCount`).
- **Safety system**: `[ReadOnly]`, `[WriteOnly]`, `[NativeDisableParallelForRestriction]`, `[NativeDisableContainerSafetyRestriction]`, `[DeallocateOnJobCompletion]`, and AtomicSafetyHandle race detection in the editor.
- **Native containers** (Unity.Collections):
  - Engine containers: `NativeArray<T>`, `NativeSlice<T>`.
  - Package containers: `NativeList`, `NativeHashMap`, `NativeParallelHashMap`, `NativeMultiHashMap` (NativeParallelMultiHashMap), `NativeHashSet`, `NativeQueue`, `NativeStream`, `NativeReference`, `NativeText`, `NativeBitArray`.
  - Unsafe variants and `FixedList32/64/128/512/4096Bytes`, `FixedString*`.
- **Allocators**: `Temp` (1 frame), `TempJob` (4 frames), `Persistent`, plus custom/rewindable allocators (`AllocatorHandle`; the ManagedKernel module).
- **Engine APIs that are job-friendly**: `Mesh.MeshData`, `RaycastCommand` and friends, `TransformAccess`, `AsyncGPUReadback` NativeArrays, `Texture2D.GetPixelData`, and the ParticleSystem job API.

```csharp
using Unity.Burst; using Unity.Collections; using Unity.Jobs; using Unity.Mathematics; using UnityEngine;
[BurstCompile]
struct WaveJob : IJobFor {
    public NativeArray<float3> positions; public float time;
    public void Execute(int i) { var p = positions[i]; p.y = math.sin(p.x * 0.5f + time) * math.cos(p.z * 0.5f + time); positions[i] = p; }
}
public class Waves : MonoBehaviour {
    NativeArray<float3> pts;
    void Start() => pts = new NativeArray<float3>(100_000, Allocator.Persistent);
    void Update() {
        var h = new WaveJob { positions = pts, time = Time.time }.ScheduleParallel(pts.Length, 64, default);
        h.Complete();   // or complete in LateUpdate to overlap with main-thread work
    }
    void OnDestroy() => pts.Dispose();
}
```

## 2. Burst compiler

- **What it compiles**: an HPC# subset of C# (no managed objects or GC allocations) compiled through LLVM to SIMD-optimized native code. Targets jobs, static methods (`[BurstCompile]` + function pointers `BurstCompiler.CompileFunctionPointer`), and ISystem.
- **Options**: `FloatPrecision`, `FloatMode` (Strict, Default, Fast, Deterministic), `CompileSynchronously`, `DisableSafetyChecks`, `OptimizeFor` (Performance, Size, FastCompilation, Balanced).
- **Intrinsics**: `Unity.Burst.Intrinsics` (X86 SSE–AVX2, Arm Neon), `Hint.Likely`/`Unlikely`/`Assume`, `Loop.ExpectVectorized`, `SkipLocalsInit`.
- **SharedStatic<T>**: static data shared between managed code and Burst.
- **Burst Inspector**: disassembly view. Burst AOT settings are per platform.

## 3. Unity.Mathematics

- **Types**: HLSL-like `float2/3/4`, `int*`, `uint*`, `bool*`, `double*`, `half`, `float3x3`/`float4x4`, `quaternion`, `RigidTransform`, `AffineTransform`.
- **`math.*` functions**: `lerp`, `dot`, `cross`, `normalize`, `length`, `mul`, `select`, `any`/`all`, `csum`, `cmax`, `sincos`, `rotate`, `transform`, `inverse`, `hash`.
- **Swizzles**: `v.xzy`.
- **Randomness and noise**: `Random` (xorshift128+) and the `noise` namespace.

## 4. Entities (ECS)

- **Worlds**: a `World` holds an `EntityManager` and systems. `DefaultWorldInitialization` builds the default world. `World.DefaultGameObjectInjectionWorld`.
- **Entities**: `Entity` (index + version) and archetypes (a unique component set). **Chunks** are 16 KB blocks storing components as SoA.
- **Component types**:
  - `IComponentData` (unmanaged struct, or managed class), `IBufferElementData` (`DynamicBuffer<T>`), `ISharedComponentData`, `IEnableableComponent` (toggle without a structural change), `ICleanupComponentData`, and tag components (empty).
  - Chunk components, singleton components (`SystemAPI.GetSingleton`), and **Aspects** (deprecated in 1.3+).
- **Systems**:
  - `ISystem` (unmanaged, Burst-compatible, with `OnCreate`/`OnUpdate`/`OnDestroy`) and `SystemBase` (managed).
  - System groups: `InitializationSystemGroup`, `SimulationSystemGroup` (default), `PresentationSystemGroup`, `FixedStepSimulationSystemGroup`, `VariableRateSimulationSystemGroup`.
  - Ordering attributes: `[UpdateInGroup]`, `[UpdateBefore/After]`, `[RequireMatchingQueriesForUpdate]`. `state.RequireForUpdate<T>()`.
- **Queries**: `SystemAPI.Query<RefRW<T>, RefRO<U>>().WithAll<>().WithNone<>().WithAny<>().WithEntityAccess()`, `EntityQuery`/`EntityQueryBuilder`, change filters (`WithChangeFilter`), and shared-component filters.
- **Jobs over entities**: `IJobEntity` (source-generated query from the `Execute` signature), `IJobChunk` (`ArchetypeChunk`, `ComponentTypeHandle`), `ComponentLookup<T>`, `BufferLookup<T>`.
- **Structural changes**:
  - `EntityManager.CreateEntity`/`Instantiate`/`DestroyEntity`/`AddComponent`/`RemoveComponent`.
  - Deferred changes through an **EntityCommandBuffer** (`ParallelWriter`, ECB systems such as `EndSimulationEntityCommandBufferSystem`).
- **Baking** (authoring → runtime):
  - **SubScenes** hold GameObjects authored in the editor, which **Bakers** (`Baker<TAuthoring>` with `GetEntity(TransformUsageFlags)`, `AddComponent`) convert into entity data.
  - The data is serialized as entity scenes and streamed at runtime (`SceneSystem.LoadSceneAsync`, sections).
  - Baking systems and live baking (edit while playing).
- **Transforms**: `LocalTransform` (Position, Rotation, uniform Scale), `LocalToWorld`, `Parent`/`Child`, `PostTransformMatrix` (non-uniform scale).
- **Entities Graphics**: `RenderMeshArray`, `MaterialMeshInfo`, the BatchRendererGroup backend, material property overrides (`[MaterialProperty]`), and LOD.
- **Tooling**: Entities Hierarchy, Components, Systems and Archetypes windows; Journaling; Entities Profiler modules (structural changes, memory).
- **Related packages**: Unity Physics / Havok (see 05), Netcode for Entities (see 13), Entities Graphics, and Character Controller (`com.unity.charactercontroller`, a Burst-compiled kinematic character).

**Verbatim from `EntityComponentSystemSamples/Dots101/Entities101/Assets/HelloCube/2. IJobEntity/RotationSystem.cs`:**

```csharp
using Unity.Burst;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;

namespace HelloCube.JobEntity
{
    public partial struct RotationSystem : ISystem
    {
        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<ExecuteIJobEntity>();
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var job = new RotateAndScaleJob
            {
                DeltaTime = SystemAPI.Time.DeltaTime, ElapsedTime = (float)SystemAPI.Time.ElapsedTime
            };
            job.Schedule();
        }
    }

    [BurstCompile]
    partial struct RotateAndScaleJob : IJobEntity
    {
        public float DeltaTime;
        public float ElapsedTime;

        // In source generation, a query is created from the parameters of Execute().
        // Here, the query will match all entities having a LocalTransform, PostTransformMatrix, and RotationSpeed component.
        // (In the scene, the root cube has a non-uniform scale, so it is given a PostTransformMatrix component in baking.)
        void Execute(ref LocalTransform transform, ref PostTransformMatrix postTransform, in RotationSpeed speed)
        {
            transform = transform.RotateY(speed.RadiansPerSecond * DeltaTime);
            postTransform.Value = float4x4.Scale(1, math.sin(ElapsedTime), 1);
        }
    }
}
```

**Authoring and baker (illustrative):**

```csharp
public struct RotationSpeed : IComponentData { public float RadiansPerSecond; }
public class RotationSpeedAuthoring : MonoBehaviour {
    public float DegreesPerSecond = 360f;
    class Baker : Baker<RotationSpeedAuthoring> {
        public override void Bake(RotationSpeedAuthoring a) {
            var e = GetEntity(TransformUsageFlags.Dynamic);
            AddComponent(e, new RotationSpeed { RadiansPerSecond = math.radians(a.DegreesPerSecond) });
        }
    }
}
```

The official sample set ([EntityComponentSystemSamples](https://github.com/Unity-Technologies/EntityComponentSystemSamples)) has these top-level folders: `Dots101` (Entities101, Jobs101, Physics101, Netcode101, ContentManagement101, OtherSamples), `EntitiesSamples` (Baking, Boids, ExampleCode, Graphical, Streaming, UI Toolkit), `GraphicsSamples`, `PhysicsSamples` and `NetcodeSamples`.

HelloCube lessons: 1 MainThread, 2 IJobEntity, 3 Prefabs, 4 IJobChunk, 5 Reparenting, 6 EnableableComponents, 7 GameObjectSync, 8 CrossQuery, 9 RandomSpawn, 10 FirstPersonController, 11 FixedTimestep, 12 CustomTransforms, 13 StateChange, 14 ClosestTarget, 15 UnityObjectRef.
