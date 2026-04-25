"""Realtime mic listener: detects notes on each onset."""
import queue
import time
from collections import deque

import numpy as np
import sounddevice as sd

from .audio import HOP, N_FFT, SR
from .detect import detect
from .onset import OnsetDetector
from .templates import TemplateBank


def _frame_spectrum(window):
    """Single-frame magnitude spectrum (cheap, used per audio chunk for onset detection)."""
    win = window * np.hanning(len(window))
    return np.abs(np.fft.rfft(win, n=N_FFT))


def realtime_detect(
    bank: TemplateBank,
    threshold=0.15,
    onset_threshold=2.0,
    analysis_delay_s=0.12,
    analysis_window_s=0.25,
    device=None,
    on_notes=None,
):
    """
    Stream audio from the default mic, classify notes whenever an onset is detected.

    on_notes: optional callback(list[(label, weight)]) called for each detection.
    """
    audio_q: "queue.Queue[np.ndarray]" = queue.Queue()
    buffer = deque(maxlen=int(SR * 3))  # 3-second ring buffer
    onset = OnsetDetector(threshold=onset_threshold)

    pending = []  # list of frame_idx at which to run classification
    frame_idx = 0
    delay_frames = max(1, int(analysis_delay_s * SR / HOP))
    win_samples = int(analysis_window_s * SR)

    def cb(indata, frames, time_info, status):
        if status:
            # Drop xruns silently; would spam stderr otherwise
            pass
        audio_q.put(indata[:, 0].copy())

    stream = sd.InputStream(
        samplerate=SR,
        channels=1,
        blocksize=HOP,
        dtype="float32",
        callback=cb,
        device=device,
    )

    print(f"Listening on default mic. {len(bank.note_labels())} notes loaded. Ctrl+C to stop.\n")

    with stream:
        try:
            while True:
                chunk = audio_q.get()
                buffer.extend(chunk)
                frame_idx += 1

                if len(buffer) < N_FFT:
                    continue

                # Onset detection on the most recent N_FFT samples
                window = np.fromiter(
                    (buffer[i] for i in range(len(buffer) - N_FFT, len(buffer))),
                    dtype=np.float32,
                    count=N_FFT,
                )
                spec = _frame_spectrum(window)
                if onset.process(spec):
                    pending.append(frame_idx + delay_frames)

                # Run any classifications that are now due
                while pending and pending[0] <= frame_idx:
                    pending.pop(0)
                    n = min(len(buffer), win_samples)
                    analysis = np.fromiter(
                        (buffer[i] for i in range(len(buffer) - n, len(buffer))),
                        dtype=np.float32,
                        count=n,
                    )
                    notes = detect(analysis, bank, threshold=threshold)
                    if notes:
                        ts = time.strftime("%H:%M:%S")
                        line = " + ".join(f"{l}({w:.2f})" for l, w in notes)
                        print(f"[{ts}] {line}")
                        if on_notes:
                            on_notes(notes)
        except KeyboardInterrupt:
            print("\nStopped.")
