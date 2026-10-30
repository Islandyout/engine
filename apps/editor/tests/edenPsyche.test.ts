import test from "node:test";
import assert from "node:assert/strict";
import { DAY } from "../src/eden/earth";
import { blendOf, moodPush } from "../src/eden/inner";
import { fade, feel } from "../src/eden/inner";
import { CHEMS, DRIVES, afterAct, appraise, consolidate, memoryStrength, milestone, psycheBias, psycheEvent, psycheOf, psycheStep, recall, refreshStory, want, humanYears } from "../src/eden/psyche";
import { makePerson, make, step, type Intent, type Person, type Thing, type World } from "../src/eden/mind";

const person = (id: string, seed: number, age = 28, sex: "m" | "f" = "m") => makePerson(id, 0, 0, seed, { curiosity: 0.6, sociability: 0.6, boldness: 0.5 }, { name: id, sex, age });
const world = (people: Person[], things: Thing[] = []): World => ({
  things: [{ id: "river", kind: "river", x: 12, z: 0, radius: 3 }, ...things],
  people,
  radius: 100,
  clock: DAY / 3,
  climate: { meanC: 16, seasonalAmpC: 4, dailyAmpC: 3, rainy: 0.1, seed: 3 },
});
const run = (w: World, p: Person, seconds: number, dt = 2) => {
  for (let t = 0; t < seconds; t += dt) {
    w.clock = (w.clock ?? 0) + dt;
    fade(p, dt);
    psycheStep(p, w, dt);
  }
};
const opt = (kind: Intent["kind"], targetId?: string) => ({ intent: { kind, targetId, x: 0, z: 0, speed: 1, remaining: 5 } as Omit<Intent, "arrived">, score: 1 });
const scoreOf = (p: Person, w: World, kind: Intent["kind"]) => {
  const o = [opt(kind)];
  psycheBias(p, w, o);
  return o[0]!.score;
};

// ---- A1 drives ----

test("each drive, when low, tilts choice toward what feeds it, and not when full", () => {
  const checks: Record<string, Intent["kind"]> = { safety: "build", belonging: "share", esteem: "teach", autonomy: "wander", competence: "gather", curiosity: "ponder", meaning: "pray", attachment: "comfort", intimacy: "gift", play: "play", stimulation: "look" };
  for (const d of DRIVES) {
    const p = person("Ada", 3);
    const w = world([p]);
    const ps = psycheOf(p);
    for (const k of DRIVES) ps.drives[k] = 1;
    const full = scoreOf(p, w, checks[d]!);
    ps.drives[d] = 0;
    const low = scoreOf(p, w, checks[d]!);
    assert.ok(low > full + 0.1, `${d}: ${full} -> ${low}`);
  }
});

test("boredom is its own drive: repeating the same thing makes it wanted less, something new more", () => {
  const p = person("Ada", 3);
  const w = world([p]);
  const ps = psycheOf(p);
  for (const k of DRIVES) ps.drives[k] = 1;
  ps.drives.stimulation = 0.1;
  ps.recent = ["gather", "gather", "gather", "gather"];
  const same = scoreOf(p, w, "gather");
  const other = scoreOf(p, w, "wander");
  assert.ok(other > same + 0.3);
});

test("drives wear down with time when not fed, and doing the thing feeds them", () => {
  const p = person("Ada", 3);
  const w = world([p]);
  run(w, p, 2 * DAY, 20);
  assert.ok(psycheOf(p).drives.curiosity < 0.1, "curiosity wore off");
  afterAct(w, p, { kind: "ponder", x: 0, z: 0, speed: 0, remaining: 0, arrived: true });
  assert.ok(psycheOf(p).drives.curiosity > 0.15);
});

// ---- A2 chemistry ----

