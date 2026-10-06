#include "engine/gameplay/melee.hpp"

#include <cmath>
#include <iostream>
#include <stdexcept>
#include <string>

namespace {
void check(bool pass, const char *message) {
    if (!pass)
        throw std::runtime_error{message};
}
using namespace engine::gameplay;

constexpr float dt = 1.0F / 60.0F;

int find(const std::vector<MoveDef> &moves, const std::string &name) {
    for (std::size_t i = 0; i < moves.size(); ++i)
        if (moves[i].name == name)
            return static_cast<int>(i);
    return -1;
}

FighterInput press(MeleeButton button, float move_x = 0, float move_y = 0) {
    FighterInput input;
    input.pressed[static_cast<int>(button)] = true;
    input.move_x = move_x;
    input.move_y = move_y;
    return input;
}

// Runs ticks with the same held input (no presses) until `until` or `limit` seconds.
template <typename Until>
float run(FighterState &state, const std::vector<MoveDef> &moves, const FighterSettings &settings,
          FighterInput held, Until until, float limit = 5) {
    float t = 0;
    for (int i = 0; i < 1000 && t < limit; ++i) {
        const auto tick = update_fighter(state, moves, settings, held, dt);
        t += dt;
        if (until(tick))
            return t;
    }
    return -1;
}
} // namespace

