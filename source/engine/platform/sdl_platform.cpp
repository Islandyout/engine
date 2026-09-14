#include "engine/platform/sdl_platform.hpp"

#include "engine/core/log.hpp"

#include <SDL3/SDL.h>

#include <chrono>
#include <string>
#include <thread>
#include <utility>
#include <vector>

namespace engine {
namespace {

Key translate_key(const SDL_Scancode code) {
    if (code >= SDL_SCANCODE_A && code <= SDL_SCANCODE_Z)
        return static_cast<Key>(static_cast<int>(Key::a) + code - SDL_SCANCODE_A);
    if (code >= SDL_SCANCODE_1 && code <= SDL_SCANCODE_9)
        return static_cast<Key>(static_cast<int>(Key::digit1) + code - SDL_SCANCODE_1);
    switch (code) {
    case SDL_SCANCODE_0: return Key::digit0;
    case SDL_SCANCODE_ESCAPE: return Key::escape;
    case SDL_SCANCODE_RETURN: return Key::enter;
    case SDL_SCANCODE_TAB: return Key::tab;
    case SDL_SCANCODE_BACKSPACE: return Key::backspace;
    case SDL_SCANCODE_SPACE: return Key::space;
    case SDL_SCANCODE_LEFT: return Key::left;
    case SDL_SCANCODE_RIGHT: return Key::right;
    case SDL_SCANCODE_UP: return Key::up;
    case SDL_SCANCODE_DOWN: return Key::down;
    case SDL_SCANCODE_LSHIFT: return Key::left_shift;
    case SDL_SCANCODE_RSHIFT: return Key::right_shift;
    case SDL_SCANCODE_LCTRL: return Key::left_control;
    case SDL_SCANCODE_RCTRL: return Key::right_control;
    case SDL_SCANCODE_LALT: return Key::left_alt;
    case SDL_SCANCODE_RALT: return Key::right_alt;
    default:
        if (code >= SDL_SCANCODE_F1 && code <= SDL_SCANCODE_F12)
            return static_cast<Key>(static_cast<int>(Key::f1) + code - SDL_SCANCODE_F1);
        return Key::unknown;
    }
}

bool translate_mouse_button(Uint8 source, MouseButton& target) {
    switch (source) {
    case SDL_BUTTON_LEFT: target = MouseButton::left; return true;
    case SDL_BUTTON_MIDDLE: target = MouseButton::middle; return true;
    case SDL_BUTTON_RIGHT: target = MouseButton::right; return true;
    case SDL_BUTTON_X1: target = MouseButton::extra1; return true;
    case SDL_BUTTON_X2: target = MouseButton::extra2; return true;
    default: return false;
    }
}

} // namespace

struct SdlPlatform::Impl final {
    explicit Impl(SdlPlatformConfig value) : config(std::move(value)) {}

    SdlPlatformConfig config;
    SDL_Window* window{};
    std::vector<SDL_Gamepad*> gamepads;
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

