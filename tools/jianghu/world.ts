// Jianghu Road's world as data: the terrain's shape, the regions, the roads, and every person, fighter and thing placed in it.
// The scene builder (build_jianghu.ts) turns this into entities, the quest data (quests.ts) names things from it, and a test
// (apps/editor/tests/jianghuQuests.test.ts) checks that every name a quest uses exists here. North is -z.

export const MAP = { size: 1000, resolution: 257 };

export type Region = { id: string; name: string; tier: 1 | 2 | 3 | 4 | 5; lo: number; hi: number; circles: [number, number, number][]; text: string };
// Danger tier 1 (green) to 5 (black); lo and hi are the realms of what lives there. The smallest circle containing you names the region.
export const REGIONS: Region[] = [
  { id: "cloudgate", name: "Cloudgate", tier: 1, lo: 1, hi: 1, circles: [[0, 0, 62]], text: "The walled city at the middle of the world. Nothing hostile comes inside the wall." },
  { id: "willow", name: "Willow Plain", tier: 1, lo: 1, hi: 2, circles: [[0, 0, 200]], text: "Farms and roads round the city. Wolves at dusk, bandits on the far roads." },
  { id: "bamboo", name: "Whispering Bamboo Forest", tier: 2, lo: 2, hi: 3, circles: [[330, -10, 170]], text: "Hunters, a hermit, and a Black Wind lookout. The wind stops in one place only." },
  { id: "marches", name: "Jade Lake Marches", tier: 2, lo: 2, hi: 4, circles: [[-330, 20, 170]], text: "Port Jade and the lake. Smugglers work the water at night." },
  { id: "peak", name: "Heaven Peak", tier: 3, lo: 3, hi: 4, circles: [[0, -330, 150]], text: "The shrine road climbs to a guardian who has not forgotten his fists." },
  { id: "gorge", name: "Crimson Maple Gorge", tier: 4, lo: 4, hi: 6, circles: [[-340, -340, 130]], text: "The Blood Lotus Sect keeps the gorge. They duel anyone who looks strong." },
  { id: "frostfang", name: "Frostfang Ridge", tier: 4, lo: 4, hi: 5, circles: [[340, -350, 140]], text: "A cold plateau, a fortress of the Black Wind Gang, and a tomb of swords." },
  { id: "bones", name: "Sunken Valley of Bones", tier: 5, lo: 5, hi: 7, circles: [[320, 340, 140]], text: "An old battlefield. What sleeps here is older than the sects." },
  { id: "summit", name: "Nine-Dragon Summit", tier: 5, lo: 5, hi: 7, circles: [[0, -395, 22]], text: "The last hall. Whoever reads the last manual here is no longer a man of this world." },
];

// The hubs the roads join (x, z), and the roads between them as polylines: each is smoothed into the land.
export const HUBS = {
  cloudgate: { x: 0, z: 0 },
  greenhollow: { x: 330, z: -10 },
  portJade: { x: -330, z: 20 },
  peakShrine: { x: 0, z: -300 },
  gorgeHall: { x: -340, z: -340 },
  fortress: { x: 340, z: -350 },
  bonesGate: { x: 320, z: 330 },
};
export const ROADS: [number, number][][] = [
  [[50, 0], [120, 6], [200, -2], [270, -8], [330, -10]],
  [[-50, 0], [-120, 8], [-200, 18], [-270, 22], [-330, 20]],
  [[0, -50], [10, -120], [-6, -200], [0, -260], [0, -300]],
  [[0, 50], [30, 130], [110, 230], [220, 300], [320, 330]],
  [[-330, 20], [-340, -60], [-335, -160], [-340, -250], [-340, -340]],
  [[0, -300], [100, -330], [220, -345], [340, -350]],
];
export const PEAK = { x: 0, z: -400, height: 118, spread: 34 };
export const GATES = [
  { name: "South gate", x: 0, z: 48 },
  { name: "East gate", x: 48, z: 0 },
  { name: "West gate", x: -48, z: 0 },
  { name: "North gate", x: 0, z: -48 },
];

