"""Audio constants and I/O helpers."""
import sys
import termios
import tty

import numpy as np
import sounddevice as sd
import soundfile as sf
import librosa

# Sample rate of 22050 is plenty for toy piano (highest fundamental ~2kHz, partials ~10kHz)
SR = 22050
N_FFT = 4096
HOP = 512


def record(duration_s, sr=SR, device=None):
    """Block and record from default mic."""
    audio = sd.rec(
        int(duration_s * sr),
        samplerate=sr,
        channels=1,
        dtype="float32",
        device=device,
    )
    sd.wait()
    return audio.flatten()


def save_wav(path, audio, sr=SR):
    sf.write(path, audio, sr)


def load_wav(path, sr=SR):
    y, _ = librosa.load(path, sr=sr, mono=True)
    return y


def list_devices():
    """Print available audio devices."""
    print(sd.query_devices())


def select_device():
    """
    Interactive arrow-key selector for input devices.
    Returns the selected device index, or None if cancelled.
    """
    import os

    all_devices = sd.query_devices()
    inputs = [(i, d) for i, d in enumerate(all_devices) if d["max_input_channels"] > 0]

    if not inputs:
        print("No input devices found.")
        return None

    try:
        default_idx = sd.default.device[0]
        cursor = next((n for n, (i, _) in enumerate(inputs) if i == default_idx), 0)
    except Exception:
        cursor = 0

    W    = "\033[0m"   # reset
    BOLD = "\033[1m"
    DIM  = "\033[2m"
    CYAN = "\033[36m"
    CLR  = "\033[K"    # erase to end of line

    out = sys.stdout

    def _device_line(n, i, d):
        name = d["name"][:55]
        ch   = d["max_input_channels"]
        sr   = int(d["default_samplerate"])
        if n == cursor:
            return f"  {CYAN}{BOLD}❯ {i:2d}:{W} {name}  {DIM}[{ch}ch {sr}Hz]{W}{CLR}"
        return f"  {DIM}  {i:2d}: {name}  [{ch}ch {sr}Hz]{W}{CLR}"

    # total lines printed in the menu block (devices + 1 footer)
    menu_lines = len(inputs) + 1

    def _render_menu():
        for n, (i, d) in enumerate(inputs):
            out.write(_device_line(n, i, d) + "\r\n")
        out.write(f"  {DIM}↑↓ navigate   Enter select   q cancel{W}{CLR}")
        out.flush()

    def _redraw():
        # move cursor up to first device line, then redraw
        out.write(f"\r\033[{menu_lines}A")
        _render_menu()

    def _read_key():
        fd = sys.stdin.fileno()
        old = termios.tcgetattr(fd)
        try:
            tty.setraw(fd)
            ch = os.read(fd, 1)
            if ch == b"\x1b":
                ch2 = os.read(fd, 1)
                if ch2 == b"[":
                    ch3 = os.read(fd, 1)
                    if ch3 == b"A":
                        return "UP"
                    if ch3 == b"B":
                        return "DOWN"
                return None
            return ch.decode("utf-8", errors="replace")
        finally:
            termios.tcsetattr(fd, termios.TCSADRAIN, old)

    out.write("\033[?25l")  # hide cursor
    out.write(f"\n  {BOLD}Select input device:{W}\n\n")
    _render_menu()

    try:
        while True:
            key = _read_key()
            if key == "UP":
                cursor = (cursor - 1) % len(inputs)
                _redraw()
            elif key == "DOWN":
                cursor = (cursor + 1) % len(inputs)
                _redraw()
            elif key in ("\r", "\n"):
                out.write(f"\r\n{W}\033[?25h")
                out.flush()
                return inputs[cursor][0]
            elif key in ("q", "Q", "\x03"):
                out.write(f"\r\n{W}Cancelled.\033[?25h\n")
                out.flush()
                return None
    except Exception:
        out.write(f"\r\n{W}\033[?25h")
        out.flush()
        raise


def rms(audio):
    return float(np.sqrt(np.mean(audio.astype(np.float64) ** 2)))
