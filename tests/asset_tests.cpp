#include "engine/graphics/box_view.hpp"
#include <algorithm>
#include <fstream>
#include <iostream>
#include <iterator>
#include <stdexcept>

namespace {
void check(bool ok, const char *message) {
    if (!ok)
        throw std::runtime_error{message};
}
bool rejects(const std::vector<engine::u8> &bytes) {
    try {
        static_cast<void>(engine::decode_mesh_asset(bytes));
        return false;
    } catch (const std::invalid_argument &) {
        return true;
    }
}
} // namespace
int main(int argc, char **argv) {
    try {
        check(argc == 2, "asset fixture path required");
        std::ifstream file{argv[1], std::ios::binary};
        std::vector<engine::u8> bytes{std::istreambuf_iterator<char>{file},
                                      std::istreambuf_iterator<char>{}};
        const auto mesh = engine::decode_mesh_asset(bytes);
        check(mesh.vertices.size() == 216, "bench has 72 triangles");
        check(mesh.texture_size == 64, "64 square albedo");
        check(mesh.vertices.front().textured && !mesh.vertices.back().textured,
              "two material assignments");
        auto bad = bytes;
        bad.pop_back();
        check(rejects(bad), "truncated payload");
        bad = bytes;
        bad.push_back(0);
        check(rejects(bad), "trailing payload");
        bad = bytes;
        bad[0] = 'X';
        check(rejects(bad), "wrong version/header");
        bad = bytes;
        for (int i = 4; i < 8; ++i)
            bad[static_cast<engine::usize>(i)] = 255;
        check(rejects(bad), "oversized vertex count");
        bad = bytes;
        bad[14] = 192;
        bad[15] = 127;
        check(rejects(bad), "NaN coordinate");
        bad = bytes;
        bad[47] = 2;
        check(rejects(bad), "invalid texture flag");
        engine::BoxView view;
        const std::array<engine::Box, 0> empty{};
        view.draw(empty);
        const std::vector<engine::u8> background(view.pixels().begin(), view.pixels().end());
        view.draw_mesh(mesh, {0, 0, 0}, 4);
        const std::vector<engine::u8> textured(view.pixels().begin(), view.pixels().end());
        check(textured != background, "loaded triangles draw visible pixels");
        view.draw(empty);
        view.draw_mesh(mesh, {0, 0, 0}, 4);
        check(std::equal(textured.begin(), textured.end(), view.pixels().begin()),
              "repeatable textured frame");
        auto plain = mesh;
        std::fill(plain.texture.begin(), plain.texture.end(), 255);
        view.draw(empty);
        view.draw_mesh(plain, {0, 0, 0}, 4);
        check(!std::equal(textured.begin(), textured.end(), view.pixels().begin()),
              "UV texture affects image");
        std::cout << "Asset decode, bounds, malformed data, material assignments and textured "
                     "raster passed.\n";
    } catch (const std::exception &e) {
        std::cerr << e.what() << '\n';
        return 1;
    }
}
