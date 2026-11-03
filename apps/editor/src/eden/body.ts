// The body: how a person grows, tires, is marked and fails; and the Creator's own Walker body.
//
//  GROWTH follows a curve, not a number: height rises quickly in infancy, slows in childhood, spurts at puberty (girls earlier) and stops;
//  hunger in childhood stunts it for good; the old shrink a little. Strength follows size, fitness and age together.
//  FITNESS is built by walking and work and lost by idling or illness. SLEEP DEBT builds the longer someone stays awake and is paid back
//  asleep; owing a lot slows them, sours the mood and in the end puts them to sleep where they stand.
//  The SENSES age (sight from the middle years, hearing too), and some are born with, or lose, a sense or a leg: a DISABILITY lasts for life.
//  A bad wound leaves a SCAR that stays. A filthy person gets lice. Pregnancy can be lost, can poison the mother late on, and birth can
//  bring bleeding, a blocked labour or childbed fever. A sickness of the bed can pass between partners and lower the chance of a child.
//  The WALKER (the Creator's body, `world.walker.body`) has a look that can be changed, needs of its own, grows older with the world, is
//  marked by what hurts it, and what it does to people is remembered by them.
// Every chance here is a hash of who, when and what, never the person's own random stream, so adding it shifts nothing else a seeded life does.
// Nothing at the top level reads a value from another eden module (they import one another in a ring).
import { DAY, YEAR } from "./earth";
import { humanYears } from "./psyche";
import { ADULT_AGE, chronicle, note, relation, tally, type Intent, type IntentKind, type Person, type World } from "./mind";
import { feel } from "./inner";

type Option = { intent: Omit<Intent, "arrived">; score: number; reason?: string };
export type Disability = "limp" | "poor sight" | "poor hearing" | "weak";
export interface Scar {
  t: number;
  what: string; // how it came
  where: string;
  severity: number; // 0..1
}
export interface Body {
  gene: { height: number; build: number }; // 0..1 each, fixed for life
  stunt: number; // 0..0.08 of adult height lost to hunger as a child
  fitness: number; // 0..1
  awake: number; // sim seconds since a good sleep
  scars: Scar[];
  disabilities: Disability[];
  woundPeak: number; // the worst the current wound has been
  illPeak: number;
  filthy: number; // sim seconds spent very dirty
  lice?: boolean;
  complications: string[]; // of the pregnancy now, or at the last birth
  immune: string[]; // diseases survived
  sickWith?: string; // a named disease they have now (world2.ts epidemics)
  bedSickness?: { since: number }; // a sickness that passes between partners
  checked?: number; // last sim day the body was weighed against the world
}
export const MAX_SCARS = 8;
const GESTATION = 0.75 * YEAR; // mirrors mind.ts (a plain number: see the note at the top)
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const dist = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);

// A chance from a hash of who, when and what; `grain` is how many sim seconds make one roll (the same roll holds inside it).
function chance(id: string, clock: number, salt: string, grain = 1): number {
  let h = 2166136261;
  const s = `${id}|${Math.floor(clock / grain)}|${salt}`;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  return ((h >>> 0) % 100000) / 100000;
}
const stable = (id: string, salt: string) => chance(id, 0, salt, 1e12);

export function bodyOf(p: Person): Body {
  if (p.body) return p.body;
  const b: Body = { gene: { height: stable(p.id, "height"), build: stable(p.id, "build") }, stunt: 0, fitness: 0.5, awake: 0, scars: [], disabilities: [], woundPeak: 0, illPeak: 0, filthy: 0, complications: [], immune: [] };
  // Some are born with a lesser sense or a lame leg.
  if (stable(p.id, "born-sight") < 0.02) b.disabilities.push("poor sight");
  if (stable(p.id, "born-hearing") < 0.015) b.disabilities.push("poor hearing");
  if (stable(p.id, "born-limp") < 0.012) b.disabilities.push("limp");
  p.body = b;
  return b;
}

// ---- Growth ----

