// What the page shows of the simulation, worked out from the mind and nothing else (no scene, no browser), so tests can check the same numbers the
// page draws: how tall and broad a body stands, how often it blinks, what the face says, what scars and a limp show, where the other settlements
// and the parties on the road are, the feast calendar for the heads-up display, and what the Walker's body says about the one who walks.
import { DAY, SEASON_NAMES, YEAR_DAYS, seasonAt } from "./earth";
import { adultHeightCm, bodyOf, heightCm, walkerAge, walkerBodyOf, walkerSpeed, type Scar, type WalkerBody } from "./body";
import { calendar, festivalOn, groupOf, houseOf, societyOf } from "./society";
import { GOODS, ledgerKind, marketOpen, quote, worldEcon } from "./economy";
import { ethosOf, lawOf, worldConflict } from "./conflict";
import { world2Summary } from "./world2";
import { DAY as DAY_S } from "./earth";
import type { Person, World } from "./mind";

// ---- Size: smooth growth ----

/** The height of the reference figure for each sex: the models are drawn at this height, at scale 1. */
export const MODEL_HEIGHT_CM = { m: 173, f: 160 } as const;
export interface Stature {
  y: number; // how tall, as a multiple of the model
  xz: number; // how broad
  cm: number;
}
/** How big a body is drawn: height from the growth curve (body.ts), broader or slighter by build. A child 1 year old is a third of an adult; the old are a little shorter. */
export function stature(p: Person): Stature {
  const cm = heightCm(p);
  const y = cm / MODEL_HEIGHT_CM[p.sex === "f" ? "f" : "m"];
  const build = bodyOf(p).gene.build;
  // Children are all one build; the width of an adult goes from 0.93 to 1.1 of their height's.
  const grown = Math.min(1, cm / adultHeightCm(p));
  const xz = y * (1 + (0.93 + 0.17 * build - 1) * grown);
  return { y, xz, cm };
}
const BUILD: Record<string, number> = { slight: 0.92, average: 1, broad: 1.1 };
/** How the Walker is drawn, from the look they chose and the age of their body. */
export function walkerStature(world: World): Stature {
  const wb = walkerBodyOf(world);
  const y = wb.look.heightCm / MODEL_HEIGHT_CM.m;
  const age = walkerAge(world);
  const shrink = age > 60 ? Math.min(0.06, 0.0015 * (age - 60)) : 0;
  return { y: y * (1 - shrink), xz: y * (1 - shrink) * BUILD[wb.look.build]!, cm: wb.look.heightCm * (1 - shrink) };
}

// ---- The face ----

/** How closed the eyes are, 0 open .. 1 shut: a blink every few seconds on each person's own beat, longer and slower when worn out, shut in sleep. */
export function blinkClosure(t: number, seed: number, sleepy: number, asleep: boolean): number {
  if (asleep) return 1;
  const period = 2.6 + (seed % 7) * 0.45; // seconds between blinks
  const length = 0.16 + 0.3 * sleepy; // how long one lasts
  const phase = (t + seed * 0.37) % period;
  if (phase >= length) return sleepy > 0.55 ? 0.35 * sleepy : 0; // half-lidded when very tired
  const k = phase / length;
  return Math.max(sleepy > 0.55 ? 0.35 * sleepy : 0, Math.sin(Math.PI * k)); // down and up
}
export interface Face {
  raise: number; // -1 brows drawn down .. 1 raised
  sad: number; // 0..1 the inner ends lifted
  droop: number; // 0..1 lids heavy
  why: string;
}
/** What a face says: brows raised for fear and surprise, down for anger, the inner ends lifted for grief and shame, lids heavy when tired. */
export function faceOf(p: Person): Face {
  const e = p.emotions ?? {};
  const fear = e.fear ?? 0;
  const anger = e.anger ?? 0;
  const joy = e.joy ?? 0;
  const sadness = Math.max(p.grief ?? 0, e.shame ?? 0, p.mood < -0.35 ? -p.mood : 0);
  const droop = Math.max(0, Math.min(1, (p.needs.energy - 0.55) / 0.4));
  let raise = 0.35 * Math.min(1, joy) + 0.9 * Math.min(1, fear) - 0.9 * Math.min(1, anger);
  raise = Math.max(-1, Math.min(1, raise));
  const why = anger > 0.4 ? "angry" : fear > 0.4 ? "afraid" : sadness > 0.3 ? "grieving or low" : droop > 0.5 ? "tired" : joy > 0.5 ? "glad" : "easy";
  return { raise, sad: Math.min(1, sadness), droop, why };
}

// ---- What shows of the body's history ----

