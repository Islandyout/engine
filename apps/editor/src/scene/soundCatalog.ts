// Generated from a curated Kenney.nl CC0 1.0 subset; see assets/CREDITS.md for the
// full four-pack provenance and which original file each entry came from.
export interface SoundCatalogEntry {
  id: number;
  category: string;
  name: string;
  path: string;
}

export const soundCatalog: SoundCatalogEntry[] = [
  { id: 1, category: "ambient", name: "Engine Idle", path: "./audio/engine-idle.ogg" },
  { id: 2, category: "ambient", name: "Force Field", path: "./audio/force-field.ogg" },
  { id: 3, category: "stinger", name: "Melee Hit", path: "./audio/melee-hit.ogg" },
  { id: 4, category: "stinger", name: "Metal Hit", path: "./audio/metal-hit.ogg" },
  { id: 5, category: "stinger", name: "Explosion", path: "./audio/explosion.ogg" },
  { id: 6, category: "stinger", name: "Glass Break", path: "./audio/glass-break.ogg" },
  { id: 7, category: "stinger", name: "Bell", path: "./audio/bell.ogg" },
  { id: 8, category: "stinger", name: "Door Open", path: "./audio/door-open.ogg" },
  { id: 9, category: "stinger", name: "Door Close", path: "./audio/door-close.ogg" },
  { id: 10, category: "stinger", name: "Coin Pickup", path: "./audio/coin-pickup.ogg" },
];

export const soundCategories = [...new Set(soundCatalog.map((s) => s.category))];
