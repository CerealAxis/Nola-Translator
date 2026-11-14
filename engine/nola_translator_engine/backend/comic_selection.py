"""Validated comic selections with ordered additive and subtractive polygons."""
from __future__ import annotations

import math


def validate_selection(raw, width: int, height: int):
    if type(width) is not int or type(height) is not int or width < 1 or height < 1 or width * height > 12_000_000:
        raise ValueError('invalidGeometry')
    if not isinstance(raw, (list, tuple)) or not raw:
        raise ValueError('invalidSelection')

    def polygon(points):
        if not isinstance(points, (list, tuple)) or not 3 <= len(points) <= 2000:
            raise ValueError('invalidSelection')
        result = []
        for point in points:
            if (not isinstance(point, (list, tuple)) or len(point) != 2
                    or any(type(value) not in (int, float) or not math.isfinite(value) for value in point)):
                raise ValueError('invalidSelection')
            x, y = point
            if not 0 <= x <= width or not 0 <= y <= height:
                raise ValueError('invalidGeometry')
            result.append([float(x), float(y)])
        return result

    if not isinstance(raw[0], dict):
        return polygon(raw)
    if len(raw) > 64:
        raise ValueError('selectionTooLarge')
    result = []
    count = 0
    for operation in raw:
        if (not isinstance(operation, dict) or set(operation) != {'op', 'points'}
                or operation['op'] not in ('add', 'subtract')):
            raise ValueError('invalidSelection')
        points = polygon(operation['points'])
        count += len(points)
        if count > 8000:
            raise ValueError('selectionTooLarge')
        result.append({'op': operation['op'], 'points': points})
    return result


def selection_mask(raw, width: int, height: int):
    import cv2
    import numpy as np

    normalized = validate_selection(raw, width, height)
    operations = normalized if isinstance(normalized[0], dict) else [{'op': 'add', 'points': normalized}]
    mask = np.zeros((height, width), np.uint8)
    scratch = np.zeros_like(mask)
    for operation in operations:
        scratch.fill(0)
        cv2.fillPoly(scratch, [np.rint(operation['points']).astype(np.int32)], 255)
        if operation['op'] == 'add':
            mask |= scratch
        else:
            mask[scratch > 0] = 0
    return mask
