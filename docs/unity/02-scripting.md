# 02 — Core scripting and runtime model

Manual: <https://docs.unity3d.com/Manual/scripting.html> · Execution order: <https://docs.unity3d.com/Manual/execution-order.html> · API: <https://docs.unity3d.com/ScriptReference/MonoBehaviour.html>

## 1. Object model

- **`UnityEngine.Object`**: the base of everything the engine serializes or owns.
  - It has a native counterpart. `==` is overloaded, so a destroyed object compares equal to `null` (the "fake null").
  - Members: `name`, `hideFlags`, `GetInstanceID()` / `GetEntityId()` (6.x), `Instantiate`, `Destroy(obj, t)`, `DestroyImmediate`, `DontDestroyOnLoad`, `FindObjectsByType<T>(FindObjectsSortMode)`, `FindFirstObjectByType`, `FindAnyObjectByType`.
- **GameObject**:
  - A container with exactly one `Transform` (or a `RectTransform`).
  - Fields: `activeSelf`/`activeInHierarchy`, `SetActive`, `tag`/`CompareTag`, `layer` (0–31), `scene`, `isStatic` + `StaticEditorFlags`.
  - Static flags: ContributeGI, OccluderStatic, OccludeeStatic, BatchingStatic, NavigationStatic (legacy), OffMeshLinkGeneration, ReflectionProbeStatic.
  - Component methods: `AddComponent<T>`, `GetComponent<T>`, `TryGetComponent`, `GetComponentInChildren/InParent/s`.
  - Messaging: `SendMessage`/`BroadcastMessage`/`SendMessageUpwards` (the `SendMessageOptions` values are RequireReceiver and DontRequireReceiver).
  - `GameObject.Find`, `FindWithTag`, `FindGameObjectsWithTag`, `CreatePrimitive(PrimitiveType)`. The `PrimitiveType` values are Sphere, Capsule, Cylinder, Cube, Plane and Quad.
- **Transform**:
  - Position/rotation/scale: `position`/`localPosition`, `rotation`/`localRotation` (Quaternion), `eulerAngles`, `localScale`/`lossyScale`.
  - Hierarchy: `parent`, `SetParent(p, worldPositionStays)`, `GetChild`, `childCount`, `SetSiblingIndex`, `root`.
  - Directions and matrices: `forward`/`right`/`up`, `localToWorldMatrix`.
  - Movement: `TransformPoint`/`Direction`/`Vector` and their inverses, `Translate(v, Space)`, `Rotate`, `RotateAround`, `LookAt`, `SetPositionAndRotation`, `GetPositionAndRotation`.
  - Change tracking: `hasChanged`. For Jobs: `TransformAccessArray`. `Space` is World or Self.
- **Components**: a behaviour is updated only when it is **enabled** and its GameObject is **active in the hierarchy**. `[RequireComponent]` adds dependencies. `[DisallowMultipleComponent]` allows one per object.

## 2. MonoBehaviour lifecycle

