// How a person is made by their childhood. A baby is held or not, fed or not, answered when it cries or not, and out of that comes how it
// attaches (secure, anxious, avoidant), how much it trusts and needs people for the rest of its life. A child learns to speak from the
// speech it hears, and if it hears none until a certain age it never speaks well. It grabs and is corrected, throws tantrums, fears the
// dark, plays at what adults do, calls things its own. Further on: apprenticeship, play-fighting, protests that it is not fair, rivalry with
// brothers and sisters, beliefs taken from parents, and an understanding of death that arrives with age.
// Ages here are in Eden years (an adult is 4); `humanYears` in psyche.ts says what that would be in a human life.
import { DAY } from "./earth";
import { feel } from "./inner";
import { practise, type Skill } from "./identity";
import { ADULT_AGE, isNight, note, rand, relation, tally, type Intent, type Person, type World } from "./mind";
import { milestone, psycheEvent, psycheOf } from "./psyche";

export type Attachment = "secure" | "anxious" | "avoidant";
export interface Dev {
  care: number; // 0..1 how well looked after as a baby (a running average)
  lapses: number; // times they were left needing while no one came
  attachment?: Attachment;
  bondDeficit?: boolean; // never bonded: the window closed
  heard: number; // words heard, those spoken to them counting more
  vocab: number;
  speechDeficit?: boolean; // the window for speech closed with little heard
  heardFrom: Record<string, string>;
  walking?: boolean;
  firstWord?: boolean;
  permanence?: boolean; // knows that what is out of sight is still there
  crying?: boolean;
  nextCry?: number;
  tantrumUntil?: number;
  nextTantrum?: number;
  rules: string[]; // what they have been taught: "ask-first", "share"
  mine?: boolean; // the stage of calling everything its own
  imaginary?: string;
  pretend: number; // times they have played at what an adult was doing
  master?: string;
  peers?: string[];
  rank?: number; // standing among the children, from play-fights
  deathConcept?: boolean; // understands that death is permanent
  protests: number;
  scraps: number;
}

// Where the stages begin, in Eden years (a human year is 0.222 of one while a child).
export const AGE = {
  weaning: 0.3,
  steps: 0.25,
  words: 0.3,
  permanence: 0.2,
  strangers: 0.15,
  infancyEnds: 0.444, // human 2
  mine: 0.55,
  dark: 0.5,
  imaginary: 0.7,
  speechWindow: 1.556, // human 7
  childhood: 1.333, // human 6
  deathConcept: 0.9, // about human 4
  adolescence: 2.667, // human 12
};
const IMAGINARY = ["Moko", "Pip", "Tuli", "Bee", "Lantern"];
const BABBLE = ["Ba.", "Da da.", "Ma.", "Goo.", "Ah!"];
const hash01 = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
};
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const dist = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);

export function devOf(p: Person): Dev {
  return (p.dev ??= { care: 0.6, lapses: 0, heard: 0, vocab: 0, heardFrom: {}, rules: [], pretend: 0, protests: 0, scraps: 0 });
}
export const vocabOf = (p: Person) => p.dev?.vocab ?? (p.age >= AGE.childhood ? 2000 : 0);
/** 0 at the start of weaning to 1 at its end: how much of their food now comes from solids and not from the breast. */
export const weaning = (age: number) => clamp01((age - AGE.weaning) / (AGE.infancyEnds - AGE.weaning));
export const attachmentOf = (p: Person): Attachment | undefined => p.dev?.attachment;

/** The one who looks after them: their mother, or another grown person near if she is gone. */
function carerOf(person: Person, world: World): Person | undefined {
  const mother = world.people.find((q) => q.id === person.mother);
  if (mother) return mother;
  let best: Person | undefined;
  let bd = 20;
  for (const q of world.people) {
    if (q === person || q.age < ADULT_AGE) continue;
    const d = dist(q.x, q.z, person.x, person.z);
    if (d < bd) (best = q), (bd = d);
  }
  return best;
}

