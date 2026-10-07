// Generates GATEBREAKER (examples/gatebreaker/gatebreaker.json): the M1
// opening and the M2 loop from docs/gatebreaker/GAME_DESIGN.md.
//
// - The prologue panels play over a night plaza with the Double Gate; that
//   plaza is then the hub (the Hunter Association's square): the Gate Board,
//   the smith, the training mat for the Daily Quest, and the door home.
// - Three Gates, each a line of rooms that seal and open, ending in a boss:
//   the Goblin Cave (E, with the tutorial on the first run), the Subway
//   Tunnel (E) and the Goblin Fortress (D, the rank-up test).
// - Enemies are prefabs the Director spawns room by room, so every Gate can
//   be run again.
//
// Three scripts run it: lua/director.lua (the opening and the Gate runs),
// lua/hub.lua (the hub's stations and the Daily Quest drill) and
// lua/ledger.lua (levels, stats, gold, quests, menus and the save). Run from
// apps/editor:
//
//   npm run gatebreaker
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { validateSceneDocument } from "../../apps/editor/src/scene/SceneSerializer";
import type { SceneDocument } from "../../apps/editor/src/scene/SceneSerializer";
import { type Components, ROOT, SceneBuilder, type V3, modelId, rgb, vec } from "./kit";

const scene = new SceneBuilder();
const lua = (file: string) => readFileSync(join(ROOT, "tools/gatebreaker/lua", file), "utf8");
const dungeon = (kind: string) => modelId(kind);
// The floor tile's top is 5 cm above its origin: sunk to 1 cm above the
// ground the fighters stand on (y = 0). Not flush: the editor's shadow
// plane lies at y = 0 and would z-fight with it.
const FLOOR = -0.04;

// -- Look -----------------------------------------------------------------
scene.add("Environment", [0, 0, 0], {
  Environment: {
    sky: "Color",
    skyColor: rgb("#0a0d1f"),
    sunElevation: 70,
    sunAzimuth: 200,
    sunIntensity: 1.25,
    sunColor: rgb("#c4ccff"),
    ambientIntensity: 0.95,
    fog: "Exponential",
    fogColor: rgb("#0b0a12"),
    fogDensity: 0.018,
    shadows: true,
    exposure: 1.05,
  },
});
scene.add("Look", [0, 0, 0], {
  PostProcessing: {
    style: "Manhwa",
    ink: 1,
    rim: 0.7,
    antialias: "SMAA",
    ambientOcclusion: false,
    bloom: 0.6,
    bloomRadius: 0.4,
    bloomThreshold: 0.8,
    contrast: 0.12,
    saturation: 0.08,
    vignette: 0.45,
    shadowQuality: "Medium",
  },
});

// -- Controls (GAME_DESIGN.md 5.1) ----------------------------------------------
scene.add("Input", [0, 0, 0], {
  InputActions: {
    bindings: [
      "move_x: d, -a, right, -left, pad_lx",
      "move_y: w, -s, up, -down, -pad_ly",
      "look_x: mouse_dx*0.05, pad_rx",
      "look_y: mouse_dy*0.05, pad_ry",
      "light: mouse_left, j, pad_x",
      "heavy: mouse_right, k, pad_y",
      "dodge: space, pad_a",
      "block: shift, pad_lb",
      "skill1: q, pad_rb",
      "skill2: e, pad_b",
      "skill3: r, pad_lt",
      "ultimate: f, pad_rt",
      "lock: tab, mouse_middle, pad_rs",
      "interact: g",
    ].join("\n") + "\n",
  },
});
scene.add("Controls", [0, 0, 0], {
  UI: {
    text: "LMB attack · RMB heavy · Space dodge · Shift block/parry · Q E R skills · F ultimate · Tab lock · G use · C status",
    anchor: "top-center",
    offsetY: 14,
    fontSize: 12,
    color: vec(1, 1, 1),
    opacity: 0.7,
  },
});
// The quest tracker, left of centre: clear of the Ledger's windows (top
// centre) and the bars (bottom left).
scene.add("Objective", [0, 0, 0], {
  UI: { text: "", anchor: "middle-left", offsetX: 18, offsetY: -40, fontSize: 15, width: 240, color: vec(0.75, 0.88, 1), opacity: 0.95 },
});
// Level, rank, gold and fangs, kept up to date by the Ledger.
scene.add("Hunter", [0, 0, 0], {
  UI: { text: "", anchor: "top-right", offsetX: 18, offsetY: 44, fontSize: 15, color: vec(0.95, 0.85, 0.55), opacity: 0.95 },
});
// "G: Gate Board" and the like, near a hub station.
scene.add("Prompt", [0, 0, 0], {
  UI: { text: "", anchor: "bottom-center", offsetY: 120, fontSize: 18, color: vec(1, 1, 1), opacity: 0.95 },
});
scene.add("Director", [0, 0, 0], { Script: { source: lua("director.lua"), props: { fast: false } } });
scene.add("Hub", [0, 0, 0], { Script: { source: lua("hub.lua"), props: { fast: false } } });
scene.add("Ledger", [0, 0, 0], { Script: { source: lua("ledger.lua"), props: { fast: false } } });

// One collision slab under everything (the tiles are only looks): the hub
// (z 35..85) and the three Gates (x -130..130, z -120..10).
scene.add("Ground", [0, -0.5, -35], {
  Scale: { value: vec(300, 1, 250) },
  Renderable: { mesh: 0, material: 0, visible: false },
  RigidBody: { dynamic: false },
  Collider: { type: "AABB" },
});

