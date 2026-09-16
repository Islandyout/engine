// Vendored from the user-supplied aether-complete.zip (MIT; see third_party/aether/LICENSE),
// tools/gen/glb.mjs, unmodified -- part of the procedural asset generator's dependency
// closure for tools/regenerate_npc_kit.mjs. See assets/CREDITS.md for provenance.

// glb.mjs — minimal, dependency-free glTF 2.0 / GLB writer.
// Supports: node hierarchies, PBR metallic-roughness materials, indexed meshes,
// multi-primitive meshes, skins (joints + inverse bind matrices), and
// TRS animations. Everything the Aether importer needs, nothing it doesn't.

const CT = { BYTE: 5120, UBYTE: 5121, SHORT: 5122, USHORT: 5123, UINT: 5125, FLOAT: 5126 };
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const TARGET = { ARRAY_BUFFER: 34962, ELEMENT_ARRAY_BUFFER: 34963 };

const pad4 = (n) => (n + 3) & ~3;

export class GLB {
  constructor(generator = 'aether-assetgen') {
    this.j = {
      asset: { version: '2.0', generator },
      scene: 0,
      scenes: [{ nodes: [] }],
      nodes: [],
      meshes: [],
      materials: [],
      accessors: [],
      bufferViews: [],
      buffers: [],
    };
    this.chunks = [];
    this.offset = 0;
    this._matCache = new Map();
  }

  // ---- buffer plumbing -----------------------------------------------------

  _view(typedArray, target) {
    const bytes = new Uint8Array(
      typedArray.buffer,
      typedArray.byteOffset,
      typedArray.byteLength,
    );
    // Element-array/array-buffer views must start on a 4-byte boundary.
    const start = pad4(this.offset);
    if (start > this.offset) {
      this.chunks.push(new Uint8Array(start - this.offset));
      this.offset = start;
    }
    this.chunks.push(bytes);
    const bv = { buffer: 0, byteOffset: start, byteLength: bytes.byteLength };
    if (target) bv.target = target;
    this.j.bufferViews.push(bv);
    this.offset += bytes.byteLength;
    return this.j.bufferViews.length - 1;
  }

  accessor(typedArray, type, opts = {}) {
    const n = NCOMP[type];
    const count = typedArray.length / n;
    if (!Number.isInteger(count)) throw new Error(`accessor length ${typedArray.length} not divisible by ${n} (${type})`);
    let componentType;
    if (typedArray instanceof Float32Array) componentType = CT.FLOAT;
    else if (typedArray instanceof Uint32Array) componentType = CT.UINT;
    else if (typedArray instanceof Uint16Array) componentType = CT.USHORT;
    else if (typedArray instanceof Uint8Array) componentType = CT.UBYTE;
    else if (typedArray instanceof Int16Array) componentType = CT.SHORT;
    else throw new Error('unsupported typed array');

    const bv = this._view(typedArray, opts.target);
    const acc = { bufferView: bv, componentType, count, type };
    if (opts.normalized) acc.normalized = true;
    if (opts.minMax !== false) {
      const min = new Array(n).fill(Infinity);
      const max = new Array(n).fill(-Infinity);
      for (let i = 0; i < count; i++) {
        for (let c = 0; c < n; c++) {
          const v = typedArray[i * n + c];
          if (v < min[c]) min[c] = v;
          if (v > max[c]) max[c] = v;
        }
      }
      acc.min = min;
      acc.max = max;
    }
    this.j.accessors.push(acc);
    return this.j.accessors.length - 1;
  }

  // ---- materials -----------------------------------------------------------

  /**
   * @param {object} m {name, color:[r,g,b], alpha, metallic, roughness,
   *                    emissive:[r,g,b], emissiveStrength, doubleSided, unlit}
   */
  material(m) {
    const key = JSON.stringify(m);
    if (this._matCache.has(key)) return this._matCache.get(key);
    const c = m.color || [0.8, 0.8, 0.8];
    const mat = {
      name: m.name || 'mat',
      pbrMetallicRoughness: {
        baseColorFactor: [c[0], c[1], c[2], m.alpha == null ? 1 : m.alpha],
        metallicFactor: m.metallic == null ? 0 : m.metallic,
        roughnessFactor: m.roughness == null ? 0.8 : m.roughness,
      },
    };
    if (m.emissive) mat.emissiveFactor = m.emissive;
    if (m.doubleSided) mat.doubleSided = true;
    if (m.alpha != null && m.alpha < 1) mat.alphaMode = 'BLEND';
    if (m.alphaMode) mat.alphaMode = m.alphaMode;
    if (m.emissiveStrength != null) {
      mat.extensions = { KHR_materials_emissive_strength: { emissiveStrength: m.emissiveStrength } };
      this._ext('KHR_materials_emissive_strength');
    }
    this.j.materials.push(mat);
    const idx = this.j.materials.length - 1;
    this._matCache.set(key, idx);
    return idx;
  }

  _ext(name) {
    this.j.extensionsUsed = this.j.extensionsUsed || [];
    if (!this.j.extensionsUsed.includes(name)) this.j.extensionsUsed.push(name);
  }

  // ---- meshes --------------------------------------------------------------

