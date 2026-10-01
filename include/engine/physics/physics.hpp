#pragma once

#include "engine/graphics/box_view.hpp"
#include "engine/world/world.hpp"

#include <cstdint>
#include <optional>
#include <set>
#include <utility>
#include <vector>

namespace engine::physics {

// Dynamic bodies integrate gravity and are pushed out of solid colliders.
// Kinematic bodies move only by their own velocity: no gravity, no ground
// clamp, never pushed by anything, but they still push finite-mass dynamic
// bodies out of their way (a moving platform, a door).
enum class BodyType { Dynamic, Kinematic };

// Linear velocity plus vertical-support state for an axis-aligned rigid body.
// Entities with both Box and RigidBody fall under gravity, move by velocity,
// and are resolved out of overlaps with the ground plane and Collider shapes.
//
// mass == 0 means "unspecified", and keeps this engine's original contract:
// the body is pushed fully out of any solid collider it overlaps, and it acts
// as an immovable (infinite-mass) obstacle to finite-mass bodies. Two bodies
// with mass > 0 that overlap through their colliders share the separation in
// inverse proportion to their masses and exchange momentum along the contact
// normal, so a heavy crate barely moves when a light one hits it.
struct RigidBody final {
    Vec3 velocity{};
    bool grounded{false};
    float mass{0.0F};
    BodyType type{BodyType::Dynamic};
    float gravity_scale{1.0F};
    // Accumulated by add_force(), consumed and cleared by the next step().
    Vec3 force{};
};

// A continuous force, applied over the next step() only (clear-after-use,
// like Unity's ForceMode.Force). A mass-0 body is treated as mass 1 here, so
// forces still do something predictable on an unspecified-mass body.
void add_force(RigidBody& body, Vec3 force);
// An instantaneous change in momentum (ForceMode.Impulse): velocity changes
// by impulse / mass immediately. Mass 0 is treated as mass 1, as above.
void add_impulse(RigidBody& body, Vec3 impulse);

// A static Collider's actual collision shape -- Box derives its bounds from
// the entity's own Box component (center/size), same as this engine has
// always resolved; Sphere is centered on Box.center with `radius`, ignoring
// Box.size entirely (a Sphere collider's Box still exists, since Box is a
// shared component, but only its center is meaningful for collision).
enum class ColliderShape { Box, Sphere };

constexpr std::uint32_t all_layers = 0xFFFFFFFFU;

// Marks an entity's Box as a solid obstacle, box- or sphere-shaped. A mover
// (Box + RigidBody) resolves out of overlapping it.
//
// A trigger collider is never solid: nothing is pushed out of it, and a
// mover carrying one passes through other colliders. Overlaps with it are
// reported as trigger events instead (see Events).
//
// layer is 0..31. Two colliders interact only when each one's mask includes
// the other's layer (Unity's Layer Collision Matrix, stored per collider).
// An entity with no Collider counts as layer 0 with every bit of mask set.
//
// bounciness is 0..1: the fraction of into-surface speed reflected back out
// on contact instead of zeroed. Two colliders use the larger value.
struct Collider final {
    bool is_static{true};
    ColliderShape shape{ColliderShape::Box};
    // Only meaningful when shape == Sphere.
    float radius{0.5F};
    bool is_trigger{false};
    std::uint8_t layer{0};
    std::uint32_t mask{all_layers};
    float bounciness{0.0F};
};

struct Config final {
    float gravity{-18.0F};
    float ground_y{0.0F};
};

enum class ContactPhase { enter, stay, exit };

// One contact or trigger overlap between two entities during a step.
// `a` is always the lower of the two entity handles, so each pair appears
// once per step. `normal` points from a toward b (zero for triggers and for
// exit events). Exit events can name an entity that no longer exists: check
// World::alive() before touching it.
struct ContactEvent final {
    Entity a{};
    Entity b{};
    bool trigger{false};
    ContactPhase phase{ContactPhase::enter};
    Vec3 normal{};
};

// Pass the same Events object to every step() of one simulation: it remembers
// which pairs were touching last step, which is how enter/stay/exit are told
// apart. `events` is replaced (not appended to) by each step().
class Events final {
public:
    std::vector<ContactEvent> events;
    // step()'s own bookkeeping: the (a, b, trigger) pairs touching at the end
    // of the last step. Not meant to be edited by callers.
    using Pair = std::pair<std::pair<Entity, Entity>, bool>;
    std::set<Pair> touching;
    // Forget all state, e.g. when the simulated world is replaced.
    void reset();
};

// True if two boxes' axis-aligned bounds overlap on every axis. Exposed for
// non-physical trigger checks (a goal volume, a pickup) that want the same
// overlap test step() uses internally, without wanting a Collider's push-out
// and velocity-zeroing side effects.
[[nodiscard]] bool overlaps(const Box& a, const Box& b);

// True if two collider layer/mask pairs allow an interaction.
[[nodiscard]] bool layers_interact(std::uint8_t layer_a, std::uint32_t mask_a,
                                   std::uint8_t layer_b, std::uint32_t mask_b);

// Integrates forces, gravity and velocity for every (Box, RigidBody) entity,
// resolves solid contacts, then reports contact and trigger events to
// `events` when one is given.
//
// Resolution for a body against a solid collider it overlaps:
// - the collider has no finite-mass dynamic body (a static obstacle, a mass-0
//   body, or a kinematic body): the body is pushed fully out along the axis
//   (box) or separation vector (sphere) of least penetration, and the
//   velocity component that push was dominantly along is zeroed (or
//   reflected, with bounciness). This is the engine's original behavior.
// - the collider's entity is a finite-mass dynamic body: if the body is
//   kinematic or has mass 0 it pushes the other one fully aside; otherwise
//   the two separate in inverse proportion to their masses and exchange
//   momentum along the contact normal.
//
// A body is marked grounded only when resolved upward (resting on the ground
// plane or on top of a collider or another body). Entities with only one of
// Box/RigidBody, or only one of Box/Collider, are not touched. No-op for
// dt <= 0.
void step(World& world, float dt, const Config& config = {}, Events* events = nullptr);

// A raycast() hit: either a (Box, Collider) entity (box- or sphere-shaped,
// `entity` set, `hit_ground` false) or the ground plane at Config::ground_y
// (`hit_ground` true, `entity` default-constructed and meaningless -- check
// hit_ground, not entity, to tell the two apart).
struct RaycastHit final {
    Entity entity{};
    bool hit_ground{false};
    float distance{};
    Vec3 point{};
};

struct QueryFilter final {
    // Only colliders whose layer bit is set here are considered.
    std::uint32_t layer_mask{all_layers};
    bool hit_triggers{false};
    // This entity is skipped (the caster itself, typically).
    Entity ignore{};
};

// Casts a ray from `origin` along `direction` (need not be pre-normalized;
// raycast() normalizes its own copy, so `distance`/`point` are always in
// world units regardless of the caller's vector length) out to
// `max_distance`, and returns the closest thing it hits -- a (Box, Collider)
// entity, moving or not, or the ground plane -- or std::nullopt if it hits
// neither within range. Trigger colliders are skipped unless the filter asks
// for them.
[[nodiscard]] std::optional<RaycastHit> raycast(World& world, Vec3 origin, Vec3 direction,
                                                float max_distance, const Config& config = {},
                                                const QueryFilter& filter = {});

// Every (Box, Collider) entity whose shape overlaps the sphere, in creation
// order. Trigger colliders are skipped unless the filter asks for them.
[[nodiscard]] std::vector<Entity> overlap_sphere(const World& world, Vec3 center, float radius,
                                                 const QueryFilter& filter = {});

} // namespace engine::physics
