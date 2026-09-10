#include "engine/input/actions.hpp"

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <limits>
#include <sstream>
#include <stdexcept>
#include <type_traits>
#include <unordered_set>
#include <utility>

namespace engine {
namespace {

constexpr f32 action_threshold = 0.00001F;
constexpr usize maximum_identifier_length = 64;
constexpr usize maximum_chord_size = 8;

template <typename E> constexpr usize index(const E value) { return static_cast<usize>(value); }

template <typename E> constexpr bool valid_enum(const E value, const E count) { return index(value) < index(count); }

bool valid_identifier(const std::string_view value) {
    if (value.empty() || value.size() > maximum_identifier_length) {
        return false;
    }
    const auto valid_first = [](const char character) {
        return (character >= 'a' && character <= 'z') || (character >= 'A' && character <= 'Z') || character == '_';
    };
    const auto valid_rest = [&](const char character) {
        return valid_first(character) || (character >= '0' && character <= '9') || character == '.' || character == '-';
    };
    return valid_first(value.front()) && std::all_of(value.begin() + 1, value.end(), valid_rest);
}

bool finite(const f32 value) { return std::isfinite(value); }

std::string device_token(const std::optional<InputDeviceId> device) { return device ? std::to_string(*device) : "any"; }

void write_digital(std::ostream& output, const DigitalBinding& binding) {
    std::visit(
        [&](const auto& source) {
            using T = std::decay_t<decltype(source)>;
            if constexpr (std::is_same_v<T, KeyBinding>) {
                output << "key " << index(source.key);
            } else if constexpr (std::is_same_v<T, MouseButtonBinding>) {
                output << "mouse_button " << index(source.button);
            } else {
                output << "gamepad_button " << index(source.button) << ' ' << device_token(source.device);
            }
        },
        binding);
}

void write_source(std::ostream& output, const BindingSource& binding) {
    std::visit(
        [&](const auto& source) {
            using T = std::decay_t<decltype(source)>;
            if constexpr (std::is_same_v<T, KeyBinding>) {
                output << "key " << index(source.key);
            } else if constexpr (std::is_same_v<T, MouseButtonBinding>) {
                output << "mouse_button " << index(source.button);
            } else if constexpr (std::is_same_v<T, MouseAxisBinding>) {
                output << "mouse_axis " << index(source.axis);
            } else if constexpr (std::is_same_v<T, GamepadButtonBinding>) {
                output << "gamepad_button " << index(source.button) << ' ' << device_token(source.device);
            } else {
                output << "gamepad_axis " << index(source.axis) << ' ' << device_token(source.device);
            }
        },
        binding);
}

std::string binding_key(const ActionBinding& binding) {
    std::ostringstream output;
    output << std::setprecision(std::numeric_limits<f32>::max_digits10) << std::quoted(binding.action.value()) << ' ';
    write_source(output, binding.source);
    output << " processor " << binding.processor.dead_zone << ' ' << binding.processor.saturation << ' '
           << index(binding.processor.response) << ' ' << (binding.processor.invert ? 1 : 0) << ' '
           << binding.processor.scale << " chord " << binding.chord.size();
    auto chord = binding.chord;
    std::sort(chord.begin(), chord.end());
    for (const auto& modifier : chord) {
        output << ' ';
        write_digital(output, modifier);
    }
    return output.str();
}

bool parse_device(std::istream& input, std::optional<InputDeviceId>& device) {
    std::string token;
    if (!(input >> token)) {
        return false;
    }
    if (token == "any") {
        device.reset();
        return true;
    }
    std::istringstream number{token};
    InputDeviceId value{};
    if (!(number >> value) || number.peek() != std::char_traits<char>::eof()) {
        return false;
    }
    device = value;
    return true;
}

template <typename E> bool parse_enum(std::istream& input, const E count, E& value) {
    usize raw{};
    if (!(input >> raw) || raw >= index(count)) {
        return false;
    }
    value = static_cast<E>(raw);
    return true;
}

bool parse_digital(std::istream& input, DigitalBinding& binding) {
    std::string kind;
    if (!(input >> kind)) {
        return false;
    }
    if (kind == "key") {
        Key key{};
        if (!parse_enum(input, Key::count, key) || key == Key::unknown) {
            return false;
        }
        binding = KeyBinding{key};
        return true;
    }
    if (kind == "mouse_button") {
        MouseButton button{};
        if (!parse_enum(input, MouseButton::count, button)) {
            return false;
        }
        binding = MouseButtonBinding{button};
        return true;
    }
    if (kind == "gamepad_button") {
        GamepadButton button{};
        std::optional<InputDeviceId> device;
        if (!parse_enum(input, GamepadButton::count, button) || !parse_device(input, device)) {
            return false;
        }
        binding = GamepadButtonBinding{button, device};
        return true;
    }
    return false;
}

bool parse_source(std::istream& input, BindingSource& binding) {
    std::string kind;
    if (!(input >> kind)) {
        return false;
    }
    if (kind == "key") {
        Key key{};
        if (!parse_enum(input, Key::count, key) || key == Key::unknown) {
            return false;
        }
        binding = KeyBinding{key};
        return true;
    }
    if (kind == "mouse_button") {
        MouseButton button{};
        if (!parse_enum(input, MouseButton::count, button)) {
            return false;
        }
        binding = MouseButtonBinding{button};
        return true;
    }
    if (kind == "mouse_axis") {
        MouseAxis axis{};
        if (!parse_enum(input, MouseAxis::count, axis)) {
            return false;
        }
        binding = MouseAxisBinding{axis};
        return true;
    }
    if (kind == "gamepad_button") {
        GamepadButton button{};
        std::optional<InputDeviceId> device;
        if (!parse_enum(input, GamepadButton::count, button) || !parse_device(input, device)) {
            return false;
        }
        binding = GamepadButtonBinding{button, device};
        return true;
    }
    if (kind == "gamepad_axis") {
        GamepadAxis axis{};
        std::optional<InputDeviceId> device;
        if (!parse_enum(input, GamepadAxis::count, axis) || !parse_device(input, device)) {
            return false;
        }
        binding = GamepadAxisBinding{axis, device};
        return true;
    }
    return false;
}

bool digital_down(const DigitalBinding& binding, const InputState& input) {
    return std::visit(
        [&](const auto& source) {
            using T = std::decay_t<decltype(source)>;
            if constexpr (std::is_same_v<T, KeyBinding>) {
                return input.key_down(source.key);
            } else if constexpr (std::is_same_v<T, MouseButtonBinding>) {
                return input.mouse_down(source.button);
            } else {
                return input.gamepad_down(source.button, source.device);
            }
        },
        binding);
}

struct BindingSample final {
    f32 value{};
    bool pressed{};
    bool released{};
};

BindingSample sample_source(const BindingSource& binding, const InputState& input) {
    return std::visit(
        [&](const auto& source) -> BindingSample {
            using T = std::decay_t<decltype(source)>;
            if constexpr (std::is_same_v<T, KeyBinding>) {
                return {input.key_down(source.key) ? 1.0F : 0.0F, input.key_pressed(source.key),
                        input.key_released(source.key)};
            } else if constexpr (std::is_same_v<T, MouseButtonBinding>) {
                return {input.mouse_down(source.button) ? 1.0F : 0.0F, input.mouse_pressed(source.button),
                        input.mouse_released(source.button)};
            } else if constexpr (std::is_same_v<T, MouseAxisBinding>) {
                switch (source.axis) {
                case MouseAxis::delta_x:
                    return {input.mouse_delta_x(), false, false};
                case MouseAxis::delta_y:
                    return {input.mouse_delta_y(), false, false};
                case MouseAxis::wheel_x:
                    return {input.wheel_x(), false, false};
                case MouseAxis::wheel_y:
                    return {input.wheel_y(), false, false};
                case MouseAxis::count:
                    return {};
                }
            } else if constexpr (std::is_same_v<T, GamepadButtonBinding>) {
                return {input.gamepad_down(source.button, source.device) ? 1.0F : 0.0F,
                        input.gamepad_pressed(source.button, source.device),
                        input.gamepad_released(source.button, source.device)};
            } else {
                return {input.gamepad_axis(source.axis, source.device), false, false};
            }
            return {};
        },
        binding);
}

f32 process_value(f32 value, const AxisProcessor& processor) {
    const f32 sign = value < 0.0F ? -1.0F : 1.0F;
    const f32 magnitude = std::abs(value);
    if (magnitude <= processor.dead_zone) {
        return 0.0F;
    }
    f32 normalized =
        std::clamp((magnitude - processor.dead_zone) / (processor.saturation - processor.dead_zone), 0.0F, 1.0F);
    switch (processor.response) {
    case ResponseCurve::linear:
        break;
    case ResponseCurve::squared:
        normalized *= normalized;
        break;
    case ResponseCurve::cubic:
        normalized = normalized * normalized * normalized;
        break;
    }
    const f32 direction = processor.invert ? -sign : sign;
    return direction * normalized * processor.scale;
}

BindingSample sample_binding(const ActionBinding& binding, const InputState& input) {
    if (!std::all_of(binding.chord.begin(), binding.chord.end(),
                     [&](const auto& modifier) { return digital_down(modifier, input); })) {
        return {};
    }
    auto sample = sample_source(binding.source, input);
    sample.value = process_value(sample.value, binding.processor);
    return sample;
}

void canonicalize(InputMap& map) {
    std::sort(map.actions.begin(), map.actions.end());
    std::sort(map.contexts.begin(), map.contexts.end(), [](const auto& left, const auto& right) {
        if (left.priority != right.priority) {
            return left.priority > right.priority;
        }
        return left.id < right.id;
    });
    for (auto& context : map.contexts) {
        for (auto& binding : context.bindings) {
            std::sort(binding.chord.begin(), binding.chord.end());
        }
        std::sort(context.bindings.begin(), context.bindings.end(),
                  [](const auto& left, const auto& right) { return binding_key(left) < binding_key(right); });
    }
}

const ActionState empty_action_state{};

} // namespace

std::vector<InputMapIssue> validate_input_map(const InputMap& map) {
    std::vector<InputMapIssue> issues;
    std::unordered_set<std::string> actions;
    for (const auto& action : map.actions) {
        if (!valid_identifier(action.value())) {
            issues.push_back({0, "invalid action identifier: " + action.value()});
        } else if (!actions.insert(action.value()).second) {
            issues.push_back({0, "duplicate action identifier: " + action.value()});
        }
    }

    std::unordered_set<std::string> contexts;
    for (const auto& context : map.contexts) {
        if (!valid_identifier(context.id.value())) {
            issues.push_back({0, "invalid context identifier: " + context.id.value()});
        } else if (!contexts.insert(context.id.value()).second) {
            issues.push_back({0, "duplicate context identifier: " + context.id.value()});
        }

        for (const auto& binding : context.bindings) {
            if (!actions.contains(binding.action.value())) {
                issues.push_back({0, "binding references undeclared action: " + binding.action.value()});
            }
            const bool source_valid = std::visit(
                [](const auto& source) {
                    using T = std::decay_t<decltype(source)>;
                    if constexpr (std::is_same_v<T, KeyBinding>) {
                        return source.key != Key::unknown && valid_enum(source.key, Key::count);
                    } else if constexpr (std::is_same_v<T, MouseButtonBinding>) {
                        return valid_enum(source.button, MouseButton::count);
                    } else if constexpr (std::is_same_v<T, MouseAxisBinding>) {
                        return valid_enum(source.axis, MouseAxis::count);
                    } else if constexpr (std::is_same_v<T, GamepadButtonBinding>) {
                        return valid_enum(source.button, GamepadButton::count);
                    } else {
                        return valid_enum(source.axis, GamepadAxis::count);
                    }
                },
                binding.source);
            if (!source_valid) {
                issues.push_back({0, "binding has an invalid source for action: " + binding.action.value()});
            }
            if (!finite(binding.processor.dead_zone) || binding.processor.dead_zone < 0.0F ||
                binding.processor.dead_zone >= 1.0F) {
                issues.push_back({0, "dead zone must be finite and in [0, 1)"});
            }
            if (!finite(binding.processor.saturation) || binding.processor.saturation <= 0.0F ||
                binding.processor.saturation > 1.0F || binding.processor.saturation <= binding.processor.dead_zone) {
                issues.push_back({0, "saturation must be finite, above the dead zone, and at most 1"});
            }
            if (index(binding.processor.response) > index(ResponseCurve::cubic)) {
                issues.push_back({0, "binding has an invalid response curve"});
            }
            if (!finite(binding.processor.scale) || std::abs(binding.processor.scale) > 16.0F) {
                issues.push_back({0, "binding scale must be finite and within [-16, 16]"});
            }
            auto chord = binding.chord;
            if (chord.size() > maximum_chord_size) {
                issues.push_back({0, "binding chord cannot contain more than eight modifiers"});
            }
            std::sort(chord.begin(), chord.end());
            if (std::adjacent_find(chord.begin(), chord.end()) != chord.end()) {
                issues.push_back({0, "binding chord contains a duplicate modifier"});
            }
            for (const auto& modifier : binding.chord) {
                const bool modifier_valid = std::visit(
                    [](const auto& source) {
                        using T = std::decay_t<decltype(source)>;
                        if constexpr (std::is_same_v<T, KeyBinding>) {
                            return source.key != Key::unknown && valid_enum(source.key, Key::count);
                        } else if constexpr (std::is_same_v<T, MouseButtonBinding>) {
                            return valid_enum(source.button, MouseButton::count);
                        } else {
                            return valid_enum(source.button, GamepadButton::count);
                        }
                    },
                    modifier);
                if (!modifier_valid) {
                    issues.push_back({0, "binding chord contains an invalid modifier"});
                }
            }
        }
    }
    return issues;
}

std::string serialize_input_map(const InputMap& source_map) {
    const auto issues = validate_input_map(source_map);
    if (!issues.empty()) {
        throw std::invalid_argument{"cannot serialize an invalid input map: " + issues.front().message};
    }

    auto map = source_map;
    canonicalize(map);
    std::ostringstream output;
    output << "game_engine_input_map 1\n";
    for (const auto& action : map.actions) {
        output << "action " << std::quoted(action.value()) << '\n';
    }
    for (const auto& context : map.contexts) {
        output << "context " << std::quoted(context.id.value()) << ' ' << context.priority << ' '
               << (context.active ? 1 : 0) << '\n';
        for (const auto& binding : context.bindings) {
            output << "binding " << std::quoted(context.id.value()) << ' ' << binding_key(binding) << '\n';
        }
    }
    return output.str();
}

InputMapLoadResult deserialize_input_map(const std::string_view text) {
    InputMapLoadResult result;
    InputMap map;
    std::unordered_set<std::string> declared_contexts;
    std::istringstream input{std::string{text}};
    std::string line;
    usize line_number{};
    bool header_seen = false;
    while (std::getline(input, line)) {
        ++line_number;
        if (line.empty()) {
            continue;
        }
        std::istringstream row{line};
        std::string record;
        row >> record;
        if (!header_seen) {
            int version{};
            if (record != "game_engine_input_map" || !(row >> version) || version != 1) {
                result.issues.push_back({line_number, "expected input-map format header version 1"});
                return result;
            }
            std::string trailing;
            if (row >> trailing) {
                result.issues.push_back({line_number, "unexpected data after input-map header"});
                return result;
            }
            header_seen = true;
            continue;
        }

        if (record == "action") {
            std::string action;
            if (!(row >> std::quoted(action))) {
                result.issues.push_back({line_number, "malformed action record"});
                continue;
            }
            map.actions.emplace_back(std::move(action));
        } else if (record == "context") {
            std::string id;
            i32 priority{};
            int active{};
            if (!(row >> std::quoted(id) >> priority >> active) || (active != 0 && active != 1)) {
                result.issues.push_back({line_number, "malformed context record"});
                continue;
            }
            declared_contexts.insert(id);
            map.contexts.push_back({InputContextId{std::move(id)}, priority, active == 1, {}});
        } else if (record == "binding") {
            std::string context_id;
            std::string action_id;
            ActionBinding binding;
            std::string processor_tag;
            usize response{};
            int invert{};
            std::string chord_tag;
            usize chord_count{};
            if (!(row >> std::quoted(context_id) >> std::quoted(action_id)) || !parse_source(row, binding.source) ||
                !(row >> processor_tag) || processor_tag != "processor" ||
                !(row >> binding.processor.dead_zone >> binding.processor.saturation >> response >> invert >>
                  binding.processor.scale >> chord_tag >> chord_count) ||
                response > index(ResponseCurve::cubic) || (invert != 0 && invert != 1) || chord_tag != "chord") {
                result.issues.push_back({line_number, "malformed binding record"});
                continue;
            }
            if (chord_count > maximum_chord_size) {
                result.issues.push_back({line_number, "binding chord exceeds the eight-modifier limit"});
                continue;
            }
            binding.action = ActionId{std::move(action_id)};
            binding.processor.response = static_cast<ResponseCurve>(response);
            binding.processor.invert = invert == 1;
            bool chord_valid = true;
            for (usize modifier_index = 0; modifier_index < chord_count; ++modifier_index) {
                DigitalBinding modifier;
                if (!parse_digital(row, modifier)) {
                    chord_valid = false;
                    break;
                }
                binding.chord.push_back(std::move(modifier));
            }
            if (!chord_valid) {
                result.issues.push_back({line_number, "malformed binding chord"});
                continue;
            }
            const auto context = std::find_if(map.contexts.begin(), map.contexts.end(),
                                              [&](const auto& item) { return item.id.value() == context_id; });
            if (!declared_contexts.contains(context_id) || context == map.contexts.end()) {
                result.issues.push_back({line_number, "binding references an undeclared context"});
                continue;
            }
            context->bindings.push_back(std::move(binding));
        } else {
            result.issues.push_back({line_number, "unknown input-map record: " + record});
        }

        std::string trailing;
        if (row >> trailing) {
            result.issues.push_back({line_number, "unexpected trailing data"});
        }
    }
    if (!header_seen) {
        result.issues.push_back({0, "input map is empty"});
    }
    auto semantic_issues = validate_input_map(map);
    result.issues.insert(result.issues.end(), semantic_issues.begin(), semantic_issues.end());
    if (result.issues.empty()) {
        canonicalize(map);
        result.map = std::move(map);
    }
    return result;
}

bool ActionState::down() const noexcept { return std::abs(value) > action_threshold; }

ActionSystem::ActionSystem(InputMap map) : map_(std::move(map)) {
    const auto issues = validate_input_map(map_);
    if (!issues.empty()) {
        throw std::invalid_argument{"invalid input map: " + issues.front().message};
    }
    canonicalize(map_);
    states_.resize(map_.actions.size());
}

bool ActionSystem::set_context_active(const InputContextId& context_id, const bool active) noexcept {
    const auto context = std::find_if(map_.contexts.begin(), map_.contexts.end(),
                                      [&](const auto& item) { return item.id == context_id; });
    if (context == map_.contexts.end()) {
        return false;
    }
    context->active = active;
    return true;
}

void ActionSystem::update(const InputState& input) {
    for (usize action_index = 0; action_index < map_.actions.size(); ++action_index) {
        auto& state_value = states_[action_index];
        const bool was_down = state_value.down();
        state_value.previous_value = state_value.value;
        state_value.value = 0.0F;
        state_value.pressed = false;
        state_value.released = false;

        std::optional<i32> selected_priority;
        bool pulse_pressed = false;
        bool pulse_released = false;
        for (const auto& context : map_.contexts) {
            if (!context.active || (selected_priority && context.priority < *selected_priority)) {
                continue;
            }
            for (const auto& binding : context.bindings) {
                if (binding.action != map_.actions[action_index]) {
                    continue;
                }
                if (!selected_priority) {
                    selected_priority = context.priority;
                }
                const auto sample = sample_binding(binding, input);
                state_value.value += sample.value;
                pulse_pressed = pulse_pressed || sample.pressed;
                pulse_released = pulse_released || sample.released;
            }
        }
        state_value.value = std::clamp(state_value.value, -1.0F, 1.0F);
        const bool is_down = state_value.down();
        state_value.pressed = !was_down && (is_down || pulse_pressed);
        state_value.released = (was_down && !is_down) || (!was_down && !is_down && pulse_pressed && pulse_released);
    }
}

const ActionState& ActionSystem::state(const ActionId& action) const noexcept {
    const auto found = std::lower_bound(map_.actions.begin(), map_.actions.end(), action);
    if (found == map_.actions.end() || *found != action) {
        return empty_action_state;
    }
    return states_[static_cast<usize>(std::distance(map_.actions.begin(), found))];
}

} // namespace engine
