#include "engine/runtime/application.hpp"

#include "engine/core/log.hpp"

#include <algorithm>
#include <exception>
#include <string>
#include <utility>

namespace engine {
namespace {

class PlatformShutdownGuard final {
public:
    explicit PlatformShutdownGuard(Platform& platform) noexcept : platform_(platform) {}
    ~PlatformShutdownGuard() { platform_.shutdown(); }

    PlatformShutdownGuard(const PlatformShutdownGuard&) = delete;
    PlatformShutdownGuard& operator=(const PlatformShutdownGuard&) = delete;

private:
    Platform& platform_;
};

class CallbackShutdownGuard final {
public:
    explicit CallbackShutdownGuard(ApplicationCallbacks& callbacks) noexcept : callbacks_(callbacks) {}
    ~CallbackShutdownGuard() { callbacks_.on_shutdown(); }

    CallbackShutdownGuard(const CallbackShutdownGuard&) = delete;
    CallbackShutdownGuard& operator=(const CallbackShutdownGuard&) = delete;

private:
    ApplicationCallbacks& callbacks_;
};

} // namespace

Application::Application(
    Platform& platform,
    ApplicationCallbacks& callbacks,
    ApplicationConfig config)
    : platform_(platform), callbacks_(callbacks), config_(std::move(config)) {}

RunResult Application::run() {
    RunResult result{};
    if (!platform_.initialize()) {
        result.reason = ExitReason::platform_initialization_failed;
        return result;
    }
    const PlatformShutdownGuard platform_guard{platform_};

    try {
        if (!callbacks_.on_startup()) {
            result.reason = ExitReason::application_startup_failed;
            return result;
        }
        const CallbackShutdownGuard callback_guard{callbacks_};
        FixedStepClock clock{
            config_.fixed_step,
            config_.maximum_frame_time,
            config_.maximum_steps_per_frame,
        };

        auto previous_time = platform_.now();
        bool running = true;
        while (running) {
            const auto frame_start = platform_.now();
            const auto elapsed = frame_start - previous_time;
            previous_time = frame_start;

            PlatformEvent event{};
            while (platform_.poll_event(event)) {
                callbacks_.on_event(event);
                if (event.type == PlatformEventType::quit_requested) {
                    result.reason = ExitReason::requested;
                    running = false;
                }
            }
            if (!running) {
                break;
            }

            const auto batch = clock.advance(
                std::chrono::duration_cast<FixedStepClock::Duration>(elapsed));
            result.dropped_time += batch.dropped_time;

            for (u32 step = 0; step < batch.step_count; ++step) {
                const FixedUpdateContext context{result.simulation_ticks, config_.fixed_step};
                const auto control = callbacks_.on_fixed_update(context);
                ++result.simulation_ticks;
                if (control == LoopControl::exit) {
                    result.reason = ExitReason::requested;
                    running = false;
                    break;
                }
            }
            if (!running) {
                break;
            }

            const RenderContext render_context{
                result.rendered_frames,
                batch.interpolation_alpha,
            };
            if (callbacks_.on_render(render_context) == LoopControl::exit) {
                result.reason = ExitReason::requested;
                running = false;
            }
            ++result.rendered_frames;

            if (running && config_.maximum_frame_count > 0 &&
                result.rendered_frames >= config_.maximum_frame_count) {
                result.reason = ExitReason::frame_limit_reached;
                running = false;
            }

            if (running && config_.target_frame_time > Platform::Duration::zero()) {
                const auto work_time = platform_.now() - frame_start;
                platform_.sleep_for(std::max(
                    config_.target_frame_time - work_time,
                    Platform::Duration::zero()));
            }
        }
    } catch (const std::exception& error) {
        Logger::instance().log(LogLevel::critical, "application", error.what());
        result.reason = ExitReason::unhandled_exception;
    } catch (...) {
        Logger::instance().log(LogLevel::critical, "application", "Unknown exception");
        result.reason = ExitReason::unhandled_exception;
    }

    return result;
}

std::string_view to_string(const ExitReason reason) noexcept {
    switch (reason) {
    case ExitReason::requested: return "requested";
    case ExitReason::platform_initialization_failed: return "platform initialization failed";
    case ExitReason::application_startup_failed: return "application startup failed";
    case ExitReason::frame_limit_reached: return "frame limit reached";
    case ExitReason::unhandled_exception: return "unhandled exception";
    }
    return "unknown";
}

} // namespace engine
