#include <cstdio>
#include <cmath>
#include <cstdlib>
#include <iostream>
#include <limits>
#include <stdexcept>
#include <source_location>
#include <string>
#include <vector>
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
void editor_script_notify(int, const char *, const char *);
void editor_input_key(const char *, int);
void editor_input_mouse_move(double, double, double, double);
void editor_input_mouse_button(int, int, double, double);
void editor_input_wheel(double, double);
void editor_input_gamepad_connected(int);
void editor_input_gamepad_button(int, int);
void editor_input_gamepad_axis(int, double);
void editor_set_input_bindings(const char *);
const char *editor_bindings_error();
double editor_action_value(const char *);
void editor_ui_event(const char *, const char *);
const char *editor_profile_text();
void editor_set_rotation(int, double, double, double);
void editor_set_controller(int, int, double, double, double, double, double, double, double, double, double);
void editor_set_look(double, double);
double editor_controller_value(int, int);
void editor_set_weapons(int, const char *);
const char *editor_weapons_error();
double editor_weapon_value(int, int);
const char *editor_weapon_text(int, int, int);
int editor_take_weapon_events();
double editor_weapon_event(int, int);
void editor_set_melee(int, int, const char *, double, int, double, double, double, double, double);
const char *editor_melee_error();
void editor_set_melee_yaw(int, double);
void editor_set_melee_extra(int, double, double, double, double, double, int);
double editor_fighter_value(int, int);
const char *editor_fighter_text(int, int, int);
int editor_take_melee_events();
double editor_melee_event(int, int);
void editor_set_soldier(int, double, double, double, double, double, double, double, double, double, double, double,
                        int, double, double);
void editor_set_soldier_patrol(int, const char *);
double editor_soldier_value(int, int);
void editor_set_terrain(double, double, double, double, int, const char *);
void editor_add_obstacle(double, double, double, double, double, double);
double editor_terrain_height(double, double);
void editor_set_car(int, double, double, double, double, double, double, double, double, double, double);
void editor_set_driver(int, int, int, double, double, double);
void editor_set_driver_text(int, int, const char *);
double editor_vehicle_value(int, int);
void editor_space_begin(double, int, double, double, double, double, double);
void editor_push(int, double, double);
int editor_routine_stop(int);
double editor_space_ground(double, double);
void editor_space_body(const char *, int, double, double, double, double, double, double, double, double, double,
                       double, double);
void editor_set_spaceship(int, double, double, double, double, double, double, double, double, double, double, int,
                          double);
