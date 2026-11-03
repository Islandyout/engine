// The catalogue of what a people's tales warn of and what its false (and true) beliefs say. Plain data, no imports, so any eden module can read it
// (and none reads another's values at load time).
//
// A RULE is the lesson a tale carries; `kind` is the act it leans a listener toward (an intent kind), `when` names the experience that makes a person
// want to tell it (see learning.ts `lived`), `night` means it only bites after dark.
// A CLAIM is a belief about an act (`domain` is the intent kind trying it tests); a false one has a negative bias and is dropped when tried and found so.

export type Experience = "scare" | "hungry" | "cold" | "ill" | "grief" | "loss" | "fight" | "betrayed" | "theft" | "birth" | "flood" | "wonder" | "toil" | "kindness";

export interface RuleDef { text: string; kind: string; when: Experience; night?: boolean }
export interface ClaimDef { id: string; text: string; truth: boolean; domain: string; bias: number }

export const RULE_CATALOGUE: Record<string, RuleDef> = {
  "fire-keeps-wolves": { text: "keep the fire alive through the night and the wolves keep their distance", kind: "fire", when: "scare", night: true },
  "share-in-winter": { text: "who shares in the lean time is fed in the leaner", kind: "share", when: "hungry" },
  "wash-before-eating": { text: "wash before you eat and the fever stays away", kind: "wash", when: "ill" },
  "never-hunt-alone": { text: "hunt with a friend at your back, for the stag turns", kind: "hunt", when: "scare" },
  "store-before-snow": { text: "fill the roof before the first snow, not after", kind: "stash", when: "hungry" },
  "wood-early": { text: "gather wood while the sun is warm", kind: "gather", when: "cold" },
  "sit-with-the-dying": { text: "sit with the dying, for no one should leave alone", kind: "comfort", when: "grief" },
  "bury-the-dead": { text: "lay the dead to rest soon and sing their name", kind: "mourn", when: "grief" },
  "seed-kept-not-eaten": { text: "the seed you eat in hunger is the harvest you lose", kind: "plant", when: "hungry" },
  "fish-at-dusk": { text: "go to the river at dusk with patience", kind: "fish", when: "hungry" },
  "teach-the-young": { text: "what is not taught dies with the one who knew it", kind: "teach", when: "wonder" },
  "mend-quarrels": { text: "speak first after a quarrel, the sun should not set on it", kind: "talk", when: "fight" },
  "guest-fed-first": { text: "feed the stranger first and be known as kind", kind: "share", when: "kindness" },
  "do-not-take": { text: "what you take unasked is taken from you twice", kind: "share", when: "theft" },
  "trust-is-slow": { text: "trust is built a stone at a time and thrown down at once", kind: "talk", when: "betrayed" },
  "rest-before-hunt": { text: "rest before the long walk, a tired hunter is the prey", kind: "rest", when: "toil" },
  "wrap-the-newborn": { text: "keep the newborn warm and near the fire", kind: "warm", when: "birth" },
  "high-ground": { text: "build the roof above where the river rises", kind: "build", when: "flood" },
  "ask-the-elders": { text: "ask the elders before the new thing, then do it your way", kind: "ponder", when: "wonder" },
  "pray-in-want": { text: "give thanks at the shrine and the lean year turns", kind: "pray", when: "hungry" },
  "mark-the-berries": { text: "show the young which berries to leave, and which to take", kind: "forage", when: "ill" },
  "tend-the-sick": { text: "tend the sick with water and herbs and keep the others away", kind: "comfort", when: "ill" },
  "cloak-for-cold": { text: "sew the hide before the frost, the cold kills quietly", kind: "sew", when: "cold" },
  "keep-promises": { text: "a promise kept feeds the whole camp; a promise broken starves it", kind: "gift", when: "betrayed" },
  "share-the-kill": { text: "share the kill and the spear is welcome at every fire", kind: "share", when: "fight" },
  "walk-away-first": { text: "walk away from the hot-tempered and let the night cool them", kind: "wander", when: "fight" },
};

