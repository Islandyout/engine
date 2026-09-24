# 06 — Animation

Manual: <https://docs.unity3d.com/Manual/AnimationSection.html> · Timeline: <https://docs.unity3d.com/Packages/com.unity.timeline@1.8/manual/index.html>

## 1. Animation clips and the Animation window

- **`AnimationClip`**:
  - Curves bind to any serialized property, such as Transform position/rotation/scale, material properties (`material._Color`), component fields, blend shape weights, and sprites (object reference curves).
  - Clip settings: `frameRate`, `length`, `wrapMode` (`WrapMode` Once, Loop, PingPong, ClampForever, Default), `legacy`.
  - **AnimationEvents**: a function name with a float, int, string or Object parameter, fired at a time. Received by any MonoBehaviour method on the Animator's GameObject.
  - Clip settings from import: loop time, loop pose, cycle offset, root transform rotation/position (Y and XZ): bake into pose, based upon (Original, Root Node Rotation, Center of Mass, Feet), offset, mirror, additive reference pose, curves, masks, events, and motion node.
- **Animation window** (Window/Animation/Animation):
  - Record mode, preview mode, and keyframe add/delete/copy/paste.
  - **Dopesheet** and **Curves** views, with tangent modes: Clamped Auto, Auto, Free Smooth, Flat, Broken, Left/Right Tangent Linear/Constant/Weighted.
  - Sample rate, clip selection, Add Property, event markers, and key reduction.
  - Rotation interpolation: Euler, Euler (Quaternion) or Quaternion.
- **Model import › Animation tab**: import animation, bake animations (IK/simulation), resample curves, anim compression (`ModelImporterAnimationCompression` Off, KeyframeReduction, KeyframeReductionAndCompression, Optimal) with rotation/position/scale error, import constraints, import animated custom properties, and clip splitting by frame range.
- **Legacy `Animation` component**: `Play`, `CrossFade`, `Blend`, `AnimationState` (weight, speed, time, layer, blendMode Blend/Additive, `AddMixingTransform`).

## 2. Rig import (Mecanim avatars)

- **Animation type** (`ModelImporterAnimationType`): None, Legacy, Generic, Humanoid (Human).
- **Avatar**:
  - Created from the model or copied from another avatar.
  - **Avatar Configuration**: bone mapping to `HumanBodyBones` with 15 required bones and 55 bones in total (see the list below), plus a T-pose enforce tool.
  - **Muscles and Settings**: muscle ranges and a preview, plus translation DoF.
- **Humanoid retargeting**: animations authored for any humanoid avatar play on any other. The engine stores muscle-space curves.
- **Avatar Mask**:
  - Humanoid body parts (`AvatarMaskBodyPart`): Root, Body, Head, LeftLeg, RightLeg, LeftArm, RightArm, LeftFingers, RightFingers, LeftFootIK, RightFootIK, LeftHandIK, RightHandIK.
  - Transform mask (generic).
- **Optimize Game Objects**: strips the Transform hierarchy and exposes only the bones you list, which gives faster skinning.

`HumanBodyBones`, taken verbatim from the source:
Hips, LeftUpperLeg, RightUpperLeg, LeftLowerLeg, RightLowerLeg, LeftFoot, RightFoot, Spine, Chest, UpperChest, Neck, Head, LeftShoulder, RightShoulder, LeftUpperArm, RightUpperArm, LeftLowerArm, RightLowerArm, LeftHand, RightHand, LeftToes, RightToes, LeftEye, RightEye, Jaw, then 30 finger bones (Thumb, Index, Middle, Ring and Little; Proximal, Intermediate and Distal; for each hand), then LastBone.

## 3. Animator and Animator Controller (Mecanim)

- **`Animator` component**: `runtimeAnimatorController`, `avatar`, `applyRootMotion`, `updateMode`, `cullingMode`, `speed`, `keepAnimatorStateOnDisable`, `writeDefaultValuesOnDisable`, `fireEvents`, and `stabilizeFeet`.
  - `updateMode` (`AnimatorUpdateMode`): Normal, Fixed, UnscaledTime, AnimatePhysics.
  - `cullingMode` (`AnimatorCullingMode`): AlwaysAnimate, CullUpdateTransforms, CullCompletely.
