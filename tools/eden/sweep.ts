// Runs a very large number of simulated lives across every core and reports how lifelike they were, to find the rare failures and tune the
// constants. Each thread takes every Nth seed, so any life can be re-run on its own (live(seed, options)) to see what happened.
//
//   cd apps/editor && npx tsx ../../tools/eden/sweep.ts <lives> [mode] [dt]
//     mode: year   whole years, 16 sim days each (slower, finds winter-prep failures)     [default]
//           season four sim days from a random point in the year (fast, finds the rest)
//           bigyear two years
import { Worker } from "node:worker_threads";
import { createRequire } from "node:module";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { cpus } from "node:os";
import { analyse, ROW, rowToLife, type Life, type LifeOptions } from "../../apps/editor/src/eden/lifelike";

const total = Number(process.argv[2] ?? 100000);
const mode = process.argv[3] ?? "year";
const dt = Number(process.argv[4] ?? 2);
const options: LifeOptions = mode === "season" ? { days: 4, randomStart: true, dt } : mode === "bigyear" ? { years: 2, dt } : { years: 1, dt };
const years = options.days !== undefined ? options.days / 16 : (options.years ?? 1);
const threads = Number(process.env.SWEEP_THREADS ?? Math.max(1, cpus().length));
const started = Date.now();
const lives: Life[] = [];
let done = 0;
let finished = 0;

// The worker is bundled to one plain file first, so it runs on any Node without a TypeScript loader.
const esbuild = createRequire(new URL("../../apps/editor/package.json", import.meta.url))("esbuild") as typeof import("esbuild");
const workerFile = join(mkdtempSync(join(tmpdir(), "eden-sweep-")), "worker.cjs");
esbuild.buildSync({ entryPoints: [fileURLToPath(new URL("./sweep_worker.ts", import.meta.url))], bundle: true, platform: "node", format: "cjs", outfile: workerFile, logLevel: "error" });

console.log(`${total} lives, ${mode} mode, dt ${dt}, ${threads} threads`);
for (let t = 0; t < threads; t++) {
  const count = Math.floor(total / threads) + (t < total % threads ? 1 : 0);
  const worker = new Worker(workerFile, { workerData: { first: 5000 + t * 7919, count, stride: 7919 * threads, options } });
  worker.on("message", (m: { rows: Float64Array; done: number }) => {
    for (let i = 0; i < m.rows.length / ROW; i++) lives.push(rowToLife(m.rows, i * ROW));
    done = lives.length;
    if (done % 20000 < 500) console.log(`  ${done} lives (${((Date.now() - started) / 1000).toFixed(0)} s)`);
  });
  worker.on("error", (e) => {
    console.error("worker failed:", e);
    process.exit(2);
  });
  worker.on("exit", () => {
    if (++finished === threads) finish();
  });
}

function finish() {
  const { report, problems, thrashers } = analyse(lives, years, +((Date.now() - started) / 1000).toFixed(0));
  console.log(JSON.stringify(report, null, 2));
  if (thrashers.length) console.log("\nchanged their mind most: " + thrashers.map((l) => `seed ${l.seed} (${l.people} people, ${l.abandonsPerHour.toFixed(0)}/h)`).join("; "));
  if (problems.length) {
    console.error("\nNOT LIFELIKE:\n- " + problems.join("\n- "));
    process.exit(1);
  }
  console.log("\nAll measures within what a person would do.");
}
