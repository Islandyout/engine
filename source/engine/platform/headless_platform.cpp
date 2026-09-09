#include "engine/platform/headless_platform.hpp"

#include <thread>

namespace engine {

bool HeadlessPlatform::initialize() {
    quit_requested_.store(false, std::memory_order_release);
    initialized_.store(true, std::memory_order_release);
    return true;
}

void HeadlessPlatform::shutdown() noexcept {
    initialized_.store(false, std::memory_order_release);
}

bool HeadlessPlatform::poll_event(PlatformEvent& event) {
    if (quit_requested_.exchange(false, std::memory_order_acq_rel)) {
        event.type = PlatformEventType::quit_requested;
        return true;
    }
    return false;
}

Platform::TimePoint HeadlessPlatform::now() const noexcept {
    return Clock::now();
}

void HeadlessPlatform::sleep_for(const Duration duration) {
    if (duration > Duration::zero()) {
        std::this_thread::sleep_for(duration);
    }
}

void HeadlessPlatform::request_quit() noexcept {
    quit_requested_.store(true, std::memory_order_release);
}

bool HeadlessPlatform::is_initialized() const noexcept {
    return initialized_.load(std::memory_order_acquire);
}

} // namespace engine

