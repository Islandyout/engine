// FPS features (0.60.0+): first-person controller, weapons and combat, run
// against the built editor (build/site) in a fresh browser.
const assert = require("node:assert/strict");
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
  try {
    browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/engine/`);
    await page.waitForFunction(() => document.querySelector("#runtime")?.textContent === "C++ runtime ready");
    await fs.mkdir("build/browser-evidence", { recursive: true });
    const run = async (command) => {
      await page.locator("#json").fill(JSON.stringify(command));
      await page.locator("#command button").click();
      const result = JSON.parse(await page.locator("#log").textContent());
      assert.equal(result.ok, true, JSON.stringify(command) + " -> " + JSON.stringify(result));
      return result;
    };
    const statusMatch = async (pattern) => (await page.locator("#status").textContent()).match(pattern);
    const playerPosition = async () => {
      const match = await statusMatch(/Player \(([-\d.]+), ([-\d.]+), ([-\d.]+)\)/);
      return match ? match.slice(1).map(Number) : undefined;
    };
    const controllerValue = {
      mode: "FirstPerson", walkSpeed: 4.5, sprintSpeed: 7.5, crouchSpeed: 2.2, jumpHeight: 1.1, standHeight: 1.8,
      crouchHeight: 1.1, stepHeight: 0.4, acceleration: 45, airControl: 12, lookSensitivity: 1, invertY: false,
      fov: 75, headBob: 1,
    };
    const viewport = async () => {
      const box = await page.locator("#viewport canvas").first().boundingBox();
      return { cx: box.x + box.width / 2, cy: box.y + box.height / 2 };
    };
    const rightDrag = async (dx, dy) => {
      const { cx, cy } = await viewport();
      await page.mouse.move(cx, cy);
      await page.mouse.down({ button: "right" });
      await page.mouse.move(cx + dx, cy + dy, { steps: 10 });
      await page.mouse.up({ button: "right" });
    };

    // F60: a first-person CharacterController. Play puts the camera at the
    // player's eyes, W walks forward relative to the look direction,
    // right-drag turns it, and a 0.3 step is climbed without jumping.
    const hero = await run({ command: "spawn_entity", name: "Hero", transform: [0, 0.5, 6] });
    await run({ command: "set_component", entity: hero.entity, type: "Player", value: {} });
    await run({ command: "set_component", entity: hero.entity, type: "CharacterController", value: controllerValue });
    const step = await run({ command: "spawn_entity", name: "Step", transform: [0, 0.15, 2] });
    await run({ command: "set_component", entity: step.entity, type: "Scale", value: { value: { x: 6, y: 0.3, z: 3 } } });
    await run({ command: "set_component", entity: step.entity, type: "Collider", value: { type: "AABB" } });
    await page.click("#play");
    await page.waitForFunction(() => /Player \(/.test(document.querySelector("#status").textContent));
    const [, standY] = await playerPosition();
    assert.ok(Math.abs(standY - 0.9) < 0.02, `controller resizes the body to 1.8 tall (center ${standY})`);
    await page.keyboard.down("KeyW");
    await page.waitForFunction(() => {
      const match = document.querySelector("#status").textContent.match(/Player \(([-\d.]+), ([-\d.]+), ([-\d.]+)\)/);
      return match && Number(match[3]) < 2;
    });
    await page.keyboard.up("KeyW");
    await page.waitForTimeout(300);
    const [, onStepY] = await playerPosition();
    assert.ok(Math.abs(onStepY - 1.2) < 0.05, `climbed the 0.3 step (center ${onStepY})`);
    await rightDrag(-700, 0); // about 90 degrees left
    const [beforeX, , beforeZ] = await playerPosition();
    await page.keyboard.down("KeyW");
    await page.waitForFunction(
      (x0) => {
        const match = document.querySelector("#status").textContent.match(/Player \(([-\d.]+), ([-\d.]+), ([-\d.]+)\)/);
        return match && Number(match[1]) < x0 - 1.5;
      },
      beforeX,
      { timeout: 10000 },
    );
    await page.keyboard.up("KeyW");
    const [, , afterZ] = await playerPosition();
    assert.ok(Math.abs(afterZ - beforeZ) < 0.6, `after turning left, W walks toward -x, not z (${beforeZ} -> ${afterZ})`);
    await page.screenshot({ path: "build/browser-evidence/f60-first-person.png" });
    await page.click("#stop");

    // F61: Weapons. Holding fire empties rounds into a target until its
    // script's on_death fires; R reloads; 2 switches to the pistol. The
    // HUD's screen-reader mirror (#hud-text) shows ammo, reload and health.
    const hudText = () => page.locator("#hud-text").textContent();
    await run({
      command: "set_component",
      entity: hero.entity,
      type: "Weapons",
      value: { loadout: "rifle: model=rifle mode=auto rpm=600 damage=40 mag=30 reserve=60 reload=0.8 spread=0.5 equip=0\npistol: model=pistol\n" },
    });
    await run({ command: "set_component", entity: hero.entity, type: "Health", value: { current: 100, maximum: 100 } });
    const target = await run({ command: "spawn_entity", name: "Target", transform: [0, 0.9, -4] });
    await run({ command: "set_component", entity: target.entity, type: "Scale", value: { value: { x: 1.2, y: 1.8, z: 1.2 } } });
    await run({ command: "set_component", entity: target.entity, type: "Health", value: { current: 100, maximum: 100 } });
    await run({
      command: "set_component",
      entity: target.entity,
      type: "Script",
      value: { source: "function on_death(attacker) ui.set_text('KillText', 'target down') end", props: {} },
    });
    const killText = await run({ command: "spawn_entity", name: "KillText" });
    await run({
      command: "set_component",
      entity: killText.entity,
      type: "UI",
      value: { kind: "Text", text: "target up", anchor: "top-left", visibleWhen: "always", action: "pause" },
    });
    await page.click("#play");
    await page.waitForFunction(() => /rifle 30\/60/.test(document.querySelector("#hud-text").textContent));
    assert.match(await hudText(), /Health 100/);
    const { cx, cy } = await viewport();
    await page.mouse.move(cx, cy);
    await page.mouse.down({ button: "left" });
    await page.waitForFunction(() => document.querySelector("#hud-text").textContent.includes("target down"), null, {
      timeout: 15000,
    });
    await page.mouse.up({ button: "left" });
    await page.waitForTimeout(200);
    const [, loaded] = (await hudText()).match(/rifle (\d+)\/60/);
    assert.ok(Number(loaded) < 30 && Number(loaded) >= 20, `a few rounds were spent (${loaded})`);
    await page.screenshot({ path: "build/browser-evidence/f61-weapons.png" });
    await page.keyboard.press("KeyR");
    await page.waitForFunction(() => document.querySelector("#hud-text").textContent.includes("Reloading"));
    await page.waitForFunction(() => /rifle 30\/\d+/.test(document.querySelector("#hud-text").textContent), null, {
      timeout: 10000,
    });
    assert.match(await hudText(), new RegExp(`rifle 30/${60 - (30 - Number(loaded))}`), "reload draws from the reserve");
    await page.keyboard.press("Digit2");
    await page.waitForFunction(() => /pistol 30\/120/.test(document.querySelector("#hud-text").textContent));
    // The viewport click captured the mouse for look; release it like Esc does.
    await page.evaluate(() => document.exitPointerLock());
    await page.click("#stop");

    assert.deepEqual(errors, []);
    console.log(
      "FPS browser: first-person CharacterController (camera, look, walk, step climbing) and weapons (hold-to-fire kill with on_death, reload from reserve, switching, HUD) passed.",
    );
  } finally {
    if (browser) await browser.close();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
