import { test } from "node:test";
import assert from "node:assert/strict";
import { EditorDocument } from "../src/editor/Document";
import { serializeScene } from "../src/scene/SceneSerializer";
test("authoring edits, undo/redo, dirty state and stale handles", () => {
  const d = new EditorDocument();
  const r = d.execute({
    command: "spawn_entity",
    name: "Box",
    transform: [1, 2, 3],
  });
  assert.equal(r.ok, true);
  assert.ok(r.entity);
  assert.equal(d.dirty, true);
  d.markSaved();
  d.execute({
    command: "set_transform",
    entity: r.entity,
    position: [4, 5, 6],
  });
  d.undo();
  assert.equal(d.dirty, false);
  assert.equal(d.scene.alive(r.entity), false);
  d.redo();
  assert.equal(
    d.scene.get(d.scene.eachAlive()[0]!, "Transform")!.position.x,
    4,
  );
  assert.equal(
    d.execute({ command: "destroy_entity", entity: r.entity }).ok,
    false,
  );
});
test("invalid scene replacement leaves document and handles intact", () => {
  const d = new EditorDocument();
  const r = d.execute({ command: "spawn_entity", name: "Keep" });
  const before = d.save();
  assert.throws(() =>
    d.load({ format: 1, entities: [{ components: { Unknown: {} } }] }),
  );
  assert.deepEqual(d.save(), before);
  assert.ok(d.scene.alive(r.entity!));
  assert.throws(() =>
    d.load({
      format: 1,
      entities: [{ components: {}, parent: { index: 0, generation: 1 } }],
    }),
  );
  assert.deepEqual(d.save(), before);
});
test("finite values and hierarchy cycles rejected; hierarchy roundtrip survives reuse", () => {
  const d = new EditorDocument();
  const p = d.execute({ command: "spawn_entity", name: "Parent" }).entity!;
  const c = d.execute({ command: "spawn_entity", name: "Child" }).entity!;
  assert.equal(
    d.execute({
      command: "set_transform",
      entity: p,
      position: { x: Infinity, y: 0, z: 0 },
    }).ok,
    false,
  );
  assert.equal(
    d.execute({ command: "reparent_entity", entity: c, parent: p }).ok,
    true,
  );
  assert.equal(
    d.execute({ command: "reparent_entity", entity: p, parent: c }).ok,
    false,
  );
  const saved = d.save();
  d.load(saved);
  assert.deepEqual(d.save(), saved);
  assert.equal(d.scene.alive(p), false);
  const refs = d.scene.eachAlive();
  const parent = refs.find((e) => d.scene.get(e, "Name")?.value === "Parent")!;
  d.execute({ command: "destroy_entity", entity: parent });
  assert.equal(d.scene.query("Parent").length, 0);
});
test("duplicate carries component data and play prevents edits", () => {
  const d = new EditorDocument();
  d.execute({ command: "spawn_entity", name: "Box", transform: [2, 3, 4] });
  assert.equal(d.duplicate().ok, true);
  assert.equal(d.scene.entityCount, 2);
  d.undo();
  assert.equal(d.scene.entityCount, 1);
  const before = serializeScene(d.scene);
  d.mode = "play";
  assert.equal(d.execute({ command: "spawn_entity" }).ok, false);
  d.undo();
  assert.deepEqual(serializeScene(d.scene), before);
});

test("console save/load commands preserve scene data", () => {
  const d = new EditorDocument();
  const entity = d.execute({ command: "spawn_entity", name: "Saved" }).entity!;
  assert.equal(d.execute({ command: "save_scene", path: "test" }).ok, true);
  d.execute({ command: "destroy_entity", entity });
  assert.equal(d.execute({ command: "load_scene", path: "test" }).ok, true);
  assert.equal(d.scene.entityCount, 1);
  assert.equal(d.scene.alive(entity), false);
});

