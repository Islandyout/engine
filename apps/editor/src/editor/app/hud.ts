import * as THREE from "three";
import { EntityField, FighterField } from "../bridgeFields";
import { type MinimapBlip } from "../carFx";
import { rarityColors } from "../lootView";
import { drawFlightHud } from "../spaceView";
import { drawWidget, sampleUIData, widgetInfo, type UIData } from "../uiKit";
import { autoSize, layoutRect } from "../uiLayout";
import type { Ctx } from "./context";

export function installHud(C: Ctx): void {
  // Screen-space Health bars (Play mode only, matches the player readout's
  // own scoping) and authored UI Text/Button elements (main.ts's own
  // player-mode bootstrap aside, visible per each element's own
  // `visibleWhen`, not tied to Play like Health bars) -- both drawn on the
  // same 2D canvas, redrawn from scratch every frame rather than tracked
  // incrementally, matching the Health bars' own established reasoning
  // (entities/UI state can change every tick; nothing here is worth diffing
  // against a held/released-style previous frame).
  // Script waypoints: a diamond with a label and distance, pinned to the
  // screen edge (pointing the way) when off screen or behind the view.
  function drawWaypoints() {
    // The Waypoints widget draws the same markers; both at once doubled every label.
    if (!C.uiMarkers.size || C.sceneWidgets.has("Waypoints")) return;
    const from = C.viewCamera.getWorldPosition(new THREE.Vector3());
    const margin = 36;
    for (const { position, label } of C.uiMarkers.values()) {
      C.hudScratch.copy(position).project(C.viewCamera);
      const behind = C.hudScratch.z > 1;
      let x = C.hudScratch.x,
        y = C.hudScratch.y;
      if (behind) {
        x = -x;
        y = -y;
      }
      const offscreen = behind || Math.abs(x) > 1 || Math.abs(y) > 1;
      if (offscreen) {
        const scale = 1 / Math.max(Math.abs(x), Math.abs(y), 1e-6);
        x *= scale;
        y *= scale;
      }
      const px = Math.min(C.hud.width - margin, Math.max(margin, ((x + 1) / 2) * C.hud.width));
      const py = Math.min(C.hud.height - margin, Math.max(margin, ((1 - y) / 2) * C.hud.height));
      C.hudCtx.save();
      C.hudCtx.translate(px, py);
      C.hudCtx.rotate(Math.PI / 4);
      C.hudCtx.fillStyle = "rgba(255, 211, 106, 0.9)";
      C.hudCtx.strokeStyle = "rgba(0, 0, 0, 0.6)";
      C.hudCtx.lineWidth = 2;
      C.hudCtx.fillRect(-6, -6, 12, 12);
      C.hudCtx.strokeRect(-6, -6, 12, 12);
      C.hudCtx.restore();
      C.hudCtx.font = "700 12px -apple-system, 'Segoe UI', Inter, Roboto, system-ui, sans-serif";
      C.hudCtx.textAlign = "center";
      C.hudCtx.textBaseline = "top";
      C.hudCtx.lineWidth = 3;
      C.hudCtx.strokeStyle = "rgba(0, 0, 0, 0.6)";
      C.hudCtx.fillStyle = "#ffd36a";
      const text = `${label ? label + " " : ""}${Math.round(from.distanceTo(position))}m`;
      C.hudCtx.strokeText(text, px, py + 10);
      C.hudCtx.fillText(text, px, py + 10);
    }
  }

  // "!" over soldiers in combat, "?" over ones that heard or lost something.
  function drawSoldierMarkers() {
    const alive = C.doc.scene.eachAlive();
    C.objects.forEach((object, i) => {
      if (!C.runtime._editor_alive(i)) return;
      const mode = C.runtime._editor_soldier_value(i, 0);
      if (mode < 0 || C.runtime._editor_soldier_value(i, 3) === 0) return;
      const fighting = mode === 2 || mode === 4;
      const curious = mode === 1 || mode === 3;
      if (!fighting && !curious) return;
      const scaleY = C.doc.scene.resolve(alive[i] ?? { index: -1, generation: 0 }, "Scale")?.value.y ?? 1.8;
      C.hudScratch.copy(object.position);
      C.hudScratch.y += scaleY / 2 + 0.75;
      C.hudScratch.project(C.viewCamera);
      if (C.hudScratch.z > 1) return;
      const x = ((C.hudScratch.x + 1) / 2) * C.hud.width;
      const y = ((1 - C.hudScratch.y) / 2) * C.hud.height;
      C.hudCtx.font = "800 20px -apple-system, 'Segoe UI', Inter, Roboto, system-ui, sans-serif";
      C.hudCtx.textAlign = "center";
      C.hudCtx.textBaseline = "middle";
      C.hudCtx.lineWidth = 3;
      C.hudCtx.strokeStyle = "rgba(0,0,0,0.6)";
      C.hudCtx.fillStyle = fighting ? "#ff4a3a" : "#ffd36a";
      C.hudCtx.strokeText(fighting ? "!" : "?", x, y);
      C.hudCtx.fillText(fighting ? "!" : "?", x, y);
    });
  }

  // Crosshair, and a hint while the mouse isn't captured.
  // Returns text for the HUD's screen-reader mirror.
  function drawFirstPersonOverlay(fov = C.fps.camera.fov, onTarget = false): string[] {
    const cx = C.hud.width / 2,
      cy = C.hud.height / 2;
    const weaponCount = C.runtime._editor_weapon_value(C.playerIndex, 5);
    if (weaponCount > 0 || C.runtime._editor_value(C.playerIndex, EntityField.health) >= 0) {
      const names: string[] = [];
      for (let slot = 0; slot < weaponCount; slot++)
        names.push(C.runtime.ccall("editor_weapon_text", "string", ["number", "number", "number"], [C.playerIndex, slot, 0]));
      const slot = C.runtime._editor_weapon_value(C.playerIndex, 0);
      C.weaponFx.drawHud(C.hudCtx, C.hud.width, C.hud.height, {
        weaponName: names[slot] ?? "",
        magazine: C.runtime._editor_weapon_value(C.playerIndex, 1),
        reserve: C.runtime._editor_weapon_value(C.playerIndex, 2),
        reloadProgress: C.runtime._editor_weapon_value(C.playerIndex, 3),
        spread: C.runtime._editor_weapon_value(C.playerIndex, 4),
        aiming: C.runtime._editor_weapon_value(C.playerIndex, 7) === 1,
        fov,
        onTarget,
        health: C.runtime._editor_value(C.playerIndex, EntityField.health),
        slot,
        weaponNames: names,
        kit: true,
      });
      const lines: string[] = [];
      if (weaponCount > 0) {
        const reserve = C.runtime._editor_weapon_value(C.playerIndex, 2);
        lines.push(`${names[slot]} ${C.runtime._editor_weapon_value(C.playerIndex, 1)}/${reserve < 0 ? "∞" : reserve}`);
        if (C.runtime._editor_weapon_value(C.playerIndex, 3) >= 0) lines.push("Reloading");
      }
      const health = C.runtime._editor_value(C.playerIndex, EntityField.health);
      if (health >= 0) lines.push(`Health ${Math.round(health * 100)}`);
      return lines;
    }
    C.hudCtx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    C.hudCtx.lineWidth = 2;
    C.hudCtx.beginPath();
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      C.hudCtx.moveTo(cx + dx * 4, cy + dy * 4);
      C.hudCtx.lineTo(cx + dx * 11, cy + dy * 11);
    }
    C.hudCtx.stroke();
    return [];
  }

  // The boss bar's numbers: its entity by Name.
  function bossReadout() {
    const name = C.ledger.bossName;
    if (!name) return undefined;
    let index = C.doc.scene.eachAlive().findIndex((e) => C.doc.scene.resolve(e, "Name")?.value === name);
    // A boss spawned from a prefab (world.spawn) goes by the prefab's name.
    if (index < 0)
      for (let i = C.doc.scene.eachAlive().length; i < C.objects.length && index < 0; i++)
        if (C.runtime._editor_alive(i) && C.runtime.ccall("editor_spawned_prefab", "string", ["number"], [i]) === name) index = i;
    if (index < 0 || !C.runtime._editor_alive(index)) return { health: -1, stagger: -1, broken: false };
    return {
      health: C.runtime._editor_value(index, EntityField.health),
      stagger: C.runtime._editor_fighter_value(index, FighterField.stagger),
      broken: C.runtime._editor_fighter_value(index, FighterField.broken) > 0,
    };
  }

  // What the UI kit's widgets show this frame (sample data while editing).
  function uiData(): UIData {
    const time = performance.now() / 1000;
    C.frameUIData ??= C.doc.mode === "edit" ? { ...sampleUIData(time, C.hud.width, C.hud.height), pointer: C.uiPointer } : gatherUIData(time);
    return C.frameUIData;
  }

  function fighterReadout(index: number) {
    return {
      health: Math.max(0, C.runtime._editor_value(index, EntityField.health)),
      mana: C.runtime._editor_fighter_value(index, FighterField.mana),
      energy: C.runtime._editor_fighter_value(index, FighterField.energy),
      guard: C.runtime._editor_fighter_value(index, FighterField.guard),
    };
  }

  // A widget with a Source shows that entity's health and fighter bars instead of the Player's.
  function dataForSource(source: string): UIData {
    const base = uiData();
    if (C.doc.mode === "edit" || !source) return base;
    const index = source === "@target" ? C.tps.over : C.doc.scene.eachAlive().findIndex((e) => C.doc.scene.resolve(e, "Name")?.value === source);
    if (index < 0 || !C.runtime._editor_alive(index)) return { ...base, health: -1, fighter: undefined };
    const health = C.runtime._editor_value(index, EntityField.health);
    return { ...base, health, healthGhost: health, fighter: C.combat.isFighter(index) ? fighterReadout(index) : undefined };
  }

  function gatherUIData(time: number): UIData {
    const dt = Math.min(0.1, Math.max(0, time - C.uiFeed.last));
    C.uiFeed.last = time;
    const player = C.playerIndex >= 0 && C.runtime._editor_alive(C.playerIndex) ? C.playerIndex : -1;
    const health = player >= 0 ? C.runtime._editor_value(player, EntityField.health) : -1;
    C.uiFeed.healthGhost = health >= C.uiFeed.healthGhost ? health : Math.max(health, C.uiFeed.healthGhost - dt * 0.5);
    const weaponCount = player >= 0 ? C.runtime._editor_weapon_value(player, 5) : 0;
    const weaponText = (slot: number, field: number) =>
      C.runtime.ccall("editor_weapon_text", "string", ["number", "number", "number"], [player, slot, field]) as string;
    const slots = Array.from({ length: weaponCount }, (_, i) => ({ name: weaponText(i, 0), melee: weaponText(i, 3) !== "" }));
    // (-1: empty-handed, nothing is current)
    const slot = weaponCount > 0 && C.runtime._editor_weapon_value(player, 10) > 0 ? C.runtime._editor_weapon_value(player, 0) : -1;
    const aiming = weaponCount > 0 && C.runtime._editor_weapon_value(player, 7) === 1;
    const fov = C.firstPerson() ? C.fps.camera.fov : C.tps.camera.fov;
    const spread = weaponCount > 0 && !aiming
      ? (Math.tan(THREE.MathUtils.degToRad(C.runtime._editor_weapon_value(player, 4))) / Math.tan(THREE.MathUtils.degToRad(fov) / 2)) * (C.hud.height / 2)
      : 0;
    const forward = C.viewCamera.getWorldDirection(new THREE.Vector3());
    const heading = Math.atan2(forward.x, -forward.z);
    const me = player >= 0 ? C.objects[player] : undefined;
    // On the screen: [x, y, in front of the camera and inside the view].
    const onScreen = (point: THREE.Vector3) => {
      const p = point.clone().project(C.viewCamera);
      return { x: ((p.x + 1) / 2) * C.hud.width, y: ((1 - p.y) / 2) * C.hud.height, onScreen: p.z < 1 && Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 };
    };
    const markers: UIData["markers"] = [];
    if (me && (C.sceneWidgets.has("Compass") || C.sceneWidgets.has("Waypoints") || C.sceneWidgets.has("Minimap")))
      for (const marker of C.uiMarkers.values()) {
        const dx = marker.position.x - me.position.x,
          dz = marker.position.z - me.position.z;
        markers.push({ label: marker.label, distance: Math.hypot(dx, dz), bearing: Math.atan2(dx, -dz), ...onScreen(marker.position) });
      }
    const blips: UIData["blips"] = [];
    if (me && C.sceneWidgets.has("Minimap")) {
      for (let i = 0; i < C.objects.length; i++) {
        const object = C.objects[i];
        if (i === player || !object || !C.runtime._editor_alive(i) || Math.abs(object.position.x - me.position.x) > 90 || Math.abs(object.position.z - me.position.z) > 90) continue;
        const view = C.pickupViews.get(i);
        if (view) {
          if (C.runtime._editor_pickup_value(i, 3) !== 1) blips.push({ x: object.position.x, z: object.position.z, kind: "loot", color: rarityColors[view.visual.rarity] });
          continue;
        }
        if (C.runtime._editor_value(i, EntityField.health) <= 0) continue;
        const team = C.runtime._editor_fighter_value(i, FighterField.has) === 1 ? C.runtime._editor_fighter_value(i, FighterField.team) : C.runtime._editor_soldier_value(i, 3);
        if (team > 0) blips.push({ x: object.position.x, z: object.position.z, kind: "enemy" });
        else if (team === 0) blips.push({ x: object.position.x, z: object.position.z, kind: "ally" });
      }
      for (const marker of C.uiMarkers.values()) blips.push({ x: marker.position.x, z: marker.position.z, kind: "marker" });
    }
    let prompt: UIData["prompt"];
    let loot: UIData["loot"];
    const target = C.runtime._editor_interact_value(0);
    if (target >= 0) {
      const container = C.runtime._editor_interact_value(2) === 1;
      const name = C.runtime.ccall("editor_interact_text", "string", ["number"], [0]) as string;
      const rarity = container ? 0 : C.runtime._editor_pickup_value(target, 4);
      prompt = {
        verb: container ? "Open" : "Pick up",
        name,
        key: "E",
        hold: C.runtime._editor_interact_value(1),
        locked: C.runtime._editor_interact_value(3) === 1,
        need: C.runtime.ccall("editor_interact_text", "string", ["number"], [1]) as string,
        rarity,
      };
      if (!container && C.runtime._editor_pickup_value(target, 5) === 0) {
        const damage = C.runtime._editor_pickup_value(target, 6);
        loot = { name, rarity, damage, rpm: C.runtime._editor_pickup_value(target, 7), magazine: C.runtime._editor_pickup_value(target, 8), melee: damage <= 0 };
      }
    }
    // Getting into and out of a car (Vehicle.enterable): the same prompt, when no pickup or crate has the key.
    const seat = target < 0 ? C.runtime._editor_seat_value(3) : 0;
    if (seat > 0) {
      prompt = {
        verb: seat === 1 ? "Enter" : "Exit",
        name: C.runtime.ccall("editor_seat_text", "string", ["number"], [0]) as string,
        key: "E",
        hold: -1,
        locked: seat === 3,
        need: C.runtime.ccall("editor_seat_text", "string", ["number"], [1]) as string,
        rarity: 0,
      };
    }
    const boss = bossReadout();
    const bossName = C.ledger.bossName;
    if (boss && boss.health >= 0) C.uiFeed.bossGhost = boss.health >= C.uiFeed.bossGhost ? boss.health : Math.max(boss.health, C.uiFeed.bossGhost - dt * 0.4);
    while (C.uiFeed.damage.length && time - C.uiFeed.damage[0]!.at > 1) C.uiFeed.damage.shift();
    while (C.uiFeed.kills.length && time - C.uiFeed.kills[0]!.at > 6) C.uiFeed.kills.shift();
    const items = player >= 0 ? (C.runtime.ccall("editor_items_text", "string", ["number"], [player]) as string) : "";
    const gear = player >= 0 ? readGear(player) : undefined;
    C.viewport.dataset.items = items.trim().split("\n").join(", "); // for tests
    return {
      time,
      width: C.hud.width,
      height: C.hud.height,
      pointer: C.uiPointer,
      padConnected: !!navigator.getGamepads?.().find((g) => g && g.connected),
      health,
      healthGhost: C.uiFeed.healthGhost,
      healthMax: 100,
      shield: -1,
      stamina: player >= 0 && C.combat.isFighter(player) ? C.runtime._editor_fighter_value(player, FighterField.energy) : -1,
      weapon: slots[slot]
        ? {
            name: slots[slot]!.name,
            magazine: C.runtime._editor_weapon_value(player, 1),
            capacity: C.runtime._editor_weapon_value(player, 8),
            reserve: C.runtime._editor_weapon_value(player, 2),
            reload: C.runtime._editor_weapon_value(player, 3),
            melee: slots[slot]!.melee,
          }
        : undefined,
      slots,
      slot,
      spread,
      hostile: C.shooterActive() && C.tps.over >= 0,
      hitAge: time - C.uiFeed.hitAt,
      killAge: time - C.uiFeed.killAt,
      heading,
      player: me ? { x: me.position.x, z: me.position.z } : undefined,
      blips,
      markers,
      prompt,
      loot,
      pickups: C.lootFeed.map((entry) => ({ label: entry.label, amount: entry.amount, rarity: entry.rarity, kind: entry.kind, age: time - entry.at })),
      kills: C.uiFeed.kills.map((kill) => ({ killer: kill.killer, victim: kill.victim, mine: kill.mine, age: time - kill.at })),
      damage: C.uiFeed.damage.map((hit) => {
        const at = onScreen(hit.point);
        return { x: at.x, y: at.y, amount: hit.amount, crit: hit.crit, age: time - hit.at };
      }).filter((hit) => hit.age >= 0),
      boss: boss && bossName && boss.health >= 0 ? { name: bossName, health: boss.health, ghost: C.uiFeed.bossGhost, stagger: Math.max(0, boss.stagger) } : undefined,
      items: gear
        ? gear.items
        : items
            .split("\n")
            .filter(Boolean)
            .map((line) => {
              const space = line.lastIndexOf(" ");
              return { name: line.slice(0, space), count: Number(line.slice(space + 1)) };
            }),
      gear: gear?.gear,
      settings: { master: C.playerSettings.master, sensitivity: C.playerSettings.sensitivity, invertY: C.playerSettings.invertY, aimAssist: C.playerSettings.aimAssist, shake: C.playerSettings.shake },
      title: document.title,
      fighter: player >= 0 && C.combat.isFighter(player) ? fighterReadout(player) : undefined,
      captured: document.pointerLockElement === C.renderer.domElement,
      skills: player >= 0 && C.combat.isFighter(player) ? C.combat.skillStates(player) : [],
    };
  }

  // The Player's Inventory (limits, worn items, items with the slot each fits), if it has one.
  function readGear(player: number): { gear: NonNullable<UIData["gear"]>; items: UIData["items"] } | undefined {
    const text = C.runtime.ccall("editor_inventory_text", "string", ["number"], [player]) as string;
    if (!text) return undefined;
    const gear: NonNullable<UIData["gear"]> = { weight: 0, maxWeight: 0, kinds: 0, maxKinds: 0, worn: { head: "", body: "", hands: "" } };
    const items: UIData["items"] = [];
    for (const line of text.split("\n")) {
      const [tag = "", a = "", b = ""] = line.split(" ");
      if (tag === "weight") gear.weight = Number(a);
      else if (tag === "limit") {
        gear.maxKinds = Number(a);
        gear.maxWeight = Number(b);
      } else if (tag === "worn") gear.worn[a as "head" | "body" | "hands"] = line.split(" ").slice(2).join(" ");
      else if (tag === "item") items.push({ count: Number(a), slot: b === "-" ? undefined : b, name: line.split(" ").slice(3).join(" ") });
    }
    gear.kinds = items.length;
    return { gear, items };
  }

  function drawHud() {
    C.hudCtx.clearRect(0, 0, C.hud.width, C.hud.height);
    C.frameUIData = undefined;
    C.widgetHits.length = 0;
    C.sceneWidgets.clear();
    for (const entity of C.doc.scene.eachAlive()) {
      const ui = C.doc.scene.resolve(entity, "UI");
      if (ui?.kind !== "Widget") continue;
      C.sceneWidgets.add(ui.widget);
    }
    // The visor under everything else, while walking in a suit.
    if (C.doc.mode !== "edit" && C.spaceView && !C.spaceView.flight.piloting) C.visor.draw(C.hudCtx, C.hud.width, C.hud.height);
    C.uiButtonHits.length = 0;
    const hudLines: string[] = [];
    if (C.doc.mode === "play" && C.sceneWidgets.has("World health bar"))
      C.doc.scene.eachAlive().forEach((entity, index) => {
        if (!C.doc.scene.effectiveHas(entity, "Health")) return;
        if (!C.runtime._editor_alive(index)) return;
        // No bar over your own head: in first person, or as a fighter (its HUD shows your health).
        if (index === C.playerIndex && (C.firstPerson() || C.combat.isFighter(index))) return;
        const object = C.objects[index];
        if (!object) return;
        const ratio = C.runtime._editor_value(index, EntityField.health);
        if (ratio < 0) return;
        // In first person a bar is feedback on your own hits, not a radar:
        // only damaged targets within 40 m get one.
        if (C.firstPerson() && (ratio >= 1 || object.position.distanceTo(C.viewCamera.position) > 40)) return;
        // Third person: only the ones nearby (not a sleeping room through the wall).
        if (!C.firstPerson() && C.playerIndex >= 0 && C.objects[C.playerIndex] && object.position.distanceTo(C.objects[C.playerIndex]!.position) > 14) return;
        const scaleY = C.doc.scene.resolve(entity, "Scale")?.value.y ?? 1;
        // Where the simulation has it: a fighter's drawn body isn't its anchor.
        C.hudScratch.set(C.runtime._editor_value(index, EntityField.x), C.runtime._editor_value(index, EntityField.y), C.runtime._editor_value(index, EntityField.z));
        C.hudScratch.y += scaleY / 2 + 0.35;
        C.hudScratch.project(C.viewCamera);
        if (C.hudScratch.z > 1) return; // behind the camera
        const x = ((C.hudScratch.x + 1) / 2) * C.hud.width;
        const y = ((1 - C.hudScratch.y) / 2) * C.hud.height;
        const barWidth = 40,
          barHeight = 5;
        C.hudCtx.fillStyle = "rgba(10, 16, 24, 0.75)";
        C.hudCtx.fillRect(x - barWidth / 2, y - barHeight / 2, barWidth, barHeight);
        C.hudCtx.fillStyle = ratio > 0.5 ? "#4caf50" : ratio > 0.25 ? "#ffb300" : "#e53935";
        C.hudCtx.fillRect(x - barWidth / 2, y - barHeight / 2, barWidth * Math.max(0, Math.min(1, ratio)), barHeight);
      });
    if (C.doc.mode !== "edit") {
      drawSoldierMarkers();
      drawWaypoints();
    }
    if (C.firstPerson()) hudLines.push(...drawFirstPersonOverlay());
    else if (C.shooterActive()) hudLines.push(...drawFirstPersonOverlay(C.tps.camera.fov, C.tps.over >= 0));
    // Melee: health, energy, guard, combo and lock-on.
    if (C.doc.mode === "play" && !C.ledger.playing)
      hudLines.push(
        ...C.combat.drawHud(
          C.hudCtx,
          C.hud.width,
          C.hud.height,
          (point) => {
            C.hudScratch.copy(point).project(C.viewCamera);
            return C.hudScratch.z > 1 ? undefined : { x: ((C.hudScratch.x + 1) / 2) * C.hud.width, y: ((1 - C.hudScratch.y) / 2) * C.hud.height };
          },
          C.objects,
          C.sceneWidgets.has("Fighter bars") && !C.sceneWidgets.has("Skill bar"),
        ),
      );
    // Scanner reticle.
    if (C.doc.mode === "play" && (C.scannableIndices.length || C.scatterTargets.length)) {
      const text = C.scanner.draw(C.hudCtx, C.hud.width, C.hud.height, C.scanHeld());
      if (text) hudLines.push(text);
    }
    // Flight HUD.
    if (C.doc.mode !== "edit" && C.spaceView) {
      const ship = C.shipIndex >= 0 ? C.objects[C.shipIndex] : undefined;
      const me = C.playerIndex >= 0 ? C.objects[C.playerIndex] : undefined;
      const nearShip = !!ship && !!me && !C.spaceView.flight.piloting && C.spaceView.flight.landed && me.position.distanceTo(ship.position) < 9;
      // A game with its own interaction prompt (a "Prompt" UI text) owns the hint.
      if (C.sceneWidgets.has("Flight instruments")) drawFlightHud(C.hudCtx, C.hud.width, C.hud.height, C.spaceView, C.viewCamera, nearShip && !C.uiTextOverrides.has("Prompt"));
      C.drawExplorerHud(hudLines);
      // The same readout as text, for screen readers and tests.
      const f = C.spaceView.flight;
      if (f.piloting)
        hudLines.push(
          `ALT ${Math.round(Math.max(f.altitude, 0))} m`,
          `VS ${f.verticalSpeed.toFixed(1)} m/s`,
          `THR ${Math.round(f.throttle * 100)}%`,
          `FUEL ${Math.round(f.fuel * 100)}%`,
          f.landed ? "LANDED" : "FLYING",
        );
      else if (nearShip && !C.uiTextOverrides.has("Prompt")) hudLines.push("E board ship");
    }
    // Driving HUD: when the player is an arcade car.
    if (C.doc.mode !== "edit" && C.playerIndex >= 0 && C.runtime._editor_alive(C.playerIndex) && C.runtime._editor_vehicle_value(C.playerIndex, 11)) {
      const car = C.carView(C.playerIndex);
      const playerEntity = C.doc.scene.eachAlive()[C.playerIndex];
      const topSpeed = (playerEntity && C.doc.scene.resolve(playerEntity, "Vehicle")?.topSpeed) || 60;
      const instruments = C.sceneWidgets.has("Vehicle instruments");
      if (instruments) C.carFx.drawSpeedometer(C.hudCtx, C.hud.width, C.hud.height, car, topSpeed);
      const me = C.objects[C.playerIndex]!;
      const blips: MinimapBlip[] = [];
      C.objects.forEach((anchor, i) => {
        if (i === C.playerIndex || !C.runtime._editor_alive(i) || !C.runtime._editor_vehicle_value(i, 11)) return;
        const mode = C.runtime._editor_vehicle_value(i, 14);
        blips.push({ x: anchor.position.x, z: anchor.position.z, kind: mode === 2 ? "police" : mode === 1 ? "racer" : "traffic" });
      });
      for (const marker of C.uiMarkers.values()) blips.push({ x: marker.position.x, z: marker.position.z, kind: "marker" });
      if (instruments) C.carFx.drawMinimap(C.hudCtx, C.hud.height, { x: me.position.x, z: me.position.z, yaw: me.rotation.y }, C.minimapRoads, blips);
      hudLines.push(`${Math.round(car.speed * 3.6)} km/h`, `gear ${car.gear < 0 ? "R" : car.gear}`, `nitro ${Math.round(car.nitro * 100)}%`);
    }
    for (const entity of C.doc.scene.eachAlive()) {
      const authoredUi = C.doc.scene.resolve(entity, "UI");
      // A panel cutscene fills the screen alone.
      if (!authoredUi || (C.doc.mode === "play" && C.ledger.playing)) continue;
      const uiName = C.doc.scene.resolve(entity, "Name")?.value ?? "";
      const playing = C.doc.mode !== "edit";
      const override = playing ? C.uiTextOverrides.get(uiName) : undefined;
      const tint = playing ? C.uiColorOverrides.get(uiName) : undefined;
      const ui = {
        ...authoredUi,
        ...(override === undefined ? {} : { text: override }),
        ...(tint ? { color: { x: tint.r, y: tint.g, z: tint.b } } : {}),
      };
      if (ui.visibleWhen === "play" && C.doc.mode !== "play") continue;
      if (ui.visibleWhen === "pause" && C.doc.mode !== "pause") continue;
      // A "toggle" screen is shown while open (and always while editing, so it can be laid out).
      if (ui.visibleWhen === "toggle" && playing && !C.openUI.has(uiName)) continue;
      if (playing && C.uiVisibility.get(uiName) === false) continue;
      // The Objective widget shows the running objective (unless a script set its text).
      const objective = playing && ui.kind === "Widget" && ui.widget === "Objective" && override === undefined ? C.objectiveReadout() : undefined;
      if (objective) ui.text = objective[0];
      const value = objective ? objective[1] : playing ? (C.uiValues.get(uiName) ?? ui.value) : ui.value;
      if (ui.kind === "Widget") {
        if (playing && C.hiddenWidgets.has(entity.index)) continue;
        const kit = widgetInfo(ui.widget);
        const scale = ui.fontSize / 16;
        const rect = layoutRect(ui.anchor, C.hud.width, C.hud.height, ui.width || kit.width * scale, ui.height || kit.height * scale, ui.offsetX, ui.offsetY);
        const now = performance.now() / 1000;
        let seen = C.widgetTexts.get(entity.index);
        if (!seen || seen.text !== ui.text) C.widgetTexts.set(entity.index, (seen = { text: ui.text, since: now }));
        const input = { widget: ui.widget, style: ui.style, text: ui.text, value, fontSize: ui.fontSize, textAge: now - seen.since, preview: !playing };
        const hits = drawWidget(C.hudCtx, input, rect, ui.source ? dataForSource(ui.source) : uiData());
        if (playing) for (const hit of hits) C.widgetHits.push({ ...hit, name: uiName, entity: entity.index });
        if (ui.text) hudLines.push(ui.text);
        continue;
      }
      C.hudCtx.font = `600 ${ui.fontSize}px -apple-system, 'Segoe UI', Inter, Roboto, system-ui, sans-serif`;
      let auto = autoSize(ui.kind, ui.text ? C.hudCtx.measureText(ui.text).width : 0, ui.fontSize);
      if (ui.kind === "Text" && ui.text) {
        const lines = C.uiPainter.lines(ui.text, ui.width);
        auto = {
          width: Math.max(...lines.map((l) => C.hudCtx.measureText(l).width)),
          height: lines.length * Math.round(ui.fontSize * 1.3),
        };
      }
      const rect = layoutRect(ui.anchor, C.hud.width, C.hud.height, ui.width || auto.width, ui.height || auto.height, ui.offsetX, ui.offsetY);
      C.drawUIElement(ui, rect, value);
      // Clickable only outside Edit mode -- see UIComponent's own doc
      // comment (Components.ts) for why authoring a scene must never be
      // able to accidentally trigger a Button's command.
      if (playing && (ui.kind === "Button" || ui.kind === "Slider" || ui.kind === "Toggle"))
        C.uiButtonHits.push({ ...rect, kind: ui.kind, name: uiName, action: ui.action, value });
      if (ui.text) hudLines.push(ui.text);
      if (ui.kind === "Bar" || ui.kind === "Slider" || ui.kind === "Toggle") hudLines.push(`${uiName || ui.kind}=${Math.round(value * 100) / 100}`);
    }
    // Loot: the text mirror for screen readers (the widgets draw the prompt, feed and card).
    if (C.doc.mode === "play" && (C.runtime._editor_interact_value(0) >= 0 || C.runtime._editor_seat_value(3) > 0 || C.lootFeed.length)) {
      const prompt = uiData().prompt;
      if (prompt) hudLines.push(prompt.locked ? (prompt.verb === "Exit" ? prompt.need : `Needs ${prompt.need}`) : `E: ${prompt.verb} ${prompt.name}${prompt.hold >= 0 ? ` (hold ${Math.round(prompt.hold * 100)}%)` : ""}`);
      for (const entry of C.lootFeed) hudLines.push(entry.kind < 0 ? entry.label : `Picked up ${entry.label}`);
    }
    // Where each widget's clicks land, for tests (only when it changes).
    const hitSummary = C.widgetHits.map((h) => `${h.action}@${Math.round(h.left + h.width / 2)},${Math.round(h.top + h.height / 2)}`).join(" ");
    if ((C.viewport.dataset.widgetHits ?? "") !== hitSummary) C.viewport.dataset.widgetHits = hitSummary;
    // GATEBREAKER: panels, the Ledger's windows and the boss bar, drawn last
    // so a window covers the scene's own UI text; the M map covers all.
    if (C.doc.mode === "play") hudLines.push(...C.ledger.draw(C.hudCtx, C.hud.width, C.hud.height, bossReadout()));
    if (C.doc.mode !== "edit")
      hudLines.push(
        ...C.districtMap.draw(C.hudCtx, C.hud.width, C.hud.height, {
          player: C.playerIndex >= 0 ? C.objects[C.playerIndex] : undefined,
          camera: C.viewCamera,
          project: (point) => (point.project(C.viewCamera).z > 1 ? undefined : { x: ((point.x + 1) / 2) * C.hud.width, y: ((1 - point.y) / 2) * C.hud.height }),
          minimap: C.playerSettings.minimap && C.minimapAllowed,
          size: (C.playerSettings as { minimapSize?: string }).minimapSize,
          panels: C.ledger.playing,
          window: C.ledger.systemText !== "",
        }),
      );
    // Sound captions, when the player asked for them: the last few sounds, fading after three seconds.
    if (C.playerSettings.captions && C.captions.length) {
      const now = performance.now();
      C.captions = C.captions.filter((c) => now - c.at < 3000);
      const px = Math.round(16 * C.playerSettings.textScale);
      C.hudCtx.save();
      C.hudCtx.font = `600 ${px}px system-ui, sans-serif`;
      C.hudCtx.textAlign = "center";
      C.captions.forEach((c, i) => {
        const w = C.hudCtx.measureText(c.text).width + 20;
        const y = C.hud.height - 190 - (C.captions.length - 1 - i) * (px + 12);
        C.hudCtx.globalAlpha = Math.min(1, (3000 - (now - c.at)) / 600);
        C.hudCtx.fillStyle = "rgba(0, 0, 0, 0.62)";
        C.hudCtx.fillRect(C.hud.width / 2 - w / 2, y - px, w, px + 10);
        C.hudCtx.fillStyle = "#ffffff";
        C.hudCtx.fillText(c.text, C.hud.width / 2, y);
      });
      C.hudCtx.restore();
    }
    const hudSummary = hudLines.join(" · ");
    if (C.hudText.textContent !== hudSummary) C.hudText.textContent = hudSummary;
  }
  Object.assign(C, { drawHud });
}