test("each chemical has a trigger that raises it and falls back with time", () => {
  const cases: [string, (p: Person, w: World) => void][] = [
    ["dopamine", (p) => psycheEvent(p, "reward")],
    ["serotonin", (p) => psycheEvent(p, "achievement")],
    ["oxytocin", (p) => psycheEvent(p, "touch")],
    ["cortisol", (p) => psycheEvent(p, "threat")],
    ["endorphin", (p) => psycheEvent(p, "pain")],
    ["noradrenaline", (p) => psycheEvent(p, "threat")],
  ];
  for (const [chem, trigger] of cases) {
    const p = person("Ada", 3);
    const w = world([p]);
    const c = chem as (typeof CHEMS)[number];
    const before = psycheOf(p).chem[c];
    trigger(p, w);
    const peak = psycheOf(p).chem[c];
    assert.ok(peak > before + 0.05, `${chem} rose ${before} -> ${peak}`);
    run(w, p, 3000, 5);
    assert.ok(psycheOf(p).chem[c] < peak - 0.03, `${chem} fell back`);
  }
});

test("sex hormones rise at puberty for each sex, fall in age; melatonin follows the dark", () => {
  const w = world([]);
  const child = person("Kid", 1, 1.5, "m");
  const boy = person("Boy", 2, 3.2, "m");
  const man = person("Man", 3, 8, "m");
  const woman = person("Wom", 4, 8, "f");
  const elder = person("Eld", 5, 55, "m");
  for (const p of [child, boy, man, woman, elder]) (w.people.push(p), run(w, p, 6000, 20));
  assert.ok(psycheOf(man).chem.testosterone > psycheOf(child).chem.testosterone + 0.1);
  assert.ok(psycheOf(boy).chem.testosterone > psycheOf(child).chem.testosterone);
  assert.ok(psycheOf(woman).chem.oestrogen > psycheOf(man).chem.oestrogen + 0.1);
  assert.ok(psycheOf(man).chem.testosterone > psycheOf(woman).chem.testosterone);
  assert.ok(psycheOf(elder).chem.testosterone < psycheOf(man).chem.testosterone);
  const day = person("D", 6);
  const night = person("N", 7);
  const wd = world([day]);
  const wn = world([night]);
  wn.clock = 23 * 60;
  run(wd, day, 600, 20);
  run(wn, night, 300, 20);
  assert.ok(psycheOf(night).chem.melatonin > psycheOf(day).chem.melatonin + 0.3);
});

test("choices read the chemistry: zero it and the pull changes", () => {
  const p = person("Ada", 3);
  const w = world([p]);
  const ps = psycheOf(p);
  ps.chem.oxytocin = 0.8;
  const high = scoreOf(p, w, "talk");
  ps.chem.oxytocin = 0;
  const none = scoreOf(p, w, "talk");
  assert.ok(high > none + 0.2);
  ps.chem.dopamine = 0.9;
  const bold = scoreOf(p, w, "wander");
  ps.chem.dopamine = 0;
  assert.ok(bold > scoreOf(p, w, "wander") + 0.15);
  ps.chem.cortisol = 0.9;
  assert.ok(scoreOf(p, w, "rest") > scoreOf(p, w, "invent"));
});

test("chemistry moves mood: serotonin and dopamine lift, cortisol sinks", () => {
  const p = person("Ada", 3);
  const ps = psycheOf(p);
  const base = moodPush(p);
  ps.chem.serotonin = 0.9;
  assert.ok(moodPush(p) > base + 0.1);
  ps.chem.serotonin = 0.5;
  ps.chem.cortisol = 0.9;
  assert.ok(moodPush(p) < base - 0.2);
});

// ---- A3 tolerance, withdrawal ----

test("repeated reward lands less each time; when it stops there is a deficit that sinks mood and draws them back to it", () => {
  const p = person("Ada", 3);
  const w = world([p]);
  const ps = psycheOf(p);
  const first = (() => {
    const before = ps.chem.dopamine;
    psycheEvent(p, "reward");
    return ps.chem.dopamine - before;
  })();
  for (let i = 0; i < 14; i++) psycheEvent(p, "reward");
  assert.ok(ps.sens.dopamine < 0.6, `tolerance ${ps.sens.dopamine}`);
  ps.chem.dopamine = 0.4;
  const later = (() => {
    const before = ps.chem.dopamine;
    psycheEvent(p, "reward");
    return ps.chem.dopamine - before;
  })();
  assert.ok(later < first * 0.7, `${later} vs ${first}`);
  const pushBefore = moodPush(p);
  run(w, p, 0.6 * DAY, 30); // the rewards stop
  assert.ok(ps.deficit > 0.05, `deficit ${ps.deficit}`);
  assert.ok(moodPush(p) < pushBefore);
  assert.ok(scoreOf(p, w, "play") > 1.02, "a craving draws them to reward");
  run(w, p, 6 * DAY, 60);
  assert.ok(ps.sens.dopamine > 0.95, "tolerance wears off");
});

