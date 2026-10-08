// The editor runtime itself (0.77.0, split from bridge.cpp): BridgeHost, the
// script host, and Runtime, the world and every fixed system it ticks, in
// namespace editor_bridge. Shared by bridge.cpp, bridge_combat.cpp,
// bridge_space.cpp and bridge_melee.cpp.
#pragma once
#include "bridge_components.hpp"

namespace editor_bridge {
struct Runtime;
class BridgeHost final : public engine::script::Host {
public:
    explicit BridgeHost(Runtime &runtime) : runtime_(runtime) {}
    std::optional<engine::Entity> find(const engine::World &world, const std::string &name) override;
    std::string name_of(const engine::World &world, engine::Entity entity) override;
    std::optional<engine::Entity> spawn(engine::World &world, const std::string &prefab, engine::Vec3 position,
                                        engine::Vec3 velocity) override;
    void destroy(engine::World &world, engine::Entity entity) override { world.defer_destroy(entity); }
    bool health(const engine::World &world, engine::Entity entity, float &current, float &max) override;
    void damage(engine::World &world, engine::Entity entity, float amount) override;
    void heal(engine::World &world, engine::Entity entity, float amount) override;
    void emit(engine::Entity source, const std::string &kind, const std::string &a, const std::string &b) override;
    bool weapon(engine::World &world, engine::Entity self, const std::string &op, const std::vector<double> &args,
                std::vector<double> &out) override;
    bool vehicle(engine::World &world, engine::Entity entity, const std::string &op, const std::vector<double> &args,
                 const std::string &text, std::optional<engine::Entity> other, std::vector<double> &out) override;
    bool space(engine::World &world, const std::string &op, const std::vector<double> &args, const std::string &text,
               std::vector<double> &out, std::string &text_out) override;
    bool melee(engine::World &world, engine::Entity self, const std::string &op, const std::vector<double> &args,
               const std::string &text, std::optional<engine::Entity> other, std::vector<double> &out,
               std::string &text_out, std::optional<engine::Entity> &other_out) override; // bridge_melee.cpp

private:
    Runtime &runtime_;
};

struct Runtime {
    engine::World world;
    // Prefab definitions, instantiated by world.spawn(): one entity per
    // prefab name, never simulated (FixedSystems only ever runs `world`).
    engine::World templates;
    std::map<std::string, engine::Entity> template_by_name;
    // Set by editor_template_begin(): the next editor_add goes into
    // `templates` under this name instead of the live scene.
    std::optional<std::string> adding_template;
    std::optional<engine::Entity> last_template;
    std::vector<OutboundCommand> commands;
    BridgeHost host{*this};
    engine::FixedSystems systems;
    engine::InputState input;
    std::vector<engine::Entity> entities;
    engine::u64 ticks{};
    // Set by editor_key() on a genuine F/G keydown edge; consumed (and
    // cleared) by the first fixed tick that actually acts on it, rather than
    // read from InputState::key_pressed() directly. editor_tick's own doc
    // comment notes a rendered frame can cover zero to five ticks sharing
    // one editor_input_begin_frame() call: key_pressed() stays true for
    // every tick in that batch, so a zero-tick frame would silently drop
    // the edge before any tick ever saw it, and a five-tick catch-up frame
    // would fire the action once per tick instead of once per press. These
    // flags decouple "a press happened" from frame/tick timing entirely.
    bool pending_attack{false};
    bool pending_blast{false};
    // Horizontal camera-forward direction, set by editor_set_camera_forward()
    // once per rendered frame. Defaults to world -z so a Runtime nothing ever
    // calls that on (every native test below included) behaves exactly like
    // the fixed-world-axis movement this replaced — camera-relative movement
    // degenerates to the old behavior when the camera happens to be looking
    // down -z, which this default simply assumes until told otherwise.
    float camera_forward_x{0.0F};
    float camera_forward_z{-1.0F};
    // First-person look direction in radians, set by editor_set_look() once
    // per rendered frame (the editor owns mouse look so it stays smooth at
    // any display rate). yaw 0 looks down -z; pitch > 0 looks up.
    float look_yaw{0.0F};
    float look_pitch{0.0F};
    // Physics settings shared by every system that steps or queries it.
    engine::physics::Config physics_config{};
    // The scene's terrain (editor_set_terrain), if any; physics_config and
    // the nav grid point at it.
    std::optional<engine::physics::Heightfield> terrain;
    int obstacle_count{0};
    engine::script::Runtime script_runtime;
    std::map<engine::Entity, std::string> script_errors;
    // Contact/trigger bookkeeping across physics steps (enter/stay/exit).
    engine::physics::Events physics_events;
    // Walkability grid for chasing AI and world.path(), rebaked from the
    // static colliders once a second (see the "editor.nav" system).
    // Covers a 260 m square (0.66.0; was 120 m) so outdoor levels on a
    // terrain get paths end to end.
    engine::nav::Grid nav_grid{engine::nav::Settings{0.5F, 0.4F, 0.35F, 2.0F, 130.0F}};
    // Named actions from the scene's InputActions bindings (or the
    // defaults), evaluated from `input` every tick.
    engine::ActionSystem actions{default_input_map()};
    std::string bindings_error;
    std::vector<WeaponEvent> weapon_events;
    std::string weapons_error;
    std::vector<MeleeEvent> melee_events;
    std::string melee_error;
    std::vector<Noise> noises;
    int team_of(const engine::World &w, engine::Entity entity) const {
        if (w.get<PlayerMarker>(entity))
            return 0;
        if (const auto *soldier = w.get<Soldier>(entity))
            return soldier->team;
        if (const auto *fighter = w.get<Fighter>(entity))
            return fighter->team;
        return -1;
    }
    int index_of(engine::Entity entity) const {
        for (std::size_t i = 0; i < entities.size(); ++i)
            if (entities[i] == entity)
                return static_cast<int>(i);
        return -1;
    }
    void push_event(WeaponEvent event) {
        if (weapon_events.size() < 1024)
            weapon_events.push_back(event);
    }
    void push_melee(MeleeEvent event) {
        if (melee_events.size() < 1024)
            melee_events.push_back(event);
    }
    // Melee (0.78.0): every Fighter's tick -- input or brain, moves, facing,
    // lunges, hits, knockback and launches (bridge_melee.cpp).
    void step_melee(engine::World &w);
    void melee_strike(engine::World &w, engine::Entity self, Fighter &fighter);
    // ---- Spaceflight (0.71.0): see SpaceSim.
    std::optional<SpaceSim> space;
    std::optional<engine::Entity> player_entity(const engine::World &w) const {
        for (const auto entity : w.query<engine::Box, PlayerMarker>())
            return entity;
        return std::nullopt;
    }
    bool stowed(engine::Entity entity) const { return space && space->piloting && space->stowed == entity; }
    // The terrain under a point for the ship: the body's surface, or a roof
    // or pad of the site's colliders just below it.
    double space_surface(int index, space::DVec3 p, const engine::physics::RaycastTargets *targets) const {
        const auto &sp = *space;
        double radius = space::surface_radius(sp.system.bodies[static_cast<std::size_t>(index)], space::normalized(p));
        if (index != sp.site_body || !targets)
            return radius;
        const auto local = sp.rotate_to_local(p - sp.site_origin);
        if (std::abs(local.x) > sp.eva_range || std::abs(local.z) > sp.eva_range || local.y < -100 || local.y > 3000)
            return radius;
        engine::physics::QueryFilter filter;
        if (sp.ship_entity)
            filter.ignore = *sp.ship_entity;
        const engine::Vec3 from{static_cast<float>(local.x), static_cast<float>(local.y + 3.0), static_cast<float>(local.z)};
        const auto hit = engine::physics::raycast(*targets, from, {0, -1, 0}, 40.0F, physics_config, filter);
        if (hit && !hit->hit_ground) {
            const space::DVec3 point{hit->point.x, hit->point.y, hit->point.z};
            const auto body_point = sp.site_origin + sp.axis_x * point.x + sp.axis_y * point.y + sp.axis_z * point.z;
            radius = std::max(radius, space::length(body_point));
        }
        return radius;
    }
    // A walk frame's heightfield under construction (0.75.0): built a few
    // rows a tick ahead of need, so re-anchoring on foot never stalls a frame.
    struct FieldBuild final {
        int body{-1};
        int site{-2}; // the site it's for (-2 a wilderness frame)
        space::DVec3 up{}, axis_x{}, axis_z{}, origin{};
        engine::physics::Heightfield field;
        int row{};
        float lowest{};
        [[nodiscard]] bool done() const { return row >= field.resolution; }
    };
    std::optional<FieldBuild> pending_field;
    FieldBuild begin_field(int index, space::DVec3 up, int site) const {
        const auto &sim = *space;
        const auto &body = sim.system.bodies[static_cast<std::size_t>(index)];
        FieldBuild b;
        b.body = index;
        b.site = site;
        b.up = space::normalized(up);
        frame_axes(b.up, b.axis_x, b.axis_z);
        b.origin = b.up * space::surface_radius(body, b.up);
        const double size = sim.eva_range * 2;
        const int resolution = std::clamp(static_cast<int>(size / 8.0) + 1, 65, 385);
        b.field.center = {0, 0, 0};
        b.field.size = static_cast<float>(size);
        b.field.resolution = resolution;
        b.field.heights.resize(static_cast<std::size_t>(resolution) * static_cast<std::size_t>(resolution));
        return b;
    }
    void step_field(FieldBuild &b, int rows) const {
        const auto &body = space->system.bodies[static_cast<std::size_t>(b.body)];
        const int resolution = b.field.resolution;
        const double size = b.field.size;
        for (int n = 0; n < rows && b.row < resolution; ++n, ++b.row)
            for (int col = 0; col < resolution; ++col) {
                const double x = -size / 2 + size * col / (resolution - 1), z = -size / 2 + size * b.row / (resolution - 1);
                const auto p = space::normalized(b.origin + b.axis_x * x + b.axis_z * z);
                const auto surface = p * space::surface_radius(body, p);
                const auto h = static_cast<float>(space::dot(surface - b.origin, b.up));
                b.field.heights[static_cast<std::size_t>(b.row) * static_cast<std::size_t>(resolution) +
                                static_cast<std::size_t>(col)] = h;
                b.lowest = std::min(b.lowest, h);
            }
    }
    void apply_field(FieldBuild &&b) {
        auto &sim = *space;
        sim.site_body = b.body;
        sim.axis_y = b.up;
        sim.axis_x = b.axis_x;
        sim.axis_z = b.axis_z;
        sim.site_origin = b.origin;
        const float lowest = b.lowest;
        terrain = std::move(b.field);
        physics_config.terrain = &*terrain;
        physics_config.ground_y = lowest - 500.0F;
        ++sim.frame_generation;
    }
    // Puts the walk/draw frame on body `index` above `up`: axes, origin on
    // the surface, and the walkable heightfield sampled from the body in
    // frame coordinates (curvature included).
    void anchor_frame(int index, space::DVec3 up) {
        auto b = begin_field(index, up, -2);
        step_field(b, b.field.resolution);
        pending_field.reset();
        apply_field(std::move(b));
    }
    // The frame axes anchor_frame() builds for a surface direction.
    static void frame_axes(space::DVec3 up, space::DVec3 &x, space::DVec3 &z) {
        const space::DVec3 helper = std::abs(up.y) < 0.99 ? space::DVec3{0, 1, 0} : space::DVec3{1, 0, 0};
        x = space::normalized(space::cross(helper, up));
        z = space::cross(x, up);
    }
    // Which site a landed ship at body-frame `p` on body `ref` stands in:
    // a Site's index, -1 the home site, -2 none (0.73.0).
    int site_at(int ref, space::DVec3 p) const {
        const auto &sim = *space;
        for (std::size_t i = 0; i < sim.sites.size(); ++i) {
            const auto &site = sim.sites[i];
            if (site.body != ref)
                continue;
            const auto &body = sim.system.bodies[static_cast<std::size_t>(ref)];
            const double arc = std::acos(std::clamp(space::dot(space::normalized(p), site.up), -1.0, 1.0)) * body.radius;
            if (arc < site.radius)
                return static_cast<int>(i);
        }
        if (ref == sim.home_body) {
            const auto d = p - sim.home_origin;
            if (std::abs(space::dot(d, sim.home_x)) < sim.eva_range - 30 &&
                std::abs(space::dot(d, sim.home_z)) < sim.eva_range - 30 && space::dot(d, sim.home_y) < 500)
                return -1;
        }
        return -2;
    }
    // Parks every entity that isn't part of the active site (non-solid,
    // held still; the editor hides them) and wakes the ones that are.
    void update_parking(engine::World &w) {
        auto &sim = *space;
        for (const auto entity : w.query<engine::Box>()) {
            if (entity == sim.ship_entity || entity == sim.stowed || w.get<PlayerMarker>(entity))
                continue;
            const auto member = sim.members.find(entity);
            const int site = member == sim.members.end() ? -1 : member->second;
            auto *collider = w.get<engine::physics::Collider>(entity);
            if (site != sim.active_site) {
                if (!sim.pinned.count(entity)) {
                    sim.pinned[entity] = w.get<engine::Box>(entity)->center;
                    if (collider) {
                        sim.parked[entity] = collider->is_trigger;
                        collider->is_trigger = true;
                    }
                }
            } else if (sim.pinned.count(entity)) {
                w.get<engine::Box>(entity)->center = sim.pinned[entity];
                sim.pinned.erase(entity);
                if (collider && sim.parked.count(entity))
                    collider->is_trigger = sim.parked[entity];
                sim.parked.erase(entity);
            }
        }
    }
    // After a touchdown: at a Site the frame moves there; back home it
    // returns; anywhere else it follows the ship so the pilot can step out.
    // Entities of other sites are parked (non-solid; the editor hides them).
    void reframe_after_landing(engine::World &w) {
        auto &sim = *space;
        if (!sim.ship.landed || sim.ship.ref < 0)
            return;
        const auto ship_fixed = sim.fixed(sim.ship.position, sim.ship.ref);
        const int site = site_at(sim.ship.ref, ship_fixed);
        if (site == sim.active_site && site != -2)
            return;
        if (site == -2 && sim.active_site == -2 && sim.ship.ref == sim.site_body) {
            const auto local = sim.rotate_to_local(ship_fixed - sim.site_origin);
            if (std::abs(local.x) < sim.eva_range - 30 && std::abs(local.z) < sim.eva_range - 30)
                return; // still inside the current wilderness frame
        }
        if (site == -1) {
            sim.site_body = sim.home_body;
            sim.site_origin = sim.home_origin;
            sim.axis_x = sim.home_x;
            sim.axis_y = sim.home_y;
            sim.axis_z = sim.home_z;
            terrain = sim.home_ground;
            physics_config.terrain = terrain ? &*terrain : nullptr;
            physics_config.ground_y = sim.home_ground_y;
            ++sim.frame_generation;
        } else if (site >= 0) {
            const auto &info = sim.sites[static_cast<std::size_t>(site)];
            anchor_prebuilt(info.body, info.up, site);
        } else {
            anchor_prebuilt(sim.ship.ref, ship_fixed, -2);
        }
        sim.active_site = site;
        sim.away = site != -1;
        update_parking(w);
        if (site == -1)
            sim.event("frame:home");
        else if (site >= 0)
            sim.event("site:" + sim.sites[static_cast<std::size_t>(site)].name);
        else
            sim.event("frame:" + sim.system.bodies[static_cast<std::size_t>(sim.ship.ref)].name);
        settle_landed(w);
    }
    // Descending somewhere new (0.75.0): the ground the frame will need at
    // touchdown is built a few rows a tick on the way down, so landing on a
    // cratered world doesn't stall the frame it happens in.
    void prebuild_landing_field() {
        auto &sim = *space;
        if (!sim.piloting || sim.ship.landed || sim.ship.ref < 0)
            return;
        const auto &body = sim.system.bodies[static_cast<std::size_t>(sim.ship.ref)];
        const auto fixed = sim.fixed(sim.ship.position, sim.ship.ref);
        if (space::length(fixed) - body.radius > 4000)
            return;
        const int site = site_at(sim.ship.ref, fixed);
        if (site == -1 || (site == sim.active_site && site != -2))
            return;
        if (site == -2 && sim.active_site == -2 && sim.ship.ref == sim.site_body) {
            const auto local = sim.rotate_to_local(fixed - sim.site_origin);
            if (std::abs(local.x) < sim.eva_range - 30 && std::abs(local.z) < sim.eva_range - 30)
                return;
        }
        const auto up = site >= 0 ? sim.sites[static_cast<std::size_t>(site)].up : space::normalized(fixed);
        const int on = site >= 0 ? sim.sites[static_cast<std::size_t>(site)].body : sim.ship.ref;
        const bool stale = !pending_field || pending_field->site != site || pending_field->body != on ||
                           (site == -2 && space::length(pending_field->up - up) * body.radius > sim.eva_range * 0.3);
        if (stale)
            pending_field = begin_field(on, up, site);
        step_field(*pending_field, 24);
    }
    // The prebuilt field if it suits a frame anchored at (`index`, `up`) for
    // `site`, finished; else a fresh one.
    void anchor_prebuilt(int index, space::DVec3 up, int site) {
        auto &sim = *space;
        const auto &body = sim.system.bodies[static_cast<std::size_t>(index)];
        if (pending_field && pending_field->body == index && pending_field->site == site &&
            space::length(pending_field->up - space::normalized(up)) * body.radius < sim.eva_range * 0.3) {
            step_field(*pending_field, pending_field->field.resolution);
            apply_field(std::move(*pending_field));
            pending_field.reset();
            return;
        }
        anchor_frame(index, up);
    }
    // A landed ship rests on whatever is under it: a pad or roof of the
    // site's colliders as well as the ground.
    void settle_landed(engine::World &w) {
        auto &sp = *space;
        if (!sp.ship.landed || sp.ship.ref < 0)
            return;
        const auto targets = engine::physics::raycast_targets(w);
        const double ground = space_surface(sp.ship.ref, sp.fixed(sp.ship.position, sp.ship.ref), &targets);
        sp.ship.position = space::normalized(sp.ship.position) * (ground + sp.spec.gear_clearance);
        if (sp.ship_entity && w.alive(*sp.ship_entity)) {
            const auto local = sp.to_local(sp.ship_absolute());
            w.get<engine::Box>(*sp.ship_entity)->center = {static_cast<float>(local.x), static_cast<float>(local.y),
                                                           static_cast<float>(local.z)};
        }
    }
    // The site-frame height of the walkable ground (the heightfield) at x, z.
    float site_ground(float x, float z) const {
        if (terrain && terrain->contains(x, z))
            return terrain->height_at(x, z);
        return physics_config.ground_y;
    }
    void stow_player(engine::World &w) {
        auto &sp = *space;
        const auto player = player_entity(w);
        if (!player)
            return;
        sp.stowed = *player;
        if (auto *collider = w.get<engine::physics::Collider>(*player)) {
            sp.stowed_trigger = collider->is_trigger;
            collider->is_trigger = true;
        }
        if (auto *body = w.get<engine::physics::RigidBody>(*player)) {
            sp.stowed_type = body->type;
            body->type = engine::physics::BodyType::Kinematic;
            body->velocity = {};
        }
    }
    void place_stowed(engine::World &w) {
        auto &sp = *space;
        if (!sp.piloting || !sp.stowed || !w.alive(*sp.stowed) || !sp.ship_entity)
            return;
        if (auto *box = w.get<engine::Box>(*sp.stowed))
            box->center = w.get<engine::Box>(*sp.ship_entity)->center;
        if (auto *body = w.get<engine::physics::RigidBody>(*sp.stowed))
            body->velocity = {};
    }
    // Out of the ship onto the ground beside it: only landed, inside the
    // walkable site.
    bool space_exit(engine::World &w) {
        auto &sp = *space;
        if (!sp.piloting || !sp.ship.landed || !sp.ship_entity || !sp.stowed || !w.alive(*sp.stowed))
            return false;
        const auto ship_box = *w.get<engine::Box>(*sp.ship_entity);
        const auto left = sp.rotate_to_local(sp.fixed(space::rotate(sp.ship.attitude, {1, 0, 0})));
        const double side = std::max(ship_box.size.x, ship_box.size.z) * 0.5 + 1.5;
        const float x = static_cast<float>(ship_box.center.x + left.x * side);
        const float z = static_cast<float>(ship_box.center.z + left.z * side);
        if (std::abs(x) > sp.eva_range - 5 || std::abs(z) > sp.eva_range - 5) {
            sp.event("exit_blocked");
            return false;
        }
        auto &box = *w.get<engine::Box>(*sp.stowed);
        box.center = {x, site_ground(x, z) + box.size.y * 0.5F + 0.05F, z};
        if (auto *collider = w.get<engine::physics::Collider>(*sp.stowed))
            collider->is_trigger = sp.stowed_trigger;
        if (auto *body = w.get<engine::physics::RigidBody>(*sp.stowed)) {
            body->type = sp.stowed_type;
            body->velocity = {};
        }
        sp.piloting = false;
        sp.throttle = 0;
        sp.event("exited");
        return true;
    }
    bool space_board(engine::World &w) {
        auto &sp = *space;
        if (sp.piloting || !sp.ship_entity || sp.ship.destroyed)
            return false;
        const auto player = player_entity(w);
        if (!player)
            return false;
        sp.piloting = true;
        stow_player(w);
        place_stowed(w);
        sp.event("boarded");
        return true;
    }
    void space_tick(engine::World &w, const engine::InputState &in) {
        auto &sp = *space;
        constexpr double dt = 1.0 / 60.0;
        using engine::Key;
        const auto down = [&](Key k) { return in.key_down(k); };
        const Key edge_keys[8] = {Key::e, Key::t, Key::n, Key::x, Key::digit9, Key::digit0, Key::f1, Key::f2};
        bool pressed[8]{};
        for (int i = 0; i < 8; ++i) {
            const bool d = down(edge_keys[i]);
            pressed[i] = d && !sp.previous_keys[i];
            sp.previous_keys[i] = d;
        }
        space::ShipInput control;
        if (sp.piloting && sp.controls && !sp.ship.destroyed) {
            const auto axis = [&](std::initializer_list<Key> plus, std::initializer_list<Key> minus) {
                double v = 0;
                for (const auto k : plus)
                    if (down(k)) {
                        v += 1;
                        break;
                    }
                for (const auto k : minus)
                    if (down(k)) {
                        v -= 1;
                        break;
                    }
                return v;
            };
            const double throttle_axis = axis({Key::w}, {Key::s});
            sp.throttle = std::clamp(sp.throttle + throttle_axis * dt * 0.85, 0.0, 1.0);
            if (down(Key::left_shift) || down(Key::right_shift))
                sp.throttle = 1;
            if (pressed[3])
                sp.throttle = 0;
            control.pitch = axis({Key::up, Key::i}, {Key::down, Key::k});
            control.yaw = axis({Key::right, Key::l, Key::d}, {Key::left, Key::j, Key::a});
            if (control.pitch == 0)
                control.pitch = std::clamp(sp.stick_pitch, -1.0, 1.0);
            if (control.yaw == 0)
                control.yaw = std::clamp(sp.stick_yaw, -1.0, 1.0);
            if (!sp.ship.landed)
                control.roll = axis({Key::e}, {Key::q});
            control.vertical = axis({Key::space}, {Key::c, Key::left_control});
            if (pressed[1])
                sp.assist = sp.assist == space::Assist::manual ? space::Assist::stabilized : space::Assist::manual;
            if (pressed[2]) {
                // NAV cycles prograde -> retrograde -> target (if any) -> off.
                switch (sp.assist) {
                case space::Assist::prograde: sp.assist = space::Assist::retrograde; break;
                case space::Assist::retrograde:
                    sp.assist = sp.target >= 0 ? space::Assist::target : space::Assist::stabilized;
                    break;
                case space::Assist::target:
                    sp.assist = sp.target >= 0 ? space::Assist::autopilot : space::Assist::stabilized;
                    break;
                case space::Assist::autopilot: sp.assist = space::Assist::stabilized; break;
                default: sp.assist = space::Assist::prograde; break;
                }
            }
            if (pressed[4])
                sp.warp = std::max(1.0, sp.warp / 2);
            if (pressed[5])
                sp.warp = std::min(1000.0, sp.warp * 2);
            if (pressed[0] && sp.ship.landed)
                space_exit(w);
        } else if (!sp.piloting && sp.board_key && pressed[0] && sp.ship_entity && sp.ship.landed) {
            const auto player = player_entity(w);
            if (player) {
                const auto a = w.get<engine::Box>(*player)->center, b = w.get<engine::Box>(*sp.ship_entity)->center;
                const auto size = w.get<engine::Box>(*sp.ship_entity)->size;
                const float reach = std::max(size.x, size.z) * 0.5F + 4.0F;
                if (std::hypot(a.x - b.x, a.z - b.z) < reach)
                    space_board(w);
            }
        }
        control.throttle = sp.piloting ? sp.throttle : 0.0;
        control.assist = sp.assist;
        if (sp.target >= 0)
            control.target_direction = space::body_position(sp.system, sp.target, sp.time) - sp.ship_absolute();
        // The NAV autopilot (0.73.0) owns throttle and nose until the pilot
        // touches anything -- manual input always wins.
        sp.autopilot_phase.clear();
        if (sp.assist == space::Assist::autopilot) {
            const bool pilot = sp.piloting && sp.controls &&
                               (down(Key::w) || down(Key::s) || down(Key::left_shift) || down(Key::right_shift) ||
                                pressed[3] || control.pitch != 0 || control.yaw != 0 || control.roll != 0 ||
                                control.vertical != 0);
            if (!sp.piloting || sp.target < 0 || pilot || sp.ship.landed) {
                if (!sp.ship.landed || pilot) {
                    sp.assist = space::Assist::stabilized;
                    control.assist = sp.assist;
                    sp.event("autopilot_off");
                }
            } else {
                const auto command = space::autopilot_command(sp.ship, sp.spec, sp.system, sp.time, sp.target);
                sp.autopilot_phase = command.phase;
                if (command.arrived) {
                    sp.assist = space::Assist::stabilized;
                    control.assist = sp.assist;
                    sp.throttle = control.throttle = 0;
                    sp.warp = 1;
                    sp.event("autopilot_arrived");
                } else {
                    control.target_direction = command.direction;
                    sp.throttle = control.throttle = command.throttle;
                    // Coasting: time warp scaled to the time left.
                    if (command.throttle == 0 && sp.ship.density == 0) {
                        const auto plan = space::plan_route(sp.ship, sp.spec, sp.system, sp.time, sp.target);
                        const double eta = plan.closing_speed > 1 ? plan.distance / plan.closing_speed : 0;
                        sp.warp = std::clamp(std::floor(eta / 40), 1.0, 64.0);
                    }
                }
            }
        }
        if (sp.ship.ref == sp.site_body && sp.ship.ref >= 0)
            control.wind = sp.axis_x * sp.wind_local.x + sp.axis_y * sp.wind_local.y + sp.axis_z * sp.wind_local.z;
        // Time warp only while coasting in space.
        const bool can_warp = sp.piloting && !sp.ship.landed && sp.ship.density == 0 && control.throttle == 0 &&
                              control.vertical == 0 && !sp.ship.destroyed;
        if (!can_warp)
            sp.warp = 1;
        const double step = dt * sp.warp;
        std::optional<engine::physics::RaycastTargets> targets;
        const auto local_ship = sp.to_local(sp.ship_absolute());
        if (sp.ship.ref == sp.site_body && std::abs(local_ship.x) < sp.eva_range * 1.5 &&
            std::abs(local_ship.z) < sp.eva_range * 1.5)
            targets = engine::physics::raycast_targets(w);
        const engine::physics::RaycastTargets *targets_ptr = targets ? &*targets : nullptr;
        const space::SurfaceQuery query = [this, targets_ptr](int index, space::DVec3 p) {
            return space_surface(index, p, targets_ptr);
        };
        const int before = sp.ship.ref;
        const bool was_destroyed = sp.ship.destroyed;
        space::step_ship(sp.ship, sp.spec, control, sp.system, sp.time, step, query);
        sp.time += step;
        sp.vertical_applied = control.vertical;
        if (sp.ship.touched_down)
            sp.event(sp.ship.last_touchdown.rough ? "rough_touchdown" : "touchdown");
        const bool reframe = sp.ship.touched_down && !sp.ship.destroyed;
        if (sp.ship.lifted_off)
            sp.event("liftoff");
        if (sp.ship.changed_ref && sp.ship.ref != before)
            sp.event("soi:" + (sp.ship.ref >= 0 ? sp.system.bodies[static_cast<std::size_t>(sp.ship.ref)].name
                                                : std::string{"star"}));
        if (sp.ship.destroyed && !was_destroyed)
            sp.event("destroyed");
        sp.ship.touched_down = sp.ship.lifted_off = sp.ship.changed_ref = false;
        if (reframe)
            reframe_after_landing(w);
        else
            prebuild_landing_field();
        if (sp.ship_entity && w.alive(*sp.ship_entity)) {
            const auto local = sp.to_local(sp.ship_absolute());
            w.get<engine::Box>(*sp.ship_entity)->center = {static_cast<float>(local.x), static_cast<float>(local.y),
                                                           static_cast<float>(local.z)};
        }
        place_stowed(w);
    }
    // After physics: the stowed pilot rides along; on foot, the walkable
    // site's edge holds the player in.
    void space_after(engine::World &w) {
        auto &sp = *space;
        place_stowed(w);
        // Parked entities (other sites') hold still wherever they were left.
        for (const auto &[entity, at] : sp.pinned)
            if (w.alive(entity)) {
                w.get<engine::Box>(entity)->center = at;
                if (auto *body = w.get<engine::physics::RigidBody>(entity))
                    body->velocity = {};
            }
        if (sp.piloting)
            return;
        walk_reframe(w);
        if (const auto player = player_entity(w)) {
            auto &box = *w.get<engine::Box>(*player);
            const float limit = static_cast<float>(sp.eva_range) - 2.0F;
            box.center.x = std::clamp(box.center.x, -limit, limit);
            box.center.z = std::clamp(box.center.z, -limit, limit);
        }
    }
    // Walking anywhere (0.75.0): on foot, the frame follows the walker. Out
    // past a site's edge (or the home field's) it becomes a wilderness
    // frame under them; far enough across a wilderness frame it re-anchors
    // ahead; into a site, that site's frame. The next frame's ground is
    // built a few rows a tick beforehand, and everything not parked moves
    // into the new frame's coordinates.
    void walk_reframe(engine::World &w) {
        auto &sp = *space;
        const auto player = player_entity(w);
        if (!player || sp.site_body < 0)
            return;
        const auto at = w.get<engine::Box>(*player)->center;
        const space::DVec3 local{at.x, at.y, at.z};
        const auto here = sp.site_origin + sp.axis_x * local.x + sp.axis_y * local.y + sp.axis_z * local.z;
        const double reach = std::max(std::abs(local.x), std::abs(local.z));
        // Where the walker is: a site (with some slack to leave the current
        // one, so its edge doesn't flicker), home, or the wilds.
        int site = site_at(sp.site_body, here);
        if (site != sp.active_site && sp.active_site >= 0) {
            const auto &current = sp.sites[static_cast<std::size_t>(sp.active_site)];
            const double arc = std::acos(std::clamp(space::dot(space::normalized(here), current.up), -1.0, 1.0)) *
                               sp.system.bodies[static_cast<std::size_t>(sp.site_body)].radius;
            if (current.body == sp.site_body && arc < current.radius + 60)
                site = sp.active_site;
        }
        if (site == -1 && sp.active_site != -1) {
            // Back into the home field only well inside it.
            const auto d = here - sp.home_origin;
            if (std::max(std::abs(space::dot(d, sp.home_x)), std::abs(space::dot(d, sp.home_z))) > sp.eva_range - 160)
                site = sp.active_site;
        }
        const bool wild_edge = site == -2 && sp.active_site == -2 && reach > sp.eva_range * 0.55;
        const bool leaving = site != sp.active_site;
        // Build ahead: the frame we'll want next.
        const bool soon = (sp.active_site == -2 && reach > sp.eva_range * 0.4) ||
                          (sp.active_site != -2 && reach > sp.eva_range * 0.25) || leaving;
        if (soon && site != -1) {
            const space::DVec3 up = site >= 0 ? sp.sites[static_cast<std::size_t>(site)].up : space::normalized(here);
            const bool stale = !pending_field || pending_field->site != site || pending_field->body != sp.site_body ||
                               (site == -2 && space::length(pending_field->origin - here) > sp.eva_range * 0.3);
            if (stale)
                pending_field = begin_field(site >= 0 ? sp.sites[static_cast<std::size_t>(site)].body : sp.site_body, up, site);
            step_field(*pending_field, 24);
        }
        if (!leaving && !wild_edge)
            return;
        // Into the new frame in body-fixed terms: across a wilderness frame
        // everything active (unparked) comes along; into or out of a site
        // only the walker does (the site's own stay where they are, parked).
        struct Moved final {
            engine::Entity entity;
            space::DVec3 position, velocity, home;
        };
        std::vector<Moved> moved;
        const auto to_fixed = [&](space::DVec3 v) { return sp.axis_x * v.x + sp.axis_y * v.y + sp.axis_z * v.z; };
        for (const auto entity : w.query<engine::Box>()) {
            if (entity == sp.ship_entity || sp.pinned.count(entity) || (leaving && entity != *player))
                continue;
            const auto c = w.get<engine::Box>(entity)->center;
            const auto *body = w.get<engine::physics::RigidBody>(entity);
            const auto *wild = w.get<Wildlife>(entity);
            moved.push_back({entity, sp.site_origin + to_fixed({c.x, c.y, c.z}),
                             body ? to_fixed({body->velocity.x, body->velocity.y, body->velocity.z}) : space::DVec3{},
                             wild ? sp.site_origin + to_fixed({wild->home.x, wild->home.y, wild->home.z}) : space::DVec3{}});
        }
        const int from = sp.active_site;
        if (site == -1) {
            sp.site_body = sp.home_body;
            sp.site_origin = sp.home_origin;
            sp.axis_x = sp.home_x;
            sp.axis_y = sp.home_y;
            sp.axis_z = sp.home_z;
            terrain = sp.home_ground;
            physics_config.terrain = terrain ? &*terrain : nullptr;
            physics_config.ground_y = sp.home_ground_y;
            ++sp.frame_generation;
        } else {
            if (!pending_field || pending_field->site != site)
                pending_field = begin_field(site >= 0 ? sp.sites[static_cast<std::size_t>(site)].body : sp.site_body,
                                            site >= 0 ? sp.sites[static_cast<std::size_t>(site)].up : space::normalized(here),
                                            site);
            step_field(*pending_field, pending_field->field.resolution);
            apply_field(std::move(*pending_field));
            pending_field.reset();
        }
        for (const auto &m : moved) {
            const auto p = sp.rotate_to_local(m.position - sp.site_origin);
            w.get<engine::Box>(m.entity)->center = {static_cast<float>(p.x), static_cast<float>(p.y), static_cast<float>(p.z)};
            if (auto *body = w.get<engine::physics::RigidBody>(m.entity)) {
                const auto v = sp.rotate_to_local(m.velocity);
                body->velocity = {static_cast<float>(v.x), static_cast<float>(v.y), static_cast<float>(v.z)};
            }
            if (auto *wild = w.get<Wildlife>(m.entity); wild && wild->homed) {
                const auto h = sp.rotate_to_local(m.home - sp.site_origin);
                wild->home = {static_cast<float>(h.x), static_cast<float>(h.y), static_cast<float>(h.z)};
            }
            if (m.entity == *player) {
                const auto east = sp.rotate_to_local(to_fixed({1, 0, 0}));
                sp.reframe_yaw = std::atan2(-east.z, east.x);
                sp.reframe_shift = p - local;
                sp.reframe_generation = sp.frame_generation;
            }
        }
        sp.active_site = site;
        sp.away = site != -1;
        if (site != from) {
            update_parking(w);
            if (site == -1)
                sp.event("frame:home");
            else if (site >= 0)
                sp.event("site:" + sp.sites[static_cast<std::size_t>(site)].name);
            else
                sp.event("frame:" + sp.system.bodies[static_cast<std::size_t>(sp.site_body)].name);
        } else {
            sp.event("reframe");
        }
        settle_landed(w);
    }
    bool parked(engine::Entity entity) const { return space && space->pinned.count(entity) > 0; }
    // The frame governor's sim stride (0.76.0): routines and wildlife
    // farther than 60 m from the walker (or the ship) decide every
    // `sim_stride` ticks, staggered so the work spreads evenly; their last
    // velocity carries them in between.
    int sim_stride{1};
    std::uint64_t sim_tick{};
    std::optional<engine::Vec3> sim_focus;
    void update_sim_focus(engine::World &w) {
        sim_focus.reset();
        if (const auto player = player_entity(w); player && !stowed(*player))
            sim_focus = w.get<engine::Box>(*player)->center;
        else if (space && space->ship_entity && w.alive(*space->ship_entity))
            sim_focus = w.get<engine::Box>(*space->ship_entity)->center;
    }
    bool sim_skip(engine::Vec3 at, std::size_t n) const {
        if (sim_stride <= 1 || !sim_focus || (sim_tick + n) % static_cast<std::uint64_t>(sim_stride) == 0)
            return false;
        return std::hypot(at.x - sim_focus->x, at.z - sim_focus->z) > 60.0F;
    }
    void step_routines(engine::World &w) {
        ++sim_tick;
        update_sim_focus(w);
        std::size_t n = 0;
        int searches = 0;
        for (const auto entity : w.query<engine::Box, Routine, engine::physics::RigidBody>()) {
            auto &routine = *w.get<Routine>(entity);
            auto &body = *w.get<engine::physics::RigidBody>(entity);
            if (routine.stops.empty() || parked(entity) || sim_skip(w.get<engine::Box>(entity)->center, n++))
                continue;
            // The latest stop whose hour has passed, wrapping to the last.
            int stop = static_cast<int>(routine.stops.size()) - 1;
            for (std::size_t i = 0; i < routine.stops.size(); ++i)
                if (routine.stops[i].hour <= clock_hours)
                    stop = static_cast<int>(i);
            routine.current = stop;
            const auto &goal = routine.stops[static_cast<std::size_t>(stop)];
            const auto at = w.get<engine::Box>(entity)->center;
            // Around buildings (0.76.0): a straight walk when nothing is in
            // the way, else the nav grid's path -- a few searches a tick,
            // the rest walk straight until their turn.
            const float frame = space ? static_cast<float>(space->frame_generation) : 0.0F;
            if ((routine.path_stop != stop || routine.path_frame != frame) && nav_grid.width() > 0) {
                const engine::Vec3 target{goal.x, at.y, goal.z};
                if (nav_grid.line_of_sight(at, target)) {
                    routine.path.clear();
                    routine.path_stop = stop;
                    routine.path_frame = frame;
                } else if (searches < 3) {
                    ++searches;
                    const auto found = nav_grid.find_path(at, target, 6000);
                    routine.path = found ? *found : std::vector<engine::Vec3>{};
                    routine.path_stop = stop;
                    routine.path_frame = frame;
                }
            }
            while (!routine.path.empty() && std::hypot(routine.path.front().x - at.x, routine.path.front().z - at.z) < 0.6F)
                routine.path.erase(routine.path.begin());
            const float distance = std::hypot(goal.x - at.x, goal.z - at.z);
            const bool via = !routine.path.empty() && routine.path.size() > 1;
            const float dx = (via ? routine.path.front().x : goal.x) - at.x;
            const float dz = (via ? routine.path.front().z : goal.z) - at.z;
            const float leg = std::max(std::hypot(dx, dz), 1e-3F);
            if (auto *agent = w.get<AIAgent>(entity))
                agent->state = distance > 1.2F ? AIState::Walking : AIState::Idle;
            if (distance > 1.2F) {
                body.velocity.x = dx / leg * routine.speed;
                body.velocity.z = dz / leg * routine.speed;
            } else {
                body.velocity.x = body.velocity.z = 0;
            }
        }
    }
    void step_wildlife(engine::World &w) {
        std::vector<std::pair<engine::Vec3, float>> threats; // position, flee scale
        if (const auto player = player_entity(w); player && !stowed(*player)) {
            float scale = 1;
            if (const auto *controller = w.get<Controller>(*player))
                scale = controller->state.sprinting || controller->state.speed > 6 ? 2.1F : 1.0F;
            threats.push_back({w.get<engine::Box>(*player)->center, scale});
        }
        if (space && space->ship_entity && w.alive(*space->ship_entity) && space->ship.engine_on)
            threats.push_back({w.get<engine::Box>(*space->ship_entity)->center, 3.5F});
        std::optional<engine::Entity> walker = player_entity(w);
        if (walker && stowed(*walker))
            walker.reset();
        std::size_t n = 0;
        for (const auto entity : w.query<engine::Box, Wildlife, engine::physics::RigidBody>()) {
            auto &animal = *w.get<Wildlife>(entity);
            auto &body = *w.get<engine::physics::RigidBody>(entity);
            const auto at = w.get<engine::Box>(entity)->center;
            if (!animal.homed) {
                animal.home = at;
                animal.homed = true;
            }
            if (sim_skip(at, n++))
                continue;
            if (parked(entity)) {
                animal.state = 0;
                continue;
            }
            float nearest = 1e9F, flee_scale = 1;
            engine::Vec3 from{};
            for (const auto &[p, scale] : threats) {
                const float d = std::hypot(p.x - at.x, p.z - at.z);
                if (d / scale < nearest / flee_scale) {
                    nearest = d;
                    flee_scale = scale;
                    from = p;
                }
            }
            const int before = animal.state;
            if (nearest < animal.flee * flee_scale)
                animal.state = 2;
            else if (nearest < animal.wary * std::max(1.0F, flee_scale * 0.8F))
                animal.state = before == 2 && nearest < animal.flee * flee_scale * 1.6F ? 2 : 1;
            else
                animal.state = 0;
            auto *agent = w.get<AIAgent>(entity);
            if (animal.state == 2) {
                float x = at.x - from.x, z = at.z - from.z;
                const float l = std::max(std::hypot(x, z), 1e-3F);
                x /= l;
                z /= l;
                // The leash bends the escape back toward home.
                const float hx = animal.home.x - at.x, hz = animal.home.z - at.z;
                const float home = std::hypot(hx, hz);
                if (home > animal.leash) {
                    x = x * 0.4F + hx / home * 0.6F;
                    z = z * 0.4F + hz / home * 0.6F;
                }
                body.velocity.x = x * animal.speed;
                body.velocity.z = z * animal.speed;
                if (agent)
                    agent->state = AIState::Fleeing;
            } else if (animal.state == 1) {
                body.velocity.x = body.velocity.z = 0;
                if (agent)
                    agent->state = AIState::Idle;
            } else if (agent && before != 0) {
                agent->state = AIState::Walking;
                agent->timer = 0;
            }
            // Soft radii (0.75.0): a big animal and the walker ease apart
            // instead of passing through each other -- the walker gives most.
            if (walker) {
                const auto &size = w.get<engine::Box>(entity)->size;
                const float own = std::max(size.x, size.z) * 0.5F;
                if (own >= 0.6F) {
                    auto &me = w.get<engine::Box>(*walker)->center;
                    auto &it = w.get<engine::Box>(entity)->center;
                    const float reach = own + 0.35F;
                    const float dx = me.x - it.x, dz = me.z - it.z;
                    const float d = std::hypot(dx, dz);
                    if (d < reach && d > 1e-3F && std::abs(me.y - it.y) < size.y) {
                        const float overlap = reach - d;
                        me.x += dx / d * overlap * 0.35F;
                        me.z += dz / d * overlap * 0.35F;
                        it.x -= dx / d * overlap * 0.12F;
                        it.z -= dz / d * overlap * 0.12F;
                    }
                }
            }
        }
    }
    // One tick of an arcade car (0.70.0): picks up the velocity physics
    // resolved last tick (walls and other cars), steps the car model, and
    // hands the result back to the body, turning its footprint with it.
    void drive_car(engine::World &w, engine::Entity entity, Heading &heading, engine::physics::RigidBody &body,
                   engine::gameplay::CarInput control) {
        constexpr float dt = 1.0F / 60.0F;
        auto &car = heading.car;
        car.velocity = {body.velocity.x, 0, body.velocity.z};
        if (heading.frozen) {
            control = {};
            car.velocity = {};
            car.yaw_rate = 0;
        }
        heading.input = control;
        engine::gameplay::step_car(car, heading.spec, control, dt);
        if (heading.frozen)
            car.velocity = {};
        body.velocity.x = car.velocity.x;
        body.velocity.z = car.velocity.z;
        heading.yaw = car.yaw;
        heading.speed = car.forward_speed;
        auto &box = *w.get<engine::Box>(entity);
        const float cos_yaw = std::cos(heading.yaw), sin_yaw = std::sin(heading.yaw);
        box.size.x = 2.0F * (std::abs(heading.half_x * cos_yaw) + std::abs(heading.half_z * sin_yaw));
        box.size.z = 2.0F * (std::abs(heading.half_x * sin_yaw) + std::abs(heading.half_z * cos_yaw));
    }
    // The player's car controls from the named actions: move_y throttle
    // (forward) / brake and reverse (back), move_x steering, jump the
    // handbrake, sprint nitro.
    engine::gameplay::CarInput player_car_input() const {
        const auto value = [this](const char *name) { return actions.state(engine::ActionId{name}).value; };
        engine::gameplay::CarInput control;
        const float y = value("move_y");
        control.throttle = std::max(0.0F, y);
        control.brake = std::max(0.0F, -y);
        control.steer = std::clamp(value("move_x"), -1.0F, 1.0F);
        control.handbrake = value("jump") > 0.5F;
        control.nitro = value("sprint") > 0.5F;
        return control;
    }
    // An AI driver's control for this tick (see Driver).
    engine::gameplay::CarInput drive_ai(engine::World &w, engine::Entity entity, Heading &heading, Driver &driver,
                                        const engine::physics::RaycastTargets &targets) {
        using engine::Vec3;
        constexpr float dt = 1.0F / 60.0F;
        engine::gameplay::CarInput control;
        const auto &spec = heading.spec;
        const auto &car = heading.car;
        const Vec3 position = w.get<engine::Box>(entity)->center;
        const float speed = car.forward_speed;
        const float fx = std::sin(car.yaw), fz = std::cos(car.yaw);
        if (driver.reversing > 0) {
            driver.reversing -= dt;
            control.brake = 1;
            control.steer = driver.reverse_steer;
            return control;
        }
        const auto flat = [](Vec3 a, Vec3 b) { return std::hypot(a.x - b.x, a.z - b.z); };
        // Something solid straight ahead within `range`: distance, and whether it's another car.
        const auto probe = [&](float side, float range) -> std::optional<std::pair<float, bool>> {
            const Vec3 origin{position.x - fz * side, position.y + 0.3F, position.z + fx * side};
            engine::physics::QueryFilter filter;
            filter.ignore = entity;
            const auto hit = engine::physics::raycast(targets, origin, Vec3{fx, 0, fz}, range, physics_config, filter);
            if (!hit || hit->hit_ground)
                return std::nullopt;
            return std::pair{hit->distance, w.get<Heading>(hit->entity) != nullptr};
        };
        Vec3 target = position;
        float target_speed = 0;
        bool chase_direct = false;
        if (driver.mode == DriveMode::Pursuit) {
            if (driver.target && !w.alive(*driver.target))
                driver.target.reset();
            if (!driver.target) {
                if (driver.target_name.empty()) {
                    for (const auto player : w.query<engine::Box, PlayerMarker>()) {
                        driver.target = player;
                        break;
                    }
                } else {
                    for (const auto other : w.query<EntityName>())
                        if (w.get<EntityName>(other)->value == driver.target_name) {
                            driver.target = other;
                            break;
                        }
                }
            }
            if (driver.target) {
                const Vec3 goal = w.get<engine::Box>(*driver.target)->center;
                const auto *goal_body = w.get<engine::physics::RigidBody>(*driver.target);
                const Vec3 lead = goal_body ? Vec3{goal_body->velocity.x * 0.5F, 0, goal_body->velocity.z * 0.5F} : Vec3{};
                target = {goal.x + lead.x, goal.y, goal.z + lead.z};
                // Straight at it when nothing solid is in between; otherwise
                // the route (if the script gave one) leads around the block.
                const Vec3 to{target.x - position.x, 0, target.z - position.z};
                const float distance = std::max(std::hypot(to.x, to.z), 0.01F);
                engine::physics::QueryFilter filter;
                filter.ignore = entity;
                const auto hit = engine::physics::raycast(targets, {position.x, position.y + 0.3F, position.z},
                                                          {to.x, 0, to.z}, distance, physics_config, filter);
                chase_direct = !hit || hit->hit_ground || hit->entity == *driver.target ||
                               w.get<Heading>(hit->entity) != nullptr || driver.route.empty();
                if (chase_direct) {
                    target_speed = spec.top_speed * driver.speed_scale;
                    // Close in and aggressive: aim at the target's flank to ram it.
                    if (distance < 14.0F && driver.aggression > 0.5F && goal_body) {
                        const float gyaw = w.get<Heading>(*driver.target) ? w.get<Heading>(*driver.target)->yaw : 0.0F;
                        const float side = (std::sin(driver.reverse_steer * 7.0F) > 0 ? 1.0F : -1.0F) * 1.5F;
                        target.x += -std::cos(gyaw) * side;
                        target.z += std::sin(gyaw) * side;
                    }
                    if (distance < 6.0F && driver.aggression <= 0.5F)
                        target_speed = std::hypot(goal_body ? goal_body->velocity.x : 0, goal_body ? goal_body->velocity.z : 0);
                    control.nitro = distance > 50.0F && driver.skill > 0.5F && car.nitro > 0.3F;
                }
            }
        }
        if (driver.mode == DriveMode::Off || (driver.mode == DriveMode::Pursuit && !driver.target)) {
            control.brake = 1;
            return control;
        }
        if (!chase_direct) {
            if (driver.route.empty()) {
                control.brake = 1;
                return control;
            }
            const std::size_t count = driver.route.size();
            const auto at = [&](std::size_t i) -> const Vec3 & { return driver.route[i % count]; };
            // Advance past points reached, or passed: beyond the point along
            // the leg leading into it (a car that runs wide must not circle
            // back for a point it already went by).
            const float reach = std::max(6.0F, std::abs(speed) * 0.35F);
            for (int guard = 0; guard < static_cast<int>(count); ++guard) {
                if (!driver.loop && driver.next >= count)
                    break;
                const Vec3 &point = at(driver.next);
                const Vec3 &before = driver.next > 0 || driver.loop ? at(driver.next + count - 1) : position;
                const float lx = point.x - before.x, lz = point.z - before.z;
                const bool passed = (position.x - point.x) * lx + (position.z - point.z) * lz > 0;
                if (flat(position, point) > reach && !passed)
                    break;
                driver.next = driver.loop ? (driver.next + 1) % count : driver.next + 1;
            }
            if (!driver.loop && driver.next >= count) {
                control.brake = 1;
                return control;
            }
            // Look ahead along the route by a speed-dependent distance.
            float lookahead = std::clamp(std::abs(speed) * 0.7F, 7.0F, 35.0F);
            Vec3 from = position;
            target = at(driver.next);
            for (std::size_t i = driver.next, steps = 0; steps < count; ++i, ++steps) {
                if (!driver.loop && i >= count)
                    break;
                const Vec3 &point = at(i);
                const float segment = flat(from, point);
                if (segment >= lookahead) {
                    const float t = lookahead / std::max(segment, 0.001F);
                    target = {from.x + (point.x - from.x) * t, point.y, from.z + (point.z - from.z) * t};
                    break;
                }
                lookahead -= segment;
                from = point;
                target = point;
            }
            // Corner speeds ahead: brake in time for each upcoming turn.
            const float pace = driver.mode == DriveMode::Traffic
                                   ? 13.0F * driver.speed_scale
                                   : spec.top_speed * driver.speed_scale * (0.82F + 0.18F * driver.skill);
            target_speed = pace;
            float travelled = flat(position, at(driver.next));
            for (std::size_t k = 0; k < std::min<std::size_t>(count, 8); ++k) {
                const std::size_t i = driver.next + k;
                if (!driver.loop && i + 1 >= count)
                    break;
                const Vec3 &a = k == 0 ? position : at(i - 1);
                const Vec3 &b = at(i);
                const Vec3 &c = at(i + 1);
                const float ax = b.x - a.x, az = b.z - a.z, bx = c.x - b.x, bz = c.z - b.z;
                const float la = std::hypot(ax, az), lb = std::hypot(bx, bz);
                if (la > 0.01F && lb > 0.01F) {
                    const float turn = std::acos(std::clamp((ax * bx + az * bz) / (la * lb), -1.0F, 1.0F));
                    if (turn > 0.08F) {
                        const float radius = std::min(la, lb) / std::max(turn, 0.01F);
                        const float corner = engine::gameplay::corner_speed(spec, radius) * (0.85F + 0.15F * driver.skill);
                        const float allowed = std::sqrt(corner * corner + 2.0F * spec.braking * 0.7F * travelled);
                        target_speed = std::min(target_speed, allowed);
                    }
                }
                travelled += lb;
                if (travelled > 160.0F)
                    break;
            }
            if (driver.mode == DriveMode::Race)
                control.nitro = driver.skill > 0.6F && target_speed > speed + 12.0F && car.nitro > 0.2F;
        }
        control = [&] {
            auto steered = engine::gameplay::steer_toward(car, spec, position, target, target_speed);
            steered.nitro = control.nitro;
            return steered;
        }();
        // Traffic ahead: traffic brakes for it; racers and police go around.
        const float look = std::max(10.0F, std::abs(speed) * 1.1F);
        if (const auto ahead = probe(0, look)) {
            if (driver.mode == DriveMode::Traffic && ahead->second) {
                control.throttle = 0;
                control.brake = std::max(control.brake, 1.0F - ahead->first / look);
            } else if (ahead->second || ahead->first < look * 0.6F) {
                const auto left = probe(1.6F, look), right = probe(-1.6F, look);
                const float l = left ? left->first : look, r = right ? right->first : look;
                control.steer = std::clamp(control.steer + (r >= l ? 0.6F : -0.6F), -1.0F, 1.0F);
            }
        }
        // Stuck against something: back out with the opposite lock.
        if (control.throttle > 0.3F && std::abs(speed) < 1.0F)
            driver.stuck += dt;
        else
            driver.stuck = std::max(0.0F, driver.stuck - dt);
        if (driver.stuck > 1.5F) {
            driver.stuck = 0;
            driver.reversing = 1.1F;
            driver.reverse_steer = control.steer >= 0 ? -1.0F : 1.0F;
        }
        return control;
    }
    // Every damage path (weapons, melee, blast, AI attacks, scripts) lands
    // here: Health goes down, the editor gets a "damaged" event, the target's
    // script hears on_damaged/on_death, and a defeated entity is destroyed.
    // A no-op without Health or once already at 0.
    void apply_damage(engine::World &w, engine::Entity target, float amount, std::optional<engine::Entity> attacker,
                      bool headshot = false) {
        auto *health = w.get<Health>(target);
        if (!health || health->current <= 0 || !(amount > 0))
            return;
        health->current = std::max(0.0F, health->current - amount);
        const bool killed = health->current <= 0;
        // A defeated fighter falls and lies there a moment (its death clip)
        // before it's removed; anything else goes at once.
        if (auto *fighter = w.get<Fighter>(target); killed && fighter) {
            fighter->state.mode = engine::gameplay::FighterMode::dead;
            fighter->dying = 4.0F;
        } else if (killed) {
            w.defer_destroy(target);
        }
        WeaponEvent event{WeaponEventKind::damaged, attacker ? index_of(*attacker) : -1, index_of(target)};
        const auto *source = attacker ? w.get<engine::Box>(*attacker) : nullptr;
        event.point = source ? source->center : w.get<engine::Box>(target)->center;
        event.value = amount;
        event.flags = (headshot ? event_headshot : 0) | (killed ? event_killed : 0);
        push_event(event);
        const auto name = [&w](std::optional<engine::Entity> entity) {
            const auto *n = entity ? w.get<EntityName>(*entity) : nullptr;
            return n ? n->value : std::string{};
        };
        script_runtime.notify_damage(w, target, amount, attacker, headshot, killed, name(target), name(attacker));
        if (auto *soldier = w.get<Soldier>(target); soldier && attacker && source &&
                                                    team_of(w, *attacker) != soldier->team) {
            soldier->last_known = source->center;
            soldier->awareness = 1;
            if (soldier->mode != SoldierMode::combat && soldier->mode != SoldierMode::cover)
                soldier->mode = SoldierMode::investigate;
        }
    }
    // The nearest thing a ray hits: a Collider (or the ground) through
    // physics::raycast, or any Box with Health that has no Collider.
    struct Trace final {
        std::optional<engine::Entity> entity;
        engine::Vec3 point{};
        engine::Vec3 normal{};
        float distance{};
    };
    std::optional<Trace> trace(engine::World &w, engine::Vec3 origin, engine::Vec3 direction, float range,
                               engine::Entity ignore) {
        engine::physics::QueryFilter filter;
        filter.ignore = ignore;
        std::optional<Trace> best;
        if (const auto hit = engine::physics::raycast(w, origin, direction, range, physics_config, filter))
            best = Trace{hit->hit_ground ? std::nullopt : std::optional{hit->entity}, hit->point, hit->normal,
                         hit->distance};
        for (const auto entity : w.query<engine::Box, Health>()) {
            if (entity == ignore || w.get<engine::physics::Collider>(entity))
                continue;
            const auto &box = *w.get<engine::Box>(entity);
            // Slab test against the target's box.
            float t_min = 0, t_max = best ? best->distance : range;
            int axis_hit = -1;
            const float o[3]{origin.x, origin.y, origin.z}, d[3]{direction.x, direction.y, direction.z};
            const float c[3]{box.center.x, box.center.y, box.center.z}, h[3]{box.size.x / 2, box.size.y / 2,
                                                                            box.size.z / 2};
            bool miss = false;
            for (int a = 0; a < 3 && !miss; ++a) {
                if (std::abs(d[a]) < 1e-9F) {
                    miss = o[a] < c[a] - h[a] || o[a] > c[a] + h[a];
                    continue;
                }
                float t1 = (c[a] - h[a] - o[a]) / d[a], t2 = (c[a] + h[a] - o[a]) / d[a];
                if (t1 > t2)
                    std::swap(t1, t2);
                if (t1 > t_min) {
                    t_min = t1;
                    axis_hit = a;
                }
                t_max = std::min(t_max, t2);
                miss = t_min > t_max;
            }
            if (miss || (best && t_min >= best->distance))
                continue;
            float n[3]{0, 0, 0};
            if (axis_hit >= 0)
                n[axis_hit] = d[axis_hit] > 0 ? -1.0F : 1.0F;
            best = Trace{entity,
                         {origin.x + direction.x * t_min, origin.y + direction.y * t_min,
                          origin.z + direction.z * t_min},
                         {n[0], n[1], n[2]},
                         t_min};
        }
        return best;
    }
    // Fires one round of `arsenal`'s current weapon from `origin` along
    // `direction` (unit): hitscan pellets, or a projectile.
    void fire_weapon(engine::World &w, engine::Entity shooter, Arsenal &arsenal, engine::Vec3 origin,
                     engine::Vec3 direction, float spread) {
        const auto slot = static_cast<std::size_t>(arsenal.state.current);
        const auto &weapon = arsenal.weapons[slot];
        WeaponEvent fired{WeaponEventKind::fire, index_of(shooter), -1, origin, direction, weapon.recoil,
                          static_cast<int>(slot)};
        push_event(fired);
        noises.push_back({origin, team_of(w, shooter), 1.0F});
        if (weapon.projectile) {
            const auto aim = engine::gameplay::spread_direction(direction, spread, arsenal.state.rng);
            const auto projectile = w.defer_create();
            w.defer_set(projectile, engine::Box{{origin.x + aim.x * 0.6F, origin.y + aim.y * 0.6F,
                                                 origin.z + aim.z * 0.6F},
                                                {0.25F, 0.25F, 0.25F}});
            Projectile p{{aim.x * weapon.speed, aim.y * weapon.speed, aim.z * weapon.speed}, shooter};
            p.lifetime = weapon.range / weapon.speed + 1.0F;
            p.damage = weapon.damage;
            p.gravity = weapon.gravity;
            p.splash = weapon.splash;
            w.defer_set(projectile, p);
            return;
        }
        std::map<engine::Entity, std::pair<float, bool>> damage_by_target;
        for (int pellet = 0; pellet < weapon.pellets; ++pellet) {
            const auto aim = engine::gameplay::spread_direction(direction, spread, arsenal.state.rng);
            const auto hit = trace(w, origin, aim, weapon.range, shooter);
            if (!hit)
                continue;
            const bool flesh = hit->entity && w.get<Health>(*hit->entity);
            push_event({WeaponEventKind::impact, index_of(shooter), hit->entity ? index_of(*hit->entity) : -1,
                        hit->point, hit->normal, 0, flesh ? event_flesh : 0});
            if (!flesh)
                continue;
            const auto &box = *w.get<engine::Box>(*hit->entity);
            const bool headshot =
                box.size.y >= 1.2F && hit->point.y >= box.center.y + box.size.y / 2 - box.size.y * 0.22F;
            auto &entry = damage_by_target[*hit->entity];
            entry.first += engine::gameplay::damage_at(weapon, hit->distance) * (headshot ? weapon.headshot : 1.0F);
            entry.second = entry.second || headshot;
        }
        for (const auto &[target, entry] : damage_by_target)
            apply_damage(w, target, entry.first, shooter, entry.second);
    }
    // An explosion: damage falls off linearly to 0 at the radius, and
    // finite-mass bodies are pushed away.
    void explode(engine::World &w, engine::Entity owner, engine::Vec3 at, float radius, float damage_amount) {
        push_event({WeaponEventKind::explode, index_of(owner), -1, at, {0, 1, 0}, radius, 0});
        noises.push_back({at, team_of(w, owner), 1.5F});
        for (const auto entity : w.query<engine::Box>()) {
            const auto &box = *w.get<engine::Box>(entity);
            const engine::Vec3 delta{box.center.x - at.x, box.center.y - at.y, box.center.z - at.z};
            const float distance = std::sqrt(delta.x * delta.x + delta.y * delta.y + delta.z * delta.z);
            if (distance >= radius)
                continue;
            const float scale = 1.0F - distance / radius;
            if (w.get<Health>(entity))
                apply_damage(w, entity, damage_amount * scale, owner);
            if (auto *body = w.get<engine::physics::RigidBody>(entity);
                body && body->mass > 0 && body->type == engine::physics::BodyType::Dynamic && distance > 1e-3F) {
                const float push = 12.0F * scale * body->mass;
                engine::physics::add_impulse(*body, {delta.x / distance * push, delta.y / distance * push + push * 0.3F,
                                                     delta.z / distance * push});
            }
        }
    }
    // -- Combat AI (Soldier) ---------------------------------------------
    static float random01(std::uint32_t &state) {
        if (state == 0)
            state = 1;
        state ^= state << 13;
        state ^= state >> 17;
        state ^= state << 5;
        return static_cast<float>(state & 0xFFFFFFU) / 16777216.0F;
    }
    // Sight: inside range and the view cone (or very close), with nothing
    // solid in between.
    bool soldier_sees(engine::World &w, engine::Entity self, const Soldier &soldier, const engine::Box &box,
                      engine::Entity target) {
        const auto &target_box = *w.get<engine::Box>(target);
        const engine::Vec3 eye{box.center.x, box.center.y + box.size.y * 0.4F, box.center.z};
        const engine::Vec3 aim{target_box.center.x, target_box.center.y + target_box.size.y * 0.25F,
                               target_box.center.z};
        const engine::Vec3 delta{aim.x - eye.x, aim.y - eye.y, aim.z - eye.z};
        const float distance = std::sqrt(delta.x * delta.x + delta.y * delta.y + delta.z * delta.z);
        if (distance > soldier.sight_range || distance < 1e-3F)
            return false;
        const float flat = std::sqrt(delta.x * delta.x + delta.z * delta.z);
        const float facing = flat > 1e-3F ? (std::sin(soldier.yaw) * delta.x + std::cos(soldier.yaw) * delta.z) / flat
                                          : 1.0F;
        if (facing < soldier.fov_cos && distance > 2.5F)
            return false;
        engine::physics::QueryFilter filter;
        filter.ignore = self;
        const auto hit = engine::physics::raycast(w, eye, delta, distance, physics_config, filter);
        return !hit || hit->distance >= distance - 0.3F || (!hit->hit_ground && hit->entity == target);
    }
    // A unit horizontal direction along a nav path toward `goal` (zero when
    // there). Paths are refreshed twice a second or when the goal moves.
    engine::Vec3 soldier_steer(Soldier &soldier, const engine::Vec3 &from, const engine::Vec3 &goal, float dt) {
        const float gx = goal.x - soldier.path_goal.x, gz = goal.z - soldier.path_goal.z;
        soldier.repath -= dt;
        if (soldier.repath <= 0 || gx * gx + gz * gz > 1.0F) {
            soldier.repath = 0.5F;
            soldier.path_goal = goal;
            const auto found = nav_grid.find_path(from, goal);
            soldier.path = found ? *found : std::vector<engine::Vec3>{};
        }
        while (soldier.path.size() > 1) {
            const float wx = soldier.path.front().x - from.x, wz = soldier.path.front().z - from.z;
            if (wx * wx + wz * wz > 0.4F * 0.4F)
                break;
            soldier.path.erase(soldier.path.begin());
        }
        const engine::Vec3 aim = soldier.path.empty() ? goal : soldier.path.front();
        const float dx = aim.x - from.x, dz = aim.z - from.z;
        const float length = std::sqrt(dx * dx + dz * dz);
        const float remaining_x = goal.x - from.x, remaining_z = goal.z - from.z;
        if (length < 1e-3F || remaining_x * remaining_x + remaining_z * remaining_z < 0.35F * 0.35F)
            return {};
        return {dx / length, 0, dz / length};
    }
    // The nearest walkable spot within 9 m that something at `threat` can't
    // see (a solid collider blocks the line to chest height).
    std::optional<engine::Vec3> find_cover(engine::World &w, engine::Entity self, const engine::Vec3 &from,
                                           const engine::Vec3 &threat) {
        engine::physics::QueryFilter filter;
        filter.ignore = self;
        for (const float radius : {2.5F, 5.0F, 8.0F}) {
            std::optional<engine::Vec3> best;
            float best_distance = 0;
            for (int i = 0; i < 16; ++i) {
                const float angle = static_cast<float>(i) * 0.39269908F;
                const engine::Vec3 spot{from.x + std::cos(angle) * radius, from.y, from.z + std::sin(angle) * radius};
                if (!nav_grid.walkable(spot.x, spot.z))
                    continue;
                const engine::Vec3 chest{spot.x, from.y + 0.3F, spot.z};
                const engine::Vec3 delta{chest.x - threat.x, chest.y - threat.y, chest.z - threat.z};
                const float distance = std::sqrt(delta.x * delta.x + delta.y * delta.y + delta.z * delta.z);
                const auto hit = engine::physics::raycast(w, threat, delta, distance, physics_config, filter);
                if (!hit || hit->hit_ground || hit->distance >= distance - 0.4F)
                    continue;
                const float dx = spot.x - from.x, dz = spot.z - from.z;
                const float to_threat = (spot.x - threat.x) * (spot.x - threat.x) + (spot.z - threat.z) * (spot.z - threat.z);
                // Prefer close spots that don't walk toward the threat.
                const float score = std::sqrt(dx * dx + dz * dz) - 0.2F * std::sqrt(to_threat);
                if (!best || score < best_distance) {
                    best = spot;
                    best_distance = score;
                }
            }
            if (best)
                return best;
        }
        return std::nullopt;
    }
    void step_soldiers(engine::World &w) {
        constexpr float dt = 1.0F / 60.0F;
        const auto heard = std::move(noises);
        noises.clear();
        // Every living hostile candidate: Players (team 0) and soldiers.
        std::vector<engine::Entity> fighters;
        for (const auto entity : w.query<engine::Box, Health>())
            if (w.get<Health>(entity)->current > 0 && team_of(w, entity) >= 0)
                fighters.push_back(entity);
        for (const auto self : w.query<engine::Box, Soldier, Controller>()) {
            auto &soldier = *w.get<Soldier>(self);
            auto &controller = *w.get<Controller>(self);
            const auto &box = *w.get<engine::Box>(self);
            const auto *health = w.get<Health>(self);
            if (health && health->current <= 0)
                continue;
            if (!soldier.initialized) {
                soldier.initialized = true;
                soldier.home = box.center;
                soldier.rng = 0x2545F491U ^ static_cast<std::uint32_t>(index_of(self) * 7919 + 1);
                for (const auto &name : soldier.patrol_names)
                    if (const auto found = host.find(w, name))
                        soldier.patrol_points.push_back(w.get<engine::Box>(*found)->center);
            }
            // Perception: keep a visible target, else pick the nearest visible hostile.
            std::optional<engine::Entity> seen;
            if (soldier.target && w.alive(*soldier.target) && w.get<Health>(*soldier.target) &&
                w.get<Health>(*soldier.target)->current > 0 && soldier_sees(w, self, soldier, box, *soldier.target))
                seen = soldier.target;
            if (!seen) {
                float nearest = 0;
                for (const auto other : fighters) {
                    if (other == self || team_of(w, other) == soldier.team)
                        continue;
                    const auto &other_box = *w.get<engine::Box>(other);
                    const float dx = other_box.center.x - box.center.x, dz = other_box.center.z - box.center.z;
                    const float distance = dx * dx + dz * dz;
                    if ((!seen || distance < nearest) && soldier_sees(w, self, soldier, box, other)) {
                        seen = other;
                        nearest = distance;
                    }
                }
            }
            if (!seen && soldier.mode != SoldierMode::combat && soldier.mode != SoldierMode::cover)
                for (const auto &noise : heard) {
                    if (noise.team == soldier.team)
                        continue;
                    const float dx = noise.at.x - box.center.x, dz = noise.at.z - box.center.z;
                    if (dx * dx + dz * dz <= soldier.hearing * soldier.hearing * noise.radius_scale * noise.radius_scale) {
                        soldier.last_known = noise.at;
                        soldier.awareness = std::max(soldier.awareness, 0.6F);
                        soldier.mode = SoldierMode::investigate;
                    }
                }
            if (soldier.behavior == SoldierBehavior::hunt && !seen && soldier.mode == SoldierMode::patrol) {
                // A hunter always knows roughly where the nearest hostile is.
                for (const auto other : fighters)
                    if (team_of(w, other) != soldier.team && other != self) {
                        soldier.last_known = w.get<engine::Box>(other)->center;
                        soldier.mode = SoldierMode::investigate;
                        break;
                    }
            }

            engine::Vec3 move{};
            float pace = 0;
            std::optional<engine::Vec3> face;
            auto *arsenal = w.get<Arsenal>(self);
            const bool reloading = arsenal && arsenal->state.reload_left > 0;
            const float health_ratio = health && health->max > 0 ? health->current / health->max : 1.0F;
            soldier.melee_cooldown = std::max(0.0F, soldier.melee_cooldown - dt);
            if (seen) {
                soldier.target = seen;
                soldier.since_seen = 0;
                soldier.last_known = w.get<engine::Box>(*seen)->center;
                if (soldier.mode != SoldierMode::combat && soldier.mode != SoldierMode::cover &&
                    soldier.mode != SoldierMode::flee) {
                    soldier.mode = SoldierMode::combat;
                    soldier.reaction_left = soldier.reaction;
                    soldier.burst_left = soldier.burst;
                }
                soldier.awareness = 1;
            } else {
                soldier.since_seen += dt;
                soldier.awareness = std::max(0.0F, soldier.awareness - dt * 0.15F);
            }
            if (soldier.flee_health > 0 && health_ratio <= soldier.flee_health && soldier.since_seen < 5)
                soldier.mode = SoldierMode::flee;

            switch (soldier.mode) {
            case SoldierMode::patrol: {
                if (soldier.behavior == SoldierBehavior::patrol && !soldier.patrol_points.empty()) {
                    const auto &point = soldier.patrol_points[soldier.waypoint % soldier.patrol_points.size()];
                    if (soldier.wait > 0) {
                        soldier.wait -= dt;
                    } else {
                        move = soldier_steer(soldier, box.center, point, dt);
                        pace = 0.45F;
                        if (move.x == 0 && move.z == 0) {
                            soldier.waypoint++;
                            soldier.wait = 1.2F;
                        }
                    }
                } else {
                    const float dx = soldier.home.x - box.center.x, dz = soldier.home.z - box.center.z;
                    if (dx * dx + dz * dz > 1.5F * 1.5F) {
                        move = soldier_steer(soldier, box.center, soldier.home, dt);
                        pace = 0.45F;
                    } else {
                        // Guarding: slowly look left and right.
                        soldier.yaw += std::sin(time_now * 0.4F + static_cast<float>(index_of(self))) * 0.35F * dt;
                    }
                }
                break;
            }
            case SoldierMode::investigate: {
                move = soldier_steer(soldier, box.center, soldier.last_known, dt);
                pace = 1.0F;
                if (move.x == 0 && move.z == 0) {
                    soldier.mode = SoldierMode::search;
                    soldier.search_timer = 4.0F;
                }
                break;
            }
            case SoldierMode::search: {
                soldier.yaw += 1.4F * dt;
                soldier.search_timer -= dt;
                if (soldier.search_timer <= 0) {
                    soldier.mode = SoldierMode::patrol;
                    soldier.target.reset();
                }
                break;
            }
            case SoldierMode::flee: {
                const float dx = box.center.x - soldier.last_known.x, dz = box.center.z - soldier.last_known.z;
                const float length = std::sqrt(dx * dx + dz * dz);
                if (length > 1e-3F)
                    move = {dx / length, 0, dz / length};
                pace = 1.0F;
                if (soldier.since_seen > 5) {
                    soldier.mode = SoldierMode::search;
                    soldier.search_timer = 3.0F;
                }
                break;
            }
            case SoldierMode::cover: {
                if (!soldier.cover)
                    soldier.cover = find_cover(w, self, box.center,
                                               {soldier.last_known.x, soldier.last_known.y + 0.6F, soldier.last_known.z});
                if (!soldier.cover) {
                    soldier.mode = SoldierMode::combat;
                    break;
                }
                move = soldier_steer(soldier, box.center, *soldier.cover, dt);
                pace = 1.0F;
                if (move.x == 0 && move.z == 0) {
                    soldier.cover_timer -= dt;
                    if (soldier.cover_timer <= 0 && !reloading) {
                        soldier.mode = SoldierMode::combat; // peek back out
                        soldier.reaction_left = soldier.reaction * 0.5F;
                    }
                }
                if (seen)
                    face = soldier.last_known;
                break;
            }
            case SoldierMode::combat: {
                if (!seen) {
                    move = soldier_steer(soldier, box.center, soldier.last_known, dt);
                    pace = 0.9F;
                    if (soldier.since_seen > 1.5F) {
                        soldier.mode = SoldierMode::investigate;
                    }
                    break;
                }
                const auto &target_box = *w.get<engine::Box>(*seen);
                face = target_box.center;
                const float dx = target_box.center.x - box.center.x, dz = target_box.center.z - box.center.z;
                const float distance = std::sqrt(dx * dx + dz * dz);
                const float preferred = arsenal ? soldier.preferred_range : 1.2F;
                if (distance > preferred * 1.25F) {
                    move = soldier_steer(soldier, box.center, target_box.center, dt);
                    pace = 0.9F;
                } else if (distance < preferred * 0.6F && arsenal) {
                    move = {-dx / distance, 0, -dz / distance};
                    pace = 0.6F;
                } else if (arsenal) {
                    soldier.strafe_timer -= dt;
                    if (soldier.strafe_timer <= 0) {
                        soldier.strafe_timer = 0.8F + random01(soldier.rng) * 1.4F;
                        soldier.strafe_dir = random01(soldier.rng) < 0.5F ? -1.0F : 1.0F;
                    }
                    const engine::Vec3 side{-dz / distance * soldier.strafe_dir, 0, dx / distance * soldier.strafe_dir};
                    if (!nav_grid.walkable(box.center.x + side.x * 1.2F, box.center.z + side.z * 1.2F))
                        soldier.strafe_dir = -soldier.strafe_dir;
                    move = {-dz / distance * soldier.strafe_dir, 0, dx / distance * soldier.strafe_dir};
                    pace = 0.45F;
                }
                soldier.reaction_left -= dt;
                const float facing = (std::sin(soldier.yaw) * dx + std::cos(soldier.yaw) * dz) / std::max(distance, 1e-3F);
                if (arsenal && !arsenal->weapons.empty()) {
                    const auto slot = static_cast<std::size_t>(arsenal->state.current);
                    if (arsenal->state.magazine[slot] == 0 && !reloading) {
                        arsenal->script_reload = true;
                        if (soldier.use_cover) {
                            soldier.mode = SoldierMode::cover;
                            soldier.cover.reset();
                            soldier.cover_timer = 0.5F;
                        }
                    } else if (soldier.reaction_left <= 0 && facing > 0.97F && !reloading) {
                        if (soldier.burst_cooldown > 0) {
                            soldier.burst_cooldown -= dt;
                        } else if (arsenal->state.cooldown <= 0 && arsenal->state.equip_left <= 0) {
                            const engine::Vec3 eye{box.center.x, box.center.y + box.size.y * 0.4F, box.center.z};
                            const engine::Vec3 aim{target_box.center.x - eye.x,
                                                   target_box.center.y + target_box.size.y * 0.1F - eye.y,
                                                   target_box.center.z - eye.z};
                            const auto direction = engine::gameplay::spread_direction(
                                aim, (1.0F - std::clamp(soldier.accuracy, 0.0F, 1.0F)) * 7.0F, soldier.rng);
                            arsenal->script_fire = true;
                            arsenal->script_aim = direction;
                            if (--soldier.burst_left <= 0) {
                                soldier.burst_left = soldier.burst;
                                soldier.burst_cooldown = soldier.burst_pause * (0.7F + 0.6F * random01(soldier.rng));
                            }
                        }
                    }
                    if (soldier.use_cover && health_ratio < 0.5F && !soldier.cover && soldier.mode == SoldierMode::combat) {
                        soldier.mode = SoldierMode::cover;
                        soldier.cover_timer = 2.0F;
                    }
                } else if (distance < 1.7F && soldier.melee_cooldown <= 0 && soldier.reaction_left <= 0) {
                    apply_damage(w, *seen, soldier.melee_damage, self);
                    soldier.melee_cooldown = 1.0F;
                    script_runtime.request_animation(self, "attack");
                }
                break;
            }
            }
            if (soldier.mode != SoldierMode::cover && soldier.mode != SoldierMode::combat)
                soldier.cover.reset();

            // Turn toward the target, or along the way we're going.
            float want = soldier.yaw;
            if (face) {
                want = std::atan2(face->x - box.center.x, face->z - box.center.z);
            } else if (move.x != 0 || move.z != 0) {
                want = std::atan2(move.x, move.z);
            }
            const float diff = std::remainder(want - soldier.yaw, 6.2831853F);
            soldier.yaw += std::clamp(diff, -8.0F * dt, 8.0F * dt);
            soldier.yaw = std::remainder(soldier.yaw, 6.2831853F);

            engine::gameplay::ControllerInput intent;
            intent.move_x = move.x * pace;
            intent.move_y = -move.z * pace;
            intent.yaw = 0;
            const auto *body = w.get<engine::physics::RigidBody>(self);
            engine::gameplay::begin_step(w, self, controller.state, controller.settings, intent,
                                         physics_config.gravity * (body ? body->gravity_scale : 1.0F), dt);
        }
    }
    float time_now{0};
    // The scene clock in hours (0.73.0): Routines follow it; scripts set it
    // (world.set_clock), e.g. from a planet's day.
    float clock_hours{10};
    // Milliseconds each system took on the most recent tick, for the
    // editor's Stats overlay (editor_profile_text).
    std::map<std::string, double> profile;
    void add_timed(std::string name, engine::FixedPhase phase, engine::i32 order,
                   engine::FixedSystems::Function function) {
        systems.add(name, phase, order,
                    [this, name, function = std::move(function)](engine::World &w,
                                                                  const engine::FixedUpdateContext &context) {
                        const auto start = std::chrono::steady_clock::now();
                        function(w, context);
                        profile[name] = std::chrono::duration<double, std::milli>(
                                            std::chrono::steady_clock::now() - start)
                                            .count();
                    });
    }
    static engine::InputMap default_input_map() {
        std::string error;
        return *editor_bindings::parse(editor_bindings::default_text, error);
    }
    Runtime() {
        register_components(world);
        register_components(templates);
        script_runtime.set_host(&host);
        script_runtime.set_nav(&nav_grid);
        script_runtime.set_input(&input, &actions);
        script_runtime.set_physics_config(&physics_config);
        add_timed("editor.actions", engine::FixedPhase::begin, 1,
                    [this](engine::World &, const engine::FixedUpdateContext &context) {
                        actions.update(context.input);
                    });
        // First, before anything moves: rebakes the navigation grid on the
        // first tick and then once a second. Movers (Player, AI) are never
        // obstacles to themselves.
        add_timed("editor.nav", engine::FixedPhase::begin, 0,
                    [this](engine::World &w, const engine::FixedUpdateContext &context) {
                        if (context.tick % 60 != 0)
                            return;
                        std::vector<engine::Entity> movers;
                        for (const auto entity : w.query<PlayerMarker>())
                            movers.push_back(entity);
                        for (const auto entity : w.query<AIAgent>())
                            movers.push_back(entity);
                        for (const auto entity : w.query<Soldier>())
                            movers.push_back(entity);
                        for (const auto entity : w.query<Routine>())
                            movers.push_back(entity);
                        for (const auto entity : w.query<Wildlife>())
                            movers.push_back(entity);
                        nav_grid.bake(w, movers, terrain ? &*terrain : nullptr);
                    });
        // Recorded once per entity, the first time its script fails to compile
        // or errors at runtime (engine::script::Runtime's own "reported once,
        // not retried every tick" contract) — editor_script_error() reads this
        // back so the editor can show a script author what went wrong, instead
        // of a silently-inert entity with no visible cause.
        script_runtime.set_error_handler(
            [this](engine::Entity entity, const std::string &message) { script_errors[entity] = message; });
        // Order 1: an AIAgent drives its own velocity the same way editor.move
        // drives the Player's, and must also land before physics (order 10)
        // integrates it. Ordered just after editor.move (0), not before it or
        // at the same order, purely to keep a fixed, unambiguous run order
        // between two systems that never actually touch the same entity (an
        // AIAgent and a PlayerMarker are different entities by authoring
        // convention) rather than because one depends on the other's output.
        // Only five of AIStateName's seven values are ever actually produced
        // here: Idle/Walking/Running (wander) and Fleeing/Chasing (reacting to
        // the Player). Driving is reserved for a possible future AI-controlled
        // Vehicle, which this round doesn't implement. editor_add doesn't stop
        // an entity from authoring AIState alongside Player+Vehicle (nothing
        // here validates authoring combinations, the same as everywhere else
        // in this file) — that entity would get both a Heading and an
        // AIAgent, and this system simply overwrites editor.move's velocity
        // with its own every tick, since it runs at order 1 to editor.move's
        // order 0. Not a crash, just not a useful combination to author. Dead
        // is unreachable in practice: editor.combat already destroys a Health
        // entity outright the tick it hits 0 (see damage()), so there's never
        // a tick where an AIAgent survives with 0 health for this system to
        // observe and label.
        add_timed(
            "editor.ai", engine::FixedPhase::update, 1,
            [&nav = nav_grid](engine::World &w, const engine::FixedUpdateContext &) {
                constexpr float dt = 1.0F / 60.0F;
                // Every AIAgent reacts to the same single point — the first
                // Player found — matching the "one Player" authoring
                // convention editor_add's own doc comment already assumes
                // for is_player.
                std::optional<engine::Vec3> player_pos;
                for (const auto player : w.query<engine::Box, PlayerMarker>()) {
                    player_pos = w.get<engine::Box>(player)->center;
                    break;
                }
                for (const auto entity : w.query<engine::physics::RigidBody, AIAgent>()) {
                    auto &agent = *w.get<AIAgent>(entity);
                    auto &body = *w.get<engine::physics::RigidBody>(entity);
                    const auto &box = *w.get<engine::Box>(entity);
                    const auto *health = w.get<Health>(entity);
                    const auto *pedestrian = w.get<Pedestrian>(entity);
                    const bool is_pedestrian = pedestrian != nullptr;

                    float dist_sq = -1.0F;
                    if (player_pos) {
                        const float dx = player_pos->x - box.center.x;
                        const float dz = player_pos->z - box.center.z;
                        dist_sq = dx * dx + dz * dz;
                    }
                    const bool player_near = player_pos && dist_sq <= ai_sense_radius * ai_sense_radius;
                    const bool low_health =
                        health && health->max > 0 && health->current / health->max <= ai_flee_health_ratio;

                    float target_x = 0.0F, target_z = 0.0F;
                    AIState next_state = AIState::Idle;
                    if (low_health && player_near) {
                        // Flee even if Pedestrian — self-preservation isn't hostility.
                        next_state = AIState::Fleeing;
                        const float dx = box.center.x - player_pos->x;
                        const float dz = box.center.z - player_pos->z;
                        const float len = std::sqrt(dx * dx + dz * dz);
                        if (len > 0.001F) {
                            target_x = dx / len;
                            target_z = dz / len;
                        }
                    } else if (!is_pedestrian && player_near) {
                        next_state = AIState::Chasing;
                        // Follow an A* path around obstacles, refreshed every
                        // ai_repath_interval; with no path (unreachable, or
                        // nothing in the way) head straight for the Player.
                        agent.repath -= dt;
                        if (agent.repath <= 0.0F || agent.state != AIState::Chasing) {
                            agent.repath = ai_repath_interval;
                            const auto found = nav.find_path(box.center, *player_pos);
                            agent.path = found ? *found : std::vector<engine::Vec3>{};
                        }
                        while (!agent.path.empty()) {
                            const float wx = agent.path.front().x - box.center.x;
                            const float wz = agent.path.front().z - box.center.z;
                            if (wx * wx + wz * wz > 0.35F * 0.35F || agent.path.size() == 1)
                                break;
                            agent.path.erase(agent.path.begin());
                        }
                        const engine::Vec3 aim = agent.path.empty() ? *player_pos : agent.path.front();
                        const float dx = aim.x - box.center.x;
                        const float dz = aim.z - box.center.z;
                        const float len = std::sqrt(dx * dx + dz * dz);
                        if (len > 0.001F) {
                            target_x = dx / len;
                            target_z = dz / len;
                        }
                    } else {
                        // Wander: alternate a resting (Idle) phase with a moving
                        // (Walking or Running) phase in a freshly rolled random
                        // direction, each phase lasting a random duration.
                        // Returning here from Chasing/Fleeing (the Player left
                        // range, or health recovered) always re-rolls
                        // immediately instead of resuming whatever phase was
                        // frozen mid-flight: neither reactive branch above ever
                        // touches agent.timer, so without this an old countdown
                        // would sit there stale, and target_x/target_z would
                        // stay 0 below (Chasing/Fleeing isn't Walking/Running),
                        // leaving the agent standing still while still
                        // reporting the last reactive state — for up to the
                        // remainder of that frozen timer, then another full
                        // Idle phase on top, before it actually resumed wander.
                        // Only a Pedestrian's own wander pace is personalized -- a
                        // hostile AIAgent (no Pedestrian at all) always gets
                        // pedestrian_tuning[0] (Casual), the same wander feel every
                        // AIAgent used before archetypes existed, since its wander
                        // phases aren't a "personality" a non-civilian entity has.
                        const auto &wander =
                            pedestrian_tuning[is_pedestrian
                                                   ? static_cast<std::size_t>(pedestrian->archetype)
                                                   : 0];
                        const bool was_reactive =
                            agent.state == AIState::Chasing || agent.state == AIState::Fleeing;
                        if (was_reactive)
                            agent.timer = 0.0F;
                        agent.timer -= dt;
                        if (agent.timer <= 0.0F) {
                            const bool was_idle = was_reactive || agent.state == AIState::Idle;
                            if (was_idle) {
                                agent.dir_x = random_unit(agent.rng);
                                agent.dir_z = random_unit(agent.rng);
                                const float len =
                                    std::sqrt(agent.dir_x * agent.dir_x + agent.dir_z * agent.dir_z);
                                if (len > 0.001F) {
                                    agent.dir_x /= len;
                                    agent.dir_z /= len;
                                } else {
                                    agent.dir_x = 0.0F;
                                    agent.dir_z = 1.0F;
                                }
                                next_state = next_random(agent.rng) % 3 == 0 ? AIState::Running
                                                                              : AIState::Walking;
                            } else {
                                next_state = AIState::Idle;
                            }
                            agent.timer = wander.min_phase + (random_unit(agent.rng) + 1.0F) * 0.5F *
                                                                  (wander.max_phase - wander.min_phase);
                        } else {
                            next_state = agent.state; // hold the current phase until the timer elapses
                        }
                        if (next_state == AIState::Walking || next_state == AIState::Running) {
                            target_x = agent.dir_x;
                            target_z = agent.dir_z;
                        }
                        const float speed = (next_state == AIState::Walking     ? ai_walk_speed
                                              : next_state == AIState::Idle     ? 0.0F
                                                                                 : ai_run_speed) *
                                             wander.speed_mult;
                        body.velocity.x = target_x * speed;
                        body.velocity.z = target_z * speed;
                        agent.state = next_state;
                        continue;
                    }
                    // Chasing or Fleeing (the only two states reachable here,
                    // the wander branch above always continue's instead):
                    // always full urgency, unscaled by any Pedestrian
                    // archetype (see pedestrian_tuning's own doc comment on
                    // Fleeing specifically; Chasing never applies to a
                    // Pedestrian at all, see the branch above).
                    body.velocity.x = target_x * ai_run_speed;
                    body.velocity.z = target_z * ai_run_speed;
                    agent.state = next_state;
                }
            });
        // Order 2: a Script entity drives its own velocity the same way an
        // AIAgent or the Player does, and likewise must land before physics
        // (order 10) integrates it. Ordered after editor.ai (1), not before
        // or at the same order, for the same reason editor.ai sits after
        // editor.move (0): a fixed, unambiguous run order between systems
        // that don't touch the same entity by authoring convention, not a
        // real dependency. An entity authored with both AIState and Script
        // gets both an AIAgent and a Script instance; whichever ran last (here,
        // this one) simply overwrites the other's velocity write that tick —
        // not a crash, just not a combination there's a reason to author.
        // AI drivers (0.70.0): every arcade car with a Driver, before physics.
        add_timed("editor.drivers", engine::FixedPhase::update, 4,
                  [this](engine::World &w, const engine::FixedUpdateContext &) {
                      // One collider scan shared by every driver's probes:
                      // a per-ray scan was most of this system's time.
                      std::optional<engine::physics::RaycastTargets> targets;
                      for (const auto entity : w.query<Heading, Driver, engine::physics::RigidBody>()) {
                          auto &heading = *w.get<Heading>(entity);
                          if (!heading.arcade || w.get<PlayerMarker>(entity))
                              continue;
                          if (!targets)
                              targets = engine::physics::raycast_targets(w);
                          const auto control = drive_ai(w, entity, heading, *w.get<Driver>(entity), *targets);
                          drive_car(w, entity, heading, *w.get<engine::physics::RigidBody>(entity), control);
                      }
                  });
        // Spaceflight (0.71.0): the ship before physics, the pilot after.
        add_timed("editor.space", engine::FixedPhase::update, 5,
                  [this](engine::World &w, const engine::FixedUpdateContext &context) {
                      if (space)
                          space_tick(w, context.input);
                  });
        add_timed("editor.space_after", engine::FixedPhase::update, 14,
                  [this](engine::World &w, const engine::FixedUpdateContext &) {
                      if (space)
                          space_after(w);
                  });
        // Daily routines and wildlife (0.73.0), after the AI's own wander
        // (which they override) and before physics.
        add_timed("editor.routines", engine::FixedPhase::update, 6,
                  [this](engine::World &w, const engine::FixedUpdateContext &) { step_routines(w); });
        add_timed("editor.wildlife", engine::FixedPhase::update, 7,
                  [this](engine::World &w, const engine::FixedUpdateContext &) { step_wildlife(w); });
        // After the Player's input (0), scripts (2) and the other brains,
        // before physics (10) integrates the lunges and knockback it sets.
        add_timed("editor.melee", engine::FixedPhase::update, 8,
                  [this](engine::World &w, const engine::FixedUpdateContext &) { step_melee(w); });
        add_timed("editor.soldiers", engine::FixedPhase::update, 3,
                  [this](engine::World &w, const engine::FixedUpdateContext &) {
                      time_now += 1.0F / 60.0F;
                      step_soldiers(w);
                  });
        add_timed("editor.script", engine::FixedPhase::update, 2,
                    [this](engine::World &w, const engine::FixedUpdateContext &) {
                        script_runtime.step(w, 1.0F / 60.0F);
                    });
        // Order 0: apply this tick's input to the player's velocity before
        // order 10 integrates it — matches the native playground's own
        // move-then-physics ordering.
        add_timed(
            "editor.move", engine::FixedPhase::update, 0,
            [this](engine::World &w, const engine::FixedUpdateContext &context) {
                for (const auto entity : w.query<engine::physics::RigidBody, PlayerMarker>()) {
                    if (stowed(entity))
                        continue;
                    auto &body = *w.get<engine::physics::RigidBody>(entity);
                    auto *heading = w.get<Heading>(entity);
                    auto *controller = w.get<Controller>(entity);
                    if (controller) {
                        const auto value = [this](const char *name) {
                            return actions.state(engine::ActionId{name}).value;
                        };
                        engine::gameplay::ControllerInput intent;
                        intent.move_x = value("move_x");
                        intent.move_y = value("move_y");
                        intent.jump_pressed = actions.state(engine::ActionId{"jump"}).pressed;
                        intent.sprint = actions.state(engine::ActionId{"sprint"}).down();
                        intent.crouch = actions.state(engine::ActionId{"crouch"}).down();
                        if (const auto *fighter = w.get<Fighter>(entity)) {
                            // A fighter mid-move, hurt or down doesn't walk (its
                            // move or the hit moves it); blocking shuffles.
                            using engine::gameplay::FighterMode;
                            const auto mode = fighter->state.mode;
                            if (mode == FighterMode::block) {
                                intent.move_x *= 0.35F;
                                intent.move_y *= 0.35F;
                                intent.sprint = false;
                                intent.jump_pressed = false;
                            } else if (mode != FighterMode::idle) {
                                intent.move_x = intent.move_y = 0;
                                intent.sprint = false;
                                intent.jump_pressed = false;
                            }
                        }
                        if (const auto *arsenal = w.get<Arsenal>(entity)) {
                            // Aiming down sights slows you and, like firing, stops a sprint.
                            if (arsenal->aiming) {
                                intent.move_x *= 0.55F;
                                intent.move_y *= 0.55F;
                            }
                            if (arsenal->aiming || actions.state(engine::ActionId{"fire"}).down())
                                intent.sprint = false;
                        }
                        intent.yaw = controller->first_person ? look_yaw
                                                             : std::atan2(-camera_forward_x, -camera_forward_z);
                        engine::gameplay::begin_step(w, entity, controller->state, controller->settings, intent,
                                                     physics_config.gravity * body.gravity_scale, 1.0F / 60.0F);
                    } else if (heading && heading->arcade) {
                        drive_car(w, entity, *heading, body, player_car_input());
                    } else if (heading) {
                        // Vehicle model: W/S accelerate/reverse along the vehicle's own
                        // heading (momentum, not instant velocity), A/D steer that heading
                        // — "driving," not strafing. Self-relative by construction, so
                        // there's no camera-orientation ambiguity to get "flipped" here.
                        float accel_input = 0, steer_input = 0;
                        if (context.input.key_down(engine::Key::w))
                            accel_input += 1;
                        if (context.input.key_down(engine::Key::s))
                            accel_input -= 1;
                        if (context.input.key_down(engine::Key::d))
                            steer_input += 1;
                        if (context.input.key_down(engine::Key::a))
                            steer_input -= 1;
                        const auto &tuning =
                            vehicle_tuning[static_cast<std::size_t>(heading->archetype)];
                        heading->yaw += steer_input * tuning.turn_rate / 60.0F;
                        heading->speed += accel_input * tuning.accel / 60.0F;
                        if (accel_input == 0) {
                            if (heading->speed > 0)
                                heading->speed = std::max(0.0F, heading->speed - tuning.drag / 60.0F);
                            else
                                heading->speed = std::min(0.0F, heading->speed + tuning.drag / 60.0F);
                        }
                        heading->speed =
                            std::clamp(heading->speed, -tuning.max_reverse, tuning.max_forward);
                        body.velocity.x = std::sin(heading->yaw) * heading->speed;
                        body.velocity.z = std::cos(heading->yaw) * heading->speed;
                        // Rotate the collision footprint with the vehicle: its rendered
                        // mesh already turns to face heading->yaw (main.ts, field 4), but
                        // physics::step only ever resolves axis-aligned Box.size — left
                        // fixed to the authored (world-axis) dimensions, a non-square
                        // vehicle's true footprint at 90 degrees would visually be as wide
                        // as it is long while still colliding as if it weren't turned at
                        // all. Recomputed every tick as the local footprint's own
                        // axis-aligned bounding box at the current yaw (the standard
                        // rotated-rectangle-AABB formula), so it's narrowest facing its
                        // own long axis and widest at 45/135 degrees, same as the visible
                        // mesh actually sweeps.
                        auto &box = *w.get<engine::Box>(entity);
                        const float cos_yaw = std::cos(heading->yaw), sin_yaw = std::sin(heading->yaw);
                        box.size.x =
                            2.0F * (std::abs(heading->half_x * cos_yaw) + std::abs(heading->half_z * sin_yaw));
                        box.size.z =
                            2.0F * (std::abs(heading->half_x * sin_yaw) + std::abs(heading->half_z * cos_yaw));
                    } else {
                        // On-foot model: camera-relative strafing — W always moves toward
                        // wherever the camera is currently facing (see camera_forward_x/z's
                        // own doc comment), not a fixed world axis, so the felt direction of
                        // every key stays correct regardless of how the camera's been orbited.
                        float right = 0, forward = 0;
                        // Crouching/sitting (C, key_for() code 7) ignores WASD entirely
                        // instead of merely playing a different clip over live movement --
                        // sliding along the ground while visibly sitting would look wrong,
                        // and freezing the input here is the simplest way to guarantee it,
                        // rather than trying to keep a "sit" animation visually in sync with
                        // a still-moving Box.
                        if (!context.input.key_down(engine::Key::c)) {
                            if (context.input.key_down(engine::Key::a))
                                right -= 1;
                            if (context.input.key_down(engine::Key::d))
                                right += 1;
                            if (context.input.key_down(engine::Key::w))
                                forward += 1;
                            if (context.input.key_down(engine::Key::s))
                                forward -= 1;
                        }
                        const float fx = camera_forward_x, fz = camera_forward_z;
                        const float right_x = -fz, right_z = fx; // cross(forward, up), up = +y
                        body.velocity.x = (right_x * right + fx * forward) * move_speed;
                        body.velocity.z = (right_z * right + fz * forward) * move_speed;
                    }
                    // Press jump while grounded to launch; keep holding it
                    // while airborne to fly (a steady climb, not a single
                    // decaying arc) — same as the native playground. A
                    // CharacterController jumps through its own actions.
                    if (controller) {
                    } else if (context.input.key_pressed(engine::Key::left_shift) && body.grounded)
                        body.velocity.y = jump_speed;
                    else if (context.input.key_down(engine::Key::left_shift) && !body.grounded)
                        body.velocity.y = fly_speed;
                    // Ranged attack: fire a blast at the nearest Health entity (the
                    // editor has no single hardcoded "enemy" the way the native
                    // playground does, so the target is picked fresh each press).
                    // No-op with nothing to aim at, same as the native playground's
                    // own enemy.has_value() guard.
                    if (pending_blast) {
                        pending_blast = false; // consumed by this tick, not every tick this frame
                        // Plays a firing/ranged-attack clip on every G press, whether or not
                        // anything was actually in range to hit -- same reasoning as
                        // editor.combat's own request_animation call below: the animation is
                        // tied to the action, not its outcome, matching a real game where a
                        // whiffed attack still plays its swing/fire animation.
                        script_runtime.request_animation(entity, "blast");
                        const auto &box = *w.get<engine::Box>(entity);
                        std::optional<engine::Entity> nearest;
                        float nearest_distance_sq = 0;
                        for (const auto candidate : w.query<engine::Box, Health>()) {
                            if (candidate == entity)
                                continue;
                            const auto &target_box = *w.get<engine::Box>(candidate);
                            const float dx = target_box.center.x - box.center.x;
                            const float dy = target_box.center.y - box.center.y;
                            const float dz = target_box.center.z - box.center.z;
                            const float distance_sq = dx * dx + dy * dy + dz * dz;
                            if (!nearest.has_value() || distance_sq < nearest_distance_sq) {
                                nearest = candidate;
                                nearest_distance_sq = distance_sq;
                            }
                        }
                        if (nearest.has_value()) {
                            const auto &target_box = *w.get<engine::Box>(*nearest);
                            engine::Vec3 direction{target_box.center.x - box.center.x,
                                                    target_box.center.y - box.center.y,
                                                    target_box.center.z - box.center.z};
                            const float length = std::sqrt(
                                direction.x * direction.x + direction.y * direction.y +
                                direction.z * direction.z);
                            if (length > 0.001F) { // already overlapping: nothing to aim at
                                direction = {direction.x / length, direction.y / length,
                                             direction.z / length};
                                const auto projectile = w.defer_create();
                                w.defer_set(projectile,
                                            engine::Box{box.center, engine::Vec3{0.3F, 0.3F, 0.3F}});
                                Projectile blast{engine::Vec3{direction.x * blast_speed,
                                                              direction.y * blast_speed,
                                                              direction.z * blast_speed},
                                                 entity};
                                blast.damage = blast_damage;
                                w.defer_set(projectile, blast);
                            }
                        }
                    }
                }
            });
        add_timed("editor.physics", engine::FixedPhase::update, 10,
                    [this](engine::World &w, const engine::FixedUpdateContext &) {
                        engine::physics::step(w, 1.0F / 60.0F, physics_config, &physics_events);
                    });
        // Right after physics: controllers climb steps and stick to the
        // ground (engine::gameplay::end_step).
        add_timed("editor.controller", engine::FixedPhase::update, 11,
                  [this](engine::World &w, const engine::FixedUpdateContext &) {
                      for (const auto entity : w.query<engine::physics::RigidBody, Controller>()) {
                          if (stowed(entity))
                              continue;
                          auto &controller = *w.get<Controller>(entity);
                          engine::gameplay::end_step(w, entity, controller.state, controller.settings,
                                                     physics_config, 1.0F / 60.0F);
                      }
                  });
        // After movement, physics and the controller, so shots leave from
        // where the shooter actually is this tick.
        add_timed("editor.weapons", engine::FixedPhase::update, 13,
                  [this](engine::World &w, const engine::FixedUpdateContext &context) {
                      constexpr float dt = 1.0F / 60.0F;
                      for (const auto entity : w.query<engine::Box, Arsenal>()) {
                          auto &arsenal = *w.get<Arsenal>(entity);
                          if (arsenal.weapons.empty())
                              continue;
                          const auto &box = *w.get<engine::Box>(entity);
                          const auto *controller = w.get<Controller>(entity);
                          const bool player = w.get<PlayerMarker>(entity) != nullptr;
                          engine::Vec3 origin = box.center;
                          origin.y = controller ? box.center.y - box.size.y / 2 + engine::gameplay::eye_offset(box)
                                                : box.center.y + box.size.y * 0.35F;
                          engine::Vec3 direction{0, 0, -1};
                          engine::gameplay::TriggerInput trigger;
                          bool aim = false;
                          if (player) {
                              const auto &fire = actions.state(engine::ActionId{"fire"});
                              trigger.fire_down = fire.down();
                              trigger.fire_pressed = fire.pressed;
                              trigger.reload = actions.state(engine::ActionId{"reload"}).pressed;
                              aim = actions.state(engine::ActionId{"aim"}).down();
                              if (actions.state(engine::ActionId{"next_weapon"}).pressed)
                                  trigger.cycle = 1;
                              const auto &scroll = actions.state(engine::ActionId{"weapon_scroll"});
                              if (scroll.pressed)
                                  trigger.cycle = scroll.value > 0 ? -1 : 1;
                              for (int n = 0; n < 9; ++n)
                                  if (context.input.key_pressed(
                                          static_cast<engine::Key>(static_cast<int>(engine::Key::digit1) + n)))
                                      trigger.select = n;
                              const float cos_pitch = std::cos(look_pitch);
                              direction = {-std::sin(look_yaw) * cos_pitch, std::sin(look_pitch),
                                           -std::cos(look_yaw) * cos_pitch};
                          }
                          if (arsenal.script_fire)
                              trigger.fire_down = trigger.fire_pressed = true;
                          if (arsenal.script_reload)
                              trigger.reload = true;
                          if (arsenal.script_select >= 0)
                              trigger.select = arsenal.script_select;
                          if (arsenal.script_aim) {
                              const auto a = *arsenal.script_aim;
                              const float length = std::sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
                              if (length > 1e-6F)
                                  direction = {a.x / length, a.y / length, a.z / length};
                          }
                          arsenal.script_fire = arsenal.script_reload = false;
                          arsenal.script_select = -1;
                          arsenal.script_aim.reset();
                          arsenal.aiming =
                              aim && arsenal.state.reload_left <= 0 && arsenal.state.equip_left <= 0;
                          const float bloom = arsenal.state.bloom;
                          const auto tick = engine::gameplay::update_weapon(arsenal.state, arsenal.weapons, trigger, dt);
                          const int shooter = index_of(entity);
                          const int slot = arsenal.state.current;
                          const auto &weapon = arsenal.weapons[static_cast<std::size_t>(slot)];
                          if (tick.switched)
                              push_event({WeaponEventKind::switched, shooter, -1, origin, {}, weapon.equip_time, slot});
                          if (tick.reload_started)
                              push_event({WeaponEventKind::reload, shooter, -1, origin, {}, weapon.reload_time, slot});
                          if (tick.reload_finished)
                              push_event({WeaponEventKind::reloaded, shooter, -1, origin, {}, 0, slot});
                          if (tick.empty)
                              push_event({WeaponEventKind::empty, shooter, -1, origin, {}, 0, slot});
                          if (tick.fired) {
                              float speed_ratio = 0;
                              bool airborne = false;
                              if (controller) {
                                  speed_ratio = controller->state.speed / controller->settings.walk_speed;
                                  airborne = !controller->state.grounded;
                              }
                              fire_weapon(w, entity, arsenal, origin, direction,
                                          engine::gameplay::current_spread(weapon, arsenal.aiming, speed_ratio,
                                                                           airborne, bloom));
                          }
                      }
                  });
        // Right after physics, so scripts hear about this tick's contacts
        // (on_collision_*/on_trigger_*) before anything else reacts.
        add_timed("editor.script_contacts", engine::FixedPhase::update, 12,
                    [this](engine::World &w, const engine::FixedUpdateContext &) {
                        script_runtime.dispatch_contacts(w, physics_events);
                    });
        // Order 15: after physics moves everything (10) but before combat (20)
        // resolves melee for this same tick — matches the native playground's
        // own ordering.
        add_timed(
            "editor.projectiles", engine::FixedPhase::update, 15,
            [this](engine::World &w, const engine::FixedUpdateContext &) {
                constexpr float dt = 1.0F / 60.0F;
                for (const auto entity : w.query<engine::Box, Projectile>()) {
                    auto &box = *w.get<engine::Box>(entity);
                    auto &projectile = *w.get<Projectile>(entity);
                    projectile.velocity.y += physics_config.gravity * projectile.gravity * dt;
                    const engine::Vec3 step{projectile.velocity.x * dt, projectile.velocity.y * dt,
                                            projectile.velocity.z * dt};
                    const float length = std::sqrt(step.x * step.x + step.y * step.y + step.z * step.z);
                    // Stops at solid geometry (and the ground) along this tick's path.
                    engine::physics::QueryFilter filter;
                    filter.ignore = projectile.owner;
                    const auto wall = length > 0 ? engine::physics::raycast(w, box.center, step, length,
                                                                            physics_config, filter)
                                                 : std::nullopt;
                    if (wall)
                        box.center = wall->point;
                    else
                        box.center = {box.center.x + step.x, box.center.y + step.y, box.center.z + step.z};
                    projectile.lifetime -= dt;
                    std::optional<engine::Entity> target;
                    if (wall && !wall->hit_ground && w.get<Health>(wall->entity))
                        target = wall->entity;
                    for (const auto candidate : w.query<engine::Box, Health>()) {
                        if (target || candidate == projectile.owner)
                            continue;
                        if (engine::physics::overlaps(box, *w.get<engine::Box>(candidate)))
                            target = candidate;
                    }
                    if (!target && !wall && projectile.lifetime > 0)
                        continue;
                    if (projectile.splash > 0 && (target || wall))
                        explode(w, projectile.owner, box.center, projectile.splash, projectile.damage);
                    else if (target)
                        apply_damage(w, *target, projectile.damage, projectile.owner);
                    else if (wall)
                        push_event({WeaponEventKind::impact, index_of(projectile.owner),
                                    wall->hit_ground ? -1 : index_of(wall->entity), wall->point, wall->normal, 0, 0});
                    w.defer_destroy(entity);
                }
            });
        // Melee: press "attack" (F) while a Player's Box overlaps a Health
        // entity's Box — the same overlap test the native playground's combat
        // and goal checks use. Order 20 matches the native playground's own
        // combat system order.
        add_timed(
            "editor.combat", engine::FixedPhase::update, 20,
            [this](engine::World &w, const engine::FixedUpdateContext &) {
                if (!pending_attack)
                    return;
                pending_attack = false; // consumed by this tick, not every tick this frame
                for (const auto entity : w.query<engine::Box, PlayerMarker>()) {
                    // A Melee fighter kicks with F instead (editor.melee).
                    if (w.get<Fighter>(entity))
                        continue;
                    // Plays a punch/attack clip on every F press, whether or not it
                    // actually connects with a Health entity below -- the animation is
                    // tied to the action (a real game plays a swing animation on a miss
                    // too), not gated on damage() actually landing. See
                    // engine::script::Runtime::request_animation's own doc comment: this
                    // reaches main.ts's pollAnimationRequests the same way a script's own
                    // self.animate would, just triggered natively instead of from Lua.
                    script_runtime.request_animation(entity, "attack");
                    const auto &box = *w.get<engine::Box>(entity);
                    for (const auto target : w.query<engine::Box, Health>()) {
                        if (target == entity)
                            continue;
                        if (engine::physics::overlaps(box, *w.get<engine::Box>(target)))
                            apply_damage(w, target, attack_damage, entity);
                    }
                }
            });
        // A hostile (Chasing) AIAgent hits back once it's actually caught the
        // Player, instead of Player->enemy combat above being the only
        // direction damage ever flows -- without this, a Chasing AIAgent
        // catching the Player is harmless contact, no different from bumping
        // into a wall. Gated to Chasing specifically (never Fleeing, and
        // never reachable at all for a Pedestrian -- see "editor.ai"'s own
        // state-machine above) so a fleeing or merely wandering agent never
        // attacks. A no-op if the Player has no Health (damage()'s own
        // contract) or Health isn't authored on the Player at all (the query
        // below simply finds nothing) -- attacking back is opt-in the same
        // way taking damage already is for every other entity. Ordered after
        // editor.combat (20), not before or at the same order -- but that
        // alone does NOT stop an agent editor.combat already killed this
        // same tick from also landing a hit here: FixedSystems::run only
        // flushes World::defer_destroy's queued removals once per whole
        // phase (see its own definition, fixed_systems.cpp), not between
        // same-phase systems, so a defeated agent stays fully queryable,
        // Health and all, until every FixedPhase::update system (including
        // this one) has already run. The explicit health->current > 0 check
        // below is what actually makes a simultaneous kill favor the
        // Player, not the order number.
        add_timed(
            "editor.ai_attack", engine::FixedPhase::update, 21,
            [this](engine::World &w, const engine::FixedUpdateContext &) {
                constexpr float dt = 1.0F / 60.0F;
                for (const auto entity : w.query<engine::Box, AIAgent>()) {
                    auto &agent = *w.get<AIAgent>(entity);
                    if (agent.attack_cooldown > 0.0F)
                        agent.attack_cooldown -= dt;
                    if (agent.state != AIState::Chasing || agent.attack_cooldown > 0.0F)
                        continue;
                    const auto *own_health = w.get<Health>(entity);
                    if (own_health && own_health->current <= 0.0F)
                        continue; // already defeated this tick, just not flushed yet
                    const auto &box = *w.get<engine::Box>(entity);
                    for (const auto target : w.query<engine::Box, PlayerMarker, Health>()) {
                        if (engine::physics::overlaps(box, *w.get<engine::Box>(target))) {
                            apply_damage(w, target, ai_attack_damage, entity);
                            agent.attack_cooldown = ai_attack_interval;
                            // Unlike the Player's own F/G (which animate on every press,
                            // hit or miss), an AIAgent's only "action" here is landing a
                            // hit at all -- it has no separate swing/miss beat to animate,
                            // so this is the one point that stands in for both.
                            script_runtime.request_animation(entity, "attack");
                            break;
                        }
                    }
                }
            });
    }
};
inline void register_components(engine::World &w) {
    w.register_component<engine::Box>("editor.box");
    w.register_component<engine::physics::RigidBody>("editor.rigid_body");
    w.register_component<engine::physics::Collider>("editor.collider");
    w.register_component<PlayerMarker>("editor.player");
    w.register_component<Health>("editor.health");
    w.register_component<Projectile>("editor.projectile");
    w.register_component<Heading>("editor.heading");
    w.register_component<Driver>("editor.driver");
    w.register_component<Spaceship>("editor.spaceship");
    w.register_component<Routine>("editor.routine");
    w.register_component<Wildlife>("editor.wildlife");
    w.register_component<AIAgent>("editor.ai_agent");
    w.register_component<Pedestrian>("editor.pedestrian");
    w.register_component<engine::script::Script>("editor.script");
    w.register_component<EntityName>("editor.name");
    w.register_component<SpawnedFrom>("editor.spawned_from");
    w.register_component<Controller>("editor.controller");
    w.register_component<Arsenal>("editor.arsenal");
    w.register_component<Soldier>("editor.soldier");
    w.register_component<Fighter>("editor.fighter");
}

template <typename T> void copy_component(const engine::World &from, engine::Entity source, engine::World &to,
                                          engine::Entity target) {
    if (const auto *value = from.get<T>(source))
        to.defer_set(target, *value);
}

inline std::optional<engine::Entity> BridgeHost::find(const engine::World &world, const std::string &name) {
    for (const auto entity : runtime_.entities)
        if (const auto *n = world.get<EntityName>(entity); n && n->value == name)
            return entity;
    return std::nullopt;
}

inline std::string BridgeHost::name_of(const engine::World &world, engine::Entity entity) {
    const auto *n = world.get<EntityName>(entity);
    return n ? n->value : std::string{};
}

inline std::optional<engine::Entity> BridgeHost::spawn(engine::World &world, const std::string &prefab,
                                                engine::Vec3 position, engine::Vec3 velocity) {
    const auto found = runtime_.template_by_name.find(prefab);
    if (found == runtime_.template_by_name.end() || runtime_.entities.size() >= 1024)
        return std::nullopt;
    const auto &from = runtime_.templates;
    const auto source = found->second;
    const auto entity = world.defer_create();
    auto box = *from.get<engine::Box>(source);
    box.center = position;
    world.defer_set(entity, box);
    if (const auto *body = from.get<engine::physics::RigidBody>(source)) {
        auto copy = *body;
        copy.velocity = velocity;
        world.defer_set(entity, copy);
    }
    copy_component<engine::physics::Collider>(from, source, world, entity);
    copy_component<PlayerMarker>(from, source, world, entity);
    copy_component<Health>(from, source, world, entity);
    copy_component<Heading>(from, source, world, entity);
    copy_component<AIAgent>(from, source, world, entity);
    copy_component<Pedestrian>(from, source, world, entity);
    copy_component<Routine>(from, source, world, entity);
    copy_component<Wildlife>(from, source, world, entity);
    copy_component<engine::script::Script>(from, source, world, entity);
    copy_component<Controller>(from, source, world, entity);
    copy_component<Arsenal>(from, source, world, entity);
    copy_component<Soldier>(from, source, world, entity);
    copy_component<Fighter>(from, source, world, entity);
    copy_component<Driver>(from, source, world, entity);
    world.defer_set(entity, EntityName{prefab});
    world.defer_set(entity, SpawnedFrom{prefab});
    runtime_.entities.push_back(entity);
    return entity;
}

inline bool BridgeHost::space(engine::World &world, const std::string &op, const std::vector<double> &args,
                       const std::string &text, std::vector<double> &out, std::string &text_out) {
    // space.call("camera"): the camera's horizontal facing {x, z} (the
    // last editor_set_camera_forward), with or without a SpaceSystem, so a
    // script can keep what it spawns out of view (camera.forward()).
    if (op == "camera") {
        out = {runtime_.camera_forward_x, runtime_.camera_forward_z};
        return true;
    }
    // The scene clock (world.set_clock) works with or without a SpaceSystem.
    // space.call("settle"): everyone with a Routine stands at the stop the
    // clock says, now (0.75.0: a loaded save doesn't watch the town walk
    // back from their homes).
    if (op == "settle") {
        for (const auto entity : world.query<engine::Box, Routine>()) {
            auto &routine = *world.get<Routine>(entity);
            if (routine.stops.empty())
                continue;
            int stop = static_cast<int>(routine.stops.size()) - 1;
            for (std::size_t i = 0; i < routine.stops.size(); ++i)
                if (routine.stops[i].hour <= runtime_.clock_hours)
                    stop = static_cast<int>(i);
            routine.current = stop;
            const auto &goal = routine.stops[static_cast<std::size_t>(stop)];
            auto &box = *world.get<engine::Box>(entity);
            box.center.x = goal.x;
            box.center.z = goal.z;
            if (auto *body = world.get<engine::physics::RigidBody>(entity))
                body->velocity = {};
            if (runtime_.space)
                if (const auto pinned = runtime_.space->pinned.find(entity); pinned != runtime_.space->pinned.end()) {
                    pinned->second.x = goal.x;
                    pinned->second.z = goal.z;
                }
        }
        return true;
    }
    if (op == "clock") {
        if (!args.empty() && std::isfinite(args[0]))
            runtime_.clock_hours = static_cast<float>(std::fmod(std::fmod(args[0], 24.0) + 24.0, 24.0));
        out = {runtime_.clock_hours};
        return true;
    }
    if (op == "wildlife") {
        // Fleeing or wary animals near a point: out = {state of the entity named `text`}.
        const auto entity = find(world, text);
        const auto *animal = entity ? world.get<Wildlife>(*entity) : nullptr;
        out = {animal ? static_cast<double>(animal->state) : -1.0};
        return animal != nullptr;
    }
    if (!runtime_.space)
        return false;
    auto &sp = *runtime_.space;
    // space.call("time", "", seconds): the system clock (0.75.0, a loaded
    // save puts the planets back where they were).
    if (op == "time") {
        if (!args.empty() && std::isfinite(args[0]) && args[0] >= 0)
            sp.time = args[0];
        out = {sp.time};
        return true;
    }
    const auto arg = [&](std::size_t i) { return i < args.size() && std::isfinite(args[i]) ? args[i] : 0.0; };
    const auto body_index = [&](const std::string &name) {
        for (std::size_t i = 0; i < sp.system.bodies.size(); ++i)
            if (sp.system.bodies[i].name == name)
                return static_cast<int>(i);
        return -1;
    };
    const auto finite = [](double v) { return std::isfinite(v) ? v : 1e12; };
    if (op == "state") {
        const auto orbit = space::orbit_elements(sp.ship, sp.system);
        const auto local = sp.to_local(sp.ship_absolute());
        out = {finite(sp.ship.altitude), space::length(sp.ship.velocity), sp.ship.vertical_speed, sp.ship.ground_speed,
               sp.ship.throttle, sp.ship.fuel, sp.spec.fuel, sp.ship.hull, sp.spec.hull, sp.ship.heat,
               sp.ship.landed ? 1.0 : 0.0, sp.piloting ? 1.0 : 0.0, sp.ship.density, sp.warp,
               orbit.valid ? finite(orbit.periapsis) : 0.0, orbit.valid ? finite(orbit.apoapsis) : 0.0, sp.time,
               sp.ship.destroyed ? 1.0 : 0.0, local.x, local.y, local.z, orbit.valid && orbit.closed ? 1.0 : 0.0,
               sp.ship.g_force, space::length(local)};
        // Where the ship is over its reference body, in degrees.
        const auto dir = space::normalized(sp.ship.ref >= 0 ? sp.fixed(sp.ship.position, sp.ship.ref) : sp.ship.position);
        out.push_back(std::asin(std::clamp(dir.y, -1.0, 1.0)) * 180 / 3.14159265358979);
        out.push_back(std::atan2(dir.z, dir.x) * 180 / 3.14159265358979);
        text_out = (sp.ship.ref >= 0 ? sp.system.bodies[static_cast<std::size_t>(sp.ship.ref)].name : std::string{"star"}) +
                   ";" + assist_name(sp.assist) + ";" +
                   (sp.target >= 0 ? sp.system.bodies[static_cast<std::size_t>(sp.target)].name : std::string{}) + ";" +
                   sp.system.bodies[static_cast<std::size_t>(sp.site_body)].name;
        out.push_back(sp.away ? 1.0 : 0.0);
        // 0.73.0: components, autopilot, reserve, wind.
        out.insert(out.end(), {sp.ship.engine, sp.ship.rcs_condition, sp.ship.gear, sp.ship.scanner,
                               sp.assist == space::Assist::autopilot ? 1.0 : 0.0, sp.reserve_used ? 1.0 : 0.0,
                               static_cast<double>(sp.active_site)});
        text_out += ";" + (sp.active_site >= 0 ? sp.sites[static_cast<std::size_t>(sp.active_site)].name : std::string{}) +
                    ";" + sp.autopilot_phase;
        return true;
    }
    if (op == "bodies") {
        // Every body not hidden, one per line: name, parent name.
        for (const auto &b : sp.system.bodies)
            if (!b.hidden)
                text_out += b.name + "\n";
        return true;
    }
    if (op == "reveal") {
        const int index = body_index(text);
        if (index < 0)
            return false;
        sp.system.bodies[static_cast<std::size_t>(index)].hidden = false;
        sp.event("revealed:" + text);
        return true;
    }
    if (op == "plan") {
        const int index = body_index(text);
        if (index < 0)
            return false;
        const auto plan = space::plan_route(sp.ship, sp.spec, sp.system, sp.time, index);
        out = {plan.distance, plan.closing_speed, plan.delta_v, plan.fuel_needed, static_cast<double>(plan.status)};
        return true;
    }
    if (op == "autopilot") {
        if (arg(0) != 0) {
            if (sp.target < 0 || sp.ship.landed)
                return false;
            sp.assist = space::Assist::autopilot;
        } else if (sp.assist == space::Assist::autopilot) {
            sp.assist = space::Assist::stabilized;
        }
        return true;
    }
    if (op == "reserve") {
        // The emergency reserve: once, below 35% fuel, 8.5% of the tank.
        if (sp.reserve_used || sp.ship.fuel > sp.spec.fuel * 0.35)
            return false;
        sp.reserve_used = true;
        sp.ship.fuel = std::min(sp.spec.fuel, sp.ship.fuel + sp.spec.fuel * 0.085);
        return true;
    }
    if (op == "part") {
        // part(name, delta): + repairs, - damages; returns the new condition.
        double *part = text == "engine" ? &sp.ship.engine : text == "rcs" ? &sp.ship.rcs_condition
                     : text == "gear" ? &sp.ship.gear : text == "scanner" ? &sp.ship.scanner : nullptr;
        if (!part)
            return false;
        *part = std::clamp(*part + arg(0), 0.0, 100.0);
        out = {*part};
        return true;
    }
    if (op == "wind") {
        sp.wind_local = {arg(0), arg(1), arg(2)};
        return true;
    }
    if (op == "board_key") {
        sp.board_key = arg(0) != 0;
        return true;
    }
    if (op == "events") {
        for (const auto &e : sp.events)
            text_out += e + "\n";
        sp.events.clear();
        return true;
    }
    if (op == "warp") {
        sp.warp = std::clamp(arg(0), 1.0, 1000.0);
        return true;
    }
    if (op == "assist") {
        const auto assist = parse_assist(text);
        if (!assist)
            return false;
        sp.assist = *assist;
        return true;
    }
    if (op == "target") {
        sp.target = text.empty() ? -1 : body_index(text);
        if (sp.target < 0 && sp.assist == space::Assist::target)
            sp.assist = space::Assist::stabilized;
        return text.empty() || sp.target >= 0;
    }
    if (op == "refuel") {
        sp.ship.fuel = arg(0) < 0 ? sp.spec.fuel : std::min(sp.spec.fuel, sp.ship.fuel + arg(0));
        return true;
    }
    if (op == "tune") {
        // Ship upgrades: the named spec field takes the value.
        const double v = arg(0);
        if (!(v > 0))
            return false;
        if (text == "thrust") sp.spec.thrust = v;
        else if (text == "lift") sp.spec.lift_thrust = v;
        else if (text == "fuel") { sp.spec.fuel = v; sp.ship.fuel = std::min(sp.ship.fuel, v); }
        else if (text == "hull") { sp.ship.hull *= v / sp.spec.hull; sp.spec.hull = v; }
        else if (text == "heat") sp.spec.heat_tolerance = v;
        else if (text == "rcs") sp.spec.rcs = v;
        else if (text == "land_vertical") sp.spec.land_vertical = v;
        else if (text == "land_slope") sp.spec.land_slope = v;
        else return false;
        return true;
    }
    if (op == "spec") {
        out = {sp.spec.thrust, sp.spec.lift_thrust, sp.spec.fuel, sp.spec.hull, sp.spec.heat_tolerance, sp.spec.rcs};
        return true;
    }
    if (op == "set_fuel") {
        sp.ship.fuel = std::clamp(arg(0), 0.0, sp.spec.fuel);
        return true;
    }
    // space.call("hull", "", value): sets the hull exactly (0.75.0, a
    // loaded save restores it).
    if (op == "hull") {
        sp.ship.hull = std::clamp(arg(0), 1.0, sp.spec.hull);
        sp.ship.destroyed = false;
        return true;
    }
    if (op == "repair") {
        sp.ship.hull = arg(0) < 0 ? sp.spec.hull : std::min(sp.spec.hull, sp.ship.hull + arg(0));
        if (sp.ship.hull > 0)
            sp.ship.destroyed = false;
        return true;
    }
    if (op == "board")
        return runtime_.space_board(world);
    if (op == "exit")
        return runtime_.space_exit(world);
    if (op == "controls") {
        sp.controls = arg(0) != 0;
        return true;
    }
    if (op == "place_landed" || op == "place_orbit") {
        const int index = body_index(text);
        if (index < 0)
            return false;
        if (op == "place_orbit") {
            space::place_in_orbit(sp.ship, sp.system, index, std::max(0.0, arg(0)));
        } else {
            const double lat = arg(0) * 3.14159265358979 / 180, lon = arg(1) * 3.14159265358979 / 180;
            const space::DVec3 dir{std::cos(lat) * std::cos(lon), std::sin(lat), std::cos(lat) * std::sin(lon)};
            // Heading measured from the body's north (+y) around the local vertical.
            const space::DVec3 helper = std::abs(dir.y) < 0.99 ? space::DVec3{0, 1, 0} : space::DVec3{1, 0, 0};
            const auto north = space::normalized(helper - dir * space::dot(helper, dir));
            const auto east = space::cross(north, dir);
            const double heading = arg(2) * 3.14159265358979 / 180;
            space::place_landed(sp.ship, sp.spec, sp.system, index, dir,
                                north * std::cos(heading) + east * std::sin(heading), sp.time);
            runtime_.settle_landed(world);
            runtime_.reframe_after_landing(world);
        }
        sp.ship.destroyed = false;
        sp.warp = 1;
        sp.throttle = 0;
        return true;
    }
    if (op == "body") {
        const int index = body_index(text);
        if (index < 0)
            return false;
        const auto &b = sp.system.bodies[static_cast<std::size_t>(index)];
        const double distance = space::length(space::body_position(sp.system, index, sp.time) - sp.ship_absolute());
        const auto rel = space::body_velocity(sp.system, index, sp.time) -
                         ((sp.ship.ref >= 0 ? space::body_velocity(sp.system, sp.ship.ref, sp.time) : space::DVec3{}) +
                          sp.ship.velocity);
        const auto towards = space::normalized(space::body_position(sp.system, index, sp.time) - sp.ship_absolute());
        out = {b.radius, b.surface_gravity, b.atmosphere_height, distance, distance - b.radius,
               -space::dot(rel, towards), b.hidden ? 1.0 : 0.0, b.sea_level};
        return true;
    }
    return false;
}
inline bool BridgeHost::vehicle(engine::World &world, engine::Entity entity, const std::string &op,
                         const std::vector<double> &args, const std::string &text, std::optional<engine::Entity> other,
                         std::vector<double> &out) {
    auto *heading = world.get<Heading>(entity);
    if (!heading || !heading->arcade)
        return false;
    auto &car = heading->car;
    const auto arg = [&](std::size_t i) { return i < args.size() && std::isfinite(args[i]) ? static_cast<float>(args[i]) : 0.0F; };
    if (op == "state") {
        out = {std::hypot(car.velocity.x, car.velocity.z), car.forward_speed, static_cast<double>(car.gear), car.rpm,
               car.nitro, car.drifting ? 1.0 : 0.0, car.boosting ? 1.0 : 0.0, car.yaw, car.slip};
        return true;
    }
    if (op == "set_nitro") {
        car.nitro = std::clamp(arg(0), 0.0F, 1.0F);
        return true;
    }
    if (op == "reset") {
        auto &box = *world.get<engine::Box>(entity);
        box.center = {arg(0), arg(1), arg(2)};
        const float nitro = car.nitro;
        car = {};
        car.nitro = nitro;
        car.yaw = heading->yaw = arg(3);
        heading->speed = 0;
        if (auto *body = world.get<engine::physics::RigidBody>(entity))
            body->velocity = {};
        if (auto *driver = world.get<Driver>(entity)) {
            driver->next = route_start(driver->route, box.center, car.yaw);
            driver->stuck = driver->reversing = 0;
        }
        return true;
    }
    if (op == "freeze") {
        heading->frozen = arg(0) != 0;
        return true;
    }
    auto *driver = world.get<Driver>(entity);
    if (!driver) {
        world.set(entity, Driver{});
        driver = world.get<Driver>(entity);
    }
    if (op == "route") {
        driver->route = parse_route(text);
        driver->loop = arg(0) != 0;
        driver->next = route_start(driver->route, world.get<engine::Box>(entity)->center, car.yaw);
        return true;
    }
    if (op == "target") {
        driver->target = other;
        driver->target_name.clear();
        return true;
    }
    if (op == "mode") {
        driver->mode = text == "race" ? DriveMode::Race
                       : text == "pursuit" ? DriveMode::Pursuit
                       : text == "traffic" ? DriveMode::Traffic
                                           : DriveMode::Off;
        return true;
    }
    if (op == "speed_scale") {
        driver->speed_scale = std::max(0.05F, arg(0));
        return true;
    }
    return false;
}

inline bool BridgeHost::weapon(engine::World &world, engine::Entity self, const std::string &op,
                        const std::vector<double> &args, std::vector<double> &out) {
    auto *arsenal = world.get<Arsenal>(self);
    if (!arsenal || arsenal->weapons.empty())
        return false;
    auto &state = arsenal->state;
    const int count = static_cast<int>(arsenal->weapons.size());
    if (op == "fire") {
        arsenal->script_fire = true;
        if (args.size() == 3 && std::isfinite(args[0]) && std::isfinite(args[1]) && std::isfinite(args[2]))
            arsenal->script_aim = engine::Vec3{static_cast<float>(args[0]), static_cast<float>(args[1]),
                                               static_cast<float>(args[2])};
    } else if (op == "reload") {
        arsenal->script_reload = true;
    } else if (op == "select") {
        if (!args.empty() && args[0] >= 0 && args[0] < count)
            arsenal->script_select = static_cast<int>(args[0]);
    } else if (op == "ammo") {
        const auto slot = static_cast<std::size_t>(state.current);
        out = {static_cast<double>(state.magazine[slot]), static_cast<double>(state.reserve[slot]),
               static_cast<double>(slot), state.reload_left > 0 ? 1.0 : 0.0};
    } else if (op == "give_ammo") {
        if (args.size() == 2 && std::isfinite(args[0]) && std::isfinite(args[1]))
            engine::gameplay::give_ammo(state, args[1] < 0 ? state.current : static_cast<int>(args[1]),
                                        static_cast<int>(std::clamp(args[0], 0.0, 100000.0)));
    } else {
        return false;
    }
    return true;
}

inline bool BridgeHost::health(const engine::World &world, engine::Entity entity, float &current, float &max) {
    const auto *h = world.get<Health>(entity);
    if (!h)
        return false;
    current = h->current;
    max = h->max;
    return true;
}

inline void BridgeHost::heal(engine::World &world, engine::Entity entity, float amount) {
    auto *health = world.get<Health>(entity);
    if (health && health->current > 0 && std::isfinite(amount) && amount > 0)
        health->current = std::min(health->max, health->current + amount);
}

inline void BridgeHost::damage(engine::World &world, engine::Entity entity, float amount) {
    if (std::isfinite(amount) && amount > 0)
        runtime_.apply_damage(world, entity, amount, std::nullopt);
}

inline void BridgeHost::emit(engine::Entity source, const std::string &kind, const std::string &a, const std::string &b) {
    if (runtime_.commands.size() >= 256)
        return; // a runaway script can't flood the editor
    int index = -1;
    for (std::size_t i = 0; i < runtime_.entities.size(); ++i)
        if (runtime_.entities[i] == source)
            index = static_cast<int>(i);
    runtime_.commands.push_back({kind, index, a, b});
}

inline std::unique_ptr<Runtime> active = std::make_unique<Runtime>();
inline std::unique_ptr<Runtime> staging;
inline bool failed{};
// Snapshot taken by editor_take_dirty_saves() and read by
// editor_dirty_save_key/editor_dirty_save_value until the next take call
// replaces it. A snapshot, not a live view, because
// engine::script::Runtime::take_dirty_saves() itself drains the pending set
// it reads from -- calling it more than once per frame would silently lose
// whichever keys the first call already took, so JS must call the count
// function exactly once per poll and then index into what it returned.
inline std::vector<std::pair<std::string, std::string>> pending_dirty_saves;
// The entity a post-editor_add setter refers to: index >= 0 is a scene
// entity, -1 is the prefab template editor_add just created.
inline std::optional<std::pair<engine::World *, engine::Entity>> staged(int index) {
    if (!staging)
        return std::nullopt;
    if (index == -1)
        return staging->last_template ? std::optional{std::pair{&staging->templates, *staging->last_template}}
                                      : std::nullopt;
    if (index < 0 || static_cast<std::size_t>(index) >= staging->entities.size())
        return std::nullopt;
    return std::pair{&staging->world, staging->entities[static_cast<std::size_t>(index)]};
}
// Builds the site frame, heightfield and ship state at commit (bridge_space.cpp).
bool finish_space(Runtime &rt);
} // namespace editor_bridge
using namespace editor_bridge;
