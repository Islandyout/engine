#include "engine/gameplay/weapons.hpp"

#include <algorithm>
#include <cmath>
#include <iostream>
#include <stdexcept>

namespace {
void check(bool pass, const char *message) {
    if (!pass)
        throw std::runtime_error{message};
}
using namespace engine;
using namespace engine::gameplay;

float angle_between(Vec3 a, Vec3 b) {
    const float dot = a.x * b.x + a.y * b.y + a.z * b.z;
    return std::acos(std::clamp(dot, -1.0F, 1.0F)) * 57.29578F;
}
} // namespace

int main() {
    try {
        {
            const auto parsed = parse_weapons(default_weapons_text);
            check(parsed.error.empty() && parsed.weapons.size() == 3, "default loadout parses");
            const auto &rifle = parsed.weapons[0];
            check(rifle.name == "rifle" && rifle.mode == FireMode::Auto && rifle.magazine == 30 && rifle.reserve == 180,
                  "rifle fields");
            check(parsed.weapons[1].reserve == -1, "pistol has unlimited reserve");
            check(parsed.weapons[2].per_shell && parsed.weapons[2].pellets == 9, "shotgun loads per shell");
        }
        {
            const auto custom = parse_weapons("# comment\n\nrocket: model=launcher projectile speed=28 splash=4 "
                                              "gravity=0.3 mag=1 reserve=6  # trailing\nburst: mode=burst burst=3\n");
            check(custom.error.empty() && custom.weapons.size() == 2, "comments, blank lines, flags");
            check(custom.weapons[0].projectile && custom.weapons[0].splash == 4 && custom.weapons[0].model == "launcher",
                  "projectile fields");
            check(custom.weapons[1].mode == FireMode::Burst && custom.weapons[1].burst == 3, "burst fields");
            check(parse_weapons("a: rpm=0").error == "line 1: \"rpm\" is out of range", "rpm must be positive");
            check(parse_weapons("a: bogus=1").error == "line 1: unknown key \"bogus\"", "unknown key");
            check(parse_weapons("a: model=bazooka").error.find("model must be") != std::string::npos, "bad model");
            check(parse_weapons("\na: mag=3\na: mag=4").error == "line 3: weapon \"a\" is defined twice", "duplicate");
            check(parse_weapons("no colon here").error.rfind("line 1:", 0) == 0, "missing colon");
            check(parse_weapons("  # only comments\n").error == "line 0: no weapons defined", "empty loadout");
            check(parse_weapons("a: mag=2.5").error == "line 1: \"mag\" is out of range", "integer counts");
        }
        {
            WeaponDef weapon;
            weapon.damage = 20;
            weapon.falloff = 10;
            weapon.range = 30;
            weapon.min_damage = 0.5F;
            check(damage_at(weapon, 5) == 20 && damage_at(weapon, 10) == 20, "full damage before falloff");
            check(std::abs(damage_at(weapon, 20) - 15) < 1e-4F, "halfway through falloff");
            check(std::abs(damage_at(weapon, 100) - 10) < 1e-4F, "min damage beyond range");
            weapon.spread = 2;
            weapon.aim_spread = 0.5F;
            weapon.move_spread = 1;
            check(current_spread(weapon, false, 0, false, 0) == 2, "hip spread standing");
            check(current_spread(weapon, false, 1, false, 0) == 3, "moving widens hip spread");
            check(current_spread(weapon, true, 1, false, 0) == 0.5F, "aiming ignores movement");
            check(current_spread(weapon, false, 0, true, 1) == 5, "airborne doubles, then bloom adds");
        }
        {
            std::uint32_t rng = 12345;
            const Vec3 forward{0, 0, -1};
            float widest = 0;
            for (int i = 0; i < 2000; ++i) {
                const auto d = spread_direction(forward, 5, rng);
                check(std::abs(d.x * d.x + d.y * d.y + d.z * d.z - 1) < 1e-4F, "spread keeps unit length");
                widest = std::max(widest, angle_between(d, forward));
            }
            check(widest <= 5.001F && widest > 4.5F, "spread stays inside and fills the cone");
            const auto exact = spread_direction({0, 2, 0}, 0, rng);
            check(exact.y == 1 && exact.x == 0, "zero spread normalizes the direction");
        }
        const auto weapons = parse_weapons(default_weapons_text).weapons;
        constexpr float dt = 1.0F / 60;
        {
            // Equip delay, then automatic fire at the rifle's rpm until empty,
            // then an empty click starts a reload that refills from reserve.
            auto state = make_weapon_state(weapons);
            TriggerInput hold;
            hold.fire_down = true;
            check(!update_weapon(state, weapons, hold, dt).fired, "no shot while equipping");
            for (int i = 0; i < 30; ++i)
                update_weapon(state, weapons, hold, dt);
            int shots = 0;
            for (int i = 0; i < 60; ++i)
                shots += update_weapon(state, weapons, hold, dt).fired ? 1 : 0;
            check(shots >= 10 && shots <= 11, "auto fire at about 620 rpm (10.3 per second)");
            check(state.bloom > 1, "sustained fire builds up bloom");
            while (state.magazine[0] > 0)
                update_weapon(state, weapons, hold, dt);
            TriggerInput pull = hold;
            pull.fire_pressed = true;
            for (int i = 0; i < 10; ++i)
                update_weapon(state, weapons, {}, dt);
            const auto click = update_weapon(state, weapons, pull, dt);
            check(click.empty && click.reload_started && !click.fired, "empty pull clicks and reloads");
            bool finished = false;
            for (int i = 0; i < 200 && !finished; ++i)
                finished = update_weapon(state, weapons, {}, dt).reload_finished;
            check(finished && state.magazine[0] == 30 && state.reserve[0] == 150, "reload refills from reserve");
        }
        {
            // Semi-auto needs a fresh press per shot; unlimited reserve never runs out.
            auto state = make_weapon_state(weapons);
            TriggerInput select;
            select.select = 1;
            check(update_weapon(state, weapons, select, dt).switched && state.current == 1, "switch to pistol");
            for (int i = 0; i < 30; ++i)
                update_weapon(state, weapons, {}, dt);
            TriggerInput press;
            press.fire_down = press.fire_pressed = true;
            TriggerInput held;
            held.fire_down = true;
            check(update_weapon(state, weapons, press, dt).fired, "press fires");
            int extra = 0;
            for (int i = 0; i < 60; ++i)
                extra += update_weapon(state, weapons, held, dt).fired ? 1 : 0;
            check(extra == 0, "holding a semi-auto trigger doesn't fire again");
            state.magazine[1] = 0;
            TriggerInput reload;
            reload.reload = true;
            check(update_weapon(state, weapons, reload, dt).reload_started, "manual reload");
            for (int i = 0; i < 120; ++i)
                update_weapon(state, weapons, {}, dt);
            check(state.magazine[1] == 12 && state.reserve[1] == -1, "unlimited reserve");
            TriggerInput cycle;
            cycle.cycle = -1;
            update_weapon(state, weapons, cycle, dt);
            check(state.current == 0, "cycling back wraps to the previous weapon");
            cycle.cycle = -1;
            update_weapon(state, weapons, cycle, dt);
            check(state.current == 2, "cycling before the first weapon wraps to the last");
        }
        {
            // Per-shell reload: one round per reload_time; the trigger interrupts it.
            auto state = make_weapon_state(weapons);
            TriggerInput select;
            select.select = 2;
            update_weapon(state, weapons, select, dt);
            for (int i = 0; i < 40; ++i)
                update_weapon(state, weapons, {}, dt);
            state.magazine[2] = 2;
            TriggerInput reload;
            reload.reload = true;
            update_weapon(state, weapons, reload, dt);
            for (int i = 0; i < 31; ++i)
                update_weapon(state, weapons, {}, dt);
            check(state.magazine[2] == 3 && state.reserve[2] == 35, "one shell per 0.5 s");
            for (int i = 0; i < 30; ++i)
                update_weapon(state, weapons, {}, dt);
            check(state.magazine[2] == 4, "keeps loading shells");
            TriggerInput press;
            press.fire_down = press.fire_pressed = true;
            check(update_weapon(state, weapons, press, dt).fired && state.reload_left == 0,
                  "the trigger interrupts a per-shell reload and fires");
            give_ammo(state, 2, 10);
            check(state.reserve[2] == 44, "give_ammo adds to the reserve");
        }
        {
            // Burst mode: one pull fires `burst` shots.
            const auto burst = parse_weapons("b: mode=burst burst=3 rpm=900 mag=30 equip=0").weapons;
            auto state = make_weapon_state(burst);
            TriggerInput press;
            press.fire_down = press.fire_pressed = true;
            int shots = update_weapon(state, burst, press, dt).fired ? 1 : 0;
            for (int i = 0; i < 60; ++i)
                shots += update_weapon(state, burst, {}, dt).fired ? 1 : 0;
            check(shots == 3, "a burst pull fires three shots");
        }
        std::cout << "Weapons: loadout parsing and validation, damage falloff, spread (aim, movement, airborne, "
                     "bloom), cone sampling, equip delay, auto/semi/burst fire rates, empty click with auto-reload, "
                     "magazine reloads, unlimited reserves, per-shell reloads interrupted by the trigger, switching "
                     "and cycling, and give_ammo passed.\n";
    } catch (const std::exception &e) {
        std::cerr << e.what() << '\n';
        return 1;
    }
}