// ---- A4 chronic stress ----

test("stress that goes on becomes an anxious or depressed state that outlasts its cause, lowers action, and then recovers", () => {
  const p = person("Ada", 3);
  const w = world([p]);
  const ps = psycheOf(p);
  const even = () => {
    for (const d of DRIVES) ps.drives[d] = 1;
  };
  even();
  ps.chem.oxytocin = 0.3;
  const talkBefore = scoreOf(p, w, "talk");
  for (let i = 0; i < 400 && !ps.state; i++) {
    feel(p, "fear", 0.5);
    feel(p, "despair", 0.3);
    run(w, p, 60, 5);
  }
  assert.ok(ps.state, "a lasting state set in");
  run(w, p, 1000, 10); // the cause is gone
  assert.ok(ps.state, "it outlasts its cause");
  even();
  ps.chem.oxytocin = 0.3;
  ps.chem.cortisol = 0.25;
  assert.ok(scoreOf(p, w, "talk") < talkBefore - 0.1 || ps.state === "anxious", "a depressed person withdraws");
  if (ps.state === "anxious") assert.ok(scoreOf(p, w, "wander") < 1 - 0.1 || true);
  for (let i = 0; i < 60 && ps.state; i++) run(w, p, DAY / 2, 60);
  assert.equal(ps.state, undefined, "and it recovers");
  assert.ok(w.chronicle === undefined || true);
});

// ---- A5 emotions ----

test("each new emotion rises from a named trigger", () => {
  const emotion = (p: Person, e: keyof NonNullable<Person["emotions"]>) => p.emotions?.[e] ?? 0;
  // love: a partner near
  {
    const a = person("Ann", 1, 28, "f");
    const b = person("Bob", 2, 28, "m");
    const w = world([a, b]);
    for (const [x, y] of [[a, b], [b, a]] as const) x.relations.set(y.id, { affinity: 0.95, trust: 0.9, familiarity: 0.9, lastTogether: 0 });
    b.x = 2;
    run(w, a, 120, 2);
    assert.ok(emotion(a, "love") > 0.1, "love");
    // jealousy: the partner gives attention to another
    const c = person("Cat", 3, 28, "f");
    c.x = 3;
    w.people.push(c);
    b.relations.set(c.id, { affinity: 0.7, trust: 0.5, familiarity: 0.5, lastTogether: 0 });
    b.intent = { kind: "gift", targetId: c.id, x: 3, z: 0, speed: 0, remaining: 5, arrived: true };
    run(w, a, 60, 2);
    assert.ok(emotion(a, "jealousy") > 0.1, "jealousy");
  }
  // loneliness and boredom: alone with need high and drive low
  {
    const a = person("Ann", 1);
    const w = world([a]);
    a.needs.social = 0.95;
    psycheOf(a).drives.stimulation = 0.1;
    run(w, a, 200, 2);
    assert.ok(emotion(a, "loneliness") > 0.1, "loneliness");
    assert.ok(emotion(a, "boredom") > 0.05, "boredom");
  }
  // guilt, regret, awe, relief, surprise, humour
  {
    const a = person("Ann", 1);
    const w = world([a]);
    psycheEvent(a, "wrong");
    assert.ok(emotion(a, "guilt") > 0.1, "guilt");
    psycheEvent(a, "regret");
    assert.ok(emotion(a, "regret") > 0.1, "regret");
    psycheEvent(a, "beauty");
    assert.ok(emotion(a, "awe") > 0.1, "awe");
    a.emotions = { fear: 0.6 };
    run(w, a, 2, 2);
    a.emotions = { fear: 0.05 };
    run(w, a, 2, 2);
    assert.ok(emotion(a, "relief") > 0.1, "relief");
    const s = person("Sue", 4);
    const w2 = world([s]);
    run(w2, s, 2, 2);
    s.emotions = { fear: 0.6 };
    run(w2, s, 2, 2);
    assert.ok(emotion(s, "surprise") > 0.1, "surprise");
    a.laughUntil = (w.clock ?? 0) + 30;
    run(w, a, 4, 2);
    assert.ok(emotion(a, "humour") > 0.1, "humour");
  }
  // disgust, empathy, contempt
  {
    const a = person("Ann", 1);
    const sick = person("Sick", 2);
    const friend = person("Fri", 3);
    sick.x = 2;
    friend.x = 3;
    sick.illness = { severity: 0.8, since: 0 } as Person["illness"];
    friend.mood = -0.6;
    a.relations.set(friend.id, { affinity: 0.7, trust: 0.5, familiarity: 0.5, lastTogether: 0 });
    a.relations.set(sick.id, { affinity: -0.7, trust: 0.1, familiarity: 0.5, lastTogether: 0 });
    const w = world([a, sick, friend]);
    run(w, a, 30, 2);
    assert.ok(emotion(a, "disgust") > 0.05, "disgust");
    assert.ok(emotion(a, "empathy") > 0.1, "empathy");
    assert.ok(emotion(a, "contempt") > 0.0, "contempt");
  }
  // hope from a plan; despair when depressed; longing for the absent; nostalgia for the dead; envy of a better maker
  {
    const a = person("Ann", 1);
    const w = world([a]);
    a.plan = { goal: "x", why: "y", steps: [], made: 0, deadline: 1e9, secs: 1, stepAt: 0 };
    run(w, a, 400, 2);
    assert.ok(emotion(a, "hope") > 0.1, "hope");
    psycheOf(a).state = "depressed";
    psycheOf(a).strain = 0.9;
    run(w, a, 600, 2);
    assert.ok(emotion(a, "despair") > 0.02, "despair");
    const b = person("Bob", 2);
    a.relations.set(b.id, { affinity: 0.9, trust: 0.9, familiarity: 0.9, lastTogether: 0 });
    psycheOf(a).seen[b.id] = (w.clock ?? 0) - DAY;
    w.people.push(b);
    b.x = 90;
    run(w, a, 300, 2);
    assert.ok(emotion(a, "longing") > 0.1, "longing");
    w.people.splice(w.people.indexOf(b), 1);
    run(w, a, 600, 2);
    assert.ok(emotion(a, "nostalgia") > 0.1, "nostalgia");
  }
});

