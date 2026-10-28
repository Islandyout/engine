// What every body shows, decided from what the mind is doing and feeling, with no randomness of its own: the same mind state gives the same
// motion. Pure (no scene, no browser), so a harness can run thousands of situations through exactly what the page would show and look for
// gaps: something purposeful with no motion, a feeling nobody can see, a jump from one pose to another that no person would make.
import { actionOf, aff, type MobState, type Person, type Thing, type World } from "./mind";

export type PoseName =
  | "sit" | "eat" | "drink" | "forage" | "work" | "sleep" | "mourn" | "warm" | "fish" | "talk" | "wave"
  | "slump" | "tense" | "alert" | "hug" | "laugh" | "yawn" | "belly" | "proud" | "stretch" | "scan";

// ---- people ----

// What each thing a person does looks like with the whole body, over the clip for it (poses.ts).
export const POSE_OF: Partial<Record<string, PoseName>> = {
  fish: "fish", craft: "work", sew: "work", fire: "work", rest: "sit", sleep: "sleep", mourn: "mourn", warm: "warm", talk: "talk", share: "talk",
  comfort: "mourn", look: "scan", play: "laugh", linger: "scan", wander: "scan",
};

// Per person, what the caller remembers between looks (so a pose can end with a stretch, and a yawn can come round on its own beat).
export interface MotionMemory {
  pose?: PoseName;
  since: number;
  stretchUntil: number;
  changes: number; // how many times the pose has changed, a flicker count for the harness
}
export const newMemory = (): MotionMemory => ({ since: 0, stretchUntil: 0, changes: 0 });

const feel = (p: Person, k: "joy" | "fear" | "anger" | "gratitude" | "pride" | "shame") => p.emotions?.[k] ?? 0;
const beat = (clock: number, period: number, on: number, seed: number) => ((clock + seed * 7.3) % period) < on;

export interface PersonMotion {
  action: string; // the clip request (resolved against the model's clips in edenAgents.EDEN_ACTION_CLIPS)
  pose?: PoseName;
  why: string; // for the harness: what in the mind this follows
}

/** The pose a feeling or a need puts on a body that is not otherwise busy: sad shoulders, a tight jaw, arms hugged against the cold. */
export function expressionOf(p: Person, world: World, was?: PoseName): { pose: PoseName; why: string } | undefined {
  const clock = world.clock ?? 0;
  const seed = p.id.length + p.name.charCodeAt(0);
  if ((p.laughUntil ?? 0) > clock) return { pose: "laugh", why: "laughing" };
  if (feel(p, "fear") > 0.4) return { pose: "alert", why: "afraid" };
  if (feel(p, "anger") > 0.4) return { pose: "tense", why: "angry" };
  if ((p.grief ?? 0) > 0.2 || feel(p, "shame") > 0.4 || p.mood < -0.35) return { pose: "slump", why: "grieving, ashamed or low" };
  if (p.illness) return { pose: "slump", why: "ill" };
  if (p.cold > (was === "hug" ? 0.4 : 0.5)) return { pose: "hug", why: "cold" };
  if (p.needs.energy > 0.75 && beat(clock, 40, 3, seed)) return { pose: "yawn", why: "tired" };
  if (p.needs.hunger > 0.65 && beat(clock, 50, 4, seed)) return { pose: "belly", why: "hungry" };
  // Once shown, a good mood keeps showing until it has clearly gone (so it does not flicker around the line).
  const k = was === "proud" ? 0.8 : 1;
  if (feel(p, "pride") > 0.4 * k || feel(p, "joy") > 0.55 * k || p.mood > 0.6 * k) return { pose: "proud", why: "proud or happy" };
  return undefined;
}

/** What a person's body does now. `held` is a pose someone has asked for for a moment (a wave to a stranger, talking to the Walker). */
export function personMotion(p: Person, world: World, mem: MotionMemory, held?: PoseName): PersonMotion {
  const clock = world.clock ?? 0;
  const intent = p.intent;
  const action = actionOf(p);
  let pose: PoseName | undefined;
  let why = "no pose";
  if (intent?.arrived) {
    pose = POSE_OF[intent.kind];
    // Play is laughing, unless they are in no mood for it.
    if (pose === "laugh" && ((p.grief ?? 0) > 0.2 || feel(p, "anger") > 0.4 || feel(p, "fear") > 0.4 || p.mood < -0.2)) pose = undefined;
    if (pose) why = `${intent.kind}`;
  }
  if (held) (pose = held), (why = "asked for");
  const walking = !!intent && !intent.arrived;
  const asleep = pose === "sleep";
  if (!walking) {
    // Someone has come to talk to them: they turn their attention and answer, even while doing something else.
    if (!asleep && p.intent?.kind !== "talk" && world.people.some((q) => q !== p && q.intent?.kind === "talk" && q.intent.arrived && q.intent.targetId === p.id)) (pose = "talk"), (why = "being talked to");
    // Getting up from sleep: a stretch before anything else.
    if (mem.pose === "sleep" && !asleep) mem.stretchUntil = clock + 4;
    if (clock < mem.stretchUntil && !asleep) (pose = "stretch"), (why = "just woke");
    else if (!asleep && (p.laughUntil ?? 0) > clock && (p.grief ?? 0) <= 0.2 && feel(p, "anger") <= 0.4 && feel(p, "fear") <= 0.4) (pose = "laugh"), (why = "laughing");
    else if (!pose || pose === "scan") {
      const show = expressionOf(p, world, mem.pose);
      if (show) (pose = show.pose), (why = show.why);
    } else if (pose === "talk" || pose === "work") {
      // Speaking, or working, in the grip of fear or anger or grief: the body shows that, not an easy chat.
      const show = expressionOf(p, world, mem.pose);
      if (show && ["alert", "tense", "slump"].includes(show.pose)) (pose = show.pose), (why = `${why}, but ${show.why}`);
    }
  }
  if (pose !== mem.pose) {
    mem.pose = pose;
    mem.since = clock;
    mem.changes += 1;
  }
  return { action, pose, why };
}

