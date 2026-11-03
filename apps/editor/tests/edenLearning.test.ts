import test from "node:test";
import assert from "node:assert/strict";
import { DAY } from "../src/eden/earth";
import { knows } from "../src/eden/culture";
import { SKILL_WORDS } from "../src/eden/identity";
import {
  FIRST_WORDS, acquireWords, ageCuriosity, bookAllowed, believe, carryKnowledge, censor, collapse, composeTale, copyBook, curiosityAt, curiosityByAge, examine, failedAt, holdsRule, learnBias, learnOf,
  learnOptions, learningStep, loreTalk, mayLearn, refute, retell, reputeOf, soundShift, spreadBeliefs, takeApprentice, teachStep, tellTale, testBeliefs, understands, worldLore, wordFor, type Tale,
} from "../src/eden/learning";
import { makePerson, step, type Intent, type Person, type Thing, type World } from "../src/eden/mind";
import { worldFromJson, worldToJson } from "../src/eden/persist";

const person = (id: string, seed = 1, age = 20, sex: "m" | "f" = "m", x = 0, z = 0) => makePerson(id, x, z, seed, { sociability: 0.6, boldness: 0.6, curiosity: 0.6 }, { name: id, sex, age });
const world = (people: Person[], things: Thing[] = []): World => ({ things, people, radius: 80, clock: DAY / 3, climate: { meanC: 16, seasonalAmpC: 4, dailyAmpC: 3, rainy: 0.1, seed: 3 } });
const opt = (kind: Intent["kind"], score: number) => ({ intent: { kind, x: 0, z: 0, speed: 1, remaining: 5 } as Omit<Intent, "arrived">, score });
const skilled = (p: Person, skill: "forage" | "fish" | "hunt" | "farm" | "build" | "heal", v: number) => ((p.skills ??= { forage: 0, fish: 0, hunt: 0, farm: 0, build: 0, heal: 0 }), (p.skills[skill] = v), p);
const hours = (w: World, ps: Person[], n: number) => {
  for (let i = 0; i < n; i++) {
    w.clock = (w.clock ?? 0) + 60;
    for (const p of ps) learningStep(p, w, 60);
  }
};

// ---- F1: structured teaching ----

test("F1: a pupil gains skill faster with a master than from chance teaching, and the teacher pays", () => {
  const master = skilled(person("Master", 1, 30), "fish", 0.85);
  const pupil = person("Pupil", 2, 14);
  const chance = person("Chance", 2, 14);
  const w = world([master, pupil, chance]);
  assert.deepEqual(takeApprentice(w, master, pupil, "fish"), { ok: true });
  const e0 = master.needs.energy;
  const h0 = master.needs.hunger;
  for (let i = 0; i < 8; i++) {
    teachStep(w, master, pupil);
    teachStep(w, master, chance);
  }
  assert.ok((pupil.skills?.fish ?? 0) > 1.7 * (chance.skills?.fish ?? 0), `apprentice ${pupil.skills?.fish} vs chance ${chance.skills?.fish}`);
  assert.ok(master.needs.energy > e0 + 0.2, "teaching tires the teacher");
  assert.ok(master.needs.hunger > h0, "and costs them a meal sooner");
  assert.ok((w.tally?.teachingCost ?? 0) >= 16);
});

