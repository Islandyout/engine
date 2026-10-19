import * as THREE from "three";
import { iconEl, textSpan } from "../dom";
import { limitReason } from "../frameGovernor";
import { fuzzyScore } from "../fuzzy";
import { renderInspector } from "../inspector";
import { nextSiteView } from "../siteView";
import {
	applyBrush,
	generateHeights,
	type BrushMode
} from "../terrain";
import { shapeTerrain } from "../terrainMesh";
import type { Ctx } from "./context";

export function installPanels(C: Ctx): void {
  function populatePrefabSelect() {
    const select = C.el<HTMLSelectElement>("prefab-select");
    const previous = select.value;
    const names = C.doc.scene.prefabNames();
    // Options built with the Option constructor, not innerHTML string
    // interpolation -- a prefab name is arbitrary user text (it can contain
    // ", <, & ...) and innerHTML would mis-parse it instead of just
    // rendering it literally.
    select.replaceChildren(...names.map((name) => new Option(name, name)));
    if (names.includes(previous)) select.value = previous;
    const hasPrefabs = names.length > 0;
    select.hidden = !hasPrefabs;
    C.el<HTMLButtonElement>("prefab-place").disabled = !hasPrefabs || C.doc.mode !== "edit";
    C.el("prefab-hint").hidden = hasPrefabs;
  }

  function applySiteView() {
    const select = C.el("site-view") as HTMLSelectElement;
    // A newly opened scene gets its own default.
    if (C.siteViewScene !== C.doc.scene) {
      C.siteViewScene = C.doc.scene;
      C.siteViewDefaulted = false;
    }
    const refs = C.doc.scene.eachAlive();
    const sites = refs.flatMap((e, i) => (C.doc.scene.effectiveHas(e, "Site") ? [i] : []));
    select.hidden = sites.length === 0;
    if (!sites.length) {
      ({ view: C.siteView, defaulted: C.siteViewDefaulted } = nextSiteView({ view: C.siteView, defaulted: C.siteViewDefaulted }, false, undefined, []));
      return;
    }
    const siteOfEntity = (index: number): string => {
      let ref = refs[index];
      for (let guard = 0; ref && guard < 64; guard++) {
        const i = refs.findIndex((e) => e.index === ref!.index && e.generation === ref!.generation);
        if (sites.includes(i)) return String(i);
        const parent = C.doc.scene.resolve(ref, "Parent")?.entity;
        ref = parent && C.doc.scene.alive(parent) ? parent : undefined;
      }
      return "home";
    };
    // Only a new selection moves the view (a manual pick stays put).
    let selectedSite: string | undefined;
    const selection = C.doc.selection;
    if (selection && (selection.index !== C.siteViewSelection?.index || selection.generation !== C.siteViewSelection?.generation)) {
      const i = refs.findIndex((e) => e.index === selection.index && e.generation === selection.generation);
      if (i >= 0) selectedSite = siteOfEntity(i);
    }
    C.siteViewSelection = selection ?? undefined;
    const options = [
      ["all", "Show: everything"],
      ["home", "Show: home"],
      ...sites.map((i) => [String(i), `Show: ${C.doc.scene.resolve(refs[i]!, "Site")?.name || "site"}`]),
    ];
    if (select.options.length !== options.length || [...select.options].some((o, k) => o.value !== options[k]![0] || o.text !== options[k]![1])) {
      select.replaceChildren(...options.map(([value, text]) => new Option(text, value)));
    }
    ({ view: C.siteView, defaulted: C.siteViewDefaulted } = nextSiteView(
      { view: C.siteView, defaulted: C.siteViewDefaulted },
      true,
      selectedSite,
      options.map(([value]) => value!),
    ));
    select.value = C.siteView;
    refs.forEach((entity, i) => {
      const object = C.objects[i];
      if (!object || C.doc.scene.effectiveHas(entity, "Parent")) return;
      // Playing: the game decides what's where.
      if (C.doc.mode !== "edit") {
        if (object.userData.siteHidden) object.visible = true;
        object.userData.siteHidden = false;
        return;
      }
      const site = sites.includes(i) ? String(i) : "home";
      const shown = C.siteView === "all" || C.siteView === site;
      if (!shown) {
        if (object.visible) object.userData.siteHidden = true;
        object.visible = false;
      } else if (object.userData.siteHidden) {
        object.visible = true;
        object.userData.siteHidden = false;
      }
    });
  }

  function updatePanels() {
    if (C.doc.mode === "edit") C.scheduleContentCheck();
    applySiteView();
    updateSculptBar();
    C.gizmo.detach();
    populatePrefabSelect();
    for (const id of ["translate", "rotate", "scale", "space", "snap", "snap-size"]) (C.el(id) as HTMLButtonElement).disabled = C.doc.mode !== "edit";
    C.el("document").textContent = `${C.doc.project} / ${C.doc.name}${C.doc.dirty ? " • unsaved" : ""}`;
    C.el<HTMLButtonElement>("undo").disabled = !C.doc.canUndo || C.doc.mode !== "edit";
    C.el<HTMLButtonElement>("redo").disabled = !C.doc.canRedo || C.doc.mode !== "edit";
    const tree = C.el("tree");
    tree.replaceChildren();
    for (const entity of C.doc.scene.eachAlive()) {
      const name = C.doc.scene.resolve(entity, "Name")?.value ?? `Entity ${entity.index}`;
      if (fuzzyScore(C.el<HTMLInputElement>("search").value, name) < 0) continue;
      const button = document.createElement("button");
      button.className = "entity";
      // Keep the exact "↳ "/"□ " text prefix (not just a decorative icon):
      // it is part of this button's accessible name, matched verbatim by
      // the browser test suite (getByRole("button", { name: "□ ..." })).
      const hasParent = C.doc.scene.effectiveHas(entity, "Parent");
      button.append(iconEl(hasParent ? "child" : "cube", "icon-tree"), textSpan((hasParent ? "↳ " : "□ ") + name, "entity-name"));
      if (C.doc.selection?.index === entity.index) button.classList.add("selected");
      button.onclick = () => {
        C.doc.selection = entity;
        updatePanels();
      };
      tree.append(button);
    }
    const inspector = C.el("inspector");
    inspector.replaceChildren();
    const entity = C.doc.selection;
    if (!entity || !C.doc.scene.alive(entity)) {
      inspector.textContent = "Select an entity.";
      C.selection.visible = false;
      return;
    }
    const object = C.objects[C.doc.scene.eachAlive().findIndex((e) => e.index === entity.index)];
    if (object) {
      if (C.doc.mode === "edit") C.gizmo.attach(object);
      C.selection.setFromObject(object);
      C.selection.visible = true;
    }
    renderInspector(inspector, entity, {
      doc: C.doc,
      execute: C.execute,
      animationClipOptions: C.animationClipOptions,
      catalogEntry: C.catalogEntry,
      inspectorIssues: C.inspectorIssues,
    });
  }

  function selectedTerrainIndex(): number {
    if (C.doc.mode !== "edit" || !C.doc.selection || !C.doc.scene.effectiveHas(C.doc.selection, "Terrain")) return -1;
    const index = C.doc.scene.eachAlive().findIndex((e) => e.index === C.doc.selection!.index);
    return C.terrainMeshes.has(index) ? index : -1;
  }

  function sculpting(): boolean {
    return C.sculptMode() !== "off" && selectedTerrainIndex() >= 0;
  }

  // Left-drag sculpts instead of orbiting while a brush is active.
  function updateSculptBar() {
    const bar = C.sculptElement("sculpt-bar");
    if (!bar) return;
    bar.hidden = C.doc.mode !== "edit" || !C.doc.selection || !C.doc.scene.effectiveHas(C.doc.selection, "Terrain");
    const active = sculpting();
    C.controls.mouseButtons.LEFT = (active ? null : THREE.MOUSE.ROTATE) as THREE.MOUSE;
    C.gizmo.enabled = !active && !C.gizmoPaused;
  }

  function terrainPoint(event: PointerEvent, index: number): THREE.Vector3 | undefined {
    const rect = C.renderer.domElement.getBoundingClientRect();
    C.sculptRay.setFromCamera(new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, (-(event.clientY - rect.top) / rect.height) * 2 + 1), C.camera);
    const hit = C.sculptRay.intersectObject(C.terrainMeshes.get(index)!.mesh, false)[0];
    return hit ? C.objects[index]!.worldToLocal(hit.point.clone()) : undefined;
  }

  function sculptDab(event: PointerEvent) {
    if (!C.sculptStroke) return;
    const point = terrainPoint(event, C.sculptStroke.index);
    const live = C.terrainMeshes.get(C.sculptStroke.index);
    if (!point || !live) return;
    applyBrush(live.params, live.offsets, C.sculptTool.value as BrushMode, point.x, point.z, Number(C.sculptRadius.value), Number(C.sculptStrength.value) * 0.2);
    shapeTerrain(live.mesh.geometry, generateHeights(live.params, live.offsets), live.look, live.params.seed);
  }

  function updateStats(frameMs: number, tickMs: number) {
    C.stats.frames++;
    C.stats.frameMs += frameMs;
    C.stats.tickMs += tickMs;
    const now = performance.now();
    if (C.statsPanel.hidden || now - C.stats.since < 250) return;
    const fps = (C.stats.frames * 1000) / (now - C.stats.since);
    const info = C.renderer instanceof THREE.WebGLRenderer ? C.renderer.info : undefined;
    const systems = C.runtime
      .ccall("editor_profile_text", "string", [], [])
      .split(";")
      .filter(Boolean)
      .map((entry) => {
        const [name, ms] = entry.split("=");
        return `  ${name!.replace("editor.", "").padEnd(16)}${Number(ms).toFixed(3)} ms`;
      });
    C.statsPanel.textContent = [
      `FPS          ${fps.toFixed(0)}`,
      `Frame        ${(C.stats.frameMs / C.stats.frames).toFixed(2)} ms`,
      `C++ ticks    ${(C.stats.tickMs / C.stats.frames).toFixed(2)} ms/frame`,
      `Draw calls   ${info?.render.calls ?? "-"}`,
      `Batched      ${C.staticBatcher.size} objects in ${C.staticBatcher.drawn} meshes`,
      `Governor     tier ${C.governorTier() === C.governor.settings ? C.governor.tier : C.governor.floor} (${(C.governorTier().scale * 100).toFixed(0)}% res)`,
      `Limited by   ${limitReason((now - C.stats.since) / C.stats.frames, C.stats.frameMs / C.stats.frames, C.stats.tickMs / C.stats.frames)}`,
      `Triangles    ${info?.render.triangles ?? "-"}`,
      `GPU memory   ${info ? `${info.memory.geometries} geometries, ${info.memory.textures} textures` : "-"}`,
      `Entities     ${C.doc.scene.entityCount} (+${Math.max(0, C.objects.length - C.doc.scene.eachAlive().length)} spawned)`,
      ...(systems.length ? ["Systems (last tick):", ...systems] : []),
    ].join("\n");
    C.stats.frames = 0;
    C.stats.frameMs = 0;
    C.stats.tickMs = 0;
    C.stats.since = now;
  }
  Object.assign(C, { applySiteView, updatePanels, selectedTerrainIndex, sculpting, updateSculptBar, sculptDab, updateStats });
}
