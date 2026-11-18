"""Windows OCR sampling, following the region lifecycle in LunaTranslator v12.1.3.11."""

import asyncio
import base64
import ctypes as ct
import sys
import math
import threading
import time
from ctypes import wintypes as win
from dataclasses import dataclass
from typing import Literal
from uuid import UUID

import cv2
import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, model_validator


class CaptureRegion(BaseModel):
    id: UUID
    x: int = Field(ge=-65536, le=65536)
    y: int = Field(ge=-65536, le=65536)
    width: int = Field(gt=0, le=16384)
    height: int = Field(gt=0, le=16384)

    @property
    def edges(self):
        return self.x, self.y, self.x + self.width, self.y + self.height


class CaptureRequest(BaseModel):
    session_id: UUID
    epoch: int = Field(ge=0)
    mode: Literal["period", "analysis", "trigger"]
    manual: bool = False
    target: str = Field(default="", pattern=r"^\d{0,19}$")
    overlay: str = Field(default="", pattern=r"^\d{0,19}$")
    composition_changed: bool = False
    owner_pid: int = Field(gt=0, le=0xFFFFFFFF)
    regions: list[CaptureRegion] = Field(max_length=64)

    @model_validator(mode="after")
    def unique_regions(self):
        if len({region.id for region in self.regions}) != len(self.regions):
            raise ValueError("Duplicate capture regions")
        return self


def similarity(left, right) -> float:
    if left is None or right is None or left.shape != right.shape:
        return 0.0
    left, right = left.astype(np.float32), right.astype(np.float32)

    def blur(values):
        return cv2.GaussianBlur(values, (11, 11), 1.5)

    mean_left, mean_right = blur(left), blur(right)
    mean_left_sq, mean_right_sq = mean_left ** 2, mean_right ** 2
    means = mean_left * mean_right
    covariance = blur(left * right) - means
    variance = blur(left ** 2) - mean_left_sq + blur(right ** 2) - mean_right_sq
    score = ((2 * means + 6.5025) * (2 * covariance + 58.5225)
             / ((mean_left_sq + mean_right_sq + 6.5025) * (variance + 58.5225)))
    # Luna converts Qt RGB888 to BGR before applying its channel weights.
    return float(score.mean(axis=(0, 1), dtype=np.float64) @ [0.299, 0.587, 0.114])


class BitmapHeader(ct.Structure):
    _fields_ = [
        ("size", win.DWORD), ("width", win.LONG), ("height", win.LONG),
        ("planes", win.WORD), ("bits", win.WORD), ("compression", win.DWORD),
        ("image_size", win.DWORD), ("x_pixels", win.LONG), ("y_pixels", win.LONG),
        ("used", win.DWORD), ("important", win.DWORD),
    ]


