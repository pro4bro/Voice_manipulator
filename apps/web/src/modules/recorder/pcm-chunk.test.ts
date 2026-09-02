import { describe, expect, it } from "vitest";

import { RECOGNITION_SAMPLE_RATE, downsample, encodeWav, isSilent } from "./pcm-chunk";

function tone(seconds: number, rate: number, hz = 440, amplitude = 0.5): Float32Array {
  const samples = new Float32Array(Math.round(seconds * rate));
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = Math.sin((2 * Math.PI * hz * index) / rate) * amplitude;
  }
  return samples;
}

describe("downsample", () => {
  it("keeps the same amount of time at the new rate", () => {
    const out = downsample(tone(1, 48000), 48000);
    expect(out.length).toBeCloseTo(RECOGNITION_SAMPLE_RATE, -2);
  });

  it("leaves audio already at the target rate alone", () => {
    const source = tone(0.1, 16000);
    expect(downsample(source, 16000)).toEqual(source);
  });

  it("keeps the signal rather than flattening it", () => {
    const out = downsample(tone(0.2, 48000, 200), 48000);
    const peak = out.reduce((most, value) => Math.max(most, Math.abs(value)), 0);
    expect(peak).toBeGreaterThan(0.4);
  });

  it("has nothing to say about no audio", () => {
    expect(downsample(new Float32Array(0), 48000).length).toBe(0);
  });
});

describe("encodeWav", () => {
  it("writes a header the decoder can read", () => {
    const blob = encodeWav(tone(0.05, 16000));
    expect(blob.type).toBe("audio/wav");
    // 44-byte header plus two bytes a sample.
    expect(blob.size).toBe(44 + Math.round(0.05 * 16000) * 2);
  });
});

describe("isSilent", () => {
  it("spares the recogniser a round trip for a silent chunk", () => {
    expect(isSilent(new Float32Array(1600))).toBe(true);
  });

  it("passes speech-level audio through", () => {
    expect(isSilent(tone(0.1, 16000))).toBe(false);
  });
});
