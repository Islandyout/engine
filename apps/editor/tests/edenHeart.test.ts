import test from "node:test";
import assert from "node:assert/strict";
import { DAY } from "../src/eden/earth";
import { betray, celebrate, heartAfter, heartBias, heartOf, heartStep, joyFrom, loveStep, meaningStep, painBias, painStep, sacrificeStep } from "../src/eden/heart";
import { lifeOf, pairUp } from "../src/eden/lifecycle";
import { witness, tell } from "../src/eden/mindmodel";
import { makePerson, type Intent, type Person, type Thing, type World } from "../src/eden/mind";
import { psycheOf } from "../src/eden/psyche";

const person = (id: string, seed = 1, x = 0, z = 0, age = 8, sex: "m" | "f" = "m") => makePerson(id, x, z, seed, { sociability: 0.6, boldness: 0.6, curiosity: 0.5 }, { name: id, sex, age });
const world = (people: Person[], things: Thing[] = []): World => ({ things, people, radius: 80, clock: DAY / 3, climate: { meanC: 16, seasonalAmpC: 4, dailyAmpC: 3, rainy: 0.1, seed: 3 } });
const run = (w: World, ps: Person[], seconds: number, dt = 20) => {
  for (let t = 0; t < seconds; t += dt) {
    w.clock = (w.clock ?? 0) + dt;
    for (const p of ps) heartStep(p, w, dt);
  }
};
const fond = (a: Person, b: Person, aff = 0.8) => a.relations.set(b.id, { affinity: aff, trust: 0.6, familiarity: 0.8, lastTogether: 0 });
const opt = (kind: Intent["kind"], score: number, targetId?: string) => ({ intent: { kind, targetId, x: 0, z: 0, speed: 1, remaining: 5 } as Omit<Intent, "arrived">, score });

test("infatuation is intense and short, then settles into attachment when returned", () => {
  const a = person("A", 1, 0, 0, 8, "m"), b = person("B", 2, 3, 0, 8, "f");
  fond(a, b, 0.8);
  fond(b, a, 0.8);
  const w = world([a, b]);
  const d0 = psycheOf(a).chem.dopamine;
  run(w, [a, b], 6 * 3600, 20);
  assert.ok(heartOf(a).crush, "fell for them");
  assert.ok(["infatuation", "attachment"].includes(heartOf(a).crush!.stage));
  run(w, [a, b], 4 * DAY);
  assert.equal(heartOf(a).crush?.stage, "attachment");
  assert.ok((w.tally?.infatuationsSettled ?? 0) >= 1);
  void d0;
});

test("unrequited love becomes longing and then fades", () => {
  const a = person("A", 1, 0, 0), b = person("B", 2, 3, 0, 8, "f");
  fond(a, b, 0.8);
  b.relations.set(a.id, { affinity: 0.1, trust: 0.3, familiarity: 0.8, lastTogether: 0 });
  const w = world([a, b]);
  run(w, [a, b], 6 * DAY, 60);
  assert.equal(heartOf(a).crush?.stage, "longing");
  assert.ok((w.tally?.unrequited ?? 0) >= 1);
  run(w, [a, b], 25 * DAY, 120);
  assert.equal(heartOf(a).crush, undefined);
  assert.ok((w.tally?.longingsFaded ?? 0) >= 1);
});

test("a betrayal is felt only when it is known; the first wounds, a second ends the bond and turns love bitter", () => {
  const a = person("A", 1, 0, 0, 8, "m"), b = person("B", 2, 1, 0, 8, "f"), c = person("C", 3, 70, 0, 8, "f");
  const w = world([a, b, c]);
  pairUp(w, a, b);
  fond(b, a, 0.9);
  const tr0 = b.relations.get(a.id)!.trust;
  betray(w, a, b, c); // c is 70 m away: b did not see it
  b.x = 60; // nor was b near
  const f = (w.facts ?? []).find((x) => x.text === `affair:${b.id}`)!;
  assert.ok(f);
  run(w, [a, b], 600);
  assert.equal(heartOf(b).betrayals[a.id] ?? 0, 0, "not hurt while unaware");
  tell(w, c, b, f);
  run(w, [a, b], 600);
  assert.equal(heartOf(b).betrayals[a.id], 1);
  assert.ok(b.relations.get(a.id)!.trust < tr0 - 0.3);
  assert.equal(lifeOf(b).partner, a.id, "the first may be forgiven");
  const g = witness(w, "deed", a, c, `affair:${b.id}`, true);
  tell(w, c, b, g);
  run(w, [a, b], 600);
  assert.equal(heartOf(b).betrayals[a.id], 2);
  assert.equal(lifeOf(b).partner, undefined);
  run(w, [a, b], 6 * DAY, 120);
  assert.ok((heartOf(b).hate[a.id] ?? 0) > 0.5, "love turned to hatred");
});

