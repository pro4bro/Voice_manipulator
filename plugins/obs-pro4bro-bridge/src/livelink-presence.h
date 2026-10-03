#pragma once

#include "livelink-mixer.h"

#include <map>
#include <string>
#include <vector>

// Poll observations, including sources first discovered in this OBS process.
// Initial inventory is a baseline, not a fabricated disappearance/restoration.
class LiveLinkPresence {
public:
	std::vector<MixerRow> observe(const std::vector<MixerRow> &rows)
	{
		std::vector<MixerRow> transitions;
		for (const auto &row : rows) {
			auto previous = observed_.find(row.channel_id);
			if (previous != observed_.end() && previous->second.uuid == row.uuid &&
				previous->second.missing != row.missing) transitions.push_back(row);
			observed_[row.channel_id] = row;
		}
		return transitions;
	}

private:
	std::map<std::string, MixerRow> observed_;
};
