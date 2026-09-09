#pragma once

#include "engine/core/types.hpp"

#include <array>
#include <string>
#include <variant>
#include <vector>

namespace engine {

using InputDeviceId = u64;

enum class Key : u16 {
    unknown, a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p, q, r, s, t, u, v, w, x, y, z,
    digit0, digit1, digit2, digit3, digit4, digit5, digit6, digit7, digit8, digit9,
    escape, enter, tab, backspace, space, left, right, up, down,
    left_shift, right_shift, left_control, right_control, left_alt, right_alt,
    f1, f2, f3, f4, f5, f6, f7, f8, f9, f10, f11, f12,
    count
};

enum class MouseButton : u8 { left, middle, right, extra1, extra2, count };
enum class ButtonAction : u8 { pressed, released };
enum class TouchPhase : u8 { began, moved, ended, cancelled };
enum class GamepadConnection : u8 { connected, disconnected };
enum class GamepadButton : u8 {
    south, east, west, north, back, guide, start, left_stick, right_stick,
    left_shoulder, right_shoulder, dpad_up, dpad_down, dpad_left, dpad_right, count
};
enum class GamepadAxis : u8 { left_x, left_y, right_x, right_y, left_trigger, right_trigger, count };

struct KeyEvent final { InputDeviceId device{}; Key key{Key::unknown}; ButtonAction action{}; bool repeat{}; };
struct TextInputEvent final { InputDeviceId device{}; std::string text; };
struct MouseMotionEvent final { InputDeviceId device{}; f32 x{}; f32 y{}; f32 delta_x{}; f32 delta_y{}; };
struct MouseButtonEvent final { InputDeviceId device{}; MouseButton button{}; ButtonAction action{}; u8 clicks{}; f32 x{}; f32 y{}; };
struct MouseWheelEvent final { InputDeviceId device{}; f32 x{}; f32 y{}; };
struct TouchEvent final { InputDeviceId device{}; u64 finger{}; TouchPhase phase{}; f32 x{}; f32 y{}; f32 delta_x{}; f32 delta_y{}; f32 pressure{}; };
struct GamepadConnectionEvent final { InputDeviceId device{}; GamepadConnection connection{}; };
struct GamepadButtonEvent final { InputDeviceId device{}; GamepadButton button{}; ButtonAction action{}; };
struct GamepadAxisEvent final { InputDeviceId device{}; GamepadAxis axis{}; f32 value{}; };

using InputEvent = std::variant<KeyEvent, TextInputEvent, MouseMotionEvent, MouseButtonEvent,
                                MouseWheelEvent, TouchEvent, GamepadConnectionEvent,
                                GamepadButtonEvent, GamepadAxisEvent>;

struct GamepadState final {
    InputDeviceId id{};
    std::array<bool, static_cast<usize>(GamepadButton::count)> buttons{};
    std::array<f32, static_cast<usize>(GamepadAxis::count)> axes{};
};

class InputState final {
public:
    void begin_frame();
    void apply(const InputEvent& event);
    [[nodiscard]] bool key_down(Key key) const noexcept;
    [[nodiscard]] bool key_pressed(Key key) const noexcept;
    [[nodiscard]] bool key_released(Key key) const noexcept;
    [[nodiscard]] bool mouse_down(MouseButton button) const noexcept;
    [[nodiscard]] bool mouse_pressed(MouseButton button) const noexcept;
    [[nodiscard]] bool mouse_released(MouseButton button) const noexcept;
    [[nodiscard]] f32 mouse_x() const noexcept { return mouse_x_; }
    [[nodiscard]] f32 mouse_y() const noexcept { return mouse_y_; }
    [[nodiscard]] f32 mouse_delta_x() const noexcept { return mouse_delta_x_; }
    [[nodiscard]] f32 mouse_delta_y() const noexcept { return mouse_delta_y_; }
    [[nodiscard]] f32 wheel_x() const noexcept { return wheel_x_; }
    [[nodiscard]] f32 wheel_y() const noexcept { return wheel_y_; }
    [[nodiscard]] const std::string& text() const noexcept { return text_; }
    [[nodiscard]] const std::vector<TouchEvent>& touches() const noexcept { return touches_; }
    [[nodiscard]] const std::vector<GamepadState>& gamepads() const noexcept { return gamepads_; }

private:
    static constexpr usize key_count = static_cast<usize>(Key::count);
    static constexpr usize mouse_button_count = static_cast<usize>(MouseButton::count);
    std::array<bool, key_count> keys_{};
    std::array<bool, key_count> keys_pressed_{};
    std::array<bool, key_count> keys_released_{};
    std::array<bool, mouse_button_count> mouse_buttons_{};
    std::array<bool, mouse_button_count> mouse_pressed_{};
    std::array<bool, mouse_button_count> mouse_released_{};
    f32 mouse_x_{}; f32 mouse_y_{}; f32 mouse_delta_x_{}; f32 mouse_delta_y_{};
    f32 wheel_x_{}; f32 wheel_y_{};
    std::string text_;
    std::vector<TouchEvent> touches_;
    std::vector<GamepadState> gamepads_;
};

} // namespace engine
