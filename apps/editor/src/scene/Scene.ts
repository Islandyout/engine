import type {
  AIStateComponent,
  AccelerationComponent,
  AnimationStateComponent,
  ColliderComponent,
  EntityRef,
  HealthComponent,
  NameComponent,
  ParentComponent,
  PedestrianComponent,
  PlayerComponent,
  PrefabInstanceComponent,
  RenderableComponent,
  RigidBodyComponent,
  RotationComponent,
  ScaleComponent,
  ScriptComponent,
  TransformComponent,
  Vec3,
  VehicleComponent,
  VelocityComponent,
} from "./Components";

export type EntityId = number;

export interface SceneComponents {
  Transform: TransformComponent;
  Rotation: RotationComponent;
  Scale: ScaleComponent;
  Velocity: VelocityComponent;
  Acceleration: AccelerationComponent;
  RigidBody: RigidBodyComponent;
  Collider: ColliderComponent;
  Health: HealthComponent;
  AIState: AIStateComponent;
  Pedestrian: PedestrianComponent;
  Player: PlayerComponent;
  Vehicle: VehicleComponent;
  AnimationState: AnimationStateComponent;
  Renderable: RenderableComponent;
  Name: NameComponent;
  Parent: ParentComponent;
  Script: ScriptComponent;
  PrefabInstance: PrefabInstanceComponent;
}

// The component types a prefab definition can carry -- deliberately every
// type except the "placement" ones (Transform/Rotation/Scale, since where
// and how an instance sits is always its own) and the "identity" ones
// (Name, Parent, PrefabInstance itself). Single source of truth for both
// the runtime check (CommandInterpreter, SceneSerializer) and the
// compile-time PrefabableComponent type below, so the two can never drift.
export const prefabableComponentNames = [
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
  "Script",
] as const satisfies readonly (keyof SceneComponents)[];
export type PrefabableComponent = (typeof prefabableComponentNames)[number];
const prefabableComponentSet: ReadonlySet<string> = new Set(
  prefabableComponentNames,
);
export function isPrefabableComponent(
  type: string,
): type is PrefabableComponent {
  return prefabableComponentSet.has(type);
}

// A named template: "Player Car", placed ten times. Deliberately live-shared
// rather than copy-on-place -- an instance entity (see PrefabInstanceComponent)
// stores none of these component types itself, only a reference to this
// definition by name, so editing a value here is instantly visible on every
// instance with no separate "apply to all" step and no risk of an instance
// drifting out of sync. The trade-off, accepted for v1: no per-instance
// override of a prefab-defined value -- an instance that needs to differ
// belongs to a different prefab.
export interface PrefabDefinition {
  components: Partial<Pick<SceneComponents, PrefabableComponent>>;
}

interface Slot {
  generation: number;
  alive: boolean;
}

export interface SceneSnapshot {
  entities: EntityRef[];
}

export class Scene {
  private slots: Slot[] = [];
  private free: number[] = [];
  private components: {
    [K in keyof SceneComponents]: Map<EntityId, SceneComponents[K]>;
  } = {
    Transform: new Map(),
    Rotation: new Map(),
    Scale: new Map(),
    Velocity: new Map(),
    Acceleration: new Map(),
    RigidBody: new Map(),
    Collider: new Map(),
    Health: new Map(),
    AIState: new Map(),
    Pedestrian: new Map(),
    Player: new Map(),
    Vehicle: new Map(),
    AnimationState: new Map(),
    Renderable: new Map(),
    Name: new Map(),
    Parent: new Map(),
    Script: new Map(),
    PrefabInstance: new Map(),
  };
  private prefabDefs = new Map<string, PrefabDefinition>();

  createEntity(): EntityRef {
    const index = this.free.pop() ?? this.slots.length;
    const slot = this.slots[index] ?? { generation: 1, alive: false };
    slot.alive = true;
    this.slots[index] = slot;
    return { index, generation: slot.generation };
  }

  destroyEntity(entity: EntityRef): boolean {
    if (!this.alive(entity)) return false;
    const slot = this.slots[entity.index]!;
    slot.alive = false;
    slot.generation = (slot.generation + 1) >>> 0 || 1;
    for (const store of Object.values(this.components))
      store.delete(entity.index);
    this.free.push(entity.index);
    return true;
  }

  alive(entity: EntityRef): boolean {
    const slot = this.slots[entity.index];
    return !!slot?.alive && slot.generation === entity.generation;
  }

  clear(): void {
    for (const index of this.eachAlive()) this.destroyEntity(index);
    // Rebuild documents in stable slot order while retaining incremented generations.
    this.free.sort((a, b) => b - a);
    this.prefabDefs.clear();
  }

  add<K extends keyof SceneComponents>(
    entity: EntityRef,
    componentType: K,
    data: SceneComponents[K],
  ): SceneComponents[K] {
    this.requireAlive(entity);
    this.components[componentType].set(entity.index, data);
    return data;
  }

