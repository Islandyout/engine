#include "engine/world/fixed_systems.hpp"

#include <algorithm>
#include <tuple>

namespace engine {

void FixedSystems::add(std::string name, const FixedPhase phase, const i32 order,
                       Function function) {
    if (executing_) {
        throw std::logic_error{"cannot register systems during execution"};
    }
    World::validate_name(name);
    if (phase != FixedPhase::begin && phase != FixedPhase::update && phase != FixedPhase::end) {
        throw std::invalid_argument{"invalid fixed phase"};
    }
    if (!function || std::any_of(systems_.begin(), systems_.end(),
                                 [&](const System& system) { return system.name == name; })) {
        throw std::invalid_argument{"empty callback or duplicate system name"};
    }
    systems_.push_back({std::move(name), phase, order, std::move(function), true});
    std::sort(systems_.begin(), systems_.end(), [](const System& left, const System& right) {
        return std::tie(left.phase, left.order, left.name) <
               std::tie(right.phase, right.order, right.name);
    });
}

void FixedSystems::set_enabled(const std::string& name, const bool enabled) {
    if (executing_) {
        throw std::logic_error{"cannot change system activation during execution"};
    }
    for (auto& system : systems_) {
        if (system.name == name) {
            system.enabled = enabled;
            return;
        }
    }
    throw std::invalid_argument{"unknown system"};
}

void FixedSystems::run(World& world, const FixedUpdateContext& context) {
    if (executing_ || world.executing_) {
        throw std::logic_error{"recursive or overlapping world execution"};
    }
    if (context.delta_time <= FixedStepClock::Duration::zero()) {
        throw std::invalid_argument{"fixed delta must be positive"};
    }
    executing_ = true;
    try {
        world.flush();
        for (const auto phase : {FixedPhase::begin, FixedPhase::update, FixedPhase::end}) {
            world.executing_ = true;
            for (auto& system : systems_) {
                if (system.enabled && system.phase == phase) {
                    system.function(world, context);
                }
            }
            world.executing_ = false;
            world.flush();
        }
        executing_ = false;
    } catch (...) {
        world.executing_ = false;
        world.commands_.clear();
        executing_ = false;
        throw;
    }
}

} // namespace engine
