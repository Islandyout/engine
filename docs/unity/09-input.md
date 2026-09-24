# 09 — Input

Input System manual: <https://docs.unity3d.com/Packages/com.unity.inputsystem@1.14/manual/index.html> · Legacy: <https://docs.unity3d.com/Manual/class-InputManager.html>

Image base (InputSystem repo @ `c61cc67`): `https://raw.githubusercontent.com/Unity-Technologies/InputSystem/c61cc671e24fbc097de417d3ea564224828e99e9/Packages/com.unity.inputsystem/Documentation~/Images/`

The **Active Input Handling** player setting chooses the Input Manager (old), the Input System Package (new), or Both.

## 1. Input System package (`com.unity.inputsystem`)

![Concepts overview](https://raw.githubusercontent.com/Unity-Technologies/InputSystem/c61cc671e24fbc097de417d3ea564224828e99e9/Packages/com.unity.inputsystem/Documentation~/Images/ConceptsOverview.png)

**Three workflows:**

1. **Direct**: read devices directly, e.g. `Keyboard.current.spaceKey.wasPressedThisFrame`.
2. **Actions**: an `InputActionAsset` holding Action Maps, Actions and Bindings, with polling or callbacks.
3. **PlayerInput**: a component that routes actions to your scripts.

### Actions

- **Project-wide actions** (1.8+/Unity 6): assigned in Project Settings > Input System Package. Access them with `InputSystem.actions.FindAction("Move")`. The default map is Player (Move, Look, Attack, Interact, Crouch, Jump, Prev, Next, Sprint) + UI.
- **Action types**:
  - **Value**: continuous, with disambiguation and an initial state check.
  - **Button**: press and release, with an initial state check.
  - **Pass-Through**: no disambiguation; every control change is reported.
- **Control types**: Any, Analog, Axis, Bone, Button, Delta, Digital, Double, Dpad, Eyes, Integer, Pose, Quaternion, Stick, Touch, Vector2, Vector3.
- **Action phases**: Disabled, Waiting, Started, Performed, Canceled. Callbacks `started`, `performed`, `canceled`. Polling: `ReadValue<T>()`, `WasPressedThisFrame()`, `WasReleasedThisFrame()`, `WasPerformedThisFrame()`, `IsPressed()`, `triggered`.
- **Bindings**:
  - **Control paths** such as `<Gamepad>/leftStick`, `<Keyboard>/w`, `<Mouse>/delta`, `<Touchscreen>/primaryTouch/position`, `*/{Submit}` (usages), `<XRController>{LeftHand}/trigger`.
  - **Composite bindings**: 1D Axis (negative/positive, with whichSideWins), 2D Vector (up/down/left/right; mode DigitalNormalized, Digital, Analog), 3D Vector, One Modifier, Two Modifiers, and custom composites.
  - **Control schemes**: Keyboard&Mouse, Gamepad, Touch, Joystick, XR. Each has device requirements (required or optional).
  - Binding groups, binding masks, and conflict resolution.
- **Interactions**: Press (Press Only, Release Only, Press and Release; press point), Hold (duration), Tap (max duration), SlowTap, MultiTap (tap count, delay), and custom (`IInputInteraction`). Defaults follow the action type.
- **Processors**: Axis Deadzone, Stick Deadzone (min/max), Clamp, Invert, Invert Vector 2/3, Normalize, Normalize Vector 2/3, Scale, Scale Vector 2/3, Compensate Direction/Rotation (device orientation), and custom (`InputProcessor<T>`).
- **Generate C# class** from the asset gives type-safe wrappers (`controls.Player.Jump.performed += ...`).
- **Actions Editor** is a UI Toolkit window with Action Maps, Actions, and Binding/Action Properties panels.

![Actions editor](https://raw.githubusercontent.com/Unity-Technologies/InputSystem/c61cc671e24fbc097de417d3ea564224828e99e9/Packages/com.unity.inputsystem/Documentation~/Images/ActionsEditor.png)

```csharp
// Project-wide actions, polling + callback (Input System 1.8+)
using UnityEngine; using UnityEngine.InputSystem;
public class PlayerInputReader : MonoBehaviour {
    InputAction move, jump;
    void Awake() { move = InputSystem.actions.FindAction("Move"); jump = InputSystem.actions.FindAction("Jump"); }
    void OnEnable()  => jump.performed += OnJump;
    void OnDisable() => jump.performed -= OnJump;
    void Update() { Vector2 m = move.ReadValue<Vector2>(); transform.Translate(new Vector3(m.x, 0, m.y) * 5f * Time.deltaTime); }
    void OnJump(InputAction.CallbackContext ctx) => Debug.Log($"Jump from {ctx.control.device.displayName}");
}

// Direct device access
if (Gamepad.current?.buttonSouth.wasPressedThisFrame == true) Fire();
Vector2 mouse = Mouse.current.position.ReadValue();
Gamepad.current?.SetMotorSpeeds(0.25f, 0.75f);           // rumble

// Actions from code with a composite
var move2 = new InputAction("Move", InputActionType.Value);
move2.AddCompositeBinding("2DVector").With("Up", "<Keyboard>/w").With("Down", "<Keyboard>/s")
     .With("Left", "<Keyboard>/a").With("Right", "<Keyboard>/d");
move2.AddBinding("<Gamepad>/leftStick").WithProcessor("stickDeadzone(min=0.2)");
move2.Enable();
```

### PlayerInput and PlayerInputManager

- **PlayerInput**:
  - Settings: actions asset, default scheme and map, UI input module, camera.
  - **Behavior** (how actions reach your scripts):
    - Send Messages: `OnMove(InputValue v)`.
    - Broadcast Messages.
    - Invoke Unity Events.
    - Invoke C# Events (`onActionTriggered`).
  - Device pairing (`InputUser`), auto-switching control schemes, `onDeviceLost`/`onDeviceRegained`.
- **PlayerInputManager** (local multiplayer):
  - Join behavior: join when a button is pressed, when a join action is triggered, or manually.
  - Settings: player prefab, max players, **split-screen** (fixed number, screen rectangle), `onPlayerJoined`/`onPlayerLeft`.

![PlayerInput](https://raw.githubusercontent.com/Unity-Technologies/InputSystem/c61cc671e24fbc097de417d3ea564224828e99e9/Packages/com.unity.inputsystem/Documentation~/Images/PlayerInput.png)

### Devices

- **Built-in layouts**: Keyboard, Mouse, Pen, Touchscreen, Gamepad (DualShock 3/4, DualSense, Xbox, Switch Pro, generic HID), Joystick, HID (any, with custom layouts), Sensors (Accelerometer, Gyroscope, Gravity, Attitude, Linear Acceleration, Magnetic Field, Light, Pressure, Proximity, Humidity, Ambient Temperature, Step Counter), XR (XRController, XRHMD, hand tracking via XR Hands), and Remote (Unity Remote).
- **Touch**:
  - `Touchscreen.current.touches` (up to 10), primaryTouch, and `EnhancedTouch` (`Touch.activeTouches`, `Finger`, touch history).
  - Phases: Began, Moved, Stationary, Ended, Canceled.
  - Tap count, pressure, radius. **Touch simulation** from the mouse.
- **Advanced**:
  - Control state history. **Custom devices** via `InputControlLayout` + `IInputStateTypeInfo`, and `InputSystem.AddDevice`, `QueueStateEvent`.
  - **Input event trace** and replay (`InputEventTrace`) for recording and automated tests. **Input Debugger** window (devices, layouts, actions, events).
  - `InputTestFixture` for unit tests.
  - **Update mode**: Dynamic Update, Fixed Update, Manual. **Background behavior**: Reset And Disable Non Background Devices, and others.
  - `InputSystem.onDeviceChange`, `onAnyButtonPress`.
- **Rebinding at runtime**: `action.PerformInteractiveRebinding().WithControlsExcluding("Mouse").OnComplete(op => op.Dispose()).Start()`. Save and restore with `SaveBindingOverridesAsJson`/`LoadBindingOverridesFromJson`. Display with `GetBindingDisplayString`. Samples: Rebinding UI, On-Screen Controls (OnScreenStick, OnScreenButton), Simple Demo, Gamepad Mouse Cursor, Visualizers, Tanks, and Input Recorder.
- **UI integration**: `InputSystemUIInputModule` (point, click, scroll, navigate, submit, cancel, tracked device), `MultiplayerEventSystem`, and UI Toolkit `PanelInputConfiguration` / InputForUI module (6.x).

## 2. Legacy Input Manager (`UnityEngine.Input`)

- **Axes** (Project Settings > Input Manager):
  - Axis definition: name, descriptive names, negative/positive buttons, alt buttons, gravity, dead, sensitivity, snap, invert, type (Key or Mouse Button, Mouse Movement, Joystick Axis), axis index, and joystick number.
  - Defaults: Horizontal, Vertical, Fire1–3, Jump, Mouse X/Y, Mouse ScrollWheel, Submit, Cancel.
- **API**:
  - Axes and buttons: `GetAxis` (smoothed), `GetAxisRaw`, `GetButton`/`Down`/`Up`.
  - Keys: `GetKey`/`Down`/`Up(KeyCode)`, `anyKey`/`anyKeyDown`, `inputString`.
  - Mouse: `mousePosition`, `mouseScrollDelta`, `GetMouseButton(0..2)`.
  - Touch: `touchCount`, `GetTouch(i)` (fingerId, position, deltaPosition, phase (`TouchPhase` Began, Moved, Stationary, Ended, Canceled), tapCount, pressure, radius), `multiTouchEnabled`, `simulateMouseWithTouches`.
  - Motion sensors: `acceleration`, `gyro`, `compass`, `location` (`LocationService`), `deviceOrientation`.
  - `GetJoystickNames`, `imeCompositionMode`, `compositionString`.
- **Cursor**: `Cursor.lockState` (`CursorLockMode` None, Locked, Confined), `Cursor.visible`, `Cursor.SetCursor(texture, hotspot, CursorMode)`.
- **Mobile**: `Handheld.Vibrate`, `TouchScreenKeyboard.Open`, `Screen.orientation` (Portrait, PortraitUpsideDown, LandscapeLeft, LandscapeRight, AutoRotation), and `Screen.safeArea`/`cutouts`.
