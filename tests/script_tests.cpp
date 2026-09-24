#include "engine/physics/physics.hpp"
#include "engine/script/script.hpp"

#include <cmath>
#include <iostream>
#include <stdexcept>
#include <map>
#include <optional>
#include <string>
#include <vector>

namespace {
void check(bool pass, const char *message) {
    if (!pass)
        throw std::runtime_error{message};
}

// A minimal Host for tests: names by map, prefabs spawn a plain body, and
// every emit() is recorded.
struct TestHost final : engine::script::Host {
    std::map<engine::Entity, std::string> names;
    std::vector<std::string> emitted;
    std::optional<engine::Entity> find(const engine::World &world, const std::string &name) override {
        for (const auto &[entity, value] : names)
            if (value == name && world.alive(entity))
                return entity;
        return std::nullopt;
    }
    std::string name_of(const engine::World &, engine::Entity entity) override {
        const auto found = names.find(entity);
        return found == names.end() ? "" : found->second;
    }
    std::optional<engine::Entity> spawn(engine::World &world, const std::string &prefab, engine::Vec3 position,
                                        engine::Vec3 velocity) override {
        if (prefab != "Ball")
            return std::nullopt;
        const auto entity = world.defer_create();
        world.defer_set(entity, engine::Box{position, {0.5F, 0.5F, 0.5F}});
        world.defer_set(entity, engine::physics::RigidBody{velocity});
        names[entity] = "Ball";
        return entity;
    }
    void destroy(engine::World &world, engine::Entity entity) override { world.defer_destroy(entity); }
    bool health(const engine::World &, engine::Entity, float &current, float &max) override {
        current = 40;
        max = 100;
        return true;
    }
    void damage(engine::World &, engine::Entity, float amount) override {
        emitted.push_back("damage:" + std::to_string(static_cast<int>(amount)));
    }
    void emit(engine::Entity, const std::string &kind, const std::string &a, const std::string &b) override {
        emitted.push_back(kind + ":" + a + (b.empty() ? "" : ":" + b));
    }
};
} // namespace

