#include "engine/gameplay/character.hpp"

#include <algorithm>
#include <cmath>

namespace engine::gameplay {
namespace {

// True if `probe` overlaps any solid collider other than `self` that the
// character's own layer settings let it collide with.
bool blocked(World& world, Entity self, const Box& probe) {
    const auto* own = world.get<physics::Collider>(self);
    const std::uint8_t layer = own ? own->layer : 0;
    const std::uint32_t mask = own ? own->mask : physics::all_layers;
    for (const auto other : world.query<Box, physics::Collider>()) {
        if (other == self)
            continue;
        const auto& collider = *world.get<physics::Collider>(other);
        if (collider.is_trigger || !collider.is_static)
            continue;
        if (!physics::layers_interact(layer, mask, collider.layer, collider.mask))
            continue;
        if (physics::probe_overlaps(probe, *world.get<Box>(other), collider))
            return true;
    }
    return false;
}

// The highest walkable surface under the box's footprint (center and four
// inset corners), searching from `top` down `depth`. Returns false if none.
bool ground_below(World& world, Entity self, const physics::Config& config, Vec3 center, Vec3 size, float top,
                  float depth, float& ground_y) {
    const float hx = std::max(0.0F, size.x / 2 - 0.02F), hz = std::max(0.0F, size.z / 2 - 0.02F);
    const float offsets[5][2]{{0, 0}, {-hx, -hz}, {hx, -hz}, {-hx, hz}, {hx, hz}};
    physics::QueryFilter filter;
    filter.ignore = self;
    bool found = false;
    for (const auto& offset : offsets) {
        const auto hit = physics::raycast(world, {center.x + offset[0], top, center.z + offset[1]}, {0, -1, 0}, depth,
                                          config, filter);
        if (!hit || hit->normal.y < physics::walkable_normal_y)
            continue;
        if (!found || hit->point.y > ground_y)
            ground_y = hit->point.y;
        found = true;
    }
    return found;
}

} // namespace

void configure_body(Box& box, const ControllerSettings& settings) {
    const float bottom = box.center.y - box.size.y / 2;
    box.size = {settings.radius * 2, settings.stand_height, settings.radius * 2};
    box.center.y = bottom + settings.stand_height / 2;
}

float eye_offset(const Box& box) { return box.size.y * 0.92F; }

void begin_step(World& world, Entity entity, ControllerState& state, const ControllerSettings& settings,
                const ControllerInput& input, float gravity, float dt) {
    auto* box = world.get<Box>(entity);
    auto* body = world.get<physics::RigidBody>(entity);
    if (!box || !body || !(dt > 0))
        return;
    const bool grounded = body->grounded;
    state.since_jump_pressed = input.jump_pressed ? 0.0F : state.since_jump_pressed + dt;
    if (grounded) {
        state.since_grounded = 0.0F;
        state.jumping = false;
    } else {
        state.since_grounded += dt;
    }

    // Crouch keeps the feet planted; standing back up needs headroom.
    const float bottom = box->center.y - box->size.y / 2;
    if (input.crouch && !state.crouched) {
        box->size.y = settings.crouch_height;
        box->center.y = bottom + settings.crouch_height / 2;
        state.crouched = true;
    } else if (!input.crouch && state.crouched) {
        Box standing = *box;
        standing.size.y = settings.stand_height;
        standing.center.y = bottom + settings.stand_height / 2;
        if (!blocked(world, entity, standing)) {
            *box = standing;
            state.crouched = false;
        }
    }

    float move_x = input.move_x, move_y = input.move_y;
    const float length = std::sqrt(move_x * move_x + move_y * move_y);
    if (length > 1) {
        move_x /= length;
        move_y /= length;
    }
    const bool moving = length > 0.01F;
    const float sin_yaw = std::sin(input.yaw), cos_yaw = std::cos(input.yaw);
    // forward = (-sin, 0, -cos), right = (cos, 0, -sin).
    const float wish_x = cos_yaw * move_x - sin_yaw * move_y;
    const float wish_z = -sin_yaw * move_x - cos_yaw * move_y;
    const bool sprinting = !state.crouched && input.sprint && move_y > 0.1F;
    const float speed = state.crouched ? settings.crouch_speed : sprinting ? settings.sprint_speed
                                                                            : settings.walk_speed;
    state.sprinting = sprinting && grounded;

    float rate = 0.0F;
    if (grounded)
        rate = moving ? settings.ground_accel : settings.ground_decel;
    else if (moving)
        rate = settings.air_accel;
    // Accelerate the horizontal velocity as a vector toward the target, so
    // turning doesn't overshoot on one axis.
    const float target_x = wish_x * speed, target_z = wish_z * speed;
    const float dx = target_x - body->velocity.x, dz = target_z - body->velocity.z;
    const float gap = std::sqrt(dx * dx + dz * dz);
    if (gap > 0 && rate > 0) {
        const float step = std::min(gap, rate * dt) / gap;
        body->velocity.x += dx * step;
        body->velocity.z += dz * step;
    }

    if (state.since_jump_pressed <= settings.jump_buffer && state.since_grounded <= settings.coyote_time &&
        !state.jumping) {
        body->velocity.y = std::sqrt(2.0F * std::abs(gravity) * settings.jump_height);
        state.jumping = true;
        state.since_jump_pressed = 1.0F;
        state.since_grounded = 1.0F;
    }

    state.position_before = box->center;
    state.velocity_before = body->velocity;
}

void end_step(World& world, Entity entity, ControllerState& state, const ControllerSettings& settings,
              const physics::Config& config, float dt) {
    auto* box = world.get<Box>(entity);
    auto* body = world.get<physics::RigidBody>(entity);
    if (!box || !body || !(dt > 0))
        return;
    const bool was_grounded = state.grounded;
    const Vec3 before = state.position_before;
    const float bottom_before = before.y - box->size.y / 2;

    // Step up: blocked while walking on the ground, and the same move from
    // step_height higher is clear with walkable ground under it.
    const float want_x = state.velocity_before.x * dt, want_z = state.velocity_before.z * dt;
    const float want = want_x * want_x + want_z * want_z;
    if (was_grounded && !state.jumping && want > 1e-8F) {
        const float got = (box->center.x - before.x) * want_x + (box->center.z - before.z) * want_z;
        if (got < 0.6F * want) {
            Box raised = *box;
            raised.center = {before.x + want_x, before.y + settings.step_height + 0.01F, before.z + want_z};
            float ground_y = 0;
            if (!blocked(world, entity, raised) &&
                ground_below(world, entity, config, raised.center, raised.size,
                             raised.center.y - raised.size.y / 2, settings.step_height + 0.05F, ground_y) &&
                ground_y > bottom_before + 0.01F) {
                box->center = {raised.center.x, ground_y + box->size.y / 2, raised.center.z};
                body->velocity.x = state.velocity_before.x;
                body->velocity.z = state.velocity_before.z;
                body->velocity.y = 0;
                body->grounded = true;
            }
        }
    }

    // Stick to ground just below when walking off a step or down a slope.
    if (was_grounded && !body->grounded && !state.jumping && body->velocity.y <= 0) {
        const float bottom = box->center.y - box->size.y / 2;
        float ground_y = 0;
        if (ground_below(world, entity, config, box->center, box->size, bottom + 0.01F, settings.step_height + 0.01F,
                         ground_y) &&
            ground_y < bottom + 0.01F) {
            box->center.y = ground_y + box->size.y / 2;
            body->velocity.y = 0;
            body->grounded = true;
        }
    }

    state.landing_speed = !was_grounded && body->grounded ? std::max(0.0F, -state.velocity_before.y) : 0.0F;
    if (body->grounded)
        state.jumping = false;
    state.grounded = body->grounded;
    state.speed = std::sqrt(body->velocity.x * body->velocity.x + body->velocity.z * body->velocity.z);
}

} // namespace engine::gameplay