// -- Rooms ------------------------------------------------------------------
type Theme = { walls: string[]; floor: string; torch: string };
const CAVE: Theme = { walls: ["wall", "wall-cracked", "wall-arched", "wall", "wall-cracked", "wall-arched", "wall"], floor: "floor-tile-large", torch: "#ff9a4a" };
const TUNNEL: Theme = { walls: ["wall-gated", "wall", "wall-gated", "wall-cracked", "wall", "wall-gated", "wall"], floor: "floor-tile-large", torch: "#a8d8ff" };
const FORT: Theme = { walls: ["wall-pillar", "wall", "wall-arched", "wall-pillar", "wall", "wall-arched", "wall-pillar"], floor: "floor-tile-large", torch: "#ff6a3a" };

// An open doorway in a north or south wall at x = ox: the 2 m opening is
// clear, and invisible jambs keep the wall either side of it solid. They
// are a little shallower than the 1 m walls, so a body sliding along the
// wall never catches on the seam between them.
function doorway(name: string, ox: number, z: number, yaw: number) {
  scene.model(name, dungeon("wall-doorway-open"), [ox, 0, z], yaw, false);
  for (const x of [-1.5, 1.5]) scene.box(`${name} jamb ${x < 0 ? "W" : "E"}`, [ox + x, 2, z], [1, 4, 0.9], "#000000", { Renderable: { mesh: 0, material: 0, visible: false } });
}
// An 8 m floor slab: the 4 m tile at twice the width and depth. The
// engine holds 1024 entities, and three Gates of 4 m tiles would need
// half of them.
function slab(name: string, theme: Theme, x: number, z: number) {
  const e = scene.entities[scene.model(name, dungeon(theme.floor), [x, FLOOR, z], 0, false)]!;
  const c = e.components as unknown as { Transform: { position: { x: number; z: number } }; Scale: { value: { x: number; z: number } } };
  c.Scale.value.x *= 2;
  c.Scale.value.z *= 2;
  c.Transform.position.x = x + (c.Transform.position.x - x) * 2;
  c.Transform.position.z = z + (c.Transform.position.z - z) * 2;
}
// A square room centred on (ox, cz), `half` metres to each wall (4 m wall
// pieces), with a doorway in the middle of the north and/or south wall.
// Its floor is laid by the Gate.
function room(name: string, theme: Theme, ox: number, cz: number, half: number, north: boolean, south: boolean) {
  const walls = theme.walls;
  const pieces = half / 2; // 4 m walls from -half to +half
  const along = (i: number) => -half + 2 + i * 4;
  for (let i = 0; i < pieces; i++) {
    const t = along(i);
    const middle = Math.abs(t) < 0.01;
    if (middle && north) doorway(`${name} north door`, ox, cz - half, 0);
    else scene.model(`${name} north wall ${i}`, dungeon(walls[i % walls.length]!), [ox + t, 0, cz - half], 0);
    if (middle && south) doorway(`${name} south door`, ox, cz + half, Math.PI);
    else scene.model(`${name} south wall ${i}`, dungeon(walls[(i + 3) % walls.length]!), [ox + t, 0, cz + half], Math.PI);
    scene.model(`${name} west wall ${i}`, dungeon(walls[(i + 1) % walls.length]!), [ox - half, 0, cz + t], Math.PI / 2);
    scene.model(`${name} east wall ${i}`, dungeon(walls[(i + 2) % walls.length]!), [ox + half, 0, cz + t], -Math.PI / 2);
  }
  for (const [x, z] of [
    [-half, -half],
    [half, -half],
    [-half, half],
    [half, half],
  ] as const)
    scene.model(`${name} corner ${x},${z}`, dungeon("pillar"), [ox + x, 0, cz + z]);
}
// A torch on a wall facing into the room, with its light and flames.
let torches = 0;
function torch(at: V3, yaw: number, hex: string, light = true) {
  const n = ++torches;
  scene.model(`Torch ${n}`, dungeon("torch-mounted"), at, yaw, false);
  const out: V3 = [at[0] + Math.sin(yaw) * 0.45, at[1] + 0.75, at[2] + Math.cos(yaw) * 0.45];
  scene.add(`Torch flame ${n}`, out, {
    Renderable: { visible: false },
    ...(light ? { Light: { type: "Point", color: rgb(hex), intensity: 10, range: 13, castShadows: false } } : {}),
    Particles: {
      preset: "Fire",
      rate: 22,
      lifetime: 0.5,
      speed: 0.6,
      size: 0.14,
      color: rgb("#ffc04a"),
      endColor: rgb("#ff3a0c"),
      endSize: 0.3,
      shape: "Sphere",
      shapeSize: 0.06,
    },
  });
}
// The magic barrier sealing a corridor; the Director drops it to open.
function corridor(prefix: string, n: number, ox: number, z: number) {
  scene.model(`${prefix} corridor ${n} west`, dungeon("wall"), [ox - 2.5, 0, z], Math.PI / 2);
  scene.model(`${prefix} corridor ${n} east`, dungeon("wall"), [ox + 2.5, 0, z], -Math.PI / 2);
  scene.box(`${prefix} Seal ${n}`, [ox, 1.75, z], [4, 3.5, 0.4], "#5a2dff", {}, {
    emissive: rgb("#7a4dff"),
    emissiveIntensity: 1.6,
    opacity: 0.55,
  });
}
// A Gate: an arrival room (centre 0), rooms at -24, -48, -72 and the boss
// arena at -100, corridors (with their seals) between them.
function gate(prefix: string, theme: Theme, ox: number, start: string) {
  room(`${prefix} ${start}`, theme, ox, 0, 10, true, false);
  corridor(prefix, 1, ox, -12);
  room(`${prefix} Room 1`, theme, ox, -24, 10, true, true);
  corridor(prefix, 2, ox, -36);
  room(`${prefix} Room 2`, theme, ox, -48, 10, true, true);
  corridor(prefix, 3, ox, -60);
  room(`${prefix} Room 3`, theme, ox, -72, 10, true, true);
  corridor(prefix, 4, ox, -84);
  room(`${prefix} Arena`, theme, ox, -100, 14, false, true);
  // One run of floor from the arrival room's south wall to the arena's
  // north wall: 24 m per room (corridors included), 32 m of arena.
  for (const cz of [0, -24, -48, -72]) for (const x of [-8, 0, 8]) for (const z of [-8, 0, 8]) slab(`${prefix} floor ${x},${cz + z}`, theme, ox + x, cz + z);
  for (const x of [-12, -4, 4, 12]) for (const z of [-88, -96, -104, -112]) slab(`${prefix} floor ${x},${z}`, theme, ox + x, z);
  for (const [cz, half] of [
    [0, 10],
    [-24, 10],
    [-48, 10],
    [-72, 10],
  ] as const) {
    torch([ox - half + 0.5, 2.2, cz - 2], Math.PI / 2, theme.torch);
    torch([ox + half - 0.5, 2.2, cz + 3], -Math.PI / 2, theme.torch, cz !== 0);
  }
  torch([ox - 13.5, 2.4, -95], Math.PI / 2, theme.torch);
  torch([ox + 13.5, 2.4, -95], -Math.PI / 2, theme.torch);
  torch([ox - 6, 2.4, -113.5], 0, theme.torch, false);
  torch([ox + 6, 2.4, -113.5], 0, theme.torch, false);
  for (const [x, z] of [
    [-7, -94],
    [7, -94],
    [-7, -106],
    [7, -106],
  ] as const)
    scene.model(`${prefix} Arena column ${x},${z}`, dungeon("column"), [ox + x, 0, z]);
}

