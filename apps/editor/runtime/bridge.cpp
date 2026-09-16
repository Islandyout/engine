#include "engine/physics/physics.hpp"
#include "engine/script/script.hpp"
#include "engine/world/fixed_systems.hpp"
#include <algorithm>
#include <cmath>
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

// Present on a PlayerMarker entity that also carries an authored Vehicle
// component: switches its horizontal movement from instant-direction,
// camera-relative strafing to momentum-based accelerate/steer (see
// vehicle_speed/vehicle_turn_rate below). yaw is radians; 0 faces +z (an
// arbitrary but fixed convention — see editor_add's doc comment for why an
// authored Rotation isn't consulted as a starting heading). speed is the
// signed distance per second currently traveled along that heading.
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
};

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
};
// Marker: an AIAgent that never enters AIState::Chasing regardless of how
// close the Player gets — a harmless wanderer, not a hostile one. Still
// flees on low health like any other AIAgent (fleeing isn't hostility, it's
// self-preservation). Meaningless without AIAgent, same as Heading needing
// PlayerMarker — simply ignored, not validated here.
struct Pedestrian final {};

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
};

constexpr float move_speed = 4.8F; // units/s; matches the native playground's tuned feel
constexpr float jump_speed = 7.0F;
constexpr float fly_speed = 4.0F;
// Vehicle driving feel: a simplified arcade model, not real car physics —
// constant turn rate regardless of speed (no traction/slip curve), no
// distinction between engine power and braking. Reasonable-scope tuning, not
// a claim of realism.
constexpr float vehicle_accel = 6.0F;         // units/s^2
constexpr float vehicle_drag = 3.0F;          // units/s^2, applied opposing motion with no accel input
constexpr float vehicle_max_forward = 9.0F;   // units/s
constexpr float vehicle_max_reverse = 4.0F;   // units/s
constexpr float vehicle_turn_rate = 2.2F;     // rad/s at full steering lock
constexpr float ai_walk_speed = 1.6F;         // units/s; wander pace
constexpr float ai_run_speed = 4.0F;          // units/s; wander sprint, chase, and flee
constexpr float ai_sense_radius = 6.0F;       // units; distance at which an AIAgent notices the Player
constexpr float ai_flee_health_ratio = 0.3F;  // flee once current/max health drops to/below this
constexpr float ai_wander_min_phase = 1.0F;   // seconds; shortest idle or walk/run phase
constexpr float ai_wander_max_phase = 3.0F;   // seconds; longest idle or walk/run phase
constexpr float attack_damage = 20.0F;
// Weaker than melee (a ranged option, not a strict upgrade) and fast enough
// to cross a typical engagement distance well within its lifetime.
constexpr float blast_damage = 15.0F;
constexpr float blast_speed = 8.0F;

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
    default:
        return engine::Key::unknown;
    }
}

// Shared by melee ("attack") and blast hits: applies damage to a Health
// entity and destroys it on defeat. Mirrors the native playground's own
// damage_enemy, generalized to whichever Health entity was actually hit
// instead of one hardcoded enemy. A no-op if target has no Health (already
// destroyed between the caller's query and this call, e.g. two projectiles
// landing the same tick).
void damage(engine::World &w, engine::Entity target, float amount) {
    auto *health = w.get<Health>(target);
    if (!health)
        return;
    health->current = std::max(0.0F, health->current - amount);
    if (health->current <= 0)
        w.defer_destroy(target);
}

