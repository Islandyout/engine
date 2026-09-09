#include "engine/core/fixed_step_clock.hpp"

#include <algorithm>
#include <stdexcept>

namespace engine {

FixedStepClock::FixedStepClock(
    const Duration fixed_step,
    const Duration maximum_frame_time,
    const u32 maximum_steps_per_frame)
    : fixed_step_(fixed_step),
      maximum_frame_time_(maximum_frame_time),
      maximum_steps_per_frame_(maximum_steps_per_frame) {
    if (fixed_step_ <= Duration::zero()) {
        throw std::invalid_argument{"fixed step must be positive"};
    }
    if (maximum_frame_time_ < fixed_step_) {
        throw std::invalid_argument{"maximum frame time must be at least one fixed step"};
    }
    if (maximum_steps_per_frame_ == 0) {
        throw std::invalid_argument{"maximum steps per frame must be positive"};
    }
}

FixedStepClock::StepBatch FixedStepClock::advance(Duration frame_time) noexcept {
    frame_time = std::max(frame_time, Duration::zero());
    const Duration accepted = std::min(frame_time, maximum_frame_time_);
    Duration dropped = frame_time - accepted;
    accumulator_ += accepted;

    const auto available_steps = static_cast<u64>(accumulator_ / fixed_step_);
    const auto selected_steps = std::min<u64>(available_steps, maximum_steps_per_frame_);
    const auto skipped_steps = available_steps - selected_steps;

    if (skipped_steps > 0) {
        const Duration skipped_time = fixed_step_ * static_cast<Duration::rep>(skipped_steps);
        accumulator_ -= skipped_time;
        dropped += skipped_time;
    }

    accumulator_ -= fixed_step_ * static_cast<Duration::rep>(selected_steps);
    tick_ += selected_steps;

    const f64 alpha = static_cast<f64>(accumulator_.count()) /
                      static_cast<f64>(fixed_step_.count());

    return StepBatch{
        static_cast<u32>(selected_steps),
        alpha,
        accepted,
        dropped,
    };
}

void FixedStepClock::reset() noexcept {
    accumulator_ = Duration::zero();
    tick_ = 0;
}

} // namespace engine

