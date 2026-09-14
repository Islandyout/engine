#include "engine/scene/scene_document.hpp"

#include <cmath>
#include <utility>
#include <variant>

namespace engine {
namespace {

constexpr usize max_entities = 1024;
constexpr std::string_view known_components[] = {
    "Transform", "Rotation",   "Scale",    "Velocity",       "Acceleration", "RigidBody",
    "Collider",  "Health",     "AIState",  "Pedestrian",     "Vehicle",      "AnimationState",
    "Renderable", "Name",      "Parent"};

bool is_known_component(std::string_view name) {
    for (const auto candidate : known_components)
        if (candidate == name)
            return true;
    return false;
}

// ---- a minimal JSON value model, scoped to what scene documents need ----

struct Json;
using JsonArray = std::vector<Json>;
using JsonObject = std::vector<std::pair<std::string, Json>>; // small N; order preserved

struct Json {
    std::variant<std::nullptr_t, bool, double, std::string, JsonArray, JsonObject> value{nullptr};

    [[nodiscard]] bool is_object() const { return std::holds_alternative<JsonObject>(value); }
    [[nodiscard]] bool is_array() const { return std::holds_alternative<JsonArray>(value); }
    [[nodiscard]] bool is_string() const { return std::holds_alternative<std::string>(value); }
    [[nodiscard]] bool is_number() const { return std::holds_alternative<double>(value); }
    [[nodiscard]] bool is_bool() const { return std::holds_alternative<bool>(value); }

    [[nodiscard]] const JsonObject &object() const { return std::get<JsonObject>(value); }
    [[nodiscard]] const JsonArray &array() const { return std::get<JsonArray>(value); }
    [[nodiscard]] const std::string &string() const { return std::get<std::string>(value); }
    [[nodiscard]] double number() const { return std::get<double>(value); }
    [[nodiscard]] bool boolean() const { return std::get<bool>(value); }

    [[nodiscard]] const Json *find(std::string_view key) const {
        if (!is_object())
            return nullptr;
        for (const auto &entry : object())
            if (entry.first == key)
                return &entry.second;
        return nullptr;
    }
};

class JsonParser final {
public:
    explicit JsonParser(std::string_view text) : text_(text) {}

    Json parse() {
        auto value = parse_value();
        skip_whitespace();
        if (pos_ != text_.size())
            fail("trailing content after JSON value");
        return value;
    }

private:
    std::string_view text_;
    usize pos_{};

    [[noreturn]] void fail(const char *message) const {
        throw std::runtime_error{std::string{"scene JSON: "} + message};
    }
    [[nodiscard]] bool eof() const { return pos_ >= text_.size(); }
    [[nodiscard]] char peek() const {
        if (eof())
            fail("unexpected end of input");
        return text_[pos_];
    }
    char take() {
        const char c = peek();
        ++pos_;
        return c;
    }
    void expect(char c) {
        if (take() != c)
            fail("unexpected character");
    }
    void skip_whitespace() {
        while (!eof() && (text_[pos_] == ' ' || text_[pos_] == '\t' || text_[pos_] == '\n' ||
                          text_[pos_] == '\r'))
            ++pos_;
    }
    [[nodiscard]] bool consume_literal(std::string_view literal) {
        if (text_.substr(pos_, literal.size()) != literal)
            return false;
        pos_ += literal.size();
        return true;
    }

    Json parse_value() {
        skip_whitespace();
        if (eof())
            fail("unexpected end of input");
        switch (peek()) {
        case '{':
            return parse_object();
        case '[':
            return parse_array();
        case '"':
            return Json{parse_string()};
        case 't':
            if (!consume_literal("true"))
                fail("invalid literal");
            return Json{true};
        case 'f':
            if (!consume_literal("false"))
                fail("invalid literal");
            return Json{false};
        case 'n':
            if (!consume_literal("null"))
                fail("invalid literal");
            return Json{nullptr};
        default:
            return Json{parse_number()};
        }
    }

    Json parse_object() {
        expect('{');
        JsonObject result;
        skip_whitespace();
        if (!eof() && peek() == '}') {
            take();
            return Json{std::move(result)};
        }
        while (true) {
            skip_whitespace();
            if (peek() != '"')
                fail("expected string key");
            auto key = parse_string();
            skip_whitespace();
            expect(':');
            auto value = parse_value();
            result.emplace_back(std::move(key), std::move(value));
            skip_whitespace();
            const char c = take();
            if (c == ',')
                continue;
            if (c == '}')
                break;
            fail("expected ',' or '}'");
        }
        return Json{std::move(result)};
    }

