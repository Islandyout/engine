# 11 — World building, AI navigation and cameras

## 1. Terrain

Manual: <https://docs.unity3d.com/Manual/script-Terrain.html>

- **Terrain component and TerrainData asset**:
  - Heightmap resolution (33–4097, 2^n+1), size (width/length/height), holes texture, alphamap (splat) resolution, base map resolution, detail resolution, and resolution per patch.
- **Terrain tools** (Inspector toolbar):
  1. Create Neighbor Terrains, for tiling multiple terrains with auto-connect and groups.
  2. **Paint Terrain**:
     - Raise or Lower Terrain, Paint Holes, **Paint Texture** (Terrain Layers), Set Height, Smooth Height, Stamp Terrain.
     - The **Terrain Tools** package adds Bridge, Clone, Noise, Terrace, Contrast, Sharpen Peaks, Slope Flatten, Erosion (hydraulic, thermal, wind), Twist, Pinch, Smudge, Mesh Stamp and Toolbox.
  3. **Paint Trees**: tree prototypes (mesh prefab or SpeedTree), brush size, density, height/width variation, color variation, rotation, lightmap static, Mass Place Trees.
  4. **Paint Details**: grass textures (`DetailRenderMode` GrassBillboard, Grass) or detail meshes (VertexLit, or instanced). Settings: density, width/height variation, noise spread, healthy/dry colors, align to ground, position jitter, detail scatter mode (`DetailScatterMode` CoverageMode, InstanceCountMode).
  5. **Terrain Settings**:
     - Basic: draw, draw instanced, pixel error (LOD), base map distance, cast shadows, reflection probes, material, and `TerrainRenderFlags` (Heightmap, Trees, Details, All).
     - Tree and detail objects: draw, bake light probes for trees, detail object distance and density, tree distance, billboard start, fade length, max mesh trees.
     - Wind for grass: speed, size, bending, tint.
     - Lighting, lightmap scale, rendering layer mask, grouping ID, auto connect.
- **TerrainLayer asset**: diffuse, normal map (plus scale), mask map (metallic, AO, height, smoothness), tile size and offset, specular, metallic, smoothness, and diffuse remap. HDRP and URP Terrain Lit shaders support height-based blending.
- **Runtime API**:
  - Height: `TerrainData.GetHeights`/`SetHeights`/`SetHeightsDelayLOD`, `GetInterpolatedHeight`/`Normal`, `GetSteepness`, `Terrain.SampleHeight`.
  - Textures and details: `GetAlphamaps`/`SetAlphamaps`, `SetDetailLayer`, `treeInstances`.
  - Paint utilities: `TerrainPaintUtility`. Neighbors: `Terrain.SetNeighbors`.
- **Terrain holes**, the **TerrainCollider**, and GPU instancing for terrain rendering.
- **Tree Editor** (built-in procedural trees with branch/leaf groups) and **SpeedTree** import (`.st`, SpeedTree 8/9, with wind, LOD and billboards).
- **WindZone**: mode (Directional, Spherical), radius, main, turbulence, pulse magnitude and frequency. It affects trees, grass and particles.

```csharp
// Raise a crater into terrain at runtime (illustrative)
void Crater(Terrain t, Vector3 world, float radius, float depth) {
    var d = t.terrainData; int res = d.heightmapResolution;
    Vector3 p = world - t.transform.position;
    int cx = (int)(p.x / d.size.x * res), cz = (int)(p.z / d.size.z * res), r = (int)(radius / d.size.x * res);
    int x0 = Mathf.Clamp(cx - r, 0, res), z0 = Mathf.Clamp(cz - r, 0, res), w = Mathf.Min(r * 2, res - x0), h = Mathf.Min(r * 2, res - z0);
    var hm = d.GetHeights(x0, z0, w, h);
    for (int z = 0; z < h; z++) for (int x = 0; x < w; x++) {
        float dist = Vector2.Distance(new Vector2(x0 + x, z0 + z), new Vector2(cx, cz)) / r;
        if (dist < 1) hm[z, x] -= depth / d.size.y * (1 - dist * dist);
    }
    d.SetHeightsDelayLOD(x0, z0, hm); d.SyncHeightmap();
}
```

## 2. AI Navigation (`com.unity.ai.navigation`, 2.x)

Manual: <https://docs.unity3d.com/Packages/com.unity.ai.navigation@2.0/manual/index.html>

- **NavMesh baking**:
  - **NavMeshSurface** component: agent type, default area, collect objects (All Game Objects, Volume, Current Object Hierarchy, NavMeshModifier Component Only), include layers, use geometry (Render Meshes, Physics Colliders), voxel size, tile size, min region area, build height mesh, runtime `BuildNavMesh`/`UpdateNavMesh` (async).
  - Multiple surfaces, and surfaces in any orientation (walls, ceilings).
