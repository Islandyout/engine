#include "engine/gameplay/aim_assist.hpp"

#include <cmath>
#include <iostream>
#include <stdexcept>
#include <vector>

namespace {
void check(bool pass, const char *message) {
    if (!pass)
        throw std::runtime_error{message};
}
using namespace engine;
using namespace engine::gameplay;

constexpr float degrees = 3.14159265F / 180.0F;

// A target `distance` metres ahead of a camera at the origin looking along
// -z, turned `yaw` degrees to the left (toward -x) and `pitch` up.
AimTarget at(float distance, float yaw, float pitch = 0) {
    const float y = yaw * degrees, p = pitch * degrees;
    return AimTarget{{-std::sin(y) * std::cos(p) * distance, std::sin(p) * distance, -std::cos(y) * std::cos(p) * distance}};
}

AimInput pad(bool moving = true) {
    AimInput input;
    input.device = AimDevice::gamepad;
    input.moving = moving;
    return input;
}
} // namespace

int main() {
    try {
        const AimAssistSettings settings;
        {
            const auto none = aim_assist(settings, {}, pad());
            check(none.slowdown == 1 && none.yaw == 0 && none.pitch == 0 && none.target < 0 && none.over < 0,
                  "no targets, no help");
        }
        {
            const std::vector<AimTarget> ahead{at(10, 0)};
            const auto on = aim_assist(settings, ahead, pad());
            check(on.over == 0 && on.target == 0, "a target under the crosshair is 'over' and assisted");
            check(on.slowdown < 0.8F && on.slowdown >= 0.5F, "the view slows on a target");
            check(std::abs(on.yaw) < 1e-4F && std::abs(on.pitch) < 1e-4F, "no pull when already centred");
        }
        {
            // 3 degrees to the left, moving: the pull turns left, partway.
            const std::vector<AimTarget> left{at(10, 3)};
            const auto pull = aim_assist(settings, left, pad());
            check(pull.target == 0 && pull.over < 0, "near, not on, the target");
            check(pull.yaw > 0 && pull.yaw < 3 * degrees, "the pull turns toward the target, not all the way");
            check(std::abs(pull.pitch) < 1e-4F, "level target, no pitch");
            // A still stick: slowdown, but never a drag.
            const auto still = aim_assist(settings, left, pad(false));
            check(still.yaw == 0 && still.pitch == 0 && still.slowdown < 1, "no pull without input");
            // Turning the view counts as input.
            auto turning = pad(false);
            turning.look_speed = 1;
            check(aim_assist(settings, left, turning).yaw > 0, "turning the view pulls");
            // Touch is assisted like a gamepad.
            auto touch = pad();
            touch.device = AimDevice::touch;
            check(aim_assist(settings, left, touch).yaw > 0, "touch gets the pull");
            // A mouse: a lighter slowdown, nothing else.
            auto mouse = pad();
            mouse.device = AimDevice::mouse;
            mouse.aim_pressed = true;
            const auto m = aim_assist(settings, left, mouse);
            check(m.yaw == 0 && m.pitch == 0, "a mouse is never moved");
            check(m.slowdown < 1 && m.slowdown > pull.slowdown, "a mouse slows less than a pad");
        }
        {
            // Above the crosshair: the pull pitches up.
            const std::vector<AimTarget> up{at(10, 0, 3)};
            check(aim_assist(settings, up, pad()).pitch > 0, "a target above pulls the view up");
            // To the right (negative yaw): turns right.
            const std::vector<AimTarget> right{at(10, -3)};
            check(aim_assist(settings, right, pad()).yaw < 0, "a target to the right pulls right");
        }
        {
            // Pressing aim snaps onto a target in a wider cone.
            const std::vector<AimTarget> off{at(12, 7)};
            check(aim_assist(settings, off, pad()).target < 0, "7 degrees off is outside the hold cone");
            auto ads = pad(false);
            ads.aim_pressed = true;
            const auto snap = aim_assist(settings, off, ads);
            check(snap.target == 0 && snap.yaw > 7 * degrees * 0.75F && snap.yaw <= 7 * degrees + 1e-4F,
                  "aiming snaps most of the way onto it");
        }
        {
            // Only hostile, visible targets in range; the closest to the
            // crosshair wins.
            auto friendly = at(10, 1);
            friendly.hostile = false;
            auto hidden = at(10, 1);
            hidden.visible = false;
            const std::vector<AimTarget> ignored{friendly, hidden, at(80, 1)};
            const auto none = aim_assist(settings, ignored, pad());
            check(none.target < 0 && none.over < 0 && none.slowdown == 1, "friendly, hidden and far are ignored");
            const std::vector<AimTarget> two{at(10, 4), at(10, 1.5F)};
            check(aim_assist(settings, two, pad()).target == 1, "the target nearest the crosshair is chosen");
        }
        {
            // Strength 0 turns the help off but still reports what's under
            // the crosshair (the crosshair still turns red).
            AimAssistSettings off;
            off.strength = 0;
            const std::vector<AimTarget> ahead{at(10, 0)};
            const auto r = aim_assist(off, ahead, pad());
            check(r.over == 0 && r.target < 0 && r.slowdown == 1 && r.yaw == 0, "strength 0 is off");
            // Stronger help reaches farther.
            AimAssistSettings strong;
            strong.strength = 1;
            const std::vector<AimTarget> edge{at(10, 6)};
            check(aim_assist(settings, edge, pad()).target < 0 && aim_assist(strong, edge, pad()).target == 0,
                  "strength widens the cone");
        }
        {
            // The look angles match the engine's convention.
            check(std::abs(look_yaw_of({0, 0, -1})) < 1e-6F, "yaw 0 looks along -z");
            check(std::abs(look_yaw_of({-1, 0, 0}) - 1.5707963F) < 1e-5F, "yaw +90 looks along -x");
            check(std::abs(look_pitch_of({0, 1, 0}) - 1.5707963F) < 1e-5F, "pitch +90 looks up");
        }
    } catch (const std::exception &error) {
        std::cerr << "aim assist test failed: " << error.what() << '\n';
        return 1;
    }
    std::cout << "aim assist tests passed\n";
    return 0;
}
