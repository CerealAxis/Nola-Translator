"""Image preparation and projected text rows for PP-OCR recognition."""
from __future__ import annotations

import cv2
import numpy as np

from .config import MAX_IMG_W, REC_IMAGE_SHAPE


def to_bgr(crop) -> np.ndarray:
    return cv2.cvtColor(np.asarray(crop.convert("RGB")), cv2.COLOR_RGB2BGR)


def _ink(image: np.ndarray) -> np.ndarray:
    if image.ndim != 3 or image.shape[2] != 3 or min(image.shape[:2]) == 0:
        raise ValueError("invalidImage")
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    mask = cv2.threshold(gray, 0, 255, cv2.THRESH_OTSU | cv2.THRESH_BINARY_INV)[1]
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    left_margin, right_margin = 0, mask.shape[1]
    for index in range(1, count):
        left, top, width, height, _ = stats[index]
        clipped_side = (left <= mask.shape[1] * 0.02 or left + width >= mask.shape[1] * 0.98)
        clipped_end = top == 0 or top + height == mask.shape[0]
        border_fragment = (clipped_side and clipped_end and width < mask.shape[1] * 0.15
                           and height > mask.shape[0] * 0.2 and height > width * 2.5)
        if border_fragment:
            if left <= mask.shape[1] * 0.02:
                left_margin = max(left_margin, int(left + width))
            else:
                right_margin = min(right_margin, int(left))
        if (border_fragment or (height > mask.shape[0] * 0.7 and height > width * 8)
                or (width > mask.shape[1] * 0.7 and width > height * 8)):
            mask[labels == index] = 0
    mask[:, :left_margin] = 0
    mask[:, right_margin:] = 0
    return mask


def _runs(occupied: np.ndarray, gap: int = 0):
    positions = np.flatnonzero(occupied)
    return [part for part in np.split(positions, np.flatnonzero(np.diff(positions) > gap + 1) + 1)
            if part.size]


def _glyph_size(mask: np.ndarray) -> float:
    count, _, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    sizes = [max(w, h) for _, _, w, h, area in stats[1:count] if area >= 9]
    return float(np.percentile(sizes, 75)) if sizes else 12.0


def _looks_vertical(img: np.ndarray) -> bool:
    if img.shape[0] <= img.shape[1]:
        return False
    mask = _ink(img)
    rows, columns = _runs(mask.any(axis=1)), _runs(mask.any(axis=0))
    row_gap = max((int(b[0] - a[-1] - 1) for a, b in zip(rows, rows[1:])), default=0)
    column_gap = max((int(b[0] - a[-1] - 1) for a, b in zip(columns, columns[1:])), default=0)
    return not (row_gap >= _glyph_size(mask) * 0.5 and row_gap > column_gap * 1.25)


def split_lines(img: np.ndarray) -> tuple[list[np.ndarray], bool]:
    vertical = _looks_vertical(img)
    canvas = np.rot90(img) if vertical else img
    source_mask = _ink(img)
    mask = np.rot90(source_mask) if vertical else source_mask
    height, width = mask.shape
    # Detached radicals belong to the same text row; interline gaps remain separate.
    gap = max(2, round(_glyph_size(mask) * 0.18))
    crops = []
    for rows in _runs(mask.any(axis=1), gap):
        y0, y1 = int(rows[0]), int(rows[-1]) + 1
        columns = np.flatnonzero(mask[y0:y1].any(axis=0))
        if not columns.size or y1 - y0 < 6:
            continue
        x0, x1 = int(columns[0]), int(columns[-1]) + 1
        crops.append(canvas[max(0, y0 - 4):min(height, y1 + 4),
                            max(0, x0 - 4):min(width, x1 + 4)])
    return crops or [canvas], vertical


def preprocess(img: np.ndarray) -> np.ndarray:
    if img.ndim != 3 or img.shape[2] != 3 or min(img.shape[:2]) == 0:
        raise ValueError("invalidImage")
    channels, height, minimum_width = REC_IMAGE_SHAPE
    source = np.rot90(img) if img.shape[0] > img.shape[1] else img
    scaled_width = height * source.shape[1] / source.shape[0]
    content_width = min(MAX_IMG_W, max(1, int(np.ceil(scaled_width))))
    canvas_width = min(MAX_IMG_W, max(minimum_width, int(scaled_width)))
    content_width = min(content_width, canvas_width)
    pixels = cv2.resize(source, (content_width, height)).transpose(2, 0, 1)
    tensor = np.zeros((channels, height, canvas_width), dtype=np.float32)
    tensor[:, :, :content_width] = pixels.astype(np.float32) * (2 / 255) - 1
    return tensor
