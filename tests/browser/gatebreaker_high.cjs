// GATEBREAKER M4, the A and S Gates, in a player build with a saved Lv.20
// B-rank hunter: the Gate Board lists all seven Gates and says why the S
// Gate is locked; the Bloodstone Citadel (the A-rank test) runs room by
// room to the Crimson Castellan, whose phase 2 (the Crimson Rend) starts;
// the B -> A ceremony plays; the Eclipse Spire (the S-rank test) opens, its
// third room sends a second wave, the Eclipse Herald seals itself behind
// two Wardens until they fall; the A -> S ceremony plays, and the save says
// S-rank after a reload. Zero page errors.
//
// The test copy of the scene (props.fast, 1-HP enemies that close in) gives
// the two Gate masters 600 health, so their phase 2 plays out against the
// bot's plain swings. Screenshots of every new room and boss go to
// build/browser-evidence (or GB_SHOTS).
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const { saveFailure } = require("./evidence.cjs");
const { testScene, serve, bot } = require("./gatebreaker_bot.cjs");
const { chromium } = require("playwright");

// Lv.20 at B-rank, past the B-rank test, quest 11 (the A-rank test), with
// the strength to finish a boss with plain swings and the health to last.
const SAVE =
  "lv=20;xp=37300;pts=0;str=40;agi=14;vit=90;int=12;sen=14;gold=6000;fang=200;dag=5;rank=B;q=11;day=4;daily=1;c1=3;c2=3;c3=2;c4=2;c5=2;c6=0;c7=0;sk=2";
const SHOTS = process.env.GB_SHOTS || "build/browser-evidence";

(async () => {
  const scene = await testScene();
  for (const name of ["Crimson Castellan", "Eclipse Herald"]) {
    const health = scene.prefabs[name].components.Health;
    health.current = health.maximum = 600;
  }
  const server = await serve(scene);
  let browser;
  try {
    browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
    await fs.mkdir(SHOTS, { recursive: true });
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    const errors = [];
    page.on("pageerror", (error) => {
      errors.push(error.message);
      console.log("page error:", error.stack ?? error.message);
    });
    page.on("console", (message) => {
      if (message.type() === "error" && !message.location().url.endsWith("/favicon.ico")) errors.push(message.text());
      // A script error is logged, not thrown: show it as it happens.
      if (/lua|script/i.test(message.text()) && /error/i.test(message.text())) console.log("console:", message.text());
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
    await page.evaluate((text) => localStorage.setItem(`game-engine-editor:save:${encodeURIComponent(document.title)}:gb`, text), SAVE);
    await page.reload();
    await play();
    const { hud, waitHud, walkTo, runGate } = bot(page);
    const shot = (tag) => page.screenshot({ path: `${SHOTS}/gatebreaker-high-${tag}.png` });

    await waitHud(/Welcome back/, "the Ledger greets a returning hunter");
    await waitHud(/Lv\.20 {2}B-rank/, "the save's level and rank");
    await waitHud(/Quest: Pass the A-rank test/, "the A-rank story quest");

    // The Gate Board: seven Gates, the S Gate locked until A-rank.
    const board = async () => {
      await walkTo(-9, 55, 0.8, 480000, /\[G\] Gate Board/);
      await waitHud(/\[G\] Gate Board/, "the board's prompt");
      await page.keyboard.press("g");
      await waitHud(/\[7\] S-rank {2}Eclipse Spire/, "the board lists all seven Gates");
    };
    await board();
    await waitHud(/\[6\] A-rank {2}Bloodstone Citadel {3}\(not cleared\)/, "the A Gate open");
    await waitHud(/\[7\] S-rank {2}Eclipse Spire {3}\(LOCKED: needs rank A\)/, "the S Gate locked, and why");
    await shot("board");

    // Runs a Gate along x = lineX, screenshotting each moment in `moments`
    // the first time the HUD shows it; every one must show. While the
    // Herald is sealed the bot lets go of its lock now and then, so the
    // next lock can land on a Warden (the adds that must die first).
    const run = async (lineX, done, moments) => {
      const seen = new Set();
      let steps = 0;
      await page.waitForTimeout(1500);
      await shot(`arrival-${lineX}`);
      await runGate(lineX, done, Date.now() + 2700000, async () => {
        const text = await hud();
        for (const [tag, pattern] of moments)
          if (!seen.has(tag) && pattern.test(text)) {
            seen.add(tag);
            await shot(tag);
          }
        if (seen.has("herald-sealed") && !seen.has("herald-open") && ++steps % 3 === 0 && /Locked on/.test(text)) await page.keyboard.press("Tab");
      });
      for (const [tag] of moments) assert.ok(seen.has(tag), `saw ${tag}`);
    };
    // Space skips the ceremony's panels, as a player can.
    const ceremony = async (rankUp) => {
      for (const until = Date.now() + 300000; !rankUp.test(await hud()); ) {
        if (Date.now() > until) throw new Error(`the rank-up ceremony never showed -- HUD: ${await hud()}`);
        if (/Panel \d of 3/.test(await hud())) await page.keyboard.press("Space");
        await page.waitForTimeout(500);
      }
    };

    // The A-rank test.
    await page.keyboard.press("Digit6");
    await waitHud(/BLOODSTONE CITADEL/, "into the Bloodstone Citadel");
    await run(360, /GATE CLEARED|Panel \d of 3: |RANK UP: B -> A/, [
      ["barbican", /BARBICAN/],
      ["chapel", /BLOOD CHAPEL/],
      ["gallery", /THRONE GALLERY/],
      ["castellan", /CRIMSON CASTELLAN/],
      ["castellan-phase2", /Crimson Rend/],
    ]);
    await ceremony(/RANK UP: B -> A/);
    await shot("rankup-a");
    await page.keyboard.press("Enter");
    await waitHud(/Lv\.\d+ {2}A-rank/, "A-rank on the hunter line");
    await waitHud(/Quest: Pass the S-rank test/, "the S-rank story quest");

    // The S-rank test.
    await board();
    await waitHud(/\[6\] A-rank {2}Bloodstone Citadel {3}\(cleared 1x\)/, "the A Gate cleared once");
    await page.keyboard.press("Digit7");
    await waitHud(/ECLIPSE SPIRE/, "into the Eclipse Spire");
    await run(-360, /GATE CLEARED|Panel \d of 3: |RANK UP: A -> S/, [
      ["causeway", /SHATTERED CAUSEWAY/],
      ["ash", /HALL OF ASH/],
      ["stair", /ECLIPSE STAIR/],
      ["wave", /SECOND WAVE/],
      ["herald", /ECLIPSE HERALD/],
      ["herald-sealed", /seals itself in the eclipse/],
      ["herald-open", /THE SEAL SHATTERS/],
    ]);
    await ceremony(/RANK UP: A -> S/);
    await shot("rankup-s");
    await page.keyboard.press("Enter");
    await waitHud(/Lv\.\d+ {2}S-rank/, "S-rank on the hunter line");

    // The save survives a reload.
    await page.reload();
    await play();
    await waitHud(/Welcome back/, "back after the reload");
    await waitHud(/S-rank/, "the rank, saved");
    await waitHud(/Quest: Rank S/, "the last quest, saved");
    assert.deepEqual(errors, []);
    console.log("GATEBREAKER M4: the Gate Board, the A-rank test, the Castellan's phase 2, B -> A, the S-rank test, the second wave, the Herald's seal, A -> S and the save passed.");
  } catch (error) {
    await saveFailure("gatebreaker_high", error, browser);
    throw error;
  } finally {
    await browser?.close();
    server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
