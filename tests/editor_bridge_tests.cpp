#include <cmath>
#include <iostream>
#include <limits>
#include <stdexcept>
extern "C" {
void editor_begin();
int editor_add(double, double, double, double, double, double, double, double, double, double,
               double, double, double, double);
int editor_commit();
void editor_tick();
void editor_input_begin_frame();
void editor_key(int, int);
double editor_value(int, int);
int editor_alive(int);
int editor_count();
int editor_projectile_count();
double editor_projectile_value(int, int);
}
namespace {
int add_unit(double x, double y, double z, double vx, double vy, double vz) {
    return editor_add(x, y, z, vx, vy, vz, 1, 1, 1, 0, 0, 0, 0, 0);
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
    check(editor_add(0, 5, 0, 0, 0, 0, 1, 4, 1, 0, 0, 0, 0, 0) == 1);
    check(editor_commit() == 1);
    for (int i = 0; i < 120; ++i)
        editor_tick();
    check(std::abs(editor_value(0, 1) - 2) < 1e-6);
    // Non-finite or non-positive size is rejected, same as position/velocity.
    editor_begin();
    check(editor_add(0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0) == 0);
    check(editor_commit() == 0);
    editor_begin();
    check(editor_add(0, 0, 0, 0, 0, 0, std::numeric_limits<double>::infinity(), 1, 1, 0, 0, 0, 0, 0) ==
          0);
    check(editor_commit() == 0);
    // A hierarchy child (is_child nonzero) is not simulated: its local position, even one
    // that reads as "under the ground plane" in a bare world-space sense, passes straight
    // through untouched instead of being resolved against a ground it isn't actually at.
    editor_begin();
    check(editor_add(1, -5, 2, 3, -9, 4, 1, 1, 1, 1, 0, 0, 0, 0) == 1);
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
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0) == 1);
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
    check(editor_add(0, 5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0) == 1);
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
    check(editor_add(3, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 1, 0, 0) == 1); // obstacle
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0) == 1); // player
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
    check(editor_add(3, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 1, 0, 0) == 1); // obstacle
    check(add_unit(0, 0.5, 0, 2, 0, 0) == 1); // plain mover, constant +x velocity
    check(editor_commit() == 1);
    for (int i = 0; i < 300; ++i)
        editor_tick();
    check(editor_value(1, 0) < 2.0 + 1e-3);

    // A hierarchy child authored with a Collider is not turned into a world obstacle: its
    // position is parent-relative, so an unrelated body must pass straight through unblocked.
    editor_begin();
    check(editor_add(3, 0.5, 0, 0, 0, 0, 1, 1, 1, 1, 0, 1, 0, 0) == 1); // child, ignored as obstacle
    check(add_unit(0, 0.5, 0, 2, 0, 0) == 1); // plain mover, constant +x velocity
    check(editor_commit() == 1);
    for (int i = 0; i < 300; ++i)
        editor_tick();
    check(editor_value(1, 0) > 4.0); // sailed straight past where the (inert) obstacle sits

    // Melee: F damages every Health entity overlapping the player by attack_damage (20) per
    // press; three hits defeats a fresh 60/60 target, which then reports dead instead of
    // stale position/health data.
    editor_begin();
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0) == 1);       // player, index 0
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 60, 60) == 1);     // target, index 1, overlapping
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
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 60, 60) == 1); // player with its own Health
    check(editor_commit() == 1);
    attack_once();
    check(std::abs(editor_value(0, 3) - 1.0) < 1e-6); // unchanged: F never hits the attacker

    // Ranged blast: G fires a projectile at the nearest Health entity; on contact it damages
    // that entity by blast_damage (15) and disappears.
    editor_begin();
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0) == 1);   // player, index 0
    check(editor_add(5, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 60, 60) == 1); // target, index 1
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
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0) == 1);    // player, index 0
    check(editor_add(10, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 60, 60) == 1); // far target, index 1
    check(editor_add(3, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 60, 60) == 1);  // near target, index 2
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
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0) == 1); // player only
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
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0) == 1);    // player, index 0
    check(editor_add(50, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 60, 60) == 1); // far-off target, index 1
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

    std::cout << "Editor bridge: deterministic fixed steps, atomic replacement, finite bounds, "
                 "reset, limits, authored box size, hierarchy-child exclusion, player-only WASD "
                 "movement, jump/sustained-flight, Collider obstacle blocking, melee, and ranged "
                 "blast combat passed.\n";
}
