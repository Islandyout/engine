#include "engine/gameplay/weapons.hpp"

#include <algorithm>
#include <cmath>
#include <cstdlib>

namespace engine::gameplay {

const char *const default_weapons_text =
    "rifle: model=rifle mode=auto rpm=620 damage=24 mag=30 reserve=180 reload=2.1 spread=2.2 aim_spread=0.35 "
    "recoil=0.9 range=200 falloff=45 zoom=0.75\n"
    "pistol: model=pistol mode=semi rpm=380 damage=34 mag=12 reserve=-1 reload=1.3 spread=1.6 aim_spread=0.3 "
    "recoil=1.8 range=120 falloff=30 zoom=0.85 equip=0.3\n"
    "shotgun: model=shotgun mode=semi rpm=80 pellets=9 damage=12 mag=6 reserve=36 reload=0.5 per_shell spread=6 "
    "aim_spread=4.5 recoil=4.5 range=45 falloff=10 min_damage=0.2 zoom=0.9 equip=0.5\n";

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

float next_unit(std::uint32_t &state) {
    if (state == 0)
        state = 0x9E3779B9U;
    state ^= state << 13;
    state ^= state >> 17;
    state ^= state << 5;
    return static_cast<float>(state & 0xFFFFFFU) / 16777216.0F;
}

} // namespace

WeaponParse parse_weapons(std::string_view text) {
    WeaponParse result;
    std::size_t line_number = 0, start = 0;
    const auto fail = [&](const std::string &message) {
        result.weapons.clear();
        result.error = "line " + std::to_string(line_number) + ": " + message;
        return result;
    };
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
        WeaponDef weapon;
        weapon.name = colon == std::string::npos ? "" : trim(std::string_view(line).substr(0, colon));
        if (weapon.name.empty() || weapon.name.find_first_of(" \t=") != std::string::npos)
            return fail("expected \"name: key=value ...\"");
        for (const auto &existing : result.weapons)
            if (existing.name == weapon.name)
                return fail("weapon \"" + weapon.name + "\" is defined twice");
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
                if (key == "per_shell")
                    weapon.per_shell = true;
                else if (key == "projectile")
                    weapon.projectile = true;
                else
                    return fail("expected key=value, got \"" + token + "\"");
                continue;
            }
            if (key == "model") {
                static const char *const models[]{"rifle", "pistol", "shotgun", "smg", "sniper", "launcher"};
                if (std::find_if(std::begin(models), std::end(models),
                                 [&](const char *m) { return value == m; }) == std::end(models))
                    return fail("model must be rifle, pistol, shotgun, smg, sniper or launcher");
                weapon.model = value;
                continue;
            }
            if (key == "mode") {
                if (value == "semi")
                    weapon.mode = FireMode::Semi;
                else if (value == "auto")
                    weapon.mode = FireMode::Auto;
                else if (value == "burst")
                    weapon.mode = FireMode::Burst;
                else
                    return fail("mode must be semi, auto or burst");
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
            const auto count = [&](int &field, int minimum) {
                if (number < static_cast<float>(minimum) || number > 100000 || number != std::floor(number))
                    return false;
                field = static_cast<int>(number);
                return true;
            };
            bool ok = true;
            if (key == "burst")
                ok = count(weapon.burst, 1);
            else if (key == "rpm")
                ok = positive(weapon.rpm);
            else if (key == "damage")
                ok = non_negative(weapon.damage);
            else if (key == "headshot")
                ok = positive(weapon.headshot);
            else if (key == "pellets")
                ok = count(weapon.pellets, 1) && weapon.pellets <= 64;
            else if (key == "mag")
                ok = count(weapon.magazine, 1);
            else if (key == "reserve")
                ok = count(weapon.reserve, -1);
            else if (key == "reload")
                ok = positive(weapon.reload_time);
            else if (key == "spread")
                ok = non_negative(weapon.spread) && number < 90;
            else if (key == "aim_spread")
                ok = non_negative(weapon.aim_spread) && number < 90;
            else if (key == "move_spread")
                ok = non_negative(weapon.move_spread) && number < 90;
            else if (key == "recoil")
                ok = non_negative(weapon.recoil);
            else if (key == "range")
                ok = positive(weapon.range);
            else if (key == "falloff")
                ok = non_negative(weapon.falloff);
            else if (key == "min_damage")
                ok = non_negative(weapon.min_damage) && number <= 1;
            else if (key == "speed")
                ok = positive(weapon.speed);
            else if (key == "gravity")
                ok = non_negative(weapon.gravity);
            else if (key == "splash")
                ok = non_negative(weapon.splash);
            else if (key == "zoom")
                ok = positive(weapon.zoom) && number <= 1;
            else if (key == "equip")
                ok = non_negative(weapon.equip_time);
            else
                return fail("unknown key \"" + key + "\"");
            if (!ok)
                return fail("\"" + key + "\" is out of range");
        }
        result.weapons.push_back(std::move(weapon));
        if (result.weapons.size() > 9)
            return fail("at most 9 weapons");
    }
    if (result.weapons.empty()) {
        line_number = 0;
        return fail("no weapons defined");
    }
    return result;
}

float damage_at(const WeaponDef &weapon, float distance) {
    if (distance <= weapon.falloff || weapon.range <= weapon.falloff)
        return weapon.damage;
    const float t = std::clamp((distance - weapon.falloff) / (weapon.range - weapon.falloff), 0.0F, 1.0F);
    return weapon.damage * (1.0F + (weapon.min_damage - 1.0F) * t);
}

float current_spread(const WeaponDef &weapon, bool aiming, float speed_ratio, bool airborne, float bloom) {
    float spread = aiming ? weapon.aim_spread : weapon.spread + weapon.move_spread * std::clamp(speed_ratio, 0.0F, 1.5F);
    if (airborne)
        spread *= 2.0F;
    return std::min(spread + bloom, 45.0F);
}

