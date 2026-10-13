// The City Template (games/city-template) as a town that works: a watcher
// script added to the scene follows every car, person and dog for a minute
// of play and reports what it saw. Traffic flows and stops at red lights,
// people wait at the kerb for the walk light and never walk in the road
// away from a crosswalk, and dogs stay with their owners.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const { chromium } = require("playwright");
const { saveFailure } = require("./evidence.cjs");
const { serve, bot } = require("./gatebreaker_bot.cjs");

const WATCH = `
-- @prop lines ""
-- @prop dogs ""
-- Lines of the road grid, and who walks which dog (from the test).
local lines = {}
for v in props.lines:gmatch("[^,]+") do lines[#lines + 1] = tonumber(v) end
local KERB, STOP = 4, 7
local cars, people, dogs = {}, {}, {}
local clock, report = 0, 0
local stats = { moved = 0, walked = 0, stops = 0, waits = 0, jay = 0, far = 0 }
local function nearest(v)
  local best, at = 1e9, 0
  for _, l in ipairs(lines) do if math.abs(v - l) < best then best, at = math.abs(v - l), l end end
  return at, best
end
function on_start()
  for k = 1, 40 do
    local id = world.find("Traffic " .. k)
    if id then local x, _, z = world.position(id); cars[#cars + 1] = { id = id, x0 = x, z0 = z, far = 0, still = 0, counted = false, lx = x, lz = z } end
    id = world.find("Pedestrian " .. k)
    if id then local x, _, z = world.position(id); people[#people + 1] = { id = id, still = 0, counted = false, lx = x, lz = z, x0 = x, z0 = z, far = 0 } end
  end
  for pair in props.dogs:gmatch("[^;]+") do
    local dog, owner = pair:match("([^=]+)=(.+)")
    dogs[#dogs + 1] = { dog = world.find(dog), owner = world.find(owner) }
  end
end
function on_tick(dt)
  clock = clock + dt
  for _, c in ipairs(cars) do
    if world.alive(c.id) then
      local x, _, z = world.position(c.id)
      c.far = math.max(c.far, math.sqrt((x - c.x0) ^ 2 + (z - c.z0) ^ 2))
      local moved = math.sqrt((x - c.lx) ^ 2 + (z - c.lz) ^ 2)
      c.lx, c.lz = x, z
      c.still = moved < 0.02 and c.still + dt or 0
      -- Stopped on its own lane just before a junction (not in it).
      local jx, dx = nearest(x)
      local jz, dz = nearest(z)
      local waiting = (dx < KERB and dz > STOP and dz < STOP + 9) or (dz < KERB and dx > STOP and dx < STOP + 9)
      if waiting and c.still > 2 and not c.counted then c.counted = true; stats.stops = stats.stops + 1 end
    end
  end
  for _, p in ipairs(people) do
    if world.alive(p.id) then
      local x, _, z = world.position(p.id)
      local moved = math.sqrt((x - p.lx) ^ 2 + (z - p.lz) ^ 2)
      p.lx, p.lz = x, z
      p.far = math.max(p.far, math.sqrt((x - p.x0) ^ 2 + (z - p.z0) ^ 2))
      p.still = moved < 0.01 and p.still + dt or 0
      local _, dx = nearest(x)
      local _, dz = nearest(z)
      -- Waiting at a corner kerb.
      if p.still > 2 and dx < KERB + 4 and dz < KERB + 4 and not p.counted then p.counted = true; stats.waits = stats.waits + 1 end
      -- In a carriageway away from any junction's crosswalks.
      if (dx < KERB - 0.6 and dz > STOP + 1) or (dz < KERB - 0.6 and dx > STOP + 1) then stats.jay = stats.jay + 1 end
    end
  end
  if clock > 5 then
    for _, d in ipairs(dogs) do
      if d.dog and d.owner and world.alive(d.dog) and world.alive(d.owner) then
        local ax, _, az = world.position(d.dog)
        local bx, _, bz = world.position(d.owner)
        if math.sqrt((ax - bx) ^ 2 + (az - bz) ^ 2) > 6 then stats.far = stats.far + 1 end
      end
    end
  end
  report = report + dt
  if report >= 1 then
    report = 0
    stats.moved = 0
    for _, c in ipairs(cars) do if c.far > 40 then stats.moved = stats.moved + 1 end end
    stats.walked = 0
    for _, p in ipairs(people) do if p.far > 20 then stats.walked = stats.walked + 1 end end
    ui.set_text("Check", string.format("CITY t=%d cars=%d moved=%d stops=%d people=%d walked=%d waits=%d jay=%d dogfar=%d",
      math.floor(clock), #cars, stats.moved, stats.stops, #people, stats.walked, stats.waits, stats.jay, stats.far))
  end
end
`;

