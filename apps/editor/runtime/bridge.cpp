#include "engine/physics/physics.hpp"
#include "engine/world/fixed_systems.hpp"
#include <cmath>
#include <memory>
#include <vector>
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define EXPORT
#endif
namespace {
struct Runtime {
    engine::World world;
    engine::FixedSystems systems;
    engine::InputState input;
    std::vector<engine::Entity> entities;
    engine::u64 ticks{};
    Runtime() {
        world.register_component<engine::Box>("editor.box");
        world.register_component<engine::physics::RigidBody>("editor.rigid_body");
        world.register_component<engine::physics::Collider>("editor.collider");
        systems.add("editor.physics", engine::FixedPhase::update, 10,
                    [](engine::World &w, const engine::FixedUpdateContext &) {
                        engine::physics::step(w, 1.0F / 60.0F);
                    });
    }
};
std::unique_ptr<Runtime> active = std::make_unique<Runtime>();
std::unique_ptr<Runtime> staging;
bool failed{};
} // namespace
extern "C" {
EXPORT void editor_begin() {
    staging = std::make_unique<Runtime>();
    failed = false;
}
EXPORT int editor_add(double x, double y, double z, double vx, double vy, double vz) {
    if (!staging || staging->entities.size() >= 1024) {
        failed = true;
        return 0;
    }
    for (double v : {x, y, z, vx, vy, vz})
        if (!std::isfinite(v) || std::abs(v) > 1000000) {
            failed = true;
            return 0;
        }
    const auto e = staging->world.create();
    staging->world.set(e, engine::Box{engine::Vec3{static_cast<float>(x), static_cast<float>(y),
                                                    static_cast<float>(z)}});
    staging->world.set(e, engine::physics::RigidBody{engine::Vec3{
                              static_cast<float>(vx), static_cast<float>(vy), static_cast<float>(vz)}});
    staging->entities.push_back(e);
    return 1;
}
EXPORT int editor_commit() {
    if (!staging || failed) {
        staging.reset();
        return 0;
    }
    active.swap(staging);
    staging.reset();
    return 1;
}
EXPORT void editor_tick() {
    active->systems.run(active->world,
                        {active->ticks++, std::chrono::nanoseconds{16'666'667}, active->input});
}
EXPORT double editor_value(int index, int field) {
    if (index < 0 || static_cast<std::size_t>(index) >= active->entities.size())
        return 0;
    const auto &b = *active->world.get<engine::Box>(active->entities[static_cast<std::size_t>(index)]);
    return field == 0 ? b.center.x : field == 1 ? b.center.y : b.center.z;
}
EXPORT int editor_count() { return static_cast<int>(active->world.size()); }
}
