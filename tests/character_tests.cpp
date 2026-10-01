#include "engine/gameplay/character.hpp"

#include <cmath>
#include <iostream>
#include <stdexcept>

namespace {
void check(bool pass, const char *message) {
    if (!pass)
        throw std::runtime_error{message};
}

using namespace engine;

struct Rig {
    World world;
    Entity player{};
    gameplay::ControllerState state;
    gameplay::ControllerSettings settings;
    physics::Config config{};

    explicit Rig(Vec3 feet = {0, 0, 0}) {
        world.register_component<Box>("box");
        world.register_component<physics::RigidBody>("rigidbody");
        world.register_component<physics::Collider>("collider");
        player = world.create();
        Box box{{feet.x, feet.y + 0.5F, feet.z}, {1, 1, 1}};
        gameplay::configure_body(box, settings);
        world.set(player, box);
        world.set(player, physics::RigidBody{});
    }
    Entity wall(Vec3 center, Vec3 size) {
        const auto e = world.create();
        world.set(e, Box{center, size});
        world.set(e, physics::Collider{});
        return e;
    }
    void tick(const gameplay::ControllerInput &input, int count = 1) {
        for (int i = 0; i < count; ++i) {
            gameplay::begin_step(world, player, state, settings, input, config.gravity, 1.0F / 60);
            physics::step(world, 1.0F / 60, config);
            gameplay::end_step(world, player, state, settings, config, 1.0F / 60);
        }
    }
    const Box &box() { return *world.get<Box>(player); }
    const physics::RigidBody &body() { return *world.get<physics::RigidBody>(player); }
    float feet() { return box().center.y - box().size.y / 2; }
};
} // namespace