test("someone who loves a child steps between it and a beast, and is hurt", () => {
  const mum = person("Mum", 1, 0, 0, 8, "f"), kid = person("Kid", 2, 4, 0, 1);
  kid.mother = mum.id;
  mum.emotions = { love: 0.8 };
  mum.personality = { ...mum.personality, boldness: 1 };
  const wolf: Thing = { id: "wolf1", kind: "wolf", x: 6, z: 0, radius: 1 };
  const w = world([mum, kid], [wolf]);
  let did = false;
  for (let i = 0; i < 100 && !did; i++) did = sacrificeStep(mum, w, 4, [wolf]);
  assert.ok(did);
  assert.ok(mum.health < 1 && (mum.wound ?? 0) > 0.3);
  assert.ok(Math.hypot(wolf.x - kid.x, wolf.z - kid.z) > 20, "driven off");
  assert.equal(w.tally?.sacrifices, 1);
});

test("a bad hurt is feared after, and the risky thing is avoided; the hurt rest", () => {
  const p = person("P", 1);
  const w = world([p]);
  const before = [opt("hunt", 1), opt("rest", 0.3)];
  painBias(p, before);
  p.wound = 0.8;
  for (let i = 0; i < 400; i++) {
    w.clock! += 60;
    painStep(p, w, 60);
  }
  p.wound = 0;
  p.illness = undefined;
  for (let i = 0; i < 10; i++) painStep(p, w, 60);
  assert.ok(heartOf(p).pain.fear > 0.3 && heartOf(p).pain.chronic > 0.1);
  const after = [opt("hunt", 1), opt("rest", 0.3)];
  painBias(p, after);
  assert.ok(after[0]!.score < 1, "hunting now scores lower");
  p.wound = 0.8;
  painStep(p, w, 1);
  const hurt = [opt("rest", 0.3)];
  painBias(p, hurt);
  assert.ok(hurt[0]!.score > 0.5);
});

test("being shut out wears: alone for days hurts, company eases it; and a loved one hurt that you cannot help distresses", () => {
  const p = person("P", 1), q = person("Q", 2, 200, 0);
  const w = world([p, q]);
  run(w, [p], 3 * DAY, 60);
  assert.ok(heartOf(p).pain.alone > 0.5);
  q.x = 3;
  run(w, [p], 3 * DAY, 60);
  assert.ok(heartOf(p).pain.alone < 0.2);
  fond(p, q, 0.9);
  q.wound = 0.8;
  run(w, [p], 1 * DAY, 60);
  assert.ok(heartOf(p).pain.helpless > 0.3);
  assert.ok((p.emotions?.empathy ?? 0) > 0);
});

test("each source of joy raises joy and is recorded; a hard thing done counts for more", () => {
  const p = person("P", 1), q = person("Q", 2, 3, 0);
  const w = world([p, q]);
  const kinds: [Intent["kind"], string][] = [["look", "beauty"], ["share", "generosity"], ["pray", "ritual"], ["play", "laughter"], ["talk", "belonging"]];
  for (const [kind, src] of kinds) {
    p.emotions = {};
    heartAfter(w, p, { kind, x: 0, z: 0, speed: 1, remaining: 0, arrived: true });
    assert.ok((p.emotions?.joy ?? 0) > 0, kind);
    assert.ok((w.tally?.[`joy_${src}`] ?? 0) >= 1, src);
  }
  p.emotions = {};
  heartAfter(w, p, { kind: "hunt", x: 0, z: 0, speed: 1, remaining: 0, arrived: true });
  const easy = p.emotions?.joy ?? 0;
  p.emotions = {};
  heartAfter(w, p, { kind: "hunt", x: 0, z: 0, speed: 1, remaining: 0, arrived: true, snap: { hunger: 0.95, thirst: 0.2, cold: 0 } as any });
  assert.ok((p.emotions?.joy ?? 0) > easy);
  assert.ok((w.tally?.joy_achievement ?? 0) >= 1);
});

