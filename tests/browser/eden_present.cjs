// What Eden shows of the simulation, in a real browser (docs/changelog/F152.md): the lake's water stays at its level (the pier and boat were
// seen high and dry when it fell to the lake bed), faces blink, bodies are drawn at their size, the other settlements stand on the horizon,
// the things people make are in the scene, and the Walker's look is applied and their blows remembered. (The UI kit's heads-up widgets are
// in the screenshots, not asserted here.)
// Screenshots of each are in docs/eden-screenshots/F152_*.png (taken by hand at the same hooks).
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
    const file = path.resolve(root, p);
    if (!file.startsWith(root + path.sep)) return res.writeHead(404).end();
    try {
      res.setHeader("Content-Type", { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".json": "application/json", ".glb": "model/gltf-binary" }[path.extname(file)] || "application/octet-stream");
      res.end(await fs.readFile(file));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  let browser;
  try {
    browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
    const context = await browser.newContext({ viewport: { width: 960, height: 540 }, userAgent: "Mozilla/5.0 BTAIDesktop" });
    const page = await context.newPage();
    page.setDefaultTimeout(120000);
    const errors = [];
    page.on("console", (m) => {
      if (m.type() === "error" && !/favicon/.test(m.text())) errors.push(`console: ${m.text()}`);
    });
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    await page.goto(`http://127.0.0.1:${server.address().port}/engine/eden.html`);
    await page.waitForSelector(".eden-panel");
    await page.waitForFunction(() => typeof window.edenDebug === "function" && window.edenDebug().length >= 2 && window.edenDebug()[0].body, null, { timeout: 180000 });
    await page.evaluate(() => [...document.querySelectorAll(".eden-panel button")].find((b) => b.textContent === "⏸").click());

    // The water is where the scene put it, not on the lake bed.
    const water = await page.evaluate(() => window.edenObj("Lake water").position.y);
    assert.ok(water > -0.6 && water < -0.2, `the lake's water is at its level (${water})`);

    // A blink: the eyes go when the face is held shut, and come back.
    const eyes = (name) => page.evaluate((n) => { let v; window.edenObj(n).traverse((x) => { if (/^eyes?$/i.test(x.name)) v = x.visible; }); return v; }, name);
    await page.evaluate(() => window.edenPresent.holdFace("Adam", { closure: 1 }));
    await page.waitForFunction(() => { let v = true; window.edenObj("Adam").traverse((x) => { if (/^eyes?$/i.test(x.name)) v = x.visible; }); return v === false; });
    await page.evaluate(() => window.edenPresent.holdFace("Adam", { closure: 0 }));
    await page.waitForFunction(() => { let v = false; window.edenObj("Adam").traverse((x) => { if (/^eyes?$/i.test(x.name)) v = x.visible; }); return v === true; });
    assert.equal(await eyes("Adam"), true);

    // Size follows age, smoothly: Eve made a child is drawn small, then grown, with the one prefab.
    const scaleOf = (n) => page.evaluate((x) => window.edenObj(x).children.find((c) => c.name === "Scene").scale.y, n);
    const grown = await scaleOf("Eve");
    await page.evaluate(() => window.edenMind("eve", { age: 0.6 }));
    await page.waitForFunction((g) => window.edenObj("Eve").children.find((c) => c.name === "Scene").scale.y < g * 0.6, grown);
    await page.evaluate(() => window.edenMind("eve", { age: 20 }));

    // The other settlements are on the horizon: huts, a fire and a banner for each.
    const marks = await page.evaluate(() => window.edenPresent.state().marks);
    assert.ok(marks.filter((m) => /-hut-/.test(m)).length >= 3 && marks.filter((m) => /-fire$/.test(m)).length >= 3, `settlements stand on the horizon: ${marks.join(", ")}`);

    // Things the people make are in the scene (a pot, a boat, a well), and a bridge is laid and sized to its span.
    await page.evaluate(() => {
      window.edenMake("pot", 2, -36);
      window.edenMake("boat", 126, 100);
      window.edenMake("well", 6, -36);
      window.edenMake("bridge", 122, 95, { radius: 2, span: { x2: 178, z2: 95, need: 11, laid: 11 } });
    });
    await page.waitForFunction(() => window.edenWorld().things.filter((t) => /^(pot|boat|well|bridge)-/.test(t.id)).every((t) => window.edenObj(t.id)), null, { timeout: 120000 });
    await page.waitForFunction(() => { const b = window.edenWorld().things.find((t) => t.kind === "bridge"); return window.edenObj(b.id).scale.z > 50; });

    // The Walker's look: walking brings the hunter in, and a look chosen in the You tab is applied (size and the tunic sent to the body).
    await page.evaluate(() => [...document.querySelectorAll(".eden-panel button")].find((b) => b.textContent === "Walk the world").click());
    await page.waitForFunction(() => window.edenYou() && window.edenYou().index >= 0, null, { timeout: 120000 });
    await page.evaluate(() => {
      const p = document.querySelector(".eden-panel");
      [...p.querySelectorAll("button")].find((b) => b.textContent === "You").click();
      const set = (sel, v) => { const e = p.querySelector(sel); e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); };
      set('input[aria-label="Walker height in centimetres"]', "200");
      set('input[aria-label="Walker tunic colour"]', "#a02828");
      [...p.querySelectorAll("button")].find((b) => b.textContent === "Change how I look").click();
    });
    await page.waitForFunction(() => window.edenWorld().walker.body.look.heightCm === 200);
    const youScale = await page.evaluate(() => window.edenObj("you").children.find((c) => c.name === "Scene").scale.y);
    assert.ok(youScale > 1.1, `the Walker is drawn tall (${youScale})`);
    // A refused value is said so, with its reason.
    await page.evaluate(() => {
      const p = document.querySelector(".eden-panel");
      const e = p.querySelector('input[aria-label="Walker height in centimetres"]');
      e.min = "0"; e.max = "999"; e.value = "999";
      [...p.querySelectorAll("button")].find((b) => b.textContent === "Change how I look").click();
    });
    const refused = await page.evaluate(() => document.querySelector(".eden-youform .eden-no")?.textContent ?? "");
    assert.match(refused, /height must be 140 to 210/);
    // Striking and tending are remembered: the Walker's deeds are kept.
    const said = await page.evaluate(async () => {
      const you = window.edenObj("you");
      const w = window.edenWorld();
      window.edenPut("eve", you.position.x + 1, you.position.z);
      await new Promise((r) => setTimeout(r, 600));
      return [window.edenPresent.strike(w, you, 0.5), w.walker.body.deeds.map((d) => d.kind)];
    });
    assert.match(String(said[0]), /You struck/);
    assert.deepEqual(said[1], ["struck"]);

    assert.deepEqual(errors, [], `no console errors or exceptions: ${errors.slice(0, 5).join(" | ")}`);
    console.log(`Eden presentation browser test passed (water ${water.toFixed(2)}, settlement parts ${marks.length}, Walker scale ${youScale.toFixed(2)})`);
  } catch (error) {
    await saveFailure("eden_present", error, browser);
    console.error(error);
    process.exitCode = 1;
  } finally {
    await browser?.close();
    server.close();
  }
})();
