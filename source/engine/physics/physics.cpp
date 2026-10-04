#include "engine/physics/physics.hpp"

#include <algorithm>
#include <cmath>
#include <map>
#include <unordered_map>
#include <vector>

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
// Zeroes (bounce == 0, the original behavior) or reflects a velocity
// component the push just opposed. Only an into-surface component is
// reflected: a body already moving away keeps its speed.
void stop_or_bounce(float &component, float push_direction, float bounce) {
    if (bounce > 0 && component * push_direction < 0)
        component = -component * bounce;
    else
        component = 0;
}

bool resolve_axis(Box &box, const Box &obstacle, Vec3 &velocity, float bounce) {
    const auto a = bounds_of(box);
    const auto b = bounds_of(obstacle);
    const float overlap_x = std::min(a.max.x, b.max.x) - std::max(a.min.x, b.min.x);
    const float overlap_y = std::min(a.max.y, b.max.y) - std::max(a.min.y, b.min.y);
    const float overlap_z = std::min(a.max.z, b.max.z) - std::max(a.min.z, b.min.z);
    if (overlap_x <= overlap_y && overlap_x <= overlap_z) {
        const float push = box.center.x < obstacle.center.x ? -overlap_x : overlap_x;
        box.center.x += push;
        stop_or_bounce(velocity.x, push, bounce);
        return false;
    }
    if (overlap_y <= overlap_x && overlap_y <= overlap_z) {
        const bool from_above = box.center.y >= obstacle.center.y;
        const float push = from_above ? overlap_y : -overlap_y;
        box.center.y += push;
        stop_or_bounce(velocity.y, push, bounce);
        return from_above;
    }
    const float push = box.center.z < obstacle.center.z ? -overlap_z : overlap_z;
    box.center.z += push;
    stop_or_bounce(velocity.z, push, bounce);
    return false;
}

// Pushes `box` out of a sphere obstacle (`center`, `radius`) along the
// separation vector between that center and the closest point on box's own
// bounds, zeroing whichever velocity axis the push was dominantly along --
// the same "zero one axis, report if pushed upward" contract resolve_axis
// uses for a box obstacle. Assumes the two shapes are already known to
// overlap (see sphere_overlaps_bounds).
bool resolve_sphere(Box &box, const Vec3 &center, float radius, Vec3 &velocity, float bounce) {
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
        stop_or_bounce(velocity.y, -normal.y, bounce);
        return normal.y < 0;
    }
    if (ax >= az) {
        stop_or_bounce(velocity.x, -normal.x, bounce);
        return false;
    }
    stop_or_bounce(velocity.z, -normal.z, bounce);
    return false;
}

