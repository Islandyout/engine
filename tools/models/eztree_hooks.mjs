// Node module hooks that let tools/models/make_trees.mjs run ez-tree's browser
// source (as shipped in the @dgreenheck/ez-tree npm package) under Node:
//   - "three" resolves to the editor's own three.js;
//   - extensionless relative imports ("./rng") get ".js";
//   - JSON presets and image imports become modules (an image is its path);
//   - textures.js, which loads images through the DOM, is swapped for a stub
//     that hands back empty textures carrying the repeat the tree asked for
//     (make_trees.mjs embeds the real image files itself).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

let three;
export function initialize(data) {
  three = data.three;
}

export async function resolve(specifier, context, next) {
  if (specifier === "three") return { url: three, shortCircuit: true };
  if (/^\.\.?\//.test(specifier) && !/\.[a-z]+$/i.test(specifier)) {
    try {
      return await next(`${specifier}.js`, context);
    } catch {
      return next(`${specifier}/index.js`, context);
    }
  }
  return next(specifier, context);
}

const TEXTURES_STUB = `
import * as THREE from "three";
const texture = (name, scale = { x: 1, y: 1 }) => {
  const t = new THREE.Texture();
  t.name = name;
  t.repeat.set(scale.x, 1 / scale.y);
  return t;
};
export const getBarkTexture = (type, file, scale) => texture(type + "/" + file, scale);
export const getLeafTexture = (type) => texture(type);
`;

export async function load(url, context, next) {
  if (url.endsWith("/src/lib/textures.js")) return { format: "module", source: TEXTURES_STUB, shortCircuit: true };
  if (url.endsWith(".json")) return { format: "module", source: `export default ${readFileSync(fileURLToPath(url), "utf8")};`, shortCircuit: true };
  if (/\.(jpe?g|png)$/i.test(url)) return { format: "module", source: `export default ${JSON.stringify(fileURLToPath(url))};`, shortCircuit: true };
  return next(url, context);
}
