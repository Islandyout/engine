// Older scenes relied on HUD the editor drew by itself (gun crosshair/ammo/health, fighter bars,
// loot prompts, floating health bars, hints, car and flight instruments). Nothing is drawn
// implicitly any more: every HUD element is a UI widget entity. This adds, once, the widgets an old
// scene was getting, as ordinary visible entities you can restyle or delete, and says what it added.
import { widgetInfo } from "../editor/uiKit";
import type { UIWidget } from "./Components";
import type { SceneDocument } from "./SceneSerializer";

type Entity = SceneDocument["entities"][number];

export function migrateHud(document: SceneDocument): { document: SceneDocument; added: string[] } {
  if (document.hud === "widgets") return { document, added: [] };
  const entities = document.entities;
  const has = (e: Entity, type: string) => (e.components as Record<string, unknown>)[type] !== undefined;
  const existing = new Set<string>();
  let style = "Modern";
  for (const e of entities) {
    const ui = (e.components as Record<string, Record<string, unknown> | undefined>).UI;
    if (ui && ui.kind === "Widget") {
      if (!existing.size && typeof ui.style === "string") style = ui.style;
      existing.add(String(ui.widget ?? "Health"));
    }
  }
  const players = entities.filter((e) => has(e, "Player"));
  const others = entities.filter((e) => !has(e, "Player"));
  const want: UIWidget[] = [];
  const add = (w: UIWidget) => { if (!want.includes(w)) want.push(w); };
  const loadout = (e: Entity) => String(((e.components as Record<string, Record<string, unknown> | undefined>).Weapons?.loadout) ?? "");
  for (const p of players) {
    const fighter = has(p, "Melee") || /\bmelee=/.test(loadout(p));
    if (fighter) {
      add("Fighter bars");
      if (has(p, "Weapons")) add("Hotbar");
    } else if (has(p, "Weapons")) {
      add("Crosshair");
      add("Ammo");
      if (has(p, "Health")) add("Health");
    }
    if (has(p, "Weapons") || (p.components as Record<string, Record<string, unknown> | undefined>).CharacterController?.mode === "FirstPerson") add("Hint");
    if (has(p, "Vehicle")) add("Vehicle instruments");
  }
  if (players.length && entities.some((e) => has(e, "Pickup") || has(e, "Container"))) {
    add("Interact prompt");
    add("Pickup feed");
    add("Loot card");
  }
  if (players.length && others.some((e) => has(e, "Health"))) add("World health bar");
  if (entities.some((e) => has(e, "Spaceship"))) add("Flight instruments");
  const added: string[] = [];
  const out = entities.slice();
  for (const widget of want) {
    if (existing.has(widget)) continue;
    const kit = widgetInfo(widget);
    out.push({
      name: `HUD ${widget}`,
      components: {
        UI: {
          kind: "Widget", text: kit.text, anchor: kit.anchor, visibleWhen: kit.visibleWhen, action: "script",
          offsetX: kit.offsetX, offsetY: kit.offsetY, width: 0, height: 0, fontSize: 16,
          color: { x: 0.118, y: 0.165, z: 0.22 }, opacity: 0.85, image: "", value: kit.value,
          widget, style, source: "",
        },
      },
    } as unknown as Entity);
    added.push(widget);
  }
  return { document: { ...document, hud: "widgets", entities: out }, added };
}