// The Goblin Cave (E): the first Gate, whose arrival room is the tutorial.
gate("G1", CAVE, 0, "Tutorial");
scene.model("Tutorial barrel", dungeon("barrel-large"), [-8, 0, 7.6]);
scene.model("Tutorial crates", dungeon("crates-stacked"), [8, 0, 7.4], 0.3);
scene.model("Room 1 chest", dungeon("chest"), [-8.4, 0, -31], Math.PI / 2);
scene.model("Room 1 banner", dungeon("banner-patternA-red"), [0, 0, -33.9], 0, false);
scene.model("Room 2 rubble", dungeon("rubble-half"), [7.8, 0, -55], -0.6, false);
scene.model("Room 2 barrel", dungeon("barrel-large"), [-8.2, 0, -41]);
scene.model("Room 3 sword", dungeon("sword-shield-broken"), [6.5, 0, -66], 1.1, false);
scene.model("Room 3 crates", dungeon("box-stacked"), [-8, 0, -79], 0.2);
scene.model("Arena banner L", dungeon("banner-patternA-red"), [-5, 0, -113.9], 0, false);
scene.model("Arena banner R", dungeon("banner-patternA-red"), [5, 0, -113.9], 0, false);
scene.model("Arena candles", dungeon("candle-triple"), [0, 0, -112], 0, false);

// The Subway Tunnel (E): rails down every room, rubble, cold light.
const TX = 120;
gate("G2", TUNNEL, TX, "Platform");
for (const cz of [0, -24, -48, -72, -100]) {
  const half = cz === -100 ? 14 : 10;
  for (const x of [-0.8, 0.8])
    scene.box(`G2 rail ${cz},${x}`, [TX + x, 0.04, cz], [0.12, 0.08, half * 2 - 1], "#6b6f78", { Collider: { type: "AABB", isTrigger: true } }, { metalness: 0.6, roughness: 0.35 });
}
for (const [x, z, kind, yaw] of [
  [-7, 4, "rubble-large", 0.4],
  [7.5, -20, "rubble-half", -0.8],
  [-7.6, -44, "rubble-large", 1.2],
  [7.2, -76, "rubble-half", 0.2],
  [-8, -66, "barrel-large", 0],
  [8, -52, "crates-stacked", 0.6],
] as const)
  scene.model(`G2 ${kind} ${x},${z}`, dungeon(kind), [TX + x, 0, z], yaw, kind.startsWith("rubble") ? false : true);

// The Goblin Fortress (D): the rank test. Banners, braziers, a war hall.
const FX = -120;
gate("G3", FORT, FX, "Gatehouse");
for (const [x, z] of [
  [-4, -9.9],
  [4, -9.9],
  [-4, -33.9],
  [4, -33.9],
  [-4, -57.9],
  [4, -57.9],
  [-4, -81.9],
  [4, -81.9],
  [-9, -113.9],
  [9, -113.9],
] as const)
  scene.model(`G3 banner ${x},${z}`, dungeon("banner-patternA-red"), [FX + x, 0, z], 0, false);
for (const [x, z] of [
  [-8, -20],
  [8, -44],
  [-8, -68],
] as const)
  scene.model(`G3 pillar ${x},${z}`, dungeon("pillar-decorated"), [FX + x, 0, z]);

