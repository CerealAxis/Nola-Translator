"""Windows process-loopback capture (include/exclude a process tree) via COM.

Production port of the M00 spike (engine/spikes/process_loopback_capture.py),
which was verified on Windows 11 build 26200. Pure ctypes/stdlib: no
comtypes/pycaw dependency, and PyAudioWPatch 0.2.12.8 does NOT support process
exclusion (plain loopback only), so this module is the only route to R1.

Facts carried over from the spike (all measured, do not "fix" them):
  * AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK == 1 (DEFAULT is 0; using 2
    yields E_INVALIDARG).
  * The virtual VAD\\Process_Loopback device returns E_NOTIMPL from both
    GetMixFormat and IsFormatSupported; the client must be initialized with
    the DEFAULT RENDER ENDPOINT's mix format (Microsoft ApplicationLoopback
    sample does the same).
  * IAudioClient::Initialize requires AUDCLNT_STREAMFLAGS_LOOPBACK (0x20000),
    otherwise AUDCLNT_E_INVALID_STREAM_FLAG (0x88890021).
  * IAudioClient vtable slots: Initialize=3, GetMixFormat=8, Start=10,
    Stop=11, GetService=14. IAudioCaptureClient: GetBuffer=3, ReleaseBuffer=4,
    GetNextPacketSize=5.
  * CoInitializeEx(NULL, COINIT_MULTITHREADED=0): the activation completion
    callback then needs no message pump.

The module is import-safe on non-Windows (probe()/start() report a structured
reason instead of raising ImportError); ctypes types used here avoid
ctypes.wintypes because that module is Windows-only.

There is deliberately NO fallback to a plain loopback capture: a silent
fallback would re-capture Nola's own translated speech. Failures surface as
ProcessLoopbackError or a ProcessLoopbackCapability with supported=False.
"""

from __future__ import annotations

import ctypes
import os
import struct
import sys
import threading
import time
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal

# -- Platform-neutral aliases for the Win32 types used below -----------------
# (ctypes.wintypes cannot be imported on non-Windows.)
DWORD = ctypes.c_ulong
WORD = ctypes.c_ushort
UINT = ctypes.c_uint
ULONG = ctypes.c_ulong
LONG = ctypes.c_long
HRESULT = LONG
ULONGLONG = ctypes.c_ulonglong
LPCWSTR = ctypes.c_wchar_p

VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK_NAME = "VAD\\Process_Loopback"
AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK = 1
PROCESS_LOOPBACK_MODE_INCLUDE = 0
PROCESS_LOOPBACK_MODE_EXCLUDE = 1
AUDCLNT_SHAREMODE_SHARED = 0
AUDCLNT_STREAMFLAGS_LOOPBACK = 0x00020000
AUDCLNT_BUFFERFLAGS_SILENT = 0x2
AUDCLNT_BUFFERFLAGS_DATA_DISCONTINUITY = 0x1
AUDCLNT_E_DEVICE_INVALIDATED = 0x88890004
VT_BLOB = 65
COINIT_MULTITHREADED = 0
# 200 ms requested buffer, in 100 ns units.
DEFAULT_BUFFER_DURATION_100NS = 2_000_000

IID_IAUDIO_CLIENT = "{1CB9AD4C-DBFA-4C32-B178-C2F568A703B2}"
IID_IAUDIO_CAPTURE_CLIENT = "{C8ADBD64-E71E-48a0-A4DE-185C395CD317}"
CLSID_MM_DEVICE_ENUMERATOR = "{BCDE0395-E52F-467C-8E3D-C4579291692E}"
IID_IMM_DEVICE_ENUMERATOR = "{A95664D2-9614-4F35-A746-DE8DB63617E6}"

WAVE_FORMAT_PCM = 1
WAVE_FORMAT_IEEE_FLOAT = 3

#: Minimum Windows build documented for AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS.
MIN_OS_BUILD = 20348

LoopbackMode = Literal["exclude", "include"]
PcmEncoding = Literal["pcm_s16le", "pcm_f32le"]


