// Generates GATEBREAKER M1, the vertical slice (examples/gatebreaker/e-rank-gate.json):
// one E-rank Gate from docs/gatebreaker/GAME_DESIGN.md §6. The prologue
// panels play over a night plaza with the Double Gate; then the tutorial
// room with its training construct, three goblin rooms that seal and open
// (grunts, archers, a shield-bearer), the Goblin Chieftain's arena, and the
// rewards. tools/gatebreaker/lua/director.lua runs it. Run from apps/editor:
//
//   npm run gatebreaker
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { validateSceneDocument } from "../../apps/editor/src/scene/SceneSerializer";
import type { SceneDocument } from "../../apps/editor/src/scene/SceneSerializer";
import { ROOT, SceneBuilder, type V3, modelId, rgb, vec } from "./kit";

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
    text: "LMB attack · RMB heavy · Space dodge · Shift block/parry · E R skills · F ultimate · Tab lock · G skip tutorial",
    anchor: "top-center",
    offsetY: 14,
    fontSize: 12,
    color: vec(1, 1, 1),
    opacity: 0.7,
  },
});
scene.add("Objective", [0, 0, 0], {
  UI: { text: "", anchor: "top-left", offsetX: 18, offsetY: 44, fontSize: 17, color: vec(0.75, 0.88, 1), opacity: 0.95 },
});
scene.add("Director", [0, 0, 0], { Script: { source: lua("director.lua"), props: { fast: false } } });

// One collision slab under everything (the tiles are only looks).
scene.add("Ground", [0, -0.5, -40], {
  Scale: { value: vec(80, 1, 220) },
  Renderable: { mesh: 0, material: 0, visible: false },
  RigidBody: { dynamic: false },
  Collider: { type: "AABB" },
});

