// Editor runtime exports for soldiers, cars, drivers and weapons (split from
// bridge.cpp in 0.77.0).
#include "bridge_runtime.hpp"

extern "C" {
// Makes the entity a combat soldier (0.62.0), after editor_add for the same
// index: team (0 = the Player's), behavior (0 patrol, 1 guard, 2 hunt), sight
// range, field of view in degrees, hearing range, reaction time, accuracy
// 0..1, preferred fighting range, move speed, burst length, burst pause,
// use_cover, flee_health 0..1 (0 = never) and melee damage. It moves through
// a CharacterController sized to its own Box, and replaces any AIState
// wander/chase behavior.
EXPORT void editor_set_soldier(int index, double team, double behavior, double sight, double fov, double hearing,
                               double reaction, double accuracy, double preferred, double speed, double burst,
                               double burst_pause, int use_cover, double flee_health, double melee) {
    const auto target = staged(index);
    if (!target)
        return;
    auto &world = *target->first;
    auto *box = world.get<engine::Box>(target->second);
    if (!box || !world.get<engine::physics::RigidBody>(target->second))
        return;
    const bool valid = team >= 0 && team <= 15 && team == std::floor(team) && (behavior == 0 || behavior == 1 ||
                                                                                 behavior == 2) &&
                       sight > 0 && sight <= 1000 && fov > 0 && fov <= 360 && hearing >= 0 && hearing <= 1000 &&
                       reaction >= 0 && reaction <= 10 && accuracy >= 0 && accuracy <= 1 && preferred > 0 &&
                       preferred <= 500 && speed > 0 && speed <= 100 && burst >= 1 && burst <= 100 &&
                       burst == std::floor(burst) && burst_pause >= 0 && burst_pause <= 10 && flee_health >= 0 &&
                       flee_health <= 1 && melee >= 0 && melee <= 100000;
    if (!valid) {
        failed = true;
        return;
    }
    Soldier soldier;
    soldier.team = static_cast<int>(team);
    soldier.behavior = static_cast<SoldierBehavior>(static_cast<int>(behavior));
    soldier.sight_range = static_cast<float>(sight);
    soldier.fov_cos = static_cast<float>(std::cos(std::min(fov, 359.0) * 3.14159265358979 / 360.0));
    soldier.hearing = static_cast<float>(hearing);
    soldier.reaction = static_cast<float>(reaction);
    soldier.accuracy = static_cast<float>(accuracy);
    soldier.preferred_range = static_cast<float>(preferred);
    soldier.move_speed = static_cast<float>(speed);
    soldier.burst = static_cast<int>(burst);
    soldier.burst_pause = static_cast<float>(burst_pause);
    soldier.use_cover = use_cover != 0;
    soldier.flee_health = static_cast<float>(flee_health);
    soldier.melee_damage = static_cast<float>(melee);
    world.set(target->second, soldier);
    Controller controller;
    controller.first_person = false;
    controller.settings.walk_speed = controller.settings.sprint_speed = static_cast<float>(speed);
    controller.settings.stand_height = controller.settings.crouch_height = box->size.y;
    controller.settings.radius = std::max(box->size.x, box->size.z) / 2;
    controller.settings.step_height = 0.35F;
    controller.settings.ground_accel = 30.0F;
    controller.settings.ground_decel = 30.0F;
    world.set(target->second, controller);
    if (world.get<AIAgent>(target->second))
        world.remove<AIAgent>(target->second);
}
// Waypoint entity Names (comma-separated) a patrolling soldier walks in order.
EXPORT void editor_set_soldier_patrol(int index, const char *names) {
    const auto target = staged(index);
    if (!target || !names)
        return;
    auto *soldier = target->first->get<Soldier>(target->second);
    if (!soldier)
        return;
    soldier->patrol_names.clear();
    std::string all(names);
    std::size_t start = 0;
    while (start <= all.size()) {
        auto end = all.find(',', start);
        if (end == std::string::npos)
            end = all.size();
        auto name = editor_bindings::trim(std::string_view(all).substr(start, end - start));
        if (!name.empty())
            soldier->patrol_names.push_back(std::move(name));
        start = end + 1;
    }
}
// Arcade car (0.70.0): makes the staged entity an engine::gameplay car
// facing `yaw` (radians; it faces (sin, 0, cos)) with these handling numbers
// (see CarSpec), adding its Heading (footprint from its Box) if needed.
// Non-finite or non-positive numbers fail the commit.
EXPORT void editor_set_car(int index, double yaw, double top_speed, double acceleration, double braking, double grip,
                           double drift_grip, double steering, double nitro_boost, double nitro_seconds, double gears) {
    const auto target = staged(index);
    if (!target)
        return;
    for (const double v : {top_speed, acceleration, braking, grip, drift_grip, steering, nitro_seconds, gears})
        if (!(std::isfinite(v) && v > 0)) {
            failed = true;
            return;
        }
    if (!std::isfinite(yaw) || !(std::isfinite(nitro_boost) && nitro_boost >= 0)) {
        failed = true;
        return;
    }
    auto &world = *target->first;
    const auto e = target->second;
    if (!world.get<Heading>(e)) {
        const auto &box = *world.get<engine::Box>(e);
        world.set(e, Heading{0.0F, 0.0F, box.size.x / 2.0F, box.size.z / 2.0F});
    }
    auto &heading = *world.get<Heading>(e);
    heading.arcade = true;
    heading.spec.top_speed = static_cast<float>(top_speed);
    heading.spec.acceleration = static_cast<float>(acceleration);
    heading.spec.braking = static_cast<float>(braking);
    heading.spec.grip = static_cast<float>(grip);
    heading.spec.drift_grip = std::min(1.0F, static_cast<float>(drift_grip));
    heading.spec.steering = static_cast<float>(steering);
    heading.spec.nitro_boost = static_cast<float>(nitro_boost);
    heading.spec.nitro_seconds = static_cast<float>(nitro_seconds);
    heading.spec.gears = std::clamp(static_cast<int>(gears), 1, 9);
    heading.car = {};
    heading.car.yaw = heading.yaw = static_cast<float>(yaw);
}
// An AI driver on the staged arcade car (0.70.0): mode 0 off, 1 race, 2
// pursuit, 3 traffic; loop repeats the route; skill/aggression 0..1.
EXPORT void editor_set_driver(int index, int mode, int loop, double skill, double aggression, double speed_scale) {
    const auto target = staged(index);
    if (!target)
        return;
    if (mode < 0 || mode > 3 || !std::isfinite(skill) || !std::isfinite(aggression) ||
        !(std::isfinite(speed_scale) && speed_scale > 0)) {
        failed = true;
        return;
    }
    Driver driver;
    if (const auto *existing = target->first->get<Driver>(target->second))
        driver = *existing;
    driver.mode = static_cast<DriveMode>(mode);
    driver.loop = loop != 0;
    driver.skill = std::clamp(static_cast<float>(skill), 0.0F, 1.0F);
    driver.aggression = std::clamp(static_cast<float>(aggression), 0.0F, 1.0F);
    driver.speed_scale = static_cast<float>(speed_scale);
    target->first->set(target->second, driver);
}
// Driver text: field 0 = route ("x,z x,z ..."), 1 = pursuit target name.
EXPORT void editor_set_driver_text(int index, int field, const char *text) {
    const auto target = staged(index);
    if (!target || !text)
        return;
    auto *driver = target->first->get<Driver>(target->second);
    if (!driver)
        return;
    if (field == 0) {
        driver->route = parse_route(text);
        const auto &box = *target->first->get<engine::Box>(target->second);
        const auto *heading = target->first->get<Heading>(target->second);
        driver->next = route_start(driver->route, box.center, heading ? heading->yaw : 0.0F);
    } else if (field == 1) {
        driver->target_name = text;
    }
}
// Arcade car state for the editor (0.70.0): 0 speed, 1 forward speed, 2 gear
// (-1 reverse), 3 rpm 0..1, 4 nitro 0..1, 5 drifting, 6 boosting, 7 slip
// (radians), 8 front wheel angle, 9 handbrake input, 10 brake input, 11 is
// an arcade car, 12 yaw rate, 13 throttle input, 14 driver mode (-1 none, 0
// off, 1 race, 2 pursuit, 3 traffic). 0 without one.
EXPORT double editor_vehicle_value(int index, int field) {
    if (index < 0 || static_cast<std::size_t>(index) >= active->entities.size())
        return 0;
    const auto entity = active->entities[static_cast<std::size_t>(index)];
    if (!active->world.alive(entity))
        return 0;
    const auto *heading = active->world.get<Heading>(entity);
    if (!heading || !heading->arcade)
        return 0;
    const auto &car = heading->car;
    switch (field) {
    case 0: return std::hypot(car.velocity.x, car.velocity.z);
    case 1: return car.forward_speed;
    case 2: return car.gear;
    case 3: return car.rpm;
    case 4: return car.nitro;
    case 5: return car.drifting ? 1 : 0;
    case 6: return car.boosting ? 1 : 0;
    case 7: return car.slip;
    case 8: return car.steer;
    case 9: return heading->input.handbrake ? 1 : 0;
    case 10: return heading->input.brake;
    case 11: return 1;
    case 12: return car.yaw_rate;
    case 13: return heading->input.throttle;
    case 14: {
        const auto *driver = active->world.get<Driver>(entity);
        return driver ? static_cast<double>(static_cast<int>(driver->mode)) : -1;
    }
    default: return 0;
    }
}
// Soldier state for the editor: field 0 = mode (0 patrol, 1 investigate, 2
// combat, 3 search, 4 cover, 5 flee), 1 = facing yaw (radians; the facing is
// (sin, 0, cos)), 2 = awareness 0..1, 3 = team. -1 without a soldier.
EXPORT double editor_soldier_value(int index, int field) {
    if (index < 0 || static_cast<std::size_t>(index) >= active->entities.size())
        return -1;
    const auto entity = active->entities[static_cast<std::size_t>(index)];
    const auto *soldier = active->world.alive(entity) ? active->world.get<Soldier>(entity) : nullptr;
    if (!soldier)
        return -1;
    switch (field) {
    case 0:
        return static_cast<int>(soldier->mode);
    case 1:
        return soldier->yaw;
    case 2:
        return soldier->awareness;
    case 3:
        return soldier->team;
    default:
        return -1;
    }
}
// Gives the entity Weapons (0.61.0) from loadout text (see
// engine::gameplay::parse_weapons), after editor_add for the same index.
// Invalid text falls back to the default loadout and editor_weapons_error()
// says why.
EXPORT void editor_set_weapons(int index, const char *text) {
    const auto target = staged(index);
    if (!target || !text)
        return;
    auto parsed = engine::gameplay::parse_weapons(text);
    if (!parsed.error.empty()) {
        staging->weapons_error = parsed.error;
        parsed = engine::gameplay::parse_weapons(engine::gameplay::default_weapons_text);
    }
    Arsenal arsenal;
    arsenal.weapons = std::move(parsed.weapons);
    arsenal.state = engine::gameplay::make_weapon_state(arsenal.weapons);
    arsenal.state.rng = 0x9E3779B9U + static_cast<std::uint32_t>(index + 2) * 2654435761U;
    target->first->set(target->second, arsenal);
}
EXPORT const char *editor_weapons_error() { return active->weapons_error.c_str(); }
// Weapon HUD state: field 0 = current slot, 1 = rounds loaded, 2 = reserve
// (-1 unlimited), 3 = reload progress 0..1 (-1 when not reloading), 4 =
// current spread in degrees, 5 = weapon count, 6 = equip progress 0..1 (-1
// when ready), 7 = aiming, 8 = magazine size, 9 = aim zoom. 0 (and -1 for
// 3/6) without Weapons.
EXPORT double editor_weapon_value(int index, int field) {
    const bool progress_field = field == 3 || field == 6;
    if (index < 0 || static_cast<std::size_t>(index) >= active->entities.size())
        return progress_field ? -1 : 0;
    const auto entity = active->entities[static_cast<std::size_t>(index)];
    const auto *arsenal = active->world.alive(entity) ? active->world.get<Arsenal>(entity) : nullptr;
    if (!arsenal || arsenal->weapons.empty())
        return progress_field ? -1 : 0;
    const auto &state = arsenal->state;
    const auto slot = static_cast<std::size_t>(state.current);
    const auto &weapon = arsenal->weapons[slot];
    switch (field) {
    case 0:
        return static_cast<double>(slot);
    case 1:
        return state.magazine[slot];
    case 2:
        return state.reserve[slot];
    case 3:
        return state.reload_left > 0 ? 1.0 - state.reload_left / weapon.reload_time : -1;
    case 4: {
        const auto *controller = active->world.get<Controller>(entity);
        const float ratio = controller ? controller->state.speed / controller->settings.walk_speed : 0.0F;
        const bool airborne = controller && !controller->state.grounded;
        return engine::gameplay::current_spread(weapon, arsenal->aiming, ratio, airborne, state.bloom);
    }
    case 5:
        return static_cast<double>(arsenal->weapons.size());
    case 6:
        return state.equip_left > 0 && weapon.equip_time > 0 ? 1.0 - state.equip_left / weapon.equip_time : -1;
    case 7:
        return arsenal->aiming ? 1 : 0;
    case 8:
        return weapon.magazine;
    case 9:
        return weapon.zoom;
    default:
        return 0;
    }
}
// A weapon's name (field 0) or first-person model (field 1).
EXPORT const char *editor_weapon_text(int index, int slot, int field) {
    static std::string result;
    result.clear();
    if (index >= 0 && static_cast<std::size_t>(index) < active->entities.size()) {
        const auto entity = active->entities[static_cast<std::size_t>(index)];
        const auto *arsenal = active->world.alive(entity) ? active->world.get<Arsenal>(entity) : nullptr;
        if (arsenal && slot >= 0 && static_cast<std::size_t>(slot) < arsenal->weapons.size())
            result = field == 0 ? arsenal->weapons[static_cast<std::size_t>(slot)].name
                                : arsenal->weapons[static_cast<std::size_t>(slot)].model;
    }
    return result.c_str();
}
// Moves the combat event queue into a read buffer; returns its size.
std::vector<WeaponEvent> pending_weapon_events;
EXPORT int editor_take_weapon_events() {
    pending_weapon_events = std::move(active->weapon_events);
    active->weapon_events.clear();
    return static_cast<int>(pending_weapon_events.size());
}
// field 0 = kind (0 fire, 1 impact, 2 reload, 3 reloaded, 4 empty, 5
// switched, 6 explode, 7 damaged), 1 = shooter index, 2 = target index (-1
// none), 3-5 = point (fire: muzzle origin; damaged: attacker position), 6-8 =
// normal (fire: direction), 9 = value (fire: recoil degrees; reload: seconds;
// explode: radius; damaged: amount), 10 = flags (fire/switch/reload: slot;
// impact/damaged: 1 headshot, 2 killed, 4 flesh).
EXPORT double editor_weapon_event(int index, int field) {
    if (index < 0 || static_cast<std::size_t>(index) >= pending_weapon_events.size())
        return 0;
    const auto &e = pending_weapon_events[static_cast<std::size_t>(index)];
    switch (field) {
    case 0:
        return static_cast<int>(e.kind);
    case 1:
        return e.shooter;
    case 2:
        return e.target;
    case 3:
        return e.point.x;
    case 4:
        return e.point.y;
    case 5:
        return e.point.z;
    case 6:
        return e.normal.x;
    case 7:
        return e.normal.y;
    case 8:
        return e.normal.z;
    case 9:
        return e.value;
    case 10:
        return e.flags;
    default:
        return 0;
    }
}
}
