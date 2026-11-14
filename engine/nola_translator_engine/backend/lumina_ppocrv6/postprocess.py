"""CTC greedy decoding."""
from __future__ import annotations

import numpy as np


def ctc_decode(chars: list[str], pred: np.ndarray) -> tuple[str, float]:
    """CTC greedy decode: argmax -> collapse repeats -> drop blank.

    `chars` is the full vocab list (index 0 = CTC blank, last = space).
    Returns (text, mean confidence).
    """
    idx = pred.argmax(axis=-1)
    prob = pred.max(axis=-1)
    keep = np.ones(len(idx), dtype=bool)
    keep[1:] = idx[1:] != idx[:-1]
    keep &= idx != 0  # index 0 is the CTC blank
    text = "".join(chars[i] for i in idx[keep])
    score = float(prob[keep].mean()) if keep.any() else 0.0
    return text, score
