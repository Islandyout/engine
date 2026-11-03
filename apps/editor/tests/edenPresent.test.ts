import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DAY, YEAR } from "../src/eden/earth";
import { bodyOf, customiseWalker, walkerBodyOf, walkerHurt, walkerSpeed, walkerStep } from "../src/eden/body";
import { enableWorld2 } from "../src/eden/world2";
import { makePerson, type Person, type World } from "../src/eden/mind";
import { CRAFTS } from "../src/eden/tech";
import { newMemory, personMotion, walkStyle } from "../src/eden/motion";
import { societyOf } from "../src/eden/society";
import { CRAFT_KINDS, CRAFT_PREFAB, PREFAB_LIFT, SIGHT_LEAD, barText, blinkClosure, faceOf, feastHud, feastTonight, horizonMarks, scarKey, stature, travellers, walkerHud, walkerStature, worldReport } from "../src/eden/present";

const person = (id: string, age: number, sex: "m" | "f" = "m") => makePerson(id, 0, 0, id.length * 31 + 7, {}, { name: id, sex, age });
const world = (people: Person[] = [person("A", 20)]): World => ({ things: [{ id: "shelter-0", kind: "shelter", x: 0, z: 0, radius: 3, stock: 4, maxStock: 12 }], people, radius: 190, clock: DAY / 3, climate: { meanC: 14, seasonalAmpC: 9, dailyAmpC: 5, rainy: 0.3, seed: 7 } });

// ---------------- I3: smooth growth ----------------

test("a body grows a little at a time from birth to adulthood, with no jump of the kind a swap of models would make", () => {
  // Eden years: a person is grown at 4 (about 18 of ours), so every twentieth of an Eden year from birth to 4.5 is a step of under a month of ours.
  const sizes = Array.from({ length: 91 }, (_, i) => stature(person("G", i * 0.05, "m")).y);
  for (let i = 1; i < sizes.length; i++) {
    assert.ok(sizes[i]! >= sizes[i - 1]! - 1e-9, `never shrinks while growing (step ${i})`);
    assert.ok(sizes[i]! - sizes[i - 1]! < 0.04, `step ${i} grows by ${(sizes[i]! - sizes[i - 1]!).toFixed(3)}, not a jump`);
  }
  assert.ok(sizes[0]! < 0.5 && sizes.at(-1)! > 0.9, `a newborn is under half, a grown person about the model's height (${sizes[0]!.toFixed(2)} to ${sizes.at(-1)!.toFixed(2)})`);
});
test("a child that went hungry is smaller than one who did not; the old are a little shorter than they were", () => {
  const fed = person("H", 8);
  const hungry = person("H", 8);
  bodyOf(hungry).stunt = 0.08;
  assert.ok(stature(hungry).cm < stature(fed).cm);
  assert.ok(stature(person("O", 70)).cm < stature(person("O", 20)).cm);
});
test("a broad build is drawn broader than a slight one, and a child of either is the same breadth for their height", () => {
  const a = person("W", 30), b = person("W", 30);
  bodyOf(a).gene.build = 1;
  bodyOf(b).gene.build = 0;
  assert.ok(stature(a).xz > stature(b).xz);
  const c = person("W", 0.8), d = person("W", 0.8);
  bodyOf(c).gene.build = 1;
  bodyOf(d).gene.build = 0;
  assert.ok(Math.abs(stature(c).xz - stature(d).xz) < 0.03);
});

// ---------------- I4: faces ----------------

test("eyes blink every few seconds, shut for a moment; they stay shut in sleep and a tired face blinks slowly", () => {
  const seed = 12;
  const closed = (t: number, s = 0, asleep = false) => blinkClosure(t, seed, s, asleep);
  let shut = 0, n = 0, longest = 0, run = 0;
  for (let t = 0; t < 60; t += 0.02) {
    n++;
    if (closed(t) > 0.5) (shut++, run++, (longest = Math.max(longest, run)));
    else run = 0;
  }
  assert.ok(shut > 0 && shut / n < 0.12, `shut ${(100 * shut / n).toFixed(1)}% of the time`);
  assert.ok(longest * 0.02 < 0.3, "a blink is brief");
  assert.equal(closed(5, 0, true), 1, "asleep: shut");
  let tiredShut = 0;
  for (let t = 0; t < 60; t += 0.02) if (closed(t, 0.9) > 0.5) tiredShut++;
  assert.ok(tiredShut > shut, "tired eyes are shut more");
});
test("a face says what the person feels: brows up for fear, down for anger, lids heavy when tired", () => {
  const p = person("F", 25);
  const calm = faceOf(p);
  p.emotions = { fear: 0.9 };
  assert.ok(faceOf(p).raise > calm.raise + 0.5);
  p.emotions = { anger: 0.9 };
  assert.ok(faceOf(p).raise < calm.raise - 0.5);
  p.emotions = {};
  p.needs.energy = 0.95;
  assert.ok(faceOf(p).droop > 0.7);
  p.needs.energy = 0.1;
  p.grief = 0.8;
  assert.ok(faceOf(p).sad > 0.5);
});

