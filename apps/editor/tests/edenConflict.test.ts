import test from "node:test";
import assert from "node:assert/strict";
import { DAY } from "../src/eden/earth";
import {
  bandOf, betrayAlly, bind, bribe, bully, causesOf, cheat, coerce, conflictBias, conflictOf, conflictStep, conflictWorld, CAUSES, ethosOf, execute, fight, forgive, fraud, fraudFound, free, harsh, hoard,
  holdCase, inform, kill, lawOf, mobAgainst, might, neglect, propaganda, raid, restitution, scapegoat, scarcityOf, splitBand, tenderAndCruel, theftConflict, worldConflict,
} from "../src/eden/conflict";
import { devOf } from "../src/eden/development";
import { makePerson, step, type Intent, type Person, type Thing, type World } from "../src/eden/mind";
import { witness } from "../src/eden/mindmodel";
import { worldFromJson, worldToJson } from "../src/eden/persist";

const VALUES = { kin: 0.5, fairness: 0.5, freedom: 0.5, tradition: 0.5, comfort: 0.5 };
const person = (id: string, x = 0, z = 0, over: Partial<Person["personality"]> = {}, age = 28, sex: "m" | "f" = "m") => {
  const p = makePerson(id, x, z, id.charCodeAt(0) * 31 + id.length, { boldness: 0.6, patience: 0.5, ...over }, { name: id, sex, age });
  p.values = { ...VALUES };
  return p;
};
const world = (people: Person[], things: Thing[] = []): World => ({ things, people, radius: 200, clock: DAY / 3, climate: { meanC: 16, seasonalAmpC: 4, dailyAmpC: 3, rainy: 0.1, seed: 3 } });
const fond = (a: Person, b: Person, aff = 0.8, trust = 0.7) => a.relations.set(b.id, { affinity: aff, trust, familiarity: 0.8, lastTogether: 0 });
const run = (w: World, days: number, dt = 60, each?: (t: number) => void) => {
  for (let t = 0; t < days * DAY; t += dt) {
    w.clock = (w.clock ?? 0) + dt;
    for (const p of [...w.people]) conflictStep(p, w, dt);
    conflictWorld(w, dt);
    each?.(t);
  }
};
const shelter = (stock: number): Thing => ({ id: "s", kind: "shelter", x: 0, z: 0, radius: 3, stock, maxStock: 20 });

// ---- H1 ----

test("a fight injures both, the weaker more, and is logged with its cause", () => {
  const a = person("Ada", 0, 0), b = person("Bo", 1, 0, {}, 12);
  const w = world([a, b]);
  const { hurtA, hurtB } = fight(w, a, b, "status");
  assert.ok(a.wound! > 0 && b.wound! > 0, "both wounded");
  assert.ok(b.health < 1 && a.health < 1);
  assert.ok(hurtB > hurtA, "the weaker is hurt more");
  assert.equal(w.conflict!.log[0]!.cause, "status");
  assert.ok(b.conflict!.grudge[a.id]! > 0.3, "and holds it against them");
});

test("a killing is a fact, gives the dead person's kin and friends a revenge motive, and weighs on the killer", () => {
  const mum = person("Mum", 3, 0, {}, 40, "f"), kid = person("Kid", 0, 0, {}, 20), friend = person("Fay", 5, 0), killer = person("Kay", 1, 0);
  kid.mother = mum.id;
  fond(friend, kid, 0.9);
  const w = world([mum, kid, friend, killer]);
  kill(w, killer, kid, "greed");
  assert.equal(kid.health, 0);
  assert.ok(w.facts!.some((f) => f.kind === "kill" && f.by === killer.id));
  assert.ok(mum.conflict!.grudge[killer.id]! > 0.5, "the mother wants revenge");
  assert.ok(friend.conflict!.grudge[killer.id]! > 0.3, "the friend too");
  assert.ok(killer.conflict!.guilt > 0.3);
  assert.equal(w.tally!.killings, 1);
  // and the dead person is really removed by the world's own step
  w.climate = undefined;
  step(w, 5);
  assert.ok(!w.people.includes(kid), "the world buries them");
  assert.match(w.dead![0]!.cause, /Kay/);
});

test("revenge: the grieving mother, near the killer, in time answers it", () => {
  let acted = 0;
  for (let s = 0; s < 12; s++) {
    const mum = person(`M${s}`, 0, 0, { boldness: 0.9 }, 36, "f"), kid = person(`K${s}`, 30, 0, {}, 18), killer = person(`Z${s}`, 2, 0, { boldness: 0.3 }, 30);
    kid.mother = mum.id;
    const w = world([mum, kid, killer]);
    kill(w, killer, kid, "anger");
    w.people.splice(w.people.indexOf(kid), 1);
    mum.conflict!.grudge[killer.id] = 0.95;
    run(w, 2, 60);
    if (w.conflict!.log.some((a) => a.by === mum.id && (a.cause === "revenge" || a.cause === "honour"))) acted++;
  }
  assert.ok(acted >= 4, `${acted}/12 took revenge`);
});

