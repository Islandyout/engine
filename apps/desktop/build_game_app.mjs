#!/usr/bin/env node
// Packages one game as its own Linux app (AppImage and .deb) that opens full screen on the laptop's graphics card.
//   node build_game_app.mjs <game folder name> [--dir]     (--dir: an unpacked folder to run, no installer)
// Needs the built site (build/site, from tools/build_editor.sh) and `npm install` in apps/desktop.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const [slug, flag] = process.argv.slice(2);
if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
  console.error("usage: node build_game_app.mjs <game folder name> [--dir]");
  process.exit(2);
}
const games = JSON.parse(fs.readFileSync(path.join(here, "../../build/site/games.json"), "utf8")).games;
const game = games.find((g) => g.slug === slug);
if (!game) {
  console.error(`no game "${slug}" in build/site/games.json; have: ${games.map((g) => g.slug).join(", ")}`);
  process.exit(1);
}
const args = [
  "electron-builder", "--linux", flag === "--dir" ? "dir" : "AppImage", ...(flag === "--dir" ? [] : ["deb"]),
  `--config.productName=${game.name}`,
  `--config.appId=dev.btai.game.${slug}`,
  `--config.extraMetadata.name=btai-game-${slug}`,
  `--config.extraMetadata.btai.game=${slug}`,
  `--config.directories.output=dist-games/${slug}`, "--publish", "never",
];
const r = spawnSync("npx", args, { cwd: here, stdio: "inherit" });
process.exit(r.status ?? 1);
