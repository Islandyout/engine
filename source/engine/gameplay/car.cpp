#include "engine/gameplay/car.hpp"

#include <algorithm>
#include <cmath>

namespace engine::gameplay {
namespace {
constexpr float gravity = 9.81F;

float sign(float v) { return v > 0 ? 1.0F : (v < 0 ? -1.0F : 0.0F); }

// Full-lock front wheel angle at a forward speed: less lock the faster the
// car goes, never more than the tyres can hold (a little past it, so full
// lock at speed edges into oversteer), so steering alone corners on the
// limit and only the handbrake throws the car into a slide.
// On the handbrake or in a drift the grip cap is off: that is how the car
// swings into and holds a slide.
float lock_at(const CarSpec &spec, float forward_speed, bool loose = false) {
    const float v = std::max(0.0F, forward_speed);
    const float by_speed = spec.steering / (1.0F + v / 18.0F);
    if (loose)
        return by_speed;
    const float by_grip = std::atan(spec.grip * gravity * 1.05F * spec.wheelbase / std::max(v * v, 1.0F));
    return std::min(by_speed, by_grip);
}
} // namespace

void step_car(CarState &state, const CarSpec &spec, const CarInput &input, float dt) {
    if (!(dt > 0))
        return;
    const float throttle = std::clamp(input.throttle, 0.0F, 1.0F);
    const float brake = std::clamp(input.brake, 0.0F, 1.0F);
    const float steer_input = std::clamp(input.steer, -1.0F, 1.0F);
    float fx = std::sin(state.yaw), fz = std::cos(state.yaw);
    float forward = state.velocity.x * fx + state.velocity.z * fz;

    // Steering eases toward the input's angle.
    const float target_steer = steer_input * lock_at(spec, forward, input.handbrake || state.drifting);
    state.steer += (target_steer - state.steer) * (1.0F - std::exp(-12.0F * dt));

    // Longitudinal: throttle (power fades toward top speed), brakes, then
    // reverse once stopped; coasting slows the car; nitro adds a push.
    state.boosting = input.nitro && state.nitro > 0 && throttle > 0 && forward > -0.5F;
    const float top = spec.top_speed * (state.boosting ? 1.2F : 1.0F);
    float accel = 0;
    if (throttle > 0) {
        if (forward < -0.5F)
            accel += throttle * spec.braking;
        else
            accel += throttle * spec.acceleration * std::max(0.0F, 1.0F - (forward / top) * (forward / top));
    }
    if (brake > 0) {
        if (forward > 0.5F)
            accel -= brake * spec.braking;
        else if (forward > -spec.reverse_speed)
            accel -= brake * spec.acceleration * 0.6F;
    }
    if (throttle == 0 && brake == 0)
        accel -= sign(forward) * spec.drag * (0.4F + std::abs(forward) / spec.top_speed) * 2.0F;
    if (input.handbrake)
        accel -= sign(forward) * 4.0F;
    if (state.boosting) {
        accel += spec.nitro_boost;
        state.nitro = std::max(0.0F, state.nitro - dt / std::max(spec.nitro_seconds, 0.1F));
    }
    const float before = forward;
    forward += accel * dt;
    // Braking or coasting stops at zero rather than flipping direction.
    if (throttle == 0 && before > 0 && forward < 0 && brake > 0)
        forward = 0;
    if ((throttle == 0 && brake == 0) || input.handbrake)
        if (sign(before) != sign(forward))
            forward = 0;
    forward = std::min(forward, top * 1.02F);
    state.velocity.x += (forward - before) * fx;
    state.velocity.z += (forward - before) * fz;

    // Yaw: the bicycle-model turn rate for the wheel angle, which the rear
    // overshoots on the handbrake or in a drift.
    const bool loose = input.handbrake || state.drifting;
    float target_rate = -forward * std::tan(state.steer) / spec.wheelbase;
    if (input.handbrake && std::abs(forward) > 6.0F)
        target_rate *= 1.3F;
    else if (state.drifting)
        target_rate *= 1.15F;
    state.yaw_rate += (target_rate - state.yaw_rate) * (1.0F - std::exp(-(loose ? 5.0F : 9.0F) * dt));
    state.yaw += state.yaw_rate * dt;

    // Lateral: tyres pull the sideways part of the velocity back toward the
    // heading, up to the grip limit; past it the car slides. Some of the
    // scrubbed speed carries forward, so a drift exits with pace.
    fx = std::sin(state.yaw);
    fz = std::cos(state.yaw);
    const float rx = -fz, rz = fx; // right of forward
    forward = state.velocity.x * fx + state.velocity.z * fz;
    float lateral = state.velocity.x * rx + state.velocity.z * rz;
    // Released from the handbrake, a drift holds partial grip, so the car
    // can be steered out of it.
    const float held = input.handbrake ? spec.drift_grip : (state.drifting ? 0.5F + spec.drift_grip * 0.5F : 1.0F);
    const float grip = spec.grip * held * gravity;
    const float scrub = std::clamp(lateral, -grip * dt, grip * dt);
    lateral -= scrub;
    if (state.drifting && forward > 0)
        forward += std::abs(scrub) * 0.35F;
    state.velocity.x = fx * forward + rx * lateral;
    state.velocity.z = fz * forward + rz * lateral;

    const float speed = std::hypot(forward, lateral);
    state.slip = speed > 1.0F ? std::atan2(lateral, std::abs(forward)) : 0.0F;
    if (!state.drifting && std::abs(state.slip) > 0.22F && speed > 9.0F)
        state.drifting = true;
    else if (state.drifting && (std::abs(state.slip) < 0.08F || speed < 6.0F))
        state.drifting = false;
    if (state.drifting)
        state.nitro = std::min(1.0F, state.nitro + dt * 0.12F);
    state.forward_speed = forward;

    // Gears and revs, for the HUD and engine sound.
    if (forward < -0.5F) {
        state.gear = -1;
        state.rpm = std::min(1.0F, -forward / std::max(spec.reverse_speed, 1.0F)) * 0.7F + 0.25F;
    } else {
        const int gears = std::max(spec.gears, 1);
        const float band = spec.top_speed / static_cast<float>(gears);
        state.gear = std::clamp(1 + static_cast<int>(std::max(0.0F, forward) / band), 1, gears);
        const float within = (std::max(0.0F, forward) - static_cast<float>(state.gear - 1) * band) / band;
        state.rpm = std::clamp(0.25F + within * 0.75F, 0.0F, 1.0F);
    }
}

CarInput steer_toward(const CarState &state, const CarSpec &spec, const Vec3 &position, const Vec3 &target,
                      float target_speed) {
    CarInput input;
    const float fx = std::sin(state.yaw), fz = std::cos(state.yaw);
    const float rx = -fz, rz = fx;
    const float dx = target.x - position.x, dz = target.z - position.z;
    const float ahead = dx * fx + dz * fz;
    const float side = dx * rx + dz * rz;
    const float distance_sq = std::max(dx * dx + dz * dz, 1.0F);
    // Pure pursuit: the arc through the target point sets the wheel angle.
    const float angle = std::atan(2.0F * side * spec.wheelbase / distance_sq);
    const float lock = lock_at(spec, state.forward_speed);
    input.steer = ahead < 0 ? sign(side) : std::clamp(angle / std::max(lock, 0.05F), -1.0F, 1.0F);
    // No faster than the arc to the target can be driven on grip.
    const float sine = std::abs(side) / std::sqrt(distance_sq);
    if (sine > 0.05F)
        target_speed = std::min(target_speed, corner_speed(spec, std::sqrt(distance_sq) / (2.0F * sine)));
    if (ahead < 0)
        target_speed = std::min(target_speed, 8.0F);
    const float error = target_speed - state.forward_speed;
    if (error > 0)
        input.throttle = std::clamp(error / 6.0F, 0.25F, 1.0F);
    else if (error < -1.5F)
        input.brake = std::clamp(-error / 10.0F, 0.0F, 1.0F);
    return input;
}

float corner_speed(const CarSpec &spec, float radius) {
    return 0.92F * std::sqrt(std::max(spec.grip, 0.05F) * gravity * std::max(radius, 1.0F));
}

} // namespace engine::gameplay
