// Third-person shooting (0.87.0): the Combat range starter. The player
// holds each gun in both hands (the hands reach the gun's grip and support
// sockets), aims over the shoulder, swaps shoulders, hits targets through
// the crosshair, and aim assist pulls a gamepad's aim onto a hostile while
// the player setting is on and not when it is off. Staff on the pedestrian
// rig hold guns too. Run against the built editor (build/site).
const assert = require("node:assert/strict");
const { saveFailure } = require("./evidence.cjs");
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");
(async () => {
  const root = path.resolve("build/site");
  const server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url, "http://localhost").pathname.replace(/^\/engine\//, "");
    const file = path.resolve(root, pathname === "" || pathname.endsWith("/") ? pathname + "index.html" : pathname);
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(404).end();
      return;
    }
    try {
      res.setHeader(
        "Content-Type",
        { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".glb": "model/gltf-binary" }[
          path.extname(file)
        ] || "text/plain",
      );
      res.end(await fs.readFile(file));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  let browser;
  let page;
  try {
    browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
    page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    // A scripted gamepad (standard mapping) the test moves, and no real
    // pointer lock (headless shells differ on it).
    await page.addInitScript(() => {
      Element.prototype.requestPointerLock = function () {
        return Promise.resolve();
      };
      const pad = {
        id: "test pad",
        index: 0,
        connected: true,
        mapping: "standard",
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
      };
      window.__pad = pad;
      navigator.getGamepads = () => [pad];
    });
    const port = server.address().port;
    const open = async () => {
      await page.goto(`http://127.0.0.1:${port}/engine/`);
      await page.waitForFunction(() => document.querySelector("#runtime")?.textContent === "C++ runtime ready");
      await page.click("#new");
      page.once("dialog", (dialog) => dialog.accept());
      await page.click('[aria-label="Combat range"]');
      await page.click("#play");
      await page.waitForFunction(() => (document.querySelector("#viewport").dataset.shooter ?? "").split(",")[4] === "pistol-1", null, { timeout: 60000 });
    };
    const shooter = async () => {
      const [yaw, pitch, aim, over, gun, shoulder, hits, kills, device] = (await page.evaluate(() => document.querySelector("#viewport").dataset.shooter)).split(",");
      return { yaw: Number(yaw), pitch: Number(pitch), aim: Number(aim), over: Number(over), gun, shoulder: Number(shoulder), hits: Number(hits), kills: Number(kills), device };
    };
    const guns = async () => {
      const [holding, gap] = (await page.evaluate(() => document.querySelector("#viewport").dataset.guns ?? "0,0")).split(",").map(Number);
      return { holding, gap };
    };
    const pad = (fn) => page.evaluate(fn);
    const stick = (x, y) => page.evaluate(([x, y]) => ((window.__pad.axes[0] = x), (window.__pad.axes[1] = y)), [x, y]);
    const button = (index, down) => page.evaluate(([i, d]) => ((window.__pad.buttons[i].pressed = d), (window.__pad.buttons[i].value = d ? 1 : 0)), [index, down]);
    await fs.mkdir("build/browser-evidence", { recursive: true });

    await open();
    // Everyone with Weapons holds a gun: the player and the two staff on
    // the pedestrian rig. Both hands on it.
    await page.waitForFunction(() => Number((document.querySelector("#viewport").dataset.guns ?? "0").split(",")[0]) >= 3, null, { timeout: 30000 });
    await page.waitForTimeout(500);
    let held = await guns();
    assert.ok(held.gap < 0.08, `hands reach the guns: worst gap ${held.gap} m`);
    await page.screenshot({ path: "build/browser-evidence/combat-range-hip.png" });

    // Target 2 is straight downrange, a little left of the crosshair (the
    // camera is over the right shoulder).
    const before = await shooter();
    assert.equal(before.over, -1, "the crosshair starts beside the target");
    // Aim (left trigger): the camera pulls in over the shoulder, and aim
    // assist's snap brings the crosshair onto the target.
    await button(6, true);
    await page.waitForFunction(() => Number(document.querySelector("#viewport").dataset.shooter.split(",")[2]) > 0.9);
    const snapped = await shooter();
    assert.equal(snapped.device, "gamepad");
    assert.ok(snapped.over >= 0 && snapped.yaw > before.yaw, `aiming snaps onto the target: ${JSON.stringify(before)} -> ${JSON.stringify(snapped)}`);
    held = await guns();
    assert.ok(held.gap < 0.08, `hands on the aimed pistol: ${held.gap} m`);
    await page.screenshot({ path: "build/browser-evidence/combat-range-aim-pistol.png" });
    // Fire (right trigger) until the target drops.
    for (let i = 0; i < 12 && (await shooter()).kills === 0; i++) {
      await button(7, true);
      await page.waitForTimeout(120);
      await button(7, false);
      await page.waitForTimeout(220);
    }
    const fired = await shooter();
    assert.ok(fired.hits > 0 && fired.kills === 1, `shots through the crosshair hit and kill: ${JSON.stringify(fired)}`);
    await page.screenshot({ path: "build/browser-evidence/combat-range-hit.png" });

    // Every gun in the loadout: in both hands, aimed.
    for (const [key, gun] of [["Digit2", "smg-2"], ["Digit3", "rifle-2"], ["Digit4", "shotgun-1"], ["Digit5", "sniper-2"]]) {
      await page.keyboard.press(key);
      await page.waitForFunction((g) => document.querySelector("#viewport").dataset.shooter.split(",")[4] === g, gun, { timeout: 20000 });
      await page.waitForTimeout(900);
      held = await guns();
      assert.ok(held.gap < 0.08, `hands on the ${gun}: ${held.gap} m`);
      await page.screenshot({ path: `build/browser-evidence/combat-range-${gun}.png` });
    }
    await button(6, false);

    // V swaps the shoulder.
    await page.keyboard.press("v");
    assert.equal((await shooter()).shoulder, -1);
    await page.waitForTimeout(600);
    await page.screenshot({ path: "build/browser-evidence/combat-range-left-shoulder.png" });
    await page.click("#stop");

    // With the player's aim assist setting off, aiming leaves the crosshair
    // beside the target.
    await page.evaluate(() => {
      const key = "game-engine-player:settings";
      const settings = JSON.parse(localStorage.getItem(key) ?? "{}");
      localStorage.setItem(key, JSON.stringify({ ...settings, aimAssist: false }));
    });
    await open();
    const unassisted = await shooter();
    await button(6, true);
    await page.waitForFunction(() => Number(document.querySelector("#viewport").dataset.shooter.split(",")[2]) > 0.9);
    const after = await shooter();
    assert.ok(after.over === -1 && Math.abs(after.yaw - unassisted.yaw) < 1e-3, `no snap with assist off: ${JSON.stringify(unassisted)} -> ${JSON.stringify(after)}`);
    await button(6, false);
    await page.click("#stop");

    assert.deepEqual(errors, []);
    console.log("Combat range browser: guns held in both hands (player and pedestrian-rig staff), over-the-shoulder aim, gamepad aim assist snapping onto a hostile, crosshair hits and a kill, every loadout gun, shoulder swap, and aim assist off by setting passed.");
  } catch (error) {
    await saveFailure("combat_range", error, browser);
    console.error(error);
    process.exitCode = 1;
  } finally {
    await browser?.close();
    server.close();
  }
})();
