// One thread of tools/eden/sweep.ts: runs lives for the seeds it is given and sends back their measures as rows of numbers.
import { parentPort, workerData } from "node:worker_threads";
import { live, lifeToRow, ROW, type LifeOptions } from "../../apps/editor/src/eden/lifelike";

const { first, count, stride, options } = workerData as { first: number; count: number; stride: number; options: LifeOptions };
const BATCH = 500;
const rows = new Float64Array(Math.min(BATCH, count) * ROW);
let n = 0;
let sent = 0;
for (let i = 0; i < count; i++) {
  lifeToRow(live(first + i * stride, options), rows, n * ROW);
  n++;
  if (n === BATCH || i === count - 1) {
    sent += n;
    parentPort!.postMessage({ rows: rows.slice(0, n * ROW), done: sent });
    n = 0;
  }
}
