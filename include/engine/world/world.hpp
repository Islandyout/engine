#pragma once

#include "engine/core/types.hpp"

#include <compare>
#include <functional>
#include <map>
#include <memory>
#include <set>
#include <stdexcept>
#include <string>
#include <type_traits>
#include <typeindex>
#include <utility>
#include <vector>

namespace engine {

// Transient world-owned handle, not a persistent EntityId. Never reused, even
// on reset.
class Entity final {
public:
    Entity() = default;
    auto operator<=>(const Entity&) const = default;

private:
    friend class World;
    Entity(u64 owner, u64 serial) : owner_(owner), serial_(serial) {}
    u64 owner_{};
    u64 serial_{};
};

class FixedSystems;

// Single-threaded ownership boundary. No component address survives
// remove/destroy/reset.
class World final {
public:
    World();
    World(const World&) = delete;
    World& operator=(const World&) = delete;
    World(World&&) = delete;
    World& operator=(World&&) = delete;

    [[nodiscard]] Entity create();
    [[nodiscard]] bool alive(Entity entity) const;
    bool destroy(Entity entity);
    void reset();
    [[nodiscard]] std::size_t size() const { return entities_.size(); }

    // Stable names are explicit; RTTI is used only for local type lookup, never
    // ordering.
    template <typename T> void register_component(std::string name) {
        require_idle();
        validate_name(name);
        const std::type_index type{typeid(T)};
        if (types_.contains(type) || stores_.contains(name)) {
            throw std::invalid_argument{"duplicate component type or name"};
        }
        auto store = std::make_unique<Store<T>>();
        types_.emplace(type, name);
        try {
            stores_.emplace(std::move(name), std::move(store));
        } catch (...) {
            types_.erase(type);
            throw;
        }
    }

    [[nodiscard]] std::vector<std::string> component_names() const;

    template <typename T> T& set(Entity entity, T value) {
        require_idle();
        require_alive(entity);
        return typed_store<T>().values.insert_or_assign(entity, std::move(value)).first->second;
    }
    template <typename T> T* get(Entity entity) {
        auto& values = typed_store<T>().values;
        const auto found = values.find(entity);
        return alive(entity) && found != values.end() ? &found->second : nullptr;
    }
    template <typename T> const T* get(Entity entity) const {
        const auto& values = typed_store<T>().values;
        const auto found = values.find(entity);
        return alive(entity) && found != values.end() ? &found->second : nullptr;
    }
    template <typename T> bool remove(Entity entity) {
        require_idle();
        auto& store = typed_store<T>();
        return alive(entity) && store.values.erase(entity) != 0;
    }
    // Snapshot in creation order. Empty component pack means every living entity.
    template <typename... T> [[nodiscard]] std::vector<Entity> query() const {
        (static_cast<void>(typed_store<T>()), ...);
        std::vector<Entity> result;
        for (const auto entity : entities_) {
            if (((get<T>(entity) != nullptr) && ...)) {
                result.push_back(entity);
            }
        }
        return result;
    }

    // FIFO command stream. A reserved entity becomes alive at the next flush.
    [[nodiscard]] Entity defer_create();
    void defer_destroy(Entity entity);
    template <typename T> void defer_set(Entity entity, T value) {
        static_cast<void>(typed_store<T>());
        require_owned(entity);
        commands_.emplace_back([entity, value = std::move(value)](World& world) mutable {
            if (world.alive(entity)) {
                world.set<T>(entity, std::move(value));
            }
        });
    }
    template <typename T> void defer_remove(Entity entity) {
        static_cast<void>(typed_store<T>());
        require_owned(entity);
        commands_.emplace_back([entity](World& world) { world.remove<T>(entity); });
    }
    void flush();
    [[nodiscard]] std::size_t pending_changes() const { return commands_.size(); }

private:
    friend class FixedSystems;
    struct StoreBase {
        virtual ~StoreBase() = default;
        virtual void erase(Entity entity) = 0;
        virtual void clear() = 0;
    };
    template <typename T> struct Store final : StoreBase {
        static_assert(std::is_object_v<T> && std::is_same_v<T, std::remove_cvref_t<T>>,
                      "components must be unqualified object value types");
        std::map<Entity, T> values;
        void erase(Entity entity) override { values.erase(entity); }
        void clear() override { values.clear(); }
    };
    template <typename T> Store<T>& typed_store() {
        return const_cast<Store<T>&>(std::as_const(*this).typed_store<T>());
    }
    template <typename T> const Store<T>& typed_store() const {
        const auto found = types_.find(std::type_index{typeid(T)});
        if (found == types_.end()) {
            throw std::invalid_argument{"unregistered component type"};
        }
        return static_cast<const Store<T>&>(*stores_.at(found->second));
    }
    static void validate_name(const std::string& name);
    void require_idle() const;
    void require_owned(Entity entity) const;
    void require_alive(Entity entity) const;
    [[nodiscard]] Entity reserve();
    u64 owner_{};
    u64 next_serial_{1};
    bool executing_{};
    std::set<Entity> entities_;
    std::map<std::string, std::unique_ptr<StoreBase>> stores_;
    std::map<std::type_index, std::string> types_;
    std::vector<std::function<void(World&)>> commands_;
};

} // namespace engine
