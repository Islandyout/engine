import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { LocalGames, manifestFor, parseGamesIndex, slugify } from "../src/editor/gamesLibrary";

const root = path.resolve(import.meta.dirname, "../../..");

function manifests(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? manifests(path.join(dir, e.name)) : e.name === "game.json" ? [path.join(dir, e.name)] : [],
  );
}

test("every games/ manifest names an existing scene", () => {
  const found = manifests(path.join(root, "games"));
  assert.ok(found.length >= 1);
  const slugs = new Set<string>();
  for (const m of found) {
    const game = JSON.parse(readFileSync(m, "utf8"));
    assert.equal(typeof game.name, "string");
    assert.ok(existsSync(path.resolve(path.dirname(m), game.scene)), m);
    const slug = path.basename(path.dirname(m));
    assert.ok(!slugs.has(slug));
    slugs.add(slug);
  }
  assert.ok(slugs.has("city-template"));
  assert.ok(!slugs.has("pale-signal"), "Pale Signal is retired (its systems stay in the engine)");
  assert.ok(!slugs.has("last-signal"));
  assert.ok(!slugs.has("high-heat"));
});

test("parseGamesIndex keeps valid rows and sanitises the rest", () => {
  const games = parseGamesIndex({
    games: [
      { slug: "city-template", name: "City Template", group: "engine", accent: "#8fbf6a" },
      { slug: "../evil", name: "x" },
      { slug: "mine", name: "Mine", group: "bogus", accent: "red;background:url(x)" },
      { name: "no slug" },
    ],
  });
  assert.equal(games.length, 2);
  assert.equal(games[0].page, "city-template.html");
  assert.equal(games[0].scene, "games/city-template.json");
  assert.equal(games[1].group, "folder");
  assert.equal(games[1].accent, "#8ab4ff");
  assert.deepEqual(parseGamesIndex(null), []);
});

test("LocalGames saves, replaces by name and removes", () => {
  const data = new Map<string, string>();
  const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
  const games = new LocalGames(store);
  const a = games.save("Star Runner", "{}", 1);
  games.save("Other", "{}", 2);
  games.save("Star Runner", '{"v":2}', 3);
  assert.equal(games.list().length, 2);
  assert.equal(games.list()[0].scene, '{"v":2}');
  games.remove(games.list()[0].id);
  assert.equal(games.list().length, 1);
  assert.notEqual(a.id, "");
  data.set("game-engine-editor:my-games", "not json");
  assert.deepEqual(games.list(), []);
});

test("slugify and manifestFor", () => {
  assert.equal(slugify("  Star Runner 2! "), "star-runner-2");
  assert.equal(slugify("!!!"), "my-game");
  assert.equal(JSON.parse(manifestFor("X")).scene, "scene.json");
});
