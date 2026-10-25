# VM-SCRIPT-TEXT-FREEZE-01

## Approved behavior

- Text view has separated, aligned Speaker and dialogue columns for each turn.
  Multiline dialogue stays in its existing row. Native selection ending in the
  dialogue column copies dialogue across rows without speaker labels. Selection
  spanning the Speaker column copies row-ordered speaker names and dialogue.
  Editing, literal newline/Alt+Enter, stable row identity and table view persist.
- The layered Timeline has one vertical viewport containing Master, subtitles
  and layers. Its one top ruler stays visible; subtitles become sticky immediately
  below the ruler after Master scrolls away. No repeated bottom time markings.
- Horizontal navigation/zoom, source waveform alignment, locked clip timecodes,
  direct drag/tool commands, Mute/Solo and bottom transport remain connected.

## Bounded implementation

1. Script component with native selection and explicit plain-text clipboard
   serialization; preserve row identity during editing and external updates.
2. Shared Timeline vertical scroll container, one sticky ruler and subtitle row;
   update vertical clip edge scrolling for this viewport.
3. Focused interaction regressions, complete frontend test/typecheck/build and
   browser verification on isolated synthetic project in dark/light themes.
4. Record evidence and limits in gate/ADR/ledgers; stop after this round.

No engine, model, source audio, export composition or project format change.

## Round result

Implementation and automated verification complete: frontend1341/167 files,
focused Script37 and Timeline79, typecheck/build233 pass. The actual-browser gate
remains open because local browser access is disabled in Work settings. No visual,
native clipboard, IME or undo acceptance is inferred from DOM tests. See
`docs/gates/vm-script-text-freeze-01-20261025.md` for evidence and limits.
