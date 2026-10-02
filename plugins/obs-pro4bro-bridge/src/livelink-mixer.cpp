#include "livelink-mixer.h"

#include <obs-frontend-api.h>
#include <obs-module.h>

#include <windows.h>
#include <objbase.h>

#include <algorithm>
#include <cwctype>
#include <cmath>
#include <set>

namespace {
std::string new_id()
{
	GUID guid{};
	if (CoCreateGuid(&guid) != S_OK) return {};
	wchar_t wide[40]{};
	StringFromGUID2(guid, wide, 40);
	char text[40]{};
	WideCharToMultiByte(CP_UTF8, 0, wide + 1, 36, text, sizeof(text), nullptr, nullptr);
	return std::string(text, 36);
}

std::wstring alias_text(const std::string &value)
{
	int length = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.c_str(), static_cast<int>(value.size()), nullptr, 0);
	if (length <= 0) return {};
	std::wstring text(static_cast<size_t>(length), L'\0');
	MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.c_str(), static_cast<int>(value.size()), text.data(), length);
	auto non_space = [](wchar_t c) { return !std::iswspace(c); };
	text.erase(text.begin(), std::find_if(text.begin(), text.end(), non_space));
	text.erase(std::find_if(text.rbegin(), text.rend(), non_space).base(), text.end());
	return text;
}
}

LiveLinkMixer::Channel::~Channel()
{
	if (meter) {
		obs_volmeter_remove_callback(meter, LiveLinkMixer::meter_updated, this);
		obs_volmeter_destroy(meter);
	}
}

LiveLinkMixer::LiveLinkMixer()
{
	char *path = obs_module_config_path("livelink-channels.json");
	if (path) {
		path_ = path;
		bfree(path);
	}
	load();
}

LiveLinkMixer::~LiveLinkMixer() = default;

void LiveLinkMixer::suspend()
{
	for (auto &[name, channels] : collections_)
		for (auto &[uuid, channel] : channels) {
			if (!channel->meter) continue;
			obs_volmeter_remove_callback(channel->meter, meter_updated, channel.get());
			obs_volmeter_destroy(channel->meter);
			channel->meter = nullptr;
			channel->level = 0;
		}
}

void LiveLinkMixer::load()
{
	if (path_.empty()) return;
	obs_data_t *root = obs_data_create_from_json_file(path_.c_str());
	if (!root) return;
	obs_data_array_t *collections = obs_data_get_array(root, "collections");
	if (collections) {
		for (size_t i = 0; i < obs_data_array_count(collections); ++i) {
			obs_data_t *entry = obs_data_array_item(collections, i);
			std::string name = obs_data_get_string(entry, "name");
			if (!name.empty()) {
				obs_data_array_t *channels = obs_data_get_array(entry, "channels");
				if (channels) {
					for (size_t j = 0; j < obs_data_array_count(channels); ++j) {
						obs_data_t *item = obs_data_array_item(channels, j);
						std::string uuid = obs_data_get_string(item, "sourceUuid");
						std::string id = obs_data_get_string(item, "channelId");
						int slot = static_cast<int>(obs_data_get_int(item, "slot"));
						if (!uuid.empty() && !id.empty() && slot > 0 && slot < 10000) {
							auto channel = std::make_unique<Channel>();
							channel->uuid = uuid;
							channel->id = id;
							channel->slot = slot;
							channel->alias_revision = static_cast<int>(obs_data_get_int(item, "aliasRevision"));
							channel->name = obs_data_get_string(item, "nativeName");
							channel->alias = obs_data_get_string(item, "alias");
							channel->forward = obs_data_get_bool(item, "forward");
							collections_[name].emplace(uuid, std::move(channel));
						}
						obs_data_release(item);
					}
					obs_data_array_release(channels);
				}
			}
			obs_data_release(entry);
		}
		obs_data_array_release(collections);
	}
	obs_data_release(root);
}

void LiveLinkMixer::save() const
{
	if (path_.empty()) return;
	obs_data_t *root = obs_data_create();
	obs_data_array_t *collections = obs_data_array_create();
	for (const auto &[name, channels] : collections_) {
		obs_data_t *entry = obs_data_create();
		obs_data_set_string(entry, "name", name.c_str());
		obs_data_array_t *items = obs_data_array_create();
		for (const auto &[uuid, channel] : channels) {
			obs_data_t *item = obs_data_create();
			obs_data_set_string(item, "sourceUuid", uuid.c_str());
			obs_data_set_string(item, "channelId", channel->id.c_str());
			obs_data_set_string(item, "nativeName", channel->name.c_str());
			obs_data_set_string(item, "alias", channel->alias.c_str());
			obs_data_set_int(item, "slot", channel->slot);
			obs_data_set_int(item, "aliasRevision", channel->alias_revision);
			obs_data_set_bool(item, "forward", channel->forward);
			obs_data_array_push_back(items, item);
			obs_data_release(item);
		}
		obs_data_set_array(entry, "channels", items);
		obs_data_array_release(items);
		obs_data_array_push_back(collections, entry);
		obs_data_release(entry);
	}
	obs_data_set_array(root, "collections", collections);
	obs_data_array_release(collections);
	if (!obs_data_save_json_safe(root, path_.c_str(), "tmp", "bak"))
		blog(LOG_ERROR, "[Pro4Bro] could not save LiveLink channel mapping");
	obs_data_release(root);
}

