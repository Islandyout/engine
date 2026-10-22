// Jianghu Road's quests, as data. Every quest is a few named steps; the Quests script (lua/quests.lua) runs them, and a test
// (apps/editor/tests/jianghuQuests.test.ts) checks them against the world (world.ts) so none can be lost or point at nothing.
//
// A step finishes when its condition is met, then the next step in the list starts (or `next` names another). Conditions:
//   talk     talk to a person: their lines show one at a time, then the choices (a choice may set a flag or name the next step)
//   kill     slay n of what a name pattern matches (Lua pattern, start-anchored with ^ if you like)
//   duel     win a duel to first yield against a person
//   reach    be within r metres of (x, z)
//   interact press E at each named thing (any order)
//   meditate qi gathered since the step began
//   have     carry n of an item (it is not taken)
// `where` is where the waypoint for the step points (only the quest being tracked shows one); `text` is the journal line.
// Lines are what people say; a quest keeps to fifteen of them (Witcher 3's own rule).
export type Choice = { text: string; next?: string; flag?: string };
export type Step = {
  id: string;
  text: string;
  where?: [number, number];
  talk?: { npc: string; lines: string[]; choices?: Choice[] };
  kill?: { name: string; n: number };
  duel?: string;
  reach?: [number, number, number];
  interact?: string[];
  meditate?: number;
  have?: { item: string; n: number };
  next?: string;
  // How to go on if the step cannot be done as it stands (the person died, the item was sold): a hint the journal shows.
  recover?: string;
};
export type Reward = { silver?: number; qi?: number; items?: string[]; manual?: string; insight?: number };
export type Quest = {
  id: string;
  name: string;
  giver: string;
  region: string;
  realm: number; // recommended realm
  kind: "tutorial" | "hunt" | "investigate" | "deliver" | "duel" | "find" | "defend";
  summary: string;
  requires?: string[]; // quests that must be finished first
  offer: { lines: string[]; accept: string; decline: string };
  steps: Step[];
  reward: Reward;
  // A person who takes the quest back up if the giver cannot be found (a notice on the board).
  board?: string;
};

