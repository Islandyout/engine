// GATEBREAKER M4, the field (GAME_DESIGN.md §13 "The world"), in a player
// build with a saved Lv.3 hunter: a dungeon break's pack and the day's
// field boss stand in the district, the hunter fights them, the kills pay
// out through the Ledger (gold, and loot he picks up off the street), and
// walking into a Gate site's rift and pressing G enters that Gate. Zero
// page errors. The test copy of the scene (props.fast, 1-HP goblins, a
// 30-HP Chieftain) moves the boss's break to the Association's doorstep,
// 12 m from where the hunter starts (inside its pack's 16 m leash, so they
// come to him), and a Gate site into the square's east side, past that
// leash; the training construct
// goes, so Tab only ever locks on to the field's enemies.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const { saveFailure } = require("./evidence.cjs");
const { testScene, serve, bot } = require("./gatebreaker_bot.cjs");
const { chromium } = require("playwright");

const SAVE = "lv=3;xp=500;pts=0;str=12;agi=10;vit=12;int=10;sen=10;gold=100;fang=10;dag=0;rank=E;q=3;day=1;daily=0;c1=1;c2=0;c3=0;sk=1";
const ITEM = /(Common|Rare|Epic|Legendary) [A-Za-z ]+ (Body armor|Bracers|Trousers|Boots|Ring|Necklace)|\+1 (Health|Mana) potion/;

(async () => {
  const scene = await testScene();
  const move = (name, x, y, z) => {
    scene.entities.find((e) => e.name === name).components.Transform.position = { x, y, z };
  };
  scene.entities.find((e) => e.name === "World").components.Script.props.fast = true;
  // Day 1: the field boss waits in zone 2, and sites 1 and 2 are open.
  move("Field zone 2", 0, 0.03, 35);
  move("Gate site 1", 14, 3.6, 49);
  scene.entities = scene.entities.filter((e) => e.name !== "Hub Construct");
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
    const { hud, waitHud, walkTo, hold, runGate } = bot(page);
    // Evidence only: a slow software renderer can miss a screenshot's
    // deadline, and that shouldn't fail the run.
    const shot = (tag) =>
      page.screenshot({ path: `build/browser-evidence/gatebreaker-field-${tag}.png`, timeout: 60000 }).catch((e) => console.log("screenshot skipped:", tag, e.message.split("\n")[0]));
    const gold = async () => Number(/(\d+) G {2}·/.exec(await hud())?.[1] ?? NaN);

    await waitHud(/Welcome back/, "the Ledger greets a returning hunter");
    await waitHud(/Lv\.3 {2}E-rank/, "the save's level");
    // The break: the field boss and its pack stand there.
    await waitHud(/FIELD BOSS: Goblin Chieftain guards the break/, "the field boss's break");
    const before = await gold();
    await shot("break");

    // They come for him: fight until the boss falls, then the rest of its
    // pack until the break is quiet. Anything picked up on the way shows in
    // the feed (bottom right) for 5 s.
    let looted = false;
    const watch = async () => {
      if (ITEM.test(await hud())) looted = true;
    };
    await runGate(0, /FIELD BOSS DOWN: Goblin Chieftain/, Date.now() + 360000, watch);
    await watch();
    await shot("boss-down");
    const after = await gold();
    // The Chieftain alone pays 40 G; its pack more.
    assert.ok(after >= before + 40, `field kills pay gold (${before} -> ${after})`);
    await runGate(0, /is quiet\. More spill out/, Date.now() + 300000, watch);
    if (/Locked on/.test(await hud())) await page.keyboard.press("Tab");

    // Loot: a Gate master always drops gear where it fell; walk over it.
    await watch();
    for (const key of ["w", "a", "s", "s", "d", "d", "w", "w", "a", "a", "w", "d"]) {
      if (looted) break;
      await hold(key, 900);
      looted = ITEM.test(await hud());
    }
    assert.ok(looted, `picked up loot -- HUD: ${await hud()}`);
    await shot("loot");

    // A Gate site's rift: walking into it, G enters its Gate.
    await walkTo(12.5, 49, 1.2, 300000, /\[G\] Enter: Goblin Cave \(E\)/);
    await waitHud(/\[G\] Enter: Goblin Cave \(E\)/, "the rift's prompt");
    await shot("rift");
    await page.keyboard.press("g");
    await waitHud(/GOBLIN CAVE {2}· {2}E-RANK GATE/, "into the Goblin Cave from the rift");
    await shot("gate");
    assert.deepEqual(errors, []);
    console.log("GATEBREAKER M4: a field boss and its pack, field kills through the Ledger, loot, and a Gate entered from its rift passed.");
  } catch (error) {
    await saveFailure("gatebreaker_field", error, browser);
    throw error;
  } finally {
    await browser?.close();
    server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
