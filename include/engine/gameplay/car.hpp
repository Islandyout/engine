#pragma once

#include "engine/graphics/box_view.hpp"

namespace engine::gameplay {

// Arcade car dynamics (0.70.0): a single rigid body moving in the ground
// plane with grip-limited lateral slip, so cars hold a line at speed, slide
// when the rear lets go (handbrake, or too much steering for the speed) and
// can be held in a drift with throttle and counter-steer. Not a tire
// simulation: the goal is predictable, fast, readable handling. Speeds are
// m/s, accelerations m/s^2, angles radians, times seconds.
struct CarSpec final {
    float top_speed{60.0F};      // without nitro
    float acceleration{11.0F};   // from rest; falls off toward top speed
    float braking{26.0F};
    float reverse_speed{12.0F};
    float drag{1.0F};            // coasting deceleration scale: about 2.8 m/s^2 at top speed, 0.8 near rest
    float grip{1.25F};           // lateral acceleration limit in g before sliding
    float drift_grip{0.45F};     // fraction of grip while drifting or on the handbrake
    float steering{0.55F};       // full-lock front wheel angle at low speed
    float wheelbase{2.6F};
    float nitro_boost{9.0F};     // extra acceleration with nitro, which also lifts top speed by 20%
    float nitro_seconds{4.0F};   // a full tank
    int gears{6};
};

// One tick of driver input.
struct CarInput final {
    float throttle{};  // 0..1
    float brake{};     // 0..1; brakes, then reverses once stopped
    float steer{};     // -1 (left) .. 1 (right)
    bool handbrake{};
    bool nitro{};
};

// Per-car state owned by the caller. yaw 0 faces +z and the car faces
// (sin yaw, cos yaw), matching a three.js rotation.y and the editor's
// heading: positive yaw turns left, so steering right lowers it.
struct CarState final {
    float yaw{};
    float yaw_rate{};
    Vec3 velocity{};   // world x/z (y ignored)
    float steer{};     // current front wheel angle (smoothed toward input)
    float nitro{1.0F}; // tank, 0..1
    bool boosting{};
    bool drifting{};
    float slip{};      // angle between heading and travel, radians (+ = sliding right)
    int gear{1};       // 1..gears, or -1 reversing
    float rpm{};       // 0..1 within the current gear
    float forward_speed{};
};

// Advances the car by dt from its input. Collisions are the caller's: write
// the resolved body velocity back into state.velocity before the next step.
void step_car(CarState& state, const CarSpec& spec, const CarInput& input, float dt);

// Driving a car toward a point: steering (pure pursuit on the car's own
// geometry) and throttle/brake to arrive at `target_speed`. Shared by AI
// racers, police and traffic.
CarInput steer_toward(const CarState& state, const CarSpec& spec, const Vec3& position, const Vec3& target,
                      float target_speed);

// The highest speed the car can carry through a turn of `radius` metres on
// its grip, for AI corner braking.
float corner_speed(const CarSpec& spec, float radius);

} // namespace engine::gameplay
