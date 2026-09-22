#!/usr/bin/env node
// Reusable CLI for adding one new modelCatalog.ts entry from a local .glb or
// .fbx file. Every asset import before this tool (the Quaternius packs, the
// Mixamo animations, F37/F38) hand-rolled its own one-off script
// (tools/import_quaternius_*.py, a throwaway Mixamo build_glb.mjs never
// committed) to do the same mechanical steps: load the file, sanity-check it,
// copy it into assets/source/kit/, and hand-edit modelCatalog.ts. This tool
// is that common case, done once and reusable, so a new "drop in one
// self-contained model" import doesn't need its own bespoke script anymore.
//
// It deliberately does NOT automate combining multiple source files onto one
// mesh/skeleton (the Mixamo three-clip merge, the Quaternius mesh + shared
// animation-library merge tools/import_quaternius_mannequin.py did) -- that
// kind of merge needs source-specific judgment (which bones actually match,
// whether root motion needs stripping) a generic tool can't safely guess at.
// Those stay bespoke, one-off scripts, same as before; this tool exists for
// everything simpler than that.
//
// It also does NOT write assets/CREDITS.md -- a provenance/license claim
// needs a human (or an agent acting on the user's behalf) to actually read
// and vouch for the source, not a script asserting it. It prints a draft
// with the mechanical facts (hash, path, animated) already filled in, to
// paste into CREDITS.md and finish by hand.
//
// Usage:
//   node tools/import_model.mjs <input.glb|.fbx> --category <slug> \
//     --name "<Display Name>" [--id <n>] [--force] [--dry-run]
//
// --category: an existing modelCatalog.ts category (buildings, furniture,
//   nature, roads, signs, vehicles, animals, people, ...) or a new one --
//   a new category's first entry is appended at the end of the file rather
//   than inserted in file order, since categories in modelCatalog.ts aren't
//   themselves kept in any particular order.
// --id: defaults to one past the highest id already in the catalog. Ids are
//   never reused (see modelCatalog.ts's own note on 119-131) even for a
//   removed entry, since a saved scene from before the removal might still
//   reference it.
// --force: overwrite an existing file at the computed destination path.
// --dry-run: do everything except writing assets/source/kit/** or
//   modelCatalog.ts -- prints exactly what would happen.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "../apps/editor/node_modules/three/build/three.module.js";
import { FBXLoader } from "../apps/editor/node_modules/three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "../apps/editor/node_modules/three/examples/jsm/loaders/GLTFLoader.js";
import { GLTFExporter } from "../apps/editor/node_modules/three/examples/jsm/exporters/GLTFExporter.js";

global.THREE = THREE;
// GLTFExporter's binary output path converts a Blob to an ArrayBuffer via
// FileReader, which doesn't exist in Node -- the same minimal polyfill this
// project's own Mixamo import needed.
global.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = buf;
      if (this.onloadend) this.onloadend();
    });
  }
};

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG_PATH = path.join(ROOT, "apps/editor/src/scene/modelCatalog.ts");

