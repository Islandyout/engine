# 13 — Networking, multiplayer and services

NGO: <https://docs-multiplayer.unity3d.com/netcode/current/about/> · Netcode for Entities: <https://docs.unity3d.com/Packages/com.unity.netcode@1.4/manual/index.html> · UGS: <https://docs.unity.com/ugs/>

## 1. Netcode for GameObjects (`com.unity.netcode.gameobjects`, NGO 2.x)

- **NetworkManager**:
  - Setup: transport (Unity Transport), player prefab, network prefabs list, tick rate, connection approval.
  - Start and stop: `StartHost`/`StartServer`/`StartClient`, `Shutdown`.
  - `IsServer`/`IsClient`/`IsHost`, `LocalClientId`, `ConnectedClients`.
  - Callbacks: `OnClientConnectedCallback`/`OnClientDisconnectCallback`/`OnConnectionEvent`.
- **Topologies**: client-server (host or dedicated) and **Distributed Authority** (NGO 2.0+, backed by the Multiplayer Services cloud; clients own objects and the session owner migrates).
- **NetworkObject**:
  - Identity: `NetworkObjectId` (a GlobalObjectIdHash per prefab).
  - Spawning: `Spawn()`, `SpawnWithOwnership(clientId)`, `SpawnAsPlayerObject`, `Despawn`, `ChangeOwnership`, `RemoveOwnership`.
  - Visibility: `CheckObjectVisibility`, `NetworkShow`/`NetworkHide`, `DontDestroyWithOwner`, `AutoObjectParentSync`.
  - Ownership flags (DA): Distributable, Transferable, RequestRequired, SessionOwner.
- **NetworkBehaviour**:
  - `IsOwner`, `IsLocalPlayer`, `OwnerClientId`.
  - Lifecycle: `OnNetworkSpawn`/`OnNetworkDespawn`, `OnGainedOwnership`/`OnLostOwnership`, `OnNetworkObjectParentChanged`.
- **NetworkVariable\<T\>**:
  - Read/write permissions: `NetworkVariableReadPermission.Everyone`/`Owner`, `NetworkVariableWritePermission.Server`/`Owner`.
  - `OnValueChanged`. Supports custom serializable types (`INetworkSerializable`) and collections (`NetworkList<T>`).
  - Update pacing: `CheckDirtyState`, and a tick-based send rate.
- **RPCs**:
  - Unified `[Rpc(SendTo.Server | Owner | NotOwner | Everyone | NotMe | ClientsAndHost | Me | SpecifiedInParams | Authority | NotServer)]` with `RpcParams`, `RequireOwnership`, `Delivery` (Reliable or Unreliable) and `DeferLocal`.
  - Legacy `[ServerRpc]`/`[ClientRpc]`.
  - Method names end in `Rpc`.
- **Components**:
  - `NetworkTransform`: sync axes, thresholds, interpolation (Lerp or smooth dampening), half-float, quaternion compression, authority mode (Server or Owner), `ClientNetworkTransform`, in-local-space.
  - `NetworkRigidbody` / `NetworkRigidbody2D`, `NetworkAnimator` (server or owner authoritative), and `AnticipatedNetworkTransform` / `AnticipatedNetworkVariable` for client prediction.
- **Scene management**: `NetworkSceneManager.LoadScene` (Single or Additive), scene events, synchronization modes, and in-scene placed NetworkObjects.
- **Messaging and time**: Custom Messages (named and unnamed), `NetworkTime`/`ServerTime`/`LocalTime` and the tick system, `NetworkPrefabHandler` (object pooling), bandwidth profiling (Network Profiler module and Runtime Network Stats Monitor), and Network Simulator (latency and packet loss).
- **Tools**: **Multiplayer Play Mode** and the **Multiplayer Center** window (6.0+). Also Multiplayer Tools and ParrelSync-style testing.

```csharp
// NGO: server-authoritative health + owner-driven fire RPC (illustrative)
using Unity.Netcode; using UnityEngine;
public class NetPlayer : NetworkBehaviour {
    public NetworkVariable<int> Health = new(100, NetworkVariableReadPermission.Everyone, NetworkVariableWritePermission.Server);
    public override void OnNetworkSpawn() => Health.OnValueChanged += (oldV, newV) => Debug.Log($"{OwnerClientId} HP {oldV}->{newV}");
    void Update() { if (IsOwner && Input.GetMouseButtonDown(0)) FireRpc(transform.position, transform.forward); }
    [Rpc(SendTo.Server)]
    void FireRpc(Vector3 origin, Vector3 dir) {
        if (Physics.Raycast(origin, dir, out var hit, 100f) && hit.collider.TryGetComponent(out NetPlayer target))
            target.Health.Value -= 10;
        ShowTracerRpc(origin, hit.point);
    }
    [Rpc(SendTo.ClientsAndHost)] void ShowTracerRpc(Vector3 a, Vector3 b) => Debug.DrawLine(a, b, Color.yellow, 0.2f);
}
```