const segmentDistance = (x: number, z: number, a: [number, number], b: [number, number]) => {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = Math.min(1, Math.max(0, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t));
};
export const roadDistance = (x: number, z: number) => {
  let best = Infinity;
  for (const road of ROADS) for (let i = 0; i + 1 < road.length; i++) best = Math.min(best, segmentDistance(x, z, road[i]!, road[i + 1]!));
  return best;
};

// ------------------------------------------------------------------ people --
// A talker: where they stand and what they wear. What they say is in quests.ts (their `lines`) or `chatter` when they have no quest.
export type Npc = { name: string; region: string; at: [number, number]; yaw?: number; gear: string; hex?: string; female?: boolean; scale?: number; idle?: string; chatter: string; shop?: "merchant" | "alchemy" | "forge" };
export const NPCS: Npc[] = [
  { name: "Gatekeeper Jun", region: "cloudgate", at: [4, 56], yaw: Math.PI, gear: "214:#5a4a3a 216:#3a3228 217:#2a2a2a", chatter: "Keep your blade sheathed inside the wall and nobody will trouble you.", idle: "idle_rail_loop" },
  { name: "Master Mei", region: "cloudgate", at: [0, -6], yaw: 0, gear: "214:#e9e2d0 216:#d8d0bc 218:#2f7f9a 217:#2a2a30", hex: "#e2cdb4", female: true, chatter: "Breath first, then the blade.", idle: "idle_fold_arms_loop" },
  { name: "Merchant Lin", region: "cloudgate", at: [14, 10], yaw: Math.PI, gear: "214:#8a5a2a 216:#5a4430 218:#c9a24a 217:#3a2a22", chatter: "Elixirs, pills, arrows. Silver only.", shop: "merchant" },
  { name: "Farmer Dao", region: "willow", at: [-90, 86], yaw: 0.6, gear: "214:#5a7a5a 216:#4a4a3a 217:#3a2a22", chatter: "The wolves come at dusk. The mill is the nearest to them." },
  { name: "Hunter Bo", region: "bamboo", at: [326, -2], yaw: 2.4, gear: "214:#4a5a3a 216:#3a3a2a 217:#2a2a22", chatter: "A hunter's work is patience. Wolves know it too." },
  { name: "Herbalist Qiu", region: "bamboo", at: [338, -18], yaw: -1, gear: "214:#7a8a5a 216:#4a4a3a 217:#3a2a22", female: true, chatter: "Spirit herbs grow where the bamboo thins. Bring me some and I will brew." },
  { name: "Captive Tao", region: "bamboo", at: [372, -78], yaw: 1, gear: "214:#8a6a4a 216:#5a4a3a 217:#3a2a22", chatter: "They tied me here two days ago. Please." },
  { name: "Shipwright Hui", region: "marches", at: [-324, 26], yaw: 0.8, gear: "214:#3a5a7a 216:#2a3a4a 217:#2a2a2a", female: true, chatter: "A barge is a month of my life. They took it in a night." },
  { name: "Innkeeper Pan", region: "cloudgate", at: [-16, -22], yaw: 1.2, gear: "214:#8a4a3a 216:#4a3a2a 217:#2a2a22", chatter: "Rest here and the world will still be waiting in the morning." },
];

