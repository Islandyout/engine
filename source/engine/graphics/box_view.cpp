#include "engine/graphics/box_view.hpp"
#include <algorithm>
#include <cmath>
#include <limits>
#include <stdexcept>

namespace engine {
BoxView::BoxView() : pixels_(width * height * 4), depths_(width * height) {}

void BoxView::draw(std::span<const Box> boxes, OrbitView camera) {
    if (!std::isfinite(camera.yaw) || !std::isfinite(camera.scale) || camera.scale < 4 ||
        camera.scale > 80 || boxes.size() > 512) {
        throw std::invalid_argument{"invalid box view"};
    }
    for (const auto &box : boxes) {
        for (float value :
             {box.center.x, box.center.y, box.center.z, box.size.x, box.size.y, box.size.z}) {
            if (!std::isfinite(value) || std::abs(value) > 1000) {
                throw std::invalid_argument{"invalid box coordinate"};
            }
        }
        if (box.size.x <= 0 || box.size.y <= 0 || box.size.z <= 0) {
            throw std::invalid_argument{"invalid box size"};
        }
    }
    for (usize i = 0; i < depths_.size(); ++i) {
        const auto shade = static_cast<u8>((i / width) * 12 / height);
        pixels_[4 * i] = static_cast<u8>(15 + shade);
        pixels_[4 * i + 1] = static_cast<u8>(28 + shade);
        pixels_[4 * i + 2] = static_cast<u8>(38 + shade);
        pixels_[4 * i + 3] = 255;
    }
    std::fill(depths_.begin(), depths_.end(), -std::numeric_limits<float>::infinity());
    const float c = std::cos(camera.yaw), s = std::sin(camera.yaw);
    const auto project = [&](Vec3 p) {
        const float depth = p.x * s + p.z * c;
        return Vec3{width * 0.5F + (p.x * c - p.z * s) * camera.scale,
                    height * 0.57F + (depth * 0.5F - p.y * 0.8660254F) * camera.scale,
                    depth * 0.8660254F + p.y * 0.5F};
    };
    const auto edge = [](Vec3 a, Vec3 b, float x, float y) {
        return (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    };
    for (const auto &box : boxes) {
        std::array<Vec3, 8> v;
        for (usize i = 0; i < 8; ++i) {
            v[i] = project({box.center.x + ((i & 1) ? 0.5F : -0.5F) * box.size.x,
                            box.center.y + ((i & 2) ? 0.5F : -0.5F) * box.size.y,
                            box.center.z + ((i & 4) ? 0.5F : -0.5F) * box.size.z});
        }
        constexpr int faces[6][4] = {{0, 1, 3, 2}, {4, 6, 7, 5}, {0, 2, 6, 4},
                                     {1, 5, 7, 3}, {0, 4, 5, 1}, {2, 3, 7, 6}};
        constexpr float light[6] = {0.65F, 0.75F, 0.62F, 0.8F, 0.45F, 1.0F};
        for (usize f = 0; f < 6; ++f)
            for (int triangle = 0; triangle < 2; ++triangle) {
                const auto a = v[static_cast<usize>(faces[f][0])];
                const auto b = v[static_cast<usize>(faces[f][triangle + 1])];
                const auto d = v[static_cast<usize>(faces[f][triangle + 2])];
                const float area = edge(a, b, d.x, d.y);
                if (std::abs(area) < 0.0001F)
                    continue;
                const int left = std::clamp(static_cast<int>(std::floor(std::min({a.x, b.x, d.x}))),
                                            0, width - 1);
                const int right = std::clamp(static_cast<int>(std::ceil(std::max({a.x, b.x, d.x}))),
                                             0, width - 1);
                const int top = std::clamp(static_cast<int>(std::floor(std::min({a.y, b.y, d.y}))),
                                           0, height - 1);
                const int bottom = std::clamp(
                    static_cast<int>(std::ceil(std::max({a.y, b.y, d.y}))), 0, height - 1);
                for (int y = top; y <= bottom; ++y)
                    for (int x = left; x <= right; ++x) {
                        const float px = static_cast<float>(x) + 0.5F,
                                    py = static_cast<float>(y) + 0.5F;
                        const float u = edge(b, d, px, py) / area, w = edge(d, a, px, py) / area,
                                    t = 1 - u - w;
                        if (u < 0 || w < 0 || t < 0)
                            continue;
                        const float z = u * a.z + w * b.z + t * d.z;
                        const auto index = static_cast<usize>(y * width + x);
                        if (z <= depths_[index])
                            continue;
                        depths_[index] = z;
                        for (usize channel = 0; channel < 3; ++channel)
                            pixels_[index * 4 + channel] =
                                static_cast<u8>(static_cast<float>(box.color[channel]) * light[f]);
                    }
            }
    }
}
} // namespace engine
