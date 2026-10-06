// The editor runtime (bridge.cpp): the C++ simulation the browser editor
// drives through these exports. Lifecycle, entities, input, ticks and
// readouts live here; combat in bridge_combat.cpp, space and daily life
// in bridge_space.cpp (0.77.0 split).
#include "bridge_runtime.hpp"

extern "C" {
EXPORT void editor_begin() {
    staging = std::make_unique<Runtime>();
    failed = false;
}
// sx/sy/sz are the entity's authored world-space box dimensions (its Scale), so ground
// and future collider resolution rests the box's actual visible bounds, not a hardcoded
// unit cube. is_child is nonzero when the entity has a Parent: `x`/`y`/`z` are then a
// parent-relative local position, not a world-space one, and the physics module has no
// notion of hierarchy — so a child entity gets no RigidBody and is left untouched by
// physics::step (which only acts on Box+RigidBody pairs), passing its authored local
// transform straight back through editor_value unchanged instead of being simulated
// against the world ground plane it doesn't actually sit on. is_player is nonzero for
// the (at most, by authoring convention — not enforced here) one entity WASD/jump input
// drives; meaningless without a RigidBody, so it's simply ignored for a child. is_collider is
// nonzero when the entity carries an authored Collider component: it becomes a static
// engine::physics::Collider obstacle (its Box, i.e. authored Scale, is the AABB other bodies
// resolve out of) that a falling/moving RigidBody — including the player — is pushed out of.
// Like is_player, meaningless for a child: a child's Box is parent-relative, not world-space,
// so using it as a world obstacle would resolve other bodies against a box that isn't actually
// where it renders; it's simply ignored for a child, same reasoning as excluding it from
// RigidBody entirely. hp_max > 0 means the entity carries an authored Health component (with
// hp_current clamped into [0, hp_max]); hp_max <= 0 is the "no Health" sentinel, since a real
// Health always has a positive max. Like is_collider, ignored for a child — melee/blast target
// it via a world-space overlap test, which a parent-relative Box can't correctly support.
// is_vehicle is nonzero when the entity carries an authored Vehicle component; meaningless
// without is_player (nothing else feeds it input), so it's simply ignored without that too.
// When both apply, the entity gets a Heading{yaw: 0, speed: 0} instead of moving under the
// default camera-relative strafe model, always starting out facing world +z, since editor_add
// has no Rotation input to seed a better initial heading from — a placed-and-rotated vehicle
// visually snaps to face +z the instant Play starts, a known, documented simplification.
// is_ai is nonzero when the entity carries an authored AIState component: it gets an AIAgent
// instead of ever reading InputState, wandering on its own, chasing the Player when one comes
// within ai_sense_radius, or fleeing it below ai_flee_health_ratio — the same way is_vehicle's
// Heading substitutes a different movement model for the Player's own. Ignored for a child, same
// reasoning as is_player. is_pedestrian is nonzero when the entity also carries an authored
// Pedestrian component; meaningless without is_ai (nothing else reads it), so it's simply
// ignored without that too — see Pedestrian's own doc comment for what it changes. collider_shape
// (0 = Box, nonzero = Sphere) and collider_radius select the authored Collider.type/radius —
// previously accepted by the editor's inspector but silently ignored here, so a "Sphere" collider
// resolved (and rendered a selection box for) an AABB derived from Scale exactly like an "AABB"
// one; meaningless without is_collider, so both are simply ignored without that too.
// collider_radius is validated whenever is_collider is set regardless of shape, not just for
// Sphere, since validating it unconditionally is simpler than threading the shape check through
// the validation pass too and costs nothing when shape is Box (which never reads it).
// vehicle_archetype (an index into vehicle_tuning, VehicleArchetype's declared order) is
// validated whenever is_vehicle is set, same conditional pattern as collider_radius/is_collider
// -- meaningless, and left unvalidated, without it. pedestrian_archetype (an index into
// pedestrian_tuning, PedestrianArchetype's declared order) is likewise validated only when
// is_pedestrian is set. Both are real array indices once stored (see Heading::archetype/
// Pedestrian::archetype and their own doc comments), not just an opaque number like
// Vehicle.archetype/Pedestrian.archetype were before this — out-of-range here would be a
// same-tick out-of-bounds read the first time editor.move or editor.ai runs, not a delayed or
// cosmetic failure, so this validates strictly (a safe non-negative integer inside the table's
// bounds) rather than clamping a bad value into range silently.
EXPORT int editor_add(double x, double y, double z, double vx, double vy, double vz, double sx,
                       double sy, double sz, double is_child, double is_player, double is_collider,
                       double hp_current, double hp_max, double is_vehicle, double is_ai,
                       double is_pedestrian, double collider_shape, double collider_radius,
                       double vehicle_archetype, double pedestrian_archetype) {
    if (!staging || (!staging->adding_template && staging->entities.size() >= 1024)) {
        failed = true;
        return 0;
    }
    for (double v : {x, y, z, vx, vy, vz, hp_current, hp_max})
        if (!std::isfinite(v) || std::abs(v) > 1000000) {
            failed = true;
            return 0;
        }
    for (double v : {sx, sy, sz})
        if (!std::isfinite(v) || v <= 0 || v > 1000000) {
            failed = true;
            return 0;
        }
    if (is_collider != 0 &&
        (!std::isfinite(collider_radius) || collider_radius <= 0 || collider_radius > 1000000)) {
        failed = true;
        return 0;
    }
    if (is_vehicle != 0 && !(vehicle_archetype >= 0 &&
                              vehicle_archetype < static_cast<double>(std::size(vehicle_tuning)) &&
                              vehicle_archetype == std::floor(vehicle_archetype))) {
        failed = true;
        return 0;
    }
    if (is_pedestrian != 0 &&
        !(pedestrian_archetype >= 0 &&
          pedestrian_archetype < static_cast<double>(std::size(pedestrian_tuning)) &&
          pedestrian_archetype == std::floor(pedestrian_archetype))) {
        failed = true;
        return 0;
    }
    auto &target = staging->adding_template ? staging->templates : staging->world;
    const auto e = target.create();
    target.set(
        e, engine::Box{engine::Vec3{static_cast<float>(x), static_cast<float>(y), static_cast<float>(z)},
                       engine::Vec3{static_cast<float>(sx), static_cast<float>(sy), static_cast<float>(sz)}});
    if (is_child == 0) {
        target.set(e, engine::physics::RigidBody{engine::Vec3{
                                  static_cast<float>(vx), static_cast<float>(vy), static_cast<float>(vz)}});
        if (is_player != 0) {
            target.set(e, PlayerMarker{});
            if (is_vehicle != 0)
                target.set(
                    e, Heading{0.0F, 0.0F, static_cast<float>(sx) / 2.0F, static_cast<float>(sz) / 2.0F,
                               static_cast<VehicleArchetype>(static_cast<int>(vehicle_archetype))});
        }
        if (is_collider != 0)
            target.set(
                e, engine::physics::Collider{
                       true,
                       collider_shape != 0 ? engine::physics::ColliderShape::Sphere
                                           : engine::physics::ColliderShape::Box,
                       static_cast<float>(collider_radius)});
        if (hp_max > 0)
            target.set(
                e, Health{std::clamp(static_cast<float>(hp_current), 0.0F, static_cast<float>(hp_max)),
                          static_cast<float>(hp_max)});
        if (is_ai != 0) {
            // Seeded from this entity's authoring order (never 0, xorshift32's
            // one fixed point) rather than wall-clock time, so two entities
            // never share a seed and the whole wander pattern is exactly
            // reproducible run to run — required for editor_bridge_tests.cpp
            // to assert on it at all.
            target.set(
                e, AIAgent{AIState::Idle, 0.0F, 0.0F, 1.0F,
                           static_cast<std::uint32_t>(staging->entities.size()) + 1, 0.0F, {}, 0.0F});
            if (is_pedestrian != 0)
                target.set(
                    e, Pedestrian{static_cast<PedestrianArchetype>(static_cast<int>(pedestrian_archetype))});
        }
    }
    if (staging->adding_template) {
        staging->template_by_name[*staging->adding_template] = e;
        staging->last_template = e;
        staging->adding_template.reset();
    } else {
        staging->entities.push_back(e);
    }
    return 1;
}
// Sets (or replaces) an entity's Lua script source between editor_begin() and
// editor_commit() — editor_add's own all-double signature has no way to carry
// a string, so a scripted entity's source is set through this companion call
// instead, keyed by the same index editor_add returns entities in (see its
// own doc comment). index must refer to an entity already added this staging
// session; out of range, or called outside editor_begin()/editor_commit(), is
// a silent no-op, the same defensive posture as editor_value's own
// out-of-range handling. Setting an entity's Script gives it a RigidBody
// (added unconditionally for every non-child entity, see editor_add's is_child
// handling) but nothing else — a scripted entity is otherwise ordinary
// authored data, not implicitly a Player or an AIAgent.
// Physics-body settings editor_add's fixed ABI has no room for, set after
// it for the same index. `authored` is whether the entity carries an
// authored RigidBody component at all: without one the body keeps mass 0
// (the engine's original "immovable to finite-mass bodies" contract, see
// physics::RigidBody). A non-dynamic authored body becomes kinematic.
// Ignored for an entity editor_add gave no RigidBody (a child).
EXPORT void editor_set_body(int index, int authored, double mass, int dynamic) {
    const auto target = staged(index);
    if (!target)
        return;
    auto *body = target->first->get<engine::physics::RigidBody>(target->second);
    if (!body || !authored)
        return;
    if (!std::isfinite(mass) || mass <= 0 || mass > 1000000) {
        failed = true;
        return;
    }
    body->mass = static_cast<float>(mass);
    body->type = dynamic ? engine::physics::BodyType::Dynamic : engine::physics::BodyType::Kinematic;
}
// Collider settings beyond editor_add's shape/radius: trigger, layer (0..31),
// mask (32-bit layer bitmask), bounciness (0..1). Ignored when the entity
// has no Collider.
EXPORT void editor_set_collider(int index, int is_trigger, double layer, double mask, double bounciness) {
    const auto target = staged(index);
    if (!target)
        return;
    auto *collider = target->first->get<engine::physics::Collider>(target->second);
    if (!collider)
        return;
    if (!(layer >= 0 && layer <= 31 && layer == std::floor(layer)) ||
        !(mask >= 0 && mask <= 4294967295.0 && mask == std::floor(mask)) ||
        !(bounciness >= 0 && bounciness <= 1)) {
        failed = true;
        return;
    }
    collider->is_trigger = is_trigger != 0;
    collider->layer = static_cast<std::uint8_t>(layer);
    collider->mask = static_cast<std::uint32_t>(mask);
    collider->bounciness = static_cast<float>(bounciness);
}
// The entity's authored Rotation (Euler XYZ radians), after editor_add for
// the same index. Only a Box-shaped Collider reads it: the collider becomes
// an oriented box (see physics::Collider::rotation).
EXPORT void editor_set_rotation(int index, double x, double y, double z) {
    const auto target = staged(index);
    if (!target)
        return;
    auto *collider = target->first->get<engine::physics::Collider>(target->second);
    if (!collider)
        return;
    for (const double v : {x, y, z})
        if (!std::isfinite(v) || std::abs(v) > 1000) {
            failed = true;
            return;
        }
    collider->rotation = {static_cast<float>(x), static_cast<float>(y), static_cast<float>(z)};
}
// Makes the entity a CharacterController (0.60.0), after editor_add for the
// same index. mode 0 = first person, 1 = third person. Resizes its Box to the
// controller's footprint and standing height, keeping its feet in place.
// Ignored for an entity without a RigidBody (a child).
EXPORT void editor_set_controller(int index, int mode, double walk, double sprint, double crouch, double jump,
                                  double stand, double crouched, double step, double accel, double air) {
    const auto target = staged(index);
    if (!target)
        return;
    auto &world = *target->first;
    auto *box = world.get<engine::Box>(target->second);
    if (!box || !world.get<engine::physics::RigidBody>(target->second))
        return;
    for (const double v : {walk, sprint, crouch, jump, stand, crouched, accel, air})
        if (!std::isfinite(v) || v <= 0 || v > 1000) {
            failed = true;
            return;
        }
    if (!std::isfinite(step) || step < 0 || step > 10 || crouched > stand) {
        failed = true;
        return;
    }
    Controller controller;
    controller.first_person = mode == 0;
    auto &settings = controller.settings;
    settings.walk_speed = static_cast<float>(walk);
    settings.sprint_speed = static_cast<float>(sprint);
    settings.crouch_speed = static_cast<float>(crouch);
    settings.jump_height = static_cast<float>(jump);
    settings.stand_height = static_cast<float>(stand);
    settings.crouch_height = static_cast<float>(crouched);
    settings.step_height = static_cast<float>(step);
    settings.ground_accel = static_cast<float>(accel);
    settings.ground_decel = static_cast<float>(accel) * 0.8F;
    settings.air_accel = static_cast<float>(air);
    engine::gameplay::configure_body(*box, settings);
    world.set(target->second, controller);
}
namespace {
// Standard base64 (RFC 4648) to bytes; returns false on malformed input.
bool decode_base64(const char *text, std::vector<unsigned char> &out) {
    out.clear();
    unsigned value = 0;
    int bits = 0;
    for (const char *c = text; *c; ++c) {
        int digit;
        if (*c >= 'A' && *c <= 'Z')
            digit = *c - 'A';
        else if (*c >= 'a' && *c <= 'z')
            digit = *c - 'a' + 26;
        else if (*c >= '0' && *c <= '9')
            digit = *c - '0' + 52;
        else if (*c == '+')
            digit = 62;
        else if (*c == '/')
            digit = 63;
        else if (*c == '=')
            break;
        else
            return false;
        value = (value << 6) | static_cast<unsigned>(digit);
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            out.push_back(static_cast<unsigned char>((value >> bits) & 0xFF));
        }
    }
    return true;
}
} // namespace
// The scene's terrain (0.63.0), between editor_begin() and editor_commit():
// a resolution x resolution heightfield over a `size` square centered on
// (x, z), heights relative to y, as base64 little-endian float32 (row-major,
// x fastest). Replaces any earlier terrain. Bad input fails the commit.
EXPORT void editor_set_terrain(double x, double y, double z, double size, int resolution, const char *heights) {
    if (!staging || !heights)
        return;
    std::vector<unsigned char> bytes;
    const auto count = static_cast<std::size_t>(resolution) * static_cast<std::size_t>(std::max(resolution, 0));
    if (resolution < 2 || resolution > 1025 || !std::isfinite(size) || size <= 0 || size > 100000 ||
        !std::isfinite(x) || !std::isfinite(y) || !std::isfinite(z) || !decode_base64(heights, bytes) ||
        bytes.size() != count * 4) {
        failed = true;
        return;
    }
    engine::physics::Heightfield field;
    field.center = {static_cast<float>(x), static_cast<float>(y), static_cast<float>(z)};
    field.size = static_cast<float>(size);
    field.resolution = resolution;
    field.heights.resize(count);
    std::memcpy(field.heights.data(), bytes.data(), bytes.size());
    for (const float h : field.heights)
        if (!std::isfinite(h) || std::abs(h) > 100000) {
            failed = true;
            return;
        }
    staging->terrain = std::move(field);
    staging->physics_config.terrain = &*staging->terrain;
}
// A static box obstacle (e.g. a scattered tree trunk) that isn't one of the
// editor's entities: it blocks movement, bullets, sight and paths.
EXPORT void editor_add_obstacle(double x, double y, double z, double sx, double sy, double sz) {
    if (!staging || staging->obstacle_count >= 4000)
        return;
    for (const double v : {x, y, z, sx, sy, sz})
        if (!std::isfinite(v) || std::abs(v) > 1000000)
            return;
    if (sx <= 0 || sy <= 0 || sz <= 0)
        return;
    const auto e = staging->world.create();
    staging->world.set(e, engine::Box{{static_cast<float>(x), static_cast<float>(y), static_cast<float>(z)},
                                      {static_cast<float>(sx), static_cast<float>(sy), static_cast<float>(sz)}});
    staging->world.set(e, engine::physics::Collider{});
    ++staging->obstacle_count;
}
// 1 when solid geometry (a Collider or the terrain/ground) lies between two
// points, else 0 -- the editor muffles sounds behind walls with it.
EXPORT int editor_line_blocked(double x1, double y1, double z1, double x2, double y2, double z2) {
    const engine::Vec3 from{static_cast<float>(x1), static_cast<float>(y1), static_cast<float>(z1)};
    const engine::Vec3 delta{static_cast<float>(x2 - x1), static_cast<float>(y2 - y1), static_cast<float>(z2 - z1)};
    const float length = std::sqrt(delta.x * delta.x + delta.y * delta.y + delta.z * delta.z);
    if (!(length > 0.3F) || !std::isfinite(length))
        return 0;
    engine::physics::QueryFilter filter;
    const auto hit = engine::physics::raycast(active->world, from, delta, length, active->physics_config, filter);
    return hit && hit->distance < length - 0.3F ? 1 : 0;
}
// The terrain's world height at (x, z), or NaN outside it (for tests and tools).
EXPORT double editor_terrain_height(double x, double z) {
    if (!active->terrain || !active->terrain->contains(static_cast<float>(x), static_cast<float>(z)))
        return std::nan("");
    return active->terrain->height_at(static_cast<float>(x), static_cast<float>(z));
}
EXPORT void editor_set_script_source(int index, const char *source) {
    const auto target = staged(index);
    if (!target)
        return;
    target->first->set(target->second, engine::script::Script{source != nullptr ? source : ""});
}
// Script props, after editor_set_script_source for the same index: one prop
// per line, "name\tkind\tvalue" with kind n (number), b (boolean, value
// 1/0) or s (string, the rest of the line). Malformed lines are skipped.
EXPORT void editor_set_script_props(int index, const char *text) {
    const auto target = staged(index);
    if (!target || !text)
        return;
    auto *script = target->first->get<engine::script::Script>(target->second);
    if (!script)
        return;
    script->props.clear();
    std::string all(text);
    std::size_t start = 0;
    while (start <= all.size()) {
        auto end = all.find('\n', start);
        if (end == std::string::npos)
            end = all.size();
        const std::string line = all.substr(start, end - start);
        start = end + 1;
        const auto t1 = line.find('\t');
        const auto t2 = t1 == std::string::npos ? std::string::npos : line.find('\t', t1 + 1);
        if (t2 == std::string::npos || t1 == 0)
            continue;
        engine::script::Script::Prop prop;
        prop.name = line.substr(0, t1);
        const std::string kind = line.substr(t1 + 1, t2 - t1 - 1);
        const std::string value = line.substr(t2 + 1);
        if (kind == "n") {
            char *parsed_end = nullptr;
            const double number = std::strtod(value.c_str(), &parsed_end);
            if (parsed_end == value.c_str() || !std::isfinite(number))
                continue;
            prop.kind = engine::script::Script::Prop::Kind::number;
            prop.number = number;
        } else if (kind == "b") {
            prop.kind = engine::script::Script::Prop::Kind::boolean;
            prop.boolean = value == "1";
        } else if (kind == "s") {
            prop.kind = engine::script::Script::Prop::Kind::text;
            prop.text = value;
        } else {
            continue;
        }
        script->props.push_back(std::move(prop));
    }
}
// The entity's authored Name (index -1: the template just added).
EXPORT void editor_set_name(int index, const char *name) {
    const auto target = staged(index);
    if (target && name)
        target->first->set(target->second, EntityName{name});
}
// Makes the next editor_add a prefab template called `name` (see
// Runtime::templates) instead of a scene entity.
EXPORT void editor_template_begin(const char *name) {
    if (staging && name)
        staging->adding_template = std::string(name);
}
EXPORT int editor_commit() {
    if (!staging || failed) {
        staging.reset();
        return 0;
    }
    if (staging->space && !finish_space(*staging)) {
        staging.reset();
        return 0;
    }
    active.swap(staging);
    staging.reset();
    return 1;
}
EXPORT void editor_tick() {
    active->systems.run(active->world,
                        {active->ticks++, std::chrono::nanoseconds{16'666'667}, active->input});
}
// Call once per rendered JS frame, before draining any editor_key() calls that
// frame — mirrors the native platform's own input.begin_frame()-then-apply-events
// loop (source/engine/runtime/application.cpp), so key_pressed()/key_released()
// read as single-frame edges instead of staying latched forever. A frame may
// cover more than one editor_tick() (the JS accumulator can run up to 5), and
// all of them share this same begin_frame() call, exactly like the native loop
// sharing one InputState across a batch of fixed steps.
EXPORT void editor_input_begin_frame() { active->input.begin_frame(); }
// Sets the horizontal camera-forward direction on-foot movement is relative to (see
// camera_forward_x/z's own doc comment on Runtime) — call once per rendered frame with the
// live camera's current facing, before that frame's editor_tick() calls, so this frame's
// movement already reflects wherever the camera is pointed right now. x/z need not be
// pre-normalized (this normalizes them); a near-zero vector — camera looking straight down,
// the one direction with no meaningful horizontal facing — is ignored, leaving the previous
// direction in place rather than dividing by ~0.
EXPORT void editor_set_camera_forward(double x, double z) {
    const auto length = std::sqrt(x * x + z * z);
    if (length > 0.0001) {
        active->camera_forward_x = static_cast<float>(x / length);
        active->camera_forward_z = static_cast<float>(z / length);
    }
}
// The first-person look direction (radians), once per rendered frame before
// that frame's ticks. Pitch is clamped to just short of straight up/down.
EXPORT void editor_set_look(double yaw, double pitch) {
    if (!std::isfinite(yaw) || !std::isfinite(pitch))
        return;
    active->look_yaw = static_cast<float>(std::remainder(yaw, 2 * 3.14159265358979));
    active->look_pitch = static_cast<float>(std::clamp(pitch, -1.55, 1.55));
}
// CharacterController state for the editor's camera and HUD. field 0 = eye
// height above the feet, 1 = crouched, 2 = grounded, 3 = landing speed this
// tick, 4 = horizontal speed, 5 = sprinting, 6 = feet (box bottom) world y.
// 0 without a controller.
EXPORT double editor_controller_value(int index, int field) {
    if (index < 0 || static_cast<std::size_t>(index) >= active->entities.size())
        return 0;
    const auto entity = active->entities[static_cast<std::size_t>(index)];
    if (!active->world.alive(entity))
        return 0;
    const auto *controller = active->world.get<Controller>(entity);
    const auto *box = active->world.get<engine::Box>(entity);
    if (!controller || !box)
        return 0;
    const auto &state = controller->state;
    switch (field) {
    case 0:
        return engine::gameplay::eye_offset(*box);
    case 1:
        return state.crouched ? 1 : 0;
    case 2:
        return state.grounded ? 1 : 0;
    case 3:
        return state.landing_speed;
    case 4:
        return state.speed;
    case 5:
        return state.sprinting ? 1 : 0;
    case 6:
        return box->center.y - box->size.y / 2;
    default:
        return 0;
    }
}
// code is one of the small set key_for() understands
// (0=W,1=A,2=S,3=D,4=Shift,5=F/attack,6=G/blast,7=C/crouch-sit); anything
// else maps to Key::unknown and is silently inert. down is nonzero for a
// keydown, zero for a keyup.
EXPORT void editor_key(int code, int down) {
    // F/G set their own pending_attack/pending_blast edge here, independent of
    // InputState's own per-*frame* key_pressed() (see Runtime::pending_attack's
    // doc comment for why) — a keydown always marks the edge, even if this
    // exact key was somehow already down (defensive; the JS side's own
    // event.repeat guard means that shouldn't happen in practice).
    if (down) {
        if (code == 5)
            active->pending_attack = true;
        else if (code == 6)
            active->pending_blast = true;
    }
    active->input.apply(engine::KeyEvent{
        1, key_for(code), down ? engine::ButtonAction::pressed : engine::ButtonAction::released, false});
}
// The general-purpose companion to editor_key() above: forwards every
// physical key the JS side chooses to report (not just the small
// W/A/S/D/Shift/F/G set key_for() understands) into the Script sandbox's own
// `input` table -- see engine::script::Runtime::set_key_down's own doc
// comment (script.hpp) for why this is a plain string, not an engine::Key,
// and entirely separate from InputState/editor_key above (movement/combat
// keys stay native-typed and fixed; a script's own key bindings are
// whatever string the game author picks). Call once per physical
// keydown/keyup edge, same timing as editor_key -- before the editor_tick()
// call(s) that edge should be visible to.
// Browser KeyboardEvent.code -> engine::Key, for the native InputState that
// actions and the bound movement keys read.
engine::Key key_for_code(const std::string &code) {
    using engine::Key;
    if (code.size() == 4 && code.rfind("Key", 0) == 0 && code[3] >= 'A' && code[3] <= 'Z')
        return static_cast<Key>(static_cast<int>(Key::a) + (code[3] - 'A'));
    if (code.size() == 6 && code.rfind("Digit", 0) == 0 && code[5] >= '0' && code[5] <= '9')
        return static_cast<Key>(static_cast<int>(Key::digit0) + (code[5] - '0'));
    if (code.size() >= 2 && code[0] == 'F') {
        const int n = std::atoi(code.c_str() + 1);
        if (n >= 1 && n <= 12 && code == "F" + std::to_string(n))
            return static_cast<Key>(static_cast<int>(Key::f1) + n - 1);
    }
    static const std::map<std::string, Key> named{
        {"Space", Key::space},          {"Enter", Key::enter},           {"Escape", Key::escape},
        {"Tab", Key::tab},              {"Backspace", Key::backspace},   {"ArrowUp", Key::up},
        {"ArrowDown", Key::down},       {"ArrowLeft", Key::left},        {"ArrowRight", Key::right},
        {"ShiftLeft", Key::left_shift}, {"ShiftRight", Key::right_shift}, {"ControlLeft", Key::left_control},
        {"ControlRight", Key::right_control}, {"AltLeft", Key::left_alt}, {"AltRight", Key::right_alt}};
    const auto found = named.find(code);
    return found == named.end() ? Key::unknown : found->second;
}
// Any key by its KeyboardEvent.code (0.55.0). Replaces editor_key for the
// browser: F and G still set the melee/blast edges.
EXPORT void editor_input_key(const char *code, int down) {
    if (!code)
        return;
    const auto key = key_for_code(code);
    if (key == engine::Key::unknown)
        return;
    if (down && key == engine::Key::f)
        active->pending_attack = true;
    if (down && key == engine::Key::g)
        active->pending_blast = true;
    active->input.apply(engine::KeyEvent{
        1, key, down ? engine::ButtonAction::pressed : engine::ButtonAction::released, false});
}
// Mouse position is in viewport pixels; deltas accumulate within a frame.
EXPORT void editor_input_mouse_move(double x, double y, double dx, double dy) {
    active->input.apply(engine::MouseMotionEvent{1, static_cast<float>(x), static_cast<float>(y),
                                                 static_cast<float>(dx), static_cast<float>(dy)});
}
// button: 0 left, 1 middle, 2 right.
EXPORT void editor_input_mouse_button(int button, int down, double x, double y) {
    if (button < 0 || button > 2)
        return;
    const auto which = button == 0 ? engine::MouseButton::left
                       : button == 1 ? engine::MouseButton::middle
                                     : engine::MouseButton::right;
    active->input.apply(engine::MouseButtonEvent{1, which,
                                                 down ? engine::ButtonAction::pressed : engine::ButtonAction::released,
                                                 1, static_cast<float>(x), static_cast<float>(y)});
}
EXPORT void editor_input_wheel(double dx, double dy) {
    active->input.apply(engine::MouseWheelEvent{1, static_cast<float>(dx), static_cast<float>(dy)});
}
// Gamepad (device 2): connection, engine::GamepadButton index, and
// engine::GamepadAxis index with a value in -1..1 (triggers 0..1).
EXPORT void editor_input_gamepad_connected(int connected) {
    active->input.apply(engine::GamepadConnectionEvent{
        2, connected ? engine::GamepadConnection::connected : engine::GamepadConnection::disconnected});
}
EXPORT void editor_input_gamepad_button(int button, int down) {
    if (button < 0 || button >= static_cast<int>(engine::GamepadButton::count))
        return;
    active->input.apply(engine::GamepadButtonEvent{
        2, static_cast<engine::GamepadButton>(button), down ? engine::ButtonAction::pressed : engine::ButtonAction::released});
}
EXPORT void editor_input_gamepad_axis(int axis, double value) {
    if (axis < 0 || axis >= static_cast<int>(engine::GamepadAxis::count) || !std::isfinite(value))
        return;
    active->input.apply(engine::GamepadAxisEvent{2, static_cast<engine::GamepadAxis>(axis),
                                                 static_cast<float>(std::clamp(value, -1.0, 1.0))});
}
// Custom action bindings for the runtime being staged (see bindings.hpp).
// Invalid text keeps the defaults; editor_bindings_error() says why.
EXPORT void editor_set_input_bindings(const char *text) {
    if (!staging || !text)
        return;
    std::string error;
    if (auto map = editor_bindings::parse(text, error)) {
        staging->actions = engine::ActionSystem{std::move(*map)};
        staging->bindings_error.clear();
    } else {
        staging->bindings_error = error;
    }
}
EXPORT const char *editor_bindings_error() { return active->bindings_error.c_str(); }
// An action's current value, for the editor's own readouts and tests.
EXPORT double editor_action_value(const char *name) {
    if (!name)
        return 0;
    const auto &map = active->actions.map();
    const engine::ActionId id{name};
    if (std::find(map.actions.begin(), map.actions.end(), id) == map.actions.end())
        return 0;
    return active->actions.state(id).value;
}
EXPORT void editor_script_key(const char *key, int down) {
    active->script_runtime.set_key_down(key, down != 0);
}
// field 0/1/2 are Box.center.x/y/z; field 3 is Health.current/Health.max (a ratio in [0, 1]),
// or -1 if the entity has no Health; field 4 is Heading.yaw (radians, 0 for an entity with no
// Heading — indistinguishable from a real yaw of 0, but JS only ever reads this for an entity
// it already knows authored both Player and Vehicle); field 5 is an AIAgent's AIState as a plain
// int matching AIStateName's own declared order in Components.ts (0=Idle, 1=Walking, 2=Running,
// 3=Driving, 4=Fleeing, 5=Chasing, 6=Dead — Driving and Dead are declared but never actually
// produced by editor.ai, see its own doc comment), or -1 for an entity with no AIAgent. Returns 0
// (and, for fields 3/5, -1) for an index outside entities' bounds, or for an entity combat has
// since destroyed — check editor_alive() first to tell "destroyed" apart from "never had one" at
// 0,0,0.
EXPORT double editor_value(int index, int field) {
    if (index < 0 || static_cast<std::size_t>(index) >= active->entities.size())
        return field == static_cast<int>(EntityField::health) || field == static_cast<int>(EntityField::ai_state) ? -1 : 0;
    const auto entity = active->entities[static_cast<std::size_t>(index)];
    if (!active->world.alive(entity))
        return field == static_cast<int>(EntityField::health) || field == static_cast<int>(EntityField::ai_state) ? -1 : 0;
    if (field == static_cast<int>(EntityField::health)) {
        const auto *health = active->world.get<Health>(entity);
        return health ? health->current / health->max : -1;
    }
    if (field == static_cast<int>(EntityField::heading_yaw)) {
        const auto *heading = active->world.get<Heading>(entity);
        return heading ? heading->yaw : 0;
    }
    if (field == static_cast<int>(EntityField::ai_state)) {
        const auto *agent = active->world.get<AIAgent>(entity);
        return agent ? static_cast<double>(static_cast<int>(agent->state)) : -1;
    }
    const auto &b = *active->world.get<engine::Box>(entity);
    return field == static_cast<int>(EntityField::x) ? b.center.x : field == static_cast<int>(EntityField::y) ? b.center.y : b.center.z;
}
// False once combat has destroyed the entity at this index (Health reaching 0) — the JS side's
// cue to hide it instead of reading a now-meaningless editor_value(). Every entity starts alive;
// nothing but combat destroys one, and only an entity with Health is ever a target.
EXPORT int editor_alive(int index) {
    if (index < 0 || static_cast<std::size_t>(index) >= active->entities.size())
        return 0;
    return active->world.alive(active->entities[static_cast<std::size_t>(index)]) ? 1 : 0;
}
EXPORT int editor_count() { return static_cast<int>(active->world.size()); }
// Every entity's tick state in one call (0.75.0): the index count, then six
// doubles per index -- alive (0/1), position x, y, z, the yaw the renderer
// faces it along (a soldier's look, else its Heading), and flags (1 a
// soldier, 2 an arcade car). Returns a pointer into the module's
// heap (read as HEAPF64[pointer / 8 ...]); valid until the next call. One
// call instead of six per entity per tick.
EXPORT std::uintptr_t editor_snapshot() {
    static std::vector<double> out;
    const auto count = active->entities.size();
    out.assign(1 + count * 6, 0.0);
    out[0] = static_cast<double>(count);
    for (std::size_t i = 0; i < count; ++i) {
        const auto entity = active->entities[i];
        if (!active->world.alive(entity))
            continue;
        double *row = out.data() + 1 + i * 6;
        row[0] = 1;
        if (const auto *box = active->world.get<engine::Box>(entity)) {
            row[1] = box->center.x;
            row[2] = box->center.y;
            row[3] = box->center.z;
        }
        const auto *heading = active->world.get<Heading>(entity);
        if (const auto *soldier = active->world.get<Soldier>(entity)) {
            row[4] = soldier->yaw;
            row[5] += 1;
        } else if (const auto *fighter = active->world.get<Fighter>(entity)) {
            row[4] = fighter->yaw; // faces where it fights (bridge_melee.cpp)
            row[5] += 1;
        } else if (heading)
            row[4] = heading->yaw;
        if (heading && heading->arcade)
            row[5] += 2;
    }
    return reinterpret_cast<std::uintptr_t>(out.data());
}
// The most recent compile/runtime error recorded for the entity at this
// index's script (Runtime::script_errors, populated once per entity by
// engine::script::Runtime's own error handler — see the Runtime constructor),
// or an empty string if it has none. Lets the editor show a script author
// what went wrong instead of a silently inert entity with no visible cause.
// Out of range or no error both return "".
EXPORT const char *editor_script_error(int index) {
    static std::string result; // must outlive the call for Emscripten's ccall(...,
                                // 'string') to read it back; safe since JS only ever
                                // calls this synchronously and never holds the
                                // returned pointer past that call.
    result.clear();
    if (index >= 0 && static_cast<std::size_t>(index) < active->entities.size()) {
        const auto found = active->script_errors.find(active->entities[static_cast<std::size_t>(index)]);
        if (found != active->script_errors.end())
            result = found->second;
    }
    return result.c_str();
}
// Whatever the entity at this index requested via self.animate = "clipName"
// this tick (see engine::script::Runtime's own doc comment, script.hpp), or
// "" if it didn't -- same "static std::string result, outlives the call"
// contract as editor_script_error above, and the same "call once per entity
// per frame" idiom the host uses elsewhere for anything Runtime tracks
// per-entity. Out of range returns "".
EXPORT const char *editor_take_animation_request(int index) {
    static std::string result;
    result.clear();
    if (index >= 0 && static_cast<std::size_t>(index) < active->entities.size())
        result = active->script_runtime.take_animation_request(active->entities[static_cast<std::size_t>(index)]);
    return result.c_str();
}
// Restores one previously-persisted save key (e.g. read from localStorage by
// the host) into the active Runtime's save table before any script runs --
// the host side of engine::script::Runtime::seed_saved (see its own doc
// comment, script.hpp, for why this is distinct from a script's own
// save.set). Call once per key right after editor_commit() succeeds, before
// the first editor_tick().
EXPORT void editor_seed_save(const char *key, const char *value) { active->script_runtime.seed_saved(key, value); }
// Takes every save key a script has actually changed via save.set since the
// last call to this function (engine::script::Runtime::take_dirty_saves(),
// which drains what it reports -- see pending_dirty_saves's own doc comment
// above for why this must be called exactly once per poll), snapshots it,
// and returns how many keys came back. Call this first each poll, then
// editor_dirty_save_key/editor_dirty_save_value with an index below that
// count to read what changed -- e.g. once a rendered frame, persisting each
// one to localStorage.
EXPORT int editor_take_dirty_saves() {
    pending_dirty_saves = active->script_runtime.take_dirty_saves();
    return static_cast<int>(pending_dirty_saves.size());
}
EXPORT const char *editor_dirty_save_key(int index) {
    static std::string result; // same "outlives the call, never held past it" contract as
                                // editor_script_error's own result above.
    result.clear();
    if (index >= 0 && static_cast<std::size_t>(index) < pending_dirty_saves.size())
        result = pending_dirty_saves[static_cast<std::size_t>(index)].first;
    return result.c_str();
}
EXPORT const char *editor_dirty_save_value(int index) {
    static std::string result;
    result.clear();
    if (index >= 0 && static_cast<std::size_t>(index) < pending_dirty_saves.size())
        result = pending_dirty_saves[static_cast<std::size_t>(index)].second;
    return result.c_str();
}
// Projectiles are spawned entirely at runtime (a "blast" press), so unlike every other entity
// here they have no place in the entities/editor_add-indexed list synced from the authoring
// document — this pair lets JS enumerate and draw whichever ones currently exist instead.
// Queried fresh each call rather than cached by identity: JS only ever calls these back to back
// within one frame, with no editor_tick() in between to change which projectiles exist.
// Every entity the editor tracks by index, spawned ones included (editor_count
// counts only living world entities, projectiles too).
EXPORT int editor_entity_count() { return static_cast<int>(active->entities.size()); }
// The prefab a runtime-spawned entity came from; "" for authored entities.
EXPORT const char *editor_spawned_prefab(int index) {
    static std::string result;
    result.clear();
    if (index >= 0 && static_cast<std::size_t>(index) < active->entities.size())
        if (const auto *from = active->world.get<SpawnedFrom>(active->entities[static_cast<std::size_t>(index)]))
            result = from->prefab;
    return result.c_str();
}
// Moves the script command queue into a read buffer; returns its size.
std::vector<OutboundCommand> pending_commands;
EXPORT int editor_take_commands() {
    pending_commands = std::move(active->commands);
    active->commands.clear();
    return static_cast<int>(pending_commands.size());
}
// field 0 = kind, 1 = a, 2 = b.
EXPORT const char *editor_command_text(int index, int field) {
    static std::string result;
    result.clear();
    if (index >= 0 && static_cast<std::size_t>(index) < pending_commands.size()) {
        const auto &c = pending_commands[static_cast<std::size_t>(index)];
        result = field == 0 ? c.kind : field == 1 ? c.a : c.b;
    }
    return result.c_str();
}
// Delivers an editor-side event to an entity's script: only on_anim_event
// and on_anim_state (the Animator's callbacks) are accepted.
EXPORT void editor_script_notify(int index, const char *function_name, const char *argument) {
    if (!function_name || !argument || index < 0 || static_cast<std::size_t>(index) >= active->entities.size())
        return;
    const std::string name(function_name);
    if (name != "on_anim_event" && name != "on_anim_state")
        return;
    active->script_runtime.notify(active->world, active->entities[static_cast<std::size_t>(index)], name, argument);
}
// A UI element changed (Button with action "script" clicked, Slider moved,
// Toggle flipped): calls on_ui(name, value) in every script.
EXPORT void editor_ui_event(const char *name, const char *value) {
    if (name && value)
        active->script_runtime.broadcast(active->world, "on_ui", name, value);
}
EXPORT int editor_command_entity(int index) {
    return index >= 0 && static_cast<std::size_t>(index) < pending_commands.size()
               ? pending_commands[static_cast<std::size_t>(index)].entity_index
               : -1;
}
// The frame governor's sim stride (0.76.0): far routines and wildlife
// decide every `stride` ticks.
EXPORT void editor_set_sim_stride(int stride) { active->sim_stride = std::clamp(stride, 1, 8); }
// "system=ms;system=ms" for the most recent tick (Stats overlay).
EXPORT const char *editor_profile_text() {
    static std::string result;
    result.clear();
    char buffer[64];
    for (const auto &[name, ms] : active->profile) {
        std::snprintf(buffer, sizeof buffer, "%.3f", ms);
        result += name + "=" + buffer + ";";
    }
    return result.c_str();
}
EXPORT int editor_projectile_count() {
    return static_cast<int>(active->world.query<engine::Box, Projectile>().size());
}
EXPORT double editor_projectile_value(int index, int field) {
    const auto entities = active->world.query<engine::Box, Projectile>();
    if (index < 0 || static_cast<std::size_t>(index) >= entities.size())
        return 0;
    const auto &b = *active->world.get<engine::Box>(entities[static_cast<std::size_t>(index)]);
    return field == 0 ? b.center.x : field == 1 ? b.center.y : b.center.z;
}
}
