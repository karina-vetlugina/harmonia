"""Command-line interface."""
import click

from .audio import list_devices, load_wav
from .calibrate import DEFAULT_NOTES, calibrate, rebuild_from_recordings
from .detect import detect
from .realtime import realtime_detect
from .templates import TemplateBank


@click.group()
def cli():
    """Toy piano polyphonic note detection."""


@cli.command()
def devices():
    """List available audio input/output devices."""
    list_devices()


@cli.command()
@click.option("--notes", default=",".join(DEFAULT_NOTES), help="Comma-separated note names.")
@click.option("--output", default="templates.json", help="Path to save templates.")
@click.option("--save-recordings", default=None, help="Optional dir to also save raw .wav files.")
@click.option("--duration", default=1.5, type=float, help="Seconds to record per note.")
@click.option("--device", default=None, type=int, help="Audio input device index.")
def calibrate_cmd(notes, output, save_recordings, duration, device):
    """Record each piano key once to build template bank."""
    note_list = [n.strip() for n in notes.split(",") if n.strip()]
    calibrate(
        notes=note_list,
        record_dur=duration,
        output_path=output,
        save_recordings_dir=save_recordings,
        device=device,
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
