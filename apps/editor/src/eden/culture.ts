// What the people make and work out beyond staying alive: songs, stories, paintings and books (creativity); counting, the calendar, writing,
// seed-saving, medicine and the stars (mathematics and science, found by pondering and kept in heads and books); answers to the big
// questions, which spread and divide people (philosophy and theology); and a ledger of favours with a price for goods once they can count
// (economy). Everything here is pure and driven by the same seeded streams as the rest of the mind.
import { DAY, hourOf, YEAR } from "./earth";
import { skillOf, valueOf, type Value } from "./identity";
import { feel } from "./inner";
import { milestone, psycheEvent } from "./psyche";
import { ADULT_AGE, chronicle, isNight, make, note, personById, rand, relation, tally, thingById, type Intent, type Person, type Thing, type World } from "./mind";

export interface Work {
  id: string;
  kind: "song" | "story" | "painting" | "book";
  by: string;
  byName: string;
  title: string;
  t: number;
  quality: number; // 0..1
  text?: string; // a book's words: a few lines from its author's life
  knows?: string[]; // what a book teaches
  at?: string; // the thing it is kept at (a library) or shown on (a painted stone)
}
export interface Tenet {
  id: string;
  question: string;
  text: string;
  by: string;
  byName: string;
  t: number;
}
export interface Arts {
  art: number; // 0..1 how good they are at making things of beauty
  lore: number; // 0..1 how good at working things out
  lastMade?: number;
  lastPondered?: number;
  lastBook?: number;
}
type Option = { intent: Omit<Intent, "arrived">; score: number };

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const dist = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);
function hash01(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

export const talentOf = (p: Person, k: "art" | "lore") => 0.6 + 0.8 * clamp01(0.5 * hash01(p.id + k) + 0.5 * p.personality.curiosity);
export const artOf = (p: Person) => p.arts?.art ?? 0;
export const loreOf = (p: Person) => p.arts?.lore ?? 0;
export function practiseArts(p: Person, k: "art" | "lore", amount = 0.03) {
  const a = (p.arts ??= { art: 0, lore: 0 });
  a[k] = clamp01(a[k] + amount * talentOf(p, k) * (1 - 0.5 * a[k]));
}

// ---- What is known ----

export interface Discovery {
  id: string;
  name: string;
  needs: string[];
  ready(world: World, p: Person): boolean;
  line(p: Person): string;
  effect: string;
}
const anyWork = (w: World) => (w.works?.length ?? 0) > 0;
export const DISCOVERIES: Discovery[] = [
  { id: "counting", name: "counting", needs: [], ready: (w, p) => loreOf(p) >= 0.06 && (p.carry.food + p.carry.wood > 0 || w.things.some((t) => (t.stock ?? 0) > 0)), line: (p) => `${p.name} laid pebbles beside the stored food and gave each a number: counting.`, effect: "goods are traded by the count, dearer when scarce" },
  { id: "calendar", needs: ["counting"], name: "the calendar", ready: (w, p) => (w.clock ?? 0) > 0.75 * YEAR && loreOf(p) >= 0.15, line: (p) => `${p.name} counted the days from one frost to the next and found the year: the calendar.`, effect: "winter is prepared for from late summer" },
  { id: "writing", needs: ["counting"], name: "writing", ready: (w, p) => anyWork(w) && loreOf(p) >= 0.2, line: (p) => `${p.name} scratched marks that stand for words: writing. What is written outlives the one who wrote it.`, effect: "books can be written and read, and knowledge survives its holders" },
  { id: "seed-saving", needs: [], name: "saving seed", ready: (_w, p) => skillOf(p, "farm") >= 0.25 && loreOf(p) >= 0.08, line: (p) => `${p.name} noticed the best plants give the best seed, and kept it back: saving seed.`, effect: "more seed is kept from every harvest" },
  { id: "medicine", needs: [], name: "medicine", ready: (w, p) => skillOf(p, "heal") >= 0.3 && (w.tally?.recoveries ?? 0) > 0 && loreOf(p) >= 0.08, line: (p) => `${p.name} saw which leaves ease a fever, and which do harm: medicine.`, effect: "the sick are tended faster" },
  { id: "stars", needs: ["calendar"], name: "the stars", ready: (w, p) => isNight(w.clock ?? 0) && loreOf(p) >= 0.25, line: (p) => `${p.name} watched the stars wheel through the year and named them: the stars.`, effect: "stories are told of the sky" },
];

export interface Invention {
  id: string;
  name: string;
  wood: number;
  hide: number;
  place: "water" | "prey"; // where it works: beside water, or where game passes
  line(p: Person): string;
  effect: string;
}
/** The laws of this world that nobody is told: things that work if tried with the right stuff in the right place. Found by experiment (reason.ts). */
export const INVENTIONS: Invention[] = [
  { id: "weir", name: "a fish weir", wood: 4, hide: 0, place: "water", line: (p) => `${p.name} staked sticks across the shallows and found the fish gather in them: a weir.`, effect: "a weir in the water fills with fish all through the warm months" },
  { id: "snare", name: "a snare", wood: 3, hide: 0, place: "prey", line: (p) => `${p.name} bent a green branch over a game trail and found it takes meat while they sleep: a snare.`, effect: "snares by game trails fill with meat" },
  { id: "net", name: "a net", wood: 2, hide: 1, place: "water", line: (p) => `${p.name} knotted strips of hide on a wooden frame and found it catches more fish than patience does: a net.`, effect: "a net catches half as many fish again" },
];
export const ideaName = (id: string) => DISCOVERIES.find((d) => d.id === id)?.name ?? INVENTIONS.find((i) => i.id === id)?.name ?? id;

/** Someone living holds the idea, or a book keeps it. Knowledge dies with its last holder unless it was written. */
export function knows(world: World, id: string): boolean {
  if (!world.knowledge?.[id]) return false;
  for (const p of world.people) if (p.ideas?.includes(id)) return true;
  return (world.works ?? []).some((b) => b.kind === "book" && b.knows?.includes(id));
}
/** True once the calendar is known: late summer already counts as the run-up to winter. */
export function winterComing(world: World): boolean {
  if ((world.weather?.season ?? 1) >= 2) return true;
  if (!knows(world, "calendar")) return false;
  return (world.weather?.season ?? 1) === 1 && ((world.clock ?? 0) % YEAR) / YEAR > 0.43;
}
export function tradeRates(world: World): { food: number; wood: number } {
  if (!knows(world, "counting")) return { food: 2, wood: 3 };
  return { food: 2, wood: [3, 4, 3, 2][world.weather?.season ?? 1]! }; // wood is dear in summer, when none is needed, and cheap in winter, when all want it
}

function discover(world: World, person: Person, d: Discovery) {
  (world.knowledge ??= {})[d.id] = { by: person.id, byName: person.name, t: world.clock ?? 0 };
  (person.ideas ??= []).push(d.id);
  person.mood = Math.min(1, person.mood + 0.25);
  chronicle(world, d.line(person));
  note(person, world, `I worked it out: ${d.name}. ${d.effect[0]!.toUpperCase()}${d.effect.slice(1)}.`);
  tally(world, "discoveries");
  psycheEvent(person, "triumph", 1);
  milestone(person, world, "discovery", `worked out ${d.name}`);
}

// ---- Big questions ----

interface Question {
  id: string;
  asked: string;
  when(world: World, p: Person): boolean;
  answers: { text: string; lean: Value }[];
}
export const QUESTIONS: Question[] = [
  { id: "death", asked: "Where do the dead go?", when: (w, p) => (p.grief ?? 0) > 0.1 || (w.dead?.length ?? 0) > 0, answers: [
    { text: "The dead sleep beneath the Tree of Life, and wake in the garden's soil.", lean: "tradition" },
    { text: "The dead walk on in the river, and we meet them when we drink.", lean: "kin" },
    { text: "Nothing comes after, so what we do now is all there is.", lean: "freedom" },
  ] },
  { id: "origin", asked: "Who made the garden?", when: () => true, answers: [
    { text: "The Creator watches over us, and hears those who speak to the sky.", lean: "tradition" },
    { text: "No one made it. It was always here, and we are a part of it.", lean: "freedom" },
    { text: "The first two were put here to look after each other, and so are we.", lean: "kin" },
  ] },
  { id: "owe", asked: "What do we owe one another?", when: (w) => (w.tally?.quarrels ?? 0) > 0 || (w.tally?.thefts ?? 0) > 0, answers: [
    { text: "Share what you have; the hungry are everyone's.", lean: "fairness" },
    { text: "Each answers for their own. What you make is yours.", lean: "freedom" },
    { text: "Family first, then the rest.", lean: "kin" },
  ] },
  { id: "winter", asked: "Why is there winter?", when: (w) => (w.weather?.season ?? 1) >= 2, answers: [
    { text: "Winter is a rest the land takes. Prepare for it; do not fear it.", lean: "comfort" },
    { text: "Winter tests us, and the prepared are blessed.", lean: "tradition" },
  ] },
];
/** Faith in the sense of a held answer to "origin" or "death": what draws people to pray. */
export function faithful(p: Person): number {
  return (p.faith?.origin ? 0.5 : 0) + (p.faith?.death ? 0.4 : 0);
}

function ponderQuestion(world: World, person: Person) {
  const open = QUESTIONS.filter((q) => q.when(world, person) && !person.faith?.[q.id]);
  const q = open[Math.floor(rand(person) * open.length)];
  if (!q) return false;
  const tenets = (world.tenets ??= []);
  const mine = (person.faith ??= {});
  const existing = tenets.filter((t) => t.question === q.id);
  const tradition = valueOf(person, "tradition");
  if (existing.length && rand(person) < 0.12 + 0.45 * tradition) {
    const pick = existing[Math.floor(rand(person) * existing.length)]!;
    mine[q.id] = pick.id;
    note(person, world, `Thought about "${q.asked}" and came to agree: ${pick.text}`);
    tally(world, "faithsTaken");
    return true;
  }
  let best = q.answers[0]!;
  let bestScore = -1;
  for (const a of q.answers) {
    const s = valueOf(person, a.lean) + 0.5 * rand(person);
    if (s > bestScore) (best = a), (bestScore = s);
  }
  let tenet = tenets.find((t) => t.question === q.id && t.text === best.text);
  if (!tenet) {
    tenet = { id: `${q.id}:${tenets.length}`, question: q.id, text: best.text, by: person.id, byName: person.name, t: world.clock ?? 0 };
    tenets.push(tenet);
    chronicle(world, `${person.name} came to believe: "${best.text}"`);
    tally(world, "tenets");
  }
  mine[q.id] = tenet.id;
  note(person, world, `Thought long about "${q.asked}". I believe: ${best.text}`);
  return true;
}

// ---- What they do ----

const SONGS = ["The Song of the River", "{n}'s Lullaby", "A Song for the {s}", "The Harvest Round", "A Walking Song"];
const TALES = ["The Tale of {n}", "How the First Two Woke", "The Wolf and the Fire", "The Stag Who Would Not Run", "The Long Winter"];
const SEASONS = ["Spring", "Summer", "Autumn", "Winter"];
const fill = (s: string, p: Person, world: World) => s.replace("{n}", p.name).replace("{s}", SEASONS[world.weather?.season ?? 1]!);

export function cultureOptions(person: Person, world: World, out: Option[]) {
  if (person.age < ADULT_AGE) return;
  const { needs } = person;
  if (needs.hunger > 0.55 || needs.thirst > 0.55 || needs.energy > 0.7 || person.cold > 0.3 || person.health < 0.5) return;
  const now = world.clock ?? 0;
  const night = isNight(now);
  const arts = (person.arts ??= { art: 0, lore: 0 });
  const c = person.personality.curiosity;
  const grieving = (person.grief ?? 0) > 0.3;
  const free = clamp01((needs.joy - 0.25) / 0.75);
  if (!night && now - (arts.lastMade ?? -1e9) > 0.6 * DAY) {
    const drive = talentOf(person, "art") * (0.35 + 0.65 * c) * (0.5 + 0.5 * free) + (grieving ? 0.25 : 0);
    out.push({ intent: { kind: "create", x: person.x, z: person.z, speed: 0, remaining: 35 }, score: 0.1 + 0.5 * drive });
  }
  if (now - (arts.lastPondered ?? -1e9) > 0.8 * DAY) {
    const drive = talentOf(person, "lore") * c * (0.5 + 0.5 * free) + (grieving ? 0.3 : 0) + (night ? 0.1 : 0);
    out.push({ intent: { kind: "ponder", x: person.x, z: person.z, speed: 0, remaining: 40 }, score: 0.08 + 0.45 * drive });
  }
  // A book kept at a library, read for what it knows.
  for (const t of world.things) {
    if (t.kind !== "library" || dist(person.x, person.z, t.x, t.z) > 70) continue;
    const unread = (world.works ?? []).some((w) => w.kind === "book" && w.at === t.id && !person.ideas?.includes(`read:${w.id}`));
    if (unread && !night) out.push({ intent: { kind: "read", targetId: t.id, x: t.x, z: t.z, speed: 1.3, remaining: 35 }, score: 0.22 + 0.35 * c });
  }
  // A favour owed to someone in need is repaid, in kind.
  if (person.carry.food >= 2) {
    for (const q of world.people) {
      if (q === person || dist(person.x, person.z, q.x, q.z) > 40 || q.needs.hunger < 0.5 || owes(person, q.id) < 1) continue;
      out.push({ intent: { kind: "share", targetId: q.id, x: q.x, z: q.z, speed: 1.3, remaining: 12 }, score: 0.8 + 0.3 * q.needs.hunger });
    }
  }
}

function listeners(world: World, person: Person, radius = 14) {
  return world.people.filter((q) => q !== person && dist(q.x, q.z, person.x, person.z) < radius);
}

export function doCreate(world: World, person: Person, joy: (v: number) => void) {
  const now = world.clock ?? 0;
  const arts = (person.arts ??= { art: 0, lore: 0 });
  arts.lastMade = now;
  const near = listeners(world, person);
  const dusk = hourOf(now) > 16;
  const writing = knows(world, "writing") && loreOf(person) >= 0.15;
  const library = world.things.find((t) => t.kind === "library" && dist(t.x, t.z, person.x, person.z) < 80);
  const r = rand(person);
  // A book is written when there is something new to put in it, or half a year has gone by.
  const written = new Set((world.works ?? []).filter((x) => x.kind === "book" && x.by === person.id).flatMap((x) => x.knows ?? []));
  const fresh = (person.ideas ?? []).some((i) => !i.startsWith("read:") && !written.has(i));
  const canBook = writing && (fresh || now - (arts.lastBook ?? -1e9) > YEAR / 2);
  let kind: Work["kind"];
  if (canBook && r < 0.35) kind = "book";
  else if (artOf(person) > 0.1 && r < 0.55 && world.things.filter((t) => t.kind === "artwork").length < 10) kind = "painting";
  else if (near.length && (dusk || rand(person) < 0.5)) kind = rand(person) < 0.55 ? "song" : "story";
  else kind = rand(person) < 0.6 ? "song" : "story";
  const quality = clamp01(0.15 + 0.55 * artOf(person) + 0.3 * rand(person));
  const works = (world.works ??= []);
  const work: Work = { id: `work-${works.length}`, kind, by: person.id, byName: person.name, title: "", t: now, quality };
  if (kind === "song") work.title = fill(SONGS[Math.floor(rand(person) * SONGS.length)]!, person, world);
  else if (kind === "story") work.title = fill((knows(world, "stars") && rand(person) < 0.4 ? "The Tale of the Wheeling Stars" : TALES[Math.floor(rand(person) * TALES.length)]!), person, world);
  else if (kind === "painting") {
    const sight = world.things.filter((t) => t.kind !== "artwork" && !t.mob && person.memory.has(t.id) && dist(person.x, person.z, t.x, t.z) < 40).sort((a, b) => dist(person.x, person.z, a.x, a.z) - dist(person.x, person.z, b.x, b.z))[0];
    work.title = `A Painting of ${sight ? `the ${sight.kind}` : "the garden"}`;
    const stone = make(world, "artwork", person.x + 1.4, person.z + 0.6, { radius: 1.6, of: work.id, prefab: "Painted Stone" });
    work.at = stone.id;
  } else {
    arts.lastBook = now;
    work.title = `The Book of ${person.name}`;
    const lines = person.journal.filter((j) => j.text.length > 25 && !/^(Slept|Ate|Drank)/.test(j.text)).slice(-3).map((j) => j.text);
    work.text = lines.join(" ");
    work.knows = [...(person.ideas ?? [])].filter((i) => !i.startsWith("read:"));
    const home = library ?? make(world, "library", person.x + 2, person.z, { radius: 2, prefab: "Library" });
    work.at = home.id;
    if (!library) chronicle(world, `${person.name} set up the first library.`);
  }
  works.push(work);
  practiseArts(person, "art", 0.05);
  person.mood = Math.min(1, person.mood + 0.1 + 0.15 * quality);
  joy(0.2);
  const what = { song: "sang", story: "told", painting: "painted", book: "wrote" }[kind];
  note(person, world, `${what[0]!.toUpperCase()}${what.slice(1)} "${work.title}".`);
  person.say = kind === "song" ? "La, la... listen." : kind === "story" ? "Gather round, this is a good one." : kind === "painting" ? "There. That is how it looks." : "I will set it down so it is not lost.";
  for (const q of near) {
    if (kind === "painting" || kind === "book") break;
    q.mood = Math.min(1, q.mood + 0.1 * quality);
    q.needs.social = clamp01(q.needs.social - 0.15);
    if (kind === "story" && (q.grief ?? 0) > 0) q.grief = Math.max(0, (q.grief ?? 0) - 0.05);
    const rel = relation(q, person.id, world);
    rel.affinity = Math.min(1, rel.affinity + 0.03 * (0.5 + quality));
    note(q, world, `${person.name} ${what} "${work.title}". It was ${quality > 0.6 ? "beautiful" : quality > 0.35 ? "pleasant" : "rough, but kindly meant"}.`);
    practiseArts(q, "art", 0.01);
    if (quality > 0.6 && artOf(q) < artOf(person) - 0.15 && q.psyche && q.psyche.drives.esteem < 0.4) feel(q, "envy", 0.3);
  }
  tally(world, kind === "story" ? "stories" : `${kind}s`);
  if (works.filter((w) => w.kind === kind).length === 1) chronicle(world, `${person.name} made the first ${kind}: "${work.title}".`);
  else if (quality > 0.75) chronicle(world, `${person.name}'s "${work.title}" was much admired.`);
}

export function doPonder(world: World, person: Person, joy: (v: number) => void) {
  const arts = (person.arts ??= { art: 0, lore: 0 });
  arts.lastPondered = world.clock ?? 0;
  practiseArts(person, "lore", 0.04);
  joy(0.1);
  for (const d of DISCOVERIES) {
    if (knows(world, d.id) || world.knowledge?.[d.id] || !d.needs.every((n) => knows(world, n)) || !d.ready(world, person)) continue;
    if (rand(person) < 0.4) return discover(world, person, d);
  }
  if (!ponderQuestion(world, person)) note(person, world, "Sat and thought for a while. Nothing came of it, but it was good to think.");
  tally(world, "ponderings");
}

export function doRead(world: World, person: Person, library: Thing | undefined, joy: (v: number) => void) {
  const books = (world.works ?? []).filter((w) => w.kind === "book" && w.at === library?.id && !person.ideas?.includes(`read:${w.id}`));
  const book = books[0];
  if (!book) return;
  const ideas = (person.ideas ??= []);
  ideas.push(`read:${book.id}`);
  const learnt: string[] = [];
  for (const k of book.knows ?? []) if (!ideas.includes(k) && !k.startsWith("read:")) (ideas.push(k), learnt.push(k));
  practiseArts(person, "lore", 0.05);
  joy(0.15);
  const dead = !personById(world, book.by);
  note(person, world, `Read "${book.title}" by ${book.byName}${dead ? ", who is gone now" : ""}.${learnt.length ? ` I learned ${learnt.join(", ")}.` : ""}`);
  if (learnt.length) {
    tally(world, "learntFromBooks");
    if ((world.tally?.learntFromBooks ?? 0) === 1) chronicle(world, `${person.name} learned from a book what ${book.byName} had known.`);
  }
  tally(world, "booksRead");
}

// ---- Between people ----

/** Called when two people finish talking: what they know and believe passes between them, and where they differ they argue. */
export function exchangeIdeas(world: World, a: Person, b: Person) {
  for (const [from, to] of [[a, b], [b, a]] as const) {
    for (const id of from.ideas ?? []) {
      if (id.startsWith("read:") || to.ideas?.includes(id)) continue;
      if (rand(from) < 0.25 + 0.3 * loreOf(to) + 0.2 * relation(to, from.id, world).trust) {
        (to.ideas ??= []).push(id);
        practiseArts(to, "lore", 0.02);
        note(to, world, `${from.name} explained ${ideaName(id)} to me.`);
        tally(world, "ideasShared");
      }
    }
  }
  const tenets = world.tenets ?? [];
  for (const q of QUESTIONS) {
    const ta = a.faith?.[q.id];
    const tb = b.faith?.[q.id];
    if (!ta && !tb) continue;
    if (ta && tb && ta === tb) continue;
    const [speaker, hearer, theirs] = ta && (!tb || rand(a) < 0.5) ? ([a, b, ta] as const) : ([b, a, tb!] as const);
    const tenet = tenets.find((t) => t.id === theirs);
    if (!tenet) continue;
    const trust = relation(hearer, speaker.id, world).trust;
    const had = hearer.faith?.[q.id];
    const pull = (had ? 0.08 : 0.35) * (0.5 + trust) * (0.5 + valueOf(hearer, "tradition")); // the old are listened to
    const heard = pull * (speaker.age >= 49 ? 1.3 : 1);
    if (rand(hearer) < heard) {
      (hearer.faith ??= {})[q.id] = tenet.id;
      note(hearer, world, `${speaker.name} spoke of "${q.asked}" and I came to think: ${tenet.text}`);
      tally(world, had ? "conversions" : "faithsTaken");
      if (had) chronicle(world, `${hearer.name} changed their mind about "${q.asked}", persuaded by ${speaker.name}.`);
    } else if (had) {
      const rel = relation(hearer, speaker.id, world);
      rel.affinity = Math.max(-1, rel.affinity - 0.04 * (1 - hearer.personality.sociability));
      note(hearer, world, `${speaker.name} and I disagreed about "${q.asked}".`);
      tally(world, "debates");
    }
  }
}

// ---- Favours ----

export const owes = (p: Person, otherId: string) => Math.max(0, -(p.favours?.[otherId] ?? 0));
export function owe(world: World, giver: Person, receiver: Person, n = 1) {
  const was = owes(giver, receiver.id);
  giver.favours = { ...giver.favours, [receiver.id]: (giver.favours?.[receiver.id] ?? 0) + n };
  receiver.favours = { ...receiver.favours, [giver.id]: (receiver.favours?.[giver.id] ?? 0) - n };
  if (was >= 1) {
    note(giver, world, `Repaid what I owed ${receiver.name}.`);
    const r = relation(receiver, giver.id, world);
    r.trust = Math.min(1, r.trust + 0.05);
    tally(world, "debtsRepaid");
  }
}
