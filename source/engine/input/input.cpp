#include "engine/input/input.hpp"

#include <algorithm>
#include <cmath>
#include <stdexcept>
#include <type_traits>
#include <utility>

namespace engine {
namespace {

template <typename E> constexpr usize index(const E value) { return static_cast<usize>(value); }

template <typename E> constexpr bool valid(const E value, const E count) { return index(value) < index(count); }

template <typename Predicate> bool any_gamepad(const std::vector<GamepadState>& gamepads, Predicate predicate) {
    return std::any_of(gamepads.begin(), gamepads.end(), predicate);
}

} // namespace

void InputState::reset() noexcept { *this = InputState{}; }

void InputState::begin_frame() {
    keys_pressed_.fill(false);
    keys_released_.fill(false);
    mouse_pressed_.fill(false);
    mouse_released_.fill(false);
    for (auto& gamepad : gamepads_) {
        gamepad.buttons_pressed.fill(false);
        gamepad.buttons_released.fill(false);
    }
    mouse_delta_x_ = 0.0F;
    mouse_delta_y_ = 0.0F;
    wheel_x_ = 0.0F;
    wheel_y_ = 0.0F;
    text_.clear();
    touches_.clear();
}

void InputState::apply(const InputEvent& event) {
    std::visit(
        [this](const auto& value) {
            using T = std::decay_t<decltype(value)>;
            if constexpr (std::is_same_v<T, KeyEvent>) {
                if (value.key == Key::unknown || !valid(value.key, Key::count)) {
                    return;
                }
                const auto key_index = index(value.key);
                const bool down = value.action == ButtonAction::pressed;
                if (down && !keys_[key_index]) {
                    keys_pressed_[key_index] = true;
                }
                if (!down && keys_[key_index]) {
                    keys_released_[key_index] = true;
                }
                keys_[key_index] = down;
            } else if constexpr (std::is_same_v<T, TextInputEvent>) {
                text_ += value.text;
            } else if constexpr (std::is_same_v<T, MouseMotionEvent>) {
                mouse_x_ = value.x;
                mouse_y_ = value.y;
                mouse_delta_x_ += value.delta_x;
                mouse_delta_y_ += value.delta_y;
            } else if constexpr (std::is_same_v<T, MouseButtonEvent>) {
                if (!valid(value.button, MouseButton::count)) {
                    return;
                }
                const auto button_index = index(value.button);
                const bool down = value.action == ButtonAction::pressed;
                if (down && !mouse_buttons_[button_index]) {
                    mouse_pressed_[button_index] = true;
                }
                if (!down && mouse_buttons_[button_index]) {
                    mouse_released_[button_index] = true;
                }
                mouse_buttons_[button_index] = down;
                mouse_x_ = value.x;
                mouse_y_ = value.y;
            } else if constexpr (std::is_same_v<T, MouseWheelEvent>) {
                wheel_x_ += value.x;
                wheel_y_ += value.y;
            } else if constexpr (std::is_same_v<T, TouchEvent>) {
                touches_.push_back(value);
            } else if constexpr (std::is_same_v<T, GamepadConnectionEvent>) {
                const auto found = std::find_if(gamepads_.begin(), gamepads_.end(),
                                                [&](const auto& gamepad) { return gamepad.id == value.device; });
                if (value.connection == GamepadConnection::connected && found == gamepads_.end()) {
                    gamepads_.push_back(GamepadState{value.device});
                    std::sort(gamepads_.begin(), gamepads_.end(),
                              [](const auto& left, const auto& right) { return left.id < right.id; });
                }
                if (value.connection == GamepadConnection::disconnected && found != gamepads_.end()) {
                    gamepads_.erase(found);
                }
            } else if constexpr (std::is_same_v<T, GamepadButtonEvent>) {
                if (!valid(value.button, GamepadButton::count)) {
                    return;
                }
                const auto found = std::find_if(gamepads_.begin(), gamepads_.end(),
                                                [&](const auto& gamepad) { return gamepad.id == value.device; });
                if (found != gamepads_.end()) {
                    const auto button_index = index(value.button);
                    const bool down = value.action == ButtonAction::pressed;
                    if (down && !found->buttons[button_index]) {
                        found->buttons_pressed[button_index] = true;
                    }
                    if (!down && found->buttons[button_index]) {
                        found->buttons_released[button_index] = true;
                    }
                    found->buttons[button_index] = down;
                }
            } else if constexpr (std::is_same_v<T, GamepadAxisEvent>) {
                if (!valid(value.axis, GamepadAxis::count)) {
                    return;
                }
                const auto found = std::find_if(gamepads_.begin(), gamepads_.end(),
                                                [&](const auto& gamepad) { return gamepad.id == value.device; });
                if (found != gamepads_.end() && std::isfinite(value.value)) {
                    found->axes[index(value.axis)] = std::clamp(value.value, -1.0F, 1.0F);
                }
            }
        },
        event);
}

bool InputState::key_down(const Key key) const noexcept {
    return key != Key::unknown && valid(key, Key::count) && keys_[index(key)];
}

bool InputState::key_pressed(const Key key) const noexcept {
    return key != Key::unknown && valid(key, Key::count) && keys_pressed_[index(key)];
}

bool InputState::key_released(const Key key) const noexcept {
    return key != Key::unknown && valid(key, Key::count) && keys_released_[index(key)];
}

bool InputState::mouse_down(const MouseButton button) const noexcept {
    return valid(button, MouseButton::count) && mouse_buttons_[index(button)];
}

bool InputState::mouse_pressed(const MouseButton button) const noexcept {
    return valid(button, MouseButton::count) && mouse_pressed_[index(button)];
}

bool InputState::mouse_released(const MouseButton button) const noexcept {
    return valid(button, MouseButton::count) && mouse_released_[index(button)];
}

bool InputState::gamepad_down(const GamepadButton button, const std::optional<InputDeviceId> device) const noexcept {
    if (!valid(button, GamepadButton::count)) {
        return false;
    }
    return any_gamepad(gamepads_, [&](const auto& gamepad) {
        return (!device || gamepad.id == *device) && gamepad.buttons[index(button)];
    });
}

bool InputState::gamepad_pressed(const GamepadButton button, const std::optional<InputDeviceId> device) const noexcept {
    if (!valid(button, GamepadButton::count)) {
        return false;
    }
    return any_gamepad(gamepads_, [&](const auto& gamepad) {
        return (!device || gamepad.id == *device) && gamepad.buttons_pressed[index(button)];
    });
}

bool InputState::gamepad_released(const GamepadButton button,
                                  const std::optional<InputDeviceId> device) const noexcept {
    if (!valid(button, GamepadButton::count)) {
        return false;
    }
    return any_gamepad(gamepads_, [&](const auto& gamepad) {
        return (!device || gamepad.id == *device) && gamepad.buttons_released[index(button)];
    });
}

f32 InputState::gamepad_axis(const GamepadAxis axis, const std::optional<InputDeviceId> device) const noexcept {
    if (!valid(axis, GamepadAxis::count)) {
        return 0.0F;
    }

    f32 selected = 0.0F;
    for (const auto& gamepad : gamepads_) {
        if (device && gamepad.id != *device) {
            continue;
        }
        const f32 candidate = gamepad.axes[index(axis)];
        if (std::abs(candidate) > std::abs(selected)) {
            selected = candidate;
        }
    }
    return selected;
}

InputReplay::InputReplay(std::vector<InputReplayFrame> frames) : frames_(std::move(frames)) {
    for (usize record = 1; record < frames_.size(); ++record) {
        if (frames_[record - 1].frame >= frames_[record].frame) {
            throw std::invalid_argument{"input replay frames must be strictly increasing and unique"};
        }
    }
}

void InputReplay::restart(InputState& state) noexcept {
    state.reset();
    next_record_ = 0;
    next_frame_ = 0;
}

bool InputReplay::inject_next(InputState& state) {
    state.begin_frame();
    bool injected = false;
    if (next_record_ < frames_.size() && frames_[next_record_].frame == next_frame_) {
        for (const auto& event : frames_[next_record_].events) {
            state.apply(event);
        }
        ++next_record_;
        injected = true;
    }
    ++next_frame_;
    return injected;
}

} // namespace engine
