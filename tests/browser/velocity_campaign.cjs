// VELOCITY's campaign after Mission 0 (games/my-games/velocity), played the
// way a player does: Streetlight (the robbery, the Shield Heavy, the
// device), No Brakes (catching the rig twice, the roadblock), Aftershock
// (three workers at Construction Rise), Breakline (the finale), then a
// mastery pick at Ward Dispatch and the save that keeps it. A long run:
// scheduled CI only, like GATEBREAKER's full playthroughs.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const { chromium } = require("playwright");
const { saveFailure } = require("./evidence.cjs");
const { serve, bot } = require("./gatebreaker_bot.cjs");

(async () => {
  const scene = JSON.parse(await fs.readFile("games/my-games/velocity/velocity.json", "utf8"));
  // props.fast: enemies spawn nearly beaten and the rig waits for Velocity.
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
    const playing = () => page.waitForFunction(() => /^PLAY/.test(document.querySelector("#status")?.textContent ?? ""), null, { timeout: 120000 });
    await page.goto(`http://127.0.0.1:${server.address().port}/engine/`);
    await playing();
    // Mission 0 done (the save format: version|missions|merit|picks).
    // (A game's save keys are namespaced by the page title.)
    await page.evaluate(() => localStorage.setItem(`game-engine-editor:save:${encodeURIComponent(document.title)}:velocity.save`, "1|m0|0|"));
    await page.reload();
    await playing();
    const b = bot(page);
    const MIN = 60000;
    await b.waitHud(/FREE ROAM[\s\S]*Next: STREETLIGHT/, "the save skips Mission 0");

    // Fights until the HUD matches `pattern`: locked on, a jab string, and
    // now and then a step back, so a fighter pressed up against Velocity
    // isn't inside the blows' reach.
    const fight = async (pattern, what, timeout = 8 * MIN) => {
      const end = Date.now() + timeout;
      for (let i = 0; !pattern.test(await b.hud()); i++) {
        if (Date.now() > end) throw new Error(`${what}: HUD never matched ${pattern} -- HUD: ${await b.hud()}`);
        if (!/Locked on/.test(await b.hud())) await page.keyboard.press("Tab");
        if (i % 4 === 3) await b.hold("s", 250);
        await page.keyboard.press("j");
        await page.waitForTimeout(250);
      }
    };
    // Walks up to (x, z) until `prompt` shows, presses G, and repeats
    // (stepping back up if Velocity drifted off) until `done` matches.
    const use = async (x, z, prompt, done, what, timeout = 8 * MIN) => {
      const end = Date.now() + timeout;
      while (!done.test(await b.hud())) {
        if (Date.now() > end) throw new Error(`${what}: HUD never matched ${done} -- HUD: ${await b.hud()}`);
        if (!prompt.test(await b.hud())) await b.walkTo(x, z, 1.2, 4 * MIN, prompt);
        await page.keyboard.press("g");
        await page.waitForTimeout(600);
      }
    };
    const route = async (points, near = 2, timeout = 10 * MIN, stop = undefined) => {
      for (const [x, z] of points) await b.walkTo(x, z, near, timeout, stop);
    };
    const start = async (x, z, title) => {
      await b.walkTo(x, z, 2.5, 10 * MIN, new RegExp(`G\\s+Start: ${title}`));
      await b.waitHud(new RegExp(`G\\s+Start: ${title}`), `${title}'s start`);
      await page.keyboard.press("g");
      await b.waitHud(new RegExp(title), `${title} starts`);
    };

    // Mission 1: Streetlight.
    await route([[0, -60], [24, -10]]);
    await start(32, -8, "STREETLIGHT");
    await fight(/Beat the Shield Heavy/, "the robbers");
    await fight(/Inspect the dropped device/, "the Shield Heavy");
    await use(33, 5.5, /G\s+Inspect the device/, /FREE ROAM[\s\S]*Next: NO BRAKES/, "the device");
    await page.screenshot({ path: "build/browser-evidence/velocity-campaign-1-streetlight.png" });

    // Mission 2: No Brakes. The rig heads north up Central Avenue; Velocity
    // runs with it, then follows its route to the roadblock on West Avenue.
    // (Routes keep to the streets: the blocks are solid.)
    await route([[12, 2], [9, -16]]);
    await start(6, -22, "NO BRAKES");
    await b.walkTo(0, 60, 3, 10 * MIN, /Disable the cell rig/);
    await b.waitHud(/Disable the cell rig/, "the rig caught twice");
    await route([[0, 64], [-64, 64], [-64, 26]], 2.5, 10 * MIN, /G\s+Disable/);
    await use(-64, 18, /G\s+Disable the kinetic cells/, /FREE ROAM[\s\S]*Next: AFTERSHOCK/, "the stopped rig");

    // Mission 3: Aftershock. The worker by the ramp, the one on the deck,
    // then the one in the yard's far corner.
    await route([[-64, 64], [56, 64], [66, 40]]);
    await start(66, 30, "AFTERSHOCK");
    const rescue = (x, z, n) => use(x, z, /G\s+Get them out/, new RegExp(`Rescue the workers \\(${n}/3\\)|FREE ROAM`), `worker ${n}`);
    await route([[66, 8], [80, 8]]);
    await rescue(80, 12, 1);
    await route([[86, 14], [86, 30]]);
    await rescue(86, 38, 2);
    await route([[86, 50], [94, 54]]);
    await rescue(97, 50, 3);
    await b.waitHud(/FREE ROAM[\s\S]*Next: BREAKLINE/, "Aftershock done");
    await page.screenshot({ path: "build/browser-evidence/velocity-campaign-3-aftershock.png" });

    // Mission 4: Breakline at Meridian Junction.
    await route([[94, 57], [64, 58], [64, 100], [8, 100]]);
    await start(0, 100, "BREAKLINE");
    await b.walkTo(0, 118, 3, 6 * MIN, /Defeat Breakline/);
    await b.waitHud(/Defeat Breakline/, "the boss appears");
    await page.screenshot({ path: "build/browser-evidence/velocity-campaign-4-breakline.png" });
    await fight(/FREE ROAM/, "Breakline");
    await b.waitHud(/The ward is yours/, "the campaign is done");

    // Ward Dispatch: a mastery pick, and Heroic (open after the finale).
    await route([[0, 64], [9, 10], [9, -56], [0, -62], [3, -84]]);
    await b.walkTo(5, -88, 1.5, 6 * MIN, /G\s+Ward Dispatch/);
    await page.keyboard.press("g");
    await b.waitHud(/WARD DISPATCH[\s\S]*Swift/, "the Dispatch window");
    await page.keyboard.press("Digit1");
    await b.waitHud(/\[x\] Swift/, "Swift picked");
    await page.keyboard.press("h");
    await b.waitHud(/Heroic: ON/, "Heroic on");
    const saved = await page.evaluate(() => localStorage.getItem(`game-engine-editor:save:${encodeURIComponent(document.title)}:velocity.save`));
    assert.match(saved, /^1\|m0,m1,m2,m3,m4\|\d+\|(heroic,swift|swift,heroic)$/, `the save: ${saved}`);
    await page.screenshot({ path: "build/browser-evidence/velocity-campaign-5-dispatch.png" });

    assert.deepEqual(errors, []);
    console.log("VELOCITY campaign: Streetlight, No Brakes, Aftershock, Breakline, mastery and Heroic at Dispatch, and the save passed.");
  } catch (error) {
    await saveFailure("velocity_campaign", error, browser);
    throw error;
  } finally {
    if (browser) await browser.close();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
