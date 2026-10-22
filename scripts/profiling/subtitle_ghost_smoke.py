"""Run composed ghost previews and exact Apply/Restore on a disposable portable copy."""
from copy import deepcopy
import argparse
import json
from pathlib import Path
import shutil
import sys

REPO = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(REPO / "services/api"), str(Path(__file__).parent)]
from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_media_library import FileMediaLibrary
from app.adapters.subtitle_alignment import SubtitleAlignment
from subtitle_alignment_smoke import sha256, write_json, load_compare, evaluation_metrics


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-project", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--asset-id")
    parser.add_argument("--reference", type=Path)
    parser.add_argument("--require-reuse", action="store_true")
    args = parser.parse_args()
    source = args.source_project.resolve()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    source_before = sha256(source / "project.json")
    clone = output / "project"
    shutil.copytree(source, clone)
    projects = FileProjectRepository(output / "registry")
    project = projects.open(clone)
    media = FileMediaLibrary(projects)
    eligible = [asset for asset in media.list(project.id) if asset.words and asset.transcription_status == "complete"
                and (not args.asset_id or asset.id == args.asset_id)]
    if len(eligible) != 1:
        raise ValueError("Choose one finalized word-bearing asset with --asset-id")
    asset = eligible[0]
    words = deepcopy(asset.words)
    audio = media.resolve_audio_path(project.id, asset.id)
    audio_before = sha256(audio)
    service = SubtitleAlignment(projects, media, REPO)
    if args.require_reuse:
        def forbidden_inference(*_args, **_kwargs):
            raise AssertionError("Acoustic cache does not match; fresh inference was not requested")
        service.aligner.run = forbidden_inference
    reference = json.loads(args.reference.read_text(encoding="utf-8")) if args.reference else None
    compare = load_compare() if reference else None
    pairs = compare.lexical_pairs([word["text"] for word in words], [word["text"] for word in reference]) if compare else None
    cases = {
        "common": [{"mode": "common-offset"}],
        "vector": [{"mode": "waveform", "strength": 50, "max_move_ms": 250}],
        "combined": [{"mode": "common-offset"}, {"mode": "waveform", "strength": 50, "max_move_ms": 250},
                     {"mode": "offset", "start_offset_ms": 20, "end_offset_ms": 20}],
    }
    report = {"sourceProject": str(source), "assetId": asset.id, "sourceCount": len(words), "referenceUsedForSelection": False, "methods": {}}
    for name, methods in cases.items():
        proposal = service.analyze(project.id, asset.id, mode="pipeline", methods=methods)
        assert media.get(project.id, asset.id).words == words
        if args.require_reuse:
            assert proposal["aligner"].get("reused") is True
        write_json(output / f"{name}-preview.json", proposal)
        changed = sum(row["before"] != row["after"] for row in proposal["rows"])
        applied = service.apply_preview(project.id, asset.id, proposal["id"]) if changed else None
        result = {"changed": changed, "conflictIndexes": proposal["diagnostics"]["conflictIndexes"],
                  "stages": proposal["diagnostics"]["stages"], "reusedAcoustic": proposal["aligner"].get("reused", False)}
        if compare and applied:
            applied_words = applied["asset"]["words"]
            result["pairedMetrics"] = evaluation_metrics(compare.compare(reference, applied_words, asset.duration, pairs=pairs), reference, applied_words)
        if applied:
            service.restore(project.id, asset.id, proposal["id"])
            assert media.get(project.id, asset.id).words == words
        result["applyRestoreChecked"] = applied is not None
        report["methods"][name] = result
    assert sha256(source / "project.json") == source_before
    assert sha256(audio) == audio_before
    report.update(sourceManifestUnchanged=True, audioSha256=audio_before, cloneRestoredExactly=True)
    write_json(output / "report.json", report)
    print(json.dumps({name: {"changed": item["changed"], "conflicts": len(item["conflictIndexes"]), "reused": item["reusedAcoustic"]}
                      for name, item in report["methods"].items()}))


if __name__ == "__main__":
    main()
