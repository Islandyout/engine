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
        check(scene.world.size() == 9, "deferred creation");
        step();
        check(scene.world.size() == 9, "held key does not repeat spawn");
        key(input, Key::backspace, true);
        step();
        check(scene.world.size() == 8, "deferred removal");
        key(input, Key::q, true);
        step();
        check(scene.camera.yaw < 0.65F, "camera action");
        key(input, Key::r, true);
        step();
        check(!scene.world.alive(stale), "reset invalidates handles");
        check(scene.world.size() == 8, "reset restores seed scene");

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
