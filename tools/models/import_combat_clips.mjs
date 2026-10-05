// Builds assets/source/kit/people/combat_clips.glb (0.78.0): the martial-arts
// clip library a Melee fighter plays, on the same 65-bone Quaternius skeleton
// as kit/people/mannequin_f.glb and talari.glb, so the clips bind to either
// by bone name. It carries a bare skeleton and animations, no mesh, and the
// editor loads it only when a scene has a Melee entity.
//
// Sources (see assets/CREDITS.md):
//   - Quaternius Universal Animation Library 1 and 2 (CC0): punches, knee,
//     uppercut, hit reactions, knockdown/get-up, rolls, slides, jumps, strafe
//     walks, sword sets, block and specials. Same skeleton: copied as is,
//     minus scale tracks and translations below the pelvis, with each strike
//     and its recovery joined into one clip.
//   - CMU Graphics Lab Motion Capture Database, BVH conversion by Bruce Hahne
//     (free for any use): the kicks (front, roundhouse, side; both legs),
//     and a knife-hand block, cut out of subject 135's karate walks and retargeted onto the skeleton
//     by world-space rotation transfer with a per-bone rest alignment.
//
// Every clip plays in place. The distance a clip's body travels (from the
// UAL2 root-motion export, or the CMU hips) and the moment its striking limb
// reaches furthest are printed as a table; engine::gameplay's default move
// list takes its lunges and hit frames from it.
//
// Usage (from the repository root):
//   node tools/models/import_combat_clips.mjs --ual1 UAL1_Standard.glb \
//     --ual2 UAL2_Source.glb --ual2rm UAL2_Source_RM.glb --cmu <cmu-mocap/data> \
//     [--out assets/source/kit/people/combat_clips.glb]
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "../../apps/editor/node_modules/three/build/three.module.js";
import { GLTFLoader } from "../../apps/editor/node_modules/three/examples/jsm/loaders/GLTFLoader.js";
import { BVHLoader } from "../../apps/editor/node_modules/three/examples/jsm/loaders/BVHLoader.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) args[argv[i].replace(/^--/, "")] = argv[i + 1];
  for (const key of ["ual1", "ual2", "ual2rm", "cmu"])
    if (!args[key]) throw new Error(`missing --${key} (see the usage at the top of this file)`);
  args.out ??= path.join(ROOT, "assets/source/kit/people/combat_clips.glb");
  return args;
}

function loadGlb(file) {
  const bytes = readFileSync(file);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Promise((resolve, reject) => new GLTFLoader().parse(buffer, "", resolve, reject));
}

