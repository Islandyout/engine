#include <cmath>
#include <iostream>
#include <limits>
#include <stdexcept>
extern "C" {
void editor_begin();
int editor_add(double, double, double, double, double, double, double, double, double, double,
               double, double, double, double, double);
int editor_commit();
void editor_tick();
void editor_input_begin_frame();
void editor_set_camera_forward(double, double);
void editor_key(int, int);
double editor_value(int, int);
int editor_alive(int);
int editor_count();
int editor_projectile_count();
double editor_projectile_value(int, int);
}
namespace {
int add_unit(double x, double y, double z, double vx, double vy, double vz) {
    return editor_add(x, y, z, vx, vy, vz, 1, 1, 1, 0, 0, 0, 0, 0, 0);
}
// key_for()'s own contract, mirrored here rather than re-derived from memory
// each call site: 0=W, 1=A, 2=S, 3=D, 4=Shift, 5=F (attack), 6=G (blast).
constexpr int key_w = 0, key_a = 1, key_s = 2, key_d = 3, key_shift = 4, key_f = 5, key_g = 6;
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
    check(editor_add(0, 5, 0, 0, 0, 0, 1, 4, 1, 0, 0, 0, 0, 0, 0) == 1);
    check(editor_commit() == 1);
    for (int i = 0; i < 120; ++i)
        editor_tick();
    check(std::abs(editor_value(0, 1) - 2) < 1e-6);
    // Non-finite or non-positive size is rejected, same as position/velocity.
    editor_begin();
    check(editor_add(0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0) == 0);
    check(editor_commit() == 0);
    editor_begin();
    check(editor_add(0, 0, 0, 0, 0, 0, std::numeric_limits<double>::infinity(), 1, 1, 0, 0, 0, 0, 0,
                      0) == 0);
    check(editor_commit() == 0);
    // A hierarchy child (is_child nonzero) is not simulated: its local position, even one
    // that reads as "under the ground plane" in a bare world-space sense, passes straight
    // through untouched instead of being resolved against a ground it isn't actually at.
    editor_begin();
    check(editor_add(1, -5, 2, 3, -9, 4, 1, 1, 1, 1, 0, 0, 0, 0, 0) == 1);
    check(editor_commit() == 1);
    for (int i = 0; i < 120; ++i)
        editor_tick();
    check(std::abs(editor_value(0, 0) - 1) < 1e-10);
    check(std::abs(editor_value(0, 1) - -5) < 1e-10);
    check(std::abs(editor_value(0, 2) - 2) < 1e-10);

    // A non-player entity ignores WASD entirely, even while held.
    editor_begin();
    check(add_unit(0, 0.5, 0, 0, 0, 0) == 1);
    check(editor_commit() == 1);
    editor_input_begin_frame();
    editor_key(key_d, 1);
    for (int i = 0; i < 30; ++i)
        editor_tick();
    check(std::abs(editor_value(0, 0)) < 1e-9);
    editor_key(key_d, 0);

