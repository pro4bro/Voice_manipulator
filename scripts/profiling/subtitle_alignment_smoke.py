"""Run the real subtitle-alignment adapter on an isolated Conviction clone.

The owner-reviewed file is loaded only by the evaluator after alignment and
apply/restore have completed. This command never writes to owner project data.
"""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import shutil
import statistics
import sys
from typing import Any


REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "services/api"))

from app.adapters.file_media_library import FileMediaLibrary
from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.subtitle_alignment import SubtitleAlignment
from app.domain.models import MediaAssetCreate, ProjectCreate


def sha256(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x", encoding="utf-8") as stream:
        json.dump(value, stream, ensure_ascii=False, allow_nan=False, indent=2)


def load_compare():
    source = REPO / "scripts/profiling/stt_reviewed_timing.py"
    spec = importlib.util.spec_from_file_location("stt_reviewed_timing_smoke", source)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot import evaluator: {source}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def stats(values: list[float]) -> dict[str, float | int] | None:
    if not values:
        return None
    ordered = sorted(values)
    return {
        "count": len(ordered),
        "mean_ms": statistics.mean(ordered) * 1000,
        "median_ms": statistics.median(ordered) * 1000,
        "p95_ms": ordered[math.ceil(0.95 * len(ordered)) - 1] * 1000,
    }


def evaluation_metrics(report: dict[str, Any], reference: list[dict], candidate: list[dict]) -> dict[str, Any]:
    paired = report["perWord"]
    span_errors = [
        (candidate[row["candidateIndex"]]["end"] - candidate[row["candidateIndex"]]["start"])
        - (reference[row["referenceIndex"]]["end"] - reference[row["referenceIndex"]]["start"])
        for row in paired
    ]
    return {
        "matched_manual_pairs": len(paired),
        "manual_reference_words": report["manualReferenceWords"],
        "unique_pair_coverage": report["coverage"],
        "in_abs": stats([abs(row["start"]) for row in paired]),
        "out_abs": stats([abs(row["end"]) for row in paired]),
        "span_abs": stats([abs(value) for value in span_errors]),
        "in_over_500ms": sum(abs(row["start"]) > 0.5 for row in paired),
        "out_over_500ms": sum(abs(row["end"]) > 0.5 for row in paired),
        "either_endpoint_over_500ms": sum(max(abs(row["start"]), abs(row["end"])) > 0.5 for row in paired),
        "invalid_candidate_indices": report["invalidCandidateIndices"],
        "candidate_overlap_pairs": report["candidateOverlapPairs"],
    }


def provenance_stays(original: list[dict], saved: list[dict], changed: set[int]) -> list[str]:
    failures = []
    for index, (before, after) in enumerate(zip(original, saved)):
        if index not in changed and before != after:
            failures.append(f"untouched-word-{index}-changed")
            continue
        for key in ("text", "speakerId", "emotion", "diarizationSpeakerId", "manualDiarizationSpeakerId"):
            if before.get(key) != after.get(key):
                failures.append(f"word-{index}-{key}-changed")
        if index in changed:
            for key in ("timingSource", "timingTrusted", "sourceTiming", "subtitleAlignmentId"):
                if key == "timingSource":
                    if not str(after.get(key, "")).startswith("subtitle-alignment-"):
                        failures.append(f"word-{index}-alignment-provenance-missing")
                elif key == "timingTrusted":
                    if after.get(key) is not True:
                        failures.append(f"word-{index}-not-trusted-after-apply")
                elif key == "sourceTiming":
                    expected = before.get(key) or {"start": before.get("start"), "end": before.get("end"), "source": before.get("timingSource")}
                    if after.get(key) != expected:
                        failures.append(f"word-{index}-source-timing-changed")
                elif not after.get(key):
                    failures.append(f"word-{index}-alignment-id-missing")
    return failures


def offset_test_index(words: list[dict], duration: float, locked: set[int]) -> int:
    for index, word in enumerate(words):
        start, end = word.get("start"), word.get("end")
        if index in locked or not isinstance(start, (int, float)) or not isinstance(end, (int, float)):
            continue
        if not 0 <= start < end <= duration or end - start < 0.025 or end + 0.08 > duration:
            continue
        after = (start + 0.1, end + 0.08)
        conflicts = any(
            other_index != index
            and isinstance(other.get("start"), (int, float))
            and isinstance(other.get("end"), (int, float))
            and other["start"] < after[1]
            and after[0] < other["end"]
            for other_index, other in enumerate(words)
        )
        if not conflicts:
            return index
    raise RuntimeError("No isolated word can safely demonstrate the explicit offset control.")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True, type=Path, help="New, non-existing evidence folder")
    parser.add_argument("--runtime-root", type=Path, default=REPO, help="Root containing the cached model and CPU runtime")
    parser.add_argument("--reuse-alignment", type=Path, help="Reuse an immutable prior smoke folder; verify exact words and PCM, no inference")
    parser.add_argument("--bulk-common-offset", action="store_true", help="Exercise explicit common-offset preview from measured CTC medians, then restore")
    args = parser.parse_args()
    output = args.output.expanduser().resolve()
    runtime_root = args.runtime_root.expanduser().resolve()
    if output.exists():
        raise FileExistsError(f"Refusing to overwrite existing evidence directory: {output}")
    output.mkdir(parents=True)

    run2 = REPO / ".scratch/stt-conviction78/run-2"
    current_dir = REPO / ".scratch/stt-conviction78/current"
    frozen_audio = run2 / "analysis.wav"
    current_path = current_dir / "current.json"
    reference_path = run2 / "reviewed.json"
    current_doc = json.loads(current_path.read_text(encoding="utf-8"))
    source_words = current_doc["words"]
    duration = float(current_doc["duration"])
    compare = load_compare()

    inputs_record = json.loads((run2 / "inputs.json").read_text(encoding="utf-8"))
    owner_paths = {name: (REPO / path).resolve() for path, meta in inputs_record["inputs"].items()
                   for name in (Path(path).name,)}
    owner_before = {name: {"path": str(path), "sha256": sha256(path)} for name, path in owner_paths.items()}
    before_input_hashes = {
        "frozen_analysis_wav": sha256(frozen_audio),
        "current_words_json": sha256(current_path),
        "reviewed_evaluator_json": sha256(reference_path),
        "current_word_array": hashlib.sha256(json.dumps(source_words, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest(),
    }

    source_copy = output / "frozen-analysis.wav"
    shutil.copy2(frozen_audio, source_copy)
    # Asset source and analysis resolve to the same immutable copied PCM file.
    project_root = output / "project"
    projects = FileProjectRepository(output / "registry")
    project = projects.create(ProjectCreate(name="Conviction Alignment Smoke", location=str(project_root.parent)))
    project_root = Path(project.project_path).resolve()
    cloned_audio = project_root / "assets/media/conviction-analysis.wav"
    cloned_audio.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source_copy, cloned_audio)
    media = FileMediaLibrary(projects)
    asset = media.create(project.id, MediaAssetCreate(
        name="conviction-analysis.wav", source_extension=".wav", media_kind="audio",
        source_path=str(cloned_audio), analysis_path=str(cloned_audio), duration=duration,
        sample_rate=24000, audio_codec="pcm_s16le", origin="import",
        text=current_doc["text"], words=source_words, word_timing_quality="partial",
        transcription_status="complete",
    ))
    service = SubtitleAlignment(projects, media, runtime_root)
    if args.reuse_alignment:
        previous = args.reuse_alignment.resolve()
        prior_input = json.loads((previous / "alignment-input.json").read_text(encoding="utf-8"))
        prior_output = json.loads((previous / "alignment-output.json").read_text(encoding="utf-8"))
        prior_proposal = json.loads((previous / "result-auto.json").read_text(encoding="utf-8"))
        if prior_input["words"] != source_words or prior_input["audioSha256"] != sha256(cloned_audio) or prior_output["audioSha256"] != sha256(cloned_audio):
            raise ValueError("Cached alignment is not bound to these exact input words and PCM")
        def replay(project_root, audio, words, folder, indexes):
            for name in ("alignment-input.json", "alignment-output.json", "alignment.log"):
                shutil.copy2(previous / name, folder / name)
            return {**prior_proposal["aligner"], **prior_output, "reusedAlignment": True,
                    "reusedOutputSha256": sha256(previous / "alignment-output.json")}
        service.aligner.run = replay
    initial = media.get(project.id, asset.id)
    initial_words = initial.words
    initial_text = initial.text
    if initial_words != source_words or initial_text != current_doc["text"]:
        raise RuntimeError("FileMediaLibrary changed the frozen transcript during clone import.")
    cloned_audio_sha = sha256(cloned_audio)
    write_json(output / "request-auto.json", {
        "mode": "auto", "source": "frozen current.json words + run-2 analysis.wav",
        "audioSha256": cloned_audio_sha, "wordCount": len(initial_words),
        "duration": duration, "referenceUsedForInference": False,
        "runtimeRoot": str(runtime_root), "modelReport": service.aligner.report(),
    })
    proposal = service.analyze(project.id, asset.id, mode="auto")
    if proposal["aligner"].get("status") != "complete":
        raise RuntimeError(f"Real local CTC did not complete: {proposal['aligner']}")
    proposal_id = proposal["id"]
    proposal_document = json.loads((project_root / "jobs/subtitle-alignment" / asset.id / f"{proposal_id}.json").read_text(encoding="utf-8"))
    alignment_folder = project_root / "jobs/subtitle-alignment" / asset.id / proposal_id
    write_json(output / "alignment-invocation.json", {
        "executedInThisRun": not bool(args.reuse_alignment),
        "reusedFrom": str(args.reuse_alignment.resolve()) if args.reuse_alignment else None,
        "command": [str(service.aligner.python), str(service.aligner.worker),
                    str(alignment_folder / "alignment-input.json"),
                    str(alignment_folder / "alignment-output.json"), str(project_root),
                    str(service.aligner.model)],
        "runtimePython": str(service.aligner.python),
        "worker": str(service.aligner.worker),
        "modelPath": str(service.aligner.model),
        "device": "cpu",
        "offline": True,
        "cudaVisibleDevices": "",
        "threadLimits": {"OMP_NUM_THREADS": 4, "MKL_NUM_THREADS": 4,
                         "torchIntraop": 4, "torchInterop": 2},
    })
    ready = [row["index"] for row in proposal["rows"] if row["status"] == "ready"]
    reasons = Counter(reason for row in proposal["rows"] for reason in row["reasons"])
    write_json(output / "result-auto.json", proposal)
    write_json(output / "proposal-auto-document.json", proposal_document)
    shutil.copy2(alignment_folder / "alignment.log", output / "alignment.log")
    shutil.copy2(alignment_folder / "alignment-input.json", output / "alignment-input.json")
    shutil.copy2(alignment_folder / "alignment-output.json", output / "alignment-output.json")

    # Load reviewed timing only after inference and proposal selection; it cannot
    # affect model input or proposal selection.
    reference_doc = json.loads(reference_path.read_text(encoding="utf-8"))
    reference_words = reference_doc["words"] if isinstance(reference_doc, dict) else reference_doc
    pairs = compare.lexical_pairs([word["text"] for word in initial_words], [word["text"] for word in reference_words])
    accepted_words = [dict(word) for word in initial_words]
    for row in proposal["rows"]:
        if row["status"] == "ready":
            accepted_words[row["index"]] = {**accepted_words[row["index"]], **row["after"]}
    eval_baseline = compare.compare(reference_words, initial_words, duration, pairs=pairs)
    eval_accepted = compare.compare(reference_words, accepted_words, duration, pairs=pairs)
    accepted_pairs = [(i, j) for i, j in pairs if i in set(ready)]
    eval_ready_subset = compare.compare(reference_words, accepted_words, duration, pairs=accepted_pairs)
    baseline_metrics = evaluation_metrics(eval_baseline, reference_words, initial_words)
    accepted_metrics = evaluation_metrics(eval_accepted, reference_words, accepted_words)
    ready_metrics = evaluation_metrics(eval_ready_subset, reference_words, accepted_words)
    baseline_by_pair = {(row["candidateIndex"], row["referenceIndex"]): row for row in eval_baseline["perWord"]}
    accepted_by_pair = {(row["candidateIndex"], row["referenceIndex"]): row for row in eval_accepted["perWord"]}
    regressions = {"in_abs_worsened": 0, "out_abs_worsened": 0, "new_in_over_500ms": 0, "new_out_over_500ms": 0}
    for key, after in accepted_by_pair.items():
        before = baseline_by_pair[key]
        regressions["in_abs_worsened"] += abs(after["start"]) > abs(before["start"]) + 1e-9
        regressions["out_abs_worsened"] += abs(after["end"]) > abs(before["end"]) + 1e-9
        regressions["new_in_over_500ms"] += abs(after["start"]) > 0.5 and abs(before["start"]) <= 0.5
        regressions["new_out_over_500ms"] += abs(after["end"]) > 0.5 and abs(before["end"]) <= 0.5

    apply_receipt = None
    if ready:
        apply_receipt = service.apply(project.id, asset.id, proposal_id, ready, [])
        applied_asset = media.get(project.id, asset.id)
        saved_words = applied_asset.words
        metadata_failures = provenance_stays(initial_words, saved_words, set(ready))
        if metadata_failures or applied_asset.text != initial_text or sha256(cloned_audio) != cloned_audio_sha:
            raise RuntimeError(f"Apply changed protected content: {metadata_failures}")
        for row in proposal["rows"]:
            if row["status"] == "ready":
                saved = saved_words[row["index"]]
                if not math.isclose(saved["start"], row["after"]["start"], abs_tol=1e-7) or not math.isclose(saved["end"], row["after"]["end"], abs_tol=1e-7):
                    raise RuntimeError(f"Applied interval mismatch at word {row['index']}")
        applied_word_hash = hashlib.sha256(json.dumps(saved_words, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        restored = service.restore(project.id, asset.id, proposal_id)
        restored_asset = media.get(project.id, asset.id)
        if restored_asset.words != initial_words or restored_asset.text != initial_text or sha256(cloned_audio) != cloned_audio_sha:
            raise RuntimeError("Auto apply/restore did not reproduce the exact cloned source state.")
    else:
        applied_word_hash = None
        restored = None
        metadata_failures = []

    locked = {index for index, row in enumerate(proposal["rows"]) if row["status"] == "locked"}
    offset_index = offset_test_index(initial_words, duration, locked)
    offset_request = {"mode": "offset", "startOffsetMs": 100, "endOffsetMs": 80, "indexes": [offset_index]}
    offset_proposal = service.analyze(project.id, asset.id, mode="offset", start_offset_ms=100, end_offset_ms=80, indexes=[offset_index])
    offset_row = offset_proposal["rows"][offset_index]
    if offset_row["status"] != "ready":
        raise RuntimeError(f"Controlled offset did not produce a safe ready proposal at {offset_index}: {offset_row}")
    offset_applied = service.apply(project.id, asset.id, offset_proposal["id"], [offset_index], [])
    offset_words_after_apply = media.get(project.id, asset.id).words
    if not math.isclose(offset_words_after_apply[offset_index]["start"], initial_words[offset_index]["start"] + 0.1, abs_tol=1e-7):
        raise RuntimeError("Controlled IN offset was not applied exactly.")
    if not math.isclose(offset_words_after_apply[offset_index]["end"], initial_words[offset_index]["end"] + 0.08, abs_tol=1e-7):
        raise RuntimeError("Controlled OUT offset was not applied exactly.")
    offset_restored = service.restore(project.id, asset.id, offset_proposal["id"])
    if media.get(project.id, asset.id).words != initial_words:
        raise RuntimeError("Controlled offset restore did not reproduce cloned words.")

    moved_root = project_root.with_name(project_root.name + "-reopened")
    shutil.move(str(project_root), str(moved_root))
    reopened = projects.open(str(moved_root))
    if reopened.id != project.id:
        raise RuntimeError("Cloned project did not reopen with its original identity.")
    latest = service.latest(project.id, asset.id)
    if not latest or latest["id"] != offset_proposal["id"] or latest["stale"] or latest["state"] != "restored":
        raise RuntimeError(f"Restored proposal did not reopen portably: {latest}")
    proposal_text = (moved_root / "jobs/subtitle-alignment" / asset.id / f"{offset_proposal['id']}.json").read_text(encoding="utf-8")
    if str(project_root) in proposal_text:
        raise RuntimeError("Proposal snapshot contains the old absolute project path.")

    if args.bulk_common_offset:
        diagnostics = proposal["diagnostics"]
        common_ms = round(statistics.median([diagnostics["median_start_offset"], diagnostics["median_end_offset"]]) * 1000)
        bulk = service.analyze(project.id, asset.id, mode="offset", start_offset_ms=common_ms, end_offset_ms=common_ms)
        selected = [row["index"] for row in bulk["rows"] if row["status"] == "ready"]
        service.apply(project.id, asset.id, bulk["id"], selected, [])
        shifted = media.get(project.id, asset.id).words
        evaluated = compare.compare(reference_words, shifted, duration, pairs=pairs)
        baseline_pairs = {(row["candidateIndex"], row["referenceIndex"]): row for row in eval_baseline["perWord"]}
        new_large = {edge: sum(abs(row[edge]) > .5 and abs(baseline_pairs[(row["candidateIndex"], row["referenceIndex"])][edge]) <= .5
                               for row in evaluated["perWord"]) for edge in ("start", "end")}
        service.restore(project.id, asset.id, bulk["id"])
        if media.get(project.id, asset.id).words != initial_words:
            raise RuntimeError("Bulk offset restore did not reproduce original words.")
        write_json(output / "bulk-offset-experiment.json", {"automaticPolicy": False, "referenceUsedForOffset": False,
            "offsetSource": "Explicit preview of measured global CTC medians; not globally certified",
            "offsetMs": common_ms, "summary": bulk["summary"], "metrics": evaluation_metrics(evaluated, reference_words, shifted),
            "newErrorsOver500ms": new_large, "applyRestoreExact": True, "proposalId": bulk["id"]})

    owner_after = {name: {"path": str(path), "sha256": sha256(path)} for name, path in owner_paths.items()}
    if owner_before != owner_after:
        raise RuntimeError("An owner media/reference file changed during the clone-only run.")
    if before_input_hashes["frozen_analysis_wav"] != sha256(frozen_audio) or before_input_hashes["current_words_json"] != sha256(current_path) or before_input_hashes["reviewed_evaluator_json"] != sha256(reference_path):
        raise RuntimeError("A frozen source artifact changed during the run.")

    write_json(output / "request-offset.json", offset_request)
    write_json(output / "result-offset.json", offset_proposal)
    write_json(output / "metrics.json", {
        "referenceCaveat": eval_accepted["referenceCaveat"],
        "referenceUsedForInferenceOrSelection": False,
        "pairing": "One fixed unambiguous lexical-pair set from current.json to reviewed.json; timing does not choose pairs.",
        "matchedPairCountBeforeManualFilter": len(pairs),
        "baselineCurrent": baseline_metrics,
        "acceptedDefaultAllFixedPairs": accepted_metrics,
        "acceptedReadyRowsSubset": ready_metrics,
        "readyPairCoverageOfManualReference": ready_metrics["unique_pair_coverage"],
        "acceptedUniquePairs": len(eval_ready_subset["perWord"]),
        "reasons": dict(reasons),
        "summary": proposal["summary"],
        "regressionsAgainstCurrent": regressions,
        "autoAppliedReadyCount": len(ready),
        "autoAppliedWordHash": applied_word_hash,
        "autoApplyProtectedMetadataFailures": metadata_failures,
        "autoRestored": bool(restored),
        "offsetIndex": offset_index,
        "offsetBefore": initial_words[offset_index],
        "offsetAfter": offset_row["after"],
        "offsetApplyState": offset_applied["proposal"]["state"],
        "offsetRestored": offset_restored["proposal"]["state"] == "restored",
        "portableReopen": {"projectId": reopened.id, "proposalId": latest["id"], "stale": latest["stale"], "state": latest["state"]},
    })
    write_json(output / "hashes.json", {
        "frozenInputsBefore": before_input_hashes,
        "ownerFilesBefore": owner_before,
        "ownerFilesAfter": owner_after,
        "clonedAudioSha256": cloned_audio_sha,
        "clonedAudioAfterSha256": sha256(moved_root / "assets/media/conviction-analysis.wav"),
        "currentWordsAfterSha256": sha256(current_path),
        "reviewedEvaluatorAfterSha256": sha256(reference_path),
        "clonedWordsAfterSha256": sha256(moved_root / "assets/media" / asset.id / "words.json"),
        "clonedWordsEqualCurrent": json.loads((moved_root / "assets/media" / asset.id / "words.json").read_text(encoding="utf-8")) == source_words,
        "model": proposal["aligner"],
        "alignmentWorkerSha256": sha256(REPO / "services/api/app/workers/subtitle_alignment_worker.py"),
        "alignmentAdapterSha256": sha256(REPO / "services/api/app/adapters/subtitle_alignment.py"),
        "domainLogicSha256": sha256(REPO / "services/api/app/domain/subtitle_alignment.py"),
        "comparisonCodeSha256": sha256(REPO / "scripts/profiling/stt_reviewed_timing.py"),
        "smokeRunnerSha256": sha256(Path(__file__).resolve()),
    })
    shutil.copy2(reference_path, output / "reviewed-evaluator-copy.json")
    shutil.copy2(current_path, output / "current-input-copy.json")
    shutil.copy2(REPO / "scripts/profiling/stt_reviewed_timing.py", output / "stt_reviewed_timing.py")
    print(json.dumps({"output": str(output), "project": str(moved_root), "proposal": proposal_id,
                      "ready": len(ready), "auto_metrics": accepted_metrics,
                      "ready_subset_metrics": ready_metrics, "offset_index": offset_index,
                      "hashes": str(output / "hashes.json")}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
