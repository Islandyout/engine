#include "engine/nav/nav.hpp"
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
        World world;
        world.register_component<Box>("box");
        world.register_component<physics::RigidBody>("rigidbody");
        world.register_component<physics::Collider>("collider");
        // A wall along x = 0 from z = -5 to z = 5, blocking the straight line
        // from (-4, 0) to (4, 0).
        const auto wall = world.create();
        world.set(wall, Box{{0, 1, 0}, {1, 2, 10}});
        world.set(wall, physics::Collider{});
        // A low curb and a trigger don't block; a finite-mass crate is skipped.
        const auto curb = world.create();
        world.set(curb, Box{{-8, 0.1F, 0}, {1, 0.2F, 1}});
        world.set(curb, physics::Collider{});
        const auto zone = world.create();
        world.set(zone, Box{{8, 1, 0}, {2, 2, 2}});
        physics::Collider trigger{};
        trigger.is_trigger = true;
        world.set(zone, trigger);
        const auto crate = world.create();
        world.set(crate, Box{{0, 0.5F, 8}, {1, 1, 1}});
        world.set(crate, physics::RigidBody{{}, false, 3.0F});
        world.set(crate, physics::Collider{});

        nav::Grid grid{nav::Settings{}};
        grid.bake(world);
        check(!grid.walkable(0, 0), "the wall blocks its cells");
        check(!grid.walkable(0.8F, 0), "inflated by the agent radius");
        check(grid.walkable(-8, 0), "a curb under step_height is walkable");
        check(grid.walkable(8, 0), "a trigger is walkable");
        check(grid.walkable(0, 8), "a finite-mass crate is not baked");
        check(!grid.line_of_sight({-4, 0, 0}, {4, 0, 0}), "the wall blocks line of sight");

        const auto path = grid.find_path({-4, 0.5F, 0}, {4, 0.5F, 0});
        check(path.has_value() && !path->empty(), "a path around the wall exists");
        check(std::abs(path->back().x - 4) < 1e-4F && std::abs(path->back().z) < 1e-4F, "the path ends at the goal");
        Vec3 from{-4, 0.5F, 0};
        float length = 0;
        for (const auto &point : *path) {
            check(grid.line_of_sight(from, point), "every smoothed segment is walkable");
            length += std::hypot(point.x - from.x, point.z - from.z);
            from = point;
        }
        check(length > 8.5F && length < 20.0F, "the detour goes around the wall's end, not through it");
        check(path->size() <= 4, "smoothing keeps only a few corners");

        const auto straight = grid.find_path({-4, 0, 8}, {-4, 0, 3});
        check(straight && straight->size() == 1, "open ground: one straight segment");
        check(grid.find_path({-4, 0, 0}, {-3.9F, 0, 0.1F})->empty(), "same cell: no waypoints");
        check(!grid.find_path({500, 0, 0}, {0, 0, 0}).has_value(), "start outside the grid: no path");

        // A goal inside the wall snaps to the nearest open cell.
        const auto snapped = grid.find_path({-4, 0, 0}, {0, 0, 0});
        check(snapped && !snapped->empty() && grid.walkable(snapped->back().x, snapped->back().z),
              "a blocked goal snaps to reachable ground");

        {
            // A diagonal (yaw-rotated) wall blocks the cells along its real
            // footprint, not its enclosing box; a tilted ramp blocks nothing.
            World rotated;
            rotated.register_component<Box>("box");
            rotated.register_component<physics::RigidBody>("rigidbody");
            rotated.register_component<physics::Collider>("collider");
            const auto diagonal = rotated.create();
            rotated.set(diagonal, Box{{20, 1, 20}, {10, 2, 0.5F}});
            physics::Collider spun{};
            spun.rotation = {0, 0.7853982F, 0};
            rotated.set(diagonal, spun);
            const auto slope = rotated.create();
            rotated.set(slope, Box{{-20, 0.5F, -20}, {4, 1, 8}});
            physics::Collider tilted{};
            tilted.rotation = {-0.3F, 0, 0};
            rotated.set(slope, tilted);
            nav::Grid rotated_grid{nav::Settings{}};
            rotated_grid.bake(rotated);
            check(!rotated_grid.walkable(20, 20), "the diagonal wall's center is blocked");
            check(!rotated_grid.walkable(22, 18), "cells along the diagonal are blocked");
            check(rotated_grid.walkable(23, 23), "a corner of the enclosing box off the wall stays open");
            check(rotated_grid.walkable(-20, -20), "a walkable ramp does not block");
            // Combined rotation x=45, y=30, z=-45 degrees: the top normal's y is
            // 0.75 (walkable), though cos(x)cos(z) alone would say 0.5.
            World combined;
            combined.register_component<Box>("box");
            combined.register_component<physics::RigidBody>("rigidbody");
            combined.register_component<physics::Collider>("collider");
            const auto tilted_both = combined.create();
            combined.set(tilted_both, Box{{0, 0.5F, 0}, {4, 1, 4}});
            physics::Collider both{};
            both.rotation = {0.7853982F, 0.5235988F, -0.7853982F};
            combined.set(tilted_both, both);
            nav::Grid combined_grid{nav::Settings{}};
            combined_grid.bake(combined);
            check(combined_grid.walkable(0, 0), "a combined-rotation walkable ramp does not block");
        }
        {
            // Terrain: steep cells block, gentle ones don't.
            World empty;
            empty.register_component<Box>("box");
            empty.register_component<physics::RigidBody>("rigidbody");
            empty.register_component<physics::Collider>("collider");
            physics::Heightfield terrain;
            terrain.center = {-30, 0, 30};
            terrain.size = 20;
            terrain.resolution = 3;
            terrain.heights = {0, 0, 0, 0, 30, 0, 0, 0, 0}; // a sharp 30-unit spike
            nav::Grid terrain_grid{nav::Settings{}};
            terrain_grid.bake(empty, {}, &terrain);
            check(!terrain_grid.walkable(-33, 30), "the spike's steep sides block");
            terrain.heights = {0, 0, 0, 0, 1, 0, 0, 0, 0}; // a gentle 1-unit bump
            terrain_grid.bake(empty, {}, &terrain);
            check(terrain_grid.walkable(-33, 30) && terrain_grid.blocked_count() == 0, "a gentle bump doesn't");
        }
        std::cout << "Nav grid baking (walls, rotated walls, ramps, steep terrain, agent inflation, curbs, triggers, dynamic bodies), line of "
                     "sight, A* around obstacles with smoothing, and goal snapping passed.\n";
    } catch (const std::exception &e) {
        std::cerr << "nav test failed: " << e.what() << "\n";
        return 1;
    }
    return 0;
}
