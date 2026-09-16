// Vendored from the user-supplied aether-complete.zip (MIT; see third_party/aether/LICENSE),
// tools/gen/buildings.mjs, unmodified -- part of the procedural asset generator's dependency
// closure for tools/regenerate_npc_kit.mjs. See assets/CREDITS.md for provenance.

// buildings.mjs — parametric buildings. Windows are real recessed openings
// (a grid decomposition, no CSG), so facades read correctly under a PBR
// renderer with ambient occlusion instead of looking like decals on a box.

import { Geo, m4, roundRect } from './mesh.mjs';
import { RNG } from './rng.mjs';
import { FACADE, CLOTH } from './materials.mjs';

/**
 * A wall panel in the local XY plane facing +Z, origin at bottom-centre.
 * Windows sit on a cols x rows grid; each cell is emitted either as a plain
 * quad or as four border quads plus a reveal and a glass pane.
 */
export function wallGrid(g, o) {
  const {
    w, h, cols = 0, rows = 0, winW = 1.2, winH = 1.5,
    wall, glass, frame, recess = 0.18, yStart = 0, sillMat,
  } = o;
  if (cols < 1 || rows < 1) {
    g.poly(wall, [[-w / 2, yStart, 0], [w / 2, yStart, 0], [w / 2, yStart + h, 0], [-w / 2, yStart + h, 0]]);
    return g;
  }
  const cw = w / cols, ch = h / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = -w / 2 + c * cw, x1 = x0 + cw;
      const y0 = yStart + r * ch, y1 = y0 + ch;
      const ww = Math.min(winW, cw - 0.3), wh = Math.min(winH, ch - 0.4);
      if (ww <= 0.2 || wh <= 0.2) {
        g.poly(wall, [[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]]);
        continue;
      }
      const wx0 = (x0 + x1) / 2 - ww / 2, wx1 = wx0 + ww;
      const wy0 = y0 + (ch - wh) / 2, wy1 = wy0 + wh;
      // surround
      g.poly(wall, [[x0, y0, 0], [x1, y0, 0], [x1, wy0, 0], [x0, wy0, 0]]);       // below
      g.poly(wall, [[x0, wy1, 0], [x1, wy1, 0], [x1, y1, 0], [x0, y1, 0]]);       // above
      g.poly(wall, [[x0, wy0, 0], [wx0, wy0, 0], [wx0, wy1, 0], [x0, wy1, 0]]);   // left
      g.poly(wall, [[wx1, wy0, 0], [x1, wy0, 0], [x1, wy1, 0], [wx1, wy1, 0]]);   // right
      // reveal (four inward-facing strips)
      const rv = frame == null ? wall : frame;
      g.poly(rv, [[wx0, wy0, 0], [wx1, wy0, 0], [wx1, wy0, -recess], [wx0, wy0, -recess]]);
      g.poly(rv, [[wx1, wy1, 0], [wx0, wy1, 0], [wx0, wy1, -recess], [wx1, wy1, -recess]]);
      g.poly(rv, [[wx0, wy1, 0], [wx0, wy0, 0], [wx0, wy0, -recess], [wx0, wy1, -recess]]);
      g.poly(rv, [[wx1, wy0, 0], [wx1, wy1, 0], [wx1, wy1, -recess], [wx1, wy0, -recess]]);
      // pane
      g.poly(glass, [
        [wx0, wy0, -recess], [wx1, wy0, -recess], [wx1, wy1, -recess], [wx0, wy1, -recess],
      ]);
      // sill
      if (sillMat != null) {
        g.box(sillMat, [ww + 0.24, 0.08, 0.22], [(wx0 + wx1) / 2, wy0 - 0.04, 0.08]);
      }
    }
  }
  return g;
}

/** Continuous ribbon glazing between spandrel bands — the curtain-wall look. */
export function curtainWall(g, o) {
  const { w, h, floors, wall, glass, mullion, spandrel = 0.9, yStart = 0, recess = 0.12 } = o;
  const fh = h / floors;
  const glassH = Math.max(0.4, fh - spandrel);
  for (let f = 0; f < floors; f++) {
    const y0 = yStart + f * fh;
    g.poly(wall, [[-w / 2, y0, 0], [w / 2, y0, 0], [w / 2, y0 + spandrel, 0], [-w / 2, y0 + spandrel, 0]]);
    const gy0 = y0 + spandrel, gy1 = gy0 + glassH;
    g.poly(mullion, [[-w / 2, gy0, 0], [w / 2, gy0, 0], [w / 2, gy0, -recess], [-w / 2, gy0, -recess]]);
    g.poly(mullion, [[w / 2, gy1, 0], [-w / 2, gy1, 0], [-w / 2, gy1, -recess], [w / 2, gy1, -recess]]);
    g.poly(glass, [[-w / 2, gy0, -recess], [w / 2, gy0, -recess], [w / 2, gy1, -recess], [-w / 2, gy1, -recess]]);
    // vertical mullions
    const bays = Math.max(2, Math.round(w / 1.5));
    for (let i = 1; i < bays; i++) {
      const x = -w / 2 + (i * w) / bays;
      g.box(mullion, [0.09, glassH, recess], [x, (gy0 + gy1) / 2, -recess / 2]);
    }
  }
  return g;
}