    Json parse_array() {
        expect('[');
        JsonArray result;
        skip_whitespace();
        if (!eof() && peek() == ']') {
            take();
            return Json{std::move(result)};
        }
        while (true) {
            result.push_back(parse_value());
            skip_whitespace();
            const char c = take();
            if (c == ',')
                continue;
            if (c == ']')
                break;
            fail("expected ',' or ']'");
        }
        return Json{std::move(result)};
    }

    std::string parse_string() {
        expect('"');
        std::string result;
        while (true) {
            if (eof())
                fail("unterminated string");
            const char c = take();
            if (c == '"')
                break;
            if (static_cast<unsigned char>(c) < 0x20)
                fail("control character in string");
            if (c != '\\') {
                result.push_back(c);
                continue;
            }
            if (eof())
                fail("unterminated escape");
            const char escape = take();
            switch (escape) {
            case '"':
                result.push_back('"');
                break;
            case '\\':
                result.push_back('\\');
                break;
            case '/':
                result.push_back('/');
                break;
            case 'b':
                result.push_back('\b');
                break;
            case 'f':
                result.push_back('\f');
                break;
            case 'n':
                result.push_back('\n');
                break;
            case 'r':
                result.push_back('\r');
                break;
            case 't':
                result.push_back('\t');
                break;
            case 'u': {
                if (pos_ + 4 > text_.size())
                    fail("invalid unicode escape");
                unsigned code = 0;
                for (int i = 0; i < 4; ++i) {
                    const char hex = text_[pos_++];
                    code <<= 4;
                    if (hex >= '0' && hex <= '9')
                        code |= static_cast<unsigned>(hex - '0');
                    else if (hex >= 'a' && hex <= 'f')
                        code |= static_cast<unsigned>(hex - 'a' + 10);
                    else if (hex >= 'A' && hex <= 'F')
                        code |= static_cast<unsigned>(hex - 'A' + 10);
                    else
                        fail("invalid unicode escape");
                }
                // Basic Multilingual Plane only; scene names/strings do not
                // need surrogate-pair support here.
                if (code < 0x80) {
                    result.push_back(static_cast<char>(code));
                } else if (code < 0x800) {
                    result.push_back(static_cast<char>(0xC0 | (code >> 6)));
                    result.push_back(static_cast<char>(0x80 | (code & 0x3F)));
                } else {
                    result.push_back(static_cast<char>(0xE0 | (code >> 12)));
                    result.push_back(static_cast<char>(0x80 | ((code >> 6) & 0x3F)));
                    result.push_back(static_cast<char>(0x80 | (code & 0x3F)));
                }
                break;
            }
            default:
                fail("invalid escape");
            }
        }
        return result;
    }

