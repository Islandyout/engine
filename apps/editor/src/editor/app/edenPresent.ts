import * as THREE from "three";
import { findPoseBones, type PoseBones } from "../poses";
import { walkerBodyOf, walkerDeed, walkerSpeed } from "../../eden/body";
import { runCreatorCommand } from "../../eden/creator";
import {
  CRAFT_PREFAB, PREFAB_LIFT, SCAR_PLACE, barText, blinkClosure, faceOf, feastHud, feastTonight, festivalSpot, horizonMarks, scarKey, scarsOf, stature, travellers, walkerHud, walkerStature,
  type Traveller,
} from "../../eden/present";
import type { Look } from "../../eden/motion";
import type { Scar } from "../../eden/body";
import type { Person, Thing, World } from "../../eden/mind";
import type { Ctx } from "./context";

// What the page draws of the simulation that has no body of its own to move: how big each person is and how it grows, faces that blink and
// say what the person feels, scars, the Walker's look and pace, the other settlements on the horizon and the parties that come from them, a
// boat that is rowed and a bridge laid across the water, the fire of a feast and the heads-up display. The mind decides; this only shows
// (docs/changelog/F152.md). Pure parts that tests can check are in src/eden/present.ts.

export interface PresentApi {
  ui(kind: string, value: string): void;
  groundY(x: number, z: number): number;
  waterLevel: number;
  /** The scene body of a person, if it is in the scene. */
  bodyOf(p: Person): THREE.Object3D | undefined;
  /** The scene body registered for an id (a thing or a traveller), and its object index. */
  indexOf(id: string): number;
  log(text: string): void;
  fast(): boolean;
}

const BONE_OF_SCAR = (bones: PoseBones, key: string) => bones[key as keyof PoseBones] as THREE.Bone | undefined;
const SCAR_COLOUR = 0x7a2f2f;
const scarGeometry = new THREE.BoxGeometry(0.018, 0.1, 0.012);
const scarMaterial = new THREE.MeshStandardMaterial({ color: SCAR_COLOUR, roughness: 0.6 });

export interface Present {
  /** About four times a second, with the world as it is. */
  tick(w: World, walking: { on: boolean; body: number }): void;
  /** About fifteen times a second: blinks, brows, lids, fires. */
  faces(w: World, now: number): void;
  /** The Walker's look changed (the You tab). */
  walkerLook(w: World, body: number): void;
  /** Take away everything this made (a new world, a moment gone back to). */
  reset(): void;
  /** Strike whoever is beside the Walker, or tend them; returns what to tell the Creator. */
  strike(w: World, you: THREE.Object3D, harm: number): string | undefined;
  tend(w: World, you: THREE.Object3D): string | undefined;
  /** For tests: what is placed, and what each face is doing. */
  state(): { marks: string[]; travellers: string[]; crafted: string[]; rowing: string[]; faces: Record<string, { closure: number; raise: number }>; festival: boolean };
  /** For screenshots: hold a face (eyes shut, brows raised) whatever the mind feels. */
  holdFace(name: string, face?: { closure?: number; raise?: number }): void;
}