// Slab-method ray/AABB intersection. Writes the entry distance (clamped to
// >= 0, so a ray starting inside the box reports 0, not a negative "behind
// the origin" value) to `t_out` and returns true on a hit within
// [0, max_distance]. `direction` must already be normalized (raycast()'s own
// caller-facing contract normalizes once; this internal helper trusts it).
bool ray_intersects_bounds(const Bounds &bounds, const Vec3 &origin, const Vec3 &direction,
                             float max_distance, float &t_out, Vec3 *normal_out = nullptr) {
    float t_min = 0.0F, t_max = max_distance;
    int entry_axis = -1;
    const float o[3]{origin.x, origin.y, origin.z};
    const float d[3]{direction.x, direction.y, direction.z};
    const float lo[3]{bounds.min.x, bounds.min.y, bounds.min.z};
    const float hi[3]{bounds.max.x, bounds.max.y, bounds.max.z};
    for (int axis = 0; axis < 3; ++axis) {
        if (std::abs(d[axis]) < 1e-9F) {
            if (o[axis] < lo[axis] || o[axis] > hi[axis])
                return false;
            continue;
        }
        float t1 = (lo[axis] - o[axis]) / d[axis];
        float t2 = (hi[axis] - o[axis]) / d[axis];
        if (t1 > t2)
            std::swap(t1, t2);
        if (t1 > t_min) {
            t_min = t1;
            entry_axis = axis;
        }
        t_max = std::min(t_max, t2);
        if (t_min > t_max)
            return false;
    }
    t_out = t_min;
    if (normal_out) {
        // Entered through a face: that face's outward normal. Started
        // inside: straight back along the ray.
        float n[3]{0, 0, 0};
        if (entry_axis >= 0)
            n[entry_axis] = d[entry_axis] > 0 ? -1.0F : 1.0F;
        *normal_out = entry_axis >= 0 ? Vec3{n[0], n[1], n[2]} : Vec3{-direction.x, -direction.y, -direction.z};
    }
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

// A body's or collider's collision shape in world space: its Collider's
// sphere when it has a sphere Collider, otherwise its Box bounds.
struct Shape final {
    bool sphere{false};
    Vec3 center{};
    float radius{};
    Bounds bounds{};
    // An oriented box: local axes in world space and half sizes along them.
    bool oriented{false};
    Vec3 axes[3]{};
    float half[3]{};
};

// The columns of three.js's Euler XYZ rotation matrix: the local x, y and z
// axes in world space.
void rotation_axes(const Vec3 &euler, Vec3 (&axes)[3]) {
    const float a = std::cos(euler.x), b = std::sin(euler.x);
    const float c = std::cos(euler.y), d = std::sin(euler.y);
    const float e = std::cos(euler.z), f = std::sin(euler.z);
    const float ae = a * e, af = a * f, be = b * e, bf = b * f;
    axes[0] = {c * e, af + be * d, bf - ae * d};
    axes[1] = {-c * f, ae - bf * d, be + af * d};
    axes[2] = {d, -b * c, a * c};
}

Shape shape_of(const Box &box, const Collider *collider) {
    Shape shape;
    shape.center = box.center;
    if (collider && collider->shape == ColliderShape::Box && is_oriented(*collider)) {
        shape.oriented = true;
        rotation_axes(collider->rotation, shape.axes);
        shape.half[0] = box.size.x / 2;
        shape.half[1] = box.size.y / 2;
        shape.half[2] = box.size.z / 2;
        Vec3 extent{};
        for (int i = 0; i < 3; ++i) {
            extent.x += std::abs(shape.axes[i].x) * shape.half[i];
            extent.y += std::abs(shape.axes[i].y) * shape.half[i];
            extent.z += std::abs(shape.axes[i].z) * shape.half[i];
        }
        shape.bounds = {{box.center.x - extent.x, box.center.y - extent.y, box.center.z - extent.z},
                        {box.center.x + extent.x, box.center.y + extent.y, box.center.z + extent.z}};
        return shape;
    }
    if (collider && collider->shape == ColliderShape::Sphere) {
        shape.sphere = true;
        shape.radius = collider->radius;
        shape.bounds = {{box.center.x - collider->radius, box.center.y - collider->radius,
                         box.center.z - collider->radius},
                        {box.center.x + collider->radius, box.center.y + collider->radius,
                         box.center.z + collider->radius}};
    } else {
        shape.bounds = bounds_of(box);
    }
    return shape;
}

float dot(const Vec3 &a, const Vec3 &b) { return a.x * b.x + a.y * b.y + a.z * b.z; }

struct Contact final {
    Vec3 normal{}; // from the first shape toward the second
    float depth{};
};

// Least-penetration axis between two AABBs.
std::optional<Contact> box_box(const Bounds &a, const Bounds &b) {
    if (!bounds_overlap(a, b))
        return std::nullopt;
    const float ox = std::min(a.max.x, b.max.x) - std::max(a.min.x, b.min.x);
    const float oy = std::min(a.max.y, b.max.y) - std::max(a.min.y, b.min.y);
    const float oz = std::min(a.max.z, b.max.z) - std::max(a.min.z, b.min.z);
    const float acx = (a.min.x + a.max.x) / 2, bcx = (b.min.x + b.max.x) / 2;
    const float acy = (a.min.y + a.max.y) / 2, bcy = (b.min.y + b.max.y) / 2;
    const float acz = (a.min.z + a.max.z) / 2, bcz = (b.min.z + b.max.z) / 2;
    if (ox <= oy && ox <= oz)
        return Contact{{bcx >= acx ? 1.0F : -1.0F, 0, 0}, ox};
    if (oy <= ox && oy <= oz)
        return Contact{{0, bcy >= acy ? 1.0F : -1.0F, 0}, oy};
    return Contact{{0, 0, bcz >= acz ? 1.0F : -1.0F}, oz};
}

// Sphere (first) against box (second).
std::optional<Contact> sphere_box(const Vec3 &center, float radius, const Bounds &box) {
    if (!sphere_overlaps_bounds(box, center, radius))
        return std::nullopt;
    const auto closest = closest_point_on_bounds(box, center);
    const Vec3 delta{closest.x - center.x, closest.y - center.y, closest.z - center.z};
    const float dist = std::sqrt(dot(delta, delta));
    if (dist > 1e-6F)
        return Contact{{delta.x / dist, delta.y / dist, delta.z / dist}, radius - dist};
    // Center inside the box: fall back to the box-box axis of the sphere's bounds.
    return box_box({{center.x - radius, center.y - radius, center.z - radius},
                    {center.x + radius, center.y + radius, center.z + radius}},
                   box);
}

Vec3 cross(const Vec3 &a, const Vec3 &b) {
    return {a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x};
}

// A box shape as center + axes + half sizes (an axis-aligned one gets the
// world axes).
void as_oriented(const Shape &shape, Vec3 &center, Vec3 (&axes)[3], float (&half)[3]) {
    if (shape.oriented) {
        center = shape.center;
        for (int i = 0; i < 3; ++i) {
            axes[i] = shape.axes[i];
            half[i] = shape.half[i];
        }
        return;
    }
    center = {(shape.bounds.min.x + shape.bounds.max.x) / 2, (shape.bounds.min.y + shape.bounds.max.y) / 2,
              (shape.bounds.min.z + shape.bounds.max.z) / 2};
    axes[0] = {1, 0, 0};
    axes[1] = {0, 1, 0};
    axes[2] = {0, 0, 1};
    half[0] = (shape.bounds.max.x - shape.bounds.min.x) / 2;
    half[1] = (shape.bounds.max.y - shape.bounds.min.y) / 2;
    half[2] = (shape.bounds.max.z - shape.bounds.min.z) / 2;
}

// Separating-axis test between two boxes, either of them oriented: the
// 3 + 3 face axes and 9 edge cross products. The contact normal is the axis
// of least overlap (face axes preferred over near-equal edge axes, which
// keeps resting contacts stable), pointing from a toward b.
std::optional<Contact> box_box_oriented(const Shape &a, const Shape &b) {
    Vec3 ca{}, cb{};
    Vec3 au[3], bu[3];
    float ah[3], bh[3];
    as_oriented(a, ca, au, ah);
    as_oriented(b, cb, bu, bh);
    const Vec3 between{cb.x - ca.x, cb.y - ca.y, cb.z - ca.z};
    std::optional<Contact> best;
    const auto test = [&](Vec3 axis, float bias) {
        const float length = std::sqrt(dot(axis, axis));
        if (length < 1e-5F)
            return true; // parallel edges: covered by the face axes
        axis = {axis.x / length, axis.y / length, axis.z / length};
        float ra = 0, rb = 0;
        for (int i = 0; i < 3; ++i) {
            ra += ah[i] * std::abs(dot(au[i], axis));
            rb += bh[i] * std::abs(dot(bu[i], axis));
        }
        const float distance = dot(between, axis);
        const float overlap = ra + rb - std::abs(distance);
        if (overlap <= 0)
            return false;
        if (!best || overlap * bias < best->depth) {
            const float sign = distance >= 0 ? 1.0F : -1.0F;
            best = Contact{{axis.x * sign, axis.y * sign, axis.z * sign}, overlap};
        }
        return true;
    };
    for (int i = 0; i < 3; ++i)
        if (!test(au[i], 1.0F) || !test(bu[i], 1.0F))
            return std::nullopt;
    for (int i = 0; i < 3; ++i)
        for (int j = 0; j < 3; ++j)
            if (!test(cross(au[i], bu[j]), 1.05F))
                return std::nullopt;
    return best;
}

// Sphere (first) against an oriented box (second), solved in the box's frame.
std::optional<Contact> sphere_oriented(const Vec3 &center, float radius, const Shape &box) {
    const Vec3 offset{center.x - box.center.x, center.y - box.center.y, center.z - box.center.z};
    const Vec3 local{dot(offset, box.axes[0]), dot(offset, box.axes[1]), dot(offset, box.axes[2])};
    const Bounds local_bounds{{-box.half[0], -box.half[1], -box.half[2]}, {box.half[0], box.half[1], box.half[2]}};
    auto contact = sphere_box(local, radius, local_bounds);
    if (contact) {
        const Vec3 n = contact->normal;
        contact->normal = {box.axes[0].x * n.x + box.axes[1].x * n.y + box.axes[2].x * n.z,
                           box.axes[0].y * n.x + box.axes[1].y * n.y + box.axes[2].y * n.z,
                           box.axes[0].z * n.x + box.axes[1].z * n.y + box.axes[2].z * n.z};
    }
    return contact;
}

std::optional<Contact> contact_between(const Shape &a, const Shape &b) {
    if (a.oriented || b.oriented) {
        if (!bounds_overlap(a.bounds, b.bounds))
            return std::nullopt;
        if (a.sphere)
            return sphere_oriented(a.center, a.radius, b);
        if (b.sphere) {
            auto contact = sphere_oriented(b.center, b.radius, a);
            if (contact)
                contact->normal = {-contact->normal.x, -contact->normal.y, -contact->normal.z};
            return contact;
        }
        return box_box_oriented(a, b);
    }
    if (a.sphere && b.sphere) {
        const Vec3 delta{b.center.x - a.center.x, b.center.y - a.center.y, b.center.z - a.center.z};
        const float dist = std::sqrt(dot(delta, delta));
        const float reach = a.radius + b.radius;
        if (dist >= reach)
            return std::nullopt;
        const Vec3 normal = dist > 1e-6F ? Vec3{delta.x / dist, delta.y / dist, delta.z / dist}
                                         : Vec3{0, 1, 0};
        return Contact{normal, reach - dist};
    }
    if (a.sphere)
        return sphere_box(a.center, a.radius, b.bounds);
    if (b.sphere) {
        auto contact = sphere_box(b.center, b.radius, a.bounds);
        if (contact)
            contact->normal = {-contact->normal.x, -contact->normal.y, -contact->normal.z};
        return contact;
    }
    return box_box(a.bounds, b.bounds);
}

bool shapes_overlap(const Shape &a, const Shape &b) { return contact_between(a, b).has_value(); }

float inverse_mass_for_force(const RigidBody &body) { return body.mass > 0 ? 1.0F / body.mass : 1.0F; }

bool finite_dynamic(const RigidBody *body) {
    return body && body->type == BodyType::Dynamic && body->mass > 0;
}

std::pair<Entity, Entity> ordered(Entity a, Entity b) { return b < a ? std::pair{b, a} : std::pair{a, b}; }

} // namespace

