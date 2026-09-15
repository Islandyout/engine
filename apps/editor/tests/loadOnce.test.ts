import { test } from "node:test";
import assert from "node:assert/strict";
import { loadOnce } from "../src/editor/loadOnce";

test("calling loadOnce for the same key while pending starts the load once and resolves once", async () => {
  const pending = new Set<number>();
  let starts = 0;
  let resolves = 0;
  let resolve!: (value: string) => void;
  const promise = new Promise<string>((r) => (resolve = r));
  const start = () => {
    starts++;
    return promise;
  };
  // Five entities in a scene all referencing the same not-yet-cached model —
  // this is exactly the case the review flagged: N calls, one load, one
  // completion, not N.
  for (let i = 0; i < 5; i++) {
    loadOnce(
      pending,
      1,
      start,
      () => resolves++,
      () => assert.fail("should not reject"),
    );
  }
  assert.equal(starts, 1, "start() called more than once for the same key");
  assert.ok(pending.has(1));
  resolve("done");
  await promise;
  // Let the .then() microtask queued by loadOnce actually run.
  await Promise.resolve();
  assert.equal(resolves, 1, "onResolve fired more than once");
  assert.ok(!pending.has(1), "key not cleared from pending after resolving");
});

test("a rejection still clears the pending key and calls onReject once", async () => {
  const pending = new Set<number>();
  let rejects = 0;
  const start = () => Promise.reject(new Error("network error"));
  loadOnce(pending, 2, start, () => assert.fail("should not resolve"), () => rejects++);
  loadOnce(pending, 2, start, () => assert.fail("should not resolve"), () => rejects++);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(rejects, 1);
  assert.ok(!pending.has(2));
});

test("a key can be retried after its load settles", async () => {
  const pending = new Set<number>();
  let starts = 0;
  const start = () => {
    starts++;
    return Promise.resolve("ok");
  };
  loadOnce(pending, 3, start, () => {}, () => {});
  await new Promise((r) => setTimeout(r, 0));
  loadOnce(pending, 3, start, () => {}, () => {});
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(starts, 2, "a second call after settling should start a fresh load");
});

test("start() returning undefined does nothing and leaves the key untouched", () => {
  const pending = new Set<number>();
  let called = false;
  loadOnce(
    pending,
    4,
    () => undefined,
    () => (called = true),
    () => (called = true),
  );
  assert.equal(called, false);
  assert.ok(!pending.has(4), "nothing to coalesce against, so nothing should be pending");
});
