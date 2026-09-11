#include "engine/platform/headless_platform.hpp"
#include "scene.hpp"
#if ENGINE_HAS_SDL3
#include "engine/platform/sdl_platform.hpp"
#endif
#include <fstream>
#include <iostream>
#include <memory>
#include <string_view>

namespace {
class Demo final : public engine::ApplicationCallbacks {
public:
    playground::Scene scene;
    engine::BoxView view;
    std::vector<engine::InputEvent> pending;
    engine::InputState input;
    bool smoke{};
#if ENGINE_HAS_SDL3
    engine::SdlPlatform *desktop{};
#endif
    void on_event(const engine::PlatformEvent &event) override {
        if (event.input)
            pending.push_back(*event.input);
    }
    engine::LoopControl on_fixed_update(const engine::FixedUpdateContext &context) override {
        input.begin_frame();
        for (const auto &event : pending)
            input.apply(event);
        pending.clear();
        scene.step({context.tick, context.delta_time, input});
        return smoke && context.tick >= 3 ? engine::LoopControl::exit
                                          : engine::LoopControl::continue_running;
    }
    engine::LoopControl on_render(const engine::RenderContext &) override {
        const auto boxes = scene.boxes();
        view.draw(boxes, scene.camera);
#if ENGINE_HAS_SDL3
        if (desktop && !desktop->present_rgba(view.pixels(), view.width, view.height))
            throw std::runtime_error{"window presentation failed"};
#endif
        return engine::LoopControl::continue_running;
    }
};
} // namespace
int main(int argc, char **argv) {
    try {
        Demo demo;
        bool headless = false;
        std::string snapshot;
        for (int i = 1; i < argc; ++i) {
            const std::string_view arg{argv[i]};
            if (arg == "--smoke")
                demo.smoke = true;
            else if (arg == "--headless")
                headless = true;
            else if (arg == "--snapshot" && i + 1 < argc) {
                snapshot = argv[++i];
                headless = true;
            } else
                throw std::invalid_argument{
                    "Usage: engine_playground [--smoke] [--headless] [--snapshot file.ppm]"};
        }
        if (!snapshot.empty()) {
            const auto boxes = demo.scene.boxes();
            demo.view.draw(boxes, demo.scene.camera);
            std::ofstream file{snapshot, std::ios::binary};
            file << "P6\n800 500\n255\n";
            const auto pixels = demo.view.pixels();
            for (engine::usize i = 0; i < pixels.size(); i += 4)
                file.write(reinterpret_cast<const char *>(pixels.data() + i), 3);
            file.close();
            if (!file)
                throw std::runtime_error{"snapshot write failed"};
            std::cout << "Saved native CPU frame: " << snapshot << '\n';
            return 0;
        }
        std::unique_ptr<engine::Platform> platform;
#if ENGINE_HAS_SDL3
        if (!headless) {
            engine::SdlPlatformConfig config;
            config.application_name = "Game Engine | WASD move | Q/E orbit | Z/X zoom | Space add "
                                      "| Backspace remove | R reset";
            config.hidden = demo.smoke;
            auto sdl = std::make_unique<engine::SdlPlatform>(config);
            demo.desktop = sdl.get();
            platform = std::move(sdl);
        }
#else
        headless = true;
#endif
        if (headless) {
            platform = std::make_unique<engine::HeadlessPlatform>();
            demo.smoke = true;
        }
        engine::ApplicationConfig config;
        config.maximum_frame_count = demo.smoke ? 120 : 0;
        engine::Application app{*platform, demo, config};
        const auto result = app.run();
        std::cout << "Playground: " << engine::to_string(result.reason)
                  << ", ticks=" << result.simulation_ticks << ", frames=" << result.rendered_frames
                  << '\n';
        return result.reason == engine::ExitReason::requested ? 0 : 1;
    } catch (const std::exception &e) {
        std::cerr << e.what() << '\n';
        return 1;
    }
}
