"""Installed-only LaMA Manga resource using the existing visual resource lifecycle."""
from __future__ import annotations

import asyncio
from pathlib import Path

from ..models.inpaint_catalog import LAMA_MANGA
from .screen_ocr import ScreenOcr


def inpaint_with_model(model, device, image, mask):
    """Saber-compatible RGB normalization, 8-pixel padding and masked compositing."""
    import cv2
    import numpy as np
    import torch

    if (image.dtype != np.uint8 or image.ndim != 3 or image.shape[2] != 3
            or mask.dtype != np.uint8 or mask.shape != image.shape[:2]
            or not image.size or image.shape[0] * image.shape[1] > 12_000_000):
        raise ValueError("invalidImage")
    if not np.any(mask >= 127):
        return image.copy()
    height, width = mask.shape
    scale = min(1.0, 1024 / max(height, width))
    size = (max(16, int(width * scale)), max(16, int(height * scale)))
    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    rgb = cv2.resize(rgb, size, interpolation=cv2.INTER_LINEAR)
    resized_mask = cv2.resize(mask, size, interpolation=cv2.INTER_NEAREST)
    bottom, right = (-size[1]) % 8, (-size[0]) % 8
    rgb = cv2.copyMakeBorder(rgb, 0, bottom, 0, right, cv2.BORDER_REPLICATE)
    resized_mask = cv2.copyMakeBorder(resized_mask, 0, bottom, 0, right, cv2.BORDER_CONSTANT, value=0)
    tensor = torch.from_numpy(rgb.copy()).permute(2, 0, 1)[None].to(device=device, dtype=torch.float32) / 255
    binary = torch.from_numpy((resized_mask >= 127).astype(np.float32))[None, None].to(device)
    with torch.inference_mode():
        predicted = model(tensor * (1 - binary), binary)
    if (not isinstance(predicted, torch.Tensor) or predicted.shape != tensor.shape
            or not bool(torch.isfinite(predicted).all())):
        raise ValueError("modelCorrupt")
    output = (predicted[0].float().clamp(0, 1).cpu().permute(1, 2, 0).numpy() * 255).astype(np.uint8)
    output = output[:size[1], :size[0]]
    output = cv2.resize(output, (width, height), interpolation=cv2.INTER_LINEAR)
    output = cv2.cvtColor(output, cv2.COLOR_RGB2BGR)
    return np.where((mask >= 127)[:, :, None], output, image).astype(np.uint8)


def _load_model(path):
    from safetensors.torch import load_file
    from .lama_network import FFCResNetGenerator

    model = FFCResNetGenerator(
        4, 3, n_blocks=18, add_out_act="sigmoid",
        init_conv_kwargs=dict(ratio_gin=0, ratio_gout=0, enable_lfu=False),
        downsample_conv_kwargs=dict(ratio_gin=0, ratio_gout=0, enable_lfu=False),
        resnet_conv_kwargs=dict(ratio_gin=0.75, ratio_gout=0.75, enable_lfu=False),
    )
    model.load_state_dict(load_file(str(path)), strict=True)
    return model.eval().to("cpu")


def _worker():
    import base64
    import json
    import sys
    import cv2
    import numpy as np

    model = _load_model(sys.argv[1])
    print("ready", flush=True)
    for line in sys.stdin:
        body = json.loads(line)
        image = cv2.imdecode(np.frombuffer(base64.b64decode(body["image"], validate=True), np.uint8), cv2.IMREAD_COLOR)
        mask = cv2.imdecode(np.frombuffer(base64.b64decode(body["mask"], validate=True), np.uint8), cv2.IMREAD_GRAYSCALE)
        result = inpaint_with_model(model, "cpu", image, mask)
        ok, png = cv2.imencode(".png", result)
        if not ok:
            raise ValueError("invalidImage")
        print(base64.b64encode(png).decode("ascii"), flush=True)


