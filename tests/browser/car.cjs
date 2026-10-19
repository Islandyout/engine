// A car the Player can get into with E, no script: the prompt, driving, and getting out beside it.
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
    await page.click('[aria-label="Third-person starter"]');
    await page.waitForTimeout(500);
    const entities = async () => (await run({ command: "list_entities" })).data;
    const player = (await entities()).find((e) => e.name === "Player" || e.components?.includes?.("Player"));
    const pref = { index: player.index, generation: player.generation };
    await run({ command: "spawn_entity", name: "Taxi", transform: [0, 0.65, 0] });
    const taxi = (await entities()).find((e) => e.name === "Taxi");
    const tref = { index: taxi.index, generation: taxi.generation };
    await run({ command: "set_component", entity: tref, type: "Scale", value: { value: { x: 1.8, y: 1.3, z: 4 } } });
    await run({ command: "set_component", entity: tref, type: "Renderable", value: { mesh: 219, material: 0, visible: true } });
    for (const type of ["RigidBody", "Collider", "Vehicle"]) await run({ command: "attach_component", entity: tref, type });
    await run({ command: "set_transform", entity: pref, position: [0, 0.9, 4] });
    const hud = () => page.locator("#hud-text").textContent();
    const where = async () => (await page.locator("#status").textContent()).match(/Player \(([-\d.]+), ([-\d.]+), ([-\d.]+)\)/).slice(1).map(Number);
    await page.click("#play");
    await page.waitForFunction(() => document.querySelector("#status")?.dataset.mode === "play", null, { timeout: 60000 });
    await page.waitForFunction(() => /E: Enter Taxi/.test(document.querySelector("#hud-text").textContent), null, { timeout: 60000 });
    await page.screenshot({ path: "build/browser-evidence/car-enter-prompt.png" });
    await page.keyboard.press("e");
    await page.waitForFunction(() => /E: Exit Taxi/.test(document.querySelector("#hud-text").textContent), null, { timeout: 30000 });
    const parked = await where();
    await page.keyboard.down("w");
    await page.waitForTimeout(2500);
    await page.keyboard.up("w");
    const driven = await where();
    assert.ok(Math.hypot(driven[0] - parked[0], driven[2] - parked[2]) > 3, `the car drove (${parked} -> ${driven})`);
    await page.waitForTimeout(2500); // let it roll to a stop
    await page.screenshot({ path: "build/browser-evidence/car-driving.png" });
    await page.keyboard.press("e");
    await page.waitForFunction(() => /E: Enter Taxi/.test(document.querySelector("#hud-text").textContent), null, { timeout: 30000 });
    assert.deepEqual(errors, [], "no page errors");
    console.log("car: ok");
  } catch (error) {
    await saveFailure("car", error, browser);
    console.error(error);
    process.exitCode = 1;
  } finally {
    await browser?.close();
    server.close();
  }
})();
