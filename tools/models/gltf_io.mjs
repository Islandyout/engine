// Reading glTF (.gltf + .bin) and writing GLB, for the model tools.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const TYPED = { 5126: Float32Array, 5123: Uint16Array, 5121: Uint8Array, 5125: Uint32Array };

// A glTF (.gltf + .bin) on disk.
export function loadGltf(file) {
  const json = JSON.parse(readFileSync(file, "utf8"));
  const dir = path.dirname(file);
  const bins = json.buffers.map((b) => readFileSync(path.join(dir, b.uri)));
  const read = (index) => {
    const accessor = json.accessors[index];
    const view = json.bufferViews[accessor.bufferView];
    const Type = TYPED[accessor.componentType];
    const size = SIZE[accessor.type];
    const bin = bins[view.buffer];
    const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const stride = view.byteStride ?? 0;
    const out = new Type(accessor.count * size);
    if (!stride || stride === size * Type.BYTES_PER_ELEMENT) {
      const slice = bin.subarray(offset, offset + out.byteLength);
      out.set(new Type(slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength)));
    } else {
      const element = new Type(size);
      for (let i = 0; i < accessor.count; i++) {
        const start = offset + i * stride;
        const slice = bin.subarray(start, start + size * Type.BYTES_PER_ELEMENT);
        element.set(new Type(slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength)));
        out.set(element, i * size);
      }
    }
    return { array: out, accessor };
  };
  return { json, dir, read };
}

// Writes a fresh GLB: every accessor re-packed tightly into one buffer.
export class GlbWriter {
  constructor(generator) {
    this.chunks = [];
    this.length = 0;
    this.json = { asset: { version: "2.0", generator }, accessors: [], bufferViews: [], buffers: [] };
  }
  view(bytes, target) {
    const pad = (4 - (this.length % 4)) % 4;
    if (pad) {
      this.chunks.push(Buffer.alloc(pad));
      this.length += pad;
    }
    this.json.bufferViews.push({ buffer: 0, byteOffset: this.length, byteLength: bytes.byteLength, ...(target ? { target } : {}) });
    this.chunks.push(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    this.length += bytes.byteLength;
    return this.json.bufferViews.length - 1;
  }
  accessor(array, source, target) {
    const out = { bufferView: this.view(array, target), componentType: source.componentType, count: source.count, type: source.type };
    if (source.normalized) out.normalized = true;
    if (source.min) out.min = source.min;
    if (source.max) out.max = source.max;
    this.json.accessors.push(out);
    return this.json.accessors.length - 1;
  }
  image(file, mimeType) {
    return { bufferView: this.view(readFileSync(file)), mimeType };
  }
  write(file) {
    const bin = Buffer.concat(this.chunks);
    this.json.buffers = [{ byteLength: bin.length }];
    let text = Buffer.from(JSON.stringify(this.json));
    text = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, 0x20)]);
    const binPadded = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
    const header = Buffer.alloc(12);
    header.write("glTF", 0);
    header.writeUInt32LE(2, 4);
    header.writeUInt32LE(12 + 8 + text.length + 8 + binPadded.length, 8);
    const chunk = (size, type) => {
      const b = Buffer.alloc(8);
      b.writeUInt32LE(size, 0);
      b.writeUInt32LE(type, 4);
      return b;
    };
    writeFileSync(file, Buffer.concat([header, chunk(text.length, 0x4e4f534a), text, chunk(binPadded.length, 0x004e4942), binPadded]));
  }
}
