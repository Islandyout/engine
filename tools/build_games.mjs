#!/usr/bin/env node
// Publishes every game under games/ (any folder holding a game.json) as
// build/site/<folder>.html via tools/export_build.mjs, copies each scene to
// build/site/games/<folder>.json so the editor's Games library can open it
// for editing, and writes build/site/games.json -- the library's index.
//
// Usage: node tools/build_games.mjs   (after the editor is built)

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const GAMES = path.join(ROOT, "games");
const SITE = path.join(ROOT, "build/site");

export function findManifests(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findManifests(full));
    else if (entry.name === "game.json") out.push(full);
  }
  return out.sort();
}

function slugOf(manifestPath) {
  const slug = path.basename(path.dirname(manifestPath)).toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  if (!slug || slug === "index" || slug === "games") throw new Error(`bad game folder name: ${manifestPath}`);
  return slug;
}

function main() {
  if (!existsSync(path.join(SITE, "index.html"))) {
    console.error("build_games: build the editor first (npm run build --prefix apps/editor)");
    process.exit(1);
  }
  mkdirSync(path.join(SITE, "games"), { recursive: true });
  const index = [];
  const seen = new Set();
  for (const manifestPath of findManifests(GAMES)) {
    const game = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (!game.name || !game.scene) throw new Error(`${manifestPath}: needs "name" and "scene"`);
    const slug = slugOf(manifestPath);
    if (seen.has(slug)) throw new Error(`two games use the folder name "${slug}"`);
    seen.add(slug);
    const scenePath = path.resolve(path.dirname(manifestPath), game.scene);
    if (!existsSync(scenePath) || !statSync(scenePath).isFile()) throw new Error(`${manifestPath}: scene not found: ${game.scene}`);
    execFileSync("node", [path.join(ROOT, "tools/export_build.mjs"), scenePath, "--page", `${slug}.html`, "--name", game.name, "--force"], { stdio: "inherit" });
    writeFileSync(path.join(SITE, "games", `${slug}.json`), readFileSync(scenePath));
    const rel = path.relative(GAMES, manifestPath).split(path.sep);
    index.push({
      slug,
      name: String(game.name),
      genre: String(game.genre ?? ""),
      description: String(game.description ?? ""),
      accent: String(game.accent ?? "#8ab4ff"),
      group: game.builtin ? "engine" : rel[0] === "my-games" ? "mine" : "folder",
      page: `${slug}.html`,
      scene: `games/${slug}.json`,
    });
  }
  writeFileSync(path.join(SITE, "games.json"), JSON.stringify({ games: index }, null, 2));
  console.log(`build_games: published ${index.length} game(s)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