int main() {
    try {
        {
            // configure_body keeps the feet where they were.
            Rig rig;
            check(std::abs(rig.feet()) < 1e-5F, "configure_body keeps the feet planted");
            check(std::abs(rig.box().size.y - 1.8F) < 1e-5F, "body is stand_height tall");
            check(std::abs(gameplay::eye_offset(rig.box()) - 1.656F) < 1e-3F, "eye sits near the top");
        }
        {
            // Walking forward at yaw 0 heads down -z and reaches walk speed;
            // sprint is faster; releasing input stops the body quickly.
            Rig rig;
            rig.tick({}, 5);
            check(rig.state.grounded, "settles grounded");
            rig.tick({0, 1, false, false, false, 0}, 60);
            check(std::abs(rig.state.speed - rig.settings.walk_speed) < 0.01F, "reaches walk speed");
            check(rig.box().center.z < -3.0F && std::abs(rig.box().center.x) < 1e-4F, "forward is -z at yaw 0");
            rig.tick({0, 1, false, true, false, 0}, 60);
            check(std::abs(rig.state.speed - rig.settings.sprint_speed) < 0.01F && rig.state.sprinting,
                  "sprint reaches sprint speed");
            rig.tick({}, 20);
            check(rig.state.speed < 0.01F, "no input decelerates to a stop");
            // Yaw +90 degrees: forward is -x, strafe right is -z.
            rig.tick({0, 1, false, false, false, 1.5707964F}, 30);
            check(rig.body().velocity.x < -4.0F && std::abs(rig.body().velocity.z) < 0.01F, "forward follows yaw");
            rig.tick({1, 0, false, false, false, 1.5707964F}, 60);
            check(rig.body().velocity.z < -4.0F && std::abs(rig.body().velocity.x) < 0.01F, "strafe follows yaw");
        }
        {
            // A jump reaches about jump_height and lands grounded again.
            Rig rig;
            rig.tick({}, 5);
            rig.tick({0, 0, true, false, false, 0});
            float peak = 0;
            for (int i = 0; i < 90; ++i) {
                rig.tick({});
                peak = std::max(peak, rig.feet());
            }
            check(std::abs(peak - rig.settings.jump_height) < 0.08F, "jump peak is about jump_height");
            check(rig.state.grounded, "lands grounded");
            // Holding jump (no new press) doesn't jump again.
            rig.tick({0, 0, false, false, false, 0}, 10);
            check(rig.feet() < 0.01F, "no repeat jump without a new press");
        }
        {
            // Coyote time: a jump just after walking off a ledge still works;
            // the same press much later doesn't.
            Rig rig({0, 2, 0});
            rig.wall({0, 1, -1}, {4, 2, 6}); // a platform with its top at y = 2
            rig.tick({}, 5);
            check(rig.state.grounded && std::abs(rig.feet() - 2) < 0.01F, "stands on the platform");
            int ticks = 0;
            while (rig.state.grounded && ticks < 200) {
                rig.tick({0, -1, false, false, false, 0}); // backwards, toward +z and the edge at z = 2
                ++ticks;
            }
            check(!rig.state.grounded, "walked off the edge");
            rig.tick({0, 0, true, false, false, 0});
            check(rig.body().velocity.y > 3.0F, "coyote jump fires just after leaving the ledge");

            Rig late({0, 2, 0});
            late.wall({0, 1, -1}, {4, 2, 6});
            late.tick({}, 5);
            while (late.state.grounded)
                late.tick({0, -1, false, false, false, 0});
            late.tick({}, 15);
            late.tick({0, 0, true, false, false, 0});
            check(late.body().velocity.y < 0, "no jump long after leaving the ledge");
        }
        {
            // Jump buffering: pressing jump just before landing jumps on landing.
            Rig rig({0, 0.6F, 0});
            rig.tick({}, 1);
            while (!rig.state.grounded && rig.feet() > 0.05F)
                rig.tick({});
            Rig buffered({0, 1.0F, 0});
            int air = 0;
            while (!buffered.state.grounded && air < 200) {
                // Press once when about 0.1 m above the ground.
                const bool press = buffered.feet() < 0.15F && buffered.body().velocity.y < 0 &&
                                   buffered.state.since_jump_pressed > 0.5F;
                buffered.tick({0, 0, press, false, false, 0});
                ++air;
            }
            buffered.tick({}, 3);
            check(buffered.feet() > 0.1F && buffered.body().velocity.y > 0, "a buffered jump fires on landing");
        }
        {
            // Crouching shrinks the body (feet planted) and slows it; standing up
            // under a low ceiling waits until there's headroom.
            Rig rig;
            rig.wall({0, 1.6F + 0.25F, -6}, {4, 0.5F, 3}); // ceiling bottom at 1.6, from z = -7.5 to -4.5
            rig.tick({}, 5);
            rig.tick({0, 1, false, false, true, 0}, 60);
            check(rig.state.crouched && std::abs(rig.box().size.y - 1.1F) < 1e-4F, "crouch shrinks the body");
            check(std::abs(rig.feet()) < 0.01F, "crouch keeps the feet planted");
            check(std::abs(rig.state.speed - rig.settings.crouch_speed) < 0.01F, "crouched speed");
            // Walk under the ceiling crouched, then release crouch there.
            while (rig.box().center.z > -6)
                rig.tick({0, 1, false, false, true, 0});
            rig.tick({}, 30);
            rig.tick({0, 0, false, false, false, 0}, 5);
            check(rig.state.crouched, "can't stand up under the ceiling");
            rig.tick({0, 1, false, false, false, 0}, 90); // walks out crouched...
            check(!rig.state.crouched && std::abs(rig.box().size.y - 1.8F) < 1e-4F, "...and stands once clear");
        }
        {
            // Steps up to step_height are climbed; a taller ledge blocks.
            Rig rig;
            rig.wall({0, 0.15F, -3}, {4, 0.3F, 2});  // a 0.3 step from z = -4 to -2
            rig.wall({0, 0.5F, 3}, {4, 1.0F, 2});    // a 1.0 ledge from z = 2 to 4
            rig.tick({}, 5);
            rig.tick({0, 1, false, false, false, 0}, 50);
            check(std::abs(rig.feet() - 0.3F) < 0.02F && rig.state.grounded, "climbed the 0.3 step");
            check(rig.box().center.z < -2.5F, "kept moving onto the step");
            Rig blocked;
            blocked.wall({0, 0.5F, -3}, {4, 1.0F, 2});
            blocked.tick({}, 5);
            blocked.tick({0, 1, false, false, false, 0}, 60);
            check(blocked.feet() < 0.01F && blocked.box().center.z > -2.0F, "a 1.0 ledge blocks");
        }
        {
            // Walking down stairs stays grounded every tick (ground snap).
            Rig rig({0, 0.75F, 0});
            rig.wall({0, 0.375F, -0.5F}, {4, 0.75F, 2}); // top 0.75, z -1.5..0.5
            rig.wall({0, 0.25F, -2.0F}, {4, 0.5F, 1});   // top 0.5, z -2.5..-1.5
            rig.wall({0, 0.125F, -3.0F}, {4, 0.25F, 1}); // top 0.25, z -3.5..-2.5
            rig.tick({}, 5);
            bool always_grounded = true;
            for (int i = 0; i < 70; ++i) {
                rig.tick({0, 1, false, false, false, 0});
                always_grounded = always_grounded && rig.state.grounded;
            }
            check(rig.box().center.z < -4.0F && rig.feet() < 0.01F, "walked down to the floor");
            check(always_grounded, "stayed grounded down the stairs");
        }
        {
            // A landing reports the downward speed once.
            Rig rig({0, 3, 0});
            float landing = 0;
            for (int i = 0; i < 120; ++i) {
                rig.tick({});
                landing = std::max(landing, rig.state.landing_speed);
            }
            check(landing > 5.0F && rig.state.landing_speed == 0, "landing speed reported on the landing tick");
        }
        std::cout << "Character controller: body sizing, acceleration, walk/sprint/crouch speeds, yaw-relative "
                     "movement, jump height, coyote time, jump buffering, crouch headroom, step climbing, stair "
                     "ground snapping and landing speed passed.\n";
    } catch (const std::exception &e) {
        std::cerr << e.what() << '\n';
        return 1;
    }
}
