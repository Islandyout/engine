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
    // world.raycast(ox, oy, oz, dx, dy, dz, max[, layer_mask]) ->
    //   hit (entity id, or "ground"), distance, x, y, z   -- or nil
    static int raycast(lua_State *L) {
        auto &self = runtime(L);
        if (!self.world_)
            return lua_pushnil(L), 1;
        physics::QueryFilter filter;
        filter.layer_mask = static_cast<std::uint32_t>(luaL_optinteger(L, 8, physics::all_layers));
        const auto hit = physics::raycast(*self.world_, {number_arg(L, 1), number_arg(L, 2), number_arg(L, 3)},
                                          {number_arg(L, 4), number_arg(L, 5), number_arg(L, 6)},
                                          number_arg(L, 7, 100.0F), {}, filter);
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
        return 5;
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
    static int set_ui_text(lua_State *L) {
        size_t length = 0;
        const char *text = luaL_tolstring(L, 2, &length);
        const std::string value(text, length);
        lua_pop(L, 1);
        emit(L, "ui_text", luaL_checkstring(L, 1), value);
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
               {"raycast", raycast},
               {"overlap", overlap},
               {"send", send}});
        table(L, self, "physics", {{"add_force", add_force}, {"add_impulse", add_impulse}});
        table(L, self, "sound", {{"play", play_sound}});
        table(L, self, "ui", {{"set_text", set_ui_text}});
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
    if (box && body) {
        before = box->center;
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
        lua_pushnumber(L, body->velocity.x);
        lua_setfield(L, -2, "vx");
        lua_pushnumber(L, body->velocity.y);
        lua_setfield(L, -2, "vy");
        lua_pushnumber(L, body->velocity.z);
        lua_setfield(L, -2, "vz");
        lua_pushboolean(L, body->grounded ? 1 : 0);
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
    if (!(box && body) || !world.alive(entity))
        return;
    lua_getglobal(L, "self");
    if (lua_istable(L, -1) != 0) {
        // Only fields the script actually changed are written back, so
        // world.set_velocity/physics.add_impulse on self during the call
        // aren't clobbered by the stale values `self` was created with.
        const float vx = field_or(L, -1, "vx", velocity_before.x), vy = field_or(L, -1, "vy", velocity_before.y),
                    vz = field_or(L, -1, "vz", velocity_before.z);
        if (vx != velocity_before.x)
            body->velocity.x = vx;
        if (vy != velocity_before.y)
            body->velocity.y = vy;
        if (vz != velocity_before.z)
            body->velocity.z = vz;
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
    for (const auto entity : world.query<Box, physics::RigidBody, Script>()) {
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
            if (luaL_dostring(instance->L, prelude) != LUA_OK ||
                luaL_dostring(instance->L, script.source.c_str()) != LUA_OK) {
                if (on_error_)
                    on_error_(entity, error_text(instance->L, -1));
                lua_close(instance->L);
                instance->L = nullptr;
                instance->broken = true;
            }
        }
        if (instance->broken)
            continue;
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
