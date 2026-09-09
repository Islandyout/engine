#include "engine/platform/sdl_platform.hpp"

#include <SDL3/SDL.h>

#include <iostream>
#include <stdexcept>
#include <string>

namespace {

void require(const bool condition, const std::string& message) {
    if (!condition) {
        throw std::runtime_error{message};
    }
}

void drain_events(engine::SdlPlatform& platform) {
    engine::PlatformEvent event{};
    while (platform.poll_event(event)) {
    }
}

bool poll_until_type(
    engine::SdlPlatform& platform,
    const engine::PlatformEventType expected,
    engine::PlatformEvent& event) {
    constexpr int maximum_events = 32;
    for (int index = 0; index < maximum_events; ++index) {
        if (!platform.poll_event(event)) {
            return false;
        }
        if (event.type == expected) {
            return true;
        }
    }
    return false;
}

void hidden_window_lifecycle_and_events() {
    engine::SdlPlatformConfig config{};
    config.application_name = "Engine SDL Platform Test";
    config.hidden = true;
    config.window_width = 640;
    config.window_height = 360;

    engine::SdlPlatform platform{config};
    require(platform.initialize(), "SDL platform must initialize with the dummy video driver");
    require(platform.is_initialized(), "SDL platform must report initialized state");
    require(platform.native_window_handle() != nullptr, "SDL platform must create a window");
    drain_events(platform);

    auto* window = static_cast<SDL_Window*>(platform.native_window_handle());
    const SDL_WindowID window_id = SDL_GetWindowID(window);

    SDL_Event key_event{};
    key_event.type = SDL_EVENT_KEY_DOWN;
    key_event.key.windowID = window_id;
    key_event.key.which = 7;
    key_event.key.scancode = SDL_SCANCODE_A;
    key_event.key.down = true;
    require(SDL_PushEvent(&key_event), "test must enqueue a key event");
    engine::PlatformEvent translated{};
    require(poll_until_type(platform, engine::PlatformEventType::input, translated),
            "SDL key event must be translated");
    require(translated.input.has_value(), "translated input event must carry a payload");
    const auto* key = std::get_if<engine::KeyEvent>(&*translated.input);
    require(key && key->key == engine::Key::a && key->device == 7 &&
                key->action == engine::ButtonAction::pressed,
            "key translation must use engine-owned physical keys and device IDs");
    drain_events(platform);

    SDL_Event resize_event{};
    resize_event.type = SDL_EVENT_WINDOW_RESIZED;
    resize_event.window.windowID = window_id;
    resize_event.window.data1 = 800;
    resize_event.window.data2 = 450;
    require(SDL_PushEvent(&resize_event), "test must enqueue a resize event");

    require(poll_until_type(platform, engine::PlatformEventType::window_resized, translated),
            "SDL resize event must be translated");
    require(translated.type == engine::PlatformEventType::window_resized,
            "resize event must retain its engine event type");
    require(translated.source_id == window_id, "resize event must retain its window ID");
    require(translated.value1 == 800 && translated.value2 == 450,
            "resize event must retain its dimensions");
    drain_events(platform);

    SDL_Event quit_event{};
    quit_event.type = SDL_EVENT_WINDOW_CLOSE_REQUESTED;
    quit_event.window.windowID = window_id;
    require(SDL_PushEvent(&quit_event), "test must enqueue a window-close event");
    require(poll_until_type(platform, engine::PlatformEventType::quit_requested, translated),
            "SDL window-close event must map to the engine quit request");
    require(translated.source_id == window_id,
            "window-close event must retain its source window ID");

    platform.shutdown();
    require(!platform.is_initialized(), "shutdown must clear initialized state");
    require(platform.native_window_handle() == nullptr, "shutdown must destroy the window");
    platform.shutdown();
}

} // namespace

int main() {
    try {
        hidden_window_lifecycle_and_events();
    } catch (const std::exception& error) {
        std::cerr << "FAILED: " << error.what() << '\n';
        return 1;
    }

    std::cout << "All SDL platform tests passed.\n";
    return 0;
}