test("Player is a fieldless marker component that survives save/load", () => {
  const d = new EditorDocument();
  const entity = d.execute({ command: "spawn_entity", name: "Hero" }).entity!;
  assert.equal(
    d.execute({ command: "attach_component", entity, type: "Player" }).ok,
    true,
  );
  assert.deepEqual(d.scene.get(entity, "Player"), {});
  assert.equal(d.execute({ command: "save_scene", path: "player-test" }).ok, true);
  d.execute({ command: "destroy_entity", entity });
  assert.equal(d.execute({ command: "load_scene", path: "player-test" }).ok, true);
  const [[reloaded]] = d.scene.query("Player");
  assert.ok(reloaded, "Player component did not survive save/load");
  assert.equal(
    d.execute({ command: "remove_component", entity: reloaded, type: "Player" }).ok,
    true,
  );
  assert.equal(d.scene.has(reloaded, "Player"), false);
});

test("Script attaches with a starter template, edits round-trip through save/load, and a non-string source is rejected", () => {
  const d = new EditorDocument();
  const entity = d.execute({ command: "spawn_entity", name: "Scripted" }).entity!;
  assert.equal(
    d.execute({ command: "attach_component", entity, type: "Script" }).ok,
    true,
  );
  assert.match(d.scene.get(entity, "Script")!.source, /on_tick/);
  assert.equal(
    d.execute({
      command: "set_component",
      entity,
      type: "Script",
      value: { source: "function on_tick(dt) self.vx = 2 end" },
    }).ok,
    true,
  );
  assert.equal(d.execute({ command: "save_scene", path: "script-test" }).ok, true);
  d.execute({ command: "destroy_entity", entity });
  assert.equal(d.execute({ command: "load_scene", path: "script-test" }).ok, true);
  const [[reloaded]] = d.scene.query("Script");
  assert.ok(reloaded, "Script component did not survive save/load");
  assert.equal(
    d.scene.get(reloaded, "Script")!.source,
    "function on_tick(dt) self.vx = 2 end",
  );
  assert.throws(() =>
    d.load({
      format: 1,
      entities: [{ name: "Bad", components: { Script: { source: 42 } } }],
    }),
  );
});

test("prefabs: create, place, live-shared edits propagate, Transform stays per-instance, unlink detaches, save/load round-trips", () => {
  const d = new EditorDocument();
  const source = d.execute({ command: "spawn_entity", name: "Car", transform: [0, 0, 0] }).entity!;
  d.execute({ command: "attach_component", entity: source, type: "Health" });
  d.execute({
    command: "set_component",
    entity: source,
    type: "Health",
    value: { current: 80, maximum: 80 },
  });
  const create = d.execute({ command: "create_prefab", entity: source, name: "Player Car" });
  assert.equal(create.ok, true);
  // Creating a prefab moves Health off the entity's own storage onto the
  // shared definition -- the entity itself no longer literally owns it.
  assert.equal(d.scene.has(source, "Health"), false);
  assert.equal(d.scene.get(source, "PrefabInstance")?.prefab, "Player Car");
  assert.equal(d.scene.resolve(source, "Health")?.maximum, 80);
  assert.equal(d.execute({ command: "create_prefab", entity: source, name: "Player Car" }).ok, false);

  const place = d.execute({
    command: "place_instance",
    prefab: "Player Car",
    transform: [10, 0, 0],
  });
  assert.equal(place.ok, true);
  const instance = place.entity!;
  assert.equal(d.scene.resolve(instance, "Health")?.maximum, 80, "a new instance shares the prefab's data");
  assert.equal(d.execute({ command: "place_instance", prefab: "Nonexistent" }).ok, false);

  // Editing the shared component through either instance updates both --
  // live-shared, no per-instance override, as designed.
  assert.equal(
    d.execute({
      command: "set_component",
      entity: instance,
      type: "Health",
      value: { current: 50, maximum: 50 },
    }).ok,
    true,
  );
  assert.equal(d.scene.resolve(source, "Health")?.maximum, 50, "editing one instance updates the other");
  assert.equal(d.scene.resolve(instance, "Health")?.maximum, 50);

  // Transform is always per-instance: moving one never moves the other.
  assert.equal(d.scene.get(source, "Transform")!.position.x, 0);
  assert.equal(d.scene.get(instance, "Transform")!.position.x, 10);

  // Unlinking freezes the resolved data as the entity's own, disconnected
  // from later prefab edits.
  assert.equal(d.execute({ command: "unlink_instance", entity: instance }).ok, true);
  assert.equal(d.scene.has(instance, "PrefabInstance"), false);
  assert.equal(d.scene.get(instance, "Health")?.maximum, 50);
  assert.equal(
    d.execute({
      command: "set_component",
      entity: source,
      type: "Health",
      value: { current: 10, maximum: 10 },
    }).ok,
    true,
  );
  assert.equal(d.scene.get(instance, "Health")?.maximum, 50, "unlinked instance is unaffected by later prefab edits");
  assert.equal(d.execute({ command: "unlink_instance", entity: instance }).ok, false);

  const saved = d.save();
  d.execute({ command: "destroy_entity", entity: source });
  d.load(saved);
  const [[reloadedSource]] = d.scene.query("PrefabInstance");
  assert.equal(d.scene.resolve(reloadedSource, "Health")?.maximum, 10);
  assert.throws(
    () =>
      d.load({
        format: 1,
        entities: [{ components: { PrefabInstance: { prefab: "Ghost" } } }],
      }),
    /unknown prefab/i,
  );
});

