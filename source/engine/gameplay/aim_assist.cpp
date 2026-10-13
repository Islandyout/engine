#include "engine/gameplay/aim_assist.hpp"

#include <algorithm>
#include <cmath>
#include <cstddef>

namespace engine::gameplay {

namespace {
constexpr float pi = 3.14159265358979F;
constexpr float degrees = pi / 180.0F;

float dot(Vec3 a, Vec3 b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
} // namespace

float look_yaw_of(Vec3 direction) { return std::atan2(-direction.x, -direction.z); }
float look_pitch_of(Vec3 direction) { return std::asin(std::clamp(direction.y, -1.0F, 1.0F)); }

AimAssist aim_assist(const AimAssistSettings &settings, std::span<const AimTarget> targets, const AimInput &input) {
    AimAssist out;
    const float strength = std::clamp(settings.strength, 0.0F, 1.0F);
    const bool mouse = input.device == AimDevice::mouse;
    // Pressing aim looks for a target in a wider cone than the slowdown and
    // pull do: the snap is for bringing a target in, not holding it.
    const float widen = input.aim_pressed && !mouse ? 2.0F : 1.0F;
    float best_ratio = 1.0F, over_distance = settings.range + 1;
    Vec3 best_direction{};
    for (std::size_t i = 0; i < targets.size(); ++i) {
        const auto &target = targets[i];
        if (!target.hostile || !target.visible)
            continue;
        Vec3 to{target.center.x - input.origin.x, target.center.y - input.origin.y, target.center.z - input.origin.z};
        const float distance = std::sqrt(dot(to, to));
        if (distance < 0.3F || distance > settings.range)
            continue;
        to = {to.x / distance, to.y / distance, to.z / distance};
        const float angle = std::acos(std::clamp(dot(to, input.direction), -1.0F, 1.0F));
        const float body = std::atan(target.radius / distance);
        if (angle <= body && distance < over_distance) {
            out.over = static_cast<int>(i);
            over_distance = distance;
        }
        if (strength <= 0)
            continue;
        // The help reaches a few degrees past the body's edge, whatever the
        // distance (a far target is small on screen, so it needs the most).
        const float cone = (body + settings.cone * degrees * strength) * widen;
        const float ratio = angle / cone;
        if (ratio < best_ratio) {
            best_ratio = ratio;
            out.target = static_cast<int>(i);
            best_direction = to;
        }
    }
    if (out.target < 0)
        return out;
    // 1 with the crosshair on the target's centre line, 0 at the cone's edge.
    const float closeness = 1.0F - best_ratio;
    out.slowdown = 1.0F - (mouse ? 0.3F : 0.5F) * strength * std::min(1.0F, closeness * 1.5F);
    if (mouse)
        return out;
    const float yaw = std::remainder(look_yaw_of(best_direction) - look_yaw_of(input.direction), 2 * pi);
    const float pitch = look_pitch_of(best_direction) - look_pitch_of(input.direction);
    if (input.aim_pressed) {
        const float snap = std::min(1.0F, 0.5F + strength * 0.5F);
        out.yaw = yaw * snap;
        out.pitch = pitch * snap;
    } else if (input.look_speed > 0.05F || input.moving) {
        // The pull eases the view toward the target, only while the player
        // is turning or moving, so a still stick never drags the view.
        const float pull = 1.0F - std::exp(-6.0F * strength * closeness * input.dt);
        out.yaw = yaw * pull;
        out.pitch = pitch * pull;
    }
    return out;
}

} // namespace engine::gameplay
