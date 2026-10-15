import assert from "node:assert/strict";
import { test } from "node:test";
import { uiStyleNames, uiWidgetNames } from "../src/scene/Components";
import { Scene } from "../src/scene/Scene";
import { deserializeScene } from "../src/scene/SceneSerializer";
import { applySettingHit, drawWidget, lootIcon, parseDialogue, sampleUIData, widgetCatalog, widgetInfo, type UIData } from "../src/editor/uiKit";

// A canvas context that records calls and accepts anything.
function recorder() {
  const calls: string[] = [];
  const gradient = { addColorStop() {} };
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(target, key: string) {
      if (key in target) return target[key];
      if (key === "measureText") return (text: string) => ({ width: text.length * 8 });
      if (key === "createLinearGradient" || key === "createRadialGradient") return () => gradient;
      return (...args: unknown[]) => calls.push(`${key}(${args.length})`);
    },
    set(target, key: string, value) {
      target[key] = value;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

const live = (): UIData => ({
  ...sampleUIData(3, 1280, 720),
  pointer: { x: 140, y: 380 },
  prompt: { verb: "Open", name: "Crate", key: "E", hold: 0.5, locked: false, need: "", rarity: 2 },
  loot: { name: "Carbine", rarity: 3, damage: 32, rpm: 720, magazine: 30, melee: false },
  pickups: [{ label: "Ammo", amount: 30, rarity: 0, kind: 1, age: 0.1 }],
  kills: [{ killer: "You", victim: "Raider", mine: true, age: 1 }],
  damage: [{ x: 600, y: 300, amount: 42, crit: true, age: 0.2 }],
  boss: { name: "Warden", health: 0.4, ghost: 0.5, stagger: 0.2 },
  items: [{ name: "Coin", count: 5 }],
  markers: [{ label: "Crate", distance: 40, bearing: 0.3, x: 2000, y: 300, onScreen: false }],
  blips: [{ x: 10, z: -5, kind: "enemy" }],
});

test("the catalog has every widget, each in a group with a size", () => {
  assert.deepEqual(
    widgetCatalog.map((w) => w.name),
    [...uiWidgetNames],
  );
  for (const info of widgetCatalog) {
    assert.ok(info.width > 0 && info.height > 0, info.name);
    assert.ok(info.about.length > 10, info.name);
  }
  for (const group of ["Combat HUD", "Navigation", "Interaction & loot", "Menus & dialogue"])
    assert.ok(widgetCatalog.filter((w) => w.group === group).length >= 4, group);
  assert.equal(widgetInfo("Minimap").anchor, "top-left");
});

test("every widget draws in every style, from sample and live data", () => {
  for (const widget of uiWidgetNames)
    for (const style of uiStyleNames)
      for (const preview of [true, false]) {
        const { ctx, calls } = recorder();
        const info = widgetInfo(widget);
        const data = preview ? sampleUIData(1, 1280, 720) : live();
        drawWidget(ctx, { widget, style, text: info.text, value: info.value, fontSize: 16, textAge: 1, preview }, { left: 100, top: 100, ...info }, data);
        assert.ok(calls.length > 0 || (!preview && ["Waypoints"].includes(widget)), `${widget} in ${style} drew nothing`);
      }
});

test("menus, the wheel and settings say what a click does", () => {
  const { ctx } = recorder();
  const rect = { left: 0, top: 0, width: 320, height: 300 };
  const actions = (widget: (typeof uiWidgetNames)[number]) =>
    drawWidget(ctx, { widget, style: "Modern", text: widgetInfo(widget).text, value: 0, fontSize: 16, textAge: 9, preview: false }, rect, live()).map((h) => h.action);
  assert.deepEqual(actions("Pause menu"), ["resume", "restart", "settings", "quit"]);
  assert.deepEqual(actions("Main menu"), ["play", "settings", "quit"]);
  assert.deepEqual(actions("Settings"), ["slider:master", "slider:sensitivity", "toggle:invertY", "toggle:aimAssist", "toggle:shake"]);
  assert.deepEqual(actions("Weapon wheel"), ["slot:0", "slot:1", "slot:2"]);
  assert.deepEqual(actions("Hotbar"), ["slot:0", "slot:1", "slot:2"]);
  assert.deepEqual(actions("Dialogue"), ["choice:1", "choice:2"]);
  // The wheel's wedges: the first straight up, clockwise.
  const wheel = drawWidget(ctx, { widget: "Weapon wheel", style: "Sci-fi", text: "", value: 0, fontSize: 16, textAge: 0, preview: false }, { left: 0, top: 0, width: 300, height: 300 }, live());
  assert.ok(wheel[0]!.test!(150, 20));
  assert.ok(!wheel[0]!.test!(150, 150)); // the hub is not a wedge
  assert.ok(wheel[1]!.test!(280, 150));
});

test("settings hits change the player's settings", () => {
  const settings = { master: 1, sensitivity: 1, invertY: false, aimAssist: true, shake: true };
  assert.ok(applySettingHit("slider:master", 0.25, settings));
  assert.ok(applySettingHit("slider:sensitivity", 1.4, settings));
  assert.ok(applySettingHit("toggle:aimAssist", 0, settings));
  assert.deepEqual(settings, { master: 0.25, sensitivity: 1.5, invertY: false, aimAssist: false, shake: true });
  assert.ok(!applySettingHit("slider:nope", 0.5, settings));
  assert.ok(!applySettingHit("resume", 0, settings));
});

test("dialogue text: speaker, line and choices", () => {
  assert.deepEqual(parseDialogue("Ada: Hello there.\n> Hi\n>  Bye"), { speaker: "Ada", line: "Hello there.", choices: ["Hi", "Bye"] });
  assert.deepEqual(parseDialogue("Just a line"), { speaker: "", line: "Just a line", choices: [] });
});

test("loot icons by kind and name", () => {
  assert.equal(lootIcon(0, "Carbine"), "gun");
  assert.equal(lootIcon(0, "Sword"), "sword");
  assert.equal(lootIcon(1, ""), "bullet");
  assert.equal(lootIcon(2, ""), "cross");
  assert.equal(lootIcon(3, "Gold coin"), "coin");
  assert.equal(lootIcon(3, "Vault key"), "key");
  assert.equal(lootIcon(-1, "Key"), "lock");
});

test("a Widget UI loads; a bad widget or style says why", () => {
  const load = (ui: Record<string, unknown>) => {
    const scene = new Scene();
    deserializeScene(scene, {
      format: 1,
      entities: [{ components: { UI: { kind: "Widget", text: "", anchor: "center", visibleWhen: "always", action: "script", ...ui } } }],
    });
    return scene.resolve(scene.eachAlive()[0]!, "UI")!;
  };
  const ui = load({ widget: "Minimap", style: "Fantasy" });
  assert.equal(ui.widget, "Minimap");
  assert.equal(ui.style, "Fantasy");
  assert.throws(() => load({ widget: "Radar", style: "Modern" }), /UI.widget must be one of/);
  assert.throws(() => load({ widget: "Health", style: "Neon" }), /UI.style must be one of/);
  // Older scenes without the fields: a Health widget in Modern.
  assert.equal(load({}).style, "Modern");
});