// Share of adult height reached at a human age (boys and girls), from the standard shape of the curve: fast, slowing, a spurt, then done.
const GIRLS: [number, number][] = [[0, 0.3], [1, 0.45], [2, 0.53], [4, 0.62], [6, 0.7], [8, 0.77], [10, 0.84], [12, 0.94], [14, 0.985], [16, 1]];
const BOYS: [number, number][] = [[0, 0.29], [1, 0.44], [2, 0.52], [4, 0.61], [6, 0.69], [8, 0.75], [10, 0.8], [12, 0.85], [14, 0.93], [16, 0.98], [18, 1]];
function curve(points: [number, number][], h: number): number {
  if (h <= points[0]![0]) return points[0]![1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i]!;
    if (h <= x1) {
      const [x0, y0] = points[i - 1]!;
      return y0 + ((y1 - y0) * (h - x0)) / (x1 - x0);
    }
  }
  return 1;
}
/** Where they will stop growing, in centimetres. */
export function adultHeightCm(p: Person): number {
  const b = bodyOf(p);
  return (p.sex === "f" ? 160 : 173) * (1 - b.stunt) + (b.gene.height - 0.5) * 16;
}
/** How tall they are now, in centimetres. */
export function heightCm(p: Person): number {
  const h = humanYears(p.age);
  const frac = curve(p.sex === "f" ? GIRLS : BOYS, h);
  const shrink = h > 60 ? Math.min(0.06, 0.0015 * (h - 60)) : 0; // the old lose a little
  return adultHeightCm(p) * frac * (1 - shrink);
}
/** How strong they are, 0..1: grows with size, rises with fitness, peaks in the late twenties and fades. */
export function muscleOf(p: Person): number {
  const b = bodyOf(p);
  const h = humanYears(p.age);
  const size = heightCm(p) / adultHeightCm(p);
  const age = h < 30 ? 1 : Math.max(0.45, 1 - 0.011 * (h - 30));
  const build = 0.85 + 0.3 * b.gene.build + (p.sex === "m" ? 0.08 : 0);
  const weak = b.disabilities.includes("weak") ? 0.6 : 1;
  return clamp01(size * size * age * build * (0.55 + 0.45 * b.fitness) * weak * 0.9);
}
/** The senses: 1 is whole. Sight and hearing fade from the middle years; a disability takes more. */
export function sightFactor(p: Person): number {
  const h = humanYears(p.age);
  const b = p.body;
  return Math.max(0.5, 1 - 0.006 * Math.max(0, h - 45)) * (b?.disabilities.includes("poor sight") ? 0.55 : 1);
}
export function hearingOf(p: Person): number {
  const h = humanYears(p.age);
  const b = p.body;
  return Math.max(0.3, 1 - 0.012 * Math.max(0, h - 45)) * (b?.disabilities.includes("poor hearing") ? 0.4 : 1);
}
/** Debt of sleep, 0..1. */
export const sleepDebt = (p: Person) => clamp01(((p.body?.awake ?? 0) - 1.2 * DAY) / (2 * DAY));
/** What the body does to the pace of walking: size, fitness, a bad leg, tiredness, a heavy pregnancy. */
export function bodySpeed(p: Person): number {
  const b = p.body;
  if (!b) return 1;
  const size = p.age < 4 ? 0.82 + 0.18 * (heightCm(p) / adultHeightCm(p)) : 1;
  const fit = 1 + 0.1 * (b.fitness - 0.5);
  const limp = b.disabilities.includes("limp") ? 0.6 : 1;
  const tired = 1 - 0.25 * sleepDebt(p);
  const heavy = p.pregnant ? 0.93 : 1;
  return size * fit * limp * tired * heavy;
}
/** How much the body lets them see, for mind.ts's `sightOf`. */
export const sightMul = (p: Person) => (p.body ? sightFactor(p) : 1);

// ---- The body's day ----

