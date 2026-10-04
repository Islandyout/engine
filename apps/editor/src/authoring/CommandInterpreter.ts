import type { CharacterControllerComponent, EnvironmentComponent } from "../scene/Components";
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
  "Light",
  "Particles",
  "UI",
  "Name",
  "Parent",
  "Script",
  "Sound",
  "Environment",
  "Camera",
  "Material",
  "Animator",
  "CameraFollow",
  "InputActions",
  "Trail",
  "CharacterController",
  "Weapons",
  "AICombat",
  "Terrain",
  "AudioSettings",
  "PostProcessing",
  "Driver",
  "ModelInstances",
  "SpaceSystem",
  "Spaceship",
  "Scannable",
  "Site",
  "Routine",
  "Wildlife",
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
    this.writeComponent(entity, "Velocity", { value });
    return { ok: true, entity };
  }

  private setPhysics(command: Record<string, unknown>): CommandResult {
    const entity = requireEntity(this.scene, command.entity);
    const dynamic = readBoolean(command.dynamic, "dynamic");
    const mass =
      command.mass === undefined
        ? (this.scene.resolve(entity, "RigidBody")?.mass ?? 1)
        : readPositive(command.mass, "mass");
    this.writeComponent(entity, "RigidBody", {
      mass,
      inverseMass: dynamic ? 1 / mass : 0,
      dynamic,
    });
    if (!this.scene.effectiveHas(entity, "Collider"))
      this.writeComponent(entity, "Collider", defaultCollider());
    return { ok: true, entity };
  }

  private setAiState(command: Record<string, unknown>): CommandResult {
    const entity = requireEntity(this.scene, command.entity);
    const state = readEnum(command.state, aiStates, "state");
    this.writeComponent(entity, "AIState", { state });
    return { ok: true, entity };
  }

  private triggerAnimation(command: Record<string, unknown>): CommandResult {
    const entity = requireEntity(this.scene, command.entity);
    const clip = readString(command.clip, "clip");
    const looping =
      command.looping === undefined
        ? true
        : readBoolean(command.looping, "looping");
    this.writeComponent(entity, "AnimationState", { clip, time: 0, looping });
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
    // Parse every input before creating the entity -- a failed command never
    // reaches Document's undo stack (see EditorDocument.execute), so an
    // entity allocated before validation and then abandoned here would leak,
    // unreachable and un-undoable.
    const position =
      command.transform === undefined
        ? { x: 0, y: 0, z: 0 }
        : readVec3(command.transform, "transform");
    const instanceName = command.name === undefined ? undefined : readString(command.name, "name");
    const entity = this.scene.createEntity();
    this.scene.add(entity, "Transform", { position });
    this.scene.add(entity, "PrefabInstance", { prefab: name });
    if (instanceName !== undefined) this.scene.add(entity, "Name", { value: instanceName });
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
        // A clone, not the prefab's own object -- the prefab (and any still-
        // linked instance) keeps that object; a later in-place edit on this
        // now-standalone entity (set_physics et al. mutate their component
        // in place) must not reach back into either.
        this.scene.add(entity, type as PrefabableComponent, structuredClone(value) as never);
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
  return {
    type: "AABB",
    halfExtents: { x: 0.5, y: 0.5, z: 0.5 },
    radius: 0.5,
    isTrigger: false,
    layer: 0,
    mask: 4294967295,
    bounciness: 0,
  };
}
// A new SpaceSystem's bodies (Pale Signal's inner system, scaled for play):
// a temperate planet with air, its airless moon, and a dead world farther out.
export const defaultSpaceBodies = [
  "Tethys - 1600000 5027 0 0 60000 9 9000 1.05 300 3000 7 #4f7a4a #87b6c8",
  "Vell Tethys 230000 3850 20 7 18000 2.6 0 0 160 2000 3 #b9c6d4 #000000",
  "Ossuary - 2400000 9230 126 -3 52000 6.4 5000 0.18 400 4000 11 #9a9385 #c0b49a",
].join("\n");
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
      return {
        archetype: 0,
        model: "Arcade",
        topSpeed: 60,
        acceleration: 11,
        braking: 26,
        grip: 1.25,
        driftGrip: 0.45,
        steering: 32,
        nitroBoost: 9,
        nitroSeconds: 4,
        gears: 6,
      };
    case "Driver":
      return { mode: "Race", route: "", loop: true, target: "", skill: 0.8, aggression: 0.5, speedScale: 1 };
    case "ModelInstances":
      return { instances: "" };
    case "SpaceSystem":
      return {
        bodies: defaultSpaceBodies,
        starGm: 6.4e12,
        starColor: { x: 1, y: 0.95, z: 0.85 },
        siteBody: "Tethys",
        siteLatitude: 30,
        siteLongitude: 40,
        siteRadius: 300,
        evaRange: 1500,
        startTime: 0,
        landmarks: "",
        species: "",
      };
    case "Spaceship":
      return {
        mass: 12000,
        thrust: 300000,
        liftThrust: 180000,
        rcs: 2.2,
        maxRate: 75,
        fuel: 100,
        burn: 1.2,
        hull: 100,
        gearClearance: 1.6,
        startPiloting: true,
        startOrbit: -1,
        model: "Kestrel",
      };
    case "Scannable":
      return { id: "", name: "", kind: "Mineral", range: 6 };
    case "Site":
      return { name: "Site", body: "", latitude: 0, longitude: 0, radius: 400 };
    case "Routine":
      return { stops: "8 0 0; 18 10 0", speed: 1.4 };
    case "Wildlife":
      return { wary: 44, flee: 16, speed: 7, leash: 80 };
    case "AnimationState":
      return { clip: "", time: 0, looping: true };
    case "Renderable":
      return { mesh: 0, material: 0, visible: true };
    case "Light":
      // A warm, moderate point light -- visible without overpowering
      // whatever it's placed near, and Point is the least surprising default
      // (an unaimed Spot would light nothing until its cone is pointed
      // somewhere; Directional ignores position entirely).
      return {
        type: "Point",
        color: { x: 1, y: 0.95, z: 0.85 },
        intensity: 2,
        range: 15,
        angle: Math.PI / 6,
        castShadows: false,
      };
    case "Particles":
      // A gentle sparkle -- visible immediately without tuning, and Sparkle's
      // omnidirectional burst doesn't need the gravity/rise tuning Smoke/
      // Fire/Confetti each want to read correctly (see main.ts's preset table).
      return {
        preset: "Sparkle",
        color: { x: 1, y: 0.9, z: 0.6 },
        rate: 20,
        lifetime: 1.2,
        speed: 1.5,
        size: 0.12,
        endColor: { x: 1, y: 0.9, z: 0.6 },
        endSize: 1,
        gravityScale: 1,
        shape: "Point",
        shapeSize: 0.5,
        coneAngle: 25,
        space: "Local",
        burst: 0,
      };
    case "UI":
      // A visible-immediately Text label, not a Button -- reads as
      // placeholder content to edit, the more inviting default of the two.
      return {
        kind: "Text",
        text: "Text",
        anchor: "top-left",
        visibleWhen: "always",
        action: "restart",
        offsetX: 0,
        offsetY: 0,
        width: 0,
        height: 0,
        fontSize: 16,
        color: { x: 0.118, y: 0.165, z: 0.22 },
        opacity: 0.85,
        image: "",
        value: 0,
      };
    case "Name":
      return { value: "Entity" };
    case "Script":
      return {
        source:
          "-- @prop speed 3\n" +
          "function on_start()\n  -- runs once when Play starts\nend\n\n" +
          "function on_tick(dt)\n  -- self.x/y/z and self.vx/vy/vz are read-write; props.speed is set in the inspector\nend\n",
        props: { speed: 3 },
      };
    case "Sound":
      return {
        clip: 1,
        volume: 1,
        loop: false,
        autoplay: true,
        spatial: false,
        bus: "SFX",
        minDistance: 2,
        maxDistance: 60,
      };
    case "PostProcessing":
      // A good-looking starting point rather than "no change": SMAA, AO, a
      // touch of contrast and vignette.
      return {
        antialias: "SMAA",
        ambientOcclusion: true,
        aoRadius: 0.5,
        aoIntensity: 1,
        bloom: 0.35,
        bloomRadius: 0.5,
        bloomThreshold: 0.85,
        exposure: 1,
        contrast: 0.08,
        saturation: 0.05,
        temperature: 0,
        vignette: 0.3,
        grain: 0,
        shadowQuality: "High",
      };
    case "AudioSettings":
      return { master: 1, sfx: 1, music: 0.7, ambient: 0.8, ui: 1, reverb: 0.18, occlusion: true };
    case "Environment":
      return defaultEnvironment();
    case "Camera":
      return { projection: "Perspective", fov: 50, near: 0.1, far: 2000, orthoSize: 10, priority: 0 };
    case "Trail":
      return { color: { x: 0.5, y: 0.85, z: 1 }, width: 0.3, lifetime: 0.5, minDistance: 0.1 };
    case "InputActions":
      // Kept in sync with editor_bindings::default_text (bindings.hpp).
      return {
        bindings: [
          "move_x: d, -a, right, -left, pad_lx",
          "move_y: w, -s, up, -down, -pad_ly",
          "look_x: mouse_dx*0.05, pad_rx",
          "look_y: mouse_dy*0.05, pad_ry",
          "jump: space, pad_a",
          "fire: mouse_left, pad_rt, pad_x",
          "interact: e, pad_y",
          "sprint: shift, pad_lb",
          "crouch: c, ctrl, pad_b",
          "aim: mouse_right, pad_lt",
          "reload: r, pad_rb",
          "next_weapon: q, pad_up",
          "weapon_scroll: wheel",
        ].join("\n") + "\n",
      };
    case "CharacterController":
      return defaultCharacterController();
    case "Terrain":
      return {
        size: 120,
        resolution: 97,
        height: 6,
        seed: 1,
        frequency: 1.5,
        octaves: 4,
        sculpt: "",
        grassColor: { x: 0.33, y: 0.48, z: 0.2 },
        rockColor: { x: 0.42, y: 0.4, z: 0.38 },
        sandColor: { x: 0.76, y: 0.7, z: 0.5 },
        snowColor: { x: 0.95, y: 0.96, z: 1 },
        sandHeight: -2.5,
        snowHeight: 9,
        rockSlope: 0.82,
        scatter: "",
      };
    case "AICombat":
      return {
        team: 1,
        behavior: "Patrol",
        patrol: "",
        sightRange: 25,
        fov: 110,
        hearingRange: 30,
        reactionTime: 0.45,
        accuracy: 0.6,
        preferredRange: 12,
        moveSpeed: 3.6,
        burst: 4,
        burstPause: 0.7,
        useCover: true,
        fleeHealth: 0,
        meleeDamage: 12,
      };
    case "Weapons":
      // Kept in sync with engine::gameplay::default_weapons_text (weapons.cpp).
      return {
        loadout: [
          "rifle: model=rifle mode=auto rpm=620 damage=24 mag=30 reserve=180 reload=2.1 spread=2.2 aim_spread=0.35 recoil=0.9 range=200 falloff=45 zoom=0.75",
          "pistol: model=pistol mode=semi rpm=380 damage=34 mag=12 reserve=-1 reload=1.3 spread=1.6 aim_spread=0.3 recoil=1.8 range=120 falloff=30 zoom=0.85 equip=0.3",
          "shotgun: model=shotgun mode=semi rpm=80 pellets=9 damage=12 mag=6 reserve=36 reload=0.5 per_shell spread=6 aim_spread=4.5 recoil=4.5 range=45 falloff=10 min_damage=0.2 zoom=0.9 equip=0.5",
        ].join("\n") + "\n",
      };
    case "CameraFollow":
      return { target: "", offset: { x: 0, y: 4, z: 8 }, smoothing: 0.15, lookHeight: 1, collision: true, orbit: false };
    case "Animator":
      return {
        graph: [
          "state idle clip=idle",
          "state walk clip=walk",
          "state run clip=run",
          "start idle",
          "idle -> walk when speed > 0.15",
          "walk -> run when speed > 2.5",
          "run -> walk when speed <= 2.5",
          "walk -> idle when speed <= 0.15",
        ].join("\n"),
      };
    case "Material":
      return {
        color: { x: 0.38, y: 0.68, z: 0.73 },
        metalness: 0,
        roughness: 1,
        emissive: { x: 0, y: 0, z: 0 },
        emissiveIntensity: 1,
        opacity: 1,
        keepTextures: true,
        texture: "",
        parts: "",
      };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type { SceneDocument };