The full ordered loop (from Unity's execution-order page):

```
 Scene load / Instantiate
   Awake ─► OnEnable ─► (editor only: Reset on add, OnValidate on change)
   [RuntimeInitializeOnLoadMethod: SubsystemRegistration → AfterAssembliesLoaded → BeforeSplashScreen → BeforeSceneLoad → AfterSceneLoad]
 Before first frame
   Start                                   (once, before the first Update the script is enabled for)
 ┌──────────── Physics loop (0..n times per frame, every Time.fixedDeltaTime) ─────────┐
 │ FixedUpdate ─► internal animation update (AnimatePhysics) ─► internal physics sim    │
 │ ─► OnTriggerXXX ─► OnCollisionXXX ─► yield WaitForFixedUpdate                        │
 └──────────────────────────────────────────────────────────────────────────────────────┘
 Input events (OnMouseXXX)
 Game logic
   Update ─► yield null / WaitForSeconds / WWW / StartCoroutine continuations
   ─► internal animation update: state machine ─► OnAnimatorMove ─► OnAnimatorIK ─► write transforms
   LateUpdate
 Scene rendering
   OnWillRenderObject, OnPreCull, OnBecameVisible/Invisible, OnPreRender, OnRenderObject, OnPostRender,
   OnRenderImage (Built-in RP only)
 Gizmo rendering (editor): OnDrawGizmos / OnDrawGizmosSelected
 GUI rendering: OnGUI (possibly several times per frame)
 End of frame: yield WaitForEndOfFrame
 Pausing: OnApplicationPause / OnApplicationFocus
 Decommissioning: OnApplicationQuit ─► OnDisable ─► OnDestroy
```

SRPs replace the camera callbacks with `RenderPipelineManager.beginContextRendering`/`beginCameraRendering`/`endCameraRendering`/`endContextRendering`.

### Every MonoBehaviour message

The list below was extracted from `ProjectAuditorEditor/CodeAnalysis/MonoBehaviourAnalysis.cs` plus the documented editor/UI messages.

| Group | Messages |
|---|---|
| Lifecycle | Awake, OnEnable, Start, FixedUpdate, Update, LateUpdate, OnDisable, OnDestroy, Reset (editor), OnValidate (editor) |
| Application | OnApplicationFocus(bool), OnApplicationPause(bool), OnApplicationQuit, OnLevelWasLoaded (obsolete) |
| 3D physics | OnCollisionEnter/Stay/Exit(Collision), OnTriggerEnter/Stay/Exit(Collider), OnControllerColliderHit(ControllerColliderHit), OnJointBreak(float) |
| 2D physics | OnCollisionEnter2D/Stay2D/Exit2D(Collision2D), OnTriggerEnter2D/Stay2D/Exit2D(Collider2D), OnJointBreak2D(Joint2D) |
| Particles | OnParticleCollision(GameObject), OnParticleTrigger, OnParticleSystemStopped, OnParticleUpdateJobScheduled |
| Animation | OnAnimatorMove, OnAnimatorIK(int layerIndex) |
| Rendering | OnBecameVisible, OnBecameInvisible, OnWillRenderObject, OnPreCull, OnPreRender, OnPostRender, OnRenderObject, OnRenderImage(src,dst) |
| Transform | OnTransformParentChanged, OnTransformChildrenChanged, OnBeforeTransformParentChanged |
| RectTransform/UI | OnRectTransformDimensionsChange, OnRectTransformRemoved, OnChildRectTransformDimensionsChange, OnCanvasGroupChanged, OnCanvasHierarchyChanged |
| Mouse (legacy input) | OnMouseDown, OnMouseUp, OnMouseUpAsButton, OnMouseDrag, OnMouseEnter, OnMouseOver, OnMouseExit |
| Audio | OnAudioFilterRead(float[] data, int channels) (runs on the audio thread) |
| Terrain | OnTerrainChanged(TerrainChangedFlags) |
| Editor | OnDrawGizmos, OnDrawGizmosSelected, OnGUI (IMGUI) |
| Networking (legacy, removed) | OnServerInitialized, OnConnectedToServer, … |

```csharp
// Canonical MonoBehaviour (illustrative)
using UnityEngine;

[RequireComponent(typeof(Rigidbody))]
[DisallowMultipleComponent]
public class PlayerMover : MonoBehaviour
{
    [SerializeField, Range(0, 20)] float speed = 6f;
    [SerializeField] LayerMask groundMask;
    [Header("Jump"), Tooltip("Impulse applied on jump")]
    [SerializeField, Min(0)] float jumpImpulse = 5f;

    Rigidbody rb;
    Vector3 input;

    void Awake()      => rb = GetComponent<Rigidbody>();     // references to self
    void OnEnable()   { /* subscribe events */ }
    void Start()      { /* references to other objects */ }
    void Update()     => input = new Vector3(Input.GetAxisRaw("Horizontal"), 0, Input.GetAxisRaw("Vertical"));
    void FixedUpdate()
    {
        rb.linearVelocity = new Vector3(input.x * speed, rb.linearVelocity.y, input.z * speed); // Unity 6 name
        if (Input.GetButton("Jump") && Physics.Raycast(transform.position, Vector3.down, 1.1f, groundMask))
            rb.AddForce(Vector3.up * jumpImpulse, ForceMode.Impulse);
    }
    void OnCollisionEnter(Collision c) => Debug.Log($"Hit {c.gameObject.name} at {c.GetContact(0).point}");
    void OnDisable()  { /* unsubscribe */ }
}
```

- **Script Execution Order**: set it in Project Settings or with `[DefaultExecutionOrder(-100)]`.
- **Time API** (`Time`): `deltaTime`, `unscaledDeltaTime`, `fixedDeltaTime`, `fixedUnscaledDeltaTime`, `time`, `timeAsDouble`, `unscaledTime`, `realtimeSinceStartup(AsDouble)`, `timeScale`, `frameCount`, `maximumDeltaTime`, `maximumParticleDeltaTime`, `smoothDeltaTime`, `captureDeltaTime`/`captureFramerate`, `inFixedTimeStep`, `timeSinceLevelLoad`.
- **Frame rate**: `Application.targetFrameRate` and `QualitySettings.vSyncCount`. `OnDemandRendering.renderFrameInterval` renders only every N frames.

## 3. Coroutines and async

- **Coroutines**:
  - Start: `StartCoroutine(IEnumerator)`. Stop: `StopCoroutine`/`StopAllCoroutines`.
  - Yield instructions: `null` (next frame), `WaitForSeconds`, `WaitForSecondsRealtime`, `WaitForFixedUpdate`, `WaitForEndOfFrame`, `WaitUntil`, `WaitWhile`, `AsyncOperation`, another coroutine, and `CustomYieldInstruction`.
  - A coroutine stops when its GameObject is deactivated or destroyed.
- **`Awaitable`** (2023.1+/6.x; these methods were verified in `Runtime/Export/Scripting/Awaitable*.cs`):
  - `Awaitable.NextFrameAsync()`, `WaitForSecondsAsync(s)`, `FixedUpdateAsync()`, `EndOfFrameAsync()`.
  - `BackgroundThreadAsync()` / `MainThreadAsync()` switch threads.
  - `FromAsyncOperation(op)`.
  - `Awaitable<T>` with `AwaitableCompletionSource<T>`.
  - Cancellation through `destroyCancellationToken` / `Application.exitCancellationToken`.
- **`async void Start()`** is supported. Unity's `UnitySynchronizationContext` returns continuations to the main thread.
- **Unity API rule**: most `UnityEngine` APIs are main-thread-only. Use the Job System for parallel work (see 12).

```csharp
// Awaitable (illustrative)
async Awaitable SpawnWaves(CancellationToken ct) {
    for (int wave = 0; wave < 5; wave++) {
        for (int i = 0; i < wave * 3; i++) { Instantiate(enemyPrefab, RandomPoint(), Quaternion.identity); await Awaitable.WaitForSecondsAsync(0.25f, ct); }
        await Awaitable.WaitForSecondsAsync(10f, ct);
    }
}
async Awaitable<Texture2D> DecodeOffMainThread(byte[] data) {
    await Awaitable.BackgroundThreadAsync();   // heavy CPU work here
    var pixels = MyDecoder.Decode(data);
    await Awaitable.MainThreadAsync();         // back to main thread for Unity API
    var tex = new Texture2D(pixels.w, pixels.h); tex.SetPixelData(pixels.bytes, 0); tex.Apply(); return tex;
}
```

## 4. Serialization

Manual: <https://docs.unity3d.com/Manual/script-serialization.html>

- **What serializes**:
  - Public fields and `[SerializeField]` private fields, when they are not static, const or readonly.
  - Types: primitives, enums, strings, Unity built-ins (Vector*, Color, Rect, AnimationCurve, Gradient, LayerMask, Bounds…).
  - `UnityEngine.Object` references (serialized as references).
  - `[Serializable]` plain classes and structs (serialized inline, by value).
  - `T[]` and `List<T>`.
  - **Dictionary**: natively serialized **from 6.6**.
- **`[SerializeReference]`** stores polymorphic managed references and supports null and shared references.
- **Not serialized**: properties (except `[field: SerializeField]` auto-property backing fields), multidimensional/jagged arrays, nested lists, and generic types before 2020.1.
- **Callbacks**: `ISerializationCallbackReceiver.OnBeforeSerialize`/`OnAfterDeserialize`.
- **Formats**: YAML text (Force Text), binary, and JSON through `JsonUtility.ToJson`/`FromJson`/`FromJsonOverwrite` and `EditorJsonUtility`. The `Unity.Serialization` / `Properties` modules power UI Toolkit data binding.
- **Hot-reload**: domain reload serializes and deserializes all script state.

### Inspector attributes

- **Layout and decoration**: `[Header]`, `[Tooltip]`, `[Space]`, `[Range(min,max)]`, `[Min]`, `[Multiline]`, `[TextArea(min,max)]`, `[ColorUsage(showAlpha, hdr)]`, `[GradientUsage(hdr)]`, `[HideInInspector]`, `[InspectorName]` (on enum values), `[Delayed]`.
- **Serialization control**: `[FormerlySerializedAs("old")]`, `[NonSerialized]`, `[SerializeField]`, `[SerializeReference]`.
- **Menus**: `[ContextMenu("Do")]`, `[ContextMenuItem("Reset","ResetField")]`, `[AddComponentMenu("Path/Name")]`, `[CreateAssetMenu(fileName, menuName, order)]`.
- **Behaviour**: `[ExecuteInEditMode]`/`[ExecuteAlways]`, `[SelectionBase]`, `[HelpURL]`, `[Icon]`, `[DefaultExecutionOrder]`, `[RequireComponent]`, `[DisallowMultipleComponent]`, `[RuntimeInitializeOnLoadMethod]`, `[PreferBinarySerialization]`.

## 5. ScriptableObject

- A data container asset, created with `[CreateAssetMenu]` or `ScriptableObject.CreateInstance<T>()`.
- Messages it receives: `Awake`, `OnEnable`, `OnDisable`, `OnDestroy`, `OnValidate`, `Reset`.
- **Common patterns**: shared config, event channels, runtime sets, enum-like definitions, plugable AI.
- **Persistence**: changes made in Play Mode persist in the editor because they modify the asset, but they do not persist in builds.

```csharp
[CreateAssetMenu(menuName = "Game/Weapon")]
public class WeaponDef : ScriptableObject {
    public string displayName; public int damage = 10; public float cooldown = 0.5f; public GameObject projectile;
}
```

## 6. Events and messaging

- **`UnityEvent`**, `UnityEvent<T0..T3>`: serialized, inspector-wired callbacks. They support persistent and runtime listeners (`AddListener`) and dynamic/static parameters.
- **C# events** and `System.Action`. `SendMessage` is slow and string-based.
- **`ExecuteEvents`**: the uGUI EventSystem interfaces (see 08).

## 7. Scenes and loading

- **`SceneManager`**:
  - Loading: `LoadScene(name|index, LoadSceneMode.Single|Additive)`, `LoadSceneAsync` (returns an `AsyncOperation` with `progress`, `allowSceneActivation` and `priority`), `UnloadSceneAsync`.
  - Queries: `GetActiveScene`, `SetActiveScene`, `GetSceneByName`, `sceneCount`.
  - Other: `MoveGameObjectToScene`, `CreateScene`, `MergeScenes`.
  - Events: `sceneLoaded`, `sceneUnloaded`, `activeSceneChanged`.
- **`LoadSceneParameters`** includes `LocalPhysicsMode` (Physics3D/Physics2D), which gives a scene its own physics world through `PhysicsScene`/`PhysicsScene2D`.
- **`DontDestroyOnLoad`** moves an object into a special scene.
- **Resources**: `Resources.Load<T>(path)`, `LoadAsync`, `UnloadUnusedAssets`, `UnloadAsset`. Discouraged; use Addressables instead (see 14).
- **`PlayerPrefs`**: key-value storage with `SetInt`/`SetFloat`/`SetString`, `Get*`, `HasKey`, `DeleteKey`, `Save`.
- **`Application`**: `persistentDataPath`, `dataPath`, `streamingAssetsPath`, `temporaryCachePath`, `platform`, `isEditor`, `isPlaying`, `version`, `Quit`, `OpenURL`, `runInBackground`, `logMessageReceived(Threaded)`, `lowMemory`, `focusChanged`, `quitting`, `wantsToQuit`, `unloading`.

## 8. Math and utilities

- **Vectors and colors**: `Vector2/3/4`, `Vector2Int/3Int`, `Color`/`Color32`, `Rect`/`RectInt`, `Bounds`/`BoundsInt`, `Plane`, `Ray`/`Ray2D`, `Matrix4x4` (TRS, Perspective, Ortho, LookAt), `Quaternion`.
- **Quaternion methods**: Euler, AngleAxis, LookRotation, FromToRotation, Slerp, Lerp, RotateTowards, Inverse, Angle, identity; multiplying by a vector rotates it.
- **`Mathf`**: Lerp/LerpUnclamped/InverseLerp, SmoothDamp, SmoothDampAngle, SmoothStep, MoveTowards, MoveTowardsAngle, DeltaAngle, Clamp/Clamp01, Repeat, PingPong, Approximately, PerlinNoise, PerlinNoise1D, Sign, CeilToInt/FloorToInt/RoundToInt, Pow, Log, Exp, Sqrt, trig functions, Deg2Rad/Rad2Deg, Epsilon, Infinity, NextPowerOfTwo, IsPowerOfTwo, ClosestPowerOfTwo, GammaToLinearSpace, LinearToGammaSpace, CorrelatedColorTemperatureToRGB.
- **`Random`**: `value`, `Range(int|float)`, `insideUnitSphere`, `insideUnitCircle`, `onUnitSphere`, `rotation`, `rotationUniform`, `ColorHSV`, `InitState`, `state`. **Unity.Mathematics** adds `Random` (xorshift, Burst-friendly) and `noise` (snoise, cnoise, cellular, psrdnoise).
- **Curves and gradients**: `AnimationCurve` (Evaluate, keys with tangent modes, WrapMode) and `Gradient` (Evaluate, color and alpha keys, `GradientMode` Blend/Fixed/PerceptualBlend).
- **`Debug`**: Log/LogWarning/LogError/LogException/LogAssertion/LogFormat, DrawLine/DrawRay (Scene view), Break, `isDebugBuild`, `Assert`. **`Debug.Log`** supports rich text, and `Debug.unityLogger` accepts a custom `ILogHandler`. `LogType` values: Error, Assert, Warning, Log, Exception.
- **Compile-time checks**: `Assertions.Assert`, `[Conditional]`.
- **Platform `#define`s**: `UNITY_EDITOR`, `UNITY_STANDALONE_WIN`, `UNITY_ANDROID`, `UNITY_IOS`, `UNITY_WEBGL`, `DEVELOPMENT_BUILD`, `UNITY_6000_0_OR_NEWER`, `ENABLE_INPUT_SYSTEM`, `ENABLE_IL2CPP`, and others.

## 9. Assemblies and scripting backends

- **Assembly Definitions** (`.asmdef`) split code into assemblies. Options: references, platforms, Allow unsafe code, Auto Referenced, Override References, Define Constraints, Version Defines, No Engine References. `.asmref` files add folders to an existing assembly.
- **Predefined assemblies**: `Assembly-CSharp`, `Assembly-CSharp-Editor`, `-firstpass`.
- **Scripting backends**:
  - **Mono**: JIT; fast iteration.
  - **IL2CPP**: AOT (C# → C++ → native). Required on iOS, consoles and Web. Options: C++ compiler configuration (Debug/Release/Master), IL2CPP Code Generation (Faster runtime / Faster builds), Generic sharing, and IL2CPP-specific attributes (`[Il2CppSetOption]`).
  - **CoreCLR**: the planned replacement. 6.6 ships "CoreCLR prep". **6.7 has an experimental CoreCLR player**, and **Mono is to be removed in 6.8**. It brings .NET 10 BCL, C# 14, a modern GC and RyuJIT.
- **C# language**: C# 9 on Mono/IL2CPP in 6.0–6.6. Roslyn source generators and analyzers are supported: drop a DLL labeled `RoslynAnalyzer`.
- **API Compatibility Level**: .NET Standard 2.1 or .NET Framework.
- **Managed code stripping** (UnityLinker): Disabled, Minimal, Low, Medium or High. Preserve code with `link.xml` or `[Preserve]`.
- **Garbage collection**: Boehm, optionally **incremental GC** (time-sliced), `GarbageCollector.GCMode` (Enabled/Disabled/Manual), `GC.Collect`. Moves to the CoreCLR GC from 6.7+.
- **Native plugins**: `[DllImport]` P/Invoke, `AndroidJavaObject`/`AndroidJavaClass` (JNI), Objective-C via `__Internal`, the low-level native plugin interface (`IUnityInterfaces`, `IUnityGraphics`), and `UnitySendMessage`.
