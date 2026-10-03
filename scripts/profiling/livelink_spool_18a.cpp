// Isolated native FULL/WAL outbox benchmark; never opens the installed spool.
#include "livelink-spool.h"
#include <chrono>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <vector>

using Clock = std::chrono::steady_clock;
double ms(Clock::time_point start) {
    return std::chrono::duration<double, std::milli>(Clock::now() - start).count();
}

int main(int argc, char **argv) {
    if (argc != 3) return 1;
    const auto output = std::filesystem::path(argv[2]);
    if (std::filesystem::exists(output)) return 2;
    std::filesystem::create_directories(output);
    LiveLinkSpool spool(output / "outbox.sqlite3");
    if (!spool.ready()) return 3;
    std::ifstream manifest(argv[1]);
    if (!manifest) return 4;
    std::vector<LiveLinkAudioChunk> chunks;
    std::string line;
    while (std::getline(manifest, line)) {
        std::istringstream fields(line);
        LiveLinkAudioChunk c;
        std::string path;
        fields >> std::quoted(path) >> c.channel_id >> c.source_uuid >> c.sequence
               >> c.first_sample_index >> c.obs_timestamp_ns >> c.plugin_monotonic_ns
               >> c.frames >> c.sample_rate >> c.channels;
        if (!fields) return 5;
        c.recording_id = "18a-replay";
        c.pcm.resize(static_cast<size_t>(c.frames)*c.channels);
        std::ifstream pcm(path, std::ios::binary);
        pcm.read(reinterpret_cast<char *>(c.pcm.data()), c.pcm.size()*sizeof(int16_t));
        if (!pcm || pcm.peek() != EOF) return 6;
        chunks.push_back(std::move(c));
    }
    std::ofstream events(output / "events.csv");
    events << "stage,count,milliseconds\n";
    for (size_t offset=0; offset<chunks.size(); offset+=32) {
        const auto end = std::min(offset+32, chunks.size());
        std::vector<LiveLinkAudioChunk> batch(chunks.begin()+offset, chunks.begin()+end);
        const auto begin = Clock::now();
        if (!spool.append(batch)) return 7;
        events << "append," << batch.size() << ',' << ms(begin) << '\n';
    }
    if (spool.pending() != chunks.size()) return 8;
    size_t count = 0;
    while (count < chunks.size()) {
        std::vector<int64_t> ids;
        const auto burst = Clock::now();
        for (int i=0; i<20 && count<chunks.size(); ++i) {
            const auto begin = Clock::now();
            const auto item = spool.oldest(ids.empty() ? 0 : ids.back());
            events << "read,1," << ms(begin) << '\n';
            if (!item) return 9;
            const auto &expected = chunks[count++];
            if (item->chunk.pcm != expected.pcm || item->chunk.channel_id != expected.channel_id ||
                item->chunk.sequence != expected.sequence || item->chunk.first_sample_index != expected.first_sample_index)
                return 10;
            ids.push_back(item->id);
            if (ms(burst) >= 1000) break;
        }
        const auto begin = Clock::now();
        if (!spool.acknowledge(ids)) return 11;
        events << "ackCommit," << ids.size() << ',' << ms(begin) << '\n';
    }
    if (spool.pending()) return 12;
    std::cout << "{\"verifiedChunks\":" << count << ",\"pending\":0}\n";
}
