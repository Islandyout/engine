// Rules nobody wrote: a way of doing things becomes expected when it is done often where others can see, and complained about when it is not.
// A norm starts at nothing, grows each time it is seen kept (or each time someone is seen to be wronged by its breach), fades if it falls out
// of use, and once strong enough it is a custom: people feel it, hold themselves to it, and mark those who break it.
import type { Person, World } from "./mind";

export type NormId = "share" | "fair" | "tend" | "gather" | "elders" | "orphans";
export const NORM_TEXT: Record<NormId, string> = {
  share: "we share food with whoever is hungry",
  fair: "nobody takes the last of the food while another goes hungry",
  tend: "whoever finds the fire low feeds it",
  gather: "we gather at the fire at dusk",
  elders: "we look after our old",
  orphans: "we take in children who have no one",
};
export const CUSTOM_AT = 0.5;

export const strengthOf = (world: World, id: NormId) => world.norms?.[id]?.strength ?? 0;
export const isCustom = (world: World, id: NormId) => strengthOf(world, id) >= CUSTOM_AT;

// Something was done (or a wrong seen) for a norm, with others looking on; it grows more when more people saw.
export function reinforce(world: World, id: NormId, by: Person, amount: number): boolean {
  const witnesses = world.people.filter((q) => q !== by && Math.hypot(q.x - by.x, q.z - by.z) < 15).length;
  if (!witnesses) return false;
  const norms = (world.norms ??= {});
  const n = (norms[id] ??= { strength: 0 });
  n.strength = Math.min(1, n.strength + amount * Math.min(2, 0.5 + 0.5 * witnesses));
  if (n.strength >= CUSTOM_AT && !n.announced) {
    n.announced = true;
    return true; // it has just become a custom
  }
  return false;
}

// A custom unused for weeks fades.
export function fadeNorms(world: World, dt: number) {
  for (const n of Object.values(world.norms ?? {})) n.strength = Math.max(0, n.strength - dt / (60 * 1440));
}

// How much the others trust them: respected, trusted, or looked on with doubt.
export function standing(world: World, p: Person): number {
  let sum = 0;
  let count = 0;
  for (const q of world.people) {
    if (q === p) continue;
    const r = q.relations.get(p.id);
    if (r) {
      sum += r.trust;
      count++;
    }
  }
  return count ? sum / count : 0.5;
}
export const standingWord = (s: number) => (s > 0.75 ? "respected" : s > 0.5 ? "trusted" : s > 0.25 ? "not yet well known" : "distrusted");
