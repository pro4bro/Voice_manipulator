import { describe, expect, it } from "vitest";

import { RECOGNITION_SAMPLE_RATE, downsample, encodeWav, int16FrameCount, isSilent, toInt16, wavFromInt16 } from "./pcm-chunk";

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

describe("lossless take encoding", () => {
  function readHeader(bytes: Uint8Array) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return {
      riff: String.fromCharCode(...bytes.slice(0, 4)),
      wave: String.fromCharCode(...bytes.slice(8, 12)),
      format: view.getUint16(20, true),
      channels: view.getUint16(22, true),
      sampleRate: view.getUint32(24, true),
      bitsPerSample: view.getUint16(34, true),
      dataBytes: view.getUint32(40, true),
    };
  }

  it("keeps the capture rate rather than resampling in the browser", async () => {
    const blob = wavFromInt16([toInt16(new Float32Array(480))], 48000);
    const header = readHeader(new Uint8Array(await blob.arrayBuffer()));

    expect(header.riff).toBe("RIFF");
    expect(header.wave).toBe("WAVE");
    expect(header.format).toBe(1);        // uncompressed PCM
    expect(header.channels).toBe(1);
    expect(header.sampleRate).toBe(48000);
    expect(header.bitsPerSample).toBe(16);
  });

  it("writes every chunk, in order, with nothing dropped at the seams", async () => {
    const first = toInt16(new Float32Array([1, -1]));
    const second = toInt16(new Float32Array([0, 0.5]));
    const bytes = new Uint8Array(await wavFromInt16([first, second], 24000).arrayBuffer());
    const view = new DataView(bytes.buffer);

    expect(readHeader(bytes).dataBytes).toBe(8);
    expect(view.getInt16(44, true)).toBe(0x7fff);
    expect(view.getInt16(46, true)).toBe(-0x8000);
    expect(view.getInt16(48, true)).toBe(0);
    expect(view.getInt16(50, true)).toBe(Math.trunc(0.5 * 0x7fff));
  });

  it("clamps rather than wrapping, so a hot take distorts instead of inverting", () => {
    const clipped = toInt16(new Float32Array([2, -2]));

    expect(clipped[0]).toBe(0x7fff);
    expect(clipped[1]).toBe(-0x8000);
  });

  it("counts frames across chunks, which is what gives the take its duration", () => {
    expect(int16FrameCount([new Int16Array(3), new Int16Array(5)])).toBe(8);
    expect(int16FrameCount([])).toBe(0);
  });

  it("produces a header-only file for an empty take instead of throwing", async () => {
    const blob = wavFromInt16([], 48000);

    expect(blob.size).toBe(44);
  });
});
