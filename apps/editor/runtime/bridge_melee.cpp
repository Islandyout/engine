// Melee (0.78.0): the fixed-tick fighter system (Runtime::step_melee) and the
// editor runtime exports for fighters. The moves, state machine and brain
// are engine::gameplay's (include/engine/gameplay/melee.hpp); this file puts
// them in the world -- input, facing, lunges, hit spheres, knockback.
#include "bridge_runtime.hpp"

namespace editor_bridge {
namespace {
using engine::gameplay::FighterMode;
using engine::gameplay::HitOutcome;
using engine::gameplay::MeleeButton;
using engine::gameplay::StunKind;

constexpr float tick_dt = 1.0F / 60.0F;
constexpr float pi = 3.14159265F;

float wrap_angle(float a) { return std::atan2(std::sin(a), std::cos(a)); }

// Turns `yaw` toward `goal` by at most `rate * dt` radians.
float turn_toward(float yaw, float goal, float rate) {
    const float diff = wrap_angle(goal - yaw);
    const float step = rate * tick_dt;
    return wrap_angle(yaw + std::clamp(diff, -step, step));
}

engine::Vec3 facing_of(float yaw) { return {std::sin(yaw), 0, std::cos(yaw)}; }

float flat_distance(engine::Vec3 a, engine::Vec3 b) { return std::hypot(b.x - a.x, b.z - a.z); }

float yaw_to(engine::Vec3 from, engine::Vec3 to) { return std::atan2(to.x - from.x, to.z - from.z); }

float half_width(const engine::Box &box) { return std::max(box.size.x, box.size.z) / 2; }

// Squared distance from a point to a box.
float distance_sq(engine::Vec3 p, const engine::Box &box) {
    const auto axis = [](float v, float c, float h) {
        const float d = std::max(std::abs(v - c) - h, 0.0F);
        return d * d;
    };
    return axis(p.x, box.center.x, box.size.x / 2) + axis(p.y, box.center.y, box.size.y / 2) +
           axis(p.z, box.center.z, box.size.z / 2);
}

bool alive_target(const engine::World &w, engine::Entity entity) {
    if (!w.alive(entity))
        return false;
    const auto *health = w.get<Health>(entity);
    if (!health || health->current <= 0)
        return false;
    const auto *fighter = w.get<Fighter>(entity);
    return !fighter || fighter->state.mode != FighterMode::dead;
}

int move_index(const std::vector<engine::gameplay::MoveDef> &moves, const std::string &name) {
    for (std::size_t i = 0; i < moves.size(); ++i)
        if (moves[i].name == name)
            return static_cast<int>(i);
    return -1;
}
} // namespace

void Runtime::melee_strike(engine::World &w, engine::Entity self, Fighter &fighter) {
    const auto &move = fighter.moves[static_cast<std::size_t>(fighter.state.move)];
    const auto &box = *w.get<engine::Box>(self);
    const auto facing = facing_of(fighter.yaw);
    const float feet = box.center.y - box.size.y / 2;
    const engine::Vec3 point = move.aoe > 0 ? box.center
                                            : engine::Vec3{box.center.x + facing.x * move.reach,
                                                           feet + box.size.y * move.height,
                                                           box.center.z + facing.z * move.reach};
    const float radius = move.aoe > 0 ? move.aoe : move.radius;
    const int my_team = team_of(w, self);
    for (const auto other : w.query<engine::Box, Health>()) {
        if (other == self || !alive_target(w, other))
            continue;
        if (std::find(fighter.struck.begin(), fighter.struck.end(), other) != fighter.struck.end())
            continue;
        const int their_team = team_of(w, other);
        if (my_team >= 0 && their_team == my_team)
            continue;
        const auto &their_box = *w.get<engine::Box>(other);
        if (distance_sq(point, their_box) > radius * radius)
            continue;
        fighter.struck.push_back(other);
        auto *defender = w.get<Fighter>(other);
        auto *their_body = w.get<engine::physics::RigidBody>(other);
        // From the front: the attacker stands within 70 degrees of where the
        // defender faces.
        bool from_front = false;
        if (defender) {
            const auto to_attacker = engine::Vec3{box.center.x - their_box.center.x, 0, box.center.z - their_box.center.z};
            const float length = std::hypot(to_attacker.x, to_attacker.z);
            const auto their_facing = facing_of(defender->yaw);
            from_front = length < 1e-4F ||
                         (to_attacker.x * their_facing.x + to_attacker.z * their_facing.z) / length > 0.34F;
        }
        const bool airborne = their_body && !their_body->grounded;
        auto result = engine::gameplay::resolve_hit(move, fighter.state.combo, defender ? &defender->state : nullptr,
                                                    defender ? &defender->moves : nullptr,
                                                    defender ? &defender->settings : nullptr, from_front, airborne);
        if (defender)
            engine::gameplay::take_hit(defender->state, defender->moves, defender->settings, result);
        engine::gameplay::land_hit(fighter.state, move, fighter.settings, result);
        // Knockback away from the attacker, along the ground.
        engine::Vec3 away{their_box.center.x - box.center.x, 0, their_box.center.z - box.center.z};
        const float away_length = std::hypot(away.x, away.z);
        away = away_length > 1e-4F ? engine::Vec3{away.x / away_length, 0, away.z / away_length} : facing;
        if (result.outcome != HitOutcome::dodged && result.outcome != HitOutcome::parried) {
            if (defender) {
                defender->slide = {away.x * result.knockback, 0, away.z * result.knockback};
                if (result.launch > 0)
                    defender->pending_launch = result.launch;
            } else if (their_body && their_body->type == engine::physics::BodyType::Dynamic) {
                their_body->velocity.x += away.x * result.knockback;
                their_body->velocity.z += away.z * result.knockback;
                their_body->velocity.y += result.launch;
            }
        }
        MeleeEvent event;
        event.kind = result.outcome == HitOutcome::hit           ? MeleeEventKind::hit
                     : result.outcome == HitOutcome::blocked     ? MeleeEventKind::blocked
                     : result.outcome == HitOutcome::parried     ? MeleeEventKind::parried
                     : result.outcome == HitOutcome::guard_break ? MeleeEventKind::guard_break
                                                                 : MeleeEventKind::dodged;
        event.attacker = index_of(self);
        event.target = index_of(other);
        // The impact: where the blow meets the target's box.
        event.point = {std::clamp(point.x, their_box.center.x - their_box.size.x / 2, their_box.center.x + their_box.size.x / 2),
                       std::clamp(point.y, their_box.center.y - their_box.size.y / 2, their_box.center.y + their_box.size.y / 2),
                       std::clamp(point.z, their_box.center.z - their_box.size.z / 2, their_box.center.z + their_box.size.z / 2)};
        event.value = result.damage;
        event.move = fighter.state.move;
        event.flags = (move.finisher ? melee_finisher : 0) | (result.kind == StunKind::launched ? melee_launch : 0) |
                      (result.kind == StunKind::knockdown ? melee_knockdown : 0) |
                      (result.kind == StunKind::heavy || result.kind == StunKind::guard_break ? melee_heavy : 0);
        if (result.damage > 0) {
            const auto *health = w.get<Health>(other);
            const bool lethal = health && health->current <= result.damage;
            apply_damage(w, other, result.damage, self);
            if (lethal)
                event.flags |= melee_killed;
        }
        push_melee(event);
        const auto name = [&w](engine::Entity entity) {
            const auto *n = w.get<EntityName>(entity);
            return n ? n->value : std::string{};
        };
        static const char *const outcomes[]{"hit", "blocked", "parried", "dodged", "guard_break"};
        script_runtime.notify_melee_hit(w, self, other, move.name, result.damage,
                                        outcomes[static_cast<int>(result.outcome)], name(other));
        if (result.outcome == HitOutcome::parried)
            break; // a parried attacker stops striking
    }
}

void Runtime::step_melee(engine::World &w) {
    // The Player's buttons this tick.
    const auto pressed = [this](const char *name) { return actions.state(engine::ActionId{name}).pressed; };
    static const char *const button_actions[]{"light", "heavy", "kick", "special", "dodge"};
    for (const auto self : w.query<Fighter, engine::Box, engine::physics::RigidBody>()) {
        if (stowed(self))
            continue;
        auto &fighter = *w.get<Fighter>(self);
        auto &box = *w.get<engine::Box>(self);
        auto &body = *w.get<engine::physics::RigidBody>(self);
        auto *controller = w.get<Controller>(self);
        const bool player = w.get<PlayerMarker>(self) != nullptr;
        auto &state = fighter.state;
        if (state.mode == FighterMode::dead) {
            fighter.slide.x *= std::exp(-5.0F * tick_dt);
            fighter.slide.z *= std::exp(-5.0F * tick_dt);
            body.velocity.x = fighter.slide.x;
            body.velocity.z = fighter.slide.z;
            fighter.dying -= tick_dt;
            if (fighter.dying <= 0)
                w.defer_destroy(self);
            continue;
        }
        const int my_team = team_of(w, self);
        const bool grounded = controller ? controller->state.grounded || body.grounded : body.grounded;

        // ---- Who it fights.
        if (fighter.lock && !alive_target(w, *fighter.lock))
            fighter.lock.reset();
        fighter.target.reset();
        if (fighter.lock) {
            fighter.target = fighter.lock;
        } else {
            // The nearest hostile: anything with Health for the Player (dummies
            // included), other teams for everyone else. The Player only
            // auto-targets within striking distance, ahead of it.
            float best = player ? 4.5F : 30.0F;
            for (const auto other : w.query<engine::Box, Health>()) {
                if (other == self || !alive_target(w, other))
                    continue;
                const int their_team = team_of(w, other);
                if (player ? their_team == 0 : their_team < 0 || their_team == my_team)
                    continue;
                const auto &their_box = *w.get<engine::Box>(other);
                const float distance = flat_distance(box.center, their_box.center);
                if (player && std::abs(wrap_angle(yaw_to(box.center, their_box.center) - fighter.yaw)) > 1.9F)
                    continue;
                if (distance < best) {
                    best = distance;
                    fighter.target = other;
                }
            }
        }
        const engine::Box *target_box = fighter.target ? w.get<engine::Box>(*fighter.target) : nullptr;
        const Fighter *target_fighter = fighter.target ? w.get<Fighter>(*fighter.target) : nullptr;

        // ---- Input: the Player's actions, or the brain.
        engine::gameplay::FighterInput held;
        held.airborne = !grounded;
        float wish_x = 0, wish_z = 0; // world-space stick
        if (player) {
            for (int b = 0; b < engine::gameplay::melee_button_count; ++b)
                held.pressed[b] = pressed(button_actions[b]);
            held.block = actions.state(engine::ActionId{"block"}).down();
            held.sprinting = controller && controller->state.sprinting;
            if (pressed("lock")) {
                if (fighter.lock) {
                    fighter.lock.reset();
                } else {
                    // Lock onto the hostile nearest the facing within 15 m.
                    float best = 1e9F;
                    for (const auto other : w.query<engine::Box, Health>()) {
                        if (other == self || !alive_target(w, other) || team_of(w, other) == 0)
                            continue;
                        const auto &their_box = *w.get<engine::Box>(other);
                        const float distance = flat_distance(box.center, their_box.center);
                        const float off = std::abs(wrap_angle(yaw_to(box.center, their_box.center) - fighter.yaw));
                        // Fighters and soldiers before dummies and props.
                        const bool rival = w.get<Fighter>(other) || w.get<Soldier>(other);
                        const float score = distance + off * 4.0F + (rival ? 0.0F : 6.0F);
                        if (distance < 15.0F && score < best) {
                            best = score;
                            fighter.lock = other;
                        }
                    }
                }
            }
            const float move_x = actions.state(engine::ActionId{"move_x"}).value;
            const float move_y = actions.state(engine::ActionId{"move_y"}).value;
            const float yaw = controller && controller->first_person
                                  ? look_yaw
                                  : std::atan2(-camera_forward_x, -camera_forward_z);
            wish_x = std::cos(yaw) * move_x - std::sin(yaw) * move_y;
            wish_z = -std::sin(yaw) * move_x - std::cos(yaw) * move_y;
        } else if (fighter.ai) {
            engine::gameplay::BrainView view;
            // One attacker at a time per target: the others wait their turn.
            if (fighter.target && fighter.brain.chain_left == 0 && state.mode != FighterMode::move)
                for (const auto other : w.query<Fighter>()) {
                    if (other == self)
                        continue;
                    const auto &rival = *w.get<Fighter>(other);
                    if (rival.ai && rival.target == fighter.target && rival.team == fighter.team &&
                        (rival.brain.chain_left > 0 || rival.state.mode == FighterMode::move)) {
                        view.wait_turn = true;
                        break;
                    }
                }
            if (target_box) {
                view.has_target = true;
                view.distance = flat_distance(box.center, target_box->center);
                view.bearing = wrap_angle(yaw_to(box.center, target_box->center) - fighter.yaw);
                view.reach = fighter.reach + half_width(box) + half_width(*target_box) - 0.3F;
                if (target_fighter) {
                    const auto &ts = target_fighter->state;
                    if (ts.mode == FighterMode::move) {
                        const auto &tm = target_fighter->moves[static_cast<std::size_t>(ts.move)];
                        view.target_attacking = (tm.damage > 0 || tm.projectile > 0) && ts.time < tm.hit_start;
                        view.target_reach = tm.reach + tm.aoe + half_width(*target_box);
                    }
                    view.target_down = ts.mode == FighterMode::down || ts.mode == FighterMode::getup;
                    view.target_airborne = ts.mode == FighterMode::airborne;
                }
            }
            held = engine::gameplay::think(fighter.brain, fighter.brain_settings, view, state, tick_dt);
            held.airborne = !grounded;
            held.sprinting = view.distance > 6.0F && held.move_y > 0.5F;
            const auto facing = facing_of(fighter.yaw);
            const engine::Vec3 right{-facing.z, 0, facing.x};
            wish_x = facing.x * held.move_y + right.x * held.move_x;
            wish_z = facing.z * held.move_y + right.z * held.move_x;
            // Its feet: the same controller the Player walks with.
            if (controller) {
                engine::gameplay::ControllerInput intent;
                const bool free = state.mode == FighterMode::idle || state.mode == FighterMode::block;
                intent.move_x = free ? held.move_x * (state.mode == FighterMode::block ? 0.35F : 1.0F) : 0;
                intent.move_y = free ? held.move_y * (state.mode == FighterMode::block ? 0.35F : 1.0F) : 0;
                intent.sprint = free && held.sprinting;
                intent.yaw = fighter.yaw + pi;
                engine::gameplay::begin_step(w, self, controller->state, controller->settings, intent,
                                             physics_config.gravity * body.gravity_scale, tick_dt);
            }
        }
        // The stick relative to the facing, for sequences and dodges.
        if (player) {
            const auto facing = facing_of(fighter.yaw);
            held.move_y = wish_x * facing.x + wish_z * facing.z;
            held.move_x = -(wish_x * facing.z - wish_z * facing.x);
        }
        const float wish_length = std::hypot(wish_x, wish_z);

        // ---- The state machine (a script's melee.perform goes first).
        engine::gameplay::FighterTick tick;
        if (!fighter.script_move.empty()) {
            const int index = move_index(fighter.moves, fighter.script_move);
            fighter.script_move.clear();
            if (engine::gameplay::force_move(state, fighter.moves, index))
                tick.started = index;
        }
        if (tick.started < 0) {
            const auto stepped = engine::gameplay::update_fighter(state, fighter.moves, fighter.settings, held, tick_dt);
            tick = stepped;
        } else {
            engine::gameplay::update_fighter(state, fighter.moves, fighter.settings, {}, tick_dt);
        }

        // ---- Facing.
        if (tick.started >= 0) {
            const auto &move = fighter.moves[static_cast<std::size_t>(tick.started)];
            fighter.struck.clear();
            if (move.free_direction) {
                // Dodges go where the stick points (back, without one).
                fighter.yaw = wish_length > 0.2F ? std::atan2(wish_x, wish_z) : wrap_angle(fighter.yaw + pi);
            } else if (target_box &&
                       std::abs(wrap_angle(yaw_to(box.center, target_box->center) - fighter.yaw)) <=
                           move.track * pi / 180.0F + (fighter.lock ? pi : 0.0F)) {
                fighter.yaw = yaw_to(box.center, target_box->center);
            } else if (player && wish_length > 0.2F) {
                fighter.yaw = std::atan2(wish_x, wish_z);
            }
            fighter.lunge_dir = facing_of(fighter.yaw);
            MeleeEvent event{MeleeEventKind::start, index_of(self), -1, box.center, move.duration, tick.started, 0};
            event.flags = move.finisher ? melee_finisher : 0;
            push_melee(event);
        } else if (state.mode == FighterMode::idle || state.mode == FighterMode::block) {
            if (target_box && (fighter.lock || !player)) {
                fighter.yaw = turn_toward(fighter.yaw, yaw_to(box.center, target_box->center), 9.0F);
            } else if (player) {
                const float speed = std::hypot(body.velocity.x, body.velocity.z);
                if (speed > 0.3F)
                    fighter.yaw = turn_toward(fighter.yaw, std::atan2(body.velocity.x, body.velocity.z), 12.0F);
            }
        } else if (state.mode == FighterMode::move && target_box) {
            // A little tracking through the wind-up.
            const auto &move = fighter.moves[static_cast<std::size_t>(state.move)];
            if (!move.free_direction && state.time < move.hit_start && move.track > 0) {
                fighter.yaw = turn_toward(fighter.yaw, yaw_to(box.center, target_box->center), 3.0F);
                fighter.lunge_dir = facing_of(fighter.yaw);
            }
        }

        // ---- Movement: lunges, knockback slides, hit-stop.
        if (state.hitstop > 0) {
            body.velocity = {0, 0, 0};
        } else {
            if (fighter.pending_launch > 0) {
                body.velocity.y = fighter.pending_launch;
                fighter.pending_launch = 0;
            }
            if (state.mode == FighterMode::move) {
                float speed = engine::gameplay::lunge_speed(state, fighter.moves);
                const auto &move = fighter.moves[static_cast<std::size_t>(state.move)];
                // Don't walk through the target.
                if (target_box && !move.free_direction) {
                    const engine::Vec3 to{target_box->center.x - box.center.x, 0, target_box->center.z - box.center.z};
                    const float gap = std::hypot(to.x, to.z) - half_width(box) - half_width(*target_box);
                    if (gap < 0.25F && to.x * fighter.lunge_dir.x + to.z * fighter.lunge_dir.z > 0)
                        speed = 0;
                }
                if (speed > 0 || grounded) {
                    body.velocity.x = fighter.lunge_dir.x * speed;
                    body.velocity.z = fighter.lunge_dir.z * speed;
                }
                if (move.air && body.velocity.y < 0)
                    body.velocity.y *= 0.5F; // air strikes hang a moment
            } else if (state.mode != FighterMode::idle && state.mode != FighterMode::block) {
                body.velocity.x = fighter.slide.x;
                body.velocity.z = fighter.slide.z;
            }
            const float decay = std::exp(-(grounded ? 6.0F : 1.5F) * tick_dt);
            fighter.slide.x *= decay;
            fighter.slide.z *= decay;
        }
        // Launched fighters land (and lie down).
        if (state.mode == FighterMode::airborne && grounded && body.velocity.y <= 0.01F && state.time > 0.15F &&
            fighter.pending_launch <= 0) {
            engine::gameplay::touch_ground(state);
            push_melee({MeleeEventKind::land, index_of(self), -1, box.center, 0, -1, 0});
        }

        // ---- Blows.
        if (tick.hit && state.mode == FighterMode::move)
            melee_strike(w, self, fighter);
        if (tick.fire && state.mode == FighterMode::move) {
            const auto &move = fighter.moves[static_cast<std::size_t>(state.move)];
            const auto facing = facing_of(fighter.yaw);
            const engine::Vec3 origin{box.center.x + facing.x * (half_width(box) + 0.4F),
                                      box.center.y + box.size.y * 0.15F,
                                      box.center.z + facing.z * (half_width(box) + 0.4F)};
            const auto projectile = w.defer_create();
            w.defer_set(projectile, engine::Box{origin, engine::Vec3{0.45F, 0.45F, 0.45F}});
            Projectile shot{{facing.x * move.projectile, 0, facing.z * move.projectile}, self};
            shot.damage = move.damage;
            shot.lifetime = 1.6F;
            w.defer_set(projectile, shot);
            push_melee({MeleeEventKind::fire, index_of(self), -1, origin, move.projectile, state.move, 0});
        }
    }
}
bool BridgeHost::melee(engine::World &world, engine::Entity self, const std::string &op,
                       const std::vector<double> &args, const std::string &text, std::optional<engine::Entity> other,
                       std::vector<double> &out, std::string &text_out, std::optional<engine::Entity> &other_out) {
    auto *fighter = world.get<Fighter>(self);
    if (!fighter)
        return false;
    auto &state = fighter->state;
    if (op == "perform") {
        const int index = move_index(fighter->moves, text);
        const bool ok = index >= 0 && engine::gameplay::can_start(state, fighter->moves, index, {}, {}) ? true
                        : index >= 0 && state.mode != FighterMode::stun && state.mode != FighterMode::dead;
        if (ok)
            fighter->script_move = text;
        out = {ok ? 1.0 : 0.0};
    } else if (op == "state") {
        static const char *const modes[]{"idle", "move", "block", "stun", "airborne", "down", "getup", "dead"};
        text_out = modes[static_cast<int>(state.mode)];
        out = {static_cast<double>(state.combo), state.energy, fighter->settings.energy_max,
               state.guard / fighter->settings.guard_max};
    } else if (op == "move") {
        text_out = state.mode == FighterMode::move ? fighter->moves[static_cast<std::size_t>(state.move)].name : "";
    } else if (op == "set_energy") {
        if (!args.empty() && std::isfinite(args[0]))
            state.energy = std::clamp(static_cast<float>(args[0]), 0.0F, fighter->settings.energy_max);
    } else if (op == "lock") {
        fighter->lock = other;
    } else if (op == "target") {
        other_out = fighter->target;
    } else if (op == "set_ai") {
        fighter->ai = !args.empty() && args[0] != 0 && !world.get<PlayerMarker>(self);
        if (args.size() > 1 && args[1] >= 0)
            fighter->brain_settings.aggression = std::clamp(static_cast<float>(args[1]), 0.0F, 1.0F);
        if (args.size() > 2 && args[2] >= 0)
            fighter->brain_settings.skill = std::clamp(static_cast<float>(args[2]), 0.0F, 1.0F);
    } else {
        return false;
    }
    return true;
}
} // namespace editor_bridge

