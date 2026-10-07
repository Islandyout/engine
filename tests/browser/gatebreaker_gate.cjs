// GATEBREAKER M1 (examples/gatebreaker/e-rank-gate.json), the whole E-rank
// Gate in a player build: the prologue panels (skipped with Enter), the
// Ledger awakening, the tutorial (its steps pass on their own in the fast
// variant), rooms 1-3 sealing and opening, the Goblin Chieftain with its
// boss bar, the level-up and the new skill, with zero page errors. The
// variant (props.fast, 1-HP goblins that all close in, a 30-HP Chieftain)
// keeps it short; the hunter walks north swinging, steering back to the
// doorways between rooms (a cleared room sets it just short of the next).
const assert = require("node:assert/strict");
const { saveFailure } = require("./evidence.cjs");
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

(async () => {
  const root = path.resolve("build/site");
  const scene = JSON.parse(await fs.readFile("examples/gatebreaker/e-rank-gate.json", "utf8"));
  for (const entity of scene.entities) {
    const c = entity.components;
    if (entity.name === "Director") c.Script.props.fast = true;
    if (c.Melee && c.Melee.team === 1 && entity.name !== "Training Construct") {
      const hp = entity.name === "Goblin Chieftain" ? 30 : 1;
      c.Health.current = c.Health.maximum = hp;
      // Archers come to the hunter here (their ranged brain has its own unit
      // test), so the bot never has to chase one round a room.
      c.Melee.range = 0;
    }
  }
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
    const hud = async () => (await page.locator("#hud-text").textContent()) ?? "";
    const waitHud = async (pattern, what, timeout = 120000) => {
      try {
        await page.waitForFunction((source) => new RegExp(source).test(document.querySelector("#hud-text")?.textContent ?? ""), pattern.source, { timeout });
      } catch {
        throw new Error(`${what}: HUD never matched ${pattern} -- HUD: ${await hud()}`);
      }
    };
    const seen = new Set();
    const note = async (pattern, tag) => {
      if (seen.has(tag) || !pattern.test(await hud())) return;
      seen.add(tag);
      await page.screenshot({ path: `build/browser-evidence/gatebreaker-gate-${tag}.png` });
    };

    // The prologue: panels, then the Ledger.
    await waitHud(/Panel 1 of 4: Seoul/, "the prologue's first panel");
    await page.screenshot({ path: "build/browser-evidence/gatebreaker-gate-prologue.png" });
    await page.keyboard.press("Enter");
    await waitHud(/THE LEDGER HAS OPENED/, "the Ledger awakens");
    await page.keyboard.press("Enter");
    await waitHud(/Tutorial \d\/6/, "the tutorial starts");
    await waitHud(/Enter the Gate/, "the tutorial completes", 120000);

    // North through the rooms, swinging; then the boss and the rewards.
    // CI's software renderer runs the simulation a few times slower than real
    // time; the whole Gate takes ~10 min locally and up to ~30 there.
    const deadline = Date.now() + 2700000;
    // Walks north along the middle (x = 0), where the doorways are. The
    // camera orbits only when dragged, and keys move the hunter relative to
    // it, so the camera is first dragged to face north (W's measured
    // heading says how far off it is); then A/D line up with the doorway.
    const position = async () => {
      const m = /Player \((-?[\d.]+), -?[\d.]+, (-?[\d.]+)\)/.exec((await page.locator("#status").textContent()) ?? "");
      return m ? { x: Number(m[1]), z: Number(m[2]) } : undefined;
    };
    const hold = async (key, ms) => {
      await page.keyboard.down(key);
      await page.waitForTimeout(ms);
      await page.keyboard.up(key);
    };
    let heading;
    let aligned = false;
    const travel = async () => {
      if (/Locked on/.test(await hud())) {
        await page.keyboard.press("Tab");
        aligned = false;
      }
      const from = await position();
      if (!from) return;
      if (aligned && Math.abs(from.x) > 0.4) {
        await hold(from.x > 0 ? "a" : "d", Math.min(900, 150 + Math.abs(from.x) * 250));
        const after = await position();
        // Pressed against a wall: back off it first.
        if (after && Math.abs(after.x - from.x) < 0.1) await hold("s", 500);
        return;
      }
      await hold("w", aligned ? 2500 : 1000);
      const to = await position();
      if (!to) return;
      const d = { x: to.x - from.x, z: to.z - from.z };
      const length = Math.hypot(d.x, d.z);
      if (length < 0.2) {
        // Blocked: step aside and try again.
        await hold(heading && heading.x > 0 ? "a" : "d", 500);
        aligned = false;
        return;
      }
      heading = { x: d.x / length, z: d.z / length };
      // W runs along the camera's forward (-sin yaw, -cos yaw); north is yaw 0.
      const yaw = Math.atan2(-heading.x, -heading.z);
      if (Math.abs(yaw) > 0.12) {
        // Dragging turns the rig by -dx * 0.005 (default sensitivity).
        const box = await page.locator("#viewport").boundingBox();
        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;
        await page.mouse.move(cx, cy);
        await page.mouse.down({ button: "middle" });
        await page.mouse.move(cx + yaw / 0.005, cy, { steps: 8 });
        await page.mouse.up({ button: "middle" });
        aligned = false;
      } else aligned = true;
    };
    let logged = 0;
    let fightFrom;
    let stalled = 0;
    while (Date.now() < deadline && !/GATE CLEARED|LEVEL UP/.test(await hud())) {
      // Where the hunter is: every 30 s (every 6 s with GATE_DEBUG=1), so a
      // CI failure log shows how far it got.
      if (Date.now() - logged > (process.env.GATE_DEBUG ? 6000 : 30000)) {
        logged = Date.now();
        const text = await hud();
        // The objective is the HUD's last line.
        console.log(JSON.stringify(await position()), aligned, "|", text.slice(text.lastIndexOf(" · ") + 3), "|", /Locked on/.test(text) ? "locked" : "free");
      }
      if (/Go north|Face the Gate|Enter the Gate/.test(await hud())) {
        await travel();
        continue;
      }
      // A fight: lock on and close in, swinging. Stuck against a wall for a
      // few rounds (pushing toward a target it can't reach): drop the lock
      // and back out, alternating sides.
      const here = await position();
      stalled = here && fightFrom && Math.hypot(here.x - fightFrom.x, here.z - fightFrom.z) < 0.1 ? stalled + 1 : 0;
      fightFrom = here;
      if (stalled >= 3) {
        if (/Locked on/.test(await hud())) await page.keyboard.press("Tab");
        await hold("s", 600);
        await hold(stalled % 2 ? "a" : "d", 900);
        continue;
      }
      if (!/Locked on/.test(await hud())) await page.keyboard.press("Tab");
      await page.keyboard.down("w");
      await page.waitForTimeout(700);
      for (let k = 0; k < 3; k++) {
        await page.keyboard.press("j");
        await page.waitForTimeout(120);
      }
      await page.keyboard.up("w");
      await note(/ROOM 1/, "room1");
      await note(/ROOM 3/, "room3");
      await note(/GOBLIN CHIEFTAIN/, "boss");
    }
    for (const tag of ["room1", "room3", "boss"]) assert.ok(seen.has(tag), `passed through ${tag}`);
    await waitHud(/LEVEL UP/, "the level-up");
    await waitHud(/NEW SKILL: SHADOW STEP DASH/, "the new skill");
    await waitHud(/E-RANK GATE: CLEARED/, "the Gate cleared");
    await waitHud(/Q: ready/, "Shadow Step Dash unlocked on Q");
    await page.screenshot({ path: "build/browser-evidence/gatebreaker-gate-cleared.png" });
    assert.deepEqual(errors, []);
    console.log("GATEBREAKER M1: prologue, Ledger, tutorial, rooms 1-3, the Goblin Chieftain and the rewards passed.");
  } catch (error) {
    await saveFailure("gatebreaker_gate", error, browser);
    throw error;
  } finally {
    await browser?.close();
    server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
