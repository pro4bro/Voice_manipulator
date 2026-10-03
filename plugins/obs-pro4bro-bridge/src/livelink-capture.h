#pragma once

#include "livelink-mixer.h"

#include <obs.h>

#include <cstdint>
#include <atomic>
#include <deque>
#include <map>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <vector>

struct LiveLinkAudioChunk {
	std::string recording_id, channel_id, source_uuid;
	uint64_t sequence{}, first_sample_index{}, obs_timestamp_ns{}, plugin_monotonic_ns{};
	uint32_t frames{}, sample_rate{}, channels{};
	std::vector<int16_t> pcm;
};

struct LiveLinkQueueStatus {
	std::string channel_id;
	uint64_t queued_frames{}, peak_queued_frames{}, overflow_frames{}, max_callback_wait_ns{};
	uint32_t sample_rate{};
};

struct LiveLinkSourceBoundary {
	uint64_t monotonic_ns{}, sample_index{};
};

class LiveLinkCapture {
public:
	LiveLinkCapture() = default;
	~LiveLinkCapture();
	LiveLinkCapture(const LiveLinkCapture &) = delete;
	LiveLinkCapture &operator=(const LiveLinkCapture &) = delete;
	void sync(const std::vector<MixerRow> &rows);
	void set_recording(const std::string &id, uint64_t start_ns, bool paused, uint64_t boundary_ns);
	void finish_at(uint64_t end_ns);
	void pause_at(uint64_t at_ns);
	void resume_at(uint64_t at_ns);
	uint64_t set_forward(const std::string &channel_id, bool enabled);
	LiveLinkSourceBoundary source_boundary(const std::string &channel_id);
	std::optional<LiveLinkAudioChunk> take();
	std::vector<LiveLinkQueueStatus> queue_status();
	void stop();

private:
	friend struct LiveLinkCaptureTestAccess;
	struct Packet {
		uint64_t first_sample_index{}, obs_timestamp_ns{}, plugin_monotonic_ns{};
		uint32_t frames{}, sample_rate{}, channels{};
		bool forward{};
		std::vector<int16_t> pcm;
	};
	struct Track {
		LiveLinkCapture *owner{};
		obs_source_t *source{};
		std::string channel_id, source_uuid;
		std::atomic<uint64_t> next_sample_index{0};
		uint64_t next_sequence{}, queued_frames{}, peak_queued_frames{};
		uint64_t overflow_frames{}, max_callback_wait_ns{};
		uint32_t sample_rate{}, channels{};
		std::atomic<bool> forward{false};
		bool missing{};
		LiveLinkSourceBoundary presence_boundary;
		std::deque<Packet> queue;
	};
	std::mutex mutex_;
	std::mutex lifecycle_mutex_;
	std::map<std::string, std::unique_ptr<Track>> tracks_;
	std::string recording_id_;
	uint64_t recording_start_ns_{}, pause_boundary_ns_{};
	uint64_t recording_end_ns_{};
	uint64_t local_control_boundary_ns_{};
	bool paused_{};
	size_t queued_bytes_{};
	static void callback(void *opaque, obs_source_t *, const struct audio_data *audio, bool muted);
	void on_audio(Track &track, const struct audio_data *audio, bool muted);
	void detach(Track &track);
	void discard_front(Track &track, bool overflow = false);
};