/** Rooftop clutter: plant rooms, tanks, AC units, aerials, parapet. */
export function roofKit(g, mats, rng, w, d, y, o = {}) {
  const p = o.parapet == null ? 0.9 : o.parapet;
  if (p > 0) {
    for (const [sx, sz, ww, dd] of [[0, 1, w, 0.25], [0, -1, w, 0.25], [1, 0, 0.25, d], [-1, 0, 0.25, d]]) {
      g.box(mats.concrete, [ww, p, dd], [(sx * (w - 0.25)) / 2, y + p / 2, (sz * (d - 0.25)) / 2]);
    }
  }
  if (o.stair !== false) {
    const sw = Math.min(4, w * 0.3), sd = Math.min(3.5, d * 0.3);
    g.box(mats.concreteDark, [sw, 2.6, sd], [rng.range(-w / 4, w / 4), y + 1.3, rng.range(-d / 4, d / 4)]);
  }
  const units = o.units == null ? Math.max(1, Math.round((w * d) / 60)) : o.units;
  for (let i = 0; i < units; i++) {
    const uw = rng.range(1.2, 2.4), ud = rng.range(1.0, 1.8), uh = rng.range(0.7, 1.3);
    g.box(mats.galvanised, [uw, uh, ud], [
      rng.range(-w / 2 + uw, w / 2 - uw), y + uh / 2, rng.range(-d / 2 + ud, d / 2 - ud),
    ]);
  }
  if (o.tank !== false && rng.chance(0.55)) {
    const r = rng.range(0.8, 1.4);
    g.push(m4.translate(rng.range(-w / 3, w / 3), y, rng.range(-d / 3, d / 3)));
    g.cyl(mats.galvanised, r, r, rng.range(1.2, 2.0), 12, true, false, 0.6);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      g.box(mats.steelDark, [0.09, 0.6, 0.09], [Math.cos(a) * r * 0.7, 0.3, Math.sin(a) * r * 0.7]);
    }
    g.pop();
  }
  if (o.mast !== false && rng.chance(0.4)) {
    const mh = rng.range(3, 7);
    g.push(m4.translate(rng.range(-w / 3, w / 3), y, rng.range(-d / 3, d / 3)));
    g.cyl(mats.steelDark, 0.07, 0.04, mh, 6);
    g.box(mats.lightRed, [0.16, 0.16, 0.16], [0, mh + 0.1, 0]);
    g.pop();
  }
  return g;
}

/** Inset dark volume so glazing reads as an interior, not a hole. */
function interior(g, mats, w, d, h, y0 = 0, inset = 0.9) {
  const iw = Math.max(0.5, w - inset * 2), id = Math.max(0.5, d - inset * 2);
  g.box(mats.interior, [iw, Math.max(0.5, h - 0.3), id], [0, y0 + (h - 0.3) / 2 + 0.15, 0]);
  return g;
}

const SIDES = [
  { rot: 0, sign: [0, 1] },              // +Z
  { rot: Math.PI, sign: [0, -1] },       // -Z
  { rot: Math.PI / 2, sign: [1, 0] },    // +X
  { rot: -Math.PI / 2, sign: [-1, 0] },  // -X
];

/** Place a wall builder on all four sides of a w x d box. */
function eachSide(g, w, d, fn) {
  SIDES.forEach((s, i) => {
    const len = s.sign[0] !== 0 ? d : w;
    const off = s.sign[0] !== 0 ? [(s.sign[0] * w) / 2, 0, 0] : [0, 0, (s.sign[1] * d) / 2];
    g.push(m4.mul(m4.translate(off[0], off[1], off[2]), m4.rotY(s.rot)));
    fn(len, i, s);
    g.pop();
  });
}

/**
 * Main entry point.
 * @param {object} mats
 * @param {object} o {type, seed, width, depth, floors, floorHeight, ...}
 */