// ---------------- I3: limp, scars ----------------

test("someone born with a lame leg walks with a limp and slowly, without having been hurt", () => {
  const p = person("L", 30);
  assert.equal(walkStyle(p, world([p])).pose, undefined);
  bodyOf(p).disabilities.push("limp");
  const s = walkStyle(p, world([p]));
  assert.equal(s.pose, "limp");
  assert.ok(s.pace < 0.9);
});
test("scars make a different key for what is drawn, so the page redraws when one is added", () => {
  const wb = walkerBodyOf(world());
  const w = world();
  const none = scarKey(walkerBodyOf(w).scars);
  walkerHurt(w, 0.8, "a bear");
  assert.notEqual(scarKey(walkerBodyOf(w).scars), none);
  assert.equal(wb.scars.length, 0);
});

// ---------------- I4: swimming and rowing ----------------

test("a person on a boat rows, and one whose boat went over swims", () => {
  const w = world();
  const p = w.people[0]!;
  p.tech = { mat: {}, tools: [], tried: {}, seen: {}, used: {}, watchAt: {}, wrong: [], method: 0, thinkAt: -1e9, declinedAt: {}, afloat: true, route: { id: "land:ok:boat:calm:10.0:20.0", x: 0, z: 0, speed: 1.4 } };
  p.intent = { kind: "work", x: 0, z: 0, speed: 1.4, remaining: 1, arrived: false };
  assert.equal(personMotion(p, w, newMemory()).pose, "row");
  p.tech.route!.id = "land:cap:boat:rough:10.0:20.0";
  assert.equal(personMotion(p, w, newMemory()).pose, "swim");
  p.tech.route!.id = "land:ok:bridge:calm:10.0:20.0";
  assert.notEqual(personMotion(p, w, newMemory()).pose, "row", "crossing a bridge is walking");
});

// ---------------- I5: the Walker ----------------

