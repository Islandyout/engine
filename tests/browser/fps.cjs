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
    // Counts positional sources and started buffer sources (synthesized
    // voices use noise buffers) without changing the app.
    await page.addInitScript(() => {
      window.__panners = 0;
      window.__sources = 0;
      const createPanner = BaseAudioContext.prototype.createPanner;
      BaseAudioContext.prototype.createPanner = function (...args) {
        window.__panners++;
        return createPanner.apply(this, args);
      };
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...args) {
        window.__sources++;
        return start.apply(this, args);
      };
    });
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
      value: { loadout: "rifle: model=rifle mode=auto rpm=600 damage=40 mag=30 reserve=60 reload=0.8 spread=0.5 recoil=0 equip=0\npistol: model=pistol\n" },
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

    // F62: a guarding soldier with a rifle spots the player, shoots them
    // (Health drops), and dies to return fire; on_kill reaches a
    // scorekeeper script.
    const soldier = await run({ command: "spawn_entity", name: "Soldier", transform: [0, 0.9, -12] });
    await run({ command: "set_component", entity: soldier.entity, type: "Scale", value: { value: { x: 0.7, y: 1.8, z: 0.7 } } });
    await run({ command: "set_component", entity: soldier.entity, type: "Health", value: { current: 60, maximum: 60 } });
    await run({
      command: "set_component",
      entity: soldier.entity,
      type: "Weapons",
      value: { loadout: "rifle: model=rifle mode=auto rpm=400 damage=4 mag=30 reserve=90 equip=0\n" },
    });
    await run({
      command: "set_component",
      entity: soldier.entity,
      type: "AICombat",
      value: {
        team: 1, behavior: "Guard", patrol: "", sightRange: 40, fov: 120, hearingRange: 30, reactionTime: 0.3,
        accuracy: 0.9, preferredRange: 30, moveSpeed: 0.01, burst: 4, burstPause: 0.5, useCover: false, fleeHealth: 0,
        meleeDamage: 12,
      },
    });
    const keeper = await run({ command: "spawn_entity", name: "Scorekeeper", transform: [20, -40, 20] });
    await run({
      command: "set_component",
      entity: keeper.entity,
      type: "Script",
      value: { source: "function on_kill(victim, attacker) ui.set_text('KillText', victim .. ' down by ' .. attacker) end", props: {} },
    });
    await page.click("#play");
    await page.waitForFunction(() => /Health (\d+)/.test(document.querySelector("#hud-text").textContent));
    await page.waitForFunction(
      () => Number(document.querySelector("#hud-text").textContent.match(/Health (\d+)/)?.[1] ?? 100) < 100,
      null,
      { timeout: 20000 },
    );
    await page.screenshot({ path: "build/browser-evidence/f62-combat-ai.png" });
    await page.mouse.move(cx, cy);
    await page.mouse.down({ button: "left" });
    await page.waitForFunction(() => document.querySelector("#hud-text").textContent.includes("Soldier down by Hero"), null, {
      timeout: 20000,
    });
    await page.mouse.up({ button: "left" });
    await page.evaluate(() => document.exitPointerLock());
    await page.click("#stop");

    // F63: Terrain. A flat terrain raised to y = 2 replaces the ground plane
    // under the player (they stand on it at 2.9); in Edit mode the Sculpt
    // tool's Raise brush paints offsets into Terrain.sculpt in one undoable
    // stroke.
    const land = await run({ command: "spawn_entity", name: "Land", transform: [0, 2, 0] });
    await run({
      command: "set_component",
      entity: land.entity,
      type: "Terrain",
      value: {
        size: 80, resolution: 33, height: 0, seed: 1, frequency: 1.5, octaves: 4, sculpt: "",
        grassColor: { x: 0.33, y: 0.48, z: 0.2 }, rockColor: { x: 0.42, y: 0.4, z: 0.38 },
        sandColor: { x: 0.76, y: 0.7, z: 0.5 }, snowColor: { x: 0.95, y: 0.96, z: 1 },
        sandHeight: -2.5, snowHeight: 9, rockSlope: 0.82, scatter: "46 0.002 1 1 0.5 collide\n",
      },
    });
    await page.click("#play");
    await page.waitForFunction(() => {
      const match = document.querySelector("#status").textContent.match(/Player \(([-\d.]+), ([-\d.]+), ([-\d.]+)\)/);
      return match && Math.abs(Number(match[2]) - 2.9) < 0.05;
    });
    await page.screenshot({ path: "build/browser-evidence/f63-terrain-play.png" });
    await page.click("#stop");
    await page.locator(".entity").filter({ hasText: "Land" }).first().click();
    const sculptField = page.locator('[aria-label="Terrain.sculpt"]');
    assert.equal(await sculptField.inputValue(), "");
    assert.equal(await page.locator("#sculpt-bar").isVisible(), true, "the sculpt tool shows for a selected terrain");
    await page.locator("#sculpt").selectOption("raise");
    const center = await viewport();
    await page.mouse.move(center.cx, center.cy);
    await page.mouse.down({ button: "left" });
    await page.mouse.move(center.cx + 40, center.cy, { steps: 8 });
    await page.mouse.up({ button: "left" });
    await page.waitForFunction(() => document.querySelector('[aria-label="Terrain.sculpt"]')?.value !== "");
    await page.screenshot({ path: "build/browser-evidence/f63-terrain-sculpt.png" });
    await page.locator("#undo").click();
    await page.locator(".entity").filter({ hasText: "Land" }).first().click();
    assert.equal(await page.locator('[aria-label="Terrain.sculpt"]').inputValue(), "", "undo removes the stroke");
    await page.locator("#sculpt").selectOption("off");

    // F64: audio. A script's sound.play_at makes a positional (panned)
    // source, the mix comes from AudioSettings, and walking plays footsteps.
    const mix = await run({ command: "spawn_entity", name: "Mix", transform: [30, -40, 30] });
    await run({ command: "attach_component", entity: mix.entity, type: "AudioSettings" });
    await run({
      command: "set_component",
      entity: mix.entity,
      type: "Script",
      value: { source: "function on_start() sound.play_at('sfx:explosion', 5, 3, 5) sound.volume('music', 0.5) end", props: {} },
    });
    const pannersBefore = await page.evaluate(() => window.__panners);
    await page.click("#play");
    await page.waitForFunction((before) => window.__panners > before, pannersBefore);
    await page.waitForTimeout(400);
    const sourcesBefore = await page.evaluate(() => window.__sources);
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(1500);
    await page.keyboard.up("KeyW");
    assert.ok(
      (await page.evaluate(() => window.__sources)) >= sourcesBefore + 3,
      "walking plays footsteps (each one starts noise sources)",
    );
    await page.click("#stop");

    // F65: PostProcessing (SMAA, grading, vignette; AO stays off here because
    // software rendering in CI is slow) renders through Play without errors.
    await run({
      command: "set_component",
      entity: mix.entity,
      type: "PostProcessing",
      value: {
        antialias: "SMAA", ambientOcclusion: false, aoRadius: 0.5, aoIntensity: 1, bloom: 0.5, bloomRadius: 0.5,
        bloomThreshold: 0.8, exposure: 1.1, contrast: 0.1, saturation: 0.1, temperature: 0.2, vignette: 0.4, grain: 0.05,
        shadowQuality: "High",
      },
    });
    await page.click("#play");
    await page.waitForTimeout(1500);
    await page.screenshot({ path: "build/browser-evidence/f65-post-processing.png" });
    await page.click("#stop");

    assert.deepEqual(errors, []);
    console.log(
      "FPS browser: first-person CharacterController (camera, look, walk, step climbing) and weapons (hold-to-fire kill with on_death, reload from reserve, switching, HUD) and combat AI (a soldier spots and shoots the player, dies to return fire, on_kill) and terrain (standing on it, sculpting with undo) and audio (positional play_at, mixer settings, footsteps) and post-processing passed.",
    );
  } finally {
    if (browser) await browser.close();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
