# 05 — Physics

Manual: <https://docs.unity3d.com/Manual/PhysicsSection.html> · 2D: <https://docs.unity3d.com/Manual/2d-physics/2d-physics.html>

## 1. 3D physics (NVIDIA PhysX 4.1 integration)

### Simulation

- **When the simulation runs**: it runs after `FixedUpdate`, every `Time.fixedDeltaTime` (default 0.02 s = 50 Hz). Several steps can run in one frame, capped by the maximum allowed timestep.
- **Simulation mode** (`SimulationMode` from source): FixedUpdate, Update, Script. In Script mode you call `Physics.Simulate(dt)` yourself.
- **Physics scenes**: each scene can own a `PhysicsScene` (`LocalPhysicsMode.Physics3D`). Use this for prediction or rollback.
- **Transform sync**: `Physics.SyncTransforms` or `autoSyncTransforms`.
- **Settings** (Project Settings > Physics):
  - Gravity (0, −9.81, 0), default material, bounce threshold (2), default max depenetration velocity (10), sleep threshold (0.005), default contact offset (0.01), default solver iterations (6), solver velocity iterations (1).
  - Queries hit backfaces, queries hit triggers, and `QueryTriggerInteraction` (UseGlobal, Ignore, Collide).
  - Enable adaptive force, contact pairs mode, broadphase (Sweep and Prune, Multibox Pruning, Automatic Box Pruning), world bounds and subdivisions.
  - Friction type (Patch, One Directional, Two Directional), improved patch friction, **Enhanced Determinism**, **Solver Type** (Projected Gauss-Seidel or Temporal Gauss-Seidel), cloth inter-collision.
  - **Layer Collision Matrix**.
- **Contact callbacks**: `Physics.ContactEvent` / `ContactModifyEvent` (modify contacts before solve), `ContactPairHeader`, and `reuseCollisionCallbacks`.
- **Physics SDK integration**: `IntegrationInfo`, which in 6.x makes the physics backend swappable.

### Rigidbody

Unity 6 names: `linearVelocity` (formerly `velocity`), `linearDamping` (formerly `drag`), `angularDamping` (formerly `angularDrag`). These were verified in the 6000.7 source.

- **Properties**:
  - Mass and damping: `mass`, `linearDamping`, `angularDamping`, `automaticCenterOfMass`/`centerOfMass`, `automaticInertiaTensor`/`inertiaTensor`/`inertiaTensorRotation`.
  - State flags: `useGravity`, `isKinematic`.
  - `interpolation` (`RigidbodyInterpolation` None, Interpolate, Extrapolate).
  - `collisionDetectionMode`: Discrete, Continuous, ContinuousDynamic, ContinuousSpeculative.
  - `constraints` (`RigidbodyConstraints`): FreezePositionX/Y/Z, FreezeRotationX/Y/Z, FreezePosition, FreezeRotation, FreezeAll.
  - Velocity limits: `maxLinearVelocity`, `maxAngularVelocity`, `maxDepenetrationVelocity`.
  - Solver and sleep: `solverIterations`/`solverVelocityIterations`, `sleepThreshold`.
  - Layer overrides: `includeLayers`/`excludeLayers`.
- **Methods**:
  - Forces: `AddForce(f, ForceMode)`, `AddRelativeForce`, `AddTorque`, `AddRelativeTorque`, `AddForceAtPosition`, `AddExplosionForce(force, pos, radius, upwards, mode)`.
  - Kinematic movement: `MovePosition`, `MoveRotation`, `Move` (6.x).
  - Queries: `SweepTest`, `SweepTestAll`, `ClosestPointOnBounds`, `GetPointVelocity`, `GetRelativePointVelocity`, `GetAccumulatedForce`.
  - Sleep: `Sleep`, `WakeUp`, `IsSleeping`.
  - `ResetCenterOfMass`/`ResetInertiaTensor`, `PublishTransform`.
- **ForceMode**:

| ForceMode | Meaning |
|---|---|
| Force | Continuous, mass-dependent (N) |
| Acceleration | Continuous, mass-independent |
| Impulse | Instant, mass-dependent (N·s) |
| VelocityChange | Instant, mass-independent |

- **Kinematic** bodies are moved by script and push dynamic bodies without being affected themselves. A kinematic body can still get triggers and collisions against dynamic bodies. Kinematic–kinematic and kinematic–static contacts are reported only with the corresponding contact pairs mode.

### Colliders

- **Shapes**: `BoxCollider`, `SphereCollider`, `CapsuleCollider` (direction X/Y/Z), `MeshCollider`, `TerrainCollider`, `WheelCollider`, `CharacterController`.
  - A `MeshCollider` can be convex (max 255 triangles) or concave; concave mesh colliders can only be static or kinematic.
  - MeshCollider `cookingOptions` (`MeshColliderCookingOptions`): None, InflateConvexMesh, CookForFasterSimulation, EnableMeshCleaning, WeldColocatedVertices, UseFastMidphase. Use `Physics.BakeMesh` to cook off the main thread.