// Reproduces the editor's original fixed lighting (dark blue backdrop,
// hemisphere ambient 3, sun at (4, 8, 5) with intensity 3), so adding an
// Environment changes nothing until its values are edited.
// Mirrors engine::gameplay::ControllerSettings' own defaults.
export function defaultCharacterController(): CharacterControllerComponent {
  return {
    mode: "FirstPerson",
    walkSpeed: 4.5,
    sprintSpeed: 7.5,
    crouchSpeed: 2.2,
    jumpHeight: 1.1,
    standHeight: 1.8,
    crouchHeight: 1.1,
    stepHeight: 0.4,
    acceleration: 45,
    airControl: 12,
    lookSensitivity: 1,
    invertY: false,
    fov: 75,
    headBob: 1,
  };
}

export function defaultEnvironment(): EnvironmentComponent {
  return {
    sky: "Color",
    skyColor: { x: 0.063, y: 0.102, z: 0.149 },
    horizonColor: { x: 0.55, y: 0.7, z: 0.85 },
    groundColor: { x: 0.25, y: 0.31, z: 0.21 },
    sunElevation: 51.3,
    sunAzimuth: 38.7,
    sunIntensity: 3,
    sunColor: { x: 1, y: 1, z: 1 },
    ambientIntensity: 3,
    fog: "None",
    fogColor: { x: 0.063, y: 0.102, z: 0.149 },
    fogNear: 20,
    fogFar: 120,
    fogDensity: 0.015,
    shadows: true,
    exposure: 1,
  };
}