// -- Move lists ---------------------------------------------------------------
// Twin daggers. Light: stab, stab, hook-slash, spinning kick. Heavy after 1,
// 2, 3 or 4 lights is a different finisher (GAME_DESIGN.md 5.2); from neutral
// it's an armored, guard-breaking cross-cut. Skills spend mana; the ultimate
// spends the gauge that hits and parries fill. Shadow Step Dash (Q) unlocks
// at level 2 and Fang Whirl (E) with the Subway Tunnel's story quest.
const heroMoves = `# GATEBREAKER twin daggers
stab_l: clip=jab input=light dur=0.45 hit=0.08-0.14 cancel=0.17 dmg=7 reach=1.0 lunge=0.35 stun=0.3 gain=5 limb=hand_l
stab_r: clip=cross input=light after=stab_l dur=0.5 hit=0.12-0.18 cancel=0.21 dmg=8 reach=1.05 lunge=0.35 stun=0.32 gain=5 limb=hand_r
hook_slash: clip=hook input=light after=stab_r dur=0.6 hit=0.13-0.2 cancel=0.27 dmg=10 reach=1.05 radius=0.7 lunge=0.4 knock=2 stun=0.4 gain=6 limb=hand_r
spin_kick: clip=roundhouse_l input=light after=hook_slash dur=0.85 hit=0.36-0.46 cancel=0.58 dmg=14 reach=1.3 height=0.8 lunge=0.35 knock=6 stun=0.6 stop=0.1 gain=8 finisher limb=foot_l
cross_cut: clip=sword_heavy_a input=heavy dur=1.0 hit=0.24-0.34 cancel=0.45 dmg=15 reach=1.3 radius=0.85 lunge=0.7 knock=4.5 stun=0.6 stop=0.11 stagger=24 gain=8 armor guardbreak limb=hand_r
rising_slash: clip=uppercut input=heavy after=stab_l dur=0.8 hit=0.18-0.28 cancel=0.48 dmg=12 reach=1.0 lunge=0.35 launch=8.5 stun=0.7 stop=0.1 gain=8 limb=hand_r
twin_pierce: clip=dash_strike input=heavy after=stab_r dur=0.75 hit=0.15-0.3 cancel=0.5 dmg=16 reach=1.1 lunge=1.6 knock=7 stun=0.6 stop=0.1 stagger=26 gain=8 guardbreak limb=hand_r
crescent: clip=sword_heavy_c input=heavy after=hook_slash dur=0.95 hit=0.3-0.42 cancel=0.55 dmg=18 aoe=2.3 knock=6 stun=0.6 stop=0.12 knockdown gain=10 limb=hand_r
execution: clip=sword_light_c input=heavy after=spin_kick dur=0.9 hit=0.2-0.32 cancel=0.6 dmg=26 reach=1.2 radius=0.9 lunge=0.6 knock=8 stun=0.9 stop=0.16 stagger=40 gain=12 finisher limb=hand_r
air_slash: clip=sword_light_b input=light air after=air_slash|start dur=0.45 hit=0.1-0.18 cancel=0.2 dmg=7 reach=1.1 launch=3.5 stun=0.4 lunge=0 limb=hand_r
dodge: clip=roll input=dodge dur=0.5 hit=0-0 cancel=0.36 dmg=0 lunge=3.4 free iframes=0.02-0.34 track=0 limb=pelvis
shadow_step: clip=sword_light_c input=light after=shadow_step dur=0.6 hit=0.05-0.16 cancel=0.3 dmg=22 reach=1.2 radius=0.9 lunge=0 knock=4 stun=0.9 stop=0.14 stagger=30 gain=12 unblockable finisher limb=hand_r
shadow_dash: clip=dash_strike input=skill1 dur=0.8 hit=0.1-0.4 cancel=0.55 dmg=16 reach=1.2 lunge=6 knock=4 stun=0.6 mana=25 cooldown=3 hits=2 iframes=0-0.4 locked limb=hand_r
fang_whirl: clip=sword_heavy_c input=skill2 dur=1.0 hit=0.3-0.42 cancel=0.6 dmg=16 aoe=2.4 knock=6 stun=0.6 stop=0.1 mana=35 cooldown=5 lunge=0.2 locked limb=hand_r
shadow_fang: clip=energy_throw input=skill3 dur=0.7 hit=0.22-0.26 cancel=0.45 dmg=14 projectile=22 knock=4 stun=0.5 mana=20 cooldown=1.5 lunge=0 limb=hand_r
thousand_fangs: clip=ground_pound input=ultimate dur=1.4 hit=0.3-0.9 cancel=1.2 dmg=60 aoe=3.4 hits=6 knock=9 launch=4 stun=1.2 stop=0.16 cost=90 armor unblockable knockdown finisher iframes=0-1.0 lunge=0.2 limb=hand_r
`;
const gruntMoves = `# Goblin grunt
claw_l: clip=jab input=light dur=0.62 hit=0.2-0.26 cancel=0.3 dmg=6 reach=0.95 lunge=0.35 stun=0.3 limb=hand_r
claw_r: clip=cross input=light after=claw_l dur=0.66 hit=0.22-0.28 cancel=0.32 dmg=7 reach=1.0 lunge=0.35 stun=0.35 limb=hand_r
pounce: clip=dash_strike input=heavy dur=1.1 hit=0.35-0.55 cancel=0.8 dmg=12 reach=1.0 lunge=3.5 knock=5 stun=0.6 stop=0.1 limb=hand_r
kick: clip=front_kick_r input=kick after=claw_l|claw_r dur=0.8 hit=0.33-0.44 cancel=0.5 dmg=8 reach=1.15 height=0.55 lunge=0.4 knock=4 stun=0.4 limb=foot_r
hop: clip=roll input=dodge dur=0.6 hit=0-0 cancel=0.45 dmg=0 lunge=3 free iframes=0.03-0.36 track=0 limb=pelvis
`;
const archerMoves = `# Goblin archer: shoots (light) from range, claws up close
shot: clip=energy_throw input=light dur=1.0 hit=0.55-0.6 cancel=0.8 dmg=7 projectile=15 knock=2 stun=0.3 track=70 lunge=0 limb=hand_r
claw: clip=jab input=kick dur=0.62 hit=0.2-0.26 cancel=0.3 dmg=5 reach=0.95 lunge=0.3 stun=0.3 limb=hand_l
hop: clip=roll input=dodge dur=0.6 hit=0-0 cancel=0.45 dmg=0 lunge=3 free iframes=0.03-0.36 track=0 limb=pelvis
`;
const shieldMoves = `# Goblin shield-bearer: holds its guard, bashes and chops
bash: clip=cross input=light dur=0.8 hit=0.3-0.38 cancel=0.45 dmg=8 reach=1.0 lunge=0.4 knock=4 stun=0.5 limb=hand_l
chop: clip=hook input=heavy dur=1.0 hit=0.4-0.5 cancel=0.6 dmg=12 reach=1.1 lunge=0.4 knock=3 stun=0.5 limb=hand_r
kick: clip=front_kick_r input=kick dur=0.8 hit=0.33-0.44 cancel=0.5 dmg=7 reach=1.15 height=0.55 lunge=0.4 knock=5 stun=0.4 limb=foot_r
`;
// A hobgoblin: slow and heavy; its overhead chop breaks guards, so dodge it.
const hobgoblinMoves = `# Hobgoblin
swing: clip=sword_heavy_a input=light dur=1.1 hit=0.45-0.55 cancel=0.7 dmg=13 reach=1.4 radius=0.9 lunge=0.5 knock=5 stun=0.5 stop=0.1 limb=hand_r
backswing: clip=sword_heavy_b input=light after=swing dur=0.95 hit=0.35-0.45 cancel=0.6 dmg=12 reach=1.4 radius=0.9 lunge=0.4 knock=5 stun=0.5 limb=hand_r
crush: clip=sword_heavy_c input=heavy dur=1.4 hit=0.75-0.85 cancel=1.1 dmg=20 reach=1.5 radius=1.0 lunge=0.6 knock=7 stun=0.8 stop=0.12 armor guardbreak limb=hand_r
`;
// A goblin shaman: hurls hexes from range, and its script mends its allies.
const shamanMoves = `# Goblin shaman
hex: clip=energy_cast input=light dur=1.2 hit=0.6-0.65 cancel=0.9 dmg=9 projectile=11 knock=2 stun=0.4 track=60 lunge=0 limb=hand_r
claw: clip=jab input=kick dur=0.62 hit=0.2-0.26 cancel=0.3 dmg=5 reach=0.95 lunge=0.3 stun=0.3 limb=hand_l
hop: clip=roll input=dodge dur=0.6 hit=0-0 cancel=0.45 dmg=0 lunge=3 free iframes=0.03-0.36 track=0 limb=pelvis
`;
// The bosses: big swings, a leaping or charging strike, and the red slam
// (an unblockable area attack with a long, readable wind-up) that their
// scripts call every few seconds, faster in phase 2.
const chieftainMoves = `# Goblin Chieftain
cleave: clip=sword_heavy_a input=light dur=1.15 hit=0.5-0.6 cancel=0.7 dmg=14 reach=1.7 radius=1.0 lunge=0.6 knock=5 stun=0.5 stop=0.1 limb=hand_r
cleave_back: clip=sword_heavy_b input=light after=cleave dur=0.95 hit=0.35-0.45 cancel=0.6 dmg=14 reach=1.7 radius=1.0 lunge=0.4 knock=6 stun=0.5 stop=0.1 limb=hand_r
stomp: clip=front_kick_r input=kick dur=0.9 hit=0.4-0.5 cancel=0.6 dmg=10 reach=1.4 height=0.5 lunge=0.4 knock=7 stun=0.5 limb=foot_r
leap: clip=dash_strike input=heavy dur=1.3 hit=0.55-0.8 cancel=1.0 dmg=16 reach=1.3 lunge=5 knock=7 stun=0.7 stop=0.12 armor limb=hand_r
red_slam: clip=ground_pound input=special dur=1.9 hit=1.05-1.15 cancel=1.6 dmg=26 aoe=3.4 knock=9 stun=1 stop=0.16 armor unblockable knockdown limb=hand_r
`;
const bruteMoves = `# Hobgoblin Brute
smash: clip=sword_heavy_a input=light dur=1.25 hit=0.55-0.65 cancel=0.8 dmg=18 reach=1.8 radius=1.1 lunge=0.6 knock=6 stun=0.6 stop=0.12 limb=hand_r
smash_back: clip=sword_heavy_b input=light after=smash dur=1.05 hit=0.4-0.5 cancel=0.7 dmg=16 reach=1.8 radius=1.1 lunge=0.4 knock=6 stun=0.6 limb=hand_r
charge: clip=shoulder_dash input=heavy dur=1.4 hit=0.5-0.95 cancel=1.1 dmg=18 reach=1.3 lunge=7 knock=9 stun=0.8 stop=0.12 armor guardbreak limb=pelvis
red_slam: clip=ground_pound input=special dur=1.9 hit=1.05-1.15 cancel=1.6 dmg=30 aoe=3.8 knock=10 stun=1 stop=0.16 armor unblockable knockdown limb=hand_r
`;
const warlordMoves = `# Goblin Warlord
cut: clip=sword_light_a input=light dur=0.85 hit=0.3-0.38 cancel=0.5 dmg=14 reach=1.7 radius=0.9 lunge=0.6 knock=4 stun=0.5 limb=hand_r
cut_back: clip=sword_light_b input=light after=cut dur=0.85 hit=0.3-0.38 cancel=0.5 dmg=14 reach=1.7 radius=0.9 lunge=0.5 knock=4 stun=0.5 limb=hand_r
cut_rise: clip=sword_heavy_c input=light after=cut_back dur=1.1 hit=0.45-0.55 cancel=0.8 dmg=18 reach=1.7 radius=1.0 lunge=0.4 knock=7 stun=0.6 stop=0.12 limb=hand_r
lunge: clip=dash_strike input=heavy dur=1.2 hit=0.5-0.75 cancel=0.95 dmg=20 reach=1.4 lunge=6 knock=8 stun=0.7 stop=0.12 armor guardbreak limb=hand_r
red_slam: clip=ground_pound input=special dur=1.8 hit=1.0-1.1 cancel=1.5 dmg=32 aoe=4 knock=10 stun=1 stop=0.16 armor unblockable knockdown limb=hand_r
`;
const constructMoves = `# Training construct: one slow, readable swing
swing: clip=hook input=light dur=1.3 hit=0.8-0.9 cancel=1.1 dmg=4 reach=1.4 radius=0.9 lunge=0.2 knock=2 stun=0.3 track=120 limb=hand_r
`;

