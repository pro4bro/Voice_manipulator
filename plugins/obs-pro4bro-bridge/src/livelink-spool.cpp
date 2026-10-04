#include "livelink-spool.h"

#include <winsqlite/winsqlite3.h>

#include <cstring>
#include <chrono>
#include <limits>

namespace {
constexpr const char *CREATE_CHUNKS =
	"CREATE TABLE IF NOT EXISTS chunks ("
	"id INTEGER PRIMARY KEY, recording_id TEXT NOT NULL, channel_id TEXT NOT NULL, "
	"sequence INTEGER NOT NULL, source_uuid TEXT NOT NULL, first_sample_index INTEGER NOT NULL, "
	"obs_timestamp_ns INTEGER NOT NULL, plugin_monotonic_ns INTEGER NOT NULL, "
	"frames INTEGER NOT NULL, sample_rate INTEGER NOT NULL, channels INTEGER NOT NULL, "
	"pcm BLOB NOT NULL, rejected_status INTEGER, "
	"UNIQUE(recording_id, channel_id, sequence))";

bool bind_text(sqlite3_stmt *stmt, int index, const std::string &value)
{
	return sqlite3_bind_text(stmt, index, value.c_str(), static_cast<int>(value.size()), SQLITE_TRANSIENT) == SQLITE_OK;
}
}

LiveLinkSpool::LiveLinkSpool(const std::filesystem::path &path)
{
	std::error_code ec;
	std::filesystem::create_directories(path.parent_path(), ec);
	if (ec) { error_ = "Cannot create spool directory: " + ec.message(); return; }
	if (sqlite3_open16(path.wstring().c_str(), &db_) != SQLITE_OK) {
		fail("open");
		if (db_) sqlite3_close(db_);
		db_ = nullptr;
		return;
	}
	// Recovery UI may briefly hold a scoped write transaction. Audio callbacks
	// never enter this worker-side database wait.
	sqlite3_busy_timeout(db_, 2000);
	if (!exec("PRAGMA journal_mode=WAL") || !exec("PRAGMA synchronous=FULL") ||
		!exec(CREATE_CHUNKS) ||
		!exec("CREATE INDEX IF NOT EXISTS chunks_pending ON chunks(rejected_status, id)") ||
		!exec("UPDATE chunks SET rejected_status=NULL WHERE rejected_status=409")) {
		sqlite3_close(db_);
		db_ = nullptr;
	}
	if (db_) {
		// Legacy rows have no trustworthy wall clock, including after reboot.
		sqlite3_stmt *columns = nullptr;
		bool found = false;
		bool ok = sqlite3_prepare_v2(db_, "PRAGMA table_info(chunks)", -1, &columns, nullptr) == SQLITE_OK;
		int step = SQLITE_ERROR;
		if (ok) while ((step = sqlite3_step(columns)) == SQLITE_ROW) {
			const auto *name = sqlite3_column_text(columns, 1);
			if (name && std::strcmp(reinterpret_cast<const char *>(name), "enqueued_wall_ms") == 0) found = true;
		}
		ok = ok && step == SQLITE_DONE;
		if (columns) sqlite3_finalize(columns);
		if (!ok) fail("inspect spool schema");
		if (!ok || (!found && !exec("ALTER TABLE chunks ADD COLUMN enqueued_wall_ms INTEGER"))) {
			sqlite3_close(db_);
			db_ = nullptr;
		}
	}
}

LiveLinkSpool::~LiveLinkSpool()
{
	std::lock_guard lock(mutex_);
	if (db_) sqlite3_close(db_);
}

void LiveLinkSpool::fail(const char *action)
{
	error_ = std::string(action) + ": " + (db_ ? sqlite3_errmsg(db_) : "SQLite unavailable");
}

bool LiveLinkSpool::exec(const char *sql)
{
	if (sqlite3_exec(db_, sql, nullptr, nullptr, nullptr) == SQLITE_OK) return true;
	fail(sql);
	return false;
}

std::string LiveLinkSpool::error() const
{
	std::lock_guard lock(mutex_);
	return error_;
}

LiveLinkSpoolHealth LiveLinkSpool::health()
{
	std::lock_guard lock(mutex_);
	LiveLinkSpoolHealth result;
	if (db_) {
		sqlite3_stmt *stmt = nullptr;
		// Only metadata is read; PCM BLOBs stay on disk.
		const char *sql = "SELECT count(*), coalesce(sum(rejected_status IS NOT NULL),0), "
			"min(enqueued_wall_ms), count(enqueued_wall_ms) FROM chunks";
		if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) == SQLITE_OK && sqlite3_step(stmt) == SQLITE_ROW) {
			result.readable = true;
			result.retained = static_cast<uint64_t>(sqlite3_column_int64(stmt, 0));
			result.rejected = static_cast<uint64_t>(sqlite3_column_int64(stmt, 1));
			if (result.retained && static_cast<uint64_t>(sqlite3_column_int64(stmt, 3)) == result.retained)
				result.oldest_retained_wall_ms = sqlite3_column_int64(stmt, 2);
		} else fail("spool health");
		if (stmt) sqlite3_finalize(stmt);
	}
	result.last_error = error_;
	return result;
}