/** Where on the body each scar is drawn (the body.ts names for the place). */
export const SCAR_PLACE: Record<string, { bone: "head" | "armR" | "armL" | "thighR" | "thighL" | "chest" | "foreR" | "abdomen"; at: [number, number, number] }> = {
  arm: { bone: "armR", at: [0, 0.12, 0] },
  leg: { bone: "thighR", at: [0, 0.2, 0] },
  side: { bone: "abdomen", at: [0, 0.05, 0] },
  cheek: { bone: "head", at: [0, 0.1, 0] },
  shoulder: { bone: "armL", at: [0, 0.05, 0] },
  hand: { bone: "foreR", at: [0, 0.2, 0] },
};
/** The scars a person carries (the Walker's are in their own body). */
export const scarsOf = (p: Person): Scar[] => p.body?.scars ?? [];
export const limpsOf = (p: Person): boolean => !!p.body?.disabilities.includes("limp");
/** A cheap key for what has to be drawn on a body, so the page redraws only when it changes. */
export const scarKey = (scars: Scar[]) => scars.map((s) => `${s.where}${Math.round(s.severity * 3)}`).join(",");

// ---- The wider world on the horizon ----

export interface SettlementMark {
  id: string;
  name: string;
  x: number; // where the huts stand on the edge of the land
  z: number;
  bearing: number;
  huts: number; // how many to draw: one for about six people
  ruined: boolean;
  fire: boolean; // a hearth burning
  note: string;
  distance: number; // true distance in metres
}
/** Where each other settlement is shown: on the edge of the land, in its own direction, so you can see which way it lies. */
export function horizonMarks(world: World, radius = 168): SettlementMark[] {
  const w2 = world.world2;
  if (!w2) return [];
  return w2.settlements.map((s) => {
    const bearing = Math.atan2(s.z, s.x);
    const ruined = s.collapsedAt !== undefined;
    const mood = s.attitude > 0.15 ? "friendly" : s.attitude < -0.3 ? "hostile" : "wary";
    return {
      id: s.id,
      name: s.name,
      x: Math.cos(bearing) * radius,
      z: Math.sin(bearing) * radius,
      bearing,
      huts: ruined ? 0 : Math.max(1, Math.min(5, Math.round(s.pop / 6))),
      ruined,
      fire: !ruined,
      note: ruined ? `${s.name} (abandoned)` : `${s.name} · ${Math.round(s.pop)} people · ${mood}${s.sick ? ` · ${s.sick}` : ""}`,
      distance: Math.hypot(s.x, s.z),
    };
  });
}

export interface Traveller {
  id: string;
  kind: "trade" | "raid" | "migrants";
  from: string;
  x: number; // where this one walks now
  z: number;
  toX: number; // the camp they are walking to
  toZ: number;
  name: string;
  sex: "m" | "f";
  seed: number;
}
/** How many sim seconds before a party's arrival it comes into sight (the length of the last stretch at a walk). */
export const SIGHT_LEAD = 150;
/** The parties on the road that are close enough to be seen: trading parties, raiders and migrants, strung out along their last stretch to the camp. */
export function travellers(world: World, camp: { x: number; z: number } = { x: 0, z: 0 }, radius = 168): Traveller[] {
  const w2 = world.world2;
  if (!w2) return [];
  const now = world.clock ?? 0;
  const out: Traveller[] = [];
  w2.convoys.forEach((c, ci) => {
    const s = w2.settlements.find((q) => q.id === c.from);
    if (!s || c.arrive - now > SIGHT_LEAD || c.arrive < now) return;
    const bearing = Math.atan2(s.z - camp.z, s.x - camp.x);
    const edge = { x: camp.x + Math.cos(bearing) * radius, z: camp.z + Math.sin(bearing) * radius };
    const n = Math.max(1, Math.min(5, Math.round(c.n)));
    for (let i = 0; i < n; i++) {
      // Each walks a little behind the one before, and they are spread across the road.
      const done = Math.max(0, Math.min(1, 1 - (c.arrive - now) / SIGHT_LEAD - i * 0.035));
      const side = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 1.6;
      out.push({
        id: `party-${c.from}-${Math.round(c.depart)}-${i}`,
        kind: c.kind,
        from: s.name,
        x: edge.x + (camp.x - edge.x) * done - Math.sin(bearing) * side,
        z: edge.z + (camp.z - edge.z) * done + Math.cos(bearing) * side,
        toX: camp.x,
        toZ: camp.z,
        name: `${s.name} ${c.kind === "raid" ? "raider" : c.kind === "trade" ? "trader" : "traveller"}`,
        sex: (ci + i) % 3 === 0 ? "f" : "m",
        seed: ci * 7 + i,
      });
    }
  });
  return out;
}

// ---- The feast calendar ----