class ProcessLoopbackError(RuntimeError):
    """Activation, initialization or read failure. Never silently downgraded
    to a plain loopback capture (which would re-capture Nola's own audio)."""

    def __init__(self, stage: str, detail: str) -> None:
        super().__init__(f"process loopback failed at {stage}: {detail}")
        self.stage = stage
        self.detail = detail


@dataclass(frozen=True, slots=True)
class ProcessLoopbackFormat:
    """Negotiated capture format; equals the default render endpoint's mix."""

    sample_rate: int
    channels: int
    encoding: PcmEncoding

    @property
    def bytes_per_sample(self) -> int:
        return 4 if self.encoding == "pcm_f32le" else 2

    @property
    def block_align(self) -> int:
        return self.channels * self.bytes_per_sample


@dataclass(frozen=True, slots=True)
class ProcessLoopbackCapability:
    """Structured probe verdict consumed by routing preflight and the UI."""

    supported: bool
    #: Machine-readable verdict: ok | unsupported_platform | os_build_too_old |
    #: activation_failed | activation_timeout | no_render_endpoint |
    #: initialize_failed | probe_exception
    reason: str
    stage: str = ""
    detail: str = ""
    os_build: int = 0
    activation_hr: int | None = None
    format: ProcessLoopbackFormat | None = None


@dataclass(frozen=True, slots=True)
class ProcessLoopbackChunk:
    """One captured buffer. Same chunk shape as audio.capture.RawAudioChunk
    (raw interleaved bytes + monotonic ms timestamp) plus the stream format
    lives on ProcessLoopbackCapture.format."""

    data: bytes
    captured_at_ms: float
    frame_count: int
    #: True when WASAPI flagged the packet AUDCLNT_BUFFERFLAGS_SILENT; the
    #: bytes are explicit capture silence (zeros), NOT a transport gap.
    silent: bool = False
    discontinuity: bool = False


# ---------------------------------------------------------------------------
# COM plumbing (ported from engine/spikes/process_loopback_probe.py)
# ---------------------------------------------------------------------------


def _guid_bytes(text: str) -> bytes:
    raw = bytes.fromhex(text.replace("-", "").replace("{", "").replace("}", ""))
    return raw[0:4][::-1] + raw[4:6][::-1] + raw[6:8][::-1] + raw[8:16]


class GUID(ctypes.Structure):
    _fields_ = [("bytes_", ctypes.c_ubyte * 16)]


def guid_from_str(text: str) -> GUID:
    g = GUID()
    ctypes.memmove(ctypes.byref(g), _guid_bytes(text), 16)
    return g


class BLOB(ctypes.Structure):
    _fields_ = [("cbSize", UINT), ("pBlobData", ctypes.c_void_p)]


class PROPVARIANT(ctypes.Structure):
    _fields_ = [
        ("vt", WORD),
        ("reserved1", WORD),
        ("reserved2", WORD),
        ("reserved3", WORD),
        ("blob", BLOB),
    ]


class PROCESS_LOOPBACK_PARAMS(ctypes.Structure):
    _fields_ = [("TargetProcessId", DWORD), ("ProcessLoopbackMode", DWORD)]


class AUDIOCLIENT_ACTIVATION_PARAMS(ctypes.Structure):
    _fields_ = [
        ("ActivationType", DWORD),
        ("ProcessLoopbackParams", PROCESS_LOOPBACK_PARAMS),
    ]


class WAVEFORMATEX(ctypes.Structure):
    _fields_ = [
        ("wFormatTag", WORD),
        ("nChannels", WORD),
        ("nSamplesPerSec", DWORD),
        ("nAvgBytesPerSec", DWORD),
        ("nBlockAlign", WORD),
        ("wBitsPerSample", WORD),
        ("cbSize", WORD),
    ]


_QueryInterface_t = ctypes.CFUNCTYPE(HRESULT, ctypes.c_void_p, ctypes.POINTER(GUID), ctypes.POINTER(ctypes.c_void_p))
_AddRef_t = ctypes.CFUNCTYPE(ULONG, ctypes.c_void_p)
_Release_t = ctypes.CFUNCTYPE(ULONG, ctypes.c_void_p)
_ActivateCompleted_t = ctypes.CFUNCTYPE(HRESULT, ctypes.c_void_p, ctypes.c_void_p)


