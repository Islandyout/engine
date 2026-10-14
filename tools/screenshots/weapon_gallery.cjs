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
const MELEE = ["fists", "dagger", "knife", "sword", "sword-2", "sword-golden", "claymore", "sword-big", "spear", "scythe", "axe", "axe-small", "axe-double", "hammer-small", "hammer-double", "bow", "bow-golden", "bow-evil"];

if (LIMIT) {
  GUNS.splice(LIMIT);
  MELEE.splice(LIMIT);
}

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
    // The Combat range, cleared down to the ground and the sky; the player
    // in the open behind the gun wall, facing +z, with `loadout`.
    const open = async (loadout, soldiers) => {
      await page.goto(`http://127.0.0.1:${port}/engine/`);
      await page.waitForFunction(() => document.querySelector("#runtime")?.textContent === "C++ runtime ready");
      await page.click("#new");
      page.once("dialog", (dialog) => dialog.accept());
      await page.click('[aria-label="Combat range"]');
      const list = (await run({ command: "list_entities" })).data;
      const ref = (name) => {
        const e = list.find((x) => x.name === name);
        return { index: e.index, generation: e.generation };
      };
      for (const e of list)
        if (/^(HUD |Controls|Range Officer|Instructor|Target |Sword|Dagger|Bare Hands|Supply|Armory|Range Key|Shotgun Pickup|Ammo Pickup|Medkit)/.test(e.name))
          await run({ command: "destroy_entity", entity: { index: e.index, generation: e.generation } });
      await run({ command: "set_transform", entity: ref("Player"), position: [0, 0.9, 14] });
      await run({ command: "set_component", entity: ref("Player"), type: "Rotation", value: { euler: { x: 0, y: 0, z: 0 } } });
      await run({ command: "set_component", entity: ref("Player"), type: "Weapons", value: { loadout, aimAssist: 0, assistRange: 60 } });
      if (soldiers) {
        // A soldier at the ready facing the camera, one side-on aiming at a
        // dummy far off to the right; both switch guns with the player's
        // number keys.
        const follow = 'function on_tick(dt)\n  for i = 1, 8 do\n    if input.pressed("Digit" .. i) then weapon.select(i) end\n  end\nend\n';
        const soldier = async (name, position, yaw, sight) => {
          const r = await run({ command: "spawn_entity", name, transform: position });
          for (const [type, value] of [
            ["Scale", { value: { x: 0.6, y: 1.8, z: 0.6 } }],
            ["Rotation", { euler: { x: 0, y: yaw, z: 0 } }],
            ["Renderable", { mesh: 132, material: 0, visible: true }],
            ["RigidBody", { mass: 70, dynamic: true }],
            ["Collider", { type: "AABB" }],
            ["Health", { current: 100000, maximum: 100000 }],
            ["AICombat", { team: 0, behavior: "Guard", patrol: "", sightRange: sight, fov: 120, hearingRange: 0, reactionTime: 0.2, accuracy: 0.9, preferredRange: 60, moveSpeed: 0.01, burst: 3, burstPause: 0.6, useCover: false, fleeHealth: 0, meleeDamage: 0 }],
            ["Weapons", { loadout: loadout.replace(/reserve=-1/g, "reserve=-1 damage=0.01"), aimAssist: 0, assistRange: 60 }],
            ["Script", { source: follow, props: {} }],
          ])
            await run({ command: "set_component", entity: r.entity, type, value });
        };
        await soldier("Front", [0.9, 0.9, 18.2], Math.PI, 1);
        await soldier("Side", [-1.5, 0.9, 20.5], Math.PI / 2, 60);
        const dummy = await run({ command: "spawn_entity", name: "Dummy", transform: [40, 0.9, 20.5] });
        for (const [type, value] of [
          ["Scale", { value: { x: 0.6, y: 1.8, z: 0.6 } }],
          ["Renderable", { mesh: 132, material: 0, visible: true }],
          ["Collider", { type: "AABB" }],
          ["Health", { current: 100000, maximum: 100000 }],
          ["AICombat", { team: 1, behavior: "Guard", patrol: "", sightRange: 0.5, fov: 10, hearingRange: 0, reactionTime: 9, accuracy: 0, preferredRange: 60, moveSpeed: 0.01, burst: 1, burstPause: 9, useCover: false, fleeHealth: 0, meleeDamage: 0 }],
        ])
          await run({ command: "set_component", entity: dummy.entity, type, value });
      }
      // Nothing selected: no selection box in the pictures.
      await page.keyboard.press("Escape");
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

    // Guns, eight at a time: number keys switch the player and both soldiers.
    const scene = [],
      aimed = [];
    for (let b = 0; b < GUNS.length; b += 8) {
      const batch = GUNS.slice(b, b + 8);
      await open(batch.map(([model, held], i) => `g${i + 1}: model=${model} held=${held} equip=0.1 reserve=-1`).join("\n"), true);
      await waitGun(batch[0][1]);
      await page.waitForTimeout(2500);
      for (let i = 0; i < batch.length; i++) {
        if (i > 0) await page.keyboard.press(`Digit${i + 1}`);
        await waitGun(batch[i][1]);
        await page.waitForTimeout(1600);
        scene[b + i] = await shot();
        await button(6, true);
        await page.waitForTimeout(900);
        aimed[b + i] = await shot();
        await button(6, false);
        await page.waitForTimeout(500);
      }
      await page.click("#stop");
    }
    for (let s = 0; s < GUNS.length; s += 10)
      await sheet(
        `guns-${s / 10 + 1}`,
        `Guns ${s + 1}–${Math.min(GUNS.length, s + 10)} in third person`,
        GUNS.slice(s, s + 10).map(([, held], k) => ({
          label: held,
          images: [scene[s + k], aimed[s + k]],
          captions: ["You (back), a soldier at the ready (front), a soldier aiming (side)", "You aiming over the shoulder"],
        })),
      );

    // Melee slots: the same loadout key (melee=), seen from the front and
    // the side (the right stick orbits the follow camera).
    const melee = [];
    for (let b = 0; b < MELEE.length; b += 8) {
      const batch = MELEE.slice(b, b + 8);
      await open(batch.map((name, i) => `m${i + 1}: melee=${name}`).join("\n"), false);
      await page.waitForTimeout(3500);
      for (let i = 0; i < batch.length; i++) {
        await page.keyboard.press(`Digit${i + 1}`);
        await page.waitForTimeout(1200);
        await look(1, 1150);
        await page.waitForTimeout(700);
        const front = await shot();
        await look(-1, 560);
        await page.waitForTimeout(700);
        const side = await shot();
        await look(-1, 590);
        melee.push({ label: batch[i], images: [front, side], captions: ["Front", "Side"] });
      }
      await page.click("#stop");
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
