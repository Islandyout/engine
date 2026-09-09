#pragma once

#include "engine/core/types.hpp"

#include <chrono>
#include <memory>
#include <mutex>
#include <string>
#include <string_view>
#include <vector>

namespace engine {

enum class LogLevel : u8 {
    trace,
    debug,
    info,
    warning,
    error,
    critical,
};

struct LogRecord final {
    std::chrono::system_clock::time_point timestamp{};
    LogLevel level{LogLevel::info};
    std::string channel;
    std::string message;
};

class LogSink {
public:
    virtual ~LogSink() = default;
    virtual void write(const LogRecord& record) = 0;
};

class ConsoleLogSink final : public LogSink {
public:
    void write(const LogRecord& record) override;
};

class Logger final {
public:
    static Logger& instance();

    void add_sink(std::shared_ptr<LogSink> sink);
    void clear_sinks();
    void set_minimum_level(LogLevel level);
    [[nodiscard]] LogLevel minimum_level() const;

    void log(LogLevel level, std::string_view channel, std::string_view message);

private:
    Logger();

    mutable std::mutex mutex_;
    std::vector<std::shared_ptr<LogSink>> sinks_;
    LogLevel minimum_level_{LogLevel::info};
};

[[nodiscard]] std::string_view to_string(LogLevel level) noexcept;

} // namespace engine