- **Common Collider members**: `isTrigger`, `providesContacts`, `sharedMaterial`/`material`, `contactOffset`, `bounds`, `includeLayers`/`excludeLayers`, `layerOverridePriority`, `attachedRigidbody`, `ClosestPoint`, `ClosestPointOnBounds`, `Raycast`.
- **Compound colliders**: child colliders under one Rigidbody form a single body.
- **Static colliders**: colliders without a Rigidbody. Moving them is supported, but costly in older versions.
- **PhysicsMaterial** (renamed from PhysicMaterial in Unity 6; both classes exist in the source): `dynamicFriction`, `staticFriction`, `bounciness`, `frictionCombine`/`bounceCombine` (`PhysicsMaterialCombine` Average, Multiply, Minimum, Maximum).

### Collision matrix (which callbacks fire)

| | Static collider | Rigidbody collider | Kinematic RB collider | Static trigger | Rigidbody trigger | Kinematic RB trigger |
|---|---|---|---|---|---|---|
| Static collider | – | collision | – | – | trigger | trigger |
| Rigidbody collider | collision | collision | collision | trigger | trigger | trigger |
| Kinematic RB collider | – | collision | – | trigger | trigger | trigger |
| Static trigger | – | trigger | trigger | – | trigger | trigger |
| Rigidbody trigger | trigger | trigger | trigger | trigger | trigger | trigger |
| Kinematic RB trigger | trigger | trigger | trigger | trigger | trigger | trigger |

`Collision` object contents: `gameObject`, `collider`, `rigidbody`, `relativeVelocity`, `impulse`, `contactCount`, `GetContact(i)` (`ContactPoint`: point, normal, separation, impulse, thisCollider, otherCollider), and `GetContacts(list)`.

### Scene queries (`Physics.*`)

- **Rays and lines**: `Raycast`, `RaycastAll`, `RaycastNonAlloc`, `Linecast`.
- **Shape casts**: `SphereCast`, `CapsuleCast` and `BoxCast`, each with `All` and `NonAlloc` variants.
- **Overlaps**: `OverlapSphere`, `OverlapCapsule` and `OverlapBox` (each with `NonAlloc`), plus `CheckSphere`, `CheckCapsule`, `CheckBox`.
- **Utilities**: `ComputePenetration`, `ClosestPoint`, `IgnoreCollision`, `IgnoreLayerCollision`, `GetIgnoreLayerCollision`.
- **Batch queries in jobs**: `RaycastCommand`, `SpherecastCommand`, `BoxcastCommand`, `CapsulecastCommand`, `OverlapSphereCommand`, `OverlapBoxCommand`, `OverlapCapsuleCommand`, `ClosestPointCommand`.
- **Filters and results**: `LayerMask` (`GetMask`, `NameToLayer`), `QueryParameters`, `RaycastHit` (point, normal, distance, collider, rigidbody, transform, triangleIndex, textureCoord, barycentricCoordinate, articulationBody).

```csharp
// Ground check + slope-aware movement (illustrative)
bool Grounded(out RaycastHit hit) =>
    Physics.SphereCast(transform.position + Vector3.up * 0.5f, 0.3f, Vector3.down, out hit, 0.6f,
                       groundMask, QueryTriggerInteraction.Ignore);

// Batched raycasts in a job
var cmds = new NativeArray<RaycastCommand>(n, Allocator.TempJob);
var hits = new NativeArray<RaycastHit>(n, Allocator.TempJob);
for (int i = 0; i < n; i++) cmds[i] = new RaycastCommand(origins[i], Vector3.down, QueryParameters.Default, 100f);
RaycastCommand.ScheduleBatch(cmds, hits, 32, 1).Complete();
```

### Joints

- **Joint (base)**: `connectedBody`/`connectedArticulationBody`, `anchor`/`connectedAnchor`, `autoConfigureConnectedAnchor`, `axis`, `breakForce`/`breakTorque` (→ `OnJointBreak`), `enableCollision`, `enablePreprocessing`, `massScale`/`connectedMassScale`, `currentForce`/`currentTorque`.
- **Joint types**:
  - `FixedJoint`.
  - `HingeJoint`: motor, limits, spring, `useMotor`/`useLimits`/`useSpring`, `angle`, `velocity`, `extendedLimits`.
  - `SpringJoint`: spring, damper, min/max distance, tolerance.
  - `CharacterJoint`: twist and swing limits for ragdolls. **Ragdoll wizard**: GameObject/3D Object/Ragdoll….
  - `ConfigurableJoint`:
    - X/Y/Z motion and angular motion (`ConfigurableJointMotion` Locked, Limited, Free).
    - Linear and angular limits with springs, and target position/velocity/rotation.
    - Drives: X/Y/Z, angular X/YZ, and Slerp (`RotationDriveMode` XYAndZ, Slerp).
    - Projection (`JointProjectionMode` None, PositionAndRotation, PositionOnly), `configuredInWorldSpace`, `swapBodies`.

