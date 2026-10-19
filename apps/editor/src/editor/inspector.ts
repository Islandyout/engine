// The inspector (out of main.ts): the selected entity's name and
// parent, its prefab status, a card per component with fields generated
// from the component's shape (help, validation, and form editors where the
// field is text underneath), and the grouped "Add component" list.
import type { EditorDocument } from "./Document";
import type { EntityRef } from "../scene/Components";
import type { SceneComponents } from "../scene/Scene";
import { defaultComponent } from "../authoring/CommandInterpreter";
import { componentDescription, componentGroups, componentLabel, componentRequires, propertyMetadata } from "./PropertyMetadata";
import { iconEl, textSpan } from "./dom";
import { fuzzyScore } from "./fuzzy";
import { cardOpen, loadOpenState, saveOpenState, setAll, type OpenState } from "./inspectorState";
import { routineStopsEditor } from "./inspectorWidgets";
import { searchBox } from "./searchBox";
import { openScriptApiPanel } from "./scriptApiPanel";
import { uiEvents, uiScriptStub } from "./uiEvents";

export interface InspectorContext {
  doc: EditorDocument;
  execute(command: Record<string, unknown>): unknown;
  animationClipOptions(entity: EntityRef): { label: string; value: string }[];
  catalogEntry(mesh: number): { animated?: boolean } | undefined;
  inspectorIssues(entity: EntityRef, type: string): string[];
}

// Kept across re-renders (the inspector is rebuilt after every edit).
let openState: OpenState | undefined;
let filterText = "";
let filterFocused = false;

// Shows only the properties (and the cards holding them) that match the
// filter; a card whose name matches shows all of its properties. While a
// filter is set every shown card is open; clearing it restores each card's
// own open state.
function applyFilter(inspector: HTMLElement) {
  for (const card of inspector.querySelectorAll<HTMLDetailsElement>(".component-card")) {
    const type = card.dataset.type!;
    const rows = [...card.querySelectorAll<HTMLElement>(":scope > [data-prop]")];
    if (!filterText.trim()) {
      card.hidden = false;
      for (const row of rows) row.hidden = false;
      setOpen(card, cardOpen(type, openState!, card.dataset.issues === "1"));
      continue;
    }
    const titleMatch = fuzzyScore(filterText, card.dataset.label ?? type) >= 0;
    let any = titleMatch;
    for (const row of rows) {
      const match = titleMatch || fuzzyScore(filterText, row.dataset.prop!) >= 0;
      row.hidden = !match;
      any ||= match;
    }
    card.hidden = !any;
    setOpen(card, any);
  }
}

// Opens or closes a card for the inspector's own reasons (not remembered).
function setOpen(card: HTMLDetailsElement, open: boolean) {
  card.dataset.auto = String(open);
  card.open = open;
}