function fail(message) {
  console.error(`import_model: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--force" || a === "--dry-run") args[a.slice(2)] = true;
    else if (a.startsWith("--")) args[a.slice(2)] = argv[++i];
    else args._.push(a);
  }
  return args;
}

function toSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

// Loads a model purely for inspection (native size, whether it has
// AnimationClips) -- doesn't decide how the file ends up on disk, see main().
async function loadModel(inputPath, ext, buffer) {
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  if (ext === ".fbx") {
    const group = new FBXLoader().parse(arrayBuffer, "");
    return { scene: group, animations: group.animations };
  }
  if (ext === ".glb") {
    return new Promise((resolve, reject) => {
      new GLTFLoader().parse(
        arrayBuffer,
        "",
        (gltf) => resolve({ scene: gltf.scene, animations: gltf.animations }),
        reject,
      );
    });
  }
  fail(
    `unsupported extension "${ext}" on ${inputPath} -- only .glb and .fbx are ` +
      `supported (a loose .gltf's separate .bin/texture files aren't handled here)`,
  );
}

async function fbxToGlb(scene, animations) {
  const exporter = new GLTFExporter();
  const result = await new Promise((resolve, reject) => {
    exporter.parse(scene, resolve, reject, { binary: true, animations });
  });
  return Buffer.from(result);
}

function existingIds(catalogText) {
  return [...catalogText.matchAll(/id:\s*(\d+)/g)].map((m) => Number(m[1]));
}

// Inserted right after the LAST existing entry of the same category, not
// resorted into alphabetical position -- entries in this file aren't
// strictly contiguous per category already (e.g. "people" ids 132 and 137
// are separated by "animals" entries added in between), so this matches the
// file's own established, simpler convention rather than reordering it.
function insertCatalogEntry(catalogText, entry) {
  const line =
    `  { id: ${entry.id}, category: "${entry.category}", name: "${entry.name}", ` +
    `path: "${entry.path}"${entry.animated ? ", animated: true" : ""} },`;
  const categoryLineRe = new RegExp(
    `^ {2}\\{ id: \\d+, category: "${entry.category.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}".*\\},$`,
    "gm",
  );
  const matches = [...catalogText.matchAll(categoryLineRe)];
  if (matches.length > 0) {
    const last = matches[matches.length - 1];
    const insertAt = last.index + last[0].length;
    return {
      text: catalogText.slice(0, insertAt) + "\n" + line + catalogText.slice(insertAt),
      newCategory: false,
    };
  }
  return { text: catalogText.replace(/\n\];\n/, `\n${line}\n];\n`), newCategory: true };
}

function creditsDraft({ name, category, destRel, hash, animated, nativeSize }) {
  return [
    "",
    `## PASTE INTO assets/CREDITS.md AND FILL IN THE BLANKS ##`,
    "",
    `- source/${destRel}: <source archive/site, license, and how you confirmed the`,
    `  grant applies -- see the existing entries in assets/CREDITS.md for the level`,
    `  of detail expected (an exact-copy claim, a generated-derivative claim, or a`,
    `  merge/re-export claim, matching what actually happened).`,
    "",
    "Hashes (SHA-256):",
    "",
    `- \`assets/source/${destRel}\`: \`${hash}\``,
    "",
    `(mechanical facts only -- name "${name}", category "${category}", ` +
      `animated: ${animated}, native size ${nativeSize.x.toFixed(2)} x ` +
      `${nativeSize.y.toFixed(2)} x ${nativeSize.z.toFixed(2)} -- the provenance ` +
      `and license text above is yours to fill in, not this tool's to assert)`,
    "",
  ].join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = args._[0];
  if (!inputPath)
    fail(
      'usage: node tools/import_model.mjs <input.glb|.fbx> --category <slug> --name "<Display Name>" [--id <n>] [--force] [--dry-run]',
    );
  if (!existsSync(inputPath)) fail(`input file not found: ${inputPath}`);
  if (!args.category) fail("--category is required");
  if (!args.name) fail("--name is required");

  const ext = path.extname(inputPath).toLowerCase();
  const inputBuffer = readFileSync(inputPath);

  const catalogText = readFileSync(CATALOG_PATH, "utf8");
  const ids = existingIds(catalogText);
  const id = args.id !== undefined ? Number(args.id) : Math.max(...ids) + 1;
  if (!Number.isInteger(id) || id < 0) fail(`--id must be a non-negative integer, got "${args.id}"`);
  if (ids.includes(id)) fail(`id ${id} is already used in modelCatalog.ts`);

  const { scene, animations } = await loadModel(inputPath, ext, inputBuffer);
  const nativeSize = new THREE.Box3().setFromObject(scene).getSize(new THREE.Vector3());
  const animated = animations.length > 0;
  if (nativeSize.length() < 1e-6)
    fail(`loaded model has zero/degenerate bounding size -- likely failed to parse ${inputPath} correctly`);

  const slug = toSlug(args.name);
  if (!slug) fail(`--name "${args.name}" produced an empty slug`);
  const destRel = `kit/${args.category}/${slug}.glb`;
  const destAbs = path.join(ROOT, "assets/source", destRel);
  if (existsSync(destAbs) && !args.force)
    fail(`${destAbs} already exists -- pass --force to overwrite it`);

  // .glb is copied byte-for-byte (preserves exact-copy, hash-verifiable
  // provenance, matching this project's established preference wherever the
  // source is already a self-contained .glb); .fbx has no equivalent
  // "copy as-is" option since the catalog only ever loads .glb, so it's
  // re-exported through GLTFExporter instead.
  const outputBuffer = ext === ".glb" ? inputBuffer : await fbxToGlb(scene, animations);
  const hash = sha256(outputBuffer);

  const entry = { id, category: args.category, name: args.name, path: `./${destRel}`, animated };
  const { text: newCatalogText, newCategory } = insertCatalogEntry(catalogText, entry);

  console.log(`id: ${id}`);
  console.log(`category: ${args.category}${newCategory ? " (new)" : ""}`);
  console.log(`name: ${args.name}`);
  console.log(`path: ${entry.path}`);
  console.log(`animated: ${animated} (${animations.length} clip${animations.length === 1 ? "" : "s"})`);
  console.log(
    `native size: ${nativeSize.x.toFixed(3)} x ${nativeSize.y.toFixed(3)} x ${nativeSize.z.toFixed(3)}`,
  );
  console.log(`sha256: ${hash}`);

  if (args["dry-run"]) {
    console.log(`\n[dry run] would write assets/source/${destRel}`);
    console.log(`[dry run] would insert into ${path.relative(ROOT, CATALOG_PATH)}`);
    console.log(creditsDraft({ name: args.name, category: args.category, destRel, hash, animated, nativeSize }));
    return;
  }

  mkdirSync(path.dirname(destAbs), { recursive: true });
  writeFileSync(destAbs, outputBuffer);
  writeFileSync(CATALOG_PATH, newCatalogText);
  console.log(`\nwrote assets/source/${destRel}`);
  console.log(`updated ${path.relative(ROOT, CATALOG_PATH)}`);
  console.log(creditsDraft({ name: args.name, category: args.category, destRel, hash, animated, nativeSize }));
}

main().catch((error) => fail(error.stack ?? String(error)));