test("a celebration with company raises joy in all near; alone it does not happen", () => {
  const a = person("A", 1), b = person("B", 2, 5, 0), c = person("C", 3, 8, 0);
  const w = world([a, b, c]);
  celebrate(w, a, "a birth");
  assert.ok(((b.emotions?.joy ?? 0) > 0) && w.tally?.celebrations === 1);
  const lone = world([person("L", 9)]);
  celebrate(lone, lone.people[0]!, "x");
  assert.equal(lone.tally?.celebrations ?? 0, 0);
});

test("a person finds a purpose, is steadied by it, falls into crisis when it is lost, and the faithful are consoled sooner", () => {
  const mk = (faith: boolean) => {
    const p = person("P", 1, 0, 0, 8, "f"), kid = person("K", 2, 2, 0, 1);
    kid.mother = p.id;
    p.values = { ...(p.values as any), kin: 1 };
    if (faith) p.faith = { origin: "a", death: "b" } as any;
    const w = world([p, kid]);
    lifeOf(p).partner = undefined;
    for (let i = 0; i < 200 && !heartOf(p).purpose; i++) {
      w.clock! += 60;
      meaningStep(p, w, 60);
    }
    return { p, kid, w };
  };
  const { p, kid, w } = mk(false);
  assert.equal(heartOf(p).purpose?.kind, "family");
  const strain0 = (psycheOf(p).strain = 0.6);
  for (let i = 0; i < 100; i++) meaningStep(p, w, 600);
  assert.ok(psycheOf(p).strain < strain0, "purpose steadies");
  w.people.splice(w.people.indexOf(kid), 1);
  p.grief = 0.8;
  meaningStep(p, w, 60);
  assert.equal(heartOf(p).purpose, undefined);
  assert.ok((w.tally?.meaningCrises ?? 0) === 1 && heartOf(p).crisisUntil! > w.clock!);
  const ops = [opt("rest", 0.5), opt("pray", 0.2), opt("ponder", 0.2)];
  heartBias(p, w, ops);
  assert.ok(ops[1]!.score > 0.4 && ops[2]!.score > 0.5, "searches for answers");
  const f = mk(true);
  heartOf(f.p).purpose = { kind: "family", since: 0, strength: 0.5 };
  f.w.people.splice(f.w.people.indexOf(f.kid), 1);
  f.p.grief = 0.8;
  meaningStep(f.p, f.w, 60);
  const crisis0 = heartOf(f.p).crisisUntil! - f.w.clock!;
  const plain = heartOf(p).crisisUntil! - w.clock!;
  assert.ok(crisis0 < plain, "the faithful's crisis is shorter");
  const g0 = f.p.grief!;
  heartAfter(f.w, f.p, { kind: "pray", x: 0, z: 0, speed: 1, remaining: 0, arrived: true });
  assert.ok(f.p.grief! < g0, "ritual consoles");
});

test("those who love seek the beloved out; those who hate keep away", () => {
  const a = person("A", 1), b = person("B", 2, 3, 0, 8, "f"), c = person("C", 3, 5, 0);
  const w = world([a, b, c]);
  heartOf(a).crush = { on: b.id, since: 0, stage: "infatuation" };
  heartOf(a).hate[c.id] = 0.9;
  const o = [opt("talk", 0.5, b.id), opt("talk", 0.5, c.id)];
  heartBias(a, w, o);
  assert.ok(o[0]!.score > o[1]!.score + 0.5);
});
void joyFrom;
void loveStep;
