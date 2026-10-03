#include "livelink-capture.h"

#include <obs-module.h>
#include <util/platform.h>

#include <algorithm>
#include <cmath>
#include <memory>

namespace {
constexpr uint64_t MAX_IDLE_SOURCE_NS = 10'000'000'000ULL;
constexpr uint64_t MAX_RECORDING_SOURCE_NS = 120'000'000'000ULL;
constexpr size_t MAX_CONNECTION_BYTES = 512 * 1024 * 1024;
// Consume an existing backlog in fewer durable uploads. take() still emits
// whatever is available immediately; it never waits to fill this ceiling.
// At eight PCM16 channels the absolute ceiling is 1,536,000 bytes, below
// the API's 3,072,000-byte limit, including at higher OBS sample rates.
constexpr uint32_t MAX_BATCH_FRAMES = 96'000;
constexpr uint32_t MAX_BATCH_SECONDS = 2;
}

LiveLinkCapture::~LiveLinkCapture() { stop(); }

void LiveLinkCapture::detach(Track &track)
{
	if (track.source) {
		obs_source_remove_audio_capture_callback(track.source, callback, &track);
		obs_source_release(track.source);
		track.source = nullptr;
	}
}

void LiveLinkCapture::stop()
{
	std::lock_guard lifecycle(lifecycle_mutex_);
	std::map<std::string, std::unique_ptr<Track>> removed;
	{
		std::lock_guard lock(mutex_);
		removed.swap(tracks_);
		recording_id_.clear();
	}
	// OBS waits for active callbacks here; never hold the callback's mutex.
	for (auto &[id, track] : removed) detach(*track);
	std::lock_guard lock(mutex_);
	for (auto &[id, track] : removed)
		while (!track->queue.empty()) discard_front(*track);
}

void LiveLinkCapture::discard_front(Track &track, bool overflow)
{
	if (track.queue.empty()) return;
	if (overflow) track.overflow_frames += track.queue.front().frames;
	queued_bytes_ -= track.queue.front().pcm.size() * sizeof(int16_t);
	track.queued_frames -= track.queue.front().frames;
	track.queue.pop_front();
}

void LiveLinkCapture::sync(const std::vector<MixerRow> &rows)
{
	std::lock_guard lifecycle(lifecycle_mutex_);
	std::vector<std::unique_ptr<Track>> removed;
	{
		std::lock_guard lock(mutex_);
		for (auto it = tracks_.begin(); it != tracks_.end();) {
			auto found = std::find_if(rows.begin(), rows.end(), [&](const MixerRow &row) {
				return !row.missing && row.channel_id == it->first && row.uuid == it->second->source_uuid;
			});
			if (found == rows.end()) {
				removed.push_back(std::move(it->second));
				it = tracks_.erase(it);
			} else {
				it->second->forward.store(found->forward);
				++it;
			}
		}
	}
	for (auto &track : removed) detach(*track);
	{
		std::lock_guard lock(mutex_);
		for (auto &track : removed)
			while (!track->queue.empty()) discard_front(*track);
	}
	obs_audio_info info{};
	if (!obs_get_audio_info(&info)) return;
	for (const auto &row : rows) {
		if (row.missing) continue;
		{
			std::lock_guard lock(mutex_);
			if (tracks_.count(row.channel_id)) continue;
		}
		obs_source_t *source = obs_get_source_by_uuid(row.uuid.c_str());
		if (!source || !(obs_source_get_output_flags(source) & OBS_SOURCE_AUDIO)) {
			if (source) obs_source_release(source);
			continue;
		}
		auto track = std::make_unique<Track>();
		track->owner = this;
		track->source = source;
		track->channel_id = row.channel_id;
		track->source_uuid = row.uuid;
		track->sample_rate = info.samples_per_sec;
		track->channels = std::clamp(get_audio_channels(info.speakers), 1u, 8u);
		track->forward.store(row.forward);
		Track *attached = track.get();
		{
			std::lock_guard lock(mutex_);
			tracks_.emplace(row.channel_id, std::move(track));
		}
		obs_source_add_audio_capture_callback(source, callback, attached);
	}
}

