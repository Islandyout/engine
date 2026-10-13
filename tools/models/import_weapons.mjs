// Imports CC0 weapons into assets/source/kit/weapons/:
//   - guns (Quaternius Ultimate Gun Pack, July 2019) baked to real-world
//     metres, the muzzle along +z and y up, with the origin where the firing
//     hand holds the grip, and two marker nodes found from each gun's shape
//     (gun_points.mjs): "offhand" (the support hand: a foregrip or the
//     handguard; under the grip on a handgun) and "muzzle". The editor holds
//     a gun by these (heldWeapons.ts), as engines do with weapon sockets;
//   - melee weapons and shields (Quaternius Medieval Weapons) copied as they
//     are: authored along +y like the kit's other Quaternius weapons, sized
//     when held.
// Every source file's SHA-256 is checked against the one recorded in
// assets/CREDITS.md before converting; a mismatch stops the import.
//
// Usage (from the repository root), with the source repository at the commit
// named in assets/CREDITS.md:
//   node tools/models/import_weapons.mjs --src <Joudrie/Game checkout> [--out <dir>] [--only a,b]
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadGlb } from "./bake_glb.mjs";
import { GlbWriter } from "./gltf_io.mjs";
import { gunPoints } from "./gun_points.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const GUNS_DIR = "assets/weapons/quaternius-ultimate-guns/Ultimate Gun Pack - July 2019/GLB";
const MEDIEVAL_DIR = "assets/weapons/quaternius-medieval-weapons/GLB";
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

// Real-world length of each class's reference gun (muzzle to butt), metres;
// the rest of a class keep their size relative to it.
const CLASS = {
  pistol: { ref: "Pistol_1", length: 0.2, handgun: true },
  revolver: { ref: "Revolver_1", length: 0.27, handgun: true },
  smg: { ref: "SubmachineGun_2", length: 0.62 },
  rifle: { ref: "AssaultRifle_2", length: 0.88 },
  carbine: { ref: "AssaultRifle2_1", length: 0.84 },
  bullpup: { ref: "Bullpup_1", length: 0.76 },
  shotgun: { ref: "Shotgun_1", length: 1.05 },
  sniper: { ref: "SniperRifle_1", length: 1.2 },
};

// [output name, source file (no .glb), class, gun_points.mjs options].
export const GUNS = [
  ["pistol-1", "Pistol_1", "pistol"],
  ["pistol-2", "Pistol_2", "pistol"],
  ["pistol-3", "Pistol_3", "pistol"],
  ["pistol-4", "Pistol_4", "pistol"],
  ["pistol-5", "Pistol_5", "pistol"],
  ["pistol-6", "Pistol_6", "pistol"],
  ["revolver-1", "Revolver_1", "revolver"],
  ["revolver-2", "Revolver_2", "revolver"],
  ["revolver-3", "Revolver_3", "revolver"],
  ["revolver-4", "Revolver_4", "revolver"],
  ["revolver-5", "Revolver_5", "revolver"],
  ["smg-1", "SubmachineGun_1", "smg"],
  ["smg-2", "SubmachineGun_2", "smg"],
  ["smg-3", "SubmachineGun_3", "smg"],
  ["smg-4", "SubmachineGun_4", "smg"],
  ["smg-5", "SubmachineGun_5", "smg"],
  ["rifle-1", "AssaultRifle_1", "rifle"],
  ["rifle-2", "AssaultRifle_2", "rifle"],
  ["rifle-3", "AssaultRifle_3", "rifle", { gripAt: 0.08 }],
  ["rifle-4", "AssaultRifle_4", "rifle"],
  ["rifle-5", "AssaultRifle_5", "rifle"],
  ["carbine-1", "AssaultRifle2_1", "carbine"],
  ["carbine-2", "AssaultRifle2_2", "carbine"],
  ["carbine-3", "AssaultRifle2_3", "carbine"],
  ["carbine-4", "AssaultRifle2_4", "carbine"],
  ["bullpup-1", "Bullpup_1", "bullpup"],
  ["bullpup-2", "Bullpup_2", "bullpup"],
  ["bullpup-3", "Bullpup_3", "bullpup"],
  ["shotgun-1", "Shotgun_1", "shotgun"],
  ["shotgun-2", "Shotgun_2", "shotgun"],
  ["shotgun-3", "Shotgun_3", "shotgun"],
  ["shotgun-4", "Shotgun_4", "shotgun"],
  ["shotgun-sawed-off", "Shotgun_SawedOff", "shotgun"],
  ["shotgun-short-stock", "Shotgun_ShortStock", "shotgun"],
  ["sniper-1", "SniperRifle_1", "sniper"],
  ["sniper-2", "SniperRifle_2", "sniper"],
  ["sniper-3", "SniperRifle_3", "sniper"],
  ["sniper-4", "SniperRifle_4", "sniper"],
  ["sniper-5", "SniperRifle_5", "sniper"],
  ["sniper-6", "SniperRifle_6", "sniper"],
];

