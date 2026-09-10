#include "engine/world/fixed_systems.hpp"

#include <chrono>
#include <iostream>
#include <stdexcept>
#include <string>
#include <type_traits>
#include <vector>

namespace {
using namespace std::chrono_literals;
using engine::Entity;
using engine::FixedPhase;
using engine::FixedSystems;
using engine::World;

struct Position {
    int x{};
};
struct Velocity {
    int x{};
};

struct ThrowingValue {
    inline static bool fail{};
    ThrowingValue() = default;
    ThrowingValue(const ThrowingValue&) = default;
    ThrowingValue& operator=(const ThrowingValue&) = default;
    ThrowingValue(ThrowingValue&&) {
        if (fail) {
            throw std::runtime_error{"intentional component move failure"};
        }
    }
    ThrowingValue& operator=(ThrowingValue&&) {
        if (fail) {
            throw std::runtime_error{"intentional component assignment failure"};
        }
        return *this;
    }
};

void require(bool condition, const std::string& message) {
    if (!condition) {
        throw std::runtime_error{message};
    }
}
template <typename Exception = std::invalid_argument, typename Function>
void rejects(Function function) {
    try {
        function();
    } catch (const Exception&) {
        return;
    }
    throw std::runtime_error{"operation should have been rejected"};
}

void ownership_and_registration() {
    static_assert(!std::is_copy_constructible_v<World>);
    static_assert(!std::is_move_constructible_v<World>);
    World world;
    world.register_component<Velocity>("velocity");
    world.register_component<Position>("position");
    require(world.component_names() == std::vector<std::string>{"position", "velocity"},
            "registration metadata is lexically ordered");
    rejects([&] { world.register_component<int>("position"); });
    rejects([&] { world.register_component<Position>("other"); });
    rejects([&] { world.register_component<int>(""); });
    rejects([&] { world.register_component<int>("invalid name"); });
    rejects([&] { world.register_component<int>(std::string(129, 'x')); });
    const auto entity = world.create();
    require(!world.alive(Entity{}), "null handle is never alive");
    rejects([&] { world.set(Entity{}, Position{}); });
    rejects([&] { static_cast<void>(world.get<int>(entity)); });
    rejects([&] { static_cast<void>(world.query<int>()); });
    world.set(entity, Position{7});
    world.set(entity, Position{9});
    const auto& view = world;
    require(view.get<Position>(entity)->x == 9, "const access and replacement work");
    World other;
    other.register_component<Position>("position");
    const auto foreign = other.create();
    other.set(foreign, Position{88});
    require(!world.alive(foreign) && !world.get<Position>(foreign), "foreign access rejected");
    require(!world.destroy(foreign) && !world.remove<Position>(foreign),
            "foreign mutation is inert");
    rejects([&] { world.set(foreign, Position{}); });
    rejects([&] { world.defer_set(foreign, Position{}); });
    rejects([&] { world.defer_remove<Position>(foreign); });
    rejects([&] { world.defer_destroy(foreign); });
    require(other.get<Position>(foreign)->x == 88, "foreign world remains untouched");
    require(world.destroy(entity), "living entity destroyed");
    const auto replacement = world.create();
    world.set(replacement, Position{42});
    require(entity != replacement && !world.alive(entity), "destroyed handles never recycled");
    require(!world.get<Position>(entity), "stale handle cannot read replacement");
    require(!world.remove<Position>(entity) && !world.destroy(entity), "stale mutations are inert");
    rejects([&] { world.set(entity, Position{}); });
    world.defer_set(entity, Position{});
    world.defer_destroy(entity);
    world.flush();
    require(world.get<Position>(replacement)->x == 42, "stale deferred writes are inert");
    require(world.query<Position>() == std::vector<Entity>{replacement}, "no ghost entities");
}

void reset_and_deferred_changes() {
    World world;
    world.register_component<Position>("position");
    world.register_component<Velocity>("velocity");
    const auto first = world.create();
    world.set(first, Position{1});
    const auto pending = world.defer_create();
    world.defer_set(pending, Position{2});
    require(!world.alive(pending) && world.query<Position>() == std::vector<Entity>{first},
            "reserved handles and pending components are not visible");
    world.flush();
    require(world.query<Position>() == std::vector<Entity>{first, pending}, "creation order query");
    world.defer_set(first, Position{3});
    world.defer_set(first, Position{4});
    world.defer_remove<Position>(pending);
    world.defer_destroy(first);
    world.defer_set(first, Position{5});
    world.flush();
    require(!world.alive(first) && !world.get<Position>(pending),
            "FIFO destroy prevents resurrection");
    const auto canceled = world.defer_create();
    world.defer_set(canceled, Position{6});
    world.reset();
    world.flush();
    const auto after = world.create();
    require(after != first && after != pending && after != canceled, "reset never reuses handles");
    require(!world.alive(pending) && !world.alive(canceled) && world.pending_changes() == 0,
            "reset invalidates living and pending entities");
    require(world.component_names().size() == 2, "reset preserves component registration");
    world.set(after, Position{7});
    world.set(after, Velocity{2});
    require(world.query<Position, Velocity>() == std::vector<Entity>{after}, "intersection query");
    require(world.query<>() == std::vector<Entity>{after},
            "empty query returns all living entities");
    require(world.remove<Velocity>(after) && world.query<Velocity>().empty(),
            "query reflects removal");
    Entity previous_world;
    {
        World temporary;
        previous_world = temporary.create();
    }
    World later;
    const auto later_entity = later.create();
    require(previous_world != later_entity && !later.alive(previous_world),
            "world lifetime isolation");
}

std::vector<std::string> schedule_trace(bool reverse) {
    World world;
    FixedSystems systems;
    engine::InputState input;
    std::vector<std::string> trace;
    const std::vector<std::string> names =
        reverse ? std::vector<std::string>{"z", "a"} : std::vector<std::string>{"a", "z"};
    for (const auto& name : names) {
        systems.add(name, FixedPhase::update, 0,
                    [&, name](World&, const engine::FixedUpdateContext& ctx) {
                        require(ctx.delta_time == 10ms, "delta forwarded unchanged");
                        trace.push_back(std::to_string(ctx.tick) + name);
                    });
    }
    systems.add("early", FixedPhase::update, -10,
                [&](World&, const auto&) { trace.push_back("early"); });
    systems.add("begin", FixedPhase::begin, 100,
                [&](World&, const auto&) { trace.push_back("begin"); });
    systems.add("end", FixedPhase::end, -100, [&](World&, const auto&) { trace.push_back("end"); });
    systems.add("disabled", FixedPhase::begin, 0,
                [](World&, const auto&) { throw std::runtime_error{"disabled ran"}; });
    systems.set_enabled("disabled", false);
    rejects([&] { systems.add("a", FixedPhase::begin, 0, [](World&, const auto&) {}); });
    rejects(
        [&] { systems.add("bad", static_cast<FixedPhase>(255), 0, [](World&, const auto&) {}); });
    rejects([&] { systems.add("empty", FixedPhase::begin, 0, {}); });
    rejects([&] { systems.set_enabled("missing", false); });
    rejects([&] { systems.run(world, {0, 0ns, input}); });
    for (engine::u64 tick = 0; tick < 3; ++tick) {
        systems.run(world, {tick, 10ms, input});
    }
    return trace;
}

void phase_visibility_and_guards() {
    World world;
    world.register_component<Position>("position");
    FixedSystems systems;
    FixedSystems nested;
    engine::InputState input;
    Entity spawned;
    const auto existing = world.create();
    world.set(existing, Position{0});
    systems.add("produce", FixedPhase::begin, 0, [&](World& w, const auto& ctx) {
        spawned = w.defer_create();
        w.defer_set(spawned, Position{7});
        rejects<std::logic_error>([&] { static_cast<void>(w.create()); });
        rejects<std::logic_error>([&] { w.destroy(existing); });
        rejects<std::logic_error>([&] { w.remove<Position>(existing); });
        rejects<std::logic_error>([&] { w.set(existing, Position{}); });
        rejects<std::logic_error>([&] { w.reset(); });
        rejects<std::logic_error>([&] { w.flush(); });
        rejects<std::logic_error>([&] { w.register_component<int>("integer"); });
        rejects<std::logic_error>([&] { systems.set_enabled("produce", false); });
        rejects<std::logic_error>(
            [&] { systems.add("new", FixedPhase::end, 0, [](World&, const auto&) {}); });
        rejects<std::logic_error>([&] { systems.run(w, ctx); });
        rejects<std::logic_error>([&] { nested.run(w, ctx); });
        w.get<Position>(existing)->x = 9;
    });
    systems.add("observe_same_phase", FixedPhase::begin, 1, [&](World& w, const auto&) {
        require(!w.alive(spawned), "same-phase systems cannot see pending creation");
        require(w.get<Position>(existing)->x == 9, "value writes are immediately visible");
    });
    systems.add("consume", FixedPhase::update, 0, [&](World& w, const auto&) {
        require(w.get<Position>(spawned)->x == 7, "next phase sees committed components");
        for (const auto entity : w.query<Position>()) {
            w.defer_destroy(entity);
        }
        require(w.size() == 2, "deferred destruction is safe during snapshot iteration");
    });
    systems.add("verify", FixedPhase::end, 0, [](World& w, const auto&) {
        require(w.size() == 0, "destruction visible at next phase");
    });
    systems.run(world, {0, 10ms, input});
    require(world.pending_changes() == 0, "all phase commands flushed");
}

void exceptions_release_execution_guards() {
    World world;
    FixedSystems systems;
    engine::InputState input;
    Entity canceled;
    systems.add("failure", FixedPhase::update, 0, [&](World& w, const auto&) {
        canceled = w.defer_create();
        throw std::runtime_error{"intentional callback failure"};
    });
    rejects<std::runtime_error>([&] { systems.run(world, {0, 10ms, input}); });
    require(!world.alive(canceled) && world.pending_changes() == 0,
            "failed phase discards commands");
    systems.set_enabled("failure", false);
    systems.run(world, {1, 10ms, input});
    world.reset();
    require(world.alive(world.create()), "world remains usable after callback failure");
}

void component_lifetime_and_flush_failure() {
    World world;
    world.register_component<std::shared_ptr<int>>("resource");
    auto resource = std::make_shared<int>(12);
    std::weak_ptr<int> observer = resource;
    const auto entity = world.create();
    world.set(entity, std::move(resource));
    require(!observer.expired(), "world owns component lifetime");
    world.destroy(entity);
    require(observer.expired(), "destroy releases component resources");
    auto queued = std::make_shared<int>(13);
    observer = queued;
    const auto canceled = world.defer_create();
    world.defer_set(canceled, std::move(queued));
    world.reset();
    require(observer.expired(), "reset releases queued component resources");

    world.register_component<ThrowingValue>("throwing");
    FixedSystems systems;
    engine::InputState input;
    Entity reserved;
    systems.add("queue", FixedPhase::begin, 0, [&](World& w, const auto&) {
        reserved = w.defer_create();
        w.defer_set(reserved, ThrowingValue{});
        w.defer_destroy(reserved);
        ThrowingValue::fail = true;
    });
    rejects<std::runtime_error>([&] { systems.run(world, {0, 10ms, input}); });
    ThrowingValue::fail = false;
    require(world.alive(reserved), "flush failure keeps the already committed prefix");
    require(!world.get<ThrowingValue>(reserved) && world.pending_changes() == 0,
            "flush failure discards remaining commands without leaking a component");
    systems.set_enabled("queue", false);
    systems.run(world, {1, 10ms, input});
    world.reset();
    require(world.size() == 0, "flush exception releases execution guards");
}

class ManualPlatform final : public engine::Platform {
public:
    bool initialize() override { return true; }
    void shutdown() noexcept override {}
    bool poll_event(engine::PlatformEvent&) override { return false; }
    TimePoint now() const noexcept override { return time_; }
    void sleep_for(Duration duration) override { time_ += duration; }

private:
    TimePoint time_{};
};

class Simulation final : public engine::ApplicationCallbacks {
public:
    Simulation() {
        world.register_component<Position>("position");
        entity = world.create();
        world.set(entity, Position{});
        systems.add("advance", FixedPhase::update, 0, [&](World& w, const auto& ctx) {
            require(ctx.tick == ticks.size() && ctx.delta_time == 10ms, "runtime tick sequence");
            ++w.get<Position>(entity)->x;
            ticks.push_back(ctx.tick);
        });
    }
    engine::LoopControl on_fixed_update(const engine::FixedUpdateContext& ctx) override {
        systems.run(world, ctx);
        return ticks.size() == 12 ? engine::LoopControl::exit
                                  : engine::LoopControl::continue_running;
    }
    World world;
    FixedSystems systems;
    Entity entity;
    std::vector<engine::u64> ticks;
};

void runtime_cadence_is_independent_of_render_frames() {
    for (const auto frame_time : {5ms, 10ms, 30ms}) {
        ManualPlatform platform;
        Simulation simulation;
        engine::ApplicationConfig config;
        config.fixed_step = 10ms;
        config.target_frame_time = frame_time;
        config.maximum_frame_count = 100;
        const auto result = engine::Application{platform, simulation, config}.run();
        require(result.reason == engine::ExitReason::requested && result.simulation_ticks == 12,
                "runtime completes exactly twelve simulation ticks at every render "
                "cadence");
        require(simulation.world.get<Position>(simulation.entity)->x == 12,
                "identical final state");
    }
}
} // namespace

int main() {
    try {
        ownership_and_registration();
        reset_and_deferred_changes();
        const auto trace = schedule_trace(false);
        require(trace == schedule_trace(true),
                "registration order must not affect execution order");
        require(trace == std::vector<std::string>{"begin", "early", "0a", "0z", "end", "begin",
                                                  "early", "1a", "1z", "end", "begin", "early",
                                                  "2a", "2z", "end"},
                "phase/order/name ordering");
        phase_visibility_and_guards();
        exceptions_release_execution_guards();
        component_lifetime_and_flush_failure();
        runtime_cadence_is_independent_of_render_frames();
        std::cout << "World tests passed (7 groups)\n";
        return 0;
    } catch (const std::exception& exception) {
        std::cerr << "World tests failed: " << exception.what() << '\n';
        return 1;
    }
}