const WORKS = new Set<IntentKind>(["hunt", "gather", "build", "forage", "plant", "fish", "craft", "improve", "furnish", "flee", "wander", "play", "fetch", "stash"]);
export function bodyStep(p: Person, world: World, dt: number) {
  const b = bodyOf(p);
  const now = world.clock ?? 0;
  const i = p.intent;
  // Fitness: built by walking and work, lost by idleness and illness.
  const active = !!i && ((!i.arrived && i.speed > 0.5) || (i.arrived && WORKS.has(i.kind)));
  if (active && !p.illness) b.fitness = clamp01(b.fitness + ((1 - b.fitness) * dt) / (8 * DAY));
  else b.fitness = clamp01(b.fitness - (b.fitness * dt) / ((p.illness ? 6 : 25) * DAY));
  // Growing up on too little leaves a smaller adult.
  if (p.age < ADULT_AGE && p.needs.hunger > 0.85) b.stunt = Math.min(0.08, b.stunt + dt / (400 * DAY));
  // Sleep: owed the longer they stay awake, paid back asleep (a little faster than it was owed).
  if (p.age >= 0.5) {
    const asleep = i?.kind === "sleep" && i.arrived;
    b.awake = asleep ? Math.max(0, b.awake - 2.2 * dt) : b.awake + dt * (b.lice ? 1.3 : 1);
    const debt = sleepDebt(p);
    if (debt > 0.2) p.mood = Math.min(p.mood, 0.5 - 0.9 * debt);
    if (debt >= 0.98 && !asleep && p.needs.hunger < 0.85 && p.needs.thirst < 0.85 && i?.kind !== "flee" && !(i?.kind === "sleep")) {
      p.intent = { kind: "sleep", x: p.x, z: p.z, speed: 0, remaining: 40, arrived: true };
      note(p, world, "I could not stay awake any longer and fell asleep where I stood.");
      tally(world, "microsleeps");
    }
  }
  // A wound that was bad leaves a mark, and perhaps a limp; a sickness that was bad can leave a sense or the strength damaged.
  if (p.wound) b.woundPeak = Math.max(b.woundPeak, p.wound);
  else if (b.woundPeak > 0) {
    const peak = b.woundPeak;
    b.woundPeak = 0;
    if (peak >= 0.25) {
      const parts = ["arm", "leg", "side", "cheek", "shoulder", "hand"];
      const where = parts[Math.floor(chance(p.id, now, "scar-where", 60) * parts.length)]!;
      if (b.scars.length < MAX_SCARS) b.scars.push({ t: now, what: "a wound", where, severity: clamp01(peak) });
      note(p, world, `The wound healed and left a scar on my ${where}.`);
      tally(world, "scars");
      if (peak >= 0.65 && !b.disabilities.includes("limp") && chance(p.id, now, "limp", 60) < 0.3) {
        b.disabilities.push("limp");
        note(p, world, "It healed badly. I walk with a limp now.");
        chronicle(world, `${p.name} was lamed by a wound.`);
        tally(world, "disabilitiesAcquired");
      }
    }
  }
  // Surviving a named sickness leaves them proof against it.
  if (b.sickWith && !p.illness) {
    if (!b.immune.includes(b.sickWith)) b.immune.push(b.sickWith);
    b.sickWith = undefined;
  }
  if (p.illness) b.illPeak = Math.max(b.illPeak, p.illness.severity);
  else if (b.illPeak > 0) {
    const peak = b.illPeak;
    b.illPeak = 0;
    if (peak >= 0.75) {
      const roll = chance(p.id, now, "after-fever", 60);
      const lost: Disability | undefined = roll < 0.08 ? "poor hearing" : roll < 0.14 ? "poor sight" : roll < 0.2 ? "weak" : undefined;
      if (lost && !b.disabilities.includes(lost)) {
        b.disabilities.push(lost);
        note(p, world, `The fever left me with ${lost === "weak" ? "a weak body" : lost}.`);
        tally(world, "disabilitiesAcquired");
      }
    }
  }
  // Dirt: a person left filthy for days gets lice, which disturb sleep and sour the mood, until they wash.
  if ((p.hygiene ?? 0) > 0.85) b.filthy += dt;
  else if ((p.hygiene ?? 0) < 0.1) {
    b.filthy = 0;
    if (b.lice) {
      b.lice = undefined;
      note(p, world, "Washed the lice out.");
    }
  }
  if (!b.lice && b.filthy > 3 * DAY) {
    b.lice = true;
    note(p, world, "I am crawling with lice.");
    tally(world, "lice");
  }
  if (b.lice) p.mood = Math.min(p.mood, 0.25);
  if (p.pregnant) pregnancyStep(p, world, dt, b);
  else if (b.complications.length && !p.pregnant && p.lastBirth !== undefined && now - p.lastBirth > 0.5 * YEAR) b.complications = [];
  bedStep(p, world, dt, b);
}

