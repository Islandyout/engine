// Renders every weapon held in third person into contact sheets, from the
// built editor (build/site). Per gun, two pictures:
//   - the scene: the player from behind, a soldier facing the camera at
//     the ready, and a soldier side-on aiming at a far target;
//   - the player aiming over the shoulder.
// Per melee weapon (a melee= slot in the same loadout): the player from
// the front and from the side. Writes build/weapon-gallery/*.png.
//
//   bash tools/build_editor.sh && node tools/screenshots/weapon_gallery.cjs
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const GUNS = [
  ...[1, 2, 3, 4, 5, 6].map((n) => ["pistol", `pistol-${n}`]),
  ...[1, 2, 3, 4, 5].map((n) => ["pistol", `revolver-${n}`]),
  ...[1, 2, 3, 4, 5].map((n) => ["smg", `smg-${n}`]),
  ...[1, 2, 3, 4, 5].map((n) => ["rifle", `rifle-${n}`]),
  ...[1, 2, 3, 4].map((n) => ["rifle", `carbine-${n}`]),
  ...[1, 2, 3].map((n) => ["rifle", `bullpup-${n}`]),
  ...[1, 2, 3, 4].map((n) => ["shotgun", `shotgun-${n}`]),
  ["shotgun", "shotgun-sawed-off"],
  ["shotgun", "shotgun-short-stock"],
  ...[1, 2, 3, 4, 5, 6].map((n) => ["sniper", `sniper-${n}`]),
];
// Melee slots (kit/weapons names) for the loadout's melee= key.
const LIMIT = Number(process.env.GALLERY_LIMIT || 0); // a quick look: the first N of each
const ONLY = process.env.GALLERY_ONLY || ""; // "guns" or "melee"
const MELEE = ["fists", "dagger", "knife", "sword", "sword-2", "sword-golden", "claymore", "sword-big", "spear", "scythe", "axe", "axe-small", "axe-double", "hammer-small", "hammer-double", "bow", "bow-golden", "bow-evil"];

if (LIMIT) {
  GUNS.splice(LIMIT);
  MELEE.splice(LIMIT);
}
if (ONLY === "guns") MELEE.length = 0;
if (ONLY === "melee") GUNS.length = 0;

