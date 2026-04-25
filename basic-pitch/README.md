# Basic Pitch piano analyzer

Realtime-ish polyphonic piano note analysis using Spotify's `@spotify/basic-pitch` browser package.

## Run

Serve the repo with any local HTTP server, then open `basic-pitch/index.html`.

```sh
python -m http.server 8000
```

Then visit:

```text
http://localhost:8000/basic-pitch/
```

## Notes

- The page streams microphone audio into overlapping 2-second windows and runs Basic Pitch every ~420 ms.
- Basic Pitch is an audio-to-MIDI transcription model, not a true low-latency streaming detector, so the UI favors reliable polyphonic note detection over instant response.
- Detection works best with one piano close to the mic, headphones, and browser audio processing disabled.
- The model and package are loaded from public CDNs:
  - `@spotify/basic-pitch@1.0.1` via `esm.sh`
  - Basic Pitch model weights via `jsdelivr`
