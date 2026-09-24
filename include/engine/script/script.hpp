#pragma once

#include "engine/physics/physics.hpp"
#include "engine/world/world.hpp"
#include <functional>
#include <optional>
#include <map>
#include <memory>
#include <set>
#include <string>
#include <cstdint>
#include <utility>
#include <vector>

struct lua_State;

namespace engine::script {

// Authored per-entity: Lua source defining an `on_tick(dt)` function this
// entity runs every fixed tick. Trivially copyable/movable on purpose — the
// actual Lua VM this source compiles into lives in Runtime, keyed by
// Entity, not here, so this component stays a plain value like Box or
// Health rather than needing to manage a VM's lifetime itself.
struct Script final {
    std::string source;
    // Inspector-editable values the source reads through the `props` global
    // (see Runtime's doc comment). Declared in the source with
    // `-- @prop name default` lines; the editor keeps this list in sync.
    struct Prop final {
        enum class Kind { number, boolean, text };
        std::string name;
        Kind kind{Kind::number};
        double number{};
        bool boolean{};
        std::string text;
    };
    std::vector<Prop> props;

    Script() = default;
    Script(std::string source_text, std::vector<Prop> prop_values = {}) // NOLINT: implicit on purpose
        : source(std::move(source_text)), props(std::move(prop_values)) {}
};

// What a script can ask of the application embedding this Runtime, beyond
// Box/RigidBody (which Runtime reads and writes itself). The editor bridge
// implements it; a Runtime without a host simply makes these Lua calls
// return nil / do nothing.
class Host {
public:
    virtual ~Host() = default;
    // First living entity whose name is exactly `name`.
    virtual std::optional<Entity> find(const World &world, const std::string &name) = 0;
    virtual std::string name_of(const World &world, Entity entity) = 0;
    // Instantiate the prefab called `prefab`. Called mid-tick, so the host
    // must use World's deferred create/set; the returned handle becomes
    // alive when the current system finishes.
    virtual std::optional<Entity> spawn(World &world, const std::string &prefab, Vec3 position,
                                        Vec3 velocity) = 0;
    // Deferred destroy, same timing as spawn.
    virtual void destroy(World &world, Entity entity) = 0;
    virtual bool health(const World &world, Entity entity, float &current, float &max) = 0;
    virtual void damage(World &world, Entity entity, float amount) = 0;
    // A request for something outside the simulation: "sound" (a = clip),
    // "ui_text" (a = UI element name, b = text), "log" (a = message).
    virtual void emit(Entity source, const std::string &kind, const std::string &a, const std::string &b) = 0;
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
// Every entity's `self` table exposes self.id, self.name, self.grounded,
// self.x/y/z and self.vx/vy/vz. Since 0.49.0 all six numbers are
// read-write: writing a velocity steers the body through physics, and
// writing a position teleports it. Only fields a callback actually changes
// are written back. `self` is rebuilt before every callback, so keep your
// own state in globals, not in `self`.
//
// Callbacks (all optional): on_start(), on_tick(dt), on_destroy(),
// on_collision_enter/stay/exit(other), on_trigger_enter/stay/exit(other),
// on_message(name, value, sender). Entities are integer ids.
//
// Globals: props (inspector values), time (dt, now, frame), world (find,
// name, alive, position, set_position, velocity, set_velocity, spawn,
// destroy, health, damage, raycast, overlap, send), physics (add_force,
// add_impulse), sound.play, ui.set_text, log, and after/every/cancel/
// start/wait for timers and coroutines. world/sound/ui/log go through the
// Host; without one they return nil or do nothing.
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
//
// An `input` global table gives every VM read access to the keyboard:
// `input.down(key)` (true while `key` is physically held) and
// `input.pressed(key)` (true only on the tick(s) the host reported `key`
// transitioning from up to down since the last time this Runtime's
// pending-press set was drained — see set_key_down's own doc comment).
// `key` is a lowercase string (e.g. "f", "1", " "), not a native engine::Key
// or a browser KeyCode — Runtime has no notion of either; it's whatever
// string the host chooses to report, so it's the host's job (main.ts's own
// keydown/keyup listeners) to decide which physical keys exist at all and
// what to call them. Unlike self.vx/vy/vz (per-VM) or save (Runtime-wide,
// read AND write from any script), input is Runtime-wide and read-only from
// Lua's side — a script can react to a key, never simulate one being
// pressed.
//
// A script also gets one write, `self.animate = "clipName"`, to request a
// one-shot animation on its own entity — the same self table self.vx/vy/vz
// already use, since this is exactly that table's job: the one channel
// between a script and its own entity. Like self.vx/vy/vz, self.animate is
// read back only after on_tick returns and only if it's actually a string
// this tick (self is a fresh table every tick, so a script requests one
// again each time it wants it re-triggered, the same way self.vx must be
// re-set every tick to keep moving rather than being "sticky"). Runtime
// itself has no idea what a clip even is — playing it, and deciding what
// happens if the entity's model doesn't have a clip by that name, is
// entirely the host's job (main.ts's own AnimationMixer/actions, the same
// one startDeath() already drives) — see take_animation_request below and
// apps/editor/runtime/bridge.cpp's editor_take_animation_request for how
// the request actually reaches it.
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
    // Also clears whatever key_just_pressed() reported true, once every
    // entity's on_tick this call has run — see key_just_pressed's own doc
    // comment for why that's a whole-tick window, not per entity.
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

