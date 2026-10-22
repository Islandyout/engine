// Jianghu Road (games/my-games/jianghu-road): the open world loads, a quest is taken from the gatekeeper and tracked with one waypoint,
// and Enter stops tracking it.
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
    await page.goto(`http://127.0.0.1:${server.address().port}/engine/jianghu-road.html`);
    const ticks = () => page.evaluate(() => Number(((document.querySelector("#status")?.textContent || "").match(/(\d+) C\+\+ fixed ticks/) || [])[1] || 0));
    const until = async (n) => {
      const t0 = await ticks();
      await page.waitForFunction((x) => Number(((document.querySelector("#status")?.textContent || "").match(/(\d+) C\+\+ fixed ticks/) || [])[1] || 0) >= x, t0 + n, { timeout: 180000 });
    };
    const text = () => page.evaluate(() => document.body.innerText);
    const position = () => page.evaluate(() => {
      const m = (document.querySelector("#status")?.textContent || "").match(/Player \(([-\d.]+), ([-\d.]+), ([-\d.]+)\)/);
      return m ? { x: +m[1], z: +m[3] } : null;
    });
    const tap = async (key) => { await page.keyboard.down(key); await until(8); await page.keyboard.up(key); await until(8); };
    await page.waitForFunction(() => document.querySelector("#status")?.dataset.mode === "play", null, { timeout: 180000 });
    await until(30);
    await page.mouse.click(480, 150);
    // A new road starts with a look in the mirror; E ends it.
    await page.waitForFunction(() => /Mirror/.test(document.body.innerText), null, { timeout: 300000 });
    await tap("e");
    assert.ok(!/Mirror/.test(await text()), "E closes the mirror");
    assert.match(await text(), /Mortal/, "the Player starts as a Mortal");
    assert.match(await text(), /No quest tracked/, "no objective is tracked until one is taken");
    // Walk north from the road into the south gate, to the Gatekeeper.
    await page.keyboard.down("w");
    await page.keyboard.down("Shift");
    for (let i = 0; i < 400; i++) {
      const p = await position();
      if (p && p.z < 60.5) break;
      await until(10);
    }
    await page.keyboard.up("Shift");
    await page.keyboard.up("w");
    await until(30);
    assert.match(await text(), /talk to Gatekeeper Jun/, "the gatekeeper can be talked to at the gate");
    await tap("e");
    assert.match(await text(), /Gatekeeper Jun/, "the conversation opens");
    for (let i = 0; i < 6 && !/A Letter for Master Mei/.test(await text()); i++) await tap("1");
    assert.match(await text(), /A Letter for Master Mei/, "the quest is taken and tracked");
    // One waypoint for the tracked quest; Enter cycles it off, and nothing else marks the map.
    const markers = () => page.evaluate(() => (document.body.innerText.match(/A Letter for Master Mei/g) || []).length);
    assert.ok((await markers()) >= 2, "the tracked quest shows an objective and a waypoint label");
    await tap("Enter");
    assert.match(await text(), /No quest tracked/, "Enter stops tracking");
    assert.deepEqual(errors, [], "no page errors");
    console.log("jianghu: ok");
  } catch (error) {
    await saveFailure("jianghu", error, browser);
    console.error(error);
    process.exitCode = 1;
  } finally {
    await browser?.close();
    server.close();
  }
})();