void add_force(RigidBody &body, Vec3 force) {
    body.force.x += force.x;
    body.force.y += force.y;
    body.force.z += force.z;
}

void add_impulse(RigidBody &body, Vec3 impulse) {
    const float inv = inverse_mass_for_force(body);
    body.velocity.x += impulse.x * inv;
    body.velocity.y += impulse.y * inv;
    body.velocity.z += impulse.z * inv;
}

void Events::reset() {
    events.clear();
    touching.clear();
}

bool overlaps(const Box &a, const Box &b) { return bounds_overlap(bounds_of(a), bounds_of(b)); }

bool layers_interact(std::uint8_t layer_a, std::uint32_t mask_a, std::uint8_t layer_b,
                     std::uint32_t mask_b) {
    const auto bit = [](std::uint8_t layer) { return std::uint32_t{1} << (layer & 31U); };
    return (mask_a & bit(layer_b)) != 0 && (mask_b & bit(layer_a)) != 0;
}

bool Heightfield::contains(float x, float z) const {
    return resolution >= 2 && heights.size() == static_cast<std::size_t>(resolution) * static_cast<std::size_t>(resolution) &&
           std::abs(x - center.x) <= size / 2 && std::abs(z - center.z) <= size / 2;
}

float Heightfield::height_at(float x, float z) const {
    if (resolution < 2 || heights.size() != static_cast<std::size_t>(resolution) * static_cast<std::size_t>(resolution))
        return center.y;
    const float step = size / static_cast<float>(resolution - 1);
    const float last = static_cast<float>(resolution - 1) - 0.0001F;
    const float fx = std::clamp((x - center.x + size / 2) / step, 0.0F, last);
    const float fz = std::clamp((z - center.z + size / 2) / step, 0.0F, last);
    const int c = static_cast<int>(fx), r = static_cast<int>(fz);
    const float tx = fx - static_cast<float>(c), tz = fz - static_cast<float>(r);
    const auto at = [&](int cc, int rr) {
        return heights[static_cast<std::size_t>(rr) * static_cast<std::size_t>(resolution) + static_cast<std::size_t>(cc)];
    };
    const float top = at(c, r) + (at(c + 1, r) - at(c, r)) * tx;
    const float bottom = at(c, r + 1) + (at(c + 1, r + 1) - at(c, r + 1)) * tx;
    return center.y + top + (bottom - top) * tz;
}

