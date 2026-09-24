#include "engine/physics/physics.hpp"

#include <algorithm>
#include <cmath>
#include <map>

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

// A body's or collider's collision shape in world space: its Collider's
// sphere when it has a sphere Collider, otherwise its Box bounds.
struct Shape final {
    bool sphere{false};
    Vec3 center{};
    float radius{};
    Bounds bounds{};
};

Shape shape_of(const Box &box, const Collider *collider) {
    Shape shape;
    shape.center = box.center;
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

std::optional<Contact> contact_between(const Shape &a, const Shape &b) {
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
            if (bottom < config.ground_y) {
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

        for (const auto other : colliders) {
            if (other == entity)
                continue;
            const auto &collider = *world.get<Collider>(other);
            if (!collider.is_static || collider.is_trigger)
                continue;
            if (!layers_interact(own_layer, own_mask, collider.layer, collider.mask))
                continue;
            auto &obstacle = *world.get<Box>(other);
            auto *other_body = world.get<RigidBody>(other);
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

    // Trigger overlaps: every trigger collider against every moving body.
    for (const auto trigger : colliders) {
        const auto &trigger_collider = *world.get<Collider>(trigger);
        if (!trigger_collider.is_trigger)
            continue;
        const auto trigger_shape = shape_of(*world.get<Box>(trigger), &trigger_collider);
        for (const auto entity : bodies) {
            if (entity == trigger)
                continue;
            const auto *collider = world.get<Collider>(entity);
            if (!layers_interact(trigger_collider.layer, trigger_collider.mask, collider ? collider->layer : 0,
                                 collider ? collider->mask : all_layers))
                continue;
            if (shapes_overlap(trigger_shape, shape_of(*world.get<Box>(entity), collider)))
                record(trigger, entity, true, {});
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

std::optional<RaycastHit> raycast(World &world, Vec3 origin, Vec3 direction, float max_distance,
                                  const Config &config, const QueryFilter &filter) {
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
        if (entity == filter.ignore)
            continue;
        const auto &box = *world.get<Box>(entity);
        const auto &collider = *world.get<Collider>(entity);
        if (collider.is_trigger && !filter.hit_triggers)
            continue;
        if ((filter.layer_mask & (std::uint32_t{1} << (collider.layer & 31U))) == 0)
            continue;
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