class _HandlerVtable(ctypes.Structure):
    _fields_ = [
        ("QueryInterface", _QueryInterface_t),
        ("AddRef", _AddRef_t),
        ("Release", _Release_t),
        ("ActivateCompleted", _ActivateCompleted_t),
    ]


def _com_method(iface_ptr, slot: int, prototype):
    """Fetch and bind a COM vtable method by slot index."""
    vtable = ctypes.cast(iface_ptr, ctypes.POINTER(ctypes.POINTER(ctypes.c_void_p)))
    return prototype(vtable.contents[slot])


def _hr_hex(hr: int) -> str:
    return f"0x{hr & 0xFFFFFFFF:08X}"


class _CompletionHandler:
    """Minimal IActivateAudioInterfaceCompletionHandler (kept alive by the
    caller until the activation completes; the vtable memory must not be GC'd
    while COM may call into it)."""

    def __init__(self) -> None:
        self.done = threading.Event()
        self.hr: int | None = None
        self.audio_client: ctypes.c_void_p | None = None
        self.error = ""
        self._query = _QueryInterface_t(self._on_query)
        self._addref = _AddRef_t(lambda this: 1)
        self._release = _Release_t(lambda this: 1)
        self._completed = _ActivateCompleted_t(self._on_completed)
        self._vtable = _HandlerVtable(self._query, self._addref, self._release, self._completed)
        self._ptr_buf = ctypes.c_void_p(ctypes.addressof(self._vtable))
        self.ptr = ctypes.byref(self._ptr_buf)

    def _on_query(self, this, riid, out):
        # Single-vtable object: answer any IID with self.
        out[0] = ctypes.cast(self.ptr, ctypes.c_void_p).value
        return 0

    def _on_completed(self, this, activate_operation):
        try:
            # IActivateAudioInterfaceAsyncOperation::GetActivateResult = slot 3.
            get_result = _com_method(
                activate_operation,
                3,
                ctypes.WINFUNCTYPE(
                    HRESULT, ctypes.c_void_p, ctypes.POINTER(HRESULT), ctypes.POINTER(ctypes.c_void_p)
                ),
            )
            hr_ptr = HRESULT()
            iface = ctypes.c_void_p()
            op_hr = get_result(activate_operation, ctypes.byref(hr_ptr), ctypes.byref(iface))
            self.hr = hr_ptr.value
            if op_hr == 0 and hr_ptr.value == 0:
                self.audio_client = iface
        except Exception as exc:  # pragma: no cover - defensive
            self.hr = -1
            self.error = repr(exc)
        finally:
            self.done.set()
        return 0


def _release_interface(iface: ctypes.c_void_p | None) -> None:
    if not iface:
        return
    try:
        release = _com_method(iface, 2, _Release_t)
        release(iface.value if isinstance(iface, ctypes.c_void_p) else iface)
    except Exception:  # pragma: no cover - best effort teardown
        pass


def _co_uninitialize(ole32) -> None:
    try:
        ole32.CoUninitialize()
    except Exception:  # pragma: no cover - best effort teardown
        pass


