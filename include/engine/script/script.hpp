#pragma once

#include "engine/physics/physics.hpp"
#include "engine/world/world.hpp"
#include <functional>
#include <map>
#include <memory>
#include <set>
#include <string>
#include <utility>
#include <vector>

namespace engine::script {

// Authored per-entity: Lua source defining an `on_tick(dt)` function this
// entity runs every fixed tick. Trivially copyable/movable on purpose — the
// actual Lua VM this source compiles into lives in Runtime, keyed by
// Entity, not here, so this component stays a plain value like Box or
// Health rather than needing to manage a VM's lifetime itself.
struct Script final {
    std::string source;
};

// Owns one Lua VM per (Box, physics::RigidBody, Script) entity, created the
// first tick Runtime::step() sees it and destroyed the tick its entity stops
// qualifying (Script removed, or the entity itself no longer alive) — never
// leaked, never reused across a different entity's source. Deliberately
// requires RigidBody, the same as engine.move/editor.ai in the editor
// bridge: a script controls its entity by writing velocity for physics to
// integrate, not by teleporting its own Box.center directly, so it falls
// under gravity and Collider resolution exactly like every other moving
// entity instead of bypassing them.
//
// Sandboxing: each VM only ever loads base, table, string, math, utf8 and
// coroutine — no io, os, package/require, or debug (see CMakeLists.txt's own
// comment on lua_vendored: those four standard libraries aren't merely left
// unopened, their .c files aren't even compiled into this binary, so there
// is no code path to them at all, accidental or otherwise). A handful of
// base-library entries that exist specifically to load new code from
// outside the sandbox (`load`, `loadstring`, `dofile`) are removed after
// opening the base library, for the same reason: a script's only way to run
// code is the source it was authored with.
//
// Every entity's `self` table exposes self.x/y/z (this tick's Box.center,
// read-only — overwriting them from a script has no effect, matching the
// existing convention that nothing but physics::step ever repositions a
// RigidBody entity directly) and self.vx/vy/vz (this tick's RigidBody
// velocity, read *and* write — the one lever a script actually has, the
// same lever editor.move/editor.ai use in the editor bridge).
//
// A `save` global table is also exposed to every VM: `save.set(key, value)`
// / `save.get(key)`, a small key-value store shared by every script on
// every entity (not per-VM like `self`), for the one thing a script alone
// can't do — remember something across play sessions. A table with two
// fields, not two bare globals named e.g. `save`/`load`, both so the two
// operations read unambiguously at the call site and because `load` is one
// of the base-library names this sandbox removes specifically to prevent
// loading code from outside a script's own source (see
// open_sandboxed_libs's own comment in script.cpp) — reusing that name for
// an unrelated getter would misleadingly suggest it was ever still
// reachable. Values are stored as plain text (through Lua's own tostring
// conversion, so `save.set("hp", self.vx)` and similar are legal even
// though the value isn't already a string); a loaded value that looks
// numeric still works in arithmetic thanks to Lua's usual string-to-number
// coercion, the same as any other stringly-typed value elsewhere in this
// codebase. This class only holds the data in memory for as long as it's
// alive — it has no notion of browsers, files, or disk. Actually persisting
// it across a page reload (or seeding it back in on the next one) is the
// host's job: see set_saved/get_saved/seed_saved/take_dirty_saves below,
// and apps/editor/runtime/bridge.cpp's editor_seed_save/
// editor_take_dirty_saves/editor_dirty_save_key/editor_dirty_save_value for
// the browser host that actually does it via localStorage.
class Runtime final {
public:
    Runtime();
    ~Runtime();
    Runtime(const Runtime &) = delete;
    Runtime &operator=(const Runtime &) = delete;

    // Runs on_tick(dt) for every (Box, RigidBody, Script) entity in world,
    // then writes self.vx/vy/vz back into that entity's RigidBody.velocity.
    // A script that fails to compile, or whose on_tick errors at runtime, is
    // reported once through the error handler (see set_error_handler) and
    // then marked broken: skipped on every later tick rather than retried,
    // so one bad script can't spend every subsequent frame re-failing the
    // same way — unless its Script.source itself changes, which recompiles
    // from scratch (broken or not), so fixing a typo in the editor is enough
    // to bring a script back to life without recreating the entity. An
    // entity with no on_tick function defined is a silent no-op tick, not an
    // error — a script that only wants to run once at load time (global
    // statements outside any function) is a legitimate use, not a mistake.
    void step(World &world, float dt);

    // Called at most once per entity, the first time its script fails to
    // compile or errors at runtime, with that entity and a human-readable
    // message. Unset (the default) means such errors are silently
    // swallowed — matches this codebase's general posture elsewhere (e.g.
    // editor_add's own validation) of never crashing on bad authored input.
    void set_error_handler(std::function<void(Entity, const std::string &)> handler);

    // Called from a script's own save.set(key, value) — see this class's
    // own doc comment on the save table above. A no-op (and never marks
    // key dirty) when value is already exactly what's stored, so a script
    // that calls save.set with an unchanged value every tick doesn't spam
    // take_dirty_saves() with the same key forever.
    void set_saved(const std::string &key, std::string value);

    // What a script's save.get(key) reads. Returns false (out left
    // untouched) for a key nothing has ever set_saved/seed_saved.
    bool get_saved(const std::string &key, std::string &out) const;

    // Seeds a previously-persisted value — e.g. one the host read back from
    // localStorage — before any script runs. Deliberately distinct from
    // set_saved: seeding is the host telling Runtime what it already knows,
    // not a new write, so it never appears in the next take_dirty_saves().
    void seed_saved(const std::string &key, std::string value);

    // Every key a script has actually changed via save.set since the last
    // call to this method, paired with its current value, then clears that
    // pending set. The host (see apps/editor/runtime/bridge.cpp's
    // editor_take_dirty_saves/editor_dirty_save_key/editor_dirty_save_value)
    // polls this once a frame and persists whatever comes back — e.g. to
    // localStorage — so a script's save.set call survives a page reload
    // without Runtime itself knowing anything about browsers or files.
    std::vector<std::pair<std::string, std::string>> take_dirty_saves();

private:
    struct Instance;
    // unique_ptr so Instance (which owns a raw lua_State* the public header
    // must not expose lua.h to obtain) can be forward-declared here; the
    // map itself still never relocates a live Instance on insert/erase of a
    // different entity, same guarantee World::Store<T>'s std::map gives.
    std::map<Entity, std::unique_ptr<Instance>> instances_;
    std::function<void(Entity, const std::string &)> on_error_;
    // The save table's actual backing store — one shared map for every VM
    // this Runtime owns (see the class's own doc comment above for why this
    // is global to Runtime, not per-Instance like self.x/y/z).
    std::map<std::string, std::string> saved_;
    // Keys set_saved has actually changed since the last take_dirty_saves()
    // call — a set, not a vector, so a key written more than once between
    // polls is still reported exactly once, with its latest value.
    std::set<std::string> dirty_saves_;
};

} // namespace engine::script
