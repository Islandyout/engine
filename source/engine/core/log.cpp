#include "engine/core/log.hpp"

#include <iostream>

namespace engine {

std::string_view to_string(const LogLevel level) noexcept {
    switch (level) {
    case LogLevel::trace: return "TRACE";
    case LogLevel::debug: return "DEBUG";
    case LogLevel::info: return "INFO";
    case LogLevel::warning: return "WARN";
    case LogLevel::error: return "ERROR";
    case LogLevel::critical: return "CRITICAL";
    }
    return "UNKNOWN";
}

void ConsoleLogSink::write(const LogRecord& record) {
    std::ostream& output = record.level >= LogLevel::error ? std::cerr : std::cout;
    output << '[' << to_string(record.level) << "] [" << record.channel << "] "
           << record.message << '\n';
}

Logger& Logger::instance() {
    static Logger logger;
    return logger;
}

Logger::Logger() {
    sinks_.push_back(std::make_shared<ConsoleLogSink>());
}

void Logger::add_sink(std::shared_ptr<LogSink> sink) {
    if (!sink) {
        return;
    }
    std::lock_guard lock{mutex_};
    sinks_.push_back(std::move(sink));
}

void Logger::clear_sinks() {
    std::lock_guard lock{mutex_};
    sinks_.clear();
}

void Logger::set_minimum_level(const LogLevel level) {
    std::lock_guard lock{mutex_};
    minimum_level_ = level;
}

LogLevel Logger::minimum_level() const {
    std::lock_guard lock{mutex_};
    return minimum_level_;
}

void Logger::log(
    const LogLevel level,
    const std::string_view channel,
    const std::string_view message) {
    std::lock_guard lock{mutex_};
    if (level < minimum_level_) {
        return;
    }

    const LogRecord record{
        std::chrono::system_clock::now(),
        level,
        std::string{channel},
        std::string{message},
    };
    for (const auto& sink : sinks_) {
        sink->write(record);
    }
}

} // namespace engine