### ArticulationBody (Featherstone reduced-coordinate articulations, for robotics)

- **Joint types** (`ArticulationJointType`): FixedJoint, PrismaticJoint, RevoluteJoint, SphericalJoint.
- **DOF lock** (`ArticulationDofLock`): LockedMotion, LimitedMotion, FreeMotion.
- **Drives** (`ArticulationDrive`): stiffness, damping, forceLimit, target, targetVelocity. `ArticulationDriveType`: Force, Acceleration, Target, Velocity.
- **Reduced-coordinate API**: `jointPosition`/`jointVelocity`/`jointForce` (`ArticulationReducedSpace`), `GetJointPositions`, `GetDenseJacobian`, `GetDriveForces`, and `inverse dynamics` (`GetJointGravityForces`, `GetJointCoriolisCentrifugalForces`).
- **Stability**: no drift or joint separation. Used by the Unity Robotics hub (URDF Importer).

### CharacterController

- **Properties**: `slopeLimit`, `stepOffset`, `skinWidth`, `minMoveDistance`, `center`, `radius`, `height`, `detectCollisions`, `enableOverlapRecovery`, `isGrounded`, `velocity`.
- **Movement**: `collisionFlags` (`CollisionFlags` None, Sides, Above, Below). `Move(motion)` returns CollisionFlags. `SimpleMove(speed)` applies gravity.
- **Callbacks**: `OnControllerColliderHit(ControllerColliderHit)`, used for pushing rigidbodies.
- It is kinematic and not physics-driven: there is no gravity or momentum unless you add them yourself.

```csharp
// Classic CharacterController motor (illustrative)
[RequireComponent(typeof(CharacterController))]
public class FpsMotor : MonoBehaviour {
    public float speed = 5, jumpHeight = 1.2f, gravity = -20f;
    CharacterController cc; Vector3 v;
    void Awake() => cc = GetComponent<CharacterController>();
    void Update() {
        if (cc.isGrounded && v.y < 0) v.y = -2f;
        var move = transform.right * Input.GetAxis("Horizontal") + transform.forward * Input.GetAxis("Vertical");
        cc.Move(move * speed * Time.deltaTime);
        if (cc.isGrounded && Input.GetButtonDown("Jump")) v.y = Mathf.Sqrt(jumpHeight * -2f * gravity);
        v.y += gravity * Time.deltaTime; cc.Move(v * Time.deltaTime);
    }
    void OnControllerColliderHit(ControllerColliderHit hit) {
        if (hit.rigidbody && !hit.rigidbody.isKinematic) hit.rigidbody.AddForce(hit.moveDirection * 2f, ForceMode.Impulse);
    }
}
```

### Other 3D physics features

- **WheelCollider** (Vehicles module):
  - Suspension: `suspensionDistance`, `suspensionSpring` (JointSpring), `forceAppPointDistance`.
  - Wheel: `mass`, `radius`, `wheelDampingRate`.
  - Tire friction: `forwardFriction`/`sidewaysFriction` (`WheelFrictionCurve`: extremumSlip/Value, asymptoteSlip/Value, stiffness).
  - Control: `motorTorque`, `brakeTorque`, `steerAngle`, `rpm`.
  - Queries: `GetGroundHit(out WheelHit)`, `GetWorldPose`, `ConfigureVehicleSubsteps`.
- **ConstantForce**: force, relativeForce, torque, relativeTorque.
- **Cloth** (Cloth module; PhysX cloth, deprecated in favour of alternatives):
  - Constraints per vertex: max distance and surface penetration, edited with the paint tool.
  - Stiffness: stretching and bending.
  - Damping, external/random acceleration, world velocity/acceleration scale, friction.
  - Sphere and capsule colliders (including sphere pairs as conic capsules).
  - Self-collision and inter-collision, virtual particles, tethers, and `useGravity`.
- **Physics Debugger**: collider/contact/query visualization, filtering, and the 6.x Queries tab.
- **Terrain physics**: TerrainPhysics module (`TerrainCollider`, trees as colliders).

## 2. 2D physics (Box2D)

- **Box2D versions**:
  - Unity 6.3 integrated **Box2D v3**, with a new low-level API: the `PhysicsCore2D` module, namespace `Unity.U2D.Physics`.
  - The low-level API is multithreaded, deterministic, and uses a handle-based world/body/shape model.
  - The classic component API (Rigidbody2D and friends, Box2D v2 semantics) still exists.