(async () => {
  const root = path.resolve("build/site");
  const server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url, "http://localhost").pathname.replace(/^\/engine\//, "");
    const file = path.resolve(root, pathname === "" || pathname.endsWith("/") ? pathname + "index.html" : pathname);
    if (!file.startsWith(root + path.sep)) return res.writeHead(404).end();
    try {
      res.setHeader("Content-Type", { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".glb": "model/gltf-binary" }[path.extname(file)] || "text/plain");
      res.end(await fs.readFile(file));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const out = path.resolve("build/weapon-gallery");
  await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
  try {
    const page = await browser.newPage({ viewport: { width: 1700, height: 1100 } });
    await page.addInitScript(() => {
      // Look as if the mouse were captured (no "click to aim" hint), and a
      // scripted gamepad to turn the camera, aim and switch.
      Element.prototype.requestPointerLock = function () {
        return Promise.resolve();
      };
      Object.defineProperty(Document.prototype, "pointerLockElement", { get: () => document.querySelector("#viewport canvas") });
      const pad = { id: "gallery", index: 0, connected: true, mapping: "standard", axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
      window.__pad = pad;
      navigator.getGamepads = () => [pad];
    });
    const port = server.address().port;
    const run = async (command) => {
      await page.locator("#json").fill(JSON.stringify(command));
      await page.locator("#command button").click();
      const result = JSON.parse(await page.locator("#log").textContent());
      if (!result.ok) throw new Error(JSON.stringify(command) + " -> " + JSON.stringify(result));
      return result;
    };
    const button = (i, down) => page.evaluate(([i, d]) => ((window.__pad.buttons[i].pressed = d), (window.__pad.buttons[i].value = d ? 1 : 0)), [i, down]);
    const tap = async (i) => {
      await button(i, true);
      await page.waitForTimeout(120);
      await button(i, false);
      await page.waitForTimeout(120);
    };
    const look = async (x, ms) => {
      await page.evaluate((x) => (window.__pad.axes[2] = x), x);
      await page.waitForTimeout(ms);
      await page.evaluate(() => (window.__pad.axes[2] = 0));
    };
    const shot = async () => {
      const box = await page.locator("#viewport canvas").first().boundingBox();
      const clip = { x: box.x + box.width * 0.1, y: box.y + box.height * 0.08, width: box.width * 0.8, height: box.height * 0.84 };
      return (await page.screenshot({ clip })).toString("base64");
    };
    // The Third-person starter (ground, sky, a few crates). `player`:
    // the Player's own loadout (its over-the-shoulder view), or none to look
    // at two soldiers instead: one at the ready facing the camera, one
    // beside it side-on aiming at a dummy; both switch guns with the
    // number keys. `camera`: the follow camera's target and offset.
    const open = async ({ player, soldiers, camera }) => {
      await page.goto(`http://127.0.0.1:${port}/engine/`);
      await page.waitForFunction(() => document.querySelector("#runtime")?.textContent === "C++ runtime ready");
      await page.click("#new");
      page.once("dialog", (dialog) => dialog.accept());
      await page.click('[aria-label="Third-person starter"]');
      const list = (await run({ command: "list_entities" })).data;
      const ref = (name) => {
        const e = list.find((x) => x.name === name);
        return { index: e.index, generation: e.generation };
      };
      const set = (entity, type, value) => run({ command: "set_component", entity, type, value });
      if (player) {
        await run({ command: "set_transform", entity: ref("Player"), position: [0, 0.9, 0] });
        await set(ref("Player"), "Scale", { value: { x: 0.6, y: 1.8, z: 0.6 } });
        await set(ref("Player"), "Rotation", { euler: { x: 0, y: 0, z: 0 } });
        await set(ref("Player"), "Weapons", { loadout: player, aimAssist: 0, assistRange: 60 });
      } else {
        // Out of the way and out of sight.
        await run({ command: "set_transform", entity: ref("Player"), position: [10, 0.9, 10] });
        await set(ref("Player"), "Renderable", { mesh: 132, material: 0, visible: false });
      }
      await set(ref("Camera"), "CameraFollow", {
        target: camera.target,
        offset: camera.offset,
        smoothing: 0,
        lookHeight: camera.lookHeight ?? 1.2,
        collision: false,
        orbit: !!camera.orbit,
      });
      if (soldiers) {
        const follow = 'function on_tick(dt)\n  for i = 1, 8 do\n    if input.pressed("Digit" .. i) then weapon.select(i) end\n  end\nend\n';
        const body = async (name, position, yaw, combat, extra = []) => {
          const r = await run({ command: "spawn_entity", name, transform: position });
          for (const [type, value] of [
            ["Scale", { value: { x: 0.6, y: 1.8, z: 0.6 } }],
            ["Rotation", { euler: { x: 0, y: yaw, z: 0 } }],
            ["Renderable", { mesh: 132, material: 0, visible: true }],
            ["RigidBody", { mass: 70, dynamic: true }],
            ["Collider", { type: "AABB" }],
            ["Health", { current: 100000, maximum: 100000 }],
            // Holding its ground at the dummy's distance.
            ["AICombat", { team: combat.team, behavior: "Guard", patrol: "", sightRange: combat.sight, fov: 140, hearingRange: 0, reactionTime: 0.2, accuracy: 0.9, preferredRange: 10.7, moveSpeed: 0.01, burst: 3, burstPause: 0.8, useCover: false, fleeHealth: 0, meleeDamage: 0 }],
            ...extra,
          ])
            await set(r.entity, type, value);
        };
        const armed = [
          ["Weapons", { loadout: soldiers.replace(/reserve=-1/g, "reserve=-1 damage=0.01"), aimAssist: 0, assistRange: 60 }],
          ["Script", { source: follow, props: {} }],
        ];
        // Facing +z, toward the camera in front of it.
        await body("Ready", [0, 0.9, 0], 0, { team: 0, sight: 0.5 }, armed);
        // Beside it, facing -x, aiming at the dummy off to the left.
        await body("Aimer", [-1.3, 0.9, -0.8], -Math.PI / 2, { team: 0, sight: 30 }, armed);
        await body("Dummy", [-12, 0.9, -0.8], Math.PI / 2, { team: 1, sight: 0.5 });
      }
      // The selection box goes to an empty entity out of sight.
      await run({ command: "spawn_entity", name: "Offstage", transform: [0, -50, 0] });
      await page.click("#play");
    };
    const sheet = async (name, title, cards) => {
      const html = `<!doctype html><html><body style="margin:0;background:#14181f;color:#e8ecf2;font:600 15px system-ui,sans-serif">
        <h1 style="margin:16px 20px 4px;font-size:22px">${title}</h1>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:14px;padding:14px 20px 20px">
        ${cards
          .map(
            (c) => `<div style="background:#1e2530;border-radius:10px;padding:10px">
              <div style="margin:0 0 8px">${c.label}</div>
              <div style="display:flex;gap:8px">${c.images.map((img, i) => `<figure style="margin:0;flex:1"><img style="width:100%;border-radius:6px;display:block" src="data:image/png;base64,${img}"><figcaption style="font-weight:500;font-size:12px;opacity:.7;margin-top:4px">${c.captions[i]}</figcaption></figure>`).join("")}</div>
            </div>`,
          )
          .join("")}</div></body></html>`;
      const view = await browser.newPage({ viewport: { width: 1500, height: 900 } });
      await view.setContent(html);
      await view.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });
      await view.close();
      console.log("wrote", path.join(out, `${name}.png`));
    };
    const waitGun = (g) => page.waitForFunction((g) => (document.querySelector("#viewport").dataset.shooter ?? "").split(",")[4] === g, g, { timeout: 30000 });

    // Guns, eight at a time: the number keys switch the soldiers (and the
    // player).
    const soldiersView = [],
      playerView = [];
    for (let b = 0; b < GUNS.length; b += 8) {
      const batch = GUNS.slice(b, b + 8);
      const loadout = batch.map(([model, held], i) => `g${i + 1}: model=${model} held=${held} equip=0.1 reserve=-1`).join("\n");
      await open({ soldiers: loadout, camera: { target: "Ready", offset: { x: -0.7, y: 0.6, z: 2.7 }, lookHeight: 0.35 } });
      await page.waitForTimeout(4000);
      for (let i = 0; i < batch.length; i++) {
        if (i > 0) await page.keyboard.press(`Digit${i + 1}`);
        await page.waitForTimeout(1800);
        soldiersView[b + i] = await shot();
      }
      await page.click("#stop");
      await open({ player: loadout, camera: { target: "", offset: { x: 0, y: 2.2, z: -4 }, orbit: true, lookHeight: 1.4 } });
      await waitGun(batch[0][1]);
      await page.waitForTimeout(2000);
      for (let i = 0; i < batch.length; i++) {
        if (i > 0) await page.keyboard.press(`Digit${i + 1}`);
        await waitGun(batch[i][1]);
        await page.waitForTimeout(1300);
        playerView[b + i] = await shot();
      }
      await page.click("#stop");
    }
    for (let s = 0; s < GUNS.length; s += 10)
      await sheet(
        `guns-${s / 10 + 1}`,
        `Guns ${s + 1}–${Math.min(GUNS.length, s + 10)} in third person`,
        GUNS.slice(s, s + 10).map(([, held], k) => ({
          label: held,
          images: [soldiersView[s + k], playerView[s + k]],
          captions: ["At the ready (front) and aiming (side)", "Your view: the third-person camera"],
        })),
      );

    // Melee slots (melee= in the same loadout): the player from the front
    // and from the side.
    const melee = [];
    for (let b = 0; b < MELEE.length; b += 8) {
      const batch = MELEE.slice(b, b + 8);
      const loadout = batch.map((name, i) => `m${i + 1}: melee=${name}`).join("\n");
      const views = [];
      for (const offset of [
        { x: 0.6, y: 0.5, z: 2.5 },
        { x: 2.6, y: 0.5, z: 0.2 },
      ]) {
        await open({ player: loadout, camera: { target: "", offset, lookHeight: 0.4 } });
        await page.waitForTimeout(4000);
        const pictures = [];
        for (let i = 0; i < batch.length; i++) {
          await page.keyboard.press(`Digit${i + 1}`);
          await page.waitForTimeout(1500);
          pictures.push(await shot());
        }
        views.push(pictures);
        await page.click("#stop");
      }
      batch.forEach((name, i) => melee.push({ label: name, images: [views[0][i], views[1][i]], captions: ["Front", "Side"] }));
    }
    for (let s = 0; s < melee.length; s += 10) await sheet(`melee-${s / 10 + 1}`, "Melee weapons in third person", melee.slice(s, s + 10));
  } finally {
    await browser.close();
    server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
