import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPickupVisual, pickupLootLine, pickupModelName, rarityIndex } from "../src/editor/lootView";

test("every kind of pickup builds its look", () => {
  for (const [kind, item] of [
    ["Weapon", ""],
    ["Ammo", ""],
    ["Health", ""],
    ["Item", "Coin"],
    ["Item", "Range Key"],
    ["Item", "Gem"],
  ] as const) {
    const visual = buildPickupVisual(kind, item, 3);
    assert.equal(visual.rarity, 3);
    assert.ok(visual.root.getObjectByName("pickup_beam"), `${kind} ${item} has its beam`);
    if (kind !== "Weapon") assert.ok(visual.holder.children.length > 0, `${kind} ${item} has a prop`);
  }
});

test("a Pickup as its loot line and model", () => {
  const base = { weapon: "", item: "", amount: 1, rarity: "Rare" as const, press: false, respawn: 0 };
  assert.equal(pickupLootLine({ ...base, kind: "Item", item: "Range Key" }), "1 item Range Key 1 rarity=Rare");
  assert.equal(pickupLootLine({ ...base, kind: "Ammo", amount: 30 }), "1 ammo 30 rarity=Rare");
  assert.equal(pickupModelName({ kind: "Weapon", weapon: "w: model=rifle held=carbine-2" }), "carbine-2");
  assert.equal(pickupModelName({ kind: "Weapon", weapon: "w: melee=sword" }), "sword");
  assert.equal(rarityIndex("Legendary"), 4);
});