function cry(person: Person, world: World, why: string) {
  const d = devOf(person);
  const now = world.clock ?? 0;
  if (now < (d.nextCry ?? 0)) return;
  d.nextCry = now + 18;
  person.say = person.age < AGE.words ? "Waaah!" : "I want... I want...!";
  psycheEvent(person, "threat", 0.15);
  tally(world, "cries");
  // The ones who love it hear, and it is hard to hear.
  for (const q of world.people) {
    if (q === person || q.age < ADULT_AGE || dist(q.x, q.z, person.x, person.z) > 25) continue;
    const kin = q.id === person.mother || q.id === person.father;
    if (kin) {
      feel(q, "empathy", 0.15);
      psycheEvent(q, "threat", 0.08);
    }
  }
  void why;
}

export function devStep(person: Person, world: World, dt: number) {
  if (person.age >= AGE.adolescence + 1.4) return;
  const d = devOf(person);
  const now = world.clock ?? 0;
  const carer = carerOf(person, world);
  const near = carer ? dist(carer.x, carer.z, person.x, person.z) < 3 : false;

  // ---- Infancy: being looked after ----
  if (person.age < AGE.infancyEnds) {
    const needy = person.needs.hunger > 0.55 || person.needs.social > 0.65 || person.cold > 0.35;
    const target = near && !(carer && carer.psyche?.state === "depressed" && rand(person) < 0.2) ? (needy && carer && carer.needs.hunger > 0.85 ? 0.2 : 1) : needy ? 0 : 0.7;
    d.care += (target - d.care) * (1 - Math.pow(0.5, dt / (0.5 * DAY)));
    if (needy && !near) {
      if (!d.crying) {
        d.crying = true;
        d.lapses++;
      }
      cry(person, world, "left");
    } else if (near && d.crying) {
      d.crying = false;
      person.say = "...";
      psycheEvent(person, "touch", 1); // held, and it stops
    }
    if (near && needy && carer) psycheEvent(person, "touch", 0.02 * dt);
    // What it understands as it grows.
    if (!d.permanence && person.age >= AGE.permanence) {
      d.permanence = true;
      tally(world, "permanence");
    }
    if (d.permanence && carer && dist(carer.x, carer.z, person.x, person.z) > 8) {
      feel(person, "fear", 0.04 * dt);
      cry(person, world, "missing");
    }
    if (!d.walking && person.age >= AGE.steps) {
      d.walking = true;
      if (carer) {
        note(carer, world, `${person.name} took their first steps.`);
        psycheEvent(carer, "reward", 1.2);
        milestone(carer, world, "steps", `saw ${person.name} take their first steps`);
      }
      tally(world, "firstSteps");
    }
    // Afraid of those it does not know: it hides its face and cries.
    if (person.age >= AGE.strangers) {
      for (const q of world.people) {
        if (q === person || q.age < ADULT_AGE || q === carer) continue;
        if (dist(q.x, q.z, person.x, person.z) > 4) continue;
        const r = person.relations.get(q.id);
        if (q.id === person.father || (r?.familiarity ?? 0) > 0.3) continue;
        feel(person, "fear", 0.05 * dt * (d.attachment === "anxious" ? 1.6 : 1));
        cry(person, world, "stranger");
        tally(world, "strangerFear");
        break;
      }
    }
  }
  // The end of infancy decides how they will attach.
  if (!d.attachment && person.age >= AGE.infancyEnds) {
    d.attachment = d.care > 0.62 && d.lapses <= 2 ? "secure" : d.care < 0.38 ? "avoidant" : "anxious";
    if (d.care < 0.25) d.bondDeficit = true;
    const ps = psycheOf(person);
    if (d.bondDeficit) ps.sens.oxytocin = Math.min(ps.sens.oxytocin, 0.6);
    note(person, world, d.attachment === "secure" ? "I grew up knowing someone would come." : d.attachment === "avoidant" ? "I learned not to expect anyone to come." : "I was never sure whether someone would come.");
    tally(world, `attachment_${d.attachment}`);
    milestone(person, world, "attachment", d.attachment === "secure" ? "grew up trusting that people come" : d.attachment === "avoidant" ? "learned early to need no one" : "grew up never sure of being answered");
  }
  if (person.age >= AGE.infancyEnds && !d.bondDeficit && d.attachment === "avoidant" && d.care < 0.25) d.bondDeficit = true;

  // ---- Language: learned from what is heard ----
  if (person.age < AGE.childhood + 1.5) {
    for (const q of world.people) {
      if (q === person || !q.say || dist(q.x, q.z, person.x, person.z) > 6) continue;
      if (d.heardFrom[q.id] === q.say) continue;
      d.heardFrom[q.id] = q.say;
      const words = q.say.split(/\s+/).length;
      d.heard += words * (q.intent?.targetId === person.id ? 3 : 1);
    }
    const factor = d.speechDeficit ? 0.2 : 1;
    d.vocab = Math.max(d.vocab, Math.floor(Math.min(2000, Math.pow(d.heard, 0.72) * factor)));
    if (!d.firstWord && person.age >= AGE.words && d.vocab >= 2) {
      d.firstWord = true;
      if (carer) {
        note(carer, world, `${person.name} said their first word.`);
        psycheEvent(carer, "reward", 1);
        milestone(carer, world, "word", `heard ${person.name}'s first word`);
      }
      tally(world, "firstWords");
    }
  }
  // The window for speech closes.
  if (!d.speechDeficit && person.age >= AGE.speechWindow && d.vocab < 60 && person.age < AGE.speechWindow + 0.3) {
    d.speechDeficit = true;
    note(person, world, "The words never came easily.");
    milestone(person, world, "speech", "never learned to speak well");
    tally(world, "speechDeficits");
  }

  // ---- Early childhood ----
  if (person.age >= AGE.infancyEnds && person.age < AGE.childhood) {
    // Tantrums: wanting, and not being able to bear waiting.
    const frustrated = person.needs.hunger > 0.65 || person.needs.energy > 0.85 || person.needs.social > 0.85;
    if (frustrated && now >= (d.nextTantrum ?? 0) && person.age < 1.2 && rand(person) < (dt / 300) * (0.5 + person.personality.boldness)) {
      d.nextTantrum = now + 200;
      d.tantrumUntil = now + 25;
      person.say = "No! No! NO!";
      feel(person, "anger", 0.7);
      feel(person, "shame", 0.1);
      tally(world, "tantrums");
      if (carer && dist(carer.x, carer.z, person.x, person.z) < 15) {
        feel(carer, "empathy", 0.1);
        psycheEvent(carer, "threat", 0.1);
        note(carer, world, `${person.name} screamed and threw themselves down.`);
      }
    }
    // Afraid of the dark, and of being alone in it.
    if (isNight(now) && person.age >= AGE.dark && person.age < 1.3 && !(carer && dist(carer.x, carer.z, person.x, person.z) < 8)) {
      feel(person, "fear", 0.03 * dt);
      if ((person.emotions?.fear ?? 0) > 0.3) cry(person, world, "dark");
      tally(world, "darkFears");
    }
    // The stage of "mine".
    if (!d.mine && person.age >= AGE.mine && person.age < 1.3) d.mine = true;
    if (d.mine && person.age >= 1.3) d.mine = false;
    // An imaginary friend, for some.
    if (!d.imaginary && person.age >= AGE.imaginary && person.age < 1.3 && hash01(person.id + "imagine") < 0.3) {
      d.imaginary = IMAGINARY[Math.floor(hash01(person.id + "name") * IMAGINARY.length)]!;
      note(person, world, `${d.imaginary} came to play. Only I can see them.`);
      tally(world, "imaginaryFriends");
    }
    if (d.imaginary && person.age >= 1.3) {
      note(person, world, `I do not remember where ${d.imaginary} went.`);
      d.imaginary = undefined;
    }
    if (d.imaginary && rand(person) < dt / 400) person.say = `Look, ${d.imaginary}! Look!`;
    // Hungry and an adult with food nearby: they grab, and are told off, and learn to ask.
    if (person.needs.hunger > 0.6 && now >= (d.nextTantrum ?? 0) - 150 && !d.rules.includes("ask-first")) {
      const holder = world.people.find((q) => q !== person && q.age >= ADULT_AGE && q.carry.food >= 1 && dist(q.x, q.z, person.x, person.z) < 3);
      if (holder && rand(person) < dt / 120) {
        holder.carry.food -= 1;
        person.carry.food = Math.min(8, person.carry.food + 1);
        person.say = "Mine!";
        person.needs.hunger = clamp01(person.needs.hunger - 0.3);
        // Corrected.
        feel(person, "shame", 0.5);
        d.rules.push("ask-first");
        relation(person, holder.id, world).trust = Math.max(0, relation(person, holder.id, world).trust - 0.03);
        note(holder, world, `${person.name} snatched my food. I told them to ask, and they understood.`);
        note(person, world, `I took ${holder.name}'s food and was told: ask first.`);
        tally(world, "grabs");
        tally(world, "rulesTaught");
      }
    }
    // Playing at what grown people do.
    for (const q of world.people) {
      if (q.age < ADULT_AGE || dist(q.x, q.z, person.x, person.z) > 8) continue;
      const k = q.intent?.kind;
      if (k && ["gather", "fish", "plant", "build", "craft", "forage", "fire", "wash", "create"].includes(k) && q.intent?.arrived) {
        d.pretend += dt / 20;
        const skill: Skill | undefined = k === "fish" ? "fish" : k === "plant" ? "farm" : k === "build" ? "build" : k === "forage" || k === "gather" ? "forage" : undefined;
        if (skill) practise(person, skill, 0.0006 * dt);
        break;
      }
    }
  }

  // ---- Middle childhood ----
  if (person.age >= AGE.childhood && person.age < AGE.adolescence) {
    // Sees what a grown person does well, and follows them.
    if (!d.master || !world.people.some((q) => q.id === d.master)) {
      let best: Person | undefined;
      let bs = 0.1;
      for (const q of world.people) {
        if (q.age < ADULT_AGE || dist(q.x, q.z, person.x, person.z) > 40) continue;
        const aff = person.relations.get(q.id)?.affinity ?? 0;
        const skill = Math.max(...Object.values(q.skills ?? { x: 0 }));
        const s = skill * 0.7 + 0.5 * aff + (q.id === person.mother || q.id === person.father ? 0.3 : 0);
        if (s > bs) (best = q), (bs = s);
      }
      if (best) {
        d.master = best.id;
        note(person, world, `I want to learn what ${best.name} knows.`);
        tally(world, "apprentices");
      }
    }
    const master = world.people.find((q) => q.id === d.master);
    if (master && dist(master.x, master.z, person.x, person.z) < 6 && master.intent?.arrived) {
      const k = master.intent.kind;
      const skill: Skill | undefined = k === "fish" ? "fish" : k === "plant" ? "farm" : k === "build" ? "build" : k === "hunt" ? "hunt" : k === "forage" || k === "gather" ? "forage" : k === "comfort" ? "heal" : undefined;
      if (skill) practise(person, skill, 0.003 * dt);
    }
    // Peers: others of about their age near them. They play-fight, and it settles who is strong.
    const peers = world.people.filter((q) => q !== person && q.age >= AGE.childhood - 0.5 && q.age < AGE.adolescence + 0.5 && Math.abs(q.age - person.age) < 1.2 && dist(q.x, q.z, person.x, person.z) < 4);
    if (peers.length) {
      d.peers = peers.map((q) => q.id);
      const other = peers[0]!;
      if (rand(person) < dt / 90) {
        const strength = (p: Person) => p.age + (p.psyche?.chem.testosterone ?? 0.2) * 2 + rand(p);
        const win = strength(person) >= strength(other);
        d.rank = clamp01((d.rank ?? 0.5) + (win ? 0.04 : -0.04));
        const od = devOf(other);
        od.rank = clamp01((od.rank ?? 0.5) + (win ? -0.04 : 0.04));
        d.scraps++;
        if (rand(person) < 0.15) person.wound = Math.min(1, (person.wound ?? 0) + 0.04);
        psycheEvent(person, win ? "triumph" : "defeat", 0.4);
        psycheEvent(other, win ? "defeat" : "triumph", 0.4);
        psycheEvent(person, "laughter", 0.5);
        psycheEvent(other, "laughter", 0.5);
        const r = relation(person, other.id, world);
        r.affinity = Math.min(1, r.affinity + 0.02);
        tally(world, "playFights");
      }
    }
    // Brothers and sisters, and who the parent is with.
    for (const q of world.people) {
      if (q === person || q.age >= ADULT_AGE) continue;
      if (q.mother && q.mother === person.mother && Math.abs(q.age - person.age) < 3) {
        const parent = world.people.find((x) => x.id === person.mother);
        if (parent && parent.intent?.targetId === q.id && dist(parent.x, parent.z, person.x, person.z) < 10) {
          feel(person, "jealousy", 0.015 * dt);
          const r = relation(person, q.id, world);
          r.affinity = Math.max(-1, r.affinity - 0.0008 * dt);
          tally(world, "siblingRivalry");
        }
      }
    }
    // Takes on what the parents believe.
    for (const pid of [person.mother, person.father]) {
      const parent = world.people.find((q) => q.id === pid);
      if (!parent?.faith || dist(parent.x, parent.z, person.x, person.z) > 8) continue;
      for (const [qid, tid] of Object.entries(parent.faith)) {
        if (!person.faith?.[qid] && rand(person) < dt / 500) {
          (person.faith ??= {})[qid] = tid;
          tally(world, "beliefsFromParents");
        }
      }
    }
  }
  // Death: understood or not, by age.
  if (!d.deathConcept && person.age >= AGE.deathConcept) d.deathConcept = true;
}

