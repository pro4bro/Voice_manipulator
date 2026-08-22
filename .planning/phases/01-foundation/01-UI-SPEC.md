# Phase 01 UI Contract

## Audience and Moment

Vietnamese audio creators working for long sessions. The app should feel like a compact broadcast workstation, not a generic dashboard.

## Visual Direction

Warm technical editorial: bone paper, charcoal equipment surfaces, signal orange, and phosphor lime. Strong numbering, instrument labels, and waveform geometry provide identity.

## Typography

- Display and controls: `Sora` with tight tracking.
- Script and reading surfaces: `Newsreader` for editorial clarity.
- Timecodes and meters: `IBM Plex Mono`.
- Local fallbacks remain functional when web fonts are unavailable.

## Layout

- App shell is exactly `100dvh` and clips page overflow.
- Project rail is fixed; studio columns are resizable.
- Module interiors own scrolling.
- Minimum useful desktop width is 1180 px; compact mode collapses the rail and stacks utility controls.

## States

Every module defines empty, ready, active/selected, processing, and unavailable presentation. Planned processors use an explicit `PLANNED` badge and disabled action.

## Motion

One restrained load sequence and purposeful panel transitions. Respect `prefers-reduced-motion`.

## Accessibility

Visible focus rings, semantic controls, labels for icon buttons, 44 px primary hit targets, no color-only status, and keyboard-operable navigation/resizers.

## Review Checklist

- No document scroll at 1440x900 and 1280x720.
- Module contents remain reachable after resizing.
- Project Hub, STT, Training, and Manipulator have distinct hierarchy but shared visual grammar.
- Speech to Text does not expose forbidden modules.
- Planned features cannot be mistaken for completed processing.

