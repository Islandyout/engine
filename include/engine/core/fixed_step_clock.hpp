#pragma once

#include "engine/core/types.hpp"

#include <chrono>

namespace engine {

class FixedStepClock final {
public:
    using Duration = std::chrono::nanoseconds;

    struct StepBatch final {
        u32 step_count{};
        f64 interpolation_alpha{};
        Duration accepted_frame_time{};
        Duration dropped_time{};
    };

    explicit FixedStepClock(
        Duration fixed_step = std::chrono::nanoseconds{16'666'667},
        Duration maximum_frame_time = std::chrono::milliseconds{250},
        u32 maximum_steps_per_frame = 8);

    [[nodiscard]] StepBatch advance(Duration frame_time) noexcept;
    void reset() noexcept;

    [[nodiscard]] Duration fixed_step() const noexcept { return fixed_step_; }
    [[nodiscard]] Duration accumulator() const noexcept { return accumulator_; }
    [[nodiscard]] u64 tick() const noexcept { return tick_; }

private:
    Duration fixed_step_;
    Duration maximum_frame_time_;
    Duration accumulator_{};
    u32 maximum_steps_per_frame_;
    u64 tick_{};
};

} // namespace engine