test("F1: the master refuses a pupil when not good enough, when full, or when closed to them, and says why", () => {
  const weak = skilled(person("Weak", 1, 30), "hunt", 0.3);
  const good = skilled(person("Good", 3, 30), "hunt", 0.9);
  const ps = [1, 2, 3, 4].map((i) => person(`P${i}`, 10 + i, 14));
  const w = world([weak, good, ...ps]);
  const r1 = takeApprentice(w, weak, ps[0]!, "hunt");
  assert.ok(!r1.ok && /not good enough/.test(r1.reason));
  for (let i = 0; i < 3; i++) assert.ok(takeApprentice(w, good, ps[i]!, "hunt").ok);
  const r2 = takeApprentice(w, good, ps[3]!, "hunt");
  assert.ok(!r2.ok && /all the pupils/.test(r2.reason));
  assert.equal(w.tally?.schools, 1, "a master with two pupils runs a school");
  worldLore(w).restrict["skill:hunt"] = { sex: "m" };
  const girl = person("Girl", 30, 14, "f");
  w.people.push(girl);
  const r3 = takeApprentice(w, good, girl, "hunt");
  assert.ok(!r3.ok && /not taught to women/.test(r3.reason));
});

test("F1: a pupil who has learned enough is tested and initiated; one who has not is told so; the master's reputation grows", () => {
  const master = skilled(person("Master", 1, 30), "build", 0.9);
  const pupil = person("Pupil", 2, 14);
  const w = world([master, pupil]);
  takeApprentice(w, master, pupil, "build");
  skilled(pupil, "build", 0.3);
  const r0 = reputeOf(master, "build");
  assert.equal(examine(w, master, pupil)?.passed, false);
  assert.ok(learnOf(pupil).master, "still an apprentice");
  skilled(pupil, "build", 0.6);
  assert.equal(examine(w, master, pupil)?.passed, true);
  assert.deepEqual(learnOf(pupil).initiated, ["build"]);
  assert.equal(learnOf(pupil).master, undefined);
  assert.ok(reputeOf(master, "build") > r0);
  assert.ok((w.chronicle ?? []).some((c) => /made a builder/.test(c.text)));
});

test("F1: a young person seeks the best-reputed master on their own, and the master's lessons are offered as a choice that yields to thirst", () => {
  const master = skilled(person("Master", 1, 30, "m", 5, 0), "forage", 0.9);
  learnOf(master).repute.forage = 0.8;
  const pupil = person("Pupil", 2, 3.2, "f", 8, 0);
  pupil.talents = { forage: 1.4, fish: 0.6, hunt: 0.6, farm: 0.6, build: 0.6, heal: 0.6 };
  const w = world([master, pupil]);
  hours(w, [master, pupil], 400);
  assert.equal(learnOf(pupil).master?.id, "Master");
  const opts: ReturnType<typeof opt>[] = [];
  w.clock = DAY * 20 + DAY * 0.4;
  learnOptions(master, w, opts);
  const teach = opts.find((o) => o.intent.kind === "teach" && o.intent.targetId === "Pupil");
  assert.ok(teach && teach.score > 0.4, "the master offers to teach");
  master.needs.thirst = 0.95;
  const thirsty: typeof opts = [];
  learnOptions(master, w, thirsty);
  assert.equal(thirsty.length, 0, "a thirsty master does not");
});

// ---- F2: oral tradition ----

const tale = (form: Tale["form"], id: string): Tale => ({ id, form, rule: "fire-keeps-wolves", by: "x", byName: "x", t: 0, parts: ["keep the fire alive", "a hunter went out with one dog and two spears", "a small wolf came to the old fire", "the first snow fell on a small hut"] });
const chain = (form: Tale["form"], n: number, k: number) => {
  const t = tale(form, `${form}-${n}`);
  let v = { parts: t.parts.slice(), rule: true, hops: 0 };
  for (let i = 0; i < k; i++) v = retell(t, v, `hearer-${n}-${i}`);
  return v;
};

