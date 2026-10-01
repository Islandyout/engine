#pragma once

#include "engine/graphics/box_view.hpp"
#include "engine/physics/physics.hpp"
#include "engine/world/world.hpp"

namespace engine::gameplay {

// Tuning for a first/third-person character driven through a physics
// RigidBody (0.60.0). Speeds are world units per second, accelerations units
// per second squared, heights world units, times seconds.
struct ControllerSettings final {
    float walk_speed{4.5F};
    float sprint_speed{7.5F};
    float crouch_speed{2.2F};
    // How quickly ground speed reaches the target with input held, and how
    // quickly it bleeds off without input.
    float ground_accel{45.0F};
    float ground_decel{35.0F};
    // Steering while airborne; no input keeps momentum.
    float air_accel{12.0F};
    float jump_height{1.1F};
    float stand_height{1.8F};
    float crouch_height{1.1F};
    // Half the body's footprint (the box is 2 * radius wide and deep).
    float radius{0.35F};
    // Ledges up to this high are climbed without jumping (stairs, curbs),
    // and the character sticks to ground this far below it when walking
    // down stairs or slopes instead of briefly falling.
    float step_height{0.4F};
    // A jump still works this long after walking off a ledge...
    float coyote_time{0.12F};
    // ...and a jump pressed this long before landing fires on landing.
    float jump_buffer{0.12F};
};

// One fixed tick of player intent. move_x is strafe (+ right), move_y is
// forward (+ forward), both -1..1. yaw (radians) is the facing the movement
// is relative to: 0 looks down -z, positive turns left (counter-clockwise
// seen from above), matching a three.js camera's rotation.y.
struct ControllerInput final {
    float move_x{};
    float move_y{};
    bool jump_pressed{};
    bool sprint{};
    bool crouch{};
    float yaw{};
};

// Per-character simulation state, owned by the caller between ticks.
struct ControllerState final {
    bool crouched{false};
    bool sprinting{false};
    bool grounded{false};
    // Seconds since last grounded (coyote time) and since jump was pressed
    // (jump buffering); large values mean "long ago".
    float since_grounded{1.0F};
    float since_jump_pressed{1.0F};
    // True from a jump until the next landing, so coyote time can't give a
    // second jump.
    bool jumping{false};
    // Downward speed at the moment of the most recent landing (0 if this
    // tick didn't land), for camera dip and landing sounds.
    float landing_speed{0.0F};
    // Horizontal ground speed after this tick.
    float speed{0.0F};
    // begin_step's bookkeeping for end_step.
    Vec3 position_before{};
    Vec3 velocity_before{};
};

// Sets the body's size from the settings, keeping its feet where they are.
// Call once when the character is created.
void configure_body(Box& box, const ControllerSettings& settings);

// Before physics::step: crouch/stand (standing only with headroom), horizontal
// acceleration toward the input direction, jumping (with coyote time and
// buffering). `gravity` is the physics gravity (negative) times the body's
// gravity scale.
void begin_step(World& world, Entity entity, ControllerState& state, const ControllerSettings& settings,
                const ControllerInput& input, float gravity, float dt);

// After physics::step: climbs steps the body was blocked by, snaps down onto
// ground just below when walking off a step or down a slope, and records
// landing speed and grounded state.
void end_step(World& world, Entity entity, ControllerState& state, const ControllerSettings& settings,
              const physics::Config& config, float dt);

// The eye height above the body's feet for its current (crouched or
// standing) height.
[[nodiscard]] float eye_offset(const Box& box);

} // namespace engine::gameplay
