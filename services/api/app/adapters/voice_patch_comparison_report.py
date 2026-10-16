"""Read-only, portable evidence snapshot for comparable accepted Patch variants."""
from datetime import datetime, timezone
import hashlib
import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response


def comparison_report(history, reviews, project_id: str, output_id: str) -> dict:
    packet = history.list(project_id)
    selected = next((entry for entry in packet['revisions'] if entry['output'].id == output_id), None)
    if selected is None:
        raise KeyError(output_id)
    comparison_key = selected['comparisonKey']
    entries = [entry for entry in packet['revisions'] if entry['comparisonKey'] == comparison_key]
    variants = []
    revisions = set()
    for entry in entries:
        output = entry['output']
        assessment = reviews.get(project_id, output.id)
        revisions.add(assessment['revision'])
        variants.append({
            'outputId': output.id, 'name': output.name, 'voiceName': output.voice_name,
            'strategy': entry['strategy'], 'duration': output.duration,
            'sourceOutputId': entry['sourceOutputId'],
            'audioSha256': assessment['audioSha256'],
            'metadataSha256': assessment['metadataSha256'],
            'assessment': assessment,
        })
    # A concurrent note save must not create a mixed-revision assessment report.
    if len(revisions) != 1 or reviews.get(project_id, output_id)['revision'] not in revisions:
        raise ValueError('Listening assessments changed while exporting; retry the report.')
    report = {
        'version': 1, 'projectId': project_id, 'comparisonKey': comparison_key,
        'assessmentSource': 'user-declared', 'checkpointAcceptance': 'not-inferred',
        'target': {'startFrame': selected['report']['startFrame'], 'endFrame': selected['report']['endFrame'], 'sampleRate': 24000},
        'replacementText': selected['output'].parameters['voicePatch'].get('replacementText', ''),
        'invalidHistoryCount': packet['invalidCount'], 'variants': variants,
    }
    report['snapshotKey'] = hashlib.sha256(json.dumps(report, ensure_ascii=False,
        sort_keys=True, separators=(',', ':')).encode('utf-8')).hexdigest()
    report['exportedAt'] = datetime.now(timezone.utc).isoformat()
    return report


def make_voice_patch_comparison_report_router(history, reviews) -> APIRouter:
    router = APIRouter(prefix='/api/projects/{project_id}/voice-patch/history')

    @router.get('/{output_id}/comparison-report')
    def export(project_id: str, output_id: str):
        try:
            report = comparison_report(history, reviews, project_id, output_id)
            return Response(json.dumps(report, ensure_ascii=False, indent=2), media_type='application/json',
                headers={'Content-Disposition': f'attachment; filename="patch-comparison-{report["snapshotKey"][:16]}.json"'})
        except KeyError as exc:
            raise HTTPException(404, 'Accepted Voice Patch output does not exist') from exc
        except (ValueError, OSError, RuntimeError) as exc:
            raise HTTPException(409, str(exc)) from exc

    return router
