#pragma once

#include "engine/core/types.hpp"
#include "engine/graphics/mesh_asset.hpp"
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
    // Draw over the current frame using its camera/depth buffer. Positive uniform scale only.
    void draw_mesh(const MeshAsset &mesh, Vec3 position, float scale = 1);
    [[nodiscard]] std::span<const u8> pixels() const noexcept { return pixels_; }

private:
    std::vector<u8> pixels_;
    std::vector<float> depths_;
    OrbitView camera_;
    bool frame_ready_{};
};
} // namespace engine