// ---- Pregnancy and birth ----

function pregnancyStep(p: Person, world: World, dt: number, b: Body) {
  const now = world.clock ?? 0;
  const frac = (now - p.pregnant!.since) / GESTATION;
  const age = humanYears(p.age);
  if (frac < 0.35) {
    // Early on, a pregnancy may be lost: more often when the mother is hungry, ill or past her best years.
    const total = 0.1 + 0.3 * Math.max(0, p.needs.hunger - 0.6) + (p.illness ? 0.15 : 0) + (age > 40 ? 0.1 : 0) + (age < 20 ? 0.05 : 0);
    const rate = total / (0.35 * GESTATION);
    if (chance(p.id, now, `miscarry-${p.pregnant!.since}`, 0.5) < rate * dt) {
      p.pregnant = undefined;
      p.lastBirth = now;
      p.mood = Math.max(-1, p.mood - 0.5);
      p.grief = clamp01((p.grief ?? 0) + 0.4);
      note(p, world, "I lost the baby before it was time.");
      chronicle(world, `${p.name} lost her baby early.`);
      tally(world, "miscarriages");
    }
    return;
  }
  if (frac > 0.6 && !b.complications.includes("pre-eclampsia")) {
    const total = 0.07 + (age > 36 ? 0.08 : 0) + (age < 20 ? 0.05 : 0) + (p.needs.hunger > 0.6 ? 0.04 : 0);
    if (chance(p.id, now, `eclampsia-${p.pregnant!.since}`, 0.5) < (total / (0.4 * GESTATION)) * dt) {
      b.complications.push("pre-eclampsia");
      note(p, world, "My head aches and my hands are swollen. Something is wrong with the pregnancy.");
      tally(world, "preEclampsia");
    }
  }
  if (b.complications.includes("pre-eclampsia")) {
    const resting = p.intent?.kind === "sleep" || p.intent?.kind === "rest";
    p.health = clamp01(p.health - (dt / (14 * DAY)) * (resting ? 0.3 : 1));
  }
}
/** What goes wrong in a birth, if anything: decided from the mother's age, strength, hunger, dirt and what the pregnancy was like. Applied at once. */
export function birthComplication(world: World, mother: Person): string | undefined {
  const b = bodyOf(mother);
  const now = world.clock ?? 0;
  const age = humanYears(mother.age);
  const p = 0.04 + (age < 20 ? 0.06 : 0) + (age > 34 ? 0.08 : 0) + (mother.needs.hunger > 0.6 ? 0.05 : 0) + ((mother.hygiene ?? 0) > 0.7 ? 0.06 : 0) + (b.fitness < 0.3 ? 0.04 : 0) + (b.complications.includes("pre-eclampsia") ? 0.2 : 0);
  if (chance(mother.id, now, "birth", 600) >= p) return undefined;
  const kinds = ["haemorrhage", "obstructed labour", "childbed fever"];
  const kind = kinds[Math.floor(chance(mother.id, now, "birth-kind", 600) * kinds.length)]!;
  b.complications.push(kind);
  if (kind === "haemorrhage") mother.health = Math.max(0.01, mother.health - 0.5);
  else if (kind === "obstructed labour") mother.health = Math.max(0.01, mother.health - 0.35);
  else if (!mother.illness) mother.illness = { severity: 0.65, since: now };
  if (mother.health <= 0.02) mother.cause = "childbirth";
  note(mother, world, `The birth went badly: ${kind}.`);
  chronicle(world, `${mother.name} nearly died in childbirth (${kind}).`);
  tally(world, "birthComplications");
  return kind;
}
/** How much more likely the baby is to be born still for a given complication (added to the existing chance). */
export const stillbirthExtra = (kind: string | undefined) => (kind === "obstructed labour" ? 0.35 : kind === "haemorrhage" ? 0.1 : kind ? 0.05 : 0);