export interface FeastHud {
  title: string; // the Objective widget's first line
  detail: string;
  progress: number; // how far through the year, 0..1
  onNow: boolean;
  next: { name: string; inDays: number; season: string };
}
/** The calendar for the heads-up display: the next feast and how many days off, or "tonight" on a feast day. */
export function feastHud(world: World): FeastHud {
  const clock = world.clock ?? 0;
  const { season, dayOfYear } = seasonAt(clock);
  const cal = calendar(world);
  const fest = festivalOn(world);
  const day = dayOfYear + ((clock % DAY) / DAY);
  let next = cal[0]!;
  let inDays = Infinity;
  for (const f of cal) {
    const d = (f.day - day + YEAR_DAYS) % YEAR_DAYS;
    if (d < inDays) ((inDays = d), (next = f));
  }
  const held = societyOf(world).festivals.length;
  const onNow = !!fest;
  const tonight = fest ? cal[season]!.name : "";
  return {
    title: onNow ? `Feast day: ${tonight}` : `Next feast: ${next.name}`,
    detail: onNow ? `Tonight the people gather at the fire · ${SEASON_NAMES[season]} · day ${dayOfYear + 1} of ${YEAR_DAYS}` : `In ${inDays < 1 ? "less than a day" : `${Math.ceil(inDays)} day${Math.ceil(inDays) === 1 ? "" : "s"}`} · ${next.season} · now day ${dayOfYear + 1} of ${YEAR_DAYS}${held ? ` · ${held} kept` : ""}`,
    progress: day / YEAR_DAYS,
    onNow,
    next: { name: next.name, inDays, season: next.season },
  };
}

// ---- The Walker ----

export interface WalkerHud {
  bars: { label: string; value: number; readout: string; bad: boolean }[];
  pace: number;
  line: string;
}
/** What the Walker's body says about itself, for the needs bars. */
export function walkerHud(world: World): WalkerHud {
  const wb: WalkerBody = walkerBodyOf(world);
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const pace = walkerSpeed(world);
  return {
    bars: [
      { label: "Hunger", value: wb.needs.hunger, readout: pct(wb.needs.hunger), bad: wb.needs.hunger > 0.8 },
      { label: "Thirst", value: wb.needs.thirst, readout: pct(wb.needs.thirst), bad: wb.needs.thirst > 0.8 },
      { label: "Tiredness", value: wb.needs.energy, readout: pct(wb.needs.energy), bad: wb.needs.energy > 0.85 },
      { label: "Dirt", value: wb.needs.dirt, readout: pct(wb.needs.dirt), bad: wb.needs.dirt > 0.9 },
      { label: "Health", value: wb.health, readout: pct(wb.health), bad: wb.health < 0.4 },
    ],
    pace,
    line: `Age ${walkerAge(world).toFixed(0)} · ${Math.round(walkerStature(world).cm)} cm · pace ${Math.round(pace * 100)}%${wb.scars.length ? ` · ${wb.scars.length} scar${wb.scars.length > 1 ? "s" : ""}` : ""}`,
  };
}
/** The Resource bar widget's text: the label, the readout, then a colour. */
export const barText = (b: WalkerHud["bars"][number]) => `${b.label}\n${b.readout}\n${b.bad ? "#e0705a" : "#c9a24a"}`;

// ---- The things the people make ----

/** The prefab that shows each thing the crafts of tech.ts make (tools/eden/build_eden.ts defines them). */
export const CRAFT_PREFAB: Record<string, string> = {
  pot: "Clay Pot", spit: "Spit", oven: "Oven", kiln: "Kiln", loom: "Loom", quern: "Quern", ball: "Ball", swing: "Swing", flute: "Flute", drum: "Drum",
  field: "Field", channel: "Channel", pen: "Pen", "dog-bed": "Dog Bed", well: "Well", hive: "Hive", boat: "Boat", raft: "Raft", bridge: "Bridge", granary: "Granary",
};
/** Which of these are drawn from a model that was already in the game's kit, and which are plain stand-ins built from boxes (said in the changelog). */
export const CRAFT_PLACEHOLDER: readonly string[] = ["flute", "channel", "raft", "bridge", "spit", "ball", "loom", "swing"];
export const CRAFT_KINDS = Object.keys(CRAFT_PREFAB);

// ---- The layers of the world, for the Minds tab ----

