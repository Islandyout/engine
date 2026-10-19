import type { Ctx } from "./context";

export function installSaves(C: Ctx): void {
  // Keyed by document.title, not a fixed string -- the exported standalone
  // player (see export_build.mjs) sets <title> per export, so two different
  // exported games hosted under the same browser origin get separate save
  // data instead of silently sharing (and clobbering) one localStorage
  // bucket. The ordinary (non-exported) editor's title never changes, so
  // its own Play-mode testing always shares one namespace -- the same
  // single-instance-per-origin assumption CommandInterpreter.ts's own
  // LocalStorageSceneStore already makes for the document autosave.
  //
  // Both components go through encodeURIComponent, not raw string
  // concatenation, so neither can ever contain the literal ":" this
  // function's own format uses as a separator -- title "Quest:Part" with
  // key "score" and title "Quest" with key "Part:score" would otherwise
  // both produce the exact same joined key (and the prefix scan below
  // would then import one game's data into the other's), since ":" is
  // valid both in export_build.mjs's --name and in an ordinary Lua string.
  function saveKey(key: string): string {
    return `game-engine-editor:save:${encodeURIComponent(document.title)}:${encodeURIComponent(key)}`;
  }

  // Restores every previously-persisted save key into the freshly committed
  // Runtime before any script's on_tick runs -- see
  // engine::script::Runtime::seed_saved's own doc comment (script.hpp) for
  // why this must happen before the first tick, not lazily on first
  // save.get(). localStorage has no "list keys under this prefix" call, so
  // this walks every key in the whole store once -- fine, since it only
  // ever runs once per syncRuntime() (Play, or Stop-then-Play again), not
  // per frame. Wrapped in one try/catch: a sandboxed iframe without
  // allow-same-origin (or any other context denying storage access) throws
  // a SecurityError on the very first property read, not just a specific
  // call -- treated as an empty store (a script's save.get sees nil for
  // everything, same as a real first-ever session) rather than a reason
  // Play can never start, since syncRuntime()'s caller only sets
  // doc.mode = "play" after this returns.
  function seedSavedProgress() {
    const prefix = saveKey("");
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const fullKey = localStorage.key(i);
        if (!fullKey || !fullKey.startsWith(prefix)) continue;
        const value = localStorage.getItem(fullKey);
        if (value !== null) C.runtime.ccall("editor_seed_save", null, ["string", "string"], [decodeURIComponent(fullKey.slice(prefix.length)), value]);
      }
    } catch {
      // Storage access denied -- see this function's own doc comment above.
    }
  }

  // Polls whatever a script's save.set has actually changed since the last
  // call (see editor_take_dirty_saves's own doc comment, bridge.cpp) and
  // writes each one to localStorage -- the one place this file touches
  // browser persistence for game save data, called once per rendered frame
  // from frame() below, not per fixed tick (a save doesn't need tick
  // granularity, and localStorage writes are comparatively expensive).
  // setItem can throw (QuotaExceededError, or storage access denied);
  // caught per key, not left to escape frame() before its own trailing
  // requestAnimationFrame(frame) call, which would otherwise permanently
  // freeze rendering and simulation over a single oversized or
  // storage-denied save.
  function persistDirtySaves() {
    const count = C.runtime._editor_take_dirty_saves();
    for (let i = 0; i < count; i++) {
      const key = C.runtime.ccall("editor_dirty_save_key", "string", ["number"], [i]);
      const value = C.runtime.ccall("editor_dirty_save_value", "string", ["number"], [i]);
      C.failedSaveWrites.set(key, value);
    }
    for (const [key, value] of C.failedSaveWrites) {
      try {
        localStorage.setItem(saveKey(key), value);
        C.failedSaveWrites.delete(key);
      } catch {
        // Still failing -- leave it queued for the next frame's retry.
      }
    }
  }
  Object.assign(C, { seedSavedProgress, persistDirtySaves });
}
