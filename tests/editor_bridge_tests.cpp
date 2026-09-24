#include <cmath>
#include <iostream>
#include <limits>
#include <stdexcept>
#include <string>
extern "C" {
void editor_begin();
int editor_add(double, double, double, double, double, double, double, double, double, double,
               double, double, double, double, double, double, double, double, double, double,
               double);
void editor_set_script_source(int, const char *);
int editor_commit();
void editor_tick();
void editor_input_begin_frame();
void editor_set_camera_forward(double, double);
void editor_key(int, int);
double editor_value(int, int);
int editor_alive(int);
int editor_count();
const char *editor_script_error(int);
int editor_projectile_count();
double editor_projectile_value(int, int);
void editor_script_key(const char *, int);
const char *editor_take_animation_request(int);
void editor_set_body(int, int, double, int);
void editor_set_collider(int, int, double, double, double);
void editor_set_script_props(int, const char *);
void editor_set_name(int, const char *);
void editor_template_begin(const char *);
int editor_entity_count();
const char *editor_spawned_prefab(int);
int editor_take_commands();
const char *editor_command_text(int, int);
int editor_command_entity(int);
}
namespace {
int add_unit(double x, double y, double z, double vx, double vy, double vz) {
    return editor_add(x, y, z, vx, vy, vz, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0);
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
    check(editor_add(0, 5, 0, 0, 0, 0, 1, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
    check(editor_commit() == 1);
    for (int i = 0; i < 120; ++i)
        editor_tick();
    check(std::abs(editor_value(0, 1) - 2) < 1e-6);
    // Non-finite or non-positive size is rejected, same as position/velocity.
    editor_begin();
    check(editor_add(0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 0);
    check(editor_commit() == 0);
    editor_begin();
    check(editor_add(0, 0, 0, 0, 0, 0, std::numeric_limits<double>::infinity(), 1, 1, 0, 0, 0, 0, 0,
                      0, 0, 0, 0, 0.5, 0, 0) == 0);
    check(editor_commit() == 0);
    // A hierarchy child (is_child nonzero) is not simulated: its local position, even one
    // that reads as "under the ground plane" in a bare world-space sense, passes straight
    // through untouched instead of being resolved against a ground it isn't actually at.
    editor_begin();
    check(editor_add(1, -5, 2, 3, -9, 4, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
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
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
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
    check(editor_add(0, 5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
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
    check(editor_add(3, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1); // obstacle
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1); // player
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
    check(editor_add(3, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1); // obstacle
    check(add_unit(0, 0.5, 0, 2, 0, 0) == 1); // plain mover, constant +x velocity
    check(editor_commit() == 1);
    for (int i = 0; i < 300; ++i)
        editor_tick();
    check(editor_value(1, 0) < 2.0 + 1e-3);

    // A Sphere-shaped Collider (the last editor_add arg, collider_shape, nonzero) resolves as
    // an actual sphere, not silently as a box using its own Box.size like every Collider did
    // before this round -- Collider.type/radius have been authorable in the editor for a
    // while, just never read here. A large-radius (1.5) sphere stops an approaching mover much
    // farther from its own center (contact at 3 - 1.5 - 0.5 = 1.0) than the unit-box obstacle
    // case above did (contact at 2.0), proving the authored radius is what's actually resolved
    // against, not just accepted and ignored.
    editor_begin();
    check(editor_add(3, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 1.5, 0, 0) == 1); // sphere obstacle
    check(add_unit(0, 0.5, 0, 2, 0, 0) == 1); // plain mover, constant +x velocity
    check(editor_commit() == 1);
    for (int i = 0; i < 300; ++i)
        editor_tick();
    check(editor_value(1, 0) < 1.5); // stopped well short of the unit-box case's 2.0
    check(editor_value(1, 0) > 0.5); // and did actually approach, not stall at the start

    // A hierarchy child authored with a Collider is not turned into a world obstacle: its
    // position is parent-relative, so an unrelated body must pass straight through unblocked.
    editor_begin();
    check(editor_add(3, 0.5, 0, 0, 0, 0, 1, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1); // child, ignored as obstacle
    check(add_unit(0, 0.5, 0, 2, 0, 0) == 1); // plain mover, constant +x velocity
    check(editor_commit() == 1);
    for (int i = 0; i < 300; ++i)
        editor_tick();
    check(editor_value(1, 0) > 4.0); // sailed straight past where the (inert) obstacle sits

    // Melee: F damages every Health entity overlapping the player by attack_damage (20) per
    // press; three hits defeats a fresh 60/60 target, which then reports dead instead of
    // stale position/health data.
    editor_begin();
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);       // player, index 0
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 60, 60, 0, 0, 0, 0, 0.5, 0, 0) == 1);     // target, index 1, overlapping
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
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 60, 60, 0, 0, 0, 0, 0.5, 0, 0) == 1); // player with its own Health
    check(editor_commit() == 1);
    attack_once();
    check(std::abs(editor_value(0, 3) - 1.0) < 1e-6); // unchanged: F never hits the attacker

    // Ranged blast: G fires a projectile at the nearest Health entity; on contact it damages
    // that entity by blast_damage (15) and disappears.
    editor_begin();
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);   // player, index 0
    check(editor_add(5, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 60, 60, 0, 0, 0, 0, 0.5, 0, 0) == 1); // target, index 1
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
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);    // player, index 0
    check(editor_add(10, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 60, 60, 0, 0, 0, 0, 0.5, 0, 0) == 1); // far target, index 1
    check(editor_add(3, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 60, 60, 0, 0, 0, 0, 0.5, 0, 0) == 1);  // near target, index 2
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
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1); // player only
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
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);    // player, index 0
    check(editor_add(50, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 60, 60, 0, 0, 0, 0, 0.5, 0, 0) == 1); // far-off target, index 1
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
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);   // player, index 0
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 60, 60, 0, 0, 0, 0, 0.5, 0, 0) == 1); // target, index 1, overlapping
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
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 60, 60, 0, 0, 0, 0, 0.5, 0, 0) == 1); // player with its own Health, index 0
    check(editor_add(5, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 60, 60, 0, 0, 0, 0, 0.5, 0, 0) == 1); // target, index 1
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
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
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
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0.5, 0, 0) == 1); // player + vehicle
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
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0.5, 0, 0) == 1);
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
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0.5, 0, 0) == 1);
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

    // Vehicle.archetype actually changes handling, not just accepted and ignored the way
    // it was before this round: Sports (archetype 1) has higher accel/max_forward than Car
    // (archetype 0, vehicle_tuning's own original single-profile baseline), so the same
    // sustained throttle for the same duration must cover meaningfully more ground; Truck
    // (archetype 2) the opposite, less than Car.
    const auto vehicle_advance = [&](int archetype) {
        editor_begin();
        check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0.5, archetype, 0) == 1);
        check(editor_commit() == 1);
        editor_input_begin_frame();
        editor_key(key_w, 1);
        for (int i = 0; i < 150; ++i) {
            editor_input_begin_frame();
            editor_tick();
        }
        const double z = editor_value(0, 2);
        editor_key(key_w, 0);
        return z;
    };
    const double car_advance = vehicle_advance(0);
    const double sports_advance = vehicle_advance(1);
    const double truck_advance = vehicle_advance(2);
    check(sports_advance > car_advance * 1.2); // meaningfully faster, not just noise
    check(truck_advance < car_advance);

    // Coast-down time (ticks from throttle release to a full stop) must grow with vehicle
    // weight, not shrink: drag sets stop time (max_forward / drag), and a heavier vehicle
    // (Truck, Bus) is tuned for lower drag -- more coast, not less -- than Car, so it takes
    // longer, not less time, to coast to a stop after releasing the throttle. (An earlier
    // build of this round had Truck/Bus drag *higher* than Car's, which flipped this exact
    // relationship: it stopped them faster than Car, the opposite of the intended feel.)
    const auto vehicle_coast_ticks = [&](int archetype) {
        editor_begin();
        check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0.5, archetype, 0) == 1);
        check(editor_commit() == 1);
        editor_input_begin_frame();
        editor_key(key_w, 1);
        for (int i = 0; i < 300; ++i) { // comfortably past every archetype's ramp to max_forward
            editor_input_begin_frame();
            editor_tick();
        }
        editor_key(key_w, 0);
        int ticks = 0;
        double coast_previous_z = editor_value(0, 2);
        for (; ticks < 600; ++ticks) { // far more than enough to coast to a stop from any top speed
            editor_input_begin_frame();
            editor_tick();
            const double z = editor_value(0, 2);
            if (std::abs(z - coast_previous_z) < 1e-6)
                break;
            coast_previous_z = z;
        }
        return ticks;
    };
    check(vehicle_coast_ticks(2) > vehicle_coast_ticks(0)); // Truck coasts longer than Car
    check(vehicle_coast_ticks(3) > vehicle_coast_ticks(0)); // Bus coasts longer than Car

    // An out-of-range archetype is rejected outright, the same defensive posture as an
    // out-of-range collider_shape/radius -- vehicle_tuning has 4 rows (Bus is the last), so
    // index 4 is invalid.
    editor_begin();
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0.5, 4, 0) == 0);
    check(editor_commit() == 0);

    // The vehicle's collision footprint rotates with its heading, not just its rendered
    // mesh: a long, narrow vehicle (half_x 0.5, half_z 1.5) placed with a gap only its
    // *turned* footprint (half_x becomes 1.5 once it's rotated a quarter turn) can reach
    // must sit untouched facing its long axis away from a nearby wall, then get pushed
    // back the instant steering turns its wide axis toward it.
    editor_begin();
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 3, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0.5, 0, 0) == 1);   // vehicle, index 0
    check(editor_add(1.8, 0.5, 0, 0, 0, 0, 2, 1, 2, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1); // wall, index 1
    check(editor_commit() == 1);
    for (int i = 0; i < 10; ++i)
        editor_tick(); // settle; no throttle held, so it shouldn't move regardless
    check(std::abs(editor_value(0, 0)) < 1e-6); // untouched: yaw-0 footprint doesn't reach the wall
    editor_input_begin_frame();
    editor_key(key_d, 1);
    for (int i = 0; i < 43; ++i) // turn_rate (2.2 rad/s) * 43 ticks/60 ~= pi/2
        editor_tick();
    check(std::abs(editor_value(0, 4) - 3.14159265F / 2) < 0.05); // facing +x now
    editor_key(key_d, 0);
    for (int i = 0; i < 30; ++i)
        editor_tick(); // let physics detect and resolve the now-overlapping footprint
    check(editor_value(0, 0) < -0.1); // pushed back out, away from the wall it's now facing

    // AIAgent wander: with no Player anywhere in the world, an entity authored with
    // AIState (is_ai nonzero) moves on its own from tick one — nothing here ever presses
    // a key for it. agent.timer starts at 0, so the very first tick always finds it
    // "expired" and rolls a fresh direction/state immediately, which is why state is
    // asserted moving (Walking=1 or Running=2), never Idle=0, right after that first tick.
    editor_begin();
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0.5, 0, 0) == 1); // AI, no player, no pedestrian
    check(editor_commit() == 1);
    editor_tick();
    const double wander_state_first_tick = editor_value(0, 5);
    check(wander_state_first_tick == 1 || wander_state_first_tick == 2);
    for (int i = 0; i < 59; ++i)
        editor_tick(); // through tick 60 (1s): the shortest possible wander phase, so it must
                        // still be moving — see ai_wander_min_phase's own doc comment.
    check(std::abs(editor_value(0, 0)) + std::abs(editor_value(0, 2)) > 0.05); // actually moved from spawn

    // AIAgent chasing: a non-Pedestrian AI within ai_sense_radius of the Player closes
    // the distance between them, and reports state Chasing=5 from the very first tick —
    // unlike wander, chase/flee never consult agent.timer/rng, so this is deterministic
    // with no dependence on the seed.
    editor_begin();
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0.5, 0, 0) == 1); // AI, index 0
    check(editor_add(5, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1); // Player, index 1
    check(editor_commit() == 1);
    editor_tick();
    check(editor_value(0, 5) == 5); // Chasing
    const double chase_start_distance = editor_value(1, 0) - editor_value(0, 0);
    for (int i = 0; i < 59; ++i)
        editor_tick();
    check(editor_value(1, 0) - editor_value(0, 0) < chase_start_distance); // gap closed

    // A Chasing AIAgent that's actually caught the Player (overlapping boxes) hits back --
    // ai_attack_damage (8) per hit on a real cooldown (ai_attack_interval, 1s = 60 ticks),
    // not just once on contact and not every tick of contact either (which at 60 ticks/s
    // would down a 100 HP Player in well under a fifth of a second).
    editor_begin();
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0.5, 0, 0) ==
          1); // AI, index 0, overlapping the player
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 100, 100, 0, 0, 0, 0, 0.5, 0, 0) ==
          1); // Player with Health, index 1
    check(editor_commit() == 1);
    editor_tick();
    check(editor_value(0, 5) == 5);                                              // Chasing from tick one
    check(std::abs(editor_value(1, 3) - (100.0 - 8.0) / 100.0) < 1e-3);          // first hit landed immediately
    for (int i = 0; i < 30; ++i)
        editor_tick(); // well inside the 1s cooldown (30 of 60 ticks)
    check(std::abs(editor_value(1, 3) - (100.0 - 8.0) / 100.0) < 1e-3); // no second hit yet
    for (int i = 0; i < 35; ++i)
        editor_tick(); // 65 ticks since the first hit -- past the 60-tick cooldown with margin
    check(std::abs(editor_value(1, 3) - (100.0 - 16.0) / 100.0) < 1e-3); // second hit landed

    // Regression: an AIAgent editor.combat has already defeated *this same tick* must not
    // also land a hit in editor.ai_attack, even though it's still fully queryable (Health
    // and all) until FixedSystems flushes its deferred destroy -- see editor.ai_attack's
    // own doc comment (bridge.cpp) for why ordering it after editor.combat alone doesn't
    // guarantee this; only the explicit own_health->current > 0 check does. A 1 HP AIAgent
    // overlapping the Player, killed by the very same F press that -- without that check --
    // would also trigger its counterattack the same tick (editor.ai, order 1, already made
    // it Chasing before editor.combat, order 20, kills it, both within this one tick).
    editor_begin();
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1, 1, 0, 1, 0, 0, 0.5, 0, 0) ==
          1); // AI at 1 HP, index 0, overlapping the player
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 100, 100, 0, 0, 0, 0, 0.5, 0, 0) ==
          1); // Player with Health, index 1
    check(editor_commit() == 1);
    attack_once();
    check(editor_alive(0) == 0);                       // the AI died this tick
    check(std::abs(editor_value(1, 3) - 1.0) < 1e-6);   // Player untouched -- no counterattack landed

    // Fleeing never attacks, even overlapping the Player -- self-preservation, not hostility.
    editor_begin();
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 10, 100, 0, 1, 0, 0, 0.5, 0, 0) ==
          1); // AI at 10% health, index 0
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 100, 100, 0, 0, 0, 0, 0.5, 0, 0) ==
          1); // Player with Health, index 1, overlapping
    check(editor_commit() == 1);
    for (int i = 0; i < 90; ++i)
        editor_tick();
    check(editor_value(0, 5) == 4);                                  // Fleeing
    check(std::abs(editor_value(1, 3) - 1.0) < 1e-6);                // Player's health untouched

    // A Pedestrian never attacks either -- it can never enter Chasing at all (see the
    // Pedestrian wander case below), even placed overlapping the Player.
    editor_begin();
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0.5, 0, 0) ==
          1); // pedestrian, index 0
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 100, 100, 0, 0, 0, 0, 0.5, 0, 0) ==
          1); // Player with Health, index 1, overlapping
    check(editor_commit() == 1);
    for (int i = 0; i < 90; ++i)
        editor_tick();
    check(std::abs(editor_value(1, 3) - 1.0) < 1e-6); // Player's health untouched

    // A Player with no Health authored at all is simply never damaged -- the same opt-in
    // contract damage() already gives every other entity, not a special case for the
    // Player; must also not crash reaching for a Health that isn't there.
    editor_begin();
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0.5, 0, 0) ==
          1); // AI, index 0
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) ==
          1); // Player, no Health, index 1, overlapping
    check(editor_commit() == 1);
    for (int i = 0; i < 90; ++i)
        editor_tick(); // must not crash
    check(editor_alive(1) == 1);

    // AIAgent fleeing: the same setup, but with Health low enough (<= ai_flee_health_ratio)
    // that it runs from the Player instead of toward it — self-preservation outranks pursuit
    // even for a non-Pedestrian entity that would otherwise chase.
    editor_begin();
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 10, 100, 0, 1, 0, 0, 0.5, 0, 0) == 1); // AI at 10% health, index 0
    check(editor_add(5, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);    // Player, index 1
    check(editor_commit() == 1);
    editor_tick();
    check(editor_value(0, 5) == 4); // Fleeing
    const double flee_start_distance = editor_value(1, 0) - editor_value(0, 0);
    for (int i = 0; i < 59; ++i)
        editor_tick();
    check(editor_value(1, 0) - editor_value(0, 0) > flee_start_distance); // gap widened

    // Pedestrian: the same in-range setup as the chase case, but with is_pedestrian also
    // set — it never enters Chasing, falling back to wander instead, same as if the Player
    // weren't nearby at all. Not fleeing either: no Health means low_health is never true.
    editor_begin();
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0.5, 0, 0) == 1); // pedestrian, index 0
    check(editor_add(5, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1); // Player, index 1
    check(editor_commit() == 1);
    editor_tick();
    const double pedestrian_state = editor_value(0, 5);
    check(pedestrian_state == 1 || pedestrian_state == 2); // wandering, not 4 (Fleeing) or 5 (Chasing)

    // Pedestrian.archetype actually personalizes wander pace, not just accepted and
    // ignored the way it was before this round: Brisk (archetype 1) lingers less and
    // moves faster than Casual (archetype 0, pedestrian_tuning's own original
    // single-profile baseline, matching every AIAgent's wander feel before archetypes
    // existed), so it must cover meaningfully more ground over the same duration;
    // Lingering (archetype 2) the opposite, less than Casual. Each is the sole, first
    // entity in its own session, so all three share the exact same rng seed -- any
    // difference in total ground covered is down to the archetype alone, nothing else.
    const auto wander_distance = [&](int archetype, int ticks) {
        editor_begin();
        check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0.5, 0, archetype) ==
              1);
        check(editor_commit() == 1);
        double distance = 0.0, prev_x = editor_value(0, 0), prev_z = editor_value(0, 2);
        for (int i = 0; i < ticks; ++i) {
            editor_tick();
            const double x = editor_value(0, 0), z = editor_value(0, 2);
            distance += std::sqrt((x - prev_x) * (x - prev_x) + (z - prev_z) * (z - prev_z));
            prev_x = x;
            prev_z = z;
        }
        return distance;
    };
    const double casual_distance = wander_distance(0, 300);
    const double brisk_distance = wander_distance(1, 300);
    const double lingering_distance = wander_distance(2, 300);
    check(brisk_distance > casual_distance);
    check(lingering_distance < casual_distance);
    // Out-of-range Pedestrian.archetype is rejected the same way -- pedestrian_tuning has
    // 3 rows (Lingering is the last), so index 3 is invalid.
    editor_begin();
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0.5, 0, 3) == 0);
    check(editor_commit() == 0);

    // A chasing AIAgent is still ordinary physics underneath — it stops at a Collider wall
    // like anything else with a RigidBody, rather than the AI system's velocity write
    // bypassing collision resolution. Same obstacle geometry as the Player-vs-Collider case
    // above: unit box centered at x=3, near face at x=2.5.
    editor_begin();
    check(editor_add(3, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1); // wall, index 0
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0.5, 0, 0) == 1); // AI, index 1
    check(editor_add(5, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1); // Player, index 2
    check(editor_commit() == 1);
    for (int i = 0; i < 300; ++i)
        editor_tick(); // far more than enough time to cross the gap if the wall didn't stop it
    check(editor_value(1, 0) < 2.0 + 1e-3); // stopped at the wall's face, not past it
    check(editor_value(1, 0) > 1.5);        // and did actually approach, not stall at the start

    // Regression: an AIAgent returning to wander from Chasing/Fleeing must resume real
    // movement the instant it leaves sense range, not sit reporting the stale reactive
    // state at zero velocity. Neither reactive branch touches agent.timer, so without
    // explicitly resetting it on the way back to wander, an old frozen timer (here 0 the
    // whole time it's chasing, since chasing starts at spawn) reads as "not yet expired"
    // the moment it ticks negative, and was_idle reads the stale agent.state == Chasing
    // instead of Idle — sending it to a multi-second Idle phase instead of immediately
    // picking a new wander direction. The Player starts within sense range (spawns the
    // AI straight into Chasing, same as the dedicated Chasing case above) so the AI's own
    // position stays fully deterministic throughout — it's chasing, not free-wandering in
    // an unpredictable 2D direction — then flees at move_speed (4.8) once caught, just
    // outrunning the AI's own ai_run_speed cap (4.0) so the gap reliably opens up.
    editor_begin();
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0.5, 0, 0) == 1); // AI, index 0
    check(editor_add(3, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1); // Player, index 1
    check(editor_commit() == 1);
    for (int i = 0; i < 60; ++i)
        editor_tick(); // let it actually catch up and settle into chasing close by
    check(editor_value(0, 5) == 5); // Chasing
    editor_input_begin_frame();
    editor_key(key_d, 1); // Player flees at 4.8 units/s, faster than the AI's 4.0 chase cap
    bool crossed_out = false;
    int ticks_since_out = -1;
    // The AI chases in the same direction the Player flees, so the gap only opens at their
    // 0.8 units/s speed difference — reaching 6 units takes >450 ticks, not a couple hundred.
    for (int i = 0; i < 600; ++i) {
        editor_tick();
        const double dx = editor_value(1, 0) - editor_value(0, 0);
        const double dz = editor_value(1, 2) - editor_value(0, 2);
        const double distance = std::sqrt(dx * dx + dz * dz);
        if (!crossed_out && distance > 6.0) {
            crossed_out = true;
            ticks_since_out = 0;
        } else if (crossed_out && ++ticks_since_out >= 2) {
            break; // two ticks' grace after crossing back out, then check
        }
    }
    check(crossed_out);
    const double state_after_leaving = editor_value(0, 5);
    check(state_after_leaving == 1 || state_after_leaving == 2); // Walking/Running, not stuck Chasing
    editor_key(key_d, 0);

    // Script: editor_set_script_source's own doc comment explains why a script's source can't
    // travel through editor_add's all-double signature — a plain entity (no is_player/is_ai/etc,
    // same as add_unit) gets a working script that sets self.vx, and moves entirely on its own
    // with no key ever pressed and no AIState/Vehicle authored, proving the bridge wiring (not
    // just engine::script::Runtime's own already-covered native tests) actually runs it.
    editor_begin();
    check(add_unit(0, 0.5, 0, 0, 0, 0) == 1);
    editor_set_script_source(0, "function on_tick(dt) self.vx = 3 end");
    check(editor_commit() == 1);
    for (int i = 0; i < 30; ++i)
        editor_tick();
    check(editor_value(0, 0) > 0.4); // moved from spawn under its own script, no input at all
    check(std::string(editor_script_error(0)).empty()); // a working script reports no error

    // A script that fails to compile is surfaced through editor_script_error instead of being a
    // silently inert entity with no visible cause — the whole point of exposing it at all.
    editor_begin();
    check(add_unit(0, 0.5, 0, 0, 0, 0) == 1);
    editor_set_script_source(0, "function on_tick(dt this is not valid lua");
    check(editor_commit() == 1);
    editor_tick();
    check(!std::string(editor_script_error(0)).empty());
    check(std::abs(editor_value(0, 0)) < 1e-6); // broken from tick one, so it never actually moved

    // An entity with no script source ever set (editor_set_script_source not called) carries no
    // Script component at all and reports no error — a plain unscripted entity, not a broken one.
    editor_begin();
    check(add_unit(0, 0.5, 0, 0, 0, 0) == 1);
    check(editor_commit() == 1);
    editor_tick();
    check(std::string(editor_script_error(0)).empty());

    // editor_script_key reaches a script's own input.down/input.pressed -- entirely separate
    // from editor_key's own small W/A/S/D/Shift/F/G set (key_for's own contract): a plain
    // string, not one of key_for's seven codes, still reaches the sandbox's `input` table.
    // Generous tick counts and position margins throughout, not razor-thin single-tick deltas,
    // so this checks the actual direction of drift rather than exact per-tick arithmetic.
    editor_begin();
    check(add_unit(0, 0.5, 0, 0, 0, 0) == 1);
    editor_set_script_source(
        0, "function on_tick(dt) if input.pressed('1') then self.animate = 'hit' end "
           "self.vx = input.down('1') and 5 or -5 end");
    check(editor_commit() == 1);
    for (int i = 0; i < 10; ++i)
        editor_tick(); // '1' never reported held -- input.down is false, so vx stays negative
    check(editor_value(0, 0) < -0.5);
    check(std::string(editor_take_animation_request(0)).empty()); // never pressed
    editor_script_key("1", 1);
    editor_tick();
    check(std::string(editor_take_animation_request(0)) == "hit"); // input.pressed fired this tick
    editor_tick(); // still held, but not a fresh press -- no new request
    check(std::string(editor_take_animation_request(0)).empty());
    for (int i = 0; i < 20; ++i)
        editor_tick(); // held throughout -- vx positive long enough to reverse the earlier drift
    check(editor_value(0, 0) > 0.5);
    editor_script_key("1", 0);
    for (int i = 0; i < 20; ++i)
        editor_tick();
    check(editor_value(0, 0) < 0); // released -- drifting negative again

    {
        // Authored RigidBody mass/dynamic reach the runtime: a moving mass-1
        // crate hitting a resting mass-9 crate (both with colliders, ground
        // at 0) nudges it instead of stopping dead against it.
        editor_begin();
        check(editor_add(0, 0.5, 0, 5, 0, 0, 1, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        editor_set_body(0, 1, 1, 1);
        check(editor_add(1.2, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        editor_set_body(1, 1, 9, 1);
        check(editor_commit() == 1);
        for (int i = 0; i < 10; ++i)
            editor_tick();
        check(editor_value(1, 0) > 1.2); // the heavy crate moved
        check(editor_value(0, 0) < editor_value(1, 0) - 0.99); // no interpenetration

        // A kinematic authored body ignores gravity.
        editor_begin();
        check(editor_add(0, 5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        editor_set_body(0, 1, 1, 0);
        check(editor_commit() == 1);
        for (int i = 0; i < 30; ++i)
            editor_tick();
        check(std::abs(editor_value(0, 1) - 5) < 1e-6);

        // A trigger Collider does not block a mover passing through it.
        editor_begin();
        check(editor_add(0, 0.5, 0, 5, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        check(editor_add(1.5, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        editor_set_collider(1, 1, 0, 4294967295.0, 0);
        check(editor_commit() == 1);
        for (int i = 0; i < 60; ++i)
            editor_tick();
        check(editor_value(0, 0) > 3);

        // Out-of-range settings fail the whole commit, like editor_add's own validation.
        editor_begin();
        check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        editor_set_collider(0, 0, 32, 1, 0);
        check(editor_commit() == 0);
        editor_begin();
        check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        editor_set_body(0, 1, -1, 1);
        check(editor_commit() == 0);
    }
    {
        // Scripts reach the bridge host: world.spawn instantiates a prefab
        // template (which is never simulated itself), world.find uses
        // authored names, props arrive, and sound/ui/log queue as commands.
        editor_begin();
        editor_template_begin("Coin");
        check(editor_add(0, 0, 0, 0, 0, 0, 0.5, 0.5, 0.5, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        editor_set_body(-1, 1, 1, 0); // kinematic: stays where it spawns
        editor_set_collider(-1, 1, 0, 4294967295.0, 0);
        check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        editor_set_name(0, "Spawner");
        editor_set_script_source(0, R"lua(
            function on_start()
              local coin = world.spawn("Coin", props.x, 2, 0)
              log(tostring(coin ~= nil) .. " " .. tostring(world.find("Spawner") == self.id))
              sound.play("coin")
              ui.set_text("Score", props.label)
            end
        )lua");
        editor_set_script_props(0, "x\tn\t4\nlabel\ts\tScore: 1\nbad line\nflag\tb\t1");
        check(editor_commit() == 1);
        check(editor_entity_count() == 1);
        editor_tick();
        check(editor_entity_count() == 2);
        check(std::string(editor_spawned_prefab(1)) == "Coin");
        check(std::string(editor_spawned_prefab(0)).empty());
        check(editor_alive(1) == 1 && std::abs(editor_value(1, 0) - 4) < 1e-6 && std::abs(editor_value(1, 1) - 2) < 1e-6);
        check(editor_take_commands() == 3);
        check(std::string(editor_command_text(0, 0)) == "log" && std::string(editor_command_text(0, 1)) == "true true");
        check(std::string(editor_command_text(1, 0)) == "sound" && std::string(editor_command_text(1, 1)) == "coin");
        check(std::string(editor_command_text(2, 1)) == "Score" && std::string(editor_command_text(2, 2)) == "Score: 1");
        check(editor_command_entity(2) == 0);
        check(editor_take_commands() == 0);
    }
    std::cout << "Editor bridge: deterministic fixed steps, atomic replacement, finite bounds, "
                 "reset, limits, authored box size, hierarchy-child exclusion, player-only WASD "
                 "movement, jump/sustained-flight, Collider box and sphere obstacle blocking, "
                 "melee, ranged blast combat, frame/tick-decoupled combat edges, shooter "
                 "self-immunity, camera-relative movement, vehicle accelerate/steer driving, "
                 "vehicle footprint rotation, AIAgent wander/chase/flee/pedestrian behavior, "
                 "a Chasing AIAgent attacking the Player back on a real cooldown (and Fleeing/"
                 "Pedestrian/no-Health-Player never attacking), resuming wander cleanly after a "
                 "chase/flee ends, Vehicle/Pedestrian archetype handling profiles (and their "
                 "range validation), Script velocity control with compile-error reporting, and "
                 "editor_script_key reaching a script's own input.down/input.pressed/self.animate "
                 "(separate from editor_key's own bound W/A/S/D/Shift/F/G set), and authored "
                 "RigidBody mass/kinematic and Collider trigger/layer settings, and the script host "
                 "(prefab templates for world.spawn, names, props, sound/ui/log commands) passed.\n";
}
