#include "engine/physics/physics.hpp"

#include <algorithm>
#include <cmath>

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

bool bounds_overlap(const Bounds &a, const Bounds &b) {
    return a.min.x < b.max.x && a.max.x > b.min.x && a.min.y < b.max.y && a.max.y > b.min.y &&
           a.min.z < b.max.z && a.max.z > b.min.z;
}

Vec3 closest_point_on_bounds(const Bounds &bounds, const Vec3 &point) {
    return {std::clamp(point.x, bounds.min.x, bounds.max.x),
             std::clamp(point.y, bounds.min.y, bounds.max.y),
             std::clamp(point.z, bounds.min.z, bounds.max.z)};
}

bool sphere_overlaps_bounds(const Bounds &bounds, const Vec3 &center, float radius) {
    const auto closest = closest_point_on_bounds(bounds, center);
    const Vec3 delta{center.x - closest.x, center.y - closest.y, center.z - closest.z};
    return delta.x * delta.x + delta.y * delta.y + delta.z * delta.z < radius * radius;
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

// Pushes `box` out of a sphere obstacle (`center`, `radius`) along the
// separation vector between that center and the closest point on box's own
// bounds, zeroing whichever velocity axis the push was dominantly along --
// the same "zero one axis, report if pushed upward" contract resolve_axis
// uses for a box obstacle. Assumes the two shapes are already known to
// overlap (see sphere_overlaps_bounds).
bool resolve_sphere(Box &box, const Vec3 &center, float radius, Vec3 &velocity) {
    const auto closest = closest_point_on_bounds(bounds_of(box), center);
    const Vec3 delta{center.x - closest.x, center.y - closest.y, center.z - closest.z};
    const float dist = std::sqrt(delta.x * delta.x + delta.y * delta.y + delta.z * delta.z);
    // The sphere's center exactly on (or numerically indistinguishable from) the box
    // surface has no well-defined separation direction -- push straight up, an
    // arbitrary but safe fallback for a degenerate case that should be rare in practice.
    const Vec3 normal =
        dist > 1e-6F ? Vec3{delta.x / dist, delta.y / dist, delta.z / dist} : Vec3{0, 1, 0};
    const float penetration = radius - dist;
    box.center.x -= normal.x * penetration;
    box.center.y -= normal.y * penetration;
    box.center.z -= normal.z * penetration;
    const float ax = std::abs(normal.x), ay = std::abs(normal.y), az = std::abs(normal.z);
    if (ay >= ax && ay >= az) {
        velocity.y = 0;
        return normal.y < 0;
    }
    if (ax >= az) {
        velocity.x = 0;
        return false;
    }
    velocity.z = 0;
    return false;
}

// Slab-method ray/AABB intersection. Writes the entry distance (clamped to
// >= 0, so a ray starting inside the box reports 0, not a negative "behind
// the origin" value) to `t_out` and returns true on a hit within
// [0, max_distance]. `direction` must already be normalized (raycast()'s own
// caller-facing contract normalizes once; this internal helper trusts it).
bool ray_intersects_bounds(const Bounds &bounds, const Vec3 &origin, const Vec3 &direction,
                             float max_distance, float &t_out) {
    float t_min = 0.0F, t_max = max_distance;
    if (std::abs(direction.x) < 1e-9F) {
        if (origin.x < bounds.min.x || origin.x > bounds.max.x)
            return false;
    } else {
        float t1 = (bounds.min.x - origin.x) / direction.x;
        float t2 = (bounds.max.x - origin.x) / direction.x;
        if (t1 > t2)
            std::swap(t1, t2);
        t_min = std::max(t_min, t1);
        t_max = std::min(t_max, t2);
        if (t_min > t_max)
            return false;
    }
    if (std::abs(direction.y) < 1e-9F) {
        if (origin.y < bounds.min.y || origin.y > bounds.max.y)
            return false;
    } else {
        float t1 = (bounds.min.y - origin.y) / direction.y;
        float t2 = (bounds.max.y - origin.y) / direction.y;
        if (t1 > t2)
            std::swap(t1, t2);
        t_min = std::max(t_min, t1);
        t_max = std::min(t_max, t2);
        if (t_min > t_max)
            return false;
    }
    if (std::abs(direction.z) < 1e-9F) {
        if (origin.z < bounds.min.z || origin.z > bounds.max.z)
            return false;
    } else {
        float t1 = (bounds.min.z - origin.z) / direction.z;
        float t2 = (bounds.max.z - origin.z) / direction.z;
        if (t1 > t2)
            std::swap(t1, t2);
        t_min = std::max(t_min, t1);
        t_max = std::min(t_max, t2);
        if (t_min > t_max)
            return false;
    }
    t_out = t_min;
    return true;
}

// Ray/sphere intersection via the standard quadratic (sphere at `center`,
// radius `radius`, `direction` normalized). Writes the nearest
// non-negative root to `t_out`. Returns false for a miss or a sphere
// entirely behind the ray's origin.
bool ray_intersects_sphere(const Vec3 &center, float radius, const Vec3 &origin,
                             const Vec3 &direction, float &t_out) {
    const Vec3 to_center{origin.x - center.x, origin.y - center.y, origin.z - center.z};
    const float b = to_center.x * direction.x + to_center.y * direction.y +
                     to_center.z * direction.z;
    const float c = to_center.x * to_center.x + to_center.y * to_center.y +
                     to_center.z * to_center.z - radius * radius;
    const float discriminant = b * b - c;
    if (discriminant < 0)
        return false;
    const float sqrt_d = std::sqrt(discriminant);
    const float near = -b - sqrt_d;
    const float far = -b + sqrt_d;
    const float t = near >= 0 ? near : far;
    if (t < 0)
        return false;
    t_out = t;
    return true;
}

} // namespace

