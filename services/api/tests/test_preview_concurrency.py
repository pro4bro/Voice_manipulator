from __future__ import annotations

import gc
import os
import threading
import wave
import weakref
from pathlib import Path

from app.adapters.voice_edit_preview import VoiceEditPreview
from app.domain.voice_edits import StretchOperation, VoiceEditCommand, apply_command
from test_voice_edits import setup_store


def _add_output(store, project_id, source_id):
    source_output = store.outputs.get(project_id, source_id)
    output_id, audio_path = store.outputs.reserve(project_id)
    audio_path.write_bytes(store.outputs.audio_path(project_id, source_id).read_bytes())
    store.outputs.save(project_id, source_output.model_copy(update={"id": output_id}))
    return output_id


def _edited_doc(store, project_id, output_id, target_frames=36000):
    doc = store.get(project_id, output_id)
    command = VoiceEditCommand(revision=doc.revision, scriptRevision=1,
        operation=StretchOperation(startFrame=48000, endFrame=72000, targetFrames=target_frames))
    return apply_command(doc, command)


def _fake_renderer(calls, *, first_started=None, release_first=None, fail_first=False):
    count_lock = threading.Lock()

    def render(source, destination, operations):
        with count_lock:
            calls.append((source, tuple(operations)))
            call_number = len(calls)
        if first_started is not None and call_number == 1:
            first_started.set()
            if release_first is not None and not release_first.wait(5):
                raise AssertionError("test did not release the first renderer")
            if fail_first:
                raise RuntimeError("injected preview renderer failure")

        with wave.open(str(source), "rb") as pcm:
            frames = pcm.getnframes()
            data = pcm.readframes(frames)
        for operation in operations:
            start, end, target = operation["startFrame"], operation["endFrame"], operation["targetFrames"]
            region = data[start * 2:end * 2]
            stretched = (region[:2] * target) if target >= end - start else region[:target * 2]
            data = data[:start * 2] + stretched + data[end * 2:]
            frames += target - (end - start)
        destination.parent.mkdir(parents=True, exist_ok=True)
        with wave.open(str(destination), "wb") as pcm:
            pcm.setparams((1, 2, 24000, 0, "NONE", "not compressed"))
            pcm.writeframes(data)
        return {"targetFrames": frames, "actualFrames": frames, "paddingFrames": 0,
            "clippedSamples": 0, "maxBoundaryStep": 0.0, "boundariesWithinLimit": True}

    return render


def _run_thread(target, results, key):
    try:
        results[key] = target()
    except BaseException as exc:
        results[key] = exc


def test_slow_preview_for_one_output_does_not_block_another_output(tmp_path, monkeypatch):
    _, project, first_id, store = setup_store(tmp_path)
    second_id = _add_output(store, project.id, first_id)
    first_started, release_first, second_started = threading.Event(), threading.Event(), threading.Event()
    calls = []
    renderer = _fake_renderer(calls, first_started=first_started, release_first=release_first)

    # Keep a non-blocking renderer path for output two; only render the first
    # output under the controlled hold.
    original_renderer = renderer

    def controlled_renderer(source, destination, operations):
        if source.parent.name == second_id:
            second_started.set()
            return _fake_renderer(calls)(source, destination, operations)
        return original_renderer(source, destination, operations)

    monkeypatch.setattr("app.adapters.voice_edit_preview.render_stretch", controlled_renderer)
    preview_a, preview_b = VoiceEditPreview(store), VoiceEditPreview(store)
    results = {}
    first_thread = threading.Thread(target=_run_thread,
        args=(lambda: preview_a.render(project.id, first_id, _edited_doc(store, project.id, first_id)), results, "first"))
    second_thread = threading.Thread(target=_run_thread,
        args=(lambda: preview_b.render(project.id, second_id, _edited_doc(store, project.id, second_id)), results, "second"))
    first_thread.start()
    try:
        assert first_started.wait(5)
        second_thread.start()
        assert second_started.wait(2), "unrelated output waited behind the held preview"
    finally:
        release_first.set()
        first_thread.join(5)
        if second_thread.ident is not None:
            second_thread.join(5)
    assert not first_thread.is_alive() and not second_thread.is_alive()
    assert not isinstance(results.get("first"), BaseException)
    assert not isinstance(results.get("second"), BaseException)