- **Animator Controller asset**:
  - **Parameters** (`AnimatorControllerParameterType`): Float, Int, Bool, Trigger.
  - **Layers**: weight, **blending** (`AnimatorLayerBlendingMode` Override, Additive), Avatar Mask, **Sync** (reuse another layer's state machine with different clips, optionally timing), and IK Pass.
  - **State machines**: states, **sub-state machines**, Entry/Exit/Any State nodes, default state, and **StateMachineBehaviour** scripts (OnStateEnter, OnStateUpdate, OnStateExit, OnStateMove, OnStateIK, OnStateMachineEnter, OnStateMachineExit).
  - **States**: motion (clip or blend tree), speed plus a speed multiplier parameter, motion time parameter, mirror, cycle offset, foot IK, write defaults, tag.
  - **Transitions**: Has Exit Time plus Exit Time, Fixed Duration, Transition Duration, Transition Offset, **Interruption Source** (None, Current State, Next State, Current then Next, Next then Current), Ordered Interruption, and **Conditions** (Greater, Less, Equals, NotEqual, If, IfNot). Transitions can be solo or muted.
- **Blend Trees**:
  - Types: **1D**, **2D Simple Directional**, **2D Freeform Directional**, **2D Freeform Cartesian**, **Direct**.
  - Settings: automatic thresholds, compute positions (from velocity or speed), time scale, adjust time scale (homogeneous speed), and mirror.
  - Blend trees can be nested.
- **Animator Override Controller**: swaps clips while keeping the state machine.
- **Scripting**:
  - Parameters: `SetFloat(id, value, dampTime, deltaTime)`, `SetInteger`, `SetBool`, `SetTrigger`/`ResetTrigger`, `Animator.StringToHash`.
  - State control: `Play`, `CrossFade`, `CrossFadeInFixedTime`, `GetCurrentAnimatorStateInfo(layer)` (`IsName`, `normalizedTime`, `shortNameHash`, `tagHash`, `length`, `loop`), `GetNextAnimatorStateInfo`, `IsInTransition`, `GetAnimatorTransitionInfo`, `GetCurrentAnimatorClipInfo`, `SetLayerWeight`.
  - Utilities: `Rebind`, `Update(dt)` (manual), `MatchTarget(pos, rot, AvatarTarget, MatchTargetWeightMask, start, end)`, `GetBoneTransform(HumanBodyBones)`.
  - Root motion data: `deltaPosition`, `deltaRotation`, `velocity`, `bodyPosition`, `rootPosition`.

```csharp
// Locomotion driving a 2D Freeform blend tree + root motion via OnAnimatorMove (illustrative)
public class Locomotion : MonoBehaviour {
    static readonly int SpeedX = Animator.StringToHash("SpeedX"), SpeedZ = Animator.StringToHash("SpeedZ"), Jump = Animator.StringToHash("Jump");
    Animator anim; CharacterController cc;
    void Awake() { anim = GetComponent<Animator>(); cc = GetComponent<CharacterController>(); }
    void Update() {
        anim.SetFloat(SpeedX, Input.GetAxis("Horizontal"), 0.1f, Time.deltaTime);   // damped
        anim.SetFloat(SpeedZ, Input.GetAxis("Vertical"),   0.1f, Time.deltaTime);
        if (Input.GetButtonDown("Jump")) anim.SetTrigger(Jump);
    }
    void OnAnimatorMove() {                       // take over root motion
        cc.Move(anim.deltaPosition + Physics.gravity * Time.deltaTime);
        transform.rotation *= anim.deltaRotation;
    }
}
```

## 4. Inverse kinematics and root motion

- **Built-in humanoid IK**:
  - Goals and hints: `SetIKPositionWeight`/`SetIKRotationWeight`/`SetIKPosition`/`SetIKRotation` on `AvatarIKGoal` (LeftFoot, RightFoot, LeftHand, RightHand), `SetIKHintPosition` on `AvatarIKHint` (LeftKnee, RightKnee, LeftElbow, RightElbow).
  - Look-at: `SetLookAtPosition`/`SetLookAtWeight(weight, body, head, eyes, clamp)`.
  - Called in `OnAnimatorIK(layer)` when the layer's IK Pass is enabled.
- **Root motion**: `applyRootMotion`. Root transform is baked or extracted per clip, and you can override it with `OnAnimatorMove`. Humanoid rigs use body-center motion (center of mass).
- **Animation Rigging package** (`com.unity.animation.rigging`):
  - Setup components: `RigBuilder`, `Rig` (weight), and constraints.
  - Constraints: Two Bone IK, Multi-Aim, Multi-Parent, Multi-Position, Multi-Rotation, Multi-Referential, Chain IK, Damped Transform, Override Transform, Blend, Twist Chain, Twist Correction.
  - Bone Renderer. Rigs can be baked to clips.
  - Custom constraints through `IAnimationJob`.

## 5. Constraints (built-in components)

- **Constraint types**: `AimConstraint`, `LookAtConstraint`, `ParentConstraint`, `PositionConstraint`, `RotationConstraint`, `ScaleConstraint`.
- **Settings**: `constraintActive`, `weight`, `locked`, sources (`ConstraintSource` transform plus weight), at-rest values, offsets, and freeze axes (`Axis` flags).
- **Aim-specific**: aim vector, up vector, world up type (Scene Up, Object Up, Object Rotation Up, Vector, None).

## 6. Playables API

- **Graph**: `PlayableGraph` (Create, Play, Stop, Evaluate, Destroy, time update mode) with `IPlayable` nodes and outputs.
- **Playables**: `AnimationClipPlayable`, `AnimationMixerPlayable`, `AnimationLayerMixerPlayable`, `AnimatorControllerPlayable`, `AnimationScriptPlayable` (for `IAnimationJob`/`AnimationStream`), `AudioClipPlayable`, `AudioMixerPlayable`, and `ScriptPlayable<T>` with `PlayableBehaviour`.
- **Outputs**: `AnimationPlayableOutput`, `AudioPlayableOutput`, `ScriptPlayableOutput`, `TexturePlayableOutput`.
- **Director**:
  - Update mode (`DirectorUpdateMode`): DSPClock, GameTime, UnscaledGameTime, Manual.
  - `PlayState`: Paused, Playing, Delayed.
- **PlayableGraph Visualizer** is a tool for inspecting graphs.

```csharp
// Blend two clips with Playables (illustrative)
using UnityEngine; using UnityEngine.Animations; using UnityEngine.Playables;
public class TwoClipBlend : MonoBehaviour {
    public AnimationClip a, b; [Range(0,1)] public float t;
    PlayableGraph g; AnimationMixerPlayable mix;
    void Start() {
        g = PlayableGraph.Create("Blend"); g.SetTimeUpdateMode(DirectorUpdateMode.GameTime);
        var output = AnimationPlayableOutput.Create(g, "Anim", GetComponent<Animator>());
        mix = AnimationMixerPlayable.Create(g, 2);
        g.Connect(AnimationClipPlayable.Create(g, a), 0, mix, 0);
        g.Connect(AnimationClipPlayable.Create(g, b), 0, mix, 1);
        output.SetSourcePlayable(mix); g.Play();
    }
    void Update() { mix.SetInputWeight(0, 1 - t); mix.SetInputWeight(1, t); }
    void OnDestroy() => g.Destroy();
}
```

## 7. Timeline (`com.unity.timeline`; TimelineFoundation module)

- **Assets and components**: a `TimelineAsset` is played by a `PlayableDirector` component. Director settings: `playOnAwake`, wrap mode (`DirectorWrapMode` Hold, Loop, None), update method, initial time, and bindings.
- **Tracks**: Animation (with override tracks and avatar masks, infinite clips and recording, match offsets, clip ease-in/out, blend curves, root motion offsets), Activation, Audio, Control (sub-timelines, particle systems, prefabs, `ITimeControl`), **Signal** (Signal Asset → `SignalReceiver` reactions), Playable (custom), Group, Marker, **Cinemachine** (see 11), and **Visual Effect** (6.x).
- **Clip features**: blending by overlap, clip in, speed multiplier, extrapolation (None, Hold, Loop, Ping Pong, Continue), ease-in/ease-out, and mix-in/mix-out curves.
- **Timeline modes**: Local and Global (nested timelines), and Preview.
- **Custom tracks and clips**: `TrackAsset` + `PlayableAsset` + `PlayableBehaviour` (+ mixer). Attributes: `[TrackClipType]`, `[TrackBindingType]`, `[TrackColor]`. Custom markers use `IMarker`/`INotification`.
- **Recorder**, **Sequences** (Cinematic Studio) and **Unity Recorder** Timeline track.

## 8. Other animation features

- **Blend shapes (morph targets)**: `SkinnedMeshRenderer.SetBlendShapeWeight(index, 0..100)`. Blend shapes can be animated in clips and can have multiple frames per shape.
- **Sprite animation**: sprite object-reference curves, and **2D Animation** skeletal animation (see 10).
- **Mesh deformation**: GPU skinning (compute or linear blend), `SkinnedMeshRenderer.vertexBufferTarget`, and the Shader Graph Linear Blend Skinning and Compute Deformation nodes.
- **Kinematica and Motion Matching**: experimental in the past. Third-party solutions exist, such as Motion Matching for Unity.
- **UI Toolkit animation**: USS transitions and the UI Animation Clip asset (6.x, Assets/Create/UI Toolkit/UI Animation Clip).
- **Tweening**: none built in (DOTween and others are third-party). Use `Mathf.SmoothDamp`, `AnimationCurve.Evaluate`, or Awaitable loops.