    // Called by the host once per physical keydown/keyup edge (not once per
    // tick, and not polled — an edge the host never reports is simply never
    // known to Runtime), before the next step() call that edge should be
    // visible to. down=true on a genuine down-edge marks key_just_pressed
    // true for every entity's on_tick during the very next step() call only
    // (step() clears it once that call finishes — see step()'s own doc
    // comment); down=false only clears key_down and never marks a press.
    void set_key_down(const std::string &key, bool down);

    // What a script's input.down(key) reads: is `key` physically held right
    // now, per the host's own most recent set_key_down("key", ...) call.
    bool key_down(const std::string &key) const;

    // What a script's input.pressed(key) reads: did `key` transition from up
    // to down since the last time step() cleared this set (i.e. since the
    // previous tick) — true for every entity's on_tick during the one
    // step() call right after the down-edge was reported, false again on
    // every call after that until another down-edge arrives.
    bool key_just_pressed(const std::string &key) const;

    // Whatever this entity's self.animate = "clipName" requested this tick,
    // or "" if it didn't request one -- taken once per entity per host poll
    // (see apps/editor/runtime/bridge.cpp's editor_take_animation_request)
    // and cleared on read, so a request is only ever handed to the host
    // once.
    std::string take_animation_request(Entity entity);

    void set_host(Host *host) { host_ = host; }
    // Calls on_collision_enter/stay/exit(other) and on_trigger_enter/stay/
    // exit(other) on both entities of every event, for entities whose
    // script defines them. Call once after each physics::step().
    void dispatch_contacts(World &world, const physics::Events &events);
    // Seconds of simulated time this Runtime has stepped (`time.now`).
    [[nodiscard]] double now() const { return now_; }

private:
    friend struct LuaApi;
    struct Instance;
    // Stable Lua-side integer ids for entities (Entity itself is opaque).
    std::int64_t id_of(Entity entity);
    std::optional<Entity> entity_of(std::int64_t id) const;
    // Runs `function_name` in an entity's VM with `self`/`time` refreshed
    // before and self written back after. `push_args` pushes `nargs` values.
    void call(World &world, Entity entity, Instance &instance, const char *function_name,
              const std::function<void(lua_State *)> &push_args, int nargs);
    Host *host_{};
    World *world_{};
    double now_{};
    std::uint64_t frame_{};
    float dt_{};
    std::map<Entity, std::int64_t> ids_;
    std::map<std::int64_t, Entity> entities_by_id_;
    std::int64_t next_id_{1};
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
    // Keys currently physically held, and keys that transitioned to held
    // since step()'s own last clear -- see set_key_down/key_down/
    // key_just_pressed's own doc comments. Runtime-wide (like saved_), not
    // per-Instance -- every script sees the same keyboard.
    std::set<std::string> keys_down_;
    std::set<std::string> keys_just_pressed_;
    // One pending self.animate request per entity, read back after on_tick
    // runs (see the class's own doc comment on self.animate above) and
    // taken by the host via take_animation_request.
    std::map<Entity, std::string> animation_requests_;
};

} // namespace engine::script
