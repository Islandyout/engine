#pragma once

#include <cstdint>
#include <functional>
#include <string>
#include <vector>

namespace engine::gameplay::space {

// Spaceflight (0.71.0): a star system on rails and a ship flown through
// it by hand, from a planet's surface through its atmosphere to orbit and
// on to another world, with no scene change on the way. Everything is in
// double precision: a system is millions of metres across, which floats
// can't hold to the centimetre. Units are metres, seconds, radians.

struct DVec3 final {
    double x{}, y{}, z{};
};
inline DVec3 operator+(DVec3 a, DVec3 b) { return {a.x + b.x, a.y + b.y, a.z + b.z}; }
inline DVec3 operator-(DVec3 a, DVec3 b) { return {a.x - b.x, a.y - b.y, a.z - b.z}; }
inline DVec3 operator*(DVec3 a, double s) { return {a.x * s, a.y * s, a.z * s}; }
inline DVec3 operator-(DVec3 a) { return {-a.x, -a.y, -a.z}; }
double dot(DVec3 a, DVec3 b);
DVec3 cross(DVec3 a, DVec3 b);
double length(DVec3 a);
// Unit vector, or (0, 1, 0) for a zero vector.
DVec3 normalized(DVec3 a);

// A unit rotation quaternion (three.js convention: rotate(v) = q v q*).
struct DQuat final {
    double x{}, y{}, z{}, w{1};
};
DQuat operator*(DQuat a, DQuat b);
DQuat normalized(DQuat q);
DQuat axis_angle(DVec3 axis, double angle);
// The shortest rotation taking unit vector `from` onto unit vector `to`.
DQuat between(DVec3 from, DVec3 to);
DVec3 rotate(DQuat q, DVec3 v);
DQuat conjugate(DQuat q);
// The rotation taking the unit axes onto orthonormal x, y, z.
DQuat from_axes(DVec3 x, DVec3 y, DVec3 z);

// A place on a body's surface flattened for building on (a settlement, a
// landing pad): within `radius` metres of `direction` the terrain is level
// at the height it has at the centre, blending back to natural terrain over
// another half radius.
struct Flat final {
    DVec3 direction{0, 1, 0};
    double radius{200};
};

// A planet or moon on a circular orbit around its parent (another body, or
// the star at the origin for parent -1). Bodies don't spin, so a place on
// the surface stays put in the body's frame.
struct Body final {
    std::string name;
    int parent{-1};
    double orbit_radius{};    // m from the parent's centre
    double period{1};         // s per orbit
    double phase{};           // rad along the orbit at t = 0
    double inclination{};     // rad, tilting the orbit about the x axis
    double radius{1000};      // mean surface radius
    double surface_gravity{9.8};
    double atmosphere_height{}; // m; 0 = airless. Air thins with a scale height of 0.42 of this and ends at 2.4x
    double atmosphere_density{}; // at the surface (1.2 is Earth's sea level)
    double terrain_amplitude{}; // m of relief either side of `radius`
    double terrain_scale{2000}; // m across the largest features
    // Water fills the terrain below this height (m relative to `radius`):
    // ships and walkers stand on its surface. Below -1e8 means no sea.
    double sea_level{-1e9};
    std::uint32_t seed{1};
    std::vector<Flat> flats;