// -- Rooms ------------------------------------------------------------------
const wallKinds = ["wall", "wall-cracked", "wall-arched", "wall", "wall-cracked", "wall-arched", "wall"];
// An open doorway at x = 0 in a north or south wall: the 2 m opening is
// clear, and invisible jambs keep the wall either side of it solid. They
// are a little shallower than the 1 m walls, so a body sliding along the
// wall never catches on the seam between them.
function doorway(name: string, z: number, yaw: number) {
  scene.model(name, dungeon("wall-doorway-open"), [0, 0, z], yaw, false);
  for (const x of [-1.5, 1.5]) scene.box(`${name} jamb ${x < 0 ? "W" : "E"}`, [x, 2, z], [1, 4, 0.9], "#000000", { Renderable: { mesh: 0, material: 0, visible: false } });
}
// A square room of 4 m tiles centred on (0, cz), `half` metres to each wall,
// with a doorway in the middle of the north and/or south wall.
function room(name: string, cz: number, half: number, north: boolean, south: boolean) {
  for (let x = -half + 2; x < half; x += 4)
    for (let z = -half + 2; z < half; z += 4) scene.model(`${name} floor ${x},${z}`, dungeon("floor-tile-large"), [x, FLOOR, cz + z], 0, false);
  const pieces = half / 2; // 4 m walls from -half to +half
  const along = (i: number) => -half + 2 + i * 4;
  for (let i = 0; i < pieces; i++) {
    const t = along(i);
    const middle = Math.abs(t) < 0.01;
    if (middle && north) doorway(`${name} north door`, cz - half, 0);
    else scene.model(`${name} north wall ${i}`, dungeon(wallKinds[i % wallKinds.length]!), [t, 0, cz - half], 0);
    if (middle && south) doorway(`${name} south door`, cz + half, Math.PI);
    else scene.model(`${name} south wall ${i}`, dungeon(wallKinds[(i + 3) % wallKinds.length]!), [t, 0, cz + half], Math.PI);
    scene.model(`${name} west wall ${i}`, dungeon(wallKinds[(i + 1) % wallKinds.length]!), [-half, 0, cz + t], Math.PI / 2);
    scene.model(`${name} east wall ${i}`, dungeon(wallKinds[(i + 2) % wallKinds.length]!), [half, 0, cz + t], -Math.PI / 2);
  }
  for (const [x, z] of [
    [-half, -half],
    [half, -half],
    [-half, half],
    [half, half],
  ] as const)
    scene.model(`${name} corner ${x},${z}`, dungeon("pillar"), [x, 0, cz + z]);
}
// A torch on a wall facing into the room, with its light and flames.
let torches = 0;
function torch(at: V3, yaw: number, light = true) {
  const n = ++torches;
  scene.model(`Torch ${n}`, dungeon("torch-mounted"), at, yaw, false);
  const out: V3 = [at[0] + Math.sin(yaw) * 0.45, at[1] + 0.75, at[2] + Math.cos(yaw) * 0.45];
  scene.add(`Torch flame ${n}`, out, {
    Renderable: { visible: false },
    ...(light ? { Light: { type: "Point", color: rgb("#ff9a4a"), intensity: 10, range: 13, castShadows: false } } : {}),
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
function corridor(n: number, z: number, open: boolean) {
  scene.model(`Corridor ${n} floor`, dungeon("floor-tile-large"), [0, FLOOR, z], 0, false);
  scene.model(`Corridor ${n} west`, dungeon("wall"), [-2.5, 0, z], Math.PI / 2);
  scene.model(`Corridor ${n} east`, dungeon("wall"), [2.5, 0, z], -Math.PI / 2);
  scene.box(`Seal ${n}`, [0, open ? -40 : 1.75, z], [4, 3.5, 0.4], "#5a2dff", {}, {
    emissive: rgb("#7a4dff"),
    emissiveIntensity: 1.6,
    opacity: 0.55,
  });
}

// Tutorial (centre 0), rooms 1-3 (-24, -48, -72), the boss arena (-100).
room("Tutorial", 0, 10, true, false);
corridor(1, -12, false);
room("Room 1", -24, 10, true, true);
corridor(2, -36, false);
room("Room 2", -48, 10, true, true);
corridor(3, -60, false);
room("Room 3", -72, 10, true, true);
corridor(4, -84, false);
room("Arena", -100, 14, false, true);
for (const [cz, half] of [
  [0, 10],
  [-24, 10],
  [-48, 10],
  [-72, 10],
] as const) {
  torch([-half + 0.5, 2.2, cz - 2], Math.PI / 2);
  torch([half - 0.5, 2.2, cz + 3], -Math.PI / 2, cz !== 0);
}
torch([-13.5, 2.4, -95], Math.PI / 2);
torch([13.5, 2.4, -95], -Math.PI / 2);
torch([-6, 2.4, -113.5], 0, false);
torch([6, 2.4, -113.5], 0, false);

// Dressing, kept to the walls.
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
for (const [x, z] of [
  [-7, -94],
  [7, -94],
  [-7, -106],
  [7, -106],
] as const)
  scene.model(`Arena column ${x},${z}`, dungeon("column"), [x, 0, z]);
scene.model("Arena candles", dungeon("candle-triple"), [0, 0, -112], 0, false);

// -- Move lists ---------------------------------------------------------------
// Twin daggers. Light: stab, stab, hook-slash, spinning kick. Heavy after 1,
// 2, 3 or 4 lights is a different finisher (GAME_DESIGN.md 5.2); from neutral
// it's an armored, guard-breaking cross-cut. Skills spend mana; the ultimate
// spends the gauge that hits and parries fill.
const heroMoves = `# GATEBREAKER twin daggers (M1)
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
fang_whirl: clip=sword_heavy_c input=skill2 dur=1.0 hit=0.3-0.42 cancel=0.6 dmg=16 aoe=2.4 knock=6 stun=0.6 stop=0.1 mana=35 cooldown=5 lunge=0.2 limb=hand_r
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
// The Chieftain: big cleaves, a leaping strike, and the red slam (an
// unblockable area attack with a long, readable wind-up) that its script
// calls every few seconds, faster in phase 2.
const bossMoves = `# Goblin Chieftain
cleave: clip=sword_heavy_a input=light dur=1.15 hit=0.5-0.6 cancel=0.7 dmg=14 reach=1.7 radius=1.0 lunge=0.6 knock=5 stun=0.5 stop=0.1 limb=hand_r
cleave_back: clip=sword_heavy_b input=light after=cleave dur=0.95 hit=0.35-0.45 cancel=0.6 dmg=14 reach=1.7 radius=1.0 lunge=0.4 knock=6 stun=0.5 stop=0.1 limb=hand_r
stomp: clip=front_kick_r input=kick dur=0.9 hit=0.4-0.5 cancel=0.6 dmg=10 reach=1.4 height=0.5 lunge=0.4 knock=7 stun=0.5 limb=foot_r
leap: clip=dash_strike input=heavy dur=1.3 hit=0.55-0.8 cancel=1.0 dmg=16 reach=1.3 lunge=5 knock=7 stun=0.7 stop=0.12 armor limb=hand_r
red_slam: clip=ground_pound input=special dur=1.9 hit=1.05-1.15 cancel=1.6 dmg=26 aoe=3.4 knock=9 stun=1 stop=0.16 armor unblockable knockdown limb=hand_r
`;
const constructMoves = `# Training construct: one slow, readable swing
swing: clip=hook input=light dur=1.3 hit=0.8-0.9 cancel=1.1 dmg=4 reach=1.4 radius=0.9 lunge=0.2 knock=2 stun=0.3 track=120 limb=hand_r
`;

// -- Scripts ----------------------------------------------------------------
const heroScript = `-- Reports blows to the Director (the tutorial), and learns new skills.
function on_melee_hit(target, move, damage, outcome)
  world.send(world.find("Director"), "hero_hit", move .. ":" .. outcome)
end
function on_message(name)
  if name == "unlock" then melee.unlock("shadow_dash") end
end
`;
const sleeperScript = `-- Waits, asleep, until the Director wakes its room.
function on_start() melee.set_ai(false) end
function on_message(name)
  if name == "wake" then melee.set_ai(true) end
end
`;
const constructScript = `-- The training construct swings only when the lesson calls for it, and
-- never breaks.
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
  world.send(world.find("Director"), "construct", outcome)
end
function on_damaged(amount) world.heal(self.id, amount) end
`;
const bossScript = `-- The Goblin Chieftain: asleep until the Director wakes it, then a red
-- slam every few seconds; below half health, phase 2.
local awake, phase, t = false, 1, 0
function on_start() melee.set_ai(false) end
function on_message(name)
  if name == "wake" then awake = true melee.set_ai(true, 0.55, 0.45) end
end
function on_tick(dt)
  if not awake then return end
  t = t + dt
  local hp, max = world.health(self.id)
  if phase == 1 and hp and max and hp < max * 0.5 then
    phase = 2
    melee.set_ai(true, 0.85, 0.6)
    world.send(world.find("Director"), "phase2")
  end
  if t > (phase == 1 and 8 or 5) and melee.perform("red_slam") then t = 0 end
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
scene.add("Training Construct", [0, 0.9, -3], {
  Scale: { value: vec(0.6, 1.8, 0.6) },
  Renderable: { mesh: MANNEQUIN, material: 0, visible: true },
  Material: { color: rgb("#7c8aa5"), roughness: 0.9, keepTextures: false },
  RigidBody: { mass: 400, dynamic: true },
  Collider: {},
  Health: { current: 999, maximum: 999 },
  Melee: { style: "Custom", moves: constructMoves, team: 1, ai: true, aggression: 0, skill: 0 },
  Script: { source: constructScript, props: {} },
});

type Kind = "grunt" | "archer" | "shield";
function goblin(name: string, at: [number, number], kind: Kind) {
  const melee: Record<string, unknown> = {
    style: "Custom",
    team: 1,
    ai: true,
    reaction: 0.35,
    moves: kind === "archer" ? archerMoves : kind === "shield" ? shieldMoves : gruntMoves,
    aggression: kind === "shield" ? 0.4 : 0.6,
    skill: kind === "shield" ? 0.6 : 0.3,
    rightHand: kind === "archer" ? 0 : modelId("knife"),
    leftHand: kind === "archer" ? modelId("bow") : kind === "shield" ? modelId("shield-round") : 0,
    ...(kind === "archer" ? { range: 7 } : {}),
    ...(kind === "shield" ? { shield: true, guard: 220, poise: 70, breakTime: 2.5 } : {}),
  };
  scene.add(name, [at[0], 0.725, at[1]], {
    Scale: { value: vec(0.5, 1.45, 0.5) },
    Renderable: { mesh: GOBLIN, material: 0, visible: true },
    RigidBody: { mass: 45, dynamic: true },
    Collider: {},
    Health: { current: kind === "shield" ? 110 : kind === "archer" ? 40 : 60, maximum: kind === "shield" ? 110 : kind === "archer" ? 40 : 60 },
    Melee: melee,
    Script: { source: sleeperScript, props: {} },
  });
}
goblin("R1 Grunt A", [-3, -28], "grunt");
goblin("R1 Grunt B", [3, -29], "grunt");
goblin("R1 Grunt C", [0, -31], "grunt");
goblin("R2 Grunt A", [-3, -50], "grunt");
goblin("R2 Grunt B", [3, -50], "grunt");
goblin("R2 Archer A", [-5, -55], "archer");
goblin("R2 Archer B", [5, -55], "archer");
goblin("R3 Shieldbearer", [0, -75], "shield");
goblin("R3 Grunt A", [-4, -78], "grunt");
goblin("R3 Grunt B", [4, -78], "grunt");
scene.add("Goblin Chieftain", [0, 1.05, -104], {
  Scale: { value: vec(0.8, 2.1, 0.8) },
  Renderable: { mesh: GOBLIN, material: 0, visible: true },
  RigidBody: { mass: 160, dynamic: true },
  Collider: {},
  Health: { current: 420, maximum: 420 },
  Melee: {
    style: "Custom",
    moves: bossMoves,
    team: 1,
    ai: true,
    aggression: 0.55,
    skill: 0.45,
    reaction: 0.3,
    guard: 160,
    rightHand: modelId("claymore"),
    poise: 130,
    breakTime: 3.5,
  },
  Script: { source: bossScript, props: {} },
});

// -- The prologue set: a night plaza in Seoul and the Double Gate ---------------
scene.box("Plaza", [0, -0.05, 58], [70, 0.1, 50], "#24232b", { Collider: { type: "AABB", isTrigger: true } });
for (const [id, x, z, yaw] of [
  [20, -24, 66, Math.PI / 2],
  [21, 24, 70, -Math.PI / 2],
  [8, -22, 46, Math.PI / 2],
  [9, 22, 48, -Math.PI / 2],
  [22, -12, 84, 0],
  [10, 12, 86, 0],
] as const)
  scene.model(`Plaza building ${id}`, id, [x, 0, z], yaw, false);
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
    Light: { type: "Point", color: rgb(hex), intensity: 26, range: 32, castShadows: false },
  });

const document = { format: 1, name: "GATEBREAKER — E-rank Gate", entities: scene.entities } as SceneDocument;
validateSceneDocument(document);
const out = process.env.GB_GATE_OUT || join(ROOT, "examples/gatebreaker/e-rank-gate.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(document, null, 2)}\n`);
console.log(`wrote ${out} (${scene.entities.length} entities)`);
