// Screens and objectives without writing a script: an Inventory screen that opens with I and wears an item on a click,
// and an Objectives list that tracks "collect" and runs its on-complete actions.
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");
const { saveFailure } = require("./evidence.cjs");
(async () => {
  const root = path.resolve(process.env.SITE_ROOT || "build/site");
  const server = http.createServer(async (req, res) => {
    const p = new URL(req.url, "http://localhost").pathname.replace(/^\/engine\//, "");
    const file = path.resolve(root, p === "" || p.endsWith("/") ? p + "index.html" : p);
    if (!file.startsWith(root + path.sep)) return res.writeHead(404).end();
    try {
      res.setHeader("Content-Type", { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".glb": "model/gltf-binary" }[path.extname(file)] || "text/plain");
      res.end(await fs.readFile(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  let browser;
  try {
    browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("dialog", (d) => d.accept());
    await page.addInitScript(() => { Element.prototype.requestPointerLock = () => Promise.resolve(); });
    await page.goto(`http://127.0.0.1:${server.address().port}/engine/`);
    await page.waitForFunction(() => document.querySelector("#runtime")?.textContent === "C++ runtime ready");
    const run = async (command) => {
      await page.locator("#json").fill(JSON.stringify(command));
      await page.locator("#command button").click();
      const result = JSON.parse(await page.locator("#log").textContent());
      assert.ok(result.ok, JSON.stringify(result));
      return result;
    };
    await page.click("#new");
    await page.click('[aria-label="Martial-arts dojo"]');
    await page.waitForTimeout(500);
    const entities = async () => (await run({ command: "list_entities" })).data;
    const refOf = async (name) => {
      const e = (await entities()).find((x) => x.name === name);
      assert.ok(e, `entity ${name}`);
      return { index: e.index, generation: e.generation };
    };
    const player = (await entities()).find((e) => e.components?.includes?.("Player") || e.name === "Player");
    const pref = { index: player.index, generation: player.generation };
    await run({ command: "attach_component", entity: pref, type: "Inventory" });
    await run({ command: "set_component", entity: pref, type: "Inventory", value: { slots: 0, maxWeight: 0, weights: "", stats: "Helmet: slot=head armor=50", head: "", body: "", hands: "" } });
    await run({ command: "attach_component", entity: pref, type: "Script" });
    await run({ command: "set_component", entity: pref, type: "Script", value: { source: "function on_start() inventory.add(self.id, 'Helmet') end", props: {} }  });
    const base = { kind: "Widget", text: "", anchor: "center", visibleWhen: "always", action: "none", offsetX: 0, offsetY: 0, width: 0, height: 0, fontSize: 16, color: { x: 0.118, y: 0.165, z: 0.22 }, opacity: 0.85, image: "", value: 0, widget: "Inventory", style: "Modern", source: "", onClick: "", toggleKey: "" };
    const ui = async (name, over) => {
      await run({ command: "spawn_entity", name });
      const ref = await refOf(name);
      await run({ command: "attach_component", entity: ref, type: "UI" });
      await run({ command: "set_component", entity: ref, type: "UI", value: { ...base, ...over } });
    };
    await ui("Bag", { widget: "Inventory", visibleWhen: "toggle", toggleKey: "KeyI" });
    await ui("Msg", { kind: "Text", anchor: "top-left", visibleWhen: "play" });
    await ui("Goal", { widget: "Objective", anchor: "top-right", visibleWhen: "play" });
    await run({ command: "spawn_entity", name: "Goals" });
    const goals = await refOf("Goals");
    await run({ command: "attach_component", entity: goals, type: "Objectives" });
    await run({ command: "set_component", entity: goals, type: "Objectives", value: { list: "get | Get the helmet | Find one | collect Helmet 1 | text Msg: Helmet found\nwear | Wear it | Open the bag with I | script |" } });
    const hits = () => page.evaluate(() => document.querySelector("#viewport").dataset.widgetHits ?? "");
    const hud = () => page.locator("#hud-text").textContent();
    await page.click("#play");
    await page.waitForFunction(() => document.querySelector("#status")?.dataset.mode === "play", null, { timeout: 60000 });
    // The first objective completes by itself (the script gave the helmet); its on-complete text shows, and the next starts.
    await page.waitForFunction(() => /Helmet found/.test(document.querySelector("#hud-text").textContent) && /Wear it/.test(document.querySelector("#hud-text").textContent), null, { timeout: 60000 });
    assert.ok(!/equip:/.test(await hits()), "the bag is closed until I");
    await page.keyboard.press("KeyI");
    await page.waitForFunction(() => /equip:head:Helmet@/.test(document.querySelector("#viewport").dataset.widgetHits), null, { timeout: 30000 });
    await page.screenshot({ path: "build/browser-evidence/screens-bag.png" });
    // Click the helmet: it is worn, so the cell now takes it off.
    const [, x, y] = /equip:head:Helmet@(\d+),(\d+)/.exec(await hits());
    const box = await page.locator("#viewport canvas").first().boundingBox();
    await page.mouse.click(box.x + Number(x), box.y + Number(y));
    await page.waitForFunction(() => /unequip:head@/.test(document.querySelector("#viewport").dataset.widgetHits), null, { timeout: 30000 });
    await page.keyboard.press("KeyI");
    await page.waitForFunction(() => !/equip:/.test(document.querySelector("#viewport").dataset.widgetHits), null, { timeout: 30000 });
    assert.deepEqual(errors, [], "no page errors");
    console.log("screens: ok");
  } catch (error) {
    await saveFailure("screens", error, browser);
    console.error(error);
    process.exitCode = 1;
  } finally {
    await browser?.close();
    server.close();
  }
})();
