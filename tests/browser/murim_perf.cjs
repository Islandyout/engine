// Azure Cloud Sect's render budget (the Stats overlay's triangles and draw calls), so a heavy model or a dense scatter can't
// creep back in unnoticed. The machine behind CI draws in software, so only the counts are checked, never the frame rate.
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
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("dialog", (d) => d.accept());
    await page.addInitScript(() => { Element.prototype.requestPointerLock = () => Promise.resolve(); });
    await page.goto(`http://127.0.0.1:${server.address().port}/engine/`);
    await page.waitForFunction(() => document.querySelector("#runtime")?.textContent === "C++ runtime ready");
    await page.click("#games");
    await page.waitForTimeout(600);
    await page.locator("div,li,article", { has: page.locator("text=Azure Cloud Sect") }).locator("button", { hasText: "Edit" }).last().click();
    await page.waitForFunction(() => Number(((document.querySelector("#status")?.textContent || "").match(/(\d+) entities/) || [])[1] || 0) > 100, null, { timeout: 240000 });
    await page.getByRole("button", { name: "Stats" }).first().click();
    await page.click("#play");
    await page.waitForFunction(() => document.querySelector("#status")?.dataset.mode === "play", null, { timeout: 120000 });
    await page.waitForTimeout(6000);
    const read = () => page.evaluate(() => {
      const el = [...document.querySelectorAll("pre,div")].find((e) => /Draw calls/.test(e.textContent || "") && e.children.length < 3);
      return el ? el.textContent : "";
    });
    const stats = await read();
    const number = (label) => Number((stats.match(new RegExp(label + "\\s+(\\d+)")) || [])[1]);
    const triangles = number("Triangles"), calls = number("Draw calls");
    console.log(`murim perf: ${triangles} triangles, ${calls} draw calls`);
    // Before the low-poly trees this scene drew over five million triangles.
    assert.ok(triangles > 0 && triangles < 1500000, `triangles under budget (${triangles})`);
    assert.ok(calls > 0 && calls < 450, `draw calls under budget (${calls})`);
    assert.deepEqual(errors, [], "no page errors");
    console.log("murim_perf: ok");
  } catch (error) {
    await saveFailure("murim_perf", error, browser);
    console.error(error);
    process.exitCode = 1;
  } finally {
    await browser?.close();
    server.close();
  }
})();
