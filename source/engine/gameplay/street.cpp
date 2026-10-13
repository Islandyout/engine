#include "engine/gameplay/street.hpp"

#include <algorithm>
#include <cmath>

namespace engine::gameplay {

namespace {
constexpr float unlimited = 1.0e6F;

// Where `time` falls in the cycle, in [0, period).
float phase(const SignalTiming &timing, float time) {
    const float period = signal_period(timing);
    const float t = std::fmod(time + timing.offset, period);
    return t < 0 ? t + period : t;
}
} // namespace

float signal_period(const SignalTiming &timing) {
    return std::max(0.1F, 2.0F * (timing.green + timing.yellow + timing.clearance));
}

Light signal_light(const SignalTiming &timing, float time, int axis) {
    const float half = timing.green + timing.yellow + timing.clearance;
    const float t = phase(timing, time) - (axis == 0 ? 0.0F : half);
    if (t < 0 || t >= half)
        return Light::red;
    if (t < timing.green)
        return Light::green;
    if (t < timing.green + timing.yellow)
        return Light::yellow;
    return Light::red;
}

float green_left(const SignalTiming &timing, float time, int axis) {
    if (signal_light(timing, time, axis) != Light::green)
        return 0;
    const float half = timing.green + timing.yellow + timing.clearance;
    const float t = phase(timing, time) - (axis == 0 ? 0.0F : half);
    return timing.green - t;
}

bool may_cross(const SignalTiming &timing, float time, int axis, float crossing_seconds) {
    if (signal_light(timing, time, axis) != Light::green)
        return false;
    return green_left(timing, time, axis) + timing.yellow + timing.clearance >= crossing_seconds;
}

float stop_line_speed(Light light, float distance, float speed, float decel) {
    if (light == Light::green || distance < 0)
        return unlimited;
    const float a = std::max(0.5F, decel);
    // Yellow: stop only if it can be done comfortably; otherwise carry on.
    if (light == Light::yellow && speed * speed / (2.0F * a) > distance)
        return unlimited;
    return std::sqrt(2.0F * a * std::max(0.0F, distance));
}

} // namespace engine::gameplay