export function createPresent(C: Ctx, api: PresentApi): Present {
  const sizeNow = new Map<string, { y: number; xz: number }>();
  const scarsDrawn = new Map<string, string>();
  const faceRigs = new WeakMap<THREE.Object3D, { eyes: THREE.Object3D[]; brows: THREE.Object3D[]; browY: number[] }>();
  const faceState: Record<string, { closure: number; raise: number }> = {};
  const held = new Map<string, { closure?: number; raise?: number }>();
  const placed = new Map<string, { prefab: string; x: number; z: number }>(); // what this has put in the scene: id -> where
  const marksShown = new Map<string, string>();
  const partyAt = new Map<string, string>(); // traveller id -> the target last sent
  const partySeen = new Set<string>();
  const rowing = new Map<string, { vessel: string; floor: number }>(); // person id -> the thing they are rowing
  const floating = new Map<string, number>();
  const hudShown = new Map<string, string>();
  const lastFeast = { on: false, noticed: -1 };
  let walkerKey = "";
  let lastPace = -1;
  let lastStrike = 0;

  const hud = (widget: string, text: string) => {
    if (hudShown.get(widget) === text) return;
    hudShown.set(widget, text);
    api.ui("eden_hud", `${widget}|${text}`);
  };
  const hudValue = (widget: string, v: number) => {
    const key = `${widget}#v`;
    const text = v.toFixed(2);
    if (hudShown.get(key) === text) return;
    hudShown.set(key, text);
    api.ui("eden_hud_value", `${widget}|${text}`);
  };

  function put(id: string, prefab: string, x: number, z: number, y?: number) {
    const at = placed.get(id);
    const level = y ?? api.groundY(x, z) + (PREFAB_LIFT[prefab] ?? 0);
    if (at && at.prefab === prefab) return;
    if (at) api.ui("eden_remove", id);
    placed.set(id, { prefab, x, z });
    api.ui("eden_place", `${id},${prefab},${x},${level},${z},${id}`);
    for (const wait of [1500, 5000]) setTimeout(() => api.ui("eden_tell", id), wait);
  }
  function drop(id: string) {
    if (!placed.delete(id)) return;
    api.ui("eden_remove", id);
  }

  // ---- bodies: size, scars ----

  const sceneOf = (o: THREE.Object3D) => o.children.find((c) => c.name === "Scene") ?? o.children[0];
  function size(id: string, o: THREE.Object3D, y: number, xz: number, snap: boolean) {
    const g = sceneOf(o);
    if (!g) return;
    const cur = sizeNow.get(id) ?? { y, xz };
    // Easing, not a jump: a child's body gets a little bigger each look, and a body shown for the first time is the right size at once.
    const k = snap || !sizeNow.has(id) ? 1 : 0.3;
    cur.y += (y - cur.y) * k;
    cur.xz += (xz - cur.xz) * k;
    sizeNow.set(id, cur);
    g.scale.set(cur.xz, cur.y, cur.xz);
  }
  function scars(id: string, o: THREE.Object3D, list: Scar[]) {
    const key = scarKey(list);
    if (scarsDrawn.get(id) === key) return;
    scarsDrawn.set(id, key);
    const bones = findPoseBones(o);
    // Take away the ones drawn before, then draw them all.
    o.traverse((n) => {
      for (const c of [...n.children]) if (c.userData.edenScar) n.remove(c);
    });
    for (const s of list) {
      const place = SCAR_PLACE[s.where];
      const bone = place && BONE_OF_SCAR(bones, place.bone);
      if (!place || !bone) continue;
      const mark = new THREE.Mesh(scarGeometry, scarMaterial);
      mark.userData.edenScar = true;
      mark.position.set(...place.at);
      mark.scale.setScalar(0.7 + 0.8 * s.severity);
      mark.rotation.z = 0.5;
      bone.add(mark);
    }
  }

  // ---- faces ----

  function rigOf(o: THREE.Object3D) {
    let rig = faceRigs.get(o);
    if (!rig) {
      rig = { eyes: [], brows: [], browY: [] };
      o.traverse((n) => {
        if (/^eyes?$/i.test(n.name)) rig!.eyes.push(n);
        else if (/^eyebrows?/i.test(n.name)) (rig!.brows.push(n), rig!.browY.push(n.position.y));
      });
      faceRigs.set(o, rig);
    }
    return rig;
  }
  function face(w: World, p: Person, o: THREE.Object3D, now: number) {
    const rig = rigOf(o);
    if (!rig.eyes.length) return;
    const asleep = p.intent?.kind === "sleep" && p.intent.arrived;
    const sleepy = Math.max(0, Math.min(1, (p.needs.energy - 0.55) / 0.4));
    const seed = [...p.id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % 977;
    const f = faceOf(p);
    const hold = held.get(p.name) ?? held.get(p.id);
    let closure = blinkClosure(now / 1000, seed, sleepy, !!asleep);
    let raise = f.raise;
    if (hold?.closure !== undefined) closure = hold.closure;
    if (hold?.raise !== undefined) raise = hold.raise;
    faceState[p.name] = { closure, raise };
    // A shut eye is the eye taken away, and the skin of the lid shows (the model has no lids of its own); half shut is half the time.
    for (const e of rig.eyes) e.visible = closure < 0.5;
    rig.brows.forEach((b, i) => {
      // The brow moves up or down the face a little (the model's brows are one piece).
      b.position.y = rig.browY[i]! + 0.012 * raise - 0.004 * f.droop;
    });
  }

  // ---- the Walker ----

  function walkerLook(w: World, body: number) {
    const o = C.objects[body];
    if (!o) return;
    const wb = walkerBodyOf(w);
    const st = walkerStature(w);
    size("you", o, st.y, st.xz, true);
    const key = `${wb.look.tunic}|${wb.look.hair}`;
    if (key !== walkerKey) {
      walkerKey = key;
      api.ui("eden_player_look", key);
    }
    scars("you", o, wb.scars);
    C.edenBodies ??= new Map();
    const look: Look = { pregnant: 0, dirt: wb.needs.dirt, pallor: Math.max(0, 0.9 - wb.health) * 0.9, wet: w.weather?.raining ? 1 : 0, fist: 0, wear: Math.min(1, wb.scars.length * 0.1 + wb.needs.dirt * 0.3), skin: wb.look.skin };
    C.edenBodies.set(body, { look });
  }

  // ---- the road, the horizon ----

  const PARTY_PREFAB = (t: Traveller) => (t.kind === "raid" ? "Raider (man)" : t.sex === "f" ? "Trader (woman)" : "Trader (man)");

  function horizon(w: World) {
    const marks = horizonMarks(w);
    const want = new Set<string>();
    for (const m of marks) {
      const ruin = m.ruined;
      const ring = 8;
      const huts = ruin ? 2 : m.huts;
      for (let i = 0; i < huts; i++) {
        const a = m.bearing + Math.PI / 2 + (i - (huts - 1) / 2) * 0.85;
        const id = `${m.id}-hut-${i}`;
        want.add(id);
        put(id, ruin ? "Settlement Ruin" : "Settlement Hut", m.x + Math.cos(a) * ring, m.z + Math.sin(a) * ring);
      }
      const hostile = w.world2?.settlements.find((s) => s.id === m.id)?.attitude ?? 0;
      if (!ruin) {
        want.add(`${m.id}-fire`);
        put(`${m.id}-fire`, "Campfire", m.x, m.z);
        want.add(`${m.id}-banner`);
        put(`${m.id}-banner`, hostile < -0.3 ? "Settlement Banner Red" : "Settlement Banner", m.x + Math.cos(m.bearing + Math.PI) * 3, m.z + Math.sin(m.bearing + Math.PI) * 3);
      }
      if (marksShown.get(m.id) !== m.note) {
        marksShown.set(m.id, m.note);
        api.ui("eden_marker", `${m.id}|${m.x}|${api.groundY(m.x, m.z) + 7}|${m.z}|${m.note}`);
      }
    }
    for (const id of [...placed.keys()]) if (/^settlement-\d+-/.test(id) && !want.has(id)) drop(id);
  }

  function road(w: World) {
    const list = travellers(w);
    const live = new Set(list.map((t) => t.id));
    for (const t of list) {
      const prefab = PARTY_PREFAB(t);
      if (!placed.has(t.id)) {
        put(t.id, prefab, t.x, t.z, api.groundY(t.x, t.z) + 1.1);
        const key = `${t.kind}|${t.from}`;
        if (!partySeen.has(key + Math.floor((w.clock ?? 0) / 600))) {
          partySeen.add(key + Math.floor((w.clock ?? 0) / 600));
          const what = t.kind === "raid" ? ["Raiders on the road", `Armed people from ${t.from} are coming to the camp`] : t.kind === "trade" ? ["A trading party arrives", `Traders from ${t.from} come to the camp`] : ["Travellers arrive", `Strangers from ${t.from} come to the camp`];
          hud("Notice", what.join("\n"));
          api.log(`${what[0]}: ${what[1]}.`);
        }
      }
      // They walk on their own; the road puts them back where the party's clock says they are if they fall far behind.
      const idx = api.indexOf(t.id);
      const o = idx >= 0 ? C.objects[idx] : undefined;
      const target = `${t.toX},0,${t.toZ},walk,${t.kind === "raid" ? 2.4 : 1.6},-,-,0,1`;
      if (partyAt.get(t.id) !== target) {
        partyAt.set(t.id, target);
        api.ui(`eden_target_${t.id}`, target);
      }
      if (o && (api.fast() || Math.hypot(o.position.x - t.x, o.position.z - t.z) > 9)) api.ui(`eden_snap_${t.id}`, `${t.x},${api.groundY(t.x, t.z)},${t.z}`);
    }
    for (const id of [...placed.keys()]) if (id.startsWith("party-") && !live.has(id)) (drop(id), partyAt.delete(id));
  }

  // ---- what the people make: bridges, boats ----

  function crafted(w: World) {
    for (const t of w.things) {
      if (!t.prefab && CRAFT_PREFAB[t.kind]) t.prefab = CRAFT_PREFAB[t.kind];
      if (t.kind === "bridge" && t.span) bridge(t);
    }
  }
  /** A bridge: planks laid from one shore to the other, lengthening as they are laid. */
  function bridge(t: Thing) {
    const s = t.span!;
    const idx = api.indexOf(t.id);
    const o = idx >= 0 ? C.objects[idx] : undefined;
    if (!o) return;
    const full = Math.hypot(s.x2 - t.x, s.z2 - t.z);
    const len = Math.max(0.8, (full * Math.min(s.laid, s.need)) / Math.max(1, s.need));
    const yaw = Math.atan2(s.x2 - t.x, s.z2 - t.z);
    const dx = (s.x2 - t.x) / full, dz = (s.z2 - t.z) / full;
    const deck = Math.max(api.groundY(t.x, t.z), api.groundY(s.x2, s.z2), api.waterLevel + 0.35) + 0.125;
    o.scale.set(2, 0.25, len);
    o.rotation.y = yaw;
    api.ui("eden_move", `${t.id},${t.x + dx * len * 0.5},${deck},${t.z + dz * len * 0.5}`);
    bridgeDeck.set(t.id, { deck: deck + 0.125, x0: t.x, z0: t.z, x1: s.x2, z1: s.z2, ready: s.laid >= s.need });
  }
  const bridgeDeck = new Map<string, { deck: number; x0: number; z0: number; x1: number; z1: number; ready: boolean }>();

  /** People on the water: rowing a boat or a raft (the vessel goes with them), swimming after it went over, walking a bridge. */
  function afloat(w: World) {
    const now = new Set<string>();
    for (const p of w.people) {
      const tech = p.tech;
      if (!tech?.afloat || !tech.route) continue;
      now.add(p.id);
      const [, outcome, what, , sx, sz] = tech.route.id.split(":");
      let floor = api.waterLevel + 0.25;
      if (outcome === "cap") floor = api.waterLevel - 0.35;
      else if (what === "bridge") {
        const b = [...bridgeDeck.values()].find((d) => Math.hypot(d.x0 - Number(sx), d.z0 - Number(sz)) < 3) ?? [...bridgeDeck.values()][0];
        floor = b ? b.deck : api.waterLevel + 0.7;
      }
      const y = floor + 0.9;
      if (floating.get(p.id) !== y) {
        floating.set(p.id, y);
        api.ui(`eden_float_${p.id}`, String(y));
      }
      C.edenPoseHeld ??= new Set();
      const idx = bodyIndexOf(p);
      if (idx >= 0) C.edenPoseHeld.add(idx);
      if ((what === "boat" || what === "raft") && outcome !== "cap") {
        const vessel = w.things.find((t) => t.kind === what && Math.hypot(t.x - Number(sx), t.z - Number(sz)) < 1.5) ?? w.things.find((t) => t.kind === what);
        if (vessel) {
          rowing.set(p.id, { vessel: vessel.id, floor });
          const o = api.indexOf(vessel.id) >= 0 ? C.objects[api.indexOf(vessel.id)] : undefined;
          const body = api.bodyOf(p);
          if (body && o) {
            const dx = tech.route.x - body.position.x, dz = tech.route.z - body.position.z;
            if (Math.hypot(dx, dz) > 0.5) o.rotation.y = Math.atan2(dx, dz);
            api.ui("eden_move", `${vessel.id},${body.position.x},${api.waterLevel + (PREFAB_LIFT.Boat ?? 0.47) - 0.2},${body.position.z}`);
          }
        }
      }
    }
    // Landed: the body is let go to walk on the ground, and the vessel goes back to its mooring.
    for (const id of [...floating.keys()]) {
      if (now.has(id)) continue;
      floating.delete(id);
      api.ui(`eden_float_${id}`, "off");
      const idx = w.people.find((q) => q.id === id);
      const bi = idx ? bodyIndexOf(idx) : -1;
      if (bi >= 0) C.edenPoseHeld?.delete(bi);
      const r = rowing.get(id);
      rowing.delete(id);
      const vessel = r && w.things.find((t) => t.id === r.vessel);
      if (vessel) api.ui("eden_move", `${vessel.id},${vessel.x},${api.waterLevel + (PREFAB_LIFT[vessel.prefab ?? "Boat"] ?? 0.47)},${vessel.z}`);
    }
  }
  const bodyIndexOf = (p: Person): number => {
    const i = api.indexOf(p.id);
    if (i >= 0) return i;
    const o = api.bodyOf(p);
    return o ? C.objects.indexOf(o) : -1;
  };

  // ---- a feast ----

  function feast(w: World) {
    const hudNow = feastHud(w);
    hud("Calendar", `${hudNow.title}\n${hudNow.detail}`);
    hudValue("Calendar", hudNow.progress);
    const on = feastTonight(w);
    if (on && !lastFeast.on) {
      const spot = festivalSpot(w);
      put("feast-fire", "Festival Fire", spot.x, spot.z);
      [[4, 0], [-4, 0], [0, 4], [0, -4]].forEach(([dx, dz], i) => put(`feast-banner-${i}`, "Settlement Banner", spot.x + dx!, spot.z + dz!));
      put("feast-drum", "Drum", spot.x + 2.4, spot.z + 1.4);
      put("feast-flute", "Flute", spot.x - 2.2, spot.z + 1.2);
      if (lastFeast.noticed !== Math.floor((w.clock ?? 0) / 1440)) {
        lastFeast.noticed = Math.floor((w.clock ?? 0) / 1440);
        hud("Notice", `${hudNow.title}\nThe people gather at the fire`);
        api.log(`${hudNow.title}. The people gather at the fire.`);
      }
    } else if (!on && lastFeast.on) for (const id of [...placed.keys()]) if (id.startsWith("feast-")) drop(id);
    lastFeast.on = on;
  }

  // ---- the heads-up display for the Walker ----

  function walkerHudNow(w: World, on: boolean) {
    const names = ["Hunger bar", "Thirst bar", "Tiredness bar", "Dirt bar", "Health bar"];
    if (!on) {
      for (const n of names) hud(n, "");
      hud("Walker keys", "");
      return;
    }
    const h = walkerHud(w);
    h.bars.forEach((b, i) => {
      hud(names[i]!, barText(b));
      hudValue(names[i]!, b.value);
    });
    hud("Walker keys", "W|Walk\nShift|Run\nJ|Strike\nT|Tend\nE|Talk\nQ|Gather\nH|Give\nI|Pack\nM|Map\nL|Journal");
  }

  // ---- the whole ----

  function tick(w: World, walking: { on: boolean; body: number }) {
    crafted(w);
    for (const p of w.people) {
      const o = api.bodyOf(p);
      if (!o) continue;
      const st = stature(p);
      size(p.id, o, st.y, st.xz, false);
      scars(p.id, o, scarsOf(p));
    }
    if (walking.on && walking.body >= 0) {
      walkerLook(w, walking.body);
      // The Walker's pace is what their body allows: starved, parched, tired, hurt or old, they go slower (the controller's own speeds).
      const pace = walkerSpeed(w);
      if (Math.abs(pace - lastPace) > 0.02) {
        lastPace = pace;
        setPace(pace, walking.body);
      }
    }
    walkerHudNow(w, walking.on);
    horizon(w);
    road(w);
    afloat(w);
    feast(w);
  }

  // The hunter's walk and sprint are the controller's; the pace scales them (the prefab's own numbers, read from the entity).
  const BASE = { walk: 3.6, sprint: 7 };
  function setPace(pace: number, body: number) {
    const e = C.doc.scene.eachAlive()[body];
    const cc = e ? C.doc.scene.resolve(e, "CharacterController") : undefined;
    if (!cc) {
      api.log("The Walker's pace could not be applied: their body has no controller.");
      return;
    }
    cc.walkSpeed = BASE.walk * pace;
    cc.sprintSpeed = BASE.sprint * pace;
    C.runtime._editor_set_controller(body, cc.mode === "FirstPerson" ? 0 : 1, cc.walkSpeed, cc.sprintSpeed, cc.crouchSpeed, cc.jumpHeight, cc.standHeight, cc.crouchHeight, cc.stepHeight, cc.acceleration, cc.airControl);
  }

  function faces(w: World, now: number) {
    const eye = C.viewCamera.position;
    for (const p of w.people) {
      const o = api.bodyOf(p);
      if (!o || o.position.distanceToSquared(eye) > 45 * 45) continue;
      face(w, p, o, now);
    }
    // Fires flicker: a light on a made fire rises and falls a little, each on its own beat.
    for (const [id, at] of placed) {
      if (at.prefab !== "Festival Fire" && !id.endsWith("-fire")) continue;
      const i = api.indexOf(id);
      const o = i >= 0 ? C.objects[i] : undefined;
      if (!o || o.position.distanceToSquared(eye) > 80 * 80) continue;
      o.traverse((n) => {
        const l = n as THREE.PointLight;
        if (!l.isLight) return;
        l.userData.base ??= l.intensity;
        l.intensity = l.userData.base * (0.82 + 0.18 * Math.sin(now / 90 + id.length) + 0.1 * Math.sin(now / 37));
      });
    }
  }

  function nearest(w: World, you: THREE.Object3D, reach: number): Person | undefined {
    let best: Person | undefined;
    let d = reach;
    for (const q of w.people) {
      const dist = Math.hypot(q.x - you.position.x, q.z - you.position.z);
      if (dist < d) ((d = dist), (best = q));
    }
    return best;
  }
  function strike(w: World, you: THREE.Object3D, harm: number) {
    if (performance.now() - lastStrike < 700) return undefined;
    const q = nearest(w, you, 2.8);
    if (!q) return undefined;
    lastStrike = performance.now();
    walkerDeed(w, q, "struck", harm);
    api.ui(`eden_gesture_${q.id}`, "HitRecieve");
    return `You struck ${q.name}. They are hurt and afraid of you now, and those who saw it trust you less.`;
  }
  function tend(w: World, you: THREE.Object3D) {
    const q = nearest(w, you, 3.5);
    if (!q) return "No one is near enough to tend.";
    if (!(q.wound ?? 0) && !q.illness && q.health > 0.9) return `${q.name} is not hurt.`;
    const r = runCreatorCommand(w, `heal ${q.name}`);
    if (!r.ok) return `You could not tend ${q.name}: ${r.message}`;
    walkerDeed(w, q, "healed");
    return `You tended ${q.name}. They trust you more.`;
  }

  return {
    tick,
    faces,
    walkerLook,
    reset() {
      for (const id of [...placed.keys()]) drop(id);
      for (const id of [...floating.keys()]) api.ui(`eden_float_${id}`, "off");
      floating.clear();
      rowing.clear();
      partyAt.clear();
      marksShown.clear();
      for (const id of [...marksShown.keys()]) api.ui("eden_marker_clear", id);
      lastFeast.on = false;
      hudShown.clear();
    },
    strike,
    tend,
    state: () => ({
      marks: [...placed.keys()].filter((k) => /^settlement-/.test(k)),
      travellers: [...placed.keys()].filter((k) => k.startsWith("party-")),
      crafted: [...placed.keys()],
      rowing: [...rowing.keys()],
      faces: { ...faceState },
      festival: lastFeast.on,
    }),
    holdFace(name, face) {
      if (face) held.set(name, face);
      else held.delete(name);
    },
  };
}