bool LiveLinkSpool::append(const std::vector<LiveLinkAudioChunk> &chunks)
{
	if (chunks.empty()) return true;
	std::lock_guard lock(mutex_);
	if (!db_ || !exec("BEGIN IMMEDIATE")) return false;
	sqlite3_stmt *stmt = nullptr;
	constexpr const char *sql = "INSERT INTO chunks (recording_id, channel_id, sequence, source_uuid, "
		"first_sample_index, obs_timestamp_ns, plugin_monotonic_ns, frames, sample_rate, channels, pcm, enqueued_wall_ms) "
		"VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
	const auto wall_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
		std::chrono::system_clock::now().time_since_epoch()).count();
	bool ok = sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) == SQLITE_OK;
	for (const auto &chunk : chunks) {
		if (!ok) break;
		const size_t bytes = chunk.pcm.size() * sizeof(int16_t);
		if (chunk.frames == 0 || chunk.channels == 0 ||
			chunk.pcm.size() != static_cast<size_t>(chunk.frames) * chunk.channels ||
			bytes > static_cast<size_t>(std::numeric_limits<int>::max())) { error_ = "Invalid PCM chunk"; ok = false; break; }
		ok = bind_text(stmt, 1, chunk.recording_id) && bind_text(stmt, 2, chunk.channel_id) &&
			sqlite3_bind_int64(stmt, 3, static_cast<sqlite3_int64>(chunk.sequence)) == SQLITE_OK &&
			bind_text(stmt, 4, chunk.source_uuid) &&
			sqlite3_bind_int64(stmt, 5, static_cast<sqlite3_int64>(chunk.first_sample_index)) == SQLITE_OK &&
			sqlite3_bind_int64(stmt, 6, static_cast<sqlite3_int64>(chunk.obs_timestamp_ns)) == SQLITE_OK &&
			sqlite3_bind_int64(stmt, 7, static_cast<sqlite3_int64>(chunk.plugin_monotonic_ns)) == SQLITE_OK &&
			sqlite3_bind_int64(stmt, 8, chunk.frames) == SQLITE_OK &&
			sqlite3_bind_int64(stmt, 9, chunk.sample_rate) == SQLITE_OK &&
			sqlite3_bind_int64(stmt, 10, chunk.channels) == SQLITE_OK &&
			sqlite3_bind_blob(stmt, 11, chunk.pcm.data(), static_cast<int>(bytes), SQLITE_TRANSIENT) == SQLITE_OK &&
			sqlite3_bind_int64(stmt, 12, wall_ms) == SQLITE_OK &&
			sqlite3_step(stmt) == SQLITE_DONE;
		if (!ok) fail("append");
		sqlite3_reset(stmt);
		sqlite3_clear_bindings(stmt);
	}
	if (stmt) sqlite3_finalize(stmt);
	if (ok) ok = exec("COMMIT");
	if (!ok) sqlite3_exec(db_, "ROLLBACK", nullptr, nullptr, nullptr);
	return ok;
}

std::optional<LiveLinkSpoolEntry> LiveLinkSpool::oldest(int64_t after_id)
{
	std::lock_guard lock(mutex_);
	if (!db_) return std::nullopt;
	sqlite3_stmt *stmt = nullptr;
	constexpr const char *sql = "SELECT id, recording_id, channel_id, sequence, source_uuid, "
		"first_sample_index, obs_timestamp_ns, plugin_monotonic_ns, frames, sample_rate, channels, pcm "
		"FROM chunks WHERE rejected_status IS NULL AND id>? ORDER BY id LIMIT 1";
	if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) != SQLITE_OK) { fail("read"); return std::nullopt; }
	sqlite3_bind_int64(stmt, 1, after_id);
	std::optional<LiveLinkSpoolEntry> result;
	if (sqlite3_step(stmt) == SQLITE_ROW) {
		LiveLinkSpoolEntry entry;
		entry.id = sqlite3_column_int64(stmt, 0);
		auto string_at = [stmt](int index) {
			const auto *value = sqlite3_column_text(stmt, index);
			return value ? std::string(reinterpret_cast<const char *>(value)) : std::string();
		};
		auto &chunk = entry.chunk;
		chunk.recording_id = string_at(1);
		chunk.channel_id = string_at(2);
		chunk.sequence = static_cast<uint64_t>(sqlite3_column_int64(stmt, 3));
		chunk.source_uuid = string_at(4);
		chunk.first_sample_index = static_cast<uint64_t>(sqlite3_column_int64(stmt, 5));
		chunk.obs_timestamp_ns = static_cast<uint64_t>(sqlite3_column_int64(stmt, 6));
		chunk.plugin_monotonic_ns = static_cast<uint64_t>(sqlite3_column_int64(stmt, 7));
		chunk.frames = static_cast<uint32_t>(sqlite3_column_int64(stmt, 8));
		chunk.sample_rate = static_cast<uint32_t>(sqlite3_column_int64(stmt, 9));
		chunk.channels = static_cast<uint32_t>(sqlite3_column_int64(stmt, 10));
		const int bytes = sqlite3_column_bytes(stmt, 11);
		if (chunk.frames > 0 && chunk.channels > 0 &&
			bytes == static_cast<int64_t>(chunk.frames) * chunk.channels * sizeof(int16_t)) {
			chunk.pcm.resize(static_cast<size_t>(bytes) / sizeof(int16_t));
			std::memcpy(chunk.pcm.data(), sqlite3_column_blob(stmt, 11), bytes);
			result = std::move(entry);
		} else error_ = "Stored PCM length does not match its frame count";
	}
	sqlite3_finalize(stmt);
	return result;
}