// ---------------------------------------------------------------- fighters --
// Kinds: brawler (fists), sword, spear, adept (throws qi), duelist (sword, skilled), wolf (a beast).
export type Foe = { name: string; kind: "brawler" | "sword" | "spear" | "adept" | "duelist" | "wolf"; realm: number; at: [number, number]; hp?: number; scale?: number; gear?: string; peaceful?: boolean; duel?: boolean; reward?: string; loot?: string; drop?: number; pill?: number; silver?: number; region: string; yaw?: number };
export const FOES: Foe[] = [
  // Willow Plain: the first fights, one or two at a time.
  { name: "Millstream Wolf 1", kind: "wolf", realm: 1, at: [-120, 100], region: "willow" },
  { name: "Millstream Wolf 2", kind: "wolf", realm: 1, at: [-112, 108], region: "willow" },
  { name: "Millstream Wolf 3", kind: "wolf", realm: 1, at: [-126, 112], region: "willow" },
  { name: "Roadside Bandit", kind: "brawler", realm: 1, at: [96, 14], region: "willow", silver: 8, gear: "214:#6b4a3a 216:#3a3228 217:#2a2a2a" },
  { name: "Disciple Fen", kind: "sword", realm: 1, at: [-14, 8], region: "cloudgate", peaceful: true, duel: true, reward: "Jade Charm", gear: "214:#3a6a8a 216:#e8e4d0 218:#d8c070 217:#2a2a2a" },
  // Whispering Bamboo Forest.
  { name: "Gray Mane", kind: "wolf", realm: 2, at: [300, -70], hp: 2.2, scale: 1.4, region: "bamboo", loot: "Alpha Pelt" },
  { name: "Bamboo Wolf 1", kind: "wolf", realm: 2, at: [294, -62], region: "bamboo" },
  { name: "Bamboo Wolf 2", kind: "wolf", realm: 2, at: [308, -78], region: "bamboo" },
  { name: "Black Wind Scout 1", kind: "sword", realm: 2, at: [366, -88], region: "bamboo", silver: 14, gear: "214:#2a2a34 216:#1e1e26 218:#8f1d1d 217:#1a1a1a" },
  { name: "Black Wind Scout 2", kind: "spear", realm: 2, at: [378, -84], region: "bamboo", silver: 14, gear: "214:#2a2a34 216:#1e1e26 218:#8f1d1d 217:#1a1a1a" },
  { name: "Black Wind Scout 3", kind: "adept", realm: 2, at: [372, -96], region: "bamboo", silver: 18, gear: "214:#2a2a44 216:#1e1e30 218:#8f1d1d 217:#1a1a1a" },
  { name: "Captain Rook", kind: "duelist", realm: 3, at: [384, -92], hp: 1.1, region: "bamboo", silver: 60, pill: 1, loot: "Black Wind Token", gear: "214:#3a1e1e 216:#26161a 218:#c9a24a 217:#1a1a1a" },
  { name: "Old Lotus", kind: "duelist", realm: 3, at: [250, 60], region: "bamboo", peaceful: true, duel: true, gear: "214:#8a8a7a 216:#6a6a5a 217:#4a4a3a" },
  { name: "Grove Spirit 1", kind: "adept", realm: 3, at: [388, 112], region: "bamboo", silver: 0 },
  { name: "Grove Spirit 2", kind: "adept", realm: 3, at: [396, 120], region: "bamboo", silver: 0 },
  // Jade Lake Marches.
  { name: "Smuggler 1", kind: "brawler", realm: 2, at: [-376, 84], region: "marches", silver: 12, gear: "214:#3a4a5a 216:#2a2a2a 217:#2a2a2a" },
  { name: "Smuggler 2", kind: "sword", realm: 2, at: [-388, 92], region: "marches", silver: 14, gear: "214:#3a4a5a 216:#2a2a2a 217:#2a2a2a" },
  { name: "Smuggler 3", kind: "spear", realm: 2, at: [-380, 100], region: "marches", silver: 14, gear: "214:#3a4a5a 216:#2a2a2a 217:#2a2a2a" },
  { name: "Boss Kang", kind: "duelist", realm: 3, at: [-394, 96], hp: 1.2, region: "marches", silver: 70, loot: "Barge Key", gear: "214:#1e2e3a 216:#14202a 218:#c9a24a 217:#1a1a1a" },
  { name: "Silver Hand Wei", kind: "duelist", realm: 3, at: [-300, 58], region: "marches", peaceful: true, duel: true, reward: "Silver Pier Sash", gear: "214:#5a5a6a 216:#2a2a3a 218:#c0c0d0 217:#1a1a1a" },
  // Outer regions: one dangerous thing each for now (see docs/JIANGHU_ROAD_DESIGN.md).
  { name: "Iron Fist Elder", kind: "brawler", realm: 4, at: [0, -332], hp: 1.2, scale: 1.25, region: "peak", silver: 120, pill: 1, gear: "214:#3b3b46 218:#8f1d1d 216:#26262c 217:#1a1a1a" },
  { name: "Blood Lotus Duelist", kind: "duelist", realm: 5, at: [-330, -330], region: "gorge", peaceful: true, duel: true, gear: "214:#5a1a2a 216:#2a1018 218:#c9a24a 217:#1a1a1a" },
  { name: "Frostfang Warden", kind: "spear", realm: 5, at: [338, -340], hp: 1.4, scale: 1.2, region: "frostfang", silver: 150, gear: "214:#2a3a4a 216:#1a2a3a 218:#cfe8ff 217:#1a1a1a" },
  { name: "Bone Warlord", kind: "duelist", realm: 6, at: [320, 335], hp: 1.6, scale: 1.3, region: "bones", silver: 300, pill: 2, gear: "214:#3a3a30 216:#26261e 218:#cfc8a8 217:#1a1a1a" },
];

