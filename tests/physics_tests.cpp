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
        {
            // physics::overlaps is the same box-vs-box test step() uses
            // internally, exposed for non-physical trigger checks (a goal
            // volume, a pickup) that want detection without a Collider's
            // push-out and velocity-zeroing side effects.
            check(physics::overlaps(Box{{0, 0, 0}, {1, 1, 1}}, Box{{0.5F, 0, 0}, {1, 1, 1}}),
                  "overlapping boxes report an overlap");
            check(!physics::overlaps(Box{{0, 0, 0}, {1, 1, 1}}, Box{{2, 0, 0}, {1, 1, 1}}),
                  "separated boxes report no overlap");
            check(!physics::overlaps(Box{{0, 0, 0}, {1, 1, 1}}, Box{{1, 0, 0}, {1, 1, 1}}),
                  "exactly touching boxes (shared face, zero penetration) report no overlap");
        }
        {
            // A falling body lands on top of a static sphere collider and
            // rests flush on its apex, the same as it would a box platform --
            // Collider.shape == Sphere is not just authored data, it changes
            // what the body actually resolves against.
            World world;
            world.register_component<Box>("box");
            world.register_component<RigidBody>("rigidbody");
            world.register_component<Collider>("collider");
            const auto ball = world.create();
            world.set(ball, Box{{0, 2, 0}, {1, 1, 1}}); // size is irrelevant for a Sphere shape
            world.set(ball, Collider{true, physics::ColliderShape::Sphere, 1.0F});
            const auto body = world.create();
            world.set(body, Box{{0, 6, 0}, {1, 1, 1}});
            world.set(body, RigidBody{});
            for (int i = 0; i < 300; ++i)
                physics::step(world, 1.0F / 60);
            const auto &box = *world.get<Box>(body);
            check(world.get<RigidBody>(body)->grounded, "body lands and rests on a sphere collider");
            // Sphere top (center.y=2, radius=1) is y=3; box half-height 0.5 => rests at 3.5.
            check(std::abs(box.center.y - 3.5F) < 0.001F, "body rests flush on top of the sphere");
        }
        {
            // A moving body is pushed out and stopped when it overlaps a
            // static sphere collider from the side.
            World world;
            world.register_component<Box>("box");
            world.register_component<RigidBody>("rigidbody");
            world.register_component<Collider>("collider");
            const auto ball = world.create();
            world.set(ball, Box{{2, 0.5F, 0}, {1, 1, 1}});
            world.set(ball, Collider{true, physics::ColliderShape::Sphere, 0.75F});
            const auto body = world.create();
            world.set(body, Box{{1.0F, 0.5F, 0}, {1, 1, 1}});
            world.set(body, RigidBody{{5, 0, 0}});
            physics::step(world, 1.0F / 60);
            const auto &box = *world.get<Box>(body);
            check(box.center.x < 1.4F, "body resolved out of the sphere's overlap");
            check(world.get<RigidBody>(body)->velocity.x == 0, "horizontal velocity is zeroed");
        }
        {
            // raycast() hits a box collider at the expected distance/point,
            // ignores it past max_distance, and reports nothing when nothing
            // is in range in a scene with no ground within range either.
            World world;
            world.register_component<Box>("box");
            world.register_component<Collider>("collider");
            const auto wall = world.create();
            world.set(wall, Box{{5, 0, 0}, {1, 2, 2}});
            world.set(wall, Collider{});
            const Config config{.gravity = -18.0F, .ground_y = -1000.0F}; // keep the ground plane out of range
            const auto hit = physics::raycast(world, {0, 0, 0}, {1, 0, 0}, 100.0F, config);
            check(hit.has_value(), "ray hits the box collider ahead of it");
            check(!hit->hit_ground, "the box hit is not the ground plane");
            check(std::abs(hit->distance - 4.5F) < 0.001F, "hit distance is to the box's near face");
            check(std::abs(hit->point.x - 4.5F) < 0.001F, "hit point sits on the box's near face");
            check(!physics::raycast(world, {0, 0, 0}, {1, 0, 0}, 4.0F, config).has_value(),
                  "a box past max_distance is not hit");
            check(!physics::raycast(world, {0, 0, 0}, {-1, 0, 0}, 100.0F, config).has_value(),
                  "a ray facing away from everything hits nothing");
        }
        {
            // raycast() hits a sphere collider too, and picks the closer of
            // two overlapping candidates rather than whichever was queried
            // first.
            World world;
            world.register_component<Box>("box");
            world.register_component<Collider>("collider");
            const auto near_ball = world.create();
            world.set(near_ball, Box{{3, 0, 0}, {1, 1, 1}});
            world.set(near_ball, Collider{true, physics::ColliderShape::Sphere, 1.0F});
            const auto far_wall = world.create();
            world.set(far_wall, Box{{8, 0, 0}, {1, 2, 2}});
            world.set(far_wall, Collider{});
            const Config config{.gravity = -18.0F, .ground_y = -1000.0F};
            const auto hit = physics::raycast(world, {0, 0, 0}, {1, 0, 0}, 100.0F, config);
            check(hit.has_value() && hit->entity == near_ball,
                  "raycast picks the closer of two candidates in range");
            check(std::abs(hit->distance - 2.0F) < 0.001F, "hit distance is to the sphere's near surface");
        }
        {
            // With nothing else in the way, a downward ray hits the ground
            // plane itself.
            World world;
            world.register_component<Box>("box");
            world.register_component<Collider>("collider");
            const Config config{}; // default ground_y = 0
            const auto hit = physics::raycast(world, {0, 5, 0}, {0, -1, 0}, 100.0F, config);
            check(hit.has_value() && hit->hit_ground, "a downward ray with nothing else in the way hits the ground plane");
            check(std::abs(hit->distance - 5.0F) < 0.001F, "ground hit distance matches the drop to ground_y");
        }
        {
            // A non-normalized direction is normalized internally: distance
            // and hit point are still in real world units, not scaled by the
            // caller's vector length. A non-positive max_distance is a no-op.
            World world;
            world.register_component<Box>("box");
            world.register_component<Collider>("collider");
            const auto wall = world.create();
            world.set(wall, Box{{5, 0, 0}, {1, 2, 2}});
            world.set(wall, Collider{});
            const Config config{.gravity = -18.0F, .ground_y = -1000.0F};
            const auto hit = physics::raycast(world, {0, 0, 0}, {10, 0, 0}, 100.0F, config);
            check(hit.has_value() && std::abs(hit->distance - 4.5F) < 0.001F,
                  "a non-unit-length direction is normalized before use");
            check(!physics::raycast(world, {0, 0, 0}, {1, 0, 0}, 0.0F, config).has_value(),
                  "non-positive max_distance is a no-op");
        }

        std::cout << "Physics gravity, ground rest, box/sphere collider resolution, raycasting, "
                     "and no-op dt passed.\n";
    } catch (const std::exception &e) {
        std::cerr << e.what() << '\n';
        return 1;
    }
}
