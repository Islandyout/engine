// The Script API reference (0.77.0): a searchable list of every callback,
// built-in function and named helper, opened from the Script card. Clicking
// an entry copies its signature into the clipboard for pasting.
import { scriptApi } from "./scriptApi";

export function filterScriptApi(query: string) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return scriptApi.filter((e) => words.every((w) => `${e.signature} ${e.doc}`.toLowerCase().includes(w)));
}

export function openScriptApiPanel(host: HTMLElement) {
  host.querySelector(".script-api")?.remove();
  const panel = document.createElement("div");
  panel.className = "script-api";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Script API");
  const top = document.createElement("div");
  top.className = "script-api-top";
  const search = document.createElement("input");
  search.placeholder = "Search the Script API (e.g. sound, waypoint, on_)";
  search.setAttribute("aria-label", "Search the Script API");
  const close = document.createElement("button");
  close.className = "btn btn-sm btn-ghost";
  close.textContent = "Close";
  close.onclick = () => panel.remove();
  top.append(search, close);
  const list = document.createElement("div");
  list.className = "script-api-list";
  const render = () => {
    list.replaceChildren();
    let group = "";
    for (const entry of filterScriptApi(search.value)) {
      if (entry.group !== group) {
        group = entry.group;
        const h = document.createElement("h4");
        h.textContent = group;
        list.append(h);
      }
      const row = document.createElement("button");
      row.className = "script-api-entry";
      row.title = "Copy the signature";
      const code = document.createElement("code");
      code.textContent = entry.signature;
      const doc = document.createElement("span");
      doc.textContent = entry.doc;
      row.append(code, doc);
      row.onclick = () => void navigator.clipboard?.writeText(entry.signature).catch(() => undefined);
      list.append(row);
    }
  };
  search.oninput = render;
  panel.append(top, list);
  render();
  host.append(panel);
  search.focus();
  return panel;
}
