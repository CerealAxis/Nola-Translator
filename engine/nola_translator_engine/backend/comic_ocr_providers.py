"""Optional OCR recognizers adapted from Lumina's MIT-licensed ONNX providers."""
from __future__ import annotations

import asyncio
import json
import math
import unicodedata
from pathlib import Path

import numpy as np

from .screen_ocr import ScreenOcr
from ..models.ocr_catalog import BABERU_OCR, PPOCRV6, PADDLEOCR_VL, RFDETR_SEG


def _crop_quad(image, quad):
    import cv2

    points = np.asarray(quad, dtype=np.float32)
    width = max(1, round(max(np.linalg.norm(points[0] - points[1]), np.linalg.norm(points[2] - points[3]))))
    height = max(1, round(max(np.linalg.norm(points[0] - points[3]), np.linalg.norm(points[1] - points[2]))))
    target = np.asarray([[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1]], np.float32)
    return cv2.warpPerspective(image, cv2.getPerspectiveTransform(points, target), (width, height),
                               borderMode=cv2.BORDER_REPLICATE)


class BaberuOcr(ScreenOcr):
    """Baberu's three-graph ONNX decoder for multilingual manga text."""

    def __init__(self, model_root: Path):
        super().__init__(model_root, spec=BABERU_OCR)
        self.languages = ("ja", "zh", "zh-Hant", "ko", "en")
        self._vocab: list[str] = []
        self._content_ids: set[int] = set()

    def _session_provider(self, path: Path) -> str:
        return "cpu" if path.name.startswith("decoder_") else self.execution_provider

    async def load(self):
        if self._closed or self._lock.locked() or self._loaded:
            raise ValueError("resourceBusy")
        async with self._lock:
            def load_weights():
                import json

                directory = self._verify()
                for name in ("onnx/vision_int4.onnx", "onnx/decoder_prefill_int8.onnx", "onnx/decoder_step_int8.onnx"):
                    self._session(directory / name)
                chars = json.loads((directory / "tokenizer/vocab.json").read_text(encoding="utf-8"))
                self._vocab = [""] * 4 + list(chars)
                self._content_ids = {
                    index + 4 for index, char in enumerate(chars)
                    if len(char) == 1 and char not in "ーｰ〜~" and unicodedata.category(char)[0] in "LN"
                }
            task = asyncio.create_task(asyncio.to_thread(load_weights))
            try:
                await asyncio.shield(task)
                self._loaded = True
            except BaseException:
                try:
                    await task
                finally:
                    self._loaded = False
                    self._sessions.clear()
                raise
        return self.status()

    def _decode(self, crop):
        from PIL import Image

        directory = self._verify()
        vision = self._session(directory / "onnx/vision_int4.onnx")
        prefill = self._session(directory / "onnx/decoder_prefill_int8.onnx")
        step = self._session(directory / "onnx/decoder_step_int8.onnx")
        image = Image.fromarray(crop[:, :, ::-1]).convert("RGB").resize((224, 224), Image.Resampling.BICUBIC)
        pixels = np.asarray(image, np.float32) / 255
        pixels = ((pixels - np.array([.485, .456, .406], np.float32)) /
                  np.array([.229, .224, .225], np.float32)).transpose(2, 0, 1)[None]
        embeds = np.asarray(vision.run(["vision_embeds"], {"pixel_values": pixels})[0])
        output = prefill.run(None, {"vision_embeds": embeds, "input_ids": np.array([[1]], np.int64)})
        logits, past = np.asarray(output[0])[0, -1].astype(np.float64), [np.asarray(t) for t in output[1:]]
        sequence, tokens, position = [1], [], embeds.shape[1] + 1
        for _ in range(256):
            for token_id in set(sequence):
                score = logits[token_id]
                logits[token_id] = score * 1.2 if score < 0 else score / 1.2
            if tokens and tokens[-1] in self._content_ids:
                run = 0
                for item in reversed(tokens):
                    if item != tokens[-1]:
                        break
                    run += 1
                if run >= 12:
                    logits[tokens[-1]] = -np.inf
            token = int(np.argmax(logits))
            if token == 2:
                break
            tokens.append(token)
            sequence.append(token)
            feed = {"input_ids": np.array([[token]], np.int64), "position_ids": np.array([[position]], np.int64)}
            feed.update({name: value for name, value in zip(
                [f"past_k{i}" for i in range(6)] + [f"past_v{i}" for i in range(6)], past)})
            output = step.run(None, feed)
            logits, past = np.asarray(output[0])[0, -1].astype(np.float64), [np.asarray(t) for t in output[1:]]
            position += 1
        else:
            raise ValueError("textTooLong")
        return "".join(self._vocab[token] for token in tokens if token >= 4)

    async def recognize_comic(self, image, quads, language):
        if language not in ("auto", *self.languages):
            raise ValueError("unsupportedLanguage")
        return await self._run_inference(language, 1, False,
            lambda: [(self._decode(_crop_quad(image, quad)), 1.0) for quad in quads])

    async def recognize_comic_box(self, image, quad, language, vertical):
        results = await self.recognize_comic(image, [quad], language)
        return results[0] if results else ("", 0.0)

    async def detect_comic(self, image):
        detector = self._detector()
        owned = not detector._loaded
        try:
            if owned:
                await detector.load()
            return await detector.detect_comic(image)
        finally:
            if owned:
                await detector.release()