export function building(mats, o = {}) {
  const rng = new RNG(o.seed == null ? 'building' : o.seed);
  const type = o.type || 'office';
  const g = new Geo();
  const pick = (a, b) => rng.range(a, b);

  const facade = o.facadeMat != null ? o.facadeMat : mats.__facade[rng.int(0, mats.__facade.length - 1)];

  switch (type) {
    case 'tower': {
      const floors = o.floors || rng.int(12, 26);
      const fh = o.floorHeight || 3.6;
      let w = o.width || pick(24, 38);
      let d = o.depth || pick(22, 34);
      let y = 0;
      const setbacks = rng.int(1, 3);
      const per = Math.floor(floors / setbacks);
      for (let s = 0; s < setbacks; s++) {
        const n = s === setbacks - 1 ? floors - per * s : per;
        const h = n * fh;
        eachSide(g, w, d, (len) => curtainWall(g, {
          w: len, h, floors: n, yStart: y,
          wall: mats.concreteDark, glass: mats.glassDark, mullion: mats.windowFrame,
          spandrel: 0.8,
        }));
        interior(g, mats, w, d, h, y, 0.6);
        y += h;
        const shrink = pick(1.5, 3.0);
        if (s < setbacks - 1) {
          g.box(mats.concrete, [w, 0.3, d], [0, y + 0.15, 0]);
          w = Math.max(8, w - shrink * 2);
          d = Math.max(8, d - shrink * 2);
          y += 0.3;
        }
      }
      g.box(mats.concreteDark, [w, 0.3, d], [0, y + 0.15, 0]);
      roofKit(g, mats, rng, w, d, y + 0.3, { parapet: 1.1 });
      // ground floor lobby
      g.box(mats.glassMirror, [w * 0.6, 0.2, d * 0.6], [0, 0.1, 0]);
      break;
    }

    case 'office': {
      const floors = o.floors || rng.int(4, 9);
      const fh = o.floorHeight || 3.4;
      const w = o.width || pick(14, 24);
      const d = o.depth || pick(12, 20);
      const h = floors * fh;
      eachSide(g, w, d, (len) => {
        // ground floor: shopfront glazing
        wallGrid(g, {
          w: len, h: fh, cols: Math.max(2, Math.round(len / 3)), rows: 1,
          winW: 2.4, winH: 2.4, wall: mats.concrete, glass: mats.glass,
          frame: mats.windowFrame, recess: 0.25,
        });
        wallGrid(g, {
          w: len, h: h - fh, yStart: fh,
          cols: Math.max(2, Math.round(len / 2.6)), rows: floors - 1,
          winW: 1.7, winH: 1.9, wall: facade, glass: mats.glassDark,
          frame: mats.windowFrame, sillMat: mats.concrete, recess: 0.2,
        });
      });
      interior(g, mats, w, d, h);
      g.box(mats.concrete, [w + 0.5, 0.35, d + 0.5], [0, h + 0.17, 0]);
      roofKit(g, mats, rng, w, d, h + 0.35);
      break;
    }

    case 'apartment': {
      const floors = o.floors || rng.int(3, 8);
      const fh = o.floorHeight || 3.0;
      const w = o.width || pick(12, 20);
      const d = o.depth || pick(10, 16);
      const h = floors * fh;
      eachSide(g, w, d, (len, i) => {
        wallGrid(g, {
          w: len, h, cols: Math.max(2, Math.round(len / 3.0)), rows: floors,
          winW: 1.5, winH: 1.6, wall: facade, glass: mats.glass,
          frame: mats.windowFrame, sillMat: mats.concrete, recess: 0.22,
        });
        // balconies on the long faces
        if (i < 2 && len > 8) {
          const bays = Math.max(1, Math.round(len / 4.5));
          for (let f = 1; f < floors; f++) {
            for (let b = 0; b < bays; b++) {
              const x = -len / 2 + ((b + 0.5) * len) / bays;
              const y = f * fh;
              g.box(mats.concrete, [3.0, 0.16, 1.3], [x, y + 0.08, 0.65]);
              g.box(mats.steelDark, [3.0, 0.06, 0.06], [x, y + 1.05, 1.28]);
              for (let k = 0; k <= 10; k++) {
                g.box(mats.steelDark, [0.04, 1.0, 0.04], [x - 1.5 + (k * 3.0) / 10, y + 0.6, 1.28]);
              }
            }
          }
        }
      });
      interior(g, mats, w, d, h);
      g.box(mats.concrete, [w + 0.4, 0.3, d + 0.4], [0, h + 0.15, 0]);
      roofKit(g, mats, rng, w, d, h + 0.3, { parapet: 0.8, units: 2 });
      break;
    }

    case 'shophouse': {
      const floors = o.floors || rng.int(2, 4);
      const fh = o.floorHeight || 3.2;
      const w = o.width || pick(7, 12);
      const d = o.depth || pick(10, 16);
      const h = floors * fh;
      const signMat = mats.__cloth[rng.int(0, mats.__cloth.length - 1)];
      eachSide(g, w, d, (len, i) => {
        const front = i === 0;
        if (front) {
          // shopfront: full-height glazing with a door bay
          wallGrid(g, {
            w: len, h: fh - 0.9, cols: Math.max(2, Math.round(len / 2.2)), rows: 1,
            winW: 1.9, winH: 2.0, wall: mats.concrete, glass: mats.glass,
            frame: mats.windowFrame, recess: 0.28,
          });
          g.box(signMat, [len, 0.9, 0.18], [0, fh - 0.45, 0.09]);      // signage band
          g.box(mats.plasticGrey, [len * 0.9, 0.08, 1.4], [0, fh - 0.95, 0.7]); // awning
        } else {
          wallGrid(g, { w: len, h: fh, cols: 0, rows: 0, wall: facade });
        }
        wallGrid(g, {
          w: len, h: h - fh, yStart: fh,
          cols: Math.max(1, Math.round(len / 2.4)), rows: floors - 1,
          winW: 1.2, winH: 1.7, wall: facade, glass: mats.glass,
          frame: mats.windowFrame, sillMat: mats.concrete, recess: 0.2,
        });
      });
      interior(g, mats, w, d, h, 0, 0.5);
      g.box(mats.concrete, [w + 0.3, 0.5, d + 0.3], [0, h + 0.25, 0]);
      roofKit(g, mats, rng, w, d, h + 0.5, { parapet: 0.5, units: 1, mast: false });
      break;
    }

    case 'house': {
      const floors = o.floors || rng.int(1, 2);
      const fh = o.floorHeight || 2.9;
      const w = o.width || pick(9, 14);
      const d = o.depth || pick(8, 12);
      const h = floors * fh;
      eachSide(g, w, d, (len) => wallGrid(g, {
        w: len, h, cols: Math.max(2, Math.round(len / 3.2)), rows: floors,
        winW: 1.3, winH: 1.4, wall: facade, glass: mats.glass,
        frame: mats.windowFrame, sillMat: mats.concrete, recess: 0.16,
      }));
      interior(g, mats, w, d, h, 0, 0.5);
      // hipped roof
      const oh = 0.5, rh = pick(1.6, 2.6);
      const a = [-w / 2 - oh, h, -d / 2 - oh], b = [w / 2 + oh, h, -d / 2 - oh];
      const c = [w / 2 + oh, h, d / 2 + oh], e = [-w / 2 - oh, h, d / 2 + oh];
      const rl = [-w / 4, h + rh, 0], rr = [w / 4, h + rh, 0];
      // wound so the slopes face upward
      g.poly(mats.roofTile, [a, rl, rr, b]);
      g.poly(mats.roofTile, [c, rr, rl, e]);
      g.poly(mats.roofTile, [b, rr, c]);
      g.poly(mats.roofTile, [e, rl, a]);
      // porch
      g.box(mats.concrete, [3.2, 0.15, 1.8], [0, 0.07, d / 2 + 0.9]);
      for (const sx of [-1.4, 1.4]) g.box(mats.woodPlank, [0.16, 2.4, 0.16], [sx, 1.2, d / 2 + 1.6]);
      g.box(mats.roofMetal, [3.4, 0.12, 2.0], [0, 2.45, d / 2 + 1.0]);
      // door
      g.box(mats.woodPlank, [1.0, 2.1, 0.1], [0, 1.05, d / 2 + 0.03]);
      if (rng.chance(0.5)) g.box(mats.brick, [0.8, 1.6, 0.8], [pick(-w / 3, w / 3), h + rh - 0.3, pick(-d / 4, d / 4)]);
      break;
    }

    case 'warehouse': {
      const w = o.width || pick(24, 44);
      const d = o.depth || pick(18, 34);
      const h = o.height || pick(7, 11);
      eachSide(g, w, d, (len, i) => {
        if (i === 0) {
          // loading doors on the front
          const bays = Math.max(2, Math.round(len / 6));
          const cw = len / bays;
          for (let b = 0; b < bays; b++) {
            const x = -len / 2 + (b + 0.5) * cw;
            g.poly(mats.roofMetal, [[x - cw / 2, 0, 0], [x + cw / 2, 0, 0], [x + cw / 2, h, 0], [x - cw / 2, h, 0]]);
            g.box(mats.galvanised, [Math.min(4.2, cw - 1.2), 4.2, 0.16], [x, 2.1, 0.09]);
            g.box(mats.concreteDark, [cw - 0.4, 1.2, 1.6], [x, 0.6, 0.8]); // dock apron
          }
        } else {
          g.poly(mats.roofMetal, [[-len / 2, 0, 0], [len / 2, 0, 0], [len / 2, h, 0], [-len / 2, h, 0]]);
          // clerestory strip
          g.box(mats.glass, [len * 0.9, 1.0, 0.08], [0, h - 1.2, 0.05]);
        }
      });
      // shallow gable
      const rh = 1.6;
      g.poly(mats.roofMetal, [[-w / 2, h, -d / 2], [w / 2, h, -d / 2], [w / 2, h + rh, 0], [-w / 2, h + rh, 0]]);
      g.poly(mats.roofMetal, [[w / 2, h, d / 2], [-w / 2, h, d / 2], [-w / 2, h + rh, 0], [w / 2, h + rh, 0]]);
      g.poly(mats.roofMetal, [[-w / 2, h, -d / 2], [-w / 2, h + rh, 0], [-w / 2, h, d / 2]]);
      g.poly(mats.roofMetal, [[w / 2, h, d / 2], [w / 2, h + rh, 0], [w / 2, h, -d / 2]]);
      for (let i = 0; i < 5; i++) {
        g.push(m4.translate(pick(-w / 2 + 2, w / 2 - 2), h + rh * 0.5, pick(-d / 3, d / 3)));
        g.cyl(mats.galvanised, 0.35, 0.35, 0.7, 10);
        g.pop();
      }
      break;
    }

    case 'retail': {
      const w = o.width || pick(18, 30);
      const d = o.depth || pick(14, 22);
      const h = o.height || 5.2;
      const signMat = mats.__cloth[rng.int(0, mats.__cloth.length - 1)];
      eachSide(g, w, d, (len, i) => {
        if (i === 0) {
          wallGrid(g, {
            w: len, h: h - 1.4, cols: Math.max(3, Math.round(len / 3)), rows: 1,
            winW: 2.6, winH: 3.0, wall: mats.concrete, glass: mats.glass,
            frame: mats.windowFrame, recess: 0.3,
          });
          g.box(signMat, [len, 1.4, 0.2], [0, h - 0.7, 0.1]);
          g.box(mats.plasticGrey, [len, 0.1, 2.2], [0, h - 1.5, 1.1]);
        } else {
          wallGrid(g, { w: len, h, wall: facade });
        }
      });
      interior(g, mats, w, d, h);
      g.box(mats.concrete, [w + 0.6, 0.6, d + 0.6], [0, h + 0.3, 0]);
      roofKit(g, mats, rng, w, d, h + 0.6, { parapet: 0.7, units: 3, mast: false, tank: false });
      break;
    }

    case 'parking': {
      const decks = o.floors || rng.int(3, 6);
      const fh = 2.9;
      const w = o.width || pick(24, 34);
      const d = o.depth || pick(18, 28);
      const h = decks * fh;
      for (let f = 0; f < decks; f++) {
        const y = f * fh;
        g.box(mats.concreteDark, [w, 0.28, d], [0, y + 0.14, 0]);
        eachSide(g, w, d, (len) => {
          g.poly(mats.concrete, [[-len / 2, y + 0.28, 0], [len / 2, y + 0.28, 0], [len / 2, y + 1.1, 0], [-len / 2, y + 1.1, 0]]);
          const bays = Math.max(3, Math.round(len / 3));
          for (let b = 0; b <= bays; b++) {
            g.box(mats.concrete, [0.3, fh, 0.3], [-len / 2 + (b * len) / bays, y + fh / 2, 0]);
          }
        });
      }
      g.box(mats.concreteDark, [w, 0.3, d], [0, h + 0.15, 0]);
      // core
      g.box(mats.concrete, [4.5, h + 3.4, 4.5], [w / 2 - 3, (h + 3.4) / 2, -d / 2 + 3]);
      roofKit(g, mats, rng, w, d, h + 0.3, { parapet: 1.0, units: 1, tank: false, mast: false, stair: false });
      break;
    }

    default:
      throw new Error(`unknown building type: ${type}`);
  }

  return g;
}

/** Register the palette arrays a building needs onto a materials map. */
export function withPalettes(glb, mats) {
  mats.__facade = FACADE.map((m) => glb.material(m));
  mats.__cloth = CLOTH.map((m) => glb.material({ ...m, roughness: 0.55 }));
  return mats;
}

export { roundRect };
