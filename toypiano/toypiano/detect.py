"""Polyphonic note detection via non-negative least squares."""
import numpy as np
from scipy.optimize import nnls

from .templates import TemplateBank, compute_spectrum


def detect(audio, bank: TemplateBank, threshold=0.15):
    """
    Decompose the audio's spectrum as a non-negative combination of templates.
    Returns list of (label, relative_weight) for active notes, sorted by weight desc.

    threshold: minimum relative weight (0-1) compared to the strongest note.
    """
    spec = compute_spectrum(audio)
    norm = np.linalg.norm(spec) + 1e-9
    spec /= norm

    weights, _residual = nnls(bank.matrix, spec)

    note_pairs = [
        (label, w)
        for label, w in zip(bank.labels, weights)
        if not label.startswith("_")
    ]
    if not note_pairs:
        return []

    max_w = max(w for _, w in note_pairs)
    if max_w < 1e-6:
        return []

    active = [(label, w / max_w) for label, w in note_pairs if w / max_w >= threshold]
    active.sort(key=lambda x: -x[1])
    return active
