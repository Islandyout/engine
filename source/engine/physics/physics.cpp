#include "engine/physics/physics.hpp"

#include <algorithm>

namespace engine::physics {
namespace {

struct Bounds final {
    Vec3 min;
    Vec3 max;
};

Bounds bounds_of(const Box &box) {
    return {{box.center.x - box.size.x / 2, box.center.y - box.size.y / 2,
              box.center.z - box.size.z / 2},
             {box.center.x + box.size.x / 2, box.center.y + box.size.y / 2,
              box.center.z + box.size.z / 2}};
}

bool overlaps(const Bounds &a, const Bounds &b) {
    return a.min.x < b.max.x && a.max.x > b.min.x && a.min.y < b.max.y && a.max.y > b.min.y &&
           a.min.z < b.max.z && a.max.z > b.min.z;
}

// Pushes `box` out of `obstacle` along whichever axis has the smallest
// overlap, zeroing that axis of `velocity`. Returns true if the push was
// upward (the body now rests on top of the obstacle).
bool resolve_axis(Box &box, const Box &obstacle, Vec3 &velocity) {
    const auto a = bounds_of(box);
    const auto b = bounds_of(obstacle);
    const float overlap_x = std::min(a.max.x, b.max.x) - std::max(a.min.x, b.min.x);
    const float overlap_y = std::min(a.max.y, b.max.y) - std::max(a.min.y, b.min.y);
    const float overlap_z = std::min(a.max.z, b.max.z) - std::max(a.min.z, b.min.z);
    if (overlap_x <= overlap_y && overlap_x <= overlap_z) {
        box.center.x += box.center.x < obstacle.center.x ? -overlap_x : overlap_x;
        velocity.x = 0;
        return false;
    }
    if (overlap_y <= overlap_x && overlap_y <= overlap_z) {
        const bool from_above = box.center.y >= obstacle.center.y;
        box.center.y += from_above ? overlap_y : -overlap_y;
        velocity.y = 0;
        return from_above;
    }
    box.center.z += box.center.z < obstacle.center.z ? -overlap_z : overlap_z;
    velocity.z = 0;
    return false;
}

} // namespace

void step(World &world, float dt, const Config &config) {
    if (!(dt > 0))
        return;
    for (const auto entity : world.query<Box, RigidBody>()) {
        auto &box = *world.get<Box>(entity);
        auto &body = *world.get<RigidBody>(entity);

        body.velocity.y += config.gravity * dt;
        box.center.x += body.velocity.x * dt;
        box.center.y += body.velocity.y * dt;
        box.center.z += body.velocity.z * dt;
        body.grounded = false;

        const float bottom = box.center.y - box.size.y / 2;
        if (bottom < config.ground_y) {
            box.center.y += config.ground_y - bottom;
            if (body.velocity.y < 0)
                body.velocity.y = 0;
            body.grounded = true;
        }

        for (const auto other : world.query<Box, Collider>()) {
            if (other == entity)
                continue;
            if (!world.get<Collider>(other)->is_static)
                continue;
            const auto &obstacle = *world.get<Box>(other);
            if (!overlaps(bounds_of(box), bounds_of(obstacle)))
                continue;
            if (resolve_axis(box, obstacle, body.velocity))
                body.grounded = true;
        }
    }
}

} // namespace engine::physics
