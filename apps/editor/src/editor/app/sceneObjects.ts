import * as THREE from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { defaultEnvironment } from "../../authoring/CommandInterpreter";
import type {
	MaterialComponent,
	TerrainComponent,
	Vec3
} from "../../scene/Components";
import type { SceneComponents } from "../../scene/Scene";
import { lastHudMigration } from "../../scene/SceneSerializer";
import { modelCatalog } from "../../scene/modelCatalog";
import { pickClipName } from "../animationClips";
import { AnimatorRuntime, parseAnimatorGraph } from "../animator";
import { attachToHand, faceWeaponForward, splitForWeapon } from "../characterRig";
import { loadCombatClips } from "../combatView";
import { GunPose } from "../gunHold";
import { clearOffHands, holdWeapon, weaponGrip } from "../heldWeapons";
import { loadOnce } from "../loadOnce";
import { pickupModelName, pickupVisualFor, setPickupModel, type PickupVisual } from "../lootView";
import { parseModelInstances } from "../modelInstances";
import { defaultPostSettings } from "../postFx";
import { isNonPhysical, isSettingsOnly } from "../settingsEntity";
import { buildSignalHeads } from "../signalHeads";
import {
	decodeSculpt,
	generateHeights,
	parseScatter,
	scatterInstances,
	terrainFoliageGround,
	type TerrainParams
} from "../terrain";
import { makeWater } from "../water";
import { GrassField } from "../grassField";
import { buildScatter, buildTerrainMesh, disposeTerrainMesh, swayingMaterial, type ScatterModel, type TerrainLook } from "../terrainMesh";
import { resolveAssetUrl } from "../userAssets";
import { buildViewmodel } from "../viewmodels";
import type { Ctx } from "./context";
import { AnimState, CachedModel, ParticleState } from "./context";