test("prefabs: specialized commands (set_velocity/set_physics/set_ai_state/trigger_animation) route through prefab storage too, not just set_component", () => {
  const d = new EditorDocument();
  const source = d.execute({ command: "spawn_entity", name: "Guard" }).entity!;
  d.execute({ command: "attach_component", entity: source, type: "AIState" });
  d.execute({ command: "create_prefab", entity: source, name: "Guard" });
  const other = d.execute({ command: "place_instance", prefab: "Guard" }).entity!;

  assert.equal(d.execute({ command: "set_ai_state", entity: source, state: "Chasing" }).ok, true);
  assert.equal(
    d.scene.resolve(other, "AIState")?.state,
    "Chasing",
    "set_ai_state on one instance must update the shared prefab, not create an entity-local override",
  );

  assert.equal(d.execute({ command: "set_velocity", entity: source, velocity: [1, 2, 3] }).ok, true);
  assert.equal(d.scene.resolve(other, "Velocity")?.value.x, 1);

  assert.equal(d.execute({ command: "set_physics", entity: source, dynamic: true, mass: 5 }).ok, true);
  assert.equal(d.scene.resolve(other, "RigidBody")?.mass, 5);
  assert.equal(d.scene.resolve(other, "Collider") !== undefined, true, "set_physics's default Collider is shared too");

  assert.equal(
    d.execute({ command: "trigger_animation", entity: source, clip: "wave", looping: false }).ok,
    true,
  );
  assert.equal(d.scene.resolve(other, "AnimationState")?.clip, "wave");
});

test("Vehicle/Pedestrian.archetype: a valid index round-trips, an out-of-range one is rejected", () => {
  const d = new EditorDocument();
  const car = d.execute({ command: "spawn_entity", name: "Car" }).entity!;
  d.execute({ command: "attach_component", entity: car, type: "Vehicle" });
  assert.equal(d.scene.resolve(car, "Vehicle")?.archetype, 0, "defaultComponent: Car");
  assert.equal(
    d.execute({
      command: "set_component",
      entity: car,
      type: "Vehicle",
      value: { archetype: 1 }, // Sports
    }).ok,
    true,
  );
  assert.equal(d.scene.resolve(car, "Vehicle")?.archetype, 1);
  // vehicle_tuning (bridge.cpp) has 4 rows (Car/Sports/Truck/Bus) -- index 4 doesn't exist.
  const overVehicle = d.execute({
    command: "set_component",
    entity: car,
    type: "Vehicle",
    value: { archetype: 4 },
  });
  assert.equal(overVehicle.ok, false);
  assert.equal(d.scene.resolve(car, "Vehicle")?.archetype, 1, "rejected write must not partially apply");

  const walker = d.execute({ command: "spawn_entity", name: "Walker" }).entity!;
  d.execute({ command: "attach_component", entity: walker, type: "Pedestrian" });
  assert.equal(d.scene.resolve(walker, "Pedestrian")?.archetype, 0, "defaultComponent: Casual");
  assert.equal(
    d.execute({
      command: "set_component",
      entity: walker,
      type: "Pedestrian",
      value: { archetype: 2 }, // Lingering
    }).ok,
    true,
  );
  assert.equal(d.scene.resolve(walker, "Pedestrian")?.archetype, 2);
  // pedestrian_tuning (bridge.cpp) has 3 rows (Casual/Brisk/Lingering) -- index 3 doesn't exist.
  const overPedestrian = d.execute({
    command: "set_component",
    entity: walker,
    type: "Pedestrian",
    value: { archetype: 3 },
  });
  assert.equal(overPedestrian.ok, false);
  assert.equal(d.scene.resolve(walker, "Pedestrian")?.archetype, 2);
});