int main() {
    try {
        using namespace engine;
        using physics::Collider;
        using physics::RigidBody;
        using script::Runtime;
        using script::Script;

        {
            // A script that sets self.vx each tick actually moves the entity once
            // physics::step integrates the velocity it wrote back — the same
            // write-velocity-not-position convention editor.move/editor.ai use in
            // the browser bridge.
            World world;
            world.register_component<Box>("box");
            world.register_component<RigidBody>("rigidbody");
            world.register_component<Collider>("collider");
            world.register_component<Script>("script");
            const auto entity = world.create();
            world.set(entity, Box{{0, 5, 0}, {1, 1, 1}});
            world.set(entity, RigidBody{});
            world.set(entity, Script{"function on_tick(dt) self.vx = 3 end"});
            Runtime runtime;
            for (int i = 0; i < 10; ++i) {
                runtime.step(world, 1.0F / 60);
                physics::step(world, 1.0F / 60);
            }
            check(world.get<Box>(entity)->center.x > 0.4F, "script-driven velocity moved the entity");
        }
        {
            // Since 0.49.0 assigning self.x/y/z teleports the entity; an
            // untouched coordinate keeps whatever physics gives it.
            World world;
            world.register_component<Box>("box");
            world.register_component<RigidBody>("rigidbody");
            world.register_component<Collider>("collider");
            world.register_component<Script>("script");
            const auto entity = world.create();
            world.set(entity, Box{{2, 5, 3}, {1, 1, 1}});
            world.set(entity, RigidBody{});
            world.set(entity, Script{"function on_tick(dt) self.x = 999 self.vx = 0 self.vz = 0 end"});
            Runtime runtime;
            runtime.step(world, 1.0F / 60);
            physics::step(world, 1.0F / 60);
            check(std::abs(world.get<Box>(entity)->center.x - 999) < 0.1F,
                  "assigning self.x from a script teleports the entity");
            check(std::abs(world.get<Box>(entity)->center.z - 3) < 0.1F,
                  "an untouched coordinate is left alone");
        }
        {
            // No on_tick defined at all is a silent no-op tick, not an error --
            // top-level-only scripts (e.g. one-time setup) are a legitimate use.
            World world;
            world.register_component<Box>("box");
            world.register_component<RigidBody>("rigidbody");
            world.register_component<Collider>("collider");
            world.register_component<Script>("script");
            const auto entity = world.create();
            world.set(entity, Box{{0, 5, 0}, {1, 1, 1}});
            world.set(entity, RigidBody{});
            world.set(entity, Script{"local unused = 1 + 1"});
            Runtime runtime;
            bool error_reported = false;
            runtime.set_error_handler([&](Entity, const std::string &) { error_reported = true; });
            runtime.step(world, 1.0F / 60);
            check(!error_reported, "a script with no on_tick is not an error");
        }
        {
            // A script that fails to compile is reported exactly once and marked
            // broken -- it doesn't crash step(), and isn't retried every tick.
            World world;
            world.register_component<Box>("box");
            world.register_component<RigidBody>("rigidbody");
            world.register_component<Collider>("collider");
            world.register_component<Script>("script");
            const auto entity = world.create();
            world.set(entity, Box{{0, 5, 0}, {1, 1, 1}});
            world.set(entity, RigidBody{});
            world.set(entity, Script{"function on_tick(dt this is not valid lua"});
            Runtime runtime;
            int error_count = 0;
            runtime.set_error_handler([&](Entity, const std::string &) { ++error_count; });
            for (int i = 0; i < 5; ++i)
                runtime.step(world, 1.0F / 60);
            check(error_count == 1, "a compile error is reported exactly once, not retried every tick");
        }
        {
            // A runtime error inside on_tick is likewise reported once and marks
            // the entity broken, rather than propagating out of step() or
            // spamming the error handler every subsequent tick.
            World world;
            world.register_component<Box>("box");
            world.register_component<RigidBody>("rigidbody");
            world.register_component<Collider>("collider");
            world.register_component<Script>("script");
            const auto entity = world.create();
            world.set(entity, Box{{0, 5, 0}, {1, 1, 1}});
            world.set(entity, RigidBody{});
            world.set(entity, Script{"function on_tick(dt) return nil + 1 end"});
            Runtime runtime;
            int error_count = 0;
            runtime.set_error_handler([&](Entity, const std::string &) { ++error_count; });
            for (int i = 0; i < 5; ++i)
                runtime.step(world, 1.0F / 60);
            check(error_count == 1, "a runtime error is reported exactly once, not retried every tick");
        }
        {
            // Sandboxing actually holds: os/io/package/debug were never opened
            // (their .c files aren't even compiled into lua_vendored, see its
            // own CMakeLists.txt comment), so a script reaching for any of them
            // gets a runtime error indexing a nil global, the same as any other
            // undefined name -- not a working filesystem/process escape hatch.
            World world;
            world.register_component<Box>("box");
            world.register_component<RigidBody>("rigidbody");
            world.register_component<Collider>("collider");
            world.register_component<Script>("script");
            const auto entity = world.create();
            world.set(entity, Box{{0, 5, 0}, {1, 1, 1}});
            world.set(entity, RigidBody{});
            world.set(entity, Script{"function on_tick(dt) os.execute('echo unsandboxed') end"});
            Runtime runtime;
            bool error_reported = false;
            runtime.set_error_handler([&](Entity, const std::string &) { error_reported = true; });
            runtime.step(world, 1.0F / 60);
            check(error_reported, "reaching for the (unopened, uncompiled) os library errors, not executes");
        }
        {
            // A runaway loop is caught by the instruction-count watchdog instead
            // of hanging step() forever -- native tests would never finish (and
            // a browser tab would freeze) without this.
            World world;
            world.register_component<Box>("box");
            world.register_component<RigidBody>("rigidbody");
            world.register_component<Collider>("collider");
            world.register_component<Script>("script");
            const auto entity = world.create();
            world.set(entity, Box{{0, 5, 0}, {1, 1, 1}});
            world.set(entity, RigidBody{});
            world.set(entity, Script{"function on_tick(dt) while true do end end"});
            Runtime runtime;
            bool error_reported = false;
            runtime.set_error_handler([&](Entity, const std::string &) { error_reported = true; });
            runtime.step(world, 1.0F / 60); // returns instead of hanging, or this test never completes
            check(error_reported, "a runaway on_tick loop is caught by the instruction watchdog");
        }
        {
            // Removing Script (or destroying the entity) stops it from running
            // on the very next step(), and doesn't leak or crash.
            World world;
            world.register_component<Box>("box");
            world.register_component<RigidBody>("rigidbody");
            world.register_component<Collider>("collider");
            world.register_component<Script>("script");
            const auto entity = world.create();
            world.set(entity, Box{{0, 5, 0}, {1, 1, 1}});
            world.set(entity, RigidBody{});
            world.set(entity, Script{"function on_tick(dt) self.vx = 3 end"});
            Runtime runtime;
            runtime.step(world, 1.0F / 60);
            physics::step(world, 1.0F / 60);
            world.remove<Script>(entity);
            world.set(entity, RigidBody{}); // reset velocity to zero
            for (int i = 0; i < 10; ++i) {
                runtime.step(world, 1.0F / 60);
                physics::step(world, 1.0F / 60);
            }
            check(std::abs(world.get<RigidBody>(entity)->velocity.x) < 0.01F,
                  "removing Script stops it from writing velocity on later ticks");
        }
        {
            // Two entities with different scripts run in fully independent VMs --
            // one script's globals/state never leak into another's.
            World world;
            world.register_component<Box>("box");
            world.register_component<RigidBody>("rigidbody");
            world.register_component<Collider>("collider");
            world.register_component<Script>("script");
            const auto a = world.create();
            world.set(a, Box{{0, 5, 0}, {1, 1, 1}});
            world.set(a, RigidBody{});
            world.set(a, Script{"speed = 2 function on_tick(dt) self.vx = speed end"});
            const auto b = world.create();
            world.set(b, Box{{0, 5, 0}, {1, 1, 1}});
            world.set(b, RigidBody{});
            world.set(b, Script{"function on_tick(dt) self.vx = speed or -1 end"}); // `speed` is a's global, not b's
            Runtime runtime;
            for (int i = 0; i < 5; ++i)
                runtime.step(world, 1.0F / 60);
            check(std::abs(world.get<RigidBody>(a)->velocity.x - 2) < 0.01F, "entity a's own global is visible to it");
            check(std::abs(world.get<RigidBody>(b)->velocity.x - (-1)) < 0.01F,
                  "entity b never sees entity a's global -- separate VMs");
        }

        {
            // error() with a non-string argument (a table, nil, a number) is
            // valid Lua. lua_tostring would return null for it, and handing
            // that straight to std::string's constructor is undefined
            // behavior -- step() must still report a real string and keep
            // running, not crash the host.
            World world;
            world.register_component<Box>("box");
            world.register_component<RigidBody>("rigidbody");
            world.register_component<Collider>("collider");
            world.register_component<Script>("script");
            const auto entity = world.create();
            world.set(entity, Box{{0, 5, 0}, {1, 1, 1}});
            world.set(entity, RigidBody{});
            world.set(entity, Script{"function on_tick(dt) error({}) end"});
            Runtime runtime;
            std::string message;
            runtime.set_error_handler([&](Entity, const std::string &text) { message = text; });
            runtime.step(world, 1.0F / 60); // must not throw/crash converting the error object
            check(!message.empty(), "a non-string error() argument still produces a reported message");
        }
        {
            // Editing an entity's Script.source (e.g. through the inspector
            // while the entity is already running) recompiles from scratch on
            // the very next step() instead of continuing to run the old VM's
            // stale source.
            World world;
            world.register_component<Box>("box");
            world.register_component<RigidBody>("rigidbody");
            world.register_component<Collider>("collider");
            world.register_component<Script>("script");
            const auto entity = world.create();
            world.set(entity, Box{{0, 5, 0}, {1, 1, 1}});
            world.set(entity, RigidBody{});
            world.set(entity, Script{"function on_tick(dt) self.vx = 1 end"});
            Runtime runtime;
            runtime.step(world, 1.0F / 60);
            check(std::abs(world.get<RigidBody>(entity)->velocity.x - 1) < 0.01F, "original source took effect");
            world.set(entity, Script{"function on_tick(dt) self.vx = 7 end"});
            runtime.step(world, 1.0F / 60);
            check(std::abs(world.get<RigidBody>(entity)->velocity.x - 7) < 0.01F,
                  "changing Script.source recompiles instead of running the old VM's source");
        }
        {
            // A broken (failed-to-compile) script comes back to life once its
            // source is corrected -- the broken flag tracks the source it was
            // set for, not the entity forever.
            World world;
            world.register_component<Box>("box");
            world.register_component<RigidBody>("rigidbody");
            world.register_component<Collider>("collider");
            world.register_component<Script>("script");
            const auto entity = world.create();
            world.set(entity, Box{{0, 5, 0}, {1, 1, 1}});
            world.set(entity, RigidBody{});
            world.set(entity, Script{"this is not valid lua"});
            Runtime runtime;
            int error_count = 0;
            runtime.set_error_handler([&](Entity, const std::string &) { ++error_count; });
            runtime.step(world, 1.0F / 60);
            check(error_count == 1, "the broken script reported its compile error");
            world.set(entity, Script{"function on_tick(dt) self.vx = 5 end"});
            runtime.step(world, 1.0F / 60);
            check(error_count == 1, "correcting the source does not re-report the old error");
            check(std::abs(world.get<RigidBody>(entity)->velocity.x - 5) < 0.01F,
                  "correcting a broken script's source lets it run again");
        }
        {
            // NaN/infinity are numbers as far as Lua is concerned, so
            // self.vx = 0/0 or math.huge must be rejected the same way a
            // non-number field already falls back to "unchanged this tick" --
            // otherwise it propagates straight into RigidBody.velocity and
            // from there into every downstream position/collision
            // calculation.
            World world;
            world.register_component<Box>("box");
            world.register_component<RigidBody>("rigidbody");
            world.register_component<Collider>("collider");
            world.register_component<Script>("script");
            const auto entity = world.create();
            world.set(entity, Box{{0, 5, 0}, {1, 1, 1}});
            world.set(entity, RigidBody{{2, 0, 0}});
            world.set(entity, Script{"function on_tick(dt) self.vx = 0/0 self.vy = math.huge self.vz = -1/0 end"});
            Runtime runtime;
            runtime.step(world, 1.0F / 60);
            const auto &velocity = world.get<RigidBody>(entity)->velocity;
            check(std::isfinite(velocity.x) && std::isfinite(velocity.y) && std::isfinite(velocity.z),
                  "NaN/infinity from a script never reach RigidBody.velocity");
            check(std::abs(velocity.x - 2) < 0.01F, "a rejected NaN falls back to the velocity from before this tick");
        }

        {
            // save.set(key, value) from one entity's script is visible to
            // save.get(key) in another entity's own, fully separate VM --
            // the save table is shared Runtime-wide, unlike self or a
            // script's own globals (verified as isolated per-VM above).
            World world;
            world.register_component<Box>("box");
            world.register_component<RigidBody>("rigidbody");
            world.register_component<Collider>("collider");
            world.register_component<Script>("script");
            const auto writer = world.create();
            world.set(writer, Box{{0, 5, 0}, {1, 1, 1}});
            world.set(writer, RigidBody{});
            world.set(writer, Script{"function on_tick(dt) save.set('score', 42) end"});
            const auto reader = world.create();
            world.set(reader, Box{{0, 5, 0}, {1, 1, 1}});
            world.set(reader, RigidBody{});
            world.set(reader, Script{"function on_tick(dt) self.vx = tonumber(save.get('score')) or -1 end"});
            Runtime runtime;
            for (int i = 0; i < 2; ++i)
                runtime.step(world, 1.0F / 60);
            check(std::abs(world.get<RigidBody>(reader)->velocity.x - 42) < 0.01F,
                  "save.set from one entity is visible to save.get from another");
        }
        {
            // save.get on a key nothing has ever set/seeded returns nil, not
            // an error -- the ordinary "first ever play session" case.
            World world;
            world.register_component<Box>("box");
            world.register_component<RigidBody>("rigidbody");
            world.register_component<Collider>("collider");
            world.register_component<Script>("script");
            const auto entity = world.create();
            world.set(entity, Box{{0, 5, 0}, {1, 1, 1}});
            world.set(entity, RigidBody{});
            world.set(entity, Script{"function on_tick(dt) self.vx = save.get('never_set') == nil and 7 or -1 end"});
            Runtime runtime;
            runtime.step(world, 1.0F / 60);
            check(std::abs(world.get<RigidBody>(entity)->velocity.x - 7) < 0.01F,
                  "save.get on an unset key is nil, not an error");
        }
        {
            // Runtime::seed_saved (the host's way of restoring a
            // previously-persisted value, e.g. from localStorage, before any
            // script runs) is visible to save.get exactly like a script's
            // own save.set would have left it.
            World world;
            world.register_component<Box>("box");
            world.register_component<RigidBody>("rigidbody");
            world.register_component<Collider>("collider");
            world.register_component<Script>("script");
            const auto entity = world.create();
            world.set(entity, Box{{0, 5, 0}, {1, 1, 1}});
            world.set(entity, RigidBody{});
            world.set(entity, Script{"function on_tick(dt) self.vx = tonumber(save.get('level')) or -1 end"});
            Runtime runtime;
            runtime.seed_saved("level", "3");
            runtime.step(world, 1.0F / 60);
            check(std::abs(world.get<RigidBody>(entity)->velocity.x - 3) < 0.01F,
                  "seed_saved is visible to save.get before any script has run");
        }
        {
            // take_dirty_saves() reports a key exactly once per actual
            // change: a script that calls save.set with the same value every
            // tick doesn't keep re-reporting it, and seed_saved (the host
            // telling Runtime what it already knows) never appears in it at
            // all -- only a genuinely new value from save.set does.
            World world;
            world.register_component<Box>("box");
            world.register_component<RigidBody>("rigidbody");
            world.register_component<Collider>("collider");
            world.register_component<Script>("script");
            const auto entity = world.create();
            world.set(entity, Box{{0, 5, 0}, {1, 1, 1}});
            world.set(entity, RigidBody{});
            world.set(entity, Script{"function on_tick(dt) save.set('coins', 10) end"});
            Runtime runtime;
            runtime.seed_saved("level", "1");
            for (int i = 0; i < 3; ++i)
                runtime.step(world, 1.0F / 60);
            auto dirty = runtime.take_dirty_saves();
            check(dirty.size() == 1, "an unchanged repeated save.set is reported exactly once, seed_saved not at all");
            check(dirty[0].first == "coins" && dirty[0].second == "10", "the reported key/value match what was saved");
            check(runtime.take_dirty_saves().empty(), "take_dirty_saves clears the pending set once read");
        }
        {
            // save.set/save.get keep working (and the store survives) across
            // a script source change -- the save table lives on Runtime
            // itself, not the per-Instance VM that changing Script.source
            // recompiles from scratch.
            World world;
            world.register_component<Box>("box");
            world.register_component<RigidBody>("rigidbody");
            world.register_component<Collider>("collider");
            world.register_component<Script>("script");
            const auto entity = world.create();
            world.set(entity, Box{{0, 5, 0}, {1, 1, 1}});
            world.set(entity, RigidBody{});
            world.set(entity, Script{"function on_tick(dt) save.set('lives', 9) end"});
            Runtime runtime;
            runtime.step(world, 1.0F / 60);
            world.set(entity, Script{"function on_tick(dt) self.vx = tonumber(save.get('lives')) or -1 end"});
            runtime.step(world, 1.0F / 60);
            check(std::abs(world.get<RigidBody>(entity)->velocity.x - 9) < 0.01F,
                  "a saved value survives a Script.source change (recompiled VM, same Runtime)");
        }

        {
            // input.down(key) reflects the host's own set_key_down calls: true while held,
            // false once released -- a plain level check, no edge semantics.
            World world;
            world.register_component<Box>("box");
            world.register_component<RigidBody>("rigidbody");
            world.register_component<Collider>("collider");
            world.register_component<Script>("script");
            const auto entity = world.create();
            world.set(entity, Box{{0, 5, 0}, {1, 1, 1}});
            world.set(entity, RigidBody{});
            world.set(entity, Script{"function on_tick(dt) self.vx = input.down('f') and 1 or -1 end"});
            Runtime runtime;
            runtime.step(world, 1.0F / 60);
            check(std::abs(world.get<RigidBody>(entity)->velocity.x - -1) < 0.01F,
                  "input.down is false for a key never reported held");
            runtime.set_key_down("f", true);
            runtime.step(world, 1.0F / 60);
            check(std::abs(world.get<RigidBody>(entity)->velocity.x - 1) < 0.01F,
                  "input.down is true while the host reports the key held");
            runtime.set_key_down("f", false);
            runtime.step(world, 1.0F / 60);
            check(std::abs(world.get<RigidBody>(entity)->velocity.x - -1) < 0.01F,
                  "input.down goes back to false once the host reports the key released");
        }
        {
            // input.pressed(key) is edge-triggered: true only on the one step() call right
            // after a down-edge, false again on every later call even while still held --
            // distinct from input.down's plain level check.
            World world;
            world.register_component<Box>("box");
            world.register_component<RigidBody>("rigidbody");
            world.register_component<Collider>("collider");
            world.register_component<Script>("script");
            const auto entity = world.create();
            world.set(entity, Box{{0, 5, 0}, {1, 1, 1}});
            world.set(entity, RigidBody{});
            world.set(entity, Script{"function on_tick(dt) self.vx = input.pressed('f') and 1 or -1 end"});
            Runtime runtime;
            runtime.set_key_down("f", true);
            runtime.step(world, 1.0F / 60);
            check(std::abs(world.get<RigidBody>(entity)->velocity.x - 1) < 0.01F,
                  "input.pressed is true on the tick right after the down-edge");
            runtime.step(world, 1.0F / 60);
            check(std::abs(world.get<RigidBody>(entity)->velocity.x - -1) < 0.01F,
                  "input.pressed is false on a later tick, even while the key is still held");
            runtime.set_key_down("f", false);
            runtime.set_key_down("f", true);
            runtime.step(world, 1.0F / 60);
            check(std::abs(world.get<RigidBody>(entity)->velocity.x - 1) < 0.01F,
                  "input.pressed fires again on a genuinely new down-edge (release then re-press)");
        }
        {
            // self.animate = "clipName" is picked up by take_animation_request(entity) --
            // the one write channel from a script to the host's own animation system.
            World world;
            world.register_component<Box>("box");
            world.register_component<RigidBody>("rigidbody");
            world.register_component<Collider>("collider");
            world.register_component<Script>("script");
            const auto entity = world.create();
            world.set(entity, Box{{0, 5, 0}, {1, 1, 1}});
            world.set(entity, RigidBody{});
            world.set(entity, Script{"function on_tick(dt) if input.pressed('f') then self.animate = 'hit' end end"});
            Runtime runtime;
            check(runtime.take_animation_request(entity).empty(),
                  "no animation request before any script has run");
            runtime.step(world, 1.0F / 60); // no key pressed yet -- self.animate never set this tick
            check(runtime.take_animation_request(entity).empty(),
                  "no animation request on a tick the script didn't set self.animate");
            runtime.set_key_down("f", true);
            runtime.step(world, 1.0F / 60);
            check(runtime.take_animation_request(entity) == "hit",
                  "self.animate = 'hit' is picked up as this entity's pending animation request");
            check(runtime.take_animation_request(entity).empty(),
                  "take_animation_request clears the request once read");
            // self is a fresh table every tick, so an unchanged script (still only setting
            // self.animate on input.pressed, not every tick) does not keep re-requesting it
            // while the key stays held but isn't a fresh press.
            runtime.step(world, 1.0F / 60);
            check(runtime.take_animation_request(entity).empty(),
                  "self.animate is not sticky -- a script must re-set it to re-trigger");
        }
        {
            // self.animate set to a table (never a valid clip name, and not a value
            // lua_isstring's own number-coercion accepts either -- unlike self.animate = 42,
            // which Lua's C API treats as if it were the string "42", same as save.set's own
            // tolstring coercion elsewhere) is simply never treated as a request, not a crash
            // or a stale one left over from an earlier tick.
            World world;
            world.register_component<Box>("box");
            world.register_component<RigidBody>("rigidbody");
            world.register_component<Collider>("collider");
            world.register_component<Script>("script");
            const auto entity = world.create();
            world.set(entity, Box{{0, 5, 0}, {1, 1, 1}});
            world.set(entity, RigidBody{});
            world.set(entity, Script{"function on_tick(dt) self.animate = {} end"});
            Runtime runtime;
            runtime.step(world, 1.0F / 60); // must not crash converting a table self.animate
            check(runtime.take_animation_request(entity).empty(),
                  "a table self.animate is not coerced into an animation request");
        }


        {
            // on_start runs once before the first on_tick; timers, coroutines,
            // time and props all work; log/sound/ui reach the host.
            World world;
            world.register_component<Box>("box");
            world.register_component<RigidBody>("rigidbody");
            world.register_component<Collider>("collider");
            world.register_component<Script>("script");
            const auto entity = world.create();
            world.set(entity, Box{{0, 5, 0}, {1, 1, 1}});
            world.set(entity, RigidBody{});
            Script script{R"lua(
                starts, ticks, fired, repeats, stage = 0, 0, 0, 0, 0
                function on_start() starts = starts + 1; log("hello " .. props.greeting) end
                function on_tick(dt)
                  ticks = ticks + 1
                  self.vx = props.speed
                  if ticks == 1 then
                    after(0.1, function() fired = fired + 1 end)
                    every(0.05, function() repeats = repeats + 1 end)
                    start(function() stage = 1; wait(0.2); stage = 2; sound.play("coin"); ui.set_text("Score", 42) end)
                  end
                  if ticks == 30 then log(string.format("%d %d %d %d %.2f", starts, fired, repeats, stage, time.now)) end
                end
            )lua"};
            Script::Prop speed{"speed", Script::Prop::Kind::number, 2.5, false, ""};
            Script::Prop greeting{"greeting", Script::Prop::Kind::text, 0, false, "props"};
            script.props = {speed, greeting};
            world.set(entity, script);
            TestHost host;
            Runtime runtime;
            runtime.set_host(&host);
            for (int i = 0; i < 30; ++i)
                runtime.step(world, 1.0F / 60);
            check(world.get<RigidBody>(entity)->velocity.x == 2.5F, "a number prop reaches the script");
            check(host.emitted.size() == 4, "log, sound, ui and the final log were emitted");
            check(host.emitted[0] == "log:hello props", "on_start ran with a text prop");
            check(host.emitted[1] == "sound:coin" && host.emitted[2] == "ui_text:Score:42",
                  "a coroutine resumed after wait() and reached sound/ui");
            // 29 ticks elapsed at the time of the log: one after(), floor(29/60 / 0.05) repeats.
            check(host.emitted[3] == "log:1 1 9 2 0.48", "one start, one after, nine every, stage 2, time.now");
        }
        {
            // Collision and trigger callbacks receive the other entity's id,
            // and world.name/find/send/spawn/destroy/health/damage work.
            World world;
            world.register_component<Box>("box");
            world.register_component<RigidBody>("rigidbody");
            world.register_component<Collider>("collider");
            world.register_component<Script>("script");
            TestHost host;
            const auto runner = world.create();
            world.set(runner, Box{{0, 0.5F, 0}, {1, 1, 1}});
            world.set(runner, RigidBody{{6, 0, 0}});
            world.set(runner, Script{R"lua(
                function on_trigger_enter(other) log("enter " .. world.name(other)) end
                function on_trigger_exit(other) log("exit " .. world.name(other)) end
                function on_collision_enter(other)
                  log("hit " .. world.name(other))
                  local hp, max = world.health(other); world.damage(other, 5)
                  world.send(other, "ouch", hp)
                  local ball = world.spawn("Ball", 0, 3, 0, 1, 0, 0)
                  log("spawned " .. tostring(ball ~= nil) .. " " .. tostring(world.find("Wall") == other))
                  world.destroy(other)
                end
            )lua"});
            host.names[runner] = "Runner";
            const auto zone = world.create();
            world.set(zone, Box{{2, 0.5F, 0}, {1, 1, 1}});
            Collider trigger{};
            trigger.is_trigger = true;
            world.set(zone, trigger);
            host.names[zone] = "Zone";
            const auto wall = world.create();
            world.set(wall, Box{{6, 0.5F, 0}, {1, 3, 3}});
            world.set(wall, RigidBody{{0, 0, 0}, false, 0.0F, physics::BodyType::Kinematic});
            world.set(wall, Collider{});
            world.set(wall, Script{R"lua(
                function on_message(name, value, sender) log(name .. " " .. tostring(value) .. " from " .. world.name(sender)) end
                function on_destroy() log("wall destroyed") end
            )lua"});
            host.names[wall] = "Wall";
            Runtime runtime;
            runtime.set_host(&host);
            physics::Events events;
            for (int i = 0; i < 60 && world.alive(wall); ++i) {
                runtime.step(world, 1.0F / 60);
                world.flush();
                physics::step(world, 1.0F / 60, {}, &events);
                runtime.dispatch_contacts(world, events);
                world.flush();
            }
            runtime.step(world, 1.0F / 60); // lets the wall's on_destroy run
            const std::vector<std::string> expected{
                "log:enter Zone", "log:exit Zone", "log:hit Wall", "damage:5",
                "log:ouch 40.0 from Runner", "log:spawned true true", "log:wall destroyed"};
            check(host.emitted == expected, "callbacks, world API and on_destroy ran in order");
            check(world.query<Box>().size() == 3, "the spawned ball exists and the wall is gone");
        }
        {
            // world.raycast/overlap see colliders; physics.add_impulse moves self.
            World world;
            world.register_component<Box>("box");
            world.register_component<RigidBody>("rigidbody");
            world.register_component<Collider>("collider");
            world.register_component<Script>("script");
            const auto target = world.create();
            world.set(target, Box{{5, 1, 0}, {1, 1, 1}});
            world.set(target, Collider{});
            const auto entity = world.create();
            world.set(entity, Box{{0, 1, 0}, {1, 1, 1}});
            world.set(entity, RigidBody{{0, 0, 0}, false, 2.0F});
            world.set(entity, Script{R"lua(
                function on_start()
                  local hit, distance = world.raycast(0, 1, 0, 1, 0, 0, 20)
                  log(tostring(hit) .. " " .. string.format("%.1f", distance))
                  log(#world.overlap(5, 1, 0, 1))
                  physics.add_impulse(0, 0, 4)
                end
            )lua"});
            TestHost host;
            Runtime runtime;
            runtime.set_host(&host);
            runtime.step(world, 1.0F / 60);
            check(host.emitted.size() == 2 && host.emitted[1] == "log:1", "overlap finds the target");
            check(host.emitted[0].find(" 4.5") != std::string::npos, "raycast hits the target at 4.5");
            check(std::abs(world.get<RigidBody>(entity)->velocity.z - 2.0F) < 1e-5F, "impulse / mass");
        }
        std::cout << "Script: velocity control, read-only self.x/y/z, no-op without on_tick, "
                     "compile/runtime error containment, non-string error() values, source-change "
                     "recompilation, os/io sandboxing, runaway-loop watchdog, cleanup on Script removal, "
                     "per-entity VM isolation, non-finite velocity rejection, save/load persistence "
                     "(cross-VM sharing, unset keys, host seeding, dirty-tracking, surviving a source "
                     "change), input.down/input.pressed (level vs. edge semantics), and self.animate "
                     "animation requests (including non-sticky and non-string-coercible handling), "
                     "on_start/timers/coroutines/props/time, collision and trigger callbacks, the world "
                     "API (find/name/send/spawn/destroy/health/damage/raycast/overlap), on_destroy and "
                     "physics impulses passed.\n";
    } catch (const std::exception &e) {
        std::cerr << "script test failed: " << e.what() << "\n";
        return 1;
    }
    return 0;
}
