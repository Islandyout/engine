// Runs Eden's minds through many simulated lives and reports how lifelike they were: do people stay alive, keep their needs met, sleep at
// night, vary what they do, meet each other, run from danger, and not stand about or change their mind every few seconds. The lives and
// the limits are in apps/editor/src/eden/lifelike.ts (also run by tests/edenLives.test.ts).
//
//   cd apps/editor && npx tsx ../../tools/eden/scenarios.ts [count] [hours]      (default 1200 lives of 3 simulated hours, about 7 days each)
//
// Each life draws its own seed, people (1 to 4, with random personalities), garden (places moved about, food that runs out, far or near
// water) and dangers (none, a fox, a fire), so a weakness shows up somewhere. Exits 1 if any measure falls outside what a person would do.
import { runLives } from "../../apps/editor/src/eden/lifelike";

const { report, problems, thrashers } = runLives(Number(process.argv[2] ?? 1200), Number(process.argv[3] ?? 3));
console.log(JSON.stringify(report, null, 2));
if (thrashers.length) console.log("\nchanged their mind most: " + thrashers.map((l) => `seed ${l.seed} (${l.people} people, ${l.abandonsPerHour.toFixed(0)}/h)`).join("; "));
if (problems.length) {
  console.error("\nNOT LIFELIKE:\n- " + problems.join("\n- "));
  process.exit(1);
}
console.log("\nAll measures within what a person would do.");
