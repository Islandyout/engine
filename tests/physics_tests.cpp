#include "engine/physics/physics.hpp"

#include <cmath>
#include <iostream>
#include <stdexcept>

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
        using physics::Config;
        using physics::RigidBody;

        {
            // A free-falling body accelerates downward and moves before any
            // collision is resolved.
            World world;
            world.register_component<Box>("box");
            world.register_component<RigidBody>("rigidbody");
            world.register_component<Collider>("collider");
            const auto body = world.create();
            world.set(body, Box{{0, 10, 0}, {1, 1, 1}});
            world.set(body, RigidBody{});
            physics::step(world, 1.0F / 60);
            const auto &box = *world.get<Box>(body);
            const auto &rb = *world.get<RigidBody>(body);
            check(box.center.y < 10, "gravity moves the body downward");
            check(rb.velocity.y < 0, "gravity accelerates velocity downward");
            check(!rb.grounded, "airborne body is not grounded");
        }
        {
            // A body starting well above the ground plane keeps falling
            // until it settles exactly on top of it, then stays there.
            World world;
            world.register_component<Box>("box");
            world.register_component<RigidBody>("rigidbody");
            world.register_component<Collider>("collider");
            const auto body = world.create();
            world.set(body, Box{{0, 5, 0}, {1, 1, 1}});
            world.set(body, RigidBody{});
            for (int i = 0; i < 300; ++i)
                physics::step(world, 1.0F / 60);
            const auto &box = *world.get<Box>(body);
            const auto &rb = *world.get<RigidBody>(body);
            check(rb.grounded, "settled body rests on the ground plane");
            check(std::abs(box.center.y - 0.5F) < 0.0001F, "resting body sits flush with ground_y");
            check(rb.velocity.y == 0, "resting body has no vertical velocity");
        }
        {
            // A body resting exactly on the ground plane is not pulled below
            // it on the very next step.
            World world;
            world.register_component<Box>("box");
            world.register_component<RigidBody>("rigidbody");
            world.register_component<Collider>("collider");
            const auto body = world.create();
            world.set(body, Box{{0, 0.5F, 0}, {1, 1, 1}});
            world.set(body, RigidBody{});
            physics::step(world, 1.0F / 60);
            const auto &box = *world.get<Box>(body);
            check(box.center.y >= 0.5F - 0.001F, "already-grounded body does not sink");
            check(world.get<RigidBody>(body)->grounded, "already-grounded body stays grounded");
        }
        {
            // A moving body is stopped and pushed out when it overlaps a
            // static collider from the side.
            World world;
            world.register_component<Box>("box");
            world.register_component<RigidBody>("rigidbody");
            world.register_component<Collider>("collider");
            const auto wall = world.create();
            world.set(wall, Box{{2, 0.5F, 0}, {1, 1, 1}});
            world.set(wall, Collider{});
            const auto body = world.create();
            world.set(body, Box{{1.4F, 0.5F, 0}, {1, 1, 1}});
            world.set(body, RigidBody{{5, 0, 0}});
            physics::step(world, 1.0F / 60);
            const auto &box = *world.get<Box>(body);
            check(box.center.x < 1.5F, "body resolved out of the wall's overlap");
            check(world.get<RigidBody>(body)->velocity.x == 0, "horizontal velocity is zeroed");
        }
        {
            // A falling body lands on top of a static platform instead of
            // sinking through it, and is marked grounded.
            World world;
            world.register_component<Box>("box");
            world.register_component<RigidBody>("rigidbody");
            world.register_component<Collider>("collider");
            const auto platform = world.create();
            world.set(platform, Box{{0, 2, 0}, {4, 1, 4}});
            world.set(platform, Collider{});
            const auto body = world.create();
            world.set(body, Box{{0, 6, 0}, {1, 1, 1}});
            world.set(body, RigidBody{});
            for (int i = 0; i < 300; ++i)
                physics::step(world, 1.0F / 60);
            const auto &box = *world.get<Box>(body);
            check(world.get<RigidBody>(body)->grounded, "body lands and rests on the platform");
            check(std::abs(box.center.y - 3.0F) < 0.0001F, "body rests flush on top of the platform");
        }
        {
            // Non-positive dt is a no-op: no gravity, no motion.
            World world;
            world.register_component<Box>("box");
            world.register_component<RigidBody>("rigidbody");
            world.register_component<Collider>("collider");
            const auto body = world.create();
            world.set(body, Box{{0, 10, 0}, {1, 1, 1}});
            world.set(body, RigidBody{});
            physics::step(world, 0.0F);
            physics::step(world, -1.0F);
            check(world.get<Box>(body)->center.y == 10, "non-positive dt does not move the body");
            check(world.get<RigidBody>(body)->velocity.y == 0,
                  "non-positive dt does not apply gravity");
        }
        {
            // Entities missing either Box or RigidBody are untouched, and a
            // non-static collider never moves other bodies.
            World world;
            world.register_component<Box>("box");
            world.register_component<RigidBody>("rigidbody");
            world.register_component<Collider>("collider");
            const auto bystander = world.create();
            world.set(bystander, Collider{}); // no Box: ignored by both queries
            const auto dynamic_obstacle = world.create();
            world.set(dynamic_obstacle, Box{{1.4F, 0.5F, 0}, {1, 1, 1}});
            world.set(dynamic_obstacle, Collider{false});
            const auto body = world.create();
            world.set(body, Box{{1.4F, 0.5F, 0}, {1, 1, 1}});
            world.set(body, RigidBody{});
            physics::step(world, 1.0F / 60);
            check(std::abs(world.get<Box>(body)->center.x - 1.4F) < 0.0001F,
                  "a non-static collider does not push a body out");
        }

        std::cout << "Physics gravity, ground rest, collider resolution and no-op dt passed.\n";
    } catch (const std::exception &e) {
        std::cerr << e.what() << '\n';
        return 1;
    }
}
