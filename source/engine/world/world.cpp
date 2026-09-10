#include "engine/world/world.hpp"

#include <atomic>
#include <limits>

namespace engine {
namespace {
std::atomic<u64> next_owner{1};

u64 allocate_owner() {
    auto value = next_owner.load(std::memory_order_relaxed);
    for (;;) {
        if (value == std::numeric_limits<u64>::max()) {
            throw std::overflow_error{"world identity space exhausted"};
        }
        if (next_owner.compare_exchange_weak(value, value + 1, std::memory_order_relaxed)) {
            return value;
        }
    }
}
} // namespace

World::World() : owner_(allocate_owner()) {}

void World::validate_name(const std::string& name) {
    if (name.empty() || name.size() > 128) {
        throw std::invalid_argument{"identifier must contain 1 to 128 ASCII characters"};
    }
    for (const char c : name) {
        if (!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') ||
              c == '_' || c == '.' || c == '-')) {
            throw std::invalid_argument{"invalid identifier character"};
        }
    }
}

void World::require_idle() const {
    if (executing_) {
        throw std::logic_error{"structural changes during systems must be deferred"};
    }
}

void World::require_owned(const Entity entity) const {
    if (entity.owner_ != owner_ || entity.serial_ == 0 || entity.serial_ >= next_serial_) {
        throw std::invalid_argument{"entity does not belong to this world"};
    }
}

void World::require_alive(const Entity entity) const {
    if (!alive(entity)) {
        throw std::invalid_argument{"entity is not alive in this world"};
    }
}

Entity World::reserve() {
    if (next_serial_ == std::numeric_limits<u64>::max()) {
        throw std::overflow_error{"entity identity space exhausted"};
    }
    return Entity{owner_, next_serial_++};
}

Entity World::create() {
    require_idle();
    const auto entity = reserve();
    entities_.insert(entity);
    return entity;
}

bool World::alive(const Entity entity) const {
    return entity.owner_ == owner_ && entities_.contains(entity);
}

bool World::destroy(const Entity entity) {
    require_idle();
    if (!alive(entity)) {
        return false;
    }
    for (auto& [name, store] : stores_) {
        static_cast<void>(name);
        store->erase(entity);
    }
    entities_.erase(entity);
    return true;
}

void World::reset() {
    require_idle();
    commands_.clear();
    for (auto& [name, store] : stores_) {
        static_cast<void>(name);
        store->clear();
    }
    entities_.clear();
}

std::vector<std::string> World::component_names() const {
    std::vector<std::string> names;
    for (const auto& [name, store] : stores_) {
        static_cast<void>(store);
        names.push_back(name);
    }
    return names;
}

Entity World::defer_create() {
    const auto entity = reserve();
    commands_.emplace_back([entity](World& world) { world.entities_.insert(entity); });
    return entity;
}

void World::defer_destroy(const Entity entity) {
    require_owned(entity);
    commands_.emplace_back([entity](World& world) { world.destroy(entity); });
}

void World::flush() {
    require_idle();
    auto commands = std::move(commands_);
    commands_.clear();
    for (auto& command : commands) {
        command(*this);
    }
}

} // namespace engine