/** A death among those a child knows: what a small child makes of it depends on what they can understand. */
export function onDeathSeenBy(world: World, dead: Person, other: Person) {
  if (other.age >= ADULT_AGE) return;
  const d = devOf(other);
  const loved = (other.relations.get(dead.id)?.affinity ?? 0) > 0.3 || dead.id === other.mother || dead.id === other.father;
  if (!loved) return;
  if (other.age < AGE.deathConcept) {
    note(other, world, `${dead.name} is gone. I keep looking for ${dead.name}.`);
    feel(other, "longing", 0.6);
    tally(world, "childNotUnderstandingDeath");
  } else {
    d.deathConcept = true;
    note(other, world, `${dead.name} died and will not come back. I understand it now.`);
    feel(other, "despair", 0.2);
    milestone(other, world, "death", `learned that ${dead.name} would not come back`);
    tally(world, "childUnderstandingDeath");
  }
}

/** A child sees an adult give food to someone else and not to them: "it's not fair". */
export function witnessShare(world: World, giver: Person, receiver: Person) {
  for (const q of world.people) {
    if (q === giver || q === receiver || q.age >= ADULT_AGE || q.age < AGE.childhood || dist(q.x, q.z, giver.x, giver.z) > 10) continue;
    if (q.needs.hunger < 0.4) continue;
    const kin = giver.id === q.mother || giver.id === q.father;
    if (!kin && (q.relations.get(giver.id)?.affinity ?? 0) < 0.4) continue;
    const d = devOf(q);
    d.protests++;
    q.say = "That's not fair! What about me?";
    feel(q, "anger", 0.3);
    feel(q, "envy", 0.2);
    relation(q, giver.id, world).affinity -= 0.02;
    // The giver sees it and shares more evenly next time.
    if (giver.carry.food >= 1 && q.needs.hunger > 0.5) {
      giver.carry.food -= 1;
      q.carry.food = Math.min(8, q.carry.food + 1);
      q.needs.hunger = clamp01(q.needs.hunger - 0.25);
    }
    tally(world, "fairnessProtests");
  }
}

