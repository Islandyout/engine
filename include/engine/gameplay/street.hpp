#pragma once

// Street rules shared by AI drivers and pedestrians: a signalised junction's
// light cycle, when a car must stop for it, and when someone on foot may
// cross. Axis 0 is traffic moving along z, axis 1 along x.

namespace engine::gameplay {

// One junction's cycle: axis 0 green, yellow, all red (clearance), then
// axis 1 the same; `offset` shifts it so neighbouring junctions don't all
// change at once (a "green wave" when it follows the travel time).
struct SignalTiming {
    float green{14.0F};
    float yellow{3.0F};
    float clearance{2.0F};
    float offset{0.0F};
};

enum class Light : int { green, yellow, red };

float signal_period(const SignalTiming &timing);

// The light facing traffic moving along `axis` at `time` seconds.
Light signal_light(const SignalTiming &timing, float time, int axis);

// Seconds left in the current green for `axis` (0 when not green).
float green_left(const SignalTiming &timing, float time, int axis);

// Whether someone on foot walking along `axis` (beside that traffic, so
// across the other road) may step off the kerb: during that axis's green,
// if the green left plus the yellow and all-red after it (the pedestrian
// clearance, before the crossing traffic gets its green) covers
// `crossing_seconds`.
bool may_cross(const SignalTiming &timing, float time, int axis, float crossing_seconds);

// The fastest a car may go `distance` metres before its stop line so it
// can still stop there at `decel` m/s^2: unlimited (a large number) on
// green, or on yellow when it is too close to stop comfortably (the
// "dilemma zone" rule: it goes on through).
float stop_line_speed(Light light, float distance, float speed, float decel);

} // namespace engine::gameplay
