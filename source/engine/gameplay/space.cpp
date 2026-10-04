#include "engine/gameplay/space.hpp"

#include <algorithm>
#include <cmath>
#include <limits>

namespace engine::gameplay::space {

namespace {

constexpr double pi = 3.14159265358979323846;
constexpr double substep = 1.0 / 120.0;

double clampd(double v, double lo, double hi) { return std::min(std::max(v, lo), hi); }

// Two unit vectors perpendicular to `n` and to each other.
void tangents(DVec3 n, DVec3& a, DVec3& b) {
    const DVec3 helper = std::abs(n.y) < 0.9 ? DVec3{0, 1, 0} : DVec3{1, 0, 0};
    a = normalized(cross(helper, n));
    b = cross(n, a);
}

DQuat from_basis(DVec3 x, DVec3 y, DVec3 z) {
    // Rotation matrix with columns x, y, z.
    const double m00 = x.x, m01 = y.x, m02 = z.x;
    const double m10 = x.y, m11 = y.y, m12 = z.y;
    const double m20 = x.z, m21 = y.z, m22 = z.z;
    const double trace = m00 + m11 + m22;
    DQuat q;
    if (trace > 0) {
        const double s = 0.5 / std::sqrt(trace + 1.0);
        q = {(m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s};
    } else if (m00 > m11 && m00 > m22) {
        const double s = 2.0 * std::sqrt(1.0 + m00 - m11 - m22);
        q = {0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s};
    } else if (m11 > m22) {
        const double s = 2.0 * std::sqrt(1.0 + m11 - m00 - m22);
        q = {(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s};
    } else {
        const double s = 2.0 * std::sqrt(1.0 + m22 - m00 - m11);
        q = {(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s};
    }
    return normalized(q);
}

// An attitude with its up along `up` and its nose as close to `forward` as
// that allows.
DQuat level_attitude(DVec3 up, DVec3 forward) {
    DVec3 f = forward - up * dot(forward, up);
    if (length(f) < 1e-6) {
        DVec3 a, b;
        tangents(up, a, b);
        f = a;
    }
    f = normalized(f);
    return from_basis(cross(up, f), up, f);
}

// Hash-based value noise in 3D, in [-1, 1].
double lattice(std::uint32_t seed, int x, int y, int z) {
    std::uint32_t h = seed * 0x9E3779B1U;
    h ^= static_cast<std::uint32_t>(x) * 0x85EBCA77U;
    h = (h << 13U) | (h >> 19U);
    h ^= static_cast<std::uint32_t>(y) * 0xC2B2AE3DU;
    h = (h << 11U) | (h >> 21U);
    h ^= static_cast<std::uint32_t>(z) * 0x27D4EB2FU;
    h ^= h >> 15U;
    h *= 0x2C1B3C6DU;
    h ^= h >> 12U;
    h *= 0x297A2D39U;
    h ^= h >> 15U;
    return static_cast<double>(h & 0xFFFFFFU) / static_cast<double>(0xFFFFFF) * 2.0 - 1.0;
}

double value_noise(std::uint32_t seed, DVec3 p) {
    const double fx = std::floor(p.x), fy = std::floor(p.y), fz = std::floor(p.z);
    const int ix = static_cast<int>(fx), iy = static_cast<int>(fy), iz = static_cast<int>(fz);
    const auto fade = [](double t) { return t * t * t * (t * (t * 6 - 15) + 10); };
    const double u = fade(p.x - fx), v = fade(p.y - fy), w = fade(p.z - fz);
    const auto lerp = [](double a, double b, double t) { return a + (b - a) * t; };
    const double x00 = lerp(lattice(seed, ix, iy, iz), lattice(seed, ix + 1, iy, iz), u);
    const double x10 = lerp(lattice(seed, ix, iy + 1, iz), lattice(seed, ix + 1, iy + 1, iz), u);
    const double x01 = lerp(lattice(seed, ix, iy, iz + 1), lattice(seed, ix + 1, iy, iz + 1), u);
    const double x11 = lerp(lattice(seed, ix, iy + 1, iz + 1), lattice(seed, ix + 1, iy + 1, iz + 1), u);
    return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
}

// Impact craters: per cell of a lattice over the sphere, maybe one crater
// (density `craters`) with a bowl and a raised rim. Two scales.
double crater_height(const Body& body, DVec3 direction) {
    double h = 0;
    for (int level = 0; level < 2; ++level) {
        const double cell = level == 0 ? std::max(body.terrain_scale * 1.6, 600.0) : std::max(body.terrain_scale * 0.35, 150.0);
        const std::uint32_t seed = body.seed * 7919U + 31U + static_cast<std::uint32_t>(level) * 977U;
        const DVec3 p = direction * (body.radius / cell);
        const int cx = static_cast<int>(std::floor(p.x)), cy = static_cast<int>(std::floor(p.y)), cz = static_cast<int>(std::floor(p.z));
        for (int dx = -1; dx <= 1; ++dx)
            for (int dy = -1; dy <= 1; ++dy)
                for (int dz = -1; dz <= 1; ++dz) {
                    const int x = cx + dx, y = cy + dy, z = cz + dz;
                    if ((lattice(seed, x, y, z) * 0.5 + 0.5) > body.craters)
                        continue;
                    // The crater's centre, projected onto the sphere.
                    const DVec3 centre = normalized(DVec3{x + 0.5 + lattice(seed + 1, x, y, z) * 0.4, y + 0.5 + lattice(seed + 2, x, y, z) * 0.4,
                                                          z + 0.5 + lattice(seed + 3, x, y, z) * 0.4});
                    const double radius = cell * (0.18 + 0.22 * (lattice(seed + 4, x, y, z) * 0.5 + 0.5));
                    const double arc = std::acos(clampd(dot(direction, centre), -1, 1)) * body.radius;
                    const double t = arc / radius;
                    if (t > 1.6)
                        continue;
                    const double depth = radius * 0.16, rim = radius * 0.05;
                    if (t < 1)
                        h += -depth * (1 - t * t) + rim * t * t * t * t;
                    else
                        h += rim * std::exp(-(t - 1) * (t - 1) / 0.08);
                }
    }
    return h;
}

// Lava rifts: narrow channels along the zero lines of a broad noise field.
double rift_amount(const Body& body, DVec3 direction) {
    if (!body.rifts)
        return 0;
    const DVec3 p = direction * (body.radius / std::max(body.terrain_scale * 2.5, 1000.0));
    const double n = value_noise(body.seed * 13U + 777U, p) + 0.35 * value_noise(body.seed * 13U + 778U, p * 2.7);
    const double width = 0.06;
    return clampd(1 - std::abs(n) / width, 0, 1);
}

// Dunes: crests along one wind direction, wandering with noise, only in
// sand basins.
double dune_height(const Body& body, DVec3 direction) {
    if (!body.dunes)
        return 0;
    const DVec3 p = direction * (body.radius / 260.0);
    const double wander = value_noise(body.seed * 17U + 5U, direction * (body.radius / 1500.0)) * 6.0;
    const double s = std::sin(p.x * 0.8 + p.z * 0.6 + wander);
    const double crest = std::pow(0.5 + 0.5 * s, 3.0);
    const double basin = clampd(value_noise(body.seed * 17U + 9U, direction * (body.radius / 6000.0)) * 2.0 + 0.4, 0, 1);
    return crest * 14.0 * basin;
}

double feature_height(const Body& body, DVec3 direction) {
    double h = 0;
    if (body.craters > 0)
        h += crater_height(body, direction);
    const double rift = rift_amount(body, direction);
    if (rift > 0)
        h -= rift * rift * std::max(body.terrain_amplitude * 0.35, 40.0);
    h += dune_height(body, direction);
    return h;
}

double natural_height(const Body& body, DVec3 direction) {
    if (!(body.terrain_amplitude > 0))
        return feature_height(body, direction);
    const double scale = body.radius / std::max(body.terrain_scale, 1.0);
    DVec3 p = direction * scale;
    double sum = 0, ridges = 0, amplitude = 1, norm = 0;
    for (int octave = 0; octave < 6; ++octave) {
        const double n = value_noise(body.seed + static_cast<std::uint32_t>(octave) * 101U, p);
        sum += n * amplitude;
        // Ridged octaves give mountain crests instead of soft hills.
        ridges += (1.0 - std::abs(n)) * amplitude;
        norm += amplitude;
        amplitude *= 0.5;
        p = p * 2.03;
    }
    sum /= norm;
    ridges = ridges / norm * 2.0 - 1.0;
    // Mountains only where the broad shape is already high.
    const double mountains = std::max(0.0, sum + 0.15) * ridges;
    return body.terrain_amplitude * (sum * 0.75 + mountains * 0.6) + feature_height(body, direction);
}

DVec3 gravity_at(const System& system, int ref, DVec3 position) {
    const double gm = ref >= 0 ? system.bodies[static_cast<std::size_t>(ref)].gm() : system.star_gm;
    const double r = std::max(length(position), 1.0);
    return position * (-gm / (r * r * r));
}

// Non-rotating (body-centred) -> body-fixed, at time t.
DVec3 to_fixed(const System& system, int ref, double t, DVec3 v) {
    const auto& body = system.bodies[static_cast<std::size_t>(ref)];
    return body.day > 0 ? rotate(conjugate(body_spin(body, t)), v) : v;
}
DVec3 from_fixed(const System& system, int ref, double t, DVec3 v) {
    const auto& body = system.bodies[static_cast<std::size_t>(ref)];
    return body.day > 0 ? rotate(body_spin(body, t), v) : v;
}

// The surface radius under a body-fixed point.
double fixed_surface(const SurfaceQuery& surface, const System& system, int ref, DVec3 fixed) {
    if (surface)
        return surface(ref, fixed);
    return surface_radius(system.bodies[static_cast<std::size_t>(ref)], normalized(fixed));
}

// The surface radius under a non-rotating position at time t.
double query_surface(const SurfaceQuery& surface, const System& system, int ref, DVec3 position, double t) {
    return fixed_surface(surface, system, ref, to_fixed(system, ref, t, position));
}

// The ground's normal under a body-fixed point, body-fixed.
DVec3 fixed_normal(const SurfaceQuery& surface, const System& system, int ref, DVec3 position) {
    const DVec3 n = normalized(position);
    DVec3 a, b;
    tangents(n, a, b);
    const double r = std::max(length(position), 1.0);
    const double e = 2.0 / r;
    const auto point = [&](DVec3 dir) {
        dir = normalized(dir);
        return dir * fixed_surface(surface, system, ref, dir * r);
    };
    const DVec3 p0 = point(n), p1 = point(n + a * e), p2 = point(n + b * e);
    DVec3 normal = normalized(cross(p1 - p0, p2 - p0));
    if (dot(normal, n) < 0)
        normal = -normal;
    return normal;
}

// The ground's normal under a non-rotating position at time t, non-rotating.
DVec3 query_normal(const SurfaceQuery& surface, const System& system, int ref, DVec3 position, double t) {
    return from_fixed(system, ref, t, fixed_normal(surface, system, ref, to_fixed(system, ref, t, position)));
}

// Rotates the angular velocity toward the rate that turns the attitude onto
// `desired`, limited by the ship's authority.
void aim(ShipState& state, const ShipSpec& spec, DQuat desired, double h) {
    DQuat error = desired * conjugate(state.attitude);
    if (error.w < 0)
        error = {-error.x, -error.y, -error.z, -error.w};
    const double s = std::sqrt(error.x * error.x + error.y * error.y + error.z * error.z);
    DVec3 want{};
    if (s > 1e-9) {
        const double angle = 2.0 * std::atan2(s, error.w);
        const DVec3 world_axis{error.x / s, error.y / s, error.z / s};
        const DVec3 local = rotate(conjugate(state.attitude), world_axis * angle);
        // Local rotation vector to control space (pitch up, yaw right, roll right).
        want = {-local.x * 3.0, -local.y * 3.0, local.z * 3.0};
        const double rate = length(want);
        if (rate > spec.max_rate)
            want = want * (spec.max_rate / rate);
    }
    const DVec3 delta = want - state.angular_velocity;
    const double step = spec.rcs * 1.5 * h;
    const double d = length(delta);
    state.angular_velocity = d <= step ? want : state.angular_velocity + delta * (step / d);
}

void touchdown(ShipState& state, const ShipSpec& spec, const System& system, const SurfaceQuery& surface, double t) {
    const DVec3 radial = normalized(state.position);
    const DVec3 normal = query_normal(surface, system, state.ref, state.position, t);
    // Speeds relative to the (turning) ground.
    const DVec3 ground_velocity = surface_velocity(system.bodies[static_cast<std::size_t>(state.ref)], state.position);
    const DVec3 relative = state.velocity - ground_velocity;
    const double vdot = dot(relative, radial);
    Touchdown result;
    result.vertical = std::max(0.0, -vdot);
    result.lateral = length(relative - radial * vdot);
    result.tilt = std::acos(clampd(dot(ship_up(state), normal), -1, 1));
    result.slope = std::acos(clampd(dot(normal, radial), -1, 1));
    const double deg = 180.0 / pi;
    // Worn gear takes less (0.73.0).
    const double gear = 0.5 + 0.5 * component_efficiency(state.gear);
    const double excess = std::max(result.vertical - spec.land_vertical * gear, 0.0) +
                          std::max(result.lateral - spec.land_lateral, 0.0) * 0.6 +
                          std::max(result.tilt - spec.land_tilt, 0.0) * deg * 0.35 +
                          std::max(result.slope - spec.land_slope, 0.0) * deg * 0.45;
    result.rough = excess > 0;
    result.damage = result.rough ? clampd(excess * 1.8, 2, 140) : 0;
    const double ground = query_surface(surface, system, state.ref, state.position, t);
    state.position = radial * (ground + spec.gear_clearance);
    state.velocity = surface_velocity(system.bodies[static_cast<std::size_t>(state.ref)], state.position);
    state.angular_velocity = {};
    state.attitude = level_attitude(normal, ship_forward(state));
    state.landed = true;
    state.touched_down = true;
    state.last_touchdown = result;
    state.hull = std::max(0.0, state.hull - result.damage);
    // The gear takes the landing: rough ones hard, firm ones a little.
    if (result.rough)
        state.gear = std::max(0.0, state.gear - result.damage * 0.9);
    else if (result.vertical > spec.land_vertical * 0.6)
        state.gear = std::max(0.0, state.gear - 1.0);
    if (state.hull <= 0)
        state.destroyed = true;
}

void check_sphere_of_influence(ShipState& state, const System& system, double t) {
    const auto reframe = [&](int to) {
        const DVec3 from_pos = state.ref >= 0 ? body_position(system, state.ref, t) : DVec3{};
        const DVec3 from_vel = state.ref >= 0 ? body_velocity(system, state.ref, t) : DVec3{};
        const DVec3 to_pos = to >= 0 ? body_position(system, to, t) : DVec3{};
        const DVec3 to_vel = to >= 0 ? body_velocity(system, to, t) : DVec3{};
        state.position = state.position + from_pos - to_pos;
        state.velocity = state.velocity + from_vel - to_vel;
        state.ref = to;
        state.changed_ref = true;
    };
    if (state.ref >= 0 && length(state.position) > sphere_of_influence(system, state.ref)) {
        reframe(system.bodies[static_cast<std::size_t>(state.ref)].parent);
        return;
    }
    const DVec3 here = (state.ref >= 0 ? body_position(system, state.ref, t) : DVec3{}) + state.position;
    for (std::size_t i = 0; i < system.bodies.size(); ++i) {
        if (system.bodies[i].parent != state.ref || static_cast<int>(i) == state.ref)
            continue;
        if (length(here - body_position(system, static_cast<int>(i), t)) <
            sphere_of_influence(system, static_cast<int>(i))) {
            reframe(static_cast<int>(i));
            return;
        }
    }
}

void substep_ship(ShipState& state, const ShipSpec& spec, const ShipInput& input, const System& system, double t,
                  double h, const SurfaceQuery& surface) {
    const Body* body = state.ref >= 0 ? &system.bodies[static_cast<std::size_t>(state.ref)] : nullptr;
    const DVec3 radial = normalized(state.position);
    const double altitude =
        body ? length(state.position) - query_surface(surface, system, state.ref, state.position, t) - spec.gear_clearance
             : std::numeric_limits<double>::infinity();
    const double density = body ? air_density(*body, altitude) : 0.0;

    // ---- attitude: rate-limited, the pilot first, then the assist.
    const bool steering = std::abs(input.pitch) > 0.01 || std::abs(input.yaw) > 0.01 || std::abs(input.roll) > 0.01;
    if (steering) {
        state.angular_velocity =
            state.angular_velocity + DVec3{clampd(input.pitch, -1, 1), clampd(input.yaw, -1, 1),
                                           clampd(input.roll, -1, 1)} *
                                         (spec.rcs * component_efficiency(state.rcs_condition) * h);
        // Hard turns at speed in thick air strain the thrusters.
        if (density > 0.2 && length(state.velocity) > 160)
            state.rcs_condition = std::max(0.0, state.rcs_condition - 0.25 * h);
        // Letting go of an axis stops it turning on that axis.
        const double damp = std::exp(-3.0 * h);
        if (std::abs(input.pitch) <= 0.01)
            state.angular_velocity.x *= damp;
        if (std::abs(input.yaw) <= 0.01)
            state.angular_velocity.y *= damp;
        if (std::abs(input.roll) <= 0.01)
            state.angular_velocity.z *= damp;
    } else if (!state.landed) {
        const DVec3 velocity = state.velocity;
        const double travel = length(velocity);
        switch (input.assist) {
        case Assist::manual:
            state.angular_velocity = state.angular_velocity * std::exp(-(0.3 + density * 2.0) * h);
            break;
        case Assist::stabilized:
            // Near a surface the ship levels itself to the horizon (Pale
            // Signal's STABILIZED); in space it just stops rotating.
            if (body && altitude < std::max(body->atmosphere_top(), 4000.0))
                aim(state, spec, level_attitude(radial, ship_forward(state)), h);
            else
                state.angular_velocity = state.angular_velocity * std::exp(-4.2 * h);
            break;
        case Assist::prograde:
        case Assist::retrograde:
        case Assist::target:
        case Assist::autopilot: {
            DVec3 dir{};
            if (input.assist == Assist::target || input.assist == Assist::autopilot)
                dir = input.target_direction;
            else if (travel > 0.5)
                dir = velocity * (input.assist == Assist::prograde ? 1.0 : -1.0);
            if (length(dir) > 1e-9) {
                dir = normalized(dir);
                // Keep the ship's up as close as the new nose allows.
                DVec3 up = ship_up(state) - dir * dot(ship_up(state), dir);
                if (length(up) < 1e-6) {
                    DVec3 a, b;
                    tangents(dir, a, b);
                    up = a;
                }
                up = normalized(up);
                aim(state, spec, from_basis(cross(up, dir), up, dir), h);
            } else {
                state.angular_velocity = state.angular_velocity * std::exp(-4.2 * h);
            }
            break;
        }
        }
    }
    const double rate = length(state.angular_velocity);
    if (rate > spec.max_rate)
        state.angular_velocity = state.angular_velocity * (spec.max_rate / rate);
    if (!state.landed && rate > 1e-9) {
        const DVec3 local{-state.angular_velocity.x, -state.angular_velocity.y, state.angular_velocity.z};
        const double angle = length(local) * h;
        state.attitude = normalized(state.attitude * axis_angle(normalized(local), angle));
    }

    // ---- forces.
    const DVec3 gravity = gravity_at(system, state.ref, state.position);
    DVec3 accel = gravity;
    const double throttle = state.fuel > 0 ? clampd(input.throttle, 0, 1) : 0.0;
    state.throttle = throttle;
    state.engine_on = throttle > 0.001;
    const DVec3 forward = ship_forward(state), up = ship_up(state);
    const double engine = component_efficiency(state.engine);
    accel = accel + forward * (spec.thrust * engine * throttle / spec.mass);
    state.fuel = std::max(0.0, state.fuel - spec.burn * throttle * h);

    double vertical = state.fuel > 0 ? clampd(input.vertical, -1, 1) : 0.0;
    const double lift_max = spec.lift_thrust * std::sqrt(engine) / spec.mass;
    if (body && input.assist == Assist::stabilized && state.fuel > 0 && altitude < 3000 &&
        (!state.landed || vertical > 0.05)) {
        // Hover assist (STABILIZED near a surface): the stick commands a
        // climb or sink rate instead of raw thrust, and the belly thrusters
        // hold it -- idle hovers. The sink rate eases off near the ground,
        // so holding "down" sets the ship on its gear gently.
        const double facing = dot(up, radial);
        if (facing > 0.3) {
            const double sink_limit = std::min(14.0, 1.2 + std::max(altitude, 0.0) * 0.35);
            const double want_vspeed = input.vertical >= 0 ? input.vertical * 14.0 : input.vertical * sink_limit;
            const double other = dot(accel, radial); // gravity and main engine, radially
            const double vspeed = dot(state.velocity, radial);
            const double want = -other + (want_vspeed - vspeed) * 2.0;
            vertical = clampd(want / (facing * lift_max), 0.0, 1.0);
        }
    }
    accel = accel + up * (lift_max * vertical);
    state.fuel = std::max(0.0, state.fuel - spec.lift_burn * std::abs(vertical) * h);
    if (std::abs(vertical) > 0.001)
        state.engine_on = true;

    // Drag and lift work on the air-relative velocity (wind, 0.73.0).
    // The air turns with the body.
    const DVec3 air_velocity =
        density > 1e-6 && body
            ? state.velocity - surface_velocity(*body, state.position) - from_fixed(system, state.ref, t, input.wind)
            : state.velocity;
    const double air_speed = length(air_velocity);
    const double speed = length(state.velocity);
    if (density > 1e-6 && air_speed > 0.5) {
        const double q = 0.5 * density * air_speed * air_speed;
        accel = accel + air_velocity * (-q * spec.drag_area / (spec.mass * air_speed));
        // Air turns the velocity toward the nose: it flies, rather than
        // drifting like a spacecraft.
        const DVec3 dir = state.velocity * (1.0 / std::max(speed, 1e-9));
        const double along = dot(dir, forward);
        if (along > 0.2 && speed > 0.5) {
            const double k = clampd(clampd(density * spec.lift, 0, 0.9) * h * 2.2, 0, 0.4);
            state.velocity = normalized(dir + (forward - dir) * k) * speed;
        }
        const double heating = q * air_speed * 5e-6;
        state.heat = clampd(state.heat + (heating - state.heat * 0.55) * h * 1.6, 0, 200);
        if (state.heat > spec.heat_tolerance) {
            state.hull = std::max(0.0, state.hull - (state.heat - spec.heat_tolerance) * 0.055 * h);
            state.engine = std::max(0.0, state.engine - (state.heat - spec.heat_tolerance) * 0.03 * h);
            if (state.hull <= 0)
                state.destroyed = true;
        }
    } else {
        state.heat = std::max(0.0, state.heat - 12.0 * h);
    }
    state.g_force = length(accel - gravity) / 9.81;

    // ---- integrate.
    if (state.landed) {
        if (dot(accel, radial) > 0.15) {
            state.landed = false;
            state.lifted_off = true;
        } else if (body && body->day > 0) {
            // Carried around by the turning ground.
            const DQuat turn = axis_angle({0, 1, 0}, 2.0 * pi * h / body->day);
            state.position = rotate(turn, state.position);
            state.attitude = normalized(turn * state.attitude);
            state.velocity = surface_velocity(*body, state.position);
        } else {
            state.velocity = {};
        }
    }
    if (!state.landed) {
        state.velocity = state.velocity + accel * h;
        state.position = state.position + state.velocity * h;
    }

    // ---- ground contact.
    if (body) {
        const DVec3 r = normalized(state.position);
        const double ground = query_surface(surface, system, state.ref, state.position, t + h);
        const double alt = length(state.position) - ground - spec.gear_clearance;
        const double vspeed = dot(state.velocity, r);
        if (!state.landed && alt <= 0 && vspeed <= 0) {
            touchdown(state, spec, system, surface, t + h);
        } else if (!state.landed && alt < -1.0) {
            // Anti-tunnelling for a long step into a ridge.
            state.position = r * (ground + spec.gear_clearance);
            if (vspeed < 0)
                state.velocity = state.velocity - r * vspeed;
        }
    }
}

} // namespace

double dot(DVec3 a, DVec3 b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
DVec3 cross(DVec3 a, DVec3 b) { return {a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x}; }
double length(DVec3 a) { return std::sqrt(dot(a, a)); }
DVec3 normalized(DVec3 a) {
    const double l = length(a);
    return l > 1e-12 ? a * (1.0 / l) : DVec3{0, 1, 0};
}

DQuat operator*(DQuat a, DQuat b) {
    return {a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y, a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
            a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w, a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z};
}
DQuat normalized(DQuat q) {
    const double l = std::sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
    return l > 1e-12 ? DQuat{q.x / l, q.y / l, q.z / l, q.w / l} : DQuat{};
}
DQuat axis_angle(DVec3 axis, double angle) {
    const DVec3 a = normalized(axis);
    const double s = std::sin(angle / 2);
    return {a.x * s, a.y * s, a.z * s, std::cos(angle / 2)};
}
DQuat between(DVec3 from, DVec3 to) {
    const double d = dot(from, to);
    if (d < -0.999999) {
        DVec3 a, b;
        tangents(from, a, b);
        return axis_angle(a, pi);
    }
    const DVec3 c = cross(from, to);
    return normalized(DQuat{c.x, c.y, c.z, 1 + d});
}
DQuat conjugate(DQuat q) { return {-q.x, -q.y, -q.z, q.w}; }
DQuat from_axes(DVec3 x, DVec3 y, DVec3 z) { return from_basis(x, y, z); }
DVec3 rotate(DQuat q, DVec3 v) {
    const DQuat p = q * DQuat{v.x, v.y, v.z, 0} * conjugate(q);
    return {p.x, p.y, p.z};
}

double sphere_of_influence(const System& system, int body) {
    const auto& b = system.bodies[static_cast<std::size_t>(body)];
    double soi = b.parent < 0 ? b.orbit_radius * 0.10 : b.orbit_radius * 0.32;
    // A planet's sphere always encloses its moons' spheres.
    for (std::size_t i = 0; i < system.bodies.size(); ++i)
        if (system.bodies[i].parent == body && static_cast<int>(i) != body)
            soi = std::max(soi, (system.bodies[i].orbit_radius + sphere_of_influence(system, static_cast<int>(i))) * 1.2);
    return soi;
}

DVec3 body_position(const System& system, int body, double t) {
    if (body < 0)
        return {};
    const auto& b = system.bodies[static_cast<std::size_t>(body)];
    const double a = b.phase + 2.0 * pi * t / b.period;
    const DVec3 offset{b.orbit_radius * std::cos(a), b.orbit_radius * std::sin(a) * std::sin(b.inclination),
                       b.orbit_radius * std::sin(a) * std::cos(b.inclination)};
    return body_position(system, b.parent, t) + offset;
}

DVec3 body_velocity(const System& system, int body, double t) {
    if (body < 0)
        return {};
    const auto& b = system.bodies[static_cast<std::size_t>(body)];
    const double w = 2.0 * pi / b.period;
    const double a = b.phase + w * t;
    const DVec3 offset{-b.orbit_radius * w * std::sin(a), b.orbit_radius * w * std::cos(a) * std::sin(b.inclination),
                       b.orbit_radius * w * std::cos(a) * std::cos(b.inclination)};
    return body_velocity(system, b.parent, t) + offset;
}

double air_density(const Body& body, double altitude) {
    if (!(body.atmosphere_height > 0) || !(body.atmosphere_density > 0) || altitude > body.atmosphere_top())
        return 0;
    return body.atmosphere_density * std::exp(-std::max(altitude, 0.0) / (body.atmosphere_height * 0.42));
}

double surface_height(const Body& body, DVec3 direction) {
    return std::max(terrain_height(body, direction), body.sea_level);
}

double terrain_height(const Body& body, DVec3 direction) {
    direction = normalized(direction);
    double height = natural_height(body, direction);
    for (const auto& flat : body.flats) {
        const DVec3 centre = normalized(flat.direction);
        const double arc = std::acos(clampd(dot(direction, centre), -1, 1)) * body.radius;
        if (arc >= flat.radius * 1.5)
            continue;
        double w = 1;
        if (arc > flat.radius) {
            const double t = (arc - flat.radius) / (flat.radius * 0.5);
            w = 1 - t * t * (3 - 2 * t);
        }
        height += (natural_height(body, centre) - height) * w;
    }
    return height;
}

double surface_radius(const Body& body, DVec3 direction) { return body.radius + surface_height(body, direction); }

DVec3 surface_normal(const Body& body, DVec3 direction) {
    const SurfaceQuery query = [&body](int, DVec3 p) { return surface_radius(body, normalized(p)); };
    System one;
    one.bodies.push_back(body);
    return fixed_normal(query, one, 0, normalized(direction) * body.radius);
}

double lava(const Body& body, DVec3 direction) { return rift_amount(body, normalized(direction)); }

DQuat body_spin(const Body& body, double t) {
    if (!(body.day > 0))
        return {};
    return axis_angle({0, 1, 0}, 2.0 * pi * std::fmod(t / body.day, 1.0));
}

DVec3 surface_velocity(const Body& body, DVec3 position) {
    if (!(body.day > 0))
        return {};
    return cross(DVec3{0, 2.0 * pi / body.day, 0}, position);
}

void step_ship(ShipState& state, const ShipSpec& spec, const ShipInput& input, const System& system, double t,
               double dt, const SurfaceQuery& surface) {
    if (state.destroyed || !(dt > 0))
        return;
    const int steps = std::min(4000, std::max(1, static_cast<int>(std::ceil(dt / substep - 1e-9))));
    const double h = dt / steps;
    for (int i = 0; i < steps && !state.destroyed; ++i) {
        substep_ship(state, spec, input, system, t + h * i, h, surface);
        check_sphere_of_influence(state, system, t + h * (i + 1));
    }
    // Readouts.
    if (state.ref >= 0) {
        const DVec3 r = normalized(state.position);
        state.altitude =
            length(state.position) - query_surface(surface, system, state.ref, state.position, t + dt) - spec.gear_clearance;
        const DVec3 relative = state.velocity - surface_velocity(system.bodies[static_cast<std::size_t>(state.ref)], state.position);
        state.vertical_speed = dot(relative, r);
        state.ground_speed = length(relative - r * state.vertical_speed);
        state.density = air_density(system.bodies[static_cast<std::size_t>(state.ref)], state.altitude);
    } else {
        state.altitude = std::numeric_limits<double>::infinity();
        state.vertical_speed = 0;
        state.ground_speed = length(state.velocity);
        state.density = 0;
    }
}

void place_landed(ShipState& state, const ShipSpec& spec, const System& system, int index, DVec3 direction,
                  DVec3 heading, double t) {
    const auto& body = system.bodies[static_cast<std::size_t>(index)];
    direction = normalized(direction);
    state.ref = index;
    const DQuat spin = body_spin(body, t);
    state.position = rotate(spin, direction * (surface_radius(body, direction) + spec.gear_clearance));
    state.velocity = surface_velocity(body, state.position);
    state.angular_velocity = {};
    state.attitude = level_attitude(rotate(spin, surface_normal(body, direction)), rotate(spin, heading));
    state.landed = true;
    state.destroyed = false;
    state.altitude = 0;
}

void place_in_orbit(ShipState& state, const System& system, int index, double altitude) {
    const auto& body = system.bodies[static_cast<std::size_t>(index)];
    const double r = body.radius + altitude;
    state.ref = index;
    state.position = {r, 0, 0};
    state.velocity = {0, 0, std::sqrt(body.gm() / r)};
    state.angular_velocity = {};
    state.attitude = from_basis({0, -1, 0}, {1, 0, 0}, {0, 0, 1});
    state.landed = false;
    state.destroyed = false;
}

OrbitElements orbit_elements(const ShipState& state, const System& system) {
    OrbitElements e;
    if (state.landed)
        return e;
    const double gm = state.ref >= 0 ? system.bodies[static_cast<std::size_t>(state.ref)].gm() : system.star_gm;
    const double radius = state.ref >= 0 ? system.bodies[static_cast<std::size_t>(state.ref)].radius : 0.0;
    const double r = length(state.position), v = length(state.velocity);
    if (r < 1)
        return e;
    const double energy = 0.5 * v * v - gm / r;
    const double h = length(cross(state.position, state.velocity));
    e.valid = true;
    e.closed = energy < 0;
    e.eccentricity = std::sqrt(std::max(0.0, 1 + 2 * energy * h * h / (gm * gm)));
    if (std::abs(energy) > 1e-12) {
        e.semi_major_axis = -gm / (2 * energy);
        e.periapsis = e.semi_major_axis * (1 - e.eccentricity) - radius;
    } else {
        e.semi_major_axis = std::numeric_limits<double>::infinity();
        e.periapsis = h * h / (2 * gm) - radius;
    }
    e.apoapsis = e.closed ? e.semi_major_axis * (1 + e.eccentricity) - radius : std::numeric_limits<double>::infinity();
    e.period = e.closed ? 2 * pi * std::sqrt(e.semi_major_axis * e.semi_major_axis * e.semi_major_axis / gm) : 0.0;
    return e;
}

std::vector<DVec3> predict_path(const ShipState& state, const System& system, double horizon, int count) {
    std::vector<DVec3> points;
    if (count <= 0 || !(horizon > 0))
        return points;
    points.reserve(static_cast<std::size_t>(count));
    constexpr int per_point = 8;
    const double h = horizon / (count * per_point);
    DVec3 p = state.position, v = state.velocity;
    const Body* body = state.ref >= 0 ? &system.bodies[static_cast<std::size_t>(state.ref)] : nullptr;
    for (int i = 0; i < count; ++i) {
        for (int k = 0; k < per_point; ++k) {
            v = v + gravity_at(system, state.ref, p) * h;
            p = p + v * h;
        }
        points.push_back(p);
        if (body && length(p) < surface_radius(*body, normalized(p)))
            break;
    }
    return points;
}

DVec3 ship_forward(const ShipState& state) { return rotate(state.attitude, {0, 0, 1}); }
DVec3 ship_up(const ShipState& state) { return rotate(state.attitude, {0, 1, 0}); }

double component_efficiency(double condition) {
    const double c = clampd(condition, 0, 100) / 100.0;
    return 0.35 + 0.65 * (1 - (1 - c) * (1 - c));
}

namespace {
// The ship's position and velocity in the system frame.
DVec3 absolute_position(const ShipState& state, const System& system, double t) {
    return (state.ref >= 0 ? body_position(system, state.ref, t) : DVec3{}) + state.position;
}
DVec3 absolute_velocity(const ShipState& state, const System& system, double t) {
    return (state.ref >= 0 ? body_velocity(system, state.ref, t) : DVec3{}) + state.velocity;
}
// Where the autopilot stops: above the target's air, or a tenth of its
// radius up for an airless body.
double arrival_altitude(const Body& body) { return std::max(body.atmosphere_top() + 1500.0, body.radius * 0.12); }
double cruise_speed(const ShipSpec& spec, double distance) {
    const double accel = spec.thrust / spec.mass;
    // Slow enough to be cheap on fuel; time warp covers the coast.
    return clampd(0.2 * std::sqrt(accel * std::max(distance, 0.0)), 60.0, 1500.0);
}
} // namespace

AutopilotCommand autopilot_command(const ShipState& state, const ShipSpec& spec, const System& system, double t,
                                   int target) {
    AutopilotCommand command;
    if (target < 0 || target >= static_cast<int>(system.bodies.size()) || state.destroyed)
        return command;
    const auto& goal = system.bodies[static_cast<std::size_t>(target)];
    const double accel = spec.thrust * component_efficiency(state.engine) / spec.mass;
    // First climb clear of the air (or the terrain) of the body we're on.
    if (state.ref >= 0 && state.ref != target) {
        const auto& here = system.bodies[static_cast<std::size_t>(state.ref)];
        const double clear = std::max(here.atmosphere_top(), 2500.0);
        const double altitude = length(state.position) - here.radius;
        if (altitude < clear) {
            const DVec3 up = normalized(state.position);
            // Pitch over gradually as the air thins.
            DVec3 a, b;
            tangents(up, a, b);
            DVec3 along = state.velocity - up * dot(state.velocity, up);
            along = length(along) > 1 ? normalized(along) : a;
            const double k = clampd(altitude / clear, 0, 1) * 0.6;
            command.direction = normalized(up * (1 - k) + along * k);
            command.throttle = 1;
            command.phase = "climb";
            return command;
        }
    }
    const DVec3 to = body_position(system, target, t) - absolute_position(state, system, t);
    const DVec3 rel = absolute_velocity(state, system, t) - body_velocity(system, target, t);
    const double centre = length(to);
    const DVec3 dir = normalized(to);
    const double distance = centre - goal.radius - arrival_altitude(goal);
    const double closing = dot(rel, dir);
    if (distance < 1500 && length(rel) < 40) {
        command.arrived = true;
        command.phase = "arrived";
        command.direction = dir;
        return command;
    }
    // Wanted velocity: straight at the target, as fast as we can still stop
    // in the distance left (with a margin), capped at cruise.
    const double stop = std::sqrt(2 * accel * 0.7 * std::max(distance, 0.0));
    const double want = std::min(cruise_speed(spec, distance), stop);
    // Gravity of the target near arrival is absorbed by the margin; the
    // error between wanted and actual velocity is what the engine fixes.
    const DVec3 error = dir * want - rel;
    const double err = length(error);
    command.direction = err > 1e-6 ? normalized(error) : dir;
    if (err < 6) {
        command.throttle = 0;
        command.phase = "coast";
        command.direction = closing > want * 0.9 ? normalized(-rel) : dir;
        return command;
    }
    const double facing = dot(ship_forward(state), command.direction);
    command.throttle = facing > 0.985 ? clampd(err / (accel * 1.5), 0.05, 1) : 0.0;
    command.phase = closing > want ? "brake" : "burn";
    return command;
}

RoutePlan plan_route(const ShipState& state, const ShipSpec& spec, const System& system, double t, int target) {
    RoutePlan plan;
    if (target < 0 || target >= static_cast<int>(system.bodies.size()))
        return plan;
    const auto& goal = system.bodies[static_cast<std::size_t>(target)];
    const DVec3 to = body_position(system, target, t) - absolute_position(state, system, t);
    const DVec3 rel = absolute_velocity(state, system, t) - body_velocity(system, target, t);
    plan.distance = std::max(0.0, length(to) - goal.radius);
    plan.closing_speed = dot(rel, normalized(to));
    double dv = 0;
    // Climb out of where we are.
    if (state.ref >= 0 && state.ref != target) {
        const auto& here = system.bodies[static_cast<std::size_t>(state.ref)];
        const double r = std::max(length(state.position), here.radius);
        const double orbital = std::sqrt(here.gm() / r);
        dv += state.landed ? orbital * 1.25 + std::sqrt(2 * here.surface_gravity * here.atmosphere_top()) * 0.3
                           : std::max(0.0, orbital - length(state.velocity) * 0.5);
    }
    // Accelerate to cruise, cancel what we already have sideways, brake.
    const double cruise = cruise_speed(spec, plan.distance);
    dv += cruise * 2 + std::max(0.0, length(rel) - std::max(plan.closing_speed, 0.0));
    // Descend and land on the target.
    dv += std::sqrt(goal.gm() / (goal.radius + arrival_altitude(goal))) * 0.6 +
          std::sqrt(2 * goal.surface_gravity * 400);
    plan.delta_v = dv;
    const double accel = spec.thrust / spec.mass;
    plan.fuel_needed = dv / accel * spec.burn;
    plan.status = state.fuel >= plan.fuel_needed * 1.25 ? 0 : state.fuel >= plan.fuel_needed ? 1 : 2;
    return plan;
}

} // namespace engine::gameplay::space
