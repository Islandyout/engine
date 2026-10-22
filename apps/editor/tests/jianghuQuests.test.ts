import assert from "node:assert/strict";
import { test } from "node:test";
import { lintQuests } from "../../../tools/jianghu/lint";
import { MANUALS, QUESTS } from "../../../tools/jianghu/quests";
import { FOES, REGIONS, entityNames, itemSources } from "../../../tools/jianghu/world";

const world = () => ({ names: entityNames(), foes: FOES, regions: REGIONS, sources: itemSources(), manuals: MANUALS });

test("every Jianghu Road quest can be finished and names only what is in the world", () => {
  assert.deepEqual(lintQuests(QUESTS, world()), []);
});

test("the quest checks catch a lost quest", () => {
  const [first] = QUESTS;
  const broken = { ...first!, steps: [...first!.steps, { id: "orphan", text: "never reached", next: "orphan", reach: [0, 0, 1] as [number, number, number] }] };
  assert.ok(lintQuests([broken, ...QUESTS.slice(1)], world()).some((e) => /cannot be reached|no step leads/.test(e)));
  const missing = { ...first!, steps: [{ id: "a", text: "x", talk: { npc: "Nobody At All", lines: ["hi"] } }] };
  assert.ok(lintQuests([missing], world()).some((e) => /not in the world/.test(e)));
  const strong = { ...QUESTS.find((q) => q.id === "wolves")!, realm: 1, steps: [{ id: "a", text: "x", kill: { name: "^Bone Warlord", n: 1 } }] };
  assert.ok(lintQuests([strong], world()).some((e) => /too strong/.test(e)));
  const loose = { ...QUESTS.find((q) => q.id === "graymane")!, steps: [{ id: "a", text: "x", have: { item: "Alpha Pelt", n: 1 } }] };
  assert.ok(lintQuests([loose], world()).some((e) => /no recovery/.test(e)));
});
