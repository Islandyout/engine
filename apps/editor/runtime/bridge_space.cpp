// Editor runtime exports for the SpaceSystem, sites, routines and wildlife
// (split from bridge.cpp in 0.77.0).
#include "bridge_runtime.hpp"

extern "C" {
// ---- Spaceflight (0.71.0) staging: the SpaceSystem component sends the
// star and site (editor_space_begin) and then each body (editor_space_body);
// the Spaceship component marks the flown entity (editor_set_spaceship).
// Degrees for angles. Bad numbers fail the commit.
EXPORT void editor_space_begin(double star_gm, int site_body, double site_latitude, double site_longitude,
                               double site_radius, double eva_range, double start_time) {
    if (!staging)
        return;
    for (const double v : {star_gm, site_latitude, site_longitude, site_radius, eva_range, start_time})
        if (!std::isfinite(v)) {
            failed = true;
            return;
        }
    if (!(star_gm > 0) || !(eva_range >= 50) || eva_range > 20000 || site_radius < 0) {
        failed = true;
        return;
    }
    SpaceSim sim;
    sim.system.star_gm = star_gm;
    sim.site_body = site_body;
    sim.eva_range = eva_range;
    sim.time = start_time;
    const double lat = site_latitude * 3.14159265358979 / 180, lon = site_longitude * 3.14159265358979 / 180;
    const space::DVec3 dir{std::cos(lat) * std::cos(lon), std::sin(lat), std::cos(lat) * std::sin(lon)};
    sim.axis_y = space::normalized(dir);
    sim.site_origin = sim.axis_y * site_radius; // radius of the flat; resolved at commit
    staging->space = std::move(sim);
}
EXPORT void editor_space_body(const char *name, int parent, double orbit_radius, double period, double phase,
                              double inclination, double radius, double gravity, double atmosphere_height,
                              double atmosphere_density, double terrain_amplitude, double terrain_scale, double seed) {
    if (!staging || !staging->space || !name)
        return;
    for (const double v : {orbit_radius, period, phase, inclination, radius, gravity, atmosphere_height,
                           atmosphere_density, terrain_amplitude, terrain_scale, seed})
        if (!std::isfinite(v)) {
            failed = true;
            return;
        }
    auto &bodies = staging->space->system.bodies;
    if (bodies.size() >= 32 || !(radius > 0) || !(gravity > 0) || !(period > 0) || orbit_radius < 0 ||
        parent >= static_cast<int>(bodies.size()) || parent < -1 || atmosphere_height < 0 || atmosphere_density < 0 ||
        terrain_amplitude < 0 || !(terrain_scale > 0)) {
        failed = true;
        return;
    }
    space::Body body;
    body.name = name;
    body.parent = parent;
    body.orbit_radius = orbit_radius;
    body.period = period;
    body.phase = phase * 3.14159265358979 / 180;
    body.inclination = inclination * 3.14159265358979 / 180;
    body.radius = radius;
    body.surface_gravity = gravity;
    body.atmosphere_height = atmosphere_height;
    body.atmosphere_density = atmosphere_density;
    body.terrain_amplitude = terrain_amplitude;
    body.terrain_scale = terrain_scale;
    body.seed = static_cast<std::uint32_t>(std::max(0.0, seed));
    bodies.push_back(std::move(body));
}
// The mouse's virtual stick (0.75.0): yaw and pitch, -1..1, held until the
// next call; keys take over while pressed.
EXPORT void editor_space_stick(double yaw, double pitch) {
    if (!active || !active->space)
        return;
    active->space->stick_yaw = std::isfinite(yaw) ? yaw : 0;
    active->space->stick_pitch = std::isfinite(pitch) ? pitch : 0;
}
// The last staged body's sea level (m relative to its radius): water is its
// surface below that height (0.72.0).
EXPORT void editor_space_body_sea(double sea_level) {
    if (!staging || !staging->space || staging->space->system.bodies.empty() || !std::isfinite(sea_level))
        return;
    staging->space->system.bodies.back().sea_level = sea_level;
}
// The last added body's terrain features and turn (0.74.0): crater density
// (0..1), lava rifts and dunes (0/1), and seconds per turn (0: none).
EXPORT void editor_space_body_features(double craters, int rifts, int dunes, double day) {
    if (!staging || !staging->space || staging->space->system.bodies.empty())
        return;
    auto &b = staging->space->system.bodies.back();
    b.craters = std::isfinite(craters) ? std::clamp(craters, 0.0, 1.0) : 0.0;
    b.rifts = rifts != 0;
    b.dunes = dunes != 0;
    b.day = std::isfinite(day) && day > 0 ? day : 0.0;
}
// The last added body starts hidden (0.73.0): not drawn or listed until a
// script reveals it (space.call("reveal", name)).
EXPORT void editor_space_body_hidden(int hidden) {
    if (!staging || !staging->space || staging->space->system.bodies.empty())
        return;
    staging->space->system.bodies.back().hidden = hidden != 0;
}
// A Site (0.73.0): entity `index` anchors the entities given to it with
// editor_space_member around a surface point of body `body`. Sites are
// numbered in the order they're added.
EXPORT void editor_space_site(int index, const char *name, int body, double latitude, double longitude, double radius) {
    if (!staging || !staging->space || !name || !std::isfinite(latitude) || !std::isfinite(longitude) ||
        !(radius > 0) || body < 0 || body >= static_cast<int>(staging->space->system.bodies.size()))
        return;
    const double lat = latitude * 3.14159265358979 / 180, lon = longitude * 3.14159265358979 / 180;
    SpaceSim::SiteInfo info;
    info.name = name;
    info.body = body;
    info.up = {std::cos(lat) * std::cos(lon), std::sin(lat), std::cos(lat) * std::sin(lon)};
    info.radius = radius;
    if (const auto target = staged(index))
        info.entity = target->second;
    staging->space->sites.push_back(std::move(info));
    // A site is level ground, like the home site.
    auto &b = staging->space->system.bodies[static_cast<std::size_t>(body)];
    b.flats.push_back({staging->space->sites.back().up, radius});
}
EXPORT void editor_space_member(int index, int site) {
    if (!staging || !staging->space || site < 0 || site >= static_cast<int>(staging->space->sites.size()))
        return;
    if (const auto target = staged(index))
        staging->space->members[target->second] = site;
}
// A Routine (0.73.0): "hour x z; hour x z; ..." stops, walked at `speed`.
EXPORT void editor_set_routine(int index, const char *stops, double speed) {
    const auto target = staged(index);
    if (!target || !stops || !(speed > 0))
        return;
    Routine routine;
    routine.speed = static_cast<float>(speed);
    // "hour x z [activity]; ..." -- the activity word (0.75.0) is for the
    // editor's animation; the simulation only needs where and when.
    std::string text{stops};
    for (auto &c : text)
        if (c == ';' || c == ',')
            c = ' ';
    std::istringstream in{text};
    std::vector<double> numbers;
    std::string token;
    const auto flush = [&] {
        for (std::size_t i = 0; i + 2 < numbers.size(); i += 3)
            if (std::isfinite(numbers[i]) && std::isfinite(numbers[i + 1]) && std::isfinite(numbers[i + 2]))
                routine.stops.push_back({static_cast<float>(numbers[i]), static_cast<float>(numbers[i + 1]),
                                         static_cast<float>(numbers[i + 2])});
        numbers.clear();
    };
    while (in >> token) {
        char *end = nullptr;
        const double v = std::strtod(token.c_str(), &end);
        if (end && *end == '\0' && end != token.c_str())
            numbers.push_back(v);
        else
            flush(); // an activity word ends its stop
    }
    flush();
    std::sort(routine.stops.begin(), routine.stops.end(),
              [](const Routine::Stop &a, const Routine::Stop &b) { return a.hour < b.hour; });
    target->first->set(target->second, std::move(routine));
}
// The stop a Routine is at or heading for (0.75.0): its index in hour
// order, -1 without a Routine.
EXPORT int editor_routine_stop(int index) {
    if (index < 0 || static_cast<std::size_t>(index) >= active->entities.size())
        return -1;
    const auto entity = active->entities[static_cast<std::size_t>(index)];
    const auto *routine = active->world.alive(entity) ? active->world.get<Routine>(entity) : nullptr;
    return routine ? routine->current : -1;
}
EXPORT void editor_set_wildlife(int index, double wary, double flee, double speed, double leash) {
    const auto target = staged(index);
    if (!target || !(wary > 0) || !(flee > 0) || !(speed > 0) || !(leash > 0))
        return;
    Wildlife animal;
    animal.wary = static_cast<float>(wary);
    animal.flee = static_cast<float>(flee);
    animal.speed = static_cast<float>(speed);
    animal.leash = static_cast<float>(leash);
    target->first->set(target->second, animal);
}
// Moves entity `index` by (dx, dz) on the ground (0.73.0): the editor's
// solid scatter (large minerals) pushes the walker out of itself.
EXPORT void editor_push(int index, double dx, double dz) {
    if (index < 0 || static_cast<std::size_t>(index) >= active->entities.size() || !std::isfinite(dx) ||
        !std::isfinite(dz) || std::abs(dx) > 5 || std::abs(dz) > 5)
        return;
    const auto entity = active->entities[static_cast<std::size_t>(index)];
    if (auto *box = active->world.alive(entity) ? active->world.get<engine::Box>(entity) : nullptr) {
        box->center.x += static_cast<float>(dx);
        box->center.z += static_cast<float>(dz);
    }
}
// 0 calm, 1 wary, 2 fleeing; -1 not wildlife.
EXPORT int editor_wildlife_state(int index) {
    if (index < 0 || static_cast<std::size_t>(index) >= active->entities.size())
        return -1;
    const auto entity = active->entities[static_cast<std::size_t>(index)];
    const auto *animal = active->world.alive(entity) ? active->world.get<Wildlife>(entity) : nullptr;
    return animal ? animal->state : -1;
}
// Ship tuning; `start_orbit` >= 0 starts in a circular orbit that high above
// the site body instead of landed where the entity is authored. `heading` is
// the entity's yaw (radians).
EXPORT void editor_set_spaceship(int index, double heading, double mass, double thrust, double lift_thrust, double rcs,
                                 double max_rate, double fuel, double burn, double hull, double gear_clearance,
                                 int start_piloting, double start_orbit) {
    const auto target = staged(index);
    if (!target || !staging || !staging->space || staging->adding_template)
        return;
    for (const double v : {heading, mass, thrust, lift_thrust, rcs, max_rate, fuel, burn, hull, gear_clearance,
                           start_orbit})
        if (!std::isfinite(v)) {
            failed = true;
            return;
        }
    if (!(mass > 0) || thrust < 0 || lift_thrust < 0 || !(rcs > 0) || !(max_rate > 0) || fuel < 0 || burn < 0 ||
        !(hull > 0) || gear_clearance < 0) {
        failed = true;
        return;
    }
    auto &sim = *staging->space;
    sim.spec.mass = mass;
    sim.spec.thrust = thrust;
    sim.spec.lift_thrust = lift_thrust;
    sim.spec.rcs = rcs;
    sim.spec.max_rate = max_rate;
    sim.spec.fuel = fuel;
    sim.spec.burn = burn;
    sim.spec.hull = hull;
    sim.spec.gear_clearance = gear_clearance;
    sim.ship.fuel = fuel;
    sim.ship.hull = hull;
    sim.ship_entity = target->second;
    sim.piloting = start_piloting != 0;
    // Resolved at commit, once the site frame exists.
    sim.ship.heat = 0;
    sim.ship.position = {heading, start_orbit, 0};
    target->first->set(target->second, Spaceship{});
}
} // extern "C"
namespace editor_bridge {
// Builds the site frame, the walkable heightfield and the ship's starting
// state once every staged piece is in.
bool finish_space(Runtime &rt) {
    auto &sim = *rt.space;
    if (sim.site_body < 0 || sim.site_body >= static_cast<int>(sim.system.bodies.size()))
        return false;
    auto &site = sim.system.bodies[static_cast<std::size_t>(sim.site_body)];
    const double flat_radius = space::length(sim.site_origin);
    if (flat_radius > 0)
        site.flats.push_back({sim.axis_y, flat_radius});
    rt.anchor_frame(sim.site_body, sim.axis_y);
    sim.home_body = sim.site_body;
    sim.home_origin = sim.site_origin;
    sim.home_x = sim.axis_x;
    sim.home_y = sim.axis_y;
    sim.home_z = sim.axis_z;
    sim.home_ground = rt.terrain;
    sim.home_ground_y = rt.physics_config.ground_y;
    sim.frame_generation = 0;
    // Other sites' entities wait, parked, until the ship lands there.
    sim.active_site = -1;
    rt.update_parking(rt.world);
    // The ship: landed where it was authored, or in orbit.
    if (sim.ship_entity && rt.world.alive(*sim.ship_entity)) {
        // The space simulation moves the ship; physics only sees its collider.
        rt.world.remove<engine::physics::RigidBody>(*sim.ship_entity);
        const double heading = sim.ship.position.x, orbit = sim.ship.position.y;
        if (orbit >= 0) {
            space::place_in_orbit(sim.ship, sim.system, sim.site_body, orbit);
        } else {
            const auto c = rt.world.get<engine::Box>(*sim.ship_entity)->center;
            const auto p = sim.site_origin + sim.axis_x * c.x + sim.axis_y * c.y + sim.axis_z * c.z;
            const auto forward = sim.axis_x * std::sin(heading) + sim.axis_z * std::cos(heading);
            space::place_landed(sim.ship, sim.spec, sim.system, sim.site_body, p, forward, sim.time);
        }
        const auto local = sim.to_local(sim.ship_absolute());
        rt.world.get<engine::Box>(*sim.ship_entity)->center = {static_cast<float>(local.x), static_cast<float>(local.y),
                                                               static_cast<float>(local.z)};
        rt.settle_landed(rt.world);
        if (sim.piloting) {
            if (rt.player_entity(rt.world)) {
                rt.stow_player(rt.world);
                rt.place_stowed(rt.world);
            } else {
                sim.piloting = true; // nobody to walk: always flying
            }
        }
    } else {
        sim.ship_entity.reset();
        sim.piloting = false;
    }
    return true;
}
} // namespace editor_bridge
extern "C" {
// Spaceflight readouts for the editor (0.71.0). The fields are SpaceField
// (bridge_fields.hpp, generated from tools/bridge/fields.mjs). 0 without a
// SpaceSystem.
EXPORT double editor_space_value(int field) {
    if (!active->space)
        return 0;
    const auto &sp = *active->space;
    const auto local = sp.to_local(sp.ship_absolute());
    const auto frame = space::conjugate(space::from_axes(sp.axis_x, sp.axis_y, sp.axis_z)) * space::conjugate(sp.spin());
    const auto attitude = space::normalized(frame * sp.ship.attitude);
    const auto orbit = space::orbit_elements(sp.ship, sp.system);
    const auto finite = [](double v) { return std::isfinite(v) ? v : 1e12; };
    switch (static_cast<SpaceField>(field)) {
    case SpaceField::piloting: return sp.piloting ? 1 : 0;
    case SpaceField::ship_x: return local.x;
    case SpaceField::ship_y: return local.y;
    case SpaceField::ship_z: return local.z;
    case SpaceField::attitude_x: return attitude.x;
    case SpaceField::attitude_y: return attitude.y;
    case SpaceField::attitude_z: return attitude.z;
    case SpaceField::attitude_w: return attitude.w;
    case SpaceField::altitude: return finite(sp.ship.altitude);
    case SpaceField::speed: return space::length(sp.ship.velocity);
    case SpaceField::vertical_speed: return sp.ship.vertical_speed;
    case SpaceField::ground_speed: return sp.ship.ground_speed;
    case SpaceField::throttle: return sp.ship.throttle;
    case SpaceField::fuel: return sp.spec.fuel > 0 ? sp.ship.fuel / sp.spec.fuel : 0;
    case SpaceField::hull: return sp.ship.hull / sp.spec.hull;
    case SpaceField::heat: return sp.ship.heat;
    case SpaceField::air_density: return sp.ship.density;
    case SpaceField::warp: return sp.warp;
    case SpaceField::assist: return static_cast<int>(sp.assist);
    case SpaceField::landed: return sp.ship.landed ? 1 : 0;
    case SpaceField::periapsis: return orbit.valid ? finite(orbit.periapsis) : 0;
    case SpaceField::apoapsis: return orbit.valid ? finite(orbit.apoapsis) : 0;
    case SpaceField::orbit_closed: return orbit.valid && orbit.closed ? 1 : 0;
    case SpaceField::reference_body: return sp.ship.ref;
    case SpaceField::g_force: return sp.ship.g_force;
    case SpaceField::engine_on: return sp.ship.engine_on ? 1 : 0;
    case SpaceField::belly_thrust: return sp.vertical_applied;
    case SpaceField::system_time: return sp.time;
    case SpaceField::destroyed: return sp.ship.destroyed ? 1 : 0;
    case SpaceField::target_body: return sp.target;
    case SpaceField::target_distance:
        return sp.target >= 0 ? space::length(space::body_position(sp.system, sp.target, sp.time) - sp.ship_absolute()) -
                                    sp.system.bodies[static_cast<std::size_t>(sp.target)].radius
                              : 0;
    case SpaceField::site_distance: return space::length(local);
    case SpaceField::orbit_period: return orbit.valid ? orbit.period : 0;
    case SpaceField::eccentricity: return orbit.valid ? orbit.eccentricity : 0;
    case SpaceField::reference_radius: return sp.ship.ref >= 0 ? sp.system.bodies[static_cast<std::size_t>(sp.ship.ref)].radius : 0;
    case SpaceField::has_space_system: return 1;
    case SpaceField::body_count: return static_cast<double>(sp.system.bodies.size());
    case SpaceField::away: return sp.away ? 1 : 0;
    case SpaceField::frame_generation: return sp.frame_generation;
    case SpaceField::frame_body: return sp.site_body;
    case SpaceField::active_site: return sp.active_site;
    // 55/56 the frame origin's latitude/longitude on its body (0.75.0):
    // where the frame is, for anything that must be the same next visit.
    case SpaceField::frame_latitude: return std::asin(std::clamp(space::normalized(sp.site_origin).y, -1.0, 1.0)) * 180 / 3.14159265358979;
    case SpaceField::frame_longitude: return std::atan2(space::normalized(sp.site_origin).z, space::normalized(sp.site_origin).x) * 180 / 3.14159265358979;
    case SpaceField::reframe_shift_x: return sp.reframe_generation == sp.frame_generation ? sp.reframe_shift.x : 0;
    case SpaceField::reframe_shift_y: return sp.reframe_generation == sp.frame_generation ? sp.reframe_shift.y : 0;
    case SpaceField::reframe_shift_z: return sp.reframe_generation == sp.frame_generation ? sp.reframe_shift.z : 0;
    case SpaceField::reframe_yaw: return sp.reframe_generation == sp.frame_generation ? sp.reframe_yaw : 0;
    case SpaceField::autopilot: return sp.assist == space::Assist::autopilot ? 1 : 0;
    case SpaceField::engine_condition: return sp.ship.engine;
    case SpaceField::rcs_condition: return sp.ship.rcs_condition;
    case SpaceField::gear_condition: return sp.ship.gear;
    case SpaceField::scanner_condition: return sp.ship.scanner;
    case SpaceField::wind_speed: return space::length(sp.wind_local);
    case SpaceField::ground_slope: case SpaceField::water_below: {
        // Under the ship (0.74.0): the ground's slope in degrees, and water.
        if (sp.ship.ref < 0)
            return 0;
        const auto &body = sp.system.bodies[static_cast<std::size_t>(sp.ship.ref)];
        const auto dir = space::normalized(sp.fixed(sp.ship.position, sp.ship.ref));
        if (static_cast<SpaceField>(field) == SpaceField::water_below)
            return space::terrain_height(body, dir) < body.sea_level ? 1 : 0;
        return std::acos(std::clamp(space::dot(space::surface_normal(body, dir), dir), -1.0, 1.0)) * 180 / 3.14159265358979;
    }
    case SpaceField::land_sink: return sp.spec.land_vertical * (0.5 + 0.5 * space::component_efficiency(sp.ship.gear));
    case SpaceField::land_slope: return sp.spec.land_slope * 180 / 3.14159265358979;
    case SpaceField::land_drift: return sp.spec.land_lateral;
    default: return 0;
    }
}
// Body `index` (-1 the star): 0-2 its centre in the site frame, 3 radius, 4
// atmosphere top, 5 surface air density, 6 surface gravity, 7 atmosphere
// height, 8 parent, 9 terrain amplitude.
EXPORT double editor_space_body_value(int index, int field) {
    if (!active->space || index < -1 || index >= static_cast<int>(active->space->system.bodies.size()))
        return 0;
    const auto &sp = *active->space;
    const auto centre = sp.to_local(space::body_position(sp.system, index, sp.time));
    if (field <= 2)
        return field == 0 ? centre.x : field == 1 ? centre.y : centre.z;
    if (index < 0)
        return 0;
    const auto &b = sp.system.bodies[static_cast<std::size_t>(index)];
    switch (field) {
    case 3: return b.radius;
    case 4: return b.atmosphere_top();
    case 5: return b.atmosphere_density;
    case 6: return b.surface_gravity;
    case 7: return b.atmosphere_height;
    case 8: return b.parent;
    case 9: return b.terrain_amplitude;
    case 10: return b.hidden ? 1 : 0;
    default: return 0;
    }
}
// The rotation from body frames to the site frame, as a quaternion (field
// 0-3: x, y, z, w). Planets are meshed in their own frame and turned by it.
EXPORT double editor_space_frame(int field) {
    if (!active->space)
        return field == 3 ? 1 : 0;
    const auto &sp = *active->space;
    const auto q = space::conjugate(space::from_axes(sp.axis_x, sp.axis_y, sp.axis_z)) * space::conjugate(sp.spin());
    return field == 0 ? q.x : field == 1 ? q.y : field == 2 ? q.z : q.w;
}
// Body `index`'s turn now, body-fixed -> non-rotating, as a quaternion
// (field 0-3: x, y, z, w) (0.74.0). A planet's mesh and landmarks are
// turned by editor_space_frame times this.
EXPORT double editor_space_body_spin(int index, int field) {
    if (!active->space || index < 0 || index >= static_cast<int>(active->space->system.bodies.size()))
        return field == 3 ? 1 : 0;
    const auto q = active->space->spin(index);
    return field == 0 ? q.x : field == 1 ? q.y : field == 2 ? q.z : q.w;
}
// Lava under a body-fixed direction (0..1), for drawing rifts (0.74.0).
EXPORT double editor_planet_lava(int index, double x, double y, double z) {
    if (!active->space || index < 0 || index >= static_cast<int>(active->space->system.bodies.size()))
        return 0;
    return space::lava(active->space->system.bodies[static_cast<std::size_t>(index)], {x, y, z});
}
// A body's terrain height (m above its radius) under a direction from its
// centre, in the body's frame -- the ground, under any sea: what the
// editor meshes planets from.
EXPORT double editor_planet_height(int index, double x, double y, double z) {
    if (!active->space || index < 0 || index >= static_cast<int>(active->space->system.bodies.size()))
        return 0;
    return space::terrain_height(active->space->system.bodies[static_cast<std::size_t>(index)], {x, y, z});
}
// The walkable ground's site-frame height at x, z (the heightfield the
// SpaceSystem built around the site).
EXPORT double editor_space_ground(double x, double z) {
    if (!active->space)
        return 0;
    return active->site_ground(static_cast<float>(x), static_cast<float>(z));
}
// 1 when the walk frame's point x, z is under the sea (0.72.0).
EXPORT int editor_space_wet(double x, double z) {
    if (!active->space)
        return 0;
    const auto &sp = *active->space;
    const auto &body = sp.system.bodies[static_cast<std::size_t>(sp.site_body)];
    const auto p = sp.site_origin + sp.axis_x * x + sp.axis_z * z;
    return space::terrain_height(body, p) < body.sea_level ? 1 : 0;
}
// Predicts the ship's coasting path (see space::predict_path) over
// `horizon` seconds (0: one orbital period, capped); returns the point count.
EXPORT int editor_space_path(int count, double horizon) {
    if (!active->space)
        return 0;
    auto &sp = *active->space;
    if (!(horizon > 0)) {
        const auto orbit = space::orbit_elements(sp.ship, sp.system);
        horizon = orbit.valid && orbit.closed ? std::min(orbit.period, 40000.0) : 3000.0;
    }
    count = std::clamp(count, 2, 512);
    // An orbit is drawn as the ellipse it is; a path that comes down
    // (0.75.0) is drawn over the turning ground, so where it meets the
    // surface is where the ship will land.
    sp.path = sp.ship.landed ? std::vector<space::DVec3>{} : space::predict_path(sp.ship, sp.system, horizon, count);
    sp.path_fixed = false;
    if (!sp.ship.landed && sp.ship.ref >= 0 && static_cast<int>(sp.path.size()) < count) {
        sp.path = space::predict_path(sp.ship, sp.system, horizon, count, sp.time);
        sp.path_fixed = true;
    }
    return static_cast<int>(sp.path.size());
}
// Point i of the last predicted path, relative to the reference body's
// centre in the body frame (axis 0-2).
EXPORT double editor_space_path_value(int i, int axis) {
    if (!active->space || i < 0 || static_cast<std::size_t>(i) >= active->space->path.size())
        return 0;
    const auto &sp = *active->space;
    // Body-fixed: the path is drawn on the (turning) reference body.
    const auto &point = sp.path[static_cast<std::size_t>(i)];
    const auto p = sp.path_fixed || sp.ship.ref < 0 ? point : sp.fixed(point, sp.ship.ref);
    return axis == 0 ? p.x : axis == 1 ? p.y : p.z;
}
}