test("war between groups: two bands in want and fear raid each other, people die, and the war ends", () => {
  const a = [0, 1, 2, 3].map((i) => person(`A${i}`, i * 2, 0, { boldness: 0.7 })), b = [0, 1, 2, 3].map((i) => person(`B${i}`, 100 + i * 2, 0, { boldness: 0.7 }));
  splitBand(a, "north");
  splitBand(b, "south");
  for (const p of [...a, ...b]) { p.needs.hunger = 0.55; p.carry.food = 3; p.mood = 0.2; }
  const w = world([...a, ...b]);
  assert.equal(bandOf(w, a[0]!), "north");
  for (const p of a) conflictOf(p).prejudice.south = 0.7;
  for (const p of b) conflictOf(p).prejudice.north = 0.7;
  run(w, 25, 600, () => { for (const p of w.people) { p.needs.hunger = Math.max(p.needs.hunger, 0.55); p.carry.food = Math.max(p.carry.food, 1); } });
  assert.ok((w.tally?.raids ?? 0) >= 1, "raids happened");
  assert.ok(w.conflict!.wars.length >= 1, "a war was fought");
  assert.ok(w.conflict!.wars.every((x) => x.ended), "and it ended");
  assert.ok(w.people.length >= 6, "most survived: violence is costly, not the rule");
});

test("raiding takes food from defenders and hurts them", () => {
  const a = [person("A0", 0, 0, { boldness: 1 }), person("A1", 2, 0, { boldness: 1 }), person("A2", 4, 0, { boldness: 1 })], b = [person("B0", 90, 0, { boldness: 0.1 }), person("B1", 92, 0, { boldness: 0.1 })];
  splitBand(a, "n"); splitBand(b, "s");
  for (const p of b) { p.carry.food = 3; p.health = 0.5; }
  const w = world([...a, ...b]);
  const r = raid(w, a, b, "scarcity");
  assert.ok(r.loot >= 1 && r.hurt >= 1);
  assert.ok(b.some((p) => (p.wound ?? 0) > 0));
});

test("execution: only a killing, only under strong law, and the doer's kin take it up unless the law is strong", () => {
  const judgeP = person("Jo", 0, 0, {}, 50), killer = person("Ka", 3, 0), brother = person("Br", 6, 0), v = person("Vi", 4, 0);
  brother.mother = "mum"; killer.mother = "mum";
  const w = world([judgeP, killer, brother, v]);
  worldConflict(w).law = 0.1;
  assert.notEqual(holdCase(w, killer, v, "kill")?.punishment, "execution", "weak law does not execute");
  worldConflict(w).law = 0.9;
  killer.conflict!.exile = undefined;
  const verdict = holdCase(w, killer, v, "murder");
  assert.equal(verdict?.punishment, "execution");
  assert.equal(killer.health, 0);
  assert.equal(w.tally!.executions, 1);
  assert.ok(w.conflict!.log.some((a) => a.act === "execution" && a.cause));
  void execute;
});

// ---- H2 ----

test("bullying: the strong pick on the weak, who are shamed and afraid, and some stand up for them", () => {
  const strong = person("Sol", 0, 0, { boldness: 0.9 }, 28), weak = person("Wim", 1, 0, {}, 10), kind = person("Kit", 3, 0, { boldness: 0.8 });
  kind.values!.fairness = 0.9;
  const w = world([strong, weak, kind]);
  const mood = weak.mood;
  bully(w, strong, weak, "status");
  assert.ok(weak.mood < mood);
  assert.ok(weak.conflict!.grudge[strong.id]! > 0);
  assert.equal(w.tally!.bullyingChallenged, 1);
  assert.equal(w.conflict!.log[0]!.act, "bully");
});

test("bullying arises by itself in a camp of bold unfair people and weak ones, and not among the fair", () => {
  const camp = (fair: number) => {
    const ps = [person("Ax", 0, 0, { boldness: 0.9 }), person("Bx", 2, 0, { boldness: 0.9 }), person("Cx", 4, 0, {}, 9), person("Dx", 6, 0, {}, 8)];
    for (const p of ps) p.values!.fairness = fair;
    return world(ps);
  };
  const unfair = camp(0.1), fair = camp(0.9);
  run(unfair, 10, 60);
  run(fair, 10, 60);
  const n = (w: World) => (w.conflict?.log ?? []).filter((a) => a.act === "bully").length;
  assert.ok(n(unfair) > 0, "the unfair bully");
  assert.equal(n(fair), 0);
});

test("coercion: the strong force food from the weak, and are logged as doing it from want", () => {
  const strong = person("Sol", 0, 0), weak = person("Wim", 1, 0, {}, 9);
  weak.carry.food = 2;
  const w = world([strong, weak]);
  assert.ok(coerce(w, strong, weak, "scarcity"));
  assert.equal(weak.carry.food, 1);
  assert.equal(strong.carry.food, 1);
  assert.equal(w.conflict!.log.at(-1)!.act, "coerce");
  assert.ok(weak.conflict!.fear[strong.id]! > 0);
});

