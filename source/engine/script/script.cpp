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

// The only libraries a sandboxed VM ever opens — no io, os, package/require,
// or debug. See Runtime's own doc comment and lua_vendored's CMakeLists.txt
// comment for why those four aren't merely left unopened here but not even
// compiled into the binary at all.
void open_sandboxed_libs(lua_State *L) {
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
            open_sandboxed_libs(instance->L);
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
        }
        lua_pop(L, 1);
    }
}

} // namespace engine::script
