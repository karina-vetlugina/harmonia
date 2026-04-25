"""Audio constants and I/O helpers."""
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


def rms(audio):
    return float(np.sqrt(np.mean(audio.astype(np.float64) ** 2)))