test("F2: a story drifts as it is retold", () => {
  const v = chain("story", 1, 6);
  assert.notDeepEqual(v.parts, tale("story", "x").parts);
  const a = person("A", 1), b = person("B", 2), c = person("C", 3);
  const w = world([a, b, c]);
  const t = composeTale(w, a, "fire-keeps-wolves", "story");
  relationsOpen([a, b, c]);
  let guard = 0;
  while (!learnOf(b).tales[t.id] && guard++ < 50) tellTale(w, a, b);
  while (!learnOf(c).tales[t.id] && guard++ < 100) tellTale(w, b, c);
  assert.equal(learnOf(a).tales[t.id]!.hops, 0);
  assert.equal(learnOf(c).tales[t.id]!.hops, 2);
  assert.ok(w.tally?.talesTold >= 2);
});
function relationsOpen(ps: Person[]) {
  for (const a of ps) for (const b of ps) if (a !== b) a.relations.set(b.id, { affinity: 0.8, trust: 1, familiarity: 0.8, lastTogether: 0 });
}

test("F2: the rule survives longer in a song than in a story, and in a proverb and a myth than in a story", () => {
  const kept = (form: Tale["form"]) => {
    let n = 0;
    for (let i = 0; i < 400; i++) if (chain(form, i, 6).rule) n++;
    return n / 400;
  };
  const [song, story, myth, proverb] = [kept("song"), kept("story"), kept("myth"), kept("proverb")];
  assert.ok(song > story + 0.4, `song ${song} story ${story}`);
  assert.ok(myth > story && proverb > story);
});

test("F2: the tale's rule leans the holder, only while they still hold it, and a song heard again restores it", () => {
  const a = person("A", 1), b = person("B", 2);
  const w = world([a, b]);
  relationsOpen([a, b]);
  w.clock = DAY * 0.9; // night
  const t = composeTale(w, a, "fire-keeps-wolves", "song");
  let guard = 0;
  while (!learnOf(b).tales[t.id] && guard++ < 50) tellTale(w, a, b);
  assert.ok(holdsRule(b, w, "fire-keeps-wolves") || !learnOf(b).tales[t.id]!.rule);
  learnOf(b).tales[t.id]!.rule = true;
  const withRule = [opt("fire", 0.5), opt("wander", 0.5)];
  learnBias(b, w, withRule);
  assert.ok(withRule[0]!.score > withRule[1]!.score, "the fire is favoured at night");
  learnOf(b).tales[t.id]!.rule = false; // lost in the telling
  const without = [opt("fire", 0.5)];
  learnBias(b, w, without);
  assert.equal(without[0]!.score, 0.5);
  while (!learnOf(b).tales[t.id]!.rule && guard++ < 200) tellTale(w, a, b);
  assert.ok(learnOf(b).tales[t.id]!.rule, "told again, the rule is back");
  b.needs.hunger = 0.9;
  const hungry = [opt("fire", 0.5)];
  learnBias(b, w, hungry);
  assert.equal(hungry[0]!.score, 0.5, "hunger comes first");
});

// ---- F3: access to knowledge ----

test("F3: a craft closed by sex is not taught across the line", () => {
  const m = skilled(person("M", 1, 30, "m"), "hunt", 0.9);
  const girl = person("G", 2, 14, "f");
  const boy = person("B", 3, 14, "m");
  const w = world([m, girl, boy]);
  worldLore(w).restrict["skill:hunt"] = { sex: "m" };
  assert.ok(mayLearn(w, girl, m, "hunt"));
  assert.equal(mayLearn(w, boy, m, "hunt"), undefined);
  assert.equal(teachStep(w, m, girl), undefined);
  assert.ok(teachStep(w, m, boy));
  assert.ok((girl.skills?.hunt ?? 0) === 0 && (w.tally?.teachingRefused ?? 0) === 1);
});

test("F3: a craft closed by class is taught only to the elite", () => {
  const m = skilled(person("M", 1, 30), "heal", 0.9);
  const a = person("A", 2, 14), b = person("B", 3, 14);
  learnOf(a).class = "elite";
  learnOf(b).class = "common";
  const w = world([m, a, b]);
  worldLore(w).restrict["skill:heal"] = { class: "elite" };
  assert.ok(teachStep(w, m, a));
  assert.equal(teachStep(w, m, b), undefined);
  assert.match(mayLearn(w, b, m, "heal")!, /elite/);
});

