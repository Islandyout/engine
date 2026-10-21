// Downscales ambientCG texture JPGs (CC0) to a power-of-two size with the browser's canvas, for the terrain's detail layers.
//   node tools/models/downscale_textures.cjs <size> <out dir> <in.jpg>:<out name> ...
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
(async () => {
  const [size, outDir, ...pairs] = process.argv.slice(2);
  if (!size || !outDir || !pairs.length) throw new Error("usage: downscale_textures.cjs <size> <out dir> <in.jpg>:<out name> ...");
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const pair of pairs) {
    const [input, name] = pair.split(":");
    const data = fs.readFileSync(input).toString("base64");
    const jpeg = await page.evaluate(async ({ data, size }) => {
      const image = new Image();
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = "data:image/jpeg;base64," + data; });
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(image, 0, 0, size, size);
      return canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
    }, { data, size: Number(size) });
    fs.writeFileSync(path.join(outDir, name), Buffer.from(jpeg, "base64"));
    console.log(`wrote ${path.join(outDir, name)}`);
  }
  await browser.close();
})();