test("prefabs: unlinking clones component data -- editing the unlinked entity never mutates the prefab or a sibling instance", () => {
  const d = new EditorDocument();
  const source = d.execute({ command: "spawn_entity", name: "Drone" }).entity!;
  d.execute({ command: "attach_component", entity: source, type: "RigidBody" });
  d.execute({ command: "create_prefab", entity: source, name: "Drone" });
  const sibling = d.execute({ command: "place_instance", prefab: "Drone" }).entity!;
  const unlinked = d.execute({ command: "place_instance", prefab: "Drone" }).entity!;

  d.execute({ command: "unlink_instance", entity: unlinked });
  d.execute({ command: "set_physics", entity: unlinked, dynamic: true, mass: 42 });
  assert.equal(d.scene.get(unlinked, "RigidBody")?.mass, 42);
  assert.equal(
    d.scene.resolve(sibling, "RigidBody")?.mass,
    1,
    "editing the unlinked entity must not mutate the prefab's own RigidBody object",
  );
  assert.equal(d.scene.resolve(source, "RigidBody")?.mass, 1);
});

test("place_instance validates its inputs before creating an entity -- a failed call leaks nothing", () => {
  const d = new EditorDocument();
  const source = d.execute({ command: "spawn_entity", name: "Base" }).entity!;
  d.execute({ command: "create_prefab", entity: source, name: "Base" });
  const before = d.scene.entityCount;
  assert.equal(
    d.execute({ command: "place_instance", prefab: "Base", transform: "not-a-vec3" }).ok,
    false,
  );
  assert.equal(d.scene.entityCount, before, "a failed place_instance must not leave a leaked entity behind");
});

test("a prefab literally named __proto__ round-trips through save/load", () => {
  const d = new EditorDocument();
  const source = d.execute({ command: "spawn_entity", name: "Odd" }).entity!;
  d.execute({ command: "attach_component", entity: source, type: "Health" });
  d.execute({ command: "create_prefab", entity: source, name: "__proto__" });
  const saved = d.save();
  assert.ok(
    Object.prototype.hasOwnProperty.call(saved.prefabs ?? {}, "__proto__"),
    "a prefab named __proto__ must serialize as a real own property, not silently vanish",
  );
  d.load(saved);
  assert.equal(d.scene.hasPrefab("__proto__"), true);
  const [[reloaded]] = d.scene.query("PrefabInstance");
  assert.equal(d.scene.resolve(reloaded, "Health")?.maximum, 100);
});

