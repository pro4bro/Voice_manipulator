#include <obs-module.h>
#include <obs-frontend-api.h>
#include <util/platform.h>
#include "livelink-dialog.h"

#include <windows.h>
#include <bcrypt.h>
#include <winhttp.h>

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
#include <condition_variable>
#include <cstdint>
#include <cstdio>
#include <deque>
#include <iomanip>
#include <mutex>
#include <memory>
#include <optional>
#include <sstream>
#include <string>
#include <thread>
#include <utility>
#include <vector>

OBS_DECLARE_MODULE()
OBS_MODULE_USE_DEFAULT_LOCALE("pro4bro-obs-bridge", "en-US")
MODULE_EXPORT const char *obs_module_description(void)
{
	return "Streams selected OBS audio sources to Pro4Bro while OBS records.";
}

namespace {
constexpr size_t MAX_QUEUED_PACKETS = 128;
constexpr uint32_t HTTP_TIMEOUT_MS = 1500;

struct Config {
	std::string api_base;
	std::string project_id;
	std::string token;
	std::string source_uuid;
	bool overlay_enabled{};
};

std::optional<std::vector<Config>> read_configs()
{
	char *path = obs_module_config_path("config.json");
	if (!path) return std::nullopt;
	obs_data_t *data = obs_data_create_from_json_file_safe(path, "bak");
	bfree(path);
	if (!data) {
		blog(LOG_WARNING, "[Pro4Bro] config.json missing; bridge disabled");
		return std::nullopt;
	}
	Config base;
	base.api_base = obs_data_get_string(data, "apiBase");
	base.project_id = obs_data_get_string(data, "projectId");
	base.token = obs_data_get_string(data, "token");
	base.overlay_enabled = obs_data_get_bool(data, "overlayEnabled");
	while (!base.api_base.empty() && base.api_base.back() == '/') base.api_base.pop_back();
	std::vector<Config> configs;
	obs_data_array_t *sources = obs_data_get_array(data, "sources");
	if (sources) {
		for (size_t index = 0; index < obs_data_array_count(sources); ++index) {
			obs_data_t *item = obs_data_array_item(sources, index);
			Config config = base;
			config.source_uuid = obs_data_get_string(item, "uuid");
			if (!config.source_uuid.empty()) configs.push_back(std::move(config));
			obs_data_release(item);
		}
		obs_data_array_release(sources);
	}
	if (configs.empty()) {
		base.source_uuid = obs_data_get_string(data, "sourceUuid");
		if (!base.source_uuid.empty()) configs.push_back(base);
	}
	obs_data_release(data);
	if ((base.api_base.rfind("http://127.0.0.1:", 0) != 0 &&
	     base.api_base.rfind("http://localhost:", 0) != 0) ||
	    base.project_id.empty() || base.token.empty() || configs.empty()) {
		blog(LOG_ERROR, "[Pro4Bro] invalid config: loopback apiBase, projectId, token and sources are required");
		return std::nullopt;
	}
	return configs;
}

struct AudioPacket {
	uint64_t timestamp_ns{};
	uint64_t arrival_ns{};
	uint32_t frames{};
	std::vector<int16_t> pcm;
};

struct HttpResult {
	DWORD status{};
	std::string body;
	uint64_t elapsed_ms{};
};

std::string json_escape(const std::string &value)
{
	std::ostringstream out;
	for (const unsigned char c : value) {
		switch (c) {
		case '\\': out << "\\\\"; break;
		case '"': out << "\\\""; break;
		case '\b': out << "\\b"; break;
		case '\f': out << "\\f"; break;
		case '\n': out << "\\n"; break;
		case '\r': out << "\\r"; break;
		case '\t': out << "\\t"; break;
		default:
			if (c < 0x20)
				out << "\\u" << std::hex << std::setw(4) << std::setfill('0') << static_cast<int>(c);
			else
				out << c;
		}
	}
	return out.str();
}

std::wstring wide(const std::string &value)
{
	if (value.empty()) return {};
	const int length = MultiByteToWideChar(CP_UTF8, 0, value.data(), static_cast<int>(value.size()), nullptr, 0);
	std::wstring result(static_cast<size_t>(length), L'\0');
	MultiByteToWideChar(CP_UTF8, 0, value.data(), static_cast<int>(value.size()), result.data(), length);
	return result;
}

std::string url_encode(const std::string &value)
{
	static constexpr char HEX[] = "0123456789ABCDEF";
	std::string result;
	for (const unsigned char c : value) {
		if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
		    (c >= '0' && c <= '9') || c == '-' || c == '_' || c == '.' || c == '~') {
			result.push_back(static_cast<char>(c));
		} else {
			result.push_back('%');
			result.push_back(HEX[c >> 4]);
			result.push_back(HEX[c & 15]);
		}
	}
	return result;
}