extern "C" {
// Makes the entity a melee fighter (0.78.0), after editor_add for the same
// index: style 0 martial arts, 1 sword, 2 the `moves` text (see
// engine::gameplay::parse_moves); team (0 = the Player's side); ai 1 for a
// melee brain with aggression and skill 0..1 and a reaction time; the
// energy it starts with and its guard. Invalid text falls back to martial
// arts and editor_melee_error() says why. A brain-driven fighter walks
// through a CharacterController sized to its Box (added if missing) and
// replaces any AIState wander/chase.
EXPORT void editor_set_melee(int index, int style, const char *moves, double team, int ai, double aggression,
                             double skill, double reaction, double energy, double guard) {
    const auto target = staged(index);
    if (!target)
        return;
    auto &world = *target->first;
    const auto entity = target->second;
    const auto *box = world.get<engine::Box>(entity);
    if (!box || !world.get<engine::physics::RigidBody>(entity))
        return;
    for (const double v : {team, aggression, skill, reaction, energy, guard})
        if (!std::isfinite(v)) {
            failed = true;
            return;
        }
    Fighter fighter;
    auto parsed = engine::gameplay::parse_moves(style == 1   ? engine::gameplay::sword_moves_text
                                                : style == 2 && moves ? moves
                                                                      : engine::gameplay::default_moves_text);
    if (!parsed.error.empty()) {
        staging->melee_error = parsed.error;
        parsed = engine::gameplay::parse_moves(engine::gameplay::default_moves_text);
    }
    fighter.moves = std::move(parsed.moves);
    fighter.settings.guard_max = static_cast<float>(std::clamp(guard, 1.0, 100000.0));
    fighter.state = engine::gameplay::make_fighter_state(fighter.moves, fighter.settings);
    fighter.state.energy = static_cast<float>(std::clamp(energy, 0.0, static_cast<double>(fighter.settings.energy_max)));
    fighter.team = world.get<PlayerMarker>(entity) ? 0 : static_cast<int>(std::clamp(team, 0.0, 15.0));
    fighter.ai = ai != 0 && !world.get<PlayerMarker>(entity);
    fighter.brain_settings.aggression = static_cast<float>(std::clamp(aggression, 0.0, 1.0));
    fighter.brain_settings.skill = static_cast<float>(std::clamp(skill, 0.0, 1.0));
    fighter.brain_settings.reaction = static_cast<float>(std::clamp(reaction, 0.0, 5.0));
    fighter.brain.rng = 0x2545F491U + static_cast<std::uint32_t>(index + 2) * 2654435761U;
    // Typical reach: the median of its strikes'.
    std::vector<float> reaches;
    for (const auto &move : fighter.moves)
        if (move.damage > 0 && move.aoe <= 0 && move.projectile <= 0)
            reaches.push_back(move.reach);
    if (!reaches.empty()) {
        std::nth_element(reaches.begin(), reaches.begin() + static_cast<std::ptrdiff_t>(reaches.size() / 2), reaches.end());
        fighter.reach = reaches[reaches.size() / 2];
    }
    world.set(entity, fighter);
    if (fighter.ai && !world.get<Controller>(entity)) {
        Controller controller;
        controller.first_person = false;
        controller.settings.walk_speed = 3.2F;
        controller.settings.sprint_speed = 6.0F;
        controller.settings.stand_height = controller.settings.crouch_height = box->size.y;
        controller.settings.radius = std::max(box->size.x, box->size.z) / 2;
        controller.settings.step_height = 0.35F;
        world.set(entity, controller);
    }
    if (fighter.ai && world.get<AIAgent>(entity))
        world.remove<AIAgent>(entity);
}
EXPORT const char *editor_melee_error() { return active->melee_error.c_str(); }
// Sets a fighter's starting facing (radians; it faces (sin, 0, cos)).
EXPORT void editor_set_melee_yaw(int index, double yaw) {
    const auto target = staged(index);
    if (!target || !std::isfinite(yaw))
        return;
    if (auto *fighter = target->first->get<Fighter>(target->second))
        fighter->yaw = static_cast<float>(yaw);
}
// Fighter state for the editor (FighterField in tools/bridge/fields.mjs); 0
// without a Fighter (-1 for the index fields).
EXPORT double editor_fighter_value(int index, int field) {
    using F = FighterField;
    const bool index_field = field == static_cast<int>(F::move) || field == static_cast<int>(F::lock_target) ||
                             field == static_cast<int>(F::target);
    if (index < 0 || static_cast<std::size_t>(index) >= active->entities.size())
        return index_field ? -1 : 0;
    const auto entity = active->entities[static_cast<std::size_t>(index)];
    const auto *fighter = active->world.alive(entity) ? active->world.get<Fighter>(entity) : nullptr;
    if (!fighter)
        return index_field ? -1 : 0;
    const auto &state = fighter->state;
    const auto *move = state.mode == FighterMode::move ? &fighter->moves[static_cast<std::size_t>(state.move)] : nullptr;
    switch (static_cast<F>(field)) {
    case F::has: return 1;
    case F::mode: return static_cast<int>(state.mode);
    case F::move: return state.mode == FighterMode::move ? state.move : -1;
    case F::progress: return move ? std::clamp(state.time / move->duration, 0.0F, 1.0F) : 0;
    case F::yaw: return fighter->yaw;
    case F::energy: return state.energy / fighter->settings.energy_max;
    case F::combo: return state.combo;
    case F::hitstop: return state.hitstop;
    case F::stun_kind: return static_cast<int>(state.stun_kind);
    case F::lock_target: return fighter->lock ? active->index_of(*fighter->lock) : -1;
    case F::guard: return state.guard / fighter->settings.guard_max;
    case F::invulnerable: return engine::gameplay::invulnerable(state, fighter->moves) ? 1 : 0;
    case F::time: return state.time;
    case F::target: return fighter->target ? active->index_of(*fighter->target) : -1;
    case F::active: return move && state.time >= move->hit_start && state.time <= move->hit_end && move->damage > 0 ? 1 : 0;
    case F::team: return fighter->team;
    case F::stun_left: return state.stun_left;
    }
    return 0;
}
// A fighter's move `move` (-1: the current one): field 0 name, 1 clip, 2 limb.
EXPORT const char *editor_fighter_text(int index, int move, int field) {
    static std::string result;
    result.clear();
    if (index >= 0 && static_cast<std::size_t>(index) < active->entities.size()) {
        const auto entity = active->entities[static_cast<std::size_t>(index)];
        const auto *fighter = active->world.alive(entity) ? active->world.get<Fighter>(entity) : nullptr;
        if (fighter) {
            const int which = move >= 0 ? move : fighter->state.mode == FighterMode::move ? fighter->state.move : -1;
            if (which >= 0 && static_cast<std::size_t>(which) < fighter->moves.size()) {
                const auto &m = fighter->moves[static_cast<std::size_t>(which)];
                result = field == 0 ? m.name : field == 1 ? m.clip : m.limb;
            }
        }
    }
    return result.c_str();
}
// Moves the melee event queue into a read buffer; returns its size.
std::vector<MeleeEvent> pending_melee_events;
EXPORT int editor_take_melee_events() {
    pending_melee_events = std::move(active->melee_events);
    active->melee_events.clear();
    return static_cast<int>(pending_melee_events.size());
}
// MeleeEventField: kind (start, hit, blocked, parried, dodged, guard_break,
// fire, land, ko), attacker and target indices, the point, value (damage;
// start: the move's seconds; fire: speed), move index and flags (1
// finisher, 2 launch, 4 knockdown, 8 heavy, 16 killed).
EXPORT double editor_melee_event(int index, int field) {
    if (index < 0 || static_cast<std::size_t>(index) >= pending_melee_events.size())
        return 0;
    const auto &e = pending_melee_events[static_cast<std::size_t>(index)];
    using F = MeleeEventField;
    switch (static_cast<F>(field)) {
    case F::kind: return static_cast<int>(e.kind);
    case F::attacker: return e.attacker;
    case F::target: return e.target;
    case F::x: return e.point.x;
    case F::y: return e.point.y;
    case F::z: return e.point.z;
    case F::value: return e.value;
    case F::move: return e.move;
    case F::flags: return e.flags;
    }
    return 0;
}
}
