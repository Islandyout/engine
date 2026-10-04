#include "bindings.hpp"
#include "engine/gameplay/character.hpp"
#include "engine/gameplay/car.hpp"
#include "engine/gameplay/space.hpp"
#include "engine/gameplay/weapons.hpp"
#include "engine/nav/nav.hpp"
#include "engine/physics/physics.hpp"
#include "engine/script/script.hpp"
#include "engine/world/fixed_systems.hpp"
#include <algorithm>
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
namespace {
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
    space::Assist assist{space::Assist::stabilized};
    int target{-1};             // NAV target body
    bool piloting{true};
    bool controls{true};
    double vertical_applied{};
    std::vector<std::string> events;
    std::vector<space::DVec3> path; // predicted, relative to the reference body
    // Key levels last tick, for edges that survive multi-tick frames.
    bool previous_keys[8]{};
    // The stowed player's collider while piloting.
    std::optional<engine::Entity> stowed;
    bool stowed_trigger{};
    engine::physics::BodyType stowed_type{engine::physics::BodyType::Dynamic};

    [[nodiscard]] space::DVec3 site_position() const { return space::body_position(system, site_body, time); }
    // Absolute (system frame) -> site frame, and back.
    [[nodiscard]] space::DVec3 to_local(space::DVec3 absolute) const {
        const auto p = absolute - site_position() - site_origin;
        return {space::dot(p, axis_x), space::dot(p, axis_y), space::dot(p, axis_z)};
    }
    [[nodiscard]] space::DVec3 from_local(space::DVec3 local) const {
        return site_position() + site_origin + axis_x * local.x + axis_y * local.y + axis_z * local.z;
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

const char *assist_name(space::Assist assist) {
    switch (assist) {
    case space::Assist::manual: return "manual";
    case space::Assist::stabilized: return "stabilized";
    case space::Assist::prograde: return "prograde";
    case space::Assist::retrograde: return "retrograde";
    case space::Assist::target: return "target";
    }
    return "stabilized";
}
std::optional<space::Assist> parse_assist(std::string_view name) {
    if (name == "manual") return space::Assist::manual;
    if (name == "stabilized") return space::Assist::stabilized;
    if (name == "prograde") return space::Assist::prograde;
    if (name == "retrograde") return space::Assist::retrograde;
    if (name == "target") return space::Assist::target;
    return std::nullopt;
}

// "x,z x,z ..." (or ";" separated) route points on the ground.
std::vector<engine::Vec3> parse_route(std::string_view text) {
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
std::size_t route_start(const std::vector<engine::Vec3> &route, engine::Vec3 position, float yaw) {
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
std::uint32_t next_random(std::uint32_t &state) {
    state ^= state << 13;
    state ^= state >> 17;
    state ^= state << 5;
    return state;
}
// A pseudo-random float in [-1, 1].
float random_unit(std::uint32_t &state) {
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
engine::Key key_for(int code) {
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

struct Runtime;
class BridgeHost final : public engine::script::Host {
public:
    explicit BridgeHost(Runtime &runtime) : runtime_(runtime) {}
    std::optional<engine::Entity> find(const engine::World &world, const std::string &name) override;
    std::string name_of(const engine::World &world, engine::Entity entity) override;
    std::optional<engine::Entity> spawn(engine::World &world, const std::string &prefab, engine::Vec3 position,
                                        engine::Vec3 velocity) override;
    void destroy(engine::World &world, engine::Entity entity) override { world.defer_destroy(entity); }
    bool health(const engine::World &world, engine::Entity entity, float &current, float &max) override;
    void damage(engine::World &world, engine::Entity entity, float amount) override;
    void heal(engine::World &world, engine::Entity entity, float amount) override;
    void emit(engine::Entity source, const std::string &kind, const std::string &a, const std::string &b) override;
    bool weapon(engine::World &world, engine::Entity self, const std::string &op, const std::vector<double> &args,
                std::vector<double> &out) override;
    bool vehicle(engine::World &world, engine::Entity entity, const std::string &op, const std::vector<double> &args,
                 const std::string &text, std::optional<engine::Entity> other, std::vector<double> &out) override;
    bool space(engine::World &world, const std::string &op, const std::vector<double> &args, const std::string &text,
               std::vector<double> &out, std::string &text_out) override;

private:
    Runtime &runtime_;
};

struct Runtime {
    engine::World world;
    // Prefab definitions, instantiated by world.spawn(): one entity per
    // prefab name, never simulated (FixedSystems only ever runs `world`).
    engine::World templates;
    std::map<std::string, engine::Entity> template_by_name;
    // Set by editor_template_begin(): the next editor_add goes into
    // `templates` under this name instead of the live scene.
    std::optional<std::string> adding_template;
    std::optional<engine::Entity> last_template;
    std::vector<OutboundCommand> commands;
    BridgeHost host{*this};
    engine::FixedSystems systems;
    engine::InputState input;
    std::vector<engine::Entity> entities;
    engine::u64 ticks{};
    // Set by editor_key() on a genuine F/G keydown edge; consumed (and
    // cleared) by the first fixed tick that actually acts on it, rather than
    // read from InputState::key_pressed() directly. editor_tick's own doc
    // comment notes a rendered frame can cover zero to five ticks sharing
    // one editor_input_begin_frame() call: key_pressed() stays true for
    // every tick in that batch, so a zero-tick frame would silently drop
    // the edge before any tick ever saw it, and a five-tick catch-up frame
    // would fire the action once per tick instead of once per press. These
    // flags decouple "a press happened" from frame/tick timing entirely.
    bool pending_attack{false};
    bool pending_blast{false};
    // Horizontal camera-forward direction, set by editor_set_camera_forward()
    // once per rendered frame. Defaults to world -z so a Runtime nothing ever
    // calls that on (every native test below included) behaves exactly like
    // the fixed-world-axis movement this replaced — camera-relative movement
    // degenerates to the old behavior when the camera happens to be looking
    // down -z, which this default simply assumes until told otherwise.
    float camera_forward_x{0.0F};
    float camera_forward_z{-1.0F};
    // First-person look direction in radians, set by editor_set_look() once
    // per rendered frame (the editor owns mouse look so it stays smooth at
    // any display rate). yaw 0 looks down -z; pitch > 0 looks up.
    float look_yaw{0.0F};
    float look_pitch{0.0F};
    // Physics settings shared by every system that steps or queries it.
    engine::physics::Config physics_config{};
    // The scene's terrain (editor_set_terrain), if any; physics_config and
    // the nav grid point at it.
    std::optional<engine::physics::Heightfield> terrain;
    int obstacle_count{0};
    engine::script::Runtime script_runtime;
    std::map<engine::Entity, std::string> script_errors;
    // Contact/trigger bookkeeping across physics steps (enter/stay/exit).
    engine::physics::Events physics_events;
    // Walkability grid for chasing AI and world.path(), rebaked from the
    // static colliders once a second (see the "editor.nav" system).
    // Covers a 260 m square (0.66.0; was 120 m) so outdoor levels on a
    // terrain get paths end to end.
    engine::nav::Grid nav_grid{engine::nav::Settings{0.5F, 0.4F, 0.35F, 2.0F, 130.0F}};
    // Named actions from the scene's InputActions bindings (or the
    // defaults), evaluated from `input` every tick.
    engine::ActionSystem actions{default_input_map()};
    std::string bindings_error;
    std::vector<WeaponEvent> weapon_events;
    std::string weapons_error;
    std::vector<Noise> noises;
    int team_of(const engine::World &w, engine::Entity entity) const {
        if (w.get<PlayerMarker>(entity))
            return 0;
        if (const auto *soldier = w.get<Soldier>(entity))
            return soldier->team;
        return -1;
    }
    int index_of(engine::Entity entity) const {
        for (std::size_t i = 0; i < entities.size(); ++i)
            if (entities[i] == entity)
                return static_cast<int>(i);
        return -1;
    }
    void push_event(WeaponEvent event) {
        if (weapon_events.size() < 1024)
            weapon_events.push_back(event);
    }
    // ---- Spaceflight (0.71.0): see SpaceSim.
    std::optional<SpaceSim> space;
    std::optional<engine::Entity> player_entity(const engine::World &w) const {
        for (const auto entity : w.query<engine::Box, PlayerMarker>())
            return entity;
        return std::nullopt;
    }
    bool stowed(engine::Entity entity) const { return space && space->piloting && space->stowed == entity; }
    // The terrain under a point for the ship: the body's surface, or a roof
    // or pad of the site's colliders just below it.
    double space_surface(int index, space::DVec3 p, const engine::physics::RaycastTargets *targets) const {
        const auto &sp = *space;
        double radius = space::surface_radius(sp.system.bodies[static_cast<std::size_t>(index)], space::normalized(p));
        if (index != sp.site_body || !targets)
            return radius;
        const auto local = sp.rotate_to_local(p - sp.site_origin);
        if (std::abs(local.x) > sp.eva_range || std::abs(local.z) > sp.eva_range || local.y < -100 || local.y > 3000)
            return radius;
        engine::physics::QueryFilter filter;
        if (sp.ship_entity)
            filter.ignore = *sp.ship_entity;
        const engine::Vec3 from{static_cast<float>(local.x), static_cast<float>(local.y + 3.0), static_cast<float>(local.z)};
        const auto hit = engine::physics::raycast(*targets, from, {0, -1, 0}, 40.0F, physics_config, filter);
        if (hit && !hit->hit_ground) {
            const space::DVec3 point{hit->point.x, hit->point.y, hit->point.z};
            const auto body_point = sp.site_origin + sp.axis_x * point.x + sp.axis_y * point.y + sp.axis_z * point.z;
            radius = std::max(radius, space::length(body_point));
        }
        return radius;
    }
    // A landed ship rests on whatever is under it: a pad or roof of the
    // site's colliders as well as the ground.
    void settle_landed(engine::World &w) {
        auto &sp = *space;
        if (!sp.ship.landed || sp.ship.ref < 0)
            return;
        const auto targets = engine::physics::raycast_targets(w);
        const double ground = space_surface(sp.ship.ref, sp.ship.position, &targets);
        sp.ship.position = space::normalized(sp.ship.position) * (ground + sp.spec.gear_clearance);
        if (sp.ship_entity && w.alive(*sp.ship_entity)) {
            const auto local = sp.to_local(sp.ship_absolute());
            w.get<engine::Box>(*sp.ship_entity)->center = {static_cast<float>(local.x), static_cast<float>(local.y),
                                                           static_cast<float>(local.z)};
        }
    }
    // The site-frame height of the walkable ground (the heightfield) at x, z.
    float site_ground(float x, float z) const {
        if (terrain && terrain->contains(x, z))
            return terrain->height_at(x, z);
        return physics_config.ground_y;
    }
    void stow_player(engine::World &w) {
        auto &sp = *space;
        const auto player = player_entity(w);
        if (!player)
            return;
        sp.stowed = *player;
        if (auto *collider = w.get<engine::physics::Collider>(*player)) {
            sp.stowed_trigger = collider->is_trigger;
            collider->is_trigger = true;
        }
        if (auto *body = w.get<engine::physics::RigidBody>(*player)) {
            sp.stowed_type = body->type;
            body->type = engine::physics::BodyType::Kinematic;
            body->velocity = {};
        }
    }
    void place_stowed(engine::World &w) {
        auto &sp = *space;
        if (!sp.piloting || !sp.stowed || !w.alive(*sp.stowed) || !sp.ship_entity)
            return;
        if (auto *box = w.get<engine::Box>(*sp.stowed))
            box->center = w.get<engine::Box>(*sp.ship_entity)->center;
        if (auto *body = w.get<engine::physics::RigidBody>(*sp.stowed))
            body->velocity = {};
    }
    // Out of the ship onto the ground beside it: only landed, inside the
    // walkable site.
    bool space_exit(engine::World &w) {
        auto &sp = *space;
        if (!sp.piloting || !sp.ship.landed || !sp.ship_entity || !sp.stowed || !w.alive(*sp.stowed))
            return false;
        const auto ship_box = *w.get<engine::Box>(*sp.ship_entity);
        const auto left = sp.rotate_to_local(space::rotate(sp.ship.attitude, {1, 0, 0}));
        const double side = std::max(ship_box.size.x, ship_box.size.z) * 0.5 + 1.5;
        const float x = static_cast<float>(ship_box.center.x + left.x * side);
        const float z = static_cast<float>(ship_box.center.z + left.z * side);
        if (std::abs(x) > sp.eva_range - 5 || std::abs(z) > sp.eva_range - 5) {
            sp.event("exit_blocked");
            return false;
        }
        auto &box = *w.get<engine::Box>(*sp.stowed);
        box.center = {x, site_ground(x, z) + box.size.y * 0.5F + 0.05F, z};
        if (auto *collider = w.get<engine::physics::Collider>(*sp.stowed))
            collider->is_trigger = sp.stowed_trigger;
        if (auto *body = w.get<engine::physics::RigidBody>(*sp.stowed)) {
            body->type = sp.stowed_type;
            body->velocity = {};
        }
        sp.piloting = false;
        sp.throttle = 0;
        sp.event("exited");
        return true;
    }
    bool space_board(engine::World &w) {
        auto &sp = *space;
        if (sp.piloting || !sp.ship_entity || sp.ship.destroyed)
            return false;
        const auto player = player_entity(w);
        if (!player)
            return false;
        sp.piloting = true;
        stow_player(w);
        place_stowed(w);
        sp.event("boarded");
        return true;
    }
    void space_tick(engine::World &w, const engine::InputState &in) {
        auto &sp = *space;
        constexpr double dt = 1.0 / 60.0;
        using engine::Key;
        const auto down = [&](Key k) { return in.key_down(k); };
        const Key edge_keys[8] = {Key::e, Key::t, Key::n, Key::x, Key::digit9, Key::digit0, Key::f1, Key::f2};
        bool pressed[8]{};
        for (int i = 0; i < 8; ++i) {
            const bool d = down(edge_keys[i]);
            pressed[i] = d && !sp.previous_keys[i];
            sp.previous_keys[i] = d;
        }
        space::ShipInput control;
        if (sp.piloting && sp.controls && !sp.ship.destroyed) {
            const auto axis = [&](std::initializer_list<Key> plus, std::initializer_list<Key> minus) {
                double v = 0;
                for (const auto k : plus)
                    if (down(k)) {
                        v += 1;
                        break;
                    }
                for (const auto k : minus)
                    if (down(k)) {
                        v -= 1;
                        break;
                    }
                return v;
            };
            const double throttle_axis = axis({Key::w}, {Key::s});
            sp.throttle = std::clamp(sp.throttle + throttle_axis * dt * 0.85, 0.0, 1.0);
            if (down(Key::left_shift) || down(Key::right_shift))
                sp.throttle = 1;
            if (pressed[3])
                sp.throttle = 0;
            control.pitch = axis({Key::up, Key::i}, {Key::down, Key::k});
            control.yaw = axis({Key::right, Key::l, Key::d}, {Key::left, Key::j, Key::a});
            if (!sp.ship.landed)
                control.roll = axis({Key::e}, {Key::q});
            control.vertical = axis({Key::space}, {Key::c, Key::left_control});
            if (pressed[1])
                sp.assist = sp.assist == space::Assist::manual ? space::Assist::stabilized : space::Assist::manual;
            if (pressed[2]) {
                // NAV cycles prograde -> retrograde -> target (if any) -> off.
                switch (sp.assist) {
                case space::Assist::prograde: sp.assist = space::Assist::retrograde; break;
                case space::Assist::retrograde:
                    sp.assist = sp.target >= 0 ? space::Assist::target : space::Assist::stabilized;
                    break;
                case space::Assist::target: sp.assist = space::Assist::stabilized; break;
                default: sp.assist = space::Assist::prograde; break;
                }
            }
            if (pressed[4])
                sp.warp = std::max(1.0, sp.warp / 2);
            if (pressed[5])
                sp.warp = std::min(1000.0, sp.warp * 2);
            if (pressed[0] && sp.ship.landed)
                space_exit(w);
        } else if (!sp.piloting && pressed[0] && sp.ship_entity && sp.ship.landed) {
            const auto player = player_entity(w);
            if (player) {
                const auto a = w.get<engine::Box>(*player)->center, b = w.get<engine::Box>(*sp.ship_entity)->center;
                const auto size = w.get<engine::Box>(*sp.ship_entity)->size;
                const float reach = std::max(size.x, size.z) * 0.5F + 4.0F;
                if (std::hypot(a.x - b.x, a.z - b.z) < reach)
                    space_board(w);
            }
        }
        control.throttle = sp.piloting ? sp.throttle : 0.0;
        control.assist = sp.assist;
        if (sp.target >= 0)
            control.target_direction = space::body_position(sp.system, sp.target, sp.time) - sp.ship_absolute();
        // Time warp only while coasting in space.
        const bool can_warp = sp.piloting && !sp.ship.landed && sp.ship.density == 0 && sp.throttle == 0 &&
                              control.vertical == 0 && !sp.ship.destroyed;
        if (!can_warp)
            sp.warp = 1;
        const double step = dt * sp.warp;
        std::optional<engine::physics::RaycastTargets> targets;
        const auto local_ship = sp.to_local(sp.ship_absolute());
        if (sp.ship.ref == sp.site_body && std::abs(local_ship.x) < sp.eva_range * 1.5 &&
            std::abs(local_ship.z) < sp.eva_range * 1.5)
            targets = engine::physics::raycast_targets(w);
        const engine::physics::RaycastTargets *targets_ptr = targets ? &*targets : nullptr;
        const space::SurfaceQuery query = [this, targets_ptr](int index, space::DVec3 p) {
            return space_surface(index, p, targets_ptr);
        };
        const int before = sp.ship.ref;
        const bool was_destroyed = sp.ship.destroyed;
        space::step_ship(sp.ship, sp.spec, control, sp.system, sp.time, step, query);
        sp.time += step;
        sp.vertical_applied = control.vertical;
        if (sp.ship.touched_down)
            sp.event(sp.ship.last_touchdown.rough ? "rough_touchdown" : "touchdown");
        if (sp.ship.lifted_off)
            sp.event("liftoff");
        if (sp.ship.changed_ref && sp.ship.ref != before)
            sp.event("soi:" + (sp.ship.ref >= 0 ? sp.system.bodies[static_cast<std::size_t>(sp.ship.ref)].name
                                                : std::string{"star"}));
        if (sp.ship.destroyed && !was_destroyed)
            sp.event("destroyed");
        sp.ship.touched_down = sp.ship.lifted_off = sp.ship.changed_ref = false;
        if (sp.ship_entity && w.alive(*sp.ship_entity)) {
            const auto local = sp.to_local(sp.ship_absolute());
            w.get<engine::Box>(*sp.ship_entity)->center = {static_cast<float>(local.x), static_cast<float>(local.y),
                                                           static_cast<float>(local.z)};
        }
        place_stowed(w);
    }
    // After physics: the stowed pilot rides along; on foot, the walkable
    // site's edge holds the player in.
    void space_after(engine::World &w) {
        auto &sp = *space;
        place_stowed(w);
        if (sp.piloting)
            return;
        if (const auto player = player_entity(w)) {
            auto &box = *w.get<engine::Box>(*player);
            const float limit = static_cast<float>(sp.eva_range) - 2.0F;
            box.center.x = std::clamp(box.center.x, -limit, limit);
            box.center.z = std::clamp(box.center.z, -limit, limit);
        }
    }
    // One tick of an arcade car (0.70.0): picks up the velocity physics
    // resolved last tick (walls and other cars), steps the car model, and
    // hands the result back to the body, turning its footprint with it.
    void drive_car(engine::World &w, engine::Entity entity, Heading &heading, engine::physics::RigidBody &body,
                   engine::gameplay::CarInput control) {
        constexpr float dt = 1.0F / 60.0F;
        auto &car = heading.car;
        car.velocity = {body.velocity.x, 0, body.velocity.z};
        if (heading.frozen) {
            control = {};
            car.velocity = {};
            car.yaw_rate = 0;
        }
        heading.input = control;
        engine::gameplay::step_car(car, heading.spec, control, dt);
        if (heading.frozen)
            car.velocity = {};
        body.velocity.x = car.velocity.x;
        body.velocity.z = car.velocity.z;
        heading.yaw = car.yaw;
        heading.speed = car.forward_speed;
        auto &box = *w.get<engine::Box>(entity);
        const float cos_yaw = std::cos(heading.yaw), sin_yaw = std::sin(heading.yaw);
        box.size.x = 2.0F * (std::abs(heading.half_x * cos_yaw) + std::abs(heading.half_z * sin_yaw));
        box.size.z = 2.0F * (std::abs(heading.half_x * sin_yaw) + std::abs(heading.half_z * cos_yaw));
    }
    // The player's car controls from the named actions: move_y throttle
    // (forward) / brake and reverse (back), move_x steering, jump the
    // handbrake, sprint nitro.
    engine::gameplay::CarInput player_car_input() const {
        const auto value = [this](const char *name) { return actions.state(engine::ActionId{name}).value; };
        engine::gameplay::CarInput control;
        const float y = value("move_y");
        control.throttle = std::max(0.0F, y);
        control.brake = std::max(0.0F, -y);
        control.steer = std::clamp(value("move_x"), -1.0F, 1.0F);
        control.handbrake = value("jump") > 0.5F;
        control.nitro = value("sprint") > 0.5F;
        return control;
    }
    // An AI driver's control for this tick (see Driver).
    engine::gameplay::CarInput drive_ai(engine::World &w, engine::Entity entity, Heading &heading, Driver &driver,
                                        const engine::physics::RaycastTargets &targets) {
        using engine::Vec3;
        constexpr float dt = 1.0F / 60.0F;
        engine::gameplay::CarInput control;
        const auto &spec = heading.spec;
        const auto &car = heading.car;
        const Vec3 position = w.get<engine::Box>(entity)->center;
        const float speed = car.forward_speed;
        const float fx = std::sin(car.yaw), fz = std::cos(car.yaw);
        if (driver.reversing > 0) {
            driver.reversing -= dt;
            control.brake = 1;
            control.steer = driver.reverse_steer;
            return control;
        }
        const auto flat = [](Vec3 a, Vec3 b) { return std::hypot(a.x - b.x, a.z - b.z); };
        // Something solid straight ahead within `range`: distance, and whether it's another car.
        const auto probe = [&](float side, float range) -> std::optional<std::pair<float, bool>> {
            const Vec3 origin{position.x - fz * side, position.y + 0.3F, position.z + fx * side};
            engine::physics::QueryFilter filter;
            filter.ignore = entity;
            const auto hit = engine::physics::raycast(targets, origin, Vec3{fx, 0, fz}, range, physics_config, filter);
            if (!hit || hit->hit_ground)
                return std::nullopt;
            return std::pair{hit->distance, w.get<Heading>(hit->entity) != nullptr};
        };
        Vec3 target = position;
        float target_speed = 0;
        bool chase_direct = false;
        if (driver.mode == DriveMode::Pursuit) {
            if (driver.target && !w.alive(*driver.target))
                driver.target.reset();
            if (!driver.target) {
                if (driver.target_name.empty()) {
                    for (const auto player : w.query<engine::Box, PlayerMarker>()) {
                        driver.target = player;
                        break;
                    }
                } else {
                    for (const auto other : w.query<EntityName>())
                        if (w.get<EntityName>(other)->value == driver.target_name) {
                            driver.target = other;
                            break;
                        }
                }
            }
            if (driver.target) {
                const Vec3 goal = w.get<engine::Box>(*driver.target)->center;
                const auto *goal_body = w.get<engine::physics::RigidBody>(*driver.target);
                const Vec3 lead = goal_body ? Vec3{goal_body->velocity.x * 0.5F, 0, goal_body->velocity.z * 0.5F} : Vec3{};
                target = {goal.x + lead.x, goal.y, goal.z + lead.z};
                // Straight at it when nothing solid is in between; otherwise
                // the route (if the script gave one) leads around the block.
                const Vec3 to{target.x - position.x, 0, target.z - position.z};
                const float distance = std::max(std::hypot(to.x, to.z), 0.01F);
                engine::physics::QueryFilter filter;
                filter.ignore = entity;
                const auto hit = engine::physics::raycast(targets, {position.x, position.y + 0.3F, position.z},
                                                          {to.x, 0, to.z}, distance, physics_config, filter);
                chase_direct = !hit || hit->hit_ground || hit->entity == *driver.target ||
                               w.get<Heading>(hit->entity) != nullptr || driver.route.empty();
                if (chase_direct) {
                    target_speed = spec.top_speed * driver.speed_scale;
                    // Close in and aggressive: aim at the target's flank to ram it.
                    if (distance < 14.0F && driver.aggression > 0.5F && goal_body) {
                        const float gyaw = w.get<Heading>(*driver.target) ? w.get<Heading>(*driver.target)->yaw : 0.0F;
                        const float side = (std::sin(driver.reverse_steer * 7.0F) > 0 ? 1.0F : -1.0F) * 1.5F;
                        target.x += -std::cos(gyaw) * side;
                        target.z += std::sin(gyaw) * side;
                    }
                    if (distance < 6.0F && driver.aggression <= 0.5F)
                        target_speed = std::hypot(goal_body ? goal_body->velocity.x : 0, goal_body ? goal_body->velocity.z : 0);
                    control.nitro = distance > 50.0F && driver.skill > 0.5F && car.nitro > 0.3F;
                }
            }
        }
        if (driver.mode == DriveMode::Off || (driver.mode == DriveMode::Pursuit && !driver.target)) {
            control.brake = 1;
            return control;
        }
        if (!chase_direct) {
            if (driver.route.empty()) {
                control.brake = 1;
                return control;
            }
            const std::size_t count = driver.route.size();
            const auto at = [&](std::size_t i) -> const Vec3 & { return driver.route[i % count]; };
            // Advance past points reached, or passed: beyond the point along
            // the leg leading into it (a car that runs wide must not circle
            // back for a point it already went by).
            const float reach = std::max(6.0F, std::abs(speed) * 0.35F);
            for (int guard = 0; guard < static_cast<int>(count); ++guard) {
                if (!driver.loop && driver.next >= count)
                    break;
                const Vec3 &point = at(driver.next);
                const Vec3 &before = driver.next > 0 || driver.loop ? at(driver.next + count - 1) : position;
                const float lx = point.x - before.x, lz = point.z - before.z;
                const bool passed = (position.x - point.x) * lx + (position.z - point.z) * lz > 0;
                if (flat(position, point) > reach && !passed)
                    break;
                driver.next = driver.loop ? (driver.next + 1) % count : driver.next + 1;
            }
            if (!driver.loop && driver.next >= count) {
                control.brake = 1;
                return control;
            }
            // Look ahead along the route by a speed-dependent distance.
            float lookahead = std::clamp(std::abs(speed) * 0.7F, 7.0F, 35.0F);
            Vec3 from = position;
            target = at(driver.next);
            for (std::size_t i = driver.next, steps = 0; steps < count; ++i, ++steps) {
                if (!driver.loop && i >= count)
                    break;
                const Vec3 &point = at(i);
                const float segment = flat(from, point);
                if (segment >= lookahead) {
                    const float t = lookahead / std::max(segment, 0.001F);
                    target = {from.x + (point.x - from.x) * t, point.y, from.z + (point.z - from.z) * t};
                    break;
                }
                lookahead -= segment;
                from = point;
                target = point;
            }
            // Corner speeds ahead: brake in time for each upcoming turn.
            const float pace = driver.mode == DriveMode::Traffic
                                   ? 13.0F * driver.speed_scale
                                   : spec.top_speed * driver.speed_scale * (0.82F + 0.18F * driver.skill);
            target_speed = pace;
            float travelled = flat(position, at(driver.next));
            for (std::size_t k = 0; k < std::min<std::size_t>(count, 8); ++k) {
                const std::size_t i = driver.next + k;
                if (!driver.loop && i + 1 >= count)
                    break;
                const Vec3 &a = k == 0 ? position : at(i - 1);
                const Vec3 &b = at(i);
                const Vec3 &c = at(i + 1);
                const float ax = b.x - a.x, az = b.z - a.z, bx = c.x - b.x, bz = c.z - b.z;
                const float la = std::hypot(ax, az), lb = std::hypot(bx, bz);
                if (la > 0.01F && lb > 0.01F) {
                    const float turn = std::acos(std::clamp((ax * bx + az * bz) / (la * lb), -1.0F, 1.0F));
                    if (turn > 0.08F) {
                        const float radius = std::min(la, lb) / std::max(turn, 0.01F);
                        const float corner = engine::gameplay::corner_speed(spec, radius) * (0.85F + 0.15F * driver.skill);
                        const float allowed = std::sqrt(corner * corner + 2.0F * spec.braking * 0.7F * travelled);
                        target_speed = std::min(target_speed, allowed);
                    }
                }
                travelled += lb;
                if (travelled > 160.0F)
                    break;
            }
            if (driver.mode == DriveMode::Race)
                control.nitro = driver.skill > 0.6F && target_speed > speed + 12.0F && car.nitro > 0.2F;
        }
        control = [&] {
            auto steered = engine::gameplay::steer_toward(car, spec, position, target, target_speed);
            steered.nitro = control.nitro;
            return steered;
        }();
        // Traffic ahead: traffic brakes for it; racers and police go around.
        const float look = std::max(10.0F, std::abs(speed) * 1.1F);
        if (const auto ahead = probe(0, look)) {
            if (driver.mode == DriveMode::Traffic && ahead->second) {
                control.throttle = 0;
                control.brake = std::max(control.brake, 1.0F - ahead->first / look);
            } else if (ahead->second || ahead->first < look * 0.6F) {
                const auto left = probe(1.6F, look), right = probe(-1.6F, look);
                const float l = left ? left->first : look, r = right ? right->first : look;
                control.steer = std::clamp(control.steer + (r >= l ? 0.6F : -0.6F), -1.0F, 1.0F);
            }
        }
        // Stuck against something: back out with the opposite lock.
        if (control.throttle > 0.3F && std::abs(speed) < 1.0F)
            driver.stuck += dt;
        else
            driver.stuck = std::max(0.0F, driver.stuck - dt);
        if (driver.stuck > 1.5F) {
            driver.stuck = 0;
            driver.reversing = 1.1F;
            driver.reverse_steer = control.steer >= 0 ? -1.0F : 1.0F;
        }
        return control;
    }
    // Every damage path (weapons, melee, blast, AI attacks, scripts) lands
    // here: Health goes down, the editor gets a "damaged" event, the target's
    // script hears on_damaged/on_death, and a defeated entity is destroyed.
    // A no-op without Health or once already at 0.
    void apply_damage(engine::World &w, engine::Entity target, float amount, std::optional<engine::Entity> attacker,
                      bool headshot = false) {
        auto *health = w.get<Health>(target);
        if (!health || health->current <= 0 || !(amount > 0))
            return;
        health->current = std::max(0.0F, health->current - amount);
        const bool killed = health->current <= 0;
        if (killed)
            w.defer_destroy(target);
        WeaponEvent event{WeaponEventKind::damaged, attacker ? index_of(*attacker) : -1, index_of(target)};
        const auto *source = attacker ? w.get<engine::Box>(*attacker) : nullptr;
        event.point = source ? source->center : w.get<engine::Box>(target)->center;
        event.value = amount;
        event.flags = (headshot ? event_headshot : 0) | (killed ? event_killed : 0);
        push_event(event);
        const auto name = [&w](std::optional<engine::Entity> entity) {
            const auto *n = entity ? w.get<EntityName>(*entity) : nullptr;
            return n ? n->value : std::string{};
        };
        script_runtime.notify_damage(w, target, amount, attacker, headshot, killed, name(target), name(attacker));
        if (auto *soldier = w.get<Soldier>(target); soldier && attacker && source &&
                                                    team_of(w, *attacker) != soldier->team) {
            soldier->last_known = source->center;
            soldier->awareness = 1;
            if (soldier->mode != SoldierMode::combat && soldier->mode != SoldierMode::cover)
                soldier->mode = SoldierMode::investigate;
        }
    }
    // The nearest thing a ray hits: a Collider (or the ground) through
    // physics::raycast, or any Box with Health that has no Collider.
    struct Trace final {
        std::optional<engine::Entity> entity;
        engine::Vec3 point{};
        engine::Vec3 normal{};
        float distance{};
    };
    std::optional<Trace> trace(engine::World &w, engine::Vec3 origin, engine::Vec3 direction, float range,
                               engine::Entity ignore) {
        engine::physics::QueryFilter filter;
        filter.ignore = ignore;
        std::optional<Trace> best;
        if (const auto hit = engine::physics::raycast(w, origin, direction, range, physics_config, filter))
            best = Trace{hit->hit_ground ? std::nullopt : std::optional{hit->entity}, hit->point, hit->normal,
                         hit->distance};
        for (const auto entity : w.query<engine::Box, Health>()) {
            if (entity == ignore || w.get<engine::physics::Collider>(entity))
                continue;
            const auto &box = *w.get<engine::Box>(entity);
            // Slab test against the target's box.
            float t_min = 0, t_max = best ? best->distance : range;
            int axis_hit = -1;
            const float o[3]{origin.x, origin.y, origin.z}, d[3]{direction.x, direction.y, direction.z};
            const float c[3]{box.center.x, box.center.y, box.center.z}, h[3]{box.size.x / 2, box.size.y / 2,
                                                                            box.size.z / 2};
            bool miss = false;
            for (int a = 0; a < 3 && !miss; ++a) {
                if (std::abs(d[a]) < 1e-9F) {
                    miss = o[a] < c[a] - h[a] || o[a] > c[a] + h[a];
                    continue;
                }
                float t1 = (c[a] - h[a] - o[a]) / d[a], t2 = (c[a] + h[a] - o[a]) / d[a];
                if (t1 > t2)
                    std::swap(t1, t2);
                if (t1 > t_min) {
                    t_min = t1;
                    axis_hit = a;
                }
                t_max = std::min(t_max, t2);
                miss = t_min > t_max;
            }
            if (miss || (best && t_min >= best->distance))
                continue;
            float n[3]{0, 0, 0};
            if (axis_hit >= 0)
                n[axis_hit] = d[axis_hit] > 0 ? -1.0F : 1.0F;
            best = Trace{entity,
                         {origin.x + direction.x * t_min, origin.y + direction.y * t_min,
                          origin.z + direction.z * t_min},
                         {n[0], n[1], n[2]},
                         t_min};
        }
        return best;
    }
    // Fires one round of `arsenal`'s current weapon from `origin` along
    // `direction` (unit): hitscan pellets, or a projectile.
    void fire_weapon(engine::World &w, engine::Entity shooter, Arsenal &arsenal, engine::Vec3 origin,
                     engine::Vec3 direction, float spread) {
        const auto slot = static_cast<std::size_t>(arsenal.state.current);
        const auto &weapon = arsenal.weapons[slot];
        WeaponEvent fired{WeaponEventKind::fire, index_of(shooter), -1, origin, direction, weapon.recoil,
                          static_cast<int>(slot)};
        push_event(fired);
        noises.push_back({origin, team_of(w, shooter), 1.0F});
        if (weapon.projectile) {
            const auto aim = engine::gameplay::spread_direction(direction, spread, arsenal.state.rng);
            const auto projectile = w.defer_create();
            w.defer_set(projectile, engine::Box{{origin.x + aim.x * 0.6F, origin.y + aim.y * 0.6F,
                                                 origin.z + aim.z * 0.6F},
                                                {0.25F, 0.25F, 0.25F}});
            Projectile p{{aim.x * weapon.speed, aim.y * weapon.speed, aim.z * weapon.speed}, shooter};
            p.lifetime = weapon.range / weapon.speed + 1.0F;
            p.damage = weapon.damage;
            p.gravity = weapon.gravity;
            p.splash = weapon.splash;
            w.defer_set(projectile, p);
            return;
        }
        std::map<engine::Entity, std::pair<float, bool>> damage_by_target;
        for (int pellet = 0; pellet < weapon.pellets; ++pellet) {
            const auto aim = engine::gameplay::spread_direction(direction, spread, arsenal.state.rng);
            const auto hit = trace(w, origin, aim, weapon.range, shooter);
            if (!hit)
                continue;
            const bool flesh = hit->entity && w.get<Health>(*hit->entity);
            push_event({WeaponEventKind::impact, index_of(shooter), hit->entity ? index_of(*hit->entity) : -1,
                        hit->point, hit->normal, 0, flesh ? event_flesh : 0});
            if (!flesh)
                continue;
            const auto &box = *w.get<engine::Box>(*hit->entity);
            const bool headshot =
                box.size.y >= 1.2F && hit->point.y >= box.center.y + box.size.y / 2 - box.size.y * 0.22F;
            auto &entry = damage_by_target[*hit->entity];
            entry.first += engine::gameplay::damage_at(weapon, hit->distance) * (headshot ? weapon.headshot : 1.0F);
            entry.second = entry.second || headshot;
        }
        for (const auto &[target, entry] : damage_by_target)
            apply_damage(w, target, entry.first, shooter, entry.second);
    }
    // An explosion: damage falls off linearly to 0 at the radius, and
    // finite-mass bodies are pushed away.
    void explode(engine::World &w, engine::Entity owner, engine::Vec3 at, float radius, float damage_amount) {
        push_event({WeaponEventKind::explode, index_of(owner), -1, at, {0, 1, 0}, radius, 0});
        noises.push_back({at, team_of(w, owner), 1.5F});
        for (const auto entity : w.query<engine::Box>()) {
            const auto &box = *w.get<engine::Box>(entity);
            const engine::Vec3 delta{box.center.x - at.x, box.center.y - at.y, box.center.z - at.z};
            const float distance = std::sqrt(delta.x * delta.x + delta.y * delta.y + delta.z * delta.z);
            if (distance >= radius)
                continue;
            const float scale = 1.0F - distance / radius;
            if (w.get<Health>(entity))
                apply_damage(w, entity, damage_amount * scale, owner);
            if (auto *body = w.get<engine::physics::RigidBody>(entity);
                body && body->mass > 0 && body->type == engine::physics::BodyType::Dynamic && distance > 1e-3F) {
                const float push = 12.0F * scale * body->mass;
                engine::physics::add_impulse(*body, {delta.x / distance * push, delta.y / distance * push + push * 0.3F,
                                                     delta.z / distance * push});
            }
        }
    }
    // -- Combat AI (Soldier) ---------------------------------------------
    static float random01(std::uint32_t &state) {
        if (state == 0)
            state = 1;
        state ^= state << 13;
        state ^= state >> 17;
        state ^= state << 5;
        return static_cast<float>(state & 0xFFFFFFU) / 16777216.0F;
    }
    // Sight: inside range and the view cone (or very close), with nothing
    // solid in between.
    bool soldier_sees(engine::World &w, engine::Entity self, const Soldier &soldier, const engine::Box &box,
                      engine::Entity target) {
        const auto &target_box = *w.get<engine::Box>(target);
        const engine::Vec3 eye{box.center.x, box.center.y + box.size.y * 0.4F, box.center.z};
        const engine::Vec3 aim{target_box.center.x, target_box.center.y + target_box.size.y * 0.25F,
                               target_box.center.z};
        const engine::Vec3 delta{aim.x - eye.x, aim.y - eye.y, aim.z - eye.z};
        const float distance = std::sqrt(delta.x * delta.x + delta.y * delta.y + delta.z * delta.z);
        if (distance > soldier.sight_range || distance < 1e-3F)
            return false;
        const float flat = std::sqrt(delta.x * delta.x + delta.z * delta.z);
        const float facing = flat > 1e-3F ? (std::sin(soldier.yaw) * delta.x + std::cos(soldier.yaw) * delta.z) / flat
                                          : 1.0F;
        if (facing < soldier.fov_cos && distance > 2.5F)
            return false;
        engine::physics::QueryFilter filter;
        filter.ignore = self;
        const auto hit = engine::physics::raycast(w, eye, delta, distance, physics_config, filter);
        return !hit || hit->distance >= distance - 0.3F || (!hit->hit_ground && hit->entity == target);
    }
    // A unit horizontal direction along a nav path toward `goal` (zero when
    // there). Paths are refreshed twice a second or when the goal moves.
    engine::Vec3 soldier_steer(Soldier &soldier, const engine::Vec3 &from, const engine::Vec3 &goal, float dt) {
        const float gx = goal.x - soldier.path_goal.x, gz = goal.z - soldier.path_goal.z;
        soldier.repath -= dt;
        if (soldier.repath <= 0 || gx * gx + gz * gz > 1.0F) {
            soldier.repath = 0.5F;
            soldier.path_goal = goal;
            const auto found = nav_grid.find_path(from, goal);
            soldier.path = found ? *found : std::vector<engine::Vec3>{};
        }
        while (soldier.path.size() > 1) {
            const float wx = soldier.path.front().x - from.x, wz = soldier.path.front().z - from.z;
            if (wx * wx + wz * wz > 0.4F * 0.4F)
                break;
            soldier.path.erase(soldier.path.begin());
        }
        const engine::Vec3 aim = soldier.path.empty() ? goal : soldier.path.front();
        const float dx = aim.x - from.x, dz = aim.z - from.z;
        const float length = std::sqrt(dx * dx + dz * dz);
        const float remaining_x = goal.x - from.x, remaining_z = goal.z - from.z;
        if (length < 1e-3F || remaining_x * remaining_x + remaining_z * remaining_z < 0.35F * 0.35F)
            return {};
        return {dx / length, 0, dz / length};
    }
    // The nearest walkable spot within 9 m that something at `threat` can't
    // see (a solid collider blocks the line to chest height).
    std::optional<engine::Vec3> find_cover(engine::World &w, engine::Entity self, const engine::Vec3 &from,
                                           const engine::Vec3 &threat) {
        engine::physics::QueryFilter filter;
        filter.ignore = self;
        for (const float radius : {2.5F, 5.0F, 8.0F}) {
            std::optional<engine::Vec3> best;
            float best_distance = 0;
            for (int i = 0; i < 16; ++i) {
                const float angle = static_cast<float>(i) * 0.39269908F;
                const engine::Vec3 spot{from.x + std::cos(angle) * radius, from.y, from.z + std::sin(angle) * radius};
                if (!nav_grid.walkable(spot.x, spot.z))
                    continue;
                const engine::Vec3 chest{spot.x, from.y + 0.3F, spot.z};
                const engine::Vec3 delta{chest.x - threat.x, chest.y - threat.y, chest.z - threat.z};
                const float distance = std::sqrt(delta.x * delta.x + delta.y * delta.y + delta.z * delta.z);
                const auto hit = engine::physics::raycast(w, threat, delta, distance, physics_config, filter);
                if (!hit || hit->hit_ground || hit->distance >= distance - 0.4F)
                    continue;
                const float dx = spot.x - from.x, dz = spot.z - from.z;
                const float to_threat = (spot.x - threat.x) * (spot.x - threat.x) + (spot.z - threat.z) * (spot.z - threat.z);
                // Prefer close spots that don't walk toward the threat.
                const float score = std::sqrt(dx * dx + dz * dz) - 0.2F * std::sqrt(to_threat);
                if (!best || score < best_distance) {
                    best = spot;
                    best_distance = score;
                }
            }
            if (best)
                return best;
        }
        return std::nullopt;
    }
    void step_soldiers(engine::World &w) {
        constexpr float dt = 1.0F / 60.0F;
        const auto heard = std::move(noises);
        noises.clear();
        // Every living hostile candidate: Players (team 0) and soldiers.
        std::vector<engine::Entity> fighters;
        for (const auto entity : w.query<engine::Box, Health>())
            if (w.get<Health>(entity)->current > 0 && team_of(w, entity) >= 0)
                fighters.push_back(entity);
        for (const auto self : w.query<engine::Box, Soldier, Controller>()) {
            auto &soldier = *w.get<Soldier>(self);
            auto &controller = *w.get<Controller>(self);
            const auto &box = *w.get<engine::Box>(self);
            const auto *health = w.get<Health>(self);
            if (health && health->current <= 0)
                continue;
            if (!soldier.initialized) {
                soldier.initialized = true;
                soldier.home = box.center;
                soldier.rng = 0x2545F491U ^ static_cast<std::uint32_t>(index_of(self) * 7919 + 1);
                for (const auto &name : soldier.patrol_names)
                    if (const auto found = host.find(w, name))
                        soldier.patrol_points.push_back(w.get<engine::Box>(*found)->center);
            }
            // Perception: keep a visible target, else pick the nearest visible hostile.
            std::optional<engine::Entity> seen;
            if (soldier.target && w.alive(*soldier.target) && w.get<Health>(*soldier.target) &&
                w.get<Health>(*soldier.target)->current > 0 && soldier_sees(w, self, soldier, box, *soldier.target))
                seen = soldier.target;
            if (!seen) {
                float nearest = 0;
                for (const auto other : fighters) {
                    if (other == self || team_of(w, other) == soldier.team)
                        continue;
                    const auto &other_box = *w.get<engine::Box>(other);
                    const float dx = other_box.center.x - box.center.x, dz = other_box.center.z - box.center.z;
                    const float distance = dx * dx + dz * dz;
                    if ((!seen || distance < nearest) && soldier_sees(w, self, soldier, box, other)) {
                        seen = other;
                        nearest = distance;
                    }
                }
            }
            if (!seen && soldier.mode != SoldierMode::combat && soldier.mode != SoldierMode::cover)
                for (const auto &noise : heard) {
                    if (noise.team == soldier.team)
                        continue;
                    const float dx = noise.at.x - box.center.x, dz = noise.at.z - box.center.z;
                    if (dx * dx + dz * dz <= soldier.hearing * soldier.hearing * noise.radius_scale * noise.radius_scale) {
                        soldier.last_known = noise.at;
                        soldier.awareness = std::max(soldier.awareness, 0.6F);
                        soldier.mode = SoldierMode::investigate;
                    }
                }
            if (soldier.behavior == SoldierBehavior::hunt && !seen && soldier.mode == SoldierMode::patrol) {
                // A hunter always knows roughly where the nearest hostile is.
                for (const auto other : fighters)
                    if (team_of(w, other) != soldier.team && other != self) {
                        soldier.last_known = w.get<engine::Box>(other)->center;
                        soldier.mode = SoldierMode::investigate;
                        break;
                    }
            }

            engine::Vec3 move{};
            float pace = 0;
            std::optional<engine::Vec3> face;
            auto *arsenal = w.get<Arsenal>(self);
            const bool reloading = arsenal && arsenal->state.reload_left > 0;
            const float health_ratio = health && health->max > 0 ? health->current / health->max : 1.0F;
            soldier.melee_cooldown = std::max(0.0F, soldier.melee_cooldown - dt);
            if (seen) {
                soldier.target = seen;
                soldier.since_seen = 0;
                soldier.last_known = w.get<engine::Box>(*seen)->center;
                if (soldier.mode != SoldierMode::combat && soldier.mode != SoldierMode::cover &&
                    soldier.mode != SoldierMode::flee) {
                    soldier.mode = SoldierMode::combat;
                    soldier.reaction_left = soldier.reaction;
                    soldier.burst_left = soldier.burst;
                }
                soldier.awareness = 1;
            } else {
                soldier.since_seen += dt;
                soldier.awareness = std::max(0.0F, soldier.awareness - dt * 0.15F);
            }
            if (soldier.flee_health > 0 && health_ratio <= soldier.flee_health && soldier.since_seen < 5)
                soldier.mode = SoldierMode::flee;

            switch (soldier.mode) {
            case SoldierMode::patrol: {
                if (soldier.behavior == SoldierBehavior::patrol && !soldier.patrol_points.empty()) {
                    const auto &point = soldier.patrol_points[soldier.waypoint % soldier.patrol_points.size()];
                    if (soldier.wait > 0) {
                        soldier.wait -= dt;
                    } else {
                        move = soldier_steer(soldier, box.center, point, dt);
                        pace = 0.45F;
                        if (move.x == 0 && move.z == 0) {
                            soldier.waypoint++;
                            soldier.wait = 1.2F;
                        }
                    }
                } else {
                    const float dx = soldier.home.x - box.center.x, dz = soldier.home.z - box.center.z;
                    if (dx * dx + dz * dz > 1.5F * 1.5F) {
                        move = soldier_steer(soldier, box.center, soldier.home, dt);
                        pace = 0.45F;
                    } else {
                        // Guarding: slowly look left and right.
                        soldier.yaw += std::sin(time_now * 0.4F + static_cast<float>(index_of(self))) * 0.35F * dt;
                    }
                }
                break;
            }
            case SoldierMode::investigate: {
                move = soldier_steer(soldier, box.center, soldier.last_known, dt);
                pace = 1.0F;
                if (move.x == 0 && move.z == 0) {
                    soldier.mode = SoldierMode::search;
                    soldier.search_timer = 4.0F;
                }
                break;
            }
            case SoldierMode::search: {
                soldier.yaw += 1.4F * dt;
                soldier.search_timer -= dt;
                if (soldier.search_timer <= 0) {
                    soldier.mode = SoldierMode::patrol;
                    soldier.target.reset();
                }
                break;
            }
            case SoldierMode::flee: {
                const float dx = box.center.x - soldier.last_known.x, dz = box.center.z - soldier.last_known.z;
                const float length = std::sqrt(dx * dx + dz * dz);
                if (length > 1e-3F)
                    move = {dx / length, 0, dz / length};
                pace = 1.0F;
                if (soldier.since_seen > 5) {
                    soldier.mode = SoldierMode::search;
                    soldier.search_timer = 3.0F;
                }
                break;
            }
            case SoldierMode::cover: {
                if (!soldier.cover)
                    soldier.cover = find_cover(w, self, box.center,
                                               {soldier.last_known.x, soldier.last_known.y + 0.6F, soldier.last_known.z});
                if (!soldier.cover) {
                    soldier.mode = SoldierMode::combat;
                    break;
                }
                move = soldier_steer(soldier, box.center, *soldier.cover, dt);
                pace = 1.0F;
                if (move.x == 0 && move.z == 0) {
                    soldier.cover_timer -= dt;
                    if (soldier.cover_timer <= 0 && !reloading) {
                        soldier.mode = SoldierMode::combat; // peek back out
                        soldier.reaction_left = soldier.reaction * 0.5F;
                    }
                }
                if (seen)
                    face = soldier.last_known;
                break;
            }
            case SoldierMode::combat: {
                if (!seen) {
                    move = soldier_steer(soldier, box.center, soldier.last_known, dt);
                    pace = 0.9F;
                    if (soldier.since_seen > 1.5F) {
                        soldier.mode = SoldierMode::investigate;
                    }
                    break;
                }
                const auto &target_box = *w.get<engine::Box>(*seen);
                face = target_box.center;
                const float dx = target_box.center.x - box.center.x, dz = target_box.center.z - box.center.z;
                const float distance = std::sqrt(dx * dx + dz * dz);
                const float preferred = arsenal ? soldier.preferred_range : 1.2F;
                if (distance > preferred * 1.25F) {
                    move = soldier_steer(soldier, box.center, target_box.center, dt);
                    pace = 0.9F;
                } else if (distance < preferred * 0.6F && arsenal) {
                    move = {-dx / distance, 0, -dz / distance};
                    pace = 0.6F;
                } else if (arsenal) {
                    soldier.strafe_timer -= dt;
                    if (soldier.strafe_timer <= 0) {
                        soldier.strafe_timer = 0.8F + random01(soldier.rng) * 1.4F;
                        soldier.strafe_dir = random01(soldier.rng) < 0.5F ? -1.0F : 1.0F;
                    }
                    const engine::Vec3 side{-dz / distance * soldier.strafe_dir, 0, dx / distance * soldier.strafe_dir};
                    if (!nav_grid.walkable(box.center.x + side.x * 1.2F, box.center.z + side.z * 1.2F))
                        soldier.strafe_dir = -soldier.strafe_dir;
                    move = {-dz / distance * soldier.strafe_dir, 0, dx / distance * soldier.strafe_dir};
                    pace = 0.45F;
                }
                soldier.reaction_left -= dt;
                const float facing = (std::sin(soldier.yaw) * dx + std::cos(soldier.yaw) * dz) / std::max(distance, 1e-3F);
                if (arsenal && !arsenal->weapons.empty()) {
                    const auto slot = static_cast<std::size_t>(arsenal->state.current);
                    if (arsenal->state.magazine[slot] == 0 && !reloading) {
                        arsenal->script_reload = true;
                        if (soldier.use_cover) {
                            soldier.mode = SoldierMode::cover;
                            soldier.cover.reset();
                            soldier.cover_timer = 0.5F;
                        }
                    } else if (soldier.reaction_left <= 0 && facing > 0.97F && !reloading) {
                        if (soldier.burst_cooldown > 0) {
                            soldier.burst_cooldown -= dt;
                        } else if (arsenal->state.cooldown <= 0 && arsenal->state.equip_left <= 0) {
                            const engine::Vec3 eye{box.center.x, box.center.y + box.size.y * 0.4F, box.center.z};
                            const engine::Vec3 aim{target_box.center.x - eye.x,
                                                   target_box.center.y + target_box.size.y * 0.1F - eye.y,
                                                   target_box.center.z - eye.z};
                            const auto direction = engine::gameplay::spread_direction(
                                aim, (1.0F - std::clamp(soldier.accuracy, 0.0F, 1.0F)) * 7.0F, soldier.rng);
                            arsenal->script_fire = true;
                            arsenal->script_aim = direction;
                            if (--soldier.burst_left <= 0) {
                                soldier.burst_left = soldier.burst;
                                soldier.burst_cooldown = soldier.burst_pause * (0.7F + 0.6F * random01(soldier.rng));
                            }
                        }
                    }
                    if (soldier.use_cover && health_ratio < 0.5F && !soldier.cover && soldier.mode == SoldierMode::combat) {
                        soldier.mode = SoldierMode::cover;
                        soldier.cover_timer = 2.0F;
                    }
                } else if (distance < 1.7F && soldier.melee_cooldown <= 0 && soldier.reaction_left <= 0) {
                    apply_damage(w, *seen, soldier.melee_damage, self);
                    soldier.melee_cooldown = 1.0F;
                    script_runtime.request_animation(self, "attack");
                }
                break;
            }
            }
            if (soldier.mode != SoldierMode::cover && soldier.mode != SoldierMode::combat)
                soldier.cover.reset();

            // Turn toward the target, or along the way we're going.
            float want = soldier.yaw;
            if (face) {
                want = std::atan2(face->x - box.center.x, face->z - box.center.z);
            } else if (move.x != 0 || move.z != 0) {
                want = std::atan2(move.x, move.z);
            }
            const float diff = std::remainder(want - soldier.yaw, 6.2831853F);
            soldier.yaw += std::clamp(diff, -8.0F * dt, 8.0F * dt);
            soldier.yaw = std::remainder(soldier.yaw, 6.2831853F);

            engine::gameplay::ControllerInput intent;
            intent.move_x = move.x * pace;
            intent.move_y = -move.z * pace;
            intent.yaw = 0;
            const auto *body = w.get<engine::physics::RigidBody>(self);
            engine::gameplay::begin_step(w, self, controller.state, controller.settings, intent,
                                         physics_config.gravity * (body ? body->gravity_scale : 1.0F), dt);
        }
    }
    float time_now{0};
    // Milliseconds each system took on the most recent tick, for the
    // editor's Stats overlay (editor_profile_text).
    std::map<std::string, double> profile;
    void add_timed(std::string name, engine::FixedPhase phase, engine::i32 order,
                   engine::FixedSystems::Function function) {
        systems.add(name, phase, order,
                    [this, name, function = std::move(function)](engine::World &w,
                                                                  const engine::FixedUpdateContext &context) {
                        const auto start = std::chrono::steady_clock::now();
                        function(w, context);
                        profile[name] = std::chrono::duration<double, std::milli>(
                                            std::chrono::steady_clock::now() - start)
                                            .count();
                    });
    }
    static engine::InputMap default_input_map() {
        std::string error;
        return *editor_bindings::parse(editor_bindings::default_text, error);
    }
    Runtime() {
        register_components(world);
        register_components(templates);
        script_runtime.set_host(&host);
        script_runtime.set_nav(&nav_grid);
        script_runtime.set_input(&input, &actions);
        script_runtime.set_physics_config(&physics_config);
        add_timed("editor.actions", engine::FixedPhase::begin, 1,
                    [this](engine::World &, const engine::FixedUpdateContext &context) {
                        actions.update(context.input);
                    });
        // First, before anything moves: rebakes the navigation grid on the
        // first tick and then once a second. Movers (Player, AI) are never
        // obstacles to themselves.
        add_timed("editor.nav", engine::FixedPhase::begin, 0,
                    [this](engine::World &w, const engine::FixedUpdateContext &context) {
                        if (context.tick % 60 != 0)
                            return;
                        std::vector<engine::Entity> movers;
                        for (const auto entity : w.query<PlayerMarker>())
                            movers.push_back(entity);
                        for (const auto entity : w.query<AIAgent>())
                            movers.push_back(entity);
                        for (const auto entity : w.query<Soldier>())
                            movers.push_back(entity);
                        nav_grid.bake(w, movers, terrain ? &*terrain : nullptr);
                    });
        // Recorded once per entity, the first time its script fails to compile
        // or errors at runtime (engine::script::Runtime's own "reported once,
        // not retried every tick" contract) — editor_script_error() reads this
        // back so the editor can show a script author what went wrong, instead
        // of a silently-inert entity with no visible cause.
        script_runtime.set_error_handler(
            [this](engine::Entity entity, const std::string &message) { script_errors[entity] = message; });
        // Order 1: an AIAgent drives its own velocity the same way editor.move
        // drives the Player's, and must also land before physics (order 10)
        // integrates it. Ordered just after editor.move (0), not before it or
        // at the same order, purely to keep a fixed, unambiguous run order
        // between two systems that never actually touch the same entity (an
        // AIAgent and a PlayerMarker are different entities by authoring
        // convention) rather than because one depends on the other's output.
        // Only five of AIStateName's seven values are ever actually produced
        // here: Idle/Walking/Running (wander) and Fleeing/Chasing (reacting to
        // the Player). Driving is reserved for a possible future AI-controlled
        // Vehicle, which this round doesn't implement. editor_add doesn't stop
        // an entity from authoring AIState alongside Player+Vehicle (nothing
        // here validates authoring combinations, the same as everywhere else
        // in this file) — that entity would get both a Heading and an
        // AIAgent, and this system simply overwrites editor.move's velocity
        // with its own every tick, since it runs at order 1 to editor.move's
        // order 0. Not a crash, just not a useful combination to author. Dead
        // is unreachable in practice: editor.combat already destroys a Health
        // entity outright the tick it hits 0 (see damage()), so there's never
        // a tick where an AIAgent survives with 0 health for this system to
        // observe and label.
        add_timed(
            "editor.ai", engine::FixedPhase::update, 1,
            [&nav = nav_grid](engine::World &w, const engine::FixedUpdateContext &) {
                constexpr float dt = 1.0F / 60.0F;
                // Every AIAgent reacts to the same single point — the first
                // Player found — matching the "one Player" authoring
                // convention editor_add's own doc comment already assumes
                // for is_player.
                std::optional<engine::Vec3> player_pos;
                for (const auto player : w.query<engine::Box, PlayerMarker>()) {
                    player_pos = w.get<engine::Box>(player)->center;
                    break;
                }
                for (const auto entity : w.query<engine::physics::RigidBody, AIAgent>()) {
                    auto &agent = *w.get<AIAgent>(entity);
                    auto &body = *w.get<engine::physics::RigidBody>(entity);
                    const auto &box = *w.get<engine::Box>(entity);
                    const auto *health = w.get<Health>(entity);
                    const auto *pedestrian = w.get<Pedestrian>(entity);
                    const bool is_pedestrian = pedestrian != nullptr;

                    float dist_sq = -1.0F;
                    if (player_pos) {
                        const float dx = player_pos->x - box.center.x;
                        const float dz = player_pos->z - box.center.z;
                        dist_sq = dx * dx + dz * dz;
                    }
                    const bool player_near = player_pos && dist_sq <= ai_sense_radius * ai_sense_radius;
                    const bool low_health =
                        health && health->max > 0 && health->current / health->max <= ai_flee_health_ratio;

                    float target_x = 0.0F, target_z = 0.0F;
                    AIState next_state = AIState::Idle;
                    if (low_health && player_near) {
                        // Flee even if Pedestrian — self-preservation isn't hostility.
                        next_state = AIState::Fleeing;
                        const float dx = box.center.x - player_pos->x;
                        const float dz = box.center.z - player_pos->z;
                        const float len = std::sqrt(dx * dx + dz * dz);
                        if (len > 0.001F) {
                            target_x = dx / len;
                            target_z = dz / len;
                        }
                    } else if (!is_pedestrian && player_near) {
                        next_state = AIState::Chasing;
                        // Follow an A* path around obstacles, refreshed every
                        // ai_repath_interval; with no path (unreachable, or
                        // nothing in the way) head straight for the Player.
                        agent.repath -= dt;
                        if (agent.repath <= 0.0F || agent.state != AIState::Chasing) {
                            agent.repath = ai_repath_interval;
                            const auto found = nav.find_path(box.center, *player_pos);
                            agent.path = found ? *found : std::vector<engine::Vec3>{};
                        }
                        while (!agent.path.empty()) {
                            const float wx = agent.path.front().x - box.center.x;
                            const float wz = agent.path.front().z - box.center.z;
                            if (wx * wx + wz * wz > 0.35F * 0.35F || agent.path.size() == 1)
                                break;
                            agent.path.erase(agent.path.begin());
                        }
                        const engine::Vec3 aim = agent.path.empty() ? *player_pos : agent.path.front();
                        const float dx = aim.x - box.center.x;
                        const float dz = aim.z - box.center.z;
                        const float len = std::sqrt(dx * dx + dz * dz);
                        if (len > 0.001F) {
                            target_x = dx / len;
                            target_z = dz / len;
                        }
                    } else {
                        // Wander: alternate a resting (Idle) phase with a moving
                        // (Walking or Running) phase in a freshly rolled random
                        // direction, each phase lasting a random duration.
                        // Returning here from Chasing/Fleeing (the Player left
                        // range, or health recovered) always re-rolls
                        // immediately instead of resuming whatever phase was
                        // frozen mid-flight: neither reactive branch above ever
                        // touches agent.timer, so without this an old countdown
                        // would sit there stale, and target_x/target_z would
                        // stay 0 below (Chasing/Fleeing isn't Walking/Running),
                        // leaving the agent standing still while still
                        // reporting the last reactive state — for up to the
                        // remainder of that frozen timer, then another full
                        // Idle phase on top, before it actually resumed wander.
                        // Only a Pedestrian's own wander pace is personalized -- a
                        // hostile AIAgent (no Pedestrian at all) always gets
                        // pedestrian_tuning[0] (Casual), the same wander feel every
                        // AIAgent used before archetypes existed, since its wander
                        // phases aren't a "personality" a non-civilian entity has.
                        const auto &wander =
                            pedestrian_tuning[is_pedestrian
                                                   ? static_cast<std::size_t>(pedestrian->archetype)
                                                   : 0];
                        const bool was_reactive =
                            agent.state == AIState::Chasing || agent.state == AIState::Fleeing;
                        if (was_reactive)
                            agent.timer = 0.0F;
                        agent.timer -= dt;
                        if (agent.timer <= 0.0F) {
                            const bool was_idle = was_reactive || agent.state == AIState::Idle;
                            if (was_idle) {
                                agent.dir_x = random_unit(agent.rng);
                                agent.dir_z = random_unit(agent.rng);
                                const float len =
                                    std::sqrt(agent.dir_x * agent.dir_x + agent.dir_z * agent.dir_z);
                                if (len > 0.001F) {
                                    agent.dir_x /= len;
                                    agent.dir_z /= len;
                                } else {
                                    agent.dir_x = 0.0F;
                                    agent.dir_z = 1.0F;
                                }
                                next_state = next_random(agent.rng) % 3 == 0 ? AIState::Running
                                                                              : AIState::Walking;
                            } else {
                                next_state = AIState::Idle;
                            }
                            agent.timer = wander.min_phase + (random_unit(agent.rng) + 1.0F) * 0.5F *
                                                                  (wander.max_phase - wander.min_phase);
                        } else {
                            next_state = agent.state; // hold the current phase until the timer elapses
                        }
                        if (next_state == AIState::Walking || next_state == AIState::Running) {
                            target_x = agent.dir_x;
                            target_z = agent.dir_z;
                        }
                        const float speed = (next_state == AIState::Walking     ? ai_walk_speed
                                              : next_state == AIState::Idle     ? 0.0F
                                                                                 : ai_run_speed) *
                                             wander.speed_mult;
                        body.velocity.x = target_x * speed;
                        body.velocity.z = target_z * speed;
                        agent.state = next_state;
                        continue;
                    }
                    // Chasing or Fleeing (the only two states reachable here,
                    // the wander branch above always continue's instead):
                    // always full urgency, unscaled by any Pedestrian
                    // archetype (see pedestrian_tuning's own doc comment on
                    // Fleeing specifically; Chasing never applies to a
                    // Pedestrian at all, see the branch above).
                    body.velocity.x = target_x * ai_run_speed;
                    body.velocity.z = target_z * ai_run_speed;
                    agent.state = next_state;
                }
            });
        // Order 2: a Script entity drives its own velocity the same way an
        // AIAgent or the Player does, and likewise must land before physics
        // (order 10) integrates it. Ordered after editor.ai (1), not before
        // or at the same order, for the same reason editor.ai sits after
        // editor.move (0): a fixed, unambiguous run order between systems
        // that don't touch the same entity by authoring convention, not a
        // real dependency. An entity authored with both AIState and Script
        // gets both an AIAgent and a Script instance; whichever ran last (here,
        // this one) simply overwrites the other's velocity write that tick —
        // not a crash, just not a combination there's a reason to author.
        // AI drivers (0.70.0): every arcade car with a Driver, before physics.
        add_timed("editor.drivers", engine::FixedPhase::update, 4,
                  [this](engine::World &w, const engine::FixedUpdateContext &) {
                      // One collider scan shared by every driver's probes:
                      // a per-ray scan was most of this system's time.
                      std::optional<engine::physics::RaycastTargets> targets;
                      for (const auto entity : w.query<Heading, Driver, engine::physics::RigidBody>()) {
                          auto &heading = *w.get<Heading>(entity);
                          if (!heading.arcade || w.get<PlayerMarker>(entity))
                              continue;
                          if (!targets)
                              targets = engine::physics::raycast_targets(w);
                          const auto control = drive_ai(w, entity, heading, *w.get<Driver>(entity), *targets);
                          drive_car(w, entity, heading, *w.get<engine::physics::RigidBody>(entity), control);
                      }
                  });
        // Spaceflight (0.71.0): the ship before physics, the pilot after.
        add_timed("editor.space", engine::FixedPhase::update, 5,
                  [this](engine::World &w, const engine::FixedUpdateContext &context) {
                      if (space)
                          space_tick(w, context.input);
                  });
        add_timed("editor.space_after", engine::FixedPhase::update, 14,
                  [this](engine::World &w, const engine::FixedUpdateContext &) {
                      if (space)
                          space_after(w);
                  });
        add_timed("editor.soldiers", engine::FixedPhase::update, 3,
                  [this](engine::World &w, const engine::FixedUpdateContext &) {
                      time_now += 1.0F / 60.0F;
                      step_soldiers(w);
                  });
        add_timed("editor.script", engine::FixedPhase::update, 2,
                    [this](engine::World &w, const engine::FixedUpdateContext &) {
                        script_runtime.step(w, 1.0F / 60.0F);
                    });
        // Order 0: apply this tick's input to the player's velocity before
        // order 10 integrates it — matches the native playground's own
        // move-then-physics ordering.
        add_timed(
            "editor.move", engine::FixedPhase::update, 0,
            [this](engine::World &w, const engine::FixedUpdateContext &context) {
                for (const auto entity : w.query<engine::physics::RigidBody, PlayerMarker>()) {
                    if (stowed(entity))
                        continue;
                    auto &body = *w.get<engine::physics::RigidBody>(entity);
                    auto *heading = w.get<Heading>(entity);
                    auto *controller = w.get<Controller>(entity);
                    if (controller) {
                        const auto value = [this](const char *name) {
                            return actions.state(engine::ActionId{name}).value;
                        };
                        engine::gameplay::ControllerInput intent;
                        intent.move_x = value("move_x");
                        intent.move_y = value("move_y");
                        intent.jump_pressed = actions.state(engine::ActionId{"jump"}).pressed;
                        intent.sprint = actions.state(engine::ActionId{"sprint"}).down();
                        intent.crouch = actions.state(engine::ActionId{"crouch"}).down();
                        if (const auto *arsenal = w.get<Arsenal>(entity)) {
                            // Aiming down sights slows you and, like firing, stops a sprint.
                            if (arsenal->aiming) {
                                intent.move_x *= 0.55F;
                                intent.move_y *= 0.55F;
                            }
                            if (arsenal->aiming || actions.state(engine::ActionId{"fire"}).down())
                                intent.sprint = false;
                        }
                        intent.yaw = controller->first_person ? look_yaw
                                                             : std::atan2(-camera_forward_x, -camera_forward_z);
                        engine::gameplay::begin_step(w, entity, controller->state, controller->settings, intent,
                                                     physics_config.gravity * body.gravity_scale, 1.0F / 60.0F);
                    } else if (heading && heading->arcade) {
                        drive_car(w, entity, *heading, body, player_car_input());
                    } else if (heading) {
                        // Vehicle model: W/S accelerate/reverse along the vehicle's own
                        // heading (momentum, not instant velocity), A/D steer that heading
                        // — "driving," not strafing. Self-relative by construction, so
                        // there's no camera-orientation ambiguity to get "flipped" here.
                        float accel_input = 0, steer_input = 0;
                        if (context.input.key_down(engine::Key::w))
                            accel_input += 1;
                        if (context.input.key_down(engine::Key::s))
                            accel_input -= 1;
                        if (context.input.key_down(engine::Key::d))
                            steer_input += 1;
                        if (context.input.key_down(engine::Key::a))
                            steer_input -= 1;
                        const auto &tuning =
                            vehicle_tuning[static_cast<std::size_t>(heading->archetype)];
                        heading->yaw += steer_input * tuning.turn_rate / 60.0F;
                        heading->speed += accel_input * tuning.accel / 60.0F;
                        if (accel_input == 0) {
                            if (heading->speed > 0)
                                heading->speed = std::max(0.0F, heading->speed - tuning.drag / 60.0F);
                            else
                                heading->speed = std::min(0.0F, heading->speed + tuning.drag / 60.0F);
                        }
                        heading->speed =
                            std::clamp(heading->speed, -tuning.max_reverse, tuning.max_forward);
                        body.velocity.x = std::sin(heading->yaw) * heading->speed;
                        body.velocity.z = std::cos(heading->yaw) * heading->speed;
                        // Rotate the collision footprint with the vehicle: its rendered
                        // mesh already turns to face heading->yaw (main.ts, field 4), but
                        // physics::step only ever resolves axis-aligned Box.size — left
                        // fixed to the authored (world-axis) dimensions, a non-square
                        // vehicle's true footprint at 90 degrees would visually be as wide
                        // as it is long while still colliding as if it weren't turned at
                        // all. Recomputed every tick as the local footprint's own
                        // axis-aligned bounding box at the current yaw (the standard
                        // rotated-rectangle-AABB formula), so it's narrowest facing its
                        // own long axis and widest at 45/135 degrees, same as the visible
                        // mesh actually sweeps.
                        auto &box = *w.get<engine::Box>(entity);
                        const float cos_yaw = std::cos(heading->yaw), sin_yaw = std::sin(heading->yaw);
                        box.size.x =
                            2.0F * (std::abs(heading->half_x * cos_yaw) + std::abs(heading->half_z * sin_yaw));
                        box.size.z =
                            2.0F * (std::abs(heading->half_x * sin_yaw) + std::abs(heading->half_z * cos_yaw));
                    } else {
                        // On-foot model: camera-relative strafing — W always moves toward
                        // wherever the camera is currently facing (see camera_forward_x/z's
                        // own doc comment), not a fixed world axis, so the felt direction of
                        // every key stays correct regardless of how the camera's been orbited.
                        float right = 0, forward = 0;
                        // Crouching/sitting (C, key_for() code 7) ignores WASD entirely
                        // instead of merely playing a different clip over live movement --
                        // sliding along the ground while visibly sitting would look wrong,
                        // and freezing the input here is the simplest way to guarantee it,
                        // rather than trying to keep a "sit" animation visually in sync with
                        // a still-moving Box.
                        if (!context.input.key_down(engine::Key::c)) {
                            if (context.input.key_down(engine::Key::a))
                                right -= 1;
                            if (context.input.key_down(engine::Key::d))
                                right += 1;
                            if (context.input.key_down(engine::Key::w))
                                forward += 1;
                            if (context.input.key_down(engine::Key::s))
                                forward -= 1;
                        }
                        const float fx = camera_forward_x, fz = camera_forward_z;
                        const float right_x = -fz, right_z = fx; // cross(forward, up), up = +y
                        body.velocity.x = (right_x * right + fx * forward) * move_speed;
                        body.velocity.z = (right_z * right + fz * forward) * move_speed;
                    }
                    // Press jump while grounded to launch; keep holding it
                    // while airborne to fly (a steady climb, not a single
                    // decaying arc) — same as the native playground. A
                    // CharacterController jumps through its own actions.
                    if (controller) {
                    } else if (context.input.key_pressed(engine::Key::left_shift) && body.grounded)
                        body.velocity.y = jump_speed;
                    else if (context.input.key_down(engine::Key::left_shift) && !body.grounded)
                        body.velocity.y = fly_speed;
                    // Ranged attack: fire a blast at the nearest Health entity (the
                    // editor has no single hardcoded "enemy" the way the native
                    // playground does, so the target is picked fresh each press).
                    // No-op with nothing to aim at, same as the native playground's
                    // own enemy.has_value() guard.
                    if (pending_blast) {
                        pending_blast = false; // consumed by this tick, not every tick this frame
                        // Plays a firing/ranged-attack clip on every G press, whether or not
                        // anything was actually in range to hit -- same reasoning as
                        // editor.combat's own request_animation call below: the animation is
                        // tied to the action, not its outcome, matching a real game where a
                        // whiffed attack still plays its swing/fire animation.
                        script_runtime.request_animation(entity, "blast");
                        const auto &box = *w.get<engine::Box>(entity);
                        std::optional<engine::Entity> nearest;
                        float nearest_distance_sq = 0;
                        for (const auto candidate : w.query<engine::Box, Health>()) {
                            if (candidate == entity)
                                continue;
                            const auto &target_box = *w.get<engine::Box>(candidate);
                            const float dx = target_box.center.x - box.center.x;
                            const float dy = target_box.center.y - box.center.y;
                            const float dz = target_box.center.z - box.center.z;
                            const float distance_sq = dx * dx + dy * dy + dz * dz;
                            if (!nearest.has_value() || distance_sq < nearest_distance_sq) {
                                nearest = candidate;
                                nearest_distance_sq = distance_sq;
                            }
                        }
                        if (nearest.has_value()) {
                            const auto &target_box = *w.get<engine::Box>(*nearest);
                            engine::Vec3 direction{target_box.center.x - box.center.x,
                                                    target_box.center.y - box.center.y,
                                                    target_box.center.z - box.center.z};
                            const float length = std::sqrt(
                                direction.x * direction.x + direction.y * direction.y +
                                direction.z * direction.z);
                            if (length > 0.001F) { // already overlapping: nothing to aim at
                                direction = {direction.x / length, direction.y / length,
                                             direction.z / length};
                                const auto projectile = w.defer_create();
                                w.defer_set(projectile,
                                            engine::Box{box.center, engine::Vec3{0.3F, 0.3F, 0.3F}});
                                Projectile blast{engine::Vec3{direction.x * blast_speed,
                                                              direction.y * blast_speed,
                                                              direction.z * blast_speed},
                                                 entity};
                                blast.damage = blast_damage;
                                w.defer_set(projectile, blast);
                            }
                        }
                    }
                }
            });
        add_timed("editor.physics", engine::FixedPhase::update, 10,
                    [this](engine::World &w, const engine::FixedUpdateContext &) {
                        engine::physics::step(w, 1.0F / 60.0F, physics_config, &physics_events);
                    });
        // Right after physics: controllers climb steps and stick to the
        // ground (engine::gameplay::end_step).
        add_timed("editor.controller", engine::FixedPhase::update, 11,
                  [this](engine::World &w, const engine::FixedUpdateContext &) {
                      for (const auto entity : w.query<engine::physics::RigidBody, Controller>()) {
                          if (stowed(entity))
                              continue;
                          auto &controller = *w.get<Controller>(entity);
                          engine::gameplay::end_step(w, entity, controller.state, controller.settings,
                                                     physics_config, 1.0F / 60.0F);
                      }
                  });
        // After movement, physics and the controller, so shots leave from
        // where the shooter actually is this tick.
        add_timed("editor.weapons", engine::FixedPhase::update, 13,
                  [this](engine::World &w, const engine::FixedUpdateContext &context) {
                      constexpr float dt = 1.0F / 60.0F;
                      for (const auto entity : w.query<engine::Box, Arsenal>()) {
                          auto &arsenal = *w.get<Arsenal>(entity);
                          if (arsenal.weapons.empty())
                              continue;
                          const auto &box = *w.get<engine::Box>(entity);
                          const auto *controller = w.get<Controller>(entity);
                          const bool player = w.get<PlayerMarker>(entity) != nullptr;
                          engine::Vec3 origin = box.center;
                          origin.y = controller ? box.center.y - box.size.y / 2 + engine::gameplay::eye_offset(box)
                                                : box.center.y + box.size.y * 0.35F;
                          engine::Vec3 direction{0, 0, -1};
                          engine::gameplay::TriggerInput trigger;
                          bool aim = false;
                          if (player) {
                              const auto &fire = actions.state(engine::ActionId{"fire"});
                              trigger.fire_down = fire.down();
                              trigger.fire_pressed = fire.pressed;
                              trigger.reload = actions.state(engine::ActionId{"reload"}).pressed;
                              aim = actions.state(engine::ActionId{"aim"}).down();
                              if (actions.state(engine::ActionId{"next_weapon"}).pressed)
                                  trigger.cycle = 1;
                              const auto &scroll = actions.state(engine::ActionId{"weapon_scroll"});
                              if (scroll.pressed)
                                  trigger.cycle = scroll.value > 0 ? -1 : 1;
                              for (int n = 0; n < 9; ++n)
                                  if (context.input.key_pressed(
                                          static_cast<engine::Key>(static_cast<int>(engine::Key::digit1) + n)))
                                      trigger.select = n;
                              const float cos_pitch = std::cos(look_pitch);
                              direction = {-std::sin(look_yaw) * cos_pitch, std::sin(look_pitch),
                                           -std::cos(look_yaw) * cos_pitch};
                          }
                          if (arsenal.script_fire)
                              trigger.fire_down = trigger.fire_pressed = true;
                          if (arsenal.script_reload)
                              trigger.reload = true;
                          if (arsenal.script_select >= 0)
                              trigger.select = arsenal.script_select;
                          if (arsenal.script_aim) {
                              const auto a = *arsenal.script_aim;
                              const float length = std::sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
                              if (length > 1e-6F)
                                  direction = {a.x / length, a.y / length, a.z / length};
                          }
                          arsenal.script_fire = arsenal.script_reload = false;
                          arsenal.script_select = -1;
                          arsenal.script_aim.reset();
                          arsenal.aiming =
                              aim && arsenal.state.reload_left <= 0 && arsenal.state.equip_left <= 0;
                          const float bloom = arsenal.state.bloom;
                          const auto tick = engine::gameplay::update_weapon(arsenal.state, arsenal.weapons, trigger, dt);
                          const int shooter = index_of(entity);
                          const int slot = arsenal.state.current;
                          const auto &weapon = arsenal.weapons[static_cast<std::size_t>(slot)];
                          if (tick.switched)
                              push_event({WeaponEventKind::switched, shooter, -1, origin, {}, weapon.equip_time, slot});
                          if (tick.reload_started)
                              push_event({WeaponEventKind::reload, shooter, -1, origin, {}, weapon.reload_time, slot});
                          if (tick.reload_finished)
                              push_event({WeaponEventKind::reloaded, shooter, -1, origin, {}, 0, slot});
                          if (tick.empty)
                              push_event({WeaponEventKind::empty, shooter, -1, origin, {}, 0, slot});
                          if (tick.fired) {
                              float speed_ratio = 0;
                              bool airborne = false;
                              if (controller) {
                                  speed_ratio = controller->state.speed / controller->settings.walk_speed;
                                  airborne = !controller->state.grounded;
                              }
                              fire_weapon(w, entity, arsenal, origin, direction,
                                          engine::gameplay::current_spread(weapon, arsenal.aiming, speed_ratio,
                                                                           airborne, bloom));
                          }
                      }
                  });
        // Right after physics, so scripts hear about this tick's contacts
        // (on_collision_*/on_trigger_*) before anything else reacts.
        add_timed("editor.script_contacts", engine::FixedPhase::update, 12,
                    [this](engine::World &w, const engine::FixedUpdateContext &) {
                        script_runtime.dispatch_contacts(w, physics_events);
                    });
        // Order 15: after physics moves everything (10) but before combat (20)
        // resolves melee for this same tick — matches the native playground's
        // own ordering.
        add_timed(
            "editor.projectiles", engine::FixedPhase::update, 15,
            [this](engine::World &w, const engine::FixedUpdateContext &) {
                constexpr float dt = 1.0F / 60.0F;
                for (const auto entity : w.query<engine::Box, Projectile>()) {
                    auto &box = *w.get<engine::Box>(entity);
                    auto &projectile = *w.get<Projectile>(entity);
                    projectile.velocity.y += physics_config.gravity * projectile.gravity * dt;
                    const engine::Vec3 step{projectile.velocity.x * dt, projectile.velocity.y * dt,
                                            projectile.velocity.z * dt};
                    const float length = std::sqrt(step.x * step.x + step.y * step.y + step.z * step.z);
                    // Stops at solid geometry (and the ground) along this tick's path.
                    engine::physics::QueryFilter filter;
                    filter.ignore = projectile.owner;
                    const auto wall = length > 0 ? engine::physics::raycast(w, box.center, step, length,
                                                                            physics_config, filter)
                                                 : std::nullopt;
                    if (wall)
                        box.center = wall->point;
                    else
                        box.center = {box.center.x + step.x, box.center.y + step.y, box.center.z + step.z};
                    projectile.lifetime -= dt;
                    std::optional<engine::Entity> target;
                    if (wall && !wall->hit_ground && w.get<Health>(wall->entity))
                        target = wall->entity;
                    for (const auto candidate : w.query<engine::Box, Health>()) {
                        if (target || candidate == projectile.owner)
                            continue;
                        if (engine::physics::overlaps(box, *w.get<engine::Box>(candidate)))
                            target = candidate;
                    }
                    if (!target && !wall && projectile.lifetime > 0)
                        continue;
                    if (projectile.splash > 0 && (target || wall))
                        explode(w, projectile.owner, box.center, projectile.splash, projectile.damage);
                    else if (target)
                        apply_damage(w, *target, projectile.damage, projectile.owner);
                    else if (wall)
                        push_event({WeaponEventKind::impact, index_of(projectile.owner),
                                    wall->hit_ground ? -1 : index_of(wall->entity), wall->point, wall->normal, 0, 0});
                    w.defer_destroy(entity);
                }
            });
        // Melee: press "attack" (F) while a Player's Box overlaps a Health
        // entity's Box — the same overlap test the native playground's combat
        // and goal checks use. Order 20 matches the native playground's own
        // combat system order.
        add_timed(
            "editor.combat", engine::FixedPhase::update, 20,
            [this](engine::World &w, const engine::FixedUpdateContext &) {
                if (!pending_attack)
                    return;
                pending_attack = false; // consumed by this tick, not every tick this frame
                for (const auto entity : w.query<engine::Box, PlayerMarker>()) {
                    // Plays a punch/attack clip on every F press, whether or not it
                    // actually connects with a Health entity below -- the animation is
                    // tied to the action (a real game plays a swing animation on a miss
                    // too), not gated on damage() actually landing. See
                    // engine::script::Runtime::request_animation's own doc comment: this
                    // reaches main.ts's pollAnimationRequests the same way a script's own
                    // self.animate would, just triggered natively instead of from Lua.
                    script_runtime.request_animation(entity, "attack");
                    const auto &box = *w.get<engine::Box>(entity);
                    for (const auto target : w.query<engine::Box, Health>()) {
                        if (target == entity)
                            continue;
                        if (engine::physics::overlaps(box, *w.get<engine::Box>(target)))
                            apply_damage(w, target, attack_damage, entity);
                    }
                }
            });
        // A hostile (Chasing) AIAgent hits back once it's actually caught the
        // Player, instead of Player->enemy combat above being the only
        // direction damage ever flows -- without this, a Chasing AIAgent
        // catching the Player is harmless contact, no different from bumping
        // into a wall. Gated to Chasing specifically (never Fleeing, and
        // never reachable at all for a Pedestrian -- see "editor.ai"'s own
        // state-machine above) so a fleeing or merely wandering agent never
        // attacks. A no-op if the Player has no Health (damage()'s own
        // contract) or Health isn't authored on the Player at all (the query
        // below simply finds nothing) -- attacking back is opt-in the same
        // way taking damage already is for every other entity. Ordered after
        // editor.combat (20), not before or at the same order -- but that
        // alone does NOT stop an agent editor.combat already killed this
        // same tick from also landing a hit here: FixedSystems::run only
        // flushes World::defer_destroy's queued removals once per whole
        // phase (see its own definition, fixed_systems.cpp), not between
        // same-phase systems, so a defeated agent stays fully queryable,
        // Health and all, until every FixedPhase::update system (including
        // this one) has already run. The explicit health->current > 0 check
        // below is what actually makes a simultaneous kill favor the
        // Player, not the order number.
        add_timed(
            "editor.ai_attack", engine::FixedPhase::update, 21,
            [this](engine::World &w, const engine::FixedUpdateContext &) {
                constexpr float dt = 1.0F / 60.0F;
                for (const auto entity : w.query<engine::Box, AIAgent>()) {
                    auto &agent = *w.get<AIAgent>(entity);
                    if (agent.attack_cooldown > 0.0F)
                        agent.attack_cooldown -= dt;
                    if (agent.state != AIState::Chasing || agent.attack_cooldown > 0.0F)
                        continue;
                    const auto *own_health = w.get<Health>(entity);
                    if (own_health && own_health->current <= 0.0F)
                        continue; // already defeated this tick, just not flushed yet
                    const auto &box = *w.get<engine::Box>(entity);
                    for (const auto target : w.query<engine::Box, PlayerMarker, Health>()) {
                        if (engine::physics::overlaps(box, *w.get<engine::Box>(target))) {
                            apply_damage(w, target, ai_attack_damage, entity);
                            agent.attack_cooldown = ai_attack_interval;
                            // Unlike the Player's own F/G (which animate on every press,
                            // hit or miss), an AIAgent's only "action" here is landing a
                            // hit at all -- it has no separate swing/miss beat to animate,
                            // so this is the one point that stands in for both.
                            script_runtime.request_animation(entity, "attack");
                            break;
                        }
                    }
                }
            });
    }
};
void register_components(engine::World &w) {
    w.register_component<engine::Box>("editor.box");
    w.register_component<engine::physics::RigidBody>("editor.rigid_body");
    w.register_component<engine::physics::Collider>("editor.collider");
    w.register_component<PlayerMarker>("editor.player");
    w.register_component<Health>("editor.health");
    w.register_component<Projectile>("editor.projectile");
    w.register_component<Heading>("editor.heading");
    w.register_component<Driver>("editor.driver");
    w.register_component<Spaceship>("editor.spaceship");
    w.register_component<AIAgent>("editor.ai_agent");
    w.register_component<Pedestrian>("editor.pedestrian");
    w.register_component<engine::script::Script>("editor.script");
    w.register_component<EntityName>("editor.name");
    w.register_component<SpawnedFrom>("editor.spawned_from");
    w.register_component<Controller>("editor.controller");
    w.register_component<Arsenal>("editor.arsenal");
    w.register_component<Soldier>("editor.soldier");
}

template <typename T> void copy_component(const engine::World &from, engine::Entity source, engine::World &to,
                                          engine::Entity target) {
    if (const auto *value = from.get<T>(source))
        to.defer_set(target, *value);
}

std::optional<engine::Entity> BridgeHost::find(const engine::World &world, const std::string &name) {
    for (const auto entity : runtime_.entities)
        if (const auto *n = world.get<EntityName>(entity); n && n->value == name)
            return entity;
    return std::nullopt;
}

std::string BridgeHost::name_of(const engine::World &world, engine::Entity entity) {
    const auto *n = world.get<EntityName>(entity);
    return n ? n->value : std::string{};
}

std::optional<engine::Entity> BridgeHost::spawn(engine::World &world, const std::string &prefab,
                                                engine::Vec3 position, engine::Vec3 velocity) {
    const auto found = runtime_.template_by_name.find(prefab);
    if (found == runtime_.template_by_name.end() || runtime_.entities.size() >= 1024)
        return std::nullopt;
    const auto &from = runtime_.templates;
    const auto source = found->second;
    const auto entity = world.defer_create();
    auto box = *from.get<engine::Box>(source);
    box.center = position;
    world.defer_set(entity, box);
    if (const auto *body = from.get<engine::physics::RigidBody>(source)) {
        auto copy = *body;
        copy.velocity = velocity;
        world.defer_set(entity, copy);
    }
    copy_component<engine::physics::Collider>(from, source, world, entity);
    copy_component<PlayerMarker>(from, source, world, entity);
    copy_component<Health>(from, source, world, entity);
    copy_component<Heading>(from, source, world, entity);
    copy_component<AIAgent>(from, source, world, entity);
    copy_component<Pedestrian>(from, source, world, entity);
    copy_component<engine::script::Script>(from, source, world, entity);
    copy_component<Controller>(from, source, world, entity);
    copy_component<Arsenal>(from, source, world, entity);
    copy_component<Soldier>(from, source, world, entity);
    copy_component<Driver>(from, source, world, entity);
    world.defer_set(entity, EntityName{prefab});
    world.defer_set(entity, SpawnedFrom{prefab});
    runtime_.entities.push_back(entity);
    return entity;
}

bool BridgeHost::space(engine::World &world, const std::string &op, const std::vector<double> &args,
                       const std::string &text, std::vector<double> &out, std::string &text_out) {
    if (!runtime_.space)
        return false;
    auto &sp = *runtime_.space;
    const auto arg = [&](std::size_t i) { return i < args.size() && std::isfinite(args[i]) ? args[i] : 0.0; };
    const auto body_index = [&](const std::string &name) {
        for (std::size_t i = 0; i < sp.system.bodies.size(); ++i)
            if (sp.system.bodies[i].name == name)
                return static_cast<int>(i);
        return -1;
    };
    const auto finite = [](double v) { return std::isfinite(v) ? v : 1e12; };
    if (op == "state") {
        const auto orbit = space::orbit_elements(sp.ship, sp.system);
        const auto local = sp.to_local(sp.ship_absolute());
        out = {finite(sp.ship.altitude), space::length(sp.ship.velocity), sp.ship.vertical_speed, sp.ship.ground_speed,
               sp.ship.throttle, sp.ship.fuel, sp.spec.fuel, sp.ship.hull, sp.spec.hull, sp.ship.heat,
               sp.ship.landed ? 1.0 : 0.0, sp.piloting ? 1.0 : 0.0, sp.ship.density, sp.warp,
               orbit.valid ? finite(orbit.periapsis) : 0.0, orbit.valid ? finite(orbit.apoapsis) : 0.0, sp.time,
               sp.ship.destroyed ? 1.0 : 0.0, local.x, local.y, local.z, orbit.valid && orbit.closed ? 1.0 : 0.0,
               sp.ship.g_force, space::length(local)};
        // Where the ship is over its reference body, in degrees.
        const auto dir = space::normalized(sp.ship.position);
        out.push_back(std::asin(std::clamp(dir.y, -1.0, 1.0)) * 180 / 3.14159265358979);
        out.push_back(std::atan2(dir.z, dir.x) * 180 / 3.14159265358979);
        text_out = (sp.ship.ref >= 0 ? sp.system.bodies[static_cast<std::size_t>(sp.ship.ref)].name : std::string{"star"}) +
                   ";" + assist_name(sp.assist) + ";" +
                   (sp.target >= 0 ? sp.system.bodies[static_cast<std::size_t>(sp.target)].name : std::string{});
        return true;
    }
    if (op == "events") {
        for (const auto &e : sp.events)
            text_out += e + "\n";
        sp.events.clear();
        return true;
    }
    if (op == "warp") {
        sp.warp = std::clamp(arg(0), 1.0, 1000.0);
        return true;
    }
    if (op == "assist") {
        const auto assist = parse_assist(text);
        if (!assist)
            return false;
        sp.assist = *assist;
        return true;
    }
    if (op == "target") {
        sp.target = text.empty() ? -1 : body_index(text);
        if (sp.target < 0 && sp.assist == space::Assist::target)
            sp.assist = space::Assist::stabilized;
        return text.empty() || sp.target >= 0;
    }
    if (op == "refuel") {
        sp.ship.fuel = arg(0) < 0 ? sp.spec.fuel : std::min(sp.spec.fuel, sp.ship.fuel + arg(0));
        return true;
    }
    if (op == "set_fuel") {
        sp.ship.fuel = std::clamp(arg(0), 0.0, sp.spec.fuel);
        return true;
    }
    if (op == "repair") {
        sp.ship.hull = arg(0) < 0 ? sp.spec.hull : std::min(sp.spec.hull, sp.ship.hull + arg(0));
        if (sp.ship.hull > 0)
            sp.ship.destroyed = false;
        return true;
    }
    if (op == "board")
        return runtime_.space_board(world);
    if (op == "exit")
        return runtime_.space_exit(world);
    if (op == "controls") {
        sp.controls = arg(0) != 0;
        return true;
    }
    if (op == "place_landed" || op == "place_orbit") {
        const int index = body_index(text);
        if (index < 0)
            return false;
        if (op == "place_orbit") {
            space::place_in_orbit(sp.ship, sp.system, index, std::max(0.0, arg(0)));
        } else {
            const double lat = arg(0) * 3.14159265358979 / 180, lon = arg(1) * 3.14159265358979 / 180;
            const space::DVec3 dir{std::cos(lat) * std::cos(lon), std::sin(lat), std::cos(lat) * std::sin(lon)};
            // Heading measured from the body's north (+y) around the local vertical.
            const space::DVec3 helper = std::abs(dir.y) < 0.99 ? space::DVec3{0, 1, 0} : space::DVec3{1, 0, 0};
            const auto north = space::normalized(helper - dir * space::dot(helper, dir));
            const auto east = space::cross(north, dir);
            const double heading = arg(2) * 3.14159265358979 / 180;
            space::place_landed(sp.ship, sp.spec, sp.system, index, dir,
                                north * std::cos(heading) + east * std::sin(heading));
            runtime_.settle_landed(world);
        }
        sp.ship.destroyed = false;
        sp.warp = 1;
        sp.throttle = 0;
        return true;
    }
    if (op == "body") {
        const int index = body_index(text);
        if (index < 0)
            return false;
        const auto &b = sp.system.bodies[static_cast<std::size_t>(index)];
        const double distance = space::length(space::body_position(sp.system, index, sp.time) - sp.ship_absolute());
        out = {b.radius, b.surface_gravity, b.atmosphere_height, distance, distance - b.radius};
        return true;
    }
    return false;
}
bool BridgeHost::vehicle(engine::World &world, engine::Entity entity, const std::string &op,
                         const std::vector<double> &args, const std::string &text, std::optional<engine::Entity> other,
                         std::vector<double> &out) {
    auto *heading = world.get<Heading>(entity);
    if (!heading || !heading->arcade)
        return false;
    auto &car = heading->car;
    const auto arg = [&](std::size_t i) { return i < args.size() && std::isfinite(args[i]) ? static_cast<float>(args[i]) : 0.0F; };
    if (op == "state") {
        out = {std::hypot(car.velocity.x, car.velocity.z), car.forward_speed, static_cast<double>(car.gear), car.rpm,
               car.nitro, car.drifting ? 1.0 : 0.0, car.boosting ? 1.0 : 0.0, car.yaw, car.slip};
        return true;
    }
    if (op == "set_nitro") {
        car.nitro = std::clamp(arg(0), 0.0F, 1.0F);
        return true;
    }
    if (op == "reset") {
        auto &box = *world.get<engine::Box>(entity);
        box.center = {arg(0), arg(1), arg(2)};
        const float nitro = car.nitro;
        car = {};
        car.nitro = nitro;
        car.yaw = heading->yaw = arg(3);
        heading->speed = 0;
        if (auto *body = world.get<engine::physics::RigidBody>(entity))
            body->velocity = {};
        if (auto *driver = world.get<Driver>(entity)) {
            driver->next = route_start(driver->route, box.center, car.yaw);
            driver->stuck = driver->reversing = 0;
        }
        return true;
    }
    if (op == "freeze") {
        heading->frozen = arg(0) != 0;
        return true;
    }
    auto *driver = world.get<Driver>(entity);
    if (!driver) {
        world.set(entity, Driver{});
        driver = world.get<Driver>(entity);
    }
    if (op == "route") {
        driver->route = parse_route(text);
        driver->loop = arg(0) != 0;
        driver->next = route_start(driver->route, world.get<engine::Box>(entity)->center, car.yaw);
        return true;
    }
    if (op == "target") {
        driver->target = other;
        driver->target_name.clear();
        return true;
    }
    if (op == "mode") {
        driver->mode = text == "race" ? DriveMode::Race
                       : text == "pursuit" ? DriveMode::Pursuit
                       : text == "traffic" ? DriveMode::Traffic
                                           : DriveMode::Off;
        return true;
    }
    if (op == "speed_scale") {
        driver->speed_scale = std::max(0.05F, arg(0));
        return true;
    }
    return false;
}

bool BridgeHost::weapon(engine::World &world, engine::Entity self, const std::string &op,
                        const std::vector<double> &args, std::vector<double> &out) {
    auto *arsenal = world.get<Arsenal>(self);
    if (!arsenal || arsenal->weapons.empty())
        return false;
    auto &state = arsenal->state;
    const int count = static_cast<int>(arsenal->weapons.size());
    if (op == "fire") {
        arsenal->script_fire = true;
        if (args.size() == 3 && std::isfinite(args[0]) && std::isfinite(args[1]) && std::isfinite(args[2]))
            arsenal->script_aim = engine::Vec3{static_cast<float>(args[0]), static_cast<float>(args[1]),
                                               static_cast<float>(args[2])};
    } else if (op == "reload") {
        arsenal->script_reload = true;
    } else if (op == "select") {
        if (!args.empty() && args[0] >= 0 && args[0] < count)
            arsenal->script_select = static_cast<int>(args[0]);
    } else if (op == "ammo") {
        const auto slot = static_cast<std::size_t>(state.current);
        out = {static_cast<double>(state.magazine[slot]), static_cast<double>(state.reserve[slot]),
               static_cast<double>(slot), state.reload_left > 0 ? 1.0 : 0.0};
    } else if (op == "give_ammo") {
        if (args.size() == 2 && std::isfinite(args[0]) && std::isfinite(args[1]))
            engine::gameplay::give_ammo(state, args[1] < 0 ? state.current : static_cast<int>(args[1]),
                                        static_cast<int>(std::clamp(args[0], 0.0, 100000.0)));
    } else {
        return false;
    }
    return true;
}

bool BridgeHost::health(const engine::World &world, engine::Entity entity, float &current, float &max) {
    const auto *h = world.get<Health>(entity);
    if (!h)
        return false;
    current = h->current;
    max = h->max;
    return true;
}

void BridgeHost::heal(engine::World &world, engine::Entity entity, float amount) {
    auto *health = world.get<Health>(entity);
    if (health && health->current > 0 && std::isfinite(amount) && amount > 0)
        health->current = std::min(health->max, health->current + amount);
}

void BridgeHost::damage(engine::World &world, engine::Entity entity, float amount) {
    if (std::isfinite(amount) && amount > 0)
        runtime_.apply_damage(world, entity, amount, std::nullopt);
}

void BridgeHost::emit(engine::Entity source, const std::string &kind, const std::string &a, const std::string &b) {
    if (runtime_.commands.size() >= 256)
        return; // a runaway script can't flood the editor
    int index = -1;
    for (std::size_t i = 0; i < runtime_.entities.size(); ++i)
        if (runtime_.entities[i] == source)
            index = static_cast<int>(i);
    runtime_.commands.push_back({kind, index, a, b});
}

std::unique_ptr<Runtime> active = std::make_unique<Runtime>();
std::unique_ptr<Runtime> staging;
bool failed{};
// Snapshot taken by editor_take_dirty_saves() and read by
// editor_dirty_save_key/editor_dirty_save_value until the next take call
// replaces it. A snapshot, not a live view, because
// engine::script::Runtime::take_dirty_saves() itself drains the pending set
// it reads from -- calling it more than once per frame would silently lose
// whichever keys the first call already took, so JS must call the count
// function exactly once per poll and then index into what it returned.
std::vector<std::pair<std::string, std::string>> pending_dirty_saves;
// The entity a post-editor_add setter refers to: index >= 0 is a scene
// entity, -1 is the prefab template editor_add just created.
std::optional<std::pair<engine::World *, engine::Entity>> staged(int index) {
    if (!staging)
        return std::nullopt;
    if (index == -1)
        return staging->last_template ? std::optional{std::pair{&staging->templates, *staging->last_template}}
                                      : std::nullopt;
    if (index < 0 || static_cast<std::size_t>(index) >= staging->entities.size())
        return std::nullopt;
    return std::pair{&staging->world, staging->entities[static_cast<std::size_t>(index)]};
}
} // namespace
extern "C" {
EXPORT void editor_begin() {
    staging = std::make_unique<Runtime>();
    failed = false;
}
// sx/sy/sz are the entity's authored world-space box dimensions (its Scale), so ground
// and future collider resolution rests the box's actual visible bounds, not a hardcoded
// unit cube. is_child is nonzero when the entity has a Parent: `x`/`y`/`z` are then a
// parent-relative local position, not a world-space one, and the physics module has no
// notion of hierarchy — so a child entity gets no RigidBody and is left untouched by
// physics::step (which only acts on Box+RigidBody pairs), passing its authored local
// transform straight back through editor_value unchanged instead of being simulated
// against the world ground plane it doesn't actually sit on. is_player is nonzero for
// the (at most, by authoring convention — not enforced here) one entity WASD/jump input
// drives; meaningless without a RigidBody, so it's simply ignored for a child. is_collider is
// nonzero when the entity carries an authored Collider component: it becomes a static
// engine::physics::Collider obstacle (its Box, i.e. authored Scale, is the AABB other bodies
// resolve out of) that a falling/moving RigidBody — including the player — is pushed out of.
// Like is_player, meaningless for a child: a child's Box is parent-relative, not world-space,
// so using it as a world obstacle would resolve other bodies against a box that isn't actually
// where it renders; it's simply ignored for a child, same reasoning as excluding it from
// RigidBody entirely. hp_max > 0 means the entity carries an authored Health component (with
// hp_current clamped into [0, hp_max]); hp_max <= 0 is the "no Health" sentinel, since a real
// Health always has a positive max. Like is_collider, ignored for a child — melee/blast target
// it via a world-space overlap test, which a parent-relative Box can't correctly support.
// is_vehicle is nonzero when the entity carries an authored Vehicle component; meaningless
// without is_player (nothing else feeds it input), so it's simply ignored without that too.
// When both apply, the entity gets a Heading{yaw: 0, speed: 0} instead of moving under the
// default camera-relative strafe model, always starting out facing world +z, since editor_add
// has no Rotation input to seed a better initial heading from — a placed-and-rotated vehicle
// visually snaps to face +z the instant Play starts, a known, documented simplification.
// is_ai is nonzero when the entity carries an authored AIState component: it gets an AIAgent
// instead of ever reading InputState, wandering on its own, chasing the Player when one comes
// within ai_sense_radius, or fleeing it below ai_flee_health_ratio — the same way is_vehicle's
// Heading substitutes a different movement model for the Player's own. Ignored for a child, same
// reasoning as is_player. is_pedestrian is nonzero when the entity also carries an authored
// Pedestrian component; meaningless without is_ai (nothing else reads it), so it's simply
// ignored without that too — see Pedestrian's own doc comment for what it changes. collider_shape
// (0 = Box, nonzero = Sphere) and collider_radius select the authored Collider.type/radius —
// previously accepted by the editor's inspector but silently ignored here, so a "Sphere" collider
// resolved (and rendered a selection box for) an AABB derived from Scale exactly like an "AABB"
// one; meaningless without is_collider, so both are simply ignored without that too.
// collider_radius is validated whenever is_collider is set regardless of shape, not just for
// Sphere, since validating it unconditionally is simpler than threading the shape check through
// the validation pass too and costs nothing when shape is Box (which never reads it).
// vehicle_archetype (an index into vehicle_tuning, VehicleArchetype's declared order) is
// validated whenever is_vehicle is set, same conditional pattern as collider_radius/is_collider
// -- meaningless, and left unvalidated, without it. pedestrian_archetype (an index into
// pedestrian_tuning, PedestrianArchetype's declared order) is likewise validated only when
// is_pedestrian is set. Both are real array indices once stored (see Heading::archetype/
// Pedestrian::archetype and their own doc comments), not just an opaque number like
// Vehicle.archetype/Pedestrian.archetype were before this — out-of-range here would be a
// same-tick out-of-bounds read the first time editor.move or editor.ai runs, not a delayed or
// cosmetic failure, so this validates strictly (a safe non-negative integer inside the table's
// bounds) rather than clamping a bad value into range silently.
EXPORT int editor_add(double x, double y, double z, double vx, double vy, double vz, double sx,
                       double sy, double sz, double is_child, double is_player, double is_collider,
                       double hp_current, double hp_max, double is_vehicle, double is_ai,
                       double is_pedestrian, double collider_shape, double collider_radius,
                       double vehicle_archetype, double pedestrian_archetype) {
    if (!staging || (!staging->adding_template && staging->entities.size() >= 1024)) {
        failed = true;
        return 0;
    }
    for (double v : {x, y, z, vx, vy, vz, hp_current, hp_max})
        if (!std::isfinite(v) || std::abs(v) > 1000000) {
            failed = true;
            return 0;
        }
    for (double v : {sx, sy, sz})
        if (!std::isfinite(v) || v <= 0 || v > 1000000) {
            failed = true;
            return 0;
        }
    if (is_collider != 0 &&
        (!std::isfinite(collider_radius) || collider_radius <= 0 || collider_radius > 1000000)) {
        failed = true;
        return 0;
    }
    if (is_vehicle != 0 && !(vehicle_archetype >= 0 &&
                              vehicle_archetype < static_cast<double>(std::size(vehicle_tuning)) &&
                              vehicle_archetype == std::floor(vehicle_archetype))) {
        failed = true;
        return 0;
    }
    if (is_pedestrian != 0 &&
        !(pedestrian_archetype >= 0 &&
          pedestrian_archetype < static_cast<double>(std::size(pedestrian_tuning)) &&
          pedestrian_archetype == std::floor(pedestrian_archetype))) {
        failed = true;
        return 0;
    }
    auto &target = staging->adding_template ? staging->templates : staging->world;
    const auto e = target.create();
    target.set(
        e, engine::Box{engine::Vec3{static_cast<float>(x), static_cast<float>(y), static_cast<float>(z)},
                       engine::Vec3{static_cast<float>(sx), static_cast<float>(sy), static_cast<float>(sz)}});
    if (is_child == 0) {
        target.set(e, engine::physics::RigidBody{engine::Vec3{
                                  static_cast<float>(vx), static_cast<float>(vy), static_cast<float>(vz)}});
        if (is_player != 0) {
            target.set(e, PlayerMarker{});
            if (is_vehicle != 0)
                target.set(
                    e, Heading{0.0F, 0.0F, static_cast<float>(sx) / 2.0F, static_cast<float>(sz) / 2.0F,
                               static_cast<VehicleArchetype>(static_cast<int>(vehicle_archetype))});
        }
        if (is_collider != 0)
            target.set(
                e, engine::physics::Collider{
                       true,
                       collider_shape != 0 ? engine::physics::ColliderShape::Sphere
                                           : engine::physics::ColliderShape::Box,
                       static_cast<float>(collider_radius)});
        if (hp_max > 0)
            target.set(
                e, Health{std::clamp(static_cast<float>(hp_current), 0.0F, static_cast<float>(hp_max)),
                          static_cast<float>(hp_max)});
        if (is_ai != 0) {
            // Seeded from this entity's authoring order (never 0, xorshift32's
            // one fixed point) rather than wall-clock time, so two entities
            // never share a seed and the whole wander pattern is exactly
            // reproducible run to run — required for editor_bridge_tests.cpp
            // to assert on it at all.
            target.set(
                e, AIAgent{AIState::Idle, 0.0F, 0.0F, 1.0F,
                           static_cast<std::uint32_t>(staging->entities.size()) + 1, 0.0F, {}, 0.0F});
            if (is_pedestrian != 0)
                target.set(
                    e, Pedestrian{static_cast<PedestrianArchetype>(static_cast<int>(pedestrian_archetype))});
        }
    }
    if (staging->adding_template) {
        staging->template_by_name[*staging->adding_template] = e;
        staging->last_template = e;
        staging->adding_template.reset();
    } else {
        staging->entities.push_back(e);
    }
    return 1;
}
// Sets (or replaces) an entity's Lua script source between editor_begin() and
// editor_commit() — editor_add's own all-double signature has no way to carry
// a string, so a scripted entity's source is set through this companion call
// instead, keyed by the same index editor_add returns entities in (see its
// own doc comment). index must refer to an entity already added this staging
// session; out of range, or called outside editor_begin()/editor_commit(), is
// a silent no-op, the same defensive posture as editor_value's own
// out-of-range handling. Setting an entity's Script gives it a RigidBody
// (added unconditionally for every non-child entity, see editor_add's is_child
// handling) but nothing else — a scripted entity is otherwise ordinary
// authored data, not implicitly a Player or an AIAgent.
// Physics-body settings editor_add's fixed ABI has no room for, set after
// it for the same index. `authored` is whether the entity carries an
// authored RigidBody component at all: without one the body keeps mass 0
// (the engine's original "immovable to finite-mass bodies" contract, see
// physics::RigidBody). A non-dynamic authored body becomes kinematic.
// Ignored for an entity editor_add gave no RigidBody (a child).
EXPORT void editor_set_body(int index, int authored, double mass, int dynamic) {
    const auto target = staged(index);
    if (!target)
        return;
    auto *body = target->first->get<engine::physics::RigidBody>(target->second);
    if (!body || !authored)
        return;
    if (!std::isfinite(mass) || mass <= 0 || mass > 1000000) {
        failed = true;
        return;
    }
    body->mass = static_cast<float>(mass);
    body->type = dynamic ? engine::physics::BodyType::Dynamic : engine::physics::BodyType::Kinematic;
}
// Collider settings beyond editor_add's shape/radius: trigger, layer (0..31),
// mask (32-bit layer bitmask), bounciness (0..1). Ignored when the entity
// has no Collider.
EXPORT void editor_set_collider(int index, int is_trigger, double layer, double mask, double bounciness) {
    const auto target = staged(index);
    if (!target)
        return;
    auto *collider = target->first->get<engine::physics::Collider>(target->second);
    if (!collider)
        return;
    if (!(layer >= 0 && layer <= 31 && layer == std::floor(layer)) ||
        !(mask >= 0 && mask <= 4294967295.0 && mask == std::floor(mask)) ||
        !(bounciness >= 0 && bounciness <= 1)) {
        failed = true;
        return;
    }
    collider->is_trigger = is_trigger != 0;
    collider->layer = static_cast<std::uint8_t>(layer);
    collider->mask = static_cast<std::uint32_t>(mask);
    collider->bounciness = static_cast<float>(bounciness);
}
// The entity's authored Rotation (Euler XYZ radians), after editor_add for
// the same index. Only a Box-shaped Collider reads it: the collider becomes
// an oriented box (see physics::Collider::rotation).
EXPORT void editor_set_rotation(int index, double x, double y, double z) {
    const auto target = staged(index);
    if (!target)
        return;
    auto *collider = target->first->get<engine::physics::Collider>(target->second);
    if (!collider)
        return;
    for (const double v : {x, y, z})
        if (!std::isfinite(v) || std::abs(v) > 1000) {
            failed = true;
            return;
        }
    collider->rotation = {static_cast<float>(x), static_cast<float>(y), static_cast<float>(z)};
}
// Makes the entity a CharacterController (0.60.0), after editor_add for the
// same index. mode 0 = first person, 1 = third person. Resizes its Box to the
// controller's footprint and standing height, keeping its feet in place.
// Ignored for an entity without a RigidBody (a child).
EXPORT void editor_set_controller(int index, int mode, double walk, double sprint, double crouch, double jump,
                                  double stand, double crouched, double step, double accel, double air) {
    const auto target = staged(index);
    if (!target)
        return;
    auto &world = *target->first;
    auto *box = world.get<engine::Box>(target->second);
    if (!box || !world.get<engine::physics::RigidBody>(target->second))
        return;
    for (const double v : {walk, sprint, crouch, jump, stand, crouched, accel, air})
        if (!std::isfinite(v) || v <= 0 || v > 1000) {
            failed = true;
            return;
        }
    if (!std::isfinite(step) || step < 0 || step > 10 || crouched > stand) {
        failed = true;
        return;
    }
    Controller controller;
    controller.first_person = mode == 0;
    auto &settings = controller.settings;
    settings.walk_speed = static_cast<float>(walk);
    settings.sprint_speed = static_cast<float>(sprint);
    settings.crouch_speed = static_cast<float>(crouch);
    settings.jump_height = static_cast<float>(jump);
    settings.stand_height = static_cast<float>(stand);
    settings.crouch_height = static_cast<float>(crouched);
    settings.step_height = static_cast<float>(step);
    settings.ground_accel = static_cast<float>(accel);
    settings.ground_decel = static_cast<float>(accel) * 0.8F;
    settings.air_accel = static_cast<float>(air);
    engine::gameplay::configure_body(*box, settings);
    world.set(target->second, controller);
}
namespace {
// Standard base64 (RFC 4648) to bytes; returns false on malformed input.
bool decode_base64(const char *text, std::vector<unsigned char> &out) {
    out.clear();
    unsigned value = 0;
    int bits = 0;
    for (const char *c = text; *c; ++c) {
        int digit;
        if (*c >= 'A' && *c <= 'Z')
            digit = *c - 'A';
        else if (*c >= 'a' && *c <= 'z')
            digit = *c - 'a' + 26;
        else if (*c >= '0' && *c <= '9')
            digit = *c - '0' + 52;
        else if (*c == '+')
            digit = 62;
        else if (*c == '/')
            digit = 63;
        else if (*c == '=')
            break;
        else
            return false;
        value = (value << 6) | static_cast<unsigned>(digit);
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            out.push_back(static_cast<unsigned char>((value >> bits) & 0xFF));
        }
    }
    return true;
}
} // namespace
// The scene's terrain (0.63.0), between editor_begin() and editor_commit():
// a resolution x resolution heightfield over a `size` square centered on
// (x, z), heights relative to y, as base64 little-endian float32 (row-major,
// x fastest). Replaces any earlier terrain. Bad input fails the commit.
EXPORT void editor_set_terrain(double x, double y, double z, double size, int resolution, const char *heights) {
    if (!staging || !heights)
        return;
    std::vector<unsigned char> bytes;
    const auto count = static_cast<std::size_t>(resolution) * static_cast<std::size_t>(std::max(resolution, 0));
    if (resolution < 2 || resolution > 1025 || !std::isfinite(size) || size <= 0 || size > 100000 ||
        !std::isfinite(x) || !std::isfinite(y) || !std::isfinite(z) || !decode_base64(heights, bytes) ||
        bytes.size() != count * 4) {
        failed = true;
        return;
    }
    engine::physics::Heightfield field;
    field.center = {static_cast<float>(x), static_cast<float>(y), static_cast<float>(z)};
    field.size = static_cast<float>(size);
    field.resolution = resolution;
    field.heights.resize(count);
    std::memcpy(field.heights.data(), bytes.data(), bytes.size());
    for (const float h : field.heights)
        if (!std::isfinite(h) || std::abs(h) > 100000) {
            failed = true;
            return;
        }
    staging->terrain = std::move(field);
    staging->physics_config.terrain = &*staging->terrain;
}
// A static box obstacle (e.g. a scattered tree trunk) that isn't one of the
// editor's entities: it blocks movement, bullets, sight and paths.
EXPORT void editor_add_obstacle(double x, double y, double z, double sx, double sy, double sz) {
    if (!staging || staging->obstacle_count >= 4000)
        return;
    for (const double v : {x, y, z, sx, sy, sz})
        if (!std::isfinite(v) || std::abs(v) > 1000000)
            return;
    if (sx <= 0 || sy <= 0 || sz <= 0)
        return;
    const auto e = staging->world.create();
    staging->world.set(e, engine::Box{{static_cast<float>(x), static_cast<float>(y), static_cast<float>(z)},
                                      {static_cast<float>(sx), static_cast<float>(sy), static_cast<float>(sz)}});
    staging->world.set(e, engine::physics::Collider{});
    ++staging->obstacle_count;
}
// 1 when solid geometry (a Collider or the terrain/ground) lies between two
// points, else 0 -- the editor muffles sounds behind walls with it.
EXPORT int editor_line_blocked(double x1, double y1, double z1, double x2, double y2, double z2) {
    const engine::Vec3 from{static_cast<float>(x1), static_cast<float>(y1), static_cast<float>(z1)};
    const engine::Vec3 delta{static_cast<float>(x2 - x1), static_cast<float>(y2 - y1), static_cast<float>(z2 - z1)};
    const float length = std::sqrt(delta.x * delta.x + delta.y * delta.y + delta.z * delta.z);
    if (!(length > 0.3F) || !std::isfinite(length))
        return 0;
    engine::physics::QueryFilter filter;
    const auto hit = engine::physics::raycast(active->world, from, delta, length, active->physics_config, filter);
    return hit && hit->distance < length - 0.3F ? 1 : 0;
}
// The terrain's world height at (x, z), or NaN outside it (for tests and tools).
EXPORT double editor_terrain_height(double x, double z) {
    if (!active->terrain || !active->terrain->contains(static_cast<float>(x), static_cast<float>(z)))
        return std::nan("");
    return active->terrain->height_at(static_cast<float>(x), static_cast<float>(z));
}
// Makes the entity a combat soldier (0.62.0), after editor_add for the same
// index: team (0 = the Player's), behavior (0 patrol, 1 guard, 2 hunt), sight
// range, field of view in degrees, hearing range, reaction time, accuracy
// 0..1, preferred fighting range, move speed, burst length, burst pause,
// use_cover, flee_health 0..1 (0 = never) and melee damage. It moves through
// a CharacterController sized to its own Box, and replaces any AIState
// wander/chase behavior.
EXPORT void editor_set_soldier(int index, double team, double behavior, double sight, double fov, double hearing,
                               double reaction, double accuracy, double preferred, double speed, double burst,
                               double burst_pause, int use_cover, double flee_health, double melee) {
    const auto target = staged(index);
    if (!target)
        return;
    auto &world = *target->first;
    auto *box = world.get<engine::Box>(target->second);
    if (!box || !world.get<engine::physics::RigidBody>(target->second))
        return;
    const bool valid = team >= 0 && team <= 15 && team == std::floor(team) && (behavior == 0 || behavior == 1 ||
                                                                                 behavior == 2) &&
                       sight > 0 && sight <= 1000 && fov > 0 && fov <= 360 && hearing >= 0 && hearing <= 1000 &&
                       reaction >= 0 && reaction <= 10 && accuracy >= 0 && accuracy <= 1 && preferred > 0 &&
                       preferred <= 500 && speed > 0 && speed <= 100 && burst >= 1 && burst <= 100 &&
                       burst == std::floor(burst) && burst_pause >= 0 && burst_pause <= 10 && flee_health >= 0 &&
                       flee_health <= 1 && melee >= 0 && melee <= 100000;
    if (!valid) {
        failed = true;
        return;
    }
    Soldier soldier;
    soldier.team = static_cast<int>(team);
    soldier.behavior = static_cast<SoldierBehavior>(static_cast<int>(behavior));
    soldier.sight_range = static_cast<float>(sight);
    soldier.fov_cos = static_cast<float>(std::cos(std::min(fov, 359.0) * 3.14159265358979 / 360.0));
    soldier.hearing = static_cast<float>(hearing);
    soldier.reaction = static_cast<float>(reaction);
    soldier.accuracy = static_cast<float>(accuracy);
    soldier.preferred_range = static_cast<float>(preferred);
    soldier.move_speed = static_cast<float>(speed);
    soldier.burst = static_cast<int>(burst);
    soldier.burst_pause = static_cast<float>(burst_pause);
    soldier.use_cover = use_cover != 0;
    soldier.flee_health = static_cast<float>(flee_health);
    soldier.melee_damage = static_cast<float>(melee);
    world.set(target->second, soldier);
    Controller controller;
    controller.first_person = false;
    controller.settings.walk_speed = controller.settings.sprint_speed = static_cast<float>(speed);
    controller.settings.stand_height = controller.settings.crouch_height = box->size.y;
    controller.settings.radius = std::max(box->size.x, box->size.z) / 2;
    controller.settings.step_height = 0.35F;
    controller.settings.ground_accel = 30.0F;
    controller.settings.ground_decel = 30.0F;
    world.set(target->second, controller);
    if (world.get<AIAgent>(target->second))
        world.remove<AIAgent>(target->second);
}
// Waypoint entity Names (comma-separated) a patrolling soldier walks in order.
EXPORT void editor_set_soldier_patrol(int index, const char *names) {
    const auto target = staged(index);
    if (!target || !names)
        return;
    auto *soldier = target->first->get<Soldier>(target->second);
    if (!soldier)
        return;
    soldier->patrol_names.clear();
    std::string all(names);
    std::size_t start = 0;
    while (start <= all.size()) {
        auto end = all.find(',', start);
        if (end == std::string::npos)
            end = all.size();
        auto name = editor_bindings::trim(std::string_view(all).substr(start, end - start));
        if (!name.empty())
            soldier->patrol_names.push_back(std::move(name));
        start = end + 1;
    }
}
// Arcade car (0.70.0): makes the staged entity an engine::gameplay car
// facing `yaw` (radians; it faces (sin, 0, cos)) with these handling numbers
// (see CarSpec), adding its Heading (footprint from its Box) if needed.
// Non-finite or non-positive numbers fail the commit.
EXPORT void editor_set_car(int index, double yaw, double top_speed, double acceleration, double braking, double grip,
                           double drift_grip, double steering, double nitro_boost, double nitro_seconds, double gears) {
    const auto target = staged(index);
    if (!target)
        return;
    for (const double v : {top_speed, acceleration, braking, grip, drift_grip, steering, nitro_seconds, gears})
        if (!(std::isfinite(v) && v > 0)) {
            failed = true;
            return;
        }
    if (!std::isfinite(yaw) || !(std::isfinite(nitro_boost) && nitro_boost >= 0)) {
        failed = true;
        return;
    }
    auto &world = *target->first;
    const auto e = target->second;
    if (!world.get<Heading>(e)) {
        const auto &box = *world.get<engine::Box>(e);
        world.set(e, Heading{0.0F, 0.0F, box.size.x / 2.0F, box.size.z / 2.0F});
    }
    auto &heading = *world.get<Heading>(e);
    heading.arcade = true;
    heading.spec.top_speed = static_cast<float>(top_speed);
    heading.spec.acceleration = static_cast<float>(acceleration);
    heading.spec.braking = static_cast<float>(braking);
    heading.spec.grip = static_cast<float>(grip);
    heading.spec.drift_grip = std::min(1.0F, static_cast<float>(drift_grip));
    heading.spec.steering = static_cast<float>(steering);
    heading.spec.nitro_boost = static_cast<float>(nitro_boost);
    heading.spec.nitro_seconds = static_cast<float>(nitro_seconds);
    heading.spec.gears = std::clamp(static_cast<int>(gears), 1, 9);
    heading.car = {};
    heading.car.yaw = heading.yaw = static_cast<float>(yaw);
}
// An AI driver on the staged arcade car (0.70.0): mode 0 off, 1 race, 2
// pursuit, 3 traffic; loop repeats the route; skill/aggression 0..1.
EXPORT void editor_set_driver(int index, int mode, int loop, double skill, double aggression, double speed_scale) {
    const auto target = staged(index);
    if (!target)
        return;
    if (mode < 0 || mode > 3 || !std::isfinite(skill) || !std::isfinite(aggression) ||
        !(std::isfinite(speed_scale) && speed_scale > 0)) {
        failed = true;
        return;
    }
    Driver driver;
    if (const auto *existing = target->first->get<Driver>(target->second))
        driver = *existing;
    driver.mode = static_cast<DriveMode>(mode);
    driver.loop = loop != 0;
    driver.skill = std::clamp(static_cast<float>(skill), 0.0F, 1.0F);
    driver.aggression = std::clamp(static_cast<float>(aggression), 0.0F, 1.0F);
    driver.speed_scale = static_cast<float>(speed_scale);
    target->first->set(target->second, driver);
}
// Driver text: field 0 = route ("x,z x,z ..."), 1 = pursuit target name.
EXPORT void editor_set_driver_text(int index, int field, const char *text) {
    const auto target = staged(index);
    if (!target || !text)
        return;
    auto *driver = target->first->get<Driver>(target->second);
    if (!driver)
        return;
    if (field == 0) {
        driver->route = parse_route(text);
        const auto &box = *target->first->get<engine::Box>(target->second);
        const auto *heading = target->first->get<Heading>(target->second);
        driver->next = route_start(driver->route, box.center, heading ? heading->yaw : 0.0F);
    } else if (field == 1) {
        driver->target_name = text;
    }
}
// Arcade car state for the editor (0.70.0): 0 speed, 1 forward speed, 2 gear
// (-1 reverse), 3 rpm 0..1, 4 nitro 0..1, 5 drifting, 6 boosting, 7 slip
// (radians), 8 front wheel angle, 9 handbrake input, 10 brake input, 11 is
// an arcade car, 12 yaw rate, 13 throttle input, 14 driver mode (-1 none, 0
// off, 1 race, 2 pursuit, 3 traffic). 0 without one.
EXPORT double editor_vehicle_value(int index, int field) {
    if (index < 0 || static_cast<std::size_t>(index) >= active->entities.size())
        return 0;
    const auto entity = active->entities[static_cast<std::size_t>(index)];
    if (!active->world.alive(entity))
        return 0;
    const auto *heading = active->world.get<Heading>(entity);
    if (!heading || !heading->arcade)
        return 0;
    const auto &car = heading->car;
    switch (field) {
    case 0: return std::hypot(car.velocity.x, car.velocity.z);
    case 1: return car.forward_speed;
    case 2: return car.gear;
    case 3: return car.rpm;
    case 4: return car.nitro;
    case 5: return car.drifting ? 1 : 0;
    case 6: return car.boosting ? 1 : 0;
    case 7: return car.slip;
    case 8: return car.steer;
    case 9: return heading->input.handbrake ? 1 : 0;
    case 10: return heading->input.brake;
    case 11: return 1;
    case 12: return car.yaw_rate;
    case 13: return heading->input.throttle;
    case 14: {
        const auto *driver = active->world.get<Driver>(entity);
        return driver ? static_cast<double>(static_cast<int>(driver->mode)) : -1;
    }
    default: return 0;
    }
}
// Soldier state for the editor: field 0 = mode (0 patrol, 1 investigate, 2
// combat, 3 search, 4 cover, 5 flee), 1 = facing yaw (radians; the facing is
// (sin, 0, cos)), 2 = awareness 0..1, 3 = team. -1 without a soldier.
EXPORT double editor_soldier_value(int index, int field) {
    if (index < 0 || static_cast<std::size_t>(index) >= active->entities.size())
        return -1;
    const auto entity = active->entities[static_cast<std::size_t>(index)];
    const auto *soldier = active->world.alive(entity) ? active->world.get<Soldier>(entity) : nullptr;
    if (!soldier)
        return -1;
    switch (field) {
    case 0:
        return static_cast<int>(soldier->mode);
    case 1:
        return soldier->yaw;
    case 2:
        return soldier->awareness;
    case 3:
        return soldier->team;
    default:
        return -1;
    }
}
// Gives the entity Weapons (0.61.0) from loadout text (see
// engine::gameplay::parse_weapons), after editor_add for the same index.
// Invalid text falls back to the default loadout and editor_weapons_error()
// says why.
EXPORT void editor_set_weapons(int index, const char *text) {
    const auto target = staged(index);
    if (!target || !text)
        return;
    auto parsed = engine::gameplay::parse_weapons(text);
    if (!parsed.error.empty()) {
        staging->weapons_error = parsed.error;
        parsed = engine::gameplay::parse_weapons(engine::gameplay::default_weapons_text);
    }
    Arsenal arsenal;
    arsenal.weapons = std::move(parsed.weapons);
    arsenal.state = engine::gameplay::make_weapon_state(arsenal.weapons);
    arsenal.state.rng = 0x9E3779B9U + static_cast<std::uint32_t>(index + 2) * 2654435761U;
    target->first->set(target->second, arsenal);
}
EXPORT const char *editor_weapons_error() { return active->weapons_error.c_str(); }
// Weapon HUD state: field 0 = current slot, 1 = rounds loaded, 2 = reserve
// (-1 unlimited), 3 = reload progress 0..1 (-1 when not reloading), 4 =
// current spread in degrees, 5 = weapon count, 6 = equip progress 0..1 (-1
// when ready), 7 = aiming, 8 = magazine size, 9 = aim zoom. 0 (and -1 for
// 3/6) without Weapons.
EXPORT double editor_weapon_value(int index, int field) {
    const bool progress_field = field == 3 || field == 6;
    if (index < 0 || static_cast<std::size_t>(index) >= active->entities.size())
        return progress_field ? -1 : 0;
    const auto entity = active->entities[static_cast<std::size_t>(index)];
    const auto *arsenal = active->world.alive(entity) ? active->world.get<Arsenal>(entity) : nullptr;
    if (!arsenal || arsenal->weapons.empty())
        return progress_field ? -1 : 0;
    const auto &state = arsenal->state;
    const auto slot = static_cast<std::size_t>(state.current);
    const auto &weapon = arsenal->weapons[slot];
    switch (field) {
    case 0:
        return static_cast<double>(slot);
    case 1:
        return state.magazine[slot];
    case 2:
        return state.reserve[slot];
    case 3:
        return state.reload_left > 0 ? 1.0 - state.reload_left / weapon.reload_time : -1;
    case 4: {
        const auto *controller = active->world.get<Controller>(entity);
        const float ratio = controller ? controller->state.speed / controller->settings.walk_speed : 0.0F;
        const bool airborne = controller && !controller->state.grounded;
        return engine::gameplay::current_spread(weapon, arsenal->aiming, ratio, airborne, state.bloom);
    }
    case 5:
        return static_cast<double>(arsenal->weapons.size());
    case 6:
        return state.equip_left > 0 && weapon.equip_time > 0 ? 1.0 - state.equip_left / weapon.equip_time : -1;
    case 7:
        return arsenal->aiming ? 1 : 0;
    case 8:
        return weapon.magazine;
    case 9:
        return weapon.zoom;
    default:
        return 0;
    }
}
// A weapon's name (field 0) or first-person model (field 1).
EXPORT const char *editor_weapon_text(int index, int slot, int field) {
    static std::string result;
    result.clear();
    if (index >= 0 && static_cast<std::size_t>(index) < active->entities.size()) {
        const auto entity = active->entities[static_cast<std::size_t>(index)];
        const auto *arsenal = active->world.alive(entity) ? active->world.get<Arsenal>(entity) : nullptr;
        if (arsenal && slot >= 0 && static_cast<std::size_t>(slot) < arsenal->weapons.size())
            result = field == 0 ? arsenal->weapons[static_cast<std::size_t>(slot)].name
                                : arsenal->weapons[static_cast<std::size_t>(slot)].model;
    }
    return result.c_str();
}
// Moves the combat event queue into a read buffer; returns its size.
std::vector<WeaponEvent> pending_weapon_events;
EXPORT int editor_take_weapon_events() {
    pending_weapon_events = std::move(active->weapon_events);
    active->weapon_events.clear();
    return static_cast<int>(pending_weapon_events.size());
}
// field 0 = kind (0 fire, 1 impact, 2 reload, 3 reloaded, 4 empty, 5
// switched, 6 explode, 7 damaged), 1 = shooter index, 2 = target index (-1
// none), 3-5 = point (fire: muzzle origin; damaged: attacker position), 6-8 =
// normal (fire: direction), 9 = value (fire: recoil degrees; reload: seconds;
// explode: radius; damaged: amount), 10 = flags (fire/switch/reload: slot;
// impact/damaged: 1 headshot, 2 killed, 4 flesh).
EXPORT double editor_weapon_event(int index, int field) {
    if (index < 0 || static_cast<std::size_t>(index) >= pending_weapon_events.size())
        return 0;
    const auto &e = pending_weapon_events[static_cast<std::size_t>(index)];
    switch (field) {
    case 0:
        return static_cast<int>(e.kind);
    case 1:
        return e.shooter;
    case 2:
        return e.target;
    case 3:
        return e.point.x;
    case 4:
        return e.point.y;
    case 5:
        return e.point.z;
    case 6:
        return e.normal.x;
    case 7:
        return e.normal.y;
    case 8:
        return e.normal.z;
    case 9:
        return e.value;
    case 10:
        return e.flags;
    default:
        return 0;
    }
}
EXPORT void editor_set_script_source(int index, const char *source) {
    const auto target = staged(index);
    if (!target)
        return;
    target->first->set(target->second, engine::script::Script{source != nullptr ? source : ""});
}
// Script props, after editor_set_script_source for the same index: one prop
// per line, "name\tkind\tvalue" with kind n (number), b (boolean, value
// 1/0) or s (string, the rest of the line). Malformed lines are skipped.
EXPORT void editor_set_script_props(int index, const char *text) {
    const auto target = staged(index);
    if (!target || !text)
        return;
    auto *script = target->first->get<engine::script::Script>(target->second);
    if (!script)
        return;
    script->props.clear();
    std::string all(text);
    std::size_t start = 0;
    while (start <= all.size()) {
        auto end = all.find('\n', start);
        if (end == std::string::npos)
            end = all.size();
        const std::string line = all.substr(start, end - start);
        start = end + 1;
        const auto t1 = line.find('\t');
        const auto t2 = t1 == std::string::npos ? std::string::npos : line.find('\t', t1 + 1);
        if (t2 == std::string::npos || t1 == 0)
            continue;
        engine::script::Script::Prop prop;
        prop.name = line.substr(0, t1);
        const std::string kind = line.substr(t1 + 1, t2 - t1 - 1);
        const std::string value = line.substr(t2 + 1);
        if (kind == "n") {
            char *parsed_end = nullptr;
            const double number = std::strtod(value.c_str(), &parsed_end);
            if (parsed_end == value.c_str() || !std::isfinite(number))
                continue;
            prop.kind = engine::script::Script::Prop::Kind::number;
            prop.number = number;
        } else if (kind == "b") {
            prop.kind = engine::script::Script::Prop::Kind::boolean;
            prop.boolean = value == "1";
        } else if (kind == "s") {
            prop.kind = engine::script::Script::Prop::Kind::text;
            prop.text = value;
        } else {
            continue;
        }
        script->props.push_back(std::move(prop));
    }
}
// The entity's authored Name (index -1: the template just added).
EXPORT void editor_set_name(int index, const char *name) {
    const auto target = staged(index);
    if (target && name)
        target->first->set(target->second, EntityName{name});
}
// Makes the next editor_add a prefab template called `name` (see
// Runtime::templates) instead of a scene entity.
EXPORT void editor_template_begin(const char *name) {
    if (staging && name)
        staging->adding_template = std::string(name);
}
// ---- Spaceflight (0.71.0) staging: the SpaceSystem component sends the
// star and site (editor_space_begin) and then each body (editor_space_body);
// the Spaceship component marks the flown entity (editor_set_spaceship).
// Degrees for angles. Bad numbers fail the commit.
EXPORT void editor_space_begin(double star_gm, int site_body, double site_latitude, double site_longitude,
                               double site_radius, double eva_range, double start_time) {
    if (!staging)
        return;
    for (const double v : {star_gm, site_latitude, site_longitude, site_radius, eva_range, start_time})
        if (!std::isfinite(v)) {
            failed = true;
            return;
        }
    if (!(star_gm > 0) || !(eva_range >= 50) || eva_range > 20000 || site_radius < 0) {
        failed = true;
        return;
    }
    SpaceSim sim;
    sim.system.star_gm = star_gm;
    sim.site_body = site_body;
    sim.eva_range = eva_range;
    sim.time = start_time;
    const double lat = site_latitude * 3.14159265358979 / 180, lon = site_longitude * 3.14159265358979 / 180;
    const space::DVec3 dir{std::cos(lat) * std::cos(lon), std::sin(lat), std::cos(lat) * std::sin(lon)};
    sim.axis_y = space::normalized(dir);
    sim.site_origin = sim.axis_y * site_radius; // radius of the flat; resolved at commit
    staging->space = std::move(sim);
}
EXPORT void editor_space_body(const char *name, int parent, double orbit_radius, double period, double phase,
                              double inclination, double radius, double gravity, double atmosphere_height,
                              double atmosphere_density, double terrain_amplitude, double terrain_scale, double seed) {
    if (!staging || !staging->space || !name)
        return;
    for (const double v : {orbit_radius, period, phase, inclination, radius, gravity, atmosphere_height,
                           atmosphere_density, terrain_amplitude, terrain_scale, seed})
        if (!std::isfinite(v)) {
            failed = true;
            return;
        }
    auto &bodies = staging->space->system.bodies;
    if (bodies.size() >= 32 || !(radius > 0) || !(gravity > 0) || !(period > 0) || orbit_radius < 0 ||
        parent >= static_cast<int>(bodies.size()) || parent < -1 || atmosphere_height < 0 || atmosphere_density < 0 ||
        terrain_amplitude < 0 || !(terrain_scale > 0)) {
        failed = true;
        return;
    }
    space::Body body;
    body.name = name;
    body.parent = parent;
    body.orbit_radius = orbit_radius;
    body.period = period;
    body.phase = phase * 3.14159265358979 / 180;
    body.inclination = inclination * 3.14159265358979 / 180;
    body.radius = radius;
    body.surface_gravity = gravity;
    body.atmosphere_height = atmosphere_height;
    body.atmosphere_density = atmosphere_density;
    body.terrain_amplitude = terrain_amplitude;
    body.terrain_scale = terrain_scale;
    body.seed = static_cast<std::uint32_t>(std::max(0.0, seed));
    bodies.push_back(std::move(body));
}
// Ship tuning; `start_orbit` >= 0 starts in a circular orbit that high above
// the site body instead of landed where the entity is authored. `heading` is
// the entity's yaw (radians).
EXPORT void editor_set_spaceship(int index, double heading, double mass, double thrust, double lift_thrust, double rcs,
                                 double max_rate, double fuel, double burn, double hull, double gear_clearance,
                                 int start_piloting, double start_orbit) {
    const auto target = staged(index);
    if (!target || !staging || !staging->space || staging->adding_template)
        return;
    for (const double v : {heading, mass, thrust, lift_thrust, rcs, max_rate, fuel, burn, hull, gear_clearance,
                           start_orbit})
        if (!std::isfinite(v)) {
            failed = true;
            return;
        }
    if (!(mass > 0) || thrust < 0 || lift_thrust < 0 || !(rcs > 0) || !(max_rate > 0) || fuel < 0 || burn < 0 ||
        !(hull > 0) || gear_clearance < 0) {
        failed = true;
        return;
    }
    auto &sim = *staging->space;
    sim.spec.mass = mass;
    sim.spec.thrust = thrust;
    sim.spec.lift_thrust = lift_thrust;
    sim.spec.rcs = rcs;
    sim.spec.max_rate = max_rate;
    sim.spec.fuel = fuel;
    sim.spec.burn = burn;
    sim.spec.hull = hull;
    sim.spec.gear_clearance = gear_clearance;
    sim.ship.fuel = fuel;
    sim.ship.hull = hull;
    sim.ship_entity = target->second;
    sim.piloting = start_piloting != 0;
    // Resolved at commit, once the site frame exists.
    sim.ship.heat = 0;
    sim.ship.position = {heading, start_orbit, 0};
    target->first->set(target->second, Spaceship{});
}
namespace {
// Builds the site frame, the walkable heightfield and the ship's starting
// state once every staged piece is in.
bool finish_space(Runtime &rt) {
    auto &sim = *rt.space;
    if (sim.site_body < 0 || sim.site_body >= static_cast<int>(sim.system.bodies.size()))
        return false;
    auto &site = sim.system.bodies[static_cast<std::size_t>(sim.site_body)];
    const double flat_radius = space::length(sim.site_origin);
    if (flat_radius > 0)
        site.flats.push_back({sim.axis_y, flat_radius});
    const space::DVec3 up = sim.axis_y;
    const space::DVec3 helper = std::abs(up.y) < 0.99 ? space::DVec3{0, 1, 0} : space::DVec3{1, 0, 0};
    sim.axis_x = space::normalized(space::cross(helper, up));
    sim.axis_z = space::cross(sim.axis_x, up);
    sim.site_origin = up * space::surface_radius(site, up);
    // The walkable ground: the body's surface in site coordinates, curvature included.
    const double size = sim.eva_range * 2;
    const int resolution = std::clamp(static_cast<int>(size / 8.0) + 1, 65, 513);
    engine::physics::Heightfield field;
    field.center = {0, 0, 0};
    field.size = static_cast<float>(size);
    field.resolution = resolution;
    field.heights.resize(static_cast<std::size_t>(resolution) * static_cast<std::size_t>(resolution));
    float lowest = 0;
    for (int row = 0; row < resolution; ++row)
        for (int col = 0; col < resolution; ++col) {
            const double x = -size / 2 + size * col / (resolution - 1), z = -size / 2 + size * row / (resolution - 1);
            const auto p = space::normalized(sim.site_origin + sim.axis_x * x + sim.axis_z * z);
            const auto surface = p * space::surface_radius(site, p);
            const auto h = static_cast<float>(space::dot(surface - sim.site_origin, up));
            field.heights[static_cast<std::size_t>(row) * static_cast<std::size_t>(resolution) +
                          static_cast<std::size_t>(col)] = h;
            lowest = std::min(lowest, h);
        }
    rt.terrain = std::move(field);
    rt.physics_config.terrain = &*rt.terrain;
    rt.physics_config.ground_y = lowest - 500.0F;
    // The ship: landed where it was authored, or in orbit.
    if (sim.ship_entity && rt.world.alive(*sim.ship_entity)) {
        // The space simulation moves the ship; physics only sees its collider.
        rt.world.remove<engine::physics::RigidBody>(*sim.ship_entity);
        const double heading = sim.ship.position.x, orbit = sim.ship.position.y;
        if (orbit >= 0) {
            space::place_in_orbit(sim.ship, sim.system, sim.site_body, orbit);
        } else {
            const auto c = rt.world.get<engine::Box>(*sim.ship_entity)->center;
            const auto p = sim.site_origin + sim.axis_x * c.x + sim.axis_y * c.y + sim.axis_z * c.z;
            const auto forward = sim.axis_x * std::sin(heading) + sim.axis_z * std::cos(heading);
            space::place_landed(sim.ship, sim.spec, sim.system, sim.site_body, p, forward);
        }
        const auto local = sim.to_local(sim.ship_absolute());
        rt.world.get<engine::Box>(*sim.ship_entity)->center = {static_cast<float>(local.x), static_cast<float>(local.y),
                                                               static_cast<float>(local.z)};
        rt.settle_landed(rt.world);
        if (sim.piloting) {
            if (rt.player_entity(rt.world)) {
                rt.stow_player(rt.world);
                rt.place_stowed(rt.world);
            } else {
                sim.piloting = true; // nobody to walk: always flying
            }
        }
    } else {
        sim.ship_entity.reset();
        sim.piloting = false;
    }
    return true;
}
} // namespace
EXPORT int editor_commit() {
    if (!staging || failed) {
        staging.reset();
        return 0;
    }
    if (staging->space && !finish_space(*staging)) {
        staging.reset();
        return 0;
    }
    active.swap(staging);
    staging.reset();
    return 1;
}
// Spaceflight readouts for the editor (0.71.0). editor_space_value fields:
// 0 piloting, 1-3 ship site-frame position, 4-7 ship attitude quaternion in
// the site frame (x, y, z, w), 8 altitude, 9 speed relative to the
// reference body, 10 vertical speed, 11 ground speed, 12 throttle, 13 fuel
// 0..1, 14 hull 0..1, 15 heat, 16 air density, 17 warp, 18 assist (0
// manual, 1 stabilized, 2 prograde, 3 retrograde, 4 target), 19 landed, 20
// periapsis, 21 apoapsis, 22 orbit closed, 23 reference body (-1 star), 24
// g-force, 25 engine on, 26 belly thrust input, 27 system time, 28
// destroyed, 29 target body, 30 distance to the target's surface, 31
// distance to the site origin, 32 orbital period, 33 eccentricity, 34
// reference body radius, 35 has a SpaceSystem, 36 body count. 0 without.
EXPORT double editor_space_value(int field) {
    if (!active->space)
        return 0;
    const auto &sp = *active->space;
    const auto local = sp.to_local(sp.ship_absolute());
    const auto frame = space::conjugate(space::from_axes(sp.axis_x, sp.axis_y, sp.axis_z));
    const auto attitude = space::normalized(frame * sp.ship.attitude);
    const auto orbit = space::orbit_elements(sp.ship, sp.system);
    const auto finite = [](double v) { return std::isfinite(v) ? v : 1e12; };
    switch (field) {
    case 0: return sp.piloting ? 1 : 0;
    case 1: return local.x;
    case 2: return local.y;
    case 3: return local.z;
    case 4: return attitude.x;
    case 5: return attitude.y;
    case 6: return attitude.z;
    case 7: return attitude.w;
    case 8: return finite(sp.ship.altitude);
    case 9: return space::length(sp.ship.velocity);
    case 10: return sp.ship.vertical_speed;
    case 11: return sp.ship.ground_speed;
    case 12: return sp.ship.throttle;
    case 13: return sp.spec.fuel > 0 ? sp.ship.fuel / sp.spec.fuel : 0;
    case 14: return sp.ship.hull / sp.spec.hull;
    case 15: return sp.ship.heat;
    case 16: return sp.ship.density;
    case 17: return sp.warp;
    case 18: return static_cast<int>(sp.assist);
    case 19: return sp.ship.landed ? 1 : 0;
    case 20: return orbit.valid ? finite(orbit.periapsis) : 0;
    case 21: return orbit.valid ? finite(orbit.apoapsis) : 0;
    case 22: return orbit.valid && orbit.closed ? 1 : 0;
    case 23: return sp.ship.ref;
    case 24: return sp.ship.g_force;
    case 25: return sp.ship.engine_on ? 1 : 0;
    case 26: return sp.vertical_applied;
    case 27: return sp.time;
    case 28: return sp.ship.destroyed ? 1 : 0;
    case 29: return sp.target;
    case 30:
        return sp.target >= 0 ? space::length(space::body_position(sp.system, sp.target, sp.time) - sp.ship_absolute()) -
                                    sp.system.bodies[static_cast<std::size_t>(sp.target)].radius
                              : 0;
    case 31: return space::length(local);
    case 32: return orbit.valid ? orbit.period : 0;
    case 33: return orbit.valid ? orbit.eccentricity : 0;
    case 34: return sp.ship.ref >= 0 ? sp.system.bodies[static_cast<std::size_t>(sp.ship.ref)].radius : 0;
    case 35: return 1;
    case 36: return static_cast<double>(sp.system.bodies.size());
    default: return 0;
    }
}
// Body `index` (-1 the star): 0-2 its centre in the site frame, 3 radius, 4
// atmosphere top, 5 surface air density, 6 surface gravity, 7 atmosphere
// height, 8 parent, 9 terrain amplitude.
EXPORT double editor_space_body_value(int index, int field) {
    if (!active->space || index < -1 || index >= static_cast<int>(active->space->system.bodies.size()))
        return 0;
    const auto &sp = *active->space;
    const auto centre = sp.to_local(space::body_position(sp.system, index, sp.time));
    if (field <= 2)
        return field == 0 ? centre.x : field == 1 ? centre.y : centre.z;
    if (index < 0)
        return 0;
    const auto &b = sp.system.bodies[static_cast<std::size_t>(index)];
    switch (field) {
    case 3: return b.radius;
    case 4: return b.atmosphere_top();
    case 5: return b.atmosphere_density;
    case 6: return b.surface_gravity;
    case 7: return b.atmosphere_height;
    case 8: return b.parent;
    case 9: return b.terrain_amplitude;
    default: return 0;
    }
}
// The rotation from body frames to the site frame, as a quaternion (field
// 0-3: x, y, z, w). Planets are meshed in their own frame and turned by it.
EXPORT double editor_space_frame(int field) {
    if (!active->space)
        return field == 3 ? 1 : 0;
    const auto &sp = *active->space;
    const auto q = space::conjugate(space::from_axes(sp.axis_x, sp.axis_y, sp.axis_z));
    return field == 0 ? q.x : field == 1 ? q.y : field == 2 ? q.z : q.w;
}
// A body's terrain height (m above its radius) under a direction from its
// centre, in the body's frame: what the editor meshes planets from.
EXPORT double editor_planet_height(int index, double x, double y, double z) {
    if (!active->space || index < 0 || index >= static_cast<int>(active->space->system.bodies.size()))
        return 0;
    return space::surface_height(active->space->system.bodies[static_cast<std::size_t>(index)], {x, y, z});
}
// The walkable ground's site-frame height at x, z (the heightfield the
// SpaceSystem built around the site).
EXPORT double editor_space_ground(double x, double z) {
    if (!active->space)
        return 0;
    return active->site_ground(static_cast<float>(x), static_cast<float>(z));
}
// Predicts the ship's coasting path (see space::predict_path) over
// `horizon` seconds (0: one orbital period, capped); returns the point count.
EXPORT int editor_space_path(int count, double horizon) {
    if (!active->space)
        return 0;
    auto &sp = *active->space;
    if (!(horizon > 0)) {
        const auto orbit = space::orbit_elements(sp.ship, sp.system);
        horizon = orbit.valid && orbit.closed ? std::min(orbit.period, 40000.0) : 3000.0;
    }
    sp.path = sp.ship.landed ? std::vector<space::DVec3>{} : space::predict_path(sp.ship, sp.system, horizon, std::clamp(count, 2, 512));
    return static_cast<int>(sp.path.size());
}
// Point i of the last predicted path, relative to the reference body's
// centre in the body frame (axis 0-2).
EXPORT double editor_space_path_value(int i, int axis) {
    if (!active->space || i < 0 || static_cast<std::size_t>(i) >= active->space->path.size())
        return 0;
    const auto p = active->space->path[static_cast<std::size_t>(i)];
    return axis == 0 ? p.x : axis == 1 ? p.y : p.z;
}
EXPORT void editor_tick() {
    active->systems.run(active->world,
                        {active->ticks++, std::chrono::nanoseconds{16'666'667}, active->input});
}
// Call once per rendered JS frame, before draining any editor_key() calls that
// frame — mirrors the native platform's own input.begin_frame()-then-apply-events
// loop (source/engine/runtime/application.cpp), so key_pressed()/key_released()
// read as single-frame edges instead of staying latched forever. A frame may
// cover more than one editor_tick() (the JS accumulator can run up to 5), and
// all of them share this same begin_frame() call, exactly like the native loop
// sharing one InputState across a batch of fixed steps.
EXPORT void editor_input_begin_frame() { active->input.begin_frame(); }
// Sets the horizontal camera-forward direction on-foot movement is relative to (see
// camera_forward_x/z's own doc comment on Runtime) — call once per rendered frame with the
// live camera's current facing, before that frame's editor_tick() calls, so this frame's
// movement already reflects wherever the camera is pointed right now. x/z need not be
// pre-normalized (this normalizes them); a near-zero vector — camera looking straight down,
// the one direction with no meaningful horizontal facing — is ignored, leaving the previous
// direction in place rather than dividing by ~0.
EXPORT void editor_set_camera_forward(double x, double z) {
    const auto length = std::sqrt(x * x + z * z);
    if (length > 0.0001) {
        active->camera_forward_x = static_cast<float>(x / length);
        active->camera_forward_z = static_cast<float>(z / length);
    }
}
// The first-person look direction (radians), once per rendered frame before
// that frame's ticks. Pitch is clamped to just short of straight up/down.
EXPORT void editor_set_look(double yaw, double pitch) {
    if (!std::isfinite(yaw) || !std::isfinite(pitch))
        return;
    active->look_yaw = static_cast<float>(std::remainder(yaw, 2 * 3.14159265358979));
    active->look_pitch = static_cast<float>(std::clamp(pitch, -1.55, 1.55));
}
// CharacterController state for the editor's camera and HUD. field 0 = eye
// height above the feet, 1 = crouched, 2 = grounded, 3 = landing speed this
// tick, 4 = horizontal speed, 5 = sprinting, 6 = feet (box bottom) world y.
// 0 without a controller.
EXPORT double editor_controller_value(int index, int field) {
    if (index < 0 || static_cast<std::size_t>(index) >= active->entities.size())
        return 0;
    const auto entity = active->entities[static_cast<std::size_t>(index)];
    if (!active->world.alive(entity))
        return 0;
    const auto *controller = active->world.get<Controller>(entity);
    const auto *box = active->world.get<engine::Box>(entity);
    if (!controller || !box)
        return 0;
    const auto &state = controller->state;
    switch (field) {
    case 0:
        return engine::gameplay::eye_offset(*box);
    case 1:
        return state.crouched ? 1 : 0;
    case 2:
        return state.grounded ? 1 : 0;
    case 3:
        return state.landing_speed;
    case 4:
        return state.speed;
    case 5:
        return state.sprinting ? 1 : 0;
    case 6:
        return box->center.y - box->size.y / 2;
    default:
        return 0;
    }
}
// code is one of the small set key_for() understands
// (0=W,1=A,2=S,3=D,4=Shift,5=F/attack,6=G/blast,7=C/crouch-sit); anything
// else maps to Key::unknown and is silently inert. down is nonzero for a
// keydown, zero for a keyup.
EXPORT void editor_key(int code, int down) {
    // F/G set their own pending_attack/pending_blast edge here, independent of
    // InputState's own per-*frame* key_pressed() (see Runtime::pending_attack's
    // doc comment for why) — a keydown always marks the edge, even if this
    // exact key was somehow already down (defensive; the JS side's own
    // event.repeat guard means that shouldn't happen in practice).
    if (down) {
        if (code == 5)
            active->pending_attack = true;
        else if (code == 6)
            active->pending_blast = true;
    }
    active->input.apply(engine::KeyEvent{
        1, key_for(code), down ? engine::ButtonAction::pressed : engine::ButtonAction::released, false});
}
// The general-purpose companion to editor_key() above: forwards every
// physical key the JS side chooses to report (not just the small
// W/A/S/D/Shift/F/G set key_for() understands) into the Script sandbox's own
// `input` table -- see engine::script::Runtime::set_key_down's own doc
// comment (script.hpp) for why this is a plain string, not an engine::Key,
// and entirely separate from InputState/editor_key above (movement/combat
// keys stay native-typed and fixed; a script's own key bindings are
// whatever string the game author picks). Call once per physical
// keydown/keyup edge, same timing as editor_key -- before the editor_tick()
// call(s) that edge should be visible to.
// Browser KeyboardEvent.code -> engine::Key, for the native InputState that
// actions and the bound movement keys read.
engine::Key key_for_code(const std::string &code) {
    using engine::Key;
    if (code.size() == 4 && code.rfind("Key", 0) == 0 && code[3] >= 'A' && code[3] <= 'Z')
        return static_cast<Key>(static_cast<int>(Key::a) + (code[3] - 'A'));
    if (code.size() == 6 && code.rfind("Digit", 0) == 0 && code[5] >= '0' && code[5] <= '9')
        return static_cast<Key>(static_cast<int>(Key::digit0) + (code[5] - '0'));
    if (code.size() >= 2 && code[0] == 'F') {
        const int n = std::atoi(code.c_str() + 1);
        if (n >= 1 && n <= 12 && code == "F" + std::to_string(n))
            return static_cast<Key>(static_cast<int>(Key::f1) + n - 1);
    }
    static const std::map<std::string, Key> named{
        {"Space", Key::space},          {"Enter", Key::enter},           {"Escape", Key::escape},
        {"Tab", Key::tab},              {"Backspace", Key::backspace},   {"ArrowUp", Key::up},
        {"ArrowDown", Key::down},       {"ArrowLeft", Key::left},        {"ArrowRight", Key::right},
        {"ShiftLeft", Key::left_shift}, {"ShiftRight", Key::right_shift}, {"ControlLeft", Key::left_control},
        {"ControlRight", Key::right_control}, {"AltLeft", Key::left_alt}, {"AltRight", Key::right_alt}};
    const auto found = named.find(code);
    return found == named.end() ? Key::unknown : found->second;
}
// Any key by its KeyboardEvent.code (0.55.0). Replaces editor_key for the
// browser: F and G still set the melee/blast edges.
EXPORT void editor_input_key(const char *code, int down) {
    if (!code)
        return;
    const auto key = key_for_code(code);
    if (key == engine::Key::unknown)
        return;
    if (down && key == engine::Key::f)
        active->pending_attack = true;
    if (down && key == engine::Key::g)
        active->pending_blast = true;
    active->input.apply(engine::KeyEvent{
        1, key, down ? engine::ButtonAction::pressed : engine::ButtonAction::released, false});
}
// Mouse position is in viewport pixels; deltas accumulate within a frame.
EXPORT void editor_input_mouse_move(double x, double y, double dx, double dy) {
    active->input.apply(engine::MouseMotionEvent{1, static_cast<float>(x), static_cast<float>(y),
                                                 static_cast<float>(dx), static_cast<float>(dy)});
}
// button: 0 left, 1 middle, 2 right.
EXPORT void editor_input_mouse_button(int button, int down, double x, double y) {
    if (button < 0 || button > 2)
        return;
    const auto which = button == 0 ? engine::MouseButton::left
                       : button == 1 ? engine::MouseButton::middle
                                     : engine::MouseButton::right;
    active->input.apply(engine::MouseButtonEvent{1, which,
                                                 down ? engine::ButtonAction::pressed : engine::ButtonAction::released,
                                                 1, static_cast<float>(x), static_cast<float>(y)});
}
EXPORT void editor_input_wheel(double dx, double dy) {
    active->input.apply(engine::MouseWheelEvent{1, static_cast<float>(dx), static_cast<float>(dy)});
}
// Gamepad (device 2): connection, engine::GamepadButton index, and
// engine::GamepadAxis index with a value in -1..1 (triggers 0..1).
EXPORT void editor_input_gamepad_connected(int connected) {
    active->input.apply(engine::GamepadConnectionEvent{
        2, connected ? engine::GamepadConnection::connected : engine::GamepadConnection::disconnected});
}
EXPORT void editor_input_gamepad_button(int button, int down) {
    if (button < 0 || button >= static_cast<int>(engine::GamepadButton::count))
        return;
    active->input.apply(engine::GamepadButtonEvent{
        2, static_cast<engine::GamepadButton>(button), down ? engine::ButtonAction::pressed : engine::ButtonAction::released});
}
EXPORT void editor_input_gamepad_axis(int axis, double value) {
    if (axis < 0 || axis >= static_cast<int>(engine::GamepadAxis::count) || !std::isfinite(value))
        return;
    active->input.apply(engine::GamepadAxisEvent{2, static_cast<engine::GamepadAxis>(axis),
                                                 static_cast<float>(std::clamp(value, -1.0, 1.0))});
}
// Custom action bindings for the runtime being staged (see bindings.hpp).
// Invalid text keeps the defaults; editor_bindings_error() says why.
EXPORT void editor_set_input_bindings(const char *text) {
    if (!staging || !text)
        return;
    std::string error;
    if (auto map = editor_bindings::parse(text, error)) {
        staging->actions = engine::ActionSystem{std::move(*map)};
        staging->bindings_error.clear();
    } else {
        staging->bindings_error = error;
    }
}
EXPORT const char *editor_bindings_error() { return active->bindings_error.c_str(); }
// An action's current value, for the editor's own readouts and tests.
EXPORT double editor_action_value(const char *name) {
    if (!name)
        return 0;
    const auto &map = active->actions.map();
    const engine::ActionId id{name};
    if (std::find(map.actions.begin(), map.actions.end(), id) == map.actions.end())
        return 0;
    return active->actions.state(id).value;
}
EXPORT void editor_script_key(const char *key, int down) {
    active->script_runtime.set_key_down(key, down != 0);
}
// field 0/1/2 are Box.center.x/y/z; field 3 is Health.current/Health.max (a ratio in [0, 1]),
// or -1 if the entity has no Health; field 4 is Heading.yaw (radians, 0 for an entity with no
// Heading — indistinguishable from a real yaw of 0, but JS only ever reads this for an entity
// it already knows authored both Player and Vehicle); field 5 is an AIAgent's AIState as a plain
// int matching AIStateName's own declared order in Components.ts (0=Idle, 1=Walking, 2=Running,
// 3=Driving, 4=Fleeing, 5=Chasing, 6=Dead — Driving and Dead are declared but never actually
// produced by editor.ai, see its own doc comment), or -1 for an entity with no AIAgent. Returns 0
// (and, for fields 3/5, -1) for an index outside entities' bounds, or for an entity combat has
// since destroyed — check editor_alive() first to tell "destroyed" apart from "never had one" at
// 0,0,0.
EXPORT double editor_value(int index, int field) {
    if (index < 0 || static_cast<std::size_t>(index) >= active->entities.size())
        return field == 3 || field == 5 ? -1 : 0;
    const auto entity = active->entities[static_cast<std::size_t>(index)];
    if (!active->world.alive(entity))
        return field == 3 || field == 5 ? -1 : 0;
    if (field == 3) {
        const auto *health = active->world.get<Health>(entity);
        return health ? health->current / health->max : -1;
    }
    if (field == 4) {
        const auto *heading = active->world.get<Heading>(entity);
        return heading ? heading->yaw : 0;
    }
    if (field == 5) {
        const auto *agent = active->world.get<AIAgent>(entity);
        return agent ? static_cast<double>(static_cast<int>(agent->state)) : -1;
    }
    const auto &b = *active->world.get<engine::Box>(entity);
    return field == 0 ? b.center.x : field == 1 ? b.center.y : b.center.z;
}
// False once combat has destroyed the entity at this index (Health reaching 0) — the JS side's
// cue to hide it instead of reading a now-meaningless editor_value(). Every entity starts alive;
// nothing but combat destroys one, and only an entity with Health is ever a target.
EXPORT int editor_alive(int index) {
    if (index < 0 || static_cast<std::size_t>(index) >= active->entities.size())
        return 0;
    return active->world.alive(active->entities[static_cast<std::size_t>(index)]) ? 1 : 0;
}
EXPORT int editor_count() { return static_cast<int>(active->world.size()); }
// The most recent compile/runtime error recorded for the entity at this
// index's script (Runtime::script_errors, populated once per entity by
// engine::script::Runtime's own error handler — see the Runtime constructor),
// or an empty string if it has none. Lets the editor show a script author
// what went wrong instead of a silently inert entity with no visible cause.
// Out of range or no error both return "".
EXPORT const char *editor_script_error(int index) {
    static std::string result; // must outlive the call for Emscripten's ccall(...,
                                // 'string') to read it back; safe since JS only ever
                                // calls this synchronously and never holds the
                                // returned pointer past that call.
    result.clear();
    if (index >= 0 && static_cast<std::size_t>(index) < active->entities.size()) {
        const auto found = active->script_errors.find(active->entities[static_cast<std::size_t>(index)]);
        if (found != active->script_errors.end())
            result = found->second;
    }
    return result.c_str();
}
// Whatever the entity at this index requested via self.animate = "clipName"
// this tick (see engine::script::Runtime's own doc comment, script.hpp), or
// "" if it didn't -- same "static std::string result, outlives the call"
// contract as editor_script_error above, and the same "call once per entity
// per frame" idiom the host uses elsewhere for anything Runtime tracks
// per-entity. Out of range returns "".
EXPORT const char *editor_take_animation_request(int index) {
    static std::string result;
    result.clear();
    if (index >= 0 && static_cast<std::size_t>(index) < active->entities.size())
        result = active->script_runtime.take_animation_request(active->entities[static_cast<std::size_t>(index)]);
    return result.c_str();
}
// Restores one previously-persisted save key (e.g. read from localStorage by
// the host) into the active Runtime's save table before any script runs --
// the host side of engine::script::Runtime::seed_saved (see its own doc
// comment, script.hpp, for why this is distinct from a script's own
// save.set). Call once per key right after editor_commit() succeeds, before
// the first editor_tick().
EXPORT void editor_seed_save(const char *key, const char *value) { active->script_runtime.seed_saved(key, value); }
// Takes every save key a script has actually changed via save.set since the
// last call to this function (engine::script::Runtime::take_dirty_saves(),
// which drains what it reports -- see pending_dirty_saves's own doc comment
// above for why this must be called exactly once per poll), snapshots it,
// and returns how many keys came back. Call this first each poll, then
// editor_dirty_save_key/editor_dirty_save_value with an index below that
// count to read what changed -- e.g. once a rendered frame, persisting each
// one to localStorage.
EXPORT int editor_take_dirty_saves() {
    pending_dirty_saves = active->script_runtime.take_dirty_saves();
    return static_cast<int>(pending_dirty_saves.size());
}
EXPORT const char *editor_dirty_save_key(int index) {
    static std::string result; // same "outlives the call, never held past it" contract as
                                // editor_script_error's own result above.
    result.clear();
    if (index >= 0 && static_cast<std::size_t>(index) < pending_dirty_saves.size())
        result = pending_dirty_saves[static_cast<std::size_t>(index)].first;
    return result.c_str();
}
EXPORT const char *editor_dirty_save_value(int index) {
    static std::string result;
    result.clear();
    if (index >= 0 && static_cast<std::size_t>(index) < pending_dirty_saves.size())
        result = pending_dirty_saves[static_cast<std::size_t>(index)].second;
    return result.c_str();
}
// Projectiles are spawned entirely at runtime (a "blast" press), so unlike every other entity
// here they have no place in the entities/editor_add-indexed list synced from the authoring
// document — this pair lets JS enumerate and draw whichever ones currently exist instead.
// Queried fresh each call rather than cached by identity: JS only ever calls these back to back
// within one frame, with no editor_tick() in between to change which projectiles exist.
// Every entity the editor tracks by index, spawned ones included (editor_count
// counts only living world entities, projectiles too).
EXPORT int editor_entity_count() { return static_cast<int>(active->entities.size()); }
// The prefab a runtime-spawned entity came from; "" for authored entities.
EXPORT const char *editor_spawned_prefab(int index) {
    static std::string result;
    result.clear();
    if (index >= 0 && static_cast<std::size_t>(index) < active->entities.size())
        if (const auto *from = active->world.get<SpawnedFrom>(active->entities[static_cast<std::size_t>(index)]))
            result = from->prefab;
    return result.c_str();
}
// Moves the script command queue into a read buffer; returns its size.
std::vector<OutboundCommand> pending_commands;
EXPORT int editor_take_commands() {
    pending_commands = std::move(active->commands);
    active->commands.clear();
    return static_cast<int>(pending_commands.size());
}
// field 0 = kind, 1 = a, 2 = b.
EXPORT const char *editor_command_text(int index, int field) {
    static std::string result;
    result.clear();
    if (index >= 0 && static_cast<std::size_t>(index) < pending_commands.size()) {
        const auto &c = pending_commands[static_cast<std::size_t>(index)];
        result = field == 0 ? c.kind : field == 1 ? c.a : c.b;
    }
    return result.c_str();
}
// Delivers an editor-side event to an entity's script: only on_anim_event
// and on_anim_state (the Animator's callbacks) are accepted.
EXPORT void editor_script_notify(int index, const char *function_name, const char *argument) {
    if (!function_name || !argument || index < 0 || static_cast<std::size_t>(index) >= active->entities.size())
        return;
    const std::string name(function_name);
    if (name != "on_anim_event" && name != "on_anim_state")
        return;
    active->script_runtime.notify(active->world, active->entities[static_cast<std::size_t>(index)], name, argument);
}
// A UI element changed (Button with action "script" clicked, Slider moved,
// Toggle flipped): calls on_ui(name, value) in every script.
EXPORT void editor_ui_event(const char *name, const char *value) {
    if (name && value)
        active->script_runtime.broadcast(active->world, "on_ui", name, value);
}
EXPORT int editor_command_entity(int index) {
    return index >= 0 && static_cast<std::size_t>(index) < pending_commands.size()
               ? pending_commands[static_cast<std::size_t>(index)].entity_index
               : -1;
}
// "system=ms;system=ms" for the most recent tick (Stats overlay).
EXPORT const char *editor_profile_text() {
    static std::string result;
    result.clear();
    char buffer[64];
    for (const auto &[name, ms] : active->profile) {
        std::snprintf(buffer, sizeof buffer, "%.3f", ms);
        result += name + "=" + buffer + ";";
    }
    return result.c_str();
}
EXPORT int editor_projectile_count() {
    return static_cast<int>(active->world.query<engine::Box, Projectile>().size());
}
EXPORT double editor_projectile_value(int index, int field) {
    const auto entities = active->world.query<engine::Box, Projectile>();
    if (index < 0 || static_cast<std::size_t>(index) >= entities.size())
        return 0;
    const auto &b = *active->world.get<engine::Box>(entities[static_cast<std::size_t>(index)]);
    return field == 0 ? b.center.x : field == 1 ? b.center.y : b.center.z;
}
}
