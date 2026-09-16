import {
  deserializeScene,
  normalizeComponent,
  parseSceneText,
  serializeSceneText,
  type SceneDocument,
} from "@scene/SceneSerializer";
import type {
  AIStateName,
  ColliderComponent,
  EntityRef,
  Vec3,
} from "@scene/Components";
import {
  isPrefabableComponent,
  Scene,
  type PrefabableComponent,
  type SceneComponents,
} from "@scene/Scene";

export interface CommandResult {
  ok: boolean;
  entity?: EntityRef;
  error?: string;
  data?: unknown;
}

export interface AuthoringStorage {
  read(path: string): string | null;
  write(path: string, text: string): void;
}

export class LocalStorageSceneStore implements AuthoringStorage {
  constructor(private readonly namespace = "btai:scene:") {}

  read(path: string): string | null {
    return window.localStorage.getItem(this.namespace + path);
  }

  write(path: string, text: string): void {
    window.localStorage.setItem(this.namespace + path, text);
  }
}

const aiStates: readonly AIStateName[] = [
  "Idle",
  "Walking",
  "Running",
  "Driving",
  "Fleeing",
  "Chasing",
  "Dead",
];
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
] as const;
type ComponentName = (typeof componentNames)[number];

export class CommandInterpreter {
  constructor(
    private readonly scene: Scene,
    private readonly storage?: AuthoringStorage,
  ) {}