/** The small and the dependent come before the self: those who look after children go to them. */
export function devOptions(person: Person, world: World, out: { intent: Omit<Intent, "arrived">; score: number }[]) {
  const now = world.clock ?? 0;
  if (person.age >= ADULT_AGE) {
    for (const c of world.people) {
      if (c === person || c.age >= ADULT_AGE) continue;
      const mine = c.mother === person.id || c.father === person.id;
      if (!mine) continue;
      const d = c.dev;
      const away = dist(c.x, c.z, person.x, person.z);
      // A crying child is answered.
      if (d?.crying && away < 40) out.push({ intent: { kind: "comfort", targetId: c.id, x: c.x, z: c.z, speed: 2.4, remaining: 8 }, score: 1.7 });
      // A hungry child is fed first, with what they have, even when they are hungry themselves.
      if (c.needs.hunger > 0.45 && person.carry.food >= 1 && away < 40 && c.age >= AGE.weaning) {
        out.push({ intent: { kind: "share", targetId: c.id, x: c.x, z: c.z, speed: 2.4, remaining: 12 }, score: 1.4 + c.needs.hunger });
      }
      // A child that is hungry and no food in hand: the parent goes for food.
      if (c.needs.hunger > 0.5 && person.carry.food < 1) for (const o of out) if (o.intent.kind === "forage" || o.intent.kind === "fish" || o.intent.kind === "hunt" || o.intent.kind === "gather") o.score += 0.5;
      // A child alone in the dark is sat with.
      if (isNight(now) && c.age >= AGE.dark && c.age < 1.3 && away > 8 && away < 40) out.push({ intent: { kind: "wander", x: c.x, z: c.z, speed: 2.2, remaining: 4 }, score: 0.9 });
    }
  } else {
    const d = person.dev;
    // A frightened child goes to its mother.
    const mother = world.people.find((q) => q.id === person.mother);
    if (mother && (person.emotions?.fear ?? 0) > 0.25 && dist(mother.x, mother.z, person.x, person.z) > 3) out.push({ intent: { kind: "wander", x: mother.x, z: mother.z, speed: 2.4, remaining: 4 }, score: 1.5 });
    // "Mine": a child at that stage is slow to share.
    if (d?.mine) for (const o of out) if (o.intent.kind === "share" || o.intent.kind === "gift") o.score -= 0.5;
    // An apprentice goes where the one they are learning from is.
    const master = d?.master ? world.people.find((q) => q.id === d.master) : undefined;
    if (master && person.age >= AGE.childhood && dist(master.x, master.z, person.x, person.z) > 6 && dist(master.x, master.z, person.x, person.z) < 50) out.push({ intent: { kind: "wander", x: master.x, z: master.z, speed: 2, remaining: 4 }, score: 0.55 });
  }
}

/** What a child is limited to saying by the words it has. Called at the end of a step, once everything has had its say. */
export function limitSpeech(world: World) {
  for (const p of world.people) {
    if (p.age >= AGE.childhood + 1.5 || !p.say || !p.dev) continue;
    const v = p.dev.vocab;
    if (p.age >= AGE.childhood && !p.dev.speechDeficit) continue;
    if (p.dev.tantrumUntil && (world.clock ?? 0) < p.dev.tantrumUntil) continue;
    if (/^(Waaah!|\.\.\.|No! No! NO!|Mine!|Look, |That's not fair|I want\.\.\.)/.test(p.say)) continue; // crying and shouting are not words
    if (v < 3) p.say = BABBLE[Math.abs(Math.floor(hash01(p.id + p.say) * BABBLE.length)) % BABBLE.length]!;
    else if (v < 25) p.say = p.say.split(/\s+/).slice(0, 2).join(" ");
    else if (v < 80) p.say = p.say.split(/\s+/).slice(0, 5).join(" ");
  }
}

export function stageName(age: number): string {
  return age < AGE.infancyEnds ? "infant" : age < AGE.childhood ? "small child" : age < AGE.adolescence ? "child" : age < ADULT_AGE ? "adolescent" : "adult";
}
