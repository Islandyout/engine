// Who a person is beyond five traits: what they value, what they have a gift for, what they have got good at, and the story of how they came
// to be who they are. Values and talents are given at birth (from the parents, with chance) and shape what people choose; skills grow with
// use, fade with neglect and pass from one person to another, so that who does what in a family comes out of who is good at it.
import type { Person } from "./mind";

export const SKILLS = ["forage", "fish", "hunt", "farm", "build"] as const;
export type Skill = (typeof SKILLS)[number];
export const SKILL_WORDS: Record<Skill, { doing: string; role: string }> = {
  forage: { doing: "gathering food", role: "gatherer" },
  fish: { doing: "fishing", role: "fisher" },
  hunt: { doing: "hunting", role: "hunter" },
  farm: { doing: "farming", role: "farmer" },
  build: { doing: "building", role: "builder" },
};

export const VALUES = ["kin", "fairness", "freedom", "tradition", "comfort"] as const;
export type Value = (typeof VALUES)[number];

export interface Identity {
  values: Record<Value, number>; // 0..1: what matters to them
  talents: Record<Skill, number>; // 0.6..1.4: how quickly they learn each skill
  skills: Record<Skill, number>; // 0..1: how good they are now
  story: string;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// A small seeded stream so the same seed makes the same person.
function stream(seed: number) {
  let s = (seed | 0) ^ 0x9e3779b9;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function newIdentity(seed: number, from?: [Person, Person]): Identity {
  const r = stream(seed);
  const values = {} as Record<Value, number>;
  for (const v of VALUES) {
    const base = from ? ((from[0].values?.[v] ?? 0.5) + (from[1].values?.[v] ?? 0.5)) / 2 : 0.5;
    values[v] = clamp(base + (r() - 0.5) * (from ? 0.35 : 0.9), 0, 1);
  }
  const talents = {} as Record<Skill, number>;
  const skills = {} as Record<Skill, number>;
  for (const s of SKILLS) {
    const base = from ? ((from[0].talents?.[s] ?? 1) + (from[1].talents?.[s] ?? 1)) / 2 : 1;
    talents[s] = clamp(base + (r() - 0.5) * (from ? 0.4 : 0.8), 0.6, 1.4);
    skills[s] = 0;
  }
  return { values, talents, skills, story: "" };
}

export const skillOf = (p: Person, s: Skill) => p.skills?.[s] ?? 0;
export const valueOf = (p: Person, v: Value) => p.values?.[v] ?? 0.5;

// Doing a thing makes them better at it, quickly at first and a gifted learner faster; neglect lets it fade a little.
export function practise(p: Person, s: Skill, amount = 0.03) {
  const skills = (p.skills ??= { forage: 0, fish: 0, hunt: 0, farm: 0, build: 0 });
  skills[s] = Math.min(1, skills[s] + amount * (p.talents?.[s] ?? 1) * (1 - skills[s] * 0.8));
}
export function neglect(p: Person) {
  for (const s of SKILLS) if (p.skills?.[s]) p.skills[s] *= 0.995;
}

// What they are known for: their best skill, once it is worth naming.
export function roleOf(p: Person): { skill: Skill; role: string } | undefined {
  let best: Skill | undefined;
  for (const s of SKILLS) if (skillOf(p, s) > 0.3 && skillOf(p, s) > (best ? skillOf(p, best) : 0)) best = s;
  return best ? { skill: best, role: SKILL_WORDS[best].role } : undefined;
}

// What they are drawn to do: a little extra want for what they are good at, so a family's work divides itself.
export const gift = (p: Person, s: Skill) => 0.3 * skillOf(p, s) * (p.talents?.[s] ?? 1);

// A short life story, from who raised them, what they value and how they are.
export function storyFor(p: Person, parents?: [string, string]): string {
  const t = p.personality;
  const top = [...VALUES].sort((a, b) => valueOf(p, b) - valueOf(p, a))[0]!;
  const gifted = [...SKILLS].sort((a, b) => (p.talents?.[b] ?? 1) - (p.talents?.[a] ?? 1))[0]!;
  const raised = parents ? `${p.name} was born to ${parents[0]} and ${parents[1]}.` : `${p.name} woke in the garden with no past but a feeling of belonging.`;
  const cares: Record<Value, string> = {
    kin: "Family comes before everything for them.",
    fairness: "They cannot bear to see anyone treated unfairly.",
    freedom: "They hate to be tied down and long to see what lies beyond the hills.",
    tradition: "They keep to the old ways and the places they know.",
    comfort: "They want a warm fire, a dry roof and a full larder.",
  };
  const manner = t.boldness > 0.65 ? "Bold, and quick to act." : t.boldness < 0.35 ? "Careful, and slow to trust the dark." : "Steady.";
  const hands = (p.talents?.[gifted] ?? 1) > 1.15 ? ` They have a gift for ${SKILL_WORDS[gifted].doing}.` : "";
  return `${raised} ${manner} ${cares[top]}${hands}`;
}

// Someone with a skill passes a little of it to someone who has less, more readily to their own child.
export function teach(teacher: Person, learner: Person): { skill: Skill } | undefined {
  let pick: Skill | undefined;
  for (const s of SKILLS) if (skillOf(teacher, s) > 0.35 && skillOf(teacher, s) - skillOf(learner, s) > 0.2 && skillOf(teacher, s) - skillOf(learner, s) > (pick ? skillOf(teacher, pick) - skillOf(learner, pick) : 0)) pick = s;
  if (!pick) return undefined;
  const kin = learner.mother === teacher.id || learner.father === teacher.id;
  practise(learner, pick, kin ? 0.06 : 0.035);
  return { skill: pick };
}
