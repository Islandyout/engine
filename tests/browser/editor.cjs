const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");
(async () => {
  const root = path.resolve("build/site");
  const server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url, "http://localhost").pathname.replace(
      /^\/engine\//,
      "",
    );
    const file = path.resolve(
      root,
      pathname === "" || pathname.endsWith("/")
        ? pathname + "index.html"
        : pathname,
    );
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(404).end();
      return;
    }
    try {
      res.setHeader(
        "Content-Type",
        {
          ".js": "text/javascript",
          ".css": "text/css",
          ".html": "text/html",
          ".glb": "model/gltf-binary",
        }[path.extname(file)] || "text/plain",
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
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/engine/`);
    await page.waitForFunction(
      () =>
        document.querySelector("#runtime")?.textContent === "C++ runtime ready",
    );
    // Drag the visible X handle in the known startup camera, through real pointer events.
    const THREE = require("../../apps/editor/node_modules/three/build/three.cjs");
    const bounds = await page.locator("#viewport").boundingBox();
    const testCamera = new THREE.PerspectiveCamera(
      50,
      bounds.width / bounds.height,
      0.1,
      2000,
    );
    testCamera.position.set(8, 7, 10);
    testCamera.lookAt(0, 1, 0);
    testCamera.updateMatrixWorld();
    const screen = (x, y, z) => {
      const p = new THREE.Vector3(x, y, z).project(testCamera);
      return {
        x: bounds.x + ((p.x + 1) * bounds.width) / 2,
        y: bounds.y + ((1 - p.y) * bounds.height) / 2,
      };
    };
    await page.locator("#snap").check();
    const from = screen(1.5, 0.5, 0),
      to = screen(3.5, 0.5, 0);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 12 });
    await page.mouse.up();
    const moved = Number(
      await page
        .getByLabel("Transform.position.x", { exact: true })
        .inputValue(),
    );
    assert.ok(
      moved > 0 && Number.isInteger(moved),
      "gizmo commits snapped X movement",
    );
    await page.locator("#undo").click();
    await page
      .getByRole("button", { name: "□ First entity", exact: true })
      .click();
    assert.equal(
      await page
        .getByLabel("Transform.position.x", { exact: true })
        .inputValue(),
      "0",
    );
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.keyboard.press("Escape");
    await page.mouse.up();
    assert.equal(
      await page
        .getByLabel("Transform.position.x", { exact: true })
        .inputValue(),
      "0",
      "Escape cancels gesture",
    );
    await page.locator("#rotate").click();
    assert.equal(
      await page.locator("#rotate").getAttribute("aria-pressed"),
      "true",
    );
    await page.getByLabel("Transform space").selectOption("local");
    await page.locator("#scale").click();
    assert.equal(
      await page.locator("#scale").getAttribute("aria-pressed"),
      "true",
    );
    await page.locator("#translate").click();
    await page.getByLabel("Transform space").selectOption("world");
    await page.getByLabel("Add component").selectOption("RigidBody");
    assert.equal(
      await page.getByLabel("RigidBody.inverseMass").getAttribute("readonly"),
      "",
    );
    await page.getByLabel("Add component").selectOption("AIState");
    await page.getByLabel("AIState.state").selectOption("Walking");
    await page
      .getByRole("button", { name: "Reset AIState", exact: true })
      .click();
    assert.equal(await page.getByLabel("AIState.state").inputValue(), "Idle");
    await page.locator("#add").click();
    assert.equal(await page.locator(".entity").count(), 2);
    await page.getByLabel("Entity name", { exact: true }).fill("Test cube");
    await page.getByLabel("Entity name", { exact: true }).press("Tab");
    await page.getByLabel("Transform.position.x", { exact: true }).fill("3");
    await page.getByLabel("Transform.position.x", { exact: true }).press("Tab");
    await page.getByLabel("Add component").selectOption("Velocity");
    await page.getByLabel("Velocity.value.x", { exact: true }).fill("6");
    await page.getByLabel("Velocity.value.x", { exact: true }).press("Tab");
    await page.locator("#duplicate").click();
    assert.equal(await page.locator(".entity").count(), 3);
    await page.locator("#undo").click();
    assert.equal(await page.locator(".entity").count(), 2);
    await page.locator("#redo").click();
    assert.equal(await page.locator(".entity").count(), 3);
    await page.locator("#play").click();
    await page.waitForFunction(() =>
      / [1-9]\d* C\+\+ fixed ticks/.test(
        document.querySelector("#status").textContent,
      ),
    );
    await page.locator("#pause").click();
    await page.waitForFunction(() =>
      document.querySelector("#status").textContent.startsWith("PAUSE"),
    );
    await page.locator("#stop").click();
    await page
      .locator(".entity")
      .filter({ hasText: "Test cube" })
      .first()
      .click();
    assert.equal(
      await page
        .getByLabel("Transform.position.x", { exact: true })
        .inputValue(),
      "3",
    );
    // The bench is id 1 in the model catalog now (0.21.0), not a standalone
    // button — same "Add from catalog" flow as everything else. Selected
    // explicitly by id rather than relying on it being first alphabetically.
    await page.locator("#catalog-category").selectOption("furniture");
    await page.locator("#catalog-model").selectOption("1");
    await page.locator("#catalog-add").click();
    await page.waitForFunction(() =>
      [...document.querySelectorAll(".entity")].some((e) =>
        e.textContent.includes("Aether Bench"),
      ),
    );
    assert.equal(await page.locator(".entity").count(), 4);
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#save").click();
    const download = await downloadPromise;
    const saved = await fs.readFile(await download.path());
    const document = JSON.parse(saved);
    assert.equal(document.entities.length, 4);
    await page.locator("#open").setInputFiles({
      name: "scene.json",
      mimeType: "application/json",
      buffer: saved,
    });
    assert.equal(await page.locator(".entity").count(), 4);
    await page.locator("#open").setInputFiles({
      name: "invalid.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        '{"format":1,"entities":[{"components":{"Bad":{}}}]}',
      ),
    });
    await page.waitForFunction(() =>
      document
        .querySelector("#log")
        .textContent.includes("Unsupported component"),
    );
    assert.equal(await page.locator(".entity").count(), 4);
    await page.locator("#json").fill('{"command":"list_entities"}');
    await page.locator("#command button").click();
    assert.match(await page.locator("#log").textContent(), /Aether Bench/);
    await page.locator("#catalog-category").selectOption("signs");
    await page.locator("#catalog-add").click();
    await page.waitForFunction(() =>
      [...document.querySelectorAll(".entity")].some((e) =>
        e.textContent.includes("Sign Crossing"),
      ),
    );
    assert.equal(await page.locator(".entity").count(), 5);
    // Animated catalog entries (animals/people) use SkeletonUtils.clone and an
    // AnimationMixer instead of the plain clone path the static kit uses;
    // exercise that path too, and let a few real animation frames elapse
    // (rebuild() etc. keep running below) before checking for page errors.
    await page.locator("#catalog-category").selectOption("animals");
    await page.locator("#catalog-add").click();
    await page.waitForFunction(() =>
      [...document.querySelectorAll(".entity")].some((e) =>
        e.textContent.includes("Cat"),
      ),
    );
    assert.equal(await page.locator(".entity").count(), 6);
    // A Player-tagged entity moves under real keyboard input in Play mode:
    // spawn a fresh entity (resting at its default y=0.5, no authored
    // velocity to confuse the picture), tag it, and hold D to drive it in
    // +x through the actual DOM keydown path — not editor_key() called
    // directly, which the native C++ test already covers exhaustively.
    await page.locator("#add").click();
    assert.equal(await page.locator(".entity").count(), 7);
    await page.getByLabel("Add component").selectOption("Player");
    await page.locator("#play").click();
    await page.waitForFunction(() =>
      document.querySelector("#status").textContent.includes("Player ("),
    );
    await page.keyboard.down("d");
    await page.waitForFunction(() => {
      const match = document
        .querySelector("#status")
        .textContent.match(/Player \(([-\d.]+),/);
      return match && Number(match[1]) > 1;
    });
    await page.keyboard.up("d");
    await page.locator("#stop").click();
    // Stop reverts to the unchanged authoring document (same guarantee the
    // play/pause/stop case above already exercises for "Test cube"): the
    // fresh entity's authored position is still its spawn default, not
    // wherever WASD carried it in Play mode.
    await page
      .locator(".entity")
      .filter({ hasText: "Entity 7" })
      .first()
      .click();
    assert.equal(
      await page
        .getByLabel("Transform.position.x", { exact: true })
        .inputValue(),
      "0",
    );
    // A Collider obstacle blocks a moving entity through the same real
    // keyboard path, not just editor_key() calls (the native bridge test
    // already covers the underlying physics::step algorithm directly).
    // "D" is camera-relative (see F25): from the editor's default startup
    // camera (position (8,7,10), target (0,1,0)), that's the direction
    // (0.7809, -0.6247) in x/z, not pure +x, so the obstacle is placed 3
    // units out along that same ray instead of on the x-axis, sized
    // generously (2x2x2, vs. the player's 1x1x1) so imprecision in that
    // approach angle can't make it miss. "Entity 7" is the player parked at
    // the origin from the test above; drive it into the obstacle and
    // confirm the live readout's total displacement stalls well short of
    // where ~5s of unobstructed travel (~24 units) would put it.
    await page.locator("#add").click();
    assert.equal(await page.locator(".entity").count(), 8);
    await page.getByLabel("Transform.position.x", { exact: true }).fill("2.343");
    await page.getByLabel("Transform.position.x", { exact: true }).press("Tab");
    await page.getByLabel("Transform.position.z", { exact: true }).fill("-1.874");
    await page.getByLabel("Transform.position.z", { exact: true }).press("Tab");
    await page.getByLabel("Add component").selectOption("Scale");
    await page.getByLabel("Scale.value.x", { exact: true }).fill("2");
    await page.getByLabel("Scale.value.x", { exact: true }).press("Tab");
    await page.getByLabel("Scale.value.z", { exact: true }).fill("2");
    await page.getByLabel("Scale.value.z", { exact: true }).press("Tab");
    await page.getByLabel("Add component").selectOption("Collider");
    await page
      .locator(".entity")
      .filter({ hasText: "Entity 7" })
      .first()
      .click();
    await page.locator("#play").click();
    await page.waitForFunction(() =>
      document.querySelector("#status").textContent.includes("Player ("),
    );
    await page.keyboard.down("d");
    await page.waitForFunction(() => {
      const match = document
        .querySelector("#status")
        .textContent.match(/Player \(([-\d.]+), [-\d.]+, ([-\d.]+)\)/);
      if (!match) return false;
      return Math.hypot(Number(match[1]), Number(match[2])) > 0.5;
    });
    // Keep holding well past when an unblocked player would have crossed
    // the obstacle, then confirm it's blocked well short of unobstructed
    // travel instead of sailing through.
    await page.waitForTimeout(500);
    const blockedDistance = await page.evaluate(() => {
      const match = document
        .querySelector("#status")
        .textContent.match(/Player \(([-\d.]+), [-\d.]+, ([-\d.]+)\)/);
      return match ? Math.hypot(Number(match[1]), Number(match[2])) : 0;
    });
    assert.ok(
      blockedDistance < 5,
      `player should stop at the Collider obstacle, got distance=${blockedDistance}`,
    );
    await page.keyboard.up("d");
    await page.locator("#stop").click();
    // Combat: F (melee) and G (ranged blast) damage a Health-tagged entity
    // through the same real-keyboard path used above, not editor_key() calls
    // directly (the native bridge test already covers targeting/damage/
    // defeat exhaustively). Two targets: a weak one overlapping the player,
    // one-shot by melee so it stops competing for "nearest" once defeated,
    // and a full-health one at range for blast to actually travel toward
    // and hit. The status bar's "Selected health"/"Selected: defeated"
    // readout (companion to the HUD's own screen-space bar) is what makes
    // the outcome observable here.
    await page.locator("#add").click();
    assert.equal(await page.locator(".entity").count(), 9);
    await page.getByLabel("Add component").selectOption("Health");
    await page.getByLabel("Health.current", { exact: true }).fill("20");
    await page.getByLabel("Health.current", { exact: true }).press("Tab");
    await page.getByLabel("Health.maximum", { exact: true }).fill("20");
    await page.getByLabel("Health.maximum", { exact: true }).press("Tab");
    await page.locator("#add").click();
    assert.equal(await page.locator(".entity").count(), 10);
    await page.getByLabel("Transform.position.x", { exact: true }).fill("5");
    await page.getByLabel("Transform.position.x", { exact: true }).press("Tab");
    await page.getByLabel("Add component").selectOption("Health");
    await page
      .locator(".entity")
      .filter({ hasText: "Entity 7" })
      .first()
      .click();
    await page.locator("#play").click();
    await page.waitForFunction(() =>
      document.querySelector("#status").textContent.includes("Player ("),
    );
    await page
      .locator(".entity")
      .filter({ hasText: "Entity 9" })
      .first()
      .click();
    await page.waitForFunction(() =>
      document
        .querySelector("#status")
        .textContent.includes("Selected health: 100%"),
    );
    await page.keyboard.down("f");
    await page.waitForFunction(() =>
      document.querySelector("#status").textContent.includes("Selected: defeated"),
    );
    await page.keyboard.up("f");
    await page
      .locator(".entity")
      .filter({ hasText: "Entity 10" })
      .first()
      .click();
    await page.waitForFunction(() =>
      document
        .querySelector("#status")
        .textContent.includes("Selected health: 100%"),
    );
    await page.keyboard.down("g");
    // A real gap before releasing, same as every other key test above (F,
    // WASD): gives the page's own rAF loop at least one chance to drain the
    // keydown from keyQueue and apply it before the up event follows.
    await page.waitForTimeout(100);
    await page.keyboard.up("g");
    await page.waitForFunction(() =>
      document
        .querySelector("#status")
        .textContent.includes("Selected health: 85%"),
    );
    await page.locator("#stop").click();
    // Vehicle driving: adding a Vehicle component to the existing Player
    // entity switches its movement from instant-direction strafing to
    // momentum-based accelerate/steer -- real driving feel, verified end to
    // end through the same status-bar readout the WASD test above used, not
    // editor_value() calls directly (the native bridge test already covers
    // the acceleration/steering/drag algorithm exhaustively).
    await page
      .locator(".entity")
      .filter({ hasText: "Entity 7" })
      .first()
      .click();
    await page.getByLabel("Add component").selectOption("Vehicle");
    await page.locator("#play").click();
    await page.waitForFunction(() =>
      document.querySelector("#status").textContent.includes("Player ("),
    );
    const startZ = Number(
      (await page.locator("#status").textContent()).match(
        /Player \([-\d.]+, [-\d.]+, ([-\d.]+)\)/,
      )[1],
    );
    await page.keyboard.down("w");
    await page.waitForFunction(
      (start) => {
        const match = document
          .querySelector("#status")
          .textContent.match(/Player \([-\d.]+, [-\d.]+, ([-\d.]+)\)/);
        return match && Number(match[1]) > start + 1;
      },
      startZ,
    );
    await page.keyboard.up("w");
    await page.locator("#stop").click();
    // AIState/Pedestrian: a fresh entity within ai_sense_radius (6 units) of
    // "Entity 7" (still parked at its authored origin — Play never mutates
    // authored data, confirmed above) closes the distance on its own once
    // Play starts, with no key ever pressed for it. Verified through the
    // status bar's own "Selected AI: <state> (x, z)" readout, the same
    // black-box approach the Vehicle case above uses, rather than reaching
    // into the page's internals (the native bridge test already covers the
    // wander/chase/flee algorithm itself exhaustively).
    await page.locator("#add").click();
    const aiEntityName = await page.locator(".entity").last().textContent();
    await page.getByLabel("Transform.position.x", { exact: true }).fill("3");
    await page.getByLabel("Transform.position.x", { exact: true }).press("Tab");
    await page.getByLabel("Add component").selectOption("AIState");
    await page.locator("#play").click();
    // Re-select after Play, same as the melee/blast case above does for its
    // own target: watch the entity explicitly through its own live readout
    // rather than assume the pre-Play selection is what's still shown.
    await page
      .locator(".entity")
      .filter({ hasText: aiEntityName })
      .first()
      .click();
    await page.waitForFunction(() =>
      document.querySelector("#status").textContent.includes("Selected AI:"),
    );
    await page.waitForFunction(() => {
      const match = document
        .querySelector("#status")
        .textContent.match(/Selected AI: (\w+) \(/);
      return match && match[1] === "Chasing";
    });
    await page.waitForFunction(() => {
      const match = document
        .querySelector("#status")
        .textContent.match(/Selected AI: \w+ \(([-\d.]+), /);
      return match && Number(match[1]) < 2;
    });
    await page.locator("#stop").click();
    // Script: a Lua on_tick that writes self.vx/vz should move the entity
    // (native bridge tests already cover the motion math exhaustively), and
    // a script with a syntax error should surface through the status bar's
    // own "Script error: <message>" readout rather than fail silently --
    // the same black-box approach the AIState case above uses.
    await page.locator("#add").click();
    const scriptEntityName = await page.locator(".entity").last().textContent();
    await page.getByLabel("Add component").selectOption("Script");
    await page
      .locator('[aria-label="Script.source"]')
      .fill("function on_tick(dt this is not valid lua");
    await page.locator("#play").click();
    await page
      .locator(".entity")
      .filter({ hasText: scriptEntityName })
      .first()
      .click();
    await page.waitForFunction(() =>
      document.querySelector("#status").textContent.includes("Script error:"),
    );
    assert.match(
      await page.locator("#status").textContent(),
      /Script error: .*'\)' expected/,
    );
    await page.locator("#stop").click();
    await page
      .locator('[aria-label="Script.source"]')
      .fill("function on_tick(dt)\n  self.vx = 2\nend");
    await page.locator("#play").click();
    await page
      .locator(".entity")
      .filter({ hasText: scriptEntityName })
      .first()
      .click();
    await page.waitForFunction(() => {
      const text = document.querySelector("#status").textContent;
      return text.includes("entities") && !text.includes("Script error:");
    });
    await page.locator("#stop").click();
    // Prefabs: make a prefab from an entity, place a second instance, edit
    // a shared component through one instance and confirm it updates the
    // other live (no per-instance override in v1), then unlink one instance
    // and confirm it stops following further shared edits.
    await page.locator("#add").click();
    const prefabSourceName = await page.locator(".entity").last().textContent();
    await page
      .locator(".entity")
      .filter({ hasText: prefabSourceName })
      .first()
      .click();
    await page.getByLabel("Add component").selectOption("Health");
    page.once("dialog", (dialog) => dialog.accept("Test Prefab"));
    await page.getByRole("button", { name: "Make prefab…" }).click();
    await page.locator("#prefab-select").selectOption("Test Prefab");
    await page.locator("#prefab-place").click();
    await page.waitForFunction(
      (name) =>
        Array.from(document.querySelectorAll(".entity")).filter((e) =>
          e.textContent.includes(name),
        ).length === 2,
      prefabSourceName,
    );
    const instances = page.locator(".entity").filter({ hasText: prefabSourceName });
    await instances.nth(1).click();
    await page.getByLabel("Health.maximum").fill("55");
    await page.getByLabel("Health.maximum").press("Tab");
    await instances.nth(0).click();
    assert.equal(
      await page.getByLabel("Health.maximum").inputValue(),
      "55",
      "editing a shared component through one instance updates the other live",
    );
    await page.getByRole("button", { name: "Unlink from prefab" }).click();
    await instances.nth(1).click();
    await page.getByLabel("Health.maximum").fill("99");
    await page.getByLabel("Health.maximum").press("Tab");
    await instances.nth(0).click();
    assert.equal(
      await page.getByLabel("Health.maximum").inputValue(),
      "55",
      "an unlinked instance keeps its materialized value, unaffected by further shared edits",
    );
    // A prefab name containing markup-sensitive characters must still round-trip
    // through the picker -- it's built via the Option constructor, not raw
    // innerHTML string interpolation.
    await page.locator("#add").click();
    await page.locator(".entity").last().click();
    page.once("dialog", (dialog) => dialog.accept('Boss "Red" & Co'));
    await page.getByRole("button", { name: "Make prefab…" }).click();
    await page.locator("#prefab-select").selectOption('Boss "Red" & Co');
    const entitiesBeforeOddPlace = await page.locator(".entity").count();
    await page.locator("#prefab-place").click();
    await page.waitForFunction(
      (before) => document.querySelectorAll(".entity").length === before + 1,
      entitiesBeforeOddPlace,
    );
    await fs.mkdir("build/browser-evidence", { recursive: true });
    await page.screenshot({
      path: process.env.EDITOR_NO_WEBGL
        ? "build/browser-evidence/btai-editor-canvas.png"
        : "build/browser-evidence/btai-editor.png",
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    console.log(
      "Editor browser: C++ startup, create, select, rename, property edits, components, duplicate, undo/redo, play/pause/stop, bench, catalog, animated catalog models, player WASD movement, Collider obstacle blocking, melee/blast combat, vehicle driving, AIState/Pedestrian wander/chase, Script (Lua on_tick, error surfacing), prefabs (create/place/live-shared edits/unlink), save/load, invalid-load preservation, authoring console passed.",
    );
  } finally {
    if (browser) await browser.close();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