class PPOcrV6(ScreenOcr):
    """PP-OCRv6 medium CTC recognizer with Lumina's vertical and line splitting."""

    def __init__(self, model_root: Path):
        super().__init__(model_root, spec=PPOCRV6)
        self.languages = ("zh", "zh-Hant", "ja", "ko", "en")
        self._characters: list[str] = []

    async def load(self):
        if self._closed or self._lock.locked() or self._loaded:
            raise ValueError("resourceBusy")
        async with self._lock:
            def load_weights():
                directory = self._verify()
                session = self._session(directory / "inference.onnx")
                text = (directory / "inference.yml").read_text(encoding="utf-8")
                lines = text.splitlines()
                try:
                    start = next(i for i, line in enumerate(lines) if line.strip() == "character_dict:") + 1
                except StopIteration as exc:
                    raise ValueError("modelCorrupt") from exc
                values = []
                for line in lines[start:]:
                    if line and not line[0].isspace():
                        break
                    item = line.lstrip(" ")
                    if item.startswith("- "):
                        value = item[2:]
                        if len(value) >= 2 and value[0] == value[-1] == "'":
                            value = value[1:-1].replace("''", "'")
                        elif len(value) >= 2 and value[0] == value[-1] == '"':
                            value = json.loads(value)
                        values.append(value)
                if not values:
                    raise ValueError("modelCorrupt")
                self._characters = ["", *values, " "]
                classes = session.get_outputs()[0].shape[-1]
                if isinstance(classes, int) and classes != len(self._characters):
                    raise ValueError("modelCorrupt")
            task = asyncio.create_task(asyncio.to_thread(load_weights))
            try:
                await asyncio.shield(task)
                self._loaded = True
            except BaseException:
                try:
                    await task
                finally:
                    self._loaded = False
                    self._sessions.clear()
                raise
        return self.status()

    def _recognize(self, crop):
        from .lumina_ppocrv6 import postprocess, preprocess

        directory = self._verify()
        session = self._session(directory / "inference.onnx")
        lines, vertical = preprocess.split_lines(crop)
        parts, scores = [], []
        for line in lines:
            height, width = line.shape[:2]
            if height < 24 and height * width < 550:
                continue
            tensor = preprocess.preprocess(line)[None]
            prediction = np.asarray(session.run(None, {session.get_inputs()[0].name: tensor})[0])
            text, score = postprocess.ctc_decode(self._characters, prediction[0])
            if text and score >= .3:
                parts.append(text)
                scores.append(score)
        return ("".join(parts) if vertical else "\n".join(parts)), float(np.mean(scores)) if scores else 0.0

    async def recognize_comic(self, image, quads, language):
        if language not in ("auto", *self.languages):
            raise ValueError("unsupportedLanguage")
        return await self._run_inference(language, 1, False,
            lambda: [self._recognize(_crop_quad(image, quad)) for quad in quads])

    async def recognize_comic_box(self, image, quad, language, vertical):
        results = await self.recognize_comic(image, [quad], language)
        return results[0] if results else ("", 0.0)

    async def detect_comic(self, image):
        detector = self._detector()
        owned = not detector._loaded
        try:
            if owned:
                await detector.load()
            return await detector.detect_comic(image)
        finally:
            if owned:
                await detector.release()


