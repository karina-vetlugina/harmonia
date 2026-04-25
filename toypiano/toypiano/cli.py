"""Command-line interface."""
import click

from .audio import list_devices, load_wav, select_device
from .calibrate import DEFAULT_NOTES, calibrate, calibrate_realtime, rebuild_from_recordings
from .detect import detect
from .realtime import realtime_detect
from .templates import TemplateBank


@click.group()
def cli():
    """Toy piano polyphonic note detection."""


@cli.command()
@click.option("--list", "just_list", is_flag=True, help="Print all devices and exit.")
def devices(just_list):
    """Interactively select a mic input device (prints the index to use with --device)."""
    if just_list:
        list_devices()
        return
    idx = select_device()
    if idx is not None:
        print(f"\nSelected device index: {idx}")
        print(f"Use:  toypiano calibrate --device {idx}")
        print(f"      toypiano listen    --device {idx}")


@cli.command()
@click.option("--notes", default=",".join(DEFAULT_NOTES), help="Comma-separated note names.")
@click.option("--output", default="templates.json", help="Path to save templates.")
@click.option("--save-recordings", default=None, help="Optional dir to also save raw .wav files.")
@click.option("--duration", default=1.5, type=float, help="Seconds to record per note (manual mode only).")
@click.option("--device", default=None, type=int, help="Audio input device index.")
@click.option("--onset-threshold", default=5.0, type=float, help="Onset sensitivity (realtime mode).")
@click.option("--no-realtime", is_flag=True, default=False, help="Use manual countdown mode instead of realtime onset detection.")
def calibrate_cmd(notes, output, save_recordings, duration, device, onset_threshold, no_realtime):
    """Record each piano key once to build template bank.

    By default uses realtime onset detection: just play each key when prompted
    and the recording is captured automatically. Use --no-realtime for the old
    manual countdown mode.
    """
    note_list = [n.strip() for n in notes.split(",") if n.strip()]
    if no_realtime:
        calibrate(
            notes=note_list,
            record_dur=duration,
            output_path=output,
            save_recordings_dir=save_recordings,
            device=device,
        )
    else:
        calibrate_realtime(
            notes=note_list,
            output_path=output,
            save_recordings_dir=save_recordings,
            device=device,
            onset_threshold=onset_threshold,
        )


cli.add_command(calibrate_cmd, name="calibrate")


@cli.command()
@click.argument("recordings_dir")
@click.option("--output", default="templates.json", help="Path to save templates.")
def rebuild(recordings_dir, output):
    """Rebuild templates from a directory of saved per-note .wav recordings."""
    rebuild_from_recordings(recordings_dir, output_path=output)


@cli.command()
@click.option("--templates", default="templates.json", help="Template bank file.")
@click.option("--threshold", default=0.15, type=float, help="Note relative-weight cutoff (0-1).")
@click.option("--onset-threshold", default=2.0, type=float, help="Onset flux multiplier above median.")
@click.option("--device", default=None, type=int, help="Audio input device index.")
def listen(templates, threshold, onset_threshold, device):
    """Stream from the mic and print detected notes."""
    bank = TemplateBank.load(templates)
    print(f"Loaded templates: {bank.note_labels()}")
    realtime_detect(bank, threshold=threshold, onset_threshold=onset_threshold, device=device)


@cli.command()
@click.argument("audio_file")
@click.option("--templates", default="templates.json", help="Template bank file.")
@click.option("--threshold", default=0.15, type=float, help="Note relative-weight cutoff (0-1).")
def analyze(audio_file, templates, threshold):
    """Detect notes in a pre-recorded .wav file."""
    bank = TemplateBank.load(templates)
    audio = load_wav(audio_file)
    notes = detect(audio, bank, threshold=threshold)
    if notes:
        for label, w in notes:
            print(f"  {label:6s}  {w:.3f}")
    else:
        print("No notes detected.")


if __name__ == "__main__":
    cli()
