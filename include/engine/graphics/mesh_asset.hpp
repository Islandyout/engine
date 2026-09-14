#pragma once
#include "engine/core/types.hpp"
#include <array>
#include <span>
#include <vector>

namespace engine {
struct MeshVertex final {
    std::array<float, 3> position{}, normal{};
    std::array<float, 2> uv{};
    std::array<u8, 3> color{};
    bool textured{};
};
struct MeshAsset final {
    std::vector<MeshVertex> vertices; // Expanded triangle list.
    u32 texture_size{};
    std::vector<u8> texture; // RGBA8, nearest/repeat sampling.
};
// GEA1 little-endian cooked static mesh. Reject malformed data before returning an asset.
[[nodiscard]] MeshAsset decode_mesh_asset(std::span<const u8> bytes);
void validate_mesh_asset(const MeshAsset &asset);
} // namespace engine
