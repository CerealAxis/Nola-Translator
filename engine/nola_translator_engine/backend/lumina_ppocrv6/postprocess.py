"""Use the application's validated CTC decoder for PP-OCRv6 outputs."""
from __future__ import annotations

import numpy as np
from ..screen_ocr import ctc_decode as _decode_batch


def ctc_decode(chars: list[str], pred: np.ndarray) -> tuple[str, float]:
    values = np.asarray(pred)
    return _decode_batch(values[None], chars)
