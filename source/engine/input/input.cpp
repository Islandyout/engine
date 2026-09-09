#include "engine/input/input.hpp"

#include <algorithm>
#include <type_traits>

namespace engine {
namespace {
template <typename E> constexpr usize index(E value) { return static_cast<usize>(value); }
}

void InputState::begin_frame() {
    keys_pressed_.fill(false); keys_released_.fill(false);
    mouse_pressed_.fill(false); mouse_released_.fill(false);
    mouse_delta_x_ = 0; mouse_delta_y_ = 0; wheel_x_ = 0; wheel_y_ = 0;
    text_.clear(); touches_.clear();
}

void InputState::apply(const InputEvent& event) {
    std::visit([this](const auto& value) {
        using T = std::decay_t<decltype(value)>;
        if constexpr (std::is_same_v<T, KeyEvent>) {
            if (value.key == Key::unknown) return;
            const auto i = index(value.key); const bool down = value.action == ButtonAction::pressed;
            if (down && !keys_[i]) keys_pressed_[i] = true;
            if (!down && keys_[i]) keys_released_[i] = true;
            keys_[i] = down;
        } else if constexpr (std::is_same_v<T, TextInputEvent>) {
            text_ += value.text;
        } else if constexpr (std::is_same_v<T, MouseMotionEvent>) {
            mouse_x_ = value.x; mouse_y_ = value.y;
            mouse_delta_x_ += value.delta_x; mouse_delta_y_ += value.delta_y;
        } else if constexpr (std::is_same_v<T, MouseButtonEvent>) {
            const auto i = index(value.button); const bool down = value.action == ButtonAction::pressed;
            if (down && !mouse_buttons_[i]) mouse_pressed_[i] = true;
            if (!down && mouse_buttons_[i]) mouse_released_[i] = true;
            mouse_buttons_[i] = down; mouse_x_ = value.x; mouse_y_ = value.y;
        } else if constexpr (std::is_same_v<T, MouseWheelEvent>) {
            wheel_x_ += value.x; wheel_y_ += value.y;
        } else if constexpr (std::is_same_v<T, TouchEvent>) {
            touches_.push_back(value);
        } else if constexpr (std::is_same_v<T, GamepadConnectionEvent>) {
            const auto found = std::find_if(gamepads_.begin(), gamepads_.end(), [&](const auto& pad) { return pad.id == value.device; });
            if (value.connection == GamepadConnection::connected && found == gamepads_.end()) gamepads_.push_back(GamepadState{value.device});
            if (value.connection == GamepadConnection::disconnected && found != gamepads_.end()) gamepads_.erase(found);
        } else if constexpr (std::is_same_v<T, GamepadButtonEvent>) {
            const auto found = std::find_if(gamepads_.begin(), gamepads_.end(), [&](const auto& pad) { return pad.id == value.device; });
            if (found != gamepads_.end()) found->buttons[index(value.button)] = value.action == ButtonAction::pressed;
        } else if constexpr (std::is_same_v<T, GamepadAxisEvent>) {
            const auto found = std::find_if(gamepads_.begin(), gamepads_.end(), [&](const auto& pad) { return pad.id == value.device; });
            if (found != gamepads_.end()) found->axes[index(value.axis)] = std::clamp(value.value, -1.0F, 1.0F);
        }
    }, event);
}

bool InputState::key_down(Key key) const noexcept { return key != Key::unknown && keys_[index(key)]; }
bool InputState::key_pressed(Key key) const noexcept { return key != Key::unknown && keys_pressed_[index(key)]; }
bool InputState::key_released(Key key) const noexcept { return key != Key::unknown && keys_released_[index(key)]; }
bool InputState::mouse_down(MouseButton button) const noexcept { return mouse_buttons_[index(button)]; }
bool InputState::mouse_pressed(MouseButton button) const noexcept { return mouse_pressed_[index(button)]; }
bool InputState::mouse_released(MouseButton button) const noexcept { return mouse_released_[index(button)]; }
} // namespace engine
