#pragma once

#include "engine/core/types.hpp"

#include <array>
#include <compare>
#include <optional>
#include <string>
#include <string_view>

namespace engine {

class Uuid final {
public:
    using Bytes = std::array<u8, 16>;

    constexpr Uuid() = default;
    explicit constexpr Uuid(Bytes bytes) noexcept : bytes_(bytes) {}

    [[nodiscard]] static Uuid random_v4();
    [[nodiscard]] static std::optional<Uuid> parse(std::string_view text) noexcept;

    [[nodiscard]] constexpr const Bytes& bytes() const noexcept { return bytes_; }
    [[nodiscard]] constexpr bool is_nil() const noexcept {
        for (const auto byte : bytes_) {
            if (byte != 0) {
                return false;
            }
        }
        return true;
    }

    [[nodiscard]] std::string to_string() const;

    auto operator<=>(const Uuid&) const = default;

private:
    Bytes bytes_{};
};

template <typename Tag>
class StrongId final {
public:
    constexpr StrongId() = default;
    explicit constexpr StrongId(const Uuid& value) noexcept : value_(value) {}

    [[nodiscard]] static StrongId random() { return StrongId{Uuid::random_v4()}; }
    [[nodiscard]] constexpr const Uuid& value() const noexcept { return value_; }
    [[nodiscard]] constexpr bool is_nil() const noexcept { return value_.is_nil(); }
    [[nodiscard]] std::string to_string() const { return value_.to_string(); }

    auto operator<=>(const StrongId&) const = default;

private:
    Uuid value_{};
};

struct AssetIdTag;
struct EntityIdTag;
struct FrameIdTag;
struct WorldIdTag;

using AssetId = StrongId<AssetIdTag>;
using EntityId = StrongId<EntityIdTag>;
using FrameId = StrongId<FrameIdTag>;
using WorldId = StrongId<WorldIdTag>;

} // namespace engine
