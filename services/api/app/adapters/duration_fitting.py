from array import array

RATE = 24000


def fit_duration(frames: bytes, target: float) -> tuple[bytes, dict]:
    """Only sample-quantization padding or digital silence removal; never cut speech."""
    wanted, actual = round(target * RATE), len(frames) // 2
    samples = array("h"); samples.frombytes(frames)
    if not samples or not any(samples): raise ValueError("Không-fit: engine tạo audio rỗng/im lặng.")
    clipped = sum(sample <= -32768 or sample >= 32767 for sample in samples)
    if clipped: raise ValueError(f"Không-fit: audio có {clipped} sample clipping.")
    delta = wanted - actual
    if abs(delta) > round(.06 * RATE):
        raise ValueError(f"Không-fit: engine trả {actual / RATE:.3f}s thay vì {target:.3f}s; không cắt lời để ép timing.")
    if delta < 0:
        if any(samples[wanted:]): raise ValueError("Không-fit: phần vượt timing chứa âm thanh; cần generate lại.")
        frames = frames[:wanted * 2]
    elif delta > 0:
        frames += b"\0" * (delta * 2)
    return frames, {"requestedDuration": target, "nativeDuration": actual / RATE, "actualDuration": len(frames) / 2 / RATE,
                    "paddingSeconds": max(0, delta) / RATE, "silentTrimSeconds": max(0, -delta) / RATE,
                    "durationError": len(frames) / 2 / RATE - target, "clippedSamples": clipped,
                    "speechVerified": False, "state": "needs-listening", "method": "native-duration+sample-padding-v1"}