export interface ReportSection {
  title: string;
  lines: string[];
}
const clockWord = (t: number) => `day ${Math.floor(t / DAY_S) + 1}`;
/** What the Minds tab says about the world beyond one mind: the other settlements, the market and money, the law and the feuds, the feasts. */
export function worldReport(world: World): ReportSection[] {
  const out: ReportSection[] = [];
  const name = (id: string) => world.people.find((q) => q.id === id)?.name ?? (world.dead ?? []).find((d) => d.person.id === id)?.person.name ?? id;
  // Beyond the camp.
  const w2 = world2Summary(world);
  if (w2.length) {
    const lines = [...w2];
    for (const c of world.world2?.convoys ?? []) lines.push(`On the road: a ${c.kind === "trade" ? "trading party" : c.kind === "raid" ? "raiding party" : "group of travellers"} of ${c.n} from ${world.world2?.settlements.find((q) => q.id === c.from)?.name ?? c.from}, due ${clockWord(c.arrive)}`);
    out.push({ title: "Other settlements", lines });
  }
  // Trade and money.
  const e = worldEcon(world);
  const prices = GOODS.filter((g) => g !== "shell").map((g) => {
    const q = quote(world, g);
    return `${g} ${q.price} ${q.unit}`;
  });
  const owing = e.debts.filter((d) => d.state === "open" || d.state === "bonded");
  const eco = [`Prices today: ${prices.join(", ")}`, `${e.money ? `Money: ${e.money}` : "No money yet: goods are swapped"} · accounts kept ${ledgerKind(world) === "written" ? "in writing" : ledgerKind(world) === "tally" ? "by tally" : "in memory only"}`];
  if (e.market) eco.push(`Market at the camp: ${marketOpen(world) ? "open now" : "closed"} (set for ${clockWord(e.market.day * DAY_S)})`);
  if (e.caravan && e.caravan.until > (world.clock ?? 0)) eco.push(`A caravan from outside is at the camp until ${clockWord(e.caravan.until)}`);
  eco.push(`${owing.length} open debt${owing.length === 1 ? "" : "s"} · granary holds ${Math.round(e.granary.food)} food${e.tribute ? ` · tribute ${Math.round(e.tribute * 100)}%` : ""}`);
  for (const v of e.ventures) eco.push(`Venture: a ${v.kind} (${v.raised}/${v.cost} wood raised${v.built ? ", built" : ""})`);
  out.push({ title: "Trade and money", lines: eco });
  // Law, leaders, feuds.
  const soc = societyOf(world);
  const wc = worldConflict(world);
  const law: string[] = [`Law holds ${Math.round(lawOf(world) * 100)}% · a ${ethosOf(world)} people`];
  for (const gid of Object.keys(soc.groups)) {
    const g = groupOf(world, gid);
    if (g.leader) law.push(`${g.name}: led by ${name(g.leader)}${g.council.length ? `, council ${g.council.map(name).join(", ")}` : ""}${g.priest ? `, priest ${name(g.priest)}` : ""}`);
    for (const l of g.laws) law.push(`Law: ${l.text} (${l.rulings} ruling${l.rulings === 1 ? "" : "s"})`);
    for (const t of g.taboos) law.push(`Taboo: ${t.text}`);
  }
  const open = soc.cases.filter((c) => c.state === "open").length;
  const ruled = soc.cases.filter((c) => c.state === "ruled");
  if (soc.cases.length) law.push(`Cases: ${open} waiting for a judge, ${ruled.length} ruled${ruled.length ? ` (last: ${ruled[ruled.length - 1]!.verdict}, ${ruled[ruled.length - 1]!.ruling ?? ""})` : ""}`);
  const houseNames = (h: string) => {
    const member = world.people.find((q) => houseOf(world, q) === h);
    return member ? `the house of ${member.name}` : h;
  };
  for (const f of soc.feuds) law.push(`Feud: ${houseNames(f.a)} and ${houseNames(f.b)} (heat ${Math.round(f.heat * 100)}%, since ${clockWord(f.since)}: ${f.cause})`);
  for (const a of soc.alliances) law.push(`Alliance: ${houseNames(a.a)} and ${houseNames(a.b)}`);
  for (const f of wc.feuds) law.push(`Blood feud: ${houseNames(f.a)} and ${houseNames(f.b)}, ${f.blows} blow${f.blows === 1 ? "" : "s"}${f.ended ? `, ended: ${f.ended.how}` : ""}`);
  for (const w of wc.wars) law.push(`War: ${w.a} and ${w.b}, ${w.raids} raid${w.raids === 1 ? "" : "s"}${w.ended ? `, ended: ${w.ended.how}` : ""}`);
  for (const sc of soc.schisms) law.push(`Schism over "${sc.question}" (heat ${Math.round(sc.heat * 100)}%)`);
  out.push({ title: "Law, leaders and feuds", lines: law });
  // Feasts.
  const feast = feastHud(world);
  const kept = soc.festivals.slice(-3).map((f) => `${f.name}: ${f.attended} came`);
  out.push({ title: "Feasts", lines: [feast.title, feast.detail, ...calendar(world).map((c) => `${c.season}: ${c.name} (day ${c.day + 1})`), ...kept] });
  return out;
}
