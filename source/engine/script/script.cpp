#include "engine/script/script.hpp"

#include <cmath>

extern "C" {
#include "lauxlib.h"
#include "lua.h"
#include "lualib.h"
}

namespace engine::script {

namespace {
// Only meant to catch a runaway loop (an infinite `while true do end`, or
// just a script doing far more work than any per-tick script should need),
// not to limit legitimate work — generous on purpose. Lua's own instruction
// counter, not wall-clock time, so it's deterministic across machines.
constexpr int instruction_budget = 2'000'000;

void instruction_watchdog(lua_State *L, lua_Debug *) {
    luaL_error(L, "exceeded its per-call instruction budget (a runaway loop?)");
}

// save.set(key, value): the C side of the `save` table every VM gets — see
// Runtime's own doc comment (script.hpp) for why it's a table, not a bare
// global. `self` is the owning Runtime, passed as this closure's one
// upvalue (see open_sandboxed_libs below). Values go through the same
// luaL_tolstring conversion error_text uses for error(), so save.set(key,
// {}) or save.set(key, nil) are valid Lua that saves a useless-but-harmless
// string instead of crashing the host, exactly like error() with a
// non-string argument already does.
int lua_save_set(lua_State *L) {
    auto *self = static_cast<Runtime *>(lua_touserdata(L, lua_upvalueindex(1)));
    const char *key = luaL_checkstring(L, 1);
    size_t length = 0;
    const char *text = luaL_tolstring(L, 2, &length);
    self->set_saved(key, std::string(text, length));
    lua_pop(L, 1); // luaL_tolstring's own pushed string
    return 0;
}

// save.get(key): nil for a key nothing has ever set_saved/seed_saved, its
// stored text otherwise. Never errors on a missing key — a script checking
// `if save.get("score") == nil` for "first ever play session" is the
// expected, ordinary use, not a failure case.
int lua_save_get(lua_State *L) {
    auto *self = static_cast<Runtime *>(lua_touserdata(L, lua_upvalueindex(1)));
    const char *key = luaL_checkstring(L, 1);
    std::string value;
    if (self->get_saved(key, value))
        lua_pushlstring(L, value.data(), value.size());
    else
        lua_pushnil(L);
    return 1;
}

// input.down(key): is `key` (a lowercase string the host chose, e.g. "f")
// physically held right now — see Runtime's own doc comment (script.hpp) on
// why this table takes plain strings, not a native key enum.
int lua_input_down(lua_State *L) {
    auto *self = static_cast<Runtime *>(lua_touserdata(L, lua_upvalueindex(1)));
    const char *key = luaL_checkstring(L, 1);
    lua_pushboolean(L, self->key_down(key) ? 1 : 0);
    return 1;
}

// input.pressed(key): did `key` transition from up to down since step()'s
// own last clear (see key_just_pressed's own doc comment, script.hpp) — the
// edge-triggered companion to input.down's level check, for a script that
// wants to react once per press (e.g. trigger a one-shot self.animate) not
// once per tick the key happens to still be held.
int lua_input_pressed(lua_State *L) {
    auto *self = static_cast<Runtime *>(lua_touserdata(L, lua_upvalueindex(1)));
    const char *key = luaL_checkstring(L, 1);
    lua_pushboolean(L, self->key_just_pressed(key) ? 1 : 0);
    return 1;
}

// The only libraries a sandboxed VM ever opens — no io, os, package/require,
// or debug. See Runtime's own doc comment and lua_vendored's CMakeLists.txt
// comment for why those four aren't merely left unopened here but not even
// compiled into the binary at all.
void open_sandboxed_libs(lua_State *L, Runtime *self) {
    luaL_requiref(L, LUA_GNAME, luaopen_base, 1);
    lua_pop(L, 1);
    luaL_requiref(L, LUA_TABLIBNAME, luaopen_table, 1);
    lua_pop(L, 1);
    luaL_requiref(L, LUA_STRLIBNAME, luaopen_string, 1);
    lua_pop(L, 1);
    luaL_requiref(L, LUA_MATHLIBNAME, luaopen_math, 1);
    lua_pop(L, 1);
    luaL_requiref(L, LUA_UTF8LIBNAME, luaopen_utf8, 1);
    lua_pop(L, 1);
    luaL_requiref(L, LUA_COLIBNAME, luaopen_coroutine, 1);
    lua_pop(L, 1);
    // The base library's only members that can load new code from outside
    // the source a script was authored with — removed, not just unused, so
    // there's no path to code this sandbox never saw.
    for (const char *global : {"load", "loadstring", "dofile", "loadfile", "require"}) {
        lua_pushnil(L);
        lua_setglobal(L, global);
    }
    // save.set(key, value) / save.get(key) — see Runtime's own doc comment
    // (script.hpp) for why this is a table with two fields rather than two
    // bare globals. `self` (this VM's owning Runtime) travels into each
    // closure as its one upvalue, the same lightuserdata-upvalue pattern
    // both functions read back via lua_upvalueindex(1).
    lua_newtable(L);
    lua_pushlightuserdata(L, self);
    lua_pushcclosure(L, lua_save_set, 1);
    lua_setfield(L, -2, "set");
    lua_pushlightuserdata(L, self);
    lua_pushcclosure(L, lua_save_get, 1);
    lua_setfield(L, -2, "get");
    lua_setglobal(L, "save");
    // input.down(key) / input.pressed(key) — same lightuserdata-upvalue
    // pattern as save above.
    lua_newtable(L);
    lua_pushlightuserdata(L, self);
    lua_pushcclosure(L, lua_input_down, 1);
    lua_setfield(L, -2, "down");
    lua_pushlightuserdata(L, self);
    lua_pushcclosure(L, lua_input_pressed, 1);
    lua_setfield(L, -2, "pressed");
    lua_setglobal(L, "input");
    lua_sethook(L, instruction_watchdog, LUA_MASKCOUNT, instruction_budget);
}

// Reads a numeric field from the table at the given stack index, falling
// back to `fallback` if the field is absent or not a number — a script that
// clobbers self with a non-number, or deletes a field outright, degrades to
// "that value didn't change this tick" instead of a crash or a NaN
// propagating into physics::step.
float field_or(lua_State *L, int table_index, const char *field, float fallback) {
    lua_getfield(L, table_index, field);
    float result = fallback;
    // NaN/infinity would otherwise sail through lua_isnumber (they are
    // numbers) straight into RigidBody.velocity and from there into every
    // downstream position and collision calculation, corrupting the whole
    // simulation from one bad script -- reject them the same way a
    // non-number field already falls back to "unchanged this tick".
    if (lua_isnumber(L, -1) != 0) {
        const double value = lua_tonumber(L, -1);
        if (std::isfinite(value))
            result = static_cast<float>(value);
    }
    lua_pop(L, 1);
    return result;
}

// The value at the given stack index, as text, even when it isn't a string
// itself: `error({})` or `error(nil)` are valid Lua and would otherwise hand
// lua_tostring's null straight to std::string's constructor -- undefined
// behavior that could crash the host despite step()'s "never escapes"
// contract. luaL_tolstring always produces a real string (via __tostring
// when present, a default `type: address` form otherwise) and always pushes
// exactly one value, which this pops back off before returning.
std::string error_text(lua_State *L, int index) {
    index = lua_absindex(L, index);
    size_t length = 0;
    const char *text = luaL_tolstring(L, index, &length);
    std::string result(text, length);
    lua_pop(L, 1);
    return result;
}
} // namespace

struct Runtime::Instance final {
    lua_State *L{};
    bool broken{false};
    // Whether `compiled_source` reflects an actual compile attempt yet --
    // distinct from compiled_source itself being empty, since "" is a
    // legitimate (if useless) script source in its own right.
    bool compiled{false};
    std::string compiled_source;
    ~Instance() {
        if (L)
            lua_close(L);
    }
};

Runtime::Runtime() = default;
Runtime::~Runtime() = default;

void Runtime::set_error_handler(std::function<void(Entity, const std::string &)> handler) {
    on_error_ = std::move(handler);
}

void Runtime::set_saved(const std::string &key, std::string value) {
    auto it = saved_.find(key);
    if (it != saved_.end() && it->second == value)
        return; // an unchanged rewrite is not a write worth reporting back
    saved_[key] = std::move(value);
    dirty_saves_.insert(key);
}

bool Runtime::get_saved(const std::string &key, std::string &out) const {
    const auto it = saved_.find(key);
    if (it == saved_.end())
        return false;
    out = it->second;
    return true;
}

void Runtime::seed_saved(const std::string &key, std::string value) { saved_[key] = std::move(value); }

std::vector<std::pair<std::string, std::string>> Runtime::take_dirty_saves() {
    std::vector<std::pair<std::string, std::string>> result;
    result.reserve(dirty_saves_.size());
    for (const auto &key : dirty_saves_)
        result.emplace_back(key, saved_.at(key));
    dirty_saves_.clear();
    return result;
}

void Runtime::set_key_down(const std::string &key, bool down) {
    if (down) {
        if (keys_down_.insert(key).second)
            keys_just_pressed_.insert(key); // only a genuine down-edge counts as a press
    } else {
        keys_down_.erase(key);
    }
}

bool Runtime::key_down(const std::string &key) const { return keys_down_.count(key) != 0; }

bool Runtime::key_just_pressed(const std::string &key) const { return keys_just_pressed_.count(key) != 0; }

std::string Runtime::take_animation_request(Entity entity) {
    const auto it = animation_requests_.find(entity);
    if (it == animation_requests_.end())
        return {};
    std::string result = std::move(it->second);
    animation_requests_.erase(it);
    return result;
}

void Runtime::request_animation(Entity entity, std::string clip) { animation_requests_[entity] = std::move(clip); }

void Runtime::step(World &world, float dt) {
    // Drop instances for entities that no longer qualify — Script removed,
    // or the entity itself destroyed — so a VM is never kept running (or a
    // stale broken flag retained) for a script that isn't attached anymore.
    for (auto it = instances_.begin(); it != instances_.end();) {
        if (!world.alive(it->first) || !world.get<Script>(it->first)) {
            it = instances_.erase(it);
        } else {
            ++it;
        }
    }
    for (const auto entity : world.query<Box, physics::RigidBody, Script>()) {
        auto &instance = instances_[entity];
        if (!instance)
            instance = std::make_unique<Instance>();
        const auto &source = world.get<Script>(entity)->source;
        // Recompile from scratch whenever the authored source has actually
        // changed since the VM currently held was built -- including a
        // broken instance, so correcting a typo in the editor lets a script
        // run instead of staying permanently skipped over a source that no
        // longer exists. An unchanged source never re-enters here, so a
        // script that's broken (or simply already compiled) stays that way
        // without repeating its compile attempt every tick.
        if (!instance->compiled || instance->compiled_source != source) {
            if (instance->L) {
                lua_close(instance->L);
                instance->L = nullptr;
            }
            instance->compiled = true;
            instance->compiled_source = source;
            instance->broken = false;
            instance->L = luaL_newstate();
            open_sandboxed_libs(instance->L, this);
            if (luaL_dostring(instance->L, source.c_str()) != LUA_OK) {
                if (on_error_)
                    on_error_(entity, error_text(instance->L, -1));
                lua_close(instance->L);
                instance->L = nullptr;
                instance->broken = true;
            }
        }
        if (instance->broken)
            continue;
        auto &box = *world.get<Box>(entity);
        auto &body = *world.get<physics::RigidBody>(entity);
        lua_State *const L = instance->L;
        lua_newtable(L);
        lua_pushnumber(L, box.center.x);
        lua_setfield(L, -2, "x");
        lua_pushnumber(L, box.center.y);
        lua_setfield(L, -2, "y");
        lua_pushnumber(L, box.center.z);
        lua_setfield(L, -2, "z");
        lua_pushnumber(L, body.velocity.x);
        lua_setfield(L, -2, "vx");
        lua_pushnumber(L, body.velocity.y);
        lua_setfield(L, -2, "vy");
        lua_pushnumber(L, body.velocity.z);
        lua_setfield(L, -2, "vz");
        lua_setglobal(L, "self");

        lua_getglobal(L, "on_tick");
        if (lua_isfunction(L, -1) != 0) {
            lua_pushnumber(L, dt);
            if (lua_pcall(L, 1, 0, 0) != LUA_OK) {
                if (on_error_)
                    on_error_(entity, error_text(L, -1));
                lua_pop(L, 1);
                instance->broken = true;
                continue;
            }
        } else {
            lua_pop(L, 1); // not a function / not defined -- a silent no-op tick, not an error
        }

        lua_getglobal(L, "self");
        if (lua_istable(L, -1) != 0) {
            body.velocity.x = field_or(L, -1, "vx", body.velocity.x);
            body.velocity.y = field_or(L, -1, "vy", body.velocity.y);
            body.velocity.z = field_or(L, -1, "vz", body.velocity.z);
            // self.animate — see Runtime's own doc comment above for why
            // this is read back the same way as vx/vy/vz but stored
            // separately (take_animation_request), not written into a
            // component: a string, not a float, and "what clip means" is
            // entirely the host's business, not physics's.
            lua_getfield(L, -1, "animate");
            if (lua_isstring(L, -1) != 0) {
                const char *clip = lua_tostring(L, -1);
                if (clip[0] != '\0')
                    animation_requests_[entity] = clip;
            }
            lua_pop(L, 1);
        }
        lua_pop(L, 1);
    }
    keys_just_pressed_.clear(); // see key_just_pressed's own doc comment: a whole-tick window
}

} // namespace engine::script
