#pragma once

#include "engine/graphics/box_view.hpp"
#include "engine/physics/physics.hpp"
#include "engine/world/world.hpp"

#include <cstdint>
#include <optional>
#include <vector>

namespace engine::nav {

// A walkability grid over the XZ plane, baked from solid colliders, for A*
// pathfinding. A cell is blocked when a solid (non-trigger) collider
// overlaps it, inflated by the agent radius, anywhere between the ground
// and `max_height` -- so agents route around walls and crates rather than
// through them. Colliders taller than `step_height` block; lower ones are
// treated as walkable (a curb, a ramp base).
struct Settings final {
    float cell_size{0.5F};
    float agent_radius{0.4F};
    float step_height{0.35F};
    float max_height{2.0F};
    // Half-extent of the square area the grid covers, centered on (0, 0).
    float half_extent{60.0F};
};

class Grid final {
public:
    Grid() = default;
    explicit Grid(const Settings& settings);

    // Rebuilds every cell from the world's (Box, physics::Collider) entities.
    // Entities in `ignore` (e.g. the agents themselves) are skipped, and so
    // are finite-mass dynamic bodies, which move and get pushed aside.
    // A terrain, when given, also blocks cells whose slope is steeper than
    // physics::walkable_normal_y.
    void bake(const World& world, const std::vector<Entity>& ignore = {},
              const physics::Heightfield* terrain = nullptr);

    [[nodiscard]] bool walkable(float x, float z) const;
    [[nodiscard]] const Settings& settings() const { return settings_; }
    [[nodiscard]] int width() const { return size_; }
    [[nodiscard]] std::size_t blocked_count() const;

    // A* from start to goal over 8-connected cells, then shortened by
    // line-of-sight smoothing. Returns the waypoints after `start` (the
    // last one is `goal`, or the closest reachable point to it), each at
    // start.y. Empty when start and goal share a cell. std::nullopt when
    // the start is outside the grid or no cell near the goal is reachable.
    [[nodiscard]] std::optional<std::vector<Vec3>> find_path(Vec3 start, Vec3 goal,
                                                             int max_expanded = 20000) const;

    // True if a straight walk from a to b crosses only walkable cells.
    [[nodiscard]] bool line_of_sight(Vec3 a, Vec3 b) const;

private:
    [[nodiscard]] int cell_x(float x) const;
    [[nodiscard]] int cell_z(float z) const;
    [[nodiscard]] bool inside(int cx, int cz) const { return cx >= 0 && cz >= 0 && cx < size_ && cz < size_; }
    [[nodiscard]] bool open(int cx, int cz) const {
        return inside(cx, cz) && blocked_[static_cast<std::size_t>(cz) * static_cast<std::size_t>(size_) +
                                          static_cast<std::size_t>(cx)] == 0;
    }
    [[nodiscard]] Vec3 center(int cx, int cz, float y) const;

    Settings settings_{};
    int size_{0};
    std::vector<std::uint8_t> blocked_;
};

} // namespace engine::nav
