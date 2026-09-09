#pragma once

#include "engine/core/types.hpp"
#include "engine/input/input.hpp"

#include <chrono>
#include <optional>

namespace engine {

enum class PlatformEventType : u8 {
    quit_requested,
    suspended,
    resumed,
    window_resized,
    window_pixel_size_changed,
    window_focus_gained,
    window_focus_lost,
    input,
};

struct PlatformEvent final {
    PlatformEventType type{PlatformEventType::quit_requested};
    u32 source_id{};
    i32 value1{};
    i32 value2{};
    std::optional<InputEvent> input;
};

class Platform {
public:
    using Clock = std::chrono::steady_clock;
    using Duration = Clock::duration;
    using TimePoint = Clock::time_point;

    virtual ~Platform() = default;

    [[nodiscard]] virtual bool initialize() = 0;
    virtual void shutdown() noexcept = 0;
    [[nodiscard]] virtual bool poll_event(PlatformEvent& event) = 0;
    [[nodiscard]] virtual TimePoint now() const noexcept = 0;
    virtual void sleep_for(Duration duration) = 0;
};

} // namespace engine
