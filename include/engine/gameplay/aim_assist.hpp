#pragma once

#include "engine/graphics/box_view.hpp"

#include <span>

namespace engine::gameplay {

// Aim assist for a shooter's view, the way console shooters do it:
//   - slowdown (friction): looking turns slower while the crosshair is near a
//     hostile, so it is easier to stay on target;
//   - pull (magnetism): while the player turns or moves, the view drifts
//     toward the nearest hostile near the crosshair;
//   - snap: pressing aim brings the view onto a hostile near the crosshair.
// A gamepad or touch screen gets all three; a mouse gets a lighter slowdown
// only. Only hostile targets the camera can see count (the caller decides
// both). Angles follow the engine's look convention: yaw 0 looks along -z
// and grows turning left (toward -x); pitch grows looking up.
enum class AimDevice { mouse, gamepad, touch };

struct AimAssistSettings final {
    float strength{0.6F}; // 0 = off, 1 = full (Weapons.aimAssist)
    float range{60.0F};   // metres; nothing farther is assisted
    float cone{5.0F};     // degrees of help around a target at full strength
};

struct AimTarget final {
    Vec3 center{};       // where to aim (the chest)
    float radius{0.35F}; // the body's half-width, for "on target"
    bool hostile{true};
    bool visible{true}; // line of sight from the camera
};

struct AimInput final {
    Vec3 origin{};              // the camera
    Vec3 direction{0, 0, -1};   // through the crosshair (unit)
    AimDevice device{AimDevice::mouse};
    float look_speed{0};        // how fast the player turns the view, rad/s
    bool moving{false};         // the player is walking or running
    bool aim_pressed{false};    // aim went down this frame
    float dt{1.0F / 60.0F};
};

struct AimAssist final {
    float slowdown{1.0F}; // multiplies look sensitivity (1 = none)
    float yaw{0};         // radians to add to the view's yaw this frame
    float pitch{0};       // and to its pitch
    int target{-1};       // index of the assisted target, -1 for none
    int over{-1};         // the hostile under the crosshair, -1 for none (whatever the strength)
};

// The look angles of a unit direction.
[[nodiscard]] float look_yaw_of(Vec3 direction);
[[nodiscard]] float look_pitch_of(Vec3 direction);

[[nodiscard]] AimAssist aim_assist(const AimAssistSettings &settings, std::span<const AimTarget> targets,
                                   const AimInput &input);

} // namespace engine::gameplay
