// Recipes: one click adds the right bundle of components for a kind of thing (a player, an enemy,
// a car...), and, if you want, the HUD widgets that go with it as ordinary entities in the
// Hierarchy. Nothing here is hidden: every component and widget can be edited or deleted after.
import { defaultComponent } from "../authoring/CommandInterpreter";
import type { UIStyle, UIWidget } from "../scene/Components";
import type { SceneComponents } from "../scene/Scene";
import { widgetInfo } from "./uiKit";

export interface Recipe {
  id: string;
  name: string;
  about: string;
  y: number;
  components: Partial<Record<keyof SceneComponents, Record<string, unknown>>>;
  hud: UIWidget[];
}

const body = (x: number, y: number, z: number) => ({ Scale: { value: { x, y, z } } });
const walker = (mesh: number) => ({
  ...body(0.6, 1.8, 0.6),
  Renderable: { mesh, material: 0, visible: true },
  RigidBody: { mass: 70, dynamic: true },
  Collider: { type: "AABB" },
});

export const recipes: readonly Recipe[] = [
  { id: "shooter", name: "Player: shooter", about: "A first-person player with a gun, health and a crosshair.", y: 0.9, hud: ["Crosshair", "Ammo", "Health", "Hint"],
    components: { ...walker(132), Player: {}, CharacterController: { mode: "FirstPerson" }, Health: { current: 100, maximum: 100 }, Weapons: {} } },
  { id: "adventurer", name: "Player: third person", about: "A walking, jumping third-person player with health.", y: 0.9, hud: ["Health"],
    components: { ...walker(132), Player: {}, CharacterController: { mode: "ThirdPerson" }, Health: { current: 100, maximum: 100 } } },
  { id: "fighter", name: "Player: fighter", about: "A third-person martial artist: combos, blocks, dodges and lock-on.", y: 0.9, hud: ["Fighter bars", "Health"],
    components: { ...walker(132), Player: {}, CharacterController: { mode: "ThirdPerson" }, Health: { current: 200, maximum: 200 }, Melee: { team: 0, ai: false, energy: 40 } } },
  { id: "soldier", name: "Enemy: soldier", about: "Patrols, sees, hears and shoots; drops loot when defeated.", y: 0.9, hud: ["World health bar"],
    components: { ...walker(175), Health: { current: 100, maximum: 100 }, AICombat: { team: 1, behavior: "Patrol" }, Weapons: {}, LootDrop: {} } },
  { id: "brawler", name: "Enemy: brawler", about: "A melee fighter that blocks, dodges and chains attacks.", y: 0.9, hud: ["World health bar"],
    components: { ...walker(175), Health: { current: 120, maximum: 120 }, Melee: { team: 1, ai: true, aggression: 0.5, skill: 0.4 }, LootDrop: {} } },
  { id: "car", name: "Vehicle: player car", about: "A drivable car with a speedometer and road minimap.", y: 0.65, hud: ["Vehicle instruments"],
    components: { ...body(1.8, 1.3, 4), Renderable: { mesh: 219, material: 0, visible: true }, Player: {}, Vehicle: {}, RigidBody: { mass: 1200, dynamic: true }, Collider: { type: "AABB" } } },
  { id: "parked-car", name: "Vehicle: enterable car", about: "A parked car: walk up, press E to get in and drive, E again to get out. No script.", y: 0.65, hud: ["Interact prompt"],
    components: { ...body(1.8, 1.3, 4), Renderable: { mesh: 219, material: 0, visible: true }, Vehicle: { enterable: true, enterRadius: 2 }, RigidBody: { mass: 1200, dynamic: true }, Collider: { type: "AABB" } } },
  { id: "rival", name: "Vehicle: AI car", about: "A car that drives itself: race, chase or traffic.", y: 0.65, hud: [],
    components: { ...body(1.8, 1.3, 4), Renderable: { mesh: 219, material: 0, visible: true }, Vehicle: {}, Driver: {}, RigidBody: { mass: 1200, dynamic: true }, Collider: { type: "AABB" } } },
  { id: "ship", name: "Spaceship", about: "A flyable ship (add a Star System entity for planets).", y: 2, hud: ["Flight instruments"],
    components: { ...body(6, 2, 8), Renderable: { mesh: 0, material: 0, visible: true }, Spaceship: {}, RigidBody: { mass: 12000, dynamic: true } } },
  { id: "coin", name: "Pickup: item", about: "Something to collect: a coin, a key, ammo or a weapon.", y: 0.6, hud: ["Pickup feed"],
    components: { ...body(0.5, 0.4, 0.5), Renderable: { mesh: 0, material: 0, visible: true }, Collider: { type: "AABB" }, Pickup: { kind: "Item", item: "Coin", amount: 1 } } },
  { id: "chest", name: "Loot container", about: "A crate or chest opened with a held E; spills its loot table.", y: 0.5, hud: ["Interact prompt"],
    components: { ...body(1, 0.8, 0.7), Renderable: { mesh: 0, material: 0, visible: true }, Collider: { type: "AABB" }, Container: {} } },
  // Screens: UI that is not part of the always-on HUD. They open with a key; "When clicked" and
  // objective lines wire them to the game (see the UI kit doc).
  { id: "inventory-screen", name: "Screen: Inventory", about: "Everything carried, its weight and what is worn; opens with I (click an item to wear it).", y: 0.5, hud: [],
    components: { UI: { kind: "Widget", widget: "Inventory", style: "Modern", anchor: "center", visibleWhen: "toggle", toggleKey: "KeyI", action: "none" } } },
  { id: "settings-screen", name: "Screen: Settings", about: "Volume, look sensitivity and accessibility; opens with O.", y: 0.5, hud: [],
    components: { UI: { kind: "Widget", widget: "Settings", style: "Modern", anchor: "center", visibleWhen: "toggle", toggleKey: "KeyO", action: "none" } } },
  { id: "main-menu", name: "Screen: Main menu", about: "A title screen. Its Play button hides it; give it 'When clicked' lines (play -> objective start ...).", y: 0.5, hud: [],
    components: { UI: { kind: "Widget", widget: "Main menu", style: "Modern", anchor: "center", visibleWhen: "always", text: "My Game", action: "none", onClick: "# Examples:  play -> objective start find-key  (several actions: a; b)" } } },
  { id: "objectives", name: "Objectives", about: "Goals the engine tracks (collect, kill, reach, interact) with the Objective widget showing the active one.", y: 0.5, hud: [],
    components: { Objectives: {}, UI: { kind: "Widget", widget: "Objective", style: "Modern", anchor: "top-right", visibleWhen: "play", action: "none" } } },
];