    if (!SDL_Init(SDL_INIT_VIDEO | SDL_INIT_EVENTS | SDL_INIT_GAMEPAD)) {
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

bool SdlPlatform::present_rgba(std::span<const u8> pixels, i32 width, i32 height) {
    if (!impl_->window || width <= 0 || height <= 0 || width > 4096 || height > 4096 ||
        pixels.size() != static_cast<usize>(width) * static_cast<usize>(height) * 4)
        return false;
    auto *destination = SDL_GetWindowSurface(impl_->window);
    if (!destination)
        return false;
    auto *source = SDL_CreateSurfaceFrom(width, height, SDL_PIXELFORMAT_RGBA32,
                                         const_cast<u8 *>(pixels.data()), width * 4);
    if (!source)
        return false;
    const bool copied =
        SDL_BlitSurfaceScaled(source, nullptr, destination, nullptr, SDL_SCALEMODE_NEAREST);
    SDL_DestroySurface(source);
    return copied && SDL_UpdateWindowSurface(impl_->window);
}

void SdlPlatform::shutdown() noexcept {
    if (!impl_ || !impl_->initialized) {
        return;
    }

    for (auto* gamepad : impl_->gamepads) SDL_CloseGamepad(gamepad);
    impl_->gamepads.clear();
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
        event.input.reset();

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
        case SDL_EVENT_KEY_DOWN:
        case SDL_EVENT_KEY_UP:
            event.type = PlatformEventType::input;
            event.source_id = sdl_event.key.windowID;
            event.input = KeyEvent{sdl_event.key.which, translate_key(sdl_event.key.scancode),
                                   sdl_event.key.down ? ButtonAction::pressed : ButtonAction::released,
                                   sdl_event.key.repeat};
            return true;
        case SDL_EVENT_TEXT_INPUT:
            event.type = PlatformEventType::input;
            event.source_id = sdl_event.text.windowID;
            event.input = TextInputEvent{0, sdl_event.text.text ? sdl_event.text.text : ""};
            return true;
        case SDL_EVENT_MOUSE_MOTION:
            event.type = PlatformEventType::input; event.source_id = sdl_event.motion.windowID;
            event.input = MouseMotionEvent{sdl_event.motion.which, sdl_event.motion.x, sdl_event.motion.y,
                                           sdl_event.motion.xrel, sdl_event.motion.yrel};
            return true;
        case SDL_EVENT_MOUSE_BUTTON_DOWN:
        case SDL_EVENT_MOUSE_BUTTON_UP: {
            MouseButton button{};
            if (!translate_mouse_button(sdl_event.button.button, button)) break;
            event.type = PlatformEventType::input; event.source_id = sdl_event.button.windowID;
            event.input = MouseButtonEvent{sdl_event.button.which, button,
                sdl_event.button.down ? ButtonAction::pressed : ButtonAction::released,
                sdl_event.button.clicks, sdl_event.button.x, sdl_event.button.y};
            return true;
        }
        case SDL_EVENT_MOUSE_WHEEL: {
            const f32 direction = sdl_event.wheel.direction == SDL_MOUSEWHEEL_FLIPPED ? -1.0F : 1.0F;
            event.type = PlatformEventType::input; event.source_id = sdl_event.wheel.windowID;
            event.input = MouseWheelEvent{sdl_event.wheel.which, direction * sdl_event.wheel.x,
                                          direction * sdl_event.wheel.y};
            return true;
        }
        case SDL_EVENT_FINGER_DOWN:
        case SDL_EVENT_FINGER_MOTION:
        case SDL_EVENT_FINGER_UP:
        case SDL_EVENT_FINGER_CANCELED: {
            TouchPhase phase = TouchPhase::moved;
            if (sdl_event.type == SDL_EVENT_FINGER_DOWN) phase = TouchPhase::began;
            else if (sdl_event.type == SDL_EVENT_FINGER_UP) phase = TouchPhase::ended;
            else if (sdl_event.type == SDL_EVENT_FINGER_CANCELED) phase = TouchPhase::cancelled;
            event.type = PlatformEventType::input; event.source_id = sdl_event.tfinger.windowID;
            event.input = TouchEvent{static_cast<u64>(sdl_event.tfinger.touchID),
                static_cast<u64>(sdl_event.tfinger.fingerID), phase, sdl_event.tfinger.x,
                sdl_event.tfinger.y, sdl_event.tfinger.dx, sdl_event.tfinger.dy, sdl_event.tfinger.pressure};
            return true;
        }
        case SDL_EVENT_GAMEPAD_ADDED:
            event.type = PlatformEventType::input;
            if (auto* gamepad = SDL_OpenGamepad(sdl_event.gdevice.which)) impl_->gamepads.push_back(gamepad);
            event.input = GamepadConnectionEvent{static_cast<u64>(sdl_event.gdevice.which),
                GamepadConnection::connected};
            return true;
        case SDL_EVENT_GAMEPAD_REMOVED:
            event.type = PlatformEventType::input;
            for (auto iterator = impl_->gamepads.begin(); iterator != impl_->gamepads.end(); ++iterator) {
                if (SDL_GetGamepadID(*iterator) == sdl_event.gdevice.which) {
                    SDL_CloseGamepad(*iterator); impl_->gamepads.erase(iterator); break;
                }
            }
            event.input = GamepadConnectionEvent{static_cast<u64>(sdl_event.gdevice.which),
                GamepadConnection::disconnected};
            return true;
        case SDL_EVENT_GAMEPAD_BUTTON_DOWN:
        case SDL_EVENT_GAMEPAD_BUTTON_UP:
            if (sdl_event.gbutton.button >= SDL_GAMEPAD_BUTTON_DPAD_RIGHT + 1) break;
            event.type = PlatformEventType::input;
            event.input = GamepadButtonEvent{static_cast<u64>(sdl_event.gbutton.which),
                static_cast<GamepadButton>(sdl_event.gbutton.button),
                sdl_event.gbutton.down ? ButtonAction::pressed : ButtonAction::released};
            return true;
        case SDL_EVENT_GAMEPAD_AXIS_MOTION:
            if (sdl_event.gaxis.axis >= SDL_GAMEPAD_AXIS_COUNT) break;
            event.type = PlatformEventType::input;
            event.input = GamepadAxisEvent{static_cast<u64>(sdl_event.gaxis.which),
                static_cast<GamepadAxis>(sdl_event.gaxis.axis),
                sdl_event.gaxis.value < 0 ? static_cast<f32>(sdl_event.gaxis.value) / 32768.0F
                                          : static_cast<f32>(sdl_event.gaxis.value) / 32767.0F};
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
