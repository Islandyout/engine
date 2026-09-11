#pragma once

#include "engine/core/types.hpp"

namespace engine {

// Mulberry32 adapted from Aether src/core/math.js; see third_party/aether/LICENSE.
// Stable unsigned arithmetic for repeatable content, not cryptographic randomness.
class SeededRandom final {
public:
    explicit constexpr SeededRandom(u32 seed = 1) noexcept : state_{seed} {}

    [[nodiscard]] constexpr u32 next_u32() noexcept {
        state_ += 0x6d2b79f5U;
        u32 value = (state_ ^ (state_ >> 15U)) * (1U | state_);
        value ^= value + (value ^ (value >> 7U)) * (61U | value);
        return value ^ (value >> 14U);
    }

    [[nodiscard]] constexpr double next_unit() noexcept {
        return static_cast<double>(next_u32()) / 4294967296.0;
    }

private:
    u32 state_;
};

} // namespace engine