def _activate_process_loopback_client(
    target_pid: int, mode: LoopbackMode, timeout: float
) -> tuple[ctypes.c_void_p | None, str, str, int | None, _CompletionHandler | None]:
    """Activate VAD\\Process_Loopback. Returns (client, stage, detail, hr, handler).

    The handler must be kept referenced by the caller while the client lives.
    """
    mmdevapi = ctypes.windll.LoadLibrary("Mmdevapi.dll")
    params = AUDIOCLIENT_ACTIVATION_PARAMS()
    params.ActivationType = AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK
    params.ProcessLoopbackParams.TargetProcessId = target_pid
    params.ProcessLoopbackParams.ProcessLoopbackMode = (
        PROCESS_LOOPBACK_MODE_EXCLUDE if mode == "exclude" else PROCESS_LOOPBACK_MODE_INCLUDE
    )
    # The activation params blob must outlive the async activation call.
    params_buf = ctypes.create_string_buffer(bytes(params), ctypes.sizeof(params))

    pv = PROPVARIANT()
    pv.vt = VT_BLOB
    pv.blob.cbSize = ctypes.sizeof(params)
    pv.blob.pBlobData = ctypes.cast(params_buf, ctypes.c_void_p)

    handler = _CompletionHandler()
    # PROPVARIANT holds a raw pointer; keep the blob alive on the handler for
    # as long as the async activation may reference it.
    handler._params_buf = params_buf  # type: ignore[attr-defined]
    activate = mmdevapi.ActivateAudioInterfaceAsync
    activate.restype = HRESULT
    activate.argtypes = [
        LPCWSTR,
        ctypes.POINTER(GUID),
        ctypes.POINTER(PROPVARIANT),
        ctypes.c_void_p,
        ctypes.POINTER(ctypes.c_void_p),
    ]
    iid_client = guid_from_str(IID_IAUDIO_CLIENT)
    op = ctypes.c_void_p()
    hr = activate(
        VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK_NAME,
        ctypes.byref(iid_client),
        ctypes.byref(pv),
        handler.ptr,
        ctypes.byref(op),
    )
    if hr != 0:
        return None, "activate", f"ActivateAudioInterfaceAsync hr={_hr_hex(hr)}", hr, handler
    if not handler.done.wait(timeout):
        return None, "activate", f"activation timed out after {timeout}s", None, handler
    if handler.audio_client is None:
        detail = f"GetActivateResult hr={_hr_hex(handler.hr or 0)}"
        if handler.error:
            detail += f" error={handler.error}"
        return None, "activate-result", detail, handler.hr, handler
    return handler.audio_client, "", "", handler.hr, handler


def _get_render_endpoint_mix_format() -> tuple[ctypes.Array | None, str]:
    """Copy the default render endpoint's mix format (WAVEFORMATEXTENSIBLE).

    The process-loopback virtual device implements neither GetMixFormat nor
    IsFormatSupported (both E_NOTIMPL), so per the Microsoft sample the client
    is initialized with the format of the endpoint the target processes
    render to. Returns (buffer, detail); buffer is None on failure.
    """
    ole32 = ctypes.windll.ole32
    clsid = guid_from_str(CLSID_MM_DEVICE_ENUMERATOR)
    iid = guid_from_str(IID_IMM_DEVICE_ENUMERATOR)
    enum_ptr = ctypes.c_void_p()
    hr = ole32.CoCreateInstance(
        ctypes.byref(clsid), None, 1, ctypes.byref(iid), ctypes.byref(enum_ptr)
    )
    if hr != 0 or not enum_ptr:
        return None, f"CoCreateInstance(IMMDeviceEnumerator) hr={_hr_hex(hr)}"
    try:
        # IMMDeviceEnumerator::GetDefaultAudioEndpoint = slot 4 (eRender=0, eMultimedia=1).
        get_default = _com_method(
            enum_ptr,
            4,
            ctypes.WINFUNCTYPE(
                HRESULT, ctypes.c_void_p, DWORD, DWORD, ctypes.POINTER(ctypes.c_void_p)
            ),
        )
        device = ctypes.c_void_p()
        hr = get_default(enum_ptr.value, 0, 1, ctypes.byref(device))
        if hr != 0 or not device:
            return None, f"GetDefaultAudioEndpoint hr={_hr_hex(hr)}"
        try:
            # IMMDevice::Activate(IAudioClient) = slot 3.
            iid_client = guid_from_str(IID_IAUDIO_CLIENT)
            activate = _com_method(
                device,
                3,
                ctypes.WINFUNCTYPE(
                    HRESULT,
                    ctypes.c_void_p,
                    ctypes.POINTER(GUID),
                    DWORD,
                    ctypes.c_void_p,
                    ctypes.POINTER(ctypes.c_void_p),
                ),
            )
            endpoint_client = ctypes.c_void_p()
            hr = activate(device.value, ctypes.byref(iid_client), 1, None, ctypes.byref(endpoint_client))
            if hr != 0:
                return None, f"endpoint Activate hr={_hr_hex(hr)}"
            try:
                # IAudioClient::GetMixFormat = slot 8; CoTaskMemAlloc'd result.
                get_mix_format = _com_method(
                    endpoint_client,
                    8,
                    ctypes.WINFUNCTYPE(HRESULT, ctypes.c_void_p, ctypes.POINTER(ctypes.c_void_p)),
                )
                fmt = ctypes.c_void_p()
                hr = get_mix_format(endpoint_client.value, ctypes.byref(fmt))
                if hr != 0 or not fmt:
                    return None, f"endpoint GetMixFormat hr={_hr_hex(hr)}"
                wfe = WAVEFORMATEX.from_address(fmt.value)
                size = 18 + wfe.cbSize
                local = ctypes.create_string_buffer(ctypes.string_at(fmt.value, size), size)
                ole32.CoTaskMemFree(fmt)
                return local, ""
            finally:
                _release_interface(endpoint_client)
        finally:
            _release_interface(device)
    finally:
        _release_interface(enum_ptr)


