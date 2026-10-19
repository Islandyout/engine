import * as THREE from "three";
import { Ambience } from "../ambience";
import { SpaceField } from "../bridgeFields";
import { ExplorerFx } from "../explorerFx";
import { drawLocalMinimap, drawSurface, drawSystem, surfaceImage, type LocalBlip, type MapBody, type MapSite } from "../explorerHud";
import {
	summarizeFrames
} from "../playerSettings";
import { type ScanTarget } from "../scanner";
import { MAX_SPOTS } from "../scatterSway";
import { parseSpaceBodies } from "../spaceView";
import type { Ctx } from "./context";

export function installExplorer(C: Ctx): void {
  function startExplorer() {
    endExplorer();
    const space = C.spaceComponent();
    C.explorerBodies = space ? parseSpaceBodies(space.bodies).bodies : [];
    C.explorerFx = new ExplorerFx();
    C.scene.add(C.explorerFx.group);
    if (C.audioContext) C.ambience = new Ambience(C.audioContext, C.audioMixer().buses.ambient);
    C.mapMode = "off";
    C.minimapAllowed = true;
    C.mapSites.clear();
    C.latLonWaypoints.clear();
    C.catalogued.clear();
    C.harvested.clear();
    C.harvestedSpots.clear();
    C.nearHarvest = "";
    C.softGround = true;
    C.wasLanded = true;
    C.scanner.tuning = { range: 1, time: 1, interference: 0, condition: 1 };
    C.scanner.skyKey = "";
    C.applyPlayerSettings();
  }

  function endExplorer() {
    if (C.explorerFx) {
      C.scene.remove(C.explorerFx.group);
      C.explorerFx.dispose();
      C.explorerFx = undefined;
    }
    C.ambience?.stop();
    C.ambience = undefined;
    C.touchControls?.dispose();
    C.touchControls = undefined;
    document.getElementById("player-settings")?.remove();
  }

  // Takes the nearest catalogued specimen of `key` within reach out of the
  // world and tells scripts (on_ui("harvested", key)).
  function harvest(key: string) {
    const player = C.playerIndex >= 0 ? C.objects[C.playerIndex] : undefined;
    if (!player || !C.spaceScatter) return;
    let best = -1,
      bestDistance = 3.5;
    C.scatterPlacements.forEach((p, i) => {
      if (p.key !== key || C.harvested.has(i)) return;
      const d = Math.hypot(p.x - player.position.x, p.z - player.position.z);
      if (d < bestDistance) {
        best = i;
        bestDistance = d;
      }
    });
    if (best < 0) return;
    hideScatter(best);
    // Remembered by place (and saved by scripts), so it stays harvested.
    const spot = `${scatterFrameKey()}|${best}`;
    C.harvestedSpots.add(spot);
    C.uiEvent("harvested", key);
    C.uiEvent("harvest_spot", spot);
  }

  function scatterFrameKey() {
    return `${C.runtime._editor_space_value(SpaceField.frameBody)}:${C.runtime._editor_space_value(SpaceField.frameLatitude).toFixed(2)}:${C.runtime._editor_space_value(SpaceField.frameLongitude).toFixed(2)}`;
  }

  // Hides scatter placement `index` (harvested).
  function hideScatter(index: number) {
    if (!C.spaceScatter || C.harvested.has(index) || !C.scatterPlacements[index]) return;
    C.harvested.add(index);
    const placement = C.scatterPlacements[index]!;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    C.spaceScatter.traverse((o) => {
      const list = (o as THREE.InstancedMesh).userData?.instances as Array<{ x: number; z: number }> | undefined;
      if (!(o instanceof THREE.InstancedMesh) || !list) return;
      const i = list.findIndex((instance) => instance.x === placement.x && instance.z === placement.z);
      if (i >= 0) {
        o.setMatrixAt(i, zero);
        o.instanceMatrix.needsUpdate = true;
      }
    });
    C.scatterTargets = C.scatterTargets.filter((t) => !(t.position.x === placement.x && t.position.z === placement.z));
  }

  // After a frame's scatter is built: hide what was harvested there before.
  function hideHarvestedHere() {
    const prefix = `${scatterFrameKey()}|`;
    for (const spot of C.harvestedSpots) if (spot.startsWith(prefix)) hideScatter(Number(spot.slice(prefix.length)));
  }

  // The grass clock and the structures it falls into step near.
  function updateSway(dt: number) {
    if (!C.spaceView) return;
    C.sway.uSwayTime.value += dt;
    C.sway.uPulse.value = C.spaceView.grammarTime;
    const w = C.explorerFx?.weather;
    C.sway.uWind.value = w ? Math.min(1, Math.hypot(w.windX, w.windZ) / 14) : 0;
    const eye = C.viewCamera.position;
    const spots = C.spaceView.landmarks
      .map((l) => l.anchor.getWorldPosition(new THREE.Vector3()))
      .filter((p) => p.distanceTo(eye) < 3000)
      .sort((a, b) => a.distanceTo(eye) - b.distanceTo(eye));
    for (let i = 0; i < MAX_SPOTS; i++) {
      const p = spots[i];
      // Unused slots sit far away (a zero radius would be undefined).
      C.sway.uSpots.value[i]!.set(p?.x ?? 1e9, p?.y ?? 0, p?.z ?? 1e9, 70);
    }
  }

  // The suit light: a lamp at the walker's helmet along their facing,
  // easing on as the light fails (or forced on or off with L).
  function updateSuitLight(dt: number, walker: THREE.Object3D | undefined) {
    const dark = C.spaceView ? 1 - THREE.MathUtils.smoothstep(C.spaceView.daylight * Math.max(C.spaceView.air, 0.25), 0.06, 0.16) : 0;
    const want = !walker ? 0 : C.suitLightMode === "on" ? 1 : C.suitLightMode === "off" ? 0 : dark;
    C.suitLightLevel += (want - C.suitLightLevel) * (1 - Math.exp(-dt * 4));
    if (C.suitLightLevel < 0.01 || !walker) {
      if (C.suitLight) C.suitLight.visible = false;
      return;
    }
    if (!C.suitLight) {
      C.suitLight = new THREE.SpotLight(0xf4f2ea, 0, 30, 0.45, 0.6, 1.6);
      // Shadows from the suit light: a small map, near range.
      C.suitLight.shadow.mapSize.set(512, 512);
      C.suitLight.shadow.camera.near = 0.3;
      C.suitLight.shadow.camera.far = 30;
      C.suitLight.shadow.bias = -0.002;
      C.suitLight.shadow.normalBias = 0.05;
      C.scene.add(C.suitLight, C.suitLight.target);
    }
    C.suitLight.visible = true;
    C.suitLight.intensity = 14 * C.suitLightLevel;
    // Only while the governor still runs full shadows: one more shadow
    // pass a frame isn't free.
    C.suitLight.castShadow = C.governorTier().shadows === 2 && C.suitLightLevel > 0.05;
    const yaw = walker.rotation.y;
    const forward = new THREE.Vector3(Math.sin(yaw), -0.18, Math.cos(yaw)).normalize();
    C.suitLight.position
      .copy(walker.position)
      .add(new THREE.Vector3(0, 0.75, 0))
      .addScaledVector(forward, 0.35);
    C.suitLight.target.position.copy(C.suitLight.position).addScaledVector(forward, 10);
  }

  // Per frame while playing a SpaceSystem scene.
  function updateExplorer(dt: number, view: THREE.Camera) {
    if (!C.spaceView || !C.explorerFx) return;
    const player = C.playerIndex >= 0 ? C.objects[C.playerIndex] : undefined;
    const walking = !C.spaceView.flight.piloting;
    const moving = walking && C.playerIndex >= 0 && C.runtime._editor_controller_value(C.playerIndex, 4) > 0.5;
    C.explorerFx.update(dt, view, walking ? player : undefined, moving, (x, z) => C.runtime._editor_space_ground(x, z), C.softGround);
    C.visor.update(dt, walking ? C.explorerFx.weather.rain : 0);
    updateSway(dt);
    updateSuitLight(dt, walking ? player : undefined);
    C.ambience?.update(C.spaceView.air);
    // Touchdown: the settle bob and a thump.
    const landed = C.spaceView.flight.landed;
    const ship = C.shipIndex >= 0 ? C.objects[C.shipIndex] : undefined;
    const f = C.spaceView.flight;
    if (landed && !C.wasLanded) {
      C.explorerFx.touchdown(Math.abs(f.verticalSpeed));
      C.cue("thump");
      // A water landing throws a ring of spray.
      if (ship && f.overWater) C.explorerFx.splash(ship.position.clone().setY(C.runtime._editor_space_ground(ship.position.x, ship.position.z)), 220, 6);
    }
    C.wasLanded = landed;
    // Belly thrusters low over water kick up spray.
    if (ship && f.piloting && !landed && f.overWater && f.altitude < 25 && (f.engineOn || f.vertical > 0))
      C.explorerFx.splash(
        ship.position.clone().setY(C.runtime._editor_space_ground(ship.position.x, ship.position.z)),
        Math.ceil(dt * 160 * (1 - f.altitude / 25)),
        4,
      );
    if (ship) ship.position.y -= C.explorerFx.settleOffset();
    // Large minerals are solid: the walker is pushed back out of them.
    if (walking && player && C.playerIndex >= 0)
      for (const p of C.scatterPlacements) {
        if (p.kind !== "mineral" || p.scale < 1) continue;
        const dx = player.position.x - p.x,
          dz = player.position.z - p.z;
        const reach = 0.6 * p.scale + 0.35;
        const d = Math.hypot(dx, dz);
        if (d < reach && d > 1e-3) C.runtime._editor_push(C.playerIndex, (dx / d) * (reach - d), (dz / d) * (reach - d));
      }
    // The nearest catalogued specimen within reach, for scripts' prompts.
    let near = "";
    if (walking && player) {
      let best = 3;
      C.scatterPlacements.forEach((p, i) => {
        if (C.harvested.has(i) || !C.catalogued.has(p.key)) return;
        const d = Math.hypot(p.x - player.position.x, p.z - player.position.z);
        if (d < best) {
          best = d;
          near = p.key;
        }
      });
    }
    if (near !== C.nearHarvest) {
      C.nearHarvest = near;
      C.uiEvent("near_harvest", near);
    }
    if (C.profileCapture) {
      C.profileCapture.frames.push(dt * 1000);
      if (performance.now() > C.profileCapture.until) {
        const summary = summarizeFrames(C.profileCapture.frames);
        C.profileCapture = undefined;
        const text = JSON.stringify({ title: document.title, at: new Date().toISOString(), ...summary }, null, 2);
        C.log(text);
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
        a.download = "profile.json";
        a.click();
        C.announcer.say(`Profile done: ${summary.fps.toFixed(0)} fps average`);
      }
    }
  }

  function mapBodies(): MapBody[] {
    const star = C.bodyCentre(-1);
    const inverse = C.frameQuaternion().invert();
    const ref = C.runtime._editor_space_value(SpaceField.referenceBody),
      target = C.runtime._editor_space_value(SpaceField.targetBody);
    return C.explorerBodies.map((b, i) => {
      const p = C.bodyCentre(i).sub(star).applyQuaternion(inverse);
      return { name: b.name, x: p.x, z: p.z, radius: b.radius, color: b.color, parent: b.parent, target: i === target, current: i === ref };
    });
  }

  function drawExplorerHud(lines: string[]) {
    if (!C.spaceView) return;
    const ctx = C.hudCtx;
    const hidden = (i: number) => C.runtime._editor_space_body_value(i, 10) === 1;
    const star = C.bodyCentre(-1);
    const inverse = C.frameQuaternion().invert();
    const shipFrame = new THREE.Vector3(
      C.runtime._editor_space_value(SpaceField.shipX),
      C.runtime._editor_space_value(SpaceField.shipY),
      C.runtime._editor_space_value(SpaceField.shipZ),
    );
    const ship = shipFrame.clone().sub(star).applyQuaternion(inverse);
    const all = mapBodies();
    const bodies = all.filter((_, i) => !hidden(i));
    const visibleIndex = all.map((_, i) => i).filter((i) => !hidden(i));
    const reindexed = bodies.map((b) => ({ ...b, parent: b.parent >= 0 ? visibleIndex.indexOf(b.parent) : -1 }));
    const frameBody = C.runtime._editor_space_value(SpaceField.frameBody);
    // Prospecting: the nearest matching deposit as a marker.
    if (C.prospect) {
      const me = C.playerIndex >= 0 ? C.objects[C.playerIndex] : undefined;
      let best: (typeof C.scatterPlacements)[number] | undefined,
        bestDistance = C.prospect.range;
      if (me && !C.spaceView.flight.piloting)
        C.scatterPlacements.forEach((p, i) => {
          if (C.harvested.has(i) || !C.prospect!.keys.has(p.key)) return;
          const d = Math.hypot(p.x - me.position.x, p.z - me.position.z);
          if (d < bestDistance) {
            bestDistance = d;
            best = p;
          }
        });
      if (best) C.uiMarkers.set("prospect", { position: new THREE.Vector3(best.x, best.y + 1.2, best.z), label: C.prospect.label });
      else C.uiMarkers.delete("prospect");
    }
    // Latitude/longitude waypoints, drawn like script markers.
    for (const [id, w] of C.latLonWaypoints) {
      const index = C.explorerBodies.findIndex((b) => b.name === w.body);
      if (index < 0 || hidden(index)) continue;
      C.uiMarkers.set(`ll:${id}`, { position: C.latLonToFrame(index, w.latitude, w.longitude, 4), label: w.label });
    }
    if (C.mapMode === "system") {
      const span = Math.max(...bodies.filter((b) => b.parent < 0).map((b) => Math.hypot(b.x, b.z))) * 2.3;
      drawSystem(ctx, 40, 60, C.hud.width - 80, C.hud.height - 120, reindexed, ship, { x: 0, z: 0 }, span, "SYSTEM MAP  ·  M: surface map");
      lines.push("MAP system");
    } else if (C.mapMode === "surface") {
      const body = C.explorerBodies[frameBody];
      if (body) {
        let image = C.surfaceImages.get(frameBody);
        if (!image) {
          image = surfaceImage(
            256,
            128,
            (x, y, z) => C.runtime._editor_planet_height(frameBody, x, y, z),
            body.terrainAmplitude,
            body.color,
            body.sea,
            body.snow,
          );
          C.surfaceImages.set(frameBody, image);
        }
        const sites: MapSite[] = [...C.mapSites.values()].filter((s) => s.body === body.name);
        for (const landmark of C.spaceView.landmarks)
          if (landmark.body === frameBody)
            sites.push({ id: landmark.label, label: landmark.label, latitude: landmark.latitude, longitude: landmark.longitude, kind: "landmark" });
        for (const [id, w] of C.latLonWaypoints)
          if (w.body === body.name) sites.push({ id, label: w.label, latitude: w.latitude, longitude: w.longitude, kind: "waypoint" });
        const me = C.spaceView.flight.piloting ? shipFrame : ((C.playerIndex >= 0 ? C.objects[C.playerIndex]?.position : undefined) ?? shipFrame);
        const at = C.frameToLatLon(frameBody, me);
        sites.push({ id: "you", label: "You", ...at, kind: C.spaceView.flight.piloting ? "ship" : "player" });
        drawSurface(ctx, 40, 60, C.hud.width - 80, C.hud.height - 120, image, sites, `${body.name.toUpperCase()} SURVEY MAP  ·  M: close`);
        lines.push(`MAP surface ${body.name}`);
      }
    } else if (C.playerSettings.minimap && C.minimapAllowed) {
      const size = Math.min(180, C.hud.height * 0.24);
      if (C.spaceView.flight.piloting && !C.spaceView.flight.landed) {
        // Flight: the reference body's neighbourhood.
        const ref = C.runtime._editor_space_value(SpaceField.referenceBody);
        const focus = ref >= 0 ? all[ref]! : { x: 0, z: 0 };
        const near = ref >= 0 ? all[ref]!.radius * 14 : 4e6;
        drawSystem(ctx, C.hud.width - size - 24, C.hud.height - size - 24, size, size, reindexed, ship, focus, near, "NAV");
      } else {
        const me = C.playerIndex >= 0 && !C.spaceView.flight.piloting ? C.objects[C.playerIndex] : C.shipIndex >= 0 ? C.objects[C.shipIndex] : undefined;
        if (me) {
          const blips: LocalBlip[] = [];
          const shipObject = C.shipIndex >= 0 ? C.objects[C.shipIndex] : undefined;
          if (shipObject && shipObject !== me) blips.push({ x: shipObject.position.x - me.position.x, z: shipObject.position.z - me.position.z, kind: "ship" });
          for (const [, m] of C.uiMarkers) blips.push({ x: m.position.x - me.position.x, z: m.position.z - me.position.z, kind: "marker", label: m.label });
          C.scatterPlacements.forEach((p, i) => {
            if (C.harvested.has(i)) return;
            const dx = p.x - me.position.x,
              dz = p.z - me.position.z;
            // Only what's catalogued (and so harvestable) -- the map isn't omniscient.
            if (Math.abs(dx) > 170 || Math.abs(dz) > 170 || !C.catalogued.has(p.key)) return;
            blips.push({ x: dx, z: dz, kind: "resource" });
          });
          const entities = C.doc.scene.eachAlive();
          C.objects.forEach((o, i) => {
            if (!o?.visible || i === C.playerIndex || i === C.shipIndex || !C.runtime._editor_alive(i)) return;
            const e = entities[i];
            const wild = C.runtime._editor_wildlife_state(i);
            const kind = wild === 2 ? "fleeing" : wild >= 0 ? "fauna" : e && C.doc.scene.effectiveHas(e, "Routine") ? "npc" : undefined;
            if (kind) blips.push({ x: o.position.x - me.position.x, z: o.position.z - me.position.z, kind });
          });
          const heading = view_heading();
          drawLocalMinimap(ctx, C.hud.width - size - 24, C.hud.height - size - 24, size, heading, blips);
        }
      }
    }
  }

  // The view's heading on the minimap (0 = facing -z, "north").
  function view_heading() {
    const forward = C.viewCamera.getWorldDirection(new THREE.Vector3());
    return Math.atan2(forward.x, -forward.z);
  }

  // Hold F to scan: Scannable entities, scattered species and
  // landmarks; a finished scan calls on_ui("scan", key) in every script.
  function scanCandidates(): ScanTarget[] {
    const list: ScanTarget[] = [];
    const entities = C.doc.scene.eachAlive();
    for (const i of [...C.scannableIndices, ...C.spawnedScans.keys()]) {
      const entity = entities[i];
      const object = C.objects[i];
      const scan = (entity && C.doc.scene.resolve(entity, "Scannable")) || C.spawnedScans.get(i);
      if (!scan || !object || !object.visible || !C.runtime._editor_alive(i)) continue;
      list.push({
        key: scan.id || scan.name,
        name: scan.name,
        kind: scan.kind,
        position: object.position,
        range: scan.range,
        fleeing: C.runtime._editor_wildlife_state(i) === 2,
      });
    }
    for (const t of C.scatterTargets) list.push(t);
    for (const landmark of C.spaceView?.landmarks ?? [])
      list.push({
        key: `landmark:${landmark.label}`,
        name: landmark.label,
        kind: "Landmark",
        position: landmark.anchor.getWorldPosition(new THREE.Vector3()),
        range: 70,
      });
    return list;
  }

  function scanHeld() {
    return C.heldKeys.has("KeyF") && !C.spaceView?.flight.piloting && C.playerIndex >= 0;
  }

  function updateScanner(dt: number, view: THREE.Camera) {
    if (!C.scannableIndices.length && !C.scatterTargets.length && !C.spaceView?.landmarks.length) return;
    const player = C.playerIndex >= 0 ? C.objects[C.playerIndex] : undefined;
    if (!player) return;
    const forward = view.getWorldDirection(new THREE.Vector3());
    const moving = C.runtime._editor_controller_value(C.playerIndex, 4) > 2;
    const done = C.scanner.update(dt, scanHeld(), moving, player.position, forward, scanCandidates());
    if (done) {
      // How sure the scan is (0..1), just before the scan itself.
      C.runtime.ccall("editor_ui_event", null, ["string", "string"], ["scan_confidence", C.scanner.confidence.toFixed(2)]);
      C.runtime.ccall("editor_ui_event", null, ["string", "string"], ["scan", done.key]);
    }
  }
  Object.assign(C, { startExplorer, endExplorer, harvest, scatterFrameKey, hideScatter, hideHarvestedHere, updateExplorer, drawExplorerHud, scanHeld, updateScanner });
}
