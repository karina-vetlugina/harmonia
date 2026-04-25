"""Streaming spectral-flux onset detector with adaptive threshold."""
from collections import deque

import numpy as np


class OnsetDetector:
    """
    Detects note onsets from a stream of magnitude spectra.

    Uses spectral flux (sum of positive bin differences) compared against
    an adaptive median threshold of recent flux history.
    """

    def __init__(self, threshold=2.0, cooldown_frames=8, history_len=43, min_flux=0.5):
        # history_len ~= 1 sec of frames at SR=22050, HOP=512
        self.threshold = threshold  # multiplier above median
        self.cooldown_frames = cooldown_frames
        self.min_flux = min_flux
        self.history = deque(maxlen=history_len)
        self.prev_spec = None
        self.cooldown = 0

    def process(self, spec):
        """Returns True if this frame is an onset."""
        if self.prev_spec is None or self.prev_spec.shape != spec.shape:
            self.prev_spec = spec.copy()
            return False

        flux = float(np.sum(np.maximum(0.0, spec - self.prev_spec)))
        self.prev_spec = spec.copy()

        if self.cooldown > 0:
            self.cooldown -= 1
            self.history.append(flux)
            return False

        self.history.append(flux)
        if len(self.history) < 10:
            return False

        median = float(np.median(self.history))
        # adaptive: onset must exceed median * threshold AND a minimum absolute floor
        if flux > max(median * self.threshold, self.min_flux):
            self.cooldown = self.cooldown_frames
            return True
        return False
