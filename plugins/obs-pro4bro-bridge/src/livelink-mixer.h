#pragma once

#include <obs.h>
#include <obs-audio-controls.h>

#include <atomic>
#include <map>
#include <memory>
#include <string>
#include <vector>

struct MixerRow {
	std::string channel_id;
	std::string uuid;
	std::string name;
	std::string alias;
	int slot{};
	int alias_revision{};
	int level{};
	int sample_rate{};
	int audio_channels{};
	bool forward{};
	bool missing{};
	bool muted{};
};

class LiveLinkMixer {
public:
	LiveLinkMixer();
	~LiveLinkMixer();
	LiveLinkMixer(const LiveLinkMixer &) = delete;
	LiveLinkMixer &operator=(const LiveLinkMixer &) = delete;

	void refresh();
	void suspend();
	std::vector<MixerRow> rows(bool include_missing = false) const;
	bool set_forward(const std::string &uuid, bool enabled);
	bool apply_forward(const std::string &channel_id, const std::string &uuid, bool enabled);
	bool set_alias(const std::string &uuid, const std::string &alias);
	const std::string &collection() const { return collection_; }

private:
	struct Channel {
		std::string id, uuid, name, alias;
		int slot{};
		int alias_revision{};
		int sample_rate{};
		int audio_channels{};
		bool forward{};
		bool present{};
		bool muted{};
		std::atomic<int> level{0};
		std::atomic<unsigned long long> last_meter_ms{0};
		obs_volmeter_t *meter{};
		~Channel();
	};
	using ChannelMap = std::map<std::string, std::unique_ptr<Channel>>;
	std::map<std::string, ChannelMap> collections_;
	std::string collection_;
	std::string path_;
	void load();
	void save() const;
	static void meter_updated(void *opaque, const float magnitude[MAX_AUDIO_CHANNELS],
		const float peak[MAX_AUDIO_CHANNELS], const float input_peak[MAX_AUDIO_CHANNELS]);
};
