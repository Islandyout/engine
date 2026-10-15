import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CommandInterpreter } from "../src/authoring/CommandInterpreter";
import { commandTemplates } from "../src/authoring/commandTemplates";
import { Scene } from "../src/scene/Scene";
import { fuzzyRank, fuzzyScore } from "../src/editor/fuzzy";
import { cardOpen, loadOpenState, saveOpenState, setAll } from "../src/editor/inspectorState";

test("fuzzy matching ranks exact, prefix, word start, inside and scattered matches in that order", () => {
  assert.equal(fuzzyScore("", "anything"), 0);
  assert.equal(fuzzyScore("xyz", "Sword"), -1);
  const exact = fuzzyScore("sword", "Sword");
  const prefix = fuzzyScore("sword", "Sword 2");
  const word = fuzzyScore("shield", "Round shield");
  const inside = fuzzyScore("hiel", "Round shield");
  const scattered = fuzzyScore("rdsh", "Round shield");
  assert.ok(exact > prefix && prefix > word && word > inside && inside > scattered && scattered > 0, `${exact} ${prefix} ${word} ${inside} ${scattered}`);
  // camelCase and separators count as word starts.
  assert.ok(fuzzyScore("cc", "CharacterController") > fuzzyScore("cc", "Accent"));
  // Every word of a multi-word query has to match.
  assert.ok(fuzzyScore("round sh", "Round shield") > 0);
  assert.equal(fuzzyScore("round axe", "Round shield"), -1);
  // In long text (a description) only the words themselves match, not
  // letters scattered over a sentence.
  const description = "A working town to start from: signalised junctions, zoned blocks, traffic and people.";
  assert.ok(fuzzyScore("junction", description) > 0);
  assert.equal(fuzzyScore("gatebreak", description), -1);
});

test("fuzzyRank keeps only matches, best first (the tighter of two prefixes), ties in their original order", () => {
  const names = ["Pickup truck", "Police car", "Pistol", "Sword", "Spear"];
  assert.deepEqual(fuzzyRank(names, "p", (n) => n), ["Pistol", "Police car", "Pickup truck", "Spear"]);
  assert.deepEqual(fuzzyRank(["Oak b", "Oak a"], "oak", (n) => n), ["Oak b", "Oak a"]);
  assert.deepEqual(fuzzyRank(names, "pis", (n) => n), ["Pistol"]);
  assert.deepEqual(fuzzyRank(names, "", (n) => n), names);
  // Several texts per item (a model's name and its category).
  const models = [
    { name: "Oak", category: "nature" },
    { name: "Pistol", category: "weapons" },
  ];
  assert.deepEqual(
    fuzzyRank(models, "weap", (m) => [m.name, m.category]).map((m) => m.name),
    ["Pistol"],
  );
});

test("inspector cards: problems always open, then as last left, else the main components", () => {
  assert.equal(cardOpen("Transform", {}, false), true);
  assert.equal(cardOpen("Particles", {}, false), false);
  assert.equal(cardOpen("Particles", { Particles: true }, false), true);
  assert.equal(cardOpen("Transform", { Transform: false }, false), false);
  assert.equal(cardOpen("Particles", { Particles: false }, true), true);
  assert.deepEqual(setAll({ Light: true }, ["Transform", "Particles"], false), { Light: true, Transform: false, Particles: false });
});

test("inspector open state survives in storage and tolerates bad or missing storage", () => {
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  saveOpenState({ Particles: true }, storage);
  assert.deepEqual(loadOpenState(storage), { Particles: true });
  store.set("game-engine-editor:inspector-open", "{not json");
  assert.deepEqual(loadOpenState(storage), {});
  store.set("game-engine-editor:inspector-open", JSON.stringify({ A: true, B: "yes", C: false }));
  assert.deepEqual(loadOpenState(storage), { A: true, C: false });
  const throwing = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };
  assert.deepEqual(loadOpenState(throwing), {});
  saveOpenState({ A: true }, throwing);
  assert.deepEqual(loadOpenState(undefined), {});
});

test("the console's command search lists every command the interpreter knows, each with a runnable example", () => {
  const interpreter = new CommandInterpreter(new Scene());
  const names = commandTemplates.map((t) => t.name);
  assert.equal(new Set(names).size, names.length);
  for (const t of commandTemplates) {
    assert.equal(t.example.command, t.name);
    const result = interpreter.execute(t.example) as { ok: boolean; error?: string };
    assert.ok(!String(result.error ?? "").startsWith("unknown command"), `${t.name}: ${result.error}`);
  }
  // And the other way round: every case in the interpreter's switch is listed.
  const source = readFileSync(new URL("../src/authoring/CommandInterpreter.ts", import.meta.url), "utf8");
  const switchBody = source.slice(source.indexOf("switch (command.command)"), source.indexOf("unknown command"));
  const cases = [...switchBody.matchAll(/case "([a-z_]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...cases].sort(), [...names].sort());
});