test("the Walker is drawn at the height and build they chose, and older bodies are a little shorter", () => {
  const w = world();
  const base = walkerStature(w);
  customiseWalker(w, { heightCm: 195, build: "broad" });
  const tall = walkerStature(w);
  assert.ok(tall.y > base.y && tall.xz > tall.y, "taller, and broader than tall");
  customiseWalker(w, { heightCm: 195, build: "slight" });
  assert.ok(walkerStature(w).xz < walkerStature(w).y);
  walkerBodyOf(w).startAge = 85;
  assert.ok(walkerStature(w).cm < 195);
});
test("what the Walker's needs say is what the bars show, and the pace the avatar is given is walkerSpeed", () => {
  const w = world();
  walkerStep(w, 2 * DAY, true);
  const hud = walkerHud(w);
  assert.equal(hud.pace, walkerSpeed(w));
  assert.ok(hud.pace < 1);
  const hunger = hud.bars.find((b) => b.label === "Hunger")!;
  assert.equal(hunger.value, walkerBodyOf(w).needs.hunger);
  assert.match(barText(hunger), /^Hunger\n\d+%\n#/);
});

// ---------------- I1: settlements on the horizon, parties on the road ----------------

test("each settlement is drawn on the edge of the land in its own direction, with huts by its size, and a ruin when it is abandoned", () => {
  const w = world();
  const w2 = enableWorld2(w, 1);
  const marks = horizonMarks(w);
  assert.equal(marks.length, w2.settlements.length);
  for (const m of marks) {
    const s = w2.settlements.find((q) => q.id === m.id)!;
    assert.ok(Math.abs(Math.hypot(m.x, m.z) - 168) < 1e-6, "on the edge of the land");
    assert.ok(Math.abs(Math.atan2(m.z, m.x) - Math.atan2(s.z, s.x)) < 1e-9, "toward where it lies");
    assert.ok(m.huts >= 1 && m.huts <= 5);
    assert.ok(m.note.includes(s.name));
  }
  w2.settlements[0]!.pop = 40;
  assert.equal(horizonMarks(w)[0]!.huts, 5);
  w2.settlements[0]!.collapsedAt = 5;
  assert.ok(horizonMarks(w)[0]!.ruined && horizonMarks(w)[0]!.huts === 0);
});
test("a party is seen only on its last stretch, and walks nearer to the camp until it arrives", () => {
  const w = world();
  const w2 = enableWorld2(w, 1);
  const s = w2.settlements[0]!;
  w.clock = 10_000;
  w2.convoys.push({ kind: "raid", from: s.id, depart: 5000, arrive: 10_000 + 4 * SIGHT_LEAD, n: 3 });
  assert.equal(travellers(w).length, 0, "too far to see");
  const dists: number[] = [];
  for (const left of [SIGHT_LEAD - 1, SIGHT_LEAD / 2, 10]) {
    w.clock = w2.convoys[0]!.arrive - left;
    const t = travellers(w);
    assert.equal(t.length, 3);
    assert.ok(t.every((x) => x.kind === "raid"));
    dists.push(Math.hypot(t[0]!.x, t[0]!.z));
  }
  assert.ok(dists[0]! > dists[1]! && dists[1]! > dists[2]!, `comes nearer: ${dists.map((d) => d.toFixed(0)).join(" > ")}`);
  assert.ok(dists[0]! > 150 && dists[2]! < 40);
  w.clock = w2.convoys[0]!.arrive + 1;
  assert.equal(travellers(w).length, 0, "arrived: the effect is the mind's");
});

// ---------------- G3: the feast ----------------

test("the calendar names the next feast and how long off it is, and says so on a feast day", () => {
  const w = world();
  w.clock = 0 * DAY + 19 * 60 * 60 / 60; // day 1, evening hour mapped below
  const dayZero = feastHud(w);
  assert.ok(dayZero.onNow, "the first day of a season is a feast day");
  assert.match(dayZero.title, /^Feast day: /);
  w.clock = 2 * DAY;
  const two = feastHud(w);
  assert.ok(!two.onNow);
  assert.match(two.title, /^Next feast: /);
  assert.ok(Math.round(two.next.inDays) === 2, `two days to go, got ${two.next.inDays}`);
  assert.match(two.detail, /^In 2 days/);
  assert.ok(two.progress > 0 && two.progress < 1);
  w.clock = YEAR + 3 * DAY;
  assert.ok(feastHud(w).next.inDays <= 4);
});
test("a feast is kept in the evening of a feast day only", () => {
  const w = world();
  w.clock = 0 * DAY + 0.8 * DAY; // 19:12 on day 1 (a feast day)
  assert.ok(feastTonight(w));
  w.clock = 0 * DAY + 0.2 * DAY; // morning of the same day
  assert.ok(!feastTonight(w));
  w.clock = 2 * DAY + 0.8 * DAY;
  assert.ok(!feastTonight(w), "not a feast day");
});

// ---------------- the layers in the Minds tab ----------------

test("the Minds tab reports the settlements, trade and money, law and feuds, and the feasts", () => {
  const w = world([person("Ann", 30, "f"), person("Bo", 30, "m")]);
  enableWorld2(w, 1);
  const titles = (x: World) => worldReport(x).map((s) => s.title);
  assert.deepEqual(titles(w), ["Other settlements", "Trade and money", "Law, leaders and feuds", "Feasts"]);
  const law = () => worldReport(w).find((s) => s.title === "Law, leaders and feuds")!.lines.join("\n");
  assert.ok(!/Feud:/.test(law()));
  societyOf(w).feuds.push({ a: "Ann", b: "Bo", heat: 0.8, since: 100, cause: "a theft" });
  societyOf(w).alliances.push({ a: "Ann", b: "Bo", since: 5 });
  assert.match(law(), /Feud: .* \(heat 80%/);
  assert.match(law(), /Alliance:/);
  assert.match(worldReport(w).find((s) => s.title === "Trade and money")!.lines.join("\n"), /Prices today: food/);
  w.world2!.convoys.push({ kind: "trade", from: w.world2!.settlements[0]!.id, depart: 0, arrive: 5000, n: 2 });
  assert.match(worldReport(w).find((s) => s.title === "Other settlements")!.lines.join("\n"), /On the road: a trading party of 2/);
});

// ---------------- J6: a prefab for every crafted kind ----------------

test("every kind a craft makes has a prefab, and each prefab is in the Eden scene with a lift", () => {
  const scene = JSON.parse(readFileSync(new URL("../../../games/my-games/eden/scene.json", import.meta.url), "utf8")) as { prefabs: Record<string, unknown> };
  const kinds = [...new Set(CRAFTS.flatMap((c) => (c.out.thing ? [c.out.thing] : [])))];
  assert.equal(kinds.length, 18, `the 18 kinds crafts make: ${kinds.join(", ")}`);
  for (const k of [...kinds, "bridge", "granary"]) {
    const name = CRAFT_PREFAB[k];
    assert.ok(name, `${k} has a prefab name`);
    assert.ok(name! in scene.prefabs, `the Eden scene has a prefab "${name}" for ${k}`);
    assert.ok(name! in PREFAB_LIFT, `${name} has a lift`);
  }
  assert.equal(CRAFT_KINDS.length, 20);
  for (const n of ["Settlement Hut", "Settlement Ruin", "Settlement Banner", "Settlement Banner Red", "Trader (man)", "Trader (woman)", "Raider (man)", "Festival Fire"]) assert.ok(n in scene.prefabs, `the scene has "${n}"`);
});
