// Editor runtime exports for streets: junction lights (TrafficSignal) and
// people on foot following sidewalk routes (Walker).
#include "bridge_runtime.hpp"

extern "C" {
// A TrafficSignal: green, yellow and all-red seconds per axis, the cycle's
// offset, and the stop lines' distance from the centre.
EXPORT void editor_set_signal(int index, double green, double yellow, double clearance, double offset, double radius) {
    const auto target = staged(index);
    if (!target)
        return;
    if (!(green > 0) || !(yellow >= 0) || !(clearance >= 0) || !std::isfinite(offset) || !(radius > 0))
        return fail("a TrafficSignal needs a positive green and radius, and yellow and clearance of 0 or more");
    TrafficSignal signal;
    signal.timing = {static_cast<float>(green), static_cast<float>(yellow), static_cast<float>(clearance), static_cast<float>(offset)};
    signal.radius = static_cast<float>(radius);
    target->first->set(target->second, signal);
}
// A Walker: "x,z x,z* ..." points (a trailing * marks a kerb to wait at
// before crossing to the next point), walked at `speed`, looping or not;
// or, with `follow` naming an entity, `gap` metres behind it.
EXPORT void editor_set_walker(int index, const char *route, double speed, int loop, const char *follow, double gap) {
    const auto target = staged(index);
    if (!target)
        return;
    if (!route || !follow || !(speed > 0) || !(gap > 0))
        return fail("a Walker needs a positive speed and gap");
    Walker walker;
    walker.speed = static_cast<float>(speed);
    walker.loop = loop != 0;
    walker.follow = follow;
    walker.gap = static_cast<float>(gap);
    std::istringstream in{route};
    std::string token;
    while (in >> token) {
        Walker::Point point;
        if (!token.empty() && token.back() == '*') {
            point.kerb = true;
            token.pop_back();
        }
        const auto comma = token.find(',');
        char *end_x = nullptr, *end_z = nullptr;
        const std::string xs = comma == std::string::npos ? token : token.substr(0, comma);
        const std::string zs = comma == std::string::npos ? "" : token.substr(comma + 1);
        point.x = std::strtof(xs.c_str(), &end_x);
        point.z = std::strtof(zs.c_str(), &end_z);
        if (comma == std::string::npos || xs.empty() || zs.empty() || *end_x != '\0' || *end_z != '\0' || !std::isfinite(point.x) ||
            !std::isfinite(point.z))
            return fail(("a Walker route point that isn't \"x,z\" or \"x,z*\": " + token).c_str());
        walker.route.push_back(point);
    }
    if (walker.follow.empty() && walker.route.size() < 2)
        return fail("a Walker with neither a route of two or more points nor an entity to follow");
    target->first->set(target->second, std::move(walker));
}
// A TrafficSignal's lights now: axis 0's (0 green, 1 yellow, 2 red) plus 3
// times axis 1's; -1 without one.
EXPORT int editor_signal_state(int index) {
    if (index < 0 || static_cast<std::size_t>(index) >= active->entities.size())
        return -1;
    const auto entity = active->entities[static_cast<std::size_t>(index)];
    const auto *signal = active->world.alive(entity) ? active->world.get<TrafficSignal>(entity) : nullptr;
    if (!signal)
        return -1;
    using engine::gameplay::signal_light;
    return static_cast<int>(signal_light(signal->timing, signal->time, 0)) + 3 * static_cast<int>(signal_light(signal->timing, signal->time, 1));
}
// 1 while a Walker waits at a kerb, 0 while it walks, -1 without one.
EXPORT int editor_walker_waiting(int index) {
    if (index < 0 || static_cast<std::size_t>(index) >= active->entities.size())
        return -1;
    const auto entity = active->entities[static_cast<std::size_t>(index)];
    const auto *walker = active->world.alive(entity) ? active->world.get<Walker>(entity) : nullptr;
    return walker ? (walker->waiting ? 1 : 0) : -1;
}
}
