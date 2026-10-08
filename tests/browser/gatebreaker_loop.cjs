// GATEBREAKER M2, the loop (GAME_DESIGN.md §4), in a player build with a
// saved Lv.5 hunter: the hub greets them back, Smith Kang upgrades the
// daggers, going home without the Daily Quest starts the penalty quest,
// the training drill gives a stat point (spent in the status window), the
// Gate Board sends the hunter into the D-rank test, the Goblin Warlord
// falls, the rank-up ceremony plays, and after a reload the save still says
// D-rank, daggers +1, day 3. Zero page errors. The test copy of the scene
// (props.fast, 1-HP goblins, a 30-HP Warlord) keeps it short.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const { saveFailure } = require("./evidence.cjs");
const { testScene, serve, bot } = require("./gatebreaker_bot.cjs");
const { chromium } = require("playwright");

const SAVE = "lv=5;xp=1500;pts=0;str=12;agi=11;vit=12;int=10;sen=13;gold=900;fang=60;dag=0;rank=E;q=5;day=1;daily=0;c1=2;c2=1;c3=0;sk=2";

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
    const url = `http://127.0.0.1:${server.address().port}/engine/`;
    const play = async () => page.waitForFunction(() => /^PLAY/.test(document.querySelector("#status")?.textContent ?? ""), null, { timeout: 120000 });
    await page.goto(url);
    await play();
    // The save the game would have written by now (save.set's key).
    await page.evaluate((text) => localStorage.setItem(`game-engine-editor:save:${encodeURIComponent(document.title)}:gb`, text), SAVE);
    await page.reload();
    await play();
    const { hud, waitHud, walkTo, runGate } = bot(page);
    const shot = (tag) => page.screenshot({ path: `build/browser-evidence/gatebreaker-loop-${tag}.png` });

    await waitHud(/Welcome back/, "the Ledger greets a returning hunter");
    await waitHud(/Lv\.5 {2}E-rank/, "the save's level and rank");
    await waitHud(/Quest: Pass the D-rank test/, "the story quest");
    await page.waitForTimeout(1500);
    await shot("hub");

    // Smith Kang: +1 daggers for 100 G and 6 fangs.
    await walkTo(10, 55.6, 0.8, 480000, /\[G\] Smith Kang/);
    await waitHud(/\[G\] Smith Kang/, "the smith's prompt");
    await page.keyboard.press("g");
    await waitHud(/Twin daggers \+0/, "the smith's menu");
    await page.keyboard.press("Enter");
    await waitHud(/Your daggers are now \+1/, "the upgrade");
    await waitHud(/800 G {2}·  54 fangs {2}·  daggers \+1/, "the price paid");
    await shot("smith");
    await page.keyboard.press("Backspace");

    // Home without the Daily Quest: the penalty quest, then a new day.
    await walkTo(9.6, 43, 0.8, 480000, /\[G\] Go home/);
    await waitHud(/\[G\] Go home/, "the door's prompt");
    await page.keyboard.press("g");
    await waitHud(/PENALTY QUEST: survive/, "the penalty quest");
    await shot("penalty");
    await waitHud(/Day 2/, "the next day after the penalty", 60000);

    // The Daily Quest: the drill on the mat, a stat point, spent with C.
    await walkTo(-7.5, 47, 0.8, 480000, /\[G\] Daily Quest/);
    await waitHud(/\[G\] Daily Quest/, "the mat's prompt");
    await page.keyboard.press("g");
    await waitHud(/DAILY DRILL/, "the drill");
    await waitHud(/DAILY QUEST COMPLETE/, "the drill's reward");
    await page.keyboard.press("c");
    await waitHud(/1 stat points/, "the status window with the point");
    await page.keyboard.press("Digit2");
    await waitHud(/AGI 12/, "a point spent on AGI");
    await shot("status");
    await page.keyboard.press("c");

    // Home with the drill done: a new day, saved.
    await walkTo(9.6, 43, 0.8, 480000, /\[G\] Go home/);
    await page.keyboard.press("g");
    await waitHud(/A NEW DAY/, "resting");
    await waitHud(/Day 3/, "day 3");

    // The Gate Board: the D-rank test.
    await walkTo(-9, 55, 0.8, 480000, /\[G\] Gate Board/);
    await waitHud(/\[G\] Gate Board/, "the board's prompt");
    await page.keyboard.press("g");
    await waitHud(/\[3\] D-rank {2}Goblin Fortress/, "the board lists the D-rank test");
    await shot("board");
    await page.keyboard.press("Digit3");
    await waitHud(/GOBLIN FORTRESS/, "into the Goblin Fortress");
    const seen = new Set();
    // In test mode the clear window lasts 3 s and the rank-up ceremony
    // follows it, so either one ends the run.
    await runGate(-120, /GATE CLEARED|Panel \d of 3: |RANK UP: E -> D/, Date.now() + 2700000, async () => {
      const text = await hud();
      for (const [tag, pattern] of [
        ["gatehouse", /GATEHOUSE/],
        ["warhall", /WAR HALL/],
        ["warlord", /GOBLIN WARLORD/],
      ])
        if (!seen.has(tag) && pattern.test(text)) {
          seen.add(tag);
          await shot(tag);
        }
    });
    for (const tag of ["gatehouse", "warhall", "warlord"]) assert.ok(seen.has(tag), `passed through ${tag}`);
    // Space skips the ceremony's panels, as a player can: on a slow
    // software renderer they take minutes.
    for (const until = Date.now() + 300000; !/RANK UP: E -> D/.test(await hud()); ) {
      if (Date.now() > until) throw new Error(`the rank-up ceremony never showed -- HUD: ${await hud()}`);
      if (/Panel \d of 3/.test(await hud())) await page.keyboard.press("Space");
      await page.waitForTimeout(500);
    }
    await shot("rankup");
    await page.keyboard.press("Enter");
    await waitHud(/Lv\.\d+ {2}D-rank/, "D-rank on the hunter line");

    // The save survives a reload.
    await page.reload();
    await play();
    await waitHud(/Welcome back/, "back after the reload");
    await waitHud(/D-rank .*daggers \+1/, "the rank and the daggers, saved");
    await waitHud(/Day 3/, "the day, saved");
    assert.deepEqual(errors, []);
    console.log("GATEBREAKER M2: hub, smith, penalty, Daily Quest, status, Gate Board, the D-rank test, rank-up and the save passed.");
  } catch (error) {
    await saveFailure("gatebreaker_loop", error, browser);
    throw error;
  } finally {
    await browser?.close();
    server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
