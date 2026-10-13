// Generates VELOCITY (games/my-games/velocity/velocity.json) from
// games/my-games/velocity/GAME_DESIGN.md: Meridian Ward in daylight, the
// speedster Velocity, the Street Enforcers, and the mission director.
//
// - lua/director.lua runs the campaign (missions, objectives, checkpoints,
//   the save) and the district map.
// - lua/hero.lua is Velocity's own script: speed effects, the speed readout
//   and the moves the director unlocks.
//
// Run from apps/editor:
//
//   npm run velocity
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { validateSceneDocument } from "../../apps/editor/src/scene/SceneSerializer";
import type { SceneDocument } from "../../apps/editor/src/scene/SceneSerializer";
import { martialArtsMoves } from "../../apps/editor/src/scene/meleeMoves";
import { ROOT, SceneBuilder, type V3, rgb, vec } from "../gatebreaker/kit";
import { WARD, buildWard, wardMap } from "./ward";

const scene = new SceneBuilder();
const lua = (file: string) => readFileSync(join(ROOT, "tools/velocity/lua", file), "utf8");

// -- Look: warm daylight, restrained grading (GAME_DESIGN.md 4, "Art direction") --
scene.add("Environment", [0, -30, 0], {
  Environment: {
    sky: "Procedural",
    skyColor: rgb("#4f8cd6"),
    horizonColor: rgb("#f5d2a2"),
    groundColor: rgb("#6b7563"),
    sunElevation: 52,
    sunAzimuth: 215,
    sunIntensity: 3.4,
    sunColor: rgb("#fff0d6"),
    ambientIntensity: 1.3,
    fog: "Linear",
    fogColor: rgb("#c4d3e0"),
    fogNear: 120,
    fogFar: 460,
    shadows: true,
    exposure: 1.12,
  },
  PostProcessing: {
    antialias: "SMAA",
    ambientOcclusion: true,
    aoRadius: 0.35,
    aoIntensity: 0.6,
    bloom: 0.12,
    bloomRadius: 0.3,
    bloomThreshold: 0.95,
    exposure: 1.06,
    contrast: 0.08,
    saturation: 0.08,
    temperature: 0.06,
    vignette: 0.12,
    shadowQuality: "High",
  },
});

// -- Controls (GAME_DESIGN.md 5, "Baseline controls") -----------------------------
scene.add("Input", [0, 0, 0], {
  InputActions: {
    bindings: [
      "move_x: d, -a, right, -left, pad_lx",
      "move_y: w, -s, up, -down, -pad_ly",
      "look_x: mouse_dx*0.05, pad_rx",
      "look_y: mouse_dy*0.05, pad_ry",
      "jump: space, pad_a",
      "sprint: shift, pad_ls",
      "light: mouse_left, j, pad_x",
      "heavy: mouse_right, k, pad_y",
      "kick: l, pad_b",
      "special: u, pad_rb",
      "dodge: x, alt, pad_lt",
      "block: r, pad_lb",
      "lock: tab, mouse_middle, pad_rs",
      "interact: g, pad_up",
      "restart: backspace, pad_back",
    ].join("\n") + "\n",
  },
});

// -- HUD ---------------------------------------------------------------------------
const ui = (name: string, fields: Record<string, unknown>) => scene.add(name, [0, 0, 0], { UI: { color: vec(1, 1, 1), opacity: 0.95, ...fields } });
ui("Title", { text: "VELOCITY", anchor: "top-left", offsetX: 22, offsetY: 18, fontSize: 18, color: rgb("#9fe6ff") });
// The mission tracker: the mission's name and its current objective.
ui("Mission", { text: "", anchor: "top-left", offsetX: 22, offsetY: 48, fontSize: 13, color: rgb("#ffcf7a") });
ui("Objective", { text: "", anchor: "top-left", offsetX: 22, offsetY: 68, fontSize: 16, width: 300 });
// Context prompt ("G  Help the civilian") and the teaching hint under it.
ui("Prompt", { text: "", anchor: "bottom-center", offsetY: -130, fontSize: 20 });
ui("Hint", { text: "", anchor: "bottom-center", offsetY: -96, fontSize: 14, color: rgb("#d8e6f2"), opacity: 0.9 });
ui("Speed", { text: "", anchor: "bottom-right", offsetX: -24, offsetY: -24, fontSize: 22, color: rgb("#9fe6ff") });
// Two short lines, clear of the tracker (top left) and the minimap (top right).
ui("Controls", {
  text: "WASD move · Shift sprint · Space jump · LMB/J light · RMB/K heavy · L kick\nU burst · X dodge · R block · Tab lock · G use · M map · Backspace checkpoint · Esc pause",
  anchor: "top-center",
  offsetY: 12,
  fontSize: 11,
  opacity: 0.6,
});

