// The New scene picker (0.77.0): one card per template.
import { sceneTemplates, type SceneTemplate } from "./sceneTemplates";

export function openTemplatePicker(host: HTMLElement, choose: (template: SceneTemplate) => void) {
  host.querySelector(".template-picker")?.remove();
  const panel = document.createElement("div");
  panel.className = "template-picker script-api";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "New scene");
  const top = document.createElement("div");
  top.className = "script-api-top";
  const title = document.createElement("strong");
  title.textContent = "Start a new scene";
  title.style.flex = "1";
  const close = document.createElement("button");
  close.className = "btn btn-sm btn-ghost";
  close.textContent = "Cancel";
  close.onclick = () => panel.remove();
  top.append(title, close);
  const list = document.createElement("div");
  list.className = "script-api-list";
  for (const template of sceneTemplates) {
    const card = document.createElement("button");
    card.className = "script-api-entry";
    card.setAttribute("aria-label", template.name);
    const name = document.createElement("code");
    name.textContent = template.name;
    const doc = document.createElement("span");
    doc.textContent = template.description;
    card.append(name, doc);
    card.onclick = () => {
      panel.remove();
      choose(template);
    };
    list.append(card);
  }
  panel.append(top, list);
  host.append(panel);
  return panel;
}
