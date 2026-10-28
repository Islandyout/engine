// One thread of the animation-flow check: runs situations and returns counts. See animflow.ts.
import { parentPort, workerData } from "node:worker_threads";
import { DAY, YEAR, EDEN_CLIMATE } from "../../apps/editor/src/eden/earth";
import { aff, giveToPerson, makePerson, startErrand, step, type Person, type Thing, type World } from "../../apps/editor/src/eden/mind";
import { creatureMotion, newMemory, personMotion, speciesOf, type MotionMemory } from "../../apps/editor/src/eden/motion";
import { rng } from "../../apps/editor/src/eden/lifelike";

export type Counts = Record<string, number>;
const add = (c: Counts, key: string, n = 1) => void (c[key] = (c[key] ?? 0) + n);

function situation(seed: number): { world: World; hours: number } {
  const r = rng(seed);
  const spread = 20 + 40 * r();
  const at = (a: number, k = 1) => [Math.cos(a) * spread * (0.2 + 0.8 * r()) * k, Math.sin(a) * spread * (0.2 + 0.8 * r()) * k] as const;
  const things: Thing[] = [];
  const put = (id: string, kind: string, extra: Partial<Thing> = {}, k = 1) => {
    const [x, z] = at(r() * 6.28, k);
    things.push({ id, kind, x, z, radius: 3, ...extra });
  };
  put("river", "river");
  put("grove", "grove", { stock: 6, maxStock: 6 });
  put("bush", "bush", { stock: 4, maxStock: 4 });
  put("hollow", "hollow");
  put("overlook", "overlook");
  if (r() < 0.6) put("meadow", "meadow");
  if (r() < 0.5) put("lake", "lake");
  if (r() < 0.5) put("life", "tree of life", { stock: 3, maxStock: 3 });
  if (r() < 0.5) put("camp", "campfire", { fuel: 3600 });
  if (r() < 0.4) put("shelter-0", "shelter", { stock: 6 });
  for (const [kind, p, n] of [["deer", 0.7, 3], ["fox", 0.4, 1], ["wolf", 0.3, 1], ["horse", 0.4, 2], ["cow", 0.3, 2], ["dog", 0.3, 1], ["stag", 0.3, 1], ["alpaca", 0.3, 2], ["donkey", 0.2, 1]] as const) {
    if (r() > p) continue;
    const [bx, bz] = at(r() * 6.28);
    for (let i = 0; i < n; i++) things.push({ id: `${kind}${i}`, kind, x: bx + i, z: bz, radius: 2, mob: { tx: bx, tz: bz, wait: 0, fed: DAY / 3, age: 3, fleeUntil: 0 } });
  }
  const n = 2 + Math.floor(r() * 5);
  const people: Person[] = [];
  const ages = [26, 30, 34, 2, 6, 58, 22, 40];
  for (let i = 0; i < n; i++) {
    const p = makePerson(`p${i}`, (r() - 0.5) * 8, (r() - 0.5) * 8, Math.floor(r() * 1e9), { boldness: r(), sociability: r(), curiosity: r(), appetite: r(), patience: r() }, { name: `P${i}`, sex: r() < 0.5 ? "m" : "f", age: i < 2 ? 22 + Math.floor(r() * 10) : ages[i % ages.length]! });
    // Start in all sorts of states: hungry, cold, tired, upset, hurt, grieving.
    if (r() < 0.25) p.needs.hunger = 0.5 + 0.5 * r();
    if (r() < 0.2) p.needs.energy = 0.6 + 0.4 * r();
    if (r() < 0.15) p.emotions = { ...(p.emotions ?? {}), anger: 0.5 + 0.5 * r() };
    if (r() < 0.1) p.emotions = { ...(p.emotions ?? {}), fear: 0.5 };
    if (r() < 0.08) p.grief = 0.3 + 0.5 * r();
    if (r() < 0.06) p.illness = { kind: "fever", since: 0, severity: 0.5 } as never;
    if (r() < 0.2) p.carry.food = 2;
    if (r() < 0.2) p.carry.wood = 2;
    people.push(p);
  }
  const climate = { meanC: 6 + 14 * r(), seasonalAmpC: 4 + 8 * r(), dailyAmpC: 3 + 4 * r(), rainy: 0.1 + 0.5 * r(), seed: Math.floor(r() * 1e6) };
  const clock = Math.floor(r() * 16) * DAY + r() * DAY;
  return { world: { things, people, radius: spread * 1.8, climate: climate ?? EDEN_CLIMATE, clock }, hours: 1 };
}