(async () => {
  const scene = JSON.parse(await fs.readFile("examples/city/city-template.json", "utf8"));
  const lines = [...new Set(scene.entities.filter((e) => e.name.startsWith("Signal ")).map((e) => e.components.Transform.position.x))].sort((a, b) => a - b);
  // The watcher checks the simulation, not the picture: drop shadows and
  // post-processing so the software renderer keeps a usable frame rate.
  const environment = scene.entities.find((e) => e.name === "Environment").components;
  environment.Environment.shadows = false;
  delete environment.PostProcessing;
  const dogs = scene.entities.filter((e) => e.name.startsWith("Dog ")).map((e) => `${e.name}=${e.components.Walker.follow}`).join(";");
  // A HUD line for the watcher, shaped like VELOCITY's own text UI.
  const velocity = JSON.parse(await fs.readFile("games/my-games/velocity/velocity.json", "utf8"));
  const text = velocity.entities.find((e) => e.name === "Objective").components.UI;
  scene.entities.push(
    { name: "Check", components: { Transform: { position: { x: 0, y: 0, z: 0 } }, UI: { ...text, text: "", anchor: "top-left", offsetX: 20, offsetY: 20, width: 900, fontSize: 14 } } },
    { name: "Watcher", components: { Transform: { position: { x: 0, y: -50, z: 0 } }, Script: { source: WATCH, props: { lines: lines.join(","), dogs } } } },
  );
  const server = await serve(scene);
  let browser;
  try {
    browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
    await fs.mkdir("build/browser-evidence", { recursive: true });
    const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" && !message.location().url.endsWith("/favicon.ico")) errors.push(message.text());
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/engine/`);
    await page.waitForFunction(() => /^PLAY/.test(document.querySelector("#status")?.textContent ?? ""), null, { timeout: 120000 });
    const b = bot(page);
    await b.waitHud(/CITY t=\d+/, "the watcher reports");
    await page.screenshot({ path: "build/browser-evidence/city-street.png" });
    // A minute of the town going about its day.
    await b.waitHud(/CITY t=(6\d|[7-9]\d|\d{3,})/, "a minute of play", 15 * 60000);
    const hud = await b.hud();
    const read = (key) => Number(new RegExp(`${key}=(\\d+)`).exec(hud)?.[1]);
    console.log(hud.match(/CITY[^\n]*/)?.[0]);
    assert.ok(read("cars") >= 10 && read("people") >= 30, `the town is populated: ${hud}`);
    assert.ok(read("moved") >= read("cars") * 0.6, `traffic flows: ${hud}`);
    assert.ok(read("stops") >= 3, `cars stop at red lights: ${hud}`);
    assert.ok(read("walked") >= read("people") * 0.8, `people walk their routes: ${hud}`);
    assert.ok(read("waits") >= 3, `people wait at the kerb to cross: ${hud}`);
    assert.equal(read("jay"), 0, `nobody walks in the road away from a crosswalk: ${hud}`);
    assert.equal(read("dogfar"), 0, `dogs stay with their owners: ${hud}`);
    await page.screenshot({ path: "build/browser-evidence/city-minute.png" });
    assert.deepEqual(errors, []);
    console.log("CITY TEMPLATE: traffic flows and stops on red, people walk, wait to cross and keep off the road, dogs follow, no errors.");
  } catch (error) {
    await saveFailure("city", error, browser);
    throw error;
  } finally {
    if (browser) await browser.close();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