def _format_from_mix_buffer(fmt_buf: ctypes.Array) -> ProcessLoopbackFormat:
    wfe = WAVEFORMATEX.from_address(ctypes.cast(fmt_buf, ctypes.c_void_p).value)
    if wfe.wBitsPerSample == 32 and wfe.wFormatTag in (WAVE_FORMAT_IEEE_FLOAT, 0xFFFE):
        encoding: PcmEncoding = "pcm_f32le"
    elif wfe.wBitsPerSample == 16:
        encoding = "pcm_s16le"
    else:
        raise ProcessLoopbackError(
            "format", f"unsupported mix format tag={wfe.wFormatTag} bits={wfe.wBitsPerSample}"
        )
    return ProcessLoopbackFormat(
        sample_rate=int(wfe.nSamplesPerSec), channels=int(wfe.nChannels), encoding=encoding
    )


def _initialize_loopback_client(
    client: ctypes.c_void_p, fmt_buf: ctypes.Array
) -> tuple[bool, str]:
    """IAudioClient::Initialize in shared mode WITH the LOOPBACK flag."""
    initialize = _com_method(
        client,
        3,
        ctypes.WINFUNCTYPE(
            HRESULT, ctypes.c_void_p, ctypes.c_int, DWORD, ctypes.c_longlong,
            ctypes.c_longlong, ctypes.c_void_p, ctypes.POINTER(GUID),
        ),
    )
    fmt_ptr = ctypes.cast(fmt_buf, ctypes.c_void_p)
    hr = initialize(
        client.value, AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_LOOPBACK,
        DEFAULT_BUFFER_DURATION_100NS, 0, fmt_ptr, None,
    )
    if hr != 0:
        return False, f"IAudioClient::Initialize hr={_hr_hex(hr)}"
    return True, ""


def _windows_build() -> int:
    try:
        return int(sys.getwindowsversion().build)
    except Exception:
        return 0