// -- Scripts ----------------------------------------------------------------
const heroScript = `-- Reports blows (the tutorial, the Daily Quest drill), takes its stats from
-- the Ledger, and learns new skills.
function on_melee_hit(target, move, damage, outcome)
  local text = move .. ":" .. outcome
  world.send(world.find("Director"), "hero_hit", text)
  world.send(world.find("Hub"), "hero_hit", text)
end
function on_message(name, value)
  if name == "unlock" then
    melee.unlock(type(value) == "string" and value or "shadow_dash")
  elseif name == "tune" and type(value) == "string" then
    local v = {}
    for n in value:gmatch("[^,]+") do v[#v + 1] = tonumber(n) end
    melee.tune(v[1] or -1, v[2] or -1, v[3] or -1, v[4] or -1, v[5] or -1, v[6] or -1)
  end
end
`;
// A training construct reports how its swings went and never breaks.
const constructScript = (listener: string) => `-- Swings only when its owner says so, and never breaks.
local swinging, t = false, 0
function on_start() melee.set_ai(false) end
function on_message(name)
  if name == "swing_on" then swinging, t = true, 1.5 elseif name == "swing_off" then swinging = false end
end
function on_tick(dt)
  if not swinging then return end
  t = t + dt
  if t > 2.4 and melee.perform("swing") then t = 0 end
end
function on_melee_hit(target, move, damage, outcome)
  world.send(world.find("${listener}"), "construct", outcome)
end
function on_damaged(amount) world.heal(self.id, amount) end
`;
// A shaman mends the goblins around it every few seconds: kill it first.
const shamanScript = `-- Every 7 s, mends the wounded goblins within 7 m by 18.
local t = 3
function on_tick(dt)
  t = t + dt
  if t < 7 then return end
  t = 0
  local x, y, z = world.position(self.id)
  if not x then return end
  local hp = world.health(self.id)
  if not hp or hp <= 0 then return end
  for _, id in ipairs(world.overlap(x, y, z, 7)) do
    local name = world.name(id) or ""
    if id ~= self.id and name:find("oblin") then
      local now, max = world.health(id)
      if now and max and now > 0 and now < max then world.heal(id, 18) end
    end
  end
end
`;
// A boss: a red slam every few seconds; below half health, phase 2 (and
// the Warlord calls two grunts). Tells the Director when phase 2 starts.
const bossScript = (slam: number, slam2: number, summon: boolean) => `-- Waits for the Director's "wake" (after its intro panels), then the red
-- slam every ${slam} s (${slam2} s in phase 2).
local phase, t, awake = 1, 0, false
function on_start() if not awake then melee.set_ai(false) end end
function on_message(name)
  if name == "wake" then awake = true melee.set_ai(true) end
end
function on_tick(dt)
  if not awake then return end
  t = t + dt
  local hp, max = world.health(self.id)
  if not hp or hp <= 0 then return end
  if phase == 1 and max and hp < max * 0.5 then
    phase = 2
    melee.set_ai(true, 0.85, 0.6)
    world.send(world.find("Director"), "phase2", ${summon ? "true" : "false"})
  end
  if t > (phase == 1 and ${slam} or ${slam2}) and melee.perform("red_slam") then t = 0 end
end
`;

