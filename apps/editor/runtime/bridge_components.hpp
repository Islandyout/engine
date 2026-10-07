// The editor runtime's gameplay components and tuning (0.77.0, split from
// bridge.cpp): headings, drivers, routines, wildlife, the space simulation,
// AI, health, weapons and the rest, in namespace editor_bridge.
#pragma once
#include <cstdint>
#include "bridge_fields.hpp"
#include "bindings.hpp"
#include "engine/gameplay/character.hpp"
#include "engine/gameplay/car.hpp"
#include "engine/gameplay/melee.hpp"
#include "engine/gameplay/space.hpp"
#include "engine/gameplay/weapons.hpp"
#include "engine/nav/nav.hpp"
#include "engine/physics/physics.hpp"
#include "engine/script/script.hpp"
#include "engine/world/fixed_systems.hpp"
#include <algorithm>
#include <sstream>
#include <chrono>
#include <cstdio>
#include <cstring>
#include <cstdlib>
#include <cmath>
#include <iterator>
#include <map>
#include <memory>
#include <optional>
#include <string>
#include <vector>
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define EXPORT
#endif
namespace editor_bridge {
// Marks the (normally singular, but not enforced here — the authoring layer
// is responsible for that) entity WASD/jump input drives. Editor-local, like
// physics::Collider's absence of a "kind" field: the smallest marker that
// answers "is this the player," not a general engine concept.
struct PlayerMarker final {};

// Which row of vehicle_tuning (below) a Heading's accelerate/steer input is
// resolved against. Car is index 0 and matches this project's original,
// single-profile constants exactly, so an entity authored before archetypes
// existed (or one that never sets Vehicle.archetype) drives identically to
// before. Mirrors Vehicle.archetype's own declared meaning in
// Components.ts — main.ts's syncRuntime() passes that value straight through
// to editor_add's vehicle_archetype param, unlike is_vehicle's other data
// (yaw, footprint), which the simulation itself owns from tick 0 (see this
// struct's own doc comment above).
enum class VehicleArchetype : int { Car, Sports, Truck, Bus };

// Present on a PlayerMarker entity that also carries an authored Vehicle
// component: switches its horizontal movement from instant-direction,
// camera-relative strafing to momentum-based accelerate/steer (see
// vehicle_tuning below). yaw is radians; 0 faces +z (an arbitrary but fixed
// convention — see editor_add's doc comment for why an authored Rotation
// isn't consulted as a starting heading). speed is the signed distance per
// second currently traveled along that heading.
struct Heading final {
    float yaw{};
    float speed{};
    // Half the authored Box.size.x/z at creation — the vehicle's own local
    // footprint, independent of its current heading. editor.move recomputes
    // Box.size each tick as this footprint's axis-aligned bounding box at the
    // current yaw (see the "editor.move" system), so a non-square vehicle's
    // collision extents actually rotate with its rendered facing instead of
    // staying fixed to the world axes it happened to be authored facing.
    float half_x{};
    float half_z{};
    VehicleArchetype archetype{VehicleArchetype::Car};
    // Arcade cars (0.70.0, editor_set_car): engine::gameplay car dynamics
    // instead of the constant-turn-rate model above, on the player or on an
    // AI Driver. frozen holds the car still (race countdowns).
    bool arcade{false};
    bool frozen{false};
    engine::gameplay::CarSpec spec{};
    engine::gameplay::CarState car{};
    engine::gameplay::CarInput input{};
};

// An AI driver for an arcade car (0.70.0): follows a route of points (race
// lines, traffic loops), or chases a target entity (police), steering with
// engine::gameplay::steer_toward and braking for the corners ahead.
enum class DriveMode : int { Off, Race, Pursuit, Traffic };
struct Driver final {
    DriveMode mode{DriveMode::Race};
    std::vector<engine::Vec3> route;
    bool loop{true};
    std::size_t next{0};
    // Pursuit: the entity named target_name (resolved lazily; "" = the Player).
    std::string target_name;
    std::optional<engine::Entity> target;
    float skill{0.8F};      // 0..1: pace and racing-line commitment
    float aggression{0.5F}; // 0..1: rams in pursuit, pushes through traffic
    float speed_scale{1.0F};
    // Stuck recovery: backing out with the opposite lock.
    float stuck{0.0F};
    float reversing{0.0F};
    float reverse_steer{1.0F};
};

namespace space = engine::gameplay::space;

// Marks the entity the SpaceSystem flies (0.71.0); its Box follows the ship.
struct Spaceship final {};

// A daily routine (0.73.0): stops by hour of the day; the entity walks to
// the latest stop whose hour has passed (wrapping at midnight) and waits
// there. The hour is the scene clock, set by scripts (world.set_clock).
struct Routine final {
    struct Stop final {
        float hour{}, x{}, z{};
    };
    std::vector<Stop> stops;
    float speed{1.4F};
    int current{-1};
    // The way to the current stop around walls and through doorways
    // (0.76.0): nav-grid waypoints, found once per stop.
    std::vector<engine::Vec3> path;
    int path_stop{-1};
    float path_frame{-1};
};
// Wildlife (0.73.0): calm (its own wander, if it has an AIAgent) -> wary
// (stops and watches) inside `wary` metres of a threat -> flees inside
// `flee` (twice that from a sprinting player), never running more than
// `leash` metres from where it started. Threats: the walking player, and
// the ship while its engines run nearby.
struct Wildlife final {
    float wary{44}, flee{16}, speed{7}, leash{80};
    engine::Vec3 home{};
    bool homed{};
    int state{}; // 0 calm, 1 wary, 2 fleeing
};

// A scene's star system and its one flown ship (0.71.0). Authored entities
// live in the *site frame*: metres around a point on the site body's surface,
// +y along the local vertical (away from the body's centre), so the editor's
// flat-world systems (characters, physics, nav, scripts) work there
// unchanged while the ship flies the whole system in double precision.
struct SpaceSim final {
    space::System system;
    int site_body{0};
    space::DVec3 site_origin{}; // the site's surface point, relative to the body's centre
    space::DVec3 axis_x{1, 0, 0}, axis_y{0, 1, 0}, axis_z{0, 0, 1}; // site axes in the body frame
    double eva_range{1500};     // half-size of the walkable heightfield around the site
    double time{};
    double warp{1};
    space::ShipSpec spec;
    space::ShipState ship;
    std::optional<engine::Entity> ship_entity;
    double throttle{};          // the pilot's held throttle level
    // Mouse steering (0.75.0): the editor's virtual stick, -1..1 on each
    // axis; keys override it.
    double stick_pitch{};
    double stick_yaw{};
    space::Assist assist{space::Assist::stabilized};
    int target{-1};             // NAV target body
    bool piloting{true};
    bool controls{true};
    double vertical_applied{};
    std::vector<std::string> events;
    std::vector<space::DVec3> path; // predicted, relative to the reference body
    bool path_fixed{};              // path already body-fixed (it comes down)
    // Key levels last tick, for edges that survive multi-tick frames.
    bool previous_keys[8]{};
    // Walking anywhere (0.72.0): the frame the scene is drawn and walked in
    // moves to wherever the ship lands outside the authored site, and back
    // on return. The authored site (home) is kept to restore.
    int home_body{0};
    space::DVec3 home_origin{}, home_x{1, 0, 0}, home_y{0, 1, 0}, home_z{0, 0, 1};
    std::optional<engine::physics::Heightfield> home_ground;
    float home_ground_y{};
    bool away{};
    int frame_generation{};
    // The walker's move in the last on-foot re-anchor (0.75.0), new frame
    // minus old, and the generation it belongs to: the editor shifts its
    // camera and interpolation by it.
    space::DVec3 reframe_shift{};
    // How far the new frame turned the walker's surroundings about the
    // vertical (radians, three.js Y rotation; 0.76.0), so the camera and
    // the walker's facing turn with them.
    double reframe_yaw{};
    int reframe_generation{-1};
    // Authored colliders made non-solid while away (their old trigger flag).
    std::map<engine::Entity, bool> parked;
    // The stowed player's collider while piloting.
    std::optional<engine::Entity> stowed;
    bool stowed_trigger{};
    engine::physics::BodyType stowed_type{engine::physics::BodyType::Dynamic};
    // Several sites per scene (0.73.0): each Site entity anchors its child
    // entities around its own surface point. -1 is the home site (the
    // SpaceSystem's own), -2 the wilderness (a frame at no site).
    struct SiteInfo final {
        std::string name;
        int body{};
        space::DVec3 up{0, 1, 0};
        double radius{300};
        std::optional<engine::Entity> entity;
    };
    std::vector<SiteInfo> sites;
    std::map<engine::Entity, int> members; // entity -> site index; absent = home
    int active_site{-1};
    std::map<engine::Entity, engine::Vec3> pinned; // parked entities hold still
    // NAV autopilot (0.73.0).
    std::string autopilot_phase;
    bool reserve_used{};
    bool board_key{true}; // E beside the ship boards it (scripts can take E over)
    space::DVec3 wind_local{}; // m/s in the frame (x, z)