class WindowsCapture:
    def __init__(self):
        user = ct.WinDLL("user32")
        gdi = ct.WinDLL("gdi32")
        dwm = ct.WinDLL("dwmapi")
        shcore = ct.WinDLL("shcore")
        handle, integer, boolean = win.HANDLE, ct.c_int, win.BOOL
        point, rect = ct.POINTER(win.POINT), ct.POINTER(win.RECT)
        uint, dword = win.UINT, ct.POINTER(win.DWORD)

        def bind(dll, name, result, *args):
            function = getattr(dll, name)
            function.restype, function.argtypes = result, args
            return function

        self.dpi_context = bind(user, "SetThreadDpiAwarenessContext", handle, handle)
        self.get_dc = bind(user, "GetDC", handle, handle)
        self.release_dc = bind(user, "ReleaseDC", integer, handle, handle)
        self.window_rect = bind(user, "GetWindowRect", boolean, handle, rect)
        self.client_rect = bind(user, "GetClientRect", boolean, handle, rect)
        self.client_to_screen = bind(user, "ClientToScreen", boolean, handle, point)
        self.window_dpi = bind(user, "GetDpiForWindow", uint, handle)
        self.monitor = bind(user, "MonitorFromWindow", handle, handle, win.DWORD)
        self.monitor_dpi = bind(shcore, "GetDpiForMonitor", win.LONG, handle, integer, ct.POINTER(uint), ct.POINTER(uint))
        self.iconic = bind(user, "IsIconic", boolean, handle)
        self.visible = bind(user, "IsWindowVisible", boolean, handle)
        self.foreground = bind(user, "GetForegroundWindow", handle)
        self.top_window = bind(user, "GetTopWindow", handle, handle)
        self.next_window = bind(user, "GetWindow", handle, handle, uint)
        self.process_id = bind(user, "GetWindowThreadProcessId", win.DWORD, handle, dword)
        self.class_name = bind(user, "GetClassNameW", integer, handle, win.LPWSTR, integer)
        self.window_style = bind(user, "GetWindowLongW", win.LONG, handle, integer)
        self.layered = bind(user, "GetLayeredWindowAttributes", boolean, handle, dword, ct.POINTER(win.BYTE), dword)
        self.affinity = bind(user, "GetWindowDisplayAffinity", boolean, handle, dword)
        self.dwm_attribute = bind(dwm, "DwmGetWindowAttribute", win.LONG, handle, win.DWORD, ct.c_void_p, win.DWORD)
        self.flush = bind(dwm, "DwmFlush", win.LONG)
        self.key_state = bind(user, "GetAsyncKeyState", ct.c_short, integer)
        self.compatible_dc = bind(gdi, "CreateCompatibleDC", handle, handle)
        self.dib = bind(gdi, "CreateDIBSection", handle, handle, ct.POINTER(BitmapHeader),
                        uint, ct.POINTER(ct.c_void_p), handle, win.DWORD)
        self.select = bind(gdi, "SelectObject", handle, handle, handle)
        self.delete_object = bind(gdi, "DeleteObject", boolean, handle)
        self.delete_dc = bind(gdi, "DeleteDC", boolean, handle)
        self.bitblt = bind(gdi, "BitBlt", boolean, handle, integer, integer, integer,
                          integer, handle, integer, integer, win.DWORD)

    def input_state(self):
        return tuple(bool(self.key_state(key) & 0x8000) for key in (1, 13, 17, 18, 16))

    def target_is_foreground(self, hwnd):
        target_pid, foreground_pid = win.DWORD(), win.DWORD()
        self.process_id(hwnd, ct.byref(target_pid))
        self.process_id(self.foreground(), ct.byref(foreground_pid))
        return target_pid.value != 0 and target_pid.value == foreground_pid.value

    def excluded(self, hwnd):
        affinity = win.DWORD()
        return self.affinity(hwnd, ct.byref(affinity)) and affinity.value == 0x11

    def client_bounds(self, hwnd):
        rect, origin = win.RECT(), win.POINT()
        if not self.client_rect(hwnd, ct.byref(rect)) or not self.client_to_screen(hwnd, ct.byref(origin)):
            return None
        return origin.x, origin.y, origin.x + rect.right, origin.y + rect.bottom

    def opaque_window(self, region, owner_pid):
        hwnd = self.top_window(None)
        visited = set()
        left, top, right, bottom = region.edges
        while hwnd and hwnd not in visited:
            visited.add(hwnd)
            rect = win.RECT()
            if (self.visible(hwnd) and not self.iconic(hwnd)
                    and self.window_rect(hwnd, ct.byref(rect))
                    and max(left, rect.left) < min(right, rect.right)
                    and max(top, rect.top) < min(bottom, rect.bottom)):
                pid, cloaked = win.DWORD(), win.DWORD()
                name, alpha = ct.create_unicode_buffer(32), win.BYTE()
                self.process_id(hwnd, ct.byref(pid))
                self.class_name(hwnd, name, len(name))
                self.dwm_attribute(hwnd, 14, ct.byref(cloaked), ct.sizeof(cloaked))
                style = self.window_style(hwnd, -20)
                translucent = (style & 0x80000 and self.layered(hwnd, None, ct.byref(alpha), None)
                               and alpha.value < 255)
                if (pid.value != owner_pid and name.value not in ("Progman", "WorkerW")
                        and not cloaked.value and not style & 0x20 and not translucent):
                    client = self.client_bounds(hwnd)
                    if client and client[0] <= left and client[1] <= top and client[2] >= right and client[3] >= bottom:
                        return hwnd
                    return None
            hwnd = self.next_window(hwnd, 2)
        return None

    def pixels(self, hwnd, x, y, width, height):
        if width <= 0 or height <= 0 or width * height > 34_000_000:
            return None
        source = self.get_dc(hwnd)
        if not source:
            return None
        memory = bitmap = selected = None
        try:
            memory = self.compatible_dc(source)
            if not memory:
                return None
            bits = ct.c_void_p()
            header = BitmapHeader(ct.sizeof(BitmapHeader), width, -height, 1, 32)
            bitmap = self.dib(memory, ct.byref(header), 0, ct.byref(bits), None, 0)
            if not bitmap or not bits:
                return None
            selected = self.select(memory, bitmap)
            if not selected or selected == ct.c_void_p(-1).value:
                selected = None
                return None
            if not self.bitblt(memory, 0, 0, width, height, source, x, y, 0x00CC0020):
                return None
            buffer = np.ctypeslib.as_array((ct.c_ubyte * (width * height * 4)).from_address(bits.value))
            return cv2.cvtColor(buffer.reshape(height, width, 4), cv2.COLOR_BGRA2BGR)
        finally:
            if selected:
                self.select(memory, selected)
            if bitmap:
                self.delete_object(bitmap)
            if memory:
                self.delete_dc(memory)
            self.release_dc(hwnd, source)

    def window_pixels(self, hwnd, region):
        client = self.client_bounds(hwnd)
        if (not client or self.iconic(hwnd) or region.x < client[0] or region.y < client[1]
                or region.x + region.width > client[2] or region.y + region.height > client[3]):
            return None
        monitor_x, monitor_y = win.UINT(96), win.UINT(96)
        self.monitor_dpi(self.monitor(hwnd, 2), 0, ct.byref(monitor_x), ct.byref(monitor_y))
        scale = (self.window_dpi(hwnd) or 96) / max(1, monitor_x.value)
        result = self.pixels(hwnd, round((region.x - client[0]) * scale),
                             round((region.y - client[1]) * scale),
                             round(region.width * scale), round(region.height * scale))
        if result is None or not np.any((result != 0) & (result != 255)):
            return None
        if result.shape[:2] != (region.height, region.width):
            result = cv2.resize(result, (region.width, region.height))
        return result

    def grab(self, region, target, owner_pid, desktop_allowed):
        if target:
            image = self.window_pixels(target, region)
        else:
            hwnd = self.opaque_window(region, owner_pid)
            image = self.window_pixels(hwnd, region) if hwnd else None
        if image is not None or not desktop_allowed:
            return image
        return self.pixels(None, region.x, region.y, region.width, region.height)


