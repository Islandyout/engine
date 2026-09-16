// One-off regeneration script (0.36.0): rebuilds the twelve `assets/source/kit/people/
// npc-*.glb` files (plus `hero.glb`, which shares the same generator) from the vendored
// third_party/aether/gen/** procedural generator, using the exact same character options
// (seed/outfit/height/build/hairStyle/...) that produced the files already committed here
// -- verified byte-identical against the original aether-complete.zip output before the
// one intentional change (see third_party/aether/gen/{mesh,humanoid}.mjs's own headers:
// smooth-shaded limb cylinders instead of flat-shaded ones) was made. Determinism means
// re-running this with the vendored generator unmodified reproduces the prior files
// exactly; re-running it after a further generator change reproduces the new look the
// same way, without needing the full ~600-file aether-complete.zip again.
//
//   node tools/regenerate_npc_kit.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { newFile, skinnedGLB } from '../third_party/aether/gen/assemble.mjs';
import { humanoid, clips, JOINT_NAMES } from '../third_party/aether/gen/humanoid.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, '..', 'assets', 'source', 'kit', 'people');
const NPC_CLIPS = ['idle', 'walk', 'run'];

const makePerson = (name, opts, clipFilter) => {
  const { glb, mats } = newFile();
  const model = humanoid(mats, opts);
  const all = clips(model.skeleton);
  const chosen = clipFilter ? all.filter((c) => clipFilter.includes(c.name)) : all;
  const buf = skinnedGLB(glb, name, { ...model, jointNames: JOINT_NAMES }, chosen, model.meta);
  writeFileSync(join(OUT_DIR, `${name}.glb`), buf);
  console.log(`  ${name}.glb`.padEnd(24) + `${(buf.length / 1024).toFixed(1)} KB`);
};

// Same options as build-assets.mjs's own `people` section in the supplied archive --
// kept in exact sync so this script's only real effect is the vendored generator's own
// smooth-shading change, not a drift in character look.
makePerson('hero', {
  seed: 'hero', height: 1.78, build: 1.0, shoulders: 1.06,
  outfit: 'casual', hairStyle: 'short',
}, null);

const npcs = [
  ['npc-office-m', { outfit: 'office', height: 1.80, hairStyle: 'short' }],
  ['npc-office-f', { outfit: 'office', height: 1.66, hairStyle: 'bun' }],
  ['npc-casual-1', { outfit: 'casual', height: 1.74, hairStyle: 'crop' }],
  ['npc-casual-2', { outfit: 'casual', height: 1.62, hairStyle: 'long' }],
  ['npc-hoodie', { outfit: 'hoodie', height: 1.77, hairStyle: 'short', backpack: true }],
  ['npc-worker', { outfit: 'worker', height: 1.82, build: 1.18 }],
  ['npc-sport', { outfit: 'sport', height: 1.70, hairStyle: 'crop' }],
  ['npc-dress', { outfit: 'dress', height: 1.68, hairStyle: 'braids' }],
  ['npc-vendor', { outfit: 'vendor', height: 1.71, hairStyle: 'afro' }],
  ['npc-uniform', { outfit: 'uniform', height: 1.79, hairStyle: 'bald' }],
  ['npc-elder', { outfit: 'casual', height: 1.63, build: 1.05, hairStyle: 'short' }],
  ['npc-teen', { outfit: 'sport', height: 1.58, build: 0.88, hairStyle: 'crop' }],
];
console.log('people');
for (const [name, opts] of npcs) makePerson(name, { seed: name, ...opts }, NPC_CLIPS);
