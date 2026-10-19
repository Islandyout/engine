import { answers, goalFraction, nameAndCount, parseActions, parseObjectives, type ObjectiveDef } from "../actionScript";
import type { Ctx } from "./context";

// What the UI kit's "When clicked" lines, key toggles and the Objectives component do.
// The language itself is in actionScript.ts.
export function installActions(C: Ctx): void {
  // The scene's UI element called `name`.
  function uiNamed(name: string) {
    for (const entity of C.doc.scene.eachAlive()) {
      const ui = C.doc.scene.resolve(entity, "UI");
      if (ui && C.doc.scene.resolve(entity, "Name")?.value === name) return { entity, ui };
    }
    return undefined;
  }
  // Opens or closes an element: a "toggle" element is shown while open; any other is shown unless hidden.
  function setUIOpen(name: string, open: boolean) {
    const found = uiNamed(name);
    if (!found) {
      C.log(`UI action: there is no UI element named "${name}" in the scene.`);
      return;
    }
    if (found.ui.visibleWhen === "toggle") {
      if (open) C.openUI.add(name);
      else C.openUI.delete(name);
    } else if (open) C.uiVisibility.delete(name);
    else C.uiVisibility.set(name, false);
    // (A Main menu that Play hid comes back too.)
    if (open) C.hiddenWidgets.delete(C.doc.scene.eachAlive().indexOf(found.entity));
    // A screen needs the mouse.
    if (open && found.ui.kind === "Widget" && document.pointerLockElement) C.releasePointer();
  }
  function toggleUI(name: string) {
    const found = uiNamed(name);
    if (!found) return setUIOpen(name, true);
    const shown = found.ui.visibleWhen === "toggle" ? C.openUI.has(name) : C.uiVisibility.get(name) !== false;
    setUIOpen(name, !shown);
  }
  // A key that shows/hides a "toggle" element. Returns whether the press was used.
  function toggleKeyPressed(code: string): boolean {
    let used = false;
    for (const entity of C.doc.scene.eachAlive()) {
      const ui = C.doc.scene.resolve(entity, "UI");
      if (!ui || ui.visibleWhen !== "toggle" || ui.toggleKey !== code) continue;
      toggleUI(C.doc.scene.resolve(entity, "Name")?.value ?? "");
      used = true;
    }
    return used;
  }

  function playerOp(op: string, name: string, amount: number, text = ""): number {
    if (C.playerIndex < 0) return -1;
    return C.runtime.ccall("editor_inventory_op", "number", ["number", "string", "string", "number", "string"], [C.playerIndex, op, name, amount, text]) as number;
  }

  function runAction(verb: string, args: string, source: string) {
    switch (verb) {
      case "show":
        return setUIOpen(args, true);
      case "hide":
        return setUIOpen(args, false);
      case "toggle":
        return toggleUI(args);
      case "pause":
      case "resume":
      case "restart":
      case "quit":
        return C.runUIAction(verb);
      case "settings":
        return C.openPlayerSettings(C.doc.mode === "pause");
      case "give": {
        const [item, n] = nameAndCount(args);
        if (playerOp("add", item, n) < 0) C.log(`UI action: could not give ${n} ${item} (no Player, or the Inventory is full).`);
        return;
      }
      case "take": {
        const [item, n] = nameAndCount(args);
        if (playerOp("remove", item, n) < 0) C.log(`UI action: the Player doesn't have ${n} ${item} to take.`);
        return;
      }
      case "equip": {
        const space = args.indexOf(" ");
        const slot = space < 0 ? args : args.slice(0, space);
        const item = space < 0 ? "" : args.slice(space + 1).trim();
        if (!item || playerOp("equip", slot, 0, item) < 0) C.log(`UI action: could not equip "${item}" in ${slot} (carried? does it fit that slot?).`);
        return;
      }
      case "unequip":
        if (playerOp("unequip", args, 0) < 0) C.log(`UI action: nothing is worn in ${args}.`);
        return;
      case "select":
        if (C.playerIndex < 0 || !C.runtime._editor_select_weapon(C.playerIndex, Number(args) - 1)) C.log(`UI action: the Player has no weapon slot ${args}.`);
        return;
      case "objective": {
        const [what = "", ...rest] = args.split(/\s+/);
        const id = rest.join(" ");
        if (what === "start") startObjective(id);
        else if (what === "complete") completeObjective(id);
        else C.log(`UI action: "objective ${what}" is not an action (objective start <id>, objective complete <id>).`);
        return;
      }
      case "text": {
        const colon = args.indexOf(":");
        if (colon < 1) C.log(`UI action: "text" needs "<UI name>: <text>".`);
        else C.uiTextOverrides.set(args.slice(0, colon).trim(), args.slice(colon + 1).trim());
        return;
      }
      case "script":
        return C.uiEvent(source, args);
    }
  }
  // Runs the lines of `text` that answer `event`. `source` is the UI element or objective they belong to.
  function runActions(text: string, event: string, source: string) {
    const { actions, errors } = parseActions(text);
    for (const e of errors) C.log(`${source}: ${e}`);
    for (const a of actions) if (answers(a.event, event)) runAction(a.verb, a.args, source);
  }
  // A click on UI element `name`: its "When clicked" lines.
  function runOnClick(name: string, event: string) {
    const found = uiNamed(name);
    if (found?.ui.onClick) runActions(found.ui.onClick, event, name);
  }

  // ---- Objectives
  function startObjectives() {
    const lines: string[] = [];
    for (const entity of C.doc.scene.eachAlive()) {
      const list = C.doc.scene.resolve(entity, "Objectives")?.list;
      if (list) lines.push(list);
    }
    const { defs, errors } = parseObjectives(lines.join("\n"));
    for (const e of errors) C.log(`Objectives: ${e}`);
    C.objectives = { defs, active: "", counts: new Map(), done: new Set(), dead: new Set() };
    if (defs[0]) startObjective(defs[0].id);
  }
  function defOf(id: string): ObjectiveDef | undefined {
    return C.objectives.defs.find((d) => d.id === id);
  }
  function startObjective(id: string) {
    const def = defOf(id);
    if (!def) return C.log(`Objectives: there is no objective "${id}" (ids: ${C.objectives.defs.map((d) => d.id).join(", ") || "none"}).`);
    C.objectives.active = id;
    C.objectives.counts.set(id, 0);
    C.objectives.dead.clear();
    C.announcer.say(`Objective: ${def.title}`);
    C.uiEvent("objective", `start:${id}`);
  }
  function completeObjective(id: string) {
    const def = defOf(id);
    if (!def || C.objectives.done.has(id)) return;
    C.objectives.done.add(id);
    C.objectives.counts.set(id, 1e9);
    C.sounds().pickup(2);
    C.announcer.say(`Objective complete: ${def.title}`);
    const wasActive = C.objectives.active === id;
    if (wasActive) C.objectives.active = "";
    runActions(def.onComplete, "", `objective ${id}`);
    C.uiEvent("objective", `complete:${id}`);
    // The next line starts, unless an action already started another.
    if (wasActive && C.objectives.active === "") {
      const next = C.objectives.defs.find((d) => !C.objectives.done.has(d.id));
      if (next) startObjective(next.id);
    }
  }
  // objective.start / complete / progress from a script ("start|id", "complete|id", "progress|id|n").
  function objectiveCommand(text: string) {
    const [what = "", id = "", n = ""] = text.split("|");
    if (what === "start") startObjective(id);
    else if (what === "complete") completeObjective(id);
    else if (what === "progress") {
      const def = defOf(id);
      if (!def) return C.log(`Objectives: there is no objective "${id}".`);
      C.objectives.counts.set(id, Math.max(0, Number(n) || 0));
      if (goalFraction(def.goal, Number(n) || 0) >= 1) completeObjective(id);
    } else C.log(`Objectives: unknown command "${what}".`);
  }
  // An event the goals watch for: "interact" on something the Player opened or picked up.
  function objectiveEvent(kind: "interact", name: string) {
    const def = defOf(C.objectives.active);
    if (def?.goal.kind === kind && def.goal.target.toLowerCase() === name.toLowerCase()) completeObjective(def.id);
  }
  function entityNamed(name: string): number {
    const target = name.toLowerCase();
    return C.doc.scene.eachAlive().findIndex((e) => (C.doc.scene.resolve(e, "Name")?.value ?? "").toLowerCase() === target);
  }
  function itemCount(item: string): number {
    if (C.playerIndex < 0) return 0;
    const text = C.runtime.ccall("editor_items_text", "string", ["number"], [C.playerIndex]) as string;
    for (const line of text.split("\n")) {
      const space = line.lastIndexOf(" ");
      if (space > 0 && line.slice(0, space) === item) return Number(line.slice(space + 1)) || 0;
    }
    return 0;
  }
  function updateObjectives() {
    const def = defOf(C.objectives.active);
    if (!def || C.doc.mode !== "play") return;
    const goal = def.goal;
    let count = C.objectives.counts.get(def.id) ?? 0;
    if (goal.kind === "collect") count = itemCount(goal.target);
    else if (goal.kind === "reach") {
      const i = entityNamed(goal.target);
      const me = C.playerIndex >= 0 ? C.objects[C.playerIndex] : undefined;
      const there = i >= 0 ? C.objects[i] : undefined;
      count = me && there && me.position.distanceTo(there.position) <= goal.radius ? 1 : 0;
    } else if (goal.kind === "kill") {
      // Defeated entities with Health (the Player excluded), counted once each.
      C.doc.scene.eachAlive().forEach((entity, i) => {
        if (i === C.playerIndex || C.objectives.dead.has(i) || C.runtime._editor_alive(i)) return;
        if (!C.doc.scene.effectiveHas(entity, "Health")) return;
        C.objectives.dead.add(i);
        const name = C.doc.scene.resolve(entity, "Name")?.value ?? "";
        if (goal.target === "any" || name.toLowerCase().startsWith(goal.target.toLowerCase())) count++;
      });
    }
    if (goal.kind !== "script") C.objectives.counts.set(def.id, count);
    if (goal.kind !== "interact" && goal.kind !== "script" && goalFraction(goal, count) >= 1) completeObjective(def.id);
  }
  // The Objective widget's text and progress while objectives run: [text, value] or undefined.
  function objectiveReadout(): [string, number] | undefined {
    const def = defOf(C.objectives.active);
    if (!def) return C.objectives.defs.length && C.objectives.done.size === C.objectives.defs.length ? ["All objectives complete", 1] : undefined;
    const count = C.objectives.counts.get(def.id) ?? 0;
    const g = def.goal;
    const progress = g.kind === "kill" || g.kind === "collect" ? ` (${Math.min(count, g.count)}/${g.count})` : "";
    return [`${def.title}${progress}\n${def.detail}`, goalFraction(g, count)];
  }

  Object.assign(C, { setUIOpen, toggleUI, toggleKeyPressed, runActions, runOnClick, startObjectives, startObjective, completeObjective, objectiveCommand, objectiveEvent, updateObjectives, objectiveReadout });
}