export function installSceneObjects(C: Ctx): void {
  // A fresh THREE.Light per rebuild(), same as every other object here --
  // nothing caches or reuses it, so there's nothing extra to dispose when the
  // entity's Light is removed or changed, only the recreate-on-every-rebuild()
  // this file already does for meshes.
  //
  // Spot/Directional lights each construct their own separate `target`
  // Object3D (three.js does this internally) that is NOT part of the scene
  // graph by default, so it never inherits this entity's transform -- the
  // beam would always aim at world origin regardless of authored rotation.
  // Parenting `target` under the light itself, offset along local -Z, fixes
  // that: the target's world position then follows the light's own world
  // rotation, so aiming a Spot/Directional light is just rotating its entity.
  // Material component: on the shared placeholder box (or with keepTextures
  // off) a fresh MeshStandardMaterial replaces the mesh's own; otherwise
  // each model material is cloned and tinted, keeping its texture maps.
  // Always a new material, never an edit of the shared/cached one.
  // Material.parts: only meshes whose material is named for one of them.
  function materialAppliesTo(mesh: THREE.Mesh, m: MaterialComponent) {
    const parts = (m.parts ?? "")
      .split(",")
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean);
    if (!parts.length) return true;
    const names = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((x) => x.name.toLowerCase());
    return names.some((name) => parts.some((part) => name.includes(part)));
  }

  function applyMaterial(mesh: THREE.Mesh, m: MaterialComponent) {
    const build = (base: THREE.Material): THREE.Material => {
      const standard = m.keepTextures && base !== C.material && base instanceof THREE.MeshStandardMaterial ? base.clone() : new THREE.MeshStandardMaterial();
      standard.color.copy(C.colorOf(m.color));
      standard.metalness = m.metalness;
      standard.roughness = m.roughness;
      standard.emissive.copy(C.colorOf(m.emissive));
      standard.emissiveIntensity = m.emissiveIntensity;
      standard.opacity = m.opacity;
      standard.transparent = m.opacity < 1;
      if (m.texture === "builtin:water") makeWater(standard);
      else {
        const textureUrl = resolveAssetUrl(m.texture, C.importedImages);
        if (textureUrl) standard.map = loadTexture(textureUrl);
      }
      standard.depthWrite = m.opacity >= 1;
      return standard;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(build) : build(mesh.material);
    for (const created of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) C.materialOverrides.push(created);
  }

  function loadTexture(url: string) {
    let texture = C.textureCache.get(url);
    if (!texture) {
      texture = C.textureLoader.load(url, () => {
        if (C.doc.mode === "edit" && !C.gizmo.dragging) rebuild();
      });
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      C.textureCache.set(url, texture);
    }
    return texture;
  }

  function createLight(light: {
    type: "Point" | "Spot" | "Directional";
    color: Vec3;
    intensity: number;
    range: number;
    angle: number;
    castShadows: boolean;
  }): THREE.Light {
    const color = new THREE.Color(light.color.x, light.color.y, light.color.z);
    const withShadows = <L extends THREE.PointLight | THREE.SpotLight | THREE.DirectionalLight>(l: L): L => {
      l.castShadow = light.castShadows;
      l.shadow.mapSize.set(1024, 1024);
      l.shadow.bias = -0.0005;
      return l;
    };
    switch (light.type) {
      case "Point":
        return withShadows(new THREE.PointLight(color, light.intensity, light.range));
      case "Spot": {
        const l = new THREE.SpotLight(color, light.intensity, light.range, light.angle);
        l.target.position.set(0, 0, -1);
        l.add(l.target);
        return withShadows(l);
      }
      case "Directional": {
        const l = new THREE.DirectionalLight(color, light.intensity);
        l.target.position.set(0, 0, -1);
        l.add(l.target);
        return withShadows(l);
      }
    }
  }

  // Builds one entity's render object (mesh or catalog model, Light,
  // Particles, animation state) and appends it to objects[]/animStates[]/
  // particleStates[]/deathStates[] at the next index. Used for every scene
  // entity by rebuild() and for runtime-spawned prefab instances by frame().
  // -- Terrain ---------------------------------------------------
  function terrainParams(t: TerrainComponent): TerrainParams {
    return {
      size: t.size,
      resolution: t.resolution,
      height: t.height,
      seed: t.seed,
      frequency: t.frequency,
      octaves: t.octaves,
      sculpt: t.sculpt,
    };
  }

  function terrainLook(t: TerrainComponent): TerrainLook {
    return {
      grassColor: t.grassColor,
      rockColor: t.rockColor,
      sandColor: t.sandColor,
      snowColor: t.snowColor,
      sandHeight: t.sandHeight,
      snowHeight: t.snowHeight,
      rockSlope: t.rockSlope,
    };
  }

  function buildInstancesObject(text: string): THREE.Object3D {
    const { instances, errors } = parseModelInstances(text);
    if (errors.length) C.log(`ModelInstances: ${errors.slice(0, 3).join("; ")}`);
    const models = new Map<number, ScatterModel>();
    for (const id of new Set(instances.map((i) => i.model))) {
      const cached = C.catalogCache.get(id);
      if (cached) models.set(id, cached);
      else if (C.catalogEntry(id))
        loadOnce(
          C.pendingCatalogRebuilds,
          id,
          () => C.loadCatalogModel(id),
          () => {
            if (C.doc.mode === "edit" && !C.gizmo.dragging) rebuild();
          },
          (error) => C.log(`Catalog model ${id} failed to load: ${String(error)}`),
        );
    }
    const group = buildScatter(instances, models);
    group.name = "model-instances";
    return group;
  }

  function buildTerrainObject(t: TerrainComponent, index: number): THREE.Object3D {
    const params = terrainParams(t);
    const look = terrainLook(t);
    const offsets = decodeSculpt(t.sculpt, params.resolution * params.resolution);
    const heights = generateHeights(params, offsets);
    const group = new THREE.Group();
    const mesh = buildTerrainMesh(params, look, heights);
    group.add(mesh);
    const { rules, errors, exclusions } = parseScatter(t.scatter);
    if (errors.length) C.log(`Terrain scatter: ${errors.join("; ")}`);
    if (rules.length) {
      const models = new Map<number, ScatterModel>();
      for (const rule of rules) {
        const cached = C.catalogCache.get(rule.model);
        if (cached) models.set(rule.model, { ...cached, sway: plantLike(rule.model) });
        else if (C.catalogEntry(rule.model))
          loadOnce(
            C.pendingCatalogRebuilds,
            rule.model,
            () => C.loadCatalogModel(rule.model),
            () => {
              if (C.doc.mode === "edit" && !C.gizmo.dragging) rebuild();
            },
            (error) => C.log(`Catalog model ${rule.model} failed to load: ${String(error)}`),
          );
      }
      group.add(buildScatter(scatterInstances(params, heights, rules, exclusions, t), models, { dynamicLod: true }));
      // Rules with near=M are grown round the camera instead (grassField.ts).
      const field = new GrassField(rules, terrainFoliageGround(params, heights, exclusions, t), models, params.seed, swayingMaterial);
      if (!field.empty) group.add(field.group);
    }
    C.terrainMeshes.set(index, { mesh, params, look, offsets });
    return group;
  }

  function createEntityObject(get: <K extends keyof SceneComponents>(type: K) => SceneComponents[K] | undefined) {
    const renderable = get("Renderable");
    const meshId = renderable?.mesh ?? 0;
    const catalog = meshId >= 1 ? C.catalogEntry(meshId) : undefined;
    const cached = meshId >= 1 ? C.catalogCache.get(meshId) : undefined;
    let object: THREE.Object3D;
    let animState: AnimState | undefined;
    if (cached) {
      if (catalog?.animated) {
        object = SkeletonUtils.clone(cached.scene);
        const mixer = new THREE.AnimationMixer(object);
        // An armed soldier: locomotion on the legs, a weapon-holding
        // clip on the upper body, so its own arms hold the gun it carries.
        const armed =
          (get("AICombat") || (get("Player") && get("CharacterController")?.mode === "ThirdPerson")) && get("Weapons") && !get("Melee")
            ? splitForWeapon(object, cached.clips)
            : undefined;
        const actions = new Map((armed?.lower ?? cached.clips).map((clip) => [clip.name, mixer.clipAction(clip)]));
        animState = { mixer, actions, prevPosition: new THREE.Vector3() };
        if (armed) {
          animState.upper = mixer.clipAction(armed.upper);
          animState.upper.play();
        }
        // An authored AnimationState.clip picks and pins a specific clip --
        // manually applied from the inspector's per-model dropdown, so it
        // previews immediately in Edit mode too, not just Play -- instead
        // of the automatic ground-speed-based pick below. "" (the default,
        // and whatever pickClipName can't find on this model) falls
        // through to that automatic behavior unchanged.
        const override = get("AnimationState");
        const overridden = override?.clip && actions.has(override.clip);
        // Play the resting clip immediately: every frame's mixer.update() keeps
        // it looping in both Edit and Play mode, so nothing here waits on the
        // Play-mode-only, tick-aligned speed measurement below to pick a clip.
        const resting = overridden ? override!.clip : pickClipName([...actions.keys()], 0);
        if (resting) {
          const action = actions.get(resting)!;
          if (overridden) {
            action.setLoop(override!.looping ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
            action.clampWhenFinished = !override!.looping;
            if (Number.isFinite(override!.time)) action.time = override!.time;
          }
          action.play();
          animState.current = resting;
        }
      } else {
        object = cached.scene.clone(true);
      }
    } else {
      if (meshId >= 1)
        loadOnce(
          C.pendingCatalogRebuilds,
          meshId,
          () => C.loadCatalogModel(meshId),
          () => {
            if (C.doc.mode === "edit" && !C.gizmo.dragging) rebuild();
          },
          (error) => C.log(`Catalog model ${meshId} failed to load: ${String(error)}`),
        );
      object = new THREE.Mesh(C.geometry, C.material);
    }
    // A Pickup without a model of its own: its loot look (lootView.ts).
    const pickupComponent = get("Pickup");
    let pickupVisual: PickupVisual | undefined;
    if (pickupComponent && meshId < 1) {
      pickupVisual = pickupVisualFor(pickupComponent);
      object = pickupVisual.root;
      const modelName = pickupModelName(pickupComponent);
      const entry = modelName ? modelCatalog.find((m) => m.path === `./kit/weapons/${modelName}.glb`) : undefined;
      if (modelName && !entry) C.log(`Pickup: no weapon model named "${modelName}" in kit/weapons.`);
      if (entry) {
        const visual = pickupVisual;
        const place = (model: CachedModel) => setPickupModel(visual, model.scene, C.isGunPath(entry.path) ? undefined : weaponGrip(entry.path).length);
        const ready = C.catalogCache.get(entry.id);
        if (ready) place(ready);
        else C.loadCatalogModel(entry.id)?.then(place, (error) => C.log(`Catalog model ${entry.id} failed to load: ${String(error)}`));
      }
    }
    // Terrain replaces the placeholder with its own mesh and scatter;
    // ModelInstances with its instanced models. Neither takes the
    // entity's Rotation or Scale.
    const terrainComponent = get("Terrain");
    const instancesComponent = get("ModelInstances");
    if (terrainComponent) {
      object = buildTerrainObject(terrainComponent, C.objects.length);
      animState = undefined;
    } else if (instancesComponent) {
      object = buildInstancesObject(instancesComponent.instances);
      animState = undefined;
    }
    const animatorSource = get("Animator");
    let animator: (typeof C.animators)[number];
    if (animatorSource) {
      const parsed = parseAnimatorGraph(animatorSource.graph);
      if (parsed.graph) {
        animator = { graph: parsed.graph, runtime: new AnimatorRuntime(parsed.graph) };
        // Edit-mode preview: the start state's clip, like any resting clip.
        const startClip = animState?.actions.get(parsed.graph.states.get(parsed.graph.start)!.clip);
        if (animState && startClip) {
          animState.mixer.stopAllAction();
          startClip.play();
          animState.current = parsed.graph.states.get(parsed.graph.start)!.clip;
        }
      } else C.animatorErrors.push(...parsed.errors);
    }
    C.animators.push(animator);
    // Scene-wide settings (a UI label, the Environment) have no body of
    // their own: their stand-in box shows only while editing.
    // Settings holders and invisible helpers (a light, a camera, a director
    // script): their stand-in box shows only while editing.
    // Instanced models (ModelInstances) stay out of the simulation but are
    // drawn: they have no Renderable of their own.
    const settingsOnly = isSettingsOnly(get) || (!renderable && !instancesComponent && isNonPhysical(get));
    object.visible = renderable?.visible ?? !(settingsOnly && C.doc.mode === "play");
    if (settingsOnly) object.userData.settingsOnly = true;
    // `anchor` -- not `object` -- carries this entity's Transform/Rotation/
    // Scale and is what's pushed into `objects` (gizmo attach, raycast
    // picking, parent-child reattachment below, and every runtime-driven
    // position/rotation write in frame()). It's always visible, so a Light
    // childed onto it (see below) keeps rendering even when the mesh's own
    // Renderable.visible is false -- three.js's render traversal skips an
    // invisible object's entire subtree, including any lights within it,
    // so the light must not live under `object` itself.
    const anchor = new THREE.Group();
    const p = get("Transform")?.position;
    if (p) anchor.position.set(p.x, p.y, p.z);
    if (animState) animState.prevPosition.copy(anchor.position);
    const r = get("Rotation")?.euler;
    if (r && !terrainComponent && !instancesComponent) anchor.rotation.set(r.x, r.y, r.z);
    const s = get("Scale")?.value;
    if (terrainComponent || instancesComponent) {
      // A terrain's size comes from the component, not Scale.
    } else if (s && cached) {
      // Normalize by the model's own native size so an authored Scale is
      // the mesh's literal world-space size, matching the physics Box's
      // dimensions (same s.x/y/z) instead of stacking on top of it.
      const n = cached.nativeSize;
      // Characters (an animated person, or any animated model driven by AI or a
      // controller) keep their proportions: one uniform scale from the box's
      // height, since a rig's bind pose (arms out) says nothing about its
      // collision width. A person standing still (a villager with no brain)
      // is one too: stretched to a 0.6 m box across its T-pose it came out a
      // third of its width.
      const character = catalog?.animated && (catalog.category === "people" || get("AICombat") || get("CharacterController") || get("Melee"));
      if (character && n.y > 1e-6) anchor.scale.setScalar(s.y / n.y);
      else anchor.scale.set(n.x > 1e-6 ? s.x / n.x : s.x, n.y > 1e-6 ? s.y / n.y : s.y, n.z > 1e-6 ? s.z / n.z : s.z);
    } else if (s) anchor.scale.set(s.x, s.y, s.z);
    // A pickup's look keeps its real size and stands on the ground under
    // its box's centre.
    if (pickupVisual) {
      anchor.scale.set(1, 1, 1);
      pickupVisual.root.position.y = -(s?.y ?? 0.4) / 2;
      C.pickupViews.set(C.objects.length, { visual: pickupVisual, phase: C.objects.length * 1.7 });
    }
    // Center a catalog model on the box rather than standing its feet at
    // the box's center.
    if (cached && !terrainComponent) object.position.copy(cached.nativeCenter).negate();
    anchor.add(object);
    // A junction's signal heads, lit each frame from the simulation.
    const signalComponent = get("TrafficSignal");
    if (signalComponent) {
      const heads = buildSignalHeads(signalComponent.radius);
      anchor.add(heads.group);
      anchor.userData.signalHeads = heads;
    }
    if (get("Vehicle")) C.carSizes.set(anchor, new THREE.Vector3(s?.x ?? 1, s?.y ?? 1, s?.z ?? 1));
    // A soldier with Weapons visibly holds its first weapon.
    // A character with Weapons holds its current gun in both hands
    // (gunHold.ts): a third-person Player or a soldier on a rig with hands.
    const thirdPersonPlayer = !!get("Player") && get("CharacterController")?.mode === "ThirdPerson";
    // A fighter with Weapons too (a dagger and a pistol) holds the gun in
    // its free hand, raised only while aiming.
    const gunPose =
      // (A fighter or player without Weapons still gets one: a pickup creates its arsenal in Play,
      // and the weapon must show the moment it is equipped.)
      (get("Weapons") || get("Melee") || thirdPersonPlayer) && (thirdPersonPlayer || get("AICombat") || get("Melee")) && animState && cached && catalog?.animated
        ? GunPose.create(cached.scene, object)
        : undefined;
    if (gunPose)
      C.gunPoses.set(C.objects.length, { pose: gunPose, gun: "", raised: 0, kick: 0, oneHanded: (get("Melee")?.leftHand ?? 0) > 0, rest: cached!.scene, object, hands: "", holders: [], blades: [] });
    const loadout = get("AICombat") && !gunPose ? get("Weapons")?.loadout : undefined;
    if (loadout !== undefined) {
      const model = /model=(\w+)/.exec(loadout.split("\n").find((line) => line.trim() && !line.trim().startsWith("#")) ?? "")?.[1] ?? "rifle";
      const held = buildViewmodel(model).group;
      // In the hands of a rig playing a weapon-holding clip: posed
      // once, then the gun rides the right hand bone.
      let inHand = false;
      if (animState?.upper) {
        animState.mixer.update(0);
        // Holding poses are bladed: turn the model so the gun, not the
        // hips, points where the soldier faces (+z).
        faceWeaponForward(object);
        anchor.updateMatrixWorld(true);
        inHand = attachToHand(object, held);
      }
      if (!inHand) {
        // Undo the anchor's scale so the gun keeps its real size, and point
        // it along the body's facing (+z) at chest height on the right.
        const size = get("Scale")?.value ?? { x: 1, y: 1, z: 1 };
        held.scale.set(held.scale.x / anchor.scale.x, held.scale.y / anchor.scale.y, held.scale.z / anchor.scale.z);
        held.position.set((size.x * 0.35) / anchor.scale.x, (size.y * 0.12) / anchor.scale.y, (size.z * 0.3) / anchor.scale.z);
        held.rotation.y = Math.PI;
        anchor.add(held);
      }
    }
    const light = get("Light");
    // A sibling of `object`, not a child of it -- see the comment on
    // `anchor` above for why. Not pushed into `objects` itself:
    // objects/animStates are 1:1 with refs (the parenting loop and
    // raycast-picking below both index by that), and a light has no
    // geometry of its own to pick separately -- the entity's usual
    // box/model placeholder still marks where it is and stays what gets
    // selected, same as any other entity before a real Renderable.mesh is
    // chosen. Being a child of `anchor` means it inherits this entity's
    // own position/rotation for free, no separate transform tracking.
    if (light) {
      const made = createLight(light);
      anchor.add(made);
      C.lightPool.register(made);
    }
    // Every mesh casts and receives shadows; a Material component overrides
    // the surface (see applyMaterial).
    const materialOverride = get("Material");
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = true;
      child.receiveShadow = true;
      if (materialOverride && materialAppliesTo(child, materialOverride)) applyMaterial(child, materialOverride);
    });
    // A still model (no rig, nothing scripted on it) never moves inside its
    // anchor: its nodes' local matrices are composed once, not every frame
    // (a town is thousands of nodes).
    if (cached && !animState && !get("Script") && !get("Spaceship") && !loadout)
      object.traverse((node) => {
        node.updateMatrix();
        node.matrixAutoUpdate = false;
      });
    const particles = get("Particles");
    let particleState: ParticleState | undefined;
    if (particles) particleState = C.createParticles(particles, anchor);
    const trail = get("Trail");
    if (trail) C.trailStates.push(C.createTrail(trail, anchor));
    C.scene.add(anchor);
    C.objects.push(anchor);
    C.animStates.push(animState);
    // A rig with no clips of its own that isn't a fighter (a bystander in a
    // cutscene) stands in the library's idle instead of its bind (T) pose.
    if (!get("Melee") && animState && catalog?.animated && cached && cached.clips.length === 0) {
      const state = animState;
      loadCombatClips((path) => C.gltfLoader.loadAsync(path)).then(
        (clips) => {
          if (C.animStates[C.objects.indexOf(anchor)] !== state) return;
          for (const clip of clips) if (!state.actions.has(clip.name)) state.actions.set(clip.name, state.mixer.clipAction(clip));
          const pinned = get("AnimationState")?.clip;
          const name = pinned && state.actions.has(pinned) ? pinned : "idle";
          state.actions.get(name)?.play();
          state.current = name;
        },
        (error) => C.log(`Combat clips failed to load: ${String(error)}`),
      );
    }
    // A Player whose Weapons has melee slots is a fighter too (the runtime
    // gives it one); its blades come with the slot (updateGunPoses).
    if (!get("Melee") && get("Player") && /\bmelee=/.test(get("Weapons")?.loadout ?? "") && animState) C.attachFighter(C.objects.length - 1, object, animState);
    if (get("Melee") && animState) {
      C.attachFighter(C.objects.length - 1, object, animState);
      // Weapons in its hands (heldWeapons.ts), once their models load.
      const melee = get("Melee")!;
      const rig = cached!.scene;
      for (const [side, id] of [["r", melee.rightHand], ["l", melee.leftHand]] as const) {
        // A Player's hands are empty until it picks a weapon up; these are a fighter NPC's.
        const entry = id > 0 && !get("Player") ? C.catalogEntry(id) : undefined;
        // A gun in a fighter's hand is its Weapons' current gun (below).
        if (!entry || C.isGunPath(entry.path)) continue;
        let grip = weaponGrip(entry.path);
        // A two-hander with something in the other hand (the Warlord's
        // claymore and shield) is wielded one-handed.
        if (grip.grip === "twohand" && (side === "r" ? melee.leftHand : melee.rightHand) > 0) grip = { ...grip, grip: "forward", offHand: undefined };
        const index = C.objects.length - 1;
        const place = (weapon: CachedModel) => {
          const holder = holdWeapon(rig, object, side, weapon.scene, grip);
          if (!holder) return;
          // Nobody holds a gun and a blade at once: updateGunPoses hides these while a gun is in hand.
          C.gunPoses.get(index)?.blades?.push(holder);
          // A weapon fought with the sword clips takes their stance (its
          // guard pose, if it has one, goes over it); daggers and knives keep
          // the boxing guard.
          if (grip.grip === "shield") C.combat.arm(index, "shield");
          else if (grip.clips === "sword") C.combat.arm(index, "blade");
        };
        const ready = C.catalogCache.get(id);
        if (ready) place(ready);
        else C.loadCatalogModel(id)?.then(place, (error) => C.log(`Catalog model ${id} failed to load: ${String(error)}`));
      }
    }
    C.particleStates.push(particleState);
    C.deathStates.push(undefined);
  }

  // The terrain's height at a world position (bilinear over the mesh's own heights), or undefined off every terrain.
  const groundPoint = new THREE.Vector3();
  function groundAt(x: number, z: number): number | undefined {
    for (const { mesh, params } of C.terrainMeshes.values()) {
      const half = params.size / 2;
      mesh.parent?.updateWorldMatrix(true, false);
      groundPoint.set(x, 0, z);
      mesh.worldToLocal(groundPoint);
      if (Math.abs(groundPoint.x) > half || Math.abs(groundPoint.z) > half) continue;
      const position = mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
      const n = params.resolution;
      const step = params.size / (n - 1);
      const fx = Math.min(Math.max((groundPoint.x + half) / step, 0), n - 1.0001);
      const fz = Math.min(Math.max((groundPoint.z + half) / step, 0), n - 1.0001);
      const c = Math.floor(fx), r = Math.floor(fz), tx = fx - c, tz = fz - r;
      const at = (cc: number, rr: number) => position.getY(rr * n + cc);
      const top = at(c, r) + (at(c + 1, r) - at(c, r)) * tx;
      const bottom = at(c, r + 1) + (at(c + 1, r + 1) - at(c, r + 1)) * tx;
      return mesh.parent ? mesh.parent.localToWorld(new THREE.Vector3(0, top + (bottom - top) * tz, 0)).y : top + (bottom - top) * tz;
    }
    return undefined;
  }
  C.groundAt = groundAt;

  // Plants sway in the wind; rocks and buildings do not.
  const plantLike = (meshId: number) => {
    const entry = C.catalogEntry(meshId);
    return !!entry && /tree|pine|oak|birch|bush|shrub|grass|fern|flower|plant|bamboo|palm|willow|reed|weed|cactus/i.test(`${entry.category} ${entry.name}`);
  };

  // Loads a scene and says what the HUD migration added to an older one (hudMigration.ts).
  function loadDocument(data: unknown) {
    C.doc.load(data);
    if (lastHudMigration.length)
      C.log(`Scene updated: nothing draws HUD by itself any more, so ${lastHudMigration.length} widget${lastHudMigration.length === 1 ? "" : "s"} were added as entities you can restyle or delete: ${lastHudMigration.join(", ")}.`);
  }

  function rebuild() {
    C.pickupViews.clear();
    C.openings.length = 0;
    C.lootFeed.length = 0;
    C.widgetHits.length = 0;
    C.widgetTexts.clear();
    C.hiddenWidgets.clear();
    C.uiFeed.damage.length = C.uiFeed.kills.length = 0;
    C.uiFeed.hitAt = C.uiFeed.killAt = -Infinity;
    C.uiFeed.healthGhost = C.uiFeed.bossGhost = 1;
    for (const held of C.gunPoses.values()) held.pose.dispose();
    C.gunPoses.clear();
    C.tps.view.reset(0);
    C.tps.hits = C.tps.kills = 0;
    C.talkerScan = -1;
    C.lightOverride = undefined;
    if (C.timeOfDay !== undefined) {
      C.timeOfDay = undefined;
      C.environmentKey = "";
    }
    C.pauseMenu = false;
    clearOffHands();
    C.outfits.clear();
    C.staticBatcher.clear();
    C.probe.detach();
    C.probeScanAt = 0;
    C.batchAt = C.doc.mode === "play" ? performance.now() + 2500 : Infinity;
    C.gizmo.detach();
    const environmentEntity = C.doc.scene.eachAlive().find((e) => C.doc.scene.effectiveHas(e, "Environment"));
    C.applyEnvironment((environmentEntity && C.doc.scene.resolve(environmentEntity, "Environment")) ?? defaultEnvironment());
    // The flat shadow catcher at y = 0 would cut through a terrain's valleys.
    if (C.doc.scene.eachAlive().some((e) => C.doc.scene.effectiveHas(e, "Terrain"))) C.shadowGround.visible = false;
    const postEntity = C.doc.scene.eachAlive().find((e) => C.doc.scene.effectiveHas(e, "PostProcessing"));
    C.applyPostProcessing((postEntity && C.doc.scene.resolve(postEntity, "PostProcessing")) ?? defaultPostSettings);
    // Road tiles placed by ModelInstances, for the driving minimap.
    C.minimapRoads = [];
    for (const entity of C.doc.scene.eachAlive()) {
      const mi = C.doc.scene.resolve(entity, "ModelInstances");
      if (!mi) continue;
      const at = C.doc.scene.resolve(entity, "Transform")?.position ?? { x: 0, y: 0, z: 0 };
      for (const instance of parseModelInstances(mi.instances).instances)
        if (C.catalogEntry(instance.model)?.category === "roads") C.minimapRoads.push({ x: at.x + instance.x, z: at.z + instance.z, size: 16 * instance.scale });
    }
    for (const object of C.objects) {
      object.removeFromParent();
      // Each cloned rig has its own skeleton, and its bone texture.
      object.traverse((child) => {
        if (child instanceof THREE.SkinnedMesh) child.skeleton.dispose();
      });
    }
    C.objects.length = 0;
    C.lightPool.reset();
    for (const { mesh } of C.terrainMeshes.values()) disposeTerrainMesh(mesh);
    C.terrainMeshes.clear();
    C.animStates.length = 0;
    C.combat.reset();
    C.ledger.clear();
    C.waitingFighters.length = 0;
    C.animators.length = 0;
    C.animatorErrors.length = 0;
    // Unlike a mesh (which reuses catalogCache's shared geometry/material --
    // nothing new allocated per rebuild(), so nothing to dispose), every
    // Particles emitter allocates its own fresh BufferGeometry/PointsMaterial
    // (see createParticles()) each time. `execute()` calls rebuild() after
    // every successful command -- routine property edits, undo/redo, renames
    // -- so without disposing here, an entity with Particles would leak a new
    // set of GPU buffers on essentially every editor interaction.
    for (const state of C.particleStates) {
      state?.points.removeFromParent();
      state?.points.geometry.dispose();
      state?.points.material.dispose();
    }
    for (const trail of C.trailStates) {
      trail.mesh.removeFromParent();
      trail.mesh.geometry.dispose();
      trail.mesh.material.dispose();
    }
    C.trailStates.length = 0;
    C.particleStates.length = 0;
    for (const state of C.deathStates) state?.materials.forEach(({ material }) => material.dispose());
    for (const created of C.materialOverrides) created.dispose();
    C.materialOverrides.length = 0;
    C.deathStates.length = 0;
    const refs = C.doc.scene.eachAlive();
    for (const entity of refs) createEntityObject((type) => C.doc.scene.resolve(entity, type));
    refs.forEach((entity, i) => {
      const parent = C.doc.scene.resolve(entity, "Parent")?.entity;
      if (parent && C.doc.scene.alive(parent)) {
        const pi = refs.findIndex((e) => e.index === parent.index);
        C.objects[pi]?.add(C.objects[i]!);
      }
    });
    C.updatePanels();
  }
  Object.assign(C, { materialAppliesTo, applyMaterial, terrainParams, createEntityObject, loadDocument, rebuild });
}