  get<K extends keyof SceneComponents>(
    entity: EntityRef,
    componentType: K,
  ): SceneComponents[K] | undefined {
    if (!this.alive(entity)) return undefined;
    return this.components[componentType].get(entity.index);
  }

  remove<K extends keyof SceneComponents>(
    entity: EntityRef,
    componentType: K,
  ): boolean {
    if (!this.alive(entity)) return false;
    return this.components[componentType].delete(entity.index);
  }

  has<K extends keyof SceneComponents>(
    entity: EntityRef,
    componentType: K,
  ): boolean {
    return (
      this.alive(entity) && this.components[componentType].has(entity.index)
    );
  }

  query<K extends keyof SceneComponents>(
    componentType: K,
  ): Array<[EntityRef, SceneComponents[K]]> {
    const store = this.components[componentType];
    const result: Array<[EntityRef, SceneComponents[K]]> = [];
    for (const [index, data] of store) {
      const slot = this.slots[index];
      if (slot?.alive)
        result.push([{ index, generation: slot.generation }, data]);
    }
    return result;
  }

  // -- Prefabs --------------------------------------------------------

  prefabNames(): string[] {
    return [...this.prefabDefs.keys()];
  }

  prefabEntries(): Array<[string, PrefabDefinition]> {
    return [...this.prefabDefs.entries()];
  }

  hasPrefab(name: string): boolean {
    return this.prefabDefs.has(name);
  }

  getPrefab(name: string): PrefabDefinition | undefined {
    return this.prefabDefs.get(name);
  }

  definePrefab(name: string, definition: PrefabDefinition): void {
    this.prefabDefs.set(name, definition);
  }

  setPrefabComponent<K extends PrefabableComponent>(
    name: string,
    componentType: K,
    data: SceneComponents[K],
  ): void {
    const definition = this.prefabDefs.get(name);
    if (!definition) throw new Error(`Unknown prefab: ${name}`);
    // See CommandInterpreter.writeComponent's own comment on the `as never`
    // casts around it -- same TypeScript limitation, same escape hatch.
    definition.components[componentType] = data as never;
  }

  removePrefabComponent(name: string, componentType: PrefabableComponent): boolean {
    const definition = this.prefabDefs.get(name);
    if (!definition || !(componentType in definition.components)) return false;
    delete definition.components[componentType];
    return true;
  }

  // Reads an entity's own literal data for componentType if it has any,
  // otherwise -- for a PrefabInstance entity, and only for the handful of
  // component types a prefab can define -- falls back to the shared prefab
  // definition. Transform/Rotation/Scale/Name/Parent/PrefabInstance are
  // never prefab-defined, so this always agrees with get() for those, and
  // this agrees with get() entirely for a non-instance entity.
  resolve<K extends keyof SceneComponents>(
    entity: EntityRef,
    componentType: K,
  ): SceneComponents[K] | undefined {
    const own = this.get(entity, componentType);
    if (own !== undefined) return own;
    const instance = this.get(entity, "PrefabInstance");
    if (!instance || !isPrefabableComponent(componentType)) return undefined;
    return this.prefabDefs.get(instance.prefab)?.components[componentType] as
      | SceneComponents[K]
      | undefined;
  }

  effectiveHas<K extends keyof SceneComponents>(
    entity: EntityRef,
    componentType: K,
  ): boolean {
    return this.resolve(entity, componentType) !== undefined;
  }

  // getComponentNames() plus, for a PrefabInstance entity, whichever
  // component types its prefab defines -- what the inspector and the
  // runtime sync should actually treat this entity as having.
  effectiveComponentNames(entity: EntityRef): Array<keyof SceneComponents> {
    const own = this.getComponentNames(entity);
    const instance = this.get(entity, "PrefabInstance");
    const definition = instance && this.prefabDefs.get(instance.prefab);
    if (!definition) return own;
    const names = new Set<keyof SceneComponents>(own);
    for (const type of Object.keys(definition.components))
      names.add(type as keyof SceneComponents);
    return [...names];
  }

  eachAlive(): EntityRef[];
  eachAlive(visitor: (entity: EntityRef) => void): void;
  eachAlive(visitor?: (entity: EntityRef) => void): EntityRef[] | void {
    const snapshot: EntityRef[] = [];
    for (let index = 0; index < this.slots.length; index++) {
      const slot = this.slots[index];
      if (slot?.alive) snapshot.push({ index, generation: slot.generation });
    }
    if (!visitor) return snapshot;
    for (const entity of snapshot) visitor(entity);
  }

  get entityCount(): number {
    let count = 0;
    for (const slot of this.slots) if (slot.alive) count++;
    return count;
  }

  getComponentNames(entity: EntityRef): Array<keyof SceneComponents> {
    if (!this.alive(entity)) return [];
    return (
      Object.keys(this.components) as Array<keyof SceneComponents>
    ).filter((type) => this.components[type].has(entity.index));
  }

  private requireAlive(entity: EntityRef): void {
    if (!this.alive(entity))
      throw new Error(
        `Invalid or stale entity ${entity.index}:${entity.generation}.`,
      );
  }
}

export type { Vec3 };