// ---- Sexual health ----

// A sickness of the bed. It comes in with people from outside (world2.ts), passes between partners, and makes a child less likely.
function bedStep(p: Person, world: World, dt: number, b: Body) {
  if (!b.bedSickness) return;
  const now = world.clock ?? 0;
  p.health = clamp01(p.health - dt / (90 * DAY) * 0.3);
  const partner = p.life?.partner ? world.people.find((q) => q.id === p.life!.partner) : undefined;
  if (partner && dist(p.x, p.z, partner.x, partner.z) < 5) {
    const pb = bodyOf(partner);
    if (!pb.bedSickness && !pb.immune.includes("bed sickness") && chance(p.id + partner.id, now, "bed-spread", 5) < dt / (4 * DAY)) {
      pb.bedSickness = { since: now };
      note(partner, world, "I have caught a sickness from my partner.");
      tally(world, "bedSicknessSpread");
    }
  }
  const medicine = world.knowledge?.medicine !== undefined;
  if (now - b.bedSickness.since > 6 * DAY && chance(p.id, now, "bed-cure", 5) < (dt / (6 * DAY)) * (medicine ? 3 : 1) * 0.5) {
    b.bedSickness = undefined;
    note(p, world, "The sickness has passed.");
    tally(world, "bedSicknessCured");
  }
}
/** The chance of a conception, scaled: a sickness of the bed halves it for either of the pair. */
export function fertilityOf(mother: Person, father: Person): number {
  return (mother.body?.bedSickness ? 0.5 : 1) * (father.body?.bedSickness ? 0.6 : 1);
}
export function infectBed(p: Person, world: World) {
  const b = bodyOf(p);
  if (b.bedSickness || b.immune.includes("bed sickness")) return false;
  b.bedSickness = { since: world.clock ?? 0 };
  note(p, world, "I have a sickness of the bed.");
  tally(world, "bedSicknessCaught");
  return true;
}

// ---- What the body wants ----

/** Tiredness, a lame leg, a lost sense and a difficult pregnancy shift what is wanted. Only when thirst and hunger are not pressing. */
export function bodyBias(p: Person, world: World, opts: Option[]) {
  if (p.needs.thirst >= 0.6 || p.needs.hunger >= 0.6) return;
  const b = p.body;
  if (!b) return;
  const debt = sleepDebt(p);
  const crippled = b.disabilities.includes("limp") || b.disabilities.includes("weak") || b.disabilities.includes("poor sight");
  const eclampsia = b.complications.includes("pre-eclampsia") && p.pregnant;
  for (const o of opts) {
    const k = o.intent.kind;
    if (k === "sleep") o.score += 0.9 * debt + (eclampsia ? 0.3 : 0);
    else if (k === "rest") o.score += 0.4 * debt + (eclampsia ? 0.4 : 0);
    else if (k === "wash" && b.lice) o.score += 0.6;
    else if (k === "hunt" && crippled) o.score -= 0.35;
    else if (k === "talk" && o.intent.targetId && hearingOf(p) < 0.5) o.score -= 0.1;
  }
}

// ---- The Creator's Walker ----

