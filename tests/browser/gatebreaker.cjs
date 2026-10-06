// GATEBREAKER M0 (examples/gatebreaker/m0.json) in a player build, served the
// way tools/export_build.mjs bakes a scene in: the Manhwa render compiles
// cleanly, the fighter HUD comes up, the goblin closes in and lands blows on
// an idle hunter, and the hunter's twin daggers string a combo with the new
// controls (Tab to lock on, click to attack).
const assert = require("node:assert/strict");
const { saveFailure } = require("./evidence.cjs");
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

(async () => {
  const root = path.resolve("build/site");
  const scene = JSON.parse(await fs.readFile("examples/gatebreaker/m0.json", "utf8"));
  const index = await fs.readFile(path.join(root, "index.html"), "utf8");
  const server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url, "http://localhost").pathname.replace(/^\/engine\//, "");
    if (pathname === "" || pathname === "index.html") {
      const text = JSON.stringify(scene).replace(/</g, "\\u003c");
      res.setHeader("Content-Type", "text/html");
      res.end(index.replace("</body>", () => `<script type="application/json" id="exported-scene">${text}</script>\n</body>`));
      return;
    }
    const file = path.resolve(root, pathname);
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(404).end();
      return;
    }
    try {
      res.setHeader("Content-Type", { ".js": "text/javascript", ".css": "text/css", ".glb": "model/gltf-binary" }[path.extname(file)] || "text/plain");
      res.end(await fs.readFile(file));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  let browser;
  try {
    browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
    await fs.mkdir("build/browser-evidence", { recursive: true });
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    // Shader compile failures surface as console errors; the browser's own
    // favicon request is not the build's.
    page.on("console", (message) => {
      if (message.type() === "error" && !message.location().url.endsWith("/favicon.ico")) errors.push(message.text());
    });
    await page.addInitScript(() => {
      Element.prototype.requestPointerLock = function () {
        return Promise.resolve();
      };
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/engine/`);
    await page.waitForFunction(() => /^PLAY/.test(document.querySelector("#status")?.textContent ?? ""), null, { timeout: 120000 });
    const hud = () => page.locator("#hud-text").textContent();
    const health = async () => Number(/Health (\d+)%/.exec((await hud()) ?? "")?.[1] ?? NaN);
    await page.waitForFunction(() => /Health \d+%/.test(document.querySelector("#hud-text")?.textContent ?? ""), null, { timeout: 60000 });
    assert.equal(await health(), 100, "the hunter starts at full health");

    // Idle: the goblin crosses the room and hits.
    await page.waitForFunction(() => {
      const match = /Health (\d+)%/.exec(document.querySelector("#hud-text")?.textContent ?? "");
      return match && Number(match[1]) < 100;
    }, null, { timeout: 120000 });

    // Lock on and attack: a combo lands.
    await page.keyboard.press("Tab");
    let combo = false;
    for (let i = 0; i < 40 && !combo; i++) {
      await page.keyboard.press("j");
      await page.waitForTimeout(150);
      combo = / hit combo/.test((await hud()) ?? "");
    }
    assert.ok(combo, `the daggers string a combo -- HUD: ${await hud()}`);
    await page.screenshot({ path: "build/browser-evidence/gatebreaker.png" });
    assert.deepEqual(errors, []);
    console.log("GATEBREAKER M0: the Manhwa render, the goblin closing in, lock-on and a dagger combo passed.");
  } catch (error) {
    await saveFailure("gatebreaker", error, browser);
    throw error;
  } finally {
    await browser?.close();
    server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