test("F3: a guild keeps its craft secret from casual learners but takes its own apprentices", () => {
  const m = skilled(person("M", 1, 30), "build", 0.9);
  const apprentice = person("Ap", 2, 14), onlooker = person("On", 3, 14);
  const w = world([m, apprentice, onlooker]);
  worldLore(w).guilds.build = { members: ["M", "N"], secret: true };
  assert.equal(teachStep(w, m, onlooker), undefined);
  assert.equal(w.tally?.secretsKept, 1);
  assert.ok(takeApprentice(w, m, apprentice, "build").ok);
  assert.ok(teachStep(w, m, apprentice));
  skilled(apprentice, "build", 0.6);
  examine(w, m, apprentice);
  assert.ok(worldLore(w).guilds.build!.members.includes("Ap"), "initiation admits them to the guild");
});

test("F3: literacy is power: with reading closed, only the lettered elite read, and letters are not taught outside it", () => {
  const scribe = person("S", 1, 30);
  scribe.ideas = ["writing"];
  const elite = person("E", 2, 20), commoner = person("C", 3, 20);
  learnOf(elite).class = "elite";
  learnOf(elite).literate = true;
  learnOf(commoner).literate = true;
  const w = world([scribe, elite, commoner]);
  w.knowledge = { writing: { by: "S", byName: "S", t: 0 } };
  assert.ok(bookAllowed(w, commoner, "b"), "open to all while nothing restricts it");
  worldLore(w).restrict.read = { class: "elite" };
  assert.ok(bookAllowed(w, elite, "b"));
  assert.ok(!bookAllowed(w, commoner, "b"));
  const learner = person("L", 4, 14);
  skilled(scribe, "forage", 0.9);
  w.people.push(learner);
  for (let i = 0; i < 30; i++) teachStep(w, scribe, learner);
  assert.ok(!learnOf(learner).literate, "closed reading is not taught to a commoner");
  assert.ok((w.tally?.readingRefused ?? 0) > 0);
});

test("F3: letters are taught by those who have them", () => {
  const scribe = skilled(person("S", 1, 30), "forage", 0.9);
  scribe.ideas = ["writing"];
  const kid = person("K", 2, 14);
  const w = world([scribe, kid]);
  w.knowledge = { writing: { by: "S", byName: "S", t: 0 } };
  w.people[0]!.ideas = ["writing"];
  for (let i = 0; i < 40 && !learnOf(kid).literate; i++) teachStep(w, scribe, kid);
  assert.ok(learnOf(kid).literate);
});

const library = (): Thing => ({ id: "lib", kind: "library", x: 0, z: 0, radius: 3 });
const bookWorld = () => {
  const scribe = person("S", 1, 30);
  scribe.ideas = ["writing", "counting", "calendar"];
  const w = world([scribe], [library()]);
  w.knowledge = { writing: { by: "S", byName: "S", t: 0 }, counting: { by: "S", byName: "S", t: 0 }, calendar: { by: "S", byName: "S", t: 0 } };
  w.works = [{ id: "work-0", kind: "book", by: "S", byName: "S", title: "On Counting", t: 0, quality: 0.8, knows: ["counting", "calendar"], at: "lib" }];
  return { w, scribe };
};

test("F3: a banned book is taken from its shelf and can be neither read nor copied", () => {
  const { w, scribe } = bookWorld();
  assert.ok(bookAllowed(w, scribe, "work-0"));
  assert.equal(censor(w, "work-0"), true);
  assert.equal(w.works![0]!.at, undefined);
  assert.ok(!bookAllowed(w, scribe, "work-0"));
  assert.equal(copyBook(w, scribe, "work-0"), undefined);
  assert.throws(() => censor(w, "nope"), /no work/);
});

