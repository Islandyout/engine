#include "engine/platform/headless_platform.hpp"
#include "scene.hpp"
#if ENGINE_HAS_SDL3
#include "engine/platform/sdl_platform.hpp"
#endif
#include <filesystem>
#include <fstream>
#include <iostream>
#include <memory>
#include <optional>
#include <string_view>

namespace {
class Demo final : public engine::ApplicationCallbacks {
public:
    // Deferred: constructed once command-line arguments (including an
    // optional --scene document) are known, before the run loop starts.
    std::optional<playground::Scene> scene;
    engine::BoxView view;
    engine::MeshAsset model;
    std::vector<engine::InputEvent> pending;
    engine::InputState input;
    bool smoke{};
    bool announced_win{};
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
        scene->step({context.tick, context.delta_time, input});
        if (scene->won() && !announced_win) {
            announced_win = true;
            std::cout << "You reached the goal! Press R to play again.\n";
        } else if (!scene->won() && announced_win) {
            announced_win = false; // R was pressed; reset() clears won()
        }
        return smoke && context.tick >= 3 ? engine::LoopControl::exit
                                          : engine::LoopControl::continue_running;
    }
    engine::LoopControl on_render(const engine::RenderContext &) override {
        const auto boxes = scene->boxes(false);
        view.draw(boxes, scene->camera);
        const auto player = *scene->world.get<engine::Box>(scene->player);
        view.draw_mesh(model, {player.center.x, player.center.y - player.size.y / 2,
                               player.center.z},
                       2.0F);
        if (const auto ratio = scene->enemy_health_ratio())
            view.draw_bar(20, 20, 200, 16, *ratio, {200, 70, 70});
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
        std::filesystem::path scene_path;
        std::filesystem::path save_scene_path;
        std::filesystem::path asset_path =
            std::filesystem::absolute(argv[0]).parent_path() / "assets/bench.gea";
        for (int i = 1; i < argc; ++i) {
            const std::string_view arg{argv[i]};
            if (arg == "--smoke")
                demo.smoke = true;
            else if (arg == "--headless")
                headless = true;
            else if (arg == "--asset" && i + 1 < argc)
                asset_path = argv[++i];
            else if (arg == "--scene" && i + 1 < argc)
                scene_path = argv[++i];
            else if (arg == "--save-scene" && i + 1 < argc)
                save_scene_path = argv[++i];
            else if (arg == "--snapshot" && i + 1 < argc) {
                snapshot = argv[++i];
                headless = true;
            } else
                throw std::invalid_argument{
                    "Usage: engine_playground [--smoke] [--headless] [--snapshot file.ppm] "
                    "[--asset file.gea] [--scene file.json] [--save-scene file.json]"};
        }
        if (scene_path.empty()) {
            demo.scene.emplace();
        } else {
            std::ifstream scene_file{scene_path, std::ios::binary | std::ios::ate};
            const auto scene_length = scene_file.tellg();
            if (!scene_file || scene_length < 0 || scene_length > 2000000)
                throw std::runtime_error{"Cannot read bounded scene document: " +
                                          scene_path.string()};
            std::string text(static_cast<engine::usize>(scene_length), '\0');
            scene_file.seekg(0);
            scene_file.read(text.data(), static_cast<std::streamsize>(text.size()));
            if (!scene_file)
                throw std::runtime_error{"scene document read failed"};
            demo.scene.emplace(engine::parse_scene_document(text));
        }
        if (!save_scene_path.empty()) {
            std::ofstream out{save_scene_path, std::ios::binary};
            out << engine::serialize_scene_document(demo.scene->export_document());
            if (!out)
                throw std::runtime_error{"scene document write failed"};
            std::cout << "Saved scene document: " << save_scene_path.string() << '\n';
            return 0;
        }
        std::ifstream asset_file{asset_path, std::ios::binary | std::ios::ate};
        const auto length = asset_file.tellg();
        if (!asset_file || length < 0 || length > 12000000)
            throw std::runtime_error{"Cannot read bounded asset: " + asset_path.string()};
        std::vector<engine::u8> bytes(static_cast<engine::usize>(length));
        asset_file.seekg(0);
        asset_file.read(reinterpret_cast<char *>(bytes.data()),
                        static_cast<std::streamsize>(bytes.size()));
        if (!asset_file)
            throw std::runtime_error{"asset read failed"};
        demo.model = engine::decode_mesh_asset(bytes);
        if (!snapshot.empty()) {
            const auto boxes = demo.scene->boxes(false);
            demo.view.draw(boxes, demo.scene->camera);
            const auto player = *demo.scene->world.get<engine::Box>(demo.scene->player);
            demo.view.draw_mesh(demo.model,
                                {player.center.x, player.center.y - player.size.y / 2,
                                 player.center.z},
                                2.0F);
            if (const auto ratio = demo.scene->enemy_health_ratio())
                demo.view.draw_bar(20, 20, 200, 16, *ratio, {200, 70, 70});
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
            config.application_name = "Game Engine | WASD move | Shift jump, hold to fly | F "
                                      "attack | Q/E orbit | Z/X zoom | Space add | Backspace "
                                      "remove | R reset | reach the gold goal at z=6 to win";
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
