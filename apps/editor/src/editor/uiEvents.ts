import type { UIComponent } from "../scene/Components";

// What a UI element tells the game when it is used: the event names its "When clicked" lines
// can answer (`play -> hide Main menu`) and the value a script's on_ui(name, value) receives.
export function uiEvents(ui: Pick<UIComponent, "kind" | "widget">): { events: string[]; toScript: string[] } {
  switch (ui.kind) {
    case "Button":
      return { events: ["click"], toScript: ['"click" (when Button action is script)'] };
    case "Toggle":
    case "Slider":
      return { events: [], toScript: ['the new value "0".."1"'] };
    case "Widget":
      switch (ui.widget) {
        case "Main menu":
          return { events: ["play"], toScript: ['"play"'] };
        case "Pause menu":
          return { events: ["resume", "restart", "quit", "settings"], toScript: [] };
        case "Dialogue":
          return { events: ["choice:1", "choice:2", "next"], toScript: ['"choice:N" (from 0)', '"next"'] };
        case "Hotbar":
        case "Weapon wheel":
          return { events: ["slot:0", "slot:1", "..."], toScript: [] };
        case "Inventory":
          return { events: ["slot:0", "equip:<slot>:<item>", "unequip:<slot>"], toScript: [] };
        default:
          return { events: [], toScript: [] };
      }
    default:
      return { events: [], toScript: [] };
  }
}

// A starter script that answers this element, ready to paste into a Script component.
export function uiScriptStub(name: string, ui: Pick<UIComponent, "kind" | "widget">): string {
  const { toScript } = uiEvents(ui);
  const quoted = JSON.stringify(name);
  const lines = [
    `-- ${name} (${ui.kind === "Widget" ? ui.widget : ui.kind}) talks to scripts through on_ui(name, value).`,
    toScript.length ? `-- value is: ${toScript.join(" or ")}` : "-- (it sends nothing; use its 'When clicked' lines, or read the game with the world/inventory/objective APIs.)",
    "function on_ui(name, value)",
    `  if name == ${quoted} then`,
    "    -- your code here, for example:",
    `    log(name .. " -> " .. tostring(value))`,
    "  end",
    "end",
    "",
  ];
  return lines.join("\n");
}
