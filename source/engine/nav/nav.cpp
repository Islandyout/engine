#include "engine/nav/nav.hpp"

#include "engine/physics/physics.hpp"

#include <algorithm>
#include <cmath>
#include <queue>

namespace engine::nav {

Grid::Grid(const Settings& settings) : settings_(settings) {
    size_ = std::max(1, static_cast<int>(std::ceil(2 * settings_.half_extent / settings_.cell_size)));
    blocked_.assign(static_cast<std::size_t>(size_) * static_cast<std::size_t>(size_), 0);
}

int Grid::cell_x(float x) const {
    return static_cast<int>(std::floor((x + settings_.half_extent) / settings_.cell_size));
}
int Grid::cell_z(float z) const {
    return static_cast<int>(std::floor((z + settings_.half_extent) / settings_.cell_size));
}

Vec3 Grid::center(int cx, int cz, float y) const {
    return {-settings_.half_extent + (static_cast<float>(cx) + 0.5F) * settings_.cell_size, y,
            -settings_.half_extent + (static_cast<float>(cz) + 0.5F) * settings_.cell_size};
}

void Grid::bake(const World& world, const std::vector<Entity>& ignore) {
    std::fill(blocked_.begin(), blocked_.end(), std::uint8_t{0});
    for (const auto entity : world.query<Box, physics::Collider>()) {
        if (std::find(ignore.begin(), ignore.end(), entity) != ignore.end())
            continue;
        const auto& collider = *world.get<physics::Collider>(entity);
        if (collider.is_trigger)
            continue;
        if (const auto* body = world.get<physics::RigidBody>(entity);
            body && body->type == physics::BodyType::Dynamic && body->mass > 0)
            continue;
        const auto& box = *world.get<Box>(entity);
        const bool sphere = collider.shape == physics::ColliderShape::Sphere;
        const float hx = sphere ? collider.radius : box.size.x / 2;
        const float hy = sphere ? collider.radius : box.size.y / 2;
        const float hz = sphere ? collider.radius : box.size.z / 2;
        const float bottom = box.center.y - hy, top = box.center.y + hy;
        if (top <= settings_.step_height || bottom >= settings_.max_height)
            continue;
        const float r = settings_.agent_radius;
        const int x0 = std::max(0, cell_x(box.center.x - hx - r));
        const int x1 = std::min(size_ - 1, cell_x(box.center.x + hx + r));
        const int z0 = std::max(0, cell_z(box.center.z - hz - r));
        const int z1 = std::min(size_ - 1, cell_z(box.center.z + hz + r));
        for (int cz = z0; cz <= z1; ++cz)
            for (int cx = x0; cx <= x1; ++cx) {
                if (sphere) {
                    const auto c = center(cx, cz, 0);
                    const float dx = c.x - box.center.x, dz = c.z - box.center.z;
                    if (dx * dx + dz * dz > (hx + r) * (hx + r))
                        continue;
                }
                blocked_[static_cast<std::size_t>(cz) * static_cast<std::size_t>(size_) +
                         static_cast<std::size_t>(cx)] = 1;
            }
    }
}

bool Grid::walkable(float x, float z) const { return open(cell_x(x), cell_z(z)); }

std::size_t Grid::blocked_count() const {
    return static_cast<std::size_t>(std::count(blocked_.begin(), blocked_.end(), std::uint8_t{1}));
}

bool Grid::line_of_sight(Vec3 a, Vec3 b) const {
    const float dx = b.x - a.x, dz = b.z - a.z;
    const float length = std::sqrt(dx * dx + dz * dz);
    const int samples = std::max(1, static_cast<int>(std::ceil(length / (settings_.cell_size * 0.5F))));
    for (int i = 0; i <= samples; ++i) {
        const float t = static_cast<float>(i) / static_cast<float>(samples);
        if (!walkable(a.x + dx * t, a.z + dz * t))
            return false;
    }
    return true;
}

std::optional<std::vector<Vec3>> Grid::find_path(Vec3 start, Vec3 goal, int max_expanded) const {
    const int sx = cell_x(start.x), sz = cell_z(start.z);
    if (!inside(sx, sz) || size_ == 0)
        return std::nullopt;
    int gx = std::clamp(cell_x(goal.x), 0, size_ - 1), gz = std::clamp(cell_z(goal.z), 0, size_ - 1);
    // A blocked goal (standing against a wall, inside an obstacle's
    // inflation) snaps to the nearest open cell, searched in growing rings.
    if (!open(gx, gz)) {
        bool found = false;
        for (int ring = 1; ring < 8 && !found; ++ring)
            for (int dz = -ring; dz <= ring && !found; ++dz)
                for (int dx = -ring; dx <= ring && !found; ++dx)
                    if ((std::abs(dx) == ring || std::abs(dz) == ring) && open(gx + dx, gz + dz)) {
                        gx += dx;
                        gz += dz;
                        found = true;
                    }
        if (!found)
            return std::nullopt;
    }
    if (sx == gx && sz == gz)
        return std::vector<Vec3>{};

    const auto index = [this](int cx, int cz) {
        return static_cast<std::size_t>(cz) * static_cast<std::size_t>(size_) + static_cast<std::size_t>(cx);
    };
    const auto heuristic = [gx, gz](int cx, int cz) {
        const float dx = static_cast<float>(std::abs(cx - gx)), dz = static_cast<float>(std::abs(cz - gz));
        return (dx + dz) + (1.41421356F - 2.0F) * std::min(dx, dz); // octile distance
    };
    const std::size_t cells = blocked_.size();
    std::vector<float> cost(cells, std::numeric_limits<float>::infinity());
    std::vector<int> parent(cells, -1);
    using Node = std::pair<float, int>; // (f, cell index)
    std::priority_queue<Node, std::vector<Node>, std::greater<>> frontier;
    const auto start_index = index(sx, sz);
    cost[start_index] = 0;
    frontier.push({heuristic(sx, sz), static_cast<int>(start_index)});
    int best = static_cast<int>(start_index);
    float best_h = heuristic(sx, sz);
    int expanded = 0;
    const auto goal_index = static_cast<int>(index(gx, gz));
    while (!frontier.empty() && expanded++ < max_expanded) {
        const auto [f, current] = frontier.top();
        frontier.pop();
        const int cx = current % size_, cz = current / size_;
        const float g = cost[static_cast<std::size_t>(current)];
        if (f > g + heuristic(cx, cz) + 1e-4F)
            continue; // stale entry
        const float h = heuristic(cx, cz);
        if (h < best_h) {
            best_h = h;
            best = current;
        }
        if (current == goal_index)
            break;
        for (int dz = -1; dz <= 1; ++dz)
            for (int dx = -1; dx <= 1; ++dx) {
                if (dx == 0 && dz == 0)
                    continue;
                const int nx = cx + dx, nz = cz + dz;
                if (!open(nx, nz))
                    continue;
                // No corner cutting: a diagonal needs both side cells open.
                if (dx != 0 && dz != 0 && (!open(cx + dx, cz) || !open(cx, cz + dz)))
                    continue;
                const float step = dx != 0 && dz != 0 ? 1.41421356F : 1.0F;
                const auto next = index(nx, nz);
                if (g + step < cost[next]) {
                    cost[next] = g + step;
                    parent[next] = current;
                    frontier.push({g + step + heuristic(nx, nz), static_cast<int>(next)});
                }
            }
    }
    const int end = parent[static_cast<std::size_t>(goal_index)] != -1 ? goal_index : best;
    if (end == static_cast<int>(start_index))
        return std::nullopt;
    std::vector<Vec3> cells_path;
    for (int at = end; at != -1 && at != static_cast<int>(start_index); at = parent[static_cast<std::size_t>(at)])
        cells_path.push_back(center(at % size_, at / size_, start.y));
    std::reverse(cells_path.begin(), cells_path.end());
    if (end == goal_index && walkable(goal.x, goal.z))
        cells_path.back() = {goal.x, start.y, goal.z};
    // Line-of-sight smoothing: skip every waypoint the previous kept point
    // can already see past.
    std::vector<Vec3> smooth;
    Vec3 from = start;
    std::size_t i = 0;
    while (i < cells_path.size()) {
        std::size_t furthest = i;
        for (std::size_t j = cells_path.size(); j-- > i + 1;)
            if (line_of_sight(from, cells_path[j])) {
                furthest = j;
                break;
            }
        smooth.push_back(cells_path[furthest]);
        from = cells_path[furthest];
        i = furthest + 1;
    }
    return smooth;
}

} // namespace engine::nav