bool overlaps(const Box &a, const Box &b) { return bounds_overlap(bounds_of(a), bounds_of(b)); }

void step(World &world, float dt, const Config &config) {
    if (!(dt > 0))
        return;
    // Queried once per step, not once per body: World::query() scans every entity, so
    // calling it inside the body loop makes step() quadratic in entity count even when
    // no Collider exists at all (as in the editor bridge, which registers Collider but
    // never assigns one yet).
    const auto colliders = world.query<Box, Collider>();
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

        for (const auto other : colliders) {
            if (other == entity)
                continue;
            const auto &collider = *world.get<Collider>(other);
            if (!collider.is_static)
                continue;
            const auto &obstacle = *world.get<Box>(other);
            if (collider.shape == ColliderShape::Sphere) {
                if (!sphere_overlaps_bounds(bounds_of(box), obstacle.center, collider.radius))
                    continue;
                if (resolve_sphere(box, obstacle.center, collider.radius, body.velocity))
                    body.grounded = true;
            } else {
                if (!bounds_overlap(bounds_of(box), bounds_of(obstacle)))
                    continue;
                if (resolve_axis(box, obstacle, body.velocity))
                    body.grounded = true;
            }
        }
    }
}

std::optional<RaycastHit> raycast(World &world, Vec3 origin, Vec3 direction, float max_distance,
                                    const Config &config) {
    if (!(max_distance > 0))
        return std::nullopt;
    const float len =
        std::sqrt(direction.x * direction.x + direction.y * direction.y + direction.z * direction.z);
    if (!(len > 1e-6F))
        return std::nullopt;
    direction = {direction.x / len, direction.y / len, direction.z / len};

    std::optional<RaycastHit> best;
    auto consider = [&](float t, Entity entity, bool hit_ground) {
        if (t < 0 || t > max_distance)
            return;
        if (best && t >= best->distance)
            return;
        best = RaycastHit{entity, hit_ground, t,
                            {origin.x + direction.x * t, origin.y + direction.y * t,
                             origin.z + direction.z * t}};
    };

    if (std::abs(direction.y) > 1e-9F) {
        const float t = (config.ground_y - origin.y) / direction.y;
        consider(t, Entity{}, true);
    }

    for (const auto entity : world.query<Box, Collider>()) {
        const auto &box = *world.get<Box>(entity);
        const auto &collider = *world.get<Collider>(entity);
        float t{};
        if (collider.shape == ColliderShape::Sphere) {
            if (ray_intersects_sphere(box.center, collider.radius, origin, direction, t))
                consider(t, entity, false);
        } else {
            if (ray_intersects_bounds(bounds_of(box), origin, direction, max_distance, t))
                consider(t, entity, false);
        }
    }
    return best;
}

} // namespace engine::physics
