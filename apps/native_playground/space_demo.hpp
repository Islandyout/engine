#pragma once
// Spaceflight in the native playground (0.75.0): the engine's own
// space::step_ship over a planet with air and an airless moon, flown from
// the keyboard and drawn by the CPU box renderer as an orrery -- planet,
// moon, ship and its predicted path -- with throttle, fuel and altitude
// bars. `engine_playground --space`.
//
// Down to the ground (0.76.0): under 2.5 km the view switches to the surface
// -- a patch of the body's real terrain (space::terrain_height) as columns
// around the point below the ship -- and the ship can set down on it: L
// engages the landing assist (stabilized, sinking at a speed that eases off
// near the ground), a green bar shows it has landed, Space lifts off again.
#include "engine/gameplay/space.hpp"
#include "engine/graphics/box_view.hpp"
#include "engine/input/input.hpp"
#include <algorithm>
#include <cmath>
#include <vector>

namespace playground {

class SpaceDemo final {
public:
    engine::gameplay::space::System system;
    engine::gameplay::space::ShipState ship;
    engine::gameplay::space::ShipSpec spec;
    engine::OrbitView camera;
    double time{};
    double throttle{};
    bool autopilot{};
    bool landing{};

    SpaceDemo() {
        namespace sp = engine::gameplay::space;
        system.star_gm = 6.4e12;
        sp::Body planet;
        planet.name = "Tethys";
        planet.orbit_radius = 1.6e6;
        planet.period = 5027;
        planet.radius = 60000;
        planet.surface_gravity = 9.0;
        planet.atmosphere_height = 9000;
        planet.atmosphere_density = 1.05;
        planet.terrain_amplitude = 300;
        planet.terrain_scale = 3000;
        planet.seed = 7;
        sp::Body moon;
        moon.name = "Vell";
        moon.parent = 0;
        moon.orbit_radius = 230000;
        moon.period = 3850;
        moon.phase = 0.3;
        moon.radius = 18000;
        moon.surface_gravity = 2.6;
        moon.terrain_amplitude = 120;
        system.bodies = {planet, moon};
        spec.fuel = 400;
        ship.fuel = 400;
        sp::place_in_orbit(ship, system, 0, 30000);
        camera.yaw = 0.0F;
        camera.scale = 4.0F; // the renderer's closest zoom out
    }

    // One fixed step of 1/60 s: W/S throttle, X cut, arrows pitch and yaw,
    // Q/E roll, Space/C lift and sink, G autopilot to the moon, L land.
    void step(const engine::InputState &input) {
        namespace sp = engine::gameplay::space;
        using engine::Key;
        constexpr double dt = 1.0 / 60.0;
        const auto axis = [&](Key plus, Key minus) {
            return (input.key_down(plus) ? 1.0 : 0.0) - (input.key_down(minus) ? 1.0 : 0.0);
        };
        throttle = std::clamp(throttle + axis(Key::w, Key::s) * dt * 0.85, 0.0, 1.0);
        if (input.key_down(Key::x))
            throttle = 0;
        if (input.key_pressed(Key::g))
            autopilot = !autopilot;
        sp::ShipInput control;
        control.pitch = axis(Key::up, Key::down);
        control.yaw = axis(Key::right, Key::left);
        control.roll = axis(Key::e, Key::q);
        control.vertical = axis(Key::space, Key::c);
        control.throttle = throttle;
        if (control.pitch != 0 || control.yaw != 0 || input.key_down(Key::w) || input.key_down(Key::s))
            autopilot = false;
        if (input.key_pressed(Key::l))
            landing = !landing;
        if (input.key_down(Key::space) || input.key_down(Key::w))
            landing = false;
        if (landing && !ship.landed) {
            // Level, engines idle, sinking at a tenth of the height (2-40
            // m/s) so the touchdown is soft.
            autopilot = false;
            throttle = 0;
            control.assist = sp::Assist::stabilized;
            control.throttle = 0;
            const double up_speed = sp::dot(ship.velocity, sp::normalized(ship.position));
            const double wanted = -std::clamp(ground_clearance() * 0.1, 2.0, 40.0);
            control.vertical = std::clamp((wanted - up_speed) * 0.5, -1.0, 1.0);
        }
        if (autopilot) {
            const auto command = sp::autopilot_command(ship, spec, system, time, 1);
            control.assist = sp::Assist::autopilot;
            control.target_direction = command.direction;
            control.throttle = throttle = command.throttle;
            if (command.arrived)
                autopilot = false;
        }
        sp::step_ship(ship, spec, control, system, time, dt);
        time += dt;
        // The surface view centres between the ground and the ship.
        camera.target = {0, surface_view() ? static_cast<float>(std::clamp(ground_clearance() / 25 * 0.5, 0.0, 50.0)) : 0.0F, 0};
    }

    // Distance from the reference body's surface (m).
    [[nodiscard]] double altitude() const {
        namespace sp = engine::gameplay::space;
        if (ship.ref < 0)
            return sp::length(ship.position);
        return sp::length(ship.position) - system.bodies[static_cast<std::size_t>(ship.ref)].radius;
    }

    // Height over the terrain right below (m); the altitude above the
    // body's mean radius without one.
    [[nodiscard]] double ground_clearance() const {
        namespace sp = engine::gameplay::space;
        if (ship.ref < 0)
            return altitude();
        const auto &body = system.bodies[static_cast<std::size_t>(ship.ref)];
        const auto fixed = sp::rotate(sp::conjugate(sp::body_spin(body, time)), sp::normalized(ship.position));
        return sp::length(ship.position) - body.radius - sp::terrain_height(body, fixed);
    }

