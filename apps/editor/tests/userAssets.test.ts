import { test } from "node:test";
import assert from "node:assert/strict";
import { assetKind, assignId, displayName, resolveAssetUrl, type StoredAsset } from "../src/editor/userAssets";

test("asset kinds by extension", () => {
  assert.equal(assetKind("Tree.GLB"), "model");
  assert.equal(assetKind("logo.png"), "image");
  assert.equal(assetKind("hit.ogg"), "sound");
  assert.equal(assetKind("notes.txt"), undefined);
  assert.equal(displayName("Big Tree.glb"), "Big Tree");
});

test("ids start at 10000, re-imports keep theirs", () => {
  const blob = new Blob([]);
  const existing: StoredAsset[] = [
    { id: 10000, kind: "model", name: "a.glb", type: "", data: blob },
    { id: 10001, kind: "sound", name: "b.ogg", type: "", data: blob },
  ];
  assert.equal(assignId([], "model", "x.glb"), 10000);
  assert.equal(assignId(existing, "model", "a.glb"), 10000);
  assert.equal(assignId(existing, "image", "a.glb"), 10002);
});

test("asset: references resolve to imported images", () => {
  const images = new Map([["logo.png", "blob:abc"]]);
  assert.equal(resolveAssetUrl("asset:logo.png", images), "blob:abc");
  assert.equal(resolveAssetUrl("asset:missing.png", images), "");
  assert.equal(resolveAssetUrl("./kit/x.png", images), "./kit/x.png");
});
