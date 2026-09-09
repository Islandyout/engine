#pragma once

#include "engine/platform/platform.hpp"

#include <atomic>

namespace engine {

class HeadlessPlatform final : public Platform {
public:
    [[nodiscard]] bool initialize() override;
    void shutdown() noexcept override;
    [[nodiscard]] bool poll_event(PlatformEvent& event) override;
    [[nodiscard]] TimePoint now() const noexcept override;
    void sleep_for(Duration duration) override;

    void request_quit() noexcept;
    [[nodiscard]] bool is_initialized() const noexcept;

private:
    std::atomic_bool initialized_{false};
    std::atomic_bool quit_requested_{false};
};

} // namespace engine