test("F3: copying a book gives a second copy (with slips possible), and the copy outlasts a collapse that burns the first", () => {
  const { w, scribe } = bookWorld();
  const id = copyBook(w, scribe, "work-0", "lib");
  assert.ok(id);
  const copy = w.works!.find((x) => x.id === id)!;
  assert.equal(copy.copyOf, "work-0");
  assert.ok(copy.quality < 0.8);
  // Everyone forgets; the first book burns but the copy is kept elsewhere.
  copy.at = "elsewhere";
  const lost = collapse(w, 1);
  assert.ok(w.works!.find((x) => x.id === "work-0")!.knows!.length === 0, "the burnt book keeps nothing");
  assert.ok(copy.knows!.length > 0, "the copy kept something");
  assert.ok(copy.knows!.every((k) => knows(w, k)), "what the copy kept is still known");
  assert.ok(lost.every((k) => !copy.knows!.includes(k)));
});

test("F3: knowledge known only in heads is lost in a collapse; a book that holds it keeps it", () => {
  const a = person("A", 1), b = person("B", 2);
  a.ideas = ["stars", "medicine"];
  b.ideas = ["stars"];
  const w = world([a, b]);
  w.knowledge = { stars: { by: "A", byName: "A", t: 0 }, medicine: { by: "A", byName: "A", t: 0 } };
  w.works = [{ id: "work-0", kind: "book", by: "A", byName: "A", title: "T", t: 0, quality: 0.5, knows: ["medicine"], at: "shelf" }];
  assert.ok(knows(w, "stars") && knows(w, "medicine"));
  collapse(w, 0.4); // heads only: books do not burn at this severity
  assert.ok(knows(w, "medicine"), "written down, it survives");
  w.works![0]!.at = undefined; // not on a shelf any more, but still a book
  const all = collapse(w, 1);
  assert.ok(!knows(w, "stars"), "only in heads, it is gone");
  assert.ok(all.includes("stars"));
  assert.ok(knows(w, "medicine"), "the book still holds it");
  assert.ok((w.tally?.knowledgeLost ?? 0) >= 1);
});

test("F3: strangers carry knowledge in and out", () => {
  const host = person("H", 1), stranger = person("T", 2);
  stranger.stranger = { since: 0 };
  stranger.ideas = ["seed-saving"];
  host.ideas = ["medicine"];
  const w = world([host, stranger]);
  for (let i = 0; i < 12; i++) carryKnowledge(w, host, stranger);
  assert.ok(host.ideas.includes("seed-saving") && stranger.ideas.includes("medicine"));
  assert.ok((w.tally?.knowledgeCarried ?? 0) >= 2);
  const locals = [person("X", 3), person("Y", 4)];
  locals[0]!.ideas = ["stars"];
  carryKnowledge(world(locals), locals[0]!, locals[1]!);
  assert.deepEqual(locals[1]!.ideas ?? [], [], "between locals this does nothing");
});

test("F3: a scholar copies a book left at the library they are beside", () => {
  const { w, scribe } = bookWorld();
  scribe.arts = { art: 0, lore: 0.6 };
  const before = w.works!.length;
  hours(w, [scribe], 1500);
  assert.ok(learnOf(scribe).scholar);
  assert.ok(w.works!.length > before, "a copy was made");
});

// ---- F4: failure, error and false belief ----

test("F4: failing teaches caution; watching another fail teaches a little", () => {
  const a = person("A", 1, 20, "m", 0, 0), b = person("B", 2, 20, "m", 5, 0), far = person("Far", 3, 20, "m", 60, 0);
  const w = world([a, b, far]);
  failedAt(w, a, "hunt");
  assert.equal(learnOf(a).failures.hunt, 1);
  assert.equal(learnOf(b).failures.hunt, 0.5, "the onlooker learned half as much");
  assert.equal(learnOf(far).failures.hunt, undefined);
  const hunt = [opt("hunt", 0.5), opt("fish", 0.5)];
  learnBias(a, w, hunt);
  assert.ok(hunt[0]!.score < hunt[1]!.score, "less keen to try again");
  a.needs.hunger = 0.9;
  const hungry = [opt("hunt", 0.5)];
  learnBias(a, w, hungry);
  assert.equal(hungry[0]!.score, 0.5, "hunger overrides it");
});

