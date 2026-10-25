# Nola Browser Extension

The extension has its own release version in `browser/version.json`. The extension build and desktop compatibility check both read that file. Every extension release must update the version and this log together. Desktop app versions remain independent.

## 1.1.4 — 2026-10-25

- Align extension controls with the shared Nola interface styling.

## 1.1.3 — 2026-10-18

- Add a Firefox MV3 build, native host registration and desktop connection controls.
- Firefox uses desktop system audio; verified tab audio remains Chromium-only.

## 1.1.2 — 2026-10-13

- Cancel queued video-end cleanup when a seek or metadata change opens a new timeline, preserving the shared tab audio track.
- Pair with the desktop engine fix that keeps one audio consumer across paused resets and resumes, preventing old consumers from discarding post-seek audio.

## 1.1.1 — 2026-10-12

- Keep tab capture connected across seeks by isolating old audio acknowledgements and errors from the new timeline.
- Reset the desktop audio backlog per timeline and discard packets arriving after a pause or seek.
- Recover the playback gate on a later time update when rapid player transitions exhaust pause synchronization.
- Extend the playback processing controls introduced in 1.1.0 by explicitly setting echo cancellation, noise suppression and automatic gain control to false in capture requests.

## 1.1.0 — 2026-10-11

- Disable echo cancellation, noise suppression and automatic gain control for tab playback capture.
- Keep quiet scenes connected and resume recognition automatically when sound returns.
- Replace desktop setting summaries with Start, Refresh and Close controls; offer Capture audio for tab sources.
- Match Nola theme tokens and pin control typography independently of website rem scales.
- Select the playing, largest visible video automatically and reanchor when a player is replaced.
- Report the content bundle version during every handshake, including old pages that survive a background reload. Refuse incompatible sessions and prompt installation or reinstallation from the desktop.

## 1.0.2

- Previous build version embedded in the extension manifest generator; no desktop release check.
