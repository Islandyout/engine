#include <cmath>
#include <iostream>
#include <limits>
#include <stdexcept>
extern "C" {
void editor_begin();
int editor_add(double, double, double, double, double, double, double, double, double, double);
int editor_commit();
void editor_tick();
double editor_value(int, int);
int editor_count();
}
namespace {
int add_unit(double x, double y, double z, double vx, double vy, double vz) {
    return editor_add(x, y, z, vx, vy, vz, 1, 1, 1, 0);
}
} // namespace
int main() {
    const auto check = [](bool ok) {
        if (!ok)
            throw std::runtime_error{"editor bridge test failed"};
    };
    editor_begin();
    check(add_unit(0, 2, 3, 6, 0, 0) == 1);
    check(editor_commit() == 1);
    for (int i = 0; i < 60; ++i)
        editor_tick();
    check(std::abs(editor_value(0, 0) - 6) < 1e-4);
    check(editor_count() == 1);
    editor_begin();
    check(add_unit(std::numeric_limits<double>::infinity(), 0, 0, 0, 0, 0) == 0);
    check(editor_commit() == 0);
    check(std::abs(editor_value(0, 0) - 6) < 1e-4);
    editor_begin();
    check(editor_commit() == 1);
    check(editor_count() == 0);
    editor_begin();
    for (int i = 0; i < 1024; ++i)
        check(add_unit(0, 0, 0, 0, 0, 0) == 1);
    check(add_unit(0, 0, 0, 0, 0, 0) == 0);
    check(editor_commit() == 0);
    check(editor_count() == 0);
    editor_begin();
    check(add_unit(0, 5, 0, 0, 0, 0) == 1);
    check(editor_commit() == 1);
    for (int i = 0; i < 120; ++i)
        editor_tick();
    check(std::abs(editor_value(0, 1) - 0.5) < 1e-6);
    // A taller box (size 1x4x1) rests with its bottom on the ground, not its unit-box
    // center: half-height 2, so y settles at 2, not 0.5.
    editor_begin();
    check(editor_add(0, 5, 0, 0, 0, 0, 1, 4, 1, 0) == 1);
    check(editor_commit() == 1);
    for (int i = 0; i < 120; ++i)
        editor_tick();
    check(std::abs(editor_value(0, 1) - 2) < 1e-6);
    // Non-finite or non-positive size is rejected, same as position/velocity.
    editor_begin();
    check(editor_add(0, 0, 0, 0, 0, 0, 0, 1, 1, 0) == 0);
    check(editor_commit() == 0);
    editor_begin();
    check(editor_add(0, 0, 0, 0, 0, 0, std::numeric_limits<double>::infinity(), 1, 1, 0) == 0);
    check(editor_commit() == 0);
    // A hierarchy child (is_child nonzero) is not simulated: its local position, even one
    // that reads as "under the ground plane" in a bare world-space sense, passes straight
    // through untouched instead of being resolved against a ground it isn't actually at.
    editor_begin();
    check(editor_add(1, -5, 2, 3, -9, 4, 1, 1, 1, 1) == 1);
    check(editor_commit() == 1);
    for (int i = 0; i < 120; ++i)
        editor_tick();
    check(std::abs(editor_value(0, 0) - 1) < 1e-10);
    check(std::abs(editor_value(0, 1) - -5) < 1e-10);
    check(std::abs(editor_value(0, 2) - 2) < 1e-10);
    std::cout << "Editor bridge: deterministic fixed steps, atomic replacement, finite bounds, "
                 "reset, limits, authored box size, and hierarchy-child exclusion passed.\n";
}