    // Close to the ground the view is the surface instead of the orrery.
    [[nodiscard]] bool surface_view() const { return ship.ref >= 0 && altitude() < 2500; }

    [[nodiscard]] std::vector<engine::Box> boxes() const {
        return surface_view() ? surface_boxes() : orrery_boxes();
    }

    // The ground around the point below the ship: 17 x 17 columns 150 m
    // apart, their tops at the terrain's height; a world unit is 25 m.
    [[nodiscard]] std::vector<engine::Box> surface_boxes() const {
        namespace sp = engine::gameplay::space;
        constexpr double scale = 25, spacing = 150;
        constexpr int half = 8;
        const auto &body = system.bodies[static_cast<std::size_t>(ship.ref)];
        const auto unspin = sp::conjugate(sp::body_spin(body, time));
        const auto up = sp::normalized(ship.position);
        const auto east = sp::normalized(sp::cross(std::abs(up.y) > 0.9 ? sp::DVec3{1, 0, 0} : sp::DVec3{0, 1, 0}, up));
        const auto north = sp::cross(up, east);
        const auto ground = [&](sp::DVec3 direction) {
            return body.radius + sp::terrain_height(body, sp::rotate(unspin, direction));
        };
        const double base = ground(up);
        std::vector<engine::Box> out;
        for (int i = -half; i <= half; ++i)
            for (int j = -half; j <= half; ++j) {
                const auto direction = sp::normalized(up * body.radius + east * (i * spacing) + north * (j * spacing));
                // The curve of the world drops the far columns a little.
                const double drop = (i * i + j * j) * spacing * spacing / (2 * body.radius);
                const double top = (ground(direction) - base - drop) / scale;
                const float depth = 6.0F;
                const auto shade = static_cast<engine::u8>(std::clamp(110.0 + top * 4.0, 60.0, 200.0));
                out.push_back({{static_cast<float>(i * spacing / scale), static_cast<float>(top) - depth / 2,
                                static_cast<float>(j * spacing / scale)},
                               {static_cast<float>(spacing / scale) * 0.96F, depth, static_cast<float>(spacing / scale) * 0.96F},
                               {static_cast<engine::u8>(shade * 0.75), shade, static_cast<engine::u8>(shade * 0.65)}});
            }
        const double height = (sp::length(ship.position) - base) / scale;
        out.push_back({{0, static_cast<float>(height) + 0.6F, 0}, {1.6F, 1.2F, 2.4F},
                       ship.landed ? std::array<engine::u8, 3>{155, 227, 122} : std::array<engine::u8, 3>{255, 214, 120}});
        // A plumb line from the ship to the ground.
        for (double h = height - 2; h > 0.5; h -= 2)
            out.push_back({{0, static_cast<float>(h), 0}, {0.25F, 0.25F, 0.25F}, {143, 247, 255}});
        return out;
    }

    // The orrery around the planet: a world unit is 4 km.
    [[nodiscard]] std::vector<engine::Box> orrery_boxes() const {
        namespace sp = engine::gameplay::space;
        constexpr double scale = 4000; // metres per world unit
        const auto planet = sp::body_position(system, 0, time);
        const auto to_view = [&](sp::DVec3 absolute) {
            const auto p = (absolute - planet) * (1.0 / scale);
            return engine::Vec3{static_cast<float>(p.x), static_cast<float>(p.y), static_cast<float>(p.z)};
        };
        std::vector<engine::Box> out;
        const auto body_box = [&](int index, std::array<engine::u8, 3> color) {
            const auto r = static_cast<float>(system.bodies[static_cast<std::size_t>(index)].radius / scale);
            out.push_back({to_view(sp::body_position(system, index, time)), {r * 1.6F, r * 1.6F, r * 1.6F}, color});
        };
        body_box(0, {79, 122, 74});
        body_box(1, {195, 207, 220});
        const auto ship_at = (ship.ref >= 0 ? sp::body_position(system, ship.ref, time) : sp::DVec3{}) + ship.position;
        out.push_back({to_view(ship_at), {1.4F, 1.4F, 1.4F}, {255, 214, 120}});
        // The coasting path, a dot every few seconds.
        const auto origin = ship.ref >= 0 ? sp::body_position(system, ship.ref, time) : sp::DVec3{};
        for (const auto &p : sp::predict_path(ship, system, 3000, 48))
            out.push_back({to_view(origin + p), {0.4F, 0.4F, 0.4F}, {143, 247, 255}});
        return out;
    }

    // Throttle, fuel and altitude (to 60 km) bars over a drawn frame.
    void hud(engine::BoxView &view) const {
        view.draw_bar(20, 20, 200, 12, static_cast<float>(throttle), {127, 200, 255});
        view.draw_bar(20, 40, 200, 12, static_cast<float>(ship.fuel / std::max(spec.fuel, 1.0)), {155, 227, 122});
        view.draw_bar(20, 60, 200, 12, static_cast<float>(std::clamp(altitude() / 60000.0, 0.0, 1.0)), {216, 207, 184});
        if (autopilot)
            view.draw_bar(20, 80, 200, 6, 1.0F, {255, 180, 71});
        if (landing)
            view.draw_bar(20, 90, 200, 6, 1.0F, {127, 200, 255});
        if (ship.landed)
            view.draw_bar(20, 100, 200, 6, 1.0F, {155, 227, 122});
    }
};

} // namespace playground
