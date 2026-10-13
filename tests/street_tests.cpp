#include "engine/gameplay/street.hpp"

#include <cmath>
#include <iostream>
#include <stdexcept>
#include <string>

namespace {
void check(bool pass, const std::string &message) {
    if (!pass)
        throw std::runtime_error{message};
}
using namespace engine::gameplay;
} // namespace

int main() {
    try {
        const SignalTiming t{10, 3, 2, 0};
        check(signal_period(t) == 30, "period is both axes' green, yellow and clearance");
        // Axis 0: green 0-10, yellow 10-13, red 13-30; axis 1 green 15-25.
        check(signal_light(t, 5, 0) == Light::green && signal_light(t, 5, 1) == Light::red, "axis 0 green, axis 1 red");
        check(signal_light(t, 11, 0) == Light::yellow, "then yellow");
        check(signal_light(t, 14, 0) == Light::red && signal_light(t, 14, 1) == Light::red, "then all red to clear the box");
        check(signal_light(t, 16, 1) == Light::green && signal_light(t, 16, 0) == Light::red, "then axis 1 green");
        check(signal_light(t, 26, 1) == Light::yellow && signal_light(t, 29, 1) == Light::red, "axis 1 yellow, all red");
        check(signal_light(t, 35, 0) == Light::green, "and round again");
        // Never green both ways at once, at any time.
        for (float time = -40; time < 80; time += 0.25F)
            check(!(signal_light(t, time, 0) != Light::red && signal_light(t, time, 1) != Light::red), "never both open");
        // An offset shifts the cycle.
        const SignalTiming shifted{10, 3, 2, 15};
        check(signal_light(shifted, 0, 1) == Light::green, "offset 15: axis 1 starts green");
        // Walking: only with enough green left to get across.
        check(green_left(t, 4, 0) == 6, "6 s of green left at 4 s");
        // 8 s of green plus 5 s of yellow and all red at 2 s; 4 + 5 at 6 s.
        check(may_cross(t, 2, 0, 10) && !may_cross(t, 6, 0, 10), "cross with time to spare, not near the end");
        check(!may_cross(t, 11, 0, 1), "not once the light is yellow");
        check(!may_cross(t, 2, 1, 1), "never against the light");
        // Stop lines.
        check(stop_line_speed(Light::green, 5, 14, 4) > 1000, "green: go");
        check(stop_line_speed(Light::red, 0, 10, 4) == 0, "red at the line: stopped");
        check(std::abs(stop_line_speed(Light::red, 8, 10, 4) - 8) < 1e-4F, "red ahead: slow enough to stop in the distance");
        check(stop_line_speed(Light::red, -2, 10, 4) > 1000, "past the line (in the junction): clear it");
        check(stop_line_speed(Light::yellow, 30, 13, 4) < 20, "yellow far off: stop");
        check(stop_line_speed(Light::yellow, 10, 13, 4) > 1000, "yellow too close to stop comfortably: go on");
    } catch (const std::exception &error) {
        std::cerr << "street_tests failed: " << error.what() << '\n';
        return 1;
    }
    std::cout << "street_tests passed\n";
    return 0;
}
