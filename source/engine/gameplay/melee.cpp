#include "engine/gameplay/melee.hpp"

#include <algorithm>
#include <cmath>
#include <cstdlib>

namespace engine::gameplay {

// Hit frames (hit=), cancel points and lunges below are the clips' own: the
// moment the striking limb reaches furthest and the distance the body
// travels, from tools/models/import_combat_clips.mjs's table, scaled to each
// move's duration.
const char *const default_moves_text =
    "# Punches (light): jab, cross, hook, uppercut\n"
    "jab: clip=jab input=light dur=0.55 hit=0.10-0.16 cancel=0.2 dmg=6 reach=0.9 lunge=0.25 stun=0.3 limb=hand_l\n"
    "cross: clip=cross input=light after=jab dur=0.62 hit=0.15-0.22 cancel=0.26 dmg=8 reach=1.0 lunge=0.3 "
    "stun=0.35 limb=hand_r\n"
    "hook: clip=hook input=light after=cross dur=0.72 hit=0.15-0.23 cancel=0.32 dmg=10 reach=1.0 lunge=0.35 "
    "knock=2.5 stun=0.4 limb=hand_r\n"
    "uppercut: clip=uppercut input=light after=hook dur=0.78 hit=0.18-0.28 cancel=0.45 dmg=13 reach=0.9 "
    "lunge=0.3 launch=7.5 knock=1 stun=0.6 stop=0.1 limb=hand_r\n"
    "# Kicks: front kick, roundhouse, side kick (alternating legs)\n"
    "front_kick: clip=front_kick_r input=kick dur=0.8 hit=0.33-0.44 cancel=0.5 dmg=10 reach=1.25 height=0.55 "
    "lunge=0.4 knock=3.5 stun=0.4 limb=foot_r\n"
    "roundhouse: clip=roundhouse_l input=kick after=front_kick|jab|cross dur=0.9 hit=0.38-0.48 cancel=0.6 dmg=14 "
    "reach=1.3 height=0.8 lunge=0.35 knock=4.5 stun=0.5 stop=0.09 limb=foot_l\n"
    "side_kick: clip=side_kick_r input=kick after=roundhouse|hook dur=0.92 hit=0.30-0.40 cancel=0.62 dmg=16 "
    "reach=1.45 height=0.65 lunge=0.35 knock=8 stun=0.7 stop=0.11 knockdown finisher limb=foot_r\n"
    "# Heavies\n"
    "power_hook: clip=hook input=heavy dur=0.95 hit=0.22-0.32 cancel=0.55 dmg=15 reach=1.05 lunge=0.5 knock=4.5 "
    "stun=0.55 stop=0.1 armor limb=hand_r\n"
    "launcher: clip=uppercut input=heavy after=jab|cross dur=0.85 hit=0.2-0.3 cancel=0.5 dmg=11 reach=0.95 "
    "lunge=0.35 launch=8.5 stun=0.7 stop=0.1 limb=hand_r\n"
    "knee_strike: clip=knee input=heavy after=hook|power_hook dur=0.8 hit=0.36-0.46 cancel=0.6 dmg=14 reach=0.75 "
    "lunge=0.6 knock=2 stun=0.7 stop=0.1 limb=calf_r\n"
    "# In the air (after a jump, or chasing a launched target)\n"
    "air_punch: clip=cross input=light air after=air_punch|air_kick|start dur=0.45 hit=0.10-0.18 cancel=0.2 dmg=6 "
    "reach=1.0 launch=3.5 stun=0.4 lunge=0 limb=hand_r\n"
    "air_kick: clip=roundhouse_r input=kick air after=air_punch|start dur=0.6 hit=0.25-0.36 cancel=0.4 dmg=9 "
    "reach=1.2 launch=3 knock=2 stun=0.5 lunge=0 limb=foot_r\n"
    "# Running\n"
    "dash_attack: clip=shoulder_dash input=light sprint dur=0.75 hit=0.08-0.35 cancel=0.5 dmg=10 reach=0.9 "
    "lunge=2.4 knock=7 stun=0.6 stop=0.08 limb=upperarm_l\n"
    "# Dodges (invulnerable while rolling)\n"
    "roll: clip=roll input=dodge dur=0.6 hit=0-0 cancel=0.45 dmg=0 lunge=3.2 free iframes=0.03-0.38 track=0 "
    "limb=pelvis\n"
    "slide: clip=slide input=dodge sprint dur=0.7 hit=0-0 cancel=0.55 dmg=0 lunge=4.2 free iframes=0-0.45 track=0 "
    "limb=pelvis\n"
    "# Specials (energy, built by landing hits): neutral, forward, back, back-forward\n"
    "energy_blast: clip=energy_throw input=special dur=0.8 hit=0.26-0.3 cancel=0.55 dmg=18 projectile=18 knock=5 "
    "stun=0.6 cost=25 cooldown=0.6 lunge=0 limb=hand_r\n"
    "flying_strike: clip=dash_strike input=special seq=f dur=1.0 hit=0.15-0.45 cancel=0.75 dmg=20 reach=1.1 "
    "lunge=4 knock=6 stun=0.7 stop=0.1 cost=35 armor limb=hand_r\n"
    "rising_dragon: clip=rising_strike input=special seq=b dur=0.7 hit=0.1-0.3 cancel=0.55 dmg=18 reach=1.0 "
    "launch=10 stun=0.9 stop=0.12 cost=35 iframes=0-0.15 lunge=0.3 limb=hand_r\n"
    "meteor_smash: clip=ground_pound input=special seq=bf dur=1.1 hit=0.3-0.42 cancel=0.9 dmg=35 aoe=3 knock=9 "
    "launch=4 stun=1 stop=0.16 cost=70 armor knockdown unblockable finisher lunge=0.2 limb=hand_r\n";

const char *const sword_moves_text =
    "# Sword: light chain, heavy chain, a kick, dash and specials\n"
    "slash_a: clip=sword_light_a input=light dur=0.6 hit=0.12-0.2 cancel=0.26 dmg=9 reach=1.5 radius=0.8 lunge=0.3 "
    "stun=0.35 limb=hand_r\n"
    "slash_b: clip=sword_light_b input=light after=slash_a dur=0.65 hit=0.11-0.19 cancel=0.28 dmg=10 reach=1.5 "
    "radius=0.8 lunge=0.3 stun=0.4 limb=hand_r\n"
    "slash_c: clip=sword_light_c input=light after=slash_b dur=1.0 hit=0.26-0.36 cancel=0.55 dmg=15 reach=1.6 "
    "radius=0.9 lunge=0.9 knock=4 stun=0.6 stop=0.1 limb=hand_r\n"
    "cleave_a: clip=sword_heavy_a input=heavy dur=1.15 hit=0.27-0.37 cancel=0.49 dmg=18 reach=1.6 radius=0.9 "
    "lunge=0.9 knock=5 stun=0.6 stop=0.11 armor limb=hand_r\n"
    "cleave_b: clip=sword_heavy_b input=heavy after=cleave_a|slash_b dur=0.9 hit=0.17-0.27 cancel=0.35 dmg=16 "
    "reach=1.5 radius=0.9 lunge=0.2 launch=7 stun=0.7 stop=0.1 limb=hand_r\n"
    "cleave_c: clip=sword_heavy_c input=heavy after=cleave_b|slash_c dur=0.95 hit=0.3-0.4 cancel=0.52 dmg=24 "
    "reach=1.6 radius=1.0 lunge=0.3 knock=9 stun=0.9 stop=0.14 knockdown finisher limb=hand_r\n"
    "kick: clip=front_kick_r input=kick after=slash_a|slash_b|start dur=0.8 hit=0.33-0.44 cancel=0.5 dmg=8 "
    "reach=1.25 height=0.55 lunge=0.4 knock=5 stun=0.5 limb=foot_r\n"
    "dash_cut: clip=dash_strike input=light sprint dur=1.0 hit=0.15-0.45 cancel=0.75 dmg=16 reach=1.4 radius=0.9 "
    "lunge=3.5 knock=6 stun=0.7 stop=0.1 limb=hand_r\n"
    "roll: clip=roll input=dodge dur=0.6 hit=0-0 cancel=0.45 dmg=0 lunge=3.2 free iframes=0.03-0.38 track=0 "
    "limb=pelvis\n"
    "rising_cut: clip=rising_strike input=special seq=b dur=0.7 hit=0.1-0.3 cancel=0.55 dmg=20 reach=1.4 "
    "launch=10 stun=0.9 stop=0.12 cost=30 iframes=0-0.15 lunge=0.3 limb=hand_r\n"
    "piercing_dash: clip=dash_strike input=special seq=f dur=1.0 hit=0.15-0.45 cancel=0.75 dmg=24 reach=1.4 "
    "lunge=5 knock=7 stun=0.8 stop=0.12 cost=35 armor unblockable limb=hand_r\n"
    "slam: clip=ground_pound input=special seq=bf dur=1.1 hit=0.3-0.42 cancel=0.9 dmg=38 aoe=3.2 knock=9 launch=4 "
    "stun=1 stop=0.16 cost=60 armor knockdown finisher lunge=0.2 limb=hand_r\n";

namespace {

std::string trim(std::string_view text) {
    const auto first = text.find_first_not_of(" \t\r");
    if (first == std::string_view::npos)
        return {};
    const auto last = text.find_last_not_of(" \t\r");
    return std::string(text.substr(first, last - first + 1));
}

bool parse_number(const std::string &text, float &out) {
    char *end = nullptr;
    const double value = std::strtod(text.c_str(), &end);
    if (text.empty() || end == text.c_str() || *end != '\0' || !std::isfinite(value))
        return false;
    out = static_cast<float>(value);
    return true;
}

bool parse_range(const std::string &text, float &a, float &b) {
    const auto dash = text.find('-', 1); // a leading '-' would be a sign
    if (dash == std::string::npos)
        return false;
    return parse_number(text.substr(0, dash), a) && parse_number(text.substr(dash + 1), b) && a >= 0 && b >= a;
}

bool valid_name(std::string_view name) {
    if (name.empty())
        return false;
    for (const char c : name)
        if (!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_'))
            return false;
    return true;
}

float next_unit(std::uint32_t &state) {
    if (state == 0)
        state = 0x9E3779B9U;
    state ^= state << 13;
    state ^= state >> 17;
    state ^= state << 5;
    return static_cast<float>(state & 0xFFFFFFU) / 16777216.0F;
}

constexpr float chain_grace = 0.25F; // seconds after a move ends that it still chains
constexpr float history_span = 0.6F; // seconds of stick history a sequence reads

} // namespace

MoveParse parse_moves(std::string_view text) {
    MoveParse result;
    std::size_t line_number = 0, start = 0;
    const auto fail = [&](const std::string &message) {
        result.moves.clear();
        result.error = "line " + std::to_string(line_number) + ": " + message;
        return result;
    };
    std::vector<std::size_t> lines; // the line each move was defined on
    while (start <= text.size()) {
        auto end = text.find('\n', start);
        if (end == std::string_view::npos)
            end = text.size();
        ++line_number;
        std::string line(text.substr(start, end - start));
        start = end + 1;
        if (const auto hash = line.find('#'); hash != std::string::npos)
            line.resize(hash);
        line = trim(line);
        if (line.empty())
            continue;
        const auto colon = line.find(':');
        MoveDef move;
        move.name = colon == std::string::npos ? "" : trim(std::string_view(line).substr(0, colon));
        if (!valid_name(move.name))
            return fail("expected \"name: key=value ...\" (names use letters, digits and _)");
        for (const auto &existing : result.moves)
            if (existing.name == move.name)
                return fail("move \"" + move.name + "\" is defined twice");
        move.clip = move.name;
        bool hit_given = false;
        std::string_view rest = std::string_view(line).substr(colon + 1);
        while (!rest.empty()) {
            const auto space = rest.find_first_of(" \t");
            const std::string token = trim(rest.substr(0, space));
            rest = space == std::string_view::npos ? std::string_view{} : rest.substr(space + 1);
            if (token.empty())
                continue;
            const auto equals = token.find('=');
            const std::string key = token.substr(0, equals);
            const std::string value = equals == std::string::npos ? "" : token.substr(equals + 1);
            if (equals == std::string::npos) {
                if (key == "air")
                    move.air = true;
                else if (key == "sprint")
                    move.sprint = true;
                else if (key == "free")
                    move.free_direction = true;
                else if (key == "armor")
                    move.armor = true;
                else if (key == "unblockable")
                    move.unblockable = true;
                else if (key == "knockdown")
                    move.knockdown = true;
                else if (key == "finisher")
                    move.finisher = true;
                else
                    return fail("expected key=value, got \"" + token + "\"");
                continue;
            }
            if (key == "clip" || key == "limb") {
                if (!valid_name(value))
                    return fail("\"" + key + "\" needs a name");
                (key == "clip" ? move.clip : move.limb) = value;
                continue;
            }
            if (key == "input") {
                static const char *const buttons[]{"light", "heavy", "kick", "special", "dodge"};
                const auto found = std::find_if(std::begin(buttons), std::end(buttons),
                                                [&](const char *b) { return value == b; });
                if (found == std::end(buttons))
                    return fail("input must be light, heavy, kick, special or dodge");
                move.input = static_cast<MeleeButton>(found - std::begin(buttons));
                continue;
            }
            if (key == "after") {
                std::size_t from = 0;
                move.from_neutral = false;
                while (from <= value.size()) {
                    auto bar = value.find('|', from);
                    if (bar == std::string::npos)
                        bar = value.size();
                    const auto name = value.substr(from, bar - from);
                    if (name == "start")
                        move.from_neutral = true;
                    else if (valid_name(name))
                        move.after.push_back(name);
                    else
                        return fail("after needs move names joined by |");
                    from = bar + 1;
                }
                continue;
            }
            if (key == "seq") {
                if (value.empty() || value.size() > 4 || value.find_first_not_of("fblr") != std::string::npos)
                    return fail("seq is up to 4 of f, b, l, r (forward, back, left, right)");
                move.sequence = value;
                continue;
            }
            if (key == "hit" || key == "iframes") {
                float a = 0, b = 0;
                if (!parse_range(value, a, b))
                    return fail("\"" + key + "\" needs a range like 0.1-0.2");
                if (key == "hit") {
                    move.hit_start = a;
                    move.hit_end = b;
                    hit_given = true;
                } else {
                    move.iframe_start = a;
                    move.iframe_end = b;
                }
                continue;
            }
            float number = 0;
            if (!parse_number(value, number))
                return fail("\"" + key + "\" needs a number");
            const auto positive = [&](float &field) {
                if (!(number > 0))
                    return false;
                field = number;
                return true;
            };
            const auto non_negative = [&](float &field) {
                if (!(number >= 0))
                    return false;
                field = number;
                return true;
            };
            bool ok = true;
            if (key == "dur")
                ok = positive(move.duration) && number <= 10;
            else if (key == "cancel")
                ok = non_negative(move.cancel);
            else if (key == "dmg")
                ok = non_negative(move.damage) && number <= 100000;
            else if (key == "reach")
                ok = non_negative(move.reach) && number <= 20;
            else if (key == "radius")
                ok = positive(move.radius) && number <= 20;
            else if (key == "height")
                ok = non_negative(move.height) && number <= 2;
            else if (key == "aoe")
                ok = non_negative(move.aoe) && number <= 30;
            else if (key == "knock")
                ok = non_negative(move.knockback) && number <= 60;
            else if (key == "launch")
                ok = non_negative(move.launch) && number <= 40;
            else if (key == "stun")
                ok = non_negative(move.stun) && number <= 10;
            else if (key == "stop")
                ok = non_negative(move.hitstop) && number <= 1;
            else if (key == "lunge")
                ok = std::isfinite(number) && std::abs(number) <= 30 && (move.lunge = number, true);
            else if (key == "cost")
                ok = non_negative(move.energy);
            else if (key == "gain")
                ok = non_negative(move.gain);
            else if (key == "cooldown")
                ok = non_negative(move.cooldown);
            else if (key == "projectile")
                ok = non_negative(move.projectile) && number <= 200;
            else if (key == "track")
                ok = non_negative(move.track) && number <= 180;
            else if (key == "hits") {
                ok = number >= 1 && number <= 20 && number == std::floor(number);
                if (ok)
                    move.hits = static_cast<int>(number);
            } else
                return fail("unknown key \"" + key + "\"");
            if (!ok)
                return fail("\"" + key + "\" is out of range");
        }
        if (!hit_given && move.damage > 0)
            return fail("move \"" + move.name + "\" needs hit=start-end");
        if (move.hit_end > move.duration || move.cancel > move.duration)
            return fail("hit and cancel must fall within dur");
        if (move.iframe_start >= 0 && move.iframe_end > move.duration)
            return fail("iframes must fall within dur");
        result.moves.push_back(std::move(move));
        lines.push_back(line_number);
        if (result.moves.size() > 64)
            return fail("at most 64 moves");
    }
    if (result.moves.empty()) {
        line_number = 0;
        return fail("no moves defined");
    }
    for (std::size_t i = 0; i < result.moves.size(); ++i)
        for (const auto &name : result.moves[i].after)
            if (std::none_of(result.moves.begin(), result.moves.end(),
                             [&](const MoveDef &m) { return m.name == name; })) {
                line_number = lines[i];
                return fail("after names an unknown move \"" + name + "\"");
            }
    return result;
}

FighterState make_fighter_state(const std::vector<MoveDef> &moves, const FighterSettings &settings) {
    FighterState state;
    state.cooldowns.assign(moves.size(), 0.0F);
    state.guard = settings.guard_max;
    return state;
}

char stick_token(float move_x, float move_y) {
    if (move_x * move_x + move_y * move_y < 0.25F)
        return 0;
    if (std::abs(move_y) >= std::abs(move_x))
        return move_y > 0 ? 'f' : 'b';
    return move_x > 0 ? 'r' : 'l';
}

namespace {

// The move a chain continues from: the one playing, or one that just ended.
int chain_source(const FighterState &state) {
    if (state.mode == FighterMode::move)
        return state.move;
    if ((state.mode == FighterMode::idle || state.mode == FighterMode::block) && state.time < chain_grace)
        return state.previous;
    return -1;
}

bool ends_with(std::string_view text, std::string_view suffix) {
    return text.size() >= suffix.size() && text.substr(text.size() - suffix.size()) == suffix;
}

bool chains_from(const std::vector<MoveDef> &moves, const MoveDef &move, int source) {
    if (source < 0 || static_cast<std::size_t>(source) >= moves.size())
        return false;
    const auto &name = moves[static_cast<std::size_t>(source)].name;
    return std::find(move.after.begin(), move.after.end(), name) != move.after.end();
}

void start_move(FighterState &state, const std::vector<MoveDef> &moves, int index, FighterTick &tick) {
    const auto &move = moves[static_cast<std::size_t>(index)];
    if (state.mode == FighterMode::move)
        state.previous = state.move;
    state.mode = FighterMode::move;
    state.move = index;
    state.time = 0;
    state.hits_done = 0;
    state.buffered = -1;
    state.buffer_left = 0;
    state.energy = std::max(0.0F, state.energy - move.energy);
    state.cooldowns[static_cast<std::size_t>(index)] = move.cooldown;
    if (!move.sequence.empty()) {
        state.history.clear();
        state.history_age.clear();
    }
    tick.started = index;
}

// Starts the buffered press if a move fits it now.
void try_buffered(FighterState &state, const std::vector<MoveDef> &moves, const FighterInput &input,
                  FighterTick &tick) {
    if (state.buffered < 0)
        return;
    const int index = choose_move(state, moves, static_cast<MeleeButton>(state.buffered), input,
                                  state.buffered_sequence);
    if (index >= 0)
        start_move(state, moves, index, tick);
}

} // namespace

bool can_start(const FighterState &state, const std::vector<MoveDef> &moves, int index, const FighterInput &input,
               std::string_view sequence) {
    if (index < 0 || static_cast<std::size_t>(index) >= moves.size())
        return false;
    const auto &move = moves[static_cast<std::size_t>(index)];
    if (move.air != input.airborne || (move.sprint && !input.sprinting))
        return false;
    if (state.energy + 1e-4F < move.energy)
        return false;
    if (static_cast<std::size_t>(index) < state.cooldowns.size() &&
        state.cooldowns[static_cast<std::size_t>(index)] > 0)
        return false;
    if (!move.sequence.empty() && !ends_with(sequence, move.sequence))
        return false;
    const bool chained = chains_from(moves, move, chain_source(state));
    switch (state.mode) {
    case FighterMode::move:
        // Mid-move only a chain follows, or a dodge cancels.
        return chained || (move.input == MeleeButton::dodge && move.from_neutral);
    case FighterMode::idle:
    case FighterMode::block:
        return chained || move.from_neutral;
    default:
        return false;
    }
}

int choose_move(const FighterState &state, const std::vector<MoveDef> &moves, MeleeButton button,
                const FighterInput &input, std::string_view sequence) {
    int best = -1, best_score = -1;
    const int source = chain_source(state);
    for (std::size_t i = 0; i < moves.size(); ++i) {
        const auto &move = moves[i];
        if (move.input != button || !can_start(state, moves, static_cast<int>(i), input, sequence))
            continue;
        int score = static_cast<int>(move.sequence.size()) * 100;
        if (chains_from(moves, move, source))
            score += 10;
        if (move.sprint)
            score += 5;
        if (score > best_score) {
            best = static_cast<int>(i);
            best_score = score;
        }
    }
    return best;
}

FighterTick update_fighter(FighterState &state, const std::vector<MoveDef> &moves, const FighterSettings &settings,
                           const FighterInput &input, float dt) {
    FighterTick tick;
    if (state.cooldowns.size() != moves.size())
        state.cooldowns.assign(moves.size(), 0.0F);
    if (state.mode == FighterMode::dead)
        return tick;
    // Presses land in the buffer even while frozen; the latest press wins
    // and a dodge beats an attack pressed on the same tick.
    bool pressed = false;
    for (int b = 0; b < melee_button_count; ++b)
        if (input.pressed[b]) {
            state.buffered = b;
            pressed = true;
        }
    const char token = stick_token(input.move_x, input.move_y);
    if (token && token != state.stick) {
        state.history.push_back(token);
        state.history_age.push_back(0);
        if (state.history.size() > 8) {
            state.history.erase(state.history.begin());
            state.history_age.erase(state.history_age.begin());
        }
    }
    state.stick = token;
    if (pressed) {
        state.buffer_left = settings.buffer;
        state.buffered_sequence = state.history;
    }
    if (state.hitstop > 0) {
        state.hitstop = std::max(0.0F, state.hitstop - dt);
        return tick;
    }
    if (!pressed && state.buffered >= 0) {
        state.buffer_left -= dt;
        if (state.buffer_left <= 0)
            state.buffered = -1;
    }
    for (auto &cooldown : state.cooldowns)
        cooldown = std::max(0.0F, cooldown - dt);
    if (state.combo_left > 0) {
        state.combo_left -= dt;
        if (state.combo_left <= 0)
            state.combo = 0;
    }
    for (std::size_t i = 0; i < state.history_age.size();) {
        state.history_age[i] += dt;
        if (state.history_age[i] > history_span) {
            state.history.erase(state.history.begin() + static_cast<std::ptrdiff_t>(i));
            state.history_age.erase(state.history_age.begin() + static_cast<std::ptrdiff_t>(i));
        } else {
            ++i;
        }
    }
    if (state.mode != FighterMode::block)
        state.guard = std::min(settings.guard_max, state.guard + settings.guard_regen * dt);
    state.time += dt;
    switch (state.mode) {
    case FighterMode::stun:
        state.stun_left -= dt;
        if (state.stun_left <= 0) {
            state.mode = state.stun_kind == StunKind::knockdown ? FighterMode::down : FighterMode::idle;
            state.time = state.stun_kind == StunKind::knockdown ? 0.0F : chain_grace;
            if (state.mode == FighterMode::idle)
                state.stun_kind = StunKind::none;
        }
        break;
    case FighterMode::airborne:
        break; // until touch_ground()
    case FighterMode::down:
        if (state.time >= settings.down_time) {
            state.mode = FighterMode::getup;
            state.time = 0;
        }
        break;
    case FighterMode::getup:
        if (state.time >= settings.getup_time) {
            state.mode = FighterMode::idle;
            state.time = chain_grace;
            state.stun_kind = StunKind::none;
            tick.got_up = true;
        }
        break;
    case FighterMode::move: {
        const auto &move = moves[static_cast<std::size_t>(state.move)];
        const bool striking = move.damage > 0 || move.projectile > 0;
        if (striking && state.hits_done < move.hits) {
            const float span = move.hit_end - move.hit_start;
            const float at = move.hit_start + (move.hits > 1 ? span * static_cast<float>(state.hits_done) /
                                                                   static_cast<float>(move.hits - 1)
                                                             : 0.0F);
            if (state.time >= at) {
                ++state.hits_done;
                (move.projectile > 0 ? tick.fire : tick.hit) = true;
            }
        }
        if (state.time >= move.duration) {
            state.previous = state.move;
            state.move = -1;
            state.mode = FighterMode::idle;
            state.time = 0;
            tick.ended = true;
            try_buffered(state, moves, input, tick);
        } else if (state.buffered >= 0) {
            // A dodge can cut a move short once its blow has landed.
            const bool dodge = state.buffered == static_cast<int>(MeleeButton::dodge);
            if (state.time >= (dodge ? std::min(move.cancel, move.hit_end) : move.cancel))
                try_buffered(state, moves, input, tick);
        }
        break;
    }
    case FighterMode::idle:
    case FighterMode::block:
        if (input.block && state.buffered < 0) {
            if (state.mode != FighterMode::block) {
                state.mode = FighterMode::block;
                state.block_time = 0;
                tick.block_raised = true;
            } else {
                state.block_time += dt;
            }
        } else if (state.mode == FighterMode::block && !input.block) {
            state.mode = FighterMode::idle;
        }
        try_buffered(state, moves, input, tick);
        break;
    case FighterMode::dead:
        break;
    }
    return tick;
}

bool invulnerable(const FighterState &state, const std::vector<MoveDef> &moves) {
    switch (state.mode) {
    case FighterMode::down:
    case FighterMode::getup:
    case FighterMode::dead:
        return true;
    case FighterMode::move: {
        const auto &move = moves[static_cast<std::size_t>(state.move)];
        return move.iframe_start >= 0 && state.time >= move.iframe_start && state.time <= move.iframe_end;
    }
    default:
        return false;
    }
}

float lunge_speed(const FighterState &state, const std::vector<MoveDef> &moves) {
    if (state.mode != FighterMode::move || state.hitstop > 0)
        return 0;
    const auto &move = moves[static_cast<std::size_t>(state.move)];
    const float span = move.free_direction ? move.duration : std::max(move.hit_end, 0.05F);
    if (state.time >= span || move.lunge == 0)
        return 0;
    const float u = state.time / span;
    return move.lunge * 6.0F * u * (1.0F - u) / span;
}

HitResult resolve_hit(const MoveDef &move, int attacker_combo, const FighterState *defender,
                      const std::vector<MoveDef> *defender_moves, const FighterSettings *settings, bool from_front,
                      bool defender_airborne) {
    HitResult result;
    result.hitstop = move.hitstop;
    if (defender && defender_moves && invulnerable(*defender, *defender_moves)) {
        result.outcome = HitOutcome::dodged;
        result.hitstop = 0;
        return result;
    }
    if (defender && settings && defender->mode == FighterMode::block && from_front && !move.unblockable) {
        if (defender->block_time <= settings->parry_window) {
            result.outcome = HitOutcome::parried;
            result.hitstop = std::max(0.12F, move.hitstop);
            return result;
        }
        result.damage = move.damage * 0.15F;
        result.guard_damage = move.damage;
        result.knockback = move.knockback * 0.4F;
        if (defender->guard - move.damage <= 0) {
            result.outcome = HitOutcome::guard_break;
            result.kind = StunKind::guard_break;
            result.stun = 1.0F;
        } else {
            result.outcome = HitOutcome::blocked;
        }
        return result;
    }
    // Long strings do less per hit, so a juggle can't go on forever.
    const float scale = std::max(0.4F, 1.0F - 0.07F * static_cast<float>(std::max(0, attacker_combo - 3)));
    result.damage = move.damage * scale;
    result.stun = move.stun;
    result.knockback = move.knockback;
    if (move.launch > 0 || defender_airborne) {
        result.kind = StunKind::launched;
        result.launch = std::max(move.launch, defender_airborne ? 3.5F : 0.0F);
    } else if (move.knockdown) {
        result.kind = StunKind::knockdown;
    } else if (move.stun >= 0.5F || move.knockback >= 4.0F) {
        result.kind = StunKind::heavy;
    } else {
        result.kind = StunKind::light;
    }
    return result;
}

void take_hit(FighterState &defender, const std::vector<MoveDef> &moves, const FighterSettings &settings,
              const HitResult &result) {
    switch (result.outcome) {
    case HitOutcome::dodged:
    case HitOutcome::parried:
        return;
    case HitOutcome::blocked:
        defender.guard = std::max(0.0F, defender.guard - result.guard_damage);
        defender.hitstop = result.hitstop;
        return;
    case HitOutcome::guard_break:
        defender.guard = settings.guard_max;
        break;
    case HitOutcome::hit:
        if (defender.mode == FighterMode::move && moves[static_cast<std::size_t>(defender.move)].armor &&
            result.kind != StunKind::launched) {
            defender.hitstop = result.hitstop;
            return; // armored: keeps going
        }
        break;
    }
    defender.hitstop = result.hitstop;
    if (defender.mode == FighterMode::move)
        defender.previous = -1;
    defender.move = -1;
    defender.buffered = -1;
    defender.time = 0;
    defender.stun_kind = result.kind;
    defender.stun_left = result.stun;
    defender.mode = result.kind == StunKind::launched ? FighterMode::airborne : FighterMode::stun;
}

void land_hit(FighterState &attacker, const MoveDef &move, const FighterSettings &settings, const HitResult &result) {
    switch (result.outcome) {
    case HitOutcome::dodged:
        return;
    case HitOutcome::parried:
        attacker.hitstop = result.hitstop;
        attacker.mode = FighterMode::stun;
        attacker.stun_kind = StunKind::parried;
        attacker.stun_left = 0.8F;
        attacker.move = -1;
        attacker.buffered = -1;
        attacker.time = 0;
        return;
    case HitOutcome::blocked:
    case HitOutcome::guard_break:
        attacker.hitstop = result.hitstop;
        attacker.energy = std::min(settings.energy_max, attacker.energy + move.gain * 0.3F);
        return;
    case HitOutcome::hit:
        attacker.hitstop = result.hitstop;
        attacker.energy = std::min(settings.energy_max, attacker.energy + move.gain);
        ++attacker.combo;
        attacker.combo_left = 1.4F;
        return;
    }
}

void touch_ground(FighterState &state) {
    if (state.mode != FighterMode::airborne)
        return;
    state.mode = FighterMode::down;
    state.stun_kind = StunKind::knockdown;
    state.time = 0;
}

FighterInput think(BrainState &brain, const BrainSettings &settings, const BrainView &view, const FighterState &self,
                   float dt) {
    FighterInput input;
    brain.think -= dt;
    brain.press_gap -= dt;
    brain.strafe_left -= dt;
    brain.hold_block -= dt;
    brain.react_left -= dt;
    const bool free = self.mode == FighterMode::idle || self.mode == FighterMode::block ||
                      self.mode == FighterMode::move;
    if (!free || !view.has_target) {
        brain.chain_left = 0;
        brain.hold_block = 0;
        return input;
    }
    const float engage = view.reach + 0.35F;
    // Defence: the target is winding up close enough to connect.
    if (view.target_attacking && view.distance < view.target_reach + 0.9F && brain.react_left <= 0 &&
        self.mode != FighterMode::move) {
        brain.react_left = settings.reaction + 0.4F;
        const float roll = next_unit(brain.rng);
        if (roll < settings.skill * 0.55F) {
            brain.hold_block = 0.35F + 0.3F * next_unit(brain.rng);
        } else if (roll < settings.skill * 0.75F) {
            input.pressed[static_cast<int>(MeleeButton::dodge)] = true;
            input.move_x = next_unit(brain.rng) < 0.5F ? -1.0F : 1.0F;
            input.move_y = -0.3F;
            brain.chain_left = 0;
            return input;
        }
    }
    if (brain.hold_block > 0 && self.mode != FighterMode::move) {
        input.block = true;
        return input;
    }
    // Footwork: close the distance, then circle at striking range.
    if (brain.strafe_left <= 0) {
        brain.strafe = next_unit(brain.rng) < 0.5F ? -1.0F : 1.0F;
        brain.strafe_left = 1.2F + 1.3F * next_unit(brain.rng);
    }
    if (view.target_down) {
        input.move_y = view.distance < engage + 1.0F ? -0.5F : 0.0F;
        input.move_x = brain.strafe * 0.5F;
        return input;
    }
    if (view.distance > engage) {
        input.move_y = 1;
    } else {
        input.move_x = brain.strafe * 0.55F;
        input.move_y = view.distance < engage - 0.45F ? -0.45F : 0.05F;
    }
    // Offence: strings of presses (buffered into combos), now and then a
    // special when the energy is there.
    const bool facing = std::abs(view.bearing) < 0.7F;
    if (view.distance <= engage + 0.25F && facing) {
        if (brain.chain_left > 0) {
            if (brain.press_gap <= 0) {
                input.pressed[static_cast<int>(brain.chain_button)] = true;
                --brain.chain_left;
                brain.press_gap = 0.16F + 0.14F * next_unit(brain.rng);
                // Mixing in a kick or a heavy to finish the string.
                if (brain.chain_left == 1 && next_unit(brain.rng) < 0.4F)
                    brain.chain_button = next_unit(brain.rng) < 0.6F ? MeleeButton::kick : MeleeButton::heavy;
            }
        } else if (brain.think <= 0 && self.mode != FighterMode::move) {
            brain.think = 0.35F + (1.0F - settings.aggression) * 1.3F * next_unit(brain.rng);
            if (next_unit(brain.rng) < settings.aggression) {
                const float pick = next_unit(brain.rng);
                if (self.energy >= 35.0F && pick < 0.2F) {
                    input.pressed[static_cast<int>(MeleeButton::special)] = true;
                    input.move_y = next_unit(brain.rng) < 0.6F ? 1.0F : -1.0F; // flying strike / rising dragon
                    input.move_x = 0;
                } else {
                    brain.chain_button = pick < 0.6F   ? MeleeButton::light
                                         : pick < 0.85F ? MeleeButton::kick
                                                        : MeleeButton::heavy;
                    brain.chain_left = 1 + static_cast<int>(std::lround(settings.skill * 3.0F * next_unit(brain.rng)));
                    brain.press_gap = 0;
                }
            }
        }
    }
    return input;
}

} // namespace engine::gameplay
