"""Retain recognizer/merge/publication evidence on a minimal OBS project copy.

Run with the API development interpreter; the existing Studio serializes real
inference. Source audio/transcript are read only. Output must be a fresh folder
outside the source project. Check cached models before running; no quality truth
or owner transcript replacement is implied by this diagnostic.
"""
from __future__ import annotations
import asyncio
import argparse
import hashlib
import json
import re
import shutil
import time
import wave
import sys
from urllib.parse import urlparse
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "services/api"))
from app.adapters.file_project_repository import FileProjectRepository
from app.adapters.file_media_library import FileMediaLibrary
from app.adapters.media_import_processor import MediaImportProcessor
from app.adapters.obs_livelink_detailed_stt import ObsLiveLinkDetailedStt
from app.adapters.growing_mkv_transcription import GrowingMkvTranscription

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--recording', required=True)
parser.add_argument('--channel', required=True)
parser.add_argument('--asset', required=True)
parser.add_argument('--studio', default='http://127.0.0.1:18081')
parser.add_argument('--route', choices=['detailed', 'archive'], default='detailed')
parser.add_argument('--window-start', type=float, required=True)
parser.add_argument('--window-end', type=float, required=True)
parser.add_argument('--model', choices=['tiny', 'base', 'small', 'medium', 'large-v3'], default='large-v3')

def sha(path):
    d = hashlib.sha256()
    with path.open('rb') as f:
        for b in iter(lambda: f.read(1024*1024), b''): d.update(b)
    return d.hexdigest()

def save(path, obj):
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')

def window(words):
    return [w for w in words if float(w['start']) < args.window_end and float(w['end']) > args.window_start]