std::optional<HttpResult> request(const Config &config, const wchar_t *method,
				  const std::string &route, const std::string &content_type,
				  const uint8_t *body, size_t body_size)
{
	const std::string full_url = config.api_base + route;
	const std::wstring url = wide(full_url);
	URL_COMPONENTS parts{};
	parts.dwStructSize = sizeof(parts);
	parts.dwSchemeLength = static_cast<DWORD>(-1);
	parts.dwHostNameLength = static_cast<DWORD>(-1);
	parts.dwUrlPathLength = static_cast<DWORD>(-1);
	parts.dwExtraInfoLength = static_cast<DWORD>(-1);
	if (!WinHttpCrackUrl(url.c_str(), 0, 0, &parts)) return std::nullopt;

	const auto started = std::chrono::steady_clock::now();
	HINTERNET session = WinHttpOpen(L"Pro4Bro OBS Bridge/0.1", WINHTTP_ACCESS_TYPE_NO_PROXY,
					   WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
	if (!session) return std::nullopt;
	WinHttpSetTimeouts(session, HTTP_TIMEOUT_MS, HTTP_TIMEOUT_MS, HTTP_TIMEOUT_MS, HTTP_TIMEOUT_MS);
	const std::wstring host(parts.lpszHostName, parts.dwHostNameLength);
	HINTERNET connection = WinHttpConnect(session, host.c_str(), parts.nPort, 0);
	if (!connection) {
		WinHttpCloseHandle(session);
		return std::nullopt;
	}
	std::wstring path(parts.lpszUrlPath, parts.dwUrlPathLength);
	if (parts.dwExtraInfoLength) path.append(parts.lpszExtraInfo, parts.dwExtraInfoLength);
	const DWORD flags = parts.nScheme == INTERNET_SCHEME_HTTPS ? WINHTTP_FLAG_SECURE : 0;
	HINTERNET req = WinHttpOpenRequest(connection, method, path.c_str(), nullptr,
					      WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, flags);
	if (!req) {
		WinHttpCloseHandle(connection);
		WinHttpCloseHandle(session);
		return std::nullopt;
	}
	const std::wstring headers = wide("Content-Type: " + content_type + "\r\nX-Pro4Bro-OBS-Token: " + config.token + "\r\n");
	const BOOL sent = WinHttpSendRequest(req, headers.c_str(), static_cast<DWORD>(-1L),
		const_cast<uint8_t *>(body), static_cast<DWORD>(body_size), static_cast<DWORD>(body_size), 0);
	BOOL received = sent && WinHttpReceiveResponse(req, nullptr);
	HttpResult result;
	if (received) {
		DWORD size = sizeof(result.status);
		WinHttpQueryHeaders(req, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
				    WINHTTP_HEADER_NAME_BY_INDEX, &result.status, &size, WINHTTP_NO_HEADER_INDEX);
		for (;;) {
			DWORD available = 0;
			if (!WinHttpQueryDataAvailable(req, &available) || !available) break;
			const size_t offset = result.body.size();
			result.body.resize(offset + available);
			DWORD read = 0;
			if (!WinHttpReadData(req, result.body.data() + offset, available, &read)) break;
			result.body.resize(offset + read);
		}
	}
	result.elapsed_ms = static_cast<uint64_t>(std::chrono::duration_cast<std::chrono::milliseconds>(
		std::chrono::steady_clock::now() - started).count());
	WinHttpCloseHandle(req);
	WinHttpCloseHandle(connection);
	WinHttpCloseHandle(session);
	return received ? std::optional<HttpResult>(std::move(result)) : std::nullopt;
}

std::string sha256(const std::vector<int16_t> &pcm)
{
	BCRYPT_ALG_HANDLE algorithm = nullptr;
	BCRYPT_HASH_HANDLE hash = nullptr;
	DWORD object_size = 0, bytes = 0;
	std::vector<UCHAR> object;
	std::vector<UCHAR> digest(32);
	if (BCryptOpenAlgorithmProvider(&algorithm, BCRYPT_SHA256_ALGORITHM, nullptr, 0) < 0) return {};
	if (BCryptGetProperty(algorithm, BCRYPT_OBJECT_LENGTH, reinterpret_cast<PUCHAR>(&object_size),
			      sizeof(object_size), &bytes, 0) < 0) goto done;
	object.resize(object_size);
	if (BCryptCreateHash(algorithm, &hash, object.data(), object_size, nullptr, 0, 0) < 0) goto done;
	if (BCryptHashData(hash, reinterpret_cast<PUCHAR>(const_cast<int16_t *>(pcm.data())),
			   static_cast<ULONG>(pcm.size() * sizeof(int16_t)), 0) < 0) goto done;
	if (BCryptFinishHash(hash, digest.data(), static_cast<ULONG>(digest.size()), 0) < 0) digest.clear();
done:
	if (hash) BCryptDestroyHash(hash);
	if (algorithm) BCryptCloseAlgorithmProvider(algorithm, 0);
	std::ostringstream out;
	for (const UCHAR value : digest) out << std::hex << std::setw(2) << std::setfill('0') << static_cast<int>(value);
	return out.str();
}

std::optional<std::string> json_string(const std::string &json, const std::string &key)
{
	const std::string marker = "\"" + key + "\":\"";
	const size_t start = json.find(marker);
	if (start == std::string::npos) return std::nullopt;
	const size_t value_start = start + marker.size();
	const size_t end = json.find('"', value_start);
	if (end == std::string::npos) return std::nullopt;
	return json.substr(value_start, end - value_start);
}

void ensure_overlay_task(void *param)
{
	std::unique_ptr<std::string> path(static_cast<std::string *>(param));
	if (path->empty()) return;
	constexpr const char *name = "Pro4Bro Live Captions";
	obs_source_t *source = obs_get_source_by_name(name);
	if (source) {
		obs_data_t *previous = obs_source_get_settings(source);
		const bool owned = obs_data_get_bool(previous, "pro4bro_owned");
		obs_data_release(previous);
		if (!owned) {
			blog(LOG_WARNING, "[Pro4Bro] caption source name is already in use; overlay disabled");
			obs_source_release(source);
			return;
		}
	}
	obs_data_t *settings = obs_data_create();
	obs_data_set_bool(settings, "pro4bro_owned", true);
	obs_data_set_bool(settings, "read_from_file", true);
	obs_data_set_string(settings, "file", path->c_str());
	if (!source) {
		obs_data_set_bool(settings, "outline", true);
		obs_data_set_int(settings, "outline_size", 3);
		obs_data_t *font = obs_data_create();
		obs_data_set_string(font, "face", "Segoe UI");
		obs_data_set_int(font, "size", 40);
		obs_data_set_obj(settings, "font", font);
		obs_data_release(font);
		source = obs_source_create("text_gdiplus", name, settings, nullptr);
	} else {
		obs_source_update(source, settings);
	}
	obs_data_release(settings);
	if (!source) {
		blog(LOG_WARNING, "[Pro4Bro] Text (GDI+) is unavailable; audio capture continues");
		return;
	}
	obs_source_t *scene_source = obs_frontend_get_current_scene();
	obs_scene_t *scene = scene_source ? obs_scene_from_source(scene_source) : nullptr;
	if (scene && !obs_scene_find_source(scene, name)) {
		obs_sceneitem_t *item = obs_scene_add(scene, source);
		if (item) {
			obs_video_info video{};
			if (obs_get_video_info(&video)) {
				vec2 position{};
				vec2_set(&position, 60.0f, static_cast<float>(video.base_height > 160 ? video.base_height - 160 : 0));
				obs_sceneitem_set_pos(item, &position);
			}
		}
	}
	if (scene_source) obs_source_release(scene_source);
	obs_source_release(source);
}

class Bridge {
public:
	explicit Bridge(Config config) : config_(std::move(config)) {}

	void load()
	{
		blog(LOG_INFO, "[Pro4Bro] loaded; project=%s source=%s", config_.project_id.c_str(),
		     config_.source_uuid.c_str());
	}

	void unload()
	{
		begin_stop(false);
		finish_stop();
	}

private:
	friend class Plugin;
	Config config_;
	std::string capture_id_;
	std::string overlay_path_;
	obs_source_t *source_{};
	std::string source_name_;
	uint32_t sample_rate_{};
	uint32_t input_channels_{};
	uint32_t output_channels_{};
	uint64_t recording_start_ns_{};
	std::atomic<bool> accepting_{false};
	std::atomic<bool> stopping_{false};
	std::atomic<bool> callback_attached_{false};
	std::mutex mutex_;
	std::condition_variable wake_;
	std::deque<AudioPacket> queue_;
	std::thread worker_;
	std::atomic<uint64_t> pending_dropped_frames_{};
	std::atomic<uint64_t> total_dropped_frames_{};
	std::atomic<uint64_t> callback_count_{};
	std::atomic<uint64_t> callback_max_us_{};

	bool select_source()
	{
		source_ = obs_get_source_by_uuid(config_.source_uuid.c_str());
		if (!source_ || (obs_source_get_output_flags(source_) & OBS_SOURCE_AUDIO) == 0) {
			blog(LOG_ERROR, "[Pro4Bro] configured source is missing or has no audio");
			if (source_) obs_source_release(source_);
			source_ = nullptr;
			return false;
		}
		source_name_ = obs_source_get_name(source_);
		return true;
	}

	void start_capture(const std::string &capture_id, uint64_t started_ns)
	{
		if (worker_.joinable() || !select_source()) return;
		obs_audio_info info{};
		if (!obs_get_audio_info(&info)) {
			blog(LOG_ERROR, "[Pro4Bro] OBS audio is not initialized");
			obs_source_release(source_);
			source_ = nullptr;
			return;
		}
		sample_rate_ = info.samples_per_sec;
		input_channels_ = get_audio_channels(info.speakers);
		output_channels_ = input_channels_ == 1 ? 1 : 2;
		capture_id_ = capture_id;
		recording_start_ns_ = started_ns;
		stopping_ = false;
		accepting_ = true;
		send_stopped_ = false;
		pending_dropped_frames_ = 0;
		total_dropped_frames_ = 0;
		callback_count_ = 0;
		callback_max_us_ = 0;
		obs_source_add_audio_capture_callback(source_, audio_callback, this);
		callback_attached_ = true;
		worker_ = std::thread(&Bridge::worker_main, this);
		blog(LOG_INFO, "[Pro4Bro] capture started: %s (%s), %u Hz, %u channel(s)", source_name_.c_str(),
		     obs_source_get_uuid(source_), sample_rate_, output_channels_);
	}

	void ensure_overlay()
	{
		std::string path;
		{
			std::lock_guard lock(mutex_);
			path = overlay_path_;
		}
		if (!path.empty()) obs_queue_task(OBS_TASK_UI, ensure_overlay_task, new std::string(path), false);
	}

	void set_paused(bool paused)
	{
		if (!worker_.joinable()) return;
		accepting_ = !paused;
		std::lock_guard lock(mutex_);
		events_.push_back(paused ? "paused" : "unpaused");
		wake_.notify_one();
	}

	void begin_stop(bool send_stopped)
	{
		if (!worker_.joinable()) return;
		accepting_ = false;
		if (source_ && callback_attached_.exchange(false))
			obs_source_remove_audio_capture_callback(source_, audio_callback, this);
		{
			std::lock_guard lock(mutex_);
			send_stopped_ = send_stopped_ || send_stopped;
			stopping_ = true;
		}
		wake_.notify_one();
	}

	void finish_stop()
	{
		if (!worker_.joinable()) return;
		worker_.join();
		blog(LOG_INFO, "[Pro4Bro] capture stopped: callbacks=%llu max_callback_us=%llu dropped_frames=%llu",
		     callback_count_.load(), callback_max_us_.load(), total_dropped_frames_.load());
		if (source_) obs_source_release(source_);
		source_ = nullptr;
	}

	static void audio_callback(void *param, obs_source_t *, const struct audio_data *audio, bool muted)
	{
		static_cast<Bridge *>(param)->on_audio(audio, muted);
	}

	void on_audio(const struct audio_data *audio, bool muted)
	{
		if (!accepting_ || !audio || !audio->frames) return;
		const auto started = std::chrono::steady_clock::now();
		AudioPacket packet;
		packet.timestamp_ns = audio->timestamp;
		packet.arrival_ns = os_gettime_ns();
		packet.frames = audio->frames;
		packet.pcm.resize(static_cast<size_t>(audio->frames) * output_channels_);
		for (uint32_t frame = 0; frame < audio->frames; ++frame) {
			for (uint32_t channel = 0; channel < output_channels_; ++channel) {
				const float sample = muted ? 0.0f : reinterpret_cast<const float *>(audio->data[channel])[frame];
				packet.pcm[static_cast<size_t>(frame) * output_channels_ + channel] =
					static_cast<int16_t>(std::lrint(std::clamp(sample, -1.0f, 1.0f) * 32767.0f));
			}
		}
		if (mutex_.try_lock()) {
			if (queue_.size() < MAX_QUEUED_PACKETS) queue_.push_back(std::move(packet));
			else {
				pending_dropped_frames_ += audio->frames;
				total_dropped_frames_ += audio->frames;
			}
			mutex_.unlock();
			wake_.notify_one();
		} else {
			pending_dropped_frames_ += audio->frames;
			total_dropped_frames_ += audio->frames;
		}
		++callback_count_;
		const uint64_t elapsed = static_cast<uint64_t>(std::chrono::duration_cast<std::chrono::microseconds>(
			std::chrono::steady_clock::now() - started).count());
		uint64_t maximum = callback_max_us_.load(std::memory_order_relaxed);
		while (maximum < elapsed && !callback_max_us_.compare_exchange_weak(maximum, elapsed,
			std::memory_order_relaxed)) {}
	}

	std::deque<std::string> events_;
	bool send_stopped_{};

	bool send_event(const std::string &session_id, uint64_t &event_sequence, const std::string &kind,
			uint64_t missing_frames = 0, uint64_t first = 0, uint64_t last = 0)
	{
		std::ostringstream json;
		json << "{\"sequence\":" << event_sequence << ",\"kind\":\"" << kind
		     << "\",\"timestampNs\":" << static_cast<uint64_t>(os_gettime_ns());
		if (kind == "gap") json << ",\"missingFrames\":" << missing_frames
			<< ",\"firstSequence\":" << first << ",\"lastSequence\":" << last;
		json << '}';
		const std::string data = json.str();
		auto result = request(config_, L"POST", "/api/projects/" + url_encode(config_.project_id) +
			"/obs-live/sessions/" + session_id + "/events", "application/json",
			reinterpret_cast<const uint8_t *>(data.data()), data.size());
		if (result && result->status >= 200 && result->status < 300) {
			++event_sequence;
			return true;
		}
		return false;
	}

	void worker_main()
	{
		std::ostringstream open_json;
		open_json << "{\"protocolVersion\":2,\"captureId\":\"" << json_escape(capture_id_)
			  << "\",\"obsVersion\":\"" << json_escape(obs_get_version_string())
			  << "\",\"sourceId\":\"" << json_escape(obs_source_get_uuid(source_))
			  << "\",\"sourceLabel\":\"" << json_escape(source_name_)
			  << "\",\"sampleRate\":" << sample_rate_ << ",\"channels\":" << output_channels_
			  << ",\"startedTimestampNs\":" << recording_start_ns_ << '}';
		const std::string open_body = open_json.str();
		std::string session_id;
		while (!stopping_ && session_id.empty()) {
			auto result = request(config_, L"POST", "/api/projects/" + url_encode(config_.project_id) +
				"/obs-live/sessions", "application/json",
				reinterpret_cast<const uint8_t *>(open_body.data()), open_body.size());
			if (result && result->status >= 200 && result->status < 300) {
				if (auto id = json_string(result->body, "id")) session_id = *id;
			} else {
				std::this_thread::sleep_for(std::chrono::milliseconds(300));
			}
		}
		if (session_id.empty()) return;
		blog(LOG_INFO, "[Pro4Bro] live session opened: %s", session_id.c_str());
		if (config_.overlay_enabled) {
			auto pairing = request(config_, L"GET", "/api/projects/" + url_encode(config_.project_id) +
				"/obs-live/pairing", "application/json", nullptr, 0);
			if (pairing && pairing->status == 200) {
				if (auto path = json_string(pairing->body, "overlayPath")) {
					{
						std::lock_guard lock(mutex_);
						overlay_path_ = *path;
					}
					ensure_overlay();
				}
			}
		}

		uint64_t sequence = 0, event_sequence = 0, http_total_ms = 0, http_max_ms = 0, http_count = 0;
		uint64_t expected_timestamp = recording_start_ns_;
		int64_t source_clock_shift = 0;
		bool source_clock_checked = false;
		std::vector<int16_t> batch;
		uint64_t batch_timestamp = 0;
		uint32_t batch_frames = 0;
		for (;;) {
			std::deque<AudioPacket> local;
			std::deque<std::string> local_events;
			uint64_t dropped = 0;
			bool stop = false;
			{
				std::unique_lock lock(mutex_);
				wake_.wait_for(lock, std::chrono::milliseconds(100), [this] {
					return !queue_.empty() || !events_.empty() || stopping_.load();
				});
				local.swap(queue_);
				local_events.swap(events_);
				dropped = pending_dropped_frames_.exchange(0);
				stop = stopping_;
			}
			if (dropped) {
				if (send_event(session_id, event_sequence, "gap", dropped, sequence, sequence)) ++sequence;
				else pending_dropped_frames_ += dropped;
			}
			for (const auto &kind : local_events) {
				while (!send_event(session_id, event_sequence, kind) && !stopping_)
					std::this_thread::sleep_for(std::chrono::milliseconds(250));
				if (kind == "unpaused") expected_timestamp = 0;
			}
			for (auto &packet : local) {
				if (!source_clock_checked) {
					// FFmpeg media inputs can timestamp audio from a clock with a
					// different origin than OBS' recording clock. Anchor that source
					// once at callback arrival so a late start becomes a real gap.
					const uint64_t difference = packet.arrival_ns > packet.timestamp_ns
						? packet.arrival_ns - packet.timestamp_ns
						: packet.timestamp_ns - packet.arrival_ns;
					if (difference > 5000000000ULL) {
						source_clock_shift = static_cast<int64_t>(packet.arrival_ns) -
							static_cast<int64_t>(packet.timestamp_ns);
						blog(LOG_WARNING, "[Pro4Bro] audio source clock rebased to recording clock: %s",
						     source_name_.c_str());
					}
					source_clock_checked = true;
				}
				packet.timestamp_ns = static_cast<uint64_t>(std::max<int64_t>(0,
					static_cast<int64_t>(packet.timestamp_ns) + source_clock_shift));
				if (expected_timestamp && packet.timestamp_ns > expected_timestamp) {
					const uint64_t delta = packet.timestamp_ns - expected_timestamp;
					const uint64_t missing = (delta * sample_rate_ + 500000000ULL) / 1000000000ULL;
					if (missing > sample_rate_ / 200) {
						if (!batch.empty()) upload_batch(session_id, sequence, batch_timestamp, batch_frames,
							batch, http_total_ms, http_max_ms, http_count);
						if (send_event(session_id, event_sequence, "gap", missing, sequence, sequence))
							++sequence;
					}
				}
				if (batch_frames && batch_frames + packet.frames > sample_rate_)
					upload_batch(session_id, sequence, batch_timestamp, batch_frames, batch,
						http_total_ms, http_max_ms, http_count);
				if (batch.empty()) batch_timestamp = packet.timestamp_ns;
				batch.insert(batch.end(), packet.pcm.begin(), packet.pcm.end());
				batch_frames += packet.frames;
				expected_timestamp = packet.timestamp_ns +
					(static_cast<uint64_t>(packet.frames) * 1000000000ULL / sample_rate_);
				if (batch_frames >= sample_rate_) upload_batch(session_id, sequence, batch_timestamp,
					batch_frames, batch, http_total_ms, http_max_ms, http_count);
			}
			if (stop && local.empty()) break;
		}
		if (!batch.empty()) upload_batch(session_id, sequence, batch_timestamp, batch_frames,
			batch, http_total_ms, http_max_ms, http_count);
		if (send_stopped_) send_event(session_id, event_sequence, "stopped");
		blog(LOG_INFO, "[Pro4Bro] transport: chunks=%llu avg_http_ms=%llu max_http_ms=%llu",
		     http_count, http_count ? http_total_ms / http_count : 0, http_max_ms);
	}

	void upload_batch(const std::string &session_id, uint64_t &sequence, uint64_t timestamp,
			  uint32_t &frames, std::vector<int16_t> &batch, uint64_t &total_ms,
			  uint64_t &max_ms, uint64_t &count)
	{
		const std::string digest = sha256(batch);
		const std::string route = "/api/projects/" + url_encode(config_.project_id) +
			"/obs-live/sessions/" + session_id + "/chunks/" + std::to_string(sequence) +
			"?timestampNs=" + std::to_string(timestamp) + "&frames=" + std::to_string(frames) +
			"&sha256=" + digest;
		for (;;) {
			auto result = request(config_, L"PUT", route, "application/octet-stream",
				reinterpret_cast<const uint8_t *>(batch.data()), batch.size() * sizeof(int16_t));
			if (result && result->status >= 200 && result->status < 300) {
				total_ms += result->elapsed_ms;
				max_ms = std::max(max_ms, result->elapsed_ms);
				++count;
				++sequence;
				batch.clear();
				frames = 0;
				return;
			}
			if (stopping_) {
				blog(LOG_WARNING, "[Pro4Bro] app unavailable at stop; final chunk remains unacknowledged");
				batch.clear();
				frames = 0;
				return;
			}
			std::this_thread::sleep_for(std::chrono::milliseconds(250));
		}
	}
};

class Plugin {
public:
	bool load()
	{
		livelink_start();
		auto configs = read_configs();
		if (configs) {
			for (auto &config : *configs) {
				auto bridge = std::make_unique<Bridge>(std::move(config));
				bridge->load();
				bridges_.push_back(std::move(bridge));
			}
		}
		obs_frontend_add_event_callback(frontend_event, this);
		livelink_recording_state(obs_frontend_recording_active(), obs_frontend_recording_paused());
		blog(LOG_INFO, "[Pro4Bro] %llu source bridge(s) ready", static_cast<unsigned long long>(bridges_.size()));
		return true;
	}

	void unload()
	{
		livelink_stop();
		obs_frontend_remove_event_callback(frontend_event, this);
		for (auto &bridge : bridges_) bridge->unload();
		bridges_.clear();
	}

private:
	std::vector<std::unique_ptr<Bridge>> bridges_;

	static void frontend_event(enum obs_frontend_event event, void *param)
	{
		auto *self = static_cast<Plugin *>(param);
		if (event == OBS_FRONTEND_EVENT_SCENE_COLLECTION_CHANGING ||
		    event == OBS_FRONTEND_EVENT_SCENE_COLLECTION_CLEANUP) {
			livelink_scene_collection_changing();
			for (auto &bridge : self->bridges_) {
				bridge->begin_stop(false);
				bridge->finish_stop();
			}
			blog(LOG_INFO, "[Pro4Bro] detached audio callbacks for scene collection change");
		} else if (event == OBS_FRONTEND_EVENT_SCENE_COLLECTION_CHANGED) {
			livelink_scene_collection_changed();
		} else if (event == OBS_FRONTEND_EVENT_EXIT) {
			livelink_stop();
			for (auto &bridge : self->bridges_) {
				bridge->begin_stop(false);
				bridge->finish_stop();
			}
		} else if (event == OBS_FRONTEND_EVENT_RECORDING_STARTED) {
			livelink_recording_state(true, false);
			livelink_recording_event("obs-start");
			const uint64_t started = os_gettime_ns();
			const std::string capture_id = "capture-" + std::to_string(started);
			for (auto &bridge : self->bridges_) bridge->start_capture(capture_id, started);
		} else if (event == OBS_FRONTEND_EVENT_RECORDING_PAUSED) {
			livelink_recording_state(true, true);
			livelink_recording_event("obs-pause");
			for (auto &bridge : self->bridges_) bridge->set_paused(true);
		} else if (event == OBS_FRONTEND_EVENT_RECORDING_UNPAUSED) {
			livelink_recording_state(true, false);
			livelink_recording_event("obs-resume");
			for (auto &bridge : self->bridges_) bridge->set_paused(false);
		} else if (event == OBS_FRONTEND_EVENT_RECORDING_STOPPING) {
			for (auto &bridge : self->bridges_) bridge->begin_stop(true);
		} else if (event == OBS_FRONTEND_EVENT_RECORDING_STOPPED) {
			livelink_recording_state(false, false);
			livelink_recording_event("obs-stop");
			for (auto &bridge : self->bridges_) bridge->finish_stop();
		} else if (event == OBS_FRONTEND_EVENT_SCENE_CHANGED) {
			for (auto &bridge : self->bridges_) bridge->ensure_overlay();
		}
	}
};

Plugin plugin;
}

bool obs_module_load(void)
{
	return plugin.load();
}

void obs_module_unload(void)
{
	plugin.unload();
}