Vec3 Heightfield::normal_at(float x, float z) const {
    const float e = size / static_cast<float>(std::max(resolution - 1, 1)) * 0.25F;
    const float dx = (height_at(x + e, z) - height_at(x - e, z)) / (2 * e);
    const float dz = (height_at(x, z + e) - height_at(x, z - e)) / (2 * e);
    const float length = std::sqrt(1 + dx * dx + dz * dz);
    return {-dx / length, 1 / length, -dz / length};
}

bool is_oriented(const Collider &collider) {
    return collider.shape == ColliderShape::Box &&
           (collider.rotation.x != 0 || collider.rotation.y != 0 || collider.rotation.z != 0);
}

std::pair<Vec3, Vec3> world_bounds(const Box &box, const Collider *collider) {
    const auto shape = shape_of(box, collider);
    return {shape.bounds.min, shape.bounds.max};
}

bool probe_overlaps(const Box &probe, const Box &box, const Collider &collider) {
    return shapes_overlap(shape_of(probe, nullptr), shape_of(box, &collider));
}

void step(World &world, float dt, const Config &config, Events *events) {
    if (!(dt > 0))
        return;
    std::map<Events::Pair, Vec3> current;
    const auto record = [&](Entity a, Entity b, bool trigger, Vec3 normal_from_a) {
        if (!events)
            return;
        const float length = std::sqrt(dot(normal_from_a, normal_from_a));
        if (length > 1e-6F)
            normal_from_a = {normal_from_a.x / length, normal_from_a.y / length, normal_from_a.z / length};
        const auto key = ordered(a, b);
        const Vec3 normal = key.first == a ? normal_from_a
                                           : Vec3{-normal_from_a.x, -normal_from_a.y, -normal_from_a.z};
        current.emplace(Events::Pair{key, trigger}, normal);
    };

    // Queried once per step, not once per body: World::query() scans every entity, so
    // calling it inside the body loop makes step() quadratic in entity count even when
    // no Collider exists at all.
    const auto colliders = world.query<Box, Collider>();
    const auto bodies = world.query<Box, RigidBody>();
    // Solid obstacles with their components and world bounds, gathered once
    // per step: a body then rejects most of them with one bounds test
    // instead of three component lookups and a shape build each (a terrain
    // level has hundreds of scattered trunks; this was most of a tick).
    // Dynamic obstacles can be pushed during the step, so their bounds are
    // recomputed when tested.
    struct Obstacle final {
        Entity entity;
        const Collider *collider;
        Box *box;
        RigidBody *body;
        Bounds bounds;
    };
    std::vector<Obstacle> obstacles;
    obstacles.reserve(colliders.size());
    for (const auto other : colliders) {
        const auto &collider = *world.get<Collider>(other);
        if (!collider.is_static || collider.is_trigger)
            continue;
        auto *obstacle_box = world.get<Box>(other);
        obstacles.push_back({other, &collider, obstacle_box, world.get<RigidBody>(other),
                             shape_of(*obstacle_box, &collider).bounds});
    }
    // Broadphase (0.75.0): static obstacles bucketed in a uniform grid of
    // 8 m cells, so a body tests only the obstacles near it instead of every
    // one in the level (a town of hundreds of colliders and a hundred
    // walkers was most of a tick). Moving obstacles and very large ones are
    // tested by every body, as before. Candidates keep their original order,
    // so results match the brute-force loop.
    constexpr float cell = 8.0F;
    const auto cell_of = [](float v) { return static_cast<std::int32_t>(std::floor(v / cell)); };
    const auto cell_key = [](std::int32_t x, std::int32_t z) {
        return (static_cast<std::int64_t>(x) << 32) ^ static_cast<std::uint32_t>(z);
    };
    std::unordered_map<std::int64_t, std::vector<std::uint32_t>> grid;
    std::vector<std::uint32_t> always;
    for (std::uint32_t i = 0; i < obstacles.size(); ++i) {
        const auto &o = obstacles[i];
        const auto x0 = cell_of(o.bounds.min.x), x1 = cell_of(o.bounds.max.x);
        const auto z0 = cell_of(o.bounds.min.z), z1 = cell_of(o.bounds.max.z);
        if (finite_dynamic(o.body) || !std::isfinite(o.bounds.min.x) || !std::isfinite(o.bounds.max.z) ||
            static_cast<std::int64_t>(x1 - x0 + 1) * (z1 - z0 + 1) > 64) {
            always.push_back(i);
            continue;
        }
        for (auto x = x0; x <= x1; ++x)
            for (auto z = z0; z <= z1; ++z)
                grid[cell_key(x, z)].push_back(i);
    }
    std::vector<std::uint32_t> nearby;
    for (const auto entity : bodies) {
        auto &box = *world.get<Box>(entity);
        auto &body = *world.get<RigidBody>(entity);
        const auto *own_collider = world.get<Collider>(entity);
        const bool kinematic = body.type == BodyType::Kinematic;

        if (!kinematic) {
            const float inv = inverse_mass_for_force(body);
            body.velocity.x += body.force.x * inv * dt;
            body.velocity.y += (config.gravity * body.gravity_scale + body.force.y * inv) * dt;
            body.velocity.z += body.force.z * inv * dt;
        }
        body.force = {};
        box.center.x += body.velocity.x * dt;
        box.center.y += body.velocity.y * dt;
        box.center.z += body.velocity.z * dt;
        body.grounded = false;

        if (!kinematic) {
            const float bottom = box.center.y - box.size.y / 2;
            if (config.terrain && config.terrain->contains(box.center.x, box.center.z)) {
                const float ground = config.terrain->height_at(box.center.x, box.center.z);
                if (bottom < ground) {
                    const Vec3 n = config.terrain->normal_at(box.center.x, box.center.z);
                    if (n.y >= walkable_normal_y) {
                        box.center.y += ground - bottom;
                        if (body.velocity.y < 0)
                            body.velocity.y = 0;
                        body.grounded = true;
                    } else {
                        const float depth = (ground - bottom) * n.y;
                        box.center = {box.center.x + n.x * depth, box.center.y + n.y * depth, box.center.z + n.z * depth};
                        const float into = dot(body.velocity, n);
                        if (into < 0)
                            body.velocity = {body.velocity.x - n.x * into, body.velocity.y - n.y * into,
                                             body.velocity.z - n.z * into};
                    }
                }
            } else if (bottom < config.ground_y) {
                box.center.y += config.ground_y - bottom;
                if (body.velocity.y < 0)
                    body.velocity.y = 0;
                body.grounded = true;
            }
        }

        // A trigger on the moving body makes the body itself non-solid.
        if (own_collider && own_collider->is_trigger)
            continue;
        const std::uint8_t own_layer = own_collider ? own_collider->layer : 0;
        const std::uint32_t own_mask = own_collider ? own_collider->mask : all_layers;
        const float own_bounce = own_collider ? own_collider->bounciness : 0.0F;
        const float own_inv = kinematic || body.mass <= 0 ? 0.0F : 1.0F / body.mass;

        // The body's extent under either shape it can be tested as (its own
        // collider's, or its plain box for oriented and box obstacles),
        // padded so a touching contact still passes; rebuilt only when a
        // contact moved the body.
        Bounds reach{};
        Vec3 reach_at{std::nanf(""), 0, 0};
        const auto update_reach = [&] {
            if (box.center.x == reach_at.x && box.center.y == reach_at.y && box.center.z == reach_at.z)
                return;
            reach_at = box.center;
            const auto own_bounds = shape_of(box, own_collider).bounds;
            const auto plain = bounds_of(box);
            constexpr float pad = 1e-3F;
            reach = {{std::min(own_bounds.min.x, plain.min.x) - pad, std::min(own_bounds.min.y, plain.min.y) - pad,
                      std::min(own_bounds.min.z, plain.min.z) - pad},
                     {std::max(own_bounds.max.x, plain.max.x) + pad, std::max(own_bounds.max.y, plain.max.y) + pad,
                      std::max(own_bounds.max.z, plain.max.z) + pad}};
        };
        update_reach();
        nearby.assign(always.begin(), always.end());
        if (std::isfinite(reach.min.x) && std::isfinite(reach.max.z)) {
            // One cell of slack: contacts can push the body during the loop.
            const auto x0 = cell_of(reach.min.x) - 1, x1 = cell_of(reach.max.x) + 1;
            const auto z0 = cell_of(reach.min.z) - 1, z1 = cell_of(reach.max.z) + 1;
            if (static_cast<std::int64_t>(x1 - x0 + 1) * (z1 - z0 + 1) > 4096) {
                nearby.resize(obstacles.size());
                for (std::uint32_t i = 0; i < obstacles.size(); ++i)
                    nearby[i] = i;
            } else {
                for (auto x = x0; x <= x1; ++x)
                    for (auto z = z0; z <= z1; ++z)
                        if (const auto found = grid.find(cell_key(x, z)); found != grid.end())
                            nearby.insert(nearby.end(), found->second.begin(), found->second.end());
            }
        } else {
            nearby.resize(obstacles.size());
            for (std::uint32_t i = 0; i < obstacles.size(); ++i)
                nearby[i] = i;
        }
        std::sort(nearby.begin(), nearby.end());
        nearby.erase(std::unique(nearby.begin(), nearby.end()), nearby.end());
        for (const auto index : nearby) {
            const auto &candidate = obstacles[index];
            const auto other = candidate.entity;
            if (other == entity)
                continue;
            const auto &collider = *candidate.collider;
            if (!layers_interact(own_layer, own_mask, collider.layer, collider.mask))
                continue;
            auto &obstacle = *candidate.box;
            auto *other_body = candidate.body;
            {
                update_reach();
                const auto &bounds =
                    finite_dynamic(other_body) ? shape_of(obstacle, &collider).bounds : candidate.bounds;
                if (!bounds_overlap(reach, bounds))
                    continue;
            }
            const float bounce = std::max(own_bounce, collider.bounciness);

            if (finite_dynamic(other_body)) {
                const auto contact = contact_between(shape_of(box, own_collider), shape_of(obstacle, &collider));
                if (!contact)
                    continue;
                const Vec3 n = contact->normal;
                const float other_inv = 1.0F / other_body->mass;
                const float total = own_inv + other_inv;
                const float own_share = contact->depth * own_inv / total;
                const float other_share = contact->depth * other_inv / total;
                box.center = {box.center.x - n.x * own_share, box.center.y - n.y * own_share,
                              box.center.z - n.z * own_share};
                obstacle.center = {obstacle.center.x + n.x * other_share,
                                   obstacle.center.y + n.y * other_share,
                                   obstacle.center.z + n.z * other_share};
                const Vec3 relative{other_body->velocity.x - body.velocity.x,
                                    other_body->velocity.y - body.velocity.y,
                                    other_body->velocity.z - body.velocity.z};
                const float closing = dot(relative, n);
                if (closing < 0) {
                    const float j = -(1.0F + bounce) * closing / total;
                    body.velocity = {body.velocity.x - j * own_inv * n.x, body.velocity.y - j * own_inv * n.y,
                                     body.velocity.z - j * own_inv * n.z};
                    other_body->velocity = {other_body->velocity.x + j * other_inv * n.x,
                                            other_body->velocity.y + j * other_inv * n.y,
                                            other_body->velocity.z + j * other_inv * n.z};
                }
                if (n.y < -0.5F && !kinematic)
                    body.grounded = true;
                if (n.y > 0.5F)
                    other_body->grounded = true;
                record(entity, other, false, n);
                continue;
            }

            if (kinematic)
                continue; // kinematic bodies are never pushed by obstacles
            if (is_oriented(collider)) {
                const auto contact = contact_between(shape_of(box, nullptr), shape_of(obstacle, &collider));
                if (!contact)
                    continue;
                // n points from the body into the obstacle.
                const Vec3 n = contact->normal;
                if (-n.y >= walkable_normal_y) {
                    // Standing on walkable ground: lift straight up by the
                    // vertical distance that clears the surface, so gravity
                    // can't make the body creep down a ramp.
                    box.center.y += contact->depth / -n.y;
                    if (body.velocity.y < 0)
                        body.velocity.y = 0;
                    body.grounded = true;
                } else {
                    box.center = {box.center.x - n.x * contact->depth, box.center.y - n.y * contact->depth,
                                  box.center.z - n.z * contact->depth};
                    const float into = dot(body.velocity, n);
                    if (into > 0) {
                        const float remove = into * (1.0F + bounce);
                        body.velocity = {body.velocity.x - n.x * remove, body.velocity.y - n.y * remove,
                                         body.velocity.z - n.z * remove};
                    }
                }
                record(entity, other, false, n);
                continue;
            }
            if (collider.shape == ColliderShape::Sphere) {
                if (!sphere_overlaps_bounds(bounds_of(box), obstacle.center, collider.radius))
                    continue;
                const Vec3 before = box.center;
                if (resolve_sphere(box, obstacle.center, collider.radius, body.velocity, bounce))
                    body.grounded = true;
                record(entity, other, false,
                       {before.x - box.center.x, before.y - box.center.y, before.z - box.center.z});
            } else {
                if (!bounds_overlap(bounds_of(box), bounds_of(obstacle)))
                    continue;
                const Vec3 before = box.center;
                if (resolve_axis(box, obstacle, body.velocity, bounce))
                    body.grounded = true;
                record(entity, other, false,
                       {before.x - box.center.x, before.y - box.center.y, before.z - box.center.z});
            }
        }
    }

    if (!events)
        return;

    // Trigger overlaps: every trigger collider against every moving body
    // (each body's shape built once, not once per trigger).
    struct Moving final {
        Entity entity;
        const Collider *collider;
        Shape shape;
    };
    std::vector<Moving> moving;
    for (const auto trigger : colliders) {
        const auto &trigger_collider = *world.get<Collider>(trigger);
        if (!trigger_collider.is_trigger)
            continue;
        if (moving.empty()) {
            moving.reserve(bodies.size());
            for (const auto entity : bodies) {
                const auto *collider = world.get<Collider>(entity);
                moving.push_back({entity, collider, shape_of(*world.get<Box>(entity), collider)});
            }
        }
        const auto trigger_shape = shape_of(*world.get<Box>(trigger), &trigger_collider);
        for (const auto &body : moving) {
            if (body.entity == trigger)
                continue;
            if (!layers_interact(trigger_collider.layer, trigger_collider.mask, body.collider ? body.collider->layer : 0,
                                 body.collider ? body.collider->mask : all_layers))
                continue;
            if (!bounds_overlap(trigger_shape.bounds, body.shape.bounds))
                continue;
            if (shapes_overlap(trigger_shape, body.shape))
                record(trigger, body.entity, true, {});
        }
    }

    events->events.clear();
    for (const auto &[pair, normal] : current) {
        const bool was = events->touching.count(pair) != 0;
        events->events.push_back({pair.first.first, pair.first.second, pair.second,
                                  was ? ContactPhase::stay : ContactPhase::enter,
                                  normal});
    }
    for (const auto &pair : events->touching)
        if (current.count(pair) == 0)
            events->events.push_back({pair.first.first, pair.first.second, pair.second, ContactPhase::exit, {}});
    events->touching.clear();
    for (const auto &entry : current)
        events->touching.insert(entry.first);
}

