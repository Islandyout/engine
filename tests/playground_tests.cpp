#include "../apps/native_playground/scene.hpp"
#include <cmath>
#include <iostream>
#include <limits>
#include <stdexcept>

namespace {
void check(bool pass, const char *message) {
    if (!pass)
        throw std::runtime_error{message};
}
void key(engine::InputState &input, engine::Key key, bool down) {
    input.apply(engine::KeyEvent{
        1, key, down ? engine::ButtonAction::pressed : engine::ButtonAction::released, false});
}
} // namespace
int main() {
    try {
        using namespace engine;
        playground::Scene scene;
        InputState input;
        auto step = [&] {
            scene.step({0, std::chrono::nanoseconds{16666667}, input});
            input.begin_frame();
        };
        const auto stale = scene.player;
        key(input, Key::d, true);
        for (int i = 0; i < 10; ++i)
            step();
        check(std::abs(scene.world.get<Box>(scene.player)->center.x + 2.2F) < 0.00001F,
              "action movement");
        key(input, Key::space, true);
        step();
        check(scene.world.size() == 13, "deferred creation");
        step();
        check(scene.world.size() == 13, "held key does not repeat spawn");
        key(input, Key::backspace, true);
        step();
        check(scene.world.size() == 12, "deferred removal");
        key(input, Key::q, true);
        step();
        check(scene.camera.yaw < 0.65F, "camera action");
        key(input, Key::r, true);
        step();
        check(!scene.world.alive(stale), "reset invalidates handles");
        check(scene.world.size() == 12,
              "reset restores seed scene: player, 7 field boxes, 3 platforms, 1 goal");

        {
            // A scene loaded from an editor-exported document (see
            // engine::parse_scene_document) replaces the built-in random
            // boxes, and pressing reset reloads that same document rather
            // than falling back to it.
            SceneDocument document;
            document.entities.push_back(
                {std::nullopt, std::nullopt, TransformComponent{{1, 2, 3}}, std::nullopt});
            document.entities.push_back({std::nullopt, std::nullopt, TransformComponent{{4, 5, 6}},
                                          RenderableComponent{0, 0, false}});
            document.entities.push_back({std::nullopt, std::nullopt, std::nullopt,
                                          RenderableComponent{0, 0, true}});
            playground::Scene loaded{document};
            check(loaded.world.size() == 2, "player plus one visible transform entity");
            const auto placed = loaded.world.query<Box>();
            bool found = false;
            for (auto entity : placed)
                if (entity != loaded.player) {
                    const auto center = loaded.world.get<Box>(entity)->center;
                    found = found || (std::abs(center.x - 1.0F) < 0.0001F &&
                                      std::abs(center.y - 2.0F) < 0.0001F &&
                                      std::abs(center.z - 3.0F) < 0.0001F);
                }
            check(found, "document entity placed at its Transform position");
            // A dedicated InputState avoids any held-key state carried over
            // from the shared `input` object used above.
            InputState reset_input;
            key(reset_input, Key::r, true);
            loaded.step({0, std::chrono::nanoseconds{16666667}, reset_input});
            check(loaded.world.size() == 2, "reset reloads the same document, not the defaults");
        }

        {
            // export_document() snapshots every current Box entity (player
            // included) as a Transform+Renderable, and that snapshot
            // round-trips through the same "format 1" JSON the editor and
            // --scene both use.
            const auto exported = scene.export_document();
            check(exported.entities.size() == scene.world.query<Box>().size(),
                  "export_document captures every Box entity");
            const auto reloaded = parse_scene_document(serialize_scene_document(exported));
            check(reloaded.entities.size() == exported.entities.size(),
                  "exported document round-trips through serialize+parse");
            const auto player_box = *scene.world.get<Box>(scene.player);
            bool found_player = false;
            for (const auto &entity : reloaded.entities)
                found_player = found_player ||
                               (entity.transform.has_value() &&
                                std::abs(entity.transform->position.x - player_box.center.x) <
                                    0.0001F &&
                                std::abs(entity.transform->position.y - player_box.center.y) <
                                    0.0001F &&
                                std::abs(entity.transform->position.z - player_box.center.z) <
                                    0.0001F);
            check(found_player, "round-tripped document includes the player's exact position");
        }

        {
            // The default scene's platform path (see place_platform_path())
            // is reachable by ordinary input: not won at start, and a
            // two-phase script (approach along z only, clear of every
            // platform's x-range, then traverse along x with periodic jump
            // taps — jump is edge-triggered, so the key is toggled to get a
            // fresh press each time) reaches the goal within a generous
            // tick budget. Diagonal movement is deliberately not used here:
            // it walks the player into a platform's z-face before it is
            // over the platform's footprint, which blocks it exactly like
            // any other Collider wall — a real property of static box
            // colliders, not a bug, but it means "straight there" is not
            // this path's traversal order. The goal itself is exempt from
            // "remove" and so is never deleted by this scripted input.
            playground::Scene run;
            check(!run.won(), "not won at the start");
            check(run.goal.has_value(), "the default scene has a goal");
            InputState run_input;
            key(run_input, Key::s, true);
            for (int tick = 0; tick < 45; ++tick) {
                run.step({0, std::chrono::nanoseconds{16666667}, run_input});
                run_input.begin_frame();
            }
            key(run_input, Key::s, false);
            key(run_input, Key::d, true);
            bool jump_down = false;
            bool reached = false;
            for (int tick = 0; tick < 300 && !reached; ++tick) {
                if (tick % 15 == 0) {
                    jump_down = !jump_down;
                    key(run_input, Key::left_shift, jump_down);
                }
                run.step({0, std::chrono::nanoseconds{16666667}, run_input});
                run_input.begin_frame();
                reached = run.won();
            }
            check(reached, "scripted platforming input reaches the goal within budget");
            check(run.world.alive(*run.goal), "the goal is never removed by scripted input");
        }

        BoxView view;
        auto boxes = scene.boxes();
        view.draw(boxes);
        const std::vector<u8> original(view.pixels().begin(), view.pixels().end());
        view.draw(boxes);
        check(std::equal(original.begin(), original.end(), view.pixels().begin()),
              "repeatable image");
        view.draw(boxes, {1.2F, 28});
        check(!std::equal(original.begin(), original.end(), view.pixels().begin()),
              "camera changes image");
        std::array<Box, 2> overlap = {Box{{0, 0, 0}, {3, 3, 3}, {255, 0, 0}},
                                      Box{{0, 0, 4}, {1, 1, 1}, {0, 255, 0}}};
        view.draw(overlap);
        const std::vector<u8> first(view.pixels().begin(), view.pixels().end());
        std::reverse(overlap.begin(), overlap.end());
        view.draw(overlap);
        check(std::equal(first.begin(), first.end(), view.pixels().begin()),
              "depth ignores submission order for separated surfaces");
        bool rejected = false;
        try {
            view.draw(boxes, {std::numeric_limits<float>::quiet_NaN(), 28});
        } catch (const std::invalid_argument &) {
            rejected = true;
        }
        check(rejected, "reject nonfinite camera");
        boxes[0].size.x = 0;
        rejected = false;
        try {
            view.draw(boxes);
        } catch (const std::invalid_argument &) {
            rejected = true;
        }
        check(rejected, "reject degenerate box");
        std::cout << "Playground actions, lifecycle, camera, raster repeatability, depth and "
                     "validation passed.\n";
    } catch (const std::exception &e) {
        std::cerr << e.what() << '\n';
        return 1;
    }
}