    // A player entity moves under held WASD (level-triggered: no per-tick
    // begin_frame() needed, since key_down persists until an explicit release).
    editor_begin();
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0) == 1);
    check(editor_commit() == 1);
    editor_input_begin_frame();
    editor_key(key_d, 1);
    for (int i = 0; i < 60; ++i)
        editor_tick();
    check(std::abs(editor_value(0, 0) - 4.8) < 1e-3); // move_speed (4.8 units/s) * 1 s
    // Releasing the key stops movement immediately — no momentum/coasting.
    editor_key(key_d, 0);
    const double x_at_release = editor_value(0, 0);
    for (int i = 0; i < 30; ++i)
        editor_tick();
    check(std::abs(editor_value(0, 0) - x_at_release) < 1e-6);
    // All four movement keys are independently wired, not just D.
    editor_key(key_a, 1);
    for (int i = 0; i < 30; ++i)
        editor_tick();
    check(editor_value(0, 0) < x_at_release);
    editor_key(key_a, 0);
    editor_key(key_w, 1);
    for (int i = 0; i < 30; ++i)
        editor_tick();
    check(editor_value(0, 2) < 0); // W moves -z, matching the native playground's own binding
    editor_key(key_w, 0);
    editor_key(key_s, 1);
    for (int i = 0; i < 60; ++i)
        editor_tick();
    check(editor_value(0, 2) > 0); // S moves +z past the origin the W leg approached
    editor_key(key_s, 0);

    // A single jump tap arcs up, then falls back to rest under gravity alone once released.
    editor_begin();
    check(editor_add(0, 5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0) == 1);
    check(editor_commit() == 1);
    for (int i = 0; i < 120; ++i)
        editor_tick(); // fall and settle first, same as the plain-gravity case above
    check(std::abs(editor_value(0, 1) - 0.5) < 1e-4);
    editor_input_begin_frame();
    editor_key(key_shift, 1);
    editor_tick(); // liftoff: key_pressed() true and grounded, so velocity.y = jump_speed
    editor_key(key_shift, 0); // released before airborne again: one arc, not sustained flight
    check(editor_value(0, 1) > 0.5);
    double peak = editor_value(0, 1);
    for (int i = 0; i < 90; ++i) {
        editor_input_begin_frame();
        editor_tick();
        peak = std::max(peak, editor_value(0, 1));
    }
    check(peak > 1.0); // reached meaningfully above resting height
    check(std::abs(editor_value(0, 1) - 0.5) < 1e-2); // and landed back at rest

    // Holding jump while airborne sustains a climb instead of arcing back down.
    editor_input_begin_frame();
    editor_key(key_shift, 1);
    editor_tick(); // liftoff again
    const double liftoff_y = editor_value(0, 1);
    double climbing_y = liftoff_y;
    for (int i = 0; i < 30; ++i) {
        editor_input_begin_frame(); // key_down(shift) still true: no new editor_key() needed
        editor_tick();
        check(editor_value(0, 1) >= climbing_y - 1e-6); // never dips while held: a steady climb
        climbing_y = editor_value(0, 1);
    }
    check(climbing_y > liftoff_y + 1.0); // meaningfully higher than a single jump would reach
    editor_key(key_shift, 0);
    for (int i = 0; i < 180; ++i) {
        editor_input_begin_frame();
        editor_tick();
    }
    check(std::abs(editor_value(0, 1) - 0.5) < 1e-2); // falls and lands once released

    // A static Collider (index 0, no RigidBody-relevant motion beyond its own settle-to-ground)
    // blocks a player (index 1) driving straight into it, instead of letting it pass through.
    // Obstacle: unit box centered at x=3, so its near face sits at x=2.5. Player: unit box
    // starting at x=0, so it can approach to x=2 before the two boxes touch.
    editor_begin();
    check(editor_add(3, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 1, 0, 0, 0) == 1); // obstacle
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0) == 1); // player
    check(editor_commit() == 1);
    editor_input_begin_frame();
    editor_key(key_d, 1);
    for (int i = 0; i < 300; ++i)
        editor_tick(); // far more than enough time to cross the gap if unblocked
    check(editor_value(1, 0) < 2.0 + 1e-3); // stopped at the obstacle's face, not past it
    check(editor_value(1, 0) > 1.5); // and did actually approach, not stall at the start
    editor_key(key_d, 0);

    // A plain moving entity (no Player tag, just RigidBody) is blocked the same way: Collider
    // resolution is generic physics, not something wired specially for the player.
    editor_begin();
    check(editor_add(3, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 1, 0, 0, 0) == 1); // obstacle
    check(add_unit(0, 0.5, 0, 2, 0, 0) == 1); // plain mover, constant +x velocity
    check(editor_commit() == 1);
    for (int i = 0; i < 300; ++i)
        editor_tick();
    check(editor_value(1, 0) < 2.0 + 1e-3);

    // A hierarchy child authored with a Collider is not turned into a world obstacle: its
    // position is parent-relative, so an unrelated body must pass straight through unblocked.
    editor_begin();
    check(editor_add(3, 0.5, 0, 0, 0, 0, 1, 1, 1, 1, 0, 1, 0, 0, 0) == 1); // child, ignored as obstacle
    check(add_unit(0, 0.5, 0, 2, 0, 0) == 1); // plain mover, constant +x velocity
    check(editor_commit() == 1);
    for (int i = 0; i < 300; ++i)
        editor_tick();
    check(editor_value(1, 0) > 4.0); // sailed straight past where the (inert) obstacle sits

    // Melee: F damages every Health entity overlapping the player by attack_damage (20) per
    // press; three hits defeats a fresh 60/60 target, which then reports dead instead of
    // stale position/health data.
    editor_begin();
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0) == 1);       // player, index 0
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 60, 60, 0) == 1);     // target, index 1, overlapping
    check(editor_commit() == 1);
    check(editor_alive(1) == 1);
    check(std::abs(editor_value(1, 3) - 1.0) < 1e-6);
    const auto attack_once = [&]() {
        editor_input_begin_frame();
        editor_key(key_f, 1);
        editor_tick();
        editor_key(key_f, 0);
    };
    attack_once();
    check(std::abs(editor_value(1, 3) - 40.0 / 60.0) < 1e-3);
    check(editor_alive(1) == 1);
    attack_once();
    check(std::abs(editor_value(1, 3) - 20.0 / 60.0) < 1e-3);
    attack_once();
    check(editor_alive(1) == 0); // third hit brings it to 0 and destroys it
    check(std::abs(editor_value(1, 3) - -1) < 1e-6); // dead sentinel, not stale health data

    // Attacking never damages the attacking player itself, even if it also carries Health
    // (self-overlap is trivially true).
    editor_begin();
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 60, 60, 0) == 1); // player with its own Health
    check(editor_commit() == 1);
    attack_once();
    check(std::abs(editor_value(0, 3) - 1.0) < 1e-6); // unchanged: F never hits the attacker

    // Ranged blast: G fires a projectile at the nearest Health entity; on contact it damages
    // that entity by blast_damage (15) and disappears.
    editor_begin();
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0) == 1);   // player, index 0
    check(editor_add(5, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 60, 60, 0) == 1); // target, index 1
    check(editor_commit() == 1);
    check(editor_projectile_count() == 0);
    editor_input_begin_frame();
    editor_key(key_g, 1);
    editor_tick(); // fires: the projectile is created this tick, not yet moved
    editor_key(key_g, 0);
    check(editor_projectile_count() == 1);
    check(std::abs(editor_projectile_value(0, 0) - 0) < 1e-6); // spawned at the player's position
    for (int i = 0; i < 120 && editor_projectile_count() > 0; ++i) {
        editor_input_begin_frame();
        editor_tick();
    }
    check(editor_projectile_count() == 0); // consumed on hit, well inside its 1.5s lifetime
    check(std::abs(editor_value(1, 3) - (60.0 - 15.0) / 60.0) < 1e-3);
    check(editor_alive(1) == 1);

    // Blast targets the *nearest* Health entity, not simply the first one found.
    editor_begin();
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0) == 1);    // player, index 0
    check(editor_add(10, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 60, 60, 0) == 1); // far target, index 1
    check(editor_add(3, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 60, 60, 0) == 1);  // near target, index 2
    check(editor_commit() == 1);
    editor_input_begin_frame();
    editor_key(key_g, 1);
    editor_tick();
    editor_key(key_g, 0);
    for (int i = 0; i < 120 && editor_projectile_count() > 0; ++i) {
        editor_input_begin_frame();
        editor_tick();
    }
    check(std::abs(editor_value(2, 3) - (60.0 - 15.0) / 60.0) < 1e-3); // near target hit
    check(std::abs(editor_value(1, 3) - 1.0) < 1e-6);                  // far target untouched

    // No Health entity anywhere to aim at: blast is simply a no-op, nothing spawned — same as
    // the native playground's own enemy.has_value() guard.
    editor_begin();
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0) == 1); // player only
    check(editor_commit() == 1);
    editor_input_begin_frame();
    editor_key(key_g, 1);
    editor_tick();
    editor_key(key_g, 0);
    check(editor_projectile_count() == 0);

    // A blast that never reaches its (far-off) target expires and is destroyed once its
    // lifetime runs out, dealing no damage — same outcome as the native playground's own
    // lifetime-exhausted branch.
    editor_begin();
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0) == 1);    // player, index 0
    check(editor_add(50, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 60, 60, 0) == 1); // far-off target, index 1
    check(editor_commit() == 1);
    editor_input_begin_frame();
    editor_key(key_g, 1);
    editor_tick();
    editor_key(key_g, 0);
    check(editor_projectile_count() == 1);
    for (int i = 0; i < 120; ++i) { // well past the 1.5s (90-tick) lifetime
        editor_input_begin_frame();
        editor_tick();
    }
    check(editor_projectile_count() == 0);           // expired, not consumed on a hit
    check(std::abs(editor_value(1, 3) - 1.0) < 1e-6); // never reached: full health remains

    // A key edge that arrives in a "frame" with zero ticks is not lost: a real browser
    // frame can cover zero to five ticks sharing one editor_input_begin_frame() call, and
    // InputState's own key_pressed() would already be cleared by a second begin_frame()
    // before any tick ever consumed it. pending_attack/pending_blast (bridge.cpp) survive
    // that frame boundary instead, consumed only once a tick actually acts on them.
    editor_begin();
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0) == 1);   // player, index 0
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 60, 60, 0) == 1); // target, index 1, overlapping
    check(editor_commit() == 1);
    editor_input_begin_frame(); // "frame" 1: the press arrives here...
    editor_key(key_f, 1);
    editor_input_begin_frame(); // ...but frame 1 runs zero ticks; frame 2 starts right away instead
    editor_tick();               // the first tick to actually run still consumes the pending edge
    check(std::abs(editor_value(1, 3) - 40.0 / 60.0) < 1e-3); // damage landed despite the frame gap
    editor_key(key_f, 0);

    // A blast never damages the entity that fired it, even though it spawns at that
    // entity's own position and, for the first tick or two, hasn't yet moved clear of it.
    editor_begin();
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 60, 60, 0) == 1); // player with its own Health, index 0
    check(editor_add(5, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 60, 60, 0) == 1); // target, index 1
    check(editor_commit() == 1);
    editor_input_begin_frame();
    editor_key(key_g, 1);
    editor_tick();
    editor_key(key_g, 0);
    check(std::abs(editor_value(0, 3) - 1.0) < 1e-6); // the shooter's own health is untouched
    for (int i = 0; i < 120 && editor_projectile_count() > 0; ++i) {
        editor_input_begin_frame();
        editor_tick();
    }
    check(editor_projectile_count() == 0);
    check(std::abs(editor_value(1, 3) - (60.0 - 15.0) / 60.0) < 1e-3); // it still hits the real target

    // Camera-relative movement: with no editor_set_camera_forward() call, every prior test
    // above already proves the default (world -z) reproduces the exact old fixed-axis
    // behavior. Here the camera is rotated to face world +x instead, and D — "camera's
    // right," not "world +x" — now moves along +z, while W now moves along +x: the felt
    // direction of a key follows the camera, not a fixed world axis.
    editor_begin();
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0) == 1);
    check(editor_commit() == 1);
    editor_set_camera_forward(1, 0); // camera now faces world +x
    editor_input_begin_frame();
    editor_key(key_d, 1);
    for (int i = 0; i < 30; ++i)
        editor_tick();
    check(editor_value(0, 2) > 0.5);                  // D moved it in +z (camera's right)...
    check(std::abs(editor_value(0, 0)) < 1e-6);        // ...not world +x at all
    editor_key(key_d, 0);
    editor_key(key_w, 1);
    for (int i = 0; i < 30; ++i)
        editor_tick();
    check(editor_value(0, 0) > 0.5); // W now moves along the camera's forward, world +x
    editor_key(key_w, 0);

    // Vehicle driving: a Player entity that also carries an authored Vehicle component
    // steers and accelerates instead of strafing in an instant-direction. Starts facing
    // world +z (yaw 0, field 4) with zero speed.
    editor_begin();
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 1) == 1); // player + vehicle
    check(editor_commit() == 1);
    check(std::abs(editor_value(0, 4)) < 1e-6);
    // Steering alone (no throttle) turns the heading without moving the vehicle at all —
    // velocity is sin(yaw)*speed/cos(yaw)*speed, and speed is still zero.
    editor_input_begin_frame();
    editor_key(key_d, 1);
    for (int i = 0; i < 30; ++i)
        editor_tick();
    check(editor_value(0, 4) > 0.5);                // turned meaningfully...
    check(std::abs(editor_value(0, 0)) < 1e-6);      // ...but never moved
    check(std::abs(editor_value(0, 2)) < 1e-6);
    editor_key(key_d, 0);
    // Holding the throttle builds speed gradually (momentum), not an instant velocity —
    // reset heading first so the rest of this case moves in a known, simple direction.
    editor_begin();
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 1) == 1);
    check(editor_commit() == 1);
    editor_input_begin_frame();
    editor_key(key_w, 1);
    editor_tick();
    double previous_z = editor_value(0, 2);
    check(previous_z > 0);
    editor_input_begin_frame();
    editor_tick();
    const double first_tick_delta = editor_value(0, 2) - previous_z;
    for (int i = 0; i < 27; ++i) {
        previous_z = editor_value(0, 2);
        editor_input_begin_frame();
        editor_tick();
    }
    previous_z = editor_value(0, 2);
    editor_input_begin_frame();
    editor_tick();
    const double thirtieth_tick_delta = editor_value(0, 2) - previous_z;
    // Momentum, not an instant velocity: the ground covered by one tick keeps growing
    // tick over tick (a constant, let alone instant, velocity would cover the same
    // ground every tick) as speed ramps up under sustained throttle.
    check(thirtieth_tick_delta > first_tick_delta * 10);
    const double z_after_thirty = editor_value(0, 2);
    // Release the throttle: drag coasts the vehicle to a stop instead of halting it dead,
    // unlike the on-foot model's instant stop-on-release.
    editor_key(key_w, 0);
    editor_input_begin_frame();
    editor_tick();
    check(editor_value(0, 2) > z_after_thirty); // still moving the tick right after release
    for (int i = 0; i < 200; ++i) { // far more than enough time to coast down to a stop
        editor_input_begin_frame();
        editor_tick();
    }
    const double z_coasted = editor_value(0, 2);
    editor_input_begin_frame();
    editor_tick();
    check(std::abs(editor_value(0, 2) - z_coasted) < 1e-4); // fully stopped, not still drifting
    // Sustained full throttle caps at vehicle_max_forward (9 units/s): the per-tick advance
    // settles at 9/60, not an unbounded climb.
    editor_begin();
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 1) == 1);
    check(editor_commit() == 1);
    editor_input_begin_frame();
    editor_key(key_w, 1);
    for (int i = 0; i < 150; ++i) { // 2.5s: comfortably past the ~1.5s ramp to max
        editor_input_begin_frame();
        editor_tick();
    }
    const double z_before = editor_value(0, 2);
    editor_input_begin_frame();
    editor_tick();
    check(std::abs((editor_value(0, 2) - z_before) - 9.0 / 60.0) < 1e-3);

    std::cout << "Editor bridge: deterministic fixed steps, atomic replacement, finite bounds, "
                 "reset, limits, authored box size, hierarchy-child exclusion, player-only WASD "
                 "movement, jump/sustained-flight, Collider obstacle blocking, melee, ranged blast "
                 "combat, frame/tick-decoupled combat edges, shooter self-immunity, camera-relative "
                 "movement, and vehicle accelerate/steer driving passed.\n";
}
