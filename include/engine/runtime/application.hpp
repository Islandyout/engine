#pragma once

#include "engine/core/fixed_step_clock.hpp"
#include "engine/platform/platform.hpp"

#include <chrono>
#include <string>
#include <string_view>

namespace engine {

enum class LoopControl : u8 {
    continue_running,
    exit,
};

enum class ExitReason : u8 {
    requested,
    platform_initialization_failed,
    application_startup_failed,
    frame_limit_reached,
    unhandled_exception,
};

struct FixedUpdateContext final {
    u64 tick{};
    FixedStepClock::Duration delta_time{};
    const InputState& input;
};

struct RenderContext final {
    u64 frame{};
    f64 interpolation_alpha{};
    const InputState& input;
};

class ApplicationCallbacks {
public:
    virtual ~ApplicationCallbacks() = default;

    [[nodiscard]] virtual bool on_startup() { return true; }
    virtual void on_event(const PlatformEvent&) {}
    [[nodiscard]] virtual LoopControl on_fixed_update(const FixedUpdateContext&) {
        return LoopControl::continue_running;
    }
    [[nodiscard]] virtual LoopControl on_render(const RenderContext&) {
        return LoopControl::continue_running;
    }
    virtual void on_shutdown() noexcept {}
};

struct ApplicationConfig final {
    std::string name{"Game Engine"};
    FixedStepClock::Duration fixed_step{std::chrono::nanoseconds{16'666'667}};
    FixedStepClock::Duration maximum_frame_time{std::chrono::milliseconds{250}};
    u32 maximum_steps_per_frame{8};
    Platform::Duration target_frame_time{std::chrono::nanoseconds{16'666'667}};
    u64 maximum_frame_count{};
};

struct RunResult final {
    ExitReason reason{ExitReason::requested};
    u64 rendered_frames{};
    u64 simulation_ticks{};
    FixedStepClock::Duration dropped_time{};
};

class Application final {
public:
    Application(Platform& platform, ApplicationCallbacks& callbacks, ApplicationConfig config = {});

    [[nodiscard]] RunResult run();

private:
    Platform& platform_;
    ApplicationCallbacks& callbacks_;
    ApplicationConfig config_;
};

[[nodiscard]] std::string_view to_string(ExitReason reason) noexcept;

} // namespace engine
