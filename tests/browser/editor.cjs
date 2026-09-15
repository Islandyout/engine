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
    await page.locator("#bench").click();
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
    assert.match(await page.locator("#log").textContent(), /Aether bench/);
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
    await fs.mkdir("build/browser-evidence", { recursive: true });
    await page.screenshot({
      path: process.env.EDITOR_NO_WEBGL
        ? "build/browser-evidence/btai-editor-canvas.png"
        : "build/browser-evidence/btai-editor.png",
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    console.log(
      "Editor browser: C++ startup, create, select, rename, property edits, components, duplicate, undo/redo, play/pause/stop, bench, catalog, animated catalog models, save/load, invalid-load preservation, authoring console passed.",
    );
  } finally {
    if (browser) await browser.close();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