- **Agent types** (Navigation window): radius, height, step height, max slope. Advanced settings: voxel size, min region area, drop height, jump distance (legacy).
- **Areas**: 32 areas with costs (Walkable, Not Walkable, Jump + custom), and an area mask.
- **Modifiers**:
  - `NavMeshModifier`: override area, ignore from build, apply to children, affected agents.
  - `NavMeshModifierVolume`: box, area override.
- **Links**: `NavMeshLink` (width, bidirectional, cost modifier, auto-update, start/end points or transforms, activated). The legacy `OffMeshLink` has `OffMeshLinkType` values LinkTypeManual, LinkTypeDropDown and LinkTypeJumpAcross, and supports auto-generation.
- **NavMeshAgent**:
  - Steering: `speed`, `angularSpeed`, `acceleration`, `stoppingDistance`, `autoBraking`.
  - Obstacle avoidance: `radius`, `height`, `baseOffset`, `obstacleAvoidanceType` (NoObstacleAvoidance, Low/Med/Good/HighQuality), `avoidancePriority` (0–99).
  - Path finding: `autoTraverseOffMeshLink`, `autoRepath`, `areaMask`, `agentTypeID`.
  - Path and state: `SetDestination`, `destination`, `path`/`SetPath`, `CalculatePath`, `pathStatus` (PathComplete, PathPartial, PathInvalid), `pathPending`, `remainingDistance`, `hasPath`, `isStopped`, `ResetPath`.
  - Control: `Warp`, `Move`, `nextPosition`, `updatePosition`/`updateRotation`/`updateUpAxis` (for root-motion integration), `isOnOffMeshLink`, `currentOffMeshLinkData`, `CompleteOffMeshLink`, `velocity`/`desiredVelocity`, `FindClosestEdge`, `Raycast`, `SamplePathPosition`.
- **NavMeshObstacle**:
  - `shape` (Capsule, Box), `carving` (carve only stationary, move threshold, time to stationary).
  - Without carving, agents avoid the obstacle locally instead of repathing.
- **NavMesh static API**: `NavMesh.SamplePosition`, `CalculatePath`, `Raycast`, `FindClosestEdge`, `GetAreaFromName`, `AddNavMeshData`, `CalculateTriangulation`, `avoidancePredictionTime`, `pathfindingIterationsPerFrame`, and `NavMeshBuilder.BuildNavMeshData` with `NavMeshBuildSource`/`NavMeshBuildMarkup`.
- **NavMesh debug** overlays: surfaces, agents, obstacles.
- **Unity Behavior** (`com.unity.behavior`): a graph-based behavior tree editor with Blackboards, events, and LLM-assisted node generation.

```csharp
// Patrol with NavMeshAgent (illustrative)
using UnityEngine; using UnityEngine.AI;
public class Patrol : MonoBehaviour {
    public Transform[] points; NavMeshAgent agent; int i;
    void Start() { agent = GetComponent<NavMeshAgent>(); agent.SetDestination(points[0].position); }
    void Update() {
        if (!agent.pathPending && agent.remainingDistance <= agent.stoppingDistance) {
            i = (i + 1) % points.Length; agent.SetDestination(points[i].position);
        }
    }
}
```

## 3. ProBuilder (`com.unity.probuilder`)

