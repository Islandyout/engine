import type { SceneComponents } from "../../scene/Scene";
import { encodeProps, reconcileProps } from "../../scene/scriptProps";
import { pickupLootLine } from "../lootView";
import { instanceBox, parseModelInstances } from "../modelInstances";
import { isNonPhysical } from "../settingsEntity";
import { parseSpaceBodies } from "../spaceView";
import {
	generateHeights,
	parseScatter,
	scatterInstances
} from "../terrain";
import { scatterObstacle } from "../terrainMesh";
import type { Ctx } from "./context";

export function installRuntimeSync(C: Ctx): void {
  // Sends one entity's components to the runtime being staged: a scene
  // entity at `index`, or (index -1) the prefab template editor_template_begin
  // just announced. `get` resolves a component the same way for both.
  function addToRuntime(
    get: <K extends keyof SceneComponents>(type: K) => SceneComponents[K] | undefined,
    isChild: number,
    index: number,
    name: string | undefined,
  ) {
    const p = get("Transform")?.position ?? { x: 0, y: 0, z: 0 };
    const v = get("Velocity")?.value ?? { x: 0, y: 0, z: 0 };
    // Without a Scale the model is drawn at its own size (sceneObjects), so that is the body's size too:
    // a Collider on a freshly placed catalog model must be as big as the model looks.
    const meshId = get("Renderable")?.mesh ?? 0;
    const native = !get("Scale") && meshId >= 1 ? C.catalogCache.get(meshId)?.nativeSize : undefined;
    const s = get("Scale")?.value ?? (native ? { x: native.x, y: native.y, z: native.z } : { x: 1, y: 1, z: 1 });
    const isPlayer = get("Player") ? 1 : 0;
    const collider = get("Collider");
    const isCollider = collider ? 1 : 0;
    // "Sphere"/radius have been authorable here for a while (PropertyMetadata's
    // Collider.type dropdown), previously discarded entirely -- editor_add
    // now actually resolves the shape it's told, not always an AABB from Scale.
    const colliderShape = collider?.type === "Sphere" ? 1 : 0;
    const colliderRadius = collider?.radius ?? 0.5;
    // An AABB collider's box is Scale times twice its halfExtents (0.5, the
    // default, fills the unit cube Scale stretches).
    const he = collider?.type === "AABB" ? collider.halfExtents : undefined;
    const box = he ? { x: s.x * 2 * he.x, y: s.y * 2 * he.y, z: s.z * 2 * he.z } : s;
    const isVehicle = get("Vehicle") ? 1 : 0;
    const isAi = get("AIState") ? 1 : 0;
    const isPedestrian = get("Pedestrian") ? 1 : 0;
    // Vehicle.archetype/Pedestrian.archetype have been authorable for a
    // while (their own PropertyMetadata dropdowns below) but previously
    // discarded entirely -- editor_add now actually resolves the handling/
    // wander profile it's told, not always the same one regardless.
    const vehicleArchetype = get("Vehicle")?.archetype ?? 0;
    const pedestrianArchetype = get("Pedestrian")?.archetype ?? 0;
    const health = get("Health");
    // hp_max <= 0 is the bridge's own "no Health" sentinel (see
    // editor_add's doc comment) — a real Health always has a positive max.
    const hpCurrent = health?.current ?? 0;
    const hpMax = health?.maximum ?? 0;
    if (
      !C.runtime._editor_add(
        p.x,
        p.y,
        p.z,
        v.x,
        v.y,
        v.z,
        box.x,
        box.y,
        box.z,
        // Settings-only entities ride along like hierarchy children: no body.
        isChild || (isNonPhysical(get) ? 1 : 0),
        isPlayer,
        isCollider,
        hpCurrent,
        hpMax,
        isVehicle,
        isAi,
        isPedestrian,
        colliderShape,
        colliderRadius,
        vehicleArchetype,
        pedestrianArchetype,
      )
    ) {
      C.runtime._editor_commit();
      throw new Error("Runtime rejects coordinates/velocity outside ±1,000,000");
    }
    // Mass/dynamic and trigger/layer/mask/bounciness: see editor_set_body
    // and editor_set_collider (bridge.cpp) for what each one means.
    const body = get("RigidBody");
    C.runtime._editor_set_body(index, body ? 1 : 0, body?.mass ?? 1, body?.dynamic === false ? 0 : 1);
    if (collider) C.runtime._editor_set_collider(index, collider.isTrigger ? 1 : 0, collider.layer, collider.mask, collider.bounciness);
    // CharacterController: see editor_set_controller (bridge.cpp).
    const controller = get("CharacterController");
    if (controller && !isChild)
      C.runtime._editor_set_controller(
        index,
        controller.mode === "FirstPerson" ? 0 : 1,
        controller.walkSpeed,
        controller.sprintSpeed,
        controller.crouchSpeed,
        controller.jumpHeight,
        controller.standHeight,
        controller.crouchHeight,
        controller.stepHeight,
        controller.acceleration,
        controller.airControl,
      );
    // Arcade Vehicle and Driver: see editor_set_car and
    // editor_set_driver (bridge.cpp). Steering is authored in degrees.
    const vehicle = get("Vehicle");
    if (vehicle?.model === "Arcade" && !isChild) {
      C.runtime._editor_set_car(
        index,
        get("Rotation")?.euler.y ?? 0,
        vehicle.topSpeed,
        vehicle.acceleration,
        vehicle.braking,
        vehicle.grip,
        vehicle.driftGrip,
        (vehicle.steering * Math.PI) / 180,
        vehicle.nitroBoost,
        vehicle.nitroSeconds,
        vehicle.gears,
        vehicle.enterable ? 1 : 0,
        vehicle.enterRadius,
      );
      const driver = get("Driver");
      if (driver) {
        C.runtime._editor_set_driver(
          index,
          { Off: 0, Race: 1, Pursuit: 2, Traffic: 3 }[driver.mode],
          driver.loop ? 1 : 0,
          driver.skill,
          driver.aggression,
          driver.speedScale,
        );
        if (driver.route) C.runtime.ccall("editor_set_driver_text", null, ["number", "number", "string"], [index, 0, driver.route]);
        if (driver.target) C.runtime.ccall("editor_set_driver_text", null, ["number", "number", "string"], [index, 1, driver.target]);
      }
    }
    // Spaceship: see editor_set_spaceship (bridge.cpp); the first
    // one is flown by the scene's SpaceSystem.
    const ship = get("Spaceship");
    if (ship && !isChild && index >= 0 && index === C.shipIndex)
      C.runtime._editor_set_spaceship(
        index,
        get("Rotation")?.euler.y ?? 0,
        ship.mass,
        ship.thrust,
        ship.liftThrust,
        ship.rcs,
        (ship.maxRate * Math.PI) / 180,
        ship.fuel,
        ship.burn,
        ship.hull,
        ship.gearClearance,
        ship.startPiloting ? 1 : 0,
        ship.startOrbit,
      );
    // Routine and Wildlife: see editor_set_routine/editor_set_wildlife.
    const routine = get("Routine");
    if (routine && !isChild && index >= 0) C.runtime.ccall("editor_set_routine", null, ["number", "string", "number"], [index, routine.stops, routine.speed]);
    const wildlife = get("Wildlife");
    if (wildlife && !isChild && index >= 0) C.runtime._editor_set_wildlife(index, wildlife.wary, wildlife.flee, wildlife.speed, wildlife.leash);
    // Streets: see editor_set_signal/editor_set_walker (bridge_street.cpp).
    const signal = get("TrafficSignal");
    if (signal && !isChild && index >= 0) C.runtime._editor_set_signal(index, signal.green, signal.yellow, signal.clearance, signal.offset, signal.radius);
    const walker = get("Walker");
    if (walker && !isChild)
      C.runtime.ccall(
        "editor_set_walker",
        null,
        ["number", "string", "number", "number", "string", "number"],
        [index, walker.route, walker.speed, walker.loop ? 1 : 0, walker.follow, walker.gap],
      );
    // Weapons: see editor_set_weapons (bridge.cpp).
    const weapons = get("Weapons");
    if (weapons && !isChild) {
      C.runtime.ccall("editor_set_weapons", null, ["number", "string"], [index, weapons.loadout]);
      C.runtime._editor_set_aim_assist(index, weapons.aimAssist, weapons.assistRange);
    }
    // Loot: see editor_set_pickup / _loot_drop / _container (bridge_loot.cpp).
    const pickup = get("Pickup");
    if (pickup && !isChild)
      C.runtime.ccall("editor_set_pickup", null, ["number", "string", "number", "number"], [index, pickupLootLine(pickup), pickup.press ? 1 : 0, pickup.respawn]);
    const lootDrop = get("LootDrop");
    if (lootDrop && !isChild) C.runtime.ccall("editor_set_loot_drop", null, ["number", "number", "string"], [index, lootDrop.dropWeapon ? 1 : 0, lootDrop.table]);
    const container = get("Container");
    if (container && !isChild) C.runtime.ccall("editor_set_container", null, ["number", "string", "number", "string"], [index, container.table, container.hold, container.key]);
    const inventory = get("Inventory");
    if (inventory && !isChild)
      C.runtime.ccall("editor_set_inventory", null, ["number", "number", "number", "string", "string", "string", "string", "string"], [index, inventory.slots, inventory.maxWeight, inventory.weights, inventory.stats, inventory.head, inventory.body, inventory.hands]);
    // Melee: see editor_set_melee (bridge_melee.cpp).
    const melee = get("Melee");
    if (melee && !isChild) {
      C.runtime.ccall(
        "editor_set_melee",
        null,
        ["number", "number", "string", "number", "number", "number", "number", "number", "number", "number"],
        [index, { "Martial arts": 0, Sword: 1, Custom: 2 }[melee.style], melee.moves, melee.team, melee.ai ? 1 : 0, melee.aggression, melee.skill, melee.reaction, melee.energy, melee.guard],
      );
      C.runtime._editor_set_melee_yaw(index, get("Rotation")?.euler.y ?? 0);
      C.runtime._editor_set_melee_extra(index, melee.poise, melee.breakTime, melee.manaMax, melee.manaRegen, melee.range, melee.shield ? 1 : 0);
    }
    // A Terrain entity's own body must never fall or move.
    if (get("Terrain")) C.runtime._editor_set_body(index, 1, 1, 0);
    // AICombat: see editor_set_soldier (bridge.cpp).
    const combat = get("AICombat");
    if (combat && !isChild) {
      C.runtime._editor_set_soldier(
        index,
        combat.team,
        { Patrol: 0, Guard: 1, Hunt: 2 }[combat.behavior],
        combat.sightRange,
        combat.fov,
        combat.hearingRange,
        combat.reactionTime,
        combat.accuracy,
        combat.preferredRange,
        combat.moveSpeed,
        combat.burst,
        combat.burstPause,
        combat.useCover ? 1 : 0,
        combat.fleeHealth,
        combat.meleeDamage,
      );
      if (combat.patrol) C.runtime.ccall("editor_set_soldier_patrol", null, ["number", "string"], [index, combat.patrol]);
    }
    // A rotated Box collider collides as an oriented box.
    const rotation = get("Rotation")?.euler;
    if (collider && rotation && (rotation.x || rotation.y || rotation.z)) C.runtime._editor_set_rotation(index, rotation.x, rotation.y, rotation.z);
    if (name !== undefined) C.runtime.ccall("editor_set_name", null, ["number", "string"], [index, name]);
    // editor_add's own all-double ABI has no way to carry a Lua source
    // string, so a scripted entity's source is set through this companion
    // call instead (see editor_set_script_source's own doc comment,
    // bridge.cpp) — same index editor_add just placed this entity at.
    const script = get("Script");
    if (script) {
      C.runtime.ccall("editor_set_script_source", null, ["number", "string"], [index, script.source]);
      C.runtime.ccall("editor_set_script_props", null, ["number", "string"], [index, encodeProps(reconcileProps(script.source, script.props))]);
    }
  }

  function syncRuntime() {
    C.uiTextOverrides.clear();
    C.uiColorOverrides.clear();
    C.uiMarkers.clear();
    C.districtMap.reset();
    C.uiValues.clear();
    C.uiVisibility.clear();
    C.openUI.clear();
    C.hiddenWalker = -1;
    C.onPickupTimers.length = 0;
    C.draggingSlider = undefined;
    C.padSnapshot = undefined;
    C.pointerQueue.length = 0;
    C.runtime._editor_begin();
    C.applySiteView(); // shows what the editor's site view hid
    C.playerIndex = -1;
    C.shipIndex = -1;
    C.stageSpaceSystem();
    // Prefab templates first, so a script's world.spawn("Name") can
    // instantiate any prefab (bridge.cpp's Runtime::templates).
    for (const [name, definition] of C.doc.scene.prefabEntries()) {
      C.runtime.ccall("editor_template_begin", null, ["string"], [name]);
      const components = definition.components as Partial<SceneComponents>;
      addToRuntime((type) => components[type], 0, -1, name);
    }
    // Sites: a Site's direct children are simulated like top-level
    // entities, at their site-local positions (the Site itself sits at the
    // origin while playing).
    const alive = C.doc.scene.eachAlive();
    const sites = C.spaceComponent() ? alive.filter((e) => C.doc.scene.effectiveHas(e, "Site")) : [];
    C.siteIndices = sites.map((e) => alive.indexOf(e));
    const siteOf = (entity: (typeof alive)[number]) => {
      const parent = C.doc.scene.resolve(entity, "Parent")?.entity;
      return parent ? sites.findIndex((s) => s.index === parent.index && s.generation === parent.generation) : -1;
    };
    C.memberSite = alive.map((e) => siteOf(e));
    alive.forEach((entity, index) => {
      const isChild = C.doc.scene.effectiveHas(entity, "Parent") && C.memberSite[index]! < 0 ? 1 : 0;
      // First Player-tagged entity wins if more than one is authored — the
      // bridge itself would happily drive every one of them from the same
      // input, but only one can sensibly own the camera and status readout.
      if (C.doc.scene.effectiveHas(entity, "Player") && C.playerIndex < 0) C.playerIndex = index;
      if (C.doc.scene.effectiveHas(entity, "Spaceship") && !isChild && C.shipIndex < 0 && C.spaceComponent()) C.shipIndex = index;
      const isSite = C.doc.scene.effectiveHas(entity, "Site");
      addToRuntime(
        (type) => (isSite && type === "Transform" ? ({ position: { x: 0, y: 0, z: 0 } } as SceneComponents[typeof type]) : C.doc.scene.resolve(entity, type)),
        isChild,
        index,
        C.doc.scene.resolve(entity, "Name")?.value,
      );
    });
    if (sites.length) {
      const { bodies } = parseSpaceBodies(C.spaceComponent()!.bodies);
      sites.forEach((entity, n) => {
        const site = C.doc.scene.resolve(entity, "Site")!;
        const body = bodies.findIndex((b) => b.name === site.body);
        if (body < 0) C.log(`Site "${site.name}": no body "${site.body}"`);
        C.runtime.ccall(
          "editor_space_site",
          null,
          ["number", "string", "number", "number", "number", "number"],
          [C.siteIndices[n]!, site.name, Math.max(body, 0), site.latitude, site.longitude, site.radius],
        );
      });
      C.memberSite.forEach((site, index) => {
        if (site >= 0) C.runtime._editor_space_member(index, site);
      });
    }
    // The first Terrain is the simulated one (editor_set_terrain), plus its
    // colliding scatter as static obstacles.
    const terrainEntity = C.doc.scene.eachAlive().find((e) => C.doc.scene.effectiveHas(e, "Terrain"));
    const terrain = terrainEntity && C.doc.scene.resolve(terrainEntity, "Terrain");
    if (terrainEntity && terrain) {
      const center = C.doc.scene.resolve(terrainEntity, "Transform")?.position ?? { x: 0, y: 0, z: 0 };
      const params = C.terrainParams(terrain);
      const heights = generateHeights(params);
      // Heights go through the heap: up to 1025^2 floats is too big for the stack.
      const ptr = C.runtime._malloc(heights.byteLength);
      try {
        C.runtime.HEAPF32.set(heights, ptr >> 2);
        C.runtime._editor_set_terrain(center.x, center.y, center.z, params.size, params.resolution, ptr, heights.length);
      } finally {
        C.runtime._free(ptr);
      }
      const scatter = parseScatter(terrain.scatter);
      for (const instance of scatterInstances(params, heights, scatter.rules, scatter.exclusions, terrain)) {
        if (!instance.collide) continue;
        const box = scatterObstacle(instance, C.catalogCache.get(instance.model)?.nativeSize);
        C.runtime._editor_add_obstacle(center.x + box.x, center.y + box.y, center.z + box.z, box.sx, box.sy, box.sz);
      }
    }
    // Solid ModelInstances as static obstacles, footprint and all.
    for (const entity of C.doc.scene.eachAlive()) {
      const mi = C.doc.scene.resolve(entity, "ModelInstances");
      if (!mi) continue;
      const at = C.doc.scene.resolve(entity, "Transform")?.position ?? { x: 0, y: 0, z: 0 };
      for (const instance of parseModelInstances(mi.instances).instances) {
        const size = instance.solid ? C.catalogCache.get(instance.model)?.nativeSize : undefined;
        if (!size) continue;
        const box = instanceBox(instance, size);
        C.runtime._editor_add_obstacle(at.x + box.x, at.y + box.y, at.z + box.z, box.sx, box.sy, box.sz);
      }
    }
    // Custom action bindings: the first InputActions component in the scene.
    const bindingsEntity = C.doc.scene.eachAlive().find((e) => C.doc.scene.effectiveHas(e, "InputActions"));
    const bindings = bindingsEntity && C.doc.scene.resolve(bindingsEntity, "InputActions");
    if (bindings) C.runtime.ccall("editor_set_input_bindings", null, ["string"], [bindings.bindings]);
    if (!C.runtime._editor_commit())
      throw new Error(`Runtime scene commit failed: ${C.runtime.ccall("editor_last_error", "string", [], []) || "no reason given"}`);
    const bindingsError = C.runtime.ccall("editor_bindings_error", "string", [], []);
    if (bindingsError) C.log(`Input bindings: ${bindingsError} (using the defaults)`);
    const weaponsError = C.runtime.ccall("editor_weapons_error", "string", [], []);
    if (weaponsError) C.log(`Weapons: ${weaponsError} (using the default loadout)`);
    C.seedSavedProgress();
    C.ticks = 0;
    C.accumulator = 0;
    C.keyQueue.length = 0;
    C.heldKeys.clear();
  }
  Object.assign(C, { syncRuntime });
}
