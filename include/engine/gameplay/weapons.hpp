#pragma once

#include "engine/graphics/box_view.hpp"

#include <cstdint>
#include <string>
#include <string_view>
#include <vector>

namespace engine::gameplay {

// Weapons (0.61.0): definitions authored as text, one per line,
//
//   rifle: model=rifle mode=auto rpm=620 damage=24 mag=30 reserve=180 reload=2.1
//   shotgun: model=shotgun pellets=9 damage=12 mag=6 reload=0.5 per_shell
//
// and the per-entity state machine that turns trigger input into shots,
// reloads and weapon switches. Hit detection lives with the caller (it
// needs the world); this part is pure and unit tested.
enum class FireMode { Semi, Auto, Burst };

struct WeaponDef final {
    std::string name;
    // Which first-person model the editor draws: rifle, pistol, shotgun,
    // smg, sniper or launcher.
    std::string model{"rifle"};
    FireMode mode{FireMode::Semi};
    int burst{3};          // shots per trigger pull in Burst mode
    float rpm{600.0F};     // rounds per minute
    float damage{25.0F};   // per pellet, before falloff
    float headshot{2.0F};  // damage multiplier for a hit near the top of a tall target
    int pellets{1};
    int magazine{30};
    int reserve{120};      // spare rounds; -1 = unlimited
    float reload_time{2.0F};
    bool per_shell{false}; // reload one round per reload_time (shotguns); firing interrupts
    float spread{1.5F};    // hip-fire cone half-angle, degrees
    float aim_spread{0.3F};
    float move_spread{1.5F}; // extra degrees at full walk speed (hip fire only)
    float recoil{1.0F};      // view kick per shot, degrees
    float range{150.0F};
    float falloff{50.0F};    // damage starts falling off at this distance...
    float min_damage{0.5F};  // ...down to this fraction of damage at `range`
    bool projectile{false};  // fires a physical projectile instead of a hitscan ray
    float speed{40.0F};      // projectile speed
    float gravity{0.0F};     // projectile gravity scale
    float splash{0.0F};      // projectile explosion radius (0 = direct hit only)
    float zoom{0.8F};        // field-of-view multiplier while aiming
    float equip_time{0.4F};
};

struct WeaponParse final {
    std::vector<WeaponDef> weapons;
    std::string error; // "line N: ..." on failure, weapons then empty
};

// Parses a loadout. `#` starts a comment; blank lines are ignored. Keys:
// model, mode (semi|auto|burst), burst, rpm, damage, headshot, pellets, mag,
// reserve, reload, per_shell, spread, aim_spread, move_spread, recoil, range,
// falloff, min_damage, projectile, speed, gravity, splash, zoom, equip.
[[nodiscard]] WeaponParse parse_weapons(std::string_view text);

// A rifle, a pistol and a shotgun.
extern const char *const default_weapons_text;

// Damage of one pellet at `distance`, after falloff.
[[nodiscard]] float damage_at(const WeaponDef &weapon, float distance);

// The current cone half-angle in degrees: aim or hip spread, plus movement
// (hip only, scaled by speed_ratio = speed / walk speed, capped at 1.5),
// doubled while airborne, plus accumulated bloom from sustained fire.
[[nodiscard]] float current_spread(const WeaponDef &weapon, bool aiming, float speed_ratio, bool airborne,
                                   float bloom);

// `direction` (unit) deflected by a uniformly random angle inside a cone of
// `degrees` half-angle. rng is an xorshift32 state (never 0).
[[nodiscard]] Vec3 spread_direction(Vec3 direction, float degrees, std::uint32_t &rng);

// One fixed tick of trigger input.
struct TriggerInput final {
    bool fire_down{};
    bool fire_pressed{};
    bool reload{};
    int select{-1}; // slot to switch to, or -1
    int cycle{0};   // +1 next weapon, -1 previous
};

struct WeaponState final {
    int current{0};
    std::vector<int> magazine; // rounds loaded, per weapon
    std::vector<int> reserve;  // spare rounds, per weapon (-1 = unlimited)
    float cooldown{0};
    float reload_left{0};      // > 0 while reloading
    float equip_left{0};       // > 0 while raising a weapon
    int burst_left{0};
    float bloom{0};            // degrees of extra spread from sustained fire
    std::uint32_t rng{0x9E3779B9U};
};

// What happened during one update_weapon() call.
struct WeaponTick final {
    bool fired{};
    bool empty{};          // trigger pulled with nothing loaded
    bool reload_started{};
    bool reload_finished{};
    bool switched{};
};

// Full magazines and reserves for every weapon, first weapon equipped.
[[nodiscard]] WeaponState make_weapon_state(const std::vector<WeaponDef> &weapons);

// Advances cooldown/reload/equip timers by dt, applies switching, reloading
// and the trigger. A pull on an empty magazine clicks and starts a reload.
WeaponTick update_weapon(WeaponState &state, const std::vector<WeaponDef> &weapons, const TriggerInput &input,
                         float dt);

// Adds rounds to a weapon's reserve (no-op for unlimited reserves).
void give_ammo(WeaponState &state, int slot, int rounds);

} // namespace engine::gameplay
