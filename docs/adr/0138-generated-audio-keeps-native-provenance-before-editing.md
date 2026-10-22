# ADR0138 — Keep native engine audio before publishing editable audio

Status: accepted, 2026-10-23. Integration correction within expressive rounds93–95.

Real F5, ViVoice, IndexTTS2.5 and Fish S2 Pro runs return floating-point WAVs.
Index returns22,050Hz and Fish44,100Hz. Direct generation previously recorded
the default24,000Hz while retaining these native bytes. Existing Voice Output
editing and rendering accept mono PCM16 at24,000Hz, so successful inference
alone did not establish a usable app output. Script composition already converts
clips before publishing; the missing boundary was direct generation.

Keep the worker's exact result as `native-audio.wav` inside the reserved Voice
Output folder. Create `audio.wav` as mono PCM16 at24,000Hz before saving the
Voice Output record. An already canonical result can be copied byte for byte;
other formats use the configured local FFmpeg tools. Derive published duration
and sample rate from the actual canonical WAV header rather than worker claims.

Retain a versioned `audio-provenance.json` sidecar with the engine/generator and
artifact identity, relative native/published paths, hashes and measured format,
rate, channels, frames and duration. Native bytes remain available for diagnosis
of resampling, quantization, clipping and boundaries. Conversion does not certify
acoustic quality or remove the need to inspect the original measurements.

The folder and its sidecar move with the Project. Existing public Voice Output
records and readers remain compatible; older outputs have no implied native
artifact or newly invented provenance. Failed conversion and cancellation discard
the entire reserved folder before publication. No source/reference is modified.

Supporting arbitrary native formats throughout every edit/render operation was
considered. A single publication boundary preserves the current editing contract
and limits the change, while retaining native audio avoids irreversible loss of
the engine result. Script composition keeps its existing clip conversion path.
