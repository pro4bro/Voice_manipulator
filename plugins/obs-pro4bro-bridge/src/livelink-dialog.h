#pragma once

void livelink_start();
void livelink_stop();
void livelink_scene_collection_changing();
void livelink_scene_collection_changed();
void livelink_recording_state(bool active, bool paused);
void livelink_recording_event(const char *kind);
