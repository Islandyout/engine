#pragma once

#include "engine/core/types.hpp"
#include <array>
#include <span>
#include <vector>

namespace engine {
struct Vec3 final {
    float x{}, y{}, z{};
};
struct Box final {
    Vec3 center;
    Vec3 size{1, 1, 1};
    std::array<u8, 3> color{210, 230, 130};
};
struct OrbitView final {
    float yaw{0.65F};
    float scale{28};
};

// Bounded orthographic CPU reference renderer. No SDL/GPU dependencies.
// World: Y up; camera orbits Y with fixed elevation. Closest depth wins.
class BoxView final {
public:
    static constexpr int width = 800;
    static constexpr int height = 500;
    BoxView();
    void draw(std::span<const Box> boxes, OrbitView camera = {});
    [[nodiscard]] std::span<const u8> pixels() const noexcept { return pixels_; }

private:
    std::vector<u8> pixels_;
    std::vector<float> depths_;
};
} // namespace engine
