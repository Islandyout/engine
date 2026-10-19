import assert from "node:assert/strict";
import { test } from "node:test";
import { EditorDocument } from "../src/editor/Document";
import { applyRecipe, recipes } from "../src/editor/recipes";
import { componentRequires } from "../src/editor/PropertyMetadata";
import { migrateHud } from "../src/scene/hudMigration";
import { lastHudMigration, serializeScene } from "../src/scene/SceneSerializer";
import { sceneTemplates, templateScene } from "../src/editor/sceneTemplates";
import { uiWidgetNames } from "../src/scene/Components";

const scene = (entities: Record<string, unknown>[]) => ({ format: 1 as const, entities: entities.map((components, i) => ({ name: `E${i}`, components })) }) as never;

test("an old shooter scene gets the widgets its implicit HUD drew, once, as entities", () => {
  const old = scene([{ Player: {}, Weapons: { loadout: "pistol: model=pistol" }, Health: { current: 1, maximum: 1 } }, { Health: { current: 1, maximum: 1 }, AICombat: {} }, { Pickup: { kind: "Ammo" } }]);
  const first = migrateHud(old);
  assert.deepEqual(first.added, ["Crosshair", "Ammo", "Health", "Hint", "Interact prompt", "Pickup feed", "Loot card", "World health bar"]);
  assert.equal(first.document.hud, "widgets");
  assert.equal(migrateHud(first.document).added.length, 0, "a migrated scene is left alone");
});

test("a fighter gets Fighter bars, never the gun HUD; existing widgets are never replaced or duplicated", () => {
  const doc = scene([{ Player: {}, Melee: { ai: false } }, { UI: { kind: "Widget", widget: "Fighter bars", style: "Fantasy" } }]);
  const out = migrateHud(doc);
  assert.ok(!out.added.includes("Fighter bars") && !out.added.includes("Crosshair"));
  const styles = out.document.entities.filter((e) => (e.components as { UI?: { style: string } }).UI).map((e) => (e.components as { UI: { style: string } }).UI.style);
  assert.ok(styles.every((s) => s === "Fantasy"), "added widgets take the scene's style");
});

test("loading an older scene reports what was added; saving marks the scene as widget-only", () => {
  const d = new EditorDocument();
  d.load(scene([{ Player: {}, Vehicle: {} }]));
  assert.deepEqual(lastHudMigration, ["Vehicle instruments"]);
  assert.equal(serializeScene(d.scene).hud, "widgets");
  d.load(serializeScene(d.scene));
  assert.deepEqual(lastHudMigration, []);
});

test("every template ships its HUD as widgets and nothing needs implicit drawing", () => {
  for (const t of sceneTemplates) assert.equal(templateScene(t).hud, "widgets", t.id);
});

test("every recipe adds valid components and its widgets, without duplicating a widget the scene has", () => {
  for (const recipe of recipes) {
    const d = new EditorDocument();
    const existing = new Set<string>(recipe.hud.slice(0, 1));
    const names = applyRecipe((c) => d.execute(c as never) as never, recipe, true, "Tactical", 0, existing);
    assert.equal(names.length, 1 + recipe.hud.filter((w) => !existing.has(w)).length, recipe.id);
    assert.ok(recipe.hud.every((w) => (uiWidgetNames as readonly string[]).includes(w)));
  }
});

test("requires hints only name real components", () => {
  const known = new Set(["RigidBody", "Collider", "Health", "Vehicle", "Camera"]);
  for (const [type, r] of Object.entries(componentRequires)) for (const need of r.needs) assert.ok(known.has(need), `${type} needs ${need}`);
});

test("Pickup.onPickup defaults to empty and survives a save and load", () => {
  const d = new EditorDocument();
  d.load(scene([{ Transform: { position: { x: 0, y: 0, z: 0 } }, Pickup: { kind: "Item", weapon: "", item: "Key", amount: 1, rarity: "Rare", press: false, respawn: 0, onPickup: "Notice: Got {name}! | 3" } }, { Pickup: { kind: "Item", weapon: "", item: "Coin", amount: 1, rarity: "Common", press: false, respawn: 0 } }]));
  const [a, b] = d.scene.eachAlive();
  assert.equal(d.scene.resolve(a!, "Pickup")!.onPickup, "Notice: Got {name}! | 3");
  assert.equal(d.scene.resolve(b!, "Pickup")!.onPickup, "");
});

test("an Inventory round-trips and rejects a bad weights entry", () => {
  const inventory = { slots: 4, maxWeight: 20, weights: "Ore=4, Gem=0.5", head: "Helm", body: "", hands: "" };
  const d = new EditorDocument();
  d.load(scene([{ Player: {}, Inventory: inventory }]));
  const saved = serializeScene(d.scene);
  assert.deepEqual((saved.entities[0]!.components as { Inventory: unknown }).Inventory, inventory);
  for (const weights of ["Ore", "Ore=heavy", "=3", "Ore=-1"])
    assert.throws(() => new EditorDocument().load(scene([{ Inventory: { ...inventory, weights } }])), /Inventory\.weights/, weights);
});
