"""Interactive calibration: record each piano key once to build templates."""
import time
from pathlib import Path

from .audio import SR, record, rms, save_wav
from .templates import TemplateBank, compute_spectrum, make_template

DEFAULT_NOTES = [
    "C4", "D4", "E4", "F4", "G4", "A4", "B4",
    "C5", "D5", "E5", "F5", "G5", "A5", "B5",
    "C6",
]

LOW_RMS_WARNING = 0.005  # warn if a recording is too quiet


def _countdown(n=3, label=""):
    for i in range(n, 0, -1):
        print(f"  {label}{i}...", end="\r", flush=True)
        time.sleep(1)
    print(" " * 40, end="\r")


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