int main() {
    try {
        const FighterSettings settings;
        {
            for (const auto *text : {default_moves_text, sword_moves_text}) {
                const auto parsed = parse_moves(text);
                if (!parsed.error.empty())
                    std::cerr << parsed.error << "\n";
                check(parsed.error.empty() && parsed.moves.size() >= 10, "default move lists parse");
            }
            const auto parsed = parse_moves(default_moves_text);
            const auto &cross = parsed.moves[static_cast<std::size_t>(find(parsed.moves, "cross"))];
            check(cross.clip == "cross" && cross.after.size() == 1 && cross.after[0] == "jab" && !cross.from_neutral,
                  "cross chains from the jab only");
            const auto &meteor = parsed.moves[static_cast<std::size_t>(find(parsed.moves, "meteor_smash"))];
            check(meteor.sequence == "bf" && meteor.aoe == 3 && meteor.unblockable && meteor.finisher &&
                      meteor.energy == 70,
                  "special fields");
            const auto &roll = parsed.moves[static_cast<std::size_t>(find(parsed.moves, "roll"))];
            check(roll.free_direction && roll.iframe_start > 0 && roll.damage == 0, "dodge fields");
        }
        {
            check(parse_moves("a: hit=0.1-0.2 dmg=3 after=b").error == "line 1: after names an unknown move \"b\"",
                  "after must name a move");
            check(parse_moves("a: dmg=3").error == "line 1: move \"a\" needs hit=start-end", "strikes need a hit");
            check(parse_moves("a: dur=0.5 hit=0.1-0.6").error == "line 1: hit and cancel must fall within dur",
                  "hit within duration");
            check(parse_moves("a: input=punch").error ==
                      "line 1: input must be light, heavy, kick, special, dodge, skill1, skill2, skill3 or ultimate",
                  "input names");
            const auto slots = parse_moves("q: input=skill1 hit=0.1-0.2\ne: input=skill2 hit=0.1-0.2\n"
                                           "r: input=skill3 hit=0.1-0.2\nf: input=ultimate hit=0.1-0.2\n"
                                           "counter: after=counter hit=0.1-0.2\n");
            check(slots.error.empty() && slots.moves[0].input == MeleeButton::skill1 &&
                      slots.moves[2].input == MeleeButton::skill3 && slots.moves[3].input == MeleeButton::ultimate,
                  "skill and ultimate slots");
            check(!slots.moves[4].from_neutral, "a move chained only from itself never starts from neutral");
            check(parse_moves("a: seq=up").error ==
                      "line 1: seq is up to 4 of f, b, l, r (forward, back, left, right)",
                  "sequence tokens");
            check(!parse_moves("").error.empty(), "an empty list fails");
            const auto ok = parse_moves("a: hit=0.1-0.2 # comment\n\nb: after=a|start hit=0.1-0.2 hits=3\n");
            check(ok.error.empty() && ok.moves[1].from_neutral && ok.moves[1].hits == 3, "after|start, hits");
        }
        {
            check(stick_token(0, 1) == 'f' && stick_token(0, -1) == 'b' && stick_token(-1, 0.2F) == 'l' &&
                      stick_token(0.9F, 0) == 'r' && stick_token(0.1F, 0.1F) == 0,
                  "stick tokens");
        }
        const auto moves = parse_moves(default_moves_text).moves;
        const int jab = find(moves, "jab"), cross = find(moves, "cross"), hook = find(moves, "hook");
        {
            // A press starts the jab; the hit falls in its window, once.
            auto state = make_fighter_state(moves, settings);
            const auto first = update_fighter(state, moves, settings, press(MeleeButton::light), dt);
            check(first.started == jab && state.mode == FighterMode::move, "a light press starts the jab");
            int hits = 0;
            float hit_at = -1;
            run(state, moves, settings, {}, [&](const FighterTick &tick) {
                if (tick.hit) {
                    ++hits;
                    hit_at = state.time;
                }
                return tick.ended;
            });
            check(hits == 1 && hit_at >= moves[static_cast<std::size_t>(jab)].hit_start - 1e-4F &&
                      hit_at <= moves[static_cast<std::size_t>(jab)].hit_end,
                  "one hit inside the active window");
            check(state.mode == FighterMode::idle && state.previous == jab, "back to idle");
        }
        {
            // Mashing: a press during the jab is buffered and starts the
            // cross at the jab's cancel point, not before.
            auto state = make_fighter_state(moves, settings);
            update_fighter(state, moves, settings, press(MeleeButton::light), dt);
            update_fighter(state, moves, settings, {}, dt);
            const auto tick = update_fighter(state, moves, settings, press(MeleeButton::light), dt);
            check(tick.started < 0 && state.buffered == static_cast<int>(MeleeButton::light), "buffered");
            int started = -1;
            float when = 0;
            run(state, moves, settings, {}, [&](const FighterTick &t) {
                if (t.started >= 0) {
                    started = t.started;
                    return true;
                }
                when = state.time;
                return false;
            });
            check(started == cross, "the buffered press chains into the cross");
            check(when + dt + 1e-4F >= moves[static_cast<std::size_t>(jab)].cancel, "only at the cancel point");
            // ...then the hook.
            update_fighter(state, moves, settings, press(MeleeButton::light), dt);
            started = -1;
            run(state, moves, settings, {}, [&](const FighterTick &t) {
                started = t.started;
                return t.started >= 0;
            });
            check(started == hook, "cross -> hook");
        }
        {
            // A buffered press expires.
            auto state = make_fighter_state(moves, settings);
            update_fighter(state, moves, settings, press(MeleeButton::kick), dt);
            update_fighter(state, moves, settings, press(MeleeButton::light), dt); // jab can't chain from a kick
            int started = -1;
            run(state, moves, settings, {}, [&](const FighterTick &t) {
                if (t.started >= 0)
                    started = t.started;
                return t.ended;
            });
            check(started == -1, "a press with no chain is dropped, not started after the move");
        }
        {
            // Specials: back-forward + special is the meteor smash (needs
            // energy); forward + special the flying strike.
            auto state = make_fighter_state(moves, settings);
            state.energy = 100;
            FighterInput back;
            back.move_y = -1;
            update_fighter(state, moves, settings, back, dt);
            update_fighter(state, moves, settings, back, dt);
            const auto tick = update_fighter(state, moves, settings, press(MeleeButton::special, 0, 1), dt);
            check(tick.started == find(moves, "meteor_smash"), "b, f + special");
            check(std::abs(state.energy - 30) < 1e-3F, "energy spent");
            auto other = make_fighter_state(moves, settings);
            other.energy = 50;
            check(update_fighter(other, moves, settings, press(MeleeButton::special, 0, 1), dt).started ==
                      find(moves, "flying_strike"),
                  "f + special");
            auto broke = make_fighter_state(moves, settings);
            check(update_fighter(broke, moves, settings, press(MeleeButton::special, 0, 1), dt).started < 0,
                  "no energy, no special");
        }
        {
            // Air and sprint variants; a dodge cancels a move after its hit.
            auto state = make_fighter_state(moves, settings);
            auto air = press(MeleeButton::light);
            air.airborne = true;
            check(update_fighter(state, moves, settings, air, dt).started == find(moves, "air_punch"), "air punch");
            auto run_state = make_fighter_state(moves, settings);
            auto sprint = press(MeleeButton::light, 0, 1);
            sprint.sprinting = true;
            check(update_fighter(run_state, moves, settings, sprint, dt).started == find(moves, "dash_attack"),
                  "sprint + light is the dash attack");
            auto dodge_state = make_fighter_state(moves, settings);
            update_fighter(dodge_state, moves, settings, press(MeleeButton::heavy), dt);
            run(dodge_state, moves, settings, {}, [](const FighterTick &t) { return t.hit; });
            const auto early = update_fighter(dodge_state, moves, settings, press(MeleeButton::dodge, 1, 0), dt);
            check(early.started < 0, "a dodge waits for the active window to close");
            int dodged = -1;
            run(dodge_state, moves, settings, {}, [&](const FighterTick &t) {
                dodged = t.started;
                return t.started >= 0;
            });
            check(dodged == find(moves, "roll"), "dodge-cancel after the blow");
            run(dodge_state, moves, settings, {}, [&](const FighterTick &) { return dodge_state.time > 0.1F; });
            check(invulnerable(dodge_state, moves), "rolling is invulnerable");
            check(lunge_speed(dodge_state, moves) > 0, "the roll travels");
        }
        {
            // Block, parry, guard break.
            const auto &hit_move = moves[static_cast<std::size_t>(cross)];
            auto defender = make_fighter_state(moves, settings);
            FighterInput hold;
            hold.block = true;
            update_fighter(defender, moves, settings, hold, dt);
            check(defender.mode == FighterMode::block, "holding block raises it");
            auto parry = resolve_hit(hit_move, 0, &defender, &moves, &settings, true, false);
            check(parry.outcome == HitOutcome::parried && parry.damage == 0, "early block parries");
            auto attacker = make_fighter_state(moves, settings);
            land_hit(attacker, hit_move, settings, parry);
            check(attacker.mode == FighterMode::stun && attacker.stun_kind == StunKind::parried,
                  "a parried attacker staggers");
            run(defender, moves, settings, hold, [](const FighterTick &) { return false; }, 0.3F);
            auto blocked = resolve_hit(hit_move, 0, &defender, &moves, &settings, true, false);
            check(blocked.outcome == HitOutcome::blocked && blocked.damage > 0 && blocked.damage < hit_move.damage,
                  "a held block takes chip damage");
            check(resolve_hit(hit_move, 0, &defender, &moves, &settings, false, false).outcome == HitOutcome::hit,
                  "blocks only cover the front");
            defender.guard = 1;
            auto broken = resolve_hit(hit_move, 0, &defender, &moves, &settings, true, false);
            check(broken.outcome == HitOutcome::guard_break, "an empty guard breaks");
            take_hit(defender, moves, settings, broken);
            check(defender.mode == FighterMode::stun && defender.stun_kind == StunKind::guard_break,
                  "guard broken -> staggered");
            const auto &meteor = moves[static_cast<std::size_t>(find(moves, "meteor_smash"))];
            auto blocker = make_fighter_state(moves, settings);
            update_fighter(blocker, moves, settings, hold, dt);
            check(resolve_hit(meteor, 0, &blocker, &moves, &settings, true, false).outcome == HitOutcome::hit,
                  "unblockable");
        }
        {
            // Clean hits: stun, launch and knockdown, then getting up.
            auto defender = make_fighter_state(moves, settings);
            const auto &uppercut = moves[static_cast<std::size_t>(find(moves, "uppercut"))];
            const auto launch = resolve_hit(uppercut, 0, &defender, &moves, &settings, true, false);
            check(launch.kind == StunKind::launched && launch.launch > 0, "launchers launch");
            take_hit(defender, moves, settings, launch);
            check(defender.mode == FighterMode::airborne, "airborne");
            const auto juggle = resolve_hit(moves[static_cast<std::size_t>(jab)], 0, &defender, &moves, &settings,
                                            true, true);
            check(juggle.kind == StunKind::launched && juggle.launch > 0, "hits keep an airborne target up");
            touch_ground(defender);
            check(defender.mode == FighterMode::down && invulnerable(defender, moves), "lands down, invulnerable");
            bool got_up = false;
            run(defender, moves, settings, {}, [&](const FighterTick &t) { return got_up = t.got_up; });
            check(got_up && defender.mode == FighterMode::idle, "gets up");
            // Damage scales down over a long string.
            const auto first = resolve_hit(moves[static_cast<std::size_t>(cross)], 0, &defender, &moves, &settings,
                                           true, false);
            const auto tenth = resolve_hit(moves[static_cast<std::size_t>(cross)], 10, &defender, &moves, &settings,
                                           true, false);
            check(tenth.damage < first.damage && tenth.damage >= first.damage * 0.4F - 1e-4F, "combo scaling");
            // A landed hit builds the combo and energy; hit-stop freezes both.
            auto attacker = make_fighter_state(moves, settings);
            land_hit(attacker, moves[static_cast<std::size_t>(cross)], settings, first);
            check(attacker.combo == 1 && attacker.energy > 0 && attacker.hitstop > 0, "combo, energy, hit-stop");
            const float frozen = attacker.time;
            update_fighter(attacker, moves, settings, {}, dt);
            check(attacker.time == frozen, "hit-stop freezes the fighter");
            // Armor: a hit doesn't interrupt the power hook.
            auto armored = make_fighter_state(moves, settings);
            update_fighter(armored, moves, settings, press(MeleeButton::heavy), dt);
            take_hit(armored, moves, settings, first);
            check(armored.mode == FighterMode::move && armored.move == find(moves, "power_hook"), "armor holds");
        }
        {
            // The brain closes in, then strikes and blocks.
            BrainSettings brain_settings;
            brain_settings.aggression = 1;
            brain_settings.skill = 1;
            brain_settings.reaction = 0;
            BrainState brain;
            auto self = make_fighter_state(moves, settings);
            BrainView far;
            far.has_target = true;
            far.distance = 6;
            far.reach = 1;
            check(think(brain, brain_settings, far, self, dt).move_y > 0, "approaches");
            BrainView close = far;
            close.distance = 1.0F;
            bool attacked = false;
            for (int i = 0; i < 200 && !attacked; ++i) {
                const auto input = think(brain, brain_settings, close, self, dt);
                for (const bool p : input.pressed)
                    attacked = attacked || p;
            }
            check(attacked, "attacks in range");
            BrainState guard;
            BrainView threat = close;
            threat.target_attacking = true;
            bool defended = false;
            for (int i = 0; i < 20 && !defended; ++i) {
                const auto input = think(guard, brain_settings, threat, self, dt);
                defended = input.block || input.pressed[static_cast<int>(MeleeButton::dodge)];
            }
            check(defended, "defends against a wind-up");
        }
        {
            // GATEBREAKER (0.80.0): mana, locked skills, guard-breakers, red
            // attacks, parries feeding the gauge, and poise bars with a Break.
            const auto parsed = parse_moves("jab: input=light hit=0.1-0.2 dmg=10\n"
                                            "skill: input=skill1 hit=0.1-0.2 dmg=10 mana=30 cooldown=2 locked\n"
                                            "smash: input=heavy hit=0.1-0.2 dmg=10 guardbreak stagger=55\n"
                                            "slam: input=heavy after=jab hit=0.1-0.2 dmg=10 unblockable\n");
            check(parsed.error.empty(), "the new keys parse");
            const auto &list = parsed.moves;
            check(list[1].mana == 30 && list[1].locked && list[2].guardbreak && list[2].stagger == 55, "fields");
            FighterSettings gb;
            gb.mana_max = 100;
            gb.mana_regen = 10;
            auto fighter = make_fighter_state(list, gb);
            check(fighter.mana == 100 && fighter.locked[1], "starts full, the skill locked");
            check(choose_move(fighter, list, MeleeButton::skill1, {}, {}) < 0, "a locked skill can't start");
            fighter.locked[1] = 0;
            check(choose_move(fighter, list, MeleeButton::skill1, {}, {}) == 1, "unlocked, it can");
            update_fighter(fighter, list, gb, press(MeleeButton::skill1), dt);
            check(fighter.mode == FighterMode::move && std::abs(fighter.mana - 70) < 0.01F, "mana spent");
            fighter.mana = 10;
            run(fighter, list, gb, {}, [&](const FighterTick &) { return fighter.mode == FighterMode::idle; });
            fighter.cooldowns[1] = 0;
            fighter.mana = 10;
            check(choose_move(fighter, list, MeleeButton::skill1, {}, {}) < 0, "short of mana");
            const float before = fighter.mana;
            run(fighter, list, gb, {}, [](const FighterTick &) { return false; }, 1);
            check(fighter.mana > before + 9, "mana refills");

            // A blocking defender: a guard-breaker breaks the guard and can't be parried; red can't be blocked.
            auto blocker = make_fighter_state(list, gb);
            blocker.mode = FighterMode::block;
            blocker.block_time = 0; // inside the parry window
            check(resolve_hit(list[0], 0, &blocker, &list, &gb, true, false).outcome == HitOutcome::parried, "parried");
            check(resolve_hit(list[2], 0, &blocker, &list, &gb, true, false).outcome == HitOutcome::guard_break,
                  "a guard-breaker isn't parried");
            check(resolve_hit(list[3], 0, &blocker, &list, &gb, true, false).outcome == HitOutcome::hit, "red goes through");
            const float energy = blocker.energy;
            take_hit(blocker, list, gb, resolve_hit(list[0], 0, &blocker, &list, &gb, true, false));
            check(blocker.energy >= energy + gb.parry_gain - 0.01F, "a parry fills the gauge");

            // A poise bar fills and Breaks; a Broken fighter takes bonus damage.
            FighterSettings elite = gb;
            elite.poise = 60;
            auto boss = make_fighter_state(list, elite);
            check(!take_hit(boss, list, elite, resolve_hit(list[0], 0, &boss, &list, &elite, true, false)) &&
                      std::abs(boss.stagger - 10) < 0.01F,
                  "hits fill the bar");
            run(boss, list, elite, {}, [&](const FighterTick &) { return boss.mode == FighterMode::idle; });
            check(take_hit(boss, list, elite, resolve_hit(list[2], 0, &boss, &list, &elite, true, false)), "full: a Break");
            check(boss.mode == FighterMode::down && boss.broken > 0 && boss.stagger == 0, "floored");
            const auto bonus = resolve_hit(list[0], 0, &boss, &list, &elite, true, false);
            check(boss.mode != FighterMode::down || std::abs(bonus.damage - 10 * elite.break_bonus) < 0.01F ||
                      bonus.outcome == HitOutcome::dodged,
                  "bonus damage while Broken");
            float down = 0;
            run(boss, list, elite, {}, [&](const FighterTick &) { down += dt; return boss.mode == FighterMode::getup; }, 10);
            check(down > elite.break_time - 0.1F, "a Break floors it for break_time");

            // A ranged brain keeps its distance and shoots; a shield-bearer guards.
            BrainSettings archer;
            archer.range = 7;
            archer.aggression = 1;
            BrainState aim;
            auto self = make_fighter_state(moves, settings);
            BrainView near;
            near.has_target = true;
            near.distance = 4;
            const float back = think(aim, archer, near, self, dt).move_y;
            check(back < 0 && back > -0.5F, "backs off, slower than a fighter closing in");
            BrainView at = near;
            at.distance = 7;
            bool shot = false;
            for (int i = 0; i < 300 && !shot; ++i)
                shot = think(aim, archer, at, self, dt).pressed[static_cast<int>(MeleeButton::light)];
            check(shot, "shoots at range");
            BrainSettings shield;
            shield.shield = true;
            shield.aggression = 0;
            BrainState wall;
            BrainView close = near;
            close.distance = 1.5F;
            bool guarded = false;
            for (int i = 0; i < 30 && !guarded; ++i)
                guarded = think(wall, shield, close, self, dt).block;
            check(guarded, "a shield-bearer holds its guard");
        }
        std::cout << "melee tests passed\n";
        return 0;
    } catch (const std::exception &error) {
        std::cerr << "melee test failed: " << error.what() << "\n";
        return 1;
    }
}
