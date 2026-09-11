// Read-only CPU diagnostics against an extracted user-supplied Aether archive.
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

if (!process.argv[2]) throw new Error('Usage: node tools/aether-review.mjs EXTRACTED_ARCHIVE');
const root = path.resolve(process.argv[2]);
const { World, Scheduler } = await import(pathToFileURL(path.join(root, 'src/core/ecs.js')));
const { makeRNG } = await import(pathToFileURL(path.join(root, 'src/core/math.js')));
const w = new World();
const stale = w.create();
w.add(stale, 'counter', 1);
w.destroy(stale);
const replacement = w.create();
w.add(replacement, 'counter', 2);
w.add(stale, 'counter', 99);
console.log('Stale add corrupts replacement:', w.get(replacement, 'counter') === 99);
const reset = new World();
const before = reset.create();
reset.clear();
console.log('Clear reissues old handle:', reset.create() === before);
function order(names) {
  const scheduler = new Scheduler(), result = [];
  for (const name of names) scheduler.add(name, 'update', () => result.push(name));
  scheduler.runPhase('update', {});
  return result.join(',');
}
console.log('Registration-dependent ties:', order(['b', 'a']) !== order(['a', 'b']));
const rng = makeRNG(42);
assert.deepEqual(Array.from({ length: 6 }, () => rng() * 4294967296),
  [2581720956, 1925393290, 3661312704, 2876485805, 750819978, 2261697747]);
console.log('Seed 42 reference sequence matched.');