@dataclass
class RegionImages:
    sampled: np.ndarray | None = None
    recognized: np.ndarray | None = None


class ScreenCapture:
    def __init__(self, native):
        self.native = native
        self.lock = threading.Lock()
        self.session = None
        self.regions = {}
        self.keys = None
        self.trigger_at = None

    def sample(self, request: CaptureRequest, now: float | None = None):
        with self.lock:
            dpi = self.native.dpi_context(-4)
            try:
                return self._sample(request, time.monotonic() if now is None else now)
            finally:
                if dpi:
                    self.native.dpi_context(dpi)

    def release(self, session_id: UUID):
        with self.lock:
            if self.session and self.session[0] == session_id:
                self.session, self.regions, self.keys, self.trigger_at = None, {}, None, None

    def _sample(self, request, now):
        key = (request.session_id, request.epoch, request.mode)
        if key != self.session:
            self.session, self.regions, self.keys, self.trigger_at = key, {}, None, None
        target = int(request.target or 0)
        overlay = int(request.overlay or 0)
        trigger = not request.manual and request.mode == "trigger"
        if trigger:
            keys = self.native.input_state()
            prior, self.keys = self.keys, keys
            if self.trigger_at is None and prior is not None:
                edge = any(not prior[i] and keys[i] for i in (0, 1)) or any(prior[i] and not keys[i] for i in (2, 3, 4))
                if edge and (not target or self.native.target_is_foreground(target)):
                    self.trigger_at = now + 0.1
            if self.trigger_at is None or now < self.trigger_at:
                return {"frames": []}
        can_capture_desktop = not target or self.native.target_is_foreground(target)
        desktop_allowed = can_capture_desktop and (not overlay or self.native.excluded(overlay))
        if desktop_allowed and (overlay or request.composition_changed):
            self.native.flush()
        sizes = [min(1, 1920 / region.width, 1080 / region.height) for region in request.regions]
        total_pixels = sum(region.width * region.height * scale ** 2 for region, scale in zip(request.regions, sizes))
        budget_scale = math.sqrt(min(1, 11_000_000 / max(1, total_pixels)))
        samples = []
        needs_hidden = False
        for region, scale in zip(request.regions, sizes):
            image = self.native.grab(region, target, request.owner_pid, desktop_allowed)
            if image is None:
                needs_hidden |= can_capture_desktop and not desktop_allowed
                continue
            scale *= budget_scale
            if scale < 1:
                width = max(1, round(region.width * scale))
                height = max(1, round(region.height * scale))
                image = cv2.resize(image, (width, height), interpolation=cv2.INTER_AREA)
            samples.append((region.id, image))
        if needs_hidden:
            return {"frames": [], "hide_overlay": True}
        if request.regions and not samples:
            return {"frames": [], "unavailable": True}
        if trigger and len(samples) != len(request.regions):
            self.trigger_at = now + 0.1
            return {"frames": []}
        if trigger:
            for region_id, image in samples:
                state = self.regions.setdefault(region_id, RegionImages())
                stable = similarity(image, state.sampled) > 0.95
                state.sampled = image
                if not stable:
                    self.trigger_at = now + 0.1
                    return {"frames": []}
            self.trigger_at = None
        frames = []
        for region_id, image in samples:
            if not request.manual and request.mode == "analysis":
                state = self.regions.setdefault(region_id, RegionImages())
                stable = similarity(image, state.sampled) > 0.5
                state.sampled = image
                if not stable or similarity(image, state.recognized) > 0.95:
                    continue
                state.recognized = image
            elif request.manual and request.mode != "period":
                self.regions[region_id] = RegionImages(image, image)
            ok, encoded = cv2.imencode(".png", image)
            if ok:
                frames.append({"id": str(region_id), "image": "data:image/png;base64," + base64.b64encode(encoded).decode("ascii")})
        return {"frames": frames}


def build_screen_capture_router() -> APIRouter:
    router = APIRouter(prefix="/screen/capture")
    capture = ScreenCapture(WindowsCapture()) if sys.platform == "win32" else None

    @router.post("")
    async def sample(body: CaptureRequest):
        if capture is None:
            raise HTTPException(status_code=501, detail="captureUnavailable")
        return await asyncio.to_thread(capture.sample, body)

    @router.delete("/{session_id}", status_code=204)
    async def release(session_id: UUID):
        if capture is not None:
            await asyncio.to_thread(capture.release, session_id)

    return router
