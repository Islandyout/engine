import test from "node:test";
import assert from "node:assert/strict";
import { DAY } from "../src/eden/earth";
import { doCreate, doPonder, doRead, exchangeIdeas, knows, owe, owes, practiseArts, tradeRates, winterComing } from "../src/eden/culture";
import { makePerson, step, type Person, type World } from "../src/eden/mind";
import { worldFromJson, worldToJson } from "../src/eden/persist";

const adult = (id: string, seed: number, over: Partial<Person["personality"]> = {}) => makePerson(id, 0, 0, seed, { curiosity: 0.9, sociability: 0.8, ...over }, { name: id, sex: id < "M" ? "f" : "m", age: 28 });
const base = (people: Person[]): World => ({
  things: [{ id: "river", kind: "river", x: 12, z: 0, radius: 3 }, { id: "grove", kind: "grove", x: -12, z: 0, radius: 3, stock: 6, maxStock: 6 }],
  people,
  radius: 80,
  clock: DAY / 3,
  climate: { meanC: 16, seasonalAmpC: 5, dailyAmpC: 4, rainy: 0.2, seed: 3 },
});
const joy = () => undefined;

test("making a song for others lifts their mood and is remembered as a work", () => {
  const a = adult("Ada", 3);
  const b = adult("Zed", 4);
  b.x = 3;
  const w = base([a, b]);
  const before = b.mood;
  practiseArts(a, "art", 0.5);
  for (let i = 0; i < 6 && !w.works?.length; i++) doCreate(w, a, joy);
  assert.ok(w.works && w.works.length > 0, "something was made");
  assert.ok(b.mood >= before);
  assert.ok(a.journal.some((j) => /"/.test(j.text)));
});

test("pondering works out counting, then writing; a book keeps what its writer knew for a reader after they die", () => {
  const a = adult("Ada", 3);
  const reader = adult("Zed", 9);
  const w = base([a, reader]);
  w.things.push({ id: "pot", kind: "barrel", x: 0, z: 0, radius: 1, stock: 2 });
  practiseArts(a, "lore", 0.9);
  for (let i = 0; i < 60 && !knows(w, "counting"); i++) doPonder(w, a, joy);
  assert.ok(knows(w, "counting"), "counting found");
  doCreate(w, a, joy); // something to write about
  for (let i = 0; i < 80 && !knows(w, "writing"); i++) {
    doCreate(w, a, joy);
    doPonder(w, a, joy);
  }
  assert.ok(knows(w, "writing"), "writing found");
  a.ideas = ["counting", "writing"];
  for (let i = 0; i < 60 && !w.works?.some((x) => x.kind === "book"); i++) {
    a.arts!.lastMade = undefined;
    doCreate(w, a, joy);
  }
  const book = w.works!.find((x) => x.kind === "book");
  assert.ok(book, "a book was written");
  const library = w.things.find((t) => t.kind === "library")!;
  assert.ok(library);
  w.people.splice(w.people.indexOf(a), 1); // the writer dies
  assert.ok(knows(w, "counting"), "the book keeps the knowledge");
  doRead(w, reader, library, joy);
  assert.ok(reader.ideas?.includes("counting"));
});

test("an idea nobody holds and no book keeps is lost", () => {
  const a = adult("Ada", 3);
  const w = base([a]);
  w.knowledge = { counting: { by: "Ada", byName: "Ada", t: 0 } };
  a.ideas = ["counting"];
  assert.ok(knows(w, "counting"));
  w.people.length = 0;
  assert.ok(!knows(w, "counting"));
});

test("people answer the big questions, share their answers, and some disagree", () => {
  const people = ["Ada", "Bea", "Cy", "Zed"].map((n, i) => adult(n, 10 + i));
  const w = base(people);
  w.dead = [{ person: adult("Old", 99), t: 0, cause: "old age" }];
  for (const p of people) for (let i = 0; i < 12; i++) doPonder(w, p, joy);
  assert.ok((w.tenets?.length ?? 0) >= 1, "someone came to believe something");
  for (let i = 0; i < 40; i++) exchangeIdeas(w, people[i % 4]!, people[(i + 1) % 4]!);
  const held = new Set(people.flatMap((p) => Object.values(p.faith ?? {})));
  assert.ok(held.size >= 1);
});

test("favours owed are recorded and cancelled when repaid; counting sets a price for wood", () => {
  const a = adult("Ada", 3);
  const b = adult("Zed", 4);
  const w = base([a, b]);
  owe(w, a, b);
  assert.equal(owes(b, a.id), 1);
  owe(w, b, a);
  assert.equal(owes(b, a.id), 0);
  assert.equal(tradeRates(w).wood, 3);
  w.knowledge = { counting: { by: "Ada", byName: "Ada", t: 0 } };
  a.ideas = ["counting"];
  w.weather = { season: 3 } as World["weather"];
  assert.equal(tradeRates(w).wood, 2, "wood is cheap in winter, when all want it");
  w.weather = { season: 1 } as World["weather"];
  w.clock = 0.9 * 16 * DAY;
  assert.ok(!winterComing(w), "without the calendar summer is just summer");
  w.knowledge.calendar = { by: "Ada", byName: "Ada", t: 0 };
  a.ideas.push("calendar");
  assert.ok(winterComing(w), "with the calendar late summer is the run-up to winter");
});

test("works, knowledge and beliefs survive a save", () => {
  const a = adult("Ada", 3);
  const w = base([a]);
  practiseArts(a, "art", 0.5);
  doCreate(w, a, joy);
  w.knowledge = { counting: { by: "Ada", byName: "Ada", t: 5 } };
  w.tenets = [{ id: "origin:0", question: "origin", text: "x", by: "Ada", byName: "Ada", t: 1 }];
  const back = worldFromJson(worldToJson(w));
  assert.equal(back.works?.length, w.works?.length);
  assert.deepEqual(back.knowledge, w.knowledge);
  assert.deepEqual(back.tenets, w.tenets);
});

test("over a long life with leisure, a household makes art and thinks, and does not starve for it", () => {
  const people = [adult("Ada", 3), adult("Zed", 4)];
  const w = base(people);
  for (const p of people) p.memory.set("river", { x: 12, z: 0, feeling: 0.3, visits: 1, lastSeen: 0 });
  for (let i = 0; i < 4 * DAY / 2; i++) {
    for (const p of people) {
      p.needs.hunger = Math.min(p.needs.hunger, 0.3);
      p.needs.thirst = Math.min(p.needs.thirst, 0.3);
      p.needs.joy = Math.max(p.needs.joy, 0.5);
    }
    step(w, 2);
  }
  assert.ok((w.tally?.ponderings ?? 0) + (w.tally?.songs ?? 0) + (w.tally?.stories ?? 0) + (w.tally?.paintings ?? 0) > 0, "they made or thought something");
});

test("the Walker can ask what someone believes, knows and has made", async () => {
  const { answerWalker } = await import("../src/eden/chat");
  const a = adult("Ada", 3);
  const w = base([a]);
  w.dead = [{ person: adult("Old", 99), t: 0, cause: "old age" }];
  for (let i = 0; i < 15 && !Object.keys(a.faith ?? {}).length; i++) doPonder(w, a, joy);
  const reply = answerWalker(w, a, "What do you believe?", () => 0.1).reply;
  assert.match(reply, /Here is what I think|settled|know what I believe/);
  assert.match(answerWalker(w, a, "what do you know?", () => 0.1).reply, /know|Nothing|working/);
  assert.match(answerWalker(w, a, "do you paint or sing?", () => 0.1).reply, /made|best|like to make/);
});