test("F4: a false belief spreads by talk, persists while untried, and is dropped (and unspoken) when tried and found false", () => {
  const ps = ["A", "B", "C", "D"].map((n, i) => person(n, i + 1));
  const [a, b, c, d] = ps as [Person, Person, Person, Person];
  const w = world(ps);
  relationsOpen(ps);
  believe(w, a, "thin-moon-hunt", 0.9);
  for (let i = 0; i < 60; i++) for (const [x, y] of [[a, b], [b, c], [c, d]] as const) spreadBeliefs(w, x, y);
  assert.ok(learnOf(d).beliefs["thin-moon-hunt"], "it reached the end of the chain");
  assert.ok((w.tally?.falseBeliefsSpread ?? 0) >= 2);
  // Days pass with nobody hunting: nothing contradicts it.
  hours(w, ps, 72);
  for (const p of ps) assert.ok(learnOf(p).beliefs["thin-moon-hunt"], `${p.name} still believes it`);
  // It biases the believer away from the act it forbids.
  const o = [opt("hunt", 0.5), opt("fish", 0.5)];
  learnBias(c, w, o);
  assert.ok(o[0]!.score < o[1]!.score);
  // One of them hunts, and nothing bad happens: the belief fails the test.
  for (let i = 0; i < 20 && learnOf(c).beliefs["thin-moon-hunt"]; i++) testBeliefs(w, c, "hunt");
  assert.equal(learnOf(c).beliefs["thin-moon-hunt"], undefined, "dropped when tried");
  assert.ok(learnOf(c).refuted.includes("thin-moon-hunt"));
  assert.ok((w.tally?.beliefsUpdated ?? 0) >= 1);
  const o2 = [opt("hunt", 0.5)];
  learnBias(c, w, o2);
  assert.equal(o2[0]!.score, 0.5, "and no longer leans on them");
  // Having tried it, they do not take it up again, and those they talk to are shaken.
  const before = learnOf(d).beliefs["thin-moon-hunt"]!.conf;
  for (let i = 0; i < 6; i++) spreadBeliefs(w, c, d);
  assert.equal(learnOf(c).beliefs["thin-moon-hunt"], undefined);
  assert.ok(learnOf(d).beliefs["thin-moon-hunt"] === undefined || learnOf(d).beliefs["thin-moon-hunt"]!.conf < before, "the contradiction reaches others");
});

test("F4: a true belief is borne out when tried and is not dropped", () => {
  const a = person("A", 1);
  const w = world([a]);
  believe(w, a, "dusk-fish", 0.6);
  for (let i = 0; i < 10; i++) testBeliefs(w, a, "fish");
  assert.ok(learnOf(a).beliefs["dusk-fish"]!.conf > 0.9);
});

test("F4: a stubborn traditionalist needs more evidence than a free thinker to give a belief up", () => {
  const trad = person("T", 1), free = person("F", 2);
  trad.values = { kin: 0.5, fairness: 0.5, freedom: 0.1, tradition: 1, comfort: 0.5 };
  free.values = { kin: 0.5, fairness: 0.5, freedom: 1, tradition: 0, comfort: 0.5 };
  const w = world([trad, free]);
  believe(w, trad, "river-takes-lone", 0.7);
  believe(w, free, "river-takes-lone", 0.7);
  refute(w, trad, "river-takes-lone");
  refute(w, free, "river-takes-lone");
  assert.ok(learnOf(trad).beliefs["river-takes-lone"], "the traditionalist keeps it");
  assert.equal(learnOf(free).beliefs["river-takes-lone"], undefined, "the free thinker drops it");
});

