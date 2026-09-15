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
    // World point the camera orbits around and centers on screen. Default
    // {0,0,0} reproduces every prior camera's behavior exactly (nothing
    // orbited a moving point before this existed).
    Vec3 target{};
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
    // A 2D screen-space HUD bar: a fill-color background over the current
    // frame, then a foreground rect of width*clamp(ratio,0,1) in the same
    // spot — a health bar, not a 3D-projected object, so it ignores the
    // depth buffer and camera (always drawn on top, at fixed screen
    // coordinates). Must follow a draw() call (needs a frame to draw into).
    void draw_bar(int x, int y, int bar_width, int bar_height, float ratio,
                  std::array<u8, 3> color);
    [[nodiscard]] std::span<const u8> pixels() const noexcept { return pixels_; }

private:
    std::vector<u8> pixels_;
    std::vector<float> depths_;
    OrbitView camera_;
    bool frame_ready_{};
};
} // namespace engine
