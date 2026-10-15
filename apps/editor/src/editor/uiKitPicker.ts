// The UI templates picker (Project > UI templates): the UI kit's widgets
// by group, each previewed in all six styles; a click adds that widget in
// that style, and "Whole group" adds every widget of the group in one
// style. Previews are painted once with sample data, not animated.
import type { UIStyle, UIWidget } from "../scene/Components";
import { drawWidget, sampleUIData, uiStyleNames, widgetCatalog, widgetGroups, type WidgetGroup } from "./uiKit";

const previewWidth = 200;
const previewHeight = 120;

// One widget in one style, scaled to fit a preview card over a dusky
// stand-in for a game scene.
export function paintPreview(canvas: HTMLCanvasElement, widget: UIWidget, style: UIStyle) {
  const info = widgetCatalog.find((w) => w.name === widget)!;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = previewWidth * ratio;
  canvas.height = previewHeight * ratio;
  canvas.style.width = `${previewWidth}px`;
  canvas.style.height = `${previewHeight}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(ratio, ratio);
  const sky = ctx.createLinearGradient(0, 0, 0, previewHeight);
  sky.addColorStop(0, "#5b7a99");
  sky.addColorStop(0.55, "#9aa58f");
  sky.addColorStop(0.56, "#4d5a3f");
  sky.addColorStop(1, "#2c3424");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, previewWidth, previewHeight);
  // Full-screen widgets (menus) see the card as the screen; the rest are
  // drawn at their own size, shrunk to fit.
  const screen = info.name === "Main menu" || info.name === "Pause menu";
  const width = screen ? 960 : info.width;
  const height = screen ? 600 : info.height;
  const fit = Math.min((previewWidth - 16) / width, (previewHeight - 16) / height, 1);
  ctx.translate((previewWidth - width * fit) / 2, (previewHeight - height * fit) / 2);
  ctx.scale(fit, fit);
  const data = sampleUIData(1.1, width, height);
  const rect = screen
    ? { left: 60, top: (height - info.height) / 2, width: info.width, height: info.height }
    : { left: 0, top: 0, width: info.width, height: info.height };
  drawWidget(ctx, { widget, style, text: info.text, value: info.value, fontSize: 16, textAge: 1, preview: true }, rect, data);
}

export function openUIKitPicker(host: HTMLElement, add: (widgets: UIWidget[], style: UIStyle) => void) {
  host.querySelector(".ui-kit-picker")?.remove();
  const panel = document.createElement("div");
  panel.className = "ui-kit-picker script-api";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "UI templates");
  const top = document.createElement("div");
  top.className = "script-api-top";
  const title = document.createElement("strong");
  title.textContent = "UI templates";
  title.style.flex = "1";
  const close = document.createElement("button");
  close.className = "btn btn-sm btn-ghost";
  close.textContent = "Close";
  close.onclick = () => panel.remove();
  top.append(title, close);
  const tabs = document.createElement("div");
  tabs.className = "ui-kit-tabs";
  tabs.setAttribute("role", "tablist");
  const list = document.createElement("div");
  list.className = "script-api-list";
  const show = (group: WidgetGroup) => {
    for (const tab of tabs.children) tab.setAttribute("aria-selected", String((tab as HTMLElement).dataset.group === group));
    const widgets = widgetCatalog.filter((w) => w.group === group);
    const whole = document.createElement("div");
    whole.className = "ui-kit-whole";
    const label = document.createElement("span");
    label.textContent = "Whole group:";
    whole.append(label);
    for (const style of uiStyleNames) {
      const button = document.createElement("button");
      button.className = "btn btn-sm";
      button.textContent = style;
      button.setAttribute("aria-label", `Add all of ${group} in ${style}`);
      button.onclick = () => add(widgets.map((w) => w.name), style);
      whole.append(button);
    }
    const cards = widgets.map((info) => {
      const card = document.createElement("section");
      card.className = "ui-kit-card";
      const name = document.createElement("h4");
      name.textContent = info.name;
      const about = document.createElement("p");
      about.className = "hint";
      about.textContent = info.about;
      const row = document.createElement("div");
      row.className = "ui-kit-styles";
      for (const style of uiStyleNames) {
        const button = document.createElement("button");
        button.className = "ui-kit-style";
        button.setAttribute("aria-label", `Add ${info.name} in ${style}`);
        const canvas = document.createElement("canvas");
        paintPreview(canvas, info.name, style);
        const caption = document.createElement("span");
        caption.textContent = style;
        button.append(canvas, caption);
        button.onclick = () => add([info.name], style);
        row.append(button);
      }
      card.append(name, about, row);
      return card;
    });
    list.replaceChildren(whole, ...cards);
  };
  for (const group of widgetGroups) {
    const tab = document.createElement("button");
    tab.className = "btn btn-sm btn-ghost";
    tab.setAttribute("role", "tab");
    tab.dataset.group = group;
    tab.textContent = group;
    tab.onclick = () => show(group);
    tabs.append(tab);
  }
  panel.append(top, tabs, list);
  host.append(panel);
  show(widgetGroups[0]!);
  return panel;
}