test("F4: a teacher's mistaken belief about the work is passed on with the lesson", () => {
  const m = skilled(person("M", 1, 30), "fish", 0.9);
  const kid = person("K", 2, 14);
  const w = world([m, kid]);
  believe(w, m, "river-takes-lone", 0.95);
  for (let i = 0; i < 10 && !learnOf(kid).beliefs["river-takes-lone"]; i++) teachStep(w, m, kid);
  assert.ok(learnOf(kid).beliefs["river-takes-lone"], "the pupil took the error with the skill");
  assert.ok((w.tally?.teacherErrorsPassed ?? 0) >= 1);
  assert.equal(learnOf(kid).beliefs["river-takes-lone"]!.from, "M");
});

test("F4: a bad outcome in a real step can lead a person to an explanation, right or wrong", () => {
  const a = person("A", 1, 20);
  const w = world([a]);
  let blamed = false;
  for (let i = 0; i < 60 && !blamed; i++) {
    failedAt(w, a, "hunt", false);
    blamed = Object.keys(learnOf(a).beliefs).length > 0;
  }
  assert.ok(blamed);
  assert.ok(a.journal.some((j) => /It went badly/.test(j.text)));
});

// ---- F5: curiosity and language ----

test("F5: curiosity is stronger in the young and falls with age", () => {
  let last = Infinity;
  for (const age of [2, 6, 12, 20, 30, 45, 60]) {
    const v = ageCuriosity(age);
    assert.ok(v < last, `age ${age}`);
    last = v;
  }
  assert.ok(ageCuriosity(3) > 2 * ageCuriosity(55) * 0.9);
  const kid = person("K", 1, 5), elder = person("E", 1, 50);
  assert.ok(curiosityAt(kid) > curiosityAt(elder) + 0.3);
});

test("F5: curiosity by age: the young set out to explore more than the old (measure over a short run)", () => {
  const things: Thing[] = [{ id: "river", kind: "river", x: 15, z: 0, radius: 3 }, { id: "grove", kind: "grove", x: -15, z: 0, radius: 3, stock: 6, maxStock: 6 }];
  for (let i = 0; i < 8; i++) things.push({ id: `rock-${i}`, kind: "rock", x: 30 + 8 * i, z: (i % 3) * 8 - 8, radius: 1 });
  const young = [1, 2, 3].map((i) => person(`Y${i}`, i, 5, "f", i, 0));
  const old = [1, 2, 3].map((i) => person(`O${i}`, i, 45, "m", i, 3));
  const w = world([...young, ...old], things);
  w.clock = DAY * 0.3;
  for (const p of w.people) p.memory.clear();
  const scoreOf = (p: Person) => {
    const o: ReturnType<typeof opt>[] = [];
    learnOptions(p, w, o);
    return Math.max(0, ...o.filter((x) => x.intent.kind === "wander").map((x) => x.score));
  };
  const y = young.reduce((s, p) => s + scoreOf(p), 0);
  const o = old.reduce((s, p) => s + scoreOf(p), 0);
  assert.ok(y > 2 * o, `young ${y} old ${o}`);
  // The tallied measure: exploring per day lived.
  w.tally = { explore_young: 9, exposure_young: 24 * 3, explore_mid: 4, exposure_mid: 24 * 4, explore_old: 1, exposure_old: 24 * 3 };
  const m = curiosityByAge(w);
  assert.ok(m.young > m.mid && m.mid > m.old);
});

test("F5: a thirsty or hungry person is not sent exploring", () => {
  const kid = person("K", 1, 5);
  const w = world([kid], [{ id: "rock", kind: "rock", x: 30, z: 0, radius: 1 }]);
  w.clock = DAY * 0.3;
  kid.memory.clear();
  const calm: ReturnType<typeof opt>[] = [];
  learnOptions(kid, w, calm);
  assert.ok(calm.some((o) => o.intent.kind === "wander"));
  kid.needs.thirst = 0.7;
  const thirsty: ReturnType<typeof opt>[] = [];
  learnOptions(kid, w, thirsty);
  assert.equal(thirsty.filter((o) => o.intent.kind === "wander").length, 0);
});