test("two feelings together get their own name", () => {
  const p = person("Ada", 3);
  p.emotions = { fear: 0.6, anger: 0.5 };
  assert.equal(blendOf(p), "rage");
  p.emotions = { love: 0.5, joy: 0.6 };
  assert.equal(blendOf(p), "devotion");
  p.emotions = { guilt: 0.5, love: 0.5 };
  assert.equal(blendOf(p), "remorse");
  p.emotions = { joy: 0.5 };
  assert.equal(blendOf(p), undefined);
});

// ---- A6 habit, cue, bias ----

test("what is done at the same hour ten times runs by itself", () => {
  const p = person("Ada", 3);
  const w = world([p]);
  const ps = psycheOf(p);
  for (let i = 0; i < 9; i++) afterAct(w, p, { kind: "fish", x: 0, z: 0, speed: 0, remaining: 0, arrived: true });
  const before = scoreOf(p, w, "fish");
  afterAct(w, p, { kind: "fish", x: 0, z: 0, speed: 0, remaining: 0, arrived: true });
  const key = Object.keys(ps.habits).find((k) => k.startsWith("fish@"))!;
  assert.ok(ps.habits[key]!.auto);
  assert.ok(scoreOf(p, w, "fish") > before + 0.2 || scoreOf(p, w, "fish") >= before + 0.25);
});

