#!/usr/bin/env node
// Packages one authored scene into a standalone, shareable "player" build:
// a copy of the already-built editor (build/site/, produced by `npm run
// build --prefix apps/editor` or tools/build_editor.sh) with the scene baked
// in and every editor-only affordance hidden -- just the game, not the tool
// that made it. No separate rendering/simulation code: it's the exact same
// browser build every round of this project has already tested, just with
// main.ts's own player-mode bootstrap (see its own comment) picking up the
// baked-in scene instead of localStorage/the default empty scene, and
// style.css's `.player-mode` rule hiding the chrome around the viewport.
//
// Usage:
//   node tools/export_build.mjs <scene.json> [--out <dir>] [--name <title>] [--force]
//
// --out: defaults to build/export/<scene file's own basename>.
// --name: overrides the exported page's <title>; defaults to the input
//   filename's stem (e.g. "my-level.json" -> "my-level").
// --force: overwrite an existing --out directory.
//
// Not done here: trimming the copied kit/**/audio/** down to only the
// assets this specific scene actually references -- every bundled asset is
// copied wholesale (same as build/site/ itself already does), simpler and
// safer than cross-referencing Renderable.mesh/Sound.clip ids against
// modelCatalog.ts/soundCatalog.ts, at the cost of a larger export than a
// single small scene strictly needs.

import { readFileSync, writeFileSync, existsSync, cpSync, rmSync, statSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE_DIR = path.join(ROOT, "build/site");

function fail(message) {
  console.error(`export_build: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--force") args.force = true;
    else if (a.startsWith("--")) args[a.slice(2)] = argv[++i];
    else args._.push(a);
  }
  return args;
}

// Recursively sums file sizes for the printed summary -- purely informational.
function dirSize(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    total += entry.isDirectory() ? dirSize(full) : statSync(full).size;
  }
  return total;
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

// True if `dir` is `target` itself or a directory containing it -- i.e.
// deleting `dir` would destroy `target`. Guards --out against resolving to
// (or above) the repository root or build/site: --out . --force would
// otherwise recursively delete the whole checkout before cpSync even runs,
// and --out build/site --force would delete the very source being copied
// from. The normal case (--out under build/export/, the default) is neither.
function destroys(dir, target) {
  const rel = path.relative(dir, target);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const scenePath = args._[0];
  if (!scenePath)
    fail('usage: node tools/export_build.mjs <scene.json> [--out <dir>] [--name <title>] [--force]');
  if (!existsSync(scenePath)) fail(`scene file not found: ${scenePath}`);
  if (!existsSync(path.join(SITE_DIR, "index.html")))
    fail(
      `${path.relative(ROOT, SITE_DIR)}/index.html not found -- build the editor first ` +
        `("npm run build --prefix apps/editor" or tools/build_editor.sh)`,
    );

  const sceneText = readFileSync(scenePath, "utf8");
  try {
    JSON.parse(sceneText);
  } catch (error) {
    fail(`${scenePath} is not valid JSON: ${error.message}`);
  }

  const stem = path.basename(scenePath, path.extname(scenePath));
  const outDir = args.out ? path.resolve(args.out) : path.join(ROOT, "build/export", stem);
  if (destroys(outDir, ROOT) || destroys(outDir, SITE_DIR))
    fail(`--out ${outDir} would delete the repository checkout or its own build source -- refusing`);
  if (existsSync(outDir)) {
    if (!args.force) fail(`${outDir} already exists -- pass --force to overwrite it`);
    rmSync(outDir, { recursive: true });
  }

  cpSync(SITE_DIR, outDir, { recursive: true });

  const htmlPath = path.join(outDir, "index.html");
  let html = readFileSync(htmlPath, "utf8");

  // vite.config.ts's `base: "/engine/"` makes the built index.html reference
  // its script/stylesheet at an absolute path meant for exactly where the
  // editor itself is deployed -- irrelevant (and broken) for an export meant
  // to be hosted anywhere, or shared as a standalone folder, so every
  // "/<anything>/assets/" reference is rewritten relative. Nothing else in
  // the build references that base path (checked: it appears nowhere inside
  // the built JS bundle itself, only in these two HTML tags).
  html = html.replace(/(src|href)="\/[^"]+\/assets\//g, '$1="./assets/');

  // HTML-escaped, and substituted via a replacer function rather than a
  // plain string -- String.replace's string form treats a literal "$" in
  // the replacement specially ($&, $1, ...), which a --name containing one
  // would otherwise silently corrupt; a function form doesn't. Escaping
  // guards against a --name containing "</title>" injecting markup into the
  // exported page.
  const title = escapeHtml(args.name ?? stem);
  html = html.replace(/<title>[^<]*<\/title>/, () => `<title>${title}</title>`);

  // The scene is embedded as literal JSON text, not re-serialized -- avoids
  // any risk of this tool's own JSON.stringify subtly changing a value
  // EditorDocument.load() would parse differently (e.g. number formatting).
  // Every "<" is escaped, not just "</script" -- HTML's script-data parser
  // has its own escaped/double-escaped states triggered by "<!--" followed
  // by "<script" appearing in a script element's text; a free-text field a
  // scene author fully controls (Script.source, an entity Name, ...)
  // containing that sequence could otherwise desync the parser so the real
  // closing </script> below is read as text instead of ending the tag,
  // corrupting the embedded JSON and leaving the exported player with an
  // empty scene. Escaping every "<" as < sidesteps the whole class of
  // parser-state tricks rather than chasing each one.
  const escapedScene = sceneText.replace(/</g, "\\u003c");
  html = html.replace(
    "</body>",
    () => `<script type="application/json" id="exported-scene">${escapedScene}</script>\n</body>`,
  );

  writeFileSync(htmlPath, html);

  const sizeMb = (dirSize(outDir) / (1024 * 1024)).toFixed(1);
  console.log(`wrote ${path.relative(ROOT, outDir)} (${sizeMb} MB)`);
  console.log(
    `\nThis must be served over HTTP, not opened via file:// -- the game fetches its ` +
      `models/audio at runtime, and browsers block fetch() from a file:// page. Try:\n` +
      `  npx serve ${path.relative(ROOT, outDir)}`,
  );
}

main();
