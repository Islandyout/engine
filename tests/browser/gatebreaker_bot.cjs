// What GATEBREAKER's browser tests share: the player build served with a
// test copy of the scene, and a bot that walks and fights with the
// keyboard and mouse the way a player does.
//
// The camera orbits only when dragged, and keys move the hunter relative to
// it, so the bot measures the heading W gives (the HUD's "Player (x, y, z)")
// and drags the camera until W heads where it wants to go.
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

// The scene, with every script's props.fast on, 1-HP enemies (30 HP
// bosses), and archers and shamans that come to the hunter (their ranged
// brain has its own unit test), so the bot never chases one round a room.
async function testScene() {
  const scene = JSON.parse(await fs.readFile("examples/gatebreaker/gatebreaker.json", "utf8"));
  for (const entity of scene.entities) if (["Director", "Ledger", "Hub"].includes(entity.name)) entity.components.Script.props.fast = true;
  for (const [name, prefab] of Object.entries(scene.prefabs)) {
    const c = prefab.components;
    const hp = /Chieftain|Brute|Warlord/.test(name) ? 30 : 1;
    c.Health.current = c.Health.maximum = hp;
    c.Melee.range = 0;
  }
  return scene;
}

// Serves build/site with `scene` embedded as the exported scene.
async function serve(scene) {
  const root = path.resolve("build/site");
  const index = await fs.readFile(path.join(root, "index.html"), "utf8");
  const server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url, "http://localhost").pathname.replace(/^\/engine\//, "");
    if (pathname === "" || pathname === "index.html") {
      const text = JSON.stringify(scene).replace(/</g, "\\u003c");
      res.setHeader("Content-Type", "text/html");
      res.end(index.replace("</body>", () => `<script type="application/json" id="exported-scene">${text}</script>\n</body>`));
      return;
    }
    const file = path.resolve(root, pathname);
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(404).end();
      return;
    }
    try {
      res.setHeader("Content-Type", { ".js": "text/javascript", ".css": "text/css", ".glb": "model/gltf-binary" }[path.extname(file)] || "text/plain");
      res.end(await fs.readFile(file));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return server;
}