void LiveLinkMixer::meter_updated(void *opaque, const float[MAX_AUDIO_CHANNELS],
	const float peak[MAX_AUDIO_CHANNELS], const float[MAX_AUDIO_CHANNELS])
{
	auto *channel = static_cast<Channel *>(opaque);
	float highest = -60.0f;
	for (size_t i = 0; i < MAX_AUDIO_CHANNELS; ++i)
		if (std::isfinite(peak[i])) highest = std::max(highest, peak[i]);
	channel->level = std::clamp(static_cast<int>((highest + 60.0f) * 100.0f / 60.0f), 0, 100);
	channel->last_meter_ms = GetTickCount64();
}

void LiveLinkMixer::refresh()
{
	char *current = obs_frontend_get_current_scene_collection();
	std::string next = current ? current : "";
	if (current) bfree(current);
	if (next.empty()) return;
	if (next != collection_) {
		if (!collection_.empty()) suspend();
		collection_ = next;
	}
	auto &channels = collections_[collection_];
	obs_audio_info audio_info{};
	int sample_rate = obs_get_audio_info(&audio_info) ? static_cast<int>(audio_info.samples_per_sec) : 0;
	for (auto &[uuid, channel] : channels) channel->present = false;
	bool changed = false;
	struct Context { ChannelMap *channels; bool *changed; int sample_rate; } context{&channels, &changed, sample_rate};
	obs_enum_sources([](void *opaque, obs_source_t *source) {
		auto &ctx = *static_cast<Context *>(opaque);
		if (!(obs_source_get_output_flags(source) & OBS_SOURCE_AUDIO) || !obs_source_audio_active(source)) return true;
		obs_data_t *settings = obs_source_get_private_settings(source);
		bool hidden = settings && obs_data_get_bool(settings, "mixer_hidden");
		bool pinned = settings && obs_data_get_bool(settings, "mixer_pinned");
		if (settings) obs_data_release(settings);
		if (!pinned && (hidden || !obs_source_active(source))) return true;
		const char *uuid = obs_source_get_uuid(source);
		if (!uuid || !*uuid) return true;
		std::string key(uuid);
		auto it = ctx.channels->find(key);
		if (it == ctx.channels->end()) {
			int slot = 1;
			for (const auto &[other_uuid, other] : *ctx.channels) slot = std::max(slot, other->slot + 1);
			auto channel = std::make_unique<Channel>();
			channel->id = new_id();
			if (channel->id.empty()) return true;
			channel->uuid = key;
			channel->slot = slot;
			channel->alias = "Track " + std::to_string(slot);
			it = ctx.channels->emplace(key, std::move(channel)).first;
			*ctx.changed = true;
		}
		auto &channel = *it->second;
		channel.present = true;
		channel.sample_rate = ctx.sample_rate;
		channel.audio_channels = static_cast<int>(get_audio_channels(obs_source_get_speaker_layout(source)));
		channel.muted = obs_source_muted(source);
		const char *native_name = obs_source_get_name(source);
		std::string name = native_name ? native_name : "";
		if (channel.name != name) {
			channel.name = name;
			*ctx.changed = true;
		}
		if (!channel.meter) {
			channel.meter = obs_volmeter_create(OBS_FADER_LOG);
			if (channel.meter) {
				obs_volmeter_add_callback(channel.meter, meter_updated, &channel);
				if (!obs_volmeter_attach_source(channel.meter, source)) {
					obs_volmeter_remove_callback(channel.meter, meter_updated, &channel);
					obs_volmeter_destroy(channel.meter);
					channel.meter = nullptr;
				}
			}
		}
		return true;
	}, &context);
	for (auto &[uuid, channel] : channels) {
		if (!channel->present && channel->meter) {
			obs_volmeter_remove_callback(channel->meter, meter_updated, channel.get());
			obs_volmeter_destroy(channel->meter);
			channel->meter = nullptr;
			channel->level = 0;
		}
	}
	if (changed) save();
}

std::vector<MixerRow> LiveLinkMixer::rows(bool include_missing) const
{
	std::vector<MixerRow> result;
	auto found = collections_.find(collection_);
	if (found == collections_.end()) return result;
	for (const auto &[uuid, channel] : found->second) {
		if (include_missing || channel->present) {
			int level = GetTickCount64() - channel->last_meter_ms.load() <= 1000 ? channel->level.load() : 0;
			result.push_back({channel->id, uuid, channel->name, channel->alias, channel->slot, channel->alias_revision,
				level, channel->sample_rate, channel->audio_channels, channel->forward, !channel->present,
				channel->muted});
		}
	}
	std::sort(result.begin(), result.end(), [](const MixerRow &a, const MixerRow &b) { return a.slot < b.slot; });
	return result;
}

bool LiveLinkMixer::set_forward(const std::string &uuid, bool enabled)
{
	auto &channels = collections_[collection_];
	auto it = channels.find(uuid);
	if (it == channels.end() || !it->second->present) return false;
	it->second->forward = enabled;
	save();
	return true;
}

bool LiveLinkMixer::apply_forward(const std::string &channel_id, const std::string &uuid, bool enabled)
{
	auto &channels = collections_[collection_];
	auto it = channels.find(uuid);
	if (it == channels.end() || it->second->id != channel_id) return false;
	return set_forward(uuid, enabled);
}

bool LiveLinkMixer::set_alias(const std::string &uuid, const std::string &alias)
{
	auto &channels = collections_[collection_];
	auto it = channels.find(uuid);
	const std::wstring value = alias_text(alias);
	if (it == channels.end() || value.empty() || alias.size() > 256) return false;
	for (const auto &[other_uuid, other] : channels)
		if (other_uuid != uuid && CompareStringOrdinal(value.c_str(), -1,
			alias_text(other->alias).c_str(), -1, TRUE) == CSTR_EQUAL) return false;
	if (it->second->alias == alias) return true;
	it->second->alias = alias;
	++it->second->alias_revision;
	save();
	return true;
}