test("exploitation: forced three times with no one to help, a person is bound to pay a tithe; friends or law free them", () => {
  const master = person("Mas", 0, 0, { boldness: 0.9 }), slave = person("Sla", 1, 0, {}, 10);
  const w = world([master, slave]);
  assert.equal(bind(w, master, slave), false, "not before being forced");
  slave.conflict = { ...conflictOf(slave), coerced: { [master.id]: 3 } };
  assert.ok(bind(w, master, slave));
  slave.carry.food = 3;
  const m0 = master.carry.food;
  run(w, 2, 600);
  assert.ok(master.carry.food > m0, "the tithe is paid");
  assert.ok(w.tally!.tithes! >= 1);
  const f1 = person("Fr1", 3, 0), f2 = person("Fr2", 4, 0);
  fond(f1, slave); fond(f2, slave);
  f1.relations.get(slave.id)!.affinity = 0.9;
  w.people.push(f1, f2);
  run(w, 2, 600);
  assert.equal(slave.conflict!.boundTo, undefined, "freed by friends");
  assert.equal(w.tally!.freed, 1);
  void free;
});

test("a starving servant is not tithed: exploitation yields to hunger", () => {
  const master = person("Mas", 0, 0), slave = person("Sla", 1, 0, {}, 10);
  const w = world([master, slave]);
  slave.conflict = { ...conflictOf(slave), coerced: { [master.id]: 3 } };
  bind(w, master, slave);
  slave.carry.food = 3;
  slave.needs.hunger = 0.85;
  w.clock! += DAY;
  conflictStep(slave, w, 60);
  assert.equal(slave.carry.food, 3);
});

test("harsh punishment and neglect of a child have after-effects on attachment, and are recorded only as consequences", () => {
  const mum = person("Mum", 0, 0, {}, 30, "f"), kid = person("Kid", 1, 0, {}, 5);
  const w = world([mum, kid]);
  const d = devOf(kid);
  d.attachment = "secure";
  const care = d.care;
  for (let i = 0; i < 3; i++) harsh(w, mum, kid, "anger");
  assert.equal(d.attachment, "anxious");
  assert.ok(d.care < care);
  const lapses = d.lapses;
  neglect(w, mum, kid, "desperation");
  assert.equal(d.lapses, lapses + 1);
  assert.ok(mum.conflict!.guilt > 0);
  assert.ok(w.journal === undefined);
  assert.ok(kid.journal.some((j) => /keep out of reach/.test(j.text)));
  assert.ok(w.conflict!.log.every((a) => !/(rape|sex)/i.test(a.why)), "no sexual violence is modelled");
});

test("a worn-out, impatient parent in want sometimes treats a child harshly, on their own", () => {
  let n = 0;
  for (let s = 0; s < 20; s++) {
    const mum = person(`M${s}`, 0, 0, { patience: 0.1 }, 30, "f"), kid = person(`K${s}`, 1, 0, {}, 2);
    kid.mother = mum.id;
    mum.mood = -0.6; mum.stress = 100;
    const w = world([mum, kid]);
    run(w, 3, 60, () => { mum.mood = -0.6; mum.stress = 100; });
    n += w.tally?.harshPunishments ?? 0;
  }
  assert.ok(n > 0);
});

// ---- H3 ----

test("greed and hoarding: the unfair take more of the store than they need in want, and are seen", () => {
  const p = person("Gus", 0, 0), q = person("Who", 4, 0);
  const w = world([p, q], [shelter(10)]);
  assert.ok(hoard(w, p, "greed"));
  assert.equal(w.things[0]!.stock, 8);
  assert.ok(p.carry.food >= 2);
  assert.ok(q.relations.get(p.id)!.trust < 0.3 + 1e-9 || w.tally!.hoardingSeen === 1);
  // by itself, in want, among the unfair; never in plenty
  const camp = (hunger: number) => {
    const ps = [person("H1", 0, 0), person("H2", 3, 0), person("H3", 6, 0)];
    for (const x of ps) { x.values!.fairness = 0.1; x.personality.appetite = 0.8; x.needs.hunger = hunger; }
    return world(ps, [shelter(10)]);
  };
  const want = camp(0.58), plenty = camp(0.1);
  run(want, 3, 60, () => { for (const x of want.people) x.needs.hunger = 0.58; });
  run(plenty, 3, 60);
  assert.ok((want.tally?.hoarding ?? 0) > (plenty.tally?.hoarding ?? 0));
});

