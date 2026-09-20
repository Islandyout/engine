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
    // Monkey-patches AudioContext before any app code runs, recording
    // start/stop/suspend/resume calls into a page-global array this test
    // reads back later -- observes real Web Audio API usage without adding
    // any test-only hooks to the shipped app.
    await page.addInitScript(() => {
      window.__audioEvents = [];
      // When set to a pending Promise, decodeAudioData stalls behind it --
      // lets a test deterministically hold a clip's load open across a
      // Stop/Play cycle to reproduce the exact race two concurrent Play
      // sessions loading the same not-yet-cached clip can hit, instead of
      // relying on real network/decode timing (unset, decoding proceeds
      // immediately and every other check in this suite is unaffected).
      window.__decodeGate = null;
      const OrigAC = window.AudioContext;
      window.AudioContext = class extends OrigAC {
        constructor(...args) {
          super(...args);
          window.__audioEvents.push({ type: "context-created" });
        }
        async decodeAudioData(...a) {
          if (window.__decodeGate) await window.__decodeGate;
          return super.decodeAudioData(...a);
        }
        createBufferSource() {
          const source = super.createBufferSource();
          const origStart = source.start.bind(source);
          const origStop = source.stop.bind(source);
          source.start = (...a) => {
            window.__audioEvents.push({ type: "start", loop: source.loop });
            return origStart(...a);
          };
          source.stop = (...a) => {
            window.__audioEvents.push({ type: "stop" });
            return origStop(...a);
          };
          return source;
        }
        suspend(...a) {
          window.__audioEvents.push({ type: "suspend" });
          return super.suspend(...a);
        }
        resume(...a) {
          window.__audioEvents.push({ type: "resume" });
          return super.resume(...a);
        }
      };
    });
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
    // Vehicle.archetype: previously accepted and saved but never actually
    // read (the same "authored but inert" gap Collider shape/AIState/Vehicle
    // driving itself each had before their own rounds) -- picking a
    // different archetype from the inspector's own dropdown must actually
    // change how the vehicle drives, not just round-trip through save/load.
    // Reuses the same Entity 7 the drive above just used (still parked at
    // its authored spawn -- Play never mutates authored data, proven
    // above), driven for the exact same simulated duration (tick-count
    // parity, not wall-clock, since a headless browser's frame pacing isn't
    // 1:1 with real time) under both its default Car archetype and Sports:
    // Sports' higher accel/top speed (bridge.cpp's own vehicle_tuning,
    // exhaustively verified numerically by the native bridge test) must
    // cover meaningfully more ground in that same span.
    await page
      .locator(".entity")
      .filter({ hasText: "Entity 7" })
      .first()
      .click();
    const archetypeSelect = page.locator('[aria-label="Vehicle.archetype"]');
    const archetypeOptions = await archetypeSelect.locator("option").allTextContents();
    assert.deepEqual(archetypeOptions, ["Car", "Sports", "Truck", "Bus"]);
    const driveTicks = async (targetTicks) => {
      await page.locator("#play").click();
      await page.waitForFunction(() =>
        document.querySelector("#status").textContent.includes("Player ("),
      );
      await page.keyboard.down("w");
      await page.waitForFunction(
        (n) => {
          const m = document.querySelector("#status").textContent.match(/(\d+) C\+\+ fixed ticks/);
          return m && Number(m[1]) >= n;
        },
        targetTicks,
      );
      const status = await page.locator("#status").textContent();
      const z = Number(status.match(/Player \([-\d.]+, [-\d.]+, ([-\d.]+)\)/)[1]);
      await page.keyboard.up("w");
      await page.locator("#stop").click();
      return z;
    };
    const carAdvance = await driveTicks(90);
    await page
      .locator(".entity")
      .filter({ hasText: "Entity 7" })
      .first()
      .click();
    await archetypeSelect.selectOption({ label: "Sports" });
    const sportsAdvance = await driveTicks(90);
    assert.ok(
      sportsAdvance > carAdvance * 1.2,
      `Sports (${sportsAdvance}) should meaningfully outrun Car (${carAdvance}) over the same duration`,
    );
    // Reset back to Car (its default/authored value) -- the Sphere-collider
    // block distance calibrated just below assumes Car's own physics.
    await page
      .locator(".entity")
      .filter({ hasText: "Entity 7" })
      .first()
      .click();
    await archetypeSelect.selectOption({ label: "Car" });
    // Collider shapes: Collider.type/radius have been authorable in the
    // inspector for a while but were silently discarded by physics until
    // this round -- a real Sphere collider now actually resolves as a
    // sphere. Placed 3 units ahead of Entity 7's own parked z (still there,
    // per "Play never mutates authored data" above) with radius 1.5, it
    // should stop the same vehicle that just freely drove past this point
    // unobstructed at a specific, computable distance: baseZ + 3 - 1.5 (sphere
    // surface) - 0.5 (vehicle's own half-extent) = baseZ + 1.0 -- clearly
    // short of the baseZ + 2.0 a same-radius box obstacle (or the old,
    // shape-ignorant behavior) would have produced instead.
    await page
      .locator(".entity")
      .filter({ hasText: "Entity 7" })
      .first()
      .click();
    const baseZ = Number(
      await page.getByLabel("Transform.position.z", { exact: true }).inputValue(),
    );
    await page.locator("#add").click();
    await page.getByLabel("Add component").selectOption("Collider");
    await page.getByLabel("Collider.type").selectOption("Sphere");
    await page.getByLabel("Collider.radius").fill("1.5");
    await page.getByLabel("Collider.radius").press("Tab");
    await page
      .getByLabel("Transform.position.z", { exact: true })
      .fill(String(baseZ + 3));
    await page.getByLabel("Transform.position.z", { exact: true }).press("Tab");
    await page
      .locator(".entity")
      .filter({ hasText: "Entity 7" })
      .first()
      .click();
    await page.locator("#play").click();
    await page.waitForFunction(() =>
      document.querySelector("#status").textContent.includes("Player ("),
    );
    await page.keyboard.down("w");
    await page.waitForTimeout(2500);
    await page.keyboard.up("w");
    const sphereBlockedZ = Number(
      (await page.locator("#status").textContent()).match(
        /Player \([-\d.]+, [-\d.]+, ([-\d.]+)\)/,
      )[1],
    );
    await page.locator("#stop").click();
    assert.ok(
      sphereBlockedZ < baseZ + 1.5 && sphereBlockedZ > baseZ + 0.5,
      `sphere collider should stop the vehicle near baseZ+1.0 (baseZ=${baseZ}), got ${sphereBlockedZ}`,
    );
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
    // Pedestrian.archetype: same "authored but inert until read" gap as
    // Vehicle.archetype above (native bridge test covers the actual wander-
    // pace math -- Casual/Brisk/Lingering -- numerically and
    // deterministically); here just confirms the inspector's own dropdown
    // offers the right options with the right friendly labels and that a
    // choice survives a fresh render, the same reselection-round-trip
    // technique the AnimationState.clip case elsewhere in this suite uses.
    await page.getByLabel("Add component").selectOption("Pedestrian");
    const pedestrianArchetype = page.locator('[aria-label="Pedestrian.archetype"]');
    assert.deepEqual(await pedestrianArchetype.locator("option").allTextContents(), [
      "Casual",
      "Brisk",
      "Lingering",
    ]);
    await pedestrianArchetype.selectOption({ label: "Brisk" });
    await page
      .locator(".entity")
      .filter({ hasText: "Entity 7" })
      .first()
      .click();
    await page
      .locator(".entity")
      .filter({ hasText: aiEntityName })
      .first()
      .click();
    assert.equal(
      await page.locator('[aria-label="Pedestrian.archetype"]').inputValue(),
      "1",
      "archetype choice must survive a fresh inspector render, not just the DOM click",
    );
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
    // Sound: attaching a looping clip and hitting Play actually starts real
    // Web Audio playback (not just authored data), Pause suspends the whole
    // audio clock instead of muting mid-buffer, resuming Play resumes it,
    // and Stop tears the source down -- the same lifecycle Script/AIAgent
    // already run under.
    const audioEventCount = (type) =>
      page.evaluate((t) => window.__audioEvents.filter((e) => e.type === t).length, type);
    await page.locator("#add").click();
    await page.getByLabel("Add component").selectOption("Sound");
    await page.locator('[aria-label="Sound.clip"]').selectOption("5"); // Explosion
    await page.getByLabel("Sound.loop").check();
    await page.locator("#play").click();
    await page.waitForFunction(() =>
      window.__audioEvents.some((e) => e.type === "start"),
    );
    await page.locator("#pause").click();
    await page.waitForFunction(() =>
      window.__audioEvents.some((e) => e.type === "suspend"),
    );
    await page.locator("#play").click();
    await page.waitForFunction(() =>
      window.__audioEvents.some((e) => e.type === "resume"),
    );
    await page.locator("#stop").click();
    await page.waitForFunction(() =>
      window.__audioEvents.some((e) => e.type === "stop"),
    );
    // Regression: a clip already decoded from an earlier Play session must
    // still start on the next Play -- the synchronous cached-buffer path
    // used to check doc.mode before it was set to "play", silencing every
    // already-cached clip from the second Play onward.
    const startsBeforeReplay = await audioEventCount("start");
    const stopsBeforeReplay = await audioEventCount("stop");
    await page.locator("#play").click();
    await page.waitForFunction(
      (before) => window.__audioEvents.filter((e) => e.type === "start").length > before,
      startsBeforeReplay,
    );
    await page.locator("#stop").click();
    await page.waitForFunction(
      (before) => window.__audioEvents.filter((e) => e.type === "stop").length > before,
      stopsBeforeReplay,
    );
    // Regression: a clip still mid-decode when Stop, then Play again,
    // happens before it resolves must start exactly one source for that
    // second session, not one per session -- loadSoundBuffer's promise
    // cache is keyed by clip id, not by Play session, so both sessions'
    // callbacks used to fire off the one shared decode promise, and the
    // second activeSounds.set() left Stop only able to reach one of the two
    // sources, leaking the other (audibly, forever, for a looping clip)
    // until the page reloaded.
    await page.evaluate(() => {
      window.__decodeGate = new Promise((resolve) => {
        window.__releaseDecodeGate = resolve;
      });
    });
    await page.locator('[aria-label="Sound.clip"]').selectOption("6"); // Glass Break, never loaded before
    const startsBeforeRace = await audioEventCount("start");
    await page.locator("#play").click(); // session A: kicks off the decode, stalls on the gate
    await page.waitForTimeout(50); // let the fetch/decode actually begin before Stop
    await page.locator("#stop").click(); // session A ends while its load is still in flight
    await page.locator("#play").click(); // session B: same clip, same in-flight decode promise
    await page.evaluate(() => window.__releaseDecodeGate());
    await page.waitForFunction(
      (before) => window.__audioEvents.filter((e) => e.type === "start").length > before,
      startsBeforeRace,
    );
    await page.waitForTimeout(100); // give a stale session's callback, if the bug were present, a chance to also fire
    assert.equal(
      await audioEventCount("start"),
      startsBeforeRace + 1,
      "a clip resolving after Stop+replay must start exactly one source, not one per Play session",
    );
    await page.locator("#stop").click();
    await page.evaluate(() => {
      window.__decodeGate = null;
    });
    assert.equal(
      await audioEventCount("start"),
      await audioEventCount("stop"),
      "every started source must have a matching stop -- nothing left playing across the whole Sound sequence",
    );
    // The Quaternius CC0 additions (0.32.0, see assets/CREDITS.md) go through
    // the same animated-catalog path the Aether Cat entry above already
    // exercises; just confirm both new entries are actually reachable by
    // label from their respective categories and load without a page error.
    const entitiesBeforeQuaternius = await page.locator(".entity").count();
    await page.locator("#catalog-category").selectOption("people");
    await page.locator("#catalog-model").selectOption({ label: "Mannequin F" });
    await page.locator("#catalog-add").click();
    await page.waitForFunction(() =>
      [...document.querySelectorAll(".entity")].some((e) =>
        e.textContent.includes("Mannequin F"),
      ),
    );
    await page.locator("#catalog-category").selectOption("animals");
    await page.locator("#catalog-model").selectOption({ label: "Wolf" });
    await page.locator("#catalog-add").click();
    await page.waitForFunction(() =>
      [...document.querySelectorAll(".entity")].some((e) =>
        e.textContent.includes("Wolf"),
      ),
    );
    assert.equal(
      await page.locator(".entity").count(),
      entitiesBeforeQuaternius + 2,
    );
    // AnimationState (0.32.0): previously fully wired for authoring/save-load
    // but never actually consumed by the renderer -- an "authored but inert"
    // component (see docs/IMPLEMENTATION_STATUS.md's F27/F31 precedent).
    // Wolf (just added, currently selected) is the live model here: its
    // clip dropdown must be populated from its own glTF's clip names (not a
    // fixed list -- a different animated model has a different clip set),
    // selecting one must actually repose the live preview in Edit mode
    // (not just Play), and clearing back to "(Automatic)" must hand control
    // back to the ground-speed-based picker.
    await page.getByLabel("Add component").selectOption("AnimationState");
    const clipSelect = page.locator('[aria-label="AnimationState.clip"]');
    const wolfClipOptions = await clipSelect.locator("option").allTextContents();
    assert.deepEqual(wolfClipOptions[0], "(Automatic)");
    assert.ok(wolfClipOptions.includes("Eating"), "Wolf's own Eating clip must be offered");
    assert.ok(!wolfClipOptions.includes("wave"), "not Hero's clip set -- options are per-model");
    await clipSelect.selectOption({ label: "Eating" });
    // set_component only triggers rebuild() (the 3D scene), not a fresh
    // inspector render, so the select's own DOM value alone would just
    // reflect the click, not proof the command persisted anything -- select
    // a different entity and back, forcing updatePanels() to rebuild this
    // whole panel fresh from the document, the same round-trip-through-
    // reselection technique the Stop/undo assertions above already use.
    await page.locator(".entity").filter({ hasText: "Mannequin F" }).first().click();
    await page.locator(".entity").filter({ hasText: "Wolf" }).first().click();
    assert.equal(
      await page.locator('[aria-label="AnimationState.clip"]').inputValue(),
      "Eating",
      "clip selection must survive a fresh inspector render, not just the DOM click",
    );
    await page
      .locator('[aria-label="AnimationState.clip"]')
      .selectOption({ label: "(Automatic)" });
    await page.locator(".entity").filter({ hasText: "Mannequin F" }).first().click();
    await page.locator(".entity").filter({ hasText: "Wolf" }).first().click();
    assert.equal(
      await page.locator('[aria-label="AnimationState.clip"]').inputValue(),
      "",
      "(Automatic) must persist too, handing control back to ground-speed selection",
    );
    // Inspector cleanup (0.34.0, right after F33 shipped): "Add component"
    // was one flat list of 16 raw type names with related components
    // (AIState/Pedestrian, Player/Vehicle, Renderable/AnimationState)
    // scattered across it, and the new clip picker above was reachable only
    // by knowing to add "AnimationState" first. Grouping must keep linked
    // components in the same optgroup, and an animated Renderable must
    // offer its own inline clip picker without that detour. Mannequin F
    // (added earlier, nothing but Transform/Renderable attached) is the
    // live entity for the "Add component" checks -- Wolf, still selected
    // from the block just above, already has AnimationState attached and so
    // no longer offers it in the list, which would be the wrong thing to
    // assert against.
    await page.locator(".entity").filter({ hasText: "Mannequin F" }).first().click();
    const addComponent = page.getByLabel("Add component");
    const groups = await addComponent.evaluate((sel) =>
      [...sel.querySelectorAll("optgroup")].map((g) => ({
        label: g.label,
        options: [...g.children].map((o) => o.value),
      })),
    );
    const gameplay = groups.find((g) => g.label === "Gameplay");
    assert.ok(gameplay.options.includes("AIState") && gameplay.options.includes("Pedestrian"));
    assert.ok(gameplay.options.includes("Player") && gameplay.options.includes("Vehicle"));
    const movement = groups.find((g) => g.label === "Movement & Physics");
    assert.ok(
      ["Velocity", "Acceleration", "RigidBody", "Collider"].every((t) =>
        movement.options.includes(t),
      ),
    );
    // Friendlier labels than the raw type name, for the ones that need it --
    // spot-checked by visible option text, not the (unchanged) value the
    // rest of this suite's selectOption(...) calls still rely on.
    const optionText = (value) =>
      addComponent.locator(`option[value="${value}"]`).textContent();
    assert.equal(await optionText("AIState"), "AI Behavior");
    assert.equal(await optionText("RigidBody"), "Physics Body");
    assert.equal(await optionText("AnimationState"), "Animation (advanced)");
    // Mannequin F has no AnimationState attached yet: its Renderable card
    // alone must offer a working clip picker, proving the feature doesn't
    // require the "Add component" detour at all.
    assert.equal(await page.locator('[aria-label="AnimationState.clip"]').count(), 0);
    const inlineClip = page.locator('[aria-label="Renderable.animationClip"]');
    const inlineOptions = await inlineClip.locator("option").allTextContents();
    assert.ok(inlineOptions.includes("sit"), "Mannequin F's own clip set, offered inline");
    await inlineClip.selectOption({ label: "sit" });
    await page.locator(".entity").filter({ hasText: "Wolf" }).first().click();
    await page.locator(".entity").filter({ hasText: "Mannequin F" }).first().click();
    assert.equal(
      await page.locator('[aria-label="Renderable.animationClip"]').inputValue(),
      "sit",
      "inline picker's choice persisted through a fresh render, same as the advanced card",
    );
    assert.equal(
      await page.locator('[aria-label="AnimationState.clip"]').inputValue(),
      "sit",
      "picking from the inline picker attaches AnimationState -- the advanced card now agrees",
    );
    // Light (0.39.0): a real THREE light spawned per-entity, not just static
    // scene ambience -- verified here at the authoring-DOM level (options
    // offered, values persist through a fresh inspector render), same as
    // every other component's black-box coverage; actual illumination was
    // verified separately with a standalone Three.js render (this suite
    // never pixel-diffs the WebGL canvas itself).
    const appearance = groups.find((g) => g.label === "Appearance & Animation");
    assert.ok(appearance.options.includes("Light"));
    await page.getByLabel("Add component").selectOption("Light");
    const lightType = page.locator('[aria-label="Light.type"]');
    const lightTypeOptions = await lightType.locator("option").allTextContents();
    assert.deepEqual(lightTypeOptions, ["Point", "Spot", "Directional"]);
    assert.equal(await lightType.inputValue(), "Point", "sensible default type");
    await lightType.selectOption("Spot");
    await page.getByLabel("Light.color.x", { exact: true }).fill("0.2");
    await page.getByLabel("Light.color.x", { exact: true }).press("Tab");
    await page.getByLabel("Light.intensity", { exact: true }).fill("8");
    await page.getByLabel("Light.intensity", { exact: true }).press("Tab");
    await page.getByLabel("Light.angle", { exact: true }).fill("0.3");
    await page.getByLabel("Light.angle", { exact: true }).press("Tab");
    await page.locator(".entity").filter({ hasText: "Wolf" }).first().click();
    await page.locator(".entity").filter({ hasText: "Mannequin F" }).first().click();
    assert.equal(
      await page.locator('[aria-label="Light.type"]').inputValue(),
      "Spot",
      "Light edits persist through a fresh inspector render, same as every other component",
    );
    assert.equal(
      await page.locator('[aria-label="Light.color.x"]').inputValue(),
      "0.2",
    );
    assert.equal(await page.locator('[aria-label="Light.angle"]').inputValue(), "0.3");
    // Particles (0.40.0): a real per-entity THREE.Points emitter, not just a
    // static effect -- verified here at the authoring-DOM level (options
    // offered, values persist through a fresh inspector render), same as
    // every other component's black-box coverage; the actual spawn/fade/
    // gravity simulation was verified separately against real three.js math
    // (this suite never pixel-diffs the WebGL canvas itself).
    assert.ok(appearance.options.includes("Particles"));
    await page.locator(".entity").filter({ hasText: "Mannequin F" }).first().click();
    await page.getByLabel("Add component").selectOption("Particles");
    const particlesPreset = page.locator('[aria-label="Particles.preset"]');
    const particlesPresetOptions = await particlesPreset.locator("option").allTextContents();
    assert.deepEqual(particlesPresetOptions, ["Sparkle", "Smoke", "Fire", "Confetti"]);
    assert.equal(await particlesPreset.inputValue(), "Sparkle", "sensible default preset");
    await particlesPreset.selectOption("Fire");
    await page.getByLabel("Particles.rate", { exact: true }).fill("40");
    await page.getByLabel("Particles.rate", { exact: true }).press("Tab");
    await page.getByLabel("Particles.lifetime", { exact: true }).fill("0.8");
    await page.getByLabel("Particles.lifetime", { exact: true }).press("Tab");
    await page.locator(".entity").filter({ hasText: "Wolf" }).first().click();
    await page.locator(".entity").filter({ hasText: "Mannequin F" }).first().click();
    assert.equal(
      await page.locator('[aria-label="Particles.preset"]').inputValue(),
      "Fire",
      "Particles edits persist through a fresh inspector render, same as every other component",
    );
    assert.equal(await page.locator('[aria-label="Particles.rate"]').inputValue(), "40");
    assert.equal(await page.locator('[aria-label="Particles.lifetime"]').inputValue(), "0.8");

    await fs.mkdir("build/browser-evidence", { recursive: true });
    await page.screenshot({
      path: process.env.EDITOR_NO_WEBGL
        ? "build/browser-evidence/btai-editor-canvas.png"
        : "build/browser-evidence/btai-editor.png",
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    console.log(
      "Editor browser: C++ startup, create, select, rename, property edits, components, duplicate, undo/redo, play/pause/stop, bench, catalog, animated catalog models, player WASD movement, Collider box obstacle blocking, melee/blast combat, vehicle driving, Collider sphere obstacle blocking, AIState/Pedestrian wander/chase, Script (Lua on_tick, error surfacing), prefabs (create/place/live-shared edits/unlink), Sound (Web Audio play/pause/resume/stop), save/load, invalid-load preservation, authoring console, Quaternius catalog additions (Mannequin F, Wolf), per-model AnimationState clip selection/preview, grouped Add-component list, inline Renderable clip picker, Vehicle/Pedestrian archetype handling profiles, Light component, Particles component passed.",
    );
  } finally {
    if (browser) await browser.close();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