// [output name, source file (no .glb)]: the pack's weapons the kit doesn't
// already carry (its sword, sword-2, claymore, dagger, spear, scythe,
// double axe, wooden bow and round shield come from the RPG Items bundle;
// this pack's Dagger_2 and Shield_Round_2 are the same files as the kit's
// knife and round shield).
export const MELEE = [
  ["axe", "Axe"],
  ["axe-small", "Axe_Small"],
  ["hammer-double", "Hammer_Double"],
  ["hammer-small", "Hammer_Small"],
  ["sword-big", "Sword_Big"],
  ["sword-golden", "Sword_Golden"],
  ["bow-golden", "Bow_Golden"],
  ["bow-evil", "Bow_Evil"],
  ["shield-heater", "Shield_Heater"],
  ["shield-heater-2", "Shield_Heater_2"],
  ["shield-celtic", "Shield_Celtic_Golden"],
];

// Every vertex of a baked model, as [x, y, z].
function vertices(model) {
  const out = [];
  for (const [, g] of model.groups) for (let i = 0; i < g.positions.length; i += 3) out.push([g.positions[i], g.positions[i + 1], g.positions[i + 2]]);
  return out;
}

function bakeGun(source, outFile, scale, handgun, name, options = {}) {
  const model = loadGlb(source);
  const verts = vertices(model);
  const zs = verts.map((v) => v[2]);
  const zMid = (Math.min(...zs) + Math.max(...zs)) / 2;
  const points = gunPoints(
    verts.map(([x, y]) => [x, y]),
    { handgun, ...options },
  );
  // Source: muzzle +x, y up. Output: muzzle +z, y up, origin at the grip,
  // metres: (x, y, z) -> (-(z - zMid), y - gy, x - gx) * scale.
  const [gx, gy] = points.grip;
  const to = ([x, y, z]) => [-(z - zMid) * scale, (y - gy) * scale, (x - gx) * scale];
  const turn = ([x, y, z]) => [-z, y, x];
  const w = new GlbWriter("tools/models/import_weapons.mjs");
  const json = w.json;
  json.materials = [];
  json.meshes = [{ name, primitives: [] }];
  const at = (p) => to([p[0], p[1], zMid]).map((v) => Number(v.toFixed(4)));
  json.nodes = [
    { name, mesh: 0, children: [1, 2] },
    { name: "offhand", translation: at(points.offhand) },
    { name: "muzzle", translation: at(points.muzzle) },
  ];
  json.scenes = [{ nodes: [0] }];
  json.scene = 0;
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  for (const [mi, g] of model.groups) {
    if (!g.positions.length) continue;
    const mat = model.materials[mi];
    json.materials.push({ name: mat.name, pbrMetallicRoughness: { baseColorFactor: [...mat.color.map((c) => Math.min(1, Math.max(0, c))), 1], metallicFactor: /metal/i.test(mat.name) ? 0.6 : 0, roughnessFactor: /metal/i.test(mat.name) ? 0.45 : 0.75 } });
    const key = new Map();
    const P = [],
      N = [],
      idx = [];
    for (let c = 0; c < g.positions.length / 3; c++) {
      const p = to(g.positions.slice(c * 3, c * 3 + 3));
      const n = turn(g.normals.slice(c * 3, c * 3 + 3));
      const k = [...p.map((v) => v.toFixed(5)), ...n.map((v) => v.toFixed(4))].join(",");
      if (!key.has(k)) {
        key.set(k, P.length / 3);
        P.push(...p);
        N.push(...n);
        for (let a = 0; a < 3; a++) {
          min[a] = Math.min(min[a], p[a]);
          max[a] = Math.max(max[a], p[a]);
        }
      }
      idx.push(key.get(k));
    }
    const count = P.length / 3;
    const pmin = [0, 1, 2].map((a) => Math.min(...P.filter((_, i) => i % 3 === a)));
    const pmax = [0, 1, 2].map((a) => Math.max(...P.filter((_, i) => i % 3 === a)));
    const attributes = {
      POSITION: w.accessor(new Float32Array(P), { componentType: 5126, count, type: "VEC3", min: pmin, max: pmax }, 34962),
      NORMAL: w.accessor(new Float32Array(N), { componentType: 5126, count, type: "VEC3" }, 34962),
    };
    const big = count > 65535;
    const indices = w.accessor(big ? new Uint32Array(idx) : new Uint16Array(idx), { componentType: big ? 5125 : 5123, count: idx.length, type: "SCALAR" }, 34963);
    json.meshes[0].primitives.push({ attributes, indices, material: json.materials.length - 1 });
  }
  w.write(outFile);
  return { points, min, max };
}