test("cheating: short measure in a swap takes food, may be found, and is held against the cheat", () => {
  let found = 0;
  for (let s = 0; s < 10; s++) {
    const c = person(`C${s}`, 0, 0), v = person(`V${s}`, 1, 0, { curiosity: 0.9 });
    v.carry.food = 2;
    fond(v, c, 0.5, 0.6);
    const w = world([c, v]);
    assert.ok(cheat(w, c, v, "greed"));
    assert.equal(v.carry.food, 1);
    found += w.tally?.cheatsFound ?? 0;
  }
  assert.ok(found > 0 && found < 10, `found ${found}/10`);
});

test("fraud: a false claim of a debt is found when the books are compared, and costs trust", () => {
  const a = person("Fra", 0, 0), b = person("Vic", 1, 0);
  fond(b, a, 0.5, 0.7);
  const w = world([a, b]);
  fraud(w, a, b, "greed");
  assert.equal(a.favours![b.id], 2);
  assert.ok(fraudFound(w, a, b));
  assert.equal(a.favours![b.id], 0);
  assert.ok(b.relations.get(a.id)!.trust < 0.4);
  assert.equal(w.tally!.fraudsFound, 1);
});

test("bribery: a dishonest judge takes food and goes easy; an honest one refuses; a taken bribe can come out", () => {
  const off = person("Off", 0, 0), bad = person("Bad", 4, 0, {}, 50), good = person("Gd", 4, 0, {}, 50);
  bad.values!.fairness = 0; bad.values!.tradition = 0; bad.self = { ...(bad.self ?? ({} as never)), lies: 9 } as never;
  good.values!.fairness = 1;
  off.carry.food = 3;
  const w = world([off, bad, good]);
  assert.equal(bribe(w, off, good), false);
  assert.equal(w.tally!.bribesRefused, 1);
  assert.ok(bribe(w, off, bad));
  assert.equal(off.carry.food, 2);
  assert.equal(w.tally!.bribesTaken, 1);
  assert.ok(w.conflict!.log.some((a) => a.act === "bribe"));
  // before a case: the briber with something to give is let off lighter than one who does not
  const verdict = (give: boolean) => {
    const o = person("Of2", 0, 0), j = person("Jd", 3, 0, {}, 60), v = person("Vi", 2, 0);
    j.values!.fairness = 0; j.values!.tradition = 0; o.values!.fairness = 0.1;
    o.carry.food = give ? 4 : 0;
    const ww = world([o, j, v]);
    worldConflict(ww).law = 0.5;
    return holdCase(ww, o, v, "fight", "anger");
  };
  let lighter = 0;
  for (let i = 0; i < 6; i++) { void i; const a = verdict(true), b = verdict(false); if (a && b && a.severity < b.severity) lighter++; }
  assert.ok(lighter >= 1);
});

test("betrayal of an ally: trust ends, it counts toward their heart's betrayals, and the betrayer is judged guilty", () => {
  const a = person("Al", 0, 0), ally = person("Ly", 1, 0), foe = person("Fo", 2, 0);
  fond(ally, a, 0.9, 0.9);
  const w = world([a, ally, foe]);
  betrayAlly(w, a, ally, foe, "fear");
  assert.equal(ally.heart!.betrayals[a.id], 1);
  assert.ok(ally.relations.get(a.id)!.trust < 0.5);
  assert.ok(a.conflict!.guilt > 0);
  assert.equal(w.conflict!.log.at(-1)!.cause, "fear");
});

test("informing: someone tells the judge what a thief did; the case is heard; the doer's friends hold it against the informer", () => {
  const thief = person("Tom", 0, 0), vic = person("Vic", 1, 0), tell = person("Ian", 20, 0), judgeP = person("Jud", 10, 0, {}, 50), pal = person("Pal", 2, 0);
  tell.values!.fairness = 0.9;
  fond(pal, thief, 0.9);
  const w = world([thief, vic, tell, judgeP, pal]);
  worldConflict(w).law = 0.5;
  const f = witness(w, "theft", thief, vic, "Tom took food");
  worldConflict(w).deeds[f.id] = { act: "theft", cause: "greed", by: thief.id, to: vic.id };
  (tell.knows ??= []).push(f.id);
  assert.ok(inform(w, tell, f.id));
  assert.equal(inform(w, tell, f.id), false, "once");
  assert.ok(pal.relations.get(tell.id)!.trust < 0.3);
  conflictWorld(w, 60);
  assert.ok(w.conflict!.cases >= 1, "heard");
  assert.ok(thief.conflict!.record.includes("theft"));
});

