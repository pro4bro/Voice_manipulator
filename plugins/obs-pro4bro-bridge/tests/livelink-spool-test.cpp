#include "../src/livelink-spool.h"

#include <windows.h>
#include <winsqlite/winsqlite3.h>

#include <filesystem>
#include <cstring>
#include <stdexcept>
#include <string>

#define CHECK(condition) do { if (!(condition)) throw std::runtime_error(#condition); } while (false)

struct LiveLinkSpoolTestAccess {
	static void limit_capacity(LiveLinkSpool &spool) {
		CHECK(sqlite3_exec(spool.db_, "PRAGMA max_page_count=4", nullptr, nullptr, nullptr) == SQLITE_OK);
	}
};

int main()
{
	const auto folder = std::filesystem::temp_directory_path() /
		("pro4bro-spool-test-" + std::to_string(GetCurrentProcessId()));
	std::filesystem::create_directories(folder);
	const auto path = folder / "outbox.sqlite3";
	LiveLinkAudioChunk first;
	first.recording_id = "recording-a";
	first.channel_id = "channel-1";
	first.source_uuid = "source-1";
	first.sequence = 0;
	first.first_sample_index = 480;
	first.obs_timestamp_ns = 42;
	first.plugin_monotonic_ns = 55;
	first.frames = 2;
	first.sample_rate = 48000;
	first.channels = 2;
	first.pcm = {1, -2, 3, -4};
	LiveLinkAudioChunk second = first;
	second.sequence = 1;
	second.first_sample_index = 482;
	second.pcm = {5, -6, 7, -8};
	{
		LiveLinkSpool spool(path);
		CHECK(spool.ready());
		CHECK(spool.append({first, second}));
		CHECK(spool.pending() == 2);
		const auto health = spool.health();
		CHECK(health.readable && health.retained == 2 && health.rejected == 0);
		CHECK(health.oldest_retained_wall_ms && *health.oldest_retained_wall_ms > 0);
		CHECK(spool.pending(first.recording_id) == 2);
		auto entry = spool.oldest();
		CHECK(entry && entry->chunk.pcm == first.pcm);
		CHECK(entry->chunk.first_sample_index == 480);
	}
	{
		LiveLinkSpool recovered(path);
		CHECK(recovered.ready());
		CHECK(recovered.pending() == 2);
		auto entry = recovered.oldest();
		CHECK(entry && entry->chunk.sequence == 0);
		CHECK(recovered.acknowledge(entry->id));
		entry = recovered.oldest();
		CHECK(entry && entry->chunk.sequence == 1 && entry->chunk.pcm == second.pcm);
		CHECK(recovered.reject(entry->id, 409));
		CHECK(!recovered.oldest());
		CHECK(recovered.pending() == 1); // rejected PCM remains available for repair
	}
	{
		LiveLinkSpool recovered(path);
		CHECK(recovered.ready());
		auto entry = recovered.oldest(); // 0.6.4 stop-boundary rows are retried
		CHECK(entry && entry->chunk.sequence == 1);
		CHECK(recovered.clip_to_stop(entry->id, 1));
		entry = recovered.oldest();
		CHECK(entry && entry->chunk.frames == 1 && entry->chunk.pcm == std::vector<int16_t>({5, -6}));
		CHECK(recovered.acknowledge(entry->id));
		CHECK(recovered.pending() == 0);
	}
	// Pending ACKs must retain PCM across process death. Reading later rows
	// must not consume or erase the older row before a batch commits.
	std::vector<int64_t> ids;
	{
		LiveLinkSpool spool(path);
		CHECK(spool.append({first, second}));
		auto one = spool.oldest();
		CHECK(one);
		auto two = spool.oldest(one->id);
		CHECK(one && two && two->chunk.sequence == 1);
		CHECK(spool.oldest()->id == one->id);
		CHECK(spool.pending() == 2);
		ids = {one->id, two->id};
	}
	{
		LiveLinkSpool recovered(path);
		CHECK(recovered.pending() == 2);
		CHECK(recovered.oldest()->chunk.pcm == first.pcm);
		// A missing ID rolls the entire batch back, including its first delete.
		CHECK(!recovered.acknowledge(std::vector<int64_t>{ids[0], ids[1] + 1}));
		CHECK(recovered.pending() == 2);
		CHECK(recovered.acknowledge(ids));
		CHECK(recovered.pending() == 0);
	}
	{
		LiveLinkSpool recovered(path);
		CHECK(recovered.pending() == 0);
		CHECK(recovered.acknowledge(std::vector<int64_t>{}));
		CHECK(recovered.append({first, second}));
		auto one = recovered.oldest();
		CHECK(one && recovered.reject(one->id, 422));
		auto two = recovered.oldest(one->id);
		CHECK(two && two->chunk.sequence == 1);
		CHECK(recovered.acknowledge(std::vector<int64_t>{two->id}));
		CHECK(recovered.pending() == 1); // unrelated rejected PCM is retained
		const auto health = recovered.health();
		CHECK(health.readable && health.retained == 1 && health.rejected == 1);
		CHECK(health.oldest_retained_wall_ms);
		CHECK(!recovered.oldest());
	}
	// Backward-compatible migration keeps legacy bytes and reports unknown age.
	{
		sqlite3 *db = nullptr;
		CHECK(sqlite3_open16(path.wstring().c_str(), &db) == SQLITE_OK);
		CHECK(sqlite3_exec(db, "ALTER TABLE chunks DROP COLUMN enqueued_wall_ms", nullptr, nullptr, nullptr) == SQLITE_OK);
		sqlite3_close(db);
	}
	{
		LiveLinkSpool recovered(path);
		const auto health = recovered.health();
		CHECK(health.readable && health.retained == 1 && health.rejected == 1);
		CHECK(!health.oldest_retained_wall_ms);
	}
	{
		sqlite3 *db = nullptr;
		CHECK(sqlite3_open16(path.wstring().c_str(), &db) == SQLITE_OK);
		sqlite3_stmt *stmt = nullptr;
		CHECK(sqlite3_prepare_v2(db, "SELECT pcm FROM chunks WHERE rejected_status=422", -1, &stmt, nullptr) == SQLITE_OK);
		CHECK(sqlite3_step(stmt) == SQLITE_ROW);
		CHECK(sqlite3_column_bytes(stmt, 0) == first.pcm.size() * sizeof(int16_t));
		CHECK(std::memcmp(sqlite3_column_blob(stmt, 0), first.pcm.data(), first.pcm.size() * sizeof(int16_t)) == 0);
		sqlite3_finalize(stmt);
		sqlite3_close(db);
	}
	// A failed write retains the preceding PCM and makes the last failure visible.
	const auto full_path = folder / "capacity.sqlite3";
	{
		LiveLinkSpool spool(full_path);
		CHECK(spool.append({first}));
	}
	{
		LiveLinkSpool spool(full_path);
		CHECK(!spool.append({first})); // duplicate identity rolls back the transaction
		const auto health = spool.health();
		CHECK(health.readable && health.retained == 1 && !health.last_error.empty());
		CHECK(spool.oldest()->chunk.pcm == first.pcm);
		LiveLinkSpoolTestAccess::limit_capacity(spool);
		auto large = second;
		large.frames = 1024 * 1024;
		large.pcm.resize(static_cast<size_t>(large.frames) * large.channels, 11);
		CHECK(!spool.append({large}));
		CHECK(spool.health().last_error.find("full") != std::string::npos);
		CHECK(spool.health().retained == 1);
		CHECK(spool.oldest()->chunk.pcm == first.pcm);
	}
	{
		LiveLinkSpool unavailable(folder / "capacity.sqlite3" / "cannot-open.sqlite3");
		CHECK(!unavailable.health().readable);
		CHECK(!unavailable.health().last_error.empty());
	}
	std::filesystem::remove_all(folder);
}
