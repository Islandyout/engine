// Azure Cloud Sect (games/my-games/azure-cloud-sect): the cultivation game loads and plays. The Player starts as a Mortal,
// holding M while standing still gathers qi, and the HUD has one Fighter bars widget (not a second health widget on top).
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
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => { Element.prototype.requestPointerLock = () => Promise.resolve(); });
    await page.goto(`http://127.0.0.1:${server.address().port}/engine/azure-cloud-sect.html`);
    const ticks = () => page.evaluate(() => Number(((document.querySelector("#status")?.textContent || "").match(/(\d+) C\+\+ fixed ticks/) || [])[1] || 0));
    const until = async (n) => {
      const t0 = await ticks();
      await page.waitForFunction((x) => Number(((document.querySelector("#status")?.textContent || "").match(/(\d+) C\+\+ fixed ticks/) || [])[1] || 0) >= x, t0 + n, { timeout: 120000 });
    };
    await page.waitForFunction(() => document.querySelector("#status")?.dataset.mode === "play", null, { timeout: 120000 });
    await until(30);
    await page.mouse.click(480, 150);
    // A new game opens on a few shots of the valley; Enter skips them.
    await until(100);
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press("Enter");
      await until(10);
    }
    const text = () => page.evaluate(() => document.body.innerText);
    // The opening shots end in the mirror: robe, hair, cut and language are chosen live, and E ends it.
    await page.waitForFunction(() => /Mirror/.test(document.body.innerText), null, { timeout: 60000 });
    const tap = async (key) => { await page.keyboard.down(key); await until(8); await page.keyboard.up(key); await until(8); };
    await tap("3");
    assert.match(await text(), /Cut: Long robe/, "key 3 changes the cut");
    await tap("4");
    assert.match(await text(), /凡人/, "the language key switches the HUD to Chinese");
    await tap("4");
    assert.match(await text(), /Mortal/, "and back to English");
    await tap("e");
    assert.ok(!/Mirror/.test(await text()), "E closes the mirror");
    let before = await text();
    assert.match(before, /Mortal/, "the Player starts as a Mortal");
    // HP, mana, ultimate and guard come from one Fighter bars widget; a second Health widget draws over it.
    const scene = JSON.parse(await fs.readFile(path.resolve("games/my-games/azure-cloud-sect/scene.json"), "utf8"));
    const widgets = scene.entities.map((e) => e.components.UI).filter((ui) => ui?.kind === "Widget").map((ui) => ui.widget);
    assert.equal(widgets.filter((w) => w === "Fighter bars").length, 1, "one Fighter bars widget");
    assert.ok(!widgets.includes("Health"), "no Health widget over the fighter bars");
    assert.equal(scene.hud, "widgets", "the scene owns its HUD");
    for (const w of ["Skill bar", "Resource bar", "Status effects", "Target frame", "Damage direction", "Death screen", "Character sheet", "Quest log", "Skill tree", "Shop window", "Quick slots", "Key hints", "Minimap", "Compass", "Objective"])
      assert.ok(widgets.includes(w), `the HUD has a ${w}`);
    // The village, the sect's teacher and furnace, the shrines and the herbs are all in the world (the buildings are kit models, not boxes).
    const names = new Set(scene.entities.map((e) => e.name));
    for (const n of ["Instructor Hua", "Alchemy furnace", "Anvil", "Meditation altar", "Wayside shrine", "Village shrine", "Peak shrine", "Merchant Lin", "Wen", "Stablemaster Gu", "Disciple Lan", "Spirit Fox", "Spirit herb 1", "Tent 1", "Watchtower", "Economy", "Sect", "Valley", "Folk", "Mission board", "Hall door", "Hall exit", "Cave mouth", "Cave exit", "Cave Guardian", "Lake shore", "Lake water", "Ore rock 1", "Wolf 1", "Sparring Disciple A", "Farmer Bo", "Instructor Hua"])
      assert.ok(names.has(n), `the scene has ${n}`);
    assert.ok(!scene.entities.some((e) => /^Tent flap/.test(e.name)), "tents are models, not stacked boxes");
    // No hand-made text or bar standing in for a widget.
    const plain = scene.entities.map((e) => e.components.UI).filter((ui) => ui && ui.kind !== "Widget");
    assert.deepEqual(plain, [], "every piece of HUD text is a widget");
    assert.ok(scene.entities.every((e) => !e.components.UI || e.components.UI.kind !== "Widget" || e.components.UI.style === "Minimal"), "one style across the HUD");
    assert.match(before, /Meet Elder Mu/i, "the first objective is showing");
    const qi = (s) => Number((s.match(/Qi ([\d.]+) \/ \d+/) || [])[1]);
    assert.equal(qi(before), 0, "no qi yet");
    await page.keyboard.down("n");
    await until(50); // 9 qi a second, standing still
    await page.keyboard.up("n");
    await until(5);
    const after = await text();
    assert.ok(qi(after) >= 3, `holding N gathers qi (${qi(after)})`);
    assert.deepEqual(errors, [], "no page errors");
    console.log("murim: ok");
  } catch (error) {
    await saveFailure("murim", error, browser);
    console.error(error);
    process.exitCode = 1;
  } finally {
    await browser?.close();
    server.close();
  }
})();
