// The Recipes dialog (Hierarchy > Recipes): pick a kind of thing, tick whether to add its HUD widgets too.
import type { UIStyle } from "../scene/Components";
import { recipes, type Recipe } from "./recipes";
import { uiStyleNames } from "./uiKit";

export function openRecipePicker(host: HTMLElement, add: (recipe: Recipe, withHud: boolean, style: UIStyle) => void) {
  host.querySelector(".recipe-picker")?.remove();
  const panel = document.createElement("div");
  panel.className = "recipe-picker script-api";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Recipes");
  const top = document.createElement("div");
  top.className = "script-api-top";
  const title = document.createElement("strong");
  title.textContent = "Recipes";
  title.style.flex = "1";
  const close = document.createElement("button");
  close.className = "btn btn-sm btn-ghost";
  close.textContent = "Close";
  close.onclick = () => panel.remove();
  top.append(title, close);
  const options = document.createElement("div");
  options.className = "recipe-options";
  const hudLabel = document.createElement("label");
  const hud = document.createElement("input");
  hud.type = "checkbox";
  hud.checked = true;
  hud.setAttribute("aria-label", "Also add HUD widgets");
  hudLabel.append(hud, " Also add the HUD widgets that go with it (they appear in the Hierarchy; edit or delete them any time)");
  const style = new Select(uiStyleNames);
  style.element.setAttribute("aria-label", "HUD style");
  options.append(hudLabel, style.element);
  const list = document.createElement("div");
  list.className = "script-api-list";
  for (const recipe of recipes) {
    const row = document.createElement("div");
    row.className = "recipe-row";
    const text = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = recipe.name;
    const about = document.createElement("div");
    about.className = "hint";
    about.textContent = `${recipe.about}${recipe.hud.length ? ` HUD: ${recipe.hud.join(", ")}.` : ""}`;
    text.append(name, about);
    const button = document.createElement("button");
    button.className = "btn btn-sm";
    button.textContent = "Add";
    button.setAttribute("aria-label", `Add ${recipe.name}`);
    button.onclick = () => add(recipe, hud.checked, style.value as UIStyle);
    row.append(text, button);
    list.append(row);
  }
  panel.append(top, options, list);
  host.append(panel);
}

class Select {
  readonly element = document.createElement("select");
  constructor(values: readonly string[]) {
    for (const v of values) this.element.append(new Option(v, v));
  }
  get value() {
    return this.element.value;
  }
}