// -- Fighters -------------------------------------------------------------------
const HUNTER = modelId("hunter");
const GOBLIN = modelId("goblin");
const MANNEQUIN = 132;
scene.add("Han Seo-jin", [0, 0.9, 6], {
  Scale: { value: vec(0.6, 1.8, 0.6) },
  Rotation: { euler: vec(0, Math.PI, 0) },
  Renderable: { mesh: HUNTER, material: 0, visible: true },
  Player: {},
  RigidBody: { mass: 70, dynamic: true },
  Collider: {},
  CharacterController: { mode: "ThirdPerson", walkSpeed: 5.2, sprintSpeed: 5.2 },
  Health: { current: 220, maximum: 220 },
  Melee: { style: "Custom", moves: heroMoves, team: 0, ai: false, energy: 0, rightHand: modelId("dagger"), leftHand: modelId("dagger"), manaMax: 100, manaRegen: 9 },
  Script: { source: heroScript, props: {} },
});
scene.add("Camera", [0, 3, 10], {
  Camera: { fov: 50, far: 260 },
  CameraFollow: { offset: vec(0, 2.5, -4.4), orbit: true, lookHeight: 0.9 },
});
const construct = (name: string, at: V3, listener: string) =>
  scene.add(name, at, {
    Scale: { value: vec(0.6, 1.8, 0.6) },
    Renderable: { mesh: MANNEQUIN, material: 0, visible: true },
    Material: { color: rgb("#7c8aa5"), roughness: 0.9, keepTextures: false },
    RigidBody: { mass: 400, dynamic: true },
    Collider: {},
    Health: { current: 999, maximum: 999 },
    Melee: { style: "Custom", moves: constructMoves, team: 1, ai: true, aggression: 0, skill: 0 },
    Script: { source: constructScript(listener), props: {} },
  });
