#pragma once

#include "engine/graphics/box_view.hpp"
#include "engine/world/world.hpp"

#include <optional>

namespace engine::physics {

// Linear velocity plus vertical-support state for an axis-aligned rigid body.
// Entities with both Box and RigidBody fall under gravity, move by velocity,
// and are resolved out of overlaps with the ground plane and Collider shapes.
struct RigidBody final {
    Vec3 velocity{};
    bool grounded{false};
};

// A static Collider's actual collision shape -- Box derives its bounds from
// the entity's own Box component (center/size), same as this engine has
// always resolved; Sphere is centered on Box.center with `radius`, ignoring
// Box.size entirely (a Sphere collider's Box still exists, since Box is a
// shared component, but only its center is meaningful for collision).
enum class ColliderShape { Box, Sphere };

// Marks an entity's Box as a solid obstacle, box- or sphere-shaped. Only
// static colliders are supported: they never move under physics, but a
// RigidBody resolves out of overlapping them.
struct Collider final {
    bool is_static{true};
    ColliderShape shape{ColliderShape::Box};
    // Only meaningful when shape == Sphere.
    float radius{0.5F};
};

struct Config final {
    float gravity{-18.0F};
    float ground_y{0.0F};
};

// True if two boxes' axis-aligned bounds overlap on every axis. Exposed for
// non-physical trigger checks (a goal volume, a pickup) that want the same
// overlap test step() uses internally, without wanting a Collider's push-out
// and velocity-zeroing side effects.
[[nodiscard]] bool overlaps(const Box& a, const Box& b);

// Integrates gravity and velocity for every (Box, RigidBody) entity, then
// resolves each one out of the ground plane at ground_y and any overlapping
// static (Box, Collider) entity along the axis (box obstacle) or separation
// vector (sphere obstacle) of least penetration, zeroing the velocity
// component that push was dominantly along. A rigid body is marked grounded
// only when resolved upward (resting on the ground plane or on top of a
// collider, box- or sphere-shaped). Entities with only one of Box/RigidBody,
// or only one of Box/Collider, are not touched. No-op for dt <= 0.
void step(World& world, float dt, const Config& config = {});

// A raycast() hit: either a static (Box, Collider) entity (box- or
// sphere-shaped, `entity` set, `hit_ground` false) or the ground plane at
// Config::ground_y (`hit_ground` true, `entity` default-constructed and
// meaningless -- check hit_ground, not entity, to tell the two apart).
struct RaycastHit final {
    Entity entity{};
    bool hit_ground{false};
    float distance{};
    Vec3 point{};
};

// Casts a ray from `origin` along `direction` (need not be pre-normalized;
// raycast() normalizes its own copy, so `distance`/`point` are always in
// world units regardless of the caller's vector length) out to
// `max_distance`, and returns the closest thing it hits -- a static
// (Box, Collider) entity or the ground plane -- or std::nullopt if it hits
// neither within range. Exposed for gameplay that needs to know what's in
// front of something (aiming, AI line-of-sight) without physics::step()'s
// own resolve/push-out side effects. Deliberately scoped to static
// obstacles and the ground plane, not other (Box, RigidBody) movers (a
// Player, a Vehicle) -- a natural follow-up, not this round's.
[[nodiscard]] std::optional<RaycastHit> raycast(World& world, Vec3 origin, Vec3 direction,
                                                  float max_distance, const Config& config = {});

} // namespace engine::physics