    [[nodiscard]] double gm() const { return surface_gravity * radius * radius; }
    [[nodiscard]] double atmosphere_top() const { return atmosphere_height * 2.4; }
};

struct System final {
    double star_gm{1.0e12};
    std::vector<Body> bodies;
};

// A body's sphere of influence: inside it the ship falls toward that body
// alone. A tenth of the orbit around the star, a third around a planet,
// and always wide enough to enclose the body's moons.
double sphere_of_influence(const System& system, int body);
// Absolute position/velocity (star at the origin) at time t.
DVec3 body_position(const System& system, int body, double t);
DVec3 body_velocity(const System& system, int body, double t);
// Exponential air density at an altitude, 0 above the atmosphere's top.
double air_density(const Body& body, double altitude);
// Terrain: metres above (or below) the body's radius under a unit
// direction from its centre, deterministic in the body's seed and smooth
// enough to fly over and walk on. surface_radius adds the radius;
// surface_normal is the terrain's unit normal there. Water counts as
// surface; terrain_height is the ground under it (the seabed).
double surface_height(const Body& body, DVec3 direction);
double terrain_height(const Body& body, DVec3 direction);
double surface_radius(const Body& body, DVec3 direction);
DVec3 surface_normal(const Body& body, DVec3 direction);

struct ShipSpec final {
    double mass{12000};          // kg, fuel included
    double thrust{300000};       // N, main engine along the nose
    double lift_thrust{180000};  // N, vertical (belly) thrusters
    double rcs{2.2};             // rad/s^2 of attitude authority
    double max_rate{1.3};        // rad/s turn rate limit
    double drag_area{2.4};       // drag coefficient x area, m^2
    double lift{0.55};           // how hard air turns the velocity toward the nose
    double fuel{100};            // tank units
    double burn{1.2};            // units/s at full main throttle
    double lift_burn{0.5};       // units/s at full vertical thrust
    double heat_tolerance{80};   // hull heat above which the hull takes damage
    double hull{100};
    double gear_clearance{1.6};  // m from the ship's centre to its landing gear
    // A touchdown inside all four limits is clean; beyond them it is rough
    // and damages the hull in proportion to the excess.
    double land_vertical{7};     // m/s descent
    double land_lateral{5};      // m/s across the ground
    double land_tilt{0.45};      // rad between the ship's up and the ground
    double land_slope{0.5};      // rad of terrain slope
};

// Flight assistance, Pale Signal's ownership states: the pilot always owns
// the throttle and can always override the attitude.
enum class Assist : std::uint8_t {
    manual,     // no help: momentum and rotation persist
    stabilized, // rotation damps out, the ship levels to the horizon near a
                // surface, and the belly thrusters hold altitude when idle
    prograde,   // NAV: the nose follows the velocity
    retrograde, // NAV: the nose points against the velocity (to brake)
    target,     // NAV: the nose points along `target_direction`
};

struct ShipInput final {
    double pitch{}, yaw{}, roll{}; // -1..1: nose up, nose right, roll right
    double throttle{};             // 0..1 main engine
    double vertical{};             // -1..1 belly thrusters (down..up)
    Assist assist{Assist::stabilized};
    DVec3 target_direction{};      // for Assist::target, in the system frame
};

struct Touchdown final {
    bool rough{};
    double vertical{}, lateral{}, tilt{}, slope{}, damage{};
};

// The ship's state, owned by the caller. Position and velocity are relative
// to the reference body's centre (`ref`, or the star for -1) in the
// system's non-rotating frame. The ship's local axes: +z nose, +y up
// (away from the landing gear), +x left.
struct ShipState final {
    int ref{-1};
    DVec3 position{};
    DVec3 velocity{};
    DQuat attitude{};
    DVec3 angular_velocity{}; // local: x pitch, y yaw, z roll (rad/s)
    double throttle{};
    double fuel{100};
    double heat{};
    double hull{100};
    bool landed{};
    bool destroyed{};
    // Readouts refreshed every step.
    double altitude{};        // above the terrain under the ship
    double vertical_speed{};  // + away from the reference body
    double ground_speed{};    // across the surface
    double density{};
    double g_force{};
    bool engine_on{};
    // Set by a step that landed, lifted off or changed reference body; the
    // caller clears them after reading.
    bool touched_down{}, lifted_off{}, changed_ref{};
    Touchdown last_touchdown{};
};

// The terrain radius under a point (relative to body `index`'s centre).
// The default is surface_radius; a host can raise it for structures.
using SurfaceQuery = std::function<double(int index, DVec3 position)>;

// Advances the ship by dt at system time t (the caller advances t). Steps
// longer than 1/60 s are split. Switches reference body at sphere-of-
// influence boundaries.
void step_ship(ShipState& state, const ShipSpec& spec, const ShipInput& input, const System& system, double t,
               double dt, const SurfaceQuery& surface = {});

// Rests the ship on the ground of body `index` above `direction`, level with
// the terrain and its nose along `heading` (projected onto the ground).
void place_landed(ShipState& state, const ShipSpec& spec, const System& system, int index, DVec3 direction,
                  DVec3 heading);
// Puts the ship on a circular orbit `altitude` above body `index`'s radius.
void place_in_orbit(ShipState& state, const System& system, int index, double altitude);

struct OrbitElements final {
    bool valid{};
    bool closed{};          // bound (an ellipse) rather than escaping
    double periapsis{};     // altitude above the body's radius
    double apoapsis{};      // altitude, infinite when not closed
    double eccentricity{};
    double semi_major_axis{};
    double period{};        // s, 0 when not closed
};
OrbitElements orbit_elements(const ShipState& state, const System& system);

// Where the ship will coast: `count` positions relative to its reference
// body over `horizon` seconds, under that body's gravity alone (no thrust,
// drag or body changes). Stops early at the surface.
std::vector<DVec3> predict_path(const ShipState& state, const System& system, double horizon, int count);

// Ship-frame helpers.
DVec3 ship_forward(const ShipState& state);
DVec3 ship_up(const ShipState& state);

} // namespace engine::gameplay::space