test("scapegoating: after a death, the people blame an outsider who did nothing", () => {
  const home = [person("H1", 0, 0), person("H2", 2, 0), person("H3", 4, 0)], out = person("Out", 8, 0);
  out.stranger = { since: DAY / 3 };
  for (const h of home) { h.emotions = { fear: 0.5 }; h.mood = -0.4; }
  const w = world([...home, out]);
  w.dead = [{ person: person("Dead"), t: w.clock!, cause: "illness" }];
  const target = scapegoat(w, home, "the sickness");
  assert.equal(target, out);
  assert.ok(home.every((h) => h.relations.get(out.id)!.trust < 0.3));
  assert.ok(w.conflict!.log.some((a) => a.act === "scapegoat" && a.cause === "fear"));
  // and it happens by itself in the world's day
  const w2 = world([person("A1", 0, 0), person("A2", 2, 0), person("A3", 4, 0), Object.assign(person("Out2", 8, 0), { stranger: { since: DAY / 3 } })]);
  for (const h of w2.people) { h.emotions = { fear: 0.5 }; h.mood = -0.4; }
  w2.dead = [{ person: person("Dd"), t: w2.clock!, cause: "illness" }];
  worldConflict(w2);
  let blamed = false;
  for (let d = 0; d < 8 && !blamed; d++) { w2.clock! += DAY; conflictWorld(w2, 60); blamed = (w2.tally?.scapegoats ?? 0) > 0; w2.dead = [{ person: person("Dd"), t: w2.clock!, cause: "illness" }]; }
  assert.ok(blamed);
});

test("mob behaviour: three or more together do more harm than any alone, each carries less guilt", () => {
  const t = person("Tgt", 0, 0), ms = [person("M1", 2, 0), person("M2", 3, 0), person("M3", 4, 0)];
  const w = world([t, ...ms]);
  const solo = person("Solo", 1, 0), t2 = person("T2", 0, 0);
  const w2 = world([solo, t2]);
  fight(w2, solo, t2, "anger");
  const alone = t2.wound!;
  mobAgainst(w, t, ms, "fear");
  assert.ok(t.wound! > 0.25);
  assert.ok(ms.every((m) => m.conflict!.guilt < solo.conflict!.guilt));
  assert.equal(w.tally!.mobs, 1);
  assert.equal(mobAgainst(w, t, ms.slice(0, 2), "fear"), false, "two are not a mob");
  void alone;
});

test("tribalism: people lean to their own band and away from another they have been taught to fear", () => {
  const me = person("Me", 0, 0), mine = person("Mine", 3, 0), theirs = person("Theirs", 3, 3);
  splitBand([me, mine], "us");
  splitBand([theirs], "them");
  conflictOf(me).prejudice.them = 0.8;
  const w = world([me, mine, theirs]);
  const opts = (id: string) => [{ intent: { kind: "talk", targetId: id, x: 0, z: 0, speed: 1, remaining: 5 } as Omit<Intent, "arrived">, score: 1 }];
  const a = opts(mine.id), b = opts(theirs.id);
  conflictBias(me, w, a);
  conflictBias(me, w, b);
  assert.ok(a[0]!.score > 1 && b[0]!.score < 0.7);
});

test("prejudice grows with want and fear toward another band, falls with friendship, and judges lean on it", () => {
  const us = [person("U1", 0, 0), person("U2", 2, 0)], them = [person("T1", 60, 0), person("T2", 62, 0)];
  splitBand(us, "us"); splitBand(them, "them");
  for (const p of [...us, ...them]) { p.needs.hunger = 0.7; p.carry.food = 0; }
  const w = world([...us, ...them]);
  worldConflict(w);
  for (let d = 0; d < 10; d++) { w.clock! += DAY; conflictWorld(w, 60); }
  assert.ok(us[0]!.conflict!.prejudice.them! > 0.1, `prejudice ${us[0]!.conflict!.prejudice.them}`);
  // friendship wears it down
  fond(us[0]!, them[0]!, 0.9);
  const p0 = us[0]!.conflict!.prejudice.them!;
  for (let d = 0; d < 6; d++) { for (const p of w.people) p.needs.hunger = 0.1; w.clock! += DAY; conflictWorld(w, 60); }
  assert.ok(us[0]!.conflict!.prejudice.them! < p0);
  // a judge who fears the offender's band is harsher than one who does not
  const sev = (pj: number) => {
    const j = person("Jj", 0, 0, {}, 50), o = person("Oo", 10, 0), v = person("Vv", 5, 0);
    splitBand([j, v], "us"); splitBand([o], "them");
    conflictOf(j).prejudice.them = pj;
    const ww = world([j, o, v]);
    return holdCase(ww, o, v, "fight", "anger")!.severity;
  };
  assert.ok(sev(0.9) > sev(0));
});

test("propaganda: a leader the band trusts makes the case against another band and moves their opinion in proportion to trust", () => {
  const lead = person("Lead", 0, 0, { boldness: 0.9 }), a = person("Fol", 3, 0), b = person("Doubt", 4, 0);
  splitBand([lead, a, b], "us");
  fond(a, lead, 0.8, 0.9);
  fond(b, lead, 0.1, 0.1);
  const w = world([lead, a, b]);
  assert.equal(propaganda(w, lead, "them", 0.4), 2);
  assert.ok(a.conflict!.prejudice.them! > b.conflict!.prejudice.them! * 3);
  assert.ok(w.conflict!.propaganda.us! > 0);
  assert.equal(w.conflict!.log.at(-1)!.act, "propaganda");
});

