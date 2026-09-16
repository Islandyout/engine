#include "engine/physics/physics.hpp"
#include "engine/script/script.hpp"

#include <cmath>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

namespace {
void check(bool pass, const char *message) {
    if (!pass)
        throw std::runtime_error{message};
}
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
            // self.x/y/z are read-only: a script assigning to them has no effect
            // on the entity's actual position, only self.vx/vy/vz round-trips.
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
            check(std::abs(world.get<Box>(entity)->center.x - 2) < 0.1F,
                  "assigning self.x from a script does not move the entity");
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

        std::cout << "Script: velocity control, read-only self.x/y/z, no-op without on_tick, "
                     "compile/runtime error containment, os/io sandboxing, runaway-loop watchdog, "
                     "cleanup on Script removal, and per-entity VM isolation passed.\n";
    } catch (const std::exception &e) {
        std::cerr << "script test failed: " << e.what() << "\n";
        return 1;
    }
    return 0;
}
