import * as THREE from "three";
import type {
	UIAction
} from "../../scene/Components";
import {
	storeSettings
} from "../playerSettings";
import { applySettingHit } from "../uiKit";
import type { Ctx } from "./context";
import { WidgetHit } from "./context";

export function installUiActions(C: Ctx): void {
  // Runs a UI Button's authored action by clicking the real transport button
  // that already does it, rather than reimplementing (or going through
  // doc.execute(), which unconditionally rejects everything outside Edit
  // mode -- see UIComponent's own doc comment for why that ruled out a
  // free-form command here). "restart" is Stop (rebuild()s every entity back
  // to its authored Transform/state) immediately followed by Play (re-syncs
  // and starts a fresh session) -- there's no single existing button for
  // that combination, so it's the one action that chains two clicks.
  // A value change from interaction: stored for drawing and sent to every
  // script's on_ui(name, value).
  function setUIValue(name: string, value: number) {
    C.uiValues.set(name, value);
    uiEvent(name, String(value));
  }

  function uiEvent(name: string, value: string) {
    C.runtime.ccall("editor_ui_event", null, ["string", "string"], [name, value]);
  }

  // A click on a UI kit widget (the actions are listed on UIHit).
  function widgetAction(hit: WidgetHit, x: number) {
    const [kind = "", arg = ""] = hit.action.split(":");
    switch (kind) {
      case "resume":
      case "restart":
      case "quit":
        runUIAction(kind);
        return;
      case "settings":
        C.openPlayerSettings(C.doc.mode === "pause");
        return;
      case "play":
        C.hiddenWidgets.add(hit.entity);
        uiEvent(hit.name, "play");
        return;
      case "slot":
        if (C.playerIndex < 0 || !C.runtime._editor_select_weapon(C.playerIndex, Number(arg))) C.log(`UI: the Player has no weapon slot ${Number(arg) + 1}.`);
        else if (C.doc.mode === "pause") runUIAction("resume");
        return;
      case "choice":
      case "next":
        uiEvent(hit.name, hit.action);
        return;
      case "slider":
      case "toggle":
        if (!applySettingHit(hit.action, (x - hit.left) / hit.width, C.playerSettings)) break;
        storeSettings(C.playerSettings);
        C.applyPlayerSettings();
        if (kind === "slider") C.draggingWidget = hit;
        return;
    }
    C.log(`UI: a widget click with no action "${hit.action}".`);
  }

  // An entity's name for the kill feed.
  function entityLabel(index: number): string {
    if (index === C.playerIndex) return "You";
    const entity = C.doc.scene.eachAlive()[index];
    const name = entity ? C.doc.scene.resolve(entity, "Name")?.value : (C.runtime.ccall("editor_spawned_prefab", "string", ["number"], [index]) as string);
    return name || `#${index}`;
  }

  function runUIAction(action: UIAction) {
    switch (action) {
      case "restart":
        C.el<HTMLButtonElement>("stop").click();
        C.el<HTMLButtonElement>("play").click();
        break;
      case "resume":
        C.el<HTMLButtonElement>("play").click();
        break;
      case "pause":
        C.el<HTMLButtonElement>("pause").click();
        break;
      case "quit":
        C.el<HTMLButtonElement>("stop").click();
        break;
    }
  }

  // The entity under a viewport point, selected (nothing when empty space).
  function selectAt(clientX: number, clientY: number) {
    const rect = C.renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, (-(clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(pointer, C.camera);
    const hit = ray.intersectObjects(
      C.objects.filter((o) => o.visible),
      true,
    )[0];
    if (hit) {
      let object = hit.object;
      while (!C.objects.includes(object) && object.parent) object = object.parent;
      C.doc.selection = C.doc.scene.eachAlive()[C.objects.indexOf(object)];
      C.updatePanels();
    }
    return !!hit;
  }

  // The entity menu: what the toolbar does to the selection, under the finger.
  function openEntityMenu(x: number, y: number) {
    document.querySelector(".entity-menu")?.remove();
    if (!C.doc.selection) return;
    const menu = document.createElement("div");
    menu.className = "entity-menu";
    menu.setAttribute("role", "menu");
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    const close = () => {
      menu.remove();
      window.removeEventListener("pointerdown", outside, true);
    };
    const outside = (event: PointerEvent) => {
      if (!menu.contains(event.target as Node)) close();
    };
    for (const [label, id] of [
      ["Frame", "frame"],
      ["Duplicate", "duplicate"],
      ["Delete", "delete"],
    ] as const) {
      const item = document.createElement("button");
      item.type = "button";
      item.setAttribute("role", "menuitem");
      item.textContent = label;
      item.onclick = () => {
        close();
        C.el(id).click();
      };
      menu.append(item);
    }
    document.body.append(menu);
    setTimeout(() => window.addEventListener("pointerdown", outside, true));
    (menu.firstElementChild as HTMLElement).focus();
    menu.onkeydown = (event) => {
      if (event.key === "Escape") close();
    };
  }
  Object.assign(C, { setUIValue, uiEvent, widgetAction, entityLabel, runUIAction, selectAt, openEntityMenu });
}
