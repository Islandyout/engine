// Loot and the UI kit (0.88.0), in the Combat range: the interact prompt
// and a weapon's loot card, pressing E to pick a gun up into the loadout,
// holding E to open the supply crate, a chest that needs the Range Key,
// the Hotbar switching weapons on a click, and the Pause menu's buttons.
// Then the UI templates picker: every widget previewed in six styles, and
// each style's whole HUD added to an empty scene. Run against the built
// editor (build/site); screenshots go to build/browser-evidence.
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
        { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".glb": "model/gltf-binary" }[path.extname(file)] || "text/plain",
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
    // "Discard unsaved changes?" when starting a new scene.
    page.on("dialog", (dialog) => dialog.accept());
    await page.addInitScript(() => {
      Element.prototype.requestPointerLock = function () {
        return Promise.resolve();
      };
    });
    const port = server.address().port;
    await fs.mkdir("build/browser-evidence", { recursive: true });
    const shot = (name) => page.screenshot({ path: `build/browser-evidence/${name}.png` });
    const hudText = () => page.evaluate(() => document.querySelector("#hud-text")?.textContent ?? "");
    const run = async (command) => {
      await page.locator("#json").fill(JSON.stringify(command));
      await page.locator("#command button").click();
      const result = JSON.parse(await page.locator("#log").textContent());
      assert.ok(result.ok, `${JSON.stringify(command)}: ${JSON.stringify(result)}`);
      return result;
    };
    // An entity reference by name.
    const ref = async (name) => {
      const entity = (await run({ command: "list_entities" })).data.find((e) => e.name === name);
      assert.ok(entity, `an entity named ${name}`);
      return { index: entity.index, generation: entity.generation };
    };
    const fresh = async (template) => {
      await page.click("#new");
      await page.click(`[aria-label="${template}"]`);
      await page.waitForTimeout(400);
    };
    const play = async () => {
      await page.click("#play");
      await page.waitForFunction(() => document.querySelector("#status")?.dataset.mode === "play", null, { timeout: 60000 });
      await page.waitForTimeout(1200);
    };
    const stop = () => page.click("#stop");
    const hits = async () =>
      Object.fromEntries(
        ((await page.evaluate(() => document.querySelector("#viewport").dataset.widgetHits)) ?? "")
          .split(" ")
          .filter(Boolean)
          .map((entry) => {
            const [action, at] = entry.split("@");
            const [x, y] = at.split(",").map(Number);
            return [action, { x, y }];
          }),
      );
    const clickHit = async (action) => {
      const all = await hits();
      assert.ok(all[action], `a widget offers "${action}": ${JSON.stringify(all)}`);
      const box = await page.locator("#viewport canvas").first().boundingBox();
      await page.mouse.click(box.x + all[action].x, box.y + all[action].y);
    };

    await page.goto(`http://127.0.0.1:${port}/engine/`);
    await page.waitForFunction(() => document.querySelector("#runtime")?.textContent === "C++ runtime ready");

    // A weapon on the ground: the prompt and its card; E takes it.
    await fresh("Combat range");
    await run({ command: "set_transform", entity: await ref("Player"), position: [-16, 0.9, -0.2] });
    await play();
    await page.waitForFunction(() => (document.querySelector("#hud-text")?.textContent ?? "").includes("E: Pick up"), null, { timeout: 20000 });
    await shot("loot-weapon-prompt");
    const slotsBefore = Object.keys(await hits()).filter((a) => a.startsWith("slot:")).length;
    assert.equal(slotsBefore, 5, "the Hotbar shows the five-gun loadout");
    await page.keyboard.down("e");
    await page.waitForTimeout(150);
    await page.keyboard.up("e");
    await page.waitForFunction(() => (document.querySelector("#hud-text")?.textContent ?? "").includes("Picked up"), null, { timeout: 10000 });
    await page.waitForTimeout(500);
    assert.equal(Object.keys(await hits()).filter((a) => a.startsWith("slot:")).length, 6, "the shotgun joins the loadout as slot 6");
    await shot("loot-weapon-taken");
    // The Hotbar: a click on slot 2 switches to the SMG.
    await clickHit("slot:1");
    await page.waitForFunction(() => (document.querySelector("#viewport").dataset.shooter ?? "").split(",")[4] === "smg-2", null, { timeout: 10000 });
    // The Pause menu: Pause shows it; its Resume button resumes.
    await page.click("#pause");
    await page.waitForFunction(() => document.querySelector("#status")?.dataset.mode === "pause");
    await page.waitForTimeout(300);
    await shot("ui-pause-menu");
    await clickHit("resume");
    await page.waitForFunction(() => document.querySelector("#status")?.dataset.mode === "play");
    await stop();

    // The supply crate opens on a held E and spills its loot.
    await run({ command: "set_transform", entity: await ref("Player"), position: [-16, 0.9, -2.6] });
    await play();
    await page.waitForFunction(() => (document.querySelector("#hud-text")?.textContent ?? "").includes("E: Open Supply Crate"), null, { timeout: 20000 });
    await page.keyboard.down("e");
    await page.waitForTimeout(300);
    await shot("loot-crate-hold");
    await page.waitForTimeout(700);
    await page.keyboard.up("e");
    await page.waitForFunction(() => !(document.querySelector("#hud-text")?.textContent ?? "").includes("Open Supply Crate"), null, { timeout: 10000 });
    await page.waitForTimeout(1500);
    await shot("loot-crate-open");
    await stop();

    // The armory chest says what it needs.
    await run({ command: "set_transform", entity: await ref("Player"), position: [-21, 0.9, -2.6] });
    await play();
    await page.waitForFunction(() => (document.querySelector("#hud-text")?.textContent ?? "").includes("Needs Range Key"), null, { timeout: 20000 });
    await shot("loot-chest-locked");
    await stop();

    // The UI templates picker: six styles of every widget, by group.
    await page.click("#ui-kit");
    const picker = page.locator(".ui-kit-picker");
    await picker.waitFor();
    for (const group of ["Combat HUD", "Navigation", "Interaction & loot", "Menus & dialogue"]) {
      await picker.getByRole("tab", { name: group }).click();
      const cards = await picker.locator(".ui-kit-card").count();
      assert.ok(cards >= 4, `${group}: ${cards} widgets`);
      assert.equal(await picker.locator(".ui-kit-style").count(), cards * 6, `${group}: every widget in six styles`);
      await picker.screenshot({ path: `build/browser-evidence/ui-kit-${group.replace(/\W+/g, "-").toLowerCase()}.png` });
    }
    await picker.getByRole("button", { name: "Close" }).click();
    // Each style's HUD on an empty scene (sample data while editing).
    for (const style of ["Modern", "Battle Royale", "Tactical", "Fantasy", "Sci-fi", "Minimal"]) {
      await fresh("Empty scene");
      await page.click("#ui-kit");
      await picker.waitFor();
      for (const group of ["Combat HUD", "Navigation", "Interaction & loot"]) {
        await picker.getByRole("tab", { name: group }).click();
        await picker.getByRole("button", { name: `Add all of ${group} in ${style}` }).click();
        await page.waitForFunction((s) => (document.querySelector("#log")?.textContent ?? "").includes(`in the ${s} style`), style);
      }
      await picker.getByRole("button", { name: "Close" }).click();
      await page.waitForTimeout(300);
      await page.locator("#panel-viewport").screenshot({ path: `build/browser-evidence/ui-style-${style.replace(/\W+/g, "-").toLowerCase()}.png` });
    }
    assert.deepEqual(errors, [], "no page errors");
    console.log("loot_ui: ok");
  } catch (error) {
    await saveFailure("loot_ui", error, browser);
    console.error(error);
    process.exitCode = 1;
  } finally {
    await browser?.close();
    server.close();
  }
})();
