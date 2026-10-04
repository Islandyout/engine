// Pale Signal (examples/space/pale-signal.json) in a player build: the
// title, the ship landed at Kestra Station with the flight HUD, a hover and
// a set-down, stepping out onto Tethys with the suit on its reserve, the
// interaction prompt and the journal, sampling the air by looking up, and
// saving and continuing; then (variants) scanning the Vey Gate foundation on
// foot, and walking on Vell where the cold wears the suit.
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

// Landed on the moon Vell beside the relay, far from Kestra.
function vellVariant(scene) {
  const copy = structuredClone(scene);
  const director = copy.entities.find((e) => e.name === "Director").components.Script;
  director.source = director.source.replace('banner("TETHYS -- KESTRA STATION", 4)', 'banner("TETHYS -- KESTRA STATION", 4) space.place_landed("Vell", -12.02, 35.03, 40)');
  return copy;
}

// On foot beside the Vey Gate foundation, the ship left on the pad.
function ruinVariant(scene) {
  const copy = structuredClone(scene);
  const core = copy.entities.find((e) => e.name === "Ruin Core").components.Transform.position;
  const player = copy.entities.find((e) => e.name === "Player").components;
  player.Transform.position = { x: core.x + 3, y: 1, z: core.z + 3 };
  // Facing the foundation (yaw 0 faces +z; this faces -x -z).
  player.Rotation = { euler: { x: 0, y: -2.356, z: 0 } };
  copy.entities.find((e) => e.name === "Ship").components.Spaceship.startPiloting = false;
  return copy;
}

