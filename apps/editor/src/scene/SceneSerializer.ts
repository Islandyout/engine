import type { EntityRef } from "./Components";
import {
  isPrefabableComponent,
  Scene,
  type PrefabableComponent,
  type SceneComponents,
} from "./Scene";
import type { AIStateName } from "./Components";

export interface SceneDocument {
  format: 1;
  name?: string;
  // Named templates, keyed by name -- see Scene's own PrefabDefinition doc
  // comment. Each instance entity persists only its own Transform/Name/
  // Parent/PrefabInstance below; everything else lives here once, shared.
  prefabs?: Record<
    string,
    { components: Partial<{ [K in PrefabableComponent]: SceneComponents[K] }> }
  >;
  entities: Array<{
    name?: string;
    parent?: EntityRef;
    components: Partial<{ [K in keyof SceneComponents]: SceneComponents[K] }>;
  }>;
}

function jsonValue(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

export function serializeScene(scene: Scene, name?: string): SceneDocument {
  const indexByEntity = new Map<number, number>();
  scene
    .eachAlive()
    .forEach((entity, index) => indexByEntity.set(entity.index, index));
  // Object.fromEntries, not incremental bracket assignment (prefabs[name] =
  // ...) on a plain object literal -- a prefab literally named "__proto__"
  // would invoke that key's legacy prototype setter instead of creating an
  // enumerable own property, silently dropping it from Object.keys/entries
  // later (on save here, and were it built this way, on load too).
  const prefabs: Record<string, { components: Record<string, unknown> }> =
    Object.fromEntries(
      scene.prefabEntries().map(([prefabName, definition]) => [
        prefabName,
        { components: jsonValue(definition.components) as Record<string, unknown> },
      ]),
    );
  return {
    format: 1,
    ...(name ? { name } : {}),
    ...(Object.keys(prefabs).length
      ? { prefabs: prefabs as SceneDocument["prefabs"] }
      : {}),
    entities: scene.eachAlive().map((entity) => {
      const components = {} as Partial<{
        [K in keyof SceneComponents]: SceneComponents[K];
      }>;
      for (const type of scene.getComponentNames(entity)) {
        const component = scene.get(entity, type);
        if (component && type !== "Parent")
          (components as Record<string, unknown>)[type] = jsonValue(component);
      }
      const parent = scene.get(entity, "Parent");
      return {
        ...(scene.get(entity, "Name")?.value
          ? { name: scene.get(entity, "Name")!.value }
          : {}),
        ...(parent &&
        scene.alive(parent.entity) &&
        indexByEntity.has(parent.entity.index)
          ? {
              parent: {
                index: indexByEntity.get(parent.entity.index)!,
                generation: 1,
              },
            }
          : {}),
        components,
      };
    }),
  };
}

export function serializeSceneText(scene: Scene, name?: string): string {
  return JSON.stringify(serializeScene(scene, name), null, 2);
}

export function deserializeScene(scene: Scene, document: unknown): void {
  if (!isSceneDocument(document))
    throw new Error(
      "Invalid scene document: expected format 1 and an entities array.",
    );
  validateSceneDocument(document);
  scene.clear();
  for (const [prefabName, prefabDoc] of Object.entries(document.prefabs ?? {})) {
    const components: Partial<{ [K in PrefabableComponent]: SceneComponents[K] }> = {};
    for (const [type, raw] of Object.entries(prefabDoc.components)) {
      if (!isPrefabableComponent(type))
        throw new Error(`Unsupported prefab component: ${type}`);
      // See CommandInterpreter.writeComponent's comment on the matching
      // `as never` casts there -- same TypeScript limitation.
      components[type] = normalizeComponent(type, raw) as never;
    }
    scene.definePrefab(prefabName, { components });
  }
  const entities = document.entities.map(() => scene.createEntity());
  document.entities.forEach((entry, sourceIndex) => {
    const target = entities[sourceIndex]!;
    for (const [type, raw] of Object.entries(entry.components)) {
      if (type === "Parent") continue;
      if (!isComponentName(type))
        throw new Error(`Unsupported component in scene: ${type}`);
      scene.add(target, type, normalizeComponent(type, raw));
    }
    if (entry.name && !scene.has(target, "Name"))
      scene.add(target, "Name", { value: entry.name });
  });
  document.entities.forEach((entry, sourceIndex) => {
    if (entry.parent) {
      const parent = entities[entry.parent.index];
      if (!parent)
        throw new Error(`Invalid parent index ${entry.parent.index}.`);
      scene.add(entities[sourceIndex]!, "Parent", { entity: parent });
    }
  });
}

export function parseSceneText(text: string): SceneDocument {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `Invalid scene JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!isSceneDocument(value))
    throw new Error(
      "Invalid scene document: expected format 1 and an entities array.",
    );
  return value;
}

function isSceneDocument(value: unknown): value is SceneDocument {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    record.format === 1 &&
    (!("prefabs" in record) || isPrefabsRecord(record.prefabs)) &&
    Array.isArray(record.entities) &&
    record.entities.every((entry) => {
      if (!entry || typeof entry !== "object") return false;
      const item = entry as Record<string, unknown>;
      return (
        (!("name" in item) || typeof item.name === "string") &&
        typeof item.components === "object" &&
        item.components !== null
      );
    })
  );
}

function isPrefabsRecord(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).every(
    (entry) =>
      !!entry &&
      typeof entry === "object" &&
      typeof (entry as Record<string, unknown>).components === "object" &&
      (entry as Record<string, unknown>).components !== null,
  );
}

const componentNames = [
  "Transform",
  "Rotation",
  "Scale",
  "Velocity",
  "Acceleration",
  "RigidBody",
  "Collider",
  "Health",
  "AIState",
  "Pedestrian",
  "Player",
  "Vehicle",
  "AnimationState",
  "Renderable",
  "Name",
  "Parent",
  "Script",
  "Sound",
  "PrefabInstance",
] as const;
type ComponentName = (typeof componentNames)[number];
function isComponentName(value: string): value is ComponentName {
  return (componentNames as readonly string[]).includes(value);
}

function isVec3(value: unknown): value is { x: number; y: number; z: number } {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.x === "number" &&
    Number.isFinite(v.x) &&
    typeof v.y === "number" &&
    Number.isFinite(v.y) &&
    typeof v.z === "number" &&
    Number.isFinite(v.z)
  );
}

export function normalizeComponent(
  type: ComponentName,
  raw: unknown,
): SceneComponents[ComponentName] {
  if (!raw || typeof raw !== "object")
    throw new Error(`${type} must be an object.`);
  const value = raw as Record<string, unknown>;
  switch (type) {
    case "Transform":
      return { position: requiredVec3(value.position, "Transform.position") };
    case "Rotation":
      return { euler: requiredVec3(value.euler, "Rotation.euler") };
    case "Scale":
      return { value: requiredVec3(value.value, "Scale.value") };
    case "Velocity":
      return { value: requiredVec3(value.value, "Velocity.value") };
    case "Acceleration":
      return { value: requiredVec3(value.value, "Acceleration.value") };
    case "RigidBody": {
      const mass = number(value.mass, "RigidBody.mass");
      const dynamic = boolean(value.dynamic, "RigidBody.dynamic");
      if (mass <= 0) throw new Error("RigidBody.mass must be positive.");
      return { mass, inverseMass: dynamic ? 1 / mass : 0, dynamic };
    }
    case "Collider": {
      const colliderType = value.type;
      if (colliderType !== "AABB" && colliderType !== "Sphere")
        throw new Error("Collider.type must be AABB or Sphere.");
      return {
        type: colliderType,
        halfExtents:
          value.halfExtents === undefined
            ? { x: 0.5, y: 0.5, z: 0.5 }
            : requiredVec3(value.halfExtents, "Collider.halfExtents"),
        radius:
          value.radius === undefined
            ? 0.5
            : number(value.radius, "Collider.radius"),
      };
    }
    case "Health":
      return {
        current: number(value.current, "Health.current"),
        maximum: number(value.maximum, "Health.maximum"),
      };
    case "AIState": {
      const state = value.state;
      const states: readonly AIStateName[] = [
        "Idle",
        "Walking",
        "Running",
        "Driving",
        "Fleeing",
        "Chasing",
        "Dead",
      ];
      if (typeof state !== "string" || !states.includes(state as AIStateName))
        throw new Error("AIState.state is invalid.");
      return { state: state as AIStateName };
    }
    case "Pedestrian":
      return {
        archetype: boundedIndex(value.archetype, "Pedestrian.archetype", 0, 3),
      };
    case "Script":
      return { source: string(value.source, "Script.source") };
    case "Sound":
      return {
        clip: unsigned(value.clip, "Sound.clip", 1),
        volume: unitInterval(value.volume, "Sound.volume", 1),
        loop: boolean(value.loop, "Sound.loop"),
        autoplay: boolean(value.autoplay, "Sound.autoplay"),
      };
    case "Player":
      return {};
    case "Vehicle":
      return { archetype: boundedIndex(value.archetype, "Vehicle.archetype", 0, 4) };
    case "AnimationState":
      return {
        clip: string(value.clip, "AnimationState.clip"),
        time: number(value.time, "AnimationState.time"),
        looping: boolean(value.looping, "AnimationState.looping"),
      };
    case "Renderable":
      return {
        mesh: unsigned(value.mesh, "Renderable.mesh", 0),
        material: unsigned(value.material, "Renderable.material", 0),
        visible: boolean(value.visible, "Renderable.visible"),
      };
    case "Name":
      return { value: string(value.value, "Name.value") };
    case "PrefabInstance":
      return { prefab: string(value.prefab, "PrefabInstance.prefab") };
    case "Parent":
      throw new Error("Parent is encoded separately.");
  }
}

function requiredVec3(
  value: unknown,
  label: string,
): { x: number; y: number; z: number } {
  if (!isVec3(value)) throw new Error(`${label} must be {x,y,z}.`);
  return { x: value.x, y: value.y, z: value.z };
}
function number(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error(`${label} must be a finite number.`);
  return value;
}
function unsigned(value: unknown, label: string, fallback: number): number {
  const result = value === undefined ? fallback : value;
  if (
    typeof result !== "number" ||
    !Number.isInteger(result) ||
    !Number.isSafeInteger(result) ||
    result < 0
  )
    throw new Error(`${label} must be a non-negative integer.`);
  return result;
}
function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} must be boolean.`);
  return value;
}
function unitInterval(value: unknown, label: string, fallback: number): number {
  const result = value === undefined ? fallback : value;
  if (typeof result !== "number" || !Number.isFinite(result) || result < 0 || result > 1)
    throw new Error(`${label} must be a number between 0 and 1.`);
  return result;
}
function string(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be a string.`);
  return value;
}
// Like unsigned(), but for a value that isn't just non-negative -- it's a
// real index into a fixed-size native table (Vehicle.archetype/
// Pedestrian.archetype into bridge.cpp's own vehicle_tuning/
// pedestrian_tuning, in VehicleArchetype/PedestrianArchetype's declared
// order). Rejected here at load time, with a clear error naming the field,
// rather than deferred to editor_add's own runtime bounds check, which would
// otherwise surface as the same generic "Runtime rejects..." failure
// syncRuntime() throws for an out-of-range coordinate.
function boundedIndex(value: unknown, label: string, fallback: number, count: number): number {
  const result = value === undefined ? fallback : value;
  if (
    typeof result !== "number" ||
    !Number.isInteger(result) ||
    result < 0 ||
    result >= count
  )
    throw new Error(`${label} must be an integer from 0 to ${count - 1}.`);
  return result;
}

// Validate the entire replacement before touching the active document.
export function validateSceneDocument(
  document: unknown,
): asserts document is SceneDocument {
  if (!isSceneDocument(document) || document.entities.length > 1024)
    throw new Error("Invalid scene document or entity limit exceeded");
  for (const [prefabName, prefabDoc] of Object.entries(document.prefabs ?? {})) {
    if (prefabName.length === 0) throw new Error("Prefab name must be non-empty");
    for (const [type, value] of Object.entries(prefabDoc.components)) {
      if (!isPrefabableComponent(type))
        throw new Error(`Unsupported prefab component: ${type}`);
      normalizeComponent(type, value);
    }
  }
  for (const [index, entry] of document.entities.entries()) {
    if (Array.isArray(entry.components))
      throw new Error("Components must be an object");
    for (const [type, value] of Object.entries(entry.components)) {
      if (!isComponentName(type))
        throw new Error(`Unsupported component: ${type}`);
      if (type === "Parent") continue;
      const normalized = normalizeComponent(type, value);
      if (
        type === "PrefabInstance" &&
        document.prefabs?.[(normalized as { prefab: string }).prefab] === undefined
      )
        throw new Error(
          `PrefabInstance references unknown prefab: ${(normalized as { prefab: string }).prefab}`,
        );
    }
    const seen = new Set<number>([index]);
    let parent = entry.parent;
    while (parent !== undefined) {
      if (
        !parent ||
        !Number.isSafeInteger(parent.index) ||
        parent.index < 0 ||
        parent.index >= document.entities.length ||
        parent.generation !== 1 ||
        seen.has(parent.index)
      )
        throw new Error("Invalid or cyclic parent");
      seen.add(parent.index);
      parent = document.entities[parent.index]!.parent;
    }
  }
}
