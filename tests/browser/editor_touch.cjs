// The editor for people: on a touch screen (tap to select, long press for
// the entity menu, pinch to zoom, one finger to orbit, on-screen game
// controls in Play) and with a trackpad, mouse and keyboard (scroll to
// orbit, Shift to pan, a wheel to zoom; the inspector's collapse, filter and
// remembered cards; search in the catalog, Add component, the console and
// the Games library; Ctrl/Cmd+K).
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");
const { saveFailure } = require("./evidence.cjs");

async function serveSite() {
  const root = path.resolve("build/site");
  const server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url, "http://localhost").pathname.replace(/^\/engine\//, "");
    const file = path.resolve(root, pathname === "" || pathname.endsWith("/") ? pathname + "index.html" : pathname);
    if (!file.startsWith(root + path.sep)) return res.writeHead(404).end();
    try {
      res.setHeader("Content-Type", { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".glb": "model/gltf-binary" }[path.extname(file)] || "text/plain");
      res.end(await fs.readFile(file));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return server;
}

(async () => {
  const server = await serveSite();
  const url = `http://127.0.0.1:${server.address().port}/engine/`;
  let browser;
  const errors = [];
  try {
    browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
    await fs.mkdir("build/browser-evidence", { recursive: true });
    const open = async (options) => {
      const context = await browser.newContext(options);
      const page = await context.newPage();
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => {
        if (m.type() === "error" && !m.location().url.endsWith("/favicon.ico")) errors.push(m.text());
      });
      await page.goto(url);
      await page.waitForFunction(() => document.querySelector("#runtime")?.textContent === "C++ runtime ready", null, { timeout: 120000 });
      return page;
    };
    const run = async (page, command) => {
      await page.locator("#json").fill(JSON.stringify(command));
      await page.locator("#command button").click();
    };
    const camera = async (page) => (await page.locator("#viewport").getAttribute("data-camera")).split(",").map(Number);
    const entities = async (page) => Number((await page.locator("#status").textContent()).match(/(\d+) entities/)[1]);
    const selected = (page) => page.getByLabel("Entity name").inputValue();
    // A target box where the camera looks (the viewport's centre), and
    // another far off to its side.
    const setup = async (page) => {
      const before = await entities(page);
      await run(page, { command: "spawn_entity", name: "Target", transform: [0, 1, 0] });
      await run(page, { command: "spawn_entity", name: "Other", transform: [40, 0, -40] });
      await page.waitForFunction((n) => new RegExp(`${n + 2} entities`).test(document.querySelector("#status").textContent), before);
    };
    const viewportCentre = async (page) => {
      const box = await page.locator("#viewport").boundingBox();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
    };

    // -- Touch screen: a 1024 x 768 tablet.
    {
      const page = await open({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true });
      const coarse = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
      assert.ok(coarse, "the emulated tablet reports a coarse pointer");
      assert.match(await page.locator("#viewport-hint").textContent(), /pinch to zoom/);
      await setup(page);
      const cdp = await page.context().newCDPSession(page);
      const touch = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
      const { x, y, box } = await viewportCentre(page);
      // A tap selects what's under the finger.
      await page.getByLabel("Entity name").waitFor();
      assert.equal(await selected(page), "Other");
      await page.touchscreen.tap(x, y);
      await page.waitForFunction(() => document.querySelector('[aria-label="Entity name"]')?.value === "Target", null, { timeout: 10000 });
      // A long press opens the entity menu; Duplicate there duplicates.
      await touch("touchStart", [[x, y]]);
      await page.waitForTimeout(900);
      await touch("touchEnd", []);
      await page.locator(".entity-menu").waitFor({ timeout: 5000 });
      assert.deepEqual(await page.locator(".entity-menu button").allTextContents(), ["Frame", "Duplicate", "Delete"]);
      const beforeDuplicate = await entities(page);
      await page.locator(".entity-menu button", { hasText: "Duplicate" }).tap();
      await page.waitForFunction((n) => new RegExp(`${n + 1} entities`).test(document.querySelector("#status").textContent), beforeDuplicate);
      // One finger orbits; two pinch to zoom.
      const before = await camera(page);
      const ox = box.x + box.width * 0.2,
        oy = box.y + box.height * 0.75;
      await touch("touchStart", [[ox, oy]]);
      for (let i = 1; i <= 8; i++) await touch("touchMove", [[ox + i * 20, oy]]);
      await touch("touchEnd", []);
      const orbited = await camera(page);
      assert.ok(Math.abs(orbited[1] - before[1]) > 0.1, `one finger orbits: azimuth ${before[1]} -> ${orbited[1]}`);
      await touch("touchStart", [
        [x - 40, y],
        [x + 40, y],
      ]);
      for (let i = 1; i <= 8; i++)
        await touch("touchMove", [
          [x - 40 - i * 20, y],
          [x + 40 + i * 20, y],
        ]);
      await touch("touchEnd", []);
      const pinched = await camera(page);
      assert.ok(pinched[0] < orbited[0] * 0.9, `pinching out zooms in: distance ${orbited[0]} -> ${pinched[0]}`);
      await page.screenshot({ path: "build/browser-evidence/editor-touch.png" });
      // Play shows on-screen controls: a stick zone, a look zone, buttons.
      await page.locator("#play").tap();
      await page.locator("#viewport .touch-controls").waitFor({ timeout: 20000 });
      assert.ok((await page.locator(".touch-controls .touch-button").count()) >= 10);
      await page.locator('.touch-button[data-pad="0"]').tap();
      await page.screenshot({ path: "build/browser-evidence/editor-touch-play.png" });
      await page.locator("#stop").tap();
      await page.locator(".touch-controls").waitFor({ state: "detached", timeout: 20000 });
      await page.context().close();
    }

    // -- Trackpad, mouse and keyboard.
    {
      const page = await open({ viewport: { width: 1440, height: 900 } });
      await setup(page);
      const { x, y } = await viewportCentre(page);
      await page.mouse.move(x, y);
      // Trackpad scroll (small fractional deltas) orbits; Shift pans; a
      // wheel notch zooms.
      const start = await camera(page);
      for (let i = 0; i < 10; i++) await page.mouse.wheel(6.5, 3.5);
      const orbit = await camera(page);
      assert.ok(Math.abs(orbit[1] - start[1]) > 0.1 && Math.abs(orbit[0] - start[0]) < 0.01, `trackpad scroll orbits: ${start} -> ${orbit}`);
      await page.keyboard.down("Shift");
      for (let i = 0; i < 10; i++) await page.mouse.wheel(12.5, 0);
      await page.keyboard.up("Shift");
      const pan = await camera(page);
      assert.ok(Math.hypot(pan[3] - orbit[3], pan[5] - orbit[5]) > 0.1, `Shift + scroll pans: ${orbit} -> ${pan}`);
      await page.mouse.wheel(0, 100);
      await page.waitForTimeout(300);
      const zoom = await camera(page);
      assert.ok(Math.abs(zoom[0] - pan[0]) > 0.05, `a wheel notch zooms: ${pan[0]} -> ${zoom[0]}`);

      // The inspector: Add a component by search, cards remembered per
      // type, collapse/expand all, the property filter.
      assert.equal(await selected(page), "Other");
      const find = page.getByLabel("Find a component");
      await find.fill("partic");
      await find.press("Enter");
      const particles = page.locator('#inspector details[data-type="Particles"]');
      await particles.waitFor();
      assert.equal(await particles.evaluate((d) => d.open), false, "a non-main component starts collapsed");
      assert.equal(await page.locator('#inspector details[data-type="Transform"]').evaluate((d) => d.open), true, "Transform starts open");
      await particles.locator("summary").click();
      await page.waitForFunction(() => document.querySelector('#inspector details[data-type="Particles"]')?.open);
      // Remembered across selections and edits.
      await run(page, { command: "attach_component", entity: { index: 0, generation: 0 }, type: "Particles" });
      await page.waitForFunction(() => document.querySelector('#inspector details[data-type="Particles"]')?.open === true);
      await page.getByRole("button", { name: "Collapse all" }).click();
      assert.deepEqual([...new Set(await page.locator("#inspector details.component-card").evaluateAll((ds) => ds.map((d) => d.open)))], [false]);
      await page.getByRole("button", { name: "Expand all" }).click();
      assert.deepEqual([...new Set(await page.locator("#inspector details.component-card").evaluateAll((ds) => ds.map((d) => d.open)))], [true]);
      const filter = page.getByLabel("Filter properties");
      await filter.fill("transform");
      const shown = await page.locator("#inspector details.component-card").evaluateAll((ds) => ds.filter((d) => d.offsetParent !== null).map((d) => d.dataset.type));
      assert.deepEqual(shown, ["Transform"]);
      await filter.fill("position.x");
      const rows = await page.locator('#inspector details[data-type="Transform"] > [data-prop]').evaluateAll((ls) => ls.filter((l) => l.offsetParent !== null).map((l) => l.dataset.prop));
      assert.deepEqual(rows, ["position.x"], "the filter shows only the matching property rows");
      await filter.fill("zzzzz");
      assert.equal(await page.locator("#inspector details.component-card:not([hidden])").count(), 0);
      await filter.fill("");
      const cards = await page.locator("#inspector details.component-card").count();
      assert.ok(cards >= 2 && (await page.locator("#inspector details.component-card:not([hidden])").count()) === cards, "clearing the filter shows every card");
      // Arrow keys move between card headers.
      await page.locator('#inspector details[data-type="Transform"] summary').focus();
      await page.keyboard.press("ArrowDown");
      assert.notEqual(await page.evaluate(() => document.activeElement?.parentElement?.dataset.type), "Transform");

      // Catalog search across categories; Enter adds the best match.
      const count = await entities(page);
      await page.locator("#catalog-search").fill("cow");
      assert.match(await page.locator("#catalog-model option").first().textContent(), /^Cow · animals$/);
      await page.locator("#catalog-search").press("Enter");
      await page.waitForFunction((n) => new RegExp(`${n + 1} entities`).test(document.querySelector("#status").textContent), count);
      // The console's command search fills in an example.
      const cmd = page.getByLabel("Find a command");
      await cmd.fill("descr");
      await cmd.press("Enter");
      assert.match(await page.locator("#json").inputValue(), /"command":"describe_entity"/);
      // Ctrl/Cmd+K: the search of the panel last used.
      await page.locator("#inspector").click({ position: { x: 5, y: 5 } });
      await page.keyboard.press("Control+K");
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Filter properties");
      await page.locator("#dock-project .panel-header").click();
      await page.keyboard.press("Control+K");
      assert.equal(await page.evaluate(() => document.activeElement?.id), "catalog-search");
      await page.locator("#panel-hierarchy .panel-header").first().click();
      await page.keyboard.press("Control+K");
      assert.equal(await page.evaluate(() => document.activeElement?.id), "search");
      // The Games library searches its cards.
      await page.locator("#games").click();
      const gamesSearch = page.getByLabel("Search games");
      await gamesSearch.waitFor();
      await gamesSearch.fill("city");
      assert.ok((await page.locator("#games-library .game-card:not([hidden]) h3").allTextContents()).includes("City Template"));
      await gamesSearch.fill("gatebreak");
      const onScreen = await page.locator("#games-library .game-card h3").evaluateAll((hs) => hs.filter((h) => h.offsetParent !== null).map((h) => h.textContent));
      assert.deepEqual(onScreen, ["GATEBREAKER"], "only the matching game shows");
      await page.screenshot({ path: "build/browser-evidence/editor-search.png" });
    }
    assert.deepEqual(errors, []);
    console.log("Editor for people: touch (tap select, long-press menu, orbit, pinch, on-screen game controls), trackpad (orbit, pan) and wheel zoom, inspector (search to add, remembered cards, collapse/expand all, filter, arrow keys), catalog/console/Games search and Ctrl+K passed.");
  } catch (error) {
    await saveFailure("editor_touch", error, browser);
    throw error;
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
