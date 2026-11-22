"""Budgeted image tiling for the PaddleOCR-VL vision graph."""
from __future__ import annotations

import math
import numpy as np
from PIL import Image

from .config import MAX_PATCHES, _PATCH


def _choose_grid(width: int, height: int, minimum: int, maximum: int, budget: int):
    if width < 1 or height < 1 or budget < 4:
        raise ValueError("invalidImage")
    limit = min(budget, maximum // (_PATCH * _PATCH)) if maximum else budget
    if limit < 4:
        raise ValueError("invalidImage")
    native_area = width * height
    desired = max(native_area, minimum, 1) / (_PATCH * _PATCH)
    desired = min(desired, limit)
    ratio = width / height
    choices = []
    for columns in range(2, limit // 2 + 1, 2):
        ideal_rows = math.sqrt(desired / ratio)
        for rows in {max(2, 2 * int(ideal_rows / 2)),
                     max(2, 2 * math.ceil(ideal_rows / 2)),
                     max(2, 2 * int(desired / columns / 2)),
                     max(2, 2 * math.ceil(desired / columns / 2))}:
            patches = columns * rows
            if patches <= limit:
                error = abs(math.log((columns / rows) / ratio))
                size_error = abs(math.log(patches / desired))
                choices.append((error + size_error, abs(patches - desired), columns, rows))
    _, _, columns, rows = min(choices)
    return columns, rows


def preprocess_region(crop, *, min_pixels: int = 112896, max_pixels: int = 0,
                      budget: int = MAX_PATCHES, mean=(0.5, 0.5, 0.5),
                      std=(0.5, 0.5, 0.5)) -> tuple[np.ndarray, np.ndarray]:
    center = np.asarray(mean, dtype=np.float32)
    scale = np.asarray(std, dtype=np.float32)
    if center.shape != (3,) or scale.shape != (3,) or not np.isfinite(center).all() or not np.isfinite(scale).all() or (scale <= 0).any():
        raise ValueError("invalidImage")
    image = crop.convert("RGB")
    occupied = np.any(np.asarray(image) < 250, axis=2)
    y, x = np.nonzero(occupied)
    column_gaps = np.diff(np.unique(x))
    single_column = not column_gaps.size or column_gaps.max() <= max(3, image.width * 0.08)
    if x.size and image.height > image.width * 2 and single_column:
        image = image.crop((int(x.min()), int(y.min()), int(x.max()) + 1, int(y.max()) + 1))
    columns, rows = _choose_grid(*image.size, min_pixels, max_pixels, budget)
    image = image.resize((columns * _PATCH, rows * _PATCH), Image.Resampling.BICUBIC)
    pixels = (np.asarray(image, dtype=np.float32) / 255 - center) / scale
    tiles = pixels.reshape(rows, _PATCH, columns, _PATCH, 3)
    batch = np.ascontiguousarray(tiles.transpose(0, 2, 4, 1, 3).reshape(1, rows * columns, 3, _PATCH, _PATCH))
    return batch, np.asarray([(1, rows, columns)], dtype=np.int64)
