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

// Seconds after a perfect dodge in which an attack becomes a Shadow Step.
constexpr float shadow_step_window = 0.9F;
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

// Followers (melee.follow): where each slot stands from the leader (x to
// the leader's left, z behind), how far from the leader they'll fight, and
// how far behind they catch up at once.
constexpr float follow_leash = 16.0F;
constexpr float follow_teleport = 28.0F;
engine::Vec3 follow_offset(int slot) {
    switch (slot) {
    case 1:
        return {-1.6F, 0, 1.4F};
    case 2:
        return {0, 0, 2.4F};
    default:
        return {1.6F, 0, 1.4F};
    }
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
        // The attacker's stats (melee.tune): STR, INT for skills, SEN's crits.
        bool crit = false;
        if (result.damage > 0) {
            result.damage *= fighter.stat_damage * (move.mana > 0 ? fighter.stat_skill : 1.0F);
            if (fighter.stat_crit > 0 && result.outcome == HitOutcome::hit) {
                auto &seed = fighter.crit_seed;
                seed ^= seed << 13U;
                seed ^= seed >> 17U;
                seed ^= seed << 5U;
                crit = static_cast<float>(seed % 10000U) < fighter.stat_crit * 10000.0F;
                if (crit)
                    result.damage *= 1.5F;
            }
        }
        const bool broke =
            defender && engine::gameplay::take_hit(defender->state, defender->moves, defender->settings, result);
        // A perfect dodge opens the dodger's Shadow Step on this attacker.
        if (defender && result.outcome == HitOutcome::dodged && move_index(defender->moves, "shadow_step") >= 0) {
            defender->counter_window = shadow_step_window;
            defender->counter_target = self;
        }
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
                      (result.kind == StunKind::heavy || result.kind == StunKind::guard_break ? melee_heavy : 0) |
                      (crit ? melee_crit : 0);
        if (result.damage > 0) {
            const auto *health = w.get<Health>(other);
            const bool lethal = health && health->current <= result.damage;
            apply_damage(w, other, result.damage, self);
            if (lethal)
                event.flags |= melee_killed;
        }
        push_melee(event);
        if (broke) {
            MeleeEvent breaking = event;
            breaking.kind = MeleeEventKind::broken;
            push_melee(breaking);
        }
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
    static const char *const button_actions[]{"light",  "heavy",  "kick",   "special", "dodge",
                                              "skill1", "skill2", "skill3", "ultimate"};
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
            if (fighter.leader && !w.alive(*fighter.leader))
                fighter.leader.reset();
            const engine::Box *leader_box = fighter.leader ? w.get<engine::Box>(*fighter.leader) : nullptr;
            for (const auto other : w.query<engine::Box, Health>()) {
                if (other == self || !alive_target(w, other))
                    continue;
                const int their_team = team_of(w, other);
                if (player ? their_team == 0 : their_team < 0 || their_team == my_team)
                    continue;
                const auto &their_box = *w.get<engine::Box>(other);
                // A follower fights near its leader, not across the map.
                if (leader_box && flat_distance(leader_box->center, their_box.center) > follow_leash)
                    continue;
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
            // Nothing to fight: back to its slot behind its leader.
            if (!target_box && fighter.leader && state.mode == FighterMode::idle) {
                if (const auto *leader_box = w.get<engine::Box>(*fighter.leader)) {
                    const auto *leader_fighter = w.get<Fighter>(*fighter.leader);
                    const float leader_yaw = leader_fighter ? leader_fighter->yaw : fighter.yaw;
                    const auto ahead = facing_of(leader_yaw);
                    const engine::Vec3 side{ahead.z, 0, -ahead.x}; // the leader's left
                    const auto slot = follow_offset(fighter.follow_slot);
                    const engine::Vec3 goal{leader_box->center.x + side.x * slot.x - ahead.x * slot.z, box.center.y,
                                            leader_box->center.z + side.z * slot.x - ahead.z * slot.z};
                    const float gap = flat_distance(box.center, goal);
                    held = {};
                    held.airborne = !grounded;
                    if (gap > follow_teleport) {
                        // Left far behind (the leader went through a door, or
                        // to another place): there at once.
                        box.center = goal;
                        body.velocity = {0, body.velocity.y, 0};
                    } else if (gap > 0.8F) {
                        fighter.yaw = turn_toward(fighter.yaw, yaw_to(box.center, goal), 10.0F);
                        held.move_y = std::min(1.0F, gap / 1.5F);
                        held.sprinting = gap > 5.0F;
                    } else {
                        fighter.yaw = turn_toward(fighter.yaw, leader_yaw, 4.0F);
                    }
                }
            }
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

        // ---- Shadow Step: an attack soon after a perfect dodge steps behind
        // the attacker and strikes, cutting the dodge short.
        if (fighter.counter_window > 0) {
            fighter.counter_window -= tick_dt;
            const bool attack = held.pressed[static_cast<int>(engine::gameplay::MeleeButton::light)] ||
                                held.pressed[static_cast<int>(engine::gameplay::MeleeButton::heavy)];
            const bool free = state.mode == FighterMode::idle || state.mode == FighterMode::move ||
                              state.mode == FighterMode::block;
            if (attack && free && fighter.counter_target && alive_target(w, *fighter.counter_target)) {
                const auto &their_box = *w.get<engine::Box>(*fighter.counter_target);
                const auto *their_fighter = w.get<Fighter>(*fighter.counter_target);
                const auto behind = their_fighter ? facing_of(their_fighter->yaw)
                                                  : facing_of(yaw_to(box.center, their_box.center) + pi);
                const float gap = half_width(their_box) + half_width(box) + 0.3F;
                box.center.x = their_box.center.x - behind.x * gap;
                box.center.z = their_box.center.z - behind.z * gap;
                body.velocity = {0, body.velocity.y, 0};
                fighter.yaw = yaw_to(box.center, their_box.center);
                fighter.script_move = "shadow_step";
                fighter.script_interrupt = true;
                for (auto &button : held.pressed)
                    button = false;
                fighter.counter_window = 0;
            }
        }

        // ---- The state machine (a script's melee.perform goes first).
        engine::gameplay::FighterTick tick;
        if (!fighter.script_move.empty()) {
            const int index = move_index(fighter.moves, fighter.script_move);
            fighter.script_move.clear();
            const bool interrupt = fighter.script_interrupt;
            fighter.script_interrupt = false;
            if (engine::gameplay::force_move(state, fighter.moves, index, interrupt))
                tick.started = index;
        }
        if (tick.started < 0) {
            const auto stepped =
                engine::gameplay::update_fighter(state, fighter.moves, fighter.settings, held, tick_dt * fighter.stat_speed);
            tick = stepped;
        } else {
            engine::gameplay::update_fighter(state, fighter.moves, fighter.settings, {}, tick_dt * fighter.stat_speed);
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
            shot.damage = move.damage * fighter.stat_damage * (move.mana > 0 ? fighter.stat_skill : 1.0F);
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
        const bool locked = index >= 0 && static_cast<std::size_t>(index) < state.locked.size() &&
                            state.locked[static_cast<std::size_t>(index)];
        const bool ok = !locked && (index >= 0 && engine::gameplay::can_start(state, fighter->moves, index, {}, {})
                                        ? true
                                        : index >= 0 && state.mode != FighterMode::stun && state.mode != FighterMode::dead);
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
    } else if (op == "unlock") {
        const int index = move_index(fighter->moves, text);
        if (index >= 0 && static_cast<std::size_t>(index) < state.locked.size())
            state.locked[static_cast<std::size_t>(index)] = 0;
        out = {index >= 0 ? 1.0 : 0.0};
    } else if (op == "stagger") {
        out = {fighter->settings.poise > 0 ? state.stagger / fighter->settings.poise : 0.0,
               state.broken > 0 ? 1.0 : 0.0};
    } else if (op == "tune") {
        // damage, speed, crit chance, skill power, health max, mana max;
        // a negative or non-finite value leaves that one as it is.
        const auto arg = [&args](std::size_t i, float lo, float hi, float &into) {
            if (i < args.size() && std::isfinite(args[i]) && args[i] >= 0)
                into = std::clamp(static_cast<float>(args[i]), lo, hi);
        };
        arg(0, 0.1F, 10.0F, fighter->stat_damage);
        arg(1, 0.5F, 2.0F, fighter->stat_speed);
        arg(2, 0.0F, 1.0F, fighter->stat_crit);
        arg(3, 0.1F, 10.0F, fighter->stat_skill);
        if (args.size() > 4 && std::isfinite(args[4]) && args[4] > 0) {
            if (auto *health = world.get<Health>(self)) {
                const float ratio = health->max > 0 ? health->current / health->max : 1.0F;
                health->max = static_cast<float>(args[4]);
                health->current = std::max(1.0F, std::min(health->max, ratio * health->max));
            }
        }
        if (args.size() > 5 && std::isfinite(args[5]) && args[5] > 0) {
            fighter->settings.mana_max = static_cast<float>(args[5]);
            state.mana = std::min(state.mana, fighter->settings.mana_max);
        }
        out = {fighter->stat_damage, fighter->stat_speed, fighter->stat_crit, fighter->stat_skill};
    } else if (op == "mana") {
        // melee.mana(add?): adds mana (a potion; capped at its max) and
        // returns what it has and its max.
        if (!args.empty())
            state.mana = std::clamp(state.mana + static_cast<float>(args[0]), 0.0F, fighter->settings.mana_max);
        out = {state.mana, fighter->settings.mana_max};
    } else if (op == "revive") {
        // melee.revive(): back on its feet at full health, out of any move,
        // stun or fall. A fighter that was defeated but not yet removed (it
        // lies there 4 s) is kept: a script can pool its enemies and reuse
        // them instead of spawning new ones. Unlocked moves stay unlocked.
        if (auto *health = world.get<Health>(self))
            health->current = health->max;
        auto locked = state.locked;
        state = engine::gameplay::make_fighter_state(fighter->moves, fighter->settings);
        state.locked = std::move(locked);
        fighter->dying = 0;
        fighter->slide = {};
        fighter->script_move.clear();
        fighter->counter_window = 0;
        out = {1.0};
    } else if (op == "follow") {
        // melee.follow(leader, slot): nil leader stops following.
        fighter->leader = other;
        fighter->follow_slot = args.empty() ? 0 : std::clamp(static_cast<int>(args[0]), 0, 2);
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
// GATEBREAKER fighter settings (0.80.0), after editor_set_melee: a poise
// (stagger) bar and how long a Break floors it (poise 0: none), the mana
// pool and its regeneration per second, a ranged brain's preferred distance
// (0: melee) and a shield-bearer's raised guard.
EXPORT void editor_set_melee_extra(int index, double poise, double break_time, double mana_max, double mana_regen,
                                   double range, int shield) {
    const auto target = staged(index);
    if (!target)
        return;
    auto *fighter = target->first->get<Fighter>(target->second);
    if (!fighter)
        return;
    const auto clamp = [](double v, double lo, double hi) { return static_cast<float>(std::isfinite(v) ? std::clamp(v, lo, hi) : lo); };
    fighter->settings.poise = clamp(poise, 0, 100000);
    fighter->settings.break_time = clamp(break_time, 0.5, 20);
    fighter->settings.mana_max = clamp(mana_max, 0, 100000);
    fighter->settings.mana_regen = clamp(mana_regen, 0, 1000);
    fighter->state.mana = fighter->settings.mana_max;
    fighter->brain_settings.range = clamp(range, 0, 60);
    fighter->brain_settings.shield = shield != 0;
}
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
    case F::mana: return fighter->settings.mana_max > 0 ? state.mana / fighter->settings.mana_max : 0;
    case F::stagger: return fighter->settings.poise > 0 ? state.stagger / fighter->settings.poise : -1;
    case F::broken: return state.broken;
    case F::windup: return move && state.time < move->hit_start && (move->damage > 0 || move->projectile > 0) ? move->hit_start - state.time : -1;
    case F::red: return move && (move->unblockable || move->guardbreak) ? 1 : 0;
    case F::aoe: return move ? move->aoe : 0;
    case F::slot_skill1:
    case F::slot_skill2:
    case F::slot_skill3:
    case F::slot_ultimate: {
        const auto button = static_cast<engine::gameplay::MeleeButton>(
            static_cast<int>(engine::gameplay::MeleeButton::skill1) + field - static_cast<int>(F::slot_skill1));
        for (std::size_t i = 0; i < fighter->moves.size(); ++i) {
            const auto &m = fighter->moves[i];
            if (m.input != button || !m.from_neutral)
                continue;
            if (i < state.locked.size() && state.locked[i])
                return -2;
            if (state.mana + 1e-4F < m.mana || state.energy + 1e-4F < m.energy)
                return -3;
            const float left = i < state.cooldowns.size() ? state.cooldowns[i] : 0.0F;
            return m.cooldown > 0 ? std::clamp(left / m.cooldown, 0.0F, 1.0F) : 0.0;
        }
        return -1;
    }
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