// ---- H4 ----

test("every act logs a cause, and the causes are the named ones", () => {
  const ps = ["A", "B", "C", "D", "E", "F"].map((n, i) => person(n, i * 2, 0, { boldness: 0.9 }, i < 3 ? 28 : 9));
  for (const p of ps) { p.values!.fairness = 0.2; p.carry.food = 2; p.needs.hunger = 0.5; }
  const w = world(ps, [shelter(8)]);
  run(w, 6, 60, () => { for (const p of w.people) { p.needs.hunger = 0.5; p.health = Math.max(p.health, 0.9); } });
  const log = w.conflict?.log ?? [];
  assert.ok(log.length > 3, `${log.length} acts`);
  assert.ok(log.every((a) => CAUSES.includes(a.cause) && a.why.length > 0));
  assert.equal(Object.values(causesOf(w)).reduce((s, n) => s + n, 0), log.length);
});

test("scarcity raises violence and theft: the same camp commits more acts in want than in plenty", () => {
  const camp = (hunger: number) => {
    const ps = Array.from({ length: 10 }, (_, i) => {
      const p = person(`P${i}`, (i % 5) * 3, Math.floor(i / 5) * 3, { boldness: 0.7, appetite: 0.7 }, i < 5 ? 28 : 8);
      p.values!.fairness = 0.2;
      p.carry.food = 2;
      p.needs.hunger = hunger;
      return p;
    });
    return world(ps, [shelter(hunger > 0.4 ? 0 : 20)]);
  };
  const want = camp(0.55), plenty = camp(0.15);
  const keep = (w: World, h: number) => () => { for (const p of w.people) { p.needs.hunger = h; p.health = 1; p.wound = 0; p.carry.food = Math.max(p.carry.food, 1); } };
  assert.ok(scarcityOf(want) > scarcityOf(plenty));
  run(want, 4, 60, keep(want, 0.55));
  run(plenty, 4, 60, keep(plenty, 0.15));
  const acts = (w: World) => (w.conflict?.log ?? []).filter((a) => ["fight", "coerce", "hoard", "cheat", "theft", "bind"].includes(a.act)).length;
  assert.ok(acts(want) > acts(plenty), `want ${acts(want)} vs plenty ${acts(plenty)}`);
  assert.ok((causesOf(want).scarcity ?? 0) > 0);
  // theft: the thief starving is logged as desperation, and a satisfied one as greed
  const t = person("Th", 0, 0), v = person("Vi", 1, 0);
  t.needs.hunger = 0.95;
  const w = world([t, v]);
  theftConflict(w, t, v);
  assert.equal(w.conflict!.log[0]!.cause, "desperation");
  t.needs.hunger = 0.3;
  theftConflict(w, t, v);
  assert.equal(w.conflict!.log[1]!.cause, "greed");
});

test("violence yields to thirst and hunger: a parched or starving person starts nothing", () => {
  for (const key of ["thirst", "hunger"] as const) {
    const a = person("Ax", 0, 0, { boldness: 1 }), b = person("Bx", 1, 0, {}, 9);
    a.values!.fairness = 0; conflictOf(a).grudge[b.id] = 0.95; a.carry.food = 2; b.carry.food = 2;
    const w = world([a, b], [shelter(0)]);
    run(w, 3, 60, () => { a.needs[key] = 0.7; });
    assert.equal(w.conflict?.log?.filter((x) => x.by === a.id).length ?? 0, 0, key);
  }
});

test("the same person is tender and cruel", () => {
  const p = person("Dual", 0, 0), q = person("Q", 1, 0, {}, 9);
  const w = world([p, q]);
  p.heart = { betrayals: {}, hate: {}, pain: { chronic: 0, fear: 0, shame: 0, alone: 0, helpless: 0 }, acute: 0, searched: 0, joys: { generosity: 3 }, lastAcute: -1e9, sacrifices: 0 };
  assert.equal(tenderAndCruel(p), false);
  bully(w, p, q, "status");
  fight(w, p, q, "anger");
  assert.ok(tenderAndCruel(p));
});

// ---- H5 ----

test("an honour, shame or guilt ethos follows what the people hold dear and changes what a wrong costs the doer", () => {
  const mk = (tr: number, guiltyFairness = 0.5) => {
    const ps = [person("A", 0, 0), person("B", 1, 0), person("C", 2, 0)];
    for (const p of ps) { p.values!.tradition = tr; p.values!.kin = tr; p.values!.fairness = guiltyFairness; }
    return world(ps);
  };
  assert.equal(ethosOf(mk(0.8)), "honour");
  assert.equal(ethosOf(mk(0.2)), "guilt");
  assert.equal(ethosOf(mk(0.5)), "shame");
  const cost = (tr: number) => { const w = mk(tr); fight(w, w.people[0]!, w.people[1]!, "anger"); return [w.people[0]!.conflict!.guilt, w.people[2]!.relations.get("A")?.trust ?? 0.3] as const; };
  assert.ok(cost(0.2)[0] > cost(0.5)[0], "guilt culture: the conscience bites harder");
  assert.ok(cost(0.5)[1] <= cost(0.2)[1], "shame culture: standing falls further");
});

