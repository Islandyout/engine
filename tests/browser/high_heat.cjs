// HIGH HEAT (examples/racing/high-heat.json) end to end in a player build:
// the title screen, free roam toward the first event, then a trimmed first
// event (one checkpoint, no rivals) through countdown, racing HUD, the win
// screen and on to the next event.
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

// The player parked on the first event's marker; the first event cut to one
// lap, no rivals and a single checkpoint 60 m ahead.
function raceVariant(scene) {
  const copy = structuredClone(scene);
  const director = copy.entities.find((e) => e.name === "Director").components.Script;
  const marker = /marker = \{ (-?[\d.]+), (-?[\d.]+) \}/.exec(director.source);
  const [mx, mz] = [Number(marker[1]), Number(marker[2])];
  copy.entities.find((e) => e.name === "Player").components.Transform.position = { x: mx, y: 0.9, z: mz + 6 };
  director.source = director.source.replace(/laps = 2, route = ("[^"]*"), checkpoints = \{[^]*?\}, grid/, (_, route) => {
    return `laps = 1, route = ${route}, checkpoints = { { ${mx + 60}, ${mz} } }, grid`;
  });
  director.source = director.source.replace(/rivals = \{ "Rival Kaze", "Rival Vex", "Rival Nori" \}, police = false/, "rivals = {}, police = false");
  return copy;
}

(async () => {
  const root = path.resolve("build/site");
  const scene = JSON.parse(await fs.readFile("examples/racing/high-heat.json", "utf8"));
  const index = await fs.readFile(path.join(root, "index.html"), "utf8");
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const pathname = url.pathname.replace(/^\/engine\//, "");
    if (pathname === "" || pathname === "index.html") {
      const baked = url.searchParams.get("variant") === "race" ? raceVariant(scene) : scene;
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
          timeout: 150000,
        });
      } catch (error) {
        throw new Error(`${what}: HUD never matched ${pattern} -- HUD: ${await hud(page)} -- status: ${await page.locator("#status").textContent()}`);
      }
    };
    const clickCenter = async (page, dy) => {
      const box = await page.locator("#viewport canvas").first().boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 + dy);
    };

    // Title, then free roam toward the first event with the driving HUD.
    {
      const { page, errors } = await open();
      await waitHud(page, /HIGH HEAT.*DRIVE/, "title");
      assert.ok(!/Resume/.test(await hud(page)), "no pause menu on the title");
      await page.screenshot({ path: "build/browser-evidence/high-heat-title.png" });
      await clickCenter(page, -20); // DRIVE
      await waitHud(page, /Drive to the marker: Downtown Circuit/, "free roam");
      await waitHud(page, /km\/h.*gear 1.*nitro 100%/, "driving HUD");
      await page.keyboard.down("KeyW");
      await waitHud(page, /[1-9]\d* km\/h/, "the car accelerates");
      await page.keyboard.up("KeyW");
      await page.screenshot({ path: "build/browser-evidence/high-heat-roam.png" });
      assert.deepEqual(errors, []);
      await page.close();
    }

    // A race: countdown with the car held, GO, the checkpoint, the win screen,
    // and Continue to the next event.
    {
      const { page, errors } = await open("race");
      await waitHud(page, /DRIVE/, "race title");
      await clickCenter(page, -20);
      await waitHud(page, /Downtown Circuit\s+-\s+1 laps|DOWNTOWN CIRCUIT/, "the event starts on its marker");
      await waitHud(page, /\b3\b|\b2\b|\b1\b/, "countdown");
      await page.keyboard.down("KeyW");
      await waitHud(page, /POS 1\/1/, "racing HUD");
      await waitHud(page, /1ST PLACE/, "the checkpoint finishes the race");
      await page.keyboard.up("KeyW");
      assert.match(await hud(page), /Time \d:\d\d\.\d\d/);
      await page.screenshot({ path: "build/browser-evidence/high-heat-win.png" });
      await clickCenter(page, 64); // CONTINUE
      await waitHud(page, /Drive to the marker: Harbor Sprint/, "on to the next event");
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log("HIGH HEAT: title, free roam with the driving HUD, a race through countdown to the win screen, and progression passed.");
  } finally {
    await browser?.close();
    server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
