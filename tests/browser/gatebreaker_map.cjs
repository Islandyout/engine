// GATEBREAKER M4, finding the way (GAME_DESIGN.md §13): in a player build
// with a saved hunter back in the district, the minimap shows at the top
// right; M opens the district map (the game gets no keys while it is open:
// W doesn't move the hunter) and M or Esc closes it; J opens the quest log
// and closes it; Officer Yoon, south of the hub, gives the dungeon break
// patrol (G, then Enter) and the tracker follows it. Zero page errors.
// Screenshots of the minimap, the map and the quest log go to
// build/browser-evidence (or $GB_SHOTS).
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { saveFailure } = require("./evidence.cjs");
const { testScene, serve, bot } = require("./gatebreaker_bot.cjs");
const { chromium } = require("playwright");

const SAVE = "lv=3;xp=500;pts=0;gold=200;fang=10;rank=E;q=3;day=2;daily=0;c1=1;sk=1;bag=2-2-1-5-0/3-2-1-7-1";
const SHOTS = process.env.GB_SHOTS || "build/browser-evidence";

(async () => {
  const server = await serve(await testScene());
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
    const { hud, waitHud, position, hold, walkTo } = bot(page);
    const gone = async (pattern, what, timeout = 30000) => {
      try {
        await page.waitForFunction((source) => !new RegExp(source).test(document.querySelector("#hud-text")?.textContent ?? ""), pattern.source, { timeout });
      } catch {
        throw new Error(`${what}: HUD still matches ${pattern} -- HUD: ${await hud()}`);
      }
    };
    const shot = (tag, clip) => page.screenshot({ path: path.join(SHOTS, `gatebreaker-map-${tag}.png`), ...(clip ? { clip } : {}) });

    // The minimap, once the welcome window has gone; the open Gate sites
    // and the quest givers are on it.
    await waitHud(/Welcome back/, "the Ledger greets a returning hunter");
    await waitHud(/Minimap: Gate Board \d+ m/, "the minimap, tracking the story quest's Gate Board", 300000);
    assert.match(await hud(), /Story quest/, "the tracker shows the story quest");
    await page.waitForTimeout(1500);
    await shot("minimap", { x: 960 - 190, y: 0, width: 190, height: 250 });
    await shot("hud");

    // M: the district map. The hunter can't walk while it is open.
    await page.keyboard.press("m");
    await waitHud(/DISTRICT MAP: .*-rank Gate: /, "the map, with the open Gate sites");
    await waitHud(/DISTRICT MAP: .*Officer Yoon/, "the map, with the quest givers");
    const before = await position();
    await hold("w", 1500);
    const after = await position();
    assert.ok(before && after && Math.hypot(after.x - before.x, after.z - before.z) < 0.05, `the hunter stays put under the map: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
    await page.waitForTimeout(500);
    await shot("map");
    await page.keyboard.press("m");
    await gone(/DISTRICT MAP/, "M closes the map");
    await waitHud(/Minimap/, "the minimap is back");
    await page.keyboard.press("m");
    await waitHud(/DISTRICT MAP/, "the map again");
    await page.keyboard.press("Escape");
    await gone(/DISTRICT MAP/, "Esc closes the map");

    // J: the quest log, and J again to close it.
    await page.keyboard.press("j");
    await waitHud(/QUEST LOG: .*STORY: Clear the Subway Tunnel.*DUNGEON BREAK PATROL: talk to Officer Yoon/, "the quest log");
    await page.waitForTimeout(600);
    await shot("quests");
    await page.keyboard.press("j");
    await gone(/QUEST LOG/, "J closes the quest log");

    // Officer Yoon, south of the hub: a ! over his head, G talks, Enter takes the patrol.
    await walkTo(3, 40.5, 0.8, 480000, /\[G\] Talk: Officer Yoon/);
    await waitHud(/! Officer Yoon/, "the ! over Officer Yoon");
    await waitHud(/\[G\] Talk: Officer Yoon {2}\(!\)/, "the talk prompt");
    await shot("yoon");
    await page.keyboard.press("g");
    await waitHud(/OFFICER YOON: SIDE QUEST: DUNGEON BREAK PATROL/, "Yoon's offer");
    await page.keyboard.press("Enter");
    await waitHud(/Quest taken: Dungeon break patrol/, "the patrol taken");
    await waitHud(/Dungeon break patrol {2}· {2}Day 2\sDefeat monsters \(streets or Gates\): 0\/8/, "the tracker follows the patrol");
    await page.keyboard.press("j");
    await waitHud(/◆ \[3\] DUNGEON BREAK PATROL: defeat monsters/, "the quest log tracks the patrol");
    await page.keyboard.press("j");
    assert.deepEqual(errors, []);
    console.log("GATEBREAKER M4 map: the minimap, M and Esc on the district map, J on the quest log, and Officer Yoon's patrol passed.");
  } catch (error) {
    await saveFailure("gatebreaker-map", error, browser);
    throw error;
  } finally {
    await browser?.close();
    server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