bool LiveLinkSpool::acknowledge(int64_t id)
{
	return acknowledge(std::vector<int64_t>{id});
}

bool LiveLinkSpool::acknowledge(const std::vector<int64_t> &ids)
{
	if (ids.empty()) return true;
	std::lock_guard lock(mutex_);
	if (!db_ || !exec("BEGIN IMMEDIATE")) return false;
	sqlite3_stmt *stmt = nullptr;
	bool ok = sqlite3_prepare_v2(db_, "DELETE FROM chunks WHERE id=?", -1, &stmt, nullptr) == SQLITE_OK;
	for (const auto id : ids) {
		if (!ok) break;
		ok = sqlite3_bind_int64(stmt, 1, id) == SQLITE_OK &&
			sqlite3_step(stmt) == SQLITE_DONE && sqlite3_changes(db_) == 1;
		if (!ok) fail("ack");
		sqlite3_reset(stmt);
	}
	if (stmt) sqlite3_finalize(stmt);
	if (ok) ok = exec("COMMIT");
	if (!ok) sqlite3_exec(db_, "ROLLBACK", nullptr, nullptr, nullptr);
	return ok;
}

bool LiveLinkSpool::clip_to_stop(int64_t id, uint32_t frames)
{
	std::lock_guard lock(mutex_);
	if (!db_) return false;
	sqlite3_stmt *stmt = nullptr;
	const char *sql = frames ?
		"UPDATE chunks SET frames=?, pcm=substr(pcm,1,?*channels*2), rejected_status=NULL "
		"WHERE id=? AND frames>?" : "DELETE FROM chunks WHERE id=?";
	if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) != SQLITE_OK) { fail("clip"); return false; }
	if (frames) {
		sqlite3_bind_int64(stmt, 1, frames);
		sqlite3_bind_int64(stmt, 2, frames);
		sqlite3_bind_int64(stmt, 3, id);
		sqlite3_bind_int64(stmt, 4, frames);
	} else sqlite3_bind_int64(stmt, 1, id);
	const bool ok = sqlite3_step(stmt) == SQLITE_DONE && sqlite3_changes(db_) == 1;
	if (!ok) fail("clip");
	sqlite3_finalize(stmt);
	return ok;
}

bool LiveLinkSpool::reject(int64_t id, int status)
{
	std::lock_guard lock(mutex_);
	if (!db_) return false;
	sqlite3_stmt *stmt = nullptr;
	if (sqlite3_prepare_v2(db_, "UPDATE chunks SET rejected_status=? WHERE id=?", -1, &stmt, nullptr) != SQLITE_OK) { fail("reject"); return false; }
	sqlite3_bind_int(stmt, 1, status);
	sqlite3_bind_int64(stmt, 2, id);
	const bool ok = sqlite3_step(stmt) == SQLITE_DONE;
	if (!ok) fail("reject");
	sqlite3_finalize(stmt);
	return ok;
}

uint64_t LiveLinkSpool::pending(const std::string &recording_id)
{
	std::lock_guard lock(mutex_);
	if (!db_) return 0;
	sqlite3_stmt *stmt = nullptr;
	const char *sql = recording_id.empty() ? "SELECT count(*) FROM chunks" :
		"SELECT count(*) FROM chunks WHERE recording_id=?";
	if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) != SQLITE_OK) { fail("count"); return 0; }
	if (!recording_id.empty()) bind_text(stmt, 1, recording_id);
	const uint64_t count = sqlite3_step(stmt) == SQLITE_ROW ?
		static_cast<uint64_t>(sqlite3_column_int64(stmt, 0)) : 0;
	sqlite3_finalize(stmt);
	return count;
}

std::vector<std::string> LiveLinkSpool::recordings()
{
	std::lock_guard lock(mutex_);
	std::vector<std::string> ids;
	if (!db_) return ids;
	sqlite3_stmt *stmt = nullptr;
	if (sqlite3_prepare_v2(db_, "SELECT DISTINCT recording_id FROM chunks ORDER BY id", -1, &stmt, nullptr) != SQLITE_OK) {
		fail("recordings");
		return ids;
	}
	while (sqlite3_step(stmt) == SQLITE_ROW) {
		const auto *value = sqlite3_column_text(stmt, 0);
		if (value) ids.emplace_back(reinterpret_cast<const char *>(value));
	}
	sqlite3_finalize(stmt);
	return ids;
}
