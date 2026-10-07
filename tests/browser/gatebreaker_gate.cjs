// GATEBREAKER's first run (examples/gatebreaker/gatebreaker.json): the whole E-rank
// Gate in a player build: the prologue panels (skipped with Enter), the
// Ledger awakening, the tutorial (its steps pass on their own in the fast
// variant), rooms 1-3 sealing and opening, the Goblin Chieftain with its
// boss bar, the level-up and the new skill, with zero page errors. The
// variant (props.fast, 1-HP goblins that all close in, a 30-HP Chieftain)
// keeps it short; the hunter walks north swinging, steering back to the
// doorways between rooms (a cleared room sets it just short of the next).
const assert = require("node:assert/strict");
const { saveFailure } = require("./evidence.cjs");
const fs = require("node:fs/promises");
const { testScene, serve, bot } = require("./gatebreaker_bot.cjs");
const { chromium } = require("playwright");

(async () => {
  const server = await serve(await testScene());
  let browser;
  try {
    browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
    await fs.mkdir("build/browser-evidence", { recursive: true });
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    const errors = [];
    page.on("pageerror", (error) => {
      errors.push(error.message);
      // Printed as it happens: a script or frame error is the likeliest
      // cause of a later timeout.
      console.log("page error:", error.stack ?? error.message);
    });
    page.on("console", (message) => {
      if (message.type() === "error" && !message.location().url.endsWith("/favicon.ico")) errors.push(message.text());
    });
    await page.addInitScript(() => {
      Element.prototype.requestPointerLock = function () {
        return Promise.resolve();
      };
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/engine/`);
    await page.waitForFunction(() => /^PLAY/.test(document.querySelector("#status")?.textContent ?? ""), null, { timeout: 120000 });
    const { hud, waitHud, runGate } = bot(page);
    const seen = new Set();
    const note = async (pattern, tag) => {
      if (seen.has(tag) || !pattern.test(await hud())) return;
      seen.add(tag);
      await page.screenshot({ path: `build/browser-evidence/gatebreaker-gate-${tag}.png` });
    };

    // The prologue: panels, then the Ledger.
    await waitHud(/Panel 1 of 4: Seoul/, "the prologue's first panel");
    await page.screenshot({ path: "build/browser-evidence/gatebreaker-gate-prologue.png" });
    await page.keyboard.press("Enter");
    await waitHud(/THE LEDGER HAS OPENED/, "the Ledger awakens");
    await page.keyboard.press("Enter");
    await waitHud(/Tutorial \d\/6/, "the tutorial starts");
    await waitHud(/Enter the Gate/, "the tutorial completes", 120000);

    // North through the rooms, swinging; then the boss and the rewards.
    // CI's software renderer runs the simulation a few times slower than real
    // time; the whole Gate takes ~10 min locally and up to ~30 there.
    const deadline = Date.now() + 2700000;
    await runGate(0, /GATE CLEARED|LEVEL UP/, deadline, async () => {
      await note(/ROOM 1/, "room1");
      await note(/ROOM 3/, "room3");
      await note(/GOBLIN CHIEFTAIN/, "boss");
    });
    for (const tag of ["room1", "room3", "boss"]) assert.ok(seen.has(tag), `passed through ${tag}`);
    await waitHud(/LEVEL UP/, "the level-up");
    await waitHud(/NEW SKILL: SHADOW STEP DASH/, "the new skill");
    await waitHud(/E-RANK GATE: CLEARED/, "the Gate cleared");
    await waitHud(/Q: ready/, "Shadow Step Dash unlocked on Q");
    await waitHud(/THE HUNTER ASSOCIATION/, "back in the hub");
    await waitHud(/Quest: Upgrade your daggers/, "the next quest");
    await page.screenshot({ path: "build/browser-evidence/gatebreaker-gate-cleared.png" });
    assert.deepEqual(errors, []);
    console.log("GATEBREAKER M1: prologue, Ledger, tutorial, rooms 1-3, the Goblin Chieftain and the rewards passed.");
  } catch (error) {
    await saveFailure("gatebreaker_gate", error, browser);
    throw error;
  } finally {
    await browser?.close();
    server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
