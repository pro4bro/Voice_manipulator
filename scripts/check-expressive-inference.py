"""Run one pinned local engine through its product worker; retain measured evidence.

This is an engineering smoke check. It cannot certify speaker identity, language
accuracy, emotion or vocal effort, and does not create a project voice/model.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services/api"))


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            value.update(block)
    return value.hexdigest()


def audio_evidence(path: Path) -> dict:
    import numpy as np
    import soundfile as sf

    audio, rate = sf.read(path, dtype="float32", always_2d=True)
    if not audio.size or not np.isfinite(audio).all():
        raise ValueError("Audio is empty or non-finite.")
    peak = float(np.max(np.abs(audio)))
    if peak <= 1e-8 or audio.shape[1] != 1:
        raise ValueError("Audio must be non-silent mono.")
    rms = lambda values: float(np.sqrt(np.mean(np.square(values.astype(np.float64)))))
    edge = max(1, min(len(audio), int(rate * .02)))
    return {"sampleRate": rate, "channels": audio.shape[1], "frames": len(audio),
            "seconds": len(audio) / rate, "subtype": sf.info(path).subtype,
            "peak": peak, "rms": rms(audio), "fullScaleFraction": float(np.mean(np.abs(audio) >= 1)),
            "nearFullScaleFraction": float(np.mean(np.abs(audio) >= 32767 / 32768)),
            "firstSample": float(audio[0, 0]), "lastSample": float(audio[-1, 0]),
            "maxAdjacentSampleDelta": float(np.max(np.abs(np.diff(audio, axis=0)))) if len(audio) > 1 else 0.0,
            "first20msRms": rms(audio[:edge]), "last20msRms": rms(audio[-edge:]),
            "sha256": digest(path)}


def main(argv=None) -> int:
    from app.adapters.expressive_engines import ExpressiveSpeech, SPECS, expressive_paths
    from app.adapters.gpu_lease import GpuLease
    from app.adapters.omnivoice_generator import SpeechRequest
    from app.domain.models import ProjectVoice, TrainingModelDescriptor
    from app.domain.training_parameters import resolve_parameters
    from app.settings import Settings

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--engine", choices=SPECS, required=True)
    parser.add_argument("--reference", type=Path, required=True)
    parser.add_argument("--reference-source", required=True)
    parser.add_argument("--ref-text", required=True)
    parser.add_argument("--text", required=True)
    parser.add_argument("--language", default="en")
    parser.add_argument("--options", default="{}", help="JSON generator parameter overrides")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(argv)
    output = args.output.resolve()
    if output.exists() or output.with_suffix(".report.json").exists():
        parser.error("Choose a new output/report path; existing evidence is preserved.")
    if output == args.reference.resolve():
        parser.error("Output cannot replace the reference.")
    output.parent.mkdir(parents=True, exist_ok=True)
    began = time.monotonic()
    report = {"engine": args.engine, "referenceSource": args.reference_source,
              "referenceText": args.ref_text, "text": args.text, "language": args.language,
              "structuralPassed": False, "acousticAccepted": False, "trainingPerformed": False}
    worker, lease, holder = None, None, None
    reference_hash = None
    try:
        reference_hash = digest(args.reference)
        report["reference"] = audio_evidence(args.reference)
        settings = Settings.from_env()
        paths = expressive_paths(settings.research_engines_root, ROOT / ".runtime/python")[args.engine]
        reason = paths.unavailable_reason()
        if reason:
            raise RuntimeError(reason)
        runtime_receipt = (paths.runtime / ".pro4bro-expressive-runtime.json").read_bytes()
        report["runtimeReceipt"] = json.loads(runtime_receipt)
        report["runtimeReceiptSha256"] = hashlib.sha256(runtime_receipt).hexdigest()
        descriptor = TrainingModelDescriptor.model_validate_json((ROOT / "services/api/app/resources/voice-generators" / f"{args.engine}-generate.json").read_text(encoding="utf-8"))
        overrides = json.loads(args.options)
        if args.engine == "indextts25":
            overrides.setdefault("language", args.language.upper())
        parameters = resolve_parameters(descriptor, overrides)
        report["generationParameters"] = dict(parameters)
        language = parameters.pop("language", args.language)
        report["language"] = language
        speed = parameters.pop("speed", None)
        identity = paths.model_identity()
        report.update(parameters=parameters, baseIdentity=identity, sourceRevision=paths.spec.revision)
        voice = ProjectVoice(name="Engineering smoke reference", speaker_profile_id="engineering-fixture",
            engine=args.engine, base_model=paths.spec.model_id, reference_audio=args.reference.name,
            reference_text=args.ref_text, reference_seconds=report["reference"]["seconds"], language=args.language)
        worker = paths.worker()
        speech = ExpressiveSpeech(worker, paths)
        request = SpeechRequest(voice, args.reference.resolve(), None, None, args.text, parameters,
                                language, speed, None, output, identity)
        payload = speech.payload(request)
        lease = GpuLease(settings.data_root / "runtime/gpu-lease.json")
        holder = lease.acquire(f"{args.engine} engineering smoke")
        result = worker.request(payload)
        if not result.get("ok"):
            raise RuntimeError(result.get("error", "Worker failed."))
        report["output"] = audio_evidence(output)
        report["worker"] = result
        report["structuralPassed"] = True
    except Exception as exc:
        report["error"] = f"{type(exc).__name__}: {exc}"
    finally:
        if worker is not None:
            worker.shutdown()
            # Engineering evidence retains the same diagnostic tail used by
            # the product transport when a child fails or stops answering.
            report["workerDiagnostics"] = list(worker._stderr)
        if lease is not None and holder is not None:
            lease.release(holder.token)
        if reference_hash is not None:
            report["referenceUnchanged"] = digest(args.reference) == reference_hash
            if not report["referenceUnchanged"]:
                report.update(structuralPassed=False, error="Reference changed during inference.")
        report["elapsedSeconds"] = time.monotonic() - began
        output.with_suffix(".report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["structuralPassed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