Vec3 spread_direction(Vec3 direction, float degrees, std::uint32_t &rng) {
    const float length = std::sqrt(direction.x * direction.x + direction.y * direction.y + direction.z * direction.z);
    if (!(length > 1e-6F))
        return {0, 0, -1};
    const Vec3 d{direction.x / length, direction.y / length, direction.z / length};
    if (!(degrees > 0))
        return d;
    // Any vector not parallel to d, then two perpendicular axes.
    const Vec3 helper = std::abs(d.y) < 0.9F ? Vec3{0, 1, 0} : Vec3{1, 0, 0};
    Vec3 u{d.y * helper.z - d.z * helper.y, d.z * helper.x - d.x * helper.z, d.x * helper.y - d.y * helper.x};
    const float ul = std::sqrt(u.x * u.x + u.y * u.y + u.z * u.z);
    u = {u.x / ul, u.y / ul, u.z / ul};
    const Vec3 v{d.y * u.z - d.z * u.y, d.z * u.x - d.x * u.z, d.x * u.y - d.y * u.x};
    // Uniform over the cone's disc of angles: theta grows with sqrt(r).
    const float theta = degrees * 0.017453292F * std::sqrt(next_unit(rng));
    const float phi = 6.2831853F * next_unit(rng);
    const float s = std::sin(theta), c = std::cos(theta);
    const float cp = std::cos(phi), sp = std::sin(phi);
    return {d.x * c + (u.x * cp + v.x * sp) * s, d.y * c + (u.y * cp + v.y * sp) * s,
            d.z * c + (u.z * cp + v.z * sp) * s};
}

WeaponState make_weapon_state(const std::vector<WeaponDef> &weapons) {
    WeaponState state;
    for (const auto &weapon : weapons) {
        state.magazine.push_back(weapon.magazine);
        state.reserve.push_back(weapon.reserve);
    }
    if (!weapons.empty())
        state.equip_left = weapons.front().equip_time;
    return state;
}

void give_ammo(WeaponState &state, int slot, int rounds) {
    if (slot < 0 || static_cast<std::size_t>(slot) >= state.reserve.size() || rounds <= 0)
        return;
    auto &reserve = state.reserve[static_cast<std::size_t>(slot)];
    if (reserve >= 0)
        reserve = std::min(reserve + rounds, 100000);
}

WeaponTick update_weapon(WeaponState &state, const std::vector<WeaponDef> &weapons, const TriggerInput &input,
                         float dt) {
    WeaponTick tick;
    if (weapons.empty() || state.magazine.size() != weapons.size())
        return tick;
    state.cooldown = std::max(0.0F, state.cooldown - dt);
    state.bloom = std::max(0.0F, state.bloom - dt * 3.0F);

    const int count = static_cast<int>(weapons.size());
    int next = state.current;
    if (input.select >= 0 && input.select < count)
        next = input.select;
    else if (input.cycle != 0)
        next = ((state.current + input.cycle) % count + count) % count;
    if (next != state.current) {
        state.current = next;
        state.equip_left = weapons[static_cast<std::size_t>(next)].equip_time;
        state.reload_left = 0;
        state.burst_left = 0;
        tick.switched = true;
    }
    const auto slot = static_cast<std::size_t>(state.current);
    const auto &weapon = weapons[slot];
    auto &magazine = state.magazine[slot];
    auto &reserve = state.reserve[slot];

    if (state.equip_left > 0) {
        state.equip_left = std::max(0.0F, state.equip_left - dt);
        return tick;
    }

    const auto start_reload = [&] {
        if (state.reload_left <= 0 && magazine < weapon.magazine && reserve != 0) {
            state.reload_left = weapon.reload_time;
            state.burst_left = 0;
            tick.reload_started = true;
        }
    };

    if (state.reload_left > 0) {
        // A per-shell reload is interrupted by the trigger once anything is loaded.
        if (weapon.per_shell && input.fire_pressed && magazine > 0) {
            state.reload_left = 0;
        } else {
            state.reload_left -= dt;
            if (state.reload_left <= 0) {
                state.reload_left = 0;
                const int wanted = weapon.per_shell ? 1 : weapon.magazine - magazine;
                const int take = reserve < 0 ? wanted : std::min(wanted, reserve);
                magazine += take;
                if (reserve >= 0)
                    reserve -= take;
                if (weapon.per_shell && magazine < weapon.magazine && reserve != 0)
                    state.reload_left = weapon.reload_time;
                else
                    tick.reload_finished = true;
            }
            return tick;
        }
    }

    if (input.reload)
        start_reload();
    if (state.reload_left > 0)
        return tick;

    bool wants = false;
    switch (weapon.mode) {
    case FireMode::Auto:
        wants = input.fire_down;
        break;
    case FireMode::Semi:
        wants = input.fire_pressed;
        break;
    case FireMode::Burst:
        if (input.fire_pressed && state.burst_left == 0)
            state.burst_left = weapon.burst;
        wants = state.burst_left > 0;
        break;
    }
    if (!wants || state.cooldown > 0) {
        // A semi-auto pull during cooldown is dropped, not queued.
        return tick;
    }
    if (magazine <= 0) {
        state.burst_left = 0;
        if (input.fire_pressed) {
            tick.empty = true;
            start_reload();
        }
        return tick;
    }
    --magazine;
    if (state.burst_left > 0)
        --state.burst_left;
    state.cooldown = 60.0F / weapon.rpm;
    state.bloom = std::min(state.bloom + weapon.recoil * 0.5F, 8.0F);
    tick.fired = true;
    return tick;
}

} // namespace engine::gameplay
