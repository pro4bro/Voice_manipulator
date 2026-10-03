#pragma once

#include "livelink-capture.h"

#include <cstdint>
#include <filesystem>
#include <mutex>
#include <optional>
#include <string>
#include <vector>

struct sqlite3;

struct LiveLinkSpoolEntry {
	int64_t id{};
	LiveLinkAudioChunk chunk;
};

struct LiveLinkSpoolHealth {
	bool readable{};
	uint64_t retained{}, rejected{};
	std::optional<int64_t> oldest_retained_wall_ms;
	std::string last_error;
};

// Machine-local outbox. A chunk stays here until the API acknowledges its durable write.
class LiveLinkSpool {
public:
	explicit LiveLinkSpool(const std::filesystem::path &path);
	~LiveLinkSpool();
	LiveLinkSpool(const LiveLinkSpool &) = delete;
	LiveLinkSpool &operator=(const LiveLinkSpool &) = delete;
	bool ready() const { return db_ != nullptr; }
	bool append(const std::vector<LiveLinkAudioChunk> &chunks);
	std::optional<LiveLinkSpoolEntry> oldest(int64_t after_id = 0);
	bool acknowledge(int64_t id);
	bool acknowledge(const std::vector<int64_t> &ids);
	bool clip_to_stop(int64_t id, uint32_t frames);
	bool reject(int64_t id, int status);
	uint64_t pending(const std::string &recording_id = {});
	std::vector<std::string> recordings();
	std::string error() const;
	LiveLinkSpoolHealth health();

private:
	friend struct LiveLinkSpoolTestAccess;
	bool exec(const char *sql);
	void fail(const char *action);
	mutable std::mutex mutex_;
	sqlite3 *db_{};
	std::string error_;
};
