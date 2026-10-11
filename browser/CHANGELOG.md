# Nola Browser Extension

The extension has its own release version in `browser/version.json`. The extension build and desktop compatibility check both read that file. Every extension release must update the version and this log together. Desktop app versions remain independent.

## 1.1.0 — 2026-10-11

- Disable echo cancellation, noise suppression and automatic gain control for tab playback capture.
- Keep quiet scenes connected and resume recognition automatically when sound returns.
- Replace desktop setting summaries with Start, Refresh and Close controls; offer Capture audio for tab sources.
- Match Nola theme tokens and pin control typography independently of website rem scales.
- Select the playing, largest visible video automatically and reanchor when a player is replaced.
- Report the content bundle version during every handshake, including old pages that survive a background reload. Refuse incompatible sessions and prompt installation or reinstallation from the desktop.

## 1.0.2

- Previous build version embedded in the extension manifest generator; no desktop release check.