// ------------------------------------------------------------------ things --
// What you can walk up to and press E on: a clue, a cache, a waystone, a notice board.
export type Thing = { name: string; model: string; at: [number, number]; yaw?: number; scale?: number; prompt: string; region: string; action?: "waystone" | "board"; note?: string; give?: string[]; glow?: string };
export const THINGS: Thing[] = [
  { name: "Cloudgate waystone", model: "roadside-shrine", at: [0, 38], prompt: "touch the Cloudgate waystone", region: "cloudgate", action: "waystone" },
  { name: "Greenhollow waystone", model: "roadside-shrine", at: [322, 6], prompt: "touch the Greenhollow waystone", region: "bamboo", action: "waystone" },
  { name: "Port Jade waystone", model: "roadside-shrine", at: [-322, 12], prompt: "touch the Port Jade waystone", region: "marches", action: "waystone" },
  { name: "Peak waystone", model: "roadside-shrine", at: [8, -296], prompt: "touch the Peak waystone", region: "peak", action: "waystone" },
  { name: "Cloudgate notice board", model: "notice-board", at: [-8, 40], prompt: "read the notice board", region: "cloudgate", action: "board" },
  { name: "Torn banner", model: "hall-banner", at: [356, -50], yaw: 0.5, scale: 0.8, prompt: "examine the torn banner", region: "bamboo", note: "A black wind-knot on red: the Black Wind Gang's colours. They went east." },
  { name: "Cart tracks", model: "hand-cart", at: [346, -66], yaw: 1.2, scale: 0.8, prompt: "follow the cart tracks", region: "bamboo", note: "Deep ruts, a dragged boot. A merchant's cart, taken east." },
  { name: "Cold ashes", model: "incense-burner", at: [362, -70], prompt: "sift the cold ashes", region: "bamboo", note: "A fire two days cold, and a good many boots round it. The lookout is a short way on." },
  { name: "Wind-still stele", model: "stele", at: [392, 118], scale: 1.2, prompt: "read the stele", region: "bamboo", glow: "#9ff5e8", note: "Carved: What the wind will not touch, the sword keeps. Two spirits guard the cache." },
  { name: "Jade Bamboo cache", model: "altar-table", at: [394, 124], prompt: "open the cache", region: "bamboo", give: ["Jade Bamboo Sword"], glow: "#6fe0b8", note: "A sword of living jade bamboo lies in the cache. It is yours." },
  { name: "Barge Key hook", model: "weapon-rack", at: [-326, 40], prompt: "check the hook", region: "marches" },
  { name: "Moored barge", model: "lake-pier", at: [-340, 44], yaw: 1.57, prompt: "board the barge", region: "marches" },
];

// Every name a quest may use: people, fighters, things.
export const entityNames = (): Set<string> => new Set([...NPCS.map((n) => n.name), ...FOES.map((f) => f.name), ...THINGS.map((t) => t.name)]);
// Where each item a quest asks for comes from, for the quest checks: a fighter's loot, a cache's table, a person who gives it, or a shop.
export const itemSources = (): Map<string, string> => {
  const sources = new Map<string, string>();
  for (const f of FOES) {
    for (const item of (f.loot ?? "").split("|").filter(Boolean)) sources.set(item, `drop:${f.name}`);
    if (f.reward) for (const item of f.reward.split("|")) sources.set(item, `duel:${f.name}`);
  }
  for (const t of THINGS) for (const item of t.give ?? []) sources.set(item, `cache:${t.name}`);
  for (const item of ["Qi Elixir", "Jade Dew Pill", "Arrow", "Fire Talisman", "Ward Talisman"]) sources.set(item, "shop:Merchant Lin");
  return sources;
};