// -- Velocity --------------------------------------------------------------------
// Kinetic Burst and the other specials stay locked until the story grants
// them (Mission 0 unlocks the burst).
const heroMoves = martialArtsMoves
  .split("\n")
  .map((line) => (/ input=special /.test(line) ? `${line} locked` : line))
  .join("\n");
const MANNEQUIN = 132;
scene.add("Velocity", [WARD.start.x, 0.9, WARD.start.z], {
  Scale: { value: vec(0.6, 1.8, 0.6) },
  Renderable: { mesh: MANNEQUIN, material: 0, visible: true },
  Material: { color: rgb("#2a5fb8"), roughness: 0.55, metalness: 0.1, keepTextures: false },
  Player: {},
  RigidBody: { mass: 75, dynamic: true },
  Collider: {},
  // Normal ~9.5 m/s, sprint 2.5x (GATEBREAKER's hunter walks 5.2).
  CharacterController: { mode: "ThirdPerson", walkSpeed: 9.5, sprintSpeed: 24, jumpHeight: 2.6, acceleration: 60, airControl: 24, stepHeight: 0.5 },
  Health: { current: 240, maximum: 240 },
  Melee: { style: "Custom", moves: heroMoves, team: 0, ai: false, energy: 0, guard: 110 },
  Trail: { color: rgb("#9fe6ff"), width: 0.18, lifetime: 0.16, minDistance: 0.25 },
  Particles: { preset: "Sparkle", rate: 0, lifetime: 0.45, speed: 0.6, size: 0.1, color: rgb("#cdf3ff"), endColor: rgb("#3fa9ff"), endSize: 0.02, shape: "Box", shapeSize: 0.5 },
  Script: { source: lua("hero.lua"), props: {} },
});
scene.add("Camera", [WARD.start.x, 4, WARD.start.z - 6], {
  Camera: { fov: 62, far: 700 },
  CameraFollow: { target: "", offset: vec(0, 2.4, -5.2), smoothing: 0.1, lookHeight: 1.15, collision: true, orbit: true },
});

// -- People ------------------------------------------------------------------------
const person = (hex: string) => ({
  Scale: { value: vec(0.6, 1.8, 0.6) },
  Renderable: { mesh: MANNEQUIN, material: 0, visible: true },
  Material: { color: rgb(hex), roughness: 0.8, keepTextures: false },
  RigidBody: { mass: 70, dynamic: false },
  Collider: {},
});
// Ward Dispatch's contact at the plaza: missions start with her.
scene.add("Dispatcher Vance", [WARD.contact.x, 0.9, WARD.contact.z], { ...person("#3b5f7a"), Rotation: { euler: vec(0, Math.PI, 0) } });
// Civilians the director places for rescues (hidden under the plaza until used).
scene.prefab("Civilian", person("#d9a441"));

