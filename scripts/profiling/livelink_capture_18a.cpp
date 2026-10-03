// Six-source callback/queue fixture. It does not simulate microphone or scheduler latency.
#include "livelink-capture.h"
#include <util/platform.h>
#include <array>
#include <chrono>
#include <fstream>
#include <iostream>
#include <thread>

struct LiveLinkCaptureTestAccess {
    static void add(LiveLinkCapture &capture, const std::string &id) {
        auto track = std::make_unique<LiveLinkCapture::Track>();
        track->owner = &capture;
        track->channel_id = id;
        track->source_uuid = id;
        track->sample_rate = 48000;
        track->channels = 2;
        track->forward.store(true);
        capture.tracks_.emplace(id, std::move(track));
    }
    static void packet(LiveLinkCapture &capture, const std::string &id) {
        std::array<float, 480> left{}, right{};
        left.fill(.2f);
        right.fill(-.2f);
        audio_data audio{};
        audio.frames = 480;
        audio.data[0] = reinterpret_cast<uint8_t *>(left.data());
        audio.data[1] = reinterpret_cast<uint8_t *>(right.data());
        capture.on_audio(*capture.tracks_.at(id), &audio, false);
    }
};

int main(int argc, char **argv) {
    if (argc != 2 || !obs_startup("en-US", nullptr, nullptr)) return 1;
    std::ofstream events(argv[1]);
    if (!events) return 5;
    events << "stage,count,milliseconds\n";
    {
        LiveLinkCapture capture;
        capture.set_recording("18a-callback-fixture", 1, false, 0);
        for (int i=0; i<6; ++i) LiveLinkCaptureTestAccess::add(capture, std::to_string(i));
        std::array<uint64_t, 6> expected{};
        for (int burst=0; burst<10; ++burst) {
            for (int packet=0; packet<25; ++packet)
                for (int i=0; i<6; ++i) {
                    const auto begin = os_gettime_ns();
                    LiveLinkCaptureTestAccess::packet(capture, std::to_string(i));
                    events << "callback,1," << (os_gettime_ns()-begin)/1e6 << '\n';
                }
            // Fixed queue residence fixture, independent of disk/network.
            std::this_thread::sleep_for(std::chrono::milliseconds(250));
            while (auto chunk = capture.take()) {
                const auto index = std::stoi(chunk->channel_id);
                if (chunk->first_sample_index != expected[index]) return 2;
                expected[index] += chunk->frames;
                events << "queueAge,1," << (os_gettime_ns()-chunk->plugin_monotonic_ns)/1e6 << '\n';
            }
            for (const auto &status : capture.queue_status())
                if (status.overflow_frames || status.queued_frames) return 3;
        }
        for (auto frames : expected) if (frames != 120000) return 4;
    }
    obs_shutdown();
    std::cout << "six sources, 1500 callbacks, 720000 continuous frames, no overflow\n";
}
