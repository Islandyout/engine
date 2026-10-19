import type { SceneComponents } from "../../scene/Scene";
import { EntityField } from "../bridgeFields";
import { isHandgun } from "../gunHold";
import { animatePickup, openContainer, rarities } from "../lootView";
import type { Ctx } from "./context";

export function installLoot(C: Ctx): void {
  // A Pickup's "On pickup" lines: "<UI entity name>: <text> | <seconds>". The named UI element is
  // shown with that text (for the seconds, if given). Nothing is added or replaced.
  function applyOnPickup(sceneIndex: number, label: string, amount: number) {
    const entity = C.doc.scene.eachAlive()[sceneIndex];
    const lines = (entity && C.doc.scene.resolve(entity, "Pickup")?.onPickup) || "";
    for (const raw of lines.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const colon = line.indexOf(":");
      if (colon < 1) {
        C.log(`Pickup.onPickup: "${line}" needs "<UI entity name>: <text>".`);
        continue;
      }
      const name = line.slice(0, colon).trim();
      const rest = line.slice(colon + 1);
      const bar = rest.lastIndexOf("|");
      const seconds = bar >= 0 ? Number(rest.slice(bar + 1)) : 0;
      const text = (bar >= 0 && Number.isFinite(seconds) ? rest.slice(0, bar) : rest).trim().replace(/\{name\}/g, label).replace(/\{amount\}/g, String(amount));
      if (!C.doc.scene.eachAlive().some((e) => C.doc.scene.resolve(e, "Name")?.value === name && C.doc.scene.resolve(e, "UI"))) {
        C.log(`Pickup.onPickup: there is no UI element named "${name}" in the scene.`);
        continue;
      }
      if (text) C.uiTextOverrides.set(name, text);
      C.uiVisibility.set(name, true);
      if (seconds > 0) C.onPickupTimers.push({ name, until: performance.now() / 1000 + seconds });
    }
  }

  // Runtime-spawned prefab instances (world.spawn) get render objects at the
  // same index the bridge appended them at.
  function adoptSpawnedEntities() {
    const count = C.runtime._editor_entity_count();
    while (C.objects.length < count) {
      const index = C.objects.length;
      const prefab = C.runtime.ccall("editor_spawned_prefab", "string", ["number"], [index]);
      const components = (prefab === "@pickup" ? spawnedPickup(index) : (C.doc.scene.getPrefab(prefab)?.components ?? {})) as Partial<SceneComponents>;
      const position = {
        x: C.runtime._editor_value(index, EntityField.x),
        y: C.runtime._editor_value(index, EntityField.y),
        z: C.runtime._editor_value(index, EntityField.z),
      };
      C.createEntityObject((type) => (type === "Transform" ? ({ position } as SceneComponents[typeof type]) : components[type]));
      // Spawned scannables (wildlife a script releases) can be scanned too.
      if (components.Scannable) C.spawnedScans.set(index, components.Scannable);
    }
  }

  // Loot the runtime dropped (a dead enemy's gun, a crate's contents) as
  // a Pickup component, for its look.
  function spawnedPickup(index: number): Partial<SceneComponents> {
    const kinds = ["Weapon", "Ammo", "Health", "Item"] as const;
    const kind = kinds[C.runtime._editor_pickup_value(index, 5)] ?? "Item";
    const model = C.runtime.ccall("editor_pickup_text", "string", ["number", "number"], [index, 1]) as string;
    const gun = C.isGunPath(`/weapons/${model}.glb`) || isHandgun(model);
    return {
      Scale: { value: { x: 0.5, y: 0.4, z: 0.5 } },
      Pickup: {
        kind,
        weapon: kind === "Weapon" ? (gun ? `w: model=rifle held=${model}` : `w: melee=${model}`) : "",
        item: kind === "Item" ? model : "",
        amount: Math.max(1, C.runtime._editor_pickup_value(index, 1)),
        rarity: rarities[C.runtime._editor_pickup_value(index, 4)] ?? "Common",
        press: C.runtime._editor_pickup_value(index, 2) === 1,
        onPickup: "",
        respawn: 0,
      },
    };
  }

  function updateLoot(dt: number) {
    const time = performance.now() / 1000;
    for (const [i, view] of C.pickupViews) {
      if (!C.objects[i]) {
        C.pickupViews.delete(i);
        continue;
      }
      animatePickup(view.visual, time, view.phase);
      if (C.doc.mode !== "edit") view.visual.root.visible = C.runtime._editor_pickup_value(i, 3) !== 1;
    }
    for (let k = C.openings.length - 1; k >= 0; k--) {
      const opening = C.openings[k]!;
      opening.t += dt;
      if (!opening.step(opening.t)) C.openings.splice(k, 1);
    }
    if (C.doc.mode === "edit") return;
    const count = C.runtime._editor_take_loot_events();
    for (let e = 0; e < count; e++) {
      const kind = C.runtime._editor_loot_event(e, 0);
      const entity = C.runtime._editor_loot_event(e, 1);
      const label = C.runtime.ccall("editor_loot_event_text", "string", ["number"], [e]) as string;
      const rarity = C.runtime._editor_loot_event(e, 3);
      if (kind === 0) {
        C.sounds().pickup(rarity);
        applyOnPickup(entity, label, C.runtime._editor_loot_event(e, 2));
        C.lootFeed.push({ label, rarity, amount: C.runtime._editor_loot_event(e, 2), kind: C.runtime._editor_pickup_value(entity, 5), at: time });
      } else if (kind === 1) {
        const object = C.objects[entity];
        if (object) {
          C.sounds().crate();
          C.openings.push({ step: openContainer(object, C.viewCamera.position), t: 0 });
        }
      } else if (kind === 3) {
        C.sounds().locked();
        C.lootFeed.push({ label: `Needs ${label}`, rarity: 0, amount: 0, kind: -1, at: time });
      } else if (kind === 4) {
        C.sounds().locked();
        C.lootFeed.push({ label: `Inventory full: ${label}`, rarity: 0, amount: 0, kind: -1, at: time });
      }
    }
    for (let k = C.onPickupTimers.length - 1; k >= 0; k--) {
      if (time < C.onPickupTimers[k]!.until) continue;
      C.uiVisibility.set(C.onPickupTimers[k]!.name, false);
      C.onPickupTimers.splice(k, 1);
    }
    while (C.lootFeed.length && time - C.lootFeed[0]!.at > 6) C.lootFeed.shift();
    while (C.lootFeed.length > 6) C.lootFeed.shift();
  }
  Object.assign(C, { adoptSpawnedEntities, updateLoot });
}
