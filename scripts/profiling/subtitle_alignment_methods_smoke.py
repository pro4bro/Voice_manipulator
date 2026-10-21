"""Exercise selectable methods on an isolated project; reference never chooses timing."""
from __future__ import annotations

import argparse
from copy import deepcopy
import json
from pathlib import Path
import shutil
import sys
import time

REPO = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(REPO / "services/api"), str(Path(__file__).parent)]
from app.adapters.file_media_library import FileMediaLibrary
from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.subtitle_alignment import SubtitleAlignment
from app.domain.models import MediaAssetCreate, ProjectCreate
from subtitle_alignment_smoke import sha256, write_json, load_compare, evaluation_metrics


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--word-source", choices=("current", "reviewed"), default="current")
    parser.add_argument("--reuse-alignment", type=Path)
    parser.add_argument("--diagnose-only", action="store_true")
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    frozen = REPO / ".scratch/stt-conviction78/run-2"
    current = json.loads((REPO / ".scratch/stt-conviction78/current/current.json").read_text(encoding="utf-8"))
    reference = json.loads((frozen / "reviewed.json").read_text(encoding="utf-8"))
    source = current["words"] if args.word_source == "current" else reference
    original_record = json.loads((REPO / ".scratch/subtitle-alignment79/real/round79-final/hashes.json").read_text(encoding="utf-8"))
    owner_before = {name: sha256(Path(value["path"])) for name, value in original_record["ownerFilesBefore"].items()}
    projects = FileProjectRepository(output / "registry")
    project = projects.create(ProjectCreate(name=f"Alignment80 {args.word_source}", location=str(output)))
    root = Path(project.project_path)
    audio = root / "assets/audio.wav"
    audio.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(frozen / "analysis.wav", audio)
    media = FileMediaLibrary(projects)
    asset = media.create(project.id, MediaAssetCreate(name=f"Conviction {args.word_source}", source_path=str(audio),
        analysis_path=str(audio), source_extension=".wav", origin="import", media_kind="audio", duration=current["duration"],
        text=" ".join(w["text"] for w in source), words=source, word_timing_quality="partial", transcription_status="complete"))
    initial = deepcopy(media.get(project.id, asset.id).words)
    service = SubtitleAlignment(projects, media, REPO)
    replay_calls = []
    if args.reuse_alignment:
        prior = args.reuse_alignment.resolve()
        request = json.loads((prior / "alignment-input.json").read_text(encoding="utf-8"))
        result = json.loads((prior / "alignment-output.json").read_text(encoding="utf-8"))
        manifest = json.loads((prior / "hashes.json").read_text(encoding="utf-8"))
        if (request["words"] != initial or request["audioSha256"] != sha256(audio)
                or result["audioSha256"] != sha256(audio) or manifest["alignmentWorkerSha256"] != sha256(service.aligner.worker)
                or result["weightsSha256"] != sha256(service.aligner.model / "pytorch_model.bin")):
            raise ValueError("Prior measured evidence does not match exact input, worker and model.")
        def replay(project_root, audio_path, words, folder, indexes):
            if words != request["words"] or indexes != request["indexes"]:
                raise ValueError("Replay scope changed")
            replay_calls.append(indexes)
            for name in ("alignment-input.json", "alignment-output.json", "alignment.log"):
                shutil.copy2(prior / name, folder / name)
            return {**service.aligner.report(), **result, "status": "complete", "replayedFrozenEvidence": True}
        service.aligner.run = replay
    compare = load_compare()
    pairs = compare.lexical_pairs([w["text"] for w in initial], [w["text"] for w in reference])
    methods = ["diagnose"] if args.diagnose_only else ["auto", "diagnose", "common-offset", "edge-offset", "group-offset", "ctc", "waveform", "offset"]
    reports = {}
    for mode in methods:
        started = time.perf_counter()
        proposal = service.analyze(project.id, asset.id, mode=mode, start_offset_ms=100 if mode == "offset" else 0,
                                   end_offset_ms=80 if mode == "offset" else 0)
        assert media.get(project.id, asset.id).words == initial
        ready = [r["index"] for r in proposal["rows"] if r["status"] == "ready"]
        selected = deepcopy(initial)
        for row in proposal["rows"]:
            if row["index"] in ready:
                selected[row["index"]].update(row["after"])
        if mode == "diagnose":
            try:
                service.apply(project.id, asset.id, proposal["id"], [0], [{"index": 0, "start": .1, "end": .2, "reviewed": True}])
                raise AssertionError("Diagnosis unexpectedly allowed apply")
            except ValueError:
                pass
        elif ready:
            service.apply(project.id, asset.id, proposal["id"], ready, [])
            service.restore(project.id, asset.id, proposal["id"])
            assert media.get(project.id, asset.id).words == initial
        write_json(output / f"{mode}.json", proposal)
        evaluated = compare.compare(reference, selected, asset.duration, pairs=pairs)
        reports[mode] = {"summary": proposal["summary"], "drift": {k: v for k, v in proposal["diagnostics"]["drift"].items() if k != "suspects"},
            "defaultSelectedMetrics": evaluation_metrics(evaluated, reference, selected), "applyRestoreChecked": bool(ready),
            "readOnlyChecked": mode == "diagnose", "reusedAcoustic": proposal["aligner"].get("reused", False),
            "alignerStatus": proposal["aligner"]["status"], "elapsedSeconds": time.perf_counter() - started}
    owner_after = {name: sha256(Path(value["path"])) for name, value in original_record["ownerFilesBefore"].items()}
    assert owner_before == owner_after
    assert sha256(audio) == sha256(frozen / "analysis.wav")
    write_json(output / "report.json", {"wordSource": args.word_source, "freshInference": not bool(args.reuse_alignment),
        "replayCalls": len(replay_calls), "ownerBefore": owner_before, "ownerAfter": owner_after,
        "sourceWordCount": len(initial), "normalizationChangedClone": initial != source,
        "referenceUsedForSelection": False, "methods": reports})
    print(json.dumps({"output": str(output), "methods": {m: {"summary": r["summary"], "drift": r["drift"], "reused": r["reusedAcoustic"]} for m, r in reports.items()}}, ensure_ascii=False))


if __name__ == "__main__":
    main()