construct("Training Construct", [0, 0.9, -3], "Director");

// The enemies, spawned room by room (world.spawn). Name, size, health and
// the rest; the Director keeps the list of who stands where in each room.
type Kind = { height: number; width: number; health: number; mesh: number; melee: Components; script?: string; tint?: string; mass: number };
const kinds: Record<string, Kind> = {
  "Goblin Grunt": { height: 1.45, width: 0.5, health: 60, mesh: GOBLIN, mass: 45, melee: { moves: gruntMoves, aggression: 0.6, skill: 0.3, rightHand: modelId("knife") } },
  "Goblin Archer": { height: 1.45, width: 0.5, health: 40, mesh: GOBLIN, mass: 45, melee: { moves: archerMoves, aggression: 0.6, skill: 0.3, leftHand: modelId("bow"), range: 7 } },
  "Goblin Shieldbearer": {
    height: 1.45,
    width: 0.5,
    health: 110,
    mesh: GOBLIN,
    mass: 50,
    melee: { moves: shieldMoves, aggression: 0.4, skill: 0.6, rightHand: modelId("knife"), leftHand: modelId("shield-round"), shield: true, guard: 220, poise: 70, breakTime: 2.5 },
  },
  Hobgoblin: {
    height: 1.85,
    width: 0.6,
    health: 150,
    mesh: GOBLIN,
    mass: 90,
    tint: "#b06a4c",
    melee: { moves: hobgoblinMoves, aggression: 0.5, skill: 0.4, rightHand: modelId("axe-double"), poise: 80, breakTime: 2.2, guard: 140 },
  },
  "Goblin Shaman": {
    height: 1.4,
    width: 0.5,
    health: 55,
    mesh: GOBLIN,
    mass: 40,
    tint: "#8f7ad8",
    script: shamanScript,
    melee: { moves: shamanMoves, aggression: 0.5, skill: 0.4, rightHand: modelId("scythe"), range: 8 },
  },
  "Goblin Chieftain": {
    height: 2.1,
    width: 0.8,
    health: 420,
    mesh: GOBLIN,
    mass: 160,
    script: bossScript(8, 5, false),
    melee: { moves: chieftainMoves, aggression: 0.55, skill: 0.45, guard: 160, rightHand: modelId("claymore"), poise: 130, breakTime: 3.5 },
  },
  "Hobgoblin Brute": {
    height: 2.4,
    width: 0.9,
    health: 560,
    mesh: GOBLIN,
    mass: 220,
    tint: "#9c5a40",
    script: bossScript(7, 4.5, false),
    melee: { moves: bruteMoves, aggression: 0.55, skill: 0.45, guard: 200, rightHand: modelId("axe-double"), poise: 160, breakTime: 3.5 },
  },
  "Goblin Warlord": {
    height: 2.25,
    width: 0.85,
    health: 720,
    mesh: GOBLIN,
    mass: 180,
    tint: "#6f7a8c",
    script: bossScript(7, 4, true),
    melee: { moves: warlordMoves, aggression: 0.6, skill: 0.6, guard: 220, rightHand: modelId("claymore"), leftHand: modelId("shield-round"), poise: 190, breakTime: 3.5 },
  },
};
for (const [name, kind] of Object.entries(kinds))
  scene.prefab(name, {
    Scale: { value: vec(kind.width, kind.height, kind.width) },
    Renderable: { mesh: kind.mesh, material: 0, visible: true },
    ...(kind.tint ? { Material: { color: rgb(kind.tint), roughness: 0.85, keepTextures: true } } : {}),
    RigidBody: { mass: kind.mass, dynamic: true },
    Collider: {},
    Health: { current: kind.health, maximum: kind.health },
    Melee: { style: "Custom", team: 1, ai: true, reaction: 0.35, ...kind.melee },
    ...(kind.script ? { Script: { source: kind.script, props: {} } } : {}),
  });

// -- The plaza: the prologue's set, then the hub ------------------------------
// The Hunter Association's square at night, the sealed Double Gate at its
// north end. The hub is the part between the buildings (x -16..16,
// z 40..64), fenced by invisible walls.
scene.box("Plaza", [0, -0.07, 58], [70, 0.1, 50], "#34333d", { Collider: { type: "AABB", isTrigger: true } });
// Stone paving where the hunter walks (the hub, x -16..16, z 40..64).
for (const x of [-12, -4, 4, 12]) for (const z of [44, 52, 60]) slab(`Hub floor ${x},${z}`, CAVE, x, z);
for (const [id, x, z, yaw] of [
  [20, -24, 66, Math.PI / 2],
  [21, 24, 70, -Math.PI / 2],
  [8, -22, 46, Math.PI / 2],
  [9, 22, 48, -Math.PI / 2],
  [22, -12, 84, 0],
  [10, 12, 86, 0],
] as const)
  scene.model(`Plaza building ${id}`, id, [x, 0, z], yaw, false);
for (const [name, at, size] of [
  ["Hub fence W", [-16.5, 2, 52], [1, 4, 26]],
  ["Hub fence E", [16.5, 2, 52], [1, 4, 26]],
  ["Hub fence S", [0, 2, 39.5], [34, 4, 1]],
  ["Hub fence N", [0, 2, 64.5], [34, 4, 1]],
] as const)
  scene.box(name, at as unknown as V3, size as unknown as V3, "#000000", { Renderable: { mesh: 0, material: 0, visible: false } });
