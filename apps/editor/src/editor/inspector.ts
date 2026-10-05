// The inspector (0.77.0, out of main.ts): the selected entity's name and
// parent, its prefab status, a card per component with fields generated
// from the component's shape (help, validation, and form editors where the
// field is text underneath), and the grouped "Add component" list.
import type { EditorDocument } from "./Document";
import type { EntityRef } from "../scene/Components";
import type { SceneComponents } from "../scene/Scene";
import { defaultComponent } from "../authoring/CommandInterpreter";
import { componentDescription, componentGroups, componentLabel, propertyMetadata } from "./PropertyMetadata";
import { iconEl, textSpan } from "./dom";
import { routineStopsEditor } from "./inspectorWidgets";
import { openScriptApiPanel } from "./scriptApiPanel";

export interface InspectorContext {
  doc: EditorDocument;
  execute(command: Record<string, unknown>): unknown;
  animationClipOptions(entity: EntityRef): { label: string; value: string }[];
  catalogEntry(mesh: number): { animated?: boolean } | undefined;
  inspectorIssues(entity: EntityRef, type: string): string[];
}

export function renderInspector(inspector: HTMLElement, entity: EntityRef, context: InspectorContext) {
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
  for (const type of doc.scene.effectiveComponentNames(entity)) {
    if (type === "Parent" || type === "Name" || type === "PrefabInstance") continue;
    const section = document.createElement("details");
    section.className = "component-card";
    section.open = true;
    const legend = document.createElement("summary");
    legend.append(iconEl("cube", "icon-component"), textSpan(componentLabel(type), "component-title"));
    section.append(legend);
    // What the component is for (0.77.0), and anything wrong with it.
    const about = componentDescription(type);
    if (about) {
      legend.title = about;
      section.append(textSpan(about, "component-help"));
    }
    for (const issue of inspectorIssues(entity, type)) section.append(textSpan(`⚠ ${issue}`, "component-issue"));
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
        if (meta.help) label.title = meta.help;
        // Routine stops as a table (0.77.0) instead of "hour x z; ..." text.
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
    // Scripts get the API reference (0.77.0).
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
    // The common path for playing a clip: right in the Renderable card,
    // next to the Model it belongs to, no separate "Add component ->
    // Animation (advanced)" detour needed -- that card (AnimationState)
    // still exists below when it's attached, for time/looping.
    if (type === "Renderable" && catalogEntry((value as { mesh: number }).mesh)?.animated) {
      const clipOptions = animationClipOptions(entity);
      const clipLabel = document.createElement("label");
      clipLabel.textContent = "Animation clip";
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
    remove.onclick = () => execute({ command: "remove_component", entity, type });
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
  add.onchange = () => {
    if (add.value) execute({ command: "attach_component", entity, type: add.value });
  };
  inspector.append(add);
  for (const input of inspector.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>("input,select,button"))
    input.disabled = doc.mode !== "edit";
}