def test_same_output_renders_once_then_other_instance_reads_cache(tmp_path, monkeypatch):
    _, project, output_id, store = setup_store(tmp_path)
    started, release = threading.Event(), threading.Event()
    calls, results = [], {}
    monkeypatch.setattr("app.adapters.voice_edit_preview.render_stretch",
        _fake_renderer(calls, first_started=started, release_first=release))
    doc = _edited_doc(store, project.id, output_id)
    previews = (VoiceEditPreview(store), VoiceEditPreview(store))
    gate = threading.Barrier(3)
    ready = [threading.Event(), threading.Event()]

    def request(index):
        ready[index].set()
        gate.wait(5)
        diagnostics = {}
        previews[index].render(project.id, output_id, doc, diagnostics=diagnostics)
        return diagnostics

    threads = [threading.Thread(target=_run_thread, args=(lambda i=i: request(i), results, i)) for i in range(2)]
    for thread in threads:
        thread.start()
    try:
        assert all(event.wait(5) for event in ready)
        gate.wait(5)
        assert started.wait(5)
    finally:
        release.set()
        for thread in threads:
            if thread.ident is not None:
                thread.join(5)
    assert all(not thread.is_alive() for thread in threads)
    assert len(calls) == 1
    diagnostics = [results[index] for index in (0, 1)]
    assert all(not isinstance(item, BaseException) for item in diagnostics)
    assert sorted(item["cacheHit"] for item in diagnostics) == [False, True]


def test_same_output_different_keys_stay_serialized(tmp_path, monkeypatch):
    _, project, output_id, store = setup_store(tmp_path)
    first_started, release_first, second_started = threading.Event(), threading.Event(), threading.Event()
    calls, results = [], {}

    def renderer(source, destination, operations):
        if operations and operations[0]["targetFrames"] == 48000:
            second_started.set()
        return _fake_renderer(calls, first_started=first_started, release_first=release_first)(
            source, destination, operations)

    monkeypatch.setattr("app.adapters.voice_edit_preview.render_stretch", renderer)
    previews = (VoiceEditPreview(store), VoiceEditPreview(store))
    docs = (_edited_doc(store, project.id, output_id, 36000),
        _edited_doc(store, project.id, output_id, 48000))
    first_thread = threading.Thread(target=_run_thread,
        args=(lambda: previews[0].render(project.id, output_id, docs[0]), results, 0))
    second_thread = threading.Thread(target=_run_thread,
        args=(lambda: previews[1].render(project.id, output_id, docs[1]), results, 1))
    first_thread.start()
    try:
        assert first_started.wait(5)
        second_thread.start()
        assert not second_started.wait(.2), "a different cache key entered while its output was locked"
    finally:
        release_first.set()
        first_thread.join(5)
        if second_thread.ident is not None:
            second_thread.join(5)
    assert not first_thread.is_alive() and not second_thread.is_alive()
    assert not isinstance(results.get(0), BaseException)
    assert not isinstance(results.get(1), BaseException)
    assert second_started.is_set() and len(calls) == 2


def test_renderer_failure_releases_same_output_lock_for_waiting_request(tmp_path, monkeypatch):
    _, project, output_id, store = setup_store(tmp_path)
    started, release = threading.Event(), threading.Event()
    calls, results = [], {}
    monkeypatch.setattr("app.adapters.voice_edit_preview.render_stretch",
        _fake_renderer(calls, first_started=started, release_first=release, fail_first=True))
    doc = _edited_doc(store, project.id, output_id)
    previews = (VoiceEditPreview(store), VoiceEditPreview(store))
    threads = [threading.Thread(target=_run_thread,
        args=(lambda i=i: previews[i].render(project.id, output_id, doc), results, i)) for i in range(2)]
    threads[0].start()
    try:
        assert started.wait(5)
        threads[1].start()
    finally:
        release.set()
        for thread in threads:
            if thread.ident is not None:
                thread.join(5)
    assert all(not thread.is_alive() for thread in threads)
    assert isinstance(results[0], RuntimeError)
    assert not isinstance(results[1], BaseException)
    assert len(calls) == 2


def test_lock_registry_canonicalizes_alias_and_releases_unused_entry(tmp_path):
    folder = tmp_path / "output-folder"
    folder.mkdir()
    alias = folder / "child" / ".."
    lock = VoiceEditPreview._lock_for(folder)
    alias_lock = VoiceEditPreview._lock_for(alias)
    assert lock is alias_lock
    key = VoiceEditPreview._lock_key(folder)
    assert VoiceEditPreview._lock_registry.get(key) is lock
    if os.name == "nt":
        assert VoiceEditPreview._lock_for(Path(str(folder).upper())) is lock
    lock_ref = weakref.ref(lock)
    del lock, alias_lock
    gc.collect()
    assert lock_ref() is None
    assert key not in VoiceEditPreview._lock_registry
