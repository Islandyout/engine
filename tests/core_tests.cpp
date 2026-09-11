#include "engine/core/fixed_step_clock.hpp"
#include "engine/core/log.hpp"
#include "engine/core/uuid.hpp"
#include "engine/core/seeded_random.hpp"

#include <chrono>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

namespace {

class RecordingSink final : public engine::LogSink {
public:
    void write(const engine::LogRecord& record) override { records.push_back(record); }
    std::vector<engine::LogRecord> records;
};

void require(const bool condition, const std::string& message) {
    if (!condition) {
        throw std::runtime_error{message};
    }
}

void uuid_round_trip() {
    const engine::Uuid generated = engine::Uuid::random_v4();
    require(!generated.is_nil(), "generated UUID must not be nil");
    require((generated.bytes()[6] & 0xf0U) == 0x40U, "UUID must have version 4 bits");
    require((generated.bytes()[8] & 0xc0U) == 0x80U, "UUID must have RFC variant bits");

    const std::string encoded = generated.to_string();
    const auto parsed = engine::Uuid::parse(encoded);
    require(parsed.has_value(), "serialized UUID must parse");
    require(*parsed == generated, "UUID must survive a text round trip");
    require(!engine::Uuid::parse("not-a-uuid").has_value(), "invalid UUID must fail");
}

void seeded_random_matches_aether() {
    engine::SeededRandom random{42};
    for (const engine::u32 expected : {2581720956U, 1925393290U, 3661312704U,
                                       2876485805U, 750819978U, 2261697747U}) {
        require(random.next_u32() == expected, "RNG must match Aether's reference sequence");
    }
    engine::SeededRandom zero{0};
    require(zero.next_u32() == 1144304738U, "zero seed is supported");
    engine::SeededRandom maximum{0xffffffffU};
    require(maximum.next_u32() == 3850105811U, "unsigned overflow matches JS reference");
    engine::SeededRandom first{1}, second{1}, unit{1};
    for (int i = 0; i < 10000; ++i) {
        const auto bits = first.next_u32();
        require(bits == second.next_u32(), "equal seeds produce equal streams");
        const double value = unit.next_unit();
        require(value >= 0.0 && value < 1.0, "unit random value lies in [0,1)");
        require(value == static_cast<double>(bits) / 4294967296.0,
                "unit samples preserve the exact 32-bit fraction");
    }
}

void fixed_step_accumulates_time() {
    using namespace std::chrono_literals;
    engine::FixedStepClock clock{10ms, 100ms, 8};

    const auto first = clock.advance(6ms);
    require(first.step_count == 0, "partial step must remain accumulated");

    const auto second = clock.advance(6ms);
    require(second.step_count == 1, "accumulated time must produce one step");
    require(clock.tick() == 1, "tick must count selected fixed steps");
    require(clock.accumulator() == 2ms, "clock must retain fractional time");
}

void fixed_step_bounds_catch_up() {
    using namespace std::chrono_literals;
    engine::FixedStepClock clock{10ms, 100ms, 3};
    const auto batch = clock.advance(200ms);

    require(batch.accepted_frame_time == 100ms, "frame time must be clamped");
    require(batch.step_count == 3, "catch-up work must obey the step budget");
    require(batch.dropped_time == 170ms, "all discarded time must be reported");
    require(batch.interpolation_alpha >= 0.0 && batch.interpolation_alpha < 1.0,
            "interpolation alpha must remain normalized");
}

void logger_filters_and_routes() {
    auto& logger = engine::Logger::instance();
    logger.clear_sinks();
    const auto sink = std::make_shared<RecordingSink>();
    logger.add_sink(sink);
    logger.set_minimum_level(engine::LogLevel::warning);

    logger.log(engine::LogLevel::info, "test", "hidden");
    logger.log(engine::LogLevel::error, "test", "visible");

    require(sink->records.size() == 1, "logger must filter below its minimum level");
    require(sink->records.front().message == "visible", "logger must preserve messages");
}

} // namespace

int main() {
    try {
        uuid_round_trip();
        seeded_random_matches_aether();
        fixed_step_accumulates_time();
        fixed_step_bounds_catch_up();
        logger_filters_and_routes();
    } catch (const std::exception& error) {
        std::cerr << "FAILED: " << error.what() << '\n';
        return 1;
    }

    std::cout << "All engine core tests passed.\n";
    return 0;
}