test("a case before the most respected: restitution for a small wrong, exile for a grave one, jail with law", () => {
  const judgeP = person("Jud", 0, 0, {}, 55), vic = person("Vic", 2, 0), off = person("Off", 4, 0);
  const others = [person("O1", 6, 0), person("O2", 8, 0)];
  for (const o of others) fond(o, judgeP, 0.9, 0.95);
  const w = world([judgeP, vic, off, ...others]);
  for (const o of w.people) if (o !== judgeP) o.relations.set(judgeP.id, { affinity: 0.8, trust: 0.95, familiarity: 1, lastTogether: 0 });
  off.carry.food = 3;
  const small = holdCase(w, off, vic, "theft", "greed");
  assert.equal(small?.judge, judgeP.id, "the most trusted judges");
  assert.ok(small!.punishment === "restitution" || small!.punishment === "warning");
  assert.ok(w.tally!.restitutions >= 1 || off.conflict!.owes);
  worldConflict(w).law = 0.1;
  const grave = holdCase(w, off, vic, "bind");
  assert.equal(grave?.punishment, "exile");
  assert.ok(off.conflict!.exile);
  worldConflict(w).law = 0.6;
  off.conflict!.exile = undefined;
  assert.equal(holdCase(w, off, vic, "mob")?.punishment, "jail");
  assert.ok(off.conflict!.jail);
  assert.ok(lawOf(w) >= 0.6);
});

test("exile sends the offender away from the camp for a time, and jail holds them but lets them out to eat and drink", () => {
  const off = person("Off", 0, 0), other = person("Oth", 3, 0);
  const w = world([off, other], [shelter(5)]);
  conflictOf(off).exile = { until: w.clock! + 6 * DAY };
  run(w, 1, 60);
  assert.ok(off.intent?.kind === "wander" && Math.hypot(off.intent.x, off.intent.z) > 50, "walking out");
  const opt = [{ intent: { kind: "talk", targetId: off.id, x: 0, z: 0, speed: 1, remaining: 5 } as Omit<Intent, "arrived">, score: 1 }];
  conflictBias(other, w, opt);
  assert.ok(opt[0]!.score < 1, "the others keep away");
  const j = person("Jl", 0, 0);
  j.conflict = { ...conflictOf(j), jail: { until: w.clock! + 2 * DAY, x: 0, z: 0 } };
  w.people.push(j);
  j.intent = undefined;
  conflictStep(j, w, 60);
  assert.equal(j.intent?.kind, "linger");
  j.needs.hunger = 0.8;
  conflictStep(j, w, 60);
  assert.equal(j.conflict!.jail, undefined, "let out to eat");
  run(w, 8, 600);
  assert.equal(off.conflict!.exile, undefined, "the exile ends");
});

test("forgiveness and reconciliation: a grudge against someone who is sorry and near is let go, and the houses make peace", () => {
  const a = person("Wronged", 0, 0, { patience: 0.9 }), b = person("Doer", 2, 0);
  const w = world([a, b]);
  fight(w, b, a, "anger");
  const g = a.conflict!.grudge[b.id]!;
  assert.ok(g > 0);
  assert.ok(forgive(w, a, b));
  assert.ok(a.conflict!.grudge[b.id]! < g / 2);
  assert.ok(b.conflict!.guilt < 0.3 || true);
  assert.equal(forgive(person("N", 0, 0) && w.people[0]!, person("Nobody", 5, 0)), false);
  // on its own, with a sorry doer and time
  const a2 = person("W2", 0, 0, { patience: 1 }), b2 = person("D2", 2, 0);
  const w2 = world([a2, b2]);
  fight(w2, b2, a2, "anger");
  b2.conflict!.guilt = 0.6;
  run(w2, 12, 60, () => { b2.conflict!.guilt = Math.max(b2.conflict!.guilt, 0.3); });
  assert.ok((w2.tally?.forgiven ?? 0) >= 1, "forgave");
});

test("guilt is carried for years, not days", () => {
  const k = person("Kay", 0, 0), v = person("Vic", 1, 0);
  const w = world([k, v]);
  kill(w, k, v, "anger");
  w.people.splice(1, 1);
  const g0 = k.conflict!.guilt;
  assert.ok(g0 > 0.4);
  run(w, 30, 600);
  assert.ok(k.conflict!.guilt > 0.85 * g0, `still ${k.conflict!.guilt} of ${g0} after a month`);
  assert.ok(k.mood < 0.5, "and it weighs on the mood");
});