![ProBuilder context overlays](https://raw.githubusercontent.com/Unity-Technologies/com.unity.probuilder/f6ecdd9cd9843c0ede811883f48ef2ba55f8acb6/Documentation~/images/ProBuilderContextOverlays.png)

- **In-editor polygonal modeling**:
  - Element modes: Object, Vertex, Edge, Face.
  - Shape tool (Cube, Cylinder, Cone, Plane, Pipe, Arch, Stairs, Curved Stairs, Door, Torus, Prism, Sphere, Sprite), Poly Shape.
- **Editing actions**: extrude, inset, bevel, bridge, connect, subdivide, weld, collapse, merge, split, flip normals, conform normals, triangulate, detach, duplicate, Boolean (experimental), mirror, center pivot, freeze transform, ProBuilderize, Export (OBJ, STL, PLY, Asset).
- **UV and material tools**: UV Editor (auto and manual UVs, texture groups, render UV template), Material Editor, Vertex Colors, smoothing groups, and lightmap UV generation.
- **API**: `ProBuilderMesh`, `ShapeGenerator`, `ExtrudeElements`, `ToMesh()`/`Refresh()`.
- **Polybrush** (companion package): sculpt, smooth, paint vertex colors and textures, and scatter prefabs on meshes.

## 4. Splines (`com.unity.splines`)

- **Components**: `SplineContainer` holds multiple splines and knot links. Knot tangent modes: Auto Smooth, Linear, Mirrored, Continuous, Broken, Bezier.
- **Evaluation**: `EvaluatePosition`/`Tangent`/`UpVector`, `GetNearestPoint`, `SplineUtility`.
- **Built-in tools and components**: Spline Animate (move along, with loop modes and alignment), Spline Extrude (mesh tube), Spline Instantiate (scatter), and a Spline Data API (per-knot data for width, roll and custom values).
- **Editor tools**: Knot Placement tool, Draw Spline tool, and Spline Inspector overlays.
- **Integrations**: Cinemachine Spline Dolly/Cart and VFX Graph use splines.

## 5. Cinemachine 3 (`com.unity.cinemachine`)

Image base: `https://raw.githubusercontent.com/Unity-Technologies/com.unity.cinemachine/69b205115495a374fbba329547ba608cdcfe7847/com.unity.cinemachine/Documentation~/images/`

![Cinemachine Brain](https://raw.githubusercontent.com/Unity-Technologies/com.unity.cinemachine/69b205115495a374fbba329547ba608cdcfe7847/com.unity.cinemachine/Documentation~/images/CinemachineBrainInspector.png)

- **Core concept**: a **CinemachineBrain** on the Unity Camera picks the highest-priority live **CinemachineCamera** and blends between cameras. Brain settings: default blend (Cut, Ease In Out, Ease In, Ease Out, Hard In, Hard Out, Linear, Custom curve), custom blends asset, update method (Fixed, Late, Smart, Manual), blend update method, channel mask (for split screen), world up override, ignore time scale, and events.
- **CinemachineCamera**: priority, **Tracking Target** / **Look At Target**, Lens (FOV, ortho size, near/far, dutch, physical properties, mode override), Blend Hint, standby update.
  - **Position Control** components:
    - Follow, Orbital Follow (Sphere or Three Ring for FreeLook), Third Person Follow (shoulder offset, camera side, collision), Position Composer (screen-space framing with dead and soft zones, lookahead, damping).
    - Hard Lock to Target, Spline Dolly (auto-dolly), and the Follow Zoom extension.
  - **Rotation Control** components: Rotation Composer (screen composition, dead zone, soft zone, damping, lookahead), Hard Look At, Pan Tilt (input driven), Rotate With Follow Target, Spline Dolly LookAt Targets.
  - **Noise**: Basic Multi Channel Perlin with Noise Settings profiles (6D Shake, Handheld, …).
  - **Extensions**: Deoccluder (formerly Collider: pull forward, preserve height, preserve distance, shot quality), Decollider, Confiner 2D (polygon), Confiner 3D (volume), Follow Zoom, FreeLook Modifier, Group Framing, Recomposer, Third Person Aim, Storyboard, Pixel Perfect, Post Processing/Volume Settings, Auto Focus, Shot Quality Evaluator, Camera Offset.
- **Manager cameras**: Clear Shot (chooses the best shot by quality), State-Driven Camera (follows Animator states), Sequencer Camera (formerly Blend List), Mixing Camera (weighted blend of up to 8).
- **Target Group**: weighted targets with a radius, used to frame groups.
- **Impulse**: Impulse Source, Collision Impulse Source (on collision or trigger), and Impulse Listener. Signal shapes are propagated with dissipation. Also supports impulse filtering.
- **Input**: Input Axis Controller (Input System or legacy), with gain, acceleration, deceleration and recentering.
- **Timeline**: Cinemachine Track and shots, with blends made by overlapping clips.
- **Spline Cart**, **Spline Roll**, **Spline Smoother**, and **Events** (camera activated, blend created and finished).
- **Samples**: Simple Player Controller, FreeLook on spherical surfaces, split screen, and more.

```csharp
// Raise a camera's priority to cut/blend to it (Cinemachine 3)
using Unity.Cinemachine; using UnityEngine;
public class ShotSwitch : MonoBehaviour {
    public CinemachineCamera closeUp;
    void OnTriggerEnter(Collider c) { if (c.CompareTag("Player")) closeUp.Priority = 20; }
    void OnTriggerExit(Collider c)  { if (c.CompareTag("Player")) closeUp.Priority = 0; }
}
```

![FreeLook](https://raw.githubusercontent.com/Unity-Technologies/com.unity.cinemachine/69b205115495a374fbba329547ba608cdcfe7847/com.unity.cinemachine/Documentation~/images/CinemachineFreelook.png)

## 6. Other world tools

- **LOD Group** and **Mesh LOD** (see 03). **Occlusion** with areas and portals.
- **Streaming**: Addressables and scenes for open worlds. `StreamingController` controls texture streaming per camera.
- **Level-design packages**: ProGrids is legacy (the built-in Grid and Snap replaced it). Terrain Tools, Polybrush and Splines are listed above.
- **Water (HDRP)**, **Volumetric clouds and fog**: see 03 §12.