class ProcessLoopbackCapture:
    """Capture system audio including/excluding one process tree.

    The caller passes the root PID of the real playback process tree (for
    Nola: the Electron main process, so renderer/utility children are covered
    by the tree semantics verified in M00). Excluding only the Python backend
    PID is NOT sufficient and must not be wired that way.

    Lifecycle: start() spawns one dedicated COM thread (MTA) that activates,
    initializes, starts the stream and polls IAudioCaptureClient; chunks are
    pushed to a bounded queue with oldest-eviction, mirroring
    audio.capture.RawAudioQueue semantics. stop() is idempotent.
    """

    def __init__(
        self,
        target_pid: int,
        *,
        mode: LoopbackMode = "exclude",
        queue_capacity: int = 200,
        poll_interval_s: float = 0.005,
        target_alive: Callable[[], bool] | None = None,
    ) -> None:
        if target_pid <= 0:
            raise ValueError("target_pid must be a positive process id")
        if queue_capacity <= 0:
            raise ValueError("queue_capacity must be positive")
        self.target_pid = target_pid
        self.mode = mode
        self.queue_capacity = queue_capacity
        self.poll_interval_s = poll_interval_s
        self._target_alive = target_alive
        self.format: ProcessLoopbackFormat | None = None
        self.running = False
        self.dropped_chunks = 0
        self.dropped_frames = 0
        self.captured_frames = 0
        self.failure: ProcessLoopbackError | None = None
        self._queue: deque[ProcessLoopbackChunk] = deque()
        self._cond = threading.Condition()
        self._stop_event = threading.Event()
        self._ready = threading.Event()
        self._startup_error: ProcessLoopbackError | None = None
        self._thread: threading.Thread | None = None
        self._handler: _CompletionHandler | None = None

    # -- capability probe ----------------------------------------------------

    @classmethod
    def probe(cls, target_pid: int | None = None, *, timeout: float = 10.0, mode: LoopbackMode = "exclude") -> ProcessLoopbackCapability:
        """Structured support probe: OS build gate, activation, render mix
        format and a real Initialize with the LOOPBACK flag. Safe to call
        repeatedly; performs no capture and changes no system setting."""
        if sys.platform != "win32":
            return ProcessLoopbackCapability(False, "unsupported_platform", "platform", "not windows")
        build = _windows_build()
        if build and build < MIN_OS_BUILD:
            return ProcessLoopbackCapability(
                False, "os_build_too_old", "os",
                f"process loopback requires Windows build >= {MIN_OS_BUILD}, got {build}",
                os_build=build,
            )
        pid = target_pid if target_pid is not None else os.getpid()
        ole32 = ctypes.windll.ole32
        hr = ole32.CoInitializeEx(None, COINIT_MULTITHREADED)
        if hr not in (0, 1, -2147417850):  # S_OK / S_FALSE / RPC_E_CHANGED_MODE
            return ProcessLoopbackCapability(
                False, "probe_exception", "coinit", f"CoInitializeEx hr={hr}", os_build=build
            )
        client = None
        handler = None
        try:
            client, stage, detail, act_hr, handler = _activate_process_loopback_client(pid, mode, timeout)
            if client is None:
                reason = "activation_timeout" if stage == "activate" and act_hr is None else "activation_failed"
                return ProcessLoopbackCapability(
                    False, reason, stage, detail, os_build=build, activation_hr=act_hr
                )
            fmt_buf, fmt_detail = _get_render_endpoint_mix_format()
            if fmt_buf is None:
                return ProcessLoopbackCapability(
                    False, "no_render_endpoint", "mix-format", fmt_detail,
                    os_build=build, activation_hr=act_hr,
                )
            try:
                fmt = _format_from_mix_buffer(fmt_buf)
            except ProcessLoopbackError as error:
                return ProcessLoopbackCapability(
                    False, "no_render_endpoint", "format", error.detail, os_build=build, activation_hr=act_hr
                )
            ok, init_detail = _initialize_loopback_client(client, fmt_buf)
            if not ok:
                return ProcessLoopbackCapability(
                    False, "initialize_failed", "initialize", init_detail,
                    os_build=build, activation_hr=act_hr, format=fmt,
                )
            return ProcessLoopbackCapability(
                True, "ok", "done", "activation and loopback initialize succeeded",
                os_build=build, activation_hr=act_hr, format=fmt,
            )
        except Exception as exc:
            return ProcessLoopbackCapability(
                False, "probe_exception", "probe", f"{type(exc).__name__}: {exc}", os_build=build
            )
        finally:
            _release_interface(client)
            del handler
            _co_uninitialize(ole32)

    # -- lifecycle -----------------------------------------------------------

    def start(self, *, timeout: float = 10.0) -> ProcessLoopbackFormat:
        """Start capture on a dedicated COM thread. Raises ProcessLoopbackError
        on any activation/initialization failure; there is no loopback fallback."""
        if self.running:
            assert self.format is not None
            return self.format
        self.failure = None
        self._startup_error = None
        self._stop_event.clear()
        self._ready.clear()
        with self._cond:
            self._queue.clear()
        self._thread = threading.Thread(
            target=self._run, name="nola-process-loopback", daemon=True
        )
        self._thread.start()
        if not self._ready.wait(timeout):
            self.stop()
            raise ProcessLoopbackError("start", f"capture thread not ready after {timeout}s")
        if self._startup_error is not None:
            error = self._startup_error
            self.stop()
            raise error
        self.running = True
        assert self.format is not None
        return self.format

    def stop(self) -> None:
        """Idempotent: signal the reader thread, join it, drop COM refs."""
        self._stop_event.set()
        with self._cond:
            self._cond.notify_all()
        thread = self._thread
        self._thread = None
        self.running = False
        if thread is not None and thread.is_alive() and thread is not threading.current_thread():
            thread.join(timeout=5.0)

    # -- chunk queue ---------------------------------------------------------

    def get_chunk(self, timeout: float) -> ProcessLoopbackChunk | None:
        """Blocking read. Returns None on timeout; raises the capture failure
        once the queue is drained so device loss is explicit, not silent."""
        deadline = time.monotonic() + timeout
        with self._cond:
            while True:
                if self._queue:
                    return self._queue.popleft()
                if self.failure is not None:
                    raise self.failure
                if not self.running and self._thread is None:
                    return None
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    return None
                self._cond.wait(remaining)

    def _put_chunk(self, chunk: ProcessLoopbackChunk) -> None:
        with self._cond:
            if len(self._queue) >= self.queue_capacity:
                # Oldest-eviction like RawAudioQueue: a stalled consumer must
                # not grow memory without bound; the drop is counted.
                self.dropped_frames += self._queue.popleft().frame_count
                self.dropped_chunks += 1
            self._queue.append(chunk)
            self._cond.notify_all()

    def _set_failure(self, error: ProcessLoopbackError) -> None:
        self.failure = error
        self.running = False
        with self._cond:
            self._cond.notify_all()

    # -- COM reader thread ---------------------------------------------------

    def _run(self) -> None:
        ole32 = ctypes.windll.ole32
        hr = ole32.CoInitializeEx(None, COINIT_MULTITHREADED)
        if hr not in (0, 1, -2147417850):
            self._startup_error = ProcessLoopbackError("coinit", f"CoInitializeEx hr={hr}")
            self._ready.set()
            return
        client: ctypes.c_void_p | None = None
        capture: ctypes.c_void_p | None = None
        try:
            client, stage, detail, _act_hr, handler = _activate_process_loopback_client(
                self.target_pid, self.mode, 10.0
            )
            # Keep the completion handler referenced for the thread lifetime.
            self._handler = handler
            if client is None:
                self._startup_error = ProcessLoopbackError(stage or "activate", detail)
                self._ready.set()
                return
            fmt_buf, fmt_detail = _get_render_endpoint_mix_format()
            if fmt_buf is None:
                self._startup_error = ProcessLoopbackError("mix-format", fmt_detail)
                self._ready.set()
                return
            try:
                self.format = _format_from_mix_buffer(fmt_buf)
            except ProcessLoopbackError as error:
                self._startup_error = error
                self._ready.set()
                return
            ok, init_detail = _initialize_loopback_client(client, fmt_buf)
            if not ok:
                self._startup_error = ProcessLoopbackError("initialize", init_detail)
                self._ready.set()
                return

            get_service = _com_method(
                client, 14,
                ctypes.WINFUNCTYPE(HRESULT, ctypes.c_void_p, ctypes.POINTER(GUID), ctypes.POINTER(ctypes.c_void_p)),
            )
            iid_capture = guid_from_str(IID_IAUDIO_CAPTURE_CLIENT)
            capture = ctypes.c_void_p()
            hr = get_service(client.value, ctypes.byref(iid_capture), ctypes.byref(capture))
            if hr != 0:
                self._startup_error = ProcessLoopbackError("get-service", f"hr={_hr_hex(hr)}")
                self._ready.set()
                return

            start = _com_method(client, 10, ctypes.WINFUNCTYPE(HRESULT, ctypes.c_void_p))
            stop = _com_method(client, 11, ctypes.WINFUNCTYPE(HRESULT, ctypes.c_void_p))
            hr = start(client.value)
            if hr != 0:
                self._startup_error = ProcessLoopbackError("start", f"hr={_hr_hex(hr)}")
                self._ready.set()
                return
            self.running = True
            self._ready.set()

            get_buffer = _com_method(
                capture, 3,
                ctypes.WINFUNCTYPE(
                    HRESULT, ctypes.c_void_p, ctypes.POINTER(ctypes.c_void_p),
                    ctypes.POINTER(UINT), ctypes.POINTER(DWORD),
                    ctypes.POINTER(ULONGLONG), ctypes.POINTER(ULONGLONG),
                ),
            )
            release_buffer = _com_method(capture, 4, ctypes.WINFUNCTYPE(HRESULT, ctypes.c_void_p, UINT))
            get_next_packet = _com_method(
                capture, 5, ctypes.WINFUNCTYPE(HRESULT, ctypes.c_void_p, ctypes.POINTER(UINT))
            )
            block_align = self.format.block_align
            while not self._stop_event.is_set():
                if self._target_alive is not None and not self._target_alive():
                    self._set_failure(ProcessLoopbackError("process_exited", "target process has exited"))
                    break
                num_frames = UINT()
                hr = get_next_packet(capture.value, ctypes.byref(num_frames))
                if hr != 0:
                    self._set_failure(
                        ProcessLoopbackError(
                            "get-next-packet",
                            f"hr={_hr_hex(hr)}"
                            + (" (device invalidated)" if (hr & 0xFFFFFFFF) == AUDCLNT_E_DEVICE_INVALIDATED else ""),
                        )
                    )
                    break
                if num_frames.value == 0:
                    self._stop_event.wait(self.poll_interval_s)
                    continue
                data = ctypes.c_void_p()
                flags = DWORD()
                dev_pos = ULONGLONG()
                qpc_pos = ULONGLONG()
                hr = get_buffer(
                    capture.value, ctypes.byref(data), ctypes.byref(num_frames),
                    ctypes.byref(flags), ctypes.byref(dev_pos), ctypes.byref(qpc_pos),
                )
                if hr != 0:
                    self._set_failure(
                        ProcessLoopbackError(
                            "get-buffer",
                            f"hr={_hr_hex(hr)}"
                            + (" (device invalidated)" if (hr & 0xFFFFFFFF) == AUDCLNT_E_DEVICE_INVALIDATED else ""),
                        )
                    )
                    break
                try:
                    nbytes = num_frames.value * block_align
                    silent = bool(flags.value & AUDCLNT_BUFFERFLAGS_SILENT)
                    if silent:
                        # Explicit capture silence: emit zeros, never treat as a gap.
                        raw = bytes(nbytes)
                    else:
                        raw = ctypes.string_at(data, nbytes)
                finally:
                    release_buffer(capture.value, num_frames.value)
                self.captured_frames += num_frames.value
                self._put_chunk(
                    ProcessLoopbackChunk(
                        data=raw,
                        captured_at_ms=time.monotonic() * 1000.0,
                        frame_count=num_frames.value,
                        silent=silent,
                        discontinuity=bool(flags.value & AUDCLNT_BUFFERFLAGS_DATA_DISCONTINUITY),
                    )
                )
            try:
                stop(client.value)
            except Exception:  # pragma: no cover - best effort teardown
                pass
        except ProcessLoopbackError as error:
            if self._ready.is_set():
                self._set_failure(error)
            else:
                self._startup_error = error
                self._ready.set()
        except Exception as exc:
            error = ProcessLoopbackError("read", f"{type(exc).__name__}: {exc}")
            if self._ready.is_set():
                self._set_failure(error)
            else:
                self._startup_error = error
                self._ready.set()
        finally:
            self.running = False
            _release_interface(capture)
            _release_interface(client)
            self._handler = None
            _co_uninitialize(ole32)
            with self._cond:
                self._cond.notify_all()

    def __enter__(self) -> "ProcessLoopbackCapture":
        self.start()
        return self

    def __exit__(self, *exc_info) -> None:
        self.stop()
