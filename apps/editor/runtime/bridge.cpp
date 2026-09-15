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
// sx/sy/sz are the entity's authored world-space box dimensions (its Scale), so ground
// and future collider resolution rests the box's actual visible bounds, not a hardcoded
// unit cube. is_child is nonzero when the entity has a Parent: `x`/`y`/`z` are then a
// parent-relative local position, not a world-space one, and the physics module has no
// notion of hierarchy — so a child entity gets no RigidBody and is left untouched by
// physics::step (which only acts on Box+RigidBody pairs), passing its authored local
// transform straight back through editor_value unchanged instead of being simulated
// against the world ground plane it doesn't actually sit on.
EXPORT int editor_add(double x, double y, double z, double vx, double vy, double vz, double sx,
                       double sy, double sz, double is_child) {
    if (!staging || staging->entities.size() >= 1024) {
        failed = true;
        return 0;
    }
    for (double v : {x, y, z, vx, vy, vz})
        if (!std::isfinite(v) || std::abs(v) > 1000000) {
            failed = true;
            return 0;
        }
    for (double v : {sx, sy, sz})
        if (!std::isfinite(v) || v <= 0 || v > 1000000) {
            failed = true;
            return 0;
        }
    const auto e = staging->world.create();
    staging->world.set(
        e, engine::Box{engine::Vec3{static_cast<float>(x), static_cast<float>(y), static_cast<float>(z)},
                       engine::Vec3{static_cast<float>(sx), static_cast<float>(sy), static_cast<float>(sz)}});
    if (is_child == 0)
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