export function renderInspector(inspector: HTMLElement, entity: EntityRef, context: InspectorContext) {
  openState ??= loadOpenState();
  const { doc, execute, animationClipOptions, catalogEntry, inspectorIssues } = context;
  const header = document.createElement("div");
  header.className = "inspector-header";
  const name = document.createElement("input");
  name.value = doc.scene.resolve(entity, "Name")?.value ?? "Entity";
  name.setAttribute("aria-label", "Entity name");
  name.onchange = () => execute({ command: "rename_entity", entity, name: name.value });
  const nameRow = document.createElement("label");
  nameRow.className = "field-row";
  nameRow.append(textSpan("Name"), name);
  header.append(nameRow);
  const parent = document.createElement("select");
  parent.setAttribute("aria-label", "Parent");
  parent.add(new Option("No parent", ""));
  for (const ref of doc.scene.eachAlive())
    if (ref.index !== entity.index) parent.add(new Option(doc.scene.resolve(ref, "Name")?.value ?? String(ref.index), String(ref.index)));
  parent.value = String(doc.scene.resolve(entity, "Parent")?.entity.index ?? "");
  parent.onchange = () =>
    execute({
      command: "reparent_entity",
      entity,
      parent: parent.value === "" ? null : doc.scene.eachAlive().find((e) => e.index === Number(parent.value)),
    });
  const parentRow = document.createElement("label");
  parentRow.className = "field-row";
  parentRow.append(textSpan("Parent"), parent);
  header.append(parentRow);
  inspector.append(header);
  // Filter, and every card open or closed at once.
  const tools = document.createElement("div");
  tools.className = "inspector-tools";
  const filter = document.createElement("input");
  filter.type = "search";
  filter.placeholder = "Filter properties";
  filter.setAttribute("aria-label", "Filter properties");
  filter.value = filterText;
  filter.oninput = () => {
    filterText = filter.value;
    applyFilter(inspector);
  };
  filter.onfocus = () => (filterFocused = true);
  filter.onblur = () => (filterFocused = false);
  const allCards = (open: boolean) => {
    const types = [...inspector.querySelectorAll<HTMLElement>(".component-card")].map((card) => card.dataset.type!);
    openState = setAll(openState!, types, open);
    saveOpenState(openState);
    filterText = filter.value = "";
    applyFilter(inspector);
  };
  const expand = document.createElement("button");
  expand.className = "btn btn-sm btn-ghost";
  expand.textContent = "Expand all";
  expand.onclick = () => allCards(true);
  const collapse = document.createElement("button");
  collapse.className = "btn btn-sm btn-ghost";
  collapse.textContent = "Collapse all";
  collapse.onclick = () => allCards(false);
  tools.append(filter, expand, collapse);
  inspector.append(tools);
  const prefabInstance = doc.scene.resolve(entity, "PrefabInstance");
  if (prefabInstance) {
    const banner = document.createElement("div");
    banner.className = "prefab-banner";
    banner.append(textSpan(`Instance of prefab "${prefabInstance.prefab}" — editing a shared component updates every instance.`));
    const unlink = document.createElement("button");
    unlink.className = "btn btn-sm btn-ghost";
    unlink.textContent = "Unlink from prefab";
    unlink.onclick = () => execute({ command: "unlink_instance", entity });
    banner.append(unlink);
    inspector.append(banner);
  } else {
    const makePrefab = document.createElement("button");
    makePrefab.className = "btn btn-sm btn-ghost";
    makePrefab.textContent = "Make prefab…";
    makePrefab.onclick = () => {
      const name = prompt("Prefab name (used to place further instances):");
      if (name) execute({ command: "create_prefab", entity, name });
    };
    inspector.append(makePrefab);
  }
  // Cards go in groups (the same ones as the Add component list), each under its own heading.
  const groupOf = (type: string) => componentGroups.findIndex((g) => g.types.includes(type));
  const ordered = [...doc.scene.effectiveComponentNames(entity)]
    .filter((type) => type !== "Parent" && type !== "Name" && type !== "PrefabInstance")
    .map((type, position) => ({ type, position, group: groupOf(type) }))
    .sort((a, b) => (a.group < 0 ? 99 : a.group) - (b.group < 0 ? 99 : b.group) || a.position - b.position);
  let lastGroup = -2;
  for (const { type, group } of ordered) {
    if (group !== lastGroup) {
      lastGroup = group;
      const heading = document.createElement("h3");
      heading.className = "component-group";
      heading.textContent = group >= 0 ? componentGroups[group]!.label : "Other";
      inspector.append(heading);
    }
    const section = document.createElement("details");
    section.className = "component-card";
    section.dataset.type = type;
    section.dataset.label = componentLabel(type);
    const issues = inspectorIssues(entity, type);
    section.dataset.issues = issues.length ? "1" : "0";
    setOpen(section, cardOpen(type, openState, issues.length > 0));
    // Opening or closing a card by hand is remembered for that component
    // type. The browser fires "toggle" for the inspector's own opening too
    // (defaults, problems, filter matches); those land on data-auto.
    section.ontoggle = () => {
      if (String(section.open) === section.dataset.auto) return;
      section.dataset.auto = String(section.open);
      openState = { ...openState, [type]: section.open };
      saveOpenState(openState);
    };
    const legend = document.createElement("summary");
    legend.append(iconEl("cube", "icon-component"), textSpan(componentLabel(type), "component-title"));
    section.append(legend);
    // What the component is for, and anything wrong with it.
    const about = componentDescription(type);
    if (about) {
      legend.title = about;
      section.append(textSpan(about, "component-help"));
    }
    for (const issue of issues) section.append(textSpan(`⚠ ${issue}`, "component-issue"));
    const requires = componentRequires[type];
    const missing = requires ? requires.needs.filter((need) => !doc.scene.effectiveHas(entity, need as keyof SceneComponents)) : [];
    if (requires && missing.length) {
      const hint = document.createElement("div");
      hint.className = "component-requires";
      hint.append(textSpan(`Needs ${missing.join(" and ")}: ${requires.why}.`));
      const addMissing = document.createElement("button");
      addMissing.className = "btn btn-sm";
      addMissing.textContent = `Add ${missing.join(" and ")}`;
      addMissing.onclick = () => {
        for (const need of missing) execute({ command: "attach_component", entity, type: need });
      };
      hint.append(addMissing);
      section.append(hint);
    }
    // Generate fields from the component's serializable property shape; validation stays in authoring.
    const value = structuredClone(doc.scene.resolve(entity, type)) as unknown as Record<string, unknown>;
    function fields(record: Record<string, unknown>, host: HTMLElement, prefix = "") {
      for (const [key, v] of Object.entries(record)) {
        if (v && typeof v === "object") {
          fields(v as Record<string, unknown>, host, prefix + key + ".");
          continue;
        }
        const label = document.createElement("label");
        const meta = propertyMetadata(type, prefix + key);
        label.textContent = meta.label ?? prefix + key;
        label.dataset.prop = label.textContent;
        if (meta.help) label.title = meta.help;
        // Routine stops as a table instead of "hour x z; ..." text.
        if (type === "Routine" && prefix === "" && key === "stops") {
          host.append(
            routineStopsEditor(
              String(v),
              (text) => {
                record[key] = text;
                execute({ command: "set_component", entity, type, value });
              },
              meta.help,
            ),
          );
          continue;
        }
        const dynamicOptions = type === "AnimationState" && prefix === "" && key === "clip" ? animationClipOptions(entity!) : undefined;
        const options = meta.options ?? dynamicOptions;
        if (options) {
          const choice = document.createElement("select");
          choice.setAttribute("aria-label", `${type}.${prefix}${key}`);
          for (const option of options) choice.add(new Option(option.label, String(option.value)));
          // A model with no clips loaded yet (still fetching, or not an
          // animated catalog entry at all) offers only "(Automatic)" --
          // disable rather than let a choice silently fail to apply.
          choice.disabled = dynamicOptions !== undefined && dynamicOptions.length === 1;
          choice.value = String(v);
          choice.onchange = () => {
            record[key] = typeof v === "number" ? Number(choice.value) : choice.value;
            execute({ command: "set_component", entity, type, value });
          };
          label.append(choice);
          host.append(label);
          continue;
        }
        if (meta.multiline) {
          label.className = "field-row-multiline";
          const textarea = document.createElement("textarea");
          textarea.setAttribute("aria-label", `${type}.${prefix}${key}`);
          textarea.className = "field-multiline";
          textarea.readOnly = meta.readOnly ?? false;
          textarea.value = String(v);
          textarea.onchange = () => {
            record[key] = textarea.value;
            execute({ command: "set_component", entity, type, value });
          };
          label.append(textarea);
          host.append(label);
          continue;
        }
        const input = document.createElement("input");
        input.setAttribute("aria-label", `${type}.${prefix}${key}`);
        input.type = typeof v === "number" ? "number" : typeof v === "boolean" ? "checkbox" : "text";
        input.step = meta.step ?? "any";
        input.readOnly = meta.readOnly ?? false;
        input.value = String(v);
        input.checked = v === true;
        input.onchange = () => {
          record[key] = typeof v === "number" ? Number(input.value) : typeof v === "boolean" ? input.checked : input.value;
          execute({ command: "set_component", entity, type, value });
        };
        label.append(input);
        host.append(label);
      }
    }
    fields(value, section);
    // Scripts get the API reference.
    if (type === "Script") {
      const api = document.createElement("button");
      api.className = "btn btn-sm btn-ghost";
      api.textContent = "API reference";
      api.title = "Every callback, built-in function and helper a script can use";
      api.onclick = (event) => {
        event.preventDefault();
        openScriptApiPanel(document.body);
      };
      section.append(api);
    }
    // A UI element's wiring: what it can tell the game, and a button that writes the script for it.
    if (type === "UI") {
      const ui = value as { kind: "Text"; widget: "Health" };
      const { events } = uiEvents(ui);
      const help = document.createElement("p");
      help.className = "component-requires";
      help.textContent = events.length
        ? `Events you can answer in "When clicked": ${events.join(", ")}. Actions: show, hide, toggle, give, take, equip, unequip, select, objective start|complete, text, script, pause, resume, restart, quit, settings.`
        : `"When clicked" runs on clicks. Actions: show, hide, toggle, give, take, equip, unequip, select, objective start|complete, text, script.`;
      section.append(help);
      const stub = document.createElement("button");
      stub.className = "btn btn-sm btn-ghost";
      stub.textContent = "Add script hook";
      stub.title = "Adds a Script to this element with an on_ui function that answers it";
      stub.onclick = (event) => {
        event.preventDefault();
        const name = doc.scene.resolve(entity, "Name")?.value || "UI";
        const source = uiScriptStub(name, ui);
        const existing = doc.scene.resolve(entity, "Script");
        if (existing) execute({ command: "set_component", entity, type: "Script", value: { ...existing, source: `${existing.source}\n${source}` } });
        else {
          execute({ command: "attach_component", entity, type: "Script" });
          execute({ command: "set_component", entity, type: "Script", value: { source, props: {} } });
        }
      };
      section.append(stub);
    }
    // The common path for playing a clip: right in the Renderable card,
    // next to the Model it belongs to, no separate "Add component ->
    // Animation (advanced)" detour needed -- that card (AnimationState)
    // still exists below when it's attached, for time/looping.
    if (type === "Renderable" && catalogEntry((value as { mesh: number }).mesh)?.animated) {
      const clipOptions = animationClipOptions(entity);
      const clipLabel = document.createElement("label");
      clipLabel.textContent = "Animation clip";
      clipLabel.dataset.prop = "Animation clip";
      const clipSelect = document.createElement("select");
      clipSelect.setAttribute("aria-label", "Renderable.animationClip");
      for (const option of clipOptions) clipSelect.add(new Option(option.label, String(option.value)));
      clipSelect.disabled = clipOptions.length === 1;
      clipSelect.value = doc.scene.resolve(entity, "AnimationState")?.clip ?? "";
      clipSelect.onchange = () => {
        const current = doc.scene.resolve(entity, "AnimationState") ?? {
          clip: "",
          time: 0,
          looping: true,
        };
        execute({
          command: "set_component",
          entity,
          type: "AnimationState",
          value: { ...current, clip: clipSelect.value },
        });
      };
      clipLabel.append(clipSelect);
      section.append(clipLabel);
    }
    const reset = document.createElement("button");
    reset.textContent = "Reset " + type;
    reset.onclick = () =>
      execute({
        command: "set_component",
        entity,
        type,
        value: defaultComponent(type),
      });
    section.append(reset);
    const remove = document.createElement("button");
    remove.className = "btn btn-sm btn-ghost btn-danger-hover";
    remove.append(iconEl("trash"), textSpan("Remove " + type));
    remove.onclick = () => {
      const dependents = Object.entries(componentRequires)
        .filter(([other, r]) => r.needs.includes(type) && doc.scene.effectiveHas(entity, other as keyof SceneComponents))
        .map(([other]) => other);
      if (dependents.length && !window.confirm(`${dependents.join(", ")} on this entity need${dependents.length === 1 ? "s" : ""} ${type}. Remove it anyway?`)) return;
      execute({ command: "remove_component", entity, type });
    };
    section.append(remove);
    inspector.append(section);
  }
  const add = document.createElement("select");
  add.setAttribute("aria-label", "Add component");
  add.add(new Option("Add component…", ""));
  // Grouped by componentGroups (PropertyMetadata.ts) so components that
  // only make sense together (AIState/Pedestrian, Player/Vehicle,
  // Renderable/AnimationState, the movement-and-collision chain) stay next
  // to each other instead of one flat, alphabetical-ish list of 16.
  for (const group of componentGroups) {
    const available = group.types.filter((type) => !doc.scene.effectiveHas(entity, type as keyof SceneComponents));
    if (available.length === 0) continue;
    const optgroup = document.createElement("optgroup");
    optgroup.label = group.label;
    for (const type of available) optgroup.append(new Option(componentLabel(type), type));
    add.add(optgroup);
  }
  // A component just added opens, whatever its type's remembered state.
  const attach = (type: string) => {
    openState = { ...openState!, [type]: true };
    saveOpenState(openState);
    execute({ command: "attach_component", entity, type });
  };
  add.onchange = () => {
    if (add.value) attach(add.value);
  };
  // Or search for one by name (or by its group: "physics", "audio"...).
  const findComponent = searchBox({
    placeholder: "Find a component to add",
    label: "Find a component",
    items: () =>
      componentGroups.flatMap((group) =>
        group.types
          .filter((type) => !doc.scene.effectiveHas(entity, type as keyof SceneComponents))
          .map((type) => ({ label: componentLabel(type), detail: group.label, keywords: [type, group.label], type })),
      ),
    pick: (item) => attach(item.type),
  });
  findComponent.classList.add("inspector-add-search");
  inspector.append(findComponent, add);
  for (const input of inspector.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>("input,select,button"))
    input.disabled = doc.mode !== "edit";
  // The filter and the expand/collapse buttons work in play too (they
  // change nothing in the scene).
  filter.disabled = expand.disabled = collapse.disabled = false;
  applyFilter(inspector);
  if (filterFocused) filter.focus();
  // Arrow keys move between card headers; Home and End jump to the ends.
  inspector.onkeydown = (event) => {
    const target = event.target as HTMLElement;
    if (target.tagName !== "SUMMARY" || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const heads = [...inspector.querySelectorAll<HTMLElement>(".component-card:not([hidden]) > summary")];
    const at = heads.indexOf(target);
    const next = event.key === "Home" ? 0 : event.key === "End" ? heads.length - 1 : at + (event.key === "ArrowDown" ? 1 : -1);
    if (next < 0 || next >= heads.length) return;
    event.preventDefault();
    heads[next]!.focus();
  };
}