export type Build = "slight" | "average" | "broad";
export interface WalkerLook {
  heightCm: number;
  build: Build;
  skin: number; // 0 pale .. 1 dark
  hair: string; // #rrggbb
  tunic: string; // #rrggbb
}
export interface WalkerDeed {
  t: number;
  kind: "gave" | "healed" | "struck" | "stole";
  to: string;
  harm: number;
}
export interface WalkerBody {
  look: WalkerLook;
  startAge: number; // in years at clock 0
  needs: { hunger: number; thirst: number; energy: number; dirt: number };
  health: number;
  scars: Scar[];
  deeds: WalkerDeed[];
  fitness: number;
}
export const WALKER_LOOK: WalkerLook = { heightCm: 172, build: "average", skin: 0.4, hair: "#4a3424", tunic: "#6b5a3a" };
const HEX = /^#[0-9a-f]{6}$/i;
type WalkerHolder = NonNullable<World["walker"]> & { body?: WalkerBody };
export function walkerBodyOf(world: World): WalkerBody {
  const w = (world.walker ??= { pack: { meat: 0, water: 0, wood: 0, fruit: 0 } }) as WalkerHolder;
  return (w.body ??= { look: { ...WALKER_LOOK }, startAge: 28, needs: { hunger: 0.2, thirst: 0.2, energy: 0.1, dirt: 0 }, health: 1, scars: [], deeds: [], fitness: 0.5 });
}
/** Change how the Walker looks. Every value is checked and a bad one is refused with a reason; nothing is changed if any is bad. */
export function customiseWalker(world: World, change: Partial<WalkerLook>): WalkerLook {
  const next: WalkerLook = { ...walkerBodyOf(world).look };
  for (const [k, v] of Object.entries(change)) {
    if (k === "heightCm") {
      if (typeof v !== "number" || !Number.isFinite(v) || v < 140 || v > 210) throw new Error(`Walker height must be 140 to 210 cm, got ${String(v)}`);
      next.heightCm = v;
    } else if (k === "build") {
      if (v !== "slight" && v !== "average" && v !== "broad") throw new Error(`Walker build must be slight, average or broad, got ${String(v)}`);
      next.build = v;
    } else if (k === "skin") {
      if (typeof v !== "number" || !(v >= 0 && v <= 1)) throw new Error(`Walker skin must be 0 to 1, got ${String(v)}`);
      next.skin = v;
    } else if (k === "hair" || k === "tunic") {
      if (typeof v !== "string" || !HEX.test(v)) throw new Error(`Walker ${k} must be a colour like #aabbcc, got ${String(v)}`);
      next[k] = v;
    } else throw new Error(`Unknown thing to change about the Walker: ${k}`);
  }
  walkerBodyOf(world).look = next;
  return next;
}
export const walkerAge = (world: World) => walkerBodyOf(world).startAge + (world.clock ?? 0) / YEAR;
/** How the Walker's body goes through time. `moving` is whether you are walking. Needs rise as theirs do; being starved, parched or worn out slows you and then hurts. */
export function walkerStep(world: World, dt: number, moving: boolean) {
  const wb = walkerBodyOf(world);
  const n = wb.needs;
  n.hunger = clamp01(n.hunger + dt / (1.3 * DAY));
  n.thirst = clamp01(n.thirst + dt / (0.9 * DAY));
  n.energy = clamp01(n.energy + (moving ? 1.4 : 0.7) * dt / (1.5 * DAY));
  n.dirt = clamp01(n.dirt + dt / (5 * DAY));
  wb.fitness = clamp01(wb.fitness + (moving ? (1 - wb.fitness) * dt / (10 * DAY) : -wb.fitness * dt / (30 * DAY)));
  const loss = (n.thirst >= 1 ? dt / (3 * DAY) : 0) + (n.hunger >= 1 ? dt / (14 * DAY) : 0);
  if (loss > 0) wb.health = Math.max(0.05, wb.health - loss); // the Creator is not left to die; they are left too weak to go on
  else if (n.hunger < 0.7 && n.thirst < 0.7) wb.health = clamp01(wb.health + dt / (2 * DAY));
}
/** The Walker's pace as a share of normal: tired, starved, parched, hurt, unfit or old they go slower. */
export function walkerSpeed(world: World): number {
  const wb = walkerBodyOf(world);
  const age = walkerAge(world);
  const old = age > 60 ? Math.max(0.6, 1 - 0.015 * (age - 60)) : 1;
  const worn = 1 - 0.3 * Math.max(0, wb.needs.energy - 0.6) / 0.4 - 0.25 * Math.max(0, wb.needs.hunger - 0.8) / 0.2 - 0.3 * Math.max(0, wb.needs.thirst - 0.8) / 0.2;
  const hurt = 0.5 + 0.5 * wb.health;
  return Math.max(0.25, worn * hurt * old * (0.95 + 0.1 * (wb.fitness - 0.5)));
}
export function walkerEat(world: World, item: "meat" | "fruit"): boolean {
  const w = world.walker;
  const wb = walkerBodyOf(world);
  if (!w || w.pack[item] <= 0) return false;
  w.pack[item] -= 1;
  wb.needs.hunger = clamp01(wb.needs.hunger - (item === "meat" ? 0.6 : 0.35));
  return true;
}
export function walkerDrink(world: World): boolean {
  const w = world.walker;
  const wb = walkerBodyOf(world);
  if (!w || w.pack.water <= 0) return false;
  w.pack.water -= 1;
  wb.needs.thirst = clamp01(wb.needs.thirst - 0.6);
  return true;
}
/** Eat or drink from the pack when the need is pressing (the Creator does not have to think of it). Returns what was done, for the log. */
export function walkerTend(world: World): string[] {
  const out: string[] = [];
  const n = walkerBodyOf(world).needs;
  if (n.thirst > 0.7 && walkerDrink(world)) out.push("You drink from your water.");
  if (n.hunger > 0.7 && (walkerEat(world, "meat") || walkerEat(world, "fruit"))) out.push("You eat from your pack.");
  return out;
}
export function walkerRest(world: World, seconds: number) {
  const n = walkerBodyOf(world).needs;
  n.energy = clamp01(n.energy - seconds / (0.4 * DAY));
}
export function walkerWash(world: World) {
  walkerBodyOf(world).needs.dirt = 0;
}
/** The Walker is hurt by something (0..1). A hard hurt leaves a scar that stays on them. */
export function walkerHurt(world: World, severity: number, what = "a wound") {
  const wb = walkerBodyOf(world);
  wb.health = Math.max(0.05, wb.health - 0.25 * severity);
  if (severity >= 0.5 && wb.scars.length < MAX_SCARS) {
    const parts = ["arm", "leg", "side", "cheek", "shoulder", "hand"];
    wb.scars.push({ t: world.clock ?? 0, what, where: parts[wb.scars.length % parts.length]!, severity });
    tally(world, "walkerScars");
  }
}
/** What the Walker does to a person is remembered by that person and by anyone near. Harm costs trust and brings fear; help earns trust. */
export function walkerDeed(world: World, person: Person, kind: WalkerDeed["kind"], harm = 0) {
  const wb = walkerBodyOf(world);
  wb.deeds.push({ t: world.clock ?? 0, kind, to: person.id, harm });
  if (wb.deeds.length > 200) wb.deeds.splice(0, wb.deeds.length - 200);
  const weight = kind === "gave" ? 0.08 : kind === "healed" ? 0.2 : kind === "stole" ? -0.2 : -0.3 - 0.4 * harm;
  person.walkerTrust = clamp01((person.walkerTrust ?? 0) + weight);
  if (kind === "struck") {
    person.health = clamp01(person.health - 0.3 * harm);
    person.wound = Math.max(person.wound ?? 0, 0.3 * harm + 0.2);
    feel(person, "fear", 0.5 + 0.4 * harm);
    person.followUntil = undefined;
    note(person, world, "The Creator struck me.");
  } else if (kind === "stole") {
    feel(person, "anger", 0.4);
    note(person, world, "The Creator took what was mine.");
  } else if (kind === "healed") note(person, world, "The Creator tended me.");
  tally(world, `walker_${kind}`);
  // The people who saw it think of the Walker as they would of anyone.
  for (const q of world.people) {
    if (q === person || dist(q.x, q.z, person.x, person.z) > 25) continue;
    const r = relation(q, "walker", world);
    r.trust = Math.max(-1, Math.min(1, r.trust + weight * 0.5));
    if (weight < 0) feel(q, "fear", 0.15);
  }
}
/** What the people make of the Walker overall: -1 feared and mistrusted .. 1 trusted. */
export function walkerRepute(world: World): number {
  const d = walkerBodyOf(world).deeds;
  if (!d.length) return 0;
  let s = 0;
  for (const x of d) s += x.kind === "gave" ? 0.08 : x.kind === "healed" ? 0.2 : x.kind === "stole" ? -0.2 : -0.3 - 0.4 * x.harm;
  return Math.max(-1, Math.min(1, s / Math.max(3, d.length / 2)));
}
