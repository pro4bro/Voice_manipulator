# Owner checks — editing workflow, 2026-10-07

After restarting the normal app to load the changed API, use a copied project.
These checks cover device behavior that automated fixtures cannot establish.

1. **Native import:** choose several files in the Windows picker; choose cache
   in the app dialog. Confirm queued/caching footage rows appear immediately;
   choose another batch while the first is importing. Try cached and external
   source choices. Folder reorder/moves should survive reopening the project.
2. **Real STT load:** queue two representative long files. After the first
   finishes, select/edit/drag its words and playhead while the second processes.
   Report any remaining lag with file length, model and current operation.
3. **Audible timestamp placement:** middle-click a Script/subtitle word, then
   middle-drag its waveform span. Listen while dragging; verify IN/OUT, automatic
   advance and left/right/middle cancellation. Test ordinary import and an
   archived OBS track. Verify the chosen audio device and browser settings.
4. **Text and exclusions:** double-click to edit, Enter/blur to save, Escape to
   cancel; Ctrl-click subtitle to insert. Copy/paste and Find/Replace should
   match the displayed text. Mark IN/OUT, Cut/delete sections, play, Uncut and
   reopen. Excluded regions should be gray and skipped without changing PCM.

For a failure, provide the module, footage/track, steps, expected result and a
screenshot. Device checks remain distinct from the full automated test gate.