class ComicInpainter(ScreenOcr):
    def __init__(self, model_root: Path, manager=None):
        super().__init__(model_root, manager=manager, spec=LAMA_MANGA)
        self._lease_lock = asyncio.Lock()
        self._process = None

    async def load(self):
        import json
        import sys
        from .gateway.worker import _bootstrap_source, _child_env, subprocess_flags

        if self._closed or self._lock.locked() or self._loaded or (self._install and not self._install.done()):
            raise ValueError("resourceBusy")
        async with self._lock:
            directory = self._verify()
            paths, native = _bootstrap_source()
            bootstrap = (
                "import os,sys; "
                f"sys.path[:0]={json.dumps(paths)}; "
                f"_dll=[os.add_dll_directory(p) for p in {json.dumps(native)} if hasattr(os,'add_dll_directory') and os.path.isdir(p)]; "
                "from nola_translator_engine.backend.comic_inpaint import _worker; _worker()"
            )
            try:
                self._process = await asyncio.create_subprocess_exec(
                    sys.executable, "-I", "-X", "utf8", "-c", bootstrap,
                    str(directory / LAMA_MANGA.files[0].path),
                    stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.DEVNULL, limit=40 * 1024 * 1024,
                    env=_child_env(str(self.root)),
                    creationflags=getattr(subprocess_flags(), "CREATE_NO_WINDOW", 0),
                )
                ready = await asyncio.wait_for(self._process.stdout.readline(), 120)
                if ready.strip() != b"ready":
                    raise ValueError("runtimeUnavailable")
                self._loaded = True
            except BaseException:
                await self._stop_worker()
                raise
        return self.status()

    async def _stop_worker(self):
        process, self._process = self._process, None
        self._loaded = False
        if process is not None:
            if process.returncode is None:
                process.kill()
            await process.communicate()

    async def _infer_worker(self, image, mask):
        import base64
        import json
        import cv2
        import numpy as np

        process = self._process
        if process is None or process.returncode is not None:
            raise ValueError("modelNotLoaded")
        def encode(value):
            ok, png = cv2.imencode(".png", value)
            if not ok:
                raise ValueError("invalidImage")
            return base64.b64encode(png).decode("ascii")
        body = json.dumps({"image": encode(image), "mask": encode(mask)}).encode() + b"\n"
        try:
            process.stdin.write(body)
            await process.stdin.drain()
            output = await asyncio.wait_for(process.stdout.readline(), 600)
        except BaseException:
            await self._stop_worker()
            raise
        if not output or process.returncode not in (None, 0):
            raise ValueError("inpaintFailed")
        repaired = cv2.imdecode(np.frombuffer(base64.b64decode(output.strip(), validate=True), np.uint8), cv2.IMREAD_COLOR)
        if repaired is None or repaired.shape != image.shape:
            raise ValueError("invalidImage")
        return repaired

    async def repair(self, image, mask):
        key = self.spec.model_id
        await self._inference_gate.acquire(key, 1, realtime=False)
        try:
            if self._closed or self._lock.locked() or not self._loaded:
                raise ValueError("modelNotLoaded")
            self._verify()
            task = asyncio.create_task(self._infer_worker(image, mask))
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

    async def release(self):
        key = self.spec.model_id
        await self._inference_gate.acquire(key, 1, realtime=True)
        try:
            async with self._lock:
                await self._stop_worker()
        finally:
            self._inference_gate.release(key)
        return self.status()

    async def repair_installed(self, image, mask):
        async with self._lease_lock:
            try:
                await self.load()
                return await self.repair(image, mask)
            finally:
                await self.release()

    async def infer(self, request):
        raise ValueError("invalidModel")


def inpaint_onnx(session, image, mask, *, manga: bool):
    """Lumina's 512px BGR letterbox contract; preserve every unmasked source pixel."""
    import cv2
    import numpy as np
    if (image.dtype != np.uint8 or image.ndim != 3 or image.shape[2] != 3
            or mask.dtype != np.uint8 or mask.shape != image.shape[:2]
            or not image.size or image.shape[0] * image.shape[1] > 12_000_000):
        raise ValueError('invalidImage')
    if not mask.any():
        return image.copy()
    height, width = mask.shape
    scale = 512 / max(height, width)
    nw, nh = max(1, round(width * scale)), max(1, round(height * scale))
    px, py = (512 - nw) // 2, (512 - nh) // 2
    square = cv2.copyMakeBorder(cv2.resize(image, (nw, nh)), py, 512 - nh - py,
                               px, 512 - nw - px, cv2.BORDER_REPLICATE)
    binary = cv2.copyMakeBorder(cv2.resize(mask, (nw, nh), interpolation=cv2.INTER_NEAREST),
                               py, 512 - nh - py, px, 512 - nw - px, cv2.BORDER_CONSTANT)
    pixels = square.astype(np.float32).transpose(2, 0, 1)[None] / 255
    binary = (binary > 0).astype(np.float32)[None, None]
    inputs = session.get_inputs()
    feed = {entry.name: binary if 'mask' in entry.name.lower() else pixels for entry in inputs}
    if len(inputs) != 2:
        raise ValueError('modelCorrupt')
    if not any('mask' in entry.name.lower() for entry in inputs):
        feed = {inputs[0].name: pixels, inputs[1].name: binary}
    predicted = np.asarray(session.run(None, feed)[0])
    if predicted.shape != (1, 3, 512, 512) or not np.isfinite(predicted).all():
        raise ValueError('modelCorrupt')
    predicted = predicted[0].transpose(1, 2, 0) * (255 if manga else 1)
    patch = cv2.resize(predicted[py:py + nh, px:px + nw], (width, height))
    return np.where((mask > 0)[:, :, None], patch.clip(0, 255).astype(np.uint8), image)


class OnnxComicInpainter(ScreenOcr):
    def __init__(self, model_root: Path, manga: bool):
        from ..models.ocr_catalog import LAMA_MANGA_ONNX, LAMA_ONNX
        super().__init__(model_root, spec=LAMA_MANGA_ONNX if manga else LAMA_ONNX)
        self.manga = manga
        self._lease_lock = asyncio.Lock()

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

    async def repair(self, image, mask):
        key = self.spec.model_id
        await self._inference_gate.acquire(key, 1, realtime=False)
        try:
            if self._closed or self._lock.locked() or not self._loaded:
                raise ValueError('modelNotLoaded')
            session = self._session(self._verify() / self.spec.files[0].path)
            task = asyncio.create_task(asyncio.to_thread(inpaint_onnx, session, image, mask, manga=self.manga))
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
