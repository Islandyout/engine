#include "engine/runtime/application.hpp"

#include <chrono>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

namespace {

using namespace std::chrono_literals;

void require(const bool condition, const std::string& message) {
    if (!condition) {
        throw std::runtime_error{message};
    }
}

class ManualPlatform final : public engine::Platform {
public:
    bool initialize() override {
        ++initialize_count;
        return initialize_result;
    }

    void shutdown() noexcept override { ++shutdown_count; }

    bool poll_event(engine::PlatformEvent& event) override {
        if (events.empty()) {
            return false;
        }
        event = events.front();
        events.erase(events.begin());
        return true;
    }

    TimePoint now() const noexcept override { return current_time; }

    void sleep_for(const Duration duration) override {
        if (duration > Duration::zero()) {
            current_time += duration;
        }
    }

    bool initialize_result{true};
    int initialize_count{};
    int shutdown_count{};
    TimePoint current_time{};
    std::vector<engine::PlatformEvent> events;
};

class RecordingCallbacks : public engine::ApplicationCallbacks {
public:
    bool on_startup() override {
        ++startup_count;
        return startup_result;
    }

    void on_event(const engine::PlatformEvent&) override { ++event_count; }

    engine::LoopControl on_fixed_update(const engine::FixedUpdateContext& context) override {
        ticks.push_back(context.tick);
        return tick_exit_after > 0 && ticks.size() >= tick_exit_after
                   ? engine::LoopControl::exit
                   : engine::LoopControl::continue_running;
    }

    engine::LoopControl on_render(const engine::RenderContext& context) override {
        frames.push_back(context.frame);
        return render_exit_after > 0 && frames.size() >= render_exit_after
                   ? engine::LoopControl::exit
                   : engine::LoopControl::continue_running;
    }

    void on_shutdown() noexcept override { ++shutdown_count; }

    bool startup_result{true};
    std::size_t tick_exit_after{};
    std::size_t render_exit_after{};
    int startup_count{};
    int shutdown_count{};
    int event_count{};
    std::vector<engine::u64> ticks;
    std::vector<engine::u64> frames;
};

engine::ApplicationConfig test_config() {
    engine::ApplicationConfig config{};
    config.fixed_step = 10ms;
    config.maximum_frame_time = 100ms;
    config.maximum_steps_per_frame = 4;
    config.target_frame_time = 10ms;
    return config;
}

void lifecycle_reaches_frame_limit() {
    ManualPlatform platform;
    RecordingCallbacks callbacks;
    auto config = test_config();
    config.maximum_frame_count = 4;

    const auto result = engine::Application{platform, callbacks, config}.run();

    require(result.reason == engine::ExitReason::frame_limit_reached,
            "configured frame limit must stop the run loop");
    require(result.rendered_frames == 4, "run loop must render the configured frame count");
    require(result.simulation_ticks == 3, "fixed updates must follow elapsed platform time");
    require(platform.initialize_count == 1 && platform.shutdown_count == 1,
            "platform lifecycle must be balanced");
    require(callbacks.startup_count == 1 && callbacks.shutdown_count == 1,
            "callback lifecycle must be balanced");
}

void callback_can_request_exit() {
    ManualPlatform platform;
    RecordingCallbacks callbacks;
    callbacks.render_exit_after = 2;
    auto config = test_config();
    config.maximum_frame_count = 20;

    const auto result = engine::Application{platform, callbacks, config}.run();
    require(result.reason == engine::ExitReason::requested,
            "callback exit must be reported as requested");
    require(result.rendered_frames == 2, "render callback must stop on its requested frame");
    require(callbacks.shutdown_count == 1, "requested exit must run callback shutdown");
}

void fixed_update_exit_counts_executed_tick() {
    ManualPlatform platform;
    RecordingCallbacks callbacks;
    callbacks.tick_exit_after = 2;
    auto config = test_config();
    config.maximum_frame_count = 20;

    const auto result = engine::Application{platform, callbacks, config}.run();
    require(result.reason == engine::ExitReason::requested,
            "fixed-update exit must be reported as requested");
    require(callbacks.ticks.size() == 2, "callback must execute exactly two updates");
    require(result.simulation_ticks == 2,
            "run result must count the update that requested exit");
}

void platform_event_requests_exit() {
    ManualPlatform platform;
    platform.events.push_back(engine::PlatformEvent{engine::PlatformEventType::quit_requested, 0, 0, 0, std::nullopt});
    RecordingCallbacks callbacks;

    const auto result = engine::Application{platform, callbacks, test_config()}.run();
    require(result.reason == engine::ExitReason::requested, "quit event must stop the loop");
    require(result.rendered_frames == 0, "quit event must stop before rendering");
    require(callbacks.event_count == 1, "platform event must reach application callbacks");
    require(callbacks.shutdown_count == 1, "quit event must still trigger shutdown");
}

void startup_failures_are_balanced() {
    ManualPlatform failed_platform;
    failed_platform.initialize_result = false;
    RecordingCallbacks unused_callbacks;
    auto result = engine::Application{failed_platform, unused_callbacks, test_config()}.run();
    require(result.reason == engine::ExitReason::platform_initialization_failed,
            "platform initialization failure must be reported");
    require(failed_platform.shutdown_count == 0,
            "failed platform initialization must not call platform shutdown");
    require(unused_callbacks.startup_count == 0, "callbacks must not start without a platform");

    ManualPlatform platform;
    RecordingCallbacks failed_callbacks;
    failed_callbacks.startup_result = false;
    result = engine::Application{platform, failed_callbacks, test_config()}.run();
    require(result.reason == engine::ExitReason::application_startup_failed,
            "application startup failure must be reported");
    require(platform.shutdown_count == 1, "platform must shut down after callback failure");
    require(failed_callbacks.shutdown_count == 0,
            "callbacks that did not start must not receive shutdown");
}

class ThrowingCallbacks final : public RecordingCallbacks {
public:
    engine::LoopControl on_render(const engine::RenderContext&) override {
        throw std::runtime_error{"intentional test exception"};
    }
};

void exceptions_still_shutdown() {
    ManualPlatform platform;
    ThrowingCallbacks callbacks;
    const auto result = engine::Application{platform, callbacks, test_config()}.run();
    require(result.reason == engine::ExitReason::unhandled_exception,
            "callback exception must produce a controlled exit");
    require(platform.shutdown_count == 1, "exception must shut down the platform");
    require(callbacks.shutdown_count == 1, "exception must shut down callbacks");
}

} // namespace

int main() {
    try {
        lifecycle_reaches_frame_limit();
        callback_can_request_exit();
        fixed_update_exit_counts_executed_tick();
        platform_event_requests_exit();
        startup_failures_are_balanced();
        exceptions_still_shutdown();
    } catch (const std::exception& error) {
        std::cerr << "FAILED: " << error.what() << '\n';
        return 1;
    }

    std::cout << "All engine runtime tests passed.\n";
    return 0;
}
