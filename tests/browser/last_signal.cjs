// LAST SIGNAL (examples/fps/last-signal.json) end to end in a player build:
// the title screen, deploying, the pause menu, then the whole mission flow
// (sabotage -> uplink -> extraction -> mission complete) on a trimmed copy of
// the level, served the way tools/export_build.mjs bakes a scene in.
const assert = require("node:assert/strict");
const { saveFailure } = require("./evidence.cjs");
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

// The flow variant: no enemies, one generator (1 HP) in front of a player
// standing at the uplink, a 2 s upload and the landing zone moved onto the
// uplink, so every phase runs in a few seconds.
function flowVariant(scene) {
  const copy = structuredClone(scene);
  const named = (name) => copy.entities.find((e) => e.name === name);
  const pad = named("Uplink").components.Transform.position.y - 0.8;
  copy.entities = copy.entities.filter(
    (e) => !e.components.AICombat && e.name !== "Generator A" && e.name !== "Generator B",
  );
  named("Player").components.Transform.position = { x: 0, y: pad + 1, z: -10 };
  const generator = named("Generator C").components;
  generator.Transform.position = { x: 0, y: pad + 1, z: -13 };
  generator.Health = { current: 1, maximum: 1 };
  const director = named("Director").components.Script;
  director.source = director.source
    .replace(/local UPLINK_SECONDS = \d+/, "local UPLINK_SECONDS = 2")
    .replace(/local LZ = \{[^}]*\}/, `local LZ = { 0, ${pad}, -10 }`);
  return copy;
}

(async () => {
  const root = path.resolve("build/site");
  const scene = JSON.parse(await fs.readFile("examples/fps/last-signal.json", "utf8"));
  const index = await fs.readFile(path.join(root, "index.html"), "utf8");
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const pathname = url.pathname.replace(/^\/engine\//, "");
    if (pathname === "" || pathname === "index.html") {
      const baked = url.searchParams.get("variant") === "flow" ? flowVariant(scene) : scene;
      const text = JSON.stringify(baked).replace(/</g, "\\u003c");
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
      res.setHeader(
        "Content-Type",
        { ".js": "text/javascript", ".css": "text/css", ".glb": "model/gltf-binary" }[path.extname(file)] || "text/plain",
      );
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
    const open = async (variant) => {
      const page = await browser.newPage({ viewport: { width: 800, height: 520 } });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      // Headless shells blur the window on pointer lock, which stalls rAF.
      await page.addInitScript(() => {
        Element.prototype.requestPointerLock = function () {
          return Promise.resolve();
        };
      });
      await page.goto(`http://127.0.0.1:${server.address().port}/engine/${variant ? `?variant=${variant}` : ""}`);
      return { page, errors };
    };
    const hud = (page) => page.locator("#hud-text").textContent();
    const waitHud = async (page, pattern, what) => {
      try {
        await page.waitForFunction((source) => new RegExp(source).test(document.querySelector("#hud-text")?.textContent ?? ""), pattern.source, {
          timeout: 120000,
        });
      } catch (error) {
        throw new Error(`${what}: HUD never matched ${pattern} -- HUD: ${await hud(page)} -- status: ${await page.locator("#status").textContent()}`);
      }
    };
    const clickCenter = async (page, dy) => {
      const box = await page.locator("#viewport canvas").first().boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 + dy);
    };

    // Title screen: paused, with the briefing, difficulty and Deploy.
    {
      const { page, errors } = await open();
      await waitHud(page, /LAST SIGNAL.*Difficulty: VETERAN.*DEPLOY/, "title");
      const text = await hud(page);
      assert.ok(!/MISSION|PAUSED/.test(text), `no end screen or pause menu on the title: ${text}`);
      await page.waitForFunction(() => /PAUSE/.test(document.querySelector("#status").textContent));
      await page.screenshot({ path: "build/browser-evidence/last-signal-title.png" });
      await clickCenter(page, 44); // Deploy
      await waitHud(page, /Reach the outpost/, "deploy");
      assert.ok(!/DEPLOY/.test(await hud(page)), "the title screen is gone");
      await page.waitForFunction(() => /^PLAY/.test(document.querySelector("#status").textContent));
      // P pauses into the pause menu; Resume returns.
      await page.keyboard.press("p");
      await waitHud(page, /PAUSED.*Resume/, "pause menu");
      await clickCenter(page, -5); // Resume
      await page.waitForFunction(() => /^PLAY/.test(document.querySelector("#status").textContent));
      await page.screenshot({ path: "build/browser-evidence/last-signal-approach.png" });
      assert.deepEqual(errors, []);
      await page.close();
    }

    // The mission flow, phase by phase.
    {
      const { page, errors } = await open("flow");
      await waitHud(page, /DEPLOY/, "flow title");
      await clickCenter(page, 44);
      await waitHud(page, /Destroy the generators\s+2\/3/, "sabotage starts inside the outpost");
      const box = await page.locator("#viewport canvas").first().boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await waitHud(page, /Uploading signal|HOLD THE UPLINK|UPLOAD/, "the last generator starts the uplink");
      await page.mouse.up();
      await waitHud(page, /MISSION COMPLETE/, "upload, extraction and the win screen");
      const text = await hud(page);
      assert.match(text, /Time \d\d:\d\d/);
      assert.match(text, /Play again/);
      await page.screenshot({ path: "build/browser-evidence/last-signal-complete.png" });
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log("LAST SIGNAL: title, deploy, pause menu, sabotage, uplink, extraction and the win screen passed.");
  } catch (error) {
    await saveFailure("last_signal", error, browser);
    throw error;
  } finally {
    await browser?.close();
    server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
