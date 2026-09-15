#include "../apps/native_playground/scene.hpp"
#include <cmath>
#include <iostream>
#include <limits>
#include <stdexcept>

namespace {
void check(bool pass, const char *message) {
    if (!pass)
        throw std::runtime_error{message};
}
void key(engine::InputState &input, engine::Key key, bool down) {
    input.apply(engine::KeyEvent{
        1, key, down ? engine::ButtonAction::pressed : engine::ButtonAction::released, false});
}
} // namespace
int main() {
    try {
        using namespace engine;
        playground::Scene scene;
        InputState input;
        auto step = [&] {
            scene.step({0, std::chrono::nanoseconds{16666667}, input});
            input.begin_frame();
        };
        const auto stale = scene.player;
        key(input, Key::d, true);
        for (int i = 0; i < 10; ++i)
            step();
        check(std::abs(scene.world.get<Box>(scene.player)->center.x + 2.2F) < 0.00001F,
              "action movement");
        key(input, Key::space, true);
        step();
        check(scene.world.size() == 14, "deferred creation");
        step();
        check(scene.world.size() == 14, "held key does not repeat spawn");
        key(input, Key::backspace, true);
        step();
        check(scene.world.size() == 13, "deferred removal");
        key(input, Key::q, true);
        step();
        check(scene.camera.yaw < 0.65F, "camera action");
        key(input, Key::r, true);
        step();
        check(!scene.world.alive(stale), "reset invalidates handles");
        check(scene.world.size() == 13,
              "reset restores seed scene: player, 7 field boxes, 3 platforms, 1 goal, 1 enemy");

        {
            // A scene loaded from an editor-exported document (see
            // engine::parse_scene_document) replaces the built-in random
            // boxes, and pressing reset reloads that same document rather
            // than falling back to it.
            SceneDocument document;
            document.entities.push_back(
                {std::nullopt, std::nullopt, TransformComponent{{1, 2, 3}}, std::nullopt});
            document.entities.push_back({std::nullopt, std::nullopt, TransformComponent{{4, 5, 6}},
                                          RenderableComponent{0, 0, false}});
            document.entities.push_back({std::nullopt, std::nullopt, std::nullopt,
                                          RenderableComponent{0, 0, true}});
            playground::Scene loaded{document};
            check(loaded.world.size() == 2, "player plus one visible transform entity");
            const auto placed = loaded.world.query<Box>();
            bool found = false;
            for (auto entity : placed)
                if (entity != loaded.player) {
                    const auto center = loaded.world.get<Box>(entity)->center;
                    found = found || (std::abs(center.x - 1.0F) < 0.0001F &&
                                      std::abs(center.y - 2.0F) < 0.0001F &&
                                      std::abs(center.z - 3.0F) < 0.0001F);
                }
            check(found, "document entity placed at its Transform position");
            // A dedicated InputState avoids any held-key state carried over
            // from the shared `input` object used above.
            InputState reset_input;
            key(reset_input, Key::r, true);
            loaded.step({0, std::chrono::nanoseconds{16666667}, reset_input});
            check(loaded.world.size() == 2, "reset reloads the same document, not the defaults");
        }

        {
            // export_document() snapshots every current Box entity (player
            // included) as a Transform+Renderable, and that snapshot
            // round-trips through the same "format 1" JSON the editor and
            // --scene both use.
            const auto exported = scene.export_document();
            check(exported.entities.size() == scene.world.query<Box>().size(),
                  "export_document captures every Box entity");
            const auto reloaded = parse_scene_document(serialize_scene_document(exported));
            check(reloaded.entities.size() == exported.entities.size(),
                  "exported document round-trips through serialize+parse");
            const auto player_box = *scene.world.get<Box>(scene.player);
            bool found_player = false;
            for (const auto &entity : reloaded.entities)
                found_player = found_player ||
                               (entity.transform.has_value() &&
                                std::abs(entity.transform->position.x - player_box.center.x) <
                                    0.0001F &&
                                std::abs(entity.transform->position.y - player_box.center.y) <
                                    0.0001F &&
                                std::abs(entity.transform->position.z - player_box.center.z) <
                                    0.0001F);
            check(found_player, "round-tripped document includes the player's exact position");
        }

        {
            // The default scene's platform path (see place_platform_path())
            // is reachable by ordinary input: not won at start, and a
            // two-phase script (approach along z only, clear of every
            // platform's x-range, then traverse along x, re-pressing jump
            // the instant the player is grounded) reaches the goal within a
            // generous tick budget. The jump key is tied to `grounded`
            // rather than a fixed cadence deliberately: since holding
            // "jump" while airborne now sustains flight (see below), a
            // fixed press/release timer can end up re-pressing before the
            // player has landed from the previous hop, which engages
            // flight instead of a fresh liftoff and sends it well off the
            // intended path — tying the key to `grounded` is how a real
            // player would use the control anyway (bunny-hop: land, jump
            // again), and it is what the engine's own edge-detection
            // expects a clean repeated jump to look like. Diagonal
            // movement is deliberately not used for the approach: it walks
            // the player into a platform's z-face before it is over the
            // platform's footprint, which blocks it exactly like any other
            // Collider wall — a real property of static box colliders, not
            // a bug, but it means "straight there" is not this path's
            // traversal order. The goal itself is exempt from "remove" and
            // so is never deleted by this scripted input.
            playground::Scene run;
            check(!run.won(), "not won at the start");
            check(run.goal.has_value(), "the default scene has a goal");
            InputState run_input;
            key(run_input, Key::s, true);
            for (int tick = 0; tick < 45; ++tick) {
                run.step({0, std::chrono::nanoseconds{16666667}, run_input});
                run_input.begin_frame();
            }
            key(run_input, Key::s, false);
            key(run_input, Key::d, true);
            bool reached = false;
            for (int tick = 0; tick < 300 && !reached; ++tick) {
                key(run_input, Key::left_shift,
                    run.world.get<physics::RigidBody>(run.player)->grounded);
                run.step({0, std::chrono::nanoseconds{16666667}, run_input});
                run_input.begin_frame();
                reached = run.won();
            }
            check(reached, "scripted platforming input reaches the goal within budget");
            check(run.world.alive(*run.goal), "the goal is never removed by scripted input");
        }

        {
            // Holding "jump" while airborne sustains a climb (flight), not
            // just a single decaying jump arc: velocity stays near
            // fly_speed instead of decaying toward zero/negative under
            // gravity, and releasing lets gravity take back over.
            playground::Scene flight;
            InputState flight_input;
            key(flight_input, Key::left_shift, true);
            float y_early = 0, y_late = 0;
            for (int tick = 0; tick < 180; ++tick) {
                flight.step({0, std::chrono::nanoseconds{16666667}, flight_input});
                flight_input.begin_frame();
                if (tick == 20)
                    y_early = flight.world.get<Box>(flight.player)->center.y;
                if (tick == 179)
                    y_late = flight.world.get<Box>(flight.player)->center.y;
            }
            const auto &flying_body = *flight.world.get<physics::RigidBody>(flight.player);
            check(!flying_body.grounded, "still airborne after 180 ticks of sustained flight");
            check(flying_body.velocity.y > 2.0F,
                  "flight holds a steady climb rate rather than decaying like a jump arc");
            check(y_late - y_early > 5.0F,
                  "sustained flight climbs well beyond a single jump's height");

            key(flight_input, Key::left_shift, false);
            for (int tick = 0; tick < 60; ++tick) {
                flight.step({0, std::chrono::nanoseconds{16666667}, flight_input});
                flight_input.begin_frame();
            }
            check(flight.world.get<physics::RigidBody>(flight.player)->velocity.y < 0,
                  "releasing flight lets gravity take back over");
        }

        {
            // The camera always centers on the player's own current
            // position (see camera.target in the move system) - it never
            // lags behind, since target is set from the same tick's
            // already-updated box.center.
            playground::Scene followed;
            InputState follow_input;
            key(follow_input, Key::d, true);
            for (int tick = 0; tick < 20; ++tick) {
                followed.step({0, std::chrono::nanoseconds{16666667}, follow_input});
                follow_input.begin_frame();
            }
            const auto &followed_box = *followed.world.get<Box>(followed.player);
            check(followed.camera.target.x == followed_box.center.x &&
                      followed.camera.target.y == followed_box.center.y &&
                      followed.camera.target.z == followed_box.center.z,
                  "camera.target tracks the player's exact position every tick");
        }

        {
            // The default scene's stationary enemy (see place_enemy()) is
            // reachable and defeatable: walking onto it and pressing
            // "attack" (edge-triggered, so the key is released and
            // re-pressed for each hit, like jump) deals attack_damage per
            // hit, and three hits (60 max health) defeats it - the entity
            // is destroyed and enemy_defeated() latches true. A further
            // attack after defeat is a safe no-op, not a crash or an
            // "undefeat".
            playground::Scene fight;
            check(fight.enemy.has_value(), "the default scene has an enemy");
            check(!fight.enemy_defeated(), "not defeated at the start");
            InputState fight_input;
            // Spawn (-3, 0.6, 3) to the enemy (0, 0.5, 0): +x, -z.
            key(fight_input, Key::d, true);
            key(fight_input, Key::w, true);
            for (int tick = 0; tick < 38; ++tick) {
                fight.step({0, std::chrono::nanoseconds{16666667}, fight_input});
                fight_input.begin_frame();
            }
            key(fight_input, Key::d, false);
            key(fight_input, Key::w, false);
            check(physics::overlaps(*fight.world.get<Box>(fight.player),
                                     *fight.world.get<Box>(*fight.enemy)),
                  "walking onto the enemy overlaps it");
            const auto attack = [&] {
                key(fight_input, Key::f, true);
                fight.step({0, std::chrono::nanoseconds{16666667}, fight_input});
                fight_input.begin_frame();
                key(fight_input, Key::f, false);
                fight.step({0, std::chrono::nanoseconds{16666667}, fight_input});
                fight_input.begin_frame();
            };
            attack();
            check(fight.world.alive(*fight.enemy) &&
                      fight.world.get<playground::Health>(*fight.enemy)->current == 40.0F,
                  "one hit deals attack_damage");
            attack();
            check(fight.world.alive(*fight.enemy) &&
                      fight.world.get<playground::Health>(*fight.enemy)->current == 20.0F,
                  "a second hit deals attack_damage again");
            check(!fight.enemy_defeated(), "not defeated after two hits");
            attack();
            check(!fight.world.alive(*fight.enemy), "a third hit destroys the enemy");
            check(fight.enemy_defeated(), "enemy_defeated() latches true on the killing hit");
            attack();
            check(fight.enemy_defeated(), "a further attack after defeat is a safe no-op");
        }

        {
            // A Box's per-face brightness now comes from the same
            // directional light draw_mesh() applies to a normal-carrying
            // mesh vertex (see face_light() in box_view.cpp), not a canned
            // per-face table: different faces genuinely light differently
            // depending on their angle to the light, instead of every face
            // getting some fixed, physically arbitrary brightness.
            BoxView probe;
            std::array<Box, 1> single = {Box{{0, 0, 0}, {2, 2, 2}, {255, 255, 255}}};
            probe.draw(single);
            u8 brightest = 0, dimmest_lit = 255;
            for (usize i = 0; i < probe.pixels().size(); i += 4) {
                const u8 r = probe.pixels()[i];
                if (r > 100) { // background is a dark gradient, r in [15, 26]
                    brightest = std::max(brightest, r);
                    dimmest_lit = std::min(dimmest_lit, r);
                }
            }
            check(brightest > 200, "a face lit near head-on (the top, +Y) is bright");
            check(dimmest_lit < 200 && dimmest_lit > 100,
                  "a face at a shallower light angle is dimmer but still lit");
            check(static_cast<int>(brightest) - static_cast<int>(dimmest_lit) > 30,
                  "different faces are genuinely lit differently, not one flat shade");
        }

        BoxView view;
        auto boxes = scene.boxes();
        view.draw(boxes);
        const std::vector<u8> original(view.pixels().begin(), view.pixels().end());
        view.draw(boxes);
        check(std::equal(original.begin(), original.end(), view.pixels().begin()),
              "repeatable image");
        view.draw(boxes, {1.2F, 28});
        check(!std::equal(original.begin(), original.end(), view.pixels().begin()),
              "camera changes image");
        std::array<Box, 2> overlap = {Box{{0, 0, 0}, {3, 3, 3}, {255, 0, 0}},
                                      Box{{0, 0, 4}, {1, 1, 1}, {0, 255, 0}}};
        view.draw(overlap);
        const std::vector<u8> first(view.pixels().begin(), view.pixels().end());
        std::reverse(overlap.begin(), overlap.end());
        view.draw(overlap);
        check(std::equal(first.begin(), first.end(), view.pixels().begin()),
              "depth ignores submission order for separated surfaces");
        bool rejected = false;
        try {
            view.draw(boxes, {std::numeric_limits<float>::quiet_NaN(), 28});
        } catch (const std::invalid_argument &) {
            rejected = true;
        }
        check(rejected, "reject nonfinite camera");
        boxes[0].size.x = 0;
        rejected = false;
        try {
            view.draw(boxes);
        } catch (const std::invalid_argument &) {
            rejected = true;
        }
        check(rejected, "reject degenerate box");

        {
            // draw_bar is a 2D screen-space overlay: a background-color
            // fill, then a foreground-color fill over the ratio-scaled
            // left portion, ignoring depth and camera entirely. `boxes[0]`
            // was made degenerate just above, so a fresh, valid box
            // establishes the frame draw_bar needs instead of reusing it.
            std::array<Box, 1> frame_source{Box{{0, 0, 0}, {1, 1, 1}, {255, 255, 255}}};
            view.draw(frame_source);
            const auto sample = [&](int px, int py) {
                const auto index = static_cast<usize>((py * BoxView::width + px) * 4);
                return std::array<u8, 3>{view.pixels()[index], view.pixels()[index + 1],
                                          view.pixels()[index + 2]};
            };
            const std::array<u8, 3> fill{200, 70, 70};
            const std::array<u8, 3> background{40, 40, 44};
            view.draw_bar(20, 20, 200, 16, 0.5F, fill);
            check(sample(20, 25) == fill, "a half-full bar's left half is the fill color");
            check(sample(219, 25) == background,
                  "a half-full bar's right half is the background color");
            view.draw_bar(20, 20, 200, 16, 1.0F, fill);
            check(sample(219, 25) == fill, "a full bar (ratio 1.0) fills the entire width");
            view.draw_bar(20, 20, 200, 16, 0.0F, fill);
            check(sample(20, 25) == background, "an empty bar (ratio 0.0) is all background");
            view.draw_bar(20, 20, 200, 16, 2.5F, fill);
            check(sample(219, 25) == fill, "an out-of-range ratio is clamped, not rejected");

            rejected = false;
            try {
                view.draw_bar(700, 20, 200, 16, 0.5F, fill); // 700+200 > width (800)
            } catch (const std::invalid_argument &) {
                rejected = true;
            }
            check(rejected, "reject a bar that would draw outside the frame");
            rejected = false;
            try {
                view.draw_bar(20, 20, 200, 16, std::numeric_limits<float>::quiet_NaN(), fill);
            } catch (const std::invalid_argument &) {
                rejected = true;
            }
            check(rejected, "reject a non-finite ratio");
            rejected = false;
            try {
                BoxView fresh;
                fresh.draw_bar(0, 0, 10, 10, 0.5F, fill);
            } catch (const std::invalid_argument &) {
                rejected = true;
            }
            check(rejected, "reject drawing a bar before any frame exists");
        }

        {
            // Scene::enemy_health_ratio() mirrors the combat test's own
            // attack_damage math (20 per hit out of 60 max), and returns
            // nullopt once the enemy is gone rather than a stale ratio.
            playground::Scene hud;
            InputState hud_input;
            key(hud_input, Key::d, true);
            key(hud_input, Key::w, true);
            for (int tick = 0; tick < 38; ++tick) {
                hud.step({0, std::chrono::nanoseconds{16666667}, hud_input});
                hud_input.begin_frame();
            }
            key(hud_input, Key::d, false);
            key(hud_input, Key::w, false);
            check(hud.enemy_health_ratio().has_value() &&
                      std::abs(*hud.enemy_health_ratio() - 1.0F) < 0.0001F,
                  "full health reports a ratio of 1.0");
            const auto hud_attack = [&] {
                key(hud_input, Key::f, true);
                hud.step({0, std::chrono::nanoseconds{16666667}, hud_input});
                hud_input.begin_frame();
                key(hud_input, Key::f, false);
                hud.step({0, std::chrono::nanoseconds{16666667}, hud_input});
                hud_input.begin_frame();
            };
            hud_attack();
            check(hud.enemy_health_ratio().has_value() &&
                      std::abs(*hud.enemy_health_ratio() - 40.0F / 60.0F) < 0.0001F,
                  "one hit's ratio matches Health.current / Health.max");
            hud_attack();
            hud_attack();
            check(!hud.enemy_health_ratio().has_value(),
                  "a defeated enemy reports no ratio, not a stale one");
        }

        std::cout << "Playground actions, lifecycle, camera, raster repeatability, depth and "
                     "validation passed.\n";
    } catch (const std::exception &e) {
        std::cerr << e.what() << '\n';
        return 1;
    }
}
