#include "engine/core/log.hpp"
#include "engine/core/uuid.hpp"
#include "engine/core/version.hpp"
#include "engine/platform/headless_platform.hpp"
#include "engine/runtime/application.hpp"
#if ENGINE_HAS_SDL3
#include "engine/platform/sdl_platform.hpp"
#endif

#include <memory>
#include <string>
#include <string_view>

namespace {

class FoundationDemo final : public engine::ApplicationCallbacks {
public:
    explicit FoundationDemo(const engine::u64 tick_limit) : tick_limit_(tick_limit) {}

    bool on_startup() override {
        engine::Logger::instance().log(
            engine::LogLevel::info,
            "host",
            "Session " + engine::Uuid::random_v4().to_string());
        return true;
    }

    engine::LoopControl on_fixed_update(const engine::FixedUpdateContext& context) override {
        return tick_limit_ > 0 && context.tick + 1 >= tick_limit_
                   ? engine::LoopControl::exit
                   : engine::LoopControl::continue_running;
    }

    void on_shutdown() noexcept override {
        engine::Logger::instance().log(
            engine::LogLevel::info, "host", "Foundation shutdown completed cleanly");
    }

private:
    engine::u64 tick_limit_{};
};

} // namespace

int main(const int argument_count, char** arguments) {
    auto& logger = engine::Logger::instance();
    logger.log(
        engine::LogLevel::info,
        "host",
        std::string{"Game Engine foundation v"} + std::string{engine::version_string});

    bool use_headless = false;
    bool smoke_test = false;
    for (int index = 1; index < argument_count; ++index) {
        const std::string_view argument{arguments[index]};
        use_headless = use_headless || argument == "--headless";
        smoke_test = smoke_test || argument == "--smoke";
    }

    std::unique_ptr<engine::Platform> platform;
#if ENGINE_HAS_SDL3
    if (!use_headless) {
        engine::SdlPlatformConfig platform_config{};
        platform_config.application_version = std::string{engine::version_string};
        platform_config.hidden = smoke_test;
        platform = std::make_unique<engine::SdlPlatform>(std::move(platform_config));
    } else {
        platform = std::make_unique<engine::HeadlessPlatform>();
    }
#else
    use_headless = true;
    platform = std::make_unique<engine::HeadlessPlatform>();
#endif

    const engine::u64 tick_limit = use_headless || smoke_test ? 4 : 0;
    FoundationDemo demo{tick_limit};
    engine::ApplicationConfig config{};
    config.name = "Foundation Demo";
    config.maximum_frame_count = tick_limit > 0 ? 120 : 0;

    engine::Application application{*platform, demo, config};
    const auto result = application.run();
    logger.log(
        engine::LogLevel::info,
        "host",
        "Exited: " + std::string{engine::to_string(result.reason)} +
            ", ticks=" + std::to_string(result.simulation_ticks) +
            ", frames=" + std::to_string(result.rendered_frames));

    return result.reason == engine::ExitReason::unhandled_exception ? 1 : 0;
}