async def main():
    endpoint = urlparse(args.studio)
    if endpoint.scheme != 'http' or endpoint.hostname not in ('127.0.0.1', 'localhost', '::1'):
        raise ValueError('Private media replay requires a loopback Studio URL')
    if OUT == SOURCE or SOURCE in OUT.parents:
        raise ValueError('Probe output must be outside the source project')
    if not 0 <= args.window_start < args.window_end:
        raise ValueError('Invalid comparison window')
    from uuid import UUID
    UUID(RECORDING)
    UUID(CHANNEL)
    if not re.fullmatch(r'[A-Za-z0-9_-]+', ASSET):
        raise ValueError('Asset must be one path component')
    cache = ROOT/f'.runtime/omnivoice-studio/models/models--Systran--faster-whisper-{args.model}'
    if not any(cache.rglob('model.bin')):
        raise ValueError('Required recognizer model is not cached locally')
    OUT.mkdir(parents=True, exist_ok=False)
    destination = OUT/'snapshot-copy'
    destination.mkdir(exist_ok=False)
    sources = [SOURCE/'project.json', SOURCE/'assets/media/index.json',
               SOURCE/f'assets/media/{ASSET}/words.json', SOURCE/f'assets/media/{ASSET}/analysis.wav']
    source_recording = SOURCE/f'assets/obs-livelink/{RECORDING}'
    sources.append(source_recording/'recording.json')
    sources += sorted((source_recording/f'channels/{CHANNEL}/chunks').glob('*'))
    before = {str(p.relative_to(SOURCE)): sha(p) for p in sources if p.is_file()}
    save(OUT/'owner-hashes-before.json', before)
    for p in sources:
        if not p.is_file(): continue
        target = destination/p.relative_to(SOURCE)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(p, target)
    # Keep only the reproduced channel in the derived, isolated catalog.
    index = destination/'assets/media/index.json'
    save(index, [a for a in json.loads(index.read_text(encoding='utf-8')) if a['id'] == ASSET])
    folder = destination/f'assets/obs-livelink/{RECORDING}'
    journal_path = folder/'recording.json'
    journal = json.loads(journal_path.read_text(encoding='utf-8'))
    if journal['recording']['status'] != 'stopped' or journal['recording'].get('archiveStatus') != 'ready':
        raise ValueError('This probe requires a stopped, ready OBS archive')
    journal['channels'] = [c for c in journal['channels'] if c['channelId'] == CHANNEL]
    journal['sourceStems'] = [c for c in journal['sourceStems'] if c['channelId'] == CHANNEL]
    save(journal_path, journal)
    repo = FileProjectRepository(OUT/'registry')
    project = repo.open(destination)
    library = FileMediaLibrary(repo)
    importer = MediaImportProcessor(args.studio, library, str(ROOT/'.tools/ffmpeg/ffmpeg.exe'))
    upload = importer._upload_studio_audio
    requests = []
    async def retain_upload(path, *positional, **keywords):
        index = len(requests)
        target = OUT/f'request-{index:02d}.wav'
        shutil.copy2(path, target)
        item, elapsed = await upload(path, *positional, **keywords)
        payload = {'input': target.name, 'inputSha256': sha(target), 'item': item, 'elapsed': elapsed}
        requests.append(payload)
        save(OUT/f'request-{index:02d}.json', payload)
        return item, elapsed
    importer._upload_studio_audio = retain_upload
    if args.route == 'archive':
        try:
            asset = library.get(project.id, ASSET)
            started = time.monotonic()
            updated, elapsed = await importer.transcribe_existing(project, asset, model=args.model)
            final = json.loads((destination/f'assets/media/{ASSET}/words.json').read_text(encoding='utf-8'))
            canonical = json.loads((destination/f'assets/media/{ASSET}/stt/transcript.stt.json').read_text(encoding='utf-8'))
            save(OUT/'archive-comparison.json', {'requests': len(requests), 'elapsed': elapsed,
                'wallSeconds': time.monotonic()-started, 'storedWords': len(final),
                'canonicalWords': len(canonical['words']), 'storedGapWords': window(final),
                'canonicalGapWords': window(canonical['words']), 'textMatchesAsset': updated.text == canonical['text']})
            print('Archive requests/words/gap', len(requests), len(final), len(window(final)), flush=True)
        finally:
            after = {str(p.relative_to(SOURCE)): sha(p) for p in sources if p.is_file()}
            save(OUT/'owner-hashes-after.json', after)
            assert before == after, 'Owner files changed during probe'
            print('Owner hashes unchanged', len(before), flush=True)
        return
    async def recognize(path, model):
        with wave.open(str(path), 'rb') as w:
            meta = {'frames': w.getnframes(), 'rate': w.getframerate(), 'channels': w.getnchannels(), 'width': w.getsampwidth()}
        shutil.copy2(path, OUT/'snapshot-input.wav')
        save(OUT/'snapshot-input.json', {**meta, 'sha256':sha(path), 'model':model})
        print('Running full stopped OBS snapshot',meta,flush=True)
        started = time.monotonic()
        item, elapsed = await importer._run_studio_import(path, 'import', '', model=model)
        save(OUT/'snapshot-raw.json', {'item':item,'elapsed':elapsed,'wallSeconds':time.monotonic()-started})
        print('Recognizer complete',len(item.get('words',[])), 'gap-window words',len(window(item.get('words',[]))),flush=True)
        return item
    worker = ObsLiveLinkDetailedStt(library, importer, recognize)
    plan = worker.configure(project, RECORDING, 60, [CHANNEL], args.model)
    save(OUT/'snapshot-plan.json', plan)
    try:
        result = await worker.process_once(project, RECORDING)
        save(OUT/'snapshot-status.json',result)
        checkpoints = [json.loads(p.read_text(encoding='utf-8')) for p in sorted((folder/f'detailed-stt/{CHANNEL}').glob('*.json'))]
        combined = GrowingMkvTranscription._combine(checkpoints,plan['tracks'][CHANNEL]['initialFrames']/24000)
        save(OUT/'snapshot-merged.json',combined)
        final = json.loads((destination/f'assets/media/{ASSET}/words.json').read_text(encoding='utf-8'))
        save(OUT/'snapshot-comparison.json',{'rawWords':len(checkpoints[0]['item']['words']),
             'mergedWords':len(combined['words']),'storedWords':len(final),
             'rawGapWords':window(checkpoints[0]['item']['words']), 'mergedGapWords':window(combined['words']),
             'storedGapWords':window(final), 'requests':len(requests), 'done':result['done']})
        print('Merged/stored',len(combined['words']),len(final),'gap counts',len(window(combined['words'])),len(window(final)),flush=True)
    finally:
        after={str(p.relative_to(SOURCE)):sha(p) for p in sources if p.is_file()}
        save(OUT/'owner-hashes-after.json',after)
        assert before==after, 'Owner files changed during probe'
        print('Owner hashes unchanged',len(before),flush=True)

if __name__ == '__main__':
    args = parser.parse_args()
    SOURCE, OUT = args.source.resolve(), args.output.resolve()
    RECORDING, CHANNEL, ASSET = args.recording, args.channel, args.asset
    asyncio.run(main())
