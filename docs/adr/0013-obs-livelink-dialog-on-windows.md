# ADR 0013: Use an OBS-Owned Windows Dialog for LiveLink 03

## Status

Accepted for LIVELINK-03 through LIVELINK-08J.

## Context

The UX plan called for a Qt Widgets modeless dialog. The development OBS
32.2.2 install contains the Qt runtime but this checkout has no matching Qt
headers or import libraries. LIVELINK-03 needs a loadable Tools dialog and
automatic pairing on Windows; the plugin and product already target Windows.

## Decision

Register the Tools item with the public OBS frontend API and create a modeless
Win32 window owned by OBS' native main-window handle. Run WinHTTP pairing and
heartbeat on a worker thread, posting status changes to the UI thread. Keep
source capture on the existing OBS APIs and leave the legacy v2 config parser
as a migration fallback. The dialog contains no token or project ID input.

## Consequences

The plugin builds against the pinned OBS source and Windows SDK without an
additional Qt SDK. OBS 32.2.2 loaded the DLL and opened/closed the dialog in
the development smoke run. A full mixer with source strips, meters and alias
editing may be easier to maintain in Qt; LIVELINK-04 must assess that before
expanding this window. The choice does not change the v3 wire or project format.

## LIVELINK-08J visual follow-up

The installed OBS 32.2.2 frontend exposes its dark/light state through
`obs_frontend_is_theme_dark()`, but the plugin still does not have a matching
Qt development SDK. Keep the OBS-owned Win32 dialog. Draw its header, panels,
source rows, buttons, meters and the native title bar in OBS-compatible
dark/light palettes, and
rebuild fonts/layout on a DPI change. Poll the public theme state while the
modeless dialog is open, so changing OBS Appearance updates the dialog without
restarting OBS. Render the P4B mark and wordmark with GDI in the header; bundle
the matching vector logo as a product-owned SVG in the installer manifest.
Neither pairing nor source/channel persistence changes.