// ---- creatures ----

interface Species {
  walk: number; // the ground speed one cycle of its walk covers (m/s), so the clip can be sped or slowed to the feet's pace
  run: number;
  graze: string;
  vigil: string; // head up and watching
  variety?: string; // a second idle, played now and then
  low: string; // head down: resting, sniffing, drinking
  eat: string;
  attack?: string;
  clips: readonly string[];
}

const UNGULATE = ["Death", "Idle_Headlow", "graze", "idle", "run", "walk"] as const;
const SPECIES: Record<string, Species> = {
  deer: { walk: 1.1, run: 3.2, graze: "graze", vigil: "idle", low: "Idle_Headlow", eat: "graze", clips: UNGULATE },
  horse: { walk: 1.3, run: 3.8, graze: "graze", vigil: "idle", low: "Idle_Headlow", eat: "graze", clips: UNGULATE },
  cow: { walk: 0.9, run: 2.6, graze: "graze", vigil: "idle", low: "Idle_Headlow", eat: "graze", clips: UNGULATE },
  donkey: { walk: 1.1, run: 3.0, graze: "graze", vigil: "idle", low: "Idle_Headlow", eat: "graze", clips: UNGULATE },
  fox: { walk: 1.0, run: 3.0, graze: "graze", vigil: "idle", low: "graze", eat: "graze", clips: ["Death", "graze", "idle", "run", "walk"] },
  dog: { walk: 1.1, run: 3.0, graze: "graze", vigil: "idle", low: "graze", eat: "graze", clips: ["Death", "graze", "idle", "run", "walk"] },
  wolf: { walk: 1.3, run: 3.4, graze: "Idle_2_HeadLow", vigil: "Idle_2", variety: "Idle_2", low: "Idle_2_HeadLow", eat: "Eating", attack: "Attack", clips: ["Attack", "Death", "Eating", "Gallop_Jump", "Idle_2", "Idle_2_HeadLow", "Idle_HitReact1", "Idle_HitReact2", "Jump_ToIdle", "idle", "run", "walk"] },
  stag: { walk: 1.3, run: 3.4, graze: "Eating", vigil: "Idle_2", variety: "Idle_2", low: "Idle_Headlow", eat: "Eating", attack: "Attack_Headbutt", clips: ["Attack_Headbutt", "Attack_Kick", "Death", "Eating", "Gallop_Jump", "Idle_2", "Idle_Headlow", "Idle_HitReact1", "Idle_HitReact2", "Jump_toIdle", "idle", "run", "walk"] },
  alpaca: { walk: 1.0, run: 2.8, graze: "Eating", vigil: "Idle_2", variety: "Idle_2", low: "Idle_Headlow", eat: "Eating", attack: "Attack_Headbutt", clips: ["Attack_Headbutt", "Attack_Kick", "Death", "Eating", "Gallop_Jump", "Idle_2", "Idle_Headlow", "Idle_HitReact1", "Idle_HitReact2", "Jump_toIdle", "idle", "run", "walk"] },
};
export const speciesOf = (kind: string) => SPECIES[kind];

export interface CreatureMotion {
  clip: string;
  scale: number; // how fast to play it, so the feet keep pace with the ground
  why: string;
}

/** The clip and pace for a creature, from its state and speed. `clock` varies the idles on their own slow beat per animal. */
export function creatureMotion(t: Thing, clock: number): CreatureMotion | undefined {
  const sp = SPECIES[t.kind];
  if (!sp) return undefined;
  const m = t.mob;
  const state: MobState = m?.state ?? "stand";
  const v = m?.speed ?? 0;
  const seed = [...t.id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % 97;
  const moving = v > 0.15;
  const gait = (why: string): CreatureMotion => {
    const running = v > sp.walk * 1.5 || state === "flee" || state === "hunt";
    const ref = running ? sp.run : sp.walk;
    return { clip: running ? "run" : "walk", scale: Math.max(0.5, Math.min(1.5, v / ref)), why: `${why} (${running ? "run" : "walk"})` };
  };
  switch (state) {
    case "flee":
    case "hunt":
    case "follow":
    case "walk":
      return moving ? gait(state) : { clip: sp.vigil, scale: 1, why: `${state}, held still` };
    case "graze":
      return { clip: sp.graze, scale: 1, why: "grazing" };
    case "drink":
      return { clip: sp.low, scale: 1, why: "drinking" };
    case "attack":
      return { clip: sp.attack ?? "run", scale: 1, why: "pouncing" };
    case "eat":
      return { clip: sp.eat, scale: 1, why: "eating a kill" };
    case "rest":
      return { clip: sp.low, scale: 0.6, why: "resting" };
    case "vigil":
      return { clip: sp.vigil, scale: 1, why: "watching" };
    default:
      // Standing: now and then the other idle, on the animal's own beat.
      if (sp.variety && beat(clock, 30, 5, seed)) return { clip: sp.variety, scale: 1, why: "idle variety" };
      return { clip: "idle", scale: 1, why: "standing" };
  }
}

export function creatureKinds(): string[] {
  return Object.keys(SPECIES).filter((k) => aff({ id: "", kind: k, x: 0, z: 0, radius: 1 }).creature);
}
