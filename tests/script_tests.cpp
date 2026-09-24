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

        std::cout << "Script: velocity control, read-only self.x/y/z, no-op without on_tick, "
                     "compile/runtime error containment, non-string error() values, source-change "
                     "recompilation, os/io sandboxing, runaway-loop watchdog, cleanup on Script removal, "
                     "per-entity VM isolation, non-finite velocity rejection, save/load persistence "
                     "(cross-VM sharing, unset keys, host seeding, dirty-tracking, surviving a source "
                     "change), input.down/input.pressed (level vs. edge semantics), and self.animate "
                     "animation requests (including non-sticky and non-string-coercible handling) "
                     "passed.\n";
    } catch (const std::exception &e) {
        std::cerr << "script test failed: " << e.what() << "\n";
        return 1;
    }
    return 0;
}