test("Sound attaches with sensible defaults, edits round-trip through save/load, volume is validated to [0,1], and Sound is prefab-shared", () => {
  const d = new EditorDocument();
  const entity = d.execute({ command: "spawn_entity", name: "Siren" }).entity!;
  assert.equal(d.execute({ command: "attach_component", entity, type: "Sound" }).ok, true);
  const attached = d.scene.get(entity, "Sound");
  assert.equal(attached?.clip, 1);
  assert.equal(attached?.autoplay, true);

  assert.equal(
    d.execute({
      command: "set_component",
      entity,
      type: "Sound",
      value: { clip: 5, volume: 0.5, loop: true, autoplay: true },
    }).ok,
    true,
  );
  assert.equal(d.execute({ command: "save_scene", path: "sound-test" }).ok, true);
  d.execute({ command: "destroy_entity", entity });
  assert.equal(d.execute({ command: "load_scene", path: "sound-test" }).ok, true);
  const [[reloaded]] = d.scene.query("Sound");
  assert.equal(d.scene.get(reloaded, "Sound")?.clip, 5);
  assert.equal(d.scene.get(reloaded, "Sound")?.volume, 0.5);
  assert.equal(d.scene.get(reloaded, "Sound")?.loop, true);

  assert.throws(
    () =>
      d.load({
        format: 1,
        entities: [
          { components: { Sound: { clip: 1, volume: 1.5, loop: false, autoplay: true } } },
        ],
      }),
    /between 0 and 1/i,
  );

  // Sound is a prefab-shared component like Renderable/Script -- editing one
  // instance's clip updates every instance live.
  const source = d.execute({ command: "spawn_entity", name: "Car" }).entity!;
  d.execute({ command: "attach_component", entity: source, type: "Sound" });
  d.execute({ command: "create_prefab", entity: source, name: "Car" });
  const other = d.execute({ command: "place_instance", prefab: "Car" }).entity!;
  assert.equal(
    d.execute({
      command: "set_component",
      entity: source,
      type: "Sound",
      value: { clip: 2, volume: 1, loop: true, autoplay: true },
    }).ok,
    true,
  );
  assert.equal(d.scene.resolve(other, "Sound")?.clip, 2, "a shared Sound clip change reaches every instance live");
});

test("Light attaches with sensible defaults, edits round-trip through save/load, color/angle are validated, and Light is prefab-shared", () => {
  const d = new EditorDocument();
  const entity = d.execute({ command: "spawn_entity", name: "Lamp" }).entity!;
  assert.equal(d.execute({ command: "attach_component", entity, type: "Light" }).ok, true);
  const attached = d.scene.get(entity, "Light");
  assert.equal(attached?.type, "Point");
  assert.ok(attached!.intensity > 0);

  assert.equal(
    d.execute({
      command: "set_component",
      entity,
      type: "Light",
      value: {
        type: "Spot",
        color: { x: 0.2, y: 0.4, z: 1 },
        intensity: 5,
        range: 20,
        angle: 0.4,
      },
    }).ok,
    true,
  );
  assert.equal(d.execute({ command: "save_scene", path: "light-test" }).ok, true);
  d.execute({ command: "destroy_entity", entity });
  assert.equal(d.execute({ command: "load_scene", path: "light-test" }).ok, true);
  const [[reloaded]] = d.scene.query("Light");
  assert.equal(d.scene.get(reloaded, "Light")?.type, "Spot");
  assert.equal(d.scene.get(reloaded, "Light")?.color.z, 1);
  assert.equal(d.scene.get(reloaded, "Light")?.angle, 0.4);

  assert.throws(
    () =>
      d.load({
        format: 1,
        entities: [
          {
            components: {
              Light: {
                type: "Point",
                color: { x: 1.5, y: 1, z: 1 },
                intensity: 1,
                range: 0,
                angle: 0.5,
              },
            },
          },
        ],
      }),
    /between 0 and 1/i,
  );
  assert.throws(
    () =>
      d.load({
        format: 1,
        entities: [
          {
            components: {
              Light: {
                type: "Spot",
                color: { x: 1, y: 1, z: 1 },
                intensity: 1,
                range: 0,
                angle: Math.PI,
              },
            },
          },
        ],
      }),
    /PI\/2/,
  );
  assert.throws(
    () =>
      d.load({
        format: 1,
        entities: [
          {
            components: {
              Light: {
                type: "Laser",
                color: { x: 1, y: 1, z: 1 },
                intensity: 1,
                range: 0,
                angle: 0.5,
              },
            },
          },
        ],
      }),
    /Point, Spot, or Directional/,
  );

  // Light is a prefab-shared component like Renderable/Sound -- editing one
  // instance's color updates every instance live.
  const source = d.execute({ command: "spawn_entity", name: "Streetlamp" }).entity!;
  d.execute({ command: "attach_component", entity: source, type: "Light" });
  d.execute({ command: "create_prefab", entity: source, name: "Streetlamp" });
  const other = d.execute({ command: "place_instance", prefab: "Streetlamp" }).entity!;
  assert.equal(
    d.execute({
      command: "set_component",
      entity: source,
      type: "Light",
      value: { type: "Point", color: { x: 1, y: 0, z: 0 }, intensity: 3, range: 10, angle: 0.5 },
    }).ok,
    true,
  );
  assert.equal(
    d.scene.resolve(other, "Light")?.color.x,
    1,
    "a shared Light color change reaches every instance live",
  );
});

