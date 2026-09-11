#include "engine/input/actions.hpp"
#include "engine/world/fixed_systems.hpp"

#include <algorithm>
#include <cmath>
#include <memory>
#include <vector>
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define LAB_EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define LAB_EXPORT
#endif

namespace {
using namespace engine;
struct Transform { int x{}, z{}, kind{}; };
World world;
FixedSystems systems;
InputState input;
std::unique_ptr<ActionSystem> actions;
FixedStepClock simulation_clock;
std::unique_ptr<InputReplay> replay;
std::vector<InputReplayFrame> recording;
std::vector<InputEvent> pending;
std::vector<Entity> visible;
Entity player;
u64 ticks{}, duration{};
u32 expected{};
int mode{}, collected{};
bool locked{}, initialized{};
constexpr auto step = std::chrono::nanoseconds{16'666'667};

ActionBinding bind(const char* name, Key key, float scale = 1.0F) {
    return {ActionId{name}, KeyBinding{key}, {}, AxisProcessor{0, 1, ResponseCurve::linear, false, scale}};
}
InputMap bindings() {
    return {{ActionId{"x"}, ActionId{"z"}, ActionId{"spawn"}, ActionId{"lock"}},
        {{InputContextId{"field"}, 0, true,
            {bind("x", Key::a, -1), bind("x", Key::d), bind("z", Key::w, -1), bind("z", Key::s),
             bind("spawn", Key::space), bind("lock", Key::p)}},
         {InputContextId{"overlay"}, 10, false,
            {bind("x", Key::enter, 0), bind("z", Key::enter, 0), bind("spawn", Key::enter, 0)}}}};
}
Key key_for(int key) {
    switch (key) {
    case 0: return Key::w; case 1: return Key::a; case 2: return Key::s;
    case 3: return Key::d; case 4: return Key::space; case 5: return Key::p;
    default: return Key::unknown;
    }
}
InputEvent event(Key key, bool down) { return KeyEvent{1, key, down ? ButtonAction::pressed : ButtonAction::released, false}; }
u32 checksum() {
    u32 hash = 2166136261U;
    for (auto entity : world.query<Transform>()) {
        const auto& t = *world.get<Transform>(entity);
        for (int value : {t.x, t.z, t.kind}) { hash = (hash ^ static_cast<u32>(value)) * 16777619U; }
    }
    return (hash ^ static_cast<u32>(collected)) * 16777619U ^ static_cast<u32>(locked);
}
void reset_world() {
    world.reset(); input = {}; pending.clear(); simulation_clock.reset(); ticks = 0; collected = 0; locked = false;
    actions = std::make_unique<ActionSystem>(bindings());
    player = world.create(); world.set(player, Transform{-540, 360, 1});
    for (auto t : {Transform{-540,-180,2}, Transform{0,-180,2}, Transform{0,360,2}, Transform{540,360,2}, Transform{540,-540,2}}) {
        world.set(world.create(), t);
    }
    visible = world.query<Transform>();
}
void initialize() {
    if (initialized) return;
    world.register_component<Transform>("lab.transform");
    systems.add("lab.move", FixedPhase::update, 0, [](World& w, const FixedUpdateContext&) {
        if (actions->state(ActionId{"lock"}).pressed) {
            locked = !locked;
            static_cast<void>(actions->set_context_active(InputContextId{"overlay"}, locked));
        }
        auto& p = *w.get<Transform>(player);
        p.x = std::clamp(p.x + static_cast<int>(actions->state(ActionId{"x"}).value * 6), -840, 840);
        p.z = std::clamp(p.z + static_cast<int>(actions->state(ActionId{"z"}).value * 6), -840, 840);
        if (actions->state(ActionId{"spawn"}).pressed && w.size() < 128) {
            const auto box = w.defer_create();
            w.defer_set(box, Transform{p.x + 70, p.z, 3});
        }
        for (auto e : w.query<Transform>()) {
            const auto& t = *w.get<Transform>(e);
            const int dx = t.x - p.x, dz = t.z - p.z;
            if (t.kind == 2 && dx*dx + dz*dz < 75*75) { w.defer_destroy(e); ++collected; }
        }
    });
    initialized = true; reset_world();
}
void tick() {
    if (mode == 3) return;
    if (mode == 2) {
        static_cast<void>(replay->inject_next(input));
    } else {
        input.begin_frame();
        if (mode == 1 && !pending.empty()) recording.push_back({ticks, pending});
        for (auto& e : pending) input.apply(e);
        pending.clear();
    }
    actions->update(input);
    systems.run(world, {ticks, step, input});
    ++ticks;
    visible = world.query<Transform>();
    if (mode == 2 && ticks >= duration) mode = 3;
    if (mode == 1 && ticks >= 1800) { duration = ticks; expected = checksum(); mode = 0; }
}
void start_replay() {
    if (!duration) return;
    reset_world(); replay = std::make_unique<InputReplay>(recording); replay->restart(input); mode = 2;
}
} // namespace

extern "C" {
LAB_EXPORT void lab_init() { initialize(); }
LAB_EXPORT void lab_key(int key, int down) {
    if (mode >= 2 || pending.size() >= 256) return;
    const auto k = key_for(key);
    if (k != Key::unknown) pending.push_back(event(k, down != 0));
}
LAB_EXPORT void lab_tick() { initialize(); tick(); }
LAB_EXPORT void lab_advance(double milliseconds) {
    initialize();
    if (!std::isfinite(milliseconds) || milliseconds < 0 || mode == 3) return;
    const auto batch = simulation_clock.advance(std::chrono::nanoseconds{static_cast<i64>(std::min(milliseconds,250.0)*1'000'000)});
    for (u32 i=0; i<batch.step_count; ++i) tick();
}
// 0 reset; 1 record; 2 stop; 3 replay; 4 built-in demonstration.
LAB_EXPORT void lab_control(int command) {
    initialize();
    if (command == 0) { reset_world(); mode = 0; }
    if (command == 1) { reset_world(); recording.clear(); duration = 0; expected = 0; mode = 1; }
    if (command == 2 && mode == 1) { duration = ticks; expected = checksum(); mode = 0; }
    if (command == 3) start_replay();
    if (command == 4) {
        recording = {{0,{event(Key::w,true)}}, {90,{event(Key::w,false), event(Key::d,true),event(Key::space,true)}},
          {91,{event(Key::space,false)}}, {180,{event(Key::d,false),event(Key::s,true)}},
          {270,{event(Key::s,false),event(Key::d,true)}}, {360,{event(Key::d,false)}}};
        duration = 361; expected = 0; start_replay();
    }
}
LAB_EXPORT double lab_value(int field) {
    switch(field) {
    case 0: return static_cast<double>(ticks); case 1: return static_cast<double>(visible.size());
    case 2: return collected; case 3: return mode; case 4: return locked;
    case 5: return duration; case 6: return checksum(); case 7: return expected;
    case 8: return actions->state(ActionId{"x"}).value;
    case 9: return actions->state(ActionId{"z"}).value;
    default: return 0;
    }
}
LAB_EXPORT double lab_entity(int index, int field) {
    if (index < 0 || static_cast<std::size_t>(index) >= visible.size()) return 0;
    const auto* t = world.get<Transform>(visible[static_cast<std::size_t>(index)]);
    if (!t) return 0;
    return field == 0 ? t->x/100.0 : field == 1 ? t->z/100.0 : t->kind;
}
}
