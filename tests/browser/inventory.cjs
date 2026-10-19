// An Inventory limited to one kind of item: the Player walks over a Coin (taken) and a Gem (left on the
// ground, "Inventory full"); inventory.* answers the same way from a script.
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
    const player = (await entities()).find((e) => e.components?.includes?.("Player") || e.name === "Player");
    assert.ok(player, "the dojo has a Player");
    const pref = { index: player.index, generation: player.generation };
    await run({ command: "attach_component", entity: pref, type: "Inventory" });
    await run({ command: "set_component", entity: pref, type: "Inventory", value: { slots: 1, maxWeight: 0, weights: "", head: "", body: "", hands: "" } });
    const loot = async (name, at) => {
      await run({ command: "spawn_entity", name, transform: at });
      const e = (await entities()).find((x) => x.name === name);
      const ref = { index: e.index, generation: e.generation };
      await run({ command: "attach_component", entity: ref, type: "Collider" });
      await run({ command: "attach_component", entity: ref, type: "Pickup" });
      await run({ command: "set_component", entity: ref, type: "Pickup", value: { kind: "Item", weapon: "", item: name, amount: 1, rarity: "Common", press: false, respawn: 0, onPickup: "" } });
    };
    await loot("Coin", [0.8, 0.5, 4]);
    await loot("Gem", [0.8, 0.5, 4.2]);
    await page.click("#play");
    await page.waitForFunction(() => document.querySelector("#status")?.dataset.mode === "play", null, { timeout: 60000 });
    await page.waitForFunction(async () => document.querySelector("#viewport")?.dataset.items !== undefined, null, { timeout: 60000 });
    await page.waitForFunction(() => document.querySelector("#viewport").dataset.items.includes("Coin 1"), null, { timeout: 60000 });
    assert.ok(!(await page.evaluate(() => document.querySelector("#viewport").dataset.items)).includes("Gem"), "the Gem did not fit");
    await page.waitForTimeout(1500); // standing on both: the Gem is still refused
    assert.equal(await page.evaluate(() => document.querySelector("#viewport").dataset.items), "Coin 1");
    await page.screenshot({ path: "build/browser-evidence/inventory-full.png" });
    assert.deepEqual(errors, [], "no page errors");
    console.log("inventory: ok");
  } catch (error) {
    await saveFailure("inventory", error, browser);
    console.error(error);
    process.exitCode = 1;
  } finally {
    await browser?.close();
    server.close();
  }
})();
