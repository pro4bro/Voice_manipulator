#include "../src/livelink-capture.h"
#include "../src/livelink-spool.h"

#include <array>
#include <chrono>
#include <filesystem>
#include <stdexcept>
#include <thread>
#include <windows.h>

#define CHECK(condition) do { if (!(condition)) throw std::runtime_error(#condition); } while (false)

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
};

int main()
{
	// A muted OBS mixer still exposes raw source PCM to a forwarded LiveLink track.
	LiveLinkCapture muted_source;
	muted_source.set_recording("muted-source", 1, false, 0);
	LiveLinkCaptureTestAccess::add_track(muted_source, "channel-1");
	for (int packet = 0; packet < 100; ++packet)
		LiveLinkCaptureTestAccess::capture_packet(muted_source, "channel-1", true);
	auto raw_chunk = muted_source.take();
	CHECK(raw_chunk && raw_chunk->frames == 48000);
	CHECK(raw_chunk->pcm[0] > 0 && raw_chunk->pcm[1] < 0);

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
		CHECK(chunk->first_sample_index == static_cast<uint64_t>(chunks[index]) * 48000);
		CHECK(chunk->frames == 48000);
		CHECK(chunk->pcm.size() == 2 * 48000);
		++chunks[index];
	}
	for (int count : chunks) CHECK(count == 8);

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
