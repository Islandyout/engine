#include "engine/gameplay/space.hpp"

#include <cmath>
#include <iostream>
#include <stdexcept>
#include <string>

namespace {
void check(bool pass, const std::string &message) {
    if (!pass)
        throw std::runtime_error{message};
}
using namespace engine::gameplay::space;

constexpr double pi = 3.14159265358979323846;

// A small system shaped like Pale Signal's: a temperate planet with air and
// a flattened site, an airless moon, and a second planet farther out.
System make_system() {
    System system;
    system.star_gm = 6.4e12;
    Body tethys;
    tethys.name = "Tethys";
    tethys.orbit_radius = 1.6e6;
    tethys.period = 5027;
    tethys.radius = 60000;
    tethys.surface_gravity = 9.0;
    tethys.atmosphere_height = 9000;
    tethys.atmosphere_density = 1.05;
    tethys.terrain_amplitude = 300;
    tethys.terrain_scale = 3000;
    tethys.seed = 7;
    tethys.flats.push_back({{0, 1, 0}, 400});
    Body vell;
    vell.name = "Vell";
    vell.parent = 0;
    vell.orbit_radius = 230000;
    vell.period = 3850;
    vell.phase = 0.3;
    vell.radius = 18000;
    vell.surface_gravity = 2.6;
    vell.terrain_amplitude = 120;
    Body ossuary;
    ossuary.name = "Ossuary";
    ossuary.orbit_radius = 2.4e6;
    ossuary.period = 9230;
    ossuary.phase = 2.2;
    ossuary.radius = 52000;
    ossuary.surface_gravity = 6.4;
    system.bodies = {tethys, vell, ossuary};
    return system;
}

void run(ShipState &state, const ShipSpec &spec, const ShipInput &input, const System &system, double &t,
         double seconds) {
    for (int i = 0; i < static_cast<int>(seconds * 60); ++i) {
        step_ship(state, spec, input, system, t, 1.0 / 60.0);
        t += 1.0 / 60.0;
    }
}

bool near(double a, double b, double tolerance) { return std::abs(a - b) <= tolerance; }
} // namespace

