#include "engine/gameplay/car.hpp"

#include <cmath>
#include <iostream>
#include <stdexcept>
#include <string>

namespace {
void check(bool pass, const std::string &message) {
    if (!pass)
        throw std::runtime_error{message};
}
using namespace engine;
using namespace engine::gameplay;

float speed(const CarState &s) { return std::hypot(s.velocity.x, s.velocity.z); }

void run(CarState &state, const CarSpec &spec, const CarInput &input, float seconds) {
    for (int i = 0; i < static_cast<int>(seconds * 60); ++i)
        step_car(state, spec, input, 1.0F / 60.0F);
}
} // namespace

int main() {
    try {
        const CarSpec spec;
        {
            // Full throttle reaches most of top speed, never beyond it, in gear 5-6.
            CarState s;
            run(s, spec, {1, 0, 0, false, false}, 3);
            const float after3 = speed(s);
            check(after3 > 20 && after3 < 40, "brisk launch: " + std::to_string(after3));
            run(s, spec, {1, 0, 0, false, false}, 20);
            check(speed(s) > spec.top_speed * 0.9F && speed(s) <= spec.top_speed * 1.02F, "top speed");
            check(s.gear >= 5 && s.velocity.z > 0 && std::abs(s.velocity.x) < 1e-3F, "straight down +z in top gear");
            // Brakes stop it within ~3 s; holding brake then reverses.
            int ticks = 0;
            while (s.forward_speed > 0.5F && ticks < 600) {
                step_car(s, spec, {0, 1, 0, false, false}, 1.0F / 60.0F);
                ++ticks;
            }
            check(ticks < 180, "brakes stop the car within 3 s: " + std::to_string(ticks));
            run(s, spec, {0, 1, 0, false, false}, 3);
            check(s.forward_speed < -5 && s.gear == -1, "brake held reverses");
            // Coasting slows down and stops without reversing.
            CarState c;
            c.velocity = {0, 0, 20};
            run(c, spec, {}, 25);
            check(speed(c) < 0.5F && c.forward_speed >= 0, "coasts to a stop");
        }
        {
            // Steering right turns right (yaw falls) and the car follows its nose
            // at moderate speed without drifting.
            CarState s;
            s.velocity = {0, 0, 15};
            run(s, spec, {0.4F, 0, 1, false, false}, 1.0F);
            check(s.yaw < -0.5F, "steer right lowers yaw: " + std::to_string(s.yaw));
            check(s.velocity.x < 0, "travels toward -x (its right)");
            check(!s.drifting && std::abs(s.slip) < 0.2F, "holds grip at 15 m/s");
        }
        {
            // Handbrake at speed with steering breaks the rear loose into a drift,
            // which refills nitro; letting go recovers grip.
            CarState s;
            s.velocity = {0, 0, 30};
            s.nitro = 0.2F;
            run(s, spec, {0.6F, 0, 1, true, false}, 0.6F);
            check(s.drifting && std::abs(s.slip) > 0.22F, "handbrake turn drifts: slip " + std::to_string(s.slip));
            const float tank = s.nitro;
            run(s, spec, {0.6F, 0, -0.3F, false, false}, 0.5F);
            check(s.nitro > tank, "drifting fills nitro");
            run(s, spec, {0.6F, 0, 0, false, false}, 3);
            check(!s.drifting, "grip returns");
        }
        {
            // Nitro accelerates harder, lifts top speed and drains the tank.
            CarState a, b;
            a.velocity = b.velocity = {0, 0, 30};
            run(a, spec, {1, 0, 0, false, false}, 2);
            run(b, spec, {1, 0, 0, false, true}, 2);
            check(speed(b) > speed(a) + 5 && b.nitro < 0.6F && b.boosting, "nitro boosts and drains");
            run(b, spec, {1, 0, 0, false, true}, 10);
            check(b.nitro == 0 && !b.boosting, "empty tank stops boosting");
        }
        {
            // Pure pursuit: a target ahead-right steers right and throttles up;
            // overspeed brakes; a target behind turns hard.
            CarState s;
            s.velocity = {0, 0, 10};
            s.forward_speed = 10;
            auto input = steer_toward(s, spec, {0, 0, 0}, {-10, 0, 30}, 25);
            check(input.steer > 0.1F && input.throttle > 0 && input.brake == 0, "steers toward a right-hand target");
            input = steer_toward(s, spec, {0, 0, 0}, {0, 0, 30}, 2);
            check(input.brake > 0 && input.throttle == 0, "brakes when too fast");
            input = steer_toward(s, spec, {0, 0, 0}, {5, 0, -20}, 10);
            check(input.steer == -1, "target behind-left turns full left");
            // Following a 50 m radius circle of targets keeps the car on it.
            CarState c;
            c.velocity = {0, 0, 15};
            Vec3 position{50, 0, 0};
            for (int i = 0; i < 600; ++i) {
                const float angle = std::atan2(position.z, position.x) + 0.35F;
                const Vec3 target{50 * std::cos(angle), 0, 50 * std::sin(angle)};
                step_car(c, spec, steer_toward(c, spec, position, target, corner_speed(spec, 50)), 1.0F / 60.0F);
                position.x += c.velocity.x / 60.0F;
                position.z += c.velocity.z / 60.0F;
            }
            const float radius = std::hypot(position.x, position.z);
            check(std::abs(radius - 50) < 4, "AI holds a 50 m circle: " + std::to_string(radius));
            check(corner_speed(spec, 50) > 20 && corner_speed(spec, 50) < 30, "corner speed in range");
        }
        std::cout << "Car: launch, top speed, brakes, reverse, coasting, steering direction, grip, handbrake drift, "
                     "nitro, pure-pursuit steering and corner speed passed.\n";
        return 0;
    } catch (const std::exception &error) {
        std::cerr << "car_tests failed: " << error.what() << '\n';
        return 1;
    }
}