type Execute = (command: Record<string, unknown>) => { ok: boolean; entity?: unknown; error?: string };

// Adds a recipe's entity (and its HUD widgets in `style`) and returns the names it added.
export function applyRecipe(execute: Execute, recipe: Recipe, withHud: boolean, style: UIStyle, slot: number, existing: ReadonlySet<string>): string[] {
  const added: string[] = [];
  const x = (slot % 6) * 2.5 - 6;
  const spawned = execute({ command: "spawn_entity", name: recipe.name.replace(/^[^:]*:\s*/, ""), transform: [x, recipe.y, 0] });
  if (!spawned.ok) throw new Error(spawned.error ?? "Could not add the entity.");
  for (const [type, overrides] of Object.entries(recipe.components)) {
    const value = { ...(defaultComponent(type as never) as object), ...overrides };
    const result = execute({ command: "set_component", entity: spawned.entity, type, value });
    if (!result.ok) throw new Error(`${type}: ${result.error ?? "rejected"}`);
  }
  added.push(recipe.name);
  if (withHud)
    for (const widget of recipe.hud) {
      if (existing.has(widget)) continue; // one is enough: never a second Crosshair, never replacing yours
      const kit = widgetInfo(widget);
      const made = execute({ command: "spawn_entity", name: `HUD ${widget}` });
      if (!made.ok) throw new Error(made.error ?? "Could not add a widget.");
      const ui = execute({
        command: "set_component",
        entity: made.entity,
        type: "UI",
        value: { ...(defaultComponent("UI") as object), kind: "Widget", widget, style, text: kit.text, anchor: kit.anchor, visibleWhen: kit.visibleWhen, action: "script", offsetX: kit.offsetX, offsetY: kit.offsetY, value: kit.value },
      });
      if (!ui.ok) throw new Error(ui.error ?? "Could not set up a widget.");
      added.push(`HUD ${widget}`);
    }
  return added;
}
