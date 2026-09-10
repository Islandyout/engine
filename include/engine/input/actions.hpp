#pragma once

#include "engine/input/input.hpp"

#include <compare>
#include <optional>
#include <string>
#include <string_view>
#include <utility>
#include <variant>
#include <vector>

namespace engine {

using ActionValue = f32;

class ActionId final {
public:
    ActionId() = default;
    explicit ActionId(std::string value) : value_(std::move(value)) {}

    [[nodiscard]] const std::string& value() const noexcept { return value_; }
    [[nodiscard]] bool empty() const noexcept { return value_.empty(); }
    auto operator<=>(const ActionId&) const = default;

private:
    std::string value_;
};

class InputContextId final {
public:
    InputContextId() = default;
    explicit InputContextId(std::string value) : value_(std::move(value)) {}

    [[nodiscard]] const std::string& value() const noexcept { return value_; }
    [[nodiscard]] bool empty() const noexcept { return value_.empty(); }
    auto operator<=>(const InputContextId&) const = default;

private:
    std::string value_;
};

enum class MouseAxis : u8 { delta_x, delta_y, wheel_x, wheel_y, count };
enum class ResponseCurve : u8 { linear, squared, cubic };

struct KeyBinding final {
    Key key{Key::unknown};
    auto operator<=>(const KeyBinding&) const = default;
};
struct MouseButtonBinding final {
    MouseButton button{};
    auto operator<=>(const MouseButtonBinding&) const = default;
};
struct GamepadButtonBinding final {
    GamepadButton button{};
    std::optional<InputDeviceId> device;
    auto operator<=>(const GamepadButtonBinding&) const = default;
};

using DigitalBinding = std::variant<KeyBinding, MouseButtonBinding, GamepadButtonBinding>;

struct MouseAxisBinding final {
    MouseAxis axis{};
    auto operator<=>(const MouseAxisBinding&) const = default;
};
struct GamepadAxisBinding final {
    GamepadAxis axis{};
    std::optional<InputDeviceId> device;
    auto operator<=>(const GamepadAxisBinding&) const = default;
};

using BindingSource =
    std::variant<KeyBinding, MouseButtonBinding, MouseAxisBinding, GamepadButtonBinding, GamepadAxisBinding>;

struct AxisProcessor final {
    f32 dead_zone{};
    f32 saturation{1.0F};
    ResponseCurve response{ResponseCurve::linear};
    bool invert{};
    f32 scale{1.0F};
};

struct ActionBinding final {
    ActionId action;
    BindingSource source;
    std::vector<DigitalBinding> chord;
    AxisProcessor processor;
};

struct InputContext final {
    InputContextId id;
    i32 priority{};
    bool active{true};
    std::vector<ActionBinding> bindings;
};

struct InputMap final {
    std::vector<ActionId> actions;
    std::vector<InputContext> contexts;
};

struct InputMapIssue final {
    usize line{};
    std::string message;
};

struct InputMapLoadResult final {
    std::optional<InputMap> map;
    std::vector<InputMapIssue> issues;
    [[nodiscard]] bool valid() const noexcept { return map.has_value() && issues.empty(); }
};

[[nodiscard]] std::vector<InputMapIssue> validate_input_map(const InputMap& map);
[[nodiscard]] std::string serialize_input_map(const InputMap& map);
[[nodiscard]] InputMapLoadResult deserialize_input_map(std::string_view text);

struct ActionState final {
    ActionValue value{};
    ActionValue previous_value{};
    bool pressed{};
    bool released{};

    [[nodiscard]] bool down() const noexcept;
};

class ActionSystem final {
public:
    explicit ActionSystem(InputMap map);

    [[nodiscard]] bool set_context_active(const InputContextId& context, bool active) noexcept;
    void update(const InputState& input);
    [[nodiscard]] const ActionState& state(const ActionId& action) const noexcept;
    [[nodiscard]] const InputMap& map() const noexcept { return map_; }

private:
    InputMap map_;
    std::vector<ActionState> states_;
};

} // namespace engine
