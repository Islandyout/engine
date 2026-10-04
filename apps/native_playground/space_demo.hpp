#pragma once
// Spaceflight in the native playground (0.75.0): the engine's own
// space::step_ship over a planet with air and an airless moon, flown from
// the keyboard and drawn by the CPU box renderer as an orrery -- planet,
// moon, ship and its predicted path -- with throttle, fuel and altitude
// bars. `engine_playground --space`.
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
    // Q/E roll, Space/C lift and sink, G autopilot to the moon.
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
    }

    // Distance from the reference body's surface (m).
    [[nodiscard]] double altitude() const {
        namespace sp = engine::gameplay::space;
        if (ship.ref < 0)
            return sp::length(ship.position);
        return sp::length(ship.position) - system.bodies[static_cast<std::size_t>(ship.ref)].radius;
    }

    // The orrery around the planet: a world unit is 4 km.
    [[nodiscard]] std::vector<engine::Box> boxes() const {
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
    }
};

} // namespace playground
