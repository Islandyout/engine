#include "engine/core/log.hpp"
#include "engine/core/uuid.hpp"
#include "engine/core/version.hpp"
#include "engine/platform/headless_platform.hpp"
#include "engine/runtime/application.hpp"

#include <string>

namespace {

class FoundationDemo final : public engine::ApplicationCallbacks {
public:
    bool on_startup() override {
        engine::Logger::instance().log(
            engine::LogLevel::info,
            "host",
            "Session " + engine::Uuid::random_v4().to_string());
        return true;
    }

    engine::LoopControl on_fixed_update(const engine::FixedUpdateContext& context) override {
        constexpr engine::u64 demo_tick_count = 4;
        return context.tick + 1 >= demo_tick_count
                   ? engine::LoopControl::exit
                   : engine::LoopControl::continue_running;
    }

    void on_shutdown() noexcept override {
        engine::Logger::instance().log(
            engine::LogLevel::info, "host", "Foundation shutdown completed cleanly");
    }
};

} // namespace

int main() {
    auto& logger = engine::Logger::instance();
    logger.log(
        engine::LogLevel::info,
        "host",
        std::string{"Game Engine foundation v"} + std::string{engine::version_string});

    engine::HeadlessPlatform platform;
    FoundationDemo demo;
    engine::ApplicationConfig config{};
    config.name = "Foundation Demo";
    config.maximum_frame_count = 120;

    engine::Application application{platform, demo, config};
    const auto result = application.run();
    logger.log(
        engine::LogLevel::info,
        "host",
        "Exited: " + std::string{engine::to_string(result.reason)} +
            ", ticks=" + std::to_string(result.simulation_ticks) +
            ", frames=" + std::to_string(result.rendered_frames));

    return result.reason == engine::ExitReason::unhandled_exception ? 1 : 0;
}
