// Eden (games/my-games/eden, published as build/site/eden.html) in a real browser: the garden loads, the page runs for a while with no
// console errors or uncaught exceptions, its people exist, and they move (in the mind and as bodies on screen). A person made with the
// Creator tab's form joins them. Software GL is slow, so the checks wait on conditions with generous limits instead of fixed sleeps.
//
// The page offers its debug hooks (window.edenDebug and others) only to the desktop app, so the test identifies itself as that.
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");
const { saveFailure } = require("./evidence.cjs");

const RUN_MS = Number(process.env.EDEN_TEST_SECONDS ?? 40) * 1000;

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

    // The garden loads: the Eden panel is up and the minds have people.
    await page.waitForSelector(".eden-panel");
    await page.waitForFunction(() => typeof window.edenDebug === "function" && window.edenDebug().length >= 2, null, { timeout: 180000 });
    const people = () => page.evaluate(() => window.edenDebug());
    const before = await people();
    const names = before.map((p) => p.name);
    assert.ok(names.includes("Adam") && names.includes("Eve"), `Adam and Eve are in the garden (found ${names.join(", ")})`);
    for (const p of before) {
      assert.ok(Number.isFinite(p.mind[0]) && Number.isFinite(p.mind[1]), `${p.name} has a place in the world`);
      assert.ok(p.body && p.body.every(Number.isFinite), `${p.name} has a body on screen`);
    }

    // Run it faster for a while: nobody should stand still for ever, and nothing should throw.
    await page.evaluate(() => [...document.querySelectorAll(".eden-panel button")].find((b) => b.textContent === "30×").click());
    await page.waitForTimeout(RUN_MS);
    const after = await people();
    const travelled = after.map((p, i) => {
      const was = before.find((q) => q.name === p.name) ?? before[i];
      return { name: p.name, mind: Math.hypot(p.mind[0] - was.mind[0], p.mind[1] - was.mind[1]), body: Math.hypot(p.body[0] - was.body[0], p.body[2] - was.body[2]) };
    });
    assert.ok(travelled.some((t) => t.mind > 1), `someone moved in the mind: ${JSON.stringify(travelled)}`);
    assert.ok(travelled.some((t) => t.body > 1), `someone moved on screen: ${JSON.stringify(travelled)}`);
    const header1 = await page.locator(".eden-panel").first().textContent();
    assert.ok(/Eden · (spring|summer|autumn|winter) · \d\d:\d\d/i.test(header1), `the panel shows season and time: ${header1.slice(0, 80)}`);

    // The people form in the Creator tab makes a new person.
    await page.evaluate(() => [...document.querySelectorAll(".eden-panel button")].find((b) => b.textContent === "Creator").click());
    await page.fill('input[aria-label="New person\'s name"]', "Dinah");
    await page.evaluate(() => [...document.querySelectorAll(".eden-panel button")].find((b) => b.textContent === "Make person").click());
    await page.waitForFunction(() => window.edenDebug().some((p) => p.name === "Dinah"), null, { timeout: 120000 });
    assert.ok((await people()).length > before.length, "a person made with the form joins the garden");

    assert.deepEqual(errors, [], `no console errors or exceptions: ${errors.slice(0, 5).join(" | ")}`);
    console.log(`Eden browser test passed: ${after.length} people, ${travelled.map((t) => `${t.name} ${t.mind.toFixed(1)} m`).join(", ")}`);
  } catch (error) {
    await saveFailure("eden", error, browser);
    console.error(error);
    process.exitCode = 1;
  } finally {
    await browser?.close();
    server.close();
  }
})();