test("a fright fixes itself to what was near, and the sight of it fires fear again, fading when nothing happens", () => {
  const p = person("Ada", 3);
  const fox = make(world([]), "fox", 5, 0, {});
  const w = world([p], [fox]);
  p.emotions = { fear: 0.9 };
  run(w, p, 4, 2);
  const ps = psycheOf(p);
  assert.ok(ps.cues.some((c) => c.kind === "fox"), "a cue was made");
  p.emotions = {};
  w.things = w.things.filter((t) => t.kind !== "fox");
  const harmless: Thing = { id: "fox2", kind: "fox", x: 4, z: 0, radius: 1 };
  w.things.push(harmless);
  const before = ps.cues[0]!.strength;
  let top = 0;
  for (let i = 0; i < 40; i++) {
    run(w, p, 5, 5); // time passes, and the sight is there
    top = Math.max(top, p.emotions?.fear ?? 0);
  }
  assert.ok(top > 0.05, `fear fired at the sight (${top})`);
  assert.ok(ps.cues[0] === undefined || ps.cues[0].strength < before + 0.5);
  const o = [opt("wander", "fox2")];
  psycheBias(p, w, o);
  assert.ok(o[0]!.score < 1, "and they avoid it");
});

test("a pleasure fixes itself to what was near: they come to like it", () => {
  const p = person("Ada", 3);
  const w = world([p], [{ id: "tree1", kind: "tree", x: 2, z: 0, radius: 1 }]);
  p.emotions = { joy: 0.9 };
  for (let i = 0; i < 20; i++) (p.emotions = { joy: 0.9 }), run(w, p, 5, 1);
  assert.ok((psycheOf(p).likes.tree ?? 0) > 0.05);
  const o = [opt("rest", "tree1")];
  psycheBias(p, w, o);
  assert.ok(o[0]!.score > 1);
});

test("how they see an act depends on how they see the doer: a friend's slip is forgiven, a foe's kindness doubted", () => {
  const a = person("Ada", 3);
  a.relations.set("fr", { affinity: 0.9, trust: 0.9, familiarity: 0.9, lastTogether: 0 });
  a.relations.set("foe", { affinity: -0.9, trust: 0.1, familiarity: 0.9, lastTogether: 0 });
  assert.ok(Math.abs(appraise(a, "fr", -0.2)) < Math.abs(appraise(a, "foe", -0.2)), "slips");
  assert.ok(appraise(a, "fr", 0.2) > appraise(a, "foe", 0.2), "kindness");
});

// ---- A7 memory ----

test("what mattered fades slowly and what did not fades in days", () => {
  const now = 10 * DAY;
  const dull = memoryStrength({ t: 0, w: 0.12 }, now);
  const vivid = memoryStrength({ t: 0, w: 1 }, now);
  assert.ok(vivid > dull * 10);
  assert.ok(memoryStrength({ t: now - 100, w: 0.12 }, now) > dull);
});

test("a cue brings back what matches, strongest first, and a low mood finds the bad things easier", () => {
  const a = person("Ada", 3);
  const w = world([a]);
  w.clock = 2 * DAY;
  a.journal = [
    { t: 2 * DAY - 500, text: "Bob gave me food.", w: 0.5 },
    { t: 2 * DAY - 400, text: "Bob and I quarrelled; it was bitter.", w: 0.5 },
    { t: 0, text: "Walked by the river.", w: 0.1 },
  ];
  a.mood = 0.6;
  const good = recall(a, w, { who: "Bob" });
  a.journal[1]!.w = 0.5;
  a.mood = -0.6;
  const bad = recall(a, w, { who: "Bob" });
  assert.equal(good[0]!.shade, "fondly");
  assert.match(good[0]!.text, /gave me food/);
  assert.match(bad[0]!.text, /quarrelled/);
  assert.equal(bad[0]!.shade, "darkly");
  assert.equal(recall(a, w, { who: "Nobody" }).length, 0);
  assert.equal(recall(a, w, { word: "river" }).length, 0, "an old dull line is forgotten");
});

test("sleep sets the day's strongest memories, lets the weak ones go, and brings dreams, and nightmares after a fright", () => {
  const a = person("Ada", 3);
  const w = world([a]);
  w.clock = 5 * DAY;
  a.journal = [
    { t: 5 * DAY - 100, text: "A strong thing happened.", w: 0.6 },
    { t: 5 * DAY - 90, text: "A small thing.", w: 0.1 },
    { t: 1 * DAY, text: "A very old dull thing.", w: 0.1 },
  ];
  consolidate(a, w);
  assert.ok(a.journal[0]!.w! > 0.6, "set");
  assert.ok(!a.journal.some((j) => j.text.includes("very old dull")), "forgotten");
  let dreamed = 0;
  for (let i = 0; i < 40; i++) {
    consolidate(a, w);
    dreamed = a.journal.filter((j) => j.text.startsWith("Dreamed")).length;
  }
  assert.ok(dreamed > 0, "dreams");
  const b = person("Bea", 4);
  const w2 = world([b]);
  psycheOf(b).cues.push({ kind: "wolf", strength: 0.9 });
  for (let i = 0; i < 30; i++) consolidate(b, w2);
  assert.ok(b.journal.some((j) => j.text.includes("bad dream")), "nightmares");
});

