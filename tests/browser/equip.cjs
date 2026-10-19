// A fighter with no Weapons component picks up a melee weapon: it is equipped and drawn in the hand
// at once (before this fix it stayed invisible), and picking it up changes no UI by itself.
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
    // A blade on the ground right next to the Player, taken with E.
    await run({ command: "spawn_entity", name: "Blade", transform: [0.8, 0.5, 4] });
    const blade = (await run({ command: "list_entities" })).data.find((e) => e.name === "Blade");
    const ref = { index: blade.index, generation: blade.generation };
    await run({ command: "attach_component", entity: ref, type: "Collider" });
    await run({ command: "attach_component", entity: ref, type: "Pickup" });
    await run({ command: "set_component", entity: ref, type: "Pickup", value: { kind: "Weapon", weapon: "sword: melee=dagger", item: "", amount: 1, rarity: "Rare", press: true, respawn: 0, onPickup: "" } });
    const hands = () => page.evaluate(() => Number(document.querySelector("#viewport").dataset.hands ?? -1));
    await page.waitForTimeout(500);
    assert.equal(await hands(), 0, "a Player with Melee holds nothing in the editor (no default gun)");
    assert.equal(await page.evaluate(() => (document.querySelector("#viewport").dataset.guns ?? "0").split(",")[0]), "0", "no gun is drawn in the editor");
    await page.click("#play");
    await page.waitForFunction(() => document.querySelector("#status")?.dataset.mode === "play", null, { timeout: 60000 });
    await page.waitForFunction(() => (document.querySelector("#hud-text")?.textContent ?? "").includes("E: Pick up"), null, { timeout: 60000 });
    assert.equal(await hands(), 0, "nothing in the hands before");
    await page.keyboard.down("e"); await page.waitForTimeout(150); await page.keyboard.up("e");
    await page.waitForFunction(() => Number(document.querySelector("#viewport").dataset.hands ?? 0) > 0, null, { timeout: 60000 });
    await page.screenshot({ path: "build/browser-evidence/equip-melee.png" });
    assert.deepEqual(errors, [], "no page errors");
    console.log("equip: ok");
  } catch (error) {
    await saveFailure("equip", error, browser);
    console.error(error);
    process.exitCode = 1;
  } finally {
    await browser?.close();
    server.close();
  }
})();
