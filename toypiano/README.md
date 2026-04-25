# toypiano

Polyphonic note detection for a *known* toy piano. Calibrate once by playing each key, then it identifies which notes are pressed in realtime, including chords.

Works because every key on a specific piano has a distinct spectral fingerprint (especially toy pianos, whose inharmonic partials make keys easy to tell apart). Detection is a non-negative least-squares decomposition of the audio's spectrum against the template bank, so chords are handled naturally and background noise is absorbed by a dedicated noise template.

## Install

```bash
pip install -r requirements.txt
# or:  pip install -e .
```

On Linux you may need PortAudio: `sudo apt install libportaudio2`.

## Usage

```bash
# 1. List audio devices if the default mic isn't right
python -m toypiano devices

# 2. Calibrate (default: C4 to C6, 15 keys + noise sample)
python -m toypiano calibrate --save-recordings calib/

# Custom note list:
python -m toypiano calibrate --notes "C4,D4,E4,F4,G4,A4,B4,C5"

# 3. Listen
python -m toypiano listen

# 4. Analyze a pre-recorded clip
python -m toypiano analyze chord.wav

# 5. Rebuild templates from saved recordings (no re-recording)
python -m toypiano rebuild calib/
```

## Tuning

| Knob | Default | What it does |
|------|---------|--------------|
| `--threshold` | 0.15 | Relative weight cutoff. Lower = more notes, more false positives. |
| `--onset-threshold` | 2.0 | Flux multiplier above median. Lower = more onsets detected. |

If chords are missing notes, lower `--threshold` to 0.10. If you get phantom notes during sustain, raise to 0.20.

If the same mic and gain are not used between calibration and listening, accuracy will drop, since templates are L2-normalized but the noise template's relative scale changes.

## Architecture

```
audio.py      sample rate, FFT size, mic I/O
templates.py  spectrum extraction, TemplateBank (save/load JSON)
detect.py     NNLS decomposition, threshold filtering
onset.py      streaming spectral-flux onset detector
calibrate.py  interactive recording loop
realtime.py   sounddevice stream + ring buffer + delayed classification
cli.py        click commands
```

The realtime loop runs onset detection on every audio block (~23 ms), but only invokes NNLS classification ~120 ms after each detected onset, when the attack has settled. Classification window is 250 ms.

## Limitations

- Same mic, same gain, same room as calibration. Different placement = drift.
- Doesn't track when a note is *released*, only when it starts.
- If two keys on the same piano have nearly identical spectra (rare on toy pianos due to inharmonicity), NNLS may split weight ambiguously.