struct Runtime {
    engine::World world;
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
    engine::script::Runtime script_runtime;
    std::map<engine::Entity, std::string> script_errors;
    Runtime() {
        world.register_component<engine::Box>("editor.box");
        world.register_component<engine::physics::RigidBody>("editor.rigid_body");
        world.register_component<engine::physics::Collider>("editor.collider");
        world.register_component<PlayerMarker>("editor.player");
        world.register_component<Health>("editor.health");
        world.register_component<Projectile>("editor.projectile");
        world.register_component<Heading>("editor.heading");
        world.register_component<AIAgent>("editor.ai_agent");
        world.register_component<Pedestrian>("editor.pedestrian");
        world.register_component<engine::script::Script>("editor.script");
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
        systems.add(
            "editor.ai", engine::FixedPhase::update, 1,
            [](engine::World &w, const engine::FixedUpdateContext &) {
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
                    const bool is_pedestrian = w.get<Pedestrian>(entity) != nullptr;

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
                        const float dx = player_pos->x - box.center.x;
                        const float dz = player_pos->z - box.center.z;
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
                            agent.timer = ai_wander_min_phase + (random_unit(agent.rng) + 1.0F) * 0.5F *
                                                                     (ai_wander_max_phase - ai_wander_min_phase);
                        } else {
                            next_state = agent.state; // hold the current phase until the timer elapses
                        }
                        if (next_state == AIState::Walking || next_state == AIState::Running) {
                            target_x = agent.dir_x;
                            target_z = agent.dir_z;
                        }
                    }
                    const float speed = next_state == AIState::Walking     ? ai_walk_speed
                                         : next_state == AIState::Idle     ? 0.0F
                                                                            : ai_run_speed;
                    body.velocity.x = target_x * speed;
                    body.velocity.z = target_z * speed;
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
        systems.add("editor.script", engine::FixedPhase::update, 2,
                    [this](engine::World &w, const engine::FixedUpdateContext &) {
                        script_runtime.step(w, 1.0F / 60.0F);
                    });
        // Order 0: apply this tick's input to the player's velocity before
        // order 10 integrates it — matches the native playground's own
        // move-then-physics ordering.
        systems.add(
            "editor.move", engine::FixedPhase::update, 0,
            [this](engine::World &w, const engine::FixedUpdateContext &context) {
                for (const auto entity : w.query<engine::physics::RigidBody, PlayerMarker>()) {
                    auto &body = *w.get<engine::physics::RigidBody>(entity);
                    auto *heading = w.get<Heading>(entity);
                    if (heading) {
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
                        heading->yaw += steer_input * vehicle_turn_rate / 60.0F;
                        heading->speed += accel_input * vehicle_accel / 60.0F;
                        if (accel_input == 0) {
                            if (heading->speed > 0)
                                heading->speed = std::max(0.0F, heading->speed - vehicle_drag / 60.0F);
                            else
                                heading->speed = std::min(0.0F, heading->speed + vehicle_drag / 60.0F);
                        }
                        heading->speed = std::clamp(heading->speed, -vehicle_max_reverse, vehicle_max_forward);
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
                        if (context.input.key_down(engine::Key::a))
                            right -= 1;
                        if (context.input.key_down(engine::Key::d))
                            right += 1;
                        if (context.input.key_down(engine::Key::w))
                            forward += 1;
                        if (context.input.key_down(engine::Key::s))
                            forward -= 1;
                        const float fx = camera_forward_x, fz = camera_forward_z;
                        const float right_x = -fz, right_z = fx; // cross(forward, up), up = +y
                        body.velocity.x = (right_x * right + fx * forward) * move_speed;
                        body.velocity.z = (right_z * right + fz * forward) * move_speed;
                    }
                    // Press jump while grounded to launch; keep holding it
                    // while airborne to fly (a steady climb, not a single
                    // decaying arc) — same as the native playground.
                    if (context.input.key_pressed(engine::Key::left_shift) && body.grounded)
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
                                w.defer_set(projectile,
                                            Projectile{engine::Vec3{direction.x * blast_speed,
                                                                     direction.y * blast_speed,
                                                                     direction.z * blast_speed},
                                                       entity});
                            }
                        }
                    }
                }
            });
        systems.add("editor.physics", engine::FixedPhase::update, 10,
                    [](engine::World &w, const engine::FixedUpdateContext &) {
                        engine::physics::step(w, 1.0F / 60.0F);
                    });
        // Order 15: after physics moves everything (10) but before combat (20)
        // resolves melee for this same tick — matches the native playground's
        // own ordering.
        systems.add(
            "editor.projectiles", engine::FixedPhase::update, 15,
            [](engine::World &w, const engine::FixedUpdateContext &) {
                constexpr float dt = 1.0F / 60.0F;
                for (const auto entity : w.query<engine::Box, Projectile>()) {
                    auto &box = *w.get<engine::Box>(entity);
                    auto &projectile = *w.get<Projectile>(entity);
                    box.center.x += projectile.velocity.x * dt;
                    box.center.y += projectile.velocity.y * dt;
                    box.center.z += projectile.velocity.z * dt;
                    projectile.lifetime -= dt;
                    bool hit = false;
                    for (const auto target : w.query<engine::Box, Health>()) {
                        if (target == projectile.owner)
                            continue;
                        if (engine::physics::overlaps(box, *w.get<engine::Box>(target))) {
                            damage(w, target, blast_damage);
                            hit = true;
                            break;
                        }
                    }
                    if (hit || projectile.lifetime <= 0)
                        w.defer_destroy(entity);
                }
            });
        // Melee: press "attack" (F) while a Player's Box overlaps a Health
        // entity's Box — the same overlap test the native playground's combat
        // and goal checks use. Order 20 matches the native playground's own
        // combat system order.
        systems.add(
            "editor.combat", engine::FixedPhase::update, 20,
            [this](engine::World &w, const engine::FixedUpdateContext &) {
                if (!pending_attack)
                    return;
                pending_attack = false; // consumed by this tick, not every tick this frame
                for (const auto entity : w.query<engine::Box, PlayerMarker>()) {
                    const auto &box = *w.get<engine::Box>(entity);
                    for (const auto target : w.query<engine::Box, Health>()) {
                        if (target == entity)
                            continue;
                        if (engine::physics::overlaps(box, *w.get<engine::Box>(target)))
                            damage(w, target, attack_damage);
                    }
                }
            });
    }
};
std::unique_ptr<Runtime> active = std::make_unique<Runtime>();
std::unique_ptr<Runtime> staging;
bool failed{};
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
EXPORT int editor_add(double x, double y, double z, double vx, double vy, double vz, double sx,
                       double sy, double sz, double is_child, double is_player, double is_collider,
                       double hp_current, double hp_max, double is_vehicle, double is_ai,
                       double is_pedestrian, double collider_shape, double collider_radius) {
    if (!staging || staging->entities.size() >= 1024) {
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
    const auto e = staging->world.create();
    staging->world.set(
        e, engine::Box{engine::Vec3{static_cast<float>(x), static_cast<float>(y), static_cast<float>(z)},
                       engine::Vec3{static_cast<float>(sx), static_cast<float>(sy), static_cast<float>(sz)}});
    if (is_child == 0) {
        staging->world.set(e, engine::physics::RigidBody{engine::Vec3{
                                  static_cast<float>(vx), static_cast<float>(vy), static_cast<float>(vz)}});
        if (is_player != 0) {
            staging->world.set(e, PlayerMarker{});
            if (is_vehicle != 0)
                staging->world.set(
                    e, Heading{0.0F, 0.0F, static_cast<float>(sx) / 2.0F, static_cast<float>(sz) / 2.0F});
        }
        if (is_collider != 0)
            staging->world.set(
                e, engine::physics::Collider{
                       true,
                       collider_shape != 0 ? engine::physics::ColliderShape::Sphere
                                           : engine::physics::ColliderShape::Box,
                       static_cast<float>(collider_radius)});
        if (hp_max > 0)
            staging->world.set(
                e, Health{std::clamp(static_cast<float>(hp_current), 0.0F, static_cast<float>(hp_max)),
                          static_cast<float>(hp_max)});
        if (is_ai != 0) {
            // Seeded from this entity's authoring order (never 0, xorshift32's
            // one fixed point) rather than wall-clock time, so two entities
            // never share a seed and the whole wander pattern is exactly
            // reproducible run to run — required for editor_bridge_tests.cpp
            // to assert on it at all.
            staging->world.set(
                e, AIAgent{AIState::Idle, 0.0F, 0.0F, 1.0F,
                           static_cast<std::uint32_t>(staging->entities.size()) + 1});
            if (is_pedestrian != 0)
                staging->world.set(e, Pedestrian{});
        }
    }
    staging->entities.push_back(e);
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
EXPORT void editor_set_script_source(int index, const char *source) {
    if (!staging || index < 0 || static_cast<std::size_t>(index) >= staging->entities.size())
        return;
    staging->world.set(staging->entities[static_cast<std::size_t>(index)],
                        engine::script::Script{source != nullptr ? source : ""});
}
EXPORT int editor_commit() {
    if (!staging || failed) {
        staging.reset();
        return 0;
    }
    active.swap(staging);
    staging.reset();
    return 1;
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
// code is one of the small set key_for() understands
// (0=W,1=A,2=S,3=D,4=Shift,5=F/attack,6=G/blast); anything else maps to
// Key::unknown and is silently inert. down is nonzero for a keydown, zero
// for a keyup.
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
// Projectiles are spawned entirely at runtime (a "blast" press), so unlike every other entity
// here they have no place in the entities/editor_add-indexed list synced from the authoring
// document — this pair lets JS enumerate and draw whichever ones currently exist instead.
// Queried fresh each call rather than cached by identity: JS only ever calls these back to back
// within one frame, with no editor_tick() in between to change which projectiles exist.
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
