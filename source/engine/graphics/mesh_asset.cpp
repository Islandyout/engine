#include "engine/graphics/mesh_asset.hpp"
#include <bit>
#include <cmath>
#include <stdexcept>

namespace engine {
void validate_mesh_asset(const MeshAsset &asset) {
    if (asset.vertices.empty() || asset.vertices.size() > 300000 || asset.vertices.size() % 3 ||
        asset.texture_size == 0 || asset.texture_size > 256 ||
        asset.texture.size() != static_cast<usize>(asset.texture_size) * asset.texture_size * 4)
        throw std::invalid_argument{"invalid mesh dimensions"};
    for (const auto &v : asset.vertices) {
        for (auto value : v.position)
            if (!std::isfinite(value) || std::abs(value) > 100)
                throw std::invalid_argument{"invalid mesh position"};
        for (auto value : v.normal)
            if (!std::isfinite(value) || std::abs(value) > 1.001F)
                throw std::invalid_argument{"invalid mesh normal"};
        for (auto value : v.uv)
            if (!std::isfinite(value) || std::abs(value) > 100)
                throw std::invalid_argument{"invalid mesh UV"};
    }
}
MeshAsset decode_mesh_asset(std::span<const u8> bytes) {
    if (bytes.size() < 12 || bytes[0] != 'G' || bytes[1] != 'E' || bytes[2] != 'A' ||
        bytes[3] != '1')
        throw std::invalid_argument{"invalid mesh header"};
    usize offset = 4;
    auto integer = [&] {
        u32 v = 0;
        for (u32 i = 0; i < 4; ++i)
            v |= static_cast<u32>(bytes[offset++]) << (8 * i);
        return v;
    };
    const auto count = integer(), size = integer();
    if (!count || count > 300000 || count % 3 || !size || size > 256 ||
        bytes.size() != 12 + static_cast<usize>(count) * 36 + static_cast<usize>(size) * size * 4)
        throw std::invalid_argument{"invalid mesh length"};
    MeshAsset asset;
    asset.texture_size = size;
    asset.vertices.reserve(count);
    for (u32 i = 0; i < count; ++i) {
        MeshVertex vertex;
        for (auto &v : vertex.position)
            v = std::bit_cast<float>(integer());
        for (auto &v : vertex.normal)
            v = std::bit_cast<float>(integer());
        for (auto &v : vertex.uv)
            v = std::bit_cast<float>(integer());
        for (auto &v : vertex.color)
            v = bytes[offset++];
        const auto flag = bytes[offset++];
        if (flag > 1)
            throw std::invalid_argument{"invalid material flag"};
        vertex.textured = flag != 0;
        asset.vertices.push_back(vertex);
    }
    asset.texture.assign(bytes.begin() + static_cast<std::ptrdiff_t>(offset), bytes.end());
    validate_mesh_asset(asset);
    return asset;
}
} // namespace engine
