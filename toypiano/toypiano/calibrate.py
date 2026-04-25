"""Interactive calibration: record each piano key once to build templates."""
import queue
import time
from collections import deque
from pathlib import Path

import numpy as np
import sounddevice as sd

from .audio import HOP, N_FFT, SR, record, rms, save_wav
from .onset import OnsetDetector
from .templates import TemplateBank, compute_spectrum, make_template

DEFAULT_NOTES = [
    "F3", "F#3", "G3", "G#3", "A3", "A#3", "B3",
    "C4", "C#4", "D4", "D#4", "E4", "F4", "F#4", "G4", "G#4", "A4", "A#4", "B4",
    "C5", "C#5", "D5", "D#5", "E5", "F5", "F#5", "G5", "G#5", "A5", "A#5", "B5",
    "C6",
]

LOW_RMS_WARNING = 0.005


def _frame_spectrum(window):
    win = window * np.hanning(len(window))
    return np.abs(np.fft.rfft(win, n=N_FFT))


def _vol_bar(val, peak=0.05, width=24):
    filled = min(width, int(val / peak * width))
    bar = "█" * filled + "░" * (width - filled)
    return f"|{bar}| {val:.4f}"


def _countdown(n=3, label=""):
    for i in range(n, 0, -1):
        print(f"  {label}{i}...", end="\r", flush=True)
        time.sleep(1)
    print(" " * 40, end="\r")


def calibrate_realtime(
    notes=None,
    output_path="templates.json",
    save_recordings_dir=None,
    device=None,
    onset_threshold=5.0,
    analysis_delay_s=0.08,
    analysis_window_s=0.6,
):
    """
    Realtime calibration: listens continuously and captures each note automatically
    on onset detection — no countdown needed, just play the key when prompted.
    """
    notes = notes or DEFAULT_NOTES
    bank = TemplateBank()

    if save_recordings_dir:
        Path(save_recordings_dir).mkdir(parents=True, exist_ok=True)

    print(f"=== TOY PIANO CALIBRATION — REALTIME ({len(notes)} notes) ===\n")

    audio_q: "queue.Queue[np.ndarray]" = queue.Queue()

    def cb(indata, frames, time_info, status):
        audio_q.put(indata[:, 0].copy())

    stream = sd.InputStream(
        samplerate=SR,
        channels=1,
        blocksize=HOP,
        dtype="float32",
        callback=cb,
        device=device,
    )

    def get_chunk(timeout=2.0):
        """Get a chunk from the audio queue; raise RuntimeError if stream stalls."""
        try:
            return audio_q.get(timeout=timeout)
        except queue.Empty:
            raise RuntimeError(
                "No audio data received. Check microphone / device index."
            )

    def drain_queue():
        while not audio_q.empty():
            try:
                audio_q.get_nowait()
            except queue.Empty:
                break

    def record_on_onset(label):
        """Wait for an onset, capture audio around it, return the segment."""
        buffer = deque(maxlen=int(SR * 3))
        onset_det = OnsetDetector(threshold=onset_threshold)
        # After onset: collect this many more frames then snapshot the buffer
        settle_frames = max(1, int(analysis_delay_s * SR / HOP))
        win_samples = int(analysis_window_s * SR)
        frame_idx = 0
        onset_at = None   # frame index when onset fired
        peak = 0.05       # auto-scaling for the volume bar
        drain_queue()

        while True:
            chunk = get_chunk()
            buffer.extend(chunk)
            frame_idx += 1

            # Live volume meter — update every frame
            chunk_rms = rms(chunk)
            peak = max(peak, chunk_rms * 1.5 + 1e-6)  # auto-scale up
            if onset_at is None:
                status = "waiting..."
            else:
                remaining = onset_at + settle_frames - frame_idx
                status = f"capturing in {remaining} frames..."
            print(
                f"  [{label}] {_vol_bar(chunk_rms, peak)}  {status}   ",
                end="\r",
                flush=True,
            )

            if len(buffer) < N_FFT:
                continue

            window = np.fromiter(
                (buffer[i] for i in range(len(buffer) - N_FFT, len(buffer))),
                dtype=np.float32,
                count=N_FFT,
            )
            spec = _frame_spectrum(window)

            if onset_at is None and onset_det.process(spec):
                onset_at = frame_idx  # mark when we saw the onset

            if onset_at is not None and frame_idx >= onset_at + settle_frames:
                # Snapshot: take win_samples ending now (covers the note body)
                n = min(len(buffer), win_samples)
                seg = np.fromiter(
                    (buffer[i] for i in range(len(buffer) - n, len(buffer))),
                    dtype=np.float32,
                    count=n,
                )
                seg_rms = rms(seg)
                if seg_rms < LOW_RMS_WARNING:
                    print(
                        f"\n  Too quiet {_vol_bar(seg_rms, peak)}  play louder or check mic gain"
                    )
                    onset_at = None
                    onset_det = OnsetDetector(threshold=onset_threshold)
                    drain_queue()
                    continue
                print()  # newline after the meter
                return seg

    with stream:
        # Warm up: wait until audio is actually flowing before blocking on input
        print("  Warming up audio stream...", end="\r", flush=True)
        try:
            _ = get_chunk(timeout=3.0)
        except RuntimeError as e:
            print(f"\nERROR: {e}")
            return None
        drain_queue()
        print(" " * 40, end="\r")

        # --- Step 1: noise ---
        input("Step 1: stay silent, then press ENTER to record background noise...")
        print("  Recording silence (2s)...", flush=True)
        drain_queue()
        noise_buf = []
        t0 = time.time()
        while time.time() - t0 < 2.0:
            chunk = get_chunk()
            noise_buf.extend(chunk)
            elapsed = time.time() - t0
            bar = "█" * int(elapsed / 2.0 * 20) + "░" * (20 - int(elapsed / 2.0 * 20))
            print(f"  |{bar}| {elapsed:.1f}s  vol:{_vol_bar(rms(chunk))}   ", end="\r", flush=True)
        print()
        noise_audio = np.array(noise_buf[: int(2.0 * SR)], dtype=np.float32)
        if save_recordings_dir:
            save_wav(f"{save_recordings_dir}/_noise.wav", noise_audio)
        spec = compute_spectrum(noise_audio)
        norm = (spec ** 2).sum() ** 0.5 + 1e-9
        bank.add(TemplateBank.NOISE_LABEL, spec / norm)
        print(f"  Noise ok (rms={rms(noise_audio):.4f})\n")

        # --- Step 2: per-note ---
        for i, note in enumerate(notes, 1):
            print(f"[{i}/{len(notes)}] Play  {note}  on the piano now...", flush=True)
            seg = record_on_onset(note)
            if save_recordings_dir:
                save_wav(f"{save_recordings_dir}/{note}.wav", seg)
            bank.add(note, make_template(seg))
            print(f"  Captured {note} (rms={rms(seg):.4f})\n")

    bank.save(output_path)
    print(f"Saved {len(bank.note_labels())} note templates + noise to {output_path}")
    return bank


