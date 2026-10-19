import * as THREE from "three";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { playCue } from "../ambience";
import { SpaceField } from "../bridgeFields";
import {
	qualityProfile
} from "../playerSettings";
import { swayMaterial } from "../scatterSway";
import { latLonDirection, parseLandmarks, parseSpaceBodies, parseSpecies, SpaceView, type SpaceRuntime } from "../spaceView";
import { buildScatter, type ScatterModel } from "../terrainMesh";
import type { Ctx } from "./context";

export function installSpace(C: Ctx): void {
  function spaceComponent() {
    const entity = C.doc.scene.eachAlive().find((e) => C.doc.scene.effectiveHas(e, "SpaceSystem"));
    return entity ? C.doc.scene.resolve(entity, "SpaceSystem") : undefined;
  }

  // The star and bodies, before any entity (the Spaceship needs them).
  function stageSpaceSystem() {
    const space = spaceComponent();
    if (!space) return;
    const { bodies, errors } = parseSpaceBodies(space.bodies);
    for (const error of errors) C.log(`SpaceSystem: ${error}`);
    const site = bodies.findIndex((b) => b.name === space.siteBody);
    if (site < 0) C.log(`SpaceSystem: site body "${space.siteBody}" not found; using ${bodies[0]?.name ?? "none"}`);
    C.runtime.ccall(
      "editor_space_begin",
      null,
      ["number", "number", "number", "number", "number", "number", "number"],
      [space.starGm, Math.max(site, 0), space.siteLatitude, space.siteLongitude, space.siteRadius, space.evaRange, space.startTime],
    );
    for (const b of bodies) {
      C.runtime.ccall(
        "editor_space_body",
        null,
        ["string", ...Array<"number">(12).fill("number")],
        [
          b.name,
          b.parent,
          b.orbitRadius,
          b.period,
          b.phase,
          b.inclination,
          b.radius,
          b.gravity,
          b.atmosphereHeight,
          b.atmosphereDensity,
          b.terrainAmplitude,
          b.terrainScale,
          b.seed,
        ],
      );
      if (b.sea !== undefined) C.runtime.ccall("editor_space_body_sea", null, ["number"], [b.sea]);
      if (b.hidden) C.runtime._editor_space_body_hidden(1);
      if (b.craters || b.rifts || b.dunes || b.day)
        C.runtime.ccall("editor_space_body_features", null, ["number", "number", "number", "number"], [b.craters, b.rifts ? 1 : 0, b.dunes ? 1 : 0, b.day]);
    }
  }

  // On Play: the system view, its render pass, and the site's ground as a
  // depth-and-shadow surface in the scene pass (hills hide what's behind
  // them; buildings cast shadows on the curved ground).
  function startSpaceView() {
    endSpaceView();
    const space = spaceComponent();
    if (!space || !C.runtime._editor_space_value(SpaceField.hasSpaceSystem)) return;
    const { bodies } = parseSpaceBodies(space.bodies);
    const shipEntity = C.shipIndex >= 0 ? C.doc.scene.eachAlive()[C.shipIndex] : undefined;
    const shipModel = (shipEntity && C.doc.scene.resolve(shipEntity, "Spaceship")?.model) ?? "";
    C.spaceView = new SpaceView(C.runtime as unknown as SpaceRuntime, bodies, C.colorOf(space.starColor), parseLandmarks(space.landmarks, bodies), shipModel);
    C.spaceView.chunkMs = C.governorTier().chunkMs;
    C.spaceView.sampleTick();
    C.grid.visible = false;
    C.spaceSpecies = parseSpecies(space.species, bodies);
    C.spaceFrame = -1;
    C.scatterModelsReady = false;
    const models = [...new Set(C.spaceSpecies.map((s) => s.model))];
    void Promise.all(models.map((id) => C.loadCatalogModel(id)?.catch(() => undefined))).then(() => {
      C.scatterModelsReady = true;
      C.spaceFrame = -1; // rebuild with the models in
    });
    C.shadowGround.visible = false;
    if (C.composer) {
      C.spacePass = new RenderPass(C.spaceView.scene, C.spaceView.camera);
      C.composer.insertPass(C.spacePass, 0);
      C.renderPass.clear = false;
      C.renderPass.clearDepth = true;
    }
    C.startExplorer();
    C.prospect = undefined;
  }

  // The walk frame's ground (a depth-and-shadow surface in the scene pass)
  // and the plants and rocks around it, rebuilt whenever the frame moves.
  function rebuildSpaceFrame() {
    const space = spaceComponent();
    if (!C.spaceView || !space) return;
    if (C.spaceGround) {
      C.scene.remove(C.spaceGround);
      C.spaceGround.geometry.dispose();
      C.spaceGround.material.dispose();
    }
    const n = 129;
    const size = space.evaRange * 2;
    const geometry = new THREE.PlaneGeometry(size, size, n - 1, n - 1);
    geometry.rotateX(-Math.PI / 2);
    const position = geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < position.count; i++) position.setY(i, C.runtime._editor_space_ground(position.getX(i), position.getZ(i)) + 0.02);
    geometry.computeVertexNormals();
    C.spaceGround = new THREE.Mesh(geometry, new THREE.ShadowMaterial({ opacity: 0.4 }));
    C.spaceGround.receiveShadow = true;
    C.scene.add(C.spaceGround);
    if (C.spaceScatter) C.scene.remove(C.spaceScatter);
    C.spaceScatter = undefined;
    C.scatterTargets = [];
    if (!C.scatterModelsReady) return;
    const away = C.runtime._editor_space_value(SpaceField.away) === 1;
    // Plants and rocks keep clear of the active site's solid structures; the
    // quality preset thins them on weaker devices (the mobile governor).
    const activeSite = away ? C.runtime._editor_space_value(SpaceField.activeSite) : -1;
    const keep: Array<{ x: number; z: number; r: number }> = [];
    if (activeSite !== -2)
      C.doc.scene.eachAlive().forEach((entity, i) => {
        if ((C.memberSite[i] ?? -1) !== activeSite || !C.doc.scene.effectiveHas(entity, "Collider")) return;
        const p = C.doc.scene.resolve(entity, "Transform")?.position;
        const size = C.doc.scene.resolve(entity, "Scale")?.value ?? { x: 1, y: 1, z: 1 };
        if (p) keep.push({ x: p.x, z: p.z, r: Math.max(size.x, size.z) * 0.75 + 3 });
      });
    const placed = C.spaceView.scatter(C.spaceSpecies, space.evaRange * 0.92, away ? 22 : 75, keep, qualityProfile(C.playerSettings.quality).scatter);
    const models = new Map<number, ScatterModel>();
    for (const p of placed) {
      const cached = C.catalogCache.get(p.species.model);
      if (cached) models.set(p.species.model, cached);
    }
    C.spaceScatter = buildScatter(
      placed.map((p) => ({ model: p.species.model, x: p.x, y: p.y, z: p.z, yaw: p.yaw, scale: p.scale, collide: false })),
      models,
    );
    // Plants sway (minerals don't), in step with any structure nearby.
    const kindOf = new Map(placed.map((p) => [p.species.model, p.species.kind]));
    C.spaceScatter.traverse((child) => {
      if (!(child instanceof THREE.InstancedMesh)) return;
      const model = (child.userData.instances as Array<{ model: number }> | undefined)?.[0]?.model;
      if (model === undefined || kindOf.get(model) === "mineral" || Array.isArray(child.material)) return;
      let swayed = C.swayCache.get(child.material);
      if (!swayed) C.swayCache.set(child.material, (swayed = swayMaterial(child.material, C.sway)));
      child.material = swayed;
      child.customDepthMaterial = C.swayDepth;
    });
    C.scene.add(C.spaceScatter);
    C.applyScatterDensity(C.governorTier().scatter);
    C.scatterPlacements = placed.map((p) => ({ x: p.x, y: p.y, z: p.z, key: p.species.id, kind: p.species.kind, scale: p.scale }));
    C.harvested.clear();
    C.explorerFx?.clearPrints();
    const kind = (k: string) => k[0]!.toUpperCase() + k.slice(1);
    C.scatterTargets = placed.map((p) => ({
      key: p.species.id,
      name: p.species.name,
      kind: kind(p.species.kind),
      position: new THREE.Vector3(p.x, p.y + 0.4, p.z),
      range: 5,
    }));
    C.hideHarvestedHere();
  }

  function endSpaceView() {
    C.endExplorer();
    if (C.suitLight) {
      C.scene.remove(C.suitLight, C.suitLight.target);
      C.suitLight.dispose();
      C.suitLight = undefined;
    }
    C.suitLightLevel = 0;
    C.spaceView?.dispose();
    C.spaceView = undefined;
    if (C.spaceScatter) C.scene.remove(C.spaceScatter);
    C.spaceScatter = undefined;
    C.scatterTargets = [];
    C.hiddenAway.clear();
    if (C.spaceGround) {
      C.scene.remove(C.spaceGround);
      C.spaceGround.geometry.dispose();
      C.spaceGround.material.dispose();
      C.spaceGround = undefined;
    }
    if (C.spacePass && C.composer) {
      C.composer.removePass(C.spacePass);
      C.spacePass = undefined;
      C.renderPass.clear = true;
      C.renderPass.clearDepth = false;
    }
    C.sun.visible = true;
    C.sun.shadow.bias = -0.0005;
    C.sun.shadow.normalBias = 0.05;
  }

  // Per frame while playing: the system around the camera, and the scene's
  // light, sky and haze taken from it.
  function updateSpace(view: THREE.Camera, dt: number) {
    if (!C.spaceView) return;
    C.spaceView.update(view, dt);
    C.sunDirection.copy(C.spaceView.sunDirection);
    const day = C.spaceView.daylight;
    // Below the horizon the sun neither lights nor shadows; night keeps a
    // dim, cool fill so the site stays readable.
    const elevation = C.spaceView.sunDirection.y;
    C.sun.visible = elevation > -0.03;
    // The site's curved ground takes shadows at grazing angles: more bias.
    C.sun.shadow.bias = -0.0015;
    C.sun.shadow.normalBias = 0.12;
    C.sun.intensity = 2.6 * THREE.MathUtils.clamp(elevation * 4 + 0.15, 0, 1);
    C.hemisphere.intensity = 0.35 + 1.3 * C.spaceView.air * day;
    C.hemisphere.color
      .copy(C.spaceView.skyColor)
      .lerp(new THREE.Color(1, 1, 1), 0.4)
      .multiplyScalar(0.35 + 0.65 * day);
    C.scene.background = null;
    if (C.skyMesh) C.skyMesh.visible = false;
    // The scattered horizon (atmosphere.ts) colours the haze.
    C.scene.fog = C.spaceView.air > 0.02 ? new THREE.FogExp2(C.spaceView.horizonColor.getHex(), 6e-5 * C.spaceView.air) : null;
    if (C.playerIndex >= 0 && C.objects[C.playerIndex]) C.objects[C.playerIndex]!.visible = !C.spaceView.flight.piloting;
    // Warm light at sunrise and sunset.
    C.sun.color.setRGB(1, 1 - C.spaceView.sunset * 0.35, 1 - C.spaceView.sunset * 0.6);
    const frame = C.runtime._editor_space_value(SpaceField.frameGeneration);
    if (frame !== C.spaceFrame) {
      C.spaceFrame = frame;
      // Re-anchored on foot: what moved with the walker, the
      // camera included, shifts by the same amount, so nothing visibly jumps.
      const shift = new THREE.Vector3(
        C.runtime._editor_space_value(SpaceField.reframeShiftX),
        C.runtime._editor_space_value(SpaceField.reframeShiftY),
        C.runtime._editor_space_value(SpaceField.reframeShiftZ),
      );
      if (shift.lengthSq() > 1) {
        const step = shift.length();
        C.tickStates.forEach((state) => {
          if (state && state.previous.distanceTo(state.current) > step * 0.5) state.previous.add(shift);
        });
        C.rig.position.add(shift);
        view.position.add(shift);
        C.controls.target.add(shift);
        // The new frame's axes turn too: the camera swings round
        // the walker by the same angle and the look keeps its heading.
        const turn = C.runtime._editor_space_value(SpaceField.reframeYaw);
        const walker = C.playerIndex >= 0 ? C.objects[C.playerIndex] : undefined;
        if (Math.abs(turn) > 1e-5 && walker) {
          const pivot = C.rig.position.clone();
          const spin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), turn);
          for (const p of [view.position, C.controls.target]) p.sub(pivot).applyQuaternion(spin).add(pivot);
          view.quaternion.premultiply(spin);
          C.rig.yaw += turn;
          C.fps.look.yaw += turn;
          walker.rotation.y += turn;
        }
      }
      rebuildSpaceFrame();
    }
    // Canals and glossy floors reflect their surroundings, while
    // the governor still has shadows to spare.
    if (C.doc.mode === "play" && C.renderer instanceof THREE.WebGLRenderer && C.governorTier().shadows > 0) {
      const now = performance.now();
      if (now > C.probeScanAt) {
        C.probeScanAt = now + 5000;
        C.probe.attach(C.scene);
      }
      C.probe.update(C.renderer, C.scene, view.position, now, C.spaceView.skyColor, C.spaceView.horizonColor);
    }
    // Weather fog thickens the haze.
    const fog = C.explorerFx?.weather.fog ?? 0;
    if (fog > 0.01)
      C.scene.fog = new THREE.FogExp2(
        C.spaceView.horizonColor
          .clone()
          .lerp(C.spaceView.skyColor.clone().multiplyScalar(day * 0.8), 0.5)
          .getHex(),
        6e-5 * C.spaceView.air + fog * 0.012,
      );
    C.updateExplorer(dt, view);
    // Only the active site's objects are here; the rest are elsewhere on
    // the planet (or another world).
    const activeSite = C.runtime._editor_space_value(SpaceField.away) === 1 ? C.runtime._editor_space_value(SpaceField.activeSite) : -1;
    const entities = C.doc.scene.eachAlive();
    C.objects.forEach((object, i) => {
      if (!object || i === C.shipIndex || i === C.playerIndex) return;
      const entity = entities[i];
      const site = C.memberSite[i] ?? -1;
      // Plain children follow their parent's visibility.
      if (entity && site < 0 && C.doc.scene.effectiveHas(entity, "Parent")) return;
      const here = C.siteIndices.includes(i) ? activeSite === C.siteIndices.indexOf(i) : site === activeSite;
      if (!here && object.visible) {
        object.visible = false;
        C.hiddenAway.add(i);
      } else if (here && C.hiddenAway.has(i)) {
        object.visible = true;
        C.hiddenAway.delete(i);
      }
    });
  }

  function frameQuaternion() {
    return new THREE.Quaternion(C.runtime._editor_space_frame(0), C.runtime._editor_space_frame(1), C.runtime._editor_space_frame(2), C.runtime._editor_space_frame(3));
  }

  function bodyCentre(index: number) {
    return new THREE.Vector3(
      C.runtime._editor_space_body_value(index, 0),
      C.runtime._editor_space_body_value(index, 1),
      C.runtime._editor_space_body_value(index, 2),
    );
  }

  // Body-fixed -> walk frame for body `index`: the frame times its turn.
  function bodyQuaternion(index: number) {
    const spin = new THREE.Quaternion(
      C.runtime._editor_space_body_spin(index, 0),
      C.runtime._editor_space_body_spin(index, 1),
      C.runtime._editor_space_body_spin(index, 2),
      C.runtime._editor_space_body_spin(index, 3),
    );
    return frameQuaternion().multiply(spin);
  }

  // A latitude/longitude on a body, as a point in the walk frame.
  function latLonToFrame(index: number, latitude: number, longitude: number, lift = 2) {
    const dir = latLonDirection(latitude, longitude);
    const radius =
      C.runtime._editor_space_body_value(index, 3) +
      Math.max(C.runtime._editor_planet_height(index, dir.x, dir.y, dir.z), C.explorerBodies[index]?.sea ?? -1e9) +
      lift;
    return dir.multiplyScalar(radius).applyQuaternion(bodyQuaternion(index)).add(bodyCentre(index));
  }

  function frameToLatLon(index: number, p: THREE.Vector3) {
    const dir = p.clone().sub(bodyCentre(index)).applyQuaternion(bodyQuaternion(index).invert()).normalize();
    return {
      latitude: THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1))),
      longitude: THREE.MathUtils.radToDeg(Math.atan2(dir.z, dir.x)),
    };
  }

  function cue(name: string) {
    if (!C.audioContext) return;
    playCue(C.audioContext, C.audioMixer().buses.ui, name);
  }
  Object.assign(C, { spaceComponent, stageSpaceSystem, startSpaceView, endSpaceView, updateSpace, frameQuaternion, bodyCentre, latLonToFrame, frameToLatLon, cue });
}
