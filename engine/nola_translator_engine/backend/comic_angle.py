"""Installed AngleNet orientation model, adapted from Lumina (see lumina-upstream.LICENSE)."""
from __future__ import annotations

import asyncio
from pathlib import Path

import numpy as np

from .screen_ocr import ScreenOcr


def angle_from_logits(logits):
    values = np.asarray(logits, dtype=np.float64).reshape(-1)
    if values.shape != (180,) or not np.isfinite(values).all():
        raise ValueError('modelCorrupt')
    probabilities = np.exp(values - values.max())
    probabilities /= probabilities.sum()
    radians = np.radians(np.arange(180) * 2)
    prediction = (np.degrees(np.arctan2(np.sum(probabilities * np.sin(radians)),
                                       np.sum(probabilities * np.cos(radians)))) / 2) % 180
    vertical_distance = abs(prediction - 90)
    horizontal_distance = min(prediction, 180 - prediction)
    if abs(vertical_distance - horizontal_distance) < 10:
        return None, None
    vertical = vertical_distance < horizontal_distance
    delta = prediction - 90 if vertical else prediction if prediction <= 90 else prediction - 180
    lean = -delta
    if lean > 45:
        lean -= 90
    elif lean < -45:
        lean += 90
    return (0.0 if abs(lean) < .5 else round(float(lean), 1)), vertical


class ComicAngleNet(ScreenOcr):
    def __init__(self, model_root: Path):
        from ..models.ocr_catalog import ANGLENET
        super().__init__(model_root, spec=ANGLENET)

    async def load(self):
        if self._closed or self._lock.locked() or self._loaded or (self._install and not self._install.done()):
            raise ValueError('resourceBusy')
        async with self._lock:
            task = asyncio.create_task(asyncio.to_thread(self._session, self._verify() / self.spec.files[0].path))
            try:
                await asyncio.shield(task)
                self._loaded = True
            except BaseException:
                try:
                    await task
                finally:
                    self._sessions.clear()
                    self._loaded = False
                raise
        return self.status()

    def _estimate(self, image, quad):
        import cv2
        points = np.asarray(quad, np.float64)
        if points.shape != (4, 2) or not np.isfinite(points).all():
            raise ValueError('invalidGeometry')
        left, top = np.floor(points.min(axis=0)).astype(int)
        right, bottom = np.ceil(points.max(axis=0)).astype(int)
        crop = image[max(0, top):min(image.shape[0], bottom), max(0, left):min(image.shape[1], right)]
        if not crop.size or min(crop.shape[:2]) < 4:
            return None
        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        h, w = gray.shape
        gray = np.pad(gray, ((int(h * .1),) * 2, (int(w * .1),) * 2), mode='edge')
        h, w = gray.shape
        scale = 64 / max(h, w)
        nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
        resized = cv2.resize(gray, (nw, nh), interpolation=cv2.INTER_AREA)
        tensor = np.zeros((64, 64), np.float32)
        tensor[(64 - nh) // 2:(64 - nh) // 2 + nh, (64 - nw) // 2:(64 - nw) // 2 + nw] = resized / 255
        session = self._session(self._verify() / self.spec.files[0].path)
        outputs = session.run(None, {session.get_inputs()[0].name: tensor[None, None]})
        angle, vertical = angle_from_logits(outputs[0])
        if vertical:
            from .lumina_ppocrv6.preprocess import _looks_vertical
            if not _looks_vertical(crop):
                return None
        return angle

    async def estimate(self, image, quad):
        key = self.spec.model_id
        await self._inference_gate.acquire(key, 1, realtime=False)
        try:
            if not self._loaded or self._closed or self._lock.locked():
                raise ValueError('modelNotLoaded')
            task = asyncio.create_task(asyncio.to_thread(self._estimate, image, quad))
            try:
                return await asyncio.shield(task)
            except asyncio.CancelledError:
                while not task.done():
                    try:
                        await asyncio.shield(task)
                    except asyncio.CancelledError:
                        continue
                task.result()
                raise
        finally:
            self._inference_gate.release(key)

    async def infer(self, request):
        raise ValueError('invalidModel')