- **Rigidbody2D**:
  - `bodyType` (`RigidbodyType2D` Dynamic, Kinematic, Static).
  - `simulated`, `useAutoMass`, `mass`, `linearDamping`/`angularDamping`, `gravityScale`.
  - `collisionDetectionMode` (`CollisionDetectionMode2D` Discrete, Continuous), `sleepMode` (NeverSleep, StartAwake, StartAsleep), `interpolation` (None, Interpolate, Extrapolate), constraints (FreezePositionX/Y, FreezeRotation).
  - `useFullKinematicContacts`, `includeLayers`/`excludeLayers`.
  - Methods: `AddForce(f, ForceMode2D.Force|Impulse)`, `AddTorque`, `AddForceAtPosition`, `MovePosition`, `MoveRotation`, `MovePositionAndRotation`, `Slide` (a kinematic character helper), `Cast`, `Overlap`, `IsTouching`, `GetContacts`, `Distance`.
- **Collider2D**:
  - Shapes: Box, Circle, Capsule, Polygon, Edge, **Composite** (merges children, with outline or polygon geometry), **Custom** (`PhysicsShapeGroup2D`), and **TilemapCollider2D**.
  - Members: `isTrigger`, `usedByEffector`, `compositeOperation` (None, Merge, Intersect, Difference, Flip), `offset`, `edgeRadius`, `density`, `sharedMaterial` (`PhysicsMaterial2D` friction and bounciness), and contact capture/callback layers.
- **Joints 2D**:
  - Anchored joints: Distance, Fixed, Friction, Hinge (motor, limits), Slider, Spring, Wheel (suspension and motor).
  - Relative and Target joints.
  - `JointLimitState2D` values: Inactive, LowerLimit, UpperLimit, EqualLimits.
- **Effectors 2D** (`EffectorSelection2D`: Rigidbody or Collider):
  - **Area**: force angle and magnitude, variation, drag.
  - **Buoyancy**: surface level, density, flow.
  - **Platform**: one-way platforms, surface arc, side friction and bounce.
  - **Point**: attract or repel, with `EffectorForceMode2D` Constant, InverseLinear, InverseSquared.
  - **Surface**: conveyor belts.
- **ConstantForce2D**.
- **Physics2D settings**: gravity, velocity/position iterations, velocity threshold, max linear correction, max translation/rotation speed, baumgarte scale (and TOI), time to sleep, linear/angular sleep tolerance, default contact offset, **simulation mode** (`SimulationMode2D` FixedUpdate, Update, Script), **multithreading** (job options), auto sync transforms, queries hit triggers, queries start in colliders, callbacks on disable, reuse collision callbacks, and the layer collision matrix.
- **Queries**: `Physics2D.Raycast`, `Linecast`, `CircleCast`, `BoxCast`, `CapsuleCast`, `OverlapPoint/Circle/Box/Area/Capsule/Collider`, `GetRayIntersection` (3D ray against 2D), and `ContactFilter2D`.

**Low-level Box2D v3 API.** Verbatim from the doc example in `UnityCsReference/Modules/PhysicsCore2D/Scripting/PhysicsBody.cs`:

```csharp
// Create a body, then attach a circle shape to it.
using UnityEngine;
using Unity.U2D.Physics;

public class CreateWorldAndObjects : MonoBehaviour
{
    // Declare definitions that contain default properties for the body and shape.
    public PhysicsBodyDefinition bodyDefinition = PhysicsBodyDefinition.defaultDefinition;
    public PhysicsShapeDefinition shapeDefinition = PhysicsShapeDefinition.defaultDefinition;

    void Start()
    {
        // Get the default world.
        PhysicsWorld world = PhysicsWorld.defaultWorld;
        // Create the physics body with the body definition.
        PhysicsBody myObject = world.CreateBody(bodyDefinition);
        // Create the circle geometry.
        CircleGeometry circleGeometry = new CircleGeometry { radius = 1.5f };
        // Create the shape with both the geometry and the shape definition.
        myObject.CreateShape(circleGeometry, shapeDefinition);
    }
}
```

## 3. DOTS physics

- **Unity Physics** (`com.unity.physics`):
  - A stateless, deterministic, Burst-compiled C# physics engine for Entities.
  - Features: `PhysicsBody`/`PhysicsShape` authoring, collision filters, `CollisionWorld` queries, custom jacobians and modifiers, and `ISimulationEventsJob` (collision and trigger events).
  - Supports rollback in Netcode for Entities.
- **Havok Physics for Unity**: the same data format as Unity Physics, but stateful and cached for stacking stability.
