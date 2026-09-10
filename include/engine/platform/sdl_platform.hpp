#pragma once

#include "engine/core/version.hpp"
#include "engine/platform/platform.hpp"

#include <memory>
#include <string>

namespace engine {

struct SdlPlatformConfig final {
    std::string application_name{"Game Engine"};
    std::string application_version{ENGINE_VERSION_STRING};
    std::string application_identifier{"com.islandyout.gameengine"};
    i32 window_width{1280};
    i32 window_height{720};
    bool resizable{true};
    bool high_pixel_density{true};
    bool hidden{false};
};

class SdlPlatform final : public Platform {
public:
    explicit SdlPlatform(SdlPlatformConfig config = {});
    ~SdlPlatform() override;

    SdlPlatform(const SdlPlatform&) = delete;
    SdlPlatform& operator=(const SdlPlatform&) = delete;
    SdlPlatform(SdlPlatform&&) = delete;
    SdlPlatform& operator=(SdlPlatform&&) = delete;

    [[nodiscard]] bool initialize() override;
    void shutdown() noexcept override;
    [[nodiscard]] bool poll_event(PlatformEvent& event) override;
    [[nodiscard]] TimePoint now() const noexcept override;
    void sleep_for(Duration duration) override;

    [[nodiscard]] bool is_initialized() const noexcept;
    [[nodiscard]] void* native_window_handle() const noexcept;

private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
};

} // namespace engine
