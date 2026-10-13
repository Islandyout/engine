import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { propertyMetadata } from "../src/editor/PropertyMetadata";

// Every field a scene author can set has code that reads it. A field that is
// declared, saved and shown in the inspector but read nowhere else does
// nothing when changed. Read-only (derived) fields are exempt.
test("every authored component field has a consumer", () => {
  const src = fileURLToPath(new URL("../src", import.meta.url));
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = path.join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : [];
    });
  // Files that declare, describe, validate, author or display fields without
  // giving them an effect.
  const declarers = new Set(
    [
      "scene/Components.ts",
      "scene/SceneSerializer.ts",
      "editor/PropertyMetadata.ts",
      "editor/componentHelp.ts",
      "editor/inspector.ts",
      "editor/inspectorWidgets.ts",
      "editor/contentCheck.ts",
      "authoring/CommandInterpreter.ts",
    ].map((f) => path.join(src, f)),
  );
  const code = walk(src)
    .filter((f) => !declarers.has(f))
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");
  const components = readFileSync(path.join(src, "scene/Components.ts"), "utf8");
  const unread: string[] = [];
  let fields = 0;
  for (const [, component, body] of components.matchAll(/export interface (\w+)Component \{([\s\S]*?)\n\}/g)) {
    for (const [, field] of body!.matchAll(/^\s+(\w+)\??:/gm)) {
      fields++;
      if (propertyMetadata(component!, field!).readOnly) continue;
      const read = new RegExp(`\\.${field}\\b|\\b${field}\\b[^:\\n]*\\}\\s*=|\\["${field}"\\]`);
      if (!read.test(code)) unread.push(`${component}.${field}`);
    }
  }
  assert.ok(fields > 100, `parsed ${fields} fields from Components.ts`);
  assert.deepEqual(unread, [], "fields nothing reads");
});
