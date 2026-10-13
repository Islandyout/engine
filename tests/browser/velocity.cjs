// VELOCITY (games/my-games/velocity): boot, then Mission 0 end to end the way
// a player plays it -- sprint, the barrier, the fight, the rescue -- its
// reward and save, and a reload that keeps the progress.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const { chromium } = require("playwright");
const { saveFailure } = require("./evidence.cjs");
const { serve, bot } = require("./gatebreaker_bot.cjs");

(async () => {
  const scene = JSON.parse(await fs.readFile("games/my-games/velocity/velocity.json", "utf8"));
  // props.fast: the enforcer spawns nearly beaten (fighting has its own tests).
  for (const entity of scene.entities) if (entity.name === "Director") entity.components.Script.props.fast = true;
  const server = await serve(scene);
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
    const url = `http://127.0.0.1:${server.address().port}/engine/`;
    const playing = () => page.waitForFunction(() => /^PLAY/.test(document.querySelector("#status")?.textContent ?? ""), null, { timeout: 120000 });
    await page.goto(url);
    await playing();
    const b = bot(page);
    await b.waitHud(/FIRST RESPONSE[\s\S]*Sprint to Market Row/, "Mission 0 starts");
    await page.screenshot({ path: "build/browser-evidence/velocity-0-start.png" });

    // Sprint: Shift more than doubles the speed readout.
    const kmh = async () => Number(/(\d+) km\/h/.exec(await b.hud())?.[1] ?? 0);
    let walk = 0;
    let sprint = 0;
    await page.keyboard.down("w");
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(500);
      walk = Math.max(walk, await kmh());
    }
    await page.keyboard.down("Shift");
    for (let i = 0; i < 8; i++) {
      await page.waitForTimeout(500);
      sprint = Math.max(sprint, await kmh());
    }
    await page.keyboard.up("Shift");
    await page.keyboard.up("w");
    assert.ok(walk >= 25 && sprint >= 2 * walk, `walk ${walk} km/h, sprint ${sprint} km/h`);

    // The barrier across the avenue (z -36, 1 m high): jump it at a sprint.
    // Headless, the simulation runs slower than real time, so each step
    // waits on where Velocity is, not on the clock.
    await b.walkTo(0, -52, 2);
    await page.keyboard.down("w");
    await page.keyboard.down("Shift");
    let jumped = false;
    let over;
    const jumpEnd = Date.now() + 90000;
    while (Date.now() < jumpEnd) {
      over = await b.position();
      if (over && over.z > -33) break;
      if (!jumped && over && over.z > -42) {
        await page.keyboard.press("Space");
        jumped = true;
      }
      await page.waitForTimeout(100);
    }
    await page.keyboard.up("Shift");
    await page.keyboard.up("w");
    assert.ok(jumped && over && over.z > -33, `jumped the barrier: at ${JSON.stringify(over)}`);

    // The incident: the enforcer appears; fight until it's down.
    await b.walkTo(0, -16, 2, 600000, /Stop the Street Enforcer/);
    await b.waitHud(/Stop the Street Enforcer/, "the fight starts");
    await page.screenshot({ path: "build/browser-evidence/velocity-1-fight.png" });
    const fightEnd = Date.now() + 240000;
    while (!/Help the civilian/.test(await b.hud())) {
      if (Date.now() > fightEnd) throw new Error(`the enforcer never went down -- HUD: ${await b.hud()}`);
      await page.keyboard.press("j");
      await page.waitForTimeout(300);
    }

    // The rescue: walk to the civilian and press G once.
    await b.walkTo(-4, -11, 1.6, 600000, /G\s+Help the civilian/);
    await b.waitHud(/G\s+Help the civilian/, "the rescue prompt");
    await page.keyboard.press("g");
    await b.waitHud(/FREE ROAM/, "Mission 0 ends");
    await page.screenshot({ path: "build/browser-evidence/velocity-2-done.png" });
    const saved = await page.evaluate(() => Object.entries(localStorage).find(([k]) => k.endsWith(":velocity.save"))?.[1]);
    assert.equal(saved, "1|m0|0|", "Mission 0 is saved once (version|missions|merit|picks)");

    // Reload: the save keeps Mission 0 done.
    await page.reload();
    await playing();
    await b.waitHud(/FREE ROAM/, "the reloaded game remembers Mission 0");
    assert.ok(!/FIRST RESPONSE/.test(await b.hud()), "Mission 0 doesn't start again");

    assert.deepEqual(errors, []);
    console.log(`VELOCITY browser: boot, sprint (${walk} -> ${sprint} km/h), barrier jump, enforcer fight, rescue, Mission 0 reward and save, reload passed.`);
  } catch (error) {
    await saveFailure("velocity", error, browser);
    throw error;
  } finally {
    if (browser) await browser.close();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