double editor_space_value(int);
void editor_space_site(int, const char *, int, double, double, double);
void editor_space_body_features(double, int, int, double);
double editor_space_body_spin(int, int);
void editor_space_member(int, int);
void editor_set_routine(int, const char *, double);
void editor_set_wildlife(int, double, double, double, double);
int editor_wildlife_state(int);
double editor_space_body_value(int, int);
double editor_planet_height(int, double, double, double);
int editor_space_path(int, double);
}
namespace {
std::string base64_floats(const std::vector<float> &values) {
    static const char *alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    std::string bytes(reinterpret_cast<const char *>(values.data()), values.size() * sizeof(float));
    std::string out;
    for (std::size_t i = 0; i < bytes.size(); i += 3) {
        const unsigned b0 = static_cast<unsigned char>(bytes[i]);
        const unsigned b1 = i + 1 < bytes.size() ? static_cast<unsigned char>(bytes[i + 1]) : 0;
        const unsigned b2 = i + 2 < bytes.size() ? static_cast<unsigned char>(bytes[i + 2]) : 0;
        const unsigned triple = (b0 << 16) | (b1 << 8) | b2;
        out += alphabet[(triple >> 18) & 63];
        out += alphabet[(triple >> 12) & 63];
        out += i + 1 < bytes.size() ? alphabet[(triple >> 6) & 63] : '=';
        out += i + 2 < bytes.size() ? alphabet[triple & 63] : '=';
    }
    return out;
}
int add_unit(double x, double y, double z, double vx, double vy, double vz) {
    return editor_add(x, y, z, vx, vy, vz, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0);
}
// key_for()'s own contract, mirrored here rather than re-derived from memory
// each call site: 0=W, 1=A, 2=S, 3=D, 4=Shift, 5=F (attack), 6=G (blast),
// 7=C (crouch/sit).
constexpr int key_w = 0, key_a = 1, key_s = 2, key_d = 3, key_shift = 4, key_f = 5, key_g = 6,
              key_c = 7;
} // namespace
int main() {
    const auto check = [](bool ok, std::source_location where = std::source_location::current()) {
        if (!ok)
            throw std::runtime_error{"editor bridge test failed at line " + std::to_string(where.line())};
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

    // Since 0.54.0 a chasing AIAgent follows an A* path, so it walks around a
    // wall between it and the Player instead of pressing against it.
    editor_begin();
    check(editor_add(3, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1); // wall, index 0
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0.5, 0, 0) == 1); // AI, index 1
    check(editor_add(5, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1); // Player, index 2
    check(editor_commit() == 1);
    for (int i = 0; i < 300; ++i)
        editor_tick();
    check(editor_value(1, 0) > 3.5); // went around the wall to the Player's side

    // It is still ordinary physics underneath: with no way around (a wall
    // spanning the whole navigation grid), it falls back to heading
    // straight for the Player and stops at the wall's face.
    editor_begin();
    check(editor_add(3, 0.5, 0, 0, 0, 0, 1, 1, 200, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1); // wall, index 0
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0.5, 0, 0) == 1); // AI, index 1
    check(editor_add(5, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1); // Player, index 2
    check(editor_commit() == 1);
    for (int i = 0; i < 300; ++i)
        editor_tick();
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

    // A bodiless entity (is_child, e.g. a director with no model) still runs its script and can
    // read and move itself.
    editor_begin();
    check(editor_add(1, 2, 3, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
    editor_set_script_source(0, "function on_tick(dt) if self.vx == 0 then self.x = self.x + 1 end end");
    check(editor_commit() == 1);
    editor_tick();
    check(std::string(editor_script_error(0)).empty());
    check(std::abs(editor_value(0, 0) - 2) < 1e-6);

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

        // Animator plumbing: anim.set/trigger become commands, and the
        // editor's on_anim_event/on_anim_state reach the script (others don't).
        editor_begin();
        check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        editor_set_script_source(0, R"lua(
            function on_start() anim.set("aiming", true); anim.set("speed", 2.5); anim.trigger("jump") end
            function on_anim_event(name) log("event " .. name) end
            function on_anim_state(name) log("state " .. name) end
            function on_destroy() log("should not be callable") end
        )lua");
        check(editor_commit() == 1);
        editor_tick();
        check(editor_take_commands() == 3);
        check(std::string(editor_command_text(0, 0)) == "anim_set" && std::string(editor_command_text(0, 2)) == "true");
        check(std::string(editor_command_text(1, 2)) == "2.5");
        check(std::string(editor_command_text(2, 0)) == "anim_trigger" && std::string(editor_command_text(2, 1)) == "jump");
        editor_script_notify(0, "on_anim_event", "footstep");
        editor_script_notify(0, "on_anim_state", "run");
        editor_script_notify(0, "on_destroy", "");
        check(editor_take_commands() == 2);
        check(std::string(editor_command_text(0, 1)) == "event footstep");
        check(std::string(editor_command_text(1, 1)) == "state run");
    }
    {
        // Native input (0.55.0): any key by DOM code drives both the default
        // actions and the bound movement; mouse and gamepad reach scripts.
        editor_begin();
        check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1); // Player
        editor_set_script_source(0, R"lua(
            function on_tick(dt)
              local x, y, dx, dy = input.mouse()
              if input.action_pressed("jump") then log("jump " .. input.action("move_y")) end
              if input.mouse_pressed(0) then log(string.format("click %.0f %.0f", x, y)) end
              if input.pad_pressed("a") then log(string.format("pad %.2f %s", input.pad_axis("lx"), tostring(input.pad_connected()))) end
              if input.action_pressed("fire") then log("fire") end
            end
        )lua");
        check(editor_commit() == 1);
        check(std::string(editor_bindings_error()).empty());
        editor_input_begin_frame();
        editor_input_key("KeyW", 1);
        editor_input_key("Space", 1);
        editor_tick();
        check(editor_action_value("move_y") == 1.0);
        check(editor_value(0, 2) < 0); // W still walks the Player (camera-relative -z)
        editor_input_begin_frame();
        editor_input_mouse_move(120, 80, 5, 0);
        editor_input_mouse_button(0, 1, 120, 80);
        editor_tick();
        editor_input_begin_frame();
        editor_input_gamepad_connected(1);
        editor_input_gamepad_axis(0, 0.5);
        editor_input_gamepad_button(0, 1);
        editor_tick();
        check(editor_take_commands() == 4);
        check(std::string(editor_command_text(0, 1)) == "jump 1.0");
        check(std::string(editor_command_text(1, 1)) == "click 120 80");
        check(std::string(editor_command_text(2, 1)) == "fire"); // mouse_left is bound to fire
        check(std::string(editor_command_text(3, 1)) == "pad 0.50 true");
        check(editor_action_value("move_x") > 0.4); // left stick past the dead zone

        // Custom bindings replace the defaults; bad text keeps them and reports.
        editor_begin();
        check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        editor_set_input_bindings("dash: q, pad_b\nzoom: wheel*2");
        check(editor_commit() == 1);
        editor_input_begin_frame();
        editor_input_key("KeyQ", 1);
        editor_input_wheel(0, 0.25);
        editor_tick();
        check(editor_action_value("dash") == 1.0 && editor_action_value("zoom") == 0.5);
        check(editor_action_value("jump") == 0.0); // defaults are gone
        editor_begin();
        check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        editor_set_input_bindings("jump space\n");
        check(editor_commit() == 1);
        check(std::string(editor_bindings_error()).find("line 1") != std::string::npos);
        editor_input_begin_frame();
        editor_input_key("Space", 1);
        editor_tick();
        check(editor_action_value("jump") == 1.0); // defaults kept

        // UI events reach every script's on_ui (numbers as numbers), and
        // ui.set_value/set_visible queue commands.
        editor_begin();
        for (int i = 0; i < 2; ++i) {
            check(editor_add(i, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
            editor_set_script_source(i, R"lua(
                function on_ui(name, value) log(name .. " " .. type(value) .. " " .. tostring(value)) end
                function on_start() ui.set_value("Health", 0.5); ui.set_visible("Menu", false) end
            )lua");
        }
        check(editor_commit() == 1);
        editor_tick();
        check(editor_take_commands() == 4);
        check(std::string(editor_command_text(0, 0)) == "ui_value" && std::string(editor_command_text(0, 2)) == "0.500000");
        check(std::string(editor_command_text(1, 0)) == "ui_visible" && std::string(editor_command_text(1, 2)) == "0");
        editor_ui_event("Volume", "0.75");
        editor_ui_event("Start", "click");
        check(editor_take_commands() == 4);
        check(std::string(editor_command_text(0, 1)) == "Volume number 0.75");
        check(std::string(editor_command_text(2, 1)) == "Start string click");
        // Every system reports a timing after a tick.
        const std::string profile = editor_profile_text();
        for (const char *name : {"editor.physics=", "editor.script=", "editor.ai=", "editor.nav="})
            check(profile.find(name) != std::string::npos);
    }
    // F queues a native "attack" animation request for the Player on every press, whether or
    // not it actually connects with a Health entity -- the request reaches
    // editor_take_animation_request the same channel a script's own self.animate would use
    // (engine::script::Runtime::request_animation), just triggered from editor.combat instead
    // of Lua. Checked both on a miss (nothing to hit) and a hit, since the request is tied to
    // the action, not the outcome.
    editor_begin();
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1); // player only, index 0 -- nothing to hit
    check(editor_commit() == 1);
    check(std::string(editor_take_animation_request(0)).empty()); // nothing requested yet
    attack_once();
    check(std::string(editor_take_animation_request(0)) == "attack");
    check(std::string(editor_take_animation_request(0)).empty()); // drained, not sticky
    editor_begin();
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1); // player, index 0
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 60, 60, 0, 0, 0, 0, 0.5, 0, 0) == 1); // target, index 1, overlapping
    check(editor_commit() == 1);
    attack_once();
    check(std::abs(editor_value(1, 3) - 40.0 / 60.0) < 1e-3); // it did land
    check(std::string(editor_take_animation_request(0)) == "attack");

    // G queues a native "blast" animation request for the Player on every press, same
    // "tied to the action" reasoning as F above -- checked with nothing to aim at, where the
    // shot itself is a no-op (editor_projectile_count stays 0) but the animation still fires.
    editor_begin();
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1); // player only, index 0
    check(editor_commit() == 1);
    editor_input_begin_frame();
    editor_key(key_g, 1);
    editor_tick();
    editor_key(key_g, 0);
    check(editor_projectile_count() == 0);                       // nothing to aim at
    check(std::string(editor_take_animation_request(0)) == "blast"); // animation still requested

    // A Chasing AIAgent landing a hit on the Player also queues its own "attack" animation
    // request (index 0, the AI, not the Player) -- but only on an actual landed hit, not
    // merely being in the Chasing state with its cooldown still running.
    editor_begin();
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0.5, 0, 0) ==
          1); // AI, index 0, overlapping the player
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 100, 100, 0, 0, 0, 0, 0.5, 0, 0) ==
          1); // Player with Health, index 1
    check(editor_commit() == 1);
    check(std::string(editor_take_animation_request(0)).empty()); // nothing requested pre-tick
    editor_tick();                                                 // first hit lands immediately
    check(std::string(editor_take_animation_request(0)) == "attack");
    check(std::string(editor_take_animation_request(1)).empty()); // never on the Player itself
    for (int i = 0; i < 30; ++i)
        editor_tick(); // well inside the cooldown -- no further hit, so no further request
    check(std::string(editor_take_animation_request(0)).empty());

    // Crouch (C): held, it zeroes the Player's own WASD input entirely -- W+C together leaves
    // the Player exactly where it started, where W alone (checked first, for contrast) moves
    // it normally. Released, ordinary WASD movement resumes.
    editor_begin();
    check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1); // player, index 0
    check(editor_commit() == 1);
    editor_input_begin_frame();
    editor_key(key_c, 1);
    editor_key(key_w, 1);
    for (int i = 0; i < 30; ++i)
        editor_tick();
    check(std::abs(editor_value(0, 2)) < 1e-9); // crouching: W had no effect at all
    editor_key(key_w, 0);
    editor_key(key_c, 0);
    editor_input_begin_frame();
    editor_key(key_w, 1);
    for (int i = 0; i < 30; ++i)
        editor_tick();
    check(editor_value(0, 2) < -0.1); // crouch released: W moves normally again (-z)
    editor_key(key_w, 0);

    {
        // A rotated Collider (editor_set_rotation) is an oriented box: a body
        // dropped on the high end of a ramp rests well above the ramp's
        // untilted 1-unit-tall top, and a non-finite rotation fails the commit.
        editor_begin();
        check(editor_add(0, 0.5, 0, 0, 0, 0, 4, 1, 8, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        editor_set_rotation(0, -0.35, 0, 0);
        check(editor_add(0, 6, 3, 0, 0, 0, 0.6, 1, 0.6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        check(editor_commit() == 1);
        for (int i = 0; i < 120; ++i)
            editor_tick();
        check(editor_value(1, 1) > 2.0);
        editor_begin();
        check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        editor_set_rotation(0, std::numeric_limits<double>::quiet_NaN(), 0, 0);
        check(editor_commit() == 0);
    }

    {
        // A first-person CharacterController moves from the named actions
        // relative to the look yaw, sprints, jumps with Space and reports its
        // eye height; a third-person one follows the camera's facing.
        editor_begin();
        check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        editor_set_controller(0, 0, 4.5, 7.5, 2.2, 1.1, 1.8, 1.1, 0.4, 45, 12);
        check(editor_commit() == 1);
        for (int i = 0; i < 5; ++i)
            editor_tick();
        check(std::abs(editor_value(0, 1) - 0.9) < 1e-3); // resized: 1.8 tall, feet on the ground
        check(std::abs(editor_controller_value(0, 0) - 1.656) < 1e-3);
        check(editor_controller_value(0, 2) == 1);
        editor_input_begin_frame();
        editor_set_look(1.5707963, 0);
        editor_input_key("KeyW", 1);
        for (int i = 0; i < 60; ++i)
            editor_tick();
        check(editor_value(0, 0) < -3.5 && std::abs(editor_value(0, 2)) < 1e-3); // yaw 90: forward is -x
        check(std::abs(editor_controller_value(0, 4) - 4.5) < 0.01);
        editor_input_begin_frame();
        editor_input_key("ShiftLeft", 1);
        for (int i = 0; i < 60; ++i)
            editor_tick();
        check(std::abs(editor_controller_value(0, 4) - 7.5) < 0.01 && editor_controller_value(0, 5) == 1);
        editor_input_begin_frame();
        editor_input_key("ShiftLeft", 0);
        editor_input_key("KeyW", 0);
        editor_input_key("Space", 1);
        editor_tick();
        for (int i = 0; i < 15; ++i)
            editor_tick();
        check(editor_value(0, 1) > 1.5); // airborne after Space
        editor_input_begin_frame();
        editor_input_key("Space", 0);
        for (int i = 0; i < 90; ++i)
            editor_tick();
        check(std::abs(editor_value(0, 1) - 0.9) < 1e-3);

        editor_begin();
        check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        editor_set_controller(0, 1, 4.5, 7.5, 2.2, 1.1, 1.8, 1.1, 0.4, 45, 12);
        check(editor_commit() == 1);
        editor_input_begin_frame();
        editor_set_camera_forward(1, 0);
        editor_input_key("KeyW", 1);
        for (int i = 0; i < 60; ++i)
            editor_tick();
        check(editor_value(0, 0) > 3.5); // third person: forward is the camera's facing (+x)
        editor_input_begin_frame();
        editor_input_key("KeyW", 0);

        // Invalid settings fail the commit.
        editor_begin();
        check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        editor_set_controller(0, 0, 4.5, 7.5, 2.2, 1.1, 1.0, 1.8, 0.4, 45, 12); // crouch taller than standing
        check(editor_commit() == 0);
    }

    {
        // Weapons: a first-person player fires the default rifle along the
        // look direction after the equip delay; a hit near the top of a tall
        // target is a headshot; events report the shot, the flesh impact and
        // the damage; R reloads from reserve; a Collider in the way stops it.
        const auto count_events = [&](int kind, int flags_mask = 0) {
            int found = 0;
            const int n = editor_take_weapon_events();
            for (int e = 0; e < n; ++e)
                if (static_cast<int>(editor_weapon_event(e, 0)) == kind &&
                    (static_cast<int>(editor_weapon_event(e, 10)) & flags_mask) == flags_mask)
                    ++found;
            return found;
        };
        editor_begin();
        check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        editor_set_controller(0, 0, 4.5, 7.5, 2.2, 1.1, 1.8, 1.1, 0.4, 45, 12);
        editor_set_weapons(0, "");
        check(editor_add(0, 0.9, -10, 0, 0, 0, 1, 1.8, 1, 0, 0, 0, 200, 200, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        editor_set_body(1, 1, 1, 0); // kinematic: stays put
        check(editor_commit() == 1);
        check(std::string(editor_weapons_error()).rfind("line 0: no weapons", 0) == 0); // empty text -> defaults
        check(editor_weapon_value(0, 5) == 3 && editor_weapon_value(0, 1) == 30);
        check(std::string(editor_weapon_text(0, 2, 0)) == "shotgun" && std::string(editor_weapon_text(0, 1, 1)) == "pistol");
        for (int i = 0; i < 30; ++i)
            editor_tick(); // equip
        editor_take_weapon_events();
        editor_input_begin_frame();
        editor_set_look(0, 0);
        editor_input_mouse_button(2, 1, 0, 0); // aim down sights: tight spread
        editor_input_mouse_button(0, 1, 0, 0);
        editor_tick();
        check(editor_weapon_value(0, 7) == 1 && editor_weapon_value(0, 4) < 1.0);
        editor_input_begin_frame();
        editor_input_mouse_button(0, 0, 0, 0);
        editor_input_mouse_button(2, 0, 0, 0);
        const int n = editor_take_weapon_events();
        int fires = 0, flesh = 0, headshots = 0;
        for (int e = 0; e < n; ++e) {
            const int kind = static_cast<int>(editor_weapon_event(e, 0));
            const int flags = static_cast<int>(editor_weapon_event(e, 10));
            fires += kind == 0;
            flesh += kind == 1 && (flags & 4) && editor_weapon_event(e, 2) == 1;
            headshots += kind == 7 && (flags & 1) && editor_weapon_event(e, 1) == 0 && editor_weapon_event(e, 9) == 48;
        }
        check(fires == 1 && flesh == 1 && headshots == 1);
        check(std::abs(editor_value(1, 3) - 152.0 / 200.0) < 1e-6);
        check(editor_weapon_value(0, 1) == 29);
        // Hold the trigger: automatic fire keeps going until the magazine runs dry.
        editor_input_begin_frame();
        editor_input_mouse_button(0, 1, 0, 0);
        for (int i = 0; i < 400; ++i)
            editor_tick();
        check(!editor_alive(1)); // 200 HP doesn't survive a magazine
        check(editor_weapon_value(0, 1) < 29);
        editor_input_begin_frame();
        editor_input_mouse_button(0, 0, 0, 0);
        editor_input_key("KeyR", 1);
        editor_tick();
        check(editor_weapon_value(0, 3) >= 0); // reloading
        editor_input_begin_frame();
        editor_input_key("KeyR", 0);
        for (int i = 0; i < 140; ++i)
            editor_tick();
        check(editor_weapon_value(0, 1) == 30 && editor_weapon_value(0, 3) == -1);
        // Digit 3 selects the shotgun after its equip time.
        editor_input_begin_frame();
        editor_input_key("Digit3", 1);
        editor_tick();
        check(editor_weapon_value(0, 0) == 2 && editor_weapon_value(0, 6) >= 0);
        check(count_events(5) == 1);
        editor_input_begin_frame();
        editor_input_key("Digit3", 0);

        // A wall between shooter and target absorbs the shot.
        editor_begin();
        check(editor_add(0, 0.5, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        editor_set_controller(0, 0, 4.5, 7.5, 2.2, 1.1, 1.8, 1.1, 0.4, 45, 12);
        editor_set_weapons(0, "pistol: model=pistol damage=50 equip=0");
        check(editor_add(0, 0.9, -10, 0, 0, 0, 1, 1.8, 1, 0, 0, 0, 100, 100, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        editor_set_body(1, 1, 1, 0);
        check(editor_add(0, 1.5, -5, 0, 0, 0, 4, 3, 0.5, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        check(editor_commit() == 1);
        check(std::string(editor_weapons_error()).empty());
        editor_input_begin_frame();
        editor_set_look(0, -0.05);
        editor_input_mouse_button(0, 1, 0, 0);
        editor_tick();
        check(count_events(1) == 1 && editor_value(1, 3) == 1);

        // A scripted turret fires a splash launcher with weapon.fire(dir); the
        // explosion damages both targets in range and the victims' scripts
        // hear on_damaged / on_death, and every script hears on_kill.
        editor_begin();
        check(editor_add(0, 1, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        editor_set_body(0, 1, 1, 0);
        editor_set_name(0, "Turret");
        editor_set_weapons(0, "rocket: model=launcher projectile speed=30 splash=3 damage=80 mag=1 reserve=1 equip=0");
        editor_set_script_source(0, "fired = false\nfunction on_tick(dt) if not fired then weapon.fire(1, 0, 0) fired = true end end\n"
                                    "function on_kill(victim, attacker) log(victim .. ' by ' .. attacker) end");
        check(editor_add(10, 1, 0, 0, 0, 0, 1, 1, 1, 0, 0, 1, 50, 50, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        editor_set_body(1, 1, 1, 0);
        editor_set_name(1, "Near");
        editor_set_script_source(1, "function on_damaged(amount, attacker, headshot) log('hit ' .. math.floor(amount)) end\n"
                                    "function on_death(attacker) log('dead') end");
        check(editor_add(11.5, 1, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 100, 100, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        editor_set_body(2, 1, 1, 0);
        check(editor_commit() == 1);
        for (int i = 0; i < 60; ++i)
            editor_tick();
        check(!editor_alive(1));                                     // direct-ish hit, killed
        check(editor_value(2, 3) < 1 && editor_value(2, 3) > 0.3); // splash, reduced by distance
        std::string logs;
        const int commands = editor_take_commands();
        for (int c = 0; c < commands; ++c)
            if (std::string(editor_command_text(c, 0)) == "log")
                logs += std::string(editor_command_text(c, 1)) + ";";
        check(logs.find("hit ") != std::string::npos && logs.find("dead;") != std::string::npos &&
              logs.find("Near by Turret;") != std::string::npos);
        check(count_events(6) == 1); // one explosion event
    }

    {
        // Combat AI. A guarding rifle soldier facing the player sees them,
        // reacts, and shoots in bursts until the player is hurt.
        const auto soldier = [&](int index, double behavior, double accuracy) {
            editor_set_soldier(index, 1, behavior, 25, 110, 30, 0.3, accuracy, 10, 3.6, 3, 0.4, 1, 0, 12);
        };
        const auto add_player = [&] {
            check(editor_add(0, 0.9, 0, 0, 0, 0, 0.7, 1.8, 0.7, 0, 1, 0, 100, 100, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        };
        editor_begin();
        add_player();
        check(editor_add(0, 0.9, -15, 0, 0, 0, 0.7, 1.8, 0.7, 0, 0, 0, 100, 100, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        soldier(1, 1, 1.0);
        editor_set_weapons(1, "rifle: model=rifle mode=auto rpm=600 damage=10 mag=30 reserve=90 equip=0 spread=0 aim_spread=0");
        check(editor_commit() == 1);
        check(editor_soldier_value(1, 3) == 1 && editor_soldier_value(0, 0) == -1);
        for (int i = 0; i < 30; ++i)
            editor_tick();
        check(editor_soldier_value(1, 0) == 2); // combat
        for (int i = 0; i < 150; ++i)
            editor_tick();
        check(editor_value(0, 3) < 0.9); // the player took hits

        // Behind a wall it can't see the player; gunfire it hears sends it to
        // investigate; on the way round the wall it engages.
        editor_begin();
        add_player();
        check(editor_add(0, 0.9, -15, 0, 0, 0, 0.7, 1.8, 0.7, 0, 0, 0, 100, 100, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        soldier(1, 1, 1.0);
        editor_set_weapons(1, "rifle: model=rifle damage=1 equip=0");
        check(editor_add(0, 1.5, -7, 0, 0, 0, 6, 3, 0.5, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        editor_set_controller(0, 0, 4.5, 7.5, 2.2, 1.1, 1.8, 1.1, 0.4, 45, 12);
        editor_set_weapons(0, "pistol: model=pistol damage=1 equip=0");
        check(editor_commit() == 1);
        for (int i = 0; i < 60; ++i)
            editor_tick();
        check(editor_soldier_value(1, 0) == 0); // still on guard, unaware
        editor_input_begin_frame();
        editor_set_look(3.14159, 0); // shoot away from it
        editor_input_mouse_button(0, 1, 0, 0);
        editor_tick();
        editor_input_begin_frame();
        editor_input_mouse_button(0, 0, 0, 0);
        editor_tick();
        check(editor_soldier_value(1, 0) == 1 && editor_soldier_value(1, 2) > 0.5); // heard it: investigating
        bool engaged = false;
        for (int i = 0; i < 600 && !engaged; ++i) {
            editor_tick();
            engaged = editor_soldier_value(1, 0) == 2;
        }
        check(engaged);
        check(std::abs(editor_value(1, 0)) > 2.5); // it walked around the 6-wide wall

        // A weaponless hunter knows where the player is, paths over and hits in melee.
        editor_begin();
        add_player();
        check(editor_add(10, 0.9, 10, 0, 0, 0, 0.7, 1.8, 0.7, 0, 0, 0, 50, 50, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        soldier(1, 2, 0.5);
        check(editor_commit() == 1);
        for (int i = 0; i < 600; ++i)
            editor_tick();
        check(editor_value(0, 3) < 1.0);

        // A patroller walks to its first named waypoint.
        editor_begin();
        check(editor_add(0, 0.9, 0, 0, 0, 0, 0.7, 1.8, 0.7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        soldier(0, 0, 0.5);
        editor_set_soldier_patrol(0, " A , B");
        check(editor_add(8, 0.5, 0, 0, 0, 0, 0.3, 0.3, 0.3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        editor_set_name(1, "A");
        check(editor_add(8, 0.5, 8, 0, 0, 0, 0.3, 0.3, 0.3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        editor_set_name(2, "B");
        check(editor_commit() == 1);
        for (int i = 0; i < 300; ++i)
            editor_tick();
        check(editor_value(0, 0) > 6); // reached A
        for (int i = 0; i < 400; ++i)
            editor_tick();
        check(editor_value(0, 2) > 5); // then headed to B

        // With an empty magazine it reloads from behind cover: a crate beside
        // it that blocks the player's line of sight.
        editor_begin();
        add_player();
        check(editor_add(0, 0.9, -12, 0, 0, 0, 0.7, 1.8, 0.7, 0, 0, 0, 100, 100, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        soldier(1, 1, 1.0);
        editor_set_weapons(1, "rifle: model=rifle damage=1 mag=2 reserve=30 reload=3 equip=0");
        check(editor_add(3, 1, -14, 0, 0, 0, 2, 2, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        check(editor_commit() == 1);
        bool took_cover = false;
        for (int i = 0; i < 240 && !took_cover; ++i) {
            editor_tick();
            took_cover = editor_soldier_value(1, 0) == 4;
        }
        check(took_cover);
        for (int i = 0; i < 90; ++i)
            editor_tick();
        check(editor_value(1, 2) < -14.2); // tucked in behind the crate (away from the player)

        // Out-of-range settings fail the commit.
        editor_begin();
        add_player();
        editor_set_soldier(0, 1, 7, 25, 110, 30, 0.3, 0.5, 10, 3.6, 3, 0.4, 1, 0, 12);
        check(editor_commit() == 0);
    }

    {
        // Arcade cars (0.70.0): the player's car accelerates on W and turns
        // right on D; an AI racer follows its route around a square; a police
        // car chases the player; scripts read state and reset/freeze cars.
        editor_begin();
        // 0: player car at the origin facing +z.
        check(editor_add(0, 0.8, 0, 0, 0, 0, 2, 1.4, 4.4, 0, 1, 1, 0, 0, 1, 0, 0, 0, 0.5, 0, 0) == 1);
        editor_set_car(0, 0, 60, 11, 26, 1.25, 0.45, 0.55, 9, 4, 6);
        // 1: racer on a 60 m square route, 100 m away.
        check(editor_add(100, 0.8, 0, 0, 0, 0, 2, 1.4, 4.4, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0.5, 0, 0) == 1);
        editor_set_car(1, 0, 40, 11, 26, 1.25, 0.45, 0.55, 9, 4, 6);
        editor_set_driver(1, 1, 1, 0.8, 0.5, 1);
        editor_set_driver_text(1, 0, "100,30 160,30 160,-30 100,-30");
        // 2: police car 40 m behind the player, chasing it.
        check(editor_add(0, 0.8, -40, 0, 0, 0, 2, 1.4, 4.4, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0.5, 0, 0) == 1);
        editor_set_car(2, 0, 50, 11, 26, 1.25, 0.45, 0.55, 9, 4, 6);
        editor_set_driver(2, 2, 0, 0.8, 0.2, 1);
        // 3: a script reading the player's car.
        check(editor_add(0, 30, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        editor_set_name(0, "Car");
        editor_set_script_source(3, "local ticks = 0 function on_tick(dt) ticks = ticks + 1 "
                                    "local car = world.find('Car') "
                                    "if ticks == 120 then local s, f, gear, rpm, n, drifting = vehicle.state(car) "
                                    "log(string.format('%.1f %d %s', s, gear, tostring(drifting))) end "
                                    "if ticks == 121 then vehicle.reset(car, 0, 0.8, 0, 0) vehicle.freeze(car, true) end end");
        check(editor_commit() == 1);
        check(editor_vehicle_value(0, 11) == 1 && editor_vehicle_value(3, 11) == 0); // arcade flag
        editor_input_begin_frame();
        editor_input_key("KeyW", 1);
        for (int i = 0; i < 90; ++i)
            editor_tick();
        const double speed = editor_vehicle_value(0, 0);
        check(speed > 15 && speed < 40 && editor_value(0, 2) > 8); // W accelerates the car down +z
        editor_input_begin_frame();
        editor_input_key("KeyD", 1);
        for (int i = 0; i < 20; ++i)
            editor_tick();
        check(editor_value(0, 4) < -0.1 && editor_value(0, 0) < 0); // D turns right (toward -x)
        editor_input_begin_frame();
        editor_input_key("KeyD", 0);
        for (int i = 0; i < 10; ++i)
            editor_tick();
        bool logged = false;
        const int commands = editor_take_commands();
        for (int c = 0; c < commands; ++c) {
            const std::string text = editor_command_text(c, 1);
            logged = logged || (text.size() > 4 && text.find("false") != std::string::npos);
        }
        check(logged); // vehicle.state reports speed, gear, drifting
        for (int i = 0; i < 30; ++i)
            editor_tick();
        check(std::abs(editor_value(0, 0)) < 0.01 && std::abs(editor_value(0, 2)) < 0.01 &&
                  editor_vehicle_value(0, 0) < 0.01); // vehicle.reset + freeze hold the car at the origin
        // The police car closed in on the (now parked) player.
        for (int i = 0; i < 240; ++i)
            editor_tick();
        const double gap = std::hypot(editor_value(2, 0) - editor_value(0, 0), editor_value(2, 2) - editor_value(0, 2));
        check(gap < 15); // pursuit closes on its target
        // The racer has been lapping its square route, staying near it.
        double far = 0;
        for (int i = 0; i < 600; ++i) {
            editor_tick();
            const double x = editor_value(1, 0), z = editor_value(1, 2);
            const double inside = std::max(std::max(100 - x, x - 160), std::max(-30 - z, z - 30));
            far = std::max(far, inside);
        }
        check(far < 15 && editor_vehicle_value(1, 0) > 5); // the racer laps its route
        editor_input_begin_frame();
        editor_input_key("KeyW", 0);
    }

    {
        // Spaceflight (0.71.0): a ship landed at a site on a small planet
        // lifts off on its belly thrusters, hovers, sets down, lets the
        // pilot out onto the curved ground and back in, and scripts read
        // the flight through space.*.
        editor_begin();
        // 0: the player (on foot once out of the ship).
        check(editor_add(0, 0.9, 0, 0, 0, 0, 0.7, 1.8, 0.7, 0, 1, 0, 100, 100, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        // 1: the ship, 20 m from the site centre, with a collider.
        check(editor_add(20, 2, 0, 0, 0, 0, 6, 3, 9, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        // 2: a script watching the flight.
        check(editor_add(0, 30, 40, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        editor_set_script_source(2, "local seen = {} function on_tick(dt) "
                                    "for _, e in ipairs(space.events()) do log('event ' .. e) end "
                                    "local s = space.state() "
                                    "if s.altitude > 5 and not seen.up then seen.up = true "
                                    "log(string.format('up %s %s %.0f', s.body, s.assist, s.fuel_max)) end end");
        editor_space_begin(6.4e12, 0, 30, 40, 300, 800, 0);
        editor_space_body("Tethys", -1, 1.6e6, 5027, 0, 0, 60000, 9, 9000, 1.05, 250, 3000, 7);
        editor_space_body("Vell", 0, 230000, 3850, 20, 7, 18000, 2.6, 0, 0, 120, 2000, 3);
        editor_set_spaceship(1, 0, 12000, 300000, 180000, 2.2, 1.3, 100, 1.2, 100, 1.6, 1, -1);
        check(editor_commit() == 1);
        check(editor_space_value(35) == 1 && editor_space_value(36) == 2);
        check(editor_space_value(0) == 1 && editor_space_value(19) == 1); // piloting, landed
        // Landed on the site's flat ground where it was authored.
        check(std::abs(editor_space_value(1) - 20) < 0.5 && std::abs(editor_space_value(3)) < 0.5);
        check(std::abs(editor_space_value(2) - 1.6) < 0.3); // gear clearance above the flat
        check(std::abs(editor_space_body_value(0, 1) + 60000) < 400); // Tethys' centre is straight down
        check(std::abs(editor_planet_height(0, 0, 1, 0)) < 400);
        for (int i = 0; i < 30; ++i)
            editor_tick();
        check(editor_space_value(19) == 1); // idle stays landed
        editor_input_begin_frame();
        editor_input_key("Space", 1);
        for (int i = 0; i < 120; ++i)
            editor_tick();
        editor_input_begin_frame();
        editor_input_key("Space", 0);
        check(editor_space_value(19) == 0 && editor_space_value(8) > 5); // lifted off
        check(editor_value(1, 1) > 5);                                   // the ship's Box rides along
        for (int i = 0; i < 120; ++i)
            editor_tick();
        const double hover = editor_space_value(8);
        for (int i = 0; i < 60; ++i)
            editor_tick();
        check(std::abs(editor_space_value(8) - hover) < 1.5); // stabilized hover
        check(editor_space_path(32, 0) > 0);
        editor_input_begin_frame();
        editor_input_key("KeyC", 1);
        for (int i = 0; i < 60 * 20 && editor_space_value(19) == 0; ++i)
            editor_tick();
        editor_input_begin_frame();
        editor_input_key("KeyC", 0);
        check(editor_space_value(19) == 1 && editor_space_value(14) == 1); // set down cleanly
        // Out of the ship: E while landed.
        editor_input_begin_frame();
        editor_input_key("KeyE", 1);
        editor_tick();
        editor_input_begin_frame();
        editor_input_key("KeyE", 0);
        editor_tick();
        check(editor_space_value(0) == 0); // on foot
        for (int i = 0; i < 60; ++i)
            editor_tick();
        const double feet = editor_value(0, 1) - 0.9;
        check(std::abs(editor_value(0, 0) - editor_value(1, 0)) < 9); // beside the ship
        check(feet > -2 && feet < 2);                                   // standing on the site ground
        // And back in.
        editor_input_begin_frame();
        editor_input_key("KeyE", 1);
        editor_tick();
        editor_input_begin_frame();
        editor_input_key("KeyE", 0);
        editor_tick();
        check(editor_space_value(0) == 1);
        bool saw_liftoff = false, saw_touchdown = false, saw_exit = false, saw_state = false;
        for (int n = editor_take_commands(), i = 0; i < n; ++i) {
            const std::string text = editor_command_text(i, 1);
            saw_liftoff |= text == "event liftoff";
            saw_touchdown |= text == "event touchdown";
            saw_exit |= text == "event exited";
            saw_state |= text == "up Tethys stabilized 100";
        }
        check(saw_liftoff && saw_touchdown && saw_exit && saw_state);

        // Walking anywhere (0.72.0): landed on Vell, far from the site, the
        // frame follows the ship -- the pilot can step out onto the moon --
        // and returns home when the ship lands back at the site.
        editor_begin();
        check(editor_add(0, 0.9, 0, 0, 0, 0, 0.7, 1.8, 0.7, 0, 1, 0, 100, 100, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        check(editor_add(20, 2, 0, 0, 0, 0, 6, 3, 9, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        check(editor_add(5, 1, 30, 0, 0, 0, 4, 2, 4, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1); // site scenery
        check(editor_add(0, 30, 40, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        editor_set_script_source(3, "local t = 0 function on_tick(dt) t = t + 1 "
                                    "if t == 2 then space.place_landed('Vell', 10, 20, 0) end "
                                    "if t == 3 then local s = space.state() log('frame ' .. s.frame .. ' ' .. tostring(s.away)) end "
                                    "if t == 200 then space.board() space.place_landed('Tethys', 30, 40, 0) end "
                                    "if t == 201 then local s = space.state() log('frame ' .. s.frame .. ' ' .. tostring(s.away)) end end");
        editor_space_begin(6.4e12, 0, 30, 40, 300, 800, 0);
        editor_space_body("Tethys", -1, 1.6e6, 5027, 0, 0, 60000, 9, 9000, 1.05, 250, 3000, 7);
        editor_space_body("Vell", 0, 230000, 3850, 20, 7, 18000, 2.6, 0, 0, 120, 2000, 3);
        editor_set_spaceship(1, 0, 12000, 300000, 180000, 2.2, 1.3, 100, 1.2, 100, 1.6, 1, -1);
        check(editor_commit() == 1);
        for (int i = 0; i < 10; ++i)
            editor_tick();
        check(editor_space_value(37) == 1 && editor_space_value(39) == 1 && editor_space_value(38) >= 1); // away, on Vell
        check(std::abs(editor_space_value(1)) < 1 && std::abs(editor_space_value(3)) < 1);               // ship at the new origin
        editor_input_begin_frame();
        editor_input_key("KeyE", 1);
        editor_tick();
        editor_input_begin_frame();
        editor_input_key("KeyE", 0);
        for (int i = 0; i < 120; ++i)
            editor_tick();
        check(editor_space_value(0) == 0);                    // stepped out onto Vell
        const double moon_feet = editor_value(0, 1) - 0.9;
        check(moon_feet > -3 && moon_feet < 3);               // standing on the moon's ground
        for (int i = 0; i < 100; ++i)
            editor_tick();
        check(editor_space_value(37) == 0 && editor_space_value(39) == 0); // home again
        bool saw_moon = false, saw_home = false;
        for (int n = editor_take_commands(), i = 0; i < n; ++i) {
            const std::string text = editor_command_text(i, 1);
            saw_moon |= text == "frame Vell true";
            saw_home |= text == "frame Tethys false";
        }
        check(saw_moon && saw_home);

        // Re-anchoring on foot (0.75.0): walking far across a wilderness
        // frame moves the frame under the walker -- no edge -- and the
        // ground is still under their feet.
        editor_begin();
        check(editor_add(0, 0.9, 0, 0, 0, 0, 0.7, 1.8, 0.7, 0, 1, 0, 100, 100, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        check(editor_add(20, 2, 0, 0, 0, 0, 6, 3, 9, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        check(editor_add(0, 30, 40, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        editor_set_script_source(2, "local t = 0 function on_tick(dt) t = t + 1 "
                                    "if t == 2 then space.place_landed('Vell', 10, 20, 0) end "
                                    "for _, e in ipairs(space.events()) do log('ev ' .. e) end end");
        editor_space_begin(6.4e12, 0, 30, 40, 300, 800, 0);
        editor_space_body("Tethys", -1, 1.6e6, 5027, 0, 0, 60000, 9, 9000, 1.05, 250, 3000, 7);
        editor_space_body("Vell", 0, 230000, 3850, 20, 7, 18000, 2.6, 0, 0, 120, 2000, 3);
        editor_set_spaceship(1, 0, 12000, 300000, 180000, 2.2, 1.3, 100, 1.2, 100, 1.6, 1, -1);
        check(editor_commit() == 1);
        for (int i = 0; i < 10; ++i)
            editor_tick();
        editor_input_begin_frame();
        editor_input_key("KeyE", 1);
        editor_tick();
        editor_input_begin_frame();
        editor_input_key("KeyE", 0);
        for (int i = 0; i < 60; ++i)
            editor_tick();
        check(editor_space_value(0) == 0); // on foot on Vell
        const double before = editor_space_value(38);
        double farthest = 0;
        for (int i = 0; i < 150; ++i) {
            editor_push(0, 5, 0);
            editor_tick();
            farthest = std::max(farthest, std::abs(editor_value(0, 0)));
        }
        check(editor_space_value(38) > before);                 // the frame moved
        check(editor_space_value(39) == 1);                     // still on Vell
        check(farthest < 800 - 2);                              // never held at an edge
        check(std::abs(editor_space_value(52)) > 100);          // the walker's shift is reported
        for (int i = 0; i < 30; ++i)
            editor_tick();
        const double walked_feet = editor_value(0, 1) - 0.9 - editor_space_ground(editor_value(0, 0), editor_value(0, 2));
        check(walked_feet > -3 && walked_feet < 3);             // still on the ground
        bool saw_reframe = false;
        for (int n = editor_take_commands(), i = 0; i < n; ++i)
            saw_reframe |= std::string(editor_command_text(i, 1)) == "ev reframe";
        check(saw_reframe);

        // Sites (0.73.0): landing at a second site moves the frame there,
        // wakes its own entities and parks home's; scripts see the site.
        editor_begin();
        check(editor_add(0, 0.9, 0, 0, 0, 0, 0.7, 1.8, 0.7, 0, 1, 0, 100, 100, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        check(editor_add(20, 2, 0, 0, 0, 0, 6, 3, 9, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        check(editor_add(5, 1, 30, 0, 0, 0, 4, 2, 4, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1); // home scenery
        check(editor_add(-5, 1, -30, 0, 0, 0, 4, 2, 4, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1); // Darsa scenery
        check(editor_add(0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1); // the Site
        check(editor_add(0, 30, 40, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        editor_set_script_source(5, "local t = 0 function on_tick(dt) t = t + 1 "
                                    "if t == 2 then space.place_landed('Tethys', 52.6, 68.4, 0) end "
                                    "if t == 3 then local s = space.state() log('site ' .. s.site .. ' ' .. tostring(s.away)) end "
                                    "if t == 60 then space.place_landed('Tethys', 30, 40, 0) end "
                                    "if t == 61 then local s = space.state() log('site [' .. s.site .. '] ' .. tostring(s.away)) end end");
        editor_space_begin(6.4e12, 0, 30, 40, 300, 800, 0);
        editor_space_body("Tethys", -1, 1.6e6, 5027, 0, 0, 60000, 9, 9000, 1.05, 250, 3000, 7);
        editor_set_spaceship(1, 0, 12000, 300000, 180000, 2.2, 1.3, 100, 1.2, 100, 1.6, 1, -1);
        editor_space_site(4, "Darsa", 0, 52.6, 68.4, 600);
        editor_space_member(3, 0);
        check(editor_commit() == 1);
        check(editor_space_value(40) == -1); // home
        for (int i = 0; i < 10; ++i)
            editor_tick();
        check(editor_space_value(40) == 0 && editor_space_value(37) == 1); // at Darsa
        check(std::abs(editor_space_value(1)) < 2 && std::abs(editor_space_value(3)) < 2);
        for (int i = 0; i < 60; ++i)
            editor_tick();
        check(editor_space_value(40) == -1 && editor_space_value(37) == 0); // home again
        bool saw_site = false, saw_back = false;
        for (int n = editor_take_commands(), i = 0; i < n; ++i) {
            const std::string text = editor_command_text(i, 1);
            saw_site |= text == "site Darsa true";
            saw_back |= text == "site [] false";
        }
        check(saw_site && saw_back);

        // A turning world (0.74.0): the site and the landed ship turn with
        // it, so in the site frame nothing drifts; stepping out still works.
        editor_begin();
        check(editor_add(0, 0.9, 0, 0, 0, 0, 0.7, 1.8, 0.7, 0, 1, 0, 100, 100, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        check(editor_add(20, 2, 0, 0, 0, 0, 6, 3, 9, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        editor_space_begin(6.4e12, 0, 30, 40, 300, 800, 0);
        editor_space_body("Tethys", -1, 1.6e6, 5027, 0, 0, 60000, 9, 9000, 1.05, 250, 3000, 7);
        editor_space_body_features(0.5, 0, 0, 1200);
        editor_set_spaceship(1, 0, 12000, 300000, 180000, 2.2, 1.3, 100, 1.2, 100, 1.6, 1, -1);
        check(editor_commit() == 1);
        const double sx = editor_space_value(1), sz = editor_space_value(3);
        for (int i = 0; i < 600; ++i)
            editor_tick();
        check(editor_space_value(19) == 1);                                                       // still landed
        check(std::abs(editor_space_value(1) - sx) < 0.2 && std::abs(editor_space_value(3) - sz) < 0.2); // no drift
        check(std::abs(editor_space_value(11)) < 0.01);                                             // no ground speed
        check(std::abs(editor_space_body_spin(0, 3) - 1) > 1e-4);                                   // it has turned
        editor_input_begin_frame();
        editor_input_key("KeyE", 1);
        editor_tick();
        editor_input_begin_frame();
        editor_input_key("KeyE", 0);
        for (int i = 0; i < 60; ++i)
            editor_tick();
        check(editor_space_value(0) == 0); // stepped out

        // A body with a bad parent fails the commit.
        editor_begin();
        editor_space_begin(6.4e12, 0, 0, 0, 0, 800, 0);
        editor_space_body("Lost", 3, 1000, 10, 0, 0, 100, 1, 0, 0, 0, 100, 1);
        check(editor_commit() == 0);
    }
    {
        // Routines and wildlife (0.73.0): a walker heads for the stop the
        // scene clock says; an animal flees a player inside its radius.
        editor_begin();
        check(editor_add(0, 0.9, 0, 0, 0, 0, 0.7, 1.8, 0.7, 0, 1, 0, 100, 100, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        check(editor_add(10, 0.9, 0, 0, 0, 0, 0.7, 1.8, 0.7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        editor_set_wildlife(1, 44, 16, 7, 80);
        check(editor_add(0, 0.9, -30, 0, 0, 0, 0.6, 1.8, 0.6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        editor_set_routine(2, "0 0 -30 sit; 12 20 -30 talk", 1.5); // activity words (0.75.0) are skipped
        check(editor_add(0, 30, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        editor_set_script_source(3, "function on_tick(dt) world.set_clock(13) end");
        check(editor_commit() == 1);
        for (int i = 0; i < 120; ++i)
            editor_tick();
        check(editor_wildlife_state(1) == 2 || editor_value(1, 0) > 16); // fled
        check(editor_value(1, 0) > 12);                                 // away from the player
        check(editor_wildlife_state(0) == -1);                          // the player isn't wildlife
        check(editor_value(2, 0) > 1.5);                                // walking to the 12:00 stop
        check(editor_routine_stop(2) == 1 && editor_routine_stop(0) == -1);
    }
    {
        // Around walls (0.76.0): a walker whose stop is behind a wall goes
        // round it on the nav grid instead of pressing into it.
        editor_begin();
        check(editor_add(0, 0.9, 0, 0, 0, 0, 0.6, 1.8, 0.6, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        editor_set_routine(0, "0 0 -24", 2.0);
        check(editor_add(0, 1.5, -12, 0, 0, 0, 14, 3, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        check(editor_commit() == 1);
        for (int i = 0; i < 60 * 30; ++i)
            editor_tick();
        check(editor_value(0, 2) < -20); // past the wall
    }
    {
        // Settling (0.75.0): after a load, everyone with a Routine stands at
        // the stop the clock says at once.
        editor_begin();
        check(editor_add(0, 0.9, 0, 0, 0, 0, 0.7, 1.8, 0.7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        editor_set_routine(0, "0 0 0 sit; 12 30 -20 talk", 1.5);
        check(editor_add(0, 30, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        editor_set_script_source(1, "local t = 0 function on_tick(dt) t = t + 1 if t == 1 then world.set_clock(13) space.call('settle') end end");
        check(editor_commit() == 1);
        for (int i = 0; i < 3; ++i)
            editor_tick();
        check(std::abs(editor_value(0, 0) - 30) < 0.5 && std::abs(editor_value(0, 2) + 20) < 0.5);
    }
    {
        // Soft radii (0.75.0): the walker and a big animal ease apart.
        editor_begin();
        check(editor_add(0, 0.9, 0, 0, 0, 0, 0.6, 1.8, 0.6, 0, 1, 0, 100, 100, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        check(editor_add(0.4, 0.8, 0, 0, 0, 0, 2.4, 1.6, 1.4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        editor_set_wildlife(1, 0.2, 0.1, 7, 80);
        check(editor_commit() == 1);
        for (int i = 0; i < 60; ++i)
            editor_tick();
        check(std::abs(editor_value(0, 0) - editor_value(1, 0)) > 1.3); // pushed apart
    }
    {
        // A level-sized terrain (260 m, 131x131) under a player and a soldier.
        editor_begin();
        check(editor_add(0, 6, 100, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        editor_set_controller(0, 0, 4.5, 7.5, 2.2, 1.1, 1.8, 1.1, 0.4, 45, 12);
        std::vector<float> big(131 * 131);
        for (std::size_t i = 0; i < big.size(); ++i)
            big[i] = static_cast<float>((i * 7919) % 13) * 0.5F;
        editor_set_terrain(0, 0, 0, 260, 131, base64_floats(big).c_str());
        check(editor_commit() == 1);
        for (int i = 0; i < 180; ++i)
            editor_tick();
        // Standing on the surface (heights reach 6 m), not fallen through it.
        const double feet = editor_controller_value(0, 6);
        check(std::isfinite(feet) && std::abs(feet - editor_terrain_height(0, editor_value(0, 2))) < 0.1);
    }

    {
        // Terrain: a 40x40 hill (3x3 heights, peak 4) under a first-person
        // player walking up its gentle side; the feet follow the surface. A
        // scripted raycast hits it; an obstacle blocks a body; bad heights
        // fail the commit.
        editor_begin();
        check(editor_add(-15, 3, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        editor_set_controller(0, 0, 4.5, 7.5, 2.2, 1.1, 1.8, 1.1, 0.4, 45, 12);
        check(editor_add(0, 20, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        editor_set_script_source(1, "function on_tick(dt) local hit, d, x, y, z = world.raycast(5, 30, 0, 0, -1, 0, 100) "
                                    "if hit == 'ground' then log(string.format('%.2f', y)) end end");
        editor_set_terrain(0, 1, 0, 40, 3, base64_floats({0, 0, 0, 0, 4, 0, 0, 0, 0}).c_str());
        editor_add_obstacle(-15, 1, 8, 4, 4, 1);
        check(editor_add(-15, 1.5, 4, 0, 0, 6, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        check(editor_commit() == 1);
        check(std::abs(editor_terrain_height(0, 0) - 5) < 1e-5 && std::isnan(editor_terrain_height(30, 0)));
        for (int i = 0; i < 30; ++i)
            editor_tick();
        const double start_feet = editor_controller_value(0, 6);
        check(std::abs(start_feet - (1 + 4 * 0.25)) < 0.05); // terrain height at x = -15 is 2
        editor_input_begin_frame();
        editor_set_look(-1.5707963, 0); // face +x, up the hill
        editor_input_key("KeyW", 1);
        for (int i = 0; i < 60; ++i)
            editor_tick();
        editor_input_begin_frame();
        editor_input_key("KeyW", 0);
        const double x = editor_value(0, 0);
        check(x > -12 && x < 0);
        check(std::abs(editor_controller_value(0, 6) - editor_terrain_height(x, editor_value(0, 2))) < 0.1);
        check(editor_controller_value(0, 6) > start_feet + 0.5); // climbed
        bool logged = false;
        const int commands = editor_take_commands();
        for (int c = 0; c < commands; ++c)
            logged = logged || std::string(editor_command_text(c, 1)) == "4.00"; // 1 + 4 * (1 - 5/20) at x = 5
        check(logged);
        check(editor_value(2, 2) < 8 - 0.5 - 0.49); // stopped by the obstacle's near face (z = 7.5)

        editor_begin();
        editor_set_terrain(0, 0, 0, 40, 3, "AAAA");
        check(editor_commit() == 0);
    }

    {
        // Game-support Lua APIs (0.66.0): world.heal caps at max, world.give_ammo
        // tops up another entity's reserve, ui.marker / game.pause queue commands.
        editor_begin();
        check(editor_add(0, 0.9, 0, 0, 0, 0, 0.7, 1.8, 0.7, 0, 1, 0, 40, 100, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        editor_set_name(0, "Player");
        editor_set_weapons(0, "rifle: model=rifle mag=30 reserve=10 equip=0");
        check(editor_add(5, 0.9, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        editor_set_body(1, 1, 1, 0);
        editor_set_script_source(1, "function on_start() local p = world.find('Player') world.heal(p, 30) world.heal(p, 500) "
                                    "world.give_ammo(p, 25) ui.marker('Goal', 1, 2, 3, 'Uplink') game.pause() end");
        check(editor_commit() == 1);
        editor_tick();
        check(editor_value(0, 3) == 1.0); // healed to the maximum, not beyond
        check(editor_weapon_value(0, 2) == 35);
        bool marker = false, paused = false;
        const int commands = editor_take_commands();
        for (int c = 0; c < commands; ++c) {
            const std::string kind = editor_command_text(c, 0);
            marker = marker || (kind == "ui_marker" && std::string(editor_command_text(c, 1)) == "Goal" &&
                                std::string(editor_command_text(c, 2)).find(",Uplink") != std::string::npos);
            paused = paused || kind == "game_pause";
        }
        check(marker && paused);
    }


    {
        // Melee (0.78.0). A Player fighter facing a training dummy: a light
        // press throws the jab, which lands inside its active window; mashing
        // chains jab -> cross -> hook; the hits build a combo and energy.
        const auto melee_events = [&](int kind) {
            int found = 0;
            const int n = editor_take_melee_events();
            for (int e = 0; e < n; ++e)
                if (static_cast<int>(editor_melee_event(e, 0)) == kind)
                    ++found;
            return found;
        };
        const auto settle = [&] {
            for (int i = 0; i < 3; ++i)
                editor_tick();
        };
        const auto add_player = [&](double z) {
            check(editor_add(0, 0.9, z, 0, 0, 0, 0.6, 1.8, 0.6, 0, 1, 0, 100, 100, 0, 0, 0, 0, 0.5, 0, 0) == 1);
            editor_set_controller(0, 0, 4.5, 7.5, 2.2, 1.1, 1.8, 1.1, 0.4, 45, 12);
            editor_set_melee(0, 0, "", 0, 0, 0.5, 0.5, 0.25, 0, 60);
        };
        const auto press = [&](const char *key, int ticks = 1) {
            editor_input_begin_frame();
            editor_input_key(key, 1);
            editor_tick();
            editor_input_begin_frame();
            editor_input_key(key, 0);
            for (int i = 1; i < ticks; ++i)
                editor_tick();
        };
        editor_begin();
        add_player(0);
        check(editor_add(0, 0.9, 1.25, 0, 0, 0, 0.6, 1.8, 0.6, 0, 0, 0, 500, 500, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        check(editor_commit() == 1);
        check(std::string(editor_melee_error()).empty());
        check(editor_fighter_value(0, 0) == 1 && editor_fighter_value(1, 0) == 0);
        settle();
        editor_take_melee_events();
        press("KeyJ");
        check(editor_fighter_value(0, 1) == 1 && std::string(editor_fighter_text(0, -1, 0)) == "jab" &&
              std::string(editor_fighter_text(0, -1, 1)) == "jab");
        check(melee_events(0) == 1); // start
        for (int i = 0; i < 12; ++i)
            editor_tick();
        check(editor_value(1, 3) < 1);
        check(melee_events(1) == 1); // hit
        std::vector<std::string> chain;
        for (int i = 0; i < 90; ++i) {
            if (i % 8 == 0)
                press("KeyJ");
            else
                editor_tick();
            const std::string move = editor_fighter_text(0, -1, 0);
            if (!move.empty() && (chain.empty() || chain.back() != move))
                chain.push_back(move);
        }
        check(chain.size() >= 3 && chain[0] == "jab" && chain[1] == "cross" && chain[2] == "hook");
        check(editor_fighter_value(0, 6) >= 2 && editor_fighter_value(0, 5) > 0); // combo, energy

        // A kick (F) knocks the dummy back; the F key no longer does the old
        // overlap punch for a fighter.
        editor_begin();
        add_player(0);
        check(editor_add(0, 0.9, 1.4, 0, 0, 0, 0.6, 1.8, 0.6, 0, 0, 0, 500, 500, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        check(editor_commit() == 1);
        settle();
        editor_input_begin_frame();
        editor_key(5, 1); // F
        editor_input_key("KeyF", 1);
        editor_tick();
        editor_input_begin_frame();
        editor_key(5, 0);
        editor_input_key("KeyF", 0);
        check(std::string(editor_fighter_text(0, -1, 0)) == "front_kick");
        for (int i = 0; i < 40; ++i)
            editor_tick();
        check(editor_value(1, 3) * 500 > 485 && editor_value(1, 3) * 500 < 495); // one kick (10), no extra punch
        check(editor_value(1, 2) > 1.45); // pushed back

        // Block and parry: an enemy fighter's scripted jab meets the Player's
        // block raised just in time -- parried, and the enemy staggers. Held
        // longer, the block takes chip damage instead.
        const auto duel = [&](int block_at) {
            editor_begin();
            add_player(0);
            check(editor_add(0, 0.9, 1.2, 0, 0, 0, 0.6, 1.8, 0.6, 0, 0, 0, 100, 100, 0, 0, 0, 0, 0.5, 0, 0) == 1);
            editor_set_melee(1, 0, "", 1, 0, 0.5, 0.5, 0.25, 0, 60);
            editor_set_melee_yaw(1, 3.14159265);
            editor_set_script_source(1, "t = 0\nfunction on_tick(dt) t = t + 1 if t == 20 then melee.perform('jab') end end\n"
                                        "function on_melee_hit(target, move, damage, outcome) log(move .. ' ' .. outcome) end");
            check(editor_commit() == 1);
            for (int i = 0; i < 60; ++i) {
                editor_input_begin_frame();
                editor_input_key("KeyR", i >= block_at ? 1 : 0);
                editor_tick();
            }
            std::string logs;
            const int commands = editor_take_commands();
            for (int c = 0; c < commands; ++c)
                if (std::string(editor_command_text(c, 0)) == "log")
                    logs += std::string(editor_command_text(c, 1)) + ";";
            editor_input_begin_frame();
            editor_input_key("KeyR", 0);
            editor_tick();
            return logs;
        };
        check(duel(23) == "jab parried;");
        check(duel(0) == "jab blocked;");
        check(editor_value(0, 3) < 1 && editor_value(0, 3) > 0.95); // chip damage only

        // Launch, land, lie down, get up: the Player's scripted uppercut
        // throws an enemy fighter into the air.
        editor_begin();
        add_player(0);
        editor_set_script_source(0, "t = 0\nfunction on_tick(dt) t = t + 1 if t == 2 then melee.perform('uppercut') end end");
        check(editor_add(0, 0.9, 1.1, 0, 0, 0, 0.6, 1.8, 0.6, 0, 0, 0, 100, 100, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        editor_set_melee(1, 0, "", 1, 0, 0.5, 0.5, 0.25, 0, 60);
        check(editor_commit() == 1);
        bool airborne = false, down = false, getup = false;
        double highest = 0;
        for (int i = 0; i < 240; ++i) {
            editor_tick();
            const int mode = static_cast<int>(editor_fighter_value(1, 1));
            airborne = airborne || mode == 4;
            down = down || (airborne && mode == 5);
            getup = getup || (down && mode == 6);
            highest = std::max(highest, editor_value(1, 1));
        }
        check(airborne && down && getup && highest > 2.0);
        check(editor_fighter_value(1, 1) == 0); // back on its feet

        // An AI fighter closes in and beats an idle Player; when its health
        // runs out it falls (mode dead) and is removed a few seconds later.
        editor_begin();
        add_player(0);
        check(editor_add(0, 0.9, 6, 0, 0, 0, 0.6, 1.8, 0.6, 0, 0, 0, 30, 30, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        editor_set_melee(1, 0, "", 1, 1, 1, 0, 0.2, 0, 60);
        editor_set_script_source(1, "function on_tick(dt) local mode = melee.state() if mode ~= 'idle' and mode ~= 'move' "
                                    "and mode ~= 'block' then log(mode) end end");
        check(editor_commit() == 1);
        for (int i = 0; i < 600 && editor_value(0, 3) > 0.7; ++i)
            editor_tick();
        check(editor_value(0, 3) <= 0.7);              // the AI did real damage
        check(editor_fighter_value(1, 13) == 0);         // fighting the Player
        editor_set_script_source(0, "");
        for (int i = 0; i < 30 && editor_fighter_value(1, 1) != 7; ++i) {
            press("KeyJ", 10);
        }
        check(editor_fighter_value(1, 1) == 7 && editor_alive(1)); // down for good, still there
        for (int i = 0; i < 260; ++i)
            editor_tick();
        check(!editor_alive(1));

        // Shadow Step: the Player rolls through an enemy's jab (a perfect
        // dodge), then attacks -- and appears behind the enemy, striking.
        {
            editor_begin();
            add_player(0);
            editor_set_melee(0, 2, "j: input=light hit=0.1-0.2 dmg=1\n"
                                   "roll: input=dodge dur=0.5 hit=0-0 cancel=0.36 dmg=0 lunge=0 free iframes=0-0.45\n"
                                   "shadow_step: input=light after=shadow_step dur=0.6 hit=0.05-0.16 dmg=5 reach=1.2\n",
                             0, 0, 0.5, 0.5, 0.25, 0, 60);
            check(editor_add(0, 0.9, 1.2, 0, 0, 0, 0.6, 1.8, 0.6, 0, 0, 0, 100, 100, 0, 0, 0, 0, 0.5, 0, 0) == 1);
            editor_set_melee(1, 0, "", 1, 0, 0.5, 0.5, 0.25, 0, 60);
            editor_set_melee_yaw(1, 3.14159265);
            editor_set_script_source(1, "t = 0\nfunction on_tick(dt) t = t + 1 if t == 20 then melee.perform('jab') end end");
            check(editor_commit() == 1);
            bool dodged = false;
            for (int i = 0; i < 60; ++i) {
                editor_input_begin_frame();
                editor_input_key("KeyX", i >= 22 && i < 24 ? 1 : 0);
                editor_input_key("KeyJ", i >= 34 && i < 36 ? 1 : 0);
                editor_tick();
                const int events = editor_take_melee_events();
                for (int e = 0; e < events; ++e)
                    dodged = dodged || editor_melee_event(e, 0) == 4; // dodged
                if (i == 36)
                    check(editor_fighter_value(0, 2) == 2);
            }
            check(dodged);
            check(editor_value(0, 2) > 1.7); // the enemy is at z = 1.2
            check(editor_value(1, 3) < 1);
        }

        // GATEBREAKER (0.80.0): a locked skill stays shut until melee.unlock,
        // and filling an enemy's poise bar Breaks it (a broken event).
        {
            editor_begin();
            add_player(0);
            editor_set_melee(0, 2, "j: input=light hit=0.05-0.1 dmg=8 stagger=30 reach=1.2\n"
                                   "skill: input=skill1 hit=0.05-0.1 dmg=8 reach=1.2 locked\n",
                             0, 0, 0.5, 0.5, 0.25, 0, 60);
            editor_set_script_source(0, "t = 0\nfunction on_tick(dt) t = t + 1\n"
                                        " if t == 2 then log(melee.perform('skill') and 'early' or 'shut') end\n"
                                        " if t == 4 then melee.unlock('skill') end\n"
                                        " if t == 6 then log(melee.perform('skill') and 'open' or 'still shut') end\n"
                                        " if t == 40 or t == 70 then melee.perform('j') end end");
            check(editor_add(0, 0.9, 1.1, 0, 0, 0, 0.6, 1.8, 0.6, 0, 0, 0, 500, 500, 0, 0, 0, 0, 0.5, 0, 0) == 1);
            editor_set_melee(1, 0, "", 1, 0, 0.5, 0.5, 0.25, 0, 60);
            editor_set_melee_extra(1, 50, 2, 0, 0, 0, 0);
            check(editor_commit() == 1);
            std::string logs;
            bool broke = false;
            for (int i = 0; i < 120; ++i) {
                editor_tick();
                const int events = editor_take_melee_events();
                for (int e = 0; e < events; ++e)
                    broke = broke || editor_melee_event(e, 0) == 9;
                const int commands = editor_take_commands();
                for (int c = 0; c < commands; ++c)
                    if (std::string(editor_command_text(c, 0)) == "log")
                        logs += std::string(editor_command_text(c, 1)) + ";";
            }
            check(logs == "shut;open;");
            check(broke && editor_fighter_value(1, 19) > 0); // Broken
        }

        // GATEBREAKER M2: melee.tune scales the damage a fighter deals and
        // sets its maximum health (keeping the share it has).
        {
            editor_begin();
            add_player(0);
            editor_set_melee(0, 2, "j: input=light hit=0.05-0.1 dmg=10 reach=1.2\n", 0, 0, 0.5, 0.5, 0.25, 0, 60);
            editor_set_script_source(0, "t = 0\nfunction on_tick(dt) t = t + 1\n"
                                        " if t == 2 then melee.tune(2.5, -1, 0, -1, 200) end\n"
                                        " if t == 10 then melee.perform('j') end end");
            check(editor_add(0, 0.9, 1.1, 0, 0, 0, 0.6, 1.8, 0.6, 0, 0, 0, 500, 500, 0, 0, 0, 0, 0.5, 0, 0) == 1);
            editor_set_melee(1, 0, "", 1, 0, 0.5, 0.5, 0.25, 0, 60);
            check(editor_commit() == 1);
            for (int i = 0; i < 60; ++i)
                editor_tick();
            check(std::abs(editor_value(1, 3) - 475.0 / 500.0) < 1e-3); // 10 x 2.5 off 500
            check(std::abs(editor_value(0, 3) - 1.0) < 1e-6);           // max 200, still full
        }

        // An AI fighter that starts out facing a fighting Player, across a
        // kinematic floor slab, walks the whole way in.
        editor_begin();
        check(editor_add(0, 0.9, 4, 0, 0, 0, 0.6, 1.8, 0.6, 0, 1, 1, 200, 200, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        editor_set_melee(0, 0, "", 0, 0, 0.5, 0.5, 0.25, 40, 60);
        editor_set_melee_yaw(0, 3.14159265);
        editor_set_collider(0, 0, 0, 4294967295.0, 0);
        editor_set_rotation(0, 0, 3.14159265, 0); // turned to face the goblin, as authored
        check(editor_add(0, 0.725, -3, 0, 0, 0, 0.5, 1.45, 0.5, 0, 0, 0, 90, 90, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        editor_set_melee(1, 0, "", 1, 1, 0.65, 0.4, 0.3, 0, 60);
        editor_set_melee_yaw(1, 0);
        editor_set_body(1, 1, 45, 1);
        editor_set_collider(1, 0, 0, 4294967295.0, 0);
        editor_set_body(0, 1, 70, 1);
        editor_set_controller(0, 1, 4.5, 7.5, 2.2, 1.1, 1.8, 1.1, 0.4, 45, 12);
        // A kinematic slab for the floor, as scenes author it.
        check(editor_add(0, -0.5, 0, 0, 0, 0, 16, 1, 16, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0.5, 0, 0) == 1);
        editor_set_body(2, 1, 1, 0);
        check(editor_commit() == 1);
        for (int i = 0; i < 240; ++i)
            editor_tick();
        check(editor_value(1, 2) > 1.5); // within reach of the Player at z = 4
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
                 "(separate from editor_key's own bound W/A/S/D/Shift/F/G set), F/G natively "
                 "queuing an attack/blast animation request on every press (hit or miss), a "
                 "Chasing AIAgent's own landed hit queuing its own attack request, C "
                 "(crouch/sit) freezing Player WASD input while held, authored "
                 "RigidBody mass/kinematic and Collider trigger/layer settings, the script host "
                 "(prefab templates for world.spawn, names, props, sound/ui/log commands), and native "
                 "keyboard/mouse/gamepad input with default and custom action bindings, rotated (oriented) colliders, first/third-person CharacterControllers, and weapons (hitscan, headshots, auto fire, reload, switching, cover, scripted splash projectiles, on_damaged/on_death/on_kill), and combat soldiers (sight, bursts, hearing, investigating around cover, reloading in cover, melee hunters, patrols), terrain (walking up a hill, scripted raycasts, obstacles), and game-support script APIs (heal, give_ammo, markers, pause), and arcade cars (driving, AI racing, pursuit, vehicle.* API), and spaceflight (landed start, hover, touchdown, exiting and boarding, walking anywhere, space.* API), and melee (jab/cross/hook chains, kicks and knockback, block and parry, launch/land/get up, an AI fighter, defeat) passed.\n";
}
