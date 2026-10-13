// A search box with a ranked suggestion list (fuzzy, keyboard first):
// typing filters, Up/Down move through the matches, Enter picks the
// highlighted one, Escape clears. Used for the console's commands; the
// model catalog, Add component and the Games library filter their own
// lists with the same matcher (fuzzy.ts).
import { fuzzyRank } from "./fuzzy";

export interface SearchItem {
  label: string;
  detail?: string;
  keywords?: string[];
}

export function searchBox<T extends SearchItem>(options: {
  placeholder: string;
  label: string;
  items: () => readonly T[];
  pick: (item: T) => void;
  max?: number;
}): HTMLDivElement {
  const box = document.createElement("div");
  box.className = "search-suggest";
  const input = document.createElement("input");
  input.type = "search";
  input.placeholder = options.placeholder;
  input.setAttribute("aria-label", options.label);
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");
  const list = document.createElement("ul");
  list.className = "search-suggest-list";
  list.setAttribute("role", "listbox");
  list.hidden = true;
  box.append(input, list);
  let matches: T[] = [];
  let active = 0;
  const render = () => {
    list.replaceChildren(
      ...matches.map((item, i) => {
        const li = document.createElement("li");
        li.setAttribute("role", "option");
        li.setAttribute("aria-selected", String(i === active));
        const name = document.createElement("span");
        name.textContent = item.label;
        li.append(name);
        if (item.detail) {
          const detail = document.createElement("span");
          detail.className = "search-suggest-detail";
          detail.textContent = item.detail;
          li.append(detail);
        }
        // pointerdown, not click: the input's blur would close the list first.
        li.onpointerdown = (event) => {
          event.preventDefault();
          choose(i);
        };
        return li;
      }),
    );
    list.hidden = matches.length === 0;
    input.setAttribute("aria-expanded", String(!list.hidden));
  };
  const refresh = () => {
    matches = input.value.trim()
      ? fuzzyRank(options.items(), input.value, (item) => [item.label, ...(item.keywords ?? [])]).slice(0, options.max ?? 8)
      : [];
    active = 0;
    render();
  };
  const choose = (i: number) => {
    const item = matches[i];
    if (!item) return;
    input.value = "";
    matches = [];
    render();
    options.pick(item);
  };
  input.oninput = refresh;
  input.onkeydown = (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!matches.length) return;
      event.preventDefault();
      active = (active + (event.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length;
      render();
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(active);
    } else if (event.key === "Escape") {
      input.value = "";
      refresh();
    }
  };
  input.onblur = () => {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
  };
  input.onfocus = refresh;
  return box;
}
