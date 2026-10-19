// Editor runtime exports for loot: pickups, loot drops, containers, the
#include <sstream>
// Player's interact target and items (engine::gameplay::loot.hpp).
#include "bridge_runtime.hpp"

namespace {
const engine::gameplay::LootEntry *loot_of(int index) {
    if (index < 0 || static_cast<std::size_t>(index) >= active->entities.size())
        return nullptr;
    const auto entity = active->entities[static_cast<std::size_t>(index)];
    const auto *pickup = active->world.alive(entity) ? active->world.get<Pickup>(entity) : nullptr;
    return pickup ? &pickup->loot : nullptr;
}
}

extern "C" {
// A pickup, after editor_add for the same index: `loot` is one loot-table
// line (engine::gameplay::parse_loot; its chance is ignored), `press` 1 to
// take it with interact instead of by walking over it, `respawn` seconds
// until it comes back once taken (0: never).
EXPORT void editor_set_pickup(int index, const char *loot, int press, double respawn) {
    const auto target = staged(index);
    if (!target || !loot)
        return;
    const auto parsed = engine::gameplay::parse_loot(loot);
    if (!parsed.error.empty() || parsed.entries.size() != 1 || !std::isfinite(respawn) || respawn < 0 || respawn > 3600) {
        fail(parsed.error.empty() ? "a Pickup that isn't one loot entry, or a respawn outside 0..3600 s"
                                  : ("a Pickup: " + parsed.error).c_str());
        return;
    }
    Pickup pickup;
    pickup.loot = parsed.entries.front();
    pickup.press = press != 0;
    pickup.respawn = static_cast<float>(respawn);
    target->first->set(target->second, pickup);
}
// What an entity drops when it dies: its gun in hand (drop_weapon 1) and
// what its loot table rolls.
EXPORT void editor_set_loot_drop(int index, int drop_weapon, const char *table) {
    const auto target = staged(index);
    if (!target || !table)
        return;
    auto parsed = engine::gameplay::parse_loot(table);
    if (!parsed.error.empty()) {
        fail(("a LootDrop table: " + parsed.error).c_str());
        return;
    }
    target->first->set(target->second, LootDrop{drop_weapon != 0, std::move(parsed.entries), false});
}
// A crate or chest: its loot table, how long interact is held to open it
// (0: a press), and the item it needs (and uses up), "" for none.
EXPORT void editor_set_container(int index, const char *table, double hold, const char *key) {
    const auto target = staged(index);
    if (!target || !table || !key)
        return;
    auto parsed = engine::gameplay::parse_loot(table);
    if (!parsed.error.empty() || !std::isfinite(hold) || hold < 0 || hold > 30) {
        fail(parsed.error.empty() ? "a Container hold time outside 0..30 s" : ("a Container table: " + parsed.error).c_str());
        return;
    }
    target->first->set(target->second, Container{std::move(parsed.entries), static_cast<float>(hold), key, false});
}
// A pickup's state: field 0 = 1 for a pickup (0 otherwise), 1 = amount, 2 =
// press (1) or walk over (0), 3 = taken (waiting to respawn), 4 = rarity
// (0 Common .. 4 Legendary), 5 = kind (0 weapon, 1 ammo, 2 health, 3 item),
// 6 = a weapon's damage, 7 = its rpm, 8 = its magazine; 9 = 1 for a
// container, 10 = 1 once a container is open.
EXPORT double editor_pickup_value(int index, int field) {
    if (field >= 9) {
        if (index < 0 || static_cast<std::size_t>(index) >= active->entities.size())
            return 0;
        const auto entity = active->entities[static_cast<std::size_t>(index)];
        const auto *box = active->world.alive(entity) ? active->world.get<Container>(entity) : nullptr;
        return !box ? 0 : field == 9 ? 1 : box->opened ? 1 : 0;
    }
    const auto *loot = loot_of(index);
    if (!loot)
        return 0;
    const auto entity = active->entities[static_cast<std::size_t>(index)];
    const auto &pickup = *active->world.get<Pickup>(entity);
    switch (field) {
    case 0: return 1;
    case 1: return loot->amount;
    case 2: return pickup.press ? 1 : 0;
    case 3: return pickup.taken ? 1 : 0;
    case 4: return static_cast<int>(loot->rarity);
    case 5: return static_cast<int>(loot->kind);
    case 6: return loot->weapon.damage * static_cast<float>(loot->weapon.pellets);
    case 7: return loot->weapon.rpm;
    case 8: return loot->weapon.magazine;
    default: return 0;
    }
}
// A pickup's words: field 0 = its label, 1 = the model it shows (a gun's
// held= or its model=, a melee slot's blade, an item's name), 2 = its rarity
// name, 3 = a weapon's off-hand model.
EXPORT const char *editor_pickup_text(int index, int field) {
    static std::string result;
    result.clear();
    if (const auto *loot = loot_of(index)) {
        const auto &weapon = loot->weapon;
        result = field == 0   ? engine::gameplay::loot_label(*loot)
                 : field == 1 ? (loot->kind != engine::gameplay::LootKind::weapon ? loot->item
                                 : weapon.is_melee()                              ? weapon.melee
                                 : !weapon.held.empty()                           ? weapon.held
                                                                                  : weapon.model)
                 : field == 2 ? std::string(engine::gameplay::rarity_name(loot->rarity))
                              : weapon.offhand;
    }
    return result.c_str();
}
// The Player's interact target: field 0 = its index (-1 none), 1 = how far
// a hold to open it has got (0..1; -1 for a press), 2 = 1 for a container,
// 3 = 1 when it needs an item the Player doesn't carry.
EXPORT double editor_interact_value(int field) {
    const auto &r = *active;
    if (!r.interact_target || !r.world.alive(*r.interact_target))
        return field == 0 ? -1 : 0;
    const auto *box = r.world.get<Container>(*r.interact_target);
    switch (field) {
    case 0: return r.index_of(*r.interact_target);
    case 1: return box && box->hold > 0 ? std::min(1.0F, r.interact_hold / box->hold) : -1;
    case 2: return box ? 1 : 0;
    case 3: {
        if (!box || box->key.empty())
            return 0;
        for (const auto entity : r.world.query<PlayerMarker>())
            if (const auto *items = r.world.get<Items>(entity); items && items->counts.count(box->key) && items->counts.at(box->key) > 0)
                return 0;
        return 1;
    }
    default: return 0;
    }
}
// The interact target's words: field 0 = its name (a pickup's label, a
// container's entity name), 1 = the item a container needs.
EXPORT const char *editor_interact_text(int field) {
    static std::string result;
    result.clear();
    const auto &r = *active;
    if (r.interact_target && r.world.alive(*r.interact_target)) {
        if (const auto *pickup = r.world.get<Pickup>(*r.interact_target); pickup && field == 0)
            result = engine::gameplay::loot_label(pickup->loot);
        else if (const auto *box = r.world.get<Container>(*r.interact_target)) {
            const auto *name = r.world.get<EntityName>(*r.interact_target);
            result = field == 0 ? (name ? name->value : std::string{"Crate"}) : box->key;
        }
    }
    return result.c_str();
}
// Moves the loot event queue into a read buffer; returns its size.
std::vector<LootEvent> pending_loot_events;
EXPORT int editor_take_loot_events() {
    pending_loot_events = std::move(active->loot_events);
    active->loot_events.clear();
    return static_cast<int>(pending_loot_events.size());
}
// field 0 = kind (0 picked up, 1 opened, 2 dropped, 3 locked), 1 = the
// pickup, container or dead entity's index, 2 = amount, 3 = rarity.
EXPORT double editor_loot_event(int index, int field) {
    if (index < 0 || static_cast<std::size_t>(index) >= pending_loot_events.size())
        return 0;
    const auto &e = pending_loot_events[static_cast<std::size_t>(index)];
    return field == 0 ? static_cast<int>(e.kind) : field == 1 ? e.entity : field == 2 ? e.amount : e.rarity;
}
// A loot event's label (what was picked up; the item a locked crate needs).
EXPORT const char *editor_loot_event_text(int index) {
    static std::string result;
    result.clear();
    if (index >= 0 && static_cast<std::size_t>(index) < pending_loot_events.size())
        result = pending_loot_events[static_cast<std::size_t>(index)].label;
    return result.c_str();
}
// An entity's items, one "name count" per line (sorted by name).
EXPORT const char *editor_items_text(int index) {
    static std::string result;
    result.clear();
    if (index >= 0 && static_cast<std::size_t>(index) < active->entities.size()) {
        const auto entity = active->entities[static_cast<std::size_t>(index)];
        if (const auto *items = active->world.alive(entity) ? active->world.get<Items>(entity) : nullptr)
            for (const auto &[name, count] : items->counts)
                result += name + " " + std::to_string(count) + "\n";
    }
    return result.c_str();
}
// Item stats: one item per line, "Name: slot=head armor=10 damage=15 speed=-5 health=20"
// (# comments). Numbers are percentages except health (points).
static bool parse_item_stats(const std::string &text, std::map<std::string, Inventory::ItemStats> &out, std::string &error) {
    std::istringstream lines(text);
    std::string line;
    int number = 0;
    while (std::getline(lines, line)) {
        ++number;
        const auto first = line.find_first_not_of(" \t\r");
        if (first == std::string::npos || line[first] == '#')
            continue;
        const auto colon = line.find(':', first);
        if (colon == std::string::npos) {
            error = "line " + std::to_string(number) + ": expected \"Name: slot=head armor=10 ...\"";
            return false;
        }
        auto name = line.substr(first, colon - first);
        name.erase(name.find_last_not_of(" \t") + 1);
        if (name.empty()) {
            error = "line " + std::to_string(number) + ": an item needs a name before the colon";
            return false;
        }
        Inventory::ItemStats stats;
        std::istringstream fields(line.substr(colon + 1));
        std::string field;
        while (fields >> field) {
            const auto eq = field.find('=');
            const auto key = field.substr(0, eq);
            const auto value = eq == std::string::npos ? std::string{} : field.substr(eq + 1);
            if (key == "slot") {
                if (value != "head" && value != "body" && value != "hands") {
                    error = "line " + std::to_string(number) + ": slot must be head, body or hands";
                    return false;
                }
                stats.slot = value;
                continue;
            }
            char *end = nullptr;
            const double amount = std::strtod(value.c_str(), &end);
            if (value.empty() || *end != '\0' || !std::isfinite(amount) || std::fabs(amount) > 1000) {
                error = "line " + std::to_string(number) + ": \"" + field + "\" needs a number (e.g. " + key + "=10)";
                return false;
            }
            if (key == "armor")
                stats.armor = static_cast<float>(amount);
            else if (key == "damage")
                stats.damage = static_cast<float>(amount);
            else if (key == "speed")
                stats.speed = static_cast<float>(amount);
            else if (key == "health")
                stats.health = static_cast<float>(amount);
            else {
                error = "line " + std::to_string(number) + ": unknown stat \"" + key + "\" (slot, armor, damage, speed, health)";
                return false;
            }
        }
        out[name] = stats;
    }
    return true;
}
// An entity's Inventory: carrying limits, per-item weights ("name=1.5,
// name=2"), and what is worn. Weights must be finite and >= 0.
EXPORT void editor_set_inventory(int index, int slots, double max_weight, const char *weights, const char *stats,
                                 const char *head, const char *body, const char *hands) {
    const auto target = staged(index);
    if (!target || !weights || !stats || !head || !body || !hands)
        return;
    if (slots < 0 || slots > 999 || !std::isfinite(max_weight) || max_weight < 0 || max_weight > 1e7) {
        fail("an Inventory slots or max weight outside 0..999 / 0..10000000");
        return;
    }
    Inventory inventory;
    inventory.slots = slots;
    inventory.max_weight = static_cast<float>(max_weight);
    std::istringstream list(weights);
    std::string part;
    while (std::getline(list, part, ',')) {
        const auto eq = part.find('=');
        const auto trim = [](std::string text) {
            const auto first = text.find_first_not_of(" \t");
            const auto last = text.find_last_not_of(" \t");
            return first == std::string::npos ? std::string{} : text.substr(first, last - first + 1);
        };
        if (trim(part).empty())
            continue;
        char *end = nullptr;
        const std::string name = eq == std::string::npos ? std::string{} : trim(part.substr(0, eq));
        const std::string number = eq == std::string::npos ? std::string{} : trim(part.substr(eq + 1));
        const double weight = std::strtod(number.c_str(), &end);
        if (name.empty() || number.empty() || *end != '\0' || !std::isfinite(weight) || weight < 0) {
            fail(("an Inventory weights entry \"" + trim(part) + "\" (expected name=weight)").c_str());
            return;
        }
        inventory.weights[name] = static_cast<float>(weight);
    }
    std::string stats_error;
    if (!parse_item_stats(stats, inventory.stats, stats_error)) {
        fail(("an Inventory stats: " + stats_error).c_str());
        return;
    }
    inventory.head = head;
    inventory.body = body;
    inventory.hands = hands;
    target->first->set(target->second, std::move(inventory));
}
// What an Inventory carries and wears, as text: "weight W", "slots N",
// "worn head|body|hands NAME" and one "item NAME COUNT" per kind.
EXPORT const char *editor_inventory_text(int index) {
    static std::string result;
    result.clear();
    if (index >= 0 && static_cast<std::size_t>(index) < active->entities.size()) {
        const auto entity = active->entities[static_cast<std::size_t>(index)];
        if (active->world.alive(entity))
            if (const auto *inventory = active->world.get<Inventory>(entity)) {
                const auto *items = active->world.get<Items>(entity);
                result += "weight " + std::to_string(items ? inventory->total_weight(*items) : 0.0F) + "\n";
                result += "limit " + std::to_string(inventory->slots) + " " + std::to_string(inventory->max_weight) + "\n";
                for (const auto &[slot, worn] : {std::pair<const char *, const std::string &>{"head", inventory->head},
                                                  {"body", inventory->body},
                                                  {"hands", inventory->hands}})
                    if (!worn.empty())
                        result += std::string("worn ") + slot + " " + worn + "\n";
                if (items)
                    for (const auto &[name, count] : items->counts) {
                        const auto found = inventory->stats.find(name);
                        const std::string slot = found == inventory->stats.end() || found->second.slot.empty() ? "-" : found->second.slot;
                        result += "item " + std::to_string(count) + " " + slot + " " + name + "\n";
                    }
            }
    }
    return result.c_str();
}
// An inventory verb for the UI (the same ones inventory.* gives scripts): add, remove,
// equip (`name` the slot, `text` the item), unequip, select. Returns the verb's number
// (the count added, 1 for done) or -1 when it can't be done.
EXPORT double editor_inventory_op(int index, const char *op, const char *name, int amount, const char *text) {
    if (!op || !name || !text || index < 0 || static_cast<std::size_t>(index) >= active->entities.size())
        return -1;
    const auto entity = active->entities[static_cast<std::size_t>(index)];
    if (!active->world.alive(entity))
        return -1;
    double number = 0;
    std::string io = text;
    if (!active->host.inventory(active->world, entity, op, name, amount, number, io))
        return -1;
    return std::string(op) == "add" ? number : 1;
}
// Getting in and out of cars. field 0 = 1 while the Player sits in one, 1 = the walker's index
// (-1 when not seated), 2 = the car the prompt is about (-1 none), 3 = the prompt: 0 none,
// 1 "Enter", 2 "Exit", 3 "Exit" with no room.
EXPORT double editor_seat_value(int field) {
    const auto &r = *active;
    switch (field) {
    case 0: return r.car_handover ? 1 : 0;
    case 1: return r.car_handover && r.world.alive(r.car_handover->walker) ? r.index_of(r.car_handover->walker) : -1;
    case 2: return r.seat_car && r.world.alive(*r.seat_car) ? r.index_of(*r.seat_car) : -1;
    case 3: return r.seat_prompt;
    default: return 0;
    }
}
// field 0 = the prompt car's name, 1 = why the exit is blocked.
EXPORT const char *editor_seat_text(int field) {
    static std::string result;
    result.clear();
    const auto &r = *active;
    if (field == 0 && r.seat_car && r.world.alive(*r.seat_car))
        result = r.car_name(r.world, *r.seat_car);
    else if (field == 1)
        result = r.seat_why;
    return result.c_str();
}
}