    [[nodiscard]] space::DVec3 site_position() const { return space::body_position(system, site_body, time); }
    // The site body's turn now (0.74.0): body-fixed -> non-rotating.
    [[nodiscard]] space::DQuat spin(int body = -1) const {
        return space::body_spin(system.bodies[static_cast<std::size_t>(body < 0 ? site_body : body)], time);
    }
    // A non-rotating vector around `body` (default: the site's) in its
    // body-fixed frame. The site, its axes and the terrain are body-fixed.
    [[nodiscard]] space::DVec3 fixed(space::DVec3 v, int body = -1) const {
        return space::rotate(space::conjugate(spin(body)), v);
    }
    // Absolute (system frame) -> site frame, and back.
    [[nodiscard]] space::DVec3 to_local(space::DVec3 absolute) const {
        const auto p = fixed(absolute - site_position()) - site_origin;
        return {space::dot(p, axis_x), space::dot(p, axis_y), space::dot(p, axis_z)};
    }
    [[nodiscard]] space::DVec3 from_local(space::DVec3 local) const {
        return site_position() + space::rotate(spin(), site_origin + axis_x * local.x + axis_y * local.y + axis_z * local.z);
    }
    [[nodiscard]] space::DVec3 ship_absolute() const {
        return (ship.ref >= 0 ? space::body_position(system, ship.ref, time) : space::DVec3{}) + ship.position;
    }
    // Body frame -> site frame rotation (the inverse of the axes' basis).
    [[nodiscard]] space::DVec3 rotate_to_local(space::DVec3 v) const {
        return {space::dot(v, axis_x), space::dot(v, axis_y), space::dot(v, axis_z)};
    }
    void event(std::string text) {
        if (events.size() < 64)
            events.push_back(std::move(text));
    }
};

inline const char *assist_name(space::Assist assist) {
    switch (assist) {
    case space::Assist::manual: return "manual";
    case space::Assist::stabilized: return "stabilized";
    case space::Assist::prograde: return "prograde";
    case space::Assist::retrograde: return "retrograde";
    case space::Assist::target: return "target";
    case space::Assist::autopilot: return "autopilot";
    }
    return "stabilized";
}
inline std::optional<space::Assist> parse_assist(std::string_view name) {
    if (name == "manual") return space::Assist::manual;
    if (name == "stabilized") return space::Assist::stabilized;
    if (name == "prograde") return space::Assist::prograde;
    if (name == "retrograde") return space::Assist::retrograde;
    if (name == "target") return space::Assist::target;
    if (name == "autopilot") return space::Assist::autopilot;
    return std::nullopt;
}

// "x,z x,z ..." (or ";" separated) route points on the ground.
inline std::vector<engine::Vec3> parse_route(std::string_view text) {
    std::vector<engine::Vec3> points;
    std::string token;
    const auto flush = [&] {
        const auto comma = token.find(',');
        if (comma != std::string::npos) {
            char *end = nullptr;
            const float x = std::strtof(token.c_str(), &end);
            const float z = std::strtof(token.c_str() + comma + 1, nullptr);
            if (std::isfinite(x) && std::isfinite(z) && end != token.c_str())
                points.push_back({x, 0, z});
        }
        token.clear();
    };
    for (const char c : text) {
        if (c == ' ' || c == ';' || c == '\n' || c == '\t')
            flush();
        else
            token += c;
    }
    flush();
    return points;
}
// The route point to aim for first: the nearest one, or the one after it
// when the car is already past it.
inline std::size_t route_start(const std::vector<engine::Vec3> &route, engine::Vec3 position, float yaw) {
    if (route.empty())
        return 0;
    std::size_t best = 0;
    float best_d = 1e30F;
    for (std::size_t i = 0; i < route.size(); ++i) {
        const float d = std::hypot(route[i].x - position.x, route[i].z - position.z);
        if (d < best_d) {
            best_d = d;
            best = i;
        }
    }
    const float ahead = (route[best].x - position.x) * std::sin(yaw) + (route[best].z - position.z) * std::cos(yaw);
    return ahead < 0 && best + 1 < route.size() ? best + 1 : best;
}


// Mirrors AIStateName's own order in apps/editor/src/scene/Components.ts —
// editor_value's field 5 returns this as a plain int, and main.ts would need
// updating in lockstep with any reordering here.
enum class AIState : int { Idle, Walking, Running, Driving, Fleeing, Chasing, Dead };

// Present on an entity that also carries an authored AIState component:
// drives its own RigidBody velocity each tick instead of ever reading
// InputState, the same way Heading drives a Vehicle. state/timer/dir_x/dir_z
// are simulation-owned from the first tick on — like Heading's yaw always
// starting at 0 regardless of an authored Rotation, the authored
// AIState.state string is a hint only editor_add ignores, not a starting
// value this reads back (see editor_add's own doc comment). rng is a
// per-entity xorshift32 state (see next_random below), seeded at creation
// from the entity's authoring order so wander behavior is deterministic and
// reproducible in tests instead of depending on wall-clock or process state.
struct AIAgent final {
    AIState state{AIState::Idle};
    float timer{0.0F};  // seconds remaining in the current wander phase
    float dir_x{0.0F};  // current wander heading (unit vector), meaningless outside Walking/Running
    float dir_z{1.0F};
    std::uint32_t rng{1};
    // Seconds remaining before this agent can land another hit -- see the
    // "editor.ai_attack" system below. Decremented every tick regardless of
    // state, so a cooldown earned mid-chase keeps draining even through a
    // Fleeing/wander detour rather than staying frozen and firing off
    // instantly the moment the agent re-enters Chasing.
    float attack_cooldown{0.0F};
    // Chasing follows an A* path around obstacles (see the "editor.ai"
    // system); recomputed every ai_repath_interval seconds.
    std::vector<engine::Vec3> path;
    float repath{0.0F};
};
// Which row of pedestrian_tuning (below) shapes a Pedestrian's own wander
// pace — how long it lingers between phases and how briskly it moves once
// it does. Casual is index 0 and matches the wander constants every
// AIAgent (Pedestrian or not) already used before archetypes existed, so an
// entity authored before this existed, or one that never sets
// Pedestrian.archetype, wanders exactly as before. Fleeing (a
// self-preservation reflex, not a personality trait) stays at ai_run_speed
// unscaled regardless of archetype — see the "editor.ai" system's own use of
// this. Mirrors Pedestrian.archetype's own declared meaning in
// Components.ts.
enum class PedestrianArchetype : int { Casual, Brisk, Lingering };

// Marker: an AIAgent that never enters AIState::Chasing regardless of how
// close the Player gets — a harmless wanderer, not a hostile one. Still
// flees on low health like any other AIAgent (fleeing isn't hostility, it's
// self-preservation). Meaningless without AIAgent, same as Heading needing
// PlayerMarker — simply ignored, not validated here.
struct Pedestrian final {
    PedestrianArchetype archetype{PedestrianArchetype::Casual};
};

// A small, fast, deterministic PRNG (xorshift32) — not cryptographic, just
// needs to be reproducible per entity across runs/platforms for wander
// behavior to be both natural-looking and testable. state must never be 0
// (a fixed point of xorshift); callers seed it accordingly.
inline std::uint32_t next_random(std::uint32_t &state) {
    state ^= state << 13;
    state ^= state >> 17;
    state ^= state << 5;
    return state;
}
// A pseudo-random float in [-1, 1].
inline float random_unit(std::uint32_t &state) {
    return static_cast<float>(next_random(state) % 2000) / 1000.0F - 1.0F;
}

// Bridge-local combat data, ported (not shared) from the native playground's
// own Health/Projectile structs — like those, scoped to what this editor
// needs, not general engine primitives, so each side keeps its own copy
// rather than the bridge depending on apps/native_playground.
struct Health final {
    float current{};
    float max{};
};
// A short-lived, gravity-free traveling attack: moves in a fixed direction
// at a fixed speed until it overlaps a Health entity or its lifetime runs
// out. Deliberately not a physics::RigidBody — a blast flies straight, not
// arcing under gravity like a thrown object.
struct Projectile final {
    engine::Vec3 velocity{};
    // The entity that fired it, excluded from its own hit detection — a
    // projectile spawns at its owner's own Box (see the "blast" binding
    // below), so without this it can, and did, immediately damage whoever
    // fired it once it had moved fractionally off spawn (owner's Health is
    // no more special than any other Health entity's to the overlap test
    // otherwise). Omitted from aggregate init when lifetime should keep its
    // default (must stay before `lifetime` for that to work).
    engine::Entity owner{};
    float lifetime{1.5F}; // seconds remaining; destroyed at/below 0
    // Weapon projectiles (0.61.0) carry their own damage, gravity scale and
    // explosion radius; the G blast keeps these defaults.
    float damage{15.0F};
    float gravity{0.0F};
    float splash{0.0F};
};

constexpr float move_speed = 4.8F; // units/s; matches the native playground's tuned feel
constexpr float jump_speed = 7.0F;
constexpr float fly_speed = 4.0F;
// Vehicle driving feel: a simplified arcade model, not real car physics —
// constant turn rate regardless of speed (no traction/slip curve), no
// distinction between engine power and braking. Reasonable-scope tuning, not
// a claim of realism. One row per VehicleArchetype, in that enum's declared
// order; Car (index 0) is this project's original, single-profile constants,
// unchanged, so archetype 0 (the default) drives identically to before this
// existed. The others are deliberately distinct on every axis, not just
// scaled uniformly, so each archetype has an actually different feel: Sports
// is faster and grippier than Car on every number, including drag, so it
// sheds speed releasing the throttle about as quickly as Car despite a much
// higher top speed. Truck and Bus both trade accel/top speed/turning for
// lower drag (less engine braking, more coast), Bus more so — heavier
// vehicles that take longer to get going and longer to stop: drag directly
// sets coast-down time (max_forward / drag seconds to stop from top speed
// with no input), so a heavier vehicle needs a *smaller* drag, not a larger
// one, to coast longer.
struct VehicleTuning {
    float accel;        // units/s^2
    float drag;         // units/s^2, applied opposing motion with no accel input
    float max_forward;  // units/s
    float max_reverse;  // units/s
    float turn_rate;    // rad/s at full steering lock
};
constexpr VehicleTuning vehicle_tuning[] = {
    /* Car    */ {6.0F, 3.0F, 9.0F, 4.0F, 2.2F},
    /* Sports */ {9.5F, 4.5F, 13.0F, 5.5F, 2.8F},
    /* Truck  */ {4.5F, 2.0F, 7.0F, 3.0F, 1.6F},
    /* Bus    */ {3.0F, 1.2F, 5.5F, 2.5F, 1.1F},
};
static_assert(std::size(vehicle_tuning) == 4, "one row per VehicleArchetype");

constexpr float ai_walk_speed = 1.6F;         // units/s; wander pace
constexpr float ai_run_speed = 4.0F;          // units/s; wander sprint, chase, and flee
constexpr float ai_sense_radius = 6.0F;       // units; distance at which an AIAgent notices the Player
constexpr float ai_flee_health_ratio = 0.3F;  // flee once current/max health drops to/below this
constexpr float ai_wander_min_phase = 1.0F;   // seconds; shortest idle or walk/run phase
constexpr float ai_wander_max_phase = 3.0F;   // seconds; longest idle or walk/run phase
constexpr float ai_repath_interval = 0.5F;    // seconds between chase path recomputations
// One row per PedestrianArchetype, in that enum's declared order. Casual
// (index 0) reproduces ai_wander_min_phase/ai_wander_max_phase and an
// unscaled walk/run speed exactly — this project's original, single-profile
// wander feel every AIAgent (Pedestrian or not) already used, so archetype 0
// (the default, and every non-Pedestrian AIAgent regardless of archetype)
// wanders identically to before this existed. Brisk lingers for shorter
// phases and moves faster once it does (a commuter); Lingering does the
// opposite (someone with nowhere to be).
struct PedestrianTuning {
    float min_phase;   // seconds; shortest idle or walk/run phase
    float max_phase;   // seconds; longest idle or walk/run phase
    float speed_mult;  // multiplies ai_walk_speed/ai_run_speed while wandering
};
constexpr PedestrianTuning pedestrian_tuning[] = {
    /* Casual    */ {ai_wander_min_phase, ai_wander_max_phase, 1.0F},
    /* Brisk     */ {0.5F, 1.5F, 1.3F},
    /* Lingering */ {2.0F, 5.0F, 0.6F},
};
static_assert(std::size(pedestrian_tuning) == 3, "one row per PedestrianArchetype");
constexpr float attack_damage = 20.0F;
// Weaker than melee (a ranged option, not a strict upgrade) and fast enough
// to cross a typical engagement distance well within its lifetime.
constexpr float blast_damage = 15.0F;
constexpr float blast_speed = 8.0F;
// Weaker than the Player's own melee (20) and on a real cooldown, not every
// tick of contact (which at 60 ticks/s would down a 100 HP Player in under a
// fifth of a second) -- a hostile AIAgent that's caught the Player is a
// real threat, not a one-hit kill.
constexpr float ai_attack_damage = 8.0F;
constexpr float ai_attack_interval = 1.0F; // seconds between hits from the same agent

// Small, explicit contract with the JS side (see editor_key's doc comment)
// instead of trusting engine::Key's own enum ordinals, which are free to
// change independently of this bridge's exported ABI.
inline engine::Key key_for(int code) {
    switch (code) {
    case 0:
        return engine::Key::w;
    case 1:
        return engine::Key::a;
    case 2:
        return engine::Key::s;
    case 3:
        return engine::Key::d;
    case 4:
        return engine::Key::left_shift;
    case 5:
        return engine::Key::f;
    case 6:
        return engine::Key::g;
    case 7:
        return engine::Key::c;
    default:
        return engine::Key::unknown;
    }
}

// A CharacterController (0.60.0): the entity moves through
// engine::gameplay's controller (acceleration, sprint/crouch, coyote time,
// jump buffering, step climbing) from the named input actions instead of the
// fixed WASD model. first_person: movement is relative to the look yaw the
// editor sends each frame (editor_set_look); otherwise to the camera's
// horizontal facing (editor_set_camera_forward).
struct Controller final {
    engine::gameplay::ControllerSettings settings;
    engine::gameplay::ControllerState state;
    bool first_person{true};
};

// Weapons (0.61.0): the entity's loadout and its engine::gameplay
// state. A Player fires from the named actions (fire, aim, reload,
// next_weapon, weapon_scroll, digit keys) along the look direction; any other
// entity fires when its script calls weapon.fire().
struct Arsenal final {
    std::vector<engine::gameplay::WeaponDef> weapons;
    engine::gameplay::WeaponState state;
    bool aiming{false};
    // Script-driven trigger for the next tick (weapon.fire / reload / select).
    bool script_fire{false};
    bool script_reload{false};
    int script_select{-1};
    std::optional<engine::Vec3> script_aim;
};

// Combat AI (0.62.0): a soldier that perceives hostiles (sight cone with
// line of sight, gunfire and explosions it can hear, being shot), patrols or
// guards, fights at a preferred range in bursts with its Weapons (or melee
// without them), strafes, takes cover to reload or when hurt, searches where
// it last saw a target, and moves through an engine::gameplay controller
// (acceleration, steps) along nav-grid paths. Teams: the Player is team 0.
enum class SoldierMode : int { patrol, investigate, combat, search, cover, flee };
enum class SoldierBehavior : int { patrol, guard, hunt };
struct Soldier final {
    // Authored (editor_set_soldier).
    int team{1};
    SoldierBehavior behavior{SoldierBehavior::patrol};
    float sight_range{25.0F};
    float fov_cos{0.57F}; // cosine of half the field of view
    float hearing{30.0F};
    float reaction{0.45F};
    float accuracy{0.6F};
    float preferred_range{12.0F};
    float move_speed{3.6F};
    int burst{4};
    float burst_pause{0.7F};
    bool use_cover{true};
    float flee_health{0.0F};
    float melee_damage{12.0F};
    std::vector<std::string> patrol_names;
    // Runtime state.
    bool initialized{false};
    engine::Vec3 home{};
    std::vector<engine::Vec3> patrol_points;
    std::size_t waypoint{0};
    float wait{0};
    SoldierMode mode{SoldierMode::patrol};
    std::optional<engine::Entity> target;
    engine::Vec3 last_known{};
    float since_seen{99.0F};
    float reaction_left{0};
    float awareness{0}; // 0..1, how close it is to noticing (drives the editor's "?" marker)
    int burst_left{0};
    float burst_cooldown{0};
    float strafe_timer{0};
    float strafe_dir{1};
    float search_timer{0};
    float melee_cooldown{0};
    std::optional<engine::Vec3> cover;
    float cover_timer{0};
    std::vector<engine::Vec3> path;
    engine::Vec3 path_goal{};
    float repath{0};
    float yaw{0}; // facing (sin yaw, 0, cos yaw)
    std::uint32_t rng{1};
};
// A sound soldiers can hear this tick: gunfire or an explosion.
struct Noise final {
    engine::Vec3 at{};
    int team{-1};
    float radius_scale{1.0F};
};

// What the editor hears about combat each frame (editor_take_weapon_events).
enum class WeaponEventKind : int { fire, impact, reload, reloaded, empty, switched, explode, damaged };
struct WeaponEvent final {
    WeaponEventKind kind{};
    int shooter{-1};
    int target{-1};
    engine::Vec3 point{};
    engine::Vec3 normal{};
    float value{};
    int flags{};
};
// WeaponEvent::flags bits.
constexpr int event_headshot = 1, event_killed = 2, event_flesh = 4;

// Melee (0.78.0): a fighter's moves and engine::gameplay state, the
// target it faces and strikes, and the slide a hit leaves it with. The
// Player fights from the light/heavy/kick/special/dodge/block/lock actions;
// with `ai` set, a melee brain drives it (any other entity).
struct Fighter final {
    std::vector<engine::gameplay::MoveDef> moves;
    engine::gameplay::FighterSettings settings;
    engine::gameplay::FighterState state;
    int team{1};
    bool ai{false};
    engine::gameplay::BrainSettings brain_settings;
    engine::gameplay::BrainState brain;
    float reach{1.0F};                 // its strikes' typical reach, for the brain
    float yaw{0};                      // facing (sin yaw, 0, cos yaw)
    std::optional<engine::Entity> lock;   // the Player's locked-on target
    std::optional<engine::Entity> target; // who it faces and fights this tick
    std::vector<engine::Entity> struck;   // already hit by the current move
    engine::Vec3 lunge_dir{0, 0, 1};
    engine::Vec3 slide{};              // knockback, decaying
    float pending_launch{0};           // upward m/s applied once hit-stop ends
    float dying{0};                    // > 0 once defeated: seconds until it's removed
    std::string script_move;           // melee.perform() for the next tick
    bool script_interrupt{false};      // ...cutting the current move short (Shadow Step)
    // Shadow Step (GATEBREAKER): after a perfect dodge, an attack press
    // within this many seconds steps behind the attacker and strikes with
    // the move list's shadow_step, if it has one.
    float counter_window{0};
    std::optional<engine::Entity> counter_target;
    // Stats (GATEBREAKER M2, melee.tune): what the Ledger's STR, AGI, INT
    // and SEN do to this fighter. Damage it deals, its clock (attack speed,
    // dodges, cooldowns), its skills' damage (moves that cost mana), and
    // its chance of a critical hit (1.5x).
    float stat_damage{1.0F};
    float stat_speed{1.0F};
    float stat_skill{1.0F};
    float stat_crit{0.0F};
    std::uint32_t crit_seed{0x9e3779b9U};
};
// What the editor hears about melee each frame (editor_take_melee_events).
enum class MeleeEventKind : int { start, hit, blocked, parried, dodged, guard_break, fire, land, ko, broken };
struct MeleeEvent final {
    MeleeEventKind kind{};
    int attacker{-1};
    int target{-1};
    engine::Vec3 point{};
    float value{};
    int move{-1};
    int flags{};
};
// MeleeEvent::flags bits.
constexpr int melee_finisher = 1, melee_launch = 2, melee_knockdown = 4, melee_heavy = 8, melee_killed = 16,
              melee_crit = 32;

// Authored Name, so scripts can world.find()/world.name() entities.
struct EntityName final {
    std::string value;
};
// Which prefab an entity was spawned from at runtime (world.spawn), so the
// editor can build its render object. Absent on authored entities.
struct SpawnedFrom final {
    std::string prefab;
};

// Registers every component the editor runtime uses. Shared by the live
// world and the prefab-template world so copy_entity() can move any of them.
void register_components(engine::World &w);

// A command a script sent to the editor (sound, UI text, log), drained by
// editor_take_commands().
struct OutboundCommand final {
    std::string kind;
    int entity_index{-1};
    std::string a;
    std::string b;
};

} // namespace editor_bridge
