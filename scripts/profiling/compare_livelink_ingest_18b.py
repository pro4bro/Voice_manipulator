"""Verify candidate artifacts and report the unchanged 18A budgets (exit 1 on failure)."""
import argparse
import hashlib
import json
from pathlib import Path
import wave

ROOT = Path(__file__).resolve().parents[2]


def pcm_hash(path):
    digest = hashlib.sha256()
    with wave.open(str(path), "rb") as wav:
        if (wav.getframerate(), wav.getnchannels(), wav.getsampwidth()) != (24000, 1, 2):
            raise ValueError("Invalid analysis format")
        for block in iter(lambda: wav.readframes(65536), b""):
            digest.update(block)
    return digest.hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidate", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    baseline = json.loads((ROOT / "docs/gates/livelink-ingest-18a-metrics.json").read_text())
    candidate = json.loads(args.candidate.read_text())
    project = Path(candidate["projectPath"])
    recording_id = baseline["input"]["recordingId"]
    journal = json.loads((project / "assets/obs-livelink" / recording_id / "recording.json").read_text())
    archive = journal["recording"]["sourceArchive"]
    expected = {track["track"]: track["pcmSha256"] for track in baseline["analysisIntegrity"]}
    analyses = [{"track": track["relayLabel"], "matchesRetained": pcm_hash(project / track["analysisPath"]) == expected[track["relayLabel"]]}
                for track in archive["tracks"]]
    archive_path = project / archive["sourcePath"]
    actual_archive_hash = hashlib.sha256(archive_path.read_bytes()).hexdigest()
    ack = candidate["stages"]["httpDurableAck"]
    budget = {
        "ackP50Ms": 100, "ackP95Ms": 150,
        "ingressSeconds": baseline["httpReplay"]["ingressSeconds"] * .7,
        "lastAckToReadySeconds": 45,
    }
    gates = {
        "catalog": candidate["inputCatalogSha256"] == baseline["input"]["metadataCatalogSha256"],
        "continuity": candidate["sourceContinuityPassed"] and candidate["chunkCount"] == 2524,
        "sixTrackArchiveReady": journal["recording"]["archiveStatus"] == "ready" and len(archive["tracks"]) == 6 and actual_archive_hash == journal["archiveSha256"],
        "sixAnalysesMatch": len(analyses) == 6 and all(track["matchesRetained"] for track in analyses),
        "ackP50": ack["p50Ms"] <= budget["ackP50Ms"],
        "ackP95": ack["p95Ms"] <= budget["ackP95Ms"],
        "ingress": candidate["ingressSeconds"] <= budget["ingressSeconds"],
        "readyTail": candidate["lastAckToReadySeconds"] <= budget["lastAckToReadySeconds"],
    }
    result = {"passed": all(gates.values()), "budgets": budget, "gates": gates,
              "candidateAck": ack, "candidateIngressSeconds": candidate["ingressSeconds"],
              "candidateReadyTailSeconds": candidate["lastAckToReadySeconds"],
              "ingressReductionPercent": 100 * (1-candidate["ingressSeconds"]/baseline["httpReplay"]["ingressSeconds"]),
              "analysisIntegrity": analyses, "nativeLiveGateRun": False}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))
    return 0 if result["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