test("Particles attaches with sensible defaults, edits round-trip through save/load, color/rate/lifetime/size are validated, and Particles is prefab-shared", () => {
  const d = new EditorDocument();
  const entity = d.execute({ command: "spawn_entity", name: "Torch" }).entity!;
  assert.equal(d.execute({ command: "attach_component", entity, type: "Particles" }).ok, true);
  const attached = d.scene.get(entity, "Particles");
  assert.equal(attached?.preset, "Sparkle");
  assert.ok(attached!.rate > 0);
  assert.ok(attached!.lifetime > 0);

  assert.equal(
    d.execute({
      command: "set_component",
      entity,
      type: "Particles",
      value: {
        preset: "Fire",
        color: { x: 1, y: 0.4, z: 0 },
        rate: 40,
        lifetime: 0.8,
        speed: 2,
        size: 0.2,
      },
    }).ok,
    true,
  );
  assert.equal(d.execute({ command: "save_scene", path: "particles-test" }).ok, true);
  d.execute({ command: "destroy_entity", entity });
  assert.equal(d.execute({ command: "load_scene", path: "particles-test" }).ok, true);
  const [[reloaded]] = d.scene.query("Particles");
  assert.equal(d.scene.get(reloaded, "Particles")?.preset, "Fire");
  assert.equal(d.scene.get(reloaded, "Particles")?.color.y, 0.4);
  assert.equal(d.scene.get(reloaded, "Particles")?.rate, 40);

  const base = {
    preset: "Sparkle",
    color: { x: 1, y: 1, z: 1 },
    rate: 10,
    lifetime: 1,
    speed: 1,
    size: 0.1,
  };
  assert.throws(
    () =>
      d.load({
        format: 1,
        entities: [{ components: { Particles: { ...base, color: { x: 1.5, y: 1, z: 1 } } } }],
      }),
    /between 0 and 1/i,
  );
  assert.throws(
    () =>
      d.load({
        format: 1,
        entities: [{ components: { Particles: { ...base, lifetime: 0 } } }],
      }),
    /must be positive/i,
  );
  assert.throws(
    () =>
      d.load({
        format: 1,
        entities: [{ components: { Particles: { ...base, size: -1 } } }],
      }),
    /must be positive/i,
  );
  assert.throws(
    () =>
      d.load({
        format: 1,
        entities: [{ components: { Particles: { ...base, rate: -1 } } }],
      }),
    /must be non-negative/i,
  );
  assert.throws(
    () =>
      d.load({
        format: 1,
        entities: [{ components: { Particles: { ...base, preset: "Rainbow" } } }],
      }),
    /Sparkle, Smoke, Fire, or Confetti/,
  );

  // Particles is a prefab-shared component like Renderable/Sound/Light --
  // editing one instance's rate updates every instance live.
  const source = d.execute({ command: "spawn_entity", name: "Campfire" }).entity!;
  d.execute({ command: "attach_component", entity: source, type: "Particles" });
  d.execute({ command: "create_prefab", entity: source, name: "Campfire" });
  const other = d.execute({ command: "place_instance", prefab: "Campfire" }).entity!;
  assert.equal(
    d.execute({
      command: "set_component",
      entity: source,
      type: "Particles",
      value: { ...base, rate: 99 },
    }).ok,
    true,
  );
  assert.equal(
    d.scene.resolve(other, "Particles")?.rate,
    99,
    "a shared Particles rate change reaches every instance live",
  );
});