// -- The roster (GAME_DESIGN.md 6, "Enemy roster") -----------------------------------
// Each kind reads by colour and silhouette; its dangerous move is telegraphed
// (red attacks can't be blocked: dodge them).
const rusherMoves = `# Rusher: jabs up close; from range, a straight-line shoulder charge (red: dodge it)
jab: clip=jab input=light dur=0.6 hit=0.18-0.24 cancel=0.3 dmg=6 reach=0.95 lunge=0.3 stun=0.3 limb=hand_l
cross: clip=cross input=light after=jab dur=0.65 hit=0.2-0.26 cancel=0.32 dmg=7 reach=1.0 lunge=0.3 stun=0.35 limb=hand_r
charge: clip=shoulder_dash input=heavy dur=1.5 hit=0.7-1.1 cancel=1.3 dmg=14 reach=1.0 lunge=9 knock=8 stun=0.7 stop=0.1 armor unblockable track=40 limb=upperarm_l
roll: clip=roll input=dodge dur=0.6 hit=0-0 cancel=0.45 dmg=0 lunge=3 free iframes=0.03-0.36 track=0 limb=pelvis
`;
const suppressorMoves = `# Suppressor: kinetic bursts from range; a shove up close
burst: clip=energy_throw input=light dur=1.1 hit=0.6-0.65 cancel=0.9 dmg=8 projectile=16 knock=2 stun=0.3 track=60 lunge=0 limb=hand_r
shove: clip=jab input=kick dur=0.62 hit=0.2-0.26 cancel=0.3 dmg=5 reach=0.95 lunge=0.3 knock=4 stun=0.3 limb=hand_l
hop: clip=roll input=dodge dur=0.6 hit=0-0 cancel=0.45 dmg=0 lunge=3.5 free iframes=0.03-0.36 track=0 limb=pelvis
`;
const heavyMoves = `# Shield Heavy: guards its front, bashes, and slams to break a guard (red: dodge it)
bash: clip=cross input=light dur=0.8 hit=0.3-0.38 cancel=0.45 dmg=9 reach=1.0 lunge=0.4 knock=4 stun=0.5 limb=hand_l
kick: clip=front_kick_r input=kick dur=0.8 hit=0.33-0.44 cancel=0.5 dmg=8 reach=1.15 height=0.55 lunge=0.4 knock=5 stun=0.4 limb=foot_r
slam: clip=ground_pound input=heavy dur=1.5 hit=0.8-0.9 cancel=1.2 dmg=18 aoe=2.4 knock=7 stun=0.8 stop=0.12 armor unblockable limb=hand_r
`;
// Every street enemy can be tuned for Heroic ("tune": damage and health scales).
const enemyScript = `-- A street enemy (tools/velocity): the director tunes it for Heroic.
function on_message(name, value)
  if name == "tune" and type(value) == "string" then
    local d, h = value:match("^([%d.]+),([%d.]+)$")
    local _, max = world.health(self.id)
    if d and max then melee.tune(tonumber(d), -1, -1, -1, max * tonumber(h)) end
  end
end
`;
const fighter = (hex: string, health: number, melee: Record<string, unknown>, size: [number, number] = [0.6, 1.8], mass = 80) => ({
  Scale: { value: vec(size[0], size[1], size[0]) },
  Renderable: { mesh: MANNEQUIN, material: 0, visible: true },
  Material: { color: rgb(hex), roughness: 0.85, keepTextures: false },
  RigidBody: { mass, dynamic: true },
  Collider: {},
  Health: { current: health, maximum: health },
  Melee: { team: 1, ai: true, reaction: 0.35, ...melee },
  Script: { source: enemyScript, props: {} },
});
// Street Enforcer: baseline melee (the built-in martial arts).
scene.prefab("Street Enforcer", fighter("#7a2e26", 70, { style: "Martial arts", aggression: 0.5, skill: 0.3, guard: 60 }));
scene.prefab("Rusher", fighter("#c4642a", 60, { style: "Custom", moves: rusherMoves, aggression: 0.7, skill: 0.25, guard: 40 }));
scene.prefab("Suppressor", fighter("#2a7f7a", 50, { style: "Custom", moves: suppressorMoves, aggression: 0.55, skill: 0.3, range: 9, guard: 30 }));
scene.prefab("Shield Heavy", fighter("#4a4f5c", 160, { style: "Custom", moves: heavyMoves, aggression: 0.4, skill: 0.55, shield: true, guard: 200, poise: 70, breakTime: 2.5, leftHand: 212 }, [0.75, 1.95], 120));