  execute(input: string | unknown): CommandResult {
    try {
      const command = typeof input === "string" ? JSON.parse(input) : input;
      return this.executeParsed(command);
    } catch (error) {
      return this.fail(
        `invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  executeParsed(command: unknown): CommandResult {
    if (!isRecord(command) || typeof command.command !== "string")
      return this.fail("command must be a string");
    try {
      switch (command.command) {
        case "set_component": {
          const entity = requireEntity(this.scene, command.entity);
          const type = readComponentName(command.type);
          // normalizeComponent's own declared return type spans
          // SceneSerializer's ComponentName, which (unlike this file's own,
          // narrower ComponentName) includes PrefabInstance -- readComponentName
          // already guarantees `type` itself is never that, so this narrowing
          // cast is just re-stating what's already true, not bypassing a check.
          const value = normalizeComponent(type, command.value) as SceneComponents[typeof type];
          this.writeComponent(entity, type, value);
          return { ok: true, entity };
        }
        case "rename_entity": {
          const entity = requireEntity(this.scene, command.entity);
          this.scene.add(entity, "Name", {
            value: readString(command.name, "name"),
          });
          return { ok: true, entity };
        }
        case "reparent_entity": {
          const entity = requireEntity(this.scene, command.entity);
          if (command.parent === null) {
            this.scene.remove(entity, "Parent");
            return { ok: true, entity };
          }
          const parent = requireEntity(this.scene, command.parent);
          let current: EntityRef | undefined = parent;
          const seen = new Set<number>();
          while (current) {
            if (current.index === entity.index || seen.has(current.index))
              throw new Error("Cyclic parent");
            seen.add(current.index);
            current = this.scene.get(current, "Parent")?.entity;
          }
          this.scene.add(entity, "Parent", { entity: parent });
          return { ok: true, entity };
        }
        case "spawn_entity":
          return this.spawn(command);
        case "destroy_entity":
          return this.destroy(command);
        case "set_transform":
          return this.setTransform(command);
        case "set_velocity":
          return this.setVelocity(command);
        case "set_physics":
          return this.setPhysics(command);
        case "set_ai_state":
          return this.setAiState(command);
        case "trigger_animation":
          return this.triggerAnimation(command);
        case "attach_component":
          return this.attachComponent(command);
        case "remove_component":
          return this.removeComponent(command);
        case "create_prefab":
          return this.createPrefab(command);
        case "place_instance":
          return this.placeInstance(command);
        case "unlink_instance":
          return this.unlinkInstance(command);
        case "list_entities":
          return { ok: true, data: this.listEntities() };
        case "describe_entity":
          return this.describe(command);
        case "save_scene":
          return this.saveScene(command);
        case "load_scene":
          return this.loadScene(command);
        default:
          return this.fail(`unknown command: ${command.command}`);
      }
    } catch (error) {
      return this.fail(
        `command failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private spawn(command: Record<string, unknown>): CommandResult {
    if (this.scene.entityCount >= 1024) throw new Error("Entity limit reached");
    const entity = this.scene.createEntity();
    try {
      if (command.transform !== undefined)
        this.scene.add(entity, "Transform", {
          position: readVec3(command.transform, "transform"),
        });
      if (command.velocity !== undefined)
        this.scene.add(entity, "Velocity", {
          value: readVec3(command.velocity, "velocity"),
        });
      if (command.physics !== undefined) {
        const enabled = readBoolean(command.physics, "physics");
        if (enabled) {
          const mass =
            command.mass === undefined ? 1 : readPositive(command.mass, "mass");
          this.scene.add(entity, "RigidBody", {
            mass,
            inverseMass: 1 / mass,
            dynamic: true,
          });
          this.scene.add(entity, "Collider", defaultCollider());
        }
      }
      if (command.name !== undefined)
        this.scene.add(entity, "Name", {
          value: readString(command.name, "name"),
        });
      return { ok: true, entity };
    } catch (error) {
      this.scene.destroyEntity(entity);
      throw error;
    }
  }

  private destroy(command: Record<string, unknown>): CommandResult {
    const entity = requireEntity(this.scene, command.entity);
    for (const [child, parent] of this.scene.query("Parent")) {
      if (
        parent.entity.index === entity.index &&
        parent.entity.generation === entity.generation
      )
        this.scene.remove(child, "Parent");
    }
    return this.scene.destroyEntity(entity)
      ? { ok: true, entity }
      : this.fail("destroy failed");
  }

  private setTransform(command: Record<string, unknown>): CommandResult {
    const entity = requireEntity(this.scene, command.entity);
    const position = readVec3(command.position, "position");
    const transform = this.scene.get(entity, "Transform");
    if (transform) transform.position = position;
    else this.scene.add(entity, "Transform", { position });
    return { ok: true, entity };
  }

  private setVelocity(command: Record<string, unknown>): CommandResult {
    const entity = requireEntity(this.scene, command.entity);
    const value = readVec3(command.velocity, "velocity");
    const velocity = this.scene.get(entity, "Velocity");
    if (velocity) velocity.value = value;
    else this.scene.add(entity, "Velocity", { value });
    return { ok: true, entity };
  }

  private setPhysics(command: Record<string, unknown>): CommandResult {
    const entity = requireEntity(this.scene, command.entity);
    const dynamic = readBoolean(command.dynamic, "dynamic");
    const mass =
      command.mass === undefined
        ? (this.scene.get(entity, "RigidBody")?.mass ?? 1)
        : readPositive(command.mass, "mass");
    const body = this.scene.get(entity, "RigidBody");
    const next =
      body ??
      this.scene.add(entity, "RigidBody", {
        mass,
        inverseMass: dynamic ? 1 / mass : 0,
        dynamic,
      });
    next.mass = mass;
    next.dynamic = dynamic;
    next.inverseMass = dynamic ? 1 / mass : 0;
    if (!this.scene.has(entity, "Collider"))
      this.scene.add(entity, "Collider", defaultCollider());
    return { ok: true, entity };
  }

  private setAiState(command: Record<string, unknown>): CommandResult {
    const entity = requireEntity(this.scene, command.entity);
    const state = readEnum(command.state, aiStates, "state");
    const ai = this.scene.get(entity, "AIState");
    if (ai) ai.state = state;
    else this.scene.add(entity, "AIState", { state });
    return { ok: true, entity };
  }

  private triggerAnimation(command: Record<string, unknown>): CommandResult {
    const entity = requireEntity(this.scene, command.entity);
    const clip = readUnsigned(command.clip, "clip");
    const looping =
      command.looping === undefined
        ? true
        : readBoolean(command.looping, "looping");
    const animation = this.scene.get(entity, "AnimationState");
    const next =
      animation ??
      this.scene.add(entity, "AnimationState", { clip, time: 0, looping });
    next.clip = clip;
    next.time = 0;
    next.looping = looping;
    return { ok: true, entity };
  }

  private attachComponent(command: Record<string, unknown>): CommandResult {
    const entity = requireEntity(this.scene, command.entity);
    const type = readComponentName(command.type);
    if (type === "Parent")
      return this.fail(
        "Parent requires an entity reference and is not attachable without one",
      );
    if (isPrefabableComponent(type)) {
      const instance = this.scene.get(entity, "PrefabInstance");
      if (instance) {
        if (this.scene.getPrefab(instance.prefab)?.components[type] !== undefined)
          return { ok: true, entity };
        // See writeComponent's own comment just below: TS can't prove a
        // dynamically-typed component name and its value correlate, even
        // though they provably do here by construction.
        this.scene.setPrefabComponent(instance.prefab, type, defaultComponent(type) as never);
        return { ok: true, entity };
      }
    }
    if (this.scene.has(entity, type)) return { ok: true, entity };
    this.scene.add(entity, type, defaultComponent(type));
    return { ok: true, entity };
  }

  private removeComponent(command: Record<string, unknown>): CommandResult {
    const entity = requireEntity(this.scene, command.entity);
    const type = readComponentName(command.type);
    if (isPrefabableComponent(type)) {
      const instance = this.scene.get(entity, "PrefabInstance");
      if (instance) {
        const removed = this.scene.removePrefabComponent(instance.prefab, type);
        return removed
          ? { ok: true, entity }
          : this.fail(`component not present: ${type}`);
      }
    }
    const removed = this.scene.remove(entity, type);
    return removed
      ? { ok: true, entity }
      : this.fail(`component not present: ${type}`);
  }

  // A prefab-shared component type on an instance entity is edited on the
  // shared prefab, not the entity itself -- see Scene's own PrefabDefinition
  // doc comment for why (live-shared, no per-instance override in v1).
  //
  // The `as never` casts in this method and its siblings below (createPrefab,
  // unlinkInstance, Scene.setPrefabComponent) all bypass the same TypeScript
  // limitation: a component name and its value are read from the same source
  // together, so they always correlate at runtime, but the name is a plain
  // (dynamically-widened) string type here, not a literal, and TS can't
  // verify that correlation through a generic dictionary write -- the
  // standard escape hatch for that gap.
  private writeComponent<K extends ComponentName>(
    entity: EntityRef,
    type: K,
    value: SceneComponents[K],
  ): void {
    if (isPrefabableComponent(type)) {
      const instance = this.scene.get(entity, "PrefabInstance");
      if (instance) {
        this.scene.setPrefabComponent(instance.prefab, type, value as never);
        return;
      }
    }
    this.scene.add(entity, type, value);
  }

  private createPrefab(command: Record<string, unknown>): CommandResult {
    const entity = requireEntity(this.scene, command.entity);
    const name = readString(command.name, "name");
    if (this.scene.has(entity, "PrefabInstance"))
      throw new Error("Entity is already a prefab instance");
    if (this.scene.hasPrefab(name)) throw new Error(`Prefab already exists: ${name}`);
    const components: Partial<Pick<SceneComponents, PrefabableComponent>> = {};
    for (const type of componentNames) {
      if (!isPrefabableComponent(type)) continue;
      const value = this.scene.get(entity, type);
      if (value === undefined) continue;
      components[type] = value as never;
      this.scene.remove(entity, type);
    }
    this.scene.definePrefab(name, { components });
    this.scene.add(entity, "PrefabInstance", { prefab: name });
    return { ok: true, entity };
  }

  private placeInstance(command: Record<string, unknown>): CommandResult {
    const name = readString(command.prefab, "prefab");
    if (!this.scene.hasPrefab(name)) throw new Error(`Unknown prefab: ${name}`);
    if (this.scene.entityCount >= 1024) throw new Error("Entity limit reached");
    const entity = this.scene.createEntity();
    const position =
      command.transform === undefined
        ? { x: 0, y: 0, z: 0 }
        : readVec3(command.transform, "transform");
    this.scene.add(entity, "Transform", { position });
    this.scene.add(entity, "PrefabInstance", { prefab: name });
    if (command.name !== undefined)
      this.scene.add(entity, "Name", { value: readString(command.name, "name") });
    return { ok: true, entity };
  }

  // Detaches an entity from its prefab, materializing whatever it currently
  // resolves to as its own literal data -- a standalone entity going
  // forward, unaffected by later edits to the prefab it came from.
  private unlinkInstance(command: Record<string, unknown>): CommandResult {
    const entity = requireEntity(this.scene, command.entity);
    const instance = this.scene.get(entity, "PrefabInstance");
    if (!instance) throw new Error("Entity is not a prefab instance");
    const definition = this.scene.getPrefab(instance.prefab);
    if (definition)
      for (const [type, value] of Object.entries(definition.components))
        this.scene.add(entity, type as PrefabableComponent, value as never);
    this.scene.remove(entity, "PrefabInstance");
    return { ok: true, entity };
  }

  private listEntities(): unknown[] {
    return this.scene.eachAlive().map((entity) => ({
      index: entity.index,
      generation: entity.generation,
      ...(this.scene.get(entity, "Name")
        ? { name: this.scene.get(entity, "Name")!.value }
        : {}),
    }));
  }

  private describe(command: Record<string, unknown>): CommandResult {
    const entity = requireEntity(this.scene, command.entity);
    const components: Record<string, unknown> = {};
    // Resolved, not literal -- for a PrefabInstance entity this reflects
    // what's actually simulated (the shared prefab's data plus this
    // entity's own Transform/Name/Parent), not just what the entity
    // literally owns.
    for (const type of this.scene.effectiveComponentNames(entity)) {
      if (type === "Parent") {
        const parent = this.scene.get(entity, "Parent");
        if (parent) components[type] = { entity: parent.entity };
      } else {
        components[type] = this.scene.resolve(entity, type);
      }
    }
    return { ok: true, entity, data: components };
  }

  private saveScene(command: Record<string, unknown>): CommandResult {
    const path = readString(command.path, "path");
    if (!this.storage)
      return this.fail("save_scene requires authoring storage");
    this.storage.write(path, serializeSceneText(this.scene, path));
    return { ok: true };
  }

  private loadScene(command: Record<string, unknown>): CommandResult {
    const path = readString(command.path, "path");
    if (!this.storage)
      return this.fail("load_scene requires authoring storage");
    const text = this.storage.read(path);
    if (text === null) return this.fail(`scene not found: ${path}`);
    const document = parseSceneText(text);
    deserializeScene(this.scene, document);
    return { ok: true, data: document };
  }

  private fail(error: string): CommandResult {
    return { ok: false, error };
  }
}

function requireEntity(scene: Scene, value: unknown): EntityRef {
  if (
    !isRecord(value) ||
    !Number.isInteger(value.index) ||
    !Number.isInteger(value.generation)
  ) {
    throw new Error("entity must be {index,generation}");
  }
  const entity = {
    index: value.index as number,
    generation: value.generation as number,
  };
  if (!scene.alive(entity))
    throw new Error(
      `invalid or stale entity ${entity.index}:${entity.generation}`,
    );
  return entity;
}

function readVec3(value: unknown, label: string): Vec3 {
  if (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((v) => typeof v === "number" && Number.isFinite(v))
  ) {
    return { x: value[0]!, y: value[1]!, z: value[2]! };
  }
  if (
    isRecord(value) &&
    typeof value.x === "number" &&
    Number.isFinite(value.x) &&
    typeof value.y === "number" &&
    Number.isFinite(value.y) &&
    typeof value.z === "number" &&
    Number.isFinite(value.z)
  ) {
    return { x: value.x, y: value.y, z: value.z };
  }
  throw new Error(`${label} must be [x,y,z] or {x,y,z}`);
}

function readBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} must be boolean`);
  return value;
}
function readString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0)
    throw new Error(`${label} must be a non-empty string`);
  return value;
}
function readPositive(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
    throw new Error(`${label} must be positive`);
  return value;
}
function readUnsigned(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new Error(`${label} must be a non-negative integer`);
  return value as number;
}
function readEnum<T extends string>(
  value: unknown,
  values: readonly T[],
  label: string,
): T {
  if (typeof value !== "string" || !values.includes(value as T))
    throw new Error(`${label} is invalid`);
  return value as T;
}
function readComponentName(value: unknown): ComponentName {
  if (
    typeof value !== "string" ||
    !componentNames.includes(value as ComponentName)
  )
    throw new Error(`unsupported component: ${String(value)}`);
  return value as ComponentName;
}
function defaultCollider(): ColliderComponent {
  return { type: "AABB", halfExtents: { x: 0.5, y: 0.5, z: 0.5 }, radius: 0.5 };
}
export function defaultComponent(
  type: Exclude<ComponentName, "Parent">,
): SceneComponents[typeof type] {
  switch (type) {
    case "Transform":
      return { position: { x: 0, y: 0, z: 0 } };
    case "Rotation":
      return { euler: { x: 0, y: 0, z: 0 } };
    case "Scale":
      return { value: { x: 1, y: 1, z: 1 } };
    case "Velocity":
      return { value: { x: 0, y: 0, z: 0 } };
    case "Acceleration":
      return { value: { x: 0, y: 0, z: 0 } };
    case "RigidBody":
      return { mass: 1, inverseMass: 1, dynamic: true };
    case "Collider":
      return defaultCollider();
    case "Health":
      return { current: 100, maximum: 100 };
    case "AIState":
      return { state: "Idle" };
    case "Pedestrian":
      return { archetype: 0 };
    case "Player":
      return {};
    case "Vehicle":
      return { archetype: 0 };
    case "AnimationState":
      return { clip: 0, time: 0, looping: true };
    case "Renderable":
      return { mesh: 0, material: 0, visible: true };
    case "Name":
      return { value: "Entity" };
    case "Script":
      return { source: "function on_tick(dt)\n  -- self.x/y/z (read-only), self.vx/vy/vz (read-write)\nend" };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type { SceneDocument };
