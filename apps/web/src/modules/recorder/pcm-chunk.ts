/**
 * Turning captured audio into something the recogniser can read.
 *
 * The browser's own speech recognition only ever listens to the default
 * microphone - it takes no stream and no device - so recording a tab produced a
 * transcript of the room instead of the tab. The way out is to transcribe the
 * audio actually being captured, which means handing whole, self-contained
 * chunks to the local STT service.
 *
 * A recording chunk from MediaRecorder cannot be decoded on its own, so the PCM
 * is tapped from the audio graph instead and written as WAV here: every chunk
 * stands alone, and the same code serves a microphone, a tab, or the whole
 * desktop.
 */

/** What the recogniser wants; anything else is resampled to it. */
export const RECOGNITION_SAMPLE_RATE = 16000;

/**
 * Resample to 16 kHz by linear interpolation.
 *
 * Speech recognition is unbothered by the artefacts a better filter would remove,
 * and this runs on the audio thread's output while someone is speaking.
 */
export function downsample(samples: Float32Array, fromRate: number, toRate = RECOGNITION_SAMPLE_RATE): Float32Array {
  if (!samples.length || fromRate <= 0) return new Float32Array(0);
  if (fromRate === toRate) return samples.slice();
  const ratio = fromRate / toRate;
  const length = Math.max(1, Math.floor(samples.length / ratio));
  const out = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    const position = index * ratio;
    const left = Math.floor(position);
    const right = Math.min(samples.length - 1, left + 1);
    const drift = position - left;
    out[index] = samples[left] * (1 - drift) + samples[right] * drift;
  }
  return out;
}

/** A 16-bit mono WAV, header and all, ready to POST. */
export function encodeWav(samples: Float32Array, sampleRate = RECOGNITION_SAMPLE_RATE): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);            // PCM
  view.setUint16(22, 1, true);            // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(44 + index * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

/** True when a chunk is too quiet to be worth a round trip to the recogniser. */
export function isSilent(samples: Float32Array, floor = 0.006): boolean {
  let sum = 0;
  for (let index = 0; index < samples.length; index += 1) sum += samples[index] * samples[index];
  return Math.sqrt(sum / Math.max(1, samples.length)) < floor;
}
