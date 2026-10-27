// Eden's named places, shared by the scene builder (tools/eden/build_eden.ts) and the people's minds (edenAgents.ts), so a place is
// where the scene says it is and offers what the minds expect of it.
export const PLACES = {
  center: { x: 0, z: 0, name: "the garden center" },
  river_bend: { x: -4, z: 4, name: "the river bend" },
  grove: { x: 26, z: -16, name: "the fruit grove" },
  meadow: { x: -26, z: 18, name: "the meadow" },
  overlook: { x: 2, z: -30, name: "the overlook" },
  hollow: { x: -16, z: -8, name: "the resting hollow" },
} as const;

// The mind kind each place is (see AFFORDANCES in mind.ts).
export const PLACE_KINDS: Record<keyof typeof PLACES, string> = {
  center: "center",
  river_bend: "river",
  grove: "grove",
  meadow: "meadow",
  overlook: "overlook",
  hollow: "hollow",
};

// What the Creator can bring into the garden: the prefab's name, and the mind kind it becomes.
export const CREATABLE: [string, string][] = [
  ["Deer", "deer"],
  ["Fox", "fox"],
  ["Alpaca", "alpaca"],
  ["Oak Tree", "tree"],
  ["Pine Tree", "tree"],
  ["Bush", "bush"],
  ["Rock", "rock"],
];

// Where people stand to drink: on the bank, one metre past the water's edge (the river's centre line runs through river_bend and the
// water is RIVER_WIDTH = 5 either side in tools/eden/build_eden.ts), on the garden-center side. Standing at river_bend itself is in the water.
export const DRINK_SPOT = { x: -2.2, z: -1.7 };
