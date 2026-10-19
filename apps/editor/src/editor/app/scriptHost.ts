import * as THREE from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { ambienceLayers, type AmbienceLayer } from "../ambience";
import { parseWeather } from "../explorerFx";
import { parseMapSite } from "../explorerHud";
import { presetFloor } from "../frameGovernor";
import { markCharacter } from "../manhwa";
import {
	codeForBinding,
	isTouchDevice,
	openSettingsPanel,
	storeKeyRemap
} from "../playerSettings";
import { createTouchControls } from "../touchControls";
import { parseVisor } from "../visor";
import type { Ctx } from "./context";

export function installScriptHost(C: Ctx): void {
  function parseOutfit(text: string) {
    return text
      .split(/\s+/)
      .map((part) => /^(\d+)(?::(#[0-9a-fA-F]{6}))?$/.exec(part))
      .filter((m): m is RegExpExecArray => !!m && Number(m[1]) > 0)
      .map((m) => ({ id: Number(m[1]), tint: m[2] }));
  }

  function setOutfit(index: number, spec: { id: number; tint?: string }[]) {
    for (const piece of C.outfits.get(index) ?? []) piece.removeFromParent();
    C.outfits.delete(index);
    const anchor = C.objects[index];
    if (!anchor) return;
    let body: THREE.SkinnedMesh | undefined;
    anchor.traverse((node) => {
      if (!body && (node as THREE.SkinnedMesh).isSkinnedMesh) body = node as THREE.SkinnedMesh;
    });
    if (!body?.parent) return;
    const bones = new Map(body.skeleton.bones.map((bone) => [bone.name, bone]));
    const pieces: THREE.Object3D[] = [];
    for (const { id, tint } of spec) {
      const cached = C.catalogCache.get(id);
      if (!cached) {
        // Worn once it has loaded (unless something else was put on since).
        C.loadCatalogModel(id)?.then(() => {
          if (C.outfits.get(index) === pieces) setOutfit(index, spec);
        });
        continue;
      }
      const clone = SkeletonUtils.clone(cached.scene);
      clone.updateMatrixWorld(true);
      const meshes: THREE.SkinnedMesh[] = [];
      clone.traverse((node) => {
        if ((node as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(node as THREE.SkinnedMesh);
      });
      for (const mesh of meshes) {
        const mapped = mesh.skeleton.bones.map((bone) => bones.get(bone.name) ?? bone);
        mesh.bind(new THREE.Skeleton(mapped, mesh.skeleton.boneInverses), mesh.bindMatrix);
        mesh.frustumCulled = false;
        mesh.castShadow = true;
        if (tint) {
          const material = (mesh.material as THREE.MeshStandardMaterial).clone();
          material.color.multiply(new THREE.Color(tint));
          mesh.material = material;
        }
        markCharacter(mesh);
        body.parent.add(mesh);
        pieces.push(mesh);
      }
    }
    C.outfits.set(index, pieces);
  }

  function handleHost(kind: string, text: string) {
    if (kind === "weather") {
      const weather = parseWeather(text);
      if (C.explorerFx) C.explorerFx.weather = weather;
      C.scanner.tuning.interference = Math.min(1, weather.rain * 0.7 + weather.fog * 0.5);
      C.ambience?.set("rain", weather.rain);
    } else if (kind === "map_site") {
      const site = parseMapSite(text);
      if (site) C.mapSites.set(site.id, site);
    } else if (kind === "map_site_clear") C.mapSites.delete(text);
    else if (kind === "waypoint") {
      const [id, body, lat, lon, label = ""] = text.split("|");
      if (id && body && Number.isFinite(Number(lat)) && Number.isFinite(Number(lon)))
        C.latLonWaypoints.set(id, { body, latitude: Number(lat), longitude: Number(lon), label });
    } else if (kind === "waypoint_clear") C.latLonWaypoints.delete(text);
    else if (kind === "map")
      C.mapMode =
        text === "toggle" ? (C.mapMode === "off" ? "system" : C.mapMode === "system" ? "surface" : "off") : text === "system" || text === "surface" ? text : "off";
    else if (kind === "minimap") C.minimapAllowed = text !== "0";
    else if (kind === "catalogued") C.catalogued.add(text);
    else if (kind === "harvest") C.harvest(text);
    else if (kind === "harvest_spot") {
      C.harvestedSpots.add(text);
      if (text.startsWith(`${C.scatterFrameKey()}|`)) C.hideScatter(Number(text.split("|")[1]));
    } else if (kind === "scanner") {
      const [range = 1, time = 1, condition = 1] = text.split(/\s+/).map(Number);
      C.scanner.tuning.range = Number.isFinite(range) && range > 0 ? range : 1;
      C.scanner.tuning.time = Number.isFinite(time) && time > 0 ? time : 1;
      C.scanner.tuning.condition = Number.isFinite(condition) ? THREE.MathUtils.clamp(condition, 0, 1) : 1;
    } else if (kind === "sky_scan") C.scanner.skyKey = text;
    else if (kind === "music") {
      C.musicMood = text.trim();
      C.music?.setMood(C.musicMood);
    } else if (kind === "visor") C.visor.state = parseVisor(text);
    else if (kind === "suitlight") C.suitLightMode = text === "on" || text === "off" ? text : "auto";
    else if (kind === "dust" && C.explorerFx) {
      const [color = "#d8cfb8", density = "0.5"] = text.split(/\s+/);
      if (/^#[0-9a-fA-F]{6}$/.test(color)) C.explorerFx.dustColor.set(color);
      C.explorerFx.dustDensity = THREE.MathUtils.clamp(Number(density) || 0, 0, 1);
    } else if (kind === "soft") C.softGround = text !== "0";
    else if (kind === "audio") {
      const [layer = "", level = "0"] = text.split(/\s+/);
      if ((ambienceLayers as readonly string[]).includes(layer)) C.ambience?.set(layer as AmbienceLayer, Number(level));
    } else if (kind === "cue") C.cue(text);
    else if (kind === "light") {
      const [ambient = NaN, sunLevel = NaN] = text.split(/\s+/).map(Number);
      C.lightOverride = Number.isFinite(ambient) && Number.isFinite(sunLevel) ? { ambient: Math.max(0, ambient), sun: Math.max(0, sunLevel) } : undefined;
      // (Under a time of day it waits until that's cleared.)
      if (C.lightOverride && C.timeOfDay === undefined) {
        C.hemisphere.intensity = C.lightOverride.ambient;
        C.sun.intensity = C.lightOverride.sun;
      }
    } else if (kind === "time_of_day") {
      const hours = Number(text);
      C.applyTimeOfDay(Number.isFinite(hours) && hours >= 0 ? hours : undefined);
    } else if (kind === "pause_menu") C.pauseMenu = text === "1";
    else if (kind === "objective") C.objectiveCommand(text);
    else if (kind === "ui_open") {
      const [name = "", mode = "1"] = text.split("|");
      if (mode === "t") C.toggleUI(name);
      else C.setUIOpen(name, mode === "1");
    }
    else if (kind === "ui_color") {
      const [name = "", hex = ""] = text.split("|");
      if (/^#[0-9a-fA-F]{6}$/.test(hex)) C.uiColorOverrides.set(name, new THREE.Color(hex));
      else C.uiColorOverrides.delete(name);
    }

    else if (kind === "announce") C.announcer.say(text);
    else if (kind === "system") {
      const split = text.indexOf("|");
      C.ledger.system(split < 0 ? text : text.slice(0, split), split < 0 ? "" : text.slice(split + 1));
      if (text) C.announcer.say(C.ledger.systemText);
    } else if (kind === "panels") C.ledger.panels(text);
    else if (kind === "boss") {
      const [name = "", title = ""] = text.split("|");
      C.ledger.setBoss(name, title || name);
    }
    else if (kind === "settings") openPlayerSettings();
    else if (kind === "map_layout" || kind === "map_marker" || kind === "map_marker_clear") C.districtMap.host(kind, text);
    else if (kind === "prospect") {
      // "label|range|key,key,..." -- empty to stop.
      const [label = "", range = "300", keys = ""] = text.split("|");
      C.prospect = label ? { label, range: Number(range) || 300, keys: new Set(keys.split(",").filter(Boolean)) } : undefined;
      if (!C.prospect) C.uiMarkers.delete("prospect");
    }
  }

  function releasePointer() {
    C.unlockingUntil = performance.now() + 500;
    document.exitPointerLock();
  }

  function sceneBindings() {
    const entity = C.doc.scene.eachAlive().find((e) => C.doc.scene.effectiveHas(e, "InputActions"));
    return entity ? C.doc.scene.resolve(entity, "InputActions")?.bindings : undefined;
  }

  function isBlockCode(code: string) {
    const text = sceneBindings() ?? "";
    if (text !== C.blockCodesFor) {
      C.blockCodesFor = text;
      const names = /^\s*block\s*:(.*)$/m.exec(text)?.[1]?.split(",") ?? [];
      C.blockCodes = new Set(names.map((n) => codeForBinding(n.trim())).filter((c): c is string => !!c));
    }
    return C.blockCodes.has(code);
  }

  function openPlayerSettings(paused = false) {
    if (C.settingsPanel) return;
    C.releaseHeldKeys();
    C.settingsPanel = openSettingsPanel(C.app, C.playerSettings, applyPlayerSettings, {
      paused,
      bindings: sceneBindings(),
      remap: C.keyRemap,
      onRemap: (remap) => {
        C.keyRemap = remap;
        storeKeyRemap(document.title, remap);
      },
      onClose: () => (C.settingsPanel = undefined),
      onProfile: () => {
        C.profileCapture = { frames: [], until: performance.now() + 60000 };
        C.announcer.say("Profiling for 60 seconds");
      },
    });
  }

  function applyPlayerSettings() {
    C.governor.reset(presetFloor(C.playerSettings.quality));
    C.applyGovernor();
    C.mixer?.setPlayerVolumes(C.playerSettings.master, C.playerSettings.music, C.playerSettings.sfx);
    C.applyExposure();
    C.applyInk();
    if (C.explorerFx) {
      C.explorerFx.reducedMotion = C.playerSettings.reducedMotion;
      C.explorerFx.footprints = C.playerSettings.footprints;
    }
    syncTouchControls();
  }

  // On-screen controls while playing on a touch screen (or when the player
  // setting turns them on), for any game.
  function syncTouchControls() {
    const wantTouch = C.doc.mode !== "edit" && (C.playerSettings.touch === "on" || (C.playerSettings.touch === "auto" && isTouchDevice()));
    if (wantTouch && !C.touchControls)
      C.touchControls = createTouchControls(C.viewport, (code, key, down) => {
        if (C.districtMap.touchKey(code, down)) return C.releaseHeldKeys();
        C.keyQueue.push([code, down ? 1 : 0]);
        if (down) C.heldKeys.add(code);
        else C.heldKeys.delete(code);
        for (const name of key && key !== code ? [key, code] : [code]) {
          C.scriptKeyQueue.push([name, down ? 1 : 0]);
          if (down) C.heldScriptKeys.add(name);
          else C.heldScriptKeys.delete(name);
        }
      });
    else if (!wantTouch && C.touchControls) {
      C.touchControls.dispose();
      C.touchControls = undefined;
    }
  }
  Object.assign(C, { parseOutfit, setOutfit, handleHost, releasePointer, isBlockCode, openPlayerSettings, applyPlayerSettings, syncTouchControls });
}
