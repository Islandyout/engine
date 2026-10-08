// GATEBREAKER M4, time and comfort, in a player build with a saved Lv.5
// hunter standing at Smith Kang's stall at 21:57 on day 1: night falls on
// the clock (the HUD and the smith's prompt say so, and the forge closes
// while potions still sell), Esc opens the settings as a pause menu that
// stops the game, a setting changed there survives a reload, and holding
// Space out of a fight sprints faster than walking. Zero page errors.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const { saveFailure } = require("./evidence.cjs");
const { testScene, serve, bot } = require("./gatebreaker_bot.cjs");
const { chromium } = require("playwright");

const SAVE = "lv=5;xp=1500;pts=0;str=12;agi=11;vit=12;int=10;sen=13;gold=900;fang=60;dag=0;rank=E;q=5;day=1;daily=0;c1=2;c2=1;c3=0;sk=2";

(async () => {
  // The hub's arrival point moved to the smith's stall (and over 12 m from
  // the training construct, so Space sprints there).
  const scene = await testScene();
  const director = scene.entities.find((e) => e.name === "Director").components.Script;
  assert.ok(director.source.includes("local HUB_SPOT = { 0, 0.9, 47 }"));
  director.source = director.source.replace("local HUB_SPOT = { 0, 0.9, 47 }", "local HUB_SPOT = { 10, 0.9, 55.4 }");
  const server = await serve(scene);
  let browser;
  try {
    browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
    await fs.mkdir("build/browser-evidence", { recursive: true });
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    const errors = [];
    page.on("pageerror", (error) => {
      errors.push(error.message);
      console.log("page error:", error.stack ?? error.message);
    });
    page.on("console", (message) => {
      if (message.type() === "error" && !message.location().url.endsWith("/favicon.ico")) errors.push(message.text());
    });
    const url = `http://127.0.0.1:${server.address().port}/engine/`;
    const play = async () => page.waitForFunction(() => /^PLAY/.test(document.querySelector("#status")?.textContent ?? ""), null, { timeout: 120000 });
    await page.goto(url);
    await play();
    await page.evaluate((save) => {
      const key = (k) => `game-engine-editor:save:${encodeURIComponent(document.title)}:${k}`;
      localStorage.setItem(key("gb"), save);
      localStorage.setItem(key("gbsky"), "day=1;h=21.97");
      // Low quality: a software renderer draws it fast enough to keep the test short.
      localStorage.setItem("game-engine-player:settings", JSON.stringify({ quality: "low" }));
    }, SAVE);
    await page.reload();
    await play();
    const { hud, waitHud } = bot(page);
    const shot = (tag) => page.screenshot({ path: `build/browser-evidence/gatebreaker-time-${tag}.png` });
    // The simulation's tick count and the hunter's position, read together.
    const sample = async () => {
      const text = (await page.locator("#status").textContent()) ?? "";
      const ticks = Number(/(\d+) C\+\+ fixed ticks/.exec(text)?.[1]);
      const at = /Player \((-?[\d.]+), -?[\d.]+, (-?[\d.]+)\)/.exec(text);
      return { ticks, x: Number(at?.[1]), z: Number(at?.[2]) };
    };
    // Metres per simulated second while `keys` are held, after `warm` ms.
    const speed = async (keys, warm, ms) => {
      for (const key of keys) await page.keyboard.down(key);
      await page.waitForTimeout(warm);
      const a = await sample();
      await page.waitForTimeout(ms);
      const b = await sample();
      for (const key of [...keys].reverse()) await page.keyboard.up(key);
      assert.ok(b.ticks > a.ticks, "the game ran");
      return (Math.hypot(b.x - a.x, b.z - a.z) / (b.ticks - a.ticks)) * 60;
    };

    // Night falls at 22:00.
    await waitHud(/Day 1 · 21:5\d/, "the clock, from the save");
    await waitHud(/\[G\] Smith Kang: upgrade your daggers/, "the smith, open by day");
    await waitHud(/Day 1 · 22:0\d/, "night on the clock");
    await waitHud(/Smith Kang: potions · Upgrades open 06:00 \(in [78]:\d\d\)/, "the smith's night prompt");
    await page.waitForTimeout(1500);
    await shot("night");
    await page.keyboard.press("g");
    await waitHud(/The forge is cold till morning/, "the smith's night window");
    await page.keyboard.press("p");
    await waitHud(/One health potion/, "a potion, sold at night");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1500);
    assert.ok(!/CLANG/.test(await hud()), "no upgrade at night");
    await page.keyboard.press("Backspace");

    // Esc: the settings as a pause menu; the game waits.
    await page.keyboard.press("Escape");
    const panel = page.locator("#player-settings");
    await panel.waitFor({ state: "visible", timeout: 30000 });
    assert.equal(await panel.locator("h2").textContent(), "Paused");
    const paused = await sample();
    await page.waitForTimeout(2500);
    assert.equal((await sample()).ticks, paused.ticks, "no ticks while paused");
    assert.ok(await panel.locator('[data-action="dodge"]').isVisible(), "the key list");
    await shot("settings");
    await panel.locator('input[aria-label="Brightness"]').evaluate((input) => {
      input.value = "1.3";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    // (Set directly: a click waits on frames a software renderer is slow to draw.)
    await panel.locator('input[aria-label="Camera shake"]').evaluate((box) => {
      box.checked = false;
      box.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.keyboard.press("Escape");
    await panel.waitFor({ state: "detached", timeout: 30000 });
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("game-engine-player:settings") ?? "{}"));
    assert.equal(stored.brightness, 1.3);
    assert.equal(stored.shake, false);
    await page.waitForFunction((t) => Number(/(\d+) C\+\+ fixed ticks/.exec(document.querySelector("#status")?.textContent ?? "")?.[1]) > t + 30, paused.ticks, {
      timeout: 30000,
    });

    // Sprint: Space held out of a fight, against a walk (S: away from the stall).
    const walk = await speed(["s"], 1500, 3500);
    const sprint = await speed(["Space", "s"], 3500, 3500);
    console.log(`walk ${walk.toFixed(2)} m/s, sprint ${sprint.toFixed(2)} m/s`);
    assert.ok(walk > 4 && walk < 6, `walking at ${walk.toFixed(2)} m/s`);
    assert.ok(sprint > walk * 1.4, `sprinting at ${sprint.toFixed(2)} m/s`);

    // The settings survive a reload.
    await page.reload();
    await play();
    await waitHud(/Day 1 · \d\d:\d\d/, "the clock after the reload");
    await page.keyboard.press("Escape");
    await panel.waitFor({ state: "visible", timeout: 30000 });
    assert.equal(await panel.locator('input[aria-label="Brightness"]').inputValue(), "1.3");
    assert.equal(await panel.locator('input[aria-label="Camera shake"]').isChecked(), false);
    await panel.getByRole("button", { name: "Resume" }).evaluate((button) => button.click());
    await panel.waitFor({ state: "detached", timeout: 30000 });
    assert.deepEqual(errors, []);
    console.log("GATEBREAKER M4: nightfall, the smith by day, the Esc pause menu and its saved settings, and the sprint passed.");
  } catch (error) {
    await saveFailure("gatebreaker_time", error, browser);
    throw error;
  } finally {
    await browser?.close();
    server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
