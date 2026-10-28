// Runs thousands of situations through the same mind-to-motion code the page uses (eden/motion.ts) and reports the gaps: things people do with no
// motion that shows it, feelings no one could see, jumps from one pose to another, animals that glide or flicker. Each gap is a counter named
// "gap.*"; a clean run has none.
//
//   cd apps/editor && npx tsx ../../tools/eden/animflow.ts [situations]
import { Worker } from "node:worker_threads";
import { createRequire } from "node:module";
import { mkdtempSync } from "node:fs";
import { tmpdir, cpus } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const total = Number(process.argv[2] ?? 30000);
const threads = Math.max(1, cpus().length);
const esbuild = createRequire(new URL("../../apps/editor/package.json", import.meta.url))("esbuild") as typeof import("esbuild");
const workerFile = join(mkdtempSync(join(tmpdir(), "eden-animflow-")), "worker.cjs");
esbuild.buildSync({ entryPoints: [fileURLToPath(new URL("./animflow_worker.ts", import.meta.url))], bundle: true, platform: "node", format: "cjs", outfile: workerFile, logLevel: "error" });
const sum: Record<string, number> = {};
let finished = 0;
let progress = 0;
const started = Date.now();
for (let t = 0; t < threads; t++) {
  const count = Math.floor(total / threads) + (t < total % threads ? 1 : 0);
  const worker = new Worker(workerFile, { workerData: { first: 91000 + t * 31, count, stride: 31 * threads } });
  worker.on("message", (m: { progress?: number; totals?: Record<string, number> }) => {
    if (m.progress) {
      progress += m.progress;
      if (progress % 1000 === 0) console.log(`${progress}/${total} (${Math.round((Date.now() - started) / 1000)} s)`);
    }
    if (m.totals) {
      for (const [k, v] of Object.entries(m.totals)) sum[k] = (sum[k] ?? 0) + v;
      if (++finished === threads) report();
    }
  });
  worker.on("error", (e) => (console.error(e), process.exit(1)));
}

function report() {
  const keys = Object.keys(sum).sort();
  const people = sum["person.samples"] ?? 0;
  console.log(`\n${sum["situations"]} situations, ${people} person looks, ${sum["creature.samples"] ?? 0} creature looks, ${Math.round((Date.now() - started) / 1000)} s\n`);
  const show = (prefix: string, title: string) => {
    const rows = keys.filter((k) => k.startsWith(prefix));
    if (!rows.length) return console.log(`${title}: none`);
    console.log(`${title}:`);
    for (const k of rows.sort((a, b) => sum[b]! - sum[a]!).slice(0, Number(process.env.ANIMFLOW_TOP ?? 14))) console.log(`  ${k.slice(prefix.length).padEnd(52)} ${sum[k]}`);
  };
  show("gap.", "GAPS");
  show("unseen.", "unseen feelings (feeling.intent.pose)");
  show("flick.", "flicker (from>to)");
  show("clamp.", "paces at the limit");
  show("unreturned.", "talked to but not listening (their intent.pose)");
  if (process.env.ANIMFLOW_POSES) show("pose.", "WHAT BODIES SHOW when they have arrived (intent.pose)");
  show("laugh.", "laughter");
  show("talk.", "talking");
  console.log(`pose changes per person look: ${(((sum["pose.changes"] ?? 0) / Math.max(1, people)) * 100).toFixed(2)} per 100`);
  show("feel.", "FEELINGS seen (stationary)");
  if (process.env.ANIMFLOW_CREATURES) show("creature.", "CREATURES (kind.state.clip)");
  process.exit(0);
}
