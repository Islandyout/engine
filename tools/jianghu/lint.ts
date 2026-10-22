// The checks a quest must pass (see docs/JIANGHU_ROAD_DESIGN.md, "Quest rules"). Returns what is wrong, one line each; empty is good.
import type { Foe, Region } from "./world";
import type { Quest } from "./quests";

// A Lua pattern as the quest data uses it (anchors, %d) as a JavaScript one.
export const luaPattern = (pattern: string) => new RegExp(pattern.replace(/%d/g, "\\d"));

export function lintQuests(quests: Quest[], world: { names: Set<string>; foes: Foe[]; regions: Region[]; sources: Map<string, string>; manuals: Record<string, unknown> }): string[] {
  const errors: string[] = [];
  const err = (quest: Quest, message: string) => errors.push(`${quest.id}: ${message}`);
  const ids = new Set<string>();
  for (const quest of quests) {
    if (ids.has(quest.id)) err(quest, "duplicate quest id");
    ids.add(quest.id);
  }
  for (const quest of quests) {
    if (!world.regions.some((r) => r.id === quest.region)) err(quest, `unknown region ${quest.region}`);
    for (const need of quest.requires ?? []) if (!ids.has(need)) err(quest, `requires an unknown quest ${need}`);
    if (!world.names.has(quest.giver)) err(quest, `the giver ${quest.giver} is not in the world`);
    if (quest.board && !world.names.has(quest.board)) err(quest, `the board ${quest.board} is not in the world`);
    if (quest.reward.manual && !(quest.reward.manual in world.manuals)) err(quest, `unknown manual ${quest.reward.manual}`);

    // Steps: unique, reachable from the first, and a way to the end.
    const stepIds = new Set<string>();
    for (const step of quest.steps) {
      if (stepIds.has(step.id)) err(quest, `duplicate step ${step.id}`);
      stepIds.add(step.id);
    }
    const nextOf = (index: number): string[] => {
      const step = quest.steps[index]!;
      const out: string[] = [];
      if (step.next) out.push(step.next);
      else if (index + 1 < quest.steps.length) out.push(quest.steps[index + 1]!.id);
      for (const choice of step.talk?.choices ?? []) if (choice.next) out.push(choice.next);
      return out;
    };
    const reached = new Set<string>();
    const queue = [quest.steps[0]?.id];
    let finishes = false;
    while (queue.length) {
      const id = queue.pop();
      if (!id || reached.has(id)) continue;
      reached.add(id);
      const index = quest.steps.findIndex((s) => s.id === id);
      if (index < 0) { err(quest, `a step leads to ${id}, which does not exist`); continue; }
      const step = quest.steps[index]!;
      if (!step.next && index === quest.steps.length - 1) finishes = true;
      queue.push(...nextOf(index));
    }
    for (const step of quest.steps) if (!reached.has(step.id)) err(quest, `step ${step.id} cannot be reached`);
    if (!finishes) err(quest, "no step leads to the end");

    // What each step refers to.
    let lines = quest.offer.lines.length;
    for (const step of quest.steps) {
      if (!step.text) err(quest, `step ${step.id} has no journal text`);
      const conditions = [step.talk, step.kill, step.duel, step.reach, step.interact, step.meditate, step.have].filter((c) => c !== undefined).length;
      if (conditions !== 1) err(quest, `step ${step.id} needs exactly one condition (has ${conditions})`);
      if (step.talk) {
        lines += step.talk.lines.length;
        if (!world.names.has(step.talk.npc)) err(quest, `step ${step.id}: ${step.talk.npc} is not in the world`);
      }
      if (step.duel) {
        const foe = world.foes.find((f) => f.name === step.duel);
        if (!foe) err(quest, `step ${step.id}: no fighter called ${step.duel}`);
        else {
          if (!foe.duel) err(quest, `step ${step.id}: ${foe.name} does not duel to first yield`);
          if (foe.realm > quest.realm + 1) err(quest, `step ${step.id}: ${foe.name} is realm ${foe.realm}, too strong for a realm ${quest.realm} quest`);
        }
      }
      for (const name of step.interact ?? []) if (!world.names.has(name)) err(quest, `step ${step.id}: nothing called ${name}`);
      if (step.kill) {
        const pattern = luaPattern(step.kill.name);
        const matched = world.foes.filter((f) => pattern.test(f.name));
        if (matched.length < step.kill.n) err(quest, `step ${step.id}: asks for ${step.kill.n} of ${step.kill.name} but the world has ${matched.length}`);
        for (const foe of matched) if (foe.realm > quest.realm + 1) err(quest, `step ${step.id}: ${foe.name} is realm ${foe.realm}, too strong for a realm ${quest.realm} quest`);
        if (matched.filter((f) => f.realm >= quest.realm).length > 3) err(quest, `step ${step.id}: more than three fights at the quest's own realm`);
      }
      if (step.have) {
        const source = world.sources.get(step.have.item);
        if (!source && !quest.reward.items?.includes(step.have.item)) err(quest, `step ${step.id}: nothing in the world gives ${step.have.item}`);
        if (source && /^(drop|cache|duel):/.test(source) && !step.recover) err(quest, `step ${step.id}: ${step.have.item} comes from a single place (${source}) and the step has no recovery`);
      }
    }
    if (lines > 15) err(quest, `${lines} lines of dialogue (the most is 15)`);
  }
  return errors;
}
