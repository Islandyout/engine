#include "engine/input/actions.hpp"

#include <cmath>
#include <iostream>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

namespace {

using engine::ActionBinding;
using engine::ActionId;
using engine::AxisProcessor;
using engine::ButtonAction;
using engine::InputContext;
using engine::InputContextId;
using engine::InputMap;
using engine::Key;
using engine::KeyBinding;

void require(const bool condition, const std::string& message) {
    if (!condition) {
        throw std::runtime_error{message};
    }
}

void require_near(const float actual, const float expected, const std::string& message) {
    if (std::abs(actual - expected) > 0.0001F) {
        throw std::runtime_error{message};
    }
}

ActionBinding key_binding(std::string action, const Key key, const float scale = 1.0F,
                          std::vector<engine::DigitalBinding> chord = {}) {
    AxisProcessor processor;
    processor.scale = scale;
    return {ActionId{std::move(action)}, KeyBinding{key}, std::move(chord), processor};
}

InputMap basic_map() {
    InputContext gameplay{InputContextId{"gameplay"}, 10, true, {}};
    gameplay.bindings.push_back(key_binding("move_x", Key::d));
    gameplay.bindings.push_back(key_binding("move_x", Key::a, -1.0F));
    gameplay.bindings.push_back(
        ActionBinding{ActionId{"fire"}, engine::MouseButtonBinding{engine::MouseButton::left}, {}, {}});
    gameplay.bindings.push_back(
        key_binding("save", Key::s, 1.0F, {engine::DigitalBinding{KeyBinding{Key::left_control}}}));

    InputContext menu{InputContextId{"menu"}, 100, false, {}};
    menu.bindings.push_back(key_binding("fire", Key::enter));
    return {{ActionId{"save"}, ActionId{"fire"}, ActionId{"move_x"}}, {std::move(gameplay), std::move(menu)}};
}

void contexts_chords_and_transitions_are_deterministic() {
    engine::ActionSystem actions{basic_map()};
    engine::InputState input;
    input.begin_frame();
    input.apply(engine::KeyEvent{1, Key::d, ButtonAction::pressed, false});
    input.apply(engine::MouseButtonEvent{2, engine::MouseButton::left, ButtonAction::pressed, 1, 0.0F, 0.0F});
    input.apply(engine::KeyEvent{1, Key::s, ButtonAction::pressed, false});
    actions.update(input);
    require_near(actions.state(ActionId{"move_x"}).value, 1.0F, "keyboard binding must drive an action");
    require(actions.state(ActionId{"move_x"}).pressed, "inactive-to-active must produce a press edge");
    require(!actions.state(ActionId{"save"}).down(), "a chord must require all modifiers");
    require(actions.state(ActionId{"fire"}).down(), "mouse button must drive an action");

    input.begin_frame();
    input.apply(engine::KeyEvent{1, Key::left_control, ButtonAction::pressed, false});
    actions.update(input);
    require(actions.state(ActionId{"save"}).pressed, "held source must activate when its chord becomes complete");
    require(actions.set_context_active(InputContextId{"menu"}, true), "known context activation must succeed");

    input.begin_frame();
    actions.update(input);
    require(!actions.state(ActionId{"fire"}).down(),
            "higher-priority context must mask lower bindings for the same action");
    require(actions.state(ActionId{"fire"}).released, "priority masking must produce a deterministic release");
    require(!actions.set_context_active(InputContextId{"missing"}, true), "unknown context activation must fail");

    input.begin_frame();
    input.apply(engine::KeyEvent{1, Key::d, ButtonAction::released, false});
    actions.update(input);
    require(actions.state(ActionId{"move_x"}).released, "release transition must occur exactly once");
    input.begin_frame();
    actions.update(input);
    require(!actions.state(ActionId{"move_x"}).released, "release edge must clear on the next update");
}

void axes_devices_and_response_processing_are_stable() {
    AxisProcessor processed;
    processed.dead_zone = 0.2F;
    processed.saturation = 1.0F;
    processed.response = engine::ResponseCurve::squared;
    InputContext gameplay{
        InputContextId{"gameplay"},
        0,
        true,
        {
            {ActionId{"steer"}, engine::GamepadAxisBinding{engine::GamepadAxis::left_x, std::nullopt}, {}, processed},
            {ActionId{"look"},
             engine::MouseAxisBinding{engine::MouseAxis::delta_x},
             {},
             AxisProcessor{0.0F, 1.0F, engine::ResponseCurve::linear, true, 0.25F}},
            {ActionId{"jump"}, engine::GamepadButtonBinding{engine::GamepadButton::south, 9}, {}, {}},
        }};
    engine::ActionSystem actions{
        InputMap{{ActionId{"steer"}, ActionId{"look"}, ActionId{"jump"}}, {std::move(gameplay)}}};
    engine::InputState input;
    input.apply(engine::GamepadConnectionEvent{4, engine::GamepadConnection::connected});
    input.apply(engine::GamepadConnectionEvent{9, engine::GamepadConnection::connected});

    input.begin_frame();
    input.apply(engine::GamepadAxisEvent{4, engine::GamepadAxis::left_x, -0.6F});
    input.apply(engine::GamepadAxisEvent{9, engine::GamepadAxis::left_x, 0.6F});
    input.apply(engine::GamepadButtonEvent{9, engine::GamepadButton::south, ButtonAction::pressed});
    input.apply(engine::MouseMotionEvent{2, 10.0F, 2.0F, 2.0F, 0.0F});
    actions.update(input);
    require_near(actions.state(ActionId{"steer"}).value, -0.25F,
                 "any-device axis ties must select the lowest device ID and "
                 "apply the curve");
    require_near(actions.state(ActionId{"look"}).value, -0.25F,
                 "mouse axes must apply inversion, scaling, and saturation");
    require(actions.state(ActionId{"jump"}).pressed, "device-specific gamepad button must emit a press");

    input.begin_frame();
    input.apply(engine::GamepadAxisEvent{4, engine::GamepadAxis::left_x, 0.1F});
    input.apply(engine::GamepadAxisEvent{9, engine::GamepadAxis::left_x, 0.0F});
    input.apply(engine::GamepadButtonEvent{9, engine::GamepadButton::south, ButtonAction::released});
    actions.update(input);
    require_near(actions.state(ActionId{"steer"}).value, 0.0F, "dead zone must suppress small axis input");
    require(actions.state(ActionId{"jump"}).released, "gamepad release edge must reach the action layer");
}

void same_frame_taps_preserve_both_edges() {
    engine::ActionSystem actions{
        InputMap{{ActionId{"tap"}}, {{InputContextId{"gameplay"}, 0, true, {key_binding("tap", Key::space)}}}}};
    engine::InputState input;
    input.begin_frame();
    input.apply(engine::KeyEvent{1, Key::space, ButtonAction::pressed, false});
    input.apply(engine::KeyEvent{1, Key::space, ButtonAction::released, false});
    actions.update(input);
    const auto& tap = actions.state(ActionId{"tap"});
    require(!tap.down() && tap.pressed && tap.released,
            "press and release within one frame must preserve both action edges");
}

void serialization_is_canonical_and_validated() {
    const auto map = basic_map();
    const std::string serialized = engine::serialize_input_map(map);
    const auto loaded = engine::deserialize_input_map(serialized);
    require(loaded.valid(), "serialized input map must deserialize successfully");
    require(engine::serialize_input_map(*loaded.map) == serialized,
            "serialization must be byte-stable after a round trip");
    require(serialized.find("action \"fire\"") < serialized.find("action \"move_x\""),
            "actions must serialize in lexical order");
    require(serialized.find("context \"menu\"") < serialized.find("context \"gameplay\""),
            "contexts must serialize by priority then identifier");

    const auto malformed =
        engine::deserialize_input_map("game_engine_input_map 1\n"
                                      "action \"jump\"\n"
                                      "action \"jump\"\n"
                                      "context \"gameplay\" 0 1\n"
                                      "binding \"gameplay\" \"jump\" key 1 processor 1 1 0 0 1 chord 0\n");
    require(!malformed.valid() && malformed.issues.size() >= 2,
            "duplicate identifiers and invalid processors must be rejected");
}

std::vector<float> replay_values(engine::InputReplay replay) {
    engine::InputState input;
    engine::ActionSystem actions{
        InputMap{{ActionId{"move"}}, {{InputContextId{"gameplay"}, 0, true, {key_binding("move", Key::w)}}}}};
    replay.restart(input);
    std::vector<float> values;
    for (int frame = 0; frame < 4; ++frame) {
        static_cast<void>(replay.inject_next(input));
        actions.update(input);
        values.push_back(actions.state(ActionId{"move"}).value);
    }
    return values;
}

void replay_injection_is_repeatable() {
    engine::InputReplay replay{{
        {0, {engine::KeyEvent{1, Key::w, ButtonAction::pressed, false}}},
        {2, {engine::KeyEvent{1, Key::w, ButtonAction::released, false}}},
    }};
    const auto first = replay_values(replay);
    const auto second = replay_values(replay);
    require(first == std::vector<float>({1.0F, 1.0F, 0.0F, 0.0F}) && first == second,
            "replay must preserve held state through empty frames and repeat "
            "exactly");

    bool rejected = false;
    try {
        static_cast<void>(engine::InputReplay{{{2, {}}, {1, {}}}});
    } catch (const std::invalid_argument&) {
        rejected = true;
    }
    require(rejected, "replay must reject unsorted frame records");
}

} // namespace

int main() {
    try {
        contexts_chords_and_transitions_are_deterministic();
        axes_devices_and_response_processing_are_stable();
        same_frame_taps_preserve_both_edges();
        serialization_is_canonical_and_validated();
        replay_injection_is_repeatable();
    } catch (const std::exception& error) {
        std::cerr << "FAILED: " << error.what() << '\n';
        return 1;
    }
    std::cout << "All action and binding tests passed.\n";
    return 0;
}