export const QUESTS: Quest[] = [
  {
    id: "letter",
    name: "A Letter for Master Mei",
    giver: "Gatekeeper Jun",
    region: "cloudgate",
    realm: 1,
    kind: "tutorial",
    summary: "You came to Cloudgate with a letter. Master Mei is expected to read it.",
    offer: {
      lines: ["Another traveller with dust on their boots. Letter in your hand, is it?", "Master Mei at the Azure Cloud Hall will want it. Straight up the street, past the market."],
      accept: "Take it to her.",
      decline: "Later.",
    },
    steps: [
      { id: "mei", text: "Give the letter to Master Mei in the Azure Cloud Hall.", where: [0, -6], talk: { npc: "Master Mei", lines: ["Ah. Old Gao's hand. He wrote that you can sit still. Few can.", "Sit, then. Breathe in until your chest is full of the cloud, out until it is empty."] } },
      { id: "sit", text: "Meditate in the hall (hold N while standing still) until your qi stirs.", meditate: 15 },
      { id: "spar", text: "Win a sparring match against Disciple Fen, to first yield.", where: [-14, 8], duel: "Disciple Fen" },
      { id: "done", text: "Tell Master Mei how it went.", where: [0, -6], talk: { npc: "Master Mei", lines: ["Fen yields to nobody, and he yielded to you. Take this, and keep breathing.", "The road is wide and the wolves at the millstream are hungry. Go and be useful."] } },
    ],
    reward: { silver: 20, qi: 30, manual: "breath_of_clouds", insight: 1 },
  },
  {
    id: "wolves",
    name: "Wolves at the Millstream",
    giver: "Farmer Dao",
    region: "willow",
    realm: 1,
    kind: "hunt",
    summary: "Three wolves have been taking Farmer Dao's sheep.",
    requires: ["letter"],
    offer: { lines: ["Three of them, grey as the dusk. They took four sheep this week.", "I cannot pay much. But I can pay."], accept: "I will deal with them.", decline: "Not today." },
    steps: [
      { id: "hunt", text: "Slay the three wolves by the millstream.", where: [-120, 104], kill: { name: "^Millstream Wolf", n: 3 } },
      { id: "back", text: "Tell Farmer Dao.", where: [-90, 86], talk: { npc: "Farmer Dao", lines: ["Quiet at last. Take the silver, and the sheep's thanks."] } },
    ],
    reward: { silver: 35, qi: 25 },
  },
  {
    id: "package",
    name: "A Sealed Package",
    giver: "Merchant Lin",
    region: "cloudgate",
    realm: 1,
    kind: "deliver",
    summary: "Merchant Lin needs a sealed package carried east to Hunter Bo. It is heavier than it should be.",
    requires: ["letter"],
    offer: { lines: ["A package for Hunter Bo, at Greenhollow, east along the road. Two days' walk for a farmer, one for you.", "Do not open it. I mean it."], accept: "I will carry it.", decline: "Not now." },
    steps: [
      { id: "carry", text: "Carry the sealed package to Hunter Bo at Greenhollow Lodge, east of the city.", where: [326, -2], talk: { npc: "Hunter Bo", lines: ["From Lin? He sends iron nails in a box and calls it a package. Let me see.", "Hm. You opened it?"], choices: [{ text: "Yes. It was a list of Black Wind scouts.", flag: "opened" }, { text: "No. I only carried it.", flag: "sealed" }] } },
    ],
    reward: { silver: 30, qi: 20 },
  },
  {
    id: "graymane",
    name: "Gray Mane",
    giver: "Hunter Bo",
    region: "bamboo",
    realm: 2,
    kind: "hunt",
    summary: "An old wolf leads a pack in the bamboo. Hunter Bo has lost two dogs to it.",
    requires: ["package"],
    offer: { lines: ["Gray Mane. Big as a calf, and he knows my traps by smell.", "Take the pack down and I will give you what I take from hunters who deserve it."], accept: "I will hunt him.", decline: "Not yet." },
    steps: [
      { id: "pack", text: "Slay Gray Mane and his pack in the bamboo to the south-west of the lodge.", where: [300, -70], kill: { name: "^Gray Mane", n: 1 } },
      { id: "pelt", text: "Carry the Alpha Pelt back to Hunter Bo.", where: [326, -2], have: { item: "Alpha Pelt", n: 1 }, recover: "Gray Mane drops the pelt when he falls. If you lost it, Hunter Bo will pay for the hunt anyway." },
      { id: "turn", text: "Show Hunter Bo the pelt.", where: [326, -2], talk: { npc: "Hunter Bo", lines: ["That is the pelt. You hunt like you were born to it.", "Take these arrows. And mind the east: the Black Wind has a lookout past the old banner."] } },
    ],
    reward: { silver: 50, qi: 40, items: ["Arrow", "Arrow", "Arrow", "Arrow", "Arrow", "Arrow", "Arrow", "Arrow", "Arrow", "Arrow"] },
  },
  {
    id: "lookout",
    name: "The Lookout",
    giver: "Hunter Bo",
    region: "bamboo",
    realm: 3,
    kind: "investigate",
    summary: "The Black Wind Gang watches the road from the east side of the forest. Someone is held there.",
    requires: ["graymane"],
    offer: { lines: ["Tao the merchant went east and never came back. I found his cart's tracks, a torn banner and a cold fire.", "Look at those three. They will tell you where he is."], accept: "I will look.", decline: "Not yet." },
    steps: [
      { id: "clues", text: "Find the clues: the torn banner, the cart tracks and the cold ashes (north-east of the lodge).", where: [356, -60], interact: ["Torn banner", "Cart tracks", "Cold ashes"] },
      { id: "camp", text: "Free Captive Tao from the Black Wind lookout.", where: [372, -88], kill: { name: "^Black Wind Scout", n: 3 } },
      { id: "captain", text: "Defeat Captain Rook.", where: [384, -92], kill: { name: "^Captain Rook", n: 1 } },
      { id: "tao", text: "Cut Tao loose and bring him to Hunter Bo.", where: [372, -78], talk: { npc: "Captive Tao", lines: ["You came. They said nobody would.", "Rook kept a token in his belt. Take it, it will open doors at the Black Wind."] } },
      { id: "bo", text: "Return to Hunter Bo.", where: [326, -2], talk: { npc: "Hunter Bo", lines: ["Tao told me. The Black Wind will remember your face."] } },
    ],
    reward: { silver: 100, qi: 80, items: ["Jade Dew Pill", "Qi Elixir"] },
    board: "Cloudgate notice board",
  },
  {
    id: "lotus",
    name: "Old Lotus' Lesson",
    giver: "Old Lotus",
    region: "bamboo",
    realm: 2,
    kind: "duel",
    summary: "A hermit by the pond pours tea and asks for one lesson in return.",
    requires: ["package"],
    offer: { lines: ["You walk like someone who has been told they are strong.", "One bout, to first yield. Win and I teach you a breath. Lose and you drink more tea."], accept: "One bout.", decline: "Another day." },
    steps: [
      { id: "duel", text: "Duel Old Lotus by the pond (first to yield).", where: [250, 60], duel: "Old Lotus" },
      { id: "after", text: "Talk with Old Lotus.", where: [250, 60], talk: { npc: "Old Lotus", lines: ["Good. You do not fight like water yet. But you can hear it.", "If you want to know where the wind stops, look east of the pond where the bamboo has no sound."] } },
    ],
    reward: { qi: 60, manual: "bamboo_breeze" },
  },
  {
    id: "windstops",
    name: "Where the Wind Stops",
    giver: "Old Lotus",
    region: "bamboo",
    realm: 3,
    kind: "find",
    summary: "Old Lotus spoke of a place in the bamboo where the wind does not blow.",
    requires: ["lotus"],
    offer: { lines: ["There is a grove east of here where nothing moves. My master hid something in it.", "Go if you must. It does not like visitors."], accept: "I will find it.", decline: "Not yet." },
    steps: [
      { id: "find", text: "Find the still grove, far east of the pond in the south of the forest.", where: [392, 118], reach: [392, 118, 14] },
      { id: "stele", text: "Read the stele.", interact: ["Wind-still stele"] },
      { id: "spirits", text: "Drive off the grove's two spirits.", kill: { name: "^Grove Spirit", n: 2 } },
      { id: "cache", text: "Open the cache.", interact: ["Jade Bamboo cache"] },
    ],
    reward: { qi: 120, items: ["Jade Bamboo Sword"] },
  },
  {
    id: "barge",
    name: "Smugglers on the Barge",
    giver: "Shipwright Hui",
    region: "marches",
    realm: 3,
    kind: "hunt",
    summary: "Smugglers took Shipwright Hui's barge and use it by night.",
    offer: { lines: ["They took it from the pier in the night. They keep it at the reeds south-west.", "Three crew, and their boss, Kang. Bring the key back."], accept: "I will get it back.", decline: "Not yet." },
    steps: [
      { id: "crew", text: "Defeat the three smugglers at the reeds, south-west of the pier.", where: [-382, 92], kill: { name: "^Smuggler %d", n: 3 } },
      { id: "kang", text: "Defeat Boss Kang.", where: [-394, 96], kill: { name: "^Boss Kang", n: 1 } },
      { id: "key", text: "Take the Barge Key back to Shipwright Hui.", where: [-324, 26], have: { item: "Barge Key", n: 1 }, recover: "Kang drops the key when he falls." },
      { id: "turn", text: "Give Hui the key.", where: [-324, 26], talk: { npc: "Shipwright Hui", lines: ["My barge. My key. You have no idea what that is worth.", "Here. And come back at night when the lake is quiet."] } },
    ],
    reward: { silver: 110, qi: 70 },
  },
  {
    id: "pier",
    name: "The Silver Pier",
    giver: "Silver Hand Wei",
    region: "marches",
    realm: 3,
    kind: "duel",
    summary: "Silver Hand Wei settles things on the pier with a sword, to first yield.",
    offer: { lines: ["I do not fight for money. I fight to see who someone is.", "To first yield. Nobody dies on my pier."], accept: "Let us see.", decline: "Not now." },
    steps: [
      { id: "duel", text: "Duel Silver Hand Wei on the pier (first to yield).", where: [-350, 24], duel: "Silver Hand Wei" },
      { id: "after", text: "Talk with Wei.", where: [-350, 24], talk: { npc: "Silver Hand Wei", lines: ["Good. Honest. Take the sash; it was my master's.", "North of here, the gorge. Tell the Blood Lotus Sect that Wei remembers them."] } },
    ],
    reward: { qi: 80, silver: 40 },
  },
  {
    id: "guardian",
    name: "The Guardian's Fists",
    giver: "Shrine Keeper Yan",
    region: "peak",
    realm: 4,
    kind: "hunt",
    summary: "The Iron Fist Elder will not let anyone past the shrine. Yan wants the road open.",
    offer: {
      lines: ["Pilgrims used to climb past here. Now the Iron Fist blocks the road and calls it duty.", "His two pupils first, then him. He is strong. Come back when you are, and take your time."],
      accept: "I will clear the road.",
      decline: "I am not ready.",
    },
    steps: [
      { id: "pupils", text: "Defeat the Iron Fist's two pupils at the top of the shrine road.", where: [0, -324], kill: { name: "^Peak Acolyte", n: 2 } },
      { id: "elder", text: "Defeat the Iron Fist Elder.", where: [0, -332], kill: { name: "^Iron Fist Elder", n: 1 }, recover: "If you fall, the pupils stay beaten. Rest at the waystone and try again." },
      { id: "yan", text: "Tell Shrine Keeper Yan the road is open.", where: [10, -292], talk: { npc: "Shrine Keeper Yan", lines: ["The wind has changed. I can hear the bell again.", "Take his wraps. He would rather they were worn than kept."] } },
    ],
    reward: { silver: 140, qi: 150, items: ["Guardian's Wraps"], manual: "iron_hide" },
  },
  {
    id: "wei",
    name: "Wei Remembers",
    giver: "Silver Hand Wei",
    region: "gorge",
    realm: 5,
    kind: "duel",
    summary: "Wei asked you to tell the Blood Lotus Sect that he remembers them. They answer with a duel.",
    requires: ["pier"],
    offer: {
      lines: ["I told you to tell them. I did not say they would listen.", "Their duelist waits in the gorge hall. To first yield, always. Go if you want to know how deep this runs."],
      accept: "I will carry your message.",
      decline: "Not yet.",
    },
    steps: [
      { id: "reach", text: "Walk to the Blood Lotus hall in Crimson Maple Gorge, far to the north-west.", where: [-340, -330], reach: [-340, -330, 16] },
      { id: "duel", text: "Duel the Blood Lotus Duelist, to first yield.", where: [-330, -330], duel: "Blood Lotus Duelist" },
    ],
    reward: { qi: 200, silver: 90, manual: "lotus_step" },
  },
  {
    id: "ledger",
    name: "The Black Wind's Ledger",
    giver: "Hunter Bo",
    region: "frostfang",
    realm: 4,
    kind: "investigate",
    summary: "The Black Wind keeps accounts. Bo wants to know whose names are in them.",
    requires: ["lookout"],
    offer: {
      lines: ["Rook's token opens a door in their fortress on the ridge, north-east. There is a ledger by the gate.", "Read it, do not fight for it. The guards are better than the scouts were."],
      accept: "I will read it.",
      decline: "Not yet.",
    },
    steps: [
      { id: "walk", text: "Walk to the Black Wind fortress on Frostfang Ridge, far to the north-east.", where: [340, -350], reach: [340, -350, 26] },
      { id: "read", text: "Read the fortress ledger by the gate.", where: [334, -346], interact: ["Fortress ledger"] },
      { id: "bo", text: "Tell Hunter Bo what the ledger says.", where: [326, -2], talk: { npc: "Hunter Bo", lines: ["Three of my own neighbours, paid to look away. I thought as much.", "Take this for the cold walk. There is a tomb up on the ridge, they say, under the ice."] } },
    ],
    reward: { silver: 200, qi: 120, manual: "keen_eye" },
  },
  {
    id: "sleeper",
    name: "What Sleeps in the Valley",
    giver: "Master Mei",
    region: "bones",
    realm: 6,
    kind: "investigate",
    summary: "Master Mei wants to know what still lies in the old battlefield south-east of the city.",
    requires: ["ledger"],
    offer: {
      lines: ["The Nine Banners fell in the valley, three hundred years ago. Their general never left.", "Read what the stones say, and be careful of what answers. Do not fight the general unless you are certain."],
      accept: "I will look.",
      decline: "Not yet.",
    },
    steps: [
      { id: "walk", text: "Walk to the gate of the Sunken Valley of Bones, far to the south-east.", where: [320, 330], reach: [320, 330, 24] },
      { id: "read", text: "Read the stele, the standard and the well.", where: [320, 345], interact: ["Warlord's stele", "Battle standard", "Old well of bones"] },
      { id: "wraiths", text: "Put down the three wraiths that wake.", where: [318, 358], kill: { name: "^Bone Wraith", n: 3 } },
      { id: "warlord", text: "Face the Bone Warlord, or leave the valley and return stronger.", where: [320, 335], kill: { name: "^Bone Warlord", n: 1 }, recover: "The Warlord does not leave his ground. Rest at the Bones waystone and return when you are ready." },
      { id: "mei", text: "Tell Master Mei what slept there.", where: [0, -6], talk: { npc: "Master Mei", lines: ["The general lay down, and now he is lying still again. Good.", "There is one manual left, at the top of Heaven Peak. If you want it, you have earned the climb."] } },
    ],
    reward: { silver: 300, qi: 300, manual: "warlord_hide" },
  },
  {
    id: "last",
    name: "The Last Manual",
    giver: "Master Mei",
    region: "summit",
    realm: 7,
    kind: "find",
    summary: "At the top of Heaven Peak, past the shrine, lies the last manual.",
    requires: ["sleeper", "guardian"],
    offer: {
      lines: ["Everything I have taught you was a road to this hill.", "Climb it. Take the manual. What you become is not mine to say."],
      accept: "I will climb.",
      decline: "Not yet.",
    },
    steps: [
      { id: "climb", text: "Climb Nine-Dragon Summit, north of the Peak shrine.", where: [0, -395], reach: [0, -395, 14] },
      { id: "take", text: "Take the Nine-Dragon manual.", where: [0, -396], interact: ["Nine-Dragon manual"] },
      { id: "end", text: "Return to Master Mei.", where: [0, -6], talk: { npc: "Master Mei", lines: ["You have it. I can feel it from here.", "Then there is nothing left that I can teach you but a name. Walk the Jianghu, and be kind."] } },
    ],
    reward: { silver: 500, qi: 500, manual: "nine_dragon_breath" },
  },
];

// The passive manuals the quests can give (the Player script reads these by id): what each is, in the Character sheet's words.
export const MANUALS: Record<string, { name: string; detail: string }> = {
  breath_of_clouds: { name: "Breath of Clouds", detail: "Meditation 20% faster" },
  bamboo_breeze: { name: "Bamboo Breeze", detail: "Speed +8%, jump higher" },
  iron_hide: { name: "Iron Hide", detail: "Health +15%" },
  lotus_step: { name: "Lotus Step", detail: "Speed +6%, damage +4%" },
  keen_eye: { name: "Keen Eye", detail: "Critical hits +5%" },
  warlord_hide: { name: "Warlord's Hide", detail: "Health +20%, damage +6%" },
  nine_dragon_breath: { name: "Nine-Dragon Breath", detail: "Damage +15%, health +20%, meditation 50% faster" },
};
