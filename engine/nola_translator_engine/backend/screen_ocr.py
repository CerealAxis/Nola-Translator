"""Bounded local screen OCR with explicit, verified model installation."""

from __future__ import annotations

import asyncio
import base64
import binascii
import ctypes
import json
import math
import os
import re
from pathlib import Path
import struct
import threading
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from ..models.manager import ModelIntegrityError, ModelManager
from ..models.ocr_catalog import (COMIC_DETECTOR, COMIC_DETECTOR_ID, OCR_DETECTOR, OCR_RECOGNIZERS,
                                  PP_OCRV5_MOBILE, OCR_SPECS, OCR_LANGUAGES, OCR_RESOURCE_ID, RFDETR_SEG_ID,
                                  LAMA_ONNX_ID, LAMA_MANGA_ONNX_ID, ANGLENET_ID, COMIC_FONT_CLASSIFIER_ID, COMIC_YUZU_FONT_ID)
from ..protocol import NetworkSettings, ResourceRecord
from ..debug_log import exception_fields, write as write_diagnostic
from .gateway.resources import ConcurrencyGate

MAX_IMAGE_BYTES = 12 * 1024 * 1024
MAX_IMAGE_PIXELS = 12_000_000
MAX_BLOCKS = 256
STATE_FILE = ".screen-ocr-state.json"
_DEVICE_PROVIDERS = {"cpu": "CPUExecutionProvider", "cuda": "CUDAExecutionProvider", "dml": "DmlExecutionProvider"}
_nvml_lock = threading.Lock()
_nvml_state: dict = {"initialized": False, "library": None, "device": None}


class _NvmlMemoryInfo(ctypes.Structure):
    _fields_ = [("total", ctypes.c_ulonglong), ("free", ctypes.c_ulonglong),
                ("used", ctypes.c_ulonglong)]


def comic_gpu_memory() -> dict[str, int | None]:
    """Read dedicated VRAM via NVML without importing a GPU framework."""
    result = {"gpuMemoryUsed": None, "gpuMemoryTotal": None}
    import sys

    with _nvml_lock:
        if not _nvml_state["initialized"]:
            _nvml_state["initialized"] = True
            try:
                if sys.platform == "win32":
                    candidates = [Path(os.environ.get("WINDIR", "C:/Windows")) / "System32/nvml.dll"]
                    program_files = os.environ.get("PROGRAMFILES")
                    if program_files:
                        candidates.append(Path(program_files) / "NVIDIA Corporation/NVSMI/nvml.dll")
                    path = next((candidate for candidate in candidates if candidate.is_file()), None)
                    if path is not None:
                        library = ctypes.CDLL(str(path))
                    else:
                        library = None
                elif sys.platform.startswith("linux"):
                    library = ctypes.CDLL("libnvidia-ml.so.1")
                else:
                    library = None
                if library is not None:
                    library.nvmlInit_v2.argtypes = []
                    library.nvmlInit_v2.restype = ctypes.c_uint
                    library.nvmlDeviceGetHandleByIndex_v2.argtypes = [ctypes.c_uint, ctypes.POINTER(ctypes.c_void_p)]
                    library.nvmlDeviceGetHandleByIndex_v2.restype = ctypes.c_uint
                    library.nvmlDeviceGetMemoryInfo.argtypes = [ctypes.c_void_p, ctypes.POINTER(_NvmlMemoryInfo)]
                    library.nvmlDeviceGetMemoryInfo.restype = ctypes.c_uint
                    handle = ctypes.c_void_p()
                    if library.nvmlInit_v2() == 0 and library.nvmlDeviceGetHandleByIndex_v2(0, ctypes.byref(handle)) == 0:
                        _nvml_state.update(library=library, device=handle)
            except Exception:
                _nvml_state.update(library=None, device=None)
        library, device = _nvml_state["library"], _nvml_state["device"]
        if library is None or device is None:
            return result
        try:
            memory = _NvmlMemoryInfo()
            if library.nvmlDeviceGetMemoryInfo(device, ctypes.byref(memory)) == 0:
                result.update(gpuMemoryUsed=int(memory.used), gpuMemoryTotal=int(memory.total))
        except Exception:
            pass
    return result


def comic_execution_providers() -> list[str]:
    """Available ONNX devices in preferred UI order; this never loads model weights."""
    try:
        import onnxruntime as ort
        available = set(ort.get_available_providers())
    except Exception:
        return []
    return [name for name in ("cpu", "cuda", "dml") if _DEVICE_PROVIDERS[name] in available]


def _require_device_provider(provider: str) -> None:
    if provider not in comic_execution_providers():
        raise ValueError("runtimeUnavailable")


def _effective_device(resource_id: str, provider: str) -> str:
    if resource_id == ANGLENET_ID or resource_id == LAMA_ONNX_ID:
        return "cpu"
    if resource_id == "lama-manga" and provider != "cpu":
        raise ValueError("runtimeUnavailable")
    if resource_id == LAMA_MANGA_ONNX_ID and provider == "dml":
        raise ValueError("runtimeUnavailable")
    if resource_id == "paddleocr-vl-1.6-onnx" and provider == "dml":
        raise ValueError("runtimeUnavailable")
    return provider


class OcrRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    image: str = Field(min_length=24, max_length=MAX_IMAGE_BYTES * 4 // 3 + 64)
    appearance: bool = False
    task_mode: Literal["realtime", "offline"] = "realtime"
    max_concurrency: int = Field(default=1, ge=1, le=5)
    language: str = Field(default="auto", min_length=1, max_length=32, pattern=r"^[a-zA-Z][a-zA-Z0-9-]*$")


class OcrInstallRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    network: NetworkSettings | None = None


def _process_running(pid: int) -> bool:
    if pid <= 0:
        return False
    if os.name != "nt":
        os.kill(pid, 0)
        return True
    # os.kill(pid, 0) generates a console event on Windows; query the process instead.
    import ctypes
    from ctypes import wintypes

    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    kernel.OpenProcess.restype = wintypes.HANDLE
    kernel.GetExitCodeProcess.argtypes = [wintypes.HANDLE, ctypes.POINTER(wintypes.DWORD)]
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    handle = kernel.OpenProcess(0x1000, False, pid)
    if not handle:
        return False
    try:
        code = wintypes.DWORD()
        return bool(kernel.GetExitCodeProcess(handle, ctypes.byref(code))) and code.value == 259
    finally:
        kernel.CloseHandle(handle)


def read_ocr_state(model_root: Path, resource_id: str = OCR_RESOURCE_ID) -> dict:
    """Share operation progress with the existing model-resource process."""
    try:
        state_file = STATE_FILE if resource_id == OCR_RESOURCE_ID else f".screen-ocr-{resource_id}-state.json"
        state = json.loads((model_root / state_file).read_text(encoding="utf-8"))
        if not isinstance(state, dict):
            return {}
        pid = int(state.pop("pid"))
        if pid != os.getpid() and not _process_running(pid):
            return {}
        return state
    except (OSError, ValueError, KeyError, TypeError):
        return {}


def decode_image(data_url: str):
    import cv2
    import numpy as np

    prefix = "data:image/png;base64,"
    if not data_url.startswith(prefix):
        raise ValueError("invalidImage")
    try:
        raw = base64.b64decode(data_url[len(prefix):], validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("invalidImage") from exc
    # Check dimensions before decoding to reject PNG decompression bombs.
    if len(raw) > MAX_IMAGE_BYTES or len(raw) < 33 or raw[:8] != b"\x89PNG\r\n\x1a\n" or raw[12:16] != b"IHDR":
        raise ValueError("invalidImage")
    width, height = struct.unpack(">II", raw[16:24])
    if not width or not height or width * height > MAX_IMAGE_PIXELS or max(width, height) > 8192:
        raise ValueError("imageTooLarge")
    image = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None or image.shape[:2] != (height, width):
        raise ValueError("invalidImage")
    return image


def screen_text_appearance(image, quad: list) -> dict:
    """Repair glyph pixels with OpenCV Telea inpainting; preserve the surrounding screenshot."""
    import cv2
    import numpy as np

    image_height, image_width = image.shape[:2]
    points = np.asarray(quad, dtype=np.float32)
    x, y, width, height = cv2.boundingRect(points)
    margin = max(3, min(12, min(width, height) // 4))
    left, top = max(0, x - margin), max(0, y - margin)
    right, bottom = min(image_width, x + width + margin), min(image_height, y + height + margin)
    crop = image[top:bottom, left:right].copy()
    h, w = crop.shape[:2]
    polygon = np.zeros((h, w), np.uint8)
    cv2.fillConvexPoly(polygon, np.rint(points - [left, top]).astype(np.int32), 255)
    ring = crop[polygon == 0]
    sample = ring if len(ring) else crop.reshape(-1, 3)
    # Coarse color bins resist anti-aliasing and isolated artwork pixels in the sampling ring.
    bins = (sample.astype(np.int32) // 16)
    keys = bins[:, 0] * 256 + bins[:, 1] * 16 + bins[:, 2]
    dominant = np.bincount(keys, minlength=4096).argmax()
    background = np.median(sample[keys == dominant], axis=0)
    distance = np.linalg.norm(crop.astype(np.float32) - background, axis=2)
    inside = distance[polygon > 0]
    threshold = float(np.clip(np.percentile(inside, 98) * .45, 25, 60)) if len(inside) else 60
    ink = (distance > threshold) & (polygon > 0)
    pixels = crop[ink]
    color = np.median(pixels, axis=0) if len(pixels) else (255 - background)
    def luminance(bgr):
        rgb = np.asarray(bgr, dtype=np.float32)[::-1] / 255
        linear = np.where(rgb <= .04045, rgb / 12.92, ((rgb + .055) / 1.055) ** 2.4)
        return float(linear @ [.2126, .7152, .0722])
    bg_luma, fg_luma = luminance(background), luminance(color)
    if (max(bg_luma, fg_luma) + .05) / (min(bg_luma, fg_luma) + .05) < 4.5:
        color = np.array([0, 0, 0] if bg_luma > .179 else [255, 255, 255])
    mask = cv2.dilate(ink.astype(np.uint8) * 255, np.ones((5, 5), np.uint8))
    if np.count_nonzero(ink) > np.count_nonzero(polygon) * .65:
        kernel = max(7, min(51, height // 2) | 1)
        repaired = cv2.GaussianBlur(crop, (kernel, kernel), 0)
    else:
        repaired = cv2.inpaint(crop, mask, 3, cv2.INPAINT_TELEA)
    yy, xx = np.indices((h, w))
    edge = np.minimum.reduce([xx + 1, yy + 1, w - xx, h - yy])
    alpha = np.minimum(1, edge / max(1, margin)) * 255
    patch = cv2.cvtColor(repaired, cv2.COLOR_BGR2BGRA)
    patch[:, :, 3] = alpha.astype(np.uint8)
    ok, encoded = cv2.imencode('.png', patch)
    def hex_color(bgr):
        return '#' + ''.join(f'{int(v):02x}' for v in np.clip(bgr, 0, 255)[::-1])
    return {"color": hex_color(color), "background": hex_color(background), "patches": [{
        "image": "data:image/png;base64," + base64.b64encode(encoded).decode('ascii'),
        "x": left / image_width, "y": top / image_height,
        "width": w / image_width, "height": h / image_height,
    }] if ok else []}


def ctc_decode(prediction, characters: list[str]) -> tuple[str, float]:
    import numpy as np

    values = np.asarray(prediction)[0]
    if values.ndim != 2 or values.shape[1] != len(characters) or not np.isfinite(values).all():
        raise ValueError("modelCorrupt")
    indices = values.argmax(axis=1)
    scores = values.max(axis=1)
    keep = (indices != 0)
    keep[1:] &= indices[1:] != indices[:-1]
    text = "".join(characters[int(index)] for index in indices[keep])
    return text, float(scores[keep].mean()) if keep.any() else 0.0


def arabic_logical_order(text: str) -> str:
    # PaddleOCR's Arabic decoder preserves Latin/number runs while reversing visual output.
    return "".join(reversed(re.findall(r"[a-zA-Z0-9 :*./%+\-]+|.", text, flags=re.DOTALL)))


def recognition_quality(result: tuple[str, float]) -> float:
    # An unsupported recognizer can confidently retain only the digits in a line.
    return result[1] * math.sqrt(sum(not char.isspace() for char in result[0]))


def detected_quads(probability, width: int, height: int):
    import cv2
    import numpy as np

    probability = np.asarray(probability).squeeze()
    if probability.ndim != 2 or not np.isfinite(probability).all():
        raise ValueError("modelCorrupt")
    binary = (probability > 0.3).astype(np.uint8)
    contours, _ = cv2.findContours(binary, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    quads = []
    scale = np.array([width / probability.shape[1], height / probability.shape[0]])
    for contour in sorted(contours, key=cv2.contourArea, reverse=True)[:MAX_BLOCKS * 4]:
        rect = cv2.minAreaRect(contour)
        (cx, cy), (bw, bh), angle = rect
        if min(bw, bh) < 3:
            continue
        x, y, box_width, box_height = cv2.boundingRect(contour)
        mask = np.zeros((box_height, box_width), dtype=np.uint8)
        cv2.drawContours(mask, [contour - [x, y]], -1, 1, -1)
        if cv2.mean(probability[y:y + box_height, x:x + box_width], mask)[0] < 0.5:
            continue
        # DB detection shrinks text; expand the fitted rectangle by its area/perimeter.
        expand = bw * bh * 1.5 / max(bw + bh, 1)
        points = cv2.boxPoints(((cx, cy), (bw + expand, bh + expand), angle)) * scale
        center = points.mean(axis=0)
        order = np.argsort(np.arctan2(points[:, 1] - center[1], points[:, 0] - center[0]))
        points = points[order]
        points = np.roll(points, -int(np.argmin(points.sum(axis=1))), axis=0)
        points[:, 0] = points[:, 0].clip(0, width - 1)
        points[:, 1] = points[:, 1].clip(0, height - 1)
        quads.append(points.astype(np.float32))
        if len(quads) >= MAX_BLOCKS:
            break
    return sorted(quads, key=lambda p: (round(float(p[:, 1].mean()) / 12), float(p[:, 0].min())))


class ScreenOcr:
    def __init__(self, model_root: Path, manager: ModelManager | None = None, spec=None) -> None:
        self.spec = spec or PP_OCRV5_MOBILE
        self.languages = OCR_LANGUAGES.get(self.spec.model_id, ())
        self._variants: dict[str, ScreenOcr] = {}
        self._device_variants: dict[tuple[str, str], ScreenOcr] = {}
        self.execution_provider = "cpu"
        self.models = manager or ModelManager(model_root)
        self.root = self.models.model_root
        # Only the OCR owner cleans its staging folders; listing models in the other
        # engine process must never remove a currently downloading OCR snapshot.
        self.models.cleanup_stale([self.spec])
        self._lock = asyncio.Lock()
        self.lease = asyncio.Lock()
        self._inference_gate = ConcurrencyGate()
        self._session_lock = threading.Lock()
        self._cancel = threading.Event()
        self._install: asyncio.Task | None = None
        self._state: dict = {}
        self._sessions: dict = {}
        self._verified = None
        self._closed = False
        self._loaded = False

    def status(self) -> dict:
        installed = self.models.is_installed(self.spec)
        state = dict(self._state)
        if installed and not self._lock.locked():
            try:
                self._verify()
            except ValueError as exc:
                installed = False
                state = {"state": "failed", "error": str(exc)}
                if state != self._state:
                    self._publish(**state)
        snapshot = {
            "installed": installed,
            "state": "idle", "downloadBytes": self.spec.total_bytes,
            "languages": ["auto", *self.languages], **state,
        }
        from ..resources import RESOURCE_BY_ID

        definition = RESOURCE_BY_ID[self.spec.model_id]
        directory = self.models.model_path(self.spec)
        installed_bytes = sum((directory / entry.path).stat().st_size for entry in self.spec.files
                              if (directory / entry.path).is_file())
        snapshot["resource"] = ResourceRecord(
            resourceId=definition.resource_id, kind=definition.kind, provider=definition.provider,
            name=definition.name, description=definition.description, languages=list(definition.languages),
            installed=installed, installedBytes=installed_bytes, downloadBytes=self.spec.total_bytes,
            state=snapshot["state"], phase=snapshot.get("phase"), progress=snapshot.get("progress"),
            errorCode=snapshot.get("error"), cancellable=snapshot["state"] == "running",
        ).model_dump()
        return snapshot

    def _publish(self, **state) -> None:
        self._state = state
        self.root.mkdir(parents=True, exist_ok=True)
        target = self.root / (STATE_FILE if self.spec.model_id == OCR_RESOURCE_ID else f".screen-ocr-{self.spec.model_id}-state.json")
        staging = target.with_suffix(".tmp")
        staging.write_text(json.dumps({"pid": os.getpid(), **state}), encoding="utf-8")
        staging.replace(target)

    def _verify(self) -> Path:
        directory = self.models.model_path(self.spec)
        if not directory.exists():
            raise ValueError("modelMissing")
        if not self.models._owned_directory(directory) or any(
            not (directory / entry.path).resolve().is_relative_to(directory)
            for entry in self.spec.files
        ):
            raise ValueError("modelCorrupt")
        try:
            fingerprint = tuple((path.stat().st_size, path.stat().st_mtime_ns) for path in
                                (directory / entry.path for entry in self.spec.files))
        except OSError as exc:
            raise ValueError("modelMissing") from exc
        if fingerprint != self._verified:
            self._sessions.clear()
            if self._loaded:
                self._loaded = False
                raise ValueError("modelCorrupt")
            try:
                for entry in self.spec.files:
                    self.models._verify_file(directory / entry.path, entry)
            except ModelIntegrityError as exc:
                raise ValueError("modelCorrupt") from exc
            self._verified = fingerprint
        return directory

    async def install(self, network=None) -> dict:
        if self._closed or self._loaded or self._lock.locked() or (self._install and not self._install.done()):
            raise ValueError("resourceBusy")
        self._cancel.clear()
        self._publish(state="running", phase="verify", progress=0)
        self._install = asyncio.create_task(self._run_install(network))
        return self.status()

    async def _run_install(self, network) -> None:
        async with self._lock:
            loop = asyncio.get_running_loop()
            phase = "verify"

            def progress(current, total):
                if self._cancel.is_set():
                    raise InterruptedError("cancelled")
                current_phase = phase
                loop.call_soon_threadsafe(lambda: self._publish(
                    state="cancelling" if self._cancel.is_set() else "running",
                    phase=current_phase, progress=min(1, current / max(total, 1))))

            def on_phase(value):
                nonlocal phase
                phase = value
                progress(0, 1)

            def run():
                self._sessions.clear()
                self._verified = None
                # ensure() checks sizes at startup; remove only digest-invalid files to repair
                # same-size corruption without downloading the valid sibling weights again.
                directory = self.models.model_path(self.spec)
                if directory.exists() and (not self.models._owned_directory(directory) or any(
                    not (directory / entry.path).resolve().is_relative_to(directory)
                    for entry in self.spec.files
                )):
                    raise ModelIntegrityError("Model directory contains external links")
                for entry in self.spec.files:
                    path = directory / entry.path
                    if path.exists():
                        try:
                            self.models._verify_file(path, entry, lambda: progress(0, 1))
                        except ModelIntegrityError:
                            path.unlink()
                self.models.ensure(self.spec, progress=progress, on_phase=on_phase, network=network)

            try:
                await asyncio.to_thread(run)
            except InterruptedError:
                self._publish(state="idle")
            except Exception as exc:
                write_diagnostic("engine", "screen.ocr.install.failed", exception_fields(exc))
                self._publish(state="failed", error="modelCorrupt" if isinstance(exc, ModelIntegrityError) else "installFailed")
            else:
                self._publish(state="idle")

    async def cancel_install(self) -> dict:
        self._cancel.set()
        if self._install:
            await self._install
        return self.status()

    async def remove(self) -> dict:
        if self._loaded or self._lock.locked() or (self._install and not self._install.done()):
            raise ValueError("resourceBusy")
        async with self._lock:
            self._sessions.clear()
            self._verified = None
            directory = self.models.model_path(self.spec)
            if directory.exists():
                if not self.models._owned_directory(directory):
                    raise ValueError("modelCorrupt")
                # model_path and _owned_directory constrain deletion to the model root.
                import shutil
                await asyncio.to_thread(shutil.rmtree, directory)
            self._publish(state="idle")
        return self.status()

    def _session(self, path: Path):
        import onnxruntime as ort

        key = str(path)
        with self._session_lock:
            if key not in self._sessions:
                options = ort.SessionOptions()
                options.intra_op_num_threads = min(2, os.cpu_count() or 1)
                options.inter_op_num_threads = 1
                options.log_severity_level = 3
                provider = self._session_provider(path)
                _require_device_provider(provider)
                if provider == "dml":
                    options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
                    options.enable_mem_pattern = False
                session = ort.InferenceSession(key, options, providers=[
                    _DEVICE_PROVIDERS[provider], "CPUExecutionProvider"] if provider != "cpu"
                    else ["CPUExecutionProvider"])
                actual = set(session.get_providers())
                if provider != "cpu" and _DEVICE_PROVIDERS[provider] not in actual:
                    raise ValueError("runtimeUnavailable")
                self._sessions[key] = session
        return self._sessions[key]

    def _session_provider(self, path: Path) -> str:
        return self.execution_provider

    @staticmethod
    def _recognize(crop, recognizer) -> tuple[str, float]:
        return ScreenOcr._recognize_batch([crop], recognizer)[0]

    @staticmethod
    def _recognize_batch(crops, recognizer):
        import cv2
        import numpy as np

        metadata = recognizer.get_modelmeta().custom_metadata_map
        if not metadata.get("character"):
            raise ValueError("modelCorrupt")
        characters = [""] + metadata["character"].splitlines() + [" "]
        shape = recognizer.get_inputs()[0].shape
        height = shape[2] if isinstance(shape[2], int) else 48
        width = shape[3] if isinstance(shape[3], int) else min(2048, max(320, max(math.ceil(crop.shape[1] * height / crop.shape[0]) for crop in crops)))

        def recognize(images):
            tensor = np.zeros((len(images), 3, height, width), dtype=np.float32)
            for index, image in enumerate(images):
                resized_width = min(width, math.ceil(image.shape[1] * height / image.shape[0]))
                resized = cv2.resize(image, (resized_width, height)).astype(np.float32) / 127.5 - 1
                tensor[index, :, :, :resized_width] = resized.transpose(2, 0, 1)
            prediction = recognizer.run(None, {recognizer.get_inputs()[0].name: tensor})[0]
            if len(prediction) != len(images):
                raise ValueError("modelCorrupt")
            return [ctc_decode(prediction[index:index + 1], characters) for index in range(len(images))]

        batch_size = min(5, shape[0]) if isinstance(shape[0], int) else 5
        results = []
        for offset in range(0, len(crops), batch_size):
            images = crops[offset:offset + batch_size]
            batch = recognize(images)
            for index, result in enumerate(batch):
                if result[1] < 0.7:
                    # Retry uncertain text upside-down without loading a separate orientation model.
                    batch[index] = max(result, recognize([np.rot90(images[index], 2)])[0], key=recognition_quality)
            results.extend(batch)
        return results

    def _detect_quads(self, image, directory):
        import cv2
        import numpy as np

        height, width = image.shape[:2]
        ratio = min(1, 960 / max(height, width))
        size = (max(32, round(width * ratio / 32) * 32), max(32, round(height * ratio / 32) * 32))
        tensor = cv2.resize(image, size).astype(np.float32) / 255
        tensor = ((tensor - np.array([0.485, 0.456, 0.406], dtype=np.float32)) /
                  np.array([0.229, 0.224, 0.225], dtype=np.float32)).transpose(2, 0, 1)[None]
        detector = self._session(directory / OCR_DETECTOR)
        prediction = detector.run(None, {detector.get_inputs()[0].name: tensor})[0]
        return detected_quads(prediction, width, height)

    def _recognize_quads(self, image, quads, directory, language, batch_size):
        import cv2
        import numpy as np

        if not len(quads):
            return []
        if self.spec.model_id == OCR_RESOURCE_ID:
            languages = ("ch", "ko") if language == "auto" else ("ko" if language == "ko" else "ch",)
            paths = [OCR_RECOGNIZERS[language] for language in languages]
        else:
            paths = [entry.path for entry in self.spec.files if "_rec_" in entry.path]
        recognizers = [self._session(directory / path) for path in paths]
        def crop(points):
            quad = np.asarray(points, dtype=np.float32)
            crop_width = max(1, round(max(np.linalg.norm(quad[0] - quad[1]), np.linalg.norm(quad[2] - quad[3]))))
            crop_height = max(1, round(max(np.linalg.norm(quad[0] - quad[3]), np.linalg.norm(quad[1] - quad[2]))))
            scale = min(1, 2048 / max(crop_width, crop_height), 512 / min(crop_width, crop_height))
            crop_width, crop_height = max(1, round(crop_width * scale)), max(1, round(crop_height * scale))
            target = np.array([[0, 0], [crop_width - 1, 0], [crop_width - 1, crop_height - 1], [0, crop_height - 1]], dtype=np.float32)
            pixels = cv2.warpPerspective(image, cv2.getPerspectiveTransform(quad, target), (crop_width, crop_height),
                                         borderMode=cv2.BORDER_REPLICATE)
            return np.rot90(pixels) if crop_height > crop_width * 1.5 else pixels

        recognized = []
        for offset in range(0, len(quads), batch_size):
            crops = [crop(quad) for quad in quads[offset:offset + batch_size]]
            candidates = [self._recognize_batch(crops, recognizer) for recognizer in recognizers]
            recognized.extend(max(items, key=recognition_quality) for items in zip(*candidates))
        if self.spec.model_id == "pp-ocrv5-mobile-arabic-onnx":
            recognized = [(arabic_logical_order(text), confidence) for text, confidence in recognized]
        return recognized

    def _infer(self, request: OcrRequest) -> dict:
        directory = self._verify()
        image = decode_image(request.image)
        height, width = image.shape[:2]
        quads = self._detect_quads(image, directory)
        batch_size = request.max_concurrency if request.task_mode == "offline" else 1
        blocks = []
        for quad, (text, confidence) in zip(quads, self._recognize_quads(image, quads, directory, request.language, batch_size)):
            if text.strip() and confidence >= 0.5:
                blocks.append({"id": str(len(blocks)), "text": text, "confidence": round(confidence, 5), "quad": quad.round(2).tolist()})
        if request.appearance:
            for block in blocks:
                block["appearance"] = screen_text_appearance(image, block["quad"])
        return {"blocks": blocks, "width": width, "height": height}

    async def infer(self, request: OcrRequest) -> dict:
        return await self._run_inference(request.language, request.max_concurrency,
                                         request.task_mode == "realtime", self._infer, request)

    async def detect_comic(self, image):
        def detect():
            return self._detect_quads(image, self._verify())
        return await self._run_inference("auto", 1, False, detect)

    async def recognize_comic(self, image, quads, language):
        def recognize():
            return self._recognize_quads(image, quads, self._verify(), language, 5)
        return await self._run_inference(language, 1, False, recognize)

    async def recognize_comic_box(self, image, quad, language, vertical):
        def recognize():
            import numpy as np

            directory = self._verify()
            xs, ys = zip(*quad)
            x, y = math.floor(min(xs)), math.floor(min(ys))
            crop = image[y:math.ceil(max(ys)), x:math.ceil(max(xs))]
            if crop.size:
                from .lumina_ppocrv6.preprocess import split_lines
                line_crops,_=split_lines(crop)
                if len(line_crops)>1:
                    recognized=[]
                    for pixels in line_crops:
                        height,width=pixels.shape[:2]
                        line_quad=np.array([[0,0],[width-1,0],[width-1,height-1],[0,height-1]],np.float32)
                        recognized.extend(self._recognize_quads(pixels,[line_quad],directory,language,5))
                    if any(text.strip() and confidence>=.5 for text,confidence in recognized):
                        return recognized
            lines = self._detect_quads(crop, directory) if crop.size else []
            offset = np.array([x, y], dtype=np.float32)
            lines = sorted((line + offset for line in lines),
                           key=lambda line: (-line[:, 0].mean(), line[:, 1].mean()) if vertical
                           else (line[:, 1].mean(), line[:, 0].mean()))
            return self._recognize_quads(image, lines or [quad], directory, language, 5)

        return await self._run_inference(language, 1, False, recognize)

    async def _run_inference(self, language, concurrency, realtime, run, *args):
        if language != "auto" and language not in self.languages:
            raise ValueError("unsupportedLanguage")
        if not self._loaded:
            raise ValueError("modelNotLoaded")
        if self._closed or self._lock.locked() or (self._install and not self._install.done()):
            raise ValueError("resourceBusy")
        key = self.spec.model_id
        await self._inference_gate.acquire(key, concurrency, realtime=realtime)
        try:
            if self._closed or self._lock.locked():
                raise ValueError("resourceBusy")
            if not self._loaded:
                raise ValueError("modelNotLoaded")
            # Shield keeps the slot occupied until native inference finishes after disconnect.
            task = asyncio.create_task(asyncio.to_thread(run, *args))
            try:
                return await asyncio.shield(task)
            except asyncio.CancelledError:
                while not task.done():
                    try:
                        await asyncio.shield(task)
                    except asyncio.CancelledError:
                        continue
                    except Exception:
                        break
                if not task.cancelled():
                    task.exception()
                raise
        finally:
            self._inference_gate.release(key)

    async def close(self) -> None:
        self._closed = True
        await asyncio.gather(*(variant.close() for variant in (*self._variants.values(), *self._device_variants.values())))
        await self.cancel_install()
        await self.release()

    async def release(self) -> dict:
        key = self.spec.model_id
        await self._inference_gate.acquire(key, 1, realtime=True)
        try:
            async with self._lock:
                self._loaded = False
                self._sessions.clear()
        finally:
            self._inference_gate.release(key)
        return self.status()

    async def load(self) -> dict:
        if self._closed or self._lock.locked() or self._inference_gate.active(self.spec.model_id) or (self._install and not self._install.done()):
            raise ValueError("resourceBusy")
        async with self._lock:
            def load_weights():
                import cv2

                cv2.setNumThreads(1)
                directory = self._verify()
                detector = COMIC_DETECTOR.files[0].path if self.spec.model_id == COMIC_DETECTOR_ID else OCR_DETECTOR
                self._session(directory / detector)
                for entry in self.spec.files:
                    if "_rec_" not in entry.path:
                        continue
                    recognizer = self._session(directory / entry.path)
                    if not recognizer.get_modelmeta().custom_metadata_map.get("character"):
                        raise ValueError("modelCorrupt")

            task = asyncio.create_task(asyncio.to_thread(load_weights))
            try:
                await asyncio.shield(task)
                self._loaded = True
            except BaseException:
                # Keep the native load fenced even when its HTTP client disconnects.
                try:
                    await task
                finally:
                    self._loaded = False
                    self._sessions.clear()
                raise
        return self.status()


    def variant(self, resource_id: str) -> ScreenOcr:
        if resource_id == self.spec.model_id:
            return self
        from ..models.inpaint_catalog import INPAINT_RESOURCE_ID
        if resource_id in (LAMA_ONNX_ID, LAMA_MANGA_ONNX_ID):
            if resource_id not in self._variants:
                from .comic_inpaint import OnnxComicInpainter
                self._variants[resource_id] = OnnxComicInpainter(self.root, manga=resource_id == LAMA_MANGA_ONNX_ID)
            return self._variants[resource_id]
        if resource_id == ANGLENET_ID:
            if resource_id not in self._variants:
                from .comic_angle import ComicAngleNet
                self._variants[resource_id] = ComicAngleNet(self.root)
            return self._variants[resource_id]
        if resource_id == INPAINT_RESOURCE_ID:
            if resource_id not in self._variants:
                from .comic_inpaint import ComicInpainter
                self._variants[resource_id] = ComicInpainter(self.root)
            return self._variants[resource_id]
        if resource_id == 'manga-ocr-onnx':
            if resource_id not in self._variants:
                self._variants[resource_id] = MangaOcr(self.root, spec=OCR_SPECS[resource_id])
            return self._variants[resource_id]
        if resource_id == 'baberu-ocr-onnx':
            if resource_id not in self._variants:
                from .comic_ocr_providers import BaberuOcr
                self._variants[resource_id] = BaberuOcr(self.root)
            return self._variants[resource_id]
        if resource_id == 'pp-ocrv6-medium-onnx':
            if resource_id not in self._variants:
                from .comic_ocr_providers import PPOcrV6
                self._variants[resource_id] = PPOcrV6(self.root)
            return self._variants[resource_id]
        if resource_id == 'paddleocr-vl-1.6-onnx':
            if resource_id not in self._variants:
                from .comic_ocr_providers import PaddleOcrVl
                self._variants[resource_id] = PaddleOcrVl(self.root)
            return self._variants[resource_id]
        if resource_id == COMIC_FONT_CLASSIFIER_ID:
            if resource_id not in self._variants:
                from .comic_font_match import ComicFontMatcher
                self._variants[resource_id] = ComicFontMatcher(self.root)
            return self._variants[resource_id]
        if resource_id == COMIC_YUZU_FONT_ID:
            if resource_id not in self._variants:
                from .comic_font_match import YuzuComicFontMatcher
                self._variants[resource_id] = YuzuComicFontMatcher(self.root)
            return self._variants[resource_id]
        if resource_id == COMIC_DETECTOR_ID:
            if resource_id not in self._variants:
                self._variants[resource_id] = ComicDetector(self.root, spec=COMIC_DETECTOR)
            return self._variants[resource_id]
        if resource_id == RFDETR_SEG_ID:
            if resource_id not in self._variants:
                from .comic_ocr_providers import RfDetrSeg
                self._variants[resource_id] = RfDetrSeg(self.root)
            return self._variants[resource_id]
        if resource_id not in OCR_SPECS:
            raise HTTPException(422, detail="invalidModel")
        if resource_id not in self._variants:
            self._variants[resource_id] = ScreenOcr(self.root, spec=OCR_SPECS[resource_id])
        return self._variants[resource_id]

    def device_variant(self, resource_id: str, provider: str = "cpu") -> ScreenOcr:
        """Get a model instance pinned to one available ONNX execution provider."""
        if provider not in _DEVICE_PROVIDERS:
            raise ValueError("runtimeUnavailable")
        provider = _effective_device(resource_id, provider)
        _require_device_provider(provider)
        base = self.variant(resource_id)
        if provider == "cpu":
            return base
        key = (resource_id, provider)
        cached = self._device_variants.get(key)
        if cached is not None:
            return cached

        from .comic_angle import ComicAngleNet
        from .comic_inpaint import ComicInpainter, OnnxComicInpainter
        from .comic_font_match import ComicFontMatcher
        from .comic_ocr_providers import BaberuOcr, PaddleOcrVl, PPOcrV6, RfDetrSeg

        if isinstance(base, OnnxComicInpainter):
            instance = OnnxComicInpainter(self.root, manga=base.manga)
        elif isinstance(base, ComicAngleNet):
            instance = ComicAngleNet(self.root)
        elif isinstance(base, ComicInpainter):
            instance = ComicInpainter(self.root, manager=self.models)
        elif isinstance(base, MangaOcr):
            instance = MangaOcr(self.root, spec=base.spec)
        elif isinstance(base, ComicDetector):
            instance = ComicDetector(self.root, spec=base.spec)
        elif isinstance(base, ComicFontMatcher):
            instance = ComicFontMatcher(self.root)
        elif isinstance(base, (BaberuOcr, PPOcrV6, PaddleOcrVl, RfDetrSeg)):
            instance = type(base)(self.root)
        elif type(base) is ScreenOcr:
            instance = ScreenOcr(self.root, manager=self.models, spec=base.spec)
        else:
            raise ValueError("invalidModel")
        instance.execution_provider = provider
        self._device_variants[key] = instance
        return instance


class MangaOcr(ScreenOcr):
    """Vision-encoder/WordPiece-decoder OCR for complete Japanese comic paragraphs."""
    def __init__(self, model_root, spec):
        super().__init__(model_root, spec=spec)
        self.lease = asyncio.Lock()
        self.languages = ('ja',)

    def _session_provider(self, path: Path) -> str:
        return "cpu" if "decoder" in path.name else self.execution_provider

    async def load(self):
        if (self._closed or self._lock.locked() or self._inference_gate.active(self.spec.model_id)
                or self._install and not self._install.done()):
            raise ValueError('resourceBusy')
        async with self._lock:
            def weights():
                directory = self._verify()
                self._session(directory / 'encoder_model.onnx')
                self._session(directory / 'decoder_model.onnx')
            task = asyncio.create_task(asyncio.to_thread(weights))
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

    def _paragraph(self, image, quads):
        import cv2
        import numpy as np
        from PIL import Image

        points = np.asarray([point for quad in quads for point in quad], dtype=np.float32)
        left, top = np.maximum(0, np.floor(points.min(axis=0))).astype(int)
        right, bottom = np.minimum([image.shape[1], image.shape[0]], np.ceil(points.max(axis=0))).astype(int)
        if right <= left or bottom <= top:
            return [('', 0.0)]
        crop_pixels = image[top:bottom, left:right].copy()
        polygon = np.zeros(crop_pixels.shape[:2], np.uint8)
        cv2.fillPoly(polygon, [np.rint(np.asarray(quad) - [left,top]).astype(np.int32) for quad in quads], 255)
        # The paragraph AABB can include neighbouring author/artwork between its columns.
        crop_pixels[polygon == 0] = 255
        crop = Image.fromarray(cv2.cvtColor(crop_pixels, cv2.COLOR_BGR2RGB))
        crop = crop.convert('L').convert('RGB').resize((224, 224), Image.Resampling.BILINEAR)
        pixels = ((np.asarray(crop, np.float32) / 255 - .5) / .5).transpose(2, 0, 1)[None]
        directory = self._verify()
        encoder = self._session(directory / 'encoder_model.onnx')
        decoder = self._session(directory / 'decoder_model.onnx')
        hidden = encoder.run(None, {encoder.get_inputs()[0].name: pixels})[0]
        ids = [2]
        for _ in range(300):
            feed = {}
            for entry in decoder.get_inputs():
                if entry.name == 'input_ids':
                    feed[entry.name] = np.asarray([ids], np.int64)
                elif 'mask' in entry.name.lower():
                    feed[entry.name] = np.ones((1, hidden.shape[1]), np.int64)
                else:
                    feed[entry.name] = hidden
            token = int(np.asarray(decoder.run(None, feed)[0])[0, -1].argmax())
            if token in (0, 3):
                break
            ids.append(token)
        else:
            raise ValueError('textTooLong')
        vocab = (directory / 'vocab.txt').read_text(encoding='utf-8').splitlines()
        text = ''.join(vocab[token] for token in ids[1:] if token < len(vocab)
                       and vocab[token] not in {'[CLS]', '[SEP]', '[PAD]', '[MASK]', '[UNK]'}).replace('##', '')
        # The decoder exposes no calibrated confidence; 1.0 only marks a completed decode.
        return [(text, 1.0)]

    async def recognize_comic(self, image, quads, language):
        if language not in ('auto', 'ja'):
            raise ValueError('unsupportedLanguage')
        return await self._run_inference('ja', 1, False, self._paragraph, image, quads)

    async def recognize_comic_box(self, image, quad, language, vertical):
        return await self.recognize_comic(image, [quad], language)

    def _detector(self):
        for spec in (PP_OCRV5_MOBILE, *OCR_SPECS.values()):
            if spec.model_id.startswith('pp-ocrv5-') and self.models.is_installed(spec):
                return self.variant(spec.model_id)
        raise ValueError('ocrUnavailable')

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

    async def infer(self, request):
        if request.language not in ('auto', 'ja'):
            raise ValueError('unsupportedLanguage')
        image = decode_image(request.image)
        quads = await self.detect_comic(image)
        def recognize():
            blocks = []
            for quad in quads:
                text, confidence = self._paragraph(image, [quad])[0]
                if text.strip():
                    block = {'id': str(len(blocks)), 'text': text, 'confidence': confidence,
                             'quad': quad.round(2).tolist()}
                    if request.appearance:
                        block['appearance'] = screen_text_appearance(image, block['quad'])
                    blocks.append(block)
            return {'blocks': blocks, 'width': image.shape[1], 'height': image.shape[0]}
        return await self._run_inference(request.language, request.max_concurrency,
                                         request.task_mode == 'realtime', recognize)


class ComicDetector(ScreenOcr):
    def __init__(self, model_root, spec):
        super().__init__(model_root, spec=spec)
        self.lease = asyncio.Lock()

    def _detect_quads(self, image, directory):
        import cv2
        import numpy as np

        height, width = image.shape[:2]
        rgb = cv2.cvtColor(cv2.resize(image, (640, 640)), cv2.COLOR_BGR2RGB)
        tensor = np.ascontiguousarray(rgb.transpose(2, 0, 1)[None], dtype=np.float32) / 255
        session = self._session(directory / COMIC_DETECTOR.files[0].path)
        labels, boxes, scores = session.run(["labels", "boxes", "scores"], {
            "images": tensor, "orig_target_sizes": np.array([[width, height]], dtype=np.int64),
        })
        quads = []
        self.bubble_quads = []
        for label, box, score in zip(labels[0], boxes[0], scores[0]):
            if label not in (0, 1, 2) or not 0.3 <= score <= 1 or not np.isfinite(box).all():
                continue
            left, top, right, bottom = np.clip(box, 0, [width, height, width, height]).tolist()
            if right - left >= 1 and bottom - top >= 1:
                quad = [[left, top], [right, top], [right, bottom], [left, bottom]]
                (self.bubble_quads if label == 0 else quads).append(quad)
        return quads[:MAX_BLOCKS]

    async def infer(self, request: OcrRequest) -> dict:
        raise ValueError("unsupportedModel")


def build_screen_ocr_router(service: ScreenOcr) -> APIRouter:
    router = APIRouter(prefix="/screen/ocr")

    async def invoke(action):
        try:
            return await action
        except ValueError as exc:
            code = str(exc)
            raise HTTPException(409 if code == "resourceBusy" else 422, detail=code) from exc
        except ImportError as exc:
            raise HTTPException(503, detail="runtimeUnavailable") from exc
        except Exception as exc:
            raise HTTPException(503, detail="ocrFailed") from exc

    @router.get("")
    async def status(resource_id: str = OCR_RESOURCE_ID):
        return service.variant(resource_id).status()

    @router.post("")
    async def infer(body: OcrRequest, resource_id: str = OCR_RESOURCE_ID):
        return await invoke(service.variant(resource_id).infer(body))

    @router.post("/install")
    async def install(body: OcrInstallRequest | None = None, resource_id: str = OCR_RESOURCE_ID):
        return await invoke(service.variant(resource_id).install(body.network if body else None))

    @router.delete("/install")
    async def cancel(resource_id: str = OCR_RESOURCE_ID):
        return await invoke(service.variant(resource_id).cancel_install())

    @router.delete("")
    async def remove(resource_id: str = OCR_RESOURCE_ID):
        return await invoke(service.variant(resource_id).remove())

    @router.post("/release")
    async def release(resource_id: str = OCR_RESOURCE_ID):
        return await invoke(service.variant(resource_id).release())

    @router.post("/load")
    async def load(resource_id: str = OCR_RESOURCE_ID):
        target = service.variant(resource_id)
        for other in (service, *service._variants.values()):
            if other is not target and other.spec.model_id in OCR_SPECS and other._loaded:
                await invoke(other.release())
        return await invoke(target.load())

    return router
