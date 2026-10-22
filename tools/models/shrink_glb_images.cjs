// Shrinks the images inside GLB models: each is scaled down to a maximum side and re-encoded (JPEG when it has no transparency, PNG when it does),
// so a character with four 2K-4K PNGs (8 MB to download, 100 MB of GPU memory) becomes a few hundred kilobytes. The geometry and animations are untouched.
//
// Usage: node tools/models/shrink_glb_images.cjs <max side> <file.glb> [<file.glb> ...]
//   Files are rewritten in place; an image already at or under the maximum side and under 150 KB is left alone.
const fs = require("node:fs");
const { chromium } = require("playwright");

function readGlb(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file}: not a GLB`);
  const jsonLength = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLength).toString());
  const binStart = 20 + jsonLength + 8;
  const bin = buf.subarray(binStart, binStart + buf.readUInt32LE(20 + jsonLength));
  return { json, bin };
}

function writeGlb(file, json, bin) {
  const pad = (b, fill) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4, fill)]);
  const text = pad(Buffer.from(JSON.stringify(json)), 0x20);
  const data = pad(bin, 0);
  const header = Buffer.alloc(12);
  header.write("glTF", 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + text.length + 8 + data.length, 8);
  const chunk = (size, type) => {
    const b = Buffer.alloc(8);
    b.writeUInt32LE(size, 0);
    b.writeUInt32LE(type, 4);
    return b;
  };
  fs.writeFileSync(file, Buffer.concat([header, chunk(text.length, 0x4e4f534a), text, chunk(data.length, 0x004e4942), data]));
}

(async () => {
  const [max, ...files] = process.argv.slice(2);
  if (!max || !files.length) throw new Error("usage: shrink_glb_images.cjs <max side> <file.glb> ...");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const file of files) {
    const { json, bin } = readGlb(file);
    const before = fs.statSync(file).size;
    const replaced = new Map(); // bufferView index -> new bytes
    for (const [i, image] of (json.images ?? []).entries()) {
      if (image.bufferView === undefined) continue;
      const view = json.bufferViews[image.bufferView];
      const bytes = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
      const result = await page.evaluate(
        async ({ data, mime, max, size }) => {
          const image = new Image();
          await new Promise((resolve, reject) => {
            image.onload = resolve;
            image.onerror = reject;
            image.src = `data:${mime};base64,` + data;
          });
          const scale = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight));
          if (scale === 1 && size < 150000) return { keep: true };
          const w = Math.max(1, Math.round(image.naturalWidth * scale)), h = Math.max(1, Math.round(image.naturalHeight * scale));
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(image, 0, 0, w, h);
          const pixels = ctx.getImageData(0, 0, w, h).data;
          let transparent = false;
          for (let p = 3; p < pixels.length; p += 4) if (pixels[p] < 250) { transparent = true; break; }
          const out = transparent ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.88);
          return { keep: false, mime: transparent ? "image/png" : "image/jpeg", data: out.split(",")[1], w, h };
        },
        { data: Buffer.from(bytes).toString("base64"), mime: image.mimeType, max: Number(max), size: bytes.length },
      );
      if (result.keep) continue;
      const out = Buffer.from(result.data, "base64");
      if (out.length >= bytes.length && result.mime === image.mimeType) continue; // never grow an image
      replaced.set(image.bufferView, out);
      image.mimeType = result.mime;
      console.log(`${file} image ${i}: ${bytes.length} -> ${out.length} bytes (${result.w}x${result.h}, ${result.mime})`);
    }
    if (!replaced.size) continue;
    // Re-pack the binary chunk with the new image bytes (4-byte aligned, views in their original order).
    const parts = [];
    let offset = 0;
    json.bufferViews.forEach((view, index) => {
      const data = replaced.get(index) ?? bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
      const pad = (4 - (offset % 4)) % 4;
      if (pad) {
        parts.push(Buffer.alloc(pad));
        offset += pad;
      }
      view.byteOffset = offset;
      view.byteLength = data.length;
      parts.push(Buffer.from(data));
      offset += data.length;
    });
    const packed = Buffer.concat(parts);
    json.buffers = [{ byteLength: packed.length }];
    writeGlb(file, json, packed);
    console.log(`${file}: ${before} -> ${fs.statSync(file).size} bytes`);
  }
  await browser.close();
})();