// UAL clips: [output name, source clip(s) joined in order, striking limb or ""].
// A strike and its recovery (`_Rec`) become one clip; the join is where the
// strike can be cancelled into the next one.
const UAL_CLIPS = [
  ["jab", ["Punch_Jab"], "hand_l"],
  ["cross", ["Punch_Cross"], "hand_r"],
  ["hook", ["Melee_Hook", "Melee_Hook_Rec"], "hand_r"],
  ["uppercut", ["Melee_Uppercut"], "hand_r"],
  ["knee", ["Melee_Knee", "Melee_Knee_Rec"], "calf_r"],
  ["melee_combo", ["Melee_Combo"], ""],
  ["hit_chest", ["Hit_Chest"], ""],
  ["hit_head", ["Hit_Head"], ""],
  ["hit_knockback", ["Hit_Knockback"], ""],
  ["launched", ["LiftAir"], ""],
  ["air_fall", ["LiftAir_Fall"], ""],
  ["air_loop", ["LiftAir_Fall_Air_Loop"], ""],
  ["air_hit_l", ["LiftAir_Hit_L"], ""],
  ["air_hit_r", ["LiftAir_Hit_R"], ""],
  ["fall_impact", ["LiftAir_Fall_Impact"], ""],
  ["get_up", ["LayToIdle"], ""],
  ["kip_up", ["KipUp"], ""],
  ["death", ["Death01"], ""],
  ["roll", ["Roll"], ""],
  ["slide", ["Slide_Start", "Slide_Exit"], ""],
  ["flip", ["JogToFlip"], ""],
  ["jump_start", ["Jump_Start"], ""],
  ["jump_loop", ["Jump_Loop"], ""],
  ["jump_land", ["Jump_Land"], ""],
  ["double_jump", ["DoubleJump"], ""],
  ["turn_l", ["Turn180_L"], ""],
  ["turn_r", ["Turn180_R"], ""],
  ["strafe_f", ["Walk_Fwd_Loop"], ""],
  ["strafe_b", ["Walk_Bwd_Loop"], ""],
  ["strafe_l", ["Walk_L_Loop"], ""],
  ["strafe_r", ["Walk_R_Loop"], ""],
  ["sword_block", ["Sword_Block"], ""],
  ["guard_break", ["Idle_Shield_Break"], ""],
  ["shoulder_dash", ["Shield_Dash"], "upperarm_l"],
  ["power_up", ["MonsterTransformation"], ""],
  ["ground_pound", ["Sword_GroundPound"], "hand_r"],
  ["rising_strike", ["Sword_UpperCut"], "hand_r"],
  ["dash_strike", ["Sword_Dash"], "hand_r"],
  ["energy_throw", ["OverhandThrow"], "hand_r"],
  ["energy_cast", ["Spell_Simple_Shoot"], "hand_r"],
  ["sword_idle", ["Sword_Idle"], ""],
  ["sword_light_a", ["Sword_Light_A", "Sword_Light_A_Rec"], "hand_r"],
  ["sword_light_b", ["Sword_Light_B", "Sword_Light_B_Rec"], "hand_r"],
  ["sword_light_c", ["Sword_Light_C", "Sword_Light_C_Rec"], "hand_r"],
  ["sword_heavy_a", ["Sword_Heavy_A", "Sword_Heavy_A_Rec"], "hand_r"],
  ["sword_heavy_b", ["Sword_Heavy_B", "Sword_Heavy_B_Rec"], "hand_r"],
  ["sword_heavy_c", ["Sword_Heavy_C", "Sword_Heavy_C_Rec"], "hand_r"],
];

// CMU cuts: [output name, file, cut]. Kicks give the kicking foot and its
// peak time (the highest point of the kick, found by foot height); other
// cuts give a fixed window in seconds and the joint that ends up ahead.
const CMU_CUTS = [
  ["front_kick_r", "135/135_04.bvh", { foot: "R", peak: 3.13 }],
  ["front_kick_l", "135/135_04.bvh", { foot: "L", peak: 4.87 }],
  ["roundhouse_r", "135/135_07.bvh", { foot: "R", peak: 6.43 }],
  ["roundhouse_l", "135/135_07.bvh", { foot: "L", peak: 3.7 }],
  ["side_kick_r", "135/135_11.bvh", { foot: "R", peak: 2.9 }],
  ["side_kick_l", "135/135_11.bvh", { foot: "L", peak: 10.93 }],
  // Shuto-uke (knife-hand block): the left hand comes up and holds.
  ["block", "135/135_10.bvh", { start: 1.75, end: 2.45, aim: "LeftHand" }],
];

// CMU joint -> skeleton bone, and the child each pair's rest direction is
// measured toward (to align the two rest poses bone by bone).
const CMU_MAP = {
  pelvis: ["Hips"],
  spine_01: ["LowerBack", "Spine", "spine_02"],
  spine_02: ["Spine", "Spine1", "spine_03"],
  spine_03: ["Spine1", "Neck", "neck_01"],
  neck_01: ["Neck", "Head", "Head"],
  Head: ["Head"],
  clavicle_l: ["LeftShoulder", "LeftArm", "upperarm_l"],
  upperarm_l: ["LeftArm", "LeftForeArm", "lowerarm_l"],
  lowerarm_l: ["LeftForeArm", "LeftHand", "hand_l"],
  hand_l: ["LeftHand", "LeftFingerBase", "middle_01_l"],
  clavicle_r: ["RightShoulder", "RightArm", "upperarm_r"],
  upperarm_r: ["RightArm", "RightForeArm", "lowerarm_r"],
  lowerarm_r: ["RightForeArm", "RightHand", "hand_r"],
  hand_r: ["RightHand", "RightFingerBase", "middle_01_r"],
  thigh_l: ["LeftUpLeg", "LeftLeg", "calf_l"],
  calf_l: ["LeftLeg", "LeftFoot", "foot_l"],
  foot_l: ["LeftFoot", "LeftToeBase", "ball_l"],
  ball_l: ["LeftToeBase"],
  thigh_r: ["RightUpLeg", "RightLeg", "calf_r"],
  calf_r: ["RightLeg", "RightFoot", "foot_r"],
  foot_r: ["RightFoot", "RightToeBase", "ball_r"],
  ball_r: ["RightToeBase"],
};

