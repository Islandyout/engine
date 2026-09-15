#pragma once
#include "engine/core/seeded_random.hpp"
#include "engine/graphics/box_view.hpp"
#include "engine/input/actions.hpp"
#include "engine/physics/physics.hpp"
#include "engine/scene/scene_document.hpp"
#include "engine/world/fixed_systems.hpp"
#include <algorithm>
#include <chrono>
#include <optional>

namespace playground {
using namespace engine;

// Playground-local gameplay data, not a general engine primitive — like Goal
// (see place_platform_path()), this is scoped to what the default scene
// needs, not a reusable engine::combat module.
struct Health final {
    float current{60.0F};
    float max{60.0F};
};

class Scene final {
public:
    World world;
    Entity player;
    std::optional<Entity> goal;  // unset for a loaded document; see reset()
    std::optional<Entity> enemy; // unset for a loaded document; see reset()
    OrbitView camera;
    Scene() : actions_(map()) {
        register_and_bind();
        reset();
    }
    // Loads an editor-exported "format 1" scene document (see
    // engine::parse_scene_document) instead of the built-in random boxes.
    // Pressing the "reset" action reloads this same document, matching the
    // default constructor's behavior of restoring its own starting scene.
    explicit Scene(SceneDocument document) : actions_(map()), loaded_(std::move(document)) {
        register_and_bind();
        reset();
    }
    void reset() {
        world.reset();
        camera = {};
        actions_ = ActionSystem{map()};
        won_ = false;
        enemy_defeated_ = false;
        goal.reset();
        enemy.reset();
        player = world.create();
        world.set(player, Box{{-3, 0.6F, 3}, {0.8F, 1.2F, 0.8F}, {218, 239, 132}});
        world.set(player, physics::RigidBody{});
        if (loaded_.has_value()) {
            populate_from_document(*loaded_);
        } else {
            SeededRandom rng{42};
            for (int i = 0; i < 7; ++i) {
                const float height = 0.8F + static_cast<float>(rng.next_unit()) * 2.2F;
                const auto obstacle = world.create();
                world.set(obstacle, Box{{static_cast<float>(i) * 1.8F - 5.4F, height / 2, -3},
                                         {1, height, 1},
                                         {104, 160, 159}});
                world.set(obstacle, physics::Collider{});
            }
            place_platform_path();
            place_enemy();
        }
    }
    void step(const FixedUpdateContext &context) {
        actions_.update(context.input);
        if (pressed("reset")) {
            reset();
            return;
        }
        systems_.run(world, context);
    }
    // True once the player's Box has overlapped the goal's Box (see
    // place_platform_path()); stays true until the next reset(). Always
    // false for a loaded document, which has no goal.
    [[nodiscard]] bool won() const { return won_; }
    // True once the enemy's Health has been reduced to 0 by "attack" (see
    // place_enemy()); stays true until the next reset(). Always false for a
    // loaded document, which has no enemy, or if the enemy was removed
    // (Backspace) before ever being defeated.
    [[nodiscard]] bool enemy_defeated() const { return enemy_defeated_; }
    // Health.current / Health.max for the enemy, or nullopt if there is no
    // enemy (a loaded document) or it is no longer alive (defeated or
    // removed) — the HUD's cue to stop drawing a health bar for it.
    [[nodiscard]] std::optional<float> enemy_health_ratio() const {
        if (!enemy.has_value() || !world.alive(*enemy))
            return std::nullopt;
        const auto &health = *world.get<Health>(*enemy);
        return health.current / health.max;
    }
    // A "format 1" snapshot of every current Box entity's position, in
    // world.query's creation order (player included). Only what a Box
    // carries survives: a Transform at its center and a visible Renderable
    // with mesh/material 0 — no name, parent, or the box's actual color/size
    // (the format has no field for them). Loadable by both
    // engine_playground --scene and the browser editor.
    [[nodiscard]] SceneDocument export_document() const {
        SceneDocument document;
        for (auto entity : world.query<Box>()) {
            const auto &box = *world.get<Box>(entity);
            SceneEntity out;
            out.transform = TransformComponent{{box.center.x, box.center.y, box.center.z}};
            out.renderable = RenderableComponent{0, 0, true};
            document.entities.push_back(std::move(out));
        }
        return document;
    }
    [[nodiscard]] std::vector<Box> boxes(bool show_player = true) const {
        std::vector<Box> result;
        for (int x = -8; x < 8; ++x)
            for (int z = -8; z < 8; ++z)
                result.push_back(
                    {{static_cast<float>(x) + 0.5F, -0.15F, static_cast<float>(z) + 0.5F},
                     {0.97F, 0.2F, 0.97F},
                     ((x + z) % 2) ? std::array<u8, 3>{63, 88, 88}
                                   : std::array<u8, 3>{69, 97, 96}});
        for (auto entity : world.query<Box>())
            if (show_player || entity != player)
                result.push_back(*world.get<Box>(entity));
        return result;
    }

private:
    static constexpr float jump_speed = 7.0F;
    // Held every tick while airborne and still holding "jump" (see below),
    // so gravity's per-tick pull is overwritten back to a steady climb
    // rather than accumulating: sustained flight, not an ever-accelerating
    // launch. Deliberately gentler than jump_speed's initial liftoff.
    static constexpr float fly_speed = 4.0F;
    FixedSystems systems_;
    ActionSystem actions_;
    std::optional<SceneDocument> loaded_;
    bool won_{false};
    bool enemy_defeated_{false};
    static constexpr float attack_damage = 20.0F;
    void register_and_bind() {
        world.register_component<Box>("playground.box");
        world.register_component<physics::RigidBody>("playground.rigidbody");
        world.register_component<physics::Collider>("playground.collider");
        world.register_component<Health>("playground.health");
        systems_.add(
            "playground.move", FixedPhase::update, 0, [&](World &w, const FixedUpdateContext &) {
                auto &box = *w.get<Box>(player);
                auto &body = *w.get<physics::RigidBody>(player);
                box.center.x = std::clamp(box.center.x + value("x") * 0.08F, -7.0F, 7.0F);
                box.center.z = std::clamp(box.center.z + value("z") * 0.08F, -7.0F, 7.0F);
                // Press "jump" while grounded to launch; keep holding it
                // while airborne to fly (a steady climb, not a single
                // decaying arc). Let go to stop climbing and fall normally
                // under gravity, same as after any jump.
                if (pressed("jump") && body.grounded)
                    body.velocity.y = jump_speed;
                else if (value("jump") > 0 && !body.grounded)
                    body.velocity.y = fly_speed;
                camera.yaw += value("orbit") * 0.025F;
                camera.scale = std::clamp(camera.scale + value("zoom") * 0.4F, 12.0F, 40.0F);
                // The camera always centers on the player's current
                // position, so it never lags a frame behind this tick's
                // x/z movement above.
                camera.target = box.center;
                if (pressed("spawn") && w.size() < 64) {
                    auto created = w.defer_create();
                    w.defer_set(
                        created,
                        Box{{box.center.x + 1.2F, 0.5F, box.center.z}, {1, 1, 1}, {218, 166, 96}});
                    w.defer_set(created, physics::Collider{});
                }
                if (pressed("remove")) {
                    auto all = w.query<Box>();
                    for (auto i = all.rbegin(); i != all.rend(); ++i)
                        if (*i != player && (!goal.has_value() || *i != *goal)) {
                            w.defer_destroy(*i);
                            break;
                        }
                }
            });
        systems_.add("playground.physics", FixedPhase::update, 10,
                      [](World &w, const FixedUpdateContext &context) {
                          physics::step(
                              w, std::chrono::duration<float>(context.delta_time).count());
                      });
        systems_.add("playground.goal", FixedPhase::update, 20,
                      [&](World &w, const FixedUpdateContext &) {
                          if (!won_ && goal.has_value())
                              won_ = physics::overlaps(*w.get<Box>(player), *w.get<Box>(*goal));
                      });
        systems_.add(
            "playground.combat", FixedPhase::update, 20, [&](World &w, const FixedUpdateContext &) {
                if (!pressed("attack") || !enemy.has_value() || !w.alive(*enemy))
                    return;
                // Melee range: must actually be touching the enemy's Box,
                // the same overlap test the goal uses to detect the player.
                if (!physics::overlaps(*w.get<Box>(player), *w.get<Box>(*enemy)))
                    return;
                auto &health = *w.get<Health>(*enemy);
                health.current = std::max(0.0F, health.current - attack_damage);
                if (health.current <= 0) {
                    w.defer_destroy(*enemy);
                    enemy_defeated_ = true;
                }
            });
    }
    // A hand-authored, deliberately generous ascending staircase — three
    // static platforms 0.5 units taller than the last, each flush against
    // the next so there is always solid ground to stand on, plus a goal
    // marker resting on the final platform. Max jump apex here is
    // jump_speed^2 / (2 * -physics::Config{}.gravity) =~ 1.36 units, well
    // above each 0.5-unit step. The goal is a Box (so the existing overlap
    // check and renderer see it) but never gets a Collider: touching it,
    // not standing on it, is what wins, so it must not block the player.
    // Placed at z=6, clear of the player's z=3 spawn/default facing and the
    // random field's z=-3 row, so approaching it is a deliberate move.
    void place_platform_path() {
        struct Platform final {
            float x;
            float top;
        };
        static constexpr float path_z = 6;
        static constexpr Platform platforms[] = {{-1, 1.0F}, {1, 1.5F}, {3, 2.0F}};
        Platform last = platforms[0];
        for (const auto &platform : platforms) {
            const auto entity = world.create();
            world.set(entity, Box{{platform.x, platform.top / 2, path_z}, {2, platform.top, 2},
                                   {166, 138, 218}});
            world.set(entity, physics::Collider{});
            last = platform;
        }
        const auto goal_entity = world.create();
        world.set(goal_entity, Box{{last.x, last.top + 0.25F, path_z},
                                    {0.6F, 0.5F, 0.6F},
                                    {255, 215, 0}});
        goal = goal_entity;
    }
    // One stationary target near spawn (an easy first fight, not a second
    // climb) — press "attack" while overlapping it to deal attack_damage;
    // three hits defeats it. Deliberately not a Collider: physics resolves
    // any solid overlap away each tick (to exactly zero penetration, which
    // physics::overlaps — a strict inequality test — then reports as no
    // overlap), so a solid enemy could never actually register as "in
    // range." Non-solid, like the goal, is what lets standing on/inside it
    // register at all; it does not fight back or block movement, which is
    // deliberately scoped to "there is something to hit and it can be
    // defeated," not a full combat AI.
    void place_enemy() {
        const auto entity = world.create();
        world.set(entity, Box{{0, 0.5F, 0}, {1, 1, 1}, {200, 70, 70}});
        world.set(entity, Health{});
        enemy = entity;
    }
    // Places one box per document entity that has a Transform and is not
    // explicitly marked non-visible. The box color is a deterministic
    // placeholder keyed by the entity's Renderable.material index (and its
    // position among placed entities, so materials 0 stay visually
    // distinguishable) since the CPU box view has no textured-material path;
    // this is not the editor's actual material rendering.
    void populate_from_document(const SceneDocument &document) {
        static constexpr std::array<std::array<u8, 3>, 6> palette = {
            {{218, 166, 96}, {104, 160, 159}, {166, 138, 218}, {218, 108, 108}, {108, 178, 218},
             {178, 218, 108}}};
        usize placed = 0;
        for (const auto &entity : document.entities) {
            if (world.size() >= 64)
                break; // keep parity with the playground's existing entity cap
            if (!entity.transform.has_value())
                continue;
            if (entity.renderable.has_value() && !entity.renderable->visible)
                continue;
            const auto &position = entity.transform->position;
            const auto material = entity.renderable ? entity.renderable->material : 0U;
            const auto color = palette[(material + placed) % palette.size()];
            const auto document_entity = world.create();
            world.set(document_entity,
                      Box{{position.x, position.y, position.z}, {0.8F, 0.8F, 0.8F}, color});
            world.set(document_entity, physics::Collider{});
            ++placed;
        }
    }
    float value(const char *name) const { return actions_.state(ActionId{name}).value; }
    bool pressed(const char *name) const { return actions_.state(ActionId{name}).pressed; }
    static InputMap map() {
        InputMap result;
        InputContext context{InputContextId{"playground"}, 0, true, {}};
        auto bind = [&](const char *name, Key key, float scale) {
            context.bindings.push_back({ActionId{name},
                                        KeyBinding{key},
                                        {},
                                        AxisProcessor{0, 1, ResponseCurve::linear, false, scale}});
        };
        for (auto name : {"x", "z", "orbit", "zoom", "spawn", "remove", "reset", "jump", "attack"})
            result.actions.emplace_back(name);
        bind("x", Key::a, -1);
        bind("x", Key::d, 1);
        bind("z", Key::w, -1);
        bind("z", Key::s, 1);
        bind("orbit", Key::q, -1);
        bind("orbit", Key::e, 1);
        bind("zoom", Key::z, -1);
        bind("zoom", Key::x, 1);
        bind("spawn", Key::space, 1);
        bind("remove", Key::backspace, 1);
        bind("reset", Key::r, 1);
        bind("jump", Key::left_shift, 1);
        bind("attack", Key::f, 1);
        result.contexts.push_back(context);
        return result;
    }
};
} // namespace playground
