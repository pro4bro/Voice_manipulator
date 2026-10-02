# ADR 0022: OBS LiveLink live STT profile

Date: 2026-10-02
Status: Accepted for the development machine; real OBS load gate open

## Decision

The OBS LiveLink v3 transcription adapter requests the `medium` Faster-Whisper
model and sends a four-second voiced window to the studio. Each utterance uses
the Project's configured language when present. A Project with no language
continues automatic detection, so an English or mixed-language Project is not
silently forced to Vietnamese. This change applies only to LiveLink v3;
imported media and detailed batch STT retain their own model choices.

The adapter keeps its per-channel ordered queues and independent durable PCM
ACK boundary. If recognition still falls behind the bounded queue, it reports
the error rather than claiming a complete transcript.

The portable STT setup preloads `medium` along with its batch model. Portable
validation fails when `medium` is missing, because the bundle must run without
fetching weights on the destination machine.

## Evidence and tradeoff

The owner's Track 1 live transcript had 171 queue-full events and 203 seconds
maximum event lag despite gap-free archived PCM. The original profile ran
`tiny` every two seconds; this gave little context and repeated inference over
the studio's rolling buffer. In a 24-second-per-track, two-stream replay of
preserved project audio, the old profile took 72.69 seconds for 24 calls and
the new profile took 12.28 seconds for 12 calls on the development CUDA
runtime. A separate 12-second sample showed more intelligible Vietnamese
phrases with `medium`. These are timing and qualitative checks, not a scored
accuracy benchmark; model startup, long takes and other hardware can differ.

The four-second window can delay a partial caption by up to roughly two
additional seconds during uninterrupted speech. An utterance ending earlier
still flushes after the silence boundary. A wider window improves context and
reduces repeated calls, but the physical long-recording gate must measure
latency, queue overflow and PCM spool pressure under actual OBS load.