## 2. Netcode for Entities (`com.unity.netcode`)

- **Model**: server-authoritative with **client-side prediction**, rollback and interpolation. Uses separate client and server worlds, the tick-based `NetworkTime`, and `CommandData`/`IInputComponentData` inputs.
- **Ghosts**:
  - `GhostAuthoringComponent`, `[GhostField]` (quantization, smoothing), `GhostMode` (Interpolated, Predicted, OwnerPredicted).
  - Importance scaling, relevancy, snapshot delta compression.
- **RPCs and prediction**: `IRpcCommand` RPCs, prediction switching, and lag compensation (physics history).
- **Integrations**: Thin clients, Multiplayer PlayMode Tools window, and **Unity Physics** prediction.

## 3. Transport and services

- **Unity Transport** (`com.unity.transport`, UTP 2.x):
  - A low-level UDP/WebSocket transport built on NetworkDriver.
  - Pipelines: Fragmentation, Reliable Sequenced, Unreliable Sequenced, Simulator.
  - Security (DTLS/TLS) and the Relay protocol.
- **Multiplayer Services SDK** (`com.unity.services.multiplayer`) unifies:
  - **Sessions**: create/join by code or ID, and quick join.
  - **Lobby**: player data, filters, heartbeats.
  - **Relay**: NAT punch-through-free relay with allocation and join codes.
  - **Matchmaker**: rules, QoS, backfill.
  - **Multiplay Hosting**: dedicated game-server orchestration (being wound down or transitioned; check the current status).
  - **Distributed Authority** backend and Voice (**Vivox**) chat.
- **Other Unity Gaming Services (UGS)**:
  - Authentication: anonymous, platform, Unity Player Accounts, custom ID.
  - **Cloud Save** (player data, files).
  - **Cloud Code** (JS/C# modules, triggers, scheduled).
  - **Remote Config** (game overrides and A/B testing).
  - **Economy** (currencies, inventory, purchases).
  - **Leaderboards** (tiers, buckets, reset).
  - **Friends**, **Moderation**.
  - **Analytics** (standard and custom events, dashboards, funnels, SQL Data Explorer).
  - **Game Overrides**, **Triggers**, **Unity Ads / LevelPlay** (ironSource mediation), **In-App Purchasing** (`com.unity.purchasing`: stores for Google Play, Apple App Store, Amazon, Microsoft, and more; receipt validation).
  - **Cloud Content Delivery** (CCD, with Addressables integration), **Build Automation** (Cloud Build), **Unity Version Control** (Plastic), and **Cloud Diagnostics** (crash and exception reports; the CrashReporting module).
  - **Push Notifications**, **User Reporting**, and the **Deployment** window (config as code).
- **Platform Toolkit** (6.3): a unified cross-platform API for accounts, save data and achievements.
- **UnityWebRequest** (UnityWebRequest* modules):
  - Calls: `Get`, `Post` (form or JSON), `Put`, `Delete`, `Head`.
  - Handlers: `DownloadHandlerBuffer`/`File`/`Texture`/`AudioClip`/`AssetBundle`, `UploadHandlerRaw`/`File`, and `CertificateHandler`.
  - Timeouts and redirects. **HTTP/2 by default** from 6.3 on most platforms.
- **Other networking**: `System.Net.Sockets` and WebSockets (not on Web), `Ping`, and `Application.internetReachability`.

```csharp
// UnityWebRequest JSON POST with await (6.x)
async Awaitable<string> PostScore(string url, int score) {
    using var req = UnityWebRequest.Post(url, JsonUtility.ToJson(new { score }), "application/json");
    await req.SendWebRequest();
    if (req.result != UnityWebRequest.Result.Success) throw new System.Exception(req.error);
    return req.downloadHandler.text;
}
```

## 4. Localization (`com.unity.localization`)

- **Locales and tables**: Locales (Locale Generator), a Locale Selector chain (command line, system, specific, PlayerPrefs), **String Tables** and **Asset Tables** (collections, shared table data), table editor window, and CSV / Google Sheets / XLIFF import and export.
- **Smart Strings** (the SmartStrings module): plurals, lists, choose, conditional, nested variables, persistent variables, and time/date formatters.
- **Components**: Localize String/Sprite/Texture/Audio/GameObject **Event** components (their class names come from source), and Localized Property Variants (per-locale property overrides tracked on GameObjects).
- **Tooling**: pseudo-localization (expansion, accenting, encapsulation, mirroring) and Addressables-based loading.
