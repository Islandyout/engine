#pragma once

#include "engine/graphics/box_view.hpp"
#include "engine/world/world.hpp"

namespace engine::physics {

// Linear velocity plus vertical-support state for an axis-aligned rigid body.
// Entities with both Box and RigidBody fall under gravity, move by velocity,
// and are resolved out of overlaps with the ground plane and Collider boxes.
struct RigidBody final {
    Vec3 velocity{};
    bool grounded{false};
};

// Marks an entity's Box as a solid AABB obstacle. Only static colliders are
// supported: they never move under physics, but a RigidBody resolves out of
// overlapping them.
struct Collider final {
    bool is_static{true};
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
// static (Box, Collider) entity along the axis of least penetration, zeroing
// the velocity component that was resolved. A rigid body is marked grounded
// only when resolved upward (resting on the ground plane or on top of a
// collider). Entities with only one of Box/RigidBody, or only one of
// Box/Collider, are not touched. No-op for dt <= 0.
void step(World& world, float dt, const Config& config = {});

} // namespace engine::physics
