#include "engine/physics/physics.hpp"
#include "engine/world/fixed_systems.hpp"
#include <algorithm>
#include <cmath>
#include <memory>
#include <optional>
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
    Runtime() {
        world.register_component<engine::Box>("editor.box");
        world.register_component<engine::physics::RigidBody>("editor.rigid_body");
        world.register_component<engine::physics::Collider>("editor.collider");
        world.register_component<PlayerMarker>("editor.player");
        world.register_component<Health>("editor.health");
        world.register_component<Projectile>("editor.projectile");
        // Order 0: apply this tick's input to the player's velocity before
        // order 10 integrates it — matches the native playground's own
        // move-then-physics ordering.
        systems.add(
            "editor.move", engine::FixedPhase::update, 0,
            [this](engine::World &w, const engine::FixedUpdateContext &context) {
                for (const auto entity : w.query<engine::physics::RigidBody, PlayerMarker>()) {
                    auto &body = *w.get<engine::physics::RigidBody>(entity);
                    float x = 0, z = 0;
                    if (context.input.key_down(engine::Key::a))
                        x -= 1;
                    if (context.input.key_down(engine::Key::d))
                        x += 1;
                    if (context.input.key_down(engine::Key::w))
                        z -= 1;
                    if (context.input.key_down(engine::Key::s))
                        z += 1;
                    body.velocity.x = x * move_speed;
                    body.velocity.z = z * move_speed;
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
EXPORT int editor_add(double x, double y, double z, double vx, double vy, double vz, double sx,
                       double sy, double sz, double is_child, double is_player, double is_collider,
                       double hp_current, double hp_max) {
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
    const auto e = staging->world.create();
    staging->world.set(
        e, engine::Box{engine::Vec3{static_cast<float>(x), static_cast<float>(y), static_cast<float>(z)},
                       engine::Vec3{static_cast<float>(sx), static_cast<float>(sy), static_cast<float>(sz)}});
    if (is_child == 0) {
        staging->world.set(e, engine::physics::RigidBody{engine::Vec3{
                                  static_cast<float>(vx), static_cast<float>(vy), static_cast<float>(vz)}});
        if (is_player != 0)
            staging->world.set(e, PlayerMarker{});
        if (is_collider != 0)
            staging->world.set(e, engine::physics::Collider{});
        if (hp_max > 0)
            staging->world.set(
                e, Health{std::clamp(static_cast<float>(hp_current), 0.0F, static_cast<float>(hp_max)),
                          static_cast<float>(hp_max)});
    }
    staging->entities.push_back(e);
    return 1;
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
// or -1 if the entity has no Health. Returns 0 (and, for field 3, -1) for an index outside
// entities' bounds, or for an entity combat has since destroyed — check editor_alive() first
// to tell "destroyed" apart from "never had one" at 0,0,0.
EXPORT double editor_value(int index, int field) {
    if (index < 0 || static_cast<std::size_t>(index) >= active->entities.size())
        return field == 3 ? -1 : 0;
    const auto entity = active->entities[static_cast<std::size_t>(index)];
    if (!active->world.alive(entity))
        return field == 3 ? -1 : 0;
    if (field == 3) {
        const auto *health = active->world.get<Health>(entity);
        return health ? health->current / health->max : -1;
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
