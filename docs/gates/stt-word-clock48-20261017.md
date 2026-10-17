# Round48 — STT-WORD-CLOCK-AUDIT-01

2026-10-17. Owner clarifies that most words across projects appear early: a
subtitle word ends around the acoustic onset of that same word, except abnormal
long timings and sentence endings. This feedback remains unresolved; round47's
waveform rendering fix was not acceptance of linguistic word timing.

Requirements: STT-06, STT-09. Aggregate: stt-word-clock48-20261017.json.

## Same stored words across three projects

Read-only audit covers4137voiceover words,3820conversation words and33912lecture
words:41869total. The persisted STT hand-off JSON and saved words.json have exact
word order/text and identical STARTs for every word. Three ENDs differ by at most
0.0004s. The STT hand-off JSON has already passed product conversion/refinement;
it is not a claim that we retained the original native tensors from that old run.

Run the actual frontend editableWordTimings against all three word arrays and
actual WAV frame-derived durations: only5STARTs and54ENDs change, all in voiceover;
conversation/lecture intervals are unchanged. These changes are explicitly
untrusted estimates for malformed/overlapping timing, not a global word shift.

The converter, SRT round-trip, chunk offset, cut restoration and installed
faster-whisper1.2.1 token-boundary logic show no concrete general one-word index
swap/double offset. An adjacent prior word END equalling next START is a shared
boundary; it does not prove either boundary is acoustically correct. Earlier
round6 double-offset history concerned a derived diagnostic field, not a confirmed
production repair for this feedback.

## Fresh raw model capture on actual PCM

Frozen16s/mono PCM16/24kHz crops from source28–44s of each project retain original
PCM bytes and source-to-crop offset28s. Score targets inside source30–40s to avoid
using clipped edge words as primary targets. Hashes freeze inputs, current Studio
source and cached model weights. Isolated CPU/int8 large-v3, Vietnamese,4threads;
no user service/GPU use and no model download. Same-pass capture records native
word objects, converted words and pre/post phrase refiner data separately.

Native words:65voiceover,33conversation,58lecture. All155positive valid native
intervals map to the exact same text and start/end in conversion: max endpoint
change0s. One conversation crop-edge word has0–0 timing and is omitted; it remains
in the native evidence. The current quality label still says source, a separate
coverage-quality concern. It does not demonstrate the owner's widespread shift.
Phrase refinement changes6STARTs/9ENDs; middle words are retained.
CPU recognition wall times34.477s,17.379s,20.849s. Crop context/CPU execution differ
from the original full-footage recognition; do not call this an exact replay.

## Independent model comparison — supportive, not ground truth

Align the exact stored crop transcript with cached Vietnamese250h CTC/WhisperX on
CPU. All three token sequences match their stored inputs; all98preselected
interior target words have timed candidates. No identity shift is silently used.

| Case | Targets | Median candidate IN minus saved IN | Median candidate OUT minus saved OUT | Candidate IN closer to saved END than saved START |
| --- | ---: | ---: | ---: | ---: |
| Voiceover |43|+124ms|+72ms|33/43|
| Conversation |17|+168ms|+117ms|13/17|
| Lecture |38|+149.5ms|+84ms|38/38|

Thus84/98candidate starts lie nearer the saved word END. This supports the owner's
early-word-boundary hypothesis. It does not mean84words have independently proven
wrong timing: the second model can also fail. Candidate differences include large
outliers (IN absolute p95:366ms,1373ms,987ms; OUT:195ms,1472ms,170ms). No constant
word-width/offset repair or forced-alignment default is accepted from these data.
Exploratory same-token fresh-native pairings (39,16,38words) give candidate-start
median lags123ms,217ms,139ms; context/lexical differences and unmatched words remain
visible. These are model disagreements, not acoustic error distributions.

Aligner load141.265s; case alignment4.381s,1.488s,1.479s. One existing Transformers
gradient_checkpointing deprecation warning; no model quality pass inferred.

## Independent listening packet and validation

Retain all probe evidence under .scratch/timing48/run-1. A separate portable HTML
worksheet is .scratch/stt-timing-accuracy-01/round48-review-1/review-anchors.html.
It embeds exact audio, source-clock waveform,0.5x/0.75x playback and blank IN/OUT.
Twelve target labels are evenly spaced from the original98target index lists;
this subset was constructed after native inference, not pre-registered as a new
blind experiment. Labels remain ASR hypotheses. Neither model times nor VAD edges
are placed in the listener payload. No listener anchors are filled automatically.

Browser validation: audio duration16s, play advances, pause stops, blank IN/OUT,
0/12reviewed, no observed console errors/warnings. Screenshot: .scratch/timing48/
review48.png. Existing profiler/scorer/packet tests23pass/0.50s. No production
source/UI code changes, so no new full-suite pass is claimed (round47 full passes
remain in their own gate). All12source/artifact/crop hashes match after inference.
Private probe processes and listener18423have stopped; shared runtime untouched.
The initial native command ran before protocol preparation completed and failed
before inference/start receipt; its log is retained as native-before-protocol.log.
The sequential retry captured all three cases successfully; no evidence overwritten.

## Remaining gate / NEXT

Independent listener word IN/OUT errors remain null: zero heard anchors, not zero
error. The runtime cannot consume audio input for the agent; browser playback was
transport verification, not an independent listening review. Use the12word packet
to establish acoustic anchors and return reviewed-anchors.json. Keep the existing
coverage/confidence/proxy/IN/OUT budgets; validate any proposed correction on these
anchors and additional speakers/contexts before changing production timing.
Track the zero-duration omission/coverage label separately; it is not the root
cause established for this owner feedback. User originals, model defaults and
project word timing remain unchanged. Phase03 stays60%, Checkpoint A remains open.
