// A Collider on a freshly placed catalog model is as big as the model looks: with no Scale, the body used to be a 1 m cube,
const assert = require("node:assert/strict");
// so the player walked straight through the building it was looking at.
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
    // Tower 1 is about 30 x 86 x 26 m. Placed with no Scale component (what the catalog does), centred 40 m ahead of the player.
    await run({ command: "spawn_entity", name: "Tower", transform: [0, 0, -40] });
    const tower = (await entities()).find((e) => e.name === "Tower");
    const tref = { index: tower.index, generation: tower.generation };
    await run({ command: "set_component", entity: tref, type: "Renderable", value: { mesh: 20, material: 0, visible: true } });
    await run({ command: "attach_component", entity: tref, type: "Collider" });
    await run({ command: "set_transform", entity: pref, position: [0, 0.9, 0] });
    await page.click("#play");
    await page.waitForFunction(() => document.querySelector("#status")?.dataset.mode === "play", null, { timeout: 60000 });
    await page.waitForTimeout(800);
    await page.keyboard.down("w");
    await page.waitForTimeout(9000); // 4.5 m/s: far enough to reach a 1 m cube at z=-40 if the tower were not solid
    await page.keyboard.up("w");
    const z = Number((await page.locator("#status").textContent()).match(/Player \(([-\d.]+), ([-\d.]+), ([-\d.]+)\)/)[3]);
    await page.screenshot({ path: "build/browser-evidence/collider-model.png" });
    // The tower's face is at z = -40 + 13 = -27: stopped there, not walked through to the 1 m cube's face at -39.5.
    assert.ok(z > -30, `the player stopped at the tower (z=${z})`);
    assert.deepEqual(errors, [], "no page errors");
    console.log("collider: ok");
  } catch (error) {
    await saveFailure("collider", error, browser);
    console.error(error);
    process.exitCode = 1;
  } finally {
    await browser?.close();
    server.close();
  }
})();
