// The Pale Signal engine slice (examples/space/pale-signal.json) in a player
// build: the title, the ship landed at Kestra Station with the flight HUD,
// a hover on the belly thrusters and a set-down, stepping out onto Tethys,
// and (in a variant that starts on foot at the ruin) scanning the monolith.
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

// Landed on the moon Vell beside the relay, far from the authored site.
function vellVariant(scene) {
  const copy = structuredClone(scene);
  const director = copy.entities.find((e) => e.name === "Director").components.Script;
  director.source = director.source.replace('banner("TETHYS -- KESTRA STATION", 4)', 'banner("TETHYS -- KESTRA STATION", 4) space.place_landed("Vell", -12.02, 35.03, 40)');
  return copy;
}

// On foot beside the Talari ruin's monolith, the ship left on the pad.
function ruinVariant(scene) {
  const copy = structuredClone(scene);
  const director = copy.entities.find((e) => e.name === "Director").components.Script;
  const ruin = /local RUIN = \{(-?[\d.]+), (-?[\d.]+), (-?[\d.]+)\}/.exec(director.source);
  const [x, z] = [Number(ruin[1]), Number(ruin[3])];
  const player = copy.entities.find((e) => e.name === "Player").components;
  player.Transform.position = { x: x + 3, y: 1, z: z + 3 };
  // Facing the monolith (yaw 0 faces +z; this faces -x -z).
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

    // Landed at Kestra: the title, the flight HUD, a hover and a set-down,
    // then out of the ship.
    {
      const { page, errors } = await open();
      await waitHud(page, /PALE SIGNAL.*BEGIN/, "title");
      await waitHud(page, /ALT 0 m.*FUEL 45%.*LANDED/, "landed flight HUD");
      await clickCenter(page, -10); // BEGIN
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
      await waitHud(page, /Survey Kestra/, "stepping out starts the survey");
      await waitHud(page, /AIR: AMBIENT INTAKE/, "Tethys' air is breathable");
      await page.keyboard.up("KeyE");
      await waitHud(page, /E board ship/, "the boarding prompt beside the ship");
      await page.screenshot({ path: "build/browser-evidence/pale-signal-eva.png" });
      assert.deepEqual(errors, []);
      await page.close();
    }

    // On foot at the ruin: holding F scans the Black Foundation through the
    // engine's scanner, which pays research and teaches the language.
    {
      const { page, errors } = await open("ruin");
      await waitHud(page, /BEGIN/, "ruin title");
      await clickCenter(page, -10);
      await waitHud(page, /Survey Kestra/, "survey objective");
      await page.keyboard.down("KeyF");
      await waitHud(page, /SCAN Black Foundation|Black Foundation \(catalogued\)/, "the scanner locks on");
      await waitHud(page, /RESEARCH 12 RP/, "the scan completes and pays research");
      await page.keyboard.up("KeyF");
      assert.match(await hud(page), /TALARI LANGUAGE 6%/);
      await page.screenshot({ path: "build/browser-evidence/pale-signal-ruin.png" });
      assert.deepEqual(errors, []);
      await page.close();
    }
    // Walking anywhere: landed on Vell, far from Kestra, step out onto the
    // moon; the suit's oxygen runs down in vacuum.
    {
      const { page, errors } = await open("vell");
      await waitHud(page, /BEGIN/, "vell title");
      await clickCenter(page, -10);
      await waitHud(page, /LANDED/, "landed on Vell");
      await page.keyboard.down("KeyE");
      await waitHud(page, /SUIT O2 \d+%/, "on foot on an airless moon");
      await page.keyboard.up("KeyE");
      await page.screenshot({ path: "build/browser-evidence/pale-signal-vell.png" });
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log("Pale Signal: title, landed flight HUD, hover and set-down, stepping out, scanning the ruin, and walking on Vell passed.");
  } finally {
    await browser?.close();
    server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