function run(seed: number, c: Counts) {
  const { world } = situation(seed);
  const DT = 2;
  const steps = Math.floor((DAY * 0.7) / DT);
  const rr = rng(seed + 5);
  // A third of the situations have the Walker standing about, who asks for errands and answers requests.
  const walker = rr() < 0.33 ? { x: (rr() - 0.5) * 20, z: (rr() - 0.5) * 20 } : undefined;
  if (walker) world.visitor = walker;
  const mem = new Map<string, MotionMemory>();
  const lastClip = new Map<string, { clip: string; at: number; before?: string; beforeAt: number }>();
  const lastPose = new Map<string, { pose: string | undefined; at: number }>();
  const holdSince = new Map<string, { pose: string | undefined; at: number; flagged?: boolean }>();
  for (let s = 0; s < steps; s++) {
    step(world, DT);
    if (walker) {
      if (s % 150 === 20) {
        const who = world.people[Math.floor(rr() * world.people.length)];
        if (!who) continue;
        who.walkerTrust = Math.max(who.walkerTrust ?? 0, rr() * 0.3);
        const kind = (["water", "food", "wood"] as const)[Math.floor(rr() * 3)]!;
        const res = startErrand(world, who, kind);
        add(c, res.ok ? "errand.started" : "errand.refused");
      }
      for (const ev of world.walkerEvents?.splice(0) ?? []) {
        add(c, `errand.event.${ev.kind}.${ev.item}`);
        const who = world.people.find((q) => q.id === ev.who);
        if (ev.kind === "asked" && who && rr() < 0.6 && giveToPerson(world, who, ev.item)) add(c, "errand.ask_answered");
      }
      for (const q of world.people) if (q.errand && (world.clock ?? 0) > q.errand.until + 60) add(c, "gap.errand_stuck");
    }
    if (s % 2) continue;
    const clock = world.clock ?? 0;
    const poses = new Map<string, string | undefined>();
    for (const p of world.people) {
      const m = mem.get(p.id) ?? newMemory();
      mem.set(p.id, m);
      const was = lastPose.get(p.id);
      const mo = personMotion(p, world, m);
      add(c, "person.samples");
      const kind = p.intent?.kind ?? "none";
      const arrived = !!p.intent?.arrived;
      add(c, `intent.${kind}.${arrived ? "at" : "going"}`);
      if (arrived) {
        add(c, `pose.${kind}.${mo.pose ?? "NONE"}`);
        if (!mo.pose && mo.action === "observe") add(c, "gap.arrived_idle." + kind);
      }
      // A feeling nobody could see, standing or sitting about.
      const stationary = !p.intent || p.intent.arrived;
      if (stationary) {
        const em = p.emotions ?? {};
        const strong = (em.fear ?? 0) > 0.4 ? "fear" : (em.anger ?? 0) > 0.4 ? "anger" : (p.grief ?? 0) > 0.2 || (em.shame ?? 0) > 0.4 || p.mood < -0.35 ? "low" : p.illness ? "ill" : p.cold > 0.5 ? "cold" : undefined;
        if (strong) {
          add(c, `feel.${strong}.samples`);
          if (!mo.pose || !["alert", "tense", "slump", "hug", "mourn", "sleep", "laugh", "stretch", "sit", "talk", "work", "warm", "fish", "yawn", "belly"].includes(mo.pose)) (add(c, `gap.unseen_feeling.${strong}`), add(c, `unseen.${strong}.${kind}.${mo.pose ?? "NONE"}`));
        }
      }
      // Pose changes: too fast, or a jump no one would make.
      if (was && was.pose !== mo.pose) {
        add(c, "pose.changes");
        add(c, `trans.${was.pose ?? "none"}>${mo.pose ?? "none"}`);
        const brief = new Set(["yawn", "belly", "laugh", "stretch", "wave", "scan", "proud", "slump", "hug", "alert", "tense", "talk"]);
        if (clock - was.at < 6 && was.pose && mo.pose && !brief.has(was.pose) && !brief.has(mo.pose)) (add(c, "gap.flicker.pose"), add(c, `flick.pose.${was.pose}>${mo.pose}`));
        if (was.pose === "sleep" && mo.pose && !["stretch", "sit", "slump", "alert", "yawn"].includes(mo.pose)) add(c, `gap.sleep_jump.${mo.pose}`);
      }
      if (!was || was.pose !== mo.pose) lastPose.set(p.id, { pose: mo.pose, at: clock });
      poses.set(p.id, mo.pose);
      // A body stuck in one pose for hours, which no one does (sleep aside).
      const held = holdSince.get(p.id);
      if (!held || held.pose !== mo.pose) holdSince.set(p.id, { pose: mo.pose, at: clock });
      else if (mo.pose && mo.pose !== "sleep" && clock - held.at > 5400 && !held.flagged) (held.flagged = true), add(c, `gap.frozen_pose.${mo.pose}.${kind}`);
      if (mo.pose === "laugh" && ((p.grief ?? 0) > 0.2 || (p.emotions?.anger ?? 0) > 0.4 || (p.emotions?.fear ?? 0) > 0.4)) add(c, "gap.laughing_while_grieving_angry_or_afraid");
      if ((p.carry.food >= 1 ? p.needs.hunger > 0.93 : p.needs.thirst > 0.93 && world.things.some((t) => aff(t).water)) && arrived && p.cold < 0.8 && !["eat", "drink", "fish", "hunt", "forage", "sleep"].includes(kind) && kind !== "none") add(c, `gap.starving_but_${kind}`);
      if ((p.laughUntil ?? 0) > clock && stationary && mo.pose !== "sleep") add(c, mo.pose === "laugh" ? "laugh.shown" : "gap.laugh_hidden");
    }
    // Two people talking: the one spoken to should show they are listening.
    for (const p of world.people) {
      if (p.intent?.kind !== "talk" || !p.intent.arrived) continue;
      const other = world.people.find((q) => q.id === p.intent!.targetId);
      if (!other) continue;
      const theirs = poses.get(other.id);
      if (!other.intent || !other.intent.arrived) continue; // still on their way
      if (other.intent.kind === "sleep") add(c, "gap.talked_to_a_sleeper");
      if (["talk", "laugh", "sleep", "stretch", "alert", "tense", "mourn", "slump"].includes(theirs ?? "")) add(c, "talk.pairs");
      else (add(c, "gap.talk_unreturned"), add(c, `unreturned.${other.intent?.kind ?? "none"}.${theirs ?? "NONE"}`));
    }
    for (const t of world.things) {
      if (!aff(t).creature || !aff(t).mobile) continue;
      const sp = speciesOf(t.kind);
      const mo = creatureMotion(t, clock);
      add(c, "creature.samples");
      if (!sp || !mo) {
        add(c, `gap.creature_no_species.${t.kind}`);
        continue;
      }
      add(c, `creature.${t.kind}.${t.mob?.state ?? "none"}.${mo.clip}`);
      if (!sp.clips.includes(mo.clip)) add(c, `gap.creature_missing_clip.${t.kind}.${mo.clip}`);
      const v = t.mob?.speed ?? 0;
      if (v > 0.2 && mo.clip !== "walk" && mo.clip !== "run") add(c, `gap.creature_moving_but_${mo.clip}`);
      if (v < 0.05 && (mo.clip === "walk" || mo.clip === "run")) add(c, "gap.creature_sliding_in_place");
      if (mo.scale <= 0.5 || mo.scale >= 1.5) (add(c, "gap.creature_pace_clamped"), add(c, `clamp.${t.kind}.${t.mob?.state}.${mo.clip}.${v.toFixed(1)}`));
      const lc = lastClip.get(t.id);
      if (lc && lc.clip !== mo.clip) {
        // A bounce: A, then B, then A again, within twelve seconds.
        if (lc.before === mo.clip && clock - lc.beforeAt < 8 && lc.clip !== "run" && lc.clip !== "walk" && lc.clip !== "Idle_2") (add(c, "gap.creature_flicker"), add(c, `flick.${t.kind}.${lc.before}>${lc.clip}>${mo.clip}.${t.mob?.state}`));
        add(c, "creature.clip_changes");
      }
      if (!lc || lc.clip !== mo.clip) lastClip.set(t.id, { clip: mo.clip, at: clock, before: lc?.clip, beforeAt: lc?.at ?? -1e9 });
    }
  }
  for (const [, m] of mem) add(c, "person.pose_changes_total", m.changes);
  add(c, "situations");
  void YEAR;
}

const { first, count, stride } = workerData as { first: number; count: number; stride: number };
const totals: Counts = {};
for (let i = 0; i < count; i++) {
  run(first + i * stride, totals);
  if (i % 100 === 99) parentPort!.postMessage({ progress: 100 });
}
parentPort!.postMessage({ totals });