// Source hashes from assets/CREDITS.md: lines of the form
// "- `out.glb` (`Source.glb`): `sha256`...".
function recordedHashes() {
  const text = readFileSync(path.join(ROOT, "assets/CREDITS.md"), "utf8");
  const hashes = new Map();
  for (const m of text.matchAll(/^- `([\w-]+)\.glb` \(`[\w ]+\.glb`\): `([0-9a-f]{64})`/gm)) hashes.set(m[1], m[2]);
  return hashes;
}

function checkSource(file, name, hashes) {
  const want = hashes.get(name);
  if (!want) throw new Error(`${name}: no source SHA-256 recorded in assets/CREDITS.md`);
  const got = sha256(readFileSync(file));
  if (got !== want) throw new Error(`${name}: ${file} has SHA-256 ${got}, assets/CREDITS.md records ${want}`);
}

function main() {
  const args = process.argv.slice(2);
  let src;
  let outDir = path.join(ROOT, "assets/source/kit/weapons");
  let only = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--src") src = args[++i];
    else if (args[i] === "--out") outDir = args[++i];
    else if (args[i] === "--only") only = new Set(args[++i].split(","));
    else throw new Error(`unknown argument ${args[i]}`);
  }
  if (!src) throw new Error("missing --src <Joudrie/Game checkout> (see the usage at the top of this file)");
  mkdirSync(outDir, { recursive: true });
  const nativeLength = (file) => {
    const xs = vertices(loadGlb(file)).map((v) => v[0]);
    return Math.max(...xs) - Math.min(...xs);
  };
  console.log("name".padEnd(22), "L m".padStart(6), "H m".padStart(6), "  offhand (x y z)        muzzle (x y z)       sha256 source -> result");
  const hashes = recordedHashes();
  const refLength = {};
  for (const [name, file, kind, options] of GUNS) {
    if (only && !only.has(name)) continue;
    const source = path.join(src, GUNS_DIR, `${file}.glb`);
    checkSource(source, name, hashes);
    const cls = CLASS[kind];
    refLength[kind] ??= nativeLength(path.join(src, GUNS_DIR, `${cls.ref}.glb`));
    const scale = cls.length / refLength[kind];
    const out = path.join(outDir, `${name}.glb`);
    const { min, max } = bakeGun(source, out, scale, !!cls.handgun, name, options);
    const json = JSON.parse(readFileSync(out).toString("utf8", 20, 20 + readFileSync(out).readUInt32LE(12)));
    const f = (v) => v.map((n) => n.toFixed(3).padStart(6)).join(" ");
    console.log(name.padEnd(22), (max[2] - min[2]).toFixed(2).padStart(6), (max[1] - min[1]).toFixed(2).padStart(6), " ", f(json.nodes[1].translation), " ", f(json.nodes[2].translation), " ", sha256(readFileSync(source)).slice(0, 12), "->", sha256(readFileSync(out)).slice(0, 12));
  }
  for (const [name, file] of MELEE) {
    if (only && !only.has(name)) continue;
    const source = path.join(src, MEDIEVAL_DIR, `${file}.glb`);
    checkSource(source, name, hashes);
    const out = path.join(outDir, `${name}.glb`);
    copyFileSync(source, out);
    console.log(name.padEnd(22), "copied".padStart(13), "  ", sha256(readFileSync(source)));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
