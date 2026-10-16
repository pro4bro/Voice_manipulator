from array import array
import random

from app.adapters.voice_stretch_audio import _count_clipped_samples


def test_native_scan_counts_only_exact_pcm16_clipping_endpoints():
    samples = array('h', [-32768, -32767, -1, 0, 1, 32766, 32767, 32767])
    assert _count_clipped_samples(samples) == 3
    assert _count_clipped_samples(array('h', [-32767, 32766])) == 0
    assert _count_clipped_samples(array('h')) == 0


def test_scan_matches_original_predicate_on_long_mixed_pcm():
    rng = random.Random(36)
    samples = array('h', (rng.randint(-32768, 32767) for _ in range(240000)))
    samples[0] = -32768; samples[-1] = 32767
    before = samples.tobytes()
    assert _count_clipped_samples(samples) == sum(value in (-32768, 32767) for value in samples)
    assert samples.tobytes() == before