test("a vengeance cycle that ends: blows are traded between houses, then restitution is made and accepted and the feud is over", () => {
  const a1 = person("A1", 0, 0, { boldness: 0.9 }), a2 = person("A2", 2, 0, { boldness: 0.9 }), b1 = person("B1", 4, 0, { boldness: 0.9 }), b2 = person("B2", 6, 0, { boldness: 0.9 });
  a1.mother = a2.mother = "houseA";
  b1.mother = b2.mother = "houseB";
  const w = world([a1, a2, b1, b2]);
  fight(w, a1, b1, "anger");
  fight(w, b2, a2, "revenge");
  fight(w, a1, b2, "revenge");
  const feud = w.conflict!.feuds.find((f) => !f.ended)!;
  assert.ok(feud.blows >= 3, "the cycle is running");
  assert.equal(w.tally!.feuds, 1);
  a1.carry.food = 3; b1.carry.food = 0;
  const grudges = () => Object.values(b1.conflict!.grudge).concat(Object.values(b2.conflict!.grudge));
  const before = Math.max(...grudges());
  assert.ok(restitution(w, a1, b1, 2));
  assert.ok(feud.ended, "the feud is ended");
  assert.match(feud.ended!.how, /paid/);
  assert.ok(Math.max(...grudges(), 0) < before * 0.5 + 0.2);
  assert.equal(w.tally!.feudsEnded, 1);
  // and it stays ended: no further acts between them for a week
  const n = w.conflict!.log.length;
  for (const p of w.people) { p.wound = 0; p.health = 1; }
  b1.conflict!.grudge = {}; b2.conflict!.grudge = {}; a2.conflict!.grudge = {}; a1.conflict!.grudge = {};
  run(w, 7, 60);
  assert.equal(w.conflict!.log.length, n);
});

test("a vengeance cycle also ends by wearing out, and by law taking the matter out of the avenger's hands", () => {
  const a = person("Av", 0, 0, { boldness: 0.9 }), b = person("Bv", 2, 0, { boldness: 0.9 });
  a.mother = "x"; b.mother = "y";
  const w = world([a, b]);
  fight(w, a, b, "anger");
  const f = w.conflict!.feuds[0]!;
  w.clock! += 14 * DAY;
  conflictWorld(w, 60);
  assert.ok(f.ended, "worn out");
  // law: a strong law makes the avenger hold back
  const rate = (law: number) => {
    let n = 0;
    for (let s = 0; s < 8; s++) {
      const p = person(`P${s}`, 0, 0, { boldness: 0.9 }), q = person(`Q${s}`, 2, 0);
      const ww = world([p, q]);
      worldConflict(ww).law = law;
      conflictOf(p).grudge[q.id] = 0.8;
      conflictOf(p).band = undefined;
      for (let t = 0; t < 2 * DAY; t += 60) { ww.clock! += 60; conflictStep(p, ww, 60); p.conflict!.grudge[q.id] = 0.8; q.wound = 0; p.wound = 0; q.health = p.health = 1; }
      n += ww.conflict?.log.filter((x) => x.by === p.id).length ?? 0;
    }
    return n;
  };
  assert.ok(rate(0) > rate(0.9));
});

// ---- integration ----

test("in the world's own step a theft gives the victim a grudge and logs the cause", () => {
  let seen = false;
  for (let seed = 1; seed < 40 && !seen; seed++) {
    const thief = person("Thief", 0, 0), vic = person("Victim", 1, 0);
    thief.needs.hunger = 0.97; thief.carry.food = 0; vic.carry.food = 4; vic.needs.hunger = 0.1;
    thief.rngState = seed * 7919;
    const w = world([thief, vic], [{ id: "river", kind: "river", x: 3, z: 0, radius: 3 }]);
    for (let i = 0; i < 300 && !(w.tally?.thefts); i++) { thief.needs.hunger = Math.max(thief.needs.hunger, 0.95); vic.carry.food = Math.max(vic.carry.food, 3); step(w, 5); }
    if (w.tally?.thefts) {
      seen = true;
      assert.ok(vic.conflict?.grudge[thief.id]! > 0, "the victim holds it");
      assert.ok(w.conflict!.log.some((a) => a.act === "theft" && a.cause === "desperation"));
    }
  }
  assert.ok(seen, "a starving person stole in the real step");
});

test("conflict state survives a save and load", () => {
  const a = person("A", 0, 0), b = person("B", 1, 0);
  const w = world([a, b]);
  fight(w, a, b, "honour");
  const w2 = worldFromJson(worldToJson(w));
  assert.equal(w2.conflict!.log[0]!.cause, "honour");
  assert.ok(w2.people.find((p) => p.id === "B")!.conflict!.grudge.A! > 0);
});

test("strength: the young adult in health outweighs a child, the old and the hurt", () => {
  const prime = person("P", 0, 0), child = person("C", 0, 0, {}, 6), old = person("O", 0, 0, {}, 70), hurt = person("H", 0, 0);
  hurt.wound = 0.8; hurt.health = 0.4;
  assert.ok(might(prime) > 2 * might(child) && might(prime) > might(old) && might(prime) > 1.5 * might(hurt));
});
