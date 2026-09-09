#include "engine/input/input.hpp"

#include <iostream>
#include <stdexcept>
#include <string>

namespace {
void require(bool condition, const std::string& message) { if (!condition) throw std::runtime_error{message}; }

void frame_transitions_are_deterministic() {
    engine::InputState state;
    state.begin_frame();
    state.apply(engine::KeyEvent{1, engine::Key::a, engine::ButtonAction::pressed, false});
    state.apply(engine::MouseMotionEvent{2, 10, 20, 3, -2});
    state.apply(engine::MouseMotionEvent{2, 12, 25, 2, 5});
    state.apply(engine::MouseWheelEvent{2, 1, -2});
    state.apply(engine::TextInputEvent{1, "h"});
    state.apply(engine::TextInputEvent{1, "i"});
    require(state.key_down(engine::Key::a) && state.key_pressed(engine::Key::a), "press must set held and edge state");
    require(state.mouse_x() == 12 && state.mouse_y() == 25 && state.mouse_delta_x() == 5 && state.mouse_delta_y() == 3, "motion must retain position and accumulate deltas");
    require(state.wheel_x() == 1 && state.wheel_y() == -2 && state.text() == "hi", "frame text and wheel input must accumulate");

    state.begin_frame();
    require(state.key_down(engine::Key::a) && !state.key_pressed(engine::Key::a), "held state must survive a frame boundary");
    require(state.text().empty() && state.mouse_delta_x() == 0 && state.wheel_y() == 0, "transient state must clear each frame");
    state.apply(engine::KeyEvent{1, engine::Key::a, engine::ButtonAction::released, false});
    require(!state.key_down(engine::Key::a) && state.key_released(engine::Key::a), "release must update held and edge state");
}

void gamepad_lifecycle_is_stable() {
    engine::InputState state;
    state.apply(engine::GamepadConnectionEvent{42, engine::GamepadConnection::connected});
    state.apply(engine::GamepadConnectionEvent{42, engine::GamepadConnection::connected});
    state.apply(engine::GamepadButtonEvent{42, engine::GamepadButton::south, engine::ButtonAction::pressed});
    state.apply(engine::GamepadAxisEvent{42, engine::GamepadAxis::left_x, 2.0F});
    require(state.gamepads().size() == 1, "duplicate connection must not duplicate state");
    require(state.gamepads()[0].buttons[0] && state.gamepads()[0].axes[0] == 1.0F, "gamepad controls must update and clamp");
    state.apply(engine::GamepadConnectionEvent{42, engine::GamepadConnection::disconnected});
    require(state.gamepads().empty(), "disconnect must remove gamepad state");
}
}

int main() {
    try { frame_transitions_are_deterministic(); gamepad_lifecycle_is_stable(); }
    catch (const std::exception& error) { std::cerr << "FAILED: " << error.what() << '\n'; return 1; }
    std::cout << "All input tests passed.\n"; return 0;
}
