// Runs Eden's minds through many simulated lives and reports how lifelike they were: do people stay alive through the seasons, keep warm,
// keep their needs met, sleep at night, vary what they do, meet each other, run from danger, and not stand about or change their mind every
// few seconds. The lives and the limits are in apps/editor/src/eden/lifelike.ts (also run by tests/edenLives.test.ts).
//
//   cd apps/editor && npx tsx ../../tools/eden/scenarios.ts [count] [years]      (default 300 lives of 1 year, 16 sim days)
import { runLives } from "../../apps/editor/src/eden/lifelike";

const { report, problems, thrashers } = runLives(Number(process.argv[2] ?? 300), Number(process.argv[3] ?? 1));
console.log(JSON.stringify(report, null, 2));
if (thrashers.length) console.log("\nchanged their mind most: " + thrashers.map((l) => `seed ${l.seed} (${l.people} people, ${l.abandonsPerHour.toFixed(0)}/h)`).join("; "));
if (problems.length) {
  console.error("\nNOT LIFELIKE:\n- " + problems.join("\n- "));
  process.exit(1);
}
console.log("\nAll measures within what a person would do.");
