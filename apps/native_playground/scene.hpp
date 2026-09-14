#pragma once
#include "engine/core/seeded_random.hpp"
#include "engine/graphics/box_view.hpp"
#include "engine/input/actions.hpp"
#include "engine/world/fixed_systems.hpp"
#include <algorithm>

namespace playground {
using namespace engine;
class Scene final {
public:
    World world;
    Entity player;
    OrbitView camera;
    Scene() : actions_(map()) {
        world.register_component<Box>("playground.box");
        systems_.add(
            "playground.move", FixedPhase::update, 0, [&](World &w, const FixedUpdateContext &) {
                auto &box = *w.get<Box>(player);
                box.center.x = std::clamp(box.center.x + value("x") * 0.08F, -7.0F, 7.0F);
                box.center.z = std::clamp(box.center.z + value("z") * 0.08F, -7.0F, 7.0F);
                camera.yaw += value("orbit") * 0.025F;
                camera.scale = std::clamp(camera.scale + value("zoom") * 0.4F, 12.0F, 40.0F);
                if (pressed("spawn") && w.size() < 64) {
                    auto created = w.defer_create();
                    w.defer_set(
                        created,
                        Box{{box.center.x + 1.2F, 0.5F, box.center.z}, {1, 1, 1}, {218, 166, 96}});
                }
                if (pressed("remove")) {
                    auto all = w.query<Box>();
                    for (auto i = all.rbegin(); i != all.rend(); ++i)
                        if (*i != player) {
                            w.defer_destroy(*i);
                            break;
                        }
                }
            });
        reset();
    }
    void reset() {
        world.reset();
        camera = {};
        actions_ = ActionSystem{map()};
        player = world.create();
        world.set(player, Box{{-3, 0.6F, 3}, {0.8F, 1.2F, 0.8F}, {218, 239, 132}});
        SeededRandom rng{42};
        for (int i = 0; i < 7; ++i) {
            const float height = 0.8F + static_cast<float>(rng.next_unit()) * 2.2F;
            world.set(world.create(), Box{{static_cast<float>(i) * 1.8F - 5.4F, height / 2, -3},
                                          {1, height, 1},
                                          {104, 160, 159}});
        }
    }
    void step(const FixedUpdateContext &context) {
        actions_.update(context.input);
        if (pressed("reset")) {
            reset();
            return;
        }
        systems_.run(world, context);
    }
    [[nodiscard]] std::vector<Box> boxes(bool show_player = true) const {
        std::vector<Box> result;
        for (int x = -8; x < 8; ++x)
            for (int z = -8; z < 8; ++z)
                result.push_back(
                    {{static_cast<float>(x) + 0.5F, -0.15F, static_cast<float>(z) + 0.5F},
                     {0.97F, 0.2F, 0.97F},
                     ((x + z) % 2) ? std::array<u8, 3>{63, 88, 88}
                                   : std::array<u8, 3>{69, 97, 96}});
        for (auto entity : world.query<Box>())
            if (show_player || entity != player)
                result.push_back(*world.get<Box>(entity));
        return result;
    }

private:
    FixedSystems systems_;
    ActionSystem actions_;
    float value(const char *name) const { return actions_.state(ActionId{name}).value; }
    bool pressed(const char *name) const { return actions_.state(ActionId{name}).pressed; }
    static InputMap map() {
        InputMap result;
        InputContext context{InputContextId{"playground"}, 0, true, {}};
        auto bind = [&](const char *name, Key key, float scale) {
            context.bindings.push_back({ActionId{name},
                                        KeyBinding{key},
                                        {},
                                        AxisProcessor{0, 1, ResponseCurve::linear, false, scale}});
        };
        for (auto name : {"x", "z", "orbit", "zoom", "spawn", "remove", "reset"})
            result.actions.emplace_back(name);
        bind("x", Key::a, -1);
        bind("x", Key::d, 1);
        bind("z", Key::w, -1);
        bind("z", Key::s, 1);
        bind("orbit", Key::q, -1);
        bind("orbit", Key::e, 1);
        bind("zoom", Key::z, -1);
        bind("zoom", Key::x, 1);
        bind("spawn", Key::space, 1);
        bind("remove", Key::backspace, 1);
        bind("reset", Key::r, 1);
        result.contexts.push_back(context);
        return result;
    }
};
} // namespace playground