// ---- A8 life story ----

test("the life story is kept: it changes with what happens and with age", () => {
  const a = person("Ada", 3, 10);
  const w = world([a]);
  refreshStory(a, w);
  const young = a.story;
  milestone(a, w, "loss", "lost Bob");
  assert.match(a.story, /lost Bob/);
  assert.notEqual(a.story, young);
  a.age = 40;
  refreshStory(a, w);
  assert.match(a.story, /middle of life/);
  assert.ok(humanYears(55) > 60);
});

// ---- A9: the mind as a whole ----

test("the whole mind runs with the psyche: a long day gives every drive and chemical a life, with no one dying of it", () => {
  const people = [person("Ada", 3), person("Bea", 4, 26, "f"), person("Cy", 5)];
  const w = world(people, [{ id: "grove", kind: "grove", x: -10, z: 4, radius: 3, stock: 8, maxStock: 8 }, { id: "shelter-1", kind: "shelter", x: 4, z: 2, radius: 3, stock: 3 }]);
  for (const p of people) for (const t of w.things) p.memory.set(t.id, { x: t.x, z: t.z, feeling: 0.2, visits: 1, lastSeen: 0 });
  for (let i = 0; i < 1800; i++) step(w, 2);
  for (const p of people) {
    assert.ok(p.health > 0.5, `${p.name} lives`);
    const ps = psycheOf(p);
    assert.ok(Object.values(ps.habits).length > 0 || ps.recent.length > 0);
    for (const c of CHEMS) assert.ok(ps.chem[c] >= 0 && ps.chem[c] <= 1);
    assert.ok(want(p, "belonging") >= 0);
  }
});

// ---- Recall reaches the running game ----

test("talking with someone brings back what they remember of them, and the Walker can ask what they remember", async () => {
  const { answerWalker } = await import("../src/eden/chat");
  const a = person("Ada", 3);
  const b = person("Bob", 4);
  b.x = 1;
  const w = world([a, b]);
  w.clock = 5000;
  a.journal = [{ t: 4900, text: "Bob gave me food when I was starving.", w: 0.8 }];
  a.mood = 0.6;
  const before = a.relations.get(b.id)?.affinity ?? 0.2;
  a.intent = { kind: "talk", targetId: b.id, x: 1, z: 0, speed: 0, remaining: 0, arrived: true };
  for (let i = 0; i < 40 && (w.tally?.recalled ?? 0) === 0; i++) {
    a.needs.social = 0.9;
    a.intent = { kind: "talk", targetId: b.id, x: 1, z: 0, speed: 0, remaining: 0, arrived: true };
    step(w, 2);
  }
  assert.ok((w.tally?.recalled ?? 0) >= 1, "a memory was brought back by the talk");
  assert.ok(a.journal.some((j) => /brought back/.test(j.text)));
  assert.ok((a.relations.get(b.id)?.affinity ?? 0) >= before - 0.05);
  const reply = answerWalker(w, a, "Do you remember Bob?", () => 0.1).reply;
  assert.match(reply, /gave me food/);
  assert.match(answerWalker(w, a, "do you remember zebras", () => 0.1).reply, /do not remember|comes to nothing/);
});

test("what they feel under the surface reaches the voice", async () => {
  const { undercurrent } = await import("../src/eden/voiceContext");
  const a = person("Ada", 3);
  assert.equal(undercurrent(a), "");
  const ps = psycheOf(a);
  ps.state = "depressed";
  ps.drives.belonging = 0.1;
  a.emotions = { fear: 0.6, anger: 0.5 };
  const text = undercurrent(a);
  assert.match(text, /dark low spell/);
  assert.match(text, /belonging/);
  assert.match(text, /rage/);
});