class PaddleOcrVl(ScreenOcr):
    """Experimental PaddleOCR-VL 1.6 ONNX recognition, enabled only on explicit selection."""

    def __init__(self, model_root: Path):
        super().__init__(model_root, spec=PADDLEOCR_VL)
        self.languages = ("zh", "zh-Hant", "ja", "ko", "en")
        self._vision = None
        self._decoder = None
        self._min_pixels = 112896
        self._max_pixels = 0
        self._mean = (.5, .5, .5)
        self._std = (.5, .5, .5)

    async def load(self):
        if self._closed or self._lock.locked() or self._loaded:
            raise ValueError("resourceBusy")
        async with self._lock:
            def load_weights():
                import json
                from .lumina_paddleocr_vl.decoder import Decoder
                from .lumina_paddleocr_vl.vision import VisionEncoder

                directory = self._verify()
                self._vision = VisionEncoder(directory, provider=self.execution_provider)
                self._decoder = Decoder(directory, provider=self.execution_provider)
                config = json.loads((directory / "preprocessor_config.json").read_text(encoding="utf-8"))
                self._min_pixels = int(config.get("min_pixels", self._min_pixels))
                self._max_pixels = int(config.get("max_pixels") or 0)
                self._mean = tuple(config.get("image_mean", self._mean))
                self._std = tuple(config.get("image_std", self._std))
            task = asyncio.create_task(asyncio.to_thread(load_weights))
            try:
                await asyncio.shield(task)
                self._loaded = True
            except BaseException:
                try:
                    await task
                finally:
                    self._loaded = False
                    self._vision = self._decoder = None
                raise
        return self.status()

    async def release(self):
        status = await super().release()
        self._vision = self._decoder = None
        return status

    def _recognize(self, image, quad):
        import cv2
        from PIL import Image
        from .lumina_paddleocr_vl.preprocess import preprocess_region

        crop = _crop_quad(image, quad)
        rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
        pil = Image.fromarray(rgb)
        pixels, grid = preprocess_region(pil, min_pixels=self._min_pixels,
            max_pixels=self._max_pixels, mean=self._mean, std=self._std)
        text = self._decoder.decode(self._vision.encode(pixels, grid))
        return text, 1.0

    async def recognize_comic(self, image, quads, language):
        if language not in ("auto", *self.languages):
            raise ValueError("unsupportedLanguage")
        return await self._run_inference(language, 1, False,
            lambda: [self._recognize(image, quad) for quad in quads])

    async def recognize_comic_box(self, image, quad, language, vertical):
        results = await self.recognize_comic(image, [quad], language)
        return results[0] if results else ("", 0.0)

    async def detect_comic(self, image):
        detector = self._detector()
        owned = not detector._loaded
        try:
            if owned:
                await detector.load()
            return await detector.detect_comic(image)
        finally:
            if owned:
                await detector.release()