const FPS = 30;
const v = () => new THREE.Vector3();
const q = () => new THREE.Quaternion();

// Bones that keep their translation track: the root and the pelvis carry the
// body's height and sway; every other bone only rotates.
const MOVING = new Set(["root", "pelvis"]);

function trackNode(track) {
  return THREE.PropertyBinding.parseTrackName(track.name).nodeName;
}

function trimTracks(clip) {
  const tracks = clip.tracks.filter((track) => {
    if (track.name.endsWith(".scale")) return false;
    if (track.name.endsWith(".position")) return MOVING.has(trackNode(track));
    return true;
  });
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

// Joins clips end to end (each track resampled onto the joined clip).
function joinClips(name, clips) {
  if (clips.length === 1) return new THREE.AnimationClip(name, clips[0].duration, clips[0].tracks.map((t) => t.clone()));
  const byName = new Map();
  let offset = 0;
  for (const clip of clips) {
    for (const track of clip.tracks) {
      const entry = byName.get(track.name) ?? { type: track.constructor, times: [], values: [] };
      for (let i = 0; i < track.times.length; i++) {
        // Skip a key landing exactly on the previous clip's last key.
        if (entry.times.length && offset + track.times[i] <= entry.times[entry.times.length - 1] + 1e-6) continue;
        entry.times.push(offset + track.times[i]);
        const size = track.getValueSize();
        for (let k = 0; k < size; k++) entry.values.push(track.values[i * size + k]);
      }
      byName.set(track.name, entry);
    }
    offset += clip.duration;
  }
  const tracks = [...byName].map(([trackName, e]) => new e.type(trackName, e.times, e.values));
  return new THREE.AnimationClip(name, offset, tracks);
}

// Samples a clip on a rig: calls `visit(time)` after posing it at each frame.
function sample(rig, clip, visit, fps = FPS) {
  const mixer = new THREE.AnimationMixer(rig);
  const action = mixer.clipAction(clip);
  action.play();
  const frames = Math.max(2, Math.round(clip.duration * fps) + 1);
  for (let i = 0; i < frames; i++) {
    const time = Math.min(clip.duration, i / fps);
    mixer.setTime(time);
    rig.updateMatrixWorld(true);
    visit(time, i);
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(rig);
}

// The time the limb is furthest from the pelvis along the facing (+z), and
// that reach in metres; for strike clips' default hit frames.
function strikeFrame(rig, clip, limb) {
  if (!limb) return undefined;
  const pelvis = rig.getObjectByName("pelvis");
  const bone = rig.getObjectByName(limb);
  let best = { time: 0, reach: -Infinity };
  sample(rig, clip, (time) => {
    const reach = bone.getWorldPosition(v()).z - pelvis.getWorldPosition(v()).z;
    if (reach > best.reach) best = { time, reach };
  });
  return best;
}

// How far the root travels over a root-motion clip, in its own facing (+z).
function rootTravel(rig, clip) {
  const root = rig.getObjectByName("root");
  let first;
  let last;
  sample(rig, clip, (_, i) => {
    const at = root.getWorldPosition(v());
    if (i === 0) first = at;
    last = at;
  });
  return last.sub(first);
}

// Retargets one window of a CMU recording: a kick (cut from the kicking
// foot leaving the floor to it landing, around `cut.peak`) or a fixed
// window (`cut.start`..`cut.end`, faced along the hips at the start).
function retargetCmu(name, bvhText, cut, target) {
  const { foot = "R", peak = 0 } = cut;
  const bvh = new BVHLoader().parse(bvhText);
  const sourceRoot = new THREE.Group();
  sourceRoot.add(bvh.skeleton.bones[0]);
  sourceRoot.updateMatrixWorld(true);
  const bone = (n) => bvh.skeleton.getBoneByName(n);
  const footBone = bone(foot === "R" ? "RightFoot" : "LeftFoot");
  const hips = bone("Hips");

  // Rest pose of both rigs (the BVH rest is its zero-rotation T-pose).
  const sourceRest = new Map();
  for (const b of bvh.skeleton.bones)
    sourceRest.set(b.name, { quat: b.getWorldQuaternion(q()), pos: b.getWorldPosition(v()) });
  target.updateMatrixWorld(true);
  const targetRest = new Map();
  target.traverse((node) =>
    targetRest.set(node.name, {
      quat: node.getWorldQuaternion(q()),
      pos: node.getWorldPosition(v()),
      local: node.quaternion.clone(),
      localPos: node.position.clone(),
    }),
  );
  // Height scale: hips above the feet, source vs target.
  const sourceLeg = sourceRest.get("Hips").pos.y - sourceRest.get("LeftFoot").pos.y;
  const targetLeg = targetRest.get("pelvis").pos.y - targetRest.get("foot_l").pos.y;
  const scale = targetLeg / sourceLeg;
  // Per-bone rest alignment: the target's rest rotation turned so the bone
  // points where the source bone points at rest (the CMU legs splay outward).
  const reference = new Map();
  for (const [targetName, [sourceName, sourceChild, targetChild]] of Object.entries(CMU_MAP)) {
    const rest = targetRest.get(targetName).quat.clone();
    if (sourceChild && targetChild) {
      const from = targetRest.get(targetChild).pos.clone().sub(targetRest.get(targetName).pos).normalize();
      const to = sourceRest.get(sourceChild).pos.clone().sub(sourceRest.get(sourceName).pos).normalize();
      rest.premultiply(new THREE.Quaternion().setFromUnitVectors(from, to));
    }
    reference.set(targetName, rest);
  }

  // Pose the source at a time; returns world quats/positions by joint name.
  const mixer = new THREE.AnimationMixer(sourceRoot);
  mixer.clipAction(bvh.clip).play();
  const pose = (time) => {
    mixer.setTime(time);
    sourceRoot.updateMatrixWorld(true);
  };
  // The floor under this kick: the kicking foot's lowest point within 1.5 s
  // either side of the peak (the walks drift up and down over a recording).
  const ground = (() => {
    let low = Infinity;
    for (let t = Math.max(0, peak - 1.5); t < Math.min(bvh.clip.duration, peak + 1.5); t += 1 / FPS) {
      pose(t);
      low = Math.min(low, footBone.getWorldPosition(v()).y);
    }
    return low;
  })();
  const height = (time) => {
    pose(time);
    return footBone.getWorldPosition(v()).y - ground;
  };
  let start = cut.start;
  let end = cut.end;
  let forward;
  if (cut.peak !== undefined) {
    // The kick: from the kicking foot leaving the floor to it landing, padded.
    const lifted = 0.08 * (sourceRest.get("Hips").pos.y - sourceRest.get("LeftFoot").pos.y);
    start = peak;
    while (start > 0 && height(start) > lifted) start -= 1 / FPS;
    end = peak;
    while (end < bvh.clip.duration && height(end) > lifted) end += 1 / FPS;
    start = Math.max(0, start - 0.25);
    end = Math.min(bvh.clip.duration, end + 0.3);
    // Facing: the direction from the hips to the kicking foot at the peak
    // (flattened), turned to +z, so every kick (side kicks included)
    // strikes straight ahead of the fighter.
    pose(peak);
    forward = footBone.getWorldPosition(v()).sub(hips.getWorldPosition(v()));
  } else {
    // Faced so `cut.aim` (a joint) points ahead at the end of the window.
    pose(end);
    forward = bone(cut.aim).getWorldPosition(v()).sub(hips.getWorldPosition(v()));
  }
  const yaw = Math.atan2(forward.x, forward.z);
  const unturn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -yaw);
  const startHips = hips.getWorldPosition(v()).applyQuaternion(unturn);
  pose(end);
  const endHips = hips.getWorldPosition(v()).applyQuaternion(unturn);

  // Target bones in parent-first order.
  const order = [];
  target.traverse((node) => order.push(node));
  const frames = Math.round((end - start) * FPS) + 1;
  const times = [];
  const tracks = new Map(); // bone -> number[] quats
  const pelvisPositions = [];
  const world = new Map();
  for (let f = 0; f < frames; f++) {
    const time = start + f / FPS;
    pose(time);
    times.push(f / FPS);
    world.clear();
    for (const node of order) {
      const parentWorld = node.parent && world.has(node.parent.name) ? world.get(node.parent.name) : q();
      const map = CMU_MAP[node.name];
      let worldQuat;
      let local;
      if (map) {
        const source = bone(map[0]);
        const delta = source
          .getWorldQuaternion(q())
          .premultiply(unturn)
          .multiply(sourceRest.get(map[0]).quat.clone().invert());
        worldQuat = delta.multiply(reference.get(node.name));
        local = parentWorld.clone().invert().multiply(worldQuat);
        const list = tracks.get(node.name) ?? [];
        list.push(local.x, local.y, local.z, local.w);
        tracks.set(node.name, list);
      } else {
        local = targetRest.get(node.name).local;
        worldQuat = parentWorld.clone().multiply(local);
      }
      world.set(node.name, worldQuat);
    }
    // Pelvis: the hips' offset from a straight line between the window's
    // start and end (so the clip plays in place), scaled to this skeleton.
    const along = f / (frames - 1);
    const at = hips.getWorldPosition(v()).applyQuaternion(unturn);
    const line = startHips.clone().lerp(endHips, along);
    const offset = at.sub(line).multiplyScalar(scale);
    offset.y = (hips.getWorldPosition(v()).y - sourceRest.get("Hips").pos.y) * scale;
    const rest = targetRest.get("pelvis").localPos;
    // The pelvis's parent (root) sits at the origin unrotated.
    pelvisPositions.push(rest.x + offset.x, rest.y + offset.y, rest.z + offset.z);
  }
  const clipTracks = [...tracks].map(([n, values]) => new THREE.QuaternionKeyframeTrack(`${n}.quaternion`, times, values));
  clipTracks.push(new THREE.VectorKeyframeTrack("pelvis.position", times, pelvisPositions));
  const clip = new THREE.AnimationClip(name, (frames - 1) / FPS, clipTracks);
  const travel = endHips.clone().sub(startHips).multiplyScalar(scale);
  return { clip, travel };
}

// -- GLB writer: a bare skeleton (nodes) plus animations ---------------------
function writeGlb(file, skeletonRoot, clips) {
  const nodes = [];
  const index = new Map();
  skeletonRoot.traverse((node) => {
    index.set(node, nodes.length);
    nodes.push(node);
  });
  const json = {
    asset: { version: "2.0", generator: "tools/models/import_combat_clips.mjs" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: nodes.map((node) => {
      const out = { name: node.name };
      const children = node.children.filter((c) => index.has(c)).map((c) => index.get(c));
      if (children.length) out.children = children;
      if (node.position.lengthSq() > 0) out.translation = node.position.toArray();
      if (Math.abs(node.quaternion.w) < 1 - 1e-9) out.rotation = node.quaternion.toArray();
      return out;
    }),
    animations: [],
    accessors: [],
    bufferViews: [],
    buffers: [],
  };
  const chunks = [];
  let length = 0;
  const accessor = (array, type, minmax) => {
    const bytes = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
    json.bufferViews.push({ buffer: 0, byteOffset: length, byteLength: bytes.length });
    chunks.push(bytes);
    length += bytes.length;
    const size = { SCALAR: 1, VEC3: 3, VEC4: 4 }[type];
    const out = { bufferView: json.bufferViews.length - 1, componentType: 5126, count: array.length / size, type };
    if (minmax) {
      out.min = [Math.min(...array)];
      out.max = [Math.max(...array)];
    }
    json.accessors.push(out);
    return json.accessors.length - 1;
  };
  const nodeByName = new Map(nodes.map((n, i) => [n.name, i]));
  for (const clip of clips) {
    const animation = { name: clip.name, channels: [], samplers: [] };
    const inputs = new Map();
    for (const track of clip.tracks) {
      const node = nodeByName.get(trackNode(track));
      if (node === undefined) continue;
      const key = track.times.join(",");
      if (!inputs.has(key)) inputs.set(key, accessor(new Float32Array(track.times), "SCALAR", true));
      const isQuat = track.name.endsWith(".quaternion");
      const output = accessor(new Float32Array(track.values), isQuat ? "VEC4" : "VEC3");
      animation.samplers.push({ input: inputs.get(key), output, interpolation: "LINEAR" });
      animation.channels.push({
        sampler: animation.samplers.length - 1,
        target: { node, path: isQuat ? "rotation" : "translation" },
      });
    }
    json.animations.push(animation);
  }
  const bin = Buffer.concat(chunks);
  json.buffers.push({ byteLength: bin.length });
  let text = Buffer.from(JSON.stringify(json));
  text = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, 0x20)]);
  const binPadded = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
  const header = Buffer.alloc(12);
  header.write("glTF", 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + text.length + 8 + binPadded.length, 8);
  const chunkHeader = (size, type) => {
    const b = Buffer.alloc(8);
    b.writeUInt32LE(size, 0);
    b.writeUInt32LE(type, 4);
    return b;
  };
  writeFileSync(
    file,
    Buffer.concat([header, chunkHeader(text.length, 0x4e4f534a), text, chunkHeader(binPadded.length, 0x004e4942), binPadded]),
  );
}

