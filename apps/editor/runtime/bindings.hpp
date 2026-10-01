#pragma once

// Friendly action bindings for the editor runtime (0.55.0), parsed into the
// engine's native InputMap so engine::ActionSystem evaluates them:
//
//   jump: space, pad_a
//   move_x: d, -a, right, -left, pad_lx
//   look_x: mouse_dx*0.05, pad_rx
//
// One action per line: `name: source, source, ...`. A leading `-` inverts a
// source; a trailing `*N` scales it. Keys: a-z, 0-9, space, enter, escape,
// tab, backspace, up, down, left, right, shift, rshift, ctrl, rctrl, alt,
// ralt, f1-f12. Mouse: mouse_left, mouse_middle, mouse_right, mouse_dx,
// mouse_dy, wheel. Gamepad: pad_a, pad_b, pad_x, pad_y, pad_lb, pad_rb,
// pad_back, pad_start, pad_ls, pad_rs, pad_up, pad_down, pad_left,
// pad_right, pad_lx, pad_ly, pad_rx, pad_ry, pad_lt, pad_rt. Stick axes get
// a 0.15 dead zone. `#` starts a comment.

#include "engine/input/actions.hpp"

#include <cstdlib>
#include <map>
#include <optional>
#include <string>
#include <string_view>

namespace editor_bindings {

// Kept in sync with defaultComponent("InputActions") in
// apps/editor/src/authoring/CommandInterpreter.ts.
inline constexpr const char *default_text = "move_x: d, -a, right, -left, pad_lx\n"
                                            "move_y: w, -s, up, -down, -pad_ly\n"
                                            "look_x: mouse_dx*0.05, pad_rx\n"
                                            "look_y: mouse_dy*0.05, pad_ry\n"
                                            "jump: space, pad_a\n"
                                            "fire: mouse_left, pad_rt, pad_x\n"
                                            "interact: e, pad_y\n"
                                            "sprint: shift, pad_lb\n"
                                            "crouch: c, ctrl, pad_b\n"
                                            "aim: mouse_right, pad_lt\n"
                                            "reload: r, pad_rb\n"
                                            "next_weapon: q, pad_up\n"
                                            "weapon_scroll: wheel\n";

inline std::optional<engine::BindingSource> source_named(std::string_view name) {
    using engine::GamepadAxis;
    using engine::GamepadButton;
    using engine::Key;
    if (name.size() == 1 && name[0] >= 'a' && name[0] <= 'z')
        return engine::KeyBinding{static_cast<Key>(static_cast<int>(Key::a) + (name[0] - 'a'))};
    if (name.size() == 1 && name[0] >= '0' && name[0] <= '9')
        return engine::KeyBinding{static_cast<Key>(static_cast<int>(Key::digit0) + (name[0] - '0'))};
    if (name.size() >= 2 && name[0] == 'f') {
        const int n = std::atoi(std::string(name.substr(1)).c_str());
        if (n >= 1 && n <= 12 && std::to_string(n) == name.substr(1))
            return engine::KeyBinding{static_cast<Key>(static_cast<int>(Key::f1) + n - 1)};
    }
    static const std::map<std::string_view, engine::BindingSource> named{
        {"space", engine::KeyBinding{Key::space}},
        {"enter", engine::KeyBinding{Key::enter}},
        {"escape", engine::KeyBinding{Key::escape}},
        {"tab", engine::KeyBinding{Key::tab}},
        {"backspace", engine::KeyBinding{Key::backspace}},
        {"up", engine::KeyBinding{Key::up}},
        {"down", engine::KeyBinding{Key::down}},
        {"left", engine::KeyBinding{Key::left}},
        {"right", engine::KeyBinding{Key::right}},
        {"shift", engine::KeyBinding{Key::left_shift}},
        {"rshift", engine::KeyBinding{Key::right_shift}},
        {"ctrl", engine::KeyBinding{Key::left_control}},
        {"rctrl", engine::KeyBinding{Key::right_control}},
        {"alt", engine::KeyBinding{Key::left_alt}},
        {"ralt", engine::KeyBinding{Key::right_alt}},
        {"mouse_left", engine::MouseButtonBinding{engine::MouseButton::left}},
        {"mouse_middle", engine::MouseButtonBinding{engine::MouseButton::middle}},
        {"mouse_right", engine::MouseButtonBinding{engine::MouseButton::right}},
        {"mouse_dx", engine::MouseAxisBinding{engine::MouseAxis::delta_x}},
        {"mouse_dy", engine::MouseAxisBinding{engine::MouseAxis::delta_y}},
        {"wheel", engine::MouseAxisBinding{engine::MouseAxis::wheel_y}},
        {"pad_a", engine::GamepadButtonBinding{GamepadButton::south, {}}},
        {"pad_b", engine::GamepadButtonBinding{GamepadButton::east, {}}},
        {"pad_x", engine::GamepadButtonBinding{GamepadButton::west, {}}},
        {"pad_y", engine::GamepadButtonBinding{GamepadButton::north, {}}},
        {"pad_lb", engine::GamepadButtonBinding{GamepadButton::left_shoulder, {}}},
        {"pad_rb", engine::GamepadButtonBinding{GamepadButton::right_shoulder, {}}},
        {"pad_back", engine::GamepadButtonBinding{GamepadButton::back, {}}},
        {"pad_start", engine::GamepadButtonBinding{GamepadButton::start, {}}},
        {"pad_ls", engine::GamepadButtonBinding{GamepadButton::left_stick, {}}},
        {"pad_rs", engine::GamepadButtonBinding{GamepadButton::right_stick, {}}},
        {"pad_up", engine::GamepadButtonBinding{GamepadButton::dpad_up, {}}},
        {"pad_down", engine::GamepadButtonBinding{GamepadButton::dpad_down, {}}},
        {"pad_left", engine::GamepadButtonBinding{GamepadButton::dpad_left, {}}},
        {"pad_right", engine::GamepadButtonBinding{GamepadButton::dpad_right, {}}},
        {"pad_lx", engine::GamepadAxisBinding{GamepadAxis::left_x, {}}},
        {"pad_ly", engine::GamepadAxisBinding{GamepadAxis::left_y, {}}},
        {"pad_rx", engine::GamepadAxisBinding{GamepadAxis::right_x, {}}},
        {"pad_ry", engine::GamepadAxisBinding{GamepadAxis::right_y, {}}},
        {"pad_lt", engine::GamepadAxisBinding{GamepadAxis::left_trigger, {}}},
        {"pad_rt", engine::GamepadAxisBinding{GamepadAxis::right_trigger, {}}},
    };
    const auto found = named.find(name);
    if (found == named.end())
        return std::nullopt;
    return found->second;
}

inline std::string trim(std::string_view text) {
    const auto first = text.find_first_not_of(" \t\r");
    if (first == std::string_view::npos)
        return {};
    const auto last = text.find_last_not_of(" \t\r");
    return std::string(text.substr(first, last - first + 1));
}

// Parses binding text into a one-context InputMap. On any error returns
// std::nullopt and sets `error` to "line N: what went wrong".
inline std::optional<engine::InputMap> parse(std::string_view text, std::string &error) {
    engine::InputMap map;
    engine::InputContext context;
    context.id = engine::InputContextId{"gameplay"};
    std::size_t line_number = 0;
    std::size_t start = 0;
    while (start <= text.size()) {
        auto end = text.find('\n', start);
        if (end == std::string_view::npos)
            end = text.size();
        ++line_number;
        std::string line(text.substr(start, end - start));
        start = end + 1;
        if (const auto hash = line.find('#'); hash != std::string::npos)
            line.resize(hash);
        line = trim(line);
        if (line.empty())
            continue;
        const auto where = "line " + std::to_string(line_number) + ": ";
        const auto colon = line.find(':');
        const std::string action = colon == std::string::npos ? "" : trim(std::string_view(line).substr(0, colon));
        if (action.empty() || action.find_first_of(" \t\"") != std::string::npos) {
            error = where + "expected \"action: source, source\"";
            return std::nullopt;
        }
        map.actions.push_back(engine::ActionId{action});
        std::string_view rest = std::string_view(line).substr(colon + 1);
        while (!rest.empty()) {
            const auto comma = rest.find(',');
            std::string item = trim(rest.substr(0, comma));
            rest = comma == std::string_view::npos ? std::string_view{} : rest.substr(comma + 1);
            if (item.empty())
                continue;
            engine::AxisProcessor processor;
            if (item[0] == '-') {
                processor.invert = true;
                item = trim(std::string_view(item).substr(1));
            }
            if (const auto star = item.find('*'); star != std::string::npos) {
                char *parsed = nullptr;
                const std::string factor = item.substr(star + 1);
                processor.scale = std::strtof(factor.c_str(), &parsed);
                if (parsed == factor.c_str() || *parsed != '\0' || !(processor.scale > 0)) {
                    error = where + "bad scale in \"" + item + "\"";
                    return std::nullopt;
                }
                item = trim(std::string_view(item).substr(0, star));
            }
            const auto source = source_named(item);
            if (!source) {
                error = where + "unknown input \"" + item + "\"";
                return std::nullopt;
            }
            if (const auto *axis = std::get_if<engine::GamepadAxisBinding>(&*source);
                axis && axis->axis != engine::GamepadAxis::left_trigger &&
                axis->axis != engine::GamepadAxis::right_trigger)
                processor.dead_zone = 0.15F;
            context.bindings.push_back({engine::ActionId{action}, *source, {}, processor});
        }
    }
    map.contexts.push_back(std::move(context));
    if (const auto issues = engine::validate_input_map(map); !issues.empty()) {
        error = issues.front().message;
        return std::nullopt;
    }
    return map;
}

} // namespace editor_bindings