// Breakline (Mission 4): a former emergency-response engineer with stolen
// momentum-dampening gear. lua/breakline.lua runs the phases the director
// sends (70% and 35%).
const breaklineMoves = `# Breakline: a two-hit chain, the charge, and (phase 2 on) the slam ring
strike: clip=hook input=light dur=0.85 hit=0.35-0.43 cancel=0.5 dmg=12 reach=1.2 lunge=0.6 knock=3 stun=0.5 limb=hand_r
strike2: clip=uppercut input=light after=strike dur=0.95 hit=0.4-0.5 cancel=0.75 dmg=14 reach=1.1 lunge=0.4 knock=5 stun=0.6 stop=0.1 limb=hand_r
kick: clip=side_kick_r input=kick after=strike|strike2 dur=0.9 hit=0.3-0.4 cancel=0.6 dmg=12 reach=1.4 knock=7 stun=0.6 limb=foot_r
charge: clip=shoulder_dash input=heavy dur=1.6 hit=0.75-1.15 cancel=1.4 dmg=18 reach=1.1 lunge=10 knock=9 stun=0.8 stop=0.12 armor unblockable track=35 limb=upperarm_l
ring: clip=ground_pound input=special dur=1.6 hit=0.85-0.95 cancel=1.3 dmg=20 aoe=4 knock=8 launch=3 stun=0.9 stop=0.14 armor unblockable cooldown=6 locked limb=hand_r
roll: clip=roll input=dodge dur=0.6 hit=0-0 cancel=0.45 dmg=0 lunge=3 free iframes=0.03-0.36 track=0 limb=pelvis
`;
scene.prefab("Breakline", {
  ...fighter("#3b3550", 520, { style: "Custom", moves: breaklineMoves, aggression: 0.6, skill: 0.6, guard: 160, poise: 120, breakTime: 2.5, energy: 100 }, [0.75, 2.0], 140),
  Material: { color: rgb("#3b3550"), emissive: rgb("#ff7a2a"), emissiveIntensity: 0.25, roughness: 0.6, keepTextures: false },
  Particles: { preset: "Sparkle", rate: 60, lifetime: 0.5, speed: 1.2, size: 0.14, color: rgb("#ffd0a0"), endColor: rgb("#ff6a2a"), endSize: 0.03, shape: "Sphere", shapeSize: 1.2 },
  Script: { source: lua("breakline.lua"), props: {} },
});

// The runaway rig (Mission 2 and the Runaway Rig incident): a delivery van an
// AI driver takes along the route the director gives it.
scene.prefab("Runaway Rig", {
  Scale: { value: vec(2.4, 2.86, 5.3) },
  Renderable: { mesh: 104, material: 0, visible: true },
  RigidBody: { mass: 1800, dynamic: true },
  Collider: {},
  Vehicle: { model: "Arcade", topSpeed: 24, acceleration: 7, braking: 20, grip: 1.1, steering: 30, nitroBoost: 0, gears: 5 },
  Driver: { mode: "Off", skill: 0.8, aggression: 0.2, speedScale: 1 },
});
// What incidents and missions use: a device to shut down, a first-aid kit,
// a relay gate.
const prop = (hex: string, size: V3, glow: string) => ({
  Scale: { value: vec(...size) },
  Renderable: { mesh: 0, material: 0, visible: true },
  Material: { color: rgb(hex), emissive: rgb(glow), emissiveIntensity: 1.2, roughness: 0.5, keepTextures: false },
  RigidBody: { dynamic: false },
  Collider: { type: "AABB", isTrigger: true },
});
// A police barrier for Mission 2's roadblock (the kit's road barrier).
scene.prefab("Roadblock", {
  Scale: { value: vec(2, 1.04, 0.5) },
  Renderable: { mesh: 26, material: 0, visible: true },
  RigidBody: { dynamic: false },
  Collider: {},
});
scene.prefab("Cell Device", prop("#20262e", [0.8, 1.1, 0.8], "#ffb43a"));
scene.prefab("Aid Kit", prop("#f2f2f2", [0.6, 0.4, 0.4], "#ff4d4d"));
scene.prefab("Relay Gate", {
  ...prop("#0e2a3a", [3.4, 3.4, 0.25], "#5fd0ff"),
  Particles: { preset: "Sparkle", rate: 24, lifetime: 0.8, speed: 0.5, size: 0.12, color: rgb("#bff0ff"), endColor: rgb("#3fa9ff"), endSize: 0.03, shape: "Box", shapeSize: 1.6 },
});

// -- Meridian Ward ---------------------------------------------------------------
buildWard(scene);

// -- Scripts ---------------------------------------------------------------------
scene.add("Director", [0, 0, 0], {
  Script: { source: lua("director.lua").replace("__MAP__", wardMap()), props: { fast: false } },
});

// -- Write -----------------------------------------------------------------------
const doc = { format: 1, name: "VELOCITY", entities: scene.entities, prefabs: scene.prefabs } as SceneDocument;
validateSceneDocument(doc);
const out = join(ROOT, "games/my-games/velocity/velocity.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(doc, null, 1) + "\n");
console.log(`wrote ${out}: ${scene.entities.length} entities, ${Object.keys(scene.prefabs).length} prefabs`);