RaycastTargets raycast_targets(const World &world) {
    RaycastTargets result;
    const auto entities = world.query<Box, Collider>();
    result.targets.reserve(entities.size());
    const bool bodies = world.registered<RigidBody>();
    for (const auto entity : entities) {
        const auto *box = world.get<Box>(entity);
        const auto *collider = world.get<Collider>(entity);
        RaycastTargets::Target target{entity, box, collider, bodies && world.get<RigidBody>(entity) != nullptr, {}, {}};
        if (!target.moving) {
            const auto bounds = shape_of(*box, collider).bounds;
            target.min = bounds.min;
            target.max = bounds.max;
        }
        result.targets.push_back(target);
    }
    return result;
}

std::optional<RaycastHit> raycast(World &world, Vec3 origin, Vec3 direction, float max_distance,
                                  const Config &config, const QueryFilter &filter) {
    return raycast(raycast_targets(world), origin, direction, max_distance, config, filter);
}

std::optional<RaycastHit> raycast(const RaycastTargets &targets, Vec3 origin, Vec3 direction, float max_distance,
                                  const Config &config, const QueryFilter &filter) {
    if (!(max_distance > 0))
        return std::nullopt;
    const float len =
        std::sqrt(direction.x * direction.x + direction.y * direction.y + direction.z * direction.z);
    if (!(len > 1e-6F))
        return std::nullopt;
    direction = {direction.x / len, direction.y / len, direction.z / len};

    std::optional<RaycastHit> best;
    auto consider = [&](float t, Entity entity, bool hit_ground, Vec3 normal) {
        if (t < 0 || t > max_distance)
            return;
        if (best && t >= best->distance)
            return;
        best = RaycastHit{entity, hit_ground, t,
                          {origin.x + direction.x * t, origin.y + direction.y * t,
                           origin.z + direction.z * t},
                          normal};
    };

    if (std::abs(direction.y) > 1e-9F) {
        const float t = (config.ground_y - origin.y) / direction.y;
        const float px = origin.x + direction.x * t, pz = origin.z + direction.z * t;
        // Inside the terrain's square the terrain is the ground instead.
        if (!config.terrain || !config.terrain->contains(px, pz))
            consider(t, Entity{}, true, {0, direction.y < 0 ? 1.0F : -1.0F, 0});
    }
    if (config.terrain) {
        // March half a cell at a time; refine the first crossing by bisection.
        const auto &terrain = *config.terrain;
        const float step = terrain.size / static_cast<float>(std::max(terrain.resolution - 1, 1)) * 0.5F;
        const auto above = [&](float t) {
            const float x = origin.x + direction.x * t, z = origin.z + direction.z * t;
            return origin.y + direction.y * t - terrain.height_at(x, z);
        };
        const auto inside = [&](float t) {
            return terrain.contains(origin.x + direction.x * t, origin.z + direction.z * t);
        };
        float previous = 0;
        bool previous_inside = inside(0);
        bool previous_above = !previous_inside || above(0) > 0;
        for (float t = std::min(step, max_distance); t <= max_distance; t = std::min(t + step, max_distance)) {
            const bool now_inside = inside(t);
            const bool now_above = !now_inside || above(t) > 0;
            // Downward crossings, entering from outside the square below
            // the surface, and upward crossings from underneath all count.
            const bool down = now_inside && previous_above && !now_above;
            const bool up = now_inside && previous_inside && !previous_above && now_above;
            if (down || up) {
                float lo = previous, hi = t;
                for (int i = 0; i < 12; ++i) {
                    const float mid = (lo + hi) / 2;
                    const bool mid_above = !inside(mid) || above(mid) > 0;
                    if (mid_above == previous_above)
                        lo = mid;
                    else
                        hi = mid;
                }
                const float x = origin.x + direction.x * hi, z = origin.z + direction.z * hi;
                const Vec3 n = terrain.normal_at(x, z);
                consider(hi, Entity{}, true, down ? n : Vec3{-n.x, -n.y, -n.z});
                break;
            }
            previous = t;
            previous_inside = now_inside;
            previous_above = now_above;
            if (t >= max_distance)
                break;
        }
    }

    // The segment's own bounds reject static targets nowhere near it.
    const Vec3 end{origin.x + direction.x * max_distance, origin.y + direction.y * max_distance,
                   origin.z + direction.z * max_distance};
    const Vec3 lo{std::min(origin.x, end.x), std::min(origin.y, end.y), std::min(origin.z, end.z)};
    const Vec3 hi{std::max(origin.x, end.x), std::max(origin.y, end.y), std::max(origin.z, end.z)};
    for (const auto &target : targets.targets) {
        const Entity entity = target.entity;
        if (entity == filter.ignore)
            continue;
        if (!target.moving && (target.max.x < lo.x || target.min.x > hi.x || target.max.y < lo.y ||
                               target.min.y > hi.y || target.max.z < lo.z || target.min.z > hi.z))
            continue;
        const auto &box = *target.box;
        const auto &collider = *target.collider;
        if (collider.is_trigger && !filter.hit_triggers)
            continue;
        if ((filter.layer_mask & (std::uint32_t{1} << (collider.layer & 31U))) == 0)
            continue;
        float t{};
        if (collider.shape == ColliderShape::Sphere) {
            if (ray_intersects_sphere(box.center, collider.radius, origin, direction, t)) {
                const Vec3 point{origin.x + direction.x * t - box.center.x, origin.y + direction.y * t - box.center.y,
                                 origin.z + direction.z * t - box.center.z};
                const float r = std::sqrt(dot(point, point));
                consider(t, entity, false,
                         r > 1e-6F ? Vec3{point.x / r, point.y / r, point.z / r}
                                   : Vec3{-direction.x, -direction.y, -direction.z});
            }
        } else if (is_oriented(collider)) {
            // In the box's own frame the box is axis-aligned.
            const auto shape = shape_of(box, &collider);
            const Vec3 offset{origin.x - box.center.x, origin.y - box.center.y, origin.z - box.center.z};
            const Vec3 local_origin{dot(offset, shape.axes[0]), dot(offset, shape.axes[1]), dot(offset, shape.axes[2])};
            const Vec3 local_direction{dot(direction, shape.axes[0]), dot(direction, shape.axes[1]),
                                       dot(direction, shape.axes[2])};
            const Bounds local{{-shape.half[0], -shape.half[1], -shape.half[2]},
                               {shape.half[0], shape.half[1], shape.half[2]}};
            Vec3 n{};
            if (ray_intersects_bounds(local, local_origin, local_direction, max_distance, t, &n))
                consider(t, entity, false,
                         {shape.axes[0].x * n.x + shape.axes[1].x * n.y + shape.axes[2].x * n.z,
                          shape.axes[0].y * n.x + shape.axes[1].y * n.y + shape.axes[2].y * n.z,
                          shape.axes[0].z * n.x + shape.axes[1].z * n.y + shape.axes[2].z * n.z});
        } else {
            Vec3 n{};
            if (ray_intersects_bounds(bounds_of(box), origin, direction, max_distance, t, &n))
                consider(t, entity, false, n);
        }
    }
    return best;
}

std::vector<Entity> overlap_sphere(const World &world, Vec3 center, float radius, const QueryFilter &filter) {
    std::vector<Entity> result;
    if (!(radius > 0))
        return result;
    const Shape probe{true, center, radius,
                      {{center.x - radius, center.y - radius, center.z - radius},
                       {center.x + radius, center.y + radius, center.z + radius}}};
    for (const auto entity : world.query<Box, Collider>()) {
        if (entity == filter.ignore)
            continue;
        const auto &collider = *world.get<Collider>(entity);
        if (collider.is_trigger && !filter.hit_triggers)
            continue;
        if ((filter.layer_mask & (std::uint32_t{1} << (collider.layer & 31U))) == 0)
            continue;
        if (shapes_overlap(probe, shape_of(*world.get<Box>(entity), &collider)))
            result.push_back(entity);
    }
    return result;
}

} // namespace engine::physics
