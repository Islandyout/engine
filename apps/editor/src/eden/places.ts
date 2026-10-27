// Eden's named places: shared between the scene generator (tools/eden/build_eden.ts,
// which places the terrain features and Adam & Eve at these same coordinates) and the
// runtime (edenAgents.ts, which builds mind.ts's World.things from them). One source of
// truth so the two can never drift apart the way the engine coordinates once could when
// they were duplicated by hand in both places.
//
// `kind` is one of mind.ts's own AFFORDANCES keys -- what a person can actually do there.

export interface EdenPlace {
  id: string;
  name: string;
  kind: string;
  x: number;
  z: number;
  radius: number;
  description: string;
  stand?: { x: number; z: number }; // where people stand to use it when its centre is not the place (a lake's bank)
}

export const EDEN_PLACES: Record<string, EdenPlace> = {
  center: { id: "center", name: "the garden center", kind: "center", x: 0, z: 0, radius: 3, description: "The open heart of the garden, where the two of you woke. The two landmark trees stand close by." },
  river_bend: { id: "river_bend", name: "the river bend", kind: "river", x: -4, z: 4, radius: 6, description: "Where the river curls past, clear and cold, close enough to hear from the center." },
  grove: { id: "grove", name: "the fruit grove", kind: "grove", x: 26, z: -16, radius: 13, description: "A cluster of fruit trees, their shade thick and their branches heavy." },
  meadow: { id: "meadow", name: "the meadow", kind: "meadow", x: -26, z: 18, radius: 15, description: "A wide stretch of soft grass, open to the sky." },
  overlook: { id: "overlook", name: "the overlook", kind: "overlook", x: 2, z: -30, radius: 10, description: "A low rise at the garden's edge, with a view over everything below." },
  // The wider world, past the garden: reached by walking, found by exploring.
  east_woods: { id: "east_woods", name: "the east woods", kind: "woodland", x: 105, z: -60, radius: 38, description: "Old oak woods where berries ripen and deer shelter." },
  pinewood: { id: "pinewood", name: "the pinewood", kind: "pinewood", x: 10, z: -135, radius: 42, description: "Dark pines, dry needles underfoot, wood for any fire." },
  south_meadow: { id: "south_meadow", name: "the southern meadow", kind: "meadow", x: -45, z: 125, radius: 32, description: "Long grass where horses and deer graze." },
  orchard: { id: "orchard", name: "the old orchard", kind: "orchard", x: -95, z: 70, radius: 14, description: "Fruit trees in rows, left by no one anyone remembers." },
  highlands: { id: "highlands", name: "the highlands", kind: "peak", x: -130, z: -100, radius: 62, description: "Cold stony hills with a view over the whole valley, and wolves." },
  lake: { id: "lake", name: "the lake", kind: "lake", x: 150, z: 95, radius: 30, description: "A deep still lake where the river ends.", stand: { x: 114, z: 94 } },
  hollow: { id: "hollow", name: "the resting hollow", kind: "hollow", x: -16, z: -8, radius: 8, description: "A sheltered dip in the ground, quiet and out of the wind." },
};

// The two landmark trees: scenery with a mind.ts affordance of their own (the Tree of
// Life offers a meal, the Tree of Knowledge a view), not full EDEN_PLACES entries since
// nothing paths there by name the way it does to the six places above.
export const EDEN_LANDMARKS: EdenPlace[] = [
  { id: "tree_of_life", name: "the Tree of Life", kind: "tree of life", x: 4, z: -3, radius: 2.5, description: "" },
  { id: "tree_of_knowledge", name: "the Tree of Knowledge", kind: "tree of knowledge", x: -5, z: 3, radius: 2.5, description: "" },
];

// Where people stand to drink: on the bank, one metre past the water's edge (the river's centre line runs through river_bend and the
// water is RIVER_WIDTH = 5 either side in tools/eden/build_eden.ts), on the garden-center side. Standing at river_bend itself is in the water.
export const DRINK_SPOT = { x: -2.2, z: -1.7 };

// What the Creator can bring into the garden: the prefab's name, and the mind kind it becomes (a key of AFFORDANCES in mind.ts), so a
// new deer is something Adam and Eve can actually notice.
export const CREATABLE: [string, string][] = [
  ["Deer", "deer"],
  ["Fox", "fox"],
  ["Alpaca", "alpaca"],
  ["Wolf", "wolf"],
  ["Horse", "horse"],
  ["Oak Tree", "tree"],
  ["Pine Tree", "tree"],
  ["Bush", "bush"],
  ["Fruit Tree", "fruit tree"],
  ["Rock", "rock"],
];
