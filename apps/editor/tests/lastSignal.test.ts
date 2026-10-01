import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { validateSceneDocument } from "../src/scene/SceneSerializer";

const committed = new URL("../../../examples/fps/last-signal.json", import.meta.url);

test("examples/fps/last-signal.json is what tools/fps/build_last_signal.ts generates", () => {
  const out = join(mkdtempSync(join(tmpdir(), "last-signal-")), "level.json");
  execFileSync(process.execPath, ["--import", "tsx", "../../tools/fps/build_last_signal.ts"], {
    env: { ...process.env, LS_OUT: out, LS_START: "" },
    stdio: "pipe",
  });
  assert.equal(
    readFileSync(out, "utf8"),
    readFileSync(committed, "utf8"),
    "regenerate it with `npm run fps --prefix apps/editor`",
  );
});

test("LAST SIGNAL is a valid scene with its mission entities", () => {
  const scene = JSON.parse(readFileSync(committed, "utf8"));
  validateSceneDocument(scene);
  const names = new Set(scene.entities.map((e: { name?: string }) => e.name));
  for (const name of ["Player", "Director", "Generator A", "Generator B", "Generator C", "Uplink", "North Gate", "Deploy"])
    assert.ok(names.has(name), name);
  for (const prefab of ["Rifleman", "Rusher", "Heavy", "Ammo Crate", "Med Kit", "Launcher Rounds", "Generator Wreck"])
    assert.ok(scene.prefabs[prefab], prefab);
  const director = scene.entities.find((e: { name?: string }) => e.name === "Director").components.Script.source;
  assert.ok(!director.includes("{{CONFIG}}") && director.includes("local UPLINK_SECONDS = 60"));
});
