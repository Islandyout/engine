#include "engine/script/script.hpp"
#include "api_prelude.hpp"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>

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

// Timers and coroutines, in Lua itself: after/every/cancel schedule
// callbacks, start runs a coroutine that can wait(seconds). __tick(dt) is
// called by Runtime before every on_tick. Timer handles are increasing
// integers and are fired in handle order, so behavior is deterministic.
constexpr const char *prelude = R"lua(
local timers, next_handle, routines = {}, 1, {}
function after(seconds, fn) local h = next_handle; next_handle = h + 1; timers[h] = {left = seconds, fn = fn}; return h end
function every(seconds, fn) local h = next_handle; next_handle = h + 1; timers[h] = {left = seconds, fn = fn, period = seconds}; return h end
function cancel(h) timers[h] = nil end
function wait(seconds) coroutine.yield(seconds or 0) end
local function resume(entry)
  local ok, result = coroutine.resume(entry.co)
  if not ok then error(result, 0) end
  if coroutine.status(entry.co) == "dead" then return false end
  entry.left = tonumber(result) or 0
  return true
end
function start(fn)
  local entry = {co = coroutine.create(fn), left = 0}
  if resume(entry) then routines[#routines + 1] = entry end
  return entry.co
end
function __tick(dt)
  local handles = {}
  for h in pairs(timers) do handles[#handles + 1] = h end
  table.sort(handles)
  for _, h in ipairs(handles) do
    local t = timers[h]
    if t then
      t.left = t.left - dt
      if t.left <= 0 then
        if t.period and t.period > 0 then t.left = t.left + t.period else timers[h] = nil end
        t.fn()
      end
    end
  end
  local still = {}
  for _, entry in ipairs(routines) do
    entry.left = entry.left - dt
    if entry.left > 0 or resume(entry) then still[#still + 1] = entry end
  end
  routines = still
end
)lua";
} // namespace

struct Runtime::Instance final {
    lua_State *L{};
    bool broken{false};
    // Whether `compiled_source` reflects an actual compile attempt yet --
    // distinct from compiled_source itself being empty, since "" is a
    // legitimate (if useless) script source in its own right.
    bool compiled{false};
    bool started{false};
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

std::int64_t Runtime::id_of(Entity entity) {
    const auto found = ids_.find(entity);
    if (found != ids_.end())
        return found->second;
    const auto id = next_id_++;
    ids_.emplace(entity, id);
    entities_by_id_.emplace(id, entity);
    return id;
}

std::optional<Entity> Runtime::entity_of(std::int64_t id) const {
    const auto found = entities_by_id_.find(id);
    if (found == entities_by_id_.end())
        return std::nullopt;
    return found->second;
}

// The Lua-facing API. A friend of Runtime so these C functions can reach the
// world being stepped, the host and the id table; each closure carries its
// Runtime as upvalue 1.
struct LuaApi final {
    static Runtime &runtime(lua_State *L) {
        return *static_cast<Runtime *>(lua_touserdata(L, lua_upvalueindex(1)));
    }
    static std::optional<Entity> entity_arg(lua_State *L, int index) {
        auto &self = runtime(L);
        if (!self.world_ || lua_isinteger(L, index) == 0)
            return std::nullopt;
        const auto entity = self.entity_of(lua_tointeger(L, index));
        if (!entity || !self.world_->alive(*entity))
            return std::nullopt;
        return entity;
    }
    static float number_arg(lua_State *L, int index, float fallback = 0.0F) {
        const double value = luaL_optnumber(L, index, fallback);
        return std::isfinite(value) ? static_cast<float>(value) : fallback;
    }
    static void push_entity(lua_State *L, std::optional<Entity> entity) {
        if (entity)
            lua_pushinteger(L, runtime(L).id_of(*entity));
        else
            lua_pushnil(L);
    }

    static int find(lua_State *L) {
        auto &self = runtime(L);
        const char *name = luaL_checkstring(L, 1);
        push_entity(L, self.host_ && self.world_ ? self.host_->find(*self.world_, name) : std::nullopt);
        return 1;
    }
    static int name(lua_State *L) {
        auto &self = runtime(L);
        const auto entity = entity_arg(L, 1);
        if (!entity || !self.host_)
            return lua_pushnil(L), 1;
        const auto text = self.host_->name_of(*self.world_, *entity);
        lua_pushlstring(L, text.data(), text.size());
        return 1;
    }
    static int alive(lua_State *L) {
        lua_pushboolean(L, entity_arg(L, 1).has_value() ? 1 : 0);
        return 1;
    }
    static int position(lua_State *L) {
        const auto entity = entity_arg(L, 1);
        const Box *box = entity ? runtime(L).world_->get<Box>(*entity) : nullptr;
        if (!box)
            return lua_pushnil(L), 1;
        lua_pushnumber(L, box->center.x);
        lua_pushnumber(L, box->center.y);
        lua_pushnumber(L, box->center.z);
        return 3;
    }
    static int set_position(lua_State *L) {
        const auto entity = entity_arg(L, 1);
        Box *box = entity ? runtime(L).world_->get<Box>(*entity) : nullptr;
        if (box)
            box->center = {number_arg(L, 2, box->center.x), number_arg(L, 3, box->center.y),
                           number_arg(L, 4, box->center.z)};
        return 0;
    }
    static int velocity(lua_State *L) {
        const auto entity = entity_arg(L, 1);
        const auto *body = entity ? runtime(L).world_->get<physics::RigidBody>(*entity) : nullptr;
        if (!body)
            return lua_pushnil(L), 1;
        lua_pushnumber(L, body->velocity.x);
        lua_pushnumber(L, body->velocity.y);
        lua_pushnumber(L, body->velocity.z);
        return 3;
    }
    static int set_velocity(lua_State *L) {
        const auto entity = entity_arg(L, 1);
        auto *body = entity ? runtime(L).world_->get<physics::RigidBody>(*entity) : nullptr;
        if (body)
            body->velocity = {number_arg(L, 2, body->velocity.x), number_arg(L, 3, body->velocity.y),
                              number_arg(L, 4, body->velocity.z)};
        return 0;
    }
    static int spawn(lua_State *L) {
        auto &self = runtime(L);
        const char *prefab = luaL_checkstring(L, 1);
        if (!self.host_ || !self.world_)
            return lua_pushnil(L), 1;
        push_entity(L, self.host_->spawn(*self.world_, prefab,
                                         {number_arg(L, 2), number_arg(L, 3), number_arg(L, 4)},
                                         {number_arg(L, 5), number_arg(L, 6), number_arg(L, 7)}));
        return 1;
    }
    static int destroy(lua_State *L) {
        auto &self = runtime(L);
        const auto entity = entity_arg(L, 1);
        if (entity && self.host_)
            self.host_->destroy(*self.world_, *entity);
        return 0;
    }
    static int health(lua_State *L) {
        auto &self = runtime(L);
        const auto entity = entity_arg(L, 1);
        float current{}, max{};
        if (!entity || !self.host_ || !self.host_->health(*self.world_, *entity, current, max))
            return lua_pushnil(L), 1;
        lua_pushnumber(L, current);
        lua_pushnumber(L, max);
        return 2;
    }
    static int damage(lua_State *L) {
        auto &self = runtime(L);
        const auto entity = entity_arg(L, 1);
        if (entity && self.host_)
            self.host_->damage(*self.world_, *entity, number_arg(L, 2));
        return 0;
    }
    // world.heal(id, amount): restores Health up to its maximum.
    static int heal(lua_State *L) {
        auto &self = runtime(L);
        const auto entity = entity_arg(L, 1);
        if (entity && self.host_)
            self.host_->heal(*self.world_, *entity, number_arg(L, 2));
        return 0;
    }
    // world.give_ammo(id, rounds[, slot]): adds reserve rounds to another
    // entity's weapon (slot is 1-based; default its current weapon).
    static int give_ammo(lua_State *L) {
        auto &self = runtime(L);
        const auto entity = entity_arg(L, 1);
        std::vector<double> out;
        if (entity && self.host_)
            self.host_->weapon(*self.world_, *entity, "give_ammo",
                               {static_cast<double>(luaL_checkinteger(L, 2)),
                                static_cast<double>(luaL_optinteger(L, 3, 0) - 1)},
                               out);
        return 0;
    }
    // world.raycast(ox, oy, oz, dx, dy, dz, max[, layer_mask]) ->
    //   hit (entity id, or "ground"), distance, x, y, z, nx, ny, nz -- or nil
    //   (n is the unit surface normal at the hit point)
    static int raycast(lua_State *L) {
        auto &self = runtime(L);
        if (!self.world_)
            return lua_pushnil(L), 1;
        physics::QueryFilter filter;
        filter.layer_mask = static_cast<std::uint32_t>(luaL_optinteger(L, 8, physics::all_layers));
        const auto hit = physics::raycast(*self.world_, {number_arg(L, 1), number_arg(L, 2), number_arg(L, 3)},
                                          {number_arg(L, 4), number_arg(L, 5), number_arg(L, 6)},
                                          number_arg(L, 7, 100.0F),
                                          self.physics_config_ ? *self.physics_config_ : physics::Config{}, filter);
        if (!hit)
            return lua_pushnil(L), 1;
        if (hit->hit_ground)
            lua_pushstring(L, "ground");
        else
            push_entity(L, hit->entity);
        lua_pushnumber(L, hit->distance);
        lua_pushnumber(L, hit->point.x);
        lua_pushnumber(L, hit->point.y);
        lua_pushnumber(L, hit->point.z);
        lua_pushnumber(L, hit->normal.x);
        lua_pushnumber(L, hit->normal.y);
        lua_pushnumber(L, hit->normal.z);
        return 8;
    }
    // world.overlap(x, y, z, radius[, layer_mask]) -> array of entity ids
    static int overlap(lua_State *L) {
        auto &self = runtime(L);
        physics::QueryFilter filter;
        filter.layer_mask = static_cast<std::uint32_t>(luaL_optinteger(L, 5, physics::all_layers));
        const Vec3 center{number_arg(L, 1), number_arg(L, 2), number_arg(L, 3)};
        const float radius = number_arg(L, 4);
        lua_newtable(L);
        if (!self.world_)
            return 1;
        lua_Integer i = 1;
        for (const auto entity : physics::overlap_sphere(*self.world_, center, radius, filter)) {
            lua_pushinteger(L, self.id_of(entity));
            lua_rawseti(L, -2, i++);
        }
        return 1;
    }
    // world.path(x, y, z, tx, ty, tz) -> array of {x=, y=, z=} waypoints
    // around obstacles (the last one is the goal or the closest reachable
    // point), an empty array when already there, or nil when unreachable.
    static int path(lua_State *L) {
        auto &self = runtime(L);
        if (!self.nav_)
            return lua_pushnil(L), 1;
        const auto points = self.nav_->find_path({number_arg(L, 1), number_arg(L, 2), number_arg(L, 3)},
                                                 {number_arg(L, 4), number_arg(L, 5), number_arg(L, 6)});
        if (!points)
            return lua_pushnil(L), 1;
        lua_createtable(L, static_cast<int>(points->size()), 0);
        lua_Integer i = 1;
        for (const auto &point : *points) {
            lua_createtable(L, 0, 3);
            lua_pushnumber(L, point.x);
            lua_setfield(L, -2, "x");
            lua_pushnumber(L, point.y);
            lua_setfield(L, -2, "y");
            lua_pushnumber(L, point.z);
            lua_setfield(L, -2, "z");
            lua_rawseti(L, -2, i++);
        }
        return 1;
    }
    // world.send(id, name[, value]): calls on_message(name, value, sender)
    // in the target's script right away. value may be nil, a boolean, a
    // number or a string (tables can't cross between entities' VMs).
    static int send(lua_State *L) {
        auto &self = runtime(L);
        const auto target = entity_arg(L, 1);
        const std::string message = luaL_checkstring(L, 2);
        if (!target || !self.world_)
            return 0;
        const auto found = self.instances_.find(*target);
        if (found == self.instances_.end() || !found->second || found->second->broken || !found->second->L)
            return 0;
        const int type = lua_type(L, 3);
        const bool boolean = lua_toboolean(L, 3) != 0;
        const double number = type == LUA_TNUMBER ? lua_tonumber(L, 3) : 0;
        // An integer stays an integer: "G" .. 3 is "G3", but "G" .. 3.0 is "G3.0".
        const bool integer = type == LUA_TNUMBER && lua_isinteger(L, 3) != 0;
        const lua_Integer whole = integer ? lua_tointeger(L, 3) : 0;
        const std::string text = type == LUA_TSTRING ? lua_tostring(L, 3) : "";
        lua_getglobal(L, "self");
        lua_getfield(L, -1, "id");
        const lua_Integer sender = lua_tointeger(L, -1);
        lua_pop(L, 2);
        if (found->second->L == L)
            return 0; // sending to yourself: just call your own function directly
        self.call(*self.world_, *target, *found->second, "on_message",
                  [&](lua_State *T) {
                      lua_pushlstring(T, message.data(), message.size());
                      if (type == LUA_TBOOLEAN)
                          lua_pushboolean(T, boolean ? 1 : 0);
                      else if (integer)
                          lua_pushinteger(T, whole);
                      else if (type == LUA_TNUMBER)
                          lua_pushnumber(T, number);
                      else if (type == LUA_TSTRING)
                          lua_pushlstring(T, text.data(), text.size());
                      else
                          lua_pushnil(T);
                      lua_pushinteger(T, sender);
                  },
                  3);
        return 0;
    }
    static Entity self_entity(lua_State *L) {
        lua_getglobal(L, "self");
        lua_getfield(L, -1, "id");
        const auto entity = runtime(L).entity_of(lua_tointeger(L, -1));
        lua_pop(L, 2);
        return entity.value_or(Entity{});
    }
    static void emit(lua_State *L, const char *kind, const std::string &a, const std::string &b) {
        auto &self = runtime(L);
        if (self.host_)
            self.host_->emit(self_entity(L), kind, a, b);
    }
    static int play_sound(lua_State *L) {
        emit(L, "sound", luaL_checkstring(L, 1), "");
        return 0;
    }
    // sound.play_at(clip, x, y, z[, volume]): a positional one-shot.
    static int play_sound_at(lua_State *L) {
        char where[160];
        std::snprintf(where, sizeof where, "%.3f,%.3f,%.3f,%.3f", number_arg(L, 2), number_arg(L, 3), number_arg(L, 4),
                      number_arg(L, 5, 1.0F));
        emit(L, "sound_at", luaL_checkstring(L, 1), where);
        return 0;
    }
    // sound.volume(bus, 0..1): bus is master, sfx, music, ambient or ui.
    static int sound_volume(lua_State *L) {
        emit(L, "sound_volume", luaL_checkstring(L, 1), std::to_string(number_arg(L, 2, 1.0F)));
        return 0;
    }
    static int set_ui_text(lua_State *L) {
        size_t length = 0;
        const char *text = luaL_tolstring(L, 2, &length);
        const std::string value(text, length);
        lua_pop(L, 1);
        emit(L, "ui_text", luaL_checkstring(L, 1), value);
        return 0;
    }
    // anim.set(name, value) / anim.trigger(name): Animator parameters,
    // forwarded to the host (the Animator runs editor-side).
    static int anim_set(lua_State *L) {
        const char *name = luaL_checkstring(L, 1);
        luaL_checkany(L, 2);
        size_t length = 0;
        const char *text = luaL_tolstring(L, 2, &length);
        const std::string value(text, length);
        lua_pop(L, 1);
        emit(L, "anim_set", name, value);
        return 0;
    }
    static int anim_trigger(lua_State *L) {
        emit(L, "anim_trigger", luaL_checkstring(L, 1), "");
        return 0;
    }
    // camera.shake(intensity, seconds): editor-side screen shake.
    static int camera_shake(lua_State *L) {
        emit(L, "camera_shake", std::to_string(number_arg(L, 1, 0.3F)), std::to_string(number_arg(L, 2, 0.4F)));
        return 0;
    }
    // particles.burst(count) / particles.set_emitting(bool) on this entity's
    // Particles emitter (simulated editor-side).
    // weapon.fire([dx, dy, dz]) / weapon.reload() / weapon.select(slot) /
    // weapon.ammo() -> magazine, reserve, slot, reloading / weapon.give_ammo(n[, slot])
    // Slots are 1-based in Lua. Each returns nothing (or nil from ammo) when
    // the entity has no Weapons.
    static int weapon_call(lua_State *L, const char *op, std::vector<double> args) {
        auto &self = runtime(L);
        std::vector<double> out;
        if (!self.host_ || !self.world_ || !self.host_->weapon(*self.world_, self_entity(L), op, args, out))
            return 0;
        for (const double value : out)
            lua_pushnumber(L, value);
        return static_cast<int>(out.size());
    }
    static int weapon_fire(lua_State *L) {
        if (lua_isnoneornil(L, 1))
            return weapon_call(L, "fire", {});
        return weapon_call(L, "fire", {number_arg(L, 1), number_arg(L, 2), number_arg(L, 3)});
    }
    static int weapon_reload(lua_State *L) { return weapon_call(L, "reload", {}); }
    static int weapon_select(lua_State *L) {
        return weapon_call(L, "select", {static_cast<double>(luaL_checkinteger(L, 1) - 1)});
    }
    static int weapon_ammo(lua_State *L) {
        const int count = weapon_call(L, "ammo", {});
        if (count == 4) {
            // Report the slot 1-based.
            const double slot = lua_tonumber(L, -2);
            lua_pushnumber(L, slot + 1);
            lua_replace(L, -3);
        }
        return count;
    }
    static int weapon_give_ammo(lua_State *L) {
        return weapon_call(L, "give_ammo",
                           {static_cast<double>(luaL_checkinteger(L, 1)), static_cast<double>(luaL_optinteger(L, 2, 0) - 1)});
    }
    // melee.*(...) on this entity: see Host::melee.
    static int melee_call(lua_State *L, const char *op, std::vector<double> args, const std::string &text = {},
                          std::optional<Entity> other = std::nullopt) {
        auto &self = runtime(L);
        std::vector<double> out;
        std::string text_out;
        std::optional<Entity> other_out;
        if (!self.host_ || !self.world_ ||
            !self.host_->melee(*self.world_, self_entity(L), op, args, text, other, out, text_out, other_out))
            return lua_pushnil(L), 1;
        if (std::string_view(op) == "perform")
            return lua_pushboolean(L, !out.empty() && out[0] != 0), 1;
        if (std::string_view(op) == "target") {
            if (other_out)
                lua_pushinteger(L, self.id_of(*other_out));
            else
                lua_pushnil(L);
            return 1;
        }
        int count = 0;
        if (!text_out.empty() || std::string_view(op) == "state" || std::string_view(op) == "move") {
            lua_pushstring(L, text_out.c_str());
            ++count;
        }
        for (const double value : out) {
            lua_pushnumber(L, value);
            ++count;
        }
        return count;
    }
    // melee.perform(name) -> started
    static int melee_perform(lua_State *L) { return melee_call(L, "perform", {}, luaL_checkstring(L, 1)); }
    // melee.state() -> mode, combo, energy, energy max, guard
    static int melee_state(lua_State *L) { return melee_call(L, "state", {}); }
    // melee.move() -> the current move's name ("" when none)
    static int melee_move(lua_State *L) { return melee_call(L, "move", {}); }
    static int melee_set_energy(lua_State *L) { return melee_call(L, "set_energy", {number_arg(L, 1)}); }
    // melee.lock(id) / melee.lock() releases
    static int melee_lock(lua_State *L) { return melee_call(L, "lock", {}, {}, entity_arg(L, 1)); }
    static int melee_target(lua_State *L) { return melee_call(L, "target", {}); }
    // melee.unlock(name) -> found: a locked move becomes usable
    static int melee_unlock(lua_State *L) { return melee_call(L, "unlock", {}, luaL_checkstring(L, 1)); }
    // melee.stagger() -> poise bar 0..1, broken (1 while Broken)
    static int melee_stagger(lua_State *L) { return melee_call(L, "stagger", {}); }
    // melee.tune(damage, speed, crit, skill, health_max?, mana_max?) -> the four scales
    static int melee_tune(lua_State *L) {
        return melee_call(L, "tune",
                          {number_arg(L, 1, -1.0F), number_arg(L, 2, -1.0F), number_arg(L, 3, -1.0F),
                           number_arg(L, 4, -1.0F), number_arg(L, 5, -1.0F), number_arg(L, 6, -1.0F)});
    }
    // melee.set_ai(on, aggression?, skill?)
    static int melee_set_ai(lua_State *L) {
        return melee_call(L, "set_ai",
                          {lua_toboolean(L, 1) ? 1.0 : 0.0, number_arg(L, 2, -1.0F), number_arg(L, 3, -1.0F)});
    }
    // vehicle.*(id, ...): see Host::vehicle.
    static int vehicle_call(lua_State *L, const char *op, std::vector<double> args, const std::string &text = {},
                            std::optional<Entity> other = std::nullopt) {
        auto &self = runtime(L);
        const auto entity = entity_arg(L, 1);
        std::vector<double> out;
        if (!entity || !self.host_ || !self.world_ ||
            !self.host_->vehicle(*self.world_, *entity, op, args, text, other, out))
            return lua_pushnil(L), 1;
        for (const double value : out)
            lua_pushnumber(L, value);
        if (out.empty())
            lua_pushboolean(L, 1);
        return out.empty() ? 1 : static_cast<int>(out.size());
    }
    // vehicle.state(id) -> speed, forward, gear, rpm, nitro, drifting, boosting, yaw, slip
    static int vehicle_state(lua_State *L) {
        const int count = vehicle_call(L, "state", {});
        if (count < 9)
            return count;
        // drifting and boosting as booleans
        const bool boosting = lua_tonumber(L, -3) != 0, drifting = lua_tonumber(L, -4) != 0;
        lua_pushboolean(L, drifting ? 1 : 0);
        lua_replace(L, -5);
        lua_pushboolean(L, boosting ? 1 : 0);
        lua_replace(L, -4);
        return count;
    }
    static int vehicle_set_nitro(lua_State *L) { return vehicle_call(L, "set_nitro", {number_arg(L, 2)}); }
    static int vehicle_reset(lua_State *L) {
        return vehicle_call(L, "reset", {number_arg(L, 2), number_arg(L, 3), number_arg(L, 4), number_arg(L, 5)});
    }
    static int vehicle_freeze(lua_State *L) { return vehicle_call(L, "freeze", {lua_toboolean(L, 2) ? 1.0 : 0.0}); }
    static int vehicle_set_route(lua_State *L) {
        return vehicle_call(L, "route", {lua_toboolean(L, 3) ? 1.0 : 0.0}, luaL_checkstring(L, 2));
    }
    static int vehicle_set_target(lua_State *L) {
        return vehicle_call(L, "target", {}, {}, entity_arg(L, 2));
    }
    static int vehicle_set_mode(lua_State *L) { return vehicle_call(L, "mode", {}, luaL_checkstring(L, 2)); }
    static int vehicle_set_speed_scale(lua_State *L) { return vehicle_call(L, "speed_scale", {number_arg(L, 2)}); }
    // space.*(...): see Host::space.
    static bool space_call(lua_State *L, const char *op, const std::vector<double> &args, const std::string &text,
                           std::vector<double> &out, std::string &text_out) {
        auto &self = runtime(L);
        return self.host_ && self.world_ && self.host_->space(*self.world_, op, args, text, out, text_out);
    }
    static int space_simple(lua_State *L, const char *op, const std::vector<double> &args, const std::string &text = {}) {
        std::vector<double> out;
        std::string text_out;
        lua_pushboolean(L, space_call(L, op, args, text, out, text_out) ? 1 : 0);
        return 1;
    }
    static void set_number(lua_State *L, const char *key, double value) {
        lua_pushnumber(L, value);
        lua_setfield(L, -2, key);
    }
    static void set_bool(lua_State *L, const char *key, bool value) {
        lua_pushboolean(L, value ? 1 : 0);
        lua_setfield(L, -2, key);
    }
    static void set_string(lua_State *L, const char *key, const std::string &value) {
        lua_pushstring(L, value.c_str());
        lua_setfield(L, -2, key);
    }
    // space.state() -> {altitude, speed, vertical_speed, ground_speed,
    // throttle, fuel, fuel_max, hull, hull_max, heat, landed, piloting,
    // density, warp, periapsis, apoapsis, time, destroyed, x, y, z,
    // orbit_closed, g, site_distance, latitude, longitude, body, assist, target}
    static int space_state(lua_State *L) {
        std::vector<double> out;
        std::string text;
        if (!space_call(L, "state", {}, {}, out, text) || out.size() < 24)
            return lua_pushnil(L), 1;
        lua_createtable(L, 0, 36);
        static const char *const numbers[] = {"altitude", "speed", "vertical_speed", "ground_speed", "throttle",
                                              "fuel", "fuel_max", "hull", "hull_max", "heat"};
        for (std::size_t i = 0; i < 10; ++i)
            set_number(L, numbers[i], out[i]);
        set_bool(L, "landed", out[10] != 0);
        set_bool(L, "piloting", out[11] != 0);
        set_number(L, "density", out[12]);
        set_number(L, "warp", out[13]);
        set_number(L, "periapsis", out[14]);
        set_number(L, "apoapsis", out[15]);
        set_number(L, "time", out[16]);
        set_bool(L, "destroyed", out[17] != 0);
        set_number(L, "x", out[18]);
        set_number(L, "y", out[19]);
        set_number(L, "z", out[20]);
        set_bool(L, "orbit_closed", out[21] != 0);
        set_number(L, "g", out[22]);
        set_number(L, "site_distance", out[23]);
        if (out.size() >= 26) {
            set_number(L, "latitude", out[24]);
            set_number(L, "longitude", out[25]);
        }
        const auto first = text.find(';');
        const auto second = first == std::string::npos ? std::string::npos : text.find(';', first + 1);
        set_string(L, "body", text.substr(0, first));
        set_string(L, "assist", first == std::string::npos ? "" : text.substr(first + 1, second - first - 1));
        const auto third = second == std::string::npos ? std::string::npos : text.find(';', second + 1);
        set_string(L, "target", second == std::string::npos ? "" : text.substr(second + 1, third - second - 1));
        const auto fourth = third == std::string::npos ? std::string::npos : text.find(';', third + 1);
        const auto fifth = fourth == std::string::npos ? std::string::npos : text.find(';', fourth + 1);
        set_string(L, "frame", third == std::string::npos ? "" : text.substr(third + 1, fourth - third - 1));
        set_bool(L, "away", out.size() >= 27 && out[26] != 0);
        // 0.73.0: component condition, autopilot, reserve, site.
        if (out.size() >= 34) {
            set_number(L, "engine", out[27]);
            set_number(L, "rcs", out[28]);
            set_number(L, "gear", out[29]);
            set_number(L, "scanner", out[30]);
            set_bool(L, "autopilot", out[31] != 0);
            set_bool(L, "reserve_used", out[32] != 0);
        }
        set_string(L, "site", fourth == std::string::npos ? "" : text.substr(fourth + 1, fifth - fourth - 1));
        set_string(L, "autopilot_phase", fifth == std::string::npos ? "" : text.substr(fifth + 1));
        return 1;
    }
    // space.events() -> {"touchdown", "liftoff", ...} since the last call
    static int space_events(lua_State *L) {
        std::vector<double> out;
        std::string text;
        if (!space_call(L, "events", {}, {}, out, text))
            return lua_pushnil(L), 1;
        lua_newtable(L);
        lua_Integer n = 0;
        std::size_t start = 0;
        while (start < text.size()) {
            auto end = text.find('\n', start);
            if (end == std::string::npos)
                end = text.size();
            if (end > start) {
                lua_pushlstring(L, text.data() + start, end - start);
                lua_rawseti(L, -2, ++n);
            }
            start = end + 1;
        }
        return 1;
    }
    static int space_set_warp(lua_State *L) { return space_simple(L, "warp", {number_arg(L, 1)}); }
    static int space_set_assist(lua_State *L) { return space_simple(L, "assist", {}, luaL_checkstring(L, 1)); }
    static int space_set_target(lua_State *L) {
        return space_simple(L, "target", {}, lua_isnoneornil(L, 1) ? std::string{} : luaL_checkstring(L, 1));
    }
    static int space_refuel(lua_State *L) {
        return space_simple(L, "refuel", {lua_isnoneornil(L, 1) ? -1.0 : number_arg(L, 1)});
    }
    static int space_tune(lua_State *L) { return space_simple(L, "tune", {number_arg(L, 2)}, luaL_checkstring(L, 1)); }
    // space.spec() -> {thrust, lift, fuel, hull, heat, rcs}
    static int space_spec(lua_State *L) {
        std::vector<double> out;
        std::string text;
        if (!space_call(L, "spec", {}, {}, out, text) || out.size() < 6)
            return lua_pushnil(L), 1;
        lua_createtable(L, 0, 6);
        set_number(L, "thrust", out[0]);
        set_number(L, "lift", out[1]);
        set_number(L, "fuel", out[2]);
        set_number(L, "hull", out[3]);
        set_number(L, "heat", out[4]);
        set_number(L, "rcs", out[5]);
        return 1;
    }
    static int space_set_fuel(lua_State *L) { return space_simple(L, "set_fuel", {number_arg(L, 1)}); }
    static int space_repair(lua_State *L) {
        return space_simple(L, "repair", {lua_isnoneornil(L, 1) ? -1.0 : number_arg(L, 1)});
    }
    static int space_board(lua_State *L) { return space_simple(L, "board", {}); }
    static int space_exit(lua_State *L) { return space_simple(L, "exit", {}); }
    static int space_set_controls(lua_State *L) {
        return space_simple(L, "controls", {lua_toboolean(L, 1) ? 1.0 : 0.0});
    }
    static int space_place_landed(lua_State *L) {
        return space_simple(L, "place_landed",
                            {number_arg(L, 2), number_arg(L, 3), lua_isnoneornil(L, 4) ? 0.0 : number_arg(L, 4)},
                            luaL_checkstring(L, 1));
    }
    static int space_place_orbit(lua_State *L) {
        return space_simple(L, "place_orbit", {number_arg(L, 2)}, luaL_checkstring(L, 1));
    }
    // space.body(name) -> {radius, gravity, atmosphere, distance, altitude} or nil
    static int space_body(lua_State *L) {
        std::vector<double> out;
        std::string text;
        if (!space_call(L, "body", {}, luaL_checkstring(L, 1), out, text) || out.size() < 5)
            return lua_pushnil(L), 1;
        lua_createtable(L, 0, 5);
        set_number(L, "radius", out[0]);
        set_number(L, "gravity", out[1]);
        set_number(L, "atmosphere", out[2]);
        set_number(L, "distance", out[3]);
        set_number(L, "altitude", out[4]);
        return 1;
    }
    // space.call(op, text, n1, n2, ...) -> {n1, n2, ..., text = "..."} or nil:
    // any SpaceSystem operation by name (0.73.0) -- plan, autopilot,
    // reserve, part, reveal, bodies, wind, board_key -- without a binding
    // per operation. See BridgeHost::space for the list.
    static int space_generic(lua_State *L) {
        const std::string op = luaL_checkstring(L, 1);
        const std::string text = lua_isnoneornil(L, 2) ? std::string{} : luaL_checkstring(L, 2);
        std::vector<double> args;
        for (int i = 3; i <= lua_gettop(L) && i < 19; ++i)
            args.push_back(number_arg(L, i));
        std::vector<double> out;
        std::string text_out;
        if (!space_call(L, op.c_str(), args, text, out, text_out))
            return lua_pushnil(L), 1;
        lua_createtable(L, static_cast<int>(out.size()), 1);
        for (std::size_t i = 0; i < out.size(); ++i) {
            lua_pushnumber(L, out[i]);
            lua_rawseti(L, -2, static_cast<lua_Integer>(i + 1));
        }
        set_string(L, "text", text_out);
        return 1;
    }
    // world.set_clock(hours) -> hours: the scene clock Routines follow.
    static int set_clock(lua_State *L) {
        std::vector<double> out;
        std::string text;
        space_call(L, "clock", {number_arg(L, 1)}, {}, out, text);
        lua_pushnumber(L, out.empty() ? 0.0 : out[0]);
        return 1;
    }
    // host.send(kind, text): a message to the host application (the editor
    // or player), for presentation the engine doesn't own -- maps, weather,
    // waypoints, settings (0.73.0). Unknown kinds are ignored there.
    static int host_send(lua_State *L) {
        const char *kind = luaL_checkstring(L, 1);
        size_t length = 0;
        const char *text = lua_isnoneornil(L, 2) ? "" : luaL_tolstring(L, 2, &length);
        const std::string value(text, length);
        if (!lua_isnoneornil(L, 2))
            lua_pop(L, 1);
        emit(L, "host", kind, value);
        return 0;
    }
    static int particles_burst(lua_State *L) {
        emit(L, "particles_burst", std::to_string(luaL_optinteger(L, 1, 10)), "");
        return 0;
    }
    static int particles_emitting(lua_State *L) {
        emit(L, "particles_emitting", lua_toboolean(L, 1) != 0 ? "1" : "0", "");
        return 0;
    }
    // ui.set_value(name, 0..1) / ui.set_visible(name, bool)
    static int set_ui_value(lua_State *L) {
        const char *name = luaL_checkstring(L, 1);
        emit(L, "ui_value", name, std::to_string(number_arg(L, 2)));
        return 0;
    }
    // ui.marker(name, x, y, z[, label]): an on-screen waypoint at a world
    // position (edge-clamped when off screen, with its distance).
    static int ui_marker(lua_State *L) {
        const char *name = luaL_checkstring(L, 1);
        char where[256];
        std::snprintf(where, sizeof where, "%.3f,%.3f,%.3f,%s", number_arg(L, 2), number_arg(L, 3), number_arg(L, 4),
                      luaL_optstring(L, 5, ""));
        emit(L, "ui_marker", name, where);
        return 0;
    }
    static int ui_clear_marker(lua_State *L) {
        emit(L, "ui_marker_clear", luaL_checkstring(L, 1), "");
        return 0;
    }
    // game.pause() / game.resume(): the same as the Pause/Resume buttons.
    static int game_pause(lua_State *L) {
        emit(L, "game_pause", "", "");
        return 0;
    }
    static int game_resume(lua_State *L) {
        emit(L, "game_resume", "", "");
        return 0;
    }
    static int set_ui_visible(lua_State *L) {
        const char *name = luaL_checkstring(L, 1);
        emit(L, "ui_visible", name, lua_toboolean(L, 2) != 0 ? "1" : "0");
        return 0;
    }
    static int log(lua_State *L) {
        size_t length = 0;
        const char *text = luaL_tolstring(L, 1, &length);
        const std::string value(text, length);
        lua_pop(L, 1);
        emit(L, "log", value, "");
        return 0;
    }
    // physics.add_force(fx, fy, fz[, id]) / physics.add_impulse(ix, iy, iz[, id])
    static physics::RigidBody *body_for(lua_State *L, int id_index) {
        auto &self = runtime(L);
        if (!self.world_)
            return nullptr;
        const auto entity = lua_isnoneornil(L, id_index) ? std::optional<Entity>{self_entity(L)} : entity_arg(L, id_index);
        return entity ? self.world_->get<physics::RigidBody>(*entity) : nullptr;
    }
    static int add_force(lua_State *L) {
        if (auto *body = body_for(L, 4))
            physics::add_force(*body, {number_arg(L, 1), number_arg(L, 2), number_arg(L, 3)});
        return 0;
    }
    static int add_impulse(lua_State *L) {
        if (auto *body = body_for(L, 4))
            physics::add_impulse(*body, {number_arg(L, 1), number_arg(L, 2), number_arg(L, 3)});
        return 0;
    }

    // -- Native input (0.55.0) ------------------------------------------
    static const ActionState *action_state(lua_State *L) {
        auto &self = runtime(L);
        const char *name = luaL_checkstring(L, 1);
        if (!self.actions_)
            return nullptr;
        const auto &map = self.actions_->map();
        const ActionId id{name};
        if (std::find(map.actions.begin(), map.actions.end(), id) == map.actions.end())
            return nullptr;
        return &self.actions_->state(id);
    }
    static int action(lua_State *L) {
        const auto *state = action_state(L);
        lua_pushnumber(L, state ? state->value : 0.0F);
        return 1;
    }
    static int action_down(lua_State *L) {
        const auto *state = action_state(L);
        lua_pushboolean(L, state && state->down() ? 1 : 0);
        return 1;
    }
    static int action_pressed(lua_State *L) {
        const auto *state = action_state(L);
        lua_pushboolean(L, state && state->pressed ? 1 : 0);
        return 1;
    }
    static int action_released(lua_State *L) {
        const auto *state = action_state(L);
        lua_pushboolean(L, state && state->released ? 1 : 0);
        return 1;
    }
    static int mouse(lua_State *L) {
        const auto *input = runtime(L).input_state_;
        lua_pushnumber(L, input ? input->mouse_x() : 0.0F);
        lua_pushnumber(L, input ? input->mouse_y() : 0.0F);
        lua_pushnumber(L, input ? input->mouse_delta_x() : 0.0F);
        lua_pushnumber(L, input ? input->mouse_delta_y() : 0.0F);
        return 4;
    }
    static std::optional<MouseButton> mouse_button(lua_State *L) {
        const auto index = luaL_optinteger(L, 1, 0);
        if (index < 0 || index > 2)
            return std::nullopt;
        return index == 0 ? MouseButton::left : index == 1 ? MouseButton::middle : MouseButton::right;
    }
    static int mouse_down(lua_State *L) {
        const auto *input = runtime(L).input_state_;
        const auto button = mouse_button(L);
        lua_pushboolean(L, input && button && input->mouse_down(*button) ? 1 : 0);
        return 1;
    }
    static int mouse_pressed(lua_State *L) {
        const auto *input = runtime(L).input_state_;
        const auto button = mouse_button(L);
        lua_pushboolean(L, input && button && input->mouse_pressed(*button) ? 1 : 0);
        return 1;
    }
    static int wheel(lua_State *L) {
        const auto *input = runtime(L).input_state_;
        lua_pushnumber(L, input ? input->wheel_y() : 0.0F);
        return 1;
    }
    static std::optional<GamepadButton> pad_button(const std::string &name) {
        static const std::map<std::string, GamepadButton> names{
            {"a", GamepadButton::south},      {"b", GamepadButton::east},
            {"x", GamepadButton::west},       {"y", GamepadButton::north},
            {"lb", GamepadButton::left_shoulder}, {"rb", GamepadButton::right_shoulder},
            {"back", GamepadButton::back},    {"start", GamepadButton::start},
            {"ls", GamepadButton::left_stick}, {"rs", GamepadButton::right_stick},
            {"up", GamepadButton::dpad_up},   {"down", GamepadButton::dpad_down},
            {"left", GamepadButton::dpad_left}, {"right", GamepadButton::dpad_right}};
        const auto found = names.find(name);
        return found == names.end() ? std::nullopt : std::optional{found->second};
    }
    static int pad_down(lua_State *L) {
        const auto *input = runtime(L).input_state_;
        const auto button = pad_button(luaL_checkstring(L, 1));
        lua_pushboolean(L, input && button && input->gamepad_down(*button) ? 1 : 0);
        return 1;
    }
    static int pad_pressed(lua_State *L) {
        const auto *input = runtime(L).input_state_;
        const auto button = pad_button(luaL_checkstring(L, 1));
        lua_pushboolean(L, input && button && input->gamepad_pressed(*button) ? 1 : 0);
        return 1;
    }
    static int pad_axis(lua_State *L) {
        static const std::map<std::string, GamepadAxis> names{
            {"lx", GamepadAxis::left_x}, {"ly", GamepadAxis::left_y},       {"rx", GamepadAxis::right_x},
            {"ry", GamepadAxis::right_y}, {"lt", GamepadAxis::left_trigger}, {"rt", GamepadAxis::right_trigger}};
        const auto *input = runtime(L).input_state_;
        const auto found = names.find(luaL_checkstring(L, 1));
        lua_pushnumber(L, input && found != names.end() ? input->gamepad_axis(found->second) : 0.0F);
        return 1;
    }
    // input.lock_mouse(true|false): pointer lock for mouse-look (host-side).
    static int lock_mouse(lua_State *L) {
        emit(L, "mouse_lock", lua_toboolean(L, 1) != 0 ? "1" : "0", "");
        return 0;
    }
    static int pad_connected(lua_State *L) {
        const auto *input = runtime(L).input_state_;
        lua_pushboolean(L, input && !input->gamepads().empty() ? 1 : 0);
        return 1;
    }
    static void extend_input(lua_State *L, Runtime *self) {
        lua_getglobal(L, "input");
        for (const auto &[name, function] : std::initializer_list<std::pair<const char *, lua_CFunction>>{
                 {"action", action},
                 {"action_down", action_down},
                 {"action_pressed", action_pressed},
                 {"action_released", action_released},
                 {"mouse", mouse},
                 {"mouse_down", mouse_down},
                 {"mouse_pressed", mouse_pressed},
                 {"wheel", wheel},
                 {"pad_down", pad_down},
                 {"pad_pressed", pad_pressed},
                 {"pad_axis", pad_axis},
                 {"pad_connected", pad_connected},
                 {"lock_mouse", lock_mouse}}) {
            lua_pushlightuserdata(L, self);
            lua_pushcclosure(L, function, 1);
            lua_setfield(L, -2, name);
        }
        lua_pop(L, 1);
    }

    static void table(lua_State *L, Runtime *self, const char *global,
                      std::initializer_list<std::pair<const char *, lua_CFunction>> functions) {
        lua_newtable(L);
        for (const auto &[name, function] : functions) {
            lua_pushlightuserdata(L, self);
            lua_pushcclosure(L, function, 1);
            lua_setfield(L, -2, name);
        }
        lua_setglobal(L, global);
    }
    static void install(lua_State *L, Runtime *self) {
        table(L, self, "world",
              {{"find", find},
               {"name", name},
               {"alive", alive},
               {"position", position},
               {"set_position", set_position},
               {"velocity", velocity},
               {"set_velocity", set_velocity},
               {"spawn", spawn},
               {"destroy", destroy},
               {"health", health},
               {"damage", damage},
               {"heal", heal},
               {"give_ammo", give_ammo},
               {"raycast", raycast},
               {"overlap", overlap},
               {"send", send},
               {"path", path},
               {"set_clock", set_clock}});
        table(L, self, "host", {{"send", host_send}});
        table(L, self, "physics", {{"add_force", add_force}, {"add_impulse", add_impulse}});
        table(L, self, "sound", {{"play", play_sound}, {"play_at", play_sound_at}, {"volume", sound_volume}});
        table(L, self, "ui",
              {{"set_text", set_ui_text},
               {"set_value", set_ui_value},
               {"set_visible", set_ui_visible},
               {"marker", ui_marker},
               {"clear_marker", ui_clear_marker}});
        table(L, self, "game", {{"pause", game_pause}, {"resume", game_resume}});
        table(L, self, "anim", {{"set", anim_set}, {"trigger", anim_trigger}});
        table(L, self, "camera", {{"shake", camera_shake}});
        table(L, self, "vehicle",
              {{"state", vehicle_state},
               {"set_nitro", vehicle_set_nitro},
               {"reset", vehicle_reset},
               {"freeze", vehicle_freeze},
               {"set_route", vehicle_set_route},
               {"set_target", vehicle_set_target},
               {"set_mode", vehicle_set_mode},
               {"set_speed_scale", vehicle_set_speed_scale}});
        table(L, self, "space",
              {{"state", space_state},
               {"events", space_events},
               {"set_warp", space_set_warp},
               {"set_assist", space_set_assist},
               {"set_target", space_set_target},
               {"refuel", space_refuel},
               {"set_fuel", space_set_fuel},
               {"tune", space_tune},
               {"spec", space_spec},
               {"repair", space_repair},
               {"board", space_board},
               {"exit", space_exit},
               {"set_controls", space_set_controls},
               {"place_landed", space_place_landed},
               {"place_orbit", space_place_orbit},
               {"body", space_body},
               {"call", space_generic}});
        table(L, self, "particles", {{"burst", particles_burst}, {"set_emitting", particles_emitting}});
        table(L, self, "melee",
              {{"perform", melee_perform},
               {"state", melee_state},
               {"move", melee_move},
               {"set_energy", melee_set_energy},
               {"lock", melee_lock},
               {"target", melee_target},
               {"set_ai", melee_set_ai},
               {"unlock", melee_unlock},
               {"stagger", melee_stagger},
               {"tune", melee_tune}});
        table(L, self, "weapon",
              {{"fire", weapon_fire},
               {"reload", weapon_reload},
               {"select", weapon_select},
               {"ammo", weapon_ammo},
               {"give_ammo", weapon_give_ammo}});
        extend_input(L, self);
        lua_pushlightuserdata(L, self);
        lua_pushcclosure(L, log, 1);
        lua_setglobal(L, "log");
    }
};

namespace {
void push_props(lua_State *L, const Script &script) {
    lua_newtable(L);
    for (const auto &prop : script.props) {
        switch (prop.kind) {
        case Script::Prop::Kind::number:
            lua_pushnumber(L, prop.number);
            break;
        case Script::Prop::Kind::boolean:
            lua_pushboolean(L, prop.boolean ? 1 : 0);
            break;
        case Script::Prop::Kind::text:
            lua_pushlstring(L, prop.text.data(), prop.text.size());
            break;
        }
        lua_setfield(L, -2, prop.name.c_str());
    }
    lua_setglobal(L, "props");
}
} // namespace

void Runtime::call(World &world, Entity entity, Instance &instance, const char *function_name,
                   const std::function<void(lua_State *)> &push_args, int nargs) {
    lua_State *const L = instance.L;
    if (!L || instance.broken)
        return;
    lua_getglobal(L, function_name);
    if (lua_isfunction(L, -1) == 0) {
        lua_pop(L, 1); // not defined: a silent no-op, not an error
        return;
    }
    auto *box = world.get<Box>(entity);
    auto *body = world.get<physics::RigidBody>(entity);
    // `self` is refreshed from the simulation before every call, and read
    // back after it. Entities that are already gone (on_destroy) keep their
    // last self table.
    Vec3 before{};
    Vec3 velocity_before{};
    // A bodiless entity (a director, a child) still gets `self`: its
    // position, with no velocity.
    if (box) {
        before = box->center;
        if (body)
            velocity_before = body->velocity;
        lua_newtable(L);
        lua_pushinteger(L, id_of(entity));
        lua_setfield(L, -2, "id");
        if (host_) {
            const auto text = host_->name_of(world, entity);
            lua_pushlstring(L, text.data(), text.size());
            lua_setfield(L, -2, "name");
        }
        lua_pushnumber(L, box->center.x);
        lua_setfield(L, -2, "x");
        lua_pushnumber(L, box->center.y);
        lua_setfield(L, -2, "y");
        lua_pushnumber(L, box->center.z);
        lua_setfield(L, -2, "z");
        lua_pushnumber(L, velocity_before.x);
        lua_setfield(L, -2, "vx");
        lua_pushnumber(L, velocity_before.y);
        lua_setfield(L, -2, "vy");
        lua_pushnumber(L, velocity_before.z);
        lua_setfield(L, -2, "vz");
        lua_pushboolean(L, body && body->grounded ? 1 : 0);
        lua_setfield(L, -2, "grounded");
        lua_setglobal(L, "self");
    }
    lua_getglobal(L, "time");
    if (lua_istable(L, -1) != 0) {
        lua_pushnumber(L, dt_);
        lua_setfield(L, -2, "dt");
        lua_pushnumber(L, now_);
        lua_setfield(L, -2, "now");
        lua_pushinteger(L, static_cast<lua_Integer>(frame_));
        lua_setfield(L, -2, "frame");
    }
    lua_pop(L, 1);
    push_args(L);
    if (lua_pcall(L, nargs, 0, 0) != LUA_OK) {
        if (on_error_)
            on_error_(entity, error_text(L, -1));
        lua_pop(L, 1);
        instance.broken = true;
        return;
    }
    if (!box || !world.alive(entity))
        return;
    lua_getglobal(L, "self");
    if (lua_istable(L, -1) != 0) {
        // Only fields the script actually changed are written back, so
        // world.set_velocity/physics.add_impulse on self during the call
        // aren't clobbered by the stale values `self` was created with.
        const float vx = field_or(L, -1, "vx", velocity_before.x), vy = field_or(L, -1, "vy", velocity_before.y),
                    vz = field_or(L, -1, "vz", velocity_before.z);
        if (body) {
            if (vx != velocity_before.x)
                body->velocity.x = vx;
            if (vy != velocity_before.y)
                body->velocity.y = vy;
            if (vz != velocity_before.z)
                body->velocity.z = vz;
        }
        // Writing self.x/y/z teleports; untouched values leave the body where
        // physics (or world.set_position) put it during the call.
        const float x = field_or(L, -1, "x", before.x), y = field_or(L, -1, "y", before.y),
                    z = field_or(L, -1, "z", before.z);
        if (x != before.x)
            box->center.x = x;
        if (y != before.y)
            box->center.y = y;
        if (z != before.z)
            box->center.z = z;
        lua_getfield(L, -1, "animate");
        if (lua_isstring(L, -1) != 0) {
            const char *clip = lua_tostring(L, -1);
            if (clip[0] != '\0')
                animation_requests_[entity] = clip;
        }
        lua_pop(L, 1);
        lua_pushnil(L);
        lua_setfield(L, -2, "animate");
    }
    lua_pop(L, 1);
}

void Runtime::request_animation(Entity entity, std::string clip) { animation_requests_[entity] = std::move(clip); }

void Runtime::step(World &world, float dt) {
    world_ = &world;
    dt_ = dt;
    // Scripts whose entity died (or lost its Script) get on_destroy before
    // their VM goes away.
    for (auto it = instances_.begin(); it != instances_.end();) {
        if (!world.alive(it->first) || !world.get<Script>(it->first)) {
            if (it->second && it->second->started)
                call(world, it->first, *it->second, "on_destroy", [](lua_State *) {}, 0);
            it = instances_.erase(it);
        } else {
            ++it;
        }
    }
    // Any entity with a Script runs it, bodiless helpers (a director, a
    // child) included; the API calls that need a body skip one without.
    // Every new script compiles before any starts, so an on_start (or a
    // first tick) can world.send to a script further down the list.
    for (const auto entity : world.query<Box, Script>()) {
        auto &instance = instances_[entity];
        if (!instance)
            instance = std::make_unique<Instance>();
        const auto &script = *world.get<Script>(entity);
        if (!instance->compiled || instance->compiled_source != script.source) {
            if (instance->L) {
                lua_close(instance->L);
                instance->L = nullptr;
            }
            instance->compiled = true;
            instance->started = false;
            instance->compiled_source = script.source;
            instance->broken = false;
            instance->L = luaL_newstate();
            open_sandboxed_libs(instance->L, this);
            LuaApi::install(instance->L, this);
            lua_newtable(instance->L);
            lua_setglobal(instance->L, "time");
            push_props(instance->L, script);
            if (luaL_dostring(instance->L, prelude) != LUA_OK || luaL_dostring(instance->L, api_prelude) != LUA_OK ||
                luaL_dostring(instance->L, script.source.c_str()) != LUA_OK) {
                if (on_error_)
                    on_error_(entity, error_text(instance->L, -1));
                lua_close(instance->L);
                instance->L = nullptr;
                instance->broken = true;
            }
        }
    }
    for (const auto entity : world.query<Box, Script>()) {
        const auto found = instances_.find(entity);
        if (found == instances_.end() || !found->second || found->second->broken || !found->second->L)
            continue;
        auto &instance = found->second;
        if (!instance->started) {
            instance->started = true;
            call(world, entity, *instance, "on_start", [](lua_State *) {}, 0);
        }
        call(world, entity, *instance, "__tick", [dt](lua_State *L) { lua_pushnumber(L, dt); }, 1);
        call(world, entity, *instance, "on_tick", [dt](lua_State *L) { lua_pushnumber(L, dt); }, 1);
    }
    keys_just_pressed_.clear(); // see key_just_pressed's own doc comment: a whole-tick window
    now_ += dt;
    ++frame_;
}

void Runtime::notify(World &world, Entity entity, const std::string &function_name, const std::string &argument) {
    world_ = &world;
    const auto found = instances_.find(entity);
    if (found == instances_.end() || !found->second || !found->second->started)
        return;
    call(world, entity, *found->second, function_name.c_str(),
         [&argument](lua_State *L) { lua_pushlstring(L, argument.data(), argument.size()); }, 1);
}

void Runtime::notify_melee_hit(World &world, Entity attacker, Entity target, const std::string &move, float damage,
                               const std::string &outcome, const std::string &target_name) {
    (void)target_name;
    world_ = &world;
    const auto found = instances_.find(attacker);
    if (found == instances_.end() || !found->second || !found->second->started)
        return;
    const auto target_id = id_of(target);
    call(world, attacker, *found->second, "on_melee_hit",
         [&](lua_State *L) {
             lua_pushinteger(L, target_id);
             lua_pushstring(L, move.c_str());
             lua_pushnumber(L, damage);
             lua_pushstring(L, outcome.c_str());
         },
         4);
}

void Runtime::notify_damage(World &world, Entity entity, float amount, std::optional<Entity> attacker, bool headshot,
                            bool killed, const std::string &victim_name, const std::string &attacker_name) {
    world_ = &world;
    const auto found = instances_.find(entity);
    if (found != instances_.end() && found->second && found->second->started) {
        const auto attacker_id = attacker ? std::optional<std::int64_t>{id_of(*attacker)} : std::nullopt;
        call(world, entity, *found->second, "on_damaged",
             [&](lua_State *L) {
                 lua_pushnumber(L, amount);
                 if (attacker_id)
                     lua_pushinteger(L, *attacker_id);
                 else
                     lua_pushnil(L);
                 lua_pushboolean(L, headshot ? 1 : 0);
             },
             3);
        const auto again = instances_.find(entity);
        if (killed && again != instances_.end() && again->second)
            call(world, entity, *again->second, "on_death",
                 [&](lua_State *L) {
                     if (attacker_id)
                         lua_pushinteger(L, *attacker_id);
                     else
                         lua_pushnil(L);
                 },
                 1);
    }
    if (killed)
        broadcast(world, "on_kill", victim_name, attacker_name);
}

void Runtime::broadcast(World &world, const std::string &function_name, const std::string &name,
                        const std::string &value) {
    world_ = &world;
    char *end = nullptr;
    const double number = std::strtod(value.c_str(), &end);
    const bool numeric = !value.empty() && end != value.c_str() && *end == '\0' && std::isfinite(number);
    // Snapshot first: a callback may spawn or destroy entities.
    std::vector<Entity> targets;
    for (const auto &[entity, instance] : instances_)
        if (instance && instance->started)
            targets.push_back(entity);
    for (const auto entity : targets) {
        const auto found = instances_.find(entity);
        if (found == instances_.end() || !found->second)
            continue;
        call(world, entity, *found->second, function_name.c_str(),
             [&](lua_State *L) {
                 lua_pushlstring(L, name.data(), name.size());
                 if (numeric)
                     lua_pushnumber(L, number);
                 else
                     lua_pushlstring(L, value.data(), value.size());
             },
             2);
    }
}

void Runtime::dispatch_contacts(World &world, const physics::Events &events) {
    world_ = &world;
    for (const auto &event : events.events) {
        const char *base = event.trigger ? "on_trigger_" : "on_collision_";
        const char *phase = event.phase == physics::ContactPhase::enter  ? "enter"
                            : event.phase == physics::ContactPhase::stay ? "stay"
                                                                          : "exit";
        const std::string function_name = std::string(base) + phase;
        for (const auto &[self, other] : {std::pair{event.a, event.b}, std::pair{event.b, event.a}}) {
            const auto found = instances_.find(self);
            if (found == instances_.end() || !found->second || !found->second->started)
                continue;
            const auto other_id = id_of(other);
            call(world, self, *found->second, function_name.c_str(),
                 [other_id](lua_State *L) { lua_pushinteger(L, other_id); }, 1);
        }
    }
}

} // namespace engine::script