def calibrate(
    notes=None,
    record_dur=1.5,
    output_path="templates.json",
    save_recordings_dir=None,
    device=None,
):
    """
    Walk through every note, recording each one. Saves a TemplateBank to output_path.
    Optionally also saves raw recordings to save_recordings_dir for later re-processing.
    """
    notes = notes or DEFAULT_NOTES
    bank = TemplateBank()

    if save_recordings_dir:
        Path(save_recordings_dir).mkdir(parents=True, exist_ok=True)

    print(f"=== TOY PIANO CALIBRATION ({len(notes)} notes) ===\n")

    # 1. Noise / silence template
    input("Step 1: stay silent. Press ENTER to record background noise...")
    _countdown(3)
    print("  Recording silence...")
    audio = record(record_dur, device=device)
    if save_recordings_dir:
        save_wav(f"{save_recordings_dir}/_noise.wav", audio)
    spec = compute_spectrum(audio)
    norm = (spec ** 2).sum() ** 0.5 + 1e-9
    bank.add(TemplateBank.NOISE_LABEL, spec / norm)
    print(f"  ok (rms={rms(audio):.4f})\n")

    # 2. Per-note templates
    for i, note in enumerate(notes, 1):
        input(f"Step {i+1}/{len(notes)+1}: play {note} firmly when prompted, then ENTER...")
        _countdown(2, label=f"{note} in ")
        print(f"  Recording {note}...")
        audio = record(record_dur, device=device)

        if rms(audio) < LOW_RMS_WARNING:
            print(f"  WARNING: very quiet recording (rms={rms(audio):.4f}). Retry? [y/N] ", end="")
            if input().strip().lower() == "y":
                _countdown(2, label=f"{note} in ")
                audio = record(record_dur, device=device)

        if save_recordings_dir:
            save_wav(f"{save_recordings_dir}/{note}.wav", audio)
        bank.add(note, make_template(audio))
        print(f"  ok ({note}, rms={rms(audio):.4f})\n")

    bank.save(output_path)
    print(f"Saved {len(bank.note_labels())} note templates + noise to {output_path}")
    return bank


def rebuild_from_recordings(recordings_dir, output_path="templates.json"):
    """Rebuild templates from previously saved recordings without re-recording."""
    from .audio import load_wav

    recordings_dir = Path(recordings_dir)
    bank = TemplateBank()

    noise_path = recordings_dir / "_noise.wav"
    if noise_path.exists():
        audio = load_wav(str(noise_path))
        spec = compute_spectrum(audio)
        bank.add(TemplateBank.NOISE_LABEL, spec / (((spec ** 2).sum() ** 0.5) + 1e-9))

    for wav in sorted(recordings_dir.glob("*.wav")):
        if wav.stem.startswith("_"):
            continue
        audio = load_wav(str(wav))
        bank.add(wav.stem, make_template(audio))
        print(f"  added {wav.stem}")

    bank.save(output_path)
    print(f"Saved {len(bank.note_labels())} note templates to {output_path}")
    return bank
