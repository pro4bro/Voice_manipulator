#include "../src/livelink-capture.h"
#include "../src/livelink-spool.h"
#include "../src/livelink-presence.h"

#include <array>
#include <chrono>
#include <filesystem>
#include <iostream>
#include <stdexcept>
#include <thread>
#include <windows.h>

#define CHECK(condition) do { if (!(condition)) { std::cerr << #condition << '\n'; throw std::runtime_error(#condition); } } while (false)

struct LiveLinkCaptureTestAccess {
	static void add_track(LiveLinkCapture &capture, const std::string &id)
	{
		auto track = std::make_unique<LiveLinkCapture::Track>();
		track->owner = &capture;
		track->channel_id = id;
		track->sample_rate = 48000;
		track->channels = 2;
		track->forward.store(true);
		std::lock_guard lock(capture.mutex_);
		capture.tracks_.emplace(id, std::move(track));
	}

	static void capture_packet(LiveLinkCapture &capture, const std::string &id, bool muted = false)
	{
		std::array<float, 480> left{}, right{};
		left.fill(0.5f);
		right.fill(-0.5f);
		audio_data audio{};
		audio.frames = 480;
		audio.data[0] = reinterpret_cast<uint8_t *>(left.data());
		audio.data[1] = reinterpret_cast<uint8_t *>(right.data());
		capture.on_audio(*capture.tracks_.at(id), &audio, muted);
	}

	static void skip_samples(LiveLinkCapture &capture, const std::string &id, uint64_t count)
	{
		capture.tracks_.at(id)->next_sample_index.fetch_add(count);
	}

	static std::mutex &mutex(LiveLinkCapture &capture) { return capture.mutex_; }
	static void timestamp_last(LiveLinkCapture &capture, const std::string &id, uint64_t ns)
	{
		auto &packet = capture.tracks_.at(id)->queue.back();
		packet.plugin_monotonic_ns = packet.obs_timestamp_ns = ns;
	}
};