export const CLAIM_CATALOGUE: ClaimDef[] = [
  // false beliefs: a bad result blamed on something that had nothing to do with it
  { id: "thin-moon-hunt", text: "hunts fail under a thin moon", truth: false, domain: "hunt", bias: -0.2 },
  { id: "red-berries-bad", text: "the red berries sicken whoever picks them", truth: false, domain: "forage", bias: -0.2 },
  { id: "river-takes-lone", text: "the river takes whoever fishes alone", truth: false, domain: "fish", bias: -0.2 },
  { id: "stag-eyes-curse", text: "whoever meets a stag's eye and kills it is cursed that year", truth: false, domain: "hunt", bias: -0.2 },
  { id: "left-foot-first", text: "a hunter who steps out left-footed comes home empty", truth: false, domain: "hunt", bias: -0.15 },
  { id: "spear-wash-dulls", text: "a spear that is washed loses its bite", truth: false, domain: "hunt", bias: -0.15 },
  { id: "singing-scares-deer", text: "singing on the trail turns the deer away for good", truth: false, domain: "hunt", bias: -0.15 },
  { id: "mushrooms-ghosts", text: "the pale mushrooms are the ghosts of the dead and bring sickness", truth: false, domain: "forage", bias: -0.2 },
  { id: "low-fruit-rot", text: "fruit picked from the low branch rots the belly", truth: false, domain: "forage", bias: -0.15 },
  { id: "nuts-after-frost", text: "nuts gathered before the frost carry the frost's anger", truth: false, domain: "forage", bias: -0.15 },
  { id: "roots-dig-night", text: "roots dug in daylight are bitter and weak", truth: false, domain: "forage", bias: -0.1 },
  { id: "fish-hear-names", text: "the fish flee from anyone who speaks a name at the water", truth: false, domain: "fish", bias: -0.15 },
  { id: "full-moon-nets", text: "the full moon fills the river with spirits that tear the line", truth: false, domain: "fish", bias: -0.2 },
  { id: "wet-hand-line", text: "a wet hand on the line frightens the fish", truth: false, domain: "fish", bias: -0.1 },
  { id: "seed-spring-moon", text: "seed sown in the waxing moon always dies", truth: false, domain: "plant", bias: -0.2 },
  { id: "plant-alone", text: "a seed planted while others watch will not sprout", truth: false, domain: "plant", bias: -0.15 },
  { id: "stone-near-seed", text: "a stone left near the seed draws the frost", truth: false, domain: "plant", bias: -0.15 },
  { id: "roof-north-curse", text: "a roof faced to the north calls illness into the house", truth: false, domain: "build", bias: -0.2 },
  { id: "build-in-rain", text: "a house raised in rain will never be dry", truth: false, domain: "build", bias: -0.15 },
  { id: "cutting-oak", text: "whoever fells an old oak will not see the next spring", truth: false, domain: "build", bias: -0.2 },
  { id: "wash-in-cold-kills", text: "washing in the cold lets the fever in through the skin", truth: false, domain: "wash", bias: -0.2 },
  { id: "river-water-worms", text: "water taken at dawn is full of worms", truth: false, domain: "wash", bias: -0.15 },
  { id: "fire-spirits-wood", text: "wood from the lightning tree burns the one who carries it", truth: false, domain: "gather", bias: -0.15 },
  { id: "night-fire-eyes", text: "a fire fed at midnight draws the eyes of the dead", truth: false, domain: "fire", bias: -0.15 },
  { id: "needle-bad-luck", text: "sewing at night sews the sleeper's luck shut", truth: false, domain: "sew", bias: -0.1 },
  // true beliefs: what the world does bear out
  { id: "dusk-fish", text: "the fish bite best at dusk", truth: true, domain: "fish", bias: 0.1 },
  { id: "wash-fever", text: "washing keeps the fever away", truth: true, domain: "wash", bias: 0.1 },
  { id: "fire-wolves", text: "a fire keeps the wolves off", truth: true, domain: "fire", bias: 0.1 },
  { id: "dry-wood-burns", text: "dry wood gives the longest fire", truth: true, domain: "gather", bias: 0.1 },
  { id: "spring-seed", text: "seed sown in spring ripens before the cold", truth: true, domain: "plant", bias: 0.1 },
  { id: "stored-food-lasts", text: "food kept in the shade lasts the winter", truth: true, domain: "stash", bias: 0.1 },
  { id: "deer-at-water", text: "deer come to the water at dawn", truth: true, domain: "hunt", bias: 0.1 },
  { id: "hide-keeps-warm", text: "a hide cloak keeps the cold out", truth: true, domain: "sew", bias: 0.1 },
  { id: "sound-roof", text: "a roof set on a rise stays dry", truth: true, domain: "build", bias: 0.1 },
  { id: "ripe-is-sweet", text: "the sweet berries are safe to eat", truth: true, domain: "forage", bias: 0.1 },
];

/** Scenes a tale is set in, and how a retelling embellishes. More scenes mean fewer tales share a plot. */
export const SCENES: string[] = [
  "a hunter went out with one dog and two spears",
  "she walked three days along the river",
  "a small wolf came to the old fire",
  "an old woman kept the fire all day",
  "two brothers quarrelled over a deer",
  "the first snow fell on a small hut",
  "a child found a shining stone by the water",
  "the elders gathered at the great tree",
  "a stranger came out of the hills with one bundle",
  "the river rose in the night and took the fish traps",
  "a mother carried her child through the snow",
  "the last seed was planted on the hill",
  "a boy followed a stag past the second ridge",
  "two sisters shared one cloak through the cold",
  "the old man named every tree he passed",
  "a bird led the hunters to the water",
];