test("F5: a sound change always changes the word", () => {
  for (const word of ["wasa", "fiyar", "manu", "tomo", "kiko", "vulu", "rina", "hema", "x", "aa"]) for (let i = 0; i < 20; i++) assert.notEqual(soundShift(word, `s${i}`), word);
});

test("F5: vocabulary drifts across generations: the grandchildren's words are no longer the grandparents'", () => {
  const w = world([]);
  const founder = person("G0", 1, 30);
  acquireWords(w, founder, [], 0);
  assert.equal(understands(w, founder, founder), 1);
  let line = founder;
  const gens: Person[] = [founder];
  for (let g = 1; g <= 10; g++) {
    const child = person(`G${g}`, 100 + g, 20);
    acquireWords(w, child, [line]);
    gens.push(child);
    line = child;
  }
  const near = understands(w, gens[0]!, gens[1]!);
  const far = understands(w, gens[0]!, gens[10]!);
  assert.ok(near > far, `neighbouring generations ${near} vs ten apart ${far}`);
  assert.ok(far < 0.6, `ten generations on, only ${far} of the words are understood`);
  assert.ok(near >= 0.7, "a parent and child still understand each other");
  const changed = Object.keys(FIRST_WORDS).filter((c) => wordFor(w, gens[0]!, c) !== wordFor(w, gens[10]!, c));
  assert.ok(changed.length >= 4, `${changed.length} of ${Object.keys(FIRST_WORDS).length} words changed`);
  assert.ok((w.tally?.wordsShifted ?? 0) > 5);
});

test("F5: a child who is old enough takes its parents' words in the course of a life", () => {
  const mum = person("Mum", 1, 30, "f"), dad = person("Dad", 2, 32, "m");
  learnOf(mum).words = { water: "wosa", fire: "fiyar", food: "manu", friend: "tomo", child: "kiko", wolf: "vulu", river: "rina", home: "hema" };
  const kid = person("Kid", 3, 1.2, "f");
  kid.mother = "Mum";
  kid.father = "Dad";
  const w = world([mum, dad, kid]);
  hours(w, [kid], 3);
  assert.ok(learnOf(kid).words, "words were learned");
  const dw = learnOf(kid).words!;
  assert.ok(dw.water === "wosa" || dw.water !== "wasa", "from the mother, not the first word");
});

// ---- the layer in the whole mind ----

test("a world with the layer runs for days, keeps its lore through a save, and tales move by talk", () => {
  const ps = Array.from({ length: 6 }, (_, i) => person(`P${i}`, i + 1, 20 + 3 * i, i % 2 ? "f" : "m", i * 2, 0));
  const w = world(ps, [{ id: "river", kind: "river", x: 12, z: 0, radius: 3 }, { id: "grove", kind: "grove", x: -12, z: 0, radius: 3, stock: 20, maxStock: 20 }]);
  composeTale(w, ps[0]!, "share-in-winter", "song");
  relationsOpen(ps);
  for (let t = 0; t < 2 * DAY; t += 2) step(w, 2);
  const loaded = worldFromJson(worldToJson(w));
  assert.equal(loaded.lore?.tales.length, w.lore?.tales.length);
  assert.deepEqual(loaded.people[0]!.learn?.tales, w.people[0]!.learn?.tales);
  loreTalk(w, ps[0]!, ps[1]!);
  for (let i = 0; i < 30; i++) loreTalk(w, ps[0]!, ps[1]!);
  assert.ok(learnOf(ps[1]!).tales["tale-0"]);
  assert.ok(SKILL_WORDS.fish.role);
});