// Rounds keyframe values so the file compresses and diffs stay small.
function quantize(clip) {
  for (const track of clip.tracks) {
    track.times = Float32Array.from(track.times, (t) => Math.round(t * 1000) / 1000);
    track.values = Float32Array.from(track.values, (x) => Math.round(x * 1e5) / 1e5);
  }
  return clip;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mannequin = await loadGlb(path.join(ROOT, "assets/source/kit/people/mannequin_f.glb"));
  const skeleton = mannequin.scene.getObjectByName("root");
  if (!skeleton) throw new Error("mannequin_f.glb has no root bone");
  // A bare copy of the skeleton to sample clips on (no meshes).
  const rig = new THREE.Group();
  rig.add(skeleton.clone(true));
  const ual = [await loadGlb(args.ual1), await loadGlb(args.ual2)];
  const ualRm = await loadGlb(args.ual2rm);
  const find = (name, sets) => {
    for (const set of sets) {
      const clip = set.animations.find((c) => c.name === name);
      if (clip) return clip;
    }
    throw new Error(`no clip named ${name}`);
  };
  const out = [];
  const table = [];
  for (const [name, sources, limb] of UAL_CLIPS) {
    const clip = quantize(trimTracks(joinClips(name, sources.map((s) => find(s, ual)))));
    let travel = 0;
    const rm = ualRm.animations.filter((c) => sources.includes(c.name));
    if (rm.length === sources.length)
      for (const s of sources) travel += rootTravel(rig, ualRm.animations.find((c) => c.name === s)).z;
    // A root-motion clip's in-place twin keeps its own root track still.
    const strike = strikeFrame(rig, clip, limb);
    const split = sources.length > 1 ? find(sources[0], ual).duration : undefined;
    table.push({ name, duration: clip.duration, travel, hit: strike?.time, reach: strike?.reach, split });
    out.push(clip);
  }
  // The fighting stance: every UAL strike starts and ends in this boxing
  // guard (the jab's first frame), held still.
  const jab = find("Punch_Jab", ual);
  const guard = new THREE.AnimationClip(
    "guard",
    1,
    trimTracks(jab).tracks.map((track) => {
      const size = track.getValueSize();
      const first = Array.from(track.values.slice(0, size));
      return new track.constructor(track.name, [0, 1], [...first, ...first]);
    }),
  );
  out.push(quantize(guard));
  table.push({ name: "guard", duration: 1, travel: 0 });
  for (const [name, file, cut] of CMU_CUTS) {
    const source = readFileSync(path.join(args.cmu, file), "utf8");
    const { clip, travel } = retargetCmu(name, source, cut, rig.children[0].clone(true));
    quantize(clip);
    const strike = cut.peak !== undefined ? strikeFrame(rig, clip, cut.foot === "R" ? "foot_r" : "foot_l") : undefined;
    table.push({ name, duration: clip.duration, travel: travel.z, hit: strike?.time, reach: strike?.reach });
    out.push(clip);
  }
  writeGlb(args.out, rig.children[0], out);
  const f = (x) => (x === undefined ? "-" : x.toFixed(2));
  console.log("clip              length  travel  hit    reach  split");
  for (const row of table)
    console.log(
      `${row.name.padEnd(17)} ${f(row.duration).padStart(6)} ${f(row.travel).padStart(7)} ${f(row.hit).padStart(5)} ${f(row.reach).padStart(6)} ${f(row.split).padStart(6)}`,
    );
  console.log(`wrote ${path.relative(ROOT, args.out)} (${out.length} clips)`);
}

await main();
