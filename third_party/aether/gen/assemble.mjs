// Vendored from the user-supplied aether-complete.zip (MIT; see third_party/aether/LICENSE),
// tools/gen/assemble.mjs, unmodified -- part of the procedural asset generator's dependency
// closure for tools/regenerate_npc_kit.mjs. See assets/CREDITS.md for provenance.

// assemble.mjs — turn generator output into finished GLB files.

import { GLB } from './glb.mjs';
import { M, registerAll } from './materials.mjs';
import { withPalettes } from './buildings.mjs';
import { withPaints } from './vehicles.mjs';
import { withCharacterPalettes } from './humanoid.mjs';

/** A GLB pre-loaded with the full material library and every palette. */
export function newFile(generator) {
  const glb = new GLB(generator);
  const mats = registerAll(glb, M);
  withPalettes(glb, mats);
  withPaints(glb, mats);
  withCharacterPalettes(glb, mats);
  return { glb, mats };
}

/** Single static mesh at the scene root. */
export function staticGLB(glb, name, geo, extras) {
  const node = glb.node({ name, mesh: glb.mesh(name, geo.prims()), extras });
  glb.root(node);
  return glb.toBuffer();
}

/**
 * Multi-part model: a body plus repeated instances of one shared sub-mesh
 * (used for vehicle wheels, which the game rotates and steers).
 */
export function partsGLB(glb, name, model) {
  const root = glb.node({ name, extras: model.meta });
  glb.root(root);
  for (const part of model.parts) {
    glb.addChild(root, glb.node({ name: part.name, mesh: glb.mesh(part.name, part.geo.prims()) }));
  }
  if (model.wheelGeo && model.wheels) {
    const wheelMesh = glb.mesh('wheel', model.wheelGeo.prims());
    for (const w of model.wheels) {
      glb.addChild(root, glb.node({
        name: w.name,
        mesh: wheelMesh,
        translation: w.translation,
        // mirror the left side so tread and spokes face outward
        rotation: w.mirror ? [0, 1, 0, 0] : undefined,
        extras: { steer: !!w.steer, drive: !w.steer },
      }));
    }
  }
  return glb.toBuffer();
}

/**
 * Skinned, animated model.
 * @param {object} model {geo, skeleton:{local,parent,names}, jointNames}
 * @param {Array} clips  [{name, duration, tracks:[{node(jointIdx),path,times,values}]}]
 */
export function skinnedGLB(glb, name, model, clips, extras) {
  const sk = model.skeleton;
  const names = model.jointNames || sk.names || sk.local.map((_, i) => `joint${i}`);
  const nodes = sk.local.map((t, i) => glb.node({ name: names[i], translation: t }));
  sk.parent.forEach((p, i) => { if (p >= 0) glb.addChild(nodes[p], nodes[i]); });

  // Rest rotations are identity, so the inverse bind matrix is just a
  // translation by the negated rest world position.
  const ibm = new Float32Array(16 * nodes.length);
  sk.world.forEach((w, i) => {
    const o = i * 16;
    ibm[o] = 1; ibm[o + 5] = 1; ibm[o + 10] = 1; ibm[o + 15] = 1;
    ibm[o + 12] = -w[0]; ibm[o + 13] = -w[1]; ibm[o + 14] = -w[2];
  });
  const skin = glb.skin(`${name}_skin`, nodes, ibm, nodes[0]);

  const meshNode = glb.node({ name, mesh: glb.mesh(name, model.geo.prims()), skin, extras });
  glb.root(meshNode);
  glb.root(nodes[0]);

  for (const c of clips || []) {
    glb.animation(c.name, c.tracks.map((t) => ({
      node: nodes[t.node], path: t.path, times: t.times, values: t.values,
      interpolation: t.interpolation,
    })));
  }
  return glb.toBuffer();
}
