#include "engine/platform/sdl_platform.hpp"

#include "engine/core/log.hpp"

#include <SDL3/SDL.h>

#include <chrono>
#include <string>
#include <thread>
#include <utility>

namespace engine {

struct SdlPlatform::Impl final {
    explicit Impl(SdlPlatformConfig value) : config(std::move(value)) {}

    SdlPlatformConfig config;
    SDL_Window* window{};
    bool initialized{};
};

SdlPlatform::SdlPlatform(SdlPlatformConfig config)
    : impl_(std::make_unique<Impl>(std::move(config))) {}

SdlPlatform::~SdlPlatform() {
    shutdown();
}

bool SdlPlatform::initialize() {
    if (impl_->initialized) {
        return true;
    }

    if (!SDL_SetAppMetadata(
            impl_->config.application_name.c_str(),
            impl_->config.application_version.c_str(),
            impl_->config.application_identifier.c_str())) {
        Logger::instance().log(LogLevel::warning, "platform.sdl", SDL_GetError());
    }

    if (!SDL_Init(SDL_INIT_VIDEO | SDL_INIT_EVENTS)) {
        Logger::instance().log(LogLevel::error, "platform.sdl", SDL_GetError());
        return false;
    }

    SDL_WindowFlags flags = 0;
    if (impl_->config.resizable) {
        flags |= SDL_WINDOW_RESIZABLE;
    }
    if (impl_->config.high_pixel_density) {
        flags |= SDL_WINDOW_HIGH_PIXEL_DENSITY;
    }
    if (impl_->config.hidden) {
        flags |= SDL_WINDOW_HIDDEN;
    }

    impl_->window = SDL_CreateWindow(
        impl_->config.application_name.c_str(),
        impl_->config.window_width,
        impl_->config.window_height,
        flags);
    if (impl_->window == nullptr) {
        Logger::instance().log(LogLevel::error, "platform.sdl", SDL_GetError());
        SDL_Quit();
        return false;
    }

    impl_->initialized = true;
    Logger::instance().log(LogLevel::info, "platform.sdl", "Desktop window initialized");
    return true;
}

void SdlPlatform::shutdown() noexcept {
    if (!impl_ || !impl_->initialized) {
        return;
    }

    if (impl_->window != nullptr) {
        SDL_DestroyWindow(impl_->window);
        impl_->window = nullptr;
    }
    SDL_Quit();
    impl_->initialized = false;
}

bool SdlPlatform::poll_event(PlatformEvent& event) {
    SDL_Event sdl_event{};
    while (SDL_PollEvent(&sdl_event)) {
        event.source_id = 0;
        event.value1 = 0;
        event.value2 = 0;

        switch (sdl_event.type) {
        case SDL_EVENT_QUIT:
        case SDL_EVENT_TERMINATING:
            event.type = PlatformEventType::quit_requested;
            return true;
        case SDL_EVENT_WINDOW_CLOSE_REQUESTED:
            event.type = PlatformEventType::quit_requested;
            event.source_id = sdl_event.window.windowID;
            return true;
        case SDL_EVENT_WILL_ENTER_BACKGROUND:
        case SDL_EVENT_DID_ENTER_BACKGROUND:
            event.type = PlatformEventType::suspended;
            return true;
        case SDL_EVENT_WILL_ENTER_FOREGROUND:
        case SDL_EVENT_DID_ENTER_FOREGROUND:
            event.type = PlatformEventType::resumed;
            return true;
        case SDL_EVENT_WINDOW_RESIZED:
            event.type = PlatformEventType::window_resized;
            event.source_id = sdl_event.window.windowID;
            event.value1 = sdl_event.window.data1;
            event.value2 = sdl_event.window.data2;
            return true;
        case SDL_EVENT_WINDOW_PIXEL_SIZE_CHANGED:
            event.type = PlatformEventType::window_pixel_size_changed;
            event.source_id = sdl_event.window.windowID;
            event.value1 = sdl_event.window.data1;
            event.value2 = sdl_event.window.data2;
            return true;
        case SDL_EVENT_WINDOW_FOCUS_GAINED:
            event.type = PlatformEventType::window_focus_gained;
            event.source_id = sdl_event.window.windowID;
            return true;
        case SDL_EVENT_WINDOW_FOCUS_LOST:
            event.type = PlatformEventType::window_focus_lost;
            event.source_id = sdl_event.window.windowID;
            return true;
        default:
            break;
        }
    }
    return false;
}

Platform::TimePoint SdlPlatform::now() const noexcept {
    return Clock::now();
}

void SdlPlatform::sleep_for(const Duration duration) {
    if (duration > Duration::zero()) {
        std::this_thread::sleep_for(duration);
    }
}

bool SdlPlatform::is_initialized() const noexcept {
    return impl_ && impl_->initialized;
}

void* SdlPlatform::native_window_handle() const noexcept {
    return impl_ ? static_cast<void*>(impl_->window) : nullptr;
}

} // namespace engine