void LiveLinkCapture::callback(void *opaque, obs_source_t *, const struct audio_data *audio, bool muted)
{
	auto *track = static_cast<Track *>(opaque);
	track->owner->on_audio(*track, audio, muted);
}

void LiveLinkCapture::on_audio(Track &track, const struct audio_data *audio, bool muted)
{
	// Forward controls the isolated source capture. OBS mute only controls its mix;
	// the capture callback still supplies the source's raw samples.
	(void)muted;
	if (!audio || !audio->frames) return;
	Packet packet;
	packet.first_sample_index = track.next_sample_index.fetch_add(audio->frames);
	if (!track.forward.load(std::memory_order_relaxed)) return;
	packet.frames = audio->frames;
	packet.sample_rate = track.sample_rate;
	packet.channels = track.channels;
	packet.obs_timestamp_ns = audio->timestamp;
	packet.plugin_monotonic_ns = os_gettime_ns();
	packet.pcm.resize(static_cast<size_t>(packet.frames) * packet.channels);
	for (uint32_t frame = 0; frame < packet.frames; ++frame) {
		for (uint32_t channel = 0; channel < packet.channels; ++channel) {
			const float sample = !audio->data[channel] ? 0.0f :
				reinterpret_cast<const float *>(audio->data[channel])[frame];
			packet.pcm[static_cast<size_t>(frame) * packet.channels + channel] =
				static_cast<int16_t>(std::lrint(std::clamp(sample, -1.0f, 1.0f) * 32767.0f));
		}
	}
	const uint64_t waiting_since = os_gettime_ns();
	std::lock_guard lock(mutex_);
	track.max_callback_wait_ns = std::max(track.max_callback_wait_ns, os_gettime_ns() - waiting_since);
	packet.forward = track.forward.load(std::memory_order_relaxed);
	queued_bytes_ += packet.pcm.size() * sizeof(int16_t);
	track.queued_frames += packet.frames;
	track.peak_queued_frames = std::max(track.peak_queued_frames, track.queued_frames);
	track.queue.push_back(std::move(packet));
	const uint64_t source_limit = recording_id_.empty() ? MAX_IDLE_SOURCE_NS : MAX_RECORDING_SOURCE_NS;
	while (!track.queue.empty() &&
		track.queued_frames * 1'000'000'000ULL / track.sample_rate > source_limit)
		discard_front(track, true);
	while (queued_bytes_ > MAX_CONNECTION_BYTES) {
		Track *oldest = nullptr;
		for (auto &[id, candidate] : tracks_)
			if (!candidate->queue.empty() && (!oldest || candidate->queue.front().plugin_monotonic_ns <
				oldest->queue.front().plugin_monotonic_ns)) oldest = candidate.get();
		if (!oldest) break;
		discard_front(*oldest, true);
	}
}

std::vector<LiveLinkQueueStatus> LiveLinkCapture::queue_status()
{
	std::lock_guard lock(mutex_);
	std::vector<LiveLinkQueueStatus> result;
	for (const auto &[id, track] : tracks_)
		result.push_back({id, track->queued_frames, track->peak_queued_frames,
			track->overflow_frames, track->max_callback_wait_ns, track->sample_rate});
	return result;
}

void LiveLinkCapture::set_recording(const std::string &id, uint64_t start_ns,
	bool paused, uint64_t boundary_ns)
{
	std::lock_guard lock(mutex_);
	if (id != recording_id_) {
		recording_id_ = id;
		recording_start_ns_ = start_ns;
		recording_end_ns_ = 0;
		local_control_boundary_ns_ = 0;
		for (auto &[channel, track] : tracks_) track->next_sequence = 0;
	}
	if (boundary_ns < local_control_boundary_ns_) return;
	if (paused_ && !paused) {
		for (auto &[channel, track] : tracks_)
			while (!track->queue.empty() && track->queue.front().plugin_monotonic_ns < boundary_ns)
				discard_front(*track);
	}
	paused_ = paused;
	pause_boundary_ns_ = paused ? boundary_ns : 0;
}

void LiveLinkCapture::finish_at(uint64_t end_ns)
{
	std::lock_guard lock(mutex_);
	recording_end_ns_ = end_ns;
}

void LiveLinkCapture::pause_at(uint64_t at_ns)
{
	std::lock_guard lock(mutex_);
	paused_ = true;
	pause_boundary_ns_ = at_ns;
	local_control_boundary_ns_ = at_ns;
}

void LiveLinkCapture::resume_at(uint64_t at_ns)
{
	std::lock_guard lock(mutex_);
	for (auto &[channel, track] : tracks_)
		while (!track->queue.empty() && track->queue.front().plugin_monotonic_ns < at_ns)
			discard_front(*track);
	paused_ = false;
	pause_boundary_ns_ = 0;
	local_control_boundary_ns_ = at_ns;
}

uint64_t LiveLinkCapture::set_forward(const std::string &channel_id, bool enabled)
{
	std::lock_guard lock(mutex_);
	auto found = tracks_.find(channel_id);
	if (found == tracks_.end()) return 0;
	found->second->forward.store(enabled);
	return found->second->next_sample_index.load();
}

std::optional<LiveLinkAudioChunk> LiveLinkCapture::take()
{
	std::unique_lock lock(mutex_);
	if (recording_id_.empty()) return std::nullopt;
	Track *selected = nullptr;
	for (auto &[id, track] : tracks_) {
		while (!track->queue.empty() &&
			(track->queue.front().plugin_monotonic_ns < recording_start_ns_ ||
			 (recording_end_ns_ && track->queue.front().plugin_monotonic_ns >= recording_end_ns_) ||
			 !track->queue.front().forward))
			discard_front(*track);
		if (track->queue.empty() || (paused_ &&
			track->queue.front().plugin_monotonic_ns >= pause_boundary_ns_)) continue;
		if (!selected || track->queue.front().plugin_monotonic_ns <
			selected->queue.front().plugin_monotonic_ns) selected = track.get();
	}
	if (!selected) return std::nullopt;
	LiveLinkAudioChunk chunk;
	chunk.recording_id = recording_id_;
	chunk.channel_id = selected->channel_id;
	chunk.source_uuid = selected->source_uuid;
	chunk.sequence = selected->next_sequence++;
	const Packet &first = selected->queue.front();
	chunk.first_sample_index = first.first_sample_index;
	chunk.obs_timestamp_ns = first.obs_timestamp_ns;
	chunk.plugin_monotonic_ns = first.plugin_monotonic_ns;
	chunk.sample_rate = first.sample_rate;
	chunk.channels = first.channels;
	const uint32_t max_batch_frames = std::min(MAX_BATCH_FRAMES,
		chunk.sample_rate * MAX_BATCH_SECONDS);
	std::vector<Packet> packets;
	while (!selected->queue.empty()) {
		const Packet &packet = selected->queue.front();
		if (packet.sample_rate != chunk.sample_rate || packet.channels != chunk.channels ||
			packet.first_sample_index != chunk.first_sample_index + chunk.frames ||
			!packet.forward ||
			chunk.frames + packet.frames > max_batch_frames ||
			(recording_end_ns_ && packet.plugin_monotonic_ns >= recording_end_ns_) ||
			(paused_ && packet.plugin_monotonic_ns >= pause_boundary_ns_)) break;
		const uint32_t accepted_frames = recording_end_ns_
			? static_cast<uint32_t>(std::min<uint64_t>(packet.frames,
				(recording_end_ns_ - packet.plugin_monotonic_ns) * packet.sample_rate / 1'000'000'000ULL))
			: packet.frames;
		const bool clipped_at_stop = accepted_frames < packet.frames;
		queued_bytes_ -= packet.pcm.size() * sizeof(int16_t);
		selected->queued_frames -= packet.frames;
		if (accepted_frames) {
			Packet retained = std::move(selected->queue.front());
			retained.pcm.resize(static_cast<size_t>(accepted_frames) * retained.channels);
			retained.frames = accepted_frames;
			chunk.frames += accepted_frames;
			packets.push_back(std::move(retained));
		}
		selected->queue.pop_front();
		if (clipped_at_stop) break;
	}
	lock.unlock();
	if (!chunk.frames) return std::nullopt;
	chunk.pcm.reserve(static_cast<size_t>(chunk.frames) * chunk.channels);
	for (const auto &packet : packets)
		chunk.pcm.insert(chunk.pcm.end(), packet.pcm.begin(), packet.pcm.end());
	return chunk;
}
