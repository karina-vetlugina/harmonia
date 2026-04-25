"""Spectral template extraction and persistence."""
import json
from pathlib import Path

import librosa
import numpy as np

from .audio import N_FFT, SR


def compute_spectrum(audio, n_fft=N_FFT, hop=None):
    """Time-averaged magnitude spectrum. Returns (n_fft//2 + 1,) vector."""
    hop = hop or n_fft // 4
    if len(audio) < n_fft:
        audio = np.pad(audio, (0, n_fft - len(audio)))
    S = np.abs(librosa.stft(audio, n_fft=n_fft, hop_length=hop))
    return np.mean(S, axis=1)


def make_template(audio, skip_attack_s=0.05, dur_s=0.4, sr=SR):
    """Skip attack transient, take stable portion, return L2-normalized spectrum."""
    start = int(skip_attack_s * sr)
    end = min(start + int(dur_s * sr), len(audio))
    seg = audio[start:end]
    if len(seg) < N_FFT:
        seg = audio  # fall back to whole clip if too short
    spec = compute_spectrum(seg)
    return spec / (np.linalg.norm(spec) + 1e-9)


class TemplateBank:
    """Holds spectral templates for each piano key plus a noise template."""

    NOISE_LABEL = "_noise"

    def __init__(self):
        self.labels = []
        self.templates = []

    def add(self, label, template):
        if label in self.labels:
            self.templates[self.labels.index(label)] = template
        else:
            self.labels.append(label)
            self.templates.append(template)

    @property
    def matrix(self):
        """Shape (n_freq_bins, n_templates) for NNLS."""
        return np.stack(self.templates, axis=1)

    def note_labels(self):
        return [l for l in self.labels if not l.startswith("_")]

    def save(self, path):
        Path(path).write_text(
            json.dumps(
                {
                    "labels": self.labels,
                    "templates": [t.tolist() for t in self.templates],
                    "sr": SR,
                    "n_fft": N_FFT,
                }
            )
        )

    @classmethod
    def load(cls, path):
        data = json.loads(Path(path).read_text())
        bank = cls()
        bank.labels = data["labels"]
        bank.templates = [np.array(t, dtype=np.float32) for t in data["templates"]]
        return bank
