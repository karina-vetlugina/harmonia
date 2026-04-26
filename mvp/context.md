# Harmonia MVP — Context

## What it is

A browser-based ear training tool for piano. The app plays a chord, the user identifies and plays it back by ear. No sheet music, no finger hints — the goal is to build musical hearing, not pattern reading.

## Current scope

Left-hand chord drills using a snippet of *Viva la Vida* (Coldplay). 8 two-note dyads (root + 5th), one bar each, cycling through the progression C–D–G–Em twice.

Chords:
- G3 + C4 (C major)
- A3 + D4 (D major)
- G3 + D4 (G major)
- E3 + B3 (E minor)
— repeated

## Interaction flow

1. **Idle** — "Press any key to start". First keypress unlocks Web Audio and triggers the first chord.
2. **Target** — App plays the chord (700ms). Piano stays dark — user listens only.
3. **Waiting** — User's turn. Keys make sound. Evaluation fires 300ms after the last key is released.
4. **Wrong** — No immediate replay. After 1.2s of silence, the original chord plays again.
5. **Correct** — Chord plays back as confirmation, success dot pulses, 600ms pause, then next chord.
6. **Complete** — All 8 chords done.

## UI

- Minimal dark UI, no decorative controls
- Fixed piano dock at bottom center, no key labels
- Chord progress shown as dot row (dim = upcoming, green = current, faded = done)
- Status line: "Listen…" / "Your turn" / "Nice — next up" / "Complete"
- Countdown bar animates during success phase

## Keyboard mapping

Main range Q–P = A3–C5 (white keys), number row = sharps in that range.
Overflow left: Z/X/C = E3/F3/G3 (white), D/S = F#3/G#3 (black).
Overflow right: N/M/, = D5/E5/F5 (white), L/J = C#5/D#5 (black).

## Tech

- React 18 + Vite, single-file component (`src/App.jsx`)
- Web Audio API — additive synthesis (6 harmonics), convolution reverb, dynamics compressor
- No external audio libraries, no backend
- Song data in `viva-la-vida.json`

## Planned / not built yet

- Right-hand melody drills
- Segment-based progression (multiple chords per round, not just one at a time)
- Visual feedback / chord visualization to replace key label hints
- Graduation system: single chord → segments → full song
- More songs / user-loaded MIDI