// The Double Gate: two stone pillars, a lintel, and the rift between them.
scene.box("Double Gate pillar L", [-4.2, 4, 70], [1.4, 8, 1.4], "#3a3346");
scene.box("Double Gate pillar R", [4.2, 4, 70], [1.4, 8, 1.4], "#3a3346");
scene.box("Double Gate lintel", [0, 8.4, 70], [10, 1.2, 1.6], "#3a3346");
scene.box("Double Gate rift", [0, 3.9, 70.2], [7, 7.6, 0.2], "#1a0c33", { Collider: { type: "AABB", isTrigger: true } }, {
  emissive: rgb("#6b2bff"),
  emissiveIntensity: 2.2,
});
scene.add("Double Gate glow", [0, 4, 68], {
  Renderable: { visible: false },
  Light: { type: "Point", color: rgb("#8a4dff"), intensity: 22, range: 24, castShadows: false },
  Particles: { preset: "Sparkle", rate: 60, lifetime: 1.6, speed: 0.8, size: 0.18, color: rgb("#b48cff"), endColor: rgb("#3a10a0"), shape: "Box", shapeSize: 3.2 },
});
// Han Seo-jin at the plaza, facing the Gate, and what comes out of it.
scene.add("Prologue Seo-jin", [0, 0.9, 52], {
  Scale: { value: vec(0.6, 1.8, 0.6) },
  Renderable: { mesh: HUNTER, material: 0, visible: true },
  RigidBody: { dynamic: false },
  Collider: { isTrigger: true },
});
for (const [x, z] of [
  [-1.6, 66.5],
  [1.4, 67.2],
  [0, 66],
] as const)
  scene.add(`Prologue goblin ${x}`, [x, 0.725, z], {
    Scale: { value: vec(0.5, 1.45, 0.5) },
    Rotation: { euler: vec(0, Math.PI, 0) },
    Renderable: { mesh: GOBLIN, material: 0, visible: true },
    RigidBody: { dynamic: false },
    Collider: { isTrigger: true },
  });
for (const [x, z, hex] of [
  [0, 50, "#9fb4ff"],
  [-14, 60, "#7f9cff"],
  [14, 62, "#7f9cff"],
] as const)
  scene.add(`Plaza light ${x}`, [x, 7, z], {
    Renderable: { visible: false },
    Light: { type: "Point", color: rgb(hex), intensity: 48, range: 32, castShadows: false },
  });

// The hub's stations (lua/hub.lua knows where they are).
// The Gate Board: a tall glowing panel listing the open Gates.
scene.box("Gate Board", [-10, 1.6, 58], [2.6, 2.4, 0.25], "#0c2a3a", {}, { emissive: rgb("#3fd0ff"), emissiveIntensity: 1.4 });
scene.box("Gate Board stand", [-10, 0.25, 58], [0.4, 0.5, 0.4], "#2a2d36");
scene.add("Gate Board light", [-10, 2.6, 56.5], { Renderable: { visible: false }, Light: { type: "Point", color: rgb("#5fdcff"), intensity: 12, range: 9, castShadows: false } });
// The smith's stall: an anvil, crates, a broken blade on display.
scene.box("Smith anvil", [10, 0.45, 58], [1.0, 0.9, 0.55], "#30323a", {}, { metalness: 0.7, roughness: 0.35 });
scene.model("Smith crates", dungeon("crates-stacked"), [12.5, 0, 59.5], -0.4);
scene.model("Smith barrel", dungeon("barrel-large"), [7.6, 0, 59.6]);
scene.model("Smith display", dungeon("sword-shield-broken"), [11.8, 0, 61], 0.6, false);
scene.add("Smith forge", [10.6, 1.1, 60], {
  Renderable: { visible: false },
  Light: { type: "Point", color: rgb("#ff8a3a"), intensity: 14, range: 9, castShadows: false },
  Particles: { preset: "Fire", rate: 26, lifetime: 0.5, speed: 0.7, size: 0.16, color: rgb("#ffc04a"), endColor: rgb("#ff3a0c"), endSize: 0.32, shape: "Sphere", shapeSize: 0.12 },
});
// The training mat and its construct, for the Daily Quest drill.
scene.box("Training mat", [-9, 0.02, 45], [4.5, 0.04, 4.5], "#5a1f24", { Collider: { type: "AABB", isTrigger: true } });
construct("Hub Construct", [-9, 0.9, 44], "Hub");
// The door home: rest, end the day, save.
scene.box("Home door", [10, 1.2, 40.6], [1.4, 2.4, 0.2], "#3a2a22");
scene.add("Home lamp", [10, 2.8, 41.2], { Renderable: { visible: false }, Light: { type: "Point", color: rgb("#ffd59a"), intensity: 8, range: 6, castShadows: false } });
// People of the Association: a clerk by the board, the smith at the anvil.
const npc = (name: string, at: V3, yaw: number, tint: string) =>
  scene.add(name, at, {
    Scale: { value: vec(0.6, 1.8, 0.6) },
    Rotation: { euler: vec(0, yaw, 0) },
    Renderable: { mesh: MANNEQUIN, material: 0, visible: true },
    Material: { color: rgb(tint), roughness: 0.8, keepTextures: false },
    RigidBody: { dynamic: false },
    Collider: {},
  });
npc("Association Clerk", [-12.2, 0.9, 58.6], Math.PI * 0.85, "#3d4a66");
npc("Smith Kang", [10, 0.9, 59.6], Math.PI, "#6a4632");

const document = { format: 1, name: "GATEBREAKER", entities: scene.entities, prefabs: scene.prefabs } as SceneDocument;
validateSceneDocument(document);
const out = process.env.GB_GAME_OUT || join(ROOT, "examples/gatebreaker/gatebreaker.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(document, null, 2)}\n`);
console.log(`wrote ${out} (${scene.entities.length} entities, ${Object.keys(scene.prefabs).length} prefabs)`);
