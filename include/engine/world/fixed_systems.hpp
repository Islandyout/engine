#pragma once

#include "engine/runtime/application.hpp"
#include "engine/world/world.hpp"

#include <functional>
#include <string>
#include <vector>

namespace engine {

enum class FixedPhase : u8 { begin, update, end };

// Call exactly once from on_fixed_update; this class owns no wall clock or
// render loop.
class FixedSystems final {
public:
    using Function = std::function<void(World&, const FixedUpdateContext&)>;
    FixedSystems() = default;
    FixedSystems(const FixedSystems&) = delete;
    FixedSystems& operator=(const FixedSystems&) = delete;
    FixedSystems(FixedSystems&&) = delete;
    FixedSystems& operator=(FixedSystems&&) = delete;

    void add(std::string name, FixedPhase phase, i32 order, Function function);
    void set_enabled(const std::string& name, bool enabled);
    void run(World& world, const FixedUpdateContext& context);

private:
    struct System final {
        std::string name;
        FixedPhase phase{};
        i32 order{};
        Function function;
        bool enabled{true};
    };
    bool executing_{};
    std::vector<System> systems_;
};

} // namespace engine