int main() {
    try {
        const System system = make_system();
        const ShipSpec spec;
        {
            // Bodies on rails: circular orbits, children carried by parents,
            // velocity matching the motion.
            const DVec3 p0 = body_position(system, 0, 0);
            check(near(p0.x, 1.6e6, 1e-3) && near(p0.z, 0, 1e-3), "Tethys starts on +x at its orbit radius");
            const DVec3 quarter = body_position(system, 0, 5027.0 / 4);
            check(near(quarter.z, 1.6e6, 1) && near(quarter.x, 0, 1), "a quarter period later it is on +z");
            const DVec3 moon = body_position(system, 1, 100) - body_position(system, 0, 100);
            check(near(length(moon), 230000, 1e-3), "a moon keeps its orbit radius around its parent");
            const DVec3 v = body_velocity(system, 1, 100);
            const DVec3 fd = (body_position(system, 1, 100.5) - body_position(system, 1, 99.5)) * 1.0;
            check(length(v - fd) < 0.05, "body velocity matches its motion");
        }
        {
            // Air: full density at the surface, thinning, gone above the top.
            const auto &tethys = system.bodies[0];
            check(near(air_density(tethys, 0), 1.05, 1e-9), "surface density");
            check(air_density(tethys, 5000) < air_density(tethys, 1000), "air thins with altitude");
            check(air_density(tethys, tethys.atmosphere_top() + 1) == 0, "no air above the top");
            check(air_density(system.bodies[1], 0) == 0, "an airless moon");
        }
        {
            // Terrain: deterministic, bounded, flattened at the site.
            const auto &tethys = system.bodies[0];
            const DVec3 d = normalized(DVec3{0.3, 0.4, 0.8});
            check(surface_height(tethys, d) == surface_height(tethys, d), "terrain is deterministic");
            double lo = 1e9, hi = -1e9;
            for (int i = 0; i < 400; ++i) {
                const double a = i * 0.731, b = i * 0.377;
                const double h = surface_height(tethys, {std::cos(a) * std::sin(b), std::cos(b), std::sin(a) * std::sin(b)});
                lo = std::min(lo, h);
                hi = std::max(hi, h);
            }
            check(hi > 20 && lo < -20 && hi < 600 && lo > -600, "terrain has bounded relief");
            const double centre = surface_height(tethys, {0, 1, 0});
            const double inside = surface_height(tethys, normalized(DVec3{300.0 / 60000.0, 1, 0}));
            check(near(inside, centre, 1e-6), "the site flat is level");
            check(dot(surface_normal(tethys, {0, 1, 0}), {0, 1, 0}) > 0.9999, "the flat's normal is straight up");
        }
        {
            // Landed at the site: an idle ship stays put; the belly thrusters
            // lift it off; STABILIZED then holds a hover.
            ShipState ship;
            double t = 0;
            place_landed(ship, spec, system, 0, {0, 1, 0}, {0, 0, 1});
            check(ship.landed && near(ship.altitude, 0, 1e-9), "placed on the ground");
            run(ship, spec, {}, system, t, 3);
            check(ship.landed && !ship.lifted_off, "an idle landed ship stays landed");
            ShipInput up;
            up.vertical = 1;
            run(ship, spec, up, system, t, 1.5);
            check(!ship.landed && ship.altitude > 2, "vertical thrust lifts off");
            run(ship, spec, {}, system, t, 4);
            const double held = ship.altitude;
            run(ship, spec, {}, system, t, 4);
            check(std::abs(ship.vertical_speed) < 0.3 && near(ship.altitude, held, 1.5),
                  "stabilized hover holds altitude");
            ShipInput down;
            down.vertical = -0.3;
            for (int i = 0; i < 60 * 30 && !ship.touched_down; ++i) {
                step_ship(ship, spec, down, system, t, 1.0 / 60.0);
                t += 1.0 / 60.0;
            }
            check(ship.landed && ship.touched_down && !ship.last_touchdown.rough, "a gentle descent lands cleanly");
            check(ship.hull == spec.hull, "a clean landing does no damage");
        }
        {
            // A hard landing is rough and costs hull.
            ShipState ship;
            double t = 0;
            place_landed(ship, spec, system, 0, {0, 1, 0}, {0, 0, 1});
            ship.landed = false;
            ship.position = ship.position + normalized(ship.position) * 40.0;
            ship.velocity = normalized(ship.position) * -30.0;
            ShipInput manual;
            manual.assist = Assist::manual;
            run(ship, spec, manual, system, t, 2);
            check(ship.landed && ship.last_touchdown.rough && ship.last_touchdown.damage > 0, "30 m/s is rough");
            check(ship.hull < spec.hull, "a rough landing damages the hull");
        }
        {
            // An airless circular orbit closes on itself, and its elements
            // and predicted path agree.
            ShipState ship;
            double t = 0;
            place_in_orbit(ship, system, 1, 8000);
            const OrbitElements e = orbit_elements(ship, system);
            check(e.valid && e.closed && near(e.periapsis, 8000, 50) && near(e.apoapsis, 8000, 50),
                  "a circular orbit's periapsis and apoapsis match its altitude");
            const DVec3 start = ship.position;
            ShipInput coast;
            coast.assist = Assist::manual;
            run(ship, spec, coast, system, t, e.period);
            check(ship.ref == 1, "the orbit stays inside the moon's sphere of influence");
            check(length(ship.position - start) < 0.02 * length(start), "one period returns to the start");
            const auto path = predict_path(ship, system, e.period, 64);
            check(path.size() == 64, "the predicted path covers the orbit");
            for (const auto &p : path)
                check(near(length(p), 18000 + 8000, 400), "predicted points stay at orbit radius");
        }
        {
            // The main engine accelerates along the nose and burns fuel.
            ShipState ship;
            double t = 0;
            place_in_orbit(ship, system, 1, 8000);
            const DVec3 v0 = ship.velocity;
            ShipInput burn;
            burn.assist = Assist::manual;
            burn.throttle = 1;
            step_ship(ship, spec, burn, system, t, 1.0);
            const double gained = dot(ship.velocity - v0, ship_forward(ship));
            check(near(gained, spec.thrust / spec.mass, 0.5), "thrust adds thrust/mass along the nose");
            check(near(ship.fuel, spec.fuel - spec.burn, 1e-6), "full throttle burns fuel at the burn rate");
        }
        {
            // NAV prograde turns the nose onto the velocity.
            ShipState ship;
            double t = 0;
            place_in_orbit(ship, system, 1, 8000);
            ship.attitude = axis_angle({1, 0, 0}, 1.2) * ship.attitude;
            ShipInput nav;
            nav.assist = Assist::prograde;
            run(ship, spec, nav, system, t, 6);
            check(dot(ship_forward(ship), normalized(ship.velocity)) > 0.995, "prograde hold points along velocity");
            nav.assist = Assist::retrograde;
            run(ship, spec, nav, system, t, 8);
            check(dot(ship_forward(ship), normalized(ship.velocity)) < -0.995, "retrograde hold points against it");
        }
        {
            // Manual pitch input raises the nose; letting go stops the turn.
            ShipState ship;
            double t = 0;
            place_in_orbit(ship, system, 1, 8000);
            const DVec3 up0 = ship_up(ship), f0 = ship_forward(ship);
            ShipInput pitch;
            pitch.assist = Assist::manual;
            pitch.pitch = 1;
            run(ship, spec, pitch, system, t, 0.5);
            check(dot(ship_forward(ship), up0) > 0.05, "pitching up raises the nose toward the ship's up");
            check(dot(ship_forward(ship), f0) < 1, "the nose moved");
            ShipInput yaw;
            yaw.assist = Assist::manual;
            yaw.yaw = 1;
            ShipState turned = ship;
            const DVec3 left = rotate(turned.attitude, {1, 0, 0});
            run(turned, spec, yaw, system, t, 0.5);
            check(dot(ship_forward(turned), left) < -0.05, "yawing right turns the nose to the right");
        }
        {
            // Air drags a fast ship down and heats it.
            ShipState ship;
            double t = 0;
            place_landed(ship, spec, system, 0, {0, 1, 0}, {0, 0, 1});
            ship.landed = false;
            ship.position = ship.position + normalized(ship.position) * 2000.0;
            ship.velocity = ship_forward(ship) * 600.0;
            ShipInput manual;
            manual.assist = Assist::manual;
            run(ship, spec, manual, system, t, 2);
            check(length(ship.velocity) < 560, "drag slows a fast ship in thick air");
            check(ship.heat > 1, "fast flight in air heats the hull");
        }
        {
            // Leaving a sphere of influence hands the ship to the parent
            // (the star), keeping its absolute position and velocity.
            ShipState ship;
            double t = 0;
            ship.ref = 2;
            ship.position = {0, 0, sphere_of_influence(system, 2) - 10};
            ship.velocity = {0, 0, 200};
            const DVec3 abs0 = body_position(system, 2, t) + ship.position;
            const DVec3 vel0 = body_velocity(system, 2, t) + ship.velocity;
            ShipInput coast;
            coast.assist = Assist::manual;
            run(ship, spec, coast, system, t, 1);
            check(ship.ref == -1 && ship.changed_ref, "leaving the SOI switches to the star");
            const DVec3 abs1 = ship.position;
            check(length(abs1 - (abs0 + vel0 * 1.0)) < 50, "the absolute position carries over");
            // And back in: approaching Vell from inside Tethys' SOI picks the moon.
            ShipState probe;
            probe.ref = 0;
            const DVec3 moon = body_position(system, 1, 0) - body_position(system, 0, 0);
            probe.position = moon + normalized(moon) * (sphere_of_influence(system, 1) - 100);
            probe.velocity = body_velocity(system, 1, 0) - body_velocity(system, 0, 0);
            step_ship(probe, spec, coast, system, 0, 1.0 / 60.0);
            check(probe.ref == 1, "entering a moon's SOI switches to the moon");
        }
        {
            // Surface to space with no scene change: lift off from the site,
            // pitch 45 degrees east under full throttle, and climb out of the
            // atmosphere.
            ShipState ship;
            double t = 0;
            place_landed(ship, spec, system, 0, {0, 1, 0}, {0, 0, 1});
            ShipInput climb;
            climb.vertical = 1;
            run(ship, spec, climb, system, t, 2);
            climb.vertical = 0;
            climb.throttle = 1;
            climb.assist = Assist::target;
            climb.target_direction = normalized(DVec3{0, 1, 1});
            for (int i = 0; i < 60 * 120 && ship.altitude < system.bodies[0].atmosphere_top() + 500; ++i) {
                climb.target_direction = normalized(normalized(ship.position) + DVec3{0, 0, 1} * 1.0);
                step_ship(ship, spec, climb, system, t, 1.0 / 60.0);
                t += 1.0 / 60.0;
            }
            check(!ship.destroyed && ship.altitude > system.bodies[0].atmosphere_top(), "the ship climbs out of the air");
            check(ship.density == 0 && ship.ref == 0, "in space, still in Tethys' sphere of influence");
        }
        (void)pi;
        std::cout << "space tests passed\n";
        return 0;
    } catch (const std::exception &error) {
        std::cerr << "FAILED: " << error.what() << "\n";
        return 1;
    }
}