  /**
   * @param {string} name
   * @param {Array} prims [{positions:Float32Array, normals, uvs, joints:Uint16Array,
   *                        weights:Float32Array, indices:Uint32Array, material:int}]
   */
  mesh(name, prims) {
    const primitives = prims.map((p) => {
      const attributes = {
        POSITION: this.accessor(p.positions, 'VEC3', { target: TARGET.ARRAY_BUFFER }),
      };
      if (p.normals) attributes.NORMAL = this.accessor(p.normals, 'VEC3', { target: TARGET.ARRAY_BUFFER, minMax: false });
      if (p.uvs) attributes.TEXCOORD_0 = this.accessor(p.uvs, 'VEC2', { target: TARGET.ARRAY_BUFFER, minMax: false });
      if (p.colors) attributes.COLOR_0 = this.accessor(p.colors, 'VEC4', { target: TARGET.ARRAY_BUFFER, minMax: false });
      if (p.joints) attributes.JOINTS_0 = this.accessor(p.joints, 'VEC4', { target: TARGET.ARRAY_BUFFER, minMax: false });
      if (p.weights) attributes.WEIGHTS_0 = this.accessor(p.weights, 'VEC4', { target: TARGET.ARRAY_BUFFER, minMax: false });
      const prim = { attributes, mode: 4 };
      if (p.indices) prim.indices = this.accessor(p.indices, 'SCALAR', { target: TARGET.ELEMENT_ARRAY_BUFFER, minMax: false });
      if (p.material != null) prim.material = p.material;
      return prim;
    });
    this.j.meshes.push({ name, primitives });
    return this.j.meshes.length - 1;
  }

  // ---- nodes ---------------------------------------------------------------

  node(n) {
    const node = { name: n.name || `node${this.j.nodes.length}` };
    if (n.mesh != null) node.mesh = n.mesh;
    if (n.skin != null) node.skin = n.skin;
    if (n.translation) node.translation = n.translation;
    if (n.rotation) node.rotation = n.rotation;
    if (n.scale) node.scale = n.scale;
    if (n.children) node.children = n.children;
    if (n.extras) node.extras = n.extras;
    this.j.nodes.push(node);
    return this.j.nodes.length - 1;
  }

  addChild(parent, child) {
    const p = this.j.nodes[parent];
    (p.children = p.children || []).push(child);
  }

  root(idx) {
    this.j.scenes[0].nodes.push(idx);
    return idx;
  }

  // ---- skins ---------------------------------------------------------------

  /** @param {int[]} joints node indices  @param {Float32Array} ibm 16*joints floats */
  skin(name, joints, ibm, skeleton) {
    this.j.skins = this.j.skins || [];
    const s = {
      name,
      joints,
      inverseBindMatrices: this.accessor(ibm, 'MAT4', { minMax: false }),
    };
    if (skeleton != null) s.skeleton = skeleton;
    this.j.skins.push(s);
    return this.j.skins.length - 1;
  }

  // ---- animation -----------------------------------------------------------

  /**
   * @param {string} name
   * @param {Array} tracks [{node, path:'translation'|'rotation'|'scale',
   *                         times:Float32Array, values:Float32Array,
   *                         interpolation:'LINEAR'|'STEP'|'CUBICSPLINE'}]
   */
  animation(name, tracks) {
    this.j.animations = this.j.animations || [];
    const samplers = [];
    const channels = [];
    for (const t of tracks) {
      const input = this.accessor(t.times, 'SCALAR');
      const output = this.accessor(t.values, t.path === 'rotation' ? 'VEC4' : 'VEC3', { minMax: false });
      samplers.push({ input, output, interpolation: t.interpolation || 'LINEAR' });
      channels.push({ sampler: samplers.length - 1, target: { node: t.node, path: t.path } });
    }
    this.j.animations.push({ name, samplers, channels });
    return this.j.animations.length - 1;
  }

  // ---- serialise -----------------------------------------------------------

  /** Drop materials no primitive references, and renumber what's left. */
  _pruneMaterials() {
    const used = new Set();
    for (const m of this.j.meshes) for (const p of m.primitives) if (p.material != null) used.add(p.material);
    if (used.size === this.j.materials.length) return;
    const remap = new Map();
    const kept = [];
    this.j.materials.forEach((mat, i) => {
      if (!used.has(i)) return;
      remap.set(i, kept.length);
      kept.push(mat);
    });
    for (const m of this.j.meshes) {
      for (const p of m.primitives) if (p.material != null) p.material = remap.get(p.material);
    }
    this.j.materials = kept;
  }

  toBuffer() {
    this._pruneMaterials();
    const binLength = pad4(this.offset);
    this.j.buffers = [{ byteLength: binLength }];
    if (this.j.skins && this.j.skins.length === 0) delete this.j.skins;
    if (this.j.animations && this.j.animations.length === 0) delete this.j.animations;
    if (this.j.materials.length === 0) delete this.j.materials;

    const jsonText = JSON.stringify(this.j);
    const jsonBytes = Buffer.from(jsonText, 'utf8');
    const jsonPadded = Buffer.alloc(pad4(jsonBytes.length), 0x20); // pad with spaces
    jsonBytes.copy(jsonPadded);

    const bin = Buffer.alloc(binLength);
    let o = 0;
    for (const c of this.chunks) {
      Buffer.from(c.buffer, c.byteOffset, c.byteLength).copy(bin, o);
      o += c.byteLength;
    }

    const total = 12 + 8 + jsonPadded.length + 8 + bin.length;
    const out = Buffer.alloc(total);
    let p = 0;
    out.writeUInt32LE(0x46546c67, p); p += 4; // 'glTF'
    out.writeUInt32LE(2, p); p += 4;
    out.writeUInt32LE(total, p); p += 4;
    out.writeUInt32LE(jsonPadded.length, p); p += 4;
    out.writeUInt32LE(0x4e4f534a, p); p += 4; // 'JSON'
    jsonPadded.copy(out, p); p += jsonPadded.length;
    out.writeUInt32LE(bin.length, p); p += 4;
    out.writeUInt32LE(0x004e4942, p); p += 4; // 'BIN'
    bin.copy(out, p);
    return out;
  }
}

export { CT, TARGET };