(async () => {
  const root = path.resolve("build/site");
  const scene = JSON.parse(await fs.readFile("examples/space/pale-signal.json", "utf8"));
  const index = await fs.readFile(path.join(root, "index.html"), "utf8");
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const pathname = url.pathname.replace(/^\/engine\//, "");
    if (pathname === "" || pathname === "index.html") {
      const variant = url.searchParams.get("variant");
      const baked = variant === "ruin" ? ruinVariant(scene) : variant === "vell" ? vellVariant(scene) : scene;
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
    // Each variant gets its own context (its own saved game); `context`
    // reuses one to test continuing.
    const open = async (variant, context) => {
      context ??= await browser.newContext({ viewport: { width: 800, height: 520 } });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.addInitScript(() => {
        Element.prototype.requestPointerLock = function () {
          return Promise.resolve();
        };
      });
      await page.goto(`http://127.0.0.1:${server.address().port}/engine/${variant ? `?variant=${variant}` : ""}`);
      return { page, errors, context };
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

    // Landed at Kestra: the title, the flight HUD, a hover and a set-down,
    // then out of the ship onto the suit's reserve.
    let saved;
    {
      const { page, errors, context } = await open();
      saved = context;
      await waitHud(page, /PALE SIGNAL.*BEGIN/, "title");
      await waitHud(page, /ALT 0 m.*FUEL 55%.*LANDED/, "landed flight HUD");
      await clickCenter(page, -20); // BEGIN
      await waitHud(page, /Step out onto Tethys/, "first objective");
      await page.keyboard.down("Space");
      await waitHud(page, /ALT [3-9]\d* m.*FLYING/, "the belly thrusters lift the ship");
      await page.keyboard.up("Space");
      await page.screenshot({ path: "build/browser-evidence/pale-signal-hover.png" });
      await page.keyboard.down("KeyC");
      await waitHud(page, /LANDED/, "sinking sets the ship down");
      await page.keyboard.up("KeyC");
      assert.doesNotMatch(await hud(page), /ROUGH/, "a gentle set-down is clean");
      await page.keyboard.down("KeyE");
      await waitHud(page, /Verify the atmosphere/, "stepping out asks for an air sample");
      await page.keyboard.up("KeyE");
      await waitHud(page, /SUIT O2 RESERVE \d+%/, "the suit runs on its reserve until the air is verified");
      await waitHud(page, /E {2}Board the ship/, "the interaction prompt beside the ship");
      await waitHud(page, /SUIT INTEGRITY 100%.*VITALS 100%/, "suit integrity and vitals");
      // The journal panel.
      await page.keyboard.press("KeyJ");
      await waitHud(page, /FIELD JOURNAL/, "J opens the journal");
      await page.keyboard.press("KeyJ");
      // Look up into the sky and hold F: the air sample.
      const box = await page.locator("#viewport canvas").first().boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - i * 20);
      await page.mouse.up();
      await page.keyboard.down("KeyF");
      await waitHud(page, /SCAN Atmosphere/, "looking up targets the sky");
      await waitHud(page, /AIR: AMBIENT INTAKE/, "the verified air switches to ambient intake");
      await page.keyboard.up("KeyF");
      await waitHud(page, /Survey Kestra/, "the survey begins");
      await page.screenshot({ path: "build/browser-evidence/pale-signal-eva.png" });
      // Pause, open Settings (0.75.0: mouse steering and music volume).
      await page.keyboard.press("KeyP");
      await page.waitForTimeout(1500);
      await clickCenter(page, 0);
      await page.waitForSelector("#player-settings", { timeout: 60000 });
      const settings = await page.locator("#player-settings").textContent();
      assert.match(settings, /Mouse while flying/);
      assert.match(settings, /Music/);
      await page.locator("#player-settings button", { hasText: "Done" }).click();
      await clickCenter(page, -50); // Resume
      assert.deepEqual(errors, []);
      await page.close();
    }
    // The expedition saved: a new page offers to continue it.
    {
      const { page, errors } = await open(undefined, saved);
      await waitHud(page, /PALE SIGNAL.*CONTINUE/, "the title offers CONTINUE");
      await clickCenter(page, -20);
      await waitHud(page, /EXPEDITION RESUMED|Survey Kestra/, "continuing restores the expedition");
      assert.deepEqual(errors, []);
      await page.close();
      await saved.close();
    }

    // On foot at Old Vey Gate: holding F scans the foundation through the
    // engine's scanner, which pays research and teaches the language.
    {
      const { page, errors, context } = await open("ruin");
      await waitHud(page, /BEGIN/, "ruin title");
      await clickCenter(page, -20);
      await waitHud(page, /Verify the atmosphere/, "on foot from the start");
      await page.keyboard.down("KeyF");
      await waitHud(page, /SCAN Vey Gate Foundation|Vey Gate Foundation \(catalogued\)/, "the scanner locks on");
      await waitHud(page, /RESEARCH 12 RP/, "the scan completes and pays research");
      await page.keyboard.up("KeyF");
      assert.match(await hud(page), /TALARI 5%/);
      await page.screenshot({ path: "build/browser-evidence/pale-signal-ruin.png" });
      assert.deepEqual(errors, []);
      await page.close();
      await context.close();
    }
    // Walking anywhere: landed on Vell, far from Kestra, step out onto the
    // moon; oxygen runs down in vacuum and the cold wears the suit.
    {
      const { page, errors, context } = await open("vell");
      await waitHud(page, /BEGIN/, "vell title");
      await clickCenter(page, -20);
      await waitHud(page, /LANDED/, "landed on Vell");
      await page.keyboard.down("KeyE");
      await waitHud(page, /SUIT O2 RESERVE \d+%/, "on foot on an airless moon");
      await page.keyboard.up("KeyE");
      await waitHud(page, /SUIT INTEGRITY \d+% · CRYO/, "Vell's cold is a hazard");
      await page.screenshot({ path: "build/browser-evidence/pale-signal-vell.png" });
      assert.deepEqual(errors, []);
      await page.close();
      await context.close();
    }
    console.log("Pale Signal: title, flight HUD, hover and set-down, stepping out on the suit reserve, the prompt and journal, the air sample, the settings panel, save and continue, scanning the Vey Gate foundation, and walking on Vell passed.");
  } finally {
    await browser?.close();
    server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