function bot(page) {
  const hud = async () => (await page.locator("#hud-text").textContent()) ?? "";
  const waitHud = async (pattern, what, timeout = 120000) => {
    try {
      await page.waitForFunction((source) => new RegExp(source).test(document.querySelector("#hud-text")?.textContent ?? ""), pattern.source, { timeout });
    } catch {
      throw new Error(`${what}: HUD never matched ${pattern} -- HUD: ${await hud()}`);
    }
  };
  const position = async () => {
    const m = /Player \((-?[\d.]+), -?[\d.]+, (-?[\d.]+)\)/.exec((await page.locator("#status").textContent()) ?? "");
    return m ? { x: Number(m[1]), z: Number(m[2]) } : undefined;
  };
  const hold = async (key, ms) => {
    await page.keyboard.down(key);
    await page.waitForTimeout(ms);
    await page.keyboard.up(key);
  };
  // Turns the camera so W's heading turns by `yaw` (radians, + = left).
  // Dragging with any button turns the rig by -dx * 0.005 (default
  // sensitivity); the button's own action happens too: middle toggles
  // lock-on (nothing to lock on to between rooms), left swings once.
  const turn = async (yaw, button = "middle") => {
    const box = await page.locator("#viewport").boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down({ button });
    await page.mouse.move(cx + yaw / 0.005, cy, { steps: 8 });
    await page.mouse.up({ button });
  };
  const yawOf = (dx, dz) => Math.atan2(-dx, -dz);
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

  // Walks to (x, z) in the open (the hub): W in short steps, turning the
  // camera after each until W heads at the target.
  const walkTo = async (x, z, near = 0.8, timeout = 240000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      // Locked on (the hub has a training construct), W heads at the target.
      if (/Locked on/.test(await hud())) await page.keyboard.press("Tab");
      const from = await position();
      if (!from) {
        if (process.env.GATE_DEBUG) console.log("no position:", ((await page.locator("#status").textContent()) ?? "").slice(0, 200));
        await page.waitForTimeout(500);
        continue;
      }
      const far = Math.hypot(x - from.x, z - from.z);
      if (far < near) return;
      // Long presses: headless software rendering runs the simulation a
      // few times slower than real time.
      await hold("w", Math.min(3000, 700 + far * 200));
      const to = await position();
      if (!to) continue;
      const d = { x: to.x - from.x, z: to.z - from.z };
      if (Math.hypot(d.x, d.z) < 0.05) {
        if (process.env.GATE_DEBUG) console.log("walk stuck at", JSON.stringify(to));
        await hold("s", 300);
        await hold("a", 500);
        continue;
      }
      const off = wrap(yawOf(d.x, d.z) - yawOf(x - to.x, z - to.z));
      if (process.env.GATE_DEBUG) console.log("walk", JSON.stringify(from), "->", JSON.stringify(to), "turn", off.toFixed(2));
      // A left-button drag: a middle one would lock on to the construct.
      if (Math.abs(off) > 0.1) await turn(off, "left");
    }
    throw new Error(`never reached (${x}, ${z}); at ${JSON.stringify(await position())}`);
  };

  // North along x = lineX, where a Gate's doorways are: first the camera is
  // turned to face north (W's measured heading says how far off it is);
  // then A/D line up with the doorway.
  let heading;
  let aligned = false;
  const travel = async (lineX) => {
    if (/Locked on/.test(await hud())) {
      await page.keyboard.press("Tab");
      aligned = false;
    }
    const from = await position();
    if (!from) return;
    const dx = from.x - lineX;
    if (aligned && Math.abs(dx) > 0.4) {
      await hold(dx > 0 ? "a" : "d", Math.min(900, 150 + Math.abs(dx) * 250));
      const after = await position();
      // Pressed against a wall: back off it first.
      if (after && Math.abs(after.x - from.x) < 0.1) await hold("s", 500);
      return;
    }
    await hold("w", aligned ? 2500 : 1000);
    const to = await position();
    if (!to) return;
    const d = { x: to.x - from.x, z: to.z - from.z };
    const length = Math.hypot(d.x, d.z);
    if (length < 0.2) {
      // Blocked (on a doorway's edge): back off, then step toward the
      // middle line. The camera faces north once aligned; before that the
      // last heading says which key goes which way.
      await hold("s", 500);
      const west = dx > 0;
      const right = heading ? -heading.z * (west ? -1 : 1) > 0 : !west;
      // Long enough to clear the jamb (the opening is 2 m); if it went
      // the wrong way, come back past the middle the other way.
      const before = await position();
      await hold(right ? "d" : "a", 1300);
      const after = await position();
      if (before && after && Math.abs(after.x - lineX) > Math.abs(before.x - lineX)) await hold(right ? "a" : "d", 2400);
      aligned = false;
      return;
    }
    heading = { x: d.x / length, z: d.z / length };
    // W runs along the camera's forward (-sin yaw, -cos yaw); north is yaw 0.
    const yaw = yawOf(heading.x, heading.z);
    if (Math.abs(yaw) > 0.12) {
      await turn(yaw);
      aligned = false;
    } else aligned = true;
  };

  // Runs a Gate from its arrival room until `done` matches the HUD: walks
  // north between rooms, and in a fight locks on and closes in, swinging.
  // Stuck against a wall for a few rounds (pushing toward a target it can't
  // reach): drops the lock and backs out, alternating sides. `each` runs
  // after every fight step (for screenshots).
  const runGate = async (lineX, done, deadline, each = async () => {}) => {
    aligned = false;
    let logged = 0;
    let fightFrom;
    let stalled = 0;
    while (Date.now() < deadline && !done.test(await hud())) {
      // Where the hunter is: every 30 s (every 6 s with GATE_DEBUG=1), so a
      // CI failure log shows how far it got.
      if (Date.now() - logged > (process.env.GATE_DEBUG ? 6000 : 30000)) {
        logged = Date.now();
        const text = await hud();
        // The objective is the HUD's last line.
        console.log(JSON.stringify(await position()), aligned, "|", text.slice(text.lastIndexOf(" · ") + 3), "|", /Locked on/.test(text) ? "locked" : "free");
      }
      if (/Go north|Face the Gate|Enter the Gate/.test(await hud())) {
        await travel(lineX);
        continue;
      }
      const here = await position();
      stalled = here && fightFrom && Math.hypot(here.x - fightFrom.x, here.z - fightFrom.z) < 0.1 ? stalled + 1 : 0;
      fightFrom = here;
      if (stalled >= 3) {
        if (/Locked on/.test(await hud())) await page.keyboard.press("Tab");
        await hold("s", 600);
        await hold(stalled % 2 ? "a" : "d", 900);
        continue;
      }
      if (!/Locked on/.test(await hud())) await page.keyboard.press("Tab");
      await page.keyboard.down("w");
      await page.waitForTimeout(700);
      for (let k = 0; k < 3; k++) {
        await page.keyboard.press("j");
        await page.waitForTimeout(120);
      }
      await page.keyboard.up("w");
      await each();
    }
    if (!done.test(await hud())) throw new Error(`the Gate along x = ${lineX} never finished -- HUD: ${await hud()}`);
  };

  return { hud, waitHud, position, hold, turn, walkTo, travel, runGate };
}

module.exports = { testScene, serve, bot };