class RfDetrSeg(ScreenOcr):
    """Lumina's optional RF-DETR layout segmenter and per-text mask provider."""

    def __init__(self, model_root: Path):
        super().__init__(model_root, spec=RFDETR_SEG)
        self.languages = ()
        self.text_mask = None
        self.bubble_quads: list[list[list[float]]] = []

    async def load(self):
        if self._closed or self._lock.locked() or self._loaded:
            raise ValueError("resourceBusy")
        async with self._lock:
            task = asyncio.create_task(asyncio.to_thread(lambda: self._session(self._verify() / RFDETR_SEG.files[0].path)))
            try:
                await asyncio.shield(task)
                self._loaded = True
            except BaseException:
                try:
                    await task
                finally:
                    self._loaded = False
                    self._sessions.clear()
                raise
        return self.status()

    def _infer(self, image):
        import cv2

        if image.ndim != 3 or image.shape[2] != 3 or not image.size:
            raise ValueError("invalidImage")
        height, width = image.shape[:2]
        resized = cv2.resize(cv2.cvtColor(image, cv2.COLOR_BGR2RGB), (1152, 1152), interpolation=cv2.INTER_LINEAR)
        tensor = resized.astype(np.float32) / 255
        tensor = ((tensor - np.array([.485, .456, .406], np.float32)) /
                  np.array([.229, .224, .225], np.float32)).transpose(2, 0, 1)[None]
        session = self._session(self._verify() / RFDETR_SEG.files[0].path)
        output_values = session.run(None, {session.get_inputs()[0].name: tensor.astype(
            np.float16 if "float16" in session.get_inputs()[0].type else np.float32)})
        outputs = {item.name.lower(): np.asarray(value) for item, value in zip(session.get_outputs(), output_values)}
        dets, labels, masks = outputs.get("dets"), outputs.get("labels"), outputs.get("masks")
        if dets is None or labels is None or masks is None:
            raise ValueError("modelCorrupt")
        dets, labels, masks = dets.reshape(-1, dets.shape[-2], 4), labels.reshape(-1, labels.shape[-2], labels.shape[-1]), masks.reshape(-1, masks.shape[-3], masks.shape[-2], masks.shape[-1])
        if dets.shape[0] != 1 or masks.shape[1] != dets.shape[1] or labels.shape[1] != dets.shape[1] or labels.shape[-1] < 4:
            raise ValueError("modelCorrupt")
        logits = labels[0, :, :4]
        scores = 1 / (1 + np.exp(-logits))
        class_ids, confidences = scores.argmax(axis=-1), scores.max(axis=-1)
        thresholds = (.25, .20, .50, .50)
        boxes, bubbles, mask_list = [], [], []
        for index, (raw_box, cls, confidence) in enumerate(zip(dets[0], class_ids, confidences)):
            if confidence < thresholds[int(cls)]:
                continue
            cx, cy, box_w, box_h = map(float, raw_box)
            x0, y0 = max(0, (cx - box_w / 2) * width), max(0, (cy - box_h / 2) * height)
            x1, y1 = min(width, (cx + box_w / 2) * width), min(height, (cy + box_h / 2) * height)
            if x1 - x0 < 1 or y1 - y0 < 1:
                continue
            quad = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
            if cls == 0:
                boxes.append(quad)
                mask_list.append(masks[0, index])
            elif cls == 2:
                bubbles.append(quad)
        self.bubble_quads = bubbles
        if mask_list:
            mask = np.zeros((height, width), np.uint8)
            for instance in mask_list:
                resized_mask = cv2.resize(instance.astype(np.float32), (width, height), interpolation=cv2.INTER_LINEAR)
                mask[resized_mask > 0] = 255
            radius = max(1, min(255, round(max(width, height) / 1024 * 6)))
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (radius * 2 + 1, radius * 2 + 1))
            mask = cv2.morphologyEx(cv2.dilate(mask, kernel), cv2.MORPH_CLOSE, kernel)
            self.text_mask = mask
        else:
            self.text_mask = np.zeros((height, width), np.uint8)
        return boxes

    async def detect_comic(self, image):
        self.text_mask = None
        self.bubble_quads = []
        return await self._run_inference("auto", 1, False, self._infer, image)