    double parse_number() {
        const usize start = pos_;
        if (!eof() && peek() == '-')
            ++pos_;
        if (eof() || !is_digit(peek()))
            fail("invalid number");
        while (!eof() && is_digit(peek()))
            ++pos_;
        if (!eof() && peek() == '.') {
            ++pos_;
            if (eof() || !is_digit(peek()))
                fail("invalid number");
            while (!eof() && is_digit(peek()))
                ++pos_;
        }
        if (!eof() && (peek() == 'e' || peek() == 'E')) {
            ++pos_;
            if (!eof() && (peek() == '+' || peek() == '-'))
                ++pos_;
            if (eof() || !is_digit(peek()))
                fail("invalid number");
            while (!eof() && is_digit(peek()))
                ++pos_;
        }
        const std::string token{text_.substr(start, pos_ - start)};
        try {
            return std::stod(token);
        } catch (...) {
            fail("number out of range");
        }
    }
    static bool is_digit(char c) { return c >= '0' && c <= '9'; }
};

// ---- scene document extraction, mirroring SceneSerializer.ts ----

[[noreturn]] void invalid(const std::string &message) {
    throw std::runtime_error{"invalid scene document: " + message};
}

double require_number(const Json &value, const std::string &label) {
    if (!value.is_number() || !std::isfinite(value.number()))
        invalid(label + " must be a finite number");
    return value.number();
}

SceneVec3 require_vec3(const Json *value, const std::string &label) {
    if (value == nullptr || !value->is_object())
        invalid(label + " must be {x,y,z}");
    const auto *x = value->find("x");
    const auto *y = value->find("y");
    const auto *z = value->find("z");
    if (x == nullptr || y == nullptr || z == nullptr)
        invalid(label + " must be {x,y,z}");
    return SceneVec3{static_cast<f32>(require_number(*x, label + ".x")),
                static_cast<f32>(require_number(*y, label + ".y")),
                static_cast<f32>(require_number(*z, label + ".z"))};
}

u32 require_unsigned(const Json *value, const std::string &label, u32 fallback) {
    if (value == nullptr)
        return fallback;
    if (!value->is_number())
        invalid(label + " must be a non-negative integer");
    const double n = value->number();
    if (!std::isfinite(n) || n < 0 || std::floor(n) != n || n > 4294967295.0)
        invalid(label + " must be a non-negative integer");
    return static_cast<u32>(n);
}

bool require_bool(const Json *value, const std::string &label, bool fallback) {
    if (value == nullptr)
        return fallback;
    if (!value->is_bool())
        invalid(label + " must be a boolean");
    return value->boolean();
}

} // namespace

SceneDocument parse_scene_document(std::string_view text) {
    const Json root = JsonParser{text}.parse();
    if (!root.is_object())
        invalid("expected an object");
    const auto *format = root.find("format");
    if (format == nullptr || !format->is_number() || format->number() != 1.0)
        invalid("expected format 1");
    const auto *entities = root.find("entities");
    if (entities == nullptr || !entities->is_array())
        invalid("expected an entities array");
    if (entities->array().size() > max_entities)
        invalid("entity limit exceeded");

    SceneDocument document;
    document.entities.reserve(entities->array().size());
    for (usize index = 0; index < entities->array().size(); ++index) {
        const auto &entry = entities->array()[index];
        if (!entry.is_object())
            invalid("entity " + std::to_string(index) + " must be an object");
        SceneEntity out;
        if (const auto *name = entry.find("name"); name != nullptr) {
            if (!name->is_string())
                invalid("entity name must be a string");
            out.name = name->string();
        }
        if (const auto *parent = entry.find("parent"); parent != nullptr) {
            if (!parent->is_object())
                invalid("parent must be an object");
            const auto *parent_index = parent->find("index");
            const auto *generation = parent->find("generation");
            if (parent_index == nullptr || !parent_index->is_number() || generation == nullptr ||
                !generation->is_number() || generation->number() != 1.0)
                invalid("parent must be {index, generation: 1}");
            const double raw_index = parent_index->number();
            if (!std::isfinite(raw_index) || raw_index < 0 ||
                std::floor(raw_index) != raw_index ||
                raw_index >= static_cast<double>(entities->array().size()))
                invalid("parent index out of range");
            out.parent = static_cast<int>(raw_index);
        }
        const auto *components = entry.find("components");
        if (components == nullptr || !components->is_object())
            invalid("entity " + std::to_string(index) + " must have a components object");
        for (const auto &[component_name, component_value] : components->object()) {
            if (!is_known_component(component_name))
                invalid("unsupported component: " + component_name);
            if (component_name == "Transform") {
                out.transform = TransformComponent{
                    require_vec3(component_value.find("position"), "Transform.position")};
            } else if (component_name == "Renderable") {
                if (!component_value.is_object())
                    invalid("Renderable must be an object");
                out.renderable = RenderableComponent{
                    require_unsigned(component_value.find("mesh"), "Renderable.mesh", 0),
                    require_unsigned(component_value.find("material"), "Renderable.material", 0),
                    require_bool(component_value.find("visible"), "Renderable.visible", true)};
            } else if (component_name == "Name") {
                if (!component_value.is_object())
                    invalid("Name must be an object");
                const auto *value = component_value.find("value");
                if (value == nullptr || !value->is_string())
                    invalid("Name.value must be a string");
                out.name = value->string();
            } else if (component_name == "Parent") {
                // The editor encodes hierarchy through the entity-level
                // "parent" field, not through a component payload, and skips
                // an embedded "Parent" component during deserialization. Do
                // the same here rather than rejecting it.
            } else if (!component_value.is_object()) {
                // Every other known component (Rotation, Scale, Velocity,
                // Acceleration, RigidBody, Collider, Health, AIState,
                // Pedestrian, Vehicle, AnimationState) is accepted as opaque
                // data here; only its container shape is checked.
                invalid(component_name + " must be an object");
            }
        }
        document.entities.push_back(std::move(out));
    }

    // Parent cycle check, mirroring the editor's validator.
    for (usize index = 0; index < document.entities.size(); ++index) {
        std::vector<bool> seen(document.entities.size(), false);
        seen[index] = true;
        std::optional<int> parent = document.entities[index].parent;
        while (parent.has_value()) {
            const auto parent_index = static_cast<usize>(*parent);
            if (seen[parent_index])
                invalid("cyclic parent reference");
            seen[parent_index] = true;
            parent = document.entities[parent_index].parent;
        }
    }

    return document;
}

} // namespace engine