int main()
{
	CHECK(obs_startup("en-US", nullptr, nullptr));
	struct ObsShutdown { ~ObsShutdown() { obs_shutdown(); } } shutdown;
	LiveLinkPresence presence;
	MixerRow first;
	first.channel_id = "channel-1";
	first.uuid = "uuid-1";
	CHECK(presence.observe({first}).empty());
	MixerRow added = first;
	added.channel_id = "channel-2";
	added.uuid = "uuid-2";
	CHECK(presence.observe({first, added}).empty());
	added.missing = true;
	auto vanished = presence.observe({first, added});
	CHECK(vanished.size() == 1 && vanished[0].channel_id == "channel-2" && vanished[0].missing);
	CHECK(presence.observe({first, added}).empty());
	added.missing = false;
	auto restored = presence.observe({first, added});
	CHECK(restored.size() == 1 && restored[0].uuid == "uuid-2" && !restored[0].missing);
	added.alias = "new alias";
	added.muted = true;
	CHECK(presence.observe({first, added}).empty());
	added.uuid = "replacement-uuid";
	added.missing = true;
	CHECK(presence.observe({first, added}).empty());
	// A muted OBS mixer still exposes raw source PCM to a forwarded LiveLink track.
	LiveLinkCapture muted_source;
	muted_source.set_recording("muted-source", 1, false, 0);
	LiveLinkCaptureTestAccess::add_track(muted_source, "channel-1");
	for (int packet = 0; packet < 100; ++packet)
		LiveLinkCaptureTestAccess::capture_packet(muted_source, "channel-1", true);
	auto raw_chunk = muted_source.take();
	CHECK(raw_chunk && raw_chunk->frames == 48000);
	CHECK(raw_chunk->pcm[0] > 0 && raw_chunk->pcm[1] < 0);

	// Slow durable HTTP receipts can leave more than one second in each queue.
	// Drain two seconds per source without waiting for more callbacks. This
	// halves fixed per-upload flush work for an existing backlog, preserving
	// the source's sample order and the other track's turn.
	LiveLinkCapture backlog;
	backlog.set_recording("backlog", 1, false, 0);
	for (int channel = 1; channel <= 2; ++channel)
		LiveLinkCaptureTestAccess::add_track(backlog, "channel-" + std::to_string(channel));
	for (int packet = 0; packet < 400; ++packet)
		for (int channel = 1; channel <= 2; ++channel)
			LiveLinkCaptureTestAccess::capture_packet(backlog, "channel-" + std::to_string(channel));
	std::array<int, 2> backlog_chunks{};
	while (auto chunk = backlog.take()) {
		const int index = chunk->channel_id.back() - '1';
		CHECK(chunk->frames == 96000);
		CHECK(chunk->sequence == static_cast<uint64_t>(backlog_chunks[index]));
		CHECK(chunk->first_sample_index == static_cast<uint64_t>(backlog_chunks[index]) * 96000);
		CHECK(chunk->pcm.size() == 192000);
		++backlog_chunks[index];
	}
	CHECK(backlog_chunks[0] == 2 && backlog_chunks[1] == 2);

	// A partial chunk is delivered now, without waiting for the larger ceiling.
	LiveLinkCapture immediate;
	immediate.set_recording("immediate", 1, false, 0);
	LiveLinkCaptureTestAccess::add_track(immediate, "channel-1");
	LiveLinkCaptureTestAccess::capture_packet(immediate, "channel-1");
	auto prefix = immediate.take();
	CHECK(prefix && prefix->frames == 480 && !immediate.take());

	// Removing a source while its callbacks await durable spooling must retain
	// the complete prefix, including the last partial chunk.
	LiveLinkCapture missing_source;
	missing_source.set_recording("missing-source", 1, false, 0);
	LiveLinkCaptureTestAccess::add_track(missing_source, "channel-1");
	for (int packet = 0; packet < 225; ++packet)
		LiveLinkCaptureTestAccess::capture_packet(missing_source, "channel-1");
	missing_source.sync({});
	auto retained = missing_source.take(), retained_tail = missing_source.take();
	CHECK(retained && retained->frames == 96000 && retained->first_sample_index == 0);
	CHECK(retained_tail && retained_tail->frames == 12000 && retained_tail->first_sample_index == 96000);
	CHECK(retained_tail->sequence == 1 && !missing_source.take());
	CHECK(missing_source.source_boundary("channel-1").sample_index == 108000);
	// A restored callback uses retained counters, not a second sequence zero.
	LiveLinkCaptureTestAccess::capture_packet(missing_source, "channel-1");
	auto resumed = missing_source.take();
	CHECK(resumed && resumed->sequence == 2 && resumed->first_sample_index == 108000);
	CHECK(resumed->frames == 480 && !missing_source.take());

	// A larger backlog must stop at the exact boundary inside a callback packet.
	LiveLinkCapture stopped;
	stopped.set_recording("stopped", 1'000'000'000ULL, false, 0);
	LiveLinkCaptureTestAccess::add_track(stopped, "channel-1");
	for (int packet = 0; packet < 300; ++packet) {
		LiveLinkCaptureTestAccess::capture_packet(stopped, "channel-1");
		LiveLinkCaptureTestAccess::timestamp_last(stopped, "channel-1",
			1'000'000'000ULL + packet * 10'000'000ULL);
	}
	stopped.finish_at(3'255'000'000ULL);
	auto full = stopped.take(), tail = stopped.take();
	CHECK(full && full->frames == 96000 && full->first_sample_index == 0);
	CHECK(tail && tail->frames == 12240 && tail->first_sample_index == 96000);
	CHECK(tail->sequence == 1 && !stopped.take());

	// Eight seconds of four stereo sources waited behind HTTP. The old two-second
	// source queue discarded roughly six seconds per channel in this case.
	LiveLinkCapture capture;
	capture.set_recording("recording", 1, false, 0);
	for (int channel = 1; channel <= 4; ++channel)
		LiveLinkCaptureTestAccess::add_track(capture, "channel-" + std::to_string(channel));
	for (int packet = 0; packet < 800; ++packet)
		for (int channel = 1; channel <= 4; ++channel)
			LiveLinkCaptureTestAccess::capture_packet(capture, "channel-" + std::to_string(channel));
	for (const auto &status : capture.queue_status()) {
		CHECK(status.queued_frames == 8 * 48000);
		CHECK(status.overflow_frames == 0);
	}
	std::array<int, 4> chunks{};
	while (auto chunk = capture.take()) {
		const int index = chunk->channel_id.back() - '1';
		CHECK(index >= 0 && index < 4);
		CHECK(chunk->sequence == static_cast<uint64_t>(chunks[index]));
		CHECK(chunk->first_sample_index == static_cast<uint64_t>(chunks[index]) * 96000);
		CHECK(chunk->frames == 96000);
		CHECK(chunk->pcm.size() == 2 * 96000);
		++chunks[index];
	}
	for (int count : chunks) CHECK(count == 4);

	// A missing callback interval must split chunks so the API sees the actual
	// first-sample jump instead of silently concatenating audio across it.
	LiveLinkCapture split;
	split.set_recording("split", 1, false, 0);
	LiveLinkCaptureTestAccess::add_track(split, "channel-1");
	for (int packet = 0; packet < 100; ++packet) {
		if (packet == 50) LiveLinkCaptureTestAccess::skip_samples(split, "channel-1", 480);
		LiveLinkCaptureTestAccess::capture_packet(split, "channel-1");
	}
	auto before = split.take(), after = split.take();
	CHECK(before && after && !split.take());
	CHECK(before->first_sample_index == 0 && before->frames == 24000);
	CHECK(after->first_sample_index == 24480 && after->frames == 24000);

	// Contention must wait briefly for the queue lock, rather than discard PCM.
	std::atomic<bool> held = false;
	std::thread holder([&] {
		std::lock_guard lock(LiveLinkCaptureTestAccess::mutex(split));
		held.store(true);
		std::this_thread::sleep_for(std::chrono::milliseconds(30));
	});
	while (!held.load()) std::this_thread::yield();
	LiveLinkCaptureTestAccess::capture_packet(split, "channel-1");
	holder.join();
	auto contended = split.take();
	CHECK(contended && contended->first_sample_index == 48480 && contended->frames == 480);
	CHECK(split.queue_status()[0].max_callback_wait_ns >= 10'000'000);

	// The API may be unavailable longer than the 120-second memory bound. A
	// separate drain into SQLite must retain every source without any HTTP ACK.
	const auto folder = std::filesystem::temp_directory_path() /
		("pro4bro-capture-spool-" + std::to_string(GetCurrentProcessId()));
	std::filesystem::create_directories(folder);
	LiveLinkCapture stalled;
	stalled.set_recording("stalled", 1, false, 0);
	for (int channel = 1; channel <= 4; ++channel)
		LiveLinkCaptureTestAccess::add_track(stalled, "channel-" + std::to_string(channel));
	{
		LiveLinkSpool spool(folder / "outbox.sqlite3");
		CHECK(spool.ready());
		for (int second = 0; second < 125; ++second) {
			for (int packet = 0; packet < 100; ++packet)
				for (int channel = 1; channel <= 4; ++channel)
					LiveLinkCaptureTestAccess::capture_packet(stalled, "channel-" + std::to_string(channel));
			std::vector<LiveLinkAudioChunk> batch;
			while (auto chunk = stalled.take()) batch.push_back(std::move(*chunk));
			CHECK(batch.size() == 4);
			CHECK(spool.append(batch));
		}
		CHECK(spool.pending("stalled") == 500);
		for (const auto &status : stalled.queue_status()) CHECK(status.overflow_frames == 0);
	}
	{
		LiveLinkSpool recovered(folder / "outbox.sqlite3");
		CHECK(recovered.ready() && recovered.pending("stalled") == 500);
		for (int index = 0; index < 500; ++index) {
			auto entry = recovered.oldest();
			CHECK(entry && entry->chunk.sequence == static_cast<uint64_t>(index / 4));
			CHECK(entry->chunk.first_sample_index == static_cast<uint64_t>(index / 4) * 48000);
			CHECK(recovered.acknowledge(entry->id));
		}
		CHECK(recovered.pending() == 0);
	}
	std::filesystem::remove_all(folder);
}
